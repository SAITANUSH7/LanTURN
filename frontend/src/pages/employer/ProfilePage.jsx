import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employerService } from '../../services/employer.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { uploadService } from '../../services/upload.service.js';
import { CompanyDNAPanel } from '../../components/ai/CompanyDNAPanel.jsx';
import toast from 'react-hot-toast';
import {
  Building2, Globe, Users, MapPin, Phone, Mail,
  FileText, Save, Briefcase, Crown, Calendar,
  Heart, Cpu, Sparkles, Plus, X, Camera, ShieldCheck,
  Pencil, Loader2, Link2, Star
} from 'lucide-react';

// ── Inline SVG brand icons ────────────────────────────────────
function LinkedInIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

// ── Section wrapper ───────────────────────────────────────────
function Section({ icon: Icon, title, children }) {
  return (
    <div className="card p-6 space-y-4 animate-slide-up">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
          <Icon className="h-4 w-4 text-brand-600" />
        </div>
        <h2 className="section-title">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Form field ────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}

// ── 2-col grid ────────────────────────────────────────────────
function Grid2({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

// ── Detail row for the read-only view ─────────────────────────
function DetailRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5 text-sm py-1">
      <Icon className="h-3.5 w-3.5 text-brand-400 flex-shrink-0" />
      <span className="text-brand-500 min-w-[80px]">{label}</span>
      <span className="font-medium text-brand-800 truncate">{value}</span>
    </div>
  );
}

// ── Tags Input ─────────────────────────────────────────────────
function TagsInput({ value = [], onChange, placeholder = 'Add item...' }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const val = input.trim();
    if (!val || value.includes(val) || value.length >= 50) return;
    onChange([...value, val]);
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {value.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-brand-200 shadow-sm text-brand-700 text-sm font-medium px-3 py-1.5 hover:border-brand-300 hover:bg-brand-50 transition-colors animate-scale-in">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} className="text-brand-400 hover:text-red-500 transition-colors focus:outline-none">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input flex-1 bg-brand-50 border-brand-200 focus:bg-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={placeholder}
        />
        <button type="button" onClick={addTag} className="btn-secondary whitespace-nowrap bg-white hover:bg-brand-50">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
    </div>
  );
}

export default function EmployerProfilePage() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploadPct, setUploadPct] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['employer', 'me'],
    queryFn: employerService.getMe,
  });

  const p = profile ?? {};
  const [companyDetails, setCompanyDetails] = useState(null);
  const [leadershipContact, setLeadershipContact] = useState(null);
  const [cultureAchievements, setCultureAchievements] = useState(null);

  const getCompanyDetails = () => companyDetails ?? {
    companyName: p.companyName || '',
    industry: p.industry || '',
    companySize: p.companySize || '',
    employeeCount: p.employeeCount || '',
    website: p.website || ''
  };

  const getLeadershipContact = () => leadershipContact ?? {
    ceo: p.ceo || '',
    foundedYear: p.foundedYear || '',
    headquarters: p.headquarters || '',
    email: p.email || '',
    phone: p.phone || '',
    hrContact: p.hrContact || { name: '', email: '', phone: '' }
  };

  const getCultureAchievements = () => cultureAchievements ?? {
    description: p.description || '',
    companyCulture: p.companyCulture || '',
    benefits: p.benefits || [],
    technologies: p.technologies || [],
    linkedin: p.linkedin || '',
    achievements: p.achievements || []
  };

  const saveMutation = useMutation({
    mutationFn: (body) => employerService.updateMe(body),
    onSuccess: () => {
      toast.success('Profile saved!');
      qc.invalidateQueries({ queryKey: ['employer', 'me'] });
      setIsEditing(false);
    },
    onError: (err) => {
      const details = err.response?.data?.error?.details || err.details;
      if (details?.length) {
        toast.error(`Validation: ${details.map((d) => d.message).join(', ')}`);
      } else {
        toast.error(err.response?.data?.error?.message || err.message || 'Save failed');
      }
    },
  });

  const handleSaveAll = () => {
    saveMutation.mutate({
      ...getCompanyDetails(),
      ...getLeadershipContact(),
      ...getCultureAchievements()
    });
  };

  // ── Photo upload ──────────────────────────────────────────
  const handlePhotoChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Photo must be under 2 MB');
      return;
    }
    try {
      setUploadPct(0);
      // In a real app, you would use uploadService to get a URL, then update the backend.
      // For this implementation, we will assume uploadService.uploadFile returns the URL 
      // or that we can patch the logoURL right after.
      const result = await uploadService.uploadFile(file, 'companyLogo', setUploadPct);
      // Wait, let's just trigger a re-fetch since the user's logo URL should be updated by the upload service
      toast.success('Company Logo updated!');
      qc.invalidateQueries({ queryKey: ['employer', 'me'] });
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadPct(null);
    }
  }, [qc]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-12">
        <div className="h-48 rounded-lg bg-brand-200 animate-pulse" />
        <div className="h-64 rounded-lg bg-brand-200 animate-pulse" />
      </div>
    );
  }

  const cd = getCompanyDetails();
  const lc = getLeadershipContact();
  const ca = getCultureAchievements();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-fade-in">
      
      {/* ── Top Header / Edit Toggle ───────────────────────────── */}
      <div className="flex items-center justify-between px-2">
        <h1 className="text-2xl font-bold text-brand-900 tracking-tight">Company Profile</h1>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`btn ${isEditing ? 'bg-brand-100 text-brand-700 hover:bg-brand-200' : 'btn-primary shadow-sm'}`}
        >
          {isEditing ? (
            <>Cancel Edit</>
          ) : (
            <><Pencil className="h-4 w-4 mr-2" /> Edit Profile</>
          )}
        </button>
      </div>

      {/* ── Profile Summary Card ───────────────────────────────── */}
      <div className="card overflow-hidden">
        {/* Cover gradient */}
        <div className="h-32 bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 opacity-90 relative">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        </div>
        
        <div className="px-6 pb-6 sm:px-8 sm:pb-8 relative">
          {/* Avatar / Logo upload */}
          <div className="relative -mt-16 mb-4 flex justify-between items-end">
            <div className="relative group inline-block">
              <div className="h-32 w-32 rounded-lg bg-white shadow-xl ring-4 ring-white flex items-center justify-center overflow-hidden z-10 transition-transform duration-300 group-hover:scale-105">
                {p.logoURL ? (
                  <img src={p.logoURL} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-12 w-12 text-brand-300" strokeWidth={1.5} />
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadPct !== null}
                className="absolute bottom-2 right-2 z-20 h-8 w-8 rounded-full bg-brand-900 text-white shadow-soft-lg flex items-center justify-center hover:bg-brand-500 hover:scale-110 transition-all cursor-pointer disabled:opacity-50"
                title="Change Photo"
              >
                {uploadPct !== null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
              />
            </div>
            
            {p.verified && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200 shadow-sm animate-fade-in mb-4">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wide">Verified Employer</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-brand-900 tracking-tight">
              {p.companyName || 'Your Company Name'}
            </h1>
            <p className="text-brand-600 font-medium">
              {p.industry || 'Update your industry'} • {p.companySize || 'Size not specified'}
            </p>
          </div>

          {/* Verification Warning */}
          {!p.verified && (
            <div className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
              <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              <p className="text-sm font-medium">Your account is pending verification. Some features may be restricted.</p>
            </div>
          )}
        </div>
      </div>

      {!isEditing ? (
        /* ── VIEW MODE ───────────────────────────────────────────── */
        <div className="space-y-6">
          <Grid2>
            {/* Company Details (View) */}
            <Section icon={Building2} title="Company Details">
              <div className="space-y-3">
                <DetailRow icon={Building2} label="Name" value={p.companyName} />
                <DetailRow icon={Briefcase} label="Industry" value={p.industry} />
                <DetailRow icon={Users} label="Size" value={p.companySize} />
                <DetailRow icon={Users} label="Employees" value={p.employeeCount} />
                {p.website && (
                  <div className="flex items-center gap-2.5 text-sm py-1">
                    <Globe className="h-3.5 w-3.5 text-brand-400 flex-shrink-0" />
                    <span className="text-brand-500 min-w-[80px]">Website</span>
                    <a href={p.website} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline truncate">
                      {p.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>
            </Section>

            {/* Leadership & Contact (View) */}
            <Section icon={Crown} title="Leadership & Contact">
              <div className="space-y-3">
                <DetailRow icon={Crown} label="CEO" value={p.ceo} />
                <DetailRow icon={Calendar} label="Founded" value={p.foundedYear} />
                <DetailRow icon={MapPin} label="HQ" value={p.headquarters} />
                <DetailRow icon={Mail} label="Email" value={p.email} />
                <DetailRow icon={Phone} label="Phone" value={p.phone} />
                {p.hrContact?.name && (
                  <DetailRow icon={Users} label="HR Contact" value={`${p.hrContact.name} (${p.hrContact.email})`} />
                )}
              </div>
            </Section>
          </Grid2>

          {/* Culture & Achievements (View) */}
          <Section icon={Sparkles} title="Culture & Achievements">
            <div className="space-y-6">
              {p.description && (
                <div>
                  <h3 className="text-sm font-medium text-brand-500 mb-2">About Us</h3>
                  <p className="text-sm text-brand-700 whitespace-pre-wrap leading-relaxed">{p.description}</p>
                </div>
              )}
              {p.companyCulture && (
                <div>
                  <h3 className="text-sm font-medium text-brand-500 mb-2">Company Culture</h3>
                  <p className="text-sm text-brand-700 whitespace-pre-wrap leading-relaxed">{p.companyCulture}</p>
                </div>
              )}
              
              <Grid2>
                {p.technologies?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-brand-500 mb-2 flex items-center gap-1.5"><Cpu className="h-4 w-4"/> Technologies</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {p.technologies.map((tech, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md bg-brand-100 text-brand-600 text-xs font-medium border border-brand-200">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {p.benefits?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-brand-500 mb-2 flex items-center gap-1.5"><Heart className="h-4 w-4"/> Benefits</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {p.benefits.map((ben, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">
                          {ben}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Grid2>

              {p.achievements?.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-brand-500 mb-2 flex items-center gap-1.5"><Star className="h-4 w-4"/> Achievements</h3>
                  <ul className="space-y-2">
                    {p.achievements.map((ach, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-brand-700 bg-brand-50 p-3 rounded-lg border border-brand-100">
                        <Star className="h-4 w-4 text-brand-500 flex-shrink-0 mt-0.5" />
                        <span>{ach}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {p.linkedin && (
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-brand-100">
                  <LinkedInIcon className="h-5 w-5 text-blue-600" />
                  <a href={p.linkedin} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-600 hover:underline">
                    View LinkedIn Profile
                  </a>
                </div>
              )}
            </div>
          </Section>
        </div>
      ) : (
        /* ── EDIT MODE ───────────────────────────────────────────── */
        <div className="space-y-6">
          <Section icon={Building2} title="Company Details">
            <Grid2>
              <Field label="Company Name">
                <input
                  className="input"
                  value={cd.companyName}
                  onChange={e => setCompanyDetails({...cd, companyName: e.target.value})}
                  placeholder="Acme Corp"
                />
              </Field>
              <Field label="Industry">
                <input
                  className="input"
                  value={cd.industry}
                  onChange={e => setCompanyDetails({...cd, industry: e.target.value})}
                  placeholder="e.g. Technology, Finance"
                />
              </Field>
              <Field label="Company Size">
                <input
                  className="input"
                  value={cd.companySize}
                  onChange={e => setCompanyDetails({...cd, companySize: e.target.value})}
                  placeholder="e.g. 50-200"
                />
              </Field>
              <Field label="Employee Count (Number)">
                <input
                  type="number"
                  className="input"
                  value={cd.employeeCount}
                  onChange={e => setCompanyDetails({...cd, employeeCount: e.target.value ? Number(e.target.value) : ''})}
                  placeholder="e.g. 150"
                />
              </Field>
              <Field label="Website URL">
                <input
                  type="url"
                  className="input"
                  value={cd.website}
                  onChange={e => setCompanyDetails({...cd, website: e.target.value})}
                  placeholder="https://example.com"
                />
              </Field>
            </Grid2>
          </Section>

          <Section icon={Crown} title="Leadership & Contact">
            <Grid2>
              <Field label="CEO Name">
                <input
                  className="input"
                  value={lc.ceo}
                  onChange={e => setLeadershipContact({...lc, ceo: e.target.value})}
                  placeholder="Jane Doe"
                />
              </Field>
              <Field label="Founded Year">
                <input
                  type="number"
                  className="input"
                  value={lc.foundedYear}
                  onChange={e => setLeadershipContact({...lc, foundedYear: e.target.value ? Number(e.target.value) : ''})}
                  placeholder="e.g. 2010"
                />
              </Field>
              <Field label="Headquarters (City, Country)">
                <input
                  className="input"
                  value={lc.headquarters}
                  onChange={e => setLeadershipContact({...lc, headquarters: e.target.value})}
                  placeholder="San Francisco, USA"
                />
              </Field>
              <Field label="Company Email">
                <input
                  type="email"
                  className="input"
                  value={lc.email}
                  onChange={e => setLeadershipContact({...lc, email: e.target.value})}
                  placeholder="contact@company.com"
                />
              </Field>
              <Field label="Company Phone">
                <input
                  className="input"
                  value={lc.phone}
                  onChange={e => setLeadershipContact({...lc, phone: e.target.value})}
                  placeholder="+1 (555) 000-0000"
                />
              </Field>
            </Grid2>
            <div className="pt-4 border-t border-brand-100 mt-4">
              <h3 className="text-sm font-semibold text-brand-700 mb-3">HR Contact Person</h3>
              <Grid2>
                <Field label="HR Name">
                  <input
                    className="input"
                    value={lc.hrContact?.name || ''}
                    onChange={e => setLeadershipContact({...lc, hrContact: {...lc.hrContact, name: e.target.value}})}
                  />
                </Field>
                <Field label="HR Email">
                  <input
                    type="email"
                    className="input"
                    value={lc.hrContact?.email || ''}
                    onChange={e => setLeadershipContact({...lc, hrContact: {...lc.hrContact, email: e.target.value}})}
                  />
                </Field>
                <Field label="HR Phone">
                  <input
                    className="input"
                    value={lc.hrContact?.phone || ''}
                    onChange={e => setLeadershipContact({...lc, hrContact: {...lc.hrContact, phone: e.target.value}})}
                  />
                </Field>
              </Grid2>
            </div>
          </Section>

          <Section icon={Sparkles} title="Culture & Achievements">
            <Field label="Company Description">
              <textarea
                className="input min-h-[100px] resize-y py-3"
                value={ca.description}
                onChange={e => setCultureAchievements({...ca, description: e.target.value})}
                placeholder="What does your company do?"
              />
            </Field>
            <Field label="Company Culture">
              <textarea
                className="input min-h-[100px] resize-y py-3"
                value={ca.companyCulture}
                onChange={e => setCultureAchievements({...ca, companyCulture: e.target.value})}
                placeholder="Describe your work environment..."
              />
            </Field>
            <Field label="LinkedIn URL">
              <div className="relative">
                <LinkedInIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-brand-400" />
                <input
                  type="url"
                  className="input pl-10"
                  value={ca.linkedin}
                  onChange={e => setCultureAchievements({...ca, linkedin: e.target.value})}
                  placeholder="https://linkedin.com/company/..."
                />
              </div>
            </Field>

            <Grid2>
              <Field label="Technologies Used">
                <TagsInput
                  value={ca.technologies}
                  onChange={tags => setCultureAchievements({...ca, technologies: tags})}
                  placeholder="e.g. React, Node.js..."
                />
              </Field>
              <Field label="Benefits">
                <TagsInput
                  value={ca.benefits}
                  onChange={tags => setCultureAchievements({...ca, benefits: tags})}
                  placeholder="e.g. Health Insurance, Remote..."
                />
              </Field>
            </Grid2>

            <Field label="Achievements & Awards">
              <TagsInput
                value={ca.achievements}
                onChange={tags => setCultureAchievements({...ca, achievements: tags})}
                placeholder="e.g. Best Startup 2023..."
              />
            </Field>
          </Section>

          {/* Company DNA Preview */}
          <Section icon={Sparkles} title="Company DNA">
            <p className="text-sm text-brand-500 -mt-2 mb-3">
              This AI-generated personality card is what students see when viewing your company profile.
            </p>
            <CompanyDNAPanel
              data={profile?.companyDna}
              companyName={profile?.companyName || 'Your Company'}
              isEmployerView={true}
              onRegenerate={() => {
                employerService.generateCompanyDna()
                  .then(() => {
                    queryClient.invalidateQueries({ queryKey: ['employer', 'me'] });
                    toast.success('Company DNA generated!');
                  })
                  .catch(err => toast.error(err.response?.data?.error?.message || err.message || 'Failed'));
              }}
            />
          </Section>

          {/* Global Save Button */}
          <div className="sticky bottom-6 z-30 flex justify-end">
            <div className="bg-white/80 backdrop-blur-md p-4 rounded-lg shadow-xl border border-brand-100 animate-slide-up flex items-center gap-4">
              <span className="text-sm font-medium text-brand-500">Unsaved changes</span>
              <button
                onClick={handleSaveAll}
                disabled={saveMutation.isPending}
                className="btn-primary shadow-soft-lg hover:shadow-brand-500/25 px-8"
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Save Profile</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}