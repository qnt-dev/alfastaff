/* Opening must reach its final text position and size before the first visible
   frame. Check screen coordinates as well as local layout: normalizing away an
   entrance transform used to hide the visible text "settling" regression. */
async function calcOpeningRegression(w) {
  var d=w.document,modal=d.querySelector('[data-cm]'),panel=d.querySelector('.cm__panel');
  var opener=Array.from(d.querySelectorAll('[data-calc-open]')).find(function(button){
    return button.getClientRects().length&&w.getComputedStyle(button).visibility!=='hidden';
  }),checks=[],errors=[],runs=[];
  if(!modal||!panel||!opener)throw Error('Missing calculator opening controls');
  var wasHidden=modal.hidden,savedTab=modal.dataset.tab,savedTheme=modal.dataset.calcTheme;
  var params=new URLSearchParams(location.search),audience=params.get('audience')==='biz'?'biz':'job',theme=params.get('theme')==='dark'?'dark':'light';
  var traces=[];w.calcOpeningFrameTraces=traces;
  var includeFrames=new URLSearchParams(location.search).has('frames');
  var selectors={
    brand:'#alfa-goal .calc-source-brand',
    emblem:'#alfa-goal .calc-source-mark',wordmark:'#alfa-goal .calc-source-wordmark',
    title:'#alfa-goal>h2',context:'#alfa-goal .ag-context',select:'#ag-object',
    ruler:'#alfa-goal .ag-money-scale',readout:'#alfa-goal .ag-money-readout',
    amount:'#ag-target',unit:'#alfa-goal .ag-money-value-unit',
    duration:'#alfa-goal .ag-duration',result:'#alfa-goal .ag-result'
  };
  if(audience==='biz'){
    Object.keys(selectors).forEach(function(key){selectors[key]=selectors[key].replace(/#alfa-goal/g,'#alfa-employer').replace(/#ag-/g,'#ec-');});
    selectors.select='#ec-region';
  }
  function check(ok,name){(ok?checks:errors).push(name);}
  function round(n){return Math.round(n*1000)/1000;}
  function nextFrame(){
    return new Promise(function(resolve,reject){
      var timer=setTimeout(function(){reject(Error('No animation frame during opening capture'));},3000);
      w.requestAnimationFrame(function(){clearTimeout(timer);resolve();});
    });
  }
  function capture(start){
    var p=panel.getBoundingClientRect(),style=w.getComputedStyle(panel);
    var matrix=new w.DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform);
    var sx=matrix.a||1,sy=matrix.d||1;
    function rect(r){return [round((r.left-p.left)/sx),round((r.top-p.top)/sy),round(r.width/sx),round(r.height/sy)];}
    function screenRect(r){return [round(r.left),round(r.top),round(r.width),round(r.height)];}
    var workspace=w.getComputedStyle(d.querySelector('.calc-workspace'));
    var result={
      ms:round(w.performance.now()-start),visible:!modal.hidden&&style.visibility!=='hidden'&&workspace.visibility!=='hidden'&&Number(style.opacity)>0,
      open:modal.classList.contains('is-open'),opacity:round(Number(style.opacity)),
      transform:style.transform,panel:[round(p.width/sx),round(p.height/sy)],
      screenPanel:screenRect(p),
      transformIdentity:Math.abs(matrix.a-1)<.0001&&Math.abs(matrix.d-1)<.0001&&Math.abs(matrix.b)<.0001&&Math.abs(matrix.c)<.0001&&Math.abs(matrix.e)<.01&&Math.abs(matrix.f)<.01,
      fonts:{status:d.fonts.status,onest:d.fonts.check('450 52px Onest','0123456789₽'),heading:d.fonts.check('650 36px Onest','С какой суммой')},
      nodes:{},glyphs:[]
    };
    Object.keys(selectors).forEach(function(key){
      var el=d.querySelector(selectors[key]),s=w.getComputedStyle(el);
      result.nodes[key]={rect:rect(el.getBoundingClientRect()),screenRect:screenRect(el.getBoundingClientRect()),fontSize:parseFloat(s.fontSize),fontFamily:s.fontFamily};
      if(key==='amount'){result.nodes[key].width=parseFloat(s.width);result.nodes[key].value=el.value;}
    });
    var title=d.querySelector(selectors.title),walker=d.createTreeWalker(title,w.NodeFilter.SHOW_TEXT),node;
    while((node=walker.nextNode())){
      if(!node.textContent.trim())continue;
      var range=d.createRange();range.selectNodeContents(node);
      Array.from(range.getClientRects()).forEach(function(r){result.glyphs.push(rect(r));});
    }
    return result;
  }
  function maxDelta(frames,read){
    var values=frames.map(read).filter(Number.isFinite);
    return values.length?round(Math.max.apply(null,values)-Math.min.apply(null,values)):0;
  }
  async function opening(label){
    var start=w.performance.now(),frames=[],visibleSince=null;
    opener.click();frames.push(capture(start));
    do{
      await nextFrame();
      var sample=capture(start);frames.push(sample);
      if(sample.visible&&visibleSince===null)visibleSince=sample.ms;
      if(w.performance.now()-start>8000)throw Error(label+' did not finish opening within 8 seconds');
    }while(visibleSince===null||sample.ms-visibleSince<1200||d.fonts.status==='loading');
    var visible=frames.filter(function(frame){return frame.visible;}),drift={};
    check(visible.length>=6,label+': enough real visible frames were observed');
    check(visible.every(function(frame){return frame.transformIdentity;}),label+': no visible frame translates or scales the calculator panel');
    var screenPanelDrift=[0,1,2,3].map(function(i){return maxDelta(visible,function(f){return f.screenPanel[i];});});
    drift.screenPanel=screenPanelDrift;
    check(screenPanelDrift.every(function(n){return n<=.25;}),label+': panel appears at its final screen position and size');
    Object.keys(selectors).forEach(function(key){
      var geometry=[0,1,2,3].map(function(i){return maxDelta(visible,function(f){return f.nodes[key].rect[i];});});
      var fontSize=maxDelta(visible,function(f){return f.nodes[key].fontSize;});
      var screenGeometry=[0,1,2,3].map(function(i){return maxDelta(visible,function(f){return f.nodes[key].screenRect[i];});});
      drift[key]={rect:geometry,screenRect:screenGeometry,fontSize:fontSize};
      check(geometry.every(function(n){return n<=1;}),label+': '+key+' keeps its layout throughout opening');
      check(screenGeometry.every(function(n){return n<=.25;}),label+': '+key+' stays stationary at its final rendered size');
      check(fontSize<=.05,label+': '+key+' keeps its text size throughout opening');
    });
    var glyphCount=visible[0].glyphs.length;
    var glyphs=visible.every(function(f){return f.glyphs.length===glyphCount;});
    var glyphDrift=0;
    for(var i=0;i<glyphCount;i++)for(var j=0;j<4;j++){
      glyphDrift=Math.max(glyphDrift,maxDelta(visible,function(f){return f.glyphs[i]&&f.glyphs[i][j];}));
    }
    drift.titleGlyphs=glyphDrift;
    check(glyphs&&glyphDrift<=1,label+': heading glyphs do not change font metrics after reveal');
    traces.push({label:label,frames:frames});
    var summary={label:label,firstVisibleMs:visibleSince,visibleFrames:visible.length,drift:drift,firstVisible:visible[0],last:visible[visible.length-1]};
    if(includeFrames)summary.frames=frames;
    runs.push(summary);
  }
  async function frameWindow(duration){
    var start=w.performance.now();
    do{await nextFrame();}while(w.performance.now()-start<duration);
  }
  function escape(){
    d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  }
  async function lifecycle(){
    await calcCloseModal(w);
    opener.click();escape();
    await frameWindow(80);
    check(modal.hidden&&!modal.classList.contains('is-open'),'Escape cancels an opening before its reveal');
    check(!d.documentElement.classList.contains('cm-lock'),'Cancelling preparation releases the page scroll lock');
    check(d.activeElement===opener,'Cancelling preparation restores focus to the opener');
    opener.click();escape();opener.click();
    await calcWaitFor(w,function(){return modal.classList.contains('is-open');},'immediate open-close-open');
    await frameWindow(600);
    check(!modal.hidden&&modal.classList.contains('is-open'),'Immediate open-close-open stays open after old callbacks finish');
    modal.querySelector('.cm__close').click();opener.click();
    await calcWaitFor(w,function(){return modal.classList.contains('is-open');},'reopening during the closing transition');
    await frameWindow(600);
    check(!modal.hidden&&modal.classList.contains('is-open'),'Reopening during a close cancels the old hide timer');
    check(d.documentElement.classList.contains('cm-lock'),'The reopened modal keeps its page scroll lock');
    check(d.activeElement===modal.querySelector('.cm__close'),'The reopened modal owns keyboard focus');
  }
  try{
    if(!modal.hidden)await calcCloseModal(w);
    d.querySelector('[data-cm-tab="'+audience+'"]').click();
    d.querySelector('[data-cv-theme="'+theme+'"]').click();
    await opening('first opening');
    await calcCloseModal(w);
    await opening('warm reopening');
    await lifecycle();
  }catch(error){errors.push(error.stack||error.message);}
  finally{
    if(savedTab)d.querySelector('[data-cm-tab="'+savedTab+'"]').click();
    if(savedTheme)d.querySelector('[data-cv-theme="'+savedTheme+'"]').click();
    if(wasHidden)await calcCloseModal(w);
  }
  return {pass:!errors.length,checked:checks.length,checks:checks,errors:errors,runs:runs,audience:audience,theme:theme,viewport:[w.innerWidth,w.innerHeight],devicePixelRatio:w.devicePixelRatio};
}
