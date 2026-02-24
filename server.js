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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 SCA Kurir Auto-Submit running at http://localhost:${PORT}`);
});
