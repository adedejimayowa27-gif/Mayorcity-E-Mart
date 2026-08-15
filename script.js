// ═══════════════════════════════════════════════════════════════════════
// Mayorcity E-Mart — Main Application Script (ES Module)
// Supabase-powered: auth, listings CRUD, image storage, student verification
// ═══════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Guard again
// If missing config, createClient throws if URL is empty
const SUPABASE_CONFIGURED = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY);
const supabase = SUPABASE_CONFIGURED
    ? createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
    : null;

// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════
let allListings    = [];   // fetched from Supabase
let currentUser    = null; // Supabase auth.User
let currentProfile = null; // profiles row
let currentTab     = 'all';
let currentCategory = 'Show All';
let currentPage     = 1;
const LISTINGS_PER_PAGE = 12;

// A listing is auto-hidden from the public grid once it's been Active for
// this many days. Owners can renew it from their Dashboard to reset the clock.
const LISTING_EXPIRY_DAYS = 30;
function isExpired(listing) {
    if (listing.status !== 'Active') return false;
    const created = new Date(listing.created_at).getTime();
    if (Number.isNaN(created)) return false;
    return (Date.now() - created) > LISTING_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
}
function daysUntilExpiry(listing) {
    const created = new Date(listing.created_at).getTime();
    if (Number.isNaN(created)) return null;
    const daysLeft = LISTING_EXPIRY_DAYS - Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000));
    return daysLeft;
}

// ═══════════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════════
const productsGrid      = document.getElementById('products');
const searchBar         = document.getElementById('searchBar');
const priceMinInput     = document.getElementById('price-min-input');
const priceMaxInput     = document.getElementById('price-max-input');
const sortSelect        = document.getElementById('sort-select');
const uploadFormSection = document.getElementById('upload-form-section');
const adminControlBar   = document.getElementById('admin-control-bar');
const idUploadBanner    = document.getElementById('id-upload-banner');
const idUploadModal     = document.getElementById('idUploadModal');
const resetPasswordModal = document.getElementById('resetPasswordModal');
const viewModal         = document.getElementById('viewModal');
const editModal         = document.getElementById('editModal');
const authModal         = document.getElementById('authModal');
const lfModal           = document.getElementById('lfModal');
const viewModalContent  = document.getElementById('viewModalContent');
const statTotal         = document.getElementById('stat-total');
const statMarket        = document.getElementById('stat-market');
const statLost          = document.getElementById('stat-lost');

// ═══════════════════════════════════════════════════════════════════════
// PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════
const isAdmin    = () => currentProfile?.role === 'admin';
const isMod      = () => currentProfile?.role === 'moderator';
const isStaff    = () => ['admin','moderator'].includes(currentProfile?.role);
const isVerified = () => currentProfile?.verification_status === 'verified';
const canPost    = () => isVerified() || isStaff();
const canEditListing   = (l) => isAdmin() || (canPost() && l.user_id === currentUser?.id);
const canDeleteListing = (l) => isAdmin() || (canPost() && l.user_id === currentUser?.id);

// ═══════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════
function formatWhatsAppNumber(num) {
    if (!num) return '09150434157';
    const clean = num.toString().replace(/\D/g, '');
    return clean.startsWith('0') ? '234' + clean.slice(1) : clean;
}

function isValidNigerianPhone(num) {
    const clean = num.replace(/\D/g, '');
    return /^0[789]\d{9}$/.test(clean) || /^234[789]\d{9}$/.test(clean);
}

function getInitials(name) {
    if (!name) return '?';
    return name.trim().split(' ').map(n => n[0] || '').join('').substring(0, 2).toUpperCase();
}

function formatDate(iso) {
    if (!iso) return 'Unknown';
    return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function generateEmartId() {
    return 'EMART-' + Math.floor(100000 + Math.random() * 900000);
}

function buildStarRating(sum, count) {
    if (!count) return '<span class="trust-no-rating">No ratings yet</span>';
    const avg = (sum / count).toFixed(1);
    const stars = Math.round(sum / count);
    return `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} <span class="trust-avg">${avg}/5</span> <span class="trust-cnt">(${count})</span>`;
}

/** Compresses an image file → data URL */
function readImageAsCompressedDataURL(file, maxSize = 800, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = e => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > height) {
                    if (width  > maxSize) { height = Math.round(height * maxSize / width);  width  = maxSize; }
                } else {
                    if (height > maxSize) { width  = Math.round(width  * maxSize / height); height = maxSize; }
                }
                canvas.width  = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ═══════════════════════════════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════════════════════════════
const TOAST_ICONS  = { success:'✓', error:'✕', warning:'!', info:'i' };
const TOAST_TITLES = { success:'Success', error:'Error', warning:'Notice', info:'Info' };

function showToast(message, type = 'info', duration = 4500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-icon-wrap toast-icon-${type}">${TOAST_ICONS[type]||'i'}</div>
        <div class="toast-body">
            <p class="toast-title">${TOAST_TITLES[type]||'Info'}</p>
            <p class="toast-message">${message}</p>
        </div>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
        <div class="toast-progress toast-progress-${type}"></div>`;
    container.appendChild(toast);
    const close = () => {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    toast.querySelector('.toast-close').addEventListener('click', close);
    const timer = setTimeout(close, duration);
    toast.querySelector('.toast-close').addEventListener('click', () => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════════════════════════
// CUSTOM DIALOG SYSTEM
// ═══════════════════════════════════════════════════════════════════════
const DIALOG_ICONS = { danger:'🗑', warning:'⚠', success:'✓', info:'💬', lock:'🔑', report:'⚑', star:'⭐' };

function showConfirm({ title, message, htmlContent, confirmText='Confirm', cancelText='Cancel', iconType='warning', confirmStyle='primary' } = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'dialog-title');
        const body = htmlContent ? htmlContent : `<p class="dialog-message">${message || ''}</p>`;
        overlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon-wrap dialog-icon-${iconType}">${DIALOG_ICONS[iconType]||'?'}</div>
                <h3 class="dialog-title" id="dialog-title">${title}</h3>
                ${body}
                <div class="dialog-actions">
                    <button class="dialog-btn dialog-btn-cancel">${cancelText}</button>
                    <button class="dialog-btn dialog-btn-${confirmStyle}">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.querySelector(`.dialog-btn-${confirmStyle}`)?.focus());
        const cleanup = v => {
            overlay.classList.add('dialog-exit');
            overlay.addEventListener('animationend', () => { overlay.remove(); resolve(v); }, { once: true });
        };
        overlay.querySelector('.dialog-btn-cancel').addEventListener('click', () => cleanup(false));
        overlay.querySelector(`.dialog-btn-${confirmStyle}`).addEventListener('click', () => cleanup(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); });
        overlay.addEventListener('keydown', e => { if (e.key === 'Escape') cleanup(false); });
    });
}

function showPrompt({ title, message, placeholder='', inputType='text', iconType='info', confirmText='Submit', alignLeft=false } = {}) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon-wrap dialog-icon-${iconType}">${DIALOG_ICONS[iconType]||'?'}</div>
                <h3 class="dialog-title" id="dialog-title">${title}</h3>
                ${message ? `<p class="dialog-message">${message}</p>` : ''}
                <input class="dialog-input${alignLeft?' dialog-input-left':''}" type="${inputType}"
                       placeholder="${placeholder}" aria-label="${title}">
                <div class="dialog-actions">
                    <button class="dialog-btn dialog-btn-cancel">Cancel</button>
                    <button class="dialog-btn dialog-btn-primary">${confirmText}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.dialog-input');
        requestAnimationFrame(() => input.focus());
        const cleanup = v => {
            overlay.classList.add('dialog-exit');
            overlay.addEventListener('animationend', () => { overlay.remove(); resolve(v); }, { once: true });
        };
        const submit = () => cleanup(input.value !== '' ? input.value : null);
        overlay.querySelector('.dialog-btn-cancel').addEventListener('click', () => cleanup(null));
        overlay.querySelector('.dialog-btn-primary').addEventListener('click', submit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') cleanup(null); });
        overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
    });
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH — CORE
// ═══════════════════════════════════════════════════════════════════════
async function loadCurrentProfile(userId) {
    if (!userId) { currentProfile = null; return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    currentProfile = data || null;
}

async function handleSignIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
}

async function handleSignUp({ fullName, email, password, phone, matricNumber, department, level, studentIdFile, turnstileToken }) {
    // 1. Create auth user. All registration fields ride along as user metadata
    //    so the `handle_new_user` DB trigger (SECURITY DEFINER, bypasses RLS)
    //    can create both the profile and the pending student_verifications row
    //    server-side — this works even when "Confirm email" is on and the
    //    browser has no session yet.
    //    emailRedirectTo ensures the confirmation link sends the user back to
    //    THIS site (important after moving from Replit to Netlify — otherwise
    //    the link uses whatever Site URL is configured in the Supabase dashboard).
    //    captchaToken: Supabase verifies this Turnstile token server-side against
    //    the secret key configured in the dashboard — a bot can't fake it by
    //    editing this script, since Supabase itself checks it, not this code.
    const { data: authData, error: authErr } = await supabase.auth.signUp({
        email, password,
        options: {
            data: {
                full_name:     fullName,
                phone,
                matric_number: matricNumber,
                department,
                level
            },
            emailRedirectTo: window.location.origin + '/index.html',
            captchaToken: turnstileToken || undefined
        }
    });
    if (authErr) throw new Error(authErr.message);

    const userId = authData.user?.id;
    if (!userId) throw new Error('Sign-up failed — no user returned.');

    // 2. Upload student ID. This requires an authenticated session, which only
    //    exists immediately if email confirmation is OFF. If it's ON, this is
    //    skipped here and the user (or an admin, from the raw file they can
    //    ask for) can add it after the user confirms and signs in.
    let studentIdUrl = '';
    if (studentIdFile && authData.session) {
        try {
            const ext    = studentIdFile.name.split('.').pop() || 'jpg';
            const path   = `${userId}/student-id.${ext}`;
            const { error: upErr } = await supabase.storage
                .from('student-ids')
                .upload(path, studentIdFile, { upsert: true });
            // student-ids is a PRIVATE bucket — getPublicUrl() would return a link
            // that never actually loads. Store the raw path instead; admin.js
            // generates a short-lived signed URL from this path when it needs to
            // display the image.
            if (!upErr) studentIdUrl = path;
        } catch (_) { /* non-fatal — user can re-upload later */ }
    }

    // 3 & 4. Best-effort sync on top of the trigger-created rows. These only
    // succeed when a session already exists (email confirmation disabled, or
    // this fires after a later sign-in); when there's no session yet, RLS
    // blocks them by design and that is EXPECTED, not an error — the trigger
    // already created both rows with the metadata above, so sign-up itself
    // must never fail because of these.
    if (authData.session) {
        const { error: profileErr } = await supabase.from('profiles').update({
            student_id_url: studentIdUrl || undefined
        }).eq('id', userId);
        if (profileErr) console.warn('Profile sync warning:', profileErr.message);

        if (studentIdUrl) {
            const { error: verifErr } = await supabase.from('student_verifications')
                .update({ student_id_url: studentIdUrl })
                .eq('user_id', userId);
            if (verifErr) console.warn('Verification sync warning:', verifErr.message);
        }
    }

    return authData;
}

async function handleSignOut() {
    await supabase.auth.signOut();
}

async function handleForgotPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html'
    });
    if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH — UI
// ═══════════════════════════════════════════════════════════════════════
function updateAuthUI() {
    const authBtn   = document.getElementById('auth-open-btn');
    const userMenu  = document.getElementById('user-menu');
    const notifMenu = document.getElementById('notif-menu');
    const adminLink = document.getElementById('nav-admin-link');

    if (currentUser) {
        if (authBtn)  authBtn.style.display   = 'none';
        if (userMenu) userMenu.style.display  = '';
        if (notifMenu) notifMenu.style.display = '';

        const name  = currentProfile?.full_name || currentUser.email;
        const email = currentUser.email;

        const initEl = document.getElementById('user-initials');
        const shortEl = document.getElementById('user-email-short');
        const nameEl  = document.getElementById('user-dropdown-name');
        const emailEl = document.getElementById('user-dropdown-email');

        if (initEl)  initEl.textContent  = getInitials(name);
        if (shortEl) shortEl.textContent = email.split('@')[0];
        if (nameEl)  nameEl.textContent  = name;
        if (emailEl) emailEl.textContent = email;

        if (adminLink) adminLink.style.display = isAdmin() ? '' : 'none';

        // Verification-document banner — shown when the account has no
        // document on file yet. This covers the common case where email
        // confirmation is required at signup, so the browser had no session
        // yet and the original upload attempt was skipped.
        if (idUploadBanner) {
            const stillPending = currentProfile?.verification_status === 'pending';
            const noIdYet      = !currentProfile?.student_id_url;
            idUploadBanner.style.display = (stillPending && noIdYet) ? 'block' : 'none';
        }

        // Admin bar
        if (adminControlBar) {
            adminControlBar.style.display = isStaff() ? 'block' : 'none';
            const titleEl = adminControlBar.querySelector('.admin-bar-title');
            if (titleEl && isMod()) titleEl.textContent = '🛡️ MODERATOR MODE — You can review and moderate listings.';
        }

    } else {
        if (authBtn)  authBtn.style.display   = '';
        if (userMenu) userMenu.style.display  = 'none';
        if (notifMenu) notifMenu.style.display = 'none';
        if (adminControlBar) adminControlBar.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
        if (idUploadBanner) idUploadBanner.style.display = 'none';
    }

    // Show/hide post form CTA
    const heroCTA = document.getElementById('hero-post-btn');
    if (heroCTA) heroCTA.style.display = currentUser ? '' : '';

    // Refresh listing display (ownership buttons may change)
    displayListings();
}

function openAuthModal(tab = 'signin') {
    if (!authModal) return;
    switchAuthTab(tab);
    authModal.style.display = 'flex';
    setTimeout(() => {
        const firstInput = authModal.querySelector(`#${tab === 'signin' ? 'signin' : 'signup'}-email`);
        firstInput?.focus();
    }, 100);
}

