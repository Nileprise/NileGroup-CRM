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

// Gmail API Config
const G_CLIENT_ID = '575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com';
const G_API_KEY = 'AIzaSyCeodyIo-Jix506RH_M025yQdKE6MfmfKE';
const G_DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const G_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

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

const state = {
    user: null, userRole: null, currentUserName: null,
    candidates: [], onboarding: [], employees: [], allUsers: [],
    
    // Gmail State
    gmail: {
        tokenClient: null, gapiInited: false, gisInited: false,
        nextPageToken: null, currentLabel: 'INBOX', currentEmailId: null
    },

    // Hub State
    hub: { expandedRowId: null, filterType: 'daily', date: new Date().toISOString().split('T')[0], range: { start: 0, end: 0 } },
    
    // UI State
    selection: { cand: new Set(), onb: new Set(), emp: new Set(), hub: new Set(), place: new Set() },
    uploadTarget: { id: null, field: null },
    placementFilter: 'monthly',
    pendingDelete: { type: null },
    
    // Filters
    filters: { text: '', recruiter: '', tech: '', status: '' },
    hubFilters: { text: '', recruiter: '' },
    onbFilters: { text: '' }, 
    empFilters: { text: '' },
    
    metadata: { recruiters: [], techs: [] }
};

/* ==========================================================================
   3. INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    console.log("System Initializing...");
    setupUIListeners();
    setupFilterListeners();
    loadGoogleScripts(); 
    
    auth.onAuthStateChanged(user => {
        if (user) {
            // Uncomment this block if you want strict email verification
            /* if (!user.emailVerified) { 
                document.getElementById('verify-email-display').innerText = user.email; 
                switchScreen('verify'); return; 
            } 
            */
            
            state.user = user;
            const known = ALLOWED_USERS[user.email.toLowerCase()];
            state.userRole = known ? known.role : 'Viewer'; 
            state.currentUserName = known ? known.name : (user.displayName || 'Unknown');
            
            updateUserProfile(user, known);
            switchScreen('app');
            initRealtimeListeners();
            startAutoLogoutTimer();
            checkGmailAuth(); 
        } else {
            switchScreen('auth');
            stopAutoLogoutTimer();
        }
    });

    if (localStorage.getItem('np_theme') === 'light') {
        document.body.classList.add('light-mode');
        const cb = document.getElementById('setting-theme-toggle');
        if(cb) cb.checked = false;
    }
    const mp = document.getElementById('placement-month-picker');
    if(mp) mp.value = new Date().toISOString().slice(0, 7);
});

/* ==========================================================================
   4. NAVIGATION & VIEW SWITCHING
   ========================================================================== */
function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id === 'app' ? 'dashboard-screen' : id + '-screen');
    if(target) target.classList.add('active');
}

function setupUIListeners() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Skip toggle buttons (Gmail/Categories/More)
            if(btn.onclick && btn.onclick.toString().includes('toggle')) return;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            const clicked = e.target.closest('.nav-item');
            clicked.classList.add('active');
            
            document.querySelector('.sidebar').classList.remove('mobile-open');
            const overlay = document.getElementById('sidebar-overlay');
            if(overlay) overlay.classList.remove('active');

            document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
            const targetId = clicked.getAttribute('data-target');
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
}

function setupFilterListeners() {
    // 1. Candidate Filters
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

    // 2. Active / Inactive Toggles
    const toggles = document.querySelectorAll('.btn-toggle');
    toggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toggles.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.filters.status = e.target.getAttribute('data-status');
            renderCandidateTable();
        });
    });

    // 3. Reset Button
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

    // 4. Other View Search Bars
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

    // 5. Gmail Search
    const gSearch = document.getElementById('gmail-search-input');
    if(gSearch) {
        gSearch.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                state.gmail.nextPageToken = null;
                document.getElementById('gmail-rows-container').innerHTML = '';
                loadInbox(); 
            }
        });
    }
}

/* ==========================================================================
   5. GOOGLE API & GMAIL INTEGRATION
   ========================================================================== */
function loadGoogleScripts() {
    const s1 = document.createElement('script'); s1.src = "https://apis.google.com/js/api.js"; 
    s1.onload = () => gapi.load('client', async () => { 
        try {
            await gapi.client.init({ apiKey: G_API_KEY, discoveryDocs: [G_DISCOVERY_DOC] });
            state.gmail.gapiInited = true; checkGmailAuth();
        } catch(e) { console.error(e); }
    });
    document.body.appendChild(s1);

    const s2 = document.createElement('script'); s2.src = "https://accounts.google.com/gsi/client";
    s2.onload = () => {
        state.gmail.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: G_CLIENT_ID, scope: G_SCOPES,
            callback: (resp) => { if(resp.error) return; updateGmailUI(true); renderGmailList(); }
        });
        state.gmail.gisInited = true; checkGmailAuth();
    };
    document.body.appendChild(s2);
}

function checkGmailAuth() {
    if (state.gmail.gapiInited && state.gmail.gisInited && gapi.client.getToken()) updateGmailUI(true);
}

