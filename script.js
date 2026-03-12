/* ==========================================================================
   1. CONFIGURATION (FIREBASE + GMAIL API)
   ========================================================================= */
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

const GMAIL_CONFIG = {
    CLIENT_ID: '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com',
    API_KEY: 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE',
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
    SCOPES: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels'
};

try {
    firebase.initializeApp(firebaseConfig);
    // Enable offline persistence for multi-tab syncing
    firebase.firestore().enablePersistence({ experimentalTabSynchronization: true })
        .catch(function(err) {
            console.warn("Firebase Persistence Error:", err.code);
        });
} catch (e) {
    console.error("Firebase Init Error:", e);
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

/* ==========================================================================
   2. ACCESS CONTROL LIST (FALLBACK)
   ========================================================================= */
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
   3. STATE & AGGRESSIVE LOCAL STORAGE MANAGEMENT
   ========================================================================= */
const state = {
    user: null, userRole: null, currentUserName: null,
    candidates: [], onboarding: [], employees: [], placements: [], hubData: [], labels: [], allUsers: [],
    selectedLabelColor: '#e91e63',
    gmail: { tokenClient: null, gapiInited: false, gisInited: false, currentLabel: 'INBOX', currentEmailId: null },
    hub: { expandedRowId: null, filterType: 'daily', date: new Date().toISOString().split('T')[0], range: { start: 0, end: 0 } },
    placementFilter: 'monthly',
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' },
    empFilters: { text: '' },
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    pagination: {
        cand: { current: 1, limit: 50 }, emp: { current: 1, limit: 50 },
        onb: { current: 1, limit: 50 }, place: { current: 1, limit: 50 }, hub: { current: 1, limit: 50 }
    },
    alignments: { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {} },
    colOrders: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    customColumns: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    metadata: {
        recruiters: [],
        techs: ["React", "Node.js", "Java", "Python", ".NET", "AWS", "Azure", "DevOps", "Salesforce"]
    },
    pendingDelete: { type: null }
};

const storageManager = {
    saveUIState: () => {
        const uiState = {
            activeView: document.querySelector('.content-view.active')?.id || 'view-dashboard',
            filters: state.filters, hubFilters: state.hubFilters,
            placementFilter: state.placementFilter, pagination: state.pagination
        };
        localStorage.setItem('nileprise_ui_state', JSON.stringify(uiState));
    },
    loadUIState: () => {
        const saved = localStorage.getItem('nileprise_ui_state');
        if (saved) {
            try {
                const uiState = JSON.parse(saved);
                state.filters = { ...state.filters, ...uiState.filters };
                state.hubFilters = { ...state.hubFilters, ...uiState.hubFilters };
                state.placementFilter = uiState.placementFilter || state.placementFilter;
                state.pagination = { ...state.pagination, ...uiState.pagination };
                return uiState.activeView;
            } catch (e) { console.error("Error parsing UI state:", e); }
        }
        return null;
    }
};

// Master Function to guarantee data is stored locally immediately
function aggressiveLocalSave(collection, id, field, value) {
    const idx = state[collection].findIndex(x => x.id === id);
    if (idx > -1) {
        state[collection][idx][field] = value;
        localStorage.setItem(`np_data_${collection}`, JSON.stringify(state[collection]));
    }
}

function loadLocalData() {
    ['candidates', 'employees', 'onboarding', 'placements'].forEach(col => {
        const localData = localStorage.getItem(`np_data_${col}`);
        if (localData) {
            const parsed = JSON.parse(localData);
            if (state[col].length === 0) state[col] = parsed;
        }
    });
}

/* ==========================================================================
   4. DOM CACHE
   ========================================================================= */
const dom = {
    screens: { app: document.getElementById('dashboard-screen') },
    headerUpdated: document.getElementById('header-updated')
};

// Bridge functions for HTML buttons
window.openCandidateModal = () => window.addInlineCandidateRow();
window.openEmployeeModal = () => window.addInlineEmployeeRow();
window.openOnboardingModal = () => window.addInlineOnboardingRow();
window.openPlacementModal = () => window.addInlinePlacementRow();

/* ==========================================================================
   5. INITIALIZATION & ROUTING
   ========================================================================= */
function init() {
    setupEventListeners();
    loadGoogleScripts();
    showTableLoaders();
    loadLocalData();

    db.collection('settings').doc('table_config').get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            ['colOrders', 'candidates', 'employees', 'onboarding', 'placements', 'hub'].forEach(key => {
                if (data[key]) state[key === 'colOrders' ? key : 'customColumns'][key] = data[key];
            });
        }
    }).catch(() => console.log("Using default column settings."));

    auth.onAuthStateChanged(async user => {
        if (user) {
            state.user = user;
            const email = user.email.toLowerCase();
            try {
                const userDoc = await db.collection('users').doc(email).get();
                const knownUser = ALLOWED_USERS[email];
                state.userRole = userDoc.exists ? (userDoc.data().role || 'Employee') : (knownUser?.role ?? 'Employee');
                state.currentUserName = userDoc.exists ? (userDoc.data().firstName || user.displayName || 'Unknown') : (knownUser?.name ?? (user.displayName || 'Unknown'));
            } catch (err) { console.error("Error fetching role:", err); }

            applyRoleBasedUI();
            updateUserProfile(user, ALLOWED_USERS[email]);
            
            const savedView = storageManager.loadUIState();
            if (savedView && !document.querySelector(`.nav-item[data-target="${savedView}"]`)?.classList.contains('locked')) {
                document.querySelector(`.nav-item[data-target="${savedView}"]`)?.click();
            } else {
                switchScreen('app'); 
            }
            initRealtimeListeners();
        } else {
            state.userRole = 'Admin';
            state.currentUserName = 'System Admin';
            applyRoleBasedUI();
            
            const savedView = storageManager.loadUIState();
            if (savedView) document.querySelector(`.nav-item[data-target="${savedView}"]`)?.click();
            else switchScreen('app');
            
            initRealtimeListeners();
        }
        if (window.updateHubStats) updateHubStats('daily', new Date().toISOString().split('T')[0]);
    });

    if (localStorage.getItem('np_theme') === 'light') document.body.classList.add('light-mode');
}

function showTableLoaders() {
    const loaderHTML = `<tr><td colspan="25" style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin text-cyan" style="font-size: 2rem; margin-bottom: 15px;"></i><br>Loading Data...</td></tr>`;
    ['table-body', 'employee-table-body', 'hub-table-body', 'placement-table-body', 'onboarding-table-body'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = loaderHTML;
    });
}

function applyRoleBasedUI() {
    const isEmployee = state.userRole === 'Employee';
    const restrictedForEmployees = ['view-placements', 'view-onboarding', 'view-employees', 'view-settings'];

    document.querySelectorAll('.nav-item').forEach(item => {
        const target = item.getAttribute('data-target');
        if (!target) return;
        if (isEmployee && restrictedForEmployees.includes(target)) {
            item.classList.add('locked');
            if (!item.querySelector('.lock-icon')) item.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-lock lock-icon" title="Manager Access Only"></i>');
        } else {
            item.classList.remove('locked');
            item.querySelector('.lock-icon')?.remove();
        }
    });

    const activeView = document.querySelector('.content-view.active');
    if (isEmployee && activeView && restrictedForEmployees.includes(activeView.id)) {
        document.querySelector('.nav-item[data-target="view-dashboard"]')?.click();
    }
}

function switchScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`${screenName}-screen`)?.classList.add('active');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    document.getElementById('toast-msg').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

/* ==========================================================================
   6. REALTIME FIREBASE LISTENERS (EMAIL BOUND)
   ========================================================================= */
function initRealtimeListeners() {
    let candRef = db.collection('candidates');
    let empRef = db.collection('employees');
    let onbRef = db.collection('onboarding');
    let placeRef = db.collection('placements');

    // BIND TO EMAIL: Filter live database by logged in email
    if (state.userRole === 'Employee' && state.user) {
        const myEmail = state.user.email.toLowerCase();
        candRef = candRef.where('recruiter', '==', myEmail);
        onbRef = onbRef.where('recruiter', '==', myEmail);
        placeRef = placeRef.where('recruiter', '==', myEmail);
    }

    if (dom.headerUpdated) dom.headerUpdated.innerHTML = '<i class="fa-solid fa-satellite-dish text-success"></i> Live System';

    const mergeWithLocal = (cloudData, collectionName) => {
        const localDataString = localStorage.getItem(`np_data_${collectionName}`);
        let localData = [];
        if (localDataString) localData = JSON.parse(localDataString).filter(item => item.id.startsWith('local_'));
        
        const cloudIds = new Set(cloudData.map(c => c.id));
        localData = localData.filter(l => !cloudIds.has(l.id));

        return [...localData, ...cloudData].sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
    };

    empRef.onSnapshot(snap => {
        const cloudData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.employees = mergeWithLocal(cloudData, 'employees');
        
        const recruitersMap = new Map();
        state.employees.forEach(e => {
            if (e.first && e.officialEmail) {
                recruitersMap.set(e.officialEmail.toLowerCase(), `${e.first} ${e.last || ''}`.trim());
            }
        });
        
        state.metadata.recruiters = Array.from(recruitersMap.entries()).map(([email, name]) => ({ value: email, display: name })).sort((a,b) => a.display.localeCompare(b.display));
        
        renderEmployeeTable();
        renderDropdowns();
        updateDashboardStats();
    }, err => renderEmployeeTable());

    candRef.onSnapshot(snap => {
        const cloudData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.candidates = mergeWithLocal(cloudData, 'candidates');
        
        const techs = new Set();
        state.candidates.forEach(c => { if (c.tech) techs.add(c.tech); });
        state.metadata.techs = Array.from(techs).sort();
        
        renderCandidateTable();
        updateHubStats();
        renderDropdowns();
        updateDashboardStats();
        renderDashboardCharts();
    }, err => { renderCandidateTable(); });

    onbRef.onSnapshot(snap => {
        const cloudData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.onboarding = mergeWithLocal(cloudData, 'onboarding');
        renderOnboardingTable();
    }, err => renderOnboardingTable());

    placeRef.onSnapshot(snap => {
        const cloudData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.placements = mergeWithLocal(cloudData, 'placements');
        renderPlacementTable();
        updateDashboardStats();
    }, err => renderPlacementTable());

    db.collection('users').onSnapshot(snap => {
        state.allUsers = snap.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, name: (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : (data.displayName || 'Staff Member'), dob: data.dob };
        });
    });
}

function renderDropdowns() {
    ['filter-recruiter', 'filter-tech'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const currentVal = el.value;
        const isTech = id.includes('tech');
        const opts = isTech 
            ? state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('')
            : state.metadata.recruiters.map(r => `<option value="${r.value}">${r.display}</option>`).join('');
        
        el.innerHTML = `<option value="">${isTech ? "All Tech" : "All Recruiters"}</option>${opts}`;
        el.value = currentVal;
    });
}

window.generateRecruiterDropdown = (currentVal, id, collection) => {
    const list = state.metadata.recruiters || [];
    const options = list.map(r => `<option value="${r.value}" ${r.value === currentVal ? 'selected' : ''}>${r.display}</option>`).join('');
    return `<select class="status-select" style="width:100%; min-width:100px;" onchange="updateRecruiter('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Recruiter</option>${options}</select>`;
};

