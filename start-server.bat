@echo off
echo.
echo  ============================================
echo   FleetPulse Server
echo  ============================================
echo.
cd /d "%~dp0"
echo  Pokrecem server na http://localhost:8766
echo  Pritisni Ctrl+C za zaustavljanje
echo.
node api-server.js
pause
