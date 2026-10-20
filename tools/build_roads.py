"""Трассы региона для плоской карты «География объектов» (js/geo-panel.js) — дописывает регион в js/roads.js.

Запуск:  python tools/build_roads.py ryz 53.95 41.2 54.75 42.65
         (ключ региона, юг, запад, север, восток)
Остальные регионы в js/roads.js не трогает. Ключ региона → название — ROADKEY в js/geo-panel.js.
Источник: © участники OpenStreetMap (ODbL), Overpass API. Как у остальных регионов: магистрали и трассы (m/t) с номерами,
основные (p) и второстепенные (s) дороги; отрезки одной дороги склеены, линии упрощены (Дуглас — Пекер), точки — 3 знака.
"""
import json, io, os, re, sys, time, math, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ROADS = os.path.join(ROOT, 'js', 'roads.js')
SERVERS = ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
           'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter')
CLS = {'motorway': 'm', 'trunk': 't', 'primary': 'p', 'secondary': 's'}

def overpass(q):
    for attempt in range(6):
        for url in SERVERS:
            try:
                data = urllib.parse.urlencode({'data': q}).encode()
                req = urllib.request.Request(url, data=data, headers={'User-Agent': 'AlphaStaff-site/1.0 (static map build)'})
                return json.load(urllib.request.urlopen(req, timeout=200))
            except Exception as e:
                print('  ', url, '—', e, file=sys.stderr)
        time.sleep(10 * (attempt + 1))
    sys.exit('Overpass недоступен — попробуйте позже')

def simplify(pts, tol):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dmax, k = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        if a == b: d = math.hypot(p[0] - a[0], p[1] - a[1])
        else:
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / math.hypot(dx, dy)
        if d > dmax: dmax, k = d, i
    if dmax <= tol: return [a, b]
    return simplify(pts[:k + 1], tol)[:-1] + simplify(pts[k:], tol)

def chains(ways):
    """Склеить отрезки одной дороги (общий конец) в длинные линии."""
    ways = [list(w) for w in ways]
    merged = True
    while merged:
        merged = False
        for i in range(len(ways)):
            for j in range(len(ways)):
                if i == j or not ways[i] or not ways[j]: continue
                a, b = ways[i], ways[j]
                if a[-1] == b[0]: ways[i] = a + b[1:]
                elif a[-1] == b[-1]: ways[i] = a + b[::-1][1:]
                elif a[0] == b[-1]: ways[i] = b + a[1:]
                elif a[0] == b[0]: ways[i] = b[::-1] + a[1:]
                else: continue
                ways[j] = None; merged = True
        ways = [w for w in ways if w]
    return ways

def main():
    key, s, w, n, e = sys.argv[1], *map(float, sys.argv[2:6])
    q = '[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary)$"](%s,%s,%s,%s);out tags geom;' % (s, w, n, e)
    j = overpass(q)
    groups = {}
    for el in j['elements']:
        t = el.get('tags', {}); h = CLS.get(t.get('highway'))
        if not h or 'geometry' not in el: continue
        refs = ';'.join(r for r in re.split(r'\s*;\s*', t.get('ref', '')) if re.match(r'^[МРА]-\d+$', r))
        pts = [(round(g['lat'], 4), round(g['lon'], 4)) for g in el['geometry']]
        groups.setdefault((h, refs, t.get('name', '') if not refs else ''), []).append(pts)
    out = []
    for (h, refs, _), ws in groups.items():
        for line in chains(ws):
            line = simplify(line, 0.0025 if h in ('m', 't') else 0.003)
            line = [[round(p[0], 3), round(p[1], 3)] for p in line]
            line = [p for i, p in enumerate(line) if i == 0 or p != line[i - 1]]
            if len(line) < 2: continue
            r = {'r': refs} if refs else {}
            r.update({'h': h, 'p': line}); out.append(r)
    order = {'m': 0, 't': 1, 'p': 2, 's': 3}
    out.sort(key=lambda x: order[x['h']])
    src = io.open(ROADS, encoding='utf-8').read()
    m = re.search(r'AS\.ROADS = (\{.*\});\s*$', src, re.S)
    R = json.loads(m.group(1)); R[key] = out
    head = src[:m.start()]
    if ('— ' + key + ' ') not in head.split('*/')[0] and (' ' + key + ' —') not in head.split('*/')[0]:
        print('  допишите ключ', key, 'в шапку js/roads.js и ROADKEY в js/geo-panel.js', file=sys.stderr)
    io.open(ROADS, 'w', encoding='utf-8', newline='\n').write(head + 'AS.ROADS = ' + json.dumps(R, ensure_ascii=False, separators=(',', ':')) + ';\n')
    c = {}
    for x in out: c[x['h']] = c.get(x['h'], 0) + 1
    print(key, len(out), 'линий', c, 'точек', sum(len(x['p']) for x in out))

if __name__ == '__main__':
    main()
