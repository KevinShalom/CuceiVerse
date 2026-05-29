<#
.SYNOPSIS
    Installs and configures nitro-assets and nitro-imager for native Windows execution.
#>

$ErrorActionPreference = "Stop"

$ASSETS_REPO = "https://github.com/sphynxkitten/nitro-assets.git"
$ASSETS_BRANCH = "master"
$IMAGER_REPO = "https://github.com/billsonnn/nitro-imager.git"

$RootDir = (Get-Location).Path
$DataDir = Join-Path $RootDir "data"
$NitroAssetsDir = Join-Path $DataDir "nitro-assets"
$AssetsCombinedDir = Join-Path $DataDir "assets"
$GamedataJsonDir = Join-Path $NitroAssetsDir "gamedata\json"

# 1. Create Directories
Write-Host "[init_native] Creating directories..." -ForegroundColor Cyan
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
if (-not (Test-Path $GamedataJsonDir)) { New-Item -ItemType Directory -Path $GamedataJsonDir -Force | Out-Null }

# 2. Clone or Update Assets
if (-not (Test-Path (Join-Path $NitroAssetsDir ".git"))) {
    Write-Host "[init_native] Cloning nitro-assets from $ASSETS_REPO..." -ForegroundColor Cyan
    if (Test-Path $NitroAssetsDir) { Remove-Item -Recurse -Force $NitroAssetsDir }
    git clone --depth 1 --branch $ASSETS_BRANCH $ASSETS_REPO $NitroAssetsDir
} else {
    Write-Host "[init_native] nitro-assets already exists. Fetching updates..." -ForegroundColor Cyan
    Push-Location $NitroAssetsDir
    git fetch --depth 1 origin $ASSETS_BRANCH
    git reset --hard "origin/$ASSETS_BRANCH"
    Pop-Location
}

# 3. Combine .nitro files (Clothes + Effects)
Write-Host "[init_native] Combining .nitro files into $AssetsCombinedDir..." -ForegroundColor Cyan
if (Test-Path $AssetsCombinedDir) { Remove-Item -Recurse -Force $AssetsCombinedDir }
New-Item -ItemType Directory -Path $AssetsCombinedDir | Out-Null

$clothesDir = Join-Path $NitroAssetsDir "clothes"
$effectsDir = Join-Path $NitroAssetsDir "effects"

if (Test-Path $clothesDir) {
    Get-ChildItem -Path $clothesDir -Filter "*.nitro" -Recurse | Copy-Item -Destination $AssetsCombinedDir -Force
}
if (Test-Path $effectsDir) {
    Get-ChildItem -Path $effectsDir -Filter "*.nitro" -Recurse | Copy-Item -Destination $AssetsCombinedDir -Force
}

# 4. Copy JSON Files
Write-Host "[init_native] Copying JSON config files..." -ForegroundColor Cyan
$clothesJson = Join-Path $clothesDir "json"
$effectsJson = Join-Path $effectsDir "json"

if (Test-Path (Join-Path $clothesJson "FigureData.json")) { Copy-Item (Join-Path $clothesJson "FigureData.json") -Destination $GamedataJsonDir -Force }
if (Test-Path (Join-Path $clothesJson "FigureMap.json")) { Copy-Item (Join-Path $clothesJson "FigureMap.json") -Destination $GamedataJsonDir -Force }
if (Test-Path (Join-Path $effectsJson "EffectMap.json")) { Copy-Item (Join-Path $effectsJson "EffectMap.json") -Destination $GamedataJsonDir -Force }

# 5. Run optimize.js
Write-Host "[init_native] Running optimize.js to prune assets..." -ForegroundColor Cyan
Push-Location (Join-Path $RootDir "assets-init")
node optimize.js
Pop-Location

# 6. Setup Imager
Write-Host "[init_native] Setting up nitro-imager..." -ForegroundColor Cyan
$ImagerDir = Join-Path $RootDir "imager"
if (-not (Test-Path $ImagerDir)) { New-Item -ItemType Directory -Path $ImagerDir | Out-Null }

if (-not (Test-Path (Join-Path $ImagerDir ".git"))) {
    Write-Host "[init_native] Cloning nitro-imager..." -ForegroundColor Cyan
    git clone --depth 1 $IMAGER_REPO $ImagerDir
}

Push-Location $ImagerDir
Write-Host "[init_native] Installing imager dependencies (requires windows-build-tools/canvas support)..." -ForegroundColor Yellow
npm install
Write-Host "[init_native] Building imager..." -ForegroundColor Cyan
npm run build
Pop-Location

Write-Host "[init_native] Native setup completed successfully!" -ForegroundColor Green
