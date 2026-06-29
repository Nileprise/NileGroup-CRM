// ===================================================================
// NILEPRISE CRM - Complete JavaScript Module
// ===================================================================

// 1. Modal Management System
// ===================================================================
const ModalManager = {
    open(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (modal.classList.contains('modal-overlay')) {
                modal.style.display = 'flex';
            } else {
                modal.classList.remove('hidden');
                document.getElementById('custom-modal-overlay').classList.remove('hidden');
            }
        }
    },

    close(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (modal.classList.contains('modal-overlay')) {
                modal.style.display = 'none';
            } else {
                modal.classList.add('hidden');
                document.getElementById('custom-modal-overlay').classList.add('hidden');
            }
        }
    },

    closeAll() {
        document.querySelectorAll('.modal-overlay, .custom-modal').forEach(modal => {
            modal.style.display = 'none';
            modal.classList.add('hidden');
        });
    }
};

// 2. Toast Notification System
// ===================================================================
const Toast = {
    show(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-msg');
        
        if (toast && toastMsg) {
            toastMsg.textContent = message;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
    }
};

// 3. Confirm Modal System
// ===================================================================
window.openConfirmModal = (title, message, onConfirm) => {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    
    document.getElementById('confirm-btn-cancel').onclick = () => {
        ModalManager.close('confirm-modal');
    };
    
    document.getElementById('confirm-btn-danger').onclick = () => {
        if (typeof onConfirm === 'function') onConfirm();
        ModalManager.close('confirm-modal');
    };
    
    ModalManager.open('confirm-modal');
};

// 4. Add User Modal System
// ===================================================================
window.openAddUserModal = () => {
    document.getElementById('add-user-email').value = '';
    document.getElementById('add-user-role').value = 'Employee';
    ModalManager.open('add-user-modal');
};

window.closeAddUserModal = () => {
    ModalManager.close('add-user-modal');
};

document.addEventListener('DOMContentLoaded', () => {
    const addUserForm = document.getElementById('add-user-modal');
    if (addUserForm) {
        document.getElementById('add-user-btn-cancel').onclick = () => closeAddUserModal();
        document.getElementById('add-user-btn-submit').onclick = () => submitAddUser();
    }
});

window.submitAddUser = async () => {
    const email = document.getElementById('add-user-email').value.trim();
    const role = document.getElementById('add-user-role').value;
    
    if (!email) {
        Toast.show('Please enter an email address', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        Toast.show('Please enter a valid email address', 'error');
        return;
    }
    
    try {
        // Here you would typically make an API call to invite the user
        console.log('Inviting user:', email, 'with role:', role);
        Toast.show(`Invitation sent to ${email}`);
        closeAddUserModal();
    } catch (error) {
        Toast.show('Failed to send invitation', 'error');
        console.error('Error:', error);
    }
};

// 5. Delete Modal System
// ===================================================================
window.openDeleteModal = (type) => {
    const modal = document.getElementById('delete-modal');
    const count = type === 'cand' ? 
        document.querySelectorAll('input[type="checkbox"]:checked').length : 0;
    
    document.getElementById('del-count').textContent = count;
    modal.style.display = 'flex';
};

window.closeDeleteModal = () => {
    document.getElementById('delete-modal').style.display = 'none';
};

window.executeDelete = () => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        Toast.show('Please select items to delete', 'error');
        return;
    }
    
    checkboxes.forEach(cb => {
        const row = cb.closest('tr');
        if (row) row.remove();
    });
    
    Toast.show('Items deleted successfully');
    closeDeleteModal();
    updateSelectedCount();
};

