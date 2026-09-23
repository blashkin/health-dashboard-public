// Снимки для README: восемь файлов в docs/shots, по четыре на язык.
// Снимаются тем же Playwright, что и проверки, и с той же собранной страницы, поэтому
// пересъёмка — одна команда, а не ручная работа. Данные только синтетические.
// Собрать страницу:  python3 -m health_dashboard demo -o out/demo
//                    python3 -m health_dashboard build out/demo/fake_archive.zip -o out/check
// Снять:             node tests/ui/shots.cjs [out/check/dashboard.html]
// Playwright берётся из локальной установки или из PLAYWRIGHT_MODULE=/path/to/playwright.
const fs = require('fs'), path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const PAGE = path.resolve(process.argv[2] || process.env.HEALTH_DASHBOARD_HTML || path.join(REPO, 'out', 'check', 'dashboard.html'));
const OUT = path.join(REPO, 'docs', 'shots');

// Порядок и есть смысл набора: сначала две светлые, потом две тёмные; от «что со мной»
// к «из чего это сложилось». Имя файла начинается с номера, чтобы порядок был виден в папке.
const PLAN = [
  { name: '1-cover', theme: 'light', tab: 'story', sel: '.cover' },
  { name: '2-norm', theme: 'light', tab: 'story', sel: '[data-role="norm"]' },
  { name: '3-wall', theme: 'dark', tab: 'story', sel: '[data-role="wall"]' },
  { name: '4-sport', theme: 'dark', tab: 'workouts', sel: '[data-ui="app"] .panel' },
];
const LANGS = ['en', 'ru'];
const WIDTH = 1280, PAD = 16, MAX_HEIGHT = 1400;

function loadPlaywright() {
  for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)) {
    try { return require(id); } catch {}
  }
  console.error('Playwright not found. Install it locally or set PLAYWRIGHT_MODULE to its path.');
  process.exit(2);
}

(async () => {
  if (!fs.existsSync(PAGE)) {
    console.error('Page not found: ' + PAGE + '\nRun: python3 -m health_dashboard demo -o out/demo && python3 -m health_dashboard build out/demo/fake_archive.zip -o out/check');
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  let total = 0;
  try {
    for (const lang of LANGS) for (const step of PLAN) {
      // Каждый снимок в своём контексте: тема задаётся и системной настройкой, и тумблером,
      // иначе страница на долю секунды показывает чужую.
      const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1500 }, colorScheme: step.theme, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto('file://' + PAGE);
      await page.waitForFunction(() => !!window.HealthUI && !!HealthUI.state().main);
      await page.evaluate(([l, t]) => { HealthUI.setLang(l); HealthUI.setTheme(t); }, [lang, step.theme]);
      await page.waitForTimeout(400);
      if (step.tab !== 'story') { await page.click('[data-tab="' + step.tab + '"]'); await page.waitForTimeout(400); }
      const box = await page.evaluate(s => {
        const el = document.querySelector(s);
        el.scrollIntoView();
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }, step.sel);
      await page.waitForTimeout(250);
      const file = path.join(OUT, step.name + '-' + lang + '.png');
      await page.screenshot({ path: file, clip: {
        x: Math.max(0, box.x - PAD), y: Math.max(0, box.y - PAD),
        width: Math.min(WIDTH, box.w + PAD * 2), height: Math.min(box.h + PAD * 2, MAX_HEIGHT) } });
      const kb = Math.round(fs.statSync(file).size / 1024);
      total += kb;
      console.log(path.relative(REPO, file) + '  ' + kb + ' KB');
      await ctx.close();
    }
  } finally { await browser.close().catch(() => {}); }
  console.log('\n' + PLAN.length * LANGS.length + ' shots, ' + total + ' KB in total.');
})().catch(e => { console.error(e && e.stack || String(e)); process.exitCode = 2; });
