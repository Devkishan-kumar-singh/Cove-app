// =========================================
// BACKEND: registration + OTP email + login + circles/DM chat + file uploads
// =========================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");

const store = require("./db");
const { uploadChatFile } = require("./storage");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB cap

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// =========================================
// In-memory OTP stores (short-lived, fine to lose on restart)
// =========================================
const otpStore = new Map();
const loginOtpStore = new Map();

// =========================================
// Simple session store: random token -> email
// =========================================
const sessions = new Map();

function createSession(email) {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, email);
    return token;
}

function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const email = token && sessions.get(token);
    if (!email) return res.status(401).json({ success: false, message: "Not logged in." });
    req.userEmail = email;
    next();
}

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function generateOtp() {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = 10 ** OTP_LENGTH - 1;
    return String(Math.floor(min + Math.random() * (max - min + 1)));
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;

// =========================================
// =========================================
// Mail transport using Resend
// =========================================
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOtpEmail(toEmail, name, otp) {
    try {
        await resend.emails.send({
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",   // ✅ keep this line
            to: toEmail,                                               // ✅ keep this line
            subject: "Your verification code",                         // ✅ keep this line
            html: `
                <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;">
                    <h2 style="color:#111">Verify your email</h2>
                    <p>Hi ${name || "there"}, use the code below:</p>
                    <p style="font-size:32px;font-weight:700;letter-spacing:6px;color:#5b4be7;">${otp}</p>
                    <p style="color:#666;font-size:13px;">Expires in 5 minutes. Ignore this email if you didn't request it.</p>
                </div>
            `,
        });
        return true;
    } catch (err) {
        console.error("Resend email error:", err);
        throw new Error("Failed to send OTP email via Resend.");
    }
}


// =========================================
// AUTH ROUTES
// =========================================

app.post("/api/check-username", async (req, res) => {
    const { username } = req.body || {};
    if (!username || !usernamePattern.test(username)) {
        return res.status(400).json({ success: false, available: false, message: "3-20 characters: letters, numbers, underscores only." });
    }
    const taken = await store.isUsernameTaken(username);
    return res.json({ success: true, available: !taken });
});

app.post("/api/register", async (req, res) => {
    try {
        const { name, username, email, password, gender, skills, country, message } = req.body || {};
        if (!name || !username || !email || !password || !gender || !country || !message) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }
        if (!emailPattern.test(email)) return res.status(400).json({ success: false, message: "Invalid email address." });
        if (!usernamePattern.test(username)) {
            return res.status(400).json({ success: false, message: "Username must be 3-20 characters: letters, numbers, underscores only." });
        }
        if (await store.getUserByEmail(email)) {
            return res.status(409).json({ success: false, message: "An account with this email already exists. Try logging in." });
        }
        if (await store.isUsernameTaken(username)) {
            return res.status(409).json({ success: false, message: "That username is already taken." });
        }

        const otp = generateOtp();
        otpStore.set(email, {
            otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0,
            userData: { name, username, email, password, gender, skills, country, message },
        });

        await sendOtpEmail(email, name, otp);
        return res.json({ success: true, message: "OTP sent to your email." });
    } catch (err) {
        console.error("register error:", err);
        return res.status(500).json({ success: false, message: "Failed to send OTP email. Check server SMTP config." });
    }
});

app.post("/api/resend-otp", async (req, res) => {
    try {
        const { email } = req.body || {};
        const record = otpStore.get(email);
        if (!record) return res.status(404).json({ success: false, message: "No pending verification for this email. Please register again." });

        const otp = generateOtp();
        record.otp = otp;
        record.expiresAt = Date.now() + OTP_TTL_MS;
        record.attempts = 0;
        otpStore.set(email, record);

        await sendOtpEmail(email, record.userData?.name, otp);
        return res.json({ success: true, message: "A new OTP has been sent." });
    } catch (err) {
        console.error("resend error:", err);
        return res.status(500).json({ success: false, message: "Failed to resend OTP." });
    }
});

