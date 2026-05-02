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

### Why is it slow?
With 5,000,000 records, the database engine is likely performing a **Sequential Scan** (or full table scan) because it lacks an efficient index that covers all the conditions in the `WHERE` clause and the `ORDER BY` clause. Even if there is a basic index on `studentID`, if the database has to sort a large number of rows by `createdAt` in memory (a "filesort"), it will consume significant CPU and memory, increasing latency. 

Furthermore, checking `isRead = false` means scanning through lots of records that might already be read.

### The Solution
To optimize this, we need to create a **Composite Index** that perfectly aligns with the query's filtering and sorting requirements. Furthermore, since we are only interested in unread notifications, we can optimize the index size and speed by making it a **Partial Index**.

**Optimized Index Creation:**
```sql
CREATE INDEX idx_student_unread_recent 
ON notifications (studentID, createdAt DESC) 
WHERE isRead = false;
```

### How this solves the problem:
1. **Filtering:** The index only stores rows where `isRead = false`, dramatically reducing the size of the index structure. The engine immediately narrows down to the unread rows without scanning read ones.
2. **Targeting:** It uses `studentID` as the first key, instantly finding the specific student's records in the B-Tree.
3. **Sorting:** It includes `createdAt DESC` as the second key. Because the index is already sorted in descending order by creation date, the database can fetch the results sequentially without needing to perform an expensive in-memory sort operation.

This optimization changes the query execution plan from an expensive sequential scan / filesort into a very fast **Index Only Scan** or **Index Scan**, providing near-instantaneous response times regardless of how large the overall table grows.
