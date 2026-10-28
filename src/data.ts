/**
 * Synthetic fixtures for the Service Classification Lab.
 *
 * Every string in this file was invented for this demo. Nothing is copied from
 * any real system, customer, ticket export or knowledge base.
 */

export type SourceName = 'Field notes' | 'Work requests';

export interface KnowledgeBaseEntry {
  /** Stable identifier used in the UI, in summaries and in the unit tests. */
  id: string;
  /** Human readable label. */
  label: string;
  /** One sentence describing what the category covers. */
  description: string;
  /** Authored primary terms. A hit here is strong evidence. */
  keywords: string[];
  /** Authored alternative wordings. A hit here is weaker evidence. */
  synonyms: string[];
}

export interface SourceRecord {
  /** Stable identifier, e.g. `FN-01`. */
  id: string;
  /** Which of the two invented sources the record came from. */
  source: SourceName;
  /** Short title. */
  title: string;
  /** The free-text body that is actually classified. */
  text: string;
  /** The category this fixture was authored to represent, or `null` when the fixture is intentionally unclassifiable. */
  expectedCategoryId: string | null;
}

/**
 * The four-category knowledge base. Keywords and synonyms are authored for this
 * demo; they are deliberately small so that every score can be explained by a
 * short list of matched terms.
 */
export const KNOWLEDGE_BASE: KnowledgeBaseEntry[] = [
  {
    id: 'inspection',
    label: 'Inspection',
    description:
      'A read-only check of an asset or site that records its condition without changing it.',
    keywords: ['inspection', 'inspect', 'survey', 'examine'],
    synonyms: ['audit', 'walkthrough', 'checklist', 'oversight', 'appraisal'],
  },
  {
    id: 'repair',
    label: 'Repair',
    description:
      'A corrective action that returns a failed or damaged component to working order.',
    keywords: ['repair', 'replace', 'broken', 'fault', 'overhaul'],
    synonyms: ['mend', 'patch', 'rectify', 'restore', 'renewal'],
  },
  {
    id: 'cleaning',
    label: 'Cleaning',
    description:
      'Removal of dirt, contamination or residue from equipment, surfaces or consumables.',
    keywords: ['clean', 'cleaning', 'wash', 'scrub'],
    synonyms: ['tidy', 'wipe', 'degrease', 'sanitize', 'vacuum'],
  },
  {
    id: 'calibration',
    label: 'Calibration',
    description:
      'Comparison of an instrument reading against a known reference and adjustment of its drift.',
    keywords: ['calibrate', 'calibration', 'recalibrate', 'drift'],
    synonyms: ['align', 'zeroing', 'tune', 'verify', 'benchmark'],
  },
];

/**
 * Ten authored records, five per source. The mix is deliberate:
 *
 * - `FN-01`, `FN-02`, `FN-03` and `WR-01` carry one direct keyword each
 *   (`FN-03` carries two).
 * - `WR-02` and `WR-05` are synonym-only and still classify into their
 *   expected category.
 * - `WR-03` mixes one keyword with one synonym.
 * - `FN-04` matches two categories equally and is therefore ambiguous.
 * - `FN-05` carries a single weak synonym and therefore stays in review.
 * - `WR-04` matches nothing at all and therefore stays in review.
 */
export const RECORDS: SourceRecord[] = [
  {
    id: 'FN-01',
    source: 'Field notes',
    title: 'Quarterly inspection',
    text: 'Quarterly inspection of the north pump house was signed off by the site team.',
    expectedCategoryId: 'inspection',
  },
  {
    id: 'FN-02',
    source: 'Field notes',
    title: 'Condenser coils',
    text: 'Condenser coils need a deep clean before the next shutdown.',
    expectedCategoryId: 'cleaning',
  },
  {
    id: 'FN-03',
    source: 'Field notes',
    title: 'Pressure transmitter',
    text: 'Sensor readings show drift, recalibrate before the next shift handover.',
    expectedCategoryId: 'calibration',
  },
  {
    id: 'FN-04',
    source: 'Field notes',
    title: 'Conveyor guard',
    text: 'Replace the worn guard bar and clean the frame before the shift.',
    expectedCategoryId: null,
  },
  {
    id: 'FN-05',
    source: 'Field notes',
    title: 'Guard rail paint',
    text: 'Restore the faded paint on the guard rail at the east end.',
    expectedCategoryId: 'repair',
  },
  {
    id: 'WR-01',
    source: 'Work requests',
    title: 'Gearbox housing',
    text: 'Replace cracked gearbox housing before the line restarts.',
    expectedCategoryId: 'repair',
  },
  {
    id: 'WR-02',
    source: 'Work requests',
    title: 'Safety systems audit',
    text: 'Audit and walkthrough of the fire safety systems next month.',
    expectedCategoryId: 'inspection',
  },
  {
    id: 'WR-03',
    source: 'Work requests',
    title: 'Tank service',
    text: 'Scrub the tanks and degrease the seals.',
    expectedCategoryId: 'cleaning',
  },
  {
    id: 'WR-04',
    source: 'Work requests',
    title: 'Nozzle investigation',
    text: 'Investigate the rubbing noise from the pump during the night run.',
    expectedCategoryId: null,
  },
  {
    id: 'WR-05',
    source: 'Work requests',
    title: 'Workshop tidy',
    text: 'Tidy the workshop and wipe down the benches.',
    expectedCategoryId: 'cleaning',
  },
];

export const SOURCE_NAMES: SourceName[] = ['Field notes', 'Work requests'];

export const DEFAULT_THRESHOLD = 0.45;
