@echo off  
cd /d "%~dp0"  
git add .  
git commit -m "Tracker Keeper update"  
git push origin main  
pause 
