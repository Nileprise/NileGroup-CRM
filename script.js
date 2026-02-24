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
   2. ACCESS CONTROL LIST 
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
            if(window.updateHubStats) updateHubStats('daily', new Date().toISOString().split('T')[0]);
        } else {
            switchScreen('auth');
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
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-pass').value; 
    
    if(!e || !p) {
        showToast("Please enter both email and password.");
        return; 
    }
    
    const btn = document.getElementById('btn-login-action');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
    btn.disabled = true;

    auth.signInWithEmailAndPassword(e, p)
        .then(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        })
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
   7. REALTIME LISTENERS & ISOLATED DATA LOGIC (NO LIMITS)
   ========================================================================== */
function initRealtimeListeners() {
    let candQuery = db.collection('candidates');
    let hubQuery = db.collection('hub');
    
    if (state.userRole === 'Employee') {
        candQuery = candQuery.where('recruiter', '==', state.currentUserName);
    }

    // CANDIDATES LISTENER - Removed .limit(200) to show ALL records
    candQuery.orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.candidates = []; 
        const techs = new Set();
        
        snap.forEach(doc => { 
            const d = doc.data(); 
            state.candidates.push({ id: doc.id, ...d }); 
            if (d.tech) techs.add(d.tech); 
        });
        
        state.metadata.techs = Array.from(techs).sort();
        state.candidates.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        
        // Refresh Table and Selection Count
        const currentSelectedCount = state.selection.cand.size;
        renderCandidateTable(); 
        if (currentSelectedCount > 0) updateSelectButtons('cand');

        renderDropdowns(); 
        updateDashboardStats(); 
        renderDashboardCharts();
        if(dom.headerUpdated) dom.headerUpdated.innerText = 'Synced';
    }, (error) => {
        console.error("Candidate Listener Error:", error);
    });
    
    // HUB LISTENER - Removed .limit(200) to show ALL records
    hubQuery.orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.hubData = [];
        snap.forEach(doc => state.hubData.push({ id: doc.id, ...doc.data() }));
        
        state.hubData.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        
        updateHubStats(state.hub.filterType, state.hub.date);
    });

    // EMPLOYEES (Staff Directory)
    db.collection('employees').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.employees = []; 
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        
        state.employees.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        
        const recruiters = new Set(); 
        state.employees.forEach(e => { if(e.first) recruiters.add(e.first.trim()); });
        state.metadata.recruiters = Array.from(recruiters)
            .map(r => ({value:r, display:r}))
            .sort((a,b)=>a.value.localeCompare(b.value));
            
        renderEmployeeTable(); 
        updateSelectButtons('emp');
        renderDropdowns(); 
        updateDashboardStats();
    });

    // ONBOARDING
    db.collection('onboarding').orderBy('createdAt', 'desc').onSnapshot(snap => { 
        state.onboarding = []; 
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() })); 
        state.onboarding.sort((a, b) => { 
            const aOrder = a.orderIndex !== undefined ? a.orderIndex : -a.createdAt; 
            const bOrder = b.orderIndex !== undefined ? b.orderIndex : -b.createdAt; 
            return aOrder - bOrder; 
        });
        renderOnboardingTable(); 
        updateSelectButtons('onb');
    }, (error) => {
        console.log("Onboarding access restricted"); 
    });

    // PLACEMENTS 
    db.collection('placements').orderBy('createdAt', 'desc').onSnapshot(snap => {
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
    }, (error) => {
        console.log("Placement access restricted"); 
    });

    // USERS (For Birthdays)
    db.collection('users').onSnapshot(snap => {
        state.allUsers = [];
        snap.forEach(doc => {
            const data = doc.data();
            const fullName = (data.firstName && data.lastName) 
                                ? `${data.firstName} ${data.lastName}` 
                                : (data.displayName || 'Staff Member');
            state.allUsers.push({ id: doc.id, name: fullName, dob: data.dob });
        });
        checkBirthdays();
    });

    loadCustomColumns();
}

