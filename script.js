/* ==========================================================================
   1. CONFIGURATION (FIREBASE + GMAIL API)
   ========================================================================== */
const firebaseConfig = {
    apiKey: "AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE",
    authDomain: "nile-group-crm.firebaseapp.com",
    databaseURL: "https://nile-group-crm-default-rtdb.firebaseio.com",
    projectId: "nile-group-crm",
    storageBucket: "nile-group-crm.firebasestorage.app",
    messagingSenderId: "575678017832",
    appId: "1:575678017832:web:8ae69a81cfaaf7a717601d",
    measurementId: "G-11XNH0CYY1"
};

const G_CLIENT_ID = '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE';
const G_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const G_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels';

try { firebase.initializeApp(firebaseConfig); } catch (e) { console.error("Firebase Init Error:", e); }
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

/* ==========================================================================
   2. ACCESS CONTROL LIST (ACL)
   ========================================================================== */
const ALLOWED_USERS = {
    'ali@nileprise.com': { name: 'Asif', role: 'Employee' },
    'mdi@nileprise.com': { name: 'Ikram', role: 'Employee' },
    'mmr@nileprise.com': { name: 'Manikanta', role: 'Employee' },
    'maj@nileprise.com': { name: 'Mazher', role: 'Employee' },
    'msa@nileprise.com': { name: 'Shoeb', role: 'Employee' },
    'fma@nileprise.com': { name: 'Fayaz', role: 'Manager' },
    'an@nileprise.com': { name: 'Akhil', role: 'Manager' },
    'aman@nileprise.com': { name: 'Sanketh', role: 'Manager' },
    'careers@nileprise.com': { name: 'Nikhil Rapolu', role: 'Admin' },
};

/* ==========================================================================
   3. STATE MANAGEMENT
   ========================================================================== */
const state = {
    user: null, 
    userRole: null, 
    currentUserName: null, 
    candidates: [], 
    onboarding: [],
    employees: [],
    placements: [],
    allUsers: [],
    hubData: [],
    labels: [],
    selectedLabelColor: '#e91e63',
    
    gmail: {
        tokenClient: null,
        gapiInited: false,
        gisInited: false,
        nextPageToken: null,
        currentLabel: 'INBOX',
        currentEmailId: null
    },

    hub: {
        expandedRowId: null,
        filterType: 'daily',
        date: new Date().toISOString().split('T')[0],
        range: { start: 0, end: 0 }
    },
    
    uploadTarget: { id: null, field: null },
    placementFilter: 'monthly',
    
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' }, 
    empFilters: { text: '' },
    
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    modal: { id: null, type: null },
    pendingDelete: { type: null },
    
    alignments: { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {} },
    colOrders: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    customColumns: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    
    metadata: {
        recruiters: [],
        techs: [
            "React", "Node.js", "Java", "Python", ".NET", 
            "AWS", "Azure", "DevOps", "Salesforce", "Data Science",
            "Angular", "Flutter", "Golang", "PHP"
        ]
    }
};

const historyState = { undo: [], redo: [] };

/* ==========================================================================
   4. DOM CACHE
   ========================================================================== */
const dom = {
    screens: { 
        auth: document.getElementById('auth-screen'), 
        app: document.getElementById('dashboard-screen'), 
        verify: document.getElementById('verify-screen') 
    },
    navItems: document.querySelectorAll('.nav-item'),
    views: {
        dashboard: document.getElementById('view-dashboard'),
        inbox: document.getElementById('view-inbox'),
        candidates: document.getElementById('view-candidates'),
        hub: document.getElementById('view-hub'),
        employees: document.getElementById('view-employees'),
        onboarding: document.getElementById('view-onboarding'),
        settings: document.getElementById('view-settings'),
        profile: document.getElementById('view-profile'),
        placements: document.getElementById('view-placements')
    },
    headerUpdated: document.getElementById('header-updated'),
    gmail: {
        list: document.getElementById('gmail-rows-container'),
        searchInput: document.getElementById('gmail-search-input')
    },
    emailViewer: {
        modal: document.getElementById('email-viewer-modal'),
        iframe: document.getElementById('viewer-iframe'),
        subject: document.getElementById('viewer-subject'),
        from: document.getElementById('viewer-from') ? document.getElementById('viewer-from').querySelector('span') : null,
        to: document.getElementById('viewer-to') ? document.getElementById('viewer-to').querySelector('span') : null,
        date: document.getElementById('viewer-date')
    }
};

/* ==========================================================================
   5. INITIALIZATION & UTILITIES
   ========================================================================== */
function init() {
    setupEventListeners();
    loadGoogleScripts();
    
    db.collection('settings').doc('table_config').get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            if(data.colOrders) state.colOrders = data.colOrders;
            if(data.candidates) state.customColumns.candidates = data.candidates;
            if(data.employees) state.customColumns.employees = data.employees;
            if(data.onboarding) state.customColumns.onboarding = data.onboarding;
            if(data.placements) state.customColumns.placements = data.placements;
            if(data.hub) state.customColumns.hub = data.hub;
        }
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            if (!user.emailVerified) { 
                document.getElementById('verify-email-display').innerText = user.email; 
                switchScreen('verify'); return; 
            }
            state.user = user;
            const email = user.email.toLowerCase();
            const knownUser = ALLOWED_USERS[email];
            state.userRole = knownUser ? knownUser.role : 'Viewer'; 
            state.currentUserName = knownUser ? knownUser.name : (user.displayName || 'Unknown');
            
            updateUserProfile(user, knownUser);
            switchScreen('app');
            initRealtimeListeners();
            startAutoLogoutTimer();
            if(window.updateHubStats) updateHubStats('daily', new Date().toISOString().split('T')[0]);
        } else {
            switchScreen('auth');
            stopAutoLogoutTimer();
        }
    });

    if(localStorage.getItem('np_theme') === 'light') document.body.classList.add('light-mode');
    
    const monthPicker = document.getElementById('placement-month-picker');
    if(monthPicker) monthPicker.value = new Date().toISOString().slice(0, 7);
}

function switchScreen(screenName) {
    Object.values(dom.screens).forEach(s => s.classList.remove('active'));
    if(dom.screens[screenName]) dom.screens[screenName].classList.add('active');
}

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    document.getElementById('toast-msg').innerText = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 3000); 
}

/* ==========================================================================
   6. AUTHENTICATION HELPERS
   ========================================================================== */
window.togglePasswordVisibility = (inputId, iconElement) => {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        iconElement.classList.remove('fa-eye');
        iconElement.classList.add('fa-eye-slash');
        iconElement.style.color = "var(--primary)";
    } else {
        input.type = "password";
        iconElement.classList.remove('fa-eye-slash');
        iconElement.classList.add('fa-eye');
        iconElement.style.color = ""; 
    }
};

window.switchAuth = (type) => { 
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active')); 
    document.getElementById(`form-${type}`).classList.add('active'); 
};
window.handleReset = () => { 
    const email = document.getElementById('reset-email').value; 
    if(!email) return showToast("Enter email"); 
    auth.sendPasswordResetEmail(email).then(() => { showToast("Reset link sent"); switchAuth('login'); }).catch(e => showToast(e.message)); 
};
window.checkVerificationStatus = () => { 
    auth.currentUser.reload().then(() => { if(auth.currentUser.emailVerified) location.reload(); else showToast("Not verified yet. Check spam folder."); }); 
};
window.resendVerificationEmail = () => { auth.currentUser.sendEmailVerification().then(() => showToast("Email resent")); };
window.handleLogin = () => { 
    const e = document.getElementById('login-email').value, p = document.getElementById('login-pass').value; 
    if(!e || !p) return; auth.signInWithEmailAndPassword(e, p).catch(err => alert("Login Failed: " + err.message)); 
};
window.handleSignup = () => { 
    const n = document.getElementById('reg-name').value, e = document.getElementById('reg-email').value, p = document.getElementById('reg-pass').value; 
    auth.createUserWithEmailAndPassword(e, p).then(cred => { 
        cred.user.updateProfile({displayName: n}); 
        db.collection('users').doc(e).set({firstName: n, email: e, role: 'Employee', createdAt: Date.now()}); 
        cred.user.sendEmailVerification(); 
        showToast("Verification Sent"); 
        switchAuth('login'); 
    }).catch(err => showToast(err.message.replace('Firebase: ', ''))); 
};

/* ==========================================================================
   7. NAVIGATION & REAL-TIME DATABASE SYNC
   ========================================================================== */
dom.navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dom.navItems.forEach(b => b.classList.remove('active'));
        const clickedBtn = e.target.closest('.nav-item');
        clickedBtn.classList.add('active');

        if (window.innerWidth <= 900) {
            document.querySelector('.sidebar').classList.remove('mobile-open');
            const overlay = document.getElementById('sidebar-overlay');
            if(overlay) overlay.classList.remove('active');
        }

        Object.values(dom.views).forEach(view => { if(view) view.classList.remove('active'); });
        const targetId = clickedBtn.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
    
        if (targetView) {
            targetView.classList.add('active');
            if (targetId === 'view-dashboard') updateDashboardStats();
            if (targetId === 'view-profile') refreshProfileData();
            if (targetId === 'view-placements') renderPlacementTable();
        }
    });
});

function initRealtimeListeners() {
    db.collection('candidates').onSnapshot(snap => {
        state.candidates = []; state.hubData = [];
        snap.forEach(doc => { 
            const data = { id: doc.id, ...doc.data() };
            state.candidates.push(data); 
            state.hubData.push(data); 
        });
        state.candidates.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        renderCandidateTable();
        renderHubTable();
        updateDashboardStats();
        if(dom.headerUpdated) dom.headerUpdated.innerText = 'Synced';
    });

    db.collection('onboarding').onSnapshot(snap => {
        state.onboarding = [];
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() }));
        state.onboarding.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        renderOnboardingTable();
    });

    db.collection('employees').onSnapshot(snap => {
        state.employees = [];
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        state.employees.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        const firstNames = state.employees.map(e => e.first).filter(name => name && name.trim().length > 0);
        state.metadata.recruiters = [...new Set(firstNames)].sort();
        renderDropdowns(); 
        renderEmployeeTable();
        updateDashboardStats();
    });

    db.collection('placements').onSnapshot(snap => {
        state.placements = [];
        snap.forEach(doc => state.placements.push({ id: doc.id, ...doc.data() }));
        state.placements.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        renderPlacementTable();
    });

    db.collection('users').onSnapshot(snap => {
        state.allUsers = [];
        snap.forEach(doc => {
            const data = doc.data();
            const fullName = (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : (data.displayName || 'Staff Member');
            state.allUsers.push({ id: doc.id, name: fullName, dob: data.dob });
        });
        checkBirthdays();
    });
}

/* ==========================================================================
   8. USER PROFILE & SETTINGS
   ========================================================================== */