// 6. Export Data System
// ===================================================================
window.exportData = () => {
    const table = document.getElementById('candidates-table');
    if (!table) {
        Toast.show('No data to export', 'error');
        return;
    }
    
    let csv = '';
    
    // Get headers
    const headers = table.querySelectorAll('th');
    headers.forEach((header, index) => {
        csv += header.textContent.trim();
        if (index < headers.length - 1) csv += ',';
    });
    csv += '\n';
    
    // Get data
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        cells.forEach((cell, index) => {
            csv += '"' + cell.textContent.trim().replace(/"/g, '""') + '"';
            if (index < cells.length - 1) csv += ',';
        });
        csv += '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm_data_' + new Date().toISOString().split('T')[0] + '.csv';
    link.click();
    
    Toast.show('Data exported successfully');
};

// 7. Reset System
// ===================================================================
window.resetSystem = () => {
    openConfirmModal(
        'Factory Reset',
        'This will permanently delete all data. Are you sure?',
        () => {
            localStorage.clear();
            location.reload();
            Toast.show('System reset complete');
        }
    );
};

// 8. Navigation System
// ===================================================================
window.switchView = (viewId) => {
    const views = document.querySelectorAll('.content-view');
    views.forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(viewId);
    if (targetView) {
        targetView.classList.add('active');
    }
    
    // Update navigation active state
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.getAttribute('data-target') === viewId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
};

// 9. Mobile Menu System
// ===================================================================
window.toggleMobileMenu = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.toggle('mobile-open');
    if (overlay) overlay.classList.toggle('active');
};

document.addEventListener('DOMContentLoaded', () => {
    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', toggleMobileMenu);
    }
});

// 10. Navigation Event Listeners
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            if (target) {
                switchView(target);
                document.getElementById('sidebar-overlay').classList.remove('active');
                document.getElementById('sidebar').classList.remove('mobile-open');
            }
        });
    });
});

// 11. Logout System
// ===================================================================
window.logout = () => {
    openConfirmModal(
        'Logout',
        'Are you sure you want to logout?',
        () => {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        }
    );
};

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
});

// 12. Form Utilities
// ===================================================================
const FormUtils = {
    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    validateForm(formData) {
        for (let key in formData) {
            if (!formData[key] || formData[key].toString().trim() === '') {
                return false;
            }
        }
        return true;
    },

    clearForm(formId) {
        const form = document.getElementById(formId);
        if (form) form.reset();
    },

    getFormData(formId) {
        const form = document.getElementById(formId);
        if (!form) return null;
        
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            data[key] = value;
        });
        return data;
    }
};

