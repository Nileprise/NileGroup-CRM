/* ========================================================
   1. FIREBASE CONFIGURATION
   ======================================================== */
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

// Initialize Firebase safely
try { 
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) { 
    console.error("Firebase Init Error:", e); 
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

/* ========================================================
   2. ACCESS CONTROL LIST (ACL)
   ======================================================== */
const ALLOWED_USERS = {
    // EMPLOYEES (Restricted Access)
    'ali@nileprise.com': { name: 'Asif', role: 'Employee' },
    'mdi@nileprise.com': { name: 'Ikram', role: 'Employee' },
    'mmr@nileprise.com': { name: 'Manikanta', role: 'Employee' },
    'msa@nileprise.com': { name: 'Shoeb', role: 'Employee' },
    'maj@nileprise.com': { name: 'Mazher', role: 'Employee' },

    // MANAGERS (Full Access)
    'fma@nileprise.com': { name: 'Fayaz', role: 'Manager' },
    'an@nileprise.com': { name: 'Akhil', role: 'Manager' },
    'aman@nileprise.com': { name: 'Sanketh', role: 'Manager' },

    // ADMIN (Full Access + User Mgmt)
    'careers@nileprise.com': { name: 'Nikhil Rapolu', role: 'Admin' },
};

/* ========================================================
   3. STATE MANAGEMENT
   ======================================================== */
const state = {
    user: null, 
    userRole: 'Viewer', 
    currentUserName: null, 
    candidates: [], 
    onboarding: [],
    employees: [],
    allUsers: [],
    
    // UI States
    expandedRowId: null,
    hubFilterType: 'daily',
    hubDate: new Date().toISOString().split('T')[0],
    hubRange: null,
    uploadTarget: { id: null, field: null },
    placementFilter: 'monthly',
    
    // Filters
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' }, 
    empFilters: { text: '' },
    
    // Selection
    selection: { cand: new Set(), onb: new Set(), emp: new Set() },
    modal: { id: null, type: null },
    pendingDelete: { type: null },
    
    // Metadata
    metadata: {
        recruiters: [],
        techs: [
            "React", "Node.js", "Java", "Python", ".NET", 
            "AWS", "Azure", "DevOps", "Salesforce", "Data Science",
            "Angular", "Flutter", "Golang", "PHP"
        ]
    }
};

/* ========================================================
   4. DOM ELEMENT CACHE
   ======================================================== */
const dom = {
    screens: { 
        auth: document.getElementById('auth-screen'), 
        app: document.getElementById('dashboard-screen'), 
        verify: document.getElementById('verify-screen') 
    },
    tables: {
        cand: { body: document.getElementById('table-body'), head: document.getElementById('table-head') },
        hub: { body: document.getElementById('hub-table-body'), head: document.getElementById('hub-table-head') },
        emp: { body: document.getElementById('employee-table-body'), head: document.getElementById('employee-table-head') },
        onb: { body: document.getElementById('onboarding-table-body'), head: document.getElementById('onboarding-table-head') },
        placements: { body: document.getElementById('placement-table-body'), head: document.querySelector('#placement-table thead') }
    },
    emailViewer: {
        modal: document.getElementById('email-viewer-modal'),
        iframe: document.getElementById('viewer-iframe'),
        subject: document.getElementById('viewer-subject'),
        from: document.getElementById('viewer-from'),
        to: document.getElementById('viewer-to'),
        date: document.getElementById('viewer-date')
    }
};

/* ========================================================
   5. INITIALIZATION & AUTHENTICATION
   ======================================================== */
function init() {
    console.log("App Initializing...");
    
    // 1. Setup Event Listeners First
    setupEventListeners();
    
    // 2. Auth State Listener
    auth.onAuthStateChanged(user => {
        if (user) {
            // Check Email Verification
            if (!user.emailVerified) { 
                document.getElementById('verify-email-display').innerText = user.email; 
                switchScreen('verify'); 
                return; 
            }

            state.user = user;
            const email = user.email.toLowerCase();
            const knownUser = ALLOWED_USERS[email];
            
            // Set Roles
            state.userRole = knownUser ? knownUser.role : 'Viewer'; 
            state.currentUserName = knownUser ? knownUser.name : (user.displayName || 'Unknown');
            
            // UI Permissions
            if (state.userRole === 'Employee') {
                 if(document.getElementById('btn-delete-selected')) document.getElementById('btn-delete-selected').style.display = 'none';
                 if(document.getElementById('btn-delete-onboarding')) document.getElementById('btn-delete-onboarding').style.display = 'none';
                 if(document.getElementById('btn-delete-employee')) document.getElementById('btn-delete-employee').style.display = 'none';
                 if(document.getElementById('nav-admin')) document.getElementById('nav-admin').style.display = 'none';
            }

            updateUserProfile(user, knownUser);
            switchScreen('app');
            initRealtimeListeners();
            startAutoLogoutTimer();
            
            // Clear selections
            updateSelectButtons('cand');
        } else {
            switchScreen('auth');
            stopAutoLogoutTimer();
        }
    });

    // 3. Restore Theme
    if(localStorage.getItem('np_theme') === 'light') {
        document.body.classList.add('light-mode');
    }
    
    // 4. Init Date Pickers
    const yearPicker = document.getElementById('placement-year-picker');
    if(yearPicker) {
        const currentYear = new Date().getFullYear();
        let optionsHtml = "";
        for(let i = currentYear - 40; i <= currentYear + 10; i++) {
            optionsHtml += `<option value="${i}" ${i === currentYear ? "selected" : ""}>${i}</option>`;
        }
        yearPicker.innerHTML = optionsHtml;
    }
    const monthPicker = document.getElementById('placement-month-picker');
    if(monthPicker) monthPicker.value = new Date().toISOString().slice(0, 7);
}

function switchScreen(screenName) {
    Object.values(dom.screens).forEach(s => s.classList.remove('active'));
    if(dom.screens[screenName]) dom.screens[screenName].classList.add('active');
}

window.switchAuth = (target) => { 
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active')); 
    document.getElementById(`form-${target}`).classList.add('active'); 
};

function showToast(msg) { 
    const t = document.getElementById('toast'); 
    document.getElementById('toast-msg').innerText = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 2000); 
}

