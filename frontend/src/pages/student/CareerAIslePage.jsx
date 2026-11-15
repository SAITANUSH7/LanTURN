import { useState, useMemo } from 'react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { roadmapService } from '../../services/roadmap.service.js';
import ResumeGapAnalyzerModal from '../../components/ai/ResumeGapAnalyzerModal.jsx';
import toast from 'react-hot-toast';
import {
  Globe, Server, Layers, Brain, Smartphone, BarChart2, RefreshCw,
  Shield, Cloud, Palette, Link, Gamepad2, FlaskConical, Cpu,
  Database, TrendingUp, Plus, X, Loader2, ExternalLink,
  BookOpen, Code2, Clock, Trash2, Sparkles, CheckCircle2,
  ChevronLeft, ChevronRight, ArrowRight, Map, Search, Eye, Filter,
  ShieldCheck, PieChart, Network, UserCheck, Glasses, MessageSquare,
  FileText, Wifi, HardDrive, Rocket, Atom, Target, Package,
  Landmark, Users, Handshake, Flame, Layers3, Check, Bot, CheckSquare,
  Compass, ArrowUpRight, Zap
} from 'lucide-react';

// ── Domain icon mapping (lucide) ────────────────────────────
const DOMAIN_ICONS = {
  frontend:       Globe,
  backend:        Server,
  fullstack:      Layers,
  sysarch:        Network,
  qa:             FlaskConical,
  gamedev:        Gamepad2,
  compilers:      Cpu,
  microservices:  Layers3,

  android:        Smartphone,
  ios:            Smartphone,
  flutter:        Smartphone,
  reactnative:    Smartphone,
  mobileqa:       Smartphone,

  aiml:           Brain,
  datasci:        BarChart2,
  dataanalytics:  PieChart,
  dataeng:        Database,
  prompteng:      Sparkles,
  quantum:        Atom,
  nlp:            MessageSquare,
  computervision: Eye,
  mlops:          RefreshCw,

  devops:         RefreshCw,
  cybersec:       Shield,
  cloudsec:       ShieldCheck,
  cloud:          Cloud,
  sre:            Flame,
  neteng:         Wifi,
  dba:            HardDrive,
  secops:         ShieldCheck,

  uiux:           Palette,
  product:        Package,
  gamedesign:     Target,
  uxresearch:     Search,

  engmgmt:        UserCheck,
  finance:        Landmark,
  hr:             Users,
  sales:          Handshake,
  marketing:      TrendingUp,
  devrel:         MessageSquare,
  bizanalyst:     FileText,
  growth:         Rocket,
  scrum:          CheckSquare,

  blockchain:     Link,
  arvr:           Glasses,
  embedded:       Cpu,
  robotics:       Bot,
};

// ── Fallback Category Mapping ────────────────────────────────
const DOMAIN_CATEGORY_MAP = {
  frontend:       'Software Engineering',
  backend:        'Software Engineering',
  fullstack:      'Software Engineering',
  sysarch:        'Software Engineering',
  qa:             'Software Engineering',
  gamedev:        'Software Engineering',
  compilers:      'Software Engineering',
  microservices:  'Software Engineering',

  android:        'Mobile Development',
  ios:            'Mobile Development',
  flutter:        'Mobile Development',
  reactnative:    'Mobile Development',
  mobileqa:       'Mobile Development',

  aiml:           'AI & Data Science',
  datasci:        'AI & Data Science',
  dataanalytics:  'AI & Data Science',
  dataeng:        'AI & Data Science',
  prompteng:      'AI & Data Science',
  quantum:        'AI & Data Science',
  nlp:            'AI & Data Science',
  computervision: 'AI & Data Science',
  mlops:          'AI & Data Science',

  devops:         'Cloud & Security',
  cybersec:       'Cloud & Security',
  cloudsec:       'Cloud & Security',
  cloud:          'Cloud & Security',
  sre:            'Cloud & Security',
  neteng:         'Cloud & Security',
  dba:            'Cloud & Security',
  secops:         'Cloud & Security',

  uiux:           'Product & Design',
  product:        'Product & Design',
  gamedesign:     'Product & Design',
  uxresearch:     'Product & Design',

  engmgmt:        'Management & Business',
  finance:        'Management & Business',
  hr:             'Management & Business',
  sales:          'Management & Business',
  marketing:      'Management & Business',
  devrel:         'Management & Business',
  bizanalyst:     'Management & Business',
  growth:         'Management & Business',
  scrum:          'Management & Business',

  blockchain:     'Emerging & Hardware',
  arvr:           'Emerging & Hardware',
  embedded:       'Emerging & Hardware',
  robotics:       'Emerging & Hardware',
};

