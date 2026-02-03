/* ========================================================
   1. CONFIGURATION (FIREBASE + GOOGLE GMAIL)
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

// --- GOOGLE API CONFIG (Gmail) ---
const G_CLIENT_ID = '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE';
const G_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const G_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

// Initialize Firebase
try { firebase.initializeApp(firebaseConfig); } catch (e) { console.error("Firebase Init Error:", e); }
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

/* ========================================================
   2. ACCESS CONTROL LIST 
   ======================================================== */
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

/* ========================================================
   3. STATE MANAGEMENT
   ======================================================== */
const state = {
    user: null, 
    userRole: null, 
    currentUserName: null, 
    candidates: [], 
    onboarding: [],
    employees: [],
    allUsers: [],
    
    // GMAIL STATE
    gmail: {
        tokenClient: null,
        gapiInited: false,
        gisInited: false,
        nextPageToken: null
    },

    // HUB STATES
    expandedRowId: null,
    hubFilterType: 'daily',
    hubDate: new Date().toISOString().split('T')[0],
    hubRange: null,
    
    // UPLOAD TARGET
    uploadTarget: { id: null, field: null },

    // PLACEMENT STATE
    placementFilter: 'monthly',
    placementDate: new Date().toISOString().slice(0, 7), 

    // FILTERS
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' }, 
    empFilters: { text: '' },
    
    // SELECTION SETS
    selection: { cand: new Set(), onb: new Set(), emp: new Set() },
    
    modal: { id: null, type: null },
    pendingDelete: { type: null },
    
    metadata: {
        recruiters: [], // Stores objects: { value: 'Name', display: 'Name (Email)' }
        techs: [
            "React", "Node.js", "Java", "Python", ".NET", 
            "AWS", "Azure", "DevOps", "Salesforce", "Data Science",
            "Angular", "Flutter", "Golang", "PHP"
        ]
    }
};

/* ========================================================
   4. DOM ELEMENTS CACHE
   ======================================================== */
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
    tables: {
        cand: { body: document.getElementById('table-body'), head: document.getElementById('table-head') },
        hub: { body: document.getElementById('hub-table-body'), head: document.getElementById('hub-table-head') },
        emp: { body: document.getElementById('employee-table-body'), head: document.getElementById('employee-table-head') },
        onb: { body: document.getElementById('onboarding-table-body'), head: document.getElementById('onboarding-table-head') }
    },
    // GMAIL SPECIFIC DOM
    gmail: {
        btnAuth: document.getElementById('btn-gmail-auth'),
        btnSignout: document.getElementById('btn-gmail-signout'),
        list: document.getElementById('email-list'),
        skeleton: document.getElementById('gmail-skeleton'),
        empty: document.getElementById('gmail-empty'),
        loadMore: document.getElementById('btn-load-more'),
        searchInput: document.getElementById('gmail-search-input')
    },
    // EMAIL VIEWER MODAL
    emailViewer: {
        modal: document.getElementById('email-viewer-modal'),
        iframe: document.getElementById('viewer-iframe'),
        subject: document.getElementById('viewer-subject'),
        from: document.getElementById('viewer-from') ? document.getElementById('viewer-from').querySelector('span') : null,
        to: document.getElementById('viewer-to') ? document.getElementById('viewer-to').querySelector('span') : null,
        date: document.getElementById('viewer-date')
    }
};

/* ========================================================
   5. INITIALIZATION & AUTHENTICATION
   ======================================================== */
function init() {
    try {
        console.log("System Initializing...");
        setupEventListeners();
        renderDropdowns();
        
        // --- IMPORTANT: Load Google Scripts Dynamically ---
        loadGoogleScripts();
        
        // Initialize buttons as disabled (visible but grayed out)
        updateSelectButtons('cand');
        updateSelectButtons('onb');
        updateSelectButtons('emp');

        // Listen for Firebase Auth State
        auth.onAuthStateChanged(user => {
            if (user) {
                // Check Email Verification
                if (!user.emailVerified) { 
                    document.getElementById('verify-email-display').innerText = user.email; 
                    switchScreen('verify'); 
                    return; 
                }

                // Set User Context
                state.user = user;
                const email = user.email.toLowerCase();
                const knownUser = ALLOWED_USERS[email];
               
                state.userRole = knownUser ? knownUser.role : 'Viewer'; 
                state.currentUserName = knownUser ? knownUser.name : (user.displayName || 'Unknown');
               
                // Permission Handling
                if (state.userRole === 'Employee') {
                     if(document.getElementById('btn-delete-selected')) updateSelectButtons('cand'); // Re-trigger check
                }

                updateUserProfile(user, knownUser);
                switchScreen('app');
                initRealtimeListeners();
                startAutoLogoutTimer();
            } else {
                switchScreen('auth');
                stopAutoLogoutTimer();
            }
        });
    } catch (err) {
        console.error("Init Error:", err);
        switchScreen('auth'); 
    }

    // Theme Check
    if(localStorage.getItem('np_theme') === 'light') {
        document.body.classList.add('light-mode');
    }
    
    // Set default month for placements
    const monthPicker = document.getElementById('placement-month-picker');
    if(monthPicker) { monthPicker.value = new Date().toISOString().slice(0, 7); }
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
    setTimeout(() => t.classList.remove('show'), 3000); 
}

function cleanError(msg) { 
    return msg.replace('Firebase: ', '').replace('Error ', '').replace('(auth/', '').replace(').', '').replace(/-/g, ' ').toUpperCase(); 
}

/* ========================================================
   6. NAVIGATION & PROFILE LOGIC
   ======================================================== */
dom.navItems.forEach(btn => {
    btn.addEventListener('click', (e) => {
        // UI Updates
        dom.navItems.forEach(b => b.classList.remove('active'));
        const clickedBtn = e.target.closest('.nav-item');
        clickedBtn.classList.add('active');

        // Mobile Menu Logic
        if (window.innerWidth <= 900) {
            document.querySelector('.sidebar').classList.remove('mobile-open');
            const overlay = document.getElementById('sidebar-overlay');
            if(overlay) overlay.classList.remove('active');
        }

        // View Switching
        Object.values(dom.views).forEach(view => {
            if(view) view.classList.remove('active');
        });

        const targetId = clickedBtn.getAttribute('data-target');
        const targetView = document.getElementById(targetId);
    
        if (targetView) {
            targetView.classList.add('active');
           
            // View Specific Triggers
            if (targetId === 'view-dashboard') updateDashboardStats();
            if (targetId === 'view-profile') refreshProfileData();
            if (targetId === 'view-placements') renderPlacementTable();
           
            // Auto-load Inbox if connected
            if (targetId === 'view-inbox') {
                 if(state.gmail.gapiInited && state.gmail.gisInited && gapi.client.getToken()) {
                     if(dom.gmail.list.children.length === 0) loadInbox();
                 }
            }
        }
    });
});

