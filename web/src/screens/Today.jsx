import { useRef, useState } from 'react';
import { useApp } from '../store.jsx';
import { Avatar, Bar, Price } from '../ui.jsx';
import { boardFor, repeatText, resizePhoto } from '../board.js';

export default function Today() {
  const { t, data, me, today, fmtDate } = useApp();
  const b = boardFor(data, me, today);
  const dateText = fmtDate(today, 'long');

  return (
    <div className="stack">
      <div className="hero" style={{ '--c': me.color }}>
        <div className="row">
          <Avatar member={me} size="lg" />
          <div className="grow">
            <p className="bold" style={{ opacity: 0.85 }}>
              {dateText}
            </p>
            <h1>{t('hi', { name: me.name })}</h1>
          </div>
        </div>
        {b.total > 0 && (
          <div className="stack" style={{ gap: 8, marginTop: 16 }}>
            <div className="row between bold">
              <span>{t('todayProgress', { done: b.done, total: b.total })}</span>
              <span style={{ fontSize: 22 }}>{b.left === 0 ? '🎉' : '💪'}</span>
            </div>
            <Bar value={b.done / b.total} />
          </div>
        )}
      </div>

      {b.left > 0 && (
        <div className="banner" role="status">
          <span className="emoji">⏰</span>
          <span>{b.left === 1 ? t('reminderOne') : t('reminder', { n: b.left })}</span>
        </div>
      )}

      <div>
        <div className="section-title">
          ⭐ {t('myChores')} <span className="count">{b.total}</span>
        </div>
        {b.total === 0 ? (
          <div className="card empty">
            <div className="big">🎈</div>
            {t('nothingToday')}
          </div>
        ) : b.left === 0 ? (
          <>
            <div className="card empty" style={{ marginBottom: 12 }}>
              <div className="big">🏆</div>
              {t('allDone')}
            </div>
            <Cards items={b.mine} />
          </>
        ) : (
          <Cards items={b.mine} />
        )}
      </div>

      {b.open.length > 0 && (
        <div>
          <div className="section-title">
            🙋 {t('upForGrabs')} <span className="count">{b.open.length}</span>
          </div>
          <Cards items={b.open} />
        </div>
      )}

      {b.bonus.length > 0 && (
        <div>
          <div className="section-title">
            💎 {t('bonusJobs')} <span className="count">{b.bonus.length}</span>
          </div>
          <p className="muted small bold" style={{ margin: '-4px 4px 10px' }}>
            {t('bonusHint')}
          </p>
          <Cards items={b.bonus} />
        </div>
      )}
    </div>
  );
}

function Cards({ items }) {
  return (
    <div className="board-grid">
      {items.map((i) => (
        <ChoreCard key={i.chore.id} {...i} />
      ))}
    </div>
  );
}

export function ChoreCard({ chore, completion }) {
  const { t, data, me, api, today, toast, errorText, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const fileRef = useRef();
  const owner = data.members.find((m) => m.id === (completion?.member_id || chore.assignee_id));
  const mineNow = !completion || completion.member_id === me.id;
  const status = completion?.status;
  const color = owner?.color || me.color;

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast(errorText(e), { icon: '😕' });
    } finally {
      setBusy(false);
    }
  }
  const done = (photo) =>
    act(async () => {
      await api(`/chores/${chore.id}/done`, { method: 'POST', body: { memberId: me.id, date: today, photo } });
      setWiggle(true);
      setTimeout(() => setWiggle(false), 600);
      toast(t('sentForApproval'), { icon: '📨' });
    });
  const claim = () => act(() => api(`/chores/${chore.id}/claim`, { method: 'POST', body: { memberId: me.id, date: today } }));
  const undo = () => act(() => api(`/completions/${completion.id}/undo`, { method: 'POST' }));
  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      done(await resizePhoto(file));
    } catch {
      toast(t('err_generic'));
    }
  };

  let actions;
  if (!mineNow) {
    actions = (
      <div className="status-pill other">
        <Avatar member={owner} size="sm" />
        {status === 'claimed' || status === 'rejected' ? t('isOnIt', { name: owner?.name }) : t('didIt', { name: owner?.name })}
      </div>
    );
  } else if (status === 'approved') {
    actions = <div className="status-pill approved">✅ {t('approved')}</div>;
  } else if (status === 'pending') {
    actions = (
      <>
        <div className="status-pill pending">⏳ {t('waiting')}</div>
        <button className="btn soft small" style={{ flex: 'none', minHeight: 52 }} onClick={undo} disabled={busy}>
          ↩ {t('undo')}
        </button>
      </>
    );
  } else if (!chore.assignee_id && !completion) {
    actions = (
      <button className="btn big me" onClick={claim} disabled={busy}>
        🙋 {t('claim')}
      </button>
    );
  } else {
    actions = (
      <>
        <button className="btn big good" onClick={() => done()} disabled={busy}>
          ✔ {status === 'rejected' ? t('tryAgain') : t('done')}
        </button>
        <button className="icon-btn" style={{ width: 60, height: 60, borderRadius: 20, fontSize: 26 }} onClick={() => fileRef.current.click()} disabled={busy} aria-label={t('addPhoto')} title={t('addPhoto')}>
          📷
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
      </>
    );
  }

  return (
    <div className={`chore status-${status || 'todo'} ${chore.is_bonus ? 'bonus' : ''} ${wiggle ? 'wiggle' : ''}`} style={{ '--c': color }}>
      <div className="top">
        <div className="tile" aria-hidden>
          {chore.icon}
        </div>
        <div className="grow">
          <div className="title">{chore.title}</div>
          <div className="meta" style={{ marginTop: 6 }}>
            <Price cents={chore.price} />
            <span>· {repeatText(t, chore)}</span>
          </div>
        </div>
        {chore.assignee_id && owner && owner.id !== me.id && <Avatar member={owner} size="sm" />}
      </div>
      {status === 'rejected' && mineNow && completion.note && (
        <div className="note">
          <span>💬</span>
          <span>{completion.note}</span>
        </div>
      )}
      <div className="actions">{actions}</div>
    </div>
  );
}
