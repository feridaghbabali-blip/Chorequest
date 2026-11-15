import { useState } from 'react';
import { useApp, store } from '../store.jsx';
import { AVATARS, Avatar, ColorPicker, EmojiPicker, Field, Seg, Sheet, confirmBox } from '../ui.jsx';
import { LANGUAGES } from '../translations.js';

export default function MeSheet({ open, onClose }) {
  const { t, me, lang, setLang, theme, setTheme, session, setSession, setParentToken, api, refresh, data } = useApp();
  const [reminders, setReminders] = useState(() => !!store.get('reminders'));
  const [blocked, setBlocked] = useState(false);
  if (!me) return null;

  const update = async (body) => {
    await api(`/members/${me.id}`, { method: 'PATCH', body });
    refresh();
  };
  async function toggleReminders(on) {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {
        setBlocked(true);
        on = false;
      }
    }
    store.set('reminders', on);
    store.set('reminded.' + me.id, null);
    setReminders(on);
  }
  async function leave() {
    if (!(await confirmBox(t('leaveQ'), { danger: true }))) return;
    setParentToken(null);
    setSession(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('settings')}>
      <div className="stack">
        <div className="card row">
          <Avatar member={me} size="lg" />
          <div className="grow">
            <h2>{me.name}</h2>
            <div className="small muted bold">
              {data.family.name} · {t('role_' + me.role)}
            </div>
          </div>
        </div>
        <button
          className="btn ghost block"
          onClick={() => {
            setParentToken(null);
            setSession({ ...session, memberId: null });
            onClose();
          }}
        >
          🔄 {t('switchPerson')}
        </button>

        <div className="card stack">
          <h3>🎨 {t('myLook')}</h3>
          <EmojiPicker options={AVATARS} value={me.avatar} onChange={(avatar) => update({ avatar })} />
          <ColorPicker value={me.color} onChange={(color) => update({ color })} />
        </div>

        <div className="card stack">
          <Field label={'🌍 ' + t('language')}>
            <Seg options={LANGUAGES.map((l) => ({ value: l.id, label: `${l.flag} ${l.label}` }))} value={lang} onChange={setLang} />
          </Field>
          <Field label={'🌗 ' + t('theme')}>
            <Seg
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: '✨ ' + t('themeSystem') },
                { value: 'light', label: '☀️ ' + t('themeLight') },
                { value: 'dark', label: '🌙 ' + t('themeDark') },
              ]}
            />
          </Field>
          <label className="toggle">
            <input type="checkbox" checked={reminders} onChange={(e) => toggleReminders(e.target.checked)} />
            <span>
              ⏰ {t('reminders')}
              <br />
              <span className="tiny muted">{blocked ? t('remindersBlocked') : t('remindersHint')}</span>
            </span>
          </label>
        </div>
        <p className="tiny muted center">📲 {t('installTip')}</p>
        <button className="btn danger" onClick={leave}>
          🚪 {t('leaveFamily')}
        </button>
      </div>
    </Sheet>
  );
}
