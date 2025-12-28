const urlBar = document.getElementById('url-bar');
const btnBack = document.getElementById('btn-back');
const btnFwd = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnClear = document.getElementById('btn-clear-url');

const radarBtn = document.getElementById('radar-toggle-btn');
const radarHud = document.getElementById('radar-hud');
const badgeCount = document.getElementById('blocked-count-badge');
const statTotal = document.getElementById('stat-total-blocked');
const statEntropy = document.getElementById('stat-entropy-blocked');
const hudLog = document.getElementById('hud-recent-log');

const canvas = document.getElementById('radar-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;

// Window controls
document.getElementById('btn-minimize').addEventListener('click', () => window.api && window.api.minimize());
document.getElementById('btn-maximize').addEventListener('click', () => window.api && window.api.maximize());
document.getElementById('btn-close').addEventListener('click', () => window.api && window.api.close());

// Omnibox
urlBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const val = urlBar.value.trim();
    if (val && window.api) {
      window.api.navigate(val);
      urlBar.blur();
    }
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

btnBack.addEventListener('click', () => window.api && window.api.goBack());
btnFwd.addEventListener('click', () => window.api && window.api.goForward());
btnReload.addEventListener('click', () => window.api && window.api.reload());

radarBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  radarHud.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!radarHud.contains(e.target) && !radarBtn.contains(e.target)) {
    radarHud.classList.add('hidden');
  }
});

// Particles for Radar Canvas
const particles = [];
for (let i = 0; i < 24; i++) {
  particles.push({
    x: Math.random() * (canvas ? canvas.width : 340),
    y: Math.random() * (canvas ? canvas.height : 120),
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    radius: Math.random() * 2 + 1,
    alpha: Math.random() * 0.8 + 0.2
  });
}

function renderRadar() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid scan line
  const time = performance.now() * 0.001;
  const scanX = ((time * 60) % canvas.width);

  ctx.strokeStyle = 'rgba(6, 182, 212, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(scanX, 0);
  ctx.lineTo(scanX, canvas.height);
  ctx.stroke();

  // Draw and update particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;

    ctx.fillStyle = `rgba(6, 182, 212, ${p.alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(renderRadar);
}

if (ctx) requestAnimationFrame(renderRadar);

// IPC Listener
if (window.api) {
  window.api.onNavState((state) => {
    if (state.url && document.activeElement !== urlBar) {
      urlBar.value = state.url.startsWith('file://') ? '' : state.url;
      btnClear.style.display = urlBar.value ? 'flex' : 'none';
    }
    btnBack.disabled = !state.canGoBack;
    btnFwd.disabled = !state.canGoFwd;
  });

  window.api.onNexusTelemetry((telemetry) => {
    badgeCount.textContent = telemetry.blockedCount;
    statTotal.textContent = telemetry.blockedCount;
    statEntropy.textContent = telemetry.entropyThreats;
    if (telemetry.recentBlockedReason) {
      hudLog.textContent = telemetry.recentBlockedReason;
    }
  });
}
