"""Защита приватности: в репозитории не должно быть ни личных путей, ни личных данных.

Тест грубый намеренно: он падает на самих именах личных каталогов, не заглядывая внутрь.
"""
import json, re, subprocess, sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from health_dashboard import demo

ROOT=Path(__file__).resolve().parents[1]
SKIP={'.git','_legacy','out','__pycache__','.DS_Store'}
# Каталоги и файлы владельца из приватного репозитория. Ни один не должен здесь появиться.
FORBIDDEN=re.compile(r'экспорт|local_report|analysis_v2|sleep_analysis|source_diagnostic|openwebui',re.IGNORECASE)
# Тексты, выдающие привязку к чужой машине.
HOME=re.compile(r'/Users/[A-Za-z0-9._-]+')

def tracked():
 """Файлы под контролем версий. Свой архив рядом с репозиторием — дело владельца."""
 try:
  out=subprocess.run(['git','-C',str(ROOT),'ls-files','-z'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
 except OSError:
  return None
 if out.returncode!=0: return None
 return [ROOT/name for name in out.stdout.decode('utf-8').split('\0') if name]

def walk():
 files=tracked()
 if files is None:
  files=[p for p in ROOT.rglob('*') if not any(part in SKIP for part in p.relative_to(ROOT).parts)]
 for path in sorted(files):
  if path.is_file(): yield path

class PrivacyTests(unittest.TestCase):
 def test_no_path_in_the_repository_names_a_personal_folder(self):
  bad=[str(p.relative_to(ROOT)) for p in walk() if FORBIDDEN.search(str(p.relative_to(ROOT)))]
  self.assertEqual(bad,[])
 def test_no_archive_is_committed(self):
  self.assertEqual([str(p.relative_to(ROOT)) for p in walk() if p.suffix=='.zip'],[])
 def test_no_file_holds_a_path_into_somebody_s_home(self):
  bad=[]
  for p in walk():
   try: text=p.read_text(encoding='utf-8')
   except (UnicodeDecodeError,OSError): continue
   if HOME.search(text): bad.append(str(p.relative_to(ROOT)))
  self.assertEqual(bad,[])
 def test_every_demo_file_declares_itself_synthetic(self):
  files=sorted((ROOT/'demo').glob('*.json'))
  self.assertTrue(files,'демонстрационных файлов нет')
  for p in files:
   self.assertIs(json.loads(p.read_text(encoding='utf-8')).get('_synthetic'),True,p.name)

class DemoFixtureTests(unittest.TestCase):
 def test_regeneration_is_byte_for_byte_the_same(self):
  """Фикстуры зафиксированы: пересборка не должна давать шум в истории."""
  for name,obj in demo.generate().items():
   stored=(ROOT/'demo'/name).read_text(encoding='utf-8')
   self.assertEqual(json.dumps(obj,ensure_ascii=False,indent=2),stored,name)
 def test_demo_numbers_do_not_depend_on_today(self):
  self.assertEqual(json.dumps(demo.generate(),ensure_ascii=False),json.dumps(demo.generate(),ensure_ascii=False))
if __name__=='__main__': unittest.main()
