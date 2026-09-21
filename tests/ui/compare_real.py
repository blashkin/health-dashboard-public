"""Сверка двух реализаций на настоящей выгрузке: python tests/ui/compare_real.py <архив.zip>

Команда build и ядро страницы читают один и тот же архив; печатается только
«СОВПАЛО / НЕ СОВПАЛО» и пути расхождений. Значения в вывод не попадают: они личные.
Промежуточные файлы живут во временной папке с правами 0700 и удаляются по завершении.
В набор тестов скрипт не входит: настоящего архива в репозитории нет и быть не должно.
"""
import json, os, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))

from health_dashboard import pipeline, select
from test_archive_equivalence import NODE, RUNNER, differences


def main(argv):
 if len(argv) != 2: sys.exit(__doc__.splitlines()[0])
 if not NODE: sys.exit('node не найден: ядро страницы запустить нечем')
 archive = Path(argv[1])
 with tempfile.TemporaryDirectory() as tmp:
  os.chmod(tmp, 0o700)
  data = Path(tmp) / 'data'
  started = time.time()
  pipeline.run(archive, data, inventory_report=False)
  ref_main = select.build_package(data)
  ref_sleep = json.loads((data / 'monthly_sleep_windows.json').read_text(encoding='utf-8'))
  middle = time.time()
  out = Path(tmp) / 'page.json'
  # Запас кучи: гигабайтная выгрузка держит в памяти больше гигабайта.
  subprocess.run([NODE, '--max-old-space-size=8192', str(RUNNER), str(archive), str(out)], check=True)
  page = json.loads(out.read_text(encoding='utf-8'))
  bad = differences(ref_main, page['main'], 'main') + differences(ref_sleep, page['sleep'], 'sleep')
  print('build: %.0f с, страница: %.0f с' % (middle - started, time.time() - middle))
  print('строк: monthly %d, coverage %d, gaps %d, окна сна %d' % (
   len(ref_main['monthly']), len(ref_main['coverage']), len(ref_main['gaps']), len(ref_sleep['monthly'])))
  print('СОВПАЛО' if not bad else 'НЕ СОВПАЛО: %d' % len(bad))
  for line in bad[:40]: print(' ', line)
  return 1 if bad else 0


if __name__ == '__main__':
 sys.exit(main(sys.argv))