function updateUserProfile(user, hardcodedData) {
    if (!user) return;
    const displayName = hardcodedData ? hardcodedData.name : (user.displayName || 'Staff Member');
    const role = hardcodedData ? hardcodedData.role : 'Viewer';
    
    // Header UI
    const headerUser = document.getElementById('display-username');
    if (headerUser) { headerUser.innerText = displayName; headerUser.style.display = 'block'; }
    
    // Profile Page UI
    const nameDisplay = document.getElementById('prof-name-display');
    const roleDisplay = document.getElementById('prof-role-display');
    if (nameDisplay) nameDisplay.innerText = displayName;
    if (roleDisplay) roleDisplay.innerText = role;
    if(document.getElementById('prof-email-display-sidebar')) document.getElementById('prof-email-display-sidebar').innerText = user.email;

    if(document.getElementById('prof-office-email')) document.getElementById('prof-office-email').value = user.email;
    if(document.getElementById('prof-designation')) document.getElementById('prof-designation').value = role; 

    // Fetch Extra Data
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
        } else {
            const names = displayName.split(' ');
            if(document.getElementById('prof-first')) document.getElementById('prof-first').value = names[0] || '';
            if(document.getElementById('prof-last')) document.getElementById('prof-last').value = names.slice(1).join(' ') || '';
        }
    });
}

function refreshProfileData() {
    const user = firebase.auth().currentUser;
    if(user) {
        const knownUser = ALLOWED_USERS[user.email.toLowerCase()];
        updateUserProfile(user, knownUser);
    }
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

/* ========================================================
   7. REAL-TIME DATA LISTENER
   ======================================================== */
function initRealtimeListeners() {
    // Candidates
    db.collection('candidates').orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
        state.candidates = [];
        snap.forEach(doc => state.candidates.push({ id: doc.id, ...doc.data() }));
        
        renderCandidateTable();
        renderPlacementTable();
        if(window.updateHubStats) window.updateHubStats(state.hubFilterType, state.hubDate);
        updateDashboardStats();
        if(dom.headerUpdated) dom.headerUpdated.innerText = 'Synced';
    });

    // Onboarding
    db.collection('onboarding').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.onboarding = [];
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() }));
        renderOnboardingTable();
    });

    // Employees (Updated to fetch Name + Email for Dropdown)
    db.collection('employees').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.employees = [];
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        
        // Map to objects containing Name and Email for dropdowns
        const recruiterData = state.employees
            .filter(e => e.first && e.first.trim().length > 0)
            .map(e => ({
                value: e.first, // Value used for filtering/saving
                display: `${e.first} ${e.last || ''} (${e.officialEmail || 'No Email'})` // Text shown in UI
            }));

        // Remove duplicates based on 'value'
        const uniqueRecruiters = [];
        const seenValues = new Set();
        recruiterData.forEach(r => {
            if (!seenValues.has(r.value)) {
                seenValues.add(r.value);
                uniqueRecruiters.push(r);
            }
        });
        
        uniqueRecruiters.sort((a, b) => a.value.localeCompare(b.value));
        state.metadata.recruiters = uniqueRecruiters;
        
        renderDropdowns(); 
        renderEmployeeTable();
        updateDashboardStats();
    });
    
    // Users (For Birthdays)
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

/* ========================================================
   8. DATA RENDERERS
   ======================================================== */
function renderDropdowns() {
    // 1. Generate the Options HTML from Object Array
    const optionsHTML = state.metadata.recruiters.map(r => 
        `<option value="${r.value}">${r.display}</option>`
    ).join('');

    const rSelect = document.getElementById('filter-recruiter');
    if (rSelect) {
        rSelect.innerHTML = `<option value="">All Recruiters</option>${optionsHTML}`;
    }

    const tSelect = document.getElementById('filter-tech');
    if (tSelect) {
        const options = state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join('');
        tSelect.innerHTML = `<option value="">All Tech</option>${options}`;
    }

    const hubRec = document.getElementById('hub-filter-recruiter');
    if (hubRec) {
        hubRec.innerHTML = `<option value="">All Recruiters</option>${optionsHTML}`;
    }
}

function getFilteredData(data, filters) {
    let subset = data;
    if (state.userRole === 'Employee' && state.currentUserName) {
        subset = subset.filter(item => {
            return item.recruiter === state.currentUserName;
        });
    }
    return subset.filter(item => {
        const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text);
        const matchesRec = filters.recruiter ? item.recruiter === filters.recruiter : true;
        const matchesTech = filters.tech ? item.tech === filters.tech : true;
        const matchesStatus = filters.status ? item.status === filters.status : true;
        return matchesText && matchesRec && matchesTech && matchesStatus;
    });
}

function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const headers = ['<input type="checkbox" id="select-all-cand" onclick="toggleSelectAll(\'cand\', this)">', '#', 'First Name', 'Last Name', 'Mobile', 'WhatsApp', 'Tech', 'Recruiter', 'Status', 'Assigned', 'Gmail', 'LinkedIn', 'Resume', 'Track', 'Comments'];
    dom.tables.cand.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const footerCount = document.getElementById('cand-footer-count');
    if(footerCount) footerCount.innerText = `Showing ${filtered.length} records`;

    dom.tables.cand.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        
        let statusStyle = "";
        if(c.status === 'Active') statusStyle = 'active';
        else if (c.status === 'Inactive') statusStyle = 'inactive';
        else statusStyle = '';
        
        return `
        <tr class="${rowClass}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
            <td>${idx}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
            <td onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td>
            <td onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td>
            <td onclick="editRecruiter('${c.id}', 'candidates', this)">${c.recruiter}</td>
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
        </tr>`;
    }).join('');
}

