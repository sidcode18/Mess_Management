const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-235ca55b-uniwallet26.j.aivencloud.com',      
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 19479,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;