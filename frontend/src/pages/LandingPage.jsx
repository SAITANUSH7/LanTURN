import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, UserPlus, Cpu, Briefcase, FileText, Radar, MessageSquare, BarChart3, Menu, X, Shield, ScrollText, Headphones, Mail, Phone, MapPin, Settings, Network, Users, Gift, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

const STATS = [
  { value: '13947', label: 'Online Services', icon: Settings },
  { value: '3680', label: 'Government Schemes', icon: Network },
  { value: '2318', label: 'Citizen Engagements', icon: Users },
  { value: '3980', label: 'Tourist Places', icon: MapPin },
  { value: '1207', label: 'ODOP Products', icon: Gift },
  { value: '18', label: 'Information Categories', icon: Info },
];

const STEPS = [
  { num: 1, icon: UserPlus, title: 'Create Profile', desc: 'Upload your resume, transcripts, and portfolio. Our system builds a comprehensive skills graph from your data.' },
  { num: 2, icon: Cpu, title: 'AI Matches', desc: 'Our algorithm analyzes your profile against thousands of active job requirements to find perfect alignments.' },
  { num: 3, icon: Briefcase, title: 'Get Placed', desc: 'Review matches, prep with our interview assistant, and accept offers from employers looking for your exact skill set.' },
];

const FEATURES = [
  { icon: FileText, title: 'Resume AI', desc: 'Automated resume parsing and optimization to highlight your strongest assets.' },
  { icon: Radar, title: 'Smart Matching', desc: 'Predictive models that match you with roles where you are statistically likely to succeed.' },
  { icon: MessageSquare, title: 'Career Assistant', desc: '24/7 AI chatbot for interview prep, salary negotiation tips, and career advice.' },
  { icon: BarChart3, title: 'Skill Analysis', desc: 'Identify gaps in your knowledge based on current industry demands and trends.' },
];

