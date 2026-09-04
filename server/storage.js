// =========================================
// STORAGE — Supabase Storage for chat file/image uploads
// =========================================

const { createClient } = require("@supabase/supabase-js");

const BUCKET = "chat-files";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.warn(
        "\u26A0\uFE0F  SUPABASE_URL / SUPABASE_SERVICE_KEY are not set in .env. " +
        "File and image uploads in chat won't work until you add them."
    );
}

const supabase = createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_KEY || ""
);

// Uploads a buffer to the chat-files bucket and returns its public URL.
async function uploadChatFile({ buffer, originalName, mimeType, roomId }) {
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const path = `room-${roomId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: mimeType, upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
}

module.exports = { uploadChatFile };
