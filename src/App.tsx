import { useCallback, useMemo, useState } from 'react';

import {
  DEFAULT_THRESHOLD,
  KNOWLEDGE_BASE,
  RECORDS,
  SOURCE_NAMES,
} from './data';
import {
  applyManualOverride,
  applyOverrides,
  classifyBatch,
  summariseClassifications,
  type Classification,
} from './domain';

type ReviewFilter = 'all' | 'Field notes' | 'Work requests';

const REVIEW_FILTERS: ReviewFilter[] = ['all', ...SOURCE_NAMES];

function categoryLabel(categoryId: string | null): string {
  if (categoryId === null) return 'No category yet';
  const entry = KNOWLEDGE_BASE.find((item) => item.id === categoryId);
  return entry ? entry.label : categoryId;
}

function statusLabel(status: Classification['status']): string {
  if (status === 'automatic') return 'Automatic';
  if (status === 'manual') return 'Manual override';
  return 'Needs review';
}

export default function App() {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [keepOverrides, setKeepOverrides] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Classification[] | null>(null);
  const [stale, setStale] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [reviewCategory, setReviewCategory] = useState('all');

  const runClassification = useCallback(
    (nextThreshold: number, keep: boolean, existingOverrides: Record<string, string>) => {
      const base = classifyBatch(RECORDS, KNOWLEDGE_BASE, nextThreshold);
      if (keep) {
        setResults(applyOverrides(base, existingOverrides, KNOWLEDGE_BASE));
      } else {
        // A plain rerun must not carry stale manual decisions over.
        setOverrides({});
        setResults(base);
      }
      setStale(false);
    },
    [],
  );

  const handleRun = useCallback(() => {
    runClassification(threshold, keepOverrides, overrides);
  }, [runClassification, threshold, keepOverrides, overrides]);

  const handleThresholdChange = useCallback((nextThreshold: number) => {
    setThreshold(nextThreshold);
    // The old result no longer matches the controls, so it is cleared and the
    // user is asked to run the classification again.
    setResults(null);
    setStale(true);
  }, []);

  const handleReset = useCallback(() => {
    setThreshold(DEFAULT_THRESHOLD);
    setKeepOverrides(false);
    setOverrides({});
    setReviewFilter('all');
    setReviewCategory('all');
    setStale(false);
    setResults(classifyBatch(RECORDS, KNOWLEDGE_BASE, DEFAULT_THRESHOLD));
  }, []);

  const handleApprove = useCallback((recordId: string, categoryId: string) => {
    setOverrides((previous) => ({ ...previous, [recordId]: categoryId }));
    setResults((current) =>
      current
        ? applyManualOverride(current, recordId, categoryId, KNOWLEDGE_BASE)
        : current,
    );
  }, []);

  const summary = useMemo(
    () =>
      results
        ? summariseClassifications(results, KNOWLEDGE_BASE)
        : {
            total: 0,
            automatic: 0,
            review: 0,
            manual: 0,
            bySource: [],
            byCategory: [],
          },
    [results],
  );

  const reviewQueue = useMemo(() => {
    if (!results) return [];
    return results.filter((row) => {
      if (row.status !== 'review') return false;
      if (reviewFilter !== 'all' && row.source !== reviewFilter) return false;
      if (reviewCategory !== 'all') {
        if (reviewCategory === 'none') return row.proposedCategoryId === null;
        return row.proposedCategoryId === reviewCategory;
      }
      return true;
    });
  }, [results, reviewFilter, reviewCategory]);

  return (
    <div className="app-shell">
      <header className="masthead">
        <p className="eyebrow">Dual Orbit &middot; clean-room demo</p>
        <h1>Service Classification Lab</h1>
        <p className="lede">
          A deterministic, knowledge-assisted classifier over two invented service sources.
          Every decision is explained by the knowledge-base terms that produced it, and every
          low-confidence record can be routed to a human reviewer.
        </p>
        <p className="notice" data-testid="synthetic-notice">
          <strong>Synthetic data.</strong> Every record, keyword, synonym and count on this page
          was invented for this demonstration. Nothing here is a real customer, ticket or
          production knowledge base, and no data leaves your browser.
        </p>
      </header>

      <section className="panel" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Controls</h2>
        <div className="controls">
          <div className="control">
            <label htmlFor="threshold-input">Confidence threshold</label>
            <input
              id="threshold-input"
              data-testid="threshold-input"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={threshold}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) return;
                handleThresholdChange(Math.min(1, Math.max(0, next)));
              }}
            />
            <p className="control__hint">
              A record is classified automatically when its score reaches the threshold.
              Raising the threshold can only move records into review.
            </p>
          </div>

          <div className="control control--actions">
            <button
              type="button"
              className="button button--primary"
              data-testid="run-classification"
              onClick={handleRun}
            >
              Run classification
            </button>
            <button
              type="button"
              className="button"
              data-testid="reset-classification"
              onClick={handleReset}
            >
              Reset
            </button>
            <label className="checkbox">
              <input
                type="checkbox"
                data-testid="keep-overrides"
                checked={keepOverrides}
                onChange={(event) => setKeepOverrides(event.target.checked)}
              />
              <span>Keep reviewed overrides</span>
            </label>
            <p className="control__hint">
              Off by default: a rerun discards manual decisions. Switch it on to replay the
              reviewed overrides onto the fresh run.
            </p>
          </div>
        </div>

        <div className="totals" data-testid="totals">
          <div className="total">
            <span className="total__value" data-testid="count-total">
              {summary.total}
            </span>
            <span className="total__label">Total records</span>
          </div>
          <div className="total total--automatic">
            <span className="total__value" data-testid="count-automatic">
              {summary.automatic}
            </span>
            <span className="total__label">Automatic</span>
          </div>
          <div className="total total--review">
            <span className="total__value" data-testid="count-review">
              {summary.review}
            </span>
            <span className="total__label">Needs review</span>
          </div>
          <div className="total total--manual">
            <span className="total__value" data-testid="count-manual">
              {summary.manual}
            </span>
            <span className="total__label">Manual override</span>
          </div>
        </div>

        {stale && (
          <p className="notice notice--muted" data-testid="results-cleared">
            The threshold changed, so the previous result was cleared. Press{' '}
            <strong>Run classification</strong> to classify again.
          </p>
        )}
        {results === null && !stale && (
          <p className="notice notice--muted" data-testid="no-result">
            No run yet. Press <strong>Run classification</strong> to classify the ten records.
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summaries</h2>
        <div className="summary-grid">
          <div className="table-wrap">
            <table className="data-table" data-testid="summary-by-source">
              <caption>By source</caption>
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Total</th>
                  <th scope="col">Automatic</th>
                  <th scope="col">Review</th>
                  <th scope="col">Manual</th>
                </tr>
              </thead>
              <tbody>
                {summary.bySource.map((entry) => (
                  <tr key={entry.source} data-testid={`summary-source-${entry.source}`}>
                    <th scope="row">{entry.source}</th>
                    <td>{entry.total}</td>
                    <td>{entry.automatic}</td>
                    <td>{entry.review}</td>
                    <td>{entry.manual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="data-table" data-testid="summary-by-category">
              <caption>By category</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Total</th>
                  <th scope="col">Automatic</th>
                  <th scope="col">Review</th>
                  <th scope="col">Manual</th>
                </tr>
              </thead>
              <tbody>
                {summary.byCategory.map((entry) => (
                  <tr key={entry.categoryId} data-testid={`summary-category-${entry.categoryId}`}>
                    <th scope="row">{entry.label}</th>
                    <td>{entry.total}</td>
                    <td>{entry.automatic}</td>
                    <td>{entry.review}</td>
                    <td>{entry.manual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="results-heading">
        <h2 id="results-heading">Classification results</h2>
        {results === null ? (
          <p className="notice notice--muted">Run the classification to see the results.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="results-table">
              <caption>
                Every record, its status, the matched terms and the confidence explanation
              </caption>
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                  <th scope="col">Category</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Matched terms</th>
                  <th scope="col">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.recordId} data-testid={`result-row-${row.recordId}`}>
                    <th scope="row">
                      <span className="record-id">{row.recordId}</span>
                      <span className="record-title">{row.title}</span>
                    </th>
                    <td>{row.source}</td>
                    <td>
                      <span
                        className={`status status--${row.status}`}
                        data-testid={`status-${row.recordId}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td data-testid={`category-${row.recordId}`}>
                      {row.categoryId === null ? '—' : categoryLabel(row.categoryId)}
                    </td>
                    <td data-testid={`confidence-${row.recordId}`}>
                      {row.score.toFixed(2)}
                    </td>
                    <td data-testid={`terms-${row.recordId}`}>
                      {row.candidates.some((candidate) => candidate.score > 0) ? (
                        <ul className="term-list">
                          {row.candidates
                            .filter((candidate) => candidate.score > 0)
                            .map((candidate) => (
                              <li key={candidate.categoryId}>
                                <span className="term-list__category">
                                  {candidate.label}
                                </span>
                                {candidate.matchedTerms.map((match) => (
                                  <span
                                    key={`${candidate.categoryId}-${match.kind}-${match.term}`}
                                    className={`term term--${match.kind}`}
                                  >
                                    {match.term}
                                  </span>
                                ))}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <span className="muted">none</span>
                      )}
                    </td>
                    <td className="explanation" data-testid={`explanation-${row.recordId}`}>
                      {row.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="review-heading">
        <h2 id="review-heading">Review queue</h2>
        <div className="filters">
          <div className="control">
            <label htmlFor="review-source-filter">Source</label>
            <select
              id="review-source-filter"
              data-testid="review-source-filter"
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}
            >
              {REVIEW_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === 'all' ? 'All sources' : filter}
                </option>
              ))}
            </select>
          </div>
          <div className="control">
            <label htmlFor="review-category-filter">Suggested category</label>
            <select
              id="review-category-filter"
              data-testid="review-category-filter"
              value={reviewCategory}
              onChange={(event) => setReviewCategory(event.target.value)}
            >
              <option value="all">All suggestions</option>
              {KNOWLEDGE_BASE.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
              <option value="none">No suggestion</option>
            </select>
          </div>
        </div>

        {results === null ? (
          <p className="notice notice--muted">Run the classification to build the review queue.</p>
        ) : reviewQueue.length === 0 ? (
          <p className="notice notice--muted" data-testid="review-empty">
            Nothing is waiting for review with the current filter.
          </p>
        ) : (
          <ul className="review-list" data-testid="review-queue">
            {reviewQueue.map((row) => (
              <li key={row.recordId} data-testid={`review-item-${row.recordId}`}>
                <div className="review-item__head">
                  <span className="record-id">{row.recordId}</span>
                  <span className="record-title">{row.title}</span>
                  <span className="review-item__source">{row.source}</span>
                </div>
                <p className="review-item__text">{row.text}</p>
                <p className="review-item__meta">
                  Suggested: {categoryLabel(row.proposedCategoryId)} at confidence{' '}
                  {row.score.toFixed(2)}
                </p>
                <div className="review-item__actions">
                  <label htmlFor={`review-category-${row.recordId}`}>
                    Choose category for {row.recordId}
                  </label>
                  <select
                    id={`review-category-${row.recordId}`}
                    data-testid={`review-select-${row.recordId}`}
                    defaultValue={row.proposedCategoryId ?? ''}
                  >
                    <option value="">Choose a category…</option>
                    {KNOWLEDGE_BASE.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button button--primary"
                    data-testid={`review-approve-${row.recordId}`}
                    onClick={() => {
                      const select = document.getElementById(
                        `review-category-${row.recordId}`,
                      ) as HTMLSelectElement | null;
                      const chosen = select?.value ?? '';
                      if (!chosen) return;
                      handleApprove(row.recordId, chosen);
                    }}
                  >
                    Approve override
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="knowledge-heading">
        <h2 id="knowledge-heading">Knowledge base</h2>
        <p className="panel__lede">
          Four authored categories. A keyword match adds 0.5 to the score, a synonym match adds
          0.25, and the score is capped at 1.
        </p>
        <div className="kb-grid" data-testid="knowledge-base">
          {KNOWLEDGE_BASE.map((entry) => (
            <article
              key={entry.id}
              className="kb-card"
              data-testid={`kb-entry-${entry.id}`}
            >
              <h3>{entry.label}</h3>
              <p className="kb-card__description">{entry.description}</p>
              <dl className="kb-card__terms">
                <dt>Keywords</dt>
                <dd data-testid={`kb-keywords-${entry.id}`}>
                  {entry.keywords.map((keyword) => (
                    <span key={keyword} className="term term--keyword">
                      {keyword}
                    </span>
                  ))}
                </dd>
                <dt>Synonyms</dt>
                <dd data-testid={`kb-synonyms-${entry.id}`}>
                  {entry.synonyms.map((synonym) => (
                    <span key={synonym} className="term term--synonym">
                      {synonym}
                    </span>
                  ))}
                </dd>
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Source records</h2>
        <p className="panel__lede">
          Ten invented records across two sources. The bodies below are the only input the
          classifier reads.
        </p>
        <div className="source-grid" data-testid="source-records">
          {SOURCE_NAMES.map((source) => (
            <div key={source} className="source-card">
              <h3>{source}</h3>
              <ul className="source-list">
                {RECORDS.filter((record) => record.source === source).map((record) => (
                  <li key={record.id} data-testid={`source-record-${record.id}`}>
                    <span className="record-id">{record.id}</span>
                    <span className="record-title">{record.title}</span>
                    <p className="source-list__text">{record.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>
          Synthetic demonstration only. The classifier is a transparent rule engine over an
          authored knowledge base - it is not a machine-learning model and makes no claim about
          production accuracy.
        </p>
      </footer>
    </div>
  );
}
