import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = 'http://127.0.0.1:4107';

async function runClassification(page: Page): Promise<void> {
  await page.getByTestId('run-classification').click();
  await expect(page.getByTestId('count-total')).toHaveText('10');
}

/** The record ids currently listed in the review queue, in DOM order. */
async function reviewQueueIds(page: Page): Promise<string[]> {
  return page
    .getByTestId('review-queue')
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) =>
        (item.getAttribute('data-testid') ?? '').replace('review-item-', ''),
      ),
    );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Service Classification Lab' }),
  ).toBeVisible();
});

test('the page shows the synthetic data notice, the sources and the knowledge base', async ({
  page,
}) => {
  await expect(page.getByTestId('synthetic-notice')).toContainText('Synthetic data');
  await expect(page.getByTestId('source-records')).toBeVisible();
  await expect(page.getByTestId('source-record-FN-01')).toContainText('FN-01');
  await expect(page.getByTestId('source-record-WR-05')).toContainText('WR-05');
  await expect(page.getByTestId('knowledge-base')).toBeVisible();
  await expect(page.getByTestId('kb-entry-inspection')).toContainText('Inspection');
  await expect(page.getByTestId('kb-entry-repair')).toContainText('Repair');
  await expect(page.getByTestId('kb-entry-cleaning')).toContainText('Cleaning');
  await expect(page.getByTestId('kb-entry-calibration')).toContainText('Calibration');
});

test('the default run reports ten records split into seven automatic and three review', async ({
  page,
}) => {
  await runClassification(page);

  await expect(page.getByTestId('count-total')).toHaveText('10');
  await expect(page.getByTestId('count-automatic')).toHaveText('7');
  await expect(page.getByTestId('count-review')).toHaveText('3');
  await expect(page.getByTestId('count-manual')).toHaveText('0');
});

test('the source summaries keep five records per source', async ({ page }) => {
  await runClassification(page);

  const fieldNotes = page.getByTestId('summary-source-Field notes');
  await expect(fieldNotes).toContainText('Field notes');
  await expect(fieldNotes.locator('td').nth(0)).toHaveText('5');

  const workRequests = page.getByTestId('summary-source-Work requests');
  await expect(workRequests.locator('td').nth(0)).toHaveText('5');
});

test('a classified row shows its matched terms and its confidence explanation', async ({
  page,
}) => {
  await runClassification(page);

  await expect(page.getByTestId('status-FN-01')).toHaveText('Automatic');
  await expect(page.getByTestId('category-FN-01')).toHaveText('Inspection');
  await expect(page.getByTestId('confidence-FN-01')).toHaveText('0.50');
  await expect(page.getByTestId('terms-FN-01')).toContainText('inspection');
  await expect(page.getByTestId('explanation-FN-01')).toContainText('Best match Inspection');
  await expect(page.getByTestId('explanation-FN-01')).toContainText('0.50');
});

test('a synonym-only row still reaches the right category', async ({ page }) => {
  await runClassification(page);

  await expect(page.getByTestId('status-WR-02')).toHaveText('Automatic');
  await expect(page.getByTestId('category-WR-02')).toHaveText('Inspection');
  await expect(page.getByTestId('terms-WR-02')).toContainText('audit');
  await expect(page.getByTestId('terms-WR-02')).toContainText('walkthrough');
});

test('the review queue lists the three low-confidence records', async ({ page }) => {
  await runClassification(page);

  await expect(page.getByTestId('review-item-FN-04')).toBeVisible();
  await expect(page.getByTestId('review-item-FN-05')).toBeVisible();
  await expect(page.getByTestId('review-item-WR-04')).toBeVisible();
  await expect(page.getByTestId('review-queue').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('status-FN-05')).toHaveText('Needs review');
  await expect(page.getByTestId('status-WR-04')).toHaveText('Needs review');
});

test('the review queue can be filtered by source', async ({ page }) => {
  await runClassification(page);

  await page.getByTestId('review-source-filter').selectOption('Work requests');
  await expect(page.getByTestId('review-queue').getByRole('listitem')).toHaveCount(1);
  await expect(page.getByTestId('review-item-WR-04')).toBeVisible();

  await page.getByTestId('review-source-filter').selectOption('Field notes');
  await expect(page.getByTestId('review-queue').getByRole('listitem')).toHaveCount(2);
});

test('the review queue can be filtered by suggested category', async ({ page }) => {
  await runClassification(page);

  // Only FN-05 carries a Repair suggestion, so the filter must return exactly
  // that row and never everything except the chosen category.
  await page.getByTestId('review-category-filter').selectOption('repair');
  expect(await reviewQueueIds(page)).toEqual(['FN-05']);

  // No review record suggests Cleaning, so the queue really is empty.
  await page.getByTestId('review-category-filter').selectOption('cleaning');
  await expect(page.getByTestId('review-empty')).toBeVisible();
  expect(await reviewQueueIds(page)).toEqual([]);

  // The "No suggestion" option collects the ambiguous and the no-match rows.
  await page.getByTestId('review-category-filter').selectOption('none');
  expect(await reviewQueueIds(page)).toEqual(['FN-04', 'WR-04']);
});

