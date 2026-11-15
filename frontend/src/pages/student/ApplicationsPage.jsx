import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { applicationService } from '../../services/application.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { timeAgo } from '../../lib/utils.js';
import toast from 'react-hot-toast';
import {
  Briefcase, ChevronRight, AlertCircle, FileText,
  LayoutGrid, List, Clock, CheckCircle2, XCircle, Eye, UserCheck, ArrowDown
} from 'lucide-react';
import { Link } from 'react-router-dom';

function getKanbanColumns(t) {
  return [
    { id: 'submitted',   title: t('apps.applied'),     color: '#3b82f6', icon: Clock },
    { id: 'reviewed',    title: t('apps.reviewing'),   color: '#f59e0b', icon: Eye },
    { id: 'shortlisted', title: t('apps.shortlisted'), color: '#10b981', icon: UserCheck },
    { id: 'accepted',    title: t('apps.hired'),       color: '#8b5cf6', icon: CheckCircle2 },
    { id: 'rejected',    title: t('apps.rejected'),    color: '#ef4444', icon: XCircle },
  ];
}

const STATUS_COLORS = {
  submitted:    'badge-blue',
  pending:      'badge-yellow',
  viewed:       'badge-blue',
  reviewed:     'badge-yellow',
  shortlisted:  'badge-purple',
  interviewing: 'badge-purple',
  accepted:     'badge-green',
  rejected:     'badge-red',
  withdrawn:    'badge-default bg-brand-100 text-brand-600',
};

function StatusLabel({ status, t }) {
  const labels = {
    submitted: t('apps.applied'),
    reviewed: t('apps.reviewing'),
    shortlisted: t('apps.shortlisted'),
    accepted: t('apps.hired'),
    rejected: t('apps.rejected'),
    withdrawn: t('apps.withdrawn'),
  };
  return labels[status] || status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown';
}

