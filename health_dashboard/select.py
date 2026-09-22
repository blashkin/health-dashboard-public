"""Один источник на дату. Это не воспроизводит приоритеты приложения «Здоровье»."""
import calendar, csv, json, statistics as st
from collections import Counter, defaultdict

STAGES={'sleep_core_hours','sleep_deep_hours','sleep_rem_hours','sleep_unspecified_hours'}
CORE={'steps','exercise_min','walk_run_km','cycling_km','swimming_km','resting_hr','vo2max','sleep_hours'}|STAGES
MEANS={'resting_hr','vo2max','sleep_hours'}|STAGES
METHOD=('Предварительный выбор источника по дням: сначала категория Apple Watch, затем больше дней '
        'наблюдений внутри показателя и месяца, затем отпечаток ключа источника. Один источник на день, источники '
        'никогда не складываются. Даты берутся у источника рангом ниже только там, где старший источник '
        'молчит. Это не воспроизводит приоритеты приложения «Здоровье»; спорные дни помечены. '
        'Сон здесь — длительность по календарным дням.')

def relevant(m):
 return m in CORE or m.startswith('workout_')

def read(p):
 with p.open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))

def choose_month(rows,sources,order_key=None):
 """Ранг источника: категория Apple Watch, затем число дней в этом месяце, затем ключ источника.

 Для дней с несколькими источниками берётся только старший доступный источник.
 `order_key` — отпечаток ключа источника: равенство разрешается им, а не номером Sxxx,
 потому что номер зависит от порядка записей в архиве и сдвинулся бы между выгрузками."""
 if order_key is None: order_key={}
 counts=Counter(r['source'] for r in rows)
 ranks=sorted(counts,key=lambda s:(not sources[s].startswith('Apple Watch;'),-counts[s],order_key.get(s,s)))
 rank={s:i for i,s in enumerate(ranks)}
 byday=defaultdict(list)
 for r in rows: byday[r['day']].append(r)
 selected=[]; multidays=0
 for day,candidates in sorted(byday.items()):
  if len(candidates)>1: multidays+=1
  selected.append(min(candidates,key=lambda r:rank[r['source']]))
 return selected,multidays

def build_package(data):
 """Месячный пакет для интерфейса. Отдельных записей в нём нет."""
 sources={r['source']:r['category_and_version'] for r in read(data/'sources.csv')}
 order_key={sid:info['key_hash'] for sid,info in json.loads((data/'sources.json').read_text(encoding='utf-8')).items()}
 grouped=defaultdict(list)
 for r in read(data/'daily.csv'):
  if relevant(r['metric']):
   grouped[(r['metric'],r['date'][:7])].append({'source':r['source'],'day':r['date'],'value':float(r['value']),'overlap':int(r['overlap_flag']),'samples':int(r['samples_or_fragments'])})
 monthly=[]
 for (metric,month),rows in sorted(grouped.items()):
  chosen,multi=choose_month(rows,sources,order_key)
  values=[r['value'] for r in chosen]; n=len(values)
  days=calendar.monthrange(int(month[:4]),int(month[5:]))[1]
  total=sum(values)
  clean=[r['value'] for r in chosen if not r['overlap']]
  bydate=defaultdict(list)
  for r in rows: bydate[r['day']].append(r)
  watch_multi=sum(sum(sources[r['source']].startswith('Apple Watch;') for r in rr)>1 for rr in bydate.values())
  monthly.append({'clean_observed_days':len(clean),'clean_mean_observed_day':round(sum(clean)/len(clean),4) if clean else None,'multi_watch_source_days':watch_multi,'selected_categories':dict(Counter(sources[r['source']].split(';')[0] for r in chosen)),'metric':metric,'month':month,'value':round(total/n if metric in MEANS else total,4),'aggregation':'mean_observed_days' if metric in MEANS else 'sum','observed_days':n,'calendar_days':days,'mean_observed_day':round(total/n,4),'median_observed_day':round(st.median(values),4),'overlap_days':sum(r['overlap'] for r in chosen),'multi_source_days':multi,'selected_sources':dict(Counter(r['source'] for r in chosen))}) 
 return {'method':METHOD,'sources':sources,'quality':json.loads((data/'quality.json').read_text(encoding='utf-8')),
         'coverage':[r for r in read(data/'coverage_years.csv') if relevant(r['metric']) and r['source']=='ALL_SOURCES_COVERAGE_ONLY'],
         'gaps':[r for r in read(data/'gaps.csv') if relevant(r['metric']) and r['source']=='ALL_SOURCES_COVERAGE_ONLY' and int(r['missing_days_between'])>=14],
         'monthly':monthly}