window.checkBirthdays = () => {
    const today = new Date();
    const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
    const currentDay = String(today.getDate()).padStart(2, '0');
    const todayMatch = `${currentMonth}-${currentDay}`;

    if(!state.allUsers) return;

    const birthdayPeople = state.allUsers.filter(user => {
        if (!user.dob) return false;
        const userBorn = user.dob.substring(5); 
        return userBorn === todayMatch;
    });

    const card = document.getElementById('birthday-card');
    const content = document.getElementById('bday-names');

    if (!card || !content) return;

    if (window.birthdayTimer) clearTimeout(window.birthdayTimer);

    if (birthdayPeople.length > 0) {
        const names = birthdayPeople.map(u => u.name).join(', ');
        content.innerText = names;
        card.style.display = 'flex';
        card.classList.add('active');
        
        window.birthdayTimer = setTimeout(() => {
            card.classList.remove('active');
            setTimeout(() => { card.style.display = 'none'; }, 500);
        }, 7000); 
    } else {
        card.classList.remove('active');
        card.style.display = 'none';
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
            if(data.colOrders) state.colOrders = data.colOrders; 
            renderCandidateTable(); 
            renderEmployeeTable(); 
            renderOnboardingTable(); 
            renderPlacementTable(); 
            renderHubTable(); 
        } 
    }); 
}

function renderDropdowns() { 
    const ids = ['filter-recruiter', 'filter-tech']; 
    ids.forEach(id => { 
        const el = document.getElementById(id); 
        if(!el) return; 
        const currentVal = el.value; 
        let opts = ""; 
        if(id.includes('tech')) opts = state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join(''); 
        else opts = state.metadata.recruiters.map(r => `<option value="${r.value}">${r.display}</option>`).join(''); 
        el.innerHTML = `<option value="">${id.includes('tech')?"All Tech":"All Recruiters"}</option>${opts}`; 
        el.value = currentVal; 
    }); 
}

window.generateRecruiterDropdown = (currentVal, id, collection) => { const list = state.metadata.recruiters || []; const options = list.map(r => `<option value="${r.value}" ${r.value === currentVal ? 'selected' : ''}>${r.display}</option>`).join(''); return `<select class="status-select" style="width:100%; min-width:100px;" onchange="updateRecruiter('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Recruiter</option>${options}</select>`; };
window.updateRecruiter = (id, collection, val) => { const oldVal = getOldValue(collection, id, 'recruiter'); pushToHistory(collection, id, 'recruiter', oldVal, val); db.collection(collection).doc(id).update({ recruiter: val }).then(() => showToast("Recruiter Auto-Saved")); };
window.generateTechDropdown = (currentVal, id, collection) => { const list = state.metadata.techs || []; if(currentVal && !list.includes(currentVal)) list.push(currentVal); list.sort(); const options = list.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join(''); return `<select class="status-select" style="width:100%; min-width:100px; color:var(--primary); font-weight:bold;" onchange="updateTech('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Tech</option>${options}</select>`; };
window.updateTech = (id, collection, val) => { const oldVal = getOldValue(collection, id, 'tech'); pushToHistory(collection, id, 'tech', oldVal, val); db.collection(collection).doc(id).update({ tech: val }).then(() => showToast("Tech Auto-Saved")); };

function getFilteredData(data, filters) { 
    let subset = data; 
    if (state.userRole === 'Employee' && state.currentUserName) subset = subset.filter(item => item.recruiter === state.currentUserName); 
    return subset.filter(item => { 
        if (item.status === 'Placed') return false; 
        const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text); 
        const matchesRec = filters.recruiter ? item.recruiter === filters.recruiter : true; 
        const matchesTech = filters.tech ? item.tech === filters.tech : true; 
        const matchesStatus = filters.status ? item.status === filters.status : true; 
        return matchesText && matchesRec && matchesTech && matchesStatus; 
    }); 
}

function getOldValue(collection, id, field) {
    const list = state[collection] || [];
    const item = list.find(x => x.id === id);
    return item ? item[field] : null;
}

function pushToHistory(collection, id, field, oldVal, newVal) {
    historyState.undo.push({ collection, id, field, oldVal, newVal });
}

/* ==========================================================================
   8. DASHBOARD CHARTS & STATS
   ========================================================================== */
let recChartInstance = null;
let techChartInstance = null;