function closeAuthModal() {
    if (authModal) authModal.style.display = 'none';
    // Clear error messages
    document.querySelectorAll('.auth-error').forEach(el => { el.style.display = 'none'; el.textContent = ''; });
    document.querySelectorAll('#signinForm, #signupForm').forEach(f => f.reset());
    hideForgotPanel();
}

function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => {
        const active = t.dataset.tab === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', String(active));
    });
    const signinPanel = document.getElementById('signin-panel');
    const signupPanel = document.getElementById('signup-panel');
    if (signinPanel) signinPanel.style.display = tab === 'signin' ? '' : 'none';
    if (signupPanel) signupPanel.style.display = tab === 'signup' ? '' : 'none';
}

function showForgotPanel() {
    const signinPanel = document.getElementById('signin-panel');
    const forgotPanel = document.getElementById('forgot-panel');
    if (signinPanel) signinPanel.style.display = 'none';
    if (forgotPanel) forgotPanel.style.display = '';
    document.getElementById('forgot-email')?.focus();
}

function hideForgotPanel() {
    const signinPanel = document.getElementById('signin-panel');
    const forgotPanel = document.getElementById('forgot-panel');
    if (forgotPanel) forgotPanel.style.display = 'none';
    if (signinPanel) signinPanel.style.display = '';
}

function setAuthBtnLoading(btnId, loading, label = '') {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? '<span class="btn-spinner"></span> Please wait…'
        : label;
}

