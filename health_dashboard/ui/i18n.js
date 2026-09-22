// Словарь интерфейса и переключатель языка. Комментарии в коде остаются русскими:
// переводится только то, что видит человек.
//
// Ключ — короткие английские слова через точку: story.change.title, err.zip.empty.
// t() при отсутствии ключа в текущем языке отдаёт русский текст, а промах запоминает
// в state.missing: набор проверок требует, чтобы после обхода всех вкладок он был пуст.
const I18N={ru:{
 'head.title':'Здоровье — локальный обзор',
 'top.brand':'Здоровье · локальный обзор',
 'ui.reset':'Сбросить',
 'ui.resetHint':'вернётесь на стартовый экран',
 'ui.archivePercent':'Читаю архив',
 'ui.archiveCancel':'Отменить',
 'theme.dark':'Тёмная тема',
 'theme.light':'Светлая тема',
 'lang.aria':'Переключить язык страницы',
 'start.aria':'Начало',
 'start.h1':'Как менялись шаги, тренировки, пульс покоя и сон за годы с часами.',
 'start.lede':'И как это соотносится с рекомендациями ВОЗ. Архив читается в браузере и никуда не уходит.',
 'start.birth':'Год рождения',
 'start.birthPlaceholder':'например, 1980',
 'start.sex':'Пол',
 'start.sexEmpty':'— выберите —',
 'start.sexF':'Женский',
 'start.sexM':'Мужской',
 'start.fieldsNote':'Нужны только для норм VO₂max и сна, можно пропустить. Никуда не отправляются.',
 'start.open':'Открыть архив',
 'start.help.export':'<b>Как выгрузить с iPhone.</b> «Здоровье» → фото профиля → «Экспортировать медданные». Получится zip. Через AirDrop на этот компьютер.',
 'start.help.safe':'<b>Почему это безопасно.</b> Страница не отправляет файл на сервер: разбор идёт в браузере, на диск ничего не пишется. Закрыли вкладку — данных нет.',
 'start.help.zip':'<b>Если zip не открывается.</b> Дождитесь конца экспорта на телефоне. Файл может занимать более 1 ГБ. Не распаковывайте вручную: нужен именно zip.',
 'load.stage.open':'Открываю архив',
 'load.note':'Листаю годы от рождения к сегодняшнему дню.',
 'load.next':'Дальше — три направления: форма, повседневность, сердце; ваши числа против ориентиров ВОЗ и график по годам, где видно, что менялось. Неполный год с полным молча не сравнивается.',
 'nav.aria':'Разделы',
 'nav.story':'Главное',
 'nav.overview':'Обзор',
 'nav.activity':'Активность',
 'nav.workouts':'Тренировки',
 'nav.heart':'Сердце',
 'nav.sleep':'Сон',
 'nav.season':'Сезонность',
 'nav.quality':'Полнота записей',
 'controls.aria':'Общий период',
 'controls.from':'Начало',
 'controls.to':'Конец',
 'controls.scale':'Масштаб',
 'scale.month':'Месяцы',
 'scale.year':'Годы',
 'controls.coverage':'Покрытие',
 'coverage.all':'Все записи',
 'coverage.80':'≥ 80% дней',
 'coverage.90':'≥ 90% дней',
 'controls.preset':'Быстрый период',
 'preset.all':'Всё время',
 'preset.year':'Последний год в архиве (с января)',
 'preset.12':'Последние 12 месяцев',
 'foot.author':'Автор — <a href="https://github.com/blashkin" rel="noopener">blashkin</a>',
 'foot.code':'Код и документация: <a href="https://github.com/blashkin/health-dashboard-public" rel="noopener">github.com/blashkin/health-dashboard-public</a>',
 'foot.offline':'Страница работает без сети: ссылки открываются только по нажатию.'
},en:{}};

// Язык берётся из локали браузера и на диск не пишется: страница ничего не помнит
// между запусками (см. PRIVACY). Кнопка в шапке меняет язык на этот сеанс.
const LANGS=['ru','en'];
let pageLang=(String(navigator.language||'').toLowerCase().startsWith('ru')?'ru':'en');
function currentLang(){return pageLang}
function noteMissing(key){
 if(typeof state==='undefined'||!state)return;
 if(!state.missing)state.missing=[];
 if(!state.missing.includes(key))state.missing.push(key);
}
// Значение ключа без подстановки: нужен и самому t(), и формам множественного числа.
function raw(key){
 let v=I18N[pageLang]&&I18N[pageLang][key];
 if(v===undefined||v===''){noteMissing(key);v=I18N.ru[key]}
 return v;
}
// Подставляются только те значения, которые вызывающий уже привёл к безопасному виду:
// t() ничего не экранирует, esc() остаётся обязанностью вызывающего.
function t(key,vars){
 let v=raw(key);
 if(v===undefined)return key;
 if(!vars)return v;
 return String(v).replace(/\{(\w+)\}/g,(m,k)=>vars[k]===undefined?m:String(vars[k]));
}
// Формы множественного числа. Значение ключа — массив: у ru три формы, у en две.
// Имя не plural(): так называется прежняя функция story.js с другой подписью.
function tPlural(count,key){
 let forms=raw(key);
 if(!Array.isArray(forms))return String(forms===undefined?key:forms);
 if(pageLang==='en')return forms[Math.abs(count)===1?0:1];
 let m=Math.abs(count)%100;
 if(m>=11&&m<=14)return forms[2];
 m=m%10;
 return m===1?forms[0]:(m>=2&&m<=4?forms[1]:forms[2]);
}
const localeTag=()=>pageLang==='ru'?'ru-RU':'en-US';

// Статическая разметка index.html: текст узла, разметка узла и подписи-атрибуты.
function translateStatic(){
 document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n)});
 document.querySelectorAll('[data-i18n-html]').forEach(e=>{e.innerHTML=t(e.dataset.i18nHtml)});
 document.querySelectorAll('[data-i18n-label]').forEach(e=>{e.setAttribute('aria-label',t(e.dataset.i18nLabel))});
 document.querySelectorAll('[data-i18n-placeholder]').forEach(e=>{e.setAttribute('placeholder',t(e.dataset.i18nPlaceholder))});
}
function paintLang(){
 let b=document.querySelector('#lang');
 if(!b)return;
 let other=pageLang==='ru'?'en':'ru';
 b.textContent=other.toUpperCase();
 b.dataset.lang=pageLang;
 b.setAttribute('aria-label',t('lang.aria'));
 b.title=t('lang.aria');
}
function setLang(l){
 if(!LANGS.includes(l))return;
 pageLang=l;
 document.documentElement.lang=l;
 translateStatic();
 paintLang();
 if(typeof paintTheme==='function')paintTheme();
 if(typeof render==='function')render();
}
function bindLang(){
 let b=document.querySelector('#lang');
 if(!b)return;
 b.onclick=()=>setLang(currentLang()==='ru'?'en':'ru');
}

// Первый проход: атрибут lang на <html>, статический текст и кнопка в шапке.
document.documentElement.lang=pageLang;
translateStatic();
paintLang();
bindLang();
