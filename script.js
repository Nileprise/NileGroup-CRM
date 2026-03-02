/* ==========================================================================
   1. IMPORTS & CONFIGURATION (FIREBASE MODULAR SDK + GMAIL API)
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, enableMultiTabIndexedDbPersistence, collection, onSnapshot, 
    doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE",
    authDomain: "nile-group-crm.firebaseapp.com",
    databaseURL: "https://nileprise.github.io/Nileprise-CRM/",
    projectId: "nile-group-crm",
    storageBucket: "nile-group-crm.firebasestorage.app",
    messagingSenderId: "575678017832",
    appId: "1:575678017832:web:8ae69a81cfaaf7a717601d",
    measurementId: "G-11XNH0CYY1"
};

const G_CLIENT_ID = '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE';
const G_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const G_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') console.warn("Multiple tabs open, persistence enabled in first tab only.");
    else if (err.code === 'unimplemented') console.warn("Browser does not support offline caching.");
});

/* ==========================================================================
   2. ACCESS CONTROL LIST (Fallback)
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
    user: null, userRole: null, currentUserName: null, 
    candidates: [], onboarding: [], employees: [], placements: [], allUsers: [], hubData: [], labels: [],
    selectedLabelColor: '#e91e63',
    gmail: { tokenClient: null, gapiInited: false, gisInited: false, nextPageToken: null, currentLabel: 'INBOX', currentEmailId: null },
    hub: { expandedRowId: null, filterType: 'daily', date: new Date().toISOString().split('T')[0], range: { start: 0, end: 0 } },
    placementFilter: 'monthly',
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' }, onbFilters: { text: '' }, empFilters: { text: '' },
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    modal: { id: null, type: null }, pendingDelete: { type: null },
    alignments: { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {} },
    colOrders: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    customColumns: { candidates: [], employees: [], onboarding: [], placements: [], hub: [] },
    metadata: { recruiters: [], techs: ["React", "Node.js", "Java", "Python", ".NET", "AWS", "Azure", "DevOps", "Salesforce", "Data Science", "Angular", "Flutter", "Golang", "PHP"] }
};

const historyState = { undo: [], redo: [] };

/* ==========================================================================
   4. DOM CACHE
   ========================================================================== */
const dom = {
    screens: { app: document.getElementById('dashboard-screen') },
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
    }
};

const showToast = (msg) => { 
    const t = document.getElementById('toast'); 
    document.getElementById('toast-msg').innerText = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 3000); 
};

const switchScreen = (screenName) => {
    Object.values(dom.screens).forEach(s => s && s.classList.remove('active'));
    if(dom.screens[screenName]) dom.screens[screenName].classList.add('active');
};

/* ==========================================================================
   5. INITIALIZATION & UTILITIES
   ========================================================================== */
const init = async () => {
    setupEventListeners();
    loadGoogleScripts();
    
    try {
        const docSnap = await getDoc(doc(db, 'settings', 'table_config'));
        if (docSnap.exists()) {
            const data = docSnap.data();
            if(data.colOrders) state.colOrders = data.colOrders;
            if(data.candidates) state.customColumns.candidates = data.candidates;
            if(data.employees) state.customColumns.employees = data.employees;
            if(data.onboarding) state.customColumns.onboarding = data.onboarding;
            if(data.placements) state.customColumns.placements = data.placements;
            if(data.hub) state.customColumns.hub = data.hub;
        }
    } catch(e) { console.error("Config load error", e); }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.user = user;
            const email = user.email.toLowerCase();
            
            try {
                const userDoc = await getDoc(doc(db, 'users', email));
                if (userDoc.exists()) {
                    state.userRole = userDoc.data().role || 'Employee';
                    state.currentUserName = userDoc.data().firstName || user.displayName || 'Unknown';
                } else {
                    const knownUser = ALLOWED_USERS[email];
                    state.userRole = knownUser ? knownUser.role : 'Employee'; 
                    state.currentUserName = knownUser ? knownUser.name : (user.displayName || 'Unknown');
                }
            } catch (err) { console.error("Role fetch error:", err); }
            
            applyRoleBasedUI();
            updateUserProfile(user, ALLOWED_USERS[email]);
            switchScreen('app');
            initRealtimeListeners();
            if(window.updateHubStats) window.updateHubStats('daily', new Date().toISOString().split('T')[0]);
        }
    });

    if(localStorage.getItem('np_theme') === 'light') document.body.classList.add('light-mode');
    const monthPicker = document.getElementById('placement-month-picker');
    if(monthPicker) monthPicker.value = new Date().toISOString().slice(0, 7);
};

const applyRoleBasedUI = () => {
    const isEmployee = state.userRole === 'Employee';
    const restrictedForEmployees = ['view-placements', 'view-onboarding', 'view-employees', 'view-settings'];

    document.querySelectorAll('.nav-item').forEach(item => {
        const target = item.getAttribute('data-target');
        if (!target) return;
        
        if (isEmployee && restrictedForEmployees.includes(target)) {
            item.classList.add('locked');
            if (!item.querySelector('.lock-icon')) {
                item.insertAdjacentHTML('beforeend', '<i class="fa-solid fa-lock lock-icon" title="Manager Access Only"></i>');
            }
        } else {
            item.classList.remove('locked');
            const lockIcon = item.querySelector('.lock-icon');
            if (lockIcon) lockIcon.remove();
        }
    });

    const activeView = document.querySelector('.content-view.active');
    if (isEmployee && activeView && restrictedForEmployees.includes(activeView.id)) {
        document.querySelector('.nav-item[data-target="view-dashboard"]').click();
    }
};

/* ==========================================================================
   6. REALTIME LISTENERS
   ========================================================================== */
