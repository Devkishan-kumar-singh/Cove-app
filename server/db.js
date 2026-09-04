// =========================================
// DATABASE — Postgres (Supabase) via the `pg` package
// Replaces the earlier SQLite version. Same shape of functions,
// now async since network calls are involved.
// =========================================

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.warn(
        "\u26A0\uFE0F  DATABASE_URL is not set in .env. Copy your Supabase connection string " +
        "into .env as DATABASE_URL before starting the server."
    );
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
});

async function init() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            email         TEXT PRIMARY KEY,
            username      TEXT UNIQUE NOT NULL,
            name          TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            gender        TEXT,
            skills        TEXT,
            country       TEXT,
            message       TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS rooms (
            id            SERIAL PRIMARY KEY,
            type          TEXT NOT NULL CHECK (type IN ('dm', 'circle')),
            name          TEXT,
            created_by    TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS room_members (
            room_id       INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            email         TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
            joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (room_id, email)
        );

        CREATE TABLE IF NOT EXISTS messages (
            id            SERIAL PRIMARY KEY,
            room_id       INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
            sender_email  TEXT NOT NULL,
            text          TEXT,
            file_url      TEXT,
            file_type     TEXT,
            file_name     TEXT,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_room_members_email ON room_members(email);
    `);
}

// =========================================
// USERS
// =========================================

async function createUser({ email, username, name, passwordHash, gender, skills, country, message }) {
    await pool.query(
        `INSERT INTO users (email, username, name, password_hash, gender, skills, country, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [email, username, name, passwordHash, gender || null, JSON.stringify(skills || []), country || null, message || null]
    );
}

async function getUserByEmail(email) {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return rows[0] || null;
}

async function getUserByUsername(username) {
    const { rows } = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    return rows[0] || null;
}

async function isUsernameTaken(username) {
    return !!(await getUserByUsername(username));
}

async function searchUsersByUsername(query, excludeEmail) {
    const { rows } = await pool.query(
        `SELECT email, username, name FROM users
         WHERE username ILIKE $1 AND email != $2
         ORDER BY username ASC LIMIT 15`,
        [`%${query}%`, excludeEmail || ""]
    );
    return rows;
}

// =========================================
// ROOMS (DMs + circles, unified)
// =========================================

async function getOrCreateDmRoom(emailA, emailB) {
    const existing = await pool.query(
        `SELECT r.id FROM rooms r
         JOIN room_members m1 ON m1.room_id = r.id AND m1.email = $1
         JOIN room_members m2 ON m2.room_id = r.id AND m2.email = $2
         WHERE r.type = 'dm'
         LIMIT 1`,
        [emailA, emailB]
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const roomRes = await client.query(
            `INSERT INTO rooms (type, created_by) VALUES ('dm', $1) RETURNING id`,
            [emailA]
        );
        const roomId = roomRes.rows[0].id;
        await client.query(
            `INSERT INTO room_members (room_id, email) VALUES ($1, $2), ($1, $3)`,
            [roomId, emailA, emailB]
        );
        await client.query("COMMIT");
        return roomId;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

async function createCircle(name, creatorEmail, memberEmails = []) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const roomRes = await client.query(
            `INSERT INTO rooms (type, name, created_by) VALUES ('circle', $1, $2) RETURNING id`,
            [name, creatorEmail]
        );
        const roomId = roomRes.rows[0].id;

        const allMembers = Array.from(new Set([creatorEmail, ...memberEmails]));
        const values = allMembers.map((_, i) => `($1, $${i + 2})`).join(", ");
        await client.query(
            `INSERT INTO room_members (room_id, email) VALUES ${values} ON CONFLICT DO NOTHING`,
            [roomId, ...allMembers]
        );
        await client.query("COMMIT");
        return roomId;
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

async function addMemberToCircle(roomId, email) {
    await pool.query(
        `INSERT INTO room_members (room_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roomId, email]
    );
}

async function removeMemberFromCircle(roomId, email) {
    await pool.query(
        "DELETE FROM room_members WHERE room_id = $1 AND email = $2",
        [roomId, email]
    );
}

async function getRoom(roomId) {
    const { rows } = await pool.query("SELECT * FROM rooms WHERE id = $1", [roomId]);
    return rows[0] || null;
}

async function isRoomMember(roomId, email) {
    const { rows } = await pool.query(
        "SELECT 1 FROM room_members WHERE room_id = $1 AND email = $2",
        [roomId, email]
    );
    return rows.length > 0;
}

async function getRoomMembers(roomId) {
    const { rows } = await pool.query(
        `SELECT u.email, u.username, u.name FROM room_members rm
         JOIN users u ON u.email = rm.email
         WHERE rm.room_id = $1`,
        [roomId]
    );
    return rows;
}

async function listRoomsForUser(email) {
    const { rows } = await pool.query(
        `SELECT
            r.id, r.type, r.name,
            (SELECT text FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_text,
            (SELECT file_name FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_file_name,
            (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY created_at DESC LIMIT 1) AS last_at,
            (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) AS member_count
         FROM rooms r
         JOIN room_members rm ON rm.room_id = r.id
         WHERE rm.email = $1
         ORDER BY last_at DESC NULLS LAST`,
        [email]
    );

    const results = [];
    for (const r of rows) {
        if (r.type === "dm") {
            const others = await pool.query(
                `SELECT u.email, u.username, u.name FROM room_members rm
                 JOIN users u ON u.email = rm.email
                 WHERE rm.room_id = $1 AND rm.email != $2 LIMIT 1`,
                [r.id, email]
            );
            results.push({ ...r, otherUser: others.rows[0] || null });
        } else {
            results.push({ ...r });
        }
    }
    return results;
}

// =========================================
// MESSAGES
// =========================================

async function saveMessage({ roomId, senderEmail, text, fileUrl, fileType, fileName }) {
    const { rows } = await pool.query(
        `INSERT INTO messages (room_id, sender_email, text, file_url, file_type, file_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [roomId, senderEmail, text || null, fileUrl || null, fileType || null, fileName || null]
    );
    return rows[0];
}

async function getMessages(roomId, limit = 200) {
    const { rows } = await pool.query(
        `SELECT * FROM messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT $2`,
        [roomId, limit]
    );
    return rows;
}

module.exports = {
    pool,
    init,
    createUser,
    getUserByEmail,
    getUserByUsername,
    isUsernameTaken,
    searchUsersByUsername,
    getOrCreateDmRoom,
    createCircle,
    addMemberToCircle,
    removeMemberFromCircle,
    getRoom,
    isRoomMember,
    getRoomMembers,
    listRoomsForUser,
    saveMessage,
    getMessages,
};
