"""Сверка единого прохода с эталоном двух проходов.

Эталон в `tests/legacy/two_pass_reference.py` — дословная копия прежнего кода.
`daily.csv` и `monthly.csv` сравниваются побайтно. Окна сна сравниваются после
отображения Nxxx→Sxxx. Разрешённые расхождения перечислены в тестах поимённо;
всё остальное расхождение — ошибка.
"""
import hashlib, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parent/'legacy'))
import two_pass_reference as legacy
from fixtures import rich_xml, write_archive
from health_dashboard.parse import source_key_hash
from health_dashboard.pipeline import run
from health_dashboard.verify import verify

# Снимок эталона: меняется только вместе с осознанным решением изменить поведение.
SNAPSHOT={
 'daily.csv':'db1fecf19e7a216d178bc7e39dd28cb66fb948798ed4e7529dc0fd4827e0a1d0',
 'monthly.csv':'220573cf755eb5a7334b2ec0aff8c84453fa582d3ca6d0bc6443beed274341cb',
 'monthly_sleep_windows.json':'fc7c607e71edbccdffd6f0167cc56b848f08fbdc6eafdc02842eac7edb2d43b7',
}

def sha(data):
 return hashlib.sha256(data).hexdigest()

class Both:
 """Оба пути на одном архиве, в отдельных каталогах."""
 def __init__(self,tmp):
  path=Path(tmp); self.archive=write_archive(path/'rich.zip',rich_xml())
  self.ref=path/'reference'; self.refsleep=path/'reference_sleep'; self.new=path/'new'
  self.ref_counters=legacy.run(self.archive,self.ref)
  self.ref_sleep,ref_ids=legacy.sleep_main(self.archive,self.refsleep)
  self.new_counters=run(self.archive,self.new)
  self.new_sleep=json.loads((self.new/'monthly_sleep_windows.json').read_text(encoding='utf-8'))
  # Nxxx -> Sxxx: источники сводятся по хешу ключа, а не по номеру.
  by_hash={v['key_hash']:k for k,v in json.loads((self.new/'sources.json').read_text(encoding='utf-8')).items()}
  self.map={nid:by_hash[source_key_hash(key)] for key,nid in ref_ids.items()}
 def pair(self,name):
  return (self.ref/name).read_bytes(),without_stages((self.new/name).read_bytes())

# Разрешённое расхождение: единый проход пишет ещё и стадии сна (sleep_core/deep/rem/unspecified),
# которых у прежнего двухпроходного эталона не было. Строки стадий вырезаются перед сравнением;
# всё остальное обязано совпасть побайтно.
STAGE_ROWS=(b'sleep_core_hours,',b'sleep_deep_hours,',b'sleep_rem_hours,',b'sleep_unspecified_hours,')
def without_stages(data):
 return b''.join(line for line in data.splitlines(keepends=True) if not line.startswith(STAGE_ROWS))

def remap(node,mapping):
 if isinstance(node,dict): return {mapping.get(k,k):remap(v,mapping) for k,v in node.items()}
 if isinstance(node,list): return [remap(v,mapping) for v in node]
 return mapping.get(node,node) if isinstance(node,str) else node

class EquivalenceTests(unittest.TestCase):
 def test_daily_and_monthly_are_byte_identical(self):
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   for name in ('daily.csv','monthly.csv','coverage_years.csv','gaps.csv','availability_years.csv','sources.csv'):
    ref,new=both.pair(name)
    self.assertEqual(ref,new,name+' разошлись с эталоном')
 def test_counters_are_identical(self):
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   self.assertEqual(both.ref_counters,both.new_counters)
 def test_result_passes_its_own_consistency_check(self):
  with tempfile.TemporaryDirectory() as tmp:
   verify(Both(tmp).new)
 def test_reference_snapshot_is_stable(self):
  """Эталон не должен меняться незаметно: иначе сверка теряет смысл."""
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   actual={'daily.csv':sha((both.ref/'daily.csv').read_bytes()),
           'monthly.csv':sha((both.ref/'monthly.csv').read_bytes()),
           'monthly_sleep_windows.json':sha((both.refsleep/'monthly_sleep_windows.json').read_bytes())}
   if not all(SNAPSHOT.values()):
    self.fail('Снимок эталона не зафиксирован. Вписать в SNAPSHOT: '+json.dumps(actual,indent=1))
   self.assertEqual(SNAPSHOT,actual)

 def test_sleep_windows_match_after_remapping_sources(self):
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   ref=remap(both.ref_sleep,both.map); new=both.new_sleep
   self.assertEqual(ref['monthly'],new['monthly'])
   self.assertEqual(ref['offset_change_intervals'],new['offset_change_intervals'])
   self.assertEqual(sorted(ref['sources']),sorted(new['sources']))
 def test_only_the_source_label_of_an_iphone_differs(self):
  """Единое пространство источников даёт категорию iPhone там, где второй проход писал Other/unknown.

  Это прямое следствие решения «один реестр Sxxx»; других расхождений в подписях быть не должно."""
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   ref=remap(both.ref_sleep,both.map)
   changed=[(ref['sources'][s],both.new_sleep['sources'][s]) for s in ref['sources'] if ref['sources'][s]!=both.new_sleep['sources'][s]]
   for was,now in changed:
    self.assertTrue(was.startswith('Other/unknown; ') and now.startswith('iPhone; '),'подпись источника изменилась не только категорией: %r -> %r'%(was,now))
   self.assertTrue(changed,'в архиве нет источника-телефона: расхождение подписей не проверено')
 def test_deduplication_does_not_change_window_duration(self):
  """В едином проходе записи уже дедуплицированы; объединение интервалов идемпотентно."""
  with tempfile.TemporaryDirectory() as tmp:
   both=Both(tmp)
   self.assertGreater(both.new_counters['duplicates_removed'],0)
   hours=lambda d:[(r['month'],r['mean_hours'],r['observed_windows']) for r in d['monthly']]
   self.assertEqual(hours(both.ref_sleep),hours(both.new_sleep))
if __name__=='__main__': unittest.main()
