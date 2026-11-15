import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '../../services/admin.service.js';
import { timeAgo } from '../../lib/utils.js';
import toast from 'react-hot-toast';
import {
  Users, Briefcase, Building2, ShieldCheck, BarChart3,
  Search, CheckCircle2, XCircle, Loader2, TrendingUp,
  Shield, UserCheck, UserX, BriefcaseBusiness, GraduationCap,
  FileCheck, Clock,
} from 'lucide-react';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'verification', label: 'Post Verification', icon: ShieldCheck },
  { id: 'users', label: 'User Management', icon: Users },
];

const JOB_STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'verified', label: 'Verified' },
  { value: 'draft', label: 'Draft' },
  { value: 'paused', label: 'Paused' },
  { value: 'closed', label: 'Closed' },
  { value: 'removed', label: 'Removed' },
];

const JOB_STATUS_COLORS = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  verified: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-brand-100 text-brand-600 border-brand-200',
  paused: 'bg-amber-50 text-amber-700 border-amber-200',
  closed: 'bg-brand-100 text-brand-600 border-brand-200',
  removed: 'bg-red-50 text-red-700 border-red-200',
};

const ROLE_COLORS = {
  student: 'bg-blue-50 text-blue-700 border-blue-200',
  employer: 'bg-purple-50 text-purple-700 border-purple-200',
  admin: 'bg-amber-50 text-amber-700 border-amber-200',
};

/* ── Skeleton Loader ───────────────────────────────────────── */
function StatSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-4 w-20 bg-brand-200 rounded-md mb-3" />
      <div className="h-7 w-14 bg-brand-200 rounded-md" />
    </div>
  );
}