function renderDashboardCharts() { 
    const candData = state.candidates.filter(c => c.status !== 'Placed'); 
    const recCounts = {}; const techCounts = {}; 
    candData.forEach(c => { 
        const r = c.recruiter ? c.recruiter.trim() : 'Unassigned'; 
        recCounts[r] = (recCounts[r] || 0) + 1; 
        let tRaw = c.tech ? c.tech.trim() : 'Other'; if(tRaw === '') tRaw = 'Other';
        const existingKey = Object.keys(techCounts).find(k => k.toLowerCase() === tRaw.toLowerCase());
        const t = existingKey ? existingKey : tRaw; 
        techCounts[t] = (techCounts[t] || 0) + 1; 
    }); 
    const recLabels = Object.keys(recCounts); const recData = Object.values(recCounts); const techLabels = Object.keys(techCounts); const techData = Object.values(techCounts); 
    
    const recWrapper = document.querySelector('.large-chart .canvas-wrapper');
    if (recWrapper) {
        const requiredWidth = Math.max(100, recLabels.length * 60); 
        recWrapper.innerHTML = `<div class="canvas-scroll-inner" style="width: ${requiredWidth > 100 ? requiredWidth + 'px' : '100%'}"><canvas id="chart-recruiter"></canvas></div>`;
    }

    const ctxRec = document.getElementById('chart-recruiter'); 
    if (ctxRec) { if (recChartInstance) recChartInstance.destroy(); recChartInstance = new Chart(ctxRec, { type: 'bar', data: { labels: recLabels, datasets: [{ label: 'Candidates Assigned', data: recData, backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } } }); } 
    
    const techWrapper = document.querySelector('.small-chart .canvas-wrapper');
    if (techWrapper) { techWrapper.innerHTML = `<div class="canvas-scroll-inner" style="width: 100%;"><canvas id="chart-tech"></canvas></div>`; }

    const ctxTech = document.getElementById('chart-tech'); 
    if (ctxTech) { if (techChartInstance) techChartInstance.destroy(); techChartInstance = new Chart(ctxTech, { type: 'doughnut', data: { labels: techLabels, datasets: [{ data: techData, backgroundColor: ['rgba(6,182,212,0.7)', 'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)', 'rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } }); } 
}

function updateDashboardStats() { 
    const candData = state.candidates.filter(c => c.status !== 'Placed');
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = candData.length; 
    if(document.getElementById('stat-active')) document.getElementById('stat-active').innerText = candData.filter(c => c.status === 'Active').length; 
    if(document.getElementById('stat-inactive')) document.getElementById('stat-inactive').innerText = candData.filter(c => c.status === 'Inactive').length; 
    if(document.getElementById('stat-placed')) document.getElementById('stat-placed').innerText = state.placements.length; 
    const uniqueTechs = new Set(candData.map(c => c.tech ? c.tech.trim().toLowerCase() : '').filter(Boolean)); 
    if(document.getElementById('stat-tech')) document.getElementById('stat-tech').innerText = uniqueTechs.size; 
    if(document.getElementById('stat-rec')) document.getElementById('stat-rec').innerText = state.employees.length; 
}

/* ==========================================================================
   9. ALIGNMENT & COLUMN CONFIG
   ========================================================================== */
window.cycleAlign = (context, colName) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context][colName] || 'left'; const next = modes[(modes.indexOf(current) + 1) % 3]; state.alignments[context][colName] = next; refreshViewForType(context); };
window.cycleAlignAll = (context) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context]['global'] || 'left'; const next = modes[(modes.indexOf(current) + 1) % 3]; state.alignments[context]['global'] = next; refreshViewForType(context); showToast(`All columns aligned ${next}`); };

function applyAlignStyles(context, tableId) { 
    const table = document.getElementById(tableId); if (!table) return;
    const headers = Array.from(table.querySelectorAll('th')); const config = state.alignments[context] || {}; let rules = '';
    headers.forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div) {
            const colName = div.dataset.colname; const val = config[colName] || config['global'] || 'left';
            if (val !== 'left') { rules += `#${tableId} th:nth-child(${idx+1}), #${tableId} td:nth-child(${idx+1}) { text-align: ${val} !important; }\n`; }
        }
    });
    let style = document.getElementById(`align-style-${context}`); 
    if(!style) { style = document.createElement('style'); style.id = `align-style-${context}`; document.head.appendChild(style); } 
    style.innerHTML = rules; 
}

function thAlign(title, context) { const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left'; const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right'); const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : ''; return `<div data-colname="${title}" style="display:flex; align-items:center; width:100%;"><span style="flex:1; text-align:${dir};">${title}</span><i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')"></i></div>`; }

