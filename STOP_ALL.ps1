# Script para apagar todos los servicios de CuceiVerse y Habbo por puerto
$ports = @(3000, 3001, 3030, 5173, 5174, 5175, 8020)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   APAGANDO TODOS LOS SERVICIOS DE CUCEIVERSE" -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan

foreach ($port in $ports) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -ne 0 }
    if ($processes) {
        foreach ($procId in $processes) {
            $pName = (Get-Process -Id $procId).Name
            Write-Host "[-] Cerrando proceso $pName (PID: $procId) en puerto $port..." -ForegroundColor Gray
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   TODOS LOS SERVICIOS HAN SIDO DETENIDOS" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan
