// ═══════════════════════════════════════════════════════════════════════
// Mayorcity E-Mart — Admin Dashboard (ES Module)
// ═══════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_CONFIGURED = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
const supabase = SUPABASE_CONFIGURED
    ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

let currentUser    = null;
let currentProfile = null;
let allUsers       = [];
let allListings    = [];
let allReports     = [];

// ═══════════════════════════════════════════════════════════════════════
// TOAST (minimal — reuse same pattern)
// ═══════════════════════════════════════════════════════════════════════
const TOAST_ICONS  = { success:'✓', error:'✕', warning:'!', info:'i' };
const TOAST_TITLES = { success:'Success', error:'Error', warning:'Notice', info:'Info' };

function showToast(message, type = 'info', duration = 4500) {
    let c = document.getElementById('toast-container');
    if (!c) { c = document.createElement('div'); c.id = 'toast-container'; document.body.appendChild(c); }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.setAttribute('role', 'alert');
    t.innerHTML = `
        <div class="toast-icon-wrap toast-icon-${type}">${TOAST_ICONS[type]||'i'}</div>
        <div class="toast-body">
            <p class="toast-title">${TOAST_TITLES[type]||'Info'}</p>
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
        <div class="toast-progress toast-progress-${type}"></div>`;
    c.appendChild(t);
    const close = () => { t.classList.add('toast-exit'); t.addEventListener('animationend', () => t.remove(), { once: true }); };
    t.querySelector('.toast-close').addEventListener('click', close);
    const timer = setTimeout(close, duration);
    t.querySelector('.toast-close').addEventListener('click', () => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════════════════
function showConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
        const o = document.createElement('div');
        o.className = 'dialog-overlay';
        o.setAttribute('role', 'dialog');
        o.setAttribute('aria-modal', 'true');
        o.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon-wrap dialog-icon-${danger ? 'danger' : 'warning'}">${danger ? '🗑' : '⚠'}</div>
                <h3 class="dialog-title">${title}</h3>
                <p class="dialog-message">${message}</p>
                <div class="dialog-actions">
                    <button class="dialog-btn dialog-btn-cancel">${cancelText}</button>
                    <button class="dialog-btn dialog-btn-${danger ? 'danger' : 'primary'}">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(o);
        const style = danger ? 'danger' : 'primary';
        requestAnimationFrame(() => o.querySelector(`.dialog-btn-${style}`)?.focus());
        const cleanup = v => { o.classList.add('dialog-exit'); o.addEventListener('animationend', () => { o.remove(); resolve(v); }, { once: true }); };
        o.querySelector('.dialog-btn-cancel').addEventListener('click', () => cleanup(false));
        o.querySelector(`.dialog-btn-${style}`).addEventListener('click', () => cleanup(true));
        o.addEventListener('click', e => { if (e.target === o) cleanup(false); });
        o.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(false); });
    });
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════
async function logAction(action, targetType, targetId, details = {}) {
    await supabase.from('audit_log').insert({
        actor_id:    currentUser?.id    || null,
        actor_email: currentUser?.email || '',
        action,
        target_type: targetType,
        target_id:   String(targetId),
        details
    });
}

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════
function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
    const map = {
        pending:   'badge-warning',
        verified:  'badge-verified',
        rejected:  'badge-error',
        suspended: 'badge-error',
        Active:    'badge-market',
        Sold:      'badge-sold',
        Hidden:    'badge-hidden',
        Removed:   'badge-error',
    };
    return `<span class="badge ${map[status] || 'badge-cat'}">${status}</span>`;
}

function roleBadge(role) {
    const map = { admin: 'badge-admin', moderator: 'badge-mod', user: 'badge-cat' };
    return `<span class="badge ${map[role] || 'badge-cat'}">${role}</span>`;
}

