"""Синтетические данные для показа интерфейса. Личные данные здесь не читаются и не появляются.

Набор детерминирован: перегенерация даёт байт в байт тот же файл. Числа выдуманы
и ничьей историей не являются.
"""
import calendar, json, math

SOURCES={'S001':'Apple Watch; version demo-A','S002':'Apple Watch; version demo-B','S003':'iPhone; version demo-C'}
METRICS={'steps':(7300,'sum'),'exercise_min':(34,'sum'),'walk_run_km':(5.8,'sum'),'cycling_km':(7,'sum'),
         'swimming_km':(.6,'sum'),'resting_hr':(64,'mean_observed_days'),'vo2max':(42,'mean_observed_days'),
         'sleep_hours':(6.9,'mean_observed_days')}
NOTE='Искусственные данные для показа интерфейса. Ничьей историей не являются.'

def generate():
 """Три файла: основной пакет, окна сна и крайние случаи для проверок интерфейса."""
 rows=[]; sleep=[]
 for year in range(2016,2027):
  for month in range(1,13):
   if year==2026 and month>8: continue
   if year==2017 and month in (3,4): continue
   ym='%d-%02d'%(year,month); cal=calendar.monthrange(year,month)[1]; avail=12 if ym=='2026-08' else cal
   sid='S001' if year<2022 else 'S002'
   for metric,(base,agg) in METRICS.items():
    if metric=='sleep_hours' and year<2020: continue
    if metric=='swimming_km' and month not in (6,7,8): continue
    n=min(avail,3+month%5) if metric=='vo2max' else min(avail,4+month%7) if metric in ('cycling_km','swimming_km') else max(1,avail-(9 if month==11 else 1))
    mean=round(base*(1+.12*math.sin(month/12*math.tau)+.015*(year-2020)),4)
    value=round(mean*n,4) if agg=='sum' else mean
    if metric=='exercise_min' and ym=='2020-02': value=0; mean=0
    if metric=='vo2max' and ym=='2021-05': value=None
    overlap=1 if month%4==0 else 0
    rows.append(dict(metric=metric,month=ym,value=value,aggregation=agg,observed_days=n,calendar_days=cal,
                     mean_observed_day=mean if value is not None else None,median_observed_day=mean if value is not None else None,
                     overlap_days=overlap,multi_source_days=2 if n>=2 else 0,selected_sources={sid:n},
                     selected_categories={'Apple Watch':n},multi_watch_source_days=0,clean_observed_days=n-overlap,
                     clean_mean_observed_day=mean if value is not None else None))
   for i,kind in enumerate(('Walking','Running','Cycling','Swimming')):
    if kind=='Swimming' and month not in (6,7,8): continue
    n=min(avail,4+(month+i)%8); count=n+2
    for suffix,total in (('',count*(20+i*10)),('_count',count)):
     rows.append(dict(metric='workout_'+kind+suffix,month=ym,value=total,aggregation='sum',observed_days=n,
                      calendar_days=cal,mean_observed_day=total/n,median_observed_day=total/n,overlap_days=0,
                      multi_source_days=0,selected_sources={sid:n}))
   if year>=2020:
    n=min(avail,18+month%10); h=round(7+.3*math.sin(month),4)
    sleep.append(dict(month=ym,mean_hours=h,median_hours=h+.1,observed_windows=n,multi_source_windows=0,
                      conflicting_awake_windows=1 if month==4 else 0,shorter_than_3h_windows=month%3,
                      selected_sources={sid:n}))
 coverage=[]
 for metric in METRICS:
  for year in range(2016,2027):
   rr=[r for r in rows if r['metric']==metric and r['month'].startswith(str(year)) and r['value'] is not None]
   if rr:
    last=rr[-1]['month']; end=12 if last=='2026-08' else calendar.monthrange(int(last[:4]),int(last[5:]))[1]
    coverage.append(dict(metric=metric,source='ALL_SOURCES_COVERAGE_ONLY',year=str(year),
                         observed_days=str(sum(r['observed_days'] for r in rr)),first_date=rr[0]['month']+'-01',
                         last_date=last+'-%02d'%end))
 main=dict(_synthetic=True,_description=NOTE,
           method='Демонстрация: один источник на день; месячные сводки; никаких диагнозов.',
           sources=SOURCES,
           quality={'duplicates_removed':5,'invalid_or_unsupported':2,'records':10000,
                    'workouts':sum(r['value'] for r in rows if r['metric'].endswith('_count')),
                    'timezone_offset_changes_within_record':0},
           coverage=coverage,
           gaps=[dict(metric='steps',source='ALL_SOURCES_COVERAGE_ONLY',last_observation='2017-02-28',
                      next_observation='2017-05-01',missing_days_between='61')],
           monthly=rows)
 windows=dict(_synthetic=True,_description=NOTE,
              definition='Демонстрация: окна от полудня до полудня, дневной сон входит; не обязательно полные ночи.',
              sources={'S001':SOURCES['S001'],'S002':SOURCES['S002']},offset_change_intervals=0,monthly=sleep)
 edges={'_synthetic':True,'_description':NOTE,
        'weighted_mean':{'values':[60,90],'days':[10,20],'expected':80},
        'sum_mean':{'totals':[100,200],'days':[10,20],'expected_sum':300,'expected_mean':10},
        'zero_baseline':{'earlier':0,'later':10,'expected_relative_change':None},
        'unsafe_text':{'source':'<script>alert("demo")</script>'}}
 return {'approved_monthly.json':main,'monthly_sleep_windows.json':windows,'edge_cases.json':edges}

def write(out):
 out.mkdir(parents=True,exist_ok=True)
 for name,obj in generate().items():
  (out/name).write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
 return out
