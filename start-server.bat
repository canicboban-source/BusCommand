@echo off
echo.
echo  ============================================
echo   BusCommand Server v9.4 (ESM + Vite)
echo  ============================================
echo.
cd /d "%~dp0"
echo  Build:      npm run build
echo  Demo:       http://localhost:8766/?demo=driver
echo  Dispecer:   http://localhost:8766/?demo=dispatcher
echo  Produkcija: http://localhost:8766/?mode=production^&company=ID
echo.
node api-server.js
pause