app.post("/api/verify-otp", async (req, res) => {
    const { email, otp } = req.body || {};
    const record = otpStore.get(email);

    if (!record) return res.status(404).json({ success: false, message: "No pending verification for this email. Please register again." });
    if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return res.status(410).json({ success: false, message: "Code expired. Please request a new one." });
    }
    record.attempts += 1;
    if (record.attempts > MAX_ATTEMPTS) {
        otpStore.delete(email);
        return res.status(429).json({ success: false, message: "Too many attempts. Please request a new code." });
    }
    if (record.otp !== otp) return res.status(401).json({ success: false, message: "Incorrect code." });

    const userData = record.userData;
    otpStore.delete(email);

    try {
        const passwordHash = await bcrypt.hash(userData.password, 10);
        await store.createUser({
            email: userData.email, username: userData.username, name: userData.name,
            passwordHash, gender: userData.gender, skills: userData.skills,
            country: userData.country, message: userData.message,
        });
    } catch (err) {
        console.error("Failed to persist user after verification:", err);
        return res.status(500).json({ success: false, message: "Verified, but failed to create your account. Please try registering again." });
    }

    const token = createSession(email);
    return res.json({
        success: true, message: "Email verified successfully.", token,
        user: { name: userData.name, username: userData.username, email: userData.email },
    });
});

app.post("/api/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

    const user = await store.getUserByEmail(email);
    if (!user) return res.status(401).json({ success: false, message: "No account found with that email." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ success: false, message: "Incorrect password." });

    const token = createSession(email);
    return res.json({
        success: true, message: "Logged in successfully.", token,
        user: { name: user.name, username: user.username, email: user.email },
    });
});

app.post("/api/login/request-otp", async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ success: false, message: "Email is required." });

        const user = await store.getUserByEmail(email);
        if (!user) return res.status(404).json({ success: false, message: "No account found with that email." });

        const otp = generateOtp();
        loginOtpStore.set(email, { otp, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });

        await sendOtpEmail(email, user.name, otp);
        return res.json({ success: true, message: "OTP sent to your email." });
    } catch (err) {
        console.error("login/request-otp error:", err);
        return res.status(500).json({ success: false, message: "Failed to send OTP email. Check server SMTP config." });
    }
});

app.post("/api/login/verify-otp", async (req, res) => {
    const { email, otp } = req.body || {};
    const record = loginOtpStore.get(email);

    if (!record) return res.status(404).json({ success: false, message: "No pending login code for this email. Request a new one." });
    if (Date.now() > record.expiresAt) {
        loginOtpStore.delete(email);
        return res.status(410).json({ success: false, message: "Code expired. Please request a new one." });
    }
    record.attempts += 1;
    if (record.attempts > MAX_ATTEMPTS) {
        loginOtpStore.delete(email);
        return res.status(429).json({ success: false, message: "Too many attempts. Please request a new code." });
    }
    if (record.otp !== otp) return res.status(401).json({ success: false, message: "Incorrect code." });

    loginOtpStore.delete(email);
    const user = await store.getUserByEmail(email);
    const token = createSession(email);

    return res.json({
        success: true, message: "Logged in successfully.", token,
        user: { name: user?.name, username: user?.username, email },
    });
});

app.get("/api/me", requireAuth, async (req, res) => {
    const user = await store.getUserByEmail(req.userEmail);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    return res.json({ success: true, user: { name: user.name, username: user.username, email: user.email } });
});

app.get("/api/users/search", requireAuth, async (req, res) => {
    const q = (req.query.q || "").trim();
    if (!q) return res.json({ success: true, users: [] });
    const results = await store.searchUsersByUsername(q, req.userEmail);
    return res.json({ success: true, users: results });
});

// =========================================
// ROOMS — DMs + circles, unified
// =========================================

