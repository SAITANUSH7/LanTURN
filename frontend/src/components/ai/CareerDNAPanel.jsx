import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiService } from '../../services/ai.service.js';
import { RadarChart } from './RadarChart.jsx';
import { Modal } from '../ui/Modal.jsx';
import toast from 'react-hot-toast';
import {
  Dna, Loader2, Sparkles, CheckCircle2, AlertCircle, Lightbulb,
  TrendingUp, ChevronRight, RefreshCw
} from 'lucide-react';

function OverallScoreRing({ score, size = 96 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#10b981' : score >= 45 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-brand-900">{score}</span>
        <span className="text-[10px] uppercase tracking-wide text-brand-400 font-medium">Overall</span>
      </div>
    </div>
  );
}

function InsightList({ title, items, icon: Icon, tone = 'default' }) {
  const toneClass = {
    default: 'text-brand-900',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    info: 'text-brand-700',
  }[tone];

  return (
    <div className="card p-5">
      <p className={`section-title mb-3 flex items-center gap-2 ${toneClass}`}>
        <Icon className="h-4 w-4" />
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-brand-700 flex gap-2">
            <ChevronRight className="h-4 w-4 text-brand-300 flex-shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CareerDNAPanel() {
  const [result, setResult] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const dnaMutation = useMutation({
    mutationFn: () => aiService.careerDna(),
    onSuccess: (data) => {
      setResult(data);
      setSelectedIndex(null);
    },
    onError: (err) => toast.error(err.message || 'Career DNA analysis failed — upload a resume first'),
  });

  const { data: savedDna, isLoading: isFetchingSaved } = useQuery({
    queryKey: ['careerDna'],
    queryFn: () => aiService.getCareerDna(),
    retry: false,
  });

  useEffect(() => {
    if (savedDna && !result && !dnaMutation.isPending) {
      setResult(savedDna);
    }
  }, [savedDna, result, dnaMutation.isPending]);

  const selected = selectedIndex !== null ? result?.radarChart?.[selectedIndex] : null;

  return (
    <div className="space-y-6">
      {/* Intro + action */}
      <div className="p-5 rounded-lg bg-gradient-to-br from-brand-50 via-brand-50 to-fuchsia-50 ring-1 ring-brand-100">
        <div className="flex items-start gap-4">
          <div
            className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#333333,#4A4A4A)' }}
          >
            <Dna className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-brand-900">AI Career DNA</h3>
            <p className="text-sm text-brand-600 mt-1">
              Gemini reads your resume and builds a personalized radar profile — dimensions change
              based on your profession, not a fixed template.
            </p>
            <button
              onClick={() => dnaMutation.mutate()}
              disabled={dnaMutation.isPending}
              className="btn-primary mt-4 flex items-center gap-2"
            >
              {dnaMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your Career DNA…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Career DNA
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {(dnaMutation.isPending || isFetchingSaved) && (
        <div className="card p-8 flex flex-col items-center gap-4 animate-pulse">
          <div className="h-64 w-64 rounded-full bg-brand-100" />
          <p className="text-sm text-brand-500">Mapping your unique career dimensions…</p>
        </div>
      )}

      {/* Results */}
      {result && !dnaMutation.isPending && (
        <div className="space-y-6 animate-slide-up">
          {/* Header stats */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <OverallScoreRing score={result.overallScore} />
              <div className="flex-1 text-center sm:text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
                  Your Career DNA
                </p>
                <h3 className="text-xl font-bold text-brand-900">{result.careerField}</h3>
                <span className="inline-flex mt-2 badge-brand">{result.candidateLevel}</span>
                <p className="text-sm text-brand-500 mt-3">
                  Click any point on the chart to see why you scored that way and how to improve.
                </p>
              </div>
            </div>
          </div>

          {/* Radar chart */}
          <div className="card p-6">
            <RadarChart
              dimensions={result.radarChart}
              activeIndex={selectedIndex}
              onPointClick={(index) => setSelectedIndex(index)}
              animated
              size={340}
            />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {result.radarChart.map((dim, i) => (
                <button
                  key={dim.label}
                  type="button"
                  onClick={() => setSelectedIndex(i)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                    selectedIndex === i
                      ? 'bg-brand-900 text-white'
                      : 'bg-brand-100 text-brand-600 hover:bg-brand-200'
                  }`}
                >
                  {dim.label} · {dim.score}
                </button>
              ))}
            </div>
          </div>

          {/* Strengths / Weaknesses / Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightList
              title="Strengths"
              items={result.strengths}
              icon={CheckCircle2}
              tone="success"
            />
            <InsightList
              title="Weaknesses"
              items={result.weaknesses}
              icon={AlertCircle}
              tone="warning"
            />
            <InsightList
              title="Recommendations"
              items={result.recommendations}
              icon={TrendingUp}
              tone="info"
            />
          </div>

          <div className="flex justify-center mt-8">
            <button
              onClick={() => dnaMutation.mutate()}
              disabled={dnaMutation.isPending}
              className="px-4 py-2 bg-brand-100 text-brand-600 font-medium rounded-lg hover:bg-brand-200 transition-colors flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Re-analyze Resume
            </button>
          </div>
        </div>
      )}

      {/* Dimension detail modal */}
      <Modal
        open={selected !== null}
        onClose={() => setSelectedIndex(null)}
        title={selected?.label ?? 'Dimension'}
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-16 rounded-lg flex items-center justify-center text-2xl font-bold text-white"
                style={{
                  background:
                    selected.score >= 70
                      ? 'linear-gradient(135deg,#10b981,#059669)'
                      : selected.score >= 45
                        ? 'linear-gradient(135deg,#f59e0b,#d97706)'
                        : 'linear-gradient(135deg,#ef4444,#dc2626)',
                }}
              >
                {selected.score}
              </div>
              <div>
                <p className="text-sm text-brand-500">Score out of 100</p>
                <p className="font-semibold text-brand-900">{selected.label}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-2">
                AI Analysis
              </p>
              <p className="text-sm text-brand-700 leading-relaxed">{selected.reason}</p>
            </div>

            {selected.suggestions?.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Suggestions to Improve
                </p>
                <ul className="space-y-2">
                  {selected.suggestions.map((tip, i) => (
                    <li
                      key={i}
                      className="text-sm text-brand-700 flex gap-2 p-3 rounded-lg bg-brand-50"
                    >
                      <span className="text-brand-500 font-bold flex-shrink-0">{i + 1}.</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default CareerDNAPanel;
