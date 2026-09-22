"""Сборка автономного HTML: разметка, стили, скрипт и данные в одном файле.

Замена прежнему build.mjs: Node для работы программы не нужен.
"""
import json
from pathlib import Path

UI=Path(__file__).resolve().parent/'ui'
DATA_SLOTS=('/*__MAIN_DATA__*/','/*__SLEEP_DATA__*/','/*__IS_DEMO__*/')

def encode(obj):
 """JSON внутри <script>.

 `<` закрывается, чтобы данные не могли открыть новый тег: этого достаточно и против
 `</script>`, и против `<!--`. U+2028 и U+2029 закрываются, потому что в JavaScript
 это переводы строки, а в JSON — обычные символы."""
 return (json.dumps(obj,ensure_ascii=False)
         .replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029'))

def sub(s,old,new,count=1):
 # Каждая подстановка обязана совпасть: молчаливый промах выпустил бы полусобранный файл.
 found=s.count(old)
 if found!=count: raise ValueError('Плейсхолдер %s встретился %d раз вместо %d.'%(old,found,count))
 return s.replace(old,new)

FONTS=UI/'fonts'

def font_faces():
 """@font-face для встроенного шрифта: файлы из ui/fonts как data:-URI.

 Страница офлайн и по CSP ничего не загружает, поэтому шрифт едет внутри файла.
 Сабсеты Google Fonts маленькие: восемь файлов Golos Text — около 77 КБ."""
 import base64
 faces=[]
 for f in json.loads((FONTS/'manifest.json').read_text(encoding='utf-8')):
  data=base64.b64encode((FONTS/f['file']).read_bytes()).decode('ascii')
  faces.append("@font-face{font-family:'Golos Text';font-style:normal;font-weight:%d;font-display:swap;"
               "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}"%(f['weight'],data,f['unicode_range']))
 return ''.join(faces)

def skeleton():
 """Страница со стилями и скриптом, но ещё без данных. Порядок склейки фиксирован."""
 page=(UI/'index.html').read_text(encoding='utf-8')
 page=sub(page,'/*__STYLES__*/',font_faces()+(UI/'styles.css').read_text(encoding='utf-8'))
 page=sub(page,'/*__I18N__*/',(UI/'i18n.js').read_text(encoding='utf-8'))
 page=sub(page,'/*__APP__*/',(UI/'app.js').read_text(encoding='utf-8'))
 page=sub(page,'/*__STORY__*/',(UI/'story.js').read_text(encoding='utf-8'))
 page=sub(page,'/*__ARCHIVE__*/',(UI/'archive.js').read_text(encoding='utf-8'))
 rest=page
 for slot in DATA_SLOTS: rest=rest.replace(slot,'')
 if '/*__' in rest: raise ValueError('В скелете остались неподставленные плейсхолдеры.')
 return page

def build(main,sleep,demo=False):
 """Готовый файл. Данные подставляются последними: подставить что-то из них уже нельзя."""
 page=skeleton()
 page=sub(page,'/*__IS_DEMO__*/','true' if demo else 'false')
 # Пустая страница: данных нет, и она встречает приглашением открыть архив.
 page=sub(page,'/*__MAIN_DATA__*/','null' if main is None else encode(main))
 page=sub(page,'/*__SLEEP_DATA__*/','null' if sleep is None else encode(sleep))
 return page
