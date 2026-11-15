import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { useQuery } from '@tanstack/react-query';
import { studentService } from '../../services/student.service.js';
import { applicationService } from '../../services/application.service.js';
import { roadmapService } from '../../services/roadmap.service.js';
import { employerService } from '../../services/employer.service.js';
import { Link, useNavigate } from 'react-router-dom';
import { SkeletonList, SkeletonProfile } from '../../components/ui/Skeleton.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import {
  Briefcase, CheckCircle2, ChevronRight, Clock, Star, Trophy,
  Target, TrendingUp, ArrowUpRight, Map, BarChart3, ListFilter,
  Sparkles, Building2, Users
} from 'lucide-react';
import { timeAgo } from '../../lib/utils.js';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

/* ── Professional Monochrome & Accent Status Palette ───────── */
const STATUS_COLORS = {
  submitted:   '#8A8A8A', // Muted slate gray
  reviewed:    '#4A4A4A', // Medium dark slate
  shortlisted: '#1A1A1A', // Primary deep black
  accepted:    '#16A34A', // Emerald green
  rejected:    '#D62828', // LanTURN red accent
  withdrawn:   '#D4D4D4', // Light gray
};

const STATUS_LABELS = {
  submitted:   'Applied',
  reviewed:    'Reviewed',
  shortlisted: 'Shortlisted',
  accepted:    'Hired',
  rejected:    'Rejected',
  withdrawn:   'Withdrawn',
};

const STATUS_BADGE_CONFIG = {
  submitted:   { label: 'Applied',     cls: 'bg-brand-50 text-brand-600 border-brand-200' },
  reviewed:    { label: 'Reviewed',    cls: 'bg-brand-100 text-brand-800 border-brand-300' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-brand-900 text-white border-brand-900' },
  accepted:    { label: 'Hired',       cls: 'bg-emerald-50 text-emerald-800 border-emerald-200/80' },
  rejected:    { label: 'Rejected',    cls: 'bg-red-50 text-red-800 border-red-200/80' },
  withdrawn:   { label: 'Withdrawn',   cls: 'bg-brand-50 text-brand-400 border-brand-200' },
};

/* ── SVG Donut (Nothing OS minimalist progress ring) ───────── */
function SVGDonut({ percent, size = 60, strokeWidth = 3.5, color = '#1A1A1A' }) {
  const clamped = Math.min(100, Math.max(0, percent || 0));
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
        <path
          className="text-brand-100"
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={color}
          strokeDasharray={`${clamped}, 100`}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-xs font-bold text-brand-900">{clamped}%</span>
    </div>
  );
}

