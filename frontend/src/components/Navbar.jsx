import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext.jsx';
import { useQuery } from '@tanstack/react-query';
import { notificationService } from '../services/notification.service.js';
import {
  ArrowLeft, ArrowRight, Bell, LogOut, ChevronDown, Moon, Sun, Globe, User,
  LayoutDashboard, Briefcase, FileText, Sparkles, Map, Menu, X, Users,
} from 'lucide-react';
import { useState } from 'react';

const DASHBOARD_PATHS = ['/dashboard', '/employer/dashboard', '/admin'];

const STUDENT_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'nav.dashboard' },
  { to: '/jobs', icon: Briefcase, label: 'Jobs', key: 'nav.jobs' },
  { to: '/applications', icon: FileText, label: 'Applications', key: 'nav.applications' },
  { to: '/networking', icon: Users, label: 'Network', key: 'nav.networking' },
  { to: '/ai', icon: Sparkles, label: 'AI Assistant', key: 'nav.aiAssistant' },
  { to: '/career-aisle', icon: Map, label: 'Career', key: 'nav.careerAisle' },
];

const EMPLOYER_NAV = [
  { to: '/employer/dashboard', icon: LayoutDashboard, label: 'Dashboard', key: 'nav.dashboard' },
  { to: '/employer/jobs', icon: Briefcase, label: 'Jobs', key: 'nav.jobs' },
  { to: '/networking', icon: Users, label: 'Network', key: 'nav.networking' },
  { to: '/employer/ai-assistant', icon: Sparkles, label: 'AI Assistant', key: 'nav.aiAssistant' },
];

