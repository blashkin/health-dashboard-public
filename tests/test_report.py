"""Сборщик HTML: подстановки, экранирование данных, CSP, фиксированный порядок склейки."""
import json, re, sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from health_dashboard import demo, report

HOSTILE='</script><script>window.__x=1</script>'

def page(main=None,sleep=None,is_demo=True):
 return report.build(main if main is not None else {'method':'x','sources':{},'monthly':[]},sleep,demo=is_demo)

class ReportTests(unittest.TestCase):
 def test_no_placeholder_survives(self):
  self.assertNotIn('/*__',page())
 def test_styles_and_script_are_embedded(self):
  html=page()
  self.assertIn((report.UI/'styles.css').read_text(encoding='utf-8')[:60],html)
  self.assertIn('function validateMain',html)
 def test_glue_order_is_fixed(self):
  html=page()
  self.assertLess(html.index('<style>'),html.index('<body>'))
  self.assertLess(html.index('<body>'),html.index('const EMBEDDED_MAIN'))
  self.assertLess(html.index('const EMBEDDED_MAIN'),html.index('function validateMain'))
 def test_method_cannot_break_out_of_the_script(self):
  html=page({'method':HOSTILE,'sources':{},'monthly':[]})
  self.assertNotIn(HOSTILE,html)
  self.assertNotIn('</script><script>',html)
  self.assertIn('\\u003c/script>',html)
  # Данные остаются данными: разбор возвращает исходную строку.
  script=html.split('const EMBEDDED_MAIN = ',1)[1].split('; const EMBEDDED_SLEEP',1)[0]
  self.assertEqual(json.loads(script)['method'],HOSTILE)
 def test_line_separators_are_escaped(self):
  html=page({'method':'a\u2028b\u2029c','sources':{},'monthly':[]})
  self.assertNotIn('\u2028',html); self.assertNotIn('\u2029',html)
 def test_csp_is_present(self):
  html=page()
  for rule in ("default-src 'none'","connect-src 'none'","base-uri 'none'","form-action 'none'"):
   self.assertIn(rule,html)
 def test_demo_flag_reaches_the_state_initialiser(self):
  # Инициализатор теперь один: «Сбросить» уводит на стартовый экран, а не к встроенному набору.
  self.assertEqual(report.skeleton().count('isDemo:/*__IS_DEMO__*/'),1)
  self.assertEqual(page(is_demo=True).count('isDemo:true'),1)
  self.assertNotIn('isDemo:true',page(is_demo=False))
 def test_a_missing_placeholder_is_an_error_not_a_silent_pass(self):
  with self.assertRaises(ValueError): report.sub('нет плейсхолдера','/*__X__*/','y')
 def test_the_seam_for_interface_checks_survives_the_build(self):
  """Браузерные проверки держатся за window.HealthUI и data-атрибуты, а не за разметку."""
  html=page()
  self.assertIn('window.HealthUI=HealthUI',html)
  for name in ('from','to','coverage','reset','mainFile','sleepFile','toggleSleep','app','controls',
               'archiveFile','archiveProgress','archiveCancel','resetHint','periodTitle','alert'):
   self.assertIn('data-ui="%s"'%name,html,name)
  # Уведомления рождаются во время работы, поэтому проверяется их движок, а не разметка.
  for name in ('function notify','dropToasts',"dataset.role='toast'"):
   self.assertIn(name,html,name)
  for role in ('line','dot'):
   self.assertIn('data-role="%s"'%role,html,role)
 def test_decisions_of_the_owner_do_not_come_back(self):
  """Три решения, однажды уже потерянные при переносе интерфейса из прежнего проекта."""
  page=report.skeleton()
  self.assertNotIn('Месячные значения',page)
  self.assertNotIn('Качество данных',page)
  self.assertIn('Полнота записей',page)
  # Вид тренировки выходит на экран только через словарь, а не как идентификатор HealthKit.
  self.assertIn("CoreTraining:'Мышцы корпуса'",page)
  self.assertNotIn("replaceAll('_',' ')",page)
  # Обзор и сезонность показывают суммы на день с записью; состав тренировок — диаграммами.
  for mark in ('function perDayRows','data-pick=','function pie(','Последний год в архиве (с января)'):
   self.assertIn(mark,page)

 def test_empty_page_starts_with_an_invitation(self):
  """Страница без данных: null вместо объектов, стартовый экран и экран чтения в разметке."""
  html=report.build(None,None)
  self.assertIn('const EMBEDDED_MAIN = null',html)
  self.assertIn('const EMBEDDED_SLEEP = null',html)
  for mark in ('data-ui="start"','data-ui="loading"','data-ui="startBirth"','data-ui="startSex"','data-ui="loadYears"'):
   self.assertIn(mark,html)
  self.assertNotIn('/*__',html)

 def test_font_is_embedded_and_allowed_by_csp(self):
  """Golos Text едет внутри файла: четыре начертания, кириллица и латиница, font-src data:."""
  html=report.skeleton()
  self.assertEqual(html.count("font-family:'Golos Text';font-style:normal;font-weight:"),8)
  for w in (400,500,600,700): self.assertIn('font-weight:%d;'%w,html)
  self.assertIn('font-src data:',html)
  self.assertIn('data:font/woff2;base64,',html)

 def test_story_file_reaches_the_build(self):
  """Раздел «Главное» живёт в отдельном файле: сборка обязана склеить и его."""
  html=page()
  self.assertIn('function storyTab',html)
  self.assertLess(html.index('const EMBEDDED_MAIN'),html.index('function storyTab'))
 def test_archive_core_reaches_the_build(self):
  """Ядро чтения выгрузки живёт отдельным файлом и обязано попасть в страницу до шва."""
  html=page()
  self.assertIn('const HealthArchive',html)
  self.assertIn('archive:HealthArchive',html)
  self.assertLess(html.index('const HealthArchive'),html.index('window.HealthUI=HealthUI'))
 def test_every_source_in_the_page_is_also_in_the_methodology(self):
  """Реестр источников зашит в страницу; документ обязан перечислять те же адреса.

  Расхождение здесь тихое и дорогое: на экране стоит одна ссылка, в методике другая,
  и проверить норму по документу уже нельзя."""
  story=(report.UI/'story.js').read_text(encoding='utf-8')
  urls=set(re.findall(r"url:'(https://[^']+)'",story))
  self.assertGreater(len(urls),10,'реестр источников не разобрался')
  doc=(Path(__file__).resolve().parents[1]/'docs'/'ru'/'METHODOLOGY.md').read_text(encoding='utf-8')
  for u in sorted(urls): self.assertIn(u,doc,u)
  checked=re.search(r"const CHECKED='([\d-]+)'",story).group(1)
  self.assertIn(checked,doc,'дата сверки в документе не совпадает с кодом')
 def test_demo_data_builds(self):
  data=demo.generate()
  html=report.build(data['approved_monthly.json'],data['monthly_sleep_windows.json'],demo=True)
  self.assertNotIn('/*__',html)
  self.assertIn('"_synthetic":true',html.replace(' ',''))
if __name__=='__main__': unittest.main()
