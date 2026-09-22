// Разбор выгрузки Apple Health прямо в странице: zip -> записи -> те же два объекта,
// что собирает команда build. Эталон — Python; расхождение ловит tests/test_archive_equivalence.py.
// Без библиотек и без сети: только Blob, DecompressionStream и TextDecoder.
// Ничего не записывается: ни localStorage, ни IndexedDB. Данные живут до закрытия вкладки.
const HealthArchive=(()=>{
'use strict';

class ArchiveError extends Error{constructor(code,message){super(message);this.code=code}}
const fail=(code,message)=>{throw new ArchiveError(code,message)};
const NOT_EXPORT='Это не похоже на выгрузку Apple Health: внутри архива нет файла с данными.';
const BROKEN='Архив не читается: похоже, файл повреждён или это не zip.';
const OLD='Браузер слишком старый для чтения архива. Обновите его или соберите дашборд командой build.';

// --- Календарь без Date: часовой пояс браузера не должен влиять на результат. ---------------
// Смещение записи берётся из самой записи, как в Python (datetime с фиксированным смещением).
function daysFromCivil(y,m,d){
 if(m<=2)y-=1;
 const era=Math.floor(y/400),yoe=y-era*400;
 const doy=Math.floor((153*(m+(m>2?-3:9))+2)/5)+d-1;
 const doe=yoe*365+Math.floor(yoe/4)-Math.floor(yoe/100)+doy;
 return era*146097+doe-719468;
}
function civilFromDays(z){
 z+=719468;
 const era=Math.floor(z/146097),doe=z-era*146097;
 const yoe=Math.floor((doe-Math.floor(doe/1460)+Math.floor(doe/36524)-Math.floor(doe/146096))/365);
 const y=yoe+era*400,doy=doe-(365*yoe+Math.floor(yoe/4)-Math.floor(yoe/100));
 const mp=Math.floor((5*doy+2)/153),d=doy-Math.floor((153*mp+2)/5)+1,m=mp+(mp<10?3:-9);
 return [m<=2?y+1:y,m,d];
}
const pad=(v,n)=>String(v).padStart(n,'0');
const dayString=z=>{const c=civilFromDays(z);return c[0]+'-'+pad(c[1],2)+'-'+pad(c[2],2)};
const daysInMonth=(y,m)=>[31,(y%4===0&&y%100!==0)||y%400===0?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
const calendarDays=month=>daysInMonth(Number(month.slice(0,4)),Number(month.slice(5,7)));
const dayNumber=s=>daysFromCivil(+s.slice(0,4),+s.slice(5,7),+s.slice(8,10));

const STAMP=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2}):?(\d{2})$/;
/** Дословный аналог parse.stamp: секунды эпохи и смещение самой записи. */
function stamp(s){
 const m=STAMP.exec(s||'');
 if(!m)fail('record','bad timestamp');
 const y=+m[1],mo=+m[2],d=+m[3],hh=+m[4],mm=+m[5],ss=+m[6];
 if(mo<1||mo>12||d<1||d>daysInMonth(y,mo)||hh>23||mm>59||ss>59||+m[9]>59)fail('record','bad timestamp');
 const off=(m[7]==='-'?-1:1)*(+m[8]*3600+ +m[9]*60);
 return {t:daysFromCivil(y,mo,d)*86400+hh*3600+mm*60+ss-off,off:off};
}

/** parse.pieces: деление по локальной полуночи смещения начала, доли по секундам. */
function pieces(a,b,off,emit){
 if(b<=a){emit(dayString(Math.floor((a+off)/86400)),a,a,1.0);return}
 const total=b-a;
 let cur=a;
 while(cur<b){
  const day=Math.floor((cur+off)/86400);
  const edge=Math.min(b,(day+1)*86400-off);
  emit(dayString(day),cur,edge,(edge-cur)/total);
  cur=edge;
 }
}

/** parse.union: длительность объединения интервалов и признак пересечения. */
function union(list){
 const iv=list.slice().sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
 let end=null,seconds=0,overlap=false;
 for(const pair of iv){
  const a=pair[0],b=pair[1];
  if(end!==null&&a<end)overlap=true;
  seconds+=Math.max(0,b-Math.max(a,end===null?a:end));
  end=Math.max(b,end===null?b:end);
 }
 return [seconds,overlap];
}

// --- Показатели и единицы: таблицы parse.py, перенесённые без изменений. --------------------
const METRICS={
 StepCount:['steps','count','sum'],
 DistanceWalkingRunning:['walk_run_km','km','sum'],
 DistanceCycling:['cycling_km','km','sum'],
 DistanceSwimming:['swimming_km','km','sum'],
 AppleExerciseTime:['exercise_min','min','sum'],
 ActiveEnergyBurned:['active_kcal','kcal','sum'],
 RestingHeartRate:['resting_hr','count/min','mean'],
 HeartRate:['heart_rate','count/min','mean'],
 HeartRateVariabilitySDNN:['hrv_ms','ms','mean'],
 VO2Max:['vo2max','mL/min·kg','mean'],
 SleepAnalysis:['sleep_hours','h','sleep']
};
const ASLEEP=new Set(['HKCategoryValueSleepAnalysisAsleep','HKCategoryValueSleepAnalysisAsleepUnspecified','HKCategoryValueSleepAnalysisAsleepCore','HKCategoryValueSleepAnalysisAsleepDeep','HKCategoryValueSleepAnalysisAsleepREM','1','3','4','5']);
const INBED=new Set(['HKCategoryValueSleepAnalysisInBed','0']);
const AWAKE=new Set(['HKCategoryValueSleepAnalysisAwake','2']);
const WINDOW_VALUES=new Set([...ASLEEP,...AWAKE]);
const FACTORS={'m|km':0.001,'mi|km':1.609344,'kJ|kcal':1/4.184,'s|min':1/60,'s|ms':1000,'mL/kg/min|mL/min·kg':1};
const NUMBER=/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function normalize(value,unit,target){
 const s=String(value===undefined||value===null?'':value).trim();
 if(!NUMBER.test(s))fail('record','invalid value');
 const v=Number(s);
 if(!Number.isFinite(v)||v<0)fail('record','invalid value');
 if(unit===target)return v;
 const f=FACTORS[unit+'|'+target];
 if(f===undefined)fail('record','unsupported unit');
 return v*f;
}
const sleepMetric=v=>ASLEEP.has(v)?'sleep_hours':INBED.has(v)?'sleep_inbed_hours':AWAKE.has(v)?'sleep_awake_hours':null;
// Стадия внутри сна, как в parse.sleep_stage: запись без стадии идёт в «без стадии».
const STAGES={'HKCategoryValueSleepAnalysisAsleepCore':'sleep_core_hours','3':'sleep_core_hours','HKCategoryValueSleepAnalysisAsleepDeep':'sleep_deep_hours','4':'sleep_deep_hours','HKCategoryValueSleepAnalysisAsleepREM':'sleep_rem_hours','5':'sleep_rem_hours'};
const sleepStage=v=>ASLEEP.has(v)?(STAGES[v]||'sleep_unspecified_hours'):null;

const DEVICE_ADDRESS=/^(\s*<+HKDevice:\s*)0x[0-9a-fA-F]+(?=\s*[,;>])/;
const normalizedDevice=text=>String(text||'').replace(DEVICE_ADDRESS,'$1[representation-address]');
const sourceKey=x=>[x.sourceName||'',x.sourceVersion||'',normalizedDevice(x.device||'')];
function sourceCategory(key){
 const name=key[0].toLowerCase(),device=key[2].toLowerCase();
 return name.includes('watch')||device.includes('watch')?'Apple Watch'
      :name.includes('iphone')||device.includes('iphone')?'iPhone':'Other/unknown';
}

// --- sha256: отпечаток ключа источника обязан совпадать с Python бит в бит. ------------------
const K256=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256Hex(bytes){
 const len=bytes.length,total=(len+9+63)&~63,buf=new Uint8Array(total);
 buf.set(bytes);buf[len]=0x80;
 const dv=new DataView(buf.buffer);
 dv.setUint32(total-4,(len*8)>>>0);dv.setUint32(total-8,Math.floor(len/536870912));
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const w=new Uint32Array(64);
 for(let i=0;i<total;i+=64){
  for(let t=0;t<16;t++)w[t]=dv.getUint32(i+t*4);
  for(let t=16;t<64;t++){
   const x=w[t-15],y=w[t-2];
   const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
   const s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
   w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;
  }
  let a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
  for(let t=0;t<64;t++){
   const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
   const ch=(e&f)^(~e&g);
   const t1=(hh+S1+ch+K256[t]+w[t])>>>0;
   const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
   const maj=(a&b)^(a&c)^(b&c);
   const t2=(S0+maj)>>>0;
   hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;
  h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
 }
 let out='';
 for(let i=0;i<8;i++)out+=h[i].toString(16).padStart(8,'0');
 return out;
}
// json.dumps(list(key),ensure_ascii=False): разделитель ", ", экранирование строк то же,
// что у JSON.stringify. Отпечаток — тай-брейк при выборе источника, он обязан совпасть.
const sourceKeyHash=key=>sha256Hex(new TextEncoder().encode('['+key.map(s=>JSON.stringify(s)).join(', ')+']')).slice(0,16);

// --- Дедупликация: 64-битный ключ в типизированной таблице. ---------------------------------
// Отличие от Python записано отдельно: там sha256, здесь 64 бита ради памяти.
function hash64(s){
 let h1=0x811c9dc5|0,h2=0x01000193|0;
 for(let i=0;i<s.length;i++){
  const c=s.charCodeAt(i);
  h1=Math.imul(h1^c,16777619);
  h2=Math.imul(h2^c,2246822519);h2=(h2<<13)|(h2>>>19);
 }
 return [h1|0,h2|0];
}
class Seen{
 constructor(){this.cap=1<<16;this.hi=new Int32Array(this.cap);this.lo=new Int32Array(this.cap);this.n=0}
 /** true — запись новая; false — точный повтор, как `INSERT OR IGNORE` в Python. */
 add(key){
  const pair=hash64(key);
  return this.put(pair[0],pair[1]===0&&pair[0]===0?1:pair[1]);
 }
 put(h,l){
  const mask=this.cap-1;
  let i=(l^Math.imul(h,0x9e3779b1))&mask;
  for(;;){
   const H=this.hi[i],L=this.lo[i];
   if(H===0&&L===0){this.hi[i]=h;this.lo[i]=l;this.n++;if(this.n*5>this.cap*3)this.grow();return true}
   if(H===h&&L===l)return false;
   i=(i+1)&mask;
  }
 }
 grow(){
  const hi=this.hi,lo=this.lo;
  this.cap<<=1;this.hi=new Int32Array(this.cap);this.lo=new Int32Array(this.cap);this.n=0;
  for(let i=0;i<hi.length;i++)if(hi[i]!==0||lo[i]!==0)this.put(hi[i],lo[i]);
 }
}

// --- Zip: оглавление читается с конца файла, поток распаковывается на лету. -----------------
const u16=(dv,o)=>dv.getUint16(o,true), u32=(dv,o)=>dv.getUint32(o,true);
const u64=(dv,o)=>Number(dv.getBigUint64(o,true));

async function centralDirectory(blob){
 const tailSize=Math.min(blob.size,66000);
 const tail=new DataView(await blob.slice(blob.size-tailSize).arrayBuffer());
 let eocd=-1;
 for(let i=tailSize-22;i>=0;i--)if(u32(tail,i)===0x06054b50){eocd=i;break}
 if(eocd<0)fail('broken',BROKEN);
 let count=u16(tail,eocd+10),size=u32(tail,eocd+12),offset=u32(tail,eocd+16);
 if(count===0xffff||size===0xffffffff||offset===0xffffffff){
  // zip64: выгрузка может быть больше 4 ГБ.
  const loc=eocd-20;
  if(loc<0||u32(tail,loc)!==0x07064b50)fail('broken',BROKEN);
  const at=u64(tail,loc+8);
  const z=new DataView(await blob.slice(at,at+56).arrayBuffer());
  if(u32(z,0)!==0x06064b50)fail('broken',BROKEN);
  count=u64(z,32);size=u64(z,40);offset=u64(z,48);
 }
 const dv=new DataView(await blob.slice(offset,offset+size).arrayBuffer());
 const dec=new TextDecoder('utf-8');
 const entries=[];let p=0;
 for(let k=0;k<count&&p+46<=dv.byteLength;k++){
  if(u32(dv,p)!==0x02014b50)break;
  const nameLen=u16(dv,p+28),extraLen=u16(dv,p+30),commentLen=u16(dv,p+32);
  const e={name:dec.decode(new Uint8Array(dv.buffer,dv.byteOffset+p+46,nameLen)),
           method:u16(dv,p+10),csize:u32(dv,p+20),usize:u32(dv,p+24),offset:u32(dv,p+42)};
  let x=p+46+nameLen;
  const extraEnd=x+extraLen;
  while(x+4<=extraEnd){
   const id=u16(dv,x),len=u16(dv,x+2);let f=x+4;
   if(id===0x0001){
    if(e.usize===0xffffffff&&f+8<=extraEnd){e.usize=u64(dv,f);f+=8}
    if(e.csize===0xffffffff&&f+8<=extraEnd){e.csize=u64(dv,f);f+=8}
    if(e.offset===0xffffffff&&f+8<=extraEnd){e.offset=u64(dv,f);f+=8}
   }
   x+=4+len;
  }
  entries.push(e);
  p=extraEnd+commentLen;
 }
 if(!entries.length)fail('broken',BROKEN);
 return entries;
}

async function entryStream(blob,entry){
 const head=new DataView(await blob.slice(entry.offset,entry.offset+30).arrayBuffer());
 if(u32(head,0)!==0x04034b50)fail('broken',BROKEN);
 const start=entry.offset+30+u16(head,26)+u16(head,28);
 const stream=blob.slice(start,start+entry.csize).stream();
 if(entry.method===0)return stream;
 if(entry.method!==8)fail('broken',BROKEN);
 if(typeof DecompressionStream!=='function')fail('old',OLD);
 return stream.pipeThrough(new DecompressionStream('deflate-raw'));
}

// --- Потоковый сканер XML: только открывающие теги Record и Workout, только атрибуты. -------
const ENTITY={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
function unescapeXml(s){
 if(s.indexOf('&')<0)return s;
 return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g,(all,body)=>{
  if(body[0]==='#'){
   const code=body[1]==='x'||body[1]==='X'?parseInt(body.slice(2),16):parseInt(body.slice(1),10);
   return Number.isFinite(code)&&code>=0&&code<=0x10ffff?String.fromCodePoint(code):all;
  }
  return ENTITY[body]!==undefined?ENTITY[body]:all;
 });
}
const isSpace=c=>c===' '||c==='\n'||c==='\t'||c==='\r';

/** Проходит поток и зовёт onTag('Record'|'Workout', attrs). Файл целиком в память не попадает. */
async function scanXml(stream,onTag,abort,onBytes){
 const reader=stream.getReader(),dec=new TextDecoder('utf-8');
 let buf='',pos=0,eof=false,ticks=0,yielded=Date.now();
 async function more(){
  if(eof)return false;
  // Отмена проверяется на каждом куске потока, а не только раз в тысячу тегов:
  // иначе короткий архив успел бы дочитаться после нажатия «Отменить».
  if(abort)abort();
  // Уступка интерфейсу настоящей задачей, а не микрозадачей: await на готовом обещании
  // не даёт браузеру перерисовать экран, и вкладка выглядит замершей до самого конца.
  if(Date.now()-yielded>50){yielded=Date.now();await new Promise(resume=>setTimeout(resume,0))}
  const r=await reader.read();
  if(r.done){eof=true;const tail=dec.decode();if(tail){buf+=tail;return true}return false}
  if(onBytes)onBytes(r.value.byteLength);
  buf+=dec.decode(r.value,{stream:true});
  return true;
 }
 async function need(i){while(buf.length<=i)if(!await more())return false;return true}
 async function findFrom(sub,from){
  let i=buf.indexOf(sub,from);
  while(i<0){if(!await more())return -1;i=buf.indexOf(sub,from)}
  return i;
 }
 // Значение атрибута может содержать '>', поэтому пропуск тега считается с кавычками.
 async function skipTag(i){
  let q='';
  for(;;){
   if(!await need(i))return buf.length;
   const c=buf[i];
   if(q){if(c===q)q=''}
   else if(c==='"'||c==="'")q=c;
   else if(c==='>')return i+1;
   i++;
  }
 }
 // DTD в начале выгрузки объявляет те же имена Record и Workout: её надо пропустить целиком.
 async function skipDoctype(i){
  let q='';
  for(;;){
   if(!await need(i))return buf.length;
   const c=buf[i];
   if(q){if(c===q)q=''}
   else if(c==='"'||c==="'")q=c;
   else if(c==='['){const e=await findFrom(']',i+1);return e<0?buf.length:await skipTag(e+1)}
   else if(c==='>')return i+1;
   i++;
  }
 }
 async function parseAttrs(i){
  const attrs={};
  for(;;){
   while(await need(i)&&isSpace(buf[i]))i++;
   if(!await need(i))return {attrs:attrs,end:buf.length};
   const c=buf[i];
   if(c==='>')return {attrs:attrs,end:i+1};
   if(c==='/')return {attrs:attrs,end:await skipTag(i)};
   let j=i;
   while(await need(j)&&buf[j]!=='='&&!isSpace(buf[j])&&buf[j]!=='>'&&buf[j]!=='/')j++;
   const name=buf.slice(i,j);
   while(await need(j)&&isSpace(buf[j]))j++;
   if(!await need(j)||buf[j]!=='='){i=j+(name?0:1);continue}
   j++;
   while(await need(j)&&isSpace(buf[j]))j++;
   if(!await need(j))return {attrs:attrs,end:buf.length};
   const q=buf[j];
   if(q!=='"'&&q!=="'"){i=j+1;continue}
   const k=await findFrom(q,j+1);
   if(k<0)return {attrs:attrs,end:buf.length};
   attrs[name]=unescapeXml(buf.slice(j+1,k));
   i=k+1;
  }
 }
 try{
  for(;;){
   if(pos>1048576){buf=buf.slice(pos);pos=0}
   if(abort&&((++ticks)&1023)===0)abort();
   const lt=await findFrom('<',pos);
   if(lt<0)break;
   if(!await need(lt+1))break;
   const c=buf[lt+1];
   if(c==='?'){const e=await findFrom('?>',lt+2);if(e<0)break;pos=e+2;continue}
   if(c==='!'){
    await need(lt+9);
    if(buf.startsWith('<!--',lt)){const e=await findFrom('-->',lt+4);if(e<0)break;pos=e+3;continue}
    if(buf.startsWith('<![CDATA[',lt)){const e=await findFrom(']]>',lt+9);if(e<0)break;pos=e+3;continue}
    if(buf.startsWith('<!DOCTYPE',lt)){pos=await skipDoctype(lt+9);continue}
    pos=await skipTag(lt+2);continue;
   }
   if(c==='/'){pos=await skipTag(lt+2);continue}
   let j=lt+1;
   while(await need(j)&&!isSpace(buf[j])&&buf[j]!=='/'&&buf[j]!=='>')j++;
   const name=buf.slice(lt+1,j);
   if(name==='Record'||name==='Workout'){const r=await parseAttrs(j);pos=r.end;onTag(name,r.attrs)}
   else pos=await skipTag(j);
  }
 }finally{
  try{await reader.cancel()}catch(e){}
 }
}

/** Имя первого элемента: так находится XML с корнем HealthData. */
function firstElementName(text){
 let i=0;
 for(;;){
  const lt=text.indexOf('<',i);
  if(lt<0)return null;
  const c=text[lt+1];
  if(c===undefined)return null;
  if(c==='?'){const e=text.indexOf('?>',lt+2);if(e<0)return null;i=e+2;continue}
  if(c==='!'){
   if(text.startsWith('<!--',lt)){const e=text.indexOf('-->',lt+4);if(e<0)return null;i=e+3;continue}
   const open=text.indexOf('[',lt),gt=text.indexOf('>',lt);
   if(open>=0&&(gt<0||open<gt)){
    const close=text.indexOf(']',open+1);if(close<0)return null;
    const end=text.indexOf('>',close);if(end<0)return null;
    i=end+1;continue;
   }
   if(gt<0)return null;
   i=gt+1;continue;
  }
  let j=lt+1;
  while(j<text.length&&!isSpace(text[j])&&text[j]!=='/'&&text[j]!=='>')j++;
  return text.slice(lt+1,j);
 }
}

async function readPrefix(stream,limit){
 const reader=stream.getReader(),dec=new TextDecoder('utf-8');
 let text='';
 try{
  while(text.length<limit){
   const r=await reader.read();
   if(r.done)break;
   text+=dec.decode(r.value,{stream:true});
  }
 }finally{
  try{await reader.cancel()}catch(e){}
 }
 return text;
}

/** parse.find_health_xml: имя локализовано, рядом лежит export_cda.xml — ищем по корню. */
async function findHealthXml(blob,entries){
 const matches=entries.filter(e=>e.name==='export.xml'||e.name.endsWith('/export.xml'));
 if(!matches.length){
  for(const e of entries){
   if(!e.name.toLowerCase().endsWith('.xml'))continue;
   try{
    if(firstElementName(await readPrefix(await entryStream(blob,e),262144))==='HealthData')matches.push(e);
   }catch(err){
    if(err instanceof ArchiveError&&err.code==='old')throw err;
   }
  }
 }
 if(matches.length!==1)fail('not-export',NOT_EXPORT);
 return matches[0];
}

// --- Тексты определений. Расхождение с Python ловит проверка эквивалентности. ---------------
const METHOD='Предварительный выбор источника по дням: сначала категория Apple Watch, затем больше дней '+
 'наблюдений внутри показателя и месяца, затем отпечаток ключа источника. Один источник на день, источники '+
 'никогда не складываются. Даты берутся у источника рангом ниже только там, где старший источник '+
 'молчит. Это не воспроизводит приоритеты приложения «Здоровье»; спорные дни помечены. '+
 'Сон здесь — длительность по календарным дням.';
const SLEEP_DEFINITION='Объединение интервалов сна внутри окна от полудня до полудня по местному смещению; '+
 'окно помечено датой своего конца. Дневной сон входит. Окно не обязано быть полной ночью. '+
 'Порога «нормы сна» и диагноза здесь нет. Один источник на окно, тот же предварительный '+
 'ранг источников, что и в основном отчёте.';

const STAGE_METRICS=['sleep_core_hours','sleep_deep_hours','sleep_rem_hours','sleep_unspecified_hours'];
const CORE=new Set(['steps','exercise_min','walk_run_km','cycling_km','swimming_km','resting_hr','vo2max','sleep_hours',...STAGE_METRICS]);
const MEANS=new Set(['resting_hr','vo2max','sleep_hours',...STAGE_METRICS]);
const relevant=m=>CORE.has(m)||m.startsWith('workout_');
// round(x,4) в Python округляет по точному значению double, ровную половину — к чётному.
// toFixed берёт то же точное значение, но половину уводит вверх: 60.03125 -> 60.0313 против 60.0312.
const TIE='5'+'0'.repeat(55);
function round4(v){
 const up=v.toFixed(4),exact=v.toFixed(60),cut=exact.indexOf('.')+5;
 if(exact.slice(cut)!==TIE||Number(up[up.length-1])%2===0)return Number(up);
 return Number(exact.slice(0,cut));
}
function median(sorted){
 const n=sorted.length,mid=n>>1;
 return n%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
function counter(values){
 const m=new Map();
 for(const v of values)m.set(v,(m.get(v)||0)+1);
 return m;
}
const asObject=m=>{const o={};for(const pair of m)o[pair[0]]=pair[1];return o};

class Registry{
 constructor(){this.ids=new Map();this.keys=[]}
 idFor(attrs){
  const key=sourceKey(attrs),k=key.join(' ');
  let id=this.ids.get(k);
  if(id===undefined){
   id='S'+pad(this.ids.size+1,3);
   this.ids.set(k,id);this.keys.push([id,key]);
  }
  return id;
 }
 labels(){const m=new Map();for(const p of this.keys)m.set(p[0],sourceCategory(p[1])+'; version '+p[1][1]);return m}
 hashes(){const m=new Map();for(const p of this.keys)m.set(p[0],sourceKeyHash(p[1]));return m}
}

/** Один проход по архиву: порядок действий тот же, что в pipeline.run. */
async function collect(blob,entry,opts){
 const counters={duplicates_removed:0,invalid_or_unsupported:0,records:0,workouts:0,timezone_offset_changes_within_record:0};
 const registry=new Registry(),seen=new Seen();
 const chunks=new Map(),windows=new Map();
 const sleepSources=new Set();
 let sleepOffsets=0;
 const chunk=(metric,sid,day,a,b,value,kind)=>{
  const k=metric+' '+sid+' '+day;
  let g=chunks.get(k);
  if(!g){g={metric:metric,source:sid,day:day,kind:kind,sum:0,n:0,iv:[]};chunks.set(k,g)}
  g.sum+=value;g.n++;g.iv.push([a,b]);
 };
 const addWindow=(kind,sid,day,a,b)=>{
  const k=kind+' '+sid+' '+day;
  let g=windows.get(k);
  if(!g){g={kind:kind,source:sid,day:day,iv:[]};windows.set(k,g)}
  g.iv.push([a,b]);
 };
 const onTag=(tag,x)=>{
  try{
   const a=stamp(x.startDate),b=stamp(x.endDate);
   if(b.t<a.t)fail('record','negative interval');
   const sid=registry.idFor(x);
   const typ=x.type!==undefined?x.type:(x.workoutActivityType!==undefined?x.workoutActivityType:'Workout');
   counters[tag==='Record'?'records':'workouts']++;
   let spec=null;
   for(const prefix of ['HKQuantityTypeIdentifier','HKCategoryTypeIdentifier'])
    if(typ.startsWith(prefix)&&METRICS[typ.slice(prefix.length)]){spec=METRICS[typ.slice(prefix.length)];break}
   if(tag==='Workout')spec=[typ.startsWith('HKWorkoutActivityType')?'workout_'+typ.slice(21):'workout_'+typ,'min','workout'];
   if(!spec)return;
   let metric=spec[0];
   const unit=spec[1],kind=spec[2];
   const val=x.value!==undefined?x.value:'';
   const windowed=kind==='sleep'&&WINDOW_VALUES.has(val);
   if(windowed){
    // Область счётчика — записи сна до дедупликации, как в Python.
    sleepSources.add(sid);
    if(b.t>a.t&&a.off!==b.off)sleepOffsets++;
   }
   const key=[tag,typ,sid,x.startDate,x.endDate,x.value,x.unit,x.duration,x.durationUnit]
    .map(v=>v===undefined?'':String(v)).join('');
   if(!seen.add(key)){counters.duplicates_removed++;return}
   if(a.off!==b.off)counters.timezone_offset_changes_within_record++;
   let value=0,stage=null;
   if(kind==='sleep'){
    metric=sleepMetric(val);
    if(metric===null)fail('record','unknown sleep category');
    stage=sleepStage(val);
    // Оконные строки требуют строго b>a: иначе pieces отдаёт кусок нулевой длины.
    if(windowed&&b.t>a.t)
     pieces(a.t-43200,b.t-43200,a.off,(day,s,e)=>
      addWindow(ASLEEP.has(val)?'asleep':'awake',sid,dayString(dayNumber(day)+1),s+43200,e+43200));
   }else if(kind==='workout'){
    value=normalize(x.duration,x.durationUnit!==undefined?x.durationUnit:'min','min');
    chunk(metric+'_count',sid,dayString(Math.floor((a.t+a.off)/86400)),a.t,a.t,1,'sum');
   }else{
    value=normalize(x.value,x.unit!==undefined?x.unit:'',unit);
   }
   if(kind==='mean')chunk(metric,sid,dayString(Math.floor((a.t+a.off)/86400)),a.t,b.t,value,kind);
   else pieces(a.t,b.t,a.off,(day,s,e,fraction)=>chunk(metric,sid,day,s,e,value*fraction,kind));
   // Та же запись под именем стадии: объединение за день считается для стадии отдельно.
   if(stage)pieces(a.t,b.t,a.off,(day,s,e)=>chunk(stage,sid,day,s,e,0,kind));
  }catch(err){
   if(err instanceof ArchiveError&&err.code==='record')counters.invalid_or_unsupported++;
   else throw err;
  }
 };
 let read=0;const total=entry.usize||entry.csize||1;
 const onBytes=opts.onProgress?n=>{read+=n;opts.onProgress(Math.min(1,read/total))}:null;
 const abort=opts.signal?()=>{if(opts.signal.aborted)fail('cancelled','cancelled')}:null;
 await scanXml(await entryStream(blob,entry),onTag,abort,onBytes);
 return {counters:counters,registry:registry,chunks:chunks,windows:windows,
         sleepSources:sleepSources,sleepOffsets:sleepOffsets};
}

/** aggregate.build_daily: части записей -> дни. */
function buildDaily(chunks){
 const rows=[...chunks.values()].sort((x,y)=>
  x.metric<y.metric?-1:x.metric>y.metric?1:
  x.source<y.source?-1:x.source>y.source?1:
  x.day<y.day?-1:x.day>y.day?1:0);
 return rows.map(g=>{
  const u=union(g.iv);
  const value=g.kind==='sleep'?u[0]/3600:g.kind==='mean'?g.sum/g.n:g.sum;
  return {metric:g.metric,source:g.source,day:g.day,value:value,samples:g.n,overlap:u[1]?1:0};
 });
}

/** aggregate.summarize, только строки ALL_SOURCES_COVERAGE_ONLY: их и берёт страница. */
function coverageAndGaps(daily){
 const byMetric=new Map();
 for(const r of daily){
  if(!byMetric.has(r.metric))byMetric.set(r.metric,new Set());
  byMetric.get(r.metric).add(r.day);
 }
 const coverage=[],gaps=[];
 for(const metric of [...byMetric.keys()].sort()){
  const observed=[...byMetric.get(metric)].sort();
  for(let i=1;i<observed.length;i++){
   const delta=dayNumber(observed[i])-dayNumber(observed[i-1])-1;
   if(delta>0)gaps.push({metric:metric,source:'ALL_SOURCES_COVERAGE_ONLY',
    last_observation:observed[i-1],next_observation:observed[i],missing_days_between:String(delta)});
  }
  let i=0;
  while(i<observed.length){
   const year=observed[i].slice(0,4);let j=i;
   while(j<observed.length&&observed[j].slice(0,4)===year)j++;
   coverage.push({metric:metric,source:'ALL_SOURCES_COVERAGE_ONLY',year:year,
    observed_days:String(j-i),first_date:observed[i],last_date:observed[j-1]});
   i=j;
  }
 }
 return {coverage:coverage,gaps:gaps};
}

/** select.choose_month: один источник на день, равенство разрешается отпечатком ключа. */
function chooseMonth(rows,labels,orderKey){
 const counts=counter(rows.map(r=>r.source));
 const ranked=[...counts.keys()].sort((s,t)=>{
  const ws=(labels.get(s)||'').startsWith('Apple Watch;')?0:1;
  const wt=(labels.get(t)||'').startsWith('Apple Watch;')?0:1;
  if(ws!==wt)return ws-wt;
  if(counts.get(s)!==counts.get(t))return counts.get(t)-counts.get(s);
  const ks=orderKey.get(s)||s,kt=orderKey.get(t)||t;
  return ks<kt?-1:ks>kt?1:0;
 });
 const rank=new Map(ranked.map((s,i)=>[s,i]));
 const byDay=new Map();
 for(const r of rows){
  if(!byDay.has(r.day))byDay.set(r.day,[]);
  byDay.get(r.day).push(r);
 }
 const selected=[];let multi=0;
 for(const day of [...byDay.keys()].sort()){
  const candidates=byDay.get(day);
  if(candidates.length>1)multi++;
  let best=candidates[0];
  for(const c of candidates)if(rank.get(c.source)<rank.get(best.source))best=c;
  selected.push(best);
 }
 return {selected:selected,multi:multi,byDay:byDay};
}

/** select.build_package: месячный пакет для интерфейса. Отдельных записей в нём нет. */
function buildPackage(daily,labels,orderKey,counters){
 const grouped=new Map();
 for(const r of daily){
  if(!relevant(r.metric))continue;
  const k=r.metric+' '+r.day.slice(0,7);
  if(!grouped.has(k))grouped.set(k,[]);
  grouped.get(k).push(r);
 }
 const monthly=[];
 for(const k of [...grouped.keys()].sort()){
  const rows=grouped.get(k),cut=k.indexOf(' ');
  const metric=k.slice(0,cut),month=k.slice(cut+1);
  const chosen=chooseMonth(rows,labels,orderKey);
  const values=chosen.selected.map(r=>r.value),n=values.length;
  const total=values.reduce((s,v)=>s+v,0);
  const clean=chosen.selected.filter(r=>!r.overlap).map(r=>r.value);
  let watchMulti=0;
  for(const rr of chosen.byDay.values())
   if(rr.filter(r=>(labels.get(r.source)||'').startsWith('Apple Watch;')).length>1)watchMulti++;
  monthly.push({
   clean_observed_days:clean.length,
   clean_mean_observed_day:clean.length?round4(clean.reduce((s,v)=>s+v,0)/clean.length):null,
   multi_watch_source_days:watchMulti,
   selected_categories:asObject(counter(chosen.selected.map(r=>(labels.get(r.source)||'').split(';')[0]))),
   metric:metric,month:month,
   value:round4(MEANS.has(metric)?total/n:total),
   aggregation:MEANS.has(metric)?'mean_observed_days':'sum',
   observed_days:n,
   calendar_days:calendarDays(month),
   mean_observed_day:round4(total/n),
   median_observed_day:round4(median(values.slice().sort((a,b)=>a-b))),
   overlap_days:chosen.selected.reduce((s,r)=>s+r.overlap,0),
   multi_source_days:chosen.multi,
   selected_sources:asObject(counter(chosen.selected.map(r=>r.source)))
  });
 }
 const cg=coverageAndGaps(daily);
 return {method:METHOD,sources:asObject(labels),quality:counters,
         coverage:cg.coverage.filter(r=>relevant(r.metric)),
         gaps:cg.gaps.filter(r=>relevant(r.metric)&&Number(r.missing_days_between)>=14),
         monthly:monthly};
}

/** sleep.summarize: окна полдень-полдень, один источник на окно. */
function sleepWindows(windows,labels,orderKey,offsetChanges,seenSources){
 const asleep=new Map(),awake=new Map();
 for(const g of windows.values())(g.kind==='asleep'?asleep:awake).set(g.source+' '+g.day,g.iv);
 const groups=new Map();
 for(const k of [...asleep.keys()].sort()){
  const cut=k.indexOf(' '),sid=k.slice(0,cut),day=k.slice(cut+1);
  const intervals=asleep.get(k),u=union(intervals);
  const aw=awake.get(k)||[];
  // Мера пересечения = union(A)+union(B)-union(A+B).
  const conflict=u[0]+union(aw)[0]-union(intervals.concat(aw))[0];
  const month=day.slice(0,7);
  if(!groups.has(month))groups.set(month,[]);
  groups.get(month).push({sid:sid,day:day,hours:u[0]/3600,conflict:conflict>0,overlap:u[1]});
 }
 const monthly=[];
 for(const month of [...groups.keys()].sort()){
  const rows=groups.get(month),counts=counter(rows.map(r=>r.sid));
  const ranked=[...counts.keys()].sort((s,t)=>{
   const ws=(labels.get(s)||'').startsWith('Apple Watch')?0:1;
   const wt=(labels.get(t)||'').startsWith('Apple Watch')?0:1;
   if(ws!==wt)return ws-wt;
   if(counts.get(s)!==counts.get(t))return counts.get(t)-counts.get(s);
   const ks=orderKey.get(s),kt=orderKey.get(t);
   return ks<kt?-1:ks>kt?1:0;
  });
  const order=new Map(ranked.map((s,i)=>[s,i]));
  const days=new Map();
  for(const r of rows){
   if(!days.has(r.day))days.set(r.day,[]);
   days.get(r.day).push(r);
  }
  const chosen=[...days.keys()].sort().map(day=>{
   const rr=days.get(day);let best=rr[0];
   for(const r of rr)if(order.get(r.sid)<order.get(best.sid))best=r;
   return best;
  });
  const values=chosen.map(r=>r.hours);
  monthly.push({month:month,
   mean_hours:round4(values.reduce((s,v)=>s+v,0)/values.length),
   median_hours:round4(median(values.slice().sort((a,b)=>a-b))),
   observed_windows:values.length,
   multi_source_windows:[...days.values()].filter(rr=>rr.length>1).length,
   conflicting_awake_windows:chosen.filter(r=>r.conflict).length,
   shorter_than_3h_windows:values.filter(v=>v<3).length,
   selected_sources:asObject([...counter(chosen.map(r=>r.sid))].sort((a,b)=>a[0]<b[0]?-1:1))});
 }
 const sources={};
 for(const sid of [...seenSources].sort())sources[sid]=labels.get(sid);
 return {definition:SLEEP_DEFINITION,sources:sources,offset_change_intervals:offsetChanges,monthly:monthly};
}

/**
 * Читает выгрузку и возвращает {main, sleep} — те же объекты, что пишет команда build.
 * opts: {onProgress(доля), signal} — прогресс по распакованным байтам, отмена по AbortSignal.
 */
async function read(blob,opts){
 opts=opts||{};
 // Проверяется не только наличие класса, но и сам формат: в Chrome до 103 класс уже был,
 // а 'deflate-raw' ещё нет, и конструктор бросал бы TypeError вместо понятного отказа.
 if(typeof TextDecoder!=='function')fail('old',OLD);
 try{new DecompressionStream('deflate-raw')}catch(e){fail('old',OLD)}
 const entries=await centralDirectory(blob);
 const entry=await findHealthXml(blob,entries);
 const got=await collect(blob,entry,opts);
 const labels=got.registry.labels(),hashes=got.registry.hashes();
 const daily=buildDaily(got.chunks);
 return {main:buildPackage(daily,labels,hashes,got.counters),
         sleep:sleepWindows(got.windows,labels,hashes,got.sleepOffsets,got.sleepSources)};
}

return {version:1,read:read,ArchiveError:ArchiveError,
        parts:{stamp:stamp,pieces:pieces,union:union,normalize:normalize,sha256Hex:sha256Hex,
               sourceKeyHash:sourceKeyHash,firstElementName:firstElementName,dayString:dayString,
               daysFromCivil:daysFromCivil,civilFromDays:civilFromDays,Seen:Seen,buildDaily:buildDaily}};
})();
