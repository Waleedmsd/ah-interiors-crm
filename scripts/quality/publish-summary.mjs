import { readFile, appendFile, writeFile } from 'node:fs/promises';
const root = '.runtime/ci-evidence';
const summary = { commit: '', tests: {}, browsers: {}, failures: [] };
const escape = value => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
try { summary.commit = (await readFile(root + '/commit.txt', 'utf8')).trim(); } catch {}
for (const name of ['domain', 'backend']) {
  try {
    const text = await readFile(`${root}/${name}-tests.log`, 'utf8');
    const counts = {};
    for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped']) {
      const match = text.match(new RegExp(`(?:#|ℹ) ${key} (\\d+)`, 'g'))?.at(-1);
      if (match) counts[key] = Number(match.match(/\d+$/)[0]);
    }
    summary.tests[name] = counts;
    const failures = text.split('\n').filter(line => /^not ok|^✖|^Error:|error TS/.test(line)).slice(0, 10);
    if (failures.length) summary.failures.push({ suite: name, failures });
    console.log(`::${counts.fail || !counts.tests ? 'error' : 'notice'} title=${name} test results::${escape(JSON.stringify({ ...counts, failures }))}`);
  } catch { console.log(`::warning title=Missing ${name} test evidence::The ${name} test log was not produced.`); }
}
const seen = new Set();
let annotations = 0;
for (const name of ['browser', 'staff-browser']) {
  try {
    const report = JSON.parse(await readFile(`${root}/${name}/report.json`, 'utf8'));
    let serious = 0;
    for (const check of report.checks ?? []) {
      for (const violation of check.violations ?? []) {
        if (!['critical', 'serious'].includes(violation.impact)) continue;
        serious++;
        for (const node of violation.nodes ?? []) {
          const detail = { suite: name, role: check.role, route: check.route, width: check.width, rule: violation.id, target: node.target, summary: node.summary };
          const key = JSON.stringify([violation.id, node.target, node.summary]);
          if (seen.has(key)) continue;
          seen.add(key);
          summary.failures.push(detail);
          if (annotations++ < 8) console.log(`::error title=Accessibility ${violation.id}::${escape(JSON.stringify(detail))}`);
        }
      }
    }
    summary.browsers[name] = { pages: report.checks?.length ?? 0, errors: report.errors ?? [], failedRequests: report.failedRequests ?? [], failures: report.failures ?? [], seriousViolationOccurrences: serious };
    const failed = serious || report.errors?.length || report.failedRequests?.length || report.failures?.length;
    console.log(`::${failed ? 'error' : 'notice'} title=${name} results::${escape(JSON.stringify(summary.browsers[name]))}`);
  } catch { console.log(`::warning title=Missing ${name} evidence::The ${name} report was not produced. This does not count as a passing browser test.`); }
}
await writeFile(root + '/verification-summary.json', JSON.stringify(summary, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## CRM verification\n\nExact tested commit: \`${summary.commit}\`\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nShopify credentials are absent. These checks use synthetic data in the disposable CI database. No production deployment is performed.\n`);