const initRealtimeListeners = () => {
    onSnapshot(collection(db, 'candidates'), (snap) => {
        state.candidates = []; 
        const techs = new Set();
        snap.forEach(docSnap => { 
            const d = docSnap.data(); 
            state.candidates.push({ id: docSnap.id, ...d }); 
            if (d.tech) techs.add(d.tech); 
        });
        state.metadata.techs = Array.from(techs).sort();
        state.candidates.sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
        
        renderCandidateTable(); 
        if (state.selection.cand.size > 0) updateSelectButtons('cand');
        updateHubStats(); renderDropdowns(); updateDashboardStats(); renderDashboardCharts();
        
        const headerText = document.getElementById('header-updated');
        if(headerText) headerText.innerText = 'Synced Just Now';
    });
    
    onSnapshot(collection(db, 'hub'), (snap) => {
        state.hubData = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        state.hubData.sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
        updateHubStats(state.hub.filterType, state.hub.date);
    });

    onSnapshot(collection(db, 'employees'), (snap) => {
        state.employees = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        state.employees.sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
        
        const recruiters = new Set(state.employees.map(e => e.first?.trim()).filter(Boolean));
        state.metadata.recruiters = Array.from(recruiters).map(r => ({value:r, display:r})).sort((a,b)=>a.value.localeCompare(b.value));
        
        renderEmployeeTable(); updateSelectButtons('emp'); renderDropdowns(); updateDashboardStats();
    });

    onSnapshot(collection(db, 'onboarding'), (snap) => { 
        state.onboarding = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        state.onboarding.sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
        renderOnboardingTable(); updateSelectButtons('onb');
    });

    onSnapshot(collection(db, 'placements'), (snap) => {
        state.placements = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        state.placements.sort((a, b) => (a.orderIndex ?? -a.createdAt) - (b.orderIndex ?? -b.createdAt));
        renderPlacementTable(); updateSelectButtons('place'); updateDashboardStats();
    });

    onSnapshot(collection(db, 'users'), (snap) => {
        state.allUsers = snap.docs.map(docSnap => {
            const data = docSnap.data();
            const fullName = (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : (data.displayName || 'Staff Member');
            return { id: docSnap.id, name: fullName, dob: data.dob };
        });
    });

    loadCustomColumns();
};

const loadCustomColumns = () => { 
    onSnapshot(doc(db, 'settings', 'table_config'), (docSnap) => { 
        if(docSnap.exists()) { 
            const data = docSnap.data(); 
            if(data.candidates) state.customColumns.candidates = data.candidates; 
            if(data.employees) state.customColumns.employees = data.employees; 
            if(data.onboarding) state.customColumns.onboarding = data.onboarding; 
            if(data.placements) state.customColumns.placements = data.placements; 
            if(data.colOrders) state.colOrders = data.colOrders; 
            renderCandidateTable(); renderEmployeeTable(); renderOnboardingTable(); renderPlacementTable(); renderHubTable(); 
        } 
    }); 
};

/* ==========================================================================
   7. UI HELPERS & DROPDOWNS
   ========================================================================== */
const renderDropdowns = () => { 
    ['filter-recruiter', 'filter-tech'].forEach(id => { 
        const el = document.getElementById(id); 
        if(!el) return; 
        const currentVal = el.value; 
        const opts = id.includes('tech') 
            ? state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('')
            : state.metadata.recruiters.map(r => `<option value="${r.value}">${r.display}</option>`).join(''); 
        el.innerHTML = `<option value="">${id.includes('tech')?"All Tech":"All Recruiters"}</option>${opts}`; 
        el.value = currentVal; 
    }); 
};

window.generateRecruiterDropdown = (currentVal, id, col) => { 
    const list = state.metadata.recruiters || []; 
    const options = list.map(r => `<option value="${r.value}" ${r.value === currentVal ? 'selected' : ''}>${r.display}</option>`).join(''); 
    return `<select class="status-select" style="width:100%; min-width:100px;" onchange="updateRecruiter('${id}', '${col}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Recruiter</option>${options}</select>`; 
};
window.updateRecruiter = async (id, col, val) => { 
    const oldVal = getOldValue(col, id, 'recruiter'); pushToHistory(col, id, 'recruiter', oldVal, val); 
    await updateDoc(doc(db, col, id), { recruiter: val }); showToast("Recruiter Auto-Saved"); 
};

window.generateTechDropdown = (currentVal, id, col) => { 
    const list = state.metadata.techs || []; 
    if(currentVal && !list.includes(currentVal)) list.push(currentVal); 
    list.sort(); 
    const options = list.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join(''); 
    return `<select class="status-select" style="width:100%; min-width:100px; color:var(--primary); font-weight:bold;" onchange="updateTech('${id}', '${col}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Tech</option>${options}</select>`; 
};
window.updateTech = async (id, col, val) => { 
    const oldVal = getOldValue(col, id, 'tech'); pushToHistory(col, id, 'tech', oldVal, val); 
    await updateDoc(doc(db, col, id), { tech: val }); showToast("Tech Auto-Saved"); 
};

/* ==========================================================================
   8. CLIENT-SIDE DATA ISOLATION LOGIC
   ========================================================================== */
const getFilteredData = (data, filters) => { 
    let subset = data; 
    if (state.userRole === 'Employee' && state.currentUserName) {
        subset = subset.filter(item => item.recruiter === state.currentUserName);
    }
    return subset.filter(item => { 
        if (item.status === 'Placed') return false; 
        const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text); 
        const matchDropdownRec = filters.recruiter ? item.recruiter === filters.recruiter : true;
        const matchDropdownTech = filters.tech ? item.tech === filters.tech : true;
        const matchesStatus = filters.status ? item.status === filters.status : true; 
        return matchesText && matchDropdownRec && matchDropdownTech && matchesStatus; 
    }); 
};

const getOldValue = (col, id, field) => { const item = (state[col] || []).find(x => x.id === id); return item ? item[field] : null; };
const pushToHistory = (col, id, field, oldVal, newVal) => { historyState.undo.push({ col, id, field, oldVal, newVal }); };

/* ==========================================================================
   9. DASHBOARD CHARTS & STATS
   ========================================================================== */
let recChartInstance = null; let techChartInstance = null;

