/* ==========================================================================
   DYNAMIC CSS STYLES (Hover icons & Hub cell buttons)
   ========================================================================== */
function injectGlobalStyles() {
    if (document.getElementById('crm-dynamic-styles')) return;
    const style = document.createElement('style');
    style.id = 'crm-dynamic-styles';
    style.innerHTML = `
        /* Hide the delete icon by default */
        .header-hover-group .col-delete-icon {
            opacity: 0 !important;
            visibility: hidden;
            transition: all 0.2s ease;
        }
        /* Show the delete icon when hovering over the column header */
        .header-hover-group:hover .col-delete-icon {
            opacity: 0.5 !important;
            visibility: visible;
        }
        /* Make the icon fully opaque and red when hovering directly over the icon itself */
        .header-hover-group .col-delete-icon:hover {
            opacity: 1 !important;
            color: #ef4444 !important; 
        }

        /* --- HUB CELL ADD ICONS --- */
        .hub-stat-cell {
            position: relative;
        }
        .hub-stat-cell .hub-add-icon {
            position: absolute; 
            right: 8px; 
            top: 50%; 
            transform: translateY(-50%);
            opacity: 0; 
            transition: opacity 0.2s, transform 0.2s; 
            font-size: 0.9rem; 
            cursor: pointer;
            padding: 4px;
        }
        .hub-stat-cell:hover .hub-add-icon {
            opacity: 0.5;
        }
        .hub-stat-cell .hub-add-icon:hover {
            opacity: 1;
            transform: translateY(-50%) scale(1.2);
        }
    `;
    document.head.appendChild(style);
}

/* ==========================================================================
   1. FIREBASE CONFIG & GMAIL API CONFIG
   ========================================================================== */
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDTX7cHfS8sQEREb2qwOR50YuZsdsPhr40",
    authDomain: "nilegroup-crm-448c4.firebaseapp.com",
    projectId: "nilegroup-crm-448c4",
    storageBucket: "nilegroup-crm-448c4.firebasestorage.app",
    messagingSenderId: "96773475717",
    appId: "1:96773475717:web:79b2537606b9dc524488ec"
};

// Gmail API configuration
const G_API_KEY = "AIzaSyDTX7cHfS8sQEREb2qwOR50YuZsdsPhr40";
const G_CLIENT_ID = "96773475717-dg0pdp2ujbts89n3dltkkpub2qaevlmf.apps.googleusercontent.com";
const G_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels";
const G_DISCOVERY_DOC = "https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest";

// Initialize Firebase
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Set auth persistence to LOCAL so users stay logged in across devices/sessions
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.error("Auth persistence error:", e));

/* ==========================================================================
   2. ACCESS CONTROL LIST (Fallback)
   ========================================================================== */
const ALLOWED_USERS = {
    'ali@nileprise.com': { name: 'Asif', role: 'Employee' },
    'mdi@nileprise.com': { name: 'Ikram', role: 'Employee' },
    'mmr@nileprise.com': { name: 'Manikanta', role: 'Employee' },
    'vaj@nileprise.com': { name: 'Ajay', role: 'Employee' },
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
    userPermissions: { read: true, edit: true, insert: true, delete: true },
    candidates: [], 
    onboarding: [],
    employees: [],
    placements: [],
    allUsers: [],
    accessUsers: [],
    notifications: [],
    acFilters: { text: '', role: '', status: '' },
    acSort: { key: 'name', dir: 'asc' },
    acPage: { index: 1, size: 25 },
    hubData: [],
    labels: [],
    selectedLabelColor: '#e91e63',
    
    gmail: {
        tokenClient: null,
        gapiInited: false,
        gisInited: false,
        nextPageToken: null,
        currentLabel: 'INBOX',
        currentEmailId: null,
        _scriptsLoading: false,
        _syncTimer: null
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
    onboardingStatuses: ['Onboarding', 'Completed'],
    
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    modal: { id: null, type: null },
    pendingDelete: { type: null },
    
    alignments: { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {}, accessControl: {} },
    colOrders: { candidates: [], employees: [], onboarding: [], placements: [], hub: [], accessControl: [] },
    hiddenColumns: { candidates: [], employees: [], onboarding: [], placements: [], hub: [], accessControl: [] },
    customColumns: { candidates: [], employees: [], onboarding: [], placements: [], hub: [], accessControl: [] },
    
    metadata: {
        recruiters: [],
        techs: []
    }
};

const historyState = { undo: [], redo: [], max: 50, applying: false };

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
        placements: document.getElementById('view-placements'),
        accessControl: document.getElementById('view-access-control'),
        notifications: document.getElementById('view-notifications')
    },
    headerUpdated: document.getElementById('header-updated'),
    gmail: {
        list: document.getElementById('gmail-rows-container'),
        searchInput: document.getElementById('gmail-search-input')
    }
};

/* ==========================================================================
   DATE & HUB MERGE HELPERS
   ========================================================================== */
function getLocalDateString() {
    const d = new Date();
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getMergedHubData() {
    let candData = getRoleFilteredData(state.candidates, 'candidates') || [];
    let hubDataArr = getRoleFilteredData(state.hubData, 'hub') || [];
    let mergedMap = new Map();

    candData.forEach(c => mergedMap.set(c.id, { ...c, isHubOnly: false }));
    hubDataArr.forEach(h => {
        if (mergedMap.has(h.id)) {
            mergedMap.set(h.id, { ...mergedMap.get(h.id), ...h, isHubOnly: false });
        } else {
            mergedMap.set(h.id, { ...h, isHubOnly: true });
        }
    });
    return Array.from(mergedMap.values());
}

/* ==========================================================================
   5. INITIALIZATION & UTILITIES
   ========================================================================== */
function init() {
    injectGlobalStyles(); 
    setupEventListeners();
    loadGoogleScripts();
    
    db.collection('settings').doc('table_config').get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            if(data.colOrders) state.colOrders = data.colOrders;
            if(data.hiddenColumns) state.hiddenColumns = { ...state.hiddenColumns, ...data.hiddenColumns };
            if(data.alignments) state.alignments = { ...state.alignments, ...data.alignments };
            if(data.candidates) state.customColumns.candidates = data.candidates;
            if(data.employees) state.customColumns.employees = data.employees;
            if(data.onboarding) state.customColumns.onboarding = data.onboarding;
            if(data.placements) state.customColumns.placements = data.placements;
            if(data.hub) state.customColumns.hub = data.hub;
            if(data.accessControl) state.customColumns.accessControl = data.accessControl;
        }
    });

    auth.onAuthStateChanged(async user => {
        if (user) {
            if (!user.emailVerified) { 
                document.getElementById('verify-email-display').innerText = user.email; 
                switchScreen('verify'); return; 
            }
            state.user = user;
            const email = user.email.toLowerCase();
            
            try {
                const userDoc = await db.collection('users').doc(email).get();
                if (userDoc.exists) {
                    state.userRole = userDoc.data().role || 'Employee';
                    state.currentUserName = userDoc.data().firstName || user.displayName || 'Unknown';
                    const perms = userDoc.data().permissions;
                    if (perms) {
                        state.userPermissions = {
                            read: perms.read !== false,
                            edit: perms.edit !== false,
                            insert: perms.insert !== false,
                            delete: perms.delete !== false
                        };
                    } else {
                        const isPrivileged = state.userRole === 'Admin' || state.userRole === 'Manager';
                        state.userPermissions = {
                            read: true,
                            edit: isPrivileged,
                            insert: isPrivileged,
                            delete: state.userRole === 'Admin'
                        };
                    }
                } else {
                    const knownUser = ALLOWED_USERS[email];
                    state.userRole = knownUser ? knownUser.role : 'Employee'; 
                    state.currentUserName = knownUser ? knownUser.name : (user.displayName || 'Unknown');
                    const isPrivileged = state.userRole === 'Admin' || state.userRole === 'Manager';
                    state.userPermissions = {
                        read: true,
                        edit: isPrivileged,
                        insert: isPrivileged,
                        delete: state.userRole === 'Admin'
                    };
                }
            } catch (err) { console.error("Error fetching role:", err); }
            
            updateUserProfile(user, ALLOWED_USERS[email]);
            switchScreen('app');
            initRealtimeListeners();
            applyPermissionUI();
            if(window.updateHubStats) updateHubStats('daily', getLocalDateString());
        } else {
            switchScreen('auth');
        }
    });

    if(localStorage.getItem('np_theme') === 'light') document.body.classList.add('light-mode');
    
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('np_theme', isLight ? 'light' : 'dark');
            const settingsCheckbox = document.getElementById('setting-theme-toggle');
            if(settingsCheckbox) settingsCheckbox.checked = !isLight;
        });
    }
    const settingsCheckbox = document.getElementById('setting-theme-toggle');
    if(settingsCheckbox) {
        settingsCheckbox.checked = localStorage.getItem('np_theme') !== 'light';
    }
    
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
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-pass').value; 
    if(!e || !p) { showToast("Please enter both email and password."); return; }
    
    const btn = document.getElementById('btn-login-action');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
    btn.disabled = true;

    auth.signInWithEmailAndPassword(e, p)
        .then(() => { btn.innerHTML = originalText; btn.disabled = false; })
        .catch(err => {
            showToast(err.message.replace('Firebase: ', ''));
            btn.innerHTML = originalText;
            btn.disabled = false;
        }); 
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
   7. REALTIME LISTENERS
   ========================================================================== */
function initRealtimeListeners() {
    db.collection('candidates').onSnapshot(snap => {
        state.candidates = []; 
        snap.forEach(doc => { state.candidates.push({ id: doc.id, ...doc.data() }); });
        state.candidates.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        const currentSelectedCount = state.selection.cand.size;
        renderCandidateTable(); 
        if (currentSelectedCount > 0) updateSelectButtons('cand');
        updateHubStats(); 
        buildDropdownMetadata(); 
        updateDashboardStats(); 
        renderDashboardCharts();
        const headerText = document.getElementById('header-updated');
        if(headerText) headerText.innerText = 'Synced';
    }, (error) => console.error("Candidate Listener Error:", error));
    
    db.collection('hub').onSnapshot(snap => {
        state.hubData = [];
        snap.forEach(doc => state.hubData.push({ id: doc.id, ...doc.data() }));
        state.hubData.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        updateHubStats(state.hub.filterType, state.hub.date);
    });

    // ========== SECURE EMPLOYEE FETCH ==========
    let empQuery = db.collection('employees');
    
    // Database-level restriction: Employees only fetch data matching their login email
    if (state.userRole === 'Employee' && state.user && state.user.email) {
        empQuery = empQuery.where('officialEmail', '==', state.user.email);
    }

    empQuery.onSnapshot(snap => {
        state.employees = []; 
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        
        state.employees.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        
        renderEmployeeTable(); 
        updateSelectButtons('emp');
        buildDropdownMetadata(); 
        updateDashboardStats();
    });

    db.collection('onboarding').onSnapshot(snap => { 
        state.onboarding = []; 
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() })); 
        state.onboarding.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        renderOnboardingTable(); 
        updateSelectButtons('onb');
    }, (error) => console.log("Onboarding access restricted"));

    db.collection('placements').onSnapshot(snap => {
        state.placements = []; 
        snap.forEach(doc => state.placements.push({ id: doc.id, ...doc.data() }));
        state.placements.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        renderPlacementTable(); 
        updateSelectButtons('place');
        updateDashboardStats();
        buildDropdownMetadata();
    }, (error) => console.log("Placement access restricted"));

    db.collection('users').onSnapshot(snap => {
        state.allUsers = [];
        state.accessUsers = [];
        snap.forEach(doc => {
            const data = doc.data() || {};
            const email = doc.id;
            const fullName = (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : (data.displayName || data.firstName || email || 'Staff Member');
            state.allUsers.push({ id: email, name: fullName, dob: data.dob });
            const role = data.role || (ALLOWED_USERS[email] ? ALLOWED_USERS[email].role : 'Employee');
            const isPrivileged = role === 'Admin' || role === 'Manager';
            const perms = data.permissions || { read: true, edit: isPrivileged, insert: isPrivileged, delete: role === 'Admin' };
            state.accessUsers.push({
                id: email, email, firstName: data.firstName || '', lastName: data.lastName || '', name: fullName, role, status: data.status || 'approved',
                permissions: { read: perms.read !== false, edit: !!perms.edit, insert: !!perms.insert, delete: !!perms.delete },
                photoURL: data.photoURL || '', createdAt: data.createdAt || 0
            });
        });
        checkBirthdays();
        renderAccessControlTable();
    }, (error) => console.log("Users access restricted", error));

    if (state.user && state.user.email) {
        const notifEmail = state.user.email.toLowerCase();
        const applyNotifSnap = (snap) => {
            state.notifications = [];
            snap.forEach(doc => state.notifications.push({ id: doc.id, ...doc.data() }));
            state.notifications.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            updateNotificationBadge();
            if (document.getElementById('view-notifications')?.classList.contains('active')) renderNotifications();
        };
        db.collection('notifications').where('userEmail', '==', notifEmail).orderBy('createdAt', 'desc').limit(50)
            .onSnapshot(applyNotifSnap, (err) => {
                db.collection('notifications').where('userEmail', '==', notifEmail).limit(50).onSnapshot(applyNotifSnap, (err2) => {});
            });
    }
    loadCustomColumns();
}

window.checkBirthdays = () => {
    const today = new Date();
    const todayMatch = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if(!state.allUsers) return;
    const birthdayPeople = state.allUsers.filter(user => { if (!user.dob) return false; return user.dob.substring(5) === todayMatch; });
    const card = document.getElementById('birthday-card'); const content = document.getElementById('bday-names');
    if (!card || !content) return;
    if (window.birthdayTimer) clearTimeout(window.birthdayTimer);
    if (birthdayPeople.length > 0) {
        content.innerText = birthdayPeople.map(u => u.name).join(', ');
        card.style.display = 'flex'; card.classList.add('active');
        window.birthdayTimer = setTimeout(() => { card.classList.remove('active'); setTimeout(() => { card.style.display = 'none'; }, 500); }, 7000); 
    } else {
        card.classList.remove('active'); card.style.display = 'none';
    }
};

function loadCustomColumns() { 
    db.collection('settings').doc('table_config').onSnapshot(doc => { 
        if(doc.exists) { 
            const data = doc.data(); 
            if(data.candidates) state.customColumns.candidates = data.candidates; 
            if(data.employees) state.customColumns.employees = data.employees; 
            if(data.onboarding) state.customColumns.onboarding = data.onboarding; 
            if(data.placements) state.customColumns.placements = data.placements; 
            if(data.accessControl) state.customColumns.accessControl = data.accessControl;
            if(data.hub) state.customColumns.hub = data.hub;
            if(data.colOrders) state.colOrders = data.colOrders;
            if(data.hiddenColumns) state.hiddenColumns = { ...state.hiddenColumns, ...data.hiddenColumns };
            if(data.alignments) state.alignments = { ...state.alignments, ...data.alignments };
            if(data.onboardingStatuses) state.onboardingStatuses = data.onboardingStatuses;
            renderCandidateTable(); renderEmployeeTable(); renderOnboardingTable(); renderPlacementTable(); renderHubTable(); 
            if (typeof renderAccessControlTable === 'function') renderAccessControlTable();
        } 
    }); 
}

function buildDropdownMetadata() {
    const techs = new Set(["React", "Node.js", "Java", "Python", ".NET", "AWS", "Azure", "DevOps", "Salesforce", "Data Science", "Angular", "Flutter", "Golang", "PHP"]);
    state.candidates.forEach(c => { if (c.tech) techs.add(c.tech.trim()); });
    state.placements.forEach(p => { if (p.tech) techs.add(p.tech.trim()); });
    state.metadata.techs = Array.from(techs).sort();

    const recruiters = new Set();
    
    // ONLY collect the first name from the employees table
    state.employees.forEach(e => { 
        if (e.first && e.first.trim()) {
            recruiters.add(e.first.trim()); 
        }
    });

    state.metadata.recruiters = Array.from(recruiters).map(r => ({ value: r, display: r })).sort((a, b) => a.value.localeCompare(b.value));
    renderDropdowns();
}

function renderDropdowns() { 
    ['filter-recruiter', 'filter-tech'].forEach(id => { 
        const el = document.getElementById(id); if(!el) return; 
        const currentVal = el.value; 
        let opts = id.includes('tech') ? state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('') : state.metadata.recruiters.map(r => `<option value="${r.value}">${r.display}</option>`).join(''); 
        el.innerHTML = `<option value="">${id.includes('tech')?"All Tech":"All Recruiters"}</option>${opts}`; 
        el.value = currentVal; 
    }); 
}

function dropdownMinWidth(labels, minPx = 140, maxPx = 280) { return Math.min(maxPx, Math.max(minPx, (labels || []).reduce((m, s) => Math.max(m, String(s || '').length), 8) * 8.5 + 36)); }

window.generateRecruiterDropdown = (currentVal, id, collection) => {
    // Clone the list so we can inject legacy values if needed without polluting the master list
    const list = [...(state.metadata.recruiters || [])]; 
    const labels = list.map(r => r.display || r.value); 
    
    // If a legacy name exists that isn't in the employee table anymore, inject it so the cell isn't blank
    if (currentVal) {
        labels.push(currentVal);
        if (!list.some(r => r.value === currentVal)) {
            list.push({ value: currentVal, display: currentVal });
        }
    }
    
    const options = list.map(r => `<option value="${r.value}" ${r.value === currentVal ? 'selected' : ''}>${r.display}</option>`).join('');
    return `<select class="status-select table-select-auto" style="width:100%; min-width:${dropdownMinWidth(labels, 160, 260)}px;" onchange="updateRecruiter('${id}', '${collection}', this.value)" onclick="event.stopPropagation()" ${!canEdit() ? 'disabled' : ''}><option value="" ${!currentVal ? 'selected' : ''}>Select Recruiter</option>${options}</select>`;
};

window.updateRecruiter = (id, collection, val) => {
    const oldVal = getOldValue(collection, id, 'recruiter'); pushToHistory(collection, id, 'recruiter', oldVal, val);
    db.collection(resolveDbCollection(collection, id)).doc(id).update({ recruiter: val }).then(() => showToast("Recruiter Auto-Saved"));
};
window.generateTechDropdown = (currentVal, id, collection) => {
    const list = state.metadata.techs || []; if (currentVal && !list.includes(currentVal)) list.push(currentVal); list.sort();
    const options = list.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join('');
    return `<select class="status-select table-select-auto" style="width:100%; min-width:${dropdownMinWidth(list, 150, 240)}px; color:var(--primary); font-weight:bold;" onchange="updateTech('${id}', '${collection}', this.value)" onclick="event.stopPropagation()" ${!canEdit() ? 'disabled' : ''}><option value="" ${!currentVal ? 'selected' : ''}>Select Tech</option>${options}</select>`;
};
window.updateTech = (id, collection, val) => {
    const oldVal = getOldValue(collection, id, 'tech'); pushToHistory(collection, id, 'tech', oldVal, val);
    db.collection(resolveDbCollection(collection, id)).doc(id).update({ tech: val }).then(() => showToast("Tech Auto-Saved"));
};

/* ==========================================================================
   ROLE-BASED PERMISSIONS
   ========================================================================== */
function hasPermission(perm) { return state.userPermissions && state.userPermissions[perm] === true; }
function canEdit() { return hasPermission('edit'); }
function canInsert() { return hasPermission('insert'); }
function canDelete() { return hasPermission('delete'); }

async function logActivity(action, collection, recordId, details) {
    try { await db.collection('activity_log').add({ action, collection, recordId: recordId || null, details: details || '', userEmail: state.user ? state.user.email : 'unknown', userName: state.currentUserName || 'Unknown', timestamp: firebase.firestore.FieldValue.serverTimestamp() }); } catch(e) {}
}

