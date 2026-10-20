/* Bounded real-frame waits: a timer alone does not prove that the iframe has
   painted, or that an earlier asynchronous modal close has completed. */
async function calcWaitFor(w,predicate,label,timeout) {
  var started=Date.now(),limit=timeout||8000;
  while(!predicate()){
    if(Date.now()-started>=limit)throw Error('Timed out waiting for '+label);
    await new Promise(function(resolve,reject){
      var timer=setTimeout(function(){reject(Error('No animation frame while waiting for '+label));},Math.min(3000,limit));
      w.requestAnimationFrame(function(){clearTimeout(timer);resolve();});
    });
  }
}
async function calcSettle(w,label) {
  var d=w.document,started=Date.now(),last='',stable=0,observations=0,lastAt=null,intervals=[],changes=[],latest=null;
  try {await calcWaitFor(w,function(){
    var elapsed=Date.now()-started;
    observations++;
    if(lastAt!==null){intervals.push(elapsed-lastAt);if(intervals.length>10)intervals.shift();}
    lastAt=elapsed;
    var employer=d.querySelector('[data-cm]')?.dataset.tab==='biz',active=employer?'#alfa-employer':'#alfa-goal',prefix=employer?'ec':'ag';
    var selectors=['.cm__panel',active+' .ag-money-knob','#'+prefix+'-target',active+' .ag-money-value-unit'];
    var values=selectors.map(function(selector){
      var el=d.querySelector(selector),r=el&&el.getBoundingClientRect();
      return r?[r.x,r.y,r.width,r.height].map(function(n){return Math.round(n*1000)/1000;}):null;
    });
    var path=d.querySelector('#'+prefix+'-money-line');values.push(path&&path.getAttribute('d'));
    var signature=JSON.stringify(values);
    latest={elapsed:elapsed,selectors:selectors,values:values};
    if(signature!==last){changes.push(latest);if(changes.length>5)changes.shift();}
    stable=signature===last?stable+1:0;last=signature;
    return stable>=6&&Date.now()-started>=250;
  },label||'calculator geometry to settle');}
  catch(error){
    throw Error((error.message||String(error))+'; settle diagnostics: '+JSON.stringify({
      elapsedMs:Date.now()-started,observations:observations,consecutiveStable:stable,
      lastFrameIntervalsMs:intervals,lastDistinctStates:changes,latest:latest,
      documentVisibility:d.visibilityState,devicePixelRatio:w.devicePixelRatio
    }));
  }
}
async function calcOpenCandidate(w) {
  var d=w.document,modal=d.querySelector('[data-cm]');
  if(!modal)throw Error('Missing calculator modal');
  if(!modal.hidden&&!modal.classList.contains('is-open'))
    await calcWaitFor(w,function(){return modal.hidden;},'the previous modal close');
  if(modal.hidden)d.querySelector('[data-calc-open]').click();
  await calcWaitFor(w,function(){return !modal.hidden&&modal.classList.contains('is-open');},'the modal opening frames');
  d.querySelector('[data-cm-tab="job"]').click();
  await calcWaitFor(w,function(){var goal=d.querySelector('#alfa-goal');return modal.dataset.tab==='job'&&goal&&!goal.hidden&&goal.getBoundingClientRect().height>0;},'the sole candidate calculator');
  await calcSettle(w,'candidate opening geometry');
}
async function calcCloseModal(w) {
  var modal=w.document.querySelector('[data-cm]');
  if(!modal.hidden&&modal.classList.contains('is-open'))modal.querySelector('.cm__close').click();
  await calcWaitFor(w,function(){return modal.hidden&&!modal.classList.contains('is-open');},'the modal closing transition');
}
async function calcPreview(w,params) {
  var d=w.document,api=w.AS.CalcModal,mode=params.get('preview')||'goal',goal=d.querySelector('#alfa-goal'),object=null;
  if(mode!=='goal'&&mode!=='employer')throw Error('Only Goal and employer calculators are available for preview');
  function number(name,fallback){var raw=params.get(name),value=raw===null?fallback:Number(raw);if(!Number.isFinite(value)||value<0)throw Error('Invalid preview '+name);return value;}
  await calcOpenCandidate(w);
  if(mode==='employer'){
    var business={prof:params.get('role')||'Комплектовщик',region:params.get('region')||'Москва и МО',posts:number('posts',20),daily:number('daily',1),opdays:number('opdays',7),sched:params.get('sched')||'2/2',reservePct:number('reserve',8),stay:params.get('stay')==='1'};
    var applied=api.employerSet(business);
    if(Object.keys(business).some(function(key){return applied[key]!==business[key];}))throw Error('Unsupported employer preview settings');
    d.querySelector('[data-cm-tab="biz"]').click();
    d.querySelector('#ec-calculation').open=params.get('details')==='1';
  }else{
    var objectId=params.get('object')||'ym-sofyino';object=api.state().objects.find(function(item){return item.id===objectId;});
    if(!object)throw Error('Unknown preview object: '+objectId);
    var role=params.get('role')||object.jobsFull[0],sched=params.get('sched')||'6/1';
    var fixture={region:object.region,prof:role,pick:object.id,sex:'',age:0,shifts:30,sched:sched,road:number('road',0),food:number('food',0),v:params.get('output')==='hi'?'hi':'100',auto:false,target:number('goal',180000)};
    goal.alfaGoal.setState(fixture);
    if(!goal.alfaGoal.current()||goal.alfaGoal.current().o.id!==object.id)throw Error('The requested role/object combination has no eligible quote');
    goal.querySelector('#ag-expenses').open=params.get('details')==='1';
    goal.querySelector('#ag-conditions').open=params.get('conditions')==='1';
  }
  d.querySelector('[data-cv-theme="'+(params.get('theme')==='dark'?'dark':'light')+'"]').click();
  await d.fonts.ready;await calcSettle(w,'the requested capture fixture');
  var panel=d.querySelector('.cm__panel');panel.scrollTop=params.get('position')==='bottom'?panel.scrollHeight:0;
  await calcSettle(w,'capture scroll placement');
  var background=params.get('background')==='1';
  if(background){
    // Capture-only composition plate: production backdrop and site stay intact.
    if(w.AS.lenis)w.AS.lenis.scrollTo(0,{immediate:true,force:true});else w.scrollTo({top:0,left:0,behavior:'instant'});
    d.querySelector('.calc-workspace').style.visibility='hidden';
    await calcWaitFor(w,function(){return Math.abs(w.scrollY)<1;},'the site background at the top');await calcSettle(w,'background capture placement');
  }
  var result={kind:mode,theme:d.querySelector('[data-cm]').dataset.calcTheme,background:background,viewport:{width:w.innerWidth,height:w.innerHeight},devicePixelRatio:w.devicePixelRatio};
  return Object.assign(result,mode==='employer'?{state:api.employerState(),quote:api.employerQuote()}:{object:object.id,state:goal.alfaGoal.state(),net:d.querySelector('#ag-home').textContent,days:d.querySelector('#ag-days').textContent});
}