function updateGmailUI(isSignedIn) {
    const btnAuth = document.getElementById('btn-gmail-auth');
    const btnSignout = document.getElementById('btn-gmail-signout');
    if(btnAuth) btnAuth.style.display = isSignedIn ? 'none' : 'block';
    if(btnSignout) btnSignout.style.display = isSignedIn ? 'block' : 'none';
    if(isSignedIn) renderGmailLabels();
}

if(document.getElementById('btn-gmail-auth')) document.getElementById('btn-gmail-auth').onclick = () => state.gmail.tokenClient.requestAccessToken({prompt: ''});
if(document.getElementById('btn-gmail-signout')) document.getElementById('btn-gmail-signout').onclick = () => {
    const t = gapi.client.getToken();
    if(t) google.accounts.oauth2.revoke(t.access_token);
    gapi.client.setToken('');
    updateGmailUI(false);
    document.getElementById('gmail-rows-container').innerHTML = '';
};

window.renderGmailList = async (label = 'Inbox', navElement = null) => {
    state.gmail.currentLabel = label;
    if(navElement) {
        document.querySelectorAll('.gmail-nav-item').forEach(el => el.classList.remove('active'));
        navElement.classList.add('active');
    }
    
    document.getElementById('gmail-list-view').style.display = 'flex';
    document.getElementById('gmail-detail-view').style.display = 'none';
    const container = document.getElementById('gmail-rows-container');
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#ccc;">Loading...</div>';

    if (!gapi.client.getToken()) { 
        container.innerHTML = ''; 
        if(document.getElementById('gmail-empty')) document.getElementById('gmail-empty').style.display = 'block';
        return; 
    }

    try {
        let labelId = 'INBOX';
        if(label === 'Sent') labelId = 'SENT';
        else if(label === 'Starred') labelId = 'STARRED';
        else if(label === 'Important') labelId = 'IMPORTANT';
        
        let request = { 'userId': 'me', 'maxResults': 20 };
        if (['INBOX', 'SENT', 'STARRED', 'IMPORTANT'].includes(labelId)) request.labelIds = [labelId];
        else request.q = `label:${label}`;

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
                <div class="row-subject">${subject} <span style="color:#64748b; margin-left:5px;"> - ${snippet.substring(0, 40)}...</span></div>
                <div class="email-date">${date}</div>
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error("Gmail Error:", err);
        container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error loading emails.</div>`;
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
        if(email.payload.body.data) body = email.payload.body.data;
        else if(email.payload.parts) {
            const part = email.payload.parts.find(p => p.mimeType === 'text/html') || email.payload.parts.find(p => p.mimeType === 'text/plain');
            if(part && part.body.data) body = part.body.data;
        }
        
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

window.backToGmailList = () => {
    document.getElementById('gmail-detail-view').style.display = 'none';
    document.getElementById('gmail-list-view').style.display = 'flex';
};

window.refreshEmails = () => renderGmailList(state.gmail.currentLabel);
window.handleGmailSearch = (q) => { if(!q) renderGmailList(); };

function renderGmailLabels() {
    const container = document.getElementById('gmail-labels-container');
    if(!container) return;
    container.innerHTML = '';
    ['Ajay', 'Asif', 'Ikram', 'Manikanta'].forEach(name => {
        const div = document.createElement('div');
        div.className = 'gmail-nav-item';
        div.innerHTML = `<span class="material-icons" style="font-size:18px; color:#f59e0b; margin-right:15px;">label</span> ${name}`;
        div.onclick = () => renderGmailList(name, div);
        container.appendChild(div);
    });
}

window.syncCurrentEmailToCandidate = async () => {
    if(!state.gmail.currentEmailId) return;
    const senderText = document.getElementById('detail-sender').innerText;
    const subject = document.getElementById('detail-subject').innerText;
    const candidateName = prompt("Enter Candidate FIRST NAME to sync this email to:", "");
    if(!candidateName) return;

    const candidate = state.candidates.find(c => c.first.toLowerCase() === candidateName.toLowerCase());
    if(!candidate) return showToast("Candidate not found.");

    const log = {
        date: new Date().toISOString().split('T')[0],
        subject: subject,
        type: 'Imported Email',
        tech: candidate.tech || 'General',
        recruiter: state.currentUserName,
        note: `Imported from: ${senderText}`,
        timestamp: Date.now()
    };

    let logs = candidate.submissionLog || [];
    logs.push(log);
    await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs });
    showToast(`Synced to ${candidate.first} ${candidate.last}`);
};

window.toggleCategories = () => {
    const sub = document.getElementById('categories-submenu');
    const arrow = document.getElementById('category-arrow');
    if (sub.style.display === 'none') { sub.style.display = 'block'; arrow.innerText = 'expand_less'; } 
    else { sub.style.display = 'none'; arrow.innerText = 'expand_more'; }
};

window.toggleMore = () => {
    const sub = document.getElementById('more-submenu');
    const btn = document.getElementById('more-btn');
    if (sub.style.display === 'none') { sub.style.display = 'block'; btn.innerHTML = `<span class="material-icons">expand_less</span><h3>Less</h3>`; }
    else { sub.style.display = 'none'; btn.innerHTML = `<span class="material-icons">expand_more</span><h3>More</h3>`; }
};

/* ==========================================================================
   6. COMPOSE & SEND (REAL API + LOGGING)
   ========================================================================== */
function createMimeMessage(to, subject, body) {
    const email = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "", body].join("\n");
    return btoa(unescape(encodeURIComponent(email))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

window.openComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'flex'; };
window.closeComposeModal = () => { document.getElementById('crm-compose-modal').style.display = 'none'; };

window.sendCrmEmail = async () => {
    const to = document.getElementById('compose-to').value.trim();
    const subject = document.getElementById('compose-subject').value;
    const body = document.getElementById('compose-message').value;

    if(!to || !subject) return showToast("Recipient and Subject required");

    const sendBtn = document.querySelector('.compose-footer .btn-primary');
    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = 'Sending...'; sendBtn.disabled = true;

    try {
        if (!state.gmail.gapiInited || !gapi.client.getToken()) throw new Error("Gmail not connected.");
        const raw = createMimeMessage(to, subject, body.replace(/\n/g, '<br>'));
        await gapi.client.gmail.users.messages.send({ 'userId': 'me', 'resource': { 'raw': raw } });
        
        showToast("Email Sent!");
        closeComposeModal();
        
        // Auto-Log Logic
        const candidate = state.candidates.find(c => (c.gmail && c.gmail.includes(to)) || (c.email && c.email.includes(to)));
        if(candidate) {
            const logs = candidate.submissionLog || [];
            logs.push({
                date: new Date().toISOString().split('T')[0],
                subject: subject,
                type: 'Outbound Email',
                tech: candidate.tech || 'General',
                recruiter: state.currentUserName,
                timestamp: Date.now()
            });
            await db.collection('candidates').doc(candidate.id).update({ submissionLog: logs });
            showToast("Logged to Hub");
        }
        
        document.getElementById('compose-to').value = '';
        document.getElementById('compose-subject').value = '';
        document.getElementById('compose-message').value = '';

    } catch (err) {
        showToast("Send Failed: " + (err.result?.error?.message || err.message));
    } finally {
        sendBtn.innerHTML = originalText; sendBtn.disabled = false;
    }
};

/* ==========================================================================
   7. CORE CRM REALTIME LISTENERS
   ========================================================================== */
function initRealtimeListeners() {
    db.collection('candidates').orderBy('createdAt', 'desc').limit(200).onSnapshot(snap => {
        state.candidates = [];
        const techs = new Set();
        snap.forEach(doc => {
            const d = doc.data();
            state.candidates.push({ id: doc.id, ...d });
            if (d.tech) techs.add(d.tech);
        });
        state.metadata.techs = Array.from(techs).sort();
        
        renderCandidateTable();
        renderPlacementTable();
        renderDropdowns();
        updateHubStats(state.hub.filterType, state.hub.date);
        updateDashboardStats();
    });

    db.collection('employees').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.employees = [];
        snap.forEach(doc => state.employees.push({ id: doc.id, ...doc.data() }));
        const recruiters = new Set();
        state.employees.forEach(e => { if(e.first) recruiters.add(e.first.trim()); });
        state.metadata.recruiters = Array.from(recruiters).map(r => ({value:r, display:r})).sort((a,b)=>a.value.localeCompare(b.value));
        renderEmployeeTable();
        renderDropdowns();
    });

    db.collection('onboarding').orderBy('createdAt', 'desc').onSnapshot(snap => {
        state.onboarding = [];
        snap.forEach(doc => state.onboarding.push({ id: doc.id, ...doc.data() }));
        renderOnboardingTable();
    });
}

/* ==========================================================================
   8. TABLE RENDERERS & FILTERS
   ========================================================================== */
function renderDropdowns() {
    const ids = ['filter-recruiter', 'filter-tech', 'hub-filter-recruiter'];
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

function renderCandidateTable() {
    const filtered = getFilteredData(state.candidates, state.filters);
    const tbody = document.getElementById('table-body');
    const thead = document.getElementById('table-head');
    thead.innerHTML = `<tr><th><input type="checkbox" id="select-all-cand" onclick="toggleSelectAll('cand', this)"></th><th>#</th><th>First Name</th><th>Last Name</th><th>Mobile</th><th>WhatsApp</th><th>Tech</th><th>Recruiter</th><th>Status</th><th>Assigned</th><th>Gmail</th><th>LinkedIn</th><th>Resume</th><th>Track</th><th>Comments</th></tr>`;
    document.getElementById('cand-footer-count').innerText = `Showing ${filtered.length} records`;

    tbody.innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.cand.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.cand.has(c.id) ? 'selected-row' : '';
        const statusStyle = c.status === 'Active' ? 'active' : (c.status === 'Inactive' ? 'inactive' : '');
        
        const gmailIcon = c.gmail ? `<a href="${c.gmail}" target="_blank" onclick="event.stopPropagation()"><i class="fa-brands fa-google icon-gmail link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'gmail', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const linkedinIcon = c.linkedin ? `<a href="${c.linkedin}" target="_blank" onclick="event.stopPropagation()"><i class="fa-brands fa-linkedin icon-linkedin link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'linkedin', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const resumeIcon = c.resume ? `<a href="${c.resume}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-file-lines icon-resume link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'resume', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;
        const trackIcon = c.track ? `<a href="${c.track}" target="_blank" onclick="event.stopPropagation()"><i class="fa-solid fa-location-crosshairs icon-track link-icon-btn"></i></a>` : `<div class="link-icon-btn icon-empty" onclick="inlineUrlEdit('${c.id}', 'track', 'candidates', this)"><i class="fa-solid fa-plus"></i></div>`;

        return `<tr class="${rowClass}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'cand')"></td>
            <td>${i+1}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${c.last}</td>
            <td onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${c.mobile}</td>
            <td onclick="inlineEdit('${c.id}', 'wa', 'candidates', this)">${c.wa}</td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${c.tech}</td>
            <td onclick="editRecruiter('${c.id}', 'candidates', this)">${c.recruiter}</td>
            <td><select class="status-select ${statusStyle}" onchange="updateStatus('${c.id}', 'candidates', this.value)"><option value="Active" ${c.status==='Active'?'selected':''}>Active</option><option value="Inactive" ${c.status==='Inactive'?'selected':''}>Inactive</option><option value="Placed" ${c.status==='Placed'?'selected':''}>Placed</option></select></td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td style="text-align:center;">${gmailIcon}</td>
            <td style="text-align:center;">${linkedinIcon}</td>
            <td style="text-align:center;">${resumeIcon}</td>
            <td style="text-align:center;">${trackIcon}</td>
            <td onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)">${c.comments||'-'}</td>
        </tr>`;
    }).join('');
}

