// Данные встраиваются сборщиком: своей выгрузкой или демонстрационным набором.
const EMBEDDED_MAIN = /*__MAIN_DATA__*/; const EMBEDDED_SLEEP = /*__SLEEP_DATA__*/;
const known={steps:['Шаги','шаги','sum'],exercise_min:['Упражнения','мин','sum'],walk_run_km:['Ходьба и бег','км','sum'],cycling_km:['Вело-дистанция','км','sum'],swimming_km:['Плавание','км','sum'],active_kcal:['Активные калории','ккал','sum'],resting_hr:['Пульс покоя','уд/мин','mean'],vo2max:['VO₂max','мл/кг/мин','mean'],sleep_hours:['Календарный сон','ч','mean']};
let state={main:EMBEDDED_MAIN,sleep:EMBEDDED_SLEEP,chartKind:{},smooth:{},sleepMode:'window',isDemo:/*__IS_DEMO__*/,imported:false,fromArchive:false,tab:'story',metric:'steps',detail:null,notes:[]};
const $=s=>document.querySelector(s), app=$('#app'); const monthName=m=>/^\d{4}$/.test(m)?m:new Date(m+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'short',year:'numeric'}); const n=v=>Number(v); const fmt=(v,d=0)=>v==null?'—':new Intl.NumberFormat('ru-RU',{maximumFractionDigits:d,minimumFractionDigits:d}).format(v);
// Every value from a data file goes through esc() before it reaches innerHTML.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); const monthIdx=m=>/^\d{4}$/.test(m)?Number(m)*12:Number(m.slice(0,4))*12+Number(m.slice(5,7))-1; const idxToMonth=i=>Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'); const daysIn=m=>new Date(Number(m.slice(0,4)),Number(m.slice(5,7)),0).getDate();
function safeDate(x){return /^\d{4}-(0[1-9]|1[0-2])$/.test(x)} function months(){return [...new Set(state.main.monthly.filter(x=>safeDate(x.month)).map(x=>x.month))].sort()} function metricRows(metric){return state.main.monthly.filter(x=>x.metric===metric&&safeDate(x.month))} function activeMetrics(){return Object.keys(known).filter(k=>metricRows(k).length)}
// Validation messages name the row and field only, never file contents.
class InputError extends Error{}
const isNum=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0, isCount=v=>Number.isInteger(v)&&v>=0, countMap=o=>!!o&&typeof o==='object'&&!Array.isArray(o)&&Object.values(o).every(isCount), safeMetric=m=>typeof m==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(m);
const STAGE_ROWS=[['sleep_deep_hours','глубокий','deep'],['sleep_core_hours','лёгкий','core'],['sleep_rem_hours','REM','rem'],['sleep_unspecified_hours','без стадии','unspec']];
function expectedAgg(m){if(known[m])return known[m][2]==='sum'?'sum':'mean_observed_days';if(STAGE_ROWS.some(s=>s[0]===m))return 'mean_observed_days';return /^workout_[A-Za-z0-9_]+$/.test(m)?'sum':null}
function validateMain(o){if(!o||typeof o!=='object'||!Array.isArray(o.monthly)||!o.sources||typeof o.sources!=='object'||Array.isArray(o.sources))throw new InputError('Файл не похож на основную месячную сводку.');if(o.gaps!=null&&!Array.isArray(o.gaps))throw new InputError('Поле gaps должно быть массивом.');let seen=new Set,unknown=new Set,kept=[];o.monthly.forEach((r,i)=>{const bad=f=>{throw new InputError(`Основной файл, monthly[${i}]: некорректное поле ${f}.`)};if(!r||typeof r!=='object')bad('строки');if(!safeMetric(r.metric))bad('metric');if(!safeDate(r.month))bad('month');let want=expectedAgg(r.metric);if(!want){unknown.add(r.metric);return}if(r.aggregation!==want)bad('aggregation');if(!isCount(r.calendar_days)||r.calendar_days!==daysIn(r.month))bad('calendar_days');if(!isCount(r.observed_days)||r.observed_days>r.calendar_days)bad('observed_days');if(r.value===undefined)r.value=null;if(r.value!==null&&!isNum(r.value))bad('value');if(r.value!==null&&r.observed_days<1)bad('observed_days');for(const f of ['overlap_days','multi_source_days','multi_watch_source_days','clean_observed_days'])if(r[f]!=null&&!isCount(r[f]))bad(f);for(const f of ['mean_observed_day','median_observed_day','clean_mean_observed_day'])if(r[f]!=null&&!isNum(r[f]))bad(f);for(const f of ['selected_sources','selected_categories'])if(r[f]!=null&&!countMap(r[f]))bad(f);let key=r.metric+'|'+r.month;if(seen.has(key))bad('metric/month (повтор)');seen.add(key);kept.push(r)});o.monthly=kept;return unknown.size?`Пропущены строки неизвестных показателей: ${[...unknown].slice(0,5).join(', ')}${unknown.size>5?'…':''}.`:''}
function validateSleep(o){if(!o||typeof o!=='object'||!Array.isArray(o.monthly)||typeof o.definition!=='string')throw new InputError('Файл не похож на сводку окон сна.');let seen=new Set;o.monthly.forEach((r,i)=>{const bad=f=>{throw new InputError(`Файл сна, monthly[${i}]: некорректное поле ${f}.`)};if(!r||typeof r!=='object')bad('строки');if(!safeDate(r.month))bad('month');if(seen.has(r.month))bad('month (повтор)');seen.add(r.month);if(!isCount(r.observed_windows)||r.observed_windows<1||r.observed_windows>daysIn(r.month))bad('observed_windows');if(!isNum(r.mean_hours)||r.mean_hours>24)bad('mean_hours');if(r.median_hours!=null&&(!isNum(r.median_hours)||r.median_hours>24))bad('median_hours');for(const f of ['multi_source_windows','conflicting_awake_windows','shorter_than_3h_windows'])if(r[f]!=null&&(!isCount(r[f])||r[f]>r.observed_windows))bad(f);if(r.selected_sources!=null&&!countMap(r.selected_sources))bad('selected_sources')})}
function initControls(){let ms=months(), from=$('#from'),to=$('#to'),oldF=from.value,oldT=to.value;from.replaceChildren(...ms.map(m=>new Option(monthName(m),m)));to.replaceChildren(...ms.map(m=>new Option(monthName(m),m)));from.value=ms.includes(oldF)?oldF:ms[0];to.value=ms.includes(oldT)?oldT:ms.at(-1);$('#periodTitle').textContent=(state.isDemo?'Демонстрационные данные · ':'')+`Период: ${monthName(from.value)} — ${monthName(to.value)}`}
function range(){let a=$('#from').value,b=$('#to').value;if(a>b){show('Начало периода не может быть позже конца.',true);return null}return[a,b]}
// Уведомления. Свой движок, а не библиотека: страница собирается в один файл и по CSP
// не имеет права загрузить ни строки извне. Текст всегда ставится через textContent:
// сообщение может цитировать имя источника из чужого файла и обязано остаться текстом.
const TOAST_LIFE={ok:7000,info:9000,error:0}; let rendering=false;
function notify(text,kind='ok'){
 let box=$('#alert'); if(!box)return null;
 let scope=rendering?'render':'user', last=box.lastElementChild;
 // Повтор того же сообщения продлевает его, а не громоздит второе такое же.
 if(last&&last.dataset.text===String(text)&&last.dataset.kind===kind){restartLife(last);return last}
 let item=document.createElement('div');
 item.className='toast toast-'+kind; item.dataset.role='toast'; item.dataset.scope=scope;
 item.dataset.kind=kind; item.dataset.text=String(text);
 if(kind==='error')item.setAttribute('role','alert');
 let dot=document.createElement('i'); dot.className='toast-dot'; dot.setAttribute('aria-hidden','true');
 let body=document.createElement('p'); body.className='toast-text'; body.textContent=text;
 let close=document.createElement('button');
 close.type='button'; close.className='toast-close'; close.dataset.role='toast-close';
 close.setAttribute('aria-label','Закрыть сообщение'); close.textContent='\u00d7';
 close.onclick=()=>item.remove();
 item.append(dot,body,close); box.append(item);
 while(box.children.length>3)box.firstElementChild.remove();
 restartLife(item);
 return item;
}
// Ошибка висит, пока её не закроют: её могли не успеть прочитать, а причина не исчезла.
function restartLife(item){
 if(item._life)clearTimeout(item._life);
 let life=TOAST_LIFE[item.dataset.kind];
 if(life)item._life=setTimeout(()=>item.remove(),life);
}
function show(text,bad=false){notify(text,bad?'error':'ok')}
function dropToasts(all){
 let box=$('#alert'); if(!box)return;
 for(const item of [...box.children])if(all||item.dataset.scope==='render')item.remove();
}
// Перерисовка снимает только то, что сама же и сказала о текущем экране;
// сообщение о прочитанном архиве переключением вкладки не сбивается.
function clearAlert(){dropToasts(false)} function annualize(rows){let g={};rows.forEach(r=>(g[r.month.slice(0,4)]??=[]).push(r));return Object.entries(g).map(([year,a])=>{let v=a.filter(r=>r.value!==null);if(!v.length)return{...a[0],month:year,value:null};let days=v.reduce((s,r)=>s+n(r.observed_days),0);return {...a[0],month:year,value:v[0].aggregation==='sum'?v.reduce((s,r)=>s+n(r.value),0):v.reduce((s,r)=>s+n(r.value)*n(r.observed_days),0)/days,observed_days:days,calendar_days:v.reduce((s,r)=>s+n(r.calendar_days),0)}})} function passesCoverage(metric,x,cutoff){if(!cutoff)return true;if(metric==='vo2max')return n(x.observed_days)>=3;if(metric.startsWith('workout_')||['cycling_km','swimming_km','sleep_windows'].includes(metric))return true;return n(x.observed_days)/n(x.calendar_days)>=cutoff} function rangeRows(metric){let r=range();if(!r)return[];let cutoff=Number($('#coverage').value);return metricRows(metric).filter(x=>x.month>=r[0]&&x.month<=r[1]&&passesCoverage(metric,x,cutoff))} function filtered(metric){let rows=rangeRows(metric);return $('#scale').value==='year'?annualize(rows):rows}
function periodValue(rows,metric){let valid=rows.filter(x=>x.value!==null&&Number.isFinite(n(x.value)));if(!valid.length)return null;let agg=valid[0].aggregation;if(agg==='sum'){let total=valid.reduce((s,x)=>s+n(x.value),0),days=valid.reduce((s,x)=>s+n(x.observed_days),0);return{primary:total,secondary:days?total/days:null,mode:'сумма периода; среднее на наблюдаемый день'}}let days=valid.reduce((s,x)=>s+n(x.observed_days),0);return{primary:days?valid.reduce((s,x)=>s+n(x.value)*n(x.observed_days),0)/days:null,secondary:days,mode:'взвешено по наблюдаемым дням'}}
// Карточки над графиком: среднее за период и крайние месяцы, чтобы число было видно без наведения на график.
// «Единица записи» — день для календарных рядов и окно для оконного сна; подпись передаётся снаружи.
function statCards(rows,unit,rec){let p=periodValue(rows),valid=rows.filter(x=>x.value!==null&&Number.isFinite(n(x.value)));if(!p||!valid.length)return '';let lo=valid.reduce((a,x)=>n(x.value)<n(a.value)?x:a),hi=valid.reduce((a,x)=>n(x.value)>n(a.value)?x:a),card=(l,v,sub)=>`<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`;return `<div class="grid">${card('Среднее за период',fmt(p.primary,1)+' '+esc(unit),'взвешено по '+esc(rec.by))}${card('Самый низкий месяц',fmt(n(lo.value),1)+' '+esc(unit),esc(monthName(lo.month)))}${card('Самый высокий месяц',fmt(n(hi.value),1)+' '+esc(unit),esc(monthName(hi.month)))}${card(esc(rec.count),fmt(p.secondary,0),valid.length+' '+plural(valid.length,'месяц','месяца','месяцев')+' с записью')}</div>`}
// X is the calendar position, not the row index: absent or filtered months leave a gap and break the line.
// Холст фиксированный, а на экране график тянется на ширину карточки: viewBox задаёт
// пропорцию, CSS — ширину. Раньше viewBox был узким, а высота жёсткой, и браузер
// вписывал маленький рисунок в середину пустой карточки.
// Подпись месяца на оси — в привычном здесь порядке: месяц, точка, год. Внутри
// программы месяц всегда YYYY-MM, наружу он выходит только через эту функцию.
const axisMonth=ix=>{let [y,m]=idxToMonth(ix).split('-');return m+'.'+y};
const CHART_W=1200,CHART_H=400,CHART_PAD={l:104,r:26,t:24,b:66};
// Пульс покоя по умолчанию столбиками: месячное среднее — это оценка за месяц,
// а не точка на непрерывной кривой, и столбик врёт об этом меньше линии.
const CHART_KIND_DEFAULT={resting_hr:'bar'};
function chartKind(key,metric){
 if(key&&state.chartKind&&state.chartKind[key])return state.chartKind[key];
 return CHART_KIND_DEFAULT[metric]||'line'}
