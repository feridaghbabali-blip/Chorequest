// Little celebration moments. Quick, and skipped when the device asks for reduced motion.
import confetti from 'canvas-confetti';

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function layer() {
  const el = document.createElement('div');
  el.className = 'fx-layer';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
  return el;
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export function coinBurst(amountText, colors) {
  buzz([20, 40, 20]);
  if (reducedMotion()) return;
  const el = layer();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.45;
  for (let i = 0; i < 14; i++) {
    const c = document.createElement('div');
    c.className = 'fx-coin';
    c.textContent = '🪙';
    const angle = (Math.PI * 2 * i) / 14;
    c.style.left = cx - 15 + 'px';
    c.style.top = cy - 15 + 'px';
    c.style.setProperty('--dx', Math.cos(angle) * (120 + Math.random() * 80) + 'px');
    c.style.setProperty('--dy', Math.sin(angle) * (120 + Math.random() * 80) + 120 + 'px');
    c.style.animationDelay = Math.random() * 0.15 + 's';
    el.appendChild(c);
  }
  if (amountText) {
    const a = document.createElement('div');
    a.className = 'fx-amount';
    a.textContent = amountText;
    el.appendChild(a);
  }
  confetti({ particleCount: 40, spread: 70, startVelocity: 30, origin: { y: 0.5 }, colors, scalar: 0.9, ticks: 120 });
}

export function confettiBurst(colors) {
  buzz(40);
  if (reducedMotion()) return;
  const opts = { particleCount: 90, spread: 100, startVelocity: 42, ticks: 160, colors };
  confetti({ ...opts, origin: { x: 0.25, y: 0.6 }, angle: 60 });
  confetti({ ...opts, origin: { x: 0.75, y: 0.6 }, angle: 120 });
}

export function flameBurst() {
  buzz(30);
  if (reducedMotion()) return;
  const el = layer();
  const f = document.createElement('div');
  f.className = 'fx-flame';
  f.textContent = '🔥';
  el.appendChild(f);
}