function renderHubTable() {
    let hubData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) {
        hubData = hubData.filter(c => c.recruiter === state.currentUserName);
    }

    const filtered = hubData.filter(c => {
        const matchesText = (c.first + ' ' + c.last).toLowerCase().includes(state.hubFilters.text);
        const matchesRec = state.hubFilters.recruiter ? c.recruiter === state.hubFilters.recruiter : true;
        return matchesText && matchesRec;
    });

    const headers = ['#', 'Full Name', 'Recruiter', 'Tech', 'RTR/Rate', 'Screening', 'Interview', 'Last Activity'];
    
    dom.tables.hub.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    
    const footerCount = document.getElementById('hub-footer-count');
    if(footerCount) footerCount.innerText = `Showing ${filtered.length} records`;

    const selectedDate = new Date(state.hubDate);
    const rowStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()).getTime();
    const rowEnd = rowStart + 86400000; 

    dom.tables.hub.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        
        // Count RTR/Rate Submissions
        const submissionCount = (c.submissionLog || []).filter(log => {
            const type = (log.type || log.note || "").toLowerCase();
            const subj = (log.subject || "").toLowerCase();
            const combined = type + " " + subj;
            return combined.includes('rtr') || combined.includes('rate') || combined.includes('submission');
        }).length;

        let lastActDate = '-';
        if (c.interviewLog && c.interviewLog.length > 0) {
            const lastEntry = c.interviewLog[0];
            lastActDate = (typeof lastEntry === 'string') ? lastEntry : lastEntry.date;
        }

        const isExpanded = state.expandedRowId === c.id;
        const activeClass = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';

        let html = `
        <tr style="cursor:pointer; ${activeClass}" onclick="toggleHubRow('${c.id}')">
            <td>${idx}</td>
            <td><span style="font-weight:600">${c.first} ${c.last}</span></td>
            <td>${c.recruiter || '-'}</td>
            <td style="color:var(--primary);">${c.tech}</td>
            <td class="text-cyan" style="font-weight:bold; font-size:1.1rem;">${submissionCount}</td>
            <td class="text-gold" style="font-weight:bold;">${(c.screeningLog||[]).length}</td>
            <td class="text-purple" style="font-weight:bold;">${(c.interviewLog||[]).length}</td>
            <td style="font-size:0.8rem; color:var(--text-muted)">${lastActDate}</td>
        </tr>`;

        if(isExpanded) {
            const renderTimeline = (list) => {
                if(!list || list.length === 0) return `<li class="hub-log-item" style="opacity:0.5;">No records</li>`;
                
                return list.map((entry, index) => {
                    const isLegacy = typeof entry === 'string';
                    const dateStr = isLegacy ? entry : entry.date;
                    const subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject');
                    const recruiter = isLegacy ? '-' : (entry.recruiter || '-');
                    const tech = isLegacy ? '-' : (entry.tech || '-');
                    const type = isLegacy ? 'Entry' : (entry.type || 'Log');
                    const link = isLegacy ? '' : entry.link;
                    
                    return `
                    <li class="hub-log-item" style="display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; width:100%;">
                            <span class="log-date" style="color:var(--primary); font-weight:bold;">${dateStr}</span>
                            <span style="font-size:0.75rem; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${recruiter}</span>
                        </div>
                        <div style="font-weight:600; color:#fff;">${subject}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted); display:flex; gap:10px;">
                            <span><i class="fa-solid fa-code"></i> ${tech}</span>
                            <span><i class="fa-solid fa-tag"></i> ${type}</span>
                        </div>
                        ${link ? `<a href="${link}" target="_blank" class="hub-link-btn" style="width:100%; margin-top:5px; text-decoration:none;">View Email <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
                        <div style="text-align:right; width:100%; margin-top:5px;">
                             <button class="hub-action-btn delete" onclick="event.stopPropagation(); deleteHubLog('${c.id}', '${list === c.submissionLog ? 'submissionLog' : list === c.screeningLog ? 'screeningLog' : 'interviewLog'}', ${index})"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </li>`;
                }).join('');
            };

            html += `
            <tr class="hub-details-row">
                <td colspan="8" style="padding:0;">
                    <div class="hub-details-wrapper" onclick="event.stopPropagation()">
                        <div class="hub-col cyan">
                            <div class="hub-col-header cyan">RTR & Rate Submissions</div>
                            <ul class="hub-log-list custom-scroll" style="max-height:300px;">${renderTimeline(c.submissionLog)}</ul>
                        </div>
                        <div class="hub-col gold">
                            <div class="hub-col-header gold">Screenings</div>
                             <ul class="hub-log-list custom-scroll">${renderTimeline(c.screeningLog)}</ul>
                        </div>
                        <div class="hub-col purple">
                            <div class="hub-col-header purple">Interviews</div>
                             <ul class="hub-log-list custom-scroll">${renderTimeline(c.interviewLog)}</ul>
                        </div>
                    </div>
                </td>
            </tr>`;
        }
        return html;
    }).join('');
}

function renderEmployeeTable() {
    let filtered = state.employees;
    if (state.userRole === 'Employee') {
        filtered = filtered.filter(e => e.officialEmail === state.user.email);
    }
    filtered = filtered.filter(item => {
        const searchText = state.empFilters.text;
        const fullName = (item.first + ' ' + item.last).toLowerCase();
        return fullName.includes(searchText);
    });

    const headers = [
        '<input type="checkbox" id="select-all-emp" onclick="toggleSelectAll(\'emp\', this)">', 
        '#', 'First Name', 'Last Name', 'Date of Birth', 'Designation', 
        'Work Mobile', 'Personal Mobile', 'Official Email', 'Personal Email'
    ];
    
    dom.tables.emp.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const footerCount = document.getElementById('emp-footer-count');
    if(footerCount) footerCount.innerText = `Showing ${filtered.length} records`;

    dom.tables.emp.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        const isSel = state.selection.emp.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.emp.has(c.id) ? 'selected-row' : '';
        
        return `
        <tr class="${rowClass}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td>
            <td>${idx}</td>
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

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => {
        const searchText = state.onbFilters.text;
        const fullName = (item.first + ' ' + item.last).toLowerCase();
        const mobile = (item.mobile || '').toLowerCase();
        return fullName.includes(searchText) || mobile.includes(searchText);
    });

    const headers = ['<input type="checkbox" id="select-all-onb" onclick="toggleSelectAll(\'onb\', this)">', '#', 'First Name', 'Last Name', 'Date of Birth', 'Recruiter', 'Mobile', 'Status', 'Assigned', 'Comments'];
    dom.tables.onb.head.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    const footerCount = document.getElementById('onb-footer-count');
    if(footerCount) footerCount.innerText = `Showing ${filtered.length} records`;

    dom.tables.onb.body.innerHTML = filtered.map((c, i) => {
        const idx = i + 1;
        const isSel = state.selection.onb.has(c.id) ? 'checked' : '';
        
        return `<tr>
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td>
            <td>${idx}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob || ''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td>
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

/* ========================================================
   9. PLACEMENT BOARD LOGIC
   ======================================================== */
window.updatePlacementFilter = (type, btn) => {
    state.placementFilter = type;
    document.querySelectorAll('#view-placements .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const monthPicker = document.getElementById('placement-month-picker');
    const yearPicker = document.getElementById('placement-year-picker');
    if(type === 'monthly') { monthPicker.style.display = 'block'; yearPicker.style.display = 'none'; } 
    else { monthPicker.style.display = 'none'; yearPicker.style.display = 'block'; }
    renderPlacementTable();
};

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

    const tbody = document.getElementById('placement-table-body');
    const thead = document.querySelector('#placement-table thead');
    
    if(thead) {
        thead.innerHTML = `<tr><th>#</th><th>Full Name</th><th>Tech</th><th>Location</th><th>Contract</th><th>Assigned</th><th>Actions</th></tr>`;
    }

    if(!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="opacity:0.6; padding:20px;">No placements found for this period.</td></tr>`;
        document.getElementById('placement-footer-count').innerText = "Showing 0 records";
        return;
    }

    tbody.innerHTML = filtered.map((c, i) => {
        return `
        <tr>
            <td>${i + 1}</td>
            <td><span style="font-weight:600; color:var(--text-main);">${c.first} ${c.last}</span></td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)" class="text-cyan">${c.tech}</td>
            <td onclick="inlineEdit('${c.id}', 'location', 'candidates', this)">${c.location || '<span style="opacity:0.5; font-size:0.8rem;">Add Location</span>'}</td>
            <td onclick="inlineEdit('${c.id}', 'contract', 'candidates', this)">${c.contract || '<span style="opacity:0.5; font-size:0.8rem;">Add Type</span>'}</td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td>
                ${state.userRole !== 'Employee' ? 
                `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')" title="Permanently Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
            </td>
        </tr>`;
    }).join('');
    
    document.getElementById('placement-footer-count').innerText = `Showing ${filtered.length} placed candidates`;
};

window.manualAddPlacement = () => {
    const today = new Date().toISOString().split('T')[0];
    db.collection('candidates').add({
        first: 'New', last: 'Candidate', tech: 'Technology', status: 'Placed',       
        assigned: today, location: '', contract: '', createdAt: Date.now(), mobile: '',
        recruiter: state.userRole === 'Employee' ? state.currentUserName : ''
    }).then(() => {
        showToast("New Placement Row Added");
        const currentMonth = today.slice(0, 7); 
        document.getElementById('placement-month-picker').value = currentMonth;
        if(state.placementFilter === 'monthly') renderPlacementTable();
    }).catch(err => {
        showToast("Error: " + err.message);
    });
};

window.deletePlacement = (id) => {
    if(!confirm("Are you sure? This will permanently delete this record.")) return;
    db.collection('candidates').doc(id).delete()
        .then(() => showToast("Record Deleted"))
        .catch(err => showToast("Error: " + err.message));
};

/* ========================================================
   10. ACTIONS & UTILITIES
   ======================================================== */
function inlineEdit(id, field, collection, el) {
    if(el.querySelector('input')) return;
    const currentText = el.innerText === '-' ? '' : el.innerText;
    el.innerHTML = ''; el.classList.add('editing-cell');
    const input = document.createElement('input'); input.type = 'text'; input.value = currentText; input.className = 'inline-input-active';
    const save = () => { const newVal = input.value.trim(); el.innerHTML = newVal || '-'; el.classList.remove('editing-cell'); if (newVal !== currentText) db.collection(collection).doc(id).update({ [field]: newVal }); };
    input.addEventListener('blur', save); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    el.appendChild(input); input.focus();
}

function inlineUrlEdit(id, field, collection, el) {
    if(el.querySelector('input')) return;
    el.innerHTML = ''; el.classList.add('editing-cell');
    const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'Paste Link Here...'; input.className = 'inline-input-active';
    const save = () => { 
        let newVal = input.value.trim(); 
        if(newVal && !newVal.startsWith('http')) newVal = 'https://' + newVal; 
        el.innerHTML = newVal ? 'Saved' : '';
        el.classList.remove('editing-cell'); 
        db.collection(collection).doc(id).update({ [field]: newVal }); 
    };
    input.addEventListener('blur', save); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    el.appendChild(input); input.focus();
}

function inlineDateEdit(id, field, collection, val) {
    db.collection(collection).doc(id).update({ [field]: val });
}

function editRecruiter(id, collection, el) {
    if (state.userRole === 'Employee') {
        showToast("Access Denied: You cannot change the recruiter.");
        return;
    }
    if(el.querySelector('select')) return;
    
    const currentVal = el.innerText; 
    el.innerHTML = '';
    
    const sel = document.createElement('select'); 
    sel.className = 'modern-select';
    
    const defOpt = document.createElement('option');
    defOpt.text = "Select Recruiter";
    defOpt.value = "";
    sel.appendChild(defOpt);

    state.metadata.recruiters.forEach(r => { 
        const opt = document.createElement('option'); 
        opt.value = r.value; 
        opt.text = r.display; 
        if(r.value === currentVal) opt.selected = true; 
        sel.appendChild(opt); 
    });

    sel.focus(); 
    
    const save = () => {
        if(sel.value) {
            db.collection(collection).doc(id).update({ recruiter: sel.value });
        } else {
            el.innerText = currentVal;
        }
    };

    sel.addEventListener('blur', save); 
    sel.addEventListener('change', save); 
    el.appendChild(sel);
}

window.updateStatus = (id, col, val) => db.collection(col).doc(id).update({ status: val });

window.toggleSelect = (id, type) => {
    if(!state.selection[type]) return; 
    if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id);
    updateSelectButtons(type);
};

window.toggleSelectAll = (type, mainCheckbox) => {
    const isChecked = mainCheckbox.checked;
    let currentData = [];
    if (type === 'cand') currentData = getFilteredData(state.candidates, state.filters);
    else if (type === 'emp') { 
        currentData = state.employees;
        if(state.userRole === 'Employee') currentData = currentData.filter(e => e.officialEmail === state.user.email);
        const searchText = state.empFilters.text;
        currentData = currentData.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(searchText));
    }
    else { 
        const searchText = state.onbFilters.text;
        currentData = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(searchText));
    }
    currentData.forEach(item => { if (isChecked) state.selection[type].add(item.id); else state.selection[type].delete(item.id); });
    updateSelectButtons(type);
    if (type === 'cand') renderCandidateTable(); 
    else if (type === 'emp') renderEmployeeTable();
    else renderOnboardingTable();
    setTimeout(() => { const newMaster = document.getElementById(`select-all-${type}`); if(newMaster) newMaster.checked = isChecked; }, 0);
};

