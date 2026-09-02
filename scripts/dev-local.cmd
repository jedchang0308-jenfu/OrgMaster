@echo off
setlocal

start "OrgMaster local" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File "%~dp0dev-local.ps1"