function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ═══════════════════════════════════════════════════════════════════════
function switchTab(tabName) {
    document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
    if (tabName === 'verification') loadVerification();
    if (tabName === 'users')        loadUsers();
    if (tabName === 'listings')     loadAllListings();
    if (tabName === 'reports')      loadReports();
    if (tabName === 'audit')        loadAuditLog();
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════
async function loadOverview() {
    const [profilesRes, listingsRes, reportsRes, recentRes] = await Promise.all([
        supabase.from('profiles').select('verification_status, role'),
        supabase.from('listings').select('status'),
        supabase.from('reports').select('status').eq('status', 'pending'),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(10)
    ]);

    const profiles   = profilesRes.data  || [];
    const listings   = listingsRes.data  || [];
    const reports    = reportsRes.data   || [];
    const recentLogs = recentRes.data    || [];

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('ov-total-users', profiles.length);
    set('ov-pending',     profiles.filter(p => p.verification_status === 'pending').length);
    set('ov-verified',    profiles.filter(p => p.verification_status === 'verified').length);
    set('ov-listings',    listings.length);
    set('ov-reports',     reports.length);
    set('ov-hidden',      listings.filter(l => l.status === 'Hidden').length);

    // Badges
    const verifBadge  = profiles.filter(p => p.verification_status === 'pending').length;
    const reportBadge = reports.length;
    const bv = document.getElementById('badge-verification');
    const br = document.getElementById('badge-reports');
    if (bv) bv.textContent = verifBadge;
    if (br) br.textContent = reportBadge;

    // Recent activity
    const actEl = document.getElementById('recent-activity');
    if (actEl) {
        if (recentLogs.length === 0) {
            actEl.innerHTML = '<p class="admin-empty-msg">No recent activity.</p>';
        } else {
            actEl.innerHTML = recentLogs.map(log => `
                <div class="audit-row">
                    <span class="audit-action">${esc(log.action)}</span>
                    <span class="audit-target">${esc(log.target_type)} ${esc(log.target_id)}</span>
                    <span class="audit-actor">${esc(log.actor_email)}</span>
                    <span class="audit-time">${formatDate(log.created_at)}</span>
                </div>`).join('');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// VERIFICATION QUEUE
// ═══════════════════════════════════════════════════════════════════════
async function loadVerification() {
    const statusFilter = document.getElementById('verif-status-filter')?.value || 'pending';
    const listEl       = document.getElementById('verif-list');
    if (listEl) listEl.innerHTML = '<p class="admin-empty-msg">Loading…</p>';

    const { data, error } = await supabase
        .from('student_verifications')
        .select('*')
        .eq('status', statusFilter)
        .order('submitted_at', { ascending: true });

    if (error) { if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">Error: ${esc(error.message)}</p>`; return; }

    if (!data?.length) {
        if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">No ${statusFilter} verification requests.</p>`;
        return;
    }

    // student-ids is a PRIVATE bucket, so the stored value is just a storage
    // path (e.g. "userId/student-id.jpg"), not a directly-loadable URL.
    // Generate a short-lived signed URL per row before rendering so the
    // thumbnail and preview modal actually display the image.
    const signedUrls = await Promise.all(data.map(async v => {
        if (!v.student_id_url) return null;
        try {
            const { data: signed, error: signErr } = await supabase.storage
                .from('student-ids')
                .createSignedUrl(v.student_id_url, 3600); // 1 hour
            if (signErr) return null;
            return signed?.signedUrl || null;
        } catch (_) { return null; }
    }));

    if (listEl) {
        listEl.innerHTML = data.map((v, i) => {
            const signedUrl = signedUrls[i];
            return `
            <div class="verif-card" data-id="${esc(v.id)}" data-user-id="${esc(v.user_id)}">
                <div class="verif-id-section">
                    ${signedUrl
                        ? `<img src="${esc(signedUrl)}" alt="Student ID"
                               class="verif-id-thumb" data-src="${esc(signedUrl)}"
                               data-name="${esc(v.full_name)}">`
                        : v.student_id_url
                            ? `<div class="verif-no-id">ID on file — preview unavailable</div>`
                            : `<div class="verif-no-id">No ID uploaded</div>`}
                </div>
                <div class="verif-details">
                    <h4 class="verif-name">${esc(v.full_name)}</h4>
                    <p><strong>Email:</strong> ${esc(v.email)}</p>
                    <p><strong>Phone:</strong> ${esc(v.phone)}</p>
                    <p><strong>Matric:</strong> ${esc(v.matric_number)}</p>
                    <p><strong>Dept:</strong> ${esc(v.department)}</p>
                    <p><strong>Level:</strong> ${esc(v.level)}</p>
                    <p><strong>Submitted:</strong> ${formatDate(v.submitted_at)}</p>
                    <p><strong>Status:</strong> ${statusBadge(v.status)}</p>
                    ${v.review_note ? `<p class="verif-note"><strong>Note:</strong> ${esc(v.review_note)}</p>` : ''}
                </div>
                ${statusFilter === 'pending' ? `
                <div class="verif-actions">
                    <button class="admin-action-btn approve-verif-btn"
                            data-id="${esc(v.id)}" data-user-id="${esc(v.user_id)}" data-name="${esc(v.full_name)}">
                        ✓ Approve
                    </button>
                    <button class="admin-action-btn danger-btn reject-verif-btn"
                            data-id="${esc(v.id)}" data-user-id="${esc(v.user_id)}" data-name="${esc(v.full_name)}">
                        ✕ Reject
                    </button>
                </div>` : ''}
            </div>`).join('');

        // ID image preview
        listEl.querySelectorAll('.verif-id-thumb').forEach(img => {
            img.addEventListener('click', () => {
                const modal    = document.getElementById('id-preview-modal');
                const imgEl    = document.getElementById('id-preview-img');
                const nameEl   = document.getElementById('id-preview-name');
                if (imgEl)  imgEl.src        = img.dataset.src;
                if (nameEl) nameEl.textContent = img.dataset.name;
                if (modal)  modal.style.display = 'flex';
            });
        });

        // Approve
        listEl.querySelectorAll('.approve-verif-btn').forEach(btn => {
            btn.addEventListener('click', () => approveVerification(btn.dataset.id, btn.dataset.userId, btn.dataset.name));
        });

        // Reject
        listEl.querySelectorAll('.reject-verif-btn').forEach(btn => {
            btn.addEventListener('click', () => rejectVerification(btn.dataset.id, btn.dataset.userId, btn.dataset.name));
        });
    }
}

async function approveVerification(verifId, userId, name) {
    const ok = await showConfirm({
        title:       'Approve Verification',
        message:     `Approve <strong>${esc(name)}</strong>? Their account will be marked Verified and they can post listings.`,
        confirmText: 'Approve'
    });
    if (!ok) return;

    const now = new Date().toISOString();
    const [r1, r2] = await Promise.all([
        supabase.from('student_verifications').update({ status: 'verified', reviewed_by: currentUser.id, reviewed_at: now }).eq('id', verifId),
        supabase.from('profiles').update({ verification_status: 'verified' }).eq('id', userId)
    ]);
    if (r1.error || r2.error) { showToast('Failed to approve: ' + (r1.error?.message || r2.error?.message), 'error'); return; }

    await logAction('APPROVE_VERIFICATION', 'user', userId, { name, verif_id: verifId });
    showToast(`${name} is now Verified.`, 'success');
    await loadOverview();
    loadVerification();
}

async function rejectVerification(verifId, userId, name) {
    const note = await new Promise(resolve => {
        const o = document.createElement('div');
        o.className = 'dialog-overlay';
        o.setAttribute('role', 'dialog');
        o.setAttribute('aria-modal', 'true');
        o.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon-wrap dialog-icon-danger">✕</div>
                <h3 class="dialog-title">Reject Verification</h3>
                <p class="dialog-message">Provide a reason for rejecting <strong>${esc(name)}</strong>:</p>
                <input class="dialog-input dialog-input-left" type="text"
                       placeholder="e.g. ID photo unclear, fake matric number…">
                <div class="dialog-actions">
                    <button class="dialog-btn dialog-btn-cancel">Cancel</button>
                    <button class="dialog-btn dialog-btn-danger">Reject</button>
                </div>
            </div>`;
        document.body.appendChild(o);
        const input = o.querySelector('.dialog-input');
        requestAnimationFrame(() => input.focus());
        const cleanup = v => { o.classList.add('dialog-exit'); o.addEventListener('animationend', () => { o.remove(); resolve(v); }, { once: true }); };
        o.querySelector('.dialog-btn-cancel').addEventListener('click', () => cleanup(null));
        o.querySelector('.dialog-btn-danger').addEventListener('click', () => cleanup(input.value.trim() || 'No reason provided'));
        o.addEventListener('click', e => { if (e.target === o) cleanup(null); });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') cleanup(input.value.trim() || 'No reason provided'); if (e.key === 'Escape') cleanup(null); });
    });
    if (!note) return;

    const now = new Date().toISOString();
    const [r1, r2] = await Promise.all([
        supabase.from('student_verifications').update({ status: 'rejected', reviewed_by: currentUser.id, reviewed_at: now, review_note: note }).eq('id', verifId),
        supabase.from('profiles').update({ verification_status: 'rejected' }).eq('id', userId)
    ]);
    if (r1.error || r2.error) { showToast('Failed to reject: ' + (r1.error?.message || r2.error?.message), 'error'); return; }

    await logAction('REJECT_VERIFICATION', 'user', userId, { name, note, verif_id: verifId });
    showToast(`${name}'s verification rejected.`, 'warning');
    await loadOverview();
    loadVerification();
}

// ═══════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════
async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="admin-empty-msg">Loading…</td></tr>';

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="admin-empty-msg">Error: ${esc(error.message)}</td></tr>`; return; }
    allUsers = data || [];
    renderUsers();
}

function renderUsers() {
    const tbody       = document.getElementById('users-tbody');
    const searchVal   = (document.getElementById('user-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('user-status-filter')?.value || '';
    const roleFilter   = document.getElementById('user-role-filter')?.value || '';

    let filtered = allUsers.filter(u => {
        const matchSearch = !searchVal ||
            (u.full_name || '').toLowerCase().includes(searchVal) ||
            (u.email || '').toLowerCase().includes(searchVal) ||
            (u.matric_number || '').toLowerCase().includes(searchVal);
        const matchStatus = !statusFilter || u.verification_status === statusFilter;
        const matchRole   = !roleFilter   || u.role === roleFilter;
        return matchSearch && matchStatus && matchRole;
    });

    if (!tbody) return;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" class="admin-empty-msg">No users found.</td></tr>'; return; }

    const isAdmin = currentProfile?.role === 'admin';

    tbody.innerHTML = filtered.map(u => `
        <tr data-id="${esc(u.id)}">
            <td>${esc(u.full_name) || '<em>Unknown</em>'}</td>
            <td>${esc(u.email)}</td>
            <td>${esc(u.matric_number) || '—'}</td>
            <td>${esc(u.department) || '—'}</td>
            <td>${esc(u.level) || '—'}</td>
            <td>${statusBadge(u.verification_status)}</td>
            <td>${roleBadge(u.role)}</td>
            <td>${formatDate(u.created_at)}</td>
            <td class="action-cell">
                ${isAdmin ? `
                    ${u.verification_status !== 'suspended'
                        ? `<button class="admin-action-btn danger-btn suspend-btn"
                                  data-id="${esc(u.id)}" data-name="${esc(u.full_name)}"
                                  title="Suspend">Suspend</button>`
                        : `<button class="admin-action-btn reactivate-btn"
                                  data-id="${esc(u.id)}" data-name="${esc(u.full_name)}"
                                  title="Reactivate">Reactivate</button>`}
                    <select class="admin-role-select" data-id="${esc(u.id)}" data-name="${esc(u.full_name)}" title="Change role">
                        <option value="user"      ${u.role === 'user'      ? 'selected':''}>User</option>
                        <option value="moderator" ${u.role === 'moderator' ? 'selected':''}>Moderator</option>
                        <option value="admin"     ${u.role === 'admin'     ? 'selected':''}>Admin</option>
                    </select>
                    <button class="admin-action-btn danger-btn delete-user-btn"
                            data-id="${esc(u.id)}" data-name="${esc(u.full_name)}"
                            title="Delete account">Delete</button>
                ` : '—'}
            </td>
        </tr>`).join('');

    // Suspend / Reactivate
    tbody.querySelectorAll('.suspend-btn').forEach(btn => {
        btn.addEventListener('click', () => suspendUser(btn.dataset.id, btn.dataset.name, true));
    });
    tbody.querySelectorAll('.reactivate-btn').forEach(btn => {
        btn.addEventListener('click', () => suspendUser(btn.dataset.id, btn.dataset.name, false));
    });

    // Role change
    tbody.querySelectorAll('.admin-role-select').forEach(sel => {
        sel.addEventListener('change', () => changeUserRole(sel.dataset.id, sel.dataset.name, sel.value, sel));
    });

    // Delete
    tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.id, btn.dataset.name));
    });
}

async function suspendUser(userId, name, suspend) {
    const action = suspend ? 'Suspend' : 'Reactivate';
    const ok = await showConfirm({
        title:       `${action} User`,
        message:     `${action} account for <strong>${esc(name)}</strong>?`,
        confirmText: action,
        danger:      suspend
    });
    if (!ok) return;

    const newStatus = suspend ? 'suspended' : 'verified';
    const { error } = await supabase.from('profiles').update({ verification_status: newStatus }).eq('id', userId);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }

    await logAction(suspend ? 'SUSPEND_USER' : 'REACTIVATE_USER', 'user', userId, { name });
    showToast(`${name} has been ${suspend ? 'suspended' : 'reactivated'}.`, suspend ? 'warning' : 'success');
    loadUsers();
}

async function changeUserRole(userId, name, newRole, selectEl) {
    const ok = await showConfirm({
        title:       'Change Role',
        message:     `Change <strong>${esc(name)}</strong>'s role to <strong>${newRole}</strong>?`,
        confirmText: 'Change Role'
    });
    if (!ok) { loadUsers(); return; } // revert select

    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) { showToast('Failed: ' + error.message, 'error'); loadUsers(); return; }

    await logAction('CHANGE_ROLE', 'user', userId, { name, new_role: newRole });
    showToast(`${name} is now a ${newRole}.`, 'success');
    loadUsers();
}

async function deleteUser(userId, name) {
    if (userId === currentUser?.id) { showToast('You cannot delete your own account.', 'error'); return; }
    const ok = await showConfirm({
        title:       'Delete User Account',
        message:     `Permanently delete account for <strong>${esc(name)}</strong>? This will remove their profile and all associated data.`,
        confirmText: 'Delete Account',
        danger:      true
    });
    if (!ok) return;

    // Delete profile (cascade handles child rows due to ON DELETE CASCADE)
    const { error } = await supabase.from('profiles').delete().eq('id', userId);
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); return; }

    await logAction('DELETE_USER', 'user', userId, { name });
    showToast(`Account for ${name} has been deleted.`, 'success');
    loadUsers();
    loadOverview();
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS (ADMIN VIEW)
// ═══════════════════════════════════════════════════════════════════════
async function loadAllListings() {
    const tbody = document.getElementById('listings-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="admin-empty-msg">Loading…</td></tr>';

    const { data, error } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="admin-empty-msg">Error: ${esc(error.message)}</td></tr>`; return; }
    allListings = data || [];
    renderListings();
}

function renderListings() {
    const tbody        = document.getElementById('listings-tbody');
    const searchVal    = (document.getElementById('listing-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('listing-status-filter')?.value || '';
    const typeFilter   = document.getElementById('listing-type-filter')?.value   || '';

    let filtered = allListings.filter(l => {
        const matchSearch = !searchVal ||
            (l.product_name || '').toLowerCase().includes(searchVal) ||
            (l.emart_id     || '').toLowerCase().includes(searchVal) ||
            (l.seller_name  || '').toLowerCase().includes(searchVal);
        const matchStatus = !statusFilter || l.status === statusFilter;
        const matchType   = !typeFilter   || l.type   === typeFilter;
        return matchSearch && matchStatus && matchType;
    });

    if (!tbody) return;
    if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="9" class="admin-empty-msg">No listings found.</td></tr>'; return; }

    tbody.innerHTML = filtered.map(l => `
        <tr data-id="${esc(l.id)}">
            <td class="emart-id-cell">${esc(l.emart_id)}</td>
            <td>${esc(l.product_name)}</td>
            <td>${l.type === 'Market' ? 'For Sale' : 'Lost & Found'}</td>
            <td>${l.type === 'Market' ? `₦${Number(l.price||0).toLocaleString()}` : '—'}</td>
            <td>${esc(l.seller_name)}</td>
            <td>${statusBadge(l.status)}</td>
            <td class="${l.reports >= 3 ? 'high-reports' : ''}">${l.reports}</td>
            <td>${formatDate(l.created_at)}</td>
            <td class="action-cell">
                ${l.status === 'Active'  ? `<button class="admin-action-btn hide-listing-btn"    data-id="${esc(l.id)}" data-name="${esc(l.product_name)}">Hide</button>` : ''}
                ${l.status === 'Hidden'  ? `<button class="admin-action-btn restore-listing-btn" data-id="${esc(l.id)}" data-name="${esc(l.product_name)}">Restore</button>` : ''}
                ${l.status === 'Active'  ? `<button class="admin-action-btn mark-sold-btn"       data-id="${esc(l.id)}" data-name="${esc(l.product_name)}">Mark Sold</button>` : ''}
                <button class="admin-action-btn danger-btn delete-listing-btn"
                        data-id="${esc(l.id)}" data-name="${esc(l.product_name)}">Delete</button>
            </td>
        </tr>`).join('');

    tbody.querySelectorAll('.hide-listing-btn').forEach(btn => {
        btn.addEventListener('click', () => changeListingStatus(btn.dataset.id, btn.dataset.name, 'Hidden'));
    });
    tbody.querySelectorAll('.restore-listing-btn').forEach(btn => {
        btn.addEventListener('click', () => changeListingStatus(btn.dataset.id, btn.dataset.name, 'Active'));
    });
    tbody.querySelectorAll('.mark-sold-btn').forEach(btn => {
        btn.addEventListener('click', () => changeListingStatus(btn.dataset.id, btn.dataset.name, 'Sold'));
    });
    tbody.querySelectorAll('.delete-listing-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteListingAdmin(btn.dataset.id, btn.dataset.name));
    });
}

async function changeListingStatus(id, name, status) {
    const { error } = await supabase.from('listings').update({ status }).eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAction(`LISTING_${status.toUpperCase()}`, 'listing', id, { name });
    showToast(`Listing "${name}" set to ${status}.`, 'success');
    allListings = allListings.map(l => l.id === id ? { ...l, status } : l);
    renderListings();
}

async function deleteListingAdmin(id, name) {
    const ok = await showConfirm({
        title:       'Delete Listing',
        message:     `Permanently delete "<strong>${esc(name)}</strong>"? This cannot be undone.`,
        confirmText: 'Delete',
        danger:      true
    });
    if (!ok) return;
    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAction('DELETE_LISTING', 'listing', id, { name });
    showToast(`Listing "${name}" deleted.`, 'success');
    allListings = allListings.filter(l => l.id !== id);
    renderListings();
    loadOverview();
}

// ═══════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════
async function loadReports() {
    const listEl = document.getElementById('reports-list');
    if (listEl) listEl.innerHTML = '<p class="admin-empty-msg">Loading…</p>';

    const statusFilter = document.getElementById('report-status-filter')?.value || 'pending';
    const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('status', statusFilter)
        .order('created_at', { ascending: false });

    if (error) { if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">Error: ${esc(error.message)}</p>`; return; }

    allReports = data || [];
    if (!allReports.length) {
        if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">No ${statusFilter} reports.</p>`;
        return;
    }

    if (listEl) {
        listEl.innerHTML = allReports.map(r => `
            <div class="report-card" data-id="${esc(r.id)}">
                <div class="report-header">
                    <span class="report-type">${r.reported_listing_id ? '📋 Listing Report' : '👤 User Report'}</span>
                    <span class="report-status">${statusBadge(r.status)}</span>
                </div>
                <p class="report-reason"><strong>Reason:</strong> ${esc(r.reason)}</p>
                <p class="report-meta">
                    ${r.reported_listing_id ? `Listing ID: <code>${esc(r.reported_listing_id)}</code>` : ''}
                    ${r.reported_user_id    ? `User ID: <code>${esc(r.reported_user_id)}</code>` : ''}
                    &nbsp;·&nbsp; Reported: ${formatDate(r.created_at)}
                </p>
                ${statusFilter === 'pending' ? `
                <div class="report-actions">
                    <button class="admin-action-btn resolve-report-btn"  data-id="${esc(r.id)}">✓ Resolve</button>
                    <button class="admin-action-btn danger-btn dismiss-report-btn" data-id="${esc(r.id)}">✕ Dismiss</button>
                </div>` : ''}
            </div>`).join('');

        listEl.querySelectorAll('.resolve-report-btn').forEach(btn => {
            btn.addEventListener('click', () => updateReport(btn.dataset.id, 'resolved'));
        });
        listEl.querySelectorAll('.dismiss-report-btn').forEach(btn => {
            btn.addEventListener('click', () => updateReport(btn.dataset.id, 'dismissed'));
        });
    }
}

async function updateReport(id, status) {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) { showToast('Failed: ' + error.message, 'error'); return; }
    await logAction(`REPORT_${status.toUpperCase()}`, 'report', id);
    showToast(`Report marked as ${status}.`, 'success');
    loadReports();
    loadOverview();
}

// ═══════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════
async function loadAuditLog() {
    const listEl = document.getElementById('audit-list');
    if (listEl) listEl.innerHTML = '<p class="admin-empty-msg">Loading…</p>';

    const searchVal = (document.getElementById('audit-search')?.value || '').toLowerCase();

    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) { if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">Error: ${esc(error.message)}</p>`; return; }

    const logs = (data || []).filter(l =>
        !searchVal ||
        (l.action      || '').toLowerCase().includes(searchVal) ||
        (l.actor_email || '').toLowerCase().includes(searchVal) ||
        (l.target_type || '').toLowerCase().includes(searchVal)
    );

    if (!listEl) return;
    if (!logs.length) { listEl.innerHTML = '<p class="admin-empty-msg">No log entries found.</p>'; return; }

    listEl.innerHTML = logs.map(l => `
        <div class="audit-row">
            <span class="audit-action">${esc(l.action)}</span>
            <span class="audit-target">${esc(l.target_type)} <code>${esc(l.target_id)}</code></span>
            <span class="audit-actor">${esc(l.actor_email)}</span>
            <span class="audit-time">${formatDate(l.created_at)}</span>
            ${Object.keys(l.details||{}).length
                ? `<details class="audit-details"><summary>Details</summary><pre>${esc(JSON.stringify(l.details, null, 2))}</pre></details>`
                : ''}
        </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// SIGN OUT
// ═══════════════════════════════════════════════════════════════════════
document.getElementById('admin-signout-btn')?.addEventListener('click', async () => {
    const ok = await showConfirm({ title: 'Sign Out', message: 'End your admin session?', confirmText: 'Sign Out' });
    if (!ok) return;
    await supabase.auth.signOut();
    window.location.href = './index.html';
});

// ID preview modal close
document.getElementById('close-id-preview')?.addEventListener('click', () => {
    document.getElementById('id-preview-modal').style.display = 'none';
});
document.getElementById('id-preview-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('id-preview-modal')) {
        document.getElementById('id-preview-modal').style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
async function init() {
    const loadingEl = document.getElementById('admin-loading');
    const contentEl = document.getElementById('admin-content');
    const deniedEl  = document.getElementById('access-denied');

    // Guard: Supabase must be configured before anything else
    if (!SUPABASE_CONFIGURED) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (deniedEl) {
            deniedEl.style.display = 'flex';
            const msgEl = deniedEl.querySelector('p') || deniedEl;
            if (msgEl) msgEl.textContent = 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY as Replit Secrets and restart the workflow.';
        }
        return;
    }

    // Wait for auth state
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (deniedEl)  deniedEl.style.display  = 'flex';
        return;
    }

    currentUser = session.user;

    // Load profile and check role
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    currentProfile = profile;

    if (!profile || !['admin', 'moderator'].includes(profile.role)) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (deniedEl)  deniedEl.style.display  = 'flex';
        return;
    }

    // Show dashboard
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';

    // Sidebar role label
    const roleEl = document.getElementById('sidebar-role');
    if (roleEl) roleEl.textContent = profile.role === 'admin' ? '🛡 Administrator' : '👮 Moderator';

    // Greeting
    const greetEl = document.getElementById('admin-greeting');
    if (greetEl) greetEl.textContent = `Welcome back, ${profile.full_name || currentUser.email}.`;

    // Hide admin-only elements from moderators
    if (profile.role !== 'admin') {
        document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
    }

    // Tab navigation
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Filter listeners — users
    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('user-status-filter')?.addEventListener('change', renderUsers);
    document.getElementById('user-role-filter')?.addEventListener('change', renderUsers);

    // Filter listeners — listings
    document.getElementById('listing-search')?.addEventListener('input', renderListings);
    document.getElementById('listing-status-filter')?.addEventListener('change', renderListings);
    document.getElementById('listing-type-filter')?.addEventListener('change', renderListings);

    // Refresh buttons
    document.getElementById('verif-status-filter')?.addEventListener('change', loadVerification);
    document.getElementById('verif-refresh-btn')?.addEventListener('click', loadVerification);
    document.getElementById('report-status-filter')?.addEventListener('change', loadReports);
    document.getElementById('reports-refresh-btn')?.addEventListener('click', loadReports);
    document.getElementById('audit-search')?.addEventListener('input', loadAuditLog);
    document.getElementById('audit-refresh-btn')?.addEventListener('click', loadAuditLog);

    // Load overview on start
    await loadOverview();
}

init();
