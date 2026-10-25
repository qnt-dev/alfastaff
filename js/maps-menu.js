/* Альфа-Стафф · меню карт (кнопка «Как добраться» в шапке карты объекта): объект (склад или производство) или проживание в Яндекс Картах, Google Картах или 2ГИС,
   «Показать» (метка на карте) или «Маршрут» (от того места, где человек сейчас). Ссылки открываются в новой вкладке,
   на телефоне — в приложении карт, если оно стоит. Сайт ничего не загружает с этих сервисов.
   Точки — AS.PLACES (js/places.js), подписи — AS.OBJECTS (адрес, проживание). Последний выбранный сервис — первым в списке.
   AS.MapsMenu(кнопка, { object: () => объект, onOpen, onClose }) */
(function () {
  'use strict';
  var AS = window.AS = window.AS || {};
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'as-maps-service';
  // ссылки проверены 22.10.2026 вручную: Яндекс — pt «долгота,широта», rtext «широта,долгота» (пустое «откуда» — от человека);
  // Google — Maps URLs (api=1); 2ГИС — geo/«долгота,широта» с меткой m=…/17, маршрут — directions/points/|«долгота,широта»
  // значки — файлы на самом сайте (assets/img/maps): Яндекс, Google, 2ГИС
  var SERVICES = [
    { id: 'yandex', name: 'Яндекс Карты',
      show: function (p) { return 'https://yandex.ru/maps/?pt=' + p[1] + ',' + p[0] + '&z=17&l=map'; },
      route: function (p) { return 'https://yandex.ru/maps/?rtext=~' + p[0] + ',' + p[1]; } },
    { id: 'google', name: 'Google Карты',
      show: function (p) { return 'https://www.google.com/maps/search/?api=1&query=' + p[0] + ',' + p[1]; },
      route: function (p) { return 'https://www.google.com/maps/dir/?api=1&destination=' + p[0] + ',' + p[1]; } },
    { id: '2gis', name: '2ГИС',
      show: function (p) { return 'https://2gis.ru/geo/' + p[1] + ',' + p[0] + '?m=' + p[1] + ',' + p[0] + '/17'; },
      route: function (p) { return 'https://2gis.ru/directions/points/%7C' + p[1] + '%2C' + p[0]; } }
  ];
  var ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 11.5l7-7M5.5 4.5h6v6" /></svg>';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function last() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function remember(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }
  var uid = 0;

  AS.MapsMenu = function (btn, opts) {
    if (!btn) return null;
    opts = opts || {};
    var id = 'maps-menu-' + (++uid), to = 'wh', obj = null, place = null, isOpen = false;
    var menu = document.createElement('div');
    menu.className = 'mapsm'; menu.id = id; menu.hidden = true;
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-label', 'Открыть в картах');
    btn.parentNode.appendChild(menu);
    btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);

    function draw() {
      var p = place && place[to], o = obj || {};
      var addr = to === 'wh' ? (o.address || o.location || '') : (o.hostel ? 'Проживание: ' + o.hostel : 'Проживание рядом с объектом');
      var order = SERVICES.slice().sort(function (a, b) { return (b.id === last()) - (a.id === last()); });
      menu.innerHTML =
        '<div class="mapsm__head"><span class="mono mono--dim">Открыть в картах</span><b>' + esc(o.short || '') + '</b>' +
          '<button type="button" class="mapsm__x" data-mapsm-close aria-label="Закрыть"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button></div>' +
        '<div class="mapsm__seg" role="group" aria-label="Что показать">' +
          '<button type="button" data-mapsm-to="wh" aria-pressed="' + (to === 'wh') + '">Объект</button>' +
          '<button type="button" data-mapsm-to="stay" aria-pressed="' + (to === 'stay') + '"' + (place && place.stay ? '' : ' disabled title="Адрес проживания уточняется"') + '>Проживание</button>' +
        '</div>' +
        '<p class="mapsm__addr">' + esc(addr) + '</p>' +
        '<ul class="mapsm__list">' + order.map(function (s) {
          return '<li><span class="mapsm__svc"><img class="mapsm__ico mapsm__ico--' + s.id + '" src="assets/img/maps/' + s.id + '.svg?v=20261025a" alt="" width="28" height="28"><span>' + s.name + (s.id === last() ? '<em>последний раз</em>' : '') + '</span></span>' +
            '<a href="' + esc(s.show(p)) + '" target="_blank" rel="noopener" data-mapsm-svc="' + s.id + '">Показать</a>' +
            '<a href="' + esc(s.route(p)) + '" target="_blank" rel="noopener" data-mapsm-svc="' + s.id + '" class="is-route">Маршрут' + ARROW + '</a></li>';
        }).join('') + '</ul>' +
        '<p class="mapsm__note">«Маршрут» — путь до этой точки: начало карта возьмёт из вашего местоположения или спросит. Откроется в новой вкладке или в приложении карт.</p>';
    }
    function open() {
      obj = opts.object ? opts.object() : null;
      place = obj && AS.PLACES ? AS.PLACES[obj.id] : null;
      if (!place) return;
      to = 'wh'; draw();
      menu.hidden = false; isOpen = true; btn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
      var first = menu.querySelector('.mapsm__list a'); if (first) first.focus({ preventScroll: true });
      if (opts.onOpen) opts.onOpen(obj);
    }
    function close(back) {
      if (!isOpen) return;
      isOpen = false; btn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('is-open');
      setTimeout(function () { if (!isOpen) menu.hidden = true; }, reduce ? 0 : 220);
      if (back) btn.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose(obj);
    }
    // кнопка недоступна, если точек объекта нет (адрес уточняется)
    function sync() {
      var o = opts.object ? opts.object() : null, ok = !!(o && AS.PLACES && AS.PLACES[o.id]);
      btn.disabled = !ok;
      btn.title = ok ? 'Яндекс Карты, Google Карты или 2ГИС' : 'Адрес объекта уточняется';
      if (!ok && isOpen) close();
    }
    btn.addEventListener('click', function () { if (isOpen) close(true); else open(); });
    menu.addEventListener('click', function (e) {
      var t = e.target.closest('[data-mapsm-to]');
      if (t && !t.disabled) { to = t.dataset.mapsmTo; draw(); var b = menu.querySelector('[data-mapsm-to="' + to + '"]'); if (b) b.focus(); return; }
      var a = e.target.closest('[data-mapsm-svc]');
      if (a) { remember(a.dataset.mapsmSvc); setTimeout(function () { close(); }, 50); return; }
      if (e.target.closest('[data-mapsm-close]')) close(true);
    });
    document.addEventListener('keydown', function (e) { if (isOpen && e.key === 'Escape') { e.preventDefault(); close(true); } });
    document.addEventListener('pointerdown', function (e) { if (isOpen && !menu.contains(e.target) && !btn.contains(e.target)) close(); });
    return { sync: sync, close: close, isOpen: function () { return isOpen; } };
  };
})();
