require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { logger, loggingMiddleware } = require('./logger');

const app = express();
app.use(express.json());
app.use(loggingMiddleware);

const API_BASE_URL = 'http://20.207.122.201/evaluation-service';

// The assignment says the API is a protected route. 
// Assume EVALUATION_TOKEN is provided in environment variables, or pass Authorization header directly to this service.
const getAuthHeaders = (req) => {
    const token = req.headers.authorization || process.env.EVALUATION_TOKEN;
    return token ? { Authorization: token } : {};
};

/**
 * 0/1 Knapsack Algorithm to maximize Impact within MechanicHours budget.
 * @param {number} capacity - The MechanicHours available
 * @param {Array} vehicles - Array of vehicle tasks
 * @returns {Object} - The max impact and subset of vehicles to service
 */
function scheduleVehicles(capacity, vehicles) {
    const n = vehicles.length;
    // DP table: dp[i][w] stores the max impact for first i items and capacity w
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

    // Backtrack to find the selected vehicles
    let res = dp[n][capacity];
    let w = capacity;
    const selectedVehicles = [];

    for (let i = n; i > 0 && res > 0; i--) {
        // If the value came from the previous row, item i was not included
        if (res !== dp[i - 1][w]) {
            const vehicle = vehicles[i - 1];
            selectedVehicles.push(vehicle);
            // Deduct the value and weight of the included item
            res -= vehicle.Impact;
            w -= vehicle.Duration;
        }
    }

    return {
        maxImpact: dp[n][capacity],
        selectedTasks: selectedVehicles
    };
}

// Microservice endpoint to run the scheduling algorithm
app.post('/api/schedule', async (req, res) => {
    try {
        logger.info('Fetching depots and vehicles data from evaluation-service...');
        const headers = getAuthHeaders(req);

        // Fetch depots and vehicles concurrently
        const [depotsRes, vehiclesRes] = await Promise.all([
            axios.get(`${API_BASE_URL}/depots`, { headers }),
            axios.get(`${API_BASE_URL}/vehicles`, { headers })
        ]);

        const depots = depotsRes.data.depots || [];
        const vehicles = vehiclesRes.data.vehicles || [];

        logger.info(`Successfully fetched ${depots.length} depots and ${vehicles.length} vehicles.`);

        // Determine schedule for each depot
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
        
        // Handle cases where the upstream API requires auth and we don't have a valid token
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
