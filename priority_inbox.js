const axios = require('axios');

// IMPORTANT: Replace this URL with the actual Notification API URL from your screenshot!
const NOTIFICATION_API_URL = process.env.NOTIFICATION_API_URL || 'http://20.207.122.201/evaluation-service/notifications';
const TOKEN = process.env.EVALUATION_TOKEN || '';

const WEIGHTS = {
    'placement': 3,
    'result': 2,
    'event': 1
};

// Convert notificationType to lowercase to match weights
function getWeight(type) {
    if (!type) return 0;
    const normalized = type.toLowerCase();
    return WEIGHTS[normalized] || 0;
}

// Returns true if 'a' has strictly HIGHER priority than 'b'
function hasHigherPriority(a, b) {
    const weightA = getWeight(a.Type);
    const weightB = getWeight(b.Type);
    
    if (weightA !== weightB) {
        return weightA > weightB; 
    }
    
    // If weights are equal, more recent comes first
    const timeA = new Date(a.Timestamp).getTime();
    const timeB = new Date(b.Timestamp).getTime();
    return timeA > timeB;
}

/**
 * Min-Heap implementation to efficiently maintain the Top N notifications.
 * The "minimum" element (lowest priority among the Top N) sits at the root.
 */
class TopNNotifications {
    constructor(n) {
        this.maxSize = n;
        this.heap = []; 
    }

    // Return true if heap[i] has LOWER priority than heap[j]
    compare(i, j) {
        return hasHigherPriority(this.heap[j], this.heap[i]);
    }

    swap(i, j) {
        [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    }

    add(notification) {
        if (this.heap.length < this.maxSize) {
            this.heap.push(notification);
            this.bubbleUp(this.heap.length - 1);
        } else {
            // Compare with the minimum element in our top N (root at index 0)
            // If new notification has HIGHER priority, replace root and sink down
            if (hasHigherPriority(notification, this.heap[0])) {
                this.heap[0] = notification;
                this.sinkDown(0);
            }
        }
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.compare(index, parentIndex)) {
                this.swap(index, parentIndex);
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    sinkDown(index) {
        const length = this.heap.length;
        while (true) {
            let leftChild = 2 * index + 1;
            let rightChild = 2 * index + 2;
            let smallest = index;

            if (leftChild < length && this.compare(leftChild, smallest)) {
                smallest = leftChild;
            }
            if (rightChild < length && this.compare(rightChild, smallest)) {
                smallest = rightChild;
            }
            if (smallest !== index) {
                this.swap(index, smallest);
                index = smallest;
            } else {
                break;
            }
        }
    }

    // Return sorted results (highest priority first)
    getTopN() {
        return [...this.heap].sort((a, b) => hasHigherPriority(a, b) ? -1 : 1);
    }
}

async function fetchAndProcessNotifications() {
    try {
        console.log(`Fetching notifications from ${NOTIFICATION_API_URL}...`);
        
        const response = await axios.get(NOTIFICATION_API_URL, {
            headers: { Authorization: TOKEN }
        });

        // Handle variations in API response structure
        const notifications = response.data.notifications || response.data || [];
        
        console.log(`Received ${notifications.length} notifications. Calculating top 10...`);

        // Create heap for Top 10
        const top10 = new TopNNotifications(10);
        
        // Stream them into the heap
        for (const notif of notifications) {
            top10.add(notif);
        }

        const results = top10.getTopN();
        
        console.log("\n--- PRIORITY INBOX: TOP 10 NOTIFICATIONS ---");
        results.forEach((n, index) => {
            const type = (n.Type || 'Unknown').toUpperCase();
            console.log(`${index + 1}. [${type}] Date: ${n.Timestamp || 'N/A'} - Msg: "${n.Message || ''}" - ID: ${n.ID || 'N/A'}`);
        });

    } catch (error) {
        console.error("\nError fetching or processing notifications:", error.message);
        if (error.response && error.response.status === 401) {
            console.error("-> Unauthorized! Please provide your EVALUATION_TOKEN.");
        }
    }
}

// Execute
fetchAndProcessNotifications();
