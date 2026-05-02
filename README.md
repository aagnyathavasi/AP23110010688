# AP23110010688

# Stage 1

## Core Actions Supported
1. **Get All Notifications:** Retrieve a paginated list of notifications for the logged-in student.
2. **Get Unread Count:** Fetch the count of unread notifications for a quick badge display.
3. **Mark as Read:** Mark a specific notification as read.
4. **Mark All as Read:** Mark all unread notifications for the logged-in student as read.

## REST API Endpoints

### 1. Get All Notifications
**Endpoint:** `GET /api/v1/notifications`
**Description:** Fetches notifications for the logged-in user. Supports pagination.
**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Accept": "application/json"
}
```
**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `status` (optional): "read" | "unread" | "all" (default: "all")

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "notifications": [
      {
        "id": "18c655b2-380d-4295-8905-863f0de32c8f",
        "type": "placement",
        "title": "Google Campus Drive",
        "message": "The online assessment link for Google is now available.",
        "isRead": false,
        "createdAt": "2026-05-02T10:00:00Z",
        "actionUrl": "https://campus.app/placements/google"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100
    }
  }
}
```

### 2. Get Unread Notifications Count
**Endpoint:** `GET /api/v1/notifications/unread-count`
**Description:** Fetches the total count of unread notifications.
**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "unreadCount": 5
  }
}
```

### 3. Mark Notification as Read
**Endpoint:** `PATCH /api/v1/notifications/:id/read`
**Description:** Updates a specific notification's status to read.
**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>",
  "Content-Type": "application/json"
}
```
**Request Body:** *(Empty)*

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Notification marked as read."
}
```

### 4. Mark All Notifications as Read
**Endpoint:** `PATCH /api/v1/notifications/read-all`
**Description:** Marks all unread notifications for the logged-in user as read.
**Headers:**
```json
{
  "Authorization": "Bearer <JWT_TOKEN>"
}
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "All notifications marked as read.",
  "data": {
    "updatedCount": 5
  }
}
```

## Real-Time Notifications Mechanism
For real-time delivery of updates (Placements, Events, Results), **WebSockets (e.g., using Socket.io or native WebSockets)** is the recommended approach.
- **Why?** It maintains a persistent, bidirectional connection with low latency, which is ideal for pushing real-time alerts without the overhead of HTTP polling.
- **Alternative:** Server-Sent Events (SSE) could also be used since notifications are predominantly a one-way stream (Server -> Client), which is more lightweight over HTTP/1.1 and standardizes well. However, WebSockets offer more flexibility if the client needs to emit events back (like acknowledging receipt instantly).

# Stage 2

## Suggested Database
I suggest **PostgreSQL** (a Relational Database) for the following reasons:
1. **Data Integrity & Consistency:** Notifications are tightly coupled to users (students). Relational databases provide strict ACID properties, ensuring reliable state (e.g., reading a notification accurately updates the unread count).
2. **Schema Structure with Flexibility:** We can use structured columns for core fields (`id`, `student_id`, `type`, `is_read`, `created_at`) and utilize PostgreSQL's `JSONB` data type for the `payload` or `metadata`. This handles the varying structures of Placements, Events, and Results without needing separate tables.
3. **Indexing:** Postgres provides advanced indexing (like composite indexes, partial indexes) which are highly effective for filtering unread notifications chronologically.

*(Note: MongoDB could also be a strong candidate due to its flexible document schema, but PostgreSQL's JSONB offers the best of both worlds for this use case).*

## Database Schema (PostgreSQL)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- e.g., 'placement', 'event', 'result'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    action_url VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Partial index for quick retrieval of unread notifications for a user
CREATE INDEX idx_notifications_unread ON notifications(student_id, created_at DESC) WHERE is_read = FALSE;
```

## Potential Problems at Scale & Solutions
1. **Large Table Size (Storage & Slow Writes):** As millions of notifications are generated, the `notifications` table will become massive, slowing down inserts and index updates.
   - **Solution:** Implement **Table Partitioning** by date (e.g., monthly partitions) so older notifications reside in separate physical tables.
2. **Read Latency on 'Unread Count':** Calculating `COUNT(*)` for every user connection on a huge table can degrade DB performance.
   - **Solution:** Use a **Caching Layer (Redis)**. Store the unread count as an integer in Redis (`user:1042:unread_count`). Increment it upon new notifications and decrement when read.
3. **Old Data Cluttering Active Queries:** Users rarely check notifications older than a few months.
   - **Solution:** Introduce **Data Archival / TTL**. Move read notifications older than 6 months to a cheaper cold storage (e.g., AWS S3) or an archive database table to keep the active table lean.

## Queries based on REST APIs

