/* The candidate calculator and employer form share one model and theme switch. */
(function () {
  'use strict';
  var api=window.AS&&AS.CalcModal,cm=document.querySelector('[data-cm]');
  if(!api||!cm)return;
  var syncing=false,seen='',root=cm.querySelector('[data-cv]');
  var goal=document.getElementById('alfa-goal');
  if(!root||!goal||!goal.alfaGoal)return;
  function active(){return goal.alfaGoal;}
  function commit(controller){
    if(!controller)return;
    syncing=true;
    try{seen=JSON.stringify(api.set(controller.state()).job);}finally{syncing=false;}
  }
  function hydrate(){
    var controller=active();if(!controller||syncing||cm.dataset.tab==='biz')return;
    var shared=api.state().job;
    // An unselected Goal object is a local draft. Its own publication may make
    // the shared model pick a fallback; do not feed that fallback back as input.
    if(seen===JSON.stringify(shared))return;
    syncing=true;
    try{controller.setState(shared);}finally{syncing=false;}
    commit(controller);
  }
  function display(){
    var isJob=cm.dataset.tab!=='biz';
    root.hidden=!isJob;goal.hidden=!isJob;
    cm.dataset.calcView=isJob?'goal':'biz';
    if(isJob)hydrate();
  }
  cm.querySelectorAll('[data-cv-theme]').forEach(function(b){b.addEventListener('click',function(){
    cm.dataset.calcTheme=b.dataset.cvTheme;
    cm.querySelectorAll('[data-cv-theme]').forEach(function(button){button.setAttribute('aria-pressed',String(button===b));});
  });});
  root.addEventListener('alfa:change',function(e){
    if(syncing||cm.dataset.tab==='biz')return;
    if(e.target!==goal)return;
    commit(active());
  });
  cm.querySelectorAll('[data-cm-tab]').forEach(function(b){b.addEventListener('click',display);});
  document.querySelectorAll('[data-calc-open]').forEach(function(b){b.addEventListener('click',display);});
  api.subscribe(hydrate);
  display();
})();
