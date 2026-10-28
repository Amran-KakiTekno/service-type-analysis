/**
 * Pure, deterministic classification domain for the Service Classification Lab.
 *
 * Rules of the house:
 *
 * - no randomness, no clock, no network, no I/O - the same input always
 *   produces the same output;
 * - every score is a small rational formula over the authored knowledge base,
 *   so every number in the UI can be explained by the matched terms that
 *   produced it;
 * - every score is bounded to the 0..1 range;
 * - the functions never mutate their arguments.
 */

import type {
  KnowledgeBaseEntry,
  SourceName,
  SourceRecord,
} from './data';

export type MatchKind = 'keyword' | 'synonym';

export interface MatchedTerm {
  /** The authored term that matched, lower-cased. */
  term: string;
  /** Whether it matched as a primary keyword or as a synonym. */
  kind: MatchKind;
}

export interface CategoryCandidate {
  categoryId: string;
  label: string;
  /** Confidence of this category, 0..1. */
  score: number;
  matchedTerms: MatchedTerm[];
}

export interface RecordClassification {
  recordId: string;
  source: SourceName;
  title: string;
  text: string;
  /**
   * The single category the algorithm proposes, or `null` when nothing matched
   * or when two categories tie for the top score.
   */
  proposedCategoryId: string | null;
  /** Every category that tied for the top score; empty when nothing matched. */
  suggestedCategoryIds: string[];
  /** Confidence of the classification, 0..1. */
  score: number;
  /** Whether two or more categories are tied at the top of the ranking. */
  ambiguous: boolean;
  /** All categories with their score and matched terms, best first. */
  candidates: CategoryCandidate[];
}

export type ClassificationStatus = 'automatic' | 'review' | 'manual';

export interface Classification extends RecordClassification {
  /**
   * The category the record carries right now: the algorithm's proposal for an
   * automatic or a pending-review record, the reviewer's choice for a manual
   * one, and `null` when nothing matched or the record is ambiguous.
   */
  categoryId: string | null;
  status: ClassificationStatus;
  /** Human readable explanation of how the result was reached. */
  explanation: string;
}

export interface SourceSummary {
  source: SourceName;
  total: number;
  automatic: number;
  review: number;
  manual: number;
}

export interface CategorySummary {
  categoryId: string;
  label: string;
  /** automatic + review + manual for this row. */
  total: number;
  automatic: number;
  review: number;
  manual: number;
}

export interface ClassificationSummary {
  total: number;
  automatic: number;
  review: number;
  manual: number;
  bySource: SourceSummary[];
  byCategory: CategorySummary[];
}

/** Identifier of the summary row that collects the records with no category. */
export const UNDECIDED_ID = 'undecided';

/** A keyword hit is worth twice a synonym hit. */
export const KEYWORD_WEIGHT = 0.5;
/** A synonym hit on its own stays below the default review threshold. */
export const SYNONYM_WEIGHT = 0.25;

/**
 * Common words that carry no signal for this knowledge base. They are removed
 * before matching so that a short sentence is not padded with noise.
 */
