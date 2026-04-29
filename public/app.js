/**
 * app.js — Scanner page logic
 * Handles camera access, jsQR decoding, and meal check-in via /api/qrmeals/scan.
 * After a QR code is detected, a meal-selection modal appears before submitting.
 */

const API = '';  // same-origin; change to 'http://localhost:3000' if serving separately

const MEAL_LABELS = { breakfast: '🍳 Breakfast', lunch: '🥗 Lunch', dinner: '🍽 Dinner' };

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
const mealModal      = document.getElementById('meal-modal');

// ── State ─────────────────────────────────────────────────────────────────────
let stream         = null;
let rafId          = null;
let scanCooldown   = false;   // brief lock after each scan to prevent double-fires
let checkinTotal   = 0;
let pendingCode    = null;    // QR code waiting for meal selection

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 } },
        });
        video.srcObject = stream;
        video.play();
        btnStart.disabled = true;
        btnStop.disabled  = false;
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
    btnStop.disabled  = true;
    setScanStatus('idle');
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
            handleScannedCode(code.data.trim());
        }
    }
    if (stream) rafId = requestAnimationFrame(scanFrame);
}

// ── Meal Modal ────────────────────────────────────────────────────────────────

const mealModalBody = document.getElementById('meal-modal-body');
const mealModalCode = document.getElementById('meal-modal-code');

async function openMealModal(code) {
    pendingCode = code;
    const short = code.length > 40 ? code.slice(0, 40) + '…' : code;
    mealModalCode.textContent = short;
    mealModalBody.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--text-muted);">Loading…</div>';
    mealModal.classList.add('open');
    await refreshMealModalCounts(code);
}

async function refreshMealModalCounts(code) {
    try {
        const res  = await fetch(`${API}/api/qrmeals/${encodeURIComponent(code)}`);
        const data = await res.json();
        renderMealModalBody(code, data);
    } catch {
        mealModalBody.innerHTML = '<div style="color:var(--accent-red);padding:0.5rem;">Failed to load counts.</div>';
    }
}

function renderMealModalBody(code, counts) {
    const meals = [
        { key: 'breakfast', label: '🍳 Breakfast' },
        { key: 'lunch',     label: '🥗 Lunch'     },
        { key: 'dinner',    label: '🍽 Dinner'    },
    ];

    mealModalBody.innerHTML = meals.map(({ key, label }) => {
        const n = counts[key] ?? 0;
        return `
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <button class="btn btn-primary btn-modal-add"
                    data-meal="${key}" data-code="${escHtml(code)}"
                    style="flex:1;font-size:1.05rem;padding:0.85rem 1rem;text-align:left;">
              ${label} <span style="opacity:0.7;font-weight:400;font-size:0.9rem;">(${n})</span>
            </button>
            <button class="btn btn-ghost btn-modal-remove"
                    data-meal="${key}" data-code="${escHtml(code)}"
                    style="padding:0.85rem 1rem;font-size:1.1rem;"
                    ${n === 0 ? 'disabled' : ''}
                    title="Remove 1 ${key}">−</button>
          </div>`;
    }).join('');
}

function closeMealModal() {
    mealModal.classList.remove('open');
    pendingCode = null;
    setTimeout(() => {
        scanCooldown = false;
        setScanStatus(stream ? 'scanning' : 'idle');
    }, 500);
}

document.getElementById('btn-close-meal-modal').addEventListener('click', closeMealModal);

mealModal.addEventListener('click', e => {
    if (e.target === mealModal) closeMealModal();
});