// Переключатель стоит под графиком справа снизу: он про подачу, а не про данные,
// и не должен перебивать заголовок раздела.
function chartToggle(key,kind,metric,annual){
 if(!key)return '';
 let win=smoothMode(key),note=win===3?'Сглаживание: взвешенное среднее текущего и двух предыдущих календарных месяцев; точка есть только при наличии всех трёх.':win===12?'Сглаживание: среднее текущего и одиннадцати предыдущих календарных месяцев; точка есть при девяти и более месяцах с записью.':'';
 return `<div class="chart-foot">${trendCaption(metric)}<label class="chart-type">Сглаживание <select data-smooth-key="${esc(key)}" ${annual?'disabled':''}>`+
  `<option value="0" ${win?'':'selected'}>Нет</option>`+
  `<option value="3" ${win===3?'selected':''}>3 месяца</option>`+
  `<option value="12" ${win===12?'selected':''}>12 месяцев</option></select></label>`+
  `<label class="chart-type">Вид графика <select data-chart-kind="${esc(key)}">`+
  `<option value="line" ${kind==='bar'?'':'selected'}>Линии</option>`+
  `<option value="bar" ${kind==='bar'?'selected':''}>Столбики</option></select></label></div>`+
  (note&&!annual?`<p class="chart-note">${note}</p>`:'')}
// Тренд словами, а не линией: прямая поверх сезонного ряда врёт, а вердикт по полным годам
// уже посчитан для «Главного» и здесь повторяет его слово в слово.
function trendCaption(metric){
 if(!metric||typeof storyTrend!=='function'||!(metric in NOISE))return '';
 let v=storyTrend(metric),text=v.verdict==='данных мало'?'данных мало: меньше трёх полных лет':v.dir==='flat'?'ровно, сдвиг меньше порога шума':v.dir==='up'?'растёт':'снижается';
 return `<span class="chart-trend">Тренд по полным годам всего архива: <b>${esc(text)}</b>${v.sparseBasis?' (по годам, где записей мало)':''}</span>`}
function chartLegend(label,unit){
 return `<p class="chart-legend"><span><i class="sw-line"></i>${esc(label)}${unit?', '+esc(unit):''}</span></p>`}
function chart(rows,label,unit,opts){
 opts=opts||{};let key=opts.key||'',kind=chartKind(key,opts.metric);
 rows=rows.filter(x=>safeDate(x.month)||/^\d{4}$/.test(x.month)).sort((a,b)=>monthIdx(a.month)-monthIdx(b.month));
 let annual=rows.every(r=>/^\d{4}$/.test(r.month)),win=annual?0:smoothMode(key);
 if(win)rows=smoothRowsN(rows,win);
 let pts=rows.filter(x=>x.value!==null&&Number.isFinite(n(x.value)));
 if(!pts.length)return '<p class="chart-note">'+(win?'Сглаженной линии нет: в периоде мало подряд идущих месяцев с записью. Выберите «без сглаживания».':'Нет данных в выбранном периоде.')+'</p>'+chartToggle(key,kind,opts.metric,annual);
 let step=annual?12:1,i0=monthIdx(rows[0].month),
     slots=(monthIdx(rows.at(-1).month)-i0)/step+1,w=CHART_W,h=CHART_H,p=CHART_PAD,
     vals=pts.map(x=>n(x.value)),min=Math.min(...vals,0),max=Math.max(...vals,1),span=max-min||1,
     plot=w-p.l-p.r,slot=plot/Math.max(slots-1,1),
     x=ix=>p.l+(ix-i0)/step*slot,y=v=>h-p.b-(v-min)*(h-p.t-p.b)/span;
 // Точки и столбики ужимаются под плотность ряда: десять лет по месяцам — это 127 клеток
 // на ту же ширину, и точка прежнего радиуса слиплась бы с соседней в сплошную полосу.
 let r=Math.max(1.6,Math.min(4,slot*.34)),bw=Math.max(1.5,Math.min(34,slot*.7));
 let body='';
 if(kind==='bar'){
  body=pts.map(row=>{let v=n(row.value),top=y(v),base=y(min);
   return `<rect class="bar" data-role="bar" tabindex="0" role="button" aria-label="${esc(row.month)}: ${fmt(v,2)} ${esc(unit)}"`+
    ` x="${(x(monthIdx(row.month))-bw/2).toFixed(1)}" y="${Math.min(top,base).toFixed(1)}" width="${bw.toFixed(1)}"`+
    ` height="${Math.max(1,Math.abs(base-top)).toFixed(1)}" data-month="${esc(row.month)}"></rect>`}).join('')}
 else{
  let d='',prev=null;
  for(const row of pts){let ix=monthIdx(row.month);d+=(prev!==null&&ix-prev===step?'L':'M')+x(ix).toFixed(1)+','+y(n(row.value)).toFixed(1);prev=ix}
  let dots=pts.map(row=>`<circle class="dot" data-role="dot" tabindex="0" role="button" aria-label="${esc(row.month)}: ${fmt(n(row.value),2)} ${esc(unit)}" cx="${x(monthIdx(row.month)).toFixed(1)}" cy="${y(n(row.value)).toFixed(1)}" r="${r.toFixed(1)}" data-month="${esc(row.month)}"></circle>`).join('');
  body=`<path class="line" data-role="line" d="${d}"/>${dots}`}
 let ticks=[min,min+span/2,max].map(v=>`<g><line class="gridline" x1="${p.l}" x2="${w-p.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${p.l-10}" y="${y(v)+4}" text-anchor="end">${fmt(v,1)}</text></g>`).join('');
 let every=Math.ceil(slots/10),
     labs=Array.from({length:slots},(_,k)=>k===0||k===slots-1||k%every===0?`<text class="axis" x="${x(i0+k*step).toFixed(1)}" y="${h-p.b+22}" text-anchor="middle">${annual?(i0+k*step)/12:axisMonth(i0+k*step)}</text>`:'').join('');
 // Оси подписаны всегда: без единицы по вертикали и без «месяцев» по горизонтали
 // график читается как картинка, а не как измерение.
 let axisY=`<text class="axis-title" transform="translate(18,${(p.t+h-p.b)/2}) rotate(-90)" text-anchor="middle">${esc(unit||label)}</text>`,
     axisX=`<text class="axis-title" x="${p.l+plot/2}" y="${h-10}" text-anchor="middle">${annual?'Годы':'Месяцы (месяц.год)'}</text>`;
 return chartLegend(label,unit)+
  `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="График: ${esc(label)}">${ticks}${body}${labs}${axisY}${axisX}</svg></div>`+
  chartToggle(key,kind,opts.metric,annual)}