window.updateRecruiter = async (id, collection, val) => {
    aggressiveLocalSave(collection, id, 'recruiter', val);
    try {
        if (!id.startsWith('local_')) await db.collection(collection).doc(id).update({ recruiter: val });
        showToast("Recruiter Saved");
    } catch (e) { showToast("Saved Locally"); }
};

window.generateTechDropdown = (currentVal, id, collection) => {
    const list = [...(state.metadata.techs || [])];
    if (currentVal && !list.includes(currentVal)) list.push(currentVal);
    list.sort();
    const options = list.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join('');
    return `<select class="status-select" style="width:100%; min-width:100px; color:var(--primary); font-weight:bold;" onchange="updateTech('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Tech</option>${options}</select>`;
};

window.updateTech = async (id, collection, val) => {
    aggressiveLocalSave(collection, id, 'tech', val);
    try {
        if (!id.startsWith('local_')) await db.collection(collection).doc(id).update({ tech: val });
        showToast("Tech Saved");
    } catch (e) { showToast("Saved Locally"); }
};

/* ==========================================================================
   7. EVENT LISTENERS & UI ROUTING
   ========================================================================= */
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function setupEventListeners() {
    document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.closest('.fa-chevron-down') || e.target.closest('.fa-chevron-up')) return;
            if (btn.classList.contains('locked')) return showToast("Access Restricted: Manager clearance required.");
            
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
            const targetId = btn.dataset.target;
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.classList.add('active');

            const titleEl = document.getElementById('page-title');
            if (titleEl) {
                const icon = btn.querySelector('i, .material-icons')?.outerHTML || '';
                const text = btn.querySelector('span:not(.material-icons)')?.innerText || btn.innerText;
                titleEl.innerHTML = `${icon} ${text}`;
            }

            if (window.innerWidth <= 900) {
                document.getElementById('sidebar')?.classList.remove('mobile-open');
                document.getElementById('sidebar-overlay')?.classList.remove('active');
            }
            if (targetId === 'view-dashboard') updateDashboardStats();
            if (typeof storageManager !== 'undefined') storageManager.saveUIState();
        });
    });

    const mobileBtn = document.getElementById('btn-mobile-menu');
    const overlay = document.getElementById('sidebar-overlay');
    if (mobileBtn) mobileBtn.addEventListener('click', () => { document.getElementById('sidebar').classList.add('mobile-open'); overlay.classList.add('active'); });
    if (overlay) overlay.addEventListener('click', () => { document.getElementById('sidebar').classList.remove('mobile-open'); overlay.classList.remove('active'); });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (confirm("Are you sure you want to log out?")) auth.signOut();
    });

    const bindSearch = (id, targetState, renderFunc) => {
        document.getElementById(id)?.addEventListener('input', debounce(e => {
            targetState.text = e.target.value.toLowerCase();
            const typeMap = { 'search-input': 'cand', 'hub-search-input': 'hub', 'emp-search-input': 'emp', 'onb-search-input': 'onb' };
            const pType = typeMap[id];
            if (pType && state.pagination[pType]) state.pagination[pType].current = 1;
            renderFunc();
            if (typeof storageManager !== 'undefined') storageManager.saveUIState();
        }));
    };

    bindSearch('search-input', state.filters, renderCandidateTable);
    bindSearch('hub-search-input', state.hubFilters, renderHubTable);
    bindSearch('emp-search-input', state.empFilters, renderEmployeeTable);
    bindSearch('onb-search-input', state.onbFilters, renderOnboardingTable);

    document.getElementById('filter-recruiter')?.addEventListener('change', e => { 
        state.filters.recruiter = e.target.value; 
        state.pagination.cand.current = 1;
        renderCandidateTable(); 
        if (typeof storageManager !== 'undefined') storageManager.saveUIState();
    });
    
    document.getElementById('filter-tech')?.addEventListener('change', e => { 
        state.filters.tech = e.target.value; 
        state.pagination.cand.current = 1;
        renderCandidateTable(); 
        if (typeof storageManager !== 'undefined') storageManager.saveUIState();
    });

    document.querySelectorAll('#view-candidates .btn-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.dataset.status;
            state.pagination.cand.current = 1;
            renderCandidateTable();
            if (typeof storageManager !== 'undefined') storageManager.saveUIState();
        });
    });

    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
        ['search-input', 'filter-recruiter', 'filter-tech'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        state.filters = { text: '', recruiter: '', tech: '', status: '' };
        document.querySelectorAll('#view-candidates .btn-toggle').forEach(b => b.classList.remove('active'));
        document.querySelector('#view-candidates .btn-toggle[data-status=""]')?.classList.add('active');
        state.pagination.cand.current = 1;
        renderCandidateTable();
        if (typeof storageManager !== 'undefined') storageManager.saveUIState();
    });
}

/* ==========================================================================
   8. DASHBOARD CHARTS & STATS
   ========================================================================= */
let recChartInstance = null;
let techChartInstance = null;

function renderDashboardCharts() {
    let candData = state.candidates.filter(c => c.status !== 'Placed');
    if (state.userRole === 'Employee' && state.user) candData = candData.filter(c => c.recruiter === state.user.email.toLowerCase());

    const recCounts = {};
    const techCounts = {};

    candData.forEach(c => {
        const rEmail = c.recruiter?.trim();
        const rName = state.metadata.recruiters.find(r => r.value === rEmail)?.display || 'Unassigned';
        recCounts[rName] = (recCounts[rName] || 0) + 1;
        
        let tRaw = c.tech?.trim() || 'Other';
        const existingKey = Object.keys(techCounts).find(k => k.toLowerCase() === tRaw.toLowerCase());
        const t = existingKey || tRaw;
        techCounts[t] = (techCounts[t] || 0) + 1;
    });

    const recWrapper = document.querySelector('.large-chart .canvas-wrapper');
    if (recWrapper) {
        const requiredWidth = Math.max(100, Object.keys(recCounts).length * 60);
        recWrapper.innerHTML = `<div class="canvas-scroll-inner" style="width: ${requiredWidth > 100 ? requiredWidth + 'px' : '100%'}"><canvas id="chart-recruiter"></canvas></div>`;
    }

    const ctxRec = document.getElementById('chart-recruiter');
    if (ctxRec) {
        if (recChartInstance) recChartInstance.destroy();
        recChartInstance = new Chart(ctxRec, {
            type: 'bar',
            data: {
                labels: Object.keys(recCounts),
                datasets: [{ label: 'Candidates Assigned', data: Object.values(recCounts), backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } }
        });
    }

    const techWrapper = document.querySelector('.small-chart .canvas-wrapper');
    if (techWrapper) techWrapper.innerHTML = `<div class="canvas-scroll-inner" style="width: 100%;"><canvas id="chart-tech"></canvas></div>`;

    const ctxTech = document.getElementById('chart-tech');
    if (ctxTech) {
        if (techChartInstance) techChartInstance.destroy();
        techChartInstance = new Chart(ctxTech, {
            type: 'doughnut',
            data: {
                labels: Object.keys(techCounts),
                datasets: [{ data: Object.values(techCounts), backgroundColor: ['rgba(6,182,212,0.7)', 'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)', 'rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)'], borderWidth: 2 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    }
}

function updateDashboardStats() {
    let candData = state.candidates.filter(c => c.status !== 'Placed');
    let placedData = state.placements;
    if (state.userRole === 'Employee' && state.user) {
        const myEmail = state.user.email.toLowerCase();
        candData = candData.filter(c => c.recruiter === myEmail);
        placedData = placedData.filter(c => c.recruiter === myEmail);
    }

    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setStat('stat-total', candData.length);
    setStat('stat-active', candData.filter(c => c.status === 'Active').length);
    setStat('stat-inactive', candData.filter(c => c.status === 'Inactive').length);
    setStat('stat-placed', placedData.length);
    
    const uniqueTechs = new Set(candData.map(c => c.tech?.trim().toLowerCase()).filter(Boolean));
    setStat('stat-tech', uniqueTechs.size);
    setStat('stat-rec', state.employees.length);
}

/* ==========================================================================
   9. ALIGNMENT, DRAG/DROP & RESIZING
   ========================================================================= */
window.cycleAlign = (context, colName) => {
    const modes = ['left', 'center', 'right'];
    const current = state.alignments[context][colName] || 'left';
    const next = modes[(modes.indexOf(current) + 1) % 3];
    state.alignments[context][colName] = next;
    refreshViewForType(context);
};

window.cycleAlignAll = (context) => {
    const modes = ['left', 'center', 'right'];
    const current = state.alignments[context]['global'] || 'left';
    const next = modes[(modes.indexOf(current) + 1) % 3];
    state.alignments[context]['global'] = next;
    refreshViewForType(context);
    showToast(`All columns aligned ${next}`);
};

function applyAlignStyles(context, tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = Array.from(table.querySelectorAll('th'));
    const config = state.alignments[context] || {};
    let rules = '';

    headers.forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div) {
            const colName = div.dataset.colname;
            const val = config[colName] || config['global'] || 'left';
            if (val !== 'left') rules += `#${tableId} th:nth-child(${idx + 1}), #${tableId} td:nth-child(${idx + 1}) { text-align: ${val} !important; }\n`;
        }
    });

    let style = document.getElementById(`align-style-${context}`);
    if (!style) {
        style = document.createElement('style');
        style.id = `align-style-${context}`;
        document.head.appendChild(style);
    }
    style.innerHTML = rules;
}

function thAlign(title, context) {
    const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left';
    const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right');
    const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : '';
    return `<div data-colname="${title}" style="display:flex; align-items:center; width:100%;"><span style="flex:1; text-align:${dir};">${title}</span><i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')"></i></div>`;
}

let dragColIndex = null;
let dragTableId = null;

function initColumnDragDrop(tableId, context) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = table.querySelectorAll('th');

    headers.forEach((th, index) => {
        if (index < 4) return;
        th.setAttribute('draggable', 'true');
        th.classList.add('draggable-col');

        th.ondragstart = (e) => {
            e.stopPropagation();
            dragColIndex = Array.from(th.parentNode.children).indexOf(th);
            dragTableId = tableId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'col_drag');
            th.style.opacity = '0.5';
        };
        th.ondragover = (e) => {
            e.preventDefault(); e.stopPropagation();
            if (index < 4 || dragTableId !== tableId) return false;
            e.dataTransfer.dropEffect = 'move';
            th.classList.add('drag-over');
            return false;
        };
        th.ondragleave = () => th.classList.remove('drag-over');
        th.ondragend = () => {
            th.style.opacity = '1';
            headers.forEach(h => h.classList.remove('drag-over'));
        };
        th.ondrop = (e) => {
            e.stopPropagation(); e.preventDefault();
            th.classList.remove('drag-over');
            if (index < 4 || dragTableId !== tableId || dragColIndex === null) return;
            const dropColIndex = Array.from(th.parentNode.children).indexOf(th);
            if (dragColIndex !== dropColIndex) {
                moveColumnDOM(table, dragColIndex, dropColIndex);
                saveColumnOrder(tableId, context);
                applyAlignStyles(context, tableId);
            }
            dragColIndex = null;
            return false;
        };
    });
}

function moveColumnDOM(table, fromIdx, toIdx) {
    if (fromIdx === toIdx) return;
    const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].children;
        if (fromIdx < cells.length && toIdx < cells.length) {
            const target = cells[toIdx];
            const source = cells[fromIdx];
            if (fromIdx < toIdx) rows[i].insertBefore(source, target.nextSibling);
            else rows[i].insertBefore(source, target);
        }
    }
}

