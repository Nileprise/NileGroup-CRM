/* ==========================================================================
   1. CONFIGURATION (FIREBASE + GMAIL API)
   ========================================================================== */
// CRITICAL: Replace these keys with your own in a production environment.
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

// Gmail API Config
const G_CLIENT_ID = '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE';
const G_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const G_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.labels';

// Initialize Firebase
try { firebase.initializeApp(firebaseConfig); } catch (e) { console.error("Firebase Init Error:", e); }
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

/* ==========================================================================
   2. STATE & ACCESS CONTROL
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

// Default Custom Labels
const DEFAULT_LABELS = [
    { name: "Ajay", color: "#e91e63" },
    { name: "Asif", color: "#9c27b0" },
    { name: "Ikram", color: "#2196f3" },
    { name: "Manikanta", color: "#4caf50" },
    { name: "Shoeb", color: "#ff9800" }
];

const state = {
    user: null, userRole: null, currentUserName: null, userProfileId: null,
    candidates: [], onboarding: [], employees: [],
    
    // Labels State
    labels: [...DEFAULT_LABELS],
    labelManageMode: false,
    selectedLabelColor: "#e91e63",

    // Custom Column Definitions
    customColumns: {
        candidates: [],
        employees: [],
        onboarding: [],
        placements: []
    },

    // Alignment State
    alignments: { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {} },

    // Gmail State
    gmail: {
        tokenClient: null, gapiInited: false, gisInited: false,
        nextPageToken: null, currentLabel: 'INBOX', currentEmailId: null
    },

    // Hub State
    hub: { expandedRowId: null, filterType: 'daily', date: new Date().toISOString().split('T')[0], range: { start: 0, end: 0 } },
    
    // UI State
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    placementFilter: 'monthly',
    pendingDelete: { type: null },
    
    // Filters
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' }, 
    empFilters: { text: '' },
    
    metadata: { recruiters: [], techs: [] }
};

// Chart Instances
let recChartInstance = null;
let techChartInstance = null;

// Debounce Utility for Auto-Save
let debounceTimer;
function debounce(func, delay) {
    return (...args) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

/* ==========================================================================
   3. INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    console.log("System Initializing...");
    setupUIListeners();
    setupFilterListeners();
    loadGoogleScripts(); 
    renderLabels(); 
    setupProfileAutoSave(); 
    
    auth.onAuthStateChanged(user => {
        if (user) {
            state.user = user;
            const known = ALLOWED_USERS[user.email.toLowerCase()];
            state.userRole = known ? known.role : 'Viewer'; 
            state.currentUserName = known ? known.name : (user.displayName || 'Staff Member');
            
            updateUserProfile(user, known);
            switchScreen('app');
            initRealtimeListeners();
            startAutoLogoutTimer();
            checkGmailAuth(); 
            
            // Load Profile Data
            loadCurrentUserProfile(user.email);
        } else {
            switchScreen('auth');
            stopAutoLogoutTimer();
        }
    });

    // Theme Init
    if (localStorage.getItem('np_theme') === 'light') {
        document.body.classList.add('light-mode');
        const cb = document.getElementById('setting-theme-toggle');
        if(cb) cb.checked = false;
    }
    
    // Month Picker Init
    const mp = document.getElementById('placement-month-picker');
    if(mp) mp.value = new Date().toISOString().slice(0, 7);
});

/* ==========================================================================
   4. NAVIGATION & UI INTERACTION
   ========================================================================== */
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id === 'app' ? 'dashboard-screen' : id + '-screen');
    if(target) target.classList.add('active');
}

function setupUIListeners() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(btn.onclick && btn.onclick.toString().includes('toggle')) return;
            if(btn.classList.contains('sidebarOption')) return;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            const clicked = e.target.closest('.nav-item');
            clicked.classList.add('active');
            
            document.querySelector('.sidebar').classList.remove('mobile-open');
            const overlay = document.getElementById('sidebar-overlay');
            if(overlay) overlay.classList.remove('active');

            document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
            const targetId = clicked.getAttribute('data-target');
            
            if (targetId) {
                const targetView = document.getElementById(targetId);
                if (targetView) {
                    targetView.classList.add('active');
                    if (targetId === 'view-dashboard') updateDashboardStats();
                    if (targetId === 'view-inbox') {
                        if(state.gmail.gapiInited && gapi.client.getToken()) {
                            if(document.getElementById('gmail-rows-container').children.length === 0) renderGmailList();
                        }
                    }
                }
            }
        });
    });

    const mobileBtn = document.getElementById('btn-mobile-menu');
    if(mobileBtn) {
        mobileBtn.onclick = () => {
            document.querySelector('.sidebar').classList.toggle('mobile-open');
            document.getElementById('sidebar-overlay').classList.toggle('active');
        };
    }
    const overlay = document.getElementById('sidebar-overlay');
    if(overlay) {
        overlay.onclick = () => {
            document.querySelector('.sidebar').classList.remove('mobile-open');
            document.getElementById('sidebar-overlay').classList.remove('active');
        };
    }
    
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
        themeToggle.onclick = () => {
            document.body.classList.toggle('light-mode');
            localStorage.setItem('np_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
        };
    }

    // Logout Functionality
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            if (confirm("Are you sure you want to logout?")) {
                firebase.auth().signOut().then(() => showToast("Logged out"));
            }
        };
    }
}

function setupFilterListeners() {
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.filters.text = e.target.value.toLowerCase();
        renderCandidateTable();
    });
    document.getElementById('filter-recruiter').addEventListener('change', (e) => {
        state.filters.recruiter = e.target.value;
        renderCandidateTable();
    });
    document.getElementById('filter-tech').addEventListener('change', (e) => {
        state.filters.tech = e.target.value;
        renderCandidateTable();
    });

    const toggles = document.querySelectorAll('.btn-toggle');
    toggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toggles.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.getAttribute('data-status');
            renderCandidateTable();
        });
    });

    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        state.filters = { text: '', recruiter: '', tech: '', status: '' };
        document.getElementById('search-input').value = '';
        document.getElementById('filter-recruiter').value = '';
        document.getElementById('filter-tech').value = '';
        toggles.forEach(b => b.classList.remove('active'));
        toggles[0].classList.add('active'); 
        renderCandidateTable();
        showToast("Filters reset");
    });

    document.getElementById('hub-search-input').addEventListener('input', (e) => {
        state.hubFilters.text = e.target.value.toLowerCase();
        renderHubTable();
    });
    document.getElementById('emp-search-input').addEventListener('input', (e) => {
        state.empFilters.text = e.target.value.toLowerCase();
        renderEmployeeTable();
    });
    document.getElementById('onb-search-input').addEventListener('input', (e) => {
        state.onbFilters.text = e.target.value.toLowerCase();
        renderOnboardingTable();
    });

    const gSearch = document.getElementById('gmail-search-input');
    if(gSearch) {
        gSearch.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                renderGmailList(state.gmail.currentLabel); 
            }
        });
    }
}

/* ==========================================================================
   5. LABEL MANAGEMENT
   ========================================================================== */
window.fetchGmailLabels = async () => {
    if (!gapi.client.getToken()) return;
    try {
        const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
        const allLabels = response.result.labels;
        const userLabels = allLabels.filter(l => l.type === 'user');
        const fetchedLabels = userLabels.map(l => ({
            name: l.name,
            id: l.id,
            color: (l.color && l.color.backgroundColor) ? l.color.backgroundColor : '#607d8b',
            type: 'api' 
        }));
        if (fetchedLabels.length > 0) { state.labels = fetchedLabels; } 
        else { state.labels = [...DEFAULT_LABELS]; }
        renderLabels();
    } catch (e) { console.error("Error fetching labels:", e); }
};

