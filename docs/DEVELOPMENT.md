# Development

## Layout

```
health_dashboard/        the package; runs from the repository directory, no install
  cli.py                 arguments, the result directory, the marker, --force, --open
  parse.py               primitives, finding the XML inside the zip, the record stream
  pipeline.py            one pass over the archive: dedup, day fragments, sleep windows
  aggregate.py           chunks -> daily -> monthly / coverage / gaps, and the file writers
  sleep.py               noon-to-noon windows: the second sleep definition
  select.py              one source per date, and the package the interface reads
  inventory.py           the technical report.html
  report.py              glues ui/ and the data into one standalone HTML file
  verify.py              consistency check of a finished result directory
  demo.py                deterministic synthetic aggregates for the checks
  fake_archive.py        deterministic synthetic export.zip for the demo command
  ui/index.html          markup and placeholders
  ui/styles.css          the stylesheet
  ui/app.js              the interface itself
  ui/story.js            the "Главное" section, spliced into app.js at /*__STORY__*/
  ui/archive.js          zip -> records -> the same two objects, in the browser
demo/                    the generated fixtures, committed
docs/                    this directory
tests/                   unittest, plus tests/legacy/ and tests/ui/
  ui/browser.cjs         the browser checks
  ui/archive_run.cjs     runs ui/archive.js outside a browser, for the equivalence check
  ui/make_archive_fixtures.py  one archive, and what Python computes from it
  ui/make_zip.cjs        a minimal stored-entry zip builder for the browser checks
```

`ui/story.js` and `ui/archive.js` are separate files spliced into `app.js` by
`report.py` through `/*__STORY__*/` and `/*__ARCHIVE__*/`. A placeholder that fails to
match is an error, not a silent pass: `report.sub` raises.

**The methodology now exists twice**: in Python and in `ui/archive.js`. Python is the
reference. Anything that changes a number must change both, and
`tests/test_archive_equivalence.py` is what stops the two from drifting apart quietly.

The package sits at the repository root rather than under `src/`, and nothing has to
be installed: `python3 -m health_dashboard` works from the directory you cloned into,
on the system Python of macOS. A `pyproject.toml` can be added later; it is not the
default path.

Python 3.9, standard library only. No dependency may be added without a very good
reason: the promise that nothing is downloaded and nothing is sent is the product.

The typeface is embedded. `health_dashboard/ui/fonts/` holds Golos Text (SIL OFL,
`OFL.txt` beside it): four weights, Cyrillic and Latin subsets from Google Fonts, about
77 KB together, listed in `manifest.json` with their `unicode-range`. `report.font_faces()`
turns them into `@font-face` rules with `data:` URIs in front of `styles.css`, and the
CSP allows `font-src data:`. To change the face, replace the files and the manifest.

`python3 -m health_dashboard demo -o out/demo` writes the empty page and
`fake_archive.zip` next to it (`fake_archive.py`, deterministic, about 440 KB, ~35k
records from 2016 to 2026 with a gap, a watch change, duplicates and a second source);
`report.build(None, None)` is the page from Python. The committed `demo/` aggregates
stay for the browser checks and the report tests. With `EMBEDDED_MAIN === null` the
page shows the start screen (`data-ui="start"`) and, while reading, the year ribbon
(`data-ui="loading"`); `renderShell()` in app.js is the single switch between the three
states.

## Node is for the interface checks only, never for running the program

The program itself needs no Node. `report.py` does the job `build.mjs` used to do.
Node and Playwright are needed only to run the browser checks below.

## Running the tests

Python — 8 modules, everything but the browser:

```sh
python3 -m unittest discover -s tests
```

No test needs a personal archive: the Python tests build their own zip in a temporary
directory, the browser checks build theirs in memory and run on `demo/`.

`test_archive_equivalence.py` shells out to `node`. Without Node the module skips
itself instead of failing, so a machine without Node still gets a green suite — and a
smaller one. Do not read that green as proof that the page agrees with Python.

Browser — 148 checks against a page with data. Since `demo` writes an empty page, build
one from the fake archive first:

```sh
python3 -m health_dashboard demo -o out/demo
```

```sh
python3 -m health_dashboard build out/demo/fake_archive.zip -o out/check
```

```sh
node tests/ui/browser.cjs
```

