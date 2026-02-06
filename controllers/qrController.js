// backend/controllers/qrController.js
const speakeasy = require('speakeasy');
const db = require('../config/db');

// --- HELPER: TIME WINDOW LOGIC ---
// This function tells us WHAT meal it is right now and HOW MUCH it costs.

function getCurrentMealInfo() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // Convert time to "Minutes from Midnight" for easier comparison
    // e.g., 7:30 AM = (7 * 60) + 30 = 450 minutes
    const currentTimeInMinutes = (currentHour * 60) + currentMinute;

    // DEFINING THE RULES (You can change these times/prices)
    // Breakfast: 07:30 (450m) to 09:30 (570m) - ₹40
    if (currentTimeInMinutes >= 450 && currentTimeInMinutes <= 570) {
        return { type: 'BREAKFAST', price: 40.00 };
    }
    // Lunch: 12:30 (750m) to 14:30 (870m) - ₹60
    else if (currentTimeInMinutes >= 750 && currentTimeInMinutes <= 870) {
        return { type: 'LUNCH', price: 60.00 };
    }
    // Dinner: 19:30 (1170m) to 21:30 (1290m) - ₹60
    else if (currentTimeInMinutes >= 1170 && currentTimeInMinutes <= 1290) {
        return { type: 'DINNER', price: 60.00 };
    }
    
    return null; // Mess is Closed
}

// --- FEATURE 1: Generate QR (For Student App) ---
exports.getCurrentQR = (req, res) => {
    const student_id = req.params.student_id;

    db.query('SELECT secret_key FROM users WHERE student_id = ?', [student_id], (err, results) => {
        if (err) return res.status(500).json({ error: err });
        if (results.length === 0) return res.status(404).json({ message: 'Student not found' });

        const token = speakeasy.totp({
            secret: results[0].secret_key,
            encoding: 'base32',
            step: 30
        });

        res.json({ student_id, qr_token: token, valid_seconds: 30 });
    });
};

// --- FEATURE 2: The "Smart Scan" (For Staff Scanner) ---
exports.processMessEntry = (req, res) => {
    const { student_id, scanned_token } = req.body;

    // 1. CHECK IF MESS IS OPEN
    const mealInfo = getCurrentMealInfo();
    if (!mealInfo) {
        return res.status(400).json({ 
            status: 'DENIED', 
            message: 'Mess is currently CLOSED ',
            detail: 'Service hours: 7:30-9:30, 12:30-14:30, 19:30-21:30'
        });
    }

    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ error: 'DB Connection Error' });

        // 2. GET USER DATA (Secret Key)
        connection.query('SELECT secret_key FROM users WHERE student_id = ?', [student_id], (err, users) => {
            if (err || users.length === 0) {
                connection.release();
                return res.status(404).json({ status: 'ERROR', message: 'Invalid Student ID ❌' });
            }

            // 3. VERIFY TOTP (The Security Check)
            const valid = speakeasy.totp.verify({
                secret: users[0].secret_key,
                encoding: 'base32',
                token: scanned_token,
                window: 1, 
                step: 30
            });

            if (!valid) {
                connection.release();
                return res.status(401).json({ status: 'DENIED', message: 'QR Code Expired or Fake ⚠️' });
            }

            // 4. CHECK DOUBLE SPENDING (Did they already eat THIS meal today?)
            // We look for a 'MEAL' transaction for this student, today, for this specific meal type.
            const duplicateCheckSql = `
                SELECT * FROM transactions 
                WHERE wallet_id = (SELECT wallet_id FROM wallets WHERE student_id = ?) 
                AND meal_type = ? 
                AND DATE(timestamp) = CURDATE()
            `;

            connection.query(duplicateCheckSql, [student_id, mealInfo.type], (err, history) => {
                if (err) { connection.release(); return res.status(500).json({ error: err }); }

                if (history.length > 0) {
                    connection.release();
                    return res.status(403).json({ 
                        status: 'DENIED', 
                        message: `Already ate ${mealInfo.type} today! 🛑`,
                        detail: 'Double-scan detected.'
                    });
                }

                // 5. CHECK BALANCE
                connection.query('SELECT wallet_id, balance FROM wallets WHERE student_id = ?', [student_id], (err, wallet) => {
                    if (err || wallet.length === 0) { connection.release(); return res.status(500).json({ error: 'Wallet Error' }); }

                    const currentBalance = parseFloat(wallet[0].balance);
                    const cost = mealInfo.price;

                    if (currentBalance < cost) {
                        connection.release();
                        return res.status(402).json({ 
                            status: 'DENIED', 
                            message: 'Insufficient Balance 💸',
                            required: cost,
                            available: currentBalance
                        });
                    }

                    // 6. DEDUCT MONEY & LOG TRANSACTION (Atomic Transaction)
                    connection.beginTransaction(err => {
                        if (err) { connection.release(); return res.status(500).json({ error: err }); }

                        // A. Cut Money
                        connection.query('UPDATE wallets SET balance = balance - ? WHERE wallet_id = ?', [cost, wallet[0].wallet_id], (err) => {
                            if (err) { connection.rollback(() => connection.release()); return res.status(500).json({ error: err }); }

                            // B. Log Receipt
                            const logSql = 'INSERT INTO transactions (wallet_id, amount, transaction_type, meal_type, status) VALUES (?, ?, "MEAL", ?, "SUCCESS")';
                            connection.query(logSql, [wallet[0].wallet_id, -cost, mealInfo.type], (err) => {
                                if (err) { connection.rollback(() => connection.release()); return res.status(500).json({ error: err }); }

                                // C. Save Everything
                                connection.commit(err => {
                                    connection.release();
                                    if (err) return res.status(500).json({ error: err });

                                    // 7. SUCCESS RESPONSE
                                    res.json({
                                        status: 'APPROVED',
                                        message: `Entry Allowed: ${mealInfo.type} ✅`,
                                        deducted: cost,
                                        new_balance: currentBalance - cost
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
};