const getDomainCategory = (domain) => {
  if (domain && domain.category) return domain.category;
  if (domain && domain.id && DOMAIN_CATEGORY_MAP[domain.id]) return DOMAIN_CATEGORY_MAP[domain.id];
  return 'Software Engineering';
};

// ── Stage node colors (cycles) ───────────────────────────────
const STAGE_COLORS = [
  { bg: 'bg-brand-600',  border: 'border-brand-600',  text: 'text-brand-600',  light: 'bg-brand-50',  hex: '#333333' },
  { bg: 'bg-amber-400',   border: 'border-amber-400',   text: 'text-amber-500',   light: 'bg-amber-50',   hex: '#f59e0b' },
  { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-600', light: 'bg-emerald-50', hex: '#10b981' },
  { bg: 'bg-rose-500',    border: 'border-rose-500',    text: 'text-rose-600',    light: 'bg-rose-50',    hex: '#f43f5e' },
  { bg: 'bg-brand-500',  border: 'border-brand-500',  text: 'text-brand-600',  light: 'bg-brand-50',  hex: '#8b5cf6' },
];

const CATEGORIES = [
  'All Roles',
  'Software Engineering',
  'Mobile Development',
  'AI & Data Science',
  'Cloud & Security',
  'Product & Design',
  'Management & Business',
  'Emerging & Hardware',
];

const DIFFICULTIES = ['All', 'Beginner', 'Intermediate', 'Advanced'];

// ── Senior UI/UX Domain Picker Modal ─────────────────────────
function DomainPickerModal({ domains, enrolledIds, onEnroll, onClose, enrolling }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [selectedCategory, setSelectedCategory] = useState('All Roles');
  const [difficultyFilter, setDifficultyFilter] = useState('All');
  const [previewDomain, setPreviewDomain] = useState(null);

  // Compute category counts
  const categoryCounts = useMemo(() => {
    const counts = { 'All Roles': domains.length };
    domains.forEach((d) => {
      const cat = getDomainCategory(d);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [domains]);

  // Filtered domains — debounced search for smooth typing on mobile
  const filtered = useMemo(() => {
    return domains.filter((d) => {
      const cat = getDomainCategory(d);
      const matchesSearch =
        d.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        d.description.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        cat.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesCat =
        selectedCategory === 'All Roles' || cat === selectedCategory;

      const matchesDifficulty =
        difficultyFilter === 'All' ||
        (d.stages && d.stages.some((s) => s.difficulty === difficultyFilter));

      return matchesSearch && matchesCat && matchesDifficulty;
    });
  }, [domains, debouncedSearch, selectedCategory, difficultyFilter]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop with ultra-smooth blur */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-md transition-all" onClick={onClose} />

      <motion.div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden border border-brand-200/80"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      >
        {/* Modal Header */}
        <div className="p-6 bg-white border-b border-brand-100 flex flex-col gap-5 flex-shrink-0 relative overflow-hidden">
          {/* Ambient Glow Gradient */}
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-brand-500/10 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="h-11 w-11 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 border border-brand-400/30 flex items-center justify-center text-white shadow-soft-lg shadow-brand-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-brand-900 flex items-center gap-2">
                  Explore Career Paths
                  <span className="text-xs font-extrabold bg-brand-50 text-brand-700 px-2.5 py-0.5 rounded-full border border-brand-200">
                    {domains.length} Paths
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-brand-500 mt-0.5">
                  Select a career domain to unlock structured, stage-by-stage learning roadmaps
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="h-10 w-10 rounded-lg bg-brand-50 hover:bg-brand-100 flex items-center justify-center text-brand-500 hover:text-brand-700 transition-all transform hover:rotate-90 duration-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Category Pill Navigation with Framer Motion Animated Layout */}
          {!previewDomain && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar pt-1 scroll-smooth relative z-10">
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat;
                const count = categoryCounts[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className="relative px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors"
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeCategoryTab"
                        className="absolute inset-0 bg-gradient-to-r from-brand-600 to-indigo-600 rounded-lg shadow-soft-lg shadow-brand-500/30"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? 'text-white' : 'text-brand-400 hover:text-brand-200'}`}>
                      {cat}
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-brand-400'}`}>
                        {count}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Body: Search & Filters or Stage Preview */}
        {previewDomain ? (
          /* Roadmap Stage Preview View */
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden bg-brand-50/80"
          >
            {/* Top Navigation Bar */}
            <div className="p-4 bg-white/90 backdrop-blur-md border-b border-brand-200/80 flex items-center justify-between flex-shrink-0 z-10">
              <button
                onClick={() => setPreviewDomain(null)}
                className="flex items-center gap-2 text-xs font-bold text-brand-700 hover:text-brand-600 bg-brand-100 hover:bg-brand-50 px-3.5 py-2 rounded-lg transition-all"
              >
                <ChevronLeft className="h-4 w-4" /> Back to Career Catalog
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-brand-500 flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4 text-brand-500" /> Interactive Roadmap Preview
                </span>
              </div>
            </div>

            {/* Preview Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Hero Banner Card */}
              <div
                className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-white/10"
                style={{ background: `linear-gradient(135deg, ${previewDomain.color || '#333333'}, #0f172a)` }}
              >
                <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="h-16 w-16 rounded-lg bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-3xl shrink-0 shadow-lg">
                      {previewDomain.icon || '�'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[11px] font-extrabold bg-white/20 backdrop-blur-md px-3 py-0.5 rounded-full uppercase tracking-wider text-white">
                          {getDomainCategory(previewDomain)}
                        </span>
                        <span className="text-xs text-white/80 font-semibold flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> ~{previewDomain.estimatedMonths} Months Duration
                        </span>
                      </div>
                      <h3 className="text-2xl sm:text-3xl font-black text-white">{previewDomain.title}</h3>
                      <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-2xl leading-relaxed">{previewDomain.description}</p>
                    </div>
                  </div>

                  <button
                    disabled={enrolledIds.has(previewDomain.id) || enrolling === previewDomain.id}
                    onClick={() => onEnroll(previewDomain.id)}
                    className="btn-primary bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl hover:shadow-emerald-500/30 border-none px-6 py-3.5 text-sm font-bold self-start md:self-center shrink-0 flex items-center gap-2 transform hover:scale-105 transition-all"
                  >
                    {enrolling === previewDomain.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : enrolledIds.has(previewDomain.id) ? (
                      <>
                        <Check className="h-4 w-4" /> Already Enrolled
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" /> Enroll in this Career Path
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Stages List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-brand-900 flex items-center gap-2">
                    <Layers3 className="h-5 w-5 text-brand-600" />
                    Stage-by-Stage Curriculum ({previewDomain.stages?.length || 0} Stages)
                  </h4>
                  <span className="text-xs font-semibold text-brand-400">
                    {previewDomain.stages?.reduce((sum, s) => sum + (s.topics?.length || 0), 0)} Total Skill Topics
                  </span>
                </div>

                <div className="space-y-3.5">
                  {previewDomain.stages?.map((stage, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-white rounded-lg p-5 border border-brand-200/80 shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3">
                          <span className="h-7 w-7 rounded-xl bg-brand-900 text-white text-xs font-extrabold flex items-center justify-center shrink-0 shadow-soft-md shadow-brand-500/20">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h5 className="font-bold text-brand-900 text-base">{stage.title}</h5>
                              {stage.difficulty && (
                                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                                  stage.difficulty === 'Beginner'
                                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                    : stage.difficulty === 'Intermediate'
                                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                    : 'bg-purple-50 text-purple-700 ring-1 ring-purple-200'
                                }`}>
                                  {stage.difficulty}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-brand-500 mt-1">{stage.description}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold bg-brand-100 text-brand-600 px-3 py-1 rounded-lg shrink-0 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {stage.durationWeeks} weeks
                        </span>
                      </div>

                      {/* Topics */}
                      <div className="mb-3.5">
                        <p className="text-[10px] font-bold text-brand-400 uppercase tracking-widest mb-1.5">
                          Core Topics Covered
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {stage.topics?.map((topic, ti) => (
                            <span key={ti} className="text-xs bg-brand-50 hover:bg-brand-100 border border-brand-200/60 text-brand-700 font-medium px-3 py-1 rounded-lg transition-colors">
                              {topic}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Stage Project Card */}
                      {stage.project && (
                        <div className="bg-gradient-to-r from-brand-50/80 to-indigo-50/50 rounded-lg p-3.5 border border-brand-100 text-xs">
                          <span className="font-bold text-brand-900 flex items-center gap-1.5">
                            <Code2 className="h-4 w-4 text-brand-600" /> Stage Capstone Project: {stage.project.title}
                          </span>
                          <p className="text-brand-700 mt-1 leading-relaxed">{stage.project.description}</p>
                        </div>
                      )}

                      {/* Study Resources */}
                      {stage.resources?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-brand-100 flex items-center gap-3 flex-wrap text-xs">
                          <span className="font-bold text-brand-400 text-[10px] uppercase tracking-wider">Resources:</span>
                          {stage.resources.map((res, ri) => (
                            <a
                              key={ri}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:text-brand-800 font-semibold flex items-center gap-1 hover:underline"
                            >
                              {res.title} <ArrowUpRight className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sticky Bottom Action Bar */}
            <div className="p-4 bg-white/90 backdrop-blur-md border-t border-brand-200/80 flex items-center justify-between shrink-0">
              <button
                onClick={() => setPreviewDomain(null)}
                className="text-xs font-bold text-brand-600 hover:text-brand-900 px-4 py-2 rounded-lg hover:bg-brand-100 transition-colors"
              >
                ← Return to Catalog
              </button>
              <button
                disabled={enrolledIds.has(previewDomain.id) || enrolling === previewDomain.id}
                onClick={() => onEnroll(previewDomain.id)}
                className="btn-primary bg-brand-600 hover:bg-brand-800 text-white font-bold text-xs px-6 py-2.5 rounded-lg shadow-soft-lg shadow-brand-500/20 flex items-center gap-2"
              >
                {enrolling === previewDomain.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : enrolledIds.has(previewDomain.id) ? (
                  'Enrolled'
                ) : (
                  'Enroll in this Career Path →'
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Normal Search & Catalog View */
          <div className="flex-1 flex flex-col overflow-hidden bg-brand-50/50">
            {/* Search & Difficulty Filter Bar */}
            <div className="p-4 border-b border-brand-200/70 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              {/* Search Box */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
                <input
                  className="input pl-10 pr-8 py-2.5 text-xs sm:text-sm bg-brand-50 border-brand-200/80 focus:bg-white focus:ring-2 focus:ring-brand-400/20 transition-all"
                  placeholder="Search 57 roles by title, skill, or topic (e.g. Flutter, Quantum, AWS, Pentesting)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-400 hover:text-brand-600 p-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Difficulty Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto shrink-0 pb-1 sm:pb-0">
                <span className="text-[11px] font-extrabold text-brand-400 uppercase tracking-wider mr-1 shrink-0">Level:</span>
                {DIFFICULTIES.map((diff) => {
                  const isActive = difficultyFilter === diff;
                  return (
                    <button
                      key={diff}
                      onClick={() => setDifficultyFilter(diff)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-brand-100 hover:bg-brand-200 text-brand-600'
                      }`}
                    >
                      {diff}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Roles Grid */}
            <div className="overflow-y-auto flex-1 p-5 sm:p-6">
              {filtered.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                  <div className="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center mx-auto text-brand-400">
                    <Search className="h-7 w-7 text-brand-400" />
                  </div>
                  <p className="text-lg font-bold text-brand-800">No career paths match your criteria</p>
                  <p className="text-xs text-brand-500 max-w-sm mx-auto">
                    Try searching for another keyword or reset category and difficulty filters to browse all 57 paths.
                  </p>
                  <button
                    onClick={() => {
                      setSearch('');
                      setSelectedCategory('All Roles');
                      setDifficultyFilter('All');
                    }}
                    className="btn-primary bg-slate-900 text-white text-xs px-4 py-2 mt-2 inline-flex items-center gap-1.5"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filtered.map((domain) => {
                    const DIcon = DOMAIN_ICONS[domain.id] ?? Globe;
                    const isEnrolled = enrolledIds.has(domain.id);
                    const domainCat = getDomainCategory(domain);

                    return (
                      <motion.div
                        key={domain.id}
                        whileHover={{ y: -3 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        className={`p-5 rounded-lg border transition-all duration-300 flex flex-col justify-between group ${
                          isEnrolled
                            ? 'bg-emerald-50/40 border-emerald-200/80 shadow-sm'
                            : 'bg-white border-brand-200/80 hover:border-brand-400/60 shadow-sm hover:shadow-xl hover:shadow-brand-500/5'
                        }`}
                      >
                        <div>
                          {/* Top Row: Icon + Title + Enrolled Badge */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex items-center gap-3.5">
                              <div
                                className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105 ${
                                  isEnrolled
                                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                    : 'bg-gradient-to-br from-brand-50 to-indigo-50 text-brand-600 border border-brand-100'
                                }`}
                              >
                                <DIcon className="h-6 w-6" />
                              </div>
                              <div>
                                <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-600">
                                  {domainCat}
                                </span>
                                <h3 className="font-extrabold text-brand-900 text-base leading-tight group-hover:text-brand-600 transition-colors">
                                  {domain.title}
                                </h3>
                              </div>
                            </div>

                            {isEnrolled && (
                              <span className="badge bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0 px-2.5 py-1">
                                <Check className="h-3 w-3" /> Enrolled
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <p className="text-xs text-brand-600 line-clamp-2 mb-4 leading-relaxed font-normal">
                            {domain.description}
                          </p>
                        </div>

                        {/* Footer stats & Action Buttons */}
                        <div className="pt-3 border-t border-brand-100 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-brand-400 font-semibold">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5 text-brand-400" />
                              {domain.estimatedMonths}m
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3.5 w-3.5 text-brand-400" />
                              {domain.stageCount || domain.stages?.length || 0} stages
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Quick Preview Button */}
                            <button
                              onClick={() => setPreviewDomain(domain)}
                              className="px-3 py-1.5 rounded-lg bg-brand-100 hover:bg-brand-200 text-brand-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
                              title="Preview Full Roadmap Stages"
                            >
                              <Eye className="h-3.5 w-3.5 text-brand-500" /> Preview
                            </button>

                            {/* Select / Enroll Button */}
                            <button
                              disabled={isEnrolled || enrolling === domain.id}
                              onClick={() => !isEnrolled && onEnroll(domain.id)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                                isEnrolled
                                  ? 'bg-emerald-100 text-emerald-700 cursor-default'
                                  : 'bg-brand-600 hover:bg-brand-800 text-white shadow-soft-md shadow-brand-500/20 hover:shadow-brand-500/30'
                              }`}
                            >
                              {enrolling === domain.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isEnrolled ? (
                                'Enrolled'
                              ) : (
                                <>
                                  <Plus className="h-3.5 w-3.5" /> Select
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Topic row ────────────────────────────────────────────────
function TopicRow({ topic, checked, onToggle, isLoading, accentColor, stageCompleted }) {
  return (
    <motion.button
      layout
      onClick={onToggle}
      disabled={isLoading}
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`flex items-center justify-between w-full text-left py-3 px-4 rounded-lg mb-1.5 group transition-colors ${
        checked
          ? 'bg-emerald-50 ring-1 ring-emerald-200'
          : stageCompleted
          ? 'bg-brand-50 ring-1 ring-brand-200'
          : 'bg-brand-50/50 hover:bg-brand-100 ring-1 ring-transparent hover:ring-brand-200'
      }`}
    >
      <span className={`text-sm pr-3 font-medium transition-all duration-300 ${
        checked ? 'line-through text-emerald-600/60' : 'text-brand-700 group-hover:text-brand-900'
      }`}>
        {topic}
      </span>
      <div className="flex-shrink-0">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: accentColor }} />
        ) : checked ? (
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <CheckCircle2 className="h-5 w-5 text-emerald-500 keep-color" />
          </motion.div>
        ) : (
          <div className="h-5 w-5 rounded-full border-2 border-brand-300 group-hover:border-slate-400 transition-colors" />
        )}
      </div>
    </motion.button>
  );
}

// ── Stage content panel (left or right) ─────────────────────
function StagePanel({ stage, stageIndex, side, completedSet, onToggleTopic, pendingKey, color, stageCompleted }) {
  const completedCount = stage.topics.filter((_, ti) => completedSet.has(`${stageIndex}-${ti}`)).length;
  const pct = stage.topics.length ? Math.round((completedCount / stage.topics.length) * 100) : 0;
  const startWeek = stageIndex * stage.durationWeeks + 1;
  const endWeek   = startWeek + stage.durationWeeks - 1;

  const panelBg    = stageCompleted ? 'bg-[#ecfdf5]' : 'bg-white';
  const accentHex  = stageCompleted ? '#10b981' : color.hex;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: side === 'right' ? 48 : -48, y: 12, boxShadow: '6px 6px 0px #0f172a' }}
      animate={{ opacity: 1, x: 0, y: 0, boxShadow: '6px 6px 0px #0f172a' }}
      transition={{ delay: stageIndex * 0.08, duration: 0.45, type: 'spring', stiffness: 200, damping: 24 }}
      whileHover={{ scale: 1.02, x: -2, y: -2, boxShadow: '8px 8px 0px #0f172a' }}
      className={`${panelBg} border-[3px] border-slate-900 rounded-lg overflow-hidden z-10 w-full max-w-full md:w-[380px] md:max-w-[380px] career-panel`}
    >
      {/* Coloured top accent bar */}
      <motion.div
        className="h-1.5 w-full keep-color"
        animate={{ background: stageCompleted
          ? 'linear-gradient(90deg, #10b981, #059669)'
          : `linear-gradient(90deg, ${color.hex}, ${color.hex}cc)`
        }}
        transition={{ duration: 0.6 }}
      />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400">
              Timeframe: Weeks {startWeek}–{endWeek}
            </p>
            <p className="text-base font-bold text-brand-900 mt-0.5">{stage.title}</p>
          </div>
          {stageCompleted && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-soft-md shadow-emerald-200 flex-shrink-0 keep-color"
            >
              <CheckCircle2 className="h-5 w-5 text-white" />
            </motion.div>
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-2 rounded-full bg-brand-200 overflow-hidden">
            <motion.div
              className="h-full rounded-full keep-color"
              animate={{
                width: `${pct}%`,
                background: stageCompleted
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : `linear-gradient(90deg, ${color.hex}, ${color.hex}bb)`,
              }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </div>
          <motion.span
            animate={{ color: stageCompleted ? '#059669' : '#8A8A8A' }}
            className="text-xs font-semibold flex-shrink-0 w-10 text-right"
          >
            {pct}%
          </motion.span>
        </div>

        {/* Topics */}
        <div className="mb-4">
          {stage.topics.map((topic, ti) => {
            const key = `${stageIndex}-${ti}`;
            return (
              <TopicRow
                key={ti}
                topic={topic}
                checked={completedSet.has(key)}
                isLoading={pendingKey === key}
                onToggle={() => onToggleTopic(stageIndex, ti, !completedSet.has(key))}
                accentColor={accentHex}
                stageCompleted={stageCompleted}
              />
            );
          })}
        </div>

        {/* Project card */}
        <motion.div
          animate={{
            background: stageCompleted
              ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
              : 'linear-gradient(135deg, #f8fafc, #E8E8E8)',
          }}
          transition={{ duration: 0.5 }}
          className="rounded-lg p-4 mb-4 ring-1 ring-brand-200"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5"
             style={{ color: accentHex }}>
            <Code2 className="h-3.5 w-3.5" /> Stage Project
          </p>
          <p className="text-sm font-semibold text-brand-900">{stage.project.title}</p>
          <p className="text-xs text-brand-500 mt-1 leading-relaxed">{stage.project.description}</p>
        </motion.div>

        {/* Resources */}
        {stage.resources?.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400 mb-2.5">
              Recommended Study Resources
            </p>
            <div className="space-y-2">
              {stage.resources.map((res, ri) => (
                <motion.a
                  key={ri}
                  href={res.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ x: 4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex items-center gap-2 text-sm font-medium text-brand-500 hover:text-brand-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  {res.title}
                </motion.a>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Center timeline for a single roadmap ─────────────────────
function RoadmapTimeline({ roadmap, onRemove }) {
  const qc = useQueryClient();
  const [pendingKey, setPendingKey] = useState(null);
  const [removing, setRemoving] = useState(false);
  const DIcon = DOMAIN_ICONS[roadmap.domainId] ?? Globe;

  const completedSet = useMemo(
    () => new Set(roadmap.completedSet || []),
    [roadmap.completedSet]
  );

  const toggleMutation = useMutation({
    mutationFn: ({ stageIndex, topicIndex, completed }) =>
      roadmapService.toggleTopic(roadmap.roadmapId, stageIndex, topicIndex, completed),
    onMutate: ({ stageIndex, topicIndex }) => setPendingKey(`${stageIndex}-${topicIndex}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roadmaps', 'me'] }),
    onError: () => toast.error('Failed to update topic'),
    onSettled: () => setPendingKey(null),
  });

  const handleRemove = async () => {
    if (!window.confirm(`Remove the "${roadmap.domainTitle}" roadmap? Your progress will be lost.`)) return;
    setRemoving(true);
    try {
      await roadmapService.remove(roadmap.roadmapId);
      qc.invalidateQueries({ queryKey: ['roadmaps', 'me'] });
      toast.success('Roadmap removed');
      onRemove();
    } catch {
      toast.error('Failed to remove roadmap');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Compact Roadmap Stats */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between px-2 bg-brand-50/50 py-3 rounded-lg ring-1 ring-brand-200/60"
      >
        <div className="flex gap-6 text-sm text-brand-600 font-medium px-4 flex-wrap">
          <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-brand-400" /> {roadmap.percentComplete}% Complete</span>
          <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> {roadmap.completedTopics}/{roadmap.totalTopics} topics</span>
          <span className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-brand-400" /> {roadmap.domain.stages.length} stages</span>
          <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-brand-400" /> ~{roadmap.domain.estimatedMonths} months</span>
        </div>
        <button
          onClick={handleRemove}
          disabled={removing}
          className="text-red-500 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors mr-1 flex-shrink-0"
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Remove Path
        </button>
      </motion.div>

      {/* Center alternating timeline */}
      <div className="relative py-8">
        {/* Vertical line — center on desktop, left on mobile */}
        <div className="career-timeline-line absolute left-4 md:left-1/2 top-0 bottom-0 w-1.5 bg-brand-200 md:-translate-x-1/2 z-0 rounded-full overflow-hidden">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${roadmap.percentComplete}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="w-full bg-blue-500 keep-color"
          />
        </div>

        <div className="space-y-0">
          {roadmap.domain.stages.map((stage, si) => {
            const side = si % 2 === 0 ? 'right' : 'left';
            const color = STAGE_COLORS[si % STAGE_COLORS.length];
            const completedCount = stage.topics.filter((_, ti) => completedSet.has(`${si}-${ti}`)).length;
            const stageCompleted = completedCount === stage.topics.length && stage.topics.length > 0;
            const nodeColor = stageCompleted ? '#10b981' : color.hex;

            return (
              <motion.div
                key={si}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: si * 0.08, duration: 0.4 }}
                className="career-timeline-row relative flex flex-col md:flex-row md:items-center md:justify-center md:min-h-[300px] pl-10 md:pl-0 pb-6 md:pb-12"
              >
                {/* Left slot — hidden on mobile when side is right, full-width vertical on mobile */}
                <div className="flex-1 flex justify-start md:justify-end pr-0 md:pr-10 w-full md:w-auto order-2 md:order-none">
                  {side === 'left' && (
                    <StagePanel
                      stage={stage}
                      stageIndex={si}
                      side="left"
                      completedSet={completedSet}
                      onToggleTopic={(sI, tI, c) => toggleMutation.mutate({ stageIndex: sI, topicIndex: tI, completed: c })}
                      pendingKey={pendingKey}
                      color={color}
                      stageCompleted={stageCompleted}
                    />
                  )}
                </div>

                {/* Center node */}
                <div className="career-timeline-node flex-shrink-0 flex flex-col items-start md:items-center z-10 order-1 md:order-none self-start md:self-center ml-6 md:ml-0 mb-3 md:mb-0 w-full md:w-auto">
                  {/* Stage pill node */}
                  <motion.div
                    layout
                    animate={{
                      backgroundColor: stageCompleted ? '#10b981' : '#ffc107',
                      boxShadow: '6px 6px 0px #0f172a',
                    }}
                    transition={{ duration: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
                    whileHover={{ scale: 1.05, x: -2, y: -2, boxShadow: '8px 8px 0px #0f172a' }}
                    className="rounded-lg px-6 py-5 text-center cursor-default border-[3px] border-slate-900 z-10 keep-color"
                    style={{ minWidth: 170 }}
                  >
                    <motion.p
                      animate={{ opacity: 1 }}
                      className="text-brand-900/80 text-[11px] font-black uppercase tracking-widest"
                    >
                      {stageCompleted ? '✓ Complete' : `Stage ${si + 1}`}
                    </motion.p>
                    <p className="text-brand-900 text-base font-black leading-tight mt-1.5">
                      {stage.title}
                    </p>
                  </motion.div>
                </div>

                {/* Right slot */}
                <div className="flex-1 flex justify-start md:pl-10 pl-0 w-full md:w-auto order-2 md:order-none">
                  {side === 'right' && (
                    <StagePanel
                      stage={stage}
                      stageIndex={si}
                      side="right"
                      completedSet={completedSet}
                      onToggleTopic={(sI, tI, c) => toggleMutation.mutate({ stageIndex: sI, topicIndex: tI, completed: c })}
                      pendingKey={pendingKey}
                      color={color}
                      stageCompleted={stageCompleted}
                    />
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* End marker */}
        <div className="flex justify-center relative z-10 pb-4">
          <motion.div
            whileHover={{ scale: 1.05, x: -2, y: -2, boxShadow: '8px 8px 0px #0f172a' }}
            className="flex items-center gap-2.5 rounded-lg bg-[#10b981] text-white px-7 py-3.5 font-black uppercase tracking-wider border-[3px] border-slate-900 shadow-[6px_6px_0px_#0f172a] cursor-default"
          >
            <CheckCircle2 className="h-5 w-5" /> Journey Complete!
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────
export default function CareerAIslePage() {
  const qc = useQueryClient();
  const location = useLocation();
  const [showPicker, setShowPicker] = useState(false);
  const [showResumeAnalyzer, setShowResumeAnalyzer] = useState(false);
  const [enrolling, setEnrolling] = useState(null);
  const [activeTab, setActiveTab] = useState(location.state?.roadmapId || null);

  const { data: domains = [] } = useQuery({
    queryKey: ['roadmaps', 'domains'],
    queryFn: roadmapService.listDomains,
    staleTime: Infinity,
  });

  const { data: myRoadmaps = [], isLoading } = useQuery({
    queryKey: ['roadmaps', 'me'],
    queryFn: roadmapService.getMyRoadmaps,
  });

  const enrolledIds = useMemo(() => new Set(myRoadmaps.map((r) => r.domainId)), [myRoadmaps]);

  const activeRoadmap = myRoadmaps.find((r) => r.roadmapId === activeTab) ?? myRoadmaps[0] ?? null;

  const handleEnroll = async (domainId) => {
    setEnrolling(domainId);
    try {
      const result = await roadmapService.enroll(domainId);
      await qc.invalidateQueries({ queryKey: ['roadmaps', 'me'] });
      setActiveTab(result.roadmap_id);
      toast.success('Career path added! Let\'s go ');
      setShowPicker(false);
    } catch (err) {
      toast.error(err.message || 'Failed to enroll');
    } finally {
      setEnrolling(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header — frosted glass card */}
      <div className="bg-white/60 backdrop-blur-lg rounded-2xl p-5 shadow-sm ring-1 ring-white/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-brand-600 flex items-center justify-center shadow-md">
                <Map className="h-5 w-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-brand-900">CareerAIsle</h1>
            </div>
            <p className="text-sm text-brand-500 mt-1 ml-[44px]">Structured, stage-by-stage career learning paths</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowResumeAnalyzer(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold shadow-soft-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all"
            >
              <FileText className="h-4 w-4" />
              Scan Resume with AI
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowPicker(true)}
              className="btn-primary flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Career Path
            </motion.button>
          </div>
        </div>
      </div>

      {/* Roadmap tabs */}
      {myRoadmaps.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {myRoadmaps.map((rm) => {
            const DIcon = DOMAIN_ICONS[rm.domainId] ?? Globe;
            const isActive = activeRoadmap?.roadmapId === rm.roadmapId;
            return (
              <motion.button
                key={rm.roadmapId}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab(rm.roadmapId)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'bg-white ring-1 ring-brand-200 text-brand-600 hover:ring-brand-300'
                }`}
              >
                <DIcon className="h-4 w-4" />
                <span>{rm.domainTitle}</span>
                <span className={`text-xs font-medium ${isActive ? 'opacity-70' : 'text-brand-400'}`}>
                  {rm.percentComplete}%
                </span>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {myRoadmaps.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-14 text-center space-y-4"
        >
          <div className="h-16 w-16 rounded-3xl bg-brand-50 flex items-center justify-center mx-auto">
            <Map className="h-8 w-8 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-brand-900">Start your career journey</h2>
          <p className="text-sm text-brand-500 max-w-md mx-auto">
            Pick a career domain and get a structured stage-by-stage roadmap with topics, projects, and curated resources.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-2">
            {domains.slice(0, 7).map((d) => {
              const DIcon = DOMAIN_ICONS[d.id] ?? Globe;
              return (
                <button
                  key={d.id}
                  onClick={() => setShowPicker(true)}
                  className="flex items-center gap-1.5 rounded-full bg-brand-100 text-brand-700 text-xs font-medium px-3 py-1.5 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  <DIcon className="h-3.5 w-3.5" /> {d.title}
                </button>
              );
            })}
          </div>
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowPicker(true)}
            className="btn-primary mt-2 inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" /> Browse All Career Paths
          </motion.button>
        </motion.div>
      )}

      {/* Active roadmap timeline */}
      {activeRoadmap && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeRoadmap.roadmapId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <RoadmapTimeline
              roadmap={activeRoadmap}
              onRemove={() => setActiveTab(myRoadmaps.find((r) => r.roadmapId !== activeRoadmap.roadmapId)?.roadmapId ?? null)}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Domain picker modal */}
      <AnimatePresence>
        {showPicker && (
          <DomainPickerModal
            domains={domains}
            enrolledIds={enrolledIds}
            onEnroll={handleEnroll}
            onClose={() => setShowPicker(false)}
            enrolling={enrolling}
          />
        )}
      </AnimatePresence>

      {/* AI Resume Gap Analyzer Modal */}
      <AnimatePresence>
        {showResumeAnalyzer && (
          <ResumeGapAnalyzerModal
            domains={domains}
            enrolledRoadmaps={myRoadmaps}
            onClose={() => setShowResumeAnalyzer(false)}
            onSynced={() => qc.invalidateQueries({ queryKey: ['roadmaps', 'me'] })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