function showAuthError(panelId, msg) {
    const el = document.getElementById(panelId);
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS — FETCH
// ═══════════════════════════════════════════════════════════════════════
async function loadListings() {
    if (productsGrid) {
        productsGrid.innerHTML = `
            <div class="products-loading">
                <div class="loading-spinner"></div>
                <p>Loading listings…</p>
            </div>`;
    }

    const statusFilter = isStaff() ? ['Active','Sold','Hidden'] : ['Active','Sold'];
    const { data: listings, error } = await supabase
        .from('listings')
        .select('*')
        .in('status', statusFilter)
        .order('created_at', { ascending: false });

        if (error) {
            console.error("Supabase Error:", error);
            showToast("Failed to load listings. Please refresh.", "error");
            if (productsGrid) productsGrid.innerHTML = '<p class="no-results-msg">Failed to load listings.</p>';
            return;
        }

    // Fetch seller trust info — use the public-safe view so unauthenticated
    // visitors never trigger a read against the full (sensitive) profiles table.
    const sellerIds = [...new Set((listings || []).map(l => l.user_id).filter(Boolean))];
    let profilesMap = {};
    if (sellerIds.length > 0) {
        const profileTable = currentUser ? 'profiles' : 'profiles_public';
        const { data: profiles } = await supabase
            .from(profileTable)
            .select('id, full_name, verification_status, rating_sum, rating_count, successful_sales, created_at')
            .in('id', sellerIds);
        if (profiles) profiles.forEach(p => { profilesMap[p.id] = p; });
    }

    allListings = (listings || []).map(l => ({
        ...l,
        _profile: l.user_id ? (profilesMap[l.user_id] || null) : null
    }));

    updatePlatformStatistics();
    displayListings();
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS — DISPLAY
// ═══════════════════════════════════════════════════════════════════════
function buildBadges(listing) {
    const isLost = listing.type === 'Lost';
    let lfLabel = 'Lost & Found';
    let lfClass = 'badge-lost';
    if (isLost) {
        if (listing.lost_or_found === 'Found') { lfLabel = '🟢 FOUND ITEM'; lfClass = 'badge-found'; }
        else if (listing.lost_or_found === 'Lost') { lfLabel = '🔴 LOST ITEM'; lfClass = 'badge-lost-item'; }
        else { lfLabel = 'Lost & Found'; lfClass = 'badge-lost'; }
    }
    let html = `<span class="badge ${isLost ? lfClass : 'badge-market'}">${isLost ? lfLabel : 'For Sale'}</span>`;
    html    += ` <span class="badge badge-cat">${listing.category || 'General'}</span>`;
    if (listing._profile?.verification_status === 'verified') {
        html += ` <span class="badge badge-verified">✓ Verified</span>`;
    }
    if (listing.reports >= 3) {
        html += ` <span class="badge badge-review">⚠ Under Review</span>`;
    }
    if (listing.status === 'Sold') {
        html += ` <span class="badge badge-sold">Sold</span>`;
    }
    if (listing.status === 'Hidden') {
        html += ` <span class="badge badge-hidden">Hidden</span>`;
    }
    return html;
}

function displayListings() {
    if (!productsGrid) return;
    const searchText = (searchBar?.value || '').toLowerCase();
    const priceMin = parseFloat(priceMinInput?.value);
    const priceMax = parseFloat(priceMaxInput?.value);

    const filtered = allListings.filter(l => {
        const name   = (l.product_name || '').toLowerCase();
        const desc   = (l.description  || '').toLowerCase();
        const seller = (l.seller_name  || '').toLowerCase();
        const eId    = (l.emart_id     || '').toLowerCase();
        const price  = Number(l.price || 0);
        const priceOk = l.type === 'Lost' ? true
            : (Number.isNaN(priceMin) || price >= priceMin)
              && (Number.isNaN(priceMax) || price <= priceMax);
        return (currentTab === 'all' || l.type === currentTab)
            && (currentCategory === 'Show All' || l.category === currentCategory)
            && priceOk
            && !isExpired(l)
            && (name.includes(searchText) || desc.includes(searchText)
                || seller.includes(searchText) || eId.includes(searchText));
    });

    const sortVal = sortSelect?.value || 'newest';
    if (sortVal === 'oldest') {
        filtered.reverse(); // allListings is fetched newest-first, so reverse gives oldest-first
    } else if (sortVal === 'price-low') {
        filtered.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortVal === 'price-high') {
        filtered.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
    // 'newest' needs no re-sort — allListings already comes ordered that way.

    if (filtered.length === 0) {
        productsGrid.innerHTML = "<p class='no-results-msg'>No items found matching the selected criteria.</p>";
        renderPaginationControls(0);
        return;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / LISTINGS_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIdx = (currentPage - 1) * LISTINGS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, startIdx + LISTINGS_PER_PAGE);

    productsGrid.innerHTML = pageItems.map(listing => {
        const isLost       = listing.type === 'Lost';
        const displayPrice = isLost ? 'Contact for details' : `₦${Number(listing.price || 0).toLocaleString()}`;
        const img          = listing.image_url || 'https://placehold.co/400x200?text=No+Image';
        const isOwner      = currentUser && listing.user_id === currentUser.id;
        const showEdit     = canEditListing(listing);
        const showDelete   = canDeleteListing(listing);

        const waNumber = formatWhatsAppNumber(listing.seller_whatsapp);
        const lfMsgText = isLost
            ? encodeURIComponent(`Hello, I saw your ${listing.lost_or_found === 'Found' ? 'FOUND' : 'LOST'} item report for "${listing.product_name}" on Mayorcity E-Mart. I'd like to help!`)
            : '';
        const lfWaLink = `https://wa.me/${waNumber}?text=${lfMsgText}`;

        const marketMsgText = !isLost
            ? encodeURIComponent(`Hello, I'm interested in your "${listing.product_name}" listing on Mayorcity E-Mart (${displayPrice}). Is it still available?`)
            : '';
        const marketWaLink = `https://wa.me/${waNumber}?text=${marketMsgText}`;
        const locationText = listing.location ? `📍 ${listing.location}` : '';
        const dateText = listing.date_lost_found ? `📅 ${formatDate(listing.date_lost_found)}` : '';

        return `
        <div class="product-card${listing.status === 'Hidden' ? ' card-hidden' : ''}${isLost ? ' card-lf' : ''}">
            <div class="card-badges">${buildBadges(listing)}</div>
            <div class="card-image-wrap">
                <img src="${img}" alt="${listing.product_name || 'Product'}" loading="lazy">
            </div>
            <div class="card-body">
                <h3 class="card-title">${listing.product_name || 'Untitled'}</h3>
                <p class="card-seller">👤 ${listing.seller_name || 'Anonymous'}${listing._profile?.verification_status === 'verified' ? ' <span class="inline-verified">✓</span>' : ''}</p>
                ${isLost && locationText ? `<p class="card-location">${locationText}</p>` : ''}
                ${isLost && dateText     ? `<p class="card-lf-date">${dateText}</p>`      : ''}
                ${!isLost ? `<p class="card-price">${displayPrice}</p>` : ''}
                <p class="card-desc">${listing.description ? listing.description.substring(0, 80) + '…' : 'No details.'}</p>
            </div>
            <div class="card-actions">
                <button type="button" class="view-btn" data-id="${listing.id}">View Details</button>
                <a href="${isLost ? lfWaLink : marketWaLink}" target="_blank" rel="noopener noreferrer" class="card-wa-btn">💬 WhatsApp ${isLost ? '' : 'Seller'}</a>
                <div class="card-secondary-actions">
                    ${showEdit   ? `<button type="button" class="edit-btn"   data-id="${listing.id}">Edit</button>`   : ''}
                    ${showDelete ? `<button type="button" class="delete-btn" data-id="${listing.id}">Delete</button>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    renderPaginationControls(totalPages);
}

function renderPaginationControls(totalPages) {
    const container = document.getElementById('pagination-controls');
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    html += `<button type="button" class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button type="button" class="page-btn${i === currentPage ? ' page-btn-active' : ''}" data-page="${i}">${i}</button>`;
    }
    html += `<button type="button" class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button>`;

    container.innerHTML = html;

    container.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!page || page < 1) return;
            currentPage = page;
            displayListings();
            document.getElementById('featured-listings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function updatePlatformStatistics() {
    const active = allListings.filter(l => l.status !== 'Hidden' && l.status !== 'Removed');
    if (statTotal)  statTotal.textContent  = active.length;
    if (statMarket) statMarket.textContent = active.filter(l => l.type === 'Market').length;
    if (statLost)   statLost.textContent   = active.filter(l => l.type === 'Lost').length;
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS — POST
// ═══════════════════════════════════════════════════════════════════════
async function postListing(formData, imageFile) {
    if (!currentUser) throw new Error('You must be signed in to post a listing.');
    if (!canPost())   throw new Error('Your account must be verified before posting. Please wait for admin approval.');

    const isLost = formData.listingType === 'Lost';

    // Upload image first either way — no point charging someone, then losing
    // their listing to a slow/failed upload afterward.
    let imageUrl = '';
    if (imageFile) {
        const compressedBlob = await readImageAsCompressedDataURL(imageFile);
        const path = `${currentUser.id}/${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
            .from('listing-images')
            .upload(path, compressedBlob, { contentType: 'image/jpeg' });
        if (!upErr) {
            const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(path);
            imageUrl = urlData?.publicUrl || '';
        }
    }

    if (isLost) {
        // Lost & Found posted through the main form stays free — direct insert.
        const { error } = await supabase.from('listings').insert({
            emart_id:        generateEmartId(),
            product_name:    formData.productName,
            type:            'Lost',
            category:        formData.productCategory,
            price:           '0',
            description:     formData.description,
            image_url:       imageUrl,
            seller_name:     formData.seller,
            seller_whatsapp: formData.whatsapp,
            user_id:         currentUser.id
        });
        if (error) throw new Error(error.message);
        return;
    }

    // ── Marketplace ("For Sale") listing ──
    // A user's very first Market listing is free, forever — every one after
    // that costs ₦200. We check how many Market listings this user already
    // has; if zero, we skip payment and insert directly. This free path is
    // also enforced by a database (RLS) rule — see the SQL note shipped
    // alongside this file — so it can't be bypassed by editing this script
    // in the browser and re-submitting.
    const { data: priorMarketRows, error: countErr } = await supabase
        .from('listings')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('type', 'Market');

    const isFirstFreeListing = !countErr && (priorMarketRows?.length || 0) === 0;

    if (isFirstFreeListing) {
        const { error } = await supabase.from('listings').insert({
            emart_id:        generateEmartId(),
            product_name:    formData.productName,
            type:            'Market',
            category:        formData.productCategory,
            price:           formData.price || 0,
            description:     formData.description,
            image_url:       imageUrl,
            seller_name:     formData.seller,
            seller_whatsapp: formData.whatsapp,
            user_id:         currentUser.id,
            // The listings table requires a non-empty payment_ref for every
            // Market listing (a DB check constraint). This isn't a real
            // transaction — it's a clear marker that this specific listing
            // was let through free as the user's first one, not paid for.
            payment_ref:     'FREE_FIRST_LISTING'
        });
        // If the free-listing RLS rule rejects this (e.g. the count check
        // above was stale, or this account already used its free listing),
        // fall through to the normal paid flow below instead of failing.
        if (!error) return;
        console.warn('Free first-listing insert failed, falling back to paid flow:', error?.message || error);
    }
    if (countErr) {
        console.warn('Free first-listing count check failed, falling back to paid flow:', countErr?.message || countErr);
    }

    // ── Every listing after the first — requires the ₦200 posting fee ──
    // 1. Collect payment client-side via Flutterwave Inline (public key only —
    //    safe to expose in the browser).
    const { transactionId, txRef } = await collectListingFeePayment(currentUser.email, formData.seller, formData.whatsapp);

    // 2. Hand the transaction id + listing data to the verify-and-post-listing
    //    Edge Function. It re-checks the payment with Flutterwave's SECRET key
    //    (never exposed to the browser) and only then creates the listing,
    //    using the service role. Direct client inserts for Market listings
    //    are blocked by RLS — this Edge Function is the only path that can
    //    create one, so the fee can't be bypassed from the browser console.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Your session expired — please sign in again.');

    const res = await fetch(`${window.SUPABASE_URL}/functions/v1/verify-and-post-listing`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': window.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
            transaction_id: transactionId,
            tx_ref: txRef,
            listing: {
                product_name:    formData.productName,
                category:        formData.productCategory,
                price:           formData.price || 0,
                description:     formData.description,
                image_url:       imageUrl,
                seller_name:     formData.seller,
                seller_whatsapp: formData.whatsapp
            }
        })
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.error) {
        throw new Error(result.error || 'Payment was received but the listing could not be created. Please contact support with your payment reference: ' + txRef);
    }
}

// Opens the Flutterwave Inline popup for the ₦200 listing fee.
// Resolves with { transactionId, txRef } on success; rejects if the user
// closes the popup or Flutterwave isn't configured/loaded.
function collectListingFeePayment(email, name, phone) {
    return new Promise((resolve, reject) => {
        if (!window.FlutterwaveCheckout) {
            reject(new Error('Payment system failed to load. Please check your connection and try again.'));
            return;
        }
        if (!window.FLUTTERWAVE_PUBLIC_KEY) {
            reject(new Error('Payments are not configured yet. Please contact the site admin.'));
            return;
        }
        const txRef = 'EMART-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
        let settled = false;

        FlutterwaveCheckout({
            public_key: window.FLUTTERWAVE_PUBLIC_KEY,
            tx_ref: txRef,
            amount: 200, // ₦200 — Flutterwave amounts are whole Naira, not kobo
            currency: 'NGN',
            payment_options: 'card, banktransfer, ussd, mobilemoney',
            customer: { email, name: name || email, phone_number: phone || '' },
            customizations: {
                title: 'Mayorcity E-Mart',
                description: 'Marketplace listing fee'
            },
            callback: function (payment) {
                settled = true;
                resolve({ transactionId: payment.transaction_id, txRef: payment.tx_ref });
            },
            onclose: function (incomplete) {
                if (!settled && incomplete) reject(new Error('Payment was not completed.'));
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS — UPDATE
// ═══════════════════════════════════════════════════════════════════════
async function updateListing(id, data) {
    const { error } = await supabase.from('listings').update(data).eq('id', id);
    if (error) throw new Error(error.message);
}

// ═══════════════════════════════════════════════════════════════════════
// LISTINGS — DELETE
// ═══════════════════════════════════════════════════════════════════════
async function deleteListing(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    if (!canDeleteListing(listing)) {
        showToast('You do not have permission to delete this listing.', 'error');
        return;
    }
    const confirmed = await showConfirm({
        title:        'Delete Listing',
        message:      `Permanently remove "<strong>${listing.product_name}</strong>"? This cannot be undone.`,
        confirmText:  isAdmin() ? 'Force Delete' : 'Delete',
        cancelText:   'Cancel',
        iconType:     'danger',
        confirmStyle: 'danger'
    });
    if (!confirmed) return;

    const { error } = await supabase.from('listings').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }

    allListings = allListings.filter(l => l.id !== id);
    displayListings();
    updatePlatformStatistics();
    showToast('Listing removed.', 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL — VIEW DETAILS
// ═══════════════════════════════════════════════════════════════════════
async function openViewModal(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing || !viewModalContent) return;

    const isLost        = listing.type === 'Lost';
    const waNumber      = formatWhatsAppNumber(listing.seller_whatsapp);
    const lfOrFound     = listing.lost_or_found || 'Lost';
    const msgText       = isLost
        ? encodeURIComponent(`Hello ${listing.seller_name}, I saw your ${lfOrFound === 'Found' ? 'FOUND' : 'LOST'} item report for "${listing.product_name}" on Mayorcity E-Mart. I'd like to help!`)
        : encodeURIComponent(`Hello ${listing.seller_name}, I'm interested in your item "${listing.product_name}" on Mayorcity E-Mart!`);
    const waLink        = `https://wa.me/${waNumber}?text=${msgText}`;
    const img           = listing.image_url || 'https://placehold.co/640x360?text=No+Image';
    const formattedPrice = isLost ? 'N/A — Lost & Found' : `₦${Number(listing.price || 0).toLocaleString()}`;
    const profile       = listing._profile;
    const avgRating     = profile?.rating_count ? (profile.rating_sum / profile.rating_count).toFixed(1) : null;

    const isOwner    = currentUser && listing.user_id === currentUser.id;
    const canSold    = (isStaff() || isOwner) && listing.status === 'Active';
    const canHide    = isStaff() && listing.status === 'Active';
    const canRestore = isStaff() && listing.status === 'Hidden';

    viewModalContent.innerHTML = `
        <div class="vm-layout">
            <div class="vm-image-wrap">
                <img src="${img}" alt="${listing.product_name}" class="vm-image">
                <div class="vm-badges-overlay">${buildBadges(listing)}</div>
            </div>
            <div class="vm-content">
                <h2 class="vm-title">${listing.product_name}</h2>

                <div class="vm-info-card">
                    ${isLost ? `
                    <div class="vm-info-row">
                        <span class="vm-info-label">📋 Report Type</span>
                        <span class="vm-info-value ${lfOrFound === 'Found' ? 'vm-found-label' : 'vm-lost-label'}">${lfOrFound === 'Found' ? '🟢 FOUND ITEM' : '🔴 LOST ITEM'}</span>
                    </div>
                    ${listing.location ? `<div class="vm-info-row">
                        <span class="vm-info-label">📍 Location</span>
                        <span class="vm-info-value">${listing.location}</span>
                    </div>` : ''}
                    ${listing.date_lost_found ? `<div class="vm-info-row">
                        <span class="vm-info-label">📅 Date</span>
                        <span class="vm-info-value">${formatDate(listing.date_lost_found)}</span>
                    </div>` : ''}
                    ` : `
                    <div class="vm-info-row">
                        <span class="vm-info-label">💰 Price</span>
                        <span class="vm-info-value vm-price">${formattedPrice}</span>
                    </div>
                    `}
                    <div class="vm-info-row">
                        <span class="vm-info-label">${isLost ? '👤 Contact' : '👤 Seller'}</span>
                        <span class="vm-info-value">
                            ${listing.seller_name}
                            ${profile?.verification_status === 'verified' ? '<span class="verified-badge-inline">✓ Verified</span>' : ''}
                        </span>
                    </div>
                    <div class="vm-info-row">
                        <span class="vm-info-label">🏷 Category</span>
                        <span class="vm-info-value">${listing.category}</span>
                    </div>
                    <div class="vm-info-row">
                        <span class="vm-info-label">📅 ${isLost ? 'Reported' : 'Posted'}</span>
                        <span class="vm-info-value">${formatDate(listing.created_at)}</span>
                    </div>
                    <div class="vm-info-row">
                        <span class="vm-info-label">🆔 Listing ID</span>
                        <span class="vm-info-value vm-id">${listing.emart_id}</span>
                    </div>
                </div>

                <!-- Seller Trust Block -->
                ${profile ? `
                <div class="vm-trust-block">
                    <h5 class="vm-trust-title">Seller Trust Profile</h5>
                    <div class="vm-trust-row">${profile.verification_status === 'verified' ? '<span class="trust-verified">✓ Verified Student</span>' : '<span class="trust-pending">⏳ Verification Pending</span>'}</div>
                    <div class="vm-trust-row">⭐ ${buildStarRating(profile.rating_sum, profile.rating_count)}</div>
                    <div class="vm-trust-row">🛒 ${profile.successful_sales || 0} successful sale${profile.successful_sales !== 1 ? 's' : ''}</div>
                    <div class="vm-trust-row">📅 Member since ${formatDate(profile.created_at)}</div>
                </div>` : ''}

                <div class="vm-description-block">
                    <h4 class="vm-description-label">Description</h4>
                    <p class="vm-description-text">${listing.description || 'No description provided.'}</p>
                </div>

                <div class="vm-cta-row">
                    <button type="button" id="modal-wa-btn" class="vm-wa-btn">
                        <span class="vm-wa-icon">💬</span> ${isLost ? 'Contact on WhatsApp' : 'Chat on WhatsApp'}
                    </button>
                    ${currentUser && !isOwner ? `<button type="button" id="modal-rate-btn" class="vm-rate-btn">⭐ Rate Seller</button>` : ''}
                </div>

                <!-- Staff controls -->
                ${canSold    ? `<button type="button" id="admin-mark-sold-btn"    class="vm-admin-btn vm-admin-sold">🛑 Mark as SOLD</button>` : ''}
                ${canHide    ? `<button type="button" id="admin-hide-btn"         class="vm-admin-btn vm-admin-hide">🙈 Hide Listing</button>` : ''}
                ${canRestore ? `<button type="button" id="admin-restore-btn"      class="vm-admin-btn vm-admin-restore">👁 Restore Listing</button>` : ''}

                <div class="vm-footer">
                    ${currentUser
                        ? `<a href="#" id="report-item-link" class="vm-report-link" data-id="${listing.id}">⚑ Report this listing</a>
                           ${!isOwner ? `<a href="#" id="report-user-link" class="vm-report-link" data-id="${listing.user_id}" style="margin-left:16px;">⚑ Report seller</a>` : ''}`
                        : `<span class="vm-report-link-disabled">Sign in to report</span>`}
                </div>
            </div>
        </div>`;

    // Bind actions
    document.getElementById('modal-wa-btn')?.addEventListener('click', () => {
        window.open(waLink, '_blank', 'noopener,noreferrer');
    });

    document.getElementById('modal-rate-btn')?.addEventListener('click', () => rateSeller(listing));

    document.getElementById('report-item-link')?.addEventListener('click', async e => {
        e.preventDefault();
        await reportListingAction(listing.id, null);
    });

    document.getElementById('report-user-link')?.addEventListener('click', async e => {
        e.preventDefault();
        await reportListingAction(null, listing.user_id);
    });

    document.getElementById('admin-mark-sold-btn')?.addEventListener('click', async () => {
        const ok = await showConfirm({ title:'Mark as Sold', message:`Mark "<strong>${listing.product_name}</strong>" as SOLD?`, confirmText:'Mark SOLD', iconType:'warning', confirmStyle:'warning' });
        if (!ok) return;
        await updateListing(listing.id, { status: 'Sold' });
        listing.status = 'Sold';
        viewModal.style.display = 'none';
        await loadListings();
        showToast('Listing marked as Sold.', 'success');
    });

    document.getElementById('admin-hide-btn')?.addEventListener('click', async () => {
        const ok = await showConfirm({ title:'Hide Listing', message:`Hide "<strong>${listing.product_name}</strong>" from public view?`, confirmText:'Hide', iconType:'warning', confirmStyle:'warning' });
        if (!ok) return;
        await updateListing(listing.id, { status: 'Hidden' });
        viewModal.style.display = 'none';
        await loadListings();
        showToast('Listing hidden.', 'success');
    });

    document.getElementById('admin-restore-btn')?.addEventListener('click', async () => {
        await updateListing(listing.id, { status: 'Active' });
        viewModal.style.display = 'none';
        await loadListings();
        showToast('Listing restored.', 'success');
    });

    viewModal.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL — EDIT
// ═══════════════════════════════════════════════════════════════════════
async function openEditModal(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    if (!canEditListing(listing)) { showToast('You cannot edit this listing.', 'error'); return; }

    document.getElementById('editListingId').value    = id;
    document.getElementById('editName').value         = listing.product_name || '';
    document.getElementById('editPrice').value        = listing.price || 0;
    document.getElementById('editDescription').value  = listing.description || '';
    editModal.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════
async function reportListingAction(listingId, reportedUserId) {
    const reason = await showPrompt({
        title:       listingId ? 'Report Listing' : 'Report User',
        message:     'Briefly describe why you are reporting this:',
        placeholder: 'e.g. Fake product, scammer, wrong details…',
        iconType:    'report',
        confirmText: 'Submit Report',
        alignLeft:   true
    });
    if (!reason) return;

    const { error } = await supabase.from('reports').insert({
        reporter_id:         currentUser.id,
        reported_listing_id: listingId    || null,
        reported_user_id:    reportedUserId || null,
        reason
    });

    if (error) { showToast('Failed to submit report.', 'error'); return; }

    if (listingId) {
        // Increment report count on listing
        const listing = allListings.find(l => l.id === listingId);
        if (listing) {
            await updateListing(listingId, { reports: (listing.reports || 0) + 1 });
            listing.reports = (listing.reports || 0) + 1;
        }
    }

    viewModal.style.display = 'none';
    displayListings();
    showToast('Report submitted. Our team will review it shortly.', 'info');
}

// ═══════════════════════════════════════════════════════════════════════
// RATE SELLER
// ═══════════════════════════════════════════════════════════════════════
async function rateSeller(listing) {
    if (!currentUser || listing.user_id === currentUser.id) return;

    // Star rating dialog
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="dialog-box">
            <div class="dialog-icon-wrap dialog-icon-warning">⭐</div>
            <h3 class="dialog-title">Rate Seller</h3>
            <p class="dialog-message">How was your experience with <strong>${listing.seller_name}</strong>?</p>
            <div class="star-rating-row" role="group" aria-label="Select a rating">
                ${[1,2,3,4,5].map(n => `
                    <button type="button" class="star-btn" data-val="${n}" aria-label="${n} star${n>1?'s':''}">★</button>
                `).join('')}
            </div>
            <p class="star-label" id="star-label">Click a star to rate</p>
            <textarea class="dialog-input dialog-input-left" placeholder="Optional comment…" rows="2" style="margin-top:8px;"></textarea>
            <div class="dialog-actions">
                <button class="dialog-btn dialog-btn-cancel">Cancel</button>
                <button class="dialog-btn dialog-btn-primary" id="submit-rating-btn" disabled>Submit Rating</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    let selectedRating = 0;
    const LABELS = ['','Poor','Fair','Good','Great','Excellent'];

    overlay.querySelectorAll('.star-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedRating = parseInt(btn.dataset.val);
            overlay.querySelectorAll('.star-btn').forEach((b, i) => {
                b.classList.toggle('star-active', i < selectedRating);
            });
            document.getElementById('star-label').textContent = LABELS[selectedRating] || '';
            document.getElementById('submit-rating-btn').disabled = false;
        });
    });

    const cleanup = () => {
        overlay.classList.add('dialog-exit');
        overlay.addEventListener('animationend', () => overlay.remove(), { once: true });
    };

    overlay.querySelector('.dialog-btn-cancel').addEventListener('click', cleanup);
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(); });

    document.getElementById('submit-rating-btn').addEventListener('click', async () => {
        if (!selectedRating) return;
        const comment = overlay.querySelector('textarea').value.trim();
        cleanup();
        const { error } = await supabase.from('ratings').insert({
            rater_id:  currentUser.id,
            seller_id: listing.user_id,
            listing_id: listing.id,
            rating:    selectedRating,
            comment
        });
        if (error) {
            showToast(error.code === '23505' ? 'You have already rated this seller for this listing.' : 'Failed to submit rating.', 'error');
        } else {
            showToast(`Rating submitted — ${selectedRating} ⭐. Thank you!`, 'success');
            await loadListings(); // refresh trust data
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// LOST & FOUND — MODAL & POSTING
// ═══════════════════════════════════════════════════════════════════════
function openLfModal() {
    if (!lfModal) return;
    // Pre-fill contact info if logged in
    const nameInput    = document.getElementById('lf-contactName');
    const waInput      = document.getElementById('lf-whatsapp');
    const imgNote      = document.getElementById('lf-anon-img-note');
    const imgInput     = document.getElementById('lf-image');
    if (nameInput && currentProfile?.full_name) nameInput.value = currentProfile.full_name;
    if (waInput   && currentProfile?.phone)     waInput.value   = currentProfile.phone;
    // Hide image field for unauthenticated users (can't upload to storage)
    if (imgNote)  imgNote.style.display  = currentUser ? 'none' : 'block';
    if (imgInput) imgInput.style.display = currentUser ? ''     : 'none';
    lfModal.style.display = 'flex';
    document.getElementById('lf-itemName')?.focus();
}

function closeLfModal() {
    if (lfModal) lfModal.style.display = 'none';
    document.getElementById('lfForm')?.reset();
    const errEl = document.getElementById('lf-form-error');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
}

async function postLostFoundReport(formData, imageFile) {
    let imageUrl = '';
    if (imageFile && currentUser) {
        // Image upload only available when logged in
        try {
            const compressedBlob = await readImageAsCompressedDataURL(imageFile);
            const path = `lostfound/${currentUser.id}/${Date.now()}.jpg`;
            const { error: upErr } = await supabase.storage
                .from('listing-images')
                .upload(path, compressedBlob, { contentType: 'image/jpeg' });
            if (!upErr) {
                const { data: urlData } = supabase.storage.from('listing-images').getPublicUrl(path);
                imageUrl = urlData?.publicUrl || '';
            }
        } catch (_) { /* non-fatal */ }
    }

    const row = {
        emart_id:        generateEmartId(),
        product_name:    formData.itemName,
        type:            'Lost',
        category:        formData.category,
        price:           '0',
        description:     formData.description,
        image_url:       imageUrl,
        seller_name:     formData.contactName,
        seller_whatsapp: formData.whatsapp,
        lost_or_found:   formData.lostOrFound,
        location:        formData.location || '',
    };
    if (formData.dateLostFound) row.date_lost_found = formData.dateLostFound;
    if (currentUser) row.user_id = currentUser.id;

    const { error } = await supabase.from('listings').insert(row);
    if (error) throw new Error(error.message);
}

function bindLfModal() {
    document.getElementById('closeLfModal')?.addEventListener('click', closeLfModal);
    lfModal?.addEventListener('click', e => { if (e.target === lfModal) closeLfModal(); });

    document.getElementById('lfForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn = document.getElementById('lf-submit-btn');
        const errEl     = document.getElementById('lf-form-error');
        errEl.style.display = 'none';

        const lostOrFound  = document.querySelector('input[name="lostOrFound"]:checked')?.value || 'Lost';
        const itemName     = document.getElementById('lf-itemName').value.trim();
        const category     = document.getElementById('lf-category').value;
        const description  = document.getElementById('lf-description').value.trim();
        const location     = document.getElementById('lf-location').value.trim();
        const dateLost     = document.getElementById('lf-date').value;
        const contactName  = document.getElementById('lf-contactName').value.trim();
        const whatsapp     = document.getElementById('lf-whatsapp').value.trim();
        const imageFile    = document.getElementById('lf-image')?.files?.[0] || null;

        if (!itemName || !description || !location || !contactName || !whatsapp) {
            errEl.textContent = 'Please fill in all required fields.';
            errEl.style.display = 'block'; return;
        }
        if (!isValidNigerianPhone(whatsapp)) {
            errEl.textContent = 'Enter a valid Nigerian WhatsApp number (e.g. 08012345678).';
            errEl.style.display = 'block'; return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';

        try {
            await postLostFoundReport({ lostOrFound, itemName, category, description, location, dateLostFound: dateLost, contactName, whatsapp }, imageFile);
            closeLfModal();
            showToast(`${lostOrFound === 'Found' ? '🟢 Found item' : '🔴 Lost item'} report submitted! It's now live on the feed.`, 'success', 6000);
            // Switch to Lost & Found tab so user sees their report
            const lfTab = document.querySelector('.tab-btn[data-type="Lost"]');
            if (lfTab) lfTab.click();
            await loadListings();
        } catch (err) {
            errEl.textContent = err.message;
            errEl.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '📢 Submit Report';
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// POST FORM
// ═══════════════════════════════════════════════════════════════════════
function showPostForm() {
    if (!currentUser) { openAuthModal('signin'); showToast('Please sign in to post a listing.', 'info'); return; }
    if (!canPost()) {
        showToast('Your student ID is pending review. You can post once verified.', 'warning', 6000);
        return;
    }
    if (uploadFormSection) {
        uploadFormSection.style.display = 'block';
        uploadFormSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS — STUDENT ID UPLOAD (post-signup / post-confirmation)
// ═══════════════════════════════════════════════════════════════════════
function bindIdUploadModal() {
    document.getElementById('open-id-upload-btn')?.addEventListener('click', () => {
        if (idUploadModal) idUploadModal.style.display = 'flex';
    });
    document.getElementById('closeIdUploadModal')?.addEventListener('click', () => {
        if (idUploadModal) idUploadModal.style.display = 'none';
    });
    idUploadModal?.addEventListener('click', e => {
        if (e.target === idUploadModal) idUploadModal.style.display = 'none';
    });

    document.getElementById('idUploadForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const errorEl = document.getElementById('id-upload-error');
        if (errorEl) errorEl.style.display = 'none';

        const fileInput = document.getElementById('id-upload-file');
        const file = fileInput?.files?.[0];
        if (!file) {
            if (errorEl) { errorEl.textContent = 'Please choose an image first.'; errorEl.style.display = 'block'; }
            return;
        }
        if (!currentUser) return;

        const submitBtn = document.getElementById('id-upload-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="btn-spinner"></span>Uploading…'; }

        try {
            const ext  = file.name.split('.').pop() || 'jpg';
            const path = `${currentUser.id}/student-id.${ext}`;

            const { error: upErr } = await supabase.storage
                .from('student-ids')
                .upload(path, file, { upsert: true });
            if (upErr) throw new Error(upErr.message);

            // student-ids is a private bucket — store the path, not a public URL.
            // admin.js generates a fresh signed URL from this path when displaying it.
            const { error: profileErr } = await supabase.from('profiles')
                .update({ student_id_url: path })
                .eq('id', currentUser.id);
            if (profileErr) throw new Error(profileErr.message);

            const { error: verifErr } = await supabase.from('student_verifications')
                .update({ student_id_url: path })
                .eq('user_id', currentUser.id);
            if (verifErr) throw new Error(verifErr.message);

            await loadCurrentProfile(currentUser.id);
            updateAuthUI();
            if (idUploadModal) idUploadModal.style.display = 'none';
            showToast('Document uploaded! An admin will review it shortly.', 'success');
        } catch (err) {
            if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Upload Document'; }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS — SET NEW PASSWORD (after clicking the reset-link email)
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// SIGNUP BOT CHECK — Cloudflare Turnstile
// ═══════════════════════════════════════════════════════════════════════
// Renders the widget once a real site key is configured. The Turnstile
// script loads with `async defer`, so its timing relative to this module
// isn't guaranteed — poll briefly for window.turnstile to exist rather
// than assuming it's ready.
function renderTurnstileWidget(attemptsLeft = 20) {
    const container = document.getElementById('turnstile-widget');
    if (!container) return;
    if (!window.TURNSTILE_SITE_KEY || window.TURNSTILE_SITE_KEY === 'YOUR_TURNSTILE_SITE_KEY_HERE') {
        return; // not configured yet — signup just skips the bot check (see submit handler)
    }
    if (!window.turnstile) {
        if (attemptsLeft <= 0) return;
        setTimeout(() => renderTurnstileWidget(attemptsLeft - 1), 250);
        return;
    }
    window.turnstileWidgetId = window.turnstile.render(container, {
        sitekey: window.TURNSTILE_SITE_KEY
    });
}

function bindResetPasswordModal() {
    document.getElementById('resetPasswordForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const errorEl = document.getElementById('reset-password-error');
        if (errorEl) errorEl.style.display = 'none';

        const pw1 = document.getElementById('reset-password-new')?.value || '';
        const pw2 = document.getElementById('reset-password-confirm')?.value || '';

        if (pw1.length < 8) {
            if (errorEl) { errorEl.textContent = 'Password must be at least 8 characters.'; errorEl.style.display = 'block'; }
            return;
        }
        if (pw1 !== pw2) {
            if (errorEl) { errorEl.textContent = 'Passwords do not match.'; errorEl.style.display = 'block'; }
            return;
        }

        const submitBtn = document.getElementById('reset-password-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<span class="btn-spinner"></span>Updating…'; }

        try {
            const { error } = await supabase.auth.updateUser({ password: pw1 });
            if (error) throw new Error(error.message);

            if (resetPasswordModal) resetPasswordModal.style.display = 'none';
            document.getElementById('resetPasswordForm')?.reset();
            showToast('Password updated! You can now use it to sign in.', 'success');
        } catch (err) {
            if (errorEl) { errorEl.textContent = err.message; errorEl.style.display = 'block'; }
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Update Password'; }
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS — AUTH MODAL
// ═══════════════════════════════════════════════════════════════════════
function bindAuthModal() {
    document.getElementById('auth-open-btn')?.addEventListener('click', () => openAuthModal('signin'));
    document.getElementById('closeAuthModal')?.addEventListener('click', closeAuthModal);
    authModal?.addEventListener('click', e => { if (e.target === authModal) closeAuthModal(); });

    // Tab switchers
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
    });
    document.querySelectorAll('.switch-tab-link').forEach(link => {
        link.addEventListener('click', e => { e.preventDefault(); switchAuthTab(link.dataset.tab); });
    });

    // Password visibility toggles
    document.querySelectorAll('.toggle-pw').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById(btn.dataset.target);
            if (input) { input.type = input.type === 'password' ? 'text' : 'password'; }
        });
    });

    // Forgot password link
    document.getElementById('forgot-link')?.addEventListener('click', e => { e.preventDefault(); showForgotPanel(); });
    document.getElementById('back-to-signin')?.addEventListener('click', e => { e.preventDefault(); hideForgotPanel(); });

    // Sign In form
    document.getElementById('signinForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const email    = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;
        document.getElementById('signin-error').style.display = 'none';
        setAuthBtnLoading('signin-submit', true);
        try {
            await handleSignIn(email, password);
            closeAuthModal();
            showToast('Welcome back! You are now signed in.', 'success');
        } catch (err) {
            showAuthError('signin-error', err.message);
        } finally {
            setAuthBtnLoading('signin-submit', false, 'Sign In');
        }
    });

    // Sign Up form
    document.getElementById('signupForm')?.addEventListener('submit', async e => {
        e.preventDefault();

        // Honeypot check — a real user never sees or fills this field, so
        // anything filling it in is almost certainly an automated bot.
        // Silently drop the submission without revealing why (don't tip bots off).
        const honeypot = document.getElementById('signup-website')?.value;
        if (honeypot) { return; }

        const fullName      = document.getElementById('signup-name').value.trim();
        const email         = document.getElementById('signup-email').value.trim();
        const password      = document.getElementById('signup-password').value;
        const phone         = document.getElementById('signup-phone').value.trim();
        const matricNumber  = document.getElementById('signup-matric').value.trim();
        const department    = document.getElementById('signup-department').value.trim();
        const level         = document.getElementById('signup-level').value;
        const idInput       = document.getElementById('signup-student-id');
        const studentIdFile = idInput?.files?.[0] || null;

        document.getElementById('signup-error').style.display = 'none';

        if (!fullName || !email || !password || !phone || !matricNumber || !department || !level) {
            showAuthError('signup-error', 'Please fill in all required fields.'); return;
        }
        if (!isValidNigerianPhone(phone)) {
            showAuthError('signup-error', 'Enter a valid Nigerian phone number (e.g. 08012345678).'); return;
        }
        if (password.length < 8) {
            showAuthError('signup-error', 'Password must be at least 8 characters.'); return;
        }

        const turnstileToken = window.turnstileWidgetId != null && window.turnstile
            ? window.turnstile.getResponse(window.turnstileWidgetId)
            : null;
        if (window.TURNSTILE_SITE_KEY && window.TURNSTILE_SITE_KEY !== 'YOUR_TURNSTILE_SITE_KEY_HERE' && !turnstileToken) {
            showAuthError('signup-error', 'Please complete the verification check before continuing.'); return;
        }

        setAuthBtnLoading('signup-submit', true);
        try {
            const authData = await handleSignUp({ fullName, email, password, phone, matricNumber, department, level, studentIdFile, turnstileToken });
            if (window.turnstileWidgetId != null && window.turnstile) window.turnstile.reset(window.turnstileWidgetId);
            closeAuthModal();
            if (!authData.session) {
                // Email confirmation required
                await showConfirm({
                    title:       'Check Your Email',
                    htmlContent: `<p class="dialog-message">We sent a confirmation link to <strong>${email}</strong>. Click it to activate your account, then come back and sign in.</p><p class="dialog-message" style="margin-top:8px;color:#64748b;font-size:13px;">Your verification request has been submitted. An admin will review your student ID shortly.</p>`,
                    confirmText: 'Got it!',
                    cancelText:  '',
                    iconType:    'success',
                    confirmStyle:'primary'
                });
            } else {
                showToast('Account created! Your verification request is pending review.', 'success', 6000);
            }
        } catch (err) {
            showAuthError('signup-error', err.message);
            if (window.turnstileWidgetId != null && window.turnstile) window.turnstile.reset(window.turnstileWidgetId);
        } finally {
            setAuthBtnLoading('signup-submit', false, 'Create Account');
        }
    });

    // Forgot password form
    document.getElementById('forgotForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();
        const errEl = document.getElementById('forgot-error');
        errEl.style.display = 'none';
        setAuthBtnLoading('forgot-submit', true);
        try {
            await handleForgotPassword(email);
            hideForgotPanel();
            closeAuthModal();
            showToast('Password reset link sent! Check your email.', 'success');
        } catch (err) {
            errEl.textContent = err.message; errEl.style.display = 'block';
        } finally {
            setAuthBtnLoading('forgot-submit', false, 'Send Reset Link');
        }
    });

    // Sign Out
    document.getElementById('signout-btn')?.addEventListener('click', async () => {
        const ok = await showConfirm({ title:'Sign Out', message:'Are you sure you want to sign out?', confirmText:'Sign Out', cancelText:'Stay', iconType:'warning', confirmStyle:'warning' });
        if (!ok) return;
        await handleSignOut();
        showToast('You have been signed out.', 'info');
    });

    // User avatar dropdown
    document.getElementById('user-menu-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        const dd = document.getElementById('user-dropdown');
        const btn = document.getElementById('user-menu-btn');
        const isOpen = dd?.classList.toggle('open');
        btn?.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', () => {
        document.getElementById('user-dropdown')?.classList.remove('open');
        document.getElementById('user-menu-btn')?.setAttribute('aria-expanded', 'false');
    });
}

// ═══════════════════════════════════════════════════════════════════════
// EVENT LISTENERS — LISTINGS
// ═══════════════════════════════════════════════════════════════════════
function bindListingEvents() {
    // Tab filters
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
            btn.classList.add('active-tab');
            currentTab = btn.dataset.type;
            currentPage = 1;
            displayListings();
        });
    });

    // Category filters
    document.querySelectorAll('#category-list li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('#category-list li').forEach(l => l.classList.remove('active-cat'));
            li.classList.add('active-cat');
            currentCategory = li.innerText;
            currentPage = 1;
            displayListings();
        });
    });

    // Search
    searchBar?.addEventListener('input', () => { currentPage = 1; displayListings(); });
    priceMinInput?.addEventListener('input', () => { currentPage = 1; displayListings(); });
    priceMaxInput?.addEventListener('input', () => { currentPage = 1; displayListings(); });
    sortSelect?.addEventListener('change', () => { currentPage = 1; displayListings(); });

    // Hero buttons
    document.getElementById('hero-explore-btn')?.addEventListener('click', () => {
        document.getElementById('featured-listings')?.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('hero-post-btn')?.addEventListener('click', showPostForm);
    document.getElementById('hero-lf-btn')?.addEventListener('click', openLfModal);

    // Nav Lost & Found button
    document.getElementById('nav-lf-btn')?.addEventListener('click', () => {
        openLfModal();
    });

    // Hide post form
    document.getElementById('hide-form-btn')?.addEventListener('click', () => {
        if (uploadFormSection) uploadFormSection.style.display = 'none';
    });

    // Listing type toggle (hide price for Lost & Found)
    const listingTypeSelect = document.getElementById('listingType');
    const priceInput        = document.getElementById('price');
    const priceLabel        = document.getElementById('priceLabel');
    listingTypeSelect?.addEventListener('change', function() {
        const isLost = this.value === 'Lost';
        if (priceInput) { priceInput.style.display = isLost ? 'none' : 'block'; if (isLost) priceInput.value = '0'; }
        if (priceLabel) priceLabel.style.display = isLost ? 'none' : 'block';
    });

    // Post form submit
    document.getElementById('postForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn   = document.getElementById('submit-listing-btn');
        const imageInput  = document.getElementById('image');
        const whatsapp    = document.getElementById('whatsapp').value.trim();

        if (!isValidNigerianPhone(whatsapp)) {
            showToast('Enter a valid Nigerian WhatsApp number (e.g. 08012345678).', 'error'); return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Publishing…';

        try {
            await postListing({
                productName:     document.getElementById('productName').value.trim(),
                listingType:     document.getElementById('listingType').value,
                productCategory: document.getElementById('productCategory').value,
                price:           document.getElementById('price').value || 0,
                description:     document.getElementById('description').value.trim(),
                seller:          document.getElementById('seller').value.trim(),
                whatsapp
            }, imageInput?.files?.[0] || null);

            document.getElementById('postForm').reset();
            if (uploadFormSection) uploadFormSection.style.display = 'none';
            showToast('Listing published successfully!', 'success');
            await loadListings();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Publish Listing';
        }
    });

    // Grid click delegation
    productsGrid?.addEventListener('click', async e => {
        const viewBtn   = e.target.closest('.view-btn');
        const editBtn   = e.target.closest('.edit-btn');
        const deleteBtn = e.target.closest('.delete-btn');
        if (viewBtn)   { await openViewModal(viewBtn.dataset.id);   return; }
        if (editBtn)   { await openEditModal(editBtn.dataset.id);   return; }
        if (deleteBtn) { await deleteListing(deleteBtn.dataset.id); return; }
    });

    // View modal close
    document.getElementById('closeViewModal')?.addEventListener('click', () => {
        if (viewModal) viewModal.style.display = 'none';
    });
    viewModal?.addEventListener('click', e => { if (e.target === viewModal) viewModal.style.display = 'none'; });

    // Edit modal close
    document.getElementById('closeEditModal')?.addEventListener('click', () => {
        if (editModal) editModal.style.display = 'none';
    });
    editModal?.addEventListener('click', e => { if (e.target === editModal) editModal.style.display = 'none'; });

    // Edit form submit
    document.getElementById('editForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const id  = document.getElementById('editListingId').value;
        const btn = e.target.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
            await updateListing(id, {
                product_name: document.getElementById('editName').value.trim(),
                price:        document.getElementById('editPrice').value || '0',
                description:  document.getElementById('editDescription').value.trim()
            });
            editModal.style.display = 'none';
            showToast('Listing updated.', 'success');
            await loadListings();
        } catch (err) {
            showToast('Update failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false; btn.textContent = 'Save Changes';
        }
    });
}

// ═══════════════════════════════════════════════════════════════════════
// BACK TO TOP
// ═══════════════════════════════════════════════════════════════════════
function bindBackToTop() {
    const btn = document.getElementById('backToTopBtn');
    if (!btn) return;
    window.addEventListener('scroll', () => { btn.style.display = window.scrollY > 500 ? 'block' : 'none'; });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ═══════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (viewModal?.style.display === 'flex') { viewModal.style.display = 'none'; return; }
        if (editModal?.style.display === 'flex') { editModal.style.display = 'none'; return; }
        if (authModal?.style.display === 'flex') { closeAuthModal(); return; }
        if (lfModal?.style.display   === 'flex') { closeLfModal();   return; }
    }
});

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS (real device push — works even with the site closed)
// ═══════════════════════════════════════════════════════════════════════
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function checkPushSubscriptionState() {
    const enableBtn = document.getElementById('enable-push-btn');
    if (!enableBtn) return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !window.VAPID_PUBLIC_KEY) {
        enableBtn.style.display = 'none'; // unsupported browser or not configured — don't show a dead button
        return;
    }
    if (Notification.permission === 'denied') {
        enableBtn.style.display = 'none'; // user already said no at the OS/browser level — asking again would just annoy them
        return;
    }

    const reg = await navigator.serviceWorker.ready;
    const existingSub = await reg.pushManager.getSubscription();
    enableBtn.style.display = existingSub ? 'none' : 'block';
}

async function enablePushNotifications() {
    if (!currentUser) return;
    const enableBtn = document.getElementById('enable-push-btn');

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            showToast('Notifications permission was not granted.', 'warning');
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(window.VAPID_PUBLIC_KEY)
            });
        }

        const subJson = sub.toJSON();
        const { error } = await supabase.from('push_subscriptions').upsert({
            user_id: currentUser.id,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth_key: subJson.keys.auth
        }, { onConflict: 'endpoint' });
        if (error) throw new Error(error.message);

        if (enableBtn) enableBtn.style.display = 'none';
        showToast('Push notifications enabled on this device!', 'success');
    } catch (err) {
        showToast('Could not enable push notifications: ' + err.message, 'error');
    }
}