app.get("/api/rooms", requireAuth, async (req, res) => {
    const rooms = await store.listRoomsForUser(req.userEmail);
    return res.json({ success: true, rooms });
});

app.post("/api/rooms/start-dm", requireAuth, async (req, res) => {
    const { username } = req.body || {};
    const other = await store.getUserByUsername(username);
    if (!other) return res.status(404).json({ success: false, message: "No user with that username." });
    if (other.email === req.userEmail) return res.status(400).json({ success: false, message: "You can't message yourself." });

    const roomId = await store.getOrCreateDmRoom(req.userEmail, other.email);
    return res.json({
        success: true,
        room: { id: roomId, type: "dm", otherUser: { email: other.email, username: other.username, name: other.name } },
    });
});

app.post("/api/circles/create", requireAuth, async (req, res) => {
    const { name, usernames } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Circle name is required." });

    const cleanUsernames = (usernames || []).map((u) => u.trim()).filter(Boolean);
    const memberEmails = [];
    const notFound = [];

    for (const uname of cleanUsernames) {
        const u = await store.getUserByUsername(uname);
        if (u) {
            memberEmails.push(u.email);
        } else {
            notFound.push(uname);
        }
    }

    if (notFound.length > 0) {
        return res.status(404).json({
            success: false,
            message: `No user${notFound.length > 1 ? "s" : ""} found with username${notFound.length > 1 ? "s" : ""}: ${notFound.join(", ")}`,
        });
    }

    const roomId = await store.createCircle(name.trim(), req.userEmail, memberEmails);
    const members = await store.getRoomMembers(roomId);
    return res.json({ success: true, room: { id: roomId, type: "circle", name: name.trim(), members } });
});

app.post("/api/circles/:id/add-member", requireAuth, async (req, res) => {
    const roomId = Number(req.params.id);
    const room = await store.getRoom(roomId);
    if (!room || room.type !== "circle") return res.status(404).json({ success: false, message: "Circle not found." });
    if (!(await store.isRoomMember(roomId, req.userEmail))) {
        return res.status(403).json({ success: false, message: "You're not in this circle." });
    }

    const { username } = req.body || {};
    const user = await store.getUserByUsername(username);
    if (!user) return res.status(404).json({ success: false, message: "No user with that username." });

    await store.addMemberToCircle(roomId, user.email);
    io.to(`room:${roomId}`).emit("member_added", { roomId, member: { email: user.email, username: user.username, name: user.name } });
    await emitRoomPresence(roomId);
    return res.json({ success: true });
});

app.get("/api/rooms/:id/messages", requireAuth, async (req, res) => {
    const roomId = Number(req.params.id);
    if (!(await store.isRoomMember(roomId, req.userEmail))) {
        return res.status(403).json({ success: false, message: "Not your room." });
    }
    const messages = await store.getMessages(roomId);
    return res.json({ success: true, messages });
});

app.get("/api/rooms/:id/members", requireAuth, async (req, res) => {
    const roomId = Number(req.params.id);
    if (!(await store.isRoomMember(roomId, req.userEmail))) {
        return res.status(403).json({ success: false, message: "Not your room." });
    }
    const room = await store.getRoom(roomId);
    const members = await store.getRoomMembers(roomId);
    return res.json({ success: true, members, isOwner: room?.created_by === req.userEmail });
});

app.delete("/api/circles/:id/members/:username", requireAuth, async (req, res) => {
    const roomId = Number(req.params.id);
    const room = await store.getRoom(roomId);
    if (!room || room.type !== "circle") {
        return res.status(404).json({ success: false, message: "Circle not found." });
    }
    if (room.created_by !== req.userEmail) {
        return res.status(403).json({ success: false, message: "Only the circle creator can remove members." });
    }

    const user = await store.getUserByUsername(req.params.username);
    if (!user || !(await store.isRoomMember(roomId, user.email))) {
        return res.status(404).json({ success: false, message: "That person is not in this circle." });
    }
    if (user.email === room.created_by) {
        return res.status(400).json({ success: false, message: "The circle creator cannot be removed." });
    }

    await store.removeMemberFromCircle(roomId, user.email);
    io.to(`room:${roomId}`).emit("member_removed", {
        roomId,
        email: user.email,
        username: user.username,
    });
    await emitRoomPresence(roomId);
    return res.json({ success: true });
});