function cleanError(msg) { 
    return msg.replace('Firebase: ', '').replace('Error ', '').replace('(auth/', '').replace(').', '').replace(/-/g, ' ').toUpperCase(); 
}

/* ========================================================
   6. EVENT LISTENERS (NAVIGATION FIXED HERE)
   ======================================================== */
function setupEventListeners() {
    
    // --- SIDEBAR NAVIGATION (CRITICAL FIX) ---
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 1. Remove active class from all buttons
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            
            // 2. Add active class to clicked button
            // Use e.currentTarget to ensure we get the button, not the icon inside
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            
            // 3. Hide all views
            document.querySelectorAll('.content-view').forEach(view => view.classList.remove('active'));
            
            // 4. Show target view
            const targetId = targetBtn.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if(targetView) {
                targetView.classList.add('active');
                
                // Specific view refresh logic
                if (targetId === 'view-dashboard') updateDashboardStats();
                if (targetId === 'view-placements') renderPlacementTable();
                
                // Update header title
                const title = targetBtn.querySelector('span') ? targetBtn.querySelector('span').innerText : 'Dashboard';
                document.getElementById('page-title').innerText = title;
            }

            // 5. Close Mobile Menu if open
            if(window.innerWidth <= 900) {
                document.querySelector('.sidebar').classList.remove('mobile-open');
                const overlay = document.getElementById('sidebar-overlay');
                if(overlay) overlay.classList.remove('active');
            }
        });
    });

    // --- OTHER LISTENERS ---
    document.getElementById('btn-logout').addEventListener('click', () => auth.signOut());
    document.getElementById('theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light-mode'); localStorage.setItem('np_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); });
    
    // Auth
    window.handleLogin = () => { const e = document.getElementById('login-email').value, p = document.getElementById('login-pass').value; auth.signInWithEmailAndPassword(e, p).catch(err => showToast(cleanError(err.message))); };
    window.handleSignup = () => { 
        const n = document.getElementById('reg-name').value, e = document.getElementById('reg-email').value, p = document.getElementById('reg-pass').value; 
        auth.createUserWithEmailAndPassword(e, p).then(r => {
             db.collection('users').doc(e).set({ firstName: n.split(' ')[0], email: e, role: 'Employee', createdAt: firebase.firestore.FieldValue.serverTimestamp() });
             return r.user.updateProfile({displayName:n});
        }).then(u=>{firebase.auth().currentUser.sendEmailVerification();showToast("Check Email!");switchAuth('login');}).catch(err => showToast(cleanError(err.message))); 
    };
    window.handleReset = () => { auth.sendPasswordResetEmail(document.getElementById('reset-email').value).then(()=>showToast("Link Sent")).catch(err=>showToast(cleanError(err.message))); };
    window.checkVerificationStatus = () => { const u = firebase.auth().currentUser; if(u) u.reload().then(()=>{if(u.emailVerified) location.reload();}); };
    window.resendVerificationEmail = () => { const u = firebase.auth().currentUser; if(u) u.sendEmailVerification().then(()=>showToast("Sent!")); };

    // Search & Filter Inputs
    document.getElementById('search-input').addEventListener('input', e => { state.filters.text = e.target.value.toLowerCase(); renderCandidateTable(); });
    document.getElementById('filter-recruiter').addEventListener('change', e => { state.filters.recruiter = e.target.value; renderCandidateTable(); });
    document.getElementById('filter-tech').addEventListener('change', e => { state.filters.tech = e.target.value; renderCandidateTable(); });
    document.querySelectorAll('.btn-toggle').forEach(btn => { btn.addEventListener('click', e => { document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); state.filters.status = e.target.dataset.status; renderCandidateTable(); }); });
    document.getElementById('btn-reset-filters').addEventListener('click', () => { 
        document.getElementById('search-input').value = ''; 
        document.getElementById('filter-recruiter').value = ''; 
        document.getElementById('filter-tech').value = ''; 
        document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); 
        document.querySelector('.btn-toggle[data-status=""]').classList.add('active'); 
        state.filters = { text: '', recruiter: '', tech: '', status: '' }; 
        renderCandidateTable(); 
        showToast("Filters refreshed"); 
    });

    // Hub Inputs
    document.getElementById('hub-search-input').addEventListener('input', e => { state.hubFilters.text = e.target.value.toLowerCase(); renderHubTable(); });
    const hubRecSelect = document.getElementById('hub-filter-recruiter');
    if(hubRecSelect) { hubRecSelect.addEventListener('change', (e) => { state.hubFilters.recruiter = e.target.value; renderHubTable(); }); }
    document.getElementById('hub-date-picker').addEventListener('change', (e) => { updateHubStats(null, e.target.value); });

    // Table Search Inputs
    const onbSearch = document.getElementById('onb-search-input');
    if(onbSearch) { onbSearch.addEventListener('input', e => { state.onbFilters.text = e.target.value.toLowerCase(); renderOnboardingTable(); }); }
    const empSearch = document.getElementById('emp-search-input');
    if(empSearch) { empSearch.addEventListener('input', e => { state.empFilters.text = e.target.value.toLowerCase(); renderEmployeeTable(); }); }

    // Filter Buttons (Hub & Placement)
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
             if(btn.closest('#view-placements')) return; 
             updateHubStats(btn.getAttribute('data-filter'), null);
        });
    });

    // Add Buttons
    document.getElementById('btn-add-candidate').addEventListener('click', () => { 
        const defaultRecruiter = state.userRole === 'Employee' ? state.currentUserName : '';
        db.collection('candidates').add({ 
            first: '', last: '', mobile: '', wa: '', tech: '', 
            recruiter: defaultRecruiter, status: 'Active', 
            assigned: new Date().toISOString().split('T')[0], comments: '', createdAt: Date.now(), 
            submissionLog: [], screeningLog: [], interviewLog: [] 
        }).then(() => showToast("Inserted")); 
    });
    document.getElementById('btn-add-onboarding').addEventListener('click', () => { 
        db.collection('onboarding').add({ 
            first: '', last: '', dob: '', mobile: '', status: 'Onboarding', 
            recruiter: state.userRole === 'Employee' ? state.currentUserName : '',
            assigned: new Date().toISOString().split('T')[0], comments: '', createdAt: Date.now() 
        }).then(() => showToast("Inserted")); 
    });
    document.getElementById('btn-add-employee').addEventListener('click', () => { 
        if(state.userRole === 'Employee') return showToast("Permission Denied");
        db.collection('employees').add({ 
            first: '', last: '', dob: '', designation: '', 
            workMobile: '', personalMobile: '', officialEmail: '', personalEmail: '', createdAt: Date.now() 
        }).then(() => showToast("Employee Added")); 
    });

    // Delete Buttons
    document.getElementById('btn-delete-selected').addEventListener('click', () => openDeleteModal('cand'));
    document.getElementById('btn-delete-onboarding').addEventListener('click', () => openDeleteModal('onb'));
    document.getElementById('btn-delete-employee').addEventListener('click', () => openDeleteModal('emp'));

    // Mobile Menu
    const mobileBtn = document.getElementById('btn-mobile-menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(mobileBtn) { mobileBtn.addEventListener('click', () => { sidebar.classList.toggle('mobile-open'); overlay.classList.toggle('active'); }); }
    if(overlay) { overlay.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('active'); }); }
    
    // Seed & Export
    document.getElementById('btn-seed-data').addEventListener('click', window.seedData);
    
    // Render Hub
    setTimeout(() => { if(window.updateHubStats) updateHubStats('daily', new Date().toISOString().split('T')[0]); }, 1000);
}

