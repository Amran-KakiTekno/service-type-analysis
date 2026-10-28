import { describe, expect, it } from 'vitest';

import {
  DEFAULT_THRESHOLD,
  KNOWLEDGE_BASE,
  RECORDS,
} from './data';
import {
  applyManualOverride,
  applyOverrides,
  classifyBatch,
  classifyRecord,
  summariseClassifications,
  tokenise,
  type Classification,
} from './domain';

const DEFAULT_BATCH = classifyBatch(RECORDS, KNOWLEDGE_BASE, DEFAULT_THRESHOLD);

function rowOf(recordId: string): Classification {
  const row = DEFAULT_BATCH.find((entry) => entry.recordId === recordId);
  if (!row) throw new Error(`missing fixture ${recordId}`);
  return row;
}

describe('tokenise', () => {
  it('lower-cases, drops short tokens and stop words', () => {
    expect(tokenise('The Repair of the Pump')).toEqual(['repair', 'pump']);
  });

  it('splits on punctuation and keeps digits', () => {
    expect(tokenise('Audit-and-walkthrough, 2026!')).toEqual([
      'audit',
      'walkthrough',
      '2026',
    ]);
  });

  it('de-duplicates while keeping first-appearance order', () => {
    expect(tokenise('clean clean scrub clean')).toEqual(['clean', 'scrub']);
  });

  it('returns an empty list for empty or symbol-only input', () => {
    expect(tokenise('')).toEqual([]);
    expect(tokenise('!!! ... ---')).toEqual([]);
  });

  it('is deterministic', () => {
    const text = 'Calibration of the flow meter before dispatch.';
    expect(tokenise(text)).toEqual(tokenise(text));
  });
});