window.renderLabels = () => {
    const container = document.getElementById('dynamic-labels-container');
    if(!container) return;
    container.innerHTML = "";
    if(document.getElementById('manage-indicator')) document.getElementById('manage-indicator').style.display = 'none';

    state.labels.forEach((l, index) => {
        const div = document.createElement('div');
        div.className = 'label-item';
        const isSub = l.name.includes('/');
        const displayName = isSub ? l.name.split('/').pop() : l.name;
        const indent = isSub ? 'padding-left: 20px;' : '';

        div.innerHTML = `
            <div class="label-left" style="${indent}" onclick="renderGmailList('${l.id || l.name}')">
                <span class="material-icons" style="color: ${l.color}; font-size:16px;">label</span>
                <span id="label-text-${index}" class="label-text" title="${l.name}">${displayName}</span>
            </div>
            <div class="label-more-btn" id="btn-more-${index}" onclick="event.stopPropagation(); toggleLabelMenu(${index})">
                <span class="material-icons" style="font-size: 16px;">more_horiz</span>
            </div>
            <div id="label-menu-${index}" class="label-dropdown" onclick="event.stopPropagation()">
                <div style="font-size: 10px; color: grey; padding-left: 8px;">LABEL COLOR</div>
                <div class="label-color-grid">
                    <div class="color-swatch" style="background:#e91e63" onclick="updateLabelColor(${index}, '#e91e63')"></div>
                    <div class="color-swatch" style="background:#9c27b0" onclick="updateLabelColor(${index}, '#9c27b0')"></div>
                    <div class="color-swatch" style="background:#2196f3" onclick="updateLabelColor(${index}, '#2196f3')"></div>
                    <div class="color-swatch" style="background:#00bcd4" onclick="updateLabelColor(${index}, '#00bcd4')"></div>
                    <div class="color-swatch" style="background:#4caf50" onclick="updateLabelColor(${index}, '#4caf50')"></div>
                    <div class="color-swatch" style="background:#ff9800" onclick="updateLabelColor(${index}, '#ff9800')"></div>
                    <div class="color-swatch" style="background:#f44336" onclick="updateLabelColor(${index}, '#f44336')"></div>
                    <div class="color-swatch" style="background:#607d8b" onclick="updateLabelColor(${index}, '#607d8b')"></div>
                    <label class="color-swatch custom-add" title="Custom Color">
                        <input type="color" style="opacity:0; width:100%; height:100%; cursor:pointer;" onchange="updateLabelColor(${index}, this.value)">
                        <i class="fa-solid fa-plus"></i>
                    </label>
                </div>
                <div class="label-menu-item" onclick="triggerLabelEdit(${index})"><i class="fa-solid fa-pen"></i> Edit Name</div>
                <div class="label-menu-item" onclick="triggerSubLabel(${index})"><i class="fa-solid fa-code-branch"></i> Add Sub-label</div>
                <div class="label-menu-item danger" onclick="deleteLabel(${index})"><i class="fa-solid fa-trash"></i> Remove Label</div>
            </div>
        `;
        container.appendChild(div);
    });
};

window.toggleLabelMenu = (index) => {
    document.querySelectorAll('.label-dropdown').forEach(el => el.classList.remove('show'));
    document.querySelectorAll('.label-more-btn').forEach(el => el.classList.remove('active'));
    const menu = document.getElementById(`label-menu-${index}`);
    const btn = document.getElementById(`btn-more-${index}`);
    if(menu) { menu.classList.toggle('show'); if(menu.classList.contains('show')) btn.classList.add('active'); }
    const closeFn = (e) => { if(!e.target.closest('.label-item')) { if(menu) menu.classList.remove('show'); if(btn) btn.classList.remove('active'); document.removeEventListener('click', closeFn); } };
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
    const save = () => { const newName = input.value.trim(); if(newName && newName !== currentName) { state.labels[index].name = newName; showToast("Label renamed"); } renderLabels(); };
    input.addEventListener('keydown', (e) => { if(e.key === 'Enter') save(); });
    input.addEventListener('blur', save);
    input.onclick = (e) => e.stopPropagation();
};
window.triggerSubLabel = (index) => { const parentName = state.labels[index].name; const subName = prompt(`Create sub-label under "${parentName}":`); if(subName && subName.trim()) { const fullName = `${parentName}/${subName.trim()}`; if (state.labels.some(l => l.name.toLowerCase() === fullName.toLowerCase())) { alert("Label exists!"); return; } state.labels.push({ name: fullName, color: state.labels[index].color }); state.labels.sort((a, b) => a.name.localeCompare(b.name)); renderLabels(); document.getElementById(`label-menu-${index}`).classList.remove('show'); } };
window.deleteLabel = (index) => { const label = state.labels[index]; if(confirm(`Delete "${label.name}"?`)) { state.labels = state.labels.filter(l => !l.name.startsWith(label.name)); renderLabels(); } };
window.openCreateLabelModal = () => { document.getElementById('create-label-modal').style.display = 'flex'; document.getElementById('new-label-name').focus(); };
window.closeCreateLabelModal = () => { document.getElementById('create-label-modal').style.display = 'none'; };
window.createLabel = () => { const name = document.getElementById('new-label-name').value.trim(); if (!name) return; state.labels.push({ name: name, color: state.selectedLabelColor }); renderLabels(); closeCreateLabelModal(); };
window.selectColor = (element, color) => { state.selectedLabelColor = color; document.querySelectorAll('.color-circle').forEach(el => el.classList.remove('selected')); element.classList.add('selected'); };

/* ==========================================================================
   6. GMAIL INTEGRATION
   ========================================================================== */
