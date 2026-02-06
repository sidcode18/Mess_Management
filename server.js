// backend/server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db'); // Import the DB connection to test it

const app = express();
app.use(express.json()); // Allows server to read JSON data
app.use(cors()); 

// Test DB Connection on Start
db.getConnection((err, connection) => {
    if (err) console.error('DB Error:', err.message);
    else {
        console.log('Connected to MySQL Database!');
        connection.release();
    }
});

// --- IMPORT ROUTES ---
const walletRoutes = require('./routes/walletRoutes');
const qrRoutes = require('./routes/qrRoutes');
app.use('/api/wallet', walletRoutes);
app.use('/api/qr', qrRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});