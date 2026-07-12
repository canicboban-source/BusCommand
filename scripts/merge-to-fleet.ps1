# Faza 0.6 — sync kanonskog BusCommand repoa u f:\fleet (glavni git)
# Pokreni iz: C:\Users\cane\buscommand
$ErrorActionPreference = "Stop"
$src = "C:\Users\cane\buscommand"
$dst = "F:\fleet"

if (-not (Test-Path $dst)) {
    Write-Error "Cilj $dst ne postoji."
}

$excludeDirs = @("node_modules", "dist", ".git", "test-results", "playwright-report", ".cursor", ".claude")
$excludeFiles = @("firebase-admin-key.json")

$xd = ($excludeDirs | ForEach-Object { "/XD", $_ }) -join " "
$xf = ($excludeFiles | ForEach-Object { "/XF", $_ }) -join " "

Write-Host "Merge: $src -> $dst"
cmd /c "robocopy `"$src`" `"$dst`" /E /MIR $xd $xf /NFL /NDL /NJH /NJS /nc /ns /np"

# robocopy exit 0-7 = OK
if ($LASTEXITCODE -gt 7) { exit $LASTEXITCODE }
exit 0