function loadGoogleScripts() {
    const s1 = document.createElement('script'); s1.src = "https://apis.google.com/js/api.js"; 
    s1.onload = () => gapi.load('client', async () => { try { await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] }); state.gmail.gapiInited = true; checkGmailAuth(); } catch(e) { console.error(e); } });
    document.body.appendChild(s1);
    const s2 = document.createElement('script'); s2.src = "https://accounts.google.com/gsi/client";
    s2.onload = () => { state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: G_CLIENT_ID, scope: G_SCOPES, callback: (resp) => { if(resp.error) return; updateGmailUI(true); renderGmailList('INBOX'); fetchGmailLabels(); } }); state.gmail.gisInited = true; checkGmailAuth(); };
    document.body.appendChild(s2);
}
function checkGmailAuth() { if (state.gmail.gapiInited && state.gmail.gisInited && gapi.client.getToken()) { updateGmailUI(true); fetchGmailLabels(); } }
function updateGmailUI(isSignedIn) { const btnAuth = document.getElementById('btn-gmail-auth'); const btnSignout = document.getElementById('btn-gmail-signout'); if(btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'inline-flex'; if(btnSignout) btnSignout.style.display = isSignedIn ? 'inline-flex' : 'none'; }
if(document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => state.gmail.tokenClient.requestAccessToken({prompt: ''});
if(document.getElementById('btn-gmail-signout')) document.getElementById('btn-gmail-signout').onclick = () => { const t = gapi.client.getToken(); if(t) google.accounts.oauth2.revoke(t.access_token); gapi.client.setToken(''); updateGmailUI(false); document.getElementById('gmail-rows-container').innerHTML = ''; };

window.renderGmailList = async (label = 'Inbox', navElement = null) => {
    const labelMap = { 
        'Inbox': 'INBOX', 'Sent': 'SENT', 'Drafts': 'DRAFT', 'Trash': 'TRASH', 'Spam': 'SPAM', 
        'Starred': 'STARRED', 'Important': 'IMPORTANT', 
        'Social': 'CATEGORY_SOCIAL', 'Updates': 'CATEGORY_UPDATES', 'Promotions': 'CATEGORY_PROMOTIONS' 
    };
    const apiLabelId = labelMap[label] || label;
    state.gmail.currentLabel = apiLabelId;
    document.getElementById('gmail-list-view').style.display = 'flex';
    document.getElementById('gmail-detail-view').style.display = 'none';
    const container = document.getElementById('gmail-rows-container');
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">Loading...</div>';
    
    if (!gapi.client.getToken()) { 
        container.innerHTML = ''; 
        if(document.getElementById('gmail-empty')) document.getElementById('gmail-empty').style.display = 'block'; 
        return; 
    }
    document.getElementById('gmail-empty').style.display = 'none';
    
    try {
        let request = { 'userId': 'me', 'maxResults': 20 };
        const qInput = document.getElementById('gmail-search-input');
        if (qInput && qInput.value && document.activeElement === qInput) { 
            request.q = qInput.value; 
        } else { 
            request.labelIds = [apiLabelId]; 
        }
        
        const resp = await gapi.client.gmail.users.messages.list(request);
        const messages = resp.result.messages;
        container.innerHTML = ''; 
        
        if (!messages || messages.length === 0) { 
            container.innerHTML = '<div style="padding:40px; text-align:center; color:#94a3b8;">No emails found.</div>'; 
            return; 
        }
        
        const batch = messages.map(msg => gapi.client.gmail.users.messages.get({ 
            'userId': 'me', 'id': msg.id, 'format': 'metadata', 'metadataHeaders': ['From', 'Subject', 'Date'] 
        }));
        
        const results = await Promise.all(batch);
        results.forEach(r => {
            const email = r.result;
            const headers = email.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const fromRaw = headers.find(h => h.name === 'From')?.value || 'Unknown';
            const fromName = fromRaw.replace(/[<>]/g, '').split(' ')[0];
            const date = new Date(Number(email.internalDate)).toLocaleDateString();
            const snippet = email.snippet;
            const isUnread = email.labelIds.includes('UNREAD');
            
            const div = document.createElement('div');
            div.className = `gmail-row ${isUnread ? 'unread' : 'read'}`;
            div.onclick = () => openGmailDetail(email.id);
            div.innerHTML = `
                <div onclick="event.stopPropagation()"><input type="checkbox" class="gmail-checkbox"></div>
                <div><span class="material-icons star-icon">star_border</span></div>
                <div class="row-sender">${fromName}</div>
                <div class="row-subject">${subject} <span style="color:var(--text-muted); margin-left:5px; font-weight:normal;"> - ${snippet.substring(0, 40)}...</span></div>
                <div class="email-date">${date}</div>
            `;
            container.appendChild(div);
        });
    } catch (err) { 
        console.error("Gmail Error:", err); 
        container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error loading emails. (Check Console)</div>`; 
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
        let body = "";
        const findBody = (parts) => { 
            if(!parts) return null; 
            let htmlPart = parts.find(p => p.mimeType === 'text/html'); 
            if(htmlPart) return htmlPart.body.data; 
            let textPart = parts.find(p => p.mimeType === 'text/plain'); 
            if(textPart) return textPart.body.data; 
            for(let part of parts) { 
                if(part.parts) { 
                    const res = findBody(part.parts); 
                    if(res) return res; 
                } 
            } 
            return null; 
        }
        body = email.payload.body.data ? email.payload.body.data : findBody(email.payload.parts);
        if(body) { 
            const decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/')); 
            document.getElementById('detail-message').innerHTML = decoded; 
        } else { 
            document.getElementById('detail-message').innerHTML = "<i>[Message body empty]</i>"; 
        }
    } catch (err) { 
        document.getElementById('detail-message').innerText = "Error loading content."; 
    }
};

window.backToGmailList = () => { document.getElementById('gmail-detail-view').style.display = 'none'; document.getElementById('gmail-list-view').style.display = 'flex'; };
window.refreshEmails = () => renderGmailList(state.gmail.currentLabel);
window.handleGmailSearch = (q) => { };
window.syncCurrentEmailToCandidate = async () => { if(!state.gmail.currentEmailId) return; const senderText = document.getElementById('detail-sender').innerText; const subject = document.getElementById('detail-subject').innerText; const candidateName = prompt("Enter Candidate FIRST NAME to sync this email to:", ""); if(!candidateName) return; const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase()); if(!candidate) return showToast("Candidate not found."); let logs = candidate.submissionLog || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: subject, type: 'Imported Email', tech: candidate.tech || 'General', recruiter: state.currentUserName, note: `Imported from: ${senderText}`, timestamp: Date.now() }); await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs }); showToast(`Synced to ${candidate.first} ${candidate.last}`); };
window.toggleCategories = () => { const sub = document.getElementById('categories-submenu'); if (sub.style.display === 'none') sub.style.display = 'block'; else sub.style.display = 'none'; };
window.toggleMore = () => { const sub = document.getElementById('more-submenu'); if (sub.style.display === 'none') sub.style.display = 'block'; else sub.style.display = 'none'; };

function createMimeMessage(to, subject, body) { const email = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", body].join("\n"); return btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
window.openComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'flex'; };
window.closeComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'none'; };
window.sendCrmEmail = async () => { const to = document.getElementById('compose-to').value.trim(); const subject = document.getElementById('compose-subject').value; const body = document.getElementById('compose-message').value; if(!to || !subject) return showToast("Recipient and Subject required"); const sendBtn = document.querySelector('.compose-footer .btn-primary'); const originalText = sendBtn.innerHTML; sendBtn.innerHTML = 'Sending...'; sendBtn.disabled = true; try { if (!state.gmail.gapiInited || !gapi.client.getToken()) throw new Error("Gmail not connected."); const raw = createMimeMessage(to, subject, body.replace(/\n/g, '<br>')); await gapi.client.gmail.users.messages.send({ 'userId': 'me', 'resource': { 'raw': raw } }); showToast("Email Sent!"); closeComposeModal(); const candidate = state.candidates.find(c => (c.gmail && c.gmail.includes(to)) || (c.email && c.email.includes(to))); if(candidate) { let logs = candidate.submissionLog || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: subject, type: 'Outbound Email', tech: candidate.tech||'General', recruiter: state.currentUserName, timestamp: Date.now() }); await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs }); showToast("Logged to Hub"); } document.getElementById('compose-to').value = ''; document.getElementById('compose-subject').value = ''; document.getElementById('compose-message').value = ''; } catch (err) { showToast("Send Failed: " + err.message); } finally { sendBtn.innerHTML = originalText; sendBtn.disabled = false; } };

/* ==========================================================================
   8. REALTIME LISTENERS & DROPDOWNS
   ========================================================================== */
function initRealtimeListeners() {
    db.collection('candidates').orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
        state.candidates = [];
        const techs = new Set();
        snap.forEach(doc => { const d = doc.data(); state.candidates.push({ id: doc.id, ...d }); if (d.tech) techs.add(d.tech); });
        state.metadata.techs = Array.from(techs).sort();
        renderCandidateTable(); renderPlacementTable(); renderDropdowns(); updateHubStats(state.hub.filterType, state.hub.date); updateDashboardStats(); renderDashboardCharts();
    });
    db.collection('employees').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.employees = [];
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        const recruiters = new Set();
        state.employees.forEach(e => { if(e.first) recruiters.add(e.first.trim()); });
        state.metadata.recruiters = Array.from(recruiters).map(r => ({value:r, display:r})).sort((a,b)=>a.value.localeCompare(b.value));
        renderEmployeeTable(); renderDropdowns();
    });
    db.collection('onboarding').orderBy('createdAt', 'desc').onSnapshot(snap => { state.onboarding = []; snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() })); renderOnboardingTable(); });
    loadCustomColumns();
}

function loadCustomColumns() { db.collection('settings').doc('table_config').onSnapshot(doc => { if(doc.exists) { const data = doc.data(); if(data.candidates) state.customColumns.candidates = data.candidates; if(data.employees) state.customColumns.employees = data.employees; if(data.onboarding) state.customColumns.onboarding = data.onboarding; if(data.placements) state.customColumns.placements = data.placements; renderCandidateTable(); renderEmployeeTable(); renderOnboardingTable(); renderPlacementTable(); } }); }
function renderDropdowns() { const ids = ['filter-recruiter', 'filter-tech']; ids.forEach(id => { const el = document.getElementById(id); if(!el) return; const currentVal = el.value; let opts = ""; if(id.includes('tech')) opts = state.metadata.techs.map(t => `<option value="${t}">${t}</option>`).join(''); else opts = state.metadata.recruiters.map(r => `<option value="${r.value}">${r.display}</option>`).join(''); el.innerHTML = `<option value="">${id.includes('tech')?"All Tech":"All Recruiters"}</option>${opts}`; el.value = currentVal; }); }

window.generateRecruiterDropdown = (currentVal, id, collection) => { const list = state.metadata.recruiters || []; const options = list.map(r => `<option value="${r.value}" ${r.value === currentVal ? 'selected' : ''}>${r.display}</option>`).join(''); return `<select class="status-select" style="width:100%; min-width:100px;" onchange="updateRecruiter('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Recruiter</option>${options}</select>`; };
window.updateRecruiter = (id, collection, val) => { db.collection(collection).doc(id).update({ recruiter: val }).then(() => showToast("Recruiter Saved")); };
window.generateTechDropdown = (currentVal, id, collection) => { const list = state.metadata.techs || []; if(currentVal && !list.includes(currentVal)) list.push(currentVal); list.sort(); const options = list.map(t => `<option value="${t}" ${t === currentVal ? 'selected' : ''}>${t}</option>`).join(''); return `<select class="status-select" style="width:100%; min-width:100px; color:var(--primary); font-weight:bold;" onchange="updateTech('${id}', '${collection}', this.value)" onclick="event.stopPropagation()"><option value="" ${!currentVal ? 'selected' : ''}>Select Tech</option>${options}</select>`; };
window.updateTech = (id, collection, val) => { db.collection(collection).doc(id).update({ tech: val }).then(() => showToast("Tech Saved")); };

function getFilteredData(data, filters) { let subset = data; if (state.userRole === 'Employee' && state.currentUserName) { subset = subset.filter(item => item.recruiter === state.currentUserName); } return subset.filter(item => { const matchesText = (item.first + ' ' + item.last + ' ' + (item.tech||'')).toLowerCase().includes(filters.text); const matchesRec = filters.recruiter ? item.recruiter === filters.recruiter : true; const matchesTech = filters.tech ? item.tech === filters.tech : true; const matchesStatus = filters.status ? item.status === filters.status : true; return matchesText && matchesRec && matchesTech && matchesStatus; }); }

function renderDashboardCharts() { const recCounts = {}; const techCounts = {}; state.candidates.forEach(c => { const r = c.recruiter || 'Unknown'; recCounts[r] = (recCounts[r] || 0) + 1; const t = c.tech || 'Other'; techCounts[t] = (techCounts[t] || 0) + 1; }); const recLabels = Object.keys(recCounts); const recData = Object.values(recCounts); const techLabels = Object.keys(techCounts); const techData = Object.values(techCounts); const ctxRec = document.getElementById('chart-recruiter'); if (ctxRec) { if (recChartInstance) recChartInstance.destroy(); recChartInstance = new Chart(ctxRec, { type: 'bar', data: { labels: recLabels, datasets: [{ label: 'Candidates', data: recData, backgroundColor: 'rgba(6, 182, 212, 0.6)', borderColor: '#06b6d4', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } } } }); } const ctxTech = document.getElementById('chart-tech'); if (ctxTech) { if (techChartInstance) techChartInstance.destroy(); techChartInstance = new Chart(ctxTech, { type: 'doughnut', data: { labels: techLabels, datasets: [{ data: techData, backgroundColor: ['rgba(6,182,212,0.7)', 'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)', 'rgba(34,197,94,0.7)', 'rgba(239,68,68,0.7)'], borderWidth: 2 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } }); } }
function updateDashboardStats() { const data = state.candidates; document.getElementById('stat-total').innerText = data.length; const activeCount = data.filter(c => c.status === 'Active').length; const inactiveCount = data.filter(c => c.status === 'Inactive').length; document.getElementById('stat-active').innerText = activeCount; document.getElementById('stat-inactive').innerText = inactiveCount; document.getElementById('stat-placed').innerText = data.filter(c => c.status === 'Placed').length; const t = new Set(data.map(c => c.tech).filter(Boolean)); document.getElementById('stat-tech').innerText = t.size; const r = new Set(data.map(c => c.recruiter).filter(Boolean)); document.getElementById('stat-rec').innerText = r.size; }

/* ========================================================
   10. ALIGNMENT & TABLE RENDERERS
   ======================================================== */
if(!state.alignments) state.alignments = { candidates: {}, employees: {}, onboarding: {}, placements: {}, hub: {} };
window.cycleAlign = (context, index) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context][index] || 'left'; const next = modes[(modes.indexOf(current) + 1) % 3]; state.alignments[context][index] = next; refreshView(context); };
window.cycleAlignAll = (context) => { const modes = ['left', 'center', 'right']; const current = state.alignments[context]['global'] || 'left'; const next = modes[(modes.indexOf(current) + 1) % 3]; state.alignments[context]['global'] = next; for(let i=3; i<50; i++) { state.alignments[context][i] = next; } refreshView(context); showToast(`All columns aligned ${next}`); };
function refreshView(context) { if(context==='candidates') renderCandidateTable(); else if(context==='employees') renderEmployeeTable(); else if(context==='onboarding') renderOnboardingTable(); else if(context==='placements') renderPlacementTable(); else if(context==='hub') renderHubTable(); }
function applyAlignStyles(context, tableId) { const config = state.alignments[context] || {}; const rules = Object.keys(config).map(idx => { if(idx === 'global') return ''; const val = config[idx]; if(!val || val === 'left') return ''; return `#${tableId} th:nth-child(${idx}), #${tableId} td:nth-child(${idx}) { text-align: ${val} !important; }`; }).join('\n'); let style = document.getElementById(`align-style-${context}`); if(!style) { style = document.createElement('style'); style.id = `align-style-${context}`; document.head.appendChild(style); } style.innerHTML = rules; }
function thAlign(title, context, idx) { const dir = state.alignments[context][idx] || 'left'; const icon = dir === 'left' ? 'fa-align-left' : (dir === 'center' ? 'fa-align-center' : 'fa-align-right'); const style = dir !== 'left' ? 'color:var(--primary); opacity:1;' : ''; return `<div style="display:flex; align-items:center; justify-content:space-between; width:100%;"><span>${title}</span><i class="fa-solid ${icon} align-icon" style="${style}" onclick="event.stopPropagation(); cycleAlign('${context}', ${idx})"></i></div>`; }

function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    const isAllChecked = filtered.length > 0 && filtered.every(c => state.selection.cand.has(c.id));
    let colIdx = 17; 
    const customHeaders = (state.customColumns.candidates || []).map(col => `<th>${thAlign(col.name, 'candidates', colIdx++)}</th>`).join('');
    thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('candidates')" title="Align All Columns"></i></div></th><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'candidates', 3)}</th><th>${thAlign('First Name', 'candidates', 4)}</th><th>${thAlign('Last Name', 'candidates', 5)}</th><th>${thAlign('Mobile', 'candidates', 6)}</th><th>${thAlign('WhatsApp', 'candidates', 7)}</th><th>${thAlign('Tech', 'candidates', 8)}</th><th>${thAlign('Recruiter', 'candidates', 9)}</th><th style="width: 140px;">${thAlign('Status', 'candidates', 10)}</th><th>${thAlign('Assigned', 'candidates', 11)}</th><th>${thAlign('Gmail', 'candidates', 12)}</th><th>${thAlign('LinkedIn', 'candidates', 13)}</th><th>${thAlign('Resume', 'candidates', 14)}</th><th>${thAlign('Track', 'candidates', 15)}</th><th>${thAlign('Comments', 'candidates', 16)}</th>${customHeaders}</tr>`;
    document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} records`;
    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusClass = c.status === 'Active' ? 'active' : 'inactive';
        const statusLabel = c.status || 'Inactive';
        const customCells = (state.customColumns.candidates || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'candidates', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td onclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || '-'}</td>`; }).join('');
        const gmailIcon = c.gmail ? `<a href="${c.gmail}" target="_blank"><i class="fa-brands fa-google icon-gmail link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'gmail', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const linkedinIcon = c.linkedin ? `<a href="${c.linkedin}" target="_blank"><i class="fa-brands fa-linkedin icon-linkedin link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'linkedin', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const resumeIcon = c.resume ? `<a href="${c.resume}" target="_blank"><i class="fa-solid fa-file-lines icon-resume link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'resume', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const trackIcon = c.track ? `<a href="${c.track}" target="_blank"><i class="fa-solid fa-location-crosshairs icon-track link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'track', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        return `<tr class="${rowClass}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td><td>${i+1}</td><td id="fname-${c.id}" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td><td onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td><td onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td><td onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td><td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td><td style="overflow:visible;"><div class="action-dropdown-container"><div class="status-badge ${statusClass}" onclick="toggleRowMenu('${c.id}')">${statusLabel} <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i></div><div id="menu-${c.id}" class="custom-dropdown-menu"><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Active')"><span class="dot-green"></span> Set Active</div><div class="dropdown-option" onclick="updateStatusAndClose('${c.id}', 'Inactive')"><span class="dot-red"></span> Set Inactive</div><div class="dropdown-option" onclick="editCustomStatus('${c.id}')"><i class="fa-solid fa-pen"></i> Edit</div></div></div></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td><td style="text-align:center;">${gmailIcon}</td><td style="text-align:center;">${linkedinIcon}</td><td style="text-align:center;">${resumeIcon}</td><td style="text-align:center;">${trackIcon}</td><td onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||'-'}</td>${customCells}</tr>`;
    }).join('');
    applyAlignStyles('candidates', 'candidates-table');
}

function renderEmployeeTable() {
    let filtered = state.employees; if (state.userRole === 'Employee') filtered = filtered.filter(e => e.officialEmail === state.user.email); filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));
    const isAllChecked = filtered.length > 0 && filtered.every(e => state.selection.emp.has(e.id));
    let colIdx = 12; const customHeaders = (state.customColumns.employees || []).map(col => `<th>${thAlign(col.name, 'employees', colIdx++)}</th>`).join('');
    document.getElementById('employee-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('employees')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('employees')"></i></div></th><th><input type="checkbox" id="select-all-emp" onclick="toggleSelectAll('emp', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'employees', 3)}</th><th>${thAlign('First Name', 'employees', 4)}</th><th>${thAlign('Last Name', 'employees', 5)}</th><th>${thAlign('Date of Birth', 'employees', 6)}</th><th>${thAlign('Designation', 'employees', 7)}</th><th>${thAlign('Work Mobile', 'employees', 8)}</th><th>${thAlign('Personal Mobile', 'employees', 9)}</th><th>${thAlign('Official Email', 'employees', 10)}</th><th>${thAlign('Personal Email', 'employees', 11)}</th>${customHeaders}</tr>`;
    document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} records`;
    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.emp.has(c.id) ? 'checked' : ''; const customCells = (state.customColumns.employees || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'employees', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'employees', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td onclick="inlineEdit('${c.id}', '${col.key}', 'employees', this)">${val || '-'}</td>`; }).join(''); return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td><td>${i+1}</td><td onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td><td onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td><td onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||'-'}</td><td onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||'-'}</td><td onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||'-'}</td><td onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||'-'}</td><td onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||'-'}</td>${customCells}</tr>`; }).join('');
    applyAlignStyles('employees', 'employee-table');
}

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const isAllChecked = filtered.length > 0 && filtered.every(o => state.selection.onb.has(o.id));
    let colIdx = 12; const customHeaders = (state.customColumns.onboarding || []).map(col => `<th>${thAlign(col.name, 'onboarding', colIdx++)}</th>`).join('');
    document.getElementById('onboarding-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('onboarding')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('onboarding')"></i></div></th><th><input type="checkbox" id="select-all-onb" onclick="toggleSelectAll('onb', this)" ${isAllChecked ? 'checked' : ''}></th><th>${thAlign('#', 'onboarding', 3)}</th><th>${thAlign('First Name', 'onboarding', 4)}</th><th>${thAlign('Last Name', 'onboarding', 5)}</th><th>${thAlign('Date of Birth', 'onboarding', 6)}</th><th>${thAlign('Recruiter', 'onboarding', 7)}</th><th>${thAlign('Mobile', 'onboarding', 8)}</th><th>${thAlign('Status', 'onboarding', 9)}</th><th>${thAlign('Assigned', 'onboarding', 10)}</th><th>${thAlign('Comments', 'onboarding', 11)}</th>${customHeaders}</tr>`;
    document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} records`;
    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => { const isSel = state.selection.onb.has(c.id) ? 'checked' : ''; const customCells = (state.customColumns.onboarding || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'onboarding', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'onboarding', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td onclick="inlineEdit('${c.id}', '${col.key}', 'onboarding', this)">${val || '-'}</td>`; }).join(''); return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td><td>${i+1}</td><td onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td><td onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td><td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'onboarding')}</td><td onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td><td><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)"><option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option><option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option></select></td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td><td onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||'-'}</td>${customCells}</tr>`; }).join('');
    applyAlignStyles('onboarding', 'onboarding-table');
}