const renderDashboardCharts = () => { 
    let candData = state.candidates.filter(c => c.status !== 'Placed'); 
    if (state.userRole === 'Employee' && state.currentUserName) candData = candData.filter(c => c.recruiter === state.currentUserName);
    
    const recCounts = {}; const techCounts = {}; 
    candData.forEach(c => { 
        const r = c.recruiter ? c.recruiter.trim() : 'Unassigned'; 
        recCounts[r] = (recCounts[r] || 0) + 1; 
        let tRaw = c.tech ? c.tech.trim() : 'Other'; if(tRaw === '') tRaw = 'Other';
        const existingKey = Object.keys(techCounts).find(k => k.toLowerCase() === tRaw.toLowerCase());
        const t = existingKey ? existingKey : tRaw; 
        techCounts[t] = (techCounts[t] || 0) + 1; 
    }); 
    
    const ctxRec = document.getElementById('chart-recruiter'); 
    if (ctxRec) { 
        if (recChartInstance) recChartInstance.destroy(); 
        recChartInstance = new Chart(ctxRec, { type: 'bar', data: { labels: Object.keys(recCounts), datasets: [{ label: 'Candidates Assigned', data: Object.values(recCounts), backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } }); 
    } 
    
    const ctxTech = document.getElementById('chart-tech'); 
    if (ctxTech) { 
        if (techChartInstance) techChartInstance.destroy(); 
        techChartInstance = new Chart(ctxTech, { type: 'doughnut', data: { labels: Object.keys(techCounts), datasets: [{ data: Object.values(techCounts), backgroundColor: ['rgba(6,182,212,0.7)', 'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)', 'rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } }); 
    } 
};

const updateDashboardStats = () => { 
    let candData = state.candidates.filter(c => c.status !== 'Placed');
    let placedData = state.placements;
    if (state.userRole === 'Employee' && state.currentUserName) {
        candData = candData.filter(c => c.recruiter === state.currentUserName);
        placedData = placedData.filter(c => c.recruiter === state.currentUserName);
    }
    
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = candData.length; 
    if(document.getElementById('stat-active')) document.getElementById('stat-active').innerText = candData.filter(c => c.status === 'Active').length; 
    if(document.getElementById('stat-inactive')) document.getElementById('stat-inactive').innerText = candData.filter(c => c.status === 'Inactive').length; 
    if(document.getElementById('stat-placed')) document.getElementById('stat-placed').innerText = placedData.length; 
    if(document.getElementById('stat-tech')) document.getElementById('stat-tech').innerText = new Set(candData.map(c => c.tech?.trim().toLowerCase()).filter(Boolean)).size; 
    if(document.getElementById('stat-rec')) document.getElementById('stat-rec').innerText = state.employees.length; 
};

/* ==========================================================================
   10. ALIGNMENT & COLUMN CONFIG
   ========================================================================== */
window.cycleAlign = (context, colName) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context][colName] || 'left'; state.alignments[context][colName] = modes[(modes.indexOf(current) + 1) % 3]; refreshViewForType(context); };
window.cycleAlignAll = (context) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context]['global'] || 'left'; state.alignments[context]['global'] = modes[(modes.indexOf(current) + 1) % 3]; refreshViewForType(context); showToast(`All columns aligned`); };

const applyAlignStyles = (context, tableId) => { 
    const table = document.getElementById(tableId); if (!table) return;
    const headers = Array.from(table.querySelectorAll('th')); const config = state.alignments[context] || {}; let rules = '';
    headers.forEach((th, idx) => {
        const div = th.querySelector('[data-colname]');
        if (div) {
            const val = config[div.dataset.colname] || config['global'] || 'left';
            if (val !== 'left') rules += `#${tableId} th:nth-child(${idx+1}), #${tableId} td:nth-child(${idx+1}) { text-align: ${val} !important; }\n`;
        }
    });
    let style = document.getElementById(`align-style-${context}`); 
    if(!style) { style = document.createElement('style'); style.id = `align-style-${context}`; document.head.appendChild(style); } 
    style.innerHTML = rules; 
};

const thAlign = (title, context) => { const dir = state.alignments[context]?.[title] || state.alignments[context]?.['global'] || 'left'; const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right'); const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : ''; return `<div data-colname="${title}" style="display:flex; align-items:center; width:100%;"><span style="flex:1; text-align:${dir};">${title}</span><i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', '${title}')"></i></div>`; };

/* ==========================================================================
   11. TABLE RENDERERS (With Link Column Removals & Isolation)
   ========================================================================== */
const renderCandidateTable = () => {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.cand.forEach(id => { if(!validIds.has(id)) state.selection.cand.delete(id); });
    updateSelectButtons('cand');

    const isAllChecked = filtered.length > 0 && filtered.every(c => state.selection.cand.has(c.id));
    const customHeaders = (state.customColumns.candidates || []).map(col => `<th>${thAlign(col.name, 'candidates')}</th>`).join('');
    
    // Links explicitly removed
    thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')"></i></div></th><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'candidates')}</th><th>${thAlign('First Name', 'candidates')}</th><th>${thAlign('Last Name', 'candidates')}</th><th>${thAlign('Mobile', 'candidates')}</th><th>${thAlign('WhatsApp', 'candidates')}</th><th>${thAlign('Tech', 'candidates')}</th><th>${thAlign('Recruiter', 'candidates')}</th><th style="width: 140px;">${thAlign('Status', 'candidates')}</th><th>${thAlign('Assigned', 'candidates')}</th><th>${thAlign('Comments', 'candidates')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('cand-footer-count')) document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : ''; const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive'; const statusLabel = c.status || 'Inactive';
        const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt;
        const customCells = (state.customColumns.candidates || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'candidates', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || ''}</td>`; }).join('');
        
        return `<tr class="${rowClass}" data-id="${c.id}" data-collection="candidates" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'candidates')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'candidates')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td><td>${i+1}</td><td tabindex="0" data-field="first" id="fname-${c.id}" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td><td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td><td tabindex="0" data-field="wa" onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td><td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td><td style="overflow:visible;"><div class="action-dropdown-container"><div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${statusLabel} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div><div id="menu-${c.id}" class="custom-dropdown-menu"><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div><div class="dropdown-option" onclick="moveToPlacements('${c.id}')"><span class="dot-gold" style="width:8px; height:8px; background:#f59e0b; border-radius:50%; display:inline-block;"></span> Move to Placements</div><div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div></div></div></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td><td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||''}</td>${customCells}</tr>`;
    }).join('');
    applyAlignStyles('candidates', 'candidates-table');
};

const renderEmployeeTable = () => {
    let filtered = state.employees;
    if (state.userRole === 'Employee' && state.user) filtered = filtered.filter(e => e.officialEmail === state.user.email); 
    filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));
    
    const validIds = new Set(filtered.map(c => c.id));
    state.selection.emp.forEach(id => { if(!validIds.has(id)) state.selection.emp.delete(id); });
    updateSelectButtons('emp');
    
    const isAllChecked = filtered.length > 0 && filtered.every(e => state.selection.emp.has(e.id));
    const customHeaders = (state.customColumns.employees || []).map(col => `<th>${thAlign(col.name, 'employees')}</th>`).join('');
    
    document.getElementById('employee-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('employees')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('employees')"></i></div></th><th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'employees')}</th><th>${thAlign('First Name', 'employees')}</th><th>${thAlign('Last Name', 'employees')}</th><th>${thAlign('Date of Birth', 'employees')}</th><th>${thAlign('Designation', 'employees')}</th><th>${thAlign('Work Mobile', 'employees')}</th><th>${thAlign('Personal Mobile', 'employees')}</th><th>${thAlign('Official Email', 'employees')}</th><th>${thAlign('Personal Email', 'employees')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('emp-footer-count')) document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.emp.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.employees || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'employees', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'employees', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'employees', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="employees" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'employees')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'employees')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td><td>${i+1}</td><td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td><td tabindex="0" data-field="designation" onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||''}</td><td tabindex="0" data-field="workMobile" onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||''}</td><td tabindex="0" data-field="personalMobile" onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||''}</td><td tabindex="0" data-field="officialEmail" onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||''}</td><td tabindex="0" data-field="personalEmail" onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||''}</td>${customCells}</tr>`; }).join('');
    applyAlignStyles('employees', 'employee-table');
};

