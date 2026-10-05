"""Каталог объектов сайта из таблицы «Вакансии ГК Альфа-Стафф.xlsx».

Запуск:  python tools/build_objects.py "путь/к/Вакансии ГК Альфа-Стафф.xlsx"
Результат: js/objects.js (AS.OBJECTS, AS.OFFICES) — сайт подхватит его сам.

Правила (решения заказчика):
- на сайт попадают только доступные объекты — видимые колонки видимых листов; лист «Минск» (Беларусь) не берём;
- объекты на паузе («стоп», «приостановлено», «набора нет» в названии) не показываем;
- не публикуем: судимость и проверку СБ, гражданство, требования к внешности, вычеты (спецодежда, медкнижка),
  служебные пометки для кураторов; пол и возраст показываем как требования вакансии;
- аванс — как в таблице.
"""
import json, re, sys, os, datetime
from urllib.parse import unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import xlsx_read

NB = ' '
CFG = json.load(open(os.path.join(HERE, 'objects.config.json'), encoding='utf-8'))

def key(s): return re.sub(r'\s+', ' ', s.replace('\n', ' ')).strip().lower()
def fmt(n): return f'{int(round(n)):,}'.replace(',', NB)
def first(o, *names):
    for n in names:
        for k, v in o['fields'].items():
            if k.lower().startswith(n.lower()): return v
    return []
def text(rows): return ' / '.join(rows).replace('\n', ' / ')
def plural(n, a, b, c):
    n = abs(n) % 100; m = n % 10
    return c if 10 < n < 20 else a if m == 1 else b if 1 < m < 5 else c

# ---------- профессии ----------
JOBS = [  # ключ (как в AS.PROFESSIONS), короткое название, полное, признак
    ('ВВШ', 'ВВШ', 'Водитель высотного штабелёра', r'штабел'),
    ('Комплектовщик', 'Комплектовщик', 'Комплектовщик', r'комплект|сборщик|сборка заказ'),
    ('Упаковщик', 'Упаковщик', 'Упаковщик', r'упаков'),
    ('Сортировщик', 'Сортировщик', 'Сортировщик', r'сортир'),
    ('Оператор возвратов', 'Оператор возвратов', 'Оператор приёма возвратов', r'возврат'),
    ('Стикеровщик', 'Фасовщик', 'Фасовщик / стикеровщик', r'стикер|маркиров|фасов'),
    ('Грузчик', 'Грузчик', 'Грузчик-разнорабочий', r'грузчик|разнорабоч|погруз|прессов'),
]
NOTES = re.compile(r'озвучив|рекомендац|как включится|принимаем на вахту|срок вахты любой|временная мера|местн|важно для|для штабелер|проверяем по базе|психиатр|набора нет|сообщу', re.I)
TRAIN = re.compile(r'стажировк|обучени|тест-драйв', re.I)

def jobs_of(o):
    src = text(first(o, 'Специальность'))
    for r in first(o, 'Вакансии', 'Ставка'):
        if NOTES.search(r) or TRAIN.search(r.split('|')[0]): continue
        src += ' / ' + re.sub(r'\([^)]*\)?', ' ', r.split('|')[0])
    out = []
    for k, short, full, rx in JOBS:
        if re.search(rx, src, re.I): out.append((k, short, full))
    return out

# ---------- ставки ----------
def amounts(s):
    """Суммы за смену в строке ставок."""
    s = s.replace('\xa0', ' ')
    vals = []
    for m in re.finditer(r'(\d[\d ]{2,6}?)\s*(?:р|руб)\.?\w*\s*(?:/\s*|за\s+|в\s+)?смен', s, re.I): vals.append(m.group(1))
    for m in re.finditer(r'100\s*%\s*[-–|]?\s*(\d[\d ]{2,6}?)\s*(?:р|руб)', s, re.I): vals.append(m.group(1))
    for m in re.finditer(r'(\d{4})\s*-\s*(\d{4})\s*(?:р|руб)', s, re.I): vals += [m.group(1), m.group(2)]
    for m in re.finditer(r'(?:сделка|до)\s*(\d)\s*тыс', s, re.I): vals.append(m.group(1) + '000')
    for m in re.finditer(r'(?:фикса?|ставка)\D{0,25}?(\d{4})\s*р', s, re.I): vals.append(m.group(1))
    for m in re.finditer(r'сделка\s*(\d{4})\s*р', s, re.I): vals.append(m.group(1))
    out = []
    for v in vals:
        n = int(re.sub(r'\D', '', v))
        if 1500 <= n <= 20000: out.append(n)
    return out

