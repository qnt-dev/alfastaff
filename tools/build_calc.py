"""Данные калькулятора вахты из таблицы «Вакансии ГК Альфа-Стафф.xlsx».

Запуск:  python tools/build_calc.py "путь/к/Вакансии ГК Альфа-Стафф.xlsx"
Результат: js/calc-data.js (AS.CALC) — его читает только калькулятор (js/calc-modal.js);
карточки, карта и сфера по-прежнему берут объекты из js/objects.js (tools/build_objects.py).

Правила (решения заказчика):
- только актуальные объекты — видимые листы и видимые колонки; скрытые листы не читаем; Минск и служебные листы не берём;
- сдельная оплата — по ставке при 100 % выработке; где 100 % не указано — по цифре из условий объекта;
- оплачиваемая стажировка — по своей ставке; первая смена обучения не оплачивается и (если так в таблице)
  не входит в срок вахты;
- ставки по должностям — в tools/calc.config.json; скрипт сверяет их с текстом таблицы и предупреждает о расхождениях.
"""
import json, re, sys, os, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import xlsx_read
import build_objects as B

CFG = json.load(open(os.path.join(HERE, 'calc.config.json'), encoding='utf-8'))
OCFG = json.load(open(os.path.join(HERE, 'objects.config.json'), encoding='utf-8'))['objects']

def training(o):
    """Обучение: сколько первых смен не оплачивается и входят ли они в срок вахты."""
    rows = B.first(o, 'Стажировка') + [r for r in B.first(o, 'Ставка', 'Вакансии') if re.search(r'обучени', r, re.I)]
    t = ' / '.join(rows).replace('\n', ' ')
    m = re.search(r'перв\w*\s*(\d|одн\w*|дв\w*)?\s*(\d)?\s*смен', t, re.I)
    if not m: return {'unpaid': 0, 'counted': True}
    n = (m.group(1) or '').lower()
    unpaid = 2 if n.startswith('дв') or n == '2' else 1
    counted = not re.search(r'в\s*срок\s*вахты\s*не\s*(учитыва|входит)', t, re.I)
    return {'unpaid': unpaid, 'counted': counted}

def nums(text):
    t = text.replace('\xa0', ' ')
    t = re.sub(r'(\d)\s*тыс', lambda m: m.group(1) + '000', t)
    return {int(re.sub(r'\D', '', x)) for x in re.findall(r'\d[\d ]{2,6}\d|\d{3,}', t)}

def cfg_for(name):
    k = B.key(name)
    if k in CFG['objects']: return k, CFG['objects'][k]
    for ck, c in CFG['objects'].items():
        if k.startswith(ck): return ck, c
    return k, None

def position(p):
    """Должность для калькулятора; у сдельной — вторая ставка выше нормы (при highPct % или верхняя цифра вилки)."""
    out = {x: p[x] for x in ('jobs', 'rate', 'basis', 'text', 'sex', 'intern') if x in p}
    h = p.get('high')
    if h:
        pct = CFG.get('highPct', 150)
        out['high'] = ({'rate': int(round(h.get('base', 0) + h['per'] * pct)), 'label': f'при {pct} % выработке'} if 'per' in h
                       else {'rate': h['rate'], 'label': 'при высокой выработке'})
    return out

