const axios = require('axios');

const LOG_API_URL = process.env.LOG_API_URL || 'http://20.207.122.201/evaluation-service/logs';
const TOKEN = process.env.EVALUATION_TOKEN || '';

/**
 * Reusable Log function that makes an API call to the Test Server
 * @param {string} stack - 'backend' or 'frontend'
 * @param {string} level - 'debug', 'info', 'warn', 'error', 'fatal'
 * @param {string} pkg - 'service', 'middleware', 'controller', etc.
 * @param {string} message - The actual log message
 */
async function Log(stack, level, pkg, message) {
    const payload = {
        stack: stack,
        level: level,
        package: pkg,
        message: message
    };

    console.log(`[${level.toUpperCase()}] [${pkg}] ${message}`);

    try {
        if (!TOKEN) return; 
        await axios.post(LOG_API_URL, payload, {
            headers: {
                'Authorization': TOKEN,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error("[LOGGER ERROR] Failed to send log to Test Server.");
    }
}

const logger = {
    info: (message, pkg = "service", stack = "backend") => {
        Log(stack, 'info', pkg, message);
    },
    error: (message, pkg = "service", stack = "backend") => {
        Log(stack, 'error', pkg, message);
    }
};

const loggingMiddleware = (req, res, next) => {
    Log("backend", "info", "middleware", `Incoming request: ${req.method} ${req.url}`);
    next();
};

module.exports = { Log, logger, loggingMiddleware };