def rates_of(o):
    rows = [r for r in first(o, 'Вакансии', 'Ставка') if not NOTES.search(r)]
    main, train = [], []
    for r in rows:
        # в одной строке таблицы бывают две профессии — суммы относим к ближайшему названию слева
        is_train = False
        for cell in r.split(' | '):
            if re.search(r'[а-яё]{4}', cell, re.I) and not re.match(r'[\d\s%,.–-]', cell):
                is_train = bool(TRAIN.search(cell))
            (train if is_train else main).extend(amounts(cell))
    piece = any(re.search(r'сделк|%|выработ|производит', r, re.I) for r in rows)
    at100 = any(re.search(r'100\s*%', r) for r in rows)
    return main, train, piece, at100

def per_vakhta(o):
    t = text(first(o, 'Оплата за ВАХТУ'))
    t = re.sub(r'(\d+)\s*тыс', lambda m: m.group(1) + '000', t)
    nums = [int(re.sub(r'\D', '', m)) for m in re.findall(r'(\d[\d ]{4,7})', t)]
    nums = [n for n in nums if 30000 <= n <= 600000]
    return min(nums) if nums else None

# ---------- график, питание, жильё ----------
def shift_of(o):
    sched = text(first(o, 'График работы'))
    hours = text(first(o, 'Кол-во часов'))
    g = []
    for m in re.findall(r'\b([5-7]/[0-2])\b', sched):
        if m not in g: g.append(m)
    times = []
    for m in re.finditer(r'(\d{1,2})[:.]?(\d{2})?\s*(?:-?\s*до|-|–)\s*(\d{1,2})[:.]?(\d{2})?', sched + ' / ' + hours, re.I):
        a, b = int(m.group(1)), int(m.group(3))
        if a > 23 or b > 23: continue
        t = f'{a:02d}:{m.group(2) or "00"}–{b:02d}:{m.group(4) or "00"}'
        if t not in times: times.append(t)
    parts = []
    if g: parts.append('график ' + ' или '.join(g))
    if times: parts.append(('смены ' if len(times) > 1 else 'смена ') + ' и '.join(times))
    h = re.search(r'(\d{1,2})\s*час\w*\s*\+\s*(1 час обеда|перерыв\w*[^/]*|3 перерыва)', hours, re.I)
    if h: parts.append(re.sub(r'\s+', ' ', h.group(0)).replace('часов', 'ч').replace('1 час обеда', '1 ч на обед').strip())
    if re.search(r'день\s*/\s*ночь|день.{0,3}ночь', sched, re.I) and len(times) < 2: parts.append('день или ночь')
    full = ', '.join(parts)
    full = full[:1].upper() + full[1:]
    vk = text(first(o, 'Срок вахты'))
    opts = sorted({int(x) for x in re.findall(r'\b(\d{2})\b', vk) if 10 <= int(x) <= 90})
    return full, opts

def meals_of(o):
    t = text(first(o, 'ПИТАНИЕ'))
    if not t: return [], ''
    if re.search(r'нет питания', t, re.I): return ['Нет'], 'не предоставляется' + ('; есть столовая' if re.search(r'столов', t, re.I) else '')
    if re.search(r'3\s*раз', t): return ['3 раза'], 'трёхразовое, бесплатно'
    if re.search(r'2\s*раз', t): return ['Обед, ужин'], 'обед и ужин — бесплатно'
    if re.search(r'ланч', t, re.I): return ['Ланч-бокс'], 'обед (ланч-бокс) — бесплатно'
    return ['Обед'], 'обед — бесплатно'

def housing_of(o):
    t = text(first(o, 'Условия проживания'))
    if not t: return ''
    s = 'бесплатно'
    m = re.search(r'от\s*(\d+)\s*до\s*(\d+)\s*чел', t) or re.search(r'до\s*(\d+)\s*чел', t) or re.search(r'(\d+)\s*чел', t)
    if m:
        s += ', в комнате ' + (f'{m.group(1)}–{m.group(2)}' if m.lastindex == 2 else ('до ' if 'до' in m.group(0) else '') + m.group(1)) + ' человек'
    if re.search(r'бель', t, re.I): s += ', бельё бесплатно'
    if re.search(r'семейн', t, re.I): s += ', есть семейные комнаты'
    return s

