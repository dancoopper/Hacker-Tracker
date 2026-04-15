/**
 * app.js — Scanner page logic
 * Handles camera access, jsQR decoding, meal picker, and check-in API calls.
 */

const API = '';  // same-origin; change to 'http://localhost:3000' if serving separately

// ── DOM refs ─────────────────────────────────────────────────────────────────
const video          = document.getElementById('video');
const canvas         = document.getElementById('canvas');
const ctx            = canvas.getContext('2d');
const btnStart       = document.getElementById('btn-start');
const btnStop        = document.getElementById('btn-stop');
const btnManual      = document.getElementById('btn-manual-checkin');
const manualInput    = document.getElementById('manual-uuid');
const scanStatusPill = document.getElementById('scan-status-pill');
const feedList       = document.getElementById('feed-list');
const checkinCount   = document.getElementById('checkin-count');

// ── State ─────────────────────────────────────────────────────────────────────
let stream        = null;
let rafId         = null;
let scanCooldown  = false;
let checkinTotal  = 0;
let mealTypes     = [];   // loaded from /api/meal-types
let hackersCache  = [];   // loaded from /api/hackers for name lookup

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
    const cameraTip = document.getElementById('camera-tip');
    cameraTip.style.display = 'none';

    // Mobile browsers block getUserMedia over plain HTTP (not localhost)
    const needsHttps = location.protocol !== 'https:'
        && location.hostname !== 'localhost'
        && location.hostname !== '127.0.0.1';

    if (needsHttps) {
        showCameraTip('🔒 Camera blocked — your browser requires <strong>HTTPS</strong> to access the camera on phones. '
            + 'Open this page over HTTPS (or use localhost from the same device).', 'error');
        showToast('Camera needs HTTPS on mobile.', 'error');
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showCameraTip('📵 Your browser does not support camera access. Try Chrome or Safari.', 'error');
        return;
    }

    try {
        let mediaStream;
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
                audio: false,
            });
        } catch (_) {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        stream = mediaStream;
        video.srcObject = stream;
        await video.play();
        btnStart.disabled = true;
        btnStop.disabled = false;
        setScanStatus('scanning');
        rafId = requestAnimationFrame(scanFrame);
    } catch (err) {
        let msg = '';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg = '🚫 Camera permission denied. Tap the lock icon in your browser\'s address bar and allow camera access, then try again.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            msg = '📷 No camera found on this device.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            msg = '⚠️ Camera is in use by another app. Close other apps using the camera and try again.';
        } else if (err.name === 'TypeError') {
            msg = '🔒 Camera blocked — this page must be served over <strong>HTTPS</strong> for camera access on phones.';
        } else {
            msg = `Camera error: ${err.message || err.name}`;
        }
        showCameraTip(msg, 'error');
        showToast('Camera error — see tip below.', 'error');
        console.error('[camera]', err.name, err.message);
    }
}

function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
    video.srcObject = null;
    btnStart.disabled = false;
    btnStop.disabled  = true;
    setScanStatus('idle');
    const cameraTip = document.getElementById('camera-tip');
    if (cameraTip) cameraTip.style.display = 'none';
}

// ── QR Scan Loop ──────────────────────────────────────────────────────────────
function scanFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });
        if (code && !scanCooldown) {
            handleScan(code.data.trim());
        }
    }
    if (stream) rafId = requestAnimationFrame(scanFrame);
}

// ── Scan Handler — shows meal picker instead of immediately checking in ───────
function handleScan(uuid) {
    if (!uuid) return;
    scanCooldown = true;
    setScanStatus('processing');

    // Look up hacker in local cache for instant name display in picker
    const hacker = hackersCache.find(h => h.uuid === uuid) ?? null;

    if (!hacker) {
        showBanner('unknown', '❌ Unknown Hacker', `UUID not found: ${uuid.slice(0, 8)}…`);
        setTimeout(() => { scanCooldown = false; setScanStatus(stream ? 'scanning' : 'idle'); }, 3000);
        return;
    }

    openMealPicker(uuid, hacker.name);
}

// ── Meal Picker ───────────────────────────────────────────────────────────────
let pendingUUID = null;

function openMealPicker(uuid, name) {
    pendingUUID = uuid;
    document.getElementById('meal-modal-name').textContent = name;
    document.getElementById('meal-modal').classList.add('open');
}

function closeMealPicker() {
    document.getElementById('meal-modal').classList.remove('open');
    pendingUUID = null;
    // Resume scanning after modal close
    setTimeout(() => {
        scanCooldown = false;
        setScanStatus(stream ? 'scanning' : 'idle');
    }, 500);
}

async function submitCheckin(uuid, mealType) {
    closeMealPicker();
    try {
        const res  = await fetch(`${API}/api/checkins`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ uuid, mealType }),
        });
        const data = await res.json();
        showResult(data, uuid, mealType);
        if (data.status === 'ok') {
            addFeedItem(data.hacker.name, uuid, data.checkin.timestamp, mealType);
            // Refresh hacker cache so meal badges update
            loadHackersCache();
        }
    } catch (err) {
        showBanner('unknown', '⚠️ Network Error', err.message);
    }
}

// ── Build meal picker buttons from fetched meal types ─────────────────────────
function buildMealButtons() {
    const grid = document.getElementById('meal-btn-grid');
    grid.innerHTML = '';

    mealTypes.forEach(meal => {
        const btn = document.createElement('button');
        btn.className = `btn meal-pick-btn meal-pick-btn--${meal.color}`;
        btn.id = `meal-btn-${meal.id}`;
        btn.innerHTML = `<span class="meal-pick-emoji">${meal.emoji}</span>${meal.label}`;
        btn.addEventListener('click', () => {
            if (pendingUUID) submitCheckin(pendingUUID, meal.id);
        });
        grid.appendChild(btn);
    });
}

