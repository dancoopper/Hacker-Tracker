/**
 * admin.js — Admin dashboard logic
 * Loads hacker list, renders table with check-in status, handles add modal, CSV export.
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

// ── Data ──────────────────────────────────────────────────────────────────────
let hackers = [];

// ── Load & Render ─────────────────────────────────────────────────────────────
async function loadHackers() {
    try {
        const res = await fetch(`${API}/api/hackers`);
        hackers = await res.json();
        renderTable(hackers);
        updateStats(hackers);
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

        return `
      <tr>
        <td style="font-weight:600;">${escHtml(h.name)}</td>
        <td>${emailStr}</td>
        <td class="mono" style="font-size:0.78rem;color:var(--text-muted);">${escHtml(h.uuid)}</td>
        <td>${badge}</td>
        <td style="color:var(--text-secondary);">${timeStr}</td>
        <td>${actions}</td>
      </tr>
    `;
    }).join('');
}

function updateStats(data) {
    const total = data.length;
    const checkedIn = data.filter(h => h.checkedIn).length;
    statTotal.textContent = total;
    statIn.textContent = checkedIn;
    statRemain.textContent = total - checkedIn;
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

// ── Init ──────────────────────────────────────────────────────────────────────
loadHackers();
// Auto-refresh every 15 seconds to pick up scans from other devices
setInterval(loadHackers, 15000);
