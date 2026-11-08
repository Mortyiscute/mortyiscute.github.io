"use strict";

/* =========================================================
   Einstellungen
   ========================================================= */
const CONFIG = {
  discordId: "1458119092450889901",

  // Wird angezeigt, solange keine Live-Daten da sind.
  fallback: {
    displayName: "!Morty",
    username: "mortyiscute",
    avatar: "https://cdn.discordapp.com/avatars/1458119092450889901/3bede449d35a8818c34405a01698bc61.png?size=256",
  },

  lanyardRest: "https://api.lanyard.rest/v1/users/",
  lanyardSocket: "wss://api.lanyard.rest/socket",
  // Holt Name & Avatar, solange Lanyard dich noch nicht kennt.
  lookupApi: "https://japi.rest/discord/v1/user/",
  retryNotMonitoredMs: 60_000,
};

const STATUS_LABEL = {
  online: "Online",
  idle: "Abwesend",
  dnd: "Bitte nicht stören",
  offline: "Offline",
};

const TYPE_LABEL = {
  0: "Spielt",
  1: "Streamt",
  2: "Hört",
  3: "Schaut",
  5: "Tritt an in",
};

/* =========================================================
   Hilfsfunktionen
   ========================================================= */
const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const pad = (n) => String(n).padStart(2, "0");

function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function snowflakeDate(id) {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n));
}