function updateSelectButtons(type) {
    let btn, countSpan;
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); }
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); }
    else { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); }
    
    if (!btn) return;

    if (state.selection[type].size > 0 && state.userRole !== 'Employee') {
        btn.style.display = 'inline-flex';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        if (countSpan) countSpan.innerText = state.selection[type].size; 
    } else { 
        btn.style.display = 'inline-flex';
        btn.style.opacity = '0.3';
        btn.style.pointerEvents = 'none';
        if (countSpan) countSpan.innerText = '0';
    }
}

function setupEventListeners() {
    document.getElementById('btn-logout').addEventListener('click', () => auth.signOut());
    document.getElementById('theme-toggle').addEventListener('click', () => { document.body.classList.toggle('light-mode'); localStorage.setItem('np_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); });
    
    // Auth Handlers
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

    // Seed Data
    document.getElementById('btn-seed-data').addEventListener('click', window.seedData);
    
    // Search Filters
    document.getElementById('search-input').addEventListener('input', e => { state.filters.text = e.target.value.toLowerCase(); renderCandidateTable(); });
    document.getElementById('filter-recruiter').addEventListener('change', e => { state.filters.recruiter = e.target.value; renderCandidateTable(); });
    document.getElementById('filter-tech').addEventListener('change', e => { state.filters.tech = e.target.value; renderCandidateTable(); });
    document.querySelectorAll('.btn-toggle').forEach(btn => { btn.addEventListener('click', e => { document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); state.filters.status = e.target.dataset.status; renderCandidateTable(); }); });
    document.getElementById('btn-reset-filters').addEventListener('click', () => { document.getElementById('search-input').value = ''; document.getElementById('filter-recruiter').value = ''; document.getElementById('filter-tech').value = ''; document.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active')); document.querySelector('.btn-toggle[data-status=""]').classList.add('active'); state.filters = { text: '', recruiter: '', tech: '', status: '' }; renderCandidateTable(); showToast("Filters refreshed"); });

    document.getElementById('hub-search-input').addEventListener('input', e => { state.hubFilters.text = e.target.value.toLowerCase(); renderHubTable(); });
    const hubRecSelect = document.getElementById('hub-filter-recruiter');
    if(hubRecSelect) { hubRecSelect.addEventListener('change', (e) => { state.hubFilters.recruiter = e.target.value; renderHubTable(); }); }

    const onbSearch = document.getElementById('onb-search-input');
    if(onbSearch) { onbSearch.addEventListener('input', e => { state.onbFilters.text = e.target.value.toLowerCase(); renderOnboardingTable(); }); }

    const empSearch = document.getElementById('emp-search-input');
    if(empSearch) { empSearch.addEventListener('input', e => { state.empFilters.text = e.target.value.toLowerCase(); renderEmployeeTable(); }); }

    // Add Action Buttons
    document.getElementById('btn-add-candidate').addEventListener('click', () => { 
        const defaultRecruiter = state.userRole === 'Employee' ? state.currentUserName : '';
        db.collection('candidates').add({ 
            first: '', last: '', mobile: '', wa: '', tech: '', recruiter: defaultRecruiter, status: 'Active', 
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
            first: '', last: '', dob: '', designation: '', workMobile: '', personalMobile: '', officialEmail: '', personalEmail: '', createdAt: Date.now() 
        }).then(() => showToast("Employee Added")); 
    });

    // Delete Buttons
    document.getElementById('btn-delete-selected').addEventListener('click', () => openDeleteModal('cand'));
    document.getElementById('btn-delete-onboarding').addEventListener('click', () => openDeleteModal('onb'));
    document.getElementById('btn-delete-employee').addEventListener('click', () => openDeleteModal('emp'));

    // Mobile Sidebar
    const mobileBtn = document.getElementById('btn-mobile-menu');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if(mobileBtn) { mobileBtn.addEventListener('click', () => { sidebar.classList.toggle('mobile-open'); overlay.classList.toggle('active'); }); }
    if(overlay) { overlay.addEventListener('click', () => { sidebar.classList.remove('mobile-open'); overlay.classList.remove('active'); }); }

    // Hub Date Logic
    const hubPicker = document.getElementById('hub-date-picker');
    if(hubPicker) {
        hubPicker.value = new Date().toISOString().split('T')[0];
        hubPicker.addEventListener('change', (e) => { updateHubStats(null, e.target.value); });
    }
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
             if(btn.closest('#view-placements')) return; 
             updateHubStats(btn.getAttribute('data-filter'), null);
        });
    });
    setTimeout(() => { if(window.updateHubStats) updateHubStats('daily', new Date().toISOString().split('T')[0]); }, 1000);

    // Wallpaper Logic
    const wallpaperBtn = document.getElementById('change-wallpaper-btn');
    const wallpapers = [ "", "linear-gradient(to right, #243949 0%, #517fa4 100%)", "linear-gradient(109.6deg, rgb(20, 30, 48) 11.2%, rgb(36, 59, 85) 91.1%)", "linear-gradient(to top, #30cfd0 0%, #330867 100%)", "linear-gradient(to right, #434343 0%, black 100%)" ];
    let wpIndex = 0;
    if(wallpaperBtn) {
        wallpaperBtn.addEventListener('click', () => {
            wpIndex++; if(wpIndex >= wallpapers.length) wpIndex = 0;
            if(wpIndex === 0) document.body.style.background = ""; else document.body.style.background = wallpapers[wpIndex];
        });
    }
}

