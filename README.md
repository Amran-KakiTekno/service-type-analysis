# Service Classification Lab

A standalone, fully client-side single-page demo of **deterministic, knowledge-assisted
classification** with confidence-based human review.

The demo classifies ten invented service records across two invented sources against an
original four-category knowledge base. Every automatic decision is explained by the
knowledge-base terms that produced it, every low-confidence record is routed to a review
queue, and a reviewer can approve a manual override that is clearly distinguished from the
automatic results.

**Everything in this repository is synthetic.** No real customer, ticket, work order,
knowledge base, schema or field-name set was used. There is no backend, no external AI or
ML service, no network request at runtime, no routing and no persistence.

---

## The algorithm

The classifier is a transparent rule engine, not a machine-learning model. Given a record
title, a record body and a knowledge base, it produces a deterministic score for every
category.

### 1. Tokenisation — `tokenise(text)`

- lower-cases the text;
- splits on every character that is not a letter or a digit;
- drops tokens shorter than three characters;
- drops a small authored stop-word list;
- de-duplicates, keeping the order of first appearance.

The record title and the record body are tokenised together, separated by a full stop, so
a term in the title counts exactly like a term in the body.

### 2. Matching

Every category carries two authored term lists:

| List | Weight | Meaning |
| --- | ---: | --- |
| `keywords` | `0.50` | the primary wording of the category |
| `synonyms` | `0.25` | an alternative wording of the same category |

A term matches when it is one of the record's tokens. The score of a category is the sum of
the weights of the distinct terms it matched, **capped at 1.00**:

```
score(category) = min(1, 0.50 * matched keywords + 0.25 * matched synonyms)
```

The categories are ranked by score. Ties are broken by the knowledge-base declaration order,
so the output never depends on object iteration order.

### 3. Confidence and the review queue

A record is **automatic** when it has evidence, is not ambiguous, and its score reaches the
confidence threshold (default `0.45`). Everything else is **needs review**:

- a record with no matched term at all (score `0.00`);
- a record whose best score is below the threshold;
- a record where two or more categories tie at the top score (**ambiguous**).

Because the automatic test only depends on the record's own score, raising the threshold can
never increase the automatic count and lowering it can never decrease it. This is pinned by
unit tests.

### 4. Manual overrides

A reviewer picks a category in the review queue and approves it. The row then becomes a
**manual override**: it leaves the pending review queue, it keeps its source and its chosen
category in the summaries, and it carries a distinct `Manual override` status badge in the
results table.

### 5. Rerun semantics

- A **default rerun** (`Keep reviewed overrides` off, the default) discards every manual
  decision and reclassifies the ten records from scratch.
- A rerun with **`Keep reviewed overrides`** switched on replays the recorded decisions
  onto the fresh classification, so the reviewer's work survives the rerun.
- `Reset` restores the default threshold `0.45`, clears the overrides and the keep option,
  clears the review filters and reclassifies the ten records.
- Changing the threshold clears the previous result and shows a "run the classification
  again" notice, so a stale result can never be read as if it matched the current controls.
- The batch summary **always totals 10 records**, whatever the threshold or the manual
  decisions are.

---

## The synthetic data

### Sources — 10 records, 5 per source

| Record | Source | Category it was authored for | Why it lands where it does |
| --- | --- | --- | --- |
| `FN-01` | Field notes | Inspection | direct keyword `inspection` (0.50) |
| `FN-02` | Field notes | Cleaning | direct keyword `clean` (0.50) |
| `FN-03` | Field notes | Calibration | keywords `drift` + `recalibrate` (1.00) |
| `FN-04` | Field notes | — | `replace` and `clean` tie at 0.50 → **ambiguous** |
| `FN-05` | Field notes | Repair | synonym `restore` only (0.25) → below threshold |
| `WR-01` | Work requests | Repair | direct keyword `replace` (0.50) |
| `WR-02` | Work requests | Inspection | synonyms `audit` + `walkthrough` (0.50) → **synonym-only** |
| `WR-03` | Work requests | Cleaning | keyword `scrub` + synonym `degrease` (0.75) |
| `WR-04` | Work requests | — | no term matched (0.00) → **no match** |
| `WR-05` | Work requests | Cleaning | synonyms `tidy` + `wipe` (0.50) → **synonym-only** |

