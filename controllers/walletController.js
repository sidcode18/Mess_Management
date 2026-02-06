// backend/controllers/walletController.js
const mysql = require('mysql2');
require('dotenv').config();

const db = require('../config/db'); 

// FEATURE 1: Get Wallet Balance
exports.getBalance = (req, res) => {
    const student_id = req.params.student_id;

    const sql = `SELECT w.balance, u.full_name 
                 FROM wallets w 
                 JOIN users u ON w.student_id = u.student_id 
                 WHERE w.student_id = ?`;

    db.query(sql, [student_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length === 0) {
            return res.status(404).json({ message: 'Student or Wallet not found' });
        }

        res.json({ 
            student_id: student_id,
            name: results[0].full_name,
            balance: results[0].balance 
        });
    });
};

// FEATURE 2: Add Money (Recharge)
exports.rechargeWallet = (req, res) => {
    const { student_id, amount } = req.body; // Data sent from the App

    // 1. Validation
    if (!student_id || !amount || amount <= 0) {
        return res.status(400).json({ message: 'Invalid data' });
    }

    // 2. Database Transaction (To ensure safety)
    db.getConnection((err, connection) => {
        if (err) return res.status(500).json({ error: 'DB Connection error' });

        connection.beginTransaction(err => {
            if (err) { connection.release(); return res.status(500).json({ error: err }); }

            // Step A: Update the Wallet Balance
            const updateSql = 'UPDATE wallets SET balance = balance + ? WHERE student_id = ?';
            connection.query(updateSql, [amount, student_id], (err, result) => {
                if (err) {
                    return connection.rollback(() => { connection.release(); res.status(500).json({ error: err }); });
                }

                // Step B: Log the Transaction
                const logSql = 'INSERT INTO transactions (wallet_id, amount, transaction_type, status) VALUES ((SELECT wallet_id FROM wallets WHERE student_id = ?), ?, "RECHARGE", "SUCCESS")';
                connection.query(logSql, [student_id, amount], (err, result) => {
                    if (err) {
                        return connection.rollback(() => { connection.release(); res.status(500).json({ error: err }); });
                    }

                    // Step C: Commit (Save) everything
                    connection.commit(err => {
                        if (err) {
                            return connection.rollback(() => { connection.release(); res.status(500).json({ error: err }); });
                        }
                        connection.release();
                        res.json({ message: 'Recharge Successful!', added_amount: amount });
                    });
                });
            });
        });
    });
};