const STOP_WORDS = new Set([
  'after',
  'again',
  'against',
  'all',
  'also',
  'and',
  'any',
  'are',
  'because',
  'been',
  'before',
  'being',
  'between',
  'both',
  'but',
  'can',
  'cannot',
  'could',
  'did',
  'does',
  'doing',
  'done',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'her',
  'here',
  'hers',
  'him',
  'his',
  'how',
  'into',
  'its',
  'itself',
  'just',
  'more',
  'most',
  'much',
  'must',
  'next',
  'not',
  'now',
  'off',
  'once',
  'only',
  'other',
  'ought',
  'our',
  'out',
  'over',
  'own',
  'same',
  'shall',
  'should',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'too',
  'under',
  'until',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

/**
 * Split a free-text body into comparable tokens.
 *
 * The rules are intentionally boring so that they can be pinned by tests:
 * lower-case, split on every non-alphanumeric character, drop tokens shorter
 * than three characters, drop stop words, then de-duplicate while keeping the
 * order of first appearance.
 */
export function tokenise(text: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOP_WORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    tokens.push(raw);
  }

  return tokens;
}

function categoryById(
  kb: KnowledgeBaseEntry[],
  categoryId: string,
): KnowledgeBaseEntry | undefined {
  return kb.find((entry) => entry.id === categoryId);
}

function labelOf(kb: KnowledgeBaseEntry[], categoryId: string): string {
  const entry = categoryById(kb, categoryId);
  return entry ? entry.label : categoryId;
}

/**
 * Score one record against the whole knowledge base.
 *
 * The score of a category is the sum of the weights of the terms it matched:
 * `0.5` per distinct keyword and `0.25` per distinct synonym, capped at `1`.
 * The ranking is by score, and ties are broken by the knowledge-base order so
 * the result never depends on object iteration order.
 */
export function classifyRecord(
  record: SourceRecord,
  kb: KnowledgeBaseEntry[],
): RecordClassification {
  const tokens = tokenise(`${record.title}. ${record.text}`);
  const tokenSet = new Set(tokens);

  const candidates: CategoryCandidate[] = kb.map((entry) => {
    const matchedTerms: MatchedTerm[] = [];

    for (const keyword of entry.keywords) {
      if (tokenSet.has(keyword.toLowerCase())) {
        matchedTerms.push({ term: keyword.toLowerCase(), kind: 'keyword' });
      }
    }
    for (const synonym of entry.synonyms) {
      if (tokenSet.has(synonym.toLowerCase())) {
        matchedTerms.push({ term: synonym.toLowerCase(), kind: 'synonym' });
      }
    }

    const score = Math.min(
      1,
      matchedTerms.reduce(
        (total, match) =>
          total + (match.kind === 'keyword' ? KEYWORD_WEIGHT : SYNONYM_WEIGHT),
        0,
      ),
    );

    return {
      categoryId: entry.id,
      label: entry.label,
      score,
      matchedTerms,
    };
  });

  const ranked = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aIndex = kb.findIndex((entry) => entry.id === a.categoryId);
    const bIndex = kb.findIndex((entry) => entry.id === b.categoryId);
    return aIndex - bIndex;
  });

  const best = ranked[0];
  const hasEvidence = best !== undefined && best.score > 0;
  const tied = hasEvidence
    ? ranked.filter((candidate) => candidate.score === best.score)
    : [];

  return {
    recordId: record.id,
    source: record.source,
    title: record.title,
    text: record.text,
    proposedCategoryId: hasEvidence && tied.length === 1 ? best.categoryId : null,
    suggestedCategoryIds: tied.map((candidate) => candidate.categoryId),
    score: hasEvidence ? best.score : 0,
    ambiguous: hasEvidence && tied.length > 1,
    candidates: ranked,
  };
}

function describeMatches(matchedTerms: MatchedTerm[]): string {
  if (matchedTerms.length === 0) return 'no knowledge-base term matched';

  const keywords = matchedTerms.filter((match) => match.kind === 'keyword');
  const synonyms = matchedTerms.filter((match) => match.kind === 'synonym');
  const parts: string[] = [];

  if (keywords.length > 0) {
    parts.push(`keyword ${keywords.map((match) => `'${match.term}'`).join(', ')}`);
  }
  if (synonyms.length > 0) {
    parts.push(`synonym ${synonyms.map((match) => `'${match.term}'`).join(', ')}`);
  }

  return parts.join(' and ');
}

function buildExplanation(
  classification: RecordClassification,
  kb: KnowledgeBaseEntry[],
  threshold: number,
): string {
  const { proposedCategoryId, candidates, score, ambiguous } = classification;

  if (classification.suggestedCategoryIds.length === 0) {
    return 'No knowledge-base term matched, so the record needs a human decision.';
  }

  const best = candidates.find(
    (candidate) => candidate.categoryId === classification.suggestedCategoryIds[0],
  );
  const matches = best
    ? describeMatches(best.matchedTerms)
    : 'no knowledge-base term matched';
  const keywordCount = best
    ? best.matchedTerms.filter((match) => match.kind === 'keyword').length
    : 0;
  const synonymCount = best
    ? best.matchedTerms.filter((match) => match.kind === 'synonym').length
    : 0;

  const arithmetic = `${keywordCount} keyword x ${KEYWORD_WEIGHT} + ${synonymCount} synonym x ${SYNONYM_WEIGHT}`;

  if (ambiguous) {
    const names = classification.suggestedCategoryIds
      .map((categoryId) => labelOf(kb, categoryId))
      .join(' and ');
    return `Ambiguous: ${names} tie at ${score.toFixed(2)} from ${matches} (${arithmetic}). A reviewer must choose.`;
  }

  const label = proposedCategoryId ? labelOf(kb, proposedCategoryId) : '';

  if (score >= threshold) {
    return `Best match ${label} at ${score.toFixed(2)} from ${matches} (${arithmetic}), which reaches the ${threshold.toFixed(2)} threshold, so it was classified automatically.`;
  }

  return `Best match ${label} at ${score.toFixed(2)} from ${matches} (${arithmetic}), which is below the ${threshold.toFixed(2)} threshold, so it was queued for review.`;
}

