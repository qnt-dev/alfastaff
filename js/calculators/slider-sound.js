/* Quiet local feedback for deliberate ruler movement. Model updates never call
   move(); audio is unlocked only by a trusted activation, with no replay queue. */
(function () {
  'use strict';
  window.AlfaSliderSound = function (button) {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    var storageKey = 'alfa-calculator-sound-muted';
    var muted = false, unavailable = !AudioContext, context = null, buffer = null;
    var activeSource = null, lastTick = -Infinity, tickCount = 0;
    try { muted = window.localStorage.getItem(storageKey) === '1'; } catch (_) {}

    function status() {
      if (!button) return;
      button.dataset.audioState = unavailable ? 'unavailable' : context ? context.state : 'idle';
      button.dataset.tickCount = String(tickCount);
    }
    function updateButton() {
      if (!button) return;
      var enabled = !muted && !unavailable;
      button.disabled = unavailable;
      button.hidden = unavailable;
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? 'Выключить звук' : 'Включить звук');
      button.title = enabled ? 'Выключить звук' : 'Включить звук';
      button.classList.toggle('is-muted', !enabled);
      status();
    }
    function trusted(event, types) {
      return !!event && event.isTrusted === true && types.indexOf(event.type) !== -1 && !document.hidden;
    }
    function stopActive() {
      if (!activeSource) return;
      var source = activeSource;
      activeSource = null;
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    function makeBuffer() {
      // A low-pass noise transient and a low sine share a gentle 24ms envelope.
      // The waveform itself is bounded below 0.055; no gain or compression boost.
      var sampleRate = context.sampleRate, length = Math.ceil(sampleRate * .024);
      var result = context.createBuffer(1, length, sampleRate);
      var samples = result.getChannelData(0), filtered = 0;
      for (var i = 1; i < length - 1; i++) {
        var time = i / sampleRate, progress = i / (length - 1);
        filtered += .18 * ((Math.random() * 2 - 1) - filtered);
        var attack = Math.min(1, time / .0015);
        var envelope = attack * Math.exp(-time / .005) * (1 - progress);
        samples[i] = .055 * envelope * (.68 * filtered + .32 * Math.sin(2 * Math.PI * 440 * time));
      }
      return result;
    }
    function unlock(event) {
      if (muted || unavailable || !trusted(event, ['pointerdown', 'keydown', 'click'])) return;
      try {
        if (!context || context.state === 'closed') {
          context = new AudioContext();
          buffer = makeBuffer();
          lastTick = -Infinity;
          if (context.addEventListener) context.addEventListener('statechange', status);
        }
        if (context.state !== 'running') {
          var resumed = context.resume();
          // Resume may be rejected by the browser; never defer a sound to then().
          if (resumed && resumed.then) resumed.then(status, status);
        }
        status();
      } catch (_) {
        unavailable = true;
        updateButton();
      }
    }
    function move(previous, next, spacing, event) {
      if (muted || unavailable || !trusted(event, ['input', 'keydown']) ||
          !Number.isFinite(previous) || !Number.isFinite(next) || !Number.isFinite(spacing) ||
          previous < 0 || next < 0 || spacing <= 0 ||
          Math.floor(previous / spacing) === Math.floor(next / spacing) ||
          !context || context.state !== 'running') return false;
      var now = context.currentTime;
      if (now - lastTick < .08) return false;
      try {
        var source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.onended = function () {
          source.disconnect();
          if (activeSource === source) activeSource = null;
        };
        source.start(now);
        activeSource = source;
        lastTick = now;
        tickCount++;
        status();
        return true;
      } catch (_) {
        // An interrupted/closed output must never interfere with the slider.
        status();
        return false;
      }
    }
    if (button) button.addEventListener('click', function (event) {
      if (unavailable) return;
      muted = !muted;
      try { window.localStorage.setItem(storageKey, muted ? '1' : '0'); } catch (_) {}
      if (muted) stopActive();
      updateButton();
      if (!muted) unlock(event);
    });
    updateButton();
    return { unlock: unlock, move: move };
  };
})();
