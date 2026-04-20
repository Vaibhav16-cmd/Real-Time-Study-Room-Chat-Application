const API = "http://localhost:5000";

let token = localStorage.getItem("token");
let socket;
let localStream;
let peers = {};
let isPrivate = false;
let roomUsers = [];
let currentRoom = null;
let hasStartedCall = false;
let pendingPrivateJoinRoomId = null;
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  return (name || "U").trim().charAt(0).toUpperCase() || "U";
}

function requireAuth() {
  token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/login";
    return false;
  }
  return true;
}

function setStatus(message, isError = false) {
  const statusNode = document.getElementById("msg");
  if (!statusNode) {
    return;
  }
  statusNode.textContent = message || "";
  statusNode.classList.toggle("error-text", isError);
  statusNode.classList.toggle("success-text", !isError && Boolean(message));
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) {
    return;
  }

  const nextType = input.type === "password" ? "text" : "password";
  input.type = nextType;

  if (button) {
    button.textContent = nextType === "password" ? "Show" : "Hide";
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.auth !== false && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.message || "Request failed");
  }

  return data;
}

async function register() {
  const name = document.getElementById("name")?.value.trim();
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!name || !email || !password) {
    setStatus("All fields are required.", true);
    return;
  }

  try {
    const data = await request("/api/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ name, email, password })
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.id);
    localStorage.setItem("userName", data.name);
    window.location.href = "/rooms";
  } catch (error) {
    setStatus(error.message || "Could not create account.", true);
  }
}

async function login() {
  const email = document.getElementById("email")?.value.trim();
  const password = document.getElementById("password")?.value;

  if (!email || !password) {
    setStatus("All fields are required.", true);
    return;
  }

  try {
    const data = await request("/api/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("userId", data.id);
    localStorage.setItem("userName", data.name);
    window.location.href = "/rooms";
  } catch (error) {
    setStatus(error.message || "Login failed.", true);
  }
}

function logout() {
  socket?.disconnect();

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  localStorage.removeItem("roomId");
  localStorage.clear();
  window.location.href = "/login";
}

function goToModeration() {
  window.location.href = "/moderation";
}

function goBackToRooms() {
  window.location.href = "/rooms";
}

function createRoomPrompt() {
  document.getElementById("roomModal")?.classList.remove("hidden");
  document.getElementById("roomNameInput")?.focus();
}

function closeModal() {
  document.getElementById("roomModal")?.classList.add("hidden");
}

function openPrivateJoinModal(roomId) {
  pendingPrivateJoinRoomId = roomId;
  const modal = document.getElementById("joinPrivateModal");
  const input = document.getElementById("joinPrivatePassword");
  const error = document.getElementById("joinPrivateError");
  const toggle = document.querySelector("#joinPrivateModal .password-toggle");

  if (input) {
    input.value = "";
    input.type = "password";
  }

  if (toggle) {
    toggle.textContent = "Show";
  }

  if (error) {
    error.textContent = "";
    error.classList.add("hidden");
  }

  modal?.classList.remove("hidden");
  input?.focus();
}

function closePrivateJoinModal() {
  pendingPrivateJoinRoomId = null;
  document.getElementById("joinPrivateModal")?.classList.add("hidden");
}

function syncRoomAccessUi() {
  const privateGroup = document.getElementById("privatePasswordGroup");
  const publicBtn = document.getElementById("publicBtn");
  const privateBtn = document.getElementById("privateBtn");
  const createButton = document.getElementById("createRoomButton");

  if (privateGroup) {
    privateGroup.classList.toggle("hidden", !isPrivate);
  }

  publicBtn?.classList.toggle("active", !isPrivate);
  privateBtn?.classList.toggle("active", isPrivate);

  if (createButton) {
    createButton.textContent = isPrivate ? "Create Private Room" : "Create Public Room";
    createButton.classList.toggle("private-cta", isPrivate);
  }
}

function setPublic() {
  isPrivate = false;
  syncRoomAccessUi();
}

function setPrivate() {
  isPrivate = true;
  syncRoomAccessUi();
}

async function createRoomFinal() {
  const name = document.getElementById("roomNameInput")?.value.trim();
  const description = document.getElementById("roomDescInput")?.value.trim();
  const password = document.getElementById("roomPassword")?.value.trim();

  if (!name) {
    alert("Room name is required.");
    return;
  }

  if (isPrivate && (!password || password.length < 4)) {
    alert("Private rooms need a password with at least 4 characters.");
    return;
  }

  try {
    const room = await request("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        name,
        description,
        isPrivate,
        password
      })
    });

    document.getElementById("roomNameInput").value = "";
    document.getElementById("roomDescInput").value = "";
    const passwordField = document.getElementById("roomPassword");
    if (passwordField) {
      passwordField.value = "";
    }
    setPublic();
    closeModal();
    localStorage.setItem("roomId", room._id);
    window.location.href = "/chat";
  } catch (error) {
    alert(error.message || "Could not create room.");
  }
}