function applyPermissionUI() {
    document.querySelectorAll('.btn-insert').forEach(btn => btn.style.display = canInsert() ? '' : 'none');
    const addColBtn = document.getElementById('btn-add-column-confirm'); if (addColBtn) addColBtn.style.display = canInsert() ? '' : 'none';
    document.querySelectorAll('[id^="btn-delete-"]').forEach(btn => { if (!canDelete()) btn.style.display = 'none'; });
    const acNav = document.getElementById('nav-access-control'); if (acNav) acNav.style.display = (state.userRole === 'Admin') ? '' : 'none';
}

function getAccessLevelLabel(perms) {
    if (!perms) return 'Read Only';
    if (perms.read && perms.edit && perms.insert && perms.delete) return 'Full Access';
    if (perms.read && perms.edit && perms.insert) return 'Read + Edit + Insert';
    if (perms.read && perms.edit) return 'Read + Edit';
    if (perms.read && perms.insert) return 'Read + Insert';
    if (perms.read) return 'Read Only';
    return 'No Access';
}
function defaultPermsForRole(role) { const isPrivileged = role === 'Admin' || role === 'Manager'; return { read: true, edit: isPrivileged, insert: isPrivileged, delete: role === 'Admin' }; }

/* ==========================================================================
   ACCESS CONTROL
   ========================================================================== */
const AC_COL_STORAGE_BASE = 'np_ac_column_widths_v2';
const AC_COL_DEFAULTS = { tools: 44, index: 48, name: 180, email: 260, role: 130, access: 160, read: 70, edit: 70, insert_delete: 120, status: 110, actions: 120 };
const AC_COL_MIN = { tools: 40, index: 36, name: 80, email: 120, role: 90, access: 90, read: 48, edit: 48, insert_delete: 80, status: 80, actions: 80 };
const AC_COL_MAX = { tools: 60, index: 120, name: 900, email: 1000, role: 500, access: 600, read: 240, edit: 240, insert_delete: 400, status: 400, actions: 420 };
const AC_COL_ORDER = ['tools', 'index', 'name', 'email', 'role', 'access', 'read', 'edit', 'insert_delete', 'status', 'actions'];

let __acLiveWidths = null;
function getAcColumnStorageKey() { return state.user?.email ? `${AC_COL_STORAGE_BASE}:${state.user.email.toLowerCase().trim()}` : AC_COL_STORAGE_BASE; }

function loadAcColumnWidths() {
    if (__acLiveWidths) return { ...__acLiveWidths };
    try {
        let parsed = null;
        for (const key of [getAcColumnStorageKey(), AC_COL_STORAGE_BASE, 'np_ac_column_widths_v1']) {
            const raw = localStorage.getItem(key); if (!raw) continue;
            try { parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') break; } catch (_) {}
        }
        const widths = { ...AC_COL_DEFAULTS };
        if (parsed) AC_COL_ORDER.forEach(key => { const n = Number(parsed[key]); if (Number.isFinite(n) && n > 0) widths[key] = n; });
        __acLiveWidths = { ...widths }; return widths;
    } catch (_) { __acLiveWidths = { ...AC_COL_DEFAULTS }; return { ...AC_COL_DEFAULTS }; }
}
function saveAcColumnWidths(widths) {
    try {
        const payload = {}; AC_COL_ORDER.forEach(k => payload[k] = Number.isFinite(Number(widths?.[k])) ? Number(widths[k]) : AC_COL_DEFAULTS[k]);
        __acLiveWidths = { ...payload }; localStorage.setItem(getAcColumnStorageKey(), JSON.stringify(payload)); localStorage.setItem(AC_COL_STORAGE_BASE, JSON.stringify(payload));
    } catch (_) {}
}
function clampAcWidth(key, width) { return Math.max(AC_COL_MIN[key] ?? 40, Math.min(AC_COL_MAX[key] ?? 900, Math.round(width))); }
function getAcLiveColumnKeys() { const table = document.getElementById('access-control-table'); return table ? Array.from(table.querySelectorAll('thead th[data-col]')).map(th => th.dataset.col).filter(Boolean).length ? Array.from(table.querySelectorAll('thead th[data-col]')).map(th => th.dataset.col).filter(Boolean) : [...AC_COL_ORDER] : [...AC_COL_ORDER]; }
function getAcColIndex(key) { const idx = getAcLiveColumnKeys().indexOf(key); return idx >= 0 ? idx : AC_COL_ORDER.indexOf(key); }
function setAcElWidth(el, w) { if (el) { el.style.setProperty('width', w + 'px', 'important'); el.style.setProperty('min-width', w + 'px', 'important'); el.style.setProperty('max-width', w + 'px', 'important'); } }

function applyAcSingleColumnWidth(key, width) {
    const table = document.getElementById('access-control-table'); if (!table) return;
    const w = clampAcWidth(key, width); const idx = getAcColIndex(key); if (idx < 0) return;
    const col = table.querySelector(`#ac-colgroup col[data-col="${key}"]`); if (col) { col.style.setProperty('width', w + 'px', 'important'); col.style.setProperty('min-width', w + 'px', 'important'); }
    setAcElWidth(table.querySelector(`thead th[data-col="${key}"]`), w);
    const rows = table.tBodies[0] ? table.tBodies[0].rows : []; for (let r = 0; r < rows.length; r++) setAcElWidth(rows[r].cells[idx], w);
    if (!__acLiveWidths) __acLiveWidths = loadAcColumnWidths(); __acLiveWidths[key] = w;
    
    // --- Recalculate sticky offsets in real-time during resize ---
    let currentLeft = 0;
    getAcLiveColumnKeys().forEach((k, i) => {
        const currentW = Number(__acLiveWidths[k]) || AC_COL_DEFAULTS[k] || 140;
        if (i === 1) table.style.setProperty('--ac-col2-left', currentLeft + 'px');
        if (i === 2) table.style.setProperty('--ac-col3-left', currentLeft + 'px');
        currentLeft += currentW;
    });

    table.style.setProperty('width', currentLeft + 'px', 'important'); table.style.setProperty('min-width', currentLeft + 'px', 'important');
}

function applyAcColumnWidths(widths) {
    const table = document.getElementById('access-control-table'); if (!table) return;
    if (!widths) widths = loadAcColumnWidths();
    let total = 0;
    let leftOffset = 0; 
    
    getAcLiveColumnKeys().forEach((key, idx) => {
        const w = clampAcWidth(key, widths[key] ?? AC_COL_DEFAULTS[key] ?? 140); widths[key] = w; 
        
        // --- Set CSS variables for sticky positioning ---
        if (idx === 1) table.style.setProperty('--ac-col2-left', leftOffset + 'px');
        if (idx === 2) table.style.setProperty('--ac-col3-left', leftOffset + 'px');
        leftOffset += w;
        total += w;

        const col = table.querySelector(`#ac-colgroup col[data-col="${key}"]`); if (col) { col.style.setProperty('width', w + 'px', 'important'); col.style.setProperty('min-width', w + 'px', 'important'); }
        setAcElWidth(table.querySelector(`thead th[data-col="${key}"]`), w);
        const rows = table.tBodies[0] ? table.tBodies[0].rows : []; for (let r = 0; r < rows.length; r++) setAcElWidth(rows[r].cells[idx], w);
    });
    table.style.setProperty('width', total + 'px', 'important'); table.style.setProperty('min-width', total + 'px', 'important'); __acLiveWidths = { ...widths };
}

window.setAcStatusFilter = (status, btn) => {
    state.acFilters.status = status || '';
    const sel = document.getElementById('ac-status-filter'); if (sel) sel.value = status || '';
    document.querySelectorAll('#ac-status-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active'); else { const match = document.querySelector(`#ac-status-toggles .btn-toggle[data-ac-status="${status || ''}"]`); if (match) match.classList.add('active'); }
    state.acPage.index = 1; renderAccessControlTable();
};
window.resetAcFilters = () => {
    state.acFilters = { text: '', role: '', status: '' }; state.acPage.index = 1;
    ['ac-search-input', 'ac-role-filter', 'ac-status-filter'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.querySelectorAll('#ac-status-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('#ac-status-toggles .btn-toggle[data-ac-status=""]'); if (allBtn) allBtn.classList.add('active');
    renderAccessControlTable();
};
window.setAcPageSize = (size) => { state.acPage.size = Number.isFinite(Number(size)) ? Number(size) : 25; state.acPage.index = 1; renderAccessControlTable(); };
window.changeAcPage = (delta) => { state.acPage.index = Math.max(1, (state.acPage.index || 1) + delta); renderAccessControlTable(); };
window.sortAccessControl = (key) => { if (!key) return; if (state.acSort.key === key) state.acSort.dir = state.acSort.dir === 'asc' ? 'desc' : 'asc'; else { state.acSort.key = key; state.acSort.dir = 'asc'; } state.acPage.index = 1; renderAccessControlTable(); };

function getAcSortValue(u, key) {
    const p = u.permissions || defaultPermsForRole(u.role);
    switch (key) {
        case 'name': return (u.name || '').toLowerCase(); case 'email': return (u.email || '').toLowerCase(); case 'role': return (u.role || '').toLowerCase();
        case 'access': return getAccessLevelLabel(p).toLowerCase(); case 'read': return p.read ? 1 : 0; case 'edit': return p.edit ? 1 : 0;
        case 'insert_delete': return (p.insert ? 2 : 0) + (p.delete ? 1 : 0); case 'status': return (u.status || 'approved').toLowerCase(); default: return String(u[key] || '').toLowerCase();
    }
}
function getFilteredAccessUsers() {
    const text = (state.acFilters.text || '').toLowerCase(); const roleF = state.acFilters.role || ''; const statusF = state.acFilters.status || '';
    let rows = [...(state.accessUsers || [])].filter(u => {
        const matchesText = !text || (u.name || '').toLowerCase().includes(text) || (u.email || '').toLowerCase().includes(text);
        return matchesText && (!roleF || u.role === roleF) && (!statusF || (u.status || 'approved') === statusF);
    });
    const sortKey = state.acSort?.key || 'name'; const sortDir = state.acSort?.dir === 'desc' ? -1 : 1;
    return rows.sort((a, b) => { const av = getAcSortValue(a, sortKey); const bv = getAcSortValue(b, sortKey); if (av < bv) return -1 * sortDir; if (av > bv) return 1 * sortDir; return (a.name || '').localeCompare(b.name || ''); });
}

window.updateAccessCustomField = async (email, field, value) => {
    if (state.userRole !== 'Admin') return showToast('Admin only');
    try { await db.collection('users').doc(email).set({ [field]: value }, { merge: true });
        const idx = (state.accessUsers || []).findIndex(u => u.email === email); if (idx >= 0) state.accessUsers[idx] = { ...state.accessUsers[idx], [field]: value };
        showToast('Auto-Saved'); logActivity('edit', 'users', email, `Custom field "${field}" updated`).catch(() => {});
    } catch (e) { showToast('Save failed: ' + (e.message || '')); renderAccessControlTable(); }
};

window.renderAccessControlTable = () => {
    const tbody = document.getElementById('ac-table-body'); const thead = document.getElementById('ac-table-head'); const colgroup = document.getElementById('ac-colgroup'); const footer = document.getElementById('ac-footer-count');
    if (!tbody || !thead) return;
    if (state.userRole !== 'Admin') {
        thead.innerHTML = ''; if (colgroup) colgroup.innerHTML = ''; tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:24px; color:var(--text-muted);">Admin access required</td></tr>`; if (footer) footer.innerText = 'Access restricted'; return;
    }
    const allRows = getFilteredAccessUsers(); const pageSize = Number(state.acPage?.size || 0); const total = allRows.length;
    const totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1; if ((state.acPage.index || 1) > totalPages) state.acPage.index = totalPages;
    const startIdx = pageSize > 0 ? ((state.acPage.index || 1) - 1) * pageSize : 0; const pageRows = pageSize > 0 ? allRows.slice(startIdx, startIdx + pageSize) : allRows;
    const customCols = state.customColumns.accessControl || [];

    const thAlignSortable = (title, context, sortKey) => {
        const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left';
        const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right');
        const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : '';
        const isActive = state.acSort && state.acSort.key === sortKey;
        const sortIcon = isActive ? (state.acSort.dir === 'asc' ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort';
        const sortStyle = isActive ? 'color:var(--primary); opacity:1;' : 'opacity:0.35;';
        return `<div data-colname="${title}" class="th-inner header-hover-group" style="display:flex; align-items:center; width:100%; gap:6px;">
            <i class="fa-solid fa-grip-lines col-drag-handle" title="Drag to move column"></i>
            <span style="flex:1; text-align:${dir}; cursor:pointer; min-width:0;" onclick="event.stopPropagation(); sortAccessControl('${sortKey}')">${title} <i class="fa-solid ${sortIcon}" style="margin-left:4px; font-size:0.7rem; ${sortStyle}"></i></span>
            <i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')" title="Align column"></i>
            <i class="fa-solid fa-trash col-delete-icon" style="cursor:pointer; font-size:0.75rem;" title="Delete / hide column" onclick="event.stopPropagation(); deleteTableColumn('${context}', '${String(title).replace(/'/g, "\\'")}')"></i>
        </div>`;
    };

    thead.innerHTML = `<tr><th data-col="tools" class="ac-col-tools" style="width:44px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('accessControl')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('accessControl')" title="Align All Columns"></i></div></th><th data-col="index" class="ac-col-index" style="width:${AC_COL_DEFAULTS.index}px;">${thAlign('#', 'accessControl')}</th><th data-col="name" class="ac-col-name" style="min-width:160px; width:${AC_COL_DEFAULTS.name}px;">${thAlignSortable('Name', 'accessControl', 'name')}</th><th data-col="email" class="ac-col-email" style="min-width:200px; width:${AC_COL_DEFAULTS.email}px;">${thAlignSortable('Email', 'accessControl', 'email')}</th><th data-col="role" class="ac-col-role" style="min-width:120px; width:${AC_COL_DEFAULTS.role}px;">${thAlignSortable('Role', 'accessControl', 'role')}</th><th data-col="access" class="ac-col-access" style="min-width:140px; width:${AC_COL_DEFAULTS.access}px;">${thAlignSortable('Access Level', 'accessControl', 'access')}</th><th data-col="read" class="ac-col-read ac-center" style="width:${AC_COL_DEFAULTS.read}px;">${thAlignSortable('Read', 'accessControl', 'read')}</th><th data-col="edit" class="ac-col-edit ac-center" style="width:${AC_COL_DEFAULTS.edit}px;">${thAlignSortable('Edit', 'accessControl', 'edit')}</th><th data-col="insert_delete" class="ac-col-insert-delete ac-center" style="min-width:110px; width:${AC_COL_DEFAULTS.insert_delete}px;">${thAlignSortable('Insert/Delete', 'accessControl', 'insert_delete')}</th><th data-col="status" class="ac-col-status ac-center" style="min-width:100px; width:${AC_COL_DEFAULTS.status}px;">${thAlignSortable('Status', 'accessControl', 'status')}</th><th data-col="actions" class="ac-col-actions ac-center" style="min-width:110px; width:${AC_COL_DEFAULTS.actions}px;">${thAlign('Action', 'accessControl')}</th>${customCols.map(col => `<th data-col="${col.key}" class="ac-custom-col">${thAlignSortable(col.name, 'accessControl', col.key)}</th>`).join('')}</tr>`;

    if (colgroup) {
        const widths = loadAcColumnWidths();
        colgroup.innerHTML = ['tools', 'index', 'name', 'email', 'role', 'access', 'read', 'edit', 'insert_delete', 'status', 'actions', ...customCols.map(c => c.key)].map(key => `<col data-col="${key}" style="width:${key === 'tools' ? 44 : (widths[key] || AC_COL_DEFAULTS[key] || 140)}px;">`).join('');
    }

    if (pageRows.length === 0) tbody.innerHTML = `<tr><td colspan="${11 + customCols.length}" style="text-align:center; padding:24px; color:var(--text-muted);">No users found</td></tr>`;
    else {
        tbody.innerHTML = pageRows.map((u, i) => {
            const p = u.permissions || defaultPermsForRole(u.role); const status = u.status || 'approved';
            const statusClass = status === 'approved' ? 'active' : (status === 'pending' ? '' : 'inactive'); const statusColor = status === 'approved' ? 'var(--success)' : (status === 'pending' ? 'var(--accent)' : 'var(--danger)');
            const safeEmail = String(u.email || '').replace(/'/g, "\\'");
            return `<tr data-id="${u.email}">
                <td class="ac-center ac-col-tools-cell"><i class="fa-solid fa-grip-vertical" style="opacity:0.25;"></i></td><td class="ac-center">${startIdx + i + 1}</td>
                <td class="ac-col-name-cell"><div class="ac-cell-left"><span class="ac-name-text" title="${(u.name || '—').replace(/"/g, '&quot;')}">${u.name || '—'}</span></div></td>
                <td class="ac-col-email-cell"><div class="ac-cell-left"><span class="ac-email-text" title="${(u.email || '').replace(/"/g, '&quot;')}">${u.email || ''}</span></div></td>
                <td class="ac-col-role-cell"><select class="status-select table-select-auto" onchange="updateAccessRole('${safeEmail}', this.value)"><option value="Admin" ${u.role === 'Admin' ? 'selected' : ''}>Admin</option><option value="Manager" ${u.role === 'Manager' ? 'selected' : ''}>Manager</option><option value="Employee" ${u.role === 'Employee' ? 'selected' : ''}>Employee</option></select></td>
                <td class="ac-col-access-cell"><div class="ac-cell-left"><span class="ac-access-text">${getAccessLevelLabel(p)}</span></div></td>
                <td class="ac-center"><div class="ac-cell-center"><input type="checkbox" ${p.read ? 'checked' : ''} onchange="updateAccessPermission('${safeEmail}', 'read', this.checked)" title="Read"></div></td>
                <td class="ac-center"><div class="ac-cell-center"><input type="checkbox" ${p.edit ? 'checked' : ''} onchange="updateAccessPermission('${safeEmail}', 'edit', this.checked)" title="Edit"></div></td>
                <td class="ac-center"><div class="ac-cell-center"><div class="ac-perm-group"><label title="Insert"><input type="checkbox" ${p.insert ? 'checked' : ''} onchange="updateAccessPermission('${safeEmail}', 'insert', this.checked)"> I</label><label title="Delete"><input type="checkbox" ${p.delete ? 'checked' : ''} onchange="updateAccessPermission('${safeEmail}', 'delete', this.checked)"> D</label></div></div></td>
                <td class="ac-center"><div class="ac-cell-center"><span class="status-badge ${statusClass}" style="color:${statusColor}; border-color:${statusColor}33;">${status}</span></div></td>
                <td class="ac-center"><div class="ac-cell-center"><div class="ac-actions">${status !== 'approved' ? `<button class="btn-icon-small" style="color:var(--success);" title="Approve" onclick="updateAccessStatus('${safeEmail}', 'approved')"><i class="fa-solid fa-check"></i></button>` : ''}${status !== 'rejected' ? `<button class="btn-icon-small" style="color:var(--danger);" title="Reject" onclick="updateAccessStatus('${safeEmail}', 'rejected')"><i class="fa-solid fa-ban"></i></button>` : ''}${status !== 'pending' ? `<button class="btn-icon-small" style="color:var(--accent);" title="Set Pending" onclick="updateAccessStatus('${safeEmail}', 'pending')"><i class="fa-solid fa-clock"></i></button>` : ''}</div></div></td>
                ${customCols.map(col => `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEditAccessCustom('${safeEmail}', '${col.key}', this)">${String(u[col.key] || '').replace(/"/g, '&quot;')}</td>`).join('')}
            </tr>`;
        }).join('');
    }
    if (footer) footer.innerText = total === 0 ? 'Showing 0 users' : `Showing ${(total === 0 ? 0 : startIdx + 1)}–${startIdx + pageRows.length} of ${total} user${total === 1 ? '' : 's'}`;
    applyHiddenColumns('accessControl', 'access-control-table');
};

window.updateAccessRole = async (email, role) => { if (state.userRole !== 'Admin') return showToast("Admin only"); try { await db.collection('users').doc(email).set({ role, permissions: defaultPermsForRole(role) }, { merge: true }); showToast(`Role updated to ${role}`); logActivity('edit', 'users', email, `Role changed to ${role}`).catch(() => {}); } catch (e) { showToast("Failed to update role: " + (e.message || '')); } };
window.updateAccessPermission = async (email, perm, value) => { if (state.userRole !== 'Admin') return showToast("Admin only"); try { const user = state.accessUsers.find(u => u.email === email); const current = { ...(user?.permissions || defaultPermsForRole(user?.role || 'Employee')) }; current[perm] = !!value; if ((current.edit || current.insert || current.delete) && !current.read) current.read = true; await db.collection('users').doc(email).set({ permissions: current }, { merge: true }); showToast(`${perm.charAt(0).toUpperCase() + perm.slice(1)} ${value ? 'granted' : 'revoked'}`); } catch (e) { showToast("Failed to update permission: " + (e.message || '')); renderAccessControlTable(); } };
window.updateAccessStatus = async (email, status) => { if (state.userRole !== 'Admin') return showToast("Admin only"); try { await db.collection('users').doc(email).set({ status }, { merge: true }); showToast(`Status set to ${status}`); } catch (e) { showToast("Failed to update status: " + (e.message || '')); } };

function updateNotificationBadge() { const badge = document.getElementById('notif-badge'); if (!badge) return; const unread = (state.notifications || []).filter(n => !n.read).length; if (unread > 0) { badge.style.display = ''; badge.innerText = unread > 99 ? '99+' : String(unread); } else badge.style.display = 'none'; }
window.renderNotifications = () => { const container = document.getElementById('notifications-container'); if (!container) return; const list = state.notifications || []; if (list.length === 0) { container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-bell-slash" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><p>No notifications yet</p></div>`; return; } container.innerHTML = list.map(n => `<div class="glass-panel notif-card" style="padding:14px 16px; ${n.read ? 'opacity:0.7;' : 'border-left:3px solid var(--primary);'}"><div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;"><div><div style="font-weight:600; color:var(--text-main); margin-bottom:4px;">${n.title || 'Notification'}</div><div style="font-size:0.9rem; color:var(--text-muted);">${n.message || ''}</div><div style="font-size:0.75rem; color:var(--text-muted); margin-top:6px; opacity:0.8;">${n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}${n.createdBy ? ' · ' + n.createdBy : ''}</div></div><div style="display:flex; gap:4px; flex-shrink:0;">${!n.read ? `<button class="btn-icon-small" style="color:var(--primary);" title="Mark read" onclick="markNotificationRead('${n.id}')"><i class="fa-solid fa-check"></i></button>` : ''}<button class="btn-icon-small" style="color:var(--danger);" title="Dismiss" onclick="deleteNotification('${n.id}')"><i class="fa-solid fa-xmark"></i></button></div></div></div>`).join(''); };
window.markNotificationRead = async (id) => { try { await db.collection('notifications').doc(id).update({ read: true }); } catch (e) { showToast("Failed to mark read"); } };
window.deleteNotification = async (id) => { try { await db.collection('notifications').doc(id).delete(); } catch (e) { showToast("Failed to dismiss"); } };

function getRoleFilteredData(data, type) { 
    if (!state.user) return []; 
    if (state.userRole === 'Admin' || state.userRole === 'Manager') return data; 
    if (type === 'employees') return data.filter(item => item.officialEmail === state.user.email);
    return data.filter(item => item.recruiter === state.currentUserName); 
}
function getFilteredData(data, filters) { return getRoleFilteredData(data, 'candidates').filter(item => { if (item.status === 'Placed') return false; return (!filters.text || (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text)) && (!filters.recruiter || item.recruiter === filters.recruiter) && (!filters.tech || item.tech === filters.tech) && (!filters.status || item.status === filters.status); }); }

function resolveDbCollection(collection, id) {
    if (collection === 'hub') {
        if ((state.candidates || []).some(x => x.id === id)) return 'candidates';
        if ((state.hubData || []).some(x => x.id === id)) return 'hub';
        return 'candidates'; 
    }
    return collection;
}

function getHubRecord(id) { return (state.hubData || []).find(x => x.id === id) || (state.candidates || []).find(x => x.id === id) || null; }
function getOldValue(collection, id, field) { if (collection === 'hub') return getHubRecord(id)?.[field] ?? null; if (['accessControl', 'accessControlUsers', 'users'].includes(collection)) return (state.accessUsers || []).find(x => x.email === id || x.id === id)?.[field] ?? null; const list = state[collection === 'hubData' ? 'hubData' : collection] || []; return (Array.isArray(list) ? list.find(x => x.id === id) : null)?.[field] ?? null; }

function pushToHistory(collection, id, field, oldVal, newVal) { if (historyState.applying) return; pushHistoryEntry({ type: 'field', collection, id, field, oldVal, newVal, label: `Edit ${field}` }); }
function cloneHistoryData(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return value; } }
function pushHistoryEntry(entry) {
    if (historyState.applying || !entry) return;
    const item = { ...entry, ts: Date.now(), by: state.currentUserName || 'Unknown' };
    ['data', 'records', 'oldVal', 'newVal'].forEach(k => { if (item[k] !== undefined) item[k] = cloneHistoryData(item[k]); });
    historyState.undo.push(item); if (historyState.undo.length > historyState.max) historyState.undo.splice(0, historyState.undo.length - historyState.max); historyState.redo = []; updateUndoRedoUI();
}
function updateUndoRedoUI() {
    const undoBtn = document.getElementById('btn-undo'); const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) { undoBtn.disabled = historyState.undo.length === 0; const last = historyState.undo[historyState.undo.length - 1]; undoBtn.title = last ? `Undo: ${last.label || last.type} (Ctrl+Z)` : 'Undo (Ctrl+Z)'; }
    if (redoBtn) { redoBtn.disabled = historyState.redo.length === 0; const next = historyState.redo[historyState.redo.length - 1]; redoBtn.title = next ? `Redo: ${next.label || next.type} (Ctrl+Y)` : 'Redo (Ctrl+Y)'; }
}

async function applyHistoryEntry(entry, direction) {
    if (!entry) return; historyState.applying = true;
    try {
        if (entry.type === 'field') {
            const value = direction === 'undo' ? entry.oldVal : entry.newVal;
            const payload = (value === undefined || value === null || value === '') ? { [entry.field]: firebase.firestore.FieldValue.delete() } : { [entry.field]: value };
            const dbCol = (typeof resolveDbCollection === 'function') ? resolveDbCollection(entry.collection, entry.id) : entry.collection;
            await db.collection(dbCol).doc(entry.id).set(payload, { merge: true }); refreshViewForType(entry.collection === 'hub' ? 'hub' : dbCol);
            showToast(direction === 'undo' ? `Undid ${entry.label || 'edit'}` : `Redid ${entry.label || 'edit'}`); return;
        } showToast('Nothing to undo/redo for this action');
    } finally { historyState.applying = false; updateUndoRedoUI(); }
}

window.undoLastAction = async () => { if (!historyState.undo.length) { showToast('Nothing to undo'); return; } const entry = historyState.undo.pop(); try { await applyHistoryEntry(entry, 'undo'); historyState.redo.push(entry); logActivity('undo', entry.collection || entry.context || 'app', entry.id || null, entry.label || entry.type).catch(() => {}); } catch (e) { historyState.undo.push(entry); showToast('Undo failed: ' + (e.message || '')); } finally { updateUndoRedoUI(); } };
window.redoLastAction = async () => { if (!historyState.redo.length) { showToast('Nothing to redo'); return; } const entry = historyState.redo.pop(); try { await applyHistoryEntry(entry, 'redo'); historyState.undo.push(entry); logActivity('redo', entry.collection || entry.context || 'app', entry.id || null, entry.label || entry.type).catch(() => {}); } catch (e) { historyState.redo.push(entry); showToast('Redo failed: ' + (e.message || '')); } finally { updateUndoRedoUI(); } };

document.addEventListener('keydown', (e) => { if (!(e.ctrlKey || e.metaKey)) return; const key = (e.key || '').toLowerCase(); if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoLastAction(); } else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoLastAction(); } });

/* ==========================================================================
   9. DASHBOARD CHARTS & STATS
   ========================================================================== */
function updateDashboardStats() {
    const roleCands = getRoleFilteredData(state.candidates, 'candidates');
    const rolePlacements = getRoleFilteredData(state.placements, 'placements');
    const roleEmployees = getRoleFilteredData(state.employees, 'employees');
    const candData = roleCands.filter(c => c.status !== 'Placed');
    
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = candData.length;
    if(document.getElementById('stat-active')) document.getElementById('stat-active').innerText = candData.filter(c => c.status === 'Active').length;
    if(document.getElementById('stat-inactive')) document.getElementById('stat-inactive').innerText = candData.filter(c => c.status === 'Inactive').length;
    if(document.getElementById('stat-placed')) document.getElementById('stat-placed').innerText = rolePlacements.length;
    
    const uniqueTechs = new Set(candData.map(c => c.tech ? c.tech.trim().toLowerCase() : '').filter(Boolean));
    if(document.getElementById('stat-tech')) document.getElementById('stat-tech').innerText = uniqueTechs.size;
    if(document.getElementById('stat-rec')) document.getElementById('stat-rec').innerText = roleEmployees.length;
}

window.UpdateDashboardStats = updateDashboardStats;

let recChartInstance = null;
let techChartInstance = null;

function renderDashboardCharts() {
    const candData = getRoleFilteredData(state.candidates, 'candidates').filter(c => c.status !== 'Placed');
    const recCounts = {}; 
    const techCounts = {};
    
    candData.forEach(c => {
        const r = c.recruiter ? c.recruiter.trim() : 'Unassigned';
        recCounts[r] = (recCounts[r] || 0) + 1;
        
        let tRaw = c.tech ? c.tech.trim() : 'Other';
        if(tRaw === '') tRaw = 'Other';
        const existingKey = Object.keys(techCounts).find(k => k.toLowerCase() === tRaw.toLowerCase());
        const t = existingKey || tRaw;
        techCounts[t] = (techCounts[t] || 0) + 1;
    });

    const recLabels = Object.keys(recCounts); 
    const recData = Object.values(recCounts);
    const techLabels = Object.keys(techCounts); 
    const techData = Object.values(techCounts);
    
    const techColors = techLabels.map((_, index) => {
        const hue = (index * 137.508) % 360; 
        return `hsla(${hue}, 85%, 65%, 0.85)`; 
    });
    
    Chart.defaults.color = '#cbd5e1';
    Chart.defaults.font.family = 'inherit';
    
    const ctxRec = document.getElementById('chart-recruiter');
    if (ctxRec) {
        if (recChartInstance) recChartInstance.destroy();
        recChartInstance = new Chart(ctxRec, {
            type: 'bar', 
            data: { 
                labels: recLabels, 
                datasets: [{ 
                    label: 'Candidates Assigned', 
                    data: recData, 
                    backgroundColor: 'rgba(6, 182, 212, 0.8)', 
                    borderColor: '#06b6d4', 
                    borderWidth: 1, 
                    borderRadius: 6, 
                    maxBarThickness: 35, 
                    categoryPercentage: 0.6,
                    barPercentage: 0.8
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false },
                    tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', cornerRadius: 8 }
                }, 
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                        ticks: { stepSize: 1 } 
                    }, 
                    x: { 
                        grid: { display: false }
                    } 
                } 
            }
        });
    }
    
    const ctxTech = document.getElementById('chart-tech');
    if (ctxTech) {
        if (techChartInstance) techChartInstance.destroy();
        techChartInstance = new Chart(ctxTech, {
            type: 'doughnut', 
            data: { 
                labels: techLabels, 
                datasets: [{ 
                    data: techData, 
                    backgroundColor: techColors, 
                    borderWidth: 2, 
                    borderColor: '#1e293b', 
                    hoverOffset: 5
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                layout: {
                    padding: 10
                },
                plugins: { 
                    legend: { 
                        display: false 
                    },
                    tooltip: { 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.label}: ${context.raw}`;
                            }
                        }
                    }
                }, 
                cutout: '65%'
            }
        });

        const legendContainer = document.getElementById('tech-legend');
        if (legendContainer) {
            legendContainer.innerHTML = techLabels.map((label, i) => `
                <div class="tech-legend-item">
                    <div class="tech-legend-swatch" style="background: ${techColors[i]}"></div>
                    <div class="tech-legend-label" title="${label}">${label}</div>
                    <div class="tech-legend-count">${techData[i]}</div>
                </div>
            `).join('');
        }
    }
}

