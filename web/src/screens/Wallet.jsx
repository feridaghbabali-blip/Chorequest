import { useState } from 'react';
import { useApp } from '../store.jsx';
import { Bar, Field, MoneyInput, Sheet, EmojiPicker } from '../ui.jsx';
import { BADGES, levelFor, parseDate } from '../shared/schedule.js';

const GOAL_ICONS = ['🚲', '🎧', '🎮', '🎨', '⚽', '🛹', '📱', '🧸', '📚', '🎸', '👟', '🎁', '🏕️', '🎟️', '🐶', '💻'];
const JARS = [
  { id: 'spend', icon: '🛍️', color: '#2E9BFF' },
  { id: 'save', icon: '🐷', color: '#FF4FA3' },
  { id: 'give', icon: '💝', color: '#16C47F' },
];

export default function Wallet() {
  const { t, me, money } = useApp();
  const [splitOpen, setSplitOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const s = me.stats;
  const jarMax = Math.max(1, s.spend, s.save, s.give);
  const lvl = levelFor(s.xp);

  return (
    <div className="stack">
      <div className="hero" style={{ '--c': me.color }}>
        <p className="bold" style={{ opacity: 0.9 }}>
          {t('stillOwed')}
        </p>
        <h1 style={{ fontSize: 50 }}>{money(s.owed)}</h1>
        <div className="row" style={{ marginTop: 12, gap: 10 }}>
          <div className="grow" style={{ background: 'rgba(255,255,255,.2)', borderRadius: 16, padding: '8px 12px' }}>
            <div className="tiny bold" style={{ opacity: 0.9 }}>
              {t('earned')}
            </div>
            <div className="head" style={{ fontSize: 22, fontWeight: 800 }}>
              {money(s.earned)}
            </div>
          </div>
          <div className="grow" style={{ background: 'rgba(255,255,255,.2)', borderRadius: 16, padding: '8px 12px' }}>
            <div className="tiny bold" style={{ opacity: 0.9 }}>
              {t('paidOut')}
            </div>
            <div className="head" style={{ fontSize: 22, fontWeight: 800 }}>
              {money(s.paid)}
            </div>
          </div>
        </div>
      </div>

      {/* jars */}
      <div className="card stack">
        <div className="row between">
          <h2>🫙 {t('jars')}</h2>
          <button className="btn small soft" onClick={() => setSplitOpen(true)}>
            ⚖️ {t('changeSplit')}
          </button>
        </div>
        <div className="jars">
          {JARS.map((j) => (
            <div key={j.id} className="jar" style={{ '--j': j.color }}>
              <div className="glass">
                <div className="fill" style={{ height: 8 + (s[j.id] / jarMax) * 80 + '%' }} />
                <div className="emoji">{j.icon}</div>
              </div>
              <div className="bold">{t('jar' + j.id[0].toUpperCase() + j.id.slice(1))}</div>
              <div className="head" style={{ fontSize: 19, fontWeight: 800 }}>
                {money(s[j.id])}
              </div>
              <div className="pct">{me.jar_split[j.id]}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* goal */}
      <div className="card stack">
        <div className="row between">
          <h2>🎯 {t('goal')}</h2>
          <button className="btn small soft" onClick={() => setGoalOpen(true)}>
            ✏️ {me.goal_name ? t('edit') : t('setGoal')}
          </button>
        </div>
        {me.goal_name && me.goal_price ? (
          <>
            <div className="row">
              <div style={{ fontSize: 46 }}>{me.goal_icon || '🎁'}</div>
              <div className="grow">
                <div className="head" style={{ fontSize: 21, fontWeight: 700 }}>
                  {me.goal_name}
                </div>
                <div className="bold muted small">
                  {money(Math.min(s.save, me.goal_price))} / {money(me.goal_price)}
                </div>
              </div>
            </div>
            <Bar value={s.save / me.goal_price} color="#FF4FA3" />
            <p className="bold center">{s.save >= me.goal_price ? t('goalDone') : t('goalLeft', { amount: money(me.goal_price - s.save) })}</p>
          </>
        ) : (
          <p className="muted">{t('goalEmpty')}</p>
        )}
      </div>

      {/* level + badges */}
      <div className="card stack">
        <div className="row">
          <div className="avatar lg" style={{ '--c': me.color, fontFamily: 'var(--head)', fontWeight: 800, fontSize: 34, color: 'var(--me-ink)' }}>
            {lvl.level}
          </div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div>
              <div className="tiny bold muted">{t('level', { n: lvl.level })}</div>
              <div className="head" style={{ fontSize: 22, fontWeight: 800 }}>
                {t('level' + Math.min(lvl.level, 10))}
              </div>
            </div>
            <Bar value={lvl.progress} />
            <div className="tiny bold muted">{t('xpToNext', { n: lvl.next - lvl.xp })}</div>
          </div>
        </div>
        <h3>🏅 {t('badges')}</h3>
        <div className="badges">
          {BADGES.map((b) => {
            const got = me.badges.some((x) => x.badge === b.id);
            return (
              <div key={b.id} className={'badge ' + (got ? '' : 'locked')}>
                <div className="b-ico">{b.icon}</div>
                {t('badge_' + b.id)}
                <span className="d">{t('badge_' + b.id + '_d')}</span>
              </div>
            );
          })}
        </div>
      </div>

      <History />
      <SplitSheet open={splitOpen} onClose={() => setSplitOpen(false)} />
      {goalOpen && <GoalSheet onClose={() => setGoalOpen(false)} />}
    </div>
  );
}

function History() {
  const { t, me, data, money, lang } = useApp();
  const fmt = (d) => parseDate(d).toLocaleDateString(lang === 'az' ? 'az-Latn-AZ' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const waiting = data.completions
    .filter((c) => c.member_id === me.id && c.status === 'pending')
    .map((c) => {
      const ch = data.chores.find((x) => x.id === c.chore_id);
      return { id: c.id, icon: ch?.icon, label: ch?.title, amount: c.amount, date: c.done_date, waiting: true };
    });
  const tx = data.transactions
    .filter((x) => x.member_id === me.id)
    .map((x) => ({
      id: x.id,
      icon: x.icon,
      label: x.type === 'payout' ? t('payout') : x.type === 'bonus' ? t('streakBonus', { n: x.label.split(':')[1] }) : x.label,
      amount: x.type === 'payout' ? -x.amount : x.amount,
      date: x.date,
    }));
  const items = [...waiting, ...tx].slice(0, 60);
  return (
    <div>
      <div className="section-title">📜 {t('history')}</div>
      {!items.length ? (
        <div className="card empty">
          <div className="big">🌱</div>
          {t('noHistory')}
        </div>
      ) : (
        <div className="list">
          {items.map((i) => (
            <div key={i.id} className="item" style={i.waiting ? { opacity: 0.7 } : undefined}>
              <span className="emoji">{i.icon}</span>
              <div className="grow">
                <div className="bold">{i.label}</div>
                <div className="tiny muted bold">
                  {i.date && fmt(i.date)} {i.waiting && '· ⏳ ' + t('waiting')}
                </div>
              </div>
              <span className={i.amount < 0 ? 'amount-minus' : 'amount-plus'}>{money(i.amount, { sign: true })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PRESETS = [
  { spend: 50, save: 30, give: 20 },
  { spend: 70, save: 20, give: 10 },
  { spend: 34, save: 33, give: 33 },
  { spend: 20, save: 70, give: 10 },
];

function SplitSheet({ open, onClose }) {
  const { t, me, api, refresh, toast, errorText } = useApp();
  const [s, setS] = useState(me.jar_split);
  const total = s.spend + s.save + s.give;
  // moving one slider takes from / gives to the others so it stays at 100
  const move = (k, v) => {
    const others = JARS.map((j) => j.id).filter((x) => x !== k);
    let rest = 100 - v;
    const otherSum = others.reduce((a, o) => a + s[o], 0) || 1;
    const a = Math.round((s[others[0]] / otherSum) * rest);
    setS({ [k]: v, [others[0]]: a, [others[1]]: rest - a });
  };
  async function save() {
    try {
      await api(`/members/${me.id}`, { method: 'PATCH', body: { jar_split: s } });
      refresh();
      onClose();
    } catch (e) {
      toast(errorText(e));
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={t('splitTitle')}>
      <div className="stack">
        <div className="seg">
          {PRESETS.map((p, i) => (
            <button key={i} className={p.spend === s.spend && p.save === s.save ? 'on' : ''} onClick={() => setS(p)}>
              {p.spend}/{p.save}/{p.give}
            </button>
          ))}
        </div>
        {JARS.map((j) => (
          <div key={j.id} className="stack" style={{ gap: 4 }}>
            <div className="row between bold">
              <span>
                {j.icon} {t('jar' + j.id[0].toUpperCase() + j.id.slice(1))}
              </span>
              <span className="head" style={{ fontSize: 22, color: j.color }}>
                {s[j.id]}%
              </span>
            </div>
            <input type="range" min={0} max={100} step={5} value={s[j.id]} onChange={(e) => move(j.id, Number(e.target.value))} style={{ accentColor: j.color, width: '100%', height: 32 }} />
          </div>
        ))}
        {total !== 100 && <p className="error">{t('splitMust')}</p>}
        <button className="btn big block me" onClick={save} disabled={total !== 100}>
          ✔ {t('save')}
        </button>
      </div>
    </Sheet>
  );
}

function GoalSheet({ onClose }) {
  const { t, me, api, refresh, toast, errorText } = useApp();
  const [f, setF] = useState({ goal_name: me.goal_name || '', goal_icon: me.goal_icon || '🚲', goal_price: me.goal_price || 0 });
  async function save() {
    try {
      await api(`/members/${me.id}`, { method: 'PATCH', body: f });
      refresh();
      onClose();
    } catch (e) {
      toast(errorText(e));
    }
  }
  return (
    <Sheet open onClose={onClose} title={'🎯 ' + t('goal')}>
      <div className="stack">
        <EmojiPicker options={GOAL_ICONS} value={f.goal_icon} onChange={(v) => setF({ ...f, goal_icon: v })} />
        <Field label={t('goalName')}>
          <input className="input" value={f.goal_name} onChange={(e) => setF({ ...f, goal_name: e.target.value })} placeholder={t('goalNamePh')} maxLength={40} />
        </Field>
        <Field label={t('goalPrice')}>
          <MoneyInput value={f.goal_price} onChange={(v) => setF({ ...f, goal_price: v })} />
        </Field>
        <button className="btn big block me" onClick={save} disabled={!f.goal_name.trim() || !f.goal_price}>
          ✔ {t('save')}
        </button>
      </div>
    </Sheet>
  );
}