/* ─── Modal Component ─────────────────────────────── */
function Modal({ open, onClose, title, icon: Icon, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (open) {
      document.addEventListener('keydown', onKey);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-brand-900/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-brand-100 flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-brand-900">
            <Icon className="h-5 w-5" />
          </div>
          <h2 className="font-headline text-xl font-bold text-brand-900 flex-1">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-brand-400 hover:bg-brand-100 hover:text-brand-900 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-6 text-sm text-brand-700 leading-relaxed space-y-4 flex-1">
          {children}
        </div>
        <div className="px-6 py-4 border-t border-brand-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-semibold bg-brand-900 text-white px-5 py-2 rounded-lg hover:bg-brand-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Privacy Policy Content ─────────────────────── */
function PrivacyPolicyContent() {
  return (
    <>
      <p className="text-brand-400 text-xs">Last updated: September 2025</p>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">1. Introduction</h3>
        <p>LanTURN is an AI-powered career placement platform operated by <strong>Siva Sivani Degree College</strong>. This Privacy Policy explains how we collect, use, store, and protect your personal information. By registering or using LanTURN, you agree to the practices described herein.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">2. Information We Collect</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account Information:</strong> Name, college email, student/employee ID, and role (Student or Employer).</li>
          <li><strong>Academic Data:</strong> Course details, semester, CGPA, transcripts, and certifications you voluntarily upload.</li>
          <li><strong>Resume &amp; Portfolio:</strong> Documents, project links, and skills you submit for AI analysis and matching.</li>
          <li><strong>Employer Data:</strong> Company name, job descriptions, hiring preferences, and contact details.</li>
          <li><strong>Usage Data:</strong> Log data, pages visited, feature interactions, and AI chat transcripts (stored anonymously for model improvement).</li>
        </ul>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">3. How We Use Your Data</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>To provide AI-driven job matching and career recommendations personalised to your profile.</li>
          <li>To enable employers to discover and connect with qualified student candidates.</li>
          <li>To generate skill-gap analyses and interview preparation suggestions.</li>
          <li>To send placement updates, application status notifications, and platform announcements.</li>
          <li>To improve the accuracy of our matching algorithms through anonymised, aggregated analysis.</li>
          <li>To comply with college placement-cell reporting and accreditation requirements.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">4. Data Sharing</h3>
        <p>We do <strong>not</strong> sell your personal data. Your profile is shared with employers only when you explicitly apply to a role. Aggregated, anonymised statistics may be shared with college administration for placement reporting. We engage trusted third-party providers (e.g., cloud infrastructure, AI APIs) under strict data-processing agreements.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">5. Data Security</h3>
        <p>LanTURN uses Firebase Authentication, encrypted data transmission (TLS/HTTPS), and role-based access controls. Please safeguard your login credentials and report any suspicious activity immediately.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">6. Data Retention</h3>
        <p>Your data is retained for the duration of your enrolment or employer partnership, plus an archival period of up to 2 years for placement records. You may request deletion at any time by contacting the placement cell.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">7. Your Rights</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Access or download a copy of your personal data.</li>
          <li>Request correction of inaccurate information.</li>
          <li>Withdraw consent for AI-based profile analysis (this will limit matching features).</li>
          <li>Request account and data deletion.</li>
        </ul>
        <p className="mt-2">Contact us at <strong>lanturn@sivasivani.edu.in</strong> to exercise these rights.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">8. Cookies</h3>
        <p>LanTURN uses session cookies for authentication and local storage for user preferences. We do not use advertising or cross-site tracking cookies.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">9. Changes to This Policy</h3>
        <p>Significant changes will be communicated via the platform or your registered email. Continued use of LanTURN after changes constitutes acceptance of the revised policy.</p>
      </section>
    </>
  );
}

/* ─── Terms of Service Content ───────────────────── */
function TermsContent() {
  return (
    <>
      <p className="text-brand-400 text-xs">Effective date: September 2025</p>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">1. Acceptance of Terms</h3>
        <p>By accessing or using LanTURN, you agree to be bound by these Terms of Service. LanTURN is an initiative of <strong>Siva Sivani Degree College</strong> intended exclusively for registered students, faculty, and partner employers.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">2. Eligibility</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Students:</strong> Must be currently enrolled at Siva Sivani Degree College with a valid institutional email.</li>
          <li><strong>Employers:</strong> Must be registered organisations approved by the college placement cell.</li>
          <li>Users must be at least 18 years of age.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">3. Account Responsibilities</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
          <li>You must provide accurate and truthful information in your profile, resume, and applications.</li>
          <li>Any misrepresentation of qualifications or identity may result in immediate account suspension and disciplinary action.</li>
          <li>Notify the platform immediately of any unauthorised use of your account.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">4. Permitted Use</h3>
        <p>LanTURN is provided solely for legitimate career placement and hiring activities including profile creation, job applications, AI-assisted career counselling, and communication between students and approved employer representatives.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">5. Prohibited Conduct</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Uploading false credentials, forged documents, or plagiarised content.</li>
          <li>Attempting to reverse-engineer or scrape the platform's AI models or data.</li>
          <li>Spamming other users or sending unsolicited communications.</li>
          <li>Using the platform for any purpose unrelated to career placement.</li>
          <li>Sharing login credentials with any third party.</li>
        </ul>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">6. AI-Generated Content</h3>
        <p>LanTURN uses AI to generate resume suggestions, interview tips, skill-gap analyses, and job matches. These outputs are for informational purposes only and do not constitute professional career, legal, or financial advice. The platform does not guarantee placement or employment outcomes.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">7. Intellectual Property</h3>
        <p>All platform content, AI models, branding, and code are the intellectual property of LanTURN / Siva Sivani Degree College. Users retain ownership of uploaded content but grant LanTURN a non-exclusive licence to process it for platform functionality.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">8. Termination</h3>
        <p>The college reserves the right to suspend or terminate accounts that violate these Terms. Graduates retain read-only access to their placement history for up to one year after graduation.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">9. Limitation of Liability</h3>
        <p>LanTURN and Siva Sivani Degree College are not liable for any employment decisions made by employers, failed placements, or losses arising from reliance on AI-generated recommendations. The platform is provided "as is" without warranties of any kind.</p>
      </section>

      <section>
        <h3 className="font-headline font-bold text-brand-900 text-base mb-2">10. Governing Law</h3>
        <p>These Terms are governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in Secunderabad, Telangana.</p>
      </section>
    </>
  );
}

/* ─── Contact Support Content ────────────────────── */
function ContactContent() {
  return (
    <div className="space-y-6">
      <p>Need help with LanTURN? Our placement support team is here to assist students and employers alike. Reach out through any of the channels below.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface-muted border border-brand-100 rounded-xl p-4 flex gap-3 items-start">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center text-brand-900 flex-shrink-0">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-brand-900 text-sm mb-0.5">Email Support</p>
            <p className="text-brand-400 text-xs mb-1">We respond within 24 hours</p>
            <a href="mailto:lanturn@sivasivani.edu.in" className="text-accent font-medium text-xs hover:underline">lanturn@sivasivani.edu.in</a>
          </div>
        </div>

        <div className="bg-surface-muted border border-brand-100 rounded-xl p-4 flex gap-3 items-start">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center text-brand-900 flex-shrink-0">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-brand-900 text-sm mb-0.5">Placement Cell</p>
            <p className="text-brand-400 text-xs mb-1">Mon – Sat, 9 AM – 5 PM</p>
            <a href="tel:+914027906006" className="text-accent font-medium text-xs hover:underline">+91 40 2790 6006</a>
          </div>
        </div>

        <div className="bg-surface-muted border border-brand-100 rounded-xl p-4 flex gap-3 items-start sm:col-span-2">
          <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center text-brand-900 flex-shrink-0">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-brand-900 text-sm mb-0.5">Placement Office</p>
            <p className="text-brand-400 text-xs leading-relaxed">
              Siva Sivani Degree College, Kompally,<br />
              Secunderabad, Telangana – 500014, India
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-brand-100 pt-4">
        <h3 className="font-headline font-bold text-brand-900 text-sm mb-3">Frequently Asked Questions</h3>
        <div className="space-y-3">
          {[
            { q: 'How do I reset my password?', a: 'Click "Sign In" on the homepage, then use the "Forgot password?" link. A reset email will be sent to your registered college email address.' },
            { q: "My profile isn't showing job matches — why?", a: 'Ensure your profile is at least 80% complete: upload your resume, fill in your skills, and set your placement preferences. The AI needs sufficient data to generate accurate matches.' },
            { q: "I'm an employer — how do I post a job?", a: 'Log in with your employer account, navigate to the Jobs tab, and click "Post New Job". Your listing will be reviewed by the placement cell before going live.' },
            { q: 'Can I use LanTURN after graduating?', a: 'Graduates retain read-only access to their placement history and offer letters for up to one year after their graduation date.' },
          ].map(({ q, a }) => (
            <div key={q} className="bg-white border border-brand-100 rounded-lg p-3">
              <p className="font-semibold text-brand-900 text-xs mb-1">{q}</p>
              <p className="text-brand-500 text-xs leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-brand-900 rounded-xl p-4 text-white text-center">
        <p className="text-sm font-semibold mb-1">Can't find what you need?</p>
        <p className="text-white/70 text-xs mb-3">Drop us an email and the LanTURN support team will get back to you within one business day.</p>
        <a
          href="mailto:lanturn@sivasivani.edu.in"
          className="inline-block bg-white text-brand-900 text-xs font-bold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
        >
          Send an Email
        </a>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modal, setModal] = useState(null); // 'privacy' | 'terms' | 'contact' | null
  
  // Parallax scroll driver for background flower pattern
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          document.body.style.setProperty('--scroll-y', String(window.scrollY));
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent">
      {/* ── Modals ──────────────────────────────────────── */}
      <Modal open={modal === 'privacy'} onClose={() => setModal(null)} title="Privacy Policy" icon={Shield}>
        <PrivacyPolicyContent />
      </Modal>
      <Modal open={modal === 'terms'} onClose={() => setModal(null)} title="Terms of Service" icon={ScrollText}>
        <TermsContent />
      </Modal>
      <Modal open={modal === 'contact'} onClose={() => setModal(null)} title="Contact Support" icon={Headphones}>
        <ContactContent />
      </Modal>
      {/* ── Nav ──────────────────────────────────────────── */}
      <nav 
        className="fixed top-0 w-full z-50 border-b border-brand-100 shadow-sm" 
        style={{ 
          backgroundImage: 'url(/orange-pattern.jpg)', 
          backgroundRepeat: 'repeat'
        }}
      >
        <div className="w-full h-full bg-white/70 backdrop-blur-md">
          <div className="flex justify-between items-center px-6 md:px-12 py-4 max-w-7xl mx-auto">
            <Link to="/" className="flex items-center gap-1.5 flex-shrink-0">
              <img src="/hero-logo.png" alt="LanTURN Logo" className="h-10 w-auto object-contain" />
              <span className="font-headline text-2xl font-bold tracking-tighter text-brand-900 flex items-center gap-1">
                LanTURN <span className="w-2 h-2 rounded-full bg-accent inline-block" />
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-8">
              <a href="#how-it-works" className="text-brand-800 hover:text-brand-900 transition-colors font-semibold text-sm drop-shadow-sm">How It Works</a>
              <a href="#features" className="text-brand-800 hover:text-brand-900 transition-colors font-semibold text-sm drop-shadow-sm">Features</a>
              <a href="#stats" className="text-brand-800 hover:text-brand-900 transition-colors font-semibold text-sm drop-shadow-sm">Stats</a>
            </div>
            <div className="hidden sm:flex items-center gap-4">
              {user ? (
                <Link to="/dashboard" className="text-sm font-semibold bg-brand-900 text-white px-5 py-2.5 rounded-lg hover:bg-brand-800 transition-all flex items-center gap-2 shadow-md">
                  Return to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-bold text-brand-900 hover:text-accent transition-colors drop-shadow-sm">Sign In</Link>
                  <Link to="/login?mode=signup" className="text-sm font-semibold bg-brand-900 text-white px-5 py-2.5 rounded-lg hover:bg-brand-800 transition-all flex items-center gap-2 shadow-md">
                    Get Started
                  </Link>
                </>
              )}
            </div>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="md:hidden h-9 w-9 rounded-lg flex items-center justify-center text-brand-900 hover:bg-brand-900/10 transition-colors"
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {/* Mobile drawer */}
          {mobileNavOpen && (
            <div className="md:hidden border-t border-brand-100 bg-white/95 backdrop-blur-md animate-slide-up">
              <div className="px-6 py-4 flex flex-col gap-3 max-w-7xl mx-auto">
                <a href="#how-it-works" onClick={() => setMobileNavOpen(false)} className="text-sm font-semibold text-brand-800 py-2 hover:text-brand-900">How It Works</a>
                <a href="#features" onClick={() => setMobileNavOpen(false)} className="text-sm font-semibold text-brand-800 py-2 hover:text-brand-900">Features</a>
                <a href="#stats" onClick={() => setMobileNavOpen(false)} className="text-sm font-semibold text-brand-800 py-2 hover:text-brand-900">Stats</a>
                <div className="pt-3 border-t border-brand-100 flex flex-col gap-2">
                  {user ? (
                    <Link to="/dashboard" onClick={() => setMobileNavOpen(false)} className="text-center text-sm font-semibold bg-brand-900 text-white px-5 py-3 rounded-lg">Return to Dashboard</Link>
                  ) : (
                    <>
                      <Link to="/login" onClick={() => setMobileNavOpen(false)} className="text-center text-sm font-bold text-brand-900 py-2">Sign In</Link>
                      <Link to="/login?mode=signup" onClick={() => setMobileNavOpen(false)} className="text-center text-sm font-semibold bg-brand-900 text-white px-5 py-3 rounded-lg">Get Started</Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative pt-28 sm:pt-32 md:pt-40 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12">
          <div className="grid md:grid-cols-2 gap-8 sm:gap-12 md:gap-16 items-end">
            <div className="z-10 animate-fade-in relative pb-12 sm:pb-20 md:pb-32">
              {/* Semi-transparent backdrop for text readability over pattern */}
              <div className="absolute -inset-8 bg-[#F5F0E8]/80 backdrop-blur-sm rounded-2xl -z-10" />
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-100 bg-white mb-8">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="text-xs font-semibold tracking-wide uppercase text-brand-500">AI Placement Platform</span>
              </div>
              <h1 className="font-headline text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-brand-900 leading-[1.05] mb-6">
                Your Career<br />Starts Here<span className="text-accent">.</span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl text-brand-700 mb-8 sm:mb-10 max-w-lg leading-relaxed">
                AI-powered placement platform connecting students with the right employers based on skills, potential, and cultural fit.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {user ? (
                  <Link
                    to="/dashboard"
                    className="text-sm font-semibold bg-brand-900 text-white px-6 py-3.5 rounded-lg hover:bg-brand-800 transition-all flex items-center gap-2 group shadow-soft-md hover:shadow-soft-lg"
                  >
                    Return to Dashboard
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login?mode=signup"
                      className="text-sm font-semibold bg-brand-900 text-white px-6 py-3.5 rounded-lg hover:bg-brand-800 transition-all flex items-center gap-2 group shadow-soft-md hover:shadow-soft-lg"
                    >
                      Get Started Free
                      <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block group-hover:scale-150 transition-transform" />
                    </Link>
                    <Link
                      to="/login"
                      className="text-sm font-semibold text-brand-900 border border-brand-200 bg-white/80 px-6 py-3.5 rounded-lg hover:bg-white transition-colors flex items-center gap-2"
                    >
                      Already a user?
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Hero Image - Filled and bottom-aligned */}
            <div className="relative z-10 w-full h-full flex flex-col justify-end items-center md:items-end animate-slide-up pt-8 md:pt-0">
              <img 
                src="/modi-pic.png" 
                alt="LanTURN Hero" 
                loading="eager" 
                decoding="async" 
                fetchPriority="high" 
                className="w-full max-w-lg md:max-w-[120%] lg:max-w-[130%] h-auto object-contain object-bottom drop-shadow-[0_20px_20px_rgba(136,14,79,0.2)] origin-bottom hover:scale-[1.02] transition-transform duration-500 translate-y-px md:translate-x-8 lg:translate-x-12" 
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trusted By ───────────────────────────────────── */}
      <section 
        className="border-y border-brand-100 relative overflow-hidden"
        style={{ 
          backgroundImage: 'url(/bandhani-pattern.svg)', 
          backgroundRepeat: 'repeat',
          backgroundSize: '400px'
        }}
      >
        <div className="absolute inset-0 bg-[#F5F0E8]/90 backdrop-blur-sm pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 flex flex-col md:flex-row items-center justify-between gap-8 hover:opacity-100 transition-all duration-500 relative z-10">
          <div className="flex items-center gap-4">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-800 whitespace-nowrap drop-shadow-sm">Powered by</p>
            <img src="/flag.jpg" alt="Indian Flag" className="h-8 w-auto rounded-sm shadow-sm opacity-90" />
          </div>
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 items-center">
            <div className="font-headline font-black text-xl md:text-2xl tracking-tighter text-brand-900 drop-shadow-sm text-center">Siva Sivani Degree College</div>
            <div className="bg-white p-1.5 rounded-lg shadow-sm border border-brand-100">
              <img src="/logo.jpeg" alt="College Logo" className="h-10 md:h-12 w-auto object-contain rounded" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      <section className="py-12 bg-white border-b border-brand-100 shadow-sm relative z-20" id="stats">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Verified records from official government sites
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 md:gap-4">
            {STATS.map((s, i) => (
              <div key={s.label} className="flex items-center gap-3 justify-center md:justify-start">
                <div className="text-accent flex-shrink-0">
                  <s.icon className="w-8 h-8 md:w-10 md:h-10 stroke-[1.5]" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-headline text-xl md:text-2xl font-bold text-brand-900 leading-none mb-0.5 md:mb-1">
                    {s.value}
                  </span>
                  <span className="text-[10px] md:text-xs font-medium text-brand-600 leading-tight md:leading-snug">
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────── */}
      <section className="py-24 bg-white relative overflow-hidden" id="how-it-works">
        <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
          <div className="text-center mb-16">
            <h2 className="font-headline text-4xl font-bold text-brand-900 mb-4">How It Works</h2>
            <p className="text-brand-400 max-w-2xl mx-auto">Three simple steps to connect your potential with the perfect opportunity.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {STEPS.map((step, i) => {
              const theme = i === 0 
                ? { bg: 'bg-[#FF9933]', border: 'border-[#FF9933]', text: 'text-white', desc: 'text-orange-50', badgeBg: 'bg-white', badgeText: 'text-[#FF9933]', iconBg: 'bg-white/20', iconText: 'text-white', hoverIconBg: 'group-hover:bg-white', hoverIconText: 'group-hover:text-[#FF9933]' }
                : i === 1
                ? { bg: 'bg-white', border: 'border-gray-200', text: 'text-brand-900', desc: 'text-brand-500', badgeBg: 'bg-[#000080]', badgeText: 'text-white', iconBg: 'bg-blue-50', iconText: 'text-[#000080]', hoverIconBg: 'group-hover:bg-[#000080]', hoverIconText: 'group-hover:text-white' }
                : { bg: 'bg-[#138808]', border: 'border-[#138808]', text: 'text-white', desc: 'text-green-50', badgeBg: 'bg-white', badgeText: 'text-[#138808]', iconBg: 'bg-white/20', iconText: 'text-white', hoverIconBg: 'group-hover:bg-white', hoverIconText: 'group-hover:text-[#138808]' };

              return (
                <div
                  key={step.num}
                  className={`${theme.bg} ${theme.border} border p-6 sm:p-8 rounded-lg shadow-soft-md hover:shadow-soft-lg transition-all relative group ${
                    i === 1 ? 'md:translate-y-6' : i === 2 ? 'md:translate-y-12' : ''
                  }`}
                >
                  <div className={`absolute -top-4 -left-4 w-12 h-12 ${theme.badgeBg} ${theme.badgeText} font-headline font-bold text-xl flex items-center justify-center rounded-lg shadow-soft-sm`}>
                    {step.num}
                  </div>
                  <div className={`w-12 h-12 ${theme.iconBg} rounded-lg mb-6 flex items-center justify-center ${theme.iconText} ${theme.hoverIconBg} ${theme.hoverIconText} transition-colors`}>
                    <step.icon className="h-5 w-5" />
                  </div>
                  <h3 className={`font-headline text-xl font-bold ${theme.text} mb-3`}>{step.title}</h3>
                  <p className={`text-sm ${theme.desc} leading-relaxed`}>{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
        {/* Dot matrix overlay */}
        <div className="absolute inset-0 opacity-20 z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#E8E8E8 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      </section>

      {/* ── Features Grid ────────────────────────────────── */}
      <section 
        className="py-24 border-t border-brand-100 relative overflow-hidden" 
        id="features"
        style={{
          backgroundImage: 'url(/indian-touch.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
        }}
      >
        <div className="absolute inset-0 bg-white/90 backdrop-blur-[2px] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
          <div className="mb-16">
            <h2 className="font-headline text-4xl font-bold text-brand-900 mb-4">Platform Features</h2>
            <p className="text-brand-400 max-w-2xl">The tools you need to accelerate your transition from campus to career.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white border border-brand-100 p-6 rounded-lg hover:-translate-y-1 transition-all shadow-soft-sm hover:shadow-soft-md">
                <div className="mb-6 flex justify-between items-start">
                  <f.icon className="h-7 w-7 text-brand-900" />
                  <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                </div>
                <h3 className="font-headline text-lg font-bold text-brand-900 mb-2">{f.title}</h3>
                <p className="text-sm text-brand-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ──────────────────────────────────── */}
      <section className="py-24 bg-brand-900 text-white relative overflow-hidden">
        <div className="max-w-2xl mx-auto px-6 text-center relative z-10">
          <h2 className="font-headline text-4xl md:text-5xl font-bold mb-6">Ready to start?</h2>
          <p className="text-white/70 mb-10">Join thousands of students who have already illuminated their career path with LanTURN.</p>
          {user ? (
            <Link to="/dashboard" className="inline-block bg-white text-brand-900 font-bold text-sm px-8 py-3 rounded-lg hover:bg-white/90 transition-colors shadow-soft-sm">
              Return to your Dashboard
            </Link>
          ) : (
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" onSubmit={e => { e.preventDefault(); window.location.href = '/login'; }}>
              <input
                className="flex-grow bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder:text-white/50 focus:outline-none focus:border-white/50 text-sm"
                placeholder="Enter your student email"
                type="email"
              />
              <button className="bg-white text-brand-900 font-bold text-sm px-8 py-3 rounded-lg hover:bg-white/90 transition-colors whitespace-nowrap" type="submit">
                Join Now
              </button>
            </form>
          )}
        </div>
        {/* Background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="bg-white border-t border-brand-100 w-full py-12 px-6 md:px-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="font-headline text-xl font-bold text-brand-900">LanTURN</span>
            <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <button onClick={() => setModal('privacy')} className="text-sm text-brand-400 hover:text-brand-900 transition-colors">Privacy Policy</button>
            <button onClick={() => setModal('terms')} className="text-sm text-brand-400 hover:text-brand-900 transition-colors">Terms of Service</button>
            <button onClick={() => setModal('contact')} className="text-sm text-brand-400 hover:text-brand-900 transition-colors">Contact Support</button>
          </div>
          <p className="text-sm text-brand-300">
            © {new Date().getFullYear()} LanTURN. AI-Powered Excellence.
          </p>
        </div>
      </footer>
    </div>
  );
}
