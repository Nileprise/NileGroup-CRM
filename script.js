/* --- STATE & DATA --- */
const DB = {
  candidates: JSON.parse(localStorage.getItem('np_candidates') || '[]'),
  recruiters: ["Asif", "Ikram", "Manikanta", "Mazher", "Shoeb"],
  techs: ["React", "Node.js", "Java", "Python", ".NET", "AWS"]
};

let state = {
  currentPage: 1,
  rowsPerPage: 10,
  filter: "",
  recruiterFilter: "",
  techFilter: "",
  statusFilter: "",
  selectedIds: new Set()
};

/* --- DOM CACHE --- */
const dom = {
  screens: { auth: document.getElementById('auth-screen'), dashboard: document.getElementById('dashboard-screen') },
  forms: { login: document.getElementById('form-login'), signup: document.getElementById('form-signup') },
  nav: document.querySelectorAll('.nav-item'),
  views: { dashboard: document.getElementById('view-dashboard'), candidates: document.getElementById('view-candidates'), profile: document.getElementById('view-profile'), settings: document.getElementById('view-settings') },
  table: { head: document.getElementById('table-head'), body: document.getElementById('table-body'), pagination: document.getElementById('pagination-controls'), pageInfo: document.getElementById('page-info'), perPage: document.getElementById('rows-per-page'), search: document.getElementById('search-input'), recFilter: document.getElementById('filter-recruiter'), techFilter: document.getElementById('filter-tech'), btnReset: document.getElementById('btn-reset-filters'), btnAdd: document.getElementById('btn-add-candidate'), btnDelete: document.getElementById('btn-delete-selected'), selectedCount: document.getElementById('selected-count') },
  stats: { total: document.getElementById('stat-total'), tech: document.getElementById('stat-tech'), rec: document.getElementById('stat-rec') },
  themeToggle: document.getElementById('theme-toggle'),
  statusToggles: document.querySelectorAll('.btn-toggle'),
  profileUser: document.getElementById('display-username'),
  profileNameDisplay: document.getElementById('prof-name-display'),
  profileEmail: document.getElementById('prof-email'),
  profileUsername: document.getElementById('prof-username'),
  headerUpdated: document.getElementById('header-updated'),
  logoutBtn: document.getElementById('btn-logout'),
  tabLogin: document.getElementById('tab-login'),
  tabSignup: document.getElementById('tab-signup'),
  profStatTotal: document.getElementById('prof-stat-total'),
  settingThemeToggle: document.getElementById('setting-theme-toggle'),
  btnDeletePhoto: document.getElementById('btn-delete-photo')
};

/* --- INITIALIZATION --- */
function init() {
  if (DB.candidates.length === 0) seedData();
  setupEventListeners();
  populateDropdowns();
  renderTableHeaders();
  
  const savedTheme = localStorage.getItem('np_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    dom.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    if(dom.settingThemeToggle) dom.settingThemeToggle.checked = false; 
  }
  const lastUp = localStorage.getItem('np_last_updated');
  if(lastUp) dom.headerUpdated.innerText = lastUp;
  
  loadProfilePhoto();
  loadProfileData();
  updateTable();
}

function seedData() {
  for (let i = 1; i <= 25; i++) {
    DB.candidates.push({
      id: Date.now() + i,
      first: `Candidate`, last: `${i}`,
      mobile: `98765432${i < 10 ? '0'+i : i}`, wa: `98765432${i < 10 ? '0'+i : i}`,
      tech: DB.techs[Math.floor(Math.random() * DB.techs.length)],
      recruiter: DB.recruiters[Math.floor(Math.random() * DB.recruiters.length)],
      status: i % 3 === 0 ? "Inactive" : "Active", 
      linkedin: "https://linkedin.com", resume: "https://resume.com", track: "", 
      assigned: new Date().toISOString().split('T')[0],
      gmail: "mailto:test@gmail.com",
      comments: ""
    });
  }
  saveData();
}

function populateDropdowns() {
  const recOpts = DB.recruiters.map(r => `<option value="${r}">${r}</option>`).join('');
  dom.table.recFilter.innerHTML = `<option value="">All Recruiters</option>` + recOpts;
  const techOpts = DB.techs.map(t => `<option value="${t}">${t}</option>`).join('');
  dom.table.techFilter.innerHTML = `<option value="">All Tech</option>` + techOpts;
}