/* ========================================================
   7. REAL-TIME DATA FETCHING
   ======================================================== */
function initRealtimeListeners() {
    // 1. CANDIDATES
    db.collection('candidates').orderBy('createdAt', 'desc').limit(300).onSnapshot(snap => {
        state.candidates = [];
        snap.forEach(doc => state.candidates.push({ id: doc.id, ...doc.data() }));
        renderCandidateTable();
        renderPlacementTable();
        if(window.updateHubStats) window.updateHubStats(state.hubFilterType, state.hubDate);
        updateDashboardStats();
        if(document.getElementById('header-updated')) document.getElementById('header-updated').innerText = 'Synced';
    });

    // 2. ONBOARDING
    db.collection('onboarding').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.onboarding = [];
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() }));
        renderOnboardingTable();
    });

    // 3. EMPLOYEES
    db.collection('employees').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.employees = [];
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        const firstNames = state.employees.map(e => e.first).filter(name => name && name.trim().length > 0);
        state.metadata.recruiters = [...new Set(firstNames)].sort();
        renderDropdowns(); 
        renderEmployeeTable();
    });
    
    // 4. USERS
    db.collection('users').onSnapshot(snap => {
        state.allUsers = [];
        snap.forEach(doc => {
            const data = doc.data();
            const fullName = (data.firstName && data.lastName) ? `${data.firstName} ${data.lastName}` : (data.displayName || 'Staff');
            state.allUsers.push({ id: doc.id, name: fullName, dob: data.dob });
        });
        checkBirthdays();
    });
}

/* ========================================================
   8. TABLE RENDERERS
   ======================================================== */