/* ==========================================================================
   COLUMN DELETION / HIDING
   ========================================================================== */
window.deleteTableColumn = async (context, colName) => {
    if (!canEdit() && state.userRole !== 'Admin') return showToast("Permission denied"); 
    if (!confirm(`Hide the "${colName}" column? You can restore it from the Add Column menu.`)) return;
    if (!state.hiddenColumns[context]) state.hiddenColumns[context] = [];
    const beforeHidden = [...state.hiddenColumns[context]];
    if (!state.hiddenColumns[context].includes(colName)) state.hiddenColumns[context].push(colName);
    try {
        await db.collection('settings').doc('table_config').set({ hiddenColumns: state.hiddenColumns }, { merge: true });
        pushHistoryEntry({ type: 'column_hide', context: context, colName: colName, beforeHidden: beforeHidden, afterHidden: [...state.hiddenColumns[context]], label: `Hide ${colName} column` });
        showToast(`Column "${colName}" hidden`);
        refreshViewForType(context);
        if (document.getElementById('add-column-modal').style.display === 'flex') renderColumnManageSection(context);
    } catch(e) { console.error(e); showToast("Failed to hide column"); }
};

window.restoreTableColumn = async (context, colName) => {
    if (!canEdit() && state.userRole !== 'Admin') return showToast("Permission denied"); 
    if (!state.hiddenColumns[context]) return;
    const beforeHidden = [...state.hiddenColumns[context]];
    state.hiddenColumns[context] = state.hiddenColumns[context].filter(c => c !== colName);
    try {
        await db.collection('settings').doc('table_config').set({ hiddenColumns: state.hiddenColumns }, { merge: true });
        pushHistoryEntry({ type: 'column_hide', context: context, colName: colName, beforeHidden: beforeHidden, afterHidden: [...state.hiddenColumns[context]], label: `Restore ${colName} column` });
        showToast(`Column "${colName}" restored`);
        refreshViewForType(context);
        if (document.getElementById('add-column-modal').style.display === 'flex') renderColumnManageSection(context);
    } catch(e) { console.error(e); showToast("Failed to restore column"); }
};

window.applyHiddenColumns = (context, tableId) => {
    const table = document.getElementById(tableId); if (!table) return;
    const hidden = state.hiddenColumns[context] || [];
    let styleEl = document.getElementById(`hidden-style-${context}`);
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = `hidden-style-${context}`; document.head.appendChild(styleEl); }
    if (hidden.length === 0) { styleEl.innerHTML = ''; return; }
    let cssRules = '';
    Array.from(table.querySelectorAll('th')).forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div && hidden.includes(div.dataset.colname)) {
            cssRules += `#${tableId} th:nth-child(${idx + 1}), #${tableId} td:nth-child(${idx + 1}) { display: none !important; }\n`;
            cssRules += `#${tableId} col:nth-child(${idx + 1}) { display: none !important; width: 0 !important; min-width: 0 !important; }\n`;
        }
    });
    styleEl.innerHTML = cssRules;
};

/* ==========================================================================
   10. ALIGNMENT & COLUMN CONFIG
   ========================================================================== */
window.cycleAlign = (context, colName) => { const modes = ['left', 'center', 'right']; state.alignments[context][colName] = modes[(modes.indexOf(state.alignments[context][colName] || 'left') + 1) % 3]; refreshViewForType(context); };
window.cycleAlignAll = (context) => { const modes = ['left', 'center', 'right']; state.alignments[context]['global'] = modes[(modes.indexOf(state.alignments[context]['global'] || 'left') + 1) % 3]; refreshViewForType(context); showToast(`All columns aligned ${state.alignments[context]['global']}`); };

function applyAlignStyles(context, tableId) {
    const table = document.getElementById(tableId); if (!table) return;
    const config = state.alignments[context] || {}; let rules = '';
    Array.from(table.querySelectorAll('th')).forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div) { const val = config[div.dataset.colname] || config['global'] || 'left'; if (val !== 'left') rules += `#${tableId} th:nth-child(${idx+1}), #${tableId} td:nth-child(${idx+1}) { text-align: ${val} !important; }\n`; }
    });
    let style = document.getElementById(`align-style-${context}`); if(!style) { style = document.createElement('style'); style.id = `align-style-${context}`; document.head.appendChild(style); } style.innerHTML = rules;
}

function thAlign(title, context) {
    const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left';
    const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right');
    const safeTitle = String(title).replace(/'/g, "\\'");
    return `<div data-colname="${title}" class="header-hover-group" style="display:flex; align-items:center; width:100%; gap:6px;">
        <span style="flex:1; text-align:${dir}; min-width:0;">${title}</span>
        <i class="fa-solid ${icon} align-icon" style="${dir !== 'left' ? 'color:var(--primary); opacity:1;' : ''}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')" title="Align column"></i>
        <i class="fa-solid fa-trash col-delete-icon" style="cursor:pointer; font-size:0.75rem;" title="Hide column" onclick="event.stopPropagation(); deleteTableColumn('${context}', '${safeTitle}')"></i>
    </div>`;
}

let dragColIndex = null; let dragTableId = null;
function initColumnDragDrop(tableId, context) {
    const table = document.getElementById(tableId); if (!table) return;
    table.querySelectorAll('th').forEach((th, index) => {
        if (index < 4) return;
        th.setAttribute('draggable', 'true'); th.classList.add('draggable-col');
        th.ondragstart = (e) => { e.stopPropagation(); dragColIndex = Array.from(th.parentNode.children).indexOf(th); dragTableId = tableId; e.dataTransfer.effectAllowed = 'move'; th.style.opacity = '0.5'; };
        th.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); if (index < 4 || dragTableId !== tableId) return false; e.dataTransfer.dropEffect = 'move'; th.classList.add('drag-over'); return false; };
        th.ondragleave = () => th.classList.remove('drag-over');
        th.ondragend = () => { th.style.opacity = '1'; table.querySelectorAll('th').forEach(h => h.classList.remove('drag-over')); };
        th.ondrop = (e) => {
            e.stopPropagation(); e.preventDefault(); th.classList.remove('drag-over');
            if (index < 4 || dragTableId !== tableId || dragColIndex === null) return;
            const dropColIndex = Array.from(th.parentNode.children).indexOf(th);
            if (dragColIndex !== dropColIndex) { moveColumnDOM(table, dragColIndex, dropColIndex); saveColumnOrder(tableId, context); applyAlignStyles(context, tableId); }
            dragColIndex = null; return false;
        };
    });
}
function moveColumnDOM(table, fromIdx, toIdx) { if (fromIdx === toIdx) return; const rows = table.rows; for (let i = 0; i < rows.length; i++) { const cells = rows[i].children; if (fromIdx < cells.length && toIdx < cells.length) rows[i].insertBefore(cells[fromIdx], fromIdx < toIdx ? cells[toIdx].nextSibling : cells[toIdx]); } }
function saveColumnOrder(tableId, context) { const table = document.getElementById(tableId); const order = []; Array.from(table.querySelectorAll('th')).forEach((th, idx) => { if (idx >= 4) { const div = th.querySelector('[data-colname]'); if (div) order.push(div.dataset.colname); } }); state.colOrders[context] = order; db.collection('settings').doc('table_config').set({ colOrders: state.colOrders }, { merge: true }); }
function restoreColumnOrder(tableId, context) { const savedOrder = state.colOrders?.[context]; if (!savedOrder || savedOrder.length === 0) return; const table = document.getElementById(tableId); savedOrder.forEach((colName, desiredRelativeIdx) => { const desiredDOMIdx = desiredRelativeIdx + 4; const headers = Array.from(table.querySelectorAll('th')); let currentDOMIdx = -1; for (let i = 4; i < headers.length; i++) { const div = headers[i].querySelector('[data-colname]'); if (div && div.dataset.colname === colName) { currentDOMIdx = i; break; } } if (currentDOMIdx !== -1 && currentDOMIdx !== desiredDOMIdx && desiredDOMIdx < headers.length) moveColumnDOM(table, currentDOMIdx, desiredDOMIdx); }); }

