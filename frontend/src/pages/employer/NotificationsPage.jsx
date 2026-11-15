import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../../services/notification.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useNavigate } from 'react-router-dom';
import { timeAgo } from '../../lib/utils.js';
import {
  Bell, CheckCheck, Briefcase, UserPlus, AlertCircle,
  Sparkles, Trash2, Eye,
} from 'lucide-react';

const TYPE_ICONS = {
  application_received: { icon: UserPlus,     cls: 'bg-blue-50 text-blue-600' },
  application_status:   { icon: Briefcase,    cls: 'bg-brand-50 text-brand-600' },
  job_removed:          { icon: AlertCircle,  cls: 'bg-red-50 text-red-600' },
  system:               { icon: Sparkles,     cls: 'bg-amber-50 text-amber-600' },
  ai_ready:             { icon: Sparkles,     cls: 'bg-emerald-50 text-emerald-600' },
};

export default function EmployerNotificationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 50 }),
  });

  const notifications = data?.items ?? data ?? [];

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationService.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleClick = (notif) => {
    if (!notif.read) {
      markReadMutation.mutate(notif.notificationId);
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Notifications</h1>
          <p className="text-sm text-brand-500">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="btn-secondary btn-sm flex items-center gap-1.5"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-16 skeleton rounded-lg" />)}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card p-12 text-center">
          <Bell className="h-10 w-10 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">No notifications yet</p>
          <p className="text-sm text-brand-400 mt-1">You'll be notified when candidates apply to your jobs</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notif => {
            const typeInfo = TYPE_ICONS[notif.type] || TYPE_ICONS.system;
            const Icon = typeInfo.icon;

            return (
              <div
                key={notif.notificationId}
                onClick={() => handleClick(notif)}
                className={`card p-4 flex items-start gap-3.5 cursor-pointer transition-all hover:shadow-md animate-slide-up ${
                  !notif.read ? 'ring-1 ring-brand-200 bg-brand-50/30' : ''
                }`}
              >
                {/* Icon */}
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeInfo.cls}`}>
                  <Icon className="h-4.5 w-4.5" style={{ width: '18px', height: '18px' }} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${!notif.read ? 'text-brand-900' : 'text-brand-600'}`}>
                      {notif.title}
                    </p>
                    {!notif.read && <span className="h-2 w-2 rounded-full bg-brand-500 flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-brand-500 mt-0.5 line-clamp-2">{notif.body}</p>
                  <p className="text-xs text-brand-400 mt-1">{timeAgo(notif.createdAt)}</p>
                </div>

                {/* Read indicator */}
                {notif.link && (
                  <Eye className="h-4 w-4 text-brand-300 flex-shrink-0 mt-1" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