function updateUserProfile(user, hardcodedData) {
    if (!user) return;
    const displayName = hardcodedData ? hardcodedData.name : (user.displayName || 'Staff Member');
    const role = hardcodedData ? hardcodedData.role : 'Viewer';
    
    if (document.getElementById('display-username')) document.getElementById('display-username').innerText = displayName;
    if (document.getElementById('prof-name-display')) document.getElementById('prof-name-display').innerText = displayName;
    if (document.getElementById('prof-role-display')) document.getElementById('prof-role-display').innerText = role;
    if (document.getElementById('prof-email-display-sidebar')) document.getElementById('prof-email-display-sidebar').innerText = user.email;
    if (document.getElementById('prof-office-email')) document.getElementById('prof-office-email').value = user.email;
    if (document.getElementById('prof-designation')) document.getElementById('prof-designation').value = role; 

    db.collection('users').doc(user.email).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            if(document.getElementById('prof-first')) document.getElementById('prof-first').value = data.firstName || '';
            if(document.getElementById('prof-last')) document.getElementById('prof-last').value = data.lastName || '';
            if(document.getElementById('prof-dob')) document.getElementById('prof-dob').value = data.dob || ''; 
            if(document.getElementById('prof-work-mobile')) document.getElementById('prof-work-mobile').value = data.workMobile || '';
            if(document.getElementById('prof-personal-mobile')) document.getElementById('prof-personal-mobile').value = data.personalMobile || '';
            if(document.getElementById('prof-personal-email')) document.getElementById('prof-personal-email').value = data.personalEmail || '';
            
            let photoURL = data.photoURL || user.photoURL;
            if(photoURL) {
                const avatarImg = document.getElementById('profile-main-img');
                const avatarPlaceholder = document.getElementById('profile-main-icon');
                const deleteBtn = document.getElementById('btn-delete-photo');
                if(avatarImg) { avatarImg.src = photoURL; avatarImg.style.display = 'block'; }
                if(avatarPlaceholder) avatarPlaceholder.style.display = 'none';
                if(deleteBtn) deleteBtn.style.display = 'flex';
            }
        }
    });
}

function refreshProfileData() {
    const user = firebase.auth().currentUser;
    if(user) updateUserProfile(user, ALLOWED_USERS[user.email.toLowerCase()]);
}

window.saveProfileData = () => {
    const user = firebase.auth().currentUser;
    if (!user) return;
    const profileData = {
        firstName: document.getElementById('prof-first').value,
        lastName: document.getElementById('prof-last').value,
        dob: document.getElementById('prof-dob').value, 
        workMobile: document.getElementById('prof-work-mobile').value,
        personalMobile: document.getElementById('prof-personal-mobile').value,
        personalEmail: document.getElementById('prof-personal-email').value,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };
    db.collection('users').doc(user.email).set(profileData, { merge: true })
        .then(() => showToast("Profile Saved Successfully"))
        .catch(err => showToast("Error Saving: " + err.message));
};

/* ==========================================================================
   9. UNDO / REDO & SHORTCUT ENGINE
   ========================================================================== */
function getOldValue(collection, id, field) {
    let list = [];
    if (collection === 'candidates') list = state.candidates;
    else if (collection === 'employees') list = state.employees;
    else if (collection === 'onboarding') list = state.onboarding;
    else if (collection === 'placements') list = state.placements;
    else if (collection === 'hub') list = state.hubData; 
    const item = list.find(x => x.id === id);
    return item ? (item[field] !== undefined ? item[field] : '') : '';
}

function pushToHistory(collection, id, field, oldVal, newVal) {
    if (oldVal === newVal) return; 
    historyState.undo.push({ collection, id, field, oldVal, newVal });
    historyState.redo = []; 
    if (historyState.undo.length > 50) historyState.undo.shift();
}

window.performUndo = async () => {
    if (historyState.undo.length === 0) return showToast("Nothing to undo");
    const action = historyState.undo.pop();
    try {
        await db.collection(action.collection).doc(action.id).update({ [action.field]: action.oldVal });
        historyState.redo.push(action); showToast("Undo successful");
    } catch(e) { showToast("Undo failed"); historyState.undo.push(action); }
};

window.performRedo = async () => {
    if (historyState.redo.length === 0) return showToast("Nothing to redo");
    const action = historyState.redo.pop();
    try {
        await db.collection(action.collection).doc(action.id).update({ [action.field]: action.newVal });
        historyState.undo.push(action); showToast("Redo successful");
    } catch(e) { showToast("Redo failed"); historyState.redo.push(action); }
};

document.addEventListener('keydown', async (e) => {
    const activeTag = document.activeElement.tagName;
    const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    const activeCell = document.activeElement;
    if (activeCell.tagName === 'TD' && (e.key === 'Backspace' || e.key === 'Delete') && !isInput) {
        const row = activeCell.closest('tr'); const table = activeCell.closest('table');
        if (!row || !table) return;
        const id = row.dataset.id; const field = activeCell.dataset.field; const collection = row.dataset.collection; 
        if (id && field && collection) {
            e.preventDefault(); const oldVal = getOldValue(collection, id, field);
            pushToHistory(collection, id, field, oldVal, ""); activeCell.innerText = "";
            try { await db.collection(collection).doc(id).update({ [field]: "" }); showToast("Cell cleared"); } 
            catch (err) { activeCell.innerText = oldVal; showToast("Clear failed"); }
        }
        return;
    }

    if (e.key === 'Escape') {
        closeDeleteModal(); closeColumnModal();
        if (typeof closeComposeModal === 'function') closeComposeModal();
        if (typeof closeCreateLabelModal === 'function') closeCreateLabelModal();
        document.querySelectorAll('.custom-dropdown-menu').forEach(el => el.classList.remove('show'));
        if (document.activeElement && isInput) document.activeElement.blur();
        return;
    }

    if (cmdOrCtrl && !isInput) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return; } 
        else if (e.key.toLowerCase() === 'y') { e.preventDefault(); performRedo(); return; }
    }

    if (cmdOrCtrl && e.key.toLowerCase() === 'a' && !isInput) {
        e.preventDefault(); const activeView = document.querySelector('.content-view.active'); if (!activeView) return;
        const viewMap = { 'view-candidates': 'select-all-cand', 'view-hub': 'select-all-hub', 'view-employees': 'select-all-emp', 'view-onboarding': 'select-all-onb', 'view-placements': 'select-all-place' };
        const checkId = viewMap[activeView.id]; if (checkId) { const box = document.getElementById(checkId); if (box) box.click(); } return;
    }
});

/* ==========================================================================
   10. AUTO-SAVE DRAG & DROP (FRACTIONAL INDEXING)
   ========================================================================== */
let dragSrcEl = null; let dragCollection = null;
window.handleDragStart = (e, collection) => { 
    if (e.target.tagName === 'TH' || e.target.closest('th')) return; 
    dragSrcEl = e.target.closest('tr'); 
    dragCollection = collection; 
    e.dataTransfer.effectAllowed = 'move'; 
    e.dataTransfer.setData('text/plain', dragSrcEl.dataset.id); 
    dragSrcEl.classList.add('dragging'); 
};
window.handleDragOver = (e) => { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; };
window.handleDrop = async (e, collection) => {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl) dragSrcEl.classList.remove('dragging');
    if(dragCollection !== collection) return false;
    const targetRow = e.target.closest('tr');
    if (!targetRow || dragSrcEl === targetRow) return false;
    
    const tbody = targetRow.parentNode; 
    const targetRect = targetRow.getBoundingClientRect(); 
    const dropY = e.clientY; 
    const insertAfter = dropY > targetRect.top + (targetRect.height / 2);
    
    if (insertAfter) targetRow.after(dragSrcEl); else targetRow.before(dragSrcEl);
    
    const prevRow = dragSrcEl.previousElementSibling; const nextRow = dragSrcEl.nextElementSibling;
    let prevOrder = prevRow ? parseFloat(prevRow.dataset.order) : null; 
    let nextOrder = nextRow ? parseFloat(nextRow.dataset.order) : null; 
    let newOrder;
    
    if (prevOrder !== null && nextOrder !== null) newOrder = (prevOrder + nextOrder) / 2; 
    else if (prevOrder !== null) newOrder = prevOrder + 10000; 
    else if (nextOrder !== null) newOrder = nextOrder - 10000; 
    else newOrder = 0; 
    
    dragSrcEl.dataset.order = newOrder; const id = dragSrcEl.dataset.id;
    const oldOrder = getOldValue(collection, id, 'orderIndex'); 
    pushToHistory(collection, id, 'orderIndex', oldOrder, newOrder);
    
    try { 
        await db.collection(collection).doc(id).update({ orderIndex: newOrder }); 
        showToast("Row position saved"); 
        updateSerialNumbers(tbody); 
    } catch(err) { console.error(err); showToast("Failed to save row position"); }
    return false;
};
window.updateSerialNumbers = (tbody) => { 
    if (!tbody) return; 
    const rows = tbody.querySelectorAll('tr[data-id]'); 
    rows.forEach((row, index) => { if (row.cells.length > 2) row.cells[2].innerText = index + 1; }); 
};

/* ==========================================================================
   11. COLUMN ALIGNMENT & COLUMN DRAG/DROP
   ========================================================================== */
window.cycleAlign = (context, colName) => { 
    const modes = ['left', 'center', 'right']; 
    const current = state.alignments[context][colName] || 'left'; 
    const next = modes[(modes.indexOf(current) + 1) % 3]; 
    state.alignments[context][colName] = next; 
    refreshViewForType(context === 'candidates' ? 'cand' : (context === 'employees' ? 'emp' : (context === 'onboarding' ? 'onb' : (context === 'placements' ? 'place' : 'hub')))); 
};
window.cycleAlignAll = (context) => { 
    const modes = ['left', 'center', 'right']; 
    const current = state.alignments[context]['global'] || 'left'; 
    const next = modes[(modes.indexOf(current) + 1) % 3]; 
    state.alignments[context]['global'] = next; 
    refreshViewForType(context === 'candidates' ? 'cand' : (context === 'employees' ? 'emp' : (context === 'onboarding' ? 'onb' : (context === 'placements' ? 'place' : 'hub')))); 
    showToast(`All columns aligned ${next}`); 
};

function applyAlignStyles(context, tableId) { 
    const table = document.getElementById(tableId); if (!table) return;
    const headers = Array.from(table.querySelectorAll('th')); const config = state.alignments[context] || {}; let rules = '';
    headers.forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div) {
            const colName = div.dataset.colname; const val = config[colName] || config['global'] || 'left';
            if (val !== 'left') rules += `#${tableId} th:nth-child(${idx+1}), #${tableId} td:nth-child(${idx+1}) { text-align: ${val} !important; }\n`;
        }
    });
    let style = document.getElementById(`align-style-${context}`); 
    if(!style) { style = document.createElement('style'); style.id = `align-style-${context}`; document.head.appendChild(style); } 
    style.innerHTML = rules; 
}

function thAlign(title, context) { 
    const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left'; 
    const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right'); 
    const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : ''; 
    return `<div data-colname="${title}" style="display:flex; align-items:center; width:100%;"><span style="flex:1; text-align:${dir};">${title}</span><i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')"></i></div>`; 
}

