export function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[\s_\-\.]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function sanitizeText(str) {
  if (!str) return '';
  return String(str).replace(/'/g, '’').trim();
}

export function similarity(s1, s2) {
  let longer = s1, shorter = s2;
  if (s1.length < s2.length) [longer, shorter] = [s2, s1];
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}



function editDistance(s1, s2) {
  s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function showModal(contentHTML) {
  const modal = document.getElementById('modal-container');
  modal.innerHTML = `<div class="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-lg w-full">${contentHTML}</div>`;
  modal.classList.remove('hidden');
}

export function hideModal() {
  const modal = document.getElementById('modal-container');
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

