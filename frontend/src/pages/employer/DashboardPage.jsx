import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employerService } from '../../services/employer.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { Link } from 'react-router-dom';
import { timeAgo } from '../../lib/utils.js';
import {
  Briefcase, Users, TrendingUp, UserCheck, UserX, Award,
  BarChart3, Activity, ArrowUpRight, PauseCircle, Eye,
  Sparkles, Star
} from 'lucide-react';
import CandidateMatchCard from '../../components/employer/CandidateMatchCard.jsx';
import { CompanyDNAPanel } from '../../components/ai/CompanyDNAPanel.jsx';
import toast from 'react-hot-toast';

/* ── Tiny SVG donut chart ─────────────────────────────────── */
function DonutChart({ segments, size = 160 }) {
  const r = 56, cx = 80, cy = 80, circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className="mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth="18" />
      {segments.map((seg, i) => {
        const pct = seg.value / total;
        const dash = pct * circumference;
        const gap = circumference - dash;
        const el = (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="18"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            className="transition-all duration-700"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
          />
        );
        offset += dash;
        return el;
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" className="fill-brand-900 text-2xl font-bold">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-brand-400 text-xs">Total</text>
    </svg>
  );
}

/* ── Area chart (applications per day) ─────────────────────── */
function MiniAreaChart({ data }) {
  const entries = Object.entries(data || {});
  if (entries.length === 0) return <p className="text-sm text-brand-400">No data yet</p>;
  
  const values = entries.map(([, v]) => v);
  const max = Math.max(...values, 1);
  const width = 1000;
  const height = 200;
  
  // Calculate points
  const points = entries.map(([, count], i) => {
    const x = (i / (entries.length - 1)) * width;
    const y = height - (count / max) * height;
    return `${x},${y}`;
  }).join(' ');

  // Create curved path (using basic curve approx)
  let path = `M 0,${height - (values[0] / max) * height}`;
  for (let i = 1; i < entries.length; i++) {
    const prevX = ((i - 1) / (entries.length - 1)) * width;
    const prevY = height - (values[i - 1] / max) * height;
    const currX = (i / (entries.length - 1)) * width;
    const currY = height - (values[i] / max) * height;
    
    // Control points for a smooth cubic bezier curve
    const cp1x = prevX + (currX - prevX) / 2;
    const cp1y = prevY;
    const cp2x = prevX + (currX - prevX) / 2;
    const cp2y = currY;
    
    path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${currX},${currY}`;
  }

  const areaPath = `${path} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="relative h-28 w-full group overflow-hidden rounded-lg">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full preserve-3d" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A1A1A" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#1A1A1A" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Fill Area */}
        <path d={areaPath} fill="url(#areaGradient)" className="transition-all duration-500" />
        
        {/* Line */}
        <path d={path} fill="none" stroke="#1A1A1A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500" />
        
        {/* Data points on hover */}
        {entries.map(([, count], i) => {
          if (count === 0) return null; // Don't show dots for zero
          const x = (i / (entries.length - 1)) * width;
          const y = height - (count / max) * height;
          return (
            <circle key={i} cx={x} cy={y} r="8" fill="#fff" stroke="#1A1A1A" strokeWidth="4" className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          );
        })}
      </svg>
      
      {/* Tooltip Overlay (approximate) */}
      <div className="absolute inset-0 flex items-end justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        {entries.map(([date, count], i) => (
          <div key={date} className="flex-1 h-full flex flex-col justify-end" title={`${date}: ${count} applications`}>
            {count > 0 && (
              <div className="w-full h-full flex items-center justify-center relative">
                <span className="absolute bottom-2 text-[10px] font-bold text-brand-900 bg-white/90 px-1 rounded shadow-soft-sm">{count}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color, sub, link }) {
  const Wrapper = link ? Link : 'div';
  const props = link ? { to: link } : {};
  return (
    <Wrapper {...props} className="stat-card group transition-all animate-slide-up">
      <div className={`stat-icon ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-brand-400">{label}</p>
        <p className="text-2xl font-bold text-brand-900 mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-brand-400 mt-0.5">{sub}</p>}
      </div>
      {link && <ArrowUpRight className="h-4 w-4 text-brand-300 group-hover:text-brand-700 transition-colors" />}
    </Wrapper>
  );
}

/* ── Progress metric ──────────────────────────────────────── */
function MetricBar({ label, value, max, color = '#1A1A1A' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-brand-600">{label}</span>
        <span className="text-sm font-semibold text-brand-900">{value} <span className="text-brand-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Status badge ─────────────────────────────────────────── */
const STATUS_CONFIG = {
  submitted:   { label: 'Applied',     cls: 'badge-blue' },
  reviewed:    { label: 'Reviewing',   cls: 'badge-yellow' },
  shortlisted: { label: 'Shortlisted', cls: 'badge-green' },
  accepted:    { label: 'Hired',       cls: 'badge-purple' },
  rejected:    { label: 'Rejected',    cls: 'badge-red' },
  withdrawn:   { label: 'Withdrawn',   cls: 'badge-default' },
};

export default function EmployerDashboard() {
  const { t } = useLanguage();
  const { data: profile } = useQuery({
    queryKey: ['employer', 'me'],
    queryFn: employerService.getMe,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['employer', 'analytics'],
    queryFn: employerService.getAnalytics,
  });

  const { data: aiRecommendations, isLoading: recommendationsLoading } = useQuery({
    queryKey: ['employer', 'recommendations'],
    queryFn: employerService.getTopRecommendations,
  });

  // Company DNA
  const queryClient = useQueryClient();
  const { data: companyDna, isLoading: dnaLoading } = useQuery({
    queryKey: ['employer', 'companyDna'],
    queryFn: employerService.getCompanyDna,
    retry: false,
  });

  const dnaMutation = useMutation({
    mutationFn: () => employerService.generateCompanyDna(),
    onSuccess: (data) => {
      queryClient.setQueryData(['employer', 'companyDna'], data);
      toast.success('Company DNA generated successfully!');
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || err.message || 'Failed to generate Company DNA'),
  });

  const isLoading = analyticsLoading || recommendationsLoading;

  const a = analytics || {};
  const sb = a.statusBreakdown || {};

  const donutSegments = [
    { value: sb.submitted || 0,   color: '#6B6B6B' },
    { value: sb.reviewed || 0,    color: '#B0B0B0' },
    { value: sb.shortlisted || 0, color: '#333333' },
    { value: sb.accepted || 0,    color: '#1A1A1A' },
    { value: sb.rejected || 0,    color: '#D62828' },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 skeleton-title w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 skeleton rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 skeleton rounded-lg" />
          <div className="h-64 skeleton rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mx-4 sm:-mx-6 -mt-6 px-6 sm:px-8 pt-8 pb-6 bg-brand-900 rounded-b-2xl border-b-4 border-accent shadow-soft-lg relative overflow-hidden">
        {/* Subtle dot pattern on header */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
        <div className="relative z-10">
          <h1 className="text-2xl font-bold text-white">
            {t('empDash.welcomeBack', { name: profile?.companyName || 'Employer' })}
          </h1>
          <p className="text-sm text-white/60 mt-0.5">
            {profile?.industry && `${profile.industry} · `}
            {t('empDash.overview')}
          </p>
        </div>
        <Link to="/employer/jobs" className="btn bg-accent text-brand-900 font-bold border-2 border-brand-900 shadow-soft-md hover:shadow-soft-lg btn-sm flex items-center gap-1.5 self-start relative z-10">
          <Briefcase className="h-3.5 w-3.5" /> {t('empDash.postJob')}
        </Link>
      </div>

      {/* ── Stat Cards Row ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Briefcase} label={t('empDash.activeJobs')} value={a.activeJobs ?? 0}
          color="bg-brand-50 text-brand-700"
          sub={a.pausedJobs ? `${a.pausedJobs} paused` : undefined}
          link="/employer/jobs"
        />
        <StatCard
          icon={Users} label={t('empDash.totalApplicants')} value={a.totalApplicants ?? 0}
          color="bg-brand-50 text-brand-700"
        />
        <StatCard
          icon={UserCheck} label="Shortlisted" value={sb.shortlisted ?? 0}
          color="bg-brand-50 text-brand-700"
        />
        <StatCard
          icon={Award} label="Hired" value={sb.accepted ?? 0}
          color="bg-brand-50 text-brand-700"
          sub={`${a.conversionRate ?? 0}% conversion`}
        />
      </div>

      {/* ── Charts Row ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recruitment Pipeline (Donut) */}
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-brand-700" />
            <h2 className="section-title">Recruitment Pipeline</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <DonutChart segments={donutSegments} />
            <div className="space-y-2 flex-1 w-full">
              {[
                { label: 'Applied',     value: sb.submitted,   color: '#6B6B6B' },
                { label: 'Reviewing',   value: sb.reviewed,    color: '#B0B0B0' },
                { label: 'Shortlisted', value: sb.shortlisted, color: '#333333' },
                { label: 'Hired',       value: sb.accepted,    color: '#1A1A1A' },
                { label: 'Rejected',    value: sb.rejected,    color: '#D62828' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2.5">
                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: item.color }} />
                  <span className="text-sm text-brand-600 flex-1">{item.label}</span>
                  <span className="text-sm font-semibold text-brand-900">{item.value || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Applications Over Time */}
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-brand-700" />
            <h2 className="section-title">Applications (Last 30 Days)</h2>
          </div>
          <MiniAreaChart data={a.applicationsPerDay} />
          <div className="flex justify-between mt-3 text-[10px] text-brand-400">
            <span>{Object.keys(a.applicationsPerDay || {}).at(0)?.slice(5) || ''}</span>
            <span>Today</span>
          </div>
        </div>
      </div>

      {/* ── Conversion & Breakdown Row ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hiring Metrics */}
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-brand-700" />
            <h2 className="section-title">Hiring Metrics</h2>
          </div>
          <div className="space-y-4">
            <MetricBar label="Shortlisted" value={sb.shortlisted || 0} max={a.totalApplicants || 0} color="#333333" />
            <MetricBar label="Hired" value={sb.accepted || 0} max={a.totalApplicants || 0} color="#1A1A1A" />
            <MetricBar label="Rejected" value={sb.rejected || 0} max={a.totalApplicants || 0} color="#D62828" />
          </div>
          <div className="mt-4 p-3 rounded-lg bg-brand-50 border border-brand-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-brand-700">Hiring Conversion Rate</span>
              <span className="text-xl font-bold text-brand-900">{a.conversionRate ?? 0}%</span>
            </div>
          </div>
        </div>

        {/* Job Overview */}
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="h-4 w-4 text-brand-700" />
            <h2 className="section-title">Job Overview</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
              <p className="text-2xl font-bold text-brand-900">{a.activeJobs ?? 0}</p>
              <p className="text-xs text-brand-500 mt-0.5">Active</p>
            </div>
            <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
              <p className="text-2xl font-bold text-brand-900">{a.pausedJobs ?? 0}</p>
              <p className="text-xs text-brand-500 mt-0.5">Paused</p>
            </div>
            <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
              <p className="text-2xl font-bold text-brand-900">{a.closedJobs ?? 0}</p>
              <p className="text-xs text-brand-500 mt-0.5">Closed</p>
            </div>
            <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
              <p className="text-2xl font-bold text-brand-900">{a.totalJobs ?? 0}</p>
              <p className="text-xs text-brand-500 mt-0.5">Total Posted</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Recommended Candidates ───────────────────── */}
      <div className="card p-6 animate-slide-up relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-900 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <h2 className="section-title text-brand-900 font-extrabold text-xl">AI Recommended Candidates</h2>
          </div>
        </div>

        {aiRecommendations && aiRecommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiRecommendations.slice(0, 4).map((match, i) => (
              <div key={match.id} className="relative group">
                {/* Ranking Medals */}
                <div className="absolute -top-3 -left-3 z-10 h-8 w-8 rounded-full bg-white shadow-soft-md border border-brand-100 flex items-center justify-center text-lg font-bold">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-sm text-brand-400">#{i + 1}</span>}
                </div>
                <div className="h-full transform transition-all duration-300 hover:-translate-y-1">
                  <CandidateMatchCard
                    candidate={{
                      studentName: match.studentName,
                      studentPhotoURL: match.studentPhotoURL,
                      applicationId: match.studentId, // or link to application directly if needed
                    }}
                    matchData={match}
                  />
                  <div className="mt-2 text-center text-xs font-medium text-brand-500 bg-brand-50 py-1.5 rounded-lg border border-brand-100">
                    Applying for: <span className="text-brand-900 font-bold">{match.jobTitle}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="inline-flex h-12 w-12 rounded-full bg-brand-50 items-center justify-center mb-3">
              <Star className="h-5 w-5 text-brand-300" />
            </div>
            <p className="text-brand-500 font-medium">No top candidates found yet</p>
            <p className="text-xs text-brand-400 mt-1">Our AI will highlight the best fits once candidates start applying to your jobs.</p>
          </div>
        )}
      </div>

      {/* ── Company DNA Preview ──────────────────────────── */}
      <div className="card p-6 animate-slide-up">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-brand-900 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <h2 className="section-title text-lg font-bold">Company DNA Preview</h2>
        </div>
        <p className="text-sm text-brand-400 mb-4">
          This is how students see your company when browsing jobs. AI analyzes your profile to generate a workplace personality card.
        </p>
        <CompanyDNAPanel
          data={companyDna}
          companyName={profile?.companyName || 'Your Company'}
          isEmployerView={true}
          isLoading={dnaLoading}
          onRegenerate={() => dnaMutation.mutate()}
          isRegenerating={dnaMutation.isPending}
        />
      </div>

      {/* ── Recent Applications ─────────────────────────── */}
      <div className="card p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-brand-700" />
            <h2 className="section-title">Recent Applications</h2>
          </div>
        </div>
        {(a.recentApplications || []).length === 0 ? (
          <p className="text-sm text-brand-400 text-center py-6">No applications yet. Post a job to get started!</p>
        ) : (
          <div className="divide-y divide-brand-100">
            {(a.recentApplications || []).map(app => {
              const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
              return (
                <div key={app.applicationId} className="py-3 flex items-center gap-3">
                  {app.studentPhotoURL ? (
                    <img src={app.studentPhotoURL} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0 border border-brand-100" />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center text-brand-800 text-sm font-bold flex-shrink-0">
                      {(app.studentName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-900 truncate">{app.studentName}</p>
                    <p className="text-xs text-brand-400 truncate">Applied to {app.jobTitle}</p>
                  </div>
                  <span className={cfg.cls}>{cfg.label}</span>
                  <span className="text-xs text-brand-400 hidden sm:block">{timeAgo(app.appliedAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}