Playwright is resolved from a local install or from `PLAYWRIGHT_MODULE=/path/to/playwright`.
`PLAYWRIGHT_BROWSER=webkit` runs the same checks in WebKit (Safari's engine) instead of
the installed Chrome; it needs `npx playwright install webkit` once.
Chrome is taken through `channel: 'chrome'`; a different binary can be given with
`CHROME_PATH`. The script takes the dashboard path as its first argument or from
`HEALTH_DASHBOARD_HTML` and defaults to `out/check/dashboard.html`; the empty page is
the second argument or `HEALTH_DASHBOARD_EMPTY`, default `out/demo/dashboard.html`, with
`fake_archive.zip` expected beside it.

## What the test modules are for

| Module | Guards |
|---|---|
| `test_processor.py` | the pass over the archive end to end, source keys, interval union |
| `test_sleep.py` | noon, midnight, overlaps, two sources, short windows, offset changes, and the two definitions side by side |
| `test_select.py` | source ranking, independence from record order, the package shape |
| `test_report.py` | placeholders, escaping inside `<script>`, CSP, the glue order |
| `test_cli.py` | the marker, a second run, the refusal, `--force`, permissions, `--open` |
| `test_privacy.py` | no personal path anywhere in the repository; the fixtures stay byte-identical |
| `test_equivalence.py` | the single pass against the frozen two-pass reference |
| `test_archive_equivalence.py` | `ui/archive.js` against Python on the same archive: compressed and stored entries, both XML names, two browser time zones, and that the progress scale actually moves |

`tests/legacy/two_pass_reference.py` is a verbatim, self-contained copy of the two
passes as they were before they were merged. It carries its own copies of the
primitives on purpose, so that a change in `parse.py` cannot move the reference
unnoticed. Keep it for one release, and edit it only together with a deliberate
decision to change behaviour. `SNAPSHOT` in `test_equivalence.py` pins its output by
hash for the same reason.

## The seam the interface checks hold on to

`window.HealthUI` in `ui/app.js` is the contract between the interface and
`tests/ui/browser.cjs`. The checks call `HealthUI.periodValue`, `HealthUI.chart`,
`HealthUI.smoothRows`, `HealthUI.comparePairs`, `HealthUI.validateMain`,
`HealthUI.validateSleep`, read the state through `HealthUI.state()` and reach controls
through `HealthUI.control(name)`, which resolves `[data-ui="name"]`. Chart markup is
read through `HealthUI.linePath`, `HealthUI.chartDots` and `HealthUI.chartText`, which
resolve `[data-role="line"]` and `[data-role="dot"]`.

The archive reader hangs off the same seam as `HealthUI.archive`, and the notifications
as `HealthUI.notify` and `HealthUI.dropToasts`; a notification carries
`[data-role="toast"]` and its close button `[data-role="toast-close"]`.

None of the checks name a class, an id or a piece of markup. That is the point: the
stage 3 overlay replaces the charts and the sections, and without the seam the merge
would happen blind. **Rewrite what is behind the seam freely; keep the seam itself, the
`data-ui` names and the `data-role` names.** `test_report.py` fails the Python suite if
they disappear from a build, so a broken seam does not wait for Node to be noticed.

## Adding a metric

1. `METRICS` in `parse.py` — the Apple Health type, our name, the target unit and how
   a day is formed (`sum`, `mean`, `sleep`).
2. **`METRICS` in `ui/archive.js` as well**, plus `CORE`/`MEANS` there. The page carries
   its own copy of the tables; a metric added on one side only is exactly the silent
   drift the equivalence check exists to catch.
3. If it is averaged over observed days, add it to `MEAN_METRICS` in `aggregate.py`,
   and to `CORE`/`MEANS` in `select.py` if it belongs to the main package.
4. `known` in `ui/app.js` — the label, the unit and the aggregation the interface
   expects; `expectedAgg` validates against it.
5. `docs/DATA_CONTRACT.md` — the metric table.
6. A test. A metric that nothing checks will quietly stop working.

New units go into the `factors` table in `parse.normalize` **and into `FACTORS` in
`ui/archive.js`**. An unknown unit is not a crash: the record lands in
`invalid_or_unsupported`.

## Rules that are not style preferences

- **Never print a personal value**, not on success, not in an error, not in an
  exception message. Error text is an output channel like any other.
- Files are written under a temporary name and moved with `os.replace`; directories
  are `0700` and files `0600`.
- The program never deletes recursively, and refuses to write into the home
  directory, the filesystem root, or a directory holding `.git`.
- Data is substituted into the page **last**, after the styles and the script, so that
  nothing inside the data can be substituted into anything.
- The browser checks must close the browser even when a check throws, otherwise a
  failure hangs instead of failing.
- **Long work in the page must give the browser a real turn.** `await` on an already
  resolved promise is a microtask, and between microtasks nothing is painted: a
  progress line updated that way changes in the DOM and never on screen. `scanXml`
  yields with a timeout every 50 ms, and a check guards it.
- A message shown to the user is our own text, never a message from a parser or a
  runtime: those can quote the contents of the file being read.
