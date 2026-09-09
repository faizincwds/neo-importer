import { isLoggedIn, handleLogin, logout } from './auth.js';
import { initViewManager } from './viewManager.js';
import { showToast } from './utils.js';
import { STORAGE_KEYS } from './config.js';

import { log, loggerInst } from './loggerView.js';

document.addEventListener('DOMContentLoaded', () => {

  const clearLogBtn = document.getElementById('clear-log-btn');
  const mainContent = document.getElementById('main-content');
  const loginView = document.getElementById('view-login');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');
  const navButtons = document.querySelectorAll('#sidebar-nav .nav-btn');
  const loginBtn = document.getElementById('get-token-btn');
  const btnText = document.getElementById('btn-text');
  const btnLoader = document.getElementById('btn-loader');
  const savedUsername = localStorage.getItem('nf_username');
  const savedPassword = localStorage.getItem('nf_password');

  // ---- Toggle Panel Log ----
  const logWrapper = document.getElementById('activity-log-wrapper');
  const logToggleHeader = document.getElementById('log-toggle-header');
  const logChevron = document.getElementById('log-chevron');
  const logBody = document.getElementById('activity-log');
  const logCountSpan = document.getElementById('log-count');

  if (logBody) {
    const observer = new MutationObserver(() => {
      const entries = logBody.querySelectorAll('.log-entry, div[class*="py-1"]').length;
      if (logCountSpan) logCountSpan.textContent = `(${entries})`;
    });
    observer.observe(logBody, { childList: true, subtree: true });
  }
  // Event klik header
  function toggleLogPanel() {
    logWrapper.classList.toggle('log-collapsed');
  }
  logToggleHeader.addEventListener('click', toggleLogPanel);
  if (logChevron) {
    logChevron.addEventListener('click', (e) => {
      e.stopPropagation(); // agar tidak memicu dua kali
      toggleLogPanel();
    });
  }

  // Fungsi update jumlah log (panggil setiap kali log bertambah)
  function updateLogCount() {
    const entries = logBody.querySelectorAll('.log-entry, div[class*="py-1"]').length;
    if (logCountSpan) logCountSpan.textContent = `(${entries})`;
  }

  if (savedUsername) document.getElementById('username').value = savedUsername;
  if (savedPassword) document.getElementById('password').value = savedPassword;

  loggerInst.init();
  log('info', 'Aplikasi siap digunakan');

  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', () => {
        loggerInst.clearLogs();
    });
  }

  // ===== 1. Tema (Dark/Light) =====
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const htmlElement = document.documentElement;

  function setTheme(isDark) {
    if (isDark) {
      htmlElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      htmlElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }


  // Inisialisasi tema (default dark)
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    setTheme(false);
  } else {
    setTheme(true);
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = htmlElement.classList.contains('dark');
      setTheme(!isDark);
    });
  }

  // ===== 2. Sidebar Mobile =====
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const menuToggleBtn = document.getElementById('menu-toggle-btn');

  function openSidebar() {
    sidebar.classList.add('sidebar-open');
    sidebar.classList.remove('-translate-x-full');
    if (overlay) overlay.classList.remove('hidden');
  }

  function closeSidebar() {
    sidebar.classList.remove('sidebar-open');
    sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
  }

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', () => {
      if (sidebar.classList.contains('sidebar-open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Tutup sidebar saat menu diklik di mobile
  document.querySelectorAll('#sidebar-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth < 768) closeSidebar();
    });
  });

  // ===== 3. Validasi lingkungan =====
  if (window.location.protocol === 'file:') {
    showToast('Aplikasi harus dijalankan melalui server lokal (http://). Gunakan Live Server atau npx serve .', 'error');
    loginView.innerHTML = `<div class="text-center text-red-500 p-4">❌ Aplikasi tidak bisa dijalankan langsung dari file. Silakan buka melalui server lokal.</div>`;
    return;
  }

  // ===== 4. Manajemen Menu =====
  function setMenuEnabled(enabled) {
    navButtons.forEach(btn => {
      if (enabled) {
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
      } else {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    });
  }

  // ===== 5. Cek Status Login =====
  async function checkAuth() {
    if (isLoggedIn()) {
      loginView.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      setMenuEnabled(true);
      const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
      const profil = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFIL_PT) || '{}');
      userInfo.textContent = ` © ${profil.website || 'PT'}`;
      initViewManager(mainContent);
    } else {
      loginView.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      setMenuEnabled(false);
      userInfo.textContent = '🔒 Belum login';
      mainContent.innerHTML = '';
      mainContent.appendChild(loginView);
    }
  }

  // ===== 6. Tombol Login =====

  loginBtn.addEventListener('click', async () => {
    const apiUrlInput  = document.getElementById('api-url');
    const apiTypeInput  = document.getElementById('api-type');
    const usernameInput  = document.getElementById('username');
    const passwordInput  = document.getElementById('password');

    if (!apiUrlInput || !apiTypeInput || !usernameInput || !passwordInput) {
      showToast('Form login tidak lengkap. Periksa elemen HTML.', 'error');
      return;
    }

    const apiUrl = apiUrlInput.value.trim() || 'http://localhost:3003';
    const apiType = apiTypeInput.value.trim() || 'live2.php';
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      showToast('Username dan password harus diisi', 'error');
      return;
    }
    
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    loginBtn.disabled = true;
    const statusEl = document.getElementById('login-status');
    statusEl.textContent = 'Menghubungkan...';

    try {
      const success = await handleLogin(apiUrl, apiType, username, password);
      if (success) {
        statusEl.textContent = '✅ Connected';
        showToast('Login berhasil', 'success');
        checkAuth();
      } else {
        statusEl.textContent = '❌ Gagal login';
        showToast('Login gagal. Periksa kredensial atau koneksi API.', 'error');
      }
    } catch (err) {
      statusEl.textContent = '❌ Error: ' + err.message;
      showToast('Error: ' + err.message, 'error');
    } finally {
      btnText.classList.remove('hidden');
      btnLoader.classList.add('hidden');
      loginBtn.disabled = false;
    }
  });

  // ===== 7. Tombol Logout =====
  logoutBtn.addEventListener('click', () => {
    logout();
    showToast('Logged out', 'info');
    checkAuth();
  });

  // ===== 8. Inisialisasi =====
  checkAuth();
});