function defaultAvatar(id) {
  try {
    return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function avatarUrl(user) {
  if (!user || !user.avatar) return defaultAvatar(CONFIG.discordId);
  const ext = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
}

function assetUrl(appId, key) {
  if (!key) return null;
  if (key.startsWith("mp:")) return `https://media.discordapp.net/${key.slice(3)}`;
  if (key.startsWith("spotify:")) return `https://i.scdn.co/image/${key.slice(8)}`;
  if (appId) return `https://cdn.discordapp.com/app-assets/${appId}/${key}.png`;
  return null;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/* =========================================================
   Profil (Name, Avatar)
   ========================================================= */
const avatarImg = $("avatar");

avatarImg.addEventListener("error", () => {
  const fallback = defaultAvatar(CONFIG.discordId);
  if (avatarImg.src !== fallback) avatarImg.src = fallback;
});

function setUser(user) {
  if (!user) return;
  const display = user.global_name || user.display_name || user.username || CONFIG.fallback.displayName;
  const username = user.username || CONFIG.fallback.username;

  $("display-name").textContent = display;
  $("username-text").textContent = "@" + username;
  avatarImg.alt = "Avatar von " + display;

  const url = avatarUrl(user);
  if (avatarImg.getAttribute("src") !== url) avatarImg.src = url;
}

/* =========================================================
   Live-Status (Lanyard)
   ========================================================= */
let tickers = [];

setInterval(() => tickers.forEach((fn) => fn()), 1000);

function renderPresence(data) {
  if (!data || !data.discord_user) return;

  setUser(data.discord_user);

  const status = STATUS_LABEL[data.discord_status] ? data.discord_status : "offline";
  const dot = $("status-dot");
  dot.dataset.status = status;
  dot.title = STATUS_LABEL[status];
  dot.hidden = false;

  const statusText = $("status-text");
  statusText.textContent = STATUS_LABEL[status];
  statusText.hidden = false;
  $("meta-sep").hidden = false;

  const activities = Array.isArray(data.activities) ? data.activities : [];
  renderCustomStatus(activities.find((a) => a.type === 4));
  renderActivities(data, activities);
}

function renderCustomStatus(activity) {
  const box = $("custom-status");
  box.replaceChildren();

  if (!activity || (!activity.state && !activity.emoji)) {
    box.hidden = true;
    return;
  }

  const emoji = activity.emoji;
  if (emoji && emoji.id) {
    const img = el("img", "emoji");
    img.src = `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? "gif" : "png"}?size=48`;
    img.alt = emoji.name || "";
    box.append(img);
  } else if (emoji && emoji.name) {
    box.append(el("span", "emoji", emoji.name));
  }

  if (activity.state) box.append(el("span", "cs-text", activity.state));
  box.hidden = false;
}

function renderActivities(data, activities) {
  const list = $("activity-list");
  list.replaceChildren();
  tickers = [];

  const rows = [];
  if (data.listening_to_spotify && data.spotify) rows.push(spotifyRow(data.spotify));

  for (const a of activities) {
    if (rows.length >= 3) break;
    if (a.type === 4) continue; // eigener Status, wird oben angezeigt
    if (a.name === "Spotify" && data.listening_to_spotify) continue; // schon drin
    rows.push(activityRow(a));
  }

  list.append(...rows);
  $("activity").hidden = rows.length === 0;
  tickers.forEach((fn) => fn());
}

function artwork(src, letter, alt) {
  const placeholder = el("div", "act-art placeholder", letter);
  placeholder.setAttribute("aria-hidden", "true");
  if (!src) return placeholder;

  const img = el("img", "act-art");
  img.src = src;
  img.alt = alt || "";
  img.loading = "lazy";
  img.addEventListener("error", () => img.replaceWith(placeholder), { once: true });
  return img;
}

function spotifyRow(s) {
  const row = el("div", "act");
  row.append(artwork(s.album_art_url, "♪", s.album ? "Cover: " + s.album : ""));

  const body = el("div", "act-body");
  body.append(el("div", "act-label", "Hört Spotify"));

  let title;
  if (s.track_id) {
    title = el("a", "act-title", s.song);
    title.href = "https://open.spotify.com/track/" + encodeURIComponent(s.track_id);
    title.target = "_blank";
    title.rel = "noopener";
  } else {
    title = el("div", "act-title", s.song);
  }
  body.append(title);

  if (s.artist) body.append(el("div", "act-sub", "von " + s.artist.replace(/;\s*/g, ", ")));

  const ts = s.timestamps || {};
  if (ts.start && ts.end && ts.end > ts.start) {
    const progress = el("div", "progress");
    const bar = el("div", "bar");
    const fill = el("span");
    bar.append(fill);
    const times = el("div", "times");
    const now = el("span");
    const total = el("span", null, fmtDuration(ts.end - ts.start));
    times.append(now, total);
    progress.append(bar, times);
    body.append(progress);

    tickers.push(() => {
      const length = ts.end - ts.start;
      const pos = Math.min(Math.max(Date.now() - ts.start, 0), length);
      fill.style.width = (pos / length) * 100 + "%";
      now.textContent = fmtDuration(pos);
    });
  }

  row.append(body);
  return row;
}

function activityRow(a) {
  const row = el("div", "act");
  const assets = a.assets || {};
  const name = a.name || "Aktivität";
  row.append(artwork(assetUrl(a.application_id, assets.large_image), name.charAt(0).toUpperCase(), assets.large_text || name));

  const body = el("div", "act-body");
  body.append(el("div", "act-label", TYPE_LABEL[a.type] || "Aktiv in"));

  let title;
  if (a.type === 1 && isHttpsUrl(a.url)) {
    title = el("a", "act-title", name);
    title.href = a.url;
    title.target = "_blank";
    title.rel = "noopener";
  } else {
    title = el("div", "act-title", name);
  }
  body.append(title);

  if (a.details) body.append(el("div", "act-sub", a.details));
  if (a.state) body.append(el("div", "act-sub", a.state));

  const ts = a.timestamps || {};
  if (ts.end || ts.start) {
    const time = el("div", "act-time");
    body.append(time);
    tickers.push(() => {
      time.textContent = ts.end
        ? fmtDuration(ts.end - Date.now()) + " übrig"
        : fmtDuration(Date.now() - ts.start) + " verstrichen";
    });
  }

  row.append(body);
  return row;
}

/* =========================================================
   Verbindung
   ========================================================= */
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

async function loadStaticProfile() {
  try {
    const res = await fetch(CONFIG.lookupApi + CONFIG.discordId, { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    if (json && json.data && json.data.id) setUser(json.data);
  } catch {
    /* dann bleibt es bei den eingetragenen Daten */
  }
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

let staticLoaded = false;

async function start() {
  if (await fetchLanyard()) {
    openSocket();
    return;
  }
  // Lanyard kennt die ID (noch) nicht: feste Daten zeigen und später erneut versuchen.
  if (!staticLoaded) {
    staticLoaded = true;
    loadStaticProfile();
  }
  setTimeout(start, CONFIG.retryNotMonitoredMs);
}

/* =========================================================
   Kleinigkeiten
   ========================================================= */
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
    const area = el("textarea");
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
  const name = $("username-text").textContent.replace(/^@/, "");
  showToast((await copyText(name)) ? "Benutzername kopiert" : "Kopieren nicht möglich");
});

try {
  const since = snowflakeDate(CONFIG.discordId);
  $("member-since").textContent =
    "Auf Discord seit " + since.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
} catch {
  /* Text aus dem HTML bleibt */
}

$("year").textContent = String(new Date().getFullYear());

start();
