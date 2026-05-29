@echo off
title INICIANDO CUCEIVERSE...
echo ======================================================
echo    INICIANDO TODOS LOS SERVICIOS (CUCEIVERSE + HABBO)
echo ======================================================
powershell -ExecutionPolicy Bypass -File "%~dp0START_ALL.ps1"
exit
