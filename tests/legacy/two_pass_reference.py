"""Эталон: два прохода по архиву, как было до объединения. Самодостаточен намеренно.

Копия `processor/health_local.run` и `processor/sleep_windows.main` из приватного
репозитория (коммит 4beceb8), параметризованная по архиву и каталогу. Свои копии
примитивов — чтобы изменение `health_dashboard/parse.py` не сдвинуло эталон незаметно.
Держать один релиз; редактировать только вместе с осознанным решением.
"""
import re
import calendar, csv, datetime as dt, hashlib, itertools, json, os, sqlite3, statistics as st, zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

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
ASLEEP={'HKCategoryValueSleepAnalysisAsleep','HKCategoryValueSleepAnalysisAsleepUnspecified','HKCategoryValueSleepAnalysisAsleepCore','HKCategoryValueSleepAnalysisAsleepDeep','HKCategoryValueSleepAnalysisAsleepREM','1','3','4','5'}

def normalized_device(text):
 return re.sub(r'^(\s*<+HKDevice:\s*)0x[0-9a-fA-F]+(?=\s*[,;>])',
               r'\1[representation-address]', text)

def source_key(x):
 return (x.get('sourceName',''),x.get('sourceVersion',''),normalized_device(x.get('device','')))

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
 if not __import__('math').isfinite(v) or v < 0: raise ValueError('invalid value')
 if unit==target: return v
 factors={('m','km'): .001, ('mi','km'):1.609344, ('kJ','kcal'):1/4.184, ('s','min'):1/60, ('s','ms'):1000, ('mL/kg/min','mL/min·kg'):1}
 return v*factors[(unit,target)]

def writecsv(path,headers,rows):
 with path.open('w',newline='',encoding='utf-8-sig') as f:
  w=csv.writer(f); w.writerow(headers); w.writerows(rows)