/* Integration checks against the real page, current controls and live rates. */
async function calcViewsRegression(w) {
  var d=w.document,api=w.AS.CalcModal,checks=[],errors=[],root=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]');
  var saved=api.state().job,savedGoal=root.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab,wasHidden=modal.hidden||!modal.classList.contains('is-open');
  function check(ok,name){(ok?checks:errors).push(name);}
  function $(selector){return d.querySelector(selector);}
  function click(selector){var el=$(selector);if(!el)throw Error('Missing control: '+selector);el.click();}
  function input(selector,value){var el=$(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));}
  function change(selector,value){var el=$(selector);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}
  function net(){return Number($('#ag-home').textContent.replace(/\D/g,''));}
  try {
    var initialView=modal.dataset.calcView,initialTab=modal.dataset.tab;
    await calcOpenCandidate(w);
    var panel=$('.cm__panel'),themes=$('.calc-theme-switch');
    check(initialView==='goal'&&initialTab==='job'&&modal.dataset.calcView==='goal'&&!root.hidden&&!$('[data-cv]').hidden,'Opening the candidate calculator displays Goal by default without a prior design selection');
    check(!$('#alfa-orbit')&&!$('[data-cm-pane="job"]')&&!$('[data-cv-view]')&&!$('[data-cv-switch]'),'Archived Orbit, Classic and the design selector are absent from the page DOM');
    check(!!themes&&!panel.contains(themes)&&themes.querySelectorAll('[data-cv-theme]').length===2,'Both theme controls are outside the calculator card');
    api.set({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:30,sched:'6/1',road:600,food:400,v:'100',auto:false});
    root.alfaGoal.setState({target:180000});await calcSettle(w,'initial Goal fixture');
    var range=$('#ag-target-range').getBoundingClientRect();
    check(range.height>100&&range.height>range.width,'Goal retains the reference vertical money scale');
    check($('#ag-target').scrollWidth<=$('#ag-target').clientWidth+1,'The full target amount is visible at the card width');
    check(panel.scrollWidth<=panel.clientWidth+1,'Goal has no horizontal overflow');
    check($('#ag-target-range').step==='1000','The native money range uses whole-thousand goals');
    check(!root.querySelector('[data-goal]'),'Goal has no amount preset buttons');
    input('#ag-target','300');
    check(root.alfaGoal.state().target===300000,'Entering 300 thousand publishes a 300000-ruble target');
    await calcSettle(w,'300-thousand target motion');
    var higherTargetTop=$('#ag-target').getBoundingClientRect().top;
    input('#ag-target','300,5');
    check(root.alfaGoal.state().target===300000&&$('#ag-target').getAttribute('aria-invalid')==='true','A fractional draft is invalid and preserves the last whole-thousand goal');
    input('#ag-target-range','300000');await calcSettle(w,'native range motion');
    check(root.alfaGoal.state().target===300000&&$('#ag-target').value==='300','The native range keeps ruble units while the editable label uses thousands');
    input('#ag-target','180');await calcSettle(w,'180-thousand target motion');
    var targetBox=$('#ag-target').getBoundingClientRect(),knobBox=$('.ag-money-knob').getBoundingClientRect();
    check(knobBox.width>0&&Math.abs((targetBox.top+targetBox.height/2)-(knobBox.top+knobBox.height/2))<=2,'The editable amount follows the knob after motion settles');
    check(targetBox.top>higherTargetTop+10,'Reducing the target from 300 to 180 thousand moves the editable amount down the scale');
    check($('#ag-shifts').textContent==='29'&&net()===180067,'Goal finds 29 paid shifts: 200880 minus 12053 tax, 8160 food and 600 road');
    check(d.querySelectorAll('#ag-schedule [data-sched]').length===2,'Sofyino offers both actual schedules');
    click('#ag-schedule [data-sched="7/0"]');
    check(api.state().job.sched==='7/0'&&$('#ag-days').textContent==='30'&&net()===181027,'The compact 7/0 button recalculates 29 shifts into 30 calendar days and their food expenses');
    click('#ag-schedule [data-sched="6/1"]');
    check($('#ag-days').textContent==='34'&&$('#ag-schedule [data-sched="6/1"]').getAttribute('aria-pressed')==='true','Switching back restores 34 calendar days at 6/1 and its selected state');
    var highButton=$('[data-ag-yield="hi"]');highButton.focus();highButton.click();
    check(api.state().job.v==='hi'&&highButton.getAttribute('aria-pressed')==='true'&&$('[data-ag-yield="100"]').getAttribute('aria-pressed')==='false','The 150 percent segment publishes its selected mode');
    check($('#ag-shifts').textContent==='20'&&root.alfaGoal.state().target===180000,'Higher output finds a shorter contract without changing the goal');
    check(d.activeElement===highButton,'Yield update preserves keyboard focus');
    click('[data-ag-yield="100"]');
    check(api.state().job.v==='100'&&$('#ag-shifts').textContent==='29'&&net()===180067,'The 100 percent segment restores the 29-shift base calculation');
    change('#ag-object','lemana-north');
    check(d.querySelectorAll('#ag-schedule [data-sched]').length===1&&$('#ag-schedule [data-sched="7/0"]'),'Lemana North exposes only its permitted 7/0 schedule');
    change('#ag-object','ym-sofyino');click('#ag-schedule [data-sched="6/1"]');
    input('#ag-target','250');
    check($('#ag-shifts').textContent==='41'&&net()===256267,'Goal finds 41 shifts including the extension for 250000 rubles');
    input('#ag-target','180');change('#ag-region','Татарстан');
    check(!$('#ag-empty').hidden,'Goal asks for an object after its region changes');
    click('[data-cm-tab="biz"]');click('[data-cm-tab="job"]');
    check(!$('#ag-empty').hidden&&root.alfaGoal.state().target===180000&&$('#ag-object').value==='','Employer round-trip preserves the unfinished candidate object selection and target');
    api.set({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',shifts:30,auto:false});input('#ag-target','180');
    $('#ag-expenses').open=true;input('#ag-road','6 000,00');input('#ag-food','500');
    check(api.state().job.road===6000&&$('#ag-road').value==='6 000,00','Expense editing keeps text and publishes the parsed ruble amount');
    check($('#ag-breakdown').querySelectorAll('div').length===6&&$('#ag-breakdown').textContent.includes('Компенсация дороги'),'The expanded breakdown includes income, tax, food, travel, reimbursement and net');
    var draft=JSON.stringify(root.alfaGoal.state()),rawRoad=$('#ag-road').value,quote=net();
    for(var theme of ['dark','light']){
      click('[data-cv-theme="'+theme+'"]');
      check(modal.dataset.calcTheme===theme&&w.getComputedStyle(root).colorScheme===theme&&$('[data-cv-theme="'+theme+'"]').getAttribute('aria-pressed')==='true','Goal supports '+theme+' theme with the selected control state');
      check(JSON.stringify(root.alfaGoal.state())===draft&&net()===quote,'Changing to '+theme+' theme preserves the calculation');
    }
    click('#ag-conditions-open');
    check($('#ag-conditions').open&&$('#ag-condition-title').textContent.includes('Софьино')&&$('#ag-condition-list').textContent.includes('Жильё'),'Object conditions open from the Goal result action with actual catalog details');
    click('#ag-conditions > summary');check(!$('#ag-conditions').open,'The object conditions can be collapsed again');
    click('[data-cm-tab="biz"]');await calcSettle(w,'employer view');
    check(!$('[data-cm-pane="biz"]').hidden&&root.hidden&&$('[data-cv]').hidden&&Number($('#ec-total').textContent.replace(/\D/g,''))>0,'Employer calculation opens with its computed result and hides candidate content');
    check(!themes.closest('[hidden]'),'Theme controls remain available to the employer calculator');
    click('[data-cv-theme="dark"]');
    check(modal.dataset.calcTheme==='dark'&&w.getComputedStyle(panel).colorScheme==='dark','Employer calculation shares the dark theme');
    click('[data-cm-tab="job"]');await calcSettle(w,'return to candidate draft');
    check(JSON.stringify(root.alfaGoal.state())===draft&&$('#ag-road').value===rawRoad&&$('#ag-expenses').open&&net()===quote,'Employer round-trip preserves candidate goal, schedule, performance, expenses, editing text and result');
    check(!root.hidden&&$('[data-cm-pane="biz"]').hidden&&modal.dataset.calcView==='goal','Returning to candidates restores the sole Goal calculator');
  } catch(error){errors.push('Unexpected candidate/employer fixture error: '+(error.stack||error.message));}
  finally {
    api.set(saved);root.alfaGoal.setState(savedGoal);
    if(savedTheme)click('[data-cv-theme="'+savedTheme+'"]');
    if(savedTab)click('[data-cm-tab="'+savedTab+'"]');
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checks:checks,errors:errors};
}

/* Real employer controls, independent candidate state, and request transfer. */
async function calcEmployerRegression(w) {
  var d=w.document,api=w.AS.CalcModal,modal=d.querySelector('[data-cm]'),root=d.querySelector('#alfa-employer'),goal=d.querySelector('#alfa-goal'),panel=d.querySelector('.cm__panel'),form=d.querySelector('[data-form]');
  var saved=api.employerState(),candidate=goal.alfaGoal.state(),savedTab=modal.dataset.tab,savedTheme=modal.dataset.calcTheme,wasHidden=modal.hidden||!modal.classList.contains('is-open');
  var savedDetails=d.querySelector('#ec-calculation').open,savedMode=form.dataset.mode,savedScroll={x:w.scrollX,y:w.scrollY};
  var fields=Array.from(form.querySelectorAll('input,textarea,select')).map(function(el){return {el:el,value:el.value,checked:el.checked};});
  var checks=[],errors=[],samples=[],submits=0,notifications=0,unsubscribe=api.employerSubscribe(function(){notifications++;});
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function $(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing employer fixture: '+selector);return el;}
  function field(id,value){var el=$('#ec-'+id);el.value=String(value);el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));}
  function keyboard(el,key,shift){var event=new w.KeyboardEvent('keydown',{key:key,shiftKey:!!shift,bubbles:true,cancelable:true});el.dispatchEvent(event);return event;}
  function parts(base,reserve,total,label){var actual=['base','reserve-count','total'].map(function(id){return Number($('#ec-'+id).textContent.replace(/\D/g,''));});check(JSON.stringify(actual)===JSON.stringify([base,reserve,total]),label,{actual:actual,expected:[base,reserve,total]});}
  function onSubmit(){submits++;}
  form.addEventListener('submit',onSubmit);
  try {
    await calcOpenCandidate(w);$('[data-cm-tab="biz"]').click();
    api.employerSet({prof:'Комплектовщик',region:'Москва и МО',posts:20,daily:1,opdays:7,sched:'2/2',reservePct:8,stay:false});await calcSettle(w,'default employer calculation');
    check(!root.hidden&&goal.hidden&&modal.dataset.calcView==='biz','The new employer form is the visible business view');
    check(!d.querySelector('[data-cm-pop]')&&!d.querySelector('[data-cm-k]')&&!d.querySelector('[data-cm-bar]'),'Legacy employer popups and floating result bar are absent');
    parts(40,4,44,'20 posts on 2/2 produce 40 base people plus an explicit 8 percent reserve of 4');
    check($('#ec-coverage').textContent.includes('20')&&$('#ec-summary').textContent.includes('2/2'),'The result states posts per shift and the employee schedule');
    check($('#ec-target-range').min==='1'&&$('#ec-target-range').max==='200'&&$('#ec-target-range').step==='1','The employer ruler uses integer people from 1 to 200');
    field('target',25);await calcSettle(w,'typed staff count');parts(50,4,54,'Typing 25 people updates the actual team estimate');
    field('target-range',30);await calcSettle(w,'native staff range');parts(60,5,65,'The native staff range publishes 30 people without thousand-unit conversion');
    check($('#ec-target').value==='30'&&api.employerState().posts===30,'The employer input and native range share person units');
    field('daily',2);parts(120,10,130,'Two daily shifts double weekly staffing before reserve rounding');
    field('opdays',5);parts(120,10,130,'Five operating days retain two alternating 2/2 teams for every daily post');
    $('[data-ec-sched="5/2"]').click();parts(60,5,65,'The 5/2 employee schedule uses five shifts per person per week');
    $('#ec-calculation').open=true;field('reserve',0);parts(60,0,60,'Disabling reserve leaves only the base staffing requirement');
    check($('#ec-reserve-note').textContent.includes('выключен'),'A zero reserve is explained explicitly');
    field('reserve',15);parts(60,9,69,'The chosen 15 percent reserve is rounded and stated separately');
    check($('#ec-reserve-note').textContent.includes('не статистика')&&$('#ec-breakdown').children.length===5,'The breakdown describes chosen reserve rather than claiming absence statistics');
    field('role','Упаковщик');field('region','Татарстан');$('#ec-stay').checked=true;$('#ec-stay').dispatchEvent(new w.Event('change',{bubbles:true}));
    check(api.employerState().prof==='Упаковщик'&&api.employerState().region==='Татарстан'&&api.employerState().stay,'Role, region and accommodation are captured in the employer brief');
    check(notifications>0,'The real employer controls notify shared-model subscribers');
    for(var invalid of ['0','201','20.5']){
      var target=$('#ec-target');target.focus({preventScroll:true});field('target',invalid);
      check(api.employerState().posts===30&&target.value===invalid&&target.getAttribute('aria-invalid')==='true'&&!$('#ec-target-error').hidden,'Invalid staff input '+invalid+' preserves the last valid estimate and exposes validation');
      target.blur();check(target.value==='30'&&$('#ec-target-error').hidden,'Blurring invalid staff input '+invalid+' restores the valid count');
    }
    var range=$('#ec-target-range');range.focus({preventScroll:true});keyboard(range,'End');
    check(api.employerState().posts===200&&range.value==='200','End selects the real 200-person maximum');
    keyboard(range,'Home');check(api.employerState().posts===1&&range.value==='1','Home selects one person rather than zero');
    keyboard(range,'ArrowUp');check(api.employerState().posts===2,'ArrowUp changes employer count by one person');
    field('target-range',30);
    for(var theme of ['light','dark']){
      $('[data-cv-theme="'+theme+'"]').click();await calcSettle(w,'employer theme '+theme);
      check(w.getComputedStyle(root).colorScheme===theme&&modal.dataset.calcTheme===theme,'The employer form uses its '+theme+' theme');parts(60,9,69,theme+' theme preserves the same staffing estimate');
      var card=root.getBoundingClientRect();
      check(panel.scrollWidth<=panel.clientWidth+1&&panel.getBoundingClientRect().bottom<=w.innerHeight+1,theme+' employer card fits the viewport horizontally and vertically');
      root.querySelectorAll('input,select,button').forEach(function(el){var r=el.getBoundingClientRect();if(!r.width)return;check(r.left>=card.left-1&&r.right<=card.right+1,theme+' employer control '+(el.id||el.dataset.ecSched)+' stays inside the card');});
      root.querySelectorAll('[data-ec-sched]').forEach(function(el){var r=el.getBoundingClientRect();check(r.width>=43.9&&r.height>=43.9,theme+' employee schedule '+el.dataset.ecSched+' retains a 44px target');});
      var knob=root.querySelector('.ag-money-knob').getBoundingClientRect(),amount=$('#ec-target').getBoundingClientRect();
      check(Math.abs(knob.top+knob.height/2-amount.top-amount.height/2)<=1,theme+' employer number stays aligned with the shared moving knob');
      check($('#ec-target').scrollWidth<=$('#ec-target').clientWidth+1,theme+' employer count is not clipped');
      var textRange=d.createRange();textRange.selectNodeContents($('#ec-total'));var textBox=textRange.getBoundingClientRect(),team=root.querySelector('.ec-team').getBoundingClientRect();
      check(textBox.left>=team.left&&textBox.right<=team.right,theme+' staffing total fits the red result card');
      samples.push({theme:theme,viewport:[w.innerWidth,w.innerHeight],quote:api.employerQuote(),cardWidth:card.width});
    }
    var ids=Array.from(d.querySelectorAll('[id]')).map(function(el){return el.id;});
    check(ids.length===new Set(ids).size,'Candidate and employer sliders do not introduce duplicate SVG or control IDs');
    check(!/₽|Налог|Стоимость найма|Фонд оплаты/.test($('#ec-breakdown').textContent),'The staffing estimate does not invent a price or payroll calculation');
    var businessDraft=JSON.stringify(api.employerState());$('[data-cm-tab="job"]').click();
    check(JSON.stringify(goal.alfaGoal.state())===JSON.stringify(candidate),'Employer edits do not change the candidate draft');
    $('[data-cm-tab="biz"]').click();check(JSON.stringify(api.employerState())===businessDraft,'Returning to employer mode preserves all staffing settings');
    var workspace=$('.calc-workspace'),focusable=Array.from(workspace.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')).filter(function(el){var closed=el.closest('details:not([open])');return el.offsetParent!==null&&!el.closest('[inert]')&&(!closed||closed.querySelector('summary').contains(el));});
    var first=focusable[0],last=focusable[focusable.length-1];last.focus({preventScroll:true});var tab=keyboard(last,'Tab');
    check(tab.defaultPrevented&&d.activeElement===first,'Tab at the last employer control wraps inside the modal');
    var back=keyboard(first,'Tab',true);check(back.defaultPrevented&&d.activeElement===last,'Shift+Tab at the first employer control wraps to the last control');
    var message=form.querySelector('textarea[name="message"]');message.value='Нужен запуск в понедельник.\nИз калькулятора персонала: прежний расчёт';
    $('#ec-request').click();await calcWaitFor(w,function(){return modal.hidden;},'employer request closing the modal');
    check(!modal.classList.contains('is-open')&&!d.documentElement.classList.contains('cm-lock'),'Requesting the price closes the staffing calculator');
    check(form.dataset.mode==='business'&&form.querySelector('input[name="headcount"]:checked').value==='50–100','The request opens the business contact form with the 69-person headcount bucket');
    var lines=message.value.split('\n').filter(function(line){return /^\s*Из калькулятора персонала:/.test(line);});
    check(message.value.startsWith('Нужен запуск в понедельник.\n\n')&&lines.length===1&&!message.value.includes('прежний расчёт'),'The business brief preserves the personal comment and replaces the old generated line');
    check(lines.length===1&&['Упаковщик','Татарстан','30 чел. на смене','смен в сутки: 2','рабочих дней в неделю: 5','5/2','60 чел. + резерв 9 чел. (15 %) = 69','проживание нужно'].every(function(text){return lines[0].includes(text);}), 'The request carries role, region, shifts, employee schedule, staffing, reserve and accommodation');
    check(submits===0&&!/₽|стоимость|Цена/.test(lines[0]||''),'Requesting the price prepares a brief without sending it or inventing a price');
    var contact=d.getElementById('contact')||form;
    await calcWaitFor(w,function(){var max=Math.max(0,d.documentElement.scrollHeight-w.innerHeight),expected=Math.min(max,Math.max(0,contact.getBoundingClientRect().top+w.scrollY));return Math.abs(w.scrollY-expected)<=2;},'business contact scroll destination');
    check(true,'The request scrolls to the real contact form');
  }catch(error){errors.push('Unexpected employer fixture error: '+(error.stack||error.message));}
  finally {
    unsubscribe();form.removeEventListener('submit',onSubmit);
    form.querySelector('[data-tab-btn="'+(savedMode||'job')+'"]').click();fields.forEach(function(item){item.el.value=item.value;if(typeof item.checked==='boolean')item.el.checked=item.checked;});
    if(!modal.hidden)await calcCloseModal(w);
    if(w.AS.lenis)w.AS.lenis.scrollTo(savedScroll.y,{immediate:true,force:true});else w.scrollTo({left:savedScroll.x,top:savedScroll.y,behavior:'instant'});
    api.employerSet(saved);$('#ec-calculation').open=savedDetails;
    if(savedTheme)$('[data-cv-theme="'+savedTheme+'"]').click();
    if(!wasHidden)await calcOpenCandidate(w);if(savedTab)$('[data-cm-tab="'+savedTab+'"]').click();
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples};
}

/* Candidate contact handoff remains available beside the employer form. */
async function calcHandoffRegression(w) {
  var d=w.document,api=w.AS.CalcModal,goal=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]'),form=d.querySelector('[data-form]');
  var saved=api.state().job,savedGoal=goal.alfaGoal.state(),savedTab=modal.dataset.tab,savedTheme=modal.dataset.calcTheme;
  var wasHidden=modal.hidden||!modal.classList.contains('is-open'),savedScroll={x:w.scrollX,y:w.scrollY},savedFormMode=form.dataset.mode;
  var fields=Array.from(form.querySelectorAll('input,textarea,select')).map(function(el){return {el:el,value:el.value,checked:el.checked};});
  var checks=[],errors=[],samples=[],submissions=0,messageInputs=0,message=form.querySelector('textarea[name="message"]');
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function $(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing handoff fixture: '+selector);return el;}
  function key(el,name,shift){var event=new w.KeyboardEvent('keydown',{key:name,shiftKey:!!shift,bubbles:true,cancelable:true});el.dispatchEvent(event);return event;}
  function watchSubmit(){submissions++;}
  function watchMessage(){messageInputs++;}
  form.addEventListener('submit',watchSubmit);message.addEventListener('input',watchMessage);
  try {
    await calcOpenCandidate(w);
    goal.alfaGoal.setState({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:30,sched:'6/1',road:12000,food:500,v:'100',auto:false,target:250000});
    var candidateDraft=JSON.stringify(goal.alfaGoal.state());
    $('[data-cm-tab="biz"]').click();await calcSettle(w,'employer keyboard fixture');
    check(!$('#alfa-employer').hidden&&!d.querySelector('[data-cm-pop]')&&!d.querySelector('[data-cm-k]'),'Employer uses the new form without legacy popups');
    $('[data-cm-tab="job"]').click();
    check(JSON.stringify(goal.alfaGoal.state())===candidateDraft,'Employer round-trip preserves the candidate calculation');
    await calcSettle(w,'candidate handoff fixture');
    form.querySelector('[data-tab-btn="business"]').click();
    message.value='Личный комментарий\nИз калькулятора: прежний расчёт';
    var current=api.state(),expectedShifts=current.job.shifts,expectedObject=current.current.o.id;
    check(expectedObject==='ym-sofyino'&&expectedShifts===41,'The handoff fixture is the actual Sofyino 41-shift calculation');
    check(api.apply()===true,'The preserved shared apply API accepts a valid Goal calculation');
    await calcWaitFor(w,function(){return modal.hidden&&!modal.classList.contains('is-open');},'apply closing the calculator');
    check(!d.documentElement.classList.contains('cm-lock'),'Applying closes the modal and releases the page scroll lock');
    check(form.dataset.mode==='job'&&form.querySelector('[data-tab-btn="job"]').getAttribute('aria-selected')==='true','Applying switches the contact form from employer to candidate mode');
    check(form.querySelector('[data-object-select]').value===expectedObject&&form.querySelector('input[name="shifts"]:checked').value===String(expectedShifts),'Applying transfers the chosen object and actual contract duration');
    var selectedRoles=Array.from(form.querySelectorAll('input[name="prof"]:checked')).map(function(el){return el.value;});
    check(selectedRoles.length===1&&selectedRoles[0]==='Комплектовщик','Applying transfers only the selected candidate profession');
    var lines=message.value.split('\n').filter(function(line){return /^\s*Из калькулятора:/.test(line);});
    check(message.value.startsWith('Личный комментарий\n\n')&&lines.length===1&&!message.value.includes('прежний расчёт'),'Applying preserves the personal comment and replaces the old calculator line without duplicates');
    check(lines.length===1&&lines[0].includes('Софьино')&&lines[0].includes('комплектовщик')&&lines[0].includes('41 смен по графику 6/1'),'The transferred comment describes the actual object, role, extended duration and schedule');
    check(messageInputs===1&&submissions===0,'Applying notifies the contact field without submitting a request');
    var contact=d.getElementById('contact')||form;
    await calcWaitFor(w,function(){
      var maximum=Math.max(0,d.documentElement.scrollHeight-w.innerHeight),expected=Math.min(maximum,Math.max(0,contact.getBoundingClientRect().top+w.scrollY));
      return Math.abs(w.scrollY-expected)<=2;
    },'the contact scroll destination');
    samples.push({target:goal.alfaGoal.state().target,object:expectedObject,shifts:expectedShifts,roles:selectedRoles,message:message.value,contactTop:contact.getBoundingClientRect().top,scrollY:w.scrollY});
    check(true,'Applying scrolls the live page to the contact section');
  }catch(error){errors.push('Unexpected handoff fixture error: '+(error.stack||error.message));}
  finally {
    form.removeEventListener('submit',watchSubmit);message.removeEventListener('input',watchMessage);
    form.querySelector('[data-tab-btn="'+(savedFormMode||'job')+'"]').click();
    fields.forEach(function(item){item.el.value=item.value;if(typeof item.checked==='boolean')item.el.checked=item.checked;});
    if(!modal.hidden)await calcCloseModal(w);
    if(w.AS.lenis)w.AS.lenis.scrollTo(savedScroll.y,{immediate:true,force:true});else w.scrollTo({left:savedScroll.x,top:savedScroll.y,behavior:'instant'});
    api.set(saved);goal.alfaGoal.setState(savedGoal);
    if(savedTheme)$('[data-cv-theme="'+savedTheme+'"]').click();
    if(!wasHidden)await calcOpenCandidate(w);
    if(savedTab)$('[data-cm-tab="'+savedTab+'"]').click();
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples};
}

/* Geometry of the sole candidate calculator in both themes. This measures
   controls and rendered text, not just the outer modal overflow. */
async function calcGeometryRegression(w) {
  var d=w.document,api=w.AS.CalcModal,region=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]');
  var saved=api.state().job,savedGoal=region.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab,wasHidden=modal.hidden||!modal.classList.contains('is-open');
  var checks=[],errors=[],samples=[],panel=d.querySelector('.cm__panel'),canvas=d.createElement('canvas'),ctx=canvas.getContext('2d');
  function click(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing geometry control: '+selector);el.click();}
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function fitsText(el,box){
    var range=d.createRange();range.selectNodeContents(el);
    var outer=box.getBoundingClientRect(),style=w.getComputedStyle(box),left=outer.left+parseFloat(style.paddingLeft),right=outer.right-parseFloat(style.paddingRight);
    return Array.from(range.getClientRects()).every(function(r){return r.width<1||(r.left>=left-1&&r.right<=right+1);});
  }
  try {
    await calcOpenCandidate(w);
    api.set({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:60,sched:'6/1',road:0,food:0,v:'100',auto:false});
    for(var theme of ['light','dark']){
      click('[data-cv-theme="'+theme+'"]');await calcSettle(w,'geometry theme '+theme);
      var key='goal/'+theme;
      d.querySelectorAll('.calc-sidebar button').forEach(function(el){var r=el.getBoundingClientRect();if(r.width)check(r.left>=0&&r.right<=w.innerWidth+1,key+' outer control fits viewport');});
      check(panel.scrollWidth<=panel.clientWidth+1,key+' panel fits horizontally',{client:panel.clientWidth,scroll:panel.scrollWidth});
      check(panel.getBoundingClientRect().bottom<=w.innerHeight+1,key+' panel fits viewport height');
      if(w.innerWidth>900)check(!(panel.scrollHeight>panel.clientHeight+1&&panel.scrollHeight<=w.innerHeight-48),key+' uses available height before scrolling');
      region.querySelectorAll('input,select,button').forEach(function(el){if(!el.getBoundingClientRect().width||el.type==='range')return;var r=el.getBoundingClientRect(),p=panel.getBoundingClientRect();check(r.left>=p.left-1&&r.right<=p.right+1,key+' control '+(el.id||el.name||el.className)+' stays inside card');});
        var target=region.querySelector('#ag-target').getBoundingClientRect(),moneyKnob=region.querySelector('.ag-money-knob'),moneyKnobBox=moneyKnob&&moneyKnob.getBoundingClientRect();
        check(!!moneyKnobBox&&moneyKnobBox.width>0&&Math.abs((target.top+target.height/2)-(moneyKnobBox.top+moneyKnobBox.height/2))<=2,key+' editable amount stays aligned with the moving knob',{targetCenter:target.top+target.height/2,knobCenter:moneyKnobBox?moneyKnobBox.top+moneyKnobBox.height/2:null});
        check(!region.querySelector('[data-goal]'),key+' does not restore removed amount presets');
        var savedTarget=region.alfaGoal.state().target,targetInput=region.querySelector('#ag-target');
        targetInput.focus();targetInput.value='0';targetInput.dispatchEvent(new w.Event('input',{bubbles:true}));targetInput.blur();
        await calcSettle(w,'geometry target motion');
        var lowUnit=region.querySelector('.ag-money-value-unit').getBoundingClientRect(),lowInput=targetInput.getBoundingClientRect(),helpBox=region.querySelector('.ag-money-help').getBoundingClientRect();
        check(lowUnit.left>=lowInput.right+7&&lowUnit.left<=lowInput.right+9&&lowUnit.bottom<=helpBox.top+1,key+' zero-target unit stays beside the amount and above the helper text',{gap:lowUnit.left-lowInput.right,unitBottom:lowUnit.bottom,helpTop:helpBox.top});
        targetInput.focus();targetInput.value='600';targetInput.dispatchEvent(new w.Event('input',{bubbles:true}));targetInput.blur();
        await calcSettle(w,'geometry target motion');
        var highReadout=region.querySelector('.ag-money-readout').getBoundingClientRect(),highUnit=region.querySelector('.ag-money-value-unit').getBoundingClientRect(),headingBox=region.querySelector('.ag-money-heading').getBoundingClientRect();
        check(highReadout.top>=headingBox.bottom-1&&highUnit.top>=headingBox.bottom-1,key+' 600-thousand amount and unit stay below the scale heading',{amountTop:highReadout.top,unitTop:highUnit.top,headingBottom:headingBox.bottom});
        region.alfaGoal.setState({target:savedTarget});
        await calcSettle(w,'geometry target motion');
        check(fitsText(region.querySelector('.ag-shift-number'),region.querySelector('.ag-duration-content')),key+' shift number and caption stay clear of duration ruler');
        region.querySelectorAll('.ag-segments button').forEach(function(el){
          check(fitsText(el,el),key+' segment '+el.textContent+' has complete text');
          check(el.getBoundingClientRect().height>=44,key+' segment '+el.textContent+' keeps its touch target');
        });
        var schedule=region.querySelector('#ag-schedule').getBoundingClientRect(),ruler=region.querySelector('.ag-duration-rail').getBoundingClientRect();
        check(schedule.right<=ruler.left,key+' schedule stays clear of duration ruler');
        var durationContent=region.querySelector('.ag-duration-content').getBoundingClientRect();
        var summaryCluster=region.querySelector('.ag-duration-summary').getBoundingClientRect(),calendarCluster=region.querySelector('.ag-duration-calendar').getBoundingClientRect();
        [{name:'summary',box:summaryCluster},{name:'calendar',box:calendarCluster},{name:'schedule',box:schedule}].forEach(function(cluster){
          var box=cluster.box;
          check(box.left>=durationContent.left-1&&box.right<=durationContent.right+1&&box.top>=durationContent.top-1&&box.bottom<=durationContent.bottom+1,key+' duration '+cluster.name+' cluster stays inside its content column',{cluster:cluster.name,left:box.left,right:box.right,top:box.top,bottom:box.bottom,content:durationContent.toJSON()});
        });
        var firstClusterGap=calendarCluster.top-summaryCluster.bottom,secondClusterGap=schedule.top-calendarCluster.bottom;
        var sideBySide=Math.abs(region.querySelector('.ag-duration').getBoundingClientRect().top-region.querySelector('.ag-goal').getBoundingClientRect().top)<1;
        var durationTopInset=sideBySide?10:0,durationBottomInset=sideBySide?18:0;
        if(sideBySide){
          var calendarLine=region.querySelector('.ag-days'),calendarLineBox=calendarLine.getBoundingClientRect(),arrowBox=region.querySelector('.ag-link-arrow').getBoundingClientRect();
          var firstLineCenter=calendarLineBox.top+parseFloat(w.getComputedStyle(calendarLine).lineHeight)/2,arrowCenter=arrowBox.top+arrowBox.height/2;
          check(Math.abs(firstLineCenter-arrowCenter)<1,key+' the first calendar line is centered on the connecting arrow',{calendarFirstLineCenter:firstLineCenter,arrowCenter:arrowCenter});
          check(firstClusterGap>=0&&secondClusterGap>=0,key+' the centered calendar does not collide with the summary or schedule',{summaryToCalendar:firstClusterGap,calendarToSchedule:secondClusterGap});
        }else{
          check(firstClusterGap>=19&&secondClusterGap>=19&&Math.abs(firstClusterGap-secondClusterGap)<=1,key+' stacked duration clusters retain equal vertical gaps of at least 20px',{summaryToCalendar:firstClusterGap,calendarToSchedule:secondClusterGap});
        }
        check(Math.abs(summaryCluster.top-durationContent.top-durationTopInset)<=1&&Math.abs(durationContent.bottom-schedule.bottom-durationBottomInset)<=1,key+' duration clusters reserve room for the extension while preserving the bottom inset',{topInset:summaryCluster.top-durationContent.top,bottomInset:durationContent.bottom-schedule.bottom,expectedTop:durationTopInset,expectedBottom:durationBottomInset});
        var sound=region.querySelector('#ag-sound-toggle').getBoundingClientRect(),card=region.getBoundingClientRect();
        check(sound.width>=43.9&&sound.height>=43.9&&sound.left>=card.left-1&&sound.right<=card.right+1&&sound.top>=card.top-1&&sound.bottom<=card.bottom+1,key+' sound toggle stays inside the card with a 44px touch target',{width:sound.width,height:sound.height,left:sound.left,right:sound.right,cardLeft:card.left,cardRight:card.right});
        if(theme==='dark'){
          check(w.getComputedStyle(region.querySelector('.ag-goal')).backgroundColor==='rgb(25, 25, 25)'&&w.getComputedStyle(region.querySelector('#ag-target')).color==='rgb(255, 87, 88)',key+' target uses a dark surface and the approved red amount');
          check(w.getComputedStyle(region.querySelector('.ag-result')).backgroundColor==='rgb(255, 255, 255)',key+' result uses a white surface');
        }

      region.querySelectorAll('input:not([type="range"]):not([type="checkbox"]),select').forEach(function(el){
        if(!el.getBoundingClientRect().width)return;
        var s=w.getComputedStyle(el),text=el.tagName==='SELECT'?el.selectedOptions[0]?.textContent:el.value;
        ctx.font=s.font;var needed=ctx.measureText(text||'').width+(parseFloat(s.letterSpacing)||0)*(text||'').length;
        var available=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-(el.tagName==='SELECT'?20:0);
        check(needed<=available+1,key+' '+el.id+' selected text is complete',{available:available,needed:needed,text:text});
      });

      var details=d.querySelector('#ag-expenses');details.open=true;
      check(panel.scrollWidth<=panel.clientWidth+1,key+' expanded expenses fit horizontally');details.open=false;
      if(theme==='light')check(w.getComputedStyle(region).backgroundColor==='rgb(255, 255, 255)',key+' uses white paper',w.getComputedStyle(region).backgroundColor);
      samples.push({view:'goal',theme:theme,panelWidth:panel.clientWidth,panelHeight:panel.clientHeight,contentHeight:panel.scrollHeight});
    }
  } catch(error){errors.push('Unexpected geometry-fixture error: '+(error.stack||error.message));}
  finally {
    api.set(saved);region.alfaGoal.setState(savedGoal);
    if(savedTheme)click('[data-cv-theme="'+savedTheme+'"]');
    if(savedTab)click('[data-cm-tab="'+savedTab+'"]');
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,errors:errors,samples:samples};
}

/* Measure the rendered SVG against the actual knob, rather than duplicating
   the controller's notch formula. Keep these interaction checks separate from
   the model and broad layout matrix so failures identify the affected layer. */
async function calcMoneySliderRegression(w) {
  var d=w.document,api=w.AS.CalcModal,root=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]');
  var saved=api.state().job,savedGoal=root.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab,wasHidden=modal.hidden||!modal.classList.contains('is-open');
  var checks=[],errors=[],samples=[],input=root.querySelector('#ag-target'),range=root.querySelector('#ag-target-range');
  var unit=root.querySelector('.ag-money-value-unit'),readout=root.querySelector('.ag-money-readout'),scale=root.querySelector('.ag-money-scale');
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function click(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing control: '+selector);el.click();}
  function wait(ms){return new Promise(function(resolve){w.setTimeout(resolve,ms);});}
  function enter(text,blur){input.focus();input.value=text;input.dispatchEvent(new w.Event('input',{bubbles:true}));if(blur)input.blur();}
  function opacity(){return Number(w.getComputedStyle(unit).opacity);}
  function points(path,step){
    var matrix=path.getScreenCTM(),length=path.getTotalLength(),out=[];
    if(!matrix||!Number.isFinite(length)||length<=0)throw Error('The money contour has no measurable SVG geometry');
    for(var distance=0;distance<=length;distance+=step){var p=path.getPointAtLength(Math.min(distance,length));out.push({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f});}
    var last=path.getPointAtLength(length);out.push({x:matrix.a*last.x+matrix.c*last.y+matrix.e,y:matrix.b*last.x+matrix.d*last.y+matrix.f});
    return out;
  }
  async function lightPixels(source){
    var width=240,height=410,offsetX=60,offsetY=80,scaleHeight=scale.clientHeight;
    var copy=source.cloneNode(true),originals=[source].concat(Array.from(source.querySelectorAll('*'))),clones=[copy].concat(Array.from(copy.querySelectorAll('*')));
    var props=['fill','fill-opacity','fill-rule','stroke','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','opacity','color','filter','clip-path','stop-color','stop-opacity','flood-color','flood-opacity','color-interpolation-filters','mix-blend-mode'];
    function localUrls(value){return value.replace(/url\(["']?[^)"']*#([^)"']+)["']?\)/g,'url(#$1)');}
    originals.forEach(function(el,i){
      var style=w.getComputedStyle(el),clone=clones[i];
      props.forEach(function(prop){clone.style.setProperty(prop,localUrls(style.getPropertyValue(prop)));});
      Array.from(clone.attributes).forEach(function(attr){
        if(attr.name==='style')return;
        clone.setAttribute(attr.name,localUrls(attr.value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g,function(_,name,fallback){return style.getPropertyValue(name).trim()||fallback||'';})));
      });
    });
    // <use> must supply the referenced path's paint. A frozen stroke:none on
    // defs paths would erase the light and make every zero-alpha check vacuous.
    copy.querySelectorAll('defs > path').forEach(function(path){path.removeAttribute('style');});
    Array.from(copy.children).forEach(function(el){if(el.tagName.toLowerCase()!=='defs'&&!el.classList.contains('ag-money-light-field'))el.remove();});
    copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('viewBox','-60 -80 240 410');copy.setAttribute('width',width);copy.setAttribute('height',height);
    copy.style.width=width+'px';copy.style.height=height+'px';copy.style.overflow='visible';
    var image=new w.Image(width,height);
    await new Promise(function(resolve,reject){
      image.onload=resolve;image.onerror=function(){reject(Error('The actual light-layer SVG could not be rasterized'));};
      image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new w.XMLSerializer().serializeToString(copy));
    });
    var canvas=d.createElement('canvas');canvas.width=width;canvas.height=height;
    var ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,width,height);
    var rgba=ctx.getImageData(0,0,width,height).data,columns=Array(width).fill(0),path=source.querySelector('#ag-money-line'),length=path.getTotalLength(),boundary=[];
    // Query the actual rendered path at pixel-row centers; do not reproduce
    // the product's circular-notch formula in the regression.
    for(var row=0;row<scaleHeight;row++){
      var lo=0,hi=length,p;
      for(var iteration=0;iteration<20;iteration++){var middle=(lo+hi)/2;p=path.getPointAtLength(middle);if(p.y<row+.5)lo=middle;else hi=middle;}
      boundary[row]=path.getPointAtLength((lo+hi)/2).x;
    }
    var nonzero=0,total=0,above=0,below=0,right=0,farVertical=0;
    var lightCenter=Number(source.querySelector('.ag-money-line-glow').getAttribute('cy'));
    for(var y=0;y<height;y++)for(var x=0;x<width;x++){
      var alpha=rgba[(y*width+x)*4+3];if(!alpha)continue;
      var localY=y-offsetY,localX=x-offsetX+.5;
      nonzero++;total+=alpha;columns[x]+=alpha;
      if(Math.abs(localY+.5-lightCenter)>40)farVertical+=alpha;
      if(localY<0)above+=alpha;
      else if(localY>=scaleHeight)below+=alpha;
      // Exclude the fractional edge pixel, where clip antialiasing is valid.
      else if(localX>boundary[localY]+.75)right+=alpha;
    }
    return {rasterScale:1,width:width,height:height,nonzeroPixels:nonzero,totalAlpha:total,aboveAlpha:above,belowAlpha:below,rightAlpha:right,farVerticalFraction:farVertical/total,
      spread:[30,35,40,55].map(function(x){return {x:x,alpha:columns[x+offsetX]};}),
      columns:[46,47,48,49,50,51,52].map(function(x){return {x:x,alpha:columns[x+offsetX]};})};
  }
  try {
    // The preceding suite closes the modal asynchronously: its 420ms timeout
    // must finish before reopening, otherwise it hides this fixture mid-test.
    await calcOpenCandidate(w);
    click('[data-cm-tab="job"]');
    api.set({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:30,sched:'6/1',road:600,food:400,v:'100',auto:false});
    await calcSettle(w,'rendered calculator motion');
    if(modal.hidden||!modal.classList.contains('is-open')||modal.dataset.tab!=='job'||root.hidden||scale.getBoundingClientRect().height<=0)throw Error('The money-slider fixture did not open visibly in candidate Goal mode');
    for(var theme of ['light','dark']){
      click('[data-cv-theme="'+theme+'"]');
      for(var amount of [0,150,300,450,600]){
        enter(String(amount),true);await calcSettle(w,'rendered calculator motion');
        var key='goal/'+theme+'/'+amount+'k',path=root.querySelector('#ag-money-line'),contour=points(path,.4),knob=root.querySelector('.ag-money-knob').getBoundingClientRect(),bounds=scale.getBoundingClientRect();
        var cx=knob.left+knob.width/2,cy=knob.top+knob.height/2,radius=knob.width/2;
        var near=contour.filter(function(p){return Math.abs(p.y-cy)<=12;});
        var gaps=near.map(function(p){return Math.hypot(p.x-cx,p.y-cy)-radius;}),minimum=Math.min.apply(null,gaps),maximum=Math.max.apply(null,gaps);
        check(near.length>=20&&minimum>=4.7&&maximum<=5.3,key+' contour keeps a 5px radial clearance around the knob',{points:near.length,minGap:minimum,maxGap:maximum});
        check(contour.every(function(p){return Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=bounds.left-.3&&p.x<=bounds.right+.3&&p.y>=bounds.top-.3&&p.y<=bounds.bottom+.3;})&&knob.top>=bounds.top-.3&&knob.bottom<=bounds.bottom+.3,key+' contour and knob remain inside the scale at every position');
        var amountBox=input.getBoundingClientRect(),unitBox=unit.getBoundingClientRect(),gap=unitBox.left-amountBox.right,unitStyle=w.getComputedStyle(unit);
        check(gap>=7&&gap<=9&&Math.abs((unitBox.top+unitBox.height/2)-(amountBox.top+amountBox.height/2))<=1&&unitBox.right<=bounds.right+1,key+' vertical unit is immediately right of the amount without overlap',{gap:gap,inputRight:amountBox.right,unitLeft:unitBox.left,unitRight:unitBox.right,scaleRight:bounds.right});
        var unitTransform=new w.DOMMatrix(unitStyle.transform);
        check(unitStyle.writingMode==='vertical-rl'&&Math.abs(unitTransform.a+1)<.001&&Math.abs(unitTransform.b)<.001&&Math.abs(unitTransform.c)<.001&&Math.abs(unitTransform.d+1)<.001,key+' unit reads vertically with the approved rotation',{writingMode:unitStyle.writingMode,transform:unitStyle.transform});
        var sample={theme:theme,thousands:amount,rangeMax:Number(range.max),radialClearance:{min:minimum,max:maximum},unitGap:gap,knobCenter:{x:cx,y:cy}};
        if(amount===0||amount===300||amount===600){
          var pixels=await lightPixels(root.querySelector('#ag-money-contour')),column48=pixels.columns[2].alpha,column49=pixels.columns[3].alpha;
          check(pixels.nonzeroPixels>0&&pixels.totalAlpha>0,key+' actual glow raster is nonempty before clipping assertions',pixels);
          check(pixels.aboveAlpha===0&&pixels.belowAlpha===0,key+' actual glow pixels fade to zero above and below the scale',{aboveAlpha:pixels.aboveAlpha,belowAlpha:pixels.belowAlpha});
          check(pixels.rightAlpha===0,key+' actual glow has no pixels beyond the right clip edge',{rightAlpha:pixels.rightAlpha,edgeAllowance:.75});
          check(column48>0&&column49>0&&column48>=column49*.35,key+' actual glow crosses the old x49 filter boundary without a hard cutoff',{column48:column48,column49:column49,columns:pixels.columns});
          check(pixels.spread[1].alpha>pixels.spread[3].alpha*.08,key+' light spreads visibly into the left field instead of remaining a narrow rim',pixels.spread);
          check(pixels.farVerticalFraction<.03,key+' the diffuse halo stays local to the knob instead of washing out half the ruler',{fractionBeyond40px:pixels.farVerticalFraction});
          sample.lightPixels=pixels;
        }
        samples.push(sample);
      }
      var field=root.querySelector('.ag-money-light-field'),clip=root.querySelector('#ag-money-left-clip'),clipUse=clip&&clip.querySelector('use'),core=root.querySelector('.ag-money-line-lit');
      var blurred=Array.from(root.querySelectorAll('.ag-money-contour [filter]')).filter(function(el){return el!==core&&w.getComputedStyle(el).filter!=='none';}),coreAA=root.querySelector('#ag-money-edge-aa feGaussianBlur');
      check(!!field&&w.getComputedStyle(field).clipPath.includes('ag-money-left-clip')&&!!clipUse&&clipUse.getAttribute('href')==='#ag-money-left-shape'&&blurred.length>0&&blurred.every(function(el){return field.contains(el);}),theme+' all broad light layers remain clipped together by the left contour');
      check(!!field&&!!core&&!field.contains(core)&&w.getComputedStyle(core).filter.includes('ag-money-edge-aa')&&!!coreAA&&Number(coreAA.getAttribute('stdDeviation'))===.25&&core.getAttribute('mask')===field.getAttribute('mask'),theme+' the separate contour core uses only 0.25px antialiasing and the shared fade mask');
      enter('111111',false);
      check(d.activeElement===input,theme+' the long whole-thousand amount starts editing in the original input');
      await calcSettle(w,'rendered calculator motion');
      check(root.alfaGoal.state().target===111111000&&input.value==='111111',theme+' the long whole-thousand amount preserves all six significant digits as 111111000 rubles');
      check(input.clientWidth>0&&input.scrollWidth<=input.clientWidth+1,theme+' all tabular digits of 111111 fit without horizontal input scrolling',{clientWidth:input.clientWidth,scrollWidth:input.scrollWidth});
      check(d.activeElement===input&&input.selectionStart===input.value.length&&input.selectionEnd===input.value.length,theme+' fitting and animation preserve input focus and the collapsed editing caret');
      input.blur();await wait(180);
    }

    var restingOpacity=opacity();
    input.focus();await wait(200);
    check(readout.dataset.typing==='true'&&opacity()<=.01,'Focusing the amount hides its decorative unit');
    enter('300',false);input.setSelectionRange(input.value.length,input.value.length);input.dispatchEvent(new w.Event('select',{bubbles:true}));await wait(200);
    check(readout.dataset.typing==='true'&&opacity()<=.01,'Typing keeps the unit hidden during editing');
    await wait(800);
    check(readout.dataset.typing!=='true'&&opacity()>.01,'A collapsed-caret select event does not cancel the unit return within 1000ms of valid input');
    await wait(180);
    check(restingOpacity>.01&&opacity()>=restingOpacity-.01&&root.alfaGoal.state().target===300000&&input.value==='300','The returned unit preserves the whole-thousand amount and 300000-ruble target');
    enter('450',false);await wait(200);input.blur();
    check(readout.dataset.typing!=='true','Blur clears typing state immediately');await wait(180);
    check(opacity()>=restingOpacity-.01,'Blur restores the unit without waiting for the idle timeout');
    enter('150',false);await wait(200);
    input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    check(d.activeElement!==input&&readout.dataset.typing!=='true','Enter commits editing and immediately clears typing state');await wait(180);
    check(opacity()>=restingOpacity-.01,'Enter restores the unit without waiting for the idle timeout');
  } finally {
    input.blur();root.alfaGoal.setState(savedGoal);api.set(saved);
    if(savedTheme)click('[data-cv-theme="'+savedTheme+'"]');
    if(savedTab)click('[data-cm-tab="'+savedTab+'"]');
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples};
}

/* The approved goal/limit semantics and the rendered rulers. These checks use
   real quotes and physical SVG coordinates; CSS zoom is reported separately
   and is never described as an emulated devicePixelRatio. */
async function calcApprovedRegression(w) {
  var d=w.document,api=w.AS.CalcModal,root=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]');
  var saved=api.state().job,savedGoal=root.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab;
  var wasHidden=modal.hidden||!modal.classList.contains('is-open'),savedZoom=d.documentElement.style.zoom;
  var checks=[],errors=[],samples=[],range=root.querySelector('#ag-target-range'),target=root.querySelector('#ag-target');
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function $(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing approved control: '+selector);return el;}
  function click(selector){$(selector).click();}
  function wait(ms){return new Promise(function(resolve){w.setTimeout(resolve,ms);});}
  function normalized(value){return String(value).replace(/[\s\u00a0\u202f]+/g,' ').trim();}
  function hasMoney(el,amount){return normalized(el.textContent).includes(normalized(w.AlfaDesign.money(amount)));}
  function visible(el){return !!el&&!el.hidden&&!el.closest('[hidden]')&&el.getBoundingClientRect().width>0&&w.getComputedStyle(el).display!=='none';}
  function enter(text){target.focus();target.value=text;target.dispatchEvent(new w.Event('input',{bubbles:true}));target.blur();}
  function setJob(next,goal){
    api.set(Object.assign({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:30,sched:'6/1',road:0,food:0,v:'100',auto:false},next));
    root.alfaGoal.setState({target:goal});
  }
  function durationGeometry(label){
    var track=$('#ag-duration-track'),bounds=track.getBoundingClientRect(),scale=bounds.width/track.offsetWidth;
    var buttons=Array.from(track.querySelectorAll('[data-shifts]')).map(function(el){return {el:el,n:Number(el.dataset.shifts),r:el.getBoundingClientRect()};}).sort(function(a,b){return a.n-b.n;});
    var ticks=Array.from(track.querySelectorAll('.ag-duration-tick')),pseudo=w.getComputedStyle(track,'::before'),pseudoAfter=w.getComputedStyle(track,'::after');
    check(buttons.length>0&&ticks.length>0,label+' duration ruler contains real values and explicit ticks');
    check(Math.abs(track.offsetWidth-72)<=1,label+' duration track keeps its approved 72px width',{width:track.offsetWidth});
    check([pseudo,pseudoAfter].every(function(style){return style.content==='none'||style.content==='normal'||style.display==='none'||style.backgroundImage==='none';}),label+' the old repeating pseudo-element tick pattern is disabled');
    buttons.forEach(function(item){
      var r=item.r;
      check(Math.abs(r.width/scale-44)<=1&&Math.abs(r.height/scale-44)<=1,label+' '+item.n+' shift badge is 44px square',{width:r.width/scale,height:r.height/scale});
      check(r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1,label+' '+item.n+' shift badge fits vertically inside its track');
      ticks.forEach(function(tick){
        var tr=tick.getBoundingClientRect();
        if(tr.bottom>=r.top&&tr.top<=r.bottom)check(tr.left-r.right>=13*scale-1,label+' '+item.n+' badge and ruler tick remain separated',{gap:tr.left-r.right,scale:scale});
      });
    });
    for(var i=1;i<buttons.length;i++){
      check(buttons[i].r.bottom<=buttons[i-1].r.top+1,label+' adjacent '+buttons[i-1].n+'/'+buttons[i].n+' shift badges do not overlap');
    }
    if(buttons.length>2){
      var first=buttons[0],last=buttons[buttons.length-1],firstY=first.r.top+first.r.height/2,lastY=last.r.top+last.r.height/2;
      buttons.slice(1,-1).forEach(function(item,index){
        var actual=(firstY-(item.r.top+item.r.height/2))/(firstY-lastY),expected=(index+1)/(buttons.length-1);
        check(Math.abs(actual-expected)<.01,label+' '+item.n+' marker uses equal spacing between available durations',{actual:actual,expected:expected});
      });
    }
    var selected=$('#ag-duration-selected'),selectedRect=selected.getBoundingClientRect();
    if(selectedRect.width){
      check(Number(selected.textContent)==Number($('#ag-shifts').textContent),label+' floating duration badge matches the complete shift count');
      var arrow=w.getComputedStyle(selected,'::after'),arrowWidth=parseFloat(arrow.borderLeftWidth)||parseFloat(arrow.width)||0;
      check(arrow.content!=='none'&&arrow.content!=='normal'&&arrowWidth>0&&arrowWidth<=7,label+' selected duration has the compact outward arrow',{content:arrow.content,width:arrowWidth});
      ticks.forEach(function(tick){
        var tr=tick.getBoundingClientRect();
        if(tr.bottom>=selectedRect.top&&tr.top<=selectedRect.bottom)check(tr.left-(selectedRect.right+arrowWidth*scale)>=7*scale-1,label+' duration pointer keeps an 8px gap before the ticks',{gap:tr.left-selectedRect.right-arrowWidth*scale});
      });
    }
    samples.push({kind:'duration',label:label,scale:scale,height:bounds.height,values:buttons.map(function(item){return {shifts:item.n,center:item.r.top+item.r.height/2};})});
  }
  function physicalTicks(label){
    var dpr=w.devicePixelRatio,ticks=Array.from(root.querySelectorAll('#ag-money-ticks path')),worst=0,measurements=[];
    function distanceToInteger(value){return Math.abs(value-Math.round(value));}
    ticks.forEach(function(tick,index){
      var matrix=tick.getScreenCTM(),p=tick.getPointAtLength(0),end=tick.getPointAtLength(tick.getTotalLength()),stroke=parseFloat(w.getComputedStyle(tick).strokeWidth);
      var center=(matrix.b*p.x+matrix.d*p.y+matrix.f)*dpr,width=stroke*Math.hypot(matrix.c,matrix.d)*dpr;
      var top=center-width/2,bottom=center+width/2,error=Math.max(distanceToInteger(top),distanceToInteger(bottom));
      worst=Math.max(worst,error);
      check(error<=.035,label+' tick '+index+' upper and lower edges align to physical pixels',{top:top,bottom:bottom,dpr:dpr,strokePhysical:width});
      check(Math.abs((matrix.b*end.x+matrix.d*end.y+matrix.f)*dpr-center)<.035,label+' tick '+index+' remains horizontal in physical coordinates');
      measurements.push({center:center,strokePhysical:width,edgeError:error});
    });
    check(ticks.length>5,label+' physical alignment inspects a populated ruler');
    var last=measurements[measurements.length-1],previous=measurements[measurements.length-2];
    check(previous.center-previous.strokePhysical/2-last.center-last.strokePhysical/2>=2,label+' exact upper limit remains visibly separate from the preceding tick',{previous:previous,last:last});
    check(ticks.filter(function(tick){return Number(tick.dataset.value)===Number(range.max);}).length===1,label+' upper limit has exactly one tick');
    var highTicks=ticks.filter(function(tick){return tick.classList.contains('ag-money-tick--high');});
    check(highTicks.length>0&&highTicks.every(function(tick){return Number(w.getComputedStyle(tick).opacity)===1;}),label+' higher-output ticks stay fully opaque');
    samples.push({kind:'physical-ticks',label:label,devicePixelRatio:dpr,cssZoom:w.getComputedStyle(d.documentElement).zoom,worstEdgeError:worst,ticks:measurements});
  }
  try {
    await calcOpenCandidate(w);
    click('[data-cm-tab="job"]');
    setJob({},600000);await calcSettle(w,'rendered calculator motion');
    check(root.alfaGoal.state().target===600000&&target.value==='600','A typed 600-thousand goal survives the below-goal scale maximum');
    check(Number(range.max)===583000,'Sofyino scale stops at the last whole thousand below its actual 583627-ruble maximum',{max:range.max});
    check(hasMoney($('#ag-base-limit'),392807)&&hasMoney($('#ag-high-limit'),583627),'Both actual net limits are stated explicitly: 392807 base and 583627 high');
    check(api.state().job.v==='100'&&root.alfaGoal.state().high===false&&$('#ag-shifts').textContent==='60'&&hasMoney($('#ag-home'),392807),'An unreachable 600000-ruble goal retains explicit base output and its 60-shift 392807-ruble result');
    check(visible($('#ag-feasibility'))&&normalized($('#ag-feasibility-text').textContent).length>20,'An unattainable target has a visible explanatory feasibility message');
    check(hasMoney($('#ag-feasibility-text'),207193)&&normalized($('#ag-feasibility-text').textContent).includes('не дополнительные удержания'),'The 207193-ruble shortfall is explained as missing income rather than deductions');
    var maxAt600=Number(range.max);enter('999');await calcSettle(w,'rendered calculator motion');
    check(Number(range.max)===maxAt600&&root.alfaGoal.state().target===999000&&target.value==='999','Typing above the maximum preserves the typed goal without expanding or silently clamping it');
    setJob({},450000);await calcSettle(w,'rendered calculator motion');
    check(api.state().job.v==='100'&&root.alfaGoal.state().high===false,'A goal reachable only at high output does not silently switch performance');
    check(visible($('#ag-try-high'))&&!$('#ag-try-high').disabled,'The high-output alternative is offered as an explicit action');
    click('#ag-try-high');await calcSettle(w,'rendered calculator motion');
    check(api.state().job.v==='hi'&&root.alfaGoal.state().high===true&&root.alfaGoal.state().target===450000,'Only the explicit high-output action changes performance while preserving the 450000-ruble goal');
    check(d.activeElement===$('[data-ag-yield="hi"]'),'Applying high output moves focus from the hidden action to its selected segment');
    check(root.alfaGoal.current().hi.home>=450000,'Explicit high output selects an eligible contract that actually reaches the goal');
    setJob({},600000);await calcSettle(w,'rendered calculator motion');
    check(!visible($('#ag-alternatives-toggle')),'An unattainable 600000-ruble base target offers no fictitious alternative objects');
    setJob({pick:'ym-tarny'},350000);await calcSettle(w,'rendered calculator motion');
    check(visible($('#ag-alternatives-toggle')),'A real matching object is offered when the current object cannot meet 350000 rubles');
    click('#ag-alternatives-toggle');
    check(visible($('#ag-alternatives'))&&!!$('#ag-alternatives').querySelector('[data-ag-alternative="ym-sofyino"]'),'Alternative-object action exposes the actually eligible Sofyino offer');
    check(root.alfaGoal.state().target===350000&&api.state().job.pick==='ym-tarny'&&api.state().job.v==='100','Opening alternative objects preserves the selected object, target and performance');
    click('#ag-alternatives-toggle');
    check(!visible($('#ag-alternatives')),'Alternative-object results can be closed again');
    click('#ag-alternatives-toggle');click('[data-ag-alternative="ym-sofyino"]');await calcSettle(w,'rendered calculator motion');
    check(api.state().job.pick==='ym-sofyino'&&api.state().job.v==='100'&&root.alfaGoal.state().target===350000&&root.alfaGoal.current().home>=350000,'Selecting the real alternative preserves target and output and reaches the goal');
    check(d.activeElement===$('#ag-object'),'Selecting an alternative moves focus from the removed button to the object field');

    setJob({road:12000,food:500},600000);await calcSettle(w,'rendered calculator motion');
    check(Number(range.max)===560000&&hasMoney($('#ag-base-limit'),369507)&&hasMoney($('#ag-high-limit'),560327),'Food, road and reimbursement reduce both limits and the scale maximum by their actual costs');
    check(root.alfaGoal.state().target===600000&&target.value==='600'&&api.state().job.v==='100','Expense changes preserve an unreachable typed target without changing performance');
    setJob({region:'Владимир',prof:'Упаковщик',pick:'starodvorskie',sex:'f',shifts:30},600000);await calcSettle(w,'rendered calculator motion');
    check(api.state().job.pick==='starodvorskie'&&root.alfaGoal.current().o.id==='starodvorskie','The fixed-rate fixture uses the requested 30-shift object');
    check(Number(range.max)===107000&&hasMoney($('#ag-base-limit'),107160)&&hasMoney($('#ag-home'),107160),'The fixed-rate object keeps a whole-thousand scale ceiling below its exact 107160-ruble result');
    check(!visible($('#ag-high-limit'))&&!visible($('#ag-try-high'))&&!visible($('#ag-high-wrap')),'A fixed-rate object exposes no fictitious high-output limit or action');
    check($('#ag-shifts').textContent==='30'&&Array.from($('#ag-duration-track').querySelectorAll('[data-shifts]')).every(function(el){return Number(el.dataset.shifts)<=30;}),'The fixed-rate object never invents a 45- or 60-shift contract');
    durationGeometry('fixed-rate/30-shift-cap');

    for(var zoom of [1,1.25]){
      d.documentElement.style.zoom=String(zoom);
      for(var theme of ['light','dark']){
        click('[data-cv-theme="'+theme+'"]');setJob({},300000);await calcSettle(w,'rendered calculator motion');
        var label=theme+'/CSS-zoom-'+zoom;
        durationGeometry(label);physicalTicks(label+'/300k');
        enter('600');await calcSettle(w,'rendered calculator motion');physicalTicks(label+'/over-limit');
        check(root.alfaGoal.state().target===600000&&target.value==='600',label+' over-limit readout remains the typed amount after animation');
        var knob=$('.ag-money-knob').getBoundingClientRect(),amount=target.getBoundingClientRect();
        check(Math.abs(knob.top+knob.height/2-amount.top-amount.height/2)<=1,label+' over-limit amount stays aligned with the clamped knob');
      }
    }
  } finally {
    target.blur();d.documentElement.style.zoom=savedZoom;root.alfaGoal.setState(savedGoal);api.set(saved);
    if(savedTheme)click('[data-cv-theme="'+savedTheme+'"]');
    if(savedTab)click('[data-cm-tab="'+savedTab+'"]');
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples,devicePixelRatio:w.devicePixelRatio};
}

/* Regression for movement during a drag, rather than disconnected final
   screenshots. The real input event runs the real controller; measurements
   deliberately keep focus and scroll untouched until each transition ends. */
async function calcStabilityRegression(w) {
  var d=w.document,api=w.AS.CalcModal,root=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]'),panel=d.querySelector('.cm__panel');
  var frame=w.frameElement,savedSize=frame?{width:frame.style.width,height:frame.style.height}:null;
  var saved=api.state().job,savedGoal=root.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab;
  var wasHidden=modal.hidden||!modal.classList.contains('is-open'),savedScroll=panel.scrollTop,savedPage={x:w.scrollX,y:w.scrollY};
  var details=Array.from(root.querySelectorAll('details')).map(function(el){return {el:el,open:el.open};});
  var checks=[],errors=[],samples=[],range=root.querySelector('#ag-target-range');
  function $(selector){var el=d.querySelector(selector);if(!el)throw Error('Missing stability fixture: '+selector);return el;}
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function wait(ms){return new Promise(function(resolve){w.setTimeout(resolve,ms);});}
  function nextFrame(){return new Promise(function(resolve){w.requestAnimationFrame(resolve);});}
  function click(selector){$(selector).click();}
  function rect(el){var r=el.getBoundingClientRect();return {top:r.top,left:r.left,width:r.width,height:r.height};}
  function snapshot(){
    return {panel:rect(panel),scale:rect($('.ag-money-scale')),duration:rect($('.ag-duration')),result:rect($('#ag-result')),
      help:rect($('.ag-money-help')),scrollTop:panel.scrollTop,scrollLeft:panel.scrollLeft,pageX:w.scrollX,pageY:w.scrollY,
      markers:Array.from($('#ag-duration-track').querySelectorAll('[data-shifts]')).map(function(el){var r=el.getBoundingClientRect();return {value:el.dataset.shifts,x:r.left+r.width/2,y:r.top+r.height/2};})};
  }
  function rangeInput(amount){
    range.value=String(amount);range.dispatchEvent(new w.Event('input',{bubbles:true}));
  }
  function currentShapeChecks(label){
    var fill=root.querySelector('#ag-money-high-fill'),fillStyle=fill&&w.getComputedStyle(fill);
    check(!fill||fillStyle.display==='none'||fillStyle.visibility==='hidden'||fillStyle.fill==='none'||Number(fillStyle.fillOpacity)===0||Number(fillStyle.opacity)===0,label+' higher-income zone has no red rectangular fill');
    var separatorCount=[$('.ag-context'),$('#ag-object')].filter(function(el){
      var style=w.getComputedStyle(el);
      return parseFloat(style.borderBottomWidth)>0&&style.borderBottomStyle!=='none'&&style.borderBottomColor!=='transparent'&&style.borderBottomColor!=='rgba(0, 0, 0, 0)';
    }).length;
    check(separatorCount===1,label+' object field and context draw only one bottom separator',{count:separatorCount});
    var buttons=Array.from($('#ag-duration-track').querySelectorAll('[data-shifts]')).map(function(el){var r=el.getBoundingClientRect();return {value:Number(el.dataset.shifts),y:r.top+r.height/2};}).sort(function(a,b){return a.value-b.value;});
    var intervals=buttons.slice(1).map(function(item,index){return buttons[index].y-item.y;});
    check(intervals.length>=2&&Math.max.apply(null,intervals)-Math.min.apply(null,intervals)<=1,label+' available duration badges have equal vertical intervals',{intervals:intervals});
  }
  async function transition(from,to,label,keepPanelHeight){
    var before=snapshot();rangeInput(to);
    check(root.alfaGoal.state().target===to,label+' native range publishes the requested target',{target:root.alfaGoal.state().target,expected:to});
    var frames=[snapshot()];
    // Include the first paint/scroll-anchor response and intermediate animation
    // frames, not only the final layout after an accidental jump has settled.
    for(var i=0;i<12;i++){await nextFrame();frames.push(snapshot());}
    await wait(450);frames.push(snapshot());
    var drift={panelTop:0,panelLeft:0,panelWidth:0,panelHeight:0,scaleTop:0,scaleLeft:0,scaleWidth:0,scaleHeight:0,durationTop:0,durationHeight:0,resultTop:0,helpHeight:0,marker:0,scrollTop:0,scrollLeft:0,pageX:0,pageY:0};
    frames.forEach(function(now){
      [['panelTop','panel','top'],['panelLeft','panel','left'],['panelWidth','panel','width'],['panelHeight','panel','height'],
       ['scaleTop','scale','top'],['scaleLeft','scale','left'],['scaleWidth','scale','width'],['scaleHeight','scale','height'],
       ['durationTop','duration','top'],['durationHeight','duration','height'],['resultTop','result','top'],['helpHeight','help','height']].forEach(function(key){
        drift[key[0]]=Math.max(drift[key[0]],Math.abs(now[key[1]][key[2]]-before[key[1]][key[2]]));
      });
      ['scrollTop','scrollLeft','pageX','pageY'].forEach(function(key){drift[key]=Math.max(drift[key],Math.abs(now[key]-before[key]));});
      before.markers.forEach(function(marker){
        var actual=now.markers.filter(function(item){return item.value===marker.value;})[0];
        drift.marker=Math.max(drift.marker,actual?Math.abs(actual.x-marker.x):Infinity,actual?Math.abs(actual.y-marker.y):Infinity);
      });
    });
    check(drift.panelTop<=1&&drift.panelLeft<=1&&drift.panelWidth<=1,label+' dialog anchor and width remain stable while the value changes',drift);
    check(drift.scaleTop<=1&&drift.scaleLeft<=1&&drift.scaleWidth<=1&&drift.scaleHeight<=1,label+' money ruler stays under the pointer throughout the transition',drift);
    check(drift.durationTop<=1&&drift.durationHeight<=1&&drift.marker<=1,label+' duration rail and all duration centers remain stationary',drift);
    check(drift.resultTop<=1&&drift.helpHeight<=1,label+' result position and reserved hint/error height remain stable',drift);
    check(drift.scrollTop<=1&&drift.scrollLeft<=1&&drift.pageX<=1&&drift.pageY<=1,label+' neither modal scroll nor page scroll is adjusted by the transition',drift);
    if(keepPanelHeight)check(drift.panelHeight<=1,label+' zero validation does not resize the dialog',drift);
    check(d.activeElement===range,label+' native range keeps keyboard focus during the update');
    samples.push({label:label,from:from,to:to,before:before,after:frames[frames.length-1],drift:drift,measuredFrames:frames.length});
  }
  try {
    await calcOpenCandidate(w);
    click('[data-cm-tab="job"]');
    details.forEach(function(item){item.el.open=false;});
    api.set({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:60,sched:'6/1',road:0,food:0,v:'100',auto:false});
    var sizes=frame?[[1280,1200],[1280,720],[670,1244],[390,844]]:[[w.innerWidth,w.innerHeight]];
    for(var size of sizes){
      if(frame){frame.style.width=size[0]+'px';frame.style.height=size[1]+'px';}
      await calcSettle(w,'rendered calculator motion');
      for(var theme of ['light','dark']){
        click('[data-cv-theme="'+theme+'"]');
        var phases=[{name:'base-limit',values:[392000,393000,392000],constantHeight:false},{name:'zero-validation',values:[1000,0,1000],constantHeight:true}];
        // This real user viewport crosses from fitting content to overflow:
        // the scrollbar must not take width away from the ruler mid-drag.
        if(size[0]===670&&size[1]===1244)phases.push({name:'scrollbar-threshold',values:[253000,554000,253000],constantHeight:false});
        for(var phase of phases){
          for(var position of ['top','scrolled']){
            rangeInput(phase.values[0]);await calcSettle(w,'rendered calculator motion');
            var maximumScroll=Math.max(0,panel.scrollHeight-panel.clientHeight);
            if(position==='scrolled'&&maximumScroll<2)continue;
            panel.scrollTop=position==='scrolled'?Math.min(120,maximumScroll):0;
            range.focus({preventScroll:true});await nextFrame();await nextFrame();
            var label=size.join('x')+'/'+theme+'/'+position+'/'+phase.name;
            if(position==='top'&&phase.name==='base-limit')currentShapeChecks(label);
            for(var step=1;step<phase.values.length;step++)await transition(phase.values[step-1],phase.values[step],label+'/'+phase.values[step-1]+'-'+phase.values[step],phase.constantHeight);
          }
        }
      }
    }
  } catch(error) {
    errors.push('Unexpected stability-fixture error: '+(error.stack||error.message));
  } finally {
    range.blur();
    if(frame&&savedSize){frame.style.width=savedSize.width;frame.style.height=savedSize.height;}
    root.alfaGoal.setState(savedGoal);api.set(saved);details.forEach(function(item){item.el.open=item.open;});
    if(savedTheme)click('[data-cv-theme="'+savedTheme+'"]');
    if(savedTab)click('[data-cm-tab="'+savedTab+'"]');
    panel.scrollTop=savedScroll;w.scrollTo(savedPage.x,savedPage.y);
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples,devicePixelRatio:w.devicePixelRatio};
}