let dragColIndex = null; let dragTableId = null;
function initColumnDragDrop(tableId, context) {
    const table = document.getElementById(tableId); if (!table) return;
    const headers = table.querySelectorAll('th');
    headers.forEach((th, index) => {
        if (index < 4) return; // Protect Fixed Columns
        th.setAttribute('draggable', 'true'); th.classList.add('draggable-col');
        th.ondragstart = (e) => { e.stopPropagation(); dragColIndex = Array.from(th.parentNode.children).indexOf(th); dragTableId = tableId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'col_drag'); th.style.opacity = '0.5'; };
        th.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); if (index < 4 || dragTableId !== tableId) return false; e.dataTransfer.dropEffect = 'move'; th.classList.add('drag-over'); return false; };
        th.ondragleave = (e) => th.classList.remove('drag-over');
        th.ondragend = (e) => { th.style.opacity = '1'; headers.forEach(h => h.classList.remove('drag-over')); };
        th.ondrop = (e) => {
            e.stopPropagation(); e.preventDefault(); th.classList.remove('drag-over');
            if (index < 4 || dragTableId !== tableId || dragColIndex === null) return;
            const dropColIndex = Array.from(th.parentNode.children).indexOf(th);
            if (dragColIndex !== dropColIndex) { moveColumnDOM(table, dragColIndex, dropColIndex); saveColumnOrder(tableId, context); applyAlignStyles(context, tableId); }
            dragColIndex = null; return false;
        };
    });
}
function moveColumnDOM(table, fromIdx, toIdx) {
    if (fromIdx === toIdx) return; const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].children;
        if (fromIdx < cells.length && toIdx < cells.length) {
            const target = cells[toIdx]; const source = cells[fromIdx];
            if (fromIdx < toIdx) rows[i].insertBefore(source, target.nextSibling); else rows[i].insertBefore(source, target);
        }
    }
}
function saveColumnOrder(tableId, context) {
    const table = document.getElementById(tableId); const headers = table.querySelectorAll('th'); const order = [];
    headers.forEach((th, idx) => { if (idx < 4) return; const div = th.querySelector('[data-colname]'); if (div && div.dataset.colname) order.push(div.dataset.colname); });
    state.colOrders[context] = order; db.collection('settings').doc('table_config').set({ colOrders: state.colOrders }, { merge: true });
}
function restoreColumnOrder(tableId, context) {
    const savedOrder = state.colOrders?.[context]; if (!savedOrder || savedOrder.length === 0) return;
    const table = document.getElementById(tableId); if (!table) return;
    savedOrder.forEach((colName, desiredRelativeIdx) => {
        const desiredDOMIdx = desiredRelativeIdx + 4; const headers = Array.from(table.querySelectorAll('th'));
        let currentDOMIdx = -1;
        for (let i = 4; i < headers.length; i++) { const div = headers[i].querySelector('[data-colname]'); if (div && div.dataset.colname === colName) { currentDOMIdx = i; break; } }
        if (currentDOMIdx !== -1 && currentDOMIdx !== desiredDOMIdx && desiredDOMIdx < headers.length) { moveColumnDOM(table, currentDOMIdx, desiredDOMIdx); }
    });
}

/* ==========================================================================
   12. TABLE RENDERERS (DOUBLE-CLICK EDIT ENABLED)
   ========================================================================== */
function getFilteredData(data, filters) {
    let subset = data;
    if (state.userRole === 'Employee' && state.currentUserName) {
        subset = subset.filter(item => item.recruiter === state.currentUserName);
    }
    return subset.filter(item => {
        const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text);
        const matchesRec = filters.recruiter ? item.recruiter === filters.recruiter : true;
        const matchesTech = filters.tech ? item.tech === filters.tech : true;
        const matchesStatus = filters.status ? item.status === filters.status : true;
        return matchesText && matchesRec && matchesTech && matchesStatus;
    });
}

function renderDropdowns() {
    const rSelect = document.getElementById('filter-recruiter');
    if (rSelect) rSelect.innerHTML = `<option value="">All Recruiters</option>${state.metadata.recruiters.map(r => `<option value="${r}">${r}</option>`).join('')}`;
    const tSelect = document.getElementById('filter-tech');
    if (tSelect) tSelect.innerHTML = `<option value="">All Tech</option>${state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('')}`;
    const hubRec = document.getElementById('hub-filter-recruiter');
    if (hubRec) hubRec.innerHTML = `<option value="">All Recruiters</option>${state.metadata.recruiters.map(r => `<option value="${r}">${r}</option>`).join('')}`;
}

function generateRecruiterDropdown(val, id, collection) {
    if (state.userRole === 'Employee') return val || '-';
    let opts = state.metadata.recruiters.map(r => `<option value="${r}" ${r===val?'selected':''}>${r}</option>`).join('');
    return `<select class="modern-select" style="width:100%; border:none; background:transparent;" onchange="inlineDateEdit('${id}', 'recruiter', '${collection}', this.value)"><option value="">Select...</option>${opts}</select>`;
}

function generateTechDropdown(val, id, collection) {
    let opts = state.metadata.techs.map(t => `<option value="${t}" ${t===val?'selected':''}>${t}</option>`).join('');
    return `<select class="modern-select text-cyan" style="width:100%; border:none; background:transparent; font-weight:600;" onchange="inlineDateEdit('${id}', 'tech', '${collection}', this.value)"><option value="">Select...</option>${opts}</select>`;
}

function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    const isAllChecked = filtered.length > 0 && filtered.every(c => state.selection.cand.has(c.id));
    const customHeaders = (state.customColumns.candidates || []).map(col => `<th>${thAlign(col.name, 'candidates')}</th>`).join('');
    
    thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')" title="Align All Columns"></i></div></th><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'candidates')}</th><th>${thAlign('First Name', 'candidates')}</th><th>${thAlign('Last Name', 'candidates')}</th><th>${thAlign('Mobile', 'candidates')}</th><th>${thAlign('WhatsApp', 'candidates')}</th><th>${thAlign('Tech', 'candidates')}</th><th>${thAlign('Recruiter', 'candidates')}</th><th style="width: 140px;">${thAlign('Status', 'candidates')}</th><th>${thAlign('Assigned', 'candidates')}</th><th>${thAlign('Gmail', 'candidates')}</th><th>${thAlign('LinkedIn', 'candidates')}</th><th>${thAlign('Resume', 'candidates')}</th><th>${thAlign('Track', 'candidates')}</th><th>${thAlign('Comments', 'candidates')}</th>${customHeaders}</tr>`;
    document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} records`;
    
    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : ''; const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive'; const statusLabel = c.status || 'Inactive';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        
        const customCells = (state.customColumns.candidates || []).map(col => { 
            const val = c[col.key] || ''; 
            if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`; 
            if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" ondblclick="inlineUrlEdit('${c.id}', '${col.key}', 'candidates', this)">${val ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-link text-cyan link-icon-btn"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; 
            return `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || ''}</td>`; 
        }).join('');

        const buildUrlCell = (val, field, iconClass) => {
            const innerContent = val 
                ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="${iconClass} link-icon-btn"></i></a>` 
                : `<i class="fa-solid fa-plus icon-empty"></i>`;
            return `<td style="text-align:center;" tabindex="0" data-field="${field}" ondblclick="inlineUrlEdit('${c.id}', '${field}', 'candidates', this)">${innerContent}</td>`;
        };

        const gmailCell = buildUrlCell(c.gmail, 'gmail', 'fa-brands fa-google icon-gmail');
        const linkedinCell = buildUrlCell(c.linkedin, 'linkedin', 'fa-brands fa-linkedin icon-linkedin');
        const resumeCell = buildUrlCell(c.resume, 'resume', 'fa-solid fa-file-lines icon-resume');
        const trackCell = buildUrlCell(c.track, 'track', 'fa-solid fa-location-crosshairs icon-track');
        
        return `<tr class="${rowClass}" data-id="${c.id}" data-collection="candidates" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'candidates')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'candidates')">
            <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td>
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
            <td>${i+1}</td>
            <td tabindex="0" data-field="first" id="fname-${c.id}" ondblclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td>
            <td tabindex="0" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
            <td tabindex="0" data-field="mobile" ondblclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td>
            <td tabindex="0" data-field="wa" ondblclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td>
            <td tabindex="0" data-field="tech" ondblclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td>
            <td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td>
            <td style="overflow:visible;">
                <div class="action-dropdown-container">
                    <div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${statusLabel} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div>
                    <div id="menu-${c.id}" class="custom-dropdown-menu">
                        <div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div>
                        <div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div>
                        <div class="dropdown-option" onclick="moveToPlacements('${c.id}')"><span class="dot-gold" style="width:8px; height:8px; background:#f59e0b; border-radius:50%; display:inline-block;"></span> Move to Placements</div>
                        <div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div>
                    </div>
                </div>
            </td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            ${gmailCell}
            ${linkedinCell}
            ${resumeCell}
            ${trackCell}
            <td tabindex="0" data-field="comments" ondblclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||''}</td>
            ${customCells}
        </tr>`;
    }).join('');
    
    restoreColumnOrder('candidates-table', 'candidates'); applyAlignStyles('candidates', 'candidates-table'); initColumnDragDrop('candidates-table', 'candidates');
}

function renderEmployeeTable() {
    let filtered = state.employees; if (state.userRole === 'Employee') filtered = filtered.filter(e => e.officialEmail === state.user.email); filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));
    const isAllChecked = filtered.length > 0 && filtered.every(e => state.selection.emp.has(e.id));
    const customHeaders = (state.customColumns.employees || []).map(col => `<th>${thAlign(col.name, 'employees')}</th>`).join('');
    
    document.getElementById('employee-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('employees')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('employees')"></i></div></th><th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'employees')}</th><th>${thAlign('First Name', 'employees')}</th><th>${thAlign('Last Name', 'employees')}</th><th>${thAlign('Date of Birth', 'employees')}</th><th>${thAlign('Designation', 'employees')}</th><th>${thAlign('Work Mobile', 'employees')}</th><th>${thAlign('Personal Mobile', 'employees')}</th><th>${thAlign('Official Email', 'employees')}</th><th>${thAlign('Personal Email', 'employees')}</th>${customHeaders}</tr>`;
    document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} records`;
    
    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.emp.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.employees || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'employees', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" ondblclick="inlineUrlEdit('${c.id}', '${col.key}', 'employees', this)">${val ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-link text-cyan link-icon-btn"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'employees', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="employees" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'employees')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'employees')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td><td>${i+1}</td><td tabindex="0" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td><td tabindex="0" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td><td tabindex="0" data-field="designation" ondblclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||''}</td><td tabindex="0" data-field="workMobile" ondblclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||''}</td><td tabindex="0" data-field="personalMobile" ondblclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||''}</td><td tabindex="0" data-field="officialEmail" ondblclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||''}</td><td tabindex="0" data-field="personalEmail" ondblclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||''}</td>${customCells}</tr>`; }).join('');
    
    restoreColumnOrder('employee-table', 'employees'); applyAlignStyles('employees', 'employee-table'); initColumnDragDrop('employee-table', 'employees');
}

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const isAllChecked = filtered.length > 0 && filtered.every(o => state.selection.onb.has(o.id));
    const customHeaders = (state.customColumns.onboarding || []).map(col => `<th>${thAlign(col.name, 'onboarding')}</th>`).join('');
    
    document.getElementById('onboarding-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('onboarding')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('onboarding')"></i></div></th><th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'onboarding')}</th><th>${thAlign('First Name', 'onboarding')}</th><th>${thAlign('Last Name', 'onboarding')}</th><th>${thAlign('Date of Birth', 'onboarding')}</th><th>${thAlign('Recruiter', 'onboarding')}</th><th>${thAlign('Mobile', 'onboarding')}</th><th>${thAlign('Status', 'onboarding')}</th><th>${thAlign('Assigned', 'onboarding')}</th><th>${thAlign('Comments', 'onboarding')}</th>${customHeaders}</tr>`;
    document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} records`;
    
    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.onb.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.onboarding || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'onboarding', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" ondblclick="inlineUrlEdit('${c.id}', '${col.key}', 'onboarding', this)">${val ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-link text-cyan link-icon-btn"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'onboarding', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="onboarding" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'onboarding')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'onboarding')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td><td>${i+1}</td><td tabindex="0" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td><td tabindex="0" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td><td tabindex="0" data-field="mobile" ondblclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td><td><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)"><option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option><option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option></select></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td><td tabindex="0" data-field="comments" ondblclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||''}</td>${customCells}</tr>`; }).join('');
    
    restoreColumnOrder('onboarding-table', 'onboarding'); applyAlignStyles('onboarding', 'onboarding-table'); initColumnDragDrop('onboarding-table', 'onboarding');
}

