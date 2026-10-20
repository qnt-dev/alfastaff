(function(){
  'use strict';
  var root=document.getElementById('alfa-goal'),E=window.AlfaDesign,F=window.AlfaGoalFeasibility;if(!root||!E||!F)return;
  var $=function(id){return root.querySelector('#'+id);},rub=function(n){return E.money(n)+' ₽';};
  var state=E.initial(),initialQuote=E.current(state);if(initialQuote)state.pick=initialQuote.o.id;
  var high=state.v==='hi',goal=initialQuote?(high&&initialQuote.hi?initialQuote.hi.home:initialQuote.home):180000,selected=null,offers=[],trials=[],lastDurationKey='',lastScheduleKey='',lastObjectName=initialQuote?initialQuote.o.short:'Выбранный объект';
  var quoteCache=null,quoteCacheKey='',feasibility=null,alternativeOffers=[],alternativesOpen=false,alternativesKey='';
  var moneySlider=window.AlfaMoneySlider(root,function(value){goal=value;render(false);});
  function snapshot(){var copy=Object.assign({},state,{target:goal,high:high,v:high?'hi':'100',auto:false});if(copy.start&&typeof copy.start.getTime==='function')copy.start=new Date(copy.start.getTime());return copy;}
  function changed(){root.dispatchEvent(new CustomEvent('alfa:change',{bubbles:true,detail:{state:snapshot()}}));}
  var text=function(id,value){$(id).textContent=value;};
  function option(select,value,label){var el=document.createElement('option');el.value=value;el.textContent=label;select.appendChild(el);}
  option($('ag-region'),'','Все регионы');E.regions.forEach(function(r){option($('ag-region'),r.key,r.label);});$('ag-region').value=state.region;
  option($('ag-role'),'','Любая профессия');E.roles.forEach(function(role){option($('ag-role'),role,role);});$('ag-role').value=state.prof;
  function quoteCatalog(){
    // Target movement does not change a quote. Rebuild only when its filters,
    // tariff or expenses change; every maximum still comes from the real model.
    var key=JSON.stringify([state.region,state.prof,state.sex,state.age,state.sched,state.food,state.road]);
    if(!quoteCache||key!==quoteCacheKey){quoteCache=F.catalog(E,state);quoteCacheKey=key;}
    return quoteCache;
  }
  function candidates(){var catalog=quoteCatalog();return Object.keys(catalog).map(function(id){var list=catalog[id];return list[list.length-1].quote;}).sort(function(a,b){return a.o.short.localeCompare(b.o.short,'ru');});}
  function refreshOffers(){offers=candidates();var sel=$('ag-object');sel.replaceChildren();if(!offers.some(function(c){return c.o.id===state.pick;})){option(sel,'','Выберите объект');}offers.forEach(function(c){option(sel,c.o.id,c.o.short);});sel.value=offers.some(function(c){return c.o.id===state.pick;})?state.pick:'';sel.disabled=!offers.length;}
  function exact(n){var trial=(quoteCatalog()[state.pick]||[]).filter(function(item){return item.shifts===n;})[0];return trial?trial.quote:null;}
  function amount(c){return high&&c.hi?c.hi.home:c.home;}
  function dl(id,rows){var list=$(id);list.replaceChildren();rows.forEach(function(row){var div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=row[0];dd.textContent=row[1];div.append(dt,dd);list.appendChild(div);});}
  function durationControls(c){
    var lens=E.durations(c.o.id,state),key=c.o.id+':'+lens.join(',');
    if(key!==lastDurationKey){
      lastDurationKey=key;var track=$('ag-duration-track'),layout=F.durationLayout(lens);track.replaceChildren();
      track.style.minHeight=layout.height+'px';
      layout.ticks.forEach(function(n){var tick=document.createElement('span');tick.className='ag-duration-tick';tick.dataset.durationTick=n;tick.setAttribute('aria-hidden','true');tick.style.top=layout.top(n)+'%';track.appendChild(tick);});
      lens.forEach(function(n){var b=document.createElement('button');b.type='button';b.dataset.shifts=n;b.setAttribute('aria-label',n+' смен — изменить цель на доход этой вахты');b.textContent=n;b.style.top=layout.top(n)+'%';track.appendChild(b);});
    }
    root.querySelectorAll('[data-shifts]').forEach(function(b){b.setAttribute('aria-pressed',String(+b.dataset.shifts===state.shifts));});
    root.querySelectorAll('[data-duration-tick]').forEach(function(tick){tick.classList.toggle('is-selected',+tick.dataset.durationTick===state.shifts);});
    var sk=c.o.id+':'+c.t.scheds.join(',');
    if(sk!==lastScheduleKey){
      lastScheduleKey=sk;var box=$('ag-schedule');box.replaceChildren();
      var label=document.createElement('span');label.textContent='ГРАФИК';
      var group=document.createElement('div');group.className='ag-segments';group.setAttribute('role','group');group.setAttribute('aria-label','График работы');
      c.t.scheds.forEach(function(s){var b=document.createElement('button');b.type='button';b.dataset.sched=s;b.textContent=s;b.setAttribute('aria-label','График '+s);group.appendChild(b);});
      box.append(group,label);
    }
    root.querySelectorAll('[data-sched]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.sched===c.sched));});
  }
  function basis(c){
    var label=high&&c.hi?c.hi.label:(c.p.basis==='fixed'?'Фиксированная ставка':c.p.basis==='100'?'При 100 % выработке':'По базовой ставке объекта');
    return label;
  }
  function feasibilityControls(c){
    var f=feasibility,baseQuote=f.baseBest.quote;
    text('ag-base-limit',(baseQuote.p.basis==='fixed'?'Фиксированная ставка':baseQuote.p.basis==='100'?'При 100 % выработке':'Базовая ставка')+': '+rub(f.baseMax)+' за '+f.baseBest.shifts+' смен');
    $('ag-high-limit').hidden=!f.highBest;
    if(f.highBest)text('ag-high-limit',f.highLabel+': '+rub(f.highMax)+' за '+f.highBest.shifts+' смен');
    $('ag-limits').hidden=false;
    var impossible=goal>0&&!f.reachable;
    $('ag-feasibility').hidden=!impossible;
    $('ag-try-high').hidden=!impossible||!f.canReachHigh;
    if(f.canReachHigh)text('ag-try-high','Рассчитать '+f.highLabel);
    if(impossible){
      var best=f.currentBest,rate=high&&c.hi?c.hi.label:c.p.basis==='fixed'?'по фиксированной ставке':basis(c).toLowerCase();
      var explanation=best.shifts===f.maxShifts?
        'За '+best.shifts+' смен '+rate+' по расчёту останется '+rub(f.actual)+' после налога и расходов. Это самый длинный доступный срок.':
        'Лучший результат '+rate+' по расчёту — '+rub(f.actual)+' за '+best.shifts+' смен; доступные сроки — до '+f.maxShifts+' смен.';
      text('ag-feasibility-text',explanation+' Разница с целью — '+rub(goal-f.actual)+': это недостающий доход, а не дополнительные удержания.');
    }
    alternativeOffers=impossible?F.alternatives(quoteCatalog(),state.pick,goal,high):[];
    var key=JSON.stringify([quoteCacheKey,state.pick,goal,high]);
    if(key!==alternativesKey){alternativesKey=key;alternativesOpen=false;}
    $('ag-alternatives-toggle').hidden=!alternativeOffers.length;
    text('ag-alternatives-toggle','Подходящие объекты: '+alternativeOffers.length);
    $('ag-alternatives-toggle').setAttribute('aria-expanded',String(alternativesOpen&&!!alternativeOffers.length));
    $('ag-alternatives').hidden=!alternativesOpen||!alternativeOffers.length;
    var list=$('ag-alternatives');list.replaceChildren();
    alternativeOffers.forEach(function(item){
      var result=item.result,b=document.createElement('button');b.type='button';b.dataset.agAlternative=item.id;
      b.textContent=result.selected.quote.o.short+' · '+result.selected.shifts+' смен · '+rub(result.actual);
      b.setAttribute('aria-label','Выбрать '+b.textContent);list.appendChild(b);
    });
  }
  function render(syncInput){
    var base=offers.filter(function(c){return c.o.id===state.pick;})[0]||null;
    if(!base){selected=null;feasibility=null;['ag-instruments','ag-result','ag-options','ag-limits','ag-feasibility'].forEach(function(id){$(id).hidden=true;});$('ag-empty').hidden=false;var note=offers.length?'Для должности «'+(state.prof||'Любая профессия')+'» выберите подходящий объект выше.':'В регионе «'+(state.region||'Все регионы')+'» нет объектов для должности «'+(state.prof||'Любая профессия')+'». Измените регион или должность.';text('ag-empty-text',note);text('ag-notice',lastObjectName+' сейчас не подходит выбранным условиям.');$('ag-notice').hidden=false;changed();return;}
    ['ag-instruments','ag-result','ag-options'].forEach(function(id){$(id).hidden=false;});$('ag-empty').hidden=true;$('ag-notice').hidden=true;lastObjectName=base.o.short;
    if(base.t.scheds.indexOf(state.sched)<0)state.sched=base.t.scheds[0];
    if(!base.hi)high=false;$('ag-high-wrap').hidden=!base.hi;
    root.querySelectorAll('[data-ag-yield]').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.agYield==='hi')===high));});
    root.querySelector('[data-ag-yield="hi"]').textContent=base.hi?base.hi.label:'';
    trials=quoteCatalog()[base.o.id]||[];var lengths=trials.map(function(trial){return trial.shifts;});
    feasibility=F.evaluate(trials,goal,high);
    selected=feasibility.selected?feasibility.selected.quote:null;
    var c=selected;if(!c){changed();return;}state.shifts=feasibility.selected.shifts;
    var reachable=feasibility.reachable,actual=feasibility.actual,valid=goal>0;
    moneySlider.sync(goal,feasibility.maximum,{baseMax:feasibility.baseMax,highMax:feasibility.highMax});
    $('ag-target-error').hidden=valid;$('ag-target').setAttribute('aria-invalid',String(!valid));
    text('ag-shifts',state.shifts);text('ag-days',c.days);text('ag-duration-label',reachable?'Для этого нужно':'По этим условиям');text('ag-duration-note',reachable?'Минимальная подходящая вахта':'Доступные сроки — до '+feasibility.maxShifts+' смен');
    text('ag-home',E.money(actual));text('ag-delta',reachable?(actual===goal?'Цель совпадает с расчётом':'На '+rub(actual-goal)+' больше цели'):'Цель выше дохода за доступную вахту');
    text('ag-basis',basis(c));
    text('ag-calendar-unit',c.days%100>=11&&c.days%100<=14?'календарных дней':c.days%10===1?'календарный день':c.days%10>=2&&c.days%10<=4?'календарных дня':'календарных дней');
    durationControls(c);
    feasibilityControls(c);
    root.querySelectorAll('button,select,summary').forEach(function(el){el.classList.add('cursor-interaction');});
    var g=high&&c.hi?c.hi.gross:c.gross,tax=high&&c.hi?c.hi.tax:c.tax;
    dl('ag-breakdown',[['Начислено за оплаченные смены',rub(g)],['Налог 6 %','− '+rub(tax)],['Питание: '+rub(c.perDay)+' × '+c.days+' дн.','− '+rub(c.food)],['Дорога туда и обратно','− '+rub(state.road)],['Компенсация дороги','+ '+rub(c.comp)],['После налога и расходов',rub(actual)]]);
    text('ag-food-note',c.t.foodNote+'. С учётом питания на объекте ваши расходы — '+rub(c.perDay)+' в календарный день.');
    text('ag-training',(c.t.unpaid?c.t.unpaid+' неоплач. смен'+(c.t.unpaid===1?'а':'ы')+' обучения '+(c.t.counted?'включено в срок вахты.':'добавлено к сроку вахты.'):'Без неоплачиваемого обучения.')+' Оплаченных смен: '+c.paid+'.'+(c.inN?' Первые '+c.inN+' — по '+rub(c.p.intern.rate)+'.':'')+' График '+c.sched+'; календарный срок приблизительный.');
    text('ag-condition-title',c.o.short);text('ag-position',c.p.text);
    dl('ag-condition-list',[['Должность',state.prof||c.p.jobs[0]],['Кому подходит',c.o.who],['Смены',c.o.shiftFull],['Жильё',c.o.housing],['Питание',c.o.mealsFull],['До объекта',c.o.transport],['Аванс',c.o.advanceText],['Доступные сроки',lengths.join(', ')+' смен']]);
    text('ag-condition-note',(c.o.note?c.o.note+'. ':'')+'Условия и дату заезда нужно подтвердить перед поездкой.');
    changed();
  }
  root.addEventListener('click',function(event){var b=event.target.closest('button');if(!b||!root.contains(b))return;if(b.dataset.shifts){var c=exact(+b.dataset.shifts);if(c){goal=Math.max(0,amount(c));render(true);}}else if(b.dataset.sched){state.sched=b.dataset.sched;render(true);}else if(b.dataset.agYield){high=b.dataset.agYield==='hi';render(true);}else if(b.id==='ag-try-high'&&feasibility&&feasibility.canReachHigh){high=true;render(true);root.querySelector('[data-ag-yield="hi"]').focus({preventScroll:true});}else if(b.id==='ag-alternatives-toggle'&&alternativeOffers.length){alternativesOpen=!alternativesOpen;feasibilityControls(selected);}else if(b.dataset.agAlternative&&alternativeOffers.some(function(item){return item.id===b.dataset.agAlternative;})){state.pick=b.dataset.agAlternative;$('ag-object').value=state.pick;render(true);$('ag-object').focus({preventScroll:true});}else if(b.id==='ag-conditions-open'){$('ag-conditions').open=true;}});
  $('ag-region').addEventListener('change',function(){state.region=this.value;refreshOffers();render(true);});
  $('ag-role').addEventListener('change',function(){state.prof=this.value;refreshOffers();render(true);});
  $('ag-object').addEventListener('change',function(){state.pick=this.value;render(true);});
  ['food','road'].forEach(function(field){$('ag-'+field).addEventListener('input',function(){state[field]=E.parseMoney(this.value);render(false);});});
  function syncInputs(){['food','road'].forEach(function(field){$('ag-'+field).value=E.money(state[field]);});$('ag-region').value=state.region;$('ag-role').value=state.prof;}
  root.alfaGoal={state:snapshot,current:function(){return selected;},setState:function(next){
    next=next||{};var previous=snapshot(),external=['region','prof','pick','shifts','sched','sex','age','v','food','road'].some(function(key){return Object.prototype.hasOwnProperty.call(next,key)&&next[key]!==previous[key];});
    state=Object.assign({},state,next);high=Object.prototype.hasOwnProperty.call(next,'v')?next.v==='hi':Object.prototype.hasOwnProperty.call(next,'high')?!!next.high:high;
    var quote=E.current(state);if(quote)state.pick=quote.o.id;
    if(Object.prototype.hasOwnProperty.call(next,'target'))goal=E.parseMoney(next.target);else if(external&&quote)goal=Math.max(0,amount(quote));
    syncInputs();refreshOffers();render(true);return snapshot();
  }};
  syncInputs();refreshOffers();render(true);
})();
