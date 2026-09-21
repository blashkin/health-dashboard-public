"""Проверка согласованности результата на месте. Печатает только статус, не значения."""
import csv, math
from collections import defaultdict

def verify(folder):
 p=folder
 with (p/'daily.csv').open(encoding='utf-8-sig') as f:
  sums=defaultdict(float); counts=defaultdict(int); samples=defaultdict(int); overlaps=defaultdict(int)
  for row in csv.DictReader(f):
   k=(row['metric'],row['source'],row['date'][:7]); v=float(row['value'])
   assert math.isfinite(v) and v>=0
   sums[k]+=v; counts[k]+=1; samples[k]+=int(row['samples_or_fragments']); overlaps[k]+=int(row['overlap_flag'])
 with (p/'monthly.csv').open(encoding='utf-8-sig') as f:
  for row in csv.DictReader(f):
   k=(row['metric'],row['source'],row['month']); n=int(row['observed_days'])
   assert n==counts.pop(k) and 0<n<=int(row['calendar_days'])
   expected=sums[k]/n if row['aggregation']=='mean_of_observed_days' else sums[k]
   assert abs(float(row['value'])-expected)<=0.000051
   assert int(row['samples_or_fragments'])==samples[k]
   assert int(row['overlap_days'])==overlaps[k]
 assert not counts
 for name in ('daily.csv','monthly.csv','sources.csv','sources.json','quality.json','monthly_sleep_windows.json'):
  assert (p/name).is_file(),name
 # Временное хранилище с отдельными образцами не должно пережить успешный прогон.
 assert not (p/'aggregate_work.sqlite').exists()
