const axios = require('axios');

// Fallback to a presumed log endpoint if not explicitly provided
const LOG_API_URL = process.env.LOG_API_URL || 'http://20.207.122.201/evaluation-service/log';
const TOKEN = process.env.EVALUATION_TOKEN || '';

/**
 * Reusable Log function that makes an API call to the Test Server
 * @param {string} stack - Stack trace or context
 * @param {string} level - Log level (e.g., 'INFO', 'ERROR', 'WARN', 'DEBUG')
 * @param {string} pkg - Package or module name
 * @param {string} message - The actual log message
 */
async function Log(stack, level, pkg, message) {
    const payload = {
        stack: stack,
        level: level,
        package: pkg,
        message: message
    };

    // Always log locally to console
    console.log(`[${level}] [${pkg}] ${message}`);

    try {
        if (!TOKEN) return; // Skip API call if token is missing
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
    info: (message, pkg = "vehicle_maintence_scheduler", stack = "N/A") => {
        Log(stack, 'INFO', pkg, message);
    },
    error: (message, pkg = "vehicle_maintence_scheduler", stack = "N/A") => {
        Log(stack, 'ERROR', pkg, message);
    }
};

const loggingMiddleware = (req, res, next) => {
    Log("ExpressMiddleware", "INFO", "logging_middleware", `Incoming request: ${req.method} ${req.url}`);
    next();
};

module.exports = { Log, logger, loggingMiddleware };
