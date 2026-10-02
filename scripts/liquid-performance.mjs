import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('output/liquid-studio/performance', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const results = [];
try {
  for (const materials of ['glass', 'solid']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    await context.addInitScript(
      (value) =>
        localStorage.setItem(
          'amiro-ui-preferences-v1',
          JSON.stringify({ version: 1, motion: 'full', materials: value }),
        ),
      materials,
    );
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3001/orders', {
      waitUntil: 'networkidle',
    });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__liquidProfile = {
        frames: [],
        longTasks: [],
        last: 0,
        active: true,
      };
      const frame = (t) => {
        const p = window.__liquidProfile;
        if (!p.active) return;
        if (p.last) p.frames.push(t - p.last);
        p.last = t;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      window.__liquidObserver = new PerformanceObserver((list) => {
        window.__liquidProfile.longTasks.push(
          ...list
            .getEntries()
            .map((e) => ({ start: e.startTime, duration: e.duration })),
        );
      });
      window.__liquidObserver.observe({ type: 'longtask', buffered: false });
    });
    await page
      .getByRole('button', { name: 'Open Amiro assistant', exact: true })
      .click();
    await page.waitForTimeout(450);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    await page
      .getByRole('button', { name: 'Collapse navigation', exact: true })
      .click();
    await page.waitForTimeout(350);
    await page
      .getByRole('button', { name: 'Expand navigation', exact: true })
      .click();
    await page.waitForTimeout(350);
    await page
      .getByRole('textbox', { name: 'Search orders', exact: true })
      .fill('Hypnos');
    await page.waitForTimeout(250);
    await page
      .getByRole('textbox', { name: 'Search orders', exact: true })
      .fill('');
    await page.waitForTimeout(250);
    const raw = await page.evaluate(() => {
      window.__liquidProfile.active = false;
      window.__liquidObserver.disconnect();
      return window.__liquidProfile;
    });
    const frames = raw.frames.slice().sort((a, b) => a - b);
    const result = {
      materials,
      frameCount: frames.length,
      medianFrameMs: frames[Math.floor(frames.length * 0.5)],
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      framesOver33ms: frames.filter((n) => n > 33.4).length,
      maxFrameMs: Math.max(...frames),
      longTasks: raw.longTasks,
      environment:
        'Headless Chrome, local development server, 1440×1000; not a production/device benchmark.',
    };
    results.push(result);
    console.log(JSON.stringify(result));
    await context.close();
  }
  await fs.writeFile(
    'output/liquid-studio/performance/results.json',
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
