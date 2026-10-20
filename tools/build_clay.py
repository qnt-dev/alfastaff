"""3D-кварталы объектов для панели «География объектов» (js/clay-map.js) из OpenStreetMap.

Запуск:  python tools/build_clay.py            — все объекты из CFG
         python tools/build_clay.py major art-pak — только эти
Результат: data/clay/<id>.json; список id — вывести в AS.CLAY_IDS (js/clay-map.js).
Кэш скачанного (OSM, маршруты) — tools/.clay-cache/ (не в git): удалите файл, чтобы скачать заново.

Режимы (mode):
  walk   — жильё рядом: квартал вокруг жилья и склада, пеший маршрут до ближайшей к жилью стены склада, кольцо «заселение»;
  drive  — жильё далеко: квартал вокруг склада, хвост автомобильного маршрута от жилья входит в квартал с края;
  onsite — жильё на территории объекта: только квартал объекта;
  solo   — жильё не найдено на карте: только квартал объекта.
Склад: wh — id зданий OSM (метка — над самым большим), wh_area — id участка OSM, все здания на котором — объект,
  или wh_own — наш собственный контур корпуса [(широта, долгота), …] с высотой wh_h (м), если корпуса нет в открытых данных;
  wh_h у wh — своя высота корпуса, если в OSM она занижена (одноэтажный склад «1 этаж» = 3 м).
Жильё: host — точка (широта, долгота), host_way — здание OSM (для кольца «заселение»), place — подпись у дороги (drive).
Данные: OSM API 0.6 (map.json, way/full.json), маршруты — OSRM routing.openstreetmap.de. © участники OpenStreetMap, ODbL.
"""
import json, io, os, sys, math, re, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, '.clay-cache'); OUT = os.path.join(ROOT, 'data', 'clay')
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'AlphaStaff-site/1.0 (static map build)'}