function renderPlacementTable() {
    const mVal = document.getElementById('placement-month-picker')?.value; const yVal = document.getElementById('placement-year-picker')?.value;
    let placed = state.placements.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); });
    if(!state.selection.place) state.selection.place = new Set();
    const isAllChecked = placed.length > 0 && placed.every(p => state.selection.place.has(p.id));
    const thead = document.querySelector('#placement-table-head'); 
    const customHeaders = (state.customColumns.placements || []).map(col => `<th>${thAlign(col.name, 'placements')}</th>`).join('');
    
    if(thead) {
        thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('placements')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('placements')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'placements')}</th><th>${thAlign('First Name', 'placements')}</th><th>${thAlign('Last Name', 'placements')}</th><th>${thAlign('Tech', 'placements')}</th><th>${thAlign('Location', 'placements')}</th><th>${thAlign('Contract', 'placements')}</th><th>${thAlign('Assigned', 'placements')}</th><th>${thAlign('Actions', 'placements')}</th>${customHeaders}</tr>`;
    }
    const countEl = document.getElementById('placement-footer-count');
    if(countEl) countEl.innerText = `Showing ${placed.length} records`;
    
    const tbody = document.getElementById('placement-table-body');
    if(tbody) {
        tbody.innerHTML = placed.map((c, i) => { const isSel = state.selection.place.has(c.id) ? 'checked' : ''; const rowClass = state.selection.place.has(c.id) ? 'selected-row' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.placements || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'placements', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" ondblclick="inlineUrlEdit('${c.id}', '${col.key}', 'placements', this)">${val ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-link text-cyan link-icon-btn"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'placements', this)">${val || ''}</td>`; }).join(''); return `<tr class="${rowClass}" data-id="${c.id}" data-collection="placements" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'placements')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'placements')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'placements', this)">${c.first}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'placements', this)">${c.last}</td><td tabindex="0" data-field="tech" ondblclick="inlineEdit('${c.id}', 'tech', 'placements', this)" class="text-cyan">${c.tech}</td><td tabindex="0" data-field="location" ondblclick="inlineEdit('${c.id}', 'location', 'placements', this)">${c.location||''}</td><td tabindex="0" data-field="contract" ondblclick="inlineEdit('${c.id}', 'contract', 'placements', this)">${c.contract||''}</td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'placements', this.value)"></td><td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>${customCells}</tr>`; }).join('');
    }
    restoreColumnOrder('placement-table', 'placements'); applyAlignStyles('placements', 'placement-table'); initColumnDragDrop('placement-table', 'placements');
}

function renderHubTable() {
    let data = state.hubData; 
    if(state.userRole === 'Employee' && state.currentUserName) data = data.filter(c => c.recruiter === state.currentUserName);
    if(state.hubFilters && state.hubFilters.text) data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));
    
    const { start, end } = state.hub.range; 
    const isInRange = (entry) => { 
        const dateStr = typeof entry === 'string' ? entry : entry.date;
        if(!dateStr) return false;
        const [y, m, d] = dateStr.split('-').map(Number);
        const t = new Date(y, m - 1, d, 12, 0, 0).getTime(); 
        return t >= start && t <= end; 
    };
    
    const activeCandidates = data.filter(c => (c.submissionLog || []).some(isInRange) || (c.screeningLog || []).some(isInRange) || (c.interviewLog || []).some(isInRange));
    if(!state.selection.hub) state.selection.hub = new Set();
    const isAllChecked = activeCandidates.length > 0 && activeCandidates.every(c => state.selection.hub.has(c.id));
    
    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('hub')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('hub')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'hub')}</th><th style="width:150px;">${thAlign('Candidate Name', 'hub')}</th><th style="width:150px;">${thAlign('Recruiter', 'hub')}</th><th style="width:120px;">${thAlign('Technology', 'hub')}</th><th style="text-align:center;">${thAlign('Submission', 'hub')}</th><th style="text-align:center;">${thAlign('Screenings', 'hub')}</th><th style="text-align:center;">${thAlign('Interview', 'hub')}</th><th style="text-align:right;">${thAlign('Date', 'hub')}</th></tr>`;
    document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    const tbody = document.getElementById('hub-table-body');
    
    if (activeCandidates.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`; return; }
    
    tbody.innerHTML = activeCandidates.map((c, i) => {
        const sub = (c.submissionLog||[]).filter(isInRange).length; const scr = (c.screeningLog||[]).filter(isInRange).length; const int = (c.interviewLog||[]).filter(isInRange).length;
        let displayDate = '-'; const logsInRange = [...(c.submissionLog||[]).filter(isInRange), ...(c.screeningLog||[]).filter(isInRange), ...(c.interviewLog||[]).filter(isInRange)];
        if (logsInRange.length > 0) { logsInRange.sort((a,b) => new Date(b.date || b) - new Date(a.date || a)); const latest = logsInRange[0]; displayDate = (typeof latest === 'string') ? latest : (latest.date || '-'); }
        const isSel = state.selection.hub.has(c.id) ? 'checked' : ''; const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : ''; const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        
        let html = `<tr style="cursor:pointer; ${activeStyle}" class="${state.selection.hub.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="hub" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'hub')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'hub')"><td class="drag-handle-cell" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'hub', this)">${c.first} ${c.last}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'hub')}</td><td>${generateTechDropdown(c.tech, c.id, 'hub')}</td><td class="text-cyan" style="font-weight:bold; font-size:1.1rem; text-align:center;" onclick="toggleHubRow('${c.id}')">${sub}</td><td class="text-gold" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${scr}</td><td class="text-purple" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${int}</td><td style="font-size:0.8rem; color:var(--text-muted); text-align:right;" onclick="toggleHubRow('${c.id}')">${displayDate} <span style="margin-left: 8px; opacity:0.7;">${caret}</span></td></tr>`;
        
        if(isExpanded) {
            const inputDefault = state.hub.date || new Date().toISOString().split('T')[0];
            const renderTimeline = (list, type) => {
                const visibleLogs = (list||[]).filter(isInRange);
                if(visibleLogs.length === 0) return `<li class="hub-log-item" style="opacity:0.5; font-style:italic;">No records in this range.</li>`;
                return visibleLogs.map((entry, index) => {
                    const isLegacy = typeof entry === 'string', dateStr = isLegacy ? entry : entry.date, subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject'), link = !isLegacy && entry.link ? entry.link : null, icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');
                    return `<li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);"><div style="display:flex; justify-content:space-between; width:100%;"><span class="log-date" style="color:var(--primary); font-weight:bold; font-size:0.85rem;"><i class="fa-solid ${icon}"></i> ${dateStr}</span>${!isLegacy && entry.recruiter ? `<span style="font-size:0.7rem; opacity:0.6;">${entry.recruiter}</span>` : ''}</div><div style="font-weight:500; color:#fff; font-size:0.9rem;">${subject}</div>${link ? `<a href="${link}" target="_blank" class="hub-link-btn" style="margin-top:5px; text-decoration:none; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--primary); font-size:0.8rem;">View Link</a>` : ''}<div style="text-align:right; width:100%; margin-top:5px;"><button class="hub-action-btn delete" style="color: #ef4444; background:none; border:none; cursor:pointer;" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${type==='sub'?'submissionLog':type==='scr'?'screeningLog':'interviewLog'}', ${index})"><i class="fa-solid fa-trash"></i> Remove</button></div></li>`;
                }).join('');
            };
            
            html += `<tr class="hub-details-row"><td colspan="10" style="padding:0; border:none;"><div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()">
                <div class="hub-col cyan">
                    <div class="hub-col-header cyan"><i class="fa-solid fa-paper-plane"></i> Submissions</div>
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="date" id="in-sub-${c.id}" class="date-input-modern" style="flex:1;" value="${inputDefault}">
                        <button class="btn-icon-small" title="Attach File" onclick="triggerHubFileUpload('${c.id}', 'submissionLog')"><i class="fa-solid fa-paperclip"></i></button>
                        <button class="btn-primary" style="padding:5px 10px; border-radius:6px; border:none; color:#fff; cursor:pointer;" onclick="addHubLog('${c.id}', 'submissionLog', 'in-sub-${c.id}')">Add</button>
                    </div>
                    <ul class="hub-log-list custom-scroll">${renderTimeline(c.submissionLog, 'sub')}</ul>
                </div>
                <div class="hub-col gold">
                    <div class="hub-col-header gold"><i class="fa-solid fa-user-clock"></i> Screenings</div>
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="date" id="in-scr-${c.id}" class="date-input-modern" style="flex:1;" value="${inputDefault}">
                        <button class="btn-icon-small" title="Attach File" onclick="triggerHubFileUpload('${c.id}', 'screeningLog')"><i class="fa-solid fa-paperclip"></i></button>
                        <button class="btn-primary" style="background:#f59e0b; padding:5px 10px; border-radius:6px; border:none; color:#fff; cursor:pointer;" onclick="addHubLog('${c.id}', 'screeningLog', 'in-scr-${c.id}')">Add</button>
                    </div>
                    <ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog, 'scr')}</ul>
                </div>
                <div class="hub-col purple">
                    <div class="hub-col-header purple"><i class="fa-solid fa-headset"></i> Interviews</div>
                    <div style="display:flex; gap:5px; margin-bottom:10px;">
                        <input type="date" id="in-int-${c.id}" class="date-input-modern" style="flex:1;" value="${inputDefault}">
                        <button class="btn-icon-small" title="Attach File" onclick="triggerHubFileUpload('${c.id}', 'interviewLog')"><i class="fa-solid fa-paperclip"></i></button>
                        <button class="btn-primary" style="background:#8b5cf6; padding:5px 10px; border-radius:6px; border:none; color:#fff; cursor:pointer;" onclick="addHubLog('${c.id}', 'interviewLog', 'in-int-${c.id}')">Add</button>
                    </div>
                    <ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog, 'int')}</ul>
                </div>
            </div></td></tr>`;
        }
        return html;
    }).join('');
    
    restoreColumnOrder('hub-table', 'hub'); applyAlignStyles('hub', 'hub-table'); initColumnDragDrop('hub-table', 'hub');
}

/* ==========================================================================
   13. HUB STATS & LOGIC
   ========================================================================== */
