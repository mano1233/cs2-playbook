# Run with Windows PowerShell: powershell.exe -STA -File scripts/capture-lineup.ps1 ...
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][Guid]$LineupId,
    [string]$BaseUrl = 'http://localhost:3000',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../work/captures'),
    [ValidateSet('stand','crosshair')][string]$ShotKind = 'crosshair',
    [ValidateRange(2,30)][int]$SettleSeconds = 3,
    [switch]$Upload,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$base = [Uri]$BaseUrl
if ($base.Scheme -notin @('http','https') -or $base.UserInfo -or $base.Query -or $base.Fragment) {
    throw 'Use an http(s) website URL without credentials, query or fragment.'
}
if ($base.Scheme -eq 'http' -and -not $base.IsLoopback) { throw 'Remote websites require HTTPS.' }
$key = $env:PLAYBOOK_API_KEY
if (-not $key) { throw 'Set PLAYBOOK_API_KEY using a key from the website /keys page.' }
$root = $BaseUrl.TrimEnd('/')
$metadata = Invoke-RestMethod -Uri "$root/api/lineups/$LineupId" -Headers @{Authorization="Bearer $key"} -MaximumRedirection 0
$lineup = $metadata.lineup
$numbers = @()
foreach ($field in @('throwX','throwY','throwZ','pitch','yaw')) {
    $value = $lineup.$field
    if ($null -eq $value -or $value -is [string] -or $value -is [bool]) { throw "Lineup needs numeric $field. Save exact getpos coordinates in the website first." }
    $number = [double]$value
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { throw "Invalid $field" }
    $numbers += $number.ToString('0.######', [Globalization.CultureInfo]::InvariantCulture)
}
if ([double]$lineup.pitch -lt -89 -or [double]$lineup.pitch -gt 89) { throw 'Pitch must be between -89 and 89.' }
if ($lineup.movement -ne 'stationary') { throw 'This version captures stationary lineups only; moving and crouching lineups need a separate capture workflow.' }
$command = "setpos $($numbers[0]) $($numbers[1]) $($numbers[2]); setang $($numbers[3]) $($numbers[4]) 0"
Write-Host "Map: $($metadata.map) | Throw: $($metadata.throwName)"
Write-Host $command
if ($DryRun) { return }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PlaybookCaptureNative {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref Point p);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][PlaybookCaptureNative]::SetProcessDPIAware()
function Assert-CS2Foreground {
    $handle = [PlaybookCaptureNative]::GetForegroundWindow()
    [uint32]$processIdValue = 0
    [void][PlaybookCaptureNative]::GetWindowThreadProcessId($handle, [ref]$processIdValue)
    $process = Get-Process -Id $processIdValue
    if ($process.ProcessName -ne 'cs2') { throw 'CS2 must be in the foreground. Capture stopped.' }
    return $handle
}
Write-Host 'Use a LOCAL practice session with sv_cheats 1 on the map shown above.'
Write-Host 'Use windowed/borderless mode. Open the CS2 console and leave its input empty.'
Write-Host 'Press Enter here, then switch to CS2 with its console OPEN within 8 seconds.'
[void](Read-Host)
Start-Sleep -Seconds 8
[void](Assert-CS2Foreground)
$oldClipboard = [Windows.Forms.Clipboard]::GetDataObject()
try {
    [Windows.Forms.Clipboard]::SetText($command)
    [Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 200
    [void](Assert-CS2Foreground)
    [Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 400
    # Escape closes the already-open console; no keyboard-layout-dependent console key.
    [void](Assert-CS2Foreground)
    [Windows.Forms.SendKeys]::SendWait('{ESC}')
    Start-Sleep -Seconds $SettleSeconds
    $handle = Assert-CS2Foreground
    $rect = New-Object PlaybookCaptureNative+Rect
    $point = New-Object PlaybookCaptureNative+Point
    if (-not [PlaybookCaptureNative]::GetClientRect($handle, [ref]$rect) -or
        -not [PlaybookCaptureNative]::ClientToScreen($handle, [ref]$point)) { throw 'Cannot read the CS2 window bounds.' }
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -lt 100 -or $height -lt 100) { throw 'CS2 window is minimized or too small.' }
    $directory = [IO.Path]::GetFullPath($OutputDirectory)
    [void][IO.Directory]::CreateDirectory($directory)
    $path = Join-Path $directory "$LineupId-$ShotKind-$([Guid]::NewGuid().ToString('N')).png"
    $bitmap = New-Object Drawing.Bitmap($width, $height)
    try {
        $graphics = [Drawing.Graphics]::FromImage($bitmap)
        try { $graphics.CopyFromScreen($point.X, $point.Y, 0, 0, $bitmap.Size) }
        finally { $graphics.Dispose() }
        [void](Assert-CS2Foreground)
        $bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
} finally {
    if ($null -ne $oldClipboard) { [Windows.Forms.Clipboard]::SetDataObject($oldClipboard, $true) }
    else { [Windows.Forms.Clipboard]::Clear() }
}
Write-Host "Saved screenshot: $path"
if ($Upload) {
    # Review first: an open console or another overlay would produce a misleading image.
    Start-Process -FilePath $path
    if ((Read-Host 'Does the screenshot show the correct lineup? Type UPLOAD to attach it') -cne 'UPLOAD') {
        Write-Host 'Kept locally; nothing uploaded.'
        return
    }
    $bytes = [IO.File]::ReadAllBytes($path)
    if ($bytes.Length -gt 5MB) { throw 'Screenshot exceeds the website 5 MB upload limit. Local file was preserved.' }
    $handler = New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $form = New-Object Net.Http.MultipartFormDataContent
    try {
        $client.DefaultRequestHeaders.Authorization = New-Object Net.Http.Headers.AuthenticationHeaderValue('Bearer', $key)
        $content = New-Object Net.Http.ByteArrayContent(,$bytes)
        $content.Headers.ContentType = New-Object Net.Http.Headers.MediaTypeHeaderValue('image/png')
        $form.Add($content, 'file', [IO.Path]::GetFileName($path))
        $form.Add((New-Object Net.Http.StringContent($ShotKind)), 'shotKind')
        $response = $client.PostAsync("$root/api/lineups/$LineupId/shots", $form).GetAwaiter().GetResult()
        try {
            if (-not $response.IsSuccessStatusCode) { throw "Upload failed (HTTP $([int]$response.StatusCode)). Check your API key and website image storage. Local screenshot was preserved." }
            Write-Host 'Uploaded. Refresh the lineup in the website.'
        } finally { $response.Dispose() }
    } finally { $form.Dispose(); $client.Dispose(); $handler.Dispose() }
}
