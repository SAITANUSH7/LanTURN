import { useState, useEffect } from 'react';

/**
 * DeepamLoader — South Indian oil lamp loading indicator.
 *
 * Props:
 *   size  — 'sm' (inline 20px) | 'lg' (page-level 64px, default)
 *   delay — ms before showing (default 1000). Set to 0 to show immediately.
 *   className — extra wrapper classes
 */
export default function DeepamLoader({ size = 'lg', delay = 1000, className = '' }) {
  const [visible, setVisible] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  if (size === 'sm') return <DeepamSmall className={className} />;
  return <DeepamLarge className={className} />;
}

/* ── Small inline deepam (20×26px) ──────────────────────────── */
function DeepamSmall({ className }) {
  return (
    <svg
      width="20"
      height="26"
      viewBox="0 0 48 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`deepam-inline ${className}`}
    >
      {/* Glow */}
      <circle cx="24" cy="20" r="10" fill="#FFC107" opacity="0.15" className="deepam-glow" />
      {/* Flame outer */}
      <path
        d="M24 6C24 6 17 18 17 26C17 29.9 20.1 33 24 33C27.9 33 31 29.9 31 26C31 18 24 6 24 6Z"
        fill="#FF9800"
        className="deepam-flame"
      />
      {/* Flame inner */}
      <path
        d="M24 14C24 14 20 22 20 27C20 29.2 21.8 31 24 31C26.2 31 28 29.2 28 27C28 22 24 14 24 14Z"
        fill="#FFC107"
        className="deepam-flame-inner"
      />
      {/* Flame core */}
      <ellipse cx="24" cy="28" rx="2" ry="3.5" fill="#FFF8E1" opacity="0.85" />
      {/* Bowl */}
      <path d="M4 36C4 44.8 13 52 24 52C35 52 44 44.8 44 36H4Z" fill="#8D5524" />
      <path d="M8 40C12 38 16 42 20 40C24 38 28 42 32 40C36 38 40 42 40 40" fill="none" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
      {/* Oil */}
      <path d="M6 36C6 38 14 40 24 40C34 40 42 38 42 36H6Z" fill="#F57C00" />
    </svg>
  );
}

/* ── Large page-level deepam (64×80px) — centered with glass card ── */
function DeepamLarge({ className }) {
  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center ${className}`}>
      {/* Frosted glass card */}
      <div className="bg-white/55 backdrop-blur-xl rounded-2xl px-10 py-8 shadow-lg ring-1 ring-white/50 flex flex-col items-center gap-4">
        <svg
          width="64"
          height="80"
          viewBox="0 0 48 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="deepam-page"
        >
          {/* Warm glow */}
          <circle cx="24" cy="18" r="14" fill="#FFC107" opacity="0.2" className="deepam-glow" />

          {/* Flame — outer orange */}
          <path
            d="M24 4C24 4 16 16 16 25C16 29.4 19.6 33 24 33C28.4 33 32 29.4 32 25C32 16 24 4 24 4Z"
            fill="#FF9800"
            className="deepam-flame"
          />
          {/* Flame — inner yellow */}
          <path
            d="M24 12C24 12 19 20 19 26C19 28.8 21.2 31 24 31C26.8 31 29 28.8 29 26C29 20 24 12 24 12Z"
            fill="#FFC107"
            className="deepam-flame-inner"
          />
          {/* Flame — core white */}
          <ellipse cx="24" cy="28" rx="2.5" ry="4" fill="#FFF8E1" opacity="0.9" />

          {/* Wick */}
          <rect x="23" y="32" width="2" height="3" rx="1" fill="#5D4037" />

          {/* Bowl body */}
          <path d="M4 38C4 46.8 13 54 24 54C35 54 44 46.8 44 38H4Z" fill="#8D5524" />
          {/* Bowl rim highlight */}
          <path d="M6 38C6 40 14 42 24 42C34 42 42 40 42 38H6Z" fill="#F57C00" />
          {/* Bowl decorative wave */}
          <path d="M8 44C12 42 16 46 20 44C24 42 28 46 32 44C36 42 40 46 40 44" fill="none" stroke="#FFF" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
          {/* Bowl decorative dots */}
          <circle cx="14" cy="48" r="1.2" fill="#FFC107" opacity="0.5" />
          <circle cx="24" cy="49" r="1.2" fill="#FFC107" opacity="0.5" />
          <circle cx="34" cy="48" r="1.2" fill="#FFC107" opacity="0.5" />

          {/* Base */}
          <ellipse cx="24" cy="54" rx="10" ry="2.5" fill="#6D3A0A" />
        </svg>

        <p className="text-sm font-semibold text-brand-600 tracking-wide deepam-text">
          Lighting the path…
        </p>
      </div>
    </div>
  );
}