const renderOnboardingTable = () => {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const isAllChecked = filtered.length > 0 && filtered.every(o => state.selection.onb.has(o.id));
    const customHeaders = (state.customColumns.onboarding || []).map(col => `<th>${thAlign(col.name, 'onboarding')}</th>`).join('');
    
    document.getElementById('onboarding-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('onboarding')" title="Add New Column"></i></div></th><th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'onboarding')}</th><th>${thAlign('First Name', 'onboarding')}</th><th>${thAlign('Last Name', 'onboarding')}</th><th>${thAlign('Date of Birth', 'onboarding')}</th><th>${thAlign('Recruiter', 'onboarding')}</th><th>${thAlign('Mobile', 'onboarding')}</th><th>${thAlign('Status', 'onboarding')}</th><th>${thAlign('Assigned', 'onboarding')}</th><th>${thAlign('Comments', 'onboarding')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('onb-footer-count')) document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} total records`;
    
    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.onb.has(c.id) ? 'checked' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.onboarding || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'onboarding', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'onboarding', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'onboarding', this)">${val || ''}</td>`; }).join(''); return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" data-id="${c.id}" data-collection="onboarding" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'onboarding')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'onboarding')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td><td>${i+1}</td><td tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td><td tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td><td tabindex="0" data-field="mobile" onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td><td><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)"><option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option><option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option></select></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td><td tabindex="0" data-field="comments" onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||''}</td>${customCells}</tr>`; }).join('');
    applyAlignStyles('onboarding', 'onboarding-table');
};

const renderPlacementTable = () => {
    const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value;
    let placed = state.placements;
    if (state.userRole === 'Employee' && state.currentUserName) placed = placed.filter(c => c.recruiter === state.currentUserName);
    placed = placed.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); });
    
    const isAllChecked = placed.length > 0 && placed.every(p => state.selection.place.has(p.id));
    const thead = document.querySelector('#placement-table-head'); 
    const customHeaders = (state.customColumns.placements || []).map(col => `<th>${thAlign(col.name, 'placements')}</th>`).join('');
    
    if(thead) thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('placements')" title="Add New Column"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'placements')}</th><th>${thAlign('First Name', 'placements')}</th><th>${thAlign('Last Name', 'placements')}</th><th>${thAlign('Tech', 'placements')}</th><th>${thAlign('Location', 'placements')}</th><th>${thAlign('Contract', 'placements')}</th><th>${thAlign('Assigned', 'placements')}</th><th>${thAlign('Actions', 'placements')}</th>${customHeaders}</tr>`;
    
    if(document.getElementById('placement-footer-count')) document.getElementById('placement-footer-count').innerText = `Showing ${placed.length} total records`;
    
    if(document.getElementById('placement-table-body')) {
        document.getElementById('placement-table-body').innerHTML = placed.map((c, i) => { const isSel = state.selection.place.has(c.id) ? 'checked' : ''; const rowClass = state.selection.place.has(c.id) ? 'selected-row' : ''; const orderVal = c.orderIndex !== undefined ? c.orderIndex : -c.createdAt; const customCells = (state.customColumns.placements || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'placements', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" tabindex="0" data-field="${col.key}" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'placements', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td tabindex="0" data-field="${col.key}" onclick="inlineEdit('${c.id}', '${col.key}', 'placements', this)">${val || ''}</td>`; }).join(''); return `<tr class="${rowClass}" data-id="${c.id}" data-collection="placements" data-order="${orderVal}" draggable="true" ondragstart="handleDragStart(event, 'placements')" ondragover="handleDragOver(event)" ondrop="handleDrop(event, 'placements')"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="first" onclick="inlineEdit('${c.id}', 'first', 'placements', this)">${c.first}</td><td style="font-weight:600; color:var(--text-main);" tabindex="0" data-field="last" onclick="inlineEdit('${c.id}', 'last', 'placements', this)">${c.last}</td><td tabindex="0" data-field="tech" onclick="inlineEdit('${c.id}', 'tech', 'placements', this)" class="text-cyan">${c.tech}</td><td tabindex="0" data-field="location" onclick="inlineEdit('${c.id}', 'location', 'placements', this)">${c.location||''}</td><td tabindex="0" data-field="contract" onclick="inlineEdit('${c.id}', 'contract', 'placements', this)">${c.contract||''}</td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'placements', this.value)"></td><td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>${customCells}</tr>`; }).join('');
    }
    applyAlignStyles('placements', 'placement-table');
};

const renderHubTable = () => {
    let data = state.candidates; 
    if (state.userRole === 'Employee' && state.currentUserName) data = data.filter(c => c.recruiter === state.currentUserName);
    if(state.hubFilters && state.hubFilters.text) data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));
    
    const { start, end } = state.hub.range; const isInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= start && t <= end; };
    const activeCandidates = data.filter(c => (c.submissionLog || []).some(isInRange) || (c.screeningLog || []).some(isInRange) || (c.interviewLog || []).some(isInRange));
    
    const isAllChecked = activeCandidates.length > 0 && activeCandidates.every(c => state.selection.hub.has(c.id));
    
    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('hub')" title="Add New Column"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:50px;">${thAlign('#', 'hub')}</th><th style="width:150px;">${thAlign('Candidate Name', 'hub')}</th><th style="width:150px;">${thAlign('Recruiter', 'hub')}</th><th style="width:120px;">${thAlign('Technology', 'hub')}</th><th style="text-align:center;">${thAlign('Submission', 'hub')}</th><th style="text-align:center;">${thAlign('Screenings', 'hub')}</th><th style="text-align:center;">${thAlign('Interview', 'hub')}</th><th style="text-align:right;">${thAlign('Date', 'hub')}</th></tr>`;
    
    if(document.getElementById('hub-footer-count')) document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    
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
                     const isLegacy = typeof entry === 'string', dateStr = isLegacy ? entry : entry.date, subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject'), icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');
                     return `<li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);"><div style="display:flex; justify-content:space-between; width:100%;"><span class="log-date" style="color:var(--primary); font-weight:bold; font-size:0.85rem;"><i class="fa-solid ${icon}"></i> ${dateStr}</span>${!isLegacy && entry.recruiter ? `<span style="font-size:0.7rem; opacity:0.6;">${entry.recruiter}</span>` : ''}</div><div style="font-weight:500; color:#fff; font-size:0.9rem;">${subject}</div><div style="text-align:right; width:100%; margin-top:5px;"><button class="hub-action-btn delete" style="color: #ef4444; background:none; border:none; cursor:pointer;" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${type==='sub'?'submissionLog':type==='scr'?'screeningLog':'interviewLog'}', ${index})"><i class="fa-solid fa-trash"></i> Remove</button></div></li>`;
                 }).join('');
             };
             html += `<tr class="hub-details-row"><td colspan="10" style="padding:0; border:none;"><div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()"><div class="hub-col cyan"><div class="hub-col-header cyan">RTR & Submissions <button onclick="triggerHubNote('${c.id}', 'submissionLog')" style="float:right; background:none; border:none; color:#06b6d4; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.submissionLog, 'sub')}</ul></div><div class="hub-col gold"><div class="hub-col-header gold">Screenings <button onclick="triggerHubNote('${c.id}', 'screeningLog')" style="float:right; background:none; border:none; color:#f59e0b; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog, 'scr')}</ul></div><div class="hub-col purple"><div class="hub-col-header purple">Interviews <button onclick="triggerHubNote('${c.id}', 'interviewLog')" style="float:right; background:none; border:none; color:#8b5cf6; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div><ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog, 'int')}</ul></div></div></td></tr>`;
        }
        return html;
    }).join('');
    applyAlignStyles('hub', 'hub-table');
};

