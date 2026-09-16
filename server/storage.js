const crypto = require("crypto");
const { getStorage } = require("firebase-admin/storage");
const { getFirebaseApp } = require("./firebase");

async function uploadChatFile({ buffer, originalName, mimeType, roomId }) {
    if (!process.env.FIREBASE_STORAGE_BUCKET) throw new Error("FIREBASE_STORAGE_BUCKET is not configured.");
    const bucket = getStorage(getFirebaseApp()).bucket();
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const object = bucket.file(`rooms/${roomId}/${Date.now()}-${safeName}`);
    const token = crypto.randomUUID();
    await object.save(buffer, { resumable: false, metadata: { contentType: mimeType, metadata: { firebaseStorageDownloadTokens: token } } });
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(object.name)}?alt=media&token=${token}`;
}
module.exports = { uploadChatFile };
