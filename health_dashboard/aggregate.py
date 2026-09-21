"""Сведение частей записей в дни, месяцы и годы. Писатели файлов отделены от прохода по архиву."""
import calendar, csv, datetime as dt, itertools, os, tempfile

MEAN_METRICS=('resting_hr','heart_rate','hrv_ms','vo2max')

def replace_file(path,write):
 """Запись через временное имя и os.replace: повторный запуск не оставляет полуфайла.

 Права 0600 ставятся до перестановки, чтобы файл ни мгновения не лежал открытым."""
 fd,tmp=tempfile.mkstemp(dir=str(path.parent),prefix='.'+path.name+'.',suffix='.tmp')
 os.close(fd)
 tmp=path.parent/os.path.basename(tmp)
 try:
  write(tmp); os.chmod(tmp,0o600); os.replace(str(tmp),str(path))
 except BaseException:
  if tmp.exists(): tmp.unlink()
  raise

def write_text(path,text):
 replace_file(path,lambda p:p.write_text(text,encoding='utf-8'))

def writecsv(path,headers,rows):
 rows=list(rows)
 def write(p):
  with p.open('w',newline='',encoding='utf-8-sig') as f:
   w=csv.writer(f); w.writerow(headers); w.writerows(rows)
 replace_file(path,write)

def build_daily(db):
 """chunks -> daily. Границей памяти служит один источник за один день, а не вся выгрузка."""
 db.execute('CREATE INDEX IF NOT EXISTS chunk_order ON chunks(metric,source,day)')
 db.execute('CREATE TABLE IF NOT EXISTS daily(metric TEXT,source TEXT,day TEXT,value REAL,n INTEGER,overlap INTEGER)')
 from .parse import union
 cursor=db.execute('SELECT metric,source,day,a,b,value,kind FROM chunks ORDER BY metric,source,day,a,b')
 for key,group in itertools.groupby(cursor,lambda r:r[:3]):
  rows=list(group); kind=rows[0][6]; seconds,overlap=union([(r[3],r[4]) for r in rows])
  value=seconds/3600 if kind=='sleep' else sum(r[5] for r in rows)/(len(rows) if kind=='mean' else 1)
  db.execute('INSERT INTO daily VALUES (?,?,?,?,?,?)',(key[0],key[1],key[2],value,len(rows),int(overlap)))
 db.commit()

def summarize(db):
 """Месячные сводки, годовое покрытие и пробелы. Значения разных источников не смешиваются."""
 monthly=[]; gaps=[]; yearly=[]
 # Объединение дат наблюдения показывает пробелы, не складывая значения источников.
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
   means=metric in MEAN_METRICS or metric.startswith('sleep_')
   value=sum(r[1] for r in group)/(count if means else 1)
   monthly.append((metric,sid,month,round(value,4),'mean_of_observed_days' if means else 'sum',count,calendar_days,round(count/calendar_days,4),sum(r[2] for r in group),sum(r[3] for r in group)))
 return monthly,yearly,gaps

def write_tables(db,out,monthly,yearly,gaps):
 writecsv(out/'sources.csv',['source','category_and_version'],db.execute('SELECT id,description FROM sources ORDER BY id'))
 writecsv(out/'availability_years.csv',['export_type','source','year','raw_records'],db.execute('SELECT * FROM inventory ORDER BY type,source,year'))
 writecsv(out/'daily.csv',['metric','source','date','value','samples_or_fragments','overlap_flag'],db.execute('SELECT * FROM daily ORDER BY metric,source,day'))
 writecsv(out/'monthly.csv',['metric','source','month','value','aggregation','observed_days','calendar_days','observed_day_fraction','samples_or_fragments','overlap_days'],monthly)
 writecsv(out/'coverage_years.csv',['metric','source','year','observed_days','first_date','last_date'],yearly)
 writecsv(out/'gaps.csv',['metric','source','last_observation','next_observation','missing_days_between'],gaps)
