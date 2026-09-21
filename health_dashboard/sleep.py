"""Окна сна полдень–полдень: второе определение сна, рядом с календарным, а не вместо него.

Единица наблюдения здесь — окно (`observed_windows`), а в календарном определении — день
(`observed_days`). Числа двух определений нельзя складывать и нельзя сравнивать напрямую.
"""
import datetime as dt, statistics as st
from collections import Counter, defaultdict
from .parse import ASLEEP, AWAKE, pieces, union

DEFINITION=('Объединение интервалов сна внутри окна от полудня до полудня по местному смещению; '
            'окно помечено датой своего конца. Дневной сон входит. Окно не обязано быть полной ночью. '
            'Порога «нормы сна» и диагноза здесь нет. Один источник на окно, тот же предварительный '
            'ранг источников, что и в основном отчёте.')

WINDOW_VALUES=ASLEEP|AWAKE

def window_pieces(a,b):
 """Части окна для интервала [a,b). Сутки сдвинуты на 12 часов, метка — дата конца окна."""
 for day,start,end,_ in pieces(a-dt.timedelta(hours=12),b-dt.timedelta(hours=12)):
  yield (dt.date.fromisoformat(day)+dt.timedelta(days=1)).isoformat(),start+43200,end+43200

def summarize(db,labels,order_key,offset_changes,seen):
 """Месячные сводки по окнам. `order_key` — отпечаток ключа источника для разрешения
 равенств, `seen` — источники, у которых вообще были записи сна."""
 asleep=defaultdict(list); awake=defaultdict(list)
 for kind,sid,day,a,b in db.execute('SELECT kind,source,day,a,b FROM windows ORDER BY kind,source,day,a,b'):
  (asleep if kind=='asleep' else awake)[(sid,day)].append((a,b))
 groups=defaultdict(list)
 for (sid,day),intervals in sorted(asleep.items()):
  seconds,overlap=union(intervals)
  # Мера пересечения = union(A)+union(B)-union(A+B).
  aw=awake.get((sid,day),[]); conflict=seconds+union(aw)[0]-union(intervals+aw)[0]
  groups[day[:7]].append({'sid':sid,'day':day,'hours':seconds/3600,'conflict':conflict>0,'overlap':overlap})
 monthly=[]
 for month,rows in sorted(groups.items()):
  counts=Counter(r['sid'] for r in rows)
  # Равенство разрешается ключом источника, а не его номером: номер зависит от порядка записей.
  rank=sorted(counts,key=lambda sid:(not labels[sid].startswith('Apple Watch'),-counts[sid],order_key[sid]))
  order={s:i for i,s in enumerate(rank)}
  days=defaultdict(list)
  for r in rows: days[r['day']].append(r)
  chosen=[min(rr,key=lambda r:order[r['sid']]) for rr in sorted(days.values(),key=lambda rr:rr[0]['day'])]
  values=[r['hours'] for r in chosen]
  monthly.append({'month':month,'mean_hours':round(st.mean(values),4),'median_hours':round(st.median(values),4),
                  'observed_windows':len(values),'multi_source_windows':sum(len(rr)>1 for rr in days.values()),
                  'conflicting_awake_windows':sum(r['conflict'] for r in chosen),
                  'shorter_than_3h_windows':sum(v<3 for v in values),
                  'selected_sources':dict(sorted(Counter(r['sid'] for r in chosen).items()))})
 return {'definition':DEFINITION,'sources':{sid:labels[sid] for sid in sorted(seen)},
         'offset_change_intervals':offset_changes,'monthly':monthly}
