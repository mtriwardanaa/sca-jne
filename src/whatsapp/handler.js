/**
 * WhatsApp Message Handler
 * Parses incoming WA messages, looks up courier IDs, and triggers SCA process
 * Works with any WA API provider (kirimi.id, Meta Cloud API, etc.)
 */

const store = require('../db/store');
const { generateCourierExcel, generateDescription } = require('../excel/generator');
const { submitToPowerApps } = require('../puppeteer/powerApps');
const { sendTextMessage } = require('./sender');

// Track active submissions to prevent duplicate processing
const activeSubmissions = new Set();

/**
 * Check if a phone number is allowed to send commands
 */
function isAllowedNumber(phoneNumber) {
    const allowedNumbers = process.env.WA_ALLOWED_NUMBERS;
    if (!allowedNumbers || allowedNumbers.trim() === '') {
        return true; // No whitelist = allow all
    }
    const allowed = allowedNumbers.split(',').map(n => n.trim());
    return allowed.includes(phoneNumber);
}

/**
 * Parse courier IDs from message text
 * Supports formats:
 *   - "SCA PNK001 PNK002 PNK003"
 *   - "SCA PNK001, PNK002, PNK003"
 *   - "PNK001 PNK002" (if WA_KEYWORD is empty)
 */
function parseCourierIds(text) {
    const keyword = (process.env.WA_KEYWORD || 'SCA').toUpperCase();
    let content = text.trim();

    // Remove keyword prefix if present
    if (keyword && content.toUpperCase().startsWith(keyword)) {
        content = content.substring(keyword.length).trim();
    } else if (keyword) {
        // Keyword is set but message doesn't start with it — ignore
        return null;
    }

    if (!content) return [];

    // Split by comma, space, newline, semicolon
    const ids = content
        .split(/[,\s;]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0);

    return ids;
}

/**
 * Handle an incoming WhatsApp text message
 * @param {string} from - Sender phone number
 * @param {string} text - Message body
 * @param {string} messageId - Message ID (optional, for logging)
 */
async function handleIncomingMessage(from, text, messageId) {
    console.log(`📩 WA dari ${from}: "${text}"`);

    // Check whitelist
    if (!isAllowedNumber(from)) {
        console.log(`⛔ Nomor ${from} tidak di whitelist, diabaikan`);
        return;
    }

    // Handle help command
    if (text.trim().toUpperCase() === 'HELP' || text.trim() === '?') {
        const keyword = process.env.WA_KEYWORD || 'SCA';
        await sendTextMessage(from,
            `🤖 *SCA Kurir Bot*\n\n` +
            `Kirim courier ID untuk proses SCA:\n` +
            `${keyword} PNK001 PNK002 PNK003\n\n` +
            `Perintah lain:\n` +
            `• *STATUS* — Cek jumlah master data\n` +
            `• *HELP* — Tampilkan bantuan ini`
        );
        return;
    }

    // Handle status command
    if (text.trim().toUpperCase() === 'STATUS') {
        const count = store.getMasterCount();
        const history = store.getHistory().slice(0, 5);
        let msg = `📊 *Status SCA Bot*\n\n` +
            `Master data: *${count}* kurir\n`;

        if (history.length > 0) {
            msg += `\n📋 Riwayat terakhir:\n`;
            history.forEach(h => {
                const date = new Date(h.timestamp);
                const timeStr = date.toLocaleDateString('id-ID', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                });
                const icon = h.success ? '✅' : '❌';
                msg += `${icon} ${timeStr} — ${h.found} kurir\n`;
            });
        }

        await sendTextMessage(from, msg);
        return;
    }

    // Parse courier IDs
    const courierIds = parseCourierIds(text);

    // Null = keyword not matched (not an SCA command)
    if (courierIds === null) {
        return; // Silently ignore non-command messages
    }

    // Empty = keyword matched but no IDs
    if (courierIds.length === 0) {
        const keyword = process.env.WA_KEYWORD || 'SCA';
        await sendTextMessage(from,
            `⚠️ Format salah. Contoh:\n${keyword} PNK001 PNK002 PNK003`
        );
        return;
    }

    // Prevent duplicate processing
    const submissionKey = courierIds.sort().join(',');
    if (activeSubmissions.has(submissionKey)) {
        await sendTextMessage(from, '⏳ Proses SCA untuk ID ini sedang berjalan. Tunggu sebentar...');
        return;
    }

    // Acknowledge receipt
    await sendTextMessage(from, `⏳ Memproses ${courierIds.length} courier ID...`);

    // Lookup courier IDs
    const { found, notFound } = store.lookup(courierIds);

    if (found.length === 0) {
        await sendTextMessage(from,
            `❌ Tidak ada kurir ditemukan.\n\n` +
            `ID yang dicari: ${courierIds.join(', ')}\n\n` +
            `Pastikan data master sudah di-upload via dashboard.`
        );
        return;
    }

    // Build lookup result message
    let resultMsg = `🔍 *Hasil Lookup*\n\n`;
    resultMsg += `✅ Ditemukan: *${found.length}*\n`;
    if (notFound.length > 0) {
        resultMsg += `❌ Tidak ditemukan: *${notFound.length}*\n`;
    }
    resultMsg += `\n📋 Kurir:\n`;
    found.forEach((c, i) => {
        resultMsg += `${i + 1}. ${c.courier_id} — ${c.courier_name}\n`;
    });
    if (notFound.length > 0) {
        resultMsg += `\n❌ Tidak ditemukan:\n${notFound.join(', ')}`;
    }

    const autoSubmit = process.env.WA_AUTO_SUBMIT === 'true';

    if (!autoSubmit) {
        // Lookup only mode
        resultMsg += `\n\n💡 Auto-submit dinonaktifkan. Submit manual via dashboard.`;
        await sendTextMessage(from, resultMsg);
        return;
    }

    // Auto-submit mode
    resultMsg += `\n\n🚀 Memulai proses submit ke Power Apps...`;
    await sendTextMessage(from, resultMsg);

    // Start SCA submission
    activeSubmissions.add(submissionKey);

    try {
        // Generate Excel
        const { filepath: excelPath } = await generateCourierExcel(found);
        const description = generateDescription(found, notFound);

        // Submit to Power Apps
        const result = await submitToPowerApps({
            description,
            excelPath,
            onLog: (msg) => console.log(`[WA-SCA] ${msg}`)
        });

        // Save history
        store.addHistory({
            courierIds,
            found: found.length,
            notFound: notFound.length,
            success: result.success,
            message: result.message,
            source: 'whatsapp'
        });

        // Notify sender
        if (result.success) {
            await sendTextMessage(from,
                `✅ *SCA Berhasil!*\n\n` +
                `${found.length} kurir telah diproses.\n` +
                `Form Power Apps sudah terisi.\n\n` +
                `⚠️ Silakan review dan klik Submit manual di browser.`
            );
        } else {
            await sendTextMessage(from,
                `❌ *SCA Gagal*\n\n` +
                `Error: ${result.message}\n\n` +
                `Coba lagi atau submit manual via dashboard.`
            );
        }
    } catch (error) {
        console.error('❌ WA SCA Error:', error.message);
        await sendTextMessage(from,
            `❌ Error: ${error.message}\n\nCoba lagi nanti.`
        );
    } finally {
        activeSubmissions.delete(submissionKey);
    }
}

module.exports = { handleIncomingMessage, parseCourierIds, isAllowedNumber };
