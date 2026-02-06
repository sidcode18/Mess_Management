// backend/routes/qrRoutes.js
const express = require('express');
const router = express.Router();
const qrController = require('../controllers/qrController');

router.get('/generate/:student_id', qrController.getCurrentQR);

// The Main Scanner Endpoint
router.post('/scan', qrController.processMessEntry);

module.exports = router;