import { useEffect, useRef, useState } from 'react';
import { useApp, store, ARTIFACT } from './store.jsx';
import ICON from './assets/icon.svg';
import { Avatar, ConfirmHost, Toasts } from './ui.jsx';
import Welcome, { WhoAreYou } from './screens/Welcome.jsx';
import Today from './screens/Today.jsx';
import Wallet from './screens/Wallet.jsx';
import Family from './screens/Family.jsx';
import Parent from './screens/Parent.jsx';
import MeSheet from './screens/MeSheet.jsx';
import { boardFor } from './board.js';
import { coinBurst, confettiBurst, flameBurst } from './celebrate.js';
import { BADGES } from './shared/schedule.js';

export default function App() {
  const { session, data, me, t, offline, conn } = useApp();
  const [tab, setTab] = useState(() => store.get('tab', 'today'));
  const [meOpen, setMeOpen] = useState(false);
  const go = (x) => {
    setTab(x);
    store.set('tab', x);
    window.scrollTo({ top: 0 });
  };
  useCelebrations();
  useReminder();

  let body;
  if (ARTIFACT && conn !== 'ready')
    body = (
      <div className="app">
        <div className="welcome">
          <img className="logo" src={ICON} alt="" />
          <h2>{conn === 'connecting' ? t('loading') : conn === 'no_db' ? t('needSignIn') : t('cantReach')}</h2>
        </div>
      </div>
    );
  else if (!session) body = <Welcome />;
  else if (!data) body = <div className="empty" style={{ paddingTop: 120 }}>{t('loading')}</div>;
  else if (!me) body = <WhoAreYou />;
  else {
    const pending = data.completions.filter((c) => c.status === 'pending').length;
    const tabs = [
      { id: 'today', ico: '🏠', label: t('navToday') },
      { id: 'wallet', ico: '💰', label: t('navWallet') },
      { id: 'family', ico: '🏆', label: t('navFamily') },
      { id: 'parent', ico: '🔐', label: t('navParent'), dot: pending },
    ];
    body = (
      <div className={'app ' + (tab === 'parent' ? 'wide' : '')}>
        <header className="topbar">
          <span className="brand grow">{t('appName')}</span>
          {me.stats.streak > 0 && (
            <span className="chip flame" title={t('streakDays', { n: me.stats.streak })}>
              🔥 {me.stats.streak}
            </span>
          )}
          <span className="chip" title={t('stillOwed')}>
            <span className="coin">★</span>
            <Owed />
          </span>
          <Avatar member={me} onClick={() => setMeOpen(true)} />
        </header>
        {offline && <div className="banner small" style={{ marginBottom: 12 }}>📡 {t('offline')}</div>}
        <main>
          {tab === 'today' && <Today />}
          {tab === 'wallet' && <Wallet />}
          {tab === 'family' && <Family />}
          {tab === 'parent' && <Parent />}
        </main>
        <nav className="nav" aria-label="Main">
          {tabs.map((x) => (
            <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => go(x.id)} aria-current={tab === x.id ? 'page' : undefined}>
              <span className="ico" aria-hidden>
                {x.ico}
              </span>
              {x.label}
              {x.dot > 0 && <span className="dot">{x.dot}</span>}
            </button>
          ))}
        </nav>
        <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
      </div>
    );
  }

  return (
    <>
      {body}
      <Toasts />
      <ConfirmHost />
    </>
  );
}

function Owed() {
  const { me, money } = useApp();
  return money(me.stats.owed);
}

// Celebrate things that happened to *me* since I last looked:
// chores approved (coins), new badges (confetti), a longer streak (flame).
function useCelebrations() {
  const { me, data, money, t, toast } = useApp();
  const first = useRef(true);
  useEffect(() => {
    if (!me || !data) return;
    const key = 'seen.' + me.id;
    const seen = store.get(key);
    const approved = data.completions.filter((c) => c.member_id === me.id && c.status === 'approved').map((c) => c.id);
    const badges = me.badges.map((b) => b.badge);
    const now = { approved, badges, streak: me.stats.streak };
    store.set(key, now);
    if (!seen) return; // first time on this device: nothing to celebrate yet
    const wait = first.current ? 600 : 0;
    first.current = false;

    const newApproved = approved.filter((id) => !seen.approved.includes(id));
    const amount = data.completions.filter((c) => newApproved.includes(c.id)).reduce((s, c) => s + c.amount, 0);
    const newBadges = badges.filter((b) => !seen.badges.includes(b));
    const colors = [me.color, '#FFC400', '#FF4FA3', '#16C47F', '#2E9BFF'];
    setTimeout(() => {
      if (amount > 0) {
        coinBurst(money(amount, { sign: true }), colors);
        toast(t('approved') + ' ' + money(amount, { sign: true }), { icon: '🪙', big: true });
      }
      if (me.stats.streak > (seen.streak || 0) && me.stats.streak >= 2) setTimeout(flameBurst, amount ? 1100 : 0);
      newBadges.forEach((b, i) =>
        setTimeout(() => {
          confettiBurst(colors);
          const info = BADGES.find((x) => x.id === b);
          toast(`${t('newBadge')} ${t('badge_' + b)}`, { icon: info?.icon, big: true, duration: 3500 });
        }, 1400 + i * 1200),
      );
    }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}

// When the app opens and chores are still waiting, show a phone notification (if allowed).
function useReminder() {
  const { me, data, today, t } = useApp();
  useEffect(() => {
    if (!me || !data || !store.get('reminders') || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const key = 'reminded.' + me.id;
    if (store.get(key) === today) return;
    const left = boardFor(data, me, today).left;
    if (!left) return;
    store.set(key, today);
    const body = left === 1 ? t('reminderOne') : t('reminder', { n: left });
    navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(t('appName'), { body, icon: '/icon-192.png', tag: 'today' }))
      .catch(() => new Notification(t('appName'), { body }));
  }, [me, data, today, t]);
}
