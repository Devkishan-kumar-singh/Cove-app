const { cert, getApps, initializeApp } = require("firebase-admin/app");

function getServiceAccount() {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        return JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8"));
    }
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    return null;
}

function getFirebaseApp() {
    if (getApps().length) return getApps()[0];
    const serviceAccount = getServiceAccount();
    if (!serviceAccount) throw new Error("Set FIREBASE_SERVICE_ACCOUNT_BASE64 (recommended) or FIREBASE_SERVICE_ACCOUNT_JSON.");
    return initializeApp({ credential: cert(serviceAccount), storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined });
}

module.exports = { getFirebaseApp };
