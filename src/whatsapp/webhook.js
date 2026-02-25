/**
 * WhatsApp Cloud API Webhook Routes (Meta Official)
 * - GET  /webhook — Verification (Meta sends a challenge to confirm endpoint)
 * - POST /webhook — Receive incoming message notifications
 */

const express = require('express');
const { handleIncomingMessage } = require('./handler');
const { markAsRead } = require('./sender');

const router = express.Router();

// ============================================
// GET /webhook — Webhook Verification
// Meta sends this when you register the webhook URL
// ============================================
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WA_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified by Meta');
        res.status(200).send(challenge);
    } else {
        console.warn('⚠️ Webhook verification failed. Token mismatch.');
        res.sendStatus(403);
    }
});

// ============================================
// POST /webhook — Receive Messages
// ============================================
router.post('/', async (req, res) => {
    // Always respond 200 immediately (Meta retries if no response within 20s)
    res.sendStatus(200);

    try {
        const body = req.body;

        if (body.object !== 'whatsapp_business_account') return;

        const entries = body.entry || [];

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== 'messages') continue;

                const value = change.value || {};
                const messages = value.messages || [];

                for (const message of messages) {
                    // Only handle text messages
                    if (message.type !== 'text') {
                        console.log(`ℹ️ Pesan non-text diabaikan (type: ${message.type})`);
                        continue;
                    }

                    const from = message.from;
                    const text = message.text?.body;
                    const msgId = message.id;

                    if (!from || !text) continue;

                    // Mark as read (blue check)
                    markAsRead(msgId).catch(() => { });

                    // Process asynchronously
                    handleIncomingMessage(from, text, msgId).catch(err => {
                        console.error('❌ Error handling WA message:', err.message);
                    });
                }
            }
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error.message);
    }
});

module.exports = router;
