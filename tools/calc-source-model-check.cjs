/* Run with node tools/calc-source-model-check.cjs.
 * Executes the live calculator's pure model functions verbatim. Browser checks
 * cover the real DOM; this check prevents the imported designs using demo data. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(base, file), 'utf8');
const context = { Intl, Date, console, AS: {} };
context.window = context;
vm.createContext(context);
['js/objects.js', 'js/data.js', 'js/calc-data.js'].forEach(file => vm.runInContext(read(file), context));
const source = read('js/calc-modal.js');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
vm.runInContext([
  'var AS=window.AS,O=AS.CALC.objects,TAX=.06,ROAD_COMP=10000,ROAD_COMP_FROM=30;',
  "var money=function(n){return String(Math.round(n));},rub=function(n){return money(n)+' ₽';};",
  between('  var WEEK =', '  var CHEV ='),
  between('  function parseNum(', '  function num('),
  between('  function terms(', '  // пол и возраст'),
  "var job={region:'',prof:'',shifts:30,sched:'6/1',sex:'',age:0,sort:'home',view:'calc',v:'100',auto:false,road:12000,food:500,start:new Date(2026,9,22),pick:'ym-sofyino'};",
  'var lastCur=null,modelListeners=[],modelUpdate=null;',
  between('  function modelState(', '  function modelInput('),
  between('  function modelInput(', '  function modelSet('),
  between('  function modelSet(', '  AS.CalcModal ='),
  between('  function refreshJobModel(', '  // сумма в итоге'),
  'AS.CalcModal={state:modelState,set:modelSet,preview:modelPreview,durations:function(id){return modelDurations(id,job);},solve:modelSolve,parseAmount:parseNum};'
].join('\n'), context);
const adapter = path.join(base, 'js/calculators/engine-adapter.js');
if (fs.existsSync(adapter)) vm.runInContext(fs.readFileSync(adapter, 'utf8'), context);
assert.ok(context.AlfaDesign, 'The source designs need their live-model adapter');
const E = context.AlfaDesign;
const plain = value => JSON.parse(JSON.stringify(value));
const before = JSON.stringify(context.AS.CalcModal.state().job);
assert.equal(E.initial().prof, '', 'Opening an imported design must retain any-profession selection');
assert.equal(E.initial().region, '', 'Opening an imported design must retain all-region selection');
const quote = E.current(E.initial());
assert.deepEqual([quote.gross, quote.tax, quote.days, quote.food, quote.comp, quote.home], [207880, 12473, 36, 10800, 10000, 182607]);
assert.deepEqual(plain(E.durations('ym-sofyino', E.initial())), [20, 30, 45, 60]);
assert.equal(E.current({ ...E.initial(), prof: 'Несуществующая профессия' }), null);
assert.equal(E.list({ ...E.initial(), region: 'Татарстан' }).every(q => q.o.region === 'Татарстан'), true);
assert.deepEqual(plain(E.durations('ym-sofyino', { ...E.initial(), sex: 'f', age: 46 })), []);
assert.equal(E.current({ ...E.initial(), shifts: 45 }).home, 276207);
assert.equal(E.current({ ...E.initial(), pick: 'wurth' }).days, 44);
assert.equal(E.parseMoney('6 000,50'), 6000, 'Amount parsing follows the existing calculator');
assert.equal(E.parseMoney('6.000'), 6000, 'Thousands separator follows the existing calculator');
assert.equal(E.date(new Date(2026, 9, 22), 35), '26\u00a0ноя');
assert.equal(JSON.stringify(context.AS.CalcModal.state().job), before, 'Design previews must not mutate shared state');
assert.ok(E.roles.includes('Водитель высотного штабелёра'));
assert.deepEqual(plain(E.regions), plain(context.AS.REGIONS.map(({ key, label }) => ({ key, label }))));
const savedState = context.AS.CalcModal.state().job;
let notifications = 0;
context.modelListeners.push(() => notifications++);
assert.doesNotThrow(() => context.AS.CalcModal.set({
  region: 'Москва и МО', prof: 'Комплектовщик', pick: 'ym-sofyino',
  shifts: 30, food: 500, road: 12000, v: 'hi', auto: false
}), 'Shared state updates must work with no Classic DOM');
const updated = context.AS.CalcModal.state();
assert.equal(updated.job.food, 500);
assert.equal(updated.job.road, 12000);
assert.equal(updated.job.v, 'hi', 'Explicit high-output mode survives object normalization');
assert.equal(updated.job.auto, false);
assert.equal(updated.current.o.id, 'ym-sofyino');
assert.equal(updated.current.home, 182607, 'Headless refresh keeps the existing quote math');
assert.equal(notifications, 1, 'One model update publishes once');
context.AS.CalcModal.set({ prof: 'Несуществующая профессия' });
assert.equal(context.AS.CalcModal.state().current, null, 'No match clears the current quote');
assert.equal(notifications, 2);
context.AS.CalcModal.set(savedState);
context.modelListeners.length = 0;
console.log('PASS: live source-design model, calendar, filters, durations, parsing and read-only previews');
console.log('PASS: headless model updates, quote selection and subscription notifications');
