import { useApp } from '../store.jsx';
import { Avatar, Bar } from '../ui.jsx';
import { BADGES, levelFor } from '../shared/schedule.js';

// A friendly weekly board: everyone gets a kind title, nobody is "last".
export default function Family() {
  const { t, data, money } = useApp();
  const members = [...data.members].sort((a, b) => b.stats.weekCount - a.stats.weekCount || b.stats.weekEarned - a.stats.weekEarned);
  const total = members.reduce((s, m) => s + m.stats.weekCount, 0);
  const top = members[0]?.stats.weekCount || 0;
  const cheer = (m, i) => {
    const n = m.stats.weekCount;
    if (!n) return ['🌱', t('cheerStart')];
    if (i === 0 || n === top) return ['👑', t('cheerTop')];
    if (n >= top / 2) return ['🚀', t('cheerGreat')];
    return ['🤝', t('cheerGood')];
  };
  return (
    <div className="stack">
      <div className="hero" style={{ '--c': '#E8590C', color: '#fff' }}>
        <p className="bold" style={{ opacity: 0.9 }}>
          {t('thisWeek')} · {data.family.name}
        </p>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>{total === 0 ? t('teamTotalZero') : total === 1 ? t('teamTotalOne') : t('teamTotal', { n: total })}</h1>
        <div style={{ fontSize: 30, marginTop: 8 }} aria-hidden>
          {members.map((m) => m.avatar).join(' ')}
        </div>
      </div>
      <div className="section-title">🏆 {t('leaderboard')}</div>
      {members.map((m, i) => {
        const [ico, label] = cheer(m, i);
        const lvl = levelFor(m.stats.xp);
        return (
          <div key={m.id} className="lb" style={{ '--c': m.color }}>
            <Avatar member={m} size="lg" />
            <div className="grow stack" style={{ gap: 6 }}>
              <div className="row between">
                <div className="head" style={{ fontSize: 21, fontWeight: 800 }}>
                  {m.name}
                </div>
                <div className="bold small">{money(m.stats.weekEarned)}</div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="cheer">
                  {ico} {label}
                </span>
                {m.stats.streak > 1 && <span className="cheer">🔥 {m.stats.streak}</span>}
                <span className="cheer">⭐ {t('level', { n: lvl.level })}</span>
              </div>
              <Bar value={top ? m.stats.weekCount / top : 0} color={m.color} />
              <div className="row between tiny bold muted">
                <span>{t('choresCount', { n: m.stats.weekCount })}</span>
                <span aria-label={t('badges')}>{m.badges.map((b) => BADGES.find((x) => x.id === b.badge)?.icon).join('')}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