window.updateHubStats = (filterType, dateVal) => {
    if(filterType) state.hub.filterType = filterType; 
    if(dateVal) state.hub.date = dateVal;
    
    const dateInput = document.getElementById('hub-date-picker'); 
    if (dateInput && dateInput.value !== state.hub.date) { dateInput.value = state.hub.date; }

    const [year, month, day] = state.hub.date.split('-').map(Number);
    const d = new Date(year, month - 1, day); 
    
    let start, end, labelText;

    if (state.hub.filterType === 'daily') { 
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime(); 
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime(); 
        labelText = state.hub.date; 
    } 
    else if (state.hub.filterType === 'weekly') { 
        const currentDay = d.getDay(); 
        const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay; 
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + distanceToMonday);
        const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
        start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0).getTime(); 
        end = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate(), 23, 59, 59, 999).getTime(); 
        const monStr = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const friStr = friday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        labelText = `${monStr} - ${friStr}`;
    } 
    else if (state.hub.filterType === 'monthly') { 
        start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime(); 
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime(); 
        labelText = d.toLocaleString('default', { month: 'long', year: 'numeric' }); 
    }

    if(document.getElementById('hub-range-label')) document.getElementById('hub-range-label').innerHTML = `<i class="fa-regular fa-calendar"></i> ${labelText}`;
    state.hub.range = { start, end };
    
    const isInRange = (entry) => { 
        const dateStr = typeof entry === 'string' ? entry : entry.date;
        if(!dateStr) return false;
        const [y, m, dayVal] = dateStr.split('-').map(Number);
        const t = new Date(y, m - 1, dayVal, 12, 0, 0).getTime(); 
        return t >= start && t <= end; 
    };

    let subs=0, scrs=0, ints=0; 
    state.hubData.forEach(c => { 
        subs += (c.submissionLog||[]).filter(isInRange).length; 
        scrs += (c.screeningLog||[]).filter(isInRange).length; 
        ints += (c.interviewLog||[]).filter(isInRange).length; 
    });
    
    if(document.getElementById('stat-sub')) document.getElementById('stat-sub').innerText = subs; 
    if(document.getElementById('stat-scr')) document.getElementById('stat-scr').innerText = scrs; 
    if(document.getElementById('stat-int')) document.getElementById('stat-int').innerText = ints;
    
    document.querySelectorAll('.hub-controls .filter-btn').forEach(b => { 
        b.classList.remove('active'); 
        if(b.getAttribute('data-filter') === state.hub.filterType) b.classList.add('active'); 
    });
    
    renderHubTable();
};

window.addHubLog = async (id, fieldName, inputId) => {
    const dateInput = document.getElementById(inputId);
    const dateVal = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    
    if(!dateVal) return showToast("Please select a valid date");
    
    const noteVal = prompt("Enter a description or paste a link for this log:");
    if(noteVal === null) return; 
    
    const candidate = state.hubData.find(c => c.id === id);
    if(!candidate) return;

    let logs = candidate[fieldName] || [];
    const newEntry = { 
        date: dateVal, 
        subject: noteVal.startsWith('http') ? 'Attached Link' : (noteVal || 'Manual Entry'),
        link: noteVal.startsWith('http') ? noteVal : "", 
        recruiter: state.currentUserName, 
        timestamp: Date.now(), 
        type: 'Manual Entry' 
    };
    
    logs.push(newEntry);
    
    try {
        await db.collection('candidates').doc(id).update({ [fieldName]: logs });
        showToast("Activity Logged");
    } catch (err) {
        showToast("Error saving log: " + err.message);
    }
};

window.deleteHubLog = async (candId, logType, index) => { 
    if(!confirm("Remove this log entry?")) return; 
    const candidate = state.hubData.find(c => c.id === candId); 
    let logs = candidate[logType] || []; 
    logs.splice(index, 1); 
    await db.collection('candidates').doc(candId).update({ [logType]: logs });
    showToast("Log Removed"); 
};

/* ==========================================================================
   14. FILE HANDLING (HUB + PROFILE)
   ========================================================================== */
window.triggerHubFileUpload = (candidateId, fieldName) => {
    state.uploadTarget = { id: candidateId, field: fieldName };
    document.getElementById('hub-file-input').click();
};

window.handleHubFileSelect = (input) => {
    const file = input.files[0];
    if (!file) return;
    const { id, field } = state.uploadTarget;
    if (!id || !field) return;

    const dateVal = new Date().toISOString().split('T')[0];
    const storageRef = storage.ref(`candidates/${id}/emails/${Date.now()}_${file.name}`);
    showToast("Uploading Email...");

    storageRef.put(file).then(snapshot => {
        return snapshot.ref.getDownloadURL();
    }).then(url => {
        const candidate = state.candidates.find(c => c.id === id) || state.hubData.find(c => c.id === id);
        let logs = candidate[field] || [];
        const newEntry = { date: dateVal, link: url, timestamp: Date.now() };
        logs.push(newEntry);
        const targetCollection = candidate.status === 'Placed' ? 'placements' : 'candidates';
        return db.collection(targetCollection).doc(id).update({ [field]: logs });
    }).then(() => {
        showToast("Email Attached!");
        input.value = '';
    }).catch(err => {
        showToast("Upload Error: " + err.message);
        input.value = '';
    });
};

window.triggerPhotoUpload = () => { document.getElementById('profile-upload-input').click(); };

window.handlePhotoUpload = async (input) => {
    const file = input.files[0];
    if (!file || !file.type.startsWith('image/')) return showToast("Please select an image file.");
    const user = auth.currentUser; if (!user) return;
    const localPreviewURL = URL.createObjectURL(file);
    const avatarImg = document.getElementById('profile-main-img');
    const avatarPlaceholder = document.getElementById('profile-main-icon');
    if(avatarImg) { avatarImg.src = localPreviewURL; avatarImg.style.display = 'block'; }
    if(avatarPlaceholder) avatarPlaceholder.style.display = 'none';

    try {
        const storageRef = storage.ref(`users/${user.email}/profile.jpg`); 
        const uploadTask = storageRef.put(file);
        uploadTask.on('state_changed', null, 
            (error) => { showToast("Upload Failed"); }, 
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    db.collection('users').doc(user.email).set({ photoURL: downloadURL }, { merge: true });
                    user.updateProfile({ photoURL: downloadURL });
                    document.getElementById('btn-delete-photo').style.display = 'flex';
                    showToast("Photo Updated");
                });
            }
        );
    } catch (err) { showToast("Error processing image"); }
};

window.deleteProfilePhoto = () => {
    if(!confirm("Remove profile photo?")) return;
    const user = auth.currentUser; if (!user) return;
    db.collection('users').doc(user.email).update({ photoURL: firebase.firestore.FieldValue.delete() }).then(() => {
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-icon').style.display = 'flex';
        document.getElementById('btn-delete-photo').style.display = 'none';
        showToast("Photo Removed");
    });
};

/* ==========================================================================
   15. DATA MANIPULATION & INLINE EDITS
   ========================================================================== */
window.createNewRow = async (type) => {
    const ts = Date.now() + Math.random(); 
    const newOrderIndex = -ts;
    const defaultRecruiter = state.userRole === 'Employee' ? state.currentUserName : '';

    let data = { 
        first: '', last: '', mobile: '', wa: '', tech: '', comments: '', 
        assigned: new Date().toISOString().split('T')[0], 
        recruiter: defaultRecruiter, 
        orderIndex: newOrderIndex, 
        createdAt: ts 
    };
    
    let collectionName = type;
    
    if (type === 'candidates') { 
        data.status = 'Active'; 
    } 
    else if (type === 'employees') { 
        data.designation = ''; data.workMobile = ''; data.personalMobile = ''; 
        data.officialEmail = state.userRole === 'Employee' ? state.user.email : '';
        data.personalEmail = ''; data.dob = ''; 
    } 
    else if (type === 'onboarding') { 
        data.status = 'Onboarding'; data.dob = ''; 
    }
    else if (type === 'hub') { 
        data.status = 'Active'; 
        collectionName = 'candidates'; 
        data.submissionLog = []; data.screeningLog = []; data.interviewLog = [];
    }

    try { await db.collection(collectionName).add(data); showToast(`Blank row added to ${type}`); } 
    catch (error) { console.error("Insertion error:", error); showToast("Error adding row"); } 
};

window.manualAddPlacement = async () => {
    const ts = Date.now() + Math.random();
    let defaultDate = new Date().toISOString().split('T')[0];
    const mVal = document.getElementById('placement-month-picker')?.value;
    const yVal = document.getElementById('placement-year-picker')?.value;
    
    if (state.placementFilter === 'monthly' && mVal) defaultDate = `${mVal}-01`;
    else if (state.placementFilter === 'yearly' && yVal) defaultDate = `${yVal}-01-01`;

    const defaultRecruiter = state.userRole === 'Employee' ? state.currentUserName : '';

    const data = { 
        first: '', last: '', tech: '', location: '', contract: '', 
        assigned: defaultDate, 
        status: 'Placed', 
        recruiter: defaultRecruiter,
        createdAt: ts, orderIndex: -ts 
    };
    
    try { await db.collection('placements').add(data); showToast("Blank placement added"); } 
    catch (error) { showToast("Error adding placement"); } 
};

window.inlineEdit = (id, field, col, el) => { 
    if (el.querySelector('input')) return; 
    el.tabIndex = 0; el.dataset.field = field;
    const val = el.innerText; 
    el.innerHTML = `<input type="text" class="inline-input-active" value="${val}">`; 
    
    const input = el.querySelector('input');
    input.focus(); 
    input.selectionStart = input.selectionEnd = input.value.length; 
    
    input.onclick = (e) => e.stopPropagation(); 
    input.ondblclick = (e) => e.stopPropagation(); 
    
    input.onblur = () => saveInline(input, id, field, col, val);
    input.onkeydown = (e) => { 
        if (e.key === 'Enter') input.blur(); 
        if (e.key === 'Escape') { input.value = val; input.blur(); } 
    };
};

window.saveInline = (input, id, field, col, oldVal) => { 
    const newVal = input.value.trim(); 
    input.parentElement.innerText = newVal; 
    if(newVal !== oldVal) { 
        pushToHistory(col, id, field, oldVal, newVal); 
        db.collection(col).doc(id).update({[field]: newVal}).then(() => showToast("Auto-Saved")).catch(()=>input.parentElement.innerText = oldVal); 
    } 
};

window.updateStatus = (id, col, val) => { 
    const oldVal = getOldValue(col, id, 'status'); 
    pushToHistory(col, id, 'status', oldVal, val); 
    return db.collection(col).doc(id).update({status: val}).then(() => showToast("Status Auto-Saved")); 
};

window.inlineDateEdit = (id, field, col, val) => { 
    const oldVal = getOldValue(col, id, field); 
    pushToHistory(col, id, field, oldVal, val); 
    return db.collection(col).doc(id).update({[field]: val}).then(() => showToast("Date Auto-Saved")); 
};

window.inlineUrlEdit = (id, field, col, el) => { 
    if(el.querySelector('input')) return; 
    const oldVal = getOldValue(col, id, field) || ''; 
    el.innerHTML = ''; 
    const input = document.createElement('input'); 
    input.type = 'url'; 
    input.placeholder = 'Paste Link...'; 
    input.className = 'url-input-active'; 
    input.value = oldVal; 
    
    input.onclick = (e) => e.stopPropagation(); 
    input.ondblclick = (e) => e.stopPropagation(); 
    
    const save = () => { 
        let newVal = input.value.trim(); 
        if(newVal && !newVal.startsWith('http')) newVal = 'https://' + newVal; 
        if(newVal !== oldVal) { 
            pushToHistory(col, id, field, oldVal, newVal); 
            db.collection(col).doc(id).update({ [field]: newVal }).then(() => showToast("Link Auto-Saved")); 
        } else {
            refreshViewForType(col);
        }
    }; 
    
    input.addEventListener('blur', save); 
    input.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter') input.blur(); 
        if (e.key === 'Escape') refreshViewForType(col); 
    }); 
    
    el.appendChild(input); 
    input.focus(); 
    input.select(); 
};