// --- CANDIDATES ---
function renderCandidateTable() {
    let filtered = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) {
        filtered = filtered.filter(item => item.recruiter === state.currentUserName);
    }
    filtered = filtered.filter(item => {
        const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(state.filters.text);
        const matchesRec = state.filters.recruiter ? item.recruiter === state.filters.recruiter : true;
        const matchesTech = state.filters.tech ? item.tech === state.filters.tech : true;
        const matchesStatus = state.filters.status ? item.status === state.filters.status : true;
        return matchesText && matchesRec && matchesTech && matchesStatus;
    });

    const headers = ['<input type="checkbox" id="select-all-cand" onclick="toggleSelectAll(\'cand\', this)">', '#', 'First Name', 'Last Name', 'Mobile', 'WhatsApp', 'Tech', 'Recruiter', 'Status', 'Assigned', 'Gmail', 'LinkedIn', 'Resume', 'Track', 'Comments', 'Actions'];
    dom.tables.cand.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} records`;

    dom.tables.cand.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        let statusStyle = c.status === 'Active' ? 'active' : (c.status === 'Inactive' ? 'inactive' : '');
        
        const deleteBtn = state.userRole !== 'Employee' ? 
            `<button class="btn-icon" style="color:#ef4444; border:none; width:30px; height:30px;" onclick="deleteCandidate('${c.id}')" title="Delete Candidate"><i class="fa-solid fa-trash"></i></button>` : `<span style="opacity:0.3; font-size:0.8rem;">-</span>`;
        const recruiterCell = state.userRole === 'Employee' ? 
            `<td style="opacity:0.7; cursor:not-allowed;">${c.recruiter}</td>` : `<td onclick="editRecruiter('${c.id}', 'candidates', this)">${c.recruiter}</td>`;

        return `
        <tr class="${rowClass}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
            <td>${idx}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
            <td onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td>
            <td onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td>
            ${recruiterCell}
            <td>
                <select class="status-select ${statusStyle}" onchange="updateStatus('${c.id}', 'candidates', this.value)">
                    <option value="Active" ${c.status==='Active'?'selected':''}>Active</option>
                    <option value="Inactive" ${c.status==='Inactive'?'selected':''}>Inactive</option>
                    <option value="Placed" ${c.status==='Placed'?'selected':''}>Placed</option>
                </select>
            </td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td class="url-cell" onclick="inlineUrlEdit('${c.id}', 'gmail', 'candidates', this)">${c.gmail ? 'Gmail' : ''}</td>
            <td class="url-cell" onclick="inlineUrlEdit('${c.id}', 'linkedin', 'candidates', this)">${c.linkedin ? 'LinkedIn' : ''}</td>
            <td class="url-cell" onclick="inlineUrlEdit('${c.id}', 'resume', 'candidates', this)">${c.resume ? 'Resume' : ''}</td>
            <td class="url-cell" onclick="inlineUrlEdit('${c.id}', 'track', 'candidates', this)">${c.track ? 'Tracker' : ''}</td>
            <td onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments || '-'}</td>
            <td>${deleteBtn}</td>
        </tr>`;
    }).join('');
}

// --- PLACEMENTS ---
window.renderPlacementTable = () => {
    const monthVal = document.getElementById('placement-month-picker').value; 
    const yearVal = document.getElementById('placement-year-picker').value; 
    let placedCandidates = state.candidates.filter(c => c.status === 'Placed');
    if (state.userRole === 'Employee' && state.currentUserName) {
        placedCandidates = placedCandidates.filter(c => c.recruiter === state.currentUserName);
    }
    const filtered = placedCandidates.filter(c => {
        if (!c.assigned) return false;
        if (state.placementFilter === 'monthly') return c.assigned.startsWith(monthVal); 
        else return c.assigned.startsWith(yearVal); 
    });

    if(dom.tables.placements.head) dom.tables.placements.head.innerHTML = `<tr>${['#', 'First Name', 'Last Name', 'Tech', 'Location', 'Type', 'Date', 'Actions'].map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('placement-footer-count').innerText = `Showing ${filtered.length} records`;

    if (filtered.length === 0) {
        dom.tables.placements.body.innerHTML = `<tr><td colspan="8" style="opacity:0.6; padding:20px; text-align:center;">No placements found.</td></tr>`;
        return;
    }

    dom.tables.placements.body.innerHTML = filtered.map((c, i) => {
        const deleteBtn = state.userRole !== 'Employee' ? 
            `<button class="btn-icon" style="color:var(--danger); border:none; width:34px; height:34px; background:rgba(239,68,68,0.1);" onclick="deletePlacement('${c.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>` : '<span style="opacity:0.3">-</span>';
        return `
        <tr>
            <td>${i + 1}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)" class="text-cyan" style="font-weight:600">${c.tech}</td>
            <td onclick="inlineEdit('${c.id}', 'location', 'candidates', this)">${c.location || '<span style="opacity:0.4; font-size:0.8rem;">+ Loc</span>'}</td>
            <td onclick="inlineEdit('${c.id}', 'contract', 'candidates', this)">${c.contract || '<span style="opacity:0.4; font-size:0.8rem;">+ Type</span>'}</td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td>${deleteBtn}</td>
        </tr>`;
    }).join('');
};

// --- EMPLOYEES ---
function renderEmployeeTable() {
    let filtered = state.employees;
    if (state.userRole === 'Employee') filtered = filtered.filter(e => e.officialEmail === state.user.email);
    filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));

    const headers = ['#', 'First Name', 'Last Name', 'Date of Birth', 'Designation', 'Work Mobile', 'Personal Mobile', 'Official Email', 'Personal Email'];
    dom.tables.emp.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} records`;

    dom.tables.emp.body.innerHTML = filtered.map((c, i) => {
        return `<tr>
            <td>${i + 1}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob || ''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td>
            <td onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation || '-'}</td>
            <td onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile || '-'}</td>
            <td onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile || '-'}</td>
            <td class="url-cell" onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail || ''}</td>
            <td class="url-cell" onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail || ''}</td>
        </tr>`;
    }).join('');
}

// --- ONBOARDING ---
function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const headers = ['#', 'First Name', 'Last Name', 'Recruiter', 'Mobile', 'Status', 'Assigned', 'Comments'];
    dom.tables.onb.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} records`;

    dom.tables.onb.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        return `<tr>
            <td>${idx}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td>
            <td onclick="editRecruiter('${c.id}', 'onboarding', this)">${c.recruiter || '-'}</td>
            <td onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td>
            <td>
                <select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)">
                    <option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option>
                    <option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option>
                </select>
            </td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td>
            <td onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments || '-'}</td>
        </tr>`;
    }).join('');
}

