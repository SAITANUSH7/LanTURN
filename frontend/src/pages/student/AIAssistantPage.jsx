import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { aiService } from '../../services/ai.service.js';
import { jobService } from '../../services/job.service.js';
import { studentService } from '../../services/student.service.js';
import { computeJobMatch } from './JobsPage.jsx';
import toast from 'react-hot-toast';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import {
  Sparkles, Send, MessageSquare, FileSearch, Target, Trophy,
  ChevronRight, Bot, User, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, Dna, Mic,
} from 'lucide-react';
import { CareerDNAPanel } from '../../components/ai/CareerDNAPanel.jsx';
import { SkillTestArena } from '../../components/ai/SkillTestArena.jsx';
import { MockInterviewStudio } from '../../components/ai/MockInterviewStudio.jsx';

/* ── Simple markdown renderer (bold, bullets, headers) ────── */
function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="space-y-1 pl-4 my-2">
          {listBuffer.map((item, i) => (
            <li key={i} className="list-disc text-brand-700 text-sm leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  function formatInline(str) {
    const parts = str.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-brand-900">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(<h4 key={i} className="text-sm font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(4))}</h4>);
    } else if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h3 key={i} className="text-base font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(3))}</h3>);
    } else if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h2 key={i} className="text-lg font-bold text-brand-900 mt-3 mb-1">{formatInline(trimmed.slice(2))}</h2>);
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+\.\s/, '');
      elements.push(
        <div key={i} className="flex gap-2 my-1">
          <span className="text-brand-600 font-bold text-sm flex-shrink-0">{trimmed.match(/^\d+/)[0]}.</span>
          <span className="text-sm text-brand-700 leading-relaxed">{formatInline(content)}</span>
        </div>
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listBuffer.push(trimmed.slice(2));
    } else if (trimmed === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={i} className="text-sm text-brand-700 leading-relaxed my-1">{formatInline(trimmed)}</p>);
    }
  }

  flushList();
  return elements;
}

// ─── Tab bar ─────────────────────────────────────────────────
const TABS = [
  { id: 'chat',      icon: MessageSquare, label: 'Career Chat' },
  { id: 'interview', icon: Mic,           label: 'Mock Interview' },
  { id: 'dna',       icon: Dna,           label: 'Career DNA' },
  { id: 'review',    icon: FileSearch,    label: 'Resume Review' },
  { id: 'match',     icon: Target,        label: 'Job Match' },
  { id: 'arena',     icon: Trophy,        label: 'Skill Arena' },
];

// ─── Score ring ───────────────────────────────────────────────
function ScoreRing({ score, size = 80, label = 'Score' }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
              fontSize="16" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-xs text-brand-500">{label}</span>
    </div>
  );
}