At the default threshold of `0.45` the batch splits into **10 total / 7 automatic /
3 review**, and the source totals stay at **5 + 5**. The three review records are `FN-04`
(ambiguous), `FN-05` (weak synonym, 0.25) and `WR-04` (no match).

### Knowledge base — 4 original categories

| Category | Keywords | Synonyms |
| --- | --- | --- |
| Inspection | `inspection`, `inspect`, `survey`, `examine` | `audit`, `walkthrough`, `checklist`, `oversight`, `appraisal` |
| Repair | `repair`, `replace`, `broken`, `fault`, `overhaul` | `mend`, `patch`, `rectify`, `restore`, `renewal` |
| Cleaning | `clean`, `cleaning`, `wash`, `scrub` | `tidy`, `wipe`, `degrease`, `sanitize`, `vacuum` |
| Calibration | `calibrate`, `calibration`, `recalibrate`, `drift` | `align`, `zeroing`, `tune`, `verify`, `benchmark` |

Every keyword and every synonym above was written for this demo.

---

## Limitations

- **This is not machine learning.** The classifier is a weighted keyword and synonym
  matcher with a fixed stop-word list. It has no model, no training data, no embeddings and
  no generalisation beyond the authored knowledge base.
- **No claim of production accuracy.** The 7 / 3 split is a property of these ten
  hand-written fixtures and this threshold. It says nothing about how the same rule engine
  would behave on real service records, and it is not an accuracy measurement of any kind.
- **English only, and exact token matching.** The tokens are compared literally after
  lower-casing. There is no stemming, lemmatisation, fuzzy matching, phrase handling or
  negation handling, so `unclean` does not match `clean` and `did not repair` does match
  `repair`.
- **The weights are hand-picked.** `0.50` for a keyword and `0.25` for a synonym, capped at
  `1.00`, are round numbers chosen so the arithmetic is legible. They were not fitted to
  anything.
- **A small, hand-written stop-word list.** It removes common English function words, not
  domain vocabulary, but it is nonetheless a hand-written approximation.
- **The record count is ten.** The demo shows the shape of a classification workflow, not
  its throughput, and it is not designed to run over thousands of records.
- **State lives in memory.** The threshold, the overrides and the filters are React state.
  Reloading the page loses them, and nothing is written to storage.

---

## Commands

```bash
npm ci             # clean install
npm run dev        # dev server on http://127.0.0.1:4107
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit suite (src/domain.test.ts)
npm run build      # typecheck + vite build into dist/
npm run test:e2e   # Playwright browser suite (builds first)
npm run verify     # typecheck -> unit -> build -> Playwright -> artifact check
```

`npm run verify` finishes with the artifact check, which asserts that `dist/` holds exactly
one HTML file, that the JavaScript and CSS bundles are non-empty and that the demo meta
marker is present, then prints `VERIFY_OK service-type-analysis`.

Playwright drives the installed system Chrome (`channel: "chrome"`, no browser download)
against a Vite preview server on the reserved port `4107`.

## Project layout

| Path | Role |
| --- | --- |
| `src/data.ts` | The 10 authored records, the 4 knowledge-base entries, the default threshold. |
| `src/domain.ts` | Pure `tokenise`, `classifyRecord`, `classifyBatch`, `summariseClassifications`, `applyManualOverride`, `applyOverrides`. |
| `src/domain.test.ts` | 30 Vitest unit tests. |
| `src/App.tsx` | Threshold and run controls, summaries, the explanation table, the review workflow. |
| `src/styles.css` | Dark lab styling, responsive down to 390px. |
| `tests/demo.spec.ts` | 16 Playwright browser tests. |
| `scripts/verify-build.mjs` | The `dist/` artifact check. |