window.updateHubStats = (filterType, dateVal) => {
    if(filterType) state.hub.filterType = filterType;
    if(dateVal) state.hub.date = dateVal;

    document.querySelectorAll('.date-filter-pill .filter-btn').forEach(btn => {
        if(btn.closest('#view-placements')) return;
        if(btn.dataset.filter === state.hub.filterType) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const picker = document.getElementById('hub-date-picker');
    if(picker && picker.value !== state.hub.date) picker.value = state.hub.date;

    const d = new Date(state.hub.date);
    let startTimestamp, endTimestamp, labelText = "";

    if (state.hub.filterType === 'daily') {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        endTimestamp = startTimestamp + 86400000; 
        labelText = d.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
    } 
    else if (state.hub.filterType === 'weekly') {
        const day = d.getDay(); 
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff)); monday.setHours(0,0,0,0);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
        startTimestamp = monday.getTime(); endTimestamp = sunday.getTime();
        labelText = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    } 
    else if (state.hub.filterType === 'monthly') {
        startTimestamp = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0); lastDay.setHours(23,59,59,999);
        endTimestamp = lastDay.getTime();
        labelText = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    state.hub.range = { start: startTimestamp, end: endTimestamp };
    if(document.getElementById('hub-range-label')) document.getElementById('hub-range-label').innerHTML = `<i class="fa-regular fa-calendar"></i> &nbsp; ${labelText}`;

    let subCount = 0, scrCount = 0, intCount = 0;
    const checkInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= startTimestamp && t < endTimestamp; };
    state.candidates.forEach(c => {
        if(c.submissionLog) c.submissionLog.forEach(e => { if(checkInRange(e)) subCount++; });
        if(c.screeningLog) c.screeningLog.forEach(e => { if(checkInRange(e)) scrCount++; });
        if(c.interviewLog) c.interviewLog.forEach(e => { if(checkInRange(e)) intCount++; });
    });
    if(document.getElementById('stat-sub')) document.getElementById('stat-sub').innerText = subCount;
    if(document.getElementById('stat-scr')) document.getElementById('stat-scr').innerText = scrCount;
    if(document.getElementById('stat-int')) document.getElementById('stat-int').innerText = intCount;

    renderHubTable();
};