function generateCustomColumnHeader(col, idx, context) {
    const alignDir = (state.alignments[context] && state.alignments[context][col.name]) || 'left';
    return `<th>
        <div class="header-hover-group" style="display:flex; align-items:center; justify-content:space-between; width:100%;">
            <span style="flex:1; text-align:${alignDir}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${col.name}</span>
            <i class="fa-solid fa-arrows-left-right-to-line align-icon" style="font-size:0.65rem; margin-left:4px; opacity:0.5;" onclick="event.stopPropagation(); cycleAlign('${context}', '${col.name}')" title="Change alignment"></i>
            <i class="fa-solid fa-trash col-delete-icon text-danger" style="cursor:pointer; margin-left:5px; font-size:0.7rem;" onclick="event.stopPropagation(); deleteCustomColumn('${context}', ${idx});" title="Delete this column"></i>
        </div></th>`;
}

/* ==========================================================================
   12. TABLE RENDERERS 
   ========================================================================== */
function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.cand.forEach(id => { if(!validIds.has(id)) state.selection.cand.delete(id); });
    updateSelectButtons('cand');
    const isAllChecked = filtered.length > 0 && filtered.every(c => state.selection.cand.has(c.id));
    const customHeaders = (state.customColumns.candidates || []).map((col, idx) => generateCustomColumnHeader(col, idx, 'candidates')).join('');
    
    thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')" title="Align All"></i></th><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th><th>#</th><th>${thAlign('First Name', 'candidates')}</th><th>${thAlign('Last Name', 'candidates')}</th><th>${thAlign('Mobile', 'candidates')}</th><th>${thAlign('WhatsApp', 'candidates')}</th><th>${thAlign('Tech', 'candidates')}</th><th>${thAlign('Recruiter', 'candidates')}</th><th style="width:140px;">${thAlign('Status', 'candidates')}</th><th>${thAlign('Assigned', 'candidates')}</th><th>${thAlign('Gmail', 'candidates')}</th><th>${thAlign('LinkedIn', 'candidates')}</th><th>${thAlign('Resume', 'candidates')}</th><th>${thAlign('Track', 'candidates')}</th><th>${thAlign('Comments', 'candidates')}</th>${customHeaders}</tr>`;
    if(document.getElementById('cand-footer-count')) document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        const customCells = (state.customColumns.candidates || []).map(col => {
            const val = c[col.key] || '';
            if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`;
            if(col.type === 'url') return renderUrlCell(c.id, col.key, 'candidates', val, 'fa-solid fa-link text-cyan', 'fa-solid fa-plus icon-empty');
            return `<td tabindex="0" data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || ''}</td>`;
        }).join('');
        const gmailCell = renderUrlCell(c.id, 'gmail', 'candidates', c.gmail, 'fa-brands fa-google icon-gmail', 'fa-solid fa-plus icon-empty');
        const linkedinCell = renderUrlCell(c.id, 'linkedin', 'candidates', c.linkedin, 'fa-brands fa-linkedin icon-linkedin', 'fa-solid fa-plus icon-empty');
        const resumeCell = renderUrlCell(c.id, 'resume', 'candidates', c.resume, 'fa-solid fa-file-lines icon-resume', 'fa-solid fa-plus icon-empty');
        const trackCell = renderUrlCell(c.id, 'track', 'candidates', c.track, 'fa-solid fa-location-crosshairs icon-track', 'fa-solid fa-plus icon-empty');
        
        return `<tr class="${rowClass}" data-id="${c.id}" data-collection="candidates" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'candidates')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'candidates')">
        <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td>
        <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
        <td>${i+1}</td>
<td tabindex="0" data-field="first" id="fname-${c.id}" onclick="window.handleFirstNameClick(event, '${c.id}', 'candidates')" ondblclick="window.handleFirstNameDblClick(event, '${c.id}', 'candidates')" style="cursor: pointer; position: relative;">${c.first}</td>
        <td tabindex="0" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
        <td tabindex="0" data-field="mobile" ondblclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td>
        <td tabindex="0" data-field="wa" ondblclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td>
        <td tabindex="0" data-field="tech" ondblclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td>
        <td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td>
        <td style="overflow:visible;"><div class="action-dropdown-container"><div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${c.status||'Inactive'} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div><div id="menu-${c.id}" class="custom-dropdown-menu"><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div><div class="dropdown-option" onclick="moveToPlacements('${c.id}')"><span class="dot-gold" style="width:8px; height:8px; background:#f59e0b; border-radius:50%; display:inline-block;"></span> Move to Placements</div><div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div></div></div></td>
        <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
        ${gmailCell}${linkedinCell}${resumeCell}${trackCell}
        <td tabindex="0" data-field="comments" ondblclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||''}</td>
        ${customCells}</tr>`;
    }).join('');
    
    restoreColumnOrder('candidates-table', 'candidates'); 
    applyAlignStyles('candidates', 'candidates-table'); 
    applyHiddenColumns('candidates', 'candidates-table');
    initColumnDragDrop('candidates-table', 'candidates');
    attachAllContextMenus();
}

function renderEmployeeTable() {
    let roleFiltered = getRoleFilteredData(state.employees, 'employees');
    let filtered = roleFiltered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.emp.forEach(id => { if(!validIds.has(id)) state.selection.emp.delete(id); });
    updateSelectButtons('emp');
    const isAllChecked = filtered.length > 0 && filtered.every(e => state.selection.emp.has(e.id));
    const customHeaders = (state.customColumns.employees || []).map((col, idx) => generateCustomColumnHeader(col, idx, 'employees')).join('');
    
    document.getElementById('employee-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="font-size:0.8rem; cursor:pointer;" onclick="cycleAlignAll('employees')" title="Align All"></i></th><th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th><th>#</th><th>${thAlign('First Name', 'employees')}</th><th>${thAlign('Last Name', 'employees')}</th><th>${thAlign('Date of Birth', 'employees')}</th><th>${thAlign('Designation', 'employees')}</th><th>${thAlign('Work Mobile', 'employees')}</th><th>${thAlign('Personal Mobile', 'employees')}</th><th>${thAlign('Official Email', 'employees')}</th><th>${thAlign('Personal Email', 'employees')}</th><th>${thAlign('Track', 'employees')}</th>${customHeaders}</tr>`;
    if(document.getElementById('emp-footer-count')) document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.emp.has(c.id) ? 'checked' : '';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        const customCells = (state.customColumns.employees || []).map(col => {
            const val = c[col.key] || '';
            if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'employees', this.value)"></td>`;
            if(col.type === 'url') return renderUrlCell(c.id, col.key, 'employees', val, 'fa-solid fa-link text-cyan', 'fa-solid fa-plus icon-empty');
            return `<td data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'employees', this)">${val || ''}</td>`;
        }).join('');
        const trackCell = renderUrlCell(c.id, 'track', 'employees', c.track, 'fa-solid fa-location-crosshairs icon-track', 'fa-solid fa-plus icon-empty');
        return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="employees" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'employees')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'employees')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td><td>${i+1}</td><td data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td><td data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td><td data-field="designation" ondblclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||''}</td><td data-field="workMobile" ondblclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||''}</td><td data-field="personalMobile" ondblclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||''}</td><td data-field="officialEmail" ondblclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||''}</td><td data-field="personalEmail" ondblclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||''}</td>${trackCell}${customCells}</tr>`;
    }).join('');
    
    restoreColumnOrder('employee-table', 'employees'); 
    applyAlignStyles('employees', 'employee-table'); 
    applyHiddenColumns('employees', 'employee-table');
    initColumnDragDrop('employee-table', 'employees');
    attachAllContextMenus();
}

function renderOnboardingTable() {
    const roleFiltered = getRoleFilteredData(state.onboarding, 'onboarding');
    const filtered = roleFiltered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.onb.forEach(id => { if(!validIds.has(id)) state.selection.onb.delete(id); });
    updateSelectButtons('onb');
    const isAllChecked = filtered.length > 0 && filtered.every(o => state.selection.onb.has(o.id));
    const customHeaders = (state.customColumns.onboarding || []).map((col, idx) => generateCustomColumnHeader(col, idx, 'onboarding')).join('');
    
    document.getElementById('onboarding-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="font-size:0.8rem; cursor:pointer;" onclick="cycleAlignAll('onboarding')" title="Align All"></i></th><th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th><th>#</th><th>${thAlign('First Name', 'onboarding')}</th><th>${thAlign('Last Name', 'onboarding')}</th><th>${thAlign('Date of Birth', 'onboarding')}</th><th>${thAlign('Recruiter', 'onboarding')}</th><th>${thAlign('Mobile', 'onboarding')}</th><th>${thAlign('Status', 'onboarding')}</th><th>${thAlign('Assigned', 'onboarding')}</th><th>${thAlign('Comments', 'onboarding')}</th>${customHeaders}</tr>`;
    if(document.getElementById('onb-footer-count')) document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.onb.has(c.id) ? 'checked' : '';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        const customCells = (state.customColumns.onboarding || []).map(col => {
            const val = c[col.key] || '';
            if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'onboarding', this.value)"></td>`;
            if(col.type === 'url') return renderUrlCell(c.id, col.key, 'onboarding', val, 'fa-solid fa-link text-cyan', 'fa-solid fa-plus icon-empty');
            return `<td data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'onboarding', this)">${val || ''}</td>`;
        }).join('');
        return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="onboarding" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'onboarding')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'onboarding')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td><td>${i+1}</td><td data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td><td data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td><td data-field="mobile" ondblclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td><td><div style="display:flex; align-items:center; gap:2px;"><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)">${state.onboardingStatuses.map(s => `<option value="${s}" ${c.status===s?'selected':''}>${s}</option>`).join('')}</select><i class="fa-solid fa-plus" style="cursor:default; color:var(--primary); padding:4px; font-size:0.75rem;" onclick="addOnboardingStatus()" title="Add New Status"></i></div></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td><td data-field="comments" ondblclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||''}</td>${customCells}</tr>`;
    }).join('');
    
    restoreColumnOrder('onboarding-table', 'onboarding'); 
    applyAlignStyles('onboarding', 'onboarding-table'); 
    applyHiddenColumns('onboarding', 'onboarding-table');
    initColumnDragDrop('onboarding-table', 'onboarding');
    attachAllContextMenus();
}

function renderPlacementTable() {
    const mVal = document.getElementById('placement-month-picker').value;
    const yVal = document.getElementById('placement-year-picker').value;
    const roleFiltered = getRoleFilteredData(state.placements, 'placements');
    let placed = roleFiltered.filter(c => c.assigned && (state.placementFilter === 'monthly' ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal)));
    const validIds = new Set(placed.map(c => c.id));
    if(!state.selection.place) state.selection.place = new Set();
    state.selection.place.forEach(id => { if(!validIds.has(id)) state.selection.place.delete(id); });
    updateSelectButtons('place');
    const isAllChecked = placed.length > 0 && placed.every(p => state.selection.place.has(p.id));
    const customHeaders = (state.customColumns.placements || []).map((col, idx) => generateCustomColumnHeader(col, idx, 'placements')).join('');
    const thead = document.querySelector('#placement-table-head');
    
    if(thead) thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="font-size:0.8rem; cursor:pointer;" onclick="cycleAlignAll('placements')" title="Align All"></i></th><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">#</th><th>${thAlign('First Name', 'placements')}</th><th>${thAlign('Last Name', 'placements')}</th><th>${thAlign('Tech', 'placements')}</th><th>${thAlign('Location', 'placements')}</th><th>${thAlign('Contract', 'placements')}</th><th>${thAlign('Assigned', 'placements')}</th><th>${thAlign('Actions', 'placements')}</th>${customHeaders}</tr>`;
    if(document.getElementById('placement-footer-count')) document.getElementById('placement-footer-count').innerText = `Showing ${placed.length} total records`;
    
    if(document.getElementById('placement-table-body')) {
        document.getElementById('placement-table-body').innerHTML = placed.map((c, i) => {
            const isSel = state.selection.place.has(c.id) ? 'checked' : '';
            const rowClass = state.selection.place.has(c.id) ? 'selected-row' : '';
            const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
            const customCells = (state.customColumns.placements || []).map(col => {
                const val = c[col.key] || '';
                if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'placements', this.value)"></td>`;
                if(col.type === 'url') return renderUrlCell(c.id, col.key, 'placements', val, 'fa-solid fa-link text-cyan', 'fa-solid fa-plus icon-empty');
                return `<td data-field="${col.key}" ondblclick="inlineEdit('${c.id}', '${col.key}', 'placements', this)">${val || ''}</td>`;
            }).join('');
            return `<tr class="${rowClass}" data-id="${c.id}" data-collection="placements" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'placements')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'placements')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'placements', this)">${c.first}</td><td style="font-weight:600; color:var(--text-main);" data-field="last" ondblclick="inlineEdit('${c.id}', 'last', 'placements', this)">${c.last}</td><td data-field="tech" ondblclick="inlineEdit('${c.id}', 'tech', 'placements', this)" class="text-cyan">${c.tech}</td><td data-field="location" ondblclick="inlineEdit('${c.id}', 'location', 'placements', this)">${c.location||''}</td><td data-field="contract" ondblclick="inlineEdit('${c.id}', 'contract', 'placements', this)">${c.contract||''}</td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'placements', this.value)"></td><td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>${customCells}</tr>`;
        }).join('');
    }
    restoreColumnOrder('placement-table', 'placements'); 
    applyAlignStyles('placements', 'placement-table'); 
    applyHiddenColumns('placements', 'placement-table');
    initColumnDragDrop('placement-table', 'placements');
    attachAllContextMenus();
}

function renderHubTable() {
    let data = getMergedHubData(); 
    
    if(state.hubFilters && state.hubFilters.text) {
        data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));
    }
    
    const { start, end } = state.hub.range;
    const isInRange = (entry) => { 
        const dateStr = entry.date || entry;
        if (!dateStr) return false;
        if (state.hub.filterType === 'daily') return dateStr === state.hub.date; 
        const [y, m, d] = dateStr.split('-').map(Number);
        const entryTime = new Date(y, m - 1, d, 12, 0, 0).getTime(); 
        return entryTime >= start && entryTime <= end;
    };
    
    const isCreatedInRange = (c) => {
        if (!c.createdAt) return false;
        const createdDateStr = new Date(c.createdAt - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
        if (state.hub.filterType === 'daily') return createdDateStr === state.hub.date;
        return c.createdAt >= start && c.createdAt <= end;
    };
    
    const activeCandidates = data.filter(c => 
        !c.hiddenFromHub && 
        (
            (c.isHubOnly && isCreatedInRange(c)) || 
            (c.submissionLog || []).some(isInRange) || 
            (c.screeningLog || []).some(isInRange) || 
            (c.interviewLog || []).some(isInRange)
        )
    );
    
    const validIds = new Set(activeCandidates.map(c => c.id));
    if(!state.selection.hub) state.selection.hub = new Set();
    state.selection.hub.forEach(id => { if(!validIds.has(id)) state.selection.hub.delete(id); });
    updateSelectButtons('hub');
    const isAllChecked = activeCandidates.length > 0 && activeCandidates.every(c => state.selection.hub.has(c.id));
    
    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="font-size:0.8rem; cursor:pointer;" onclick="cycleAlignAll('hub')" title="Align All"></i></th><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">#</th><th style="width:150px;">${thAlign('Candidate Name', 'hub')}</th><th style="width:150px;">${thAlign('Recruiter', 'hub')}</th><th style="width:120px;">${thAlign('Technology', 'hub')}</th><th style="text-align:center;">${thAlign('Submission', 'hub')}</th><th style="text-align:center;">${thAlign('Screenings', 'hub')}</th><th style="text-align:center;">${thAlign('Interview', 'hub')}</th><th style="text-align:right;">${thAlign('Date', 'hub')}</th></tr>`;
    if(document.getElementById('hub-footer-count')) document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    const tbody = document.getElementById('hub-table-body');
    if (activeCandidates.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`; return; }
    
    tbody.innerHTML = activeCandidates.map((c, i) => {
        const sub = (c.submissionLog||[]).filter(isInRange).length;
        const scr = (c.screeningLog||[]).filter(isInRange).length;
        const int = (c.interviewLog||[]).filter(isInRange).length;
        let displayDate = '-';
        const logsInRange = [...(c.submissionLog||[]).filter(isInRange), ...(c.screeningLog||[]).filter(isInRange), ...(c.interviewLog||[]).filter(isInRange)];
        if (logsInRange.length > 0) { logsInRange.sort((a,b) => new Date(b.date || b) - new Date(a.date || a)); displayDate = (typeof logsInRange[0] === 'string') ? logsInRange[0] : (logsInRange[0].date || '-'); }
        const isSel = state.selection.hub.has(c.id) ? 'checked' : '';
        const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';
        const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        
        let html = `<tr style="cursor:pointer; ${activeStyle}" class="${state.selection.hub.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="hub" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'hub')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'hub')">
            <td class="drag-handle-cell" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td>
            <td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td>
            <td>${i+1}</td>
            <td style="font-weight:600; color:var(--text-main);" data-field="first" ondblclick="inlineEdit('${c.id}', 'first', 'hub', this)">${c.first} ${c.last}</td>
            <td>${generateRecruiterDropdown(c.recruiter, c.id, 'hub')}</td>
            <td>${generateTechDropdown(c.tech, c.id, 'hub')}</td>
            <td class="text-cyan hub-stat-cell" style="font-weight:bold; font-size:1.1rem; text-align:center;" onclick="toggleHubRow('${c.id}')">
                ${sub} <i class="fa-solid fa-plus hub-add-icon" onclick="event.stopPropagation(); window.addHubLogFromTable('${c.id}', 'submission')" title="Add Submission"></i>
            </td>
            <td class="text-gold hub-stat-cell" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">
                ${scr} <i class="fa-solid fa-plus hub-add-icon" onclick="event.stopPropagation(); window.addHubLogFromTable('${c.id}', 'screening')" title="Add Screening"></i>
            </td>
            <td class="text-purple hub-stat-cell" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">
                ${int} <i class="fa-solid fa-plus hub-add-icon" onclick="event.stopPropagation(); window.addHubLogFromTable('${c.id}', 'interview')" title="Add Interview"></i>
            </td>
            <td style="font-size:0.8rem; color:var(--text-muted); text-align:right;" onclick="toggleHubRow('${c.id}')">
                ${displayDate} <span style="margin-left: 8px; opacity:0.7;">${caret}</span>
            </td>
        </tr>`;
        
        if(isExpanded) {
            const renderTimeline = (list, type) => {
                const visibleLogs = (list||[]).filter(isInRange);
                if(visibleLogs.length === 0) return `<li class="hub-log-item" style="opacity:0.5; font-style:italic;">No records in this range.</li>`;
                const logArrayName = type === 'sub' ? 'submissionLog' : (type === 'scr' ? 'screeningLog' : 'interviewLog');
                
                return visibleLogs.map((entry, index) => {
                    const dateStr = typeof entry === 'string' ? entry : entry.date;
                    const subjectText = typeof entry === 'string' ? entry : (entry.subject || entry.note || '');
                    const displayText = subjectText ? subjectText : '<span style="opacity:0.6; font-style:italic;">Click to add/paste details...</span>';
                    const link = !(typeof entry === 'string') && entry.link ? entry.link : null;
                    const icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');
                    
                    return `<li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; justify-content:space-between; width:100%;">
                            <span class="log-date" style="color:var(--primary); font-weight:bold; font-size:0.85rem;"><i class="fa-solid ${icon}"></i> ${dateStr}</span>
                            ${entry.recruiter ? `<span style="font-size:0.7rem; opacity:0.6;">${entry.recruiter}</span>` : ''}
                        </div>
                        <div style="font-weight:500; color:#fff; font-size:0.9rem; cursor:pointer;" title="Click to edit/paste details" onclick="event.stopPropagation(); editHubLogDetail('${c.id}', '${logArrayName}', ${index})">
                            ${displayText} <i class="fa-solid fa-pen" style="font-size:0.7rem; opacity:0.5; margin-left:5px;"></i>
                        </div>
                        ${link ? `<a href="${link}" target="_blank" class="hub-link-btn" style="margin-top:5px; text-decoration:none; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--primary); font-size:0.8rem;">View Email</a>` : ''}
                        <div style="text-align:right; width:100%; margin-top:5px;">
                            <button class="hub-action-btn delete" style="color: #ef4444; background:none; border:none; cursor:pointer;" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${logArrayName}', ${index})"><i class="fa-solid fa-trash"></i> Remove</button>
                        </div>
                    </li>`;
                }).join('');
            };
            html += `<tr class="hub-details-row"><td colspan="10" style="padding:0; border:none;"><div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()"><div class="hub-col cyan"><div class="hub-col-header cyan">RTR & Submissions <button onclick="triggerHubNote('${c.id}', 'submissionLog')" style="float:right; background:none; border:none; color:#06b6d4; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.submissionLog, 'sub')}</ul></div><div class="hub-col gold"><div class="hub-col-header gold">Screenings <button onclick="triggerHubNote('${c.id}', 'screeningLog')" style="float:right; background:none; border:none; color:#f59e0b; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog, 'scr')}</ul></div><div class="hub-col purple"><div class="hub-col-header purple">Interviews <button onclick="triggerHubNote('${c.id}', 'interviewLog')" style="float:right; background:none; border:none; color:#8b5cf6; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog, 'int')}</ul></div></div></td></tr>`;
        }
        return html;
    }).join('');
    
    restoreColumnOrder('hub-table', 'hub'); 
    applyAlignStyles('hub', 'hub-table'); 
    applyHiddenColumns('hub', 'hub-table');
    initColumnDragDrop('hub-table', 'hub');
    attachAllContextMenus();
}

