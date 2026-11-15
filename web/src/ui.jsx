// Small reusable building blocks.
import { useEffect, useState } from 'react';
import { useApp, inkOn } from './store.jsx';

export const AVATARS = ['🦁', '🐼', '🦊', '🐯', '🐸', '🐵', '🦄', '🐙', '🦖', '🐨', '🐰', '🐶', '🐱', '🐧', '🦉', '🐝', '🦋', '🐢', '🐬', '🦕', '🐻', '🐮', '🐷', '🦒', '🚀', '⚽', '🎸', '👑'];

export const COLORS = ['#FF4FA3', '#FF5A5F', '#FF8A00', '#FFC400', '#A3D900', '#16C47F', '#00C2A8', '#00B8D9', '#2E9BFF', '#5B6CFF', '#7C4DFF', '#B54DFF'];

export const CHORE_ICONS = ['🛏️', '🧸', '🍽️', '🧽', '🧹', '🗑️', '♻️', '🐱', '🐶', '🐟', '🪴', '🌻', '👕', '🧺', '👟', '🚗', '🛒', '🍳', '🥗', '🧼', '🚿', '🪥', '📚', '✏️', '🎒', '🎹', '🏃', '🚲', '🧑‍🍼', '❄️', '🍂', '🪟', '🛁', '💡', '📦', '⭐'];

export function Avatar({ member, size = '', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={'avatar ' + size} style={{ '--c': member?.color }} onClick={onClick} aria-label={member?.name}>
      <span aria-hidden>{member?.avatar || '🙂'}</span>
    </Tag>
  );
}

export function Price({ cents }) {
  const { money } = useApp();
  return (
    <span className="price">
      <span className="coin" aria-hidden>
        ★
      </span>
      {money(cents)}
    </span>
  );
}

export function Bar({ value, color }) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100;
  return (
    <div className="bar" style={color ? { '--c': color } : undefined} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: pct + '%', minWidth: pct ? 14 : 0 }} />
    </div>
  );
}

export function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && (
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2>{title}</h2>
            <button className="icon-btn plain" onClick={onClose} aria-label="Close" style={{ fontSize: 22 }}>
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Promise-based confirm dialog: `await confirmBox('Delete?')`
let confirmSetter = null;
export function confirmBox(text, { okText, danger } = {}) {
  return new Promise((resolve) => confirmSetter?.({ text, okText, danger, resolve }));
}
export function ConfirmHost() {
  const { t } = useApp();
  const [q, setQ] = useState(null);
  useEffect(() => {
    confirmSetter = setQ;
    return () => (confirmSetter = null);
  }, []);
  const answer = (v) => {
    q?.resolve(v);
    setQ(null);
  };
  return (
    <Sheet open={!!q} onClose={() => answer(false)}>
      <div className="stack" style={{ paddingTop: 6 }}>
        <h2 className="center">{q?.text}</h2>
        <div className="row">
          <button className="btn soft grow" onClick={() => answer(false)}>
            {t('cancel')}
          </button>
          <button className={'btn grow ' + (q?.danger ? '' : 'good')} style={q?.danger ? { '--b': 'var(--bad)' } : undefined} onClick={() => answer(true)}>
            {q?.okText || t('yes')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={'toast ' + (x.big ? 'big' : '')}>
          {x.icon && <span className="t-ico">{x.icon}</span>}
          <span>{x.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      {label}
      {children}
    </label>
  );
}

export function Seg({ options, value, onChange }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmojiPicker({ options, value, onChange, label }) {
  return (
    <div className="pick-grid" role="radiogroup" aria-label={label}>
      {options.map((a) => (
        <button type="button" key={a} role="radio" aria-checked={value === a} className={value === a ? 'on' : ''} onClick={() => onChange(a)}>
          {a}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }) {
  return (
    <div className="colors" role="radiogroup">
      {COLORS.map((c) => (
        <button
          type="button"
          key={c}
          role="radio"
          aria-checked={value?.toLowerCase() === c.toLowerCase()}
          aria-label={c}
          className={value?.toLowerCase() === c.toLowerCase() ? 'on' : ''}
          style={{ background: c, color: c }}
          onClick={() => onChange(c)}
        >
          <span style={{ color: inkOn(c) }}>{value?.toLowerCase() === c.toLowerCase() ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  );
}

// Money input: user types "1.50", we store 150 cents
export function MoneyInput({ value, onChange, ...rest }) {
  const { currency } = useApp();
  const [text, setText] = useState(value ? String(value / 100) : '');
  return (
    <div className="money-input">
      <input
        className="input"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '');
          setText(v);
          onChange(Math.round(parseFloat(v || '0') * 100));
        }}
        {...rest}
      />
      <span className="sym">{currency}</span>
    </div>
  );
}
