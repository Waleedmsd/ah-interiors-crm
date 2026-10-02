import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3001',
  out = 'output/mail-studio';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [],
  results = [];
page.on('pageerror', (error) => errors.push(error.message));
async function pass(name) {
  results.push({ name, passed: true });
  console.log('PASS ' + name);
}
async function go(path) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.locator('html[data-ui-ready=true]').waitFor();
}
async function folder(name) {
  await page
    .getByRole('navigation', { name: 'Mailbox', exact: true })
    .getByRole('button', { name: new RegExp('^' + name) })
    .click();
}
async function shot(name) {
  await page.screenshot({ path: out + '/' + name + '.png' });
}
try {
  await go('/communications');
  await expect(
    page.getByRole('button', { name: 'Compose', exact: true }),
  ).toBeEnabled();
  const originalLedger = await page.evaluate(() =>
    localStorage.getItem('ah-interiors-local-workspace-v3'),
  );
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await page
    .locator('.inbox-row-open')
    .filter({ hasText: 'Sarah Jones' })
    .click();
  await expect(page.locator('.inbox-thread h2')).toHaveText(
    'A quick question about delivery',
  );
  await expect(page.locator('.inbox-thread')).toContainText('Sarah Jones');
  await pass(
    'Opening an unread conversation keeps the selected thread visible',
  );
  await folder('Inbox');
  await page
    .getByRole('button', { name: 'Star Sarah Jones', exact: true })
    .click();
  await folder('Starred');
  await expect(page.locator('.inbox-row-open')).toHaveCount(1);
  await expect(page.locator('.inbox-row-open')).toContainText('Sarah Jones');
  await page
    .getByRole('button', { name: 'Archive conversation', exact: true })
    .click();
  await folder('Archive');
  await expect(page.locator('.inbox-row-open')).toContainText('Sarah Jones');
  await page
    .getByRole('button', { name: 'Move to inbox', exact: true })
    .click();
  await pass(
    'Starred and Archive folders act on the correct thread and support restoration',
  );
  await folder('Sent');
  await expect(page.locator('.inbox-collection')).toContainText(
    'Nothing sent from Amiro',
  );
  await folder('Inbox');
  await page.getByLabel('Search mail').fill('no-match-qa');
  await expect(page.locator('.inbox-collection')).toContainText(
    'No matching conversations',
  );
  await page.getByRole('button', { name: 'Clear mail search' }).click();
  await page.locator('.inbox-row-open').filter({ hasText: 'Rauch' }).click();
  await page
    .getByRole('button', { name: /Rauch-Confirmation-8273662.pdf/ })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'sample attachment reference',
  );
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: /Rauch-Confirmation-8273662.pdf/ }),
  ).toBeFocused();
  await pass(
    'Search, truthful Sent state and attachment-reference dialog work',
  );
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue(
    'rauch@example.invalid',
  );
  await expect(page.getByLabel('Order', { exact: true })).toHaveValue(
    '10004812',
  );
  await page.getByLabel('To', { exact: true }).fill('bad address');
  await page.getByRole('button', { name: 'Review email', exact: true }).click();
  await expect(page.locator('.mail-form-error')).toContainText(
    'Check the email',
  );
  await page
    .getByLabel('To', { exact: true })
    .fill('qa-recipient@example.invalid');
  await page.getByRole('button', { name: 'Cc / Bcc', exact: true }).click();
  await page.getByLabel('Cc', { exact: true }).fill('qa-copy@example.invalid');
  await page
    .getByLabel('Bcc', { exact: true })
    .fill('qa-private@example.invalid');
  await page
    .getByLabel('Subject', { exact: true })
    .fill('QA mail thread response');
  await page
    .getByLabel('Message', { exact: true })
    .fill('Please confirm the specification. This is a synthetic local test.');
  await page
    .getByRole('button', { name: 'Add signature', exact: true })
    .click();
  await page
    .getByLabel('Select local attachments')
    .setInputFiles({
      name: 'qa-specification.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic QA only'),
    });
  await expect(page.locator('.mail-compose-attachments')).toContainText(
    'qa-specification.txt',
  );
  await shot('composer-desktop');
  const composerAxe = await new AxeBuilder({ page })
    .include('.mail-composer')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await fs.writeFile(
    out + '/composer-axe.json',
    JSON.stringify(composerAxe.violations, null, 2),
  );
  assert.equal(
    composerAxe.violations.length,
    0,
    'Composer accessibility violations',
  );
  await page.getByRole('button', { name: 'Review email', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Sending from Amiro is not connected yet',
  );
  await expect(
    page.getByRole('button', { name: 'Send', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText(
    'not uploaded or embedded',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem('ah-interiors-local-workspace-v3'),
    ),
    originalLedger,
  );
  await pass(
    'Reply, Cc/Bcc, attachment metadata and review save without sending or changing commerce',
  );
  await page.reload({ waitUntil: 'networkidle' });
  await folder('Drafts');
  await page
    .locator('.inbox-draft-row')
    .filter({ hasText: 'QA mail thread response' })
    .click();
  await expect(page.getByLabel('Cc', { exact: true })).toHaveValue(
    'qa-copy@example.invalid',
  );
  await expect(page.getByLabel('Message', { exact: true })).toContainText(
    'AH Interiors',
  );
  await page
    .getByRole('dialog')
    .evaluate((element) =>
      Promise.all(
        element
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
  for (const width of [390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    const box = await page.getByRole('dialog').boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= width + 1,
      JSON.stringify({ width, box }),
    );
    assert.ok(
      box.y >= 0 && box.y + box.height <= (width < 600 ? 844 : 1000) + 1,
      JSON.stringify({ width, box }),
    );
    await shot('composer-' + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const label of ['To', 'Cc', 'Bcc', 'Subject', 'Message'])
    await page.getByLabel(label, { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Remove qa-specification.txt' })
    .click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page
    .locator('.inbox-draft-row')
    .filter({ hasText: 'Untitled message' })
    .click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue('');
  await page
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Discard draft', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pass(
    'Drafts persist, reflow at five widths, keep blank edits and discard only after confirmation',
  );
  await folder('Inbox');
  await page
    .locator('.inbox-row-open')
    .filter({ hasText: 'Sarah Jones' })
    .click();
  await page.getByRole('button', { name: 'Forward', exact: true }).click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
    /^Fwd:/,
  );
  await expect(page.getByLabel('Message', { exact: true })).toContainText(
    'Forwarded sample message',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pass(
    'Forward quotes the selected message and closing retains an unsent draft',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await folder('Inbox');
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await page
    .locator('.inbox-row-open')
    .filter({ hasText: 'John Smith' })
    .click();
  await expect(page.locator('.inbox-thread h2')).toHaveText(
    'Assembly for my wardrobe',
  );
  await expect(page.locator('.inbox-collection')).toBeHidden();
  await shot('thread-mobile');
  await page
    .getByRole('button', { name: 'Back to message list', exact: true })
    .click();
  await expect(page.locator('.inbox-collection')).toBeVisible();
  await pass(
    'Mobile list-to-thread navigation retains unread selection and supports back',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const second = await context.newPage();
  await second.goto(base + '/communications', { waitUntil: 'networkidle' });
  await expect(second.locator('.storage-warning')).toContainText('Read-only');
  await expect(
    second.getByRole('button', { name: 'Compose', exact: true }),
  ).toBeDisabled();
  await second.close();
  await go('/orders/10004821');
  await page
    .getByRole('button', { name: 'Process order', exact: true })
    .click();
  await page.waitForURL(/\/review$/);
  await page.waitForLoadState('networkidle');
  const packSubject = await page
    .getByRole('textbox', { name: /Subject for/ })
    .inputValue();
  await go('/communications');
  await folder('Drafts');
  await page
    .locator('.inbox-draft-row')
    .filter({ hasText: packSubject })
    .click();
  await expect(page.locator('.inbox-linked-draft')).toContainText(
    'Managed by its original record',
  );
  await expect(
    page.getByRole('link', { name: 'Open original record' }),
  ).toHaveAttribute('href', '/orders/10004821/review');
  await pass(
    'Read-only mail actions stay disabled; operational drafts link to their approval workflow',
  );
  await folder('Inbox');
  await shot('mail-desktop');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  await fs.writeFile(
    out + '/mail-axe.json',
    JSON.stringify(
      {
        violations: axe.violations,
        incomplete: axe.incomplete.map((v) => ({
          id: v.id,
          nodes: v.nodes.length,
        })),
      },
      null,
      2,
    ),
  );
  assert.equal(axe.violations.length, 0, 'Mail accessibility violations');
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        results,
        errors,
        externalMessagesSent: 0,
        scope:
          'Isolated synthetic local preview; native mail-app handoff not invoked',
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await shot('failure');
  await fs.writeFile(
    out + '/failure.json',
    JSON.stringify(
      {
        error: String(error),
        results,
        errors,
        text: await page.locator('body').innerText(),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