function saveColumnOrder(tableId, context) {
    const table = document.getElementById(tableId);
    const headers = table.querySelectorAll('th');
    const order = [];
    headers.forEach((th, idx) => {
        if (idx < 4) return;
        const div = th.querySelector('[data-colname]');
        if (div?.dataset.colname) order.push(div.dataset.colname);
    });
    state.colOrders[context] = order;
    try { db.collection('settings').doc('table_config').set({ colOrders: state.colOrders }, { merge: true }); } catch(e) {}
}

function restoreColumnOrder(tableId, context) {
    const savedOrder = state.colOrders?.[context];
    if (!savedOrder?.length) return;
    const table = document.getElementById(tableId);
    if (!table) return;

    savedOrder.forEach((colName, desiredRelativeIdx) => {
        const desiredDOMIdx = desiredRelativeIdx + 4;
        const headers = Array.from(table.querySelectorAll('th'));
        let currentDOMIdx = -1;
        for (let i = 4; i < headers.length; i++) {
            const div = headers[i].querySelector('[data-colname]');
            if (div?.dataset.colname === colName) { currentDOMIdx = i; break; }
        }
        if (currentDOMIdx !== -1 && currentDOMIdx !== desiredDOMIdx && desiredDOMIdx < headers.length) {
            moveColumnDOM(table, currentDOMIdx, desiredDOMIdx);
        }
    });
}

let startX, startWidth, resizingTh;
window.initResize = function (e) {
    e.stopPropagation(); e.preventDefault();
    resizingTh = e.target.closest('th');
    startX = e.pageX;
    startWidth = resizingTh.offsetWidth;
    resizingTh.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
};
function doResize(e) {
    if (!resizingTh) return;
    const newWidth = startWidth + (e.pageX - startX);
    if (newWidth > 50) {
        resizingTh.style.width = `${newWidth}px`;
        resizingTh.style.minWidth = `${newWidth}px`;
        resizingTh.style.maxWidth = `${newWidth}px`;
    }
}
function stopResize() {
    if (resizingTh) { resizingTh.classList.remove('active'); resizingTh = null; }
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
}

/* ==========================================================================
   10. CUSTOM COLUMNS
   ========================================================================= */
