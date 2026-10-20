/* Real-controller regression: a displayed whole-thousand goal must also be
   the amount used by the solver, including initial and derived selections. */
async function calcFormatRegression(w) {
  var d=w.document,root=d.querySelector('#alfa-goal'),api=w.AS.CalcModal;
  var input=d.querySelector('#ag-target'),range=d.querySelector('#ag-target-range');
  var saved=root.alfaGoal.state(),checks=[],errors=[];
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function goal(){return root.alfaGoal.state().target;}
  function fixture(next){
    root.alfaGoal.setState(Object.assign({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',
      sex:'',age:0,shifts:30,sched:'6/1',road:0,food:0,v:'100',auto:false},next));
  }
  function enter(value){
    input.focus();input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));
  }
  try {
    await calcOpenCandidate(w);
    check(goal()%1000===0&&/^\d[\d\s\u00a0\u202f]*$/.test(input.value),
      'Initial displayed goal and actual target use whole thousands',{value:input.value,target:goal()});
    fixture({target:195407});await calcSettle(w,'whole-thousand default');
    check(goal()===195000&&input.value==='195','A 195407-ruble quote seeds a 195-thousand target');
    check(root.alfaGoal.current().home===195407&&d.querySelector('#ag-home').textContent.replace(/\D/g,'')==='195407',
      'The actual net result remains 195407 rubles');
    check(Number(range.max)===583000&&Number(range.step)===1000,
      'The range ends at the last reachable whole thousand',{max:range.max,step:range.step});
    check(Array.from(d.querySelectorAll('#ag-money-labels text')).every(function(el){return !/[,.]/.test(el.textContent);}),
      'Ruler labels contain no fractional thousands');
    input.focus();input.blur();await calcSettle(w,'unchanged focus');
    check(goal()===195000&&input.value==='195','Focus and blur do not change the amount or format');
    enter('300');input.blur();await calcSettle(w,'manual integer goal');
    check(goal()===300000&&input.value==='300','Manual 300 means exactly 300000 rubles');
    enter('300,5');
    check(goal()===300000&&input.getAttribute('aria-invalid')==='true',
      'Fractional input cannot silently create a fractional goal');
    input.blur();
    check(input.value==='300','Invalid fractional input restores the last valid goal on blur');
    range.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
    await calcSettle(w,'whole-thousand upper endpoint');
    check(goal()===583000&&input.value==='583','End uses a whole-thousand endpoint');
    range.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
    await calcSettle(w,'whole-thousand keyboard step');
    check(goal()===582000&&input.value==='582','Keyboard movement retains the thousand-ruble step');
    d.querySelector('[data-shifts="30"]').click();await calcSettle(w,'duration derived goal');
    check(goal()===195000&&input.value==='195','Selecting a duration cannot reintroduce fractional thousands');
    fixture({food:500,road:12000});await calcSettle(w,'external quote target');
    check(goal()%1000===0&&input.value.indexOf(',')<0,'External quote changes keep whole-thousand targets');
    fixture({food:0,road:0,target:700000});await calcSettle(w,'unreachable whole target');
    check(goal()===700000&&input.value==='700'&&Number(range.max)===583000,
      'An above-range typed goal remains visible and is not silently clamped');
    fixture({target:0});await calcSettle(w,'zero goal');
    check(goal()===0&&input.value==='0'&&!d.querySelector('#ag-target-error').hidden,
      'Zero retains the existing explicit validation');
    fixture({target:3000,food:0,road:579627});await calcSettle(w,'small scale labels');
    var labelNodes=Array.from(d.querySelectorAll('#ag-money-labels text'));
    var labels=labelNodes.map(function(el){return el.textContent;});
    check(new Set(labels).size===labels.length&&labels.every(function(text){return !/[,.]/.test(text);})&&labelNodes.every(function(el){return Number(el.textContent.replace(/\s/g,''))*1000===Number(el.dataset.value);}),
      'Small monetary ranges have distinct integer-thousand labels',labels);
    fixture({target:1000,food:0,road:593127});await calcSettle(w,'sub-thousand maximum');
    check(Number(range.max)===0&&range.disabled,'A sub-thousand ceiling does not invent a reachable 1000-ruble target',
      {max:range.max,disabled:range.disabled});
  } finally {
    input.blur();root.alfaGoal.setState(saved);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors};
}
