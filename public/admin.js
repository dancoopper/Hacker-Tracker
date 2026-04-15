/**
 * admin.js — Admin dashboard logic
 * Loads hacker list, renders table with per-meal check-in status,
 * handles add modal, CSV export, and per-meal undo.
 */

const API = '';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const tbody      = document.getElementById('hacker-tbody');
const statTotal  = document.getElementById('stat-total');
const statIn     = document.getElementById('stat-checkedin');
const statRemain = document.getElementById('stat-remaining');
const searchInput = document.getElementById('search-input');
const addModal   = document.getElementById('add-modal');
const addForm    = document.getElementById('add-hacker-form');

// ── Data ──────────────────────────────────────────────────────────────────────
let hackers   = [];
let mealTypes = [];   // loaded from /api/meal-types — drives all column logic

// ── Load meal types first, THEN hackers ───────────────────────────────────────
async function init() {
    try {
        const res = await fetch(`${API}/api/meal-types`);
        mealTypes = await res.json();
    } catch (e) {
        console.warn('Could not load meal types; table will have no meal columns.', e);
    }
    await loadHackers();
    // Auto-refresh every 15 s to pick up scans from other devices
    setInterval(loadHackers, 15000);
}

// ── Load & Render ─────────────────────────────────────────────────────────────
async function loadHackers() {
    try {
        const res = await fetch(`${API}/api/hackers`);
        hackers   = await res.json();
        renderTable(hackers);
        updateStats(hackers);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="${4 + mealTypes.length}" style="color:var(--accent-red);padding:1rem;">Error loading data: ${escHtml(err.message)}</td></tr>`;
    }
}

function renderTable(data) {
    const span = 4 + mealTypes.length; // Name + Email + UUID + meals... + First Check-in
    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="${span}" class="empty-state" style="padding:2rem;"><div class="empty-icon">👤</div>No hackers registered yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(h => {
        // Build a map for quick lookup: mealId → checkin record
        const mealMap = new Map((h.meals || []).map(m => [m.mealType, m]));

        // One cell per configured meal type
        const mealCells = mealTypes.map(mt => {
            const record = mealMap.get(mt.id);
            if (record) {
                const when = new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `<td>
          <span class="meal-chip meal-chip--${mt.color}"
                data-uuid="${escHtml(h.uuid)}"
                data-meal="${escHtml(mt.id)}"
                data-name="${escHtml(h.name)}"
                title="Undo ${mt.label} check-in">
            ${mt.emoji} ${mt.label}
            <span class="meal-chip-time">${when}</span>
            <span class="meal-chip-undo" aria-label="Undo">✕</span>
          </span>
        </td>`;
            }
            return `<td><span class="meal-chip meal-chip--empty">—</span></td>`;
        }).join('');

        const firstTime = h.checkinTime
            ? new Date(h.checkinTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';
        const emailStr = h.email
            ? escHtml(h.email)
            : `<span style="color:var(--text-muted)">—</span>`;

        return `
      <tr>
        <td style="font-weight:600;">${escHtml(h.name)}</td>
        <td>${emailStr}</td>
        <td class="mono" style="font-size:0.78rem;color:var(--text-muted);">${escHtml(h.uuid)}</td>
        ${mealCells}
        <td style="color:var(--text-secondary);">${firstTime}</td>
      </tr>
    `;
    }).join('');

    // Update thead dynamically to match configured meals
    updateTableHead();
}

function updateTableHead() {
    const thead = document.querySelector('#hacker-table thead tr');
    if (!thead) return;
    // Build: Name | Email | UUID | [meal cols] | First Check-in
    const mealHeaders = mealTypes.map(mt =>
        `<th>${mt.emoji} ${mt.label}</th>`
    ).join('');
    thead.innerHTML = `
      <th>Name</th>
      <th>Email</th>
      <th>UUID</th>
      ${mealHeaders}
      <th>First Check-In</th>
    `;
}

function updateStats(data) {
    const total     = data.length;
    const checkedIn = data.filter(h => h.checkedIn).length;
    statTotal.textContent  = total;
    statIn.textContent     = checkedIn;
    statRemain.textContent = total - checkedIn;
}

// ── Per-meal undo (delegated click on .meal-chip-undo) ────────────────────────
tbody.addEventListener('click', async e => {
    // Undo button inside a chip
    if (e.target.classList.contains('meal-chip-undo')) {
        const chip = e.target.closest('.meal-chip');
        if (!chip) return;
        const { uuid, meal, name } = chip.dataset;
        const mealMeta = mealTypes.find(m => m.id === meal);
        const mealLabel = mealMeta ? `${mealMeta.emoji} ${mealMeta.label}` : meal;
        if (!confirm(`Remove ${mealLabel} check-in for ${name}?`)) return;
        await undoMeal(uuid, meal, name);
    }
});

async function undoMeal(uuid, mealType, name) {
    try {
        const res  = await fetch(`${API}/api/checkins/${encodeURIComponent(uuid)}?meal=${encodeURIComponent(mealType)}`, {
            method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok) {
            showToast('Error: ' + (data.error || 'Unknown'), 'error');
        } else {
            const mealMeta = mealTypes.find(m => m.id === mealType);
            showToast(`Undid ${mealMeta?.label ?? mealType} for ${name}`, 'success');
            await loadHackers();
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
    }
}

// ── Search ────────────────────────────────────────────────────────────────────
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

// ── Add Hacker Modal ──────────────────────────────────────────────────────────
document.getElementById('btn-open-add').addEventListener('click', () => openModal());
document.getElementById('btn-close-modal').addEventListener('click', () => closeModal());
document.getElementById('btn-cancel-add').addEventListener('click', () => closeModal());
addModal.addEventListener('click', e => { if (e.target === addModal) closeModal(); });

function openModal()  { addForm.reset(); addModal.classList.add('open'); document.getElementById('input-name').focus(); }
function closeModal() { addModal.classList.remove('open'); }

addForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-add');
    btn.disabled = true;
    btn.textContent = 'Adding…';

    const body = {
        name:  document.getElementById('input-name').value.trim(),
        email: document.getElementById('input-email').value.trim() || undefined,
        uuid:  document.getElementById('input-uuid').value.trim()  || undefined,
    };

    try {
        const res  = await fetch(`${API}/api/hackers`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
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

// ── CSV Export ────────────────────────────────────────────────────────────────
document.getElementById('btn-export-csv').addEventListener('click', async () => {
    try {
        const res  = await fetch(`${API}/api/hackers`);
        const data = await res.json();

        const mealHeaders = mealTypes.map(mt => mt.label);
        const rows = [['Name', 'Email', 'UUID', ...mealHeaders, 'First Check-In']];

        data.forEach(h => {
            const mealMap = new Map((h.meals || []).map(m => [m.mealType, m]));
            const mealCols = mealTypes.map(mt => {
                const r = mealMap.get(mt.id);
                return r ? new Date(r.timestamp).toLocaleString() : '';
            });
            rows.push([
                h.name,
                h.email || '',
                h.uuid,
                ...mealCols,
                h.checkinTime ? new Date(h.checkinTime).toLocaleString() : '',
            ]);
        });

        const csv  = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
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

// ── Start ─────────────────────────────────────────────────────────────────────
init();
