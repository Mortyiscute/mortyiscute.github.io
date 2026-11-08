"use strict";

const CONFIG = {
  discordId: "1458119092450889901",
  lanyardRest: "https://api.lanyard.rest/v1/users/",
  lanyardSocket: "wss://api.lanyard.rest/socket",
  retryMs: 60_000,
};

const STATUS_LABEL = {
  online: "Online",
  idle: "Abwesend",
  dnd: "Bitte nicht stören",
  offline: "Offline",
};

const $ = (id) => document.getElementById(id);

/* Avatar */
const avatarImg = $("avatar");

function defaultAvatar() {
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(CONFIG.discordId) >> 22n) % 6n)}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

avatarImg.addEventListener("error", () => {
  const fallback = defaultAvatar();
  if (avatarImg.src !== fallback) avatarImg.src = fallback;
});

function avatarUrl(user) {
  if (!user.avatar) return defaultAvatar();
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
}

/* Live-Status (Lanyard) */
function renderPresence(data) {
  if (!data || !data.discord_user) return;
  const user = data.discord_user;

  if (user.username) $("username").textContent = user.username;

  const url = avatarUrl(user);
  if (avatarImg.getAttribute("src") !== url) avatarImg.src = url;

  const status = STATUS_LABEL[data.discord_status] ? data.discord_status : "offline";
  const dot = $("status-dot");
  dot.dataset.status = status;
  dot.title = STATUS_LABEL[status];
  dot.setAttribute("aria-label", "Discord-Status: " + STATUS_LABEL[status]);
  dot.hidden = false;
}

async function fetchLanyard() {
  try {
    const res = await fetch(CONFIG.lanyardRest + CONFIG.discordId, { cache: "no-store" });
    const json = await res.json();
    if (json && json.success && json.data) {
      renderPresence(json.data);
      return true;
    }
  } catch {
    /* offline oder blockiert */
  }
  return false;
}

let socketBackoff = 2000;

function openSocket() {
  let socket;
  let heartbeat = null;

  try {
    socket = new WebSocket(CONFIG.lanyardSocket);
  } catch {
    setTimeout(openSocket, 30_000);
    return;
  }

  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.op === 1 && msg.d) {
      clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 3 }));
      }, msg.d.heartbeat_interval);
      socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: CONFIG.discordId } }));
    } else if (msg.op === 0 && (msg.t === "INIT_STATE" || msg.t === "PRESENCE_UPDATE")) {
      socketBackoff = 2000;
      renderPresence(msg.d);
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(heartbeat);
    setTimeout(() => {
      fetchLanyard();
      openSocket();
    }, socketBackoff);
    socketBackoff = Math.min(socketBackoff * 2, 60_000);
  });
}

async function start() {
  if (await fetchLanyard()) openSocket();
  else setTimeout(start, CONFIG.retryMs);
}

/* Benutzernamen kopieren */
function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

$("username").addEventListener("click", async () => {
  const ok = await copyText($("username").textContent.trim());
  showToast(ok ? "Kopiert" : "Kopieren nicht möglich");
});

start();