/* ==========================================================================
   12. DATA MANIPULATION & INLINE EDITS
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
        labelText = `${monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${friday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
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
    let hubDataCount = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) hubDataCount = hubDataCount.filter(c => c.recruiter === state.currentUserName);
    
    hubDataCount.forEach(c => { 
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

    let data = { first: '', last: '', mobile: '', wa: '', tech: '', comments: '', assigned: new Date().toISOString().split('T')[0], recruiter: defaultRecruiter, orderIndex: newOrderIndex, createdAt: ts };
    let collectionName = type;
    
    if (type === 'candidates') { data.status = 'Active'; } 
    else if (type === 'employees') { data.designation = ''; data.workMobile = ''; data.personalMobile = ''; data.officialEmail = state.userRole === 'Employee' ? state.user.email : ''; data.personalEmail = ''; data.dob = ''; } 
    else if (type === 'onboarding') { data.status = 'Onboarding'; data.dob = ''; }
    else if (type === 'hub') { data.status = 'Active'; collectionName = 'candidates'; data.submissionLog = []; data.screeningLog = []; data.interviewLog = []; }

    try { await addDoc(collection(db, collectionName), data); showToast(`Blank row added to ${type}`); } 
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
    const data = { first: '', last: '', tech: '', location: '', contract: '', assigned: defaultDate, status: 'Placed', recruiter: defaultRecruiter, createdAt: ts, orderIndex: -ts };
    
    try { await addDoc(collection(db, 'placements'), data); showToast("Blank placement added"); } 
    catch (error) { showToast("Error adding placement"); } 
};

window.inlineEdit = (id, field, col, el) => { 
    if (el.querySelector('input')) return; 
    el.tabIndex = 0; el.dataset.field = field;
    const val = el.innerText; 
    el.innerHTML = `<input type="text" class="inline-input-active" value="${val}">`; 
    
    const input = el.querySelector('input');
    input.focus(); input.selectionStart = input.selectionEnd = input.value.length; 
    input.onclick = (e) => e.stopPropagation(); input.ondblclick = (e) => e.stopPropagation(); 
    input.onblur = () => window.saveInline(input, id, field, col, val);
    input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = val; input.blur(); } };
};

window.saveInline = async (input, id, field, col, oldVal) => { 
    const newVal = input.value.trim(); 
    input.parentElement.innerText = newVal; 
    if(newVal !== oldVal) { 
        pushToHistory(col, id, field, oldVal, newVal); 
        try { await updateDoc(doc(db, col, id), {[field]: newVal}); showToast("Auto-Saved"); } 
        catch(err) { input.parentElement.innerText = oldVal; }
    } 
};

window.updateStatus = async (id, col, val) => { 
    const oldVal = getOldValue(col, id, 'status'); pushToHistory(col, id, 'status', oldVal, val); 
    await updateDoc(doc(db, col, id), {status: val}); showToast("Status Auto-Saved"); 
};

window.inlineDateEdit = async (id, field, col, val) => { 
    const oldVal = getOldValue(col, id, field); pushToHistory(col, id, field, oldVal, val); 
    await updateDoc(doc(db, col, id), {[field]: val}); showToast("Date Auto-Saved"); 
};

window.toggleRowMenu = (id) => { 
    document.querySelectorAll('.custom-dropdown-menu').forEach(el => { if(el.id !== `menu-${id}`) el.classList.remove('show'); }); 
    const menu = document.getElementById(`menu-${id}`); 
    if(menu) menu.classList.toggle('show'); 
    document.addEventListener('click', function closeMenu(e) { 
        if (!e.target.closest('.action-dropdown-container')) { if(menu) menu.classList.remove('show'); document.removeEventListener('click', closeMenu); } 
    }); 
};

window.updateStatusAndClose = (id, status) => { 
    window.updateStatus(id, 'candidates', status); 
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); 
};

window.editCustomStatus = async (id) => { 
    const currentStatus = state.candidates.find(c => c.id === id)?.status || ""; 
    const newStatus = prompt("Enter new status detail:", currentStatus); 
    if (newStatus && newStatus.trim() !== "") { 
        await updateDoc(doc(db, 'candidates', id), { status: newStatus.trim() }); showToast("Status updated"); 
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
    document.getElementById('new-col-name').value = ''; window.openAddColumnModal(activeColumnContext); 
};
window.deleteCustomColumn = async (context, index) => { 
    if (!confirm("Delete this column? (Data will remain in database but be hidden)")) return; 
    state.customColumns[context].splice(index, 1); 
    await saveAndRefreshColumns(context, "Column Removed"); window.openAddColumnModal(context); 
};
const saveAndRefreshColumns = async (context, msg) => { 
    try { await setDoc(doc(db, 'settings', 'table_config'), { [context]: state.customColumns[context] }, { merge: true }); showToast(msg); refreshViewForType(context); } 
    catch(e) { console.error(e); showToast("Error saving configuration"); } 
};

window.toggleSelect = (id, type) => { if(!state.selection[type]) state.selection[type] = new Set(); if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id); updateSelectButtons(type); refreshViewForType(type); };
window.toggleSelectAll = (type, box) => {
    let data = [];
    if(type==='cand') data = getFilteredData(state.candidates, state.filters);
    else if(type==='emp') data = state.employees; else if(type==='onb') data = state.onboarding;
    else if(type==='hub') { 
        const { start, end } = state.hub.range; const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; }; 
        data = state.candidates.filter(c => [...(c.submissionLog||[]), ...(c.screeningLog||[]), ...(c.interviewLog||[])].some(isInRange)); 
    }
    else if(type==='place') { 
        const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value; 
        data = state.placements.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); }); 
    }
    if(!state.selection[type]) state.selection[type] = new Set();
    if(box.checked) data.forEach(i=>state.selection[type].add(i.id)); else state.selection[type].clear();
    updateSelectButtons(type); refreshViewForType(type);
};

const refreshViewForType = (type) => { 
    if(type==='cand' || type==='candidates') renderCandidateTable(); 
    else if(type==='emp' || type==='employees') renderEmployeeTable(); 
    else if(type==='onb' || type==='onboarding') renderOnboardingTable(); 
    else if(type==='hub') renderHubTable(); 
    else if(type==='place' || type==='placements') renderPlacementTable(); 
};

const updateSelectButtons = (type) => { 
    let btn, countSpan; 
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); } 
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); } 
    else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); } 
    else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); } 
    else if(type === 'hub') { btn = document.getElementById('btn-delete-hub'); countSpan = document.getElementById('hub-selected-count'); } 
    
    if (!btn) return; 
    
    if (state.selection[type] && state.selection[type].size > 0 && state.userRole !== 'Employee') { 
        btn.style.display = 'inline-flex'; btn.style.opacity = '1'; if(countSpan) countSpan.innerText = state.selection[type].size; 
    } else { 
        btn.style.display = 'none'; if(countSpan) countSpan.innerText = '0'; 
    } 
};

window.openDeleteModal = (type) => { state.pendingDelete.type = type; document.getElementById('delete-modal').style.display = 'flex'; document.getElementById('del-count').innerText = state.selection[type].size; }; 
window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };

window.executeDelete = async () => {
    const type = state.pendingDelete.type; window.closeDeleteModal(); if(!type) return; 
    let col = (type==='cand') ? 'candidates' : (type==='hub' ? 'candidates' : (type==='place' ? 'placements' : (type==='emp'?'employees':'onboarding')));
    const ids = Array.from(state.selection[type]);
    
    state.selection[type].clear(); updateSelectButtons(type);
    const masterBox = document.getElementById(`select-all-${type}`); if(masterBox) masterBox.checked = false;
    refreshViewForType(type);
    
    const batch = writeBatch(db); ids.forEach(id => batch.delete(doc(db, col, id)));
    try { await batch.commit(); showToast("Deleted successfully"); } catch(e) { console.error("Background deletion error:", e); showToast("Delete Failed: " + e.message); }
};

window.moveToPlacements = async (id) => {
    const cand = state.candidates.find(c => c.id === id); if(!cand) return;
    const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show');
    document.querySelector(`tr[data-id="${id}"]`)?.remove(); 
    try { 
        const batch = writeBatch(db); 
        const newPlaceData = { ...cand, status: 'Placed', assigned: new Date().toISOString().split('T')[0] }; 
        batch.set(doc(db, 'placements', id), newPlaceData); 
        batch.delete(doc(db, 'candidates', id)); 
        await batch.commit(); showToast("Moved to Placements"); 
    } catch(e) { console.error("Error moving to placements:", e); showToast("Move failed"); }
};

window.deletePlacement = async (id) => { if(confirm("Remove this placement?")) { await deleteDoc(doc(db, 'placements', id)); showToast("Placement removed"); } };

/* ==========================================================================
   13. GMAIL ENGINE (Read-Only Inbox)
   ========================================================================== */