window.toggleHubRow = (id) => {
    if(state.hub.expandedRowId === id) state.hub.expandedRowId = null; else state.hub.expandedRowId = id;
    renderHubTable(); 
};

function renderHubTable() {
    let data = state.candidates;
    if(state.userRole === 'Employee' && state.currentUserName) data = data.filter(c => c.recruiter === state.currentUserName);
    if(state.hubFilters && state.hubFilters.text) data = data.filter(c => (c.first + ' ' + c.last + ' ' + (c.tech||'')).toLowerCase().includes(state.hubFilters.text));

    const { start, end } = state.hub.range;
    const isInRange = (entry) => { const t = new Date(entry.date || entry).getTime(); return t >= start && t <= end; };

    const activeCandidates = data.filter(c => {
        const hasSub = (c.submissionLog || []).some(isInRange);
        const hasScr = (c.screeningLog || []).some(isInRange);
        const hasInt = (c.interviewLog || []).some(isInRange);
        return hasSub || hasScr || hasInt;
    });

    document.getElementById('hub-table-head').innerHTML = `<tr><th style="width:40px;"><input type="checkbox" id="select-all-hub" onclick="toggleSelectAll('hub', this)"></th><th style="width:50px;">#</th><th style="width:150px;">Candidate Name</th><th style="width:150px;">Recruiter</th><th style="width:120px;">Technology</th><th style="text-align:center;">Submission</th><th style="text-align:center;">Screenings</th><th style="text-align:center;">Interview</th><th style="text-align:right;">Date</th></tr>`;
    document.getElementById('hub-footer-count').innerText = `Showing ${activeCandidates.length} active records`;
    
    const tbody = document.getElementById('hub-table-body');
    if (activeCandidates.length === 0) { tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:20px; opacity:0.6;">No activity found for this period.</td></tr>`; return; }

    tbody.innerHTML = activeCandidates.map((c, i) => {
        const sub = (c.submissionLog||[]).filter(isInRange).length;
        const scr = (c.screeningLog||[]).filter(isInRange).length;
        const int = (c.interviewLog||[]).filter(isInRange).length;
        
        let displayRecruiter = c.recruiter || '-';
        let displayDate = '-';
        const logsInRange = [...(c.submissionLog||[]).filter(isInRange), ...(c.screeningLog||[]).filter(isInRange), ...(c.interviewLog||[]).filter(isInRange)];
        if (logsInRange.length > 0) {
            logsInRange.sort((a,b) => new Date(b.date || b) - new Date(a.date || a));
            const latest = logsInRange[0];
            displayDate = (typeof latest === 'string') ? latest : (latest.date || '-');
            if (typeof latest !== 'string' && latest.recruiter) displayRecruiter = latest.recruiter;
        }

        if(!state.selection.hub) state.selection.hub = new Set();
        const isSel = state.selection.hub.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.hub.has(c.id) ? 'selected-row' : '';
        const isExpanded = state.hub.expandedRowId === c.id;
        const activeStyle = isExpanded ? 'background: rgba(6, 182, 212, 0.1); border-left: 3px solid var(--primary);' : '';
        const caret = isExpanded ? '<i class="fa-solid fa-chevron-down"></i>' : '<i class="fa-solid fa-chevron-right"></i>';

        let html = `
        <tr style="cursor:pointer; ${activeStyle}" class="${rowClass}" onclick="toggleHubRow('${c.id}')">
            <td onclick="event.stopPropagation()"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'hub')"></td>
            <td style="opacity:0.7;">${caret}</td>
            <td style="font-weight:600; color:var(--text-main);">${c.first} ${c.last}</td>
            <td>${displayRecruiter}</td>
            <td style="color:var(--primary);">${c.tech || '-'}</td>
            <td class="text-cyan" style="font-weight:bold; font-size:1.1rem; text-align:center;">${sub}</td>
            <td class="text-gold" style="font-weight:bold; text-align:center;">${scr}</td>
            <td class="text-purple" style="font-weight:bold; text-align:center;">${int}</td>
            <td style="font-size:0.8rem; color:var(--text-muted); text-align:right;">${displayDate}</td>
        </tr>`;

        if(isExpanded) {
            const renderTimeline = (list, type) => {
                const visibleLogs = (list||[]).filter(isInRange);
                if(visibleLogs.length === 0) return `<li class="hub-log-item" style="opacity:0.5; font-style:italic;">No records in this range.</li>`;
                return visibleLogs.map((entry, index) => {
                    const isLegacy = typeof entry === 'string';
                    const dateStr = isLegacy ? entry : entry.date;
                    const subject = isLegacy ? 'Manual Entry' : (entry.subject || entry.note || 'No Subject');
                    const link = !isLegacy && entry.link ? entry.link : null;
                    let icon = type === 'sub' ? 'fa-paper-plane' : (type === 'scr' ? 'fa-user-clock' : 'fa-headset');
                    return `
                    <li class="hub-log-item" style="display:flex; flex-direction:column; gap:4px; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
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
            html += `
            <tr class="hub-details-row"><td colspan="9" style="padding:0; border:none;">
                <div class="hub-details-wrapper" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px; padding:20px; background:rgba(0,0,0,0.2); border-bottom:1px solid var(--glass-border);" onclick="event.stopPropagation()">
                    <div class="hub-col cyan" style="background:var(--glass-bg); border-radius:12px; padding:15px; border:1px solid rgba(6,182,212,0.2);">
                        <div class="hub-col-header cyan" style="font-weight:700; color:#06b6d4; margin-bottom:10px;">RTR & Submissions <button onclick="triggerHubFileUpload('${c.id}', 'submissionLog')" style="float:right; background:none; border:none; color:#06b6d4; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll" style="list-style:none; padding:0; max-height:300px; overflow-y:auto;">${renderTimeline(c.submissionLog, 'sub')}</ul>
                    </div>
                    <div class="hub-col gold" style="background:var(--glass-bg); border-radius:12px; padding:15px; border:1px solid rgba(245,158,11,0.2);">
                        <div class="hub-col-header gold" style="font-weight:700; color:#f59e0b; margin-bottom:10px;">Screenings <button onclick="triggerHubFileUpload('${c.id}', 'screeningLog')" style="float:right; background:none; border:none; color:#f59e0b; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll" style="list-style:none; padding:0; max-height:300px; overflow-y:auto;">${renderTimeline(c.screeningLog, 'scr')}</ul>
                    </div>
                    <div class="hub-col purple" style="background:var(--glass-bg); border-radius:12px; padding:15px; border:1px solid rgba(139,92,246,0.2);">
                        <div class="hub-col-header purple" style="font-weight:700; color:#8b5cf6; margin-bottom:10px;">Interviews <button onclick="triggerHubFileUpload('${c.id}', 'interviewLog')" style="float:right; background:none; border:none; color:#8b5cf6; cursor:pointer;"><i class="fa-solid fa-plus"></i></button></div>
                        <ul class="hub-log-list custom-scroll" style="list-style:none; padding:0; max-height:300px; overflow-y:auto;">${renderTimeline(c.interviewLog, 'int')}</ul>
                    </div>
                </div>
            </td></tr>`;
        }
        return html;
    }).join('');
}

function renderEmployeeTable() {
    let filtered = state.employees;
    if (state.userRole === 'Employee') filtered = filtered.filter(e => e.officialEmail === state.user.email);
    filtered = filtered.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.empFilters.text));

    const headers = ['<input type="checkbox" id="select-all-emp" onclick="toggleSelectAll(\'emp\', this)">', '#', 'First Name', 'Last Name', 'Date of Birth', 'Designation', 'Work Mobile', 'Personal Mobile', 'Official Email', 'Personal Email'];
    document.getElementById('employee-table-head').innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('emp-footer-count').innerText = `Showing ${filtered.length} records`;

    document.getElementById('employee-table-body').innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.emp.has(c.id) ? 'checked' : '';
        return `<tr class="${state.selection.emp.has(c.id) ? 'selected-row' : ''}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'emp')"></td>
            <td>${i+1}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'employees', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'employees', this)">${c.last}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'employees', this.value)"></td>
            <td onclick="inlineEdit('${c.id}', 'designation', 'employees', this)">${c.designation||'-'}</td>
            <td onclick="inlineEdit('${c.id}', 'workMobile', 'employees', this)">${c.workMobile||'-'}</td>
            <td onclick="inlineEdit('${c.id}', 'personalMobile', 'employees', this)">${c.personalMobile||'-'}</td>
            <td onclick="inlineEdit('${c.id}', 'officialEmail', 'employees', this)">${c.officialEmail||'-'}</td>
            <td onclick="inlineEdit('${c.id}', 'personalEmail', 'employees', this)">${c.personalEmail||'-'}</td>
        </tr>`;
    }).join('');
}

function renderOnboardingTable() {
    const filtered = state.onboarding.filter(item => (item.first + ' ' + item.last).toLowerCase().includes(state.onbFilters.text));
    const headers = ['<input type="checkbox" id="select-all-onb" onclick="toggleSelectAll(\'onb\', this)">', '#', 'First Name', 'Last Name', 'Date of Birth', 'Recruiter', 'Mobile', 'Status', 'Assigned', 'Comments'];
    document.getElementById('onboarding-table-head').innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    document.getElementById('onb-footer-count').innerText = `Showing ${filtered.length} records`;

    document.getElementById('onboarding-table-body').innerHTML = filtered.map((c, i) => {
        const isSel = state.selection.onb.has(c.id) ? 'checked' : '';
        return `<tr class="${state.selection.onb.has(c.id) ? 'selected-row' : ''}">
            <td><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'onb')"></td>
            <td>${i+1}</td>
            <td onclick="inlineEdit('${c.id}', 'first', 'onboarding', this)">${c.first}</td>
            <td onclick="inlineEdit('${c.id}', 'last', 'onboarding', this)">${c.last}</td>
            <td><input type="date" class="date-input-modern" value="${c.dob||''}" onchange="inlineDateEdit('${c.id}', 'dob', 'onboarding', this.value)"></td>
            <td onclick="editRecruiter('${c.id}', 'onboarding', this)">${c.recruiter||'-'}</td>
            <td onclick="inlineEdit('${c.id}', 'mobile', 'onboarding', this)">${c.mobile}</td>
            <td><select class="status-select ${c.status === 'Onboarding' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'onboarding', this.value)"><option value="Onboarding" ${c.status==='Onboarding'?'selected':''}>Onboarding</option><option value="Completed" ${c.status==='Completed'?'selected':''}>Completed</option></select></td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'onboarding', this.value)"></td>
            <td onclick="inlineEdit('${c.id}', 'comments', 'onboarding', this)">${c.comments||'-'}</td>
        </tr>`;
    }).join('');
}

window.renderPlacementTable = () => {
    const mVal = document.getElementById('placement-month-picker').value;
    const yVal = document.getElementById('placement-year-picker').value;
    let placed = state.candidates.filter(c => c.status === 'Placed');
    placed = placed.filter(c => {
        if(!c.assigned) return false;
        return (state.placementFilter === 'monthly') ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal);
    });

    const thead = document.querySelector('#placement-table thead');
    if(thead) thead.innerHTML = `<tr><th style="width:40px;"><input type="checkbox" id="select-all-place" onclick="toggleSelectAll('place', this)"></th><th style="width:50px;">#</th><th>First Name</th><th>Last Name</th><th>Tech</th><th>Location</th><th>Contract</th><th>Assigned</th><th>Actions</th></tr>`;
    
    document.getElementById('placement-footer-count').innerText = `Showing ${placed.length} records`;
    
    document.getElementById('placement-table-body').innerHTML = placed.map((c, i) => {
        if(!state.selection.place) state.selection.place = new Set();
        const isSel = state.selection.place.has(c.id) ? 'checked' : '';
        const rowClass = state.selection.place.has(c.id) ? 'selected-row' : '';
        return `<tr class="${rowClass}">
            <td style="text-align:center;"><input type="checkbox" ${isSel} onchange="toggleSelect('${c.id}', 'place')"></td>
            <td>${i+1}</td>
            <td style="font-weight:600; color:var(--text-main);">${c.first}</td>
            <td style="font-weight:600; color:var(--text-main);">${c.last}</td>
            <td onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)" class="text-cyan">${c.tech}</td>
            <td onclick="inlineEdit('${c.id}', 'location', 'candidates', this)">${c.location||'Add'}</td>
            <td onclick="inlineEdit('${c.id}', 'contract', 'candidates', this)">${c.contract||'Add'}</td>
            <td><input type="date" class="date-input-modern" value="${c.assigned}" onchange="inlineDateEdit('${c.id}', 'assigned', 'candidates', this.value)"></td>
            <td>${state.userRole !== 'Employee' ? `<button class="btn-icon-small" style="color:#ef4444;" onclick="deletePlacement('${c.id}')"><i class="fa-solid fa-trash"></i></button>` : ''}</td>
        </tr>`;
    }).join('');
};

/* ========================================================
   9. STRICT DELETE LOGIC & SELECTION
   ======================================================== */
window.toggleSelect = (id, type) => {
    if(!state.selection[type]) state.selection[type] = new Set();
    if(state.selection[type].has(id)) state.selection[type].delete(id); else state.selection[type].add(id);
    updateSelectButtons(type);
    
    if(type==='cand') renderCandidateTable();
    else if(type==='emp') renderEmployeeTable();
    else if(type==='onb') renderOnboardingTable();
    else if(type==='hub') renderHubTable();
    else if(type==='place') renderPlacementTable();
};

window.toggleSelectAll = (type, box) => {
    let data = [];
    if(type==='cand') data = getFilteredData(state.candidates, state.filters);
    else if(type==='emp') data = state.employees;
    else if(type==='onb') data = state.onboarding;
    else if(type==='hub') {
        const { start, end } = state.hub.range;
        const isInRange = (e) => { const t = new Date(e.date || e).getTime(); return t >= start && t <= end; };
        data = state.candidates.filter(c => [...(c.submissionLog||[]), ...(c.screeningLog||[]), ...(c.interviewLog||[])].some(isInRange));
    }
    else if(type==='place') {
        const mVal = document.getElementById('placement-month-picker').value;
        const yVal = document.getElementById('placement-year-picker').value;
        data = state.candidates.filter(c => c.status === 'Placed' && c.assigned && (state.placementFilter === 'monthly' ? c.assigned.startsWith(mVal) : c.assigned.startsWith(yVal)));
    }

    if(!state.selection[type]) state.selection[type] = new Set();
    if(box.checked) data.forEach(i=>state.selection[type].add(i.id));
    else state.selection[type].clear();
    
    updateSelectButtons(type);
    
    if(type==='cand') renderCandidateTable();
    else if(type==='emp') renderEmployeeTable();
    else if(type==='onb') renderOnboardingTable();
    else if(type==='hub') renderHubTable();
    else if(type==='place') renderPlacementTable();
};

function updateSelectButtons(type) {
    let btn, countSpan;
    if(type === 'cand') { btn = document.getElementById('btn-delete-selected'); countSpan = document.getElementById('selected-count'); }
    else if(type === 'emp') { btn = document.getElementById('btn-delete-employee'); countSpan = document.getElementById('emp-selected-count'); }
    else if(type === 'onb') { btn = document.getElementById('btn-delete-onboarding'); countSpan = document.getElementById('onboarding-selected-count'); }
    else if(type === 'place') { btn = document.getElementById('btn-delete-placement'); countSpan = document.getElementById('place-selected-count'); }
    
    if (!btn) return;

    if (state.selection[type].size > 0 && state.userRole !== 'Employee') {
        btn.style.display = 'inline-flex';
        btn.style.opacity = '1';
        if(countSpan) countSpan.innerText = state.selection[type].size;
    } else {
        btn.style.display = 'none';
        if(countSpan) countSpan.innerText = '0';
    }
}

window.openDeleteModal = (type) => { 
    state.pendingDelete.type = type; 
    document.getElementById('delete-modal').style.display = 'flex'; 
    document.getElementById('del-count').innerText = state.selection[type].size;
};

window.closeDeleteModal = () => { document.getElementById('delete-modal').style.display = 'none'; };

window.executeDelete = async () => {
    const type = state.pendingDelete.type;
    closeDeleteModal(); // INSTANT CLOSE

    if(!type) return;
    
    let col = (type==='cand'||type==='hub'||type==='place') ? 'candidates' : (type==='emp'?'employees':'onboarding');
    const ids = Array.from(state.selection[type]);
    const batch = db.batch();
    
    ids.forEach(id => batch.delete(db.collection(col).doc(id)));
    showToast("Deleting items...");
    
    try {
        await batch.commit();
        state.selection[type].clear();
        updateSelectButtons(type);
        const master = document.getElementById(`select-all-${type}`);
        if(master) master.checked = false;
        showToast("Deleted Successfully");
    } catch(e) { showToast("Delete Failed"); }
};

/* ========================================================
   10. ACTIONS & UTILITIES
   ======================================================== */
function cleanError(msg) { return msg.replace('Firebase: ', '').replace('Error ', '').replace('(auth/', '').replace(').', '').replace(/-/g, ' ').toUpperCase(); }
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }

window.handleLogin = () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    if(!email || !pass) { alert("Please enter email and password."); return; }
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        console.error("Login Error:", err);
        alert("Login Failed: " + err.message);
    });
};

