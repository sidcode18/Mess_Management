// backend/routes/walletRoutes.js
const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');

// Define the Endpoints
router.get('/balance/:student_id', walletController.getBalance);
router.post('/recharge', walletController.rechargeWallet);

module.exports = router;