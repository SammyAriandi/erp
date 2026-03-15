$ErrorActionPreference = "Stop"

$BASE = "http://localhost:3000"

function Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function PostJson($url, $jsonFile, $headers = $null) {
    $body = Get-Content $jsonFile -Raw
    if ($headers) {
        return Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType "application/json" -Body $body
    } else {
        return Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Body $body
    }
}

function GetJson($url, $headers) {
    return Invoke-RestMethod -Method Get -Uri $url -Headers $headers
}

Section "LOGIN"
$LOGIN = Invoke-RestMethod -Method Post `
    -Uri "$BASE/auth/login" `
    -ContentType "application/json" `
    -Body (Get-Content ".\login.json" -Raw)

$TOKEN = $LOGIN.accessToken
$AUTH = @{ Authorization = "Bearer $TOKEN" }

Write-Host "Login berhasil." -ForegroundColor Green
Write-Host "Tenant: $($LOGIN.tenant.name)"
Write-Host "User  : $($LOGIN.user.email)"

Section "CHECK CURRENT PERIOD LOCK"
try {
    $periodLock = GetJson "$BASE/accounting/period-lock" $AUTH
    $periodLock | ConvertTo-Json -Depth 20
} catch {
    Write-Host "Belum ada period lock / gagal ambil period lock." -ForegroundColor Yellow
}

Section "CHECK ACCOUNTS"
$accounts = GetJson "$BASE/accounting/accounts" $AUTH
$accounts | ConvertTo-Json -Depth 20

if (-not $accounts.value -or $accounts.Count -eq 0) {
    Section "BOOTSTRAP COA"
    $bootstrap = Invoke-RestMethod -Method Post `
        -Uri "$BASE/accounting/coa/bootstrap" `
        -Headers $AUTH
    $bootstrap | ConvertTo-Json -Depth 20

    Section "RECHECK ACCOUNTS"
    $accounts = GetJson "$BASE/accounting/accounts" $AUTH
    $accounts | ConvertTo-Json -Depth 20
}

Section "CREATE JOURNAL - journal.json"
$j1 = PostJson "$BASE/accounting/journals" ".\journal.json" $AUTH
$j1 | ConvertTo-Json -Depth 20

Section "POST JOURNAL - journal.json"
$p1 = Invoke-RestMethod -Method Post -Uri "$BASE/accounting/journals/$($j1.id)/post" -Headers $AUTH
$p1 | ConvertTo-Json -Depth 20

Section "CREATE JOURNAL - j_sales.json"
$j2 = PostJson "$BASE/accounting/journals" ".\j_sales.json" $AUTH
$j2 | ConvertTo-Json -Depth 20

Section "POST JOURNAL - j_sales.json"
$p2 = Invoke-RestMethod -Method Post -Uri "$BASE/accounting/journals/$($j2.id)/post" -Headers $AUTH
$p2 | ConvertTo-Json -Depth 20

Section "CREATE JOURNAL - j_elec.json"
$j3 = PostJson "$BASE/accounting/journals" ".\j_elec.json" $AUTH
$j3 | ConvertTo-Json -Depth 20

Section "POST JOURNAL - j_elec.json"
$p3 = Invoke-RestMethod -Method Post -Uri "$BASE/accounting/journals/$($j3.id)/post" -Headers $AUTH
$p3 | ConvertTo-Json -Depth 20

$from = "2026-01-01"
$to   = "2026-12-31"

Section "TRIAL BALANCE"
$tb = GetJson "$BASE/accounting/reports/trial-balance?from=$from&to=$to" $AUTH
$tb | ConvertTo-Json -Depth 20

Section "PROFIT LOSS"
$pl = GetJson "$BASE/accounting/reports/profit-loss?from=$from&to=$to" $AUTH
$pl | ConvertTo-Json -Depth 20

Section "PERIOD CLOSE"
try {
    $closeBody = @{
        from = $from
        to = $to
        retainedEarningsCode = "3102"
        memo = "Closing FY2026"
    } | ConvertTo-Json

    $close = Invoke-RestMethod -Method Post `
        -Uri "$BASE/accounting/period-close" `
        -Headers $AUTH `
        -ContentType "application/json" `
        -Body $closeBody

    $close | ConvertTo-Json -Depth 20
}
catch {
    Write-Host "Period close gagal / mungkin sudah pernah di-close untuk range ini." -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Section "PERIOD LOCK AFTER CLOSE"
try {
    $periodLockAfter = GetJson "$BASE/accounting/period-lock" $AUTH
    $periodLockAfter | ConvertTo-Json -Depth 20
} catch {
    Write-Host "Gagal ambil period lock setelah close." -ForegroundColor Yellow
}

Section "DONE"
Write-Host "Accounting test flow selesai." -ForegroundColor Green