/* ── Kanban Column (read-only for students) ───────────────── */
function KanbanColumn({ column, items, onWithdraw, withdrawPending, t }) {
  const Icon = column.icon;

  return (
    <div className="w-full flex flex-col rounded-3xl border border-white/60 bg-white/40 backdrop-blur-md shadow-soft-sm overflow-hidden">
      {/* Column header */}
      <div className="px-6 py-4 border-b border-white/50 bg-white/60 backdrop-blur-md flex items-center gap-3 flex-shrink-0">
        <div
          className="h-3.5 w-3.5 rounded-full flex-shrink-0 ring-4 ring-white"
          style={{ backgroundColor: column.color }}
        />
        <h3 className="text-base font-bold text-brand-900 flex-1">
          {column.title}
        </h3>
        <span className="text-sm font-semibold text-brand-700 bg-white shadow-sm rounded-full px-3 py-0.5 border border-brand-100">
          {items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-5 bg-transparent min-h-[140px]">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-brand-400 py-8 italic text-sm">
            No applications in this stage
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((app) => (
              <div
                key={app.applicationId || app.id}
                className="bg-white/90 backdrop-blur-md rounded-2xl p-4 shadow-sm border border-brand-100 hover:shadow-md transition-shadow animate-slide-up flex flex-col justify-between h-full"
              >
                <div>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100 text-brand-700 font-bold text-sm">
                      {(app.companyName || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-brand-900 truncate">{app.jobTitle || 'Job'}</p>
                      <p className="text-[11px] font-medium text-brand-500 mt-0.5">{app.companyName || 'Company'}</p>
                      <p className="text-[10px] text-brand-400 mt-1">{timeAgo(app.createdAt || app.appliedAt)}</p>
                    </div>
                  </div>

                  {app.coverLetter && (
                    <p className="text-[12px] text-brand-600 line-clamp-3 mb-3 pl-[52px] leading-relaxed bg-brand-50/50 p-2 rounded-lg">{app.coverLetter}</p>
                  )}
                </div>

                {/* Withdraw button for submitted status */}
                {(app.status === 'submitted' || app.status === 'pending') && (
                  <div className="mt-4 pt-3 border-t border-brand-100 flex justify-end">
                    <button
                      onClick={() => {
                        if (confirm(t('apps.confirmWithdraw'))) {
                          onWithdraw(app.applicationId || app.id);
                        }
                      }}
                      disabled={withdrawPending}
                      className="text-[11px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {withdrawPending ? t('apps.withdrawing') : t('apps.withdraw')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApplicationsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState('kanban');
  const KANBAN_COLUMNS = getKanbanColumns(t);

  const { data, isLoading } = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => applicationService.listMine({ limit: 50 }),
  });

  const applications = data?.items ?? [];

  const withdrawMutation = useMutation({
    mutationFn: applicationService.withdraw,
    onSuccess: () => {
      toast.success(t('apps.applicationWithdrawn'));
      qc.invalidateQueries({ queryKey: ['applications', 'mine'] });
    },
    onError: (err) => toast.error(err.message || t('apps.withdrawFailed')),
  });

  // Group applications by status for kanban
  const groupedByStatus = {};
  KANBAN_COLUMNS.forEach((col) => {
    groupedByStatus[col.id] = applications.filter((app) => app.status === col.id);
  });

  // Count by status for summary
  const totalByStatus = {};
  applications.forEach((app) => {
    totalByStatus[app.status] = (totalByStatus[app.status] || 0) + 1;
  });

  return (
    <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-5 shadow-sm ring-1 ring-white/40">
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">{t('apps.title')}</h1>
          <p className="text-brand-500 mt-1">{t('apps.subtitle')}</p>
        </div>

        {/* View toggle */}
        {applications.length > 0 && (
          <div className="flex items-center gap-1 bg-brand-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'kanban' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700'}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> {t('apps.board')}
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700'}`}
            >
              <List className="h-3.5 w-3.5" /> {t('apps.list')}
            </button>
          </div>
        )}
      </div>

      {/* Pipeline summary badges */}
      {applications.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {KANBAN_COLUMNS.map((col) => {
            const cnt = totalByStatus[col.id] || 0;
            if (cnt === 0) return null;
            return (
              <span
                key={col.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
                style={{
                  color: col.color,
                  borderColor: col.color + '40',
                  backgroundColor: col.color + '10',
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                {col.title.replace(' ', '')} ({cnt})
              </span>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={4} />
      ) : applications.length === 0 ? (
        <EmptyState
          icon="document"
          title={t('apps.noAppsYet')}
          description={t('apps.noAppsDesc')}
          action={{ label: t('apps.browseJobs'), onClick: () => window.location.href = '/jobs' }}
        />
      ) : viewMode === 'kanban' ? (
        /* ── KANBAN VIEW ────────────────────────── */
        <div className="flex flex-col items-center w-full max-w-6xl mx-auto py-2">
          {KANBAN_COLUMNS.map((col, index) => (
            <div key={col.id} className="w-full flex flex-col items-center">
              {index > 0 && (
                <div className="flex flex-col items-center justify-center -my-1 z-10 text-brand-300">
                  <div className="h-6 w-[2px] bg-brand-200"></div>
                  <ArrowDown className="h-6 w-6 -mt-2 bg-white rounded-full text-brand-400" />
                </div>
              )}
              <div className="w-full relative z-0">
                <KanbanColumn
                  column={col}
                  items={groupedByStatus[col.id] || []}
                  onWithdraw={(id) => withdrawMutation.mutate(id)}
                  withdrawPending={withdrawMutation.isPending}
                  t={t}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ──────────────────────────── */
        <div className="grid gap-4">
          {applications.map((app) => (
            <div key={app.applicationId || app.id} className="card p-5 animate-slide-up">
              <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
                
                {/* Left col */}
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100 text-brand-700 font-bold text-sm">
                    {(app.companyName || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-brand-900">{app.jobTitle || 'Job'}</h3>
                    <p className="text-sm font-medium text-brand-600">{app.companyName || 'Company'}</p>
                    <p className="text-xs text-brand-400 mt-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> {t('apps.applied')} {timeAgo(app.createdAt || app.appliedAt)}
                    </p>
                    
                    {app.coverLetter && (
                      <div className="mt-3 p-3 rounded-lg bg-brand-50 text-sm text-brand-600 border border-brand-100">
                        <p className="font-medium text-xs text-brand-400 mb-1 uppercase tracking-wider">{t('apps.coverLetter')}</p>
                        <p className="line-clamp-2">{app.coverLetter}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right col */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 w-full sm:w-auto">
                  <span className={`badge ${STATUS_COLORS[app.status] || 'badge-default'}`}>
                    <StatusLabel status={app.status} t={t} />
                  </span>
                  
                  {(app.status === 'submitted' || app.status === 'pending') && (
                    <button
                      onClick={() => {
                        if (confirm(t('apps.confirmWithdraw'))) {
                          withdrawMutation.mutate(app.applicationId || app.id);
                        }
                      }}
                      disabled={withdrawMutation.isPending}
                      className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
                    >
                      {t('apps.withdraw')}
                    </button>
                  )}
                </div>

              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}