# Склады и жильё сверены 12.10.2026: адрес → координаты 2ГИС / справочник складов Яндекс Маркета для продавцов → здание OSM.
# «?» — совпадение не точное, проверить у заказчика. Нет FM Толбино (промпарк «Большое Толбино», 55.33675, 37.48661) и
# FM Электроугли («Промплощадка № 2, 1», 55.741193, 38.286447): их корпуса в OSM не нарисованы — появятся в OSM, добавить сюда.
CFG = {
 'ym-tarny':          dict(mode='walk',  wh=[971118049],  host=(55.63463, 37.63507), host_way=118593777),       # СЦ «Тарный», Промышленная 12а (2ГИС)
 'fm-chekhov':        dict(mode='walk',  wh=[311566633],  host=(55.112553, 37.532224), host_way=690917707),     # «Терминал FM Logistic»; жильё — Производственная, 7
 'starodvorskie':     dict(mode='walk',  wh=[223379905, 223380005, 223379995, 223379979, 223379907, 223379881], host=(56.153877, 40.420065), host_way=223379879),
                      # ? заводской комплекс за проходной Полины Осипенко, 41 (точка 2ГИС «abi» — у проходной; корпуса — по спутнику); жильё — Электрозаводская 1А (1В в OSM нет)
 'lemana-kinel':      dict(mode='walk',  wh_area=57868053, host=(53.22613, 50.5979), host_way=332093809),       # ? комплекс «СЛК», Промышленная 13 (какой корпус — «склад 4», в OSM нет); Gold Hotel
 'sviyazhsk':         dict(mode='onsite', wh_area=1299058805, line='Жильё — хостел на территории элеватора'),   # «Свияжск-Зернопродукт»
 'ym-sofyino':        dict(mode='drive', wh=[1038876315], host=(55.50691, 38.32205), place='д. Кузнецово'),      # склад ЯМ «Софьино-2», стр. 2/1 (справочник ЯМ)
 'ozon-sofyino':      dict(mode='drive', wh=[1376993826], host=(55.50691, 38.32205), place='д. Кузнецово'),      # «Распределительный центр Ozon, МО Софьино РФЦ»
 'ym-kuvekino':       dict(mode='drive', wh=[1421610394], host=(55.47174, 37.57468), place='Подольск'),          # СЦ Кувекино, Евсеевская 15 (справочник ЯМ, 2ГИС)
 'returns-domodedovo': dict(mode='drive', wh=[498322052], host=(55.33013, 37.84675), place='Белые Столбы'),      # возвратный склад ЯМ, «Склады 104» стр. 6/1 (справочник ЯМ)
 'fm-stupino':        dict(mode='drive', wh=[216592674],  host=(55.34088, 37.91189), place='Житнево'),           # Заводская 1, пос. Октябрьский (вакансии FM, 2ГИС)
 'major':             dict(mode='drive', wh=[667559266],  host=(55.81782, 37.10357), place='д. Лешково'),        # ул. Ленина, 85/2
 'lemana-south':      dict(mode='drive', wh=[706464689],  host=(55.34088, 37.91189), place='Житнево'),           # «Распределительный центр Леруа Мерлен», Лермонтова 3
 'lemana-north':      dict(mode='drive', wh=[972289814],  host=(56.01322, 37.22632), place='п. Ржавки'),         # Зараменье, 41 с1
 'lemana-zelenograd': dict(mode='drive', wh=[290040646],  host=(56.01295, 37.22434), place='пгт Ржавки'),        # ? «Лемана Про» у Ленинградского ш.
 'forum-auto':        dict(mode='drive', wh=[1252603990], host=(55.55441, 37.51679), place='Коммунарка'),        # Солнечная, 24 с1
 'splat':             dict(mode='drive', wh_area=469952836, host=(56.23847, 43.48475), place='ул. Черняховского'), # ? фабрика «Капелла» (производство SPLAT в Дзержинске)
 'art-pak':           dict(mode='drive', wh=[469952839],  host=(56.23847, 43.48475), place='ул. Черняховского'), # территория «АртПак»
 'lemana-nn':         dict(mode='drive', wh=[612546014],  host=(56.27595, 43.959601), place='Молитовский затон'), # «Лемана Про», Московское ш. 352К; хостел — 2-я линия 16Б (2ГИС)
 # Казань (таблица от 19.10.2026): «ФФ, СЦ Яндекс Казань» — один склад, Тура 2.0, 9к1 (справочник ЯМ; в OSM — «9» на промплощадке
 # «Зеленодольск»); «ФМ Казань» — стр. 11 той же промплощадки (адрес в OSM; склад FM Logistic «Зеленодольск, промплощадка, стр. 11»).
 # Жильё обоих — Казань, Бурхана Шахиди, 20. Корпус 11 в OSM — «1 этаж» (3 м): у склада потолок ~10 м — высота своя (wh_h)
 'ym-kazan':          dict(mode='drive', wh=[1433441350], host=(55.7868, 49.10565), place='Казань'),
 'fm-kazan':          dict(mode='drive', wh=[1433441361], wh_h=10, host=(55.7868, 49.10565), place='Казань'),
 # корпусов этих двух складов нет ни в OSM, ни в Microsoft Building Footprints — контур наш: прямоугольник по спутниковому
 # снимку (крыша, 14.10.2026), координаты точки — 2ГИС
 'fm-tolbino':        dict(mode='drive', wh_own=[[(55.337674, 37.484095), (55.337448, 37.487697), (55.335701, 37.487357), (55.335928, 37.483755)]], wh_h=13,
                           host=(55.12911, 37.54687), place='д. Новосёлки'),                                     # промпарк «Большое Толбино», 1 с5 (Подольский г.о.)
 'fm-elektrougli':    dict(mode='drive', wh_own=[[(55.739362, 38.285765), (55.743514, 38.287994), (55.743187, 38.28992), (55.739034, 38.28769)]], wh_h=13,
                           host=(55.79748, 38.43752), place='Электросталь'),                                     # «Промплощадка № 2, 1», Богородский г.о.
 'wurth':             dict(mode='solo',  wh=[370684131, 334640940]),                                             # Адмирала Корнилова, вл3 с1 (2ГИС); жильё «Калужское ш., 1-й км, 8В» не найдено
}

def get(u, timeout=180):
    for i in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=timeout).read()
        except Exception as e: print('  повтор', e); time.sleep(5)
    raise RuntimeError('не скачалось: ' + u)