/* ========================================================
   11. DATA SEEDING & DELETION
   ======================================================== */
window.seedData = () => {
    if (state.userRole === 'Employee') return showToast("Permission Denied");
    const batch = db.batch();
    const techList = state.metadata.techs;
    const recList = state.metadata.recruiters.length > 0 ? state.metadata.recruiters.map(r=>r.value) : ['Test Recruiter'];
    for (let i = 1; i <= 25; i++) {
        const newRef = db.collection('candidates').doc();
        batch.set(newRef, { first: `Candidate`, last: `${i}`, mobile: `98765432${i < 10 ? '0'+i : i}`, wa: `98765432${i < 10 ? '0'+i : i}`, tech: techList[Math.floor(Math.random() * techList.length)], recruiter: recList[Math.floor(Math.random() * recList.length)], status: i % 3 === 0 ? "Inactive" : "Active", assigned: new Date().toISOString().split('T')[0], comments: "Auto-generated demo data", createdAt: Date.now() + i });
    }
    batch.commit().then(() => { renderCandidateTable(); showToast("25 Demo Candidates Inserted"); });
};

window.openDeleteModal = (type) => {
    if (!state.selection[type] || state.selection[type].size === 0) return showToast("No items selected");
    state.pendingDelete.type = type; 
    document.getElementById('del-count').innerText = state.selection[type].size;
    document.getElementById('delete-modal').style.display = 'flex';
};

window.closeDeleteModal = () => {
    document.getElementById('delete-modal').style.display = 'none';
    state.pendingDelete.type = null;
};

window.executeDelete = async () => { 
    const type = state.pendingDelete.type; 
    if (!type) { closeDeleteModal(); return; }

    let collection = '';
    let tableRenderFunc = null;
    if (type === 'cand') { collection = 'candidates'; tableRenderFunc = renderCandidateTable; }
    else if (type === 'onb') { collection = 'onboarding'; tableRenderFunc = renderOnboardingTable; }
    else if (type === 'emp') { collection = 'employees'; tableRenderFunc = renderEmployeeTable; }
    
    if (!collection) { showToast("Error: Unknown Collection Type"); closeDeleteModal(); return; }

    const btn = document.querySelector('#delete-modal .btn-danger');
    const originalText = btn.innerText;
    btn.innerText = "Deleting...";
    btn.disabled = true;

    try {
        const batch = db.batch();
        const idsArray = Array.from(state.selection[type]);
        idsArray.forEach(id => { if(id) { const ref = db.collection(collection).doc(id); batch.delete(ref); } });
        await batch.commit();
        
        state.selection[type].clear(); 
        updateSelectButtons(type); 
        if (tableRenderFunc) tableRenderFunc();
        
        // Force Uncheck "Select All"
        const masterCheckbox = document.getElementById(`select-all-${type}`);
        if(masterCheckbox) masterCheckbox.checked = false;

        showToast(`Successfully deleted ${idsArray.length} items.`);
    } catch (error) {
        console.error("Delete Failed:", error);
        alert("Delete Failed: " + error.message); 
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        closeDeleteModal();
    }
};

window.exportData = () => { if (state.candidates.length === 0) return showToast("No data"); const headers = ["ID", "First", "Last", "Mobile", "Tech", "Recruiter", "Status", "Date", "Comments"]; const csvRows = [headers.join(",")]; state.candidates.forEach(c => { const row = [c.id, `"${c.first}"`, `"${c.last}"`, `"${c.mobile}"`, `"${c.tech}"`, `"${c.recruiter}"`, `"${c.status}"`, c.assigned, `"${(c.comments || '').replace(/"/g, '""')}"`]; csvRows.push(row.join(",")); }); const blob = new Blob([csvRows.join("\n")], { type: "text/csv" }); const url = window.URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "candidates.csv"; a.click(); };

/* ========================================================
   12. DASHBOARD VISUALIZATIONS
   ======================================================== */