def transport_of(o):
    t = text(first(o, 'Транспортировка'))
    mins = re.search(r'(\d{1,2}(?:\s*-\s*\d{1,2})?)\s*мин', t)
    mins = (' · ' + mins.group(1).replace(' ', '').replace('-', '–') + ' мин') if mins else ''
    if re.search(r'пеш|шагов', t, re.I): return 'пешком до объекта' + mins
    if re.search(r'корпоратив', t, re.I): return 'корпоративный транспорт до объекта' + mins
    return ''

def advance_of(o):
    t = text(first(o, 'Сумма аванса'))
    m = re.search(r'(\d[\d ]{2,6})\s*руб\w*\s*(после\s*\d+\s*отработанных\s*смен|каждую неделю)', t, re.I)
    if not m: return None, ''
    n = int(re.sub(r'\D', '', m.group(1)))
    return n, f'{fmt(n)} ₽ {m.group(2).lower()}'

def who_of(o):
    sex = text(first(o, 'ПОЛ'))
    s = 'мужчины и женщины' if re.search(r'муж', sex, re.I) and re.search(r'жен', sex, re.I) else 'мужчины' if re.search(r'муж', sex, re.I) else 'женщины' if re.search(r'жен', sex, re.I) else ''
    age = text(first(o, 'Возраст'))
    m = re.search(r'от\s*(\d{2})\s*до\s*(\d{2})', age) or re.search(r'до\s*(\d{2})', age)
    a = (f'{m.group(1)}–{m.group(2)} лет' if m.lastindex == 2 else f'до {m.group(1)} лет') if m else ''
    return ', '.join(x for x in (s, a) if x)

def training_of(o):
    t = text(first(o, 'Стажировка') + [r for r in first(o, 'Ставка', 'Вакансии') if re.search(r'обучени', r, re.I)])
    m = re.search(r'перв\w*\s*(\d|одн\w*|дв\w*)?\s*смен', t, re.I)
    if not m: return ''
    n = (m.group(1) or '').lower()
    two = n.startswith('дв') or n == '2'
    return ('Первые 2 смены' if two else 'Первая смена') + ' — обучение, не оплачивается'

def clean_addr(s):
    s = re.sub(r'\s*,\s*', ', ', s.replace('\n', ' ')).strip(' ,/')
    return re.sub(r'\s{2,}', ' ', s)