/* ==========================================================================
   13. DATA MANIPULATION & INLINE EDITS
   ========================================================================== */
window.updateHubStats = (filterType, dateVal) => {
    if(filterType) state.hub.filterType = filterType;
    if(dateVal) state.hub.date = dateVal;
    const dateInput = document.getElementById('hub-date-picker');
    if (dateInput && dateInput.value !== state.hub.date) dateInput.value = state.hub.date;
    const [year, month, day] = state.hub.date.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    let start, end, labelText;
    if (state.hub.filterType === 'daily') {
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
        labelText = state.hub.date;
    } else if (state.hub.filterType === 'weekly') {
        const currentDay = d.getDay();
        const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + distanceToMonday);
        const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
        start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate(), 0, 0, 0, 0).getTime();
        end = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate(), 23, 59, 59, 999).getTime();
        labelText = `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${friday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    } else {
        start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        labelText = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    if(document.getElementById('hub-range-label')) document.getElementById('hub-range-label').innerHTML = `<i class="fa-regular fa-calendar"></i> ${labelText}`;
    state.hub.range = { start, end };
    
    const isInRange = (entry) => { 
        const dateStr = entry.date || entry;
        if (!dateStr) return false;
        if (state.hub.filterType === 'daily') return dateStr === state.hub.date; 
        const [y, m, d] = dateStr.split('-').map(Number);
        const entryTime = new Date(y, m - 1, d, 12, 0, 0).getTime(); 
        return entryTime >= start && entryTime <= end;
    };
    
    const roleCands = getMergedHubData(); 
    let subs=0, scrs=0, ints=0;
    roleCands.forEach(c => { 
        if (c.hiddenFromHub) return;
        subs += (c.submissionLog||[]).filter(isInRange).length; 
        scrs += (c.screeningLog||[]).filter(isInRange).length; 
        ints += (c.interviewLog||[]).filter(isInRange).length; 
    });
    
    if(document.getElementById('stat-sub')) document.getElementById('stat-sub').innerText = subs;
    if(document.getElementById('stat-scr')) document.getElementById('stat-scr').innerText = scrs;
    if(document.getElementById('stat-int')) document.getElementById('stat-int').innerText = ints;
    document.querySelectorAll('.hub-controls .filter-btn').forEach(b => { b.classList.remove('active'); if(b.getAttribute('data-filter') === state.hub.filterType) b.classList.add('active'); });
    renderHubTable();
};

window.toggleHubRow = (id) => { state.hub.expandedRowId = state.hub.expandedRowId === id ? null : id; renderHubTable(); };

window.updatePlacementFilter = (type, btn) => {
    state.placementFilter = type;
    document.querySelectorAll('#view-placements .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('placement-month-picker').style.display = type === 'monthly' ? 'block' : 'none';
    document.getElementById('placement-year-picker').style.display = type === 'yearly' ? 'block' : 'none';
    renderPlacementTable();
};

let _insertInProgress = {};
window.createNewRow = async (type) => {
    if (_insertInProgress[type]) return;
    _insertInProgress[type] = true;
    const ts = Date.now() + Math.random(); 
    const newOrderIndex = -ts;
    const defaultRecruiter = state.userRole === 'Employee' ? state.currentUserName : '';
    let data = { 
        first: '', last: '', mobile: '', wa: '', tech: '', comments: '', 
        assigned: getLocalDateString(), 
        recruiter: defaultRecruiter, 
        orderIndex: newOrderIndex, 
        createdAt: ts 
    };
    let collectionName = type;
    if (type === 'candidates') { 
        data.status = 'Active'; 
    } else if (type === 'employees') { 
        data.designation = ''; data.workMobile = ''; data.personalMobile = ''; 
        data.officialEmail = state.userRole === 'Employee' ? state.user.email : '';
        data.personalEmail = ''; data.dob = ''; 
    } else if (type === 'onboarding') { 
        data.status = 'Onboarding'; data.dob = ''; 
    } else if (type === 'hub') { 
        data.status = 'Active'; 
        collectionName = 'hub'; 
        data.submissionLog = []; data.screeningLog = []; data.interviewLog = [];
        data.isHubOnly = true; 
    }
    try { await db.collection(collectionName).add(data); showToast(`Blank row added to ${type}`); } 
    catch (error) { console.error("Insertion error:", error); showToast("Error: " + error.message); } 
    finally { _insertInProgress[type] = false; }
};

window.manualAddPlacement = async () => {
    if (_insertInProgress['placements']) return;
    _insertInProgress['placements'] = true;
    const ts = Date.now() + Math.random();
    let defaultDate = getLocalDateString();
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
    catch (error) { showToast("Error: " + error.message); } 
    finally { _insertInProgress['placements'] = false; }
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
    if (newVal !== oldVal) {
        pushToHistory(col, id, field, oldVal, newVal);
        const dbCol = (typeof resolveDbCollection === 'function') ? resolveDbCollection(col, id) : col;
        db.collection(dbCol).doc(id).update({ [field]: newVal })
            .then(() => showToast("Auto-Saved"))
            .catch(() => input.parentElement.innerText = oldVal);
    }
};

window.addOnboardingStatus = async () => {
    const newStatus = prompt("Enter new status option:");
    if (!newStatus || !newStatus.trim()) return;
    const trimmed = newStatus.trim();
    if (state.onboardingStatuses.includes(trimmed)) { showToast("Status already exists"); return; }
    state.onboardingStatuses.push(trimmed);
    try {
        await db.collection('settings').doc('table_config').set({ onboardingStatuses: state.onboardingStatuses }, { merge: true });
        showToast("Status added: " + trimmed);
        renderOnboardingTable();
    } catch(e) { showToast("Error saving status: " + e.message); }
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
let selectedColumnIndices = new Set();

window.openAddColumnModal = (context) => { 
    if (!canInsert() && !(context === 'accessControl' && state.userRole === 'Admin')) return showToast("Insert permission required"); 
    activeColumnContext = context; selectedColumnIndices.clear();
    const modal = document.getElementById('add-column-modal'); modal.style.display = 'flex'; 
    document.getElementById('new-col-name').value = ''; document.getElementById('new-col-name').focus(); 
    let manageSection = document.getElementById('column-manage-section'); 
    if (!manageSection) { 
        manageSection = document.createElement('div'); manageSection.id = 'column-manage-section'; 
        manageSection.style.marginTop = '20px'; manageSection.style.paddingTop = '15px'; manageSection.style.borderTop = '1px solid var(--glass-border)'; 
        const actions = modal.querySelector('.modal-actions'); modal.querySelector('.glass-panel').insertBefore(manageSection, actions); 
    } 
    renderColumnManageSection(context);
};

function getBuiltinColumnNames(context) {
    const map = {
        candidates: ['#', 'First Name', 'Last Name', 'Mobile', 'WhatsApp', 'Tech', 'Recruiter', 'Status', 'Assigned', 'Gmail', 'LinkedIn', 'Resume', 'Track', 'Comments'],
        employees: ['#', 'First Name', 'Last Name', 'Designation', 'Work Mobile', 'Personal Mobile', 'Official Email', 'Personal Email', 'DOB', 'Track'],
        onboarding: ['#', 'First Name', 'Last Name', 'Status', 'DOB', 'Tech', 'Recruiter'],
        placements: ['#', 'First Name', 'Last Name', 'Tech', 'Location', 'Contract', 'Assigned'],
        hub: ['#', 'Candidate Name', 'Recruiter', 'Technology', 'Submission', 'Screenings', 'Interview', 'Date'],
        accessControl: ['#', 'Name', 'Email', 'Role', 'Access Level', 'Read', 'Edit', 'Insert/Delete', 'Status', 'Action']
    };
    return map[context] || [];
}

function renderColumnManageSection(context) {
    const manageSection = document.getElementById('column-manage-section');
    if (!manageSection || !context) return;
    const currentCols = state.customColumns[context] || [];
    const hidden = state.hiddenColumns?.[context] || [];

    let html = '';

    if (hidden.length > 0) {
        html += `
            <div style="margin-bottom:14px;">
              <h4 style="color:var(--text-muted); font-size:0.8rem; margin:0 0 8px;">HIDDEN COLUMNS (restore)</h4>
              <div style="max-height:110px; overflow-y:auto;" class="custom-scroll">
                ${hidden.map(name => `
                  <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); padding:8px 10px; margin-bottom:5px; border-radius:4px;">
                    <span style="font-size:0.85rem; color:var(--text-main);">${name}</span>
                    <button class="btn-icon-small" style="color:var(--success);" title="Restore column" onclick="event.stopPropagation(); restoreTableColumn('${context}', '${String(name).replace(/'/g, "\\'")}')">
                      <i class="fa-solid fa-eye"></i>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>`;
    }

    if (currentCols.length > 0) {
        const allSelected = selectedColumnIndices.size === currentCols.length;
        html += `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <h4 style="color:var(--text-muted); font-size:0.8rem; margin:0;">MANAGE CUSTOM COLUMNS</h4>
                <label style="display:flex; align-items:center; gap:6px; font-size:0.75rem; color:var(--text-muted); cursor:pointer;">
                    <input type="checkbox" id="col-select-all" onchange="toggleSelectAllColumns(this)" ${allSelected ? 'checked' : ''} style="width:14px; height:14px;">
                    Select All
                </label>
            </div>
            <div style="max-height:120px; overflow-y:auto; padding-right:5px;" class="custom-scroll">
                ${currentCols.map((col, idx) => {
                    const isSel = selectedColumnIndices.has(idx);
                    return `<div class="col-manage-row ${isSel ? 'col-manage-selected' : ''}" onclick="toggleColumnSelection(${idx})" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 10px; margin-bottom:5px; border-radius:4px; cursor:pointer; ${isSel ? 'border:1px solid var(--primary); background:rgba(11,174,181,0.1);' : ''}">
                        <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text-main); cursor:pointer; flex:1;">
                            <input type="checkbox" ${isSel ? 'checked' : ''} onchange="event.stopPropagation(); toggleColumnSelection(${idx})" style="width:14px; height:14px; pointer-events:none;">
                            ${col.name}
                        </label>
                        <i class="fa-solid fa-trash text-danger" style="cursor:pointer; padding:4px;" onclick="event.stopPropagation(); deleteCustomColumn('${context}', ${idx})" title="Delete Column"></i>
                    </div>`;
                }).join('')}
            </div>
            <div id="bulk-delete-bar" style="margin-top:10px; display:${selectedColumnIndices.size > 0 ? 'flex' : 'none'}; justify-content:space-between; align-items:center; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:8px 12px; border-radius:6px;">
                <span style="font-size:0.8rem; color:var(--danger);"><i class="fa-solid fa-circle-info"></i> <span id="bulk-delete-count">${selectedColumnIndices.size}</span> column(s) selected</span>
                <button class="btn-text-danger" style="padding:4px 12px; font-size:0.8rem; border-radius:4px;" onclick="deleteSelectedColumns('${context}')"><i class="fa-solid fa-trash"></i> Delete Selected</button>
            </div>
        `;
    } else if (hidden.length === 0) {
        html += '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:10px;">No custom columns yet. Add one above. Use the trash icon on any column header to hide/delete it.</p>';
    }

    const builtins = getBuiltinColumnNames(context).filter(n => !hidden.includes(n));
    if (builtins.length) {
        html += `
          <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--glass-border);">
            <h4 style="color:var(--text-muted); font-size:0.8rem; margin:0 0 8px;">HIDE BUILT-IN COLUMNS</h4>
            <div style="display:flex; flex-wrap:wrap; gap:6px; max-height:100px; overflow-y:auto;" class="custom-scroll">
              ${builtins.map(name => `
                <button type="button" class="btn-icon-small" style="border:1px solid var(--glass-border); border-radius:999px; padding:4px 10px; font-size:0.75rem; color:var(--text-muted);"
                  title="Hide ${name}"
                  onclick="event.stopPropagation(); deleteTableColumn('${context}', '${String(name).replace(/'/g, "\\'")}')">
                  <i class="fa-solid fa-eye-slash" style="margin-right:4px;"></i>${name}
                </button>
              `).join('')}
            </div>
          </div>`;
    }

    manageSection.innerHTML = html;
    manageSection.style.display = 'block';
}

window.toggleColumnSelection = (idx) => { if (selectedColumnIndices.has(idx)) selectedColumnIndices.delete(idx); else selectedColumnIndices.add(idx); renderColumnManageSection(activeColumnContext); };
window.toggleSelectAllColumns = (box) => { const currentCols = state.customColumns[activeColumnContext] || []; if (box.checked) { currentCols.forEach((_, idx) => selectedColumnIndices.add(idx)); } else { selectedColumnIndices.clear(); } renderColumnManageSection(activeColumnContext); };
window.deleteSelectedColumns = async (context) => { if (!canDelete()) return showToast("Delete permission required"); if (selectedColumnIndices.size === 0) return; if (!confirm(`Delete ${selectedColumnIndices.size} selected column(s)? (Data will remain in database but be hidden)`)) return; const sorted = Array.from(selectedColumnIndices).sort((a, b) => b - a); sorted.forEach(idx => state.customColumns[context].splice(idx, 1)); selectedColumnIndices.clear(); await saveAndRefreshColumns(context, `${sorted.length} Column(s) Removed`); };

window.closeColumnModal = () => { document.getElementById('add-column-modal').style.display = 'none'; document.getElementById('new-col-name').value = ''; activeColumnContext = null; selectedColumnIndices.clear(); };
window.executeAddColumn = async () => { 
    if (!canInsert()) return showToast("Insert permission required"); 
    const name = document.getElementById('new-col-name').value.trim(); const type = document.getElementById('new-col-type').value; 
    if (!name) { showToast("Enter a column name"); document.getElementById('new-col-name').focus(); return; }
    if (!activeColumnContext) return; 
    const existingCols = state.customColumns[activeColumnContext] || [];
    const isDuplicate = existingCols.some(col => col.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) { showToast(`Column "${name}" already exists`); document.getElementById('new-col-name').focus(); document.getElementById('new-col-name').select(); return; }
    const key = name.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase()); 
    if (!state.customColumns[activeColumnContext]) state.customColumns[activeColumnContext] = []; 
    state.customColumns[activeColumnContext].push({ name, key, type }); 
    await saveAndRefreshColumns(activeColumnContext, `Column "${name}" Added Successfully`); 
    document.getElementById('new-col-name').value = ''; document.getElementById('new-col-type').value = 'text'; closeColumnModal();
};

window.deleteCustomColumn = async (context, index) => { 
    if (!canDelete()) return showToast("Delete permission required"); 
    if (!confirm("Delete this column? (Data will remain in database but be hidden)")) return; 
    state.customColumns[context].splice(index, 1); selectedColumnIndices.delete(index);
    const adjusted = new Set(); selectedColumnIndices.forEach(idx => { if (idx > index) adjusted.add(idx - 1); else if (idx < index) adjusted.add(idx); }); selectedColumnIndices = adjusted;
    await saveAndRefreshColumns(context, "Column Removed"); 
};

async function saveAndRefreshColumns(context, msg) { 
    try { await db.collection('settings').doc('table_config').set({ [context]: state.customColumns[context] }, { merge: true }); showToast(msg); refreshViewForType(context); renderColumnManageSection(context); await logActivity('edit', 'settings', 'table_config', `Column config updated for ${context}: ${msg}`); } 
    catch(e) { console.error(e); showToast("Error saving configuration"); } 
}

window.toggleSelect = (id, type) => { 
    if(!state.selection[type]) state.selection[type] = new Set(); 
    if(state.selection[type].has(id)) state.selection[type].delete(id); 
    else state.selection[type].add(id); 
    updateSelectButtons(type); 
    refreshViewForType(type); 
};

window.toggleSelectAll = (type, box) => {
    let data = [];
    if (type === 'cand') { data = getFilteredData(state.candidates, state.filters); } 
    else if (type === 'emp') { data = getRoleFilteredData(state.employees, 'employees'); } 
    else if (type === 'onb') { data = getRoleFilteredData(state.onboarding, 'onboarding'); } 
    else if (type === 'hub') {
        let hubData = getMergedHubData(); 
        if (state.hubFilters && state.hubFilters.text) hubData = hubData.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech || '')).toLowerCase().includes(state.hubFilters.text));
        const { start, end } = state.hub.range;
        const isInRange = (e) => { const dateStr = e.date || e; if (!dateStr) return false; if (state.hub.filterType === 'daily') return dateStr === state.hub.date; const [y, m, d] = dateStr.split('-').map(Number); const entryTime = new Date(y, m - 1, d, 12, 0, 0).getTime(); return entryTime >= start && entryTime <= end; };
        const isCreatedInRange = (c) => { if (!c.createdAt) return false; const createdDateStr = new Date(c.createdAt - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]; if (state.hub.filterType === 'daily') return createdDateStr === state.hub.date; return c.createdAt >= start && c.createdAt <= end; };
        data = hubData.filter(c => !c.hiddenFromHub && ((c.isHubOnly && isCreatedInRange(c)) || (c.submissionLog || []).some(isInRange) || (c.screeningLog || []).some(isInRange) || (c.interviewLog || []).some(isInRange)));
    } else if (type === 'place') {
        const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value;
        data = getRoleFilteredData(state.placements, 'placements').filter(c => { if (!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); });
    }
    if (!state.selection[type]) state.selection[type] = new Set();
    if (box.checked) { data.forEach(i => state.selection[type].add(i.id)); } else { state.selection[type].clear(); }
    updateSelectButtons(type); refreshViewForType(type);
};