let activeColumnContext = null;
window.openAddColumnModal = (context) => {
    activeColumnContext = context;
    const modal = document.getElementById('add-column-modal');
    modal.style.display = 'flex';
    document.getElementById('new-col-name').focus();

    let manageSection = document.getElementById('column-manage-section');
    if (!manageSection) {
        manageSection = document.createElement('div');
        manageSection.id = 'column-manage-section';
        manageSection.style.marginTop = '20px';
        manageSection.style.paddingTop = '15px';
        manageSection.style.borderTop = '1px solid var(--glass-border)';
        const actions = modal.querySelector('.modal-actions');
        modal.querySelector('.glass-panel').insertBefore(manageSection, actions);
    }

    const currentCols = state.customColumns[context] || [];
    if (currentCols.length > 0) {
        manageSection.innerHTML = `<h4 style="color:var(--text-muted); font-size:0.8rem; margin-bottom:10px;">MANAGE CUSTOM COLUMNS</h4>
            <div style="max-height:100px; overflow-y:auto; padding-right:5px;">
                ${currentCols.map((col, idx) => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:4px;"><span style="font-size:0.85rem; color:var(--text-main);">${col.name}</span><i class="fa-solid fa-trash text-danger" style="cursor:pointer;" onclick="deleteCustomColumn('${context}', ${idx})"></i></div>`).join('')}
            </div>`;
        manageSection.style.display = 'block';
    } else {
        manageSection.style.display = 'none';
    }
};

window.closeColumnModal = () => {
    document.getElementById('add-column-modal').style.display = 'none';
    document.getElementById('new-col-name').value = '';
    activeColumnContext = null;
};

window.executeAddColumn = async () => {
    const name = document.getElementById('new-col-name').value.trim();
    const type = document.getElementById('new-col-type').value;
    if (!name || !activeColumnContext) return;

    const key = name.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
    if (!state.customColumns[activeColumnContext]) state.customColumns[activeColumnContext] = [];
    state.customColumns[activeColumnContext].push({ name, key, type });

    await saveAndRefreshColumns(activeColumnContext, `Column "${name}" Added`);
    document.getElementById('new-col-name').value = '';
    openAddColumnModal(activeColumnContext);
};

window.deleteCustomColumn = async (context, index) => {
    if (!confirm("Delete this column?")) return;
    state.customColumns[context].splice(index, 1);
    await saveAndRefreshColumns(context, "Column Removed");
    openAddColumnModal(context);
};

async function saveAndRefreshColumns(context, msg) {
    try {
        await db.collection('settings').doc('table_config').set({ [context]: state.customColumns[context] }, { merge: true });
        showToast(msg);
        refreshViewForType(context);
    } catch (e) {
        showToast("Error saving configuration");
    }
}

/* ==========================================================================
   11. MODERN INSTANT ROW ADDITION (AIRTABLE/NOTION STYLE)
   ========================================================================= */
window.addNewRecord = async (collection) => {
    const ts = Date.now();
    // BIND TO EMAIL: Automatically assign to the logged-in user's email
    const recruiterEmail = (state.userRole === 'Employee' && state.user) ? state.user.email.toLowerCase() : '';
    const today = new Date().toISOString().split('T')[0];

    let defaultData = { 
        orderIndex: -ts, 
        createdAt: ts,
        recruiter: recruiterEmail 
    };

    if (collection === 'candidates') {
        Object.assign(defaultData, { first: 'New Candidate', last: '', mobile: '', wa: '', tech: '', status: 'Active', assigned: today, comments: '', linkedin: '', resume: '', trackingSheet: '', submissionLog: [], screeningLog: [], interviewLog: [] });
    } else if (collection === 'employees') {
        Object.assign(defaultData, { first: 'New Employee', last: '', dob: '', designation: '', workMobile: '', personalMobile: '', officialEmail: '', personalEmail: '' });
    } else if (collection === 'onboarding') {
        Object.assign(defaultData, { first: 'New Record', last: '', dob: '', mobile: '', status: 'Onboarding', assigned: today, comments: '' });
    } else if (collection === 'placements') {
        Object.assign(defaultData, { first: 'New Placement', last: '', tech: '', location: '', contract: '', assigned: today, actions: '', status: 'Placed' });
    }

    const customCols = state.customColumns[collection] || [];
    customCols.forEach(col => defaultData[col.key] = '');

    try {
        const docRef = await db.collection(collection).add(defaultData);
        setTimeout(() => {
            const newRow = document.querySelector(`tr[data-id="${docRef.id}"]`);
            if (newRow) {
                const firstCell = newRow.querySelector('[data-field="first"]');
                if (firstCell) firstCell.click();
            }
        }, 500);
    } catch (e) {
        defaultData.id = 'local_' + ts;
        state[collection].unshift(defaultData);
        localStorage.setItem(`np_data_${collection}`, JSON.stringify(state[collection]));
        refreshViewForType(collection);
        
        setTimeout(() => {
            const newRow = document.querySelector(`tr[data-id="${defaultData.id}"]`);
            if (newRow) {
                const firstCell = newRow.querySelector('[data-field="first"]');
                if (firstCell) firstCell.click();
            }
        }, 100);
    }
};

window.addInlineCandidateRow = () => window.addNewRecord('candidates');
window.addInlineEmployeeRow = () => window.addNewRecord('employees');
window.addInlineOnboardingRow = () => window.addNewRecord('onboarding');
window.addInlinePlacementRow = () => window.addNewRecord('placements');

/* ==========================================================================
   12. TABLE RENDERING, PAGINATION & DATA ISOLATION
   ========================================================================= */
function refreshViewForType(type) {
    const renderMap = {
        cand: renderCandidateTable, candidates: renderCandidateTable,
        emp: renderEmployeeTable, employees: renderEmployeeTable,
        onb: renderOnboardingTable, onboarding: renderOnboardingTable,
        hub: renderHubTable, place: renderPlacementTable, placements: renderPlacementTable
    };
    if (renderMap[type]) renderMap[type]();
}

window.changePage = (type, direction) => {
    const config = state.pagination[type];
    if (!config) return;
    
    let data = [];
    if (type === 'cand') data = getFilteredData(state.candidates, state.filters);
    else if (type === 'emp') data = state.employees.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.empFilters.text));
    else if (type === 'onb') data = state.onboarding.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.onbFilters.text));
    else if (type === 'place') {
        const mVal = document.getElementById('placement-month-picker')?.value;
        const yVal = document.getElementById('placement-year-picker')?.value;
        data = state.placements.filter(c => c.assigned && ((state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal)));
    } else if (type === 'hub') {
        const { start, end } = state.hub.range;
        const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; };
        data = state.candidates.filter(c => [...(c.submissionLog || []), ...(c.screeningLog || []), ...(c.interviewLog || [])].some(isInRange));
    }

    const maxPages = Math.ceil(data.length / config.limit) || 1;
    let newPage = config.current + direction;
    if (newPage < 1) newPage = 1;
    if (newPage > maxPages) newPage = maxPages;
    if (config.current !== newPage) {
        config.current = newPage;
        refreshViewForType(type);
        storageManager.saveUIState();
    }
}

function getFilteredData(data, filters) {
    let subset = data;
    // BIND TO EMAIL: Filter by logged in user for pagination/display
    if (state.userRole === 'Employee' && state.user) {
        subset = subset.filter(item => item.recruiter === state.user.email.toLowerCase());
    }
    return subset.filter(item => {
        if (item.status === 'Placed') return false;
        const matchesText = `${item.first} ${item.last} ${item.tech || ''}`.toLowerCase().includes(filters.text);
        const matchRec = filters.recruiter ? item.recruiter === filters.recruiter : true;
        const matchTech = filters.tech ? item.tech === filters.tech : true;
        const matchStatus = filters.status ? item.status === filters.status : true;
        return matchesText && matchRec && matchTech && matchStatus;
    });
}

const renderUrlCell = (val, id, field, col) => 
    `<td style="text-align:center;" tabindex="0" data-field="${field}" onclick="inlineUrlEdit('${id}', '${field}', '${col}', this)">
        ${val ? `<a href="${val}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}
    </td>`;

const renderCustomCells = (item, collectionName) => {
    return (state.customColumns[collectionName] || []).map(col => {
        const val = item[col.key] || '';
        if (col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${item.id}', '${col.key}', '${collectionName}', this.value)"></td>`;
        if (col.type === 'url') return renderUrlCell(val, item.id, col.key, collectionName);
        return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${item.id}', '${col.key}', '${collectionName}', this)">${val}</td>`;
    }).join('');
};

function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');

    const config = state.pagination.cand;
    const totalPages = Math.ceil(filtered.length / config.limit) || 1;
    if (config.current > totalPages) config.current = totalPages;
    const startIndex = (config.current - 1) * config.limit;
    const paginatedData = filtered.slice(startIndex, startIndex + config.limit);

    const validIds = new Set(filtered.map(c => c.id));
    state.selection.cand.forEach(id => { if (!validIds.has(id)) state.selection.cand.delete(id); });
    updateSelectButtons('cand');

    const isAllChecked = paginatedData.length > 0 && paginatedData.every(c => state.selection.cand.has(c.id));
    const customHeaders = (state.customColumns.candidates || []).map(col => `<th>${thAlign(col.name, 'candidates')}</th>`).join('');

    thead.innerHTML = `<tr>
        <th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')"></i></div></th>
        <th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th>
        <th>${thAlign('#', 'candidates')}</th>
        <th>${thAlign('First Name', 'candidates')}</th>
        <th class="divider-col" style="position:relative;">${thAlign('Last Name', 'candidates')}<div class="resizer" onmousedown="initResize(event)"></div></th>
        <th>${thAlign('Mobile', 'candidates')}</th>
        <th>${thAlign('WhatsApp', 'candidates')}</th>
        <th>${thAlign('Tech', 'candidates')}</th>
        <th>${thAlign('Recruiter', 'candidates')}</th>
        <th style="width: 140px;">${thAlign('Status', 'candidates')}</th>
        <th>${thAlign('Assigned', 'candidates')}</th>
        <th>${thAlign('Comments', 'candidates')}</th>
        <th>${thAlign('LinkedIn', 'candidates')}</th>
        <th>${thAlign('Resume', 'candidates')}</th>
        <th>${thAlign('Tracking', 'candidates')}</th>
        ${customHeaders}
    </tr>`;

    if (document.getElementById('cand-footer-count')) {
        document.getElementById('cand-footer-count').innerText = `Total: ${filtered.length} records`;
        if (document.getElementById('cand-page-indicator')) document.getElementById('cand-page-indicator').innerText = `Page ${config.current} of ${totalPages}`;
    }

    tbody.innerHTML = paginatedData.map((c, i) => {
        const actualIndex = startIndex + i + 1;
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive';
        const orderVal = c.orderIndex ?? -c.createdAt;

        return `<tr class="${rowClass}" data-id="${c.id}" data-collection="candidates" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'candidates')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'candidates')">
            <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical"></i></td>
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
            <td>${actualIndex}</td>
            <td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first || ''}</td>
            <td class="divider-col" tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last || ''}</td>
            <td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile || ''}</td>
            <td tabindex="0" data-field="wa" onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa || ''}</td>
            <td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech || ''}</td>
            <td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td>
            <td style="overflow:visible;">
                <div class="action-dropdown-container">
                    <div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${c.status || 'Inactive'} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div>
                    <div id="menu-${c.id}" class="custom-dropdown-menu">
                        <div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div>
                        <div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div>
                        <div class="dropdown-option" onclick="moveToPlacements('${c.id}')"><span style="width:8px; height:8px; background:#f59e0b; border-radius:50%; display:inline-block;"></span> Move to Placements</div>
                        <div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div>
                    </div>
                </div>
            </td>
            <td><input type="date" class="date-input-modern" value="${c.assigned || ''}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments || ''}</td>
            ${renderUrlCell(c.linkedin, c.id, 'linkedin', 'candidates')}
            ${renderUrlCell(c.resume, c.id, 'resume', 'candidates')}
            ${renderUrlCell(c.trackingSheet, c.id, 'trackingSheet', 'candidates')}
            ${renderCustomCells(c, 'candidates')}
        </tr>`;
    }).join('');

    restoreColumnOrder('candidates-table', 'candidates');
    applyAlignStyles('candidates', 'candidates-table');
    initColumnDragDrop('candidates-table', 'candidates');
}

function renderEmployeeTable() {
    let filtered = state.employees;
    if (state.userRole === 'Employee' && state.user) filtered = filtered.filter(e => e.officialEmail === state.user.email.toLowerCase());
    filtered = filtered.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.empFilters.text));
    
    const config = state.pagination.emp;
    const totalPages = Math.ceil(filtered.length / config.limit) || 1;
    if (config.current > totalPages) config.current = totalPages;
    const startIndex = (config.current - 1) * config.limit;
    const paginatedData = filtered.slice(startIndex, startIndex + config.limit);

    const validIds = new Set(filtered.map(c => c.id));
    state.selection.emp.forEach(id => { if (!validIds.has(id)) state.selection.emp.delete(id); });
    updateSelectButtons('emp');

    const isAllChecked = paginatedData.length > 0 && paginatedData.every(e => state.selection.emp.has(e.id));
    const customHeaders = (state.customColumns.employees || []).map(col => `<th>${thAlign(col.name, 'employees')}</th>`).join('');

    document.getElementById('employee-table-head').innerHTML = `<tr>
        <th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('employees')"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('employees')"></i></div></th>
        <th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th>
        <th>${thAlign('#', 'employees')}</th>
        <th>${thAlign('First Name', 'employees')}</th>
        <th>${thAlign('Last Name', 'employees')}</th>
        <th>${thAlign('Date of Birth', 'employees')}</th>
        <th>${thAlign('Designation', 'employees')}</th>
        <th>${thAlign('Work Mobile', 'employees')}</th>
        <th>${thAlign('Personal Mobile', 'employees')}</th>
        <th>${thAlign('Official Email', 'employees')}</th>
        <th>${thAlign('Personal Email', 'employees')}</th>
        ${customHeaders}
    </tr>`;

    if (document.getElementById('emp-footer-count')) {
        document.getElementById('emp-footer-count').innerText = `Total: ${filtered.length} records`;
        if (document.getElementById('emp-page-indicator')) document.getElementById('emp-page-indicator').innerText = `Page ${config.current} of ${totalPages}`;
    }

    document.getElementById('employee-table-body').innerHTML = paginatedData.map((c, i) => {
        const actualIndex = startIndex + i + 1;
        const isSel = state.selection.emp.has(c.id) ? 'checked' : '';
        const orderVal = c.orderIndex ?? -c.createdAt;
        return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="employees" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'employees')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'employees')">
            <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical"></i></td>
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td>
            <td>${actualIndex}</td>
            <td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first || ''}</td>
            <td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last || ''}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob || ''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td>
            <td tabindex="0" data-field="designation" onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation || ''}</td>
            <td tabindex="0" data-field="workMobile" onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile || ''}</td>
            <td tabindex="0" data-field="personalMobile" onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile || ''}</td>
            <td tabindex="0" data-field="officialEmail" onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail || ''}</td>
            <td tabindex="0" data-field="personalEmail" onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail || ''}</td>
            ${renderCustomCells(c, 'employees')}
        </tr>`;
    }).join('');

    restoreColumnOrder('employee-table', 'employees');
    applyAlignStyles('employees', 'employee-table');
    initColumnDragDrop('employee-table', 'employees');
}

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.onbFilters.text));
    const config = state.pagination.onb;
    const totalPages = Math.ceil(filtered.length / config.limit) || 1;
    if (config.current > totalPages) config.current = totalPages;
    const startIndex = (config.current - 1) * config.limit;
    const paginatedData = filtered.slice(startIndex, startIndex + config.limit);

    const validIds = new Set(filtered.map(c => c.id));
    state.selection.onb.forEach(id => { if (!validIds.has(id)) state.selection.onb.delete(id); });
    updateSelectButtons('onb');

    const isAllChecked = paginatedData.length > 0 && paginatedData.every(o => state.selection.onb.has(o.id));
    const customHeaders = (state.customColumns.onboarding || []).map(col => `<th>${thAlign(col.name, 'onboarding')}</th>`).join('');

    document.getElementById('onboarding-table-head').innerHTML = `<tr>
        <th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('onboarding')"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('onboarding')"></i></div></th>
        <th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th>
        <th>${thAlign('#', 'onboarding')}</th>
        <th>${thAlign('First Name', 'onboarding')}</th>
        <th class="divider-col" style="position:relative;">${thAlign('Last Name', 'onboarding')}<div class="resizer" onmousedown="initResize(event)"></div></th>
        <th>${thAlign('Date of Birth', 'onboarding')}</th>
        <th>${thAlign('Recruiter', 'onboarding')}</th>
        <th>${thAlign('Mobile', 'onboarding')}</th>
        <th>${thAlign('Status', 'onboarding')}</th>
        <th>${thAlign('Assigned', 'onboarding')}</th>
        <th>${thAlign('Comments', 'onboarding')}</th>
        ${customHeaders}
    </tr>`;

    if (document.getElementById('onb-footer-count')) {
        document.getElementById('onb-footer-count').innerText = `Total: ${filtered.length} records`;
        if (document.getElementById('onb-page-indicator')) document.getElementById('onb-page-indicator').innerText = `Page ${config.current} of ${totalPages}`;
    }

    document.getElementById('onboarding-table-body').innerHTML = paginatedData.map((c, i) => {
        const actualIndex = startIndex + i + 1;
        const isSel = state.selection.onb.has(c.id) ? 'checked' : '';
        const orderVal = c.orderIndex ?? -c.createdAt;
        return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="onboarding" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'onboarding')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'onboarding')">
            <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical"></i></td>
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td>
            <td>${actualIndex}</td>
            <td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first || ''}</td>
            <td class="divider-col" tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last || ''}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob || ''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td>
            <td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td>
            <td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile || ''}</td>
            <td>
                <select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)">
                    <option value="Onboarding" ${c.status === 'Onboarding' ? 'selected' : ''}>Onboarding</option>
                    <option value="Completed" ${c.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </td>
            <td><input type="date" class="date-input-modern" value="${c.assigned || ''}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td>
            <td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments || ''}</td>
            ${renderCustomCells(c, 'onboarding')}
        </tr>`;
    }).join('');

    restoreColumnOrder('onboarding-table', 'onboarding');
    applyAlignStyles('onboarding', 'onboarding-table');
    initColumnDragDrop('onboarding-table', 'onboarding');
}

