const crypto = require("crypto");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getFirebaseApp } = require("./firebase");

let db;
const users = () => db.collection("users");
const rooms = () => db.collection("rooms");
function clean(value) {
    if (!value) return value;
    const result = { ...value };
    for (const [key, item] of Object.entries(result)) if (item instanceof Timestamp) result[key] = item.toDate().toISOString();
    return result;
}
async function init() {
    getFirebaseApp();
    db = getFirestore();
    await db.collection("_meta").doc("cove").set({ initializedAt: FieldValue.serverTimestamp() }, { merge: true });
}
async function createUser({ email, username, name, passwordHash, gender, skills, country, message }) {
    const normalizedEmail = email.trim().toLowerCase();
    const usernameLower = username.trim().toLowerCase();
    await db.runTransaction(async (tx) => {
        const usernameRef = db.collection("usernames").doc(usernameLower);
        if ((await tx.get(usernameRef)).exists) throw new Error("USERNAME_TAKEN");
        tx.create(users().doc(normalizedEmail), { email: normalizedEmail, username: username.trim(), usernameLower, name: name.trim(), password_hash: passwordHash, gender: gender || null, skills: skills || [], country: country || null, message: message || null, created_at: FieldValue.serverTimestamp() });
        tx.create(usernameRef, { email: normalizedEmail });
    });
}
async function getUserByEmail(email) {
    if (!email) return null;
    const snap = await users().doc(email.trim().toLowerCase()).get();
    return snap.exists ? clean(snap.data()) : null;
}
async function getUserByUsername(username) {
    if (!username) return null;
    const index = await db.collection("usernames").doc(username.trim().toLowerCase()).get();
    return index.exists ? getUserByEmail(index.data().email) : null;
}
async function isUsernameTaken(username) { return !!(await getUserByUsername(username)); }
async function searchUsersByUsername(query, excludeEmail) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const snap = await users().orderBy("usernameLower").startAt(q).endAt(`${q}\uf8ff`).limit(15).get();
    return snap.docs.map((doc) => clean(doc.data())).filter((u) => u.email !== excludeEmail).map(({ email, username, name }) => ({ email, username, name }));
}
function dmId(a, b) { return `dm_${crypto.createHash("sha256").update([a, b].sort().join("|")).digest("hex").slice(0, 32)}`; }
async function getOrCreateDmRoom(emailA, emailB) {
    const id = dmId(emailA, emailB); const ref = rooms().doc(id);
    await db.runTransaction(async (tx) => { if (!(await tx.get(ref)).exists) tx.create(ref, { type: "dm", name: null, created_by: emailA, members: [emailA, emailB], created_at: FieldValue.serverTimestamp() }); });
    return id;
}
async function createCircle(name, creatorEmail, memberEmails = []) {
    const ref = rooms().doc();
    await ref.set({ type: "circle", name, created_by: creatorEmail, members: Array.from(new Set([creatorEmail, ...memberEmails])), created_at: FieldValue.serverTimestamp() });
    return ref.id;
}
async function addMemberToCircle(roomId, email) { await rooms().doc(String(roomId)).update({ members: FieldValue.arrayUnion(email) }); }
async function removeMemberFromCircle(roomId, email) { await rooms().doc(String(roomId)).update({ members: FieldValue.arrayRemove(email) }); }
async function getRoom(roomId) { const snap = await rooms().doc(String(roomId)).get(); return snap.exists ? { id: snap.id, ...clean(snap.data()) } : null; }
async function isRoomMember(roomId, email) { const room = await getRoom(roomId); return !!room?.members?.includes(email); }
async function getRoomMembers(roomId) {
    const room = await getRoom(roomId); if (!room) return [];
    const snapshots = await Promise.all((room.members || []).map((email) => users().doc(email).get()));
    return snapshots.filter((snap) => snap.exists).map((snap) => { const { email, username, name } = snap.data(); return { email, username, name }; });
}
async function listRoomsForUser(email) {
    const snap = await rooms().where("members", "array-contains", email).get();
    const results = await Promise.all(snap.docs.map(async (doc) => {
        const data = clean(doc.data());
        const latest = await doc.ref.collection("messages").orderBy("created_at", "desc").limit(1).get();
        const last = latest.empty ? null : clean(latest.docs[0].data());
        const room = { id: doc.id, ...data, member_count: data.members?.length || 0, last_text: last?.text || null, last_file_name: last?.file_name || null, last_message_at: last?.created_at || null };
        if (data.type === "dm") { const other = await getUserByEmail(data.members.find((m) => m !== email)); room.otherUser = other ? { email: other.email, username: other.username, name: other.name } : null; }
        delete room.members; return room;
    }));
    return results.sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0));
}
async function saveMessage({ roomId, senderEmail, text, fileUrl, fileType, fileName }) {
    const ref = rooms().doc(String(roomId)).collection("messages").doc();
    await ref.set({ room_id: String(roomId), sender_email: senderEmail, text: text || null, file_url: fileUrl || null, file_type: fileType || null, file_name: fileName || null, created_at: FieldValue.serverTimestamp() });
    return { id: ref.id, ...clean((await ref.get()).data()) };
}
async function getMessages(roomId, limit = 200) {
    const snap = await rooms().doc(String(roomId)).collection("messages").orderBy("created_at", "asc").limit(limit).get();
    return snap.docs.map((doc) => ({ id: doc.id, ...clean(doc.data()) }));
}
module.exports = { init, createUser, getUserByEmail, getUserByUsername, isUsernameTaken, searchUsersByUsername, getOrCreateDmRoom, createCircle, addMemberToCircle, removeMemberFromCircle, getRoom, isRoomMember, getRoomMembers, listRoomsForUser, saveMessage, getMessages };
