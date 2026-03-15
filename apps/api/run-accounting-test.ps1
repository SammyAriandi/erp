$ErrorActionPreference = "Stop"
$BASE = "http://localhost:3000"

function Step($title) {
  Write-Host ""
  Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Create-And-Post-Journal($fileName, $auth, $baseUrl) {
  Step "CREATE JOURNAL - $fileName"
  $created = Invoke-RestMethod `
    -Method Post `
    -Uri "$baseUrl/accounting/journals" `
    -Headers $auth `
    -ContentType "application/json" `
    -Body (Get-Content ".\$fileName" -Raw)

  $created | ConvertTo-Json -Depth 10

  Step "POST JOURNAL - $fileName"
  $posted = Invoke-RestMethod `
    -Method Post `
    -Uri "$baseUrl/accounting/journals/$($created.id)/post" `
    -Headers $auth

  $posted | ConvertTo-Json -Depth 10
  return $posted
}

try {
  Step "LOGIN"
  $LOGIN = Invoke-RestMethod `
    -Method Post `
    -Uri "$BASE/auth/login" `
    -ContentType "application/json" `
    -Body (Get-Content .\login.json -Raw)

  $TOKEN = $LOGIN.accessToken
  $AUTH = @{
    Authorization = "Bearer $TOKEN"
  }

  Write-Host "Login berhasil." -ForegroundColor Green

  $J1 = Create-And-Post-Journal "journal.json" $AUTH $BASE
  $J2 = Create-And-Post-Journal "j_sales.json" $AUTH $BASE
  $J3 = Create-And-Post-Journal "j_elec.json" $AUTH $BASE

  $from = "2026-01-01"
  $to   = "2026-12-31"

  Step "PROFIT LOSS"
  $PL = Invoke-RestMethod `
    -Method Get `
    -Uri "$BASE/accounting/reports/profit-loss?from=$from&to=$to" `
    -Headers $AUTH
  $PL | ConvertTo-Json -Depth 20

  Step "PERIOD CLOSE"
  $PC = Invoke-RestMethod `
    -Method Post `
    -Uri "$BASE/accounting/period-close" `
    -Headers $AUTH `
    -ContentType "application/json" `
    -Body (Get-Content .\close.json -Raw)
  $PC | ConvertTo-Json -Depth 20

  Step "DONE"
  Write-Host "Semua step selesai dijalankan." -ForegroundColor Green
}
catch {
  Write-Host ""
  Write-Host "Script berhenti karena error:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red

  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $reader.BaseStream.Position = 0
    $reader.DiscardBufferedData()
    $resp = $reader.ReadToEnd()
    Write-Host $resp -ForegroundColor Yellow
  }
}