function detail(month,metric){let r=metricRows(metric).find(x=>x.month===month);if(!r)return'';let by={};Object.entries(r.selected_sources||{}).forEach(([s,c])=>{let kind=String(state.main.sources?.[s]||'').split(';')[0],name=kind==='Apple Watch'?'часы':kind==='iPhone'?'телефон':'другой источник';by[name]=(by[name]||0)+n(c)});let sources=Object.entries(by).map(([k,c])=>`${esc(k)} — ${fmt(c,0)} дн.`).join(', ')||'нет сведений';return `<div class="detail"><b>${esc(monthName(month))} · ${esc(metricLabel(metric))}</b><br>${r.value===null?'Нет данных':`${fmt(n(r.value),2)} ${esc(known[metric]?.[1]||'')}`} · дней с записью: ${esc(r.observed_days)} из ${esc(r.calendar_days)}${n(r.overlap_days)>0?`; дней, где записи накладывались: ${esc(r.overlap_days)}`:''}; откуда взяты дни: ${sources}</div>`}
function metricSelect(list=activeMetrics()){return `<select class="metric-select" id="metric">${list.map(k=>`<option value="${esc(k)}" ${k===state.metric?'selected':''}>${esc(metricLabel(k))}</option>`).join('')}</select>`}
// Суммы за годы человеку ничего не говорят: на обзоре и в сезонности они показаны на день с записью.
const PER_DAY=['steps','exercise_min','walk_run_km','active_kcal'];
function perDayRows(k){return filtered(k).map(r=>({...r,value:r.value===null?null:PER_DAY.includes(k)&&r.aggregation==='sum'?(n(r.observed_days)>0?n(r.value)/n(r.observed_days):null):n(r.value)}))}
function overview(){if(!activeMetrics().includes(state.metric))state.metric='steps';let cards=['steps','exercise_min',...activeMetrics().filter(x=>['resting_hr','vo2max','sleep_hours'].includes(x))].slice(0,6);return `<section class="grid">${cards.map(k=>{let p=periodValue(filtered(k),k),a=known[k],sum=a[2]==='sum',v=p?(sum?p.secondary:p.primary):null;return `<button class="card metric-card ${k===state.metric?'selected':''}" data-pick="${k}" aria-pressed="${k===state.metric}"><div class="label">${a[0]}</div><div class="value">${v==null?'—':fmt(v,k==='steps'?0:1)} <small>${k==='steps'?'в день':k==='exercise_min'?'мин в день':a[1]}</small></div><div class="sub">${sum?'в среднем на день с записью':'среднее по дням с записью'}</div></button>`}).join('')}</section><section class="panel"><div class="sectionhead"><h1>${esc(known[state.metric][0])}${PER_DAY.includes(state.metric)?' · на день с записью':''}</h1>${metricSelect()}</div><div id="mainChart"></div><p class="chart-note">Разрыв линии — месяц без записей или отсеянный фильтром покрытия. Это не ноль и не догадка. Нажмите на точку, чтобы увидеть месяц подробно.</p><div id="detail"></div></section><details class="quiet-details"><summary>Как рассчитаны показатели</summary><p class="chart-note">Средние учитывают только дни с записями; это не время ношения часов. Сон в этом списке — по календарным дням; сон по ночам — на вкладке «Сон».</p><div class="method" id="method"></div></details>`}
function activity(){let opts=activeMetrics().filter(k=>['steps','exercise_min','walk_run_km','cycling_km','swimming_km','active_kcal'].includes(k));if(!opts.includes(state.metric))state.metric=opts[0]||'steps';let rows=filtered(state.metric),p=periodValue(rows,state.metric), a=known[state.metric];return `<section class="panel"><div class="sectionhead"><h1>Активность</h1>${metricSelect(opts)}</div><div class="grid"><div class="card"><div class="label">Сумма</div><div class="value">${p?fmt(p.primary,0):'—'} ${a[1]}</div><div class="sub">только месяцы с записью</div></div><div class="card"><div class="label">Среднее на день</div><div class="value">${p?.secondary==null?'—':fmt(p.secondary,1)} ${a[1]}</div><div class="sub">Σ значений / Σ наблюдаемых дней</div></div></div>${chart(rows,a[0],a[1],{key:'activity',metric:state.metric})}${compareBlock()}</section>`}
function workoutMetrics(){return [...new Set(state.main.monthly.filter(x=>safeMetric(x.metric)&&x.metric.startsWith('workout_')&&!x.metric.endsWith('_count')).map(x=>x.metric))]} // Названия видов тренировок из выгрузки — английские идентификаторы HealthKit. На экран они не выходят.
const WORKOUT_RU={Walking:'Ходьба',Running:'Бег',Cycling:'Велосипед',Swimming:'Плавание',Hiking:'Пешие походы',Rowing:'Гребля',Elliptical:'Эллипсоид',StairClimbing:'Подъём по лестнице',Stairs:'Лестница',StepTraining:'Степ',CoreTraining:'Мышцы корпуса',TraditionalStrengthTraining:'Силовые',FunctionalStrengthTraining:'Функциональные силовые',HighIntensityIntervalTraining:'Интервальные',CrossTraining:'Смешанные',MixedCardio:'Смешанное кардио',Cardio:'Кардио',CardioDance:'Танцевальное кардио',Dance:'Танцы',SocialDance:'Танцы',Yoga:'Йога',Pilates:'Пилатес',Flexibility:'Растяжка',Cooldown:'Заминка',PreparationAndRecovery:'Разминка и восстановление',MindAndBody:'Дыхание и осознанность',TaiChi:'Тайцзи',Barre:'Барре',Gymnastics:'Гимнастика',JumpRope:'Скакалка',Kickboxing:'Кикбоксинг',Boxing:'Бокс',MartialArts:'Единоборства',Wrestling:'Борьба',Fencing:'Фехтование',SnowSports:'Зимние виды',DownhillSkiing:'Горные лыжи',CrossCountrySkiing:'Беговые лыжи',Snowboarding:'Сноуборд',SkatingSports:'Коньки',Hockey:'Хоккей',Curling:'Кёрлинг',WaterSports:'Водные виды',WaterFitness:'Аквафитнес',WaterPolo:'Водное поло',SurfingSports:'Сёрфинг',PaddleSports:'Гребля на каяке или сапе',Sailing:'Парус',UnderwaterDiving:'Дайвинг',Swimbikerun:'Триатлон',Transition:'Транзитная зона',Tennis:'Теннис',TableTennis:'Настольный теннис',Badminton:'Бадминтон',Squash:'Сквош',Racquetball:'Ракетбол',Pickleball:'Пиклбол',Soccer:'Футбол',Basketball:'Баскетбол',Volleyball:'Волейбол',Handball:'Гандбол',Rugby:'Регби',AmericanFootball:'Американский футбол',AustralianFootball:'Австралийский футбол',Baseball:'Бейсбол',Softball:'Софтбол',Cricket:'Крикет',Lacrosse:'Лакросс',Golf:'Гольф',DiscSports:'Фрисби',Bowling:'Боулинг',Archery:'Стрельба из лука',Climbing:'Скалолазание',Equestrian:'Верховая езда',Fishing:'Рыбалка',Hunting:'Охота',Play:'Подвижные игры',FitnessGaming:'Фитнес-игры',TrackAndField:'Лёгкая атлетика',HandCycling:'Хендбайк',WheelchairWalkPace:'Коляска, темп ходьбы',WheelchairRunPace:'Коляска, темп бега',Other:'Другое',Workout:'Без указания вида'};
// Незнакомый вид не показывается английским именем, но и не сливается с соседним: у каждого свой номер.
function niceWorkout(x){let k=x.replace('workout_','');if(WORKOUT_RU[k])return WORKOUT_RU[k];let rest=workoutMetrics().map(m=>m.replace('workout_','')).filter(m=>!WORKOUT_RU[m]).sort();return 'Другой вид'+(rest.length>1?' '+(rest.indexOf(k)+1):'')}
const metricLabel=k=>known[k]?.[0]||(String(k).startsWith('workout_')?niceWorkout(k):k);
// Σ minutes / Σ starts over months where both series are present, so the two sums cover the same period.
function avgDuration(minRows,countRows){let cm=new Map(countRows.filter(x=>x.value!==null).map(x=>[x.month,n(x.value)])),matched=minRows.filter(x=>x.value!==null&&cm.has(x.month)),c=matched.reduce((s,x)=>s+cm.get(x.month),0);return {value:c>0?matched.reduce((s,x)=>s+n(x.value),0)/c:null,months:matched.length}}
// Цвета категорий — токены --cat-1…8 из styles.css: так они переключаются вместе с темой.
const SPORT_COLORS=Array.from({length:8},(_,i)=>`var(--cat-${i+1})`);
function sportRows(mode){let rr=range();if(!rr)return[];return workoutMetrics().map((metric,i)=>{let key=mode==='count'?metric+'_count':metric,got=state.main.monthly.filter(r=>r.metric===key&&r.month>=rr[0]&&r.month<=rr[1]&&r.value!==null);return{metric,label:niceWorkout(metric),value:got.reduce((s,r)=>s+n(r.value),0)/(mode==='count'?1:60),present:got.length>0,color:SPORT_COLORS[i%SPORT_COLORS.length]}}).filter(r=>r.present).sort((x,y)=>y.value-x.value)}
function pie(mode){let rows=sportRows(mode),total=rows.reduce((s,r)=>s+r.value,0),unit=v=>mode==='count'?plural(Math.round(v),'занятие','занятия','занятий'):'ч';if(!(total>0))return '<p class="chart-note">В выбранном периоде тренировок нет.</p>';let angle=-Math.PI/2,R=96,paths='';for(const r of rows){if(!(r.value>0))continue;let next=angle+2*Math.PI*r.value/total,tip=`${r.label}: ${fmt(r.value,mode==='count'?0:1)} ${unit(r.value)}, ${fmt(r.value/total*100,0)}%`,p=[130+R*Math.cos(angle),130+R*Math.sin(angle)],q=[130+R*Math.cos(next),130+R*Math.sin(next)],whole=r.value===total,shape=whole?'<circle cx="130" cy="130" r="96"':`<path d="M130 130L${p.join(' ')}A96 96 0 ${next-angle>Math.PI?1:0} 1 ${q.join(' ')}Z"`;paths+=`${shape} style="fill:${r.color};stroke:var(--panel)" stroke-width="2" tabindex="0" role="button" data-sport="${esc(r.metric)}" aria-label="${esc(tip)}"><title>${esc(tip)}</title>${whole?'</circle>':'</path>'}`;angle=next}return `<div class="sport-pie"><h2>${mode==='count'?'По числу занятий':'По времени'}</h2><div class="pie-content"><svg viewBox="0 0 260 260" role="img" aria-label="${mode==='count'?'Доли видов спорта по числу занятий':'Доли видов спорта по времени'}">${paths}</svg><div class="pie-legend">${rows.map(r=>`<button data-sport="${esc(r.metric)}"><i style="background:${r.color}"></i><span>${esc(r.label)}</span><b>${fmt(r.value/total*100,0)}%</b><small>${fmt(r.value,mode==='count'?0:1)} ${unit(r.value)}</small></button>`).join('')}</div></div><p class="chart-note">Всего: ${fmt(total,mode==='count'?0:1)} ${unit(total)}.</p></div>`}
// Годовая таблица тренировок (методика, п. 4 списка «не перенесено»): по каждому виду за год
// часы, число начал и средняя длительность = Σминут / Σначал по месяцам, где есть оба ряда.
// Год без обоих рядов в каком-то месяце не выбрасывается: часы и начала считаются по своим
// месяцам, а средняя — только по совпадающим, поэтому она может стоять на меньшем числе месяцев.
function sportYears(){let rr=range();if(!rr)return{years:[],sports:[]};let sports=workoutMetrics(),inRange=r=>r.month>=rr[0]&&r.month<=rr[1]&&r.value!==null,years=[...new Set(state.main.monthly.filter(r=>safeDate(r.month)&&inRange(r)&&safeMetric(r.metric)&&r.metric.startsWith('workout_')).map(r=>r.month.slice(0,4)))].sort();
 let ms=months(),edge=new Set();if(ms.length){if(ms.at(-1).slice(5)!=='12')edge.add(ms.at(-1).slice(0,4));if(ms[0].slice(5)!=='01')edge.add(ms[0].slice(0,4))}
 let cells=years.map(y=>{let mins=state.main.monthly.filter(r=>inRange(r)&&r.month.startsWith(y)),bySport=sports.map(m=>{let a=mins.filter(r=>r.metric===m),c=mins.filter(r=>r.metric===m+'_count'),cm=new Map(c.map(r=>[r.month,n(r.value)])),both=a.filter(r=>cm.has(r.month)),starts=c.reduce((s,r)=>s+n(r.value),0),bothStarts=both.reduce((s,r)=>s+cm.get(r.month),0);
  return{metric:m,hours:a.length?a.reduce((s,r)=>s+n(r.value),0)/60:null,starts:c.length?starts:null,avg:bothStarts>0?both.reduce((s,r)=>s+n(r.value),0)/bothStarts:null,avgMonths:both.length}});
  let monthsIn=new Set(mins.map(r=>r.month)).size;return{year:y,edge:edge.has(y),months:monthsIn,sports:bySport}});
 let order=new Map(sports.map(m=>[m,cells.reduce((s,y)=>s+(y.sports.find(c=>c.metric===m).hours||0),0)]));sports=[...sports].sort((a,b)=>order.get(b)-order.get(a));cells.forEach(y=>y.sports.sort((a,b)=>order.get(b.metric)-order.get(a.metric)));return{years:cells,sports}}
