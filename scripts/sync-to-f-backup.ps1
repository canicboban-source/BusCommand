# Rezervna kopija: Desktop\buscommand -> F:\buscommand
# Pokreni iz: C:\Users\cane\Desktop\buscommand
$ErrorActionPreference = "Stop"
$src = "C:\Users\cane\Desktop\buscommand"
$dst = "F:\buscommand"

if (-not (Test-Path $src)) {
    Write-Error "Izvor $src ne postoji."
}

$excludeDirs = @("node_modules", "dist", "test-results", "playwright-report", ".cursor", ".claude")
$xd = ($excludeDirs | ForEach-Object { "/XD", $_ }) -join " "

Write-Host "Backup: $src -> $dst"
cmd /c "robocopy `"$src`" `"$dst`" /E /MIR $xd /XF firebase-admin-key.json /NFL /NDL /NJH /NJS /nc /ns /np"

if ($LASTEXITCODE -gt 7) { exit $LASTEXITCODE }
Write-Host "Backup zavrsen."
exit 0