describe('classifyRecord', () => {
  it('classifies a direct keyword fixture into its expected category', () => {
    const record = RECORDS.find((entry) => entry.id === 'FN-01');
    const result = classifyRecord(record!, KNOWLEDGE_BASE);

    expect(result.proposedCategoryId).toBe('inspection');
    expect(result.score).toBeCloseTo(0.5, 10);
    expect(result.ambiguous).toBe(false);
    expect(result.candidates[0].matchedTerms).toContainEqual({
      term: 'inspection',
      kind: 'keyword',
    });
  });

  it('classifies a synonym-only fixture into the same category as its keyword sibling', () => {
    const record = RECORDS.find((entry) => entry.id === 'WR-02');
    const result = classifyRecord(record!, KNOWLEDGE_BASE);

    expect(result.proposedCategoryId).toBe('inspection');
    expect(result.score).toBeCloseTo(0.5, 10);
    expect(
      result.candidates[0].matchedTerms.every((match) => match.kind === 'synonym'),
    ).toBe(true);
    expect(result.candidates[0].matchedTerms.map((match) => match.term)).toEqual([
      'audit',
      'walkthrough',
    ]);
  });

  it('sends a no-match fixture to review with no proposed category', () => {
    const record = RECORDS.find((entry) => entry.id === 'WR-04');
    const result = classifyRecord(record!, KNOWLEDGE_BASE);

    expect(result.proposedCategoryId).toBeNull();
    expect(result.suggestedCategoryIds).toEqual([]);
    expect(result.score).toBe(0);
  });

  it('marks a tied fixture as ambiguous and proposes no single category', () => {
    const record = RECORDS.find((entry) => entry.id === 'FN-04');
    const result = classifyRecord(record!, KNOWLEDGE_BASE);

    expect(result.ambiguous).toBe(true);
    expect(result.proposedCategoryId).toBeNull();
    expect(result.suggestedCategoryIds.sort()).toEqual(['cleaning', 'repair']);
  });

  it('keeps every score inside the 0..1 range', () => {
    for (const record of RECORDS) {
      const result = classifyRecord(record, KNOWLEDGE_BASE);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      for (const candidate of result.candidates) {
        expect(candidate.score).toBeGreaterThanOrEqual(0);
        expect(candidate.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for the same input', () => {
    const record = RECORDS.find((entry) => entry.id === 'WR-03');
    expect(classifyRecord(record!, KNOWLEDGE_BASE)).toEqual(
      classifyRecord(record!, KNOWLEDGE_BASE),
    );
  });
});

describe('classifyBatch', () => {
  it('classifies all ten fixtures', () => {
    expect(DEFAULT_BATCH).toHaveLength(10);
    expect(DEFAULT_BATCH.map((row) => row.recordId)).toEqual([
      'FN-01',
      'FN-02',
      'FN-03',
      'FN-04',
      'FN-05',
      'WR-01',
      'WR-02',
      'WR-03',
      'WR-04',
      'WR-05',
    ]);
  });

  it('splits the default fixtures into seven automatic and three review at threshold 0.45', () => {
    const summary = summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE);

    expect(summary.total).toBe(10);
    expect(summary.automatic).toBe(7);
    expect(summary.review).toBe(3);
    expect(summary.manual).toBe(0);
  });

  it('keeps the source totals at five plus five', () => {
    const summary = summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE);

    expect(summary.bySource.map((entry) => [entry.source, entry.total])).toEqual([
      ['Field notes', 5],
      ['Work requests', 5],
    ]);
  });

  it('routes the three weakest fixtures to review', () => {
    const reviewIds = DEFAULT_BATCH.filter((row) => row.status === 'review').map(
      (row) => row.recordId,
    );

    expect(reviewIds).toEqual(['FN-04', 'FN-05', 'WR-04']);
  });

  it('classifies every fixture into its authored expected category when it has evidence', () => {
    for (const record of RECORDS) {
      if (record.expectedCategoryId === null) continue;
      const row = DEFAULT_BATCH.find((entry) => entry.recordId === record.id);
      expect(row?.proposedCategoryId).toBe(record.expectedCategoryId);
    }
  });

  it('never increases the automatic count when the threshold rises', () => {
    let previous = Number.POSITIVE_INFINITY;

    for (const threshold of [0, 0.1, 0.25, 0.45, 0.6, 0.75, 0.9, 1]) {
      const batch = classifyBatch(RECORDS, KNOWLEDGE_BASE, threshold);
      const automatic = batch.filter((row) => row.status === 'automatic').length;
      expect(automatic).toBeLessThanOrEqual(previous);
      previous = automatic;
    }
  });

  it('never decreases the automatic count when the threshold falls', () => {
    let previous = 0;

    for (const threshold of [1, 0.9, 0.75, 0.6, 0.45, 0.25, 0.1, 0]) {
      const batch = classifyBatch(RECORDS, KNOWLEDGE_BASE, threshold);
      const automatic = batch.filter((row) => row.status === 'automatic').length;
      expect(automatic).toBeGreaterThanOrEqual(previous);
      previous = automatic;
    }
  });

  it('produces the same batch for the same threshold', () => {
    expect(classifyBatch(RECORDS, KNOWLEDGE_BASE, 0.45)).toEqual(
      classifyBatch(RECORDS, KNOWLEDGE_BASE, 0.45),
    );
  });

  it('always totals ten records whatever the threshold', () => {
    for (const threshold of [0, 0.25, 0.45, 0.75, 1]) {
      const batch = classifyBatch(RECORDS, KNOWLEDGE_BASE, threshold);
      expect(summariseClassifications(batch, KNOWLEDGE_BASE).total).toBe(10);
    }
  });
});

describe('applyManualOverride', () => {
  it('turns one review row into a manual classification', () => {
    const overridden = applyManualOverride(
      DEFAULT_BATCH,
      'FN-04',
      'repair',
      KNOWLEDGE_BASE,
    );
    const row = overridden.find((entry) => entry.recordId === 'FN-04');

    expect(row?.status).toBe('manual');
    expect(row?.categoryId).toBe('repair');
    expect(row?.proposedCategoryId).toBeNull();
    expect(row?.explanation).toContain('Manual decision by a reviewer');
  });

  it('removes the approved row from the pending review queue', () => {
    const overridden = applyManualOverride(
      DEFAULT_BATCH,
      'FN-04',
      'repair',
      KNOWLEDGE_BASE,
    );
    const summary = summariseClassifications(overridden, KNOWLEDGE_BASE);

    expect(summary.review).toBe(2);
    expect(summary.manual).toBe(1);
    expect(summary.automatic).toBe(7);
    expect(summary.total).toBe(10);
  });

  it('keeps the source and the category of the overridden row in the summaries', () => {
    const overridden = applyManualOverride(
      DEFAULT_BATCH,
      'FN-04',
      'repair',
      KNOWLEDGE_BASE,
    );
    const summary = summariseClassifications(overridden, KNOWLEDGE_BASE);
    const fieldNotes = summary.bySource.find(
      (entry) => entry.source === 'Field notes',
    );
    const repair = summary.byCategory.find(
      (entry) => entry.categoryId === 'repair',
    );

    expect(fieldNotes?.total).toBe(5);
    expect(fieldNotes?.manual).toBe(1);
    expect(fieldNotes?.review).toBe(1);
    expect(repair?.manual).toBe(1);
    // FN-04 manual, FN-05 still pending, WR-01 automatic.
    expect(repair?.total).toBe(3);
    expect(repair?.automatic).toBe(1);
    expect(repair?.review).toBe(1);
  });

  it('does not mutate the batch it was given', () => {
    const before = JSON.stringify(DEFAULT_BATCH);
    applyManualOverride(DEFAULT_BATCH, 'FN-04', 'repair', KNOWLEDGE_BASE);
    expect(JSON.stringify(DEFAULT_BATCH)).toBe(before);
  });

  it('leaves every other row untouched', () => {
    const overridden = applyManualOverride(
      DEFAULT_BATCH,
      'FN-04',
      'repair',
      KNOWLEDGE_BASE,
    );

    for (const row of overridden) {
      if (row.recordId === 'FN-04') continue;
      expect(row).toEqual(rowOf(row.recordId));
    }
  });
});

describe('applyOverrides', () => {
  it('replays the reviewed decisions onto a fresh run', () => {
    const fresh = classifyBatch(RECORDS, KNOWLEDGE_BASE, 0.45);
    const replayed = applyOverrides(
      fresh,
      { 'FN-04': 'repair', 'FN-05': 'cleaning' },
      KNOWLEDGE_BASE,
    );
    const summary = summariseClassifications(replayed, KNOWLEDGE_BASE);

    expect(summary.manual).toBe(2);
    expect(summary.review).toBe(1);
    expect(summary.automatic).toBe(7);
    expect(summary.total).toBe(10);
  });
});

describe('summariseClassifications', () => {
  it('totals ten records at the default threshold', () => {
    const summary = summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE);

    expect(summary.total).toBe(10);
    expect(
      summary.bySource.reduce((total, entry) => total + entry.total, 0),
    ).toBe(10);
  });

  it('counts every record once across the category rows', () => {
    const summary = summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE);
    const counted = summary.byCategory.reduce(
      (total, entry) => total + entry.total,
      0,
    );

    expect(counted).toBe(10);
  });

  it('splits the source rows into automatic, review and manual buckets', () => {
    const summary = summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE);

    for (const entry of summary.bySource) {
      expect(entry.automatic + entry.review + entry.manual).toBe(entry.total);
    }
  });

  it('is stable for the same batch', () => {
    expect(summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE)).toEqual(
      summariseClassifications(DEFAULT_BATCH, KNOWLEDGE_BASE),
    );
  });
});