function renderPlacementTable() {
    const mVal = document.getElementById('placement-month-picker')?.value;
    const yVal = document.getElementById('placement-year-picker')?.value;
    let placed = state.placements;

    if (state.userRole === 'Employee' && state.user) placed = placed.filter(c => c.recruiter === state.user.email.toLowerCase());
    placed = placed.filter(c => c.assigned && ((state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal)));

    const config = state.pagination.place;
    const totalPages = Math.ceil(placed.length / config.limit) || 1;
    if (config.current > totalPages) config.current = totalPages;
    const startIndex = (config.current - 1) * config.limit;
    const paginatedData = placed.slice(startIndex, startIndex + config.limit);

    if (!state.selection.place) state.selection.place = new Set();
    const validIds = new Set(placed.map(c => c.id));
    state.selection.place.forEach(id => { if (!validIds.has(id)) state.selection.place.delete(id); });
    updateSelectButtons('place');

    const isAllChecked = paginatedData.length > 0 && paginatedData.every(p => state.selection.place.has(p.id));
    const thead = document.querySelector('#placement-table-head');
    const customHeaders = (state.customColumns.placements || []).map(col => `<th>${thAlign(col.name, 'placements')}</th>`).join('');

    if (thead) {
        thead.innerHTML = `<tr>
            <th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('placements')"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('placements')"></i></div></th>
            <th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th>
            <th style="width:50px;">${thAlign('#', 'placements')}</th>
            <th>${thAlign('First Name', 'placements')}</th>
            <th class="divider-col" style="position:relative;">${thAlign('Last Name', 'placements')}<div class="resizer" onmousedown="initResize(event)"></div></th>
            <th>${thAlign('Tech', 'placements')}</th>
            <th>${thAlign('Location', 'placements')}</th>
            <th>${thAlign('Contract', 'placements')}</th>
            <th>${thAlign('Assigned', 'placements')}</th>
            <th>${thAlign('Actions', 'placements')}</th>
            ${customHeaders}
        </tr>`;
    }

    if (document.getElementById('placement-footer-count')) {
        document.getElementById('placement-footer-count').innerText = `Total: ${placed.length} records`;
        if (document.getElementById('place-page-indicator')) document.getElementById('place-page-indicator').innerText = `Page ${config.current} of ${totalPages}`;
    }

    const tbody = document.getElementById('placement-table-body');
    if (tbody) {
        tbody.innerHTML = paginatedData.map((c, i) => {
            const actualIndex = startIndex + i + 1;
            const isSel = state.selection.place.has(c.id) ? 'checked' : '';
            const rowClass = state.selection.place.has(c.id) ? 'selected-row' : '';
            const orderVal = c.orderIndex ?? -c.createdAt;
            return `<tr class="${rowClass}" data-id="${c.id}" data-collection="placements" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'placements')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'placements')">
                <td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical"></i></td>
                <td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td>
                <td>${actualIndex}</td>
                <td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'placements', this)">${c.first || ''}</td>
                <td class="divider-col" style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'placements', this)">${c.last || ''}</td>
                <td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'placements', this)" class="text-cyan">${c.tech || ''}</td>
                <td tabindex="0" data-field="location" onclick="inlineEdit('${c.id}', 'location', 'placements', this)">${c.location || ''}</td>
                <td tabindex="0" data-field="contract" onclick="inlineEdit('${c.id}', 'contract', 'placements', this)">${c.contract || ''}</td>
                <td><input type="date" class="date-input-modern" value="${c.assigned || ''}" onchange="inlineDateEdit('${c.id}', 'assigned', 'placements', this.value)"></td>
                <td tabindex="0" data-field="actions" onclick="inlineEdit('${c.id}', 'actions', 'placements', this)">${c.actions || ''}</td>
                ${renderCustomCells(c, 'placements')}
            </tr>`;
        }).join('');
    }

    restoreColumnOrder('placement-table', 'placements');
    applyAlignStyles('placements', 'placement-table');
    initColumnDragDrop('placement-table', 'placements');
}