function renderPlacementTable() {
    const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value;
    let placed = state.candidates.filter(c => c.status === 'Placed'); placed = placed.filter(c => { if(!c.assigned) return false; return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal); });
    if(!state.selection.place) state.selection.place = new Set();
    const isAllChecked = placed.length > 0 && placed.every(p => state.selection.place.has(p.id));
    const thead = document.querySelector('#placement-table thead'); let colIdx = 11;
    const customHeaders = (state.customColumns.placements || []).map(col => `<th>${thAlign(col.name, 'placements', colIdx++)}</th>`).join('');
    if(thead) thead.innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('placements')" title="Add New Column"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('placements')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:60px;">${thAlign('#', 'placements', 3)}</th><th>${thAlign('First Name', 'placements', 4)}</th><th>${thAlign('Last Name', 'placements', 5)}</th><th>${thAlign('Tech', 'placements', 6)}</th><th>${thAlign('Location', 'placements', 7)}</th><th>${thAlign('Contract', 'placements', 8)}</th><th>${thAlign('Assigned', 'placements', 9)}</th><th>${thAlign('Actions', 'placements', 10)}</th>${customHeaders}</tr>`;
    document.getElementById('placement-footer-count').innerText = `Showing ${placed.length} records`;
    document.getElementById('placement-table-body').innerHTML = placed.map((c, i) => { const isSel = state.selection.place.has(c.id) ? 'checked' : ''; const rowClass = state.selection.place.has(c.id) ? 'selected-row' : ''; const customCells = (state.customColumns.placements || []).map(col => { const val = c[col.key] || ''; if(col.type === 'date') return `<td><input type="date" class="date-input-modern" value="${val}" onchange="inlineDateEdit('${c.id}', '${col.key}', 'candidates', this.value)"></td>`; if(col.type === 'url') return `<td style="text-align:center;" onclick="inlineUrlEdit('${c.id}', '${col.key}', 'candidates', this)">${val ? `<a href="${val}" target="_blank"><i class="fa-solid fa-link text-cyan"></i></a>` : `<i class="fa-solid fa-plus icon-empty"></i>`}</td>`; return `<td onclick="inlineEdit('${c.id}', '${col.key}', 'candidates', this)">${val || '-'}</td>`; }).join(''); return `<tr class="${rowClass}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)"><td class="drag-handle-cell"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td><td>${i+1}</td><td style="font-weight:600; color:var(--text-main);">${c.first}</td><td style="font-weight:600; color:var(--text-main);">${c.last}</td><td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)" class="text-cyan">${c.tech}</td><td onclick="inlineEdit('${c.id}', 'location', 'candidates', this)">${c.location||'Add'}</td><td onclick="inlineEdit('${c.id}', 'contract', 'candidates', this)">${c.contract||'Add'}</td><td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td><td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>${customCells}</tr>`; }).join('');
    applyAlignStyles('placements', 'placement-table');
}