test('approving one review item makes it manual and removes it from the queue', async ({
  page,
}) => {
  await runClassification(page);

  await page.getByTestId('review-select-FN-04').selectOption('repair');
  await page.getByTestId('review-approve-FN-04').click();

  await expect(page.getByTestId('count-manual')).toHaveText('1');
  await expect(page.getByTestId('count-review')).toHaveText('2');
  await expect(page.getByTestId('count-automatic')).toHaveText('7');
  await expect(page.getByTestId('count-total')).toHaveText('10');

  await expect(page.getByTestId('review-item-FN-04')).toHaveCount(0);
  await expect(page.getByTestId('review-queue').getByRole('listitem')).toHaveCount(2);

  await expect(page.getByTestId('status-FN-04')).toHaveText('Manual override');
  await expect(page.getByTestId('category-FN-04')).toHaveText('Repair');

  const fieldNotes = page.getByTestId('summary-source-Field notes');
  await expect(fieldNotes.locator('td').nth(0)).toHaveText('5');
  await expect(fieldNotes.locator('td').nth(3)).toHaveText('1');
});

test('a default rerun clears the manual override', async ({ page }) => {
  await runClassification(page);

  await page.getByTestId('review-select-FN-04').selectOption('repair');
  await page.getByTestId('review-approve-FN-04').click();
  await expect(page.getByTestId('count-manual')).toHaveText('1');

  await page.getByTestId('run-classification').click();

  await expect(page.getByTestId('count-manual')).toHaveText('0');
  await expect(page.getByTestId('count-automatic')).toHaveText('7');
  await expect(page.getByTestId('count-review')).toHaveText('3');
  await expect(page.getByTestId('count-total')).toHaveText('10');
  await expect(page.getByTestId('status-FN-04')).toHaveText('Needs review');
});

test('the keep option preserves the manual override across a rerun', async ({ page }) => {
  await runClassification(page);

  await page.getByTestId('review-select-FN-04').selectOption('repair');
  await page.getByTestId('review-approve-FN-04').click();
  await expect(page.getByTestId('count-manual')).toHaveText('1');

  await page.getByTestId('keep-overrides').check();
  await page.getByTestId('run-classification').click();

  await expect(page.getByTestId('count-manual')).toHaveText('1');
  await expect(page.getByTestId('count-review')).toHaveText('2');
  await expect(page.getByTestId('count-total')).toHaveText('10');
  await expect(page.getByTestId('status-FN-04')).toHaveText('Manual override');
  await expect(page.getByTestId('category-FN-04')).toHaveText('Repair');
});

test('raising the threshold never increases the automatic count', async ({ page }) => {
  await runClassification(page);
  await expect(page.getByTestId('count-automatic')).toHaveText('7');

  await page.getByTestId('threshold-input').fill('0.8');
  await expect(page.getByTestId('results-cleared')).toBeVisible();
  await page.getByTestId('run-classification').click();

  await expect(page.getByTestId('count-total')).toHaveText('10');
  const raised = Number(await page.getByTestId('count-automatic').innerText());
  expect(raised).toBeLessThanOrEqual(7);

  await page.getByTestId('threshold-input').fill('0.2');
  await page.getByTestId('run-classification').click();

  await expect(page.getByTestId('count-total')).toHaveText('10');
  const lowered = Number(await page.getByTestId('count-automatic').innerText());
  expect(lowered).toBeGreaterThanOrEqual(raised);
});

test('reset restores the default threshold and the default split', async ({ page }) => {
  await runClassification(page);

  await page.getByTestId('threshold-input').fill('0.9');
  await page.getByTestId('run-classification').click();
  await page.getByTestId('review-select-FN-04').selectOption('repair');
  await page.getByTestId('review-approve-FN-04').click();

  await page.getByTestId('reset-classification').click();

  await expect(page.getByTestId('threshold-input')).toHaveValue('0.45');
  await expect(page.getByTestId('count-total')).toHaveText('10');
  await expect(page.getByTestId('count-automatic')).toHaveText('7');
  await expect(page.getByTestId('count-review')).toHaveText('3');
  await expect(page.getByTestId('count-manual')).toHaveText('0');
  await expect(page.getByTestId('keep-overrides')).not.toBeChecked();
});

test('the page does not overflow horizontally at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await runClassification(page);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('the page has no serious or critical accessibility violations', async ({ page }) => {
  await runClassification(page);
  await page.getByTestId('review-select-FN-04').selectOption('repair');

  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  expect(blocking).toEqual([]);
});

test('the running page makes no request to a non-local origin', async ({ page }) => {
  const externalRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (
      !url.startsWith(BASE_URL) &&
      !url.startsWith('data:') &&
      !url.startsWith('blob:') &&
      !url.startsWith('about:')
    ) {
      externalRequests.push(url);
    }
    await route.continue();
  });

  await runClassification(page);
  await page.getByTestId('review-select-FN-04').selectOption('repair');
  await page.getByTestId('review-approve-FN-04').click();
  await expect(page.getByTestId('count-manual')).toHaveText('1');

  expect(externalRequests).toEqual([]);
});
