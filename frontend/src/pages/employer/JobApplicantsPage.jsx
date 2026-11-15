import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { applicationService } from '../../services/application.service.js';
import { studentService } from '../../services/student.service.js';
import { jobService } from '../../services/job.service.js';
import { employerService } from '../../services/employer.service.js';
import CandidateMatchCard from '../../components/employer/CandidateMatchCard.jsx';
import toast from 'react-hot-toast';
import { timeAgo, formatDate } from '../../lib/utils.js';
import {
  ArrowLeft, UserCheck, UserX, Award, Eye, Download,
  FileText, Github, Linkedin, Globe, GraduationCap,
  Briefcase, Code, Star, X, ExternalLink, ChevronDown,
  LayoutGrid, List,
} from 'lucide-react';
import KanbanBoard from '../../components/ui/KanbanBoard.jsx';

const STATUS_CONFIG = {
  submitted:   { label: 'Applied',     cls: 'badge-blue',    color: 'blue' },
  reviewed:    { label: 'Reviewing',   cls: 'badge-yellow',  color: 'amber' },
  shortlisted: { label: 'Shortlisted', cls: 'badge-green',   color: 'emerald' },
  accepted:    { label: 'Hired',       cls: 'badge-purple',  color: 'violet' },
  rejected:    { label: 'Rejected',    cls: 'badge-red',     color: 'red' },
  withdrawn:   { label: 'Withdrawn',   cls: 'badge-default', color: 'slate' },
};