function renderHubTable() {
    let data = state.candidates;
    if(state.userRole === 'Employee' && state.currentUserName) data = data.filter(c => c.recruiter === state.currentUserName);
    if(state.hubFilters && state.hubFilters.text) data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));
    const { start, end } = state.hub.range;
    const isInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= start && t <= end; };
    const activeCandidates = data.filter(c => (c.submissionLog || []).some(isInRange) || (c.screeningLog || []).some(isInRange) || (c.interviewLog || []).some(isInRange));
    if(!state.selection.hub) state.selection.hub = new Set();
    const isAllChecked = activeCandidates.length > 0 && activeCandidates.every(c => state.selection.hub.has(c.id));
    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px; text-align:center;"><div style="display:flex; flex-direction:column; gap:5px; align-items:center;"><i class="fa-solid fa-table-columns hover-primary" style="cursor:pointer;" onclick="openAddColumnModal('candidates')" title="Add New Column (to Candidates)"></i><i class="fa-solid fa-arrows-left-right-to-line hover-primary" style="cursor:pointer; font-size:0.8rem;" onclick="cycleAlignAll('hub')"></i></div></th><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)" ${isAllChecked ? 'checked' : ''}></th><th style="width:60px;">${thAlign('#', 'hub', 3)}</th><th style="width:150px;">${thAlign('Candidate Name', 'hub', 4)}</th><th style="width:150px;">${thAlign('Recruiter', 'hub', 5)}</th><th style="width:120px;">${thAlign('Technology', 'hub', 6)}</th><th style="text-align:center;">${thAlign('Submission', 'hub', 7)}</th><th style="text-align:center;">${thAlign('Screenings', 'hub', 8)}</th><th style="text-align:center;">${thAlign('Interview', 'hub', 9)}</th><th style="text-align:right;">${thAlign('Date', 'hub', 10)}</th></tr>`;
    document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    const tbody = document.getElementById('hub-table-body');
    if (activeCandidates.length === 0) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`; return; }
    tbody.innerHTML = activeCandidates.map((c, i) => {
        const sub = (c.submissionLog||[]).filter(isInRange).length;
        const scr = (c.screeningLog||[]).filter(isInRange).length;
        const int = (c.interviewLog||[]).filter(isInRange).length;
        let displayDate = '-';
        const logsInRange = [...(c.submissionLog||[]).filter(isInRange), ...(c.screeningLog||[]).filter(isInRange), ...(c.interviewLog||[]).filter(isInRange)];
        if (logsInRange.length > 0) { logsInRange.sort((a,b) => new Date(b.date || b) - new Date(a.date || a)); const latest = logsInRange[0]; displayDate = (typeof latest === 'string') ? latest : (latest.date || '-'); }
        const isSel = state.selection.hub.has(c.id) ? 'checked' : '';
        const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';
        const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';
        let html = `<tr style="cursor:pointer; ${activeStyle}" class="${state.selection.hub.has(c.id) ? 'selected-row' : ''}" draggable="true" ondragstart="handleDragStart(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event)"><td class="drag-handle-cell" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical drag-handle-icon"></i></td><td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td><td style="opacity:0.7;" onclick="toggleHubRow('${c.id}')">${caret}</td><td style="font-weight:600; color:var(--text-main);" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first} ${c.last}</td><td>${generateRecruiterDropdown(c.recruiter, c.id, 'candidates')}</td><td>${generateTechDropdown(c.tech, c.id, 'candidates')}</td><td class="text-cyan" style="font-weight:bold; font-size:1.1rem; text-align:center;" onclick="toggleHubRow('${c.id}')">${sub}</td><td class="text-gold" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${scr}</td><td class="text-purple" style="font-weight:bold; text-align:center;" onclick="toggleHubRow('${c.id}')">${int}</td><td style="font-size:0.8rem; color:var(--text-muted); text-align:right;" onclick="toggleHubRow('${c.id}')">${displayDate}</td></tr>`;
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
    applyAlignStyles('hub', 'hub-table');
}

/* ========================================================
   12. DATA MANIPULATION & DELETE (Robust)
   ======================================================== */
window.toggleSelect = (id, type) => { if(!state.selection[type]) state.selection[type] = new Set(); if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id); updateSelectButtons(type); refreshViewForType(type); };
window.toggleSelectAll = (type, box) => {
    let data = [];
    if(type==='cand') data = getFilteredData(state.candidates, state.filters);
    else if(type==='emp') data = state.employees;
    else if(type==='onb') data = state.onboarding;
    else if(type==='hub') { const { start, end } = state.hub.range; const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; }; data = state.candidates.filter(c => [...(c.submissionLog||[]), ...(c.screeningLog||[]), ...(c.interviewLog||[])].some(isInRange)); }
    else if(type==='place') { const mVal = document.getElementById('placement-month-picker').value; const yVal = document.getElementById('placement-year-picker').value; data = state.candidates.filter(c => c.status === 'Placed' && c.assigned && (state.placementFilter === 'monthly' ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal))); }
    if(!state.selection[type]) state.selection[type] = new Set();
    if(box.checked) data.forEach(i=>state.selection[type].add(i.id)); else state.selection[type].clear();
    updateSelectButtons(type); refreshViewForType(type);
};
function refreshViewForType(type) { if(type==='cand') renderCandidateTable(); else if(type==='emp') renderEmployeeTable(); else if(type==='onb') renderOnboardingTable(); else if(type==='hub') renderHubTable(); else if(type==='place') renderPlacementTable(); }
function updateSelectButtons(type) { let btn, countSpan; if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); } else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); } else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); } else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); } else if(type === 'hub') { btn = document.getElementById('btn-delete-hub'); countSpan = document.getElementById('hub-selected-count'); } if (!btn) return; if (state.selection[type] && state.selection[type].size > 0 && state.userRole !== 'Employee') { btn.style.display = 'inline-flex'; btn.style.opacity = '1'; if(countSpan) countSpan.innerText = state.selection[type].size; } else { btn.style.display = 'none'; if(countSpan) countSpan.innerText = '0'; } }