function switchAuthTab(type) {
  if(type === 'login') {
    dom.tabLogin.classList.add('active'); dom.tabSignup.classList.remove('active');
    dom.forms.login.style.display='block'; dom.forms.signup.style.display='none';
  } else {
    dom.tabSignup.classList.add('active'); dom.tabLogin.classList.remove('active');
    dom.forms.signup.style.display='block'; dom.forms.login.style.display='none';
  }
}
window.switchAuthTab = switchAuthTab;

/* --- LISTENERS --- */
function setupEventListeners() {
  dom.forms.login.addEventListener('submit', (e) => { 
    e.preventDefault(); 
    let user = document.getElementById('login-user').value;
    
    if(!localStorage.getItem('np_profile_data')) {
      const userProfile = {
         fullname: "Nalla Akhil",
         username: user.split('@')[0],
         email: user,
         phone: "+91 98765 43210",
         location: "Hyderabad, India"
      };
      localStorage.setItem('np_profile_data', JSON.stringify(userProfile));
    }
    loadProfileData();

    dom.screens.auth.classList.remove('active'); 
    dom.screens.dashboard.classList.add('active'); 
    updateTable(); updateDashboard(); 
  });

  dom.forms.signup.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Account Created! Please Login.');
    switchAuthTab('login');
  });

  dom.logoutBtn.addEventListener('click', () => {
    dom.screens.dashboard.classList.remove('active');
    dom.screens.auth.classList.add('active');
    dom.forms.login.reset();
    showToast("Logged out");
  });
  
  const toggleTheme = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    dom.themeToggle.innerHTML = isLight ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    localStorage.setItem('np_theme', isLight ? 'light' : 'dark');
    if(dom.settingThemeToggle) dom.settingThemeToggle.checked = !isLight;
  };
  dom.themeToggle.addEventListener('click', toggleTheme);

  if(dom.settingThemeToggle) {
      dom.settingThemeToggle.addEventListener('change', (e) => {
         const isDark = e.target.checked;
         if(isDark) {
             document.body.classList.remove('light-mode');
             localStorage.setItem('np_theme', 'dark');
             dom.themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
         } else {
             document.body.classList.add('light-mode');
             localStorage.setItem('np_theme', 'light');
             dom.themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
         }
      });
  }

  dom.nav.forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      e.currentTarget.classList.add('active');
      Object.values(dom.views).forEach(v => v.classList.remove('active'));
      const targetId = e.currentTarget.dataset.target;
      if(document.getElementById(targetId)) { document.getElementById(targetId).classList.add('active'); }
      if (targetId === 'view-dashboard') updateDashboard();
      if (targetId === 'view-candidates') updateTable();
    });
  });

  dom.table.search.addEventListener('input', (e) => { state.filter = e.target.value.toLowerCase(); state.currentPage = 1; updateTable(); });
  dom.table.recFilter.addEventListener('change', (e) => { state.recruiterFilter = e.target.value; state.currentPage = 1; updateTable(); });
  dom.table.techFilter.addEventListener('change', (e) => { state.techFilter = e.target.value; state.currentPage = 1; updateTable(); });
  dom.table.perPage.addEventListener('change', (e) => { state.rowsPerPage = parseInt(e.target.value); state.currentPage = 1; updateTable(); });

  dom.statusToggles.forEach(btn => {
    btn.addEventListener('click', (e) => {
        dom.statusToggles.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        state.statusFilter = e.target.dataset.status;
        state.currentPage = 1;
        updateTable();
    });
  });

  dom.table.btnReset.addEventListener('click', () => {
    state.filter = ""; state.recruiterFilter = ""; state.techFilter = ""; state.statusFilter = "";
    dom.table.search.value = ""; dom.table.recFilter.value = ""; dom.table.techFilter.value = "";
    dom.statusToggles.forEach(b => b.classList.remove('active'));
    dom.statusToggles[0].classList.add('active');
    updateTable();
  });

  dom.table.btnAdd.addEventListener('click', () => addBlankRow());
  dom.table.btnDelete.addEventListener('click', () => deleteSelectedRows());

  document.getElementById('upload-photo').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        const imgData = e.target.result;
        localStorage.setItem('np_profile_pic', imgData);
        loadProfilePhoto();
        showToast("Profile Photo Updated");
      };
      reader.readAsDataURL(file);
    }
  });

  if(dom.btnDeletePhoto) {
      dom.btnDeletePhoto.addEventListener('click', () => {
          if(confirm("Remove profile photo?")) {
              localStorage.removeItem('np_profile_pic');
              loadProfilePhoto();
              showToast("Photo Removed");
          }
      });
  }
}