function sportYearsTable(){let t=sportYears();if(!t.years.length)return '';
 let cell=c=>c.hours===null&&c.starts===null?'<td class="muted">—</td>':`<td><div class="delta">${c.hours===null?'—':esc(fmt(c.hours,1))+' ч'}</div><div class="delta-word">${c.starts===null?'начала не записаны':esc(fmt(c.starts,0))+' '+plural(Math.round(c.starts),'начало','начала','начал')}</div><div class="delta-word">${c.avg===null?'—':'в среднем '+esc(fmt(c.avg,0))+' мин'}</div></td>`;
 return `<section class="panel" data-role="sport-years"><div class="sectionhead"><h1>Вид спорта по годам</h1><span class="sub">выбранный период</span></div><div class="tablewrap"><table class="sport-years"><thead><tr><th>Год</th>${t.sports.map(m=>`<th>${esc(niceWorkout(m))}</th>`).join('')}</tr></thead><tbody>${t.years.map(y=>`<tr data-year="${esc(y.year)}"><th scope="row">${esc(y.year)}${y.edge?'<div class="sparse-flag">архив обрезан: '+esc(y.months)+' '+plural(y.months,'месяц','месяца','месяцев')+'</div>':y.months<12?'<div class="sparse-flag">записи есть в '+esc(y.months)+' '+plural(y.months,'месяце','месяцах','месяцах')+' из 12</div>':''}</th>${y.sports.map(cell).join('')}</tr>`).join('')}</tbody></table></div><p class="chart-note">В клетке три числа: часы за год, число начавшихся тренировок и средняя длительность одной. Средняя — Σ минут / Σ начал только по тем месяцам, где записаны и минуты, и начала; граничные тренировки возможны. Год, обрезанный краем архива, или год с пропусками в записях помечен: его часы и начала ниже не потому, что вы остановились. Столбцы идут по убыванию часов за период. Строки между собой по часам сравнивать можно, по средней — с оглядкой на число начал.</p></section>`}
