import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('output/liquid-studio/browser');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const routes = process.argv[2]?.split(',') || [
  '/',
  '/orders',
  '/orders/10004824',
  '/customers',
  '/invoices',
  '/assistant',
  '/settings',
];
const widths = (process.argv[3] || '1440').split(',').map(Number);
const results = [];
try {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const route of routes) {
      const start = performance.now();
      const response = await page.goto('http://127.0.0.1:3001' + route, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      await page
        .locator('html[data-ui-ready="true"]')
        .waitFor({ timeout: 30000 });
      await page.waitForTimeout(700);
      const name =
        (route === '/'
          ? 'today'
          : route.slice(1).replaceAll('/', '-').replaceAll('?', '-')) +
        '-' +
        width;
      await page.screenshot({
        path: path.join(output, name + '-viewport.png'),
      });
      await page.screenshot({
        path: path.join(output, name + '.png'),
        fullPage: true,
      });
      const state = await page.evaluate(() => ({
        title: document.querySelector('h1')?.textContent,
        viewport: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        materials: document.documentElement.dataset.materials,
        motion: document.documentElement.dataset.motion,
        headings: [...document.querySelectorAll('h1,h2,h3')].map((n) => ({
          text: n.textContent,
          size: getComputedStyle(n).fontSize,
        })),
        text:
          document.querySelector('main')?.innerText || document.body.innerText,
      }));
      await fs.writeFile(
        path.join(output, name + '.json'),
        JSON.stringify(state, null, 2),
      );
      results.push({
        route,
        width,
        status: response.status(),
        durationMs: Math.round(performance.now() - start),
        overflow: state.overflow,
        screenshot: name + '.png',
      });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
  console.log('PAGE_ERRORS ' + JSON.stringify(errors));
  if (
    errors.length ||
    results.some((result) => result.status !== 200 || result.overflow)
  )
    process.exitCode = 1;
  let previous = { results: [], errors: [] };
  try {
    previous = JSON.parse(
      await fs.readFile(path.join(output, 'capture-results.json'), 'utf8'),
    );
  } catch {}
  const merged = new Map(
    previous.results.map((result) => [
      result.route + '|' + result.width,
      result,
    ]),
  );
  for (const result of results)
    merged.set(result.route + '|' + result.width, result);
  await fs.writeFile(
    path.join(output, 'capture-results.json'),
    JSON.stringify(
      {
        results: [...merged.values()],
        errors: [...new Set([...previous.errors, ...errors])],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
