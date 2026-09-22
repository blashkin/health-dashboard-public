// Browser regression checks for a dashboard built by Python. Synthetic demo data only.
// The checks reach the page through the window.HealthUI seam and through data-ui /
// data-role attributes, never through class names or the internal markup: the stage 3
// overlay replaces those, and the checks have to survive it.
// Build first:  python3 -m health_dashboard demo -o out/demo
//               python3 -m health_dashboard build out/demo/fake_archive.zip -o out/check
// Run:          node tests/ui/browser.cjs [out/check/dashboard.html] [out/demo/dashboard.html]
// The first page carries data (the old checks lean on «Сбросить» bringing it back); the
// second is the empty page with the start screen, checked at the end. Beside the second
// one lies fake_archive.zip, the synthetic export that marks the page as demo data.
// Playwright is resolved from the local install or from PLAYWRIGHT_MODULE=/path/to/playwright.
// Node is needed for these checks only, never for running the program itself.
const fs = require('fs'), os = require('os'), path = require('path');
const { makeZip } = require('./make_zip.cjs');

const REPO = path.resolve(__dirname, '..', '..');
const DEMO = path.join(REPO, 'demo');
const DASHBOARD = path.resolve(process.argv[2] || process.env.HEALTH_DASHBOARD_HTML || path.join(REPO, 'out', 'check', 'dashboard.html'));
const EMPTY = path.resolve(process.argv[3] || process.env.HEALTH_DASHBOARD_EMPTY || path.join(REPO, 'out', 'demo', 'dashboard.html'));
const FAKE = path.join(path.dirname(EMPTY), 'fake_archive.zip');
for (const [what, file] of [['Build with data', DASHBOARD], ['Empty page', EMPTY], ['Fake archive', FAKE]]) {
  if (!fs.existsSync(file)) {
    console.error(what + ' not found: ' + file + '\nRun: python3 -m health_dashboard demo -o out/demo && python3 -m health_dashboard build out/demo/fake_archive.zip -o out/check');
    process.exit(2);
  }
}

const PAYLOAD = '<img src=x onerror="window.__xss=1">';
let failures = 0;
const check = (name, ok) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + name); if (!ok) failures++; };

function loadPlaywright() {
  for (const id of [process.env.PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean)) {
    try { return require(id); } catch {}
  }
  console.error('Playwright not found. Install it locally or set PLAYWRIGHT_MODULE to its path.');
  process.exit(2);
}

function tempJson(name, data) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'health-ui-')), name);
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

function hostileMain() {
  const main = JSON.parse(fs.readFileSync(path.join(DEMO, 'approved_monthly.json'), 'utf8'));
  main.method = 'Демо-методика ' + PAYLOAD;
  main.sources = { [PAYLOAD]: 'Apple Watch; ' + PAYLOAD };
  main.gaps = [{ metric: 'steps', source: PAYLOAD, last_observation: PAYLOAD, next_observation: '2017-05-01', missing_days_between: '61' }];
  for (const row of main.monthly) if (row.selected_sources) row.selected_sources = { [PAYLOAD]: row.observed_days };
  return main;
}


// A synthetic Apple Health export. The source version is hostile on purpose: the page
// keeps category and version of every source, so that is where a payload could arrive.
function healthXml(extra = '') {
  const record = (type, value, unit, start, end, version = '1') =>
    `<Record type="HKQuantityTypeIdentifier${type}" value="${value}" unit="${unit}" sourceName="Watch"` +
    ` sourceVersion="${version}" startDate="${start}" endDate="${end}"/>`;
  const sleep = (value, start, end) =>
    `<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="${value}" sourceName="Watch"` +
    ` sourceVersion="1" startDate="${start}" endDate="${end}"/>`;
  const escaped = PAYLOAD.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  let parts = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE HealthData [<!ELEMENT HealthData (Record|Workout)*> <!ATTLIST Record type CDATA #REQUIRED>]>',
    '<HealthData locale="ru_RU"><!-- <Record type="ignored"/> -->'];
  for (let day = 1; day <= 28; day++) {
    const d = String(day).padStart(2, '0');
    parts.push(record('StepCount', 1000 + day, 'count', `2022-05-${d} 09:00:00 +0300`, `2022-05-${d} 09:30:00 +0300`));
    parts.push(record('RestingHeartRate', 55 + (day % 5), 'count/min', `2022-05-${d} 08:00:00 +0300`, `2022-05-${d} 08:00:00 +0300`));
    parts.push(sleep('HKCategoryValueSleepAnalysisAsleepCore', `2022-05-${d} 23:00:00 +0300`, `2022-05-${day === 28 ? '29' : String(day + 1).padStart(2, '0')} 06:30:00 +0300`));
  }
  parts.push(record('StepCount', 500, 'count', '2022-05-10 10:00:00 +0300', '2022-05-10 10:10:00 +0300', escaped));
  parts.push(extra, '</HealthData>');
  return parts.join('');
}

function archiveOf(xml) {
  return { name: 'export.zip', mimeType: 'application/zip', buffer: makeZip([{ name: 'apple_health_export/\u044d\u043a\u0441\u043f\u043e\u0440\u0442.xml', data: xml }]) };
}

let browser = null;

