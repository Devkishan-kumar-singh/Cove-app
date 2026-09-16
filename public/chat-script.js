// =========================================
// CHAT — client logic (DMs + circles, files, emoji)
// =========================================

const API_BASE = "";

const token = localStorage.getItem("coveToken");
if (!token) window.location.href = "login.html";

const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
const authHeadersNoJson = { Authorization: `Bearer ${token}` };

const meName = document.getElementById("meName");
const meUsername = document.getElementById("meUsername");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const convoList = document.getElementById("convoList");
const convoEmpty = document.getElementById("convoEmpty");
const logoutBtn = document.getElementById("logoutBtn");
const createCircleBtn = document.getElementById("createCircleBtn");
const mobileCreateCircleBtn = document.getElementById("mobileCreateCircleBtn");
const emptyCreateBtn = document.getElementById("emptyCreateBtn");
const refreshRoomsBtn = document.getElementById("refreshRoomsBtn");
const convoLoading = document.getElementById("convoLoading");
const meAvatar = document.getElementById("meAvatar");

const threadEmpty = document.getElementById("threadEmpty");
const threadActive = document.getElementById("threadActive");
const threadName = document.getElementById("threadName");
const threadUsername = document.getElementById("threadUsername");
const onlineCount = document.getElementById("onlineCount");
const threadAvatar = document.getElementById("threadAvatar");
const mobileBackBtn = document.getElementById("mobileBackBtn");
const addMemberBtn = document.getElementById("addMemberBtn");
const messagesEl = document.getElementById("messagesEl");
const composerForm = document.getElementById("composerForm");
const messageInput = document.getElementById("messageInput");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
const uploadPreview = document.getElementById("uploadPreview");
const uploadFileName = document.getElementById("uploadFileName");
const uploadFileMeta = document.getElementById("uploadFileMeta");
const cancelUploadBtn = document.getElementById("cancelUploadBtn");
const dropOverlay = document.getElementById("dropOverlay");
const toastRegion = document.getElementById("toastRegion");
const messageLoader = document.getElementById("messageLoader");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPicker = document.getElementById("emojiPicker");

const circleModalOverlay = document.getElementById("circleModalOverlay");
const circleNameInput = document.getElementById("circleNameInput");
const circleMembersInput = document.getElementById("circleMembersInput");
const circleCreateStatus = document.getElementById("circleCreateStatus");
const circleCancelBtn = document.getElementById("circleCancelBtn");
const circleCreateBtn = document.getElementById("circleCreateBtn");

const membersBtn = document.getElementById("membersBtn");
const membersModalOverlay = document.getElementById("membersModalOverlay");
const membersModalTitle = document.getElementById("membersModalTitle");
const membersCloseBtn = document.getElementById("membersCloseBtn");
const membersList = document.getElementById("membersList");

const addMemberOverlay = document.getElementById("addMemberOverlay");
const addMemberInput = document.getElementById("addMemberInput");
const addMemberStatus = document.getElementById("addMemberStatus");
const addMemberCancelBtn = document.getElementById("addMemberCancelBtn");
const addMemberConfirmBtn = document.getElementById("addMemberConfirmBtn");

const sharedBtn = document.getElementById("sharedBtn");
const sharedModalOverlay = document.getElementById("sharedModalOverlay");
const sharedCloseBtn = document.getElementById("sharedCloseBtn");
const sharedTabImages = document.getElementById("sharedTabImages");
const sharedTabLinks = document.getElementById("sharedTabLinks");
const sharedImagesPanel = document.getElementById("sharedImagesPanel");
const sharedLinksPanel = document.getElementById("sharedLinksPanel");
const sharedImageGrid = document.getElementById("sharedImageGrid");
const sharedImagesEmpty = document.getElementById("sharedImagesEmpty");
const sharedLinkList = document.getElementById("sharedLinkList");
const sharedLinksEmpty = document.getElementById("sharedLinksEmpty");

let me = null;
let activeRoomId = null;
let activeRoom = null;
let socket = null;
let activeRoomIsOwner = false;
let currentOnlineEmails = new Set();
let localCallStream = null;
let activeCallRoomId = null;
let callMuted = false;
const callPeers = new Map();
const knownCallStates = new Map();

