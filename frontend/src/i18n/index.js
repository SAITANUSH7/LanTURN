import en from './translations/en.js';
import hi from './translations/hi.js';
import te from './translations/te.js';

export const LANGUAGES = [
  { code: 'en', name: 'English',  nativeName: 'English',  flag: '🇬🇧' },
  { code: 'hi', name: 'Hindi',    nativeName: 'हिन्दी',   flag: '🇮🇳' },
  { code: 'te', name: 'Telugu',   nativeName: 'తెలుగు',   flag: '🇮🇳' },
];

const bundles = { en, hi, te };

/**
 * Resolve a dot-notated key (e.g. 'nav.dashboard') from a translation bundle.
 * Returns `undefined` if any segment is missing.
 */
function resolve(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}

/**
 * Create a translator function bound to a specific language.
 * Falls back to English if the key is missing in the target language.
 *
 * Supports simple interpolation:
 *   t('studentDash.welcomeBack', { name: 'Alice' })
 *   → "Welcome back, Alice 👋"
 */
export function createT(lang = 'en') {
  const bundle = bundles[lang] || bundles.en;

  return function t(key, vars) {
    let text = resolve(bundle, key) ?? resolve(bundles.en, key) ?? key;

    if (vars && typeof text === 'string') {
      Object.entries(vars).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      });
    }

    return text;
  };
}