def run(archive,out):
 """Первый проход: календарные дни. Дословно прежний health_local.run."""
 out.mkdir(parents=True,exist_ok=False); os.chmod(out,0o700)
 db=sqlite3.connect(out/'aggregate_work.sqlite')
 db.executescript('''CREATE TABLE chunks(metric TEXT,source TEXT,day TEXT,a REAL,b REAL,value REAL,kind TEXT);
 CREATE TABLE seen(hash TEXT PRIMARY KEY); CREATE TABLE inventory(type TEXT,source TEXT,year TEXT,n INTEGER,PRIMARY KEY(type,source,year));
 CREATE TABLE sources(id TEXT PRIMARY KEY,description TEXT);''')
 counters={'duplicates_removed':0,'invalid_or_unsupported':0,'records':0,'workouts':0,'timezone_offset_changes_within_record':0}
 sources={}; pending=0
 def source(x):
  key=source_key(x)
  if key not in sources:
   ident='S%03d'%(len(sources)+1); sources[key]=ident
   name=key[0].lower(); category='Apple Watch' if 'watch' in name or 'watch' in key[2].lower() else 'iPhone' if 'iphone' in name or 'iphone' in key[2].lower() else 'Other/unknown'
   db.execute('INSERT INTO sources VALUES (?,?)',(ident,category+'; version '+key[1]))
  return sources[key]
 with zipfile.ZipFile(archive) as z:
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
  with z.open(matches[0]) as stream:
   context=ET.iterparse(stream,events=('start','end')); _,root=next(context)
   for event,elem in context:
    if event!='end': continue
    tag=elem.tag
    if tag not in ('Record','Workout'):
     if tag in ('Me','ClinicalRecord','WorkoutRoute','ActivitySummary'): elem.clear()
     continue
    x=elem.attrib
    try:
     a=stamp(x['startDate']); b=stamp(x['endDate'])
     if b.timestamp()<a.timestamp(): raise ValueError('negative interval')
     sid=source(x); typ=x.get('type',x.get('workoutActivityType','Workout'))
     counters['records' if tag=='Record' else 'workouts']+=1
     db.execute('INSERT INTO inventory VALUES (?,?,?,1) ON CONFLICT(type,source,year) DO UPDATE SET n=n+1',(typ,sid,str(a.year)))
     spec=next((v for k,v in METRICS.items() if typ=='HKQuantityTypeIdentifier'+k or typ=='HKCategoryTypeIdentifier'+k),None)
     if tag=='Workout': spec=('workout_'+typ[len('HKWorkoutActivityType'):] if typ.startswith('HKWorkoutActivityType') else 'workout_'+typ, 'min','workout')
     if spec:
      metric,unit,kind=spec
      digest=hashlib.sha256(json.dumps([tag,typ,sid,x['startDate'],x['endDate'],x.get('value'),x.get('unit'),x.get('duration'),x.get('durationUnit')]).encode()).hexdigest()
      if db.execute('INSERT OR IGNORE INTO seen VALUES (?)',(digest,)).rowcount==0:
       counters['duplicates_removed']+=1
      else:
       if a.utcoffset()!=b.utcoffset(): counters['timezone_offset_changes_within_record']+=1
       if kind=='sleep':
        val=x.get('value','')
        asleep=val in ASLEEP
        metric='sleep_hours' if asleep else 'sleep_inbed_hours' if val in ('HKCategoryValueSleepAnalysisInBed','0') else 'sleep_awake_hours' if val in ('HKCategoryValueSleepAnalysisAwake','2') else None
        if metric is None: raise ValueError('unknown sleep category')
        value=0
       elif kind=='workout':
        value=normalize(x['duration'],x.get('durationUnit','min'),'min')
        db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric+'_count',sid,a.date().isoformat(),a.timestamp(),a.timestamp(),1,'sum'))
       else: value=normalize(x['value'],x.get('unit',''),unit)
       if kind=='mean': db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric,sid,a.date().isoformat(),a.timestamp(),b.timestamp(),value,kind))
       else:
        for day,start,end,fraction in pieces(a,b):
         db.execute('INSERT INTO chunks VALUES (?,?,?,?,?,?,?)',(metric,sid,day,start,end,value*fraction,kind))
    except (ValueError,KeyError,OverflowError): counters['invalid_or_unsupported']+=1
    elem.clear(); root.clear(); pending+=1
    if pending>=10000: db.commit(); pending=0
 db.commit()
 db.execute('CREATE INDEX chunk_order ON chunks(metric,source,day)')
 db.execute('CREATE TABLE daily(metric TEXT,source TEXT,day TEXT,value REAL,n INTEGER,overlap INTEGER)')
 cursor=db.execute('SELECT metric,source,day,a,b,value,kind FROM chunks ORDER BY metric,source,day,a,b')
 for key,group in itertools.groupby(cursor,lambda r:r[:3]):
  rows=list(group); kind=rows[0][6]; seconds,overlap=union([(r[3],r[4]) for r in rows])
  value=seconds/3600 if kind=='sleep' else sum(r[5] for r in rows)/(len(rows) if kind=='mean' else 1)
  db.execute('INSERT INTO daily VALUES (?,?,?,?,?,?)',(key[0],key[1],key[2],value,len(rows),int(overlap)))
 db.commit()
 writecsv(out/'sources.csv',['source','category_and_version'],db.execute('SELECT * FROM sources'))
 writecsv(out/'availability_years.csv',['export_type','source','year','raw_records'],db.execute('SELECT * FROM inventory ORDER BY type,source,year'))
 writecsv(out/'daily.csv',['metric','source','date','value','samples_or_fragments','overlap_flag'],db.execute('SELECT * FROM daily ORDER BY metric,source,day'))
 monthly=[]; gaps=[]; yearly=[]
 for metric, in db.execute('SELECT DISTINCT metric FROM daily').fetchall():
  observed=[r[0] for r in db.execute('SELECT DISTINCT day FROM daily WHERE metric=? ORDER BY day',(metric,))]
  for prev,nxt in zip(observed,observed[1:]):
   delta=(dt.date.fromisoformat(nxt)-dt.date.fromisoformat(prev)).days-1
   if delta>0: gaps.append((metric,'ALL_SOURCES_COVERAGE_ONLY',prev,nxt,delta))
  for year,group in itertools.groupby(observed,lambda d:d[:4]):
   group=list(group); yearly.append((metric,'ALL_SOURCES_COVERAGE_ONLY',year,len(group),group[0],group[-1]))
 for metric,sid in db.execute('SELECT DISTINCT metric,source FROM daily ORDER BY metric,source').fetchall():
  days=db.execute('SELECT day,value,n,overlap FROM daily WHERE metric=? AND source=? ORDER BY day',(metric,sid)).fetchall()
  for prev,nxt in zip(days,days[1:]):
   delta=(dt.date.fromisoformat(nxt[0])-dt.date.fromisoformat(prev[0])).days-1
   if delta>0: gaps.append((metric,sid,prev[0],nxt[0],delta))
  for year,group in itertools.groupby(days,lambda r:r[0][:4]):
   group=list(group); yearly.append((metric,sid,year,len(group),group[0][0],group[-1][0]))
  for month,group in itertools.groupby(days,lambda r:r[0][:7]):
   group=list(group); count=len(group); calendar_days=calendar.monthrange(int(month[:4]),int(month[5:]))[1]
   means=metric in ('resting_hr','heart_rate','hrv_ms','vo2max') or metric.startswith('sleep_')
   value=sum(r[1] for r in group)/(count if means else 1)
   monthly.append((metric,sid,month,round(value,4),'mean_of_observed_days' if means else 'sum',count,calendar_days,round(count/calendar_days,4),sum(r[2] for r in group),sum(r[3] for r in group)))
 writecsv(out/'monthly.csv',['metric','source','month','value','aggregation','observed_days','calendar_days','observed_day_fraction','samples_or_fragments','overlap_days'],monthly)
 writecsv(out/'coverage_years.csv',['metric','source','year','observed_days','first_date','last_date'],yearly)
 writecsv(out/'gaps.csv',['metric','source','last_observation','next_observation','missing_days_between'],gaps)
 (out/'quality.json').write_text(json.dumps(counters,indent=2),encoding='utf-8')
 db.close()
 (out/'aggregate_work.sqlite').unlink()
 return counters

