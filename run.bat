@echo off
rem Альфа-Стафф · локальный запуск сайта
cd /d "%~dp0"
start "" http://localhost:8090/
python -m http.server 8090 --bind 127.0.0.1
