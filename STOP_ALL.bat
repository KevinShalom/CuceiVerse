@echo off
title STOP ALL CUCEIVERSE SERVICES
echo ======================================================
echo    DETENIENDO TODOS LOS SERVICIOS (Limpia Puertos)
echo ======================================================

powershell -ExecutionPolicy Bypass -File "%~dp0STOP_ALL.ps1"

echo ======================================================
echo    PROCESOS FINALIZADOS
echo ======================================================
pause
