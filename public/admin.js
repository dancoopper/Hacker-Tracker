/**
 * admin.js — Admin dashboard logic
 * Loads hacker list, renders table with check-in status, handles add modal, CSV export,
 * and manual check-in search.
 */

const API = '';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const tbody = document.getElementById('hacker-tbody');
const statTotal = document.getElementById('stat-total');
const statIn = document.getElementById('stat-checkedin');
const statRemain = document.getElementById('stat-remaining');
const searchInput = document.getElementById('search-input');
const addModal = document.getElementById('add-modal');
const addForm = document.getElementById('add-hacker-form');
const checkinSearchInput = document.getElementById('checkin-search-input');
const checkinResults = document.getElementById('checkin-results');

// ── Data ──────────────────────────────────────────────────────────────────────
let hackers = [];

// ── Load & Render ─────────────────────────────────────────────────────────────
async function loadHackers() {
    try {
        const res = await fetch(`${API}/api/hackers`);
        hackers = await res.json();
        renderTable(hackers);
        updateStats(hackers);
        // Refresh search results too (check-in state may have changed)
        renderCheckinResults(checkinSearchInput.value.trim().toLowerCase());
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:var(--accent-red);padding:1rem;">Error loading data: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable(data) {
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:2rem;"><div class="empty-icon">👤</div>No hackers registered yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(h => {
        const badge = h.checkedIn
            ? `<span class="badge badge-green">✓ Checked In</span>`
            : `<span class="badge badge-muted">○ Not yet</span>`;
        const timeStr = h.checkinTime ? new Date(h.checkinTime).toLocaleTimeString() : '—';
        const emailStr = h.email ? escHtml(h.email) : '<span style="color:var(--text-muted)">—</span>';
        const actions = h.checkedIn
            ? `<button class="btn btn-ghost btn-undo-checkin" data-uuid="${escHtml(h.uuid)}" data-name="${escHtml(h.name)}" style="padding:0.3rem 0.7rem;font-size:0.78rem;">↩ Undo</button>`
            : `<span style="color:var(--text-muted);font-size:0.8rem;">—</span>`;

        // Meal buttons — shown for all hackers (uses uuid as the RSVP_list id)
        const mealButtons = `<div class="meal-btn-group" id="meals-row-${escHtml(h.uuid)}">
                  ${buildMealButtons(h.uuid, {})}
               </div>`;

        return `
      <tr>
        <td style="font-weight:600;">${escHtml(h.name)}</td>
        <td>${emailStr}</td>
        <td class="mono" style="font-size:0.78rem;color:var(--text-muted);">${escHtml(h.uuid)}</td>
        <td>${badge}</td>
        <td style="color:var(--text-secondary);">${timeStr}</td>
        <td>${mealButtons}</td>
        <td>${actions}</td>
      </tr>
    `;
    }).join('');

    // Fetch meal status for all rows
    data.forEach(h => loadMealStatus(h.uuid, 'row'));
}

function updateStats(data) {
    const total = data.length;
    const checkedIn = data.filter(h => h.checkedIn).length;
    statTotal.textContent = total;
    statIn.textContent = checkedIn;
    statRemain.textContent = total - checkedIn;
}

// ── Search (Attendees Table) ──────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) { renderTable(hackers); return; }
    const filtered = hackers.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.email || '').toLowerCase().includes(q) ||
        h.uuid.toLowerCase().includes(q)
    );
    renderTable(filtered);
});

// ── Manual Check-In Search ────────────────────────────────────────────────────
checkinSearchInput.addEventListener('input', () => {
    renderCheckinResults(checkinSearchInput.value.trim().toLowerCase());
});

