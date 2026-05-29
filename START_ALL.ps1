# START_ALL.ps1 - Inicia todos los servicios y espera a que esten listos
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$ports = @(3000, 3001, 3030, 5173, 8020)

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   INICIANDO ECOSISTEMA CUCEIVERSE + HABBO" -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Limpieza preventiva (opcional pero recomendada)
# Write-Host "[!] Limpiando procesos previos..." -ForegroundColor Gray
# & "$ROOT\STOP_ALL.ps1" | Out-Null

# 2. Definicion de servicios
$services = @(
    @{ Name = "Horarios API (Python)"; Path = "$ROOT\CuceiVerse WEB\cuceiverse-backend\horarios-api"; Command = "python"; Args = "-m uvicorn main:app --port 8020"; Port = 8020 },
    @{ Name = "Backend NestJS"; Path = "$ROOT\CuceiVerse WEB\cuceiverse-backend"; Command = "npm"; Args = "run dev"; Port = 3001 },
    @{ Name = "Frontend React"; Path = "$ROOT\CuceiVerse WEB\cuceiverse-web"; Command = "npm"; Args = "run dev"; Port = 5173 },
    @{ Name = "Habbo Imager"; Path = "$ROOT\habbo-avatar-generator\imager"; Command = "npm"; Args = "run start"; Port = 3030 },
    @{ Name = "Habbo Web UI"; Path = "$ROOT\habbo-avatar-generator\web"; Command = "npm"; Args = "run dev"; Port = 3000 }
)

# 3. Lanzamiento
foreach ($s in $services) {
    Write-Host "[+] Lanzando $($s.Name)..." -ForegroundColor Cyan
    Start-Process cmd -ArgumentList "/c $($s.Command) $($s.Args)" -WorkingDirectory $s.Path -WindowStyle Hidden
}

Write-Host "`n[i] Esperando a que los servicios despierten..." -ForegroundColor Gray
Write-Host "[i] Esto puede tardar hasta 1 minuto (especialmente el Backend)." -ForegroundColor Gray

# 4. Verificacion de puertos
$timeout = 120 # 2 minutos maximo
$start = Get-Date
$readyPorts = @()

while ($readyPorts.Count -lt $ports.Count -and (Get-Date) -lt $start.AddSeconds($timeout)) {
    foreach ($p in $ports) {
        if ($readyPorts -notcontains $p) {
            if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
                $readyPorts += $p
                Write-Host "  [OK] Puerto $p listo!" -ForegroundColor Green
            }
        }
    }
    if ($readyPorts.Count -lt $ports.Count) {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 2
    }
}

Write-Host "`n======================================================" -ForegroundColor Cyan
if ($readyPorts.Count -eq $ports.Count) {
    Write-Host "   ¡TODO LISTO! Ya puedes usar la aplicacion." -ForegroundColor Green
    Write-Host "   - CuceiVerse: http://localhost:5173" -ForegroundColor Green
    Write-Host "   - Habbo Avatares: http://localhost:5173/avatars" -ForegroundColor Green
} else {
    Write-Host "   [!] Algunos servicios tardaron demasiado en iniciar." -ForegroundColor Red
    Write-Host "   Revisa si hay errores en las carpetas correspondientes." -ForegroundColor Red
}
Write-Host "======================================================" -ForegroundColor Cyan

Write-Host "Esta ventana se cerrara en 10 segundos..."
Start-Sleep -Seconds 10
