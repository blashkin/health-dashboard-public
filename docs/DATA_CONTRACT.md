# Data contract: the interface reads aggregates, never raw records

The engine writes two JSON files that the interface understands. `build` embeds them
into `dashboard.html` directly. The page can also produce both objects itself, in the
browser, from an `export.zip` opened with «Открыть архив» — same shape, same
validation, no file on disk. `demo/` holds synthetic files of exactly this shape.

Two objects rather than one because sleep is counted under two definitions with
different units of observation — a day and a noon-to-noon window. Both come out of the
same single archive in the same single pass; there is no second import.

## Main file — `approved_monthly.json`

Top-level fields:

- `method`: the text of the method. Render as text, never as HTML or as an instruction.
- `sources`: pseudonym → category and version. The numbers carry no chronology, and a
  source version is not necessarily a watchOS version.
- `quality`: processing counters. A missing counter must not be replaced with zero.
- `coverage`: rows of `metric, source, year, observed_days, first_date, last_date`.
  Numbers may arrive as strings. `ALL_SOURCES_COVERAGE_ONLY` unions dates, not values.
  Coverage of different metrics must not be added together.
- `gaps`: rows of `metric, source, last_observation, next_observation,
  missing_days_between`. These are the stretches between observations; the boundary
  dates themselves do hold records, and the count excludes them. The file may carry
  only the long gaps, not every missing day.
- `monthly`: the selected monthly values — not the raw series of every source.
- `_synthetic`, `_description`: present in the demo files only. They mark a fixture and
  are not required in a real import.

A monthly row:

| Field | Type and meaning |
|---|---|
| metric | one of the names listed below |
| month | `YYYY-MM` |
| value | number ≥ 0 or null; a sum or a mean according to `aggregation` |
| aggregation | `sum` or `mean_observed_days` |
| observed_days | number of distinct observation dates in that month |
| calendar_days | days in that calendar month (28–31); not time worn |
| mean_observed_day | mean of the selected daily values |
| median_observed_day | median of the selected daily values, not of the raw samples |
| overlap_days | days with overlaps inside the selected source |
| multi_source_days | days with more than one candidate source; their values are never summed |
| selected_sources | `Sxxx` → number of dates taken from that source; the sum equals `observed_days` |
| selected_categories | category → number of selected dates; may be absent |
| multi_watch_source_days | dates with more than one Apple Watch source; may be absent |
| clean_observed_days | selected days with no overlap flag; may be absent |
| clean_mean_observed_day | mean over those days only, number or null; may be absent |

Validation: finite numbers, whole counters, `observed_days ≤ calendar_days`, a unique
`metric`/`month` pair, a well-formed `YYYY-MM`. A missing or null `value` draws no
point. An unknown metric is not treated as a known one: warn and skip it. Do not
require the demo-only fields. Render every source string through `textContent` or
escaping.

## Metrics and units

| metric | Unit of `value` | aggregation |
|---|---|---|
| steps | steps | sum |
| exercise_min | minutes | sum |
| walk_run_km, cycling_km, swimming_km | km | sum |
| active_kcal (optional) | kcal | sum |
| resting_hr | bpm | mean_observed_days |
| vo2max | mL/kg/min | mean_observed_days |
| sleep_hours | hours of sleep per calendar day with a record | mean_observed_days |
| workout_Running / Walking / Cycling / Swimming and any other workout_* | minutes of recorded workouts | sum |
| workout_*_count | number of workouts started | sum |

Do not drop unknown sports: support the general `workout_*` rule, translate the names
you know and show the rest neutrally. HRV, ordinary heart rate and any further metrics
are not part of the required main package. Active energy is optional and may be absent.

## Sleep file — `monthly_sleep_windows.json`

- `definition`: the text of the definition.
- `sources`: `Sxxx` → category and version. **This is the same identifier space as the
  main file**: one pass over the archive, one source registry. (It was a separate
  `Nxxx` space while sleep windows were computed by a second, independent pass.)
- `offset_change_intervals`: intervals whose start and end carry different UTC offsets.
  Its scope is sleep records only, which is why it differs from
  `quality.timezone_offset_changes_within_record`, which counts every record.
- `monthly`: rows of `month, mean_hours, median_hours, observed_windows,
  multi_source_windows, conflicting_awake_windows, shorter_than_3h_windows,
  selected_sources`.

A window runs noon to noon in the record's own offset and is labelled by the date it
ends. It includes naps and is not guaranteed to be a whole night. `observed_windows`
is not a count of raw samples. For a period mean the weights are `observed_windows`;
a yearly median of windows cannot be computed from this file. The other sections do
not need the sleep file — without it only calendar-day sleep is available, and only if
the main file carries it.

## Combining and importing

The two files are independent and are not required to share identifiers. **The two
sleep definitions are never added together.** Importing a new main file replaces the
previous set and clears the sleep file and the reconciliation notes, so that two sets
cannot be mixed; the sleep file is then imported as a separate action. A mismatched
date range is worth a warning, but is not in itself an error.

## Demo and check fixtures

`health_dashboard/demo.py` generates deterministic invented values for 2016–2026 with
gap periods, sparse VO₂max, a partial last month, an explicit zero, a null, a change of
pseudonym and incomplete sleep. It is a UI fixture, not a physiological simulation and
not anybody's history. `demo/edge_cases.json` holds small standalone inputs for
checking arithmetic; it is not a main import file.