// --- HUB ---
function renderHubTable() {
    let hubData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) hubData = hubData.filter(c => c.recruiter === state.currentUserName);
    const filtered = hubData.filter(c => (c.first + ' ' + c.last).toLowerCase().includes(state.hubFilters.text) && (state.hubFilters.recruiter ? c.recruiter === state.hubFilters.recruiter : true));

    dom.tables.hub.head.innerHTML = `<tr><th>#</th><th>Name</th><th>Recruiter</th><th>Tech</th><th>Sub</th><th>Scr</th><th>Int</th><th>Last Act</th></tr>`;
    document.getElementById('hub-footer-count').innerText = `Showing ${filtered.length} records`;

    const selectedDate = new Date(state.hubDate);
    const rowStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    const rowEnd = rowStart + 86400000; 

    dom.tables.hub.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        const checkDateInRange = (entry) => { const t = new Date((typeof entry === 'string') ? entry : entry.date).getTime(); return t >= rowStart && t < rowEnd; };
        const filterLogs = (logs) => (logs || []).filter(checkDateInRange);
        
        let lastActDate = '-';
        if (c.interviewLog && c.interviewLog.length > 0) {
            const lastEntry = c.interviewLog[0];
            lastActDate = (typeof lastEntry === 'string') ? lastEntry : lastEntry.date;
        }

        const subs = filterLogs(c.submissionLog), scrs = filterLogs(c.screeningLog), ints = filterLogs(c.interviewLog);
        const isExpanded = state.expandedRowId === c.id;
        const activeClass = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';

        let html = `
        <tr style="cursor:pointer; ${activeClass}" onclick="toggleHubRow('${c.id}')">
            <td>${idx}</td>
            <td><span style="font-weight:600">${c.first} ${c.last}</span></td>
            <td>${c.recruiter || '-'}</td>
            <td style="color:var(--primary);">${c.tech}</td>
            <td class="text-cyan" style="font-weight:bold;">${subs.length}</td>
            <td class="text-gold" style="font-weight:bold;">${scrs.length}</td>
            <td class="text-purple" style="font-weight:bold;">${ints.length}</td>
            <td style="font-size:0.8rem; color:var(--text-muted)">${lastActDate}</td>
        </tr>`;

        if(isExpanded) {
            const renderTimeline = (list, fieldName) => {
                if(!list || list.length === 0) return `<li class="hub-log-item" style="justify-content:center; opacity:0.5; padding-left:0;">No records</li>`;
                return list.map((entry, index) => {
                    const isLegacy = typeof entry === 'string';
                    const dateStr = isLegacy ? entry : entry.date;
                    const link = isLegacy ? '' : entry.link;
                    const niceDate = new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    let linkHtml = '';
                    if(link) {
                        const isEmail = link.includes('firebasestorage') || link.endsWith('.eml');
                        const icon = isEmail ? 'fa-envelope-open-text' : 'fa-arrow-up-right-from-square';
                        const clickAction = isEmail ? `onclick="viewEmailLog('${link}')"` : `href="${link}" target="_blank"`;
                        const btnClass = isEmail ? 'hub-link-btn is-email' : 'hub-link-btn';
                        linkHtml = isEmail ? `<button class="${btnClass}" ${clickAction} title="Open Email"><i class="fa-solid ${icon}"></i></button>` : `<a ${clickAction} class="${btnClass}" title="Open Link"><i class="fa-solid ${icon}"></i></a>`;
                    }
                    return `<li class="hub-log-item"><div style="display:flex; align-items:center; gap:8px;"><span class="log-date">${niceDate}</span>${linkHtml}</div><div class="hub-log-actions"><button class="hub-action-btn delete" title="Delete Log" onclick="deleteHubLog('${c.id}', '${fieldName}', ${index})"><i class="fa-solid fa-trash"></i></button></div></li>`;
                }).join('');
            };

            html += `
            <tr class="hub-details-row"><td colspan="8"><div class="hub-details-wrapper" onclick="event.stopPropagation()">
                <div class="hub-col cyan"><div class="hub-col-header cyan"><i class="fa-solid fa-paper-plane"></i> Submission <span style="float:right; opacity:0.5">${subs.length}</span></div><div class="hub-input-group"><input type="date" id="input-sub-${c.id}" value="${state.hubDate}"><button class="hub-attach-btn" onclick="triggerHubFileUpload('${c.id}', 'submissionLog')"><i class="fa-solid fa-paperclip"></i></button><button class="btn btn-primary" onclick="addHubLog('${c.id}', 'submissionLog', 'input-sub-${c.id}')">Add</button></div><ul class="hub-log-list custom-scroll">${renderTimeline(subs, 'submissionLog')}</ul></div>
                <div class="hub-col gold"><div class="hub-col-header gold"><i class="fa-solid fa-user-clock"></i> Screening <span style="float:right; opacity:0.5">${scrs.length}</span></div><div class="hub-input-group"><input type="date" id="input-scr-${c.id}" value="${state.hubDate}"><button class="hub-attach-btn" onclick="triggerHubFileUpload('${c.id}', 'screeningLog')"><i class="fa-solid fa-paperclip"></i></button><button class="btn btn-primary" style="background:#f59e0b;" onclick="addHubLog('${c.id}', 'screeningLog', 'input-scr-${c.id}')">Add</button></div><ul class="hub-log-list custom-scroll">${renderTimeline(scrs, 'screeningLog')}</ul></div>
                <div class="hub-col purple"><div class="hub-col-header purple"><i class="fa-solid fa-headset"></i> Interview <span style="float:right; opacity:0.5">${ints.length}</span></div><div class="hub-input-group"><input type="date" id="input-int-${c.id}" value="${state.hubDate}"><button class="hub-attach-btn" onclick="triggerHubFileUpload('${c.id}', 'interviewLog')"><i class="fa-solid fa-paperclip"></i></button><button class="btn btn-primary" style="background:#8b5cf6;" onclick="addHubLog('${c.id}', 'interviewLog', 'input-int-${c.id}')">Add</button></div><ul class="hub-log-list custom-scroll">${renderTimeline(ints, 'interviewLog')}</ul></div>
            </div></td></tr>`;
        }
        return html;
    }).join('');
}

/* ========================================================
   9. UTILITY FUNCTIONS
   ======================================================== */