// ── Manual entry uses the same meal picker ────────────────────────────────────
btnManual.addEventListener('click', () => {
    const uuid = manualInput.value.trim();
    if (!uuid) return;
    manualInput.value = '';

    const hacker = hackersCache.find(h => h.uuid === uuid) ?? null;
    if (!hacker) {
        showBanner('unknown', '❌ Unknown Hacker', `UUID not found: ${uuid.slice(0, 8)}…`);
        return;
    }
    openMealPicker(uuid, hacker.name);
});

manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnManual.click(); });

document.getElementById('meal-modal-close').addEventListener('click', closeMealPicker);
document.getElementById('meal-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('meal-modal')) closeMealPicker();
});

// ── Display Helpers ───────────────────────────────────────────────────────────
function showResult(data, uuid, mealType) {
    const short    = uuid.slice(0, 8) + '…';
    const mealMeta = mealTypes.find(m => m.id === mealType);
    const mealLabel = mealMeta ? `${mealMeta.emoji} ${mealMeta.label}` : mealType;

    if (data.status === 'ok') {
        showBanner('ok', `✅ Welcome, ${data.hacker.name}!`, `${mealLabel} check-in recorded`);
        showToast(`Checked in: ${data.hacker.name} — ${mealLabel}`, 'success');
    } else if (data.status === 'duplicate') {
        const when = new Date(data.checkin.timestamp).toLocaleTimeString();
        showBanner('duplicate', `⚠️ Already Checked In`,
            `${data.hacker.name} already had ${mealLabel} at ${when}`);
    } else {
        showBanner('unknown', `❌ Unknown Hacker`, `UUID not found: ${short}`);
    }
}

function showBanner(type, title, sub) {
    const banner = document.getElementById('status-banner');
    document.getElementById('status-icon').textContent  =
        type === 'ok' ? '✅' : type === 'duplicate' ? '⚠️' : '❌';
    document.getElementById('status-title').textContent = title;
    document.getElementById('status-sub').textContent   = sub;
    banner.className = `status-banner visible ${type}`;
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(() => banner.classList.remove('visible'), 6000);
}

function setScanStatus(state) {
    const pill = scanStatusPill;
    if (state === 'scanning') {
        pill.className   = 'badge badge-green';
        pill.textContent = '● Scanning';
    } else if (state === 'processing') {
        pill.className   = 'badge';
        pill.style.background = 'rgba(167,139,250,0.15)';
        pill.style.color      = 'var(--accent-purple)';
        pill.textContent = '◌ Processing…';
    } else {
        pill.className   = 'badge badge-muted';
        pill.style.background = '';
        pill.style.color = '';
        pill.textContent = '● Idle';
    }
}

function addFeedItem(name, uuid, timestamp, mealType) {
    checkinTotal++;
    checkinCount.textContent = checkinTotal;

    const empty = feedList.querySelector('.empty-state');
    if (empty) feedList.innerHTML = '';

    const mealMeta  = mealTypes.find(m => m.id === mealType);
    const mealLabel = mealMeta ? `${mealMeta.emoji} ${mealMeta.label}` : (mealType || '');
    const time = new Date(timestamp).toLocaleTimeString();

    const li = document.createElement('li');
    li.className = 'feed-item';
    li.innerHTML = `
      <div class="feed-dot"></div>
      <div style="flex:1; min-width:0;">
        <div class="feed-name">${escHtml(name)}</div>
        <div class="feed-uuid mono">${escHtml(uuid)}</div>
      </div>
      <div style="text-align:right;">
        ${mealLabel ? `<div class="feed-meal">${escHtml(mealLabel)}</div>` : ''}
        <div class="feed-meta">${time}</div>
      </div>
    `;
    feedList.insertBefore(li, feedList.firstChild);
    while (feedList.children.length > 20) feedList.removeChild(feedList.lastChild);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className   = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showCameraTip(htmlMsg, type = '') {
    const el = document.getElementById('camera-tip');
    if (!el) return;
    el.innerHTML  = htmlMsg;
    el.style.display = 'block';
    el.className  = `camera-tip camera-tip--${type}`;
}

// ── Camera controls ───────────────────────────────────────────────────────────
btnStart.addEventListener('click', startCamera);
btnStop.addEventListener('click',  stopCamera);

// ── Data helpers ──────────────────────────────────────────────────────────────
async function loadHackersCache() {
    try {
        const res  = await fetch(`${API}/api/hackers`);
        hackersCache = await res.json();
    } catch (e) {
        console.warn('Could not load hackers cache', e);
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async function init() {
    // Load meal types first so buttons render before any scan arrives
    try {
        const res = await fetch(`${API}/api/meal-types`);
        mealTypes = await res.json();
        buildMealButtons();
    } catch (e) {
        console.warn('Could not load meal types', e);
    }

    // Cache hacker list for instant name lookup on scan
    await loadHackersCache();

    // Populate recent check-ins feed
    try {
        const res  = await fetch(`${API}/api/checkins`);
        const data = await res.json();
        data.slice(0, 20).forEach(c =>
            addFeedItem(c.name, c.uuid, c.timestamp, c.mealType)
        );
    } catch (e) {
        console.warn('Could not load existing check-ins', e);
    }
})();