function workouts(){let ws=workoutMetrics();if(!ws.includes(state.metric))state.metric=ws[0]||'steps';let count=state.metric+'_count', rows=filtered(state.metric), c=filtered(count),p=periodValue(rows,state.metric),pc=periodValue(c,count),ad=avgDuration(rangeRows(state.metric),rangeRows(count)),avg=ad.value;return `<section class="panel"><div class="sectionhead"><h1>Какие занятия занимают больше места</h1><span class="sub">выбранный период</span></div><div class="sport-pies">${pie('duration')}${pie('count')}</div><p class="chart-note">Один цвет — один вид спорта. Нажмите на сектор или строку, чтобы увидеть этот вид подробно. Незаписанные занятия сюда не попадают.</p></section>${sportYearsTable()}<section class="panel"><div class="sectionhead"><h1>${esc(niceWorkout(state.metric))}</h1><select id="metric" class="metric-select">${ws.map(x=>`<option value="${esc(x)}" ${x===state.metric?'selected':''}>${esc(niceWorkout(x))}</option>`).join('')}</select></div><div class="grid"><div class="card"><div class="label">Минуты</div><div class="value">${p?fmt(p.primary,0):'—'} мин</div></div><div class="card"><div class="label">Часы</div><div class="value">${p?fmt(p.primary/60,1):'—'} ч</div></div><div class="card"><div class="label">Начала тренировок</div><div class="value">${pc?fmt(pc.primary,0):'—'}</div></div><div class="card"><div class="label">Средняя длительность</div><div class="value">${avg===null?'—':fmt(avg,1)} мин</div><div class="sub">Σ минут / Σ начал по ${ad.months} совпадающим месяцам; граничные тренировки возможны</div></div></div>${chart(rows.map(r=>({...r,value:r.value===null?null:n(r.value)/60})),niceWorkout(state.metric)+', часы','ч',{key:'workouts'})}</section>`}
// The three months must be calendar neighbours: a missing or filtered-out month blocks smoothing, it is not skipped over.
// Окно в N календарных месяцев. Для трёх — нужны все три; для двенадцати — не меньше девяти из
// двенадцати, иначе на реальном архиве с пропусками годовая линия почти никогда не строится.
// Средние взвешиваются по наблюдаемым дням; суммы усредняются по месяцам с равным весом:
// сумма за месяц, умноженная на дни, не имеет смысла.
function smoothRowsN(rows,win){let need=win===12?9:win,by=new Map(rows.map(r=>[monthIdx(r.month),r]));return rows.map(r=>{let ix=monthIdx(r.month),got=[];for(let k=win-1;k>=0;k--){let x=by.get(ix-k);if(x&&x.value!==null&&Number.isFinite(n(x.value))&&n(x.observed_days)>0)got.push(x)}if(got.length<need)return {...r,value:null};if(r.aggregation==='sum')return {...r,value:got.reduce((s,x)=>s+n(x.value),0)/got.length};let d=got.reduce((s,x)=>s+n(x.observed_days),0);return {...r,value:got.reduce((s,x)=>s+n(x.value)*n(x.observed_days),0)/d}})}
function smoothRows(rows){return smoothRowsN(rows,3)}
function smoothMode(key){let v=state.smooth&&state.smooth[key];return v==='3'||v==='12'?Number(v):0}
function heart(){let opts=['resting_hr','vo2max'].filter(k=>metricRows(k).length);if(!opts.includes(state.metric))state.metric=opts[0]||'resting_hr';let raw=filtered(state.metric);return `<section class="panel"><div class="sectionhead"><h1>Сердце</h1>${metricSelect(opts)}</div>${statCards(raw,known[state.metric][1],{by:'дням с измерением',count:'Дней с измерением'})}${chart(raw,known[state.metric][0],known[state.metric][1],{key:'heart',metric:state.metric})}${compareBlock(state.metric)}</section>`}
// state.sleep is the loaded window file and nothing else: a missing file never falls back to the demo set.
function sleep(){let has=!!state.sleep, useWin=has&&state.sleepMode!=='calendar', rows=useWin?state.sleep.monthly.filter(x=>{let r=range();return r&&x.month>=r[0]&&x.month<=r[1]}).map(x=>({month:x.month,value:x.mean_hours,observed_days:x.observed_windows,calendar_days:1,selected_sources:x.selected_sources||{},overlap_days:x.multi_source_windows??0})):filtered('sleep_hours');return `<section class="panel"><div class="sectionhead"><h1>Сон</h1><button id="toggleSleep" data-ui="toggleSleep" ${has?'':'disabled'}>${useWin?'Показать календарный сон':'Показать окна полдень–полдень'}</button></div><div class="notice">${useWin?'Окна полдень–полдень: включают дневной сон и не обязательно являются полной ночью.':'Календарный сон: отдельное определение; его нельзя смешивать с оконным сном.'}${has?'':' Файл окон сна не загружен, поэтому доступен только календарный сон.'}</div>${statCards(rows,'ч',useWin?{by:'окнам с записью',count:'Окон с записью'}:{by:'дням с записью',count:'Дней с записью'})}${useWin?sleepWindowCards(rows):''}${chart(rows,useWin?'Оконный сон':'Календарный сон','ч',{key:'sleep',metric:'sleep_hours'})}${useWin?compareBlock('sleep_windows',rows,'ч'):compareBlock('sleep_hours')}</section>${sleepStagesBlock()}`}
// Стадии сна: доли за месяц = Σ часов стадии / Σ часов сна по дням с записью (календарное
// определение, тот же выбранный источник). «Без стадии» — остаток до полного сна, а доли делятся
// на сумму частей, не на сон: месячные средние округлены до 4 знаков, и Σстадий может быть на
// тысячные больше сна. Так сумма долей всегда 100%, а месяцы старых часов видны как «без стадии».
function sleepStages(){let rr=range();if(!rr)return null;let total=metricRows('sleep_hours').filter(r=>r.value!==null&&r.month>=rr[0]&&r.month<=rr[1]),stageRows=Object.fromEntries(STAGE_ROWS.map(([m])=>[m,new Map(metricRows(m).filter(r=>r.value!==null).map(r=>[r.month,n(r.value)*n(r.observed_days)]))]));
 let withStages=total.filter(r=>STAGE_ROWS.slice(0,3).some(([m])=>stageRows[m].has(r.month)));if(withStages.length<6)return null;
 let months=total.map(r=>{let sleep=n(r.value)*n(r.observed_days),got=STAGE_ROWS.slice(0,3).map(([m])=>Math.min(sleep,stageRows[m].get(r.month)||0)),known=got.reduce((s,v)=>s+v,0),parts=[...got,Math.max(0,sleep-known)],base=parts.reduce((s,v)=>s+v,0);return {month:r.month,hours:sleep,shares:parts.map(v=>base>0?v/base:0),parts}});
 let years=[...new Set(months.map(m=>m.month.slice(0,4)))].map(y=>{let mm=months.filter(m=>m.month.startsWith(y)),h=mm.reduce((s,m)=>s+m.hours,0),parts=STAGE_ROWS.map((_,i)=>mm.reduce((s,m)=>s+m.parts[i],0));return {year:y,months:mm.length,hours:h,shares:parts.map(v=>h>0?v/h:0)}});
 return {months,years,firstStaged:withStages[0].month}}
function sleepStagesBlock(){let d=sleepStages();if(!d)return '';let W=1100,L=48,R=20,T=16,B=60,H=320-T-B,bw=(W-L-R)/d.months.length,svg='';
 d.months.forEach((m,i)=>{let y=T+H;STAGE_ROWS.forEach(([_,label,cls],j)=>{let h=m.shares[j]*H;if(h<=0)return;y-=h;svg+=`<rect class="${cls}" x="${(L+i*bw+1).toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1,bw-2).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(monthName(m.month))}: ${esc(label)} ${fmt(m.shares[j]*100,0)}%, ${fmt(m.parts[j],0)} ч</title></rect>`});if(m.month.endsWith('-01'))svg+=`<text x="${(L+i*bw).toFixed(1)}" y="${T+H+20}">${esc(m.month.slice(0,4))}</text>`});
 [0,.25,.5,.75,1].forEach(p=>{let y=T+H-p*H;svg+=`<line class="axis" x1="${L-4}" x2="${W-R}" y1="${y}" y2="${y}"/><text x="${L-8}" y="${y+4}" text-anchor="end">${p*100}%</text>`});
 svg+=`<text x="${L+(W-L-R)/2}" y="${T+H+44}" text-anchor="middle">Месяцы (год подписан у января)</text>`;
 return `<section class="panel" data-role="sleep-stages"><div class="sectionhead"><h1>Стадии по месяцам</h1><span class="sub">с ${esc(monthName(d.firstStaged))}, когда часы начали писать стадии</span></div>
 <p class="legend">${STAGE_ROWS.map(([_,label,cls])=>`<span><i class="sw stage-${cls}"></i>${esc(label)}</span>`).join('')}</p>
 <svg class="stack" viewBox="0 0 ${W} 320" role="img" aria-label="Доли стадий сна по месяцам">${svg}</svg>
 <div class="tablewrap"><table class="stage-years"><caption>То же по годам</caption><thead><tr><th>Год</th>${STAGE_ROWS.map(([_,l])=>`<th>${esc(l)}</th>`).join('')}<th>Сна за год</th></tr></thead><tbody>${d.years.map(y=>`<tr data-year="${esc(y.year)}"><th scope="row">${esc(y.year)}${y.months<12?`<div class="sparse-flag">${esc(y.months)} ${plural(y.months,'месяц','месяца','месяцев')} с записью</div>`:''}</th>${y.shares.map(s=>`<td>${fmt(s*100,0)}%</td>`).join('')}<td>${fmt(y.hours,0)} ч</td></tr>`).join('')}</tbody></table></div>
 <p class="chart-note">Столбик — месяц, высота — 100% записанного календарного сна, цвет — доля стадии. Глубокий — медленный сон, в нём тело восстанавливается сильнее всего. REM (rapid eye movement, «быстрые движения глаз») — стадия, в которой чаще всего снятся сны, а мозг активен почти как наяву. Лёгкий — всё остальное время сна, у Apple он называется Core. Стадии — оценка часов по пульсу и движению, не полисомнография; они появились с watchOS 9 (осень 2022), раньше часы писали только «спал». Скачок доли глубокого сна между годами чаще всего смена алгоритма Apple или часов, а не сна. Коридоров нормы для стадий у источников нет, поэтому на «Главное» этот график не идёт и в нормах не участвует.</p></section>`}
