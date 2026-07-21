import { NeoFeederAPI } from './api.js';
import { STORAGE_KEYS } from './config.js';
import { showToast } from './utils.js';

export async function handleLogin(username, password) {
  const api = new NeoFeederAPI();
  try {
    const tokenData = await api.getToken(username, password);
    console.log('Token response:', tokenData);

    if (!api.token) {
      throw new Error('Token tidak ditemukan');
    }

    // Simpan username saja
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({ username }));
    // Hapus profil PT lama (jika ada) agar dashboard memuat ulang
    localStorage.removeItem(STORAGE_KEYS.PROFIL_PT);

    return true;
  } catch (err) {
    console.error('Login error:', err);
    showToast('Login gagal: ' + err.message, 'error');
    return false;
  }
}

export function isLoggedIn() {
  return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function logout() {
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.PROFIL_PT);
}