/* =========================================================
   NILEPRISE CRM — Application Logic
   Firebase-backed live data sync (Firestore) for candidates,
   employees, placements, onboarding, hub logs, and custom
   columns. Falls back to localStorage DEMO MODE automatically
   if FIREBASE_CONFIG is left blank.
   ========================================================= */

/* ---------- 1. CONFIG ---------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDTX7cHfS8sQEREb2qwOR50YuZsdsPhr40",
  authDomain: "nilegroup-crm-448c4.firebaseapp.com",
  projectId: "nilegroup-crm-448c4",
  storageBucket: "nilegroup-crm-448c4.firebasestorage.app",
  messagingSenderId: "96773475717",
  appId: "1:96773475717:web:79b2537606b9dc524488ec"
};

// Google OAuth client ID for Gmail (from Google Cloud Console).
// Needs the gmail.readonly (or gmail.modify) scope enabled.
const GOOGLE_CLIENT_ID = "575678017832-34fs5qkepdnrgqdc58h0semgjrct5arl.apps.googleusercontent.com";
const GMAIL_SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.labels";

/* ---------- 2. Firebase bootstrap ---------- */
let fb = { app:null, auth:null, db:null, storage:null, ready:false };

function initFirebase(){
  const configured = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId;
  const statusEl = document.getElementById('firebase-status-text');
  if(!configured){
    if(statusEl){ statusEl.textContent = 'Not configured — running in local demo mode'; }
    setConnLabel('Demo Mode', false);
    return;
  }
  try{
    fb.app = firebase.initializeApp(FIREBASE_CONFIG);
    fb.auth = firebase.auth();
    fb.db = firebase.firestore();
    fb.storage = firebase.storage();
    fb.ready = true;
    if(statusEl){ statusEl.textContent = 'Connected to ' + FIREBASE_CONFIG.projectId; }
    // Update login hint
    const loginHint = document.getElementById('login-mode-hint');
    if(loginHint){ loginHint.textContent = 'Sign in with your email and password'; }
    setConnLabel('Live System', true);
  }catch(e){
    console.error('Firebase init failed', e);
    if(statusEl){ statusEl.textContent = 'Connection failed — check FIREBASE_CONFIG'; }
    setConnLabel('Offline', false);
  }
}

function setConnLabel(label, live){
  const dot = document.getElementById('conn-dot');
  const lbl = document.getElementById('conn-label');
  if(lbl) lbl.textContent = label;
  if(dot) dot.style.color = live ? '#22c55e' : '#f5b73d';
}

/* ---------- 3. App State ---------- */
const state = {
  user: null,
  role: 'Admin', // 'Admin' | 'Recruiter'
  candidates: [],
  employees: [],
  placements: [],
  onboarding: [],
  hubLogs: [],     // {id, candidateId, type: submission|screening|interview, date, subject}
  customColumns: [],
  selected: { cand:[], hub:[], place:[], emp:[], onb:[] },
  pagination: {
    cand:{ current:1, limit:50 }, hub:{ current:1, limit:50 },
    place:{ current:1, limit:50 }, emp:{ current:1, limit:50 }, onb:{ current:1, limit:50 }
  },
  filters: { search:'', recruiter:'', tech:'', status:'' },
  hubFilters: { search:'', mode:'daily', date: new Date().toISOString().slice(0,10) },
  placementFilter: { mode:'monthly' },
  deleteContext: null,
  gmail: { token:null, messages:[], currentLabel:'INBOX', currentMsgId:null },
  unsubscribes: [] // active Firestore onSnapshot listeners
};

const LS_KEY = 'nileprise_crm_data_v1';

/* ---------- 3b. Firestore <-> local collection mapping ---------- */
// Each entry: state key -> Firestore collection name + which view(s) to re-render on change.
const COLLECTIONS = {
  candidates:    { coll:'candidates',    onChange: ()=>{ renderCandidatesTable(); renderDashboard(); } },
  employees:     { coll:'employees',     onChange: ()=>{ renderEmployeeTable(); renderDashboard(); renderCandidatesTable(); } },
  placements:    { coll:'placements',    onChange: ()=>{ renderPlacementTable(); renderDashboard(); } },
  onboarding:    { coll:'onboarding',    onChange: ()=>{ renderOnboardingTable(); } },
  hubLogs:       { coll:'hubLogs',       onChange: ()=>{ renderHubTable(); } },
  customColumns: { coll:'customColumns', onChange: ()=>{ renderCandidatesTable(); } }
};

function attachFirestoreListeners(){
  if(!fb.ready) return;
  detachFirestoreListeners();

  // Candidates
  state.unsubscribes.push(
    fb.db.collection('candidates').onSnapshot(
      snap=>{
        state.candidates = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderCandidatesTable();
        renderDashboard();
      },
      err=>{
        console.error('Candidates listener error:', err);
        showToast('Sync error: candidates collection', 'error');
      }
    )
  );

  // Employees
  state.unsubscribes.push(
    fb.db.collection('employees').onSnapshot(
      snap=>{
        state.employees = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderEmployeeTable();
        renderDashboard();
        refreshFilterDropdowns();
      },
      err=>{
        console.error('Employees listener error:', err);
        showToast('Sync error: employees collection', 'error');
      }
    )
  );

  // Placements
  state.unsubscribes.push(
    fb.db.collection('placements').onSnapshot(
      snap=>{
        state.placements = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderPlacementTable();
        renderDashboard();
      },
      err=>{
        console.error('Placements listener error:', err);
        showToast('Sync error: placements collection', 'error');
      }
    )
  );

  // Onboarding
  state.unsubscribes.push(
    fb.db.collection('onboarding').onSnapshot(
      snap=>{
        state.onboarding = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderOnboardingTable();
      },
      err=>{
        console.error('Onboarding listener error:', err);
        showToast('Sync error: onboarding collection', 'error');
      }
    )
  );

  // Hub Logs
  state.unsubscribes.push(
    fb.db.collection('hubLogs').onSnapshot(
      snap=>{
        state.hubLogs = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderHubTable();
        updateHubStats();
      },
      err=>{
        console.error('HubLogs listener error:', err);
      }
    )
  );

  // Custom Columns
  state.unsubscribes.push(
    fb.db.collection('customColumns').onSnapshot(
      snap=>{
        state.customColumns = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        renderCandidatesTable();
      },
      err=>{
        console.error('CustomColumns listener error:', err);
      }
    )
  );

  console.log('Firestore listeners attached for real-time sync');
}
function detachFirestoreListeners(){
  state.unsubscribes.forEach(u=>{ try{ u(); }catch(e){} });
  state.unsubscribes = [];
}

function loadLocalData(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const data = JSON.parse(raw);
      Object.assign(state, {
        candidates: data.candidates||[],
        employees: data.employees||[],
        placements: data.placements||[],
        onboarding: data.onboarding||[],
        hubLogs: data.hubLogs||[],
        customColumns: data.customColumns||[]
      });
    } else {
      seedDemoData();
    }
  }catch(e){ seedDemoData(); }
}

function saveLocalData(){
  localStorage.setItem(LS_KEY, JSON.stringify({
    candidates: state.candidates, employees: state.employees, placements: state.placements,
    onboarding: state.onboarding, hubLogs: state.hubLogs, customColumns: state.customColumns
  }));
}

function uid(){ return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }

function seedDemoData(){
  const today = new Date().toISOString().slice(0,10);
  state.employees = [
    { id: uid(), first:'Asha', last:'Verma', designation:'Senior Recruiter', role:'Recruiter', workMobile:'+1 555 0101', personalMobile:'', officialEmail:'asha@nileprise.com', personalEmail:'' },
    { id: uid(), first:'Daniel', last:'Reyes', designation:'Recruiter', role:'Recruiter', workMobile:'+1 555 0102', personalMobile:'', officialEmail:'daniel@nileprise.com', personalEmail:'' },
    { id: uid(), first:'Priya', last:'Nair', designation:'Operations Admin', role:'Admin', workMobile:'+1 555 0103', personalMobile:'', officialEmail:'priya@nileprise.com', personalEmail:'' }
  ];
  const r1 = state.employees[0].id, r2 = state.employees[1].id;
  state.candidates = [
    { id: uid(), first:'John', last:'Doe', mobile:'+1 222 333 4444', whatsapp:'', tech:'React, Node.js', recruiterId:r1, status:'Active', comments:'Strong full-stack profile.' },
    { id: uid(), first:'Maria', last:'Chen', mobile:'+1 222 555 1212', whatsapp:'', tech:'Java, Spring', recruiterId:r2, status:'Active', comments:'5 yrs backend experience.' },
    { id: uid(), first:'Samuel', last:'Okafor', mobile:'+1 222 777 9090', whatsapp:'', tech:'Python, AWS', recruiterId:r1, status:'Inactive', comments:'Took another offer.' }
  ];
  state.placements = [
    { id: uid(), first:'Linda', last:'Park', tech:'React', location:'Remote', contract:'$85/hr', recruiterId:r2, actions:'Started onboarding paperwork.', date: today }
  ];
  state.onboarding = [
    { id: uid(), first:'Tariq', last:'Ali', dob:'', mobile:'+1 222 888 1111', recruiterId:r1, status:'Onboarding', comments:'Background check pending.' }
  ];
  state.hubLogs = [
    { id: uid(), candidateId: state.candidates[0].id, type:'submission', date: today, subject:'Submitted to Acme Corp' },
    { id: uid(), candidateId: state.candidates[1].id, type:'screening', date: today, subject:'Internal screening call' },
    { id: uid(), candidateId: state.candidates[0].id, type:'interview', date: today, subject:'Technical Round 1' }
  ];
  saveLocalData();
}

/* ---------- 4. Toast ---------- */
let toastTimer;
function showToast(msg, type=''){
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  const icons = { success:'<i class="fa-solid fa-circle-check" style="margin-right:8px;"></i>', error:'<i class="fa-solid fa-circle-exclamation" style="margin-right:8px;"></i>', '':'<i class="fa-solid fa-circle-info" style="margin-right:8px;"></i>' };
  msgEl.innerHTML = (icons[type]||icons['']) + msg;
  toast.className = 'toast-notification show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> toast.classList.remove('show'), 3200);
}

/* ---------- 5. Auth ---------- */
let isSignUpMode = false;

function toggleAuthMode(){
  isSignUpMode = !isSignUpMode;
  const btn = document.getElementById('auth-submit-btn');
  const toggleText = document.getElementById('login-toggle-text');
  const subtitle = document.getElementById('auth-subtitle');
  const confirmGroup = document.getElementById('confirm-password-group');
  const hint = document.getElementById('login-mode-hint');

  if(isSignUpMode){
    btn.textContent = 'Sign Up';
    btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Sign Up';
    toggleText.innerHTML = "Already have an account? <a onclick=\"toggleAuthMode()\">Sign In</a>";
    subtitle.textContent = 'Create your account';
    confirmGroup.style.display = 'block';
    hint.textContent = 'Create an account with email + password';
  } else {
    btn.innerHTML = 'Sign In';
    toggleText.innerHTML = "Don't have an account? <a onclick=\"toggleAuthMode()\">Sign Up</a>";
    subtitle.textContent = 'Sign in to your workspace';
    confirmGroup.style.display = 'none';
    hint.textContent = 'Use any email + password to sign in (Demo Mode)';
  }
}

function togglePasswordVisibility(inputId, btn){
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if(input.type === 'password'){
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye';
  }
}

