# Capture a lineup from CS2 (Windows)

This helper reads a saved lineup from the website, pastes numeric `setpos` and
`setang` commands into the already-open CS2 console, closes the console, waits,
and saves a PNG of the game window. It does not throw grenades or capture results.
No extra packages are required. Use Windows PowerShell 5.1 in STA mode.

## Prepare once

1. Keep the playbook running. Create a key at http://localhost:3000/keys.
2. Create a utility lineup in the website with exact standing X/Y/Z and pitch/yaw
   (paste CS2 `getpos` output). Map clicks alone do not supply height or aim angles.
   The sample tactics do not include these exact lineups.
3. In PowerShell in the project folder, set the key for this terminal only:

```powershell
$env:PLAYBOOK_API_KEY = 'pbk_YOUR_KEY'
```

Find saved lineup IDs for Mirage:

```powershell
$library = Invoke-RestMethod 'http://localhost:3000/api/throws?map=de_mirage' -Headers @{Authorization="Bearer $env:PLAYBOOK_API_KEY"}
$library.throws | ForEach-Object {
    $throwName = $_.name
    $_.lineups | Select-Object @{Name='Throw';Expression={$throwName}}, id, name
}
```

## Capture

Open CS2 in borderless/windowed mode. Start a **local practice** session on the
lineup's map, join a team, and enable `sv_cheats 1` in the developer console.
This helper does not check the loaded map or enable cheats for you.

First check the generated positioning command without touching the game:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\capture-lineup.ps1 -LineupId YOUR_LINEUP_UUID -DryRun
```

Then remove `-DryRun` to capture. The execution-policy option applies only to this
new PowerShell process; it does not change the machine's policy.

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File .\scripts\capture-lineup.ps1 -LineupId YOUR_LINEUP_UUID
```

Open the CS2 console with an empty command line. Press Enter in the helper terminal,
then switch to CS2 within eight seconds, **leaving its console open**. The helper
pastes the position and aim, submits them, closes the console with Escape, and
captures after three seconds. Do not move the mouse during this sequence.

Images are saved in `work/captures/` by default. A first-person view is labeled
`crosshair`; it shows the view from the saved standing point, not an external view
of the player's feet. `-ShotKind stand` changes the website category only.
Moving/crouching lineups are rejected rather than captured with a wrong posture.
Jump-throw lineups can capture their stationary starting aim, not the release frame.

## Upload (optional)

Append `-Upload`. The helper opens the saved picture for review and asks you to
type `UPLOAD` before attaching it. Configure either the website's S3/R2 storage
or `LOCAL_IMAGE_DIR=./work/images` in `.env.local` and restart the website.
The local PNG remains available if upload fails. The limit is 5 MB.

Use `-BaseUrl https://your-playbook.example` for another website, or
`-SettleSeconds 5` for a longer rendering delay. Remote HTTP is rejected to avoid
sending the API key in plaintext. Redirects are not followed.

## Limits and troubleshooting

- The helper stops if CS2 is not foreground. It cannot verify that the console is
  open or that the game accepted the commands. Always inspect the saved screenshot.
- If positioning fails, confirm the map, local practice mode and `sv_cheats 1`.
- A black capture usually needs borderless/windowed mode instead of exclusive
  fullscreen. Overlays can appear in a capture; close them before starting.
- The game and terminal should run at the same privilege level.
- It reads/replaces the clipboard temporarily, restoring it afterward. It never
  reads game memory or injects code into the game.
- Actual CS2 capture requires a live game test; automated tests cover metadata
  access and helper input validation only.

Offline checks:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\capture-helper.tests.ps1
npm.cmd test
npm.cmd run typecheck
```