function refreshViewForType(type) { 
    if(type==='cand' || type==='candidates') renderCandidateTable(); 
    else if(type==='emp' || type==='employees') renderEmployeeTable(); 
    else if(type==='onb' || type==='onboarding') renderOnboardingTable(); 
    else if(type==='hub') renderHubTable(); 
    else if(type==='place' || type==='placements') renderPlacementTable(); 
    else if(type==='accessControl' || type==='access-control' || type==='access') renderAccessControlTable(); 
}

function updateSelectButtons(type) { 
    let btn, countSpan; 
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); } 
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); } 
    else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); } 
    else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); } 
    else if(type === 'hub') { btn = document.getElementById('btn-delete-hub'); countSpan = document.getElementById('hub-selected-count'); } 
    
    if (!btn) return; 
    if (state.selection[type] && state.selection[type].size > 0 && canDelete()) { btn.style.display = 'inline-flex'; btn.style.opacity = '1'; if(countSpan) countSpan.innerText = state.selection[type].size; } 
    else { btn.style.display = 'none'; if(countSpan) countSpan.innerText = '0'; } 
}

window.openDeleteModal = (type) => { 
    if (!canDelete()) return showToast("Delete permission required");
    state.pendingDelete.type = type; const count = state.selection[type]?.size || 0;
    document.getElementById('delete-modal').style.display = 'flex'; document.getElementById('del-count').innerText = count;
    const msgEl = document.getElementById('delete-modal-message');
    if (msgEl) { if (type === 'hub') { msgEl.innerHTML = `Remove <span id="del-count" class="text-danger" style="font-weight: 800; font-size: 1.2rem;">${count}</span> record(s) from Candidate Hub only?<br><span style="display:block; margin-top:8px; font-size:0.85rem;">Master Candidates table data will stay intact.</span>`; } else { msgEl.innerHTML = `Permanently delete <span id="del-count" class="text-danger" style="font-weight: 800; font-size: 1.2rem;">${count}</span> items?`; } }
};
window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };

window.removeFromCandidateHub = async (ids, options = {}) => {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (!uniqueIds.length) return { updated: 0, hubDocsRemoved: 0 };
    
    const batch = db.batch(); 
    let updated = 0; 
    let hubDocsRemoved = 0;
    
    uniqueIds.forEach(id => {
        const isHubOnly = (state.hubData || []).some(h => h.id === id) && !(state.candidates || []).some(c => c.id === id);
        
        if (isHubOnly) { 
            batch.delete(db.collection('hub').doc(id)); 
            hubDocsRemoved += 1; 
            updated += 1; 
        } 
        else {
            const candRef = db.collection('candidates').doc(id); 
            batch.set(candRef, { 
                hiddenFromHub: true, 
                removedFromHubAt: new Date().toISOString(), 
                removedFromHubBy: state.currentUserName || 'Unknown',
                submissionLog: [],
                screeningLog: [],
                interviewLog: []
            }, { merge: true }); 
            
            updated += 1;
            
            const hubRef = db.collection('hub').doc(id); 
            batch.delete(hubRef); 
            hubDocsRemoved += 1;
        }
    });
    
    await batch.commit();
    
    state.hubData = (state.hubData || []).filter(h => !uniqueIds.includes(h.id));
    uniqueIds.forEach(id => { 
        const idx = (state.candidates || []).findIndex(c => c.id === id); 
        if (idx >= 0) {
            state.candidates[idx] = { 
                ...state.candidates[idx], 
                hiddenFromHub: true,
                submissionLog: [],
                screeningLog: [],
                interviewLog: []
            }; 
        } 
    });

    if (window.updateHubStats) {
        updateHubStats(state.hub.filterType, state.hub.date);
    }
    
    return { updated, hubDocsRemoved };
};

window.executeDelete = async () => {
    const type = state.pendingDelete.type; closeDeleteModal(); if (!type) return;
    const ids = Array.from(state.selection[type] || []); if (!ids.length) return;
    state.selection[type].clear(); updateSelectButtons(type);
    const masterBox = document.getElementById(`select-all-${type}`); if (masterBox) masterBox.checked = false;

    if (type === 'hub') {
        refreshViewForType(type);
        try {
            const snapshots = ids.map(id => {
                const hubDoc = (state.hubData || []).find(h => h.id === id); const candDoc = (state.candidates || []).find(c => c.id === id);
                if (hubDoc && !candDoc) return { id, kind: 'hub_only', hubData: { ...hubDoc }, data: { ...hubDoc } };
                return { id, kind: hubDoc ? 'both' : 'master', data: candDoc ? { ...candDoc } : null, hubData: hubDoc ? { ...hubDoc } : null, wasHidden: !!(candDoc && candDoc.hiddenFromHub) };
            });
            pushHistoryEntry({ type: 'hub_remove', collection: 'hub', uiType: 'hub', records: snapshots, label: `Remove ${ids.length} from Candidate Hub` });
            
            const result = await window.removeFromCandidateHub(ids, { skipHistory: true });
            
            ids.forEach(id => logActivity('delete', 'hub', id, 'Removed from Candidate Hub only (master candidate preserved)'));
            showToast(result.updated === 1 ? 'Removed from Candidate Hub (candidate preserved) — Ctrl+Z to undo' : `Removed ${result.updated} records from Candidate Hub — Ctrl+Z to undo`);
            refreshViewForType('hub');
        } catch (e) { 
            console.error('Candidate Hub deletion error:', e); 
            showToast('Hub remove failed: ' + e.message); 
        }
        return;
    }

    const col = (type === 'cand') ? 'candidates' : (type === 'place' ? 'placements' : (type === 'emp' ? 'employees' : 'onboarding'));
    const sourceList = state[col] || []; const records = ids.map(id => { const found = sourceList.find(x => x.id === id); return { id, data: found ? { ...found } : { id } }; });
    pushHistoryEntry({ type: 'delete_records', collection: col, uiType: type, records, label: `Delete ${ids.length} ${col} record(s)` });
    refreshViewForType(type);
    const batch = db.batch(); ids.forEach(id => batch.delete(db.collection(col).doc(id)));
    try { 
        await batch.commit(); 
        showToast('Deleted successfully — Ctrl+Z to undo'); 
        ids.forEach(id => logActivity('delete', col, id, 'Record deleted')); 
    } catch (e) { 
        console.error('Background deletion error:', e); 
        showToast('Delete Failed: ' + e.message); 
    }
};

window.moveToPlacements = async (id) => {
    if (!canEdit()) return showToast("Edit permission required"); 
    const cand = state.candidates.find(c => c.id === id); if(!cand) return;
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show');
    const existingPlace = state.placements.find(p => p.id === id); if (existingPlace) return showToast("Already in Placements"); 
    if (!confirm(`Move "${cand.first} ${cand.last}" to Placements?\n\nThis will remove them from Candidates and add them to Placements. All data will be preserved.`)) return;
    try {
        const batch = db.batch(); const { id: _omit, ...candData } = cand;
        const newPlaceData = { ...candData, status: 'Placed', assigned: new Date().toISOString().split('T')[0], transferHistory: firebase.firestore.FieldValue.arrayUnion({ action: 'moved_to_placements', by: state.currentUserName || 'Unknown', timestamp: new Date().toISOString() }) };
        batch.set(db.collection('placements').doc(id), newPlaceData); batch.delete(db.collection('candidates').doc(id)); await batch.commit();
        pushHistoryEntry({ type: 'transfer', id, fromCollection: 'candidates', toCollection: 'placements', fromData: cand, toData: newPlaceData, label: `Move ${cand.first || ''} to Placements` });
        await logActivity('transfer', 'candidates→placements', id, `Moved "${cand.first} ${cand.last}" to Placements`);
        showToast(`Moved "${cand.first} ${cand.last}" to Placements — Ctrl+Z to undo`);
    } catch(e) { console.error("Error moving to placements:", e); showToast("Move failed"); }
};

window.moveBackToCandidates = async (id) => {
    if (!canEdit()) return showToast("Edit permission required"); 
    const placement = state.placements.find(p => p.id === id); if(!placement) return;
    const existingCand = state.candidates.find(c => c.id === id); if (existingCand) return showToast("Already in Candidates"); 
    if (!confirm(`Move "${placement.first} ${placement.last}" back to Candidates?\n\nThis will remove them from Placements and add them back to Candidates. All data will be preserved.`)) return;
    try {
        const batch = db.batch(); const { id: _omit, ...placeData } = placement;
        const newCandData = { ...placeData, status: 'Active', transferHistory: firebase.firestore.FieldValue.arrayUnion({ action: 'moved_back_to_candidates', by: state.currentUserName || 'Unknown', timestamp: new Date().toISOString() }) };
        batch.set(db.collection('candidates').doc(id), newCandData); batch.delete(db.collection('placements').doc(id)); await batch.commit();
        pushHistoryEntry({ type: 'transfer', id, fromCollection: 'placements', toCollection: 'candidates', fromData: placement, toData: newCandData, label: `Move ${placement.first || ''} back to Candidates` });
        await logActivity('transfer', 'placements→candidates', id, `Moved "${placement.first} ${placement.last}" back to Candidates`);
        showToast(`Moved "${placement.first} ${placement.last}" back to Candidates — Ctrl+Z to undo`);
    } catch(e) { console.error("Error moving back to candidates:", e); showToast("Move failed"); }
};

window.deletePlacement = async (id) => { if (!canDelete()) return showToast("Delete permission required"); if(confirm("Remove this placement?")) { await db.collection('placements').doc(id).delete(); await logActivity('delete', 'placements', id, 'Placement deleted'); showToast("Placement removed"); } };


/* ==========================================================================
   11b. URL CELL MANAGEMENT
   ========================================================================== */
function isValidUrl(url) { if (!url) return false; try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } }
function normalizeUrlInput(raw) { let url = (raw || '').trim(); if (!url) return ''; if (!/^https?:\/\//i.test(url)) url = 'https://' + url; return url; }
function escapeHtmlAttr(str) { return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderUrlCell(id, field, col, value, iconClass, emptyIconClass) {
    const val = value || ''; const hasUrl = !!val; const safeVal = escapeHtmlAttr(val); const title = hasUrl ? safeVal : 'Add URL';
    const contentIcon = hasUrl ? `<i class="${iconClass || 'fa-solid fa-link text-cyan'}"></i>` : `<i class="${emptyIconClass || 'fa-solid fa-plus icon-empty'}"></i>`;
    const openBtn = hasUrl ? `<button type="button" class="url-open-btn" title="${safeVal}" onclick="openUrlFromCell('${id}', '${field}', '${col}', event)" aria-label="Open link"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` : '';
    return `<td class="url-cell" style="text-align:center;" tabindex="0" data-field="${field}" data-id="${id}" data-collection="${col}" data-url-type="true" title="${title}" onclick="selectUrlCell(this, event)" ondblclick="startUrlEdit('${id}', '${field}', '${col}', this, event)" onkeydown="handleUrlCellKeydown(event, '${id}', '${field}', '${col}', this)">
        <div class="url-cell-inner"><span class="url-cell-display">${contentIcon}<span class="url-placeholder">${hasUrl ? '' : 'Add URL'}</span></span>${openBtn}<span class="url-save-status" aria-live="polite"></span></div>
    </td>`;
}

window.selectUrlCell = (el, event) => {
    if (!el) return; if (event && event.target.closest('.url-open-btn')) return; if (el.querySelector('input.url-input-active')) return;
    document.querySelectorAll('.url-cell.selected-url-cell').forEach(c => c.classList.remove('selected-url-cell'));
    el.classList.add('selected-url-cell'); el.focus({ preventScroll: true });
};

window.openUrlFromCell = (id, field, col, event) => {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    const td = event && event.target.closest('td'); if (td && td.querySelector('input.url-input-active')) return;
    const url = getOldValue(col, id, field) || '';
    if (!url) return showToast('No URL saved'); if (!isValidUrl(url)) return showToast('Invalid URL — please edit and fix it');
    window.open(url, '_blank', 'noopener,noreferrer');
};

window.startUrlEdit = (id, field, col, el, event) => {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (!canEdit() && !canInsert()) return showToast('Edit permission required'); 
    const cell = el.closest ? el.closest('td') || el : el; if (!cell || cell.querySelector('input.url-input-active')) return;

    const oldVal = getOldValue(col, id, field) || ''; const statusEl = cell.querySelector('.url-save-status');
    cell.classList.add('url-editing'); cell.classList.add('selected-url-cell');

    const input = document.createElement('input'); input.type = 'url'; input.className = 'url-input-active'; input.placeholder = 'https://...'; input.value = oldVal; input.setAttribute('data-old-value', oldVal); input.setAttribute('spellcheck', 'false');
    const inner = cell.querySelector('.url-cell-inner') || cell; const display = cell.querySelector('.url-cell-display'); const openBtn = cell.querySelector('.url-open-btn');
    if (display) display.style.display = 'none'; if (openBtn) openBtn.style.display = 'none'; if (statusEl) statusEl.textContent = '';
    inner.insertBefore(input, statusEl || null); input.focus(); input.select();

    let cancelled = false; let saving = false;
    const restore = () => { cell.classList.remove('url-editing'); if (display) display.style.display = ''; if (openBtn) openBtn.style.display = ''; if (input.parentNode) input.remove(); };
    const cancel = () => { cancelled = true; restore(); cell.focus({ preventScroll: true }); };
    const save = async () => {
        if (cancelled || saving) return;
        let newVal = normalizeUrlInput(input.value);
        if (newVal && !isValidUrl(newVal)) { if (statusEl) statusEl.innerHTML = '<span class="url-status-error">Invalid URL</span>'; showToast('Invalid URL format'); input.focus(); input.select(); return; }
        if (newVal === oldVal) { restore(); refreshViewForType(col); return; }
        saving = true; if (statusEl) statusEl.innerHTML = '<span class="url-status-saving">Saving…</span>';
        try {
            pushToHistory(col, id, field, oldVal, newVal);
            const dbCol = (typeof resolveDbCollection === 'function') ? resolveDbCollection(col, id) : col;
            if (!newVal) { await db.collection(dbCol).doc(id).update({ [field]: firebase.firestore.FieldValue.delete() }); } else { await db.collection(dbCol).doc(id).update({ [field]: newVal }); }
            if (statusEl) statusEl.innerHTML = '<span class="url-status-saved">Saved</span>';
            showToast(newVal ? 'URL saved successfully' : 'URL cleared'); logActivity('edit', col, id, `URL field "${field}" changed from "${oldVal}" to "${newVal}"`).catch(() => {});
            setTimeout(() => refreshViewForType(col), 50);
        } catch (e) { console.error(e); if (statusEl) statusEl.innerHTML = '<span class="url-status-error">Error</span>'; showToast('Failed to save URL: ' + (e.message || '')); input.focus(); saving = false; }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); refreshViewForType(col); } else if (e.key === 'Tab') { e.preventDefault(); save().then(() => {}); } e.stopPropagation(); });
    input.addEventListener('blur', () => { setTimeout(() => { if (!cancelled && document.activeElement !== input) save(); }, 120); }); input.addEventListener('click', (e) => e.stopPropagation()); input.addEventListener('dblclick', (e) => e.stopPropagation());
};

window.handleUrlCellKeydown = (event, id, field, col, el) => {
    if (!el || el.querySelector('input.url-input-active')) return;
    if (event.key === 'F2' || event.key === 'Enter') { event.preventDefault(); startUrlEdit(id, field, col, el, event); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && canEdit()) {
        event.preventDefault(); const oldVal = getOldValue(col, id, field) || ''; if (!oldVal) return; if (!confirm('Delete this URL?')) return;
        const dbCol = (typeof resolveDbCollection === 'function') ? resolveDbCollection(col, id) : col;
        db.collection(dbCol).doc(id).update({ [field]: firebase.firestore.FieldValue.delete() }).then(() => { showToast('URL deleted successfully'); logActivity('edit', col, id, `URL field "${field}" deleted (was: ${oldVal})`).catch(() => {}); }).catch(e => showToast('Failed to delete URL'));
        return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        const oldVal = getOldValue(col, id, field) || ''; if (!oldVal) return; event.preventDefault();
        navigator.clipboard.writeText(oldVal).then(() => showToast('URL copied to clipboard')).catch(() => { const ta = document.createElement('textarea'); ta.value = oldVal; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('URL copied to clipboard'); });
        return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && (canEdit() || canInsert())) {
        event.preventDefault();
        navigator.clipboard.readText().then(text => {
            let url = normalizeUrlInput(text); if (!url) return showToast('Clipboard is empty'); if (!isValidUrl(url)) return showToast('Invalid URL format');
            const oldVal = getOldValue(col, id, field) || ''; pushToHistory(col, id, field, oldVal, url);
            const dbCol = (typeof resolveDbCollection === 'function') ? resolveDbCollection(col, id) : col;
            db.collection(dbCol).doc(id).update({ [field]: url }).then(() => { showToast('URL pasted successfully'); logActivity('edit', col, id, `URL field "${field}" pasted: ${url}`).catch(() => {}); }).catch(e => showToast('Paste failed: ' + (e.message || '')));
        }).catch(() => { startUrlEdit(id, field, col, el, event); });
    }
};

window.urlCellContextMenu = (id, field, col, event) => { const cell = event && event.target && event.target.closest('td'); if (cell) selectUrlCell(cell, event); };

/* ==========================================================================
   12. GMAIL ENGINE
   ========================================================================== */
function explainGmailApiError(err) {
    const msg = String(err?.result?.error?.message || err?.message || err || '');
    const status = err?.status || err?.result?.error?.code || err?.error;
    const lower = msg.toLowerCase();
    if (lower.includes('access_denied') || lower.includes('popup_closed')) return 'Gmail sign-in was cancelled. Click Connect Gmail and approve access.';
    if (lower.includes('idpiframe_initialization_failed') || lower.includes('origin')) return 'OAuth origin not allowed. Add this site URL under Google Cloud → Credentials → OAuth Client → Authorized JavaScript origins.';
    if (lower.includes('gmail') && (lower.includes('has not been used') || lower.includes('disabled') || lower.includes('not been enabled') || status === 403)) return 'Gmail API is not enabled. Enable it in Google Cloud Console → APIs & Services → Library → Gmail API.';
    if (lower.includes('accessnotconfigured') || lower.includes('api key not valid') || lower.includes('api_key_invalid')) return 'Invalid API key / Gmail API not configured. Verify G_API_KEY and enable Gmail API.';
    if (lower.includes('redirect_uri_mismatch')) return 'OAuth redirect mismatch. Check Authorized JavaScript origins for this domain.';
    if (status === 401 || lower.includes('invalid_grant') || lower.includes('login required')) return 'Gmail session expired. Click Connect Gmail again.';
    return msg || 'Gmail API error. Verify OAuth client, API key, and that Gmail API is enabled.';
}

