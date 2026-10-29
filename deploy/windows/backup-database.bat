@echo off
REM Nightly database backup. Schedule this file in Windows Task Scheduler.
REM Uses the Windows account running the task (it needs backup rights in SQL Server).
REM Change .\SQLEXPRESS if your instance has another name.
if not exist "C:\ApexWMS\backups" mkdir "C:\ApexWMS\backups"
sqlcmd -S .\SQLEXPRESS -E -i "%~dp0\02-backup-database.sql"
REM Keep the last 30 days of backups.
forfiles /p "C:\ApexWMS\backups" /m "ApexWMS_*.bak" /d -30 /c "cmd /c del @path" 2>nul
