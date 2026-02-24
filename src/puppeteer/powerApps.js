const puppeteer = require('puppeteer');
const path = require('path');
const { takeScreenshot, sleep, log } = require('./helpers');

/**
 * Get the Power Apps canvas iframe (named "fullscreen-app-host")
 */
async function getCanvasFrame(page, emit, timeoutMs = 90000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const frames = page.frames();
        for (const frame of frames) {
            try {
                // The Power Apps canvas iframe is named "fullscreen-app-host"
                if (frame.name() === 'fullscreen-app-host') {
                    // Wait until the canvas has rendered interactive elements
                    const hasControls = await frame.$('[data-control-name]');
                    if (hasControls) {
                        emit('✅ Power Apps canvas frame ditemukan');
                        return frame;
                    }
                }
            } catch {
                // Frame not ready yet
            }
        }

        await sleep(2000);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        if (elapsed % 10 === 0) {
            emit(`⏳ Menunggu canvas render... (${elapsed}s)`);
        }
    }

    emit('⚠️ Timeout menunggu canvas frame');
    return null;
}

/**
 * Submit ticket to Power Apps automatically
 */
async function submitToPowerApps({ description, excelPath, onLog }) {
    const emit = (msg) => {
        const logMsg = log(msg);
        if (onLog) onLog(logMsg);
    };

    const headless = process.env.HEADLESS === 'true';
    let browser;

    try {
        emit('🚀 Membuka browser...');
        browser = await puppeteer.launch({
            headless: headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--window-size=1366,768'
            ],
            defaultViewport: { width: 1366, height: 768 }
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(60000);

        // ============================================
        // Step 1: Navigate to Power Apps
        // ============================================
        emit('🌐 Membuka Power Apps...');
        await page.goto(process.env.POWERAPPS_URL, {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(3000);

        // ============================================
        // Step 2: Microsoft Login (if needed)
        // ============================================
        const currentUrl = page.url();
        if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('login.live.com')) {
            emit('🔑 Login Microsoft...');

            await page.waitForSelector('input[type="email"]', { visible: true, timeout: 30000 });
            await page.type('input[type="email"]', process.env.MICROSOFT_EMAIL, { delay: 50 });
            await sleep(500);
            await page.click('input[type="submit"]');
            await sleep(3000);

            await page.waitForSelector('input[type="password"]', { visible: true, timeout: 30000 });
            await page.type('input[type="password"]', process.env.MICROSOFT_PASSWORD, { delay: 50 });
            await sleep(500);
            await page.click('input[type="submit"]');
            await sleep(3000);

            // "Stay signed in?" - Click Yes
            try {
                await page.waitForSelector('input[type="submit"]', { visible: true, timeout: 10000 });
                await page.click('input[type="submit"]');
                emit('✅ Login berhasil');
            } catch {
                emit('ℹ️ Tidak ada prompt "Stay signed in"');
            }
            await sleep(5000);
        } else {
            emit('✅ Sudah login (session aktif)');
        }

        // ============================================
        // Step 3: Wait for Power Apps canvas frame
        // ============================================
        emit('⏳ Menunggu Power Apps canvas load (bisa 30-90 detik)...');
        const canvas = await getCanvasFrame(page, emit, 90000);

        if (!canvas) {
            emit('❌ Canvas frame tidak ditemukan. Cek screenshot.');
            await takeScreenshot(page, 'canvas_not_found');
            return { success: false, message: 'Canvas frame tidak ditemukan' };
        }

        const loadScreenshot = await takeScreenshot(page, 'powerapps_loaded');
        emit(`📸 Screenshot: ${loadScreenshot.filename}`);

        // ============================================
        // Step 3b: ICT Help Desk Sign In
        // Fill "Nama lengkap" (txtLogin) and click "Start" (btnStart)
        // ============================================
        emit('📋 Mengisi halaman Sign In ICT Help Desk...');

        // Wait for the specific input to be visible
        const signerName = process.env.SIGNER_NAME || process.env.MICROSOFT_EMAIL;

        try {
            // Wait for the txtLogin input to appear
            await canvas.waitForSelector('[data-control-name="txtLogin"] input', { visible: true, timeout: 30000 });
            const nameInput = await canvas.$('[data-control-name="txtLogin"] input');

            if (nameInput) {
                await nameInput.click();
                await sleep(300);
                // Clear first
                await nameInput.evaluate(el => el.value = '');
                await nameInput.type(signerName, { delay: 30 });
                emit(`✅ Nama lengkap terisi: "${signerName}"`);
            } else {
                emit('⚠️ Input txtLogin tidak ditemukan');
            }
        } catch (err) {
            emit('⚠️ Isi nama gagal: ' + err.message);

            // Fallback: try placeholder selector
            try {
                const fallbackInput = await canvas.$('input[placeholder="Nama lengkap"]');
                if (fallbackInput) {
                    await fallbackInput.click();
                    await sleep(300);
                    await fallbackInput.type(signerName, { delay: 30 });
                    emit('✅ Nama lengkap terisi (fallback)');
                }
            } catch (err2) {
                emit('❌ Fallback juga gagal: ' + err2.message);
            }
        }

        await sleep(1000);

        // Click Start button (btnStart)
        emit('🔘 Klik tombol Start...');
        try {
            await canvas.waitForSelector('[data-control-name="btnStart"] button', { visible: true, timeout: 10000 });
            const startBtn = await canvas.$('[data-control-name="btnStart"] button');

            if (startBtn) {
                await startBtn.click();
                emit('✅ Tombol Start diklik');
            } else {
                emit('⚠️ Button btnStart tidak ditemukan');
            }
        } catch (err) {
            emit('⚠️ Klik Start gagal: ' + err.message);

            // Fallback: find button with text "Start"
            try {
                const buttons = await canvas.$$('button');
                for (const btn of buttons) {
                    const text = await canvas.evaluate(el => (el.textContent || '').trim(), btn);
                    if (text === 'Start') {
                        await btn.click();
                        emit('✅ Tombol Start diklik (fallback)');
                        break;
                    }
                }
            } catch { }
        }

        // ============================================
        // Step 4: Wait for HOME page after Start
        // ============================================
        emit('⏳ Menunggu halaman HOME...');

        // Wait for HOME page to render — look for "Open Ticket" or "My Ticket" text
        for (let i = 0; i < 15; i++) {
            await sleep(2000);
            try {
                const pageText = await canvas.evaluate(() => document.body.innerText || '');
                if (pageText.includes('Open Ticket') || pageText.includes('My Ticket') || pageText.includes('Welcome')) {
                    emit('✅ Halaman HOME loaded');
                    break;
                }
            } catch { }
            if ((i + 1) % 5 === 0) emit(`⏳ Masih menunggu HOME... (${(i + 1) * 2}s)`);
        }

        const afterStart = await takeScreenshot(page, 'after_start');
        emit(`📸 Setelah Start: ${afterStart.filename}`);

        // Debug: list data-control-names on HOME page
        try {
            const controlNames = await canvas.$$eval('[data-control-name]', els =>
                els.filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }).map(el => el.getAttribute('data-control-name'))
            );
            emit(`ℹ️ Controls visible: ${controlNames.join(', ')}`);
        } catch { }

        // Click "Open Ticket" — the button is data-control-name="ButtonMenus"
        // (it's an invisible overlay button on the Open Ticket card — has no text)
        emit('📋 Klik Open Ticket...');
        let openTicketClicked = false;

        try {
            await canvas.waitForSelector('[data-control-name="ButtonMenus"]', { visible: true, timeout: 15000 });
            const openTicketBtn = await canvas.$('[data-control-name="ButtonMenus"]');
            if (openTicketBtn) {
                await openTicketBtn.click();
                openTicketClicked = true;
                emit('✅ Klik ButtonMenus → Open Ticket');
            }
        } catch (err) {
            emit('⚠️ ButtonMenus tidak ditemukan: ' + err.message);
        }

        // Fallback: click on the ContainerOpenTicketMenu
        if (!openTicketClicked) {
            try {
                const container = await canvas.$('[data-control-name="ContainerOpenTicketMenu"]');
                if (container) {
                    await container.click();
                    openTicketClicked = true;
                    emit('✅ Klik ContainerOpenTicketMenu → Open Ticket');
                }
            } catch { }
        }

        if (!openTicketClicked) {
            emit('❌ Open Ticket tidak ditemukan!');
            await takeScreenshot(page, 'open_ticket_not_found');
        }

        // Wait for ticket form to load
        emit('⏳ Menunggu form ticket load...');
        await sleep(8000);

        // Take screenshot of what we see now
        const ticketScreenshot = await takeScreenshot(page, 'ticket_form');
        emit(`📸 Halaman ticket: ${ticketScreenshot.filename}`);


        // ============================================
        // Step 5: Fill the Request Form
        // ============================================
        emit('📝 Mengisi Request Form...');

        // Wait for form to be fully rendered
        try {
            await canvas.waitForSelector('[data-control-name="txtDescription"]', { visible: true, timeout: 15000 });
            emit('✅ Form ticket terdeteksi');
        } catch {
            emit('⚠️ Form belum terdeteksi, lanjut coba isi...');
        }

        // --- 5a: Set Category dropdown (native <select>) ---
        const categoryValue = process.env.CATEGORY;
        if (categoryValue) {
            emit(`📝 Mengisi Category: "${categoryValue}"...`);
            try {
                const categorySelect = await canvas.$('select[aria-label="DropdownCategory"]');
                if (categorySelect) {
                    // First, find the option value that matches the target text
                    const matchedValue = await canvas.evaluate((sel, targetText) => {
                        const options = Array.from(sel.options);
                        // Exact match
                        let match = options.find(o => o.text.trim() === targetText);
                        if (!match) {
                            // Partial match
                            match = options.find(o => o.text.toLowerCase().includes(targetText.toLowerCase()));
                        }
                        return match ? match.value : null;
                    }, categorySelect, categoryValue);

                    if (matchedValue) {
                        // Click to focus the select first
                        await categorySelect.click();
                        await sleep(500);

                        // Use Puppeteer's select() which properly triggers events
                        await categorySelect.select(matchedValue);
                        await sleep(500);

                        // Also click outside to close/confirm
                        await canvas.click('[data-control-name="TextCategoryForm"]');
                        await sleep(500);

                        emit(`✅ Category: "${categoryValue}"`);
                    } else {
                        const options = await canvas.evaluate(sel =>
                            Array.from(sel.options).map(o => `"${o.text.trim()}" (val=${o.value})`),
                            categorySelect
                        );
                        emit(`⚠️ Category "${categoryValue}" tidak ditemukan.`);
                        emit(`ℹ️ Opsi tersedia: ${options.join(', ')}`);
                    }
                } else {
                    emit('⚠️ Select DropdownCategory tidak ditemukan');
                }
            } catch (err) {
                emit('⚠️ Category gagal: ' + err.message);
            }
            await sleep(1000);
        }

        // --- 5b: Fill Description textarea ---
        emit('📝 Mengisi Description...');
        let descriptionFilled = false;

        try {
            // Exact selector: textarea inside txtDescription control
            const descTextarea = await canvas.$('[data-control-name="txtDescription"] textarea');
            if (descTextarea) {
                await descTextarea.click();
                await sleep(500);
                // Clear any existing text
                await descTextarea.evaluate(el => {
                    el.value = '';
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                });
                await sleep(200);
                await descTextarea.type(description, { delay: 3 });
                descriptionFilled = true;
                emit('✅ Description terisi');
            } else {
                emit('⚠️ Textarea txtDescription tidak ditemukan');
            }
        } catch (err) {
            emit('⚠️ Description error: ' + err.message);
        }

        // Fallback: find by aria-label and placeholder
        if (!descriptionFilled) {
            try {
                const fallback = await canvas.$('textarea[placeholder="Request..."]');
                if (fallback) {
                    await fallback.click();
                    await sleep(500);
                    await fallback.type(description, { delay: 3 });
                    descriptionFilled = true;
                    emit('✅ Description terisi (fallback placeholder)');
                }
            } catch (err) {
                emit('⚠️ Description fallback error: ' + err.message);
            }
        }

        if (!descriptionFilled) {
            emit('❌ Description gagal diisi. Isi manual.');
        }

        await sleep(2000);

        // --- 5c: Attach Excel file ---
        emit('📎 Attach file Excel...');

        try {
            // Exact selector from debug
            let fileInput = await canvas.$('input[aria-label="Attach file. AttachmentForm"]');
            if (!fileInput) {
                fileInput = await canvas.$('input[type="file"]');
            }
            if (!fileInput) {
                fileInput = await page.$('input[type="file"]');
            }

            if (fileInput) {
                await fileInput.uploadFile(excelPath);
                emit('✅ File Excel ter-attach');
                await sleep(3000);
            } else {
                emit('⚠️ Input file tidak ditemukan. Attach manual.');
                emit(`📄 File path: ${excelPath}`);
            }
        } catch (err) {
            emit('⚠️ Attach file gagal: ' + err.message);
            emit(`📄 File path: ${excelPath}`);
        }

        // ============================================
        // Step 6: Final screenshot
        // ============================================
        await sleep(2000);
        const beforeSubmit = await takeScreenshot(page, 'before_submit');
        emit(`📸 Screenshot sebelum submit: ${beforeSubmit.filename}`);

        // ============================================
        // Step 7: Submit (DISABLED - safety)
        // ============================================
        emit('⚠️ AUTO-SUBMIT DINONAKTIFKAN untuk keamanan.');
        emit('💡 Form sudah terisi. Silakan review dan klik Submit manual.');

        if (!headless) {
            emit('🖥️ Browser tetap terbuka untuk review.');
            await new Promise(resolve => {
                browser.on('disconnected', resolve);
                setTimeout(() => resolve(), 600000);
            });
        }

        return {
            success: true,
            screenshots: [loadScreenshot.filename, afterStart.filename, beforeSubmit.filename],
            message: 'Form berhasil diisi. Silakan review dan submit manual.'
        };

    } catch (error) {
        emit(`❌ Error: ${error.message}`);
        try {
            if (browser) {
                const pages = await browser.pages();
                if (pages.length > 0) await takeScreenshot(pages[0], 'error');
            }
        } catch { }
        return { success: false, message: error.message };
    } finally {
        if (browser && headless) {
            await browser.close();
        }
    }
}

module.exports = { submitToPowerApps };
