import { useState, useEffect, useRef } from 'react';
import { RadarChart } from './RadarChart.jsx';
import { Modal } from '../ui/Modal.jsx';
import {
  Building2, Sparkles, Loader2, RefreshCw, ChevronRight, Info
} from 'lucide-react';

/* ── Animated Score Ring ──────────────────────────────────────── */
function ScoreRing({ score, size = 96, label = 'Overall' }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 1200;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setAnimatedScore(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const dash = (animatedScore / 100) * circ;
  const color = animatedScore >= 70 ? '#10b981' : animatedScore >= 45 ? '#f59e0b' : '#ef4444';

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
          style={{ transition: 'stroke-dasharray 0.1s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-brand-900">{animatedScore}</span>
        <span className="text-[10px] uppercase tracking-wide text-brand-400 font-medium">{label}</span>
      </div>
    </div>
  );
}

/* ── Animated Progress Bar ────────────────────────────────────── */
function AnimatedBar({ score, name, delay = 0, onClick }) {
  const [width, setWidth] = useState(0);
  const barRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setWidth(score), 100 + delay);
    return () => clearTimeout(timer);
  }, [score, delay]);

  const gradient = score >= 80
    ? 'linear-gradient(90deg, #10b981, #059669)'
    : score >= 60
      ? 'linear-gradient(90deg, #1A1A1A, #333333)'
      : score >= 40
        ? 'linear-gradient(90deg, #f59e0b, #d97706)'
        : 'linear-gradient(90deg, #ef4444, #dc2626)';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left group p-3 rounded-lg hover:bg-brand-50/80 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-brand-700 group-hover:text-brand-700 transition-colors">
          {name}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-brand-900">{score}%</span>
          <ChevronRight className="h-3.5 w-3.5 text-brand-300 group-hover:text-brand-500 transition-colors" />
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-brand-100 overflow-hidden" ref={barRef}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: gradient,
            transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        />
      </div>
    </button>
  );
}

/* ── Main CompanyDNAPanel ─────────────────────────────────────── */
export function CompanyDNAPanel({
  data,
  companyName = 'Company',
  isEmployerView = false,
  isLoading = false,
  onRegenerate,
  isRegenerating = false,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [showRadar, setShowRadar] = useState(true);

  if (isLoading) {
    return (
      <div className="card p-8 flex flex-col items-center gap-4 animate-pulse">
        <div className="h-48 w-48 rounded-full bg-brand-100" />
        <p className="text-sm text-brand-500">Loading Company DNA…</p>
      </div>
    );
  }

  if (!data) {
    if (isEmployerView) {
      return (
        <div className="p-5 rounded-lg bg-gradient-to-br from-brand-50 via-brand-50 to-fuchsia-50 ring-1 ring-brand-100">
          <div className="flex items-start gap-4">
            <div
              className="h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#333333,#4A4A4A)' }}
            >
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-brand-900">AI Company DNA</h3>
              <p className="text-sm text-brand-600 mt-1">
                Generate an AI-powered workplace personality profile. Students will see this when
                viewing your company — helping them understand your culture, values, and work environment.
              </p>
              <button
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="btn-primary mt-4 flex items-center gap-2"
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating Company DNA…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Company DNA
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return null; // Don't show anything to students if DNA not generated
  }

  // Map data for RadarChart (it expects { label, score } format)
  const radarDimensions = (data.companyDNA || []).map(d => ({
    label: d.name,
    score: d.score,
    reason: d.reason,
  }));

  const selected = selectedIndex !== null ? data.companyDNA?.[selectedIndex] : null;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Glass-card header */}
      <div
        className="relative overflow-hidden rounded-lg p-5"
        style={{
          background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(124,58,237,0.08) 50%, rgba(217,70,239,0.06) 100%)',
          border: '1px solid rgba(99,102,241,0.15)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Decorative glow */}
        <div
          className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #6B6B6B, transparent 70%)' }}
        />

        <div className="flex flex-col sm:flex-row items-center gap-5 relative z-10">
          <ScoreRing score={data.overallScore || 0} />
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1 flex items-center gap-1.5 justify-center sm:justify-start">
              <Sparkles className="h-3.5 w-3.5" />
              Company DNA
            </p>
            <h3 className="text-xl font-bold text-brand-900">{companyName}</h3>
            <span className="inline-flex mt-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
              {data.companyPersonality}
            </span>
            <p className="text-sm text-brand-600 mt-2 leading-relaxed">{data.summary}</p>
          </div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center justify-center gap-1 p-1 bg-brand-100 rounded-lg w-fit mx-auto">
        <button
          type="button"
          onClick={() => setShowRadar(true)}
          className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${
            showRadar
              ? 'bg-white text-brand-900 shadow-sm'
              : 'text-brand-500 hover:text-brand-700'
          }`}
        >
          Radar Chart
        </button>
        <button
          type="button"
          onClick={() => setShowRadar(false)}
          className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-all ${
            !showRadar
              ? 'bg-white text-brand-900 shadow-sm'
              : 'text-brand-500 hover:text-brand-700'
          }`}
        >
          Progress Bars
        </button>
      </div>

      {/* Radar chart view */}
      {showRadar ? (
        <div className="card p-5">
          <RadarChart
            dimensions={radarDimensions}
            activeIndex={selectedIndex}
            onPointClick={(index) => setSelectedIndex(index)}
            animated
            size={340}
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {radarDimensions.map((dim, i) => (
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
      ) : (
        /* Progress bars view */
        <div className="card p-3">
          {(data.companyDNA || []).map((dim, i) => (
            <AnimatedBar
              key={dim.name}
              name={dim.name}
              score={dim.score}
              delay={i * 100}
              onClick={() => setSelectedIndex(i)}
            />
          ))}
        </div>
      )}

      {/* Employer regenerate button */}
      {isEmployerView && (
        <div className="flex justify-center">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="px-4 py-2 bg-brand-100 text-brand-600 font-medium rounded-lg hover:bg-brand-200 transition-colors flex items-center gap-2"
          >
            {isRegenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Regenerating…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Regenerate Company DNA
              </>
            )}
          </button>
        </div>
      )}

      {/* Click hint for students */}
      {!isEmployerView && (
        <p className="text-xs text-brand-400 text-center flex items-center justify-center gap-1">
          <Info className="h-3 w-3" />
          Click any dimension to see the AI explanation
        </p>
      )}

      {/* Dimension detail modal */}
      <Modal
        open={selected !== null}
        onClose={() => setSelectedIndex(null)}
        title={selected?.name ?? 'Dimension'}
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
                <p className="font-semibold text-brand-900">{selected.name}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-400 mb-2">
                AI Analysis
              </p>
              <p className="text-sm text-brand-700 leading-relaxed">{selected.reason}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default CompanyDNAPanel;
