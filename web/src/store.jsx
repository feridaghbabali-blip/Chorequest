// App-wide state: who is using this device, the family data from the server,
// personal preferences (language, theme), and live updates.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { translations } from './translations.js';
import { todayStr } from './shared/schedule.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// ---- small localStorage helpers (wrapped so private mode never breaks the app)
export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('cq.' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem('cq.' + key);
      else localStorage.setItem('cq.' + key, JSON.stringify(value));
    } catch {}
  },
};

export class ApiError extends Error {}

export function makeApi(getHeaders) {
  return async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers: { 'content-type': 'application/json', ...getHeaders() },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('offline');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'generic');
    return data;
  };
}

const SYMBOLS = { AZN: '₼', USD: '$', EUR: '€', GBP: '£', TRY: '₺', RUB: '₽', GEL: '₾', KZT: '₸', UAH: '₴' };
export const CURRENCIES = Object.keys(SYMBOLS);

// Text colour (white or dark) that reads well on a member colour
export function inkOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.36 ? '#1e1a3c' : '#ffffff';
}

export function AppProvider({ children }) {
  const [session, setSessionState] = useState(() => store.get('session')); // {token, code, memberId}
  const [parentToken, setParentTokenState] = useState(() => {
    try {
      return sessionStorage.getItem('cq.parent');
    } catch {
      return null;
    }
  });
  const [lang, setLangState] = useState(() => store.get('lang', navigator.language?.startsWith('az') ? 'az' : 'en'));
  const [theme, setThemeState] = useState(() => store.get('theme', 'system'));
  const [data, setData] = useState(() => store.get('cache'));
  const [offline, setOffline] = useState(false);
  const [today, setToday] = useState(todayStr());
  const [toasts, setToasts] = useState([]);

  const headersRef = useRef({});
  headersRef.current = {
    ...(session?.token ? { 'x-family-token': session.token } : {}),
    ...(parentToken ? { 'x-parent-token': parentToken } : {}),
  };
  const api = useMemo(() => makeApi(() => headersRef.current), []);

  const setSession = (s) => {
    store.set('session', s);
    setSessionState(s);
    if (!s) {
      store.set('cache', null);
      setData(null);
    }
  };
  const setParentToken = (t) => {
    try {
      if (t) sessionStorage.setItem('cq.parent', t);
      else sessionStorage.removeItem('cq.parent');
    } catch {}
    setParentTokenState(t);
  };
  const setLang = (l) => {
    store.set('lang', l);
    setLangState(l);
  };
  const setTheme = (th) => {
    store.set('theme', th);
    setThemeState(th);
  };

  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // ---- translations
  const t = useCallback(
    (key, vars) => {
      let s = translations[lang]?.[key] ?? translations.en[key] ?? key;
      if (vars && typeof s === 'string') for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
      return s;
    },
    [lang],
  );

  // ---- money: amounts are whole cents (qəpik)
  const currency = data?.family?.currency || 'AZN';
  const money = useCallback(
    (cents, { sign = false } = {}) => {
      const v = Math.abs(cents || 0) / 100;
      const num = v.toLocaleString(lang === 'az' ? 'az-Latn-AZ' : 'en-GB', {
        minimumFractionDigits: v % 1 ? 2 : 0,
        maximumFractionDigits: 2,
      });
      const sym = SYMBOLS[currency] || currency;
      const str = currency === 'AZN' || !SYMBOLS[currency] ? `${num} ${sym}` : `${sym}${num}`;
      return (sign ? (cents < 0 ? '−' : '+') : cents < 0 ? '−' : '') + str;
    },
    [currency, lang],
  );

  // ---- loading family data
  const refresh = useCallback(async () => {
    if (!session?.token) return;
    const d = todayStr();
    setToday(d);
    try {
      const state = await api('/state?date=' + d);
      setData(state);
      store.set('cache', state);
      setOffline(false);
      if (parentToken && !state.isParent) setParentToken(null); // PIN changed elsewhere
    } catch (e) {
      if (e.message === 'no_family') setSession(null);
      else setOffline(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, parentToken, api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates: the server pings us whenever anything in the family changes.
  useEffect(() => {
    if (!session?.token) return;
    let es;
    let timer;
    const connect = () => {
      es = new EventSource('/api/events?t=' + encodeURIComponent(session.token));
      es.onmessage = () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 150);
      };
      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000);
      };
    };
    connect();
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    const poll = setInterval(refresh, 60_000);
    return () => {
      es?.close();
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [session?.token, refresh]);

  const toast = useCallback((text, opts = {}) => {
    const id = Math.random();
    setToasts((ts) => [...ts, { id, text, ...opts }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), opts.duration || 2600);
  }, []);

  const errorText = useCallback((e) => t('err_' + e.message) !== 'err_' + e.message ? t('err_' + e.message) : t('err_generic'), [t]);

  const me = data?.members?.find((m) => m.id === session?.memberId) || null;

  // Apply my colour to the whole app
  useEffect(() => {
    const c = me?.color || '#7C4DFF';
    document.documentElement.style.setProperty('--me', c);
    document.documentElement.style.setProperty('--me-ink', inkOn(c));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', c);
  }, [me?.color]);

  const value = {
    session,
    setSession,
    parentToken,
    setParentToken,
    isParent: !!parentToken && data?.isParent !== false,
    lang,
    setLang,
    theme,
    setTheme,
    t,
    money,
    currency,
    data,
    me,
    today,
    refresh,
    api,
    offline,
    toast,
    toasts,
    errorText,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
