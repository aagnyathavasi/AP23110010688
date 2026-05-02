require('dotenv').config();
const express = require('express');
const axios = require('axios');
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

const app = express();
app.use(express.json());
app.use(loggingMiddleware);

const API_BASE_URL = 'http://20.207.122.201/evaluation-service';

const getAuthHeaders = (req) => {
    const token = req.headers.authorization || process.env.EVALUATION_TOKEN;
    return token ? { Authorization: token } : {};
};

/**
 * @param {number} capacity - The MechanicHours available
 * @param {Array} vehicles - Array of vehicle tasks
 * @returns {Object} - The max impact and subset of vehicles to service
 */
function scheduleVehicles(capacity, vehicles) {
    const n = vehicles.length;
    
    const dp = Array(n + 1).fill().map(() => Array(capacity + 1).fill(0));

    for (let i = 1; i <= n; i++) {
        const vehicle = vehicles[i - 1];
        const weight = vehicle.Duration;
        const value = vehicle.Impact;

        for (let w = 0; w <= capacity; w++) {
            if (weight <= w) {
                dp[i][w] = Math.max(value + dp[i - 1][w - weight], dp[i - 1][w]);
            } else {
                dp[i][w] = dp[i - 1][w];
            }
        }
    }

   
    let res = dp[n][capacity];
    let w = capacity;
    const selectedVehicles = [];

    for (let i = n; i > 0 && res > 0; i--) {
        
        if (res !== dp[i - 1][w]) {
            const vehicle = vehicles[i - 1];
            selectedVehicles.push(vehicle);
           
            res -= vehicle.Impact;
            w -= vehicle.Duration;
        }
    }

    return {
        maxImpact: dp[n][capacity],
        selectedTasks: selectedVehicles
    };
}


app.post('/api/schedule', async (req, res) => {
    try {
        logger.info('Fetching depots and vehicles data from evaluation-service...');
        const headers = getAuthHeaders(req);

        
        const [depotsRes, vehiclesRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/depots`, { headers }),
            axios.get(`${API_BASE_URL}/vehicles`, { headers })
        ]);

        const depots = depotsRes.data.depots || [];
        const vehicles = vehiclesRes.data.vehicles || [];

        logger.info(`Successfully fetched ${depots.length} depots and ${vehicles.length} vehicles.`);

     
        const results = depots.map(depot => {
            const schedulingResult = scheduleVehicles(depot.MechanicHours, vehicles);
            return {
                depotID: depot.ID,
                mechanicHoursBudget: depot.MechanicHours,
                totalImpactScheduled: schedulingResult.maxImpact,
                scheduledTasks: schedulingResult.selectedTasks
            };
        });

        logger.info('Successfully scheduled vehicles for all depots.');
        
        return res.status(200).json({
            status: 'success',
            data: results
        });

    } catch (error) {
        logger.error('Error in vehicle scheduling', { error: error.message });
        
        
        if (error.response && error.response.status === 401) {
             return res.status(401).json({
                 status: 'error',
                 message: 'Unauthorized access to evaluation-service. Please provide a valid Authorization header.'
             });
        }

        return res.status(500).json({
            status: 'error',
            message: 'Failed to process vehicle scheduling.'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Vehicle Maintenance Scheduler Microservice is running on port ${PORT}`);
});
