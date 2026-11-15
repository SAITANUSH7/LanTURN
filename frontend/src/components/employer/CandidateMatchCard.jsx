import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Star, 
  Code, 
  Briefcase, 
  GraduationCap, 
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Renders a circular progress indicator
 */
const CircularProgress = ({ value, label, colorClass, size = 40, strokeWidth = 4 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            className="text-brand-100"
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            className={colorClass}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-brand-700">{value}%</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-medium text-brand-500 uppercase tracking-wider">{label}</span>}
    </div>
  );
};

export default function CandidateMatchCard({ candidate, matchData }) {
  if (!matchData) return null;

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-500 stroke-green-500 bg-green-50 border-green-200';
    if (score >= 75) return 'text-brand-500 stroke-brand-500 bg-brand-50 border-brand-200';
    if (score >= 60) return 'text-yellow-500 stroke-yellow-500 bg-yellow-50 border-yellow-200';
    return 'text-red-500 stroke-red-500 bg-red-50 border-red-200';
  };

  const overallColor = getScoreColor(matchData.matchScore);

  return (
    <div className="bg-white border border-brand-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group">
      {/* Top Banner (Score) */}
      <div className={`px-4 py-3 border-b flex items-center justify-between ${overallColor.split(' ')[2]} ${overallColor.split(' ')[3]}`}>
        <div className="flex items-center gap-2">
          <SparklesIcon className={`h-5 w-5 ${overallColor.split(' ')[0]}`} />
          <span className={`font-semibold text-sm ${overallColor.split(' ')[0]}`}>
            AI Match Score
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-2xl font-black ${overallColor.split(' ')[0]}`}>
            {matchData.matchScore}%
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col md:flex-row gap-6">
        {/* Left Column: Candidate Info & Breakdown */}
        <div className="flex-1 space-y-5">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-lg bg-brand-100 overflow-hidden flex-shrink-0 border border-brand-200">
              {candidate?.studentPhotoURL ? (
                <img src={candidate.studentPhotoURL} alt={candidate.studentName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center bg-brand-100 text-brand-700 font-bold text-xl">
                  {(candidate?.studentName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold text-brand-900 group-hover:text-brand-600 transition-colors truncate">
                {candidate?.studentName || 'Unknown Candidate'}
              </h3>
              <p className="text-sm text-brand-500 flex items-center gap-1 mt-0.5">
                <Star className="h-3.5 w-3.5 text-brand-500 fill-brand-500" />
                {matchData.overallReason || 'Good fit for the role'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-y border-brand-100">
            <CircularProgress value={matchData.skillMatchScore || 0} label="Skills" colorClass="text-blue-500" />
            <CircularProgress value={matchData.projectScore || 0} label="Projects" colorClass="text-brand-500" />
            <CircularProgress value={matchData.experienceScore || 0} label="Experience" colorClass="text-amber-500" />
            <CircularProgress value={matchData.educationScore || 0} label="Education" colorClass="text-emerald-500" />
          </div>
        </div>

        {/* Right Column: Strengths & Weaknesses */}
        <div className="flex-1 flex flex-col justify-between space-y-4 md:border-l md:border-brand-100 md:pl-6">
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-brand-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" /> Top Strengths
              </h4>
              <ul className="space-y-1.5">
                {(matchData.recommendations || []).slice(0, 2).map((str, i) => (
                  <li key={i} className="text-sm text-brand-700 flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    <span className="leading-tight">{str}</span>
                  </li>
                ))}
                {(!matchData.recommendations || matchData.recommendations.length === 0) && (
                  <li className="text-sm text-brand-400 italic">No specific strengths highlighted</li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-bold text-brand-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Missing / Gap
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {(matchData.missingSkills || []).map((skill, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-50 text-red-600 rounded-md text-xs font-medium border border-red-100">
                    {skill}
                  </span>
                ))}
                {(!matchData.missingSkills || matchData.missingSkills.length === 0) && (
                  <span className="text-sm text-brand-400 italic">No significant gaps detected</span>
                )}
              </div>
            </div>
          </div>

          <Link
            to={`/employer/applicants/${candidate?.applicationId}`}
            className="flex items-center justify-center gap-1.5 w-full py-2 bg-brand-50 hover:bg-brand-50 text-brand-700 hover:text-brand-700 text-sm font-semibold rounded-lg border border-brand-200 hover:border-brand-200 transition-colors"
          >
            View Full Profile <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function SparklesIcon(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
