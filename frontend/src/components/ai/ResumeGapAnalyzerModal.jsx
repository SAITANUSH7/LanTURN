import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, FileText, Loader2, Sparkles, CheckCircle2, AlertTriangle,
  ArrowRight, Zap, Target, BookOpen, TrendingUp, ChevronRight, Check,
  XCircle, RefreshCw, BarChart2
} from 'lucide-react';
import { roadmapService } from '../../services/roadmap.service.js';
import toast from 'react-hot-toast';

const STEPS = ['upload', 'scanning', 'results'];

export default function ResumeGapAnalyzerModal({ domains, enrolledRoadmaps, onClose, onSynced }) {
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Drag & drop handlers
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast.error('Please upload a PDF file');
    }
  }, []);

  const handleFileSelect = (e) => {
    const selected = e.target.files[0];
    if (selected?.type === 'application/pdf') setFile(selected);
    else if (selected) toast.error('Only PDF files are accepted');
  };

  // Analyze resume
  const handleAnalyze = async () => {
    if (!file || !selectedDomain) return;
    setStep('scanning');
    setAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);
      formData.append('domainId', selectedDomain);

      const data = await roadmapService.analyzeResume(formData);
      setResults(data);
      setStep('results');
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.');
      setStep('upload');
    } finally {
      setAnalyzing(false);
    }
  };

  // Sync matched topics to enrolled roadmap
  const handleSync = async () => {
    if (!results || syncDone) return;

    // Find the user's enrolled roadmap for this domain
    const enrollment = enrolledRoadmaps.find((r) => r.domainId === results.domainId);
    if (!enrollment) {
      toast.error('You need to enroll in this career path first before syncing progress.');
      return;
    }

    setSyncing(true);
    try {
      await roadmapService.syncResumeProgress(enrollment.roadmapId, results.matchedTopicKeys);
      setSyncDone(true);
      toast.success(`${results.matchedTopicKeys.length} topics synced to your roadmap! `);
      if (onSynced) onSynced();
    } catch (err) {
      toast.error(err.message || 'Failed to sync progress');
    } finally {
      setSyncing(false);
    }
  };

  // Score ring color
  const getScoreColor = (score) => {
    if (score >= 75) return { ring: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Excellent Match' };
    if (score >= 50) return { ring: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Good Match' };
    if (score >= 25) return { ring: '#f97316', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Partial Match' };
    return { ring: '#ef4444', bg: 'bg-red-50', text: 'text-red-700', label: 'Low Match' };
  };

  const getImportanceStyle = (importance) => {
    if (importance === 'critical') return 'bg-red-50 text-red-700 ring-1 ring-red-200';
    if (importance === 'important') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    return 'bg-brand-100 text-brand-600 ring-1 ring-brand-200';
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xl" onClick={onClose} />

      <motion.div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden border border-brand-200/80"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      >
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-violet-950 via-indigo-900 to-violet-950 text-white flex items-center justify-between flex-shrink-0 relative overflow-hidden">
          <div className="absolute top-0 right-1/3 w-80 h-80 bg-violet-500/15 blur-[100px] rounded-full pointer-events-none" />

          <div className="flex items-center gap-3.5 relative z-10">
            <div className="h-11 w-11 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-500 border border-violet-400/30 flex items-center justify-center text-white shadow-soft-lg shadow-violet-500/30">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                AI Resume Gap Analyzer
                <span className="text-[10px] font-extrabold bg-white/10 text-violet-300 px-2 py-0.5 rounded-full border border-white/10">
                  AI-Powered
                </span>
              </h2>
              <p className="text-xs text-violet-300 mt-0.5">
                Scan your resume against any career roadmap to find skill gaps
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="h-10 w-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-brand-300 hover:text-white transition-all transform hover:rotate-90 duration-300 relative z-10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Progress Indicator */}
        <div className="px-6 pt-4 pb-2 flex items-center gap-2 flex-shrink-0 bg-brand-50/80 border-b border-brand-200/60">
          {STEPS.map((s, i) => {
            const isActive = STEPS.indexOf(step) >= i;
            const isCurrent = step === s;
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all ${
                  isActive ? 'bg-violet-600 text-white shadow-soft-md shadow-violet-500/30' : 'bg-brand-200 text-brand-500'
                }`}>
                  {i + 1}
                </div>
                <span className={`text-xs font-bold capitalize ${isCurrent ? 'text-violet-700' : 'text-brand-400'}`}>
                  {s === 'upload' ? 'Upload & Select' : s === 'scanning' ? 'AI Scanning' : 'Gap Analysis'}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-brand-300 ml-auto" />}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {/* ─── STEP 1: Upload & Select ─── */}
            {step === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-5"
              >
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800">Analysis Failed</p>
                      <p className="text-xs text-red-600 mt-1">{error}</p>
                    </div>
                  </div>
                )}

                {/* PDF Drop Zone */}
                <div>
                  <label className="text-sm font-bold text-brand-800 mb-2 block">1. Upload your Resume (PDF)</label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                      dragging
                        ? 'border-violet-500 bg-violet-50/50 scale-[1.01]'
                        : file
                        ? 'border-emerald-400 bg-emerald-50/30'
                        : 'border-brand-300 hover:border-violet-400 hover:bg-violet-50/30'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {file ? (
                      <>
                        <div className="h-14 w-14 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-emerald-800">{file.name}</p>
                          <p className="text-xs text-emerald-600">{(file.size / 1024).toFixed(1)} KB • Ready for analysis</p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setFile(null); }}
                          className="text-xs text-brand-500 hover:text-red-500 font-semibold"
                        >
                          Remove & re-upload
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="h-14 w-14 rounded-lg bg-violet-100 flex items-center justify-center">
                          <Upload className="h-7 w-7 text-violet-600" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-brand-800">Drop your PDF resume here</p>
                          <p className="text-xs text-brand-500">or click to browse • Max 5 MB</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Target Role Selector */}
                <div>
                  <label className="text-sm font-bold text-brand-800 mb-2 block">2. Select Target Career Path</label>
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="input text-sm py-3 bg-brand-50 border-brand-200"
                  >
                    <option value="">Choose a career path to compare against...</option>
                    {domains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} — {d.category} ({d.totalTopics} topics)
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 2: AI Scanning Animation ─── */}
            {step === 'scanning' && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-16 space-y-6"
              >
                {/* Animated Scanner Ring */}
                <div className="relative h-32 w-32">
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-violet-200"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.2, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <motion.div
                    className="absolute inset-2 rounded-full border-4 border-violet-300"
                    animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.3, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
                  />
                  <motion.div
                    className="absolute inset-4 rounded-full border-4 border-violet-400"
                    animate={{ scale: [1, 1.06, 1], opacity: [0.7, 0.4, 0.7] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                  />
                  <div className="absolute inset-6 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center shadow-xl shadow-violet-500/30">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="h-10 w-10 text-white" />
                    </motion.div>
                  </div>
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-brand-900">Analyzing Your Resume</h3>
                  <p className="text-sm text-brand-500 max-w-sm">
                    AI is extracting skills from your resume and matching them against every topic in your target career roadmap...
                  </p>
                </div>

                <motion.div
                  className="flex items-center gap-2 text-xs font-bold text-violet-600 bg-violet-50 px-4 py-2 rounded-lg"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing PDF with Gemini AI...
                </motion.div>
              </motion.div>
            )}

            {/* ─── STEP 3: Results Dashboard ─── */}
            {step === 'results' && results && (
              <motion.div
                key="results"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {(() => {
                  const sc = getScoreColor(results.matchScore);
                  return (
                    <>
                      {/* Score Hero Card */}
                      <div className="bg-gradient-to-r from-slate-900 via-violet-950 to-slate-900 rounded-lg p-6 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-60 h-60 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

                        <div className="relative z-10 flex items-center gap-6">
                          {/* Score Ring */}
                          <div className="relative h-24 w-24 shrink-0">
                            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                              <motion.circle
                                cx="50" cy="50" r="42" fill="none" stroke={sc.ring} strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 42}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                                animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - results.matchScore / 100) }}
                                transition={{ duration: 1.2, ease: 'easeOut' }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-2xl font-black text-white">{results.matchScore}%</span>
                            </div>
                          </div>

                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                                {sc.label}
                              </span>
                            </div>
                            <h3 className="text-lg font-black">{results.domainTitle}</h3>
                            <p className="text-xs text-violet-300 mt-1">
                              {results.matchedTopicKeys.length} of {results.totalTopics} topics matched •{' '}
                              {results.totalStages} stages • {results.domainCategory}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="bg-violet-50/50 border border-violet-200/60 rounded-lg p-4">
                        <p className="text-xs font-bold text-violet-800 mb-1 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-violet-600" /> AI Summary
                        </p>
                        <p className="text-sm text-violet-900 leading-relaxed">{results.summary}</p>
                      </div>

                      {/* Extracted Skills */}
                      {results.extractedSkills?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-brand-800 mb-2 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            Skills Detected in Your Resume ({results.extractedSkills.length})
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {results.extractedSkills.map((skill, i) => (
                              <span key={i} className="text-xs font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-3 py-1 rounded-lg">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Missing Keywords */}
                      {results.missingKeywords?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-bold text-brand-800 mb-2 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                            Missing Skills & Gaps ({results.missingKeywords.length})
                          </h4>
                          <div className="space-y-2">
                            {results.missingKeywords.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-3 bg-white border border-brand-200/80 rounded-lg p-3"
                              >
                                <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${getImportanceStyle(item.importance)}`}>
                                  {item.importance}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-brand-800">{item.keyword}</p>
                                  <p className="text-xs text-brand-500 mt-0.5">{item.suggestion}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recommended Next Stage */}
                      <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200/60 rounded-lg p-4 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-soft-md shadow-violet-500/20">
                          <Target className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs font-extrabold text-violet-800">Recommended Next Focus</p>
                          <p className="text-sm font-bold text-violet-900">
                            Stage {results.recommendedStageIndex + 1} — Start learning the topics you're missing
                          </p>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white/90 backdrop-blur-md border-t border-brand-200/80 flex items-center justify-between flex-shrink-0">
          {step === 'upload' && (
            <>
              <button onClick={onClose} className="text-xs font-bold text-brand-600 hover:text-brand-900 px-4 py-2 rounded-lg hover:bg-brand-100 transition-colors">
                Cancel
              </button>
              <button
                disabled={!file || !selectedDomain || analyzing}
                onClick={handleAnalyze}
                className="btn-primary bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs px-6 py-2.5 rounded-lg shadow-soft-lg shadow-violet-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles className="h-4 w-4" /> Analyze with AI
              </button>
            </>
          )}

          {step === 'scanning' && (
            <div className="w-full text-center">
              <p className="text-xs text-brand-400 font-semibold">Please wait while AI processes your resume...</p>
            </div>
          )}

          {step === 'results' && (
            <>
              <button
                onClick={() => { setStep('upload'); setResults(null); setFile(null); setSelectedDomain(''); setSyncDone(false); setError(null); }}
                className="text-xs font-bold text-brand-600 hover:text-brand-900 px-4 py-2 rounded-lg hover:bg-brand-100 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Analyze Another
              </button>

              <div className="flex items-center gap-3">
                <button onClick={onClose} className="text-xs font-bold text-brand-500 hover:text-brand-700 px-3 py-2 rounded-lg hover:bg-brand-100 transition-colors">
                  Close
                </button>

                {results?.matchedTopicKeys?.length > 0 && (
                  <button
                    disabled={syncing || syncDone}
                    onClick={handleSync}
                    className={`btn-primary text-xs px-5 py-2.5 rounded-lg font-extrabold flex items-center gap-2 ${
                      syncDone
                        ? 'bg-emerald-500 hover:bg-emerald-600'
                        : 'bg-violet-600 hover:bg-violet-700 shadow-soft-lg shadow-violet-500/20'
                    }`}
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : syncDone ? (
                      <>
                        <Check className="h-4 w-4" /> Synced to Roadmap!
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" /> Sync {results.matchedTopicKeys.length} Topics to Roadmap
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