function updateDashboardStats() { 
    let calcData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) {
        calcData = calcData.filter(c => c.recruiter === state.currentUserName);
    }

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

    const currentYear = new Date().getFullYear();
    const monthlyStats = Array(12).fill(0).map(() => ({ subs: 0, placements: 0 }));

    calcData.forEach(c => {
        // Count Placements
        if (c.status === 'Placed' && c.assigned) {
            const d = new Date(c.assigned);
            if (d.getFullYear() === currentYear) {
                monthlyStats[d.getMonth()].placements++;
            }
        }
        // Count Submissions (using the log)
        if (c.submissionLog) {
            c.submissionLog.forEach(log => {
                const d = new Date(log.date || log); // Handle legacy string dates
                if (d.getFullYear() === currentYear) {
                    monthlyStats[d.getMonth()].subs++;
                }
            });
        }
    });

    renderChart('chart-recruiter', { 
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        datasets: [
            {
                label: 'Submissions',
                data: monthlyStats.map(m => m.subs),
                backgroundColor: 'rgba(6, 182, 212, 0.6)', 
                borderColor: '#06b6d4',
                borderWidth: 1
            },
            {
                label: 'Placements',
                data: monthlyStats.map(m => m.placements),
                backgroundColor: 'rgba(34, 197, 94, 0.8)', 
                borderColor: '#22c55e',
                borderWidth: 1
            }
        ]
    }, 'bar');
    
    const techData = getChartData(calcData, 'tech');
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
    
    // Config specifically for the bar chart comparison or general usage
    const datasets = data.datasets || [{ label: 'Data', data: data.data, backgroundColor: colors, borderColor: 'rgba(0,0,0,0.1)', borderWidth: 1 }];
    
    chartInstances[id] = new Chart(context, { type: type, data: { labels: data.labels, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { y: { display: type === 'bar', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { display: type === 'bar', grid: { display: false }, ticks: { color: '#94a3b8' } } } } }); 
}

/* ========================================================
   13. SECURITY TIMERS
   ======================================================== */
let inactivityTimer;
function startAutoLogoutTimer() {
    const TIMEOUT_DURATION = 10 * 60 * 1000; 
    function resetTimer() {
        if (!firebase.auth().currentUser) return; 
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            firebase.auth().signOut().then(() => { showToast("Session expired due to inactivity"); switchScreen('auth'); });
        }, TIMEOUT_DURATION);
    }
    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(event => { document.addEventListener(event, resetTimer); });
    resetTimer();
}
function stopAutoLogoutTimer() { clearTimeout(inactivityTimer); }

/* ========================================================
   14. HUB STATISTICS & LOGIC
   ======================================================== */
state.hubDate = new Date().toISOString().split('T')[0]; 
state.hubFilterType = 'daily'; 