window.toggleRowMenu = (id) => { 
    document.querySelectorAll('.custom-dropdown-menu').forEach(el => { if(el.id !== `menu-${id}`) el.classList.remove('show'); }); 
    const menu = document.getElementById(`menu-${id}`); 
    if(menu) menu.classList.toggle('show'); 
    document.addEventListener('click', function closeMenu(e) { 
        if (!e.target.closest('.action-dropdown-container')) { 
            if(menu) menu.classList.remove('show'); document.removeEventListener('click', closeMenu); 
        } 
    }); 
};

window.updateStatusAndClose = (id, status) => { 
    updateStatus(id, 'candidates', status); 
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); 
};

window.editCustomStatus = async (id) => { 
    const currentStatus = state.candidates.find(c => c.id === id)?.status || ""; 
    const newStatus = prompt("Enter new status detail:", currentStatus); 
    if (newStatus && newStatus.trim() !== "") { 
        await db.collection('candidates').doc(id).update({ status: newStatus.trim() }); showToast("Status updated"); 
    } 
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); 
};

let activeColumnContext = null;
window.openAddColumnModal = (context) => { 
    activeColumnContext = context; const modal = document.getElementById('add-column-modal'); modal.style.display = 'flex'; document.getElementById('new-col-name').focus(); 
    let manageSection = document.getElementById('column-manage-section'); 
    if (!manageSection) { manageSection = document.createElement('div'); manageSection.id = 'column-manage-section'; manageSection.style.marginTop = '20px'; manageSection.style.paddingTop = '15px'; manageSection.style.borderTop = '1px solid var(--glass-border)'; const actions = modal.querySelector('.modal-actions'); modal.querySelector('.glass-panel').insertBefore(manageSection, actions); } 
    const currentCols = state.customColumns[context] || []; 
    if (currentCols.length > 0) { manageSection.innerHTML = `<h4 style="color:var(--text-muted); font-size:0.8rem; margin-bottom:10px;">MANAGE CUSTOM COLUMNS</h4><div style="max-height:100px; overflow-y:auto; padding-right:5px;">${currentCols.map((col, idx) => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:4px;"><span style="font-size:0.85rem; color:var(--text-main);">${col.name}</span><i class="fa-solid fa-trash text-danger" style="cursor:pointer;" onclick="deleteCustomColumn('${context}', ${idx})" title="Delete Column"></i></div>`).join('')}</div>`; manageSection.style.display = 'block'; } 
    else { manageSection.style.display = 'none'; } 
};
window.closeColumnModal = () => { document.getElementById('add-column-modal').style.display = 'none'; document.getElementById('new-col-name').value = ''; activeColumnContext = null; };
window.executeAddColumn = async () => { 
    const name = document.getElementById('new-col-name').value.trim(); const type = document.getElementById('new-col-type').value; 
    if (!name || !activeColumnContext) return; 
    const key = name.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()); 
    if (!state.customColumns[activeColumnContext]) state.customColumns[activeColumnContext] = []; 
    state.customColumns[activeColumnContext].push({ name, key, type }); 
    await saveAndRefreshColumns(activeColumnContext, `Column "${name}" Added`); 
    document.getElementById('new-col-name').value = ''; openAddColumnModal(activeColumnContext); 
};
window.deleteCustomColumn = async (context, index) => { 
    if (!confirm("Delete this column? (Data will remain in database but be hidden)")) return; 
    state.customColumns[context].splice(index, 1); 
    await saveAndRefreshColumns(context, "Column Removed"); openAddColumnModal(context); 
};
async function saveAndRefreshColumns(context, msg) { 
    try { await db.collection('settings').doc('table_config').set({ [context]: state.customColumns[context] }, { merge: true }); showToast(msg); refreshViewForType(context); } 
    catch(e) { console.error(e); showToast("Error saving configuration"); } 
}

window.toggleSelect = (id, type) => { if(!state.selection[type]) state.selection[type] = new Set(); if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id); updateSelectButtons(type); refreshViewForType(type); };
window.toggleSelectAll = (type, box) => {
    let data = [];
    if(type==='cand') data = getFilteredData(state.candidates, state.filters);
    else if(type==='emp') data = state.employees; else if(type==='onb') data = state.onboarding;
    else if(type==='hub') { const { start, end } = state.hub.range; const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; }; data = state.hubData.filter(c => [...(c.submissionLog||[]), ...(c.screeningLog||[]), ...(c.interviewLog||[])].some(isInRange)); }
    else if(type==='place') { const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value; data = state.placements.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); }); }
    if(!state.selection[type]) state.selection[type] = new Set();
    if(box.checked) data.forEach(i=>state.selection[type].add(i.id)); else state.selection[type].clear();
    updateSelectButtons(type); refreshViewForType(type);
};
function refreshViewForType(type) { 
    if(type==='cand' || type==='candidates') renderCandidateTable(); 
    else if(type==='emp' || type==='employees') renderEmployeeTable(); 
    else if(type==='onb' || type==='onboarding') renderOnboardingTable(); 
    else if(type==='hub') renderHubTable(); 
    else if(type==='place' || type==='placements') renderPlacementTable(); 
}
function updateSelectButtons(type) { 
    let btn, countSpan; 
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); } 
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); } 
    else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); } 
    else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); } 
    else if(type === 'hub') { btn = document.getElementById('btn-delete-hub'); countSpan = document.getElementById('hub-selected-count'); } 
    if (!btn) return; 
    if (state.selection[type] && state.selection[type].size > 0 && state.userRole !== 'Employee') { btn.style.display = 'inline-flex'; btn.style.opacity = '1'; if(countSpan) countSpan.innerText = state.selection[type].size; } 
    else { btn.style.display = 'none'; if(countSpan) countSpan.innerText = '0'; } 
}

window.openDeleteModal = (type) => { state.pendingDelete.type = type; document.getElementById('delete-modal').style.display = 'flex'; document.getElementById('del-count').innerText = state.selection[type].size; }; 
window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };

window.executeDelete = async () => {
    const type = state.pendingDelete.type; closeDeleteModal(); if(!type) return; 
    let col = (type==='cand') ? 'candidates' : (type==='hub' ? 'candidates' : (type==='place' ? 'placements' : (type==='emp'?'employees':'onboarding')));
    const ids = Array.from(state.selection[type]);
    state.selection[type].clear(); updateSelectButtons(type);
    const masterBox = document.getElementById(`select-all-${type}`); if(masterBox) masterBox.checked = false;
    refreshViewForType(type);
    const batch = db.batch(); ids.forEach(id => batch.delete(db.collection(col).doc(id)));
    try { await batch.commit(); showToast("Deleted successfully"); } catch(e) { console.error("Background deletion error:", e); showToast("Delete Failed: " + e.message); }
};

window.moveToPlacements = async (id) => {
    const cand = state.candidates.find(c => c.id === id); if(!cand) return;
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show');
    document.querySelector(`tr[data-id="${id}"]`)?.remove(); 
    try { 
        const batch = db.batch(); 
        const newPlaceData = { ...cand, status: 'Placed', assigned: new Date().toISOString().split('T')[0] }; 
        batch.set(db.collection('placements').doc(id), newPlaceData); 
        batch.delete(db.collection('candidates').doc(id)); 
        await batch.commit(); showToast("Moved to Placements"); 
    } catch(e) { console.error("Error moving to placements:", e); showToast("Move failed"); }
};

window.deletePlacement = async (id) => { if(confirm("Remove this placement?")) { await db.collection('placements').doc(id).delete(); showToast("Placement removed"); } };

/* ==========================================================================
   16. GMAIL & BACKGROUND SYNC ENGINE
   ========================================================================== */
function loadGoogleScripts() { 
    const s1 = document.createElement('script'); s1.src = "https://apis.google.com/js/api.js"; 
    s1.onload = () => gapi.load('client', async () => { 
        try { await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] }); state.gmail.gapiInited = true; checkGmailAuth(); } 
        catch(e) { console.error(e); } 
    }); 
    document.body.appendChild(s1); 
    const s2 = document.createElement('script'); s2.src = "https://accounts.google.com/gsi/client"; 
    s2.onload = () => { 
        state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({ 
            client_id: G_CLIENT_ID, scope: G_SCOPES, callback: (resp) => { if(resp.error) return; updateGmailUI(true); renderGmailList('INBOX'); fetchGmailLabels(); startMailboxSync(); } 
        }); 
        state.gmail.gisInited = true; checkGmailAuth(); 
    }; 
    document.body.appendChild(s2); 
}

function checkGmailAuth() { 
    if (state.gmail.gapiInited && state.gmail.gisInited && gapi.client.getToken()) { updateGmailUI(true); fetchGmailLabels(); startMailboxSync(); setInterval(startMailboxSync, 5 * 60 * 1000); } 
}
function updateGmailUI(isSignedIn) { 
    const btnAuth = document.getElementById('btn-gmail-auth'); const btnSignout = document.getElementById('btn-gmail-signout'); 
    if(btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'inline-flex'; if(btnSignout) btnSignout.style.display = isSignedIn ? 'inline-flex' : 'none'; 
}

if(document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => state.gmail.tokenClient.requestAccessToken({prompt: ''});
if(document.getElementById('btn-gmail-signout')) document.getElementById('btn-gmail-signout').onclick = () => { 
    const t = gapi.client.getToken(); if(t) google.accounts.oauth2.revoke(t.access_token); gapi.client.setToken(''); updateGmailUI(false); document.getElementById('gmail-rows-container').innerHTML = ''; 
};

function getHeader(headers, name) { const header = headers.find(h => h.name === name); return header ? header.value : ''; }
function parseMessageBody(payload) { 
    let bodyText = ''; let bodyHtml = ''; let attachments = []; 
    if (payload.body && payload.body.data) { 
        const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/')); 
        if (payload.mimeType === 'text/html') bodyHtml = decoded; else bodyText = decoded; 
    } 
    if (payload.parts) { 
        payload.parts.forEach(part => { 
            if (part.filename && part.filename.length > 0) { attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId }); } 
            else { const result = parseMessageBody(part); bodyText += result.text; bodyHtml += result.html; attachments = [...attachments, ...result.attachments]; } 
        }); 
    } 
    return { text: bodyText, html: bodyHtml, attachments: attachments }; 
}

async function startMailboxSync() { 
    if (!state.user) return; 
    const metadataRef = db.collection('sync_metadata').doc(state.user.uid); const metaDoc = await metadataRef.get(); 
    if (!metaDoc.exists || !metaDoc.data().historyId) { await runFullSync(null); } else { const lastHistoryId = metaDoc.data().historyId; await runIncrementalSync(lastHistoryId); } 
}
async function runFullSync(pageToken) { 
    try { 
        const res = await gapi.client.gmail.users.messages.list({ 'userId': 'me', 'maxResults': 20, 'pageToken': pageToken }); 
        const messages = res.result.messages; 
        if (messages && messages.length > 0) { 
            await processMessageBatch(messages); 
            if (!pageToken) { const firstMsgDetails = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': messages[0].id }); await db.collection('sync_metadata').doc(state.user.uid).set({ historyId: firstMsgDetails.result.historyId }, { merge: true }); } 
        } 
    } catch (e) { console.error("Full Sync Error:", e); } 
}
async function runIncrementalSync(historyId) { 
    try { 
        const res = await gapi.client.gmail.users.history.list({ 'userId': 'me', 'startHistoryId': historyId }); const history = res.result.history; 
        if (!history || history.length === 0) return; let newMsgIds = []; 
        history.forEach(record => { if (record.messagesAdded) { record.messagesAdded.forEach(m => newMsgIds.push(m.message)); } }); 
        if (newMsgIds.length > 0) { await processMessageBatch(newMsgIds); await db.collection('sync_metadata').doc(state.user.uid).set({ historyId: res.result.historyId }, { merge: true }); } 
    } catch (e) { if (e.status === 404) { await runFullSync(null); } } 
}

async function processMessageBatch(messages) { 
    const promises = messages.map(async (msgStub) => { 
        try { 
            const docRef = db.collection('emails').doc(msgStub.id); const docSnap = await docRef.get(); if (docSnap.exists) return; 
            const res = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msgStub.id, 'format': 'full' }); const msg = res.result; const payload = msg.payload; const headers = payload.headers; const parsedBody = parseMessageBody(payload); 
            const emailData = { id: msg.id, threadId: msg.threadId, historyId: msg.historyId, labelIds: msg.labelIds || [], snippet: msg.snippet, internalDate: parseInt(msg.internalDate), from: getHeader(headers, 'From'), to: getHeader(headers, 'To'), cc: getHeader(headers, 'Cc'), bcc: getHeader(headers, 'Bcc'), subject: getHeader(headers, 'Subject'), bodyText: parsedBody.text, bodyHtml: parsedBody.html, attachments: parsedBody.attachments, isRead: !msg.labelIds.includes('UNREAD'), importedAt: Date.now(), ownerUid: state.user.uid }; 
            await docRef.set(emailData); 
        } catch (err) {} 
    }); 
    await Promise.all(promises); 
}

window.fetchGmailLabels = async () => { 
    if (!gapi.client.getToken()) return; 
    try { 
        const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' }); 
        const allLabels = response.result.labels; const userLabels = allLabels.filter(l => l.type === 'user'); 
        const fetchedLabels = userLabels.map(l => ({ name: l.name, id: l.id, color: (l.color && l.color.backgroundColor) ? l.color.backgroundColor : '#607d8b', type: 'api' })); 
        if (fetchedLabels.length > 0) state.labels = fetchedLabels; 
        renderLabels(); 
    } catch (e) { console.error(e); } 
};
window.renderLabels = () => { 
    const container = document.getElementById('dynamic-labels-container'); if(!container) return; 
    container.innerHTML = ""; if(document.getElementById('manage-indicator')) document.getElementById('manage-indicator').style.display = 'none'; 
    state.labels.forEach((l, index) => { 
        const div = document.createElement('div'); div.className = 'label-item'; 
        const isSub = l.name.includes('/'); const displayName = isSub ? l.name.split('/').pop() : l.name; const indent = isSub ? 'padding-left: 20px;' : ''; 
        div.innerHTML = `<div class="label-left" style="${indent}" onclick="renderGmailList('${l.id || l.name}')"><span class="material-icons" style="color: ${l.color}; font-size:16px;">label</span><span id="label-text-${index}" class="label-text" title="${l.name}">${displayName}</span></div><div class="label-more-btn" id="btn-more-${index}" onclick="event.stopPropagation(); toggleLabelMenu(${index})"><span class="material-icons" style="font-size: 16px;">more_horiz</span></div><div id="label-menu-${index}" class="label-dropdown" onclick="event.stopPropagation()"><div style="font-size: 10px; color: grey; padding-left: 8px;">LABEL COLOR</div><div class="label-color-grid"><div class="color-swatch" style="background:#e91e63" onclick="updateLabelColor(${index}, '#e91e63')"></div><div class="color-swatch" style="background:#9c27b0" onclick="updateLabelColor(${index}, '#9c27b0')"></div><div class="color-swatch" style="background:#2196f3" onclick="updateLabelColor(${index}, '#2196f3')"></div><div class="color-swatch" style="background:#00bcd4" onclick="updateLabelColor(${index}, '#00bcd4')"></div><div class="color-swatch" style="background:#4caf50" onclick="updateLabelColor(${index}, '#4caf50')"></div><div class="color-swatch" style="background:#ff9800" onclick="updateLabelColor(${index}, '#ff9800')"></div><div class="color-swatch" style="background:#f44336" onclick="updateLabelColor(${index}, '#f44336')"></div><div class="color-swatch" style="background:#607d8b" onclick="updateLabelColor(${index}, '#607d8b')"></div><label class="color-swatch custom-add" title="Custom Color"><input type="color" style="opacity:0; width:100%; height:100%; cursor:pointer;" onchange="updateLabelColor(${index}, this.value)"><i class="fa-solid fa-plus"></i></label></div><div class="label-menu-item" onclick="triggerLabelEdit(${index})"><i class="fa-solid fa-pen"></i> Edit Name</div><div class="label-menu-item" onclick="triggerSubLabel(${index})"><i class="fa-solid fa-code-branch"></i> Add Sub-label</div><div class="label-menu-item danger" onclick="deleteLabel(${index})"><i class="fa-solid fa-trash"></i> Remove Label</div></div>`; 
        container.appendChild(div); 
    }); 
};
window.toggleLabelMenu = (index) => { 
    document.querySelectorAll('.label-dropdown').forEach(el => el.classList.remove('show')); document.querySelectorAll('.label-more-btn').forEach(el => el.classList.remove('active')); 
    const menu = document.getElementById(`label-menu-${index}`); const btn = document.getElementById(`btn-more-${index}`); 
    if(menu) { menu.classList.toggle('show'); if(menu.classList.contains('show')) btn.classList.add('active'); } 
    const closeFn = (e) => { if(!e.target.closest('.label-item')) { if(menu) menu.classList.remove('show'); if(btn) btn.classList.remove('active'); document.removeEventListener('click', closeFn); } }; 
    setTimeout(() => document.addEventListener('click', closeFn), 0); 
};
window.updateLabelColor = (index, color) => { state.labels[index].color = color; renderLabels(); };
window.triggerLabelEdit = (index) => { const textSpan = document.getElementById(`label-text-${index}`); const currentName = state.labels[index].name; document.getElementById(`label-menu-${index}`).classList.remove('show'); textSpan.innerHTML = `<input type="text" id="edit-input-${index}" class="label-edit-input" value="${currentName}">`; const input = document.getElementById(`edit-input-${index}`); input.focus(); const save = () => { const newName = input.value.trim(); if(newName && newName !== currentName) { state.labels[index].name = newName; showToast("Label renamed"); } renderLabels(); }; input.addEventListener('keydown', (e) => { if(e.key === 'Enter') save(); }); input.addEventListener('blur', save); input.onclick = (e) => e.stopPropagation(); };
window.triggerSubLabel = (index) => { const parentName = state.labels[index].name; const subName = prompt(`Create sub-label under "${parentName}":`); if(subName && subName.trim()) { const fullName = `${parentName}/${subName.trim()}`; if (state.labels.some(l => l.name.toLowerCase() === fullName.toLowerCase())) { alert("Label exists!"); return; } state.labels.push({ name: fullName, color: state.labels[index].color }); state.labels.sort((a, b) => a.name.localeCompare(b.name)); renderLabels(); document.getElementById(`label-menu-${index}`).classList.remove('show'); } };
window.deleteLabel = (index) => { const label = state.labels[index]; if(confirm(`Delete "${label.name}"?`)) { state.labels = state.labels.filter(l => !l.name.startsWith(label.name)); renderLabels(); } };
window.openCreateLabelModal = () => { document.getElementById('create-label-modal').style.display = 'flex'; document.getElementById('new-label-name').focus(); }; 
window.closeCreateLabelModal = () => { document.getElementById('create-label-modal').style.display = 'none'; }; 
window.createLabel = () => { const name = document.getElementById('new-label-name').value.trim(); if (!name) return; state.labels.push({ name: name, color: state.selectedLabelColor }); renderLabels(); closeCreateLabelModal(); }; 
window.selectColor = (element, color) => { state.selectedLabelColor = color; document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('selected')); element.classList.add('selected'); };

window.renderGmailList = async (label = 'Inbox', navElement = null) => { 
    const labelMap = { 'Inbox': 'INBOX', 'Sent': 'SENT', 'Drafts': 'DRAFT', 'Trash': 'TRASH', 'Spam': 'SPAM', 'Starred': 'STARRED', 'Important': 'IMPORTANT', 'Social': 'CATEGORY_SOCIAL', 'Updates': 'CATEGORY_UPDATES', 'Promotions': 'CATEGORY_PROMOTIONS' }; 
    const apiLabelId = labelMap[label] || label; state.gmail.currentLabel = apiLabelId; 
    document.getElementById('gmail-list-view').style.display = 'flex'; document.getElementById('gmail-detail-view').style.display = 'none'; 
    const container = document.getElementById('gmail-rows-container'); 
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px; color:var(--primary);"></i><br>Loading emails...</div>'; 

    if (!gapi.client.getToken()) { container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);"><i class="fa-brands fa-google" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i><p>Not connected to Gmail. Please click <b>Login</b> in the sidebar menu.</p></div>`; return; } 
    
    try { 
        let request = { 'userId': 'me', 'maxResults': 20 }; const qInput = document.getElementById('gmail-search-input'); 
        if (qInput && qInput.value && document.activeElement === qInput) request.q = qInput.value; else request.labelIds = [apiLabelId]; 
        const resp = await gapi.client.gmail.users.messages.list(request); const messages = resp.result.messages; 
        if (!messages || messages.length === 0) { container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);"><i class="fa-regular fa-envelope-open" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i><p>No emails found in this folder.</p></div>`; return; } 
        container.innerHTML = ''; 
        const batch = messages.map(msg => gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msg.id, 'format': 'metadata', 'metadataHeaders': ['From', 'Subject', 'Date'] })); 
        const results = await Promise.all(batch); 
        results.forEach(r => { 
            const email = r.result; const headers = email.payload.headers; const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)'; 
            const fromRaw = headers.find(h => h.name === 'From')?.value || 'Unknown'; const fromName = fromRaw.replace(/[<>]/g, '').split(' ')[0]; 
            const dateObj = new Date(Number(email.internalDate)); const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const snippet = email.snippet ? email.snippet.replace(/&quot;/g, '"').replace(/&#39;/g, "'") : ''; const isUnread = email.labelIds.includes('UNREAD'); 
            const div = document.createElement('div'); div.className = `gmail-row ${isUnread ? 'unread' : 'read'}`; div.onclick = () => openGmailDetail(email.id); 
            div.innerHTML = `<div onclick="event.stopPropagation()"><input type="checkbox" class="gmail-checkbox"></div><div><span class="material-icons star-icon">star_border</span></div><div class="row-sender">${fromName}</div><div class="row-subject">${subject} <span style="color:var(--text-muted); margin-left:5px; font-weight:normal;"> - ${snippet.substring(0, 60)}...</span></div><div class="email-date" style="text-align: right; font-size: 0.8rem; opacity: 0.8;">${dateStr}</div>`; container.appendChild(div); 
        }); 
    } catch (err) { console.error("Gmail Error:", err); container.innerHTML = `<div style="padding:40px; text-align:center; color: var(--danger);"><i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 10px;"></i><p>Error loading emails. Please try refreshing or logging in again.</p></div>`; } 
};

