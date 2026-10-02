import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import postcss from 'postcss';
const codex = 'C:/Users/AMIR PC/AppData/Local/OpenAI/Codex/bin/codex.exe';
function applyFile(file, body) {
  const chunks = [];
  let chunk = '';
  for (const line of body.split('\n')) {
    if (chunk.length + line.length > 17000) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += line + '\n';
  }
  if (chunk) chunks.push(chunk);
  for (let i = 0; i < chunks.length; i++) {
    const lines = (chunks[i].trimEnd() + '\n/* liquid-css-build-end */')
      .split('\n')
      .map((line) => '+' + line)
      .join('\n');
    const patch =
      i === 0
        ? '*** Begin Patch\n*** Add File: ' +
          file +
          '\n' +
          lines +
          '\n*** End Patch'
        : '*** Begin Patch\n*** Update File: ' +
          file +
          '\n@@\n-/* liquid-css-build-end */\n' +
          lines +
          '\n*** End Patch';
    const result = spawnSync(codex, ['--codex-run-as-apply-patch', patch], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0)
      throw new Error(result.stderr + ' ' + result.stdout);
  }
  console.log(file + ': ' + body.length + ' characters');
}
const original = readFileSync('app/globals.css', 'utf8');
if (!existsSync('output/liquid-studio/baseline-source/globals.css'))
  applyFile('output/liquid-studio/baseline-source/globals.css', original);
const root = postcss.parse(original);
root.walkAtRules((rule) => {
  if (
    rule.name === 'keyframes' ||
    (rule.name === 'media' && rule.params.includes('prefers-reduced-motion'))
  )
    rule.remove();
});
const presentation =
  /^(background(?:-.+)?|color|box-shadow|border(?:-.+)?|font-size|font-family|letter-spacing|text-shadow|backdrop-filter|filter|animation(?:-.+)?|transition(?:-.+)?|transform|opacity)$/;
root.walkRules((rule) => {
  let parent = rule.parent;
  let preserve = false;
  while (parent) {
    if (
      parent.type === 'atrule' &&
      ((parent.name === 'media' && parent.params === 'print') ||
        parent.name === 'layer' ||
        parent.name === 'theme')
    )
      preserve = true;
    parent = parent.parent;
  }
  if (preserve) return;
  if (
    rule.selector === ':root' ||
    rule.selector === '.dark' ||
    /(^|[ ,])\.sidebar(?:[ .:#>]|$)|\.topbar|\.workspace-switch|\.sidebar-preview|\.profile-row/.test(
      rule.selector,
    )
  ) {
    rule.remove();
    return;
  }
  rule.walkDecls((decl) => {
    if (presentation.test(decl.prop)) decl.remove();
  });
  if (!rule.nodes?.length) rule.remove();
});
root.walkComments((comment) => comment.remove());
root.walkAtRules((rule) => {
  if (rule.nodes && !rule.nodes.length) rule.remove();
});
applyFile(
  'app/globals.css',
  '/* Structural compatibility styles; visual roles live in reskin.css. */\n' +
    root.toString(),
);
const skin = postcss.parse(readFileSync('app/reskin.css', 'utf8'));
function luminance(hex) {
  const rgb = hex
    .match(/\w\w/g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
skin.walkDecls((decl) => {
  if (decl.prop === 'font-size' && /^\d+px$/.test(decl.value)) {
    const n = parseInt(decl.value);
    if (n < 12) decl.value = '12px';
    else if (n === 13) decl.value = '14px';
  }
  if (decl.prop === 'color' && /^#[0-9a-f]{6}$/i.test(decl.value)) {
    let hex = decl.value.slice(1);
    if (luminance(hex) < 0.9) {
      while ((luminance('f1f4f9') + 0.05) / (luminance(hex) + 0.05) < 4.55) {
        hex = hex
          .match(/\w\w/g)
          .map((v) =>
            Math.max(0, Math.floor(parseInt(v, 16) * 0.95))
              .toString(16)
              .padStart(2, '0'),
          )
          .join('');
      }
      decl.value = '#' + hex;
    }
  }
});
applyFile('app/reskin.css', skin.toString());