const loadGoogleScripts = () => { 
    const s1 = document.createElement('script'); s1.src = "https://apis.google.com/js/api.js"; 
    s1.onload = () => gapi.load('client', async () => { 
        try { await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] }); state.gmail.gapiInited = true; checkGmailAuth(); } 
        catch(e) { console.error(e); } 
    }); 
    document.body.appendChild(s1); 
    const s2 = document.createElement('script'); s2.src = "https://accounts.google.com/gsi/client"; 
    s2.onload = () => { 
        state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({ 
            client_id: G_CLIENT_ID, scope: G_SCOPES, callback: (resp) => { if(resp.error) return; updateGmailUI(true); window.renderGmailList('INBOX'); startMailboxSync(); } 
        }); 
        state.gmail.gisInited = true; checkGmailAuth(); 
    }; 
    document.body.appendChild(s2); 
};

const checkGmailAuth = () => { if (state.gmail.gapiInited && state.gmail.gisInited && gapi.client.getToken()) { updateGmailUI(true); startMailboxSync(); setInterval(startMailboxSync, 5 * 60 * 1000); } };
const updateGmailUI = (isSignedIn) => { 
    const btnAuth = document.getElementById('btn-gmail-auth'); const btnSignout = document.getElementById('btn-gmail-signout'); 
    if(btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'inline-flex'; if(btnSignout) btnSignout.style.display = isSignedIn ? 'inline-flex' : 'none'; 
};

if(document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => state.gmail.tokenClient.requestAccessToken({prompt: ''});
if(document.getElementById('btn-gmail-signout')) document.getElementById('btn-gmail-signout').onclick = () => { 
    const t = gapi.client.getToken(); if(t) google.accounts.oauth2.revoke(t.access_token); gapi.client.setToken(''); updateGmailUI(false); document.getElementById('gmail-rows-container').innerHTML = ''; 
};

const getHeader = (headers, name) => { const header = headers.find(h => h.name === name); return header ? header.value : ''; };

const parseMessageBody = (payload) => {
    const decodeBase64Utf8 = (base64Str) => {
        try { const b64 = base64Str.replace(/-/g, '+').replace(/_/g, '/'); return decodeURIComponent(escape(window.atob(b64))); } catch (e) { return "(Encoding Error)"; }
    };
    let bodyText = ''; let bodyHtml = '';
    if (payload.body && payload.body.data) {
        const decodedString = decodeBase64Utf8(payload.body.data);
        if (payload.mimeType === 'text/html') bodyHtml = decodedString; else if (payload.mimeType === 'text/plain') bodyText = decodedString;
    }
    let attachments = [];
    if (payload.parts) {
        const parsedParts = payload.parts.reduce((acc, part) => {
            if (part.filename && part.filename.length > 0) { acc.attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId }); } else { const nestedResult = parseMessageBody(part); acc.text += nestedResult.text; acc.html += nestedResult.html; acc.attachments = acc.attachments.concat(nestedResult.attachments); } return acc;
        }, { text: '', html: '', attachments: [] });
        bodyText += parsedParts.text; bodyHtml += parsedParts.html; attachments = [...attachments, ...parsedParts.attachments];
    }
    return { text: bodyText, html: bodyHtml, attachments };
};