const EMOJI_SET = [
    "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😅",
    "😭","😡","🥳","😴","🤗","👍","👎","👏","🙏","💪",
    "❤️","🔥","🎉","✨","💯","👋","🙌","😢","😱","🥰",
    "😇","🤩","😜","🫡","🤝","📚","✏️","💡","☕","🎓"
];

// =========================================
// AUTH + INIT
// =========================================

async function init() {
    try {
        enhanceWelcomeState();
        const config = await fetch(`${API_BASE}/api/config`).then((response) => response.json()).catch(() => ({}));
        if (!config.attachmentsEnabled) {
            attachBtn.hidden = true;
            fileInput.disabled = true;
        }
        const res = await fetch(`${API_BASE}/api/me`, { headers: authHeaders });
        const data = await res.json();
        if (!res.ok || !data.success) {
            localStorage.removeItem("coveToken");
            window.location.href = "login.html";
            return;
        }
        me = data.user;
        meName.textContent = me.name;
        meUsername.textContent = `@${me.username}`;
        meAvatar.textContent = initials(me.name || me.username);
        installVoiceCallUi();
        connectSocket();
        loadRooms();
        buildEmojiPicker();
    } catch (err) {
        console.error(err);
    }
}

function enhanceWelcomeState() {
    if (!threadEmpty || threadEmpty.querySelector(".welcome-board")) return;
    threadEmpty.insertAdjacentHTML("beforeend", `
        <aside class="welcome-board" aria-label="Getting started">
            <div class="welcome-board-top">
                <span class="welcome-status"><i></i> Your private space is ready</span>
                <span class="welcome-number">01</span>
            </div>
            <button class="welcome-action welcome-action-primary" type="button" id="emptyFindBtn">
                <span class="welcome-action-icon">⌕</span>
                <span><b>Find your people</b><small>Search by username and start a private chat.</small></span>
                <i>↗</i>
            </button>
            <button class="welcome-action" type="button" id="emptyCircleShortcut">
                <span class="welcome-action-icon">◎</span>
                <span><b>Build a circle</b><small>Create an invite-only home for your group.</small></span>
                <i>↗</i>
            </button>
            <div class="welcome-trust">
                <span>⌑</span>
                <p><b>Private by default</b><small>Only invited members can read or join a circle.</small></p>
            </div>
        </aside>`);
    document.getElementById("emptyFindBtn")?.addEventListener("click", () => {
        searchInput.focus();
        searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.getElementById("emptyCircleShortcut")?.addEventListener("click", openCircleModal);
}

function connectSocket() {
    socket = io();
    socket.on("connect", () => socket.emit("auth", token));

    socket.on("new_message", (msg) => {
        if (String(msg.room_id) === String(activeRoomId)) {
            appendMessage(msg);
            scrollMessagesToBottom();
        }
        loadRooms();
    });

    socket.on("member_added", ({ roomId }) => {
        if (String(roomId) === String(activeRoomId)) {
            loadRooms();
            if (!membersModalOverlay.hidden) loadMembers();
        }
    });

    socket.on("member_removed", ({ roomId, email, username }) => {
        if (String(roomId) !== String(activeRoomId)) {
            loadRooms();
            return;
        }
        if (email === me.email) {
            activeRoomId = null;
            activeRoom = null;
            threadActive.hidden = true;
            threadEmpty.hidden = false;
            document.querySelector(".chat-shell").classList.remove("mobile-thread-open");
            showToast("You were removed from this circle.", "error");
        } else {
            showToast(`@${username} was removed from the circle.`, "success");
            if (!membersModalOverlay.hidden) loadMembers();
        }
        loadRooms();
    });

    socket.on("presence_update", ({ roomId, onlineCount: count, onlineEmails = [] }) => {
        if (String(roomId) !== String(activeRoomId)) return;
        currentOnlineEmails = new Set(onlineEmails);
        const label = onlineCount.querySelector("b");
        label.textContent = activeRoom?.type === "circle"
            ? `${count} online`
            : count > 1 ? "Online now" : "Offline";
        onlineCount.classList.toggle("is-online", count > (activeRoom?.type === "circle" ? 0 : 1));
        if (activeRoom?.type === "circle" && !membersModalOverlay.hidden) loadMembers();
    });

    socket.on("call_state", (state) => {
        knownCallStates.set(String(state.roomId), state);
        updateCallButton();
        if (String(state.roomId) === String(activeCallRoomId)) updateVoiceDock(state);
    });
    socket.on("call_participants", async ({ roomId, participants }) => {
        if (String(roomId) !== String(activeCallRoomId)) return;
        for (const participant of participants) await createCallPeer(participant.socketId, true);
    });
    socket.on("call_user_joined", ({ roomId }) => {
        if (String(roomId) === String(activeCallRoomId)) showToast("Someone joined the voice call.", "success");
    });
    socket.on("call_user_left", ({ socketId }) => removeCallPeer(socketId));
    socket.on("call_signal", handleCallSignal);
    socket.on("call_error", (message) => { showToast(message || "Could not join the call.", "error"); endVoiceCall(); });
}

// =========================================
// ROOM LIST (DMs + circles)
// =========================================

async function loadRooms() {
    try {
        const res = await fetch(`${API_BASE}/api/rooms`, { headers: authHeaders });
        const data = await res.json();
        if (!data.success) return;
        if (convoLoading) convoLoading.hidden = true;

        convoList.querySelectorAll(".convo-item").forEach((el) => el.remove());

        if (data.rooms.length === 0) {
            convoEmpty.hidden = false;
            return;
        }
        convoEmpty.hidden = true;

        data.rooms.forEach((r) => {
            const displayName = r.type === "circle" ? r.name : (r.otherUser?.name || r.otherUser?.username || "Unknown");
            const preview = r.last_text || (r.last_file_name ? `📎 ${r.last_file_name}` : "Say hi 👋");
            const stamp = r.last_message_at ? formatRoomTime(r.last_message_at) : "";

            const item = document.createElement("div");
            item.className = "convo-item" + (String(r.id) === String(activeRoomId) ? " active" : "");
            item.innerHTML = `
                <span class="convo-avatar">${r.type === "circle" ? "◎" : initials(displayName)}</span>
                <span class="convo-content"><span class="convo-item-name">${escapeHtml(displayName)}</span><span class="convo-item-preview">${escapeHtml(preview)}</span></span>
                <span class="convo-time">${stamp}</span>`;
            item.addEventListener("click", () => openRoom(r));
            convoList.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        if (convoLoading) convoLoading.hidden = true;
        showToast("Could not load conversations. Try refreshing.", "error");
    }
}

refreshRoomsBtn?.addEventListener("click", loadRooms);

// =========================================
// SEARCH (start a DM)
// =========================================

let searchTimer = null;

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { searchResults.hidden = true; return; }

    searchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(q)}`, { headers: authHeaders });
            const data = await res.json();
            renderSearchResults(data.users || []);
        } catch (err) { console.error(err); }
    }, 250);
});

function renderSearchResults(users) {
    searchResults.innerHTML = "";
    searchResults.hidden = false;
    if (users.length === 0) {
        searchResults.innerHTML = `<div class="search-empty">No users found.</div>`;
        return;
    }
    users.forEach((u) => {
        const item = document.createElement("div");
        item.className = "search-result-item";
        item.innerHTML = `<span class="search-result-name">${escapeHtml(u.name)}</span><span class="search-result-username">@${escapeHtml(u.username)}</span>`;
        item.addEventListener("click", () => startDm(u.username));
        searchResults.appendChild(item);
    });
}

document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) searchResults.hidden = true;
    if (!e.target.closest(".emoji-wrap")) emojiPicker.hidden = true;
});

async function startDm(username) {
    try {
        const res = await fetch(`${API_BASE}/api/rooms/start-dm`, {
            method: "POST", headers: authHeaders, body: JSON.stringify({ username }),
        });
        const data = await res.json();
        if (!data.success) return;

        searchInput.value = "";
        searchResults.hidden = true;

        openRoom({ id: data.room.id, type: "dm", otherUser: data.room.otherUser });
        loadRooms();
    } catch (err) { console.error(err); }
}

// =========================================
// CIRCLES
// =========================================

createCircleBtn.addEventListener("click", () => {
    circleNameInput.value = "";
    circleMembersInput.value = "";
    circleCreateStatus.textContent = "";
    circleCreateStatus.className = "member-check-status";
    circleModalOverlay.hidden = false;
});

function openCircleModal() { createCircleBtn.click(); }
mobileCreateCircleBtn?.addEventListener("click", openCircleModal);
emptyCreateBtn?.addEventListener("click", openCircleModal);

circleCancelBtn.addEventListener("click", () => (circleModalOverlay.hidden = true));

circleCreateBtn.addEventListener("click", async () => {
    const name = circleNameInput.value.trim();
    if (!name) {
        circleCreateStatus.textContent = "Circle name is required.";
        circleCreateStatus.className = "member-check-status bad";
        return;
    }

    const usernames = circleMembersInput.value.split(",").map((s) => s.trim()).filter(Boolean);

    circleCreateStatus.textContent = "Creating...";
    circleCreateStatus.className = "member-check-status";
    circleCreateBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/api/circles/create`, {
            method: "POST", headers: authHeaders, body: JSON.stringify({ name, usernames }),
        });
        const data = await res.json();
        circleCreateBtn.disabled = false;

        if (!data.success) {
            circleCreateStatus.textContent = data.message || "Could not create circle.";
            circleCreateStatus.className = "member-check-status bad";
            return;
        }

        circleModalOverlay.hidden = true;
        openRoom({ id: data.room.id, type: "circle", name: data.room.name });
        loadRooms();
    } catch (err) {
        console.error(err);
        circleCreateBtn.disabled = false;
        circleCreateStatus.textContent = "Could not reach the server.";
        circleCreateStatus.className = "member-check-status bad";
    }
});