function renderRoomsHeader() {
  const userName = localStorage.getItem("userName") || "User";
  const avatarLetter = getInitials(userName);

  const usernameDisplay = document.getElementById("usernameDisplay");
  const avatar = document.getElementById("avatarLetter");

  if (usernameDisplay) {
    usernameDisplay.textContent = userName;
  }

  if (avatar) {
    avatar.textContent = avatarLetter;
  }
}

function renderRoomCard(room) {
  const visibilityLabel = room.isPrivate ? "PRIVATE" : "PUBLIC";
  const description = room.description || "General discussion for everyone";
  const count = room.members?.length || 0;
  const createdAt = new Date(room.createdAt).toLocaleDateString();

  return `
    <article class="room-card ${room.isPrivate ? "private-room-card" : ""}">
      <div class="room-card-top">
        <div class="room-icon-box">#</div>
        <span class="room-visibility">${visibilityLabel}</span>
      </div>
      <h3>${escapeHtml(room.name)}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="room-meta">
        <span>${count} members</span>
        <span>${createdAt}</span>
      </div>
      <button class="primary-btn full-width" type="button" onclick="joinRoom('${room._id}', ${room.isPrivate})">Join Room</button>
    </article>
  `;
}

async function loadRooms() {
  if (!requireAuth()) {
    return;
  }

  renderRoomsHeader();
  syncRoomAccessUi();

  try {
    const rooms = await request("/api/rooms");
    const container = document.getElementById("roomsContainer");
    const emptyState = document.getElementById("roomsEmpty");

    if (!container) {
      return;
    }

    container.innerHTML = rooms.map(renderRoomCard).join("");

    if (emptyState) {
      emptyState.classList.toggle("hidden", rooms.length > 0);
    }
  } catch (error) {
    console.error(error);
  }
}

async function joinRoom(roomId, requiresPassword) {
  if (!roomId) {
    return;
  }

  try {
    if (requiresPassword) {
      openPrivateJoinModal(roomId);
      return;
    }

    await request(`/api/rooms/${roomId}/join`, { method: "POST" });
    localStorage.setItem("roomId", roomId);
    window.location.href = "/chat";
  } catch (error) {
    alert(error.message || "Could not join room.");
  }
}

async function confirmPrivateJoin() {
  const roomId = pendingPrivateJoinRoomId;
  const passwordInput = document.getElementById("joinPrivatePassword");
  const error = document.getElementById("joinPrivateError");
  const password = passwordInput?.value.trim();

  if (!roomId) {
    return;
  }

  if (!password) {
    if (error) {
      error.textContent = "Password is required.";
      error.classList.remove("hidden");
    }
    return;
  }

  try {
    await request("/api/rooms/join-private", {
      method: "POST",
      body: JSON.stringify({ roomId, password })
    });

    closePrivateJoinModal();
    await request(`/api/rooms/${roomId}/join`, { method: "POST" });
    localStorage.setItem("roomId", roomId);
    window.location.href = "/chat";
  } catch (requestError) {
    if (error) {
      error.textContent = requestError.message || "Wrong password.";
      error.classList.remove("hidden");
    }
  }
}

function updateParticipantUi() {
  const count = roomUsers.length || 1;
  const onlineCount = document.getElementById("onlineCount");
  const participantStatus = document.getElementById("participantStatus");
  const participantBadge = document.getElementById("participantCountBadge");

  if (onlineCount) {
    onlineCount.textContent = `${count} online`;
  }

  if (participantBadge) {
    participantBadge.textContent = String(count);
  }

  if (participantStatus) {
    participantStatus.textContent = count > 1 ? `${count - 1} other participant${count > 2 ? "s" : ""} already joined` : "No one else is here yet";
  }
}

