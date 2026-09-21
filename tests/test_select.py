import datetime as dt, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fixtures import record, write_archive
from health_dashboard.parse import pieces, stamp, union
from health_dashboard.pipeline import run
from health_dashboard.select import build_package, choose_month

class SelectionTests(unittest.TestCase):
 def test_noon_window(self):
  a=stamp('2024-01-01 23:00:00 +0300'); b=stamp('2024-01-02 07:00:00 +0300')
  parts=list(pieces(a-dt.timedelta(hours=12),b-dt.timedelta(hours=12)))
  self.assertEqual(len(parts),1)
  self.assertEqual((dt.date.fromisoformat(parts[0][0])+dt.timedelta(days=1)).isoformat(),'2024-01-02')
  self.assertEqual((parts[0][2]-parts[0][1])/3600,8)
  asleep=[(0,3600)]; awake=[(1800,5400)]
  self.assertEqual(union(asleep)[0]+union(awake)[0]-union(asleep+awake)[0],1800)
 def test_no_double_count_and_fill(self):
  sources={'S1':'Apple Watch; version 1','S2':'iPhone; version 1','S3':'Apple Watch; version 2'}
  rows=[{'source':'S1','day':'2020-01-01','value':10},{'source':'S2','day':'2020-01-01','value':20},{'source':'S3','day':'2020-01-02','value':30}]
  chosen,multi=choose_month(rows,sources)
  self.assertEqual(sum(r['value'] for r in chosen),40)
  self.assertEqual(multi,1)
  self.assertEqual(len(chosen),2)

 def test_watch_before_phone_and_more_days_before_fewer(self):
  sources={'S1':'iPhone; version 1','S2':'Apple Watch; version 1','S3':'Apple Watch; version 2'}
  rows=([{'source':'S1','day':'2020-01-%02d'%d,'value':1} for d in range(1,6)]
       +[{'source':'S2','day':'2020-01-01','value':2}]
       +[{'source':'S3','day':'2020-01-%02d'%d,'value':3} for d in range(1,4)])
  chosen,_=choose_month(rows,sources)
  # Первый день спорный: часы старше телефона, а из двух часов старше тот, у кого больше дней.
  self.assertEqual(next(r['value'] for r in chosen if r['day']=='2020-01-01'),3)
  # Телефон всё равно заполняет дни, где часов нет.
  self.assertEqual(len(chosen),5)

def steps_archive(path,first,second):
 """Один месяц, два равных источника Apple Watch; порядок записей задаётся аргументами."""
 def days(source,value):
  return [record('StepCount',value,'2021-05-%02d 09:00:00 +0300'%d,'2021-05-%02d 09:30:00 +0300'%d,'count',source=source)
          for d in (1,2,3)]
 return write_archive(path,'<HealthData>'+''.join(days(*first)+days(*second))+'</HealthData>')

class OrderIndependenceTests(unittest.TestCase):
 def test_equal_sources_give_the_same_choice_in_either_order(self):
  """Два равных источника, зарегистрированных в обоих порядках, дают один и тот же выбор."""
  results=[]
  for first,second in ((('Watch Alpha',1000),('Watch Beta',2000)),(('Watch Beta',2000),('Watch Alpha',1000))):
   with tempfile.TemporaryDirectory() as tmp:
    path=Path(tmp)
    run(steps_archive(path/'a.zip',first,second),path/'out')
    package=build_package(path/'out')
    hashes={sid:info['key_hash'] for sid,info in json.loads((path/'out/sources.json').read_text(encoding='utf-8')).items()}
    row=next(r for r in package['monthly'] if r['metric']=='steps')
    results.append((row['value'],sorted(hashes[s] for s in row['selected_sources'])))
  self.assertEqual(results[0],results[1])
  self.assertEqual(len(results[0][1]),1)

class PackageTests(unittest.TestCase):
 def test_package_has_what_the_interface_reads(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)
   run(steps_archive(path/'a.zip',('Watch Alpha',1000),('Tester iPhone',2000)),path/'out')
   package=build_package(path/'out')
   self.assertEqual(sorted(package),['coverage','gaps','method','monthly','quality','sources'])
   row=next(r for r in package['monthly'] if r['metric']=='steps')
   self.assertEqual((row['month'],row['aggregation'],row['observed_days'],row['calendar_days']),('2021-05','sum',3,31))
   # Источники не складываются: три дня по тысяче шагов от старшего источника.
   self.assertEqual(row['value'],3000)
   self.assertEqual(row['multi_source_days'],3)
   self.assertEqual(row['selected_categories'],{'Apple Watch':3})
if __name__=='__main__': unittest.main()
