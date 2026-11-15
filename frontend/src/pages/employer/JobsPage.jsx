import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobService } from '../../services/job.service.js';
import { employerService } from '../../services/employer.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import toast from 'react-hot-toast';
import { formatSalary, timeAgo } from '../../lib/utils.js';
import { Link } from 'react-router-dom';
import {
  Plus, X, Pencil, Trash2, Users, Play, Pause, Eye,
  MapPin, Clock, Briefcase, GraduationCap, DollarSign, Sparkles, Loader2,
  ShieldCheck,
} from 'lucide-react';

const JOB_TYPES = ['full-time', 'part-time', 'internship', 'contract'];
const WORK_MODES = ['onsite', 'remote', 'hybrid'];
const EXP_LEVELS = ['entry', 'junior', 'mid', 'senior'];

function StatusBadge({ status }) {
  const cfg = {
    active:  'badge-green',
    paused:  'badge-yellow',
    closed:  'badge-default',
    draft:   'badge-blue',
  };
  return <span className={cfg[status] || 'badge-default'}>{status}</span>;
}

// ── Tags input for skills ─────────────────────────────────────
function SkillsInput({ value = [], onChange }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.map((s, i) => (
          <span key={i} className="pill">
            {s}
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="pill-remove">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Type a skill and press Enter..."
        />
        <button type="button" onClick={add} className="btn-secondary btn-sm">Add</button>
      </div>
    </div>
  );
}

export default function EmployerJobsPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', 'mine'],
    queryFn: () => jobService.listMine({ limit: 50 }),
  });

  const jobs = data?.items ?? [];

  const createMutation = useMutation({
    mutationFn: jobService.create,
    onSuccess: () => {
      toast.success('Job posted!');
      setShowForm(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      qc.invalidateQueries({ queryKey: ['employer', 'analytics'] });
    },
    onError: (err) => {
      const msg = err.details?.length 
        ? `Invalid: ${err.details[0].field} - ${err.details[0].message}` 
        : (err.message || 'Failed to post job');
      toast.error(msg);
      console.error('Job Creation Error:', err.details || err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => jobService.update(id, body),
    onSuccess: () => {
      toast.success('Job updated!');
      setEditingId(null);
      setShowForm(false);
      setForm({});
      qc.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      qc.invalidateQueries({ queryKey: ['employer', 'analytics'] });
    },
    onError: (err) => {
      const msg = err.details?.length 
        ? `Invalid: ${err.details[0].field} - ${err.details[0].message}` 
        : (err.message || 'Failed to update job');
      toast.error(msg);
      console.error('Job Update Error:', err.details || err);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: jobService.remove,
    onSuccess: () => {
      toast.success('Job deleted');
      qc.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      qc.invalidateQueries({ queryKey: ['employer', 'analytics'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to delete job'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => jobService.update(id, { status }),
    onSuccess: () => {
      toast.success('Job status updated');
      qc.invalidateQueries({ queryKey: ['jobs', 'mine'] });
      qc.invalidateQueries({ queryKey: ['employer', 'analytics'] });
    },
    onError: (err) => toast.error(err.message || 'Status update failed'),
  });

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  // ── AI Job Description Generator ──────────────────────────
  const aiDescMutation = useMutation({
    mutationFn: (body) => employerService.aiGenerateJobDesc(body),
    onSuccess: (data) => {
      setForm(prev => ({
        ...prev,
        description: data.description || prev.description,
        responsibilities: data.responsibilities || prev.responsibilities,
        requirements: data.requirements?.length
          ? data.requirements.join('\n')
          : prev.requirements,
        requiredSkills: data.requiredSkills?.length
          ? data.requiredSkills
          : prev.requiredSkills || [],
      }));
      // Append nice-to-have into description if present
      if (data.niceToHave?.length) {
        setForm(prev => ({
          ...prev,
          description: prev.description + '\n\nNice to have: ' + data.niceToHave.join(', '),
        }));
      }
      toast.success('AI generated description! Review and edit before posting.', { icon: '' });
    },
    onError: (err) => toast.error(err.message || 'AI generation failed'),
  });

  const handleAIGenerate = () => {
    if (!form.title) {
      toast.error('Please enter a Job Title first');
      return;
    }
    aiDescMutation.mutate({
      title: form.title,
      jobType: form.jobType || 'full-time',
      experienceLevel: form.experienceLevel || 'entry',
      workMode: form.workMode || '',
      department: form.department || '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Build the payload
    const payload = {
      title: form.title,
      description: form.description,
      jobType: form.jobType,
      location: {
        city: form.locationCity || '',
        state: form.locationState || '',
        country: form.locationCountry || '',
        remote: form.workMode === 'remote',
      },
      workMode: form.workMode || undefined,
      department: form.department || undefined,
      role: form.role || undefined,
      responsibilities: form.responsibilities || undefined,
      requirements: form.requirements ? form.requirements.split('\n').filter(Boolean) : [],
      requiredSkills: form.requiredSkills || [],
      experienceLevel: form.experienceLevel || undefined,
      educationRequirement: form.educationRequirement || undefined,
      salary: {
        min: form.salaryMin ? Number(form.salaryMin) : undefined,
        max: form.salaryMax ? Number(form.salaryMax) : undefined,
        currency: form.salaryCurrency || 'INR',
        period: form.salaryPeriod || 'yearly',
        negotiable: form.negotiable === 'true',
      },
      stipend: form.jobType === 'internship' ? {
        amount: form.stipendAmount ? Number(form.stipendAmount) : undefined,
        currency: 'INR',
        period: 'monthly',
      } : undefined,
      openings: form.openings ? Number(form.openings) : undefined,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : undefined,
      benefits: form.benefits || [],
      status: form.status || 'active',
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, body: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startEdit = (job) => {
    setEditingId(job.jobId);
    setForm({
      title: job.title,
      description: job.description,
      jobType: job.jobType,
      workMode: job.workMode || '',
      department: job.department || '',
      role: job.role || '',
      responsibilities: job.responsibilities || '',
      requirements: (job.requirements || []).join('\n'),
      requiredSkills: job.requiredSkills || [],
      experienceLevel: job.experienceLevel || '',
      educationRequirement: job.educationRequirement || '',
      locationCity: job.location?.city || '',
      locationState: job.location?.state || '',
      locationCountry: job.location?.country || '',
      salaryMin: job.salary?.min || '',
      salaryMax: job.salary?.max || '',
      salaryCurrency: job.salary?.currency || 'INR',
      salaryPeriod: job.salary?.period || 'yearly',
      negotiable: job.salary?.negotiable ? 'true' : 'false',
      stipendAmount: job.stipend?.amount || '',
      openings: job.openings || '',
      deadline: job.deadline ? job.deadline.slice(0, 10) : '',
      benefits: job.benefits || [],
      status: job.status,
    });
    setShowForm(true);
  };

  const isMutating = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">My Jobs</h1>
          <p className="text-sm text-brand-500">Manage your job postings and track applicants</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({}); }}
          className={showForm ? 'btn-secondary text-sm' : 'btn-primary text-sm flex items-center gap-1.5'}
        >
          {showForm ? (
            <><X className="h-3.5 w-3.5" /> Cancel</>
          ) : (
            <><Plus className="h-3.5 w-3.5" /> Post New Job</>
          )}
        </button>
      </div>

      {/* ── Job Form ──────────────────────────────────────── */}
      {showForm && (
        <div className="card p-6 animate-slide-up">
          <h2 className="font-semibold text-brand-900 mb-4">{editingId ? 'Edit Job' : 'Post New Job'}</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label label-required">Job Title</label>
                <input name="title" value={form.title || ''} onChange={handleChange} className="input" required placeholder="Software Engineer" />
              </div>
              <div>
                <label className="label">Role / Position</label>
                <input name="role" value={form.role || ''} onChange={handleChange} className="input" placeholder="Backend Developer" />
              </div>
              <div>
                <label className="label">Department</label>
                <input name="department" value={form.department || ''} onChange={handleChange} className="input" placeholder="Engineering" />
              </div>
              <div>
                <label className="label label-required">Employment Type</label>
                <select name="jobType" value={form.jobType || ''} onChange={handleChange} className="input" required>
                  <option value="">Select type...</option>
                  {JOB_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Work Mode</label>
                <select name="workMode" value={form.workMode || ''} onChange={handleChange} className="input">
                  <option value="">Select mode...</option>
                  {WORK_MODES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Experience Level</label>
                <select name="experienceLevel" value={form.experienceLevel || ''} onChange={handleChange} className="input">
                  <option value="">Any</option>
                  {EXP_LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label label-required mb-0">Job Description</label>
                <button
                  type="button"
                  onClick={handleAIGenerate}
                  disabled={aiDescMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-60 disabled:cursor-wait"
                >
                  {aiDescMutation.isPending ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  ) : (
                    <><Sparkles className="h-3.5 w-3.5" /> Generate with AI</>
                  )}
                </button>
              </div>
              <textarea name="description" rows={4} value={form.description || ''} onChange={handleChange} className="textarea" required placeholder="Describe the role and what the ideal candidate looks like..." />
            </div>

            {/* Responsibilities */}
            <div>
              <label className="label">Responsibilities</label>
              <textarea name="responsibilities" rows={3} value={form.responsibilities || ''} onChange={handleChange} className="textarea" placeholder="Key responsibilities for this role..." />
            </div>

            {/* Requirements */}
            <div>
              <label className="label">Requirements</label>
              <textarea name="requirements" rows={3} value={form.requirements || ''} onChange={handleChange} className="textarea" placeholder="One requirement per line..." />
              <p className="form-hint">Enter one requirement per line</p>
            </div>

            {/* Skills */}
            <div>
              <label className="label">Required Skills</label>
              <SkillsInput
                value={form.requiredSkills || []}
                onChange={(skills) => setForm(p => ({ ...p, requiredSkills: skills }))}
              />
            </div>

            {/* Education */}
            <div>
              <label className="label">Education Requirement</label>
              <input name="educationRequirement" value={form.educationRequirement || ''} onChange={handleChange} className="input" placeholder="B.Tech / B.E. in Computer Science or equivalent" />
            </div>

            {/* Location */}
            <div>
              <label className="label font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                <MapPin className="h-3.5 w-3.5 text-brand-400" /> Location
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input name="locationCity" value={form.locationCity || ''} onChange={handleChange} className="input" placeholder="City" />
                <input name="locationState" value={form.locationState || ''} onChange={handleChange} className="input" placeholder="State" />
                <input name="locationCountry" value={form.locationCountry || ''} onChange={handleChange} className="input" placeholder="Country" />
              </div>
            </div>

            {/* Compensation */}
            <div>
              <label className="label font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                <DollarSign className="h-3.5 w-3.5 text-brand-400" /> Compensation
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="label">Min Salary</label>
                  <input name="salaryMin" type="number" value={form.salaryMin || ''} onChange={handleChange} className="input" placeholder="400000" />
                </div>
                <div>
                  <label className="label">Max Salary</label>
                  <input name="salaryMax" type="number" value={form.salaryMax || ''} onChange={handleChange} className="input" placeholder="800000" />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select name="salaryCurrency" value={form.salaryCurrency || 'INR'} onChange={handleChange} className="input">
                    {['INR', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Negotiable?</label>
                  <select name="negotiable" value={form.negotiable || 'false'} onChange={handleChange} className="input">
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </div>
              </div>
              {form.jobType === 'internship' && (
                <div className="mt-3">
                  <label className="label">Monthly Stipend (₹)</label>
                  <input name="stipendAmount" type="number" value={form.stipendAmount || ''} onChange={handleChange} className="input w-48" placeholder="15000" />
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Openings</label>
                <input name="openings" type="number" min="1" value={form.openings || ''} onChange={handleChange} className="input" placeholder="5" />
              </div>
              <div>
                <label className="label">Application Deadline</label>
                <input name="deadline" type="date" value={form.deadline || ''} onChange={handleChange} className="input" />
              </div>
              <div>
                <label className="label">Status</label>
                <select name="status" value={form.status || 'active'} onChange={handleChange} className="input">
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            {/* Benefits */}
            <div>
              <label className="label">Job Benefits</label>
              <SkillsInput
                value={form.benefits || []}
                onChange={(val) => setForm(p => ({ ...p, benefits: val }))}
              />
              <p className="form-hint">e.g. Health Insurance, WFH Fridays, Learning Budget</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={isMutating} className="btn-primary">
                {isMutating ? 'Saving...' : editingId ? 'Update Job' : 'Post Job'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm({}); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Jobs List ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-lg" />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card p-12 text-center">
          <Briefcase className="h-10 w-10 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">No jobs posted yet</p>
          <p className="text-sm text-brand-400 mt-1">Click "Post New Job" to create your first listing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.jobId} className="card p-5 hover:shadow-md transition-shadow animate-slide-up">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-semibold text-brand-900">{job.title}</h3>
                    <StatusBadge status={job.status} />
                    {job.verifiedByAdmin && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    )}
                    {job.workMode && <span className="badge-default">{job.workMode}</span>}
                    {job.jobType && <span className="badge-brand">{job.jobType}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-brand-500">
                    {job.location?.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {job.location.city}{job.location.state ? `, ${job.location.state}` : ''}
                      </span>
                    )}
                    {job.department && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" /> {job.department}
                      </span>
                    )}
                    {job.experienceLevel && (
                      <span className="flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5" /> {job.experienceLevel}
                      </span>
                    )}
                  </div>
                  {(job.salary?.min || job.salary?.max) && (
                    <p className="text-sm text-brand-400 mt-1">
                      <DollarSign className="h-3 w-3 inline" /> {formatSalary(job.salary)}
                      {job.salary?.negotiable && <span className="text-brand-500 ml-1">(Negotiable)</span>}
                    </p>
                  )}
                  {job.requiredSkills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.requiredSkills.slice(0, 5).map((s, i) => (
                        <span key={i} className="badge-default text-[10px]">{s}</span>
                      ))}
                      {job.requiredSkills.length > 5 && <span className="badge-default text-[10px]">+{job.requiredSkills.length - 5}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-brand-400">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Posted {timeAgo(job.createdAt)}
                    </span>
                    {job.openings && <span>{job.openings} opening{job.openings > 1 ? 's' : ''}</span>}
                    {job.deadline && <span>Deadline: {new Date(job.deadline).toLocaleDateString()}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Applicants link */}
                  <Link
                    to={`/employer/jobs/${job.jobId}/applicants`}
                    className="btn-secondary btn-sm flex items-center gap-1"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {job.applicationCount || 0} Applicants
                  </Link>

                  {/* Pause / Resume */}
                  {job.status === 'active' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: job.jobId, status: 'paused' })}
                      className="btn-ghost btn-sm flex items-center gap-1 text-amber-600"
                      title="Pause job"
                    >
                      <Pause className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {job.status === 'paused' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: job.jobId, status: 'active' })}
                      className="btn-ghost btn-sm flex items-center gap-1 text-green-600"
                      title="Resume job"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {job.status === 'closed' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: job.jobId, status: 'active' })}
                      className="btn-ghost btn-sm flex items-center gap-1 text-blue-600"
                      title="Reopen job"
                    >
                      <Play className="h-3.5 w-3.5" /> Reopen
                    </button>
                  )}

                  {/* Edit */}
                  <button onClick={() => startEdit(job)} className="btn-ghost btn-sm" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => { if (confirm('Delete this job?')) deleteMutation.mutate(job.jobId); }}
                    className="btn-ghost btn-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}