"""Точки для кнопки «Как добраться» (js/maps-menu.js): объект и проживание — js/places.js (AS.PLACES).

Запуск:  python tools/build_places.py
Источник — настройки 3D-кварталов tools/build_clay.py (CFG), там же, где их сверяли по 2ГИС, справочнику складов
Яндекс Маркета и OSM: склад — центр главного корпуса (здание OSM или свой контур корпуса), а если задан участок —
центр участка; жильё — точка host. «Хостел на территории» (mode onsite) — жильё там же, где склад. Объекта нет в CFG
или у него нет точки жилья — кнопка показывает только то, что известно. Контуры берутся из кэша tools/.clay-cache.
"""
import io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import build_clay as C

def place(key, c):
    if 'wh_own' in c:
        rings = [list(r) for r in c['wh_own']]
    elif 'wh' in c:
        rings = [C.way_ring(w) for w in c['wh']]
    else:
        rings = [C.way_ring(c['wh_area'])]
    wh = C.centroid(max(rings, key=C.area))
    stay = wh if c.get('mode') == 'onsite' else c.get('host')
    r = lambda p: [round(p[0], 5), round(p[1], 5)]
    return {'wh': r(wh), **({'stay': r(stay)} if stay else {})}

def main():
    out = {k: place(k, c) for k, c in C.CFG.items()}
    js = ('/* Объект (wh — склад или производство) и проживание (stay) для кнопки «Как добраться» (js/maps-menu.js): [широта, долгота].\n'
          '   Собирает tools/build_places.py из настроек 3D-кварталов (tools/build_clay.py). Вручную не править. */\n'
          'window.AS = window.AS || {};\nAS.PLACES = %s;\n') % json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    io.open(os.path.join(ROOT, 'js', 'places.js'), 'w', encoding='utf-8', newline='\n').write(js)
    for k, v in out.items(): print('%-20s склад %s  жильё %s' % (k, v['wh'], v.get('stay', '—')))

if __name__ == '__main__':
    main()
