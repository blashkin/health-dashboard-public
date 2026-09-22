// Раздел «Главное»: тот же архив, пересказанный без жаргона, с нормами и источниками.
// Живёт отдельным файлом, потому что это слой смысла, а не ещё одна вкладка с графиком:
// app.js остаётся про данные и элементы управления, story.js — про выводы и нормы.
// Имена здесь не должны совпадать с именами app.js: файлы склеиваются в один скрипт.

// Показатели, о которых раздел умеет говорить словами.
const STORY_METRICS=['steps','exercise_min','resting_hr','vo2max','sleep_hours'];
// Порог шума: изменение меньше него называется «почти не изменилось», а не направлением.
// vo2max — из независимой проверки точности (шум оценки ~1–2,6 мл/кг/мин), resting_hr — из
// ширины клинических категорий. Пороги steps, exercise_min и sleep_hours рабочие: у них
// первоисточника нет, и страница говорит об этом прямо.
const NOISE={steps:300,exercise_min:3,resting_hr:2,vo2max:2,sleep_hours:.25};
// Смысловой полюс. 'up' — рост хорошо; 'watch' — рост требует внимания, снижение нейтрально
// (выгоды снижения источники не показали); 'band' — хорошо попадание в диапазон, не «больше».
const POLE={steps:'up',exercise_min:'up',vo2max:'up',resting_hr:'watch',sleep_hours:'band'};
const STATUS_WORD={none:'status.none',partial:'status.partial',sparse:'status.sparse',full:'status.full'};

// Неполнота относится к архиву целиком, а не к отдельному показателю: год обрезан тогда,
// когда обрезана выгрузка, а не когда конкретный прибор молчал.
function partialYears(){let ms=months();if(!ms.length)return new Set();let out=new Set();
 if(ms.at(-1).slice(5)!=='12')out.add(ms.at(-1).slice(0,4));
 if(ms[0].slice(5)!=='01')out.add(ms[0].slice(0,4));
 return out}
function storyYears(){return [...new Set(months().map(m=>m.slice(0,4)))].sort()}
function archiveMonthsIn(year){return months().filter(m=>m.slice(0,4)===year)}

// Сон: если загружен файл окон полдень–полдень, год считается по нему; иначе по sleep_hours
// основного файла. Определения не смешиваются ни внутри года, ни внутри сравнения.
function sleepIsWindows(){return !!(state.sleep&&Array.isArray(state.sleep.monthly)&&state.sleep.monthly.length)}
function storyRows(metric){
 if(metric==='sleep_hours'&&sleepIsWindows())
  return state.sleep.monthly.filter(x=>safeDate(x.month)).map(x=>({month:x.month,value:x.mean_hours,
   observed_days:x.observed_windows,calendar_days:daysIn(x.month),aggregation:'mean_observed_days'}));
 return metricRows(metric)}

// Годовое значение. Суммы (шаги, минуты) приводятся к среднему на день С ЗАПИСЬЮ, иначе
// дырявый год выглядит провалом. Средние взвешиваются по дням с записью.
function yearly(metric){
 let part=partialYears(),isSum=expectedAgg(metric)==='sum',byYear=new Map();
 for(const r of storyRows(metric)){if(!safeDate(r.month))continue;
  let y=r.month.slice(0,4);if(!byYear.has(y))byYear.set(y,[]);byYear.get(y).push(r)}
 return storyYears().map(year=>{
  let rows=(byYear.get(year)||[]).filter(r=>r.value!==null&&Number.isFinite(n(r.value))&&n(r.observed_days)>0),
      obs=rows.reduce((s,r)=>s+n(r.observed_days),0),
      cal=archiveMonthsIn(year).reduce((s,m)=>s+daysIn(m),0),
      total=isSum?rows.reduce((s,r)=>s+n(r.value),0):null,
      value=!obs?null:isSum?total/obs:rows.reduce((s,r)=>s+n(r.value)*n(r.observed_days),0)/obs,
      // VO₂max редок по природе прибора: покрытием его мерить нельзя, иначе охра стоит всегда.
      // Тренировки и сезонные виды покрытием не меряются вовсе — так же, как в passesCoverage()
      // в app.js: три месяца плавания в году это лето, а не дыра в записях.
      sparse=metric==='vo2max'?obs<3
       :(metric.startsWith('workout_')||['cycling_km','swimming_km'].includes(metric))?false
       :(cal?obs/cal:0)<.8,
      partial=part.has(year);
  return {year,value,total:value===null?null:total,observedDays:obs,calendarDays:cal,
   coverage:cal?obs/cal:0,monthsWithData:rows.length,archiveMonths:archiveMonthsIn(year).length,
   partial,sparse,status:value===null?'none':partial?'partial':sparse?'sparse':'full'}})}

// План велит сравнивать только полные годы. Но у сна полных лет может не быть ни одного:
// часы снимают на ночь, и 70% записанных ночей — обычное дело. Выкинуть показатель из
// сравнения молча нельзя, поэтому здесь есть запасной ход, и он себя называет.
function storyHorizons(metric){
 let h=horizons(metric);
 if(h.base)return h;
 let sparse=horizons(metric,true);
 if(sparse.base)sparse.sparseBasis=true;
 return sparse}
function yearStatus(metric,year){return (yearly(metric).find(y=>y.year===year)||{status:'none'}).status}
function fullYears(metric){return yearly(metric).filter(y=>y.status==='full')}
function medianOf(a){let s=[...a].sort((x,y)=>x-y),h=s.length>>1;
 return s.length?(s.length%2?s[h]:(s[h-1]+s[h])/2):null}

// Цвет направления. Красный не используется; на экране цвет всегда продублирован словом.
function toneOf(metric,dir){let p=POLE[metric];
 if(dir==='flat')return 'neutral';
 if(p==='up')return dir==='up'?'good':'watch';
 if(p==='watch')return dir==='up'?'watch':'neutral';
 return 'neutral'}
function compareTo(metric,was,now){let d=now-was,eps=NOISE[metric]??0,
 dir=Math.abs(d)<eps?'flat':d>0?'up':'down';
 return {delta:d,dir,tone:toneOf(metric,dir)}}

// Три горизонта: прошлый год, первый полный год архива, медиана всех полных лет.
// Считаются только по полным годам; обрезанный год возвращается отдельно и не сравнивается.
function horizons(metric,allowSparse){
 let all=yearly(metric),
     full=all.filter(y=>y.status==='full'||(allowSparse&&y.status==='sparse')),last=all.at(-1),
     out={metric,base:full.at(-1)||null,prev:null,first:null,median:null,partial:null,fullCount:full.length,sparseBasis:false};
 if(last&&last.status==='partial'&&last.value!==null)out.partial=last;
 if(!out.base)return out;
 let prev=full.at(-2),first=full[0];
 if(prev)out.prev={year:prev.year,value:prev.value,...compareTo(metric,prev.value,out.base.value)};
 if(first&&first.year!==out.base.year)out.first={year:first.year,value:first.value,...compareTo(metric,first.value,out.base.value)};
 if(full.length>=3){let med=medianOf(full.map(y=>y.value));
  out.median={value:med,...compareTo(metric,med,out.base.value)}}
 return out}

// Вердикт строки стены лет: наклон линейной регрессии по полным годам. «Ровно» — когда
// сдвиг за весь наблюдаемый размах меньше порога шума, то есть тренд неотличим от дрожания.
function trendVerdict(metric,allowSparse){
 let full=yearly(metric).filter(y=>y.status==='full'||(allowSparse&&y.status==='sparse'));
 if(full.length<3)return {verdict:'few',slope:null,span:null,years:full.length,dir:'flat',tone:'neutral'};
 let xs=full.map(y=>Number(y.year)),ys=full.map(y=>y.value),
     mx=xs.reduce((s,x)=>s+x,0)/xs.length,my=ys.reduce((s,y)=>s+y,0)/ys.length,
     den=xs.reduce((s,x)=>s+(x-mx)**2,0),
     slope=den?xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/den:0,
     span=slope*(xs.at(-1)-xs[0]),
     dir=Math.abs(span)<(NOISE[metric]??0)?'flat':span>0?'up':'down';
 return {verdict:dir,slope,span,years:full.length,dir,tone:toneOf(metric,dir)}}

