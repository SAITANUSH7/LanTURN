import { useState, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { jobService, joobleService } from '../../services/job.service.js';
import { applicationService } from '../../services/application.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { employerService } from '../../services/employer.service.js';
import { studentService } from '../../services/student.service.js';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import { CompanyDNAPanel } from '../../components/ai/CompanyDNAPanel.jsx';
import { formatSalary, timeAgo } from '../../lib/utils.js';
import toast from 'react-hot-toast';
import {
  Search, MapPin, Briefcase, Clock, DollarSign,
  Building2, ChevronRight, CheckCircle2, ChevronDown,
  X, Users, GraduationCap, Globe, Star, Loader2,
  ExternalLink, Heart, Cpu, Calendar, Crown, Phone, Mail, Linkedin,
  Sparkles, AlertCircle, ShieldCheck
} from 'lucide-react';

const STATUS_COLORS = {
  active: 'badge-green',
  verified: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  closed: 'badge-default bg-brand-100 text-brand-600',
  paused: 'badge-yellow',
};

/**
 * Compute student qualification match score for a job posting.
 * Returns { score, matchedSkills, missingSkills, matchLabel, matchColor }
 */
export function computeJobMatch(job, studentProfile) {
  if (!studentProfile) {
    return { score: 0, matchedSkills: [], missingSkills: [], matchLabel: 'Unevaluated', matchColor: 'slate' };
  }

  // Collect all student skills (lowercase)
  const studentSkillSet = new Set();

  if (Array.isArray(studentProfile.searchableSkills)) {
    studentProfile.searchableSkills.forEach(s => {
      if (s) studentSkillSet.add(s.toLowerCase().trim());
    });
  }

  const profSkills = studentProfile.professional?.skills || [];
  profSkills.forEach(s => {
    const name = typeof s === 'string' ? s : s?.name;
    if (name) studentSkillSet.add(name.toLowerCase().trim());
  });

  if (Array.isArray(studentProfile.resumeKeywords)) {
    studentProfile.resumeKeywords.forEach(k => {
      if (k) studentSkillSet.add(k.toLowerCase().trim());
    });
  }

  const reqSkills = (job?.requiredSkills || []).map(s => s.toLowerCase().trim());
  const matchedSkills = [];
  const missingSkills = [];

  if (reqSkills.length > 0) {
    reqSkills.forEach(skill => {
      const isMatched = Array.from(studentSkillSet).some(stSkill =>
        stSkill === skill || stSkill.includes(skill) || skill.includes(stSkill)
      );
      if (isMatched) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    });

    const skillMatchRatio = matchedSkills.length / reqSkills.length;
    let score = Math.round(skillMatchRatio * 75);

    let bonus = 0;
    if (studentProfile.resumeUrl) bonus += 5;
    if ((studentProfile.professional?.projects || []).length > 0) bonus += 5;
    if ((studentProfile.professional?.experience || []).length > 0) bonus += 5;
    if (studentSkillSet.size > 5) bonus += 5;
    if (matchedSkills.length > 0) bonus += 5;

    score = Math.min(100, Math.max(15, score + bonus));

    let matchLabel = 'Low Match';
    let matchColor = 'slate';
    if (score >= 80) {
      matchLabel = 'Highly Qualified';
      matchColor = 'emerald';
    } else if (score >= 60) {
      matchLabel = 'Good Fit';
      matchColor = 'indigo';
    } else if (score >= 40) {
      matchLabel = 'Partial Match';
      matchColor = 'amber';
    }

    return { score, matchedSkills, missingSkills, matchLabel, matchColor };
  } else {
    const jobText = `${job?.title || ''} ${job?.description || ''}`.toLowerCase();
    let matchesCount = 0;
    studentSkillSet.forEach(sk => {
      if (sk && jobText.includes(sk)) matchesCount++;
    });

    const score = Math.min(95, Math.max(50, 50 + matchesCount * 8));
    const matchLabel = score >= 80 ? 'Highly Qualified' : score >= 60 ? 'Good Fit' : 'Qualified';
    const matchColor = score >= 80 ? 'emerald' : score >= 60 ? 'indigo' : 'amber';

    return { score, matchedSkills: [], missingSkills: [], matchLabel, matchColor };
  }
}

/* ── Job Detail Dialog ─────────────────────────────────────────── */
function JobDetailDialog({ job, studentProfile, onClose, onApply, isApplying }) {
  const [showCompanyProfile, setShowCompanyProfile] = useState(false);

  // Fetch full job details
  const { data: fullJob, isLoading: jobLoading } = useQuery({
    queryKey: ['job', job.jobId || job.id],
    queryFn: () => jobService.get(job.jobId || job.id),
    initialData: job,
  });

  // Fetch company profile when requested
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['employer', 'public', job.employerId],
    queryFn: () => employerService.getPublic(job.employerId),
    enabled: showCompanyProfile && !!job.employerId,
  });

  // Fetch Company DNA when company profile is shown
  const { data: companyDna, isLoading: dnaLoading } = useQuery({
    queryKey: ['companyDna', 'public', job.employerId],
    queryFn: () => employerService.getPublicCompanyDna(job.employerId),
    enabled: showCompanyProfile && !!job.employerId,
    retry: false,
  });

  const j = fullJob || job;
  const loc = typeof j.location === 'object'
    ? [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', ')
    : (j.location || 'Remote');
  const salaryText = j.salary?.min
    ? formatSalary(j.salary.min, j.salary.max, j.salary.currency)
    : null;
  const isApplied = j.hasApplied || false;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-md animate-fade-in" />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-3xl shadow-soft-2xl ring-1 ring-brand-100 w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slide-up flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-brand-100 px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="h-14 w-14 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100">
              {j.companyLogoURL ? (
                <img src={j.companyLogoURL} alt="" className="h-full w-full object-cover rounded-lg" />
              ) : (
                <Building2 className="h-7 w-7 text-brand-600" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-brand-900 truncate">{j.title}</h2>
              <p className="text-sm font-medium text-brand-600">{j.companyName}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {j.jobType && <span className="badge badge-blue">{j.jobType}</span>}
                {j.workMode && <span className="badge badge-default">{j.workMode}</span>}
                {j.experienceLevel && <span className="badge badge-default">{j.experienceLevel}</span>}
                {j.status && <span className={`badge ${STATUS_COLORS[j.status] || 'badge-default'}`}>{j.status}</span>}
                {j.verifiedByAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified by LanTURN
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-brand-100 hover:bg-brand-200 flex items-center justify-center flex-shrink-0 transition-colors"
          >
            <X className="h-4 w-4 text-brand-500" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto px-6 py-5 space-y-6" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          {jobLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-brand-500 animate-spin" /></div>
          ) : showCompanyProfile ? (
            /* ── Company Profile View ────────────────────────────── */
            <div className="space-y-5 animate-fade-in">
              <button
                onClick={() => setShowCompanyProfile(false)}
                className="text-sm font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                ← Back to Job Details
              </button>

              {companyLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 text-brand-500 animate-spin" /></div>
              ) : company ? (
                <div className="space-y-5">
                  {/* Company header */}
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-lg bg-brand-50 flex items-center justify-center border border-brand-100 overflow-hidden">
                      {company.logoURL ? (
                        <img src={company.logoURL} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-8 w-8 text-brand-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-brand-900">{company.companyName || j.companyName}</h3>
                      <p className="text-sm text-brand-500">{company.industry || 'Industry not specified'}</p>
                    </div>
                  </div>

                  {/* Company details */}
                  {company.description && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-700 mb-2">About</h4>
                      <p className="text-sm text-brand-600 leading-relaxed whitespace-pre-wrap">{company.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {company.headquarters && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-brand-400" />
                        <span className="text-brand-600">{company.headquarters}</span>
                      </div>
                    )}
                    {company.companySize && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-brand-400" />
                        <span className="text-brand-600">{company.companySize} employees</span>
                      </div>
                    )}
                    {company.ceo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Crown className="h-4 w-4 text-brand-400" />
                        <span className="text-brand-600">CEO: {company.ceo}</span>
                      </div>
                    )}
                    {company.foundedYear && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-brand-400" />
                        <span className="text-brand-600">Founded {company.foundedYear}</span>
                      </div>
                    )}
                    {company.website && (
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="h-4 w-4 text-brand-400" />
                        <a href={company.website} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate">
                          {company.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    {company.linkedin && (
                      <div className="flex items-center gap-2 text-sm">
                        <Linkedin className="h-4 w-4 text-brand-400" />
                        <a href={company.linkedin} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate">
                          LinkedIn Profile
                        </a>
                      </div>
                    )}
                    {company.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-brand-400" />
                        <span className="text-brand-600">{company.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Company DNA */}
                  <CompanyDNAPanel
                    data={companyDna}
                    companyName={company.companyName || j.companyName}
                    isLoading={dnaLoading}
                  />

                  {company.technologies?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-700 mb-2 flex items-center gap-1.5"><Cpu className="h-4 w-4" /> Tech Stack</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {company.technologies.map((t, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-md bg-brand-100 text-brand-600 text-xs font-medium border border-brand-200">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {company.benefits?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-700 mb-2 flex items-center gap-1.5"><Heart className="h-4 w-4" /> Benefits</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {company.benefits.map((b, i) => (
                          <span key={i} className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">{b}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {company.companyCulture && (
                    <div>
                      <h4 className="text-sm font-semibold text-brand-700 mb-2">Company Culture</h4>
                      <p className="text-sm text-brand-600 leading-relaxed whitespace-pre-wrap">{company.companyCulture}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-brand-500 text-center py-8">Company profile not available.</p>
              )}
            </div>
          ) : (
            /* ── Job Details View ────────────────────────────────── */
            <div className="space-y-5 animate-fade-in">
              {/* Qualification & Match Score Card */}
              {(() => {
                const matchInfo = computeJobMatch(j, studentProfile);
                if (!matchInfo || matchInfo.score === 0) return null;
                return (
                  <div className={`p-4 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    matchInfo.matchColor === 'emerald' ? 'bg-emerald-50/70 border-emerald-200' :
                    matchInfo.matchColor === 'indigo' ? 'bg-brand-50/70 border-brand-200' :
                    matchInfo.matchColor === 'amber' ? 'bg-amber-50/70 border-amber-200' : 'bg-brand-50 border-brand-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-12 w-12 rounded-lg flex items-center justify-center font-extrabold text-base border shadow-sm ${
                        matchInfo.matchColor === 'emerald' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        matchInfo.matchColor === 'indigo' ? 'bg-brand-100 text-brand-800 border-brand-300' :
                        matchInfo.matchColor === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-brand-200 text-brand-700 border-brand-300'
                      }`}>
                        {matchInfo.score}%
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-brand-900 text-sm flex items-center gap-1">
                            <Sparkles className="h-4 w-4 text-brand-600" />
                            Qualification Match
                          </h4>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                            matchInfo.matchColor === 'emerald' ? 'bg-emerald-200/80 text-emerald-900' :
                            matchInfo.matchColor === 'indigo' ? 'bg-brand-200/80 text-brand-900' :
                            matchInfo.matchColor === 'amber' ? 'bg-amber-200/80 text-amber-900' : 'bg-brand-200 text-brand-700'
                          }`}>
                            {matchInfo.matchLabel}
                          </span>
                        </div>
                        <p className="text-xs text-brand-600 mt-0.5">
                          {matchInfo.matchedSkills.length > 0
                            ? `You meet ${matchInfo.matchedSkills.length} out of ${j.requiredSkills?.length || 0} required skills.`
                            : 'Based on your profile skills & resume qualifications.'}
                        </p>
                      </div>
                    </div>

                    {/* Skills match chips */}
                    {(matchInfo.matchedSkills.length > 0 || matchInfo.missingSkills.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                        {matchInfo.matchedSkills.map((s, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 text-[11px] font-semibold flex items-center gap-1 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {s}
                          </span>
                        ))}
                        {matchInfo.missingSkills.map((s, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 text-[11px] font-semibold flex items-center gap-1 border border-amber-200">
                            <AlertCircle className="h-3 w-3 text-amber-600" /> {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {loc && (
                  <div className="bg-brand-50 rounded-lg p-3 text-center border border-brand-100">
                    <MapPin className="h-4 w-4 text-brand-400 mx-auto mb-1" />
                    <p className="text-xs text-brand-500">Location</p>
                    <p className="text-sm font-semibold text-brand-800 truncate">{loc}</p>
                  </div>
                )}
                {salaryText && (
                  <div className="bg-brand-50 rounded-lg p-3 text-center border border-brand-100">
                    <DollarSign className="h-4 w-4 text-brand-400 mx-auto mb-1" />
                    <p className="text-xs text-brand-500">Salary</p>
                    <p className="text-sm font-semibold text-brand-800 truncate">{salaryText}</p>
                  </div>
                )}
                {j.openings && (
                  <div className="bg-brand-50 rounded-lg p-3 text-center border border-brand-100">
                    <Users className="h-4 w-4 text-brand-400 mx-auto mb-1" />
                    <p className="text-xs text-brand-500">Openings</p>
                    <p className="text-sm font-semibold text-brand-800">{j.openings}</p>
                  </div>
                )}
                {j.deadline && (
                  <div className="bg-brand-50 rounded-lg p-3 text-center border border-brand-100">
                    <Calendar className="h-4 w-4 text-brand-400 mx-auto mb-1" />
                    <p className="text-xs text-brand-500">Deadline</p>
                    <p className="text-sm font-semibold text-brand-800">{new Date(j.deadline).toLocaleDateString()}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              {j.description && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-900 mb-2">About This Role</h4>
                  <p className="text-sm text-brand-600 leading-relaxed whitespace-pre-wrap">{j.description}</p>
                </div>
              )}

              {/* Responsibilities */}
              {j.responsibilities && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-900 mb-2">Responsibilities</h4>
                  <div className="text-sm text-brand-600 leading-relaxed whitespace-pre-wrap">{j.responsibilities}</div>
                </div>
              )}

              {/* Requirements */}
              {j.requirements?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-900 mb-2">Requirements</h4>
                  <ul className="space-y-1.5">
                    {j.requirements.map((req, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-brand-600">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Required Skills */}
              {j.requiredSkills?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-900 mb-2">Required Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {j.requiredSkills.map((skill, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold border border-brand-100">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Education */}
              {j.educationRequirement && (
                <div className="flex items-start gap-2">
                  <GraduationCap className="h-4 w-4 text-brand-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-semibold text-brand-900">Education</h4>
                    <p className="text-sm text-brand-600">{j.educationRequirement}</p>
                  </div>
                </div>
              )}

              {/* Benefits */}
              {j.benefits?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-brand-900 mb-2">Benefits</h4>
                  <div className="flex flex-wrap gap-2">
                    {j.benefits.map((b, i) => (
                      <span key={i} className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stipend for internships */}
              {j.stipend?.amount && (
                <div className="flex items-center gap-2 text-sm p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-amber-800">Monthly Stipend: ₹{j.stipend.amount.toLocaleString()}</span>
                </div>
              )}

              {/* View Company Profile link */}
              {j.employerId && (
                <button
                  onClick={() => setShowCompanyProfile(true)}
                  className="w-full flex items-center justify-between p-4 rounded-lg bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center border border-brand-100">
                      {j.companyLogoURL ? (
                        <img src={j.companyLogoURL} alt="" className="h-full w-full object-cover rounded-lg" />
                      ) : (
                        <Building2 className="h-5 w-5 text-brand-600" />
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-brand-900">{j.companyName}</p>
                      <p className="text-xs text-brand-500">View full company profile</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-brand-400 group-hover:text-brand-600 transition-colors" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showCompanyProfile && (
          <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-brand-100 px-6 py-4 flex items-center justify-between gap-3">
            <div className="text-xs text-brand-400">
              {j.createdAt && <>Posted{' '}{timeAgo(j.createdAt)}</>}
              {j.applicationCount != null && <>{' \u2022 '}{j.applicationCount} applicant{j.applicationCount !== 1 ? 's' : ''}</>}
            </div>
            {j.status === 'active' && (
              isApplied ? (
                <span className="badge-green px-4 py-2 flex items-center gap-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Applied
                </span>
              ) : (
                <button
                  onClick={() => onApply(j.jobId || j.id)}
                  disabled={isApplying}
                  className="btn-primary px-6"
                >
                  {isApplying ? 'Applying...' : 'Apply Now'}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── Job Card (click to open dialog) ───────────────────────────── */
function InternalJobCard({ job, studentProfile, onClick }) {
  const loc = typeof job.location === 'object'
    ? [job.location?.city, job.location?.country].filter(Boolean).join(', ')
    : (job.location || 'Remote');
    
  const salaryText = job.salary?.min
    ? formatSalary(job.salary.min, job.salary.max, job.salary.currency)
    : (job.salaryMin ? formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency) : null);

  const isApplied = job.hasApplied || false;
  const matchInfo = computeJobMatch(job, studentProfile);
  
  // A job is expired if it has a deadline and the deadline is in the past
  const isExpired = job.deadline && new Date(job.deadline).getTime() < Date.now();

  return (
    <div
      className={`card p-5 animate-slide-up transition-all duration-200 group relative overflow-hidden ${isExpired ? 'opacity-60 grayscale cursor-not-allowed' : 'cursor-pointer hover:shadow-lg hover:border-brand-200'}`}
      onClick={isExpired ? undefined : onClick}
    >
      {isExpired && (
        <div className="absolute bottom-0 right-0 bg-red-500/10 backdrop-blur-md border-t border-l border-red-500/20 px-4 py-1.5 rounded-tl-2xl text-xs font-bold text-red-600 shadow-sm z-10 flex items-center gap-1.5 ring-1 ring-red-500/30">
          <Clock className="h-3.5 w-3.5" /> Expired
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start justify-between">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={`h-12 w-12 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 border border-brand-100 transition-transform ${!isExpired ? 'group-hover:scale-105' : ''}`}>
            {job.companyLogoURL ? (
              <img src={job.companyLogoURL} alt="" className="h-full w-full object-cover rounded-lg" />
            ) : (
              <Building2 className="h-6 w-6 text-brand-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className={`font-bold text-lg truncate transition-colors ${isExpired ? 'text-brand-800' : 'text-brand-900 group-hover:text-brand-700'}`}>{job.title}</h3>
              {job.status && <span className={`badge ${STATUS_COLORS[job.status] || 'badge-default'}`}>{job.status}</span>}
              {job.verifiedByAdmin && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" /> Verified
                </span>
              )}
              
              {/* Match Score Badge */}
              {matchInfo.score > 0 && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 border transition-all ${
                  matchInfo.matchColor === 'emerald'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : matchInfo.matchColor === 'indigo'
                    ? 'bg-brand-50 text-brand-700 border-brand-200'
                    : matchInfo.matchColor === 'amber'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-brand-100 text-brand-600 border-brand-200'
                }`}>
                  <Sparkles className="h-3 w-3 text-brand-600" />
                  {matchInfo.score}% Match
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-brand-600">{job.companyName}</p>

            <div className="flex flex-wrap items-center gap-3 mt-3">
              {loc && (
                <span className="flex items-center gap-1 text-xs text-brand-500">
                  <MapPin className="h-3.5 w-3.5" />{loc}
                </span>
              )}
              {job.jobType && (
                <span className="flex items-center gap-1 text-xs text-brand-500">
                  <Briefcase className="h-3.5 w-3.5" />{job.jobType}
                </span>
              )}
              {salaryText && (
                <span className="flex items-center gap-1 text-xs text-brand-500">
                  <DollarSign className="h-3.5 w-3.5" />{salaryText}
                </span>
              )}
              {job.createdAt && (
                <span className="flex items-center gap-1 text-xs text-brand-400">
                  <Clock className="h-3.5 w-3.5" />{timeAgo(job.createdAt)}
                </span>
              )}
            </div>

            {job.description && (
              <p className="mt-3 text-sm text-brand-600 line-clamp-2">{job.description}</p>
            )}

            {job.requiredSkills?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {job.requiredSkills.slice(0, 5).map((s, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-brand-50 text-brand-700 text-[11px] font-medium border border-brand-100">{s}</span>
                ))}
                {job.requiredSkills.length > 5 && (
                  <span className="px-2 py-0.5 rounded-md bg-brand-100 text-brand-500 text-[11px] font-medium">+{job.requiredSkills.length - 5} more</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-3 flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
          {isApplied ? (
            <span className="badge-green px-3 py-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" /> Applied
            </span>
          ) : (
            <span className="text-xs font-semibold text-brand-600 flex items-center gap-1 group-hover:underline">
              View Details <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InternalJobsTab() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState({ limit: 50, cursor: null });
  const [selectedJob, setSelectedJob] = useState(null);

  const { data: studentProfile } = useQuery({
    queryKey: ['studentProfile', 'me'],
    queryFn: () => studentService.getMe(),
    retry: false,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['jobs', debouncedSearch, typeFilter, page],
    queryFn: () => jobService.list({ q: debouncedSearch || undefined, jobType: typeFilter || undefined, ...page }),
  });

  const rawJobs = data?.items ?? [];
  const nextCursor = data?.nextCursor;

  // Sort jobs in descending order based on match percentage score
  const jobs = useMemo(() => {
    if (!rawJobs || rawJobs.length === 0) return [];
    if (!studentProfile) return rawJobs;
    
    const sorted = [...rawJobs]
      .map(job => ({ job, score: computeJobMatch(job, studentProfile).score }))
      .sort((a, b) => b.score - a.score)
      .map(item => item.job);

    return sorted;
  }, [rawJobs, studentProfile]);

  const applyMutation = useMutation({
    mutationFn: (jobId) => applicationService.apply(jobId),
    onSuccess: () => {
      toast.success(t('studentJobs.applicationSuccess'));
      setSelectedJob(null);
      refetch();
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || t('studentJobs.applicationFailed')),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t('studentJobs.title')}</h1>
        <p className="text-brand-500 mt-1">{t('studentJobs.subtitle')}</p>
      </div>

      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
          <input
            type="text"
            placeholder={t('studentJobs.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refetch()}
            className="input pl-9"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="input w-full sm:w-48"
        >
          <option value="">All Job Types</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="internship">Internship</option>
          <option value="contract">Contract</option>
        </select>
        <button onClick={() => refetch()} className="btn-primary">
          Filter
        </button>
      </div>

      {isLoading ? (
        <SkeletonList count={3} />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="search"
          title="No internal jobs found"
          description="Try adjusting your filters, or check out our external Job Search."
          action={{ label: 'Go to External Jobs', onClick: () => window.location.href = '/job-search' }}
        />
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <InternalJobCard
              key={job.jobId || job.id}
              job={job}
              studentProfile={studentProfile}
              onClick={() => setSelectedJob(job)}
            />
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setPage((p) => ({ ...p, cursor: nextCursor }))}
            disabled={isFetching}
            className="btn-secondary"
          >
            {isFetching ? 'Loading...' : 'Load More Jobs'}
          </button>
        </div>
      )}

      {/* Job Detail Dialog */}
      {selectedJob && (
        <JobDetailDialog
          job={selectedJob}
          studentProfile={studentProfile}
          onClose={() => setSelectedJob(null)}
          onApply={(id) => applyMutation.mutate(id)}
          isApplying={applyMutation.isPending}
        />
      )}
    </div>
  );
}

/* ── External Jobs Tab ──────────────────────────────────────── */
function ExternalJobCard({ job }) {
  return (
    <div className="card-hover p-5 animate-slide-up">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={job.link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-900 hover:text-brand-700 transition-colors text-sm leading-tight line-clamp-2 flex items-start gap-1 group"
          >
            {job.title}
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
          </a>
          {job.company && <p className="text-xs text-brand-500 mt-0.5">{job.company}</p>}

          <div className="flex flex-wrap items-center gap-3 mt-2">
            {job.location && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <MapPin className="h-3 w-3" />{job.location}
              </span>
            )}
            {job.type && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <Briefcase className="h-3 w-3" />{job.type}
              </span>
            )}
            {job.salary && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <DollarSign className="h-3 w-3" />{job.salary}
              </span>
            )}
            {job.updated && (
              <span className="flex items-center gap-1 text-xs text-brand-400">
                <Clock className="h-3 w-3" />{new Date(job.updated).toLocaleDateString()}
              </span>
            )}
          </div>

          {job.snippet && (
            <p className="text-xs text-brand-500 mt-2 line-clamp-2 leading-relaxed"
               dangerouslySetInnerHTML={{ __html: job.snippet }} />
          )}
        </div>

        <a
          href={job.link}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary btn-sm flex items-center gap-1 flex-shrink-0"
        >
          Apply <ChevronRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function ExternalJobsTab() {
  const { t } = useLanguage();
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);

  const searchMutation = useMutation({
    mutationFn: ({ keywords, location, page }) => joobleService.search({ keywords, location, page }),
    onSuccess: (data) => setResults(data),
    onError: (err) => toast.error(err.response?.data?.error?.message || t('jobSearch.searchFailed')),
  });

  const handleSearch = (p = 1) => {
    if (!keywords.trim()) { toast.error(t('jobSearch.enterKeyword')); return; }
    setPage(p);
    setLastQuery({ keywords, location });
    searchMutation.mutate({ keywords, location, page: p });
  };

  const POPULAR = ['Software Engineer', 'Data Scientist', 'Product Manager', 'UI/UX Designer', 'DevOps Engineer', 'Machine Learning'];

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              className="input pl-9"
              placeholder={t('jobSearch.searchPlaceholder')}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <div className="relative w-48">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              className="input pl-9"
              placeholder={t('jobSearch.locationPlaceholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <button
            onClick={() => handleSearch(1)}
            disabled={searchMutation.isPending}
            className="btn-primary px-6 flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">{t('jobSearch.search')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-brand-400">{t('jobSearch.popular')}</span>
          {POPULAR.map((p) => (
            <button
              key={p}
              onClick={() => { setKeywords(p); }}
              className="text-xs px-2.5 py-1 rounded-full bg-brand-100 text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {searchMutation.isPending && <SkeletonList count={5} />}

      {!searchMutation.isPending && results && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-500">
              {results.totalCount > 0
                ? `Found ~${results.totalCount.toLocaleString()} jobs for "${lastQuery?.keywords}"`
                : 'No jobs found'}
            </p>
            <span className="badge-default">Page {page}</span>
          </div>

          {results.jobs?.length === 0
            ? <EmptyState icon="search" title="No jobs found" description="Try different keywords" />
            : (
              <div className="space-y-3">
                {results.jobs.map((job, i) => <ExternalJobCard key={job.id || i} job={job} />)}
              </div>
            )
          }

          {results.jobs?.length > 0 && (
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => handleSearch(page - 1)}
                disabled={page <= 1 || searchMutation.isPending}
                className="btn-secondary btn-sm"
              >
                Previous
              </button>
              <button
                onClick={() => handleSearch(page + 1)}
                disabled={searchMutation.isPending || results.jobs.length < 20}
                className="btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {!searchMutation.isPending && !results && (
        <EmptyState
          icon="search"
          title={t('jobSearch.searchTitle')}
          description={t('jobSearch.searchDesc')}
        />
      )}
    </div>
  );
}

/* ── Main Jobs Page with Tabs ───────────────────────────────── */
export default function JobsPage() {
  const [activeTab, setActiveTab] = useState('internal');

  return (
    <div className="space-y-6">
      {/* Header + tabs — frosted glass card */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-5 shadow-sm ring-1 ring-white/40">
        <div>
          <h1 className="text-2xl font-bold text-brand-900">Jobs</h1>
          <p className="text-brand-500 mt-1">Browse campus postings and external opportunities</p>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 border-b border-brand-200/50 mt-4">
          <button
            onClick={() => setActiveTab('internal')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative ${
              activeTab === 'internal'
                ? 'text-brand-700'
                : 'text-brand-500 hover:text-brand-700'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            Internal Jobs
            {activeTab === 'internal' && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('external')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative ${
              activeTab === 'external'
                ? 'text-brand-700'
                : 'text-brand-500 hover:text-brand-700'
            }`}
          >
            <Globe className="h-4 w-4" />
            External Jobs
            {activeTab === 'external' && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-brand-600 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content — frosted glass card */}
      <div className="bg-white/50 backdrop-blur-md rounded-2xl p-5 shadow-sm ring-1 ring-white/30">
        {activeTab === 'internal' ? <InternalJobsTab /> : <ExternalJobsTab />}
      </div>
    </div>
  );
}