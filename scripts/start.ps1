# ==============================================================================
# SQL ARENA - ONE-CLICK LAUNCH SCRIPT (Windows PowerShell)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🚀 SQL ARENA - Staff Engineer Mastery Platform           " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Verificar si MySQL está escuchando en el puerto 3306
$mysqlConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -WarningAction SilentlyContinue
if (-not $mysqlConn.TcpTestSucceeded) {
    Write-Host "[1/3] Verificando demonio MySQL local..." -ForegroundColor Yellow
    # Busca mysql en Scoop o en Program Files
    $mysqlBin = Get-Command mysqld -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if (-not $mysqlBin) {
        $mysqlBin = "C:\Users\Usuario\scoop\apps\mysql\current\bin\mysqld.exe"
    }
    if (Test-Path $mysqlBin) {
        Write-Host "Iniciando MySQL daemon ($mysqlBin)..." -ForegroundColor Yellow
        Start-Process -FilePath $mysqlBin -ArgumentList "--console" -WindowStyle Minimized
        Start-Sleep -Seconds 2
    } else {
        Write-Warning "No se encontró el ejecutable mysqld. Por favor, asegúrate de que MySQL esté activo en el puerto 3306."
    }
} else {
    Write-Host "[1/3] ✅ MySQL activo en el puerto 3306." -ForegroundColor Green
}

# 2. Iniciar Backend Express (Puerto 5000)
$backendConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 5000 -WarningAction SilentlyContinue
if (-not $backendConn.TcpTestSucceeded) {
    Write-Host "[2/3] Iniciando API Backend en puerto 5000..." -ForegroundColor Yellow
    $backendDir = "$PSScriptRoot\..\backend"
    Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $backendDir -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "[2/3] ✅ Backend API activo en el puerto 5000." -ForegroundColor Green
}

# 3. Iniciar Frontend Vite (Puerto 3000)
$frontendConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue
if (-not $frontendConn.TcpTestSucceeded) {
    Write-Host "[3/3] Iniciando Frontend React (Vite) en puerto 3000..." -ForegroundColor Yellow
    $frontendDir = "$PSScriptRoot\..\frontend"
    Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host", "127.0.0.1", "--port", "3000" -WorkingDirectory $frontendDir -WindowStyle Minimized
    Start-Sleep -Seconds 2
} else {
    Write-Host "[3/3] ✅ Frontend activo en el puerto 3000." -ForegroundColor Green
}

Write-Host "`n✅ Plataforma lista: Abriendo http://localhost:3000 en el navegador..." -ForegroundColor Green
Start-Process "http://localhost:3000"