function renderHubTable() {
    let data = state.candidates;
    if (state.userRole === 'Employee' && state.user) data = data.filter(c => c.recruiter === state.user.email.toLowerCase());
    if (state.hubFilters?.text) data = data.filter(c => `${c.first} ${c.last} ${c.tech || ''}`.toLowerCase().includes(state.hubFilters.text));

    const { start, end } = state.hub.range;
    const isInRange = (entry) => {
        const t = new Date(entry.date || entry).getTime();
        return t >= start && t <= end;
    };

    const activeCandidates = data.filter(c => 
        (c.submissionLog || []).some(isInRange) || 
        (c.screeningLog || []).some(isInRange) || 
        (c.interviewLog || []).some(isInRange)
    );

    const config = state.pagination.hub;
    const totalPages = Math.ceil(activeCandidates.length / config.limit) || 1;
    if (config.current > totalPages) config.current = totalPages;
    const startIndex = (config.current - 1) * config.limit;
    const paginatedData = activeCandidates.slice(startIndex, startIndex + config.limit);

    if (!state.selection.hub) state.selection.hub = new Set();
    const validIds = new Set(activeCandidates.map(c => c.id));
    state.selection.hub.forEach(id => { if (!validIds.has(id)) state.selection.hub.delete(id); });
    updateSelectButtons('hub');

    const isAllChecked = paginatedData.length > 0 && paginatedData.every(c => state.selection.hub.has(c.id));

    document.getElementById('hub-table-head').innerHTML = `<tr>
        <th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('hub')"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('hub')"></i></div></th>
        <th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th>
        <th style="width:50px;">${thAlign('#', 'hub')}</th>
        <th style="width:150px;">${thAlign('Candidate Name', 'hub')}</th>
        <th style="width:150px;">${thAlign('Recruiter', 'hub')}</th>
        <th class="divider-col" style="width:120px; position:relative;">${thAlign('Technology', 'hub')}<div class="resizer" onmousedown="initResize(event)"></div></th>
        <th style="text-align:center;">${thAlign('Submission', 'hub')}</th>
        <th style="text-align:center;">${thAlign('Screenings', 'hub')}</th>
        <th style="text-align:center;">${thAlign('Interview', 'hub')}</th>
        <th style="text-align:right;">${thAlign('Date', 'hub')}</th>
    </tr>`;

    if (document.getElementById('hub-footer-count')) {
        document.getElementById('hub-footer-count').innerText = `Total: ${activeCandidates.length} records`;
        if (document.getElementById('hub-page-indicator')) document.getElementById('hub-page-indicator').innerText = `Page ${config.current} of ${totalPages}`;
    }

    const tbody = document.getElementById('hub-table-body');
    if (activeCandidates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`;
        return;
    }

    tbody.innerHTML = paginatedData.map((c, i) => {
        const actualIndex = startIndex + i + 1;
        const sub = (c.submissionLog || []).filter(isInRange).length;
        const scr = (c.screeningLog || []).filter(isInRange).length;
        const int = (c.interviewLog || []).filter(isInRange).length;

        let displayDate = '-';
        const logsInRange = [...(c.submissionLog || []).filter(isInRange), ...(c.screeningLog || []).filter(isInRange), ...(c.interviewLog || []).filter(isInRange)];
        if (logsInRange.length > 0) {
            logsInRange.sort((a, b) => new Date(b.date || b) - new Date(a.date || a));
            const latest = logsInRange[0];
            displayDate = (typeof latest === 'string') ? latest : (latest.date || '-');
        }

        const isSel = state.selection.hub.has(c.id) ? 'checked' : '';
        const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';
        const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        const orderVal = c.orderIndex ?? -c.createdAt;

        let html = `<tr style="cursor:pointer; ${activeStyle}" class="${state.selection.hub.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="hub" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'hub')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'hub')">
            <td class="drag-handle-cell" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical"></i></td>
            <td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td>
            <td>${actualIndex}</td>
            <td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first} ${c.last}</td>
            <td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td>
            <td class="divider-col">${generateTechDropdown(c.tech, c.id, 'candidates')}</td>
            <td class="text-cyan" style="font-weight:bold; font-size:1.1rem; text-align:center;" onclick="toggleHubRow('${c.id}')">${sub}</td>
            <td class="text-gold" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${scr}</td>
            <td class="text-purple" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${int}</td>
            <td style="font-size:0.8rem; color:var(--text-muted); text-align:right;" onclick="toggleHubRow('${c.id}')">${displayDate} <span style="margin-left: 8px; opacity:0.7;">${caret}</span></td>
        </tr>`;

        if (isExpanded) {
            const renderTimeline = (list, type) => {
                const visibleLogs = (list || []).filter(isInRange);
                if (visibleLogs.length === 0) return `<li class="hub-log-item" style="opacity:0.5; font-style:italic;">No records.</li>`;
                return visibleLogs.map((entry, index) => {
                    const isLegacy = typeof entry === 'string';
                    const dateStr = isLegacy ? entry : entry.date;
                    const subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject');
                    const link = !isLegacy && entry.link ? entry.link : null;
                    const icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');

                    return `<li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div style="display:flex; justify-content:space-between; width:100%;">
                            <span class="log-date" style="color:var(--primary); font-weight:bold; font-size:0.85rem;"><i class="fa-solid ${icon}"></i> ${dateStr}</span>
                            ${!isLegacy && entry.recruiter ? `<span style="font-size:0.7rem; opacity:0.6;">${entry.recruiter}</span>` : ''}
                        </div>
                        <div style="font-weight:500; color:#fff; font-size:0.9rem;">${subject}</div>
                        ${link ? `<a href="${link}" target="_blank" class="hub-link-btn" style="margin-top:5px; text-decoration:none; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--primary); font-size:0.8rem;">View Email</a>` : ''}
                        <div style="text-align:right; width:100%; margin-top:5px;">
                            <button class="hub-action-btn delete" style="color: #ef4444; background:none; border:none; cursor:pointer;" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${type === 'sub' ? 'submissionLog' : type === 'scr' ? 'screeningLog' : 'interviewLog'}', ${index})"><i class="fa-solid fa-trash"></i> Remove</button>
                        </div>
                    </li>`;
                }).join('');
            };

            html += `<tr class="hub-details-row"><td colspan="10" style="padding:0; border:none;">
                <div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()">
                    <div class="hub-col cyan">
                        <div class="hub-col-header cyan">RTR & Submissions <button onclick="triggerHubNote('${c.id}', 'submissionLog')" style="float:right; background:none; border:none; color:#06b6d4; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll">${renderTimeline(c.submissionLog, 'sub')}</ul>
                    </div>
                    <div class="hub-col gold">
                        <div class="hub-col-header gold">Screenings <button onclick="triggerHubNote('${c.id}', 'screeningLog')" style="float:right; background:none; border:none; color:#f59e0b; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog, 'scr')}</ul>
                    </div>
                    <div class="hub-col purple">
                        <div class="hub-col-header purple">Interviews <button onclick="triggerHubNote('${c.id}', 'interviewLog')" style="float:right; background:none; border:none; color:#8b5cf6; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog, 'int')}</ul>
                    </div>
                </div>
            </td></tr>`;
        }
        return html;
    }).join('');

    restoreColumnOrder('hub-table', 'hub');
    applyAlignStyles('hub', 'hub-table');
    initColumnDragDrop('hub-table', 'hub');
}

/* ==========================================================================
   13. INLINE FIELD EDITING (AUTO-SAVE) & STATUS ACTIONS
   ========================================================================= */
window.inlineEdit = (id, field, col, el) => {
    if (el.querySelector('input')) return;
    
    // Clear placeholder text on edit
    let val = el.textContent.trim();
    if (['New Candidate', 'New Employee', 'New Record', 'New Placement'].includes(val)) {
        val = ''; 
    }

    el.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-input-active';
    input.value = val;
    input.onclick = (e) => e.stopPropagation();
    
    // Auto-save triggers the moment the user clicks away or presses Enter
    input.onblur = async () => {
        const newVal = input.value.trim();
        el.textContent = newVal || (field === 'first' ? 'Untitled' : ''); // Fallback if left blank
        
        if (newVal !== val) {
            aggressiveLocalSave(col, id, field, newVal);
            try {
                if (!id.startsWith('local_')) await db.collection(col).doc(id).update({ [field]: newVal });
                showToast("Auto-Saved");
            } catch (err) { showToast("Saved Locally"); }
        }
    };
    
    input.onkeydown = (e) => { 
        if (e.key === 'Enter') input.blur(); 
        if (e.key === 'Escape') { input.value = val; input.blur(); } 
    };
    
    el.appendChild(input);
    input.focus();
};

window.inlineDateEdit = async (id, field, col, val) => {
    aggressiveLocalSave(col, id, field, val);
    try {
        if (!id.startsWith('local_')) await db.collection(col).doc(id).update({ [field]: val });
        showToast("Date Auto-Saved");
    } catch (err) { showToast("Date Saved Locally"); }
};

window.inlineUrlEdit = (id, field, col, el) => {
    if (el.querySelector('input')) return;
    const item = state[col].find(x => x.id === id);
    const oldVal = item ? item[field] : '';
    let displayVal = oldVal ? oldVal.replace('mailto:', '').replace('https://', '').replace('http://', '') : '';

    el.innerHTML = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Paste Link...';
    input.className = 'url-input-active';
    input.value = displayVal;
    input.onclick = (e) => e.stopPropagation();

    const save = async () => {
        let newVal = input.value.trim();
        if (newVal && newVal.includes('@') && !newVal.includes('/')) newVal = 'mailto:' + newVal;
        else if (newVal && !newVal.startsWith('http') && !newVal.startsWith('mailto:')) newVal = 'https://' + newVal;

        if (newVal !== oldVal) {
            aggressiveLocalSave(col, id, field, newVal);
            try {
                if (!id.startsWith('local_')) await db.collection(col).doc(id).update({ [field]: newVal });
                showToast("Link Auto-Saved");
            } catch (e) { showToast("Link Saved Locally"); }
        }
        refreshViewForType(col);
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') refreshViewForType(col); });
    el.appendChild(input);
    input.focus();
    input.select();
};

window.toggleRowMenu = (id) => {
    document.querySelectorAll('.custom-dropdown-menu').forEach(el => { if (el.id !== `menu-${id}`) el.classList.remove('show'); });
    const menu = document.getElementById(`menu-${id}`);
    if (menu) menu.classList.toggle('show');

    const closeMenu = (e) => {
        if (!e.target.closest('.action-dropdown-container')) {
            if (menu) menu.classList.remove('show');
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
};

window.updateStatusAndClose = async (id, status) => {
    aggressiveLocalSave('candidates', id, 'status', status);
    try {
        if (!id.startsWith('local_')) await db.collection('candidates').doc(id).update({ status: status });
        showToast("Status updated");
    } catch(e) { showToast("Status saved locally"); }
    document.getElementById(`menu-${id}`)?.classList.remove('show');
    refreshViewForType('candidates');
};

window.updateStatus = async (id, col, val) => {
    aggressiveLocalSave(col, id, 'status', val);
    try {
        if (!id.startsWith('local_')) await db.collection(col).doc(id).update({ status: val });
        showToast("Status Auto-Saved");
    } catch(e) { showToast("Status saved locally"); }
};

window.editCustomStatus = async (id) => {
    const currentStatus = state.candidates.find(c => c.id === id)?.status || "";
    const newStatus = prompt("Enter new status detail:", currentStatus);
    if (newStatus && newStatus.trim() !== "") {
        updateStatusAndClose(id, newStatus.trim());
    }
    document.getElementById(`menu-${id}`)?.classList.remove('show');
};

window.moveToPlacements = async (id) => {
    const cand = state.candidates.find(c => c.id === id);
    if (!cand) return;
    document.getElementById(`menu-${id}`)?.classList.remove('show');
    
    const newPlaceData = { ...cand, status: 'Placed', assigned: new Date().toISOString().split('T')[0] };

    try {
        if (id.startsWith('local_')) {
            state.placements.push(newPlaceData);
            state.candidates = state.candidates.filter(c => c.id !== id);
            localStorage.setItem('np_data_candidates', JSON.stringify(state.candidates));
            localStorage.setItem('np_data_placements', JSON.stringify(state.placements));
            showToast("Locally moved to Placements");
        } else {
            const batch = db.batch();
            batch.set(db.collection('placements').doc(id), newPlaceData);
            batch.delete(db.collection('candidates').doc(id));
            await batch.commit();
            showToast("Moved to Placements");
        }
    } catch (e) { 
        showToast("Database error, forcing local move"); 
        state.placements.push(newPlaceData);
        state.candidates = state.candidates.filter(c => c.id !== id);
        localStorage.setItem('np_data_candidates', JSON.stringify(state.candidates));
        localStorage.setItem('np_data_placements', JSON.stringify(state.placements));
    }
    refreshViewForType('candidates');
    refreshViewForType('placements');
};

window.updatePlacementFilter = (type, btn) => {
    state.placementFilter = type;
    document.querySelectorAll('#view-placements .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const monthPicker = document.getElementById('placement-month-picker');
    const yearPicker = document.getElementById('placement-year-picker');
    if (type === 'monthly') {
        if (monthPicker) monthPicker.style.display = 'block';
        if (yearPicker) yearPicker.style.display = 'none';
    } else {
        if (monthPicker) monthPicker.style.display = 'none';
        if (yearPicker) yearPicker.style.display = 'block';
    }
    renderPlacementTable();
    storageManager.saveUIState();
};

window.deletePlacement = async (id) => {
    if (!confirm("Remove this placement?")) return;
    try {
        if (id.startsWith('local_')) {
            state.placements = state.placements.filter(c => c.id !== id);
            localStorage.setItem('np_data_placements', JSON.stringify(state.placements));
            refreshViewForType('placements');
        } else {
            await db.collection('placements').doc(id).delete();
        }
        showToast("Placement removed");
    } catch(e) { showToast("Error removing placement"); }
};

/* ==========================================================================
   14. HUB LOGS & TIMELINES
   ========================================================================= */
window.updateHubStats = (filterType, dateVal) => {
    if (filterType) state.hub.filterType = filterType;
    if (dateVal) state.hub.date = dateVal;
    
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
    } else if (state.hub.filterType === 'monthly') {
        start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
        end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
        labelText = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    const rangeLabel = document.getElementById('hub-range-label');
    if (rangeLabel) rangeLabel.innerHTML = `<i class="fa-regular fa-calendar"></i> ${labelText}`;
    state.hub.range = { start, end };

    const isInRange = (entry) => {
        const t = new Date(entry.date || entry).getTime();
        return t >= start && t <= end;
    };

    let subs = 0, scrs = 0, ints = 0;
    let hubDataCount = state.candidates;
    if (state.userRole === 'Employee' && state.user) hubDataCount = hubDataCount.filter(c => c.recruiter === state.user.email.toLowerCase());

    hubDataCount.forEach(c => {
        subs += (c.submissionLog || []).filter(isInRange).length;
        scrs += (c.screeningLog || []).filter(isInRange).length;
        ints += (c.interviewLog || []).filter(isInRange).length;
    });

    const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    setStat('stat-sub', subs);
    setStat('stat-scr', scrs);
    setStat('stat-int', ints);

    document.querySelectorAll('.hub-controls .filter-btn').forEach(b => {
        b.classList.remove('active');
        if (b.getAttribute('data-filter') === state.hub.filterType) b.classList.add('active');
    });
    renderHubTable();
    storageManager.saveUIState();
};

window.toggleHubRow = (id) => {
    state.hub.expandedRowId = state.hub.expandedRowId === id ? null : id;
    renderHubTable();
};

window.triggerHubNote = (candidateId, logType) => {
    const cand = state.candidates.find(c => c.id === candidateId);
    if (!cand) return;
    document.getElementById('hub-note-form').reset();
    document.getElementById('hub-note-candidate-id').value = candidateId;
    document.getElementById('hub-note-log-type').value = logType;
    document.getElementById('hub-note-date').value = new Date().toISOString().split('T')[0];

    const titleEl = document.getElementById('hub-note-modal-title');
    let titleText = "Add Log"; let iconColor = "text-cyan"; let iconType = "fa-paper-plane";
    if (logType === 'submissionLog') { titleText = "Log Submission"; iconColor = "text-cyan"; iconType = "fa-paper-plane"; }
    else if (logType === 'screeningLog') { titleText = "Log Screening"; iconColor = "text-gold"; iconType = "fa-user-clock"; }
    else if (logType === 'interviewLog') { titleText = "Log Interview"; iconColor = "text-purple"; iconType = "fa-headset"; }

    titleEl.innerHTML = `<i class="fa-solid ${iconType} ${iconColor}"></i> ${titleText} - ${cand.first}`;
    document.getElementById('add-hub-note-modal').style.display = 'flex';
    document.getElementById('hub-note-subject').focus();
};

window.closeHubNoteModal = () => document.getElementById('add-hub-note-modal').style.display = 'none';

document.getElementById('hub-note-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const candidateId = document.getElementById('hub-note-candidate-id').value;
    const logType = document.getElementById('hub-note-log-type').value;
    const subject = document.getElementById('hub-note-subject').value.trim();
    const date = document.getElementById('hub-note-date').value;
    
    const cand = state.candidates.find(c => c.id === candidateId);
    if (!cand) return;

    const newLog = {
        date: date, subject: subject, type: 'Manual Entry', tech: cand.tech || 'General',
        recruiter: (state.userRole === 'Employee' && state.user) ? state.user.email.toLowerCase() : (cand.recruiter || 'Unassigned'),
        timestamp: Date.now()
    };

    const currentLogs = cand[logType] || [];
    currentLogs.push(newLog);
    aggressiveLocalSave('candidates', candidateId, logType, currentLogs);

    try {
        if (!candidateId.startsWith('local_')) await db.collection('candidates').doc(candidateId).update({ [logType]: currentLogs });
        showToast("Log entry added successfully!");
    } catch (err) { showToast("Log saved locally."); }
    closeHubNoteModal();
    refreshViewForType('hub');
});

window.deleteHubLog = async (candidateId, logType, index) => {
    if (!confirm("Are you sure you want to delete this log entry?")) return;
    const cand = state.candidates.find(c => c.id === candidateId);
    if (!cand || !cand[logType]) return;

    const updatedLogs = [...cand[logType]];
    updatedLogs.splice(index, 1);
    aggressiveLocalSave('candidates', candidateId, logType, updatedLogs);

    try {
        if (!candidateId.startsWith('local_')) await db.collection('candidates').doc(candidateId).update({ [logType]: updatedLogs });
        showToast("Log entry removed.");
    } catch(err) { showToast("Log removed locally."); }
    refreshViewForType('hub');
};

/* ==========================================================================
   15. SELECTION & DELETION
   ========================================================================= */
window.toggleSelect = (id, type) => {
    if (!state.selection[type]) state.selection[type] = new Set();
    if (state.selection[type].has(id)) state.selection[type].delete(id);
    else state.selection[type].add(id);
    updateSelectButtons(type);
    refreshViewForType(type);
};

window.toggleSelectAll = (type, box) => {
    let data = [];
    if (type === 'cand') data = getFilteredData(state.candidates, state.filters);
    else if (type === 'emp') data = state.employees.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.empFilters.text));
    else if (type === 'onb') data = state.onboarding.filter(item => `${item.first} ${item.last}`.toLowerCase().includes(state.onbFilters.text));
    else if (type === 'place') {
        const mVal = document.getElementById('placement-month-picker')?.value;
        const yVal = document.getElementById('placement-year-picker')?.value;
        data = state.placements.filter(c => c.assigned && ((state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal)));
    } else if (type === 'hub') {
        const { start, end } = state.hub.range;
        const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; };
        data = state.candidates.filter(c => [...(c.submissionLog || []), ...(c.screeningLog || []), ...(c.interviewLog || [])].some(isInRange));
    }

    const config = state.pagination[type];
    if (config) {
        const startIndex = (config.current - 1) * config.limit;
        data = data.slice(startIndex, startIndex + config.limit);
    }

    if (!state.selection[type]) state.selection[type] = new Set();
    if (box.checked) data.forEach(item => state.selection[type].add(item.id));
    else data.forEach(item => state.selection[type].delete(item.id));

    updateSelectButtons(type);
    refreshViewForType(type);
};

function updateSelectButtons(type) {
    const config = {
        cand: { btnId: 'btn-delete-selected', countId: 'selected-count' },
        emp: { btnId: 'btn-delete-employee', countId: 'emp-selected-count' },
        onb: { btnId: 'btn-delete-onboarding', countId: 'onboarding-selected-count' },
        place: { btnId: 'btn-delete-placement', countId: 'place-selected-count' },
        hub: { btnId: 'btn-delete-hub', countId: 'hub-selected-count' }
    };
    if (!config[type]) return;
    const btn = document.getElementById(config[type].btnId);
    const countSpan = document.getElementById(config[type].countId);
    if (!btn) return;

    if (state.selection[type]?.size > 0 && state.userRole !== 'Employee') {
        btn.style.display = 'inline-flex';
        btn.style.opacity = '1';
        if (countSpan) countSpan.innerText = state.selection[type].size;
    } else {
        btn.style.display = 'none';
        if (countSpan) countSpan.innerText = '0';
    }
}

window.openDeleteModal = (type) => {
    state.pendingDelete.type = type;
    document.getElementById('delete-modal').style.display = 'flex';
    document.getElementById('del-count').innerText = state.selection[type].size;
};

window.closeDeleteModal = () => document.getElementById('delete-modal').style.display = 'none';

window.executeDelete = async () => {
    const type = state.pendingDelete.type;
    closeDeleteModal();
    if (!type) return;

    const colMap = { cand: 'candidates', hub: 'candidates', place: 'placements', emp: 'employees', onb: 'onboarding' };
    const col = colMap[type];
    const ids = Array.from(state.selection[type]);

    state.selection[type].clear();
    updateSelectButtons(type);
    const masterBox = document.getElementById(`select-all-${type}`);
    if (masterBox) masterBox.checked = false;

    // Handle LocalStorage deletions vs Firebase deletions safely
    const localIds = ids.filter(id => id.startsWith('local_'));
    const firebaseIds = ids.filter(id => !id.startsWith('local_'));

    if (localIds.length > 0 || firebaseIds.length > 0) {
        state[col] = state[col].filter(item => !ids.includes(item.id));
        localStorage.setItem(`np_data_${col}`, JSON.stringify(state[col]));
    }

    if (firebaseIds.length > 0) {
        const batch = db.batch();
        firebaseIds.forEach(id => batch.delete(db.collection(col).doc(id)));
        try { await batch.commit(); } catch (e) { console.warn("Firebase delete blocked. Deleted locally."); }
    }
    
    refreshViewForType(type);
    showToast("Deleted successfully");
};

/* ==========================================================================
   16. GMAIL INTEGRATION
   ========================================================================= */
function loadGoogleScripts() {
    const s1 = document.createElement('script');
    s1.src = "https://apis.google.com/js/api.js";
    s1.onload = () => gapi.load('client', async () => {
        try {
            await gapi.client.init({ apiKey: GMAIL_CONFIG.API_KEY, discoveryDocs: [GMAIL_CONFIG.DISCOVERY_DOC] });
            state.gmail.gapiInited = true;
            checkGmailAuth();
        } catch (e) { console.error(e); }
    });
    document.body.appendChild(s1);

    const s2 = document.createElement('script');
    s2.src = "https://accounts.google.com/gsi/client";
    s2.onload = () => {
        state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GMAIL_CONFIG.CLIENT_ID,
            scope: GMAIL_CONFIG.SCOPES,
            callback: (resp) => {
                if (resp.error) return;
                updateGmailUI(true);
                renderGmailList('INBOX');
                fetchGmailLabels();
            }
        });
        state.gmail.gisInited = true;
        checkGmailAuth();
    };
    document.body.appendChild(s2);
}

function checkGmailAuth() {
    if (state.gmail.gapiInited && state.gmail.gisInited) {
        if (gapi.client.getToken()) { updateGmailUI(true); fetchGmailLabels(); } 
        else updateGmailUI(false);
    }
}

function updateGmailUI(isSignedIn) {
    const btnAuth = document.getElementById('btn-gmail-auth');
    const btnSignout = document.getElementById('btn-gmail-signout');
    if (btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'inline-flex';
    if (btnSignout) btnSignout.style.display = isSignedIn ? 'inline-flex' : 'none';
}

if (document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => state.gmail.tokenClient.requestAccessToken({ prompt: '' });
if (document.getElementById('btn-gmail-signout')) {
    document.getElementById('btn-gmail-signout').onclick = () => {
        const t = gapi.client.getToken();
        if (t) google.accounts.oauth2.revoke(t.access_token);
        gapi.client.setToken('');
        updateGmailUI(false);
        document.getElementById('gmail-rows-container').innerHTML = '';
    };
}

function parseMessageBody(payload) {
    const decodeBase64Utf8 = (base64Str) => {
        try { return decodeURIComponent(escape(window.atob(base64Str.replace(/-/g, '+').replace(/_/g, '/')))); }
        catch (e) { return "(Encoding Error)"; }
    };
    let bodyText = '', bodyHtml = '';
    if (payload.body?.data) {
        const decodedString = decodeBase64Utf8(payload.body.data);
        if (payload.mimeType === 'text/html') bodyHtml = decodedString;
        else if (payload.mimeType === 'text/plain') bodyText = decodedString;
    }
    let attachments = [];
    if (payload.parts) {
        const parsedParts = payload.parts.reduce((acc, part) => {
            if (part.filename?.length > 0) acc.attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId });
            else {
                const nestedResult = parseMessageBody(part);
                acc.text += nestedResult.text; acc.html += nestedResult.html; acc.attachments.push(...nestedResult.attachments);
            }
            return acc;
        }, { text: '', html: '', attachments: [] });
        bodyText += parsedParts.text; bodyHtml += parsedParts.html; attachments.push(...parsedParts.attachments);
    }
    return { text: bodyText, html: bodyHtml, attachments };
}

window.fetchGmailLabels = async () => {
    if (!gapi.client.getToken()) return;
    try {
        const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
        const userLabels = response.result.labels.filter(l => l.type === 'user');
        state.labels = userLabels.map(l => ({ name: l.name, id: l.id, color: l.color?.backgroundColor || '#607d8b', type: 'api' }));
        renderLabels();
    } catch (e) { console.error(e); }
};

window.renderLabels = () => {
    const container = document.getElementById('dynamic-labels-container');
    if (!container) return;
    container.innerHTML = "";
    if (document.getElementById('manage-indicator')) document.getElementById('manage-indicator').style.display = 'none';

    state.labels.forEach((l, index) => {
        const div = document.createElement('div');
        div.className = 'label-item';
        const isSub = l.name.includes('/');
        const displayName = isSub ? l.name.split('/').pop() : l.name;
        const indent = isSub ? 'padding-left: 20px;' : '';
        div.innerHTML = `<div class="label-left" style="${indent}" onclick="renderGmailList('${l.id || l.name}')">
            <span class="material-icons" style="color: ${l.color}; font-size:16px;">label</span>
            <span id="label-text-${index}" class="label-text" title="${l.name}">${displayName}</span>
        </div>
        <div class="label-more-btn" id="btn-more-${index}" onclick="event.stopPropagation(); toggleLabelMenu(${index})"><span class="material-icons" style="font-size: 16px;">more_horiz</span></div>
        <div id="label-menu-${index}" class="label-dropdown" onclick="event.stopPropagation()">
            <div style="font-size: 10px; color: grey; padding-left: 8px;">LABEL COLOR</div>
            <div class="label-color-grid">
                ${['#e91e63', '#9c27b0', '#2196f3', '#00bcd4', '#4caf50', '#ff9800', '#f44336', '#607d8b'].map(color => `<div class="color-swatch" style="background:${color}" onclick="updateLabelColor(${index}, '${color}')"></div>`).join('')}
                <label class="color-swatch custom-add" title="Custom Color"><input type="color" style="opacity:0; width:100%; height:100%; cursor:pointer;" onchange="updateLabelColor(${index}, this.value)"><i class="fa-solid fa-plus"></i></label>
            </div>
            <div class="label-menu-item" onclick="triggerLabelEdit(${index})"><i class="fa-solid fa-pen"></i> Edit Name</div>
            <div class="label-menu-item" onclick="triggerSubLabel(${index})"><i class="fa-solid fa-code-branch"></i> Add Sub-label</div>
            <div class="label-menu-item danger" onclick="deleteLabel(${index})"><i class="fa-solid fa-trash"></i> Remove Label</div>
        </div>`;
        container.appendChild(div);
    });
};

window.toggleLabelMenu = (index) => {
    document.querySelectorAll('.label-dropdown').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.label-more-btn').forEach(el => el.classList.remove('active'));
    const menu = document.getElementById(`label-menu-${index}`);
    const btn = document.getElementById(`btn-more-${index}`);
    if (menu) { menu.classList.toggle('show'); if (menu.classList.contains('show')) btn.classList.add('active'); }
    const closeFn = (e) => {
        if (!e.target.closest('.label-item')) {
            menu?.classList.remove('show'); btn?.classList.remove('active'); document.removeEventListener('click', closeFn);
        }
    };
    setTimeout(() => document.addEventListener('click', closeFn), 0);
};

window.updateLabelColor = (index, color) => { state.labels[index].color = color; renderLabels(); };
window.triggerLabelEdit = (index) => {
    const textSpan = document.getElementById(`label-text-${index}`);
    const currentName = state.labels[index].name;
    document.getElementById(`label-menu-${index}`).classList.remove('show');
    textSpan.innerHTML = `<input type="text" id="edit-input-${index}" class="label-edit-input" value="${currentName}">`;
    const input = document.getElementById(`edit-input-${index}`);
    input.focus();
    const save = () => {
        const newName = input.value.trim();
        if (newName && newName !== currentName) { state.labels[index].name = newName; showToast("Label renamed"); }
        renderLabels();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    input.addEventListener('blur', save);
    input.onclick = (e) => e.stopPropagation();
};
window.triggerSubLabel = (index) => {
    const parentName = state.labels[index].name;
    const subName = prompt(`Create sub-label under "${parentName}":`);
    if (subName?.trim()) {
        const fullName = `${parentName}/${subName.trim()}`;
        if (state.labels.some(l => l.name.toLowerCase() === fullName.toLowerCase())) return alert("Label exists!");
        state.labels.push({ name: fullName, color: state.labels[index].color });
        state.labels.sort((a, b) => a.name.localeCompare(b.name));
        renderLabels();
        document.getElementById(`label-menu-${index}`).classList.remove('show');
    }
};
window.deleteLabel = (index) => {
    const label = state.labels[index];
    if (confirm(`Delete "${label.name}"?`)) { state.labels = state.labels.filter(l => !l.name.startsWith(label.name)); renderLabels(); }
};
window.openCreateLabelModal = () => { document.getElementById('create-label-modal').style.display = 'flex'; document.getElementById('new-label-name').focus(); };
window.closeCreateLabelModal = () => document.getElementById('create-label-modal').style.display = 'none';
window.createLabel = () => {
    const name = document.getElementById('new-label-name').value.trim();
    if (!name) return;
    state.labels.push({ name: name, color: state.selectedLabelColor });
    renderLabels();
    closeCreateLabelModal();
};
window.selectColor = (element, color) => {
    state.selectedLabelColor = color;
    document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
};

window.renderGmailList = async (label = 'Inbox') => {
    const labelMap = { 'Inbox': 'INBOX', 'Trash': 'TRASH', 'Spam': 'SPAM', 'Starred': 'STARRED', 'Important': 'IMPORTANT', 'Social': 'CATEGORY_SOCIAL', 'Updates': 'CATEGORY_UPDATES', 'Promotions': 'CATEGORY_PROMOTIONS' };
    const apiLabelId = labelMap[label] || label;
    state.gmail.currentLabel = apiLabelId;

    document.getElementById('gmail-list-view').style.display = 'flex';
    document.getElementById('gmail-detail-view').style.display = 'none';
    const container = document.getElementById('gmail-rows-container');
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px; color:var(--primary);"></i><br>Fetching Live Emails...</div>';

    if (!gapi.client.getToken()) {
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);"><i class="fa-brands fa-google" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i><p>Not connected to Workspace Inbox.</p><button class="btn-primary" style="margin-top: 15px;" onclick="state.gmail.tokenClient.requestAccessToken({prompt: ''})"><i class="fa-brands fa-google"></i> Connect Gmail Now</button></div>`;
        return;
    }

    try {
        let request = { 'userId': 'me', 'maxResults': 20 };
        const qInput = document.getElementById('gmail-search-input');
        if (qInput?.value && document.activeElement === qInput) request.q = qInput.value;
        else request.labelIds = [apiLabelId];

        const resp = await gapi.client.gmail.users.messages.list(request);
        const messages = resp.result.messages;

        if (!messages?.length) {
            container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);"><i class="fa-regular fa-envelope-open" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.5;"></i><p>No emails found in this folder.</p></div>`;
            return;
        }

        container.innerHTML = '';
        const batch = messages.map(msg => gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msg.id, 'format': 'metadata', 'metadataHeaders': ['From', 'Subject', 'Date'] }));
        const results = await Promise.all(batch);

        results.forEach(r => {
            const email = r.result;
            const headers = email.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const fromRaw = headers.find(h => h.name === 'From')?.value || 'Unknown';
            const fromName = fromRaw.replace(/[<>]/g, '').split(' ')[0];
            const dateStr = new Date(Number(email.internalDate)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const snippet = email.snippet?.replace(/&quot;/g, '"').replace(/&#39;/g, "'") || '';
            const isUnread = email.labelIds.includes('UNREAD');

            const div = document.createElement('div');
            div.className = `gmail-row ${isUnread ? 'unread' : 'read'}`;
            div.onclick = () => openGmailDetail(email.id);
            div.innerHTML = `<div onclick="event.stopPropagation()"><input type="checkbox" class="gmail-checkbox"></div><div><span class="material-icons star-icon">star_border</span></div><div class="row-sender">${fromName}</div><div class="row-subject">${subject} <span style="color:var(--text-muted); margin-left:5px; font-weight:normal;"> - ${snippet.substring(0, 60)}...</span></div><div class="email-date" style="text-align: right; font-size: 0.8rem; opacity: 0.8;">${dateStr}</div>`;
            container.appendChild(div);
        });
    } catch (err) {
        console.error("Gmail Error:", err);
        container.innerHTML = `<div style="padding:40px; text-align:center; color: var(--danger);"><i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 10px;"></i><p>Error loading emails.</p></div>`;
    }
};