window.updateHubStats = (filterType, dateVal) => {
    if(filterType) state.hubFilterType = filterType;
    if(dateVal) state.hubDate = dateVal;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        if(btn.closest('#view-placements')) return;
        if(btn.dataset.filter === state.hubFilterType) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const picker = document.getElementById('hub-date-picker');
    if(picker && picker.value !== state.hubDate) picker.value = state.hubDate;

    const d = new Date(state.hubDate);
    let startTimestamp, endTimestamp;
    let labelText = "";

    if (state.hubFilterType === 'daily') {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        endTimestamp = startTimestamp + 86400000; 
        labelText = d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } 
    else if (state.hubFilterType === 'weekly') {
        const day = d.getDay(); const distanceToMon = day === 0 ? 6 : day - 1; 
        const monday = new Date(d); monday.setDate(d.getDate() - distanceToMon); 
        const friday = new Date(monday); friday.setDate(monday.getDate() + 4); 
        startTimestamp = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
        endTimestamp = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate()).getTime() + 86400000;
        labelText = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${friday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } 
    else if (state.hubFilterType === 'monthly') {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        endTimestamp = lastDay.getTime() + 86400000;
        labelText = `${new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    state.hubRange = { start: startTimestamp, end: endTimestamp };
    const labelEl = document.getElementById('hub-range-label');
    if(labelEl) labelEl.innerHTML = `<i class="fa-regular fa-calendar"></i> &nbsp; ${labelText}`;

    let subCount = 0, scrCount = 0, intCount = 0;
    const checkDateInRange = (entry) => {
        const dStr = (typeof entry === 'string') ? entry : entry.date;
        const t = new Date(dStr).getTime();
        return t >= startTimestamp && t < endTimestamp;
    };
    
    let hubData = state.candidates;
    if (state.userRole === 'Employee' && state.currentUserName) {
        hubData = hubData.filter(c => c.recruiter === state.currentUserName);
    }

    if(hubData) {
        hubData.forEach(c => {
            if(c.submissionLog) c.submissionLog.forEach(entry => { if(checkDateInRange(entry)) subCount++; });
            if(c.screeningLog) c.screeningLog.forEach(entry => { if(checkDateInRange(entry)) scrCount++; });
            if(c.interviewLog) c.interviewLog.forEach(entry => { if(checkDateInRange(entry)) intCount++; });
        });
    }

    animateValue('stat-sub', subCount);
    animateValue('stat-scr', scrCount);
    animateValue('stat-int', intCount);
    renderHubTable();
};

function animateValue(id, end) {
    const obj = document.getElementById(id);
    if(!obj) return;
    const start = parseInt(obj.innerText) || 0;
    if(start === end) return;
    let current = start;
    const range = end - start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(500 / range));
    const timer = setInterval(() => {
        current += increment;
        obj.innerText = current;
        if (current == end) clearInterval(timer);
    }, range === 0 ? 0 : (stepTime || 10));
}

window.toggleHubRow = (id) => {
    if(state.expandedRowId === id) state.expandedRowId = null; else state.expandedRowId = id;
    renderHubTable();
};

window.deleteHubLog = (id, fieldName, indexToDelete) => {
    if(!confirm("Delete this log entry?")) return;
    const candidate = state.candidates.find(c => c.id === id);
    if(!candidate) return;
    let logs = candidate[fieldName] || [];
    if (indexToDelete > -1 && indexToDelete < logs.length) logs.splice(indexToDelete, 1);
    db.collection('candidates').doc(id).update({ [fieldName]: logs }).then(() => {
        showToast("Log Deleted");
    }).catch(err => showToast("Error: " + err.message));
};

/* ========================================================
   15. FILE HANDLING (HUB + PROFILE)
   ======================================================== */
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
        const candidate = state.candidates.find(c => c.id === id);
        let logs = candidate[field] || [];
        const newEntry = { date: dateVal, link: url, timestamp: Date.now() };
        logs.push(newEntry);
        logs.sort((a, b) => {
            const da = (typeof a === 'string') ? a : a.date;
            const db = (typeof b === 'string') ? b : b.date;
            return new Date(db) - new Date(da);
        });
        return db.collection('candidates').doc(id).update({ [field]: logs });
    }).then(() => {
        showToast("Email Attached!");
        input.value = '';
    }).catch(err => {
        showToast("Upload Error: " + err.message);
        input.value = '';
    });
};

window.viewEmailLog = async (url) => {
    dom.emailViewer.modal.style.display = 'flex';
    dom.emailViewer.subject.textContent = "Loading Email...";
    dom.emailViewer.iframe.srcdoc = "";

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("File not found or link expired.");
        const blob = await response.blob();
        const parser = new PostalMime.default();
        const email = await parser.parse(blob);

        dom.emailViewer.subject.textContent = email.subject || '(No Subject)';
        dom.emailViewer.from.textContent = email.from ? `${email.from.name || ''} <${email.from.address}>` : 'Unknown';
        dom.emailViewer.to.textContent = email.to ? email.to.map(t => t.address).join(', ') : 'Unknown';
        dom.emailViewer.date.textContent = email.date ? new Date(email.date).toLocaleString() : '';

        let bodyContent = email.html || email.text || '<div style="padding:20px">No content to display.</div>';
        bodyContent = bodyContent.replace(/<a /g, '<a style="pointer-events:none; cursor:default; color:gray; text-decoration:none;" ');

        dom.emailViewer.iframe.srcdoc = `<base target="_blank"><style>body { font-family: sans-serif; padding: 20px; }</style>${bodyContent}`;

    } catch (err) {
        console.error(err);
        dom.emailViewer.subject.textContent = "Error Loading Email";
        dom.emailViewer.iframe.srcdoc = `<div style="padding:20px; text-align:center; color:#ef4444;"><h3>Could not load email</h3><p>Ensure you uploaded a <b>.eml</b> file.</p><small>${err.message}</small></div>`;
    }
};

window.closeEmailViewer = () => {
    dom.emailViewer.modal.style.display = 'none';
    dom.emailViewer.iframe.srcdoc = '';
};

window.triggerPhotoUpload = () => { document.getElementById('profile-upload-input').click(); };

window.handlePhotoUpload = async (input) => {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast("Please select an image file.");

    const user = auth.currentUser;
    if (!user) return;
    const loader = document.getElementById('avatar-loading');
    if(loader) loader.style.display = 'flex';
    const localPreviewURL = URL.createObjectURL(file);
    const avatarImg = document.getElementById('profile-main-img');
    const avatarPlaceholder = document.getElementById('profile-main-icon');
    if(avatarImg) { avatarImg.src = localPreviewURL; avatarImg.style.display = 'block'; }
    if(avatarPlaceholder) avatarPlaceholder.style.display = 'none';

    try {
        const compressedBlob = await compressImage(file, 600, 0.7);
        const storageRef = storage.ref(`users/${user.email}/profile.jpg`); 
        const uploadTask = storageRef.put(compressedBlob);

        uploadTask.on('state_changed', null, 
            (error) => { showToast("Upload Failed"); if(loader) loader.style.display = 'none'; }, 
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    db.collection('users').doc(user.email).set({ photoURL: downloadURL }, { merge: true });
                    user.updateProfile({ photoURL: downloadURL });
                    document.getElementById('btn-delete-photo').style.display = 'flex';
                    if(loader) loader.style.display = 'none';
                    showToast("Photo Updated");
                });
            }
        );
    } catch (err) { showToast("Error processing image"); if(loader) loader.style.display = 'none'; }
};

function compressImage(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => { resolve(blob); }, 'image/jpeg', quality);
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

window.deleteProfilePhoto = () => {
    if(!confirm("Remove profile photo?")) return;
    const user = auth.currentUser;
    if (!user) return;
    const loader = document.getElementById('avatar-loading');
    if(loader) loader.style.display = 'flex';

    db.collection('users').doc(user.email).update({ photoURL: firebase.firestore.FieldValue.delete() }).then(() => {
        document.getElementById('profile-main-img').style.display = 'none';
        document.getElementById('profile-main-icon').style.display = 'flex';
        document.getElementById('btn-delete-photo').style.display = 'none';
        if(loader) loader.style.display = 'none';
        showToast("Photo Removed");
    }).catch(err => {
        showToast("Error: " + err.message);
        if(loader) loader.style.display = 'none';
    });
};

/* ========================================================
   16. GMAIL API LOGIC (LIVE SYNC & SMART FEATURES)
   ======================================================== */

// --- 1. Dynamic Script Loader ---
function loadGoogleScripts() {
    // 1. Load GAPI (Gmail API)
    const gapiScript = document.createElement('script');
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.async = true;
    gapiScript.defer = true;
    gapiScript.onload = window.gapiLoaded;
    gapiScript.onerror = () => handleScriptError("GAPI");
    document.body.appendChild(gapiScript);

    // 2. Load GIS (Identity Services)
    const gisScript = document.createElement('script');
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.async = true;
    gisScript.defer = true;
    gisScript.onload = window.gisLoaded;
    gisScript.onerror = () => handleScriptError("GIS");
    document.body.appendChild(gisScript);
    
    // Safety Timeout
    setTimeout(() => {
        if (!state.gmail.gapiInited || !state.gmail.gisInited) {
            console.warn("Google Scripts timed out.");
            if(dom.gmail.btnAuth) {
                dom.gmail.btnAuth.disabled = false;
                dom.gmail.btnAuth.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Retry Connection';
                dom.gmail.btnAuth.onclick = () => window.location.reload(); 
            }
        }
    }, 8000);
}

function handleScriptError(scriptName) {
    showToast(`Error loading ${scriptName}. Check ad blockers.`);
}

// --- 2. Loader Callbacks ---
window.gapiLoaded = function() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] });
            state.gmail.gapiInited = true;
            checkGmailAuth();
        } catch (error) {
            console.error('GAPI Init Error:', error);
            let errMsg = error.message || JSON.stringify(error);
            if (error.result && error.result.error) errMsg = error.result.error.message;
            showToast('Google API Error: ' + errMsg);
        }
    });
};

window.gisLoaded = function() {
    try {
        state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: G_CLIENT_ID,
            scope: G_SCOPES,
            callback: async (resp) => {
                if (resp.error) {
                    if(resp.error === 'popup_closed_by_user') return;
                    return showToast('Gmail Auth Error: ' + resp.error);
                }
                updateGmailUI(true);
                loadInbox();
            },
        });
        state.gmail.gisInited = true;
        checkGmailAuth();
    } catch (err) {
        console.error("GIS Init Error:", err);
    }
};

function checkGmailAuth() {
    if (state.gmail.gapiInited && state.gmail.gisInited) {
        if(dom.gmail.btnAuth) {
            dom.gmail.btnAuth.disabled = false;
            dom.gmail.btnAuth.style.opacity = "1";
            dom.gmail.btnAuth.innerHTML = '<i class="fa-brands fa-google"></i> Connect Gmail';
        }
        const token = gapi.client.getToken();
        if(token) updateGmailUI(true);
    }
}

// --- 3. Auth UI Actions ---
if(dom.gmail.btnAuth) {
    dom.gmail.btnAuth.disabled = true;
    dom.gmail.btnAuth.style.opacity = "0.7";
    dom.gmail.btnAuth.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Loading...';

    dom.gmail.btnAuth.addEventListener('click', () => {
        if (!state.gmail.tokenClient) return showToast("Google Auth initializing...");
        state.gmail.tokenClient.requestAccessToken({prompt: ''});
    });
}

if(dom.gmail.btnSignout) {
    dom.gmail.btnSignout.addEventListener('click', () => {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
            dom.gmail.list.innerHTML = '';
            updateGmailUI(false);
            showToast("Gmail Disconnected");
        }
    });
}

function updateGmailUI(isSignedIn) {
    if (isSignedIn) {
        dom.gmail.btnAuth.style.display = 'none';
        dom.gmail.btnSignout.style.display = 'inline-block';
        dom.gmail.empty.style.display = 'none';
    } else {
        dom.gmail.btnAuth.style.display = 'inline-block';
        dom.gmail.btnSignout.style.display = 'none';
        dom.gmail.list.innerHTML = '';
        dom.gmail.empty.style.display = 'block';
        
        const countEl = document.getElementById('gmail-count-display');
        if(countEl) countEl.innerText = "0 Mails";
    }
}

// --- 4. Inbox Operations ---
if(dom.gmail.searchInput) {
    dom.gmail.searchInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            state.gmail.nextPageToken = null;
            dom.gmail.list.innerHTML = '';
            loadInbox();
        }
    });
}

const refreshBtn = document.getElementById('btn-refresh-inbox');
if(refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        state.gmail.nextPageToken = null;
        dom.gmail.list.innerHTML = '';
        loadInbox();
    });
}

if(dom.gmail.loadMore) {
    dom.gmail.loadMore.addEventListener('click', () => loadInbox());
}

// --- LIVE SYNC & LOAD LOGIC ---
let autoSyncInterval = null;

window.toggleAutoSync = (checkbox) => {
    const indicator = document.getElementById('live-indicator');
    
    if (checkbox.checked) {
        showToast("Live Sync Enabled (Checks every 15s)");
        indicator.style.display = 'block';
        loadInbox(true); 
        autoSyncInterval = setInterval(() => {
            loadInbox(true); // true = silent mode
        }, 15000); 
    } else {
        showToast("Live Sync Disabled");
        indicator.style.display = 'none';
        clearInterval(autoSyncInterval);
    }
};

async function loadInbox(isSilent = false) {
    if (!isSilent) {
        dom.gmail.skeleton.style.display = 'block';
        dom.gmail.empty.style.display = 'none';
        dom.gmail.loadMore.style.display = 'none';
    }

    try {
        const searchTerm = dom.gmail.searchInput.value;
        const requestOptions = { 'userId': 'me', 'maxResults': 20 };
        
        if (searchTerm.trim().length > 0) requestOptions.q = searchTerm;
        else requestOptions.labelIds = ['INBOX'];

        if (state.gmail.nextPageToken && !isSilent) requestOptions.pageToken = state.gmail.nextPageToken;

        const response = await gapi.client.gmail.users.messages.list(requestOptions);
        state.gmail.nextPageToken = response.result.nextPageToken;
        const messages = response.result.messages;

        if (!isSilent) dom.gmail.skeleton.style.display = 'none';

        if (!messages || messages.length === 0) {
            if (!isSilent && dom.gmail.list.children.length === 0) {
                dom.gmail.empty.style.display = 'block';
                document.getElementById('gmail-count-display').innerText = "0 Mails";
            }
            return;
        }

        // Silent Sync: Check if top email changed
        if (isSilent && dom.gmail.list.firstElementChild) {
            const topMsgId = messages[0].id;
            const currentTopId = dom.gmail.list.firstElementChild.getAttribute('data-id');
            if (topMsgId === currentTopId) return; 
        }

        const batchPromises = messages.map(msg => 
            gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msg.id })
        );
        const fullEmails = await Promise.all(batchPromises);

        if (isSilent) dom.gmail.list.innerHTML = ''; 
        fullEmails.forEach(details => renderEmailRow(details.result));

        if (state.gmail.nextPageToken) dom.gmail.loadMore.style.display = 'inline-block';

        document.getElementById('gmail-count-display').innerText = `${fullEmails.length} Recent`;

    } catch (err) {
        if (!isSilent) dom.gmail.skeleton.style.display = 'none';
        console.error(err);
        if(err.result && err.result.error && err.result.error.code === 401) {
             showToast("Session expired. Please reconnect Gmail.");
             updateGmailUI(false);
        }
    }
}

function renderEmailRow(email) {
    const headers = email.payload.headers;
    const getHeader = (name) => (headers.find(h => h.name === name) || {}).value || 'Unknown';
    
    const fromRaw = getHeader('From');
    let senderName = fromRaw.split('<')[0].replace(/"/g, '').trim();
    if (!senderName) senderName = fromRaw.replace(/[<>]/g, '');

    const subject = getHeader('Subject');
    const dateObj = new Date(Number(email.internalDate));
    
    const now = new Date();
    const diff = Math.floor((now - dateObj) / 1000);
    let timeString = '';
    if (diff < 60) timeString = 'Just now';
    else if (diff < 3600) timeString = Math.floor(diff / 60) + 'm ago';
    else if (diff < 86400) timeString = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    else timeString = dateObj.toLocaleDateString([], {month: 'short', day: 'numeric'});

    const initial = senderName.charAt(0).toUpperCase();

    const li = document.createElement('li');
    li.className = 'email-item';
    li.setAttribute('data-id', email.id); 

    li.innerHTML = `
        <div class="email-avatar">${initial}</div>
        <div class="email-content">
            <div class="email-sender" style="color:var(--text-main); font-weight:700; font-size:0.95rem; margin-bottom:2px;">${senderName}</div>
            <div class="email-subject" style="color:var(--text-main); font-size:0.9rem; opacity:0.9;">${subject}</div>
            <div class="email-snippet" style="font-size:0.85rem;">${email.snippet}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
            <div class="email-date">${timeString}</div>
             <button class="btn-icon-small" onclick="event.stopPropagation(); syncEmailToCandidate('${email.id}')" title="Sync to Hub">
                <i class="fa-solid fa-file-import text-cyan"></i>
             </button>
        </div>
    `;
    
    li.onclick = () => { showToast("Opened: " + subject.substring(0, 20) + "..."); };
    dom.gmail.list.appendChild(li);
}

// --- SMART EMAIL SYNC ---
window.syncEmailToCandidate = async (messageId) => {
    const candidateName = prompt("Enter the exact FIRST NAME of the candidate:");
    if (!candidateName) return;

    const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase());
    if (!candidate) return showToast("Candidate not found.");

    showToast("Analyzing email content...");

    try {
        const response = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': messageId });
        const emailData = response.result;
        const headers = emailData.payload.headers;
        
        const subject = (headers.find(h => h.name === 'Subject') || {}).value || 'No Subject';
        const snippet = emailData.snippet || '';
        const fullText = subject + " " + snippet;

        let subType = "General Email";
        if (fullText.toLowerCase().includes("rtr") || fullText.toLowerCase().includes("right to represent")) {
            subType = "RTR Submission";
        } else if (fullText.toLowerCase().includes("rate") || fullText.toLowerCase().includes("confirmation")) {
            subType = "Rate Confirmation";
        }

        let detectedTech = candidate.tech;
        const knownTechs = state.metadata.techs || ["Java", "React", "Python", ".NET", "DevOps"];
        for (const t of knownTechs) {
            if (subject.toLowerCase().includes(t.toLowerCase())) {
                detectedTech = t;
                break;
            }
        }

        const newLogEntry = {
            date: new Date(Number(emailData.internalDate)).toISOString().split('T')[0],
            link: `https://mail.google.com/mail/u/0/#inbox/${messageId}`,
            subject: subject,
            type: subType,      
            tech: detectedTech,  
            recruiter: state.currentUserName,
            timestamp: Date.now()
        };

        const currentLogs = candidate.submissionLog || [];
        currentLogs.push(newLogEntry);
        currentLogs.sort((a, b) => new Date(b.date) - new Date(a.date));

        await db.collection('candidates').doc(candidate.id).update({
            submissionLog: currentLogs,
            tech: detectedTech 
        });

        showToast(`Synced: ${subType} (${detectedTech})`);

    } catch (err) {
        console.error(err);
        showToast("Sync Failed: " + err.message);
    }
};

document.addEventListener('DOMContentLoaded', init);
