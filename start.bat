@echo off
chcp 65001 > nul
title Estudio de Mercado Educativo
echo.
echo  ============================================================
echo   ESTUDIO DE MERCADO EDUCATIVO — Iniciando...
echo  ============================================================
echo.
echo  Abriendo http://localhost:8090 en el navegador...
timeout /t 2 /nobreak > nul
start "" "http://localhost:8090"
echo.
python "%~dp0server.py"
pause