async function loadRoomDetails(roomId) {
  currentRoom = await request(`/api/rooms/${roomId}`);

  const roomLabel = `# ${currentRoom.name}`;
  document.getElementById("roomTitle").textContent = roomLabel;
  document.getElementById("callRoomName").textContent = roomLabel;
}

function renderChatIdentity() {
  const userName = localStorage.getItem("userName") || "User";
  const initial = getInitials(userName);

  const previewUserName = document.getElementById("previewUserName");
  const previewAvatar = document.getElementById("previewAvatar");
  const chatAvatarLetter = document.getElementById("chatAvatarLetter");

  if (previewUserName) {
    previewUserName.textContent = userName;
  }
  if (previewAvatar) {
    previewAvatar.textContent = initial;
  }
  if (chatAvatarLetter) {
    chatAvatarLetter.textContent = initial;
  }
}

function addSystemMessage(text) {
  const container = document.getElementById("messages");
  if (!container) {
    return;
  }

  const item = document.createElement("div");
  item.className = "system-message";
  item.textContent = text;
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function formatMessageTime(value) {
  return new Date(value || Date.now()).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function addMessage(message) {
  if (!message || !message.sender) {
    return;
  }

  const container = document.getElementById("messages");
  if (!container) {
    return;
  }

  const item = document.createElement("article");
  const isMine = message.sender._id === localStorage.getItem("userId");
  const status = message.moderation?.status || "approved";
  item.className = `chat-message ${isMine ? "mine" : ""} ${status === "flagged" ? "flagged-message" : ""}`;

  const badge = status === "flagged" ? `<span class="message-flag">FLAGGED</span>` : "";
  const moderationNote = status === "flagged" && message.moderation?.reason
    ? `<p class="message-reason">${escapeHtml(message.moderation.reason)}</p>`
    : "";
  const removedNote = status === "removed"
    ? `<p class="message-reason">Removed by moderation.</p>`
    : "";

  item.innerHTML = `
    <div class="message-meta-row">
      <strong>${escapeHtml(isMine ? "You" : message.sender.name)}</strong>
      <span>${formatMessageTime(message.createdAt)}</span>
      ${badge}
    </div>
    <div class="message-bubble ${status === "removed" ? "removed-bubble" : ""}">${escapeHtml(message.content)}</div>
    ${moderationNote}
    ${removedNote}
  `;

  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

async function loadMessages() {
  const roomId = localStorage.getItem("roomId");
  if (!roomId) {
    return;
  }

  try {
    const messages = await request(`/api/messages/${roomId}`);
    const container = document.getElementById("messages");
    if (!container) {
      return;
    }

    container.innerHTML = "";
    messages.forEach(addMessage);
  } catch (error) {
    console.error(error);
  }
}

function bindSocket(roomId) {
  socket = io(API);

  socket.on("connect", () => {
    socket.emit("joinRoom", {
      roomId,
      name: localStorage.getItem("userName") || "User"
    });
  });

  socket.on("roomUsers", (users) => {
    roomUsers = Array.isArray(users) ? users : [];
    updateParticipantUi();
  });

  socket.on("notification", (text) => {
    addSystemMessage(text);
  });

  socket.on("receiveMessage", (message) => {
    addMessage(message);
  });

  socket.on("user-connected", async (userId) => {
    if (hasStartedCall && localStream) {
      await createPeer(userId, true);
    }
  });

  socket.on("offer", async ({ offer, from }) => {
    if (!localStream) {
      const started = await startVideo(true);
      if (!started) {
        return;
      }
    }

    hasStartedCall = true;

    const peer = await createPeer(from, false);
    if (!peer) {
      return;
    }

    await peer.setRemoteDescription(offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    socket.emit("answer", { answer, to: from });
  });

  socket.on("answer", async ({ answer, from }) => {
    if (peers[from]) {
      await peers[from].setRemoteDescription(answer);
    }
  });

  socket.on("ice-candidate", ({ candidate, from }) => {
    if (peers[from] && candidate) {
      peers[from].addIceCandidate(candidate).catch(() => {});
    }
  });

  socket.on("user-disconnected", (userId) => {
    peers[userId]?.close();
    delete peers[userId];
    document.getElementById(`video-${userId}`)?.remove();
  });
}

function ensureCallLayout() {
  document.getElementById("prejoinView")?.classList.add("hidden");
  document.getElementById("callView")?.classList.remove("hidden");
}

async function startVideo(silent = false) {
  if (localStream) {
    ensureCallLayout();
    return true;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localVideo").srcObject = localStream;
    updateMediaButtons();
    ensureCallLayout();
    return true;
  } catch (error) {
    if (!silent) {
      alert("Camera or microphone access was denied.");
    }
    return false;
  }
}

async function createPeer(userId, shouldCreateOffer) {
  if (!localStream) {
    return null;
  }

  if (peers[userId]) {
    return peers[userId];
  }

  const peer = new RTCPeerConnection(rtcConfig);
  peers[userId] = peer;

  localStream.getTracks().forEach((track) => {
    peer.addTrack(track, localStream);
  });

  peer.ontrack = (event) => {
    if (document.getElementById(`video-${userId}`)) {
      return;
    }

    const tile = document.createElement("div");
    tile.className = "video-tile remote-tile";
    tile.id = `video-${userId}`;
    tile.innerHTML = `<video autoplay playsinline></video><span class="tile-label">Guest</span>`;
    tile.querySelector("video").srcObject = event.streams[0];
    document.getElementById("videoGrid")?.appendChild(tile);
  };

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { candidate: event.candidate, to: userId });
    }
  };

  if (shouldCreateOffer) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit("offer", { offer, to: userId });
  }

  return peer;
}

