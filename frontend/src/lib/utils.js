export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatSalary(minOrObj, max, currency) {
  // Supports formatSalary({ min, max, currency }) and formatSalary(min, max, currency)
  let min, cur;
  if (typeof minOrObj === 'object' && minOrObj !== null) {
    min = minOrObj.min;
    max = minOrObj.max;
    cur = minOrObj.currency || '';
  } else {
    min = minOrObj;
    cur = currency || '';
  }
  if (!min && !max) return '—';
  const fmt = (n) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
    return String(n);
  };
  if (min && max) return `${cur} ${fmt(min)}–${fmt(max)}`.trim();
  return `${cur} ${fmt(min || max)}`.trim();
}
