"""Шифрует данные страницы «Контроль звонков» (calls.html) общим паролем — js/calls-data.enc.js.

Запуск:  python tools/encrypt_calls.py <данные.json> --password-file <файл с паролем>
         (или пароль в переменной окружения CALLS_PASSWORD)
Открытые данные лежат вне сайта; на сайт попадает только зашифрованный файл, поэтому страница закрыта на любом
хостинге. Схема: ключ из пароля — PBKDF2-SHA256 (600 000 итераций, случайная соль 16 байт), шифр — AES-256-GCM
(случайный IV 12 байт). Браузер расшифровывает через WebCrypto (js/calls.js); WebCrypto работает только по HTTPS
и на localhost. Новый пароль или новые данные — запустить скрипт заново и пересобрать страницу.
"""
import argparse, base64, io, json, os, secrets, sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'js', 'calls-data.enc.js')
ITER = 600000

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('data', help='открытые данные страницы, JSON')
    ap.add_argument('--password-file', help='файл, пароль — первая строка')
    args = ap.parse_args()
    password = (io.open(args.password_file, encoding='utf-8').readline().strip() if args.password_file
                else os.environ.get('CALLS_PASSWORD', ''))
    if len(password) < 12: sys.exit('пароль короче 12 символов — его легко подобрать')
    plain = io.open(args.data, encoding='utf-8').read().encode('utf-8')
    json.loads(plain)   # проверка: это JSON, а не что-то другое
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode('utf-8'))
    data = AESGCM(key).encrypt(iv, plain, None)
    b64 = lambda b: base64.b64encode(b).decode('ascii')
    box = {'v': 1, 'kdf': 'PBKDF2-SHA256', 'iter': ITER, 'salt': b64(salt), 'iv': b64(iv), 'data': b64(data)}
    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(
        '/* Данные страницы «Контроль звонков» — зашифрованы общим паролем (tools/encrypt_calls.py). Вручную не править. */\n'
        'window.AS_CALLS_ENC = ' + json.dumps(box, separators=(',', ':')) + ';\n')
    print('js/calls-data.enc.js: %d КБ данных зашифровано' % (len(plain) // 1024))

if __name__ == '__main__':
    main()
