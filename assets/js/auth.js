import { NeoFeederAPI } from './api.js';
import { STORAGE_KEYS, DEBUG_API } from './config.js';
import { showToast } from './utils.js';
import { clearAllCache } from './cleanup.js';

export async function handleLogin(apiUrl, apiType, username, password) {
  // Simpan konfigurasi API
  localStorage.setItem(STORAGE_KEYS.API_URL, apiUrl);
  localStorage.setItem(STORAGE_KEYS.API_TYPE, apiType);

  const api = new NeoFeederAPI();
  try {
    const tokenData = await api.getToken(username, password);
    if (DEBUG_API)console.log('Token response:', tokenData);

    if (!api.token) {
      throw new Error('Token tidak ditemukan');
    }

    // Simpan username saja
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({ username }));
    localStorage.removeItem(STORAGE_KEYS.PROFIL_PT);

    return true;
    
  } catch (err) {
    if (DEBUG_API) console.error('Login error:', err);

    showToast(err.message, 'error');
    return false;
  }
}

export function isLoggedIn() {
  return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
}

export function logout() {
  //  1. Hapus kredensial
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.USER);
  localStorage.removeItem(STORAGE_KEYS.PROFIL_PT);

  // 2. Hapus seluruh cache referensi
  clearAllCache();

}