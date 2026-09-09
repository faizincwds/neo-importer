import { STORAGE_KEYS } from './config.js';
import { showToast } from './utils.js';

export function renderConfigView(container) {
  const savedUrl = localStorage.getItem(STORAGE_KEYS.API_URL) || 'http://localhost:3003';
  const savedType = localStorage.getItem(STORAGE_KEYS.API_TYPE) || 'live2.php';
  const savedUsername = localStorage.getItem('nf_username') || '';

  container.innerHTML = `
    <div class="glass p-6 rounded-2xl max-w-xl mx-auto">
      <h2 class="text-2xl font-bold mb-6">⚙️ Konfigurasi API Feeder</h2>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">URL API Feeder</label>
          <input type="text" id="config-api-url" class="w-full p-3 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100" 
                 value="${savedUrl}" placeholder="http://localhost:3003">
          <p class="text-xs text-gray-500 mt-1">Kosongkan untuk menggunakan default: http://localhost:3003</p>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Type API Feeder</label>
          <select id="config-api-type" class="w-full p-3 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100">
            <option value="live2.php" ${savedType === 'live2.php' ? 'selected' : ''}>live2.php (Live)</option>
            <option value="sandbox2.php" ${savedType === 'sandbox2.php' ? 'selected' : ''}>sandbox2.php (Sandbox)</option>
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-2">Username (opsional, untuk login otomatis)</label>
          <input type="text" id="config-username" class="w-full p-3 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100" 
                 value="${savedUsername}" placeholder="Username Neo Feeder">
        </div>
        
        
        <button id="config-save-btn" class="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition">
          💾 Simpan Konfigurasi
        </button>
      </div>
    </div>
  `;

  document.getElementById('config-save-btn').addEventListener('click', () => {
    const url = document.getElementById('config-api-url').value.trim() || 'http://localhost:3003';
    const type = document.getElementById('config-api-type').value;
    const username = document.getElementById('config-username').value.trim();

    localStorage.setItem(STORAGE_KEYS.API_URL, url);
    localStorage.setItem(STORAGE_KEYS.API_TYPE, type);
    if (username) localStorage.setItem('nf_username', username);

    showToast('Konfigurasi berhasil disimpan! Silakan logout dan login ulang jika perlu.', 'success');
  });
}