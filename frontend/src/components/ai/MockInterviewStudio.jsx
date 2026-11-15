import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiService } from '../../services/ai.service.js';
import toast from 'react-hot-toast';
import {
  Mic, Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowRight,
  ChevronLeft, ChevronRight, Award, Trophy, RotateCcw, Brain,
  MessageSquare, FileText, Check, ListChecks
} from 'lucide-react';

const SUGGESTED_ROLES = [
  'Frontend Engineer',
  'Backend Developer',
  'Full-Stack Developer',
  'AI / Machine Learning Engineer',
  'Android Developer',
  'DevOps & Cloud Engineer',
];

export function MockInterviewStudio() {
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState(SUGGESTED_ROLES[0]);
  const [customRole, setCustomRole] = useState('');
  const [activeSession, setActiveSession] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState(['', '', '']);
  const [evaluationResult, setEvaluationResult] = useState(null);

  // Fetch past interview history
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['mock-interviews'],
    queryFn: () => aiService.listInterviews(),
  });

  // Start interview mutation
  const startMutation = useMutation({
    mutationFn: (roleTitle) => aiService.startInterview({ roleTitle }),
    onSuccess: (data) => {
      setActiveSession(data);
      setCurrentQIndex(0);
      setAnswers(new Array(data.questions?.length || 3).fill(''));
      setEvaluationResult(null);
      toast.success('Interview session prepared! Good luck.');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to start interview');
    },
  });

  // Submit interview mutation
  const submitMutation = useMutation({
    mutationFn: ({ id, answers }) => aiService.submitInterview(id, answers),
    onSuccess: (data) => {
      setEvaluationResult(data);
      queryClient.invalidateQueries({ queryKey: ['mock-interviews'] });
      toast.success('Interview evaluation complete!');
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to evaluate interview');
    },
  });

  const handleStart = () => {
    const role = customRole.trim() || selectedRole;
    startMutation.mutate(role);
  };

  const handleAnswerChange = (text) => {
    const next = [...answers];
    next[currentQIndex] = text;
    setAnswers(next);
  };

  const handleSubmit = () => {
    const unanswered = answers.some((a) => !a.trim());
    if (unanswered) {
      if (!window.confirm('Some questions are unanswered. Are you sure you want to submit?')) return;
    }
    submitMutation.mutate({ id: activeSession.id, answers });
  };

  const handleReset = () => {
    setActiveSession(null);
    setEvaluationResult(null);
    setAnswers(['', '', '']);
  };

  // Render Result View
  if (evaluationResult) {
    const fb = evaluationResult.feedback || {};
    const evals = fb.evaluations || [];
    const scoreColor = evaluationResult.overallScore >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' :
      evaluationResult.overallScore >= 60 ? 'text-amber-600 bg-amber-50 border-amber-200' :
      'text-red-600 bg-red-50 border-red-200';

    return (
      <div className="card p-6 space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-brand-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge badge-blue">{evaluationResult.roleTitle}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${scoreColor}`}>
                {fb.readinessLevel || 'Evaluated'}
              </span>
            </div>
            <h3 className="text-xl font-bold text-brand-900 mt-2">Interview Performance Report</h3>
            <p className="text-sm text-brand-500 mt-1">{fb.summary || 'Detailed feedback on your responses.'}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-3xl font-extrabold text-brand-900">{evaluationResult.overallScore}</span>
              <span className="text-sm font-semibold text-brand-400">/100</span>
              <p className="text-xs text-brand-400">Readiness Score</p>
            </div>
            <button onClick={handleReset} className="btn-secondary flex items-center gap-1.5 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Practice Again
            </button>
          </div>
        </div>

        {/* Detailed Question Evaluations */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-brand-900 uppercase tracking-wide">Question-by-Question Feedback</h4>
          {evals.map((item, idx) => {
            const q = activeSession?.questions?.[idx];
            return (
              <div key={idx} className="card p-4 bg-brand-50/50 border border-brand-100 rounded-lg space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-brand-500">Question {idx + 1} ({q?.kind?.replace('_', ' ') || 'General'})</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-brand-100 text-brand-700">Score: {item.score}/100</span>
                </div>
                <p className="text-sm font-semibold text-brand-900">{q?.q}</p>
                <div className="p-3 bg-white rounded border border-brand-100 text-xs text-brand-700 italic">
                  "{answers[idx] || '(No answer provided)'}"
                </div>
                <p className="text-xs text-brand-600 font-medium">{item.feedback}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {item.strengths?.length > 0 && (
                    <div className="p-2.5 rounded bg-emerald-50/70 border border-emerald-100 text-xs">
                      <p className="font-bold text-emerald-800 flex items-center gap-1 mb-1">
                        <Check className="h-3.5 w-3.5" /> Strengths
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-emerald-700">
                        {item.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {item.improvements?.length > 0 && (
                    <div className="p-2.5 rounded bg-amber-50/70 border border-amber-100 text-xs">
                      <p className="font-bold text-amber-800 flex items-center gap-1 mb-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Next Steps
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-amber-700">
                        {item.improvements.map((im, i) => <li key={i}>{im}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Active Session View
  if (activeSession) {
    const q = activeSession.questions?.[currentQIndex];
    const totalQ = activeSession.questions?.length || 3;
    const progress = Math.round(((currentQIndex + 1) / totalQ) * 100);

    return (
      <div className="card p-6 space-y-5 animate-fade-in">
        {/* Session Header */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-brand-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge badge-blue">{activeSession.roleTitle}</span>
              <span className="text-xs font-semibold text-brand-500 uppercase tracking-wide">
                Question {currentQIndex + 1} of {totalQ}
              </span>
            </div>
            <h3 className="text-lg font-bold text-brand-900 mt-1">{q?.expectedCompetency || 'Technical Evaluation'}</h3>
          </div>
          <button onClick={handleReset} className="text-xs text-brand-400 hover:text-red-500 transition-colors">
            Exit Session
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-brand-100 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Question Prompt */}
        <div className="p-4 bg-brand-50 rounded-lg border border-brand-100 space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-accent-dark">
            {q?.kind?.replace('_', ' ')} Question
          </span>
          <p className="text-base font-semibold text-brand-900">{q?.q}</p>
          {q?.hint && (
            <p className="text-xs text-brand-500 flex items-center gap-1.5 pt-1">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Hint: {q.hint}</span>
            </p>
          )}
        </div>

        {/* Answer Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-brand-700 flex items-center justify-between">
            <span>Your Response:</span>
            <span className="text-[11px] font-normal text-brand-400">
              {answers[currentQIndex]?.length || 0} characters
            </span>
          </label>
          <textarea
            rows={6}
            value={answers[currentQIndex] || ''}
            onChange={(e) => handleAnswerChange(e.target.value)}
            placeholder="Type your response here. Use concrete examples, technical decisions, and measurable outcomes..."
            className="input w-full p-3 text-sm resize-none font-sans leading-relaxed"
          />
          <p className="text-[11px] text-brand-400">
            Tip: Frame answers using the STAR method — Situation, Task, Action, and Result.
          </p>
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-brand-100">
          <button
            onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentQIndex === 0}
            className="btn-secondary btn-sm flex items-center gap-1 disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>

          {currentQIndex < totalQ - 1 ? (
            <button
              onClick={() => setCurrentQIndex((prev) => Math.min(totalQ - 1, prev + 1))}
              className="btn-primary btn-sm flex items-center gap-1"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="btn-primary btn-sm flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Evaluating...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Submit Interview
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Initial Setup / Start View
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Intro Hero */}
      <div className="card p-6 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 text-white relative overflow-hidden">
        <div className="relative z-10 max-w-xl space-y-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent text-brand-900">
            AI Interview Simulator
          </span>
          <h2 className="text-2xl font-bold text-white tracking-tight">Interactive Mock Interview Studio</h2>
          <p className="text-sm text-white/80 leading-relaxed">
            Practice realistic technical and behavioral interviews tailored to your target roles. Receive immediate scoring, competency breakdowns, and actionable feedback.
          </p>
        </div>
        <div className="absolute right-4 bottom-2 opacity-10 pointer-events-none">
          <Brain className="h-48 w-48 text-white" />
        </div>
      </div>

      {/* Role Picker Card */}
      <div className="card p-6 space-y-4">
        <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wide">Select Target Role</h3>
        <div className="flex flex-wrap gap-2">
          {SUGGESTED_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                setSelectedRole(role);
                setCustomRole('');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                selectedRole === role && !customRole
                  ? 'bg-accent text-brand-900 shadow-sm'
                  : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        <div className="pt-2">
          <label className="text-xs font-medium text-brand-600 block mb-1">Or enter a custom role:</label>
          <input
            type="text"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
            placeholder="e.g. Senior Distributed Systems Engineer"
            className="input w-full text-xs py-2"
          />
        </div>

        <div className="pt-3 flex justify-end">
          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {startMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparing Interview...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Start Interview Session
              </>
            )}
          </button>
        </div>
      </div>

      {/* Past History */}
      {historyData?.items?.length > 0 && (
        <div className="card p-5 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-brand-500">Past Practice Sessions</h4>
          <div className="divide-y divide-brand-100">
            {historyData.items.map((session) => (
              <div key={session.id} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-brand-900">{session.roleTitle}</p>
                  <p className="text-xs text-brand-400">
                    {new Date(session.createdAt).toLocaleDateString()} · {session.status === 'COMPLETED' ? 'Completed' : 'In Progress'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-extrabold text-brand-900">{session.overallScore}/100</span>
                  <button
                    onClick={() => {
                      setActiveSession(session);
                      setEvaluationResult(session.status === 'COMPLETED' ? session : null);
                    }}
                    className="btn-secondary btn-sm text-xs"
                  >
                    View Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