// ─── Career Chat tab ──────────────────────────────────────────
function ChatTab() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your AI Career Assistant. Ask me anything — interview tips, resume advice, career planning, or job market insights." }
  ]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState(null);
  const bottomRef = useRef(null);

  const chatMutation = useMutation({
    mutationFn: (msg) => aiService.careerChat({ message: msg, threadId: threadId || undefined, mode: 'career_guidance' }),
    onSuccess: (data) => {
      setThreadId(data.threadId);
      const text = typeof data.reply === 'string' ? data.reply : (data.reply?.content || data.reply?.text || '');
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    },
    onError: (err) => {
      toast.error(err.message || 'AI unavailable right now');
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ I ran into an error. Please try again.' }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;
    const msg = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    chatMutation.mutate(msg);
  };

  const SUGGESTIONS = [
    'How do I prepare for a system design interview?',
    'Review my elevator pitch for a software engineering role',
    'What are the most in-demand skills for 2025?',
    'Help me negotiate a job offer',
  ];

  return (
    <div className="flex flex-col h-[520px]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-brand-50 rounded-lg mb-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 items-end ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              m.role === 'assistant' ? 'bg-brand-100' : 'bg-brand-200'
            }`}>
              {m.role === 'assistant'
                ? <Bot className="h-3.5 w-3.5 text-brand-600" />
                : <User className="h-3.5 w-3.5 text-brand-600" />
              }
            </div>
            <div className={m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
              {m.role === 'assistant' ? (
                <div className="prose-sm">{renderMarkdown(m.content)}</div>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex gap-2 items-end">
            <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-brand-600" />
            </div>
            <div className="chat-bubble-ai flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
              <span className="text-brand-400 text-xs">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (only on first message) */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => { setInput(s); }}
              className="text-xs px-3 py-1.5 rounded-full bg-white ring-1 ring-brand-200 text-brand-600 hover:ring-brand-300 hover:text-brand-700 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ask me anything about your career..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={chatMutation.isPending}
        />
        <button
          onClick={handleSend}
          disabled={chatMutation.isPending || !input.trim()}
          className="btn-primary h-11 w-11 p-0 flex items-center justify-center flex-shrink-0 rounded-lg"
        >
          {chatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Resume Review tab ────────────────────────────────────────
function ResumeReviewTab() {
  const [result, setResult] = useState(null);
  const [targetRole, setTargetRole] = useState('');

  const geminiMutation = useMutation({
    mutationFn: () => aiService.reviewResume({ targetRole }),
    onSuccess: (data) => {
      setResult({ ...data, _source: 'gemini' });
      // Auto-fill the role field with the AI-predicted role if user left it empty
      if (!targetRole && data.predictedRole) {
        setTargetRole(data.predictedRole);
      }
    },
    onError: (err) => toast.error(err.message || 'AI review failed — check your Gemini API key'),
  });

  const isPending = geminiMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg bg-brand-50 space-y-3">
        <div>
          <label className="label">Target Role <span className="text-brand-400 font-normal">(auto-predicted from resume, edit if needed)</span></label>
          <input className="input" placeholder="Will be predicted from your resume…" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
        </div>
        <button
          onClick={() => geminiMutation.mutate()}
          disabled={isPending}
          className="btn-primary flex items-center gap-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          {isPending ? 'Analyzing...' : 'Analyze Resume'}
        </button>
      </div>

      {result && (
        <div className="space-y-4 animate-slide-up">
          {/* Score */}
          {(result.score !== undefined || result.ats_score !== undefined) && (
            <div className="card p-5 flex items-center gap-6">
              <ScoreRing score={result.score ?? result.ats_score ?? 0} label="Score" />
              <div>
                <p className="font-semibold text-brand-900">Resume Score</p>
                <p className="text-sm text-brand-500">Powered by Gemini AI</p>
                {result.predictedRole && (
                  <p className="text-xs text-brand-600 mt-1">🎯 Analyzed for: <span className="font-medium">{result.predictedRole}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Resume Keywords (extracted from resume) */}
          {result.resumeKeywords?.length > 0 && (
            <div className="card p-5">
              <p className="section-title mb-3 text-brand-700">🔑 Your Resume Keywords</p>
              <div className="flex flex-wrap gap-2">
                {result.resumeKeywords.map((k) => <span key={k} className="badge-brand">{k}</span>)}
              </div>
              <p className="text-xs text-brand-400 mt-2">These keywords were extracted from your resume and sent to AI for scoring</p>
            </div>
          )}

          {/* Strengths */}
          {result.strengths?.length > 0 && (
            <div className="card p-5">
              <p className="section-title mb-3 text-emerald-700">✅ Strengths</p>
              <ul className="space-y-1">
                {result.strengths.map((s, i) => <li key={i} className="text-sm text-brand-700 flex gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />{s}</li>)}
              </ul>
            </div>
          )}

          {/* Weaknesses / suggestions */}
          {(result.weaknesses?.length > 0 || result.suggestions?.length > 0) && (
            <div className="card p-5">
              <p className="section-title mb-3 text-amber-700">⚠️ Improvements</p>
              <ul className="space-y-1">
                {(result.weaknesses || []).map((w, i) => <li key={i} className="text-sm text-brand-700 flex gap-2"><AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />{w}</li>)}
                {(result.suggestions || []).map((s, i) => <li key={i} className="text-sm text-brand-700 flex gap-2"><ChevronRight className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" /><span><b>{s.area}</b>: {s.fix}</span></li>)}
              </ul>
            </div>
          )}

          {/* Missing keywords */}
          {result.keywordsMissing?.length > 0 && (
            <div className="card p-5">
              <p className="section-title mb-3 text-red-700">🔍 Missing Keywords</p>
              <p className="text-xs text-brand-500 mb-2">Add these keywords to your resume to improve your score</p>
              <div className="flex flex-wrap gap-2">
                {result.keywordsMissing.map((k) => <span key={k} className="badge-red">{k}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Job Match tab ────────────────────────────────────────────
function JobMatchTab() {
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState(null);

  const { data: jobs } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobService.list({ limit: 50 }),
  });

  const { data: studentProfile } = useQuery({
    queryKey: ['studentProfile', 'me'],
    queryFn: () => studentService.getMe(),
  });

  const geminiMutation = useMutation({
    mutationFn: () => aiService.matchJob({ jobId }),
    onSuccess: (data) => setResult({ ...data, _source: 'gemini' }),
    onError: (err) => toast.error(err.message || 'Match failed'),
  });

  const isPending = geminiMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-lg bg-brand-50 space-y-3">
        <div>
          <label className="label">Select a Job</label>
          <select className="select" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            <option value="">-- Choose job --</option>
            {(jobs?.items || []).map((j) => (
              <option key={j.jobId} value={j.jobId}>{j.title} — {j.companyName}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => geminiMutation.mutate()}
          disabled={isPending || !jobId}
          className="btn-primary flex items-center gap-2"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
          {isPending ? 'Matching...' : 'Match Resume to Job'}
        </button>
      </div>

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="card p-5 flex items-center gap-6">
            {(() => {
              const selectedJob = jobs?.items?.find((j) => j.jobId === jobId);
              const localMatchInfo = selectedJob && studentProfile ? computeJobMatch(selectedJob, studentProfile) : null;
              const displayScore = localMatchInfo ? localMatchInfo.score : (result.matchScore ?? result.score ?? 0);
              return <ScoreRing score={displayScore} label="Match" />;
            })()}
            <div>
              <p className="font-semibold text-brand-900">Resume Match Score</p>
              {result.experienceFit && (
                <span className={`badge mt-1 ${result.experienceFit === 'strong' ? 'badge-green' : result.experienceFit === 'partial' ? 'badge-yellow' : 'badge-red'}`}>
                  {result.experienceFit} experience fit
                </span>
              )}
            </div>
          </div>

          {result.summary && (
            <div className="card p-5">
              <p className="section-title mb-2">Summary</p>
              <p className="text-sm text-brand-700">{result.summary}</p>
            </div>
          )}

          {result.matchedSkills?.length > 0 && (
            <div className="card p-5">
              <p className="section-title text-emerald-700 mb-3">✅ Matched Skills</p>
              <div className="flex flex-wrap gap-2">
                {result.matchedSkills.map((s) => <span key={s} className="badge-green">{s}</span>)}
              </div>
            </div>
          )}

          {result.missingSkills?.length > 0 && (
            <div className="card p-5">
              <p className="section-title text-red-700 mb-3">❌ Missing Skills</p>
              <div className="flex flex-wrap gap-2">
                {result.missingSkills.map((s) => <span key={s} className="badge-red">{s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
export default function AIAssistantPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'chat';
  const [tab, setTab] = useState(initialTab);

  const changeTab = (newTab) => {
    setTab(newTab);
    setSearchParams({ tab: newTab }, { replace: true });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#333333,#4A4A4A)' }}>
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-900">AI Career Assistant</h1>
          <p className="text-sm text-brand-500">Powered by Gemini AI</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-brand-100">
        {TABS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => changeTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-white text-brand-900 shadow-sm' : 'text-brand-500 hover:text-brand-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="card p-5">
        {tab === 'chat'      && <ChatTab />}
        {tab === 'interview' && <MockInterviewStudio />}
        {tab === 'dna'       && <CareerDNAPanel />}
        {tab === 'review'    && <ResumeReviewTab />}
        {tab === 'match'     && <JobMatchTab />}
        {tab === 'arena'     && <SkillTestArena />}
      </div>
    </div>
  );
}