window.openGmailDetail = async (id) => { 
    state.gmail.currentEmailId = id; 
    document.getElementById('gmail-list-view').style.display = 'none'; document.getElementById('gmail-detail-view').style.display = 'flex'; document.getElementById('detail-message').innerHTML = 'Loading content...'; 
    try { 
        const resp = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': id, 'format': 'full' }); const email = resp.result; const headers = email.payload.headers; 
        document.getElementById('detail-subject').innerText = headers.find(h => h.name === 'Subject')?.value || ''; document.getElementById('detail-sender').innerText = headers.find(h => h.name === 'From')?.value || ''; document.getElementById('detail-date').innerText = new Date(Number(email.internalDate)).toLocaleString(); 
        let body = ""; const findBody = (parts) => { if(!parts) return null; let htmlPart = parts.find(p => p.mimeType === 'text/html'); if(htmlPart) return htmlPart.body.data; let textPart = parts.find(p => p.mimeType === 'text/plain'); if(textPart) return textPart.body.data; for(let part of parts) { if(part.parts) { const res = findBody(part.parts); if(res) return res; } } return null; } ; 
        body = email.payload.body.data ? email.payload.body.data : findBody(email.payload.parts); 
        if(body) { const decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/')); document.getElementById('detail-message').innerHTML = decoded; } else { document.getElementById('detail-message').innerHTML = "<i>[Message body empty]</i>"; } 
    } catch (err) { document.getElementById('detail-message').innerText = "Error loading content."; } 
};

window.backToGmailList = () => { document.getElementById('gmail-detail-view').style.display = 'none'; document.getElementById('gmail-list-view').style.display = 'flex'; }; 
window.refreshEmails = () => renderGmailList(state.gmail.currentLabel); 
window.handleGmailSearch = (q) => { }; 
window.syncCurrentEmailToCandidate = async () => { 
    if(!state.gmail.currentEmailId) return; 
    const senderText = document.getElementById('detail-sender').innerText; const subject = document.getElementById('detail-subject').innerText; 
    const candidateName = prompt("Enter Candidate FIRST NAME to sync this email to:", ""); if(!candidateName) return; 
    const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase()); if(!candidate) return showToast("Candidate not found."); 
    let logs = candidate.submissionLog || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: subject, type: 'Imported Email', tech: candidate.tech || 'General', recruiter: state.currentUserName, note: `Imported from: ${senderText}`, timestamp: Date.now() }); 
    await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs }); showToast(`Synced to ${candidate.first} ${candidate.last}`); 
};

