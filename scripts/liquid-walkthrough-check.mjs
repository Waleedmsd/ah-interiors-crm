import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const output = 'output/liquid-studio';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(pathToFileURL(path.resolve(output, 'walkthrough.html')).href);
  const sources = await page
    .locator('img')
    .evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  for (const source of sources) await fs.access(path.resolve(output, source));
  await page.locator('img').evaluateAll((images) =>
    Promise.all(
      images.map(async (image) => {
        image.loading = 'eager';
        await image.decode();
      }),
    ),
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: output + '/walkthrough-' + width + '.png' });
  }
  console.log(
    JSON.stringify({
      images: sources.length,
      brokenImages: 0,
      checkedWidths: [390, 768, 1440],
      pageOverflow: false,
    }),
  );
} finally {
  await browser.close();
}
