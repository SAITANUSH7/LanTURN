import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiService } from '../../services/ai.service.js';
import { SkillMedalBadge, MEDAL_CONFIG } from '../ui/SkillMedalBadge.jsx';
import toast from 'react-hot-toast';
import {
  Trophy, Loader2, ChevronRight, RotateCcw, ArrowRight,
  CheckCircle2, XCircle, Sparkles, Target, ChevronLeft,
} from 'lucide-react';

/* ── Skill catalog ───────────────────────────────────────────── */
const POPULAR_SKILLS = [
  'React', 'Java', 'Python', 'JavaScript', 'Node.js', 'TypeScript',
  'C++', 'C', 'SQL', 'MongoDB', 'Spring Boot', 'Django',
  'Flutter', 'AWS', 'Docker', 'Kubernetes', 'Go', 'Rust',
  'HTML/CSS', 'Angular', 'Vue.js', 'Next.js', 'Express.js',
  'Machine Learning', 'Data Structures', 'System Design',
  'Git', 'Linux', 'REST APIs', 'GraphQL',
];

/* ── Tier config ─────────────────────────────────────────────── */
function getTierInfo(rating) {
  if (rating >= 90) return { tier: 'gold', label: 'Expert', medal: '� Gold Medal', color: '#f59e0b' };
  if (rating >= 80) return { tier: 'silver', label: 'Advanced', medal: '� Silver Medal', color: '#8A8A8A' };
  if (rating >= 70) return { tier: 'bronze', label: 'Intermediate', medal: '� Bronze Medal', color: '#f97316' };
  return { tier: 'basic', label: 'Beginner', medal: '� Basic Medal', color: '#60a5fa' };
}

