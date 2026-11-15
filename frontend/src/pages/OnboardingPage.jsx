import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage, LANGUAGES } from '../contexts/LanguageContext.jsx';
import { authService } from '../services/auth.service.js';
import toast from 'react-hot-toast';
import {
  GraduationCap, Briefcase, ChevronRight, ArrowLeft,
  User, Building2, Globe, Phone, MapPin, Code2, Linkedin, Github,
} from 'lucide-react';

// ── Field wrapper ─────────────────────────────────────────────
function Field({ label, hint, children, t }) {
  return (
    <div>
      <label className="label">
        {label}
        <span className="ml-1 text-brand-400 text-xs font-normal">{t('onboarding.optional')}</span>
      </label>
      {children}
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}

function Grid2({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Language card ─────────────────────────────────────────────
function LanguageCard({ lang, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(lang.code)}
      className={`w-full text-left p-5 rounded-lg border-2 transition-all duration-150 group ${
        selected
          ? 'border-brand-500 bg-brand-50 shadow-sm'
          : 'border-brand-200 bg-white hover:border-brand-300 hover:bg-brand-50'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0 text-2xl transition-colors ${
          selected ? 'bg-brand-100' : 'bg-brand-100 group-hover:bg-brand-200'
        }`}>
          {lang.flag}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${selected ? 'text-brand-700' : 'text-brand-800'}`}>
            {lang.nativeName}
          </p>
          <p className="text-xs text-brand-500 mt-0.5">{lang.name}</p>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors ${
          selected ? 'border-brand-500 bg-brand-500' : 'border-brand-300'
        }`}>
          {selected && (
            <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Role card ─────────────────────────────────────────────────
function RoleCard({ role, selected, onClick, icon: Icon, title, description }) {
  return (
    <button
      type="button"
      onClick={() => onClick(role)}
      className={`w-full text-left p-5 rounded-lg border-2 transition-all duration-150 group ${
        selected
          ? 'border-brand-500 bg-brand-50 shadow-sm'
          : 'border-brand-200 bg-white hover:border-brand-300 hover:bg-brand-50'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
          selected ? 'bg-brand-100' : 'bg-brand-100 group-hover:bg-brand-200'
        }`}>
          <Icon className={`h-5 w-5 ${selected ? 'text-brand-600' : 'text-brand-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${selected ? 'text-brand-700' : 'text-brand-800'}`}>
            {title}
          </p>
          <p className="text-xs text-brand-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <div className={`h-5 w-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors ${
          selected ? 'border-brand-500 bg-brand-500' : 'border-brand-300'
        }`}>
          {selected && (
            <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

export default function OnboardingPage() {
  const { firebaseUser, refreshSession } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const navigate = useNavigate();

  // step: 'language' | 'role' | 'profile'
  const [step, setStep] = useState('language');
  const [selectedLang, setSelectedLang] = useState(language);
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // ── Student form state ─────────────────────────────────────
  const [studentForm, setStudentForm] = useState({
    name: '',
    phone: '',
    college: '',
    degree: '',
    branch: '',
    graduationYear: '',
    cgpa: '',
    skills: '',
    linkedin: '',
    github: '',
    portfolio: '',
    city: '',
  });

  // ── Employer form state ────────────────────────────────────
  const [employerForm, setEmployerForm] = useState({
    companyName: '',
    website: '',
    description: '',
    industry: '',
    companySize: '',
    city: '',
  });

  const handleStudentChange = (e) =>
    setStudentForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleEmployerChange = (e) =>
    setEmployerForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  // ── Build nested payload from flat form state ──────────────
  const buildStudentProfile = () => {
    const skills = studentForm.skills
      ? studentForm.skills.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    return {
      personal: {
        ...(studentForm.name  && { name:  studentForm.name }),
        ...(studentForm.phone && { phone: studentForm.phone }),
        ...(studentForm.city  && { city:  studentForm.city }),
      },
      academic: {
        ...(studentForm.college        && { college:        studentForm.college }),
        ...(studentForm.degree         && { degree:         studentForm.degree }),
        ...(studentForm.branch         && { branch:         studentForm.branch }),
        ...(studentForm.graduationYear && { graduationYear: Number(studentForm.graduationYear) }),
        ...(studentForm.cgpa           && { cgpa:           parseFloat(studentForm.cgpa) }),
      },
      professional: {
        ...(skills.length && { skills }),
      },
      social: {
        ...(studentForm.linkedin  && { linkedin:  studentForm.linkedin }),
        ...(studentForm.github    && { github:    studentForm.github }),
        ...(studentForm.portfolio && { portfolio: studentForm.portfolio }),
      },
    };
  };

  const buildEmployerProfile = () => ({
    ...(employerForm.companyName && { companyName: employerForm.companyName }),
    ...(employerForm.website     && { website:     employerForm.website }),
    ...(employerForm.description && { description: employerForm.description }),
    ...(employerForm.industry    && { industry:    employerForm.industry }),
    ...(employerForm.companySize && { companySize: employerForm.companySize }),
    location: {
      ...(employerForm.city && { city: employerForm.city }),
    },
  });

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!role) {
      toast.error(t('onboarding.selectRole'));
      return;
    }
    setSubmitting(true);
    try {
      const profile = role === 'student' ? buildStudentProfile() : buildEmployerProfile();
      await authService.onboard({ role, profile });
      await refreshSession();
      toast.success(t('onboarding.profileCreated'));
      navigate(role === 'student' ? '/dashboard' : '/employer/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || t('onboarding.onboardingFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // Skip — submit with just the role and empty profile
  const handleSkip = async () => {
    if (!role) return;
    setSubmitting(true);
    try {
      await authService.onboard({ role, profile: {} });
      await refreshSession();
      toast.success(t('onboarding.profileCreatedSkip'));
      navigate(role === 'student' ? '/dashboard' : '/employer/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error?.message || err.message || t('onboarding.onboardingFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!firebaseUser) return null;

  // ── Step 0: Language selection ─────────────────────────────
  if (step === 'language') {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="card p-8 w-full max-w-md animate-fade-in">
          <div className="mb-6 text-center">
            <div className="h-14 w-14 rounded-lg bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Globe className="h-7 w-7 text-brand-600" />
            </div>
            <h1 className="text-2xl font-bold text-brand-900">{t('lang.selectTitle')}</h1>
            <p className="text-brand-500 mt-1 text-sm">
              {t('lang.selectSubtitle')}
            </p>
          </div>

          <div className="space-y-3">
            {LANGUAGES.map((lang) => (
              <LanguageCard
                key={lang.code}
                lang={lang}
                selected={selectedLang === lang.code}
                onClick={(code) => {
                  setSelectedLang(code);
                  setLanguage(code);
                }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setStep('role')}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            {t('lang.continue')}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step 1: Role selection ─────────────────────────────────
  if (step === 'role') {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="card p-8 w-full max-w-md animate-fade-in">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-brand-900">{t('onboarding.welcome')}</h1>
            <p className="text-brand-500 mt-1 text-sm">
              {t('onboarding.rolePrompt')}
            </p>
          </div>

          <div className="space-y-3">
            <RoleCard
              role="student"
              selected={role === 'student'}
              onClick={setRole}
              icon={GraduationCap}
              title={t('onboarding.student')}
              description={t('onboarding.studentDesc')}
            />
            <RoleCard
              role="employer"
              selected={role === 'employer'}
              onClick={setRole}
              icon={Briefcase}
              title={t('onboarding.employer')}
              description={t('onboarding.employerDesc')}
            />
          </div>

          <button
            type="button"
            disabled={!role || submitting}
            onClick={() => setStep('profile')}
            className="btn-primary w-full mt-6 flex items-center justify-center gap-2"
          >
            {t('onboarding.continue')}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Profile details ────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4 py-8">
      <div className="card p-8 w-full max-w-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => setStep('role')}
            className="btn-ghost btn-sm p-1.5"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-brand-900">
              {role === 'student' ? t('onboarding.yourProfile') : t('onboarding.companyDetails')}
            </h1>
            <p className="text-xs text-brand-500 mt-0.5">
              {t('onboarding.allOptional')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Student fields ──────────────────────────── */}
          {role === 'student' && (
            <>
              <div className="flex items-center gap-2 pb-1 border-b border-brand-100">
                <User className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">{t('onboarding.personal')}</span>
              </div>
              <Grid2>
                <Field label={t('onboarding.fullName')} t={t}>
                  <input name="name" type="text" placeholder="Asha Kumar"
                    value={studentForm.name} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.phoneLabel')} t={t}>
                  <input name="phone" type="tel" placeholder="+91 98765 43210"
                    value={studentForm.phone} onChange={handleStudentChange} className="input" />
                </Field>
              </Grid2>

              <div className="flex items-center gap-2 pb-1 border-b border-brand-100 mt-2">
                <GraduationCap className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">{t('onboarding.academic')}</span>
              </div>
              <Grid2>
                <Field label={t('onboarding.college')} t={t}>
                  <input name="college" type="text" placeholder="IIT Madras"
                    value={studentForm.college} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.degree')} t={t}>
                  <input name="degree" type="text" placeholder="B.Tech"
                    value={studentForm.degree} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.branch')} t={t}>
                  <input name="branch" type="text" placeholder="Computer Science"
                    value={studentForm.branch} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.graduationYear')} t={t}>
                  <input name="graduationYear" type="number" placeholder="2026"
                    min={2000} max={2035}
                    value={studentForm.graduationYear} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.cgpa')} hint={t('onboarding.cgpaHint')} t={t}>
                  <input name="cgpa" type="number" step="0.01" min={0} max={10}
                    placeholder="8.5"
                    value={studentForm.cgpa} onChange={handleStudentChange} className="input" />
                </Field>
                <Field label={t('onboarding.city')} t={t}>
                  <input name="city" type="text" placeholder="Bangalore"
                    value={studentForm.city} onChange={handleStudentChange} className="input" />
                </Field>
              </Grid2>

              <div className="flex items-center gap-2 pb-1 border-b border-brand-100 mt-2">
                <Code2 className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">{t('onboarding.skillsAndLinks')}</span>
              </div>
              <Field label={t('onboarding.skills')} hint={t('onboarding.skillsHint')} t={t}>
                <input name="skills" type="text" placeholder="React, Node.js, Python"
                  value={studentForm.skills} onChange={handleStudentChange} className="input" />
              </Field>
              <Grid2>
                <Field label={t('onboarding.linkedin')} t={t}>
                  <div className="relative">
                    <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
                    <input name="linkedin" type="url" placeholder="https://linkedin.com/in/..."
                      value={studentForm.linkedin} onChange={handleStudentChange}
                      className="input pl-9" />
                  </div>
                </Field>
                <Field label={t('onboarding.github')} t={t}>
                  <div className="relative">
                    <Github className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
                    <input name="github" type="url" placeholder="https://github.com/..."
                      value={studentForm.github} onChange={handleStudentChange}
                      className="input pl-9" />
                  </div>
                </Field>
                <Field label={t('onboarding.portfolio')} t={t}>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
                    <input name="portfolio" type="url" placeholder="https://mysite.dev"
                      value={studentForm.portfolio} onChange={handleStudentChange}
                      className="input pl-9" />
                  </div>
                </Field>
              </Grid2>
            </>
          )}

          {/* ── Employer fields ─────────────────────────── */}
          {role === 'employer' && (
            <>
              <div className="flex items-center gap-2 pb-1 border-b border-brand-100">
                <Building2 className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">{t('onboarding.company')}</span>
              </div>
              <Grid2>
                <Field label={t('onboarding.companyName')} t={t}>
                  <input name="companyName" type="text" placeholder="Acme Inc."
                    value={employerForm.companyName} onChange={handleEmployerChange} className="input" />
                </Field>
                <Field label={t('onboarding.industry')} t={t}>
                  <input name="industry" type="text" placeholder="Technology"
                    value={employerForm.industry} onChange={handleEmployerChange} className="input" />
                </Field>
                <Field label={t('onboarding.companySize')} t={t}>
                  <input name="companySize" type="text" placeholder="50–200"
                    value={employerForm.companySize} onChange={handleEmployerChange} className="input" />
                </Field>
                <Field label={t('onboarding.website')} t={t}>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
                    <input name="website" type="url" placeholder="https://acme.com"
                      value={employerForm.website} onChange={handleEmployerChange}
                      className="input pl-9" />
                  </div>
                </Field>
                <Field label={t('onboarding.city')} t={t}>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-brand-400" />
                    <input name="city" type="text" placeholder="Bangalore"
                      value={employerForm.city} onChange={handleEmployerChange}
                      className="input pl-9" />
                  </div>
                </Field>
              </Grid2>
              <Field label={t('onboarding.companyDescription')} t={t}>
                <textarea
                  name="description"
                  rows={3}
                  placeholder={t('onboarding.companyDescPlaceholder')}
                  value={employerForm.description}
                  onChange={handleEmployerChange}
                  className="textarea"
                />
              </Field>
            </>
          )}

          {/* ── Actions ─────────────────────────────────── */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="btn-secondary flex-1"
            >
              {t('onboarding.skipForNow')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary flex-1"
            >
              {submitting ? t('onboarding.creating') : t('onboarding.completeSetup')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}