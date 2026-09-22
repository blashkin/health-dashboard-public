"""Синтетическая выгрузка Apple Health: zip с export.xml, как отдаёт телефон.

Это единственный демонстрационный путь: страница открывает его так же, как настоящий
архив. Личных данных здесь нет, числа выдуманы и ничьей историей не являются.
Набор детерминирован: перегенерация даёт байт в байт тот же архив.
"""
import calendar, datetime as dt, math, zipfile
from xml.sax.saxutils import quoteattr

FIRST=dt.date(2016,1,1); LAST=dt.date(2026,8,12)
TZ='+0300'
WATCH_A={'sourceName':'Apple Watch','sourceVersion':'demo-A','device':'<<HKDevice: 0x1>, name:Apple Watch, model:Watch, hardware:Watch3,1>'}
WATCH_B={'sourceName':'Apple Watch','sourceVersion':'demo-B','device':'<<HKDevice: 0x2>, name:Apple Watch, model:Watch, hardware:Watch6,1>'}
PHONE={'sourceName':'iPhone','sourceVersion':'demo-C','device':'<<HKDevice: 0x3>, name:iPhone, model:iPhone, hardware:iPhone12,1>'}

class Noise:
 """Свой генератор вместо random: результат не зависит от версии Python."""
 def __init__(self,seed=20260921): self.s=seed&0xffffffff
 def next(self):
  self.s=(self.s*1664525+1013904223)&0xffffffff
  return self.s/0x100000000
 def around(self,base,spread): return base*(1+(self.next()*2-1)*spread)

def season(day): return math.sin(day.timetuple().tm_yday/365*math.tau)
def drift(day): return .015*(day.year-2020)

def stamp(day,h,m=0): return '%s %02d:%02d:00 %s'%(day.isoformat(),h,m,TZ)
def shift(day,h,m,minutes):
 t=dt.datetime.combine(day,dt.time(h,m))+dt.timedelta(minutes=minutes)
 return '%s %s'%(t.strftime('%Y-%m-%d %H:%M:%S'),TZ)

def record(typ,source,start,end,value,unit=None):
 a=['type="HKQuantityTypeIdentifier%s"'%typ if not typ.startswith('HK') else 'type="%s"'%typ]
 a+=['sourceName=%s'%quoteattr(source['sourceName']),'sourceVersion=%s'%quoteattr(source['sourceVersion']),
     'device=%s'%quoteattr(source['device'])]
 if unit: a.append('unit="%s"'%unit)
 a+=['startDate="%s"'%start,'endDate="%s"'%end,'value="%s"'%value]
 return '<Record %s/>'%' '.join(a)

def workout(kind,source,start,end,minutes):
 return ('<Workout workoutActivityType="HKWorkoutActivityType%s" duration="%.3f" durationUnit="min" '
         'sourceName=%s sourceVersion=%s device=%s startDate="%s" endDate="%s"/>'
         %(kind,minutes,quoteattr(source['sourceName']),quoteattr(source['sourceVersion']),quoteattr(source['device']),start,end))

def records():
 """Все записи по дням. Порядок — по дням, как в настоящей выгрузке типы не сгруппированы."""
 rnd=Noise(); out=[]; day=FIRST
 while day<=LAST:
  gap=day.year==2017 and day.month in (3,4)        # часы лежали в ящике
  watch=WATCH_A if day.year<2022 else WATCH_B          # смена часов
  if not gap:
   steps=rnd.around(7300*(1+.12*season(day)+drift(day)),.25)
   for h,share in ((9,.3),(14,.4),(19,.3)):
    out.append(record('StepCount',watch,stamp(day,h),stamp(day,h+1),int(steps*share),'count'))
   if day.year>=2019:                                   # телефон тоже считает шаги: второй источник
    out.append(record('StepCount',PHONE,stamp(day,8),stamp(day,22),int(steps*rnd.around(.8,.1)),'count'))
   out.append(record('DistanceWalkingRunning',watch,stamp(day,9),stamp(day,20),'%.3f'%(steps/1260),'km'))
   if not (day.year==2020 and day.month==2):           # месяц без упражнений
    out.append(record('AppleExerciseTime',watch,stamp(day,18),stamp(day,19),int(rnd.around(34*(1+.12*season(day)+drift(day)),.4)),'min'))
   out.append(record('ActiveEnergyBurned',watch,stamp(day,0),stamp(day,23,59),int(rnd.around(520,.2)),'kcal'))
   out.append(record('RestingHeartRate',watch,stamp(day,6),stamp(day,6),int(rnd.around(64*(1+.03*season(day)+drift(day)),.05)),'count/min'))
   if day.day in (3,11,19,27) and not (day.year==2021 and day.month==5):
    out.append(record('VO2Max',watch,stamp(day,12),stamp(day,12),'%.1f'%rnd.around(42*(1+.02*season(day)+drift(day)),.04),'mL/min·kg'))
   wd=day.weekday()
   if wd in (0,2,4): out.append(workout('Walking',watch,stamp(day,7,30),shift(day,7,30,40),rnd.around(40,.2)))
   if wd in (1,4): out.append(workout('Running',watch,stamp(day,7,0),shift(day,7,0,32),rnd.around(32,.2)))
   if wd==5: out.append(workout('Cycling',watch,stamp(day,10,0),shift(day,10,0,75),rnd.around(75,.2)))
   if wd==6 and day.month in (6,7,8): out.append(workout('Swimming',watch,stamp(day,11,0),shift(day,11,0,45),rnd.around(45,.2)))
   if day.year>=2020 and wd not in (4,5):               # сон с 2020; пятницу и субботу часы снимают
    nxt=day+dt.timedelta(days=1); hours=rnd.around(6.9+.3*math.sin(day.month),.12)
    out.append(record('HKCategoryTypeIdentifierSleepAnalysis',watch,stamp(day,23,30),stamp(nxt,7,10),'HKCategoryValueSleepAnalysisInBed'))
    half=int(hours*30)
    out.append(record('HKCategoryTypeIdentifierSleepAnalysis',watch,stamp(day,23,40),shift(day,23,40,half),'HKCategoryValueSleepAnalysisAsleepCore'))
    out.append(record('HKCategoryTypeIdentifierSleepAnalysis',watch,shift(day,23,40,half+12),shift(day,23,40,2*half+12),'HKCategoryValueSleepAnalysisAsleepDeep'))
    if wd==2: out.append(record('HKCategoryTypeIdentifierSleepAnalysis',watch,shift(day,23,40,half),shift(day,23,40,half+12),'HKCategoryValueSleepAnalysisAwake'))
   if day.day==15: out.append(out[-1])                  # точный повтор: дедупликация должна сработать
  day+=dt.timedelta(days=1)
 return out

def export_xml():
 head=('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE HealthData [\n<!ELEMENT HealthData (ExportDate,Me,(Record|Workout)*)>\n]>\n'
       '<HealthData locale="ru_RU">\n<ExportDate value="%s"/>\n<Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet"/>\n'%stamp(LAST,9))
 return head+'\n'.join(records())+'\n</HealthData>\n'

def write(path):
 """Архив как у телефона: папка apple_health_export с export.xml внутри, сжатие deflate."""
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
  info=zipfile.ZipInfo('apple_health_export/export.xml',date_time=(2026,8,12,9,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED
  z.writestr(info,export_xml())
 return path