// Delegated handler for + and − inside the meal modal
mealModalBody.addEventListener('click', async e => {
    const addBtn    = e.target.closest('.btn-modal-add');
    const removeBtn = e.target.closest('.btn-modal-remove');
    const btn       = addBtn || removeBtn;
    if (!btn) return;

    const { meal, code } = btn.dataset;
    btn.disabled    = true;
    const orig      = btn.textContent;
    btn.textContent = '…';

    try {
        const endpoint = addBtn
            ? `${API}/api/qrmeals/scan`
            : `${API}/api/qrmeals/${encodeURIComponent(code)}/remove`;
        const body = addBtn ? { code, meal } : { meal };

        const res  = await fetch(endpoint, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        const data = await res.json();

        if (data.status === 'ok') {
            showToast(`${MEAL_LABELS[meal]} ${addBtn ? 'added' : 'removed'}`, 'success');
            if (addBtn) addFeedItem(code, meal, data);
            renderMealModalBody(code, data);   // update counts in-place, modal stays open
        } else {
            showToast('Error: ' + (data.error || 'Unknown'), 'error');
            btn.disabled    = false;
            btn.textContent = orig;
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        btn.disabled    = false;
        btn.textContent = orig;
    }
});


// ── Check-In Logic ────────────────────────────────────────────────────────────
/**
 * Called when a QR code is detected (camera or manual entry).
 * Pauses scanning and opens the meal-selection modal.
 */
function handleScannedCode(code) {
    if (!code) return;
    scanCooldown = true;
    setScanStatus('processing');
    showBanner('processing', '⏳ QR Code Detected', 'Choose a meal below…');
    openMealModal(code);
}



// ── Display Helpers ───────────────────────────────────────────────────────────
function showBanner(type, title, sub) {
    const banner = document.getElementById('status-banner');
    document.getElementById('status-icon').textContent =
        type === 'ok' ? '✅' : type === 'duplicate' ? '⚠️' : type === 'processing' ? '⏳' : '❌';
    document.getElementById('status-title').textContent = title;
    document.getElementById('status-sub').textContent   = sub;
    banner.className = `status-banner visible ${type === 'processing' ? 'duplicate' : type}`;

    clearTimeout(banner._hideTimer);
    if (type !== 'processing') {
        banner._hideTimer = setTimeout(() => banner.classList.remove('visible'), 6000);
    }
}

function setScanStatus(state) {
    const pill = scanStatusPill;
    if (state === 'scanning') {
        pill.className   = 'badge badge-green';
        pill.textContent = '● Scanning';
    } else if (state === 'processing') {
        pill.className        = 'badge';
        pill.style.background = 'rgba(167,139,250,0.15)';
        pill.style.color      = 'var(--accent-purple)';
        pill.textContent      = '◌ Processing…';
    } else {
        pill.className        = 'badge badge-muted';
        pill.style.background = '';
        pill.style.color      = '';
        pill.textContent      = '● Idle';
    }
}

function addFeedItem(code, meal, counts) {
    checkinTotal++;
    checkinCount.textContent = checkinTotal;

    const empty = feedList.querySelector('.empty-state');
    if (empty) feedList.innerHTML = '';

    const time    = new Date().toLocaleTimeString();
    const short   = code.length > 24 ? code.slice(0, 24) + '…' : code;
    const li      = document.createElement('li');
    li.className  = 'feed-item';
    li.innerHTML  = `
    <div class="feed-dot"></div>
    <div style="flex:1; min-width:0;">
      <div class="feed-name">${MEAL_LABELS[meal]}</div>
      <div class="feed-uuid mono">${escHtml(short)}</div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.15rem;">
        🍳 ${counts.breakfast ?? 0} &nbsp; 🥗 ${counts.lunch ?? 0} &nbsp; 🍽 ${counts.dinner ?? 0}
      </div>
    </div>
    <div class="feed-meta">${time}</div>
  `;
    feedList.insertBefore(li, feedList.firstChild);

    while (feedList.children.length > 20) feedList.removeChild(feedList.lastChild);
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className  = `toast ${type}`;
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
    const code = manualInput.value.trim();
    if (!code) return;
    manualInput.value = '';
    handleScannedCode(code);
});

manualInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') btnManual.click();
});

// ── Bootstrap: nothing to preload (qr_meals feed isn't shown on startup) ──────
// The feed starts empty and fills as meals are recorded during this session.