def sleep_main(archive,out):
 """Второй проход: окна полдень–полдень. Дословно прежний sleep_windows.main."""
 out.mkdir(parents=True,exist_ok=False); os.chmod(out,0o700)
 sources={};labels={};windows=defaultdict(list);awake=defaultdict(list);offset_changes=0
 with zipfile.ZipFile(archive) as z:
  matches=[]
  for i in z.infolist():
   if i.filename.lower().endswith('.xml'):
    try:
     with z.open(i) as f:
      _,root=next(ET.iterparse(f,events=('start',)))
      if root.tag=='HealthData':matches.append(i)
    except (ET.ParseError,StopIteration):pass
  if len(matches)!=1:raise RuntimeError('selection')
  with z.open(matches[0]) as f:
   it=ET.iterparse(f,events=('start','end'));_,root=next(it)
   for ev,e in it:
    if ev!='end':continue
    if e.tag=='Record' and e.get('type')=='HKCategoryTypeIdentifierSleepAnalysis':
     x=e.attrib;val=x.get('value')
     if val in ASLEEP or val in ('HKCategoryValueSleepAnalysisAwake','2'):
      key=source_key(x)
      if key not in sources:
       sid='N%03d'%(len(sources)+1);sources[key]=sid
       labels[sid]=('Apple Watch' if 'watch' in (key[0]+key[2]).lower() else 'Other/unknown')+'; version '+key[1]
      sid=sources[key];a=stamp(x['startDate']);b=stamp(x['endDate'])
      if b>a:
       if a.utcoffset()!=b.utcoffset():offset_changes+=1
       for day,start,end,_ in pieces(a-dt.timedelta(hours=12),b-dt.timedelta(hours=12)):
        day=(dt.date.fromisoformat(day)+dt.timedelta(days=1)).isoformat()
        dest=windows if val in ASLEEP else awake
        dest[(sid,day)].append((start+43200,end+43200))
    if e.tag in ('Record','Workout','ClinicalRecord','ActivitySummary'):
     e.clear();root.clear()
 groups=defaultdict(list)
 for (sid,day),intervals in windows.items():
  seconds,overlap=union(intervals)
  aw=awake.get((sid,day),[]);conflict=seconds+union(aw)[0]-union(intervals+aw)[0]
  duration=seconds/3600
  groups[day[:7]].append({'sid':sid,'day':day,'hours':duration,'conflict':conflict>0,'overlap':overlap})
 monthly=[]
 for month,rows in sorted(groups.items()):
  counts=Counter(r['sid'] for r in rows)
  rank=sorted(counts,key=lambda sid:(not labels[sid].startswith('Apple Watch'),-counts[sid],sid));order={s:i for i,s in enumerate(rank)}
  days=defaultdict(list)
  for r in rows:days[r['day']].append(r)
  chosen=[min(rr,key=lambda r:order[r['sid']]) for rr in days.values()]
  values=[r['hours'] for r in chosen]
  monthly.append({'month':month,'mean_hours':round(st.mean(values),4),'median_hours':round(st.median(values),4),'observed_windows':len(values),'multi_source_windows':sum(len(rr)>1 for rr in days.values()),'conflicting_awake_windows':sum(r['conflict'] for r in chosen),'shorter_than_3h_windows':sum(v<3 for v in values),'selected_sources':dict(Counter(r['sid'] for r in chosen))})
 data={'definition':'Sleep union within noon-to-noon local-offset windows; labelled by ending date. Includes naps. Not necessarily a complete night. No sleep-need threshold or diagnosis. One source per window; same provisional ranking as main report.','sources':labels,'offset_change_intervals':offset_changes,'monthly':monthly}
 (out/'monthly_sleep_windows.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
 # Ключ источника -> Nxxx отдаётся тесту: только так строится отображение Nxxx->Sxxx.
 return data,sources
