'use strict';

// Exercise the production controller; only the unavailable browser audio/DOM
// boundary is replaced. No speaker, browser, timer or network is involved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const filename = path.join(__dirname, '../js/calculators/slider-sound.js');
const source = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
const trusted = type => ({ type, isTrusted: true });
let checks = 0;

function fixture(options = {}) {
  const contexts = [], started = [], storage = options.storage || new Map();
  const attributes = {}, listeners = {}, classes = new Set();
  const button = {
    hidden: false, disabled: false, dataset: {},
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; },
    addEventListener(type, handler) { listeners[type] = handler; },
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    click(event = trusted('click')) { listeners.click(event); }
  };
  class AudioContext {
    constructor() {
      if (options.throwConstructor) throw new Error('Audio unavailable');
      this.state = options.initialState || 'suspended';
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = {};
      this.resumeCalls = 0;
      contexts.push(this);
    }
    resume() {
      this.resumeCalls++;
      if (options.rejectResume) return Promise.reject(new Error('Not allowed'));
      if (!options.deferResume) this.state = 'running';
      return Promise.resolve();
    }
    createBuffer(channels, length, sampleRate) {
      assert.equal(channels, 1);
      const samples = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, getChannelData: () => samples };
    }
    createBufferSource() {
      const item = {
        connect: destination => assert.equal(destination, this.destination),
        disconnect() { this.disconnected = true; },
        start(at) { this.at = at; started.push(this); },
        stop() { this.stopped = true; if (this.onended) this.onended(); }
      };
      return item;
    }
  }
  const document = { hidden: false };
  const window = {
    document,
    localStorage: {
      getItem(key) { if (options.throwStorage) throw new Error('Storage denied'); return storage.get(key) || null; },
      setItem(key, value) { if (options.throwStorage) throw new Error('Storage denied'); storage.set(key, value); }
    }
  };
  if (!options.unsupported) window[options.webkit ? 'webkitAudioContext' : 'AudioContext'] = AudioContext;
  vm.runInNewContext(source, { window, document, Math, Number, Promise });
  assert.equal(typeof window.AlfaSliderSound, 'function', 'Sound controller must be available');
  const sound = window.AlfaSliderSound(button);
  return { sound, button, contexts, started, storage, document, classes };
}

function check(name, run) {
  run();
  checks++;
  console.log('PASS ' + name);
}