def build(path):
    regions = {r['sheet']: r for r in CFG['regions']}
    objs, warn = [], []
    for r in xlsx_read.read(path):
        if r['sheet'] in CFG['skipSheets'] or r['sheet'] not in regions: continue
        if r['stop']: warn.append(f"на паузе, пропущен: {r['name']!r}"); continue
        k, c = cfg_for(r['name'])
        if not c: warn.append(f"нет ставок в calc.config.json: {r['sheet']} / {k!r} — в калькулятор не попал"); continue
        oc = OCFG.get(k, {})
        # сверка цифр конфига с текстом ставок в таблице
        src = ' / '.join(B.first(r, 'Вакансии', 'Ставка', 'Оплата за ВАХТУ'))
        have = nums(src)
        for p in c['positions']:
            miss = [n for n in p.get('check', []) if n not in have]
            if miss: warn.append(f"{k}: в таблице нет чисел {miss} — проверьте ставку «{p['text']}»")
        sf, opts = B.shift_of(r)
        meals, mealsFull = B.meals_of(r)
        # питание: сколько раз в день и сколько за него удерживают (Форум-Авто: «3 раз в день, вычет за питание 200 р/день»)
        mt = B.text(B.first(r, 'ПИТАНИЕ'))
        mpay = re.search(r'вычет\w*\s*за\s*питание\D{0,5}(\d+)', mt, re.I)
        mtimes = re.search(r'(\d)\s*раз\w*\s*в\s*день', mt, re.I)
        mealPay, mealTimes = (int(mpay.group(1)) if mpay else 0), (int(mtimes.group(1)) if mtimes else 0)
        if mealPay: mealsFull = (f'{mealTimes} раза в день' if mealTimes > 1 else 'питание') + f', {mealPay} ₽ в день'
        adv, advText = B.advance_of(r)
        jobs = []
        for p in c['positions']:
            for j in p['jobs']:
                if j not in jobs: jobs.append(j)
        o = {
            'id': c.get('id') or oc.get('id') or re.sub(r'[^a-z0-9]+', '-', k.encode('ascii', 'ignore').decode()).strip('-'),
            'region': regions[r['sheet']]['key'],
            'short': c.get('short') or oc.get('short') or r['name'].strip(),
            'tag': c.get('tag') or oc.get('tag', ''),
            'note': c.get('note', ''),
            'who': B.who_of(r), 'shiftFull': sf, 'schedTBD': bool(c.get('schedTBD')),
            'vakhta': opts, 'minShifts': opts[0] if opts else None,
            'mealsFull': mealsFull, 'mealPay': mealPay, 'mealTimes': mealTimes, 'transport': B.transport_of(r), 'housing': B.housing_of(r),
            'advance': adv, 'advanceText': advText,
            'training': training(r), 'hours': c.get('hours', 11),
            'jobsFull': jobs,
            'positions': [position(p) for p in c['positions']],
        }
        objs.append(o)
    return objs, warn

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(r'~/Downloads/Вакансии ГК Альфа-Стафф.xlsx')
    objs, warn = build(path)
    present = {o['region'] for o in objs}
    regions = [{x: r[x] for x in ('key', 'label', 'in')} for r in CFG['regions'] if r['key'] in present]
    stamp = datetime.date.today().strftime('%d.%m.%Y')
    js = ('/* Сгенерировано tools/build_calc.py из «%s» (%s). Вручную не править — обновите таблицу\n'
          '   и запустите скрипт ещё раз; ставки по должностям — tools/calc.config.json. Читает только калькулятор. */\n'
          'window.AS = window.AS || {};\nAS.CALC = %s;\n') % (
        os.path.basename(path), stamp, json.dumps({'date': stamp, 'regions': regions, 'objects': objs}, ensure_ascii=False, indent=1))
    open(os.path.join(ROOT, 'js', 'calc-data.js'), 'w', encoding='utf-8', newline='\n').write(js)
    by = {}
    for o in objs: by[o['region']] = by.get(o['region'], 0) + 1
    print(f'объектов в калькуляторе: {len(objs)}', by)
    for o in objs:
        t = o['training']
        print(f"  {o['id']:20} {o['short'][:28]:28} обучение {t['unpaid']} {'в срок' if t['counted'] else 'сверх срока'} | " +
              '; '.join(f"{'/'.join(p['jobs'])[:30]} {p['rate']} ({p['basis']}{', стаж ' + str(p['intern']['shifts']) + '×' + str(p['intern']['rate']) if p.get('intern') else ''})" for p in o['positions']))
    for w in warn: print('  ВНИМАНИЕ:', w)

if __name__ == '__main__':
    main()