/**
 * Classify a batch of records against a confidence threshold.
 *
 * A record is classified automatically when it has evidence, is not ambiguous
 * and reaches the threshold. Everything else is queued for review. Because the
 * automatic test only depends on the record's own score, raising the threshold
 * can never increase the automatic count and lowering it can never decrease it.
 */
export function classifyBatch(
  records: SourceRecord[],
  kb: KnowledgeBaseEntry[],
  threshold: number,
): Classification[] {
  return records.map((record) => {
    const base = classifyRecord(record, kb);
    const status: ClassificationStatus =
      base.score > 0 && !base.ambiguous && base.score >= threshold
        ? 'automatic'
        : 'review';

    return {
      ...base,
      categoryId: base.proposedCategoryId,
      status,
      explanation: buildExplanation(base, kb, threshold),
    };
  });
}

/**
 * Apply one approved human decision.
 *
 * The record becomes a manual classification, it leaves the pending review
 * queue, and it keeps its source and its chosen category so that the source
 * and category summaries stay complete.
 */
export function applyManualOverride(
  classifications: Classification[],
  recordId: string,
  categoryId: string,
  kb: KnowledgeBaseEntry[],
): Classification[] {
  return classifications.map((classification) => {
    if (classification.recordId !== recordId) return classification;

    const label = labelOf(kb, categoryId);
    const proposed = classification.proposedCategoryId
      ? labelOf(kb, classification.proposedCategoryId)
      : classification.ambiguous
        ? classification.suggestedCategoryIds
            .map((suggestedId) => labelOf(kb, suggestedId))
            .join(' / ')
        : 'no match';

    return {
      ...classification,
      status: 'manual' as ClassificationStatus,
      categoryId,
      explanation: `Manual decision by a reviewer: ${label} chosen over the suggested ${proposed}.`,
    };
  });
}

/**
 * Apply a whole set of approved human decisions to a batch.
 *
 * This is what a rerun with the `Keep reviewed overrides` option does: the
 * batch is classified again and the human decisions are replayed on top of
 * the fresh result, in the order the decisions were made.
 */
export function applyOverrides(
  classifications: Classification[],
  overrides: Readonly<Record<string, string>>,
  kb: KnowledgeBaseEntry[],
): Classification[] {
  let next = classifications;

  for (const recordId of Object.keys(overrides)) {
    const categoryId = overrides[recordId];
    next = applyManualOverride(next, recordId, categoryId, kb);
  }

  return next;
}

/**
 * Summarise a batch by source and by category.
 *
 * The grand total always equals the number of records in the batch, whatever
 * the threshold or the manual decisions were, and every record is counted in
 * exactly one category row.
 */
export function summariseClassifications(
  classifications: Classification[],
  kb: KnowledgeBaseEntry[],
): ClassificationSummary {
  const sourceNames: SourceName[] = [];
  for (const classification of classifications) {
    if (!sourceNames.includes(classification.source)) {
      sourceNames.push(classification.source);
    }
  }

  const bySource: SourceSummary[] = sourceNames.map((source) => {
    const rows = classifications.filter(
      (classification) => classification.source === source,
    );
    return {
      source,
      total: rows.length,
      automatic: rows.filter((row) => row.status === 'automatic').length,
      review: rows.filter((row) => row.status === 'review').length,
      manual: rows.filter((row) => row.status === 'manual').length,
    };
  });

  const byCategory: CategorySummary[] = kb.map((entry) => {
    const rows = classifications.filter(
      (classification) => classification.categoryId === entry.id,
    );
    return {
      categoryId: entry.id,
      label: entry.label,
      total: rows.length,
      automatic: rows.filter((row) => row.status === 'automatic').length,
      review: rows.filter((row) => row.status === 'review').length,
      manual: rows.filter((row) => row.status === 'manual').length,
    };
  });

  const undecided = classifications.filter(
    (classification) => classification.categoryId === null,
  );
  if (undecided.length > 0) {
    byCategory.push({
      categoryId: UNDECIDED_ID,
      label: 'No category yet',
      total: undecided.length,
      automatic: 0,
      review: undecided.filter((row) => row.status === 'review').length,
      manual: undecided.filter((row) => row.status === 'manual').length,
    });
  }

  return {
    total: classifications.length,
    automatic: classifications.filter((row) => row.status === 'automatic').length,
    review: classifications.filter((row) => row.status === 'review').length,
    manual: classifications.filter((row) => row.status === 'manual').length,
    bySource,
    byCategory,
  };
}