function loadProfileData() {
    const data = JSON.parse(localStorage.getItem('np_profile_data'));
    if(data) {
        document.getElementById('prof-fullname').value = data.fullname;
        document.getElementById('prof-phone').value = data.phone;
        document.getElementById('prof-location').value = data.location;
        
        if(dom.profileUser) dom.profileUser.innerText = data.username;
        if(dom.profileNameDisplay) dom.profileNameDisplay.innerText = data.fullname;
        if(dom.profileEmail) dom.profileEmail.value = data.email;
        if(dom.profileUsername) dom.profileUsername.value = data.username;
    }
}

window.saveProfile = () => {
    const profile = {
        fullname: document.getElementById('prof-fullname').value,
        phone: document.getElementById('prof-phone').value,
        location: document.getElementById('prof-location').value,
        email: document.getElementById('prof-email').value,
        username: document.getElementById('prof-username').value
    };
    localStorage.setItem('np_profile_data', JSON.stringify(profile));
    loadProfileData();
    showToast("Profile Saved");
};

function loadProfilePhoto() {
  const img = localStorage.getItem('np_profile_pic');
  const imgs = document.querySelectorAll('.avatar-img');
  const icons = document.querySelectorAll('.avatar i, .avatar-placeholder i'); 
  const placeholders = document.querySelectorAll('.avatar, .avatar-placeholder'); 

  if(img) {
    imgs.forEach(i => { i.src = img; i.style.display = 'block'; });
    icons.forEach(i => i.style.display = 'none');
    placeholders.forEach(p => p.style.background = 'none'); 
    if(dom.btnDeletePhoto) dom.btnDeletePhoto.style.display = 'flex';
  } else {
    imgs.forEach(i => { i.style.display = 'none'; i.src = ''; });
    icons.forEach(i => i.style.display = 'block');
    placeholders.forEach(p => p.style.background = 'var(--primary)');
    if(document.getElementById('profile-main-icon')) document.getElementById('profile-main-icon').style.background = 'var(--bg-dark)';
    if(dom.btnDeletePhoto) dom.btnDeletePhoto.style.display = 'none';
  }
}

/* --- ADD BLANK ROW --- */
function addBlankRow() {
  const newId = Date.now();
  const blankData = {
    id: newId,
    first: "", last: "", mobile: "", wa: "", tech: "-", recruiter: "-", status: "Active", linkedin: "", resume: "", track: "", assigned: new Date().toISOString().split('T')[0], gmail: "", comments: ""
  };
  
  DB.candidates.push(blankData);
  saveData();
  
  const totalPages = Math.ceil(DB.candidates.length / state.rowsPerPage);
  state.currentPage = totalPages;
  updateTable();
  
  setTimeout(() => {
    const rows = dom.table.body.rows;
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const firstCell = lastRow.cells[2]; 
      if (firstCell) editInlineText(newId, 'first', firstCell);
      lastRow.scrollIntoView({ behavior: 'smooth' });
    }
  }, 100);
  showToast("New row added.");
}

/* --- BULK DELETE --- */
function deleteSelectedRows() {
  if(state.selectedIds.size === 0) return;
  if(confirm(`Delete ${state.selectedIds.size} items?`)) {
    DB.candidates = DB.candidates.filter(c => !state.selectedIds.has(c.id));
    state.selectedIds.clear();
    saveData();
    updateTable();
    updateDashboard();
    showToast("Items Deleted");
  }
}

function toggleSelectAll(checkbox) {
  const isChecked = checkbox.checked;
  const filtered = getFilteredData();
  filtered.forEach(c => {
    if(isChecked) state.selectedIds.add(c.id);
    else state.selectedIds.delete(c.id);
  });
  updateTable();
}

function toggleSelect(id, checkbox) {
  if(checkbox.checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);
  updateTableState();
}

