const urlBar = document.getElementById('url-bar');
const btnBack = document.getElementById('btn-back');
const btnFwd = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const blockedBadge = document.getElementById('blocked-count-badge');
const btnMin = document.getElementById('btn-minimize');
const btnMax = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

// Omnibox submit
urlBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = urlBar.value.trim();
    if (val && window.api) {
      window.api.navigate(val);
      urlBar.blur();
    }
  }
});

// Navigation buttons
btnBack.addEventListener('click', () => window.api && window.api.goBack());
btnFwd.addEventListener('click', () => window.api && window.api.goForward());
btnReload.addEventListener('click', () => window.api && window.api.reload());

// Window controls
btnMin.addEventListener('click', () => window.api && window.api.minimize());
btnMax.addEventListener('click', () => window.api && window.api.maximize());
btnClose.addEventListener('click', () => window.api && window.api.close());

// IPC event listeners from main process
if (window.api) {
  window.api.onNavState((state) => {
    if (state.url && document.activeElement !== urlBar) {
      urlBar.value = state.url.startsWith('file://') ? '' : state.url;
    }
    btnBack.disabled = !state.canGoBack;
    btnFwd.disabled = !state.canGoFwd;
    if (state.title) {
      document.title = state.title + ' - PrivacyBrowser';
    }
  });

  window.api.onBlockedCount((count) => {
    blockedBadge.textContent = count > 999 ? (count / 1000).toFixed(1) + 'k' : count;
  });
}