window.openGmailDetail = async (id) => {
    state.gmail.currentEmailId = id;
    document.getElementById('gmail-list-view').style.display = 'none';
    document.getElementById('gmail-detail-view').style.display = 'flex';
    document.getElementById('detail-message').innerHTML = 'Loading content...';

    try {
        const resp = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': id, 'format': 'full' });
        const email = resp.result;
        const headers = email.payload.headers;

        document.getElementById('detail-subject').innerText = headers.find(h => h.name === 'Subject')?.value || '';
        document.getElementById('detail-sender').innerText = headers.find(h => h.name === 'From')?.value || '';
        document.getElementById('detail-date').innerText = new Date(Number(email.internalDate)).toLocaleString();

        const parsedBody = parseMessageBody(email.payload);
        if (parsedBody.html) document.getElementById('detail-message').innerHTML = parsedBody.html;
        else if (parsedBody.text) document.getElementById('detail-message').innerText = parsedBody.text;
        else document.getElementById('detail-message').innerHTML = "<i>[Message body empty]</i>";
    } catch (err) { document.getElementById('detail-message').innerText = "Error loading content."; }
};

window.backToGmailList = () => { document.getElementById('gmail-detail-view').style.display = 'none'; document.getElementById('gmail-list-view').style.display = 'flex'; };
window.refreshEmails = () => renderGmailList(state.gmail.currentLabel);
window.toggleCategories = () => { const sub = document.getElementById('categories-submenu'); sub.style.display = sub.style.display === 'none' ? 'block' : 'none'; };
window.toggleMore = () => { const sub = document.getElementById('more-submenu'); sub.style.display = sub.style.display === 'none' ? 'block' : 'none'; };

