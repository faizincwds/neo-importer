import { renderConfigView } from './configView.js';
import { renderDashboard } from './dashboard.js';
import { renderReferensiView } from './referensi.js';
import { renderInsertView } from './insertWizard.js';
import { renderDeleteView } from './deleteWizard.js';
import { renderUpdateView } from './updateWizard.js';

export function initViewManager(mainContent) {
  const navButtons = document.querySelectorAll('#sidebar-nav .nav-btn');
  // ✅ SIMPAN DULU kotak log sebelum membersihkan isi
  const logWrapper = document.getElementById('activity-log-wrapper');

  async function loadView(viewName) {
    // Bersihkan main content (kecuali jika masih ada login view)
    mainContent.innerHTML = '';

    switch(viewName) {
      case 'dashboard':
        await renderDashboard(mainContent);
        break;
      case 'import':
        renderInsertView(mainContent);
        break;
      case 'delete':
        renderDeleteView(mainContent);
        break;
      case 'update':
        renderUpdateView(mainContent);
        break;
      case 'referensi':
        await renderReferensiView(mainContent);
        break;
      case 'config':
        renderConfigView(mainContent);
        break;
      default:
        mainContent.innerHTML = `<div class="glass p-6 rounded-2xl"><h2 class="text-xl font-bold">${viewName} (Segera hadir)</h2></div>`;
    }

    // MASUKKAN KEMBALI kotak log DI PALING BAWAH
    if (logWrapper) mainContent.appendChild(logWrapper);

    // Update active state
    navButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => loadView(btn.dataset.view));
  });

  // Load dashboard sebagai default
  loadView('dashboard');
}