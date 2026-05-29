@echo off
setlocal
cd /d "%~dp0"

echo [1/3] Checking initialization...
if not exist "data\assets\" (
    echo Formatting and downloading assets for the first time...
    powershell -ExecutionPolicy Bypass -File .\init_native.ps1
) else (
    echo Assets found. Skipping init.
)

echo [2/3] Lanzando Imager API (Oculto en Puerto 3030)...
powershell -Command "Start-Process npm -ArgumentList 'start' -WorkingDirectory 'imager' -WindowStyle Hidden"

echo [3/3] Lanzando Web UI (Oculto en Puerto 3000)...
powershell -Command "Start-Process npm -ArgumentList 'run dev' -WorkingDirectory 'web' -WindowStyle Hidden"

echo Servicios de Habbo lanzados en segundo plano.