window.toggleCategories = () => { const sub = document.getElementById('categories-submenu'); if (sub.style.display === 'none') sub.style.display = 'block'; else sub.style.display = 'none'; }; 
window.toggleMore = () => { const sub = document.getElementById('more-submenu'); if (sub.style.display === 'none') sub.style.display = 'block'; else sub.style.display = 'none'; };

function createMimeMessage(to, subject, body) { const email = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", body].join("\n"); return btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); } 
window.openComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'flex'; }; 
window.closeComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'none'; }; 
window.sendCrmEmail = async () => { 
    const to = document.getElementById('compose-to').value.trim(); const subject = document.getElementById('compose-subject').value; const body = document.getElementById('compose-message').value; 
    if(!to || !subject) return showToast("Recipient and Subject required"); 
    const sendBtn = document.querySelector('.compose-footer .btn-primary'); const originalText = sendBtn.innerHTML; sendBtn.innerHTML = 'Sending...'; sendBtn.disabled = true; 
    try { 
        if (!state.gmail.gapiInited || !gapi.client.getToken()) throw new Error("Gmail not connected."); 
        const raw = createMimeMessage(to, subject, body.replace(/\n/g, '<br>')); 
        await gapi.client.gmail.users.messages.send({ 'userId': 'me', 'resource': { 'raw': raw } }); 
        showToast("Email Sent!"); closeComposeModal(); 
        const candidate = state.candidates.find(c => (c.gmail && c.gmail.includes(to)) || (c.email && c.email.includes(to))); 
        if(candidate) { let logs = candidate.submissionLog || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: subject, type: 'Outbound Email', tech: candidate.tech||'General', recruiter: state.currentUserName, timestamp: Date.now() }); await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs }); showToast("Logged to Hub"); } 
        document.getElementById('compose-to').value = ''; document.getElementById('compose-subject').value = ''; document.getElementById('compose-message').value = ''; 
    } catch (err) { showToast("Send Failed: " + err.message); } finally { sendBtn.innerHTML = originalText; sendBtn.disabled = false; } 
};

/* ==========================================================================
   17. DASHBOARD VISUALIZATIONS & TIMERS
   ========================================================================== */
function updateDashboardStats() { 
    let calcData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) calcData = calcData.filter(c => c.recruiter === state.currentUserName);

    const total = calcData.length;
    const active = calcData.filter(c => c.status === 'Active').length;
    const inactive = calcData.filter(c => c.status === 'Inactive').length;
    const placed = state.placements.length;
    const techs = new Set(calcData.map(c=>c.tech)).size;
    const recruiters = state.metadata.recruiters.length;

    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if(document.getElementById('stat-active-count')) document.getElementById('stat-active-count').innerText = active;
    if(document.getElementById('stat-inactive-count')) document.getElementById('stat-inactive-count').innerText = inactive;
    if(document.getElementById('stat-placed')) document.getElementById('stat-placed').innerText = placed;
    if(document.getElementById('stat-tech')) document.getElementById('stat-tech').innerText = techs;
    if(document.getElementById('stat-rec')) document.getElementById('stat-rec').innerText = recruiters;
    if(document.getElementById('current-date-display')) document.getElementById('current-date-display').innerText = new Date().toLocaleDateString();

    const techData = getChartData(calcData, 'tech');
    const recData = getChartData(calcData, 'recruiter');
    renderChart('chart-recruiter', recData, 'bar'); 
    renderChart('chart-tech', techData, 'doughnut');
}

function getChartData(data, key) { const counts = {}; data.forEach(c => {if(c[key]) counts[c[key]] = (counts[c[key]] || 0) + 1;}); return { labels: Object.keys(counts), data: Object.values(counts) }; }

let chartInstances = {}; 
function renderChart(id, data, type) { 
    const ctx = document.getElementById(id); if(!ctx) return; 
    if(ctx.clientHeight === 0) ctx.style.height = '250px';
    const context = ctx.getContext('2d');
    if(chartInstances[id]) chartInstances[id].destroy(); 
    const colors = ['#06b6d4', '#f59e0b', '#8b5cf6', '#22c55e', '#ef4444', '#ec4899', '#6366f1'];
    chartInstances[id] = new Chart(context, { type: type, data: { labels: data.labels, datasets: [{ label: 'Candidates', data: data.data, backgroundColor: colors, borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderRadius: 4, barThickness: 20 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === 'doughnut', position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { y: { display: type === 'bar', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { display: type === 'bar', grid: { display: false }, ticks: { color: '#94a3b8' } } } } }); 
}

window.checkBirthdays = () => {
    const today = new Date(); const currentMonth = String(today.getMonth() + 1).padStart(2, '0'); const currentDay = String(today.getDate()).padStart(2, '0'); const todayMatch = `${currentMonth}-${currentDay}`;
    if(!state.allUsers) return;
    const birthdayPeople = state.allUsers.filter(user => { if (!user.dob) return false; return user.dob.substring(5) === todayMatch; });
    const card = document.getElementById('birthday-card'); const content = document.getElementById('bday-names');
    if (!card || !content) return;
    if (window.birthdayTimer) clearTimeout(window.birthdayTimer);
    if (birthdayPeople.length > 0) { const names = birthdayPeople.map(u => u.name).join(', '); content.innerText = names; card.style.display = 'flex'; card.classList.add('active'); window.birthdayTimer = setTimeout(() => { card.classList.remove('active'); setTimeout(() => { card.style.display = 'none'; }, 500); }, 7000); } 
    else { card.classList.remove('active'); card.style.display = 'none'; }
};

let inactivityTimer;
function startAutoLogoutTimer() {
    const TIMEOUT_DURATION = 10 * 60 * 1000; 
    function resetTimer() {
        if (!firebase.auth().currentUser) return; 
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => { firebase.auth().signOut().then(() => { showToast("Session expired due to inactivity"); switchScreen('auth'); }); }, TIMEOUT_DURATION);
    }
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => { document.addEventListener(event, resetTimer); });
    resetTimer();
}
function stopAutoLogoutTimer() { clearTimeout(inactivityTimer); }

/* ==========================================================================
   18. MISC EVENT LISTENERS
   ========================================================================== */
function setupEventListeners() {
    document.getElementById('btn-logout')?.addEventListener('click', () => auth.signOut());
    document.getElementById('theme-toggle')?.addEventListener('click', () => { document.body.classList.toggle('light-mode'); localStorage.setItem('np_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); });
    
    document.getElementById('search-input')?.addEventListener('input', e => { state.filters.text = e.target.value.toLowerCase(); renderCandidateTable(); });
    document.getElementById('filter-recruiter')?.addEventListener('change', e => { state.filters.recruiter = e.target.value; renderCandidateTable(); });
    document.getElementById('filter-tech')?.addEventListener('change', e => { state.filters.tech = e.target.value; renderCandidateTable(); });
    
    document.querySelectorAll('.btn-toggle').forEach(btn => { 
        btn.addEventListener('click', e => { document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); state.filters.status = e.target.dataset.status; renderCandidateTable(); }); 
    });
    
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => { 
        document.getElementById('search-input').value = ''; document.getElementById('filter-recruiter').value = ''; document.getElementById('filter-tech').value = ''; 
        document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); document.querySelector('.btn-toggle[data-status=""]').classList.add('active'); 
        state.filters = { text: '', recruiter: '', tech: '', status: '' }; renderCandidateTable(); showToast("Filters refreshed"); 
    });

    document.getElementById('hub-search-input')?.addEventListener('input', e => { state.hubFilters.text = e.target.value.toLowerCase(); renderHubTable(); });
    document.getElementById('hub-filter-recruiter')?.addEventListener('change', e => { state.hubFilters.recruiter = e.target.value; renderHubTable(); });
    document.getElementById('onb-search-input')?.addEventListener('input', e => { state.onbFilters.text = e.target.value.toLowerCase(); renderOnboardingTable(); });
    document.getElementById('emp-search-input')?.addEventListener('input', e => { state.empFilters.text = e.target.value.toLowerCase(); renderEmployeeTable(); });

    const mobileBtn = document.getElementById('btn-mobile-menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(mobileBtn) { mobileBtn.addEventListener('click', () => { sidebar.classList.toggle('mobile-open'); overlay.classList.toggle('active'); }); }
    if(overlay) { overlay.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('active'); }); }
}

document.addEventListener('DOMContentLoaded', init);