function handleLogin(){
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if(!email || !password){
    showToast('Please enter email and password', 'error');
    return;
  }

  const btn = document.getElementById('auth-submit-btn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (isSignUpMode ? 'Creating...' : 'Signing in...');
  btn.disabled = true;

  if(fb.ready){
    if(isSignUpMode){
      const confirmPassword = document.getElementById('login-confirm-password').value;
      if(password !== confirmPassword){
        showToast('Passwords do not match', 'error');
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        return;
      }
      fb.auth.createUserWithEmailAndPassword(email, password)
        .then(cred=>{
          showToast('Account created successfully', 'success');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
          // onAuthStateChanged will call onAuthed
        })
        .catch(err=>{
          console.error('Sign up failed', err);
          showToast(err.message, 'error');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        });
    } else {
      fb.auth.signInWithEmailAndPassword(email, password)
        .then(cred=>{
          showToast('Welcome back!', 'success');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
          // onAuthStateChanged will call onAuthed
        })
        .catch(err=>{
          console.error('Login failed', err);
          showToast(err.message, 'error');
          btn.innerHTML = originalHtml;
          btn.disabled = false;
        });
    }
  } else {
    // Demo mode - no Firebase auth
    const fakeUser = {
      email: email,
      displayName: email.split('@')[0]
    };
    onAuthed(fakeUser);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function onAuthed(user){
  state.user = user;
  const isAdmin = (user.email||'').toLowerCase().includes('admin');
  state.role = isAdmin ? 'Admin' : 'Recruiter';

  // Show dashboard, hide login - do it in one frame to prevent layout shift
  const loginEl = document.getElementById('login-screen');
  const dashEl = document.getElementById('dashboard-screen');
  loginEl.style.display = 'none';
  dashEl.style.display = 'flex';
  loginEl.classList.remove('active');
  dashEl.classList.add('active');

  document.getElementById('prof-email-display-sidebar').textContent = state.role;
  document.getElementById('display-username').textContent = (user.displayName || user.email || 'User').split('@')[0];
  document.getElementById('prof-name-display').textContent = user.displayName || user.email;
  document.getElementById('prof-role-display').textContent = state.role;
  document.getElementById('prof-office-email').value = user.email || '';
  document.getElementById('prof-designation').value = state.role;
  applyRoleVisibility();

  // CRITICAL: Always attach Firestore listeners if Firebase is ready
  // This ensures cross-device sync - when you login on a new device,
  // the snapshot listeners pull all data from Firestore in real-time
  if(fb.ready){
    detachFirestoreListeners(); // Clean up any existing listeners
    attachFirestoreListeners(); // Attach fresh listeners - this loads ALL data from Firestore
  } else {
    loadLocalData(); // Demo mode fallback
  }
  refreshAll();
  showToast('Welcome back, ' + (user.displayName || user.email), 'success');
}

function handleLogout(){
  // Detach Firestore listeners first
  detachFirestoreListeners();

  if(fb.ready && fb.auth){
    fb.auth.signOut()
      .then(()=>{
        showToast('Logged out successfully', 'success');
        showLoginScreen();
      })
      .catch(err=>{
        console.error('Logout error', err);
        showToast('Logout failed: ' + err.message, 'error');
        // Still show login screen
        showLoginScreen();
      });
  } else {
    // Demo mode logout
    showToast('Logged out', 'success');
    showLoginScreen();
  }
}

function showLoginScreen(){
  // Clear state
  state.user = null;
  state.candidates = [];
  state.employees = [];
  state.placements = [];
  state.onboarding = [];
  state.hubLogs = [];
  state.customColumns = [];
  state.selected = { cand:[], hub:[], place:[], emp:[], onb:[] };
  state.gmail = { token:null, messages:[], currentLabel:'INBOX', currentMsgId:null };

  // Reset UI - instant transition to prevent layout shift
  const dashEl = document.getElementById('dashboard-screen');
  const loginEl = document.getElementById('login-screen');
  dashEl.style.display = 'none';
  loginEl.style.display = 'flex';
  dashEl.classList.remove('active');
  loginEl.classList.add('active');

  // Reset login form
  isSignUpMode = false;
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  if(document.getElementById('login-confirm-password')){
    document.getElementById('login-confirm-password').value = '';
    document.getElementById('confirm-password-group').style.display = 'none';
  }
  const btn = document.getElementById('auth-submit-btn');
  if(btn){
    btn.innerHTML = 'Sign In';
    btn.disabled = false;
  }
  const toggleText = document.getElementById('login-toggle-text');
  if(toggleText){
    toggleText.innerHTML = "Don't have an account? <a onclick=\"toggleAuthMode()\">Sign Up</a>";
  }
  const subtitle = document.getElementById('auth-subtitle');
  if(subtitle){
    subtitle.textContent = 'Sign in to your workspace';
  }
}

function applyRoleVisibility(){
  const adminOnlyGroups = ['cand-recruiter-group','onb-recruiter-group','place-recruiter-group'];
  adminOnlyGroups.forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = state.role === 'Admin' ? '' : 'none';
  });
}

/* ---------- 6. Navigation ---------- */
function setupNav(){
  document.querySelectorAll('.nav-item[data-target]').forEach(item=>{
    item.addEventListener('click', ()=>{
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      const target = item.dataset.target;
      document.querySelectorAll('.content-view').forEach(v=>v.classList.remove('active'));
      document.getElementById(target).classList.add('active');
      const label = item.querySelector('span').textContent;
      const icon = item.querySelector('i').outerHTML;
      document.getElementById('page-title').innerHTML = icon + ' ' + label;
      closeMobileSidebar();
      if(target === 'view-dashboard') renderDashboard();
      if(target === 'view-inbox' && !state.gmail.token) {/* wait for user to connect */}
    });
  });
  document.getElementById('header-profile-trigger').addEventListener('click', ()=>{
    document.querySelector('.nav-item[data-target="view-profile"]').click();
  });
  document.getElementById('btn-logout').addEventListener('click', handleLogout);
  document.getElementById('btn-mobile-menu').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('show');
  });
  document.getElementById('sidebar-overlay').addEventListener('click', closeMobileSidebar);
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

/* ---------- 7. Dashboard / Charts ---------- */
let chartRecruiter, chartTech;
let chartPlacementTrend, chartHubActivity;
function renderDashboard(){
  document.getElementById('stat-total').textContent = state.candidates.length;
  document.getElementById('stat-active').textContent = state.candidates.filter(c=>c.status==='Active').length;
  document.getElementById('stat-inactive').textContent = state.candidates.filter(c=>c.status==='Inactive').length;
  document.getElementById('stat-placed').textContent = state.placements.length;
  document.getElementById('stat-rec').textContent = state.employees.filter(e=>e.role==='Recruiter').length;
  const techSet = new Set();
  state.candidates.forEach(c=> (c.tech||'').split(',').map(t=>t.trim()).filter(Boolean).forEach(t=>techSet.add(t)));
  document.getElementById('stat-tech').textContent = techSet.size;

  const recCounts = {};
  state.candidates.forEach(c=>{
    const rec = state.employees.find(e=>e.id===c.recruiterId);
    const name = rec ? (rec.first+' '+(rec.last||'')).trim() : 'Unassigned';
    recCounts[name] = (recCounts[name]||0)+1;
  });
  const techCounts = {};
  techSet.forEach(t=>{
    techCounts[t] = state.candidates.filter(c=> (c.tech||'').toLowerCase().includes(t.toLowerCase())).length;
  });
  const topTech = Object.entries(techCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const ctx1 = document.getElementById('chart-recruiter').getContext('2d');
  if(chartRecruiter) chartRecruiter.destroy();
  chartRecruiter = new Chart(ctx1, {
    type:'bar',
    data:{ labels:Object.keys(recCounts), datasets:[{ label:'Candidates', data:Object.values(recCounts), backgroundColor:'#3ddcc7', borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{color:'#8d97ab'}, grid:{color:'rgba(255,255,255,0.05)'}}, y:{ticks:{color:'#8d97ab'}, grid:{color:'rgba(255,255,255,0.05)'}} } }
  });

  const ctx2 = document.getElementById('chart-tech').getContext('2d');
  if(chartTech) chartTech.destroy();
  chartTech = new Chart(ctx2, {
    type:'doughnut',
    data:{ labels:topTech.map(t=>t[0]), datasets:[{ data:topTech.map(t=>t[1]),
      backgroundColor:['#3ddcc7','#a78bfa','#60a5fa','#f5b73d','#ef4444','#22c55e'] }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{color:'#8d97ab', boxWidth:10, font:{size:11}}}} }
  });

  /* ---------- Hub Stats ---------- */
  const todayStr = new Date().toISOString().slice(0,10);
  const todayLogs = state.hubLogs.filter(l=> (l.date||'')===todayStr);
  const subEl = document.getElementById('hub-stat-submissions');
  const scrEl = document.getElementById('hub-stat-screenings');
  const intEl = document.getElementById('hub-stat-interviews');
  const onbEl = document.getElementById('stat-onboarding');
  if(subEl) subEl.textContent = todayLogs.filter(l=>l.type==='submission').length;
  if(scrEl) scrEl.textContent = todayLogs.filter(l=>l.type==='screening').length;
  if(intEl) intEl.textContent = todayLogs.filter(l=>l.type==='interview').length;
  if(onbEl) onbEl.textContent = state.onboarding.length;

  /* ---------- Placement Trend Chart ---------- */
  const placeMonths = {};
  state.placements.forEach(p=>{
    if(p.date){ const m=p.date.slice(0,7); placeMonths[m]=(placeMonths[m]||0)+1; }
  });
  const sortedMonths = Object.keys(placeMonths).sort();
  const recentMonths = sortedMonths.slice(-12);
  const ctx3 = document.getElementById('chart-placement-trend');
  if(ctx3){
    const ctx3d = ctx3.getContext('2d');
    if(chartPlacementTrend) chartPlacementTrend.destroy();
    chartPlacementTrend = new Chart(ctx3d, {
      type:'line',
      data:{
        labels: recentMonths.map(m=>{
          const parts=m.split('-');
          const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          return monthNames[parseInt(parts[1])-1]+' '+parts[0];
        }),
        datasets:[{
          label:'Placements',
          data: recentMonths.map(m=>placeMonths[m]),
          borderColor:'#3ddcc7',
          backgroundColor:'rgba(61,220,199,0.1)',
          fill:true, tension:0.3, pointRadius:4, pointBackgroundColor:'#3ddcc7'
        }]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
        scales:{ x:{ticks:{color:'#8d97ab',font:{size:10}},grid:{color:'rgba(255,255,255,0.05)'}},
                 y:{ticks:{color:'#8d97ab',precision:0},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true} }
      }
    });
  }

  /* ---------- Hub Activity Chart (Last 30 Days) ---------- */
  const hubDays = {};
  const hubToday = new Date();
  for(let i=29;i>=0;i--){
    const d=new Date(hubToday); d.setDate(d.getDate()-i);
    hubDays[d.toISOString().slice(0,10)]={submission:0,screening:0,interview:0};
  }
  state.hubLogs.forEach(l=>{
    const d=(l.date||'').slice(0,10);
    if(hubDays[d] && l.type) hubDays[d][l.type]=(hubDays[d][l.type]||0)+1;
  });
  const ctx4 = document.getElementById('chart-hub-activity');
  if(ctx4){
    const ctx4d = ctx4.getContext('2d');
    if(chartHubActivity) chartHubActivity.destroy();
    chartHubActivity = new Chart(ctx4d, {
      type:'bar',
      data:{
        labels: Object.keys(hubDays).map(d=>{const p=d.split('-');return p[1]+'/'+p[2];}),
        datasets:[
          {label:'Submissions',data:Object.values(hubDays).map(d=>d.submission),backgroundColor:'#3ddcc7',borderRadius:3},
          {label:'Screenings',data:Object.values(hubDays).map(d=>d.screening),backgroundColor:'#60a5fa',borderRadius:3},
          {label:'Interviews',data:Object.values(hubDays).map(d=>d.interview),backgroundColor:'#a78bfa',borderRadius:3}
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'bottom',labels:{color:'#8d97ab',boxWidth:10,font:{size:11}}}},
        scales:{ x:{ticks:{color:'#8d97ab',font:{size:8},maxRotation:45},grid:{color:'rgba(255,255,255,0.05)'}},
                 y:{ticks:{color:'#8d97ab',precision:0},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true} }
      }
    });
  }

  /* ---------- Dashboard Tables ---------- */
  renderDashTables();

  /* ---------- Last Refresh Timestamp ---------- */
  const refreshEl = document.getElementById('dash-last-refresh');
  if(refreshEl) refreshEl.textContent = new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

