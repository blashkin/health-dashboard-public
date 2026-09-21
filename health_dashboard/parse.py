"""Примитивы чтения выгрузки Apple Health. Личные значения никогда не печатаются."""
import datetime as dt, hashlib, json, math, re, zipfile
import xml.etree.ElementTree as ET

# Тип записи Apple Health -> (наш показатель, целевая единица, способ сведения за день).
METRICS = {
 'StepCount': ('steps','count','sum'),
 'DistanceWalkingRunning': ('walk_run_km','km','sum'),
 'DistanceCycling': ('cycling_km','km','sum'),
 'DistanceSwimming': ('swimming_km','km','sum'),
 'AppleExerciseTime': ('exercise_min','min','sum'),
 'ActiveEnergyBurned': ('active_kcal','kcal','sum'),
 'RestingHeartRate': ('resting_hr','count/min','mean'),
 'HeartRate': ('heart_rate','count/min','mean'),
 'HeartRateVariabilitySDNN': ('hrv_ms','ms','mean'),
 'VO2Max': ('vo2max','mL/min·kg','mean'),
 'SleepAnalysis': ('sleep_hours','h','sleep'),
}

# Значения категории сна. Состав зависит от поколения алгоритма часов.
ASLEEP=frozenset({'HKCategoryValueSleepAnalysisAsleep','HKCategoryValueSleepAnalysisAsleepUnspecified','HKCategoryValueSleepAnalysisAsleepCore','HKCategoryValueSleepAnalysisAsleepDeep','HKCategoryValueSleepAnalysisAsleepREM','1','3','4','5'})
INBED=frozenset({'HKCategoryValueSleepAnalysisInBed','0'})
AWAKE=frozenset({'HKCategoryValueSleepAnalysisAwake','2'})

def normalized_device(text):
 # Убирается только служебный адрес объекта, но не поля идентичности устройства.
 return re.sub(r'^(\s*<+HKDevice:\s*)0x[0-9a-fA-F]+(?=\s*[,;>])',
               r'\1[representation-address]', text)

def source_key(x):
 return (x.get('sourceName',''),x.get('sourceVersion',''),normalized_device(x.get('device','')))

def source_category(key):
 name=key[0].lower(); device=key[2].lower()
 return 'Apple Watch' if 'watch' in name or 'watch' in device else 'iPhone' if 'iphone' in name or 'iphone' in device else 'Other/unknown'

def source_key_hash(key):
 # Устойчивая метка источника для сравнения двух выгрузок между собой (этап 2).
 # Это не анонимизация: пространство названий приложений мало и перебираемо.
 return hashlib.sha256(json.dumps(list(key),ensure_ascii=False).encode('utf-8')).hexdigest()[:16]

def stamp(s):
 return dt.datetime.strptime(s,'%Y-%m-%d %H:%M:%S %z')

def pieces(a,b):
 if b <= a:
  yield a.date().isoformat(),a.timestamp(),a.timestamp(),1.0
  return
 total=b.timestamp()-a.timestamp()
 while a < b:
  edge=min(b, dt.datetime.combine(a.date()+dt.timedelta(days=1),dt.time(),a.tzinfo))
  yield a.date().isoformat(),a.timestamp(),edge.timestamp(),(edge.timestamp()-a.timestamp())/total
  a=edge

def union(intervals):
 end=None; seconds=0; overlap=False
 for a,b in sorted(intervals):
  if end is not None and a < end: overlap=True
  seconds += max(0,b-max(a,end if end is not None else a))
  end=max(b,end if end is not None else b)
 return seconds,overlap

def normalize(value,unit,target):
 v=float(value)
 if not math.isfinite(v) or v < 0: raise ValueError('invalid value')
 if unit==target: return v
 factors={('m','km'): .001, ('mi','km'):1.609344, ('kJ','kcal'):1/4.184, ('s','min'):1/60, ('s','ms'):1000, ('mL/kg/min','mL/min·kg'):1}
 return v*factors[(unit,target)]

def sleep_metric(value):
 """Показатель для значения категории сна; None, если значение незнакомо."""
 return 'sleep_hours' if value in ASLEEP else 'sleep_inbed_hours' if value in INBED else 'sleep_awake_hours' if value in AWAKE else None

def find_health_xml(z):
 """Единственный XML выгрузки внутри архива. Имя файла локализовано, ищем по корневому тегу."""
 matches=[i for i in z.infolist() if i.filename.endswith('/export.xml') or i.filename=='export.xml']
 if not matches:
  for info in z.infolist():
   if info.filename.lower().endswith('.xml'):
    try:
     with z.open(info) as probe:
      _,element=next(ET.iterparse(probe,events=('start',)))
      if element.tag=='HealthData': matches.append(info)
    except (ET.ParseError,StopIteration): pass
 if len(matches)!=1: raise ValueError('Expected exactly one HealthData XML')
 return matches[0]

def iter_records(archive):
 """Поток (tag, attrib) для Record и Workout. Дерево не накапливается в памяти."""
 with zipfile.ZipFile(archive) as z:
  with z.open(find_health_xml(z)) as stream:
   context=ET.iterparse(stream,events=('start','end')); _,root=next(context)
   for event,elem in context:
    if event!='end': continue
    tag=elem.tag
    if tag not in ('Record','Workout'):
     if tag in ('Me','ClinicalRecord','WorkoutRoute','ActivitySummary'): elem.clear()
     continue
    yield tag,elem.attrib
    elem.clear(); root.clear()
