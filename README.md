# health-dashboard

Turn an Apple Health export into a dashboard of your own long-term trends — activity,
workouts, heart and sleep — entirely on your own machine. The first screen, «Главное»,
sets your numbers against published guidelines (WHO and others, each with its source);
the other tabs show the series themselves, how complete the records are, and a place to
reconcile a month with the Health app.

The interface is in Russian. This README and the data contract are in English; the
methodology and the rest of the documentation are in Russian.

## Three commands

```sh
python3 -m health_dashboard demo --open
```

```sh
python3 -m health_dashboard build path/to/export.zip -o out/dashboard --open
```

```sh
python3 -m health_dashboard verify out/dashboard
```

`demo` builds the dashboard from synthetic data, so you can see what you would get
before handing it your own archive. `build` reads the archive and writes
`dashboard.html` with a `data/` folder beside it. `verify` re-checks that the numbers
in the result agree with each other.

Nothing else is needed: Python 3.9 or newer, standard library only, no packages to
install, no build step. On macOS the system Python at `/usr/bin/python3` is enough.
Run the commands from the directory you cloned this repository into.

Exporting the archive from an iPhone is described in
[docs/ru/EXPORT.md](docs/ru/EXPORT.md). Pass the `.zip` whole; do not unpack it.

## Or open the archive in the page

The dashboard can also read `export.zip` by itself. Build the page once:

```sh
python3 -m health_dashboard demo -o out/demo --open
```

then press **«Открыть архив»** in its header and pick your `export.zip`. The browser
parses the archive locally and fills the same screens. Your archive never goes through
the command line, and nothing is written to disk — which also means nothing is kept:
closing the tab discards the result and the next visit parses the archive again.

`build` stays the reference implementation. The page is required to produce the same
numbers, and `tests/test_archive_equivalence.py` fails if it does not. To check the two
against each other on your own export, run `python3 tests/ui/compare_real.py
path/to/export.zip` (needs Node): it prints only "matched / did not match" and the paths
that differ, never a value. For a very large archive prefer `build`: measured time and memory are in
[docs/ru/LIMITATIONS.md](docs/ru/LIMITATIONS.md).

## No server, no network, no account

The program never opens a network connection. The dashboard it writes is one HTML
file with a `connect-src 'none'` policy, so it cannot call out either. There is
nothing to sign up for and nothing to upload. What the program reads and what it
writes stay in the folder you chose — see [docs/ru/PRIVACY.md](docs/ru/PRIVACY.md)
for what that does and does not protect you from.

## What it does not do

- It is **not a medical device** and it does not diagnose anything. «Главное» compares
  your numbers with general population guidelines and quotes their general advice,
  including when a doctor is worth asking; none of it is advice about you.
- It does not explain causes, test significance or predict anything.
- It does not reproduce the numbers the Health app shows you. Health applies its own
  source priority, which the export does not contain; this program picks one source
  per day by a stated, reproducible rule instead. Expect differences and read
  [docs/ru/METHODOLOGY.md](docs/ru/METHODOLOGY.md) before treating one of them as a
  finding.
- It does not fill in missing days. A gap is a gap, never a zero.
- It does not give personal advice, set targets for you or score your health.

The limits worth knowing before you read any number are listed in
[docs/ru/LIMITATIONS.md](docs/ru/LIMITATIONS.md).

## Documentation

| File | What it answers |
|---|---|
| [docs/ru/EXPORT.md](docs/ru/EXPORT.md) | How to get the archive off the iPhone |
| [docs/ru/PRIVACY.md](docs/ru/PRIVACY.md) | What stays local, and what "local" does not cover |
| [docs/ru/METHODOLOGY.md](docs/ru/METHODOLOGY.md) | How a day, a night and a month are built |
| [docs/ru/LIMITATIONS.md](docs/ru/LIMITATIONS.md) | What the numbers cannot tell you |
| [docs/ru/UI.md](docs/ru/UI.md) | What each screen shows and how it behaves |
| [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md) | The shape of the aggregates the interface reads |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Layout, tests, how to add a metric |

## Tested on

macOS, Python 3.9.6, the interface in Chrome. Windows, Linux, Safari and Firefox are
untested — nothing platform-specific is used, but nobody has run it there yet. Reading
the archive in the page needs `DecompressionStream`; the page checks for it and says so
plainly when it is missing. Reports are welcome.

## License

MIT. See [LICENSE](LICENSE).
