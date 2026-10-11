@echo off
cd /d "%~dp0"
echo NeriPlayer Debug development mode
echo Exit the installed app from the tray before starting.
echo Keep this console open. Press Ctrl+C to stop development mode.
call pnpm tauri dev
pause
