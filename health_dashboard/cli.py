"""Точка входа. Печатает только статус; личные значения не выводятся ни при успехе, ни при сбое."""
import argparse, json, os, sys, webbrowser
from pathlib import Path
from . import aggregate, demo, pipeline, report, select
from . import SCHEMA_VERSION, __version__
from .verify import verify

MARKER='.health-dashboard.json'
DATA='data'

class Refuse(Exception):
 """Отказ писать в каталог. Сообщение видит человек, поэтому оно должно быть понятным."""

def dangerous(path):
 """Места, где своих файлов быть не должно, сколько бы --force ни повторяли."""
 p=path.expanduser().resolve()
 if p==Path.home().resolve(): return 'это домашний каталог'
 if p==p.parent: return 'это корень файловой системы'
 if (p/'.git').exists(): return 'в каталоге есть .git: похоже на чужой репозиторий'
 return None

def marker_of(out):
 try: return json.loads((out/MARKER).read_text(encoding='utf-8'))
 except (OSError,ValueError): return None

def prepare(out,force):
 """Создать или переиспользовать каталог результата. Ничего не удаляет рекурсивно."""
 reason=dangerous(out)
 if reason: raise Refuse('Отказ писать в %s: %s.'%(out,reason))
 if not out.exists():
  out.mkdir(parents=True); os.chmod(out,0o700); return 'создан'
 if not out.is_dir(): raise Refuse('Отказ: %s — не каталог.'%out)
 if marker_of(out): os.chmod(out,0o700); return 'обновлён'
 if any(out.iterdir()) and not force:
  raise Refuse('Каталог %s не пуст и создан не этой программой.\n'
               'Укажите другой каталог через -o или повторите с --force: тогда будут '
               'перезаписаны только файлы этой программы, остальные останутся нетронутыми.'%out)
 os.chmod(out,0o700)
 return 'занят принудительно' if any(out.iterdir()) else 'создан'

def write_marker(out,mode):
 aggregate.write_text(out/MARKER,json.dumps({'tool':'health-dashboard','schema':SCHEMA_VERSION,
                                             'version':__version__,'mode':mode},indent=2))

def finish(out,main,sleep,mode,open_it):
 data=out/DATA
 dashboard=out/'dashboard.html'
 aggregate.write_text(dashboard,report.build(main,sleep,demo=mode=='demo'))
 write_marker(out,mode)
 print('Готово. Дашборд: %s'%dashboard)
 print('Данные рядом, в %s. Содержимое не печатается.'%data)
 if open_it: webbrowser.open(dashboard.resolve().as_uri())
 return 0

def cmd_build(a):
 out=a.output; prepare(out,a.force)
 data=out/DATA; data.mkdir(parents=True,exist_ok=True); os.chmod(data,0o700)
 pipeline.run(a.archive,data,inventory_report=not a.no_inventory)
 main=select.build_package(data)
 sleep=json.loads((data/'monthly_sleep_windows.json').read_text(encoding='utf-8'))
 aggregate.write_text(data/'approved_monthly.json',json.dumps(main,ensure_ascii=False,indent=2))
 return finish(out,main,sleep,'build',a.open)

def cmd_demo(a):
 out=a.output; prepare(out,a.force)
 data=out/DATA; data.mkdir(parents=True,exist_ok=True); os.chmod(data,0o700)
 files=demo.generate()
 for name,obj in files.items():
  aggregate.write_text(data/name,json.dumps(obj,ensure_ascii=False,indent=2))
 return finish(out,files['approved_monthly.json'],files['monthly_sleep_windows.json'],'demo',a.open)

def cmd_page(a):
 """Страница без данных: открывается приглашением, архив читается в браузере."""
 out=a.output; prepare(out,a.force)
 dashboard=out/'dashboard.html'
 aggregate.write_text(dashboard,report.build(None,None))
 write_marker(out,'page')
 print('Готово. Пустой дашборд: %s'%dashboard)
 if a.open: webbrowser.open(dashboard.resolve().as_uri())
 return 0

def cmd_verify(a):
 folder=a.folder
 if (folder/DATA/'daily.csv').exists(): folder=folder/DATA
 verify(folder)
 print('Проверка согласованности пройдена; личные значения не печатаются.')
 return 0

def parser():
 p=argparse.ArgumentParser(prog='python3 -m health_dashboard',
                           description='Локальный дашборд по выгрузке Apple Health. Ничего не уходит с компьютера.')
 p.add_argument('--version',action='version',version=__version__)
 sub=p.add_subparsers(dest='command')
 b=sub.add_parser('build',help='обработать архив выгрузки и собрать дашборд')
 b.add_argument('archive',type=Path,help='zip-архив выгрузки, целиком, распаковывать не нужно')
 b.add_argument('-o','--output',type=Path,default=Path('out/dashboard'),help='каталог результата')
 b.add_argument('--force',action='store_true',help='писать в непустой чужой каталог, не трогая посторонние файлы')
 b.add_argument('--open',action='store_true',help='открыть готовый файл в браузере')
 b.add_argument('--no-inventory',action='store_true',help='не собирать технический отчёт report.html')
 b.set_defaults(func=cmd_build)
 d=sub.add_parser('demo',help='собрать дашборд на синтетических данных')
 d.add_argument('-o','--output',type=Path,default=Path('out/demo'),help='каталог результата')
 d.add_argument('--force',action='store_true',help='писать в непустой чужой каталог, не трогая посторонние файлы')
 d.add_argument('--open',action='store_true',help='открыть готовый файл в браузере')
 d.set_defaults(func=cmd_demo)
 e=sub.add_parser('page',help='собрать пустой дашборд: архив открывается в браузере')
 e.add_argument('-o','--output',type=Path,default=Path('out/page'),help='каталог результата')
 e.add_argument('--force',action='store_true',help='писать в непустой чужой каталог, не трогая посторонние файлы')
 e.add_argument('--open',action='store_true',help='открыть готовый файл в браузере')
 e.set_defaults(func=cmd_page)
 v=sub.add_parser('verify',help='проверить согласованность готового каталога')
 v.add_argument('folder',type=Path,help='каталог результата')
 v.set_defaults(func=cmd_verify)
 return p

def main(argv=None):
 os.umask(0o077)
 p=parser(); a=p.parse_args(argv)
 if not getattr(a,'func',None): p.print_help(); return 2
 try: return a.func(a)
 except Refuse as e:
  print(str(e),file=sys.stderr); return 2
 except Exception:
  print('Обработка не удалась; личные значения не печатались. Результат может быть неполным.',file=sys.stderr)
  return 1
