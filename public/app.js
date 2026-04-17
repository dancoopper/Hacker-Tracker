/**
 * app.js — Scanner page logic
 * Handles camera access, jsQR decoding, and check-in API calls.
 */

const API = '';  // same-origin; change to 'http://localhost:3000' if serving separately

// ── DOM refs ─────────────────────────────────────────────────────────────────
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnManual = document.getElementById('btn-manual-checkin');
const manualInput = document.getElementById('manual-uuid');
const scanStatusPill = document.getElementById('scan-status-pill');
const feedList = document.getElementById('feed-list');
const checkinCount = document.getElementById('checkin-count');
const supabase = require('./supabaseClient');

// ── State ─────────────────────────────────────────────────────────────────────
let stream = null;
let rafId = null;
let scanCooldown = false;   // brief lock after each scan to prevent double-fires
let checkinTotal = 0;

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
        });
        video.srcObject = stream;
        video.play();
        btnStart.disabled = true;
        btnStop.disabled = false;
        setScanStatus('scanning');
        rafId = requestAnimationFrame(scanFrame);
    } catch (err) {
        showToast('Camera error: ' + err.message, 'error');
        console.error(err);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    video.srcObject = null;
    btnStart.disabled = false;
    btnStop.disabled = true;
    setScanStatus('idle');
}

// ── QR Scan Loop ──────────────────────────────────────────────────────────────
function scanFrame() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });

        if (code && !scanCooldown) {
            handleScannedUUID(code.data.trim());
        }
    }
    if (stream) rafId = requestAnimationFrame(scanFrame);
}

// ── Check-In Logic ────────────────────────────────────────────────────────────
async function handleScannedUUID(uuid) {
    if (!uuid) return;
    scanCooldown = true;
    setScanStatus('processing');

    // Show a waiting banner immediately so the operator knows a request is in flight
    showBanner('processing', '⏳ Checking in…', 'Waiting for confirmation from server…');

    try {
        const res = await fetch(`${API}/api/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid }),
        });
        const data = await res.json();
        showResult(data, uuid);
        if (data.status === 'ok') {
            addFeedItem(data.hacker.name, uuid, data.checkin.timestamp);
        }
    } catch (err) {
        showBanner('unknown', '⚠️ Network Error', err.message);
    }

    // cooldown: ignore further scans for 3 seconds
    setTimeout(() => {
        scanCooldown = false;
        setScanStatus(stream ? 'scanning' : 'idle');
    }, 3000);
}

// ── Display Helpers ───────────────────────────────────────────────────────────
function showResult(data, uuid) {
    const short = uuid.slice(0, 8) + '…';
    if (data.status === 'ok') {
        showBanner('ok', `✅ Welcome, ${data.hacker.name}!`, `UUID: ${short}`);
        showToast(`Checked in: ${data.hacker.name}`, 'success');
    } else if (data.status === 'duplicate') {
        const when = new Date(data.checkin.timestamp).toLocaleTimeString();
        showBanner('duplicate', `⚠️ Already Checked In`, `${data.hacker.name} — first checked in at ${when}`);
    } else if (data.error) {
        showBanner('unknown', `❌ Server Error`, data.error);
    } else {
        showBanner('unknown', `❌ Unknown Hacker`, `UUID not found: ${short}`);
    }
}

function showBanner(type, title, sub) {
    const banner = document.getElementById('status-banner');
    document.getElementById('status-icon').textContent =
        type === 'ok' ? '✅' : type === 'duplicate' ? '⚠️' : type === 'processing' ? '⏳' : '❌';
    document.getElementById('status-title').textContent = title;
    document.getElementById('status-sub').textContent = sub;
    banner.className = `status-banner visible ${type === 'processing' ? 'duplicate' : type}`;

    clearTimeout(banner._hideTimer);
    // Don't auto-hide the "processing" banner — it will be replaced by the result
    if (type !== 'processing') {
        banner._hideTimer = setTimeout(() => banner.classList.remove('visible'), 6000);
    }
}

function setScanStatus(state) {
    const pill = scanStatusPill;
    if (state === 'scanning') {
        pill.className = 'badge badge-green';
        pill.textContent = '● Scanning';
    } else if (state === 'processing') {
        pill.className = 'badge';
        pill.style.background = 'rgba(167,139,250,0.15)';
        pill.style.color = 'var(--accent-purple)';
        pill.textContent = '◌ Processing…';
    } else {
        pill.className = 'badge badge-muted';
        pill.style.background = '';
        pill.style.color = '';
        pill.textContent = '● Idle';
    }
}

function addFeedItem(name, uuid, timestamp) {
    checkinTotal++;
    checkinCount.textContent = checkinTotal;

    // Remove empty state placeholder
    const empty = feedList.querySelector('.empty-state');
    if (empty) feedList.innerHTML = '';

    const time = new Date(timestamp).toLocaleTimeString();
    const li = document.createElement('li');
    li.className = 'feed-item';
    li.innerHTML = `
    <div class="feed-dot"></div>
    <div style="flex:1; min-width:0;">
      <div class="feed-name">${escHtml(name)}</div>
      <div class="feed-uuid mono">${escHtml(uuid)}</div>
    </div>
    <div class="feed-meta">${time}</div>
  `;
    feedList.insertBefore(li, feedList.firstChild);

    // Keep feed at most 20 items
    while (feedList.children.length > 20) feedList.removeChild(feedList.lastChild);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
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

// ── Event Listeners ───────────────────────────────────────────────────────────
btnStart.addEventListener('click', startCamera);
btnStop.addEventListener('click', stopCamera);

btnManual.addEventListener('click', () => {
    const uuid = manualInput.value.trim();
    if (!uuid) return;
    manualInput.value = '';
    handleScannedUUID(uuid);
});

manualInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnManual.click();
});

// ── Bootstrap: load existing check-ins into the feed ─────────────────────────
(async function init() {
    try {
        const res = await fetch(`${API}/api/checkins`);
        const data = await res.json();
        // checkinStore returns { uuid, name, timestamp } — all normalized
        data.slice(0, 20).forEach(c => addFeedItem(c.name, c.uuid, c.timestamp));
    } catch (e) {
        console.warn('Could not load existing check-ins', e);
    }
})();
