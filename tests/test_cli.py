"""Командная строка: маркер, повторный запуск, отказ на чужом каталоге, права, --open."""
import contextlib, io, json, os, stat, sys, tempfile, unittest
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fixtures import rich_xml, write_archive
from health_dashboard import cli

def mode(path):
 return stat.S_IMODE(path.stat().st_mode)

class CliTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(); self.path=Path(self.tmp.name)
  self.addCleanup(self.tmp.cleanup)
  # Вывод программы проверяется отдельно; в отчёте тестов он только мешает.
  quiet=contextlib.ExitStack()
  quiet.enter_context(contextlib.redirect_stdout(io.StringIO()))
  quiet.enter_context(contextlib.redirect_stderr(io.StringIO()))
  self.addCleanup(quiet.close)
 def test_demo_writes_a_dashboard_and_a_marker(self):
  out=self.path/'result'
  self.assertEqual(cli.main(['demo','-o',str(out)]),0)
  self.assertTrue((out/'dashboard.html').is_file())
  self.assertTrue((out/'data/approved_monthly.json').is_file())
  marker=json.loads((out/cli.MARKER).read_text(encoding='utf-8'))
  self.assertEqual(marker['tool'],'health-dashboard')
  self.assertIn('schema',marker); self.assertIn('version',marker)
  self.assertEqual(marker['mode'],'demo')
 def test_page_writes_an_empty_dashboard_without_data(self):
  out=self.path/'page'
  self.assertEqual(cli.main(['page','-o',str(out)]),0)
  html=(out/'dashboard.html').read_text(encoding='utf-8')
  self.assertIn('const EMBEDDED_MAIN = null',html)
  self.assertFalse((out/'data').exists())
  self.assertEqual(json.loads((out/cli.MARKER).read_text(encoding='utf-8'))['mode'],'page')
 def test_second_run_updates_in_place(self):
  out=self.path/'result'
  cli.main(['demo','-o',str(out)])
  (out/'data/своя_заметка.txt').write_text('оставить на месте',encoding='utf-8')
  self.assertEqual(cli.main(['demo','-o',str(out)]),0)
  self.assertTrue((out/'dashboard.html').is_file())
  # Обновление на месте, а не пересоздание каталога: посторонний файл цел.
  self.assertTrue((out/'data/своя_заметка.txt').is_file())
 def test_foreign_directory_is_refused_with_code_two(self):
  out=self.path/'чужой'; out.mkdir(); (out/'важное.txt').write_text('не трогать',encoding='utf-8')
  self.assertEqual(cli.main(['demo','-o',str(out)]),2)
  self.assertFalse((out/'dashboard.html').exists())
  self.assertTrue((out/'важное.txt').is_file())
 def test_force_writes_but_keeps_other_files(self):
  out=self.path/'чужой'; out.mkdir(); (out/'важное.txt').write_text('не трогать',encoding='utf-8')
  self.assertEqual(cli.main(['demo','-o',str(out),'--force']),0)
  self.assertTrue((out/'dashboard.html').is_file())
  self.assertEqual((out/'важное.txt').read_text(encoding='utf-8'),'не трогать')
 def test_home_and_repository_directories_are_refused(self):
  repo=self.path/'repo'; (repo/'.git').mkdir(parents=True)
  self.assertEqual(cli.main(['demo','-o',str(repo)]),2)
  self.assertEqual(cli.main(['demo','-o',str(repo),'--force']),2)
  self.assertFalse((repo/'dashboard.html').exists())
  with mock.patch.object(cli.Path,'home',staticmethod(lambda:self.path)):
   self.assertEqual(cli.main(['demo','-o',str(self.path)]),2)
 def test_permissions_are_private(self):
  out=self.path/'result'
  cli.main(['demo','-o',str(out)])
  self.assertEqual(mode(out),0o700)
  self.assertEqual(mode(out/'data'),0o700)
  self.assertEqual(mode(out/'dashboard.html'),0o600)
  self.assertEqual(mode(out/'data/approved_monthly.json'),0o600)
 def test_open_hands_a_file_url_to_the_browser(self):
  out=self.path/'result'
  with mock.patch.object(cli.webbrowser,'open') as opened:
   self.assertEqual(cli.main(['demo','-o',str(out),'--open']),0)
  opened.assert_called_once()
  url=opened.call_args[0][0]
  self.assertTrue(url.startswith('file://') and url.endswith('dashboard.html'))
 def test_build_goes_from_archive_to_dashboard(self):
  archive=write_archive(self.path/'a.zip',rich_xml())
  out=self.path/'result'
  self.assertEqual(cli.main(['build',str(archive),'-o',str(out)]),0)
  self.assertTrue((out/'dashboard.html').is_file())
  for name in ('daily.csv','monthly.csv','monthly_sleep_windows.json','approved_monthly.json','report.html'):
   self.assertTrue((out/'data'/name).is_file(),name)
  self.assertEqual(cli.main(['verify',str(out)]),0)
  # Свой архив — не демонстрация: значок не должен обещать синтетические данные.
  html=(out/'dashboard.html').read_text(encoding='utf-8')
  self.assertEqual(html.count('isDemo:false'),2)
 def test_no_inventory_skips_the_technical_report(self):
  archive=write_archive(self.path/'a.zip',rich_xml())
  out=self.path/'result'
  self.assertEqual(cli.main(['build',str(archive),'-o',str(out),'--no-inventory']),0)
  self.assertFalse((out/'data/report.html').exists())
  # Технический отчёт необязателен: проверка согласованности без него всё равно проходит.
  self.assertEqual(cli.main(['verify',str(out)]),0)
 def test_a_broken_archive_fails_without_printing_values(self):
  broken=self.path/'broken.zip'; broken.write_bytes(b'not a zip')
  self.assertEqual(cli.main(['build',str(broken),'-o',str(self.path/'result')]),1)
 def test_no_command_prints_help(self):
  self.assertEqual(cli.main([]),2)
if __name__=='__main__': unittest.main()