**1. Get All Notifications (with pagination):**
```sql
SELECT id, type, title, message, is_read, created_at, action_url 
FROM notifications 
WHERE student_id = 1042 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 0;
```

**2. Mark Notification as Read:**
```sql
UPDATE notifications 
SET is_read = TRUE 
WHERE id = '18c655b2-380d-4295-8905-863f0de32c8f' AND student_id = 1042 AND is_read = FALSE;
```

**3. Mark All as Read:**
```sql
UPDATE notifications 
SET is_read = TRUE 
WHERE student_id = 1042 AND is_read = FALSE;
```

# Stage 3

The query provided is:
```sql
SELECT * FROM notifications 
WHERE studentID = 1042 AND isRead = false 
ORDER BY createdAt DESC;
```

### Is this query accurate?
Yes, the query is logically accurate for its intended purpose. It correctly targets the unread (`isRead = false`) notifications for a specific student (`studentID = 1042`) and sorts them so the newest ones appear first (`ORDER BY createdAt DESC`). However, `SELECT *` is generally considered a bad practice in production as it pulls down all columns (including large string payloads) which increases network bandwidth and memory overhead.

### Why is it slow?
With 5,000,000 records, if the database lacks an appropriate index covering `studentID`, `isRead`, and `createdAt` together, it will perform a **Sequential Scan** (full table scan) followed by an in-memory "filesort" to order the results by `createdAt`. Scanning millions of rows and sorting them in memory consumes massive CPU and disk I/O, causing severe latency.

### What would you change and what would be the likely computation cost?
I would add a **Partial Composite Index**:
```sql
CREATE INDEX idx_student_unread_recent 
ON notifications (studentID, createdAt DESC) 
WHERE isRead = false;
```
**Likely Computation Cost:**
- **Without Index:** Time complexity is **O(N log N)** where N is the total number of rows in the table (due to full scan + sort). Computation cost is exceptionally high.
- **With Index:** Time complexity drops to **O(log M + K)** where M is the number of unread notifications in the index, and K is the limit of results returned. The database performs an **Index Scan** directly on the pre-sorted B-Tree. The cost drops drastically, providing near-instantaneous responses.

### Adding indexes on every column to be safe: Is this advice effective?
**No, this is terrible advice and highly ineffective.** 
**Why/Why not?** 
1. **Write Penalty:** Every time a new notification is inserted or updated (e.g., marked as read), *every single index* must be synchronously updated. This will drastically slow down write operations, which is catastrophic for a high-throughput notification system.
2. **Storage Overhead:** Indexes consume significant disk space (RAM and Storage). Indexing every column could double or triple the database size unnecessarily.
3. **Optimizer Confusion:** Too many single-column indexes can confuse the database query optimizer, sometimes causing it to pick sub-optimal execution plans instead of using a proper composite index.

### Query: Find all students who got a placement notification in the last 7 days
```sql
SELECT DISTINCT studentID 
FROM notifications 
WHERE notificationType = 'Placement' 
  AND createdAt >= NOW() - INTERVAL '7 days';
```
*(Note: To optimize this query, an index on `(notificationType, createdAt)` would be highly beneficial).*

# Stage 4

The problem describes a classic "read-heavy" system where database read operations are overwhelming the primary database due to frequent page loads by a large number of students.

To improve performance and stop overwhelming the database, I suggest the following strategies:

### 1. Implement a Caching Layer (Redis / Memcached)
Instead of hitting the PostgreSQL database on every page load, we should cache the user's recent/unread notifications in a fast, in-memory data store like Redis.
*   **How it improves performance:** Redis operates in RAM, serving reads in sub-millisecond times. It completely bypasses the disk-backed relational database for the vast majority of notification fetches.
*   **Tradeoffs:**
    *   *Pros:* Massive reduction in DB load; extremely fast read latency.
    *   *Cons:* **Cache Invalidation Complexity:** We must meticulously ensure the cache is updated or invalidated whenever a new notification is generated or an existing one is marked as read. If not handled perfectly, users will see stale data. Added infrastructure cost.

### 2. Real-time Push via WebSockets (instead of Pull/Polling)
Instead of the client fetching (pulling) notifications via an HTTP request on every single page load, the server pushes new notifications to the client over a persistent WebSocket connection. Assuming a Single Page Application (SPA) architecture, the notifications can be kept in the frontend state without refetching on route changes.
*   **How it improves performance:** Eliminates redundant HTTP requests to fetch the exact same unread notifications on every page transition.
*   **Tradeoffs:**
    *   *Pros:* Real-time delivery; significantly fewer HTTP requests; drastically reduced DB reads.
    *   *Cons:* Maintaining thousands of active, concurrent WebSocket connections consumes server memory. Requires robust handling of connection drops, reconnection logic, and load balancers configured for long-lived connections.