async function startCallFlow() {
  const started = await startVideo(false);
  if (!started) {
    return;
  }

  hasStartedCall = true;
  ensureCallLayout();

  Object.keys(peers).forEach((peerId) => {
    peers[peerId].close();
    delete peers[peerId];
  });

  const remoteTiles = document.querySelectorAll(".remote-tile");
  remoteTiles.forEach((tile) => tile.remove());

  roomUsers
    .filter((user) => user.socketId !== socket.id)
    .forEach((user) => {
      createPeer(user.socketId, true);
    });
}

function updateMediaButtons() {
  const muteButton = document.getElementById("muteButton");
  const cameraButton = document.getElementById("cameraButton");
  const audioEnabled = Boolean(localStream?.getAudioTracks()[0]?.enabled);
  const videoEnabled = Boolean(localStream?.getVideoTracks()[0]?.enabled);

  if (muteButton) {
    muteButton.textContent = audioEnabled ? "Mute" : "Unmute";
  }

  if (cameraButton) {
    cameraButton.textContent = videoEnabled ? "Camera" : "Camera Off";
  }
}

function toggleMute() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) {
    return;
  }
  track.enabled = !track.enabled;
  updateMediaButtons();
}

function toggleCamera() {
  const track = localStream?.getVideoTracks()[0];
  if (!track) {
    return;
  }
  track.enabled = !track.enabled;
  updateMediaButtons();
}

function toggleChatPanel() {
  const panel = document.getElementById("chatPanel");
  panel?.classList.toggle("chat-panel-open");
}

async function leaveRoom() {
  const roomId = localStorage.getItem("roomId");

  if (roomId && token) {
    try {
      await request(`/api/rooms/${roomId}/leave`, { method: "POST" });
    } catch (error) {
      console.error(error);
    }
  }

  socket?.disconnect();

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  Object.values(peers).forEach((peer) => peer.close());
  peers = {};
  hasStartedCall = false;
  localStorage.removeItem("roomId");
  window.location.href = "/rooms";
}

function renderModerationCard(message) {
  const sender = message.sender?.name || "Unknown";
  const reason = message.moderation?.reason || "AI Guardian flagged this message.";
  const category = message.moderation?.category || "unspecified";
  const createdAt = new Date(message.createdAt).toLocaleString();

  return `
    <article class="review-card">
      <div class="review-card-header">
        <div>
          <span class="review-tag">${escapeHtml(category)}</span>
          <strong>${escapeHtml(sender)}</strong>
          <span class="review-time">${createdAt}</span>
        </div>
      </div>
      <p class="review-reason">${escapeHtml(reason)}</p>
      <div class="review-content">${escapeHtml(message.content)}</div>
      <div class="review-actions">
        <button class="ghost-btn" type="button" onclick="approveMessage('${message._id}')">Approve (False Positive)</button>
        <button class="danger-btn" type="button" onclick="removeMessage('${message._id}')">Remove Content</button>
      </div>
    </article>
  `;
}

