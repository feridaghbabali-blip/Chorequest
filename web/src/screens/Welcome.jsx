import { useState } from 'react';
import { useApp, CURRENCIES, makeApi, ARTIFACT } from '../store.jsx';
import { AVATARS, Avatar, ColorPicker, EmojiPicker, Field, Seg } from '../ui.jsx';
import { LANGUAGES } from '../translations.js';
import ICON from '../assets/icon.svg';
import { todayStr } from '../shared/schedule.js';

function LangSwitch() {
  const { lang, setLang } = useApp();
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      <Seg options={LANGUAGES.map((l) => ({ value: l.id, label: `${l.flag} ${l.label}` }))} value={lang} onChange={setLang} />
    </div>
  );
}

const publicApi = makeApi(() => ({}));

export default function Welcome() {
  const { t } = useApp();
  const [mode, setMode] = useState('start');

  if (mode === 'create') return <CreateFamily onBack={() => setMode('start')} />;
  if (mode === 'join') return <JoinFamily onBack={() => setMode('start')} />;

  return (
    <div className="app">
      <div className="welcome">
        <img className="logo" src={ICON} alt="" />
        <div>
          <h1 className="big-title">{t('appName')}</h1>
          <p className="muted bold" style={{ fontSize: 18, marginTop: 6 }}>
            {t('tagline')}
          </p>
        </div>
        <div className="floaties" aria-hidden>
          <span>🧹</span>
          <span>🪙</span>
          <span>🔥</span>
          <span>🏆</span>
          <span>🐷</span>
        </div>
        <div className="stack">
          <button className="btn big block" onClick={() => setMode('create')}>
            ✨ {t('createFamily')}
          </button>
          {!ARTIFACT && (
            <button className="btn big block ghost" onClick={() => setMode('join')}>
              🔑 {t('joinFamily')}
            </button>
          )}
        </div>
        <LangSwitch />
      </div>
    </div>
  );
}

function CreateFamily({ onBack }) {
  const { t, setSession, setParentToken, errorText, api } = useApp();
  const [f, setF] = useState({ name: '', parentName: '', avatar: '🦁', color: '#7C4DFF', pin: '', currency: 'AZN', withSamples: true });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await (ARTIFACT ? api : publicApi)('/families', { method: 'POST', body: { ...f, date: todayStr() } });
      setParentToken(r.parentToken);
      setSession({ token: r.token, code: r.code, memberId: r.memberId });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ '--me': f.color }}>
      <form className="stack" style={{ paddingTop: 20 }} onSubmit={submit}>
        <div className="row">
          <button type="button" className="icon-btn" onClick={onBack} aria-label={t('back')}>
            ←
          </button>
          <h1>{t('createFamily')}</h1>
        </div>
        <div className="card stack">
          <Field label={t('familyName')}>
            <input className="input" value={f.name} onChange={set('name')} placeholder={t('familyNamePh')} required maxLength={60} />
          </Field>
          <Field label={t('yourName')}>
            <input className="input" value={f.parentName} onChange={set('parentName')} placeholder={t('yourNamePh')} required maxLength={30} />
          </Field>
        </div>
        <div className="card stack">
          <div className="row">
            <Avatar member={{ avatar: f.avatar, color: f.color }} size="lg" />
            <h3>{f.parentName || t('pickAvatar')}</h3>
          </div>
          <Field label={t('pickAvatar')}>
            <EmojiPicker options={AVATARS} value={f.avatar} onChange={set('avatar')} />
          </Field>
          <Field label={t('pickColor')}>
            <ColorPicker value={f.color} onChange={set('color')} />
          </Field>
        </div>
        <div className="card stack">
          <Field label={t('parentPin')}>
            <input
              className="input code"
              style={{ fontSize: 26 }}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="\d{4,6}"
              maxLength={6}
              value={f.pin}
              onChange={(e) => set('pin')(e.target.value.replace(/\D/g, ''))}
              required
            />
          </Field>
          <p className="small muted">🔒 {t('parentPinHint')}</p>
          <Field label={t('currency')}>
            <select className="input" value={f.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <label className="toggle">
            <input type="checkbox" checked={f.withSamples} onChange={(e) => set('withSamples')(e.target.checked)} />
            {t('addSamples')}
          </label>
        </div>
        {err && <p className="error">{err}</p>}
        <button className="btn big block me" disabled={busy}>
          🚀 {t('createIt')}
        </button>
      </form>
    </div>
  );
}

function JoinFamily({ onBack }) {
  const { t, setSession, errorText } = useApp();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const r = await publicApi('/join', { method: 'POST', body: { code } });
      setSession({ token: r.token, code: code.toUpperCase(), memberId: null });
    } catch (e) {
      setErr(errorText(e));
    }
  }
  return (
    <div className="app">
      <form className="welcome" onSubmit={submit}>
        <div style={{ fontSize: 64 }}>🔑</div>
        <h1>{t('enterCode')}</h1>
        <input className="input code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoFocus placeholder="ABC123" aria-label={t('familyCode')} />
        <p className="muted small">{t('codeHint')}</p>
        {err && <p className="error">{err}</p>}
        <button className="btn big block" disabled={code.length < 6}>
          {t('join')}
        </button>
        <button type="button" className="btn ghost block" onClick={onBack}>
          {t('back')}
        </button>
      </form>
    </div>
  );
}

export function WhoAreYou({ onPicked }) {
  const { t, data, session, setSession } = useApp();
  if (!data) return <div className="empty">{t('loading')}</div>;
  return (
    <div className="app">
      <div className="stack" style={{ paddingTop: 40 }}>
        <div className="center">
          <div style={{ fontSize: 56 }}>👋</div>
          <h1>{t('whoAreYou')}</h1>
          <p className="muted bold">{data.family.name}</p>
        </div>
        <div className="who-grid">
          {data.members.map((m) => (
            <button
              key={m.id}
              className="who"
              style={{ '--c': m.color }}
              onClick={() => {
                setSession({ ...session, memberId: m.id });
                onPicked?.();
              }}
            >
              <Avatar member={m} size="lg" />
              {m.name}
            </button>
          ))}
        </div>
        <p className="center muted small">{t('notInList')}</p>
      </div>
    </div>
  );
}