let notifChannel = null;
let notifications = [];

async function loadNotifications() {
    if (!currentUser) { notifications = []; renderNotifications(); return; }
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30);
    if (!error) notifications = data || [];
    renderNotifications();
}

function renderNotifications() {
    const badge = document.getElementById('notif-badge');
    const list  = document.getElementById('notif-list');
    const unreadCount = notifications.filter(n => !n.is_read).length;

    if (badge) {
        if (unreadCount > 0) { badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount); badge.style.display = 'flex'; }
        else { badge.style.display = 'none'; }
    }

    if (!list) return;
    if (!notifications.length) {
        list.innerHTML = `<p class="admin-empty-msg" style="padding:16px;">No notifications yet.</p>`;
        return;
    }
    list.innerHTML = notifications.map(n => `
        <div class="notif-item ${n.is_read ? '' : 'notif-item-unread'}" data-id="${n.id}">
            <p class="notif-item-title">${escapeHtml(n.title)}</p>
            ${n.message ? `<p class="notif-item-msg">${escapeHtml(n.message)}</p>` : ''}
            <p class="notif-item-time">${formatRelativeTime(n.created_at)}</p>
        </div>
    `).join('');
}

async function markAllNotificationsRead() {
    if (!currentUser) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    notifications = notifications.map(n => ({ ...n, is_read: true }));
    renderNotifications();
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
}