let dragColIndex = null; let dragTableId = null;
function initColumnDragDrop(tableId, context) {
    const table = document.getElementById(tableId); if (!table) return;
    const headers = table.querySelectorAll('th');
    headers.forEach((th, index) => {
        if (index < 4) return; 
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
   10. TABLE RENDERERS (With Sync for Record Counts)
   ========================================================================== */
function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    
    // Ensure deleted records are removed from selection set
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.cand.forEach(id => { if(!validIds.has(id)) state.selection.cand.delete(id); });
    updateSelectButtons('cand');

    const isAllChecked = filtered.length > 0 && filtered.every(c => state.selection.cand.has(c.id));
    const customHeaders = (state.customColumns.candidates || []).map(col => `<th>${thAlign(col.name, 'candidates')}</th>`).join('');
    
    thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')" title="Align All Columns"></i></div></th><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'candidates')}</th><th>${thAlign('First Name', 'candidates')}</th><th>${thAlign('Last Name', 'candidates')}</th><th>${thAlign('Mobile', 'candidates')}</th><th>${thAlign('WhatsApp', 'candidates')}</th><th>${thAlign('Tech', 'candidates')}</th><th>${thAlign('Recruiter', 'candidates')}</th><th style="width: 140px;">${thAlign('Status', 'candidates')}</th><th>${thAlign('Assigned', 'candidates')}</th><th>${thAlign('Gmail', 'candidates')}</th><th>${thAlign('LinkedIn', 'candidates')}</th><th>${thAlign('Resume', 'candidates')}</th><th>${thAlign('Track', 'candidates')}</th><th>${thAlign('Comments', 'candidates')}</th>${customHeaders}</tr>`;
    
    // Exact Record count sync
    if(document.getElementById('cand-footer-count')) {
        document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} total records`;
    }
    
    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : ''; const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive'; const statusLabel = c.status || 'Inactive';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        const customCells = (state.customColumns.candidates || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'candidates', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || ''}</td>`; }).join('');
        const gmailIcon = c.gmail ? `<a href="${c.gmail}" target="_blank"><i class="fa-brands fa-google icon-gmail link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" tabindex="0" data-field="gmail" onclick="inlineUrlEdit('${c.id}', 'gmail', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const linkedinIcon = c.linkedin ? `<a href="${c.linkedin}" target="_blank"><i class="fa-brands fa-linkedin icon-linkedin link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" tabindex="0" data-field="linkedin" onclick="inlineUrlEdit('${c.id}', 'linkedin', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const resumeIcon = c.resume ? `<a href="${c.resume}" target="_blank"><i class="fa-solid fa-file-lines icon-resume link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" tabindex="0" data-field="resume" onclick="inlineUrlEdit('${c.id}', 'resume', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const trackIcon = c.track ? `<a href="${c.track}" target="_blank"><i class="fa-solid fa-location-crosshairs icon-track link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" tabindex="0" data-field="track" onclick="inlineUrlEdit('${c.id}', 'track', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        return `<tr class="${rowClass}" data-id="${c.id}" data-collection="candidates" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'candidates')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'candidates')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td><td>${i+1}</td><td tabindex="0" data-field="first" id="fname-${c.id}" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td><td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td><td tabindex="0" data-field="wa" onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td><td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td><td style="overflow:visible;"><div class="action-dropdown-container"><div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${statusLabel} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div><div id="menu-${c.id}" class="custom-dropdown-menu"><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div><div class="dropdown-option" onclick="moveToPlacements('${c.id}')"><span class="dot-gold" style="width:8px; height:8px; background:#f59e0b; border-radius:50%; display:inline-block;"></span> Move to Placements</div><div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div></div></div></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td><td style="text-align:center;">${gmailIcon}</td><td style="text-align:center;">${linkedinIcon}</td><td style="text-align:center;">${resumeIcon}</td><td style="text-align:center;">${trackIcon}</td><td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||''}</td>${customCells}</tr>`;
    }).join('');
    
    restoreColumnOrder('candidates-table', 'candidates'); applyAlignStyles('candidates', 'candidates-table'); initColumnDragDrop('candidates-table', 'candidates');
}

function renderEmployeeTable() {
    let filtered = state.employees; if (state.userRole === 'Employee') filtered = filtered.filter(e => e.officialEmail === state.user.email); filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));
    
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.emp.forEach(id => { if(!validIds.has(id)) state.selection.emp.delete(id); });
    updateSelectButtons('emp');
    
    const isAllChecked = filtered.length > 0 && filtered.every(e => state.selection.emp.has(e.id));
    const customHeaders = (state.customColumns.employees || []).map(col => `<th>${thAlign(col.name, 'employees')}</th>`).join('');
    
    document.getElementById('employee-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('employees')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('employees')"></i></div></th><th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'employees')}</th><th>${thAlign('First Name', 'employees')}</th><th>${thAlign('Last Name', 'employees')}</th><th>${thAlign('Date of Birth', 'employees')}</th><th>${thAlign('Designation', 'employees')}</th><th>${thAlign('Work Mobile', 'employees')}</th><th>${thAlign('Personal Mobile', 'employees')}</th><th>${thAlign('Official Email', 'employees')}</th><th>${thAlign('Personal Email', 'employees')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('emp-footer-count')) {
        document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} total records`;
    }
    
    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.emp.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.employees || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'employees', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'employees', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'employees', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="employees" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'employees')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'employees')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td><td>${i+1}</td><td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td><td tabindex="0" data-field="designation" onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||''}</td><td tabindex="0" data-field="workMobile" onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||''}</td><td tabindex="0" data-field="personalMobile" onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||''}</td><td tabindex="0" data-field="officialEmail" onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||''}</td><td tabindex="0" data-field="personalEmail" onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||''}</td>${customCells}</tr>`; }).join('');
    
    restoreColumnOrder('employee-table', 'employees'); applyAlignStyles('employees', 'employee-table'); initColumnDragDrop('employee-table', 'employees');
}

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.onb.forEach(id => { if(!validIds.has(id)) state.selection.onb.delete(id); });
    updateSelectButtons('onb');
    
    const isAllChecked = filtered.length > 0 && filtered.every(o => state.selection.onb.has(o.id));
    const customHeaders = (state.customColumns.onboarding || []).map(col => `<th>${thAlign(col.name, 'onboarding')}</th>`).join('');
    
    document.getElementById('onboarding-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('onboarding')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('onboarding')"></i></div></th><th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'onboarding')}</th><th>${thAlign('First Name', 'onboarding')}</th><th>${thAlign('Last Name', 'onboarding')}</th><th>${thAlign('Date of Birth', 'onboarding')}</th><th>${thAlign('Recruiter', 'onboarding')}</th><th>${thAlign('Mobile', 'onboarding')}</th><th>${thAlign('Status', 'onboarding')}</th><th>${thAlign('Assigned', 'onboarding')}</th><th>${thAlign('Comments', 'onboarding')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('onb-footer-count')) {
        document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} total records`;
    }
    
    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.onb.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.onboarding || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'onboarding', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'onboarding', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'onboarding', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="onboarding" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'onboarding')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'onboarding')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td><td>${i+1}</td><td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td><td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td><td><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)"><option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option><option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option></select></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td><td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||''}</td>${customCells}</tr>`; }).join('');
    
    restoreColumnOrder('onboarding-table', 'onboarding'); applyAlignStyles('onboarding', 'onboarding-table'); initColumnDragDrop('onboarding-table', 'onboarding');
}

