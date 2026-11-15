import { Inbox, Search, Briefcase, FileText, Sparkles } from 'lucide-react';

const ICONS = {
  inbox: Inbox,
  search: Search,
  briefcase: Briefcase,
  file: FileText,
  document: FileText,
  sparkles: Sparkles,
};

export function EmptyState({
  icon = 'inbox',
  title = 'Nothing here yet',
  description,
  action,
  className = '',
}) {
  const Icon = ICONS[icon] || Inbox;

  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className}`}>
      <div className="h-16 w-16 rounded-lg bg-brand-50 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-brand-400" />
      </div>
      <h3 className="text-base font-semibold text-brand-700 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-brand-400 max-w-xs mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary btn-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