// 13. Table Utilities
// ===================================================================
window.addInlineCandidateRow = () => {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="checkbox" /></td>
        <td><input type="text" placeholder="Name" class="inline-input-active" /></td>
        <td><input type="text" placeholder="Email" class="inline-input-active" /></td>
        <td><input type="text" placeholder="Phone" class="inline-input-active" /></td>
        <td><button class="btn-primary btn-sm" onclick="saveNewRow(this)">Save</button></td>
    `;
    tbody.appendChild(row);
};

window.saveNewRow = (btn) => {
    const row = btn.closest('tr');
    const inputs = row.querySelectorAll('input[type="text"]');
    
    let hasEmpty = false;
    inputs.forEach(input => {
        if (!input.value.trim()) hasEmpty = true;
    });
    
    if (hasEmpty) {
        Toast.show('Please fill all fields', 'error');
        return;
    }
    
    // Convert inputs to display values
    inputs.forEach(input => {
        const value = input.value;
        const td = input.closest('td');
        td.textContent = value;
    });
    
    btn.textContent = 'Edit';
    btn.onclick = () => editRow(btn);
    
    Toast.show('Record saved successfully');
};

window.editRow = (btn) => {
    const row = btn.closest('tr');
    const cells = row.querySelectorAll('td:not(:first-child):not(:last-child)');
    
    cells.forEach(cell => {
        const value = cell.textContent;
        cell.innerHTML = `<input type="text" value="${value}" class="inline-input-active" />`;
    });
    
    btn.textContent = 'Save';
    btn.onclick = () => saveNewRow(btn);
};

// 14. Checkbox Selection
// ===================================================================
window.updateSelectedCount = () => {
    const checkedCount = document.querySelectorAll('input[type="checkbox"]:checked').length;
    const deleteBtn = document.getElementById('btn-delete-selected');
    
    if (deleteBtn) {
        if (checkedCount > 0) {
            deleteBtn.style.display = 'inline-flex';
            document.getElementById('selected-count').textContent = checkedCount;
        } else {
            deleteBtn.style.display = 'none';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedCount);
    });
    
    // Select all checkbox
    const selectAllCheckbox = document.querySelector('thead input[type="checkbox"]');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
                cb.checked = isChecked;
            });
            updateSelectedCount();
        });
    }
});

// 15. Search and Filter
// ===================================================================
window.searchRecords = (searchText, tableId = 'candidates-table') => {
    const table = document.getElementById(tableId);
    const rows = table.querySelectorAll('tbody tr');
    const text = searchText.toLowerCase();
    
    rows.forEach(row => {
        const content = row.textContent.toLowerCase();
        row.style.display = content.includes(text) ? '' : 'none';
    });
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            searchRecords(e.target.value);
        });
    }
});

// 16. Page Title Update
// ===================================================================
window.updatePageTitle = (title, iconClass) => {
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        pageTitle.innerHTML = `<i class="${iconClass}" aria-hidden="true"></i> ${title}`;
    }
};

// 17. Pagination System
// ===================================================================
const Pagination = {
    state: {
        cand: { offset: 0, limit: 50, total: 0 }
    },

    changePage(type, direction) {
        const paging = this.state[type];
        const newOffset = paging.offset + (direction * paging.limit);
        
        if (newOffset >= 0 && newOffset < paging.total) {
            paging.offset = newOffset;
            this.updatePaginationUI(type);
        }
    },

    updatePaginationUI(type) {
        const paging = this.state[type];
        const currentPage = Math.floor(paging.offset / paging.limit) + 1;
        const totalPages = Math.ceil(paging.total / paging.limit);
        
        const indicator = document.getElementById(`${type}-page-indicator`);
        if (indicator) {
            indicator.textContent = `Page ${currentPage} of ${totalPages}`;
        }
    }
};

window.changePage = (type, direction) => {
    Pagination.changePage(type, direction);
};

// 18. Initialization
// ===================================================================
window.init = () => {
    console.log('Nileprise CRM initialized');
    
    // Set default view
    switchView('view-dashboard');
    
    // Update page title
    updatePageTitle('Dashboard', 'fa-solid fa-chart-pie');
    
    // Initialize event listeners
    initializeEventListeners();
};

function initializeEventListeners() {
    // Modal close buttons
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                ModalManager.close(modal.id);
            }
        });
    });
    
    // Custom modal overlay
    const overlayButton = document.getElementById('custom-modal-overlay');
    if (overlayButton) {
        overlayButton.addEventListener('click', () => {
            ModalManager.closeAll();
        });
    }
    
    // Hub note form
    const hubNoteForm = document.getElementById('hub-note-form');
    if (hubNoteForm) {
        hubNoteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            Toast.show('Log entry saved successfully');
            closeHubNoteModal();
            hubNoteForm.reset();
        });
    }
    
    // Add hub note modal functions
    window.openHubNoteModal = (candidateId, logType) => {
        document.getElementById('hub-note-candidate-id').value = candidateId;
        document.getElementById('hub-note-log-type').value = logType;
        document.getElementById('hub-note-date').valueAsDate = new Date();
        ModalManager.open('add-hub-note-modal');
    };
    
    window.closeHubNoteModal = () => {
        ModalManager.close('add-hub-note-modal');
    };
}

// 19. Profile Functions
// ===================================================================
window.triggerPhotoUpload = () => {
    document.getElementById('profile-upload-input')?.click();
};

// 20. Window Load Event
// ===================================================================
window.addEventListener('load', () => {
    init();
});

// 21. Helper Functions
// ===================================================================
window.renderCandidates = () => {
    console.log('Rendering candidates...');
};

window.renderEmployees = () => {
    console.log('Rendering employees...');
};

window.renderOnboarding = () => {
    console.log('Rendering onboarding...');
};

window.renderPlacements = () => {
    console.log('Rendering placements...');
};

// 22. Global Error Handler
// ===================================================================
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

// 23. Session Management
// ===================================================================
const Session = {
    getToken() {
        return localStorage.getItem('authToken');
    },

    setToken(token) {
        localStorage.setItem('authToken', token);
    },

    clearToken() {
        localStorage.removeItem('authToken');
    },

    isAuthenticated() {
        return !!this.getToken();
    }
};

// 24. API Utilities (Template for future backend integration)
// ===================================================================
const API = {
    baseURL: process.env.API_URL || 'https://api.example.com',

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Session.getToken()}`
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
            Toast.show('API request failed', 'error');
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint);
    },

    post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

console.log('Nileprise CRM Script Loaded Successfully');
