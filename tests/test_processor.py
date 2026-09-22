import csv, sys, tempfile, unittest, zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fixtures import write_archive
from health_dashboard.parse import source_key, union
from health_dashboard.pipeline import run
from health_dashboard.verify import verify

class ProcessorTests(unittest.TestCase):
 def test_synthetic_export(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp); archive=write_archive(path/'synthetic.zip')
   stats=run(archive,path/'result')
   verify(path/'result')
   with (path/'result/monthly.csv').open(encoding='utf-8-sig') as f: rows=list(csv.DictReader(f))
   def val(metric,source='S001',month='2020-01'):
    return float(next(r['value'] for r in rows if (r['metric'],r['source'],r['month'])==(metric,source,month)))
   self.assertEqual(stats['duplicates_removed'],1)
   self.assertEqual(stats['invalid_or_unsupported'],1)
   self.assertEqual(val('steps'),160); self.assertEqual(val('steps',month='2020-02'),60)
   self.assertEqual(val('steps','S002'),200)
   self.assertEqual(val('exercise_min'),30)
   self.assertEqual(val('vo2max'),45)
   self.assertEqual(val('resting_hr'),80)
   self.assertEqual(val('sleep_hours'),2)
   # Стадии считаются тем же объединением интервалов, по своим дням: Core 23:00–02:00 даёт 1 ч и 2 ч
   # (среднее 1,5), Deep 01:00–03:00 лежит в одном дне (2 ч). Их средние не складываются в сон.
   self.assertEqual(val('sleep_core_hours'),1.5); self.assertEqual(val('sleep_deep_hours'),2)
   self.assertEqual(val('workout_Running'),45)
   self.assertEqual(val('workout_Running_count'),1)
   self.assertFalse((path/'result/aggregate_work.sqlite').exists())
   self.assertFalse(any(r['month'].startswith('2025') for r in rows))
 def test_source_normalization(self):
  a={'sourceName':'Watch','sourceVersion':'1','device':'<<HKDevice: 0x123>, model:Watch, localIdentifier:A>'}
  b=dict(a,device=a['device'].replace('0x123','0x456'))
  c=dict(b,device=b['device'].replace('localIdentifier:A','localIdentifier:B'))
  self.assertEqual(source_key(a),source_key(b))
  self.assertNotEqual(source_key(a),source_key(c))
  self.assertNotEqual(source_key(a),source_key(dict(a,sourceVersion='2')))
  self.assertNotEqual(source_key(a),source_key(dict(a,sourceName='Another source')))
 def test_union(self):
  self.assertEqual(union([(0,3600),(1800,7200),(0,7200)]),(7200,True))
  self.assertEqual(union([(0,1),(1,2)]),(2,False))
if __name__=='__main__': unittest.main()