const startMailboxSync = async () => { 
    if (!state.user) return; 
    const metaDoc = await getDoc(doc(db, 'sync_metadata', state.user.uid)); 
    if (!metaDoc.exists() || !metaDoc.data().historyId) { await runFullSync(null); } else { await runIncrementalSync(metaDoc.data().historyId); } 
};
const runFullSync = async (pageToken) => { 
    try { 
        const res = await gapi.client.gmail.users.messages.list({ 'userId': 'me', 'maxResults': 20, 'pageToken': pageToken }); 
        const messages = res.result.messages; 
        if (messages && messages.length > 0) { 
            await processMessageBatch(messages); 
            if (!pageToken) { const firstMsgDetails = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': messages[0].id }); await setDoc(doc(db, 'sync_metadata', state.user.uid), { historyId: firstMsgDetails.result.historyId }, { merge: true }); } 
        } 
    } catch (e) { console.error("Full Sync Error:", e); } 
};
const runIncrementalSync = async (historyId) => { 
    try { 
        const res = await gapi.client.gmail.users.history.list({ 'userId': 'me', 'startHistoryId': historyId }); const history = res.result.history; 
        if (!history || history.length === 0) return; let newMsgIds = []; 
        history.forEach(record => { if (record.messagesAdded) { record.messagesAdded.forEach(m => newMsgIds.push(m.message)); } }); 
        if (newMsgIds.length > 0) { await processMessageBatch(newMsgIds); await setDoc(doc(db, 'sync_metadata', state.user.uid), { historyId: res.result.historyId }, { merge: true }); } 
    } catch (e) { if (e.status === 404) { await runFullSync(null); } } 
};
const processMessageBatch = async (messages) => { 
    const promises = messages.map(async (msgStub) => { 
        try { 
            const docSnap = await getDoc(doc(db, 'emails', msgStub.id)); if (docSnap.exists()) return; 
            const res = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msgStub.id, 'format': 'full' }); const msg = res.result; const payload = msg.payload; const headers = payload.headers; const parsedBody = parseMessageBody(payload); 
            const emailData = { id: msg.id, threadId: msg.threadId, historyId: msg.historyId, labelIds: msg.labelIds || [], snippet: msg.snippet, internalDate: parseInt(msg.internalDate), from: getHeader(headers, 'From'), to: getHeader(headers, 'To'), cc: getHeader(headers, 'Cc'), bcc: getHeader(headers, 'Bcc'), subject: getHeader(headers, 'Subject'), bodyText: parsedBody.text, bodyHtml: parsedBody.html, attachments: parsedBody.attachments, isRead: !msg.labelIds.includes('UNREAD'), importedAt: Date.now(), ownerUid: state.user.uid }; 
            await setDoc(doc(db, 'emails', msgStub.id), emailData); 
        } catch (err) {} 
    }); 
    await Promise.all(promises); 
};

window.renderGmailList = async (label = 'Inbox', navElement = null) => { 
    const apiLabelId = label === 'Inbox' ? 'INBOX' : label; state.gmail.currentLabel = apiLabelId; 
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
            const div = document.createElement('div'); div.className = `gmail-row ${isUnread ? 'unread' : 'read'}`; div.onclick = () => window.openGmailDetail(email.id); 
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
        const parsedBody = parseMessageBody(email.payload);
        if(parsedBody.html) { document.getElementById('detail-message').innerHTML = parsedBody.html; } else if(parsedBody.text) { document.getElementById('detail-message').innerText = parsedBody.text; } else { document.getElementById('detail-message').innerHTML = "<i>[Message body empty]</i>"; } 
    } catch (err) { document.getElementById('detail-message').innerText = "Error loading content."; } 
};

window.backToGmailList = () => { document.getElementById('gmail-detail-view').style.display = 'none'; document.getElementById('gmail-list-view').style.display = 'flex'; }; 
window.refreshEmails = () => window.renderGmailList(state.gmail.currentLabel); 
window.syncCurrentEmailToCandidate = async () => { 
    if(!state.gmail.currentEmailId) return; 
    const senderText = document.getElementById('detail-sender').innerText; const subject = document.getElementById('detail-subject').innerText; 
    const candidateName = prompt("Enter Candidate FIRST NAME to sync this email to:", ""); if(!candidateName) return; 
    const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase()); if(!candidate) return showToast("Candidate not found."); 
    let logs = candidate.submissionLog || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: subject, type: 'Imported Email', tech: candidate.tech || 'General', recruiter: state.currentUserName, note: `Imported from: ${senderText}`, timestamp: Date.now() }); 
    await updateDoc(doc(db, 'candidates', candidate.id), { submissionLog: logs }); showToast(`Synced to ${candidate.first} ${candidate.last}`); 
};

/* ==========================================================================
   14. EXPORT & SYSTEM MANAGEMENT (CSV Export & Manual Sync)
   ========================================================================== */
