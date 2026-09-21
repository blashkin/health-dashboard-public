"""Один проход по архиву: разбор записей, дедупликация, части дней. Личные значения не печатаются."""
import hashlib, json, os, sqlite3
from . import aggregate, inventory, sleep
from .parse import ASLEEP, METRICS, iter_records, normalize, pieces, sleep_metric, source_category, source_key, source_key_hash, stamp

SCHEMA='''CREATE TABLE chunks(metric TEXT,source TEXT,day TEXT,a REAL,b REAL,value REAL,kind TEXT);
CREATE TABLE seen(hash TEXT PRIMARY KEY);
CREATE TABLE inventory(type TEXT,source TEXT,year TEXT,n INTEGER,PRIMARY KEY(type,source,year));
CREATE TABLE sources(id TEXT PRIMARY KEY,description TEXT);
CREATE TABLE windows(kind TEXT,source TEXT,day TEXT,a REAL,b REAL);'''

class Registry:
 """Одно пространство идентификаторов источников на всю выгрузку.

 Имена и идентификаторы устройств не сохраняются. Версия разделяет поколения алгоритма.
 Ключ источника хранится в памяти: по нему разрешаются равенства при выборе источника,
 чтобы результат не зависел от порядка записей в файле."""
 def __init__(self,db):
  self.db=db; self.ids={}; self.keys={}
 def id_for(self,attrs):
  key=source_key(attrs)
  if key not in self.ids:
   ident='S%03d'%(len(self.ids)+1); self.ids[key]=ident; self.keys[ident]=key
   self.db.execute('INSERT INTO sources VALUES (?,?)',(ident,source_category(key)+'; version '+key[1]))
  return self.ids[key]
 def as_json(self):
  return {ident:{'category':source_category(key),'version':key[1],'key_hash':source_key_hash(key)}
          for ident,key in sorted(self.keys.items())}

def digest(tag,typ,sid,x):
 # Не учитывает creationDate и метаданные: одинаковые образцы одного источника считаются повтором.
 return hashlib.sha256(json.dumps([tag,typ,sid,x['startDate'],x['endDate'],x.get('value'),x.get('unit'),x.get('duration'),x.get('durationUnit')]).encode()).hexdigest()

def run(archive,out,inventory_report=True):
 out.mkdir(parents=True,exist_ok=True); os.chmod(out,0o700)
 work=out/'aggregate_work.sqlite'
 if work.exists(): work.unlink()
 db=sqlite3.connect(work)
 db.executescript(SCHEMA)
 counters={'duplicates_removed':0,'invalid_or_unsupported':0,'records':0,'workouts':0,'timezone_offset_changes_within_record':0}
 registry=Registry(db); pending=0
 # Счётчики сна отдельны от общих: у них своя область — только записи сна.
 sleep_offsets=0; sleep_sources=set()
 for tag,x in iter_records(archive):
  try:
   a=stamp(x['startDate']); b=stamp(x['endDate'])
   if b.timestamp()<a.timestamp(): raise ValueError('negative interval')
   sid=registry.id_for(x); typ=x.get('type',x.get('workoutActivityType','Workout'))
   counters['records' if tag=='Record' else 'workouts']+=1
   db.execute('INSERT INTO inventory VALUES (?,?,?,1) ON CONFLICT(type,source,year) DO UPDATE SET n=n+1',(typ,sid,str(a.year)))
   spec=next((v for k,v in METRICS.items() if typ=='HKQuantityTypeIdentifier'+k or typ=='HKCategoryTypeIdentifier'+k),None)
   if tag=='Workout': spec=('workout_'+typ[len('HKWorkoutActivityType'):] if typ.startswith('HKWorkoutActivityType') else 'workout_'+typ,'min','workout')
   if spec:
    metric,unit,kind=spec
    val=x.get('value','')
    windowed=kind=='sleep' and val in sleep.WINDOW_VALUES
    if windowed:
     # Область счётчика — записи сна до дедупликации: так же, как считал прежний второй проход.
     sleep_sources.add(sid)
     if b>a and a.utcoffset()!=b.utcoffset(): sleep_offsets+=1
    if db.execute('INSERT OR IGNORE INTO seen VALUES (?)',(digest(tag,typ,sid,x),)).rowcount==0:
     counters['duplicates_removed']+=1
    else:
     if a.utcoffset()!=b.utcoffset(): counters['timezone_offset_changes_within_record']+=1
     if kind=='sleep':
      metric=sleep_metric(val)
      if metric is None: raise ValueError('unknown sleep category')
      value=0
      # Оконные строки требуют строго b>a: иначе pieces отдаёт кусок нулевой длины.
      if windowed and b>a:
       for day,start,end in sleep.window_pieces(a,b):
        db.execute('INSERT INTO windows VALUES (?,?,?,?,?)',('asleep' if val in ASLEEP else 'awake',sid,day,start,end))
     elif kind=='workout':
      value=normalize(x['duration'],x.get('durationUnit','min'),'min')
      db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric+'_count',sid,a.date().isoformat(),a.timestamp(),a.timestamp(),1,'sum'))
     else: value=normalize(x['value'],x.get('unit',''),unit)
     if kind=='mean': db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric,sid,a.date().isoformat(),a.timestamp(),b.timestamp(),value,kind))
     else:
      for day,start,end,fraction in pieces(a,b):
       db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric,sid,day,start,end,value*fraction,kind))
  except (ValueError,KeyError,OverflowError): counters['invalid_or_unsupported']+=1
  pending+=1
  if pending>=10000: db.commit(); pending=0
 db.commit()
 aggregate.build_daily(db)
 monthly,yearly,gaps=aggregate.summarize(db)
 aggregate.write_tables(db,out,monthly,yearly,gaps)
 aggregate.write_text(out/'quality.json',json.dumps(counters,indent=2))
 aggregate.write_text(out/'sources.json',json.dumps(registry.as_json(),ensure_ascii=False,indent=2))
 labels={ident:source_category(key)+'; version '+key[1] for ident,key in registry.keys.items()}
 hashes={ident:source_key_hash(key) for ident,key in registry.keys.items()}
 windows=sleep.summarize(db,labels,hashes,sleep_offsets,sleep_sources)
 aggregate.write_text(out/'monthly_sleep_windows.json',json.dumps(windows,ensure_ascii=False,indent=2))
 if inventory_report:
  aggregate.write_text(out/'report.html',inventory.report_html(counters,db.execute('SELECT id,description FROM sources ORDER BY id').fetchall(),yearly,gaps,monthly))
 db.close()
 # Временное хранилище с отдельными образцами удаляется после успешного сведения.
 work.unlink()
 return counters