### 3. Database Read Replicas
We can route all "read" queries (fetching notifications) to Read Replicas, while keeping "write" operations (creating/marking read) on the Primary database instance.
*   **How it improves performance:** Horizontally distributes the read query load across multiple database servers rather than funneling all traffic to a single bottleneck instance.
*   **Tradeoffs:**
    *   *Pros:* Easy to scale out at the infrastructure level; doesn't require massive application code changes.
    *   *Cons:* **Replication Lag:** Read replicas are eventually consistent. A student might mark a notification as read (write to Primary), immediately reload the page (read from Replica), and briefly still see the notification as unread if the replication hasn't caught up yet.

### Recommended Approach
A combination of **Strategy 1 (Caching)** and **Strategy 2 (WebSockets)** is the industry standard for this scenario. We use Redis to cache the notification payload for ultra-fast initial loads upon login, and WebSockets to push new live notifications so clients don't need to repeatedly hit the backend to check for updates.


# Stage 5

### Shortcomings of the proposed implementation
1. **Synchronous & Blocking:** The loop runs synchronously. If `send_email` takes just 200ms, notifying 50,000 students will take over 2.5 hours. This will block the main thread, timeout the HR's HTTP request, and degrade server performance.
2. **Lack of Fault Tolerance & Retries:** If `send_email` fails midway (e.g., for the 200 students), the loop might crash or skip them. There is no mechanism to track which students failed and retry them without re-sending to those who already received it.
3. **Tight Coupling & Partial Failures:** The three operations (`send_email`, `save_to_db`, `push_to_app`) are tightly coupled. If `send_email` throws an error, the DB insert and App Push are completely skipped for that user, leading to massive data inconsistency.
4. **Database & API Overload:** Hitting the DB and Email API 50,000 times sequentially will exhaust connection pools and likely trigger aggressive rate limits from the third-party Email provider (like AWS SES or SendGrid).

### "Logs indicate that the 'send_email' call failed for 200 students midway. What now?"
In the current synchronous architecture, if a failure throws an exception, the loop terminates immediately. This means all subsequent students in the array receive *nothing*. If the exception was swallowed (caught but ignored), those 200 students are permanently missed because there is no state tracking or queue to retry the failed deliveries. Manual intervention and database querying would be required to figure out who didn't get the email.

### Should saving to DB and sending the email happen together? Why or why not?
**No, they should NOT happen together synchronously.**
*   **Why not:** Database inserts are fast, while sending emails via third-party APIs over the internet is inherently slow and unpredictable. Coupling them forces the fast local database operation to wait for the slow external network operation.
*   **How it should be:** They should be decoupled. The system should write to the database first to ensure the notification is permanently stored, and then *asynchronously* trigger the email and app push processes.

### Redesigning for Reliability and Speed
To make this reliable, scalable, and fast, we must adopt an **Event-Driven, Asynchronous Message Queue Architecture**.

1. **Batch DB Inserts:** Insert the notification for all 50,000 students into the DB using a bulk/batch insert operation rather than 50,000 individual `INSERT` statements.
2. **Message Queues:** Publish a message to a queue (e.g., RabbitMQ, Apache Kafka, or AWS SQS) for each student.
3. **Background Workers:** Deploy multiple concurrent background consumer services that listen to the queues and independently process the emails and pushes at their own optimal speed. 
4. **Retry Mechanism:** If an email fails for a student, the worker simply puts that specific message back in the queue to be retried automatically with exponential backoff.

### Revised Pseudocode

```python
# 1. API endpoint called by HR
function notify_all(student_ids: array, message: string):
    # Fast, bulk DB insert (e.g., chunked into arrays of 5000)
    batch_save_to_db(student_ids, message)
    
    # Publish events to the Message Queue asynchronously
    # This returns immediately, so the HR gets a fast "Success" response
    for student_id in student_ids:
        MessageQueue.publish("notification_exchange", {
            "type": "email",
            "student_id": student_id,
            "message": message
        })
        MessageQueue.publish("notification_exchange", {
            "type": "app_push",
            "student_id": student_id,
            "message": message
        })
    
    return "Notifications queued and are processing in the background"

# 2. Independent Background Worker for Emails (Scalable horizontally)
function consume_email_queue(event):
    try:
        send_email(event.student_id, event.message)
    except TransientError:
        # Puts it back in queue to try again later (e.g., API rate limit hit)
        MessageQueue.retry_with_backoff(event)
    except PermanentError:
        # Move to Dead Letter Queue for manual inspection (e.g., invalid email address)
        MessageQueue.send_to_dlq(event)

# 3. Independent Background Worker for App Pushes
function consume_push_queue(event):
    try:
        push_to_app(event.student_id, event.message) # Using WebSockets designed in Stage 1
    except Exception:
        MessageQueue.retry_with_backoff(event)
```