// Что есть только у оконного сна: короткие окна и окна, где источники спорят, был ли человек в постели.
function sleepWindowCards(rows){let src=state.sleep.monthly.filter(x=>rows.some(r=>r.month===x.month)),tot=src.reduce((s,x)=>s+n(x.observed_windows),0),sum=f=>src.some(x=>x[f]!=null)?src.reduce((s,x)=>s+n(x[f]??0),0):null,short=sum('shorter_than_3h_windows'),conf=sum('conflicting_awake_windows'),card=(l,v,sub)=>`<div class="card"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${sub}</div></div>`,pct=v=>tot?` (${fmt(v/tot*100,0)}%)`:'';if(short===null&&conf===null)return '';return `<div class="grid">${short===null?'':card('Окон короче 3 часов',fmt(short,0)+pct(short),'дневной сон или неполная запись ночи')}${conf===null?'':card('Окон с конфликтом источников',fmt(conf,0)+pct(conf),'один источник видел сон, другой — бодрствование')}</div>`}
// Always monthly rows: the horizontal position is the calendar month number, so a missing month shifts nothing.
function season(){let opts=activeMetrics();if(!opts.includes(state.metric))state.metric=opts[0]||'steps';
 let perDay=PER_DAY.includes(state.metric),
     rows=rangeRows(state.metric).filter(r=>r.value!==null&&Number.isFinite(n(r.value))).map(r=>perDay&&Number.isFinite(n(r.mean_observed_day))?{...r,value:n(r.mean_observed_day)}:r),
     years=[...new Set(rows.map(r=>r.month.slice(0,4)))].sort(),series=years.slice(-4),
     all=series.map(y=>rows.filter(r=>r.month.startsWith(y+'-')).sort((a,b)=>a.month.localeCompare(b.month))),
     colors=SPORT_COLORS.slice(0,4),unit=known[state.metric]?.[1]||'';
 if(!all.flat().length)return `<section class="panel"><div class="sectionhead"><h1>Сезонность</h1>${metricSelect(opts)}</div><p class="chart-note">Нет данных в выбранном периоде.</p></section>`;
 let kind=chartKind('season',state.metric),
     w=CHART_W,h=CHART_H,p=CHART_PAD,plot=w-p.l-p.r,
     max=Math.max(...all.flat().map(r=>n(r.value)),1),
     xPos=i=>p.l+plot*(i+.5)/12,y=v=>h-p.b-v/max*(h-p.t-p.b),mon=r=>Number(r.month.slice(5,7))-1,
     // Столбики одного месяца стоят группой: год от года сравнивается внутри месяца,
     // а не через весь график. Ширина группы — та же клетка, что у линии.
     cell=plot/12,bw=Math.min(14,cell*.8/Math.max(series.length,1));
 let body=series.map((year,j)=>{
  if(kind==='bar')return all[j].map(row=>{let v=n(row.value),x0=xPos(mon(row))-cell*.4+j*bw+ (cell*.8-bw*series.length)/2;
   return `<rect data-role="bar" x="${x0.toFixed(1)}" y="${y(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1,h-p.b-y(v)).toFixed(1)}" style="fill:${colors[j]}"><title>${esc(monthName(row.month))}: ${fmt(v,1)} ${esc(unit)}</title></rect>`}).join('');
  let d='',prev=null;
  for(const row of all[j]){let i=mon(row);d+=(prev!==null&&i-prev===1?'L':'M')+xPos(i).toFixed(1)+','+y(n(row.value)).toFixed(1);prev=i}
  let dots=all[j].map(row=>`<circle cx="${xPos(mon(row)).toFixed(1)}" cy="${y(n(row.value)).toFixed(1)}" r="4" style="fill:${colors[j]}"><title>${esc(monthName(row.month))}: ${fmt(n(row.value),1)} ${esc(unit)}</title></circle>`).join('');
  return `<path d="${d}" fill="none" style="stroke:${colors[j]}" stroke-width="2.5" stroke-linejoin="round"/>${dots}`}).join('');
 let ticks=[0,max/2,max].map(v=>`<g><line class="gridline" x1="${p.l}" x2="${w-p.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${p.l-10}" y="${(y(v)+4).toFixed(1)}" text-anchor="end">${fmt(v,1)}</text></g>`).join(''),
     labs=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'].map((m,i)=>`<text class="axis" x="${xPos(i).toFixed(1)}" y="${h-p.b+22}" text-anchor="middle">${m}</text>`).join(''),
     // Легенда стоит рядом с графиком текстом, а не подписями внутри поля: раньше годы
     // печатались поверх рисунка и последний из них обрезался краем.
     legend=`<p class="chart-legend">${series.map((year,j)=>`<span><i class="sw-dot" style="background:${colors[j]}"></i>${esc(year)}</span>`).join('')}</p>`,
     axisY=`<text class="axis-title" transform="translate(18,${((p.t+h-p.b)/2).toFixed(1)}) rotate(-90)" text-anchor="middle">${esc(unit||metricLabel(state.metric))}</text>`,
     axisX=`<text class="axis-title" x="${(p.l+plot/2).toFixed(1)}" y="${h-10}" text-anchor="middle">Месяцы</text>`;
 return `<section class="panel"><div class="sectionhead"><h1>Сезонность</h1>${metricSelect(opts)}</div><p class="chart-note">Одни и те же месяцы разных лет: до четырёх последних лет выбранного периода. ${perDay?'Значения — в среднем на день с записью, поэтому короткие и неполные месяцы сравнимы с полными.':'Значения — средние за месяц.'} Разрыв линии — нет подходящих данных.</p>${legend}<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Сезонность">${ticks}${body}${labs}${axisY}${axisX}</svg></div>${chartToggle('season',kind)}</section>`}
