"""Данные калькулятора вахты из таблицы «Вакансии ГК Альфа-Стафф.xlsx».

Запуск:  python tools/build_calc.py "путь/к/Вакансии ГК Альфа-Стафф.xlsx"
Результат: js/calc-data.js (AS.CALC) — его читает только калькулятор (js/calc-modal.js).
Один источник: объект, его название, регион и условия (кто нужен, график, вахта, питание, жильё, дорога, аванс, пометка
о старте) берутся из сборки каталога tools/build_objects.py — те же, что в карточках, на карте и на сфере (js/objects.js).
Здесь — только ставки по должностям (tools/calc.config.json) и обучение. Регионы — AS.REGIONS (js/data.js).

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
    k = B.cfg_key(name, CFG['objects'])
    return (k, CFG['objects'][k]) if k else (B.key(name), None)

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
    cat, _, _, _ = B.build(path)
    by = {o['_key']: o for o in cat}
    objs, warn = [], []
    for r in xlsx_read.read(path):
        if r['sheet'] in B.CFG.get('skipSheets', []): continue
        if r['stop']: warn.append(f"на паузе, пропущен: {r['name']!r}"); continue
        k, c = cfg_for(r['name'])
        if not c: warn.append(f"нет ставок в calc.config.json: {r['sheet']} / {k!r} — в калькулятор не попал"); continue
        co = by.get(B.cfg_key(r['name'], B.CFG['objects']) or B.key(r['name']))
        if not co: warn.append(f"{k!r} нет в каталоге (tools/objects.config.json) — в калькулятор не попал"); continue
        # сверка цифр конфига с текстом ставок в таблице
        src = ' / '.join(B.first(r, 'Вакансии', 'Ставка', 'Оплата за ВАХТУ'))
        have = nums(src)
        for p in c['positions']:
            miss = [n for n in p.get('check', []) if n not in have]
            if miss: warn.append(f"{k}: в таблице нет чисел {miss} — проверьте ставку «{p['text']}»")
        jobs = []
        for p in c['positions']:
            for j in p['jobs']:
                if j not in jobs: jobs.append(j)
        # карточка и калькулятор не должны расходиться: профессии те же, ставки калькулятора — в вилке карточки
        cj = sorted({j for p in c['positions'] for j in p['jobs']})
        if cj != sorted(co['jobsFull']): warn.append(f"{co['id']}: профессии в карточке {sorted(co['jobsFull'])} ≠ в калькуляторе {cj}")
        for p in c['positions']:
            if co.get('rateMin') and not (co['rateMin'] <= p['rate'] <= co['rateTop']):
                warn.append(f"{co['id']}: ставка калькулятора {p['rate']} вне вилки карточки {co['rateMin']}–{co['rateTop']} ({p['text']})")
        # общее с карточкой — из каталога, как есть; своё у калькулятора — ставки, обучение, часы смены
        o = {x: co.get(x) for x in ('id', 'region', 'short', 'tag', 'who', 'shiftFull', 'vakhta', 'minShifts',
                                    'mealsFull', 'mealPay', 'mealTimes', 'transport', 'housing', 'advance', 'advanceText')}
        o.update({
            'note': co.get('start', ''), 'schedTBD': bool(c.get('schedTBD')),
            'training': training(r), 'hours': c.get('hours', 11),
            'jobsFull': jobs,
            'positions': [position(p) for p in c['positions']],
        })
        objs.append(o)
    return objs, warn

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(r'~/Downloads/Вакансии ГК Альфа-Стафф.xlsx')
    objs, warn = build(path)
    stamp = datetime.date.today().strftime('%d.%m.%Y')
    js = ('/* Сгенерировано tools/build_calc.py из «%s» (%s). Вручную не править — обновите таблицу\n'
          '   и запустите скрипт ещё раз; ставки по должностям — tools/calc.config.json. Читает только калькулятор. */\n'
          'window.AS = window.AS || {};\nAS.CALC = %s;\n') % (
        os.path.basename(path), stamp, json.dumps({'date': stamp, 'objects': objs}, ensure_ascii=False, indent=1))
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
