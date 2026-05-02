const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, 'logs.txt');

const logger = {
    info: (message, meta = {}) => {
        const logEntry = JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', message, ...meta }) + '\n';
        fs.appendFileSync(logFilePath, logEntry);
    },
    error: (message, meta = {}) => {
        const logEntry = JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', message, ...meta }) + '\n';
        fs.appendFileSync(logFilePath, logEntry);
    }
};

const loggingMiddleware = (req, res, next) => {
    logger.info(`Incoming request: ${req.method} ${req.url}`);
    next();
};

module.exports = { logger, loggingMiddleware };