/* ── Step 1: Skill Selection ─────────────────────────────────── */
function SkillSelectStep({ onSelect }) {
  const [custom, setCustom] = useState('');

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="text-center">
        <div
          className="h-14 w-14 rounded-lg mx-auto flex items-center justify-center mb-3"
          style={{ background: 'linear-gradient(135deg,#333333,#4A4A4A)' }}
        >
          <Trophy className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-lg font-bold text-brand-900">Choose Your Skill</h3>
        <p className="text-sm text-brand-500 mt-1">Select a skill to test your knowledge and earn a medal</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {POPULAR_SKILLS.map(skill => (
          <button
            key={skill}
            type="button"
            onClick={() => onSelect(skill)}
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-white ring-1 ring-brand-200 text-brand-700 hover:ring-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-all active:scale-95"
          >
            {skill}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-brand-200" />
        <span className="text-xs text-brand-400 font-medium">or type your own</span>
        <div className="h-px flex-1 bg-brand-200" />
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="e.g. Solidity, Figma, Terraform…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && custom.trim() && onSelect(custom.trim())}
        />
        <button
          onClick={() => custom.trim() && onSelect(custom.trim())}
          disabled={!custom.trim()}
          className="btn-primary px-4"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Self-Rating ─────────────────────────────────────── */
function RatingStep({ skill, onBack, onStart }) {
  const [rating, setRating] = useState(50);
  const tierInfo = getTierInfo(rating);

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Change skill
      </button>

      <div className="text-center">
        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 text-brand-700 font-semibold text-sm mb-3">
          <Target className="h-4 w-4" />
          {skill}
        </span>
        <h3 className="text-lg font-bold text-brand-900">Rate Your Proficiency</h3>
        <p className="text-sm text-brand-500 mt-1">How well do you know {skill}? Be honest — questions are generated based on this.</p>
      </div>

      {/* Large score display */}
      <div className="flex flex-col items-center gap-2">
        <div
          className="text-6xl font-black tabular-nums transition-colors duration-200"
          style={{ color: tierInfo.color }}
        >
          {rating}
        </div>
        <span className="text-sm font-medium text-brand-500">out of 100</span>
      </div>

      {/* Slider */}
      <div className="px-2">
        <input
          type="range"
          min={0}
          max={100}
          value={rating}
          onChange={e => setRating(parseInt(e.target.value))}
          className="w-full h-2 bg-brand-200 rounded-full appearance-none cursor-pointer accent-brand-600"
          style={{
            background: `linear-gradient(to right, ${tierInfo.color} 0%, ${tierInfo.color} ${rating}%, #D4D4D4 ${rating}%, #D4D4D4 100%)`,
          }}
        />
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-brand-400">0</span>
          <span className="text-[10px] text-brand-400">100</span>
        </div>
      </div>

      {/* Tier indicator */}
      <div
        className="rounded-lg p-4 text-center"
        style={{
          background: `linear-gradient(135deg, ${tierInfo.color}10, ${tierInfo.color}08)`,
          border: `1px solid ${tierInfo.color}30`,
        }}
      >
        <p className="text-sm font-bold" style={{ color: tierInfo.color }}>
          {tierInfo.label} Tier
        </p>
        <p className="text-xs text-brand-500 mt-0.5">
          Pass all 3 questions to earn: {tierInfo.medal}
        </p>
      </div>

      <button
        onClick={() => onStart(rating)}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
      >
        <Sparkles className="h-4 w-4" />
        Start Test
      </button>
    </div>
  );
}

/* ── Step 3: Questions & Answers ─────────────────────────────── */
function TestStep({ skill, rating, questions, tier, onBack, onSubmit, isSubmitting }) {
  const [answers, setAnswers] = useState(questions.map(() => ''));
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const allFilled = answers.every(a => a.trim().length >= 10);

  const handleSubmit = () => {
    const payload = questions.map((q, i) => ({
      question: q.question,
      answer: answers[i].trim(),
    }));
    onSubmit(payload);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full bg-brand-50 text-brand-700 font-semibold text-xs">{skill}</span>
          <span className="text-xs font-mono text-brand-400 tabular-nums">
            {mins}:{secs.toString().padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Questions */}
      {questions.map((q, i) => (
        <div key={q.id} className="rounded-lg bg-brand-50 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span
              className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#333333,#4A4A4A)' }}
            >
              {i + 1}
            </span>
            <p className="text-sm font-medium text-brand-800 leading-relaxed pt-0.5">{q.question}</p>
          </div>
          <textarea
            className="input min-h-[100px] resize-y text-sm"
            placeholder="Type your answer here… (minimum 10 characters)"
            value={answers[i]}
            onChange={e => {
              const newAnswers = [...answers];
              newAnswers[i] = e.target.value;
              setAnswers(newAnswers);
            }}
            disabled={isSubmitting}
          />
          <div className="flex justify-end">
            <span className={`text-[10px] font-medium ${answers[i].trim().length >= 10 ? 'text-emerald-500' : 'text-brand-400'}`}>
              {answers[i].trim().length} chars
            </span>
          </div>
        </div>
      ))}

      <button
        onClick={handleSubmit}
        disabled={!allFilled || isSubmitting}
        className="btn-primary w-full flex items-center justify-center gap-2 py-3"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Evaluating answers…
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Submit Answers
          </>
        )}
      </button>
    </div>
  );
}

/* ── Result View ─────────────────────────────────────────────── */
function ResultView({ skill, result, onRetry, onNewSkill }) {
  const { passed, medal, score, results } = result;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Medal display */}
      <div className="text-center py-4">
        {passed ? (
          <>
            <div className="text-6xl mb-3" style={{ animation: 'pulse 1s ease-in-out' }}>
              {MEDAL_CONFIG[medal]?.emoji || '�'}
            </div>
            <h3 className="text-xl font-bold text-brand-900">Congratulations!</h3>
            <p className="text-sm text-brand-600 mt-1">
              You earned a <strong>{MEDAL_CONFIG[medal]?.label || medal}</strong> Medal in <strong>{skill}</strong>!
            </p>
            <div className="mt-3">
              <SkillMedalBadge skill={skill} medal={medal} size="lg" />
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3"></div>
            <h3 className="text-xl font-bold text-brand-900">Not Quite!</h3>
            <p className="text-sm text-brand-600 mt-1">
              You scored <strong>{score}</strong>. Study the feedback below and try again!
            </p>
          </>
        )}
      </div>

      {/* Per-question breakdown */}
      <div className="space-y-3">
        {results.map((r, i) => (
          <div
            key={r.questionId}
            className="rounded-lg p-4"
            style={{
              background: r.correct
                ? 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))'
                : 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))',
              border: r.correct ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              {r.correct ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="text-sm font-semibold text-brand-800">
                Question {r.questionId}: {r.correct ? 'Correct' : 'Incorrect'}
              </span>
            </div>
            <p className="text-sm text-brand-600 leading-relaxed">{r.feedback}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="btn-secondary flex-1 flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Retry {skill}
        </button>
        <button
          onClick={onNewSkill}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          <Trophy className="h-4 w-4" />
          New Skill
        </button>
      </div>
    </div>
  );
}

/* ── Earned Medals Strip ─────────────────────────────────────── */
function MedalsStrip() {
  const { data: medals } = useQuery({
    queryKey: ['skillMedals'],
    queryFn: aiService.getSkillMedals,
    retry: false,
  });

  if (!medals?.length) return null;

  return (
    <div className="rounded-lg bg-brand-50 p-4 space-y-2.5">
      <p className="text-xs font-semibold text-brand-500 uppercase tracking-wider flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5" />
        Your Medals
      </p>
      <div className="flex flex-wrap gap-2">
        {medals.map(m => (
          <SkillMedalBadge key={m.skill} skill={m.skill} medal={m.medal} />
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export function SkillTestArena() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState('select'); // select | rate | test | result
  const [skill, setSkill] = useState('');
  const [rating, setRating] = useState(50);
  const [questions, setQuestions] = useState([]);
  const [tier, setTier] = useState('');
  const [evalResult, setEvalResult] = useState(null);

  const generateMutation = useMutation({
    mutationFn: (body) => aiService.generateSkillTest(body),
    onSuccess: (data) => {
      setQuestions(data.questions);
      setTier(data.tier);
      setStep('test');
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || err.message || 'Failed to generate test'),
  });

  const evaluateMutation = useMutation({
    mutationFn: (body) => aiService.evaluateSkillTest(body),
    onSuccess: (data) => {
      setEvalResult(data);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['skillMedals'] });
      queryClient.invalidateQueries({ queryKey: ['student', 'me'] });
    },
    onError: (err) => toast.error(err.response?.data?.error?.message || err.message || 'Evaluation failed'),
  });

  const handleSkillSelect = (selectedSkill) => {
    setSkill(selectedSkill);
    setStep('rate');
  };

  const handleStartTest = (selectedRating) => {
    setRating(selectedRating);
    generateMutation.mutate({ skill, rating: selectedRating });
  };

  const handleSubmitAnswers = (answersPayload) => {
    evaluateMutation.mutate({ skill, rating, questions: answersPayload });
  };

  const handleRetry = () => {
    setEvalResult(null);
    setQuestions([]);
    setStep('rate');
  };

  const handleNewSkill = () => {
    setSkill('');
    setRating(50);
    setQuestions([]);
    setEvalResult(null);
    setStep('select');
  };

  return (
    <div className="space-y-5">
      {/* Earned medals (always visible) */}
      <MedalsStrip />

      {/* Loading state for question generation */}
      {generateMutation.isPending && (
        <div className="flex flex-col items-center gap-4 py-12 animate-fade-in">
          <div className="relative">
            <Loader2 className="h-10 w-10 text-brand-600 animate-spin" />
            <Sparkles className="h-4 w-4 text-brand-400 absolute -top-1 -right-1" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-brand-900">Generating your {skill} test…</p>
            <p className="text-sm text-brand-500 mt-1">AI is crafting questions for your {getTierInfo(rating).label} level</p>
          </div>
        </div>
      )}

      {/* Steps */}
      {!generateMutation.isPending && (
        <>
          {step === 'select' && <SkillSelectStep onSelect={handleSkillSelect} />}
          {step === 'rate' && (
            <RatingStep
              skill={skill}
              onBack={() => setStep('select')}
              onStart={handleStartTest}
            />
          )}
          {step === 'test' && (
            <TestStep
              skill={skill}
              rating={rating}
              questions={questions}
              tier={tier}
              onBack={() => setStep('rate')}
              onSubmit={handleSubmitAnswers}
              isSubmitting={evaluateMutation.isPending}
            />
          )}
          {step === 'result' && evalResult && (
            <ResultView
              skill={skill}
              result={evalResult}
              onRetry={handleRetry}
              onNewSkill={handleNewSkill}
            />
          )}
        </>
      )}
    </div>
  );
}

export default SkillTestArena;
