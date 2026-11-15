import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { joobleService } from '../../services/job.service.js';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { SkeletonList } from '../../components/ui/Skeleton.jsx';
import toast from 'react-hot-toast';
import {
  Search, MapPin, Briefcase, Clock, ExternalLink,
  DollarSign, Building2, ChevronRight
} from 'lucide-react';

function JobCard({ job }) {
  return (
    <div className="card-hover p-5 animate-slide-up">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-5 w-5 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <a
            href={job.link}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-900 hover:text-brand-700 transition-colors text-sm leading-tight line-clamp-2 flex items-start gap-1 group"
          >
            {job.title}
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
          </a>
          {job.company && <p className="text-xs text-brand-500 mt-0.5">{job.company}</p>}

          <div className="flex flex-wrap items-center gap-3 mt-2">
            {job.location && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <MapPin className="h-3 w-3" />{job.location}
              </span>
            )}
            {job.type && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <Briefcase className="h-3 w-3" />{job.type}
              </span>
            )}
            {job.salary && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <DollarSign className="h-3 w-3" />{job.salary}
              </span>
            )}
            {job.updated && (
              <span className="flex items-center gap-1 text-xs text-brand-400">
                <Clock className="h-3 w-3" />{new Date(job.updated).toLocaleDateString()}
              </span>
            )}
          </div>

          {job.snippet && (
            <p className="text-xs text-brand-500 mt-2 line-clamp-2 leading-relaxed"
               dangerouslySetInnerHTML={{ __html: job.snippet }} />
          )}
        </div>

        <a
          href={job.link}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary btn-sm flex items-center gap-1 flex-shrink-0"
        >
          {t('jobSearch.apply')} <ChevronRight className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export default function JobSearchPage() {
  const { t } = useLanguage();
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(null);
  const [lastQuery, setLastQuery] = useState(null);

  const searchMutation = useMutation({
    mutationFn: ({ keywords, location, page }) => joobleService.search({ keywords, location, page }),
    onSuccess: (data) => setResults(data),
    onError: (err) => toast.error(err.response?.data?.error?.message || t('jobSearch.searchFailed')),
  });

  const handleSearch = (p = 1) => {
    if (!keywords.trim()) { toast.error(t('jobSearch.enterKeyword')); return; }
    setPage(p);
    setLastQuery({ keywords, location });
    searchMutation.mutate({ keywords, location, page: p });
  };

  const handlePrev = () => handleSearch(page - 1);
  const handleNext = () => handleSearch(page + 1);

  const POPULAR = ['Software Engineer', 'Data Scientist', 'Product Manager', 'UI/UX Designer', 'DevOps Engineer', 'Machine Learning'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{t('jobSearch.title')}</h1>
        <p className="text-sm text-brand-500 mt-0.5">{t('jobSearch.subtitle')}</p>
      </div>

      {/* Search bar */}
      <div className="card p-5 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              className="input pl-9"
              placeholder={t('jobSearch.searchPlaceholder')}
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <div className="relative w-48">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400" />
            <input
              className="input pl-9"
              placeholder={t('jobSearch.locationPlaceholder')}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
            />
          </div>
          <button
            onClick={() => handleSearch(1)}
            disabled={searchMutation.isPending}
            className="btn-primary px-6 flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">{t('jobSearch.search')}</span>
          </button>
        </div>

        {/* Popular searches */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-brand-400">{t('jobSearch.popular')}</span>
          {POPULAR.map((p) => (
            <button
              key={p}
              onClick={() => { setKeywords(p); }}
              className="text-xs px-2.5 py-1 rounded-full bg-brand-100 text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {searchMutation.isPending && <SkeletonList count={5} />}

      {!searchMutation.isPending && results && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-500">
              {results.totalCount > 0
                ? `${t('jobSearch.found')} ~${results.totalCount.toLocaleString()} ${t('jobSearch.jobsFor')} "${lastQuery?.keywords}"`
                : t('jobSearch.noJobsFound')}
            </p>
            <span className="badge-default">{t('jobSearch.page')} {page}</span>
          </div>

          {results.jobs?.length === 0
            ? <EmptyState icon="search" title={t('jobSearch.noJobsFound')} description={t('jobSearch.noJobsDesc')} />
            : (
              <div className="space-y-3">
                {results.jobs.map((job, i) => <JobCard key={job.id || i} job={job} />)}
              </div>
            )
          }

          {/* Pagination */}
          {results.jobs?.length > 0 && (
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={handlePrev}
                disabled={page <= 1 || searchMutation.isPending}
                className="btn-secondary btn-sm"
              >
                {t('jobSearch.previous')}
              </button>
              <button
                onClick={handleNext}
                disabled={searchMutation.isPending || results.jobs.length < 20}
                className="btn-secondary btn-sm"
              >
                {t('jobSearch.next')}
              </button>
            </div>
          )}
        </>
      )}

      {!searchMutation.isPending && !results && (
        <EmptyState
          icon="search"
          title={t('jobSearch.searchTitle')}
          description={t('jobSearch.searchDesc')}
        />
      )}
    </div>
  );
}