window.toggleSelect = (id, type) => {
    if(!state.selection[type]) return; 
    if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id);
    updateSelectButtons(type);
};

window.toggleSelectAll = (type, mainCheckbox) => {
    const isChecked = mainCheckbox.checked;
    let currentData = type === 'cand' ? state.candidates : (type === 'emp' ? state.employees : state.onboarding);
    currentData.forEach(item => { if (isChecked) state.selection[type].add(item.id); else state.selection[type].delete(item.id); });
    updateSelectButtons(type);
    if (type === 'cand') renderCandidateTable(); else if (type === 'emp') renderEmployeeTable(); else renderOnboardingTable();
    setTimeout(() => { document.getElementById(`select-all-${type}`).checked = isChecked; }, 0);
};

function updateSelectButtons(type) {
    let btn, countSpan;
    if (type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); }
    else if (type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); }
    else { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); }

    if (!btn) return;
    if (state.userRole === 'Employee') { btn.style.display = 'none'; return; }
    if (state.selection[type] && state.selection[type].size > 0) {
        btn.style.display = 'inline-flex'; if (countSpan) countSpan.innerText = state.selection[type].size;
    } else { btn.style.display = 'none'; }
}

window.deleteCandidate = (id) => { if(!confirm("Delete this candidate?")) return; db.collection('candidates').doc(id).delete().then(() => showToast("Deleted")); };
window.deletePlacement = (id) => { if(!confirm("Delete placement?")) return; db.collection('candidates').doc(id).delete().then(() => showToast("Deleted")); };

// Modal Bulk Delete
window.openDeleteModal = (type) => { state.pendingDelete.type = type; document.getElementById('del-count').innerText = state.selection[type].size; document.getElementById('delete-modal').style.display = 'flex'; };
window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };
window.executeDelete = async () => { 
    const type = state.pendingDelete.type;
    let collection = type === 'cand' ? 'candidates' : (type === 'emp' ? 'employees' : 'onboarding');
    const batch = db.batch();
    Array.from(state.selection[type]).forEach(id => { batch.delete(db.collection(collection).doc(id)); });
    await batch.commit();
    state.selection[type].clear();
    updateSelectButtons(type);
    closeDeleteModal();
    showToast("Deleted selected items");
};

// Charts
function updateDashboardStats() { 
    let calcData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) calcData = calcData.filter(c => c.recruiter === state.currentUserName);
    const total = calcData.length;
    const active = calcData.filter(c => c.status === 'Active').length;
    const inactive = calcData.filter(c => c.status === 'Inactive').length;
    const placed = calcData.filter(c => c.status === 'Placed').length;
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

function getChartData(data, key) { const counts = {}; data.forEach(c => counts[c[key]] = (counts[c[key]] || 0) + 1); return { labels: Object.keys(counts), data: Object.values(counts) }; }
let chartInstances = {}; 
function renderChart(id, data, type) { 
    const ctx = document.getElementById(id);
    if(!ctx) return; 
    if(ctx.clientHeight === 0) ctx.style.height = '250px';
    const context = ctx.getContext('2d');
    if(chartInstances[id]) chartInstances[id].destroy(); 
    const colors = ['#06b6d4', '#f59e0b', '#8b5cf6', '#22c55e', '#ef4444', '#ec4899', '#6366f1'];
    chartInstances[id] = new Chart(context, { 
        type: type, 
        data: { labels: data.labels, datasets: [{ label: 'Candidates', data: data.data, backgroundColor: colors, borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1, borderRadius: 4, barThickness: 20 }] }, 
        options: { 
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: type === 'doughnut', position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }, 
            scales: { y: { display: type === 'bar', beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', stepSize: 1, precision: 0 } }, x: { display: type === 'bar', grid: { display: false }, ticks: { color: '#94a3b8' } } } 
        } 
    }); 
}

// Hub Stats
window.updateHubStats = (filterType, dateVal) => {
    if(filterType) state.hubFilterType = filterType;
    if(dateVal) state.hubDate = dateVal;
    
    document.querySelectorAll('.filter-btn').forEach(btn => { if(btn.closest('#view-placements')) return; if(btn.dataset.filter === state.hubFilterType) btn.classList.add('active'); else btn.classList.remove('active'); });
    
    const d = new Date(state.hubDate);
    let startTimestamp, endTimestamp, labelText = "";

    if (state.hubFilterType === 'daily') {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        endTimestamp = startTimestamp + 86400000; 
        labelText = d.toLocaleDateString();
    } else if (state.hubFilterType === 'weekly') {
        const day = d.getDay(), distanceToMon = day === 0 ? 6 : day - 1, monday = new Date(d); monday.setDate(d.getDate() - distanceToMon); 
        const friday = new Date(monday); friday.setDate(monday.getDate() + 4); 
        startTimestamp = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
        endTimestamp = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate()).getTime() + 86400000;
        labelText = "Week View";
    } else {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        endTimestamp = lastDay.getTime() + 86400000;
        labelText = "Month View";
    }

    state.hubRange = { start: startTimestamp, end: endTimestamp };
    if(document.getElementById('hub-range-label')) document.getElementById('hub-range-label').innerHTML = `<i class="fa-regular fa-calendar"></i> &nbsp; ${labelText}`;
    
    let sub=0, scr=0, int=0;
    const checkDateInRange = (entry) => { const t = new Date((typeof entry === 'string')?entry:entry.date).getTime(); return t >= startTimestamp && t < endTimestamp; };
    state.candidates.forEach(c => {
        if(state.userRole === 'Employee' && c.recruiter !== state.currentUserName) return;
        if(c.submissionLog) c.submissionLog.forEach(e => { if(checkDateInRange(e)) sub++; });
        if(c.screeningLog) c.screeningLog.forEach(e => { if(checkDateInRange(e)) scr++; });
        if(c.interviewLog) c.interviewLog.forEach(e => { if(checkDateInRange(e)) int++; });
    });
    
    if(document.getElementById('stat-sub')) document.getElementById('stat-sub').innerText = sub;
    if(document.getElementById('stat-scr')) document.getElementById('stat-scr').innerText = scr;
    if(document.getElementById('stat-int')) document.getElementById('stat-int').innerText = int;
    renderHubTable();
};

