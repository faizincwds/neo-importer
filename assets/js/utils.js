// ============================================================
// STRING NORMALIZATION
// ============================================================
export function normalizeString(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.toLowerCase()
    .replace(/[\s_\-\.]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Sanitasi untuk nilai yang akan dimasukkan ke query SQL string.
// Mengganti apostrof lurus dengan melengkung untuk menghindari
// SQL injection sederhana di filter Neo Feeder.
// Catatan: untuk keamanan penuh, gunakan escape `'` → `''` di api.js.
export function sanitizeText(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/'/g, '’').trim();
}

// ============================================================
// STRING SIMILARITY (Levenshtein)
// ============================================================
export function similarity(s1, s2) {
  const a = String(s1 ?? '');
  const b = String(s2 ?? '');
  let longer = a, shorter = b;
  if (a.length < b.length) [longer, shorter] = [b, a];

  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  return (longerLength - editDistance(longer, shorter)) / longerLength;
}

function editDistance(s1, s2) {
  s1 = String(s1 ?? '').toLowerCase();
  s2 = String(s2 ?? '').toLowerCase();

  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
const TOAST_TYPES = {
  success: 'bg-green-500',
  error:   'bg-red-500',
  warning: 'bg-yellow-500',
  info:    'bg-blue-500',
};

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) {
    // Fallback: minimal console warning agar tidak crash
    console.warn('[Toast] #toast-container tidak ada:', message);
    return;
  }

  // Batasi stack — simpan 5 toast terakhir saja
  while (container.children.length >= 5) {
    container.firstChild?.remove();
  }

  const toast = document.createElement('div');
  const bgClass = TOAST_TYPES[type] || TOAST_TYPES.info;
  toast.className = `toast ${bgClass}`;
  toast.setAttribute('role', 'alert');
  toast.textContent = String(message ?? '');
  container.appendChild(toast);

  setTimeout(() => {
    // Fade-out sebelum remove
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3700);
}

// ============================================================
// MODAL HELPERS
// ============================================================
/**
 * Tampilkan modal dengan HTML.
 * PENTING: `contentHTML` di-inject via innerHTML — caller bertanggung jawab
 * memastikan tidak ada input user yang belum di-escape (XSS).
 */
export function showModal(contentHTML) {
  const modal = document.getElementById('modal-container');
  if (!modal) {
    console.warn('[Modal] #modal-container tidak ada');
    return;
  }
  modal.innerHTML = `<div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-lg w-full">${contentHTML ?? ''}</div>`;
  modal.classList.remove('hidden');
}

export function hideModal() {
  const modal = document.getElementById('modal-container');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.innerHTML = '';
}