function loadGoogleScripts() {
    if (state.gmail._scriptsLoading) return;
    state.gmail._scriptsLoading = true;
    const s1 = document.createElement('script'); s1.src = 'https://apis.google.com/js/api.js'; s1.async = true;
    s1.onload = () => gapi.load('client', async () => {
        try { await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] });
            try { if (!gapi.client.gmail) await gapi.client.load('https://gmail.googleapis.com/$discovery/rest?version=v1'); } catch (loadErr) { console.error('Gmail discovery load failed:', loadErr); showToast(explainGmailApiError(loadErr)); }
            state.gmail.gapiInited = true; checkGmailAuth();
        } catch (e) { console.error('gapi.client.init failed:', e); showToast(explainGmailApiError(e)); }
    });
    s1.onerror = () => { showToast('Failed to load Google API script. Check network / CSP.'); }; document.body.appendChild(s1);

    const s2 = document.createElement('script'); s2.src = 'https://accounts.google.com/gsi/client'; s2.async = true;
    s2.onload = () => {
        try {
            state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: G_CLIENT_ID, scope: G_SCOPES,
                callback: (resp) => {
                    if (resp.error) { console.error('Gmail OAuth error:', resp); showToast(explainGmailApiError(resp)); updateGmailUI(false); return; }
                    updateGmailUI(true); renderGmailList('INBOX'); fetchGmailLabels(); startMailboxSync();
                    if (!state.gmail._syncTimer) state.gmail._syncTimer = setInterval(startMailboxSync, 5 * 60 * 1000);
                },
                error_callback: (err) => { console.error('Gmail OAuth error_callback:', err); showToast(explainGmailApiError(err)); }
            });
            state.gmail.gisInited = true; checkGmailAuth();
        } catch (e) { console.error('initTokenClient failed:', e); showToast(explainGmailApiError(e)); }
    };
    s2.onerror = () => { showToast('Failed to load Google Identity Services. Check network / CSP.'); }; document.body.appendChild(s2);
}

function checkGmailAuth() {
    try { if (!(state.gmail.gapiInited && state.gmail.gisInited)) return; const token = gapi.client.getToken && gapi.client.getToken(); if (token && token.access_token) { updateGmailUI(true); fetchGmailLabels(); startMailboxSync(); if (!state.gmail._syncTimer) { state.gmail._syncTimer = setInterval(startMailboxSync, 5 * 60 * 1000); } } else { updateGmailUI(false); } } catch (e) { console.warn('checkGmailAuth:', e); }
}
function updateGmailUI(isSignedIn) { const btnAuth = document.getElementById('btn-gmail-auth'); const btnSignout = document.getElementById('btn-gmail-signout'); if (btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'inline-flex'; if (btnSignout) btnSignout.style.display = isSignedIn ? 'inline-flex' : 'none'; }
function requestGmailAccess() { if (!state.gmail.tokenClient) { showToast('Gmail client still loading… try again in a second'); loadGoogleScripts(); return; } const hasToken = !!(gapi?.client?.getToken?.()?.access_token); state.gmail.tokenClient.requestAccessToken({ prompt: hasToken ? '' : 'consent' }); }

if (document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => requestGmailAccess();
if (document.getElementById('btn-gmail-signout')) { document.getElementById('btn-gmail-signout').onclick = () => { try { const t = gapi.client.getToken(); if (t) google.accounts.oauth2.revoke(t.access_token); gapi.client.setToken(''); } catch (_) {} updateGmailUI(false); const rows = document.getElementById('gmail-rows-container'); if (rows) rows.innerHTML = ''; showToast('Gmail disconnected'); }; }

function getHeader(headers, name) { const header = headers.find(h => h.name === name); return header ? header.value : ''; }
function parseMessageBody(payload) { 
    let bodyText = ''; let bodyHtml = ''; let attachments = []; 
    if (payload.body && payload.body.data) { const decoded = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/')); if (payload.mimeType === 'text/html') bodyHtml = decoded; else bodyText = decoded; } 
    if (payload.parts) { payload.parts.forEach(part => { if (part.filename && part.filename.length > 0) { attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId }); } else { const result = parseMessageBody(part); bodyText += result.text; bodyHtml += result.html; attachments = [...attachments, ...result.attachments]; } }); } 
    return { text: bodyText, html: bodyHtml, attachments: attachments }; 
}

async function startMailboxSync() { if (!state.user) return; const metadataRef = db.collection('sync_metadata').doc(state.user.uid); const metaDoc = await metadataRef.get(); if (!metaDoc.exists || !metaDoc.data().historyId) { await runFullSync(null); } else { const lastHistoryId = metaDoc.data().historyId; await runIncrementalSync(lastHistoryId); } }
async function runFullSync(pageToken) {
    try {
        if (!gapi?.client?.gmail) { showToast(explainGmailApiError({ message: 'Gmail API has not been enabled or discovery failed' })); return; }
        const res = await gapi.client.gmail.users.messages.list({ userId: 'me', maxResults: 20, pageToken: pageToken || undefined }); const messages = res.result.messages;
        if (messages && messages.length > 0) { await processMessageBatch(messages); if (!pageToken) { const firstMsgDetails = await gapi.client.gmail.users.messages.get({ userId: 'me', id: messages[0].id }); await db.collection('sync_metadata').doc(state.user.uid).set({ historyId: firstMsgDetails.result.historyId }, { merge: true }); } }
    } catch (e) { console.error('Full Sync Error:', e); showToast(explainGmailApiError(e)); }
}
async function runIncrementalSync(historyId) {
    try {
        if (!gapi?.client?.gmail) return;
        const res = await gapi.client.gmail.users.history.list({ userId: 'me', startHistoryId: historyId }); const history = res.result.history; if (!history || history.length === 0) return;
        let newMsgIds = []; history.forEach(record => { if (record.messagesAdded) record.messagesAdded.forEach(m => newMsgIds.push(m.message)); });
        if (newMsgIds.length > 0) { await processMessageBatch(newMsgIds); await db.collection('sync_metadata').doc(state.user.uid).set({ historyId: res.result.historyId }, { merge: true }); }
    } catch (e) {
        if (e.status === 404) { await runFullSync(null); return; } const msg = String(e?.message || '');
        if (e.status === 401 || e.status === 403 || msg.toLowerCase().includes('gmail')) { showToast(explainGmailApiError(e)); }
    }
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

window.fetchGmailLabels = async () => { if (!gapi.client.getToken()) return; try { const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' }); const allLabels = response.result.labels; const userLabels = allLabels.filter(l => l.type === 'user'); const fetchedLabels = userLabels.map(l => ({ name: l.name, id: l.id, color: (l.color && l.color.backgroundColor) ? l.color.backgroundColor : '#607d8b', type: 'api' })); if (fetchedLabels.length > 0) state.labels = fetchedLabels; renderLabels(); } catch (e) { console.error(e); } };
window.renderLabels = () => { const container = document.getElementById('dynamic-labels-container'); if(!container) return; container.innerHTML = ""; if(document.getElementById('manage-indicator')) document.getElementById('manage-indicator').style.display = 'none'; state.labels.forEach((l, index) => { const div = document.createElement('div'); div.className = 'label-item'; const isSub = l.name.includes('/'); const displayName = isSub ? l.name.split('/').pop() : l.name; const indent = isSub ? 'padding-left: 20px;' : ''; div.innerHTML = `<div class="label-left" style="${indent}" onclick="renderGmailList('${l.id || l.name}')"><span class="material-icons" style="color: ${l.color}; font-size:16px;">label</span><span id="label-text-${index}" class="label-text" title="${l.name}">${displayName}</span></div><div class="label-more-btn" id="btn-more-${index}" onclick="event.stopPropagation(); toggleLabelMenu(${index})"><span class="material-icons" style="font-size: 16px;">more_horiz</span></div><div id="label-menu-${index}" class="label-dropdown" onclick="event.stopPropagation()"><div style="font-size: 10px; color: grey; padding-left: 8px;">LABEL COLOR</div><div class="label-color-grid"><div class="color-swatch" style="background:#e91e63" onclick="updateLabelColor(${index}, '#e91e63')"></div><div class="color-swatch" style="background:#9c27b0" onclick="updateLabelColor(${index}, '#9c27b0')"></div><div class="color-swatch" style="background:#2196f3" onclick="updateLabelColor(${index}, '#2196f3')"></div><div class="color-swatch" style="background:#00bcd4" onclick="updateLabelColor(${index}, '#00bcd4')"></div><div class="color-swatch" style="background:#4caf50" onclick="updateLabelColor(${index}, '#4caf50')"></div><div class="color-swatch" style="background:#ff9800" onclick="updateLabelColor(${index}, '#ff9800')"></div><div class="color-swatch" style="background:#f44336" onclick="updateLabelColor(${index}, '#f44336')"></div><div class="color-swatch" style="background:#607d8b" onclick="updateLabelColor(${index}, '#607d8b')"></div><label class="color-swatch custom-add" title="Custom Color"><input type="color" style="opacity:0; width:100%; height:100%; cursor:pointer;" onchange="updateLabelColor(${index}, this.value)"><i class="fa-solid fa-plus"></i></label></div><div class="label-menu-item" onclick="triggerLabelEdit(${index})"><i class="fa-solid fa-pen"></i> Edit Name</div><div class="label-menu-item" onclick="triggerSubLabel(${index})"><i class="fa-solid fa-code-branch"></i> Add Sub-label</div><div class="label-menu-item danger" onclick="deleteLabel(${index})"><i class="fa-solid fa-trash"></i> Remove Label</div></div>`; container.appendChild(div); }); };
window.toggleLabelMenu = (index) => { document.querySelectorAll('.label-dropdown').forEach(el => el.classList.remove('show')); document.querySelectorAll('.label-more-btn').forEach(el => el.classList.remove('active')); const menu = document.getElementById(`label-menu-${index}`); const btn = document.getElementById(`btn-more-${index}`); if(menu) { menu.classList.toggle('show'); if(menu.classList.contains('show')) btn.classList.add('active'); } const closeFn = (e) => { if(!e.target.closest('.label-item')) { if(menu) menu.classList.remove('show'); if(btn) btn.classList.remove('active'); document.removeEventListener('click', closeFn); } }; setTimeout(() => document.addEventListener('click', closeFn), 0); };
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
    let logs = candidate.submissionLog || []; logs.push({ date: getLocalDateString(), subject: subject, type: 'Imported Email', tech: candidate.tech || 'General', recruiter: state.currentUserName, note: `Imported from: ${senderText}`, timestamp: Date.now() }); 
    await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs, hiddenFromHub: false }); showToast(`Synced to ${candidate.first} ${candidate.last}`); 
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
        if(candidate) { let logs = candidate.submissionLog || []; logs.push({ date: getLocalDateString(), subject: subject, type: 'Outbound Email', tech: candidate.tech||'General', recruiter: state.currentUserName, timestamp: Date.now() }); await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs, hiddenFromHub: false }); showToast("Logged to Hub"); } 
        document.getElementById('compose-to').value = ''; document.getElementById('compose-subject').value = ''; document.getElementById('compose-message').value = ''; 
    } catch (err) { showToast("Send Failed: " + err.message); } finally { sendBtn.innerHTML = originalText; sendBtn.disabled = false; } 
};

/* ==========================================================================
   FIRST NAME CLICK & DIRECT HUB ACTIVITY HANDLERS
   ========================================================================== */
let currentHubPopover = null;

window.handleFirstNameClick = function(event, id, col) {
    if (event.detail > 1) return; // Prevent single click from running on double click
    showHubLogPopover(event, id, col, event.currentTarget);
};

window.handleFirstNameDblClick = function(event, id, col) {
    const cell = event.currentTarget;
    removeHubLogPopover();
    if (typeof removeGlobalContextMenu === 'function') removeGlobalContextMenu();
    inlineEdit(id, 'first', col, cell);
};

