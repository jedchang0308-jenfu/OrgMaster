$ErrorActionPreference = 'Continue'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

Write-Host 'OrgMaster local development environment' -ForegroundColor Cyan
Write-Host "Project: $projectRoot"
Write-Host 'URL: http://localhost:5000/'
Write-Host 'This window stays open while the server is running. Press Ctrl+C to stop.' -ForegroundColor DarkGray
Write-Host ''

# Use cmd.exe for npm so Windows PowerShell does not treat npm.ps1 as a restricted script.
& cmd.exe /d /c npm.cmd run dev:local
$exitCode = $LASTEXITCODE

Write-Host ''
if ($exitCode -eq 0) {
  Write-Host 'The local server stopped.' -ForegroundColor Yellow
} else {
  Write-Host "The local server stopped with exit code: $exitCode" -ForegroundColor Red
}
Write-Host 'The window stays open so you can inspect errors. Press Enter to close.' -ForegroundColor DarkGray
[void](Read-Host)
