# Offline validation; never sends keys, captures a screen, or calls a website.
$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot '../scripts/capture-lineup.ps1'
$global:playbookCaptureFixture = @{map='de_mirage'; throwName='Test'; lineup=@{
    throwX=100.5; throwY=-200; throwZ=0; pitch=-20.25; yaw=135; movement='stationary'
}}
function Invoke-RestMethod { return $global:playbookCaptureFixture }
$originalKey = $env:PLAYBOOK_API_KEY
$env:PLAYBOOK_API_KEY = 'offline-test'
function Expect-Rejection($label, $block) {
    $rejected = $false
    try { & $block } catch { $rejected = $true }
    if (-not $rejected) { throw "Expected rejection: $label" }
    Write-Host "PASS: $label"
}
try {
    $id = '4eb23f21-a072-4e5e-a825-000000000001'
    & $helper -LineupId $id -DryRun
    Write-Host 'PASS: valid coordinates'
    $global:playbookCaptureFixture.lineup.throwZ = $null
    Expect-Rejection 'missing height' { & $helper -LineupId $id -DryRun }
    $global:playbookCaptureFixture.lineup.throwZ = 0
    $global:playbookCaptureFixture.lineup.throwX = '100; quit'
    Expect-Rejection 'command injection in coordinate' { & $helper -LineupId $id -DryRun }
    $global:playbookCaptureFixture.lineup.throwX = 100
    $global:playbookCaptureFixture.lineup.pitch = [double]::NaN
    Expect-Rejection 'non-finite angle' { & $helper -LineupId $id -DryRun }
    $global:playbookCaptureFixture.lineup.pitch = -20
    $global:playbookCaptureFixture.lineup.movement = 'running'
    Expect-Rejection 'unsupported movement' { & $helper -LineupId $id -DryRun }
    Expect-Rejection 'remote plaintext token transport' { & $helper -LineupId $id -BaseUrl 'http://example.com' -DryRun }
    $env:PLAYBOOK_API_KEY = ''
    Expect-Rejection 'missing API key' { & $helper -LineupId $id -DryRun }
} finally { $env:PLAYBOOK_API_KEY = $originalKey }
