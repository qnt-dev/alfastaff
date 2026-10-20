/* Real-controller checks for an agreed extension: 20 + 10 becomes 30.
   Expected money is independently calculated from the Sofyino fixture's rates,
   rather than copied from the production quote or feasibility helpers. */
async function calcExtensionRegression(w) {
  var d=w.document,api=w.AS.CalcModal,root=d.querySelector('#alfa-goal'),modal=d.querySelector('[data-cm]');
  var saved=root.alfaGoal.state(),savedTheme=modal.dataset.calcTheme,savedTab=modal.dataset.tab;
  var wasHidden=modal.hidden||!modal.classList.contains('is-open'),savedExpenses=root.querySelector('#ag-expenses').open,checks=[],errors=[],samples=[];
  function $(selector){var el=root.querySelector(selector);if(!el)throw Error('Missing extension UI: '+selector);return el;}
  function check(ok,name,detail){(ok?checks:errors).push(name+(ok?'':' '+JSON.stringify(detail)));}
  function rect(el){var r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}
  function expected(n,food,road,sched,high){
    var gross=2*5940+(n-2)*(high?10500:7000),tax=Math.round(gross*.06);
    var days=n+1+(sched==='6/1'?Math.floor(n/6):0),perDay=Math.round(food*.6),meals=days*perDay;
    var comp=n>=30?Math.min(10000,road):0;
    return {gross:gross,tax:tax,days:days,food:meals,comp:comp,home:gross-tax-meals-road+comp};
  }
  function baseOf(n){return n>=60?60:n>=45?45:n>=30?30:20;}
  function extraLabel(n){return n%100>=11&&n%100<=14?'дополнительных':n%10===1?'дополнительная':n%10>=2&&n%10<=4?'дополнительные':'дополнительных';}
  function move(value){
    var range=$('#ag-target-range');range.value=String(value);
    range.dispatchEvent(new w.Event('input',{bubbles:true}));
  }
  function geometry(){
    var selectors=['.ag-duration','.ag-duration-summary','.ag-duration-calendar','#ag-schedule','#ag-result'];
    return selectors.map(function(selector){return {selector:selector,box:rect($(selector))};});
  }
  function verify(n,food,road,sched,high,label){
    var e=expected(n,food,road,sched,high),q=root.alfaGoal.current(),shared=api.state();
    check($('#ag-shifts').textContent===String(n)&&root.alfaGoal.state().shifts===n&&shared.job.shifts===n,
      label+' visible, local and shared shift totals agree',{visible:$('#ag-shifts').textContent,local:root.alfaGoal.state().shifts,shared:shared.job.shifts});
    check(q&&q.o.id==='ym-sofyino'&&shared.current&&shared.current.o.id==='ym-sofyino'&&shared.job.pick==='ym-sofyino',
      label+' intermediate duration preserves the selected object');
    var quote=high?q.hi:q;
    check(quote.gross===e.gross&&quote.tax===e.tax&&quote.home===e.home&&q.days===e.days&&q.food===e.food&&q.comp===e.comp,
      label+' uses actual tariff, one internship, calendar costs and reimbursement',{actual:{gross:quote.gross,tax:quote.tax,home:quote.home,days:q.days,food:q.food,comp:q.comp},expected:e});
    check(Number($('#ag-home').textContent.replace(/\D/g,''))===e.home&&Number($('#ag-days').textContent)===e.days,
      label+' result and calendar text match the exact quote');
    var base=baseOf(n),extra=n-base,extension=$('#ag-duration-extension');
    check(extension.textContent.trim()===(extra?base+' основных + '+extra+' '+extraLabel(extra):''),
      label+' extension is explained and clears at exact milestones',{text:extension.textContent});
    var selected=$('#ag-duration-selected'),badge=rect(selected),track=$('#ag-duration-track'),bounds=rect(track);
    check(selected.textContent.trim()===String(n)&&badge.width>0&&badge.top>=bounds.top-1&&badge.bottom<=bounds.bottom+1,
      label+' floating badge shows the total within the ruler',{badge:badge,track:bounds,text:selected.textContent});
    var anchors=Array.from(track.querySelectorAll('[data-shifts]')).sort(function(a,b){return Number(a.dataset.shifts)-Number(b.dataset.shifts);});
    check(anchors.map(function(el){return Number(el.dataset.shifts);}).join(',')==='20,30,45,60',
      label+' milestone controls retain their original values');
    var low=anchors.filter(function(el){return Number(el.dataset.shifts)<=n;}).pop(),highAnchor=anchors.find(function(el){return Number(el.dataset.shifts)>=n;});
    var lowRect=rect(low),highRect=rect(highAnchor),fraction=low===highAnchor?0:(n-Number(low.dataset.shifts))/(Number(highAnchor.dataset.shifts)-Number(low.dataset.shifts));
    var expectedCenter=lowRect.top+lowRect.height/2+(highRect.top+highRect.height/2-lowRect.top-lowRect.height/2)*fraction;
    check(Math.abs(badge.top+badge.height/2-expectedCenter)<=1,
      label+' floating badge interpolates between its neighboring milestones',{center:badge.top+badge.height/2,expectedCenter:expectedCenter});
    var selectedTick=rect($('#ag-duration-selected-tick'));
    check(selectedTick.width>0&&Math.abs(selectedTick.top+selectedTick.height/2-badge.top-badge.height/2)<=1,
      label+' selected tick stays aligned with the floating badge',{tickCenter:selectedTick.top+selectedTick.height/2,badgeCenter:badge.top+badge.height/2});
    anchors.forEach(function(anchor){
      var span=anchor.querySelector('.ag-duration-anchor-label')||anchor,textStyle=w.getComputedStyle(span),glyphRange=d.createRange();
      glyphRange.selectNodeContents(span);var ar=glyphRange.getBoundingClientRect();
      var overlaps=ar.width>0&&badge.top<ar.bottom&&badge.bottom>ar.top&&badge.left<ar.right&&badge.right>ar.left;
      if(overlaps)check(textStyle.visibility==='hidden'||Number(textStyle.opacity)===0||textStyle.color==='rgba(0, 0, 0, 0)',
        label+' overlapping '+anchor.dataset.shifts+' label glyphs are concealed without removing its button',{style:{visibility:textStyle.visibility,opacity:textStyle.opacity,color:textStyle.color},glyphs:{top:ar.top,bottom:ar.bottom,left:ar.left,right:ar.right}});
      check(!anchor.disabled&&typeof anchor.click==='function',label+' '+anchor.dataset.shifts+' milestone remains selectable');
    });
    var summary=rect($('.ag-duration-summary')),calendar=rect($('.ag-duration-calendar')),schedule=rect($('#ag-schedule')),content=rect($('.ag-duration-content'));
    check(summary.bottom<=calendar.top+1&&calendar.bottom<=schedule.top+1&&summary.left>=content.left-1&&summary.right<=content.right+1,
      label+' duration summary, calendar and schedule stay separate',{summary:summary,calendar:calendar,schedule:schedule,content:content});
    var textRange=d.createRange();textRange.selectNodeContents(extension);
    var textBox=textRange.getBoundingClientRect();
    check(!extra||(textBox.left>=content.left-1&&textBox.right<=content.right+1&&textBox.bottom<=calendar.top+1),
      label+' additional-shift explanation stays readable within its column',{text:rect(extension),glyphs:{left:textBox.left,right:textBox.right,bottom:textBox.bottom}});
    samples.push({label:label,shifts:n,goal:root.alfaGoal.state().target,net:e.home,days:e.days,extension:extension.textContent,badgeCenter:badge.top+badge.height/2,geometry:geometry()});
  }
  try {
    await calcOpenCandidate(w);
    // These controls are mandatory; fail immediately against the previous UI.
    $('#ag-duration-extension');$('#ag-duration-selected');
    for(var theme of ['light','dark']){
      d.querySelector('[data-cv-theme="'+theme+'"]').click();
      root.alfaGoal.setState({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:20,sched:'6/1',road:600,food:400,v:'100',auto:false,target:123000});
      await calcSettle(w,'extension '+theme+' baseline');
      var originalGeometry=geometry(),q=root.alfaGoal.current();
      check(q.rate===7000&&q.p.intern.shifts===2&&q.p.intern.rate===5940&&q.hi.rate===10500,
        theme+' independent expected values use the current documented Sofyino rates');
      for(var n of [20,21,25,29,30,31,45,50,60]){
        var target=Math.floor(expected(n,400,600,'6/1',false).home/1000)*1000;
        move(target);await calcSettle(w,theme+' extension '+n);
        var label=theme+'/'+n+' shifts';verify(n,400,600,'6/1',false,label);
        var now=geometry(),maxDrift=0;
        now.forEach(function(item,index){
          ['top','left','width','height'].forEach(function(key){maxDrift=Math.max(maxDrift,Math.abs(item.box[key]-originalGeometry[index].box[key]));});
        });
        check(maxDrift<=1,label+' adding/removing the explanation does not move or resize the card',{maxDrift:maxDrift});
      }
      $('#ag-duration-track [data-shifts="30"]').click();await calcSettle(w,theme+' explicit milestone');
      verify(30,400,600,'6/1',false,theme+'/30 milestone button');
      var before=JSON.stringify(root.alfaGoal.state());
      d.querySelector('[data-cm-tab="biz"]').click();d.querySelector('[data-cm-tab="job"]').click();
      await calcSettle(w,theme+' extension mode round-trip');
      check(JSON.stringify(root.alfaGoal.state())===before,theme+' employer round-trip preserves the duration and target');
    }
    root.alfaGoal.setState({sched:'7/0',food:500,road:12000,v:'100',target:Math.floor(expected(25,500,12000,'7/0',false).home/1000)*1000});
    await calcSettle(w,'extension 7/0 expenses');verify(25,500,12000,'7/0',false,'7/0 expenses');
    $('#ag-expenses').open=true;
    var amounts=Array.from($('#ag-breakdown').querySelectorAll('dd')).map(function(el){return Number(el.textContent.replace(/\D/g,''));});
    var e=expected(25,500,12000,'7/0',false);
    check(JSON.stringify(amounts)===JSON.stringify([e.gross,e.tax,e.food,12000,e.comp,e.home]),
      'Expanded calculation itemizes the exact extended-stay amounts',{actual:amounts,expected:[e.gross,e.tax,e.food,12000,e.comp,e.home]});
    $('#ag-expenses').open=false;
    root.alfaGoal.setState({sched:'6/1',food:400,road:600,v:'hi',target:Math.floor(expected(25,400,600,'6/1',true).home/1000)*1000});
    await calcSettle(w,'extension high output');verify(25,400,600,'6/1',true,'150 percent extension');
    root.alfaGoal.setState({region:'Москва и МО',prof:'Комплектовщик',pick:'ym-sofyino',sex:'',age:0,shifts:30,sched:'7/0',road:0,food:9600,v:'100',auto:false,target:16000});
    await calcSettle(w,'rounded target before an explicit duration');verify(29,9600,0,'7/0',false,'16-thousand minimum-duration fixture');
    $('#ag-duration-track [data-shifts="30"]').click();await calcSettle(w,'explicit 30 shifts in the same thousand-ruble bucket');
    verify(30,9600,0,'7/0',false,'explicit 30 with a 16847-ruble result');
    check(root.alfaGoal.state().target===16000&&root.alfaGoal.current().home===16847&&$('#ag-duration-label').textContent==='Вы выбрали'&&$('#ag-duration-note').textContent==='Расчёт на выбранный срок',
      'An explicit 30-shift choice retains its 16847-ruble quote despite the displayed 16000-ruble goal');
    var chosenBefore=JSON.stringify(root.alfaGoal.state());
    d.querySelector('[data-cm-tab="biz"]').click();d.querySelector('[data-cm-tab="job"]').click();
    await calcSettle(w,'explicit duration mode round-trip');
    check(JSON.stringify(root.alfaGoal.state())===chosenBefore&&$('#ag-shifts').textContent==='30'&&root.alfaGoal.current().home===16847,
      'Employer round-trip preserves an explicitly chosen duration in the same thousand-ruble bucket');
    move(16000);await calcSettle(w,'money input releases the explicit duration');
    verify(29,9600,0,'7/0',false,'money input restores the 29-shift 16027-ruble minimum');
    check(root.alfaGoal.current().home===16027&&$('#ag-duration-label').textContent==='Для этого нужно'&&$('#ag-duration-note').textContent==='Минимальная подходящая вахта',
      'Moving the monetary target resumes minimum-duration solving and clears the explicit-choice wording');
  }catch(error){errors.push('Unexpected extension fixture error: '+(error.stack||error.message));}
  finally {
    root.alfaGoal.setState(saved);
    root.querySelector('#ag-expenses').open=savedExpenses;
    if(savedTheme)d.querySelector('[data-cv-theme="'+savedTheme+'"]').click();
    if(savedTab)d.querySelector('[data-cm-tab="'+savedTab+'"]').click();
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,samples:samples,viewport:{width:w.innerWidth,height:w.innerHeight}};
}