window.triggerHubFileUpload = (id, field) => { state.uploadTarget = { id, field }; document.getElementById('hub-file-input').click(); };
window.handleHubFileSelect = (input) => {
    const file = input.files[0]; if(!file) return;
    const { id, field } = state.uploadTarget;
    const dateVal = new Date().toISOString().split('T')[0];
    const storageRef = storage.ref(`candidates/${id}/emails/${Date.now()}_${file.name}`);
    showToast("Uploading...");
    storageRef.put(file).then(snap => snap.ref.getDownloadURL()).then(url => {
        const candidate = state.candidates.find(c => c.id === id);
        let logs = candidate[field] || [];
        logs.push({ date: dateVal, link: url, timestamp: Date.now() });
        return db.collection('candidates').doc(id).update({ [field]: logs });
    }).then(() => { showToast("File Attached"); input.value = ''; }).catch(e => showToast("Error: " + e.message));
};

window.toggleHubRow = (id) => { state.expandedRowId = state.expandedRowId === id ? null : id; renderHubTable(); };
window.addHubLog = (id, fieldName, inputId) => {
    const dateVal = document.getElementById(inputId).value;
    if(!dateVal) return showToast("Select Date");
    const candidate = state.candidates.find(c => c.id === id);
    let logs = candidate[fieldName] || [];
    logs.push({ date: dateVal, link: '', timestamp: Date.now() });
    db.collection('candidates').doc(id).update({ [fieldName]: logs }).then(() => showToast("Log Added"));
};
window.deleteHubLog = (id, fieldName, index) => {
    if(!confirm("Delete log?")) return;
    const candidate = state.candidates.find(c => c.id === id);
    let logs = candidate[fieldName] || [];
    logs.splice(index, 1);
    db.collection('candidates').doc(id).update({ [fieldName]: logs }).then(() => showToast("Deleted"));
};

window.viewEmailLog = async (url) => {
    dom.emailViewer.modal.style.display = 'flex';
    dom.emailViewer.subject.textContent = "Loading...";
    try {
        const res = await fetch(url); const blob = await res.blob();
        const email = await new PostalMime.default().parse(blob);
        dom.emailViewer.subject.textContent = email.subject || '(No Subject)';
        dom.emailViewer.from.textContent = email.from ? email.from.address : 'Unknown';
        dom.emailViewer.iframe.srcdoc = `<base target="_blank">${email.html || email.text || 'No content'}`;
    } catch (e) { dom.emailViewer.subject.textContent = "Error Loading Email"; }
};
window.closeEmailViewer = () => { dom.emailViewer.modal.style.display = 'none'; dom.emailViewer.iframe.srcdoc = ''; };

// Profile
window.triggerPhotoUpload = () => document.getElementById('profile-upload-input').click();
window.handlePhotoUpload = async (input) => {
    const file = input.files[0]; if(!file) return;
    const user = auth.currentUser;
    const loader = document.getElementById('avatar-loading');
    loader.style.display = 'flex';
    const compressed = await compressImage(file, 600, 0.7);
    storage.ref(`users/${user.email}/profile.jpg`).put(compressed).then(snap => snap.ref.getDownloadURL()).then(url => {
        db.collection('users').doc(user.email).set({ photoURL: url }, { merge: true });
        user.updateProfile({ photoURL: url });
        document.getElementById('profile-main-img').src = url;
        document.getElementById('profile-main-img').style.display = 'block';
        loader.style.display = 'none';
        showToast("Photo Updated");
    });
};
function compressImage(file, w, q) {
    return new Promise((resolve) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const cvs = document.createElement('canvas');
                let scale = w / img.width; cvs.width = w; cvs.height = img.height * scale;
                cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
                cvs.toBlob(resolve, 'image/jpeg', q);
            };
        };
    });
}
window.deleteProfilePhoto = () => {
    if(!confirm("Remove photo?")) return;
    const user = auth.currentUser;
    db.collection('users').doc(user.email).update({ photoURL: firebase.firestore.FieldValue.delete() }).then(() => {
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-icon').style.display = 'flex';
        showToast("Removed");
    });
};
window.saveProfileData = () => {
    const user = auth.currentUser;
    const data = {
        firstName: document.getElementById('prof-first').value,
        lastName: document.getElementById('prof-last').value,
        dob: document.getElementById('prof-dob').value,
        workMobile: document.getElementById('prof-work-mobile').value,
        personalMobile: document.getElementById('prof-personal-mobile').value,
        personalEmail: document.getElementById('prof-personal-email').value
    };
    db.collection('users').doc(user.email).set(data, { merge: true }).then(() => showToast("Saved"));
};

