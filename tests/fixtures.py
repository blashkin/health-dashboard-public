"""Синтетические архивы для тестов. Личных данных в тестах нет и быть не должно."""
import zipfile

WATCH='Apple Watch of Tester'
PHONE='Tester iPhone'
OTHER='Sleep Tracker App'

def record(t,v,start,end,unit='',source=WATCH,version='1',device=''):
 prefix='HKCategoryTypeIdentifier' if t=='SleepAnalysis' else 'HKQuantityTypeIdentifier'
 return ('<Record type="%s%s" value="%s" unit="%s" sourceName="%s" sourceVersion="%s" device="%s"'
         ' startDate="%s" endDate="%s" creationDate="2025-01-01 00:00:00 +0300"/>'
         % (prefix,t,v,unit,source,version,device,start,end))

def sleep(value,start,end,source=WATCH,version='1'):
 return record('SleepAnalysis',value,start,end,source=source,version=version)

ASLEEP='HKCategoryValueSleepAnalysisAsleepCore'
DEEP='HKCategoryValueSleepAnalysisAsleepDeep'
AWAKE='HKCategoryValueSleepAnalysisAwake'
INBED='HKCategoryValueSleepAnalysisInBed'

def simple_xml():
 """Малый архив прежних тестов: повтор, неизвестная единица, тренировка, сон через полночь."""
 steps=record('StepCount',100,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','count')
 return ('<HealthData>'+steps+steps
  +record('StepCount',200,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','count',source='Phone B')
  +record('AppleExerciseTime',10,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','min')
  +record('AppleExerciseTime',20,'2020-01-01 11:00:00 +0300','2020-01-01 11:20:00 +0300','min')
  +record('VO2Max',45,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','mL/min·kg')
  +sleep(ASLEEP,'2020-01-01 23:00:00 +0300','2020-01-02 02:00:00 +0300')
  +sleep(DEEP,'2020-01-02 01:00:00 +0300','2020-01-02 03:00:00 +0300')
  +sleep(INBED,'2020-01-01 22:00:00 +0300','2020-01-02 04:00:00 +0300')
  +record('StepCount',120,'2020-01-31 23:30:00 +0300','2020-02-01 00:30:00 +0300','count')
  +record('RestingHeartRate',60,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','count/min')
  +record('RestingHeartRate',80,'2020-01-01 12:00:00 +0300','2020-01-01 12:00:00 +0300','count/min')
  +record('RestingHeartRate',90,'2020-01-02 12:00:00 +0300','2020-01-02 12:00:00 +0300','count/min')
  +'<Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="'+WATCH+'" sourceVersion="1"'
  +' startDate="2020-01-01 12:00:00 +0300" endDate="2020-01-01 13:00:00 +0300" duration="45" durationUnit="min"/>'
  +record('StepCount',100,'2020-01-01 10:00:00 +0300','2020-01-01 10:10:00 +0300','bogus')+'</HealthData>')

def rich_xml():
 """Архив для сверки двух проходов: все трудные случаи сна плюс обычные показатели."""
 parts=['<HealthData>']
 a=parts.append
 # Обычная ночь через полночь: одно окно, помеченное датой конца.
 a(sleep(ASLEEP,'2021-03-01 23:10:00 +0300','2021-03-02 06:40:00 +0300'))
 # Дневной сон целиком внутри окна.
 a(sleep(ASLEEP,'2021-03-02 14:00:00 +0300','2021-03-02 15:30:00 +0300'))
 # Запись через полдень: разрезается на два окна.
 a(sleep(ASLEEP,'2021-03-03 10:00:00 +0300','2021-03-03 14:00:00 +0300'))
 # Awake поверх Asleep: пересечение даёт conflicting_awake_windows.
 a(sleep(ASLEEP,'2021-03-04 23:00:00 +0300','2021-03-05 07:00:00 +0300'))
 a(sleep(AWAKE,'2021-03-05 03:00:00 +0300','2021-03-05 03:30:00 +0300'))
 # Awake без сна в том же окне: строки быть не должно.
 a(sleep(AWAKE,'2021-03-06 02:00:00 +0300','2021-03-06 02:30:00 +0300'))
 # Окно короче трёх часов.
 a(sleep(ASLEEP,'2021-03-07 01:00:00 +0300','2021-03-07 02:30:00 +0300'))
 # Два источника на одно окно: часы и телефон.
 a(sleep(ASLEEP,'2021-03-08 23:00:00 +0300','2021-03-09 06:00:00 +0300'))
 a(sleep(ASLEEP,'2021-03-08 23:30:00 +0300','2021-03-09 05:00:00 +0300',source=PHONE))
 # Смена UTC-смещения внутри записи: растёт только счётчик сна.
 a(sleep(ASLEEP,'2021-03-10 23:00:00 +0300','2021-03-11 06:00:00 +0400'))
 # Точный повтор записи сна: дедупликация не должна менять длительность окна.
 dup=sleep(ASLEEP,'2021-03-12 23:00:00 +0300','2021-03-13 06:00:00 +0300')
 a(dup); a(dup)
 # Повтор записи со сменой смещения: счётчик сна считает записи до дедупликации.
 dup2=sleep(ASLEEP,'2021-03-13 23:00:00 +0300','2021-03-14 06:00:00 +0400')
 a(dup2); a(dup2)
 # Перекрывающиеся интервалы одного источника: объединение, а не сумма.
 a(sleep(ASLEEP,'2021-03-14 23:00:00 +0300','2021-03-15 04:00:00 +0300'))
 a(sleep(DEEP,'2021-03-15 02:00:00 +0300','2021-03-15 06:00:00 +0300'))
 # InBed во втором проходе не учитывается вовсе.
 a(sleep(INBED,'2021-03-16 22:00:00 +0300','2021-03-17 07:00:00 +0300'))
 # Незнакомое значение категории: invalid_or_unsupported.
 a(sleep('HKCategoryValueSleepAnalysisSomethingNew','2021-03-17 23:00:00 +0300','2021-03-18 06:00:00 +0300'))
 # Источник другой версии в следующем месяце: ранг источника меняется по месяцам.
 for day in range(1,11):
  a(sleep(ASLEEP,'2021-04-%02d 23:00:00 +0300'%day,'2021-04-%02d 06:30:00 +0300'%(day+1),version='2'))
 for day in range(1,4):
  a(sleep(ASLEEP,'2021-04-%02d 23:20:00 +0300'%day,'2021-04-%02d 05:00:00 +0300'%(day+1),source=OTHER))
 # Обычные показатели: суммы, средние, тренировки, разрез через полночь.
 for day in range(1,21):
  a(record('StepCount',1000+day,'2021-03-%02d 09:00:00 +0300'%day,'2021-03-%02d 09:30:00 +0300'%day,'count'))
  a(record('RestingHeartRate',55+day%5,'2021-03-%02d 08:00:00 +0300'%day,'2021-03-%02d 08:00:00 +0300'%day,'count/min'))
 a(record('StepCount',500,'2021-03-31 23:30:00 +0300','2021-04-01 00:30:00 +0300','count'))
 a(record('DistanceWalkingRunning',3000,'2021-03-05 09:00:00 +0300','2021-03-05 09:40:00 +0300','m'))
 a(record('ActiveEnergyBurned',400,'2021-03-05 09:00:00 +0300','2021-03-05 09:40:00 +0300','kJ'))
 a(record('VO2Max',42,'2021-03-06 09:00:00 +0300','2021-03-06 09:00:00 +0300','mL/kg/min'))
 a('<Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="'+WATCH+'" sourceVersion="1"'
   ' startDate="2021-03-09 18:00:00 +0300" endDate="2021-03-09 19:00:00 +0300" duration="52" durationUnit="min"/>')
 a('<Workout workoutActivityType="HKWorkoutActivityTypeCycling" sourceName="'+PHONE+'" sourceVersion="1"'
   ' startDate="2021-03-10 18:00:00 +0300" endDate="2021-03-10 19:30:00 +0300" duration="5400" durationUnit="s"/>')
 # Запись, которую не разобрать: единица не поддержана.
 a(record('StepCount',10,'2021-03-11 09:00:00 +0300','2021-03-11 09:10:00 +0300','parsecs'))
 a('</HealthData>')
 return ''.join(parts)

def write_archive(path,xml=None,name='apple_health_export/экспорт.xml'):
 """Имя XML внутри архива локализовано: находить его нужно по корневому тегу."""
 with zipfile.ZipFile(path,'w') as z: z.writestr(name,xml if xml is not None else simple_xml())
 return path
