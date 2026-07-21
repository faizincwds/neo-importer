import { isLoggedIn, handleLogin, logout } from './auth.js';
import { initViewManager } from './viewManager.js';
import { showToast } from './utils.js';
import { STORAGE_KEYS } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  const mainContent = document.getElementById('main-content');
  const loginView = document.getElementById('view-login');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');
  const navButtons = document.querySelectorAll('#sidebar-nav .nav-btn');
  const loginBtn = document.getElementById('get-token-btn');
  const btnText = document.getElementById('btn-text');
  const btnLoader = document.getElementById('btn-loader');

  // Cek apakah dijalankan lewat server (module bisa di-load)
  if (window.location.protocol === 'file:') {
    showToast('Aplikasi harus dijalankan melalui server lokal (http://). Gunakan Live Server atau npx serve .', 'error');
    loginView.innerHTML = `<div class="text-center text-red-500 p-4">❌ Aplikasi tidak bisa dijalankan langsung dari file. Silakan buka melalui server lokal.</div>`;
    return;
  }

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

  async function checkAuth() {
    if (isLoggedIn()) {
      // User sudah login
      loginView.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      setMenuEnabled(true);
      const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
      const profil = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFIL_PT) || '{}');
      userInfo.textContent = `👤 ${profil.kode_perguruan_tinggi || ''} | ${profil.nama_perguruan_tinggi || ''}`;
      initViewManager(mainContent);
    } else {
      // Belum login
      loginView.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      setMenuEnabled(false);
      userInfo.textContent = '🔒 Belum login';
      mainContent.innerHTML = ''; // kosongkan selain login
      mainContent.appendChild(loginView); // pastikan login view tampil
    }
  }

  // Tombol login
  loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    if (!username || !password) {
      showToast('Username dan password harus diisi', 'error');
      return;
    }
    // Tampilkan loading
    btnText.classList.add('hidden');
    btnLoader.classList.remove('hidden');
    loginBtn.disabled = true;
    const statusEl = document.getElementById('login-status');
    statusEl.textContent = 'Menghubungkan...';

    try {
      const success = await handleLogin(username, password);
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

  logoutBtn.addEventListener('click', () => {
    logout();
    showToast('Logged out', 'info');
    checkAuth();
  });

  // Inisialisasi
  checkAuth();
});