// --- MISC ---
window.manualAddPlacement = () => {
    const recruiter = state.userRole === 'Employee' ? state.currentUserName : '';
    db.collection('candidates').add({
        first: 'New', last: 'Placement', status: 'Placed', assigned: new Date().toISOString().split('T')[0],
        recruiter: recruiter, tech: 'Tech', location: '', contract: '', createdAt: Date.now()
    }).then(() => { showToast("Placement Added"); renderPlacementTable(); });
};
window.updatePlacementFilter = (type, btn) => {
    state.placementFilter = type;
    document.querySelectorAll('#view-placements .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('placement-month-picker').style.display = type === 'monthly' ? 'block' : 'none';
    document.getElementById('placement-year-picker').style.display = type === 'yearly' ? 'block' : 'none';
    renderPlacementTable();
};
window.checkBirthdays = () => {
    const today = new Date(); const match = String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const bdays = state.allUsers.filter(u => u.dob && u.dob.substring(5) === match);
    if(bdays.length > 0) {
        document.getElementById('bday-names').innerText = bdays.map(u => u.name).join(', ');
        document.getElementById('birthday-card').classList.add('active');
        setTimeout(() => document.getElementById('birthday-card').classList.remove('active'), 7000);
    }
};
window.seedData = () => {
    if(state.userRole === 'Employee') return showToast("Permission Denied");
    const batch = db.batch();
    for(let i=0; i<25; i++) {
        batch.set(db.collection('candidates').doc(), {
            first: 'Demo', last: String(i), mobile: '555-0000', tech: 'Java', recruiter: 'Admin', status: i%2===0?'Active':'Inactive', assigned: new Date().toISOString().split('T')[0], createdAt: Date.now()
        });
    }
    batch.commit().then(() => showToast("Seeded"));
};
window.exportData = () => {
    const headers = ["First", "Last", "Tech", "Recruiter", "Status"];
    const rows = state.candidates.map(c => [c.first, c.last, c.tech, c.recruiter, c.status].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "data.csv"; a.click();
};

window.inlineEdit = (id, field, col, el) => {
    if(el.querySelector('input')) return;
    const val = el.innerText; el.innerHTML = ''; el.classList.add('editing-cell');
    const input = document.createElement('input'); input.className = 'inline-input-active'; input.value = val === '-' ? '' : val;
    input.onblur = () => { el.innerHTML = input.value || '-'; el.classList.remove('editing-cell'); db.collection(col).doc(id).update({ [field]: input.value }); };
    input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
    el.appendChild(input); input.focus();
};
window.editRecruiter = (id, col, el) => {
    if(state.userRole === 'Employee') return;
    const val = el.innerText; el.innerHTML = '';
    const sel = document.createElement('select'); sel.className = 'modern-select';
    state.metadata.recruiters.forEach(r => { const o = document.createElement('option'); o.text = r; o.value = r; if(r===val) o.selected=true; sel.appendChild(o); });
    sel.onblur = () => db.collection(col).doc(id).update({ recruiter: sel.value });
    sel.onchange = () => sel.blur();
    el.appendChild(sel); sel.focus();
};
window.updateStatus = (id, col, val) => db.collection(col).doc(id).update({ status: val });
window.inlineDateEdit = (id, field, col, val) => db.collection(col).doc(id).update({ [field]: val });
window.inlineUrlEdit = (id, field, col, el) => {
    if(el.querySelector('input')) return;
    el.innerHTML = ''; el.classList.add('editing-cell');
    const input = document.createElement('input'); input.className = 'inline-input-active'; input.type='url';
    input.onblur = () => { 
        let v = input.value; if(v && !v.startsWith('http')) v = 'https://'+v; 
        db.collection(col).doc(id).update({ [field]: v }); el.innerHTML = v ? 'Link' : ''; el.classList.remove('editing-cell');
    };
    input.onkeydown = (e) => { if(e.key === 'Enter') input.blur(); };
    el.appendChild(input); input.focus();
};
function renderDropdowns() {
    const opts = state.metadata.recruiters.map(r => `<option value="${r}">${r}</option>`).join('');
    ['filter-recruiter', 'hub-filter-recruiter'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = `<option value="">All Recruiters</option>${opts}`; });
    const tOpts = state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('');
    const tEl = document.getElementById('filter-tech'); if(tEl) tEl.innerHTML = `<option value="">All Tech</option>${tOpts}`;
}
function updateUserProfile(user, data) {
    const name = data ? data.name : (user.displayName || 'Staff');
    const role = data ? data.role : 'Viewer';
    document.getElementById('display-username').innerText = name;
    document.getElementById('prof-name-display').innerText = name;
    document.getElementById('prof-role-display').innerText = role;
    document.getElementById('prof-email-display-sidebar').innerText = user.email;
    document.getElementById('prof-office-email').value = user.email;
    document.getElementById('prof-designation').value = role;
    db.collection('users').doc(user.email).get().then(doc => {
        if(doc.exists) {
            const d = doc.data();
            document.getElementById('prof-first').value = d.firstName || '';
            document.getElementById('prof-last').value = d.lastName || '';
            document.getElementById('prof-dob').value = d.dob || '';
            document.getElementById('prof-work-mobile').value = d.workMobile || '';
            document.getElementById('prof-personal-mobile').value = d.personalMobile || '';
            document.getElementById('prof-personal-email').value = d.personalEmail || '';
            if(d.photoURL) {
                document.getElementById('profile-main-img').src = d.photoURL;
                document.getElementById('profile-main-img').style.display = 'block';
                document.getElementById('profile-main-icon').style.display = 'none';
                document.getElementById('btn-delete-photo').style.display = 'flex';
            }
        }
    });
}

let inactivityTimer;
function startAutoLogoutTimer() {
    const TIMEOUT_DURATION = 10 * 60 * 1000; 
    function resetTimer() {
        if (!firebase.auth().currentUser) return; 
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            firebase.auth().signOut().then(() => {
                showToast("Session expired due to inactivity");
                switchScreen('auth');
            });
        }, TIMEOUT_DURATION);
    }
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
        document.addEventListener(event, resetTimer);
    });
    resetTimer();
}
function stopAutoLogoutTimer() { clearTimeout(inactivityTimer); }

// Start App
document.addEventListener('DOMContentLoaded', init);
