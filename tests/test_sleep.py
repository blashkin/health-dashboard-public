"""Случаи по сну: граница полудня, полночь, перекрытия, два источника, смена смещения.

Два определения сна живут рядом: календарный день в `monthly.csv` и окно полдень–полдень
в `monthly_sleep_windows.json`. Их числа не обязаны совпадать и смешивать их нельзя.
"""
import csv, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fixtures import ASLEEP, AWAKE, DEEP, INBED, PHONE, WATCH, record, sleep, write_archive
from health_dashboard.pipeline import run

def process(*records):
 """Собрать архив из перечисленных записей и вернуть (месячные строки, сводка по окнам, счётчики)."""
 tmp=tempfile.TemporaryDirectory()
 path=Path(tmp.name); archive=write_archive(path/'a.zip','<HealthData>'+''.join(records)+'</HealthData>')
 counters=run(archive,path/'out')
 with (path/'out/monthly.csv').open(encoding='utf-8-sig') as f: monthly=list(csv.DictReader(f))
 windows=json.loads((path/'out/monthly_sleep_windows.json').read_text(encoding='utf-8'))
 tmp.cleanup()
 return monthly,windows,counters

def only(windows):
 return windows['monthly'][0]

class SleepWindowTests(unittest.TestCase):
 def test_record_across_noon_splits_into_two_windows(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-03 10:00:00 +0300','2021-03-03 14:00:00 +0300'))
  self.assertEqual(only(w)['observed_windows'],2)
  self.assertEqual(only(w)['mean_hours'],2.0)
 def test_night_across_midnight_is_one_window_labelled_by_its_end(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-01 23:00:00 +0300','2021-03-02 06:00:00 +0300'))
  self.assertEqual(only(w)['observed_windows'],1)
  self.assertEqual(only(w)['mean_hours'],7.0)
 def test_nap_inside_one_window_stays_one_window(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-02 14:00:00 +0300','2021-03-02 15:30:00 +0300'))
  self.assertEqual(only(w)['observed_windows'],1)
  self.assertEqual(only(w)['mean_hours'],1.5)
 def test_awake_over_asleep_is_counted_as_a_conflict(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-04 23:00:00 +0300','2021-03-05 07:00:00 +0300'),
                sleep(AWAKE,'2021-03-05 03:00:00 +0300','2021-03-05 03:30:00 +0300'))
  self.assertEqual(only(w)['conflicting_awake_windows'],1)
  # Пересечение не вычитается из длительности: это пометка, а не поправка.
  self.assertEqual(only(w)['mean_hours'],8.0)
 def test_awake_without_sleep_makes_no_window(self):
  _,w,_=process(sleep(AWAKE,'2021-03-06 02:00:00 +0300','2021-03-06 02:30:00 +0300'))
  self.assertEqual(w['monthly'],[])
 def test_overlapping_intervals_are_united_not_summed(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-14 23:00:00 +0300','2021-03-15 04:00:00 +0300'),
                sleep(DEEP,'2021-03-15 02:00:00 +0300','2021-03-15 06:00:00 +0300'))
  self.assertEqual(only(w)['mean_hours'],7.0)
 def test_in_bed_is_not_a_window(self):
  _,w,_=process(sleep(INBED,'2021-03-16 22:00:00 +0300','2021-03-17 07:00:00 +0300'))
  self.assertEqual(w['monthly'],[])
 def test_two_sources_on_one_window_choose_the_watch(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-08 23:00:00 +0300','2021-03-09 06:00:00 +0300',source=PHONE),
                sleep(ASLEEP,'2021-03-08 23:30:00 +0300','2021-03-09 05:00:00 +0300',source=WATCH))
  self.assertEqual(only(w)['multi_source_windows'],1)
  self.assertEqual(only(w)['observed_windows'],1)
  # Часы выигрывают по категории, хотя записали меньше телефона: источники не складываются.
  self.assertEqual(only(w)['mean_hours'],5.5)
  self.assertEqual(list(only(w)['selected_sources']),['S002'])
 def test_short_window_is_counted(self):
  _,w,_=process(sleep(ASLEEP,'2021-03-07 01:00:00 +0300','2021-03-07 02:30:00 +0300'))
  self.assertEqual(only(w)['shorter_than_3h_windows'],1)
 def test_offset_change_grows_only_the_counter_of_its_own_scope(self):
  # Смена смещения в записи сна: растут оба счётчика, у каждого своя область.
  _,w,c=process(sleep(ASLEEP,'2021-03-10 23:00:00 +0300','2021-03-11 06:00:00 +0400'))
  self.assertEqual(w['offset_change_intervals'],1)
  self.assertEqual(c['timezone_offset_changes_within_record'],1)
  # Смена смещения в записи шагов: счётчик сна остаётся нулевым.
  _,w,c=process(sleep(ASLEEP,'2021-03-10 23:00:00 +0300','2021-03-11 06:00:00 +0300'),
                record('StepCount',100,'2021-03-12 23:30:00 +0300','2021-03-13 00:30:00 +0400','count'))
  self.assertEqual(w['offset_change_intervals'],0)
  self.assertEqual(c['timezone_offset_changes_within_record'],1)

class TwoDefinitionsTests(unittest.TestCase):
 def test_a_night_across_midnight_differs_between_the_two_definitions(self):
  monthly,w,_=process(sleep(ASLEEP,'2021-03-31 23:00:00 +0300','2021-04-01 06:00:00 +0300'))
  calendar={r['month']:(float(r['value']),int(r['observed_days'])) for r in monthly if r['metric']=='sleep_hours'}
  # Календарный день делит ночь пополам между месяцами: два дня по часу и по шесть.
  self.assertEqual(calendar,{'2021-03':(1.0,1),'2021-04':(6.0,1)})
  # Окно целиком принадлежит апрелю: одно наблюдение в семь часов.
  self.assertEqual([(r['month'],r['mean_hours'],r['observed_windows']) for r in w['monthly']],[('2021-04',7.0,1)])
if __name__=='__main__': unittest.main()