function renderPlacementTable() {
    const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value;
    let placed = state.placements.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); });
    
    if(!state.selection.place) state.selection.place = new Set();
    const validIds = new Set(placed.map(c => c.id));
    state.selection.place.forEach(id => { if(!validIds.has(id)) state.selection.place.delete(id); });
    updateSelectButtons('place');

    const isAllChecked = placed.length > 0 && placed.every(p => state.selection.place.has(p.id));
    const thead = document.querySelector('#placement-table-head'); 
    const customHeaders = (state.customColumns.placements || []).map(col => `<th>${thAlign(col.name, 'placements')}</th>`).join('');
    
    if(thead) thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('placements')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('placements')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'placements')}</th><th>${thAlign('First Name', 'placements')}</th><th>${thAlign('Last Name', 'placements')}</th><th>${thAlign('Tech', 'placements')}</th><th>${thAlign('Location', 'placements')}</th><th>${thAlign('Contract', 'placements')}</th><th>${thAlign('Assigned', 'placements')}</th><th>${thAlign('Actions', 'placements')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('placement-footer-count')) {
        document.getElementById('placement-footer-count').innerText = `Showing ${placed.length} total records`;
    }
    
    if(document.getElementById('placement-table-body')) {
        document.getElementById('placement-table-body').innerHTML = placed.map((c, i) => { const isSel = state.selection.place.has(c.id) ? 'checked' : ''; const rowClass = state.selection.place.has(c.id) ? 'selected-row' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.placements || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'placements', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'placements', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'placements', this)">${val || ''}</td>`; }).join(''); return `<tr class="${rowClass}" data-id="${c.id}" data-collection="placements" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'placements')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'placements')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'placements', this)">${c.first}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'placements', this)">${c.last}</td><td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'placements', this)" class="text-cyan">${c.tech}</td><td tabindex="0" data-field="location" onclick="inlineEdit('${c.id}', 'location', 'placements', this)">${c.location||''}</td><td tabindex="0" data-field="contract" onclick="inlineEdit('${c.id}', 'contract', 'placements', this)">${c.contract||''}</td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'placements', this.value)"></td><td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>${customCells}</tr>`; }).join('');
    }
    restoreColumnOrder('placement-table', 'placements'); applyAlignStyles('placements', 'placement-table'); initColumnDragDrop('placement-table', 'placements');
}