function ListSkeleton({ count = 3, height = 'h-20' }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${height} skeleton rounded-lg`} />
      ))}
    </div>
  );
}

/* ── Tab 0: Dashboard ──────────────────────────────────────── */
function DashboardTab() {
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: adminService.getAnalyticsSummary,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: adminService.listJobs,
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminService.listUsers({ limit: 10 }),
  });

  const statCards = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: 'Total Users', value: analytics.users ?? 0, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Students', value: analytics.students ?? 0, icon: GraduationCap, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { label: 'Employers', value: analytics.employers ?? 0, icon: Building2, color: 'text-purple-600', bg: 'bg-purple-50' },
      { label: 'Active Jobs', value: analytics.activeJobs ?? 0, icon: BriefcaseBusiness, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { label: 'Applications', value: analytics.applications ?? 0, icon: FileCheck, color: 'text-cyan-600', bg: 'bg-cyan-50' },
      { label: 'Verified Jobs', value: analytics.verifiedJobs ?? 0, icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Students Hired', value: analytics.hired ?? 0, icon: UserCheck, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Pending Verification', value: Math.max(0, (analytics.activeJobs ?? 0) - (analytics.verifiedJobs ?? 0)), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
    ];
  }, [analytics]);

  const recentJobs = useMemo(() => {
    let items = jobsData?.items || jobsData || [];
    if (!Array.isArray(items)) items = [];
    return items.slice(0, 5);
  }, [jobsData]);

  const recentUsers = useMemo(() => {
    let items = usersData?.items || usersData || [];
    if (!Array.isArray(items)) items = [];
    return items.slice(0, 8);
  }, [usersData]);

  return (
    <div className="space-y-6 animate-fade-in">
      {analyticsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="card p-5 hover:shadow-md transition-all">
                <div className="flex items-center justify-between mb-3">
                  <div className={`h-9 w-9 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <Icon className={`h-4.5 w-4.5 ${card.color}`} />
                  </div>
                  <TrendingUp className="h-3.5 w-3.5 text-brand-300" />
                </div>
                <p className="text-2xl font-bold text-brand-900">{card.value.toLocaleString()}</p>
                <p className="text-xs text-brand-500 mt-1">{card.label}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Posts */}
        <div className="card">
          <div className="px-5 py-4 border-b border-brand-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-brand-500" />
              <h3 className="font-semibold text-brand-900">Recent Posts</h3>
            </div>
            <span className="text-xs text-brand-400">{recentJobs.length} of {jobsData?.items?.length || jobsData?.length || 0}</span>
          </div>
          <div className="p-5">
            {jobsLoading ? (
              <ListSkeleton count={4} height="h-14" />
            ) : recentJobs.length === 0 ? (
              <div className="text-center py-8">
                <Briefcase className="h-7 w-7 text-brand-300 mx-auto mb-2" />
                <p className="text-sm text-brand-400">No posts yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map(job => {
                  const jobId = job.jobId || job.id;
                  const statusCls = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft;
                  return (
                    <div key={jobId} className="flex items-center gap-3 p-3 rounded-lg hover:bg-brand-50 transition-colors">
                      <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100">
                        {job.companyLogoURL ? (
                          <img src={job.companyLogoURL} alt="" className="h-full w-full object-cover rounded-lg" />
                        ) : (
                          <Building2 className="h-4 w-4 text-brand-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brand-900 truncate">{job.title}</p>
                        <p className="text-xs text-brand-400">{job.companyName || 'Unknown'}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border flex-shrink-0 ${statusCls}`}>
                        {job.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Users */}
        <div className="card">
          <div className="px-5 py-4 border-b border-brand-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" />
              <h3 className="font-semibold text-brand-900">Recent Users</h3>
            </div>
            <span className="text-xs text-brand-400">{recentUsers.length} of {usersData?.items?.length || usersData?.length || 0}</span>
          </div>
          <div className="p-5">
            {usersLoading ? (
              <ListSkeleton count={5} height="h-12" />
            ) : recentUsers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-7 w-7 text-brand-300 mx-auto mb-2" />
                <p className="text-sm text-brand-400">No users yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentUsers.map(user => {
                  const roleCls = ROLE_COLORS[user.role] || 'bg-brand-100 text-brand-600 border-brand-200';
                  return (
                    <div key={user.uid} className="flex items-center gap-3 p-3 rounded-lg hover:bg-brand-50 transition-colors">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0 border border-brand-100" />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 text-sm font-bold flex-shrink-0 border border-brand-100">
                          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-brand-900 truncate">{user.displayName || '—'}</p>
                        <p className="text-xs text-brand-400 truncate">{user.email}</p>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border capitalize flex-shrink-0 ${roleCls}`}>
                        {user.role || 'none'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tab 1: Post Verification ──────────────────────────────── */
function PostVerificationTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: adminService.listJobs,
  });

  const verifyMutation = useMutation({
    mutationFn: (jobId) => adminService.verifyJob(jobId),
    onSuccess: () => {
      toast.success('Job verified successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to verify job'),
  });

  const moderateMutation = useMutation({
    mutationFn: ({ jobId, status }) => adminService.moderateJob(jobId, status),
    onSuccess: () => {
      toast.success('Job status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update job'),
  });

  const jobs = useMemo(() => {
    let items = data?.items || data || [];
    if (!Array.isArray(items)) items = [];
    if (statusFilter) items = items.filter(j => j.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.companyName || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, statusFilter, search]);

  const allJobs = useMemo(() => {
    let items = data?.items || data || [];
    if (!Array.isArray(items)) items = [];
    return items;
  }, [data]);

  const verifiedCount = allJobs.filter(j => j.verifiedByAdmin).length;
  const pendingCount = allJobs.length - verifiedCount;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
        <ListSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-brand-900">{allJobs.length}</p>
          <p className="text-xs text-brand-500 mt-1">Total Posts</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{verifiedCount}</p>
          <p className="text-xs text-brand-500 mt-1">Verified</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-xs text-brand-500 mt-1">Pending</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand-900">All Company Posts</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              type="text"
              placeholder="Search posts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input w-36"
          >
            {JOB_STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Post List */}
      {jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Briefcase className="h-8 w-8 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">No posts found</p>
          <p className="text-xs text-brand-400 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const jobId = job.jobId || job.id;
            const statusCls = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft;
            return (
              <div key={jobId} className="card p-4 sm:p-5 hover:shadow-md transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-11 w-11 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100 overflow-hidden">
                      {job.companyLogoURL ? (
                        <img src={job.companyLogoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-5 w-5 text-brand-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-brand-900 truncate">{job.title}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${statusCls}`}>
                          {job.status}
                        </span>
                        {job.verifiedByAdmin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <ShieldCheck className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-brand-500 mt-0.5">{job.companyName || '—'}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-brand-400">
                        {job.jobType && <span>{job.jobType}</span>}
                        {job.createdAt && <span>Posted {timeAgo(job.createdAt)}</span>}
                        <span>{job.applicationCount ?? 0} applicants</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!job.verifiedByAdmin ? (
                      <button
                        onClick={() => verifyMutation.mutate(jobId)}
                        disabled={verifyMutation.isPending}
                        className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verify
                      </button>
                    ) : (
                      <span className="px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified
                      </span>
                    )}
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value) moderateMutation.mutate({ jobId, status: e.target.value });
                      }}
                      className="px-3 py-2 rounded-lg bg-brand-50 text-brand-600 text-xs font-medium border border-brand-200 hover:bg-brand-100 cursor-pointer"
                    >
                      <option value="">Change Status</option>
                      <option value="active">Set Active</option>
                      <option value="paused">Pause</option>
                      <option value="closed">Close</option>
                      <option value="removed">Remove</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Tab 2: Job Management ─────────────────────────────────── */
function JobsTab() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: adminService.listJobs,
  });

  const verifyMutation = useMutation({
    mutationFn: (jobId) => adminService.verifyJob(jobId),
    onSuccess: () => {
      toast.success('Job verified successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to verify job'),
  });

  const moderateMutation = useMutation({
    mutationFn: ({ jobId, status }) => adminService.moderateJob(jobId, status),
    onSuccess: () => {
      toast.success('Job status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update job'),
  });

  const jobs = useMemo(() => {
    let items = data?.items || data || [];
    if (!Array.isArray(items)) items = [];
    if (statusFilter) items = items.filter(j => j.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(j =>
        (j.title || '').toLowerCase().includes(q) ||
        (j.companyName || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, statusFilter, search]);

  const totalJobs = (data?.items || data || []).length;
  const verifiedCount = (data?.items || data || []).filter(j => j.verifiedByAdmin).length;

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <ListSkeleton count={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-900">{totalJobs} Total Jobs</h2>
          <p className="text-sm text-brand-500">{verifiedCount} verified by LanTURN</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="input w-36"
          >
            {JOB_STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Job Table / Cards */}
      {jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Briefcase className="h-8 w-8 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">No jobs found</p>
          <p className="text-xs text-brand-400 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop table header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-2 text-xs font-semibold text-brand-400 uppercase tracking-wider">
            <div className="col-span-4">Job Title</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Verified</div>
            <div className="col-span-2">Posted</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {jobs.map(job => {
            const jobId = job.jobId || job.id;
            const statusCls = JOB_STATUS_COLORS[job.status] || JOB_STATUS_COLORS.draft;
            return (
              <div key={jobId} className="card p-4 sm:p-5 hover:shadow-md transition-all">
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-4 min-w-0">
                    <p className="font-semibold text-brand-900 truncate">{job.title}</p>
                    <p className="text-xs text-brand-400 mt-0.5">{job.applicationCount ?? 0} applicants</p>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-sm text-brand-600 truncate">{job.companyName || '—'}</p>
                  </div>
                  <div className="col-span-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${statusCls}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="col-span-1">
                    {job.verifiedByAdmin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> Yes
                      </span>
                    ) : (
                      <span className="text-xs text-brand-400">No</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm text-brand-500">{job.createdAt ? timeAgo(job.createdAt) : '—'}</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    {!job.verifiedByAdmin && (
                      <button
                        onClick={() => verifyMutation.mutate(jobId)}
                        disabled={verifyMutation.isPending}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Verify
                      </button>
                    )}
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value) moderateMutation.mutate({ jobId, status: e.target.value });
                      }}
                      className="px-2 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-medium border border-brand-200 hover:bg-brand-100 cursor-pointer"
                    >
                      <option value="">Change Status</option>
                      <option value="active">Set Active</option>
                      <option value="paused">Pause</option>
                      <option value="closed">Close</option>
                      <option value="removed">Remove</option>
                    </select>
                  </div>
                </div>

                {/* Mobile layout */}
                <div className="md:hidden space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-900 truncate">{job.title}</p>
                      <p className="text-sm text-brand-500">{job.companyName || '—'}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border flex-shrink-0 ${statusCls}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {job.verifiedByAdmin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    ) : (
                      <button
                        onClick={() => verifyMutation.mutate(jobId)}
                        disabled={verifyMutation.isPending}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1"
                      >
                        {verifyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />} Verify
                      </button>
                    )}
                    <span className="text-xs text-brand-400">{job.applicationCount ?? 0} applicants</span>
                    <span className="text-xs text-brand-400">{job.createdAt ? timeAgo(job.createdAt) : ''}</span>
                  </div>
                  <select
                    value=""
                    onChange={e => {
                      if (e.target.value) moderateMutation.mutate({ jobId, status: e.target.value });
                    }}
                    className="input w-full text-sm"
                  >
                    <option value="">Change Status</option>
                    <option value="active">Set Active</option>
                    <option value="paused">Pause</option>
                    <option value="closed">Close</option>
                    <option value="removed">Remove</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Tab 3: User Management ────────────────────────────────── */
function UsersTab() {
  const queryClient = useQueryClient();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [openMenu, setOpenMenu] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', roleFilter, statusFilter],
    queryFn: () => adminService.listUsers({
      role: roleFilter || undefined,
      status: statusFilter || undefined,
      limit: 100,
    }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ uid, status }) => adminService.updateUserStatus(uid, status),
    onSuccess: () => {
      toast.success('User status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update user'),
  });

  const roleMutation = useMutation({
    mutationFn: ({ uid, role }) => adminService.updateUserRole(uid, role),
    onSuccess: () => {
      toast.success('User role updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update role'),
  });

  const users = useMemo(() => {
    let items = data?.items || data || [];
    if (!Array.isArray(items)) items = [];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(u =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, search]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('[data-menu]')) setOpenMenu(null);
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-in">
        <ListSkeleton count={6} height="h-20" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-brand-900">{users.length} Users</h2>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:flex-initial sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-9 w-full"
            />
          </div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input w-32">
            <option value="">All Roles</option>
            <option value="student">Student</option>
            <option value="employer">Employer</option>
            <option value="admin">Admin</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-32">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* User Cards */}
      {users.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="h-8 w-8 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">No users found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map(user => {
            const roleCls = ROLE_COLORS[user.role] || 'bg-brand-100 text-brand-600 border-brand-200';
            const isActive = user.status === 'active';
            return (
              <div key={user.uid} className="card p-5 hover:shadow-md transition-all relative">
                <div className="flex items-start gap-3 mb-3">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="h-11 w-11 rounded-full object-cover flex-shrink-0 border border-brand-100" />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 text-base font-bold flex-shrink-0 border border-brand-100">
                      {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-900 truncate">{user.displayName || '—'}</p>
                    <p className="text-xs text-brand-400 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border capitalize ${roleCls}`}>
                    {user.role || 'none'}
                  </span>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="h-3 w-3" /> Disabled
                    </span>
                  )}
                </div>

                {user.createdAt && (
                  <p className="text-xs text-brand-400 mb-3">Joined {timeAgo(user.createdAt)}</p>
                )}

                {/* Single Actions Dropdown */}
                <div className="relative" data-menu>
                  <button
                    onClick={() => setOpenMenu(openMenu === user.uid ? null : user.uid)}
                    className="w-full px-3 py-2 rounded-lg bg-brand-50 text-brand-600 text-xs font-medium border border-brand-200 hover:bg-brand-100 transition-colors flex items-center justify-center gap-2"
                  >
                    Actions
                    <svg className={`h-3 w-3 transition-transform ${openMenu === user.uid ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {openMenu === user.uid && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 card p-2 shadow-soft-lg z-20 border border-brand-100">
                      <p className="text-xs text-brand-400 font-semibold uppercase tracking-wider px-2 py-1">Change Role</p>
                      {['student', 'employer', 'admin'].map(role => (
                        <button
                          key={role}
                          onClick={() => {
                            roleMutation.mutate({ uid: user.uid, role });
                            setOpenMenu(null);
                          }}
                          disabled={user.role === role}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                            user.role === role
                              ? 'text-brand-300 cursor-not-allowed'
                              : 'text-brand-600 hover:bg-brand-50'
                          }`}
                        >
                          {role}
                        </button>
                      ))}
                      <div className="border-t border-brand-100 my-1" />
                      <button
                        onClick={() => {
                          statusMutation.mutate({
                            uid: user.uid,
                            status: isActive ? 'disabled' : 'active',
                          });
                          setOpenMenu(null);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 ${
                          isActive
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {isActive ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        {isActive ? 'Disable User' : 'Enable User'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Main Admin Page ───────────────────────────────────────── */
export default function AdminPage() {
  const hash = window.location.hash.replace('#', '');
  const initialTab = TABS.find(t => t.id === hash) ? hash : 'dashboard';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    function handleHashChange() {
      const h = window.location.hash.replace('#', '');
      if (TABS.find(t => t.id === h)) setActiveTab(h);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const switchTab = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-brand-900">Admin Portal</h1>
          </div>
          <p className="text-sm text-brand-500 mt-1 ml-10">Manage posts, jobs, and users</p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-white/40 backdrop-blur-md border border-white/50 p-1.5 rounded-2xl shadow-soft-sm inline-flex items-center gap-1 overflow-x-auto mb-4">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-white text-brand-900 shadow-sm ring-1 ring-brand-100/50'
                  : 'text-brand-600 hover:text-brand-900 hover:bg-white/60'
              }`}
            >
              <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-accent' : 'opacity-70'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'verification' && <PostVerificationTab />}
        {activeTab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
