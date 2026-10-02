import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
await fs.mkdir('output/liquid-studio/accessibility', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
if (process.env.LIQUID_SOLID === '1')
  await context.addInitScript(() =>
    localStorage.setItem(
      'amiro-ui-preferences-v1',
      JSON.stringify({ version: 1, motion: 'reduced', materials: 'solid' }),
    ),
  );
const page = await context.newPage();
const results = [];
const routes = (
  process.argv[2] ||
  '/,/orders,/orders/10004824,/reviews,/customers,/customers?customer=C-0001,/invoices,/invoices/new,/purchasing,/assembly,/communications,/documents,/settings,/assistant,/design-system'
).split(',');
try {
  for (const route of routes) {
    await page.goto('http://127.0.0.1:3001' + route, {
      waitUntil: 'networkidle',
    });
    await page.locator('html[data-ui-ready=true]').waitFor();
    await page.waitForTimeout(700);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const summary = {
      route,
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
          html: n.html,
        })),
      })),
      incomplete: result.incomplete.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
      passes: result.passes.length,
    };
    results.push(summary);
    console.log(
      JSON.stringify({
        route,
        violations: summary.violations.map((v) => ({
          id: v.id,
          n: v.nodes.length,
        })),
        incomplete: summary.incomplete,
      }),
    );
  }
  await fs.writeFile(
    'output/liquid-studio/accessibility/axe-results' +
      (process.env.LIQUID_SOLID === '1' ? '-solid' : '') +
      '.json',
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
