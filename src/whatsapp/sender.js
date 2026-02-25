/**
 * WhatsApp Cloud API (Meta Official) — Send messages
 * Uses Meta Graph API to reply to incoming WhatsApp messages
 */

const WA_API_URL = 'https://graph.facebook.com/v22.0';

/**
 * Send a text message via WhatsApp Cloud API
 * @param {string} to - Recipient phone number (with country code, e.g. 6281234567890)
 * @param {string} text - Message text to send
 */
async function sendTextMessage(to, text) {
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    const accessToken = process.env.WA_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
        console.error('❌ WA_PHONE_NUMBER_ID atau WA_ACCESS_TOKEN belum di-set di .env');
        return null;
    }

    try {
        const response = await fetch(`${WA_API_URL}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: 'text',
                text: { body: text }
            })
        });

        const data = await response.json();

        // Log full response for debugging
        console.log(`📤 WA API Response [${response.status}]:`, JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error('❌ WA Send Error:', JSON.stringify(data));
            return null;
        }

        console.log(`✅ WA reply sent to ${to}`);
        return data;
    } catch (error) {
        console.error('❌ WA Send Error:', error.message);
        return null;
    }
}

/**
 * Mark a message as "read" (double blue check)
 * @param {string} messageId - Message ID to mark as read
 */
async function markAsRead(messageId) {
    const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
    const accessToken = process.env.WA_ACCESS_TOKEN;
    if (!phoneNumberId || !accessToken) return null;

    try {
        await fetch(`${WA_API_URL}/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                status: 'read',
                message_id: messageId
            })
        });
    } catch (error) {
        console.error('❌ Mark read error:', error.message);
    }
}

module.exports = { sendTextMessage, markAsRead };