function renderHubTable() {
    let data = state.hubData; 
    if(state.userRole === 'Employee' && state.currentUserName) data = data.filter(c => c.recruiter === state.currentUserName);
    if(state.hubFilters && state.hubFilters.text) data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));
    const { start, end } = state.hub.range; const isInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= start && t <= end; };
    const activeCandidates = data.filter(c => (c.submissionLog || []).some(isInRange) || (c.screeningLog || []).some(isInRange) || (c.interviewLog || []).some(isInRange));
    
    if(!state.selection.hub) state.selection.hub = new Set();
    const validIds = new Set(activeCandidates.map(c => c.id));
    state.selection.hub.forEach(id => { if(!validIds.has(id)) state.selection.hub.delete(id); });
    updateSelectButtons('hub');

    const isAllChecked = activeCandidates.length > 0 && activeCandidates.every(c => state.selection.hub.has(c.id));
    
    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('hub')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('hub')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'hub')}</th><th style="width:150px;">${thAlign('Candidate Name', 'hub')}</th><th style="width:150px;">${thAlign('Recruiter', 'hub')}</th><th style="width:120px;">${thAlign('Technology', 'hub')}</th><th style="text-align:center;">${thAlign('Submission', 'hub')}</th><th style="text-align:center;">${thAlign('Screenings', 'hub')}</th><th style="text-align:center;">${thAlign('Interview', 'hub')}</th><th style="text-align:right;">${thAlign('Date', 'hub')}</th></tr>`;
    
    if(document.getElementById('hub-footer-count')) {
        document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    }
    
    const tbody = document.getElementById('hub-table-body');
    if (activeCandidates.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`; return; }
    
    tbody.innerHTML = activeCandidates.map((c, i) => {
        const sub = (c.submissionLog||[]).filter(isInRange).length; const scr = (c.screeningLog||[]).filter(isInRange).length; const int = (c.interviewLog||[]).filter(isInRange).length;
        let displayDate = '-'; const logsInRange = [...(c.submissionLog||[]).filter(isInRange), ...(c.screeningLog||[]).filter(isInRange), ...(c.interviewLog||[]).filter(isInRange)];
        if (logsInRange.length > 0) { logsInRange.sort((a,b) => new Date(b.date || b) - new Date(a.date || a)); const latest = logsInRange[0]; displayDate = (typeof latest === 'string') ? latest : (latest.date || '-'); }
        const isSel = state.selection.hub.has(c.id) ? 'checked' : ''; const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : ''; const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        
        let html = `<tr style="cursor:pointer; ${activeStyle}" class="${state.selection.hub.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="hub" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'hub')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'hub')"><td class="drag-handle-cell" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'hub', this)">${c.first} ${c.last}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'hub')}</td><td>${generateTechDropdown(c.tech, c.id, 'hub')}</td><td class="text-cyan" style="font-weight:bold; font-size:1.1rem; text-align:center;" onclick="toggleHubRow('${c.id}')">${sub}</td><td class="text-gold" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${scr}</td><td class="text-purple" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${int}</td><td style="font-size:0.8rem; color:var(--text-muted); text-align:right;" onclick="toggleHubRow('${c.id}')">${displayDate} <span style="margin-left: 8px; opacity:0.7;">${caret}</span></td></tr>`;
        if(isExpanded) {
             const renderTimeline = (list, type) => {
                const visibleLogs = (list||[]).filter(isInRange);
                if(visibleLogs.length === 0) return `<li class="hub-log-item" style="opacity:0.5; font-style:italic;">No records in this range.</li>`;
                return visibleLogs.map((entry, index) => {
                    const isLegacy = typeof entry === 'string', dateStr = isLegacy ? entry : entry.date, subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject'), link = !isLegacy && entry.link ? entry.link : null, icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');
                    return `<li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);"><div style="display:flex; justify-content:space-between; width:100%;"><span class="log-date" style="color:var(--primary); font-weight:bold; font-size:0.85rem;"><i class="fa-solid ${icon}"></i> ${dateStr}</span>${!isLegacy && entry.recruiter ? `<span style="font-size:0.7rem; opacity:0.6;">${entry.recruiter}</span>` : ''}</div><div style="font-weight:500; color:#fff; font-size:0.9rem;">${subject}</div>${link ? `<a href="${link}" target="_blank" class="hub-link-btn" style="margin-top:5px; text-decoration:none; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--primary); font-size:0.8rem;">View Email</a>` : ''}<div style="text-align:right; width:100%; margin-top:5px;"><button class="hub-action-btn delete" style="color: #ef4444; background:none; border:none; cursor:pointer;" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${type==='sub'?'submissionLog':type==='scr'?'screeningLog':'interviewLog'}', ${index})"><i class="fa-solid fa-trash"></i> Remove</button></div></li>`;
                }).join('');
            };
            html += `<tr class="hub-details-row"><td colspan="10" style="padding:0; border:none;"><div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()"><div class="hub-col cyan"><div class="hub-col-header cyan">RTR & Submissions <button onclick="triggerHubNote('${c.id}', 'submissionLog')" style="float:right; background:none; border:none; color:#06b6d4; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.submissionLog, 'sub')}</ul></div><div class="hub-col gold"><div class="hub-col-header gold">Screenings <button onclick="triggerHubNote('${c.id}', 'screeningLog')" style="float:right; background:none; border:none; color:#f59e0b; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog, 'scr')}</ul></div><div class="hub-col purple"><div class="hub-col-header purple">Interviews <button onclick="triggerHubNote('${c.id}', 'interviewLog')" style="float:right; background:none; border:none; color:#8b5cf6; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog, 'int')}</ul></div></div></td></tr>`;
        }
        return html;
    }).join('');
    
    restoreColumnOrder('hub-table', 'hub'); applyAlignStyles('hub', 'hub-table'); initColumnDragDrop('hub-table', 'hub');
}