def cached(name, url, timeout=180):
    fn = os.path.join(CACHE, name)
    if not os.path.exists(fn): open(fn, 'wb').write(get(url, timeout)); time.sleep(1)
    return json.load(io.open(fn, encoding='utf-8'))

def objects():   # js/objects.js — сгенерированный JSON внутри
    s = io.open(os.path.join(ROOT, 'js', 'objects.js'), encoding='utf-8').read()
    a = s.index('AS.OBJECTS = ') + len('AS.OBJECTS = '); b = s.index('\n];', a) + 2
    return {o['id']: o for o in json.loads(s[a:b])}

def way_ring(wid):   # контур здания/участка OSM: [(lat, lon), …]
    d = cached(f'way_{wid}.json', f'https://api.openstreetmap.org/api/0.6/way/{wid}/full.json')['elements']
    N = {e['id']: e for e in d if e['type'] == 'node'}; w = next(e for e in d if e['type'] == 'way')
    return [(N[i]['lat'], N[i]['lon']) for i in w['nodes'] if i in N]
def area(pts): return abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 2
def centroid(pts): return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
def pip(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i - 1]; x2, y2 = poly[i]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def height(t):
    if 'height' in t:
        try: return float(str(t['height']).split()[0])
        except ValueError: pass
    if 'building:levels' in t:
        try: return float(str(t['building:levels']).replace(',', '.')) * 3.1
        except ValueError: pass
    return {'apartments': 27, 'residential': 24, 'house': 7, 'detached': 7, 'garage': 3, 'garages': 3.2, 'shed': 3, 'kiosk': 3,
            'industrial': 9, 'warehouse': 10, 'retail': 8, 'commercial': 14, 'office': 18, 'service': 4, 'roof': 5, 'silo': 30}.get(t.get('building', 'yes'), 9)
def simplify(pts, tol):   # Дуглас — Пекер; у замкнутого контура последняя точка = первая — её убираем, иначе контур схлопывается
    if len(pts) > 3 and pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 4: return pts
    keep = [0] * len(pts); keep[0] = keep[-1] = 1; st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop(); (ax, ay), (bx, by) = pts[a], pts[b]; L = math.hypot(bx - ax, by - ay) or 1e-9; best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((by - ay) * (pts[i][0] - ax) - (bx - ax) * (pts[i][1] - ay)) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = 1; st += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]
RW = {'motorway': 22, 'trunk': 20, 'primary': 16, 'secondary': 13, 'tertiary': 11, 'unclassified': 8, 'residential': 8, 'service': 5,
      'living_street': 6, 'motorway_link': 9, 'trunk_link': 9, 'primary_link': 8, 'secondary_link': 7, 'tertiary_link': 7, 'pedestrian': 4, 'footway': 2.2, 'path': 1.8, 'cycleway': 2.2}
def route(kind, a, b, key):
    prof = 'routed-foot' if kind == 'foot' else 'routed-car'
    r = cached(f'route_{key}_{kind}.json', f'https://routing.openstreetmap.de/{prof}/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}?overview=full&geometries=geojson', 60)['routes'][0]
    return r['geometry']['coordinates'], r['distance']
def fmt_dist(m): return f'{int(round(m / 50.0) * 50)} м' if m < 1000 else f'{m / 1000:.1f} км'.replace('.', ',')

