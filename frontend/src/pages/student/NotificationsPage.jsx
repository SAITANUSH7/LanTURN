import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../../services/notification.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { timeAgo } from '../../lib/utils.js';
import toast from 'react-hot-toast';
import { Bell, CheckCheck, Check, Briefcase, FileText, AlertCircle, Sparkles } from 'lucide-react';

const TYPE_ICONS = {
  application_received:  <Briefcase className="h-4 w-4 text-blue-500" />,
  application_status:    <FileText className="h-4 w-4 text-brand-500" />,
  job_removed:           <AlertCircle className="h-4 w-4 text-red-500" />,
  ai_ready:              <Sparkles className="h-4 w-4 text-brand-500" />,
  system:                <Bell className="h-4 w-4 text-brand-500" />,
};

function NotifCard({ notif, onMarkRead, t }) {
  const icon = TYPE_ICONS[notif.type] || TYPE_ICONS.system;
  return (
    <div
      className={`card p-4 flex items-start gap-3 transition-all ${!notif.read ? 'ring-2 ring-brand-200 bg-brand-50/30' : ''}`}
    >
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${!notif.read ? 'bg-brand-100' : 'bg-brand-100'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${!notif.read ? 'font-medium text-brand-900' : 'text-brand-700'}`}>
          {notif.message || notif.body}
        </p>
        <p className="text-xs text-brand-400 mt-1">{timeAgo(notif.createdAt)}</p>
      </div>
      {!notif.read && (
        <button
          onClick={() => onMarkRead(notif.id || notif.notificationId)}
          className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-brand-500 hover:bg-brand-50 transition-colors"
          title={t('notifs.markAsRead')}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 50 }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    onError: () => toast.error(t('notifs.markReadFailed')),
  });

  const markAllMutation = useMutation({
    mutationFn: notificationService.markAllRead,
    onSuccess: () => {
      toast.success(t('notifs.allMarkedRead'));
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => toast.error(t('notifs.markReadFailed')),
  });

  const notifs = data?.items ?? [];
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">{t('notifs.title')}</h1>
          {unread > 0 && (
            <p className="text-sm text-brand-600 mt-0.5 font-medium">{unread} {t('notifs.unread')}</p>
          )}
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t('notifs.markAllRead')}
          </button>
        )}
      </div>

      {isLoading && <SkeletonList count={5} />}

      {!isLoading && notifs.length === 0 && (
        <EmptyState
          icon="inbox"
          title={t('notifs.noNotifs')}
          description={t('notifs.noNotifsDesc')}
        />
      )}

      {!isLoading && notifs.length > 0 && (
        <div className="space-y-2">
          {notifs.map((n) => (
            <NotifCard
              key={n.id || n.notificationId}
              notif={n}
              onMarkRead={(id) => markReadMutation.mutate(id)}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