function renderCheckinResults(q) {
    if (!q) {
        checkinResults.innerHTML = '';
        return;
    }

    const matches = hackers.filter(h =>
        h.name.toLowerCase().includes(q) ||
        (h.email || '').toLowerCase().includes(q)
    );

    // Displays the list in real time
    if (!matches.length) {
        // I would use 
        checkinResults.innerHTML = `
          <div class="checkin-no-results">
            <span style="font-size:1.5rem;">🔍</span>
            <span>No hackers found matching "<strong>${escHtml(checkinSearchInput.value.trim())}</strong>"</span>
          </div>`;
        return;
    }

    checkinResults.innerHTML = matches.map(h => {
        const emailStr = h.email ? escHtml(h.email) : '<span style="color:var(--text-muted)">No email</span>';
        const mealSection = `<div class="meal-btn-group" id="meals-search-${escHtml(h.uuid)}">${buildMealButtons(h.uuid, {})}</div>`;

        if (h.checkedIn) {
            const timeStr = h.checkinTime ? new Date(h.checkinTime).toLocaleTimeString() : '';
            return `
              <div class="checkin-result-card checked">
                <div class="checkin-result-info">
                  <div class="checkin-result-name">${escHtml(h.name)}</div>
                  <div class="checkin-result-email">${emailStr}</div>
                  ${mealSection}
                </div>
                <div class="checkin-already-badge">
                  <span class="badge badge-green">✓ Checked In</span>
                  ${timeStr ? `<span style="font-size:0.75rem;color:var(--text-muted);margin-top:0.2rem;">${timeStr}</span>` : ''}
                </div>
              </div>`;
        }
        return `
              <div class="checkin-result-card" data-uuid="${escHtml(h.uuid)}">
                <div class="checkin-result-info">
                  <div class="checkin-result-name">${escHtml(h.name)}</div>
                  <div class="checkin-result-email">${emailStr}</div>
                  ${mealSection}
                </div>
                <button class="btn btn-success btn-checkin-now"
                        data-uuid="${escHtml(h.uuid)}"
                        data-name="${escHtml(h.name)}"
                        id="checkin-btn-${escHtml(h.uuid)}">
                  ✓ Check In
                </button>
              </div>`;
    }).join('');

    // Load real meal status for all results
    matches.forEach(h => loadMealStatus(h.uuid, 'search'));
}