/* ==========================================================================
   11. DATA MANIPULATION & INLINE EDITS
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
    
    const isInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= start && t <= end; };

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

window.toggleHubRow = (id) => { state.hub.expandedRowId = state.hub.expandedRowId === id ? null : id; renderHubTable(); };

window.updatePlacementFilter = (type, btn) => {
    state.placementFilter = type; document.querySelectorAll('#view-placements .filter-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    if (type === 'monthly') { document.getElementById('placement-month-picker').style.display = 'block'; document.getElementById('placement-year-picker').style.display = 'none'; } 
    else { document.getElementById('placement-month-picker').style.display = 'none'; document.getElementById('placement-year-picker').style.display = 'block'; }
    renderPlacementTable();
};

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

// SYNCING DELETE COUNT TO THE BUTTON
function updateSelectButtons(type) { 
    let btn, countSpan; 
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); } 
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); } 
    else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); } 
    else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); } 
    else if(type === 'hub') { btn = document.getElementById('btn-delete-hub'); countSpan = document.getElementById('hub-selected-count'); } 
    if (!btn) return; 
    if (state.selection[type] && state.selection[type].size > 0 && state.userRole !== 'Employee') { 
        btn.style.display = 'inline-flex'; 
        btn.style.opacity = '1'; 
        if(countSpan) countSpan.innerText = state.selection[type].size; 
    } 
    else { 
        btn.style.display = 'none'; 
        if(countSpan) countSpan.innerText = '0'; 
    } 
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
   12. GMAIL ENGINE
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
   13. GLOBAL EVENT LISTENERS & NAVIGATION
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

    document.querySelectorAll('#view-candidates .btn-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.dataset.status;
            renderCandidateTable();
        });
    });

    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
        document.getElementById('search-input').value = '';
        document.getElementById('filter-recruiter').value = '';
        document.getElementById('filter-tech').value = '';
        state.filters = { text: '', recruiter: '', tech: '', status: '' };
        document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
        document.querySelector('#view-candidates .btn-toggle[data-status=""]').classList.add('active');
        renderCandidateTable();
    });
}

/* ==========================================================================
   14. ROW DRAG & DROP REORDERING
   ========================================================================== */