// Минуты в неделю. Обрезанный год делится на недели записанных месяцев, а не на 52,18:
// иначе восемь месяцев всегда выглядят падением объёма.
function weeklyMinutes(totalMinutes,year){
 if(totalMinutes==null)return null;
 let ms=archiveMonthsIn(year),
     weeks=partialYears().has(year)?ms.reduce((s,m)=>s+daysIn(m),0)/7:52.18;
 return weeks?totalMinutes/weeks:null}

// ——— Нормы и источники ———————————————————————————————————————————————————————
// Источники зашиты в страницу, а не в документацию: страница автономна и уезжает одна.
// checked — дата, когда число сверено с первоисточником глазами. Ни одного порога и ни
// одного совета без ссылки на запись в SOURCES: проверка в tests/ui/browser.cjs следит.
const CHECKED='2026-09-21';
const SOURCES={
 paluch2022:{short:'Paluch, 2022',group:'steps',org:'Paluch A. E. {etAl}',title:'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts',where:'The Lancet Public Health',year:'2022',url:'https://pubmed.ncbi.nlm.nih.gov/35247352/',checked:CHECKED},
 saintMaurice2020:{short:'Saint-Maurice, 2020',group:'steps',org:'Saint-Maurice P. F. {etAl}',title:'Association of Daily Step Count and Step Intensity With Mortality Among US Adults',where:'JAMA',year:'2020',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC7093766/',checked:CHECKED},
 lee2019:{short:'Lee, 2019',group:'steps',org:'Lee I-M. {etAl}',title:'Association of Step Volume and Intensity With All-Cause Mortality in Older Women',where:'JAMA Internal Medicine',year:'2019',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC6547157/',checked:CHECKED},
 who2020:{short:'{who}, 2020',group:'exercise_min',org:'Bull F. C. {etAl}, {whoFull}',title:'World Health Organization 2020 guidelines on physical activity and sedentary behaviour',where:'British Journal of Sports Medicine',year:'2020',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/',checked:CHECKED},
 hhs2018:{short:'HHS, 2018',group:'exercise_min',org:'U.S. Department of Health and Human Services',title:'Physical Activity Guidelines for Americans, 2nd edition. Executive Summary',where:'',year:'2018',url:'https://odphp.health.gov/sites/default/files/2019-10/PAG_ExecutiveSummary.pdf',checked:CHECKED},
 cdc2023:{short:'CDC, 2023',group:'workouts',org:'Centers for Disease Control and Prevention',title:'Adult Activity: An Overview',where:'Physical Activity Basics',year:'2023',url:'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html',checked:CHECKED},
 nhlbi:{short:'NHLBI',group:'resting_hr',org:'National Heart, Lung, and Blood Institute, NIH',title:'Arrhythmias — Types',where:'',year:'{noDate}',url:'https://www.nhlbi.nih.gov/health/arrhythmias/types',checked:CHECKED},
 aha2024:{short:'AHA, 2024',group:'resting_hr',org:'American Heart Association',title:'All About Heart Rate (Pulse)',where:'',year:'2024 ({rev} 13.05.2024)',url:'https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse',checked:CHECKED},
 nauman2011:{short:'Nauman, 2011',group:'resting_hr',org:'Nauman J. {etAl}',title:'Temporal changes in resting heart rate and deaths from ischemic heart disease',where:'JAMA',year:'2011',url:'https://pubmed.ncbi.nlm.nih.gov/22187277/',checked:CHECKED},
 mayo2025:{short:'Mayo Clinic, 2025',group:'resting_hr',org:'Mayo Clinic',title:'Heart rate: What’s normal?',where:'',year:'2025 ({rev} 22.10.2025)',url:'https://www.mayoclinic.org/healthy-lifestyle/fitness/expert-answers/heart-rate/faq-20057979',checked:CHECKED},
 friend2015:{short:'FRIEND, 2015',group:'vo2max',org:'Kaminsky L. A., Arena R., Myers J. ({registry} FRIEND)',title:'Reference Standards for Cardiorespiratory Fitness Measured With Cardiopulmonary Exercise Testing: Data From the Fitness Registry and the Importance of Exercise National Database',where:'Mayo Clinic Proceedings',year:'2015',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4919021/',checked:CHECKED},
 kodama2009:{short:'Kodama, 2009',group:'vo2max',org:'Kodama S. {etAl}',title:'Cardiorespiratory fitness as a quantitative predictor of all-cause mortality and cardiovascular events in healthy men and women: a meta-analysis',where:'JAMA',year:'2009',url:'https://pubmed.ncbi.nlm.nih.gov/19454641/',checked:CHECKED},
 lambe2025:{short:'Lambe, 2025',group:'vo2max',org:'Lambe R. {etAl}',title:'Investigating the accuracy of Apple Watch VO2 max measurements: A validation study',where:'PLOS ONE',year:'2025',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC12080799/',checked:CHECKED},
 aasm2015:{short:'AASM/SRS, 2015',group:'sleep_hours',org:'Watson N. F. {etAl}, AASM {and} Sleep Research Society',title:'Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society',where:'Sleep',year:'2015',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/',checked:CHECKED},
 nsf2015:{short:'NSF, 2015',group:'sleep_hours',org:'Hirshkowitz M. {etAl}, National Sleep Foundation',title:'National Sleep Foundation’s updated sleep duration recommendations: final report',where:'Sleep Health',year:'2015',url:'https://pubmed.ncbi.nlm.nih.gov/29073398/',checked:CHECKED}
};

// Таблица FRIEND: перцентили 5/10/25/50/75/90/95, мл/кг/мин, по десятилетиям возраста.
// Таблицы Apple «низкая / ниже средней / высокая» в открытых источниках нет, поэтому
// категория на экране называется местом среди сверстников, а не словом Apple.
const PCT=[5,10,25,50,75,90,95];
const FRIEND={
 m:{20:[29.0,32.1,40.1,48.0,55.2,61.8,66.3],30:[27.2,30.2,35.9,42.4,49.2,56.5,59.8],
    40:[24.2,26.8,31.9,37.8,45.0,52.1,55.6],50:[20.9,22.8,27.1,32.6,39.7,45.6,50.7],
    60:[17.4,19.8,23.7,28.2,34.5,40.3,43.0],70:[16.3,17.1,20.4,24.4,30.4,36.6,39.7]},
 f:{20:[21.7,23.9,30.5,37.6,44.7,51.3,56.0],30:[19.0,20.9,25.3,30.2,36.1,41.4,45.8],
    40:[17.0,18.8,22.1,26.7,32.4,38.4,41.7],50:[16.0,17.3,19.9,23.4,27.6,32.0,35.9],
    60:[13.4,14.6,17.2,20.0,23.8,27.0,29.4],70:[13.1,13.6,15.6,18.3,20.8,23.1,24.1]}};

// Между перцентилями не интерполируем: таблица даёт семь точек, а не кривую.
function percentileBand(sex,age,value){
 if(!FRIEND[sex]||age==null||!Number.isFinite(age)||age<20||age>79||value==null||!Number.isFinite(value))return null;
 let row=FRIEND[sex][Math.min(70,Math.floor(age/10)*10)];
 if(value<row[0])return {label:t('pct.below',{p:PCT[0]}),low:null,high:PCT[0],src:['friend2015']};
 for(let i=0;i<row.length-1;i++) if(value<row[i+1])
  return {label:t('pct.between',{a:PCT[i],b:PCT[i+1]}),low:PCT[i],high:PCT[i+1],src:['friend2015']};
 return {label:t('pct.above',{p:PCT[6]}),low:PCT[6],high:null,src:['friend2015']};
}

const weeklyFromDaily=d=>d==null?null:d*7;

// Зоны линейки. Возраст меняет разметку у шагов и у сна, поэтому зоны — функция, а не
// константа. tone: 'good' | 'watch' | 'neutral'; красного на странице нет вовсе.
function bands(metric,age,sex){
 if(metric==='steps'){
  // Плато пользы зависит от возраста: до 60 лет 8–10 тыс., с 60 лет 6–8 тыс.
  let s=['paluch2022'],sm=['paluch2022','saintMaurice2020'];
  let low={from:0,to:4000,label:t('zone.steps.low'),tone:'watch',src:sm};
  let rise=to=>({from:4000,to:to,label:t('zone.steps.rise'),tone:'neutral',src:sm});
  let over=f=>({from:f,to:null,label:t('zone.steps.over'),tone:'neutral',src:s});
  if(age==null)return [low,rise(6000),
   {from:6000,to:8000,label:t('zone.steps.plateauOld'),tone:'good',src:['paluch2022','lee2019']},
   {from:8000,to:10000,label:t('zone.steps.plateauYoung'),tone:'good',src:s},over(10000)];
  return age>=60
   ?[low,rise(6000),{from:6000,to:8000,label:t('zone.steps.plateauYours'),tone:'good',src:['paluch2022','lee2019']},over(8000)]
   :[low,rise(8000),{from:8000,to:10000,label:t('zone.steps.plateauYours'),tone:'good',src:s},over(10000)];
 }
 if(metric==='exercise_min'){ // линейка в минутах в неделю, не в минутах в день
  let s=['who2020','hhs2018'];
  return [{from:0,to:150,label:t('zone.ex.below'),tone:'watch',src:s},
          {from:150,to:300,label:t('zone.ex.in'),tone:'good',src:s},
          {from:300,to:null,label:t('zone.ex.above'),tone:'good',src:['who2020']}];
 }
 if(metric==='resting_hr'){
  let s=['nhlbi','aha2024'];
  return [{from:30,to:60,label:t('zone.hr.low'),tone:'neutral',src:s},
          {from:60,to:100,label:t('zone.hr.usual'),tone:'good',src:s},
          {from:100,to:140,label:t('zone.hr.high'),tone:'watch',src:s}];
 }
 if(metric==='sleep_hours'){
  let top=age!=null&&age>=65?8:9,s=['aasm2015','nsf2015'];
  return [{from:3,to:7,label:t('zone.sleep.below'),tone:'watch',src:s},
          {from:7,to:top,label:t('zone.sleep.in'),tone:'good',src:s},
          {from:top,to:12,label:t('zone.sleep.above'),tone:'neutral',src:['nsf2015']}];
 }
 if(metric==='vo2max'){
  // Без пола и возраста линейки нет: сравнивать не с чем. Это не сбой, а отсутствие данных.
  if(!FRIEND[sex]||age==null||age<20||age>79)return [];
  let row=FRIEND[sex][Math.min(70,Math.floor(age/10)*10)];
  // Тон нейтральный по всей шкале: FRIEND описывает распределение, а не ставит порог.
  return row.map((v,i)=>({from:v,to:i<row.length-1?row[i+1]:null,
   label:i<row.length-1?t('tick.between',{a:PCT[i],b:PCT[i+1]}):t('tick.above',{p:PCT[6]}),
   tone:'neutral',src:['friend2015']}));
 }
 return [];
}

function zone(metric,value,age,sex){
 if(value==null||!Number.isFinite(value))return null;
 let bs=bands(metric,age,sex);
 for(const b of bs) if(value>=b.from&&(b.to===null||value<b.to))return b;
 // Значение вне нарисованной шкалы: отдаём крайнюю зону, а не пустоту.
 if(bs.length&&value<bs[0].from)return bs[0];
 return bs.length?bs.at(-1):null;
}

// Советы, «когда к врачу» и оговорки. У совета и у порога обязателен src. Оговорка может
// быть словами самой страницы про прибор — тогда стоит own, и на экране это так и написано.
const OWN='norm.own';
const NORMS={
 steps:{label:'norm.steps.label',official:false,officialSrc:['paluch2022','saintMaurice2020','lee2019'],
  officialNote:'norm.steps.official',
  advice:[{text:'norm.steps.advice.1',src:['who2020','paluch2022']},
          {text:'norm.steps.advice.2',src:['who2020']},
          {text:'norm.steps.advice.3',src:['saintMaurice2020']}],
  doctor:[],
  caveats:[{text:'norm.steps.caveats.1',src:['paluch2022','saintMaurice2020','lee2019']},
           {text:'norm.steps.caveats.2',src:['saintMaurice2020']},
           {text:'norm.steps.caveats.3',src:['lee2019']}]},
 exercise_min:{label:'norm.exercise_min.label',official:true,officialSrc:['who2020','hhs2018'],
  officialNote:'norm.exercise_min.official',
  advice:[{text:'norm.exercise_min.advice.1',src:['hhs2018','who2020']},
          {text:'norm.exercise_min.advice.2',src:['hhs2018']},
          {text:'norm.exercise_min.advice.3',src:['who2020','hhs2018']}],
  doctor:[],
  caveats:[{text:'norm.exercise_min.caveats.1',own:OWN}]},
 resting_hr:{label:'norm.resting_hr.label',official:true,officialSrc:['nhlbi','aha2024'],
  officialNote:'norm.resting_hr.official',
  advice:[{text:'norm.resting_hr.advice.1',src:['aha2024','mayo2025']},
          {text:'norm.resting_hr.advice.2',src:['aha2024']},
          {text:'norm.resting_hr.advice.3',src:['aha2024','mayo2025']},
          {text:'norm.resting_hr.advice.4',src:['nauman2011']}],
  doctor:[{text:'norm.resting_hr.doctor.1',src:['mayo2025']},
          {text:'norm.resting_hr.doctor.2',src:['mayo2025']},
          {text:'norm.resting_hr.doctor.3',src:['aha2024']},
          {text:'norm.resting_hr.doctor.4',src:['aha2024']}],
  caveats:[{text:'norm.resting_hr.caveats.1',src:['mayo2025']},
           {text:'norm.resting_hr.caveats.2',src:['mayo2025']},
           {text:'norm.resting_hr.caveats.3',own:OWN},
           {text:'norm.resting_hr.caveats.4',src:['nauman2011']}]},
 vo2max:{label:'norm.vo2max.label',official:false,officialSrc:['friend2015'],
  officialNote:'norm.vo2max.official',
  advice:[{text:'norm.vo2max.advice.1',src:['kodama2009']},
          {text:'norm.vo2max.advice.2',src:['friend2015']}],
  doctor:[],
  caveats:[{text:'norm.vo2max.caveats.1',own:OWN},
           {text:'norm.vo2max.caveats.2',src:['lambe2025']},
           {text:'norm.vo2max.caveats.3',own:OWN},
           {text:'norm.vo2max.caveats.4',src:['lambe2025']}]},
 sleep_hours:{label:'norm.sleep_hours.label',official:true,officialSrc:['aasm2015','nsf2015'],
  officialNote:'norm.sleep_hours.official',
  advice:[{text:'norm.sleep_hours.advice.1',src:['aasm2015','nsf2015']},
          {text:'norm.sleep_hours.advice.2',src:['aasm2015']}],
  doctor:[{text:'norm.sleep_hours.doctor.1',src:['aasm2015']}],
  caveats:[{text:'norm.sleep_hours.caveats.1',own:OWN},
           {text:'norm.sleep_hours.caveats.2',own:OWN}]}
};

// Нормы для часов тренировок стоят отдельно: там не «обычный день», а объём за год.
const WORKOUT_NORM={
 moderate:{low:150,high:300,label:'workout.moderate',src:['cdc2023','who2020']},
 vigorous:{low:75,high:150,label:'workout.vigorous',src:['cdc2023','who2020']},
 // Ходьба и велосипед считаются умеренной нагрузкой, бег — высокой. Скоростей в архиве нет,
 // поэтому велосипед отнесён к умеренной, и на экране это сказано прямо.
 kind:{Walking:'moderate',Hiking:'moderate',Cycling:'moderate',Running:'vigorous',Swimming:'moderate'},
 // Сводить их в одно число нечем: коэффициента «1 минута высокой = 2 умеренной» на
 // странице CDC нет, а ВОЗ допускает «эквивалентное сочетание», но множителя не даёт.
 noSum:'workout.noSum'
};

// Рабочие пороги страницы. Первые три выбраны исполнителем и источника не имеют — так и
// написано на экране. Два последних привязаны к опубликованным числам, но нормой не являются.
const NOISE_NOTE={
 steps:{text:'noise.steps.text',src:[],own:'noise.own.plain'},
 exercise_min:{text:'noise.exercise_min.text',src:[],own:'noise.own.plain'},
 sleep_hours:{text:'noise.sleep_hours.text',src:[],own:'noise.own.plain'},
 resting_hr:{text:'noise.resting_hr.text',src:['nauman2011'],own:'noise.own.hr'},
 vo2max:{text:'noise.vo2max.text',src:['lambe2025'],own:'noise.own.vo2'}
};

// ——— Обложка ————————————————————————————————————————————————————————————————
// Год рождения и пол нужны только для норм VO₂max и сна. Живут в state и нигде не
// сохраняются: ни в файл, ни в localStorage — страница ничего не помнит между запусками.
function storyAge(year){let b=Number(state.birthYear);
 return Number.isFinite(b)&&b>1900&&b<2100?Number(year)-b:null}
function storySex(){return state.sex==='m'||state.sex==='f'?state.sex:null}
// Возраст берётся на тот год, о котором идёт речь: каждый год сравнивается со своей
// возрастной группой, а не последний возраст натягивается на весь архив.
function ageInYear(year){return storyAge(year)}

// Направление за весь архив: последний полный год против первого полного.
function archDir(metric){let h=storyHorizons(metric);
 return h.first?h.first.dir:h.base?trendVerdict(metric).dir:null}
function firstYearWithData(metric){let y=yearly(metric).find(x=>x.value!==null);return y?y.year:null}
// Показатель, который начали записывать позже остальных.
function lateStarters(){
 let starts=STORY_METRICS.map(m=>[m,firstYearWithData(m)]).filter(x=>x[1]),
     earliest=starts.length?starts.map(x=>x[1]).sort()[0]:null;
 return starts.filter(x=>Number(x[1])-Number(earliest)>=2).map(x=>x[0])}

// Место последнего полного года среди прошлых полных лет: «выше, чем в N из M».
function rankAmongYears(metric){let full=fullYears(metric);if(full.length<2)return null;
 let base=full.at(-1),others=full.slice(0,-1);
 return {below:others.filter(y=>y.value<base.value).length,of:others.length}}

const CHIP_LINE={vo2max:{up:'chip.vo2max.up',down:'chip.vo2max.down',flat:'chip.vo2max.flat'},
 steps:{up:'chip.steps.up',down:'chip.steps.down',flat:'chip.steps.flat'},
 resting_hr:{up:'chip.resting_hr.up',down:'chip.resting_hr.down',flat:'chip.resting_hr.flat'}};
const CHIP_TITLE={vo2max:'chip.title.vo2max',steps:'chip.title.steps',resting_hr:'chip.title.resting_hr'};

// Три чипа разного смысла, а не четыре одинаковые карточки: сначала фраза, число вторым слоем.
function coverChips(){
 return ['vo2max','steps','resting_hr'].map(metric=>{
  let h=storyHorizons(metric),base=h.base,first=h.first,dir=archDir(metric),title=t(CHIP_TITLE[metric]);
  if(!base||!dir)return {metric,title,line:t('chip.tooFew'),num:'',tone:'neutral'};
  let unit=unitFor(metric,base.value),num='';
  if(metric==='vo2max'){let r=rankAmongYears(metric),
   // «Выше, чем в 9 из 9» — формально верно и нечитаемо; когда выше всех, так и сказать.
   place=!r||!r.of?'':r.below===r.of?t('chip.aboveAll'):t('chip.aboveSome',{n:r.below,of:r.of});
   num=t('chip.inYear',{value:fmt(base.value,1),unit:unit,year:base.year})+place;}
  else if(metric==='steps')
   num=t('chip.inYear',{value:fmt(base.value,0),unit:unit,year:base.year})+(first?t('chip.against',{value:fmt(first.value,0),year:first.year}):'');
  else {let d=first?base.value-first.value:null;
   num=d===null?t('chip.inYear',{value:fmt(base.value,0),unit:unit,year:base.year})
    :t('chip.since',{sign:d>0?'+':'−',value:fmt(Math.abs(d),0),unit:unit,year:first.year});}
  return {metric,title,line:t(CHIP_LINE[metric][dir]),num,tone:toneOf(metric,dir)}})}

const STORY_UNIT={steps:'sunit.steps',exercise_min:'sunit.exercise_min',resting_hr:'unit.bpm',vo2max:'unit.vo2',sleep_hours:'sunit.sleep_hours'};
// Единица зависит от числа перед ней: «1 шаг», «3 шага», «983 шага». Там, где падежа нет
// (уд/мин, мл/кг/мин, мин), стоит сокращение — оно не склоняется и не врёт.
function unitFor(metric,v){
 if(metric==='steps')return t('sunit.stepsPerDay',{word:tPlural(Math.round(v),'plural.step')});
 if(metric==='exercise_min')return t('unit.minPerDay');
 return t(STORY_UNIT[metric])}
const TONE_WORD={good:'tone.good',watch:'tone.watch',neutral:'tone.neutral'};

// ——— Разметка обложки ————————————————————————————————————————————————————————
function storyCover(){
 let chips=coverChips();
 return `<section class="panel cover">
  <div class="chips">${chips.map(c=>`<div class="chip tone-${esc(c.tone)}">
   <div class="chip-title">${esc(c.title)}</div>
   <div class="chip-line">${esc(c.line)}</div>
   <div class="chip-num">${esc(c.num)}</div>
   <div class="chip-tone">${esc(t(TONE_WORD[c.tone]))}</div></div>`).join('')}</div>
  <p class="chart-note">${esc(t('cover.toneNote'))}</p></section>`}

// Словарь из брифа: один раз, перед числами, и сворачивается, чтобы не мешать повторному чтению.
const GLOSSARY=['steps','exercise_min','resting_hr','vo2max','sleep_hours'];
function storyGlossary(){
 return `<section class="panel"><details class="glossary"><summary>${esc(t('gloss.title'))}</summary>
  <dl>${GLOSSARY.map(m=>`<dt>${esc(t('gloss.'+m))}</dt><dd>${esc(t('gloss.'+m+'.text'))}</dd>`).join('')}</dl>
  <p class="trust">${esc(t('gloss.trust'))}</p>
 </details></section>`}

// Год рождения и пол спрашиваются один раз, на стартовом экране. Здесь их полей нет:
// после расчёта менять исходные данные посреди готовых чисел — значит пересобирать страницу.
function bindStory(){
 app.querySelectorAll('[data-ui="storyMetric"]').forEach(b=>b.onclick=()=>{
  state.storyMetric=b.dataset.metric;render()})}

// ——— Было и стало, нормы, источники ——————————————————————————————————————————
const DEC={steps:0,exercise_min:0,resting_hr:0,vo2max:1,sleep_hours:1};
const SOURCE_NO=Object.fromEntries(Object.keys(SOURCES).map((k,i)=>[k,i+1]));
// Сноска у нормы: короткое имя источника и номер, который ведёт якорем вниз страницы.
// В полях источника служебные слова стоят метками: имена работ и организаций уже английские.
const srcText=v=>String(v).replace(/\{(\w+)\}/g,(m,name)=>t('src.'+name));
function refs(ids){if(!ids||!ids.length)return '';
 return `<span class="refs">${ids.map(id=>{let s=SOURCES[id];if(!s)return '';
  return `<a class="ref" data-role="ref" href="#src-${esc(id)}">${esc(srcText(s.short))} [${SOURCE_NO[id]}]</a>`}).join('')}</span>`}
function noteOf(item){return item.src&&item.src.length?refs(item.src)
 :`<span class="own">${esc(item.own?t(item.own):'')}</span>`}

// Отметка деления на линейке. У VO₂max деления — это перцентили, а не миллилитры:
// человеку важно место среди сверстников, а не абсолютная шкала прибора.
function tickLabel(metric,v,age,sex){
 if(metric==='vo2max'){let row=(FRIEND[sex]||{})[Math.min(70,Math.floor((age||20)/10)*10)]||[],
  i=row.indexOf(v);return i>=0?t('tick.ordinal',{p:PCT[i]}):''}
 return fmt(v,metric==='sleep_hours'?0:0)}

// Линейка: зоны, деления и отметка. Значение вне нарисованной шкалы упирается в край,
// а не уезжает за картинку; под линейкой об этом сказано словами.
function ruler(metric,value,age,sex){
 let bs=bands(metric,age,sex);if(!bs.length)return '';
 let lo=bs[0].from,hi=bs.at(-1).to;
 if(hi===null||!Number.isFinite(hi))hi=bs.at(-1).from*(metric==='vo2max'?1.15:1.4);
 if(!(hi>lo))return '';
 let W=680,H=72,L=12,R=12,bY=24,bH=20,
     x=v=>L+(Math.min(hi,Math.max(lo,v))-lo)/(hi-lo)*(W-L-R),
     zones=bs.map(b=>{let a=x(b.from),c=x(b.to===null?hi:b.to);
      return `<rect class="zone zone-${esc(b.tone)}" x="${a.toFixed(1)}" y="${bY}" width="${Math.max(0,c-a).toFixed(1)}" height="${bH}"><title>${esc(b.label)}</title></rect>`}).join(''),
     edges=[...new Set(bs.map(b=>b.from).concat(bs.at(-1).to===null?[]:[bs.at(-1).to]))],
     ticks=edges.filter(v=>v>=lo&&v<=hi).map(v=>{let lab=tickLabel(metric,v,age,sex);
      return `<g><line class="rtick" x1="${x(v).toFixed(1)}" y1="${bY}" x2="${x(v).toFixed(1)}" y2="${bY+bH+5}"/>`+
       (lab?`<text class="raxis" x="${x(v).toFixed(1)}" y="${bY+bH+18}" text-anchor="middle">${esc(lab)}</text>`:'')+`</g>`}).join(''),
     overlay=(RULER_MARKS[metric]||[]).filter(o=>o.v>lo&&o.v<hi).map(o=>
      `<line class="rmark" x1="${x(o.v).toFixed(1)}" y1="${bY}" x2="${x(o.v).toFixed(1)}" y2="${bY+bH}"/>`).join(''),
     mark='';
 if(value!=null&&Number.isFinite(value)){let mx=x(value);
  mark=`<g><polygon data-role="mark" data-x="${mx.toFixed(1)}" class="mark" points="${(mx-6).toFixed(1)},${bY-11} ${(mx+6).toFixed(1)},${bY-11} ${mx.toFixed(1)},${(bY-1).toFixed(1)}"/>`+
   `<line class="markline" x1="${mx.toFixed(1)}" y1="${bY}" x2="${mx.toFixed(1)}" y2="${bY+bH}"/></g>`}
 let z=zone(metric,value,age,sex);
 return `<svg class="ruler" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc((value==null?t('ruler.noValue'):t('ruler.yourValue',{value:fmt(value,DEC[metric])}))+(z?t('ruler.zone',{zone:z.label}):''))}">`+
  `<rect data-role="ruler" data-x0="${L}" data-x1="${W-R}" x="${L}" y="${bY}" width="${W-L-R}" height="${bH}" class="zone zone-empty"/>${zones}${overlay}${ticks}${mark}</svg>`}

// Границы, которые рисуются поверх зон: клинические зоны отвечают на «это вообще норма?»,
// а эти отметки — на «а что менялось у тех, за кем следили десять лет».
const RULER_MARKS={resting_hr:[{v:70},{v:85}]};
// Категории Nauman: переход через границу вверх — то, с чем была связана разница в риске,
// а не само по себе число в отдельно взятый год.
function hrCategory(v){return v==null?null:v<70?{i:0,label:t('hr.below70')}:v<=85?{i:1,label:t('hr.70to85')}:{i:2,label:t('hr.above85')}}
function hrShift(h){
 if(!h||!h.base||!h.first)return '';
 let a=hrCategory(h.first.value),b=hrCategory(h.base.value);
 if(!a||!b)return '';
 let vars={year:h.first.year,from:a.label,to:b.label},
     text=a.i===b.i?t('hr.same',vars):t(a.i<b.i?'hr.up':'hr.down',vars);
 return `<p class="norm-shift">${esc(text)} ${refs(['nauman2011'])}</p>`}

// Значение показателя для линейки: у упражнений шкала недельная, у остальных — как считали.
function normReading(metric,base){
 if(!base||base.value==null)return null;
 if(metric==='exercise_min'){let wk=weeklyFromDaily(base.value);
  return {ruler:wk,shown:t('norms.minutesWeek',{day:fmt(base.value,0),dayWord:tPlural(Math.round(base.value),'plural.minute'),week:fmt(wk,0),weekWord:tPlural(Math.round(wk),'plural.minuteOf')})}}
 return {ruler:base.value,shown:`${fmt(base.value,DEC[metric])} ${unitFor(metric,base.value)}`}}

function normBlock(metric){
 let norm=NORMS[metric],h=storyHorizons(metric),base=h.base||yearly(metric).filter(y=>y.value!==null).at(-1);
 if(!norm)return '';
 let title=t(norm.label);
 if(!base||base.value==null)
  return `<div class="norm" data-role="norm"><h2>${esc(title)}</h2>
   <p class="chart-note">${esc(t('norms.noRecords'))}</p>
   <p class="norm-official">${esc(t(norm.officialNote))} ${refs(norm.officialSrc)}</p></div>`;
 let age=ageInYear(base.year),sex=storySex(),read=normReading(metric,base),
     z=zone(metric,read.ruler,age,sex),bar=ruler(metric,read.ruler,age,sex),
     pct=metric==='vo2max'?percentileBand(sex,age,read.ruler):null,
     dir=archDir(metric),tone=z?z.tone:'neutral';
 // У сна и VO₂max тон берётся от попадания в диапазон, а не от направления: «больше» там не значит «лучше».
 if(metric!=='sleep_hours'&&metric!=='vo2max'&&dir)tone=z?z.tone:toneOf(metric,dir);
 let verdict=metric==='vo2max'
  ?(pct?t('norms.yourLevel',{label:pct.label}):t('norms.noCategory'))
  :(z?t('norms.yourZone',{zone:z.label}):t('norms.noZone'));
 return `<div class="norm tone-${esc(tone)}" data-role="norm">
  <div class="norm-head"><h2>${esc(title)}</h2>
   <div class="norm-value">${esc(read.shown)} · ${esc(t('norms.year',{year:base.year}))}${base.status==='sparse'?' · '+esc(t('norms.sparseBase')):''}</div></div>
  <p class="norm-official">${esc(t(norm.officialNote))} ${refs(norm.officialSrc)}</p>
  ${bar||`<p class="chart-note">${esc(t('norms.noRuler'))}</p>`}
  ${metric==='resting_hr'&&bar?`<p class="chart-note">${esc(t('norms.hrDashes'))} ${refs(['nauman2011'])}</p>`:''}
  <p class="norm-verdict">${esc(verdict)} ${z?refs(z.src):''} <span class="tone-word">${esc(t(TONE_WORD[tone]))}</span></p>
  ${metric==='resting_hr'?hrShift(h):''}
  <ul class="advice">${norm.advice.slice(0,3).map(a=>`<li>${esc(t(a.text))} ${noteOf(a)}</li>`).join('')}</ul>
  ${norm.doctor.length?`<div class="doctor"><b>${esc(t('norms.doctor'))}</b><ul>${norm.doctor.map(d=>`<li>${esc(t(d.text))} ${noteOf(d)}</li>`).join('')}</ul></div>`
   :`<div class="doctor"><b>${esc(t('norms.doctor'))}</b><p>${esc(t('norms.noDoctor'))}</p></div>`}
  <ul class="caveats">${norm.caveats.map(c=>`<li>${esc(t(c.text))} ${noteOf(c)}</li>`).join('')}</ul>
  <p class="disclaimer">${esc(t('norms.disclaimer'))}</p>
 </div>`}

// Часть норм задана по возрасту и полу. Спрашиваются они на стартовом экране, а страница
// от build собрана сразу с данными и этого экрана не видела: тогда об этом говорится словами,
// а не молчаливым пропуском строки.
function storyWhoNote(){
 let sex=storySex(),by=state.birthYear;
 if(sex&&by)return `<p class="story-who" data-role="story-who">${esc(t('who.known',{year:by,sex:sex==='m'?t('who.male'):t('who.female')}))}</p>`;
 return `<p class="story-who" data-role="story-who">${esc(t('who.unknown'))}</p>`}

function storyNorms(){
 let list=STORY_METRICS.filter(m=>NORMS[m]);
 return `<section class="panel"><h1>${esc(t('norms.title'))}</h1>
  <p class="chart-note">${esc(t('norms.note'))}</p>
  ${storyWhoNote()}
  ${list.map(normBlock).join('')}</section>`}

// ——— Было и стало ————————————————————————————————————————————————————————————
function deltaCell(metric,cmp){
 if(!cmp)return '<td class="muted">—</td>';
 let abs=Math.abs(cmp.delta),
     num=`${cmp.delta>0?'+':'−'}${fmt(abs,DEC[metric])} ${unitFor(metric,abs)}`;
 // При «почти так же» ставить число главным нечестно: округлённый ноль читается как
 // измеренный ноль, хотя это всего лишь «меньше порога заметности».
 // Печатать саму дельту здесь нечестно вдвойне: округлённый ноль читается как измеренный,
 // да ещё и со знаком («−0,0»). Полезнее назвать порог, ниже которого страница молчит.
 if(cmp.dir==='flat'){let eps=NOISE[metric]??0;
  return `<td><div class="delta">${esc(t('change.almostSame'))}</div>`+
   `<div class="delta-word">${esc(t('change.underThreshold',{value:fmt(eps,eps<1?2:0),unit:unitFor(metric,eps)}))}</div></td>`}
 return `<td class="tone-${esc(cmp.tone)}"><div class="delta">${esc(num)}</div>`+
  `<div class="delta-word">${esc(cmp.dir==='up'?t('change.more'):t('change.less'))} · ${esc(t(TONE_WORD[cmp.tone]))}</div></td>`}

// Одна строка перед сравнением: можно ли верить году, по которому оно идёт. Судья — шаги:
// они пишутся каждый день, и по ним видно, носили ли прибор. Остальные ряды называются
// только тогда, когда в этом году они шаткие: тогда их строки в таблице читать с оглядкой.
function yearTrust(){
 let year=lastCompleteYear();if(!year)return null;
 let judge=['steps','exercise_min'].map(m=>({m,y:yearly(m).find(z=>z.year===year)})).find(x=>x.y&&x.y.value!==null);
 if(!judge)return null;
 let {m,y}=judge,shaky=STORY_METRICS.filter(x=>x!==m&&yearStatus(x,year)==='sparse').map(x=>t(NORMS[x].label).toLowerCase()),
     days=t('trust.days',{what:t(NORMS[m].label).toLowerCase(),n:fmt(y.observedDays,0),word:tPlural(y.observedDays,'plural.day'),of:fmt(y.calendarDays,0)}),
     ok=y.status==='full';
 return {year,ok,shaky,text:ok
  ?t('trust.ok',{year:year,days:days})+(shaky.length?' '+t('trust.shaky',{list:shaky.join(', ')}):'')
  :t('trust.bad',{year:year,days:days})}}
function yearTrustLine(){let tr=yearTrust();
 return tr?`<p class="trust year-trust tone-${tr.ok?'good':'watch'}" data-role="year-trust">${esc(tr.text)}</p>`:''}

function storyChange(){
 let data=STORY_METRICS.map(m=>({m,h:storyHorizons(m)})).filter(x=>x.h.base),
     parts=STORY_METRICS.map(m=>({m,p:storyHorizons(m).partial})).filter(x=>x.p),
     py=parts.length?parts[0].p:null;
 if(!data.length)return `<section class="panel"><h1>${esc(t('change.title'))}</h1>
  <p class="chart-note">${esc(t('change.noFullYears'))}</p></section>`;
 return `<section class="panel"><h1>${esc(t('change.title'))}</h1>
  ${yearTrustLine()}
  <p class="chart-note">${esc(t('change.horizons'))}</p>
  <div class="tablewrap"><table class="change"><thead><tr><th>${esc(t('change.col.metric'))}</th><th>${esc(t('change.col.last'))}</th><th>${esc(t('change.col.prev'))}</th><th>${esc(t('change.col.first'))}</th><th>${esc(t('change.col.median'))}</th></tr></thead><tbody>
  ${data.map(({m,h})=>`<tr><th scope="row">${esc(t(NORMS[m].label))}${h.sparseBasis?'<div class="sparse-flag">'+esc(t('change.sparseAll'))+'</div>':''}</th>
   <td><div class="delta">${esc(fmt(h.base.value,DEC[m]))} ${esc(unitFor(m,h.base.value))}</div><div class="delta-word">${esc(t('norms.year',{year:h.base.year}))}</div></td>
   ${deltaCell(m,h.prev)}${deltaCell(m,h.first)}${deltaCell(m,h.median)}</tr>`).join('')}
  </tbody></table></div>
  ${py?`<div class="partial"><b>${esc(t('change.running',{year:py.year}))}</b> ${esc(t('change.runningNote',{n:py.archiveMonths,word:tPlural(py.archiveMonths,'plural.month')}))}
   <ul>${parts.map(({m,p})=>`<li>${esc(t(NORMS[m].label))}: ${esc(fmt(p.value,DEC[m]))} ${esc(unitFor(m,p.value))}</li>`).join('')}</ul></div>`:''}
 </section>`}

// ——— Источники ———————————————————————————————————————————————————————————————
const GROUP_TITLE={steps:'norm.steps.label',exercise_min:'norm.exercise_min.label',workouts:'group.workouts',
 resting_hr:'norm.resting_hr.label',vo2max:'norm.vo2max.label',sleep_hours:'norm.sleep_hours.label'};
// Точку ставит тот, у кого её ещё нет: «Paluch и соавт.» уже кончается точкой,
// и в списке источников выходило «Paluch и соавт..».
const endDot=x=>String(x).endsWith('.')?'':'.';
function storySources(){
 let groups={};
 for(const [id,s] of Object.entries(SOURCES))(groups[s.group]??=[]).push([id,s]);
 return `<section class="panel sources"><h1>${esc(t('src.title'))}</h1>
  <p class="chart-note">${esc(t('src.note'))}</p>
  ${Object.keys(GROUP_TITLE).filter(g=>groups[g]).map(g=>`<h2>${esc(t(GROUP_TITLE[g]))}</h2>
   <ol class="srclist">${groups[g].map(([id,s])=>`<li id="src-${esc(id)}" value="${SOURCE_NO[id]}">
    <b>${esc(srcText(s.org))}</b>${endDot(srcText(s.org))} ${esc(s.title)}${endDot(s.title)}${s.where?' '+esc(s.where)+endDot(s.where):''} ${esc(srcText(s.year))}.
    <a href="${esc(s.url)}" rel="noopener noreferrer" target="_blank">${esc(s.url)}</a>
    <span class="checked">${esc(t('src.checked',{date:s.checked}))}</span></li>`).join('')}</ol>`).join('')}
  <h2>${esc(t('noise.title'))}</h2>
  <p class="chart-note">${esc(t('noise.note'))}</p>
  <ul class="srcnote">${Object.entries(NOISE_NOTE).map(([m,x])=>`<li><b>${esc(NORMS[m]?t(NORMS[m].label):m)}</b>: ${esc(t(x.text))} — ${esc(t(x.own))}${x.src.length?' '+refs(x.src):''}</li>`).join('')}</ul>
  <p class="disclaimer">${esc(t('src.disclaimer'))}</p>
  <p class="disclaimer">${esc(t('src.stepsNoNorm'))}</p>
 </section>`}

// ——— График, факты, стена лет, часы спорта —————————————————————————————————
// Тренд по редким годам считается так же, как горизонты: лучше сказать «на шатких данных»,
// чем не сказать ничего.
function storyTrend(metric){
 let tr=trendVerdict(metric);
 if(tr.verdict!=='few')return tr;
 let s=trendVerdict(metric,true);
 if(s.verdict!=='few')s.sparseBasis=true;
 return s}

function storyMetricNow(){
 let opts=STORY_METRICS.filter(m=>storyRows(m).some(r=>r.value!==null&&n(r.observed_days)>0)),
     cur=opts.includes(state.storyMetric)?state.storyMetric:(opts[0]||'steps');
 state.storyMetric=cur;
 return {cur,opts}}

// Сезонность называется вслух: иначе зимняя яма читается как срыв, а не как январь.
function seasonNote(metric){
 let rows=storyRows(metric).filter(r=>safeDate(r.month)&&r.value!==null&&n(r.observed_days)>0);
 if(rows.length<24)return null;
 let isSum=expectedAgg(metric)==='sum',
     bucket=ms=>{let sel=rows.filter(r=>ms.includes(Number(r.month.slice(5,7)))),
      d=sel.reduce((s,r)=>s+n(r.observed_days),0);
      return d?(isSum?sel.reduce((s,r)=>s+n(r.value),0)/d
                     :sel.reduce((s,r)=>s+n(r.value)*n(r.observed_days),0)/d):null},
     su=bucket([6,7,8]),wi=bucket([12,1,2]);
 if(su==null||wi==null)return null;
 let d=su-wi;
 if(Math.abs(d)<(NOISE[metric]??0))return t('season.none');
 return d>0?t('season.summerUp'):t('season.winterUp')}

function chartNotes(metric){
 let all=yearly(metric),got=all.filter(y=>y.value!==null),notes=[];
 let se=seasonNote(metric);if(se)notes.push(se);
 // «Больше всего» не может достаться году, который ещё идёт: восемь месяцев против
 // двенадцати — это не рекорд, а обрезанная выборка.
 let ranked=got.filter(y=>y.status!=='partial');
 if(ranked.length>1){let lo=ranked.reduce((a,b)=>b.value<a.value?b:a),hi=ranked.reduce((a,b)=>b.value>a.value?b:a);
  notes.push(t('note.lowHigh',{low:lo.year,high:hi.year}))}
 let sparse=all.filter(y=>y.status==='sparse');
 if(sparse.length)notes.push(t('note.sparseYears',{years:sparse.map(y=>y.year).join(', '),word:tPlural(sparse.length,'plural.yearIn')}));
 let part=all.find(y=>y.status==='partial');
 if(part)notes.push(t('note.partial',{year:part.year}));
 let first=got[0],firstArch=storyYears()[0];
 if(first&&firstArch&&Number(first.year)>Number(firstArch))
  notes.push(t('note.startsAt',{year:first.year}));
 return notes.slice(0,5)}

function storyChart(){
 let {cur,opts}=storyMetricNow();
 if(!opts.length)return `<section class="panel"><h1>${esc(t('bigrow.title'))}</h1>
  <p class="chart-note">${esc(t('bigrow.none'))}</p></section>`;
 // По вертикали — среднее на день с записью, а не сумма за месяц. Иначе февраль всегда
 // ниже января, а месяц с пропусками читается как спад. Так же считается весь раздел.
 let isSum=expectedAgg(cur)==='sum',
     rows=storyRows(cur).filter(r=>safeDate(r.month)).map(r=>
      r.value===null||!(n(r.observed_days)>0)?{...r,value:null}
      :isSum?{...r,value:n(r.value)/n(r.observed_days)}:r),
     lbl=NORMS[cur]?t(NORMS[cur].label):cur;
 return `<section class="panel"><div class="sectionhead"><h1>${esc(t('bigrow.title'))}</h1></div>
  <div class="chipbar">${opts.map(m=>`<button class="mchip${m===cur?' active':''}" data-ui="storyMetric" data-metric="${esc(m)}" aria-pressed="${m===cur}">${esc(NORMS[m]?t(NORMS[m].label):m)}</button>`).join('')}</div>
  ${chart(rows,lbl,STORY_UNIT[cur]?t(STORY_UNIT[cur]):'',{key:'story',metric:cur})}
  <p class="chart-note">${esc(t('bigrow.axisNote',{unit:STORY_UNIT[cur]?t(STORY_UNIT[cur]):t('bigrow.value')}))}</p>
  <ul class="notes">${chartNotes(cur).map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
  <p class="chart-note">${esc(t('bigrow.gapNote'))}</p></section>`}

// ——— Интересно ———————————————————————————————————————————————————————————————
// Слово «лучший» здесь не употребляется: это раннее решение заказчика, и оно осталось в силе
// даже после того, как остальные запреты сняли.
function storyFactList(){
 let out=[],st=yearly('steps').filter(y=>y.value!==null&&y.status!=='partial');
 if(st.length>1){let lo=st.reduce((a,b)=>b.value<a.value?b:a),hi=st.reduce((a,b)=>b.value>a.value?b:a);
  out.push(t('fact.quietBusy',{quiet:lo.year,busy:hi.year}))}
 if(st.length>2){let best=1,run=1,from=st[0].year,bestFrom=st[0].year;
  for(let i=1;i<st.length;i++){
   if(st[i].value-st[i-1].value>-(NOISE.steps)){run++;if(run>best){best=run;bestFrom=from}}
   else{run=1;from=st[i].year}}
  if(best>=3)out.push(t('fact.streak',{n:best,word:tPlural(best,'plural.year'),from:bestFrom}))}
 let late=lateStarters();
 if(late.length){let m=late[0],f=firstYearWithData(m),e=storyYears()[0];
  out.push(t('fact.lateStart',{what:NORMS[m]?t(NORMS[m].label):m,n:Number(f)-Number(e),word:tPlural(Number(f)-Number(e),'plural.year')}))}
 // Год, где один показатель просел, а другой нет: это и есть «2020 сломал только упражнения».
 outer: for(const year of storyYears()){
  for(const a of STORY_METRICS)for(const b of STORY_METRICS){
   if(a===b)continue;
   let ya=yearly(a),yb=yearly(b),
       ia=ya.findIndex(y=>y.year===year),ib=yb.findIndex(y=>y.year===year);
   if(ia<1||ib<1)continue;
   let pa=ya[ia-1],pb=yb[ib-1];
   if(pa.value==null||ya[ia].value==null||pb.value==null||yb[ib].value==null)continue;
   if(ya[ia].status==='partial'||yb[ib].status==='partial')continue;
   let da=ya[ia].value-pa.value,db=yb[ib].value-pb.value;
   if(da<-NOISE[a]&&Math.abs(db)<NOISE[b]){
    out.push(t('fact.unevenYear',{year:year,fell:t(NORMS[a].label).toLowerCase(),held:t(NORMS[b].label).toLowerCase()}));
    break outer}}}
 let dv=archDir('vo2max'),dh=archDir('resting_hr');
 if(dv&&dh){
  if(dv==='up'&&dh==='up')out.push(t('fact.bothUp'));
  else if(dv==='up'&&dh==='down')out.push(t('fact.agreeGood'));
  else if(dv==='down'&&dh==='up')out.push(t('fact.agreeWatch'));}
 // Перевод числа в образ. Коэффициент приблизительный, и на экране он назван.
 let total=yearly('steps').reduce((s,y)=>s+(y.total||0),0);
 if(total>0)out.push(t('fact.kilometres',{km:fmt(total*0.75/1000,0)}));
 return out.slice(0,5)}

function storyFacts(){
 let f=storyFactList();
 if(!f.length)return '';
 return `<section class="panel"><h1>${esc(t('facts.title'))}</h1>
  <ul class="facts">${f.map(x=>`<li data-role="fact">${esc(x)}</li>`).join('')}</ul></section>`}

// ——— Стена лет ———————————————————————————————————————————————————————————————
// Шкала общая внутри строки: видно, как год стоит относительно других ваших лет, а не
// относительно чужой нормы. Между строками столбики не сравниваются — об этом сказано.
function wallRow(label,verdict,tone,cells,note){
 return `<div class="wall-row"><div class="wall-label"><b>${esc(label)}</b>`+
  (verdict?`<span class="verdict tone-${esc(tone)}" data-role="wall-verdict">${esc(verdict)}</span>`:'')+
  (note?`<span class="wall-note">${esc(note)}</span>`:'')+`</div>`+
  `<div class="wall-cells">${cells.map(c=>`<div class="wall-cell${c.anchor?' wall-anchor':''}" data-role="wall-cell" data-status="${esc(c.status)}" data-year="${esc(c.year)}" title="${esc(c.title)}">`+
   `<div class="wall-slot">${c.pct==null?'':`<div class="wall-bar tone-${esc(c.tone||'neutral')}" data-role="wall-bar" style="height:${c.pct.toFixed(1)}%"></div>`}</div>`+
   `<div class="wall-year">${esc(c.year)}</div></div>`).join('')}</div></div>`}

function wallCells(years,unit,fromZero){
 let got=years.filter(y=>y.value!==null),
     lo=fromZero?0:(got.length?Math.min(...got.map(y=>y.value)):0),
     hi=got.length?Math.max(...got.map(y=>y.value)):1,
     span=hi-lo||Math.abs(hi)||1,
     full=years.filter(y=>y.status==='full');
 let anchors=new Set([full[0]&&full[0].year,full.at(-1)&&full.at(-1).year].filter(Boolean));
 return years.map(y=>({year:y.year,status:y.status,
  anchor:anchors.has(y.year),
  tone:y.status==='sparse'?'watch':'neutral',
  pct:y.value===null?null:(fromZero?Math.max(1,(y.value-lo)/span*100):12+(y.value-lo)/span*88),
  title:y.value===null?t('wall.cellNone',{year:y.year})
   :t('wall.cell',{year:y.year,value:fmt(y.value,2),unit:unit})+(y.status==='sparse'?' · '+t('status.sparse'):'')+(y.status==='partial'?' · '+t('status.partial'):'')}))}

function storyWall(){
 let list=STORY_METRICS.filter(m=>storyRows(m).some(r=>r.value!==null));
 if(!list.length)return '';
 return `<section class="panel" data-role="wall"><h1>${esc(t('wall.title'))}</h1>
  <p class="chart-note">${esc(t('wall.note'))}</p>
  <div class="wall">${list.map(m=>{
   let ys=yearly(m),tr=storyTrend(m),
       gaps=ys.filter(y=>y.status==='none').map(y=>y.year),
       note=gaps.length?t('wall.noRecords',{years:gaps.length>2?gaps[0]+'—'+gaps.at(-1):gaps.join(', ')}):'';
   return wallRow(t(NORMS[m].label),t('verdict.'+tr.verdict)+(tr.sparseBasis?' '+t('wall.shakyBasis'):''),tr.tone,
    wallCells(ys,metricUnit(m)),note)}).join('')}</div>
  </section>`}

// ——— Часы спорта —————————————————————————————————————————————————————————————
const workoutName=niceWorkout;
function lastCompleteYear(){let part=partialYears();
 return storyYears().filter(y=>!part.has(y)).at(-1)||null}

function storyWorkouts(){
 let ws=workoutMetrics();
 if(!ws.length)return '';
 let last=lastCompleteYear(),part=[...partialYears()].sort().at(-1);
 let rows=ws.map(m=>({m,ys:yearly(m)})).filter(x=>x.ys.some(y=>y.total));
 if(!rows.length)return '';
 let table=rows.map(({m,ys})=>{
  let y=ys.find(z=>z.year===last),kind=WORKOUT_NORM.kind[m.replace('workout_','')]||'moderate',
      norm=WORKOUT_NORM[kind],wk=y&&y.total?weeklyMinutes(y.total,last):null,
      z=wk==null?null:wk<norm.low?t('zone.ex.below'):wk<=norm.high?t('zone.ex.in'):t('workout.aboveRec');
  return {m,kind,norm,wk,hours:y&&y.total?y.total/60:null,z}});
 let pt=part?rows.map(({m,ys})=>{let y=ys.find(z=>z.year===part);
  return {m,wk:y&&y.total?weeklyMinutes(y.total,part):null}}).filter(x=>x.wk!=null):[];
 return `<section class="panel workouts" data-role="workouts"><h1>${esc(t('workouts.title'))}</h1>
  <p class="chart-note">${esc(t('workouts.note'))}</p>
  <div class="wall">${rows.map(({m,ys})=>wallRow(workoutName(m),'', 'neutral',
    wallCells(ys.map(y=>({...y,value:y.total===null||!y.total?null:y.total/60})),t('unit.hours'),true),'')).join('')}</div>
  ${last?`<div class="tablewrap"><table><caption>${esc(t('workouts.caption',{year:last}))}</caption>
   <thead><tr><th>${esc(t('workouts.col.kind'))}</th><th>${esc(t('workouts.col.hours'))}</th><th>${esc(t('workouts.col.weekly'))}</th><th>${esc(t('workouts.col.rec'))}</th><th>${esc(t('workouts.col.alone'))}</th></tr></thead><tbody>
   ${table.map(row=>`<tr><th scope="row">${esc(workoutName(row.m))}</th>
    <td>${row.hours==null?'—':esc(fmt(row.hours,1))}</td>
    <td>${row.wk==null?'—':esc(fmt(row.wk,0))}</td>
    <td>${esc(row.norm.low)}–${esc(row.norm.high)} ${esc(t('unit.minPerWeek'))} · ${esc(t(row.norm.label))} ${refs(row.norm.src)}</td>
    <td>${row.z?esc(row.z):'—'}</td></tr>`).join('')}
   </tbody></table></div>`:''}
  ${pt.length?`<p class="partial"><b>${esc(t('workouts.running',{year:part}))}</b> ${esc(t('workouts.runningNote'))} ${pt.map(x=>`${esc(workoutName(x.m))} — ${esc(fmt(x.wk,0))} ${esc(t('unit.minPerWeek'))}`).join('; ')}.</p>`:''}
  <p class="chart-note">${esc(t('workouts.recNote'))} ${esc(t(WORKOUT_NORM.noSum))} ${esc(t('workouts.cyclingNote'))} ${refs(['cdc2023','who2020'])}</p>
 </section>`}

function storyTab(){
 return [storyCover(),storyGlossary(),storyChange(),storyNorms(),
  storyChart(),storyFacts(),storyWall(),storyWorkouts(),storySources()].join('')}

// Шов раздела: браузерные проверки держатся за него, а не за разметку.
const STORY={yearly,yearStatus,horizons,trendVerdict,weeklyMinutes,fullYears,partialYears,
 storyRows,sleepIsWindows,compareTo,percentileBand,bands,zone,weeklyFromDaily,
 coverChips,storyWhoNote,yearTrust,storyTrend,seasonNote,chartNotes,storyFactList,wallCells,hrCategory,storyHorizons,unitFor,ruler,refs,normBlock,storyChange,storySources,SOURCE_NO,archDir,rankAmongYears,storyAge,ageInYear,STORY_UNIT,
 NOISE,POLE,STATUS_WORD,STORY_METRICS,SOURCES,NORMS,WORKOUT_NORM,NOISE_NOTE,CHECKED};
