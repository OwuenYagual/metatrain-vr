$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$dependencyStamp = Join-Path $projectRoot 'node_modules\.metatrain-lock-hash'
$lockFile = Join-Path $projectRoot 'package-lock.json'
$environmentFile = Join-Path $projectRoot '.env'
$environmentExample = Join-Path $projectRoot '.env.example'

Set-Location $projectRoot

function Stop-WithMessage {
    param([string]$Message)

    Write-Host ''
    Write-Host $Message -ForegroundColor Red
    exit 1
}

Write-Host 'MetaTrain VR - Inicio local' -ForegroundColor Cyan
Write-Host "Proyecto: $projectRoot"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'Node.js no esta instalado o no se encuentra en PATH. Instala Node.js 22.13 o superior y vuelve a ejecutar INICIAR.cmd.'
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Stop-WithMessage 'npm no esta instalado o no se encuentra en PATH. Reinstala Node.js y vuelve a intentarlo.'
}

$nodeVersionText = (& node.exe --version).Trim().TrimStart('v')
try {
    $nodeVersion = [version]$nodeVersionText
} catch {
    Stop-WithMessage "No se pudo reconocer la version de Node.js: $nodeVersionText"
}

if ($nodeVersion -lt [version]'22.13.0') {
    Stop-WithMessage "La version instalada de Node.js es $nodeVersionText. Se requiere Node.js 22.13 o superior."
}

if (-not (Test-Path -LiteralPath $lockFile)) {
    Stop-WithMessage 'No se encontro package-lock.json. Verifica que INICIAR.cmd este dentro de la carpeta completa del proyecto.'
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
    if (-not (Test-Path -LiteralPath $environmentExample)) {
        Stop-WithMessage 'No se encontraron .env ni .env.example.'
    }

    Copy-Item -LiteralPath $environmentExample -Destination $environmentFile
    Write-Host 'Se creo .env usando la configuracion local predeterminada.' -ForegroundColor Yellow
}

$lockHash = (Get-FileHash -LiteralPath $lockFile -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $dependencyStamp) {
    (Get-Content -LiteralPath $dependencyStamp -Raw).Trim()
} else {
    ''
}

if ($installedHash -ne $lockHash) {
    Write-Host 'Instalando dependencias. Esto puede tardar varios minutos...' -ForegroundColor Yellow
    & npm.cmd ci
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'npm ci fallo. Cierra otras terminales de MetaTrain VR y vuelve a ejecutar INICIAR.cmd.'
    }

    Set-Content -LiteralPath $dependencyStamp -Value $lockHash -NoNewline
} else {
    Write-Host 'Las dependencias ya estan instaladas.' -ForegroundColor Green
}

Write-Host 'Comprobando MongoDB y preparando los datos iniciales...' -ForegroundColor Yellow
& npm.cmd run seed
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage 'No fue posible conectar con MongoDB. Inicia MongoDB, revisa MONGO_URI en .env y vuelve a intentarlo.'
}

Write-Host 'Abriendo backend y frontend en ventanas separadas...' -ForegroundColor Green

$backend = Start-Process powershell.exe -WorkingDirectory $projectRoot -ArgumentList @(
    '-NoExit',
    '-NoProfile',
    '-Command',
    '& npm.cmd run dev:backend'
) -PassThru

try {
    Start-Process powershell.exe -WorkingDirectory $projectRoot -ArgumentList @(
        '-NoExit',
        '-NoProfile',
        '-Command',
        '& npm.cmd run dev:frontend'
    ) | Out-Null
} catch {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
    throw
}

Write-Host ''
Write-Host 'MetaTrain VR se esta iniciando.' -ForegroundColor Cyan
Write-Host 'Abre http://localhost:5173 en el navegador.'
Write-Host 'Para detener el proyecto, cierra las dos ventanas de PowerShell.'

Start-Sleep -Seconds 3
Start-Process 'http://localhost:5173'

