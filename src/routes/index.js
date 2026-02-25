const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const store = require('../db/store');
const { readMasterExcel } = require('../excel/reader');
const { generateCourierExcel, generateDescription } = require('../excel/generator');
const { submitToPowerApps } = require('../puppeteer/powerApps');

const router = express.Router();

// Multer config for file uploads
const upload = multer({
    dest: path.join(__dirname, '../../uploads/'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file Excel (.xlsx, .xls) yang diperbolehkan'));
        }
    }
});

// ============================================
// GET / — Main page
// ============================================
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// ============================================
// GET /api/status — Get master data status
// ============================================
router.get('/api/status', (req, res) => {
    res.json({
        masterCount: store.getMasterCount(),
        history: store.getHistory().slice(0, 20)
    });
});

// ============================================
// GET /api/wa-status — WhatsApp Bot status
// ============================================
router.get('/api/wa-status', (req, res) => {
    const enabled = process.env.WA_ENABLED === 'true';
    const hasToken = !!process.env.WA_ACCESS_TOKEN;
    const hasPhoneId = !!process.env.WA_PHONE_NUMBER_ID;
    const keyword = process.env.WA_KEYWORD || 'SCA';
    const autoSubmit = process.env.WA_AUTO_SUBMIT === 'true';

    res.json({
        enabled,
        configured: enabled && hasToken && hasPhoneId,
        provider: 'meta-cloud-api',
        keyword,
        autoSubmit,
        allowedNumbers: process.env.WA_ALLOWED_NUMBERS
            ? process.env.WA_ALLOWED_NUMBERS.split(',').length
            : 0,
    });
});

// ============================================
// POST /api/upload-master — Upload master Excel
// ============================================
router.post('/api/upload-master', upload.single('excel'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'File Excel harus diupload' });
        }

        const couriers = await readMasterExcel(req.file.path);

        if (couriers.length === 0) {
            return res.status(400).json({ error: 'Tidak ada data kurir ditemukan di Excel' });
        }

        store.setMasterData(couriers);

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            count: couriers.length,
            message: `${couriers.length} data kurir berhasil di-import`
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /api/clear-master — Clear all master data
// ============================================
router.post('/api/clear-master', (req, res) => {
    store.clearMasterData();
    res.json({ success: true, message: 'Semua data master dihapus' });
});

// ============================================
// POST /api/lookup — Lookup courier IDs
// ============================================
router.post('/api/lookup', (req, res) => {
    try {
        const { courierIds } = req.body;

        if (!courierIds || !courierIds.trim()) {
            return res.status(400).json({ error: 'Courier IDs harus diisi' });
        }

        // Parse courier IDs (support comma, space, newline, semicolon separated)
        const ids = courierIds
            .split(/[,\s;]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);

        if (ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada courier ID valid' });
        }

        const result = store.lookup(ids);
        const description = generateDescription(result.found, result.notFound);

        res.json({
            found: result.found,
            notFound: result.notFound,
            description,
            totalInput: ids.length,
            totalFound: result.found.length,
            totalNotFound: result.notFound.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /api/export — Generate & download Excel
// ============================================
router.post('/api/export', async (req, res) => {
    try {
        const { courierIds } = req.body;
        const ids = courierIds
            .split(/[,\s;]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);

        const { found } = store.lookup(ids);

        if (found.length === 0) {
            return res.status(400).json({ error: 'Tidak ada data kurir ditemukan' });
        }

        const { filepath, filename } = await generateCourierExcel(found);

        res.download(filepath, filename, (err) => {
            if (err) console.error('Download error:', err);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// POST /api/submit — Submit to Power Apps via Puppeteer
// ============================================

// Store active SSE connections for live logs
const activeConnections = new Map();

router.get('/api/logs/:sessionId', (req, res) => {
    const { sessionId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    activeConnections.set(sessionId, res);

    req.on('close', () => {
        activeConnections.delete(sessionId);
    });
});

router.post('/api/submit', async (req, res) => {
    try {
        const { courierIds, sessionId } = req.body;

        if (!courierIds || !courierIds.trim()) {
            return res.status(400).json({ error: 'Courier IDs harus diisi' });
        }

        const ids = courierIds
            .split(/[,\s;]+/)
            .map(id => id.trim())
            .filter(id => id.length > 0);

        const { found, notFound } = store.lookup(ids);

        if (found.length === 0) {
            return res.status(400).json({ error: 'Tidak ada data kurir ditemukan' });
        }

        // Generate Excel attachment
        const { filepath: excelPath, filename: excelFilename } = await generateCourierExcel(found);

        // Generate description
        const description = generateDescription(found, notFound);

        // Send initial response
        res.json({
            success: true,
            message: 'Proses Puppeteer dimulai. Lihat log di atas.',
            excelFile: excelFilename,
            found: found.length,
            notFound: notFound.length
        });

        // Run Puppeteer in background
        const sseConnection = activeConnections.get(sessionId);
        const sendLog = (msg) => {
            if (sseConnection) {
                sseConnection.write(`data: ${JSON.stringify({ log: msg })}\n\n`);
            }
        };

        const result = await submitToPowerApps({
            description,
            excelPath,
            onLog: sendLog
        });

        // Save to history
        store.addHistory({
            courierIds: ids,
            found: found.length,
            notFound: notFound.length,
            success: result.success,
            message: result.message
        });

        // Send completion event
        if (sseConnection) {
            sseConnection.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