async function main() {
  check('initial preview is on without creating or playing audio', () => {
    const f = fixture();
    assert.equal(f.button.getAttribute('aria-pressed'), 'true');
    assert.match(f.button.getAttribute('aria-label'), /Выключить/);
    assert.equal(f.classes.has('is-muted'), false);
    assert.equal(f.button.dataset.audioState, 'idle');
    assert.equal(f.button.dataset.tickCount, '0');
    assert.equal(f.contexts.length, 0);
    assert.equal(f.started.length, 0);
  });
  check('synthetic events and unrelated event types cannot unlock audio', () => {
    const f = fixture();
    for (const event of [null, { type: 'pointerdown', isTrusted: false }, trusted('input'), trusted('pointermove')]) {
      f.sound.unlock(event);
    }
    assert.equal(f.contexts.length, 0);
  });
  check('moving before a gesture never creates or queues audio', () => {
    const f = fixture();
    assert.equal(f.sound.move(0, 20000, 20000, trusted('input')), false);
    assert.equal(f.contexts.length, 0);
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.started.length, 0);
  });
  check('trusted pointerdown unlocks quietly and reuses one context', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.contexts.length, 1);
    assert.equal(f.contexts[0].state, 'running');
    assert.equal(f.button.dataset.audioState, 'running');
    assert.equal(f.started.length, 0);
  });
  check('movement within the same ruler division stays silent', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.sound.move(1000, 19000, 20000, trusted('input')), false);
    assert.equal(f.started.length, 0);
  });
  check('crossing a division plays once in either direction', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.sound.move(19000, 20000, 20000, trusted('input')), true);
    f.contexts[0].currentTime = 0.1;
    assert.equal(f.sound.move(20000, 19000, 20000, trusted('input')), true);
    assert.equal(f.started.length, 2);
    assert.equal(f.button.dataset.tickCount, '2');
  });
  check('a large leap plays one tick, with no replay queue', () => {
    const f = fixture();
    f.sound.unlock(trusted('keydown'));
    assert.equal(f.sound.move(0, 600000, 20000, trusted('keydown')), true);
    f.contexts[0].currentTime = 1;
    assert.equal(f.sound.move(600000, 600000, 20000, trusted('keydown')), false);
    assert.equal(f.started.length, 1);
  });
  check('rapid crossings are dropped until the 80ms interval', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    f.sound.move(0, 1, 1, trusted('input'));
    f.contexts[0].currentTime = 0.079;
    assert.equal(f.sound.move(1, 2, 1, trusted('input')), false);
    assert.equal(f.button.dataset.tickCount, '1');
    f.contexts[0].currentTime = 0.08;
    assert.equal(f.sound.move(2, 3, 1, trusted('input')), true);
    assert.equal(f.started.length, 2);
  });
  check('programmatic, unrelated, invalid and hidden-document moves remain silent', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    for (const event of [null, { type: 'input', isTrusted: false }, trusted('click')]) {
      assert.equal(f.sound.move(0, 20000, 20000, event), false);
    }
    for (const args of [[0, NaN, 1], [0, Infinity, 1], [0, 1, 0], [0, 1, -1], [-1, 2, 1]]) {
      assert.equal(f.sound.move(...args, trusted('input')), false);
    }
    f.document.hidden = true;
    assert.equal(f.sound.move(0, 20000, 20000, trusted('input')), false);
    assert.equal(f.started.length, 0);
  });
  check('mute updates accessibility, stops current tick and survives another controller', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    f.sound.move(0, 1, 1, trusted('input'));
    f.button.click();
    assert.equal(f.button.getAttribute('aria-pressed'), 'false');
    assert.match(f.button.getAttribute('aria-label'), /Включить/);
    assert.equal(f.classes.has('is-muted'), true);
    assert.equal(f.started[0].stopped, true);
    assert.equal(f.sound.move(1, 2, 1, trusted('input')), false);
    const restored = fixture({ storage: f.storage });
    restored.sound.unlock(trusted('pointerdown'));
    assert.equal(restored.button.getAttribute('aria-pressed'), 'false');
    assert.equal(restored.contexts.length, 0);
    restored.button.click();
    assert.equal(restored.button.getAttribute('aria-pressed'), 'true');
    assert.equal(restored.contexts.length, 1);
    assert.equal(restored.started.length, 0, 'Unmute itself is silent');
  });
  check('blocked localStorage does not break sound or mute', () => {
    const f = fixture({ throwStorage: true });
    f.sound.unlock(trusted('keydown'));
    assert.equal(f.sound.move(0, 1, 1, trusted('keydown')), true);
    assert.doesNotThrow(() => f.button.click());
    assert.equal(f.button.getAttribute('aria-pressed'), 'false');
  });
  check('unsupported audio hides and disables only the sound control', () => {
    const f = fixture({ unsupported: true });
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.sound.move(0, 1, 1, trusted('input')), false);
    assert.equal(f.button.hidden, true);
    assert.equal(f.button.disabled, true);
    assert.equal(f.button.dataset.audioState, 'unavailable');
  });
  check('constructor failure is contained without breaking the slider', () => {
    const f = fixture({ throwConstructor: true });
    assert.doesNotThrow(() => f.sound.unlock(trusted('pointerdown')));
    assert.equal(f.sound.move(0, 1, 1, trusted('input')), false);
    assert.equal(f.button.disabled, true);
  });
  check('webkit context and interrupted resume are supported', () => {
    const f = fixture({ webkit: true, initialState: 'interrupted' });
    f.sound.unlock(trusted('click'));
    assert.equal(f.contexts[0].resumeCalls, 1);
    assert.equal(f.sound.move(0, 1, 1, trusted('input')), true);
  });
  check('suspended moves are dropped, never replayed after resume', () => {
    const f = fixture({ deferResume: true });
    f.sound.unlock(trusted('pointerdown'));
    assert.equal(f.sound.move(0, 1, 1, trusted('input')), false);
    f.contexts[0].state = 'running';
    assert.equal(f.started.length, 0);
    assert.equal(f.sound.move(1, 2, 1, trusted('input')), true);
  });
  check('a closed context is replaced only on a fresh trusted gesture', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    f.contexts[0].state = 'closed';
    assert.equal(f.sound.move(0, 1, 1, trusted('input')), false);
    assert.equal(f.contexts.length, 1);
    f.sound.unlock(trusted('keydown'));
    assert.equal(f.contexts.length, 2);
    assert.equal(f.sound.move(0, 1, 1, trusted('keydown')), true);
  });
  check('one tick uses a quiet finite waveform shorter than 30ms', () => {
    const f = fixture();
    f.sound.unlock(trusted('pointerdown'));
    f.sound.move(0, 1, 1, trusted('input'));
    const sample = f.started[0];
    const data = sample.buffer.getChannelData(0);
    assert.ok(sample.buffer.duration <= 0.03);
    assert.ok(sample.buffer.duration > 0.01);
    assert.ok(data.every(Number.isFinite));
    assert.ok(Math.max(...data.map(Math.abs)) < 0.08);
    assert.ok(Math.max(...data.map(Math.abs)) > 0.002);
    assert.equal(data[0], 0);
    assert.equal(data[data.length - 1], 0);
    assert.equal(sample.at, f.contexts[0].currentTime, 'No future scheduling');
    sample.onended();
    assert.equal(sample.disconnected, true);
  });
  const rejected = fixture({ rejectResume: true });
  rejected.sound.unlock(trusted('pointerdown'));
  await Promise.resolve();
  assert.equal(rejected.sound.move(0, 1, 1, trusted('input')), false);
  checks++;
  console.log('PASS rejected resume is caught without queued sound');
  console.log('Slider sound checks: ' + checks + '/' + checks + ' passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
