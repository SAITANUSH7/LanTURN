import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { createT, LANGUAGES } from '../i18n/index.js';

const LanguageContext = createContext(null);

export { LANGUAGES };

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem('lang');
    // Default to English for existing users (or if nothing saved)
    const lang = saved && ['en', 'hi', 'te'].includes(saved) ? saved : 'en';
    document.documentElement.lang = lang;
    return lang;
  });

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
  }, []);

  const t = useMemo(() => createT(language), [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    LANGUAGES,
  }), [language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
