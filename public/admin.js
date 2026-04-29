/**
 * admin.js — Meal Admin dashboard logic
 * Shows per-meal totals and the QR meal tracker table with +/− controls.
 */

const API = '';

// ── Utilities ─────────────────────────────────────────────────────────────────
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(message, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className  = `toast ${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ── QR Meal Tracker ───────────────────────────────────────────────────────────

const qrMealsTbody = document.getElementById('qr-meals-tbody');
const QR_MEAL_LABELS = { breakfast: '🍳', lunch: '🥗', dinner: '🍽' };

async function loadQrMeals() {
    try {
        const res  = await fetch(`${API}/api/qrmeals`);
        const rows = await res.json();
        renderQrMealsTable(rows);
        updateMealTotals(rows);
    } catch (err) {
        qrMealsTbody.innerHTML = `<tr><td colspan="5" style="color:var(--accent-red);padding:1rem;">Error: ${escHtml(err.message)}</td></tr>`;
    }
}

function updateMealTotals(rows) {
    const totals = rows.reduce((acc, r) => {
        acc.breakfast += r.breakfast ?? 0;
        acc.lunch     += r.lunch     ?? 0;
        acc.dinner    += r.dinner    ?? 0;
        return acc;
    }, { breakfast: 0, lunch: 0, dinner: 0 });

    document.getElementById('stat-breakfast').textContent = totals.breakfast;
    document.getElementById('stat-lunch').textContent     = totals.lunch;
    document.getElementById('stat-dinner').textContent    = totals.dinner;
}

function renderQrMealsTable(rows) {
    if (!rows.length) {
        qrMealsTbody.innerHTML = `<tr><td colspan="5" class="empty-state" style="padding:2rem;"><div class="empty-icon">📭</div>No QR codes scanned yet.</td></tr>`;
        return;
    }

    qrMealsTbody.innerHTML = rows.map(row => {
        const short      = row.code.length > 32 ? row.code.slice(0, 32) + '…' : row.code;
        const lastUpdate = row.last_updated ? new Date(row.last_updated).toLocaleString() : '—';

        const mealCell = (meal) => `
          <td style="text-align:center;">
            <div style="display:flex;align-items:center;justify-content:center;gap:0.4rem;">
              <button class="btn btn-ghost btn-qr-remove"
                      data-code="${escHtml(row.code)}" data-meal="${meal}"
                      style="padding:0.15rem 0.45rem;font-size:0.8rem;"
                      title="Remove 1 ${meal}">−</button>
              <span style="min-width:1.8rem;text-align:center;font-weight:600;">${row[meal] ?? 0}</span>
              <button class="btn btn-ghost btn-qr-add"
                      data-code="${escHtml(row.code)}" data-meal="${meal}"
                      style="padding:0.15rem 0.45rem;font-size:0.8rem;"
                      title="Add 1 ${meal}">+</button>
            </div>
          </td>`;

        return `
          <tr>
            <td class="mono" style="font-size:0.78rem;color:var(--text-muted);" title="${escHtml(row.code)}">${escHtml(short)}</td>
            ${mealCell('breakfast')}
            ${mealCell('lunch')}
            ${mealCell('dinner')}
            <td style="color:var(--text-secondary);font-size:0.82rem;">${lastUpdate}</td>
          </tr>`;
    }).join('');
}

// Delegated click handler for + and − buttons
document.getElementById('qr-meals-section').addEventListener('click', async e => {
    const addBtn    = e.target.closest('.btn-qr-add');
    const removeBtn = e.target.closest('.btn-qr-remove');
    const btn       = addBtn || removeBtn;
    if (!btn) return;

    const { code, meal } = btn.dataset;
    const action = addBtn ? 'add' : 'remove';
    btn.disabled    = true;
    btn.textContent = '…';

    try {
        const res = await fetch(`${API}/api/qrmeals/${encodeURIComponent(code)}/${action}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ meal }),
        });
        const data = await res.json();
        if (!res.ok) {
            showToast('Error: ' + (data.error || 'Unknown'), 'error');
            btn.disabled    = false;
            btn.textContent = action === 'add' ? '+' : '−';
        } else {
            showToast(`${QR_MEAL_LABELS[meal]} ${meal} ${action === 'add' ? 'added' : 'removed'}`, 'success');
            await loadQrMeals();
        }
    } catch (err) {
        showToast('Network error: ' + err.message, 'error');
        btn.disabled    = false;
        btn.textContent = action === 'add' ? '+' : '−';
    }
});

document.getElementById('btn-refresh-qr').addEventListener('click', loadQrMeals);

// ── Init ──────────────────────────────────────────────────────────────────────
loadQrMeals();
setInterval(loadQrMeals, 15000);