def build(key, OBJ):
    c = CFG[key]; o = OBJ[key]; mode = c['mode']; hll = c.get('host')
    if 'wh' in c or 'wh_own' in c:
        rings = {w: way_ring(w) for w in c['wh']} if 'wh' in c else {-1 - i: list(r) for i, r in enumerate(c['wh_own'])}
        main = max(rings, key=lambda w: area(rings[w]))
        wll = centroid(rings[main]); wpts = [p for r in rings.values() for p in r]
    else:
        arear = way_ring(c['wh_area']); wll = centroid(arear); wpts = arear
    lat0, lon0 = ((hll[0] + wll[0]) / 2, (hll[1] + wll[1]) / 2) if mode == 'walk' else wll
    kx = math.cos(math.radians(lat0)) * 111320; ky = 110540
    xy = lambda lat, lon: (round((lon - lon0) * kx, 1), round((lat - lat0) * ky, 1))
    # кадр: полсторона S (м); склад целиком в кадре и занимает около половины, при пешем маршруте — и жильё
    def half(whA):
        if mode == 'walk':
            h, w = xy(*hll), xy(*wll); span = max(abs(h[0] - w[0]), abs(h[1] - w[1]))
            return round(max(300, span * 0.7 + 140, whA / 0.6, max(abs(h[0]), abs(h[1])) / 0.7))
        # склад — около трети кадра: вокруг целиком помещаются соседние корпуса и дороги (выбор 14.10: «кадр шире»)
        return round(max(380, whA / (0.6 if mode == 'onsite' else 0.38)))
    S = half(max(max(abs(xy(*p)[0]), abs(xy(*p)[1])) for p in wpts)); F = S * 2   # F — что попадает в данные: при наклоне камера видит дальше кадра
    dlat = F * 1.05 / ky; dlon = F * 1.05 / kx
    E = cached(f'map_{key}_{S}.json', 'https://api.openstreetmap.org/api/0.6/map.json?bbox=%.6f,%.6f,%.6f,%.6f' % (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat))['elements']
    N = {e['id']: e for e in E if e['type'] == 'node'}
    def parse(F):
        inside = lambda p: abs(p[0]) <= F and abs(p[1]) <= F
        blds, out = [], {'b': [], 'roads': [], 'green': [], 'water': []}
        for wy in E:
            if wy['type'] != 'way' or not wy.get('tags'): continue
            t = wy['tags']; lls = [(N[i]['lat'], N[i]['lon']) for i in wy['nodes'] if i in N]; pts = [xy(*p) for p in lls]
            if len(pts) < 2 or not any(inside(p) for p in pts): continue
            if 'building' in t and t.get('building') != 'no' and len(pts) >= 4:
                sp = simplify(pts[:-1] if pts[0] == pts[-1] else pts, 0.6)
                if len(sp) >= 3: blds.append((wy['id'], t, sp, lls))
            elif t.get('highway') in RW: out['roads'].append({'w': RW[t['highway']], 'p': simplify(pts, 0.8)})
            elif t.get('railway') in ('rail', 'tram'): out['roads'].append({'w': 3.5, 'p': simplify(pts, 0.8)})
            elif t.get('landuse') in ('grass', 'forest', 'meadow', 'recreation_ground', 'village_green') or t.get('leisure') in ('park', 'garden', 'pitch', 'playground') or t.get('natural') in ('wood', 'scrub', 'grassland'):
                if pts[0] == pts[-1]: out['green'].append(simplify(pts, 1.2))
            elif t.get('natural') == 'water' or t.get('landuse') in ('reservoir', 'basin'):
                if pts[0] == pts[-1]: out['water'].append(simplify(pts, 1.2))
        out['water'] += water_rel(F, blds)
        return blds, out
    # большие водоёмы (водохранилища, реки) в OSM — составные фигуры: в кадр попадает только кусок берега.
    # Кусок замыкаем далеко за краем кадра с той стороны, где нет зданий; острова (inner) — вырезаем отдельно (земля поверх воды)
    W_ = {e['id']: e for e in E if e['type'] == 'way'}
    def water_rel(F, blds):
        res = []
        for r in E:
            t = r.get('tags', {}) if r['type'] == 'relation' else {}
            if not (t.get('natural') == 'water' or t.get('landuse') == 'reservoir' or t.get('waterway') == 'riverbank'): continue
            outer = [m['ref'] for m in r['members'] if m['type'] == 'way' and m.get('role', 'outer') in ('outer', '') and m['ref'] in W_]
            chains = []   # склейка кусков берега по общим точкам
            for wid in outer:
                nd = [i for i in W_[wid]['nodes'] if i in N]
                if len(nd) < 2: continue
                for ch in chains:
                    if ch[-1] == nd[0]: ch += nd[1:]; break
                    if ch[-1] == nd[-1]: ch += nd[::-1][1:]; break
                    if ch[0] == nd[-1]: ch[:0] = nd[:-1]; break
                    if ch[0] == nd[0]: ch[:0] = nd[::-1][:-1]; break
                else: chains.append(list(nd))
            closed = [ch for ch in chains if ch[0] == ch[-1]]
            open_ = [ch for ch in chains if ch[0] != ch[-1] and any(abs(xy(N[i]['lat'], N[i]['lon'])[0]) <= F and abs(xy(N[i]['lat'], N[i]['lon'])[1]) <= F for i in ch)]
            for ch in closed: res.append(simplify([xy(N[i]['lat'], N[i]['lon']) for i in ch], 1.5))
            if len(open_) != 1: continue   # два берега реки и т. п. — без заливки (не угадываем)
            pts = [xy(N[i]['lat'], N[i]['lon']) for i in open_[0]]
            R = F * 30
            def far(p):   # точка на большом квадрате в направлении p
                m = max(abs(p[0]), abs(p[1])) or 1; return (p[0] / m * R, p[1] / m * R)
            a, b = far(pts[-1]), far(pts[0])
            corners = [(R, R), (-R, R), (-R, -R), (R, -R)]
            import math as _m
            ang = lambda p: _m.atan2(p[1], p[0]) % (2 * _m.pi)
            def around(ccw):   # от a до b вдоль большого квадрата
                aa, bb = ang(a), ang(b); cs = sorted(corners, key=ang)
                if ccw: span = (bb - aa) % (2 * _m.pi); mid = [cpt for cpt in cs if 0 < (ang(cpt) - aa) % (2 * _m.pi) < span]; mid.sort(key=lambda cpt: (ang(cpt) - aa) % (2 * _m.pi))
                else: span = (aa - bb) % (2 * _m.pi); mid = [cpt for cpt in cs if 0 < (aa - ang(cpt)) % (2 * _m.pi) < span]; mid.sort(key=lambda cpt: (aa - ang(cpt)) % (2 * _m.pi))
                return pts + [a] + mid + [b]
            cand = [around(True), around(False)]
            # вода — та сторона, где меньше зданий
            score = [sum(1 for bl in blds if abs(centroid(bl[2])[0]) < F and abs(centroid(bl[2])[1]) < F and pip(centroid(bl[2]), poly)) for poly in cand]
            res.append(simplify(cand[0] if score[0] <= score[1] else cand[1], 1.5))
        return res
    blds, out = parse(F)
    if 'wh_own' in c:   # свой контур корпуса — добавляем к зданиям квартала (и убираем то, что под ним)
        for rid, r in rings.items():
            poly = [xy(*p) for p in r]
            blds = [b for b in blds if not pip(centroid(b[2]), poly)]
            blds.append((rid, {'building': 'warehouse', 'height': str(c.get('wh_h', 12))}, poly, r))
        whs = set(rings); mainp = [xy(*p) for p in rings[main]]
    elif 'wh' in c: whs = set(c['wh']); mainp = [xy(*p) for p in rings[main]]
    else:
        whs = {b[0] for b in blds if b[0] != c['wh_area'] and pip(centroid(b[3]), arear)}
        # участок шире зданий на нём: кадр — по самим зданиям (данные уже скачаны с запасом)
        S2 = half(max(max(abs(p[0]), abs(p[1])) for b in blds if b[0] in whs for p in b[2]))
        if S2 < S: S, F = S2, S2 * 2; blds, out = parse(F)
        mb = max((b for b in blds if b[0] in whs), key=lambda b: area(b[2])); mainp = mb[2]
        wll = centroid(mb[3])
    for wid, t, sp, _ in blds:
        if wid in whs and 'wh' in c and 'wh_h' in c: t = dict(t, height=str(c['wh_h']))
        out['b'].append({'p': sp, 'h': round(min(height(t), 42) * 0.9, 1), **({'wh': 1} if wid in whs else {}), **({'host': 1} if wid == c.get('host_way') else {})})
    miss = whs - {b[0] for b in blds}
    wx = xy(*wll)
    def edge_pt(q):   # ближайшая к q точка на стене главного корпуса
        best, bd = wx, 1e18
        for i in range(len(mainp)):
            a, b = mainp[i - 1], mainp[i]; dx, dy = b[0] - a[0], b[1] - a[1]; L2 = dx * dx + dy * dy or 1e-9
            u = max(0, min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); z = (a[0] + dx * u, a[1] + dy * u)
            d = (z[0] - q[0]) ** 2 + (z[1] - q[1]) ** 2
            if d < bd: bd, best = d, (round(z[0], 1), round(z[1], 1))
        return best
    res = {'mode': mode, 'size': S, 'far': F, 'cx': 0, 'cy': 0, 'fit': round(S * 0.92), 'pin': list(wx), 'from': o['hostel'], 'to': o['short']}
    tr = o.get('transport') or ''; mt = re.search(r'(\d+)\s*мин', tr)
    if mode == 'walk':
        # пешком — к стене склада, ближайшей к жилью (а не к центру корпуса: маршрут не обходит здание кругом)
        ep = edge_pt(xy(*hll)); g, _ = route('foot', hll, (lat0 + ep[1] / ky, lon0 + ep[0] / kx), key)
        r = [xy(lat, lon) for lon, lat in g]; hx = xy(*hll)
        if math.hypot(r[0][0] - hx[0], r[0][1] - hx[1]) > 3: r = [hx] + r
        e = edge_pt(r[-1])
        if math.hypot(r[-1][0] - e[0], r[-1][1] - e[1]) > 3: r = r + [e]
        dist = sum(math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]) for i in range(1, len(r)))
        mins = max(1, round(dist / 75))   # 4,5 км/ч
        res.update({'route': simplify(r, 0.8), 'rows': [['Пешком', f'≈ {mins} мин'], ['Расстояние', fmt_dist(dist)]],
                    'line': f'Пешком до объекта ≈ {mins} мин · {fmt_dist(dist)}'})
    elif mode == 'drive':
        g, dist = route('car', hll, wll, key)
        r = [xy(lat, lon) for lon, lat in g]; e = edge_pt(r[-1])
        if math.hypot(r[-1][0] - e[0], r[-1][1] - e[1]) > 3: r = r + [e]
        # хвост маршрута: с конца назад, пока точка в круге 2S (дальше дорога заведомо за краем квартала)
        R = 2.0 * S; tail = [r[-1]]
        for i in range(len(r) - 2, -1, -1):
            p, q = r[i], r[i + 1]
            if math.hypot(*p) > R:
                lo, hi = 0.0, 1.0
                for _ in range(30):
                    m = (lo + hi) / 2
                    if math.hypot(q[0] + (p[0] - q[0]) * m, q[1] + (p[1] - q[1]) * m) > R: hi = m
                    else: lo = m
                tail.append((round(q[0] + (p[0] - q[0]) * lo, 1), round(q[1] + (p[1] - q[1]) * lo, 1))); break
            tail.append(p)
        km = f'≈ {dist / 1000:.0f} км' if dist >= 10000 else f'≈ {dist / 1000:.1f} км'.replace('.', ',')
        line = ('Корпоративный транспорт до объекта · ' + (mt.group(1) + ' мин' if mt else km)) if 'корпоратив' in tr else f'От жилья до объекта {km} по дороге'
        res.update({'route': simplify(tail[::-1], 1.0), 'away': 'Жильё · ' + c['place'], 'rows': [['До жилья', km]], 'line': line})
    else:
        line = c.get('line') or (tr[0].upper() + tr[1:] if tr else 'Корпоративный транспорт до объекта')   # без маршрута — как в таблице
        res.update({'route': [], 'rows': [], 'line': line})
    out.update(res)
    fn = os.path.join(OUT, key + '.json')
    io.open(fn, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f"{key:18s} {mode:6s} S={S:4d} зданий={len(out['b']):4d} склад={len(whs)}{' НЕТ В ДАННЫХ ' + str(sorted(miss)) if miss else ''}"
          f"  {os.path.getsize(fn) // 1024} КБ  «{res['line']}»", flush=True)

if __name__ == '__main__':
    OBJ = objects()
    for k in (sys.argv[1:] or CFG): build(k, OBJ)
    print('AS.CLAY_IDS =', json.dumps(list(CFG)))
