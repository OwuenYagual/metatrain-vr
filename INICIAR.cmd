@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR.ps1"

if errorlevel 1 (
    echo.
    echo No se pudo iniciar MetaTrain VR.
    pause
)