const ACTIONS = [
  { status: 'reviewed',    label: 'Mark Reviewing', icon: Eye,       cls: 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200' },
  { status: 'shortlisted', label: 'Shortlist',      icon: UserCheck, cls: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200' },
  { status: 'accepted',    label: 'Hire',           icon: Award,     cls: 'text-brand-600 bg-brand-50 hover:bg-brand-100 border-brand-200' },
  { status: 'rejected',    label: 'Reject',         icon: UserX,     cls: 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200' },
];

/* ── Student Profile Modal ────────────────────────────────── */
function ProfileModal({ studentId, onClose }) {
  const { data: student, isLoading } = useQuery({
    queryKey: ['student', 'public', studentId],
    queryFn: () => studentService.getPublic(studentId),
    enabled: !!studentId,
  });

  if (!studentId) return null;

  const p = student || {};
  const personal = p.personal || {};
  const academic = p.academic || {};
  const professional = p.professional || {};
  const social = p.social || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-brand-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-brand-900">Student Profile</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center text-brand-400 hover:bg-brand-100 hover:text-brand-900 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-16 skeleton rounded-lg" />)}
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Personal */}
            <div className="flex items-center gap-4">
              {p.profilePhotoURL ? (
                <img src={p.profilePhotoURL} alt="" className="h-14 w-14 rounded-full object-cover flex-shrink-0 border border-brand-100" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xl font-bold flex-shrink-0">
                  {(personal.name || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-lg font-semibold text-brand-900">{personal.name || 'Student'}</h3>
                <p className="text-sm text-brand-500">{personal.headline || ''}</p>
                {personal.location && <p className="text-xs text-brand-400">{personal.location}</p>}
              </div>
            </div>

            {/* Social links */}
            {(social.github || social.linkedin || social.portfolio) && (
              <div className="flex flex-wrap gap-2">
                {social.github && (
                  <a href={social.github} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex items-center gap-1.5">
                    <Github className="h-3.5 w-3.5" /> GitHub
                  </a>
                )}
                {social.linkedin && (
                  <a href={social.linkedin} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex items-center gap-1.5">
                    <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  </a>
                )}
                {social.portfolio && (
                  <a href={social.portfolio} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> Portfolio
                  </a>
                )}
              </div>
            )}

            {/* Education */}
            <div>
              <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                <GraduationCap className="h-4 w-4 text-brand-500" /> Education
              </h4>
              <div className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                <p className="font-medium text-brand-900">{academic.college || 'N/A'}</p>
                <p className="text-sm text-brand-500">{academic.degree || ''}{academic.branch ? ` — ${academic.branch}` : ''}</p>
                <p className="text-xs text-brand-400">{academic.graduationYear ? `Class of ${academic.graduationYear}` : ''}{academic.cgpa ? ` · CGPA: ${academic.cgpa}` : ''}</p>
              </div>
            </div>

            {/* Skills */}
            {professional.skills?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                  <Code className="h-4 w-4 text-brand-500" /> Skills
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {professional.skills.map((s, i) => (
                    <span key={i} className="pill">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Projects */}
            {professional.projects?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                  <Star className="h-4 w-4 text-brand-500" /> Projects
                </h4>
                <div className="space-y-2">
                  {professional.projects.map((proj, i) => (
                    <div key={i} className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-brand-900 text-sm">{proj.name || proj.title || 'Project'}</p>
                        {proj.link && (
                          <a href={proj.link} target="_blank" rel="noopener noreferrer" className="text-brand-500 hover:text-brand-700">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {proj.description && <p className="text-xs text-brand-500 mt-1">{proj.description}</p>}
                      {proj.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {proj.technologies.map((t, j) => (
                            <span key={j} className="badge-default text-[10px]">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Experience */}
            {professional.experience?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                  <Briefcase className="h-4 w-4 text-brand-500" /> Experience
                </h4>
                <div className="space-y-2">
                  {professional.experience.map((exp, i) => (
                    <div key={i} className="p-3 rounded-lg bg-brand-50 border border-brand-100">
                      <p className="font-medium text-brand-900 text-sm">{exp.role || exp.title || 'Role'}</p>
                      <p className="text-xs text-brand-500">{exp.company || ''}{exp.duration ? ` · ${exp.duration}` : ''}</p>
                      {exp.description && <p className="text-xs text-brand-400 mt-1">{exp.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {professional.certifications?.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-brand-900 flex items-center gap-1.5 mb-2">
                  <Award className="h-4 w-4 text-brand-500" /> Certifications
                </h4>
                <div className="space-y-1.5">
                  {professional.certifications.map((cert, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-brand-50 border border-brand-100 flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-brand-400" />
                      <span className="text-sm text-brand-700">{cert.name || cert.title || cert}</span>
                      {cert.issuer && <span className="text-xs text-brand-400">— {cert.issuer}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JobApplicantsPage() {
  const { jobId } = useParams();
  const qc = useQueryClient();
  const [profileId, setProfileId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState('kanban');

  const { data: jobData } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobService.get(jobId),
  });

  const { data, isLoading: isAppsLoading } = useQuery({
    queryKey: ['applications', 'job', jobId],
    queryFn: () => applicationService.listForJob(jobId, { limit: 100 }),
  });

  const { data: matchesData, isLoading: isMatchesLoading } = useQuery({
    queryKey: ['matches', 'job', jobId],
    queryFn: () => employerService.getJobMatches(jobId),
  });

  const matchesMap = {};
  if (matchesData) {
    matchesData.forEach(m => {
      matchesMap[m.studentId] = m;
    });
  }

  const isLoading = isAppsLoading || isMatchesLoading;


  const allApplicants = data?.items ?? [];
  const applicants = statusFilter
    ? allApplicants.filter(a => a.status === statusFilter)
    : allApplicants;

  const statusMutation = useMutation({
    mutationFn: ({ id, body }) => applicationService.updateStatus(id, body),
    onSuccess: () => {
      toast.success('Status updated');
      qc.invalidateQueries({ queryKey: ['applications', 'job', jobId] });
      qc.invalidateQueries({ queryKey: ['employer', 'analytics'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update'),
  });

  // Count by status
  const counts = {};
  allApplicants.forEach(a => { counts[a.status] = (counts[a.status] || 0) + 1; });

  const handleViewResume = async (appId) => {
    try {
      const toastId = toast.loading('Loading resume...');
      const { signedUrl } = await applicationService.getResumeUrl(appId);
      toast.dismiss(toastId);
      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Resume URL not available');
      }
    } catch (err) {
      toast.dismiss();
      toast.error(err.message || 'Failed to load resume');
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Modal */}
      <ProfileModal studentId={profileId} onClose={() => setProfileId(null)} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link to="/employer/jobs" className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-600 mb-2 transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Jobs
          </Link>
          <h1 className="text-2xl font-bold text-brand-900">Applicants</h1>
          <p className="text-sm text-brand-500">
            {jobData?.title ? `"${jobData.title}"` : 'Job'} — {allApplicants.length} applicant{allApplicants.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 bg-brand-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'kanban' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700'}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Board
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700'}`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`badge cursor-pointer transition-all ${!statusFilter ? 'bg-brand-100 text-brand-700 ring-1 ring-brand-300' : 'bg-brand-100 text-brand-600 hover:bg-brand-200'}`}
        >
          All ({allApplicants.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const cnt = counts[key] || 0;
          if (cnt === 0) return null;
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={`badge cursor-pointer transition-all ${statusFilter === key ? `${cfg.cls} ring-1` : 'bg-brand-100 text-brand-600 hover:bg-brand-200'}`}
            >
              {cfg.label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* Applicants List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded-lg" />)}
        </div>
      ) : viewMode === 'kanban' ? (
        /* ── KANBAN VIEW ──────────────────────────────── */
        <KanbanBoard
          columns={[
            { id: 'submitted',   title: 'Applied',     color: '#3b82f6' },
            { id: 'reviewed',    title: 'Reviewing',   color: '#f59e0b' },
            { id: 'shortlisted', title: 'Shortlisted', color: '#10b981' },
            { id: 'accepted',    title: 'Hired',       color: '#8b5cf6' },
            { id: 'rejected',    title: 'Rejected',    color: '#ef4444' },
          ]}
          items={allApplicants.map((app) => ({ ...app, id: app.applicationId }))}
          getItemColumn={(item) => item.status}
          onDragEnd={({ item, toColumn }) => {
            statusMutation.mutate({ id: item.applicationId, body: { status: toColumn } });
          }}
          renderCard={(app) => {
            const match = matchesMap[app.studentId];
            return (
              <div className="bg-white rounded-lg p-3.5 shadow-sm border border-brand-100 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2.5 mb-2">
                  {app.studentPhotoURL ? (
                    <img src={app.studentPhotoURL} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0 border border-brand-100" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                      {(app.studentName || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-brand-800 truncate">{app.studentName || 'Student'}</p>
                    <p className="text-[10px] text-brand-400">{timeAgo(app.createdAt)}</p>
                  </div>
                  {match && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                      {Math.round(match.score ?? match.matchScore ?? 0)}%
                    </span>
                  )}
                </div>
                {app.skillsSnapshot?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {app.skillsSnapshot.slice(0, 4).map((s, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-600 font-medium">{s}</span>
                    ))}
                    {app.skillsSnapshot.length > 4 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-100 text-brand-500">+{app.skillsSnapshot.length - 4}</span>}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setProfileId(app.studentId); }}
                    className="text-[10px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    View Profile
                  </button>
                  {app.resumeUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleViewResume(app.applicationId); }}
                      className="text-[10px] font-medium text-brand-500 hover:text-brand-700 transition-colors"
                    >
                      Resume
                    </button>
                  )}
                </div>
              </div>
            );
          }}
        />
      ) : applicants.length === 0 ? (
        <div className="card p-12 text-center">
          <UserCheck className="h-10 w-10 text-brand-300 mx-auto mb-3" />
          <p className="text-brand-500 font-medium">
            {statusFilter ? `No ${STATUS_CONFIG[statusFilter]?.label?.toLowerCase()} applicants` : 'No applicants yet'}
          </p>
          <p className="text-sm text-brand-400 mt-1">Applications will appear here as candidates apply</p>
        </div>
      ) : (
        <div className="space-y-3">
          {applicants.map((app) => {
            const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted;
            return (
              <div key={app.applicationId} className="card p-5 hover:shadow-md transition-shadow animate-slide-up">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Left: Student info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {app.studentPhotoURL ? (
                      <img src={app.studentPhotoURL} alt="" className="h-11 w-11 rounded-full object-cover flex-shrink-0 border border-brand-100" />
                    ) : (
                      <div className="h-11 w-11 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-bold flex-shrink-0">
                        {(app.studentName || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-brand-900">{app.studentName || 'Student'}</h3>
                        <span className={cfg.cls}>{cfg.label}</span>
                      </div>

                      {app.coverLetter && (
                        <p className="text-sm text-brand-500 mt-1 line-clamp-2">{app.coverLetter}</p>
                      )}
                      {app.skillsSnapshot?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {app.skillsSnapshot.slice(0, 6).map((s, i) => (
                            <span key={i} className="badge-default text-[10px]">{s}</span>
                          ))}
                          {app.skillsSnapshot.length > 6 && <span className="badge-default text-[10px]">+{app.skillsSnapshot.length - 6}</span>}
                        </div>
                      )}
                      <p className="text-xs text-brand-400 mt-1.5">Applied {timeAgo(app.createdAt)}</p>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
                    {/* View Profile */}
                    <button
                      onClick={() => setProfileId(app.studentId)}
                      className="btn-secondary btn-sm flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Profile
                    </button>

                    {/* Resume */}
                    {app.resumeUrl && (
                      <button
                        onClick={() => handleViewResume(app.applicationId)}
                        className="btn-secondary btn-sm flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" /> Resume
                      </button>
                    )}

                    {/* Status actions */}
                    <div className="flex gap-1.5">
                      {ACTIONS.map(action => {
                        if (app.status === action.status) return null;
                        if (app.status === 'withdrawn') return null;
                        return (
                          <button
                            key={action.status}
                            onClick={() => statusMutation.mutate({ id: app.applicationId, body: { status: action.status } })}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors ${action.cls}`}
                            title={action.label}
                          >
                            <action.icon className="h-3 w-3" />
                            <span className="hidden sm:inline">{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* AI Match Score Card (Full Width) */}
                {matchesMap[app.studentId] && (
                  <div className="mt-5 border-t border-brand-100 pt-5">
                    <CandidateMatchCard candidate={app} matchData={matchesMap[app.studentId]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}