// Delegated click handler for "Check In" buttons in search results
checkinResults.addEventListener('click', async e => {
    const btn = e.target.closest('.btn-checkin-now');
    if (!btn) return;

    const { uuid, name } = btn.dataset;
    btn.disabled = true;
    btn.textContent = 'Checking in…';

    try {
        const res = await fetch(`${API}/api/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid }),
        });
        const data = await res.json();

        if (data.status === 'ok') {
            showToast(`✓ ${name} checked in!`, 'success');
            await loadHackers();
        } else if (data.status === 'duplicate') {
            showToast(`${name} is already checked in.`, '');
            await loadHackers();
        } else if (data.status === 'unknown') {
            showToast(`UUID not found for ${name}.`, 'error');
            btn.disabled = false;
            btn.textContent = '✓ Check In';
        } else {
            showToast('Error: ' + (data.error || 'Unknown error'), 'error');
            btn.disabled = false;
            btn.textContent = '✓ Check In';
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = '✓ Check In';
    }
});

// ── Add Hacker Modal ──────────────────────────────────────────────────────────
document.getElementById('btn-open-add').addEventListener('click', () => openModal());
document.getElementById('btn-close-modal').addEventListener('click', () => closeModal());
document.getElementById('btn-cancel-add').addEventListener('click', () => closeModal());
addModal.addEventListener('click', e => { if (e.target === addModal) closeModal(); });

function openModal() {
    addForm.reset();
    addModal.classList.add('open');
    document.getElementById('input-name').focus();
}
function closeModal() { addModal.classList.remove('open'); }

addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-add');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    const body = {
        name: document.getElementById('input-name').value.trim(),
        email: document.getElementById('input-email').value.trim() || undefined,
        uuid: document.getElementById('input-uuid').value.trim() || undefined,
    };

    try {
        const res = await fetch(`${API}/api/hackers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
            showToast('Error: ' + (data.error || 'Unknown error'), 'error');
        } else {
            showToast(`Added ${data.name}!`, 'success');
            closeModal();
            await loadHackers();
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Add Hacker';
    }
});

// ── Un-check-in ──────────────────────────────────────────────────────────────
async function uncheckin(uuid, name) {
    try {
        const res = await fetch(`${API}/api/checkins/${encodeURIComponent(uuid)}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) {
            showToast('Error: ' + (data.error || 'Unknown'), 'error');
        } else {
            showToast(`Undid check-in for ${name}`, 'success');
            await loadHackers();
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
    }
}

// Delegated click handler for undo buttons rendered inside the table
tbody.addEventListener('click', e => {
    const btn = e.target.closest('.btn-undo-checkin');
    if (!btn) return;
    const { uuid, name } = btn.dataset;
    if (confirm(`Remove check-in for ${name}?`)) uncheckin(uuid, name);
});

// ── CSV Export ────────────────────────────────────────────────────────────────
document.getElementById('btn-export-csv').addEventListener('click', async () => {
    try {
        // Get freshest data for export
        const res = await fetch(`${API}/api/hackers`);
        const data = await res.json();
        const rows = [['Name', 'Email', 'UUID', 'Checked In', 'Check-In Time']];
        data.forEach(h => rows.push([
            h.name,
            h.email || '',
            h.uuid,
            h.checkedIn ? 'Yes' : 'No',
            h.checkinTime ? new Date(h.checkinTime).toLocaleString() : '',
        ]));
        const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hacker-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported!', 'success');
    } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
    }
});

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

// ── Meal Check-In ─────────────────────────────────────────────────────────────

const MEAL_LABELS = { breakfast: '🍳 Breakfast', lunch: '🥗 Lunch', dinner: '🍽 Dinner' };

/**
 * Renders three meal pill buttons for a given uuid (used as RSVP_list id).
 * status = { breakfast: bool, lunch: bool, dinner: bool } (all default false when unknown)
 */
function buildMealButtons(uuid, status) {
    return ['breakfast', 'lunch', 'dinner'].map(meal => {
        const done = status[meal] === true;
        const cls = done ? 'btn-meal btn-meal--done' : 'btn-meal';
        const label = done ? `✓ ${MEAL_LABELS[meal]}` : MEAL_LABELS[meal];
        return `<button class="${cls}" data-meal="${meal}" data-id="${escHtml(uuid)}" ${done ? 'disabled' : ''}>${label}</button>`;
    }).join('');
}

/**
 * Fetches real meal status from /api/meals/status?id=... and updates the buttons.
 * scope = 'row'    → looks for #meals-row-<uuid>
 * scope = 'search' → looks for #meals-search-<uuid>
 */
async function loadMealStatus(uuid, scope) {
    try {
        const res = await fetch(`${API}/api/meals/status?id=${encodeURIComponent(uuid)}`);
        const data = await res.json();
        if (data.status !== 'ok') return;

        const containerId = scope === 'row' ? `meals-row-${uuid}` : `meals-search-${uuid}`;
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = buildMealButtons(uuid, {
            breakfast: data.breakfast,
            lunch: data.lunch,
            dinner: data.dinner,
        });
    } catch (_) { /* silent — buttons stay in default state */ }
}

/**
 * Fires a POST /api/meals/:meal with { id } in the body.
 * Updates button groups on success.
 */
async function mealCheckin(btn, meal, id) {
    btn.disabled = true;
    btn.textContent = '…';

    try {
        const res = await fetch(`${API}/api/meals/${meal}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        const data = await res.json();

        if (data.status === 'ok') {
            showToast(`${MEAL_LABELS[meal]} checked in!`, 'success');
            ['row', 'search'].forEach(scope => loadMealStatus(id, scope));
        } else if (data.status === 'already_checked_in') {
            showToast(`${MEAL_LABELS[meal]} already marked.`, '');
            ['row', 'search'].forEach(scope => loadMealStatus(id, scope));
        } else if (data.status === 'not_found') {
            showToast(`ID "${id}" was not found in RSVP_list.`, 'error');
            btn.disabled = false;
            btn.textContent = MEAL_LABELS[meal];
        } else {
            showToast('Error: ' + (data.error || 'Unknown'), 'error');
            btn.disabled = false;
            btn.textContent = MEAL_LABELS[meal];
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = MEAL_LABELS[meal];
    }
}

// Delegated click handler — catches .btn-meal clicks anywhere on the page
document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-meal');
    if (!btn || btn.disabled) return;
    const { meal, id } = btn.dataset;
    mealCheckin(btn, meal, id);
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadHackers();
// Auto-refresh every 15 seconds to pick up scans from other devices
setInterval(loadHackers, 15000);

