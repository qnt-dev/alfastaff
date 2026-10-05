/* Альфа-Стафф · сборка страницы */
(function () {
  'use strict';
  var AS = window.AS || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isMobile = function () { return window.innerWidth <= 900; };
  var remK = function () { return (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16; };
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };

  /* ---------- количество объектов — из каталога ---------- */
  (function counts() {
    var n = AS.OBJECTS.length;
    $$('[data-objects-count]').forEach(function (el) { el.textContent = n + ' ' + AS.plural(n, 'объект', 'объекта', 'объектов'); });
    $$('[data-objects-num]').forEach(function (el) { el.textContent = String(n); });
    $$('[data-region-count]').forEach(function (el) {
      var r = el.dataset.regionCount, c = AS.OBJECTS.filter(function (o) { return o.region === r; }).length;
      el.textContent = c + ' ' + AS.plural(c, 'объект', 'объекта', 'объектов');
    });
  })();

  /* ---------- общие цифры в текстах — из каталога (ставки, авансы, регионы) ---------- */
  (function stats() {
    var S = AS.STATS || {}, m = AS.money;
    var map = {
      'rate-min': m(S.rateMin), 'rate-max': m(S.rateMax), 'adv-min': m(S.advMin), 'adv-max': m(S.advMax),
      'regions': String((AS.REGIONS || []).length) + '\u00a0' + AS.plural((AS.REGIONS || []).length, 'регион', 'региона', 'регионов')
    };
    $$('[data-stat]').forEach(function (el) { if (map[el.dataset.stat] != null) el.textContent = map[el.dataset.stat]; });
    $$('[data-stat-count]').forEach(function (el) { var v = S[el.dataset.statCount]; if (v) { el.dataset.count = v; el.textContent = m(v); } });
  })();

  /* ---------- плавный скролл ---------- */
  var lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new window.Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
    (function raf(time) { lenis.raf(time); requestAnimationFrame(raf); })(performance.now());
  }
  function scrollToEl(target, offset) {
    if (!target) return;
    offset = offset || 0;
    if (lenis) lenis.scrollTo(target, { offset: offset });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reduce ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href');
    if (id.length < 2) return;
    var el = document.getElementById(id.slice(1));
    if (!el) return;
    e.preventDefault();
    navClose();
    if (a.dataset.stepLink != null) { scrollToStep(el, +a.dataset.stepLink); return; }
    scrollToEl(el);
  });
  // сплит-секция «листается» прокруткой: шаг k — это доля k/n её высоты
  function scrollToStep(sec, k) {
    var steps = $$('.step', sec), n = steps.length || 1;
    if (isMobile()) { scrollToEl(steps[k] || sec, -80); return; }
    var top = sec.getBoundingClientRect().top + window.scrollY, total = sec.offsetHeight - window.innerHeight;
    var y = top + total * (k + 0.5) / n;
    if (lenis) lenis.scrollTo(y); else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
  }

  /* ---------- плашка: меню и чат (как у Xirex) ----------
     Мышь: наведение на сетку раскрывает меню, уход с плашки — закрывает.
     Касание и клавиатура: нажатие на сетку открывает и закрывает.
     Наведение на кнопку чата — оранжевая плашка «Ответим за 30 минут», нажатие — чат. */
  var nav = $('[data-nav]'), navGrid = $('.nav__grid', nav), navChatBtn = $('.nav__chat', nav);
  var navMenu = $('#nav-menu'), navChat = $('#nav-chat'), dock = $('.dock');
  // мышь или касание — по последнему нажатию (медиазапрос hover на гибридных экранах ненадёжен)
  var lastPointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches ? 'mouse' : 'touch';
  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);
  function byMouse() { return lastPointer === 'mouse'; }
  var navState = '', navByHover = false, navHoverT = 0, navLeaveT = 0;
  function navSet(state, byHover) {
    if (navState === state) { navByHover = navByHover && byHover; return; }
    navState = state; navByHover = !!byHover;
    navMenu.hidden = state !== 'menu';
    navChat.hidden = state !== 'chat';
    nav.classList.toggle('is-open', !!state);
    nav.classList.toggle('is-menu', state === 'menu');
    nav.classList.toggle('is-chat', state === 'chat');
    navGrid.setAttribute('aria-expanded', state === 'menu' ? 'true' : 'false');
    navChatBtn.setAttribute('aria-expanded', state === 'chat' ? 'true' : 'false');
    navChatBtn.setAttribute('aria-label', state === 'chat' ? 'Закрыть чат' : 'Чат с отделом подбора — ответим за 30 минут');
    if (state === 'chat') nav.classList.remove('is-tag');
    if (state === 'menu') {
      // пункты были скрыты — ширины букв для мелькания меряем заново
      requestAnimationFrame(function () { $$('[data-glitch]', navMenu).forEach(glitchRemeasure); });
    } else $$('.nav__has-sub', nav).forEach(function (li) { li.classList.remove('is-sub'); });
    if (state === 'chat') chatOpen();
  }
  function navClose() { navSet(''); }
  navGrid.addEventListener('pointerenter', function (e) {
    if (e.pointerType !== 'mouse' || navState === 'chat') return;
    navHoverT = performance.now();
    navSet('menu', true);
  });
  navGrid.addEventListener('click', function () {
    // мышью меню уже открылось наведением — щелчок сразу после этого его не закрывает
    if (navState === 'menu' && navByHover && performance.now() - navHoverT < 600) { navByHover = false; return; }
    navSet(navState === 'menu' ? '' : 'menu');
  });
  nav.addEventListener('pointerleave', function (e) {
    if (e.pointerType !== 'mouse') return;
    nav.classList.remove('is-tag');
    if (navState === 'menu' && navByHover) navLeaveT = setTimeout(function () { if (navByHover) navClose(); }, 260);
  });
  nav.addEventListener('pointerenter', function () { clearTimeout(navLeaveT); });
  navChatBtn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && navState !== 'chat') nav.classList.add('is-tag'); });
  navChatBtn.addEventListener('pointerleave', function () { nav.classList.remove('is-tag'); });
  navChatBtn.addEventListener('click', function () { navSet(navState === 'chat' ? '' : 'chat'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navState) { var was = navState; navClose(); (was === 'chat' ? navChatBtn : navGrid).focus(); } });
  document.addEventListener('pointerdown', function (e) { if (navState && !nav.contains(e.target)) navClose(); });
  // подменю «Бизнесу»: мышью — по наведению; касанием — первое нажатие раскрывает, второе ведёт к разделу
  $$('.nav__has-sub', nav).forEach(function (li) {
    var link = li.firstElementChild;
    li.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') li.classList.add('is-sub'); });
    li.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') li.classList.remove('is-sub'); });
    // с клавиатуры подменю раскрывается фокусом; при касании фокус приходит раньше клика — его не считаем
    li.addEventListener('focusin', function (e) { if (e.target.matches(':focus-visible')) li.classList.add('is-sub'); });
    link.addEventListener('click', function (e) {
      if (!byMouse() && !li.classList.contains('is-sub')) { e.preventDefault(); e.stopPropagation(); li.classList.add('is-sub'); }
    });
  });
  // на тёмных секциях плашка светлее — иначе сливается с фоном (у Xirex на тёмном фоне — серая плашка)
  var navDark = null, navToneT = 0;
  function navTone() {
    var r = $('.nav__bar', nav).getBoundingClientRect(), els = document.elementsFromPoint(r.left + 6, r.top + r.height / 2), dark = true;
    for (var i = 0; i < els.length; i++) {
      if (nav.contains(els[i])) continue;
      for (var el = els[i]; el && el.nodeType === 1; el = el.parentElement) {
        // лист первого экрана на широких экранах залит градиентом (вырез под сферу) — цвета фона у него нет, но он белый
        if (el.classList.contains('hero__sheet')) { dark = false; break; }
        var m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > 0.5)) { dark = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2] < 128; break; }
      }
      break;
    }
    if (dark !== navDark) { navDark = dark; nav.classList.toggle('is-dark', dark); }
  }
  // текущий раздел — оранжевым, с квадратиками
  var navLinks = $$('.nav__link', nav).map(function (a) { return { a: a, sec: document.getElementById(a.getAttribute('href').slice(1)) }; });
  function navSpy() {
    var mid = window.innerHeight * 0.4, cur = null;
    navLinks.forEach(function (l) { if (!l.sec) return; var r = l.sec.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = l; });
    navLinks.forEach(function (l) { l.a.classList.toggle('is-current', l === cur); });
  }

  /* ---------- чат ----------
     Сервис для переписки ещё не выбран, поэтому «Отправить» открывает Telegram @alfastaff
     с уже вписанным текстом — человеку остаётся нажать «Отправить» в Telegram. */
  var chatLog = $('[data-chat-log]'), chatQuick = $('[data-chat-quick]'), chatForm = $('[data-chat-form]');
  var chatInput = chatForm.elements.msg, chatStarted = false, chatBusy = 0;
  function objCount(region) { return AS.OBJECTS.filter(function (o) { return !region || o.region === region; }).length; }
  function objWord(n) { return n + '\u00a0' + AS.plural(n, 'объект', 'объекта', 'объектов'); }
  function advRange() { return AS.money(AS.STATS.advMin) + '–' + AS.money(AS.STATS.advMax) + '\u00a0₽'; }
  var CHAT_TOPICS = [
    { q: 'Хочу на вахту', a: function () { return 'Подберём объект под вас: жильё бесплатно, аванс ' + advRange() + ', оформление в день обращения. Напишите город и возраст — предложим объекты.'; },
      draft: 'Здравствуйте! Хочу на вахту. Мой город: , возраст: ' },
    { q: 'Какие есть объекты?', a: function () { return 'Сейчас ' + objWord(objCount()) + ': ' + AS.REGIONS.map(function (r) { return objCount(r.key) + ' ' + r.in; }).join(', ') + '. Склады маркетплейсов и производства — все на <a href="#objects">карте объектов</a>.'; },
      draft: 'Здравствуйте! Какие объекты сейчас набирают людей?' },
    { q: 'Когда аванс?', a: function () { return 'Аванс ' + advRange() + ' — после первых 7 отработанных смен или каждую неделю, зависит от объекта. Остальное — в конце вахты. Сколько выйдет, покажет <a href="#calc">калькулятор</a>.'; },
      draft: 'Здравствуйте! Вопрос по выплатам: ' },
    { q: 'Нужен персонал', a: function () { return 'Аутстаффинг, рекрутинг, лизинг персонала и аутсорсинг для складов и производств. Отдел продаж: <a href="tel:' + AS.CONTACTS.salesTel + '">' + AS.CONTACTS.salesPhone + '</a>.'; },
      draft: 'Здравствуйте! Нужен персонал. Объект: , сколько человек: , с какой даты: ' }
  ];
  function chatScroll() { chatLog.scrollTop = chatLog.scrollHeight; }
  function chatMsg(html, who) {
    var m = document.createElement('div');
    m.className = 'msg msg--' + who;
    if (who === 'me') m.textContent = html; else m.innerHTML = html;
    chatLog.appendChild(m); chatScroll();
    return m;
  }
  // бот «печатает» и отвечает; ответы идут по очереди
  function chatBot(lines, then) {
    chatBusy++;
    var i = 0;
    (function next() {
      if (i >= lines.length) { chatBusy--; if (then) then(); return; }
      var t = chatMsg('<i></i><i></i><i></i>', 'bot'); t.classList.add('msg--typing');
      setTimeout(function () { t.remove(); chatMsg(lines[i++], 'bot'); setTimeout(next, 260); }, reduce ? 0 : 520 + Math.min(900, lines[i].length * 6));
    })();
  }
  function chatChips(list) {
    chatQuick.innerHTML = '';
    list.forEach(function (tp, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = tp.q; b.style.animationDelay = (i * 0.05) + 's';
      b.addEventListener('click', function () { chatAsk(tp); });
      chatQuick.appendChild(b);
    });
  }
  function chatAsk(tp) {
    if (chatBusy) return;
    chatMsg(tp.q, 'me');
    chatChips(CHAT_TOPICS.filter(function (x) { return x !== tp; }).slice(0, 2));
    chatQuick.hidden = true;
    chatBot([tp.a()], function () {
      chatQuick.hidden = false;
      // готовый черновик в поле — останется дописать и отправить
      if (!chatInput.value.trim()) { chatInput.value = tp.draft; chatFit(); }
      if (byMouse()) { chatInput.focus(); chatInput.setSelectionRange(chatInput.value.length, chatInput.value.length); }
    });
  }
  function chatOpen() {
    if (!chatStarted) {
      chatStarted = true;
      chatChips(CHAT_TOPICS);
      chatQuick.hidden = true;
      chatBot(['Здравствуйте! Это отдел подбора Альфа-Стафф.', 'Подскажем по вахте, объектам и выплатам. Выберите вопрос или напишите свой — ответим в течение 30 минут.'], function () { chatQuick.hidden = false; });
    }
    if (byMouse()) setTimeout(function () { chatInput.focus({ preventScroll: true }); }, 350);
  }
  function chatFit() { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; }
  chatInput.addEventListener('input', function () { chatFit(); chatForm.classList.remove('is-empty'); });
  chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit ? chatForm.requestSubmit() : chatForm.dispatchEvent(new Event('submit', { cancelable: true })); } });
  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = chatInput.value.trim();
    if (!text) { chatForm.classList.remove('is-empty'); void chatForm.offsetWidth; chatForm.classList.add('is-empty'); chatInput.focus(); return; }
    // окно открываем сразу, в обработчике нажатия, — иначе браузер его заблокирует
    var url = AS.CONTACTS.telegram + '?text=' + encodeURIComponent(text);
    var win = window.open(url, '_blank');
    if (win) try { win.opener = null; } catch (err) {}
    chatMsg(text, 'me');
    chatInput.value = ''; chatFit();
    chatBot([win === null
      ? 'Браузер не дал открыть Telegram. <a href="' + url + '" target="_blank" rel="noopener">Откройте по ссылке</a> — текст уже вписан.'
      : 'Открыли Telegram @alfastaff — сообщение уже вписано, останется нажать «Отправить». Ответим в течение 30 минут.']);
  });

  var lastY = window.scrollY;
  function onScroll() {
    var y = window.scrollY;
    // на телефоне док не мешает читать: прячется при прокрутке вниз, возвращается при прокрутке вверх
    if (isMobile() && Math.abs(y - lastY) > 6) {
      dock.classList.toggle('is-tucked', y > lastY);
      // плашка на телефоне не закрывает текст: при прокрутке вниз уходит, вверх — возвращается
      nav.classList.toggle('is-tucked', y > lastY && y > 120 && !navState);
      lastY = y;
    }
    if (!isMobile() || y < 120) nav.classList.remove('is-tucked');
    navSpy(); navTone();
    clearTimeout(navToneT); navToneT = setTimeout(navTone, 180);
    var footerTop = $('.footer').getBoundingClientRect().top;
    var cr = $('#contact').getBoundingClientRect(), vh = window.innerHeight;
    var contactInView = cr.top < vh * 0.7 && cr.bottom > vh * 0.3;
    var on = y > vh * 0.85 && footerTop > vh * 0.6 && !contactInView;
    dock.classList.toggle('is-on', on);
    dock.setAttribute('aria-hidden', on ? 'false' : 'true');
    $$('a', dock).forEach(function (a) { a.tabIndex = on ? 0 : -1; });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- мелькающие буквы при наведении (как у референса) ----------
     Тайминги из кода референса: пункты меню и ссылки — 400 мс, кнопки — 800 мс.
     Каждые 40 мс ~20% букв подменяются случайными
     символами разного регистра и подсвечиваются оранжевым, потом слово возвращается.
     Ширина каждой буквы зафиксирована — слово не «дрожит» даже в пропорциональном шрифте. */
  // подмена того же вида: строчная → строчная, заглавная → заглавная, кириллица → кириллица, цифра → цифра
  var GLITCH_SETS = [
    [/[а-яё]/, 'абвгдежзиклмнопрстуфхцчшэюя'], [/[А-ЯЁ]/, 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ'],
    [/[a-z]/, 'abcdefghijklmnopqrstuvwxyz'], [/[A-Z]/, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], [/[0-9]/, '0123456789']
  ];
  function glitchChar(ch) {
    for (var i = 0; i < GLITCH_SETS.length; i++) {
      if (GLITCH_SETS[i][0].test(ch)) { var set = GLITCH_SETS[i][1], c; do { c = set[Math.floor(Math.random() * set.length)]; } while (c === ch && set.length > 1); return c; }
    }
    return null; // знаки и пробелы не трогаем
  }
  function glitchPrepare(el) {
    if (el._chars) return el._chars;
    var text = el.dataset.text || el.textContent;
    el.dataset.text = text;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    el._chars = Array.from(text).map(function (ch) {
      var s = document.createElement('span');
      s.className = 'glitch-ch'; s.textContent = ch; s.setAttribute('aria-hidden', 'true'); s._ch = ch;
      el.appendChild(s);
      return s;
    });
    if (el.offsetWidth) el._chars.forEach(function (s) { s.style.width = s.getBoundingClientRect().width + 'px'; });
    return el._chars;
  }
  function glitchStop(el) {
    clearInterval(el._gInt); clearTimeout(el._gEnd); el._gInt = 0;
    (el._chars || []).forEach(function (s) { s.textContent = s._ch; s.classList.remove('is-scr'); });
  }
  function glitchStart(el) {
    if (reduce || el._gInt) return;
    var chars = glitchPrepare(el);
    el._gInt = setInterval(function () {
      chars.forEach(function (s) {
        var sub = Math.random() <= 0.2 ? glitchChar(s._ch) : null;
        if (!sub) { s.textContent = s._ch; s.classList.remove('is-scr'); }
        else { s.textContent = sub; s.classList.add('is-scr'); }
      });
    }, 40);
    var dur = el.closest('.btn, .dock__cta, .trust__pill') ? 800 : 400;
    el._gEnd = setTimeout(function () { glitchStop(el); }, dur);
  }
  // слова разбиваются на буквы заранее (после загрузки шрифтов) — при наведении ничего не сдвигается
  function glitchRemeasure(el) {
    var chars = glitchPrepare(el);
    chars.forEach(function (s) { s.style.width = ''; });
    // у скрытого элемента ширины нулевые — оставляем буквы как есть, перемерим при показе
    if (!el.offsetWidth) return;
    chars.forEach(function (s) { s.style.width = s.getBoundingClientRect().width + 'px'; });
  }
  function glitchMeasure() { $$('.scramble, [data-glitch]').forEach(glitchRemeasure); }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(glitchMeasure);
  var glitchResizeT = 0;
  window.addEventListener('resize', function () { clearTimeout(glitchResizeT); glitchResizeT = setTimeout(glitchMeasure, 200); });
  $$('.scramble, [data-glitch]').forEach(function (el) {
    var host = el.matches('a, button') ? el : (el.closest('a, button') || el);
    host.addEventListener('mouseenter', function () { glitchStart(el); });
    host.addEventListener('focus', function () { glitchStart(el); });
    host.addEventListener('mouseleave', function () { glitchStop(el); });
    host.addEventListener('blur', function () { glitchStop(el); });
  });

  /* ---------- печать строк «Итог:» ---------- */
  function typeLine(el) {
    var text = el.dataset.type || '';
    if (el._typed === text) return;
    el._typed = text;
    if (reduce) { el.textContent = text; return; }
    clearTimeout(el._t);
    var i = 0;
    (function tick() {
      el.textContent = text.slice(0, i);
      i++;
      if (i <= text.length) el._t = setTimeout(tick, 18 + Math.random() * 26);
    })();
  }

  /* ---------- появление ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('is-in');
      if (el._autoType) typeLine(el);
      if (el._onIn) el._onIn();
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.05 });
  $$('.output__text').forEach(function (el) { if (!el.closest('.step')) el._autoType = true; });
  $$('.reveal, .sec-title--echo, .b-card, .p-card, .output__text, [data-timeline], .bento').forEach(function (el) { io.observe(el); });

  // заголовки с «эхом» — два контура под основным текстом
  $$('.sec-title--echo').forEach(function (h) {
    var html = h.innerHTML;
    h.innerHTML = '<span class="sec-title__main">' + html + '</span><span class="echo" aria-hidden="true">' + html + '</span><span class="echo" aria-hidden="true">' + html + '</span>';
  });

  /* ---------- слова манифеста загораются по мере прокрутки ---------- */
  var wordBlocks = $$('[data-words]').map(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    return { el: el, words: $$('.w', el) };
  });
  function updateWords() {
    var vh = window.innerHeight;
    wordBlocks.forEach(function (b) {
      var r = b.el.getBoundingClientRect();
      var p = (vh * 0.86 - r.top) / (r.height + vh * 0.36);
      p = Math.max(0, Math.min(1, p));
      var lit = Math.round(p * b.words.length);
      for (var i = 0; i < b.words.length; i++) b.words[i].classList.toggle('is-lit', i < lit);
    });
  }

  /* ---------- первый экран ---------- */
  var hero = $('.hero');
  // буквы оборачиваются в слова без переносов внутри слова
  function splitChars(el, startDelay) {
    var text = el.textContent, d = startDelay || 0, k = 0;
    el.innerHTML = '';
    text.split(' ').forEach(function (word, wi, arr) {
      var w = document.createElement('span');
      w.className = 'word';
      w.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (ch) {
        var s = document.createElement('span');
        s.className = 'char';
        s.textContent = ch;
        s.style.transitionDelay = (d + k++ * 0.022).toFixed(3) + 's';
        w.appendChild(s);
      });
      el.appendChild(w);
      if (wi < arr.length - 1) { el.appendChild(document.createTextNode(' ')); k++; }
    });
  }
  var line1 = $('.hero__title .hero__line-text'), line2 = $('.hero__sub .hero__line-text');
  splitChars(line1, 0.1);
  splitChars(line2, 0.42);
  // заголовок подгоняется под ширину листа: обе строки целиком
  function fitTitle() {
    var title = $('.hero__title'), box = $('.hero__content');
    if (!title || !box) return;
    title.style.fontSize = '';
    var cs = getComputedStyle(box), avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var size = parseFloat(getComputedStyle(title).fontSize), guard = 0;
    box.style.setProperty('--title-fs', size + 'px');
    var widest = function () { return Math.max(line1.scrollWidth, line2.scrollWidth); };
    while (widest() > avail && size > 30 && guard++ < 60) { size -= 1; title.style.fontSize = size + 'px'; box.style.setProperty('--title-fs', size + 'px'); }
  }
  // линия под «АЛЬФА-СТАФФ» — CSS, симметрично; здесь только подгонка кегля
  function heroRule() { fitTitle(); }
  if (AS.TextFill) $$('.hero__fill').forEach(function (c) { AS.TextFill(c); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
    heroRule();
    requestAnimationFrame(function () { hero.classList.add('is-ready'); });
    $$('.hero .reveal').forEach(function (el, i) { setTimeout(function () { el.classList.add('is-in'); }, 500 + i * 120); });
  });
  window.addEventListener('resize', heroRule);

  // сферы
  var heroSphereApi = null, heroClip = null;
  var heroIndex = $('[data-hero-index]'), heroIndexList = $('[data-hero-index-list]'), heroIndexResume = 0;
  function markHeroIndex(i) {
    if (!heroIndexList) return;
    $$('li', heroIndexList).forEach(function (li, k) { li.classList.toggle('is-on', k === i); });
  }
  if (heroIndexList) {
    heroIndexList.innerHTML = AS.OBJECTS.map(function (o, i) {
      return '<li><button type="button"><span>' + String(i + 1).padStart(2, '0') + '</span>' + o.short + '<em>' + o.tag + '</em></button></li>';
    }).join('');
    // клик по строке поворачивает сферу к складу, потом автопоказ продолжается
    $$('button', heroIndexList).forEach(function (b, i) {
      b.addEventListener('click', function () {
        if (!heroSphereApi) return;
        heroSphereApi.focus(i);
        markHeroIndex(i);
        clearTimeout(heroIndexResume);
        heroIndexResume = setTimeout(function () { heroSphereApi.queueAutoplay(0); }, 7000);
      });
    });
  }
  if (AS.Sphere) {
    var heroSphere = $('[data-sphere="hero"]');
    if (heroSphere) heroSphereApi = new AS.Sphere(heroSphere, {
      mode: 'hero', objects: AS.OBJECTS, seed: 31, clip: $('#hero-stage'),
      // область для карточек: над сферой и левее списка (считается в heroLayout)
      clipRect: function () {
        var G = $('#hero-stage').getBoundingClientRect();
        if (!heroClip) return G;
        return { left: G.left + heroClip.x0, right: G.left + heroClip.x1, top: G.top, bottom: G.bottom };
      },
      onShow: markHeroIndex,
      // карточка на сфере ведёт к этому же складу на карте объектов
      onCardClick: function (i) {
        var grid = $('.objects__grid'), gh = grid.getBoundingClientRect().height;
        scrollToEl(grid, -Math.max(20, (window.innerHeight - gh) / 2));
        setTimeout(function () { if (mapApi) mapApi.select(i, true); }, 500);
      },
    });
  }

  /* ---------- первый экран: сфера в круглом вырезе листа ----------
     Широкий экран: пропорции листа как в макете, справа от сферы — список объектов.
     Ноутбук: список прячется, лист расширяется ровно настолько, чтобы вырез не задевал текст.
     Узкий экран и телефон: сфера в своей колонке без выреза. */
  function placeSocial() {
    var soc = $('.hero__social'), sheet = $('.hero__sheet');
    if (!soc || !sheet) return;
    soc.style.setProperty('--social-top', Math.round((sheet.clientHeight - soc.offsetHeight) / 2) + 'px');
    soc.style.setProperty('--social-shift', '0px');
  }
  function heroLayout() {
    var sheet = $('.hero__sheet'), stage = $('#hero-stage'), sph = $('[data-sphere="hero"]');
    if (!sph || !sheet) return;
    placeSocial();
    var content = $('.hero__content');
    function reset() {
      hero.classList.remove('is-cut', 'has-index');
      if (content) content.style.paddingLeft = content.style.paddingRight = '';
      hero.style.gridTemplateColumns = ''; sheet.style.background = '';
      sph.style.width = sph.style.left = sph.style.top = '';
      if (heroIndex) { heroIndex.hidden = true; heroIndex.style.left = heroIndex.style.right = heroIndex.style.top = ''; }
      heroClip = null;
    }
    function done() { if (heroSphereApi) heroSphereApi.updateClip(); }
    reset();
    if (isMobile()) { done(); return; }

    var k = remK();                                   // масштаб сайта: 1 до 1600×1000
    var GAP = parseFloat(getComputedStyle(hero).columnGap) || 10 * k;
    var AIR = 60 * k;                                 // воздух между текстом и вырезом
    // правый край текста — с запасом: подзаголовок и бегущая строка растут до max-width, когда лист шире
    var textRight = Math.max.apply(null, $$('.hero__line-text, .hero__rule, .hero__lead, .hero__actions > *, .trust, .ticker').map(function (e) {
      if (e.classList.contains('hero__rule')) { var t = $('.hero__title .hero__line').getBoundingClientRect(); return t.right + (e.offsetWidth - t.width) / 2; }
      var r = e.getBoundingClientRect(), mw = parseFloat(getComputedStyle(e).maxWidth);
      return isNaN(mw) ? r.right : Math.max(r.right, r.left + mw);
    }));
    var H = hero.getBoundingClientRect(), S = sheet.getBoundingClientRect(), right = H.right - GAP;
    // текстовый блок: от левого края линии под заголовком до правого края самого широкого элемента
    var textLeft = S.left + parseFloat(getComputedStyle(content).paddingLeft);
    var tl = $('.hero__title .hero__line').getBoundingClientRect(), ruleEl = $('.hero__rule');
    var blockLeft = Math.min(textLeft, tl.left - (ruleEl.offsetWidth - tl.width) / 2);
    var blockW = textRight - blockLeft, G0 = (window.innerWidth < 1400 ? 64 : 96) * k; // G0 — минимальный воздух слева и справа от блока
    var needLeft = S.left + blockW + 2 * G0;               // левый край выреза не ближе этой линии
    var mode = null, R, K, cx, sheetRight, listW = 0, listLeft = 0;

    // 1) со списком: сфера в вырезе, список по центру между сферой и правым краем
    if (heroIndex) { heroIndex.hidden = false; heroIndex.style.visibility = 'hidden'; listW = heroIndex.offsetWidth; heroIndex.hidden = true; heroIndex.style.visibility = ''; }
    if (listW) {
      K = 0.32;
      var padMin = 44 * k, padTarget = listW * 0.22;   // поля списка: минимум и комфорт
      var Rmax = S.height * 0.3, Rmin = 220 * k;
      // самая крупная сфера, при которой помещаются вырез, сфера и список с минимальными полями
      R = Math.min(Rmax, (right - needLeft - GAP - listW - 2 * padMin) / 2);
      if (R >= Rmin) {
        var sMin = needLeft + (1 - K) * R + GAP;                    // вырез не задевает текст
        var sTarget = right - (1 + K) * R - (listW + 2 * padTarget); // список с комфортными полями
        sheetRight = Math.max(sMin, sTarget);
        cx = sheetRight + K * R;
        var D = right - (cx + R);                                   // тёмное поле справа от сферы
        listLeft = cx + R + (D - listW) / 2;
        mode = 'list';
      }
    }

    // 2) без списка: лист расширяется, справа остаётся узкая полоса
    if (!mode) {
      K = 0.45; R = S.height * 0.3;
      for (;;) {
        sheetRight = Math.max(needLeft + (1 - K) * R + GAP, right - 220 * k - (1 + K) * R);
        if (right - (sheetRight + (1 + K) * R) >= 110 * k) { mode = 'wide'; break; }
        if (R < 190 * k) break;
        R -= 5 * k;
      }
      if (mode) cx = sheetRight + K * R;
    }
    if (!mode) { done(); return; }                      // слишком узко — сфера в своей колонке

    hero.style.gridTemplateColumns = Math.round(sheetRight - H.left - GAP) + 'px minmax(0, 1fr)';
    S = sheet.getBoundingClientRect();
    cx = S.right + K * R;
    if (mode === 'list') listLeft = cx + R + (right - (cx + R) - listW) / 2;
    hero.classList.add('is-cut');
    var cy = S.top + S.height * 0.54, G = stage.getBoundingClientRect();
    sheet.style.background = 'radial-gradient(circle at ' + (cx - S.left).toFixed(1) + 'px ' + (cy - S.top).toFixed(1) + 'px, transparent ' + (R + GAP).toFixed(1) + 'px, #fff ' + (R + GAP + 1.4).toFixed(1) + 'px)';
    sph.style.width = (2 * R).toFixed(1) + 'px';
    sph.style.left = (cx - R - G.left).toFixed(1) + 'px';
    sph.style.top = (cy - R - G.top).toFixed(1) + 'px';
    if (heroIndex) {
      heroIndex.hidden = mode !== 'list';
      if (mode === 'list') {
        heroIndex.style.left = Math.round(listLeft - G.left) + 'px'; heroIndex.style.right = 'auto';
        // середина списка (вместе с заголовком) — ровно на уровне центра сферы
        heroIndex.style.top = Math.round(cy - G.top - heroIndex.offsetHeight / 2) + 'px';
      }
    }
    heroClip = { x0: cx - R - G.left, x1: mode === 'list' ? listLeft - G.left - 18 * k : G.width };
    hero.classList.toggle('has-index', mode === 'list');
    // 6 · текстовый блок — по центру между левым краем листа и вырезом под сферой
    var cutLeft = cx - R - GAP, newBlockLeft = S.left + (cutLeft - S.left - blockW) / 2;
    content.style.paddingLeft = Math.round(newBlockLeft + (textLeft - blockLeft) - S.left) + 'px';
    content.style.paddingRight = '1rem';
    done();
  }
  heroLayout();
  window.addEventListener('resize', heroLayout);
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { requestAnimationFrame(heroLayout); });

  /* ---------- образцы документов: ознакомительный лист и акт ----------
     Объекты сменяются сами (раз в 7 с, пока блок на экране и курсор не над ним), оба листа синхронно.
     Стрелки — вручную. На телефоне листы по одному, вкладки «Условия / Выплата». */
  (function docs() {
    var root = $('[data-docs]');
    if (!root || !AS.DOCS) return;
    var D = AS.DOCS, ids = D.order.filter(function (id) { return AS.OBJECTS.some(function (o) { return o.id === id; }); });
    var pair = $('[data-docs-pair]', root), q = function (k) { return $('[data-doc="' + k + '"]', root); };
    var cur = 0, timer = 0, startT = 0, DUR = 7000, inView = false, hover = false;
    function money(n, frac) {
      var v = Math.abs(n), i = Math.floor(v + 1e-9), f = Math.round((v - i) * 100);
      if (f === 100) { i++; f = 0; }
      return fmt(i).replace(/ /g, ' ') + (frac === false ? '' : ',' + String(f).padStart(2, '0'));
    }
    function obj(id) { return AS.OBJECTS.filter(function (o) { return o.id === id; })[0]; }
    function days(n) { return n + ' ' + AS.plural(n, 'день', 'дня', 'дней'); }
    // строки листа: у Тарного и Владимира — свои, у остальных — из каталога
    function rows(o) {
      if (D.sheets[o.id]) return D.sheets[o.id];
      var lc = function (t) { return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''; };
      var pay = o.pay.split(/\.\s+(?=Перв|За )/)[0].replace(/\.$/, '');
      return [
        ['Обучение', lc(o.training)],
        ['Оплата', lc(pay)],
        ['Авансы', o.advanceText],
        ['Смены', lc(o.shiftFull)],
        ['Питание', o.mealsFull],
        ['Проживание', 'хостел — ' + o.hostel + (o.housing ? '; ' + o.housing : '')],
        ['Оформление', 'самозанятость, в день обращения']
      ].filter(function (r) { return r[1]; });
    }
    function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function render(i) {
      var id = ids[i], o = obj(id), act = D.acts[id];
      q('object').textContent = o.name;
      q('rows').innerHTML = rows(o).map(function (r) { return '<div data-print><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
      q('date').textContent = (D.dates && D.dates[id]) || (act ? act.from : '');
      q('none').hidden = !!act;
      q('act').hidden = !act;
      if (act) {
        var total = act.lines.reduce(function (sum, l) { return sum + l[3]; }, 0);
        q('actno').textContent = act.no; q('actdate').textContent = act.date;
        q('actobj').textContent = o.name;
        q('period').textContent = act.from + ' – ' + act.to + ' · ' + days(act.days);
        q('lines').innerHTML = act.lines.map(function (l) {
          var qty = l[1] ? fmt(l[1]) + ' × ' + String(l[2]).replace('.', ',') : '—';
          return '<tr data-print><td>' + esc(l[0]) + '</td><td>' + qty + '</td><td>' + money(l[3]) + '</td></tr>';
        }).join('');
        q('total').textContent = money(total);
        var n = Math.round(act.adv / 3249);
        q('advn').textContent = n * 3249 === act.adv ? '· ' + n + ' × 3 249 ₽' : '';
        q('adv').textContent = '− ' + money(act.adv);
        q('pay').textContent = money(total - act.adv) + ' ₽';
      }
      q('idx').textContent = String(i + 1).padStart(2, '0');
      q('count').textContent = String(ids.length).padStart(2, '0');
      q('name').textContent = o.name;
    }
    // высота пары — по самому длинному объекту, чтобы при смене ничего не прыгало
    function fitHeight() {
      pair.style.minHeight = '';
      $$('.doc', pair).forEach(function (d) { d.style.minHeight = ''; });
      var max = 0;
      pair.classList.add('is-measure'); // на телефоне показан один лист — на время замера показываем оба
      ids.forEach(function (id, i) { render(i); $$('.doc', pair).forEach(function (d) { max = Math.max(max, d.offsetHeight); }); });
      pair.classList.remove('is-measure');
      $$('.doc', pair).forEach(function (d) { d.style.minHeight = max + 'px'; });
      render(cur);
    }
    function show(i) {
      cur = (i + ids.length) % ids.length;
      pair.classList.add('is-swap');
      setTimeout(function () {
        render(cur);
        pair.classList.remove('is-swap');
        if (!reduce) $$('[data-print]', pair).forEach(function (el, k) {
          el.classList.remove('is-print'); void el.offsetWidth;
          el.style.animationDelay = (k * 0.035).toFixed(3) + 's'; el.classList.add('is-print');
        });
      }, 180);
      startT = performance.now();
    }
    $('[data-doc-prev]', root).addEventListener('click', function () { show(cur - 1); });
    $('[data-doc-next]', root).addEventListener('click', function () { show(cur + 1); });
    root.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
    root.addEventListener('pointerleave', function () { hover = false; });
    // вкладки на телефоне
    var tabs = $$('[data-doc-tab]', root);
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
        $$('[data-doc-pane]', root).forEach(function (pn) { pn.classList.toggle('is-on', pn.dataset.docPane === t.dataset.docTab); });
      });
    });
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) root.classList.add('is-in'); }, { threshold: 0.25 }).observe(root);
    var prog = q('progress'), paused = 0;
    (function tick(now) {
      requestAnimationFrame(tick);
      if (!inView || hover || document.hidden || reduce) { if (!paused) paused = now; return; }
      if (paused) { startT += now - paused; paused = 0; }
      var p = (now - startT) / DUR;
      prog.style.transform = 'scaleX(' + Math.min(1, p).toFixed(3) + ')';
      if (p >= 1) show(cur + 1);
    })(performance.now());
    startT = performance.now();
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fitHeight);
    var fitT = 0;
    window.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fitHeight, 200); });
    render(0);
  })();

  /* ---------- сплит-секции ---------- */
  var MORPHS = { services: ['outstaff', 'recruit', 'lease', 'outsource'], process: ['pick', 'trip', 'stay', 'pay'], faq: ['question'], principles: ['mark'] };
  var splits = $$('[data-split]').map(function (sec) {
    var key = sec.dataset.split, canvas = $('canvas.morph', sec);
    // сцена — между меткой секции и заголовком панели
    var media = canvas && canvas.closest('.split__media'), kick = media && $('.kicker', media), ttl = media && $('.split__title', media);
    var region = function () {
      if (!kick || !ttl) return null;
      var cr = canvas.getBoundingClientRect(), k = kick.getBoundingClientRect(), tt = ttl.getBoundingClientRect(), kk = remK();
      return [k.bottom - cr.top + 22 * kk, tt.top - cr.top - 34 * kk];
    };
    var m = canvas && AS.Morph ? new AS.Morph(canvas, MORPHS[key] || ['pick'], { count: isMobile() ? 760 : 1400, region: region }) : null;
    if (m && document.fonts) document.fonts.ready.then(function () { m.refit(); });
    return { sec: sec, key: key, steps: $$('.step', sec), pager: $$('.split__pager i', sec), count: $('[data-split-current]', sec), morph: m, cur: -1, n: parseInt(getComputedStyle(sec).getPropertyValue('--steps'), 10) || 1 };
  });
  function setStep(s, k) {
    if (s.cur === k) return;
    s.cur = k;
    s.steps.forEach(function (st, i) {
      st.classList.toggle('is-active', i === k);
      st.classList.toggle('is-past', i < k);
      st.setAttribute('aria-hidden', i === k ? 'false' : 'true');
      if (i === k) { var o = $('.output__text', st); if (o) setTimeout(function () { typeLine(o); }, 380); }
    });
    s.pager.forEach(function (p, i) { p.classList.toggle('is-on', i === k); });
    if (s.count) {
      s.count.style.transform = 'translateY(-6px)'; s.count.style.opacity = '0';
      setTimeout(function () { s.count.textContent = String(k + 1); s.count.style.transform = ''; s.count.style.opacity = ''; }, 180);
    }
    if (s.morph) s.morph.set(k);
  }
  function updateSplits() {
    var vh = window.innerHeight, mobile = isMobile();
    splits.forEach(function (s) {
      if (s.n <= 1 || mobile) {
        if (s.cur === -1) { s.steps.forEach(function (st) { st.classList.add('is-active'); var o = $('.output__text', st); if (o) { o._autoType = true; io.observe(o); } }); s.cur = 0; s.pager.forEach(function (p, i) { p.classList.toggle('is-on', i === 0); }); }
        if (mobile && s.morph && s.n > 1) {
          // на телефоне фигура меняется по шагу, который ближе к центру экрана
          var best = 0, bd = 1e9;
          s.steps.forEach(function (st, i) { var r = st.getBoundingClientRect(); var d = Math.abs(r.top + r.height / 2 - vh / 2); if (d < bd) { bd = d; best = i; } });
          s.morph.set(best);
        }
        return;
      }
      var r = s.sec.getBoundingClientRect();
      var total = r.height - vh;
      var p = total > 0 ? Math.max(0, Math.min(0.9999, -r.top / total)) : 0;
      setStep(s, Math.floor(p * s.n));
    });
  }

  /* ---------- карта объектов ---------- */
  var mapApi = (function objects() {
    var list = $('[data-obj-list]'), detail = $('[data-obj-detail]'), prog = $('[data-obj-progress]');
    if (!list) return null;
    var O = AS.OBJECTS, current = -1, timer = 0, startT = 0, DUR = 8000, paused = false, inView = false, sphere = null;
    // вкладки регионов: список и автопоказ — внутри выбранного региона, сфера показывает все объекты
    var tabsEl = $('[data-obj-regions]'), region = '';
    function inRegion(i) { return !region || O[i].region === region; }
    if (tabsEl) {
      var tabs = [{ key: '', label: 'Все', n: O.length }].concat(AS.REGIONS.map(function (r) { return { key: r.key, label: r.label, n: O.filter(function (o) { return o.region === r.key; }).length }; }));
      tabsEl.innerHTML = tabs.map(function (t) { return '<button type="button" role="tab" data-r="' + t.key + '" aria-selected="' + (t.key === '' ? 'true' : 'false') + '">' + t.label + '<sup>' + t.n + '</sup></button>'; }).join('');
      $$('button', tabsEl).forEach(function (b) {
        b.addEventListener('click', function () { setRegion(b.dataset.r); current = -1; select(firstInRegion(), true); });
      });
    }
    function firstInRegion() { return O.findIndex(function (o, k) { return inRegion(k); }); }
    function setRegion(key) {
      region = key;
      if (tabsEl) $$('button', tabsEl).forEach(function (x) { x.setAttribute('aria-selected', x.dataset.r === key ? 'true' : 'false'); });
      $$('li', list).forEach(function (li, k) { li.hidden = !inRegion(k); });
      fitList();
    }
    // список без прокрутки: если объектов больше, чем помещается по высоте сферы, шрифт и отступы уменьшаются
    function fitList() {
      if (isMobile()) { list.style.removeProperty('--fit'); return; }
      list.style.setProperty('--fit', 1);
      var cs = getComputedStyle(list), avail = list.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      for (var pass = 0; pass < 2; pass++) {
        var need = 0;
        $$('li', list).forEach(function (li) { if (!li.hidden) need += li.offsetHeight; });
        var f = parseFloat(list.style.getPropertyValue('--fit')) || 1;
        if (need > avail && need > 0) list.style.setProperty('--fit', Math.max(0.55, f * avail / need).toFixed(3));
      }
    }
    O.forEach(function (o, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.innerHTML = '<button type="button">' + o.short + '<sup>' + o.tag + '</sup></button>';
      li.firstChild.addEventListener('click', function () { select(i, true); });
      li.firstChild.addEventListener('mouseenter', function () { paused = true; });
      li.firstChild.addEventListener('mouseleave', function () { paused = false; startT = performance.now(); });
      list.appendChild(li);
    });
    var items = $$('li', list);
    window.addEventListener('resize', function () { fitList(); });
    if (document.fonts) document.fonts.ready.then(fitList);
    // по умолчанию — первый регион (Москва и МО): весь список из 20+ объектов не помещается рядом со сферой
    if (tabsEl && AS.REGIONS.length > 1) setRegion(AS.REGIONS[0].key);
    var mapEl = $('[data-sphere="map"]');
    if (mapEl && AS.Sphere) {
      sphere = new AS.Sphere(mapEl, {
        mode: 'map', objects: O, seed: 77, clip: $('.objects__stage'),
        focusX: isMobile() ? 0 : 0.16, focusY: isMobile() ? 0.42 : 0.36,
        onUserDrag: function () { paused = true; },
        onUserRelease: function () { paused = false; startT = performance.now() - DUR * 0.4; setTimeout(function () { if (current >= 0) sphere.focus(current); }, 2600); },
      });
    }
    function fill(o, i) {
      // плавно: текст гаснет, меняется уже невидимым и проявляется; высота карточки не меняется (см. fixDetailHeight)
      clearTimeout(detail._swapT);
      detail.classList.add('is-swapping');
      detail._swapT = setTimeout(function () { fillNow(o, i); requestAnimationFrame(function () { detail.classList.remove('is-swapping'); }); }, 200);
    }
    function fillNow(o, i) {
      {
        var vis = O.map(function (_, k) { return k; }).filter(inRegion), pos = vis.indexOf(i);
        $('[data-d="index"]', detail).textContent = String(pos + 1).padStart(2, '0') + ' / ' + String(vis.length).padStart(2, '0');
        $('[data-d="tag"]', detail).textContent = o.region === 'Москва и МО' ? o.tag : o.region + ' · ' + o.tag;
        $('[data-d="name"]', detail).textContent = o.name;
        $('[data-d="address"]', detail).textContent = o.address;
        $('[data-d="hostel"]', detail).textContent = o.hostel + (o.housing ? ' — ' + o.housing : '') + (o.transport ? '; ' + o.transport : '') + '.';
        $('[data-d="jobs"]', detail).textContent = o.jobsFull.join(', ') + (o.who ? ' · ' + o.who : '');
        $('[data-d="pay"]', detail).textContent = o.pay + (o.advanceText ? ' Аванс — ' + o.advanceText + '.' : '');
        $('[data-d="meals"]', detail).textContent = o.mealsFull ? o.mealsFull.charAt(0).toUpperCase() + o.mealsFull.slice(1) : '';
        var noteEl = $('[data-d="note"]', detail); noteEl.textContent = o.note || ''; noteEl.parentNode.hidden = !o.note;
        $('[data-d="shift"]', detail).textContent = o.shiftFull + (o.vakhta && o.vakhta.length ? '. Вахта ' + o.vakhta.join(' / ') + ' смен' : '');
      }
    }
    // карточка всегда высотой с самый длинный объект — секция не прыгает, сфера не перестраивается при смене объекта
    function fixDetailHeight() {
      if (!detail) return;
      detail.style.minHeight = '';
      var max = 0;
      O.forEach(function (o, k) { fillNow(o, k); max = Math.max(max, detail.offsetHeight); });
      if (current >= 0) fillNow(O[current], current);
      detail.style.minHeight = max + 'px';
    }
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(fixDetailHeight);
    var fixT = 0;
    window.addEventListener('resize', function () { clearTimeout(fixT); fixT = setTimeout(fixDetailHeight, 200); });
    function select(i, user) {
      if (i === current) return;
      current = i;
      items.forEach(function (li, k) { li.classList.toggle('is-active', k === i); li.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
      fill(O[i], i);
      if (sphere) sphere.focus(i);
      startT = performance.now();
      if (user) paused = false;
    }
    (function tick(now) {
      requestAnimationFrame(tick);
      if (!inView || document.hidden) { startT = now - (prog._p || 0) * DUR; return; }
      if (paused) { startT = now - (prog._p || 0) * DUR; return; }
      var p = Math.min(1, (now - startT) / DUR);
      prog._p = p;
      prog.style.width = (p * 100).toFixed(2) + '%';
      if (p >= 1) { var nx = current; do { nx = (nx + 1) % O.length; } while (!inRegion(nx) && nx !== current); select(nx); }
    })(performance.now());
    new IntersectionObserver(function (es) {
      inView = es[0].isIntersecting;
      if (inView && current < 0) select(Math.max(0, firstInRegion()));
    }, { threshold: 0.25 }).observe($('.objects__grid'));
    $('[data-obj-apply]').addEventListener('click', function () { setFormObject(O[current] ? O[current].id : ''); setTab('job'); });
    return { select: select };
  })();

  // сфера на карте объектов вписывается в сцену: 92% меньшей стороны
  function fitMapSphere() {
    var st = $('.objects__stage'), sp = $('[data-sphere="map"]');
    if (!st || !sp) return;
    sp.style.width = Math.round(Math.min(st.clientWidth, st.clientHeight) * (isMobile() ? 1 : 0.92)) + 'px';
  }
  fitMapSphere();
  window.addEventListener('resize', fitMapSphere);
  if ('ResizeObserver' in window && $('.objects__stage')) new ResizeObserver(fitMapSphere).observe($('.objects__stage'));

  /* ---------- бенто: часы смен (московское время) ---------- */
  (function clock() {
    var svg = $('.clock svg');
    if (!svg) return;
    var C = 100, R = 78;
    function pt(h, r) { var a = (h / 24) * Math.PI * 2 - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; }
    function arc(h0, h1) { var a = pt(h0, R), b = pt(h1, R), large = ((h1 - h0 + 24) % 24) > 12 ? 1 : 0; return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2); }
    $('.clock__day', svg).setAttribute('d', arc(8.06, 19.94));
    $('.clock__night', svg).setAttribute('d', arc(20.06, 31.94));
    var ticks = '';
    for (var h = 0; h < 24; h++) {
      var a = pt(h, 94), b = pt(h, h % 6 ? 91 : 88);
      ticks += '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '" />';
      if (h % 4 === 0) { var tp = pt(h, 104); ticks += '<text x="' + tp[0].toFixed(1) + '" y="' + tp[1].toFixed(1) + '">' + String(h).padStart(2, '0') + '</text>'; }
    }
    $('.clock__ticks', svg).innerHTML = ticks;
    var hand = $('.clock__hand', svg), foot = $('.b-card--clock .b-card__foot');
    var base = foot.textContent;
    function now() {
      var d = new Date(), utc = d.getTime() + d.getTimezoneOffset() * 60000, m = new Date(utc + 3 * 3600000);
      var hours = m.getHours() + m.getMinutes() / 60;
      hand.style.transform = 'rotate(' + (hours / 24 * 360) + 'deg)';
      var day = hours >= 8 && hours < 20;
      foot.innerHTML = 'Сейчас в Москве ' + String(m.getHours()).padStart(2, '0') + ':' + String(m.getMinutes()).padStart(2, '0') + ' — идёт <span style="color:' + (day ? 'var(--accent)' : '#fff') + ';opacity:1">' + (day ? 'дневная' : 'ночная') + ' смена</span><br>' + base;
    }
    now(); setInterval(now, 30000);
  })();

  // люди: 9 из 10 возвращаются
  (function people() {
    var box = $('.people');
    if (!box) return;
    var html = '';
    for (var i = 0; i < 10; i++) html += '<i class="' + (i < 9 ? 'on' : 'off') + '" style="transition-delay:' + (i * 0.07) + 's"></i>';
    box.innerHTML = html;
    var items = $$('i', box);
    items.forEach(function (i) { i.classList.remove('on'); });
    var card = box.closest('.b-card');
    card._onIn = function () { items.forEach(function (it, k) { if (k < 9) setTimeout(function () { it.classList.add('on'); }, 200 + k * 90); }); };
  })();

  // счётчики
  $$('[data-count]').forEach(function (el) {
    var host = el.closest('.b-card') || el;
    var prev = host._onIn;
    var target = parseFloat(el.dataset.count), sp = el.dataset.format === 'space';
    el.textContent = sp ? fmt(0) : '0';
    host._onIn = function () {
      if (prev) prev();
      var t0 = performance.now(), D = 1400;
      (function step(n) {
        var p = Math.min(1, (n - t0) / D), e = 1 - Math.pow(1 - p, 3), v = target * e;
        el.textContent = sp ? fmt(v) : String(Math.round(v));
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    };
  });

  /* ---------- профессии ---------- */
  (function profs() {
    var grid = $('[data-profs]');
    if (!grid) return;
    var P = AS.PROFESSIONS, total = AS.OBJECTS.length;
    function card(p, i, wide) {
      var n = AS.countObjectsFor(p.key);
      var hit = AS.OBJECTS.filter(function (o) { return o.jobs.some(function (j) { return j.indexOf(p.key) === 0 || (p.key === 'Сортировщик' && j.indexOf('Сортировщик') === 0); }); });
      var miss = AS.OBJECTS.filter(function (o) { return hit.indexOf(o) < 0; });
      var where = miss.length && miss.length <= 2 ? 'Везде, кроме: ' + miss.map(function (o) { return o.short; }).join(', ') : hit.map(function (o) { return o.short; }).join(' · ');
      return '<article class="p-card' + (wide ? ' p-card--wide' : '') + '"><span class="mono mono--dim">© — ' + String(i + 1).padStart(3, '0') + '.</span><span class="p-card__dot" aria-hidden="true"></span><h3 class="p-card__title">' + p.title + '</h3><p class="p-card__text">' + p.text + '</p><p class="p-card__where mono"><span>Где: </span>' + where + '</p><div class="p-card__meta"><span class="mono">' + n + ' из ' + total + ' ' + AS.plural(total, 'объекта', 'объектов', 'объектов') + '</span><span class="p-card__bar" aria-hidden="true"><i style="--k:' + (n / total).toFixed(3) + '"></i></span></div></article>';
    }
    var brand = '<div class="p-card p-card--brand" aria-hidden="true"><svg viewBox="0 0 64 64"><use href="#mark-inv" /></svg><b>Альфа<br>Стафф</b><span class="mono mono--dim">Recruiting</span></div>';
    grid.innerHTML = card(P[0], 0) + brand + card(P[1], 1) + card(P[2], 2) + card(P[3], 3) + card(P[4], 4) + card(P[5], 5) + card(P[6], 6);
    $$('.p-card', grid).forEach(function (el) { io.observe(el); });
  })();

  /* ---------- путь и карта ---------- */
  (function journey() {
    var tl = $('[data-timeline]');
    if (tl) {
      tl._onIn = function () {
        var lis = $$('li', tl);
        lis.forEach(function (li, i) { setTimeout(function () { li.classList.add('is-on'); tl.style.setProperty('--tl', ((i + 1) / lis.length).toFixed(3)); }, 300 + i * 420); });
      };
    }
    var geo = $('.geo__canvas'), geoNav = $('[data-geo-nav]');
    if (geo && AS.GeoMap) {
      // кнопки над картой: вся карта и регионы; нажатие на регион на карте тоже приближает его
      var chips = [{ key: '', label: 'Вся карта' }].concat(AS.REGIONS.map(function (r) { return { key: r.key, label: r.label }; }));
      if (geoNav) geoNav.innerHTML = chips.map(function (c) { return '<button type="button" data-r="' + c.key + '" aria-pressed="' + (c.key ? 'false' : 'true') + '">' + c.label + '</button>'; }).join('');
      var geoApi = AS.GeoMap(geo, { onZoom: function (key) { if (geoNav) $$('button', geoNav).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.r === key ? 'true' : 'false'); }); } });
      if (geoNav) $$('button', geoNav).forEach(function (b) { b.addEventListener('click', function () { geoApi.zoom(b.dataset.r); }); });
    }
    var wave = $('.manifesto__wave canvas');
    if (wave && AS.DotWave) AS.DotWave(wave);
    var earth = $('.earth__canvas');
    if (earth && AS.Earth) AS.Earth(earth);
  })();

  /* ---------- калькулятор ---------- */
  var calcState = { shifts: 30 };
  (function calc() {
    var seg = $('[data-seg]');
    if (!seg) return;
    var btns = $$('button', seg), sumEl = $('[data-calc="sum"]'), shown = 0;
    // ориентир — средняя ставка по объектам (середина вилки каждого объекта, медиана), минимум — самая низкая ставка
    var mids = AS.OBJECTS.filter(function (o) { return o.shift === '12 часов' && o.rateMin; }).map(function (o) { return (o.rateMin + o.rateTop) / 2; }).sort(function (a, b) { return a - b; });
    var CALC_MID = Math.round((mids[Math.floor(mids.length / 2)] || 4000) / 100) * 100, CALC_MIN = AS.STATS.rateMin || 3000;
    $$('[data-calc="mid"]').forEach(function (el) { el.textContent = fmt(CALC_MID); });
    function anim(to) {
      var from = shown, t0 = performance.now();
      (function s(n) { var p = Math.min(1, (n - t0) / 700), e = 1 - Math.pow(1 - p, 3); shown = from + (to - from) * e; sumEl.textContent = fmt(shown); if (p < 1) requestAnimationFrame(s); })(t0);
    }
    function set(v, i) {
      calcState.shifts = v;
      btns.forEach(function (b, k) { b.setAttribute('aria-checked', k === i ? 'true' : 'false'); });
      seg.style.setProperty('--i', i);
      var weeks = Math.ceil(v / 6);
      $('[data-calc="idx"]').textContent = String(i + 1).padStart(3, '0');
      $('[data-calc="shifts"]').textContent = v;
      $('[data-calc="weeks"]').textContent = weeks;
      $('[data-calc="sched"]').textContent = v >= 45 ? '6/1 или 7/0' : '6/1';
      $('[data-calc="min"]').textContent = fmt(v * CALC_MIN) + ' ₽';
      anim(v * CALC_MID);
      $('[data-calc="out"]').textContent = 'Аванс ' + fmt(AS.STATS.advMin) + '–' + fmt(AS.STATS.advMax) + ' ₽ — после 7 смен или каждую неделю, остальное — в конце вахты';
      $$('[data-incl] li[data-from]').forEach(function (li) { li.classList.toggle('on', v >= parseInt(li.dataset.from, 10)); });
    }
    btns.forEach(function (b, i) { b.addEventListener('click', function () { set(parseInt(b.dataset.v, 10), i); }); });
    seg.addEventListener('keydown', function (e) {
      var i = btns.findIndex(function (b) { return b.getAttribute('aria-checked') === 'true'; });
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); i = (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length; set(parseInt(btns[i].dataset.v, 10), i); btns[i].focus(); }
    });
    set(30, 2);
    $('[data-calc-apply]').addEventListener('click', function () {
      setTab('job');
      var r = $('input[name="shifts"][value="' + calcState.shifts + '"]');
      if (r) r.checked = true;
    });
  })();

  /* ---------- FAQ: открыт один ответ ---------- */
  $$('[data-faq] details').forEach(function (d, _, all) {
    d.addEventListener('toggle', function () { if (d.open) all.forEach(function (o) { if (o !== d) o.open = false; }); });
  });

  /* ---------- форма ---------- */
  var form = $('[data-form]');
  function setTab(mode) {
    if (!form) return;
    form.dataset.mode = mode;
    $$('[data-tab-btn]', form).forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tabBtn === mode ? 'true' : 'false'); });
    $$('[data-for]', form).forEach(function (el) { el.hidden = el.dataset.for !== mode; });
    $('[data-area-label]', form).textContent = mode === 'job' ? 'Комментарий' : 'Задача';
    $('textarea', form).placeholder = mode === 'job' ? 'Когда готовы выехать, есть ли опыт' : 'Склад, объём, сроки выхода персонала';
  }
  function setFormObject(id) { var s = $('[data-object-select]'); if (s) s.value = id || ''; }
  (function formInit() {
    if (!form) return;
    var sel = $('[data-object-select]', form);
    AS.OBJECTS.forEach(function (o) { var op = document.createElement('option'); op.value = o.id; op.textContent = o.short; sel.appendChild(op); });
    $$('[data-tab-btn]', form).forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tabBtn); }); });
    $$('[data-tab]').forEach(function (a) { a.addEventListener('click', function () { setTab(a.dataset.tab); }); });
    setTab('job');
    var phone = $('input[name="phone"]', form);
    phone.addEventListener('input', function () {
      var d = phone.value.replace(/\D/g, '');
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d && d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      var out = d ? '+7' : '';
      if (d.length > 1) out += ' (' + d.slice(1, 4);
      if (d.length >= 4) out += ')';
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      phone.value = out;
    });
    $$('input', form).forEach(function (inp) { inp.addEventListener('input', function () { var f = inp.closest('.field'); if (f) f.classList.remove('is-error'); }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      [['name', function (v) { return v.trim().length > 1; }], ['phone', function (v) { return v.replace(/\D/g, '').length === 11; }]].forEach(function (c) {
        var inp = $('input[name="' + c[0] + '"]', form), good = c[1](inp.value);
        inp.closest('.field').classList.toggle('is-error', !good);
        if (!good && ok) { inp.focus(); ok = false; }
      });
      if (!ok) return;
      $('.form__done', form).hidden = false;
    });
    $('[data-form-reset]', form).addEventListener('click', function () { form.reset(); setTab(form.dataset.mode || 'job'); $('.form__done', form).hidden = true; });
    $('[data-policy]').addEventListener('click', function (e) { e.preventDefault(); });
  })();

  /* ---------- общий цикл прокрутки ---------- */
  var ticking = false;
  function frame() { ticking = false; updateWords(); updateSplits(); }
  function requestFrame() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', requestFrame, { passive: true });
  window.addEventListener('resize', requestFrame);
  frame();
})();