window.showHubLogPopover = function(event, id, col, cellElement) {
    if (typeof removeGlobalContextMenu === 'function') removeGlobalContextMenu();
    removeHubLogPopover();

    const popover = document.createElement('div');
    popover.className = 'quick-actions-popover modern-popover';
    popover.style.position = 'absolute'; 
    popover.style.zIndex = '10000'; // Max z-index to stay above everything
    
    popover.innerHTML = `
        <div class="popover-header">
            <span>QUICK ACTIONS</span>
            <i class="fa-solid fa-xmark popover-close" onclick="removeHubLogPopover()"></i>
        </div>
        <div class="quick-action-btn" id="pop-sub-${id}"><i class="fa-solid fa-paper-plane text-cyan"></i> Add Submission</div>
        <div class="quick-action-btn" id="pop-scr-${id}"><i class="fa-solid fa-user-clock text-gold"></i> Add Screening</div>
        <div class="quick-action-btn" id="pop-int-${id}"><i class="fa-solid fa-headset text-purple"></i> Add Interview</div>
    `;
    
    popover.querySelector(`#pop-sub-${id}`).onclick = () => { addHubLogFromTable(id, 'submission'); };
    popover.querySelector(`#pop-scr-${id}`).onclick = () => { addHubLogFromTable(id, 'screening'); };
    popover.querySelector(`#pop-int-${id}`).onclick = () => { addHubLogFromTable(id, 'interview'); };
    
    // Append to body so it escapes all table overflow restrictions
    document.body.appendChild(popover);
    currentHubPopover = popover;

    // --- Static Positioning ---
    const rect = cellElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    let top = rect.top + window.scrollY + (rect.height / 2) - (popoverRect.height / 2);
    let left = rect.right + window.scrollX + 12;

    if (left + popoverRect.width > window.innerWidth + window.scrollX) {
        left = rect.left + window.scrollX - popoverRect.width - 12;
        popover.style.transformOrigin = 'right center';
    }

    if (top + popoverRect.height > window.innerHeight + window.scrollY) {
        top = window.innerHeight + window.scrollY - popoverRect.height - 10;
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';

    // --- UX Fix: Close immediately on scroll ---
    const tableWrapper = cellElement.closest('.table-wrapper') || cellElement.closest('.ac-table-wrapper');
    
    // Slight timeout prevents the click event from triggering an immediate close
    setTimeout(() => {
        if (tableWrapper) tableWrapper.addEventListener('scroll', removeHubLogPopover, { passive: true });
        window.addEventListener('scroll', removeHubLogPopover, { passive: true });
        window.addEventListener('resize', removeHubLogPopover, { passive: true });
        document.addEventListener('click', closeHubPopoverOnOutside);
        
        currentHubPopover._trackedWrapper = tableWrapper;
    }, 50);
}

window.closeHubPopoverOnOutside = function(e) {
    if (!currentHubPopover || currentHubPopover.contains(e.target)) return;
    removeHubLogPopover();
}

window.removeHubLogPopover = function() {
    if (currentHubPopover) {
        // Clean up listeners
        if (currentHubPopover._trackedWrapper) {
            currentHubPopover._trackedWrapper.removeEventListener('scroll', removeHubLogPopover);
        }
        window.removeEventListener('scroll', removeHubLogPopover);
        window.removeEventListener('resize', removeHubLogPopover);
        document.removeEventListener('click', closeHubPopoverOnOutside);

        currentHubPopover.remove();
        currentHubPopover = null;
    }
}

/* ==========================================================================
   18. UNIFIED CONTEXT MENU (for all tables)
   ========================================================================== */
let globalContextMenu = null;

const CONTEXT_TABLES = [
    { tableId: 'candidates-table', collection: 'candidates' },
    { tableId: 'employee-table', collection: 'employees' },
    { tableId: 'onboarding-table', collection: 'onboarding' },
    { tableId: 'placement-table', collection: 'placements' },
    { tableId: 'hub-table', collection: 'candidates' }
];

function attachAllContextMenus() {
    CONTEXT_TABLES.forEach(({ tableId, collection }) => {
        const table = document.getElementById(tableId);
        if (!table) return;
        if (table._ctxHandler) table.removeEventListener('contextmenu', table._ctxHandler);
        table._ctxHandler = (e) => handleGlobalContextMenu(e, collection, tableId);
        table.addEventListener('contextmenu', table._ctxHandler);
    });
}

function handleGlobalContextMenu(e, collection, tableId) {
    const td = e.target.closest('td');
    const th = e.target.closest('th');
    if (!td && !th) return;
    e.preventDefault();
    e.stopPropagation();
    removeGlobalContextMenu();
    if (td) handleCellContextMenu(e, td, collection, tableId);
    else if (th) handleColumnHeaderContextMenu(e, th, collection);
}

function handleCellContextMenu(e, td, collection, tableId) {
    const row = td.closest('tr');
    const id = row?.dataset?.id;
    if (!id) return;
    const field = td.dataset?.field || null;
    let value = td.innerText.trim();
    const input = td.querySelector('input, select');
    if (input) value = input.value;
    const isUrlField = field && isCellUrlField(field, collection);
    const isEmail = field && ['officialEmail', 'personalEmail'].includes(field);
    const menu = createMenu(e.clientX, e.clientY);
    
    if (isUrlField || isEmail) {
        addMenuItem(menu, 'fa-solid fa-arrow-up-right-from-square', isEmail ? 'Open Email' : 'Open Link', () => {
            if (value) {
                if (isEmail) window.location.href = `mailto:${value}`;
                else { let url = value; if (!/^https?:\/\//i.test(url)) url = 'https://' + url; window.open(url, '_blank'); }
            } else showToast('Nothing to open');
        }, !value);
        addMenuItem(menu, 'fa-solid fa-copy', 'Copy', async () => {
            if (value) { await navigator.clipboard.writeText(value); showToast('Copied'); } else showToast('Nothing to copy');
        }, !value);
        addMenuItem(menu, 'fa-solid fa-paste', isEmail ? 'Paste Email' : 'Paste URL', async () => {
            let pasted = '';
            try { pasted = await navigator.clipboard.readText(); } catch { pasted = prompt(isEmail ? 'Enter email:' : 'Enter URL:') || ''; }
            if (pasted) { const old = value; pushToHistory(collection, id, field, old, pasted); await db.collection(resolveDbCollection(collection, id)).doc(id).update({ [field]: pasted }); showToast('Saved'); }
        });
        addMenuItem(menu, 'fa-solid fa-pen', 'Edit', () => {
            if (typeof inlineUrlEdit === 'function' && !isEmail) inlineUrlEdit(id, field, collection, td);
            else { const old = value; const newVal = prompt(isEmail ? 'Edit email:' : 'Edit URL:', old); if (newVal !== null && newVal !== old) { pushToHistory(collection, id, field, old, newVal); db.collection(resolveDbCollection(collection, id)).doc(id).update({ [field]: newVal }).then(() => showToast('Saved')); } }
        });
        addMenuItem(menu, 'fa-solid fa-trash', 'Delete', async () => {
            if (confirm(isEmail ? 'Delete email?' : 'Delete link?')) { const old = value; pushToHistory(collection, id, field, old, ''); await db.collection(resolveDbCollection(collection, id)).doc(id).update({ [field]: '' }); showToast('Removed'); }
        }, false, true);
    } else {
        addMenuItem(menu, 'fa-solid fa-copy', 'Copy Cell', async () => {
            if (value) { await navigator.clipboard.writeText(value); showToast('Copied'); } else showToast('Cell empty');
        });
        addMenuItem(menu, 'fa-solid fa-paste', 'Paste Cell', async () => {
            let pasted = '';
            try { pasted = await navigator.clipboard.readText(); } catch { pasted = prompt('Paste text:') || ''; }
            if (pasted && field) { const old = value; pushToHistory(collection, id, field, old, pasted); await db.collection(resolveDbCollection(collection, id)).doc(id).update({ [field]: pasted }); showToast('Pasted'); } else showToast('Cannot paste here');
        });
        addMenuItem(menu, 'fa-solid fa-pen', 'Edit Cell', () => { td.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
        addMenuItem(menu, 'fa-solid fa-trash', 'Clear Cell', async () => {
            if (confirm('Clear this cell?')) { const old = value; pushToHistory(collection, id, field, old, ''); await db.collection(resolveDbCollection(collection, id)).doc(id).update({ [field]: '' }); showToast('Cleared'); }
        }, false, true);
        addMenuItem(menu, 'fa-solid fa-rotate-left', 'Undo Last Change', () => undoLastAction(), historyState.undo.length === 0);
    }
    menu.appendChild(document.createElement('hr'));
    addMenuItem(menu, 'fa-solid fa-copy', 'Copy Row (TSV)', () => {
        const cells = Array.from(row.cells).slice(1);
        const rowText = cells.map(c => { const inp = c.querySelector('input, select'); return inp ? inp.value : c.innerText.trim(); }).join('\t');
        navigator.clipboard.writeText(rowText).then(() => showToast('Row copied'));
    });
    addMenuItem(menu, 'fa-solid fa-trash-can', 'Delete Row', async () => {
        if (tableId === 'hub-table') {
            if (confirm('Remove this candidate from the Hub? (Master record will be kept safe)')) { 
                await window.removeFromCandidateHub([id]); 
                showToast('Removed from Hub'); 
            }
        } else {
            if (confirm('Delete this entire row?')) { 
                await db.collection(collection).doc(id).delete(); 
                showToast('Row deleted'); 
            }
        }
    }, false, true);
}

function handleColumnHeaderContextMenu(e, th, collection) {
    const colIndex = Array.from(th.parentNode.children).indexOf(th);
    const table = th.closest('table');
    const rows = table.querySelectorAll('tbody tr');
    const colData = Array.from(rows).map(row => {
        const cell = row.children[colIndex];
        if (!cell) return '';
        const inp = cell.querySelector('input, select');
        return inp ? inp.value : cell.innerText.trim();
    });
    const colDiv = th.querySelector('[data-colname]');
    const customColName = colDiv ? colDiv.dataset.colname : null;
    const menu = createMenu(e.clientX, e.clientY);
    addMenuItem(menu, 'fa-solid fa-copy', 'Copy Column', () => { navigator.clipboard.writeText(colData.join('\n')).then(() => showToast('Column copied')); });
    if (customColName) {
        let foundCtx = null, foundIdx = -1;
        for (const ctx of ['candidates', 'employees', 'onboarding', 'placements', 'hub']) {
            const cols = state.customColumns[ctx] || [];
            const idx = cols.findIndex(c => c.name === customColName);
            if (idx !== -1) { foundCtx = ctx; foundIdx = idx; break; }
        }
        if (foundCtx !== null) addMenuItem(menu, 'fa-solid fa-trash', 'Delete Column', () => { if (confirm(`Delete column "${customColName}"?`)) deleteCustomColumn(foundCtx, foundIdx); }, false, true);
    }
}

function createMenu(x, y) {
    const menu = document.createElement('div');
    menu.className = 'url-context-menu';
    menu.style.cssText = `position:fixed; left:${x}px; top:${y}px; z-index:9999`;
    document.body.appendChild(menu);
    globalContextMenu = menu;
    setTimeout(() => document.addEventListener('click', closeGlobalMenuOnOutside), 0);
    return menu;
}

function addMenuItem(menu, icon, label, action, disabled = false, danger = false) {
    const div = document.createElement('div');
    div.className = `url-menu-item${danger ? ' url-menu-danger' : ''}${disabled ? ' disabled' : ''}`;
    div.style.cssText = disabled ? 'opacity:0.4; pointer-events:none;' : '';
    div.innerHTML = `<i class="${icon}"></i> ${label}`;
    if (!disabled) div.addEventListener('click', (e) => { e.stopPropagation(); action(); removeGlobalContextMenu(); });
    menu.appendChild(div);
}

function closeGlobalMenuOnOutside(e) {
    if (!globalContextMenu || globalContextMenu.contains(e.target)) return;
    removeGlobalContextMenu();
}

function removeGlobalContextMenu() {
    if (globalContextMenu) { globalContextMenu.remove(); globalContextMenu = null; document.removeEventListener('click', closeGlobalMenuOnOutside); }
}

function isCellUrlField(field, collection) {
    if (collection === 'candidates' && ['gmail', 'linkedin', 'resume', 'track'].includes(field)) return true;
    if (collection === 'employees' && ['track'].includes(field)) return true; 
    const colKey = collection === 'candidates' ? 'candidates' : collection === 'employees' ? 'employees' : collection === 'onboarding' ? 'onboarding' : collection === 'placements' ? 'placements' : null;
    if (colKey) return (state.customColumns[colKey] || []).some(c => c.key === field && c.type === 'url');
    return false;
}

/* ==========================================================================
   20. PROFILE MANAGEMENT
   ========================================================================== */
function updateUserProfile(user, knownUser) {
    const displayName = knownUser ? knownUser.name : (user.displayName || 'User');
    const role = knownUser ? knownUser.role : 'Employee';
    const email = user.email;
    if(document.getElementById('display-username')) document.getElementById('display-username').innerText = displayName;
    if(document.getElementById('prof-name-display')) document.getElementById('prof-name-display').innerText = displayName;
    if(document.getElementById('prof-role-display')) document.getElementById('prof-role-display').innerText = role;
    if(document.getElementById('prof-email-display-sidebar')) document.getElementById('prof-email-display-sidebar').innerText = email;
    if(document.getElementById('prof-office-email')) document.getElementById('prof-office-email').value = email;
    if(document.getElementById('prof-designation')) document.getElementById('prof-designation').value = role;
    db.collection('users').doc(email).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            if(data.firstName) document.getElementById('prof-first').value = data.firstName;
            if(data.lastName) document.getElementById('prof-last').value = data.lastName;
            if(data.dob) document.getElementById('prof-dob').value = data.dob;
            if(data.workMobile) document.getElementById('prof-work-mobile').value = data.workMobile;
            if(data.personalMobile) document.getElementById('prof-personal-mobile').value = data.personalMobile;
            if(data.personalEmail) document.getElementById('prof-personal-email').value = data.personalEmail;
            if(data.photoURL) {
                const img = document.getElementById('profile-main-img');
                img.src = data.photoURL;
                img.style.display = 'block';
                document.getElementById('profile-main-icon').style.display = 'none';
                document.getElementById('btn-delete-photo').style.display = 'inline-flex';
            }
        }
    });
}

window.saveProfileData = async () => {
    if(!state.user) return;
    const email = state.user.email;
    const profileData = {
        firstName: document.getElementById('prof-first').value,
        lastName: document.getElementById('prof-last').value,
        dob: document.getElementById('prof-dob').value,
        workMobile: document.getElementById('prof-work-mobile').value,
        personalMobile: document.getElementById('prof-personal-mobile').value,
        personalEmail: document.getElementById('prof-personal-email').value,
    };
    try { await db.collection('users').doc(email).set(profileData, { merge: true }); showToast("Profile Updated Successfully"); }
    catch(err) { showToast("Error updating profile"); console.error(err); }
};

window.triggerPhotoUpload = () => { document.getElementById('profile-upload-input').click(); };

window.handlePhotoUpload = async (input) => {
    if (!input.files || !input.files[0] || !state.user) return;
    
    const file = input.files[0];
    const email = state.user.email;
    const btnIcon = document.querySelector('.avatar-edit-btn');
    
    if(btnIcon) btnIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const ref = storage.ref(`profiles/${email}_${Date.now()}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.collection('users').doc(email).set({ photoURL: url }, { merge: true });
        
        document.getElementById('profile-main-img').src = url;
        document.getElementById('profile-main-img').style.display = 'block';
        document.getElementById('profile-main-icon').style.display = 'none';
        document.getElementById('btn-delete-photo').style.display = 'inline-flex';
        
        showToast("Photo uploaded successfully");
        
    } catch(err) { 
        console.error("Firebase Upload Error:", err);
        let errorMsg = "Upload failed";
        if (err.message && err.message.includes("unauthorized")) errorMsg = "Upload blocked by Storage Rules";
        if (err.message && err.message.includes("quota")) errorMsg = "Storage quota exceeded";
        showToast(errorMsg); 
    } finally {
        input.value = '';
        if(btnIcon) btnIcon.innerHTML = '<i class="fa-solid fa-camera"></i>';
    }
};

window.deleteProfilePhoto = async () => {
    if(!state.user || !confirm("Remove profile photo?")) return;
    try {
        await db.collection('users').doc(state.user.email).update({ photoURL: firebase.firestore.FieldValue.delete() });
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-img').src = '';
        document.getElementById('profile-main-icon').style.display = 'flex';
        document.getElementById('btn-delete-photo').style.display = 'none';
        showToast("Photo removed");
    } catch(err) { showToast("Failed to remove photo"); }
};

/* ==========================================================================
   21. NOTIFICATIONS RENDERING
   ========================================================================== */
function renderNotificationsList() {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    const notifs = state.recentActivity || [];
    if (notifs.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-bell-slash" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><p>No recent activity</p></div>`;
        return;
    }
    container.innerHTML = notifs.map(n => {
        const date = n.timestamp ? new Date(n.timestamp.seconds * 1000).toLocaleString() : '';
        return `<div class="notif-card glass-panel" style="padding:12px 16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:var(--primary);">${n.action}</strong>
                <small style="color:var(--text-muted);">${date}</small>
            </div>
            <p style="margin:4px 0 0; font-size:0.85rem;">${n.details}</p>
            <small style="color:var(--text-muted);">${n.userName} (${n.collection})</small>
        </div>`;
    }).join('');
}

/* ==========================================================================
   22. GLOBAL EVENT LISTENERS & NAVIGATION
   ========================================================================== */
function setupEventListeners() {
    document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target.closest('.fa-chevron-down') || e.target.closest('.fa-chevron-up')) return;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
            const targetId = btn.dataset.target;
            const targetView = document.getElementById(targetId);
            if(targetView) targetView.classList.add('active');
            const titleEl = document.getElementById('page-title');
            if(titleEl) {
                const icon = btn.querySelector('i, .material-icons')?.outerHTML || '';
                const text = btn.querySelector('span:not(.material-icons)')?.innerText || btn.innerText;
                titleEl.innerHTML = `${icon} ${text}`;
            }
            if(window.innerWidth <= 900) {
                document.getElementById('sidebar').classList.remove('mobile-open');
                document.getElementById('sidebar-overlay').classList.remove('active');
            }
            if(targetId === 'view-dashboard') updateDashboardStats();
        });
    });

    const loginEmail = document.getElementById('login-email');
    const loginPass = document.getElementById('login-pass');
    if(loginEmail) loginEmail.addEventListener('keydown', e => { if(e.key === 'Enter') handleLogin(); });
    if(loginPass) loginPass.addEventListener('keydown', e => { if(e.key === 'Enter') handleLogin(); });

    document.querySelectorAll('.table-wrapper').forEach(wrapper => {
        wrapper.addEventListener('click', function(e) {
            if(e.detail === 3) {
                const cell = e.target.closest('td');
                if(cell && !cell.querySelector('input, select')) {
                    const range = document.createRange();
                    range.selectNodeContents(cell);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                    e.stopPropagation();
                }
            }
        });
    });

    const mobileBtn = document.getElementById('btn-mobile-menu');
    const overlay = document.getElementById('sidebar-overlay');
    if(mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('mobile-open');
            overlay.classList.add('active');
        });
    }
    if(overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }

    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if(confirm("Are you sure you want to log out?")) {
                auth.signOut();
            }
        });
    }

    document.getElementById('search-input')?.addEventListener('input', e => { state.filters.text = e.target.value.toLowerCase(); renderCandidateTable(); });
    document.getElementById('hub-search-input')?.addEventListener('input', e => { state.hubFilters.text = e.target.value.toLowerCase(); renderHubTable(); });
    document.getElementById('emp-search-input')?.addEventListener('input', e => { state.empFilters.text = e.target.value.toLowerCase(); renderEmployeeTable(); });
    document.getElementById('onb-search-input')?.addEventListener('input', e => { state.onbFilters.text = e.target.value.toLowerCase(); renderOnboardingTable(); });

    document.getElementById('filter-recruiter')?.addEventListener('change', e => { state.filters.recruiter = e.target.value; renderCandidateTable(); });
    document.getElementById('filter-tech')?.addEventListener('change', e => { state.filters.tech = e.target.value; renderCandidateTable(); });

    document.querySelectorAll('#view-candidates .btn-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.dataset.status;
            renderCandidateTable();
        });
    });

    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
        if(document.getElementById('search-input')) document.getElementById('search-input').value = '';
        if(document.getElementById('filter-recruiter')) document.getElementById('filter-recruiter').value = '';
        if(document.getElementById('filter-tech')) document.getElementById('filter-tech').value = '';
        state.filters = { text: '', recruiter: '', tech: '', status: '' };
        document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
        const defaultToggle = document.querySelector('#view-candidates .btn-toggle[data-status=""]');
        if(defaultToggle) defaultToggle.classList.add('active');
        renderCandidateTable();
    });

    // --- Access Control Filters ---
    document.getElementById('ac-search-input')?.addEventListener('input', e => { 
        state.acFilters.text = e.target.value.toLowerCase(); 
        state.acPage.index = 1;
        if (typeof renderAccessControlTable === 'function') renderAccessControlTable(); 
    });

    document.getElementById('ac-role-filter')?.addEventListener('change', e => { 
        state.acFilters.role = e.target.value; 
        state.acPage.index = 1;
        if (typeof renderAccessControlTable === 'function') renderAccessControlTable(); 
    });

    document.getElementById('ac-status-filter')?.addEventListener('change', e => { 
        const newStatus = e.target.value;
        state.acFilters.status = newStatus; 
        
        document.querySelectorAll('#ac-status-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
        const activeToggle = document.querySelector(`#ac-status-toggles .btn-toggle[data-ac-status="${newStatus}"]`);
        if (activeToggle) activeToggle.classList.add('active');

        state.acPage.index = 1;
        if (typeof renderAccessControlTable === 'function') renderAccessControlTable(); 
    });
}

/* ==========================================================================
   23. ROW DRAG & DROP REORDERING
   ========================================================================== */
window.handleDragStart = (e, collection) => {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { e.preventDefault(); return; }
    const row = e.target.closest('tr'); if(!row) return;
    e.dataTransfer.setData('text/plain', row.dataset.id);
    e.dataTransfer.setData('collection', collection);
    e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
};

window.handleDragOver = (e) => {
    e.preventDefault();
    const row = e.target.closest('tr');
    if(row) {
        document.querySelectorAll('tr').forEach(tr => tr.style.borderTop = '');
        row.style.borderTop = '2px solid var(--primary)';
    }
};

window.handleDrop = async (e, collection) => {
    e.preventDefault();
    document.querySelectorAll('tr').forEach(tr => { tr.classList.remove('dragging'); tr.style.borderTop = ''; });
    const draggedId = e.dataTransfer.getData('text/plain');
    const dragCollection = e.dataTransfer.getData('collection');
    const targetRow = e.target.closest('tr');
    if (!targetRow || !draggedId || targetRow.dataset.id === draggedId || collection !== dragCollection) return;
    try {
        const targetOrder = parseFloat(targetRow.dataset.order);
        const newOrderIndex = targetOrder - 0.1;
        await db.collection(collection).doc(draggedId).update({ orderIndex: newOrderIndex });
        showToast("Row reordered");
    } catch (error) { console.error("Reorder failed:", error); }
};

/* ==========================================================================
   24. HUB SPECIFIC HELPERS (UPDATED)
   ========================================================================== */
window.triggerHubNote = async (id, type) => {
    const typeLabelMap = { 'submissionLog': 'Submission', 'screeningLog': 'Screening', 'interviewLog': 'Interview' };
    const label = typeLabelMap[type] || 'Activity';
    
    const note = prompt(`Enter or paste ${label} details:`, "");
    if (note === null || note.trim() === "") return;
    
    let cand = state.candidates.find(c => c.id === id);
    let collection = 'candidates';
    if (!cand) {
        cand = state.hubData.find(c => c.id === id);
        collection = 'hub';
    }
    
    if(!cand) return showToast("Record not found");
    
    let logs = [...(cand[type] || [])];
    logs.push({ 
        date: getLocalDateString(), 
        subject: note.trim(),
        note: note.trim(), 
        recruiter: state.currentUserName, 
        timestamp: Date.now() 
    });
    
    try { 
        await db.collection(collection).doc(id).update({ [type]: logs }); 
        showToast(`${label} details saved`); 
    } catch(err) { 
        showToast("Failed to add log"); 
    }
};

window.deleteHubLog = async (id, type, index) => {
    if(!confirm("Delete this log entry?")) return;
    
    let cand = state.candidates.find(c => c.id === id);
    let collection = 'candidates';
    if (!cand) {
        cand = state.hubData.find(c => c.id === id);
        collection = 'hub';
    }
    
    if(!cand) return;
    
    let logs = [...(cand[type] || [])];
    logs.splice(index, 1);
    
    try { 
        await db.collection(collection).doc(id).update({ [type]: logs }); 
        showToast("Log entry removed"); 
    } catch(err) { 
        showToast("Failed to remove log"); 
    }
};

window.addHubLogFromTable = async (id, type) => {
    const logFieldMap = { 'submission': 'submissionLog', 'screening': 'screeningLog', 'interview': 'interviewLog' };
    const logField = logFieldMap[type];
    if (!logField) return;

    let cand = state.candidates.find(c => c.id === id);
    let collection = 'candidates';
    if (!cand) {
        cand = state.hubData.find(c => c.id === id);
        collection = 'hub';
    }

    if (!cand) return showToast("Record not found");

    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    const userDetails = prompt(`Enter or paste ${typeLabel} details:`, "");
    if (userDetails === null) return; 

    if (!Array.isArray(cand[logField])) {
        cand[logField] = [];
    }

    const detailText = userDetails.trim() || `${typeLabel} Log`;

    const newEntry = { 
        date: getLocalDateString(), 
        subject: detailText,
        note: detailText, 
        recruiter: state.currentUserName || 'Unknown', 
        timestamp: Date.now() 
    };

    cand[logField].push(newEntry);
    cand.hiddenFromHub = false;

    if (window.renderHubTable) renderHubTable();
    if (window.updateHubStats) updateHubStats();
    showToast(`✔ ${typeLabel} added`);

    db.collection(collection).doc(id).update({ 
        [logField]: cand[logField],
        hiddenFromHub: false 
    }).catch(err => { 
        console.error(err);
        showToast('❌ Sync failed: ' + err.message); 
    });

    removeHubLogPopover();
};

window.editHubLogDetail = async (id, type, index) => {
    let cand = state.candidates.find(c => c.id === id) || state.hubData.find(c => c.id === id);
    let collection = state.candidates.some(c => c.id === id) ? 'candidates' : 'hub';
    if (!cand || !cand[type] || !cand[type][index]) return;

    const currentEntry = cand[type][index];
    const currentVal = typeof currentEntry === 'string' ? currentEntry : (currentEntry.subject || currentEntry.note || '');
    
    const newVal = prompt("Edit or paste details:", currentVal);
    if (newVal === null) return;

    let logs = [...cand[type]];
    if (typeof logs[index] === 'string') {
        logs[index] = { date: getLocalDateString(), subject: newVal.trim(), note: newVal.trim(), recruiter: state.currentUserName, timestamp: Date.now() };
    } else {
        logs[index] = { ...logs[index], subject: newVal.trim(), note: newVal.trim() };
    }

    try {
        await db.collection(collection).doc(id).update({ [type]: logs });
        showToast("Details updated");
    } catch(err) {
        showToast("Failed to update details");
    }
};

/* ==========================================================================
   25. STARTUP
   ========================================================================== */
window.onload = () => {
    init();
};
