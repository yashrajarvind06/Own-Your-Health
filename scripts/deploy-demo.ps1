# Phone demo with the backend on this PC: starts the backend and a free Cloudflare tunnel, then rebuilds
# both apps against the tunnel's new URL and deploys them to Cloudflare Pages (their URLs never change).
# One-time setup: npx wrangler login, then for each project name below:
#   npx wrangler pages project create <name> --production-branch main
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\deploy-demo.ps1
param(
    [string]$PatientProject = "ownyourhealth",
    [string]$DoctorProject = "ownyourhealth-doctor"
)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $env:TEMP "oyh-pages"
$log = Join-Path $env:TEMP "oyh-tunnel.log"

# 1. Backend, unless it is already up
try { Invoke-WebRequest http://localhost:8000/reports/types -UseBasicParsing -TimeoutSec 3 | Out-Null; Write-Host "Backend already running" }
catch {
    Write-Host "Starting backend..."
    Start-Process "$root\backend\venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --host 0.0.0.0 --port 8000" -WorkingDirectory "$root\backend" -WindowStyle Minimized
}

# 2. Fresh quick tunnel (its URL changes every start, which is why the apps are rebuilt below)
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $log -ErrorAction SilentlyContinue
Start-Process cloudflared -ArgumentList "tunnel --protocol http2 --url http://localhost:8000 --logfile `"$log`"" -WindowStyle Minimized
$api = $null
for ($i = 0; $i -lt 60 -and -not $api; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
        $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($m) { $api = $m.Matches[0].Value }
    }
}
if (-not $api) { throw "The tunnel did not start; see $log" }
Write-Host "Backend tunnel: $api"

# 3. Build both apps pointing at the tunnel
$env:EXPO_PUBLIC_WEB_API_BASE = $api
Push-Location "$root\mobile"
npx expo export -p web --clear --output-dir "$out\patient"
if ($LASTEXITCODE) { throw "Patient app build failed" }
Pop-Location
# Pages never uploads folders named node_modules, which is where Expo puts the icon fonts
Rename-Item "$out\patient\assets\node_modules" "vendor"
Get-ChildItem "$out\patient" -Recurse -Include *.js, *.html | ForEach-Object {
    $text = [IO.File]::ReadAllText($_.FullName)
    if ($text.Contains("/assets/node_modules/")) { [IO.File]::WriteAllText($_.FullName, $text.Replace("/assets/node_modules/", "/assets/vendor/")) }
}
Remove-Item Env:EXPO_PUBLIC_WEB_API_BASE

$env:VITE_API_BASE = $api
$env:VITE_PATIENT_APP_URL = "https://$PatientProject.pages.dev"
Push-Location "$root\frontend"
npx vite build --outDir "$out\doctor" --emptyOutDir
if ($LASTEXITCODE) { throw "Doctor web build failed" }
Pop-Location
Remove-Item Env:VITE_API_BASE, Env:VITE_PATIENT_APP_URL

# 4. Deploy to Cloudflare Pages
npx --yes wrangler@4 pages deploy "$out\patient" --project-name $PatientProject --branch main --commit-dirty=true
if ($LASTEXITCODE) { throw "Patient app deploy failed" }
npx --yes wrangler@4 pages deploy "$out\doctor" --project-name $DoctorProject --branch main --commit-dirty=true
if ($LASTEXITCODE) { throw "Doctor web deploy failed" }

Write-Host ""
Write-Host "Patient app: https://$PatientProject.pages.dev"
Write-Host "Doctor web:  https://$DoctorProject.pages.dev"
Write-Host "Keep this PC on and awake; the apps reach the backend through $api"