window.executeDelete = async () => {
    const type = state.pendingDelete.type;
    const confirmBtn = document.getElementById('btn-confirm-delete');
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = "Deleting..."; confirmBtn.disabled = true;
    if(!type) { closeDeleteModal(); return; }
    let col = (type==='cand'||type==='hub'||type==='place') ? 'candidates' : (type==='emp'?'employees':'onboarding');
    const ids = Array.from(state.selection[type]);
    const batch = db.batch();
    ids.forEach(id => batch.delete(db.collection(col).doc(id)));
    try { await batch.commit(); state.selection[type].clear(); updateSelectButtons(type); const masterBox = document.getElementById(`select-all-${type}`); if(masterBox) masterBox.checked = false; showToast("Items deleted successfully"); } catch(e) { console.error(e); showToast("Delete Failed: " + e.message); } 
    finally { confirmBtn.innerText = originalText; confirmBtn.disabled = false; closeDeleteModal(); refreshViewForType(type); }
};

let dragSrcEl = null;
window.handleDragStart = (e) => { dragSrcEl = e.target; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/html', e.target.innerHTML); e.target.classList.add('dragging'); };
window.handleDragOver = (e) => { if (e.preventDefault) e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return false; };
window.handleDrop = (e) => {
    if (e.stopPropagation) e.stopPropagation();
    const targetRow = e.target.closest('tr');
    if (dragSrcEl !== targetRow && targetRow && dragSrcEl) {
        const sourceHTML = dragSrcEl.innerHTML;
        const targetHTML = targetRow.innerHTML;
        dragSrcEl.innerHTML = targetHTML;
        targetRow.innerHTML = sourceHTML;
        const tbody = targetRow.closest('tbody');
        updateSerialNumbers(tbody);
    }
    if (dragSrcEl) dragSrcEl.classList.remove('dragging');
    return false;
};
window.updateSerialNumbers = (tbody) => { if (!tbody) return; const rows = tbody.querySelectorAll('tr'); rows.forEach((row, index) => { if (row.cells.length > 2) { row.cells[2].innerText = index + 1; } }); };

window.createNewRow = (type) => { const today = new Date().toISOString().split('T')[0]; let data = { first: 'New', last: 'Entry', createdAt: Date.now(), assigned: today, recruiter: '' }; if(type === 'candidates') { data.status = 'Active'; } else if (type === 'employees') { data.designation = 'Employee'; } else if (type === 'onboarding') { data.status = 'Onboarding'; } db.collection(type).add(data).then(() => showToast(`Row Added`)); };
window.manualAddPlacement = () => { const today = new Date().toISOString().split('T')[0]; db.collection('candidates').add({ first: 'New', last: 'Placement', tech: '', status: 'Placed', assigned: today, createdAt: Date.now() }).then(() => showToast("Added Placement")); };

let activeColumnContext = null;
window.openAddColumnModal = (context) => {
    activeColumnContext = context;
    const modal = document.getElementById('add-column-modal'); modal.style.display = 'flex'; document.getElementById('new-col-name').focus();
    let manageSection = document.getElementById('column-manage-section');
    if (!manageSection) { manageSection = document.createElement('div'); manageSection.id = 'column-manage-section'; manageSection.style.marginTop = '20px'; manageSection.style.paddingTop = '15px'; manageSection.style.borderTop = '1px solid var(--glass-border)'; const actions = modal.querySelector('.modal-actions'); modal.querySelector('.glass-panel').insertBefore(manageSection, actions); }
    const currentCols = state.customColumns[context] || [];
    if (currentCols.length > 0) { manageSection.innerHTML = `<h4 style="color:var(--text-muted); font-size:0.8rem; margin-bottom:10px;">MANAGE CUSTOM COLUMNS</h4><div style="max-height:100px; overflow-y:auto; padding-right:5px;">${currentCols.map((col, idx) => `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px; margin-bottom:5px; border-radius:4px;"><span style="font-size:0.85rem; color:var(--text-main);">${col.name}</span><i class="fa-solid fa-trash text-danger" style="cursor:pointer;" onclick="deleteCustomColumn('${context}', ${idx})" title="Delete Column"></i></div>`).join('')}</div>`; manageSection.style.display = 'block'; } else { manageSection.style.display = 'none'; }
};
window.closeColumnModal = () => { document.getElementById('add-column-modal').style.display = 'none'; document.getElementById('new-col-name').value = ''; activeColumnContext = null; };
window.executeAddColumn = async () => {
    const name = document.getElementById('new-col-name').value.trim(); const type = document.getElementById('new-col-type').value; if (!name || !activeColumnContext) return;
    const key = name.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
    if (!state.customColumns[activeColumnContext]) state.customColumns[activeColumnContext] = [];
    state.customColumns[activeColumnContext].push({ name, key, type });
    await saveAndRefreshColumns(activeColumnContext, `Column "${name}" Added`); document.getElementById('new-col-name').value = ''; openAddColumnModal(activeColumnContext);
};
window.deleteCustomColumn = async (context, index) => { if (!confirm("Delete this column?")) return; state.customColumns[context].splice(index, 1); await saveAndRefreshColumns(context, "Column Removed"); openAddColumnModal(context); };
async function saveAndRefreshColumns(context, msg) { try { await db.collection('settings').doc('table_config').set({ [context]: state.customColumns[context] }, { merge: true }); showToast(msg); refreshViewForType(context); } catch(e) { console.error(e); showToast("Error saving configuration"); } }

window.openDeleteModal = (type) => { state.pendingDelete.type = type; document.getElementById('delete-modal').style.display = 'flex'; document.getElementById('del-count').innerText = state.selection[type].size; };
window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
function cleanError(msg) { return msg.replace('Firebase: ', '').replace('Error ', '').replace('(auth/', '').replace(').', '').replace(/-/g, ' ').toUpperCase(); }
window.handleLogin = () => { const e = document.getElementById('login-email').value, p = document.getElementById('login-pass').value; if(!e || !p) return; auth.signInWithEmailAndPassword(e, p).catch(err => alert("Login Failed: " + err.message)); };
window.handleSignup = () => { const n = document.getElementById('reg-name').value, e = document.getElementById('reg-email').value, p = document.getElementById('reg-pass').value; auth.createUserWithEmailAndPassword(e, p).then(cred => { cred.user.updateProfile({displayName: n}); db.collection('users').doc(e).set({firstName: n, email: e, role: 'Employee', createdAt: Date.now()}); cred.user.sendEmailVerification(); showToast("Verification Sent"); switchAuth('login'); }).catch(err => showToast(cleanError(err.message))); };

window.inlineEdit = (id, field, col, el) => { const val = el.innerText; el.innerHTML = `<input type="text" class="inline-input-active" value="${val}" onblur="saveInline(this, '${id}', '${field}', '${col}', '${val}')">`; el.querySelector('input').focus(); };
window.saveInline = (input, id, field, col, oldVal) => { const newVal = input.value; input.parentElement.innerText = newVal; if(newVal !== oldVal) db.collection(col).doc(id).update({[field]: newVal}).then(() => showToast("Saved")).catch(()=>input.parentElement.innerText = oldVal); };
window.updateStatus = (id, col, val) => db.collection(col).doc(id).update({status: val}).then(() => showToast("Status Saved"));
window.inlineDateEdit = (id, field, col, val) => db.collection(col).doc(id).update({[field]: val}).then(() => showToast("Date Saved"));
window.inlineUrlEdit = (id, field, col, el) => { if(el.querySelector('input')) return; el.innerHTML = ''; const input = document.createElement('input'); input.type = 'url'; input.placeholder = 'Paste Link...'; input.className = 'url-input-active'; const save = () => { let newVal = input.value.trim(); if(newVal && !newVal.startsWith('http')) newVal = 'https://' + newVal; db.collection(col).doc(id).update({ [field]: newVal }).then(() => showToast("Link Saved")); }; input.addEventListener('blur', save); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); }); el.appendChild(input); input.focus(); };
window.toggleRowMenu = (id) => { document.querySelectorAll('.custom-dropdown-menu').forEach(el => { if(el.id !== `menu-${id}`) el.classList.remove('show'); }); const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.toggle('show'); document.addEventListener('click', function closeMenu(e) { if (!e.target.closest('.action-dropdown-container')) { if(menu) menu.classList.remove('show'); document.removeEventListener('click', closeMenu); } }); };
window.updateStatusAndClose = (id, status) => { updateStatus(id, 'candidates', status); const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); };
window.editCustomStatus = async (id) => { const currentStatus = state.candidates.find(c => c.id === id)?.status || ""; const newStatus = prompt("Enter new status detail:", currentStatus); if (newStatus && newStatus.trim() !== "") { await db.collection('candidates').doc(id).update({ status: newStatus.trim() }); showToast("Status updated"); } const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); };
window.triggerRowEdit = (id) => { const el = document.getElementById(`fname-${id}`); if(el) el.click(); const menu = document.getElementById(`menu-${id}`); if(menu) menu.classList.remove('show'); };
window.deleteSingleCandidate = async (id) => { if(confirm("Permanently remove this candidate?")) { try { await db.collection('candidates').doc(id).delete(); showToast("Candidate Removed"); } catch(e) { showToast("Error removing candidate"); } } };
window.triggerHubNote = async (candId, logType) => { const note = prompt("Enter note/subject for this activity:"); if(!note) return; const candidate = state.candidates.find(c => c.id === candId); if(!candidate) return; let logs = candidate[logType] || []; logs.push({ date: new Date().toISOString().split('T')[0], subject: note, recruiter: state.currentUserName, timestamp: Date.now(), type: 'Manual Entry' }); await db.collection('candidates').doc(candId).update({ [logType]: logs }); showToast("Activity Logged"); };
window.deleteHubLog = async (candId, logType, index) => { if(!confirm("Remove this log entry?")) return; const candidate = state.candidates.find(c => c.id === candId); let logs = candidate[logType] || []; logs.splice(index, 1); await db.collection('candidates').doc(candId).update({ [logType]: logs }); showToast("Log Removed"); }