window.handleSignup = () => { 
    const n = document.getElementById('reg-name').value, e = document.getElementById('reg-email').value, p = document.getElementById('reg-pass').value;
    auth.createUserWithEmailAndPassword(e, p).then(cred => {
        cred.user.updateProfile({displayName: n});
        db.collection('users').doc(e).set({firstName: n, email: e, role: 'Employee', createdAt: Date.now()});
        cred.user.sendEmailVerification();
        showToast("Verification Sent"); switchAuth('login');
    }).catch(err => showToast(cleanError(err.message)));
};

// Inline Editing
window.inlineEdit = (id, field, col, el) => {
    const val = el.innerText;
    el.innerHTML = `<input type="text" class="inline-input-active" value="${val}" onblur="saveInline(this, '${id}', '${field}', '${col}', '${val}')">`;
    el.querySelector('input').focus();
};
window.saveInline = (input, id, field, col, oldVal) => {
    const newVal = input.value;
    input.parentElement.innerText = newVal;
    if(newVal !== oldVal) db.collection(col).doc(id).update({[field]: newVal}).catch(()=>input.parentElement.innerText = oldVal);
};
window.updateStatus = (id, col, val) => db.collection(col).doc(id).update({status: val});
window.inlineDateEdit = (id, field, col, val) => db.collection(col).doc(id).update({[field]: val});