function quality(){let opts=activeMetrics();if(!opts.includes(state.metric))state.metric=opts[0]||'steps';let metric=state.metric, rows=metricRows(metric), years=[...new Set(months().map(x=>x.slice(0,4)))];let cells=years.map(y=>Array.from({length:12},(_,i)=>{let m=y+'-'+String(i+1).padStart(2,'0'),r=rows.find(x=>x.month===m),days=r&&r.value!==null?n(r.observed_days):null,pct=days===null?null:days/n(r.calendar_days),l=pct===null?0:pct>=.9?3:pct>=.8?2:1,say=days===null?'нет записей':days+' из '+n(r.calendar_days)+' дней с записью';return `<button data-qmonth="${m}" data-level="${l}" title="${esc(monthName(m))}: ${say}" aria-label="${esc(monthName(m))}: ${say}">${days===null?'—':days}</button>`}).join(''));let gaps=(state.main.gaps||[]).filter(x=>x.metric===metric);return `<section class="split"><div class="panel"><div class="sectionhead"><h1>Полнота записей</h1>${metricSelect(opts)}</div><p>Здесь видно, <b>за сколько дней каждого месяца вообще есть записи</b> и где сравнивать периоды рискованно. О здоровье и о точности часов эта вкладка ничего не говорит.</p><p class="chart-note">Строка — год, столбец — месяц, число в ячейке — сколько дней месяца имеют хотя бы одну запись выбранного показателя. 15 из 30 — половина месяца. Даже полный месяц не значит, что часы были на руке круглые сутки.</p><div class="tablewrap"><div class="heat"><b>Год</b>${['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'].map(x=>`<span>${x}</span>`).join('')}${years.map((y,i)=>`<b>${y}</b>${cells[i]}`).join('')}</div></div><p class="legend"><span><i class="sw" style="background:var(--accent)"></i>записано 90% дней и больше</span><span><i class="sw" style="background:var(--heat-2)"></i>80–89%</span><span><i class="sw" style="background:var(--band)"></i>меньше 80%</span><span><i class="sw" style="background:var(--empty)"></i>записей нет</span></p><div id="qdetail">${state.detail?detail(state.detail,metric):'Нажмите на месяц: появится число дней с записью и откуда они взяты.'}</div><p class="chart-note">Как пользоваться: прежде чем сравнивать два периода, посмотрите, одинаково ли полно они записаны. Для VO₂max и редких занятий мало дней в месяце — обычное дело, а не плохие данные.</p></div><div class="panel"><h1>Длинные перерывы в записях</h1><p class="chart-note">Промежутки от 14 дней подряд без единой записи выбранного показателя. Причину перерыва данные не называют.</p><table><thead><tr><th>Последняя запись — следующая</th><th>Дней без записей</th></tr></thead><tbody>${gaps.slice(0,10).map(g=>`<tr><td>${esc(g.last_observation)} — ${esc(g.next_observation)}</td><td>${esc(g.missing_days_between)}</td></tr>`).join('')||'<tr><td colspan="2">Длинных перерывов нет.</td></tr>'}</tbody></table></div></section>`}
// Pairs are the same calendar months a year apart. Both months must pass the coverage filter; sums are compared as daily means.
// Сам список пар на экран не выводится — для читателя это шум; он остался швом HealthUI.comparePairs.
function comparePairs(metric,includeLast,rowsOverride){let r=range();if(!r)return[];let cutoff=Number($('#coverage').value),last=months().at(-1),rows=rowsOverride||metricRows(metric),by=new Map(rows.map(x=>[x.month,x])),ok=x=>!!x&&x.value!==null&&Number.isFinite(n(x.value))&&n(x.observed_days)>0&&passesCoverage(metric,x,cutoff);return rows.filter(x=>x.month>=r[0]&&x.month<=r[1]&&(includeLast||x.month!==last)).map(x=>[by.get(String(Number(x.month.slice(0,4))-1)+x.month.slice(4)),x]).filter(p=>ok(p[0])&&ok(p[1])).sort((a,b)=>a[1].month.localeCompare(b[1].month))}
function compareBlock(metric,rowsOverride,unitOverride){let r=range();if(!r)return'';let k=metric||state.metric,incl=!!state.compareIncludeLast,last=months().at(-1),pairs=comparePairs(k,incl,rowsOverride),unit=unitOverride??(known[k]?.[2]==='sum'?(known[k][1]+'/день'):(known[k]?.[1]||'')),toggle=`<label class="sub"><input type="checkbox" id="cmpLast" ${incl?'checked':''}> Включить последний месяц архива${last?` (${esc(monthName(last))})`:''}: он может быть неполным</label>`;if(!pairs.length)return `<div class="compare"><b>Сравнение с теми же месяцами годом ранее</b><p class="sub">Недостаточно сопоставимых месяцев.</p>${toggle}</div>`;let val=x=>x.aggregation==='sum'?n(x.value)/n(x.observed_days):n(x.value),avg=a=>a.reduce((s,x)=>s+val(x),0)/a.length,old=avg(pairs.map(x=>x[0])),now=avg(pairs.map(x=>x[1])),d=now-old,src=p=>Object.keys(p.selected_sources||{}).sort().join(','),changed=pairs.filter(p=>src(p[0])!==src(p[1])).length;return `<div class="compare"><b>Сравнение с теми же месяцами годом ранее</b><p>${fmt(old,1)} → ${fmt(now,1)} ${esc(unit)}; Δ ${fmt(d,1)} (${old===0?'—':fmt(d/old*100,1)+'%'}); ${pairs.length} пар.</p><p class="sub">Формула: ${known[k]?.[2]==='sum'?'среднее дневных средних (значение месяца / наблюдаемые дни)':'среднее месячных значений'} с равным весом по парам месяцев. Фильтр покрытия применён к обоим месяцам пары. При базе 0 относительное изменение не определено.${changed?` В ${changed} парах состав источников различается — сравнение предварительное.`:''} Знак Δ не означает «лучше» или «хуже».</p>${toggle}</div>`}
function hasData(){return !!(state.main&&Array.isArray(state.main.monthly)&&state.main.monthly.length)}
// Без данных страница показывает приглашение или экран чтения; вкладки и фильтры спрятаны.
function renderShell(){let has=hasData(),busy=!!archiveJob;for(const n of ['nav','controls','app','periodTitle'])HealthUI.control(n).classList.toggle('hidden',!has);
// Кнопка в шапке одна и значит одно на всех страницах: уйти на стартовый экран.
// Пока данных нет, сбрасывать нечего, и её нет тоже.
HealthUI.control('reset').classList.toggle('hidden',!has);HealthUI.control('start').classList.toggle('hidden',has||busy);HealthUI.control('loading').classList.toggle('hidden',has||!busy);HealthUI.control('resetHint').classList.toggle('hidden',!has||busy);return has}
// Перерисовка той же вкладки не должна сбрасывать прокрутку: пока разметка меняется, высота
// блока на миг падает, браузер прижимает страницу вверх, и после смены вида графика человек
// оказывается в шапке. Высота удерживается на время замены, положение возвращается явно.
// Смена вкладки — другое дело: там начало страницы и ожидается.
let renderedTab=null;
function keepScroll(swap){
 let same=renderedTab===state.tab,y=window.scrollY,h=app.offsetHeight;renderedTab=state.tab;
 if(!same){swap();window.scrollTo(0,0);return}
 app.style.minHeight=h+'px';swap();window.scrollTo(0,y);app.style.minHeight=''}
function render(){rendering=true;clearAlert();if(!renderShell()){bindStart();rendering=false;return}initControls();let fn={story:storyTab,overview,activity,workouts,heart,sleep,season,quality}[state.tab];HealthUI.control('controls').classList.toggle('hidden',state.tab==='story');keepScroll(()=>{app.innerHTML=fn()});bindContent();if(state.tab==='story')bindStory();if(state.tab==='overview'){renderOverviewChart();$('#method').textContent=String(state.main.method||'Методика не указана.')}rendering=false}
function renderOverviewChart(){let k=state.metric;if(!activeMetrics().includes(k))k='steps',state.metric=k;let rows=perDayRows(k),a=known[k];$('#mainChart').innerHTML=chart(rows,a[0],a[1]+(PER_DAY.includes(k)?'/день':''),{key:'overview',metric:k});bindChartKind($('#mainChart'));$('#detail').innerHTML=state.detail?detail(state.detail,k):''}
// Переключатель вида графика живёт в state по ключу графика: у каждого раздела свой,
// и выбор не разъезжается при переходе между вкладками.
function bindChartKind(root){root.querySelectorAll('[data-chart-kind]').forEach(el=>el.onchange=e=>{
 (state.chartKind||(state.chartKind={}))[el.dataset.chartKind]=e.target.value==='bar'?'bar':'line';render()});
 root.querySelectorAll('[data-smooth-key]').forEach(el=>el.onchange=e=>{
 (state.smooth||(state.smooth={}))[el.dataset.smoothKey]=['3','12'].includes(e.target.value)?e.target.value:'0';render()})}
function bindContent(){bindChartKind(app);app.querySelectorAll('[data-pick],[data-sport]').forEach(el=>{let go=()=>{state.metric=el.dataset.pick||el.dataset.sport;state.detail=null;render()};el.onclick=go;if(el.tagName!=='BUTTON')el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});let m=$('#metric');if(m)m.onchange=e=>{state.metric=e.target.value;render()};app.querySelectorAll('[data-month],[data-rowmonth]').forEach(el=>{let go=()=>{state.detail=el.dataset.month||el.dataset.rowmonth;render()};el.onclick=go;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}}});app.querySelectorAll('[data-qmonth]').forEach(el=>el.onclick=()=>{state.detail=el.dataset.qmonth;render()});let cmp=$('#cmpLast');if(cmp)cmp.onchange=e=>{state.compareIncludeLast=e.target.checked;render()};let t=$('#toggleSleep');if(t)t.onclick=()=>{if(!state.sleep)return;state.sleepMode=state.sleepMode==='calendar'?'window':'calendar';render()};}
function readFile(input,done){let f=input.files?.[0];if(!f)return;let r=new FileReader;r.onload=()=>{let o;try{o=JSON.parse(r.result)}catch{show('Файл не является корректным JSON.',true);return}
 // Only our own validation messages are shown: a parser message can quote file contents.
 try{done(o)}catch(e){show(e instanceof InputError?e.message:'Не удалось обработать файл.',true)}};r.onerror=()=>show('Не удалось прочитать файл.',true);r.readAsText(f);input.value=''}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',x===b));render()});['from','to','scale','coverage','preset'].forEach(id=>$('#'+id).onchange=e=>{if(id==='preset'){let ms=months(),v=e.target.value,last=ms.at(-1);if(v==='all'){$('#from').value=ms[0];$('#to').value=last}if(v==='year'){$('#from').value=last.slice(0,4)+'-01';$('#to').value=last}if(v==='12'){$('#from').value=ms.at(-12)||ms[0];$('#to').value=last}}render()});
