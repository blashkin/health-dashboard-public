// Прогон ядра archive.js вне браузера: node archive_run.cjs <архив.zip> <результат.json>
// Файл берётся как есть, тем же исходником, что попадает в страницу.
// Node нужен только для проверок, программе он не нужен.
const fs = require('fs'), path = require('path'), vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'health_dashboard', 'ui', 'archive.js');
const archive = vm.runInThisContext('(function(){' + fs.readFileSync(SRC, 'utf8') + '\nreturn HealthArchive})()', { filename: SRC });

(async () => {
  const [zip, out] = process.argv.slice(2);
  const blob = new Blob([fs.readFileSync(zip)]);
  const seen = [];
  // Срабатывания таймера считаются отдельно: они возможны только если чтение уступает
  // управление настоящей задачей. Без уступки браузер не перерисует ни одного кадра,
  // и человек увидит замершую вкладку вместо движущейся шкалы.
  let turns = 0;
  const timer = setInterval(() => { turns++; }, 20);
  const result = await archive.read(blob, { onProgress: f => seen.push(f) });
  clearInterval(timer);
  if (!seen.length) throw new Error('прогресс не сообщался ни разу');
  if (seen[seen.length - 1] > 1 || seen.some(f => !(f >= 0))) throw new Error('доля прогресса вне [0,1]');
  result.diagnostics = {
    progressCalls: seen.length,
    distinctPercents: new Set(seen.map(f => Math.round(f * 100))).size,
    interfaceTurns: turns,
  };
  fs.writeFileSync(out, JSON.stringify(result));
})().catch(e => { console.error(e && e.stack || String(e)); process.exit(1); });