(async () => {
  const { chromium } = loadPlaywright();
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  const page = await browser.newPage();
  const schemes = new Set(), errors = [];
  page.on('request', r => schemes.add(r.url().split(':')[0]));
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + DASHBOARD);

  // «Сбросить» уводит на стартовый экран и встроенные данные назад не приносит, поэтому
  // между проверками набор восстанавливается перезагрузкой страницы, а не этой кнопкой.
  const reload = async () => { await page.reload(); await page.waitForFunction(() => !!window.HealthUI && !!HealthUI.state().main); };

  check('the seam is present', await page.evaluate(() => typeof window.HealthUI === 'object' && HealthUI.version === 1));

  // The plain-language section is what a first-time reader lands on; the period panel is
  // meaningless there, because that section always speaks about the whole archive.
  check('the plain-language section opens first', await page.evaluate(() =>
    HealthUI.state().tab === 'story' && document.querySelector('[data-tab="story"]').getAttribute('aria-selected') === 'true'));
  check('the period panel is hidden on that section', await page.evaluate(() =>
    getComputedStyle(HealthUI.control('controls')).display === 'none'));
  check('the period panel comes back on the other sections', await page.evaluate(() => {
    document.querySelector('[data-tab="overview"]').click();
    return getComputedStyle(HealthUI.control('controls')).display !== 'none';
  }));

  const arithmetic = await page.evaluate(() => ({
    weighted: HealthUI.periodValue([{ value: 60, observed_days: 10, aggregation: 'mean_observed_days' }, { value: 90, observed_days: 20, aggregation: 'mean_observed_days' }]).primary,
    sum: HealthUI.periodValue([{ value: 100, observed_days: 10, aggregation: 'sum' }, { value: 200, observed_days: 20, aggregation: 'sum' }]),
  }));
  check('weighted mean of 60/10 and 90/20 is 80', arithmetic.weighted === 80);
  check('sums 100/200 give 300 and 10 per observed day', arithmetic.sum.primary === 300 && arithmetic.sum.secondary === 10);

  const paths = await page.evaluate(() => ({
    gap: HealthUI.linePath(HealthUI.chart([{ month: '2020-01', value: 10 }, { month: '2020-03', value: 20 }], 'test', 'ед')),
    solid: HealthUI.linePath(HealthUI.chart([{ month: '2020-01', value: 10 }, { month: '2020-02', value: 15 }, { month: '2020-03', value: 20 }], 'test', 'ед')),
    emptyText: HealthUI.chartText(HealthUI.chart([{ month: '2020-01', value: null }], 'test', 'ед')),
    zeroDots: HealthUI.chartDots(HealthUI.chart([{ month: '2020-01', value: 0 }], 'test', 'ед')),
  }));
  check('missing month breaks the line', (paths.gap.match(/M/g) || []).length === 2);
  check('three consecutive months stay one segment', (paths.solid.match(/M/g) || []).length === 1);
  const [x1, x3] = [...paths.gap.matchAll(/[ML]([\d.]+),/g)].map(m => Number(m[1]));
  const [a1, a2] = [...paths.solid.matchAll(/[ML]([\d.]+),/g)].map(m => Number(m[1]));
  check('gap keeps calendar spacing', Math.abs((x3 - x1) - 2 * (a2 - a1)) < 0.6);
  check('empty series shows a message, not an empty chart', paths.emptyText.includes('Нет данных'));
  check('explicit zero is drawn', paths.zeroDots === 1);

  const validation = await page.evaluate(() => {
    const row = extra => ({ metric: 'steps', month: '2020-01', value: 10, observed_days: 1, calendar_days: 31, aggregation: 'sum', ...extra });
    const cases = {
      valid: row({}),
      leapFebruary: row({ month: '2024-02', calendar_days: 29 }),
      negative: row({ value: -10 }),
      fractionalDays: row({ observed_days: 1.5 }),
      wrongAggregation: { metric: 'resting_hr', month: '2020-01', value: 60, observed_days: 10, calendar_days: 31, aggregation: 'sum' },
      wrongCalendarDays: row({ month: '2021-02', calendar_days: 29 }),
      nullObservedDays: row({ observed_days: null }),
      missingCalendarDays: { metric: 'steps', month: '2020-01', value: 10, observed_days: 1, aggregation: 'sum' },
      stringCount: row({ overlap_days: '2' }),
    };
    return Object.fromEntries(Object.entries(cases).map(([k, r]) => {
      try { HealthUI.validateMain({ sources: {}, monthly: [r] }); return [k, 'accepted']; } catch { return [k, 'rejected']; }
    }));
  });
  check('valid row accepted', validation.valid === 'accepted');
  check('29 February of a leap year accepted', validation.leapFebruary === 'accepted');
  check('negative value rejected', validation.negative === 'rejected');
  check('fractional observed_days rejected', validation.fractionalDays === 'rejected');
  check('sum aggregation for resting_hr rejected', validation.wrongAggregation === 'rejected');
  check('calendar_days not matching the month rejected', validation.wrongCalendarDays === 'rejected');
  check('null observed_days rejected', validation.nullObservedDays === 'rejected');
  check('missing calendar_days rejected', validation.missingCalendarDays === 'rejected');
  check('counter given as a string rejected', validation.stringCount === 'rejected');

  const sleepValidation = await page.evaluate(() => {
    const row = extra => ({ month: '2020-01', mean_hours: 7, median_hours: 7.1, observed_windows: 20, ...extra });
    const cases = { valid: row({}), tooLong: row({ mean_hours: 25 }), tooManyWindows: row({ observed_windows: 32 }), conflictOverflow: row({ conflicting_awake_windows: 21 }) };
    return Object.fromEntries(Object.entries(cases).map(([k, r]) => {
      try { HealthUI.validateSleep({ definition: 'x', monthly: [r] }); return [k, 'accepted']; } catch { return [k, 'rejected']; }
    }));
  });
  check('valid sleep row accepted', sleepValidation.valid === 'accepted');
  check('sleep longer than 24 h rejected', sleepValidation.tooLong === 'rejected');
  check('more windows than days in month rejected', sleepValidation.tooManyWindows === 'rejected');
  check('conflict count above window count rejected', sleepValidation.conflictOverflow === 'rejected');

  // Year arithmetic for the plain-language section, on hand-made numbers.
  // The archive span decides which years are complete, so every case builds its own archive.
  const story = await page.evaluate(() => {
    const cal = (year, i) => new Date(Number(year), i + 1, 0).getDate();
    const rows = (metric, year, pick, agg, upto = 12) => Array.from({ length: upto }, (_, i) => {
      const days = cal(year, i), got = pick(i, days);
      return { metric, month: `${year}-${String(i + 1).padStart(2, '0')}`, value: got.value,
        observed_days: got.days ?? days, calendar_days: days, aggregation: agg };
    });
    // Every case clears the sleep file too: otherwise the embedded window set would answer
    // for years the hand-made archive never mentions.
    const set = monthly => HealthUI.setState({ main: { sources: {}, monthly }, sleep: null });
    const out = {};

    // Weighted mean: six months of 60 over 10 days, six of 90 over 20.
    set(rows('resting_hr', '2020', i => (i < 6 ? { value: 60, days: 10 } : { value: 90, days: 20 }), 'mean_observed_days'));
    out.weighted = HealthUI.story.yearly('resting_hr')[0].value;

    // 2024 stops in August, so it is the year still running: out of the median and out of the base.
    set([...rows('steps', '2021', (i, d) => ({ value: 10 * d }), 'sum'),
         ...rows('steps', '2022', (i, d) => ({ value: 20 * d }), 'sum'),
         ...rows('steps', '2023', (i, d) => ({ value: 30 * d }), 'sum'),
         ...rows('steps', '2024', (i, d) => ({ value: 900 * d }), 'sum', 8)]);
    const h = HealthUI.story.horizons('steps');
    out.median = h.median.value; out.base = h.base.year; out.prev = h.prev.year;
    out.first = h.first.year; out.partial = h.partial && h.partial.year;
    out.partialStatus = HealthUI.story.yearStatus('steps', '2024');

    // VO2max is rare by nature: coverage must not paint it ochre, three readings a year are enough.
    set([...rows('steps', '2022', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('vo2max', '2022', i => (i < 4 ? { value: 40, days: 1 } : { value: null, days: 0 }), 'mean_observed_days')]);
    out.rareVo2 = HealthUI.story.yearStatus('vo2max', '2022');
    out.rareSteps = HealthUI.story.yearStatus('steps', '2022');
    set([...rows('steps', '2022', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('vo2max', '2022', i => (i < 2 ? { value: 40, days: 1 } : { value: null, days: 0 }), 'mean_observed_days')]);
    out.tooRareVo2 = HealthUI.story.yearStatus('vo2max', '2022');

    // A year the archive covers but the metric never recorded: absence, not a zero.
    set([...rows('steps', '2022', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('steps', '2023', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('sleep_hours', '2023', () => ({ value: 7.5 }), 'mean_observed_days')]);
    const sleepYears = HealthUI.story.yearly('sleep_hours');
    out.silentYear = sleepYears[0].status; out.silentValue = sleepYears[0].value;
    out.spokenYear = sleepYears[1].status;

    // Two sleep definitions must not mix inside one year: a loaded window file wins outright.
    HealthUI.setState({ sleep: { definition: 'x', monthly: [{ month: '2023-01', mean_hours: 9, observed_windows: 31 }] } });
    out.sleepFromWindows = HealthUI.story.yearly('sleep_hours')[1].value;
    HealthUI.setState({ sleep: null });
    out.sleepFromMain = HealthUI.story.yearly('sleep_hours')[1].value;

    // A change smaller than the noise floor is not a direction.
    set([...rows('steps', '2022', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('steps', '2023', (i, d) => ({ value: 8100 * d }), 'sum'),
         ...rows('steps', '2024', (i, d) => ({ value: 8150 * d }), 'sum')]);
    out.quietDir = HealthUI.story.horizons('steps').prev.dir;
    set([...rows('steps', '2022', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('steps', '2023', (i, d) => ({ value: 8100 * d }), 'sum'),
         ...rows('steps', '2024', (i, d) => ({ value: 9000 * d }), 'sum')]);
    const loud = HealthUI.story.horizons('steps');
    out.loudDir = loud.prev.dir; out.loudTone = loud.prev.tone;
    out.trend = HealthUI.story.trendVerdict('steps').verdict;

    // Rising resting heart rate must never share a colour with rising steps.
    set([...rows('resting_hr', '2022', () => ({ value: 60 }), 'mean_observed_days'),
         ...rows('resting_hr', '2023', () => ({ value: 66 }), 'mean_observed_days'),
         ...rows('resting_hr', '2024', () => ({ value: 72 }), 'mean_observed_days')]);
    const hr = HealthUI.story.horizons('resting_hr');
    out.hrTone = hr.prev.tone; out.hrDir = hr.prev.dir;

    // Minutes per week: a full year is divided by 52.18, a cut year by the weeks it recorded.
    out.weekFull = HealthUI.story.weeklyMinutes(5218, '2023');
    set([...rows('steps', '2023', (i, d) => ({ value: 8000 * d }), 'sum'),
         ...rows('steps', '2024', (i, d) => ({ value: 8000 * d }), 'sum', 6)]);
    out.weekCut = HealthUI.story.weeklyMinutes(1820, '2024');
    return out;
  });
  check('year value is weighted by observed days', story.weighted === 80);
  check('the year still running stays out of the median', story.median === 20);
  check('the base year is the last complete one', story.base === '2023' && story.prev === '2022' && story.first === '2021');
  check('the year still running is reported separately', story.partial === '2024' && story.partialStatus === 'partial');
  check('four vo2max readings a year are not called sparse', story.rareVo2 === 'full');
  check('two vo2max readings a year are called sparse', story.tooRareVo2 === 'sparse');
  check('a fully covered everyday year is complete', story.rareSteps === 'full');
  check('a loaded window file is what the sleep year is built from', story.sleepFromWindows === 9);
  check('without it the sleep year falls back to the main file', story.sleepFromMain === 7.5);
  check('a year without records reads as absence, not zero', story.silentYear === 'none' && story.silentValue === null);
  check('a year with records reads as present', story.spokenYear === 'full');
  check('a change under the noise floor has no direction', story.quietDir === 'flat');
  check('a change over the noise floor has one', story.loudDir === 'up' && story.loudTone === 'good');
  check('a rising row gets a verdict', story.trend === 'растёт');
  check('rising resting heart rate is not coloured as good', story.hrDir === 'up' && story.hrTone === 'watch');
  check('a full year is divided by 52.18 weeks', Math.abs(story.weekFull - 100) < 0.01);
  check('a cut year is divided by the weeks it recorded', Math.abs(story.weekCut - 1820 / (182 / 7)) < 1e-9);
  await reload();

  // Norms and their paperwork. A threshold or a piece of advice without a source is the one
  // thing this section must never ship: the reader cannot check it, so the page has to.
  const norms = await page.evaluate(() => {
    const S = HealthUI.story, ids = new Set(Object.keys(S.SOURCES)), missing = [];
    const seen = id => { if (!ids.has(id)) missing.push('unknown source ' + id); };
    for (const metric of S.STORY_METRICS) for (const age of [null, 30, 70]) for (const sex of [null, 'm', 'f']) {
      for (const band of S.bands(metric, age, sex)) {
        if (!band.src || !band.src.length) missing.push(`zone ${metric}/${age}/${band.label}`);
        else band.src.forEach(seen);
      }
    }
    for (const [metric, norm] of Object.entries(S.NORMS)) {
      if (!norm.officialSrc || !norm.officialSrc.length) missing.push(`official ${metric}`);
      else norm.officialSrc.forEach(seen);
      for (const key of ['advice', 'doctor']) for (const item of norm[key] || []) {
        if (!item.src || !item.src.length) missing.push(`${key} ${metric}: ${item.text}`);
        else item.src.forEach(seen);
      }
      // A caveat may be the page speaking about the device rather than quoting a norm,
      // but then it has to say so out loud instead of borrowing someone's authority.
      for (const item of norm.caveats || []) {
        if (!(item.src && item.src.length) && !item.own) missing.push(`caveat ${metric}: ${item.text}`);
        (item.src || []).forEach(seen);
      }
    }
    const badPaperwork = Object.entries(S.SOURCES)
      .filter(([, src]) => !/^https:\/\/\S+$/.test(src.url) || !src.checked || !src.title || !src.org)
      .map(([id]) => id);
    return {
      missing, badPaperwork, sourceCount: ids.size,
      band45: (S.percentileBand('m', 45, 38.0) || {}).label,
      band85: S.percentileBand('m', 85, 38.0),
      bandNoSex: S.percentileBand(null, 45, 38.0),
      bandTop: (S.percentileBand('f', 25, 60.0) || {}).label,
      sleepLow: S.zone('sleep_hours', 6.9, 40).label,
      sleepIn: S.zone('sleep_hours', 7.5, 40).label,
      sleepOldOver: S.zone('sleep_hours', 8.5, 70).label,
      sleepYoungIn: S.zone('sleep_hours', 8.5, 40).label,
      weekly: S.weeklyFromDaily(21.5),
      exercise: S.zone('exercise_min', S.weeklyFromDaily(21.5), 40).label,
      exerciseLow: S.zone('exercise_min', 140, 40).label,
      hrOk: S.zone('resting_hr', 72, 40).label,
      hrHigh: S.zone('resting_hr', 104, 40).tone,
      stepsYoungPlateau: S.zone('steps', 9000, 40).label,
      stepsOldPlateau: S.zone('steps', 7000, 70).label,
      vo2NoAge: S.bands('vo2max', null, 'm').length,
    };
  });
  check('every threshold and every piece of advice names a source', norms.missing.length === 0);
  if (norms.missing.length) console.log(norms.missing);
  check('every source has an organisation, a title, a URL and a check date', norms.badPaperwork.length === 0);
  if (norms.badPaperwork.length) console.log(norms.badPaperwork);
  check('a man of 45 at 38.0 lands between the 50th and the 75th', /между 50-м и 75-м/.test(norms.band45 || ''));
  check('outside 20-79 there is no percentile category', norms.band85 === null);
  check('without a sex there is no percentile category', norms.bandNoSex === null);
  check('above the top percentile is named, not interpolated', /95/.test(norms.bandTop || ''));
  check('6.9 h of sleep is below the recommendation', norms.sleepLow === 'меньше рекомендации');
  check('7.5 h of sleep is inside it', norms.sleepIn === 'в рекомендации');
  check('8.5 h is inside it at 40 and above it at 70', norms.sleepYoungIn === 'в рекомендации' && /больше рекомендации/.test(norms.sleepOldOver));
  check('21.5 min a day is 150.5 min a week', Math.abs(norms.weekly - 150.5) < 1e-9);
  check('150.5 min a week is inside the recommendation', norms.exercise === 'в рекомендации');
  check('140 min a week is below it', norms.exerciseLow === 'ниже рекомендации');
  check('a resting pulse of 72 is in the usual range', /60/.test(norms.hrOk));
  check('a resting pulse of 104 asks for attention, not alarm', norms.hrHigh === 'watch');
  check('the step plateau follows age', /плато/.test(norms.stepsYoungPlateau) && /плато/.test(norms.stepsOldPlateau));
  check('vo2max shows no ruler until the year of birth is known', norms.vo2NoAge === 0);

  // The opening paragraph. It speaks in directions, so a flat archive must not borrow
  // the words of a moving one, and the first thing a reader meets carries no units at all.
  const cover = await page.evaluate(() => {
    const cal = (year, i) => new Date(Number(year), i + 1, 0).getDate();
    const rows = (metric, year, value, agg) => Array.from({ length: 12 }, (_, i) => {
      const days = cal(year, i);
      return { metric, month: `${year}-${String(i + 1).padStart(2, '0')}`,
        value: agg === 'sum' ? value * days : value, observed_days: days, calendar_days: days, aggregation: agg };
    });
    const years = (metric, value, agg) => ['2021', '2022', '2023'].flatMap(y => rows(metric, y, value, agg));
    HealthUI.setState({ sleep: null, birthYear: null, sex: null, main: { sources: {}, monthly: [
      ...years('steps', 8000, 'sum'), ...years('exercise_min', 30, 'sum'),
      ...years('resting_hr', 62, 'mean_observed_days'), ...years('vo2max', 44, 'mean_observed_days')] } });
    const flat = HealthUI.story.coverParagraph();
    HealthUI.setState({ main: { sources: {}, monthly: [
      ...rows('steps', '2021', 6000, 'sum'), ...rows('steps', '2022', 7200, 'sum'), ...rows('steps', '2023', 8400, 'sum'),
      ...rows('resting_hr', '2021', 60, 'mean_observed_days'), ...rows('resting_hr', '2022', 66, 'mean_observed_days'),
      ...rows('resting_hr', '2023', 72, 'mean_observed_days'),
      ...rows('vo2max', '2021', 40, 'mean_observed_days'), ...rows('vo2max', '2022', 44, 'mean_observed_days'),
      ...rows('vo2max', '2023', 48, 'mean_observed_days')] } });
    const moving = HealthUI.story.coverParagraph();
    const chips = HealthUI.story.coverChips();
    return { flat, moving, chips, sentences: moving.split(/(?<=\.)\s+/).length };
  });
  check('a flat archive is not described as rising or falling',
    !/растёт|снижается|снизил|вырос/.test(cover.flat));
  check('a flat archive still says something', cover.flat.length > 40);
  check('a moving archive is described as moving', /растёт|вырос|больше/.test(cover.moving));
  check('the opening paragraph carries no figures', !/\d/.test(cover.flat) && !/\d/.test(cover.moving));
  check('the opening paragraph is 3 to 5 sentences', cover.sentences >= 3 && cover.sentences <= 5);
  check('rising endurance beside a rising pulse is named as a split signal', /разн|сигнал/.test(cover.moving));
  check('the three chips lead with a phrase and keep the figure second',
    cover.chips.length === 3 && cover.chips.every(c => c.line.length > 0 && !/\d/.test(c.line)));
  check('the heart chip is not coloured as good',
    cover.chips.find(c => c.metric === 'resting_hr').tone === 'watch');
  check('the steps chip is coloured as good',
    cover.chips.find(c => c.metric === 'steps').tone === 'good');
  await reload();

  // Imported file contents must stay text on every tab.
  await reload();
  await page.setInputFiles('[data-ui="mainFile"]', tempJson('approved_monthly.json', hostileMain()));
  await page.waitForTimeout(50);
  for (const tab of ['story', 'overview', 'activity', 'workouts', 'heart', 'sleep', 'season', 'quality']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(20);
  }
  check('imported file contents do not execute', await page.evaluate(() => window.__xss === undefined));
  // «Полнота записей» показывает перерывы выбранного показателя: выбираем шаги, где лежит нагрузка.
  await page.click('[data-tab="quality"]');
  await page.evaluate(() => { HealthUI.setState({ metric: 'steps' }); HealthUI.render(); });
  check('gap fields are shown as text', (await page.textContent('[data-ui="app"]')).includes(PAYLOAD));

  // A main import must not bring the demo sleep set back.
  await page.click('[data-tab="sleep"]');
  const beforeToggle = await page.evaluate(() => ({ isDemo: HealthUI.state().isDemo, sleep: HealthUI.state().sleep }));
  await page.click('[data-ui="toggleSleep"]').catch(() => {});
  const afterToggle = await page.evaluate(() => ({ isDemo: HealthUI.state().isDemo, synthetic: HealthUI.state().sleep?._synthetic ?? null }));
  check('imported set starts without a sleep file', beforeToggle.isDemo === false && beforeToggle.sleep === null);
  check('toggle does not substitute demo sleep', afterToggle.synthetic === null);
  check('window sleep is disabled without a file', await page.evaluate(() => !!HealthUI.control('toggleSleep')?.disabled));

  // An imported sleep file survives switching definitions.
  await page.setInputFiles('[data-ui="sleepFile"]', path.join(DEMO, 'monthly_sleep_windows.json'));
  await page.waitForTimeout(50);
  await page.click('[data-tab="sleep"]');
  await page.click('[data-ui="toggleSleep"]');
  await page.click('[data-ui="toggleSleep"]');
  check('imported sleep survives switching back and forth', await page.evaluate(() => Array.isArray(HealthUI.state().sleep?.monthly) && HealthUI.state().sleepMode === 'window'));

  // An empty but valid file must not break the page: with nothing to show it falls back to the invitation.
  await reload();
  await page.setInputFiles('[data-ui="mainFile"]', tempJson('empty.json', { sources: {}, monthly: [] }));
  await page.waitForTimeout(50);
  check('empty data set renders without errors', errors.length === 0);
  check('an empty data set shows the invitation instead of empty tabs',
    await page.evaluate(() => !HealthUI.control('start').className.includes('hidden') && getComputedStyle(HealthUI.control('nav')).display === 'none'));

  // Smoothing is a per-chart select under the chart and keeps its state across re-renders.
  await reload();
  await page.click('[data-tab="heart"]');
  await page.selectOption('[data-smooth-key="heart"]', '3');
  await page.waitForTimeout(50);
  check('smoothing select stays on 3 months after re-render', await page.evaluate(() => document.querySelector('[data-smooth-key="heart"]').value === '3' && HealthUI.state().smooth.heart === '3'));
  check('the other chart is not smoothed by the heart select', await page.evaluate(() => (HealthUI.state().smooth.activity || '0') === '0'));
  check('the trend caption is written in words under the chart', await page.evaluate(() => /Тренд по полным годам всего архива: (растёт|снижается|ровно|данных мало)/.test(document.querySelector('.chart-trend')?.textContent || '')));
  const twelve = await page.evaluate(() => {
    const row = (m, v, d) => ({ month: m, value: v, observed_days: d });
    const ms = ['2020-01','2020-02','2020-03','2020-04','2020-05','2020-06','2020-07','2020-08','2020-09','2020-10','2020-11','2020-12'];
    const full = ms.map(m => row(m, 10, 1)), nine = ms.map((m, i) => i < 3 ? row(m, null, 0) : row(m, 10, 1)), eight = ms.map((m, i) => i < 4 ? row(m, null, 0) : row(m, 10, 1));
    const sums = ms.map((m, i) => ({ ...row(m, i + 1, 5), aggregation: 'sum' }));
    return { full: HealthUI.smoothRowsN(full, 12)[11].value, nine: HealthUI.smoothRowsN(nine, 12)[11].value, eight: HealthUI.smoothRowsN(eight, 12)[11].value, sums: HealthUI.smoothRowsN(sums, 12)[11].value };
  });
  check('a 12-month window needs at least nine months', twelve.full === 10 && twelve.nine === 10 && twelve.eight === null);
  check('sums are averaged per month, not weighted by days', twelve.sums === 6.5);
  // Cards on the heart and sleep tabs: one mean, the two extreme months, the record count.
  const heartCards = await page.evaluate(() => [...document.querySelectorAll('[data-ui="app"] .card .label')].map(x => x.textContent));
  check('the heart tab shows its cards', ['Среднее за период','Самый низкий месяц','Самый высокий месяц','Дней с измерением'].every(l => heartCards.includes(l)));
  check('the heart tab compares with the same months a year earlier', (await page.textContent('[data-ui="app"]')).includes('Сравнение с теми же месяцами годом ранее'));
  await page.click('[data-tab="sleep"]');
  const sleepText = await page.textContent('[data-ui="app"]');
  check('the sleep tab shows its cards', sleepText.includes('Среднее за период') && (sleepText.includes('Окон с записью') || sleepText.includes('Дней с записью')));
  const smoothing = await page.evaluate(() => {
    const rows = [{ month: '2020-01', value: 10, observed_days: 1 }, { month: '2020-02', value: 20, observed_days: 2 }, { month: '2020-03', value: 30, observed_days: 3 }];
    const gapped = [{ month: '2020-01', value: 10, observed_days: 1 }, { month: '2020-03', value: 20, observed_days: 2 }, { month: '2020-04', value: 30, observed_days: 3 }];
    return { consecutive: HealthUI.smoothRows(rows)[2].value, overGap: HealthUI.smoothRows(gapped)[2].value };
  });
  check('smoothing weights three consecutive months', Math.abs(smoothing.consecutive - 140 / 6) < 1e-9);
  check('smoothing does not reach across a missing month', smoothing.overGap === null);

  // Year-over-year comparison.
  const compare = await page.evaluate(() => {
    const row = (month, value, days) => ({ metric: 'steps', month, value, observed_days: days, calendar_days: new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate(), aggregation: 'sum', selected_sources: { S001: days } });
    HealthUI.setState({ main: { sources: {}, monthly: [row('2023-01', 3100, 31), row('2024-01', 6200, 31), row('2023-02', 2800, 28), row('2024-02', 5800, 29), row('2024-03', 900, 3)] } });
    HealthUI.control('from').value = '2024-01';
    HealthUI.control('to').value = '2024-03';
    HealthUI.control('coverage').value = '0';
    const withoutLast = HealthUI.comparePairs('steps', false), withLast = HealthUI.comparePairs('steps', true);
    HealthUI.control('coverage').value = '.8';
    const filtered = HealthUI.comparePairs('steps', true);
    return { withoutLast: withoutLast.map(p => p[1].month), withLast: withLast.map(p => p[1].month), filtered: filtered.map(p => p[1].month) };
  });
  check('last month of the archive is excluded by default', JSON.stringify(compare.withoutLast) === JSON.stringify(['2024-01', '2024-02']));
  check('February pairs across a leap year are kept', compare.withLast.includes('2024-02'));
  check('coverage filter applies to comparison', !compare.filtered.includes('2024-03'));

  await reload();

  // The norms section as it is actually rendered. A claim without its paperwork, a footnote
  // leading nowhere, or a marker sliding off its own ruler are all silent failures.
  await page.click('[data-tab="story"]');
  await page.waitForTimeout(80);
  const shown = await page.evaluate(() => {
    const app = HealthUI.control('app');
    const refs = [...app.querySelectorAll('[data-role="ref"]')];
    const links = [...app.querySelectorAll('a[href^="https"]')];
    const marks = [...app.querySelectorAll('[data-role="mark"]')];
    const offBar = marks.filter(m => {
      const bar = m.closest('svg').querySelector('[data-role="ruler"]'), x = Number(m.dataset.x);
      return !(x >= Number(bar.dataset.x0) - 0.01 && x <= Number(bar.dataset.x1) + 0.01);
    });
    const norms = [...app.querySelectorAll('[data-role="norm"]')];
    return {
      refCount: refs.length,
      dangling: refs.filter(a => !app.querySelector('#' + CSS.escape(a.getAttribute('href').slice(1)))).length,
      linkCount: links.length,
      unsafe: links.filter(a => !/noopener/.test(a.rel) || !/noreferrer/.test(a.rel)).length,
      visibleUrls: links.filter(a => a.textContent.includes('https://')).length,
      markCount: marks.length,
      offBar: offBar.length,
      normCount: norms.length,
      normsWithoutRef: norms.filter(b => !b.querySelector('[data-role="ref"]')).length,
      partialNoted: /год ещё идёт/.test(app.textContent),
      noDiagnosis: /не ставит диагноз/.test(app.textContent),
      workingThresholds: /рабочие порог|рабочий порог/.test(app.textContent),
      stepsHaveNoOfficialNorm: /официальной нормы/i.test(app.textContent),
    };
  });
  check('the rendered section carries footnotes', shown.refCount > 10);
  check('no footnote leads nowhere', shown.dangling === 0);
  check('every norm block names at least one source', shown.normCount > 0 && shown.normsWithoutRef === 0);
  check('every outside link is rel=noopener noreferrer', shown.linkCount > 0 && shown.unsafe === 0);
  check('every source shows its full URL as readable text', shown.visibleUrls === shown.linkCount);
  check('every ruler is drawn with a marker', shown.markCount > 0);
  check('no marker slides off its own ruler', shown.offBar === 0);
  check('the year still running is labelled, not silently compared', shown.partialNoted);
  check('the page says out loud that it makes no diagnosis', shown.noDiagnosis);
  check('working thresholds are named as the page own', shown.workingThresholds);
  check('steps are said to have no official norm', shown.stepsHaveNoOfficialNorm);

  // The lower half of the section: the big chart, the facts, the wall of years and the
  // sport hours. The wall is where absence is easiest to fake as a zero, so it is checked hardest.
  const rest = await page.evaluate(() => {
    const app = HealthUI.control('app');
    const cells = [...app.querySelectorAll('[data-role="wall-cell"]')];
    return {
      facts: app.querySelectorAll('[data-role="fact"]').length,
      // Под запретом одно слово — «лучший»: год не объявляется победителем. Сравнительное
      // «лучше» (оно пришло из брифа) и «улучшение» запретом не покрыты.
      noBestWord: !/(?<![а-яё])лучш(ий|ая|ее|ие|его|ему|им|ем|ую)/i.test(app.textContent),
      emptyCells: cells.filter(c => c.dataset.status === 'none').length,
      emptyWithBar: cells.filter(c => c.dataset.status === 'none' && c.querySelector('[data-role="wall-bar"]')).length,
      emptyRowSaysSo: /нет записей/.test(app.textContent),
      anchors: app.querySelectorAll('.wall-anchor').length,
      verdicts: app.querySelectorAll('[data-role="wall-verdict"]').length,
      workoutBlock: !!app.querySelector('[data-role="workouts"]'),
      workoutCaption: /объём за год/.test(app.textContent),
      chips: app.querySelectorAll('[data-ui="storyMetric"]').length,
      noSummedIntensity: /не складыва/.test(app.textContent),
    };
  });
  check('the interesting facts are capped at five', rest.facts > 0 && rest.facts <= 5);
  check('no year on the page is called the best one', rest.noBestWord);
  check('a year without records gets no bar at all', rest.emptyCells > 0 && rest.emptyWithBar === 0);
  check('a row with gaps says "нет записей" in words too', rest.emptyRowSaysSo);
  check('the first and the last complete year are framed', rest.anchors >= 2);
  check('every wall row carries its verdict', rest.verdicts > 0);
  check('sport hours sit in their own block with their own caption', rest.workoutBlock && rest.workoutCaption);

  // Доля вида спорта обязана стоять при своём названии. Раньше её колонка уезжала
  // к противоположному краю ячейки, и у левой диаграммы проценты читались как числа правой.
  await page.click('[data-tab="workouts"]');
  // Занятия называются словом и склоняются по числу перед ними, без «зан.».
  check('sessions are spelled out and declined, never abbreviated', await page.evaluate(() => {
    const t = HealthUI.control('app').textContent;
    return !/зан\./.test(t) && /\d\s*занятий/.test(t)
      && (!/1\s091/.test(t) || /1\s091\s*занятие/.test(t));
  }));

  check('the share of a sport stands next to its name, not at the far edge', await page.evaluate(() => {
    const rows = [...HealthUI.control('app').querySelectorAll('.pie-legend button')];
    if (!rows.length) return false;
    return rows.every(r => {
      const nameEl = r.querySelector('span'), pct = r.querySelector('b');
      if (!nameEl || !pct) return false;
      return pct.getBoundingClientRect().left - nameEl.getBoundingClientRect().right < 40;
    });
  }));
  await page.click('[data-tab="story"]');
  check('moderate and vigorous minutes are not added together', rest.noSummedIntensity);
  check('the big chart offers a choice of metric', rest.chips >= 3);

  const switched = await page.evaluate(async () => {
    const chips = [...HealthUI.control('app').querySelectorAll('[data-ui="storyMetric"]')];
    const other = chips.find(c => c.dataset.metric !== HealthUI.state().storyMetric);
    const want = other.dataset.metric;
    other.click();
    return HealthUI.state().storyMetric === want;
  });
  check('a chip switches the big chart', switched === true);

  // Год рождения и пол спрашиваются только на стартовом экране; в «Главном» полей больше нет.
  // Блок норм обязан сказать словами, на чём он сопоставлен и почему не сопоставлен.
  const whoUnknown = await page.evaluate(() => {
    HealthUI.setState({ birthYear: null, sex: null });
    HealthUI.render();
    const app = HealthUI.control('app');
    return { fields: !!app.querySelector('[data-ui="storyBirth"]') || !!app.querySelector('[data-ui="storySex"]'),
      edit: !!app.querySelector('[data-ui="storyEditWho"]'),
      note: (app.querySelector('[data-role="story-who"]') || {}).textContent || '' };
  });
  check('the story tab carries no fields of its own', !whoUnknown.fields && !whoUnknown.edit);
  check('without a year and a sex the norms say so in words',
    /не заданы/.test(whoUnknown.note) && /стартовом экране/.test(whoUnknown.note));

  const typed = await page.evaluate(() => {
    HealthUI.setState({ birthYear: 1980, sex: 'm' });
    HealthUI.render();
    const app = HealthUI.control('app');
    const blocks = [...app.querySelectorAll('[data-role="norm"]')].map(n => n.textContent);
    return { note: (app.querySelector('[data-role="story-who"]') || {}).textContent || '',
      percentile: blocks.some(t => /перцентил/.test(t)) };
  });
  check('with a year and a sex the vo2max block names a percentile', typed.percentile);
  check('the norms name the year and the sex they were matched on',
    /1980/.test(typed.note) && /мужской/.test(typed.note));
  await page.evaluate(() => { HealthUI.setState({ birthYear: null, sex: null, birthText: '' }); HealthUI.render(); });

  // The checklist asks for this one by name: at phone width the page must not slide sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  const narrow = await page.evaluate(() => ({
    side: document.documentElement.scrollWidth <= window.innerWidth + 1,
    coverFirst: (() => {
      const app = HealthUI.control('app');
      const cover = app.querySelector('.cover'), wall = app.querySelector('[data-role="wall"]');
      return !!cover && !!wall && cover.getBoundingClientRect().top < wall.getBoundingClientRect().top;
    })(),
  }));
  check('at 390 px the page does not scroll sideways', narrow.side);
  check('at 390 px the cover still comes before the wall of years', narrow.coverFirst);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(50);

  // A value far outside the drawn scale must stop at the edge, not leave the picture.
  const offScale = await page.evaluate(() => {
    const cal = (y, i) => new Date(Number(y), i + 1, 0).getDate();
    const rows = (metric, year, value, agg) => Array.from({ length: 12 }, (_, i) => {
      const d = cal(year, i);
      return { metric, month: `${year}-${String(i + 1).padStart(2, '0')}`, value: agg === 'sum' ? value * d : value,
        observed_days: d, calendar_days: d, aggregation: agg };
    });
    HealthUI.setState({ sleep: null, main: { sources: {}, monthly: [
      ...rows('steps', '2022', 90000, 'sum'), ...rows('steps', '2023', 90000, 'sum'), ...rows('steps', '2024', 90000, 'sum'),
      ...rows('resting_hr', '2022', 32, 'mean_observed_days'), ...rows('resting_hr', '2023', 32, 'mean_observed_days'),
      ...rows('resting_hr', '2024', 32, 'mean_observed_days')] } });
    HealthUI.render();
    const app = HealthUI.control('app');
    return [...app.querySelectorAll('[data-role="mark"]')].every(m => {
      const bar = m.closest('svg').querySelector('[data-role="ruler"]'), x = Number(m.dataset.x);
      return x >= Number(bar.dataset.x0) - 0.01 && x <= Number(bar.dataset.x1) + 0.01;
    });
  });
  check('an off-scale value stops at the edge of the ruler', offScale === true);
  // The thinnest archive the checklist names: one year, steps only, no vo2max, no sleep.
  // Blocks with nothing to say must say so, not throw and not invent a trend from one point.
  await page.click('[data-tab="overview"]');
  await reload();
  await page.setInputFiles('[data-ui="mainFile"]', tempJson('thin.json', {
    sources: {}, monthly: Array.from({ length: 12 }, (_, i) => {
      const days = new Date(2023, i + 1, 0).getDate();
      return { metric: 'steps', month: `2023-${String(i + 1).padStart(2, '0')}`, value: 7000 * days,
        observed_days: days, calendar_days: days, aggregation: 'sum' };
    }),
  }));
  await page.waitForTimeout(60);
  await page.click('[data-tab="story"]');
  await page.waitForTimeout(120);
  const thin = await page.evaluate(() => {
    const app = HealthUI.control('app');
    return {
      text: app.textContent,
      norms: app.querySelectorAll('[data-role="norm"]').length,
      bars: app.querySelectorAll('[data-role="wall-bar"]').length,
      verdicts: [...app.querySelectorAll('[data-role="wall-verdict"]')].map(v => v.textContent),
      refs: app.querySelectorAll('[data-role="ref"]').length,
    };
  });
  check('a one-year archive without vo2max or sleep still renders', errors.length === 0);
  check('metrics with no records say so instead of disappearing', /записей по этому показателю в архиве нет/i.test(thin.text));
  check('one year is not enough for a trend, and the page says that', thin.verdicts.every(v => /данных мало/.test(v)));
  check('the thin page still carries its sources', thin.refs > 0);
  await page.click('[data-tab="overview"]');
  await reload();

  // Своя выгрузка читается прямо в странице: zip -> дашборд, без терминала и без сети.
  await reload();
  // Старые сообщения снимаются перед каждой подачей: иначе ожидание примет чужое за ответ.
  const settled = () => page.waitForFunction(() => HealthUI.control('alert').textContent.length > 0, null, { timeout: 60000 });
  const feed = async file => { await page.evaluate(() => HealthUI.dropToasts(true)); await page.setInputFiles('[data-ui="archiveFile"]', file); await settled(); };
  await feed({ name: 'fake_archive.zip', mimeType: 'application/zip', buffer: fs.readFileSync(FAKE) });
  const demoMark = await page.evaluate(() => ({ isDemo: HealthUI.state().isDemo, period: HealthUI.control('periodTitle').textContent }));
  check('the fake archive marks the page as demo data in plain words', demoMark.isDemo === true && /Демонстрационные данные/.test(demoMark.period));
  await feed(archiveOf(healthXml()));
  const opened = await page.evaluate(() => ({
    isDemo: HealthUI.state().isDemo,
    fromArchive: HealthUI.state().fromArchive,
    period: HealthUI.control('periodTitle').textContent,
    steps: HealthUI.state().main.monthly.filter(r => r.metric === 'steps').length,
    windows: HealthUI.state().sleep.monthly.length,
    hint: !HealthUI.control('resetHint').className.includes('hidden'),
    progress: HealthUI.control('archiveProgress').className.includes('hidden'),
  }));
  check('an archive opened in the page replaces the previous set', opened.isDemo === false && opened.fromArchive === true);
  check('the demo wording disappears once another archive is loaded', !/Демонстрационные/.test(opened.period));
  check('a notification carries its dot indicator, round and coloured',
    await page.evaluate(() => { const d = HealthUI.control('alert').querySelector('[data-role="toast"] .toast-dot'); if (!d) return false; const r = d.getBoundingClientRect(); return Math.abs(r.width - r.height) < 0.5 && r.width > 6; }));
  check('the message about the archive is a notification, not raw markup',
    await page.evaluate(() => { const t = HealthUI.control('alert').querySelector('[data-role="toast"]'); return !!t && t.querySelector('[data-role="toast-close"]') !== null; }));
  check('the archive produces both definitions from one file', opened.steps === 1 && opened.windows > 0);
  check('the progress line hides itself and the caption comes back', opened.progress && opened.hint);

  // A hostile source version arrives as text on every tab, exactly like an imported file.
  for (const tab of ['story', 'overview', 'quality', 'sleep']) {
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(20);
  }
  check('hostile source fields from an archive do not execute', await page.evaluate(() => window.__xss === undefined));
  check('hostile source fields from an archive are shown as text',
    await page.evaluate(() => Object.values(HealthUI.state().main.sources).some(v => v.includes('onerror'))));
  await page.click('[data-tab="overview"]');

  // Everything that is not an export must fail with our own words, keeping the old data.
  const before = await page.evaluate(() => HealthUI.state().main.monthly.length);
  await feed({ name: 'export.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all') });
  const notZip = await page.evaluate(() => ({ text: HealthUI.control('alert').textContent, rows: HealthUI.state().main.monthly.length }));
  check('a file that is not a zip is refused in our own words', /повреждён или это не zip/.test(notZip.text) && notZip.rows === before);

  await feed({ name: 'export.zip', mimeType: 'application/zip', buffer: makeZip([{ name: 'readme.txt', data: 'nothing here' }]) });
  const noHealth = await page.evaluate(() => ({ text: HealthUI.control('alert').textContent, rows: HealthUI.state().main.monthly.length }));
  check('a zip without HealthData is refused in our own words', /не похоже на выгрузку Apple Health/.test(noHealth.text) && noHealth.rows === before);
  check('an error notification waits to be dismissed instead of vanishing',
    await page.evaluate(() => !!HealthUI.control('alert').querySelector('.toast-error[role="alert"]')));
  await page.evaluate(() => HealthUI.control('alert').querySelector('[data-role="toast-close"]').click());
  check('an error notification can be dismissed by hand',
    await page.evaluate(() => HealthUI.control('alert').children.length === 0));

  // Отмена: прежние данные обязаны остаться на месте, а не исчезнуть.
  // Архив нарочно большой, иначе чтение успеет закончиться раньше нажатия.
  // 250 тысяч записей: меньше страница успевает дочитать раньше, чем дойдёт нажатие.
  const long = Array.from({ length: 250000 }, (_, i) =>
    `<Record type="HKQuantityTypeIdentifierHeartRate" value="${60 + (i % 20)}" unit="count/min" sourceName="Watch"` +
    ` sourceVersion="1" startDate="2022-06-01 10:00:${String(i % 60).padStart(2, '0')} +0300" endDate="2022-06-01 10:00:${String(i % 60).padStart(2, '0')} +0300"/>`).join('');
  const marker = await page.evaluate(() => HealthUI.state().main.monthly.length);
  await page.evaluate(() => HealthUI.dropToasts(true));
  await page.setInputFiles('[data-ui="archiveFile"]', archiveOf(healthXml(long)));
  await page.click('[data-ui="archiveCancel"]');
  await settled();
  const cancelled = await page.evaluate(() => ({ text: HealthUI.control('alert').textContent, rows: HealthUI.state().main.monthly.length }));
  check('cancelling leaves the previous data in place', /отменено/i.test(cancelled.text) && cancelled.rows === marker);
  await reload();

  // ——— Графики: ширина карточки, легенда, подписи осей, выбор вида. ———
  await page.click('[data-tab="story"]');
  const bigRow = await page.evaluate(() => {
    const svg = HealthUI.control('app').querySelector('svg.chart');
    const card = svg.closest('.panel');
    const box = svg.getBoundingClientRect(), inner = card.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(card).paddingLeft);
    const room = inner.width - 2 * pad;
    return { fits: box.width <= room + 1 && box.width >= room * 0.98,
      taller: box.height > 200,
      sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      legend: !!HealthUI.control('app').querySelector('.chart-legend'),
      axes: [...svg.querySelectorAll('.axis-title')].map(t => t.textContent).join(' '),
      toggle: !!HealthUI.control('app').querySelector('[data-chart-kind]') };
  });
  check('the big row fills the card width instead of scrolling sideways', bigRow.fits && !bigRow.sideScroll);
  check('its height follows the width instead of a fixed band', bigRow.taller);
  check('the chart keeps a legend and names both axes',
    bigRow.legend && /Месяцы/.test(bigRow.axes) && bigRow.axes.split(' ').length >= 2);
  check('the chart offers a choice of line or bars', bigRow.toggle);

  // Месяц на оси пишется как здесь принято: месяц, точка, год.
  check('months on the axis read month-dot-year', await page.evaluate(() => {
    const t = [...HealthUI.control('app').querySelectorAll('svg.chart .axis')].map(e => e.textContent);
    const months = t.filter(v => /^\d{2}\.\d{4}$/.test(v));
    return months.length >= 3 && !t.some(v => /^\d{2}-\d{2}$/.test(v))
      && [...HealthUI.control('app').querySelectorAll('svg.chart .axis-title')]
           .some(e => /месяц\.год/.test(e.textContent));
  }));

  const switched2 = await page.evaluate(() => {
    const before = !!HealthUI.control('app').querySelector('[data-role="line"]');
    const sel = HealthUI.control('app').querySelector('[data-chart-kind]');
    sel.value = 'bar'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const app = HealthUI.control('app');
    return { before, bars: app.querySelectorAll('[data-role="bar"]').length,
      line: !!app.querySelector('[data-role="line"]'),
      kept: HealthUI.control('app').querySelector('[data-chart-kind]').value };
  });
  check('switching to bars replaces the line with bars',
    switched2.before && switched2.bars > 0 && !switched2.line && switched2.kept === 'bar');
  await page.evaluate(() => { HealthUI.setState({ chartKind: {} }); HealthUI.render(); });

  // Пульс покоя — месячная оценка, а не точка на непрерывной кривой, и открывается столбиками.
  await page.click('[data-tab="heart"]');
  check('resting heart rate opens as bars without being asked', await page.evaluate(() =>
    HealthUI.control('app').querySelectorAll('[data-role="bar"]').length > 0
    && !HealthUI.control('app').querySelector('[data-role="line"]')));

  await page.click('[data-tab="season"]');
  check('seasonality fills the card too and keeps its four-year legend', await page.evaluate(() => {
    const svg = HealthUI.control('app').querySelector('svg.chart'), card = svg.closest('.panel');
    const pad = parseFloat(getComputedStyle(card).paddingLeft);
    return svg.getBoundingClientRect().width >= (card.getBoundingClientRect().width - 2 * pad) * 0.98
      && HealthUI.control('app').querySelectorAll('.chart-legend span').length >= 2
      && !!HealthUI.control('app').querySelector('[data-chart-kind]');
  }));

  // ——— Один горизонтальный край на всё и одни отступы внутри карточек. ———
  const edges = await page.evaluate(() => {
    const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.right)] };
    const rows = [r('.top'), r('.nav'), r('[data-ui="controls"]'), r('main .panel'),
      [r('[data-ui="reset"]')[0], r('[data-ui="reset"]')[1]], r('[data-ui="resetHint"]'), r('#preset')];
    const left = r('.top')[0], right = r('.top')[1];
    return { rightOk: rows.every(x => Math.abs(x[1] - right) <= 1),
      leftOk: [r('.nav'), r('[data-ui="controls"]'), r('main .panel')].every(x => Math.abs(x[0] - left) <= 1),
      sideScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  check('the button, its caption, the rules, the period selects and the cards share one right edge', edges.rightOk);

  // Выбор показателя кончается там же, где карточка: и когда он стоит рядом
  // с заголовком, и когда карточка узкая и он занимает всю строку.
  check('the metric select ends where its card ends', await page.evaluate(() => {
    const sels = [...document.querySelectorAll('main .sectionhead select')];
    if (!sels.length) return false;
    return sels.every(sel => {
      const card = sel.closest('.panel');
      const pad = parseFloat(getComputedStyle(card).paddingRight);
      return Math.abs(card.getBoundingClientRect().right - pad - sel.getBoundingClientRect().right) <= 2;
    });
  }));
  check('and one left edge', edges.leftOk);
  check('no element pushes the page sideways', !edges.sideScroll);

  const padding = await page.evaluate(() => {
    const box = el => { const c = getComputedStyle(el); return [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].join(' ') };
    const scale = ['4px', '8px', '12px', '16px', '24px', '32px', '48px', '0px'];
    const cards = [...document.querySelectorAll('main .panel, main .card, main .chip, main .norm')];
    const boxes = new Set(cards.map(box));
    return { one: boxes.size === 1, value: [...boxes][0],
      onScale: cards.every(el => box(el).split(' ').every(v => scale.includes(v))),
      tokens: scale.slice(0, 7).every((v, i) => getComputedStyle(document.documentElement).getPropertyValue('--s-' + (i + 1)).trim() === v) };
  });
  check('the spacing scale is in the tokens', padding.tokens);

  // Отступы проверяются не выборочно, а сплошь: каждая вкладка, каждый видимый элемент.
  // Ненулевое значение padding / margin / gap обязано совпадать со ступенью шкалы.
  // Нутро SVG и строчные элементы пропускаются: там расстояния задаёт текст.
  const TABS = ['story','overview','activity','workouts','heart','sleep','season','quality'];
  const strays = [], dots = [];
  for (const tab of TABS) {
    await page.click(`[data-tab="${tab}"]`);
    const found = await page.evaluate(() => {
      const scale = [4, 8, 12, 16, 24, 32, 48];
      const ok = v => { const n = parseFloat(v); return !n || scale.includes(Math.round(n * 10) / 10) };
      const name = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
      const out = [];
      const roots = ['header', '[data-ui="nav"]', '[data-ui="controls"]', '[data-ui="app"]', 'footer']
        .map(s => document.querySelector(s));
      for (const root of roots) {
        if (!root || getComputedStyle(root).display === 'none') continue;
        for (const el of [root, ...root.querySelectorAll('*')]) {
          if (el.ownerSVGElement || el.tagName.toLowerCase() === 'option') continue;
          const c = getComputedStyle(el);
          if (c.display === 'none' || c.display === 'inline') continue;
          for (const prop of ['paddingTop','paddingRight','paddingBottom','paddingLeft',
                              'marginTop','marginRight','marginBottom','marginLeft','rowGap','columnGap']) {
            const v = c[prop];
            if (v && v !== 'normal' && !ok(v)) out.push(prop + '=' + v + ' on ' + name(el));
          }
        }
      }
      return [...new Set(out)];
    });
    for (const f of found) strays.push(tab + ': ' + f);
    // «зан.» уже кончается точкой: строка «Всего: 3 413 зан..» ловится здесь.
    const doubled = await page.evaluate(() => {
      const t = HealthUI.control('app').textContent;
      const m = t.match(/\S*\.\.(?!\.)\S*/g);
      return m ? [...new Set(m)] : [];
    });
    for (const d of doubled) dots.push(tab + ': ' + d);
  }
  check('every padding, margin and gap on every tab is a step off the scale', strays.length === 0);
  check('no unit is printed with two full stops after it', dots.length === 0);
  if (dots.length) console.log([...new Set(dots)].join('\n'));
  if (strays.length) console.log([...new Set(strays)].slice(0, 20).join('\n'));

  // Один размер у заголовка раздела, стоит он рядом с выбором показателя или сам по себе.
  await page.click('[data-tab="quality"]');
  check('both halves of a split screen title at the same size', await page.evaluate(() => {
    const hs = [...HealthUI.control('app').querySelectorAll('.panel > h1, .sectionhead > h1')];
    return hs.length >= 2 && new Set(hs.map(h => getComputedStyle(h).fontSize)).size === 1;
  }));

  check('every card has the same inner padding, and it is on the scale', padding.one && padding.onScale);

  // Ряд карточек кончался раньше панели под ним и упирался в неё без зазора.
  await page.click('[data-tab="overview"]');
  const cardRow = await page.evaluate(() => {
    const grid = document.querySelector('main .grid'), next = grid.nextElementSibling;
    const g = grid.getBoundingClientRect(), n = next.getBoundingClientRect();
    const scale = [4, 8, 12, 16, 24, 32, 48];
    return { sameRight: Math.abs(g.right - n.right) <= 1, sameLeft: Math.abs(g.left - n.left) <= 1,
      gap: Math.round(n.top - g.bottom) };
  });
  check('the row of cards reaches the same edges as the block below it',
    cardRow.sameLeft && cardRow.sameRight);
  check('and the space between them is a step off the scale',
    [4, 8, 12, 16, 24, 32, 48].includes(cardRow.gap));

  // ——— Пары месяцев: числа остаются швом, на экран не выводятся. ———
  await page.click('[data-tab="activity"]');
  check('the list of month pairs is off the screen', await page.evaluate(() =>
    !/Пары месяцев/.test(HealthUI.control('app').textContent)));
  check('but the pairs themselves are still reachable through the seam', await page.evaluate(() =>
    Array.isArray(HealthUI.comparePairs('steps', false))));

  // ——— Столбики в клетках данных — самое мелкое скругление. ———
  await page.click('[data-tab="story"]');
  check('bars inside the year cells use the smallest corner', await page.evaluate(() => {
    const bars = [...HealthUI.control('app').querySelectorAll('.wall-bar')];
    const small = getComputedStyle(document.documentElement).getPropertyValue('--r-s').trim();
    return bars.length > 0 && bars.every(b => getComputedStyle(b).borderRadius === small);
  }));
  await reload();

  // Кнопка в шапке одна и значит одно и то же на любой странице: уйти на стартовый экран.
  // Встроенный в build набор после этого не возвращается — только новым файлом.
  await page.click('[data-tab="overview"]');
  await page.click('[data-ui="reset"]');
  const afterReset = await page.evaluate(() => ({
    main: HealthUI.state().main, tab: HealthUI.state().tab,
    start: !HealthUI.control('start').className.includes('hidden'),
    nav: getComputedStyle(HealthUI.control('nav')).display === 'none',
    button: HealthUI.control('reset').className.includes('hidden'),
    hint: HealthUI.control('resetHint').textContent,
  }));
  check('«Сбросить» on a page with data returns to the start screen',
    afterReset.main === null && afterReset.start && afterReset.nav && afterReset.tab === 'story');
  check('the embedded set does not come back on its own', afterReset.main === null);
  check('with nothing to reset the button goes away', afterReset.button);
  check('the caption under the button says where it leads',
    /вернётесь на стартовый экран/.test(afterReset.hint));
  await reload();
  check('on a page with data the header shows «Сбросить» in the error colour',
    await page.evaluate(() => {
      const b = HealthUI.control('reset');
      return !b.className.includes('hidden') && b.textContent.trim() === 'Сбросить'
        && getComputedStyle(b).backgroundColor === 'rgb(200, 68, 45)';
    }));

  check('no network requests other than file:', [...schemes].every(s => s === 'file'));
  check('no page errors', errors.length === 0);
  if (errors.length) console.log(errors);

  // ——— Пустая страница: приглашение, чтение с лентой лет, отмена, готовый экран. ———
  const empty = await browser.newPage();
  const emptyErrors = [];
  empty.on('pageerror', e => emptyErrors.push(e.message));
  empty.on('request', r => schemes.add(r.url().split(':')[0]));
  await empty.goto('file://' + EMPTY);
  const visible = sel => empty.evaluate(s => { const el = HealthUI.control(s); return !!el && getComputedStyle(el).display !== 'none'; }, sel);
  const startState = await empty.evaluate(() => ({
    main: HealthUI.state().main, start: !HealthUI.control('start').className.includes('hidden'),
    footer: /github\.com\/blashkin\/health-dashboard-public/.test(HealthUI.control('foot').textContent),
    fields: !!HealthUI.control('startBirth') && !!HealthUI.control('startSex') && !!HealthUI.control('startOpen'),
    noHeaderButton: !document.querySelector('[data-ui="openArchive"]')
      && HealthUI.control('reset').className.includes('hidden')
      && HealthUI.control('resetHint').className.includes('hidden'),
  }));
  check('the empty page carries no data at all', startState.main === null);
  check('the empty page opens with the invitation', startState.start && !(await visible('nav')) && !(await visible('app')) && !(await visible('controls')));
  check('the start screen leaves no button in the header', startState.noHeaderButton);
  check('the start screen offers year of birth, sex and the button', startState.fields);
  check('both start fields are the same height, border and corner', await empty.evaluate(() => {
    const box = el => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return [Math.round(r.height), c.borderRadius, c.borderTopWidth, c.borderTopColor].join('|'); };
    return box(HealthUI.control('startBirth')) === box(HealthUI.control('startSex'));
  }));
  check('the footer names the repository', startState.footer);
  await empty.fill('[data-ui="startBirth"]', '1988');
  await empty.selectOption('[data-ui="startSex"]', 'm');
  check('the start fields land in the same state the story tab reads',
    await empty.evaluate(() => HealthUI.state().birthYear === 1988 && HealthUI.state().sex === 'm'));

  const settledEmpty = () => empty.waitForFunction(() => HealthUI.control('alert').textContent.length > 0, null, { timeout: 60000 });
  const feedEmpty = async file => { await empty.evaluate(() => HealthUI.dropToasts(true)); await empty.setInputFiles('[data-ui="archiveFile"]', file); await settledEmpty(); };
  await feedEmpty({ name: 'export.zip', mimeType: 'application/zip', buffer: Buffer.from('not a zip at all') });
  check('a bad file on the empty page returns to the start with our own words',
    await empty.evaluate(() => /не zip/.test(HealthUI.control('alert').textContent) && HealthUI.state().main === null && !HealthUI.control('start').className.includes('hidden')));

  // Экран чтения: год листается от года рождения, лента лет, этап словами, без процентов.
  await empty.evaluate(() => HealthUI.dropToasts(true));
  await empty.setInputFiles('[data-ui="archiveFile"]', archiveOf(healthXml(long)));
  await empty.waitForFunction(() => !HealthUI.control('loading').className.includes('hidden'), null, { timeout: 10000 });
  const reading = await empty.evaluate(() => ({
    year: HealthUI.control('loadYear').textContent, stage: HealthUI.control('loadStage').textContent,
    chips: HealthUI.control('loadYears').children.length, first: HealthUI.control('loadYears').firstElementChild.textContent,
    start: HealthUI.control('start').className.includes('hidden'), percent: /%/.test(document.querySelector('[data-ui="archivePercent"]').textContent),
  }));
  check('while reading, the start screen gives way to the loading screen', reading.start);
  check('the loading screen shows a year, not a percentage', /^\d{4}$/.test(reading.year) && !reading.percent);
  check('the ribbon runs from the year of birth to this year', reading.first === '1988' && reading.chips === new Date().getFullYear() - 1988 + 1);
  check('the stage is named in words', /Открываю архив|Читаю записи|Свожу дни и месяцы/.test(reading.stage));
  await empty.click('[data-ui="archiveCancel"]');
  await settledEmpty();
  check('cancelling on the empty page returns to the start with nothing loaded',
    await empty.evaluate(() => /Ничего не загружено/.test(HealthUI.control('alert').textContent) && HealthUI.state().main === null && !HealthUI.control('start').className.includes('hidden')));

  // Маленький архив читается за доли секунды: экран чтения обязан всё равно прожить
  // три секунды, иначе лента лет мелькает и человек не понимает, что произошло.
  const beforeFeed = Date.now();
  await feedEmpty(archiveOf(healthXml()));
  const readMs = Date.now() - beforeFeed;
  check('a small archive still keeps the reading screen for about three seconds', readMs >= 2900);
  const ready = await empty.evaluate(() => ({
    tab: HealthUI.state().tab, start: HealthUI.control('start').className.includes('hidden'), loading: HealthUI.control('loading').className.includes('hidden'),
    who: (HealthUI.control('app').querySelector('[data-role="story-who"]') || {}).textContent || '',
    intro: !!HealthUI.control('app').querySelector('[data-ui="storyBirth"]'),
  }));
  check('after reading, the dashboard opens on the plain-language section', ready.tab === 'story' && ready.start && ready.loading && (await visible('nav')));
  check('what was typed on the start screen is what the norms are matched on',
    /1988/.test(ready.who) && /мужской/.test(ready.who) && !ready.intro);
  await feedEmpty({ name: 'fake_archive.zip', mimeType: 'application/zip', buffer: fs.readFileSync(FAKE) });
  check('the fake archive is marked as demo data on the empty page too',
    await empty.evaluate(() => HealthUI.state().isDemo === true && /Демонстрационные данные/.test(HealthUI.control('periodTitle').textContent)));
  check('the empty page raised no errors', emptyErrors.length === 0);
  if (emptyErrors.length) console.log(emptyErrors);
  check('still no network requests other than file:', [...schemes].every(s => s === 'file'));
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll browser checks passed.');
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e.message); process.exitCode = 2; })
  // Закрыть браузер и на ошибке: иначе процесс висит, а не падает.
  .finally(async () => { if (browser) await browser.close().catch(() => {}); });