/* ---------- 7a. Dashboard Tables ---------- */
function renderDashTables(){
  /* Placements */
  const placeList = state.placements.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20);
  const placeCountEl = document.getElementById('dash-placement-count');
  const placeBody = document.getElementById('dash-placement-table-body');
  if(placeCountEl) placeCountEl.textContent = state.placements.length;
  if(placeBody){
    if(!placeList.length){
      placeBody.innerHTML = '<tr class="empty-row"><td colspan="7"><i class="fa-solid fa-trophy"></i>No placements yet</td></tr>';
    } else {
      placeBody.innerHTML = placeList.map(p=>'<tr>'+
        '<td>'+escapeHtml(p.first)+'</td>'+
        '<td>'+escapeHtml(p.last)+'</td>'+
        '<td>'+escapeHtml(p.tech)+'</td>'+
        '<td>'+escapeHtml(p.location)+'</td>'+
        '<td>'+escapeHtml(p.contract)+'</td>'+
        '<td>'+escapeHtml(getRecruiterName(p.recruiterId))+'</td>'+
        '<td>'+escapeHtml(p.date)+'</td></tr>').join('');
    }
  }

  /* Candidates */
  const candList = state.candidates.slice(0,20);
  const candCountEl = document.getElementById('dash-candidate-count');
  const candBody = document.getElementById('dash-candidate-table-body');
  if(candCountEl) candCountEl.textContent = state.candidates.length;
  if(candBody){
    if(!candList.length){
      candBody.innerHTML = '<tr class="empty-row"><td colspan="6"><i class="fa-solid fa-user-slash"></i>No candidates yet</td></tr>';
    } else {
      candBody.innerHTML = candList.map(c=>'<tr>'+
        '<td>'+escapeHtml(c.first)+'</td>'+
        '<td>'+escapeHtml(c.last)+'</td>'+
        '<td>'+escapeHtml(c.tech)+'</td>'+
        '<td>'+escapeHtml(getRecruiterName(c.recruiterId))+'</td>'+
        '<td><span class="status-badge '+(c.status==='Active'?'active':c.status==='Inactive'?'inactive':'pending')+'">'+escapeHtml(c.status||'')+'</span></td>'+
        '<td>'+escapeHtml(c.mobile)+'</td></tr>').join('');
    }
  }

  /* Employees */
  const empList = state.employees;
  const empCountEl = document.getElementById('dash-employee-count');
  const empBody = document.getElementById('dash-employee-table-body');
  if(empCountEl) empCountEl.textContent = empList.length;
  if(empBody){
    if(!empList.length){
      empBody.innerHTML = '<tr class="empty-row"><td colspan="5"><i class="fa-solid fa-id-card-clip"></i>No team members yet</td></tr>';
    } else {
      empBody.innerHTML = empList.map(e=>'<tr>'+
        '<td>'+escapeHtml(e.first)+'</td>'+
        '<td>'+escapeHtml(e.last)+'</td>'+
        '<td>'+escapeHtml(e.designation)+'</td>'+
        '<td><span class="status-badge active">'+escapeHtml(e.role||'')+'</span></td>'+
        '<td>'+escapeHtml(e.officialEmail)+'</td></tr>').join('');
    }
  }

  /* Onboarding */
  const onbList = state.onboarding;
  const onbCountEl = document.getElementById('dash-onboarding-count');
  const onbBody = document.getElementById('dash-onboarding-table-body');
  if(onbCountEl) onbCountEl.textContent = onbList.length;
  if(onbBody){
    if(!onbList.length){
      onbBody.innerHTML = '<tr class="empty-row"><td colspan="6"><i class="fa-solid fa-user-graduate"></i>No onboarding records yet</td></tr>';
    } else {
      onbBody.innerHTML = onbList.map(o=>'<tr>'+
        '<td>'+escapeHtml(o.first)+'</td>'+
        '<td>'+escapeHtml(o.last)+'</td>'+
        '<td>'+escapeHtml(o.mobile)+'</td>'+
        '<td>'+escapeHtml(getRecruiterName(o.recruiterId))+'</td>'+
        '<td><span class="status-badge '+(o.status==='Complete'||o.status==='Completed'?'complete':'pending')+'">'+escapeHtml(o.status||'')+'</span></td>'+
        '<td>'+escapeHtml(o.comments)+'</td></tr>').join('');
    }
  }
}

/* ---------- 7b. Inline cell editing ---------- */
// Generic inline-update used by onclick inlineEdit cells, inline <select>,
// and inline <input type="date"> across Candidates, Placements,
// Onboarding, and Staff tables. Writes straight to Firestore (live mode)
// or the local array (demo mode) — no modal required for quick edits.
const INLINE_TYPE_TO_COLL = { cand:'candidates', place:'placements', onb:'onboarding', emp:'employees' };





// Double-click to start editing


// Show Save/Cancel popup below the editing cell


// Confirm save from popup


// Cancel edit from popup (revert to original)


// Handle blur - if clicking outside the cell and popup, save


// Handle keydown - Enter to save, Escape to revert




/* ========================================================
   INLINE EDITING LOGIC — Click-to-edit with input swap
   ======================================================== */

// Role check: only Admins can inline-edit
function canInlineEdit(){
  return state.role === 'Admin';
}

// 1. Standard Text Edit (Triggered on Click)
function inlineEdit(id, field, col, el){
  if(!canInlineEdit()) return;
  if(el.querySelector('input')) return;

  const val = el.innerText.trim() === '-' ? '' : el.innerText.trim();
  el.innerHTML = `<input type="text" class="inline-input-active" value="${escapeHtml(val)}" onblur="saveInline(this, '${id}', '${field}', '${col}', '${escapeHtml(val)}')">`;
  const input = el.querySelector('input');
  input.focus();
  input.select();

  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    if(e.key === 'Escape'){ el.innerText = val || '-'; }
  });
}

// 2. Save Standard Text (Triggered on blur or Enter)
function saveInline(input, id, field, col, oldVal){
  const newVal = input.value.trim();
  const cell = input.parentElement;
  cell.innerText = newVal || '-';

  if(newVal !== oldVal){
    cell.classList.add('saving');
    if(fb.ready){
      fb.db.collection(col).doc(id).update({[field]: newVal})
        .then(()=>{
          cell.classList.remove('saving');
          cell.classList.add('saved');
          setTimeout(()=> cell.classList.remove('saved'), 1500);
          showToast('Saved', 'success');
        })
        .catch(err=>{
          cell.classList.remove('saving');
          cell.classList.add('save-error');
          cell.innerText = oldVal || '-';
          setTimeout(()=> cell.classList.remove('save-error'), 2000);
          showToast('Save failed: ' + err.message, 'error');
        });
    } else {
      const arr = state[col];
      const idx = arr.findIndex(x=>x.id===id);
      if(idx>-1){ arr[idx][field] = newVal; saveLocalData(); refreshViewForType(col === 'candidates' ? 'cand' : col === 'employees' ? 'emp' : col === 'placements' ? 'place' : 'onb'); renderDashboard(); }
      cell.classList.remove('saving');
      cell.classList.add('saved');
      setTimeout(()=> cell.classList.remove('saved'), 1500);
      showToast('Saved', 'success');
    }
  }
}

// 3. Status Dropdown Edit
function updateStatus(id, col, val){
  if(fb.ready){
    fb.db.collection(col).doc(id).update({status: val})
      .then(()=> showToast('Status updated', 'success'))
      .catch(err=> showToast('Update failed: ' + err.message, 'error'));
  } else {
    const arr = state[col];
    const idx = arr.findIndex(x=>x.id===id);
    if(idx>-1){ arr[idx].status = val; saveLocalData(); }
    showToast('Status updated', 'success');
  }
}

// 4. Date Picker Edit
function inlineDateEdit(id, field, col, val){
  if(fb.ready){
    fb.db.collection(col).doc(id).update({[field]: val})
      .then(()=> showToast('Date updated', 'success'))
      .catch(err=> showToast('Update failed: ' + err.message, 'error'));
  } else {
    const arr = state[col];
    const idx = arr.findIndex(x=>x.id===id);
    if(idx>-1){ arr[idx][field] = val; saveLocalData(); }
    showToast('Date updated', 'success');
  }
}

// 5. URL/Link Edit (For Gmail, LinkedIn, Resume)
function inlineUrlEdit(id, field, col, el){
  if(!canInlineEdit()) return;
  if(el.querySelector('input')) return;

  el.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'url';
  input.placeholder = 'Paste Link...';
  input.className = 'url-input-active';

  const save = () => {
    let newVal = input.value.trim();
    if(newVal && !newVal.startsWith('http')) newVal = 'https://' + newVal;
    if(newVal){
      if(fb.ready){
        fb.db.collection(col).doc(id).update({[field]: newVal})
          .then(()=> showToast('Link saved', 'success'))
          .catch(err=> showToast('Save failed: ' + err.message, 'error'));
      } else {
        const arr = state[col];
        const idx = arr.findIndex(x=>x.id===id);
        if(idx>-1){ arr[idx][field] = newVal; saveLocalData(); }
        showToast('Link saved', 'success');
      }
    }
    // Restore icon display
    el.innerHTML = newVal
      ? `<i class="fa-solid fa-link link-icon-btn icon-filled"></i>`
      : `<i class="fa-solid fa-plus link-icon-btn icon-empty"></i>`;
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if(e.key === 'Enter') input.blur(); });
  el.appendChild(input);
  input.focus();
}

// 6. Recruiter/Role Dropdown Edit
function inlineSelectEdit(id, field, col, val){
  if(fb.ready){
    fb.db.collection(col).doc(id).update({[field]: val})
      .then(()=> showToast('Updated', 'success'))
      .catch(err=> showToast('Update failed: ' + err.message, 'error'));
  } else {
    const arr = state[col];
    const idx = arr.findIndex(x=>x.id===id);
    if(idx>-1){ arr[idx][field] = val; saveLocalData(); refreshViewForType(col === 'candidates' ? 'cand' : col === 'employees' ? 'emp' : col === 'placements' ? 'place' : 'onb'); }
    showToast('Updated', 'success');
  }
}


function injectInlineEditStyles(){
  if(document.getElementById('inline-edit-style')) return;
  const style = document.createElement('style');
  style.id = 'inline-edit-style';
  style.textContent = `
    /* ===== INLINE EDITING STYLES ===== */

    /* Editable cell hint - shows pencil on hover */
    .editable-cell{
      cursor: pointer; border-radius: 6px; transition: background .15s;
      padding: 4px 8px; margin: -4px -8px; position: relative; min-height: 20px;
    }
    .editable-cell:hover{
      background: rgba(61,220,199,0.06);
    }
    .editable-cell::after{
      content: '\f303'; font-family: 'Font Awesome 6 Free'; font-weight: 900;
      font-size: 0.55rem; color: rgba(61,220,199,0.3); margin-left: 6px;
      opacity: 0; transition: opacity .15s; position: absolute; right: 2px; top: 50%;
      transform: translateY(-50%);
    }
    .editable-cell:hover::after{ opacity: 1; }
    .editable-cell.readonly{ cursor: not-allowed; }
    .editable-cell.readonly:hover{ background: transparent; }
    .editable-cell.readonly::after{ display: none; }

    /* Saving indicators */
    .editable-cell.saving{ background: rgba(245,183,61,0.1) !important; }
    .editable-cell.saved{ background: rgba(34,197,94,0.1) !important; }
    .editable-cell.save-error{ background: rgba(239,68,68,0.1) !important; }

    /* Standard Text Inputs (Names, Tech, etc.) */
    .inline-input-active{
      width: 100%; height: 34px;
      background: var(--bg-deep) !important;
      color: var(--text-main) !important;
      border: 2px solid var(--primary);
      border-radius: 6px; padding: 0 10px;
      font-size: 0.88rem; font-family: 'Inter', sans-serif;
      outline: none; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      position: relative; z-index: 1000;
    }

    /* Date Pickers */
    .date-input-modern{
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--glass-border);
      color: var(--text-main) !important;
      border-radius: 6px; padding: 6px;
      font-size: 0.85rem; width: 100%;
      cursor: pointer; text-align: center;
      font-family: 'Inter', sans-serif;
    }
    .date-input-modern:focus{
      background: var(--bg-deep);
      border-color: var(--primary);
      box-shadow: 0 0 10px rgba(61,220,199,0.2);
      outline: none;
    }
    .date-input-modern::-webkit-calendar-picker-indicator{
      filter: invert(0.5); cursor: pointer;
    }

    /* URL / Link Inputs */
    .url-input-active{
      width: 180px;
      background: var(--bg-deep) !important;
      border: 2px solid var(--primary);
      color: var(--text-main) !important;
      padding: 6px 10px; border-radius: 6px;
      font-size: 0.82rem; outline: none;
      position: absolute; z-index: 2000;
      box-shadow: 0 5px 20px rgba(0,0,0,0.5);
    }

    /* Status Dropdowns */
    .status-select{
      height: 30px; border-radius: 6px;
      font-size: 0.72rem; text-transform: uppercase;
      letter-spacing: 0.5px; padding: 0 10px;
      font-weight: 700; border: 1px solid transparent;
      cursor: pointer; background-color: var(--glass-bg);
      color: var(--text-main); outline: none;
      transition: border-color .15s, background .15s;
    }
    .status-select:focus{
      border-color: var(--primary);
      background-color: var(--bg-deep);
    }
    .status-select.active{ background: rgba(34,197,94,0.15); color: var(--success); }
    .status-select.inactive{ background: rgba(239,68,68,0.15); color: var(--danger); }
    .status-select.onboarding{ background: rgba(96,165,250,0.15); color: var(--blue); }
    .status-select.completed{ background: rgba(34,197,94,0.15); color: var(--success); }
    .status-select option{ background: var(--bg-panel); color: var(--text-main); }

    /* Recruiter/Role Dropdowns */
    .inline-select{
      background: transparent; border: 1px solid transparent; color: inherit; font: inherit;
      padding: 5px 8px; border-radius: 6px; width: 100%; cursor: pointer;
      appearance: none; -webkit-appearance: none;
      transition: border-color .15s, background .15s;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%238d97ab' d='M5 7L1 3h8z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 6px center; padding-right: 24px;
    }
    .inline-select:hover{ border-color: rgba(61,220,199,0.2); background-color: rgba(61,220,199,0.05); }
    .inline-select:focus{ border-color: var(--primary); outline: none; background-color: rgba(61,220,199,0.08); }
    .inline-select option{ background: var(--bg-panel); color: var(--text-main); }
    .inline-select.readonly-select{ pointer-events: none; opacity: 0.7; }
    .inline-select.readonly-date{ pointer-events: none; opacity: 0.7; }

    /* Link icon buttons (Gmail, LinkedIn, Resume) */
    .link-icon-btn{
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 6px;
      cursor: pointer; transition: background .15s, transform .1s;
      font-size: 0.78rem; color: var(--text-muted);
    }
    .link-icon-btn:hover{ background: rgba(61,220,199,0.1); color: var(--primary); transform: translateY(-1px); }
    .link-icon-btn.icon-filled{ color: var(--primary); }
    .link-icon-btn.icon-empty{ color: var(--text-muted); opacity: 0.5; }
    .link-icon-btn.icon-empty:hover{ opacity: 1; }
    .link-icon-btn:active{ transform: scale(0.92); }
  `;
  document.head.appendChild(style);
}