# ---------- сборка ----------
def build(path):
    raw = xlsx_read.read(path)
    regions = CFG['regions']
    objs, skipped, warn = [], [], []
    for r in raw:
        if r['stop']: skipped.append(f"{r['sheet']}: {r['name']} — на паузе"); continue
        c = CFG['objects'].get(key(r['name']), {})
        if not c: warn.append(f"нет записи в objects.config.json: {r['sheet']} / {r['name']!r}")
        jobs = jobs_of(r)
        main, train, piece, at100 = rates_of(r)
        vk = per_vakhta(r)
        shiftFull, opts = shift_of(r)
        meals, mealsFull = meals_of(r)
        adv, advText = advance_of(r)
        name1 = r['name'].replace('\n', ' ')
        o = {
            'id': c.get('id') or re.sub(r'[^a-z0-9]+', '-', key(name1).encode('ascii', 'ignore').decode()).strip('-') or 'obj-%d' % len(objs),
            'region': regions.get(r['sheet'], r['sheet']),
            'name': c.get('name', name1), 'short': c.get('short', name1), 'tag': c.get('tag', ''),
            'location': c.get('location', clean_addr(text(first(r, 'Территориальное')))[:80]),
            'address': c.get('address', clean_addr(text(first(r, 'Территориальное')))),
            'hostel': c.get('hostel', clean_addr(text(first(r, 'Адрес общежития')))),
            'jobs': [j[1] for j in jobs], 'jobsFull': [j[2] for j in jobs], 'jobKeys': [j[0] for j in jobs],
            'shift': '12 часов', 'shiftFull': shiftFull, 'vakhta': opts, 'minShifts': opts[0] if opts else None,
            'meals': meals or ['Уточняйте'], 'mealsFull': mealsFull,
            'housing': housing_of(r), 'transport': transport_of(r),
            'advance': adv, 'advanceText': advText,
            'who': who_of(r), 'training': training_of(r), 'piece': piece,
        }
        if 'geo' in c: o['geo'] = c['geo']
        else: warn.append(f"нет координат: {o['short']} — на сфере и карте его не будет")
        lo, hi = (min(main), max(main)) if main else (None, None)
        num = lambda v: int(re.sub(r'\D', '', v)) if v else None
        if 'rate' in c: lo = num(c['rate'])
        if c.get('rateMax'): hi = num(c['rateMax'])
        if not lo: warn.append(f'не нашёл ставку: {o["short"]} — задайте rate в objects.config.json')
        o['rate'] = fmt(lo) if lo else ''
        o['rateMax'] = fmt(hi) if hi and hi != lo else ''
        o['rateMin'] = lo or 0
        o['rateTop'] = hi or lo or 0
        # на карточке: «от 3 575 ₽»; если ставка одна и сдельная при 100% — «до 5 142 ₽»
        o['rateCard'] = (('от ' + o['rate']) if o['rateMax'] else (('до ' if piece and at100 else '') + o['rate'])) + ' ₽' if lo else ''
        if not lo: lead = ''
        elif hi and hi != lo: lead = f'От {fmt(lo)} до {fmt(hi)} ₽ за смену — ' + ('сдельно, зависит от профессии и выработки.' if piece else 'зависит от профессии.')
        elif piece and at100: lead = f'До {fmt(lo)} ₽ за смену при 100% выработки — оплата сдельная.'
        else: lead = f'{fmt(lo)} ₽ за смену' + (' — сдельно, по выработке.' if piece else ' — фиксированная ставка.')
        lead = c.get('payLead') or lead
        extra = []
        if o['training']: extra.append(o['training'] + '.')
        if c.get('vakhtaText'): extra.append(c['vakhtaText'])
        elif vk: extra.append(f'За вахту — от {fmt(vk)} ₽.')
        o['pay'] = ' '.join(x for x in [lead] + extra if x)
        if 'ВВШ' in o['jobKeys']:
            o['note'] = 'Водителю штабелёра — удостоверение тракториста-машиниста с отметкой «погрузчик».'
        for k in ('rateLines', 'note', 'shift', 'pay', 'shiftFull', 'rateCard', 'transport', 'housing', 'meals', 'mealsFull'):
            if k in c: o[k] = c[k]
        objs.append(o)
    # офисы — из листа «Адреса офисов»; координаты — из ссылки на карту
    offices = []
    for f in xlsx_read.offices(path):
        u = unquote(f['map']); geo = None
        m = re.search(r'!3d(-?[\d.]+)!4d(-?[\d.]+)', u) or re.search(r'@(-?[\d.]+),(-?[\d.]+)', u)
        if m: geo = [round(float(m.group(1)), 4), round(float(m.group(2)), 4)]
        m2 = re.search(r'll=(-?[\d.]+),(-?[\d.]+)', u)
        if m2: geo = [round(float(m2.group(2)), 4), round(float(m2.group(1)), 4)]
        city = f['city'].strip().title().replace('Самарская Область П.Кинель', 'Кинель')
        kind = 'hq' if city == 'Москва' else 'stay' if re.search(r'хостел|гостиниц', f['address'] + f['how'], re.I) and not re.search(r'офис', f['how'], re.I) else 'office'
        hours = re.sub(r'[^\w\s:.,()·–—-]', '', f['hours'].replace('\n', ' · ')).strip()
        offices.append({'city': city, 'address': clean_addr(f['address']), 'hours': hours, 'geo': geo, 'kind': kind})
    offices += CFG.get('extraOffices', [])
    return objs, offices, skipped, warn

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(r'~/Downloads/Вакансии ГК Альфа-Стафф.xlsx')
    objs, offices, skipped, warn = build(path)
    stamp = datetime.date.today().strftime('%d.%m.%Y')
    js = ('/* Сгенерировано tools/build_objects.py из «%s» (%s). Вручную не править —\n'
          '   обновите таблицу и запустите скрипт ещё раз. Подписи и координаты — tools/objects.config.json. */\n'
          'window.AS = window.AS || {};\nAS.CATALOG_DATE = %s;\nAS.OBJECTS = %s;\nAS.OFFICES = %s;\n') % (
        os.path.basename(path), stamp, json.dumps(stamp), json.dumps(objs, ensure_ascii=False, indent=1), json.dumps(offices, ensure_ascii=False, indent=1))
    open(os.path.join(ROOT, 'js', 'objects.js'), 'w', encoding='utf-8').write(js)
    by = {}
    for o in objs: by[o['region']] = by.get(o['region'], 0) + 1
    print(f'объектов: {len(objs)}', by)
    print('офисов:', len(offices), [o['city'] for o in offices])
    for s in skipped: print('  пропущен:', s)
    for w in warn: print('  ВНИМАНИЕ:', w)

if __name__ == '__main__':
    main()