/* --- TABLE --- */
const columns = [
  { id: 'check', label: '<input type="checkbox" id="selectAll" onclick="toggleSelectAll(this)">' },
  { id: 'sl', label: 'Sl No' }, { id: 'first', label: 'First Name' }, { id: 'last', label: 'Last Name' },
  { id: 'mobile', label: 'Mobile' }, { id: 'wa', label: 'WhatsApp' }, { id: 'tech', label: 'Technology' },
  { id: 'recruiter', label: 'Recruiter' }, 
  { id: 'status', label: 'Status' }, 
  { id: 'assigned', label: 'Assigned' }, 
  { id: 'gmail', label: '<i class="fa-solid fa-envelope"></i>' }, 
  { id: 'linkedin', label: '<i class="fa-brands fa-linkedin"></i>' }, 
  { id: 'resume', label: '<i class="fa-solid fa-file"></i>' },
  { id: 'track', label: '<i class="fa-solid fa-table"></i>' },
  { id: 'comments', label: 'Comments' }
];

function renderTableHeaders() {
  dom.table.head.innerHTML = `<tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
}

function getFilteredData() {
  return DB.candidates.filter(c => {
    const textMatch = c.first.toLowerCase().includes(state.filter) || c.last.toLowerCase().includes(state.filter) || c.tech.toLowerCase().includes(state.filter);
    const recMatch = state.recruiterFilter === "" || c.recruiter === state.recruiterFilter;
    const techMatch = state.techFilter === "" || c.tech === state.techFilter;
    const statusMatch = state.statusFilter === "" || c.status === state.statusFilter;
    return textMatch && recMatch && techMatch && statusMatch;
  });
}

function updateTable() {
  const filtered = getFilteredData();
  const totalPages = Math.ceil(filtered.length / state.rowsPerPage);
  if (state.currentPage > totalPages) state.currentPage = totalPages || 1;
  const start = (state.currentPage - 1) * state.rowsPerPage;
  const pageData = filtered.slice(start, start + state.rowsPerPage);

  dom.table.body.innerHTML = pageData.map((c, i) => `
    <tr class="${state.selectedIds.has(c.id) ? 'selected-row' : ''}">
      <td><input type="checkbox" onchange="toggleSelect(${c.id}, this)" ${state.selectedIds.has(c.id) ? 'checked' : ''}></td>
      <td>${start + i + 1}</td>
      <td onclick="editInlineText(${c.id}, 'first', this)">${c.first}</td>
      <td onclick="editInlineText(${c.id}, 'last', this)">${c.last}</td>
      <td onclick="editInlineText(${c.id}, 'mobile', this)">${c.mobile}</td>
      <td onclick="editInlineText(${c.id}, 'wa', this)">${c.wa}</td>
      <td onclick="editInlineText(${c.id}, 'tech', this)">${c.tech}</td>
      <td onclick="editRecruiterInline(${c.id}, this)">${c.recruiter}</td>
      <td>
        <select class="status-select ${c.status === 'Active' ? 'active' : 'inactive'}" onchange="updateStatus(${c.id}, this)">
          <option value="Active" ${c.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${c.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </td>
      <td onclick="editInlineText(${c.id}, 'assigned', this)">${c.assigned}</td>
      <td>${renderLink(c.gmail, 'gmail')}</td>
      <td>${renderLink(c.linkedin)}</td>
      <td>${renderLink(c.resume, 'resume')}</td>
      <td>${renderLink(c.track)}</td>
      <td onclick="editInlineText(${c.id}, 'comments', this)">${c.comments || '-'}</td>
    </tr>
  `).join('');

  dom.table.pageInfo.innerText = `Page ${state.currentPage} of ${totalPages || 1}`;
  renderPagination(totalPages);
  updateTableState();
}

function updateStatus(id, el) {
  const newVal = el.value;
  const idx = DB.candidates.findIndex(c => c.id === id);
  if(idx > -1) {
    DB.candidates[idx].status = newVal;
    saveData();
    el.className = `status-select ${newVal === 'Active' ? 'active' : 'inactive'}`;
    showToast('Status Updated');
  }
}

function updateTableState() {
  if (state.selectedIds.size > 0) {
    dom.table.btnDelete.style.display = 'inline-flex';
    dom.table.selectedCount.innerText = state.selectedIds.size;
  } else {
    dom.table.btnDelete.style.display = 'none';
  }
  const selectAll = document.getElementById('selectAll');
  if(selectAll) selectAll.checked = state.selectedIds.size > 0 && getFilteredData().length > 0;
}

function renderLink(url, type = 'link') {
  if (!url || url === "") return '-';
  let icon = 'fa-link';
  if (type === 'resume') icon = 'fa-file-pdf';
  if (type === 'gmail') icon = 'fa-envelope';
  if (url.includes('linkedin')) icon = 'fa-linkedin';
  return `<div class="url-wrapper"><a href="${url}" target="_blank" class="link-btn"><i class="fa-brands ${icon}"></i></a></div>`;
}

function renderPagination(total) {
  let html = '';
  for(let i=1; i<=total; i++) html += `<button class="${i === state.currentPage ? 'active' : ''}" onclick="gotoPage(${i})">${i}</button>`;
  dom.table.pagination.innerHTML = html;
}

window.gotoPage = (p) => { state.currentPage = p; updateTable(); };

// INLINE EDIT
window.editInlineText = (id, field, el) => {
  if (el.querySelector('input')) return;
  const currentVal = el.innerText === '-' ? '' : el.innerText; 
  el.innerHTML = '';
  const input = document.createElement('input'); 
  input.className = 'inline-input'; 
  input.value = currentVal;
  if(field === 'assigned') input.type = 'date';

  const save = () => {
    const newVal = input.value;
    const idx = DB.candidates.findIndex(c => c.id === id);
    if(idx > -1 && DB.candidates[idx][field] !== newVal) { 
      DB.candidates[idx][field] = newVal; 
      saveData(); 
      showToast('Updated'); 
    }
    updateTable();
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => { if(e.key === 'Enter') save(); });
  el.appendChild(input); input.focus();
};

window.editRecruiterInline = (id, el) => {
  if (el.querySelector('select')) return; 
  const currentVal = el.innerText; el.innerHTML = '';
  const select = document.createElement('select'); select.className = 'inline-select';
  DB.recruiters.forEach(r => { const option = document.createElement('option'); option.value = r; option.text = r; if(r === currentVal) option.selected = true; select.appendChild(option); });
  const save = () => {
    const newVal = select.value;
    const idx = DB.candidates.findIndex(c => c.id === id);
    if(idx > -1) { DB.candidates[idx].recruiter = newVal; saveData(); showToast('Updated'); }
    updateTable();
  };
  select.addEventListener('blur', save); select.addEventListener('change', save);
  el.appendChild(select); select.focus();
};

/* SAVE + TIMESTAMP */
function saveData() {
  localStorage.setItem('np_candidates', JSON.stringify(DB.candidates));
  const now = new Date().toLocaleString();
  localStorage.setItem('np_last_updated', now);
  if(dom.headerUpdated) dom.headerUpdated.innerText = now;
  if(dom.profStatTotal) dom.profStatTotal.innerText = DB.candidates.length;
}

window.exportData = () => {
    const rows = [["ID", "First Name", "Last Name", "Mobile", "Technology", "Recruiter", "Status"]];
    DB.candidates.forEach(c => rows.push([c.id, c.first, c.last, c.mobile, c.tech, c.recruiter, c.status]));
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "candidates_backup.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported successfully");
};

window.resetSystem = () => {
    if(confirm("CRITICAL WARNING: This will delete ALL data. Continue?")) {
        localStorage.clear();
        location.reload();
    }
};

function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }

/* CHARTS */
let charts = {};
function updateDashboard() {
  dom.stats.total.innerText = DB.candidates.length;
  dom.stats.tech.innerText = [...new Set(DB.candidates.map(c => c.tech))].length;
  dom.stats.rec.innerText = DB.recruiters.length;
  if (document.getElementById('view-dashboard').classList.contains('active')) initCharts();
}
function initCharts() {
  const techData = {}, recData = {};
  DB.candidates.forEach(c => { techData[c.tech] = (techData[c.tech] || 0) + 1; recData[c.recruiter] = (recData[c.recruiter] || 0) + 1; });
  renderChart('chart-tech', Object.keys(techData), Object.values(techData), ['#06b6d4', '#22d3ee', '#67e8f9']);
  renderChart('chart-recruiter', Object.keys(recData), Object.values(recData), ['#f59e0b', '#fbbf24', '#fcd34d']);
}
function renderChart(id, lbls, data, clrs) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id).getContext('2d'), { type: 'doughnut', data: { labels: lbls, datasets: [{ data: data, backgroundColor: clrs, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8' } } } } });
}
init();