addMemberBtn.addEventListener("click", () => {
    addMemberInput.value = "";
    addMemberStatus.textContent = "";
    addMemberStatus.className = "member-check-status";
    addMemberOverlay.hidden = false;
});
addMemberCancelBtn.addEventListener("click", () => (addMemberOverlay.hidden = true));

let addMemberCheckTimer = null;

addMemberInput.addEventListener("input", () => {
    clearTimeout(addMemberCheckTimer);
    const username = addMemberInput.value.trim();

    if (!username) {
        addMemberStatus.textContent = "";
        addMemberStatus.className = "member-check-status";
        return;
    }

    addMemberCheckTimer = setTimeout(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(username)}`, { headers: authHeaders });
            const data = await res.json();
            const exactMatch = (data.users || []).find((u) => u.username.toLowerCase() === username.toLowerCase());

            if (exactMatch) {
                addMemberStatus.textContent = `\u2713 ${exactMatch.name} (@${exactMatch.username})`;
                addMemberStatus.className = "member-check-status ok";
            } else {
                addMemberStatus.textContent = "No user with that exact username.";
                addMemberStatus.className = "member-check-status bad";
            }
        } catch (err) {
            console.error(err);
        }
    }, 350);
});

addMemberConfirmBtn.addEventListener("click", async () => {
    const username = addMemberInput.value.trim();
    if (!username || !activeRoomId) return;

    try {
        const res = await fetch(`${API_BASE}/api/circles/${activeRoomId}/add-member`, {
            method: "POST", headers: authHeaders, body: JSON.stringify({ username }),
        });
        const data = await res.json();
        addMemberOverlay.hidden = true;
        if (!data.success) showToast(data.message || "Could not add that person.", "error");
        else showToast("Person added to the circle.", "success");
    } catch (err) { console.error(err); showToast("Could not add that person.", "error"); }
});

// =========================================
// OPEN A ROOM + LOAD HISTORY
// =========================================

async function openRoom(room) {
    activeRoomId = room.id;
    activeRoom = room;
    activeRoomIsOwner = false;
    currentOnlineEmails = new Set();
    onlineCount.querySelector("b").textContent = "Checking online…";
    updateCallButton();

    threadEmpty.hidden = true;
    threadActive.hidden = false;
    document.querySelector(".chat-shell").classList.add("mobile-thread-open");

    if (room.type === "circle") {
        threadName.textContent = room.name;
        threadUsername.textContent = `${room.member_count || ""} member circle`.trim();
        threadAvatar.textContent = "◎";
        addMemberBtn.hidden = true;
        membersBtn.hidden = false;
        loadMembers();
    } else {
        threadName.textContent = room.otherUser?.name || room.otherUser?.username || "";
        threadUsername.textContent = room.otherUser ? `@${room.otherUser.username}` : "";
        threadAvatar.textContent = initials(room.otherUser?.name || room.otherUser?.username || "C");
        addMemberBtn.hidden = true;
        membersBtn.hidden = true;
    }

    messagesEl.innerHTML = "";
    renderRoomIntro(room);
    if (messageLoader) { messagesEl.appendChild(messageLoader); messageLoader.hidden = false; }
    if (socket) socket.emit("join_room", room.id);

    try {
        const res = await fetch(`${API_BASE}/api/rooms/${room.id}/messages`, { headers: authHeaders });
        const data = await res.json();
        if (data.success) {
            if (messageLoader) messageLoader.hidden = true;
            data.messages.forEach(appendMessage);
            scrollMessagesToBottom();
        }
    } catch (err) { console.error(err); if (messageLoader) messageLoader.hidden = true; showToast("Could not load messages.", "error"); }

    loadRooms();
}

// =========================================
// PRIVATE VOICE CALLS — WebRTC mesh + Socket.IO signalling
// =========================================

function installVoiceCallUi() {
    if (document.getElementById("voiceCallBtn")) return;
    const button = document.createElement("button");
    button.id = "voiceCallBtn";
    button.className = "voice-call-btn";
    button.type = "button";
    button.innerHTML = `<span class="voice-call-icon">◖</span><b>Voice call</b><i hidden></i>`;
    button.addEventListener("click", () => activeCallRoomId ? endVoiceCall() : startVoiceCall());
    onlineCount.insertAdjacentElement("afterend", button);

    document.body.insertAdjacentHTML("beforeend", `
        <section class="voice-dock" id="voiceDock" hidden aria-live="polite">
            <div class="voice-dock-pulse"><span></span><span></span><b>◖</b></div>
            <div class="voice-dock-copy"><small>VOICE ROOM</small><strong id="voiceDockName">Conversation</strong><span id="voiceDockStatus">Connecting…</span></div>
            <div class="voice-people" id="voicePeople"></div>
            <button type="button" class="voice-control" id="voiceMuteBtn" title="Mute microphone">♩</button>
            <button type="button" class="voice-control voice-end" id="voiceEndBtn" title="Leave call">×</button>
        </section>`);
    document.getElementById("voiceMuteBtn").addEventListener("click", toggleCallMute);
    document.getElementById("voiceEndBtn").addEventListener("click", endVoiceCall);
}

async function startVoiceCall() {
    if (!activeRoomId || !socket) return;
    if (!navigator.mediaDevices?.getUserMedia) return showToast("Voice calls are not supported in this browser.", "error");
    try {
        localCallStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        activeCallRoomId = String(activeRoomId);
        callMuted = false;
        const dock = document.getElementById("voiceDock");
        dock.hidden = false;
        document.getElementById("voiceDockName").textContent = activeRoom?.type === "circle" ? activeRoom.name : (activeRoom?.otherUser?.name || "Private call");
        document.getElementById("voiceDockStatus").textContent = "Connecting securely…";
        socket.emit("call_join", activeCallRoomId);
        updateCallButton();
    } catch (error) {
        showToast(error.name === "NotAllowedError" ? "Microphone permission is required for voice calls." : "Could not access your microphone.", "error");
    }
}

function createPeerConnection(peerId) {
    if (callPeers.has(peerId)) return callPeers.get(peerId);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] });
    localCallStream?.getTracks().forEach((track) => peer.addTrack(track, localCallStream));
    peer.onicecandidate = ({ candidate }) => {
        if (candidate) socket.emit("call_signal", { to: peerId, roomId: activeCallRoomId, signal: { candidate } });
    };
    peer.ontrack = ({ streams }) => {
        let audio = document.getElementById(`call-audio-${peerId}`);
        if (!audio) { audio = document.createElement("audio"); audio.id = `call-audio-${peerId}`; audio.autoplay = true; audio.playsInline = true; document.body.appendChild(audio); }
        audio.srcObject = streams[0];
    };
    peer.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) removeCallPeer(peerId);
    };
    callPeers.set(peerId, peer);
    return peer;
}

async function createCallPeer(peerId, makeOffer = false) {
    const peer = createPeerConnection(peerId);
    if (makeOffer) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("call_signal", { to: peerId, roomId: activeCallRoomId, signal: { description: peer.localDescription } });
    }
    return peer;
}

async function handleCallSignal({ roomId, from, signal }) {
    if (String(roomId) !== String(activeCallRoomId)) return;
    try {
        const peer = await createCallPeer(from);
        if (signal.description) {
            await peer.setRemoteDescription(signal.description);
            if (signal.description.type === "offer") {
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                socket.emit("call_signal", { to: from, roomId: activeCallRoomId, signal: { description: peer.localDescription } });
            }
        } else if (signal.candidate) await peer.addIceCandidate(signal.candidate);
    } catch (error) { console.error("Voice call signal error:", error); }
}

function removeCallPeer(peerId) {
    callPeers.get(peerId)?.close();
    callPeers.delete(peerId);
    document.getElementById(`call-audio-${peerId}`)?.remove();
}

function toggleCallMute() {
    callMuted = !callMuted;
    localCallStream?.getAudioTracks().forEach((track) => { track.enabled = !callMuted; });
    const button = document.getElementById("voiceMuteBtn");
    button.classList.toggle("muted", callMuted);
    button.textContent = callMuted ? "M" : "♩";
    button.title = callMuted ? "Unmute microphone" : "Mute microphone";
}

function endVoiceCall() {
    if (activeCallRoomId && socket) socket.emit("call_leave");
    callPeers.forEach((_, peerId) => removeCallPeer(peerId));
    localCallStream?.getTracks().forEach((track) => track.stop());
    localCallStream = null;
    activeCallRoomId = null;
    callMuted = false;
    const dock = document.getElementById("voiceDock");
    if (dock) dock.hidden = true;
    updateCallButton();
}

function updateCallButton() {
    const button = document.getElementById("voiceCallBtn");
    if (!button) return;
    const state = knownCallStates.get(String(activeRoomId));
    const inThisCall = String(activeCallRoomId) === String(activeRoomId);
    button.classList.toggle("active", inThisCall);
    button.classList.toggle("has-call", !inThisCall && !!state?.active);
    button.querySelector("b").textContent = inThisCall ? "Leave call" : state?.active ? `Join call · ${state.participantCount}` : "Voice call";
    const badge = button.querySelector("i");
    badge.hidden = !state?.active;
}

function updateVoiceDock(state) {
    const status = document.getElementById("voiceDockStatus");
    if (status) status.textContent = `${state.participantCount} ${state.participantCount === 1 ? "person" : "people"} connected`;
    const people = document.getElementById("voicePeople");
    if (people) people.innerHTML = (state.participantEmails || []).slice(0, 4).map((email) => `<span title="${escapeHtml(email)}">${initials(email.split("@")[0])}</span>`).join("");
}

function renderRoomIntro(room) {
    const intro = document.createElement("div");
    intro.className = "room-intro";
    const title = room.type === "circle" ? room.name : (room.otherUser?.name || room.otherUser?.username || "Conversation");
    intro.innerHTML = `
        <span class="room-intro-icon">${room.type === "circle" ? "◎" : initials(title)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${room.type === "circle" ? "This is the beginning of your private circle." : "This is the beginning of your private conversation."}</p>
        <span class="room-intro-secure">⌑ &nbsp; Only members of this chat can see messages</span>`;
    messagesEl.appendChild(intro);
}

function appendMessage(msg) {
    const mine = msg.sender_email === me.email;
    const div = document.createElement("div");
    div.className = "msg " + (mine ? "msg-mine" : "msg-theirs");

    const time = formatTime(msg.created_at);
    let bodyHtml = "";

    if (msg.file_url && msg.file_type === "image") {
        bodyHtml = `<a href="${msg.file_url}" target="_blank" rel="noopener"><img class="msg-image" src="${msg.file_url}" alt="${escapeHtml(msg.file_name || "image")}"></a>`;
    } else if (msg.file_url) {
        bodyHtml = `<a class="msg-file" href="${msg.file_url}" target="_blank" rel="noopener">📎 ${escapeHtml(msg.file_name || "Download file")}</a>`;
    } else {
        bodyHtml = linkify(escapeHtml(msg.text || ""));
    }

    div.innerHTML = `${bodyHtml}<span class="msg-time">${time}</span>`;
    messagesEl.appendChild(div);
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

// Turns plain URLs inside already-escaped text into clickable links.
function linkify(escapedText) {
    return escapedText.replace(URL_REGEX, (url) => {
        return `<a class="inline-link" href="${url}" target="_blank" rel="noopener">${url}</a>`;
    });
}

function extractUrls(text) {
    if (!text) return [];
    return text.match(URL_REGEX) || [];
}

function formatTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollMessagesToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// =========================================
// SEND TEXT
// =========================================

composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !activeRoomId || !socket) return;
    socket.emit("send_message", { roomId: activeRoomId, text });
    messageInput.value = "";
    autoSizeComposer();
});

messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        composerForm.requestSubmit();
    }
});
messageInput.addEventListener("input", autoSizeComposer);
function autoSizeComposer() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

mobileBackBtn?.addEventListener("click", () => {
    document.querySelector(".chat-shell").classList.remove("mobile-thread-open");
});

// =========================================
// FILE / IMAGE UPLOAD
// =========================================

attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file || !activeRoomId) return;
    await uploadSelectedFile(file);
    fileInput.value = "";
});

async function uploadSelectedFile(file) {
    if (file.size > 15 * 1024 * 1024) {
        showToast("That file is larger than the 15 MB limit.", "error");
        return;
    }
    uploadFileName.textContent = file.name;
    uploadFileMeta.textContent = `Uploading · ${formatBytes(file.size)}`;
    uploadPreview.hidden = false;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch(`${API_BASE}/api/rooms/${activeRoomId}/upload`, {
            method: "POST", headers: authHeadersNoJson, body: formData,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "Upload failed.");
        uploadFileMeta.textContent = "Shared successfully";
        showToast("File shared successfully.", "success");
    } catch (err) {
        console.error(err);
        showToast(err.message || "Upload failed — check your connection.", "error");
    }
    setTimeout(() => (uploadPreview.hidden = true), 1200);
}

cancelUploadBtn?.addEventListener("click", () => {
    fileInput.value = "";
    uploadPreview.hidden = true;
});

["dragenter", "dragover"].forEach((name) => document.addEventListener(name, (event) => {
    event.preventDefault();
    if (activeRoomId) dropOverlay.hidden = false;
}));
["dragleave", "drop"].forEach((name) => document.addEventListener(name, (event) => {
    event.preventDefault();
    if (name === "dragleave" && event.relatedTarget) return;
    dropOverlay.hidden = true;
}));
document.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file && activeRoomId) uploadSelectedFile(file);
});

// =========================================
// EMOJI PICKER
// =========================================

function buildEmojiPicker() {
    emojiPicker.innerHTML = "";
    EMOJI_SET.forEach((emo) => {
        const span = document.createElement("span");
        span.className = "emoji-option";
        span.textContent = emo;
        span.addEventListener("click", () => {
            messageInput.value += emo;
            messageInput.focus();
        });
        emojiPicker.appendChild(span);
    });
}

emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.hidden = !emojiPicker.hidden;
});

// =========================================
// LOGOUT
// =========================================

logoutBtn.addEventListener("click", async () => {
    try { await fetch(`${API_BASE}/api/logout`, { method: "POST", headers: authHeaders }); } catch (err) { console.error(err); }
    localStorage.removeItem("coveToken");
    localStorage.removeItem("coveUser");
    window.location.href = "index.html";
});

// =========================================
// SHARED MEDIA & LINKS PANEL
// =========================================

sharedBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;
    sharedModalOverlay.hidden = false;
    await loadSharedContent();
});

sharedCloseBtn.addEventListener("click", () => (sharedModalOverlay.hidden = true));

// =========================================
// CIRCLE MEMBERS PANEL
// =========================================

membersBtn.addEventListener("click", async () => {
    if (!activeRoomId) return;
    membersModalTitle.textContent = activeRoom?.name ? `${activeRoom.name} — members` : "Circle members";
    membersModalOverlay.hidden = false;
    await loadMembers();
});

onlineCount.addEventListener("click", async () => {
    if (!activeRoomId || activeRoom?.type !== "circle") return;
    membersModalTitle.textContent = activeRoom?.name ? `${activeRoom.name} — members` : "Circle members";
    membersModalOverlay.hidden = false;
    await loadMembers();
});

membersCloseBtn.addEventListener("click", () => (membersModalOverlay.hidden = true));

async function loadMembers() {
    try {
        const res = await fetch(`${API_BASE}/api/rooms/${activeRoomId}/members`, { headers: authHeaders });
        const data = await res.json();
        if (!data.success) return;
        activeRoomIsOwner = !!data.isOwner;
        addMemberBtn.hidden = activeRoom?.type !== "circle" || !activeRoomIsOwner;

        membersList.innerHTML = "";
        data.members.forEach((m) => {
            const row = document.createElement("div");
            row.className = "member-row";
            row.dataset.initials = initials(m.name || m.username);
            const isMe = m.email === me.email;
            const isOnline = currentOnlineEmails.has(m.email);
            row.innerHTML = `
                <span class="member-row-name">${escapeHtml(m.name)} ${isMe ? '<span class="member-row-you">(you)</span>' : ""} ${activeRoom?.created_by === m.email ? '<span class="member-row-admin">Admin</span>' : ""}</span>
                <span class="member-row-username">@${escapeHtml(m.username)} <i class="member-presence ${isOnline ? "online" : ""}">${isOnline ? "Online" : "Offline"}</i></span>
                ${activeRoomIsOwner && !isMe ? `<button class="remove-member-btn" type="button" data-username="${escapeHtml(m.username)}">Remove</button>` : ""}
            `;
            membersList.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

membersList.addEventListener("click", async (event) => {
    const button = event.target.closest(".remove-member-btn");
    if (!button || !activeRoomId) return;
    const username = button.dataset.username;
    if (!window.confirm(`Remove @${username} from this circle?`)) return;

    button.disabled = true;
    button.textContent = "Removing…";
    try {
        const res = await fetch(`${API_BASE}/api/circles/${activeRoomId}/members/${encodeURIComponent(username)}`, {
            method: "DELETE",
            headers: authHeaders,
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Could not remove this person.");
        showToast(`@${username} removed from the circle.`, "success");
        await loadMembers();
    } catch (err) {
        showToast(err.message || "Could not remove this person.", "error");
        button.disabled = false;
        button.textContent = "Remove";
    }
});

sharedTabImages.addEventListener("click", () => {
    sharedTabImages.classList.add("active");
    sharedTabLinks.classList.remove("active");
    sharedImagesPanel.hidden = false;
    sharedLinksPanel.hidden = true;
});

sharedTabLinks.addEventListener("click", () => {
    sharedTabLinks.classList.add("active");
    sharedTabImages.classList.remove("active");
    sharedLinksPanel.hidden = false;
    sharedImagesPanel.hidden = true;
});

async function loadSharedContent() {
    try {
        const res = await fetch(`${API_BASE}/api/rooms/${activeRoomId}/messages`, { headers: authHeaders });
        const data = await res.json();
        if (!data.success) return;

        const images = data.messages.filter((m) => m.file_url && m.file_type === "image");
        const linkMessages = data.messages.filter((m) => m.text && extractUrls(m.text).length > 0);

        sharedImageGrid.innerHTML = "";
        sharedImagesEmpty.hidden = images.length > 0;
        images.forEach((m) => {
            const img = document.createElement("img");
            img.src = m.file_url;
            img.alt = m.file_name || "shared image";
            img.addEventListener("click", () => window.open(m.file_url, "_blank"));
            sharedImageGrid.appendChild(img);
        });

        sharedLinkList.innerHTML = "";
        const allLinks = [];
        linkMessages.forEach((m) => {
            extractUrls(m.text).forEach((url) => allLinks.push({ url, sender: m.sender_email }));
        });
        sharedLinksEmpty.hidden = allLinks.length > 0;
        allLinks.forEach(({ url, sender }) => {
            const a = document.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener";
            a.className = "shared-link-item";
            const senderLabel = sender === me.email ? "You" : sender;
            a.innerHTML = `<span class="link-sender">${escapeHtml(senderLabel)}</span>${escapeHtml(url)}`;
            sharedLinkList.appendChild(a);
        });
    } catch (err) {
        console.error(err);
    }
}

// =========================================
// UTIL
// =========================================

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function initials(value) {
    return String(value || "C").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatRoomTime(iso) {
    const date = new Date(iso);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function showToast(message, type = "") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3400);
}

document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => {
    document.getElementById(button.dataset.close).hidden = true;
}));
document.querySelectorAll(".modal-overlay").forEach((overlay) => overlay.addEventListener("click", (event) => {
    if (event.target === overlay) overlay.hidden = true;
}));
document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.focus();
    }
    if (event.key === "Escape") {
        document.querySelectorAll(".modal-overlay:not([hidden])").forEach((overlay) => (overlay.hidden = true));
        emojiPicker.hidden = true;
    }
});
window.addEventListener("beforeunload", () => {
    localCallStream?.getTracks().forEach((track) => track.stop());
});

init();