function updateUserProfile(user, hardcodedData) {
    const name = hardcodedData ? hardcodedData.name : (user.displayName || 'Staff Member');
    document.getElementById('display-username').innerText = name;
    document.getElementById('prof-name-display').innerText = name;
    document.getElementById('prof-email-display-sidebar').innerText = user.email;
    document.getElementById('prof-office-email').value = user.email;
    if(hardcodedData) document.getElementById('prof-designation').value = hardcodedData.role;
}

window.loadCurrentUserProfile = async (email) => {
    try {
        const snap = await db.collection('employees').where('officialEmail', '==', email).limit(1).get();
        if(!snap.empty) {
            const doc = snap.docs[0];
            state.userProfileId = doc.id;
            const data = doc.data();
            if(document.getElementById('prof-first')) document.getElementById('prof-first').value = data.first || '';
            if(document.getElementById('prof-last')) document.getElementById('prof-last').value = data.last || '';
            if(document.getElementById('prof-dob')) document.getElementById('prof-dob').value = data.dob || '';
            if(document.getElementById('prof-work-mobile')) document.getElementById('prof-work-mobile').value = data.workMobile || '';
            if(document.getElementById('prof-personal-mobile')) document.getElementById('prof-personal-mobile').value = data.personalMobile || '';
            if(document.getElementById('prof-personal-email')) document.getElementById('prof-personal-email').value = data.personalEmail || '';
        } else { console.warn("No employee profile found for email:", email); }
    } catch(e) { console.error("Profile load error", e); }
};