export default function Navbar() {
  const { session, role, logout } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme') === 'dark';
    if (saved) document.documentElement.classList.add('dark-theme');
    return saved;
  });

  const isOnDashboard = DASHBOARD_PATHS.includes(location.pathname);
  const navLinks = role === 'employer' ? EMPLOYER_NAV : role === 'student' ? STUDENT_NAV : [];
  const dashboardPath = role === 'employer' ? '/employer/dashboard' : role === 'admin' ? '/admin' : '/dashboard';

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark-theme');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-theme');
      localStorage.setItem('theme', 'light');
    }
  };

  const { data: notifs } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 20 }),
    enabled: !!session,
    refetchInterval: 60000,
  });

  const unread = notifs?.items?.filter((n) => !n.read).length ?? 0;
  const displayName = session?.profile?.personal?.name || session?.email?.split('@')[0] || 'User';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 bg-brand-900 flex items-center px-4 gap-2 border-b-2 border-brand-900"
      style={{
        backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.12) 0.8px, transparent 1px)',
        backgroundSize: '8px 8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
      }}
    >
      {/* Logo / Back */}
      {isOnDashboard ? (
        <NavLink to="/" className="flex items-center gap-2 mr-2 flex-shrink-0">
          <img src="/hero-logo.png" alt="lanTURN Logo" className="h-10 w-auto object-contain brightness-0 invert" />
          <span className="text-lg font-extrabold text-white hidden sm:flex items-center tracking-tight">
            lan<span className="relative">TURN<ArrowRight className="absolute inset-0 text-accent opacity-60 w-full h-full -z-10" strokeWidth={4} style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }} /></span>
          </span>
        </NavLink>
      ) : (
        <button
          onClick={() => navigate(dashboardPath)}
          className="flex items-center gap-2 h-9 px-3 rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          <img src="/hero-logo.png" alt="lanTURN" className="h-7 w-auto object-contain brightness-0 invert" />
        </button>
      )}

      {/* Nav icons — expand on hover to show label (desktop) */}
      {navLinks.length > 0 && (
        <nav className="hidden lg:flex items-center gap-1 ml-2">
          {navLinks.map(({ to, icon: Icon, label, key }) => {
            const isActive = location.pathname === to || (to !== dashboardPath && location.pathname.startsWith(to));
            const displayLabel = key ? t(key) : label;
            return (
              <NavLink
                key={to}
                to={to}
                className={`group flex items-center gap-0 rounded-md text-sm font-medium transition-all duration-200 overflow-hidden ${
                  isActive
                    ? 'bg-accent text-brand-900 px-3 py-1.5 gap-2 border-2 border-brand-900 shadow-soft-sm'
                    : 'text-white/80 hover:bg-white/10 hover:text-white px-2 py-1.5 hover:px-3 hover:gap-2'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className={`whitespace-nowrap text-xs ${isActive ? 'opacity-100 w-auto' : 'opacity-0 w-0 group-hover:opacity-100 group-hover:w-auto'} transition-all duration-200`}>
                  {displayLabel}
                </span>
              </NavLink>
            );
          })}
        </nav>
      )}

      <div className="flex-1" />

      {/* Mobile menu toggle — visible < lg when nav exists */}
      {navLinks.length > 0 && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden h-9 w-9 rounded-md flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors flex-shrink-0"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <NavLink
          to={role === 'employer' ? '/employer/notifications' : '/notifications'}
          className="relative h-9 w-9 rounded-md flex items-center justify-center text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Bell className="h-4.5 w-4.5" style={{ width: '18px', height: '18px' }} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent text-white text-[10px] flex items-center justify-center font-bold ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </NavLink>

        {/* User menu */}
        <div className="relative group">
          <button className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 transition-colors">
            <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center text-brand-900 text-xs font-extrabold flex-shrink-0 border-2 border-brand-900">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <ChevronDown className="h-3 w-3 text-white/60" />
          </button>

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-white py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 animate-scale-in" style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)' }}>
            <div className="px-3 py-2 border-b border-brand-100">
              <p className="text-sm font-semibold text-brand-900 truncate">{displayName}</p>
              <p className="text-xs text-brand-400 truncate">{session?.email}</p>
            </div>

            <NavLink
              to={role === 'employer' ? '/employer/profile' : '/profile'}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 w-full"
            >
              <User className="h-3.5 w-3.5" /> {t('nav.profile')}
            </NavLink>

            <div className="divider my-1" />

            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 w-full"
            >
              {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {isDark ? t('nav.lightMode') : t('nav.darkMode')}
            </button>

            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLangMenuOpen(!langMenuOpen);
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50 w-full"
              >
                <span className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" />
                  {t('nav.language')}
                </span>
                <span className="text-xs text-brand-400">{currentLang.nativeName}</span>
              </button>

              {langMenuOpen && (
                <div className="absolute right-full top-0 mr-1 w-40 rounded-lg bg-white py-1 z-50 animate-scale-in" style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.04)' }}>
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={(e) => {
                        e.stopPropagation();
                        setLanguage(lang.code);
                        setLangMenuOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors ${
                        language === lang.code
                          ? 'bg-brand-900 text-white font-semibold'
                          : 'text-brand-600 hover:bg-brand-50'
                      }`}
                    >
                      <span>{lang.nativeName}</span>
                      {language === lang.code && (
                        <span className="ml-auto text-white">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="divider my-1" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-accent-light w-full"
            >
              <LogOut className="h-3.5 w-3.5" /> {t('nav.signOut')}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav drawer — fixed, scrollable, with backdrop */}
      {mobileOpen && navLinks.length > 0 && (
        <>
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden fixed inset-0 top-14 bg-black/30 backdrop-blur-sm z-30"
          />
          <div className="lg:hidden fixed top-14 left-0 right-0 bg-brand-900 border-t border-white/10 shadow-xl z-40 animate-slide-up max-h-[calc(100dvh-56px)] overflow-y-auto">
            <nav className="flex flex-col p-2 gap-1">
              {navLinks.map(({ to, icon: Icon, label, key }) => {
                const isActive = location.pathname === to || (to !== dashboardPath && location.pathname.startsWith(to));
                const displayLabel = key ? t(key) : label;
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-accent text-brand-900 border-2 border-brand-900' : 'text-white/90 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {displayLabel}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </>
      )}


    </header>
  );
}
