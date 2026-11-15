import { useState } from 'react';
import { useApp, CURRENCIES, store } from '../store.jsx';
import { AVATARS, CHORE_ICONS, Avatar, ColorPicker, EmojiPicker, Field, MoneyInput, Price, Seg, Sheet, confirmBox } from '../ui.jsx';
import { repeatText } from '../board.js';
import { coinBurst } from '../celebrate.js';
import { weekStart } from '../shared/schedule.js';

export default function Parent() {
  const { isParent, t, data, setParentToken } = useApp();
  const [tab, setTab] = useState(() => store.get('ptab', 'approvals'));
  if (!isParent) return <PinLock />;
  const pending = data.completions.filter((c) => c.status === 'pending').length;
  const tabs = [
    ['approvals', '✅', t('tabApprovals'), pending],
    ['chores', '📋', t('tabChores')],
    ['payday', '💸', t('tabPayday')],
    ['family', '👨‍👩‍👧', t('tabFamily')],
    ['settings', '⚙️', t('tabSettings')],
  ];
  return (
    <div className="stack">
      <div className="parent-strip">
        <span>🔓</span>
        <span className="grow">{t('parentMode')}</span>
        <button className="btn small soft" onClick={() => setParentToken(null)}>
          🔒 {t('lock')}
        </button>
      </div>
      <div className="tabs" role="tablist">
        {tabs.map(([id, ico, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => {
              setTab(id);
              store.set('ptab', id);
            }}
          >
            {ico} {label}
            {n > 0 && <span className="n">{n}</span>}
          </button>
        ))}
      </div>
      {tab === 'approvals' && <Approvals />}
      {tab === 'chores' && <Chores />}
      {tab === 'payday' && <Payday />}
      {tab === 'family' && <Members />}
      {tab === 'settings' && <FamilySettings />}
    </div>
  );
}