window.setupProfileAutoSave = () => {
    const fields = ['prof-first', 'prof-last', 'prof-dob', 'prof-work-mobile', 'prof-personal-mobile', 'prof-personal-email'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if(!el) return;
        el.addEventListener('input', debounce((e) => { saveProfileField(id, e.target.value); }, 800));
    });
};

window.saveProfileField = (elementId, value) => {
    if(!state.userProfileId) return;
    const map = { 'prof-first': 'first', 'prof-last': 'last', 'prof-dob': 'dob', 'prof-work-mobile': 'workMobile', 'prof-personal-mobile': 'personalMobile', 'prof-personal-email': 'personalEmail' };
    const dbField = map[elementId];
    if(dbField) { db.collection('employees').doc(state.userProfileId).update({ [dbField]: value }).then(() => showToast("Saved")); }
};

window.saveProfileData = () => showToast("All changes saved automatically.");
window.triggerPhotoUpload = () => document.getElementById('profile-upload-input').click();
window.handlePhotoUpload = (input) => { if (input.files && input.files[0]) { const reader = new FileReader(); reader.onload = function(e) { const img = document.getElementById('profile-main-img'); const icon = document.getElementById('profile-main-icon'); img.src = e.target.result; img.style.display = 'block'; icon.style.display = 'none'; document.getElementById('btn-delete-photo').style.display = 'inline-block'; showToast("Photo updated (Local Preview)"); }; reader.readAsDataURL(input.files[0]); } };
window.deleteProfilePhoto = () => { document.getElementById('profile-main-img').style.display = 'none'; document.getElementById('profile-main-icon').style.display = 'flex'; document.getElementById('btn-delete-photo').style.display = 'none'; };

let inactivityTimer;
function startAutoLogoutTimer() { const TIMEOUT_DURATION = 10 * 60 * 1000; function resetTimer() { if (!firebase.auth().currentUser) return; clearTimeout(inactivityTimer); inactivityTimer = setTimeout(() => { firebase.auth().signOut().then(() => { showToast("Session expired"); switchScreen('auth'); }); }, TIMEOUT_DURATION); } ['mousemove', 'keydown', 'click'].forEach(e => document.addEventListener(e, resetTimer)); resetTimer(); }
function stopAutoLogoutTimer() { clearTimeout(inactivityTimer); }
