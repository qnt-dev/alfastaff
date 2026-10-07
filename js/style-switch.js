(function () {
  'use strict';
  var control = document.querySelector('.style-switch');
  if (!control) return;
  var links = control.querySelectorAll('a[data-style-option]');   // ссылка «Стоимость разработки» — без якорей разделов
  var sections = document.querySelectorAll('main > section[id], footer[id]');

  // Both variants share section IDs. Retain the section being compared, even
  // when scrolling has moved away from the URL's last navigation anchor.
  function syncDestination() {
    var id = 'top';
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= window.innerHeight * .4) id = section.id;
    });
    links.forEach(function (link) { link.hash = id; });
  }
  control.addEventListener('pointerdown', syncDestination);
  control.addEventListener('focusin', syncDestination);
  control.addEventListener('click', syncDestination);
  links.forEach(function (link) { link.hash = window.location.hash || '#top'; });
}());
