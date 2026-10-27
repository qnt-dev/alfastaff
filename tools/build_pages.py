"""Отдельные страницы сайта из каркаса главной: objects.html («Объекты и профессии») и business.html («Бизнесу»).

Запуск:  python tools/build_pages.py              — все страницы
         python tools/build_pages.py objects.html — только указанные
Источник каркаса — index.html: шапка с меню, чат, подвал, окно калькулятора, SVG-символы и скрипты берутся оттуда как есть,
поэтому правки меню, подвала и калькулятора на главной переходят на страницы при следующей сборке (запускать после
любого изменения index.html). Содержимое страницы — tools/pages/<страница>.main.html; строка «<!-- include: id -->»
подставляет секцию с этим id из index.html (форма заявки — одна на всех страницах).
На странице: свои заголовок и описание, номера разделов (АС® — 01…) подряд, ссылки на разделы главной ведут на index.html#…,
пункт меню текущей страницы отмечен. objects.html и business.html вручную не править.
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
PAGES = {
    'objects.html': dict(
        main='objects.main.html', key='objects',
        title='Объекты и профессии — работа вахтой | Альфа-Стафф',
        desc='Склады маркетплейсов и производства в Москве и регионах: условия, ставки, жильё и питание по каждому объекту. '
             'Выберите регион и профессию — покажем подходящие вахты.'),
    'business.html': dict(
        main='business.main.html', key='business',
        title='Персонал для складов и производств — Альфа-Стафф для бизнеса',
        desc='Аутстаффинг, рекрутинг, лизинг персонала и аутсорсинг для складов и производств. '
             'Оформление по закону РФ, документы и выплаты — на нас.'),
}

def section(src, sid):
    """Секция <section … id="sid"> из index.html целиком (по вложенности <section>)."""
    m = re.search(r'<section\b[^>]*\bid="%s"[^>]*>' % re.escape(sid), src)
    if not m: sys.exit('в index.html нет секции id="%s"' % sid)
    depth = 0
    for t in re.finditer(r'<(/?)section\b[^>]*>', src[m.start():]):
        depth += -1 if t.group(1) else 1
        if depth == 0: return src[m.start():m.start() + t.end()]

def build(name, cfg, index):
    body = io.open(os.path.join(HERE, 'pages', cfg['main']), encoding='utf-8').read().replace('\r\n', '\n')
    body = re.sub(r'\A<!--.*?-->\n', '', body, flags=re.S)   # пояснение к заготовке — не на страницу
    body = re.sub(r'<!-- include: ([\w-]+) -->', lambda m: section(index, m.group(1)), body)
    a, b = index.index('<main id="main">') + len('<main id="main">'), index.index('</main>')
    html = index[:a] + '\n' + body.rstrip('\n') + '\n  ' + index[b:]
    # номера разделов на этой странице — подряд
    n = [0]
    def num(m): n[0] += 1; return 'kicker__idx">(АС® — %02d)' % n[0]
    m_a, m_b = html.index('<main id="main">'), html.index('</main>')
    html = html[:m_a] + re.sub(r'kicker__idx">\(АС® — \d\d\)', num, html[m_a:m_b]) + html[m_b:]
    # заголовок, описание, превью для соцсетей
    html = re.sub(r'<title>.*?</title>', '<title>%s</title>' % cfg['title'], html, count=1)
    html = re.sub(r'(<meta name="description" content=")[^"]*', lambda m: m.group(1) + cfg['desc'], html, count=1)
    html = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + cfg['title'], html, count=1)
    html = re.sub(r'(<meta property="og:description" content=")[^"]*', lambda m: m.group(1) + cfg['desc'], html, count=1)
    if cfg.get('robots'):   # внутренние страницы — не для поиска
        html = re.sub(r'(<meta name="description" content="[^"]*">)', lambda m: m.group(1) + '\n  <meta name="robots" content="%s">' % cfg['robots'], html, count=1)
    if cfg.get('head'):     # свои стили страницы — после общих
        html = html.replace('</head>', '  %s\n</head>' % cfg['head'], 1)
    html = html.replace('<html lang="ru"', '<html lang="ru" data-page="%s"' % cfg['key'], 1)
    html = html.replace('<!doctype html>\n', '<!doctype html>\n<!-- Страница собрана tools/build_pages.py из index.html и tools/pages/%s — вручную не править. -->\n' % cfg['main'], 1)
    # ссылки на разделы, которых на этой странице нет, — на главную; «наверх» — к началу содержимого
    ids = set(re.findall(r'\bid="([^"]+)"', html))
    def link(m):
        k = m.group(2)
        if k == 'top': return m.group(1) + '#main"'
        if k in ids or k in ('calculator',) or k.startswith('step-'): return m.group(0)
        return m.group(1) + 'index.html#' + k + '"'
    html = re.sub(r'(<a\b[^>]*?\bhref=")#([\w-]+)"', link, html)
    html = re.sub(r'(<a\b[^>]*?\bhref=")index\.html#top"', r'\1#main"', html)
    # ссылки на эту же страницу в меню и подвале: business.html#step-2 → #step-2 (без перезагрузки), пункт меню — текущий
    html = html.replace('href="%s#' % name, 'href="#')
    html = re.sub(r'(<a\b[^>]*?\bhref="%s")' % re.escape(name), r'\1 aria-current="page"', html)
    # проверки: всё подставлено, id не повторяются
    if '<!-- include:' in html: sys.exit('%s: не подставлена секция' % name)
    dup = sorted({i for i in re.findall(r'\bid="([^"]+)"', html) if re.findall(r'\bid="%s"' % re.escape(i), html).__len__() > 1})
    if dup: sys.exit('%s: повторяются id %s' % (name, dup))
    io.open(os.path.join(ROOT, name), 'w', encoding='utf-8', newline='\n').write(html)
    print('%-14s разделов %d, строк %d' % (name, n[0], html.count('\n')))

def main():
    index = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read().replace('\r\n', '\n')
    names = sys.argv[1:] or list(PAGES)   # python tools/build_pages.py objects.html — только одна страница
    unknown = [n for n in names if n not in PAGES]
    if unknown: sys.exit('нет таких страниц: %s' % ', '.join(unknown))
    for name in names: build(name, PAGES[name], index)

if __name__ == '__main__':
    main()