function PinLock() {
  const { t, api, setParentToken, errorText } = useApp();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [shake, setShake] = useState(false);
  async function tryPin(p) {
    try {
      const r = await api('/parent/unlock', { method: 'POST', body: { pin: p } });
      setParentToken(r.parentToken);
    } catch (e) {
      setErr(e.message === 'wrong_pin' ? t('wrongPin') : e.message === 'too_many_tries' ? t('tooManyTries') : errorText(e));
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setPin('');
    }
  }
  const press = (d) => {
    setErr('');
    if (d === '⌫') return setPin((p) => p.slice(0, -1));
    if (d === '✓') return pin.length >= 4 && tryPin(pin);
    const p = (pin + d).slice(0, 6);
    setPin(p);
  };
  return (
    <div className="stack center" style={{ paddingTop: 20 }}>
      <div style={{ fontSize: 56 }}>🔐</div>
      <h1>{t('enterPin')}</h1>
      <div className={'pin-dots ' + (shake ? 'shake' : '')} aria-live="polite">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <p className="error" style={{ minHeight: 22 }}>
        {err}
      </p>
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((d) => (
          <button key={d} onClick={() => press(d)} aria-label={d} style={d === '✓' ? { background: 'var(--good)', color: '#fff' } : undefined}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- approvals ----------
function Approvals() {
  const { t, data, api, money, toast, refresh, errorText, session, fmtDate } = useApp();
  const [reject, setReject] = useState(null);
  const [photo, setPhoto] = useState(null);
  const pending = data.completions.filter((c) => c.status === 'pending');
  const member = (id) => data.members.find((m) => m.id === id);
  const chore = (id) => data.chores.find((c) => c.id === id);

  async function approve(c) {
    try {
      await api(`/completions/${c.id}/approve`, { method: 'POST' });
      const m = member(c.member_id);
      coinBurst(money(c.amount, { sign: true }), [m.color, '#FFC400', '#16C47F']);
      toast(t('approvedToast', { amount: money(c.amount), name: m.name }), { icon: '🪙' });
      refresh();
    } catch (e) {
      toast(errorText(e), { icon: '😕' });
    }
  }
  async function approveAll() {
    for (const c of pending) await api(`/completions/${c.id}/approve`, { method: 'POST' }).catch(() => {});
    coinBurst(money(pending.reduce((s, c) => s + c.amount, 0), { sign: true }), ['#FFC400', '#16C47F', '#FF4FA3']);
    refresh();
  }

  if (!pending.length)
    return (
      <div className="card empty">
        <div className="big">☕</div>
        {t('noApprovals')}
      </div>
    );
  return (
    <div className="stack">
      {pending.map((c) => {
        const m = member(c.member_id);
        const ch = chore(c.chore_id);
        return (
          <div key={c.id} className="card stack" style={{ borderLeft: `6px solid ${m?.color}` }}>
            <div className="row">
              <Avatar member={m} />
              <div className="grow">
                <div className="bold" style={{ fontSize: 17 }}>
                  {ch?.icon} {ch?.title}
                </div>
                <div className="small muted bold">
                  {m?.name} · {fmtDate(c.done_date)}
                </div>
              </div>
              {c.has_photo ? (
                <button className="thumb" onClick={() => setPhoto(c.id)} aria-label="Photo">
                  <img className="thumb" src={`/api/completions/${c.id}/photo?t=${session.token}`} alt="" />
                </button>
              ) : null}
              <Price cents={c.amount} />
            </div>
            <div className="row">
              <button className="btn soft grow" onClick={() => setReject(c)}>
                ↩ {t('sendBack')}
              </button>
              <button className="btn good grow" onClick={() => approve(c)}>
                ✔ {t('approve')}
              </button>
            </div>
          </div>
        );
      })}
      {pending.length > 1 && (
        <button className="btn ghost block" onClick={approveAll}>
          ✅ {t('approveAll', { n: pending.length })}
        </button>
      )}
      <RejectSheet completion={reject} onClose={() => setReject(null)} />
      <Sheet open={!!photo} onClose={() => setPhoto(null)}>
        {photo && <img src={`/api/completions/${photo}/photo?t=${session.token}`} alt="" style={{ width: '100%', borderRadius: 20 }} />}
      </Sheet>
    </div>
  );
}

function RejectSheet({ completion, onClose }) {
  const { t, api, refresh, toast, errorText } = useApp();
  const [note, setNote] = useState('');
  async function send() {
    try {
      await api(`/completions/${completion.id}/reject`, { method: 'POST', body: { note } });
      setNote('');
      onClose();
      refresh();
    } catch (e) {
      toast(errorText(e));
    }
  }
  return (
    <Sheet open={!!completion} onClose={onClose} title={t('sendBackTitle')}>
      <div className="stack">
        <div className="seg">
          {[t('quickNote1'), t('quickNote2'), t('quickNote3')].map((q) => (
            <button key={q} className={note === q ? 'on' : ''} onClick={() => setNote(q)}>
              {q}
            </button>
          ))}
        </div>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePh')} maxLength={140} />
        <button className="btn block" onClick={send}>
          ↩ {t('sendBack')}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- chores ----------
function Chores() {
  const { t, data } = useApp();
  const [edit, setEdit] = useState(null);
  const member = (id) => data.members.find((m) => m.id === id);
  return (
    <div className="stack">
      <button className="btn block big" onClick={() => setEdit({})}>
        ➕ {t('addChore')}
      </button>
      {!data.chores.length && <div className="card empty">{t('noChores')}</div>}
      {data.chores.length > 0 && (
        <div className="list">
          {data.chores.map((c) => {
            const m = member(c.assignee_id);
            return (
              <button key={c.id} className="item" style={{ border: 0, background: 'none', textAlign: 'left', opacity: c.active ? 1 : 0.5 }} onClick={() => setEdit(c)}>
                <span className="emoji">{c.icon}</span>
                <div className="grow">
                  <div className="bold">
                    {c.title} {c.is_bonus && '💎'}
                  </div>
                  <div className="tiny muted bold">
                    {repeatText(t, c)} · {m ? m.name : t('anyone')} {!c.active && '· ' + t('paused')}
                  </div>
                </div>
                {m ? <Avatar member={m} size="sm" /> : <span style={{ fontSize: 22 }}>🙋</span>}
                <Price cents={c.price} />
              </button>
            );
          })}
        </div>
      )}
      <ChoreForm chore={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function ChoreForm({ chore, onClose }) {
  if (!chore) return null;
  return <ChoreFormInner key={chore.id || 'new'} chore={chore} onClose={onClose} />;
}
function ChoreFormInner({ chore, onClose }) {
  const { t, data, api, refresh, toast, errorText, today } = useApp();
  const isNew = !chore.id;
  const [f, setF] = useState({
    title: chore.title || '',
    icon: chore.icon || '🧹',
    price: chore.price ?? 50,
    assignee_id: chore.assignee_id || null,
    repeat: chore.repeat || 'daily',
    weekdays: chore.weekdays || [],
    start_date: chore.start_date || today,
    is_bonus: chore.is_bonus || false,
    active: chore.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const days = t('days');

  async function save() {
    setErr('');
    try {
      const body = f.is_bonus ? { ...f, assignee_id: null } : f;
      if (isNew) await api('/chores', { method: 'POST', body });
      else await api(`/chores/${chore.id}`, { method: 'PATCH', body });
      toast(t('saved'), { icon: '✅' });
      refresh();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    }
  }
  async function remove() {
    if (!(await confirmBox(t('deleteChoreQ'), { danger: true, okText: t('delete') }))) return;
    await api(`/chores/${chore.id}`, { method: 'DELETE' });
    refresh();
    onClose();
  }
  async function togglePause() {
    await api(`/chores/${chore.id}`, { method: 'PATCH', body: { active: !f.active } });
    refresh();
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={isNew ? t('addChore') : t('editChore')}>
      <div className="stack">
        <div className="row">
          <div className="chore" style={{ padding: 0, boxShadow: 'none', background: 'none' }}>
            <div className="tile">{f.icon}</div>
          </div>
          <Field label={t('choreName')}>
            <input className="input" value={f.title} onChange={(e) => set('title')(e.target.value)} placeholder={t('choreNamePh')} maxLength={60} autoFocus={isNew} />
          </Field>
        </div>
        <Field label={t('icon')}>
          <EmojiPicker options={CHORE_ICONS} value={f.icon} onChange={set('icon')} />
        </Field>
        <Field label={t('price')}>
          <MoneyInput value={f.price} onChange={set('price')} />
        </Field>
        <label className="toggle">
          <input type="checkbox" checked={f.is_bonus} onChange={(e) => setF((x) => ({ ...x, is_bonus: e.target.checked, repeat: e.target.checked ? 'once' : x.repeat }))} />
          <span>
            💎 {t('bonusJob')}
            <br />
            <span className="tiny muted">{t('bonusJobHint')}</span>
          </span>
        </label>
        {!f.is_bonus && (
          <Field label={t('whoDoesIt')}>
            <div className="seg">
              <button type="button" className={!f.assignee_id ? 'on' : ''} onClick={() => set('assignee_id')(null)}>
                🙋 {t('anyone')}
              </button>
              {data.members.map((m) => (
                <button type="button" key={m.id} className={f.assignee_id === m.id ? 'on' : ''} onClick={() => set('assignee_id')(m.id)}>
                  {m.avatar} {m.name}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label={t('repeat')}>
          <Seg
            value={f.repeat}
            onChange={set('repeat')}
            options={[
              { value: 'daily', label: t('repeatDaily') },
              { value: 'weekdays', label: t('repeatPickDays') },
              { value: 'weekly', label: t('repeatWeekly') },
              { value: 'once', label: t('repeatOnce') },
            ]}
          />
        </Field>
        {f.repeat === 'weekdays' && (
          <div className="seg">
            {days.map((d, i) => (
              <button
                type="button"
                key={i}
                className={f.weekdays.includes(i) ? 'on' : ''}
                onClick={() => set('weekdays')(f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i].sort())}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <Field label={t('startDate')}>
          <input type="date" className="input" value={f.start_date} onChange={(e) => set('start_date')(e.target.value)} />
        </Field>
        {err && <p className="error">{err}</p>}
        <button className="btn big block" onClick={save} disabled={!f.title.trim()}>
          ✔ {t('save')}
        </button>
        {!isNew && (
          <div className="row">
            <button className="btn soft grow" onClick={togglePause}>
              {f.active ? '⏸ ' + t('pause') : '▶ ' + t('resume')}
            </button>
            <button className="btn danger grow" onClick={remove}>
              🗑 {t('delete')}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------- payday ----------
function Payday() {
  const { t, data, api, money, toast, refresh, today, fmtDate, errorText } = useApp();
  const total = data.members.reduce((s, m) => s + Math.max(0, m.stats.owed), 0);
  const week = fmtDate(weekStart(today), 'dm');
  async function pay(m) {
    if (!(await confirmBox(t('paidQ', { amount: money(m.stats.owed), name: m.name }), { okText: '💸 ' + t('markPaid') }))) return;
    try {
      await api('/payouts', { method: 'POST', body: { memberId: m.id, date: today } });
      toast(t('paidToast', { amount: money(m.stats.owed), name: m.name }), { icon: '💸' });
      refresh();
    } catch (e) {
      toast(errorText(e));
    }
  }
  return (
    <div className="stack">
      <div className="hero" style={{ '--c': '#0E9F6E', color: '#fff' }}>
        <p className="bold" style={{ opacity: 0.9 }}>
          {t('weekOf', { date: week })}
        </p>
        <p className="bold">{t('owedTotal')}</p>
        <h1 style={{ fontSize: 44 }}>{money(total)}</h1>
      </div>
      <div className="list">
        {data.members.map((m) => (
          <div key={m.id} className="item">
            <Avatar member={m} />
            <div className="grow">
              <div className="bold">{m.name}</div>
              <div className="tiny muted bold">{t('earnedThisWeek', { amount: money(m.stats.weekEarned) })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="head" style={{ fontSize: 22, fontWeight: 800 }}>
                {money(m.stats.owed)}
              </div>
              {m.stats.owed > 0 ? (
                <button className="btn small good" onClick={() => pay(m)}>
                  💸 {t('markPaid')}
                </button>
              ) : (
                <span className="tiny muted bold">✓ {t('allPaid')}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- family members ----------
function Members() {
  const { t, data, session, toast, api, refresh } = useApp();
  const [edit, setEdit] = useState(null);
  async function clear() {
    if (!(await confirmBox(t('clearSamplesQ'), { danger: true, okText: t('clearSamples') }))) return;
    await api('/samples/clear', { method: 'POST' });
    toast(t('samplesCleared'), { icon: '🧹' });
    refresh();
  }
  const copy = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'ChoreQuest', text: `${t('familyCode')}: ${data.family.code}`, url: location.origin });
      else {
        await navigator.clipboard.writeText(data.family.code);
        toast(t('copied'), { icon: '📋' });
      }
    } catch {}
  };
  return (
    <div className="stack">
      <div className="card stack">
        <h3>🔑 {t('familyCode')}</h3>
        <div className="code-box">{data.family.code}</div>
        <p className="small muted">{t('shareCode')}</p>
        <button className="btn soft" onClick={copy}>
          📤 {t('copy')}
        </button>
      </div>
      <div className="section-title" style={{ margin: '8px 4px 0' }}>
        {t('members')}
      </div>
      <div className="list">
        {data.members.map((m) => (
          <button key={m.id} className="item" style={{ border: 0, background: 'none', textAlign: 'left' }} onClick={() => setEdit(m)}>
            <Avatar member={m} />
            <div className="grow">
              <div className="bold">
                {m.name} {m.id === session.memberId && '⭐'}
              </div>
              <div className="tiny muted bold">{t('role_' + m.role)}</div>
            </div>
            <span className="muted">✏️</span>
          </button>
        ))}
      </div>
      <button className="btn block" onClick={() => setEdit({})}>
        ➕ {t('addMember')}
      </button>
      {data.hasSamples && (
        <div className="card stack">
          <h3>🧪 {t('sampleData')}</h3>
          <p className="small muted">{t('sampleHint')}</p>
          <button className="btn soft" style={{ color: 'var(--bad)' }} onClick={clear}>
            🧹 {t('clearSamples')}
          </button>
        </div>
      )}
      {edit && <MemberForm key={edit.id || 'new'} member={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function MemberForm({ member, onClose }) {
  const { t, api, refresh, toast, errorText, session } = useApp();
  const isNew = !member.id;
  const [f, setF] = useState({ name: member.name || '', avatar: member.avatar || '🐼', color: member.color || '#2E9BFF', role: member.role || 'kid' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    try {
      if (isNew) await api('/members', { method: 'POST', body: f });
      else await api(`/members/${member.id}`, { method: 'PATCH', body: f });
      toast(t('saved'), { icon: '✅' });
      refresh();
      onClose();
    } catch (e) {
      toast(errorText(e));
    }
  }
  async function remove() {
    if (!(await confirmBox(t('removeMemberQ', { name: member.name }), { danger: true, okText: t('delete') }))) return;
    await api(`/members/${member.id}`, { method: 'DELETE' });
    refresh();
    onClose();
  }
  return (
    <Sheet open onClose={onClose} title={isNew ? t('addMember') : t('editMember')}>
      <div className="stack" style={{ '--me': f.color }}>
        <div className="row">
          <Avatar member={f} size="lg" />
          <Field label={t('name')}>
            <input className="input" value={f.name} onChange={(e) => set('name')(e.target.value)} maxLength={30} autoFocus={isNew} />
          </Field>
        </div>
        <Field label={t('role')}>
          <Seg value={f.role} onChange={set('role')} options={['kid', 'teen', 'adult', 'parent'].map((r) => ({ value: r, label: t('role_' + r) }))} />
        </Field>
        <Field label={t('pickAvatar')}>
          <EmojiPicker options={AVATARS} value={f.avatar} onChange={set('avatar')} />
        </Field>
        <Field label={t('pickColor')}>
          <ColorPicker value={f.color} onChange={set('color')} />
        </Field>
        <button className="btn big block me" onClick={save} disabled={!f.name.trim()}>
          ✔ {t('save')}
        </button>
        {!isNew && member.id !== session.memberId && (
          <button className="btn danger" onClick={remove}>
            🗑 {t('delete')}
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---------- family settings ----------
function FamilySettings() {
  const { t, data, api, refresh, toast, errorText, setParentToken } = useApp();
  const fam = data.family;
  const [f, setF] = useState({ name: fam.name, currency: fam.currency, streak_days: fam.streak_days, streak_bonus: fam.streak_bonus, pin: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    try {
      const body = { ...f };
      if (!body.pin) delete body.pin;
      const r = await api('/family', { method: 'PATCH', body });
      setParentToken(r.parentToken);
      set('pin')('');
      toast(t('saved'), { icon: '✅' });
      refresh();
    } catch (e) {
      toast(errorText(e));
    }
  }
  return (
    <div className="stack">
      <div className="card stack">
        <h3>🏠 {t('familySettings')}</h3>
        <Field label={t('familyName')}>
          <input className="input" value={f.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label={t('currency')}>
          <select className="input" value={f.currency} onChange={(e) => set('currency')(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="card stack">
        <h3>🔥 {t('streakRule')}</h3>
        <Field label={t('streakEvery')}>
          <Seg value={f.streak_days} onChange={set('streak_days')} options={[3, 5, 7].map((n) => ({ value: n, label: String(n) }))} />
        </Field>
        <Field label={t('streakAmount')}>
          <MoneyInput value={f.streak_bonus} onChange={set('streak_bonus')} />
        </Field>
      </div>
      <div className="card stack">
        <h3>🔐 {t('changePin')}</h3>
        <Field label={t('newPin')}>
          <input className="input" type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={(e) => set('pin')(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
        </Field>
      </div>
      <button className="btn big block" onClick={save}>
        ✔ {t('save')}
      </button>
    </div>
  );
}