// Тема. По умолчанию — системная настройка; тумблер в шапке переключает на этот сеанс и
// ничего не записывает: страница ничего не помнит между запусками (см. PRIVACY).
const THEME_ICON={sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'};
const systemDark=()=>window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
function currentTheme(){return document.documentElement.dataset.theme||(systemDark()?'dark':'light')}
function paintTheme(){let b=$('#theme');if(!b)return;let dark=currentTheme()==='dark',label=dark?'Светлая тема':'Тёмная тема';b.innerHTML=dark?THEME_ICON.sun:THEME_ICON.moon;b.setAttribute('aria-label',label);b.title=label;b.dataset.theme=dark?'dark':'light'}
function setTheme(t){document.documentElement.dataset.theme=t;state.theme=t;paintTheme()}
function bindTheme(){let b=$('#theme');if(!b)return;b.onclick=()=>setTheme(currentTheme()==='dark'?'light':'dark');if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paintTheme);paintTheme()}
bindTheme();$('#reset').onclick=()=>{$('#from').value='';$('#to').value='';$('#scale').value='month';$('#coverage').value='0';$('#preset').value='all';state={main:null,sleep:null,chartKind:{},smooth:{},sleepMode:'window',isDemo:false,imported:false,fromArchive:false,tab:'story',metric:'steps',detail:null,notes:[],birthYear:state.birthYear,birthText:state.birthText,sex:state.sex};document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab==='story'));render()};$('#mainFile').onchange=e=>readFile(e.target,o=>{let note=validateMain(o);state.main=o;state.sleep=null;state.sleepMode='calendar';state.isDemo=false;state.imported=true;state.fromArchive=false;state.metric=activeMetrics()[0]||'steps';state.detail=null;initControls();render();show(('Основной набор импортирован локально. Сон очищен, чтобы не смешивать наборы. '+note).trim())});$('#sleepFile').onchange=e=>readFile(e.target,o=>{validateSleep(o);state.sleep=o;state.sleepMode='window';render();show('Файл окон сна импортирован локально.')});
/*__STORY__*/
/*__ARCHIVE__*/
// Чтение своей выгрузки прямо в странице. Файл никуда не уходит: сеть запрещена CSP,
// в хранилище браузера ничего не пишется. Отмена оставляет прежние данные нетронутыми.
let archiveJob=null,archiveShown=-1;
// Стартовый экран: те же два поля, что и в «Главном», тот же state.
function bindStart(){let b=HealthUI.control('startBirth'),s=HealthUI.control('startSex'),o=HealthUI.control('startOpen');if(!b)return;
 b.value=state.birthText==null?(state.birthYear==null?'':String(state.birthYear)):state.birthText;
 b.oninput=e=>{let v=e.target.value,t=v.trim(),num=Number(t);state.birthText=v;state.birthYear=/^\d{4}$/.test(t)&&num>1900&&num<2100?num:null};
 s.value=state.sex||'';s.onchange=e=>{state.sex=e.target.value==='m'||e.target.value==='f'?e.target.value:null};
 o.onclick=()=>$('#archiveFile').click()}
// Лента лет: от года рождения (или сорока лет назад, если он не указан) к текущему году.
let loadYears=[];
function buildYears(){let now=new Date().getFullYear(),from=state.birthYear||now-40;loadYears=[];for(let y=from;y<=now;y++)loadYears.push(y);let box=HealthUI.control('loadYears');box.replaceChildren(...loadYears.map(y=>{let e=document.createElement('span');e.textContent=y;e.dataset.year=y;return e}));HealthUI.control('loadNote').textContent=state.birthYear?'Листаю годы от '+from+' к '+now+'.':'Год рождения не указан: лента идёт за сорок лет.'}
function stepYears(fraction){if(!loadYears.length)return;let idx=Math.min(loadYears.length-1,Math.floor(fraction*loadYears.length)),cur=loadYears[idx];HealthUI.control('loadYear').textContent=cur;HealthUI.control('loadStage').textContent=fraction<=0?'Открываю архив':fraction<.97?'Читаю записи':'Свожу дни и месяцы';HealthUI.control('loadYears').querySelectorAll('span').forEach((e,i)=>e.dataset.state=i<idx?'past':i===idx?'now':'')}
function archiveBusy(on){$('#archiveProgress').classList.toggle('hidden',!on);$('#resetHint').classList.toggle('hidden',on)}
// Процент по прочитанным сжатым байтам. Перерисовка только при смене целого процента.
function archiveStep(fraction){let percent=Math.round(fraction*100);if(percent===archiveShown)return;archiveShown=percent;$('#archivePercent').textContent=percent<97?'Читаю архив':'Свожу дни и месяцы';stepYears(fraction)}
// Экран чтения живёт не меньше трёх секунд. Маленький архив читается за доли секунды,
// и без этого лента лет мелькала бы: человек не успевал понять, что вообще произошло.
// Дочитали раньше — лента всё равно долистывает до конца, и только потом открывается дашборд.
const READ_MIN_MS=3000;
function finishYears(startedAt,signal){
 return new Promise((resolve,reject)=>{
  let from=archiveShown<0?0:archiveShown/100,
      left=Math.max(0,READ_MIN_MS-(Date.now()-startedAt));
  if(left<=0&&from>=1){archiveStep(1);resolve();return}
  let t0=Date.now(),span=Math.max(left,240),
      tick=()=>{
       // Отмена во время долистывания — тоже отмена: кнопка обещает вернуть на старт, и прочитанное
       // отбрасывается, даже если разбор уже закончился.
       if(signal&&signal.aborted){reject(new HealthArchive.ArchiveError('cancelled','cancelled'));return}
       let k=Math.min(1,(Date.now()-t0)/span);
       archiveStep(from+(1-from)*k);
       if(k<1)requestAnimationFrame(tick);else resolve()};
  requestAnimationFrame(tick)})}
async function openArchive(file){
 let control=new AbortController(),startedAt=Date.now();archiveJob=control;archiveShown=-1;archiveBusy(true);buildYears();renderShell();archiveStep(0);dropToasts(true);
 try{
  let out=await HealthArchive.read(file,{onProgress:archiveStep,signal:control.signal});
  // Собственный разбор проходит ту же проверку, что и чужой файл: одна дверь, один контроль.
  validateMain(out.main);validateSleep(out.sleep);
  await finishYears(startedAt,control.signal);
  Object.assign(state,{main:out.main,sleep:out.sleep,sleepMode:'window',detail:null});
  // Синтетический архив из команды demo помечается, чтобы никто не принял его за свои данные.
  state.isDemo=/^fake_archive\.zip$/i.test(file.name||'');state.imported=false;state.fromArchive=true;state.tab='story';
  document.querySelectorAll('[data-tab]').forEach(x=>x.setAttribute('aria-selected',x.dataset.tab==='story'));
  state.metric=activeMetrics()[0]||'steps';
  initControls();render();
  show('Архив прочитан здесь, в браузере. Данные никуда не отправлены и нигде не сохранены: они исчезнут вместе с вкладкой.');
 }catch(e){
  // Наружу выходят только свои тексты: чужое сообщение может процитировать содержимое файла.
  if(e instanceof HealthArchive.ArchiveError)show(e.code==='cancelled'?(hasData()?'Чтение отменено. Прежние данные на месте.':'Чтение отменено. Ничего не загружено.'):e.message,e.code!=='cancelled');
  else if(e instanceof InputError)show(e.message,true);
  else show('Не удалось прочитать архив.',true);
 }finally{archiveJob=null;archiveBusy(false);renderShell()}
}
$('#archiveCancel').onclick=()=>{if(archiveJob)archiveJob.abort()};
$('#archiveFile').onchange=e=>{let f=e.target.files&&e.target.files[0];e.target.value='';if(f)openArchive(f)};

// Шов для проверок интерфейса. Тесты держатся за него, а не за разметку и не за
// случайные глобальные имена: надстройка этапа 3 меняет внутренности, но обязана
// сохранить этот объект и атрибуты data-ui / data-role.
const HealthUI={
 version:1,
 state:()=>state,
 sportYears,setTheme,currentTheme,sleepStages,
 setState:patch=>Object.assign(state,patch),
 control:name=>document.querySelector('[data-ui="'+name+'"]'),
 fragment:markup=>{let t=document.createElement('template');t.innerHTML=markup;return t.content},
 linePath:markup=>{let p=HealthUI.fragment(markup).querySelector('[data-role="line"]');return p?p.getAttribute('d'):null},
 chartDots:markup=>HealthUI.fragment(markup).querySelectorAll('[data-role="dot"]').length,
 chartText:markup=>HealthUI.fragment(markup).textContent,
 periodValue,chart,smoothRows,smoothRowsN,comparePairs,validateMain,validateSleep,render,notify,dropToasts,
 story:STORY,
 // Ядро чтения архива: проверки держатся за этот шов, а не за внутренности.
 archive:HealthArchive
};
window.HealthUI=HealthUI;
if(hasData())initControls();render();
