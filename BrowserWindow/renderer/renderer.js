const urlBar = document.getElementById('url-bar');
const btnBack = document.getElementById('btn-back');
const btnFwd = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnClear = document.getElementById('btn-clear-url');
const shieldBtn = document.getElementById('shield-button');
const shieldPopover = document.getElementById('shield-popover');
const badgeCount = document.getElementById('blocked-count-badge');
const popoverCount = document.getElementById('popover-blocked-count');

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
  } else if (e.key === 'Escape') {
    urlBar.blur();
  }
});

urlBar.addEventListener('input', () => {
  btnClear.style.display = urlBar.value ? 'flex' : 'none';
});

btnClear.addEventListener('click', () => {
  urlBar.value = '';
  btnClear.style.display = 'none';
  urlBar.focus();
});

// Navigation buttons
btnBack.addEventListener('click', () => window.api && window.api.goBack());
btnFwd.addEventListener('click', () => window.api && window.api.goForward());
btnReload.addEventListener('click', () => window.api && window.api.reload());

// Window controls
btnMin.addEventListener('click', () => window.api && window.api.minimize());
btnMax.addEventListener('click', () => window.api && window.api.maximize());
btnClose.addEventListener('click', () => window.api && window.api.close());

// Toggle Shield Popover
shieldBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  shieldPopover.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!shieldPopover.contains(e.target) && !shieldBtn.contains(e.target)) {
    shieldPopover.classList.add('hidden');
  }
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault();
    urlBar.focus();
    urlBar.select();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    if (window.api) window.api.reload();
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    if (window.api) window.api.goBack();
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    if (window.api) window.api.goForward();
  }
});

// IPC listeners
if (window.api) {
  window.api.onNavState((state) => {
    if (state.url && document.activeElement !== urlBar) {
      urlBar.value = state.url.startsWith('file://') ? '' : state.url;
      btnClear.style.display = urlBar.value ? 'flex' : 'none';
    }
    btnBack.disabled = !state.canGoBack;
    btnFwd.disabled = !state.canGoFwd;
    if (state.title) {
      document.title = state.title + ' — PrivacyBrowser';
    }
  });

  window.api.onBlockedCount((count) => {
    const formatted = count > 999 ? (count / 1000).toFixed(1) + 'k' : count;
    badgeCount.textContent = formatted;
    popoverCount.textContent = count.toLocaleString();
  });
}

// Global keyboard navigation bindings (Ctrl+L, Ctrl+R, Alt+Arrows, Esc)

// Certificate alert and security modal dispatchers