/* ── Application Pipeline Donut Chart ──────────────────────── */
function ApplicationPieChart({ allApps }) {
  const counts = {};
  for (const app of allApps) {
    counts[app.status] = (counts[app.status] || 0) + 1;
  }
  const pieData = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name: STATUS_LABELS[name] || name, value, status: name }));

  if (pieData.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-brand-400">No applications recorded yet</p>
        <p className="text-xs text-brand-300 mt-1">Apply to jobs to track your progress through the pipeline</p>
      </div>
    );
  }

  const total = allApps.length;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-2">
      <div className="relative w-44 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={78}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              stroke="none"
              paddingAngle={3}
            >
              {pieData.map((entry) => (
                <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#8A8A8A'} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white rounded-lg shadow-soft-lg border border-brand-100 px-3 py-2 text-xs">
                    <p className="font-semibold text-brand-900">{d.name}</p>
                    <p className="text-brand-500 mt-0.5">{d.value} applications ({Math.round((d.value / total) * 100)}%)</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-headline text-3xl font-bold text-brand-900 leading-none">{total}</span>
          <span className="text-[11px] text-brand-400 font-medium mt-1">Total Apps</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 w-full sm:w-auto">
        {pieData.map((d) => (
          <div key={d.status} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[d.status] || '#8A8A8A' }} />
              <span className="text-brand-600 font-medium">{d.name}</span>
            </div>
            <span className="font-bold text-brand-900">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Top Companies & Hiring Partners Widget ────────────────── */
function TopCompaniesWidget({ companies, isLoading }) {
  const [viewMode, setViewMode] = useState('list'); // 'list' (Stitch horizontal distribution bars) or 'chart' (minimalist bar chart)
  const [filterMetric, setFilterMetric] = useState('both'); // 'both', 'jobs', 'apps'

  if (isLoading) {
    return <SkeletonList count={3} />;
  }

  if (!companies || companies.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-brand-400">No active company partners found</p>
      </div>
    );
  }

  const maxJobs = Math.max(...companies.map(c => c.totalJobs || 0), 1);
  const maxApps = Math.max(...companies.map(c => c.totalApplications || 0), 1);
  const maxCombined = Math.max(...companies.map(c => (c.totalJobs || 0) + (c.totalApplications || 0)), 1);

  // Clean formatted data for chart view
  const chartData = companies.slice(0, 6).map(c => ({
    name: c.companyName.length > 12 ? c.companyName.slice(0, 10) + '..' : c.companyName,
    fullName: c.companyName,
    jobs: c.totalJobs || 0,
    applications: c.totalApplications || 0,
  }));

  return (
    <div className="space-y-6">
      {/* Widget Sub-header with Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-brand-100/60">
        <div className="flex items-center gap-1.5 bg-brand-50 p-1 rounded-lg border border-brand-100">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
              viewMode === 'list'
                ? 'bg-white text-brand-900 shadow-soft-sm border border-brand-200/60'
                : 'text-brand-500 hover:text-brand-900'
            }`}
          >
            Distribution
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1 text-xs font-semibold rounded transition-all ${
              viewMode === 'chart'
                ? 'bg-white text-brand-900 shadow-soft-sm border border-brand-200/60'
                : 'text-brand-500 hover:text-brand-900'
            }`}
          >
            Bar Overview
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs text-brand-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-900 inline-block" /> Jobs Posted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-300 inline-block" /> Total Applicants
          </span>
        </div>
      </div>

      {viewMode === 'list' ? (
        /* ── Stitch Horizontal Distribution Rows ───────────── */
        <div className="space-y-3.5">
          {companies.slice(0, 5).map((c, i) => {
            const jobs = c.totalJobs || 0;
            const apps = c.totalApplications || 0;
            const total = jobs + apps;
            const jobWidthPct = Math.round((jobs / maxCombined) * 100);
            const appWidthPct = Math.round((apps / maxCombined) * 100);

            return (
              <div
                key={c.uid || i}
                className="group p-3.5 rounded-xl border border-brand-100/80 bg-white hover:bg-brand-50/50 hover:border-brand-200 transition-all duration-200 flex flex-col sm:flex-row sm:items-center gap-4 shadow-soft-sm hover:shadow-soft-md"
              >
                {/* Left: Rank, Logo & Info */}
                <div className="flex items-center gap-3 min-w-[200px] flex-shrink-0">
                  <span className="text-xs font-bold text-brand-400 w-5 text-center">
                    #{i + 1}
                  </span>

                  {c.logoURL ? (
                    <img
                      src={c.logoURL}
                      alt={c.companyName}
                      className="h-9 w-9 rounded-lg object-cover flex-shrink-0 border border-brand-100 bg-white"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-lg bg-brand-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-soft-sm">
                      {c.companyName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-brand-900 truncate">{c.companyName}</p>
                      {c.verified && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-brand-400 truncate">{c.industry || 'Technology'}</p>
                  </div>
                </div>

                {/* Center: Slim Horizontal Track Visualizer */}
                <div className="flex-1 w-full flex flex-col justify-center space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] text-brand-400">
                    <span>Hiring Activity</span>
                    <span className="font-semibold text-brand-700">{jobs} jobs · {apps} applicants</span>
                  </div>

                  {/* Dual pill progress track */}
                  <div className="h-2 w-full bg-brand-100 rounded-full overflow-hidden flex gap-0.5">
                    <div
                      className="h-full bg-brand-900 rounded-l-full transition-all duration-500"
                      style={{ width: `${Math.max(jobWidthPct, 6)}%` }}
                      title={`${jobs} jobs posted`}
                    />
                    <div
                      className="h-full bg-brand-400 rounded-r-full transition-all duration-500"
                      style={{ width: `${Math.max(appWidthPct, 6)}%` }}
                      title={`${apps} applications`}
                    />
                  </div>
                </div>

                {/* Right: Quick Action / Badges */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center flex-shrink-0 pl-2">
                  <span className="text-xs font-bold text-brand-900 bg-brand-50 border border-brand-100 px-2.5 py-1 rounded-md">
                    {jobs} {jobs === 1 ? 'Opening' : 'Openings'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── Minimalist Recharts Bar Chart ─────────────────── */
        <div className="w-full h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#6B6B6B', fontWeight: 500 }}
                axisLine={{ stroke: '#E8E8E8' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#8A8A8A' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-white rounded-lg shadow-soft-xl border border-brand-100 p-3 text-xs">
                      <p className="font-bold text-brand-900 text-sm mb-1.5">{item.fullName}</p>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-brand-500">
                            <span className="w-2 h-2 rounded-full bg-brand-900" /> Jobs Posted:
                          </span>
                          <span className="font-bold text-brand-900">{item.jobs}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="flex items-center gap-1.5 text-brand-500">
                            <span className="w-2 h-2 rounded-full bg-brand-300" /> Applicants:
                          </span>
                          <span className="font-bold text-brand-900">{item.applications}</span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="jobs" fill="#1A1A1A" radius={[4, 4, 0, 0]} maxBarSize={32} name="Jobs" />
              <Bar dataKey="applications" fill="#B0B0B0" radius={[4, 4, 0, 0]} maxBarSize={32} name="Applications" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ── Main Student Dashboard Page ───────────────────────────── */
export default function StudentDashboard() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['student', 'me'],
    queryFn: studentService.getMe,
  });

  const { data: appsData, isLoading: isAppsLoading } = useQuery({
    queryKey: ['applications', 'mine'],
    queryFn: () => applicationService.listMine({ limit: 5 }),
  });

  const { data: allAppsData } = useQuery({
    queryKey: ['applications', 'mine', 'all'],
    queryFn: () => applicationService.listMine({ limit: 500 }),
  });

  const { data: roadmaps } = useQuery({
    queryKey: ['roadmaps', 'me'],
    queryFn: roadmapService.getMyRoadmaps,
  });

  const { data: topCompanies, isLoading: isCompaniesLoading } = useQuery({
    queryKey: ['employers', 'top-companies'],
    queryFn: () => employerService.getTopCompanies(10),
  });

  const applications = appsData?.items ?? [];
  const totalApps = appsData?.meta?.totalItems ?? applications.length;
  const allApplications = allAppsData?.items ?? [];
  const enrolledRoadmaps = roadmaps ?? [];

  const getCompletion = () => {
    let score = 0;
    if (profile?.personal?.name) score += 25;
    if (profile?.academic?.college) score += 25;
    if (profile?.resumeUrl) score += 25;
    if (profile?.professional?.skills?.length > 0) score += 25;
    return score;
  };
  const completion = getCompletion();

  const displayName = profile?.personal?.name
    || session?.profile?.personal?.name
    || session?.email?.split('@')[0]
    || 'Student';

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* ── Header Row ──────────────────────────────────── */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 -mx-4 sm:-mx-6 -mt-6 px-6 sm:px-8 pt-8 bg-brand-900 rounded-b-2xl border-b-4 border-accent shadow-soft-lg relative overflow-hidden">
        {/* Subtle dot pattern on header */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/20 bg-white/10 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[11px] font-bold tracking-wide uppercase text-white/80">Student Portal</span>
          </div>
          <h1 className="font-headline text-3xl md:text-4xl font-bold text-white tracking-tight">
            {t('studentDash.welcomeBack', { name: displayName })}
          </h1>
          <p className="text-white/60 text-sm md:text-base mt-1">{t('studentDash.overview')}</p>
        </div>

        <Link
          to="/jobs"
          className="btn bg-accent text-brand-900 font-bold border-2 border-brand-900 shadow-soft-md hover:shadow-soft-lg hover:-translate-y-0.5 active:translate-y-0 transition-all self-start md:self-auto flex items-center gap-2 relative z-10"
        >
          <Target className="h-4 w-4" />
          {t('studentDash.findJobs')}
        </Link>
      </header>

      {/* ── 3-Column Stat Cards Row ──────────────────────── */}
      {isProfileLoading ? (
        <SkeletonProfile />
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Applications */}
          <div className="card p-6 flex flex-col justify-between hover:shadow-soft-lg transition-all animate-slide-up">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-1">{t('studentDash.applications')}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-headline text-4xl font-bold text-brand-900">{totalApps}</span>
                  <span className="text-xs font-semibold text-brand-400">active</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0 text-brand-700">
                <Briefcase className="h-5 w-5" />
              </div>
            </div>

            <Link
              to="/applications"
              className="text-xs font-bold text-brand-700 hover:text-brand-900 mt-5 pt-3 border-t border-brand-100/60 flex items-center justify-between group transition-colors"
            >
              <span>{t('studentDash.viewApplications')}</span>
              <ChevronRight className="h-4 w-4 transform group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Profile Strength */}
          <div className="card p-6 flex flex-col justify-between hover:shadow-soft-lg transition-all animate-slide-up">
            <div>
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-bold text-brand-400 uppercase tracking-wider">{t('studentDash.profileStrength')}</p>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                  completion === 100
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/70'
                    : completion >= 75
                      ? 'bg-brand-50 text-brand-800 border-brand-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200/70'
                }`}>
                  {completion === 100 ? t('studentDash.complete') : completion >= 75 ? 'Strong' : t('studentDash.needsInfo')}
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-1 mb-3">
                <span className="font-headline text-4xl font-bold text-brand-900">{completion}</span>
                <span className="text-lg text-brand-400 font-semibold">%</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="progress-track h-2">
                <div className="progress-fill bg-brand-900" style={{ width: `${completion}%` }} />
              </div>
              <p className="text-[11px] text-brand-400">Complete resume & skills for 100% placement readiness</p>
            </div>
          </div>

          {/* Verified Skills */}
          <div className="card p-6 flex flex-col justify-between hover:shadow-soft-lg transition-all animate-slide-up">
            <div>
              <p className="text-xs font-bold text-brand-400 uppercase tracking-wider mb-3">{t('studentDash.topSkills')}</p>
              <div className="flex flex-wrap gap-1.5">
                {(profile?.professional?.skills || []).length > 0 ? (
                  profile.professional.skills.slice(0, 5).map((s) => (
                    <span
                      key={s}
                      className="px-2.5 py-1 bg-brand-50 border border-brand-200/70 rounded-md text-xs font-medium text-brand-800 inline-flex items-center gap-1"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-brand-400">{t('studentDash.noSkillsYet')}</span>
                )}
                {(profile?.professional?.skills?.length || 0) > 5 && (
                  <span className="px-2 py-1 bg-brand-50 border border-brand-200/70 rounded-md text-xs font-bold text-brand-500">
                    +{profile.professional.skills.length - 5}
                  </span>
                )}
              </div>
            </div>

            <Link
              to="/profile"
              className="text-xs font-bold text-brand-700 hover:text-brand-900 mt-4 pt-3 border-t border-brand-100/60 flex items-center justify-between group transition-colors"
            >
              <span>Manage Profile & Skills</span>
              <ChevronRight className="h-4 w-4 transform group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </section>
      )}

      {/* ── Mid Section: Application Pipeline + Recent Activity ─ */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Pipeline */}
        <div className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-base font-bold text-brand-900 flex items-center gap-2">
              <Briefcase className="h-4.5 w-4.5 text-brand-700" /> Application Pipeline
            </h2>
            <span className="text-xs text-brand-400 font-medium">{allApplications.length} total</span>
          </div>
          <ApplicationPieChart allApps={allApplications} />
        </div>

        {/* Recent Applications */}
        <div className="card p-6 animate-slide-up">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-headline text-base font-bold text-brand-900 flex items-center gap-2">
              <Clock className="h-4.5 w-4.5 text-brand-700" /> {t('studentDash.recentApplications')}
            </h2>
            <Link to="/applications" className="text-xs font-bold text-brand-500 hover:text-brand-900 transition-colors flex items-center gap-1">
              {t('studentDash.viewAll')} <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {isAppsLoading ? (
            <SkeletonList count={3} />
          ) : applications.length === 0 ? (
            <EmptyState
              icon="document"
              title={t('studentDash.noAppsYet')}
              description={t('studentDash.noAppsDesc')}
              action={{ label: t('studentDash.browseJobs'), onClick: () => window.location.href = '/jobs' }}
            />
          ) : (
            <div className="divide-y divide-brand-100/70">
              {applications.map((app) => {
                const cfg = STATUS_BADGE_CONFIG[app.status] || STATUS_BADGE_CONFIG.submitted;
                return (
                  <div key={app.id} className="py-3 flex items-center justify-between hover:bg-brand-50/50 px-2 rounded-lg transition-colors cursor-pointer">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-brand-900 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {(app.companyName || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-brand-900 text-xs truncate">{app.jobTitle || 'Job'}</h4>
                        <p className="text-[11px] text-brand-400 truncate">{app.companyName || 'Company'} · {timeAgo(app.createdAt)}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border flex-shrink-0 ml-2 ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Career Aisle Progress ────────────────────────── */}
      {enrolledRoadmaps.length > 0 && (
        <section className="card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Map className="h-4.5 w-4.5 text-brand-700" />
              <h2 className="font-headline text-base font-bold text-brand-900">Career Aisle Progress</h2>
            </div>
            <Link to="/career-aisle" className="text-xs font-bold text-brand-500 hover:text-brand-900 transition-colors flex items-center gap-1">
              View Roadmaps <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrolledRoadmaps.map((rm) => {
              const pct = rm.percentComplete ?? 0;
              const color = pct === 100 ? '#16A34A' : pct > 0 ? '#1A1A1A' : '#94a3b8';
              return (
                <div
                  key={rm.roadmapId}
                  onClick={() => navigate('/career-aisle', { state: { roadmapId: rm.roadmapId } })}
                  className="border border-brand-100 rounded-xl p-4 flex items-center gap-4 bg-white hover:border-brand-300 hover:shadow-soft-sm transition-all cursor-pointer group"
                >
                  <SVGDonut percent={pct} color={color} size={54} />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-brand-900 text-sm mb-0.5 truncate">{rm.domainTitle}</h4>
                    <p className="text-xs text-brand-400">
                      {pct === 100 ? 'Roadmap Completed' : pct === 0 ? 'Not started' : `${pct}% completed`}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-brand-300 group-hover:text-brand-900 transform group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Top Companies & Hiring Partners Widget ───────── */}
      <section className="card p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4.5 w-4.5 text-brand-700" />
            <h2 className="font-headline text-base font-bold text-brand-900">Top Hiring Partners</h2>
          </div>
          <span className="text-xs text-brand-400 font-medium">Ranked by placement volume</span>
        </div>

        <TopCompaniesWidget companies={topCompanies} isLoading={isCompaniesLoading} />
      </section>
    </div>
  );
}
