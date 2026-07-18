# One-click: install deps, test, build chrome+firefox artifacts
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
npm ci
npm test
npm run build
npm run build:firefox
Write-Host "Artifacts:"
Write-Host "  Chrome : .output/chrome-mv3"
Write-Host "  Firefox: .output/firefox-mv2"
Write-Host "Load unpacked / temporary add-on from those folders."
