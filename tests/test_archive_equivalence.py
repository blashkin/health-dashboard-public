"""Сверка двух реализаций методики: Python (эталон) и archive.js (страница).

Один и тот же синтетический архив проходит обоими путями. Счётчики, дни и подписи
сравниваются точно, значения — с допуском 1e-6. Расхождение здесь означает, что
страница показывает не то же, что команда build; это ошибка, а не мелочь.
"""
import json, shutil, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
sys.path.insert(0, str(ROOT / 'tests' / 'ui'))

from fixtures import rich_xml, simple_xml
from make_archive_fixtures import bulk_xml, reference

RUNNER = ROOT / 'tests' / 'ui' / 'archive_run.cjs'
NODE = shutil.which('node')
TOLERANCE = 1e-6


def run_page(archive, tmp, env_tz=None):
 """Ядро страницы на том же архиве. Часовой пояс задаётся снаружи: он не должен влиять."""
 out = Path(tmp) / ('page_%s.json' % (env_tz or 'default').replace('/', '_'))
 env = None
 if env_tz:
  import os
  env = dict(os.environ, TZ=env_tz)
 subprocess.run([NODE, str(RUNNER), str(archive), str(out)], check=True, env=env)
 return json.loads(out.read_text(encoding='utf-8'))


def differences(ref, got, path=''):
 """Список расхождений в виде путей. Значения в текст не попадают: они личные."""
 bad = []
 if isinstance(ref, dict):
  if not isinstance(got, dict): return [path + ': тип']
  for key in sorted(set(ref) | set(got)):
   if key not in ref: bad.append(path + '/' + key + ': лишнее поле')
   elif key not in got: bad.append(path + '/' + key + ': поля нет')
   else: bad += differences(ref[key], got[key], path + '/' + key)
  return bad
 if isinstance(ref, list):
  if not isinstance(got, list): return [path + ': тип']
  if len(ref) != len(got): return [path + ': длина %d против %d' % (len(ref), len(got))]
  for i, (a, b) in enumerate(zip(ref, got)): bad += differences(a, b, '%s[%d]' % (path, i))
  return bad
 if isinstance(ref, float) or isinstance(got, float):
  if not isinstance(got, (int, float)) or isinstance(got, bool): return [path + ': тип']
  return [] if abs(float(ref) - float(got)) <= TOLERANCE else [path + ': значения разошлись']
 return [] if ref == got else [path + ': разошлось']


@unittest.skipUnless(NODE, 'node не найден: проверка эквивалентности пропущена')
class ArchiveEquivalenceTests(unittest.TestCase):
 def check(self, xml, **kwargs):
  with tempfile.TemporaryDirectory() as tmp:
   archive, main, sleep = reference(tmp, xml, **kwargs)
   page = run_page(archive, tmp)
   self.assertEqual([], differences(main, page['main'], 'main'))
   self.assertEqual([], differences(sleep, page['sleep'], 'sleep'))
   return main, sleep

 def test_simple_archive_matches(self):
  main, _ = self.check(simple_xml())
  self.assertTrue(main['monthly'], 'фикстура пуста: сверять нечего')

 def test_rich_archive_matches(self):
  main, sleep = self.check(rich_xml())
  self.assertGreater(main['quality']['duplicates_removed'], 0)
  self.assertGreater(sleep['offset_change_intervals'], 0)
  self.assertTrue(sleep['monthly'], 'окон сна нет: сверять нечего')

 def test_exact_half_rounds_to_even_as_in_python(self):
  """Среднее 60.03125 — ровная половина четвёртого знака: Python даёт 60.0312, toFixed дал бы 60.0313."""
  record = ('<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" sourceVersion="10"'
            ' unit="count/min" startDate="2024-03-%02d 0%d:00:00 +0300" endDate="2024-03-%02d 0%d:00:00 +0300" value="%d"/>')
  rows = [record % (d, 8, d, 8, 60) for d in range(1, 17)] + [record % (1, 9, 1, 9, 61)]
  main, _ = self.check('<?xml version="1.0"?><HealthData>' + ''.join(rows) + '</HealthData>')
  self.assertEqual(60.0312, main['monthly'][0]['value'])

 def test_uncompressed_archive_matches(self):
  """Записи без сжатия (метод 0) читаются тем же путём, что и сжатые."""
  self.check(rich_xml(), compressed=False)

 def test_xml_named_export_xml_matches(self):
  """Обычная выгрузка: имя export.xml находится без обхода по корневому тегу."""
  self.check(rich_xml(), name='apple_health_export/export.xml')

 def test_browser_timezone_does_not_change_the_result(self):
  """Смещение берётся из записи. Часовой пояс браузера не должен менять ни одного числа."""
  with tempfile.TemporaryDirectory() as tmp:
   archive, main, sleep = reference(tmp, rich_xml())
   west = run_page(archive, tmp, 'America/Los_Angeles')
   east = run_page(archive, tmp, 'Asia/Tokyo')
   self.assertEqual([], differences(main, west['main'], 'main'))
   self.assertEqual([], differences(sleep, west['sleep'], 'sleep'))
   self.assertEqual(west, east)

 def test_progress_moves_and_the_interface_gets_its_turn(self):
  """Шкала обязана идти, а вкладка — оставаться живой.

  Прогресс по сжатым байтам давал один скачок с нуля сразу на сто процентов, а чтение
  не уступало управление настоящей задачей: браузер не рисовал ни кадра, и человек видел
  замершую страницу. Проверка держит оба условия сразу."""
  with tempfile.TemporaryDirectory() as tmp:
   archive = Path(tmp) / 'export.zip'
   import zipfile
   with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('apple_health_export/export.xml', bulk_xml())
   self.assertGreater(archive.stat().st_size, 200000, 'архив слишком мал: проверка ничего не значит')
   diagnostics = run_page(archive, tmp)['diagnostics']
   self.assertGreater(diagnostics['progressCalls'], 100, 'прогресс сообщается слишком редко')
   self.assertGreater(diagnostics['distinctPercents'], 20, 'шкала стоит на месте')
   self.assertGreater(diagnostics['interfaceTurns'], 3, 'чтение не уступает управление интерфейсу')


if __name__ == '__main__':
 unittest.main()