window.handleDragStart = (e, collection) => {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        e.preventDefault();
        return;
    }
    
    const row = e.target.closest('tr');
    if(!row) return;

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
    document.querySelectorAll('tr').forEach(tr => {
        tr.classList.remove('dragging');
        tr.style.borderTop = '';
    });

    const draggedId = e.dataTransfer.getData('text/plain');
    const dragCollection = e.dataTransfer.getData('collection');
    const targetRow = e.target.closest('tr');

    if (!targetRow || !draggedId || targetRow.dataset.id === draggedId || collection !== dragCollection) return;

    try {
        const targetOrder = parseFloat(targetRow.dataset.order);
        const newOrderIndex = targetOrder - 0.1; 
        
        await db.collection(collection).doc(draggedId).update({ orderIndex: newOrderIndex });
        showToast("Row reordered");
    } catch (error) {
        console.error("Reorder failed:", error);
    }
};

/* ==========================================================================
   15. HUB SPECIFIC HELPERS
   ========================================================================== */
window.triggerHubNote = async (id, type) => {
    const note = prompt("Enter manual activity note:");
    if(!note || note.trim() === "") return;
    
    let cand = state.candidates.find(c => c.id === id) || state.hubData.find(c => c.id === id);
    if(!cand) return showToast("Record not found", "error");

    let logs = cand[type] || [];
    logs.push({ 
        date: new Date().toISOString().split('T')[0], 
        note: note.trim(), 
        recruiter: state.currentUserName,
        timestamp: Date.now()
    });

    try {
        await db.collection('candidates').doc(id).update({ [type]: logs });
        showToast("Manual log added");
    } catch(err) {
        showToast("Failed to add log");
    }
};

window.deleteHubLog = async (id, type, index) => {
    if(!confirm("Delete this log entry?")) return;
    let cand = state.candidates.find(c => c.id === id) || state.hubData.find(c => c.id === id);
    if(!cand) return;

    let logs = [...(cand[type] || [])];
    logs.splice(index, 1);

    try {
        await db.collection('candidates').doc(id).update({ [type]: logs });
        showToast("Log entry removed");
    } catch(err) {
        showToast("Failed to remove log");
    }
};

/* ==========================================================================
   16. PROFILE MANAGEMENT
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

    try {
        await db.collection('users').doc(email).set(profileData, { merge: true });
        showToast("Profile Updated Successfully");
    } catch(err) {
        showToast("Error updating profile");
        console.error(err);
    }
};

window.triggerPhotoUpload = () => {
    document.getElementById('profile-upload-input').click();
};

window.handlePhotoUpload = async (input) => {
    if (!input.files || !input.files[0] || !state.user) return;
    const file = input.files[0];
    const email = state.user.email;
    const loadingEl = document.getElementById('avatar-loading');
    
    if(loadingEl) loadingEl.style.display = 'flex';
    
    try {
        const ref = storage.ref(`profiles/${email}_${Date.now()}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        
        await db.collection('users').doc(email).set({ photoURL: url }, { merge: true });
        
        document.getElementById('profile-main-img').src = url;
        document.getElementById('profile-main-img').style.display = 'block';
        document.getElementById('profile-main-icon').style.display = 'none';
        document.getElementById('btn-delete-photo').style.display = 'inline-flex';
        
        showToast("Photo uploaded");
    } catch(err) {
        showToast("Photo upload failed");
        console.error(err);
    } finally {
        if(loadingEl) loadingEl.style.display = 'none';
    }
};

window.deleteProfilePhoto = async () => {
    if(!state.user || !confirm("Remove profile photo?")) return;
    
    try {
        await db.collection('users').doc(state.user.email).update({
            photoURL: firebase.firestore.FieldValue.delete()
        });
        
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-img').src = '';
        document.getElementById('profile-main-icon').style.display = 'flex';
        document.getElementById('btn-delete-photo').style.display = 'none';
        
        showToast("Photo removed");
    } catch(err) {
        showToast("Failed to remove photo");
    }
};

/* ==========================================================================
   17. STARTUP
   ========================================================================== */
window.onload = () => {
    init();
};