window.exportData = () => {
    if (!state.candidates || state.candidates.length === 0) return showToast("No candidate data to export.");

    const rows = [["ID", "First Name", "Last Name", "Mobile", "WhatsApp", "Technology", "Recruiter", "Status", "Assigned Date", "Comments"]];
    const escapeCsv = (str) => `"${(str || '').toString().replace(/"/g, '""')}"`;

    let dataToExport = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) dataToExport = dataToExport.filter(c => c.recruiter === state.currentUserName);

    dataToExport.forEach(c => {
        rows.push([escapeCsv(c.id), escapeCsv(c.first), escapeCsv(c.last), escapeCsv(c.mobile), escapeCsv(c.wa), escapeCsv(c.tech), escapeCsv(c.recruiter), escapeCsv(c.status), escapeCsv(c.assigned), escapeCsv(c.comments)]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Nileprise_Candidates_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported successfully");
};

window.resetSystem = async () => {
    if (state.userRole === 'Employee') return showToast("Access Denied: Only Admins can wipe the database.");

    if(confirm("CRITICAL WARNING: This will permanently delete ALL candidates from the cloud database. This CANNOT be undone. Continue?")) {
        const confirmText = prompt("Type 'DELETE' to confirm:");
        if (confirmText === 'DELETE') {
            showToast("Wiping database...");
            try {
                const batch = writeBatch(db);
                state.candidates.forEach(c => batch.delete(doc(db, 'candidates', c.id)));
                await batch.commit();
                showToast("System reset successfully.");
            } catch (error) { console.error("Wipe failed:", error); showToast("Error resetting system."); }
        } else { showToast("Reset cancelled."); }
    }
};

window.manualSync = () => {
    const icon = document.getElementById('sync-icon');
    if(icon) icon.classList.add('fa-spin');
    renderCandidateTable(); renderEmployeeTable(); renderHubTable(); renderPlacementTable(); updateDashboardStats();
    setTimeout(() => {
        if(icon) icon.classList.remove('fa-spin');
        showToast("Data is fully synced and up to date!");
        const headerText = document.getElementById('header-updated');
        if(headerText) headerText.innerText = 'Synced Just Now';
    }, 600);
};

/* ==========================================================================
   15. GLOBAL EVENT LISTENERS & ROW DRAGGING
   ========================================================================== */
const setupEventListeners = () => {
    document.querySelectorAll('.nav-item[data-target]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target.closest('.fa-chevron-down') || e.target.closest('.fa-chevron-up')) return;
            if (btn.classList.contains('locked')) return showToast("Access Restricted: Manager clearance required.");

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

    const mobileBtn = document.getElementById('btn-mobile-menu'); const overlay = document.getElementById('sidebar-overlay');
    if(mobileBtn) mobileBtn.addEventListener('click', () => { document.getElementById('sidebar').classList.add('mobile-open'); overlay.classList.add('active'); });
    if(overlay) overlay.addEventListener('click', () => { document.getElementById('sidebar').classList.remove('mobile-open'); overlay.classList.remove('active'); });

    const logoutBtn = document.getElementById('btn-logout');
    if(logoutBtn) logoutBtn.addEventListener('click', () => { if(confirm("Are you sure you want to log out?")) signOut(auth); });

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
};

window.handleDragStart = (e, collection) => {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { e.preventDefault(); return; }
    const row = e.target.closest('tr'); if(!row) return;
    e.dataTransfer.setData('text/plain', row.dataset.id); e.dataTransfer.setData('collection', collection); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging');
};
window.handleDragOver = (e) => {
    e.preventDefault(); const row = e.target.closest('tr');
    if(row) { document.querySelectorAll('tr').forEach(tr => tr.style.borderTop = ''); row.style.borderTop = '2px solid var(--primary)'; }
};
window.handleDrop = async (e, col) => {
    e.preventDefault(); document.querySelectorAll('tr').forEach(tr => { tr.classList.remove('dragging'); tr.style.borderTop = ''; });
    const draggedId = e.dataTransfer.getData('text/plain'); const dragCollection = e.dataTransfer.getData('collection'); const targetRow = e.target.closest('tr');
    if (!targetRow || !draggedId || targetRow.dataset.id === draggedId || col !== dragCollection) return;
    try {
        const targetOrder = parseFloat(targetRow.dataset.order);
        const prevRow = targetRow.previousElementSibling; const prevOrder = prevRow && prevRow.dataset.order ? parseFloat(prevRow.dataset.order) : targetOrder + 1;
        const newOrderIndex = (prevOrder + targetOrder) / 2;
        await updateDoc(doc(db, col, draggedId), { orderIndex: newOrderIndex }); showToast("Row reordered");
    } catch (error) { console.error("Reorder failed:", error); }
};

/* ==========================================================================
   16. PROFILE MANAGEMENT
   ========================================================================== */
const updateUserProfile = (user, knownUser) => {
    const displayName = knownUser ? knownUser.name : (user.displayName || 'User');
    const role = knownUser ? knownUser.role : 'Employee';
    const email = user.email;

    if(document.getElementById('display-username')) document.getElementById('display-username').innerText = displayName;
    if(document.getElementById('prof-name-display')) document.getElementById('prof-name-display').innerText = displayName;
    if(document.getElementById('prof-role-display')) document.getElementById('prof-role-display').innerText = role;
    if(document.getElementById('prof-email-display-sidebar')) document.getElementById('prof-email-display-sidebar').innerText = email;
    if(document.getElementById('prof-office-email')) document.getElementById('prof-office-email').value = email;
    if(document.getElementById('prof-designation')) document.getElementById('prof-designation').value = role;

    getDoc(doc(db, 'users', email)).then(docSnap => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            if(data.firstName) document.getElementById('prof-first').value = data.firstName;
            if(data.lastName) document.getElementById('prof-last').value = data.lastName;
            if(data.dob) document.getElementById('prof-dob').value = data.dob;
            if(data.workMobile) document.getElementById('prof-work-mobile').value = data.workMobile;
            if(data.personalMobile) document.getElementById('prof-personal-mobile').value = data.personalMobile;
            if(data.personalEmail) document.getElementById('prof-personal-email').value = data.personalEmail;
            
            if(data.photoURL) {
                const img = document.getElementById('profile-main-img'); img.src = data.photoURL; img.style.display = 'block';
                document.getElementById('profile-main-icon').style.display = 'none'; document.getElementById('btn-delete-photo').style.display = 'inline-flex';
            }
        }
    });
};

window.saveProfileData = async () => {
    if(!state.user) return;
    const email = state.user.email;
    const profileData = {
        firstName: document.getElementById('prof-first').value, lastName: document.getElementById('prof-last').value, dob: document.getElementById('prof-dob').value,
        workMobile: document.getElementById('prof-work-mobile').value, personalMobile: document.getElementById('prof-personal-mobile').value, personalEmail: document.getElementById('prof-personal-email').value,
    };
    try { await setDoc(doc(db, 'users', email), profileData, { merge: true }); showToast("Profile Updated Successfully"); } 
    catch(err) { showToast("Error updating profile"); console.error(err); }
};

window.triggerPhotoUpload = () => { document.getElementById('profile-upload-input').click(); };

window.handlePhotoUpload = async (input) => {
    if (!input.files || !input.files[0] || !state.user) return;
    const file = input.files[0]; const email = state.user.email; const loadingEl = document.getElementById('avatar-loading');
    if(loadingEl) loadingEl.style.display = 'flex';
    try {
        const storageRef = ref(storage, `profiles/${email}_${Date.now()}`);
        await uploadBytes(storageRef, file); const url = await getDownloadURL(storageRef);
        await setDoc(doc(db, 'users', email), { photoURL: url }, { merge: true });
        const img = document.getElementById('profile-main-img'); img.src = url; img.style.display = 'block';
        document.getElementById('profile-main-icon').style.display = 'none'; document.getElementById('btn-delete-photo').style.display = 'inline-flex';
        showToast("Photo uploaded");
    } catch(err) { showToast("Photo upload failed"); console.error(err); } 
    finally { if(loadingEl) loadingEl.style.display = 'none'; }
};

window.deleteProfilePhoto = async () => {
    if(!state.user || !confirm("Remove profile photo?")) return;
    try {
        const userRef = doc(db, 'users', state.user.email);
        await updateDoc(userRef, { photoURL: firebase.firestore.FieldValue.delete() });
        const img = document.getElementById('profile-main-img'); img.style.display = 'none'; img.src = '';
        document.getElementById('profile-main-icon').style.display = 'flex'; document.getElementById('btn-delete-photo').style.display = 'none';
        showToast("Photo removed");
    } catch(err) { showToast("Failed to remove photo"); }
};

/* ==========================================================================
   17. STARTUP
   ========================================================================== */
window.onload = init;