function subscribeToNotifications() {
    if (!currentUser || notifChannel) return;
    notifChannel = supabase
        .channel(`notifications-${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
        }, payload => {
            notifications = [payload.new, ...notifications];
            renderNotifications();
            showToast(payload.new.title, payload.new.type || 'info');
        })
        .subscribe();
}

function unsubscribeFromNotifications() {
    if (notifChannel) { supabase.removeChannel(notifChannel); notifChannel = null; }
    notifications = [];
    renderNotifications();
}

function formatRelativeTime(isoString) {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(isoString);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function bindNotifications() {
    const bellBtn  = document.getElementById('notif-bell-btn');
    const dropdown = document.getElementById('notif-dropdown');

    bellBtn?.addEventListener('click', e => {
        e.stopPropagation();
        dropdown?.classList.toggle('open');
    });
    document.addEventListener('click', e => {
        if (dropdown?.classList.contains('open') && !e.target.closest('#notif-menu')) {
            dropdown.classList.remove('open');
        }
    });
    document.getElementById('notif-mark-all-read')?.addEventListener('click', markAllNotificationsRead);
    document.getElementById('enable-push-btn')?.addEventListener('click', enablePushNotifications);
}

// ═══════════════════════════════════════════════════════════════════════
// SELLER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
let dashboardListings = [];
let dashboardStatusFilter = 'Active';

async function openDashboard() {
    if (!currentUser) return;
    const modal = document.getElementById('dashboardModal');
    if (modal) modal.style.display = 'flex';

    const listEl = document.getElementById('dash-listings-list');
    if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">Loading your listings…</p>`;

    const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        if (listEl) listEl.innerHTML = `<p class="admin-empty-msg">Error loading listings: ${escapeHtml(error.message)}</p>`;
        return;
    }

    dashboardListings = data || [];
    document.getElementById('dash-active-count').textContent = dashboardListings.filter(l => l.status === 'Active').length;
    document.getElementById('dash-sold-count').textContent   = dashboardListings.filter(l => l.status === 'Sold').length;
    document.getElementById('dash-hidden-count').textContent = dashboardListings.filter(l => l.status === 'Hidden').length;
    document.getElementById('dash-rating').textContent = currentProfile?.rating_count
        ? (currentProfile.rating_sum / currentProfile.rating_count).toFixed(1) + ' ★'
        : '—';

    renderDashboardList();
}

