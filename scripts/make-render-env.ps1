# Kopira Firebase JSON u clipboard (bez PowerShell $ problema)
# Upotreba: powershell -ExecutionPolicy Bypass -File scripts/make-render-env.ps1

$keyPath = Join-Path (Split-Path $PSScriptRoot -Parent) "firebase-admin-key.json"
if (-not (Test-Path $keyPath)) {
    Write-Host "NEMA FAJLA: $keyPath"
    Write-Host "Stavi firebase-admin-key.json u buscommand folder."
    exit 1
}

$raw = [System.IO.File]::ReadAllText($keyPath)
$obj = $raw | ConvertFrom-Json
$compact = ($obj | ConvertTo-Json -Compress -Depth 20)

# Fajl za Render "Import from .env" (jedna linija)
$envLine = 'FIREBASE_SERVICE_ACCOUNT_JSON=' + $compact
$outPath = Join-Path (Split-Path $PSScriptRoot -Parent) "render-env-import.env"
[System.IO.File]::WriteAllText($outPath, $envLine, [System.Text.UTF8Encoding]::new($false))

# Clipboard (PowerShell 5+)
Set-Clipboard -Value $compact

# Base64 varijanta (Render Secret File problemi — ova je pouzdanija)
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($compact))
$b64Path = Join-Path (Split-Path $PSScriptRoot -Parent) "render-env-base64.env"
[System.IO.File]::WriteAllText($b64Path, "FIREBASE_SERVICE_ACCOUNT_BASE64=$b64", [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host 'OK — uradjeno:'
Write-Host '  1) Clipboard = JSON za FIREBASE_SERVICE_ACCOUNT_JSON'
Write-Host '  2) render-env-import.env'
Write-Host '  3) render-env-base64.env (FIREBASE_SERVICE_ACCOUNT_BASE64 — preporuceno ako Secret File puca)'
Write-Host ''
Write-Host 'Render koraci:'
Write-Host '  Environment -> Add Environment Variable'
Write-Host '  Key:   FIREBASE_SERVICE_ACCOUNT_JSON'
Write-Host '  Value: Ctrl+V iz clipboard-a'
Write-Host '  Save Changes'
Write-Host ''
