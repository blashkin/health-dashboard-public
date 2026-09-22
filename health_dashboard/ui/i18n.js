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
 'metric.steps':'Шаги','metric.exercise_min':'Упражнения','metric.walk_run_km':'Ходьба и бег',
 'metric.cycling_km':'Вело-дистанция','metric.swimming_km':'Плавание','metric.active_kcal':'Активные калории',
 'metric.resting_hr':'Пульс покоя','metric.vo2max':'VO₂max','metric.sleep_hours':'Календарный сон',
 'unit.steps':'шаги','unit.min':'мин','unit.km':'км','unit.kcal':'ккал','unit.bpm':'уд/мин',
 'unit.vo2':'мл/кг/мин','unit.hours':'ч','unit.perDay':'в день','unit.minPerDay':'мин в день',
 'unit.perRecordedDay':'на день с записью','unit.slashDay':'{unit}/день',
 'plural.month':['месяц','месяца','месяцев'],
 'stage.deep':'глубокий','stage.core':'лёгкий','stage.rem':'REM','stage.unspec':'без стадии',
 'stage.deep.help':'Глубокий — медленный сон: пульс и дыхание самые редкие, тело восстанавливается сильнее всего. Обычно первая половина ночи.',
 'stage.core.help':'Лёгкий — всё остальное время сна, между глубоким и REM; у Apple эта стадия называется Core. Обычно его больше половины ночи.',
 'stage.rem.help':'REM — rapid eye movement, «быстрые движения глаз»: стадия, в которой чаще всего снятся сны, мозг активен почти как наяву. Обычно ближе к утру.',
 'stage.unspec.help':'Без стадии — часы записали «спал», но не разметили стадию: старые watchOS до версии 9 или стороннее приложение.',
 'workout.other':'Другой вид',
 'err.main.shape':'Файл не похож на основную месячную сводку.',
 'err.main.gaps':'Поле gaps должно быть массивом.',
 'err.main.field':'Основной файл, monthly[{i}]: некорректное поле {field}.',
 'err.main.unknownMetrics':'Пропущены строки неизвестных показателей: {list}.',
 'err.sleep.shape':'Файл не похож на сводку окон сна.',
 'err.sleep.field':'Файл сна, monthly[{i}]: некорректное поле {field}.',
 'err.field.row':'строки','err.field.metricMonthDup':'metric/month (повтор)','err.field.monthDup':'month (повтор)',
 'err.rangeOrder':'Начало периода не может быть позже конца.',
 'ui.closeMessage':'Закрыть сообщение',
 'period.demo':'Демонстрационные данные','period.range':'Период: {from} — {to}',
 'card.periodMean':'Среднее за период','card.weightedBy':'взвешено по {by}',
 'card.lowestMonth':'Самый низкий месяц','card.highestMonth':'Самый высокий месяц',
 'card.monthsWithRecord':'{n} {word} с записью',
 'chart.smooth':'Сглаживание','chart.smooth.off':'Нет','chart.smooth.3':'3 месяца','chart.smooth.12':'12 месяцев',
 'chart.smooth.note3':'Сглаживание: взвешенное среднее текущего и двух предыдущих календарных месяцев; точка есть только при наличии всех трёх.',
 'chart.smooth.note12':'Сглаживание: среднее текущего и одиннадцати предыдущих календарных месяцев; точка есть при девяти и более месяцах с записью.',
 'chart.kind':'Вид графика','chart.kind.line':'Линии','chart.kind.bar':'Столбики',
 'chart.noSmoothLine':'Сглаженной линии нет: в периоде мало подряд идущих месяцев с записью. Выберите «без сглаживания».',
 'chart.noData':'Нет данных в выбранном периоде.',
 'trend.title':'Тренд по полным годам всего архива','trend.few':'данных мало: меньше трёх полных лет',
 'trend.flat':'ровно, сдвиг меньше порога шума','trend.up':'растёт','trend.down':'снижается',
 'trend.sparse':'(по годам, где записей мало)',
 'tip.daysOf':'дней с записью: {days} из {of}','tip.records':'записей: {n}',
 'chart.axis.years':'Годы',
 'chart.axis.months':'Месяцы (месяц.год)',
 'chart.aria':'График: {label}',
 'card.perRecordedDayMean':'в среднем на день с записью',
 'card.meanOverRecordedDays':'среднее по дням с записью',
 'overview.gapNote':'Разрыв линии — месяц без записей или отсеянный фильтром покрытия. Это не ноль и не догадка. Нажмите на точку, чтобы увидеть месяц подробно.',
 'overview.method':'Как рассчитаны показатели',
 'overview.methodNote':'Средние учитывают только дни с записями; это не время ношения часов. Сон в этом списке — по календарным дням; сон по ночам — на вкладке «Сон».',
 'overview.methodMissing':'Методика не указана.',
 'tab.activity':'Активность',
 'activity.sum':'Сумма',
 'activity.monthsOnly':'только месяцы с записью',
 'activity.perDayMean':'Среднее на день',
 'activity.perDayFormula':'Σ значений / Σ наблюдаемых дней',
 'plural.session':['занятие','занятия','занятий'],
 'sport.none':'В выбранном периоде тренировок нет.',
 'sport.byCount':'По числу занятий',
 'sport.byTime':'По времени',
 'sport.aria.count':'Доли видов спорта по числу занятий',
 'sport.aria.time':'Доли видов спорта по времени',
 'sport.total':'Всего: {value}.',
 'sport.noStarts':'начала не записаны',
 'plural.start':['начало','начала','начал'],
 'sport.meanMinutes':'в среднем {n} мин',
 'sport.byYear':'Вид спорта по годам',
 'ui.selectedPeriod':'выбранный период',
 'ui.year':'Год',
 'sport.edgeYear':'архив обрезан: {n} {word}',
 'sport.sparseYear':'записи есть в {n} {word} из 12',
 'plural.monthIn':['месяце','месяцах','месяцах'],
 'sport.whatTakesPlace':'Какие занятия занимают больше места',
 'sport.pieNote':'Один цвет — один вид спорта. Нажмите на сектор или строку, чтобы увидеть этот вид подробно. Незаписанные занятия сюда не попадают.',
 'sport.minutes':'Минуты',
 'sport.hours':'Часы',
 'sport.starts':'Начала тренировок',
 'sport.meanLength':'Средняя длительность',
 'sport.meanLengthNote':'Σ минут / Σ начал по {n} совпадающим месяцам; граничные тренировки возможны',
 'sport.hoursOf':'{name}, часы',
 'tab.heart':'Сердце',
 'heart.by':'дням с измерением',
 'heart.count':'Дней с измерением',
 'sport.yearsNote':'В клетке три числа: часы за год, число начавшихся тренировок и средняя длительность одной. Средняя — Σ минут / Σ начал только по тем месяцам, где записаны и минуты, и начала; граничные тренировки возможны. Год, обрезанный краем архива, или год с пропусками в записях помечен: его часы и начала ниже не потому, что вы остановились. Столбцы идут по убыванию часов за период. Строки между собой по часам сравнивать можно, по средней — с оглядкой на число начал.',
 'source.watch':'часы',
 'source.phone':'телефон',
 'source.other':'другой источник',
 'detail.sourceDays':'{name} — {days} дн.',
 'detail.noInfo':'нет сведений',
 'detail.noData':'Нет данных',
 'detail.overlap':'дней, где записи накладывались: {n}',
 'detail.fromWhere':'откуда взяты дни',
 'tab.sleep':'Сон',
 'sleep.showCalendar':'Показать календарный сон',
 'sleep.showWindows':'Показать окна полдень–полдень',
 'sleep.windowNotice':'Окна полдень–полдень: включают дневной сон и не обязательно являются полной ночью.',
 'sleep.calendarNotice':'Календарный сон: отдельное определение; его нельзя смешивать с оконным сном.',
 'sleep.noWindowFile':'Файл окон сна не загружен, поэтому доступен только календарный сон.',
 'sleep.byWindows':'окнам с записью',
 'sleep.countWindows':'Окон с записью',
 'sleep.byDays':'дням с записью',
 'sleep.countDays':'Дней с записью',
 'sleep.windowSleep':'Оконный сон',
 'sleep.shortWindows':'Окон короче 3 часов',
 'sleep.shortWindowsNote':'дневной сон или неполная запись ночи',
 'sleep.conflictWindows':'Окон с конфликтом источников',
 'sleep.conflictWindowsNote':'один источник видел сон, другой — бодрствование',
 'sleep.stagesAxis':'Месяцы (год подписан у января)',
 'sleep.stagesTitle':'Стадии по месяцам',
 'sleep.stagesSince':'с {month}, когда часы начали писать стадии',
 'sleep.stagesAria':'Доли стадий сна по месяцам',
 'sleep.stagesByYear':'То же по годам',
 'sleep.hoursPerYear':'Сна за год',
 'sleep.stagesNote':'Столбик — месяц, высота — 100% записанного календарного сна, цвет — доля стадии; что означает каждая стадия, подсказывает легенда. Стадии — оценка часов по пульсу и движению, не полисомнография; они появились с watchOS 9 (осень 2022), раньше часы писали только «спал». Скачок доли глубокого сна между годами чаще всего смена алгоритма Apple или часов, а не сна. Коридоров нормы для стадий у источников нет, поэтому на «Главное» этот график не идёт и в нормах не участвует.',
 'tab.season':'Сезонность',
 'season.axis':'Месяцы',
 'season.note':'Одни и те же месяцы разных лет: до четырёх последних лет выбранного периода.',
 'season.notePerDay':'Значения — в среднем на день с записью, поэтому короткие и неполные месяцы сравнимы с полными.',
 'season.noteMean':'Значения — средние за месяц.',
 'season.noteGap':'Разрыв линии — нет подходящих данных.',
 'compare.includeLast':'Включить последний месяц архива',
 'compare.includeLastTail':': он может быть неполным',
 'compare.title':'Сравнение с теми же месяцами годом ранее',
 'compare.notEnough':'Недостаточно сопоставимых месяцев.',
 'compare.pairs':'{n} {word}.',
 'plural.pair':['пара','пары','пар'],
 'compare.formula':'Формула: {how} с равным весом по парам месяцев. Фильтр покрытия применён к обоим месяцам пары. При базе 0 относительное изменение не определено.',
 'compare.formula.sum':'среднее дневных средних (значение месяца / наблюдаемые дни)',
 'compare.formula.mean':'среднее месячных значений',
 'compare.sourcesDiffer':'В {n} парах состав источников различается — сравнение предварительное.',
 'compare.sign':'Знак Δ не означает «лучше» или «хуже».',
 'quality.noRecords':'нет записей',
 'tab.quality':'Полнота записей',
 'quality.lede':'Здесь видно, <b>за сколько дней каждого месяца вообще есть записи</b> и где сравнивать периоды рискованно. О здоровье и о точности часов эта вкладка ничего не говорит.',
 'quality.heatNote':'Строка — год, столбец — месяц, число в ячейке — сколько дней месяца имеют хотя бы одну запись выбранного показателя. 15 из 30 — половина месяца. Даже полный месяц не значит, что часы были на руке круглые сутки.',
 'quality.level3':'записано 90% дней и больше',
 'quality.level2':'80–89%',
 'quality.level1':'меньше 80%',
 'quality.level0':'записей нет',
 'quality.pickMonth':'Нажмите на месяц: появится число дней с записью и откуда они взяты.',
 'quality.howTo':'Как пользоваться: прежде чем сравнивать два периода, посмотрите, одинаково ли полно они записаны. Для VO₂max и редких занятий мало дней в месяце — обычное дело, а не плохие данные.',
 'quality.gaps':'Длинные перерывы в записях',
 'quality.gapsNote':'Промежутки от 14 дней подряд без единой записи выбранного показателя. Причину перерыва данные не называют.',
 'quality.gapsFrom':'Последняя запись — следующая',
 'quality.gapsDays':'Дней без записей',
 'quality.noGaps':'Длинных перерывов нет.',
 'err.notJson':'Файл не является корректным JSON.',
 'err.cannotProcess':'Не удалось обработать файл.',
 'err.cannotRead':'Не удалось прочитать файл.',
 'msg.mainImported':'Основной набор импортирован локально. Сон очищен, чтобы не смешивать наборы.',
 'msg.sleepImported':'Файл окон сна импортирован локально.',
 'load.fromTo':'Листаю годы от {from} к {to}.',
 'load.noBirth':'Год рождения не указан: лента идёт за сорок лет.',
 'load.stage.read':'Читаю записи',
 'load.stage.fold':'Свожу дни и месяцы',
 'msg.archiveRead':'Архив прочитан здесь, в браузере. Данные никуда не отправлены и нигде не сохранены: они исчезнут вместе с вкладкой.',
 'msg.cancelledKept':'Чтение отменено. Прежние данные на месте.',
 'msg.cancelledEmpty':'Чтение отменено. Ничего не загружено.',
 'err.archiveRead':'Не удалось прочитать архив.',
 'err.zip.notExport':'Это не похоже на выгрузку Apple Health: внутри архива нет файла с данными.',
 'err.zip.broken':'Архив не читается: похоже, файл повреждён или это не zip.',
 'err.zip.old':'Браузер слишком старый для чтения архива. Обновите его или соберите дашборд командой build.',
 'archive.method':'Предварительный выбор источника по дням: сначала категория Apple Watch, затем больше дней наблюдений внутри показателя и месяца, затем отпечаток ключа источника. Один источник на день, источники никогда не складываются. Даты берутся у источника рангом ниже только там, где старший источник молчит. Это не воспроизводит приоритеты приложения «Здоровье»; спорные дни помечены. Сон здесь — длительность по календарным дням.',
 'foot.offline':'Страница работает без сети: ссылки открываются только по нажатию.'
},en:{}};
const WORKOUT_RU={Walking:'Ходьба',Running:'Бег',Cycling:'Велосипед',Swimming:'Плавание',Hiking:'Пешие походы',Rowing:'Гребля',Elliptical:'Эллипсоид',StairClimbing:'Подъём по лестнице',Stairs:'Лестница',StepTraining:'Степ',CoreTraining:'Мышцы корпуса',TraditionalStrengthTraining:'Силовые',FunctionalStrengthTraining:'Функциональные силовые',HighIntensityIntervalTraining:'Интервальные',CrossTraining:'Смешанные',MixedCardio:'Смешанное кардио',Cardio:'Кардио',CardioDance:'Танцевальное кардио',Dance:'Танцы',SocialDance:'Танцы',Yoga:'Йога',Pilates:'Пилатес',Flexibility:'Растяжка',Cooldown:'Заминка',PreparationAndRecovery:'Разминка и восстановление',MindAndBody:'Дыхание и осознанность',TaiChi:'Тайцзи',Barre:'Барре',Gymnastics:'Гимнастика',JumpRope:'Скакалка',Kickboxing:'Кикбоксинг',Boxing:'Бокс',MartialArts:'Единоборства',Wrestling:'Борьба',Fencing:'Фехтование',SnowSports:'Зимние виды',DownhillSkiing:'Горные лыжи',CrossCountrySkiing:'Беговые лыжи',Snowboarding:'Сноуборд',SkatingSports:'Коньки',Hockey:'Хоккей',Curling:'Кёрлинг',WaterSports:'Водные виды',WaterFitness:'Аквафитнес',WaterPolo:'Водное поло',SurfingSports:'Сёрфинг',PaddleSports:'Гребля на каяке или сапе',Sailing:'Парус',UnderwaterDiving:'Дайвинг',Swimbikerun:'Триатлон',Transition:'Транзитная зона',Tennis:'Теннис',TableTennis:'Настольный теннис',Badminton:'Бадминтон',Squash:'Сквош',Racquetball:'Ракетбол',Pickleball:'Пиклбол',Soccer:'Футбол',Basketball:'Баскетбол',Volleyball:'Волейбол',Handball:'Гандбол',Rugby:'Регби',AmericanFootball:'Американский футбол',AustralianFootball:'Австралийский футбол',Baseball:'Бейсбол',Softball:'Софтбол',Cricket:'Крикет',Lacrosse:'Лакросс',Golf:'Гольф',DiscSports:'Фрисби',Bowling:'Боулинг',Archery:'Стрельба из лука',Climbing:'Скалолазание',Equestrian:'Верховая езда',Fishing:'Рыбалка',Hunting:'Охота',Play:'Подвижные игры',FitnessGaming:'Фитнес-игры',TrackAndField:'Лёгкая атлетика',HandCycling:'Хендбайк',WheelchairWalkPace:'Коляска, темп ходьбы',WheelchairRunPace:'Коляска, темп бега',Other:'Другое',Workout:'Без указания вида'};
// Английский берёт имя Apple и разбивает его по заглавным: TraditionalStrengthTraining
// → «Traditional strength training». Отдельный словарь на девяносто слов не нужен.
const splitWorkout=k=>{let w=String(k).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2');return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()};
// Методика приходит из данных и по контракту дословно совпадает с select.py;
// переводится ровно тот текст, который программа выпускает сама.
function methodText(v){return v===I18N.ru['archive.method']?t('archive.method'):v}
function workoutLabel(k){return currentLang()==='ru'?(WORKOUT_RU[k]||''):splitWorkout(k)}


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
// Короткие имена месяцев берутся у локали, а не из списка: точку в «янв.» убираем.
const SHORT_MONTHS=()=>Array.from({length:12},(_,m)=>new Date(2001,m,15).toLocaleDateString(localeTag(),{month:'short'}).replace(/\.$/,''));

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