function renderDashboardList() {
    const listEl = document.getElementById('dash-listings-list');
    if (!listEl) return;

    const filtered = dashboardListings.filter(l => l.status === dashboardStatusFilter);
    if (!filtered.length) {
        listEl.innerHTML = `<p class="admin-empty-msg">No ${dashboardStatusFilter.toLowerCase()} listings.</p>`;
        return;
    }

    listEl.innerHTML = filtered.map(l => {
        const expired  = isExpired(l);
        const daysLeft = daysUntilExpiry(l);
        let expiryNote = '';
        if (l.status === 'Active') {
            if (expired) expiryNote = ' • <span class="dash-expired-tag">Expired — hidden from listings</span>';
            else if (daysLeft !== null && daysLeft <= 5) expiryNote = ` • <span class="dash-expiring-tag">Expires in ${daysLeft}d</span>`;
        }
        return `
        <div class="dash-listing-row" data-id="${l.id}">
            <img src="${l.image_url || ''}" alt="" class="dash-listing-thumb" onerror="this.style.display='none'">
            <div class="dash-listing-info">
                <p class="dash-listing-name">${escapeHtml(l.product_name)}</p>
                <p class="dash-listing-meta">${l.type === 'Market' ? '₦' + Number(l.price || 0).toLocaleString() : l.type} • ${formatDate(l.created_at)}${expiryNote}</p>
            </div>
            <div class="dash-listing-actions">
                ${expired ? `<button type="button" class="dash-renew-btn" data-id="${l.id}">Renew Listing</button>` : ''}
                ${l.status === 'Active' ? `<button type="button" class="dash-sold-btn" data-id="${l.id}">${l.type === 'Market' ? 'Mark Sold' : 'Mark Resolved'}</button>` : ''}
                <button type="button" class="dash-edit-btn" data-id="${l.id}">Edit</button>
                <button type="button" class="dash-delete-btn" data-id="${l.id}">Delete</button>
            </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('.dash-renew-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            btn.disabled = true;
            const { error } = await supabase.from('listings')
                .update({ created_at: new Date().toISOString() })
                .eq('id', id);
            if (error) {
                showToast('Could not renew listing: ' + error.message, 'error');
                btn.disabled = false;
                return;
            }
            showToast('Listing renewed — it\'s visible again for another 30 days.', 'success');
            await openDashboard();
            await loadListings();
        });
    });

    listEl.querySelectorAll('.dash-sold-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const listing = dashboardListings.find(l => l.id === id);
            const ok = await showConfirm({
                title: 'Mark as Sold',
                message: `Mark "<strong>${escapeHtml(listing?.product_name || '')}</strong>" as sold?`,
                confirmText: 'Confirm', iconType: 'success', confirmStyle: 'primary'
            });
            if (!ok) return;
            await updateListing(id, { status: 'Sold' });
            showToast('Marked as sold.', 'success');
            await openDashboard();
            await loadListings();
        });
    });

    listEl.querySelectorAll('.dash-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('dashboardModal').style.display = 'none';
            openEditModal(btn.dataset.id);
        });
    });

    listEl.querySelectorAll('.dash-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const listing = dashboardListings.find(l => l.id === id);
            const ok = await showConfirm({
                title: 'Delete Listing',
                message: `Permanently delete "<strong>${escapeHtml(listing?.product_name || '')}</strong>"? This can't be undone.`,
                confirmText: 'Delete', iconType: 'danger', confirmStyle: 'danger'
            });
            if (!ok) return;
            await deleteListing(id);
            showToast('Listing deleted.', 'success');
            await openDashboard();
            await loadListings();
        });
    });
}