window.inlineUrlEdit = (id, field, col, el) => {
    if(el.querySelector('input')) return;
    el.innerHTML = ''; 
    const input = document.createElement('input'); 
    input.type = 'url'; 
    input.placeholder = 'Paste Link...'; 
    input.className = 'url-input-active'; 
    const save = () => { 
        let newVal = input.value.trim(); 
        if(newVal && !newVal.startsWith('http')) newVal = 'https://' + newVal; 
        if(field === 'linkedin' && newVal && !newVal.includes('linkedin.com')) { alert("Invalid LinkedIn URL"); return; }
        db.collection(col).doc(id).update({ [field]: newVal }); 
    };
    input.addEventListener('blur', save); 
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
    el.appendChild(input); 
    input.focus();
};

function updateDashboardStats() {
    const data = state.candidates;
    document.getElementById('stat-total').innerText = data.length;
    document.getElementById('stat-placed').innerText = data.filter(c=>c.status==='Placed').length;
}

function updateUserProfile(user, hardcodedData) {
    const name = hardcodedData ? hardcodedData.name : (user.displayName || 'Staff Member');
    document.getElementById('display-username').innerText = name;
    document.getElementById('prof-name-display').innerText = name;
}

window.manualAddPlacement = () => {
    const today = new Date().toISOString().split('T')[0];
    db.collection('candidates').add({
        first: 'New', last: 'Placement', tech: '', status: 'Placed', assigned: today, createdAt: Date.now()
    }).then(() => showToast("Added Placement"));
};

window.deletePlacement = (id) => {
    if(confirm("Delete this placement?")) db.collection('candidates').doc(id).delete();
}

/* ========================================================
   12. SECURITY TIMERS & MISC TOGGLES
   ======================================================== */
let inactivityTimer;
function startAutoLogoutTimer() {
    const TIMEOUT_DURATION = 10 * 60 * 1000; 
    function resetTimer() {
        if (!firebase.auth().currentUser) return; 
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            firebase.auth().signOut().then(() => { showToast("Session expired"); switchScreen('auth'); });
        }, TIMEOUT_DURATION);
    }
    ['mousemove', 'keydown', 'click'].forEach(e => document.addEventListener(e, resetTimer));
    resetTimer();
}
function stopAutoLogoutTimer() { clearTimeout(inactivityTimer); }
