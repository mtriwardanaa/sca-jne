/**
 * Puppeteer helper utilities
 */

/**
 * Wait for a selector with timeout and retry
 */
async function waitAndClick(page, selector, options = {}) {
    const { timeout = 30000, delay = 500 } = options;
    await page.waitForSelector(selector, { visible: true, timeout });
    if (delay) await page.waitForTimeout(delay);
    await page.click(selector);
}

/**
 * Type text into an input field (clear first)
 */
async function clearAndType(page, selector, text, options = {}) {
    const { timeout = 30000, delay = 100 } = options;
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector, { clickCount: 3 }); // Select all
    await page.keyboard.press('Backspace');
    await page.type(selector, text, { delay });
}

/**
 * Take a screenshot with timestamp
 */
async function takeScreenshot(page, name) {
    const path = require('path');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${name}_${timestamp}.png`;
    const filepath = path.join(__dirname, '../../screenshots', filename);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot saved: ${filename}`);
    return { filepath, filename };
}

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Log with timestamp
 */
function log(message) {
    const time = new Date().toLocaleTimeString('id-ID');
    console.log(`[${time}] ${message}`);
    return `[${time}] ${message}`;
}

module.exports = { waitAndClick, clearAndType, takeScreenshot, sleep, log };