function bindDashboard() {
    document.getElementById('open-dashboard-btn')?.addEventListener('click', () => {
        document.getElementById('user-dropdown')?.classList.remove('open');
        openDashboard();
    });
    document.getElementById('closeDashboardModal')?.addEventListener('click', () => {
        document.getElementById('dashboardModal').style.display = 'none';
    });
    document.getElementById('dashboardModal')?.addEventListener('click', e => {
        if (e.target.id === 'dashboardModal') e.target.style.display = 'none';
    });
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            dashboardStatusFilter = tab.dataset.status;
            renderDashboardList();
        });
    });
}

async function init() {
    bindAuthModal();
    bindListingEvents();
    bindLfModal();
    bindBackToTop();
    bindNotifications();
    bindDashboard();
    bindIdUploadModal();
    bindResetPasswordModal();
    renderTurnstileWidget();

    if (!SUPABASE_CONFIGURED) {
        showToast(
            'Supabase is not connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY as Replit Secrets, then restart the workflow.',
            'warning', 12000
        );
        // Render empty state so the rest of the UI is usable
        if (productsGrid) {
            productsGrid.innerHTML = "<p class='no-results-msg'>Connect Supabase to start loading listings.</p>";
        }
        updateAuthUI();
        return;
    }

    // Auth state listener — fires on page load and on every session change
    supabase.auth.onAuthStateChange(async (event, session) => {
        currentUser = session?.user || null;
        if (currentUser) {
            await loadCurrentProfile(currentUser.id);
            await loadNotifications();
            subscribeToNotifications();
            checkPushSubscriptionState();
        } else {
            currentProfile = null;
            unsubscribeFromNotifications();
        }
        updateAuthUI();
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
            await loadListings();
        }
        if (event === 'PASSWORD_RECOVERY') {
            // Supabase fires this after the user clicks the reset-password
            // link in their email and lands back on the site. Show the
            // "set new password" modal instead of leaving them signed into
            // a temporary session with no way to change their password.
            if (authModal) authModal.style.display = 'none';
            if (resetPasswordModal) resetPasswordModal.style.display = 'flex';
        }
    });
}

init();