window.syncCurrentEmailToCandidate = async () => {
    if (!state.gmail.currentEmailId) return;
    const senderText = document.getElementById('detail-sender').innerText;
    const subject = document.getElementById('detail-subject').innerText;

    const candidateName = prompt("Enter Candidate FIRST NAME to sync this email to:", "");
    if (!candidateName) return;

    const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase());
    if (!candidate) return showToast("Candidate not found.");

    let logs = candidate.submissionLog || [];
    logs.push({
        date: new Date().toISOString().split('T')[0],
        subject: subject, type: 'Imported Email', tech: candidate.tech || 'General',
        recruiter: (state.userRole === 'Employee' && state.user) ? state.user.email.toLowerCase() : state.currentUserName, 
        note: `Imported from: ${senderText}`, timestamp: Date.now()
    });

    aggressiveLocalSave('candidates', candidate.id, 'submissionLog', logs);

    try {
        if (!candidate.id.startsWith('local_')) await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs });
        showToast(`Synced to ${candidate.first} ${candidate.last}`);
    } catch (e) { showToast("Sync saved locally"); }
};

/* ==========================================================================
   17. PROFILE MANAGEMENT
   ========================================================================= */
function updateUserProfile(user, knownUser) {
    const displayName = knownUser?.name ?? (user.displayName || 'User');
    const role = knownUser?.role ?? 'Employee';
    const email = user.email;

    const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setHtml('display-username', displayName);
    setHtml('prof-name-display', displayName);
    setHtml('prof-role-display', role);
    setHtml('prof-email-display-sidebar', email);
    setVal('prof-office-email', email);
    setVal('prof-designation', role);

    db.collection('users').doc(email).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            ['firstName', 'lastName', 'dob', 'workMobile', 'personalMobile', 'personalEmail'].forEach(key => {
                if (data[key]) setVal(`prof-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, data[key]);
            });
            if (data.photoURL) {
                const img = document.getElementById('profile-main-img');
                if (img) {
                    img.src = data.photoURL;
                    img.style.display = 'block';
                    document.getElementById('profile-main-icon').style.display = 'none';
                    document.getElementById('btn-delete-photo').style.display = 'inline-flex';
                }
            }
        }
    });
}

window.saveProfileData = async () => {
    if (!state.user) return;
    const profileData = {
        firstName: document.getElementById('prof-first')?.value || '',
        lastName: document.getElementById('prof-last')?.value || '',
        dob: document.getElementById('prof-dob')?.value || '',
        workMobile: document.getElementById('prof-work-mobile')?.value || '',
        personalMobile: document.getElementById('prof-personal-mobile')?.value || '',
        personalEmail: document.getElementById('prof-personal-email')?.value || ''
    };

    try {
        await db.collection('users').doc(state.user.email).set(profileData, { merge: true });
        showToast("Profile Updated Successfully");
    } catch (err) { showToast("Error updating profile"); }
};

window.triggerPhotoUpload = () => document.getElementById('profile-upload-input')?.click();

window.handlePhotoUpload = async (input) => {
    if (!input.files?.[0] || !state.user) return;
    const file = input.files[0];
    const loadingEl = document.getElementById('avatar-loading');
    if (loadingEl) loadingEl.style.display = 'flex';

    try {
        const ref = storage.ref(`profiles/${state.user.email}_${Date.now()}`);
        await ref.put(file);
        const url = await ref.getDownloadURL();
        await db.collection('users').doc(state.user.email).set({ photoURL: url }, { merge: true });
        
        document.getElementById('profile-main-img').src = url;
        document.getElementById('profile-main-img').style.display = 'block';
        document.getElementById('profile-main-icon').style.display = 'none';
        document.getElementById('btn-delete-photo').style.display = 'inline-flex';
        showToast("Photo uploaded");
    } catch (err) { showToast("Photo upload failed"); } 
    finally { if (loadingEl) loadingEl.style.display = 'none'; }
};

window.deleteProfilePhoto = async () => {
    if (!state.user || !confirm("Remove profile photo?")) return;
    try {
        await db.collection('users').doc(state.user.email).update({ photoURL: firebase.firestore.FieldValue.delete() });
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-img').src = '';
        document.getElementById('profile-main-icon').style.display = 'flex';
        document.getElementById('btn-delete-photo').style.display = 'none';
        showToast("Photo removed");
    } catch (err) { showToast("Failed to remove photo"); }
};

/* ==========================================================================
   18. FULL DATABASE EXPORT & SYSTEM MANAGEMENT
   ========================================================================= */
window.exportData = () => {
    if (!state.candidates?.length) return showToast("No candidate data to export.");
    
    // Dynamically grab every single column ever added (including custom ones)
    const keysToIgnore = ['submissionLog', 'screeningLog', 'interviewLog', 'orderIndex', 'createdAt'];
    let headerSet = new Set(['id', 'first', 'last', 'mobile', 'wa', 'tech', 'recruiter', 'status', 'assigned', 'comments', 'linkedin', 'resume', 'trackingSheet']);
    
    state.candidates.forEach(c => {
        Object.keys(c).forEach(k => {
            if (!keysToIgnore.includes(k)) headerSet.add(k);
        });
    });

    const headers = Array.from(headerSet);
    const rows = [headers.map(h => h.toUpperCase())];
    const escapeCsv = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;

    let dataToExport = state.candidates;
    if (state.userRole === 'Employee' && state.user) {
        dataToExport = dataToExport.filter(c => c.recruiter === state.user.email.toLowerCase());
    }

    dataToExport.forEach(c => {
        const rowData = headers.map(key => escapeCsv(c[key]));
        rows.push(rowData);
    });

    const link = document.createElement("a");
    link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n")));
    link.setAttribute("download", `Nileprise_Full_Database_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Full Database Exported");
};

window.resetSystem = async () => {
    if (state.userRole === 'Employee') return showToast("Access Denied: Only Admins can wipe the database.");
    if (confirm("CRITICAL WARNING: This will permanently delete ALL candidates from the cloud and local storage. Continue?")) {
        const confirmText = prompt("Type 'DELETE' to confirm:");
        if (confirmText === 'DELETE') {
            showToast("Wiping database...");
            try {
                const batch = db.batch();
                state.candidates.filter(c => !c.id.startsWith('local_')).forEach(c => batch.delete(db.collection('candidates').doc(c.id)));
                await batch.commit();
                
                localStorage.removeItem('np_data_candidates');
                state.candidates = [];
                renderCandidateTable();
                
                showToast("System reset successfully.");
            } catch (error) { showToast("Error resetting system."); }
        } else {
            showToast("Reset cancelled.");
        }
    }
};

/* ==========================================================================
   19. STARTUP
   ========================================================================= */
window.onload = () => { init(); };