// =========================================
// FILE / IMAGE UPLOAD (chat attachments)
// =========================================

app.post("/api/rooms/:id/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
        const roomId = Number(req.params.id);
        if (!(await store.isRoomMember(roomId, req.userEmail))) {
            return res.status(403).json({ success: false, message: "Not your room." });
        }
        if (!req.file) return res.status(400).json({ success: false, message: "No file received." });

        const fileUrl = await uploadChatFile({
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            roomId,
        });

        const isImage = req.file.mimetype.startsWith("image/");
        const message = await store.saveMessage({
            roomId,
            senderEmail: req.userEmail,
            text: null,
            fileUrl,
            fileType: isImage ? "image" : "file",
            fileName: req.file.originalname,
        });

        io.to(`room:${roomId}`).emit("new_message", message);
        return res.json({ success: true, message });
    } catch (err) {
        console.error("upload error:", err);
        return res.status(500).json({ success: false, message: "Upload failed. Check Supabase storage config." });
    }
});

// =========================================
// SOCKET.IO — real-time messaging
// =========================================

const socketEmail = new Map();
const emailSockets = new Map();
const joinedRooms = new Map();

async function emitRoomPresence(roomId) {
    try {
        const members = await store.getRoomMembers(roomId);
        const onlineEmails = members.filter((member) => emailSockets.has(member.email)).map((member) => member.email);
        io.to(`room:${roomId}`).emit("presence_update", {
            roomId: Number(roomId),
            onlineCount: onlineEmails.length,
            onlineEmails,
        });
    } catch (err) {
        console.error("presence update error:", err);
    }
}

io.on("connection", (socket) => {
    socket.on("auth", (token) => {
        const email = sessions.get(token);
        if (!email) return socket.emit("auth_error", "Invalid session.");
        socketEmail.set(socket.id, email);
        if (!emailSockets.has(email)) emailSockets.set(email, new Set());
        emailSockets.get(email).add(socket.id);
        joinedRooms.set(socket.id, new Set());
        socket.emit("auth_ok");
    });

    socket.on("join_room", async (roomId) => {
        const email = socketEmail.get(socket.id);
        if (!email || !(await store.isRoomMember(roomId, email))) return;
        socket.join(`room:${roomId}`);
        joinedRooms.get(socket.id)?.add(Number(roomId));
        await emitRoomPresence(roomId);
    });

    socket.on("send_message", async ({ roomId, text }) => {
        const senderEmail = socketEmail.get(socket.id);
        if (!senderEmail || !text || !text.trim()) return;

        const isMember = await store.isRoomMember(roomId, senderEmail);
        if (!isMember) return;

        const saved = await store.saveMessage({ roomId, senderEmail, text: text.trim() });
        io.to(`room:${roomId}`).emit("new_message", saved);
    });

    socket.on("disconnect", () => {
        const email = socketEmail.get(socket.id);
        const roomsToUpdate = Array.from(joinedRooms.get(socket.id) || []);
        if (email && emailSockets.has(email)) {
            emailSockets.get(email).delete(socket.id);
            if (emailSockets.get(email).size === 0) emailSockets.delete(email);
        }
        socketEmail.delete(socket.id);
        joinedRooms.delete(socket.id);
        roomsToUpdate.forEach((roomId) => emitRoomPresence(roomId));
    });
});

// =========================================
// BOOT
// =========================================

store.init()
    .then(() => {
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Failed to initialize database. Check DATABASE_URL in .env:", err.message);
        process.exit(1);
    });
