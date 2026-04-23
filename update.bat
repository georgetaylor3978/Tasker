@echo off  
cd /d "%~dp0"  
git add .  
git commit -m "Update: %2026-04-22%"  
git push origin main  
pause 