function renderCategoryCard(category, count) {
  return `
    <div class="category-card">
      <span>${escapeHtml(category)}</span>
      <span class="count-badge">${count}</span>
    </div>
  `;
}

async function loadModeration() {
  if (!requireAuth()) {
    return;
  }

  try {
    const data = await request("/api/moderation");
    const summary = data.summary || {};
    const flaggedMessages = data.flaggedMessages || [];

    document.getElementById("total").textContent = summary.total || 0;
    document.getElementById("approved").textContent = summary.approved || 0;
    document.getElementById("flagged").textContent = summary.flagged || 0;
    document.getElementById("removed").textContent = summary.removed || 0;
    document.getElementById("flaggedCountBadge").textContent = flaggedMessages.length;

    const flaggedList = document.getElementById("flaggedList");
    flaggedList.innerHTML = flaggedMessages.length
      ? flaggedMessages.map(renderModerationCard).join("")
      : '<div class="empty-light-card">No flagged messages right now.</div>';

    const categories = Object.entries(summary.categories || {});
    const categoryList = document.getElementById("categoryList");
    categoryList.innerHTML = categories.length
      ? categories.map(([category, count]) => renderCategoryCard(category, count)).join("")
      : '<div class="empty-light-card">No moderation categories yet.</div>';
  } catch (error) {
    console.error(error);
  }
}

async function approveMessage(messageId) {
  try {
    await request(`/api/moderation/${messageId}/approve`, { method: "PATCH" });
    await loadModeration();
  } catch (error) {
    alert(error.message || "Could not approve message.");
  }
}

async function removeMessage(messageId) {
  try {
    await request(`/api/moderation/${messageId}/remove`, { method: "PATCH" });
    await loadModeration();
  } catch (error) {
    alert(error.message || "Could not remove message.");
  }
}

async function initializeChatPage() {
  if (!requireAuth()) {
    return;
  }

  const roomId = localStorage.getItem("roomId");
  if (!roomId) {
    window.location.href = "/rooms";
    return;
  }

  renderChatIdentity();
  updateParticipantUi();
  document.getElementById("prejoinView")?.classList.remove("hidden");

  try {
    await loadRoomDetails(roomId);
  } catch (error) {
    alert("Could not load the room.");
    window.location.href = "/rooms";
    return;
  }

  bindSocket(roomId);
  await loadMessages();

  const input = document.getElementById("msgInput");
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      sendMessage();
    }
  });

  const privateJoinInput = document.getElementById("joinPrivatePassword");
  privateJoinInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      confirmPrivateJoin();
    }
  });
}

function sendMessage() {
  const input = document.getElementById("msgInput");
  const content = input?.value.trim();
  if (!content || !socket) {
    return;
  }

  socket.emit("sendMessage", {
    roomId: localStorage.getItem("roomId"),
    senderId: localStorage.getItem("userId"),
    message: content
  });

  input.value = "";
}

function initializePage() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if ((path === "/" || path === "/login" || path === "/register" || path.endsWith("/login.html") || path.endsWith("/register.html")) && token) {
    window.location.href = "/rooms";
    return;
  }

  if (path === "/rooms" || path.endsWith("/rooms.html")) {
    loadRooms();
  } else if (path === "/chat" || path.endsWith("/chat.html")) {
    initializeChatPage();
  } else if (path === "/moderation" || path.endsWith("/moderation.html")) {
    loadModeration();
  }
}

document.addEventListener("DOMContentLoaded", initializePage);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/login" || path.endsWith("/login.html")) {
    login();
  } else if (path === "/register" || path.endsWith("/register.html")) {
    register();
  } else if (path === "/rooms" || path.endsWith("/rooms.html")) {
    const roomModalOpen = !document.getElementById("roomModal")?.classList.contains("hidden");
    const privateJoinOpen = !document.getElementById("joinPrivateModal")?.classList.contains("hidden");

    if (roomModalOpen) {
      createRoomFinal();
    } else if (privateJoinOpen) {
      confirmPrivateJoin();
    }
  }
});


