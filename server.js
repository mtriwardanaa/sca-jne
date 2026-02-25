require('dotenv').config();
const express = require('express');
const path = require('path');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/', routes);

// WhatsApp Cloud API Webhook
if (process.env.WA_ENABLED === 'true') {
    const waWebhook = require('./src/whatsapp/webhook');
    app.use('/webhook', waWebhook);
    console.log('📱 WhatsApp Bot aktif — webhook endpoint: /webhook');
} else {
    console.log('📱 WhatsApp Bot tidak aktif (WA_ENABLED != true)');
}

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SCA Kurir Auto-Submit running at http://localhost:${PORT}`);
});