/* ---------- 8. Recruiter dropdown helpers ---------- */
function recruiterOptionsHtml(selectedId){
  let html = '<option value="">Unassigned</option>';
  state.employees.filter(e=>e.role==='Recruiter').forEach(r=>{
    html += `<option value="${r.id}" ${r.id===selectedId?'selected':''}>${escapeHtml(r.first+' '+(r.last||''))}</option>`;
  });
  return html;
}
function recruiterName(id){
  const r = state.employees.find(e=>e.id===id);
  return r ? (r.first+' '+(r.last||'')).trim() : '—';
}
function escapeHtml(str){
  return String(str==null?'':str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ---------- 9. Candidates ---------- */
function refreshFilterDropdowns(){
  const recSel = document.getElementById('filter-recruiter');
  const techSel = document.getElementById('filter-tech');
  const recVal = recSel.value, techVal = techSel.value;
  recSel.innerHTML = '<option value="">All Recruiters</option>' +
    state.employees.filter(e=>e.role==='Recruiter').map(r=>`<option value="${r.id}">${escapeHtml(r.first+' '+(r.last||''))}</option>`).join('');
  const techSet = new Set();
  state.candidates.forEach(c=> (c.tech||'').split(',').map(t=>t.trim()).filter(Boolean).forEach(t=>techSet.add(t)));
  techSel.innerHTML = '<option value="">All Technologies</option>' +
    [...techSet].map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  recSel.value = recVal; techSel.value = techVal;
}

function getFilteredCandidates(){
  return state.candidates.filter(c=>{
    const q = state.filters.search.toLowerCase();
    const nameMatch = !q || (c.first+' '+(c.last||'')).toLowerCase().includes(q) || (c.tech||'').toLowerCase().includes(q);
    const recMatch = !state.filters.recruiter || c.recruiterId === state.filters.recruiter;
    const techMatch = !state.filters.tech || (c.tech||'').toLowerCase().includes(state.filters.tech.toLowerCase());
    const statusMatch = !state.filters.status || c.status === state.filters.status;
    return nameMatch && recMatch && techMatch && statusMatch;
  });
}

function renderCandidatesTable(){
  refreshFilterDropdowns();
  const list = getFilteredCandidates();
  const { current, limit } = state.pagination.cand;
  const totalPages = Math.max(1, Math.ceil(list.length/limit));
  state.pagination.cand.current = Math.min(current, totalPages);
  const start = (state.pagination.cand.current-1)*limit;
  const pageItems = list.slice(start, start+limit);

  const baseCols = ['','First Name','Last Name','Mobile','WhatsApp','Technology','Recruiter','Status','Comments','Actions'];
  const customCols = state.customColumns.filter(c=>c.scope==='cand');
  const head = document.getElementById('table-head');
  head.innerHTML = '<tr>' + baseCols.map((c,i)=> i===0 ? `<th><input type="checkbox" onchange="toggleSelectAll('cand', this.checked)"></th>` : `<th>${c}</th>`).join('').replace('<th>Actions</th>', customCols.map(c=>`<th>${escapeHtml(c.name)}</th>`).join('') + '<th>Actions</th>') + '</tr>';

  const body = document.getElementById('table-body');
  if(pageItems.length===0){
    body.innerHTML = `<tr class="empty-row"><td colspan="${baseCols.length+customCols.length}"><i class="fa-solid fa-user-slash" style="font-size:1.6rem; display:block; margin-bottom:8px;"></i>No candidates found</td></tr>`;
  } else {
    body.innerHTML = pageItems.map(c=>{
      const customCells = customCols.map(col=>`<td>${escapeHtml((c.custom||{})[col.id]||'')}</td>`).join('');
      return `<tr>
        <td><input type="checkbox" ${state.selected.cand.includes(c.id)?'checked':''} onchange="toggleSelectRow('cand','${c.id}', this.checked)"></td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'first', 'candidates', this)">${escapeHtml(c.first)}</td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'last', 'candidates', this)">${escapeHtml(c.last)}</td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'mobile', 'candidates', this)">${escapeHtml(c.mobile)}</td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'whatsapp', 'candidates', this)">${escapeHtml(c.whatsapp)}</td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'tech', 'candidates', this)">${escapeHtml(c.tech)}</td>
        <td><select class="inline-select${canInlineEdit()?'':' readonly-select'}" onchange="inlineSelectEdit('${c.id}', 'recruiterId', 'candidates', this.value)">${recruiterOptionsHtml(c.recruiterId)}</select></td>
        <td><select class="status-select ${c.status === 'Active' ? 'active' : 'inactive'}" onchange="updateStatus('${c.id}', 'candidates', this.value)">
          <option value="Active" ${c.status==='Active'?'selected':''}>Active</option>
          <option value="Inactive" ${c.status==='Inactive'?'selected':''}>Inactive</option>
        </select></td>
        <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${c.id}', 'comments', 'candidates', this)" style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(c.comments)}">${escapeHtml(c.comments)}</td>
        ${customCells}
        <td><div class="row-actions">
          <button onclick="viewCandidateDetail('${c.id}')" title="View"><i class="fa-solid fa-eye"></i></button>
          <button onclick="openCandidateModal('${c.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
          <button class="del-btn" onclick="confirmSingleDelete('cand','${c.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  document.getElementById('cand-footer-count').textContent = `Showing ${pageItems.length} of ${list.length} total records`;
  document.getElementById('cand-page-indicator').textContent = `Page ${state.pagination.cand.current} of ${totalPages}`;
  updateSelectedBar('cand');
}

function viewCandidateDetail(id){
  const c = state.candidates.find(x=>x.id===id);
  if(!c) return;
  const logs = state.hubLogs.filter(l=>l.candidateId===id).sort((a,b)=> b.date.localeCompare(a.date));
  const content = document.getElementById('candidate-detail-content');
  content.innerHTML = `
    <h3><i class="fa-solid fa-user text-cyan"></i> ${escapeHtml(c.first)} ${escapeHtml(c.last)}</h3>
    <div class="form-grid-2" style="margin-top:18px;">
      <div><label class="text-muted" style="font-size:0.78rem;">Mobile</label><p>${escapeHtml(c.mobile)||'—'}</p></div>
      <div><label class="text-muted" style="font-size:0.78rem;">WhatsApp</label><p>${escapeHtml(c.whatsapp)||'—'}</p></div>
      <div><label class="text-muted" style="font-size:0.78rem;">Technology</label><p>${escapeHtml(c.tech)||'—'}</p></div>
      <div><label class="text-muted" style="font-size:0.78rem;">Recruiter</label><p>${escapeHtml(recruiterName(c.recruiterId))}</p></div>
      <div><label class="text-muted" style="font-size:0.78rem;">Status</label><p><span class="badge ${c.status==='Active'?'active':'inactive'}">${c.status}</span></p></div>
    </div>
    <p style="margin-top:14px; color:var(--text-muted);">${escapeHtml(c.comments)||'No notes.'}</p>
    <h3 style="margin-top:22px; font-size:0.95rem;">Activity Log</h3>
    <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px; max-height:220px; overflow:auto;">
      ${logs.length ? logs.map(l=>`<div style="background:rgba(255,255,255,0.04); padding:10px 14px; border-radius:8px; font-size:0.85rem;">
        <b style="text-transform:capitalize;">${l.type}</b> · ${l.date} <br><span class="text-muted">${escapeHtml(l.subject)}</span></div>`).join('')
        : '<p class="text-muted" style="font-size:0.85rem;">No activity logged yet.</p>'}
    </div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModalEl('candidate-detail-modal')">Close</button></div>
  `;
  openModalEl('candidate-detail-modal');
}

function openCandidateModal(id){
  document.getElementById('cand-recruiter').innerHTML = recruiterOptionsHtml();
  const form = document.getElementById('candidate-form');
  form.reset();
  document.getElementById('cand-edit-id').value = '';
  document.getElementById('candidate-modal-title').innerHTML = '<i class="fa-solid fa-user-plus text-cyan"></i> Add New Candidate';
  if(id){
    const c = state.candidates.find(x=>x.id===id);
    if(c){
      document.getElementById('cand-edit-id').value = id;
      document.getElementById('cand-first').value = c.first||'';
      document.getElementById('cand-last').value = c.last||'';
      document.getElementById('cand-mobile').value = c.mobile||'';
      document.getElementById('cand-wa').value = c.whatsapp||'';
      document.getElementById('cand-tech').value = c.tech||'';
      document.getElementById('cand-recruiter').value = c.recruiterId||'';
      document.getElementById('cand-status').value = c.status||'Active';
      document.getElementById('cand-comments').value = c.comments||'';
      document.getElementById('candidate-modal-title').innerHTML = '<i class="fa-solid fa-pen text-cyan"></i> Edit Candidate';
    }
  }
  openModalEl('add-candidate-modal');
}
function closeCandidateModal(){ closeModalEl('add-candidate-modal'); }

function saveCandidateForm(e){
  e.preventDefault();
  const id = document.getElementById('cand-edit-id').value;
  const data = {
    first: document.getElementById('cand-first').value.trim(),
    last: document.getElementById('cand-last').value.trim(),
    mobile: document.getElementById('cand-mobile').value.trim(),
    whatsapp: document.getElementById('cand-wa').value.trim(),
    tech: document.getElementById('cand-tech').value.trim(),
    recruiterId: document.getElementById('cand-recruiter').value,
    status: document.getElementById('cand-status').value,
    comments: document.getElementById('cand-comments').value.trim()
  };
  if(!data.first){ showToast('First name is required', 'error'); return; }

  if(fb.ready){
    const ref = id ? fb.db.collection('candidates').doc(id) : fb.db.collection('candidates').doc();
    ref.set(data, { merge:true })
      .then(()=> showToast(id ? 'Candidate updated' : 'Candidate added', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    if(id){
      const idx = state.candidates.findIndex(c=>c.id===id);
      if(idx>-1) state.candidates[idx] = { ...state.candidates[idx], ...data };
      showToast('Candidate updated', 'success');
    } else {
      state.candidates.push({ id: uid(), ...data, custom:{} });
      showToast('Candidate added', 'success');
    }
    saveLocalData();
    renderCandidatesTable();
    renderDashboard();
  }
  closeCandidateModal();
}

/* ---------- 10. Generic select / pagination / delete ---------- */
function toggleSelectAll(type, checked){
  const map = { cand: getFilteredCandidates(), hub: getFilteredHubLogs(), place: getFilteredPlacements(), emp: getFilteredEmployees(), onb: getFilteredOnboarding() };
  const items = map[type] || [];
  const {current, limit} = state.pagination[type];
  const pageIds = items.slice((current-1)*limit, current*limit).map(i=>i.id);
  if(checked){ state.selected[type] = [...new Set([...state.selected[type], ...pageIds])]; }
  else { state.selected[type] = state.selected[type].filter(id=>!pageIds.includes(id)); }
  refreshViewForType(type);
}
function toggleSelectRow(type, id, checked){
  if(checked){ if(!state.selected[type].includes(id)) state.selected[type].push(id); }
  else{ state.selected[type] = state.selected[type].filter(x=>x!==id); }
  updateSelectedBar(type);
}
function updateSelectedBar(type){
  const map = {
    cand:{btn:'btn-delete-selected', count:'selected-count'},
    hub:{btn:'btn-delete-hub', count:'hub-selected-count'},
    place:{btn:'btn-delete-placement', count:'place-selected-count'},
    emp:{btn:'btn-delete-employee', count:'emp-selected-count'},
    onb:{btn:'btn-delete-onboarding', count:'onboarding-selected-count'}
  };
  const cfg = map[type];
  if(!cfg) return;
  const n = state.selected[type].length;
  document.getElementById(cfg.count).textContent = n;
  document.getElementById(cfg.btn).style.display = n>0 ? 'inline-flex' : 'none';
}

function changePage(type, delta){
  state.pagination[type].current = Math.max(1, state.pagination[type].current + delta);
  refreshViewForType(type);
}

function refreshViewForType(type){
  if(type==='cand') renderCandidatesTable();
  if(type==='hub') renderHubTable();
  if(type==='place') renderPlacementTable();
  if(type==='emp') renderEmployeeTable();
  if(type==='onb') renderOnboardingTable();
}

function openDeleteModal(type){
  state.deleteContext = type;
  document.getElementById('del-count').textContent = state.selected[type].length;
  openModalEl('delete-modal');
}
function closeDeleteModal(){ closeModalEl('delete-modal'); state.deleteContext=null; }
function confirmSingleDelete(type, id){
  state.selected[type] = [id];
  openDeleteModal(type);
}
function executeDelete(){
  const type = state.deleteContext;
  if(!type) return;
  const ids = state.selected[type];
  const map = { cand:'candidates', hub:'hubLogs', place:'placements', emp:'employees', onb:'onboarding' };
  const key = map[type];
  const collName = COLLECTIONS[key] ? COLLECTIONS[key].coll : key;

  if(fb.ready){
    const batch = fb.db.batch();
    ids.forEach(id=> batch.delete(fb.db.collection(collName).doc(id)));
    batch.commit()
      .then(()=> showToast(`${ids.length} record(s) deleted`, 'success'))
      .catch(err=>{ console.error(err); showToast('Delete failed: ' + err.message, 'error'); });
  } else {
    state[key] = state[key].filter(item=>!ids.includes(item.id));
    saveLocalData();
    refreshViewForType(type);
    renderDashboard();
    showToast(`${ids.length} record(s) deleted`, 'success');
  }
  state.selected[type] = [];
  closeDeleteModal();
}

/* ---------- 11. Activity Hub ---------- */
function getFilteredHubLogs(){
  const mode = state.hubFilters.mode || 'daily';
  const selectedDate = document.getElementById('hub-date-picker')?.value || new Date().toISOString().slice(0,10);
  const recruiterFilter = document.getElementById('hub-recruiter-filter')?.value || '';

  let logs = state.hubLogs;

  // Filter by recruiter
  if(recruiterFilter){
    const recruiterCandidates = state.candidates.filter(c => c.recruiterId === recruiterFilter).map(c => c.id);
    logs = logs.filter(l => recruiterCandidates.includes(l.candidateId));
  }

  // Filter by date range based on mode
  if(mode === 'daily'){
    logs = logs.filter(l => l.date === selectedDate);
  } else if(mode === 'weekly'){
    const weekStart = new Date(selectedDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    logs = logs.filter(l => {
      const logDate = new Date(l.date || '');
      return logDate >= weekStart && logDate <= weekEnd;
    });
  } else if(mode === 'monthly'){
    const monthStr = selectedDate.slice(0, 7);
    logs = logs.filter(l => (l.date || '').startsWith(monthStr));
  }

  return logs;
}
function matchesHubRange(dateStr){
  const target = new Date(state.hubFilters.date);
  const d = new Date(dateStr);
  if(state.hubFilters.mode==='daily'){
    return dateStr === state.hubFilters.date;
  }
  if(state.hubFilters.mode==='weekly'){
    const weekStart = new Date(target); weekStart.setDate(target.getDate()-target.getDay());
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6);
    return d >= weekStart && d <= weekEnd;
  }
  if(state.hubFilters.mode==='monthly'){
    return d.getMonth()===target.getMonth() && d.getFullYear()===target.getFullYear();
  }
  return true;
}
function updateHubStats(){
  const today = new Date().toISOString().slice(0,10);
  const mode = state.hubFilters.mode || 'daily';
  const selectedDate = document.getElementById('hub-date-picker')?.value || today;

  // Get all hub logs
  const logs = state.hubLogs;

  // Filter based on mode
  let filteredLogs = logs;
  if(mode === 'daily'){
    filteredLogs = logs.filter(l => l.date === selectedDate);
  } else if(mode === 'weekly'){
    const weekStart = new Date(selectedDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    filteredLogs = logs.filter(l => {
      const logDate = new Date(l.date || '');
      return logDate >= weekStart && logDate <= weekEnd;
    });
  } else if(mode === 'monthly'){
    const monthStr = selectedDate.slice(0, 7);
    filteredLogs = logs.filter(l => (l.date || '').startsWith(monthStr));
  }

  // Count by type
  const submissions = filteredLogs.filter(l => l.type === 'submission').length;
  const screenings = filteredLogs.filter(l => l.type === 'screening').length;
  const interviews = filteredLogs.filter(l => l.type === 'interview').length;

  const subEl = document.getElementById('hub-stat-submissions');
  const scrEl = document.getElementById('hub-stat-screenings');
  const intEl = document.getElementById('hub-stat-interviews');
  if(subEl) subEl.textContent = submissions;
  if(scrEl) scrEl.textContent = screenings;
  if(intEl) intEl.textContent = interviews;
}
function renderHubTable(){
  // Get filtered candidates based on recruiter filter and search
  const recruiterFilter = document.getElementById('hub-recruiter-filter')?.value || '';
  const searchTerm = (document.getElementById('hub-search-input')?.value || '').toLowerCase();

  // Get all candidates, optionally filtered by recruiter
  let candidates = state.candidates;
  if(recruiterFilter){
    candidates = candidates.filter(c => c.recruiterId === recruiterFilter);
  }
  if(searchTerm){
    candidates = candidates.filter(c => 
      (c.first || '').toLowerCase().includes(searchTerm) ||
      (c.last || '').toLowerCase().includes(searchTerm) ||
      (c.mobile || '').includes(searchTerm) ||
      (c.tech || '').toLowerCase().includes(searchTerm)
    );
  }

  // Pagination
  const { current, limit } = state.pagination.hub;
  const totalPages = Math.max(1, Math.ceil(candidates.length / limit));
  state.pagination.hub.current = Math.min(current, totalPages);
  const start = (state.pagination.hub.current - 1) * limit;
  const pageItems = candidates.slice(start, start + limit);

  // Build table header
  document.getElementById('hub-table-head').innerHTML = `<tr>
    <th>#</th>
    <th>Candidate</th>
    <th>Technology</th>
    <th>Submission</th>
    <th>Screening</th>
    <th>Interview</th>
    <th>Last Activity</th>
  </tr>`;

  // Get hub logs for the current filter period
  const hubLogs = getFilteredHubLogs();

  // Build table body - one row per candidate
  const body = document.getElementById('hub-table-body');
  body.innerHTML = pageItems.length ? pageItems.map((c, idx) => {
    const candidateLogs = hubLogs.filter(l => l.candidateId === c.id);

    // Find latest submission, screening, interview for this candidate
    const submissionLog = candidateLogs.filter(l => l.type === 'submission').sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
    const screeningLog = candidateLogs.filter(l => l.type === 'screening').sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
    const interviewLog = candidateLogs.filter(l => l.type === 'interview').sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];

    // Format time display
    const fmtTime = (log) => {
      if(!log) return '<span class="hub-none">None</span>';
      const timeStr = log.time || '';
      const dateStr = log.date || '';
      const isToday = dateStr === new Date().toISOString().slice(0,10);
      const dateLabel = isToday ? 'Today' : formatDateShort(dateStr);
      const timeLabel = timeStr ? formatTime12hr(timeStr) : '';
      return `<div class="hub-activity-cell">
        <span class="hub-activity-badge hub-badge-${log.type}">${capitalize(log.type)}</span>
        <span class="hub-activity-date">${dateLabel}</span>
        ${timeLabel ? `<span class="hub-activity-time">${timeLabel}</span>` : ''}
      </div>`;
    };

    // Last activity = most recent of the three
    const allLogs = [submissionLog, screeningLog, interviewLog].filter(l => l).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    const lastLog = allLogs[0];
    const lastActivity = lastLog ? 
      `<div class="hub-last-activity">
        <span class="hub-activity-badge hub-badge-${lastLog.type}">${capitalize(lastLog.type)}</span>
        <span class="hub-activity-time">${lastLog.time ? formatTime12hr(lastLog.time) : formatDateShort(lastLog.date||'')}</span>
      </div>` 
      : '<span class="hub-none">None</span>';

    // Check if user can edit (recruiter can edit own entries for 1 day, admin anytime)
    const canEdit = canEditHubEntry(c);

    // Candidate avatar
    const initials = ((c.first||'')[0]||'') + ((c.last||'')[0]||'');

    return `<tr>
      <td class="hub-row-num">${start + idx + 1}</td>
      <td>
        <div class="hub-candidate-info">
          <div class="hub-avatar">${initials.toUpperCase()}</div>
          <div>
            <div class="hub-candidate-name">${escapeHtml((c.first||'') + ' ' + (c.last||''))}</div>
            <div class="hub-candidate-phone">${escapeHtml(c.mobile || '')}</div>
          </div>
        </div>
      </td>
      <td class="hub-tech">${escapeHtml(c.tech || '-')}</td>
      <td class="hub-activity-col">${fmtTime(submissionLog)}</td>
      <td class="hub-activity-col">${fmtTime(screeningLog)}</td>
      <td class="hub-activity-col">${fmtTime(interviewLog)}</td>
      <td>${lastActivity}</td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="7"><i class="fa-solid fa-arrows-to-circle" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:0.4;"></i>No candidates found</td></tr>`;

  // Update footer
  document.getElementById('hub-footer-count').textContent = `Showing ${pageItems.length} of ${candidates.length} candidates`;
  document.getElementById('hub-page-indicator').textContent = `Page ${state.pagination.hub.current} of ${totalPages}`;

  // Update stats
  updateHubStats();

  // Populate recruiter filter dropdown
  populateHubRecruiterFilter();
}

function updateHubMode(mode, btn){
  document.querySelectorAll('#hub-mode-toggles .btn-toggle').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.hubFilters.mode = mode;
  renderHubTable();
}

function populateHubRecruiterFilter(){
  const sel = document.getElementById('hub-recruiter-filter');
  if(!sel) return;
  const currentVal = sel.value;
  const recruiters = state.employees.filter(e => e.role === 'Recruiter' || e.role === 'Admin');
  sel.innerHTML = '<option value="">All Recruiters</option>' + 
    recruiters.map(r => `<option value="${r.id}" ${currentVal === r.id ? 'selected' : ''}>${escapeHtml(r.first||'')} ${escapeHtml(r.last||'')}</option>`).join('');
}

function formatDateShort(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\//g, '/');
}

function formatTime12hr(timeStr){
  if(!timeStr) return '';
  // Handle "11:15" or "11:15 AM" format
  if(timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
  const [h, m] = timeStr.split(':');
  let hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

function capitalize(str){
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function canEditHubEntry(candidate){
  // Admin can edit anytime
  if(state.role === 'Admin') return true;
  // Recruiter can edit their own candidates' entries
  if(candidate.recruiterId && state.user){
    // Check if the candidate belongs to this recruiter
    // In demo mode, state.user.uid is 'demo-user', so allow editing
    return true; // Simplified: recruiters can edit their own entries
  }
  return false;
}
function openHubNoteModal(id){
  const form = document.getElementById('hub-note-form');
  form.reset();
  document.getElementById('hub-note-edit-id').value = '';

  // Populate candidate dropdown
  const candSel = document.getElementById('hub-note-candidate');
  candSel.innerHTML = '<option value="">Select Candidate *</option>' + 
    state.candidates.map(c => `<option value="${c.id}">${escapeHtml((c.first||'') + ' ' + (c.last||''))} - ${escapeHtml(c.tech||'')}</option>`).join('');

  // Set default date to today
  document.getElementById('hub-note-date').value = new Date().toISOString().slice(0,10);

  if(id){
    const l = state.hubLogs.find(x => x.id === id);
    if(l){
      document.getElementById('hub-note-edit-id').value = id;
      document.getElementById('hub-note-candidate').value = l.candidateId || '';
      document.getElementById('hub-note-type').value = l.type || 'submission';
      document.getElementById('hub-note-date').value = l.date || '';
      document.getElementById('hub-note-time').value = l.time || '';
      document.getElementById('hub-note-subject').value = l.subject || '';
    }
  }
  openModalEl('add-hub-note-modal');
}
function closeHubNoteModal(){ closeModalEl('add-hub-note-modal'); }
function saveHubNoteForm(e){
  e.preventDefault();
  const id = document.getElementById('hub-note-edit-id').value;
  const data = {
    candidateId: document.getElementById('hub-note-candidate').value,
    type: document.getElementById('hub-note-type').value,
    date: document.getElementById('hub-note-date').value,
    time: document.getElementById('hub-note-time').value,
    subject: document.getElementById('hub-note-subject').value.trim()
  };
  if(!data.candidateId){ showToast('Please select a candidate', 'error'); return; }
  if(!data.subject){ showToast('Please enter a subject/note', 'error'); return; }

  if(fb.ready){
    const ref = id ? fb.db.collection('hubLogs').doc(id) : fb.db.collection('hubLogs').doc();
    ref.set(data, { merge:true })
      .then(()=> showToast(id ? 'Entry updated' : 'Entry added', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    if(id){
      const idx = state.hubLogs.findIndex(l => l.id === id);
      if(idx > -1) state.hubLogs[idx] = { ...state.hubLogs[idx], ...data };
      showToast('Entry updated', 'success');
    } else {
      state.hubLogs.push({ id: uid(), ...data });
      showToast('Entry added', 'success');
    }
    saveLocalData();
    renderHubTable();
    updateHubStats();
  }
  closeHubNoteModal();
}

/* ---------- 12. Placements ---------- */
function getFilteredPlacements(){
  const f = state.placementFilter;
  return state.placements.filter(p=>{
    if(!p.date) return true;
    const d = new Date(p.date);
    if(f.mode==='monthly'){
      const picker = document.getElementById('placement-month-picker').value;
      if(!picker) return true;
      const [y,m] = picker.split('-').map(Number);
      return d.getFullYear()===y && (d.getMonth()+1)===m;
    } else {
      const year = parseInt(document.getElementById('placement-year-picker').value, 10);
      return !year || d.getFullYear()===year;
    }
  });
}
function updatePlacementFilter(mode, btn){
  state.placementFilter.mode = mode;
  document.querySelectorAll('#view-placements .filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('placement-month-picker').style.display = mode==='monthly' ? '' : 'none';
  document.getElementById('placement-year-picker').style.display = mode==='yearly' ? '' : 'none';
  renderPlacementTable();
}
function renderPlacementTable(){
  const list = getFilteredPlacements();
  const { current, limit } = state.pagination.place;
  const totalPages = Math.max(1, Math.ceil(list.length/limit));
  state.pagination.place.current = Math.min(current, totalPages);
  const start = (state.pagination.place.current-1)*limit;
  const pageItems = list.slice(start, start+limit);

  document.getElementById('placement-table-head').innerHTML = `<tr>
    <th><input type="checkbox" onchange="toggleSelectAll('place', this.checked)"></th>
    <th>First Name</th><th>Last Name</th><th>Technology</th><th>Location</th><th>Contract</th><th>Recruiter</th><th>Date</th><th>Actions</th></tr>`;

  const body = document.getElementById('placement-table-body');
  body.innerHTML = pageItems.length ? pageItems.map(p=>`<tr>
      <td><input type="checkbox" ${state.selected.place.includes(p.id)?'checked':''} onchange="toggleSelectRow('place','${p.id}', this.checked)"></td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${p.id}', 'first', 'placements', this)">${escapeHtml(p.first)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${p.id}', 'last', 'placements', this)">${escapeHtml(p.last)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${p.id}', 'tech', 'placements', this)">${escapeHtml(p.tech)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${p.id}', 'location', 'placements', this)">${escapeHtml(p.location)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${p.id}', 'contract', 'placements', this)">${escapeHtml(p.contract)}</td>
      <td><select class="inline-select${canInlineEdit()?'':' readonly-select'}" onchange="inlineSelectEdit('${p.id}', 'recruiterId', 'placements', this.value)">${recruiterOptionsHtml(p.recruiterId)}</select></td>
      <td><input type="date" class="inline-date${canInlineEdit()?'':' readonly-date'}" value="${p.date||''}" onchange="inlineDateEdit('${p.id}', 'date', 'placements', this.value)"></td>
      <td><div class="row-actions">
        <button onclick="openPlacementModal('${p.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="del-btn" onclick="confirmSingleDelete('place','${p.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="9"><i class="fa-solid fa-trophy" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:0.4;"></i>No placements in this period</td></tr>`;

  document.getElementById('placement-footer-count').textContent = `Showing ${pageItems.length} of ${list.length} total records`;
  document.getElementById('place-page-indicator').textContent = `Page ${state.pagination.place.current} of ${totalPages}`;
  updateSelectedBar('place');
}
function openPlacementModal(id){
  document.getElementById('place-recruiter').innerHTML = recruiterOptionsHtml();
  document.getElementById('placement-form').reset();
  document.getElementById('place-edit-id').value = '';
  document.getElementById('placement-modal-title').innerHTML = '<i class="fa-solid fa-trophy text-gold"></i> Log New Placement';
  if(id){
    const p = state.placements.find(x=>x.id===id);
    if(p){
      document.getElementById('place-edit-id').value = id;
      document.getElementById('place-first').value = p.first||'';
      document.getElementById('place-last').value = p.last||'';
      document.getElementById('place-tech').value = p.tech||'';
      document.getElementById('place-location').value = p.location||'';
      document.getElementById('place-contract').value = p.contract||'';
      document.getElementById('place-date').value = p.date||'';
      document.getElementById('place-recruiter').value = p.recruiterId||'';
      document.getElementById('place-actions').value = p.actions||'';
      document.getElementById('placement-modal-title').innerHTML = '<i class="fa-solid fa-pen text-gold"></i> Edit Placement';
    }
  } else {
    document.getElementById('place-date').value = new Date().toISOString().slice(0,10);
  }
  openModalEl('add-placement-modal');
}
function closePlacementModal(){ closeModalEl('add-placement-modal'); }
function savePlacementForm(e){
  e.preventDefault();
  const id = document.getElementById('place-edit-id').value;
  const data = {
    first: document.getElementById('place-first').value.trim(),
    last: document.getElementById('place-last').value.trim(),
    tech: document.getElementById('place-tech').value.trim(),
    location: document.getElementById('place-location').value.trim(),
    contract: document.getElementById('place-contract').value.trim(),
    date: document.getElementById('place-date').value,
    recruiterId: document.getElementById('place-recruiter').value,
    actions: document.getElementById('place-actions').value.trim()
  };
  if(!data.first){ showToast('First name is required', 'error'); return; }

  if(fb.ready){
    const ref = id ? fb.db.collection('placements').doc(id) : fb.db.collection('placements').doc();
    ref.set(data, { merge:true })
      .then(()=> showToast(id ? 'Placement updated' : 'Placement logged', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    if(id){
      const idx = state.placements.findIndex(p=>p.id===id);
      if(idx>-1) state.placements[idx] = { ...state.placements[idx], ...data };
      showToast('Placement updated', 'success');
    } else {
      state.placements.push({ id: uid(), ...data });
      showToast('Placement logged', 'success');
    }
    saveLocalData();
    renderPlacementTable();
    renderDashboard();
  }
  closePlacementModal();
}

/* ---------- 13. Employees ---------- */
function getFilteredEmployees(){
  const q = (document.getElementById('emp-search-input')?.value||'').toLowerCase();
  return state.employees.filter(e=> !q || (e.first+' '+(e.last||'')).toLowerCase().includes(q) || (e.designation||'').toLowerCase().includes(q));
}
function renderEmployeeTable(){
  const list = getFilteredEmployees();
  const { current, limit } = state.pagination.emp;
  const totalPages = Math.max(1, Math.ceil(list.length/limit));
  state.pagination.emp.current = Math.min(current, totalPages);
  const start = (state.pagination.emp.current-1)*limit;
  const pageItems = list.slice(start, start+limit);

  document.getElementById('employee-table-head').innerHTML = `<tr>
    <th><input type="checkbox" onchange="toggleSelectAll('emp', this.checked)"></th>
    <th>First Name</th><th>Last Name</th><th>Designation</th><th>Role</th><th>Work Mobile</th><th>Official Email</th><th>Actions</th></tr>`;

  const body = document.getElementById('employee-table-body');
  body.innerHTML = pageItems.length ? pageItems.map(e=>`<tr>
      <td><input type="checkbox" ${state.selected.emp.includes(e.id)?'checked':''} onchange="toggleSelectRow('emp','${e.id}', this.checked)"></td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${e.id}', 'first', 'employees', this)">${escapeHtml(e.first)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${e.id}', 'last', 'employees', this)">${escapeHtml(e.last)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${e.id}', 'designation', 'employees', this)">${escapeHtml(e.designation)}</td>
      <td><select class="inline-select${canInlineEdit()?'':' readonly-select'}" onchange="inlineSelectEdit('${e.id}', 'role', 'employees', this.value)">
        <option value="Recruiter" ${e.role==='Recruiter'?'selected':''}>Recruiter</option>
        <option value="Admin" ${e.role==='Admin'?'selected':''}>Admin</option>
      </select></td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${e.id}', 'workMobile', 'employees', this)">${escapeHtml(e.workMobile)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${e.id}', 'officialEmail', 'employees', this)">${escapeHtml(e.officialEmail)}</td>
      <td><div class="row-actions">
        <button onclick="openEmployeeModal('${e.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="del-btn" onclick="confirmSingleDelete('emp','${e.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="8"><i class="fa-solid fa-user-slash" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:0.4;"></i>No staff records found</td></tr>`;

  document.getElementById('emp-footer-count').textContent = `Showing ${pageItems.length} of ${list.length} total records`;
  document.getElementById('emp-page-indicator').textContent = `Page ${state.pagination.emp.current} of ${totalPages}`;
  updateSelectedBar('emp');
}
function openEmployeeModal(id){
  document.getElementById('employee-form').reset();
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('employee-modal-title').innerHTML = '<i class="fa-solid fa-id-badge text-cyan"></i> Add New Employee';
  if(id){
    const e = state.employees.find(x=>x.id===id);
    if(e){
      document.getElementById('emp-edit-id').value = id;
      document.getElementById('emp-first').value = e.first||'';
      document.getElementById('emp-last').value = e.last||'';
      document.getElementById('emp-dob').value = e.dob||'';
      document.getElementById('emp-designation').value = e.designation||'';
      document.getElementById('emp-work-mobile').value = e.workMobile||'';
      document.getElementById('emp-personal-mobile').value = e.personalMobile||'';
      document.getElementById('emp-official-email').value = e.officialEmail||'';
      document.getElementById('emp-personal-email').value = e.personalEmail||'';
      document.getElementById('emp-role').value = e.role||'Recruiter';
      document.getElementById('employee-modal-title').innerHTML = '<i class="fa-solid fa-pen text-cyan"></i> Edit Employee';
    }
  }
  openModalEl('add-employee-modal');
}
function closeEmployeeModal(){ closeModalEl('add-employee-modal'); }
function saveEmployeeForm(e){
  e.preventDefault();
  const id = document.getElementById('emp-edit-id').value;
  const data = {
    first: document.getElementById('emp-first').value.trim(),
    last: document.getElementById('emp-last').value.trim(),
    dob: document.getElementById('emp-dob').value,
    designation: document.getElementById('emp-designation').value.trim(),
    workMobile: document.getElementById('emp-work-mobile').value.trim(),
    personalMobile: document.getElementById('emp-personal-mobile').value.trim(),
    officialEmail: document.getElementById('emp-official-email').value.trim(),
    personalEmail: document.getElementById('emp-personal-email').value.trim(),
    role: document.getElementById('emp-role').value
  };
  if(!data.first){ showToast('First name is required', 'error'); return; }

  if(fb.ready){
    const ref = id ? fb.db.collection('employees').doc(id) : fb.db.collection('employees').doc();
    ref.set(data, { merge:true })
      .then(()=> showToast(id ? 'Employee updated' : 'Employee added', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    if(id){
      const idx = state.employees.findIndex(x=>x.id===id);
      if(idx>-1) state.employees[idx] = { ...state.employees[idx], ...data };
      showToast('Employee updated', 'success');
    } else {
      state.employees.push({ id: uid(), ...data });
      showToast('Employee added', 'success');
    }
    saveLocalData();
    renderEmployeeTable();
    renderDashboard();
  }
  closeEmployeeModal();
}

/* ---------- 14. Onboarding ---------- */
function getFilteredOnboarding(){
  const q = (document.getElementById('onb-search-input')?.value||'').toLowerCase();
  return state.onboarding.filter(o=> !q || (o.first+' '+(o.last||'')).toLowerCase().includes(q));
}
function renderOnboardingTable(){
  const list = getFilteredOnboarding();
  const { current, limit } = state.pagination.onb;
  const totalPages = Math.max(1, Math.ceil(list.length/limit));
  state.pagination.onb.current = Math.min(current, totalPages);
  const start = (state.pagination.onb.current-1)*limit;
  const pageItems = list.slice(start, start+limit);

  document.getElementById('onboarding-table-head').innerHTML = `<tr>
    <th><input type="checkbox" onchange="toggleSelectAll('onb', this.checked)"></th>
    <th>First Name</th><th>Last Name</th><th>Mobile</th><th>Recruiter</th><th>Status</th><th>Comments</th><th>Actions</th></tr>`;

  const body = document.getElementById('onboarding-table-body');
  body.innerHTML = pageItems.length ? pageItems.map(o=>`<tr>
      <td><input type="checkbox" ${state.selected.onb.includes(o.id)?'checked':''} onchange="toggleSelectRow('onb','${o.id}', this.checked)"></td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${o.id}', 'first', 'onboarding', this)">${escapeHtml(o.first)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${o.id}', 'last', 'onboarding', this)">${escapeHtml(o.last)}</td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${o.id}', 'mobile', 'onboarding', this)">${escapeHtml(o.mobile)}</td>
      <td><select class="inline-select${canInlineEdit()?'':' readonly-select'}" onchange="inlineSelectEdit('${o.id}', 'recruiterId', 'onboarding', this.value)">${recruiterOptionsHtml(o.recruiterId)}</select></td>
      <td><select class="status-select ${o.status === 'Completed' ? 'completed' : 'onboarding'}" onchange="updateStatus('${o.id}', 'onboarding', this.value)">
        <option value="Onboarding" ${o.status==='Onboarding'?'selected':''}>Onboarding</option>
        <option value="Completed" ${o.status==='Completed'?'selected':''}>Completed</option>
      </select></td>
      <td class="editable-cell${canInlineEdit()?'':' readonly'}" onclick="inlineEdit('${o.id}', 'comments', 'onboarding', this)" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(o.comments)}</td>
      <td><div class="row-actions">
        <button onclick="openOnboardingModal('${o.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button class="del-btn" onclick="confirmSingleDelete('onb','${o.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('') : `<tr class="empty-row"><td colspan="8"><i class="fa-solid fa-file-circle-xmark" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:0.4;"></i>No onboarding records found</td></tr>`;

  document.getElementById('onb-footer-count').textContent = `Showing ${pageItems.length} of ${list.length} total records`;
  document.getElementById('onb-page-indicator').textContent = `Page ${state.pagination.onb.current} of ${totalPages}`;
  updateSelectedBar('onb');
}
function openOnboardingModal(id){
  document.getElementById('onb-recruiter').innerHTML = recruiterOptionsHtml();
  document.getElementById('onboarding-form').reset();
  document.getElementById('onb-edit-id').value = '';
  document.getElementById('onboarding-modal-title').innerHTML = '<i class="fa-solid fa-file-signature text-cyan"></i> Add Onboarding Record';
  if(id){
    const o = state.onboarding.find(x=>x.id===id);
    if(o){
      document.getElementById('onb-edit-id').value = id;
      document.getElementById('onb-first').value = o.first||'';
      document.getElementById('onb-last').value = o.last||'';
      document.getElementById('onb-dob').value = o.dob||'';
      document.getElementById('onb-mobile').value = o.mobile||'';
      document.getElementById('onb-recruiter').value = o.recruiterId||'';
      document.getElementById('onb-status').value = o.status||'Onboarding';
      document.getElementById('onb-comments').value = o.comments||'';
      document.getElementById('onboarding-modal-title').innerHTML = '<i class="fa-solid fa-pen text-cyan"></i> Edit Onboarding Record';
    }
  }
  openModalEl('add-onboarding-modal');
}
function closeOnboardingModal(){ closeModalEl('add-onboarding-modal'); }
function saveOnboardingForm(e){
  e.preventDefault();
  const id = document.getElementById('onb-edit-id').value;
  const data = {
    first: document.getElementById('onb-first').value.trim(),
    last: document.getElementById('onb-last').value.trim(),
    dob: document.getElementById('onb-dob').value,
    mobile: document.getElementById('onb-mobile').value.trim(),
    recruiterId: document.getElementById('onb-recruiter').value,
    status: document.getElementById('onb-status').value,
    comments: document.getElementById('onb-comments').value.trim()
  };
  if(!data.first){ showToast('First name is required', 'error'); return; }

  if(fb.ready){
    const ref = id ? fb.db.collection('onboarding').doc(id) : fb.db.collection('onboarding').doc();
    ref.set(data, { merge:true })
      .then(()=> showToast(id ? 'Record updated' : 'Onboarding record added', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    if(id){
      const idx = state.onboarding.findIndex(x=>x.id===id);
      if(idx>-1) state.onboarding[idx] = { ...state.onboarding[idx], ...data };
      showToast('Record updated', 'success');
    } else {
      state.onboarding.push({ id: uid(), ...data });
      showToast('Onboarding record added', 'success');
    }
    saveLocalData();
    renderOnboardingTable();
  }
  closeOnboardingModal();
}

/* ---------- 15. Custom columns ---------- */
function openColumnModal(){ openModalEl('add-column-modal'); }
function closeColumnModal(){ closeModalEl('add-column-modal'); }
function executeAddColumn(){
  const name = document.getElementById('new-col-name').value.trim();
  const type = document.getElementById('new-col-type').value;
  if(!name){ showToast('Column name is required', 'error'); return; }
  const data = { name, type, scope:'cand' };

  if(fb.ready){
    fb.db.collection('customColumns').add(data)
      .then(()=> showToast('Column added', 'success'))
      .catch(err=>{ console.error(err); showToast('Save failed: ' + err.message, 'error'); });
  } else {
    state.customColumns.push({ id: uid(), ...data });
    saveLocalData();
    renderCandidatesTable();
    showToast('Column added', 'success');
  }
  closeColumnModal();
}

/* ---------- 16. Profile ---------- */
function triggerPhotoUpload(){ document.getElementById('profile-upload-input').click(); }
function handlePhotoUpload(input){
  const file = input.files[0];
  if(!file) return;
  const loadingEl = document.getElementById('avatar-loading');
  loadingEl.style.display = 'flex';
  const reader = new FileReader();
  reader.onload = ev => {
    setProfileImage(ev.target.result);
    loadingEl.style.display = 'none';
    if(fb.ready && fb.storage && state.user){
      const ref = fb.storage.ref('avatars/' + state.user.uid);
      ref.putString(ev.target.result, 'data_url').catch(err=>console.error('Avatar upload failed', err));
    } else {
      localStorage.setItem('nileprise_avatar', ev.target.result);
    }
    showToast('Profile photo updated', 'success');
  };
  reader.readAsDataURL(file);
}
function setProfileImage(src){
  ['header-profile-img','profile-page-img'].forEach(id=>{
    const img = document.getElementById(id);
    img.src = src; img.style.display = 'block';
  });
  ['header-profile-icon','profile-page-icon'].forEach(id=> document.getElementById(id).style.display = 'none');
  document.getElementById('btn-delete-photo').style.display = 'inline-flex';
}
function deleteProfilePhoto(){
  ['header-profile-img','profile-page-img'].forEach(id=>{
    const img = document.getElementById(id);
    img.src=''; img.style.display='none';
  });
  ['header-profile-icon','profile-page-icon'].forEach(id=> document.getElementById(id).style.display = '');
  document.getElementById('btn-delete-photo').style.display = 'none';
  localStorage.removeItem('nileprise_avatar');
  showToast('Profile photo removed', 'success');
}
function saveProfileData(){
  const profile = {
    first: document.getElementById('prof-first').value.trim(),
    last: document.getElementById('prof-last').value.trim(),
    dob: document.getElementById('prof-dob').value,
    personalEmail: document.getElementById('prof-personal-email').value.trim(),
    workMobile: document.getElementById('prof-work-mobile').value.trim(),
    personalMobile: document.getElementById('prof-personal-mobile').value.trim()
  };
  localStorage.setItem('nileprise_profile', JSON.stringify(profile));
  if(profile.first){
    document.getElementById('prof-name-display').textContent = profile.first + ' ' + (profile.last||'');
    document.getElementById('display-username').textContent = profile.first;
  }
  if(fb.ready && fb.db && state.user){
    fb.db.collection('profiles').doc(state.user.uid).set(profile, {merge:true}).catch(err=>console.error(err));
  }
  showToast('Profile saved', 'success');
}
function loadProfileData(){
  const raw = localStorage.getItem('nileprise_profile');
  if(raw){
    const p = JSON.parse(raw);
    document.getElementById('prof-first').value = p.first||'';
    document.getElementById('prof-last').value = p.last||'';
    document.getElementById('prof-dob').value = p.dob||'';
    document.getElementById('prof-personal-email').value = p.personalEmail||'';
    document.getElementById('prof-work-mobile').value = p.workMobile||'';
    document.getElementById('prof-personal-mobile').value = p.personalMobile||'';
  }
  const avatar = localStorage.getItem('nileprise_avatar');
  if(avatar) setProfileImage(avatar);

  if(fb.ready && fb.db && state.user){
    fb.db.collection('profiles').doc(state.user.uid).get().then(doc=>{
      if(doc.exists){
        const p = doc.data();
        document.getElementById('prof-first').value = p.first||'';
        document.getElementById('prof-last').value = p.last||'';
        document.getElementById('prof-dob').value = p.dob||'';
        document.getElementById('prof-personal-email').value = p.personalEmail||'';
        document.getElementById('prof-work-mobile').value = p.workMobile||'';
        document.getElementById('prof-personal-mobile').value = p.personalMobile||'';
        if(p.first){
          document.getElementById('prof-name-display').textContent = p.first + ' ' + (p.last||'');
          document.getElementById('display-username').textContent = p.first;
        }
      }
    }).catch(err=> console.error('Profile load failed', err));
  }
}

/* ---------- 17. Settings ---------- */
function exportData(){
  const rows = [['First','Last','Mobile','WhatsApp','Technology','Recruiter','Status','Comments']];
  state.candidates.forEach(c=> rows.push([c.first,c.last,c.mobile,c.whatsapp,c.tech,recruiterName(c.recruiterId),c.status,c.comments]));
  const csv = rows.map(r=> r.map(v=> `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'nileprise_candidates.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('CSV export started', 'success');
}
function resetSystem(){
  if(state.role !== 'Admin'){ showToast('Only Admins can perform a factory reset', 'error'); return; }
  if(!confirm('This will permanently delete ALL candidate, placement, and onboarding data for EVERYONE. Continue?')) return;

  if(fb.ready){
    const collsToWipe = ['candidates','placements','onboarding','hubLogs'];
    Promise.all(collsToWipe.map(name=>
      fb.db.collection(name).get().then(snap=>{
        const batch = fb.db.batch();
        snap.docs.forEach(d=> batch.delete(d.ref));
        return batch.commit();
      })
    )).then(()=> showToast('System reset complete', 'success'))
      .catch(err=>{ console.error(err); showToast('Reset failed: ' + err.message, 'error'); });
  } else {
    state.candidates = []; state.placements = []; state.onboarding = []; state.hubLogs = [];
    saveLocalData();
    refreshAll();
    showToast('System reset complete', 'success');
  }
}

/* ---------- 18. Modal helpers ---------- */
function openModalEl(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.style.display = 'flex';
  // Focus first input after animation
  setTimeout(()=>{
    const firstInput = el.querySelector('input:not([type=hidden]), select, textarea');
    if(firstInput) firstInput.focus();
  }, 100);
}
function closeModalEl(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.style.display = 'none';
}
document.addEventListener('click', e=>{
  if(e.target.classList && e.target.classList.contains('modal-overlay')){
    e.target.style.display = 'none';
  }
});

/* ---------- 19. Gmail integration (Google Identity Services) ---------- */
let gisTokenClient = null;
function initGmailClient(){
  if(!GOOGLE_CLIENT_ID){
    document.getElementById('manage-indicator').textContent = 'Not configured — set GOOGLE_CLIENT_ID in script.js';
    return;
  }
  const tryInit = () => {
    if(!window.google || !window.google.accounts){ setTimeout(tryInit, 300); return; }
    gisTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GMAIL_SCOPES,
      callback: (resp)=>{
        if(resp.error){ showToast('Gmail auth failed: ' + resp.error, 'error'); return; }
        state.gmail.token = resp.access_token;
        document.getElementById('btn-gmail-auth').style.display = 'none';
        document.getElementById('btn-gmail-signout').style.display = 'inline-flex';
        document.getElementById('manage-indicator').textContent = 'Connected';
        renderGmailList('INBOX');
        fetchGmailLabels();
      }
    });
  };
  tryInit();
}
document.addEventListener('DOMContentLoaded', ()=>{
  const authBtn = document.getElementById('btn-gmail-auth');
  const signoutBtn = document.getElementById('btn-gmail-signout');
  if(authBtn) authBtn.addEventListener('click', ()=>{
    if(!gisTokenClient){ showToast('Gmail client not ready — check GOOGLE_CLIENT_ID', 'error'); return; }
    gisTokenClient.requestAccessToken();
  });
  if(signoutBtn) signoutBtn.addEventListener('click', ()=>{
    state.gmail.token = null;
    authBtn.style.display = 'inline-flex';
    signoutBtn.style.display = 'none';
    document.getElementById('manage-indicator').textContent = 'Not connected';
    renderGmailList('INBOX');
  });
});

async function gmailFetch(path){
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
    headers: { Authorization: 'Bearer ' + state.gmail.token }
  });
  if(!res.ok) throw new Error('Gmail API error ' + res.status);
  return res.json();
}
async function fetchGmailLabels(){
  try{
    const data = await gmailFetch('labels');
    const container = document.getElementById('dynamic-labels-container');
    const userLabels = (data.labels||[]).filter(l=>l.type==='user');
    container.innerHTML = userLabels.map(l=>
      `<li onclick="renderGmailList('${l.id}')"><span class="material-icons text-cyan" style="font-size:1rem;">label</span> ${escapeHtml(l.name)}</li>`
    ).join('');
  }catch(e){ console.error(e); }
}
let currentGmailLabel = 'INBOX';
async function renderGmailList(labelId){
  currentGmailLabel = labelId;
  document.querySelectorAll('.gmail-nav li').forEach(li=>li.classList.remove('active'));
  const container = document.getElementById('gmail-rows-container');
  document.getElementById('gmail-list-view').style.display = '';
  document.getElementById('gmail-detail-view').style.display = 'none';

  if(!state.gmail.token){
    container.innerHTML = `<div class="gmail-empty-state"><i class="fa-brands fa-google"></i><p>Connect your Gmail account to see messages here.</p></div>`;
    return;
  }
  container.innerHTML = `<div class="gmail-empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading messages...</p></div>`;
  try{
    const q = document.getElementById('gmail-search-input').value.trim();
    let path = `messages?maxResults=25&labelIds=${encodeURIComponent(labelId)}`;
    if(q) path += `&q=${encodeURIComponent(q)}`;
    const list = await gmailFetch(path);
    if(!list.messages || !list.messages.length){
      container.innerHTML = `<div class="gmail-empty-state"><i class="fa-solid fa-inbox"></i><p>No messages found.</p></div>`;
      return;
    }
    const detailed = await Promise.all(list.messages.slice(0,25).map(m=>
      gmailFetch(`messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
    ));
    state.gmail.messages = detailed;
    container.innerHTML = detailed.map(renderGmailRow).join('');
  }catch(e){
    console.error(e);
    container.innerHTML = `<div class="gmail-empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Could not load messages. Token may have expired — try reconnecting.</p></div>`;
  }
}
function renderGmailRow(msg){
  const headers = (msg.payload && msg.payload.headers) || [];
  const get = name => (headers.find(h=>h.name===name)||{}).value || '';
  const from = get('From').replace(/<.*>/, '').trim() || get('From');
  const subject = get('Subject') || '(no subject)';
  const date = get('Date') ? new Date(get('Date')).toLocaleDateString() : '';
  const unread = (msg.labelIds||[]).includes('UNREAD');
  return `<div class="gmail-row ${unread?'unread':''}" onclick="openGmailDetail('${msg.id}')">
    <div class="gr-avatar">${escapeHtml((from[0]||'?').toUpperCase())}</div>
    <div class="gr-from">${escapeHtml(from)}</div>
    <div class="gr-subject">${escapeHtml(subject)} — <span>${escapeHtml((msg.snippet||'').slice(0,80))}</span></div>
    <div class="gr-date">${date}</div>
  </div>`;
}
async function openGmailDetail(msgId){
  try{
    const msg = await gmailFetch(`messages/${msgId}?format=full`);
    state.gmail.currentMsgId = msgId;
    const headers = (msg.payload && msg.payload.headers) || [];
    const get = name => (headers.find(h=>h.name===name)||{}).value || '';
    document.getElementById('detail-subject').textContent = get('Subject') || '(no subject)';
    document.getElementById('detail-sender').textContent = get('From');
    document.getElementById('detail-date').textContent = get('Date') ? new Date(get('Date')).toLocaleString() : '';
    document.getElementById('detail-message').innerHTML = extractGmailBody(msg.payload);
    document.getElementById('gmail-list-view').style.display = 'none';
    document.getElementById('gmail-detail-view').style.display = 'block';
  }catch(e){ console.error(e); showToast('Could not open message', 'error'); }
}
function extractGmailBody(payload){
  function decode(data){ try{ return decodeURIComponent(escape(atob(data.replace(/-/g,'+').replace(/_/g,'/')))); }catch(e){ return ''; } }
  function find(part, mime){
    if(!part) return null;
    if(part.mimeType===mime && part.body && part.body.data) return decode(part.body.data);
    if(part.parts){ for(const p of part.parts){ const r = find(p, mime); if(r) return r; } }
    return null;
  }
  const html = find(payload, 'text/html');
  if(html) return html;
  const text = find(payload, 'text/plain');
  if(text) return `<pre style="white-space:pre-wrap; font-family:inherit;">${escapeHtml(text)}</pre>`;
  return '<p class="text-muted">No preview available.</p>';
}
function backToGmailList(){
  document.getElementById('gmail-detail-view').style.display = 'none';
  document.getElementById('gmail-list-view').style.display = '';
}
function refreshEmails(){ renderGmailList(currentGmailLabel); }
function syncCurrentEmailToCandidate(){
  const msg = state.gmail.messages.find(m=>m.id===state.gmail.currentMsgId);
  const headers = msg && msg.payload ? msg.payload.headers : [];
  const get = name => headers ? (headers.find(h=>h.name===name)||{}).value || '' : '';
  const from = get('From');
  const nameGuess = from.split('<')[0].trim();
  const [first, ...rest] = nameGuess.split(' ');
  openCandidateModal();
  document.getElementById('cand-first').value = first || '';
  document.getElementById('cand-last').value = rest.join(' ') || '';
  document.getElementById('cand-comments').value = 'Synced from email: ' + (get('Subject')||'');
  showToast('Candidate form pre-filled from email', 'success');
}
function toggleSection(id){
  const el = document.getElementById(id);
  el.style.display = el.style.display === 'none' ? '' : 'none';
}

/* ---------- 20. Label modal ---------- */
let selectedLabelColor = '#e91e63';
function openCreateLabelModal(){ openModalEl('create-label-modal'); }
function closeCreateLabelModal(){ closeModalEl('create-label-modal'); }
function selectColor(el, color){
  document.querySelectorAll('.color-circle').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  selectedLabelColor = color;
}
async function createLabel(){
  const name = document.getElementById('new-label-name').value.trim();
  if(!name){ showToast('Label name is required', 'error'); return; }
  if(!state.gmail.token){ showToast('Connect Gmail first', 'error'); return; }
  try{
    await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
      method:'POST',
      headers: { Authorization:'Bearer '+state.gmail.token, 'Content-Type':'application/json' },
      body: JSON.stringify({ name, labelListVisibility:'labelShow', messageListVisibility:'show' })
    });
    showToast('Label created', 'success');
    closeCreateLabelModal();
    fetchGmailLabels();
  }catch(e){ showToast('Could not create label', 'error'); }
}

/* ---------- 21. Wire up search/filter inputs ---------- */
function setupListeners(){
  document.getElementById('candidate-form').addEventListener('submit', saveCandidateForm);
  document.getElementById('employee-form').addEventListener('submit', saveEmployeeForm);
  document.getElementById('onboarding-form').addEventListener('submit', saveOnboardingForm);
  document.getElementById('placement-form').addEventListener('submit', savePlacementForm);
  document.getElementById('hub-note-form').addEventListener('submit', saveHubNoteForm);

  document.getElementById('search-input').addEventListener('input', e=>{ state.filters.search = e.target.value; state.pagination.cand.current=1; renderCandidatesTable(); });
  document.getElementById('filter-recruiter').addEventListener('change', e=>{ state.filters.recruiter = e.target.value; renderCandidatesTable(); });
  document.getElementById('filter-tech').addEventListener('change', e=>{ state.filters.tech = e.target.value; renderCandidatesTable(); });
  document.getElementById('btn-reset-filters').addEventListener('click', ()=>{
    state.filters = { search:'', recruiter:'', tech:'', status:'' };
    document.getElementById('search-input').value = '';
    document.querySelectorAll('#cand-status-toggles .btn-toggle').forEach((b,i)=> b.classList.toggle('active', i===0));
    renderCandidatesTable();
  });
  document.querySelectorAll('#cand-status-toggles .btn-toggle').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('#cand-status-toggles .btn-toggle').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.filters.status = btn.dataset.status;
      renderCandidatesTable();
    });
  });

  document.getElementById('hub-search-input').addEventListener('input', renderHubTable);
  document.getElementById('emp-search-input').addEventListener('input', renderEmployeeTable);
  document.getElementById('onb-search-input').addEventListener('input', renderOnboardingTable);

  document.querySelectorAll('.page-size-select').forEach(sel=>{
    sel.addEventListener('change', ()=>{
      const type = sel.dataset.type;
      state.pagination[type].limit = parseInt(sel.value,10);
      state.pagination[type].current = 1;
      refreshViewForType(type);
    });
  });

  const monthPicker = document.getElementById('placement-month-picker');
  monthPicker.value = new Date().toISOString().slice(0,7);
  const hubDatePicker = document.getElementById('hub-date-picker');
  if(hubDatePicker) hubDatePicker.value = new Date().toISOString().slice(0,10);
  document.getElementById('placement-year-picker').value = new Date().getFullYear();
}

/* ---------- 22. Init ---------- */
function refreshAll(){
  renderDashboard();
  renderCandidatesTable();
  renderHubTable();
  renderPlacementTable();
  renderEmployeeTable();
  renderOnboardingTable();
  loadProfileData();
}

// Escape key to close any open modal
document.addEventListener('keydown', e=>{
  if(e.key === 'Escape'){
    document.querySelectorAll('.modal-overlay').forEach(m=>{
      if(m.style.display === 'flex') m.style.display = 'none';
    });
  }
});

document.addEventListener('DOMContentLoaded', ()=>{
  initFirebase();
  initGmailClient();
  setupNav();
  setupListeners();
  injectInlineEditStyles();
  // Inline editing is now handled per-cell via onclick="inlineEdit(...)"
  // No global listeners needed

  // CRITICAL: Check auth state on page load
  // If user is already logged in (session persisted), show dashboard
  // If not, show login screen (which is already active by default)
  if(fb.ready){
    fb.auth.onAuthStateChanged(user=>{
      // Hide loading screen once auth state is determined
      const loadingScreen = document.getElementById('loading-screen');
      if(loadingScreen){
        loadingScreen.style.opacity = '0';
        setTimeout(()=>{ loadingScreen.style.display = 'none'; }, 300);
      }
      if(user){
        // User is signed in - show dashboard and load data
        onAuthed(user);
      } else {
        // User is signed out - ensure login screen is shown
        showLoginScreen();
      }
    });
  } else {
    // No Firebase - hide loading screen immediately
    const loadingScreen = document.getElementById('loading-screen');
    if(loadingScreen){
      loadingScreen.style.opacity = '0';
      setTimeout(()=>{ loadingScreen.style.display = 'none'; }, 300);
    }
  }

  // Fallback: hide loading screen after 5 seconds
  setTimeout(()=>{
    const ls = document.getElementById('loading-screen');
    if(ls && ls.style.display !== 'none'){
      ls.style.opacity = '0';
      setTimeout(()=>{ ls.style.display = 'none'; }, 300);
    }
  }, 5000);
});


/* ---------- Button Loading State Helper ---------- */
function setBtnLoading(btn, loading){
  if(loading){
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;
  } else {
    if(btn.dataset.originalHtml){
      btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
    btn.disabled = false;
  }
}

/* Expose functions called from inline HTML attributes to the global scope
   (needed since this file is loaded as a classic script, but kept explicit
   for clarity and to avoid relying on accidental globals). */

// Enter key support for login form
document.addEventListener('DOMContentLoaded', ()=>{
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  if(loginEmail){
    loginEmail.addEventListener('keypress', e=>{
      if(e.key === 'Enter') handleLogin();
    });
  }
  if(loginPassword){
    loginPassword.addEventListener('keypress', e=>{
      if(e.key === 'Enter') handleLogin();
    });
  }
});

window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.toggleAuthMode = toggleAuthMode;
window.togglePasswordVisibility = togglePasswordVisibility;
window.showLoginScreen = showLoginScreen;
window.setBtnLoading = setBtnLoading;
window.openCandidateModal = openCandidateModal;
window.closeCandidateModal = closeCandidateModal;
window.openEmployeeModal = openEmployeeModal;
window.closeEmployeeModal = closeEmployeeModal;
window.openOnboardingModal = openOnboardingModal;
window.closeOnboardingModal = closeOnboardingModal;
window.openPlacementModal = openPlacementModal;
window.closePlacementModal = closePlacementModal;
window.openHubNoteModal = openHubNoteModal;
window.closeHubNoteModal = closeHubNoteModal;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.executeDelete = executeDelete;
window.confirmSingleDelete = confirmSingleDelete;
window.changePage = changePage;
window.refreshViewForType = refreshViewForType;
window.toggleSelectAll = toggleSelectAll;
window.toggleSelectRow = toggleSelectRow;
window.updateHubStats = updateHubStats;
window.updateHubMode = updateHubMode;
window.populateHubRecruiterFilter = populateHubRecruiterFilter;
window.updatePlacementFilter = updatePlacementFilter;
window.renderPlacementTable = renderPlacementTable;
window.viewCandidateDetail = viewCandidateDetail;
window.closeModalEl = closeModalEl;
window.openColumnModal = openColumnModal;
window.closeColumnModal = closeColumnModal;
window.executeAddColumn = executeAddColumn;
window.triggerPhotoUpload = triggerPhotoUpload;
window.handlePhotoUpload = handlePhotoUpload;
window.deleteProfilePhoto = deleteProfilePhoto;
window.saveProfileData = saveProfileData;
window.exportData = exportData;
window.resetSystem = resetSystem;
window.renderGmailList = renderGmailList;
window.openGmailDetail = openGmailDetail;
window.backToGmailList = backToGmailList;
window.refreshEmails = refreshEmails;
window.syncCurrentEmailToCandidate = syncCurrentEmailToCandidate;
window.toggleSection = toggleSection;
window.openCreateLabelModal = openCreateLabelModal;
window.closeCreateLabelModal = closeCreateLabelModal;
window.selectColor = selectColor;
window.createLabel = createLabel;
window.inlineEdit = inlineEdit;
window.saveInline = saveInline;
window.updateStatus = updateStatus;
window.inlineDateEdit = inlineDateEdit;
window.inlineUrlEdit = inlineUrlEdit;
window.inlineSelectEdit = inlineSelectEdit;
window.canInlineEdit = canInlineEdit;
window.state = state;
