@echo off
echo ========================================================
echo   TerraLedger Land Registry - One-Click Demo Startup
echo ========================================================
echo.
echo 1. Checking Blockchain and Contract Status...
node .\scripts\demo-check.js
echo.
echo 2. Launching Vite Frontend...
npm run dev --prefix frontend
pause

