<#
.SYNOPSIS
  Baut die Microsoft-Store-Fassung als unsigniertes MSIX-Paket.

.DESCRIPTION
  Unsigniert, weil der Store das Paket bei der Einreichung selbst signiert.
  Damit entfällt das kostenpflichtige Code-Signing-Zertifikat, das ein
  EXE/MSI-Eintrag verlangen würde.

  Ablauf: Programm ohne Updater bauen (Feature microsoft-store), ein
  Layoutverzeichnis aus Programm, Logos und AppxManifest zusammensetzen,
  Platzhalter im Manifest ersetzen, mit makeappx packen.

  Die Angaben aus dem Partner Center (Produktverwaltung, Produktidentität)
  kommen aus Umgebungsvariablen und stehen nicht im Repository:

    MS_STORE_IDENTITAET               Package/Identity/Name, z. B. 12345Name.Chefsachen
    MS_STORE_HERAUSGEBER              Package/Identity/Publisher, z. B. CN=XXXXXXXX-XXXX-...
    MS_STORE_HERAUSGEBER_ANZEIGENAME  Package/Properties/PublisherDisplayName

  Braucht Node.js, Rust und das Windows SDK (für makeappx.exe).

.PARAMETER OhneBau
  Überspringt den Bau und packt das vorhandene Programm erneut, etwa nach
  einer Korrektur der Partner-Center-Angaben.

.EXAMPLE
  $env:MS_STORE_IDENTITAET = "12345Name.Chefsachen"
  $env:MS_STORE_HERAUSGEBER = "CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
  $env:MS_STORE_HERAUSGEBER_ANZEIGENAME = "Markus Müller"
  ./scripts/microsoft-store.ps1
#>
# Gespeichert als UTF-8 mit BOM: Windows PowerShell 5.1 liest ein Skript ohne
# BOM als ANSI und zeigte die Umlaute der Meldungen verstümmelt an.
[CmdletBinding()]
param(
  [switch]$OhneBau
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Meldung auf die Fehlerausgabe und Ende mit Exitcode 1. Write-Error allein
# hinterließe unter Stop eine Ausnahme mit Stapelangaben statt eines Satzes.
function Abbruch([string]$text) {
  [Console]::Error.WriteLine("Abbruch: $text")
  exit 1
}

$wurzel = Split-Path -Parent $PSScriptRoot
Set-Location $wurzel

# Alle fehlenden Angaben auf einmal nennen statt eine nach der anderen:
# Sonst braucht es drei Anläufe, bis der Bau überhaupt beginnt.
$angaben = [ordered]@{
  MS_STORE_IDENTITAET              = 'Paketidentität/Name aus dem Partner Center'
  MS_STORE_HERAUSGEBER             = 'Paketidentität/Herausgeber (CN=...) aus dem Partner Center'
  MS_STORE_HERAUSGEBER_ANZEIGENAME = 'Anzeigename des Herausgebers aus dem Partner Center'
}
$fehlt = @()
foreach ($name in $angaben.Keys) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    $fehlt += "  - $name  ($($angaben[$name]))"
  }
}
if ($fehlt.Count -gt 0) {
  Abbruch ("Diese Umgebungsvariablen fehlen:`n" + ($fehlt -join "`n") +
    "`n`nErklärung: Get-Help ./scripts/microsoft-store.ps1 -Detailed")
}
$identitaet = $env:MS_STORE_IDENTITAET
$herausgeber = $env:MS_STORE_HERAUSGEBER
$anzeigename = $env:MS_STORE_HERAUSGEBER_ANZEIGENAME
if (-not $herausgeber.StartsWith('CN=')) {
  Abbruch "MS_STORE_HERAUSGEBER muss mit CN= beginnen, so wie im Partner Center angegeben."
}

# MSIX verlangt vier Stellen, und der Store besteht auf einer 0 an der
# letzten. Aus 1.4.2 wird 1.4.2.0.
$konfiguration = Get-Content -Raw -Encoding UTF8 'src-tauri/tauri.conf.json' | ConvertFrom-Json
$version = "$($konfiguration.version).0"
if ($version -notmatch '^\d+\.\d+\.\d+\.0$') {
  Abbruch "Version '$($konfiguration.version)' aus tauri.conf.json lässt sich nicht in die Form a.b.c.0 bringen."
}

# makeappx liegt im Windows SDK, je Version in einem eigenen Ordner. Die
# jüngste nehmen; ältere kennen neuere Manifestfelder womöglich nicht.
function Finde-MakeAppx {
  $befehl = Get-Command makeappx.exe -ErrorAction SilentlyContinue
  if ($befehl) { return $befehl.Source }
  $sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (Test-Path $sdk) {
    $treffer = Get-ChildItem -Path $sdk -Directory |
      Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
      Sort-Object { [version]$_.Name } -Descending |
      ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($treffer) { return $treffer }
  }
  return $null
}
$makeappx = Finde-MakeAppx
if (-not $makeappx) {
  Abbruch "makeappx.exe nicht gefunden. Das Windows SDK installieren (Komponente 'MSIX Packaging Tools')."
}

if (-not $OhneBau) {
  Write-Host "==> Baue Chefsachen $version für den Microsoft Store"
  # npx.cmd statt npx: In PowerShell wäre npx das Skript npx.ps1, und einem
  # Skript nimmt PowerShell das '--' weg. Dann landeten die Cargo-Angaben bei
  # tauri statt bei cargo, und es entstünde still die GitHub-Fassung.
  & npx.cmd tauri build --no-bundle --config src-tauri/tauri.microsoftstore.conf.json '--' --no-default-features --features microsoft-store
  if ($LASTEXITCODE -ne 0) {
    Abbruch "Der Bau ist fehlgeschlagen (Exitcode $LASTEXITCODE)."
  }
}

$zielordner = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { 'src-tauri/target' }
# Ohne Bündelung trägt das Programm den Namen des Cargo-Pakets. Sollte Tauri
# es künftig nach productName benennen, greift die zweite Schreibweise.
$programm = @('release/chefsachen.exe', 'release/Chefsachen.exe') |
  ForEach-Object { Join-Path $zielordner $_ } |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
if (-not $programm) {
  Abbruch "Das gebaute Programm liegt nicht unter $zielordner/release."
}

# Der Updater darf im Store-Bau nicht stecken: Updates kommen allein über den
# Store. Das Feature sorgt dafür; diese Probe fängt ab, dass ein Bau mit den
# Standard-Features hier landet.
$inhalt = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes((Resolve-Path $programm)))
if ($inhalt.Contains('tauri-plugin-updater') -or $inhalt.Contains('tauri_plugin_updater')) {
  Abbruch "Im Programm steckt der Updater. Mit --no-default-features --features microsoft-store gebaut?"
}

$ausgabe = Join-Path $zielordner 'microsoft-store'
$layout = Join-Path $ausgabe 'layout'
if (Test-Path $layout) { Remove-Item -Recurse -Force $layout }
New-Item -ItemType Directory -Force -Path (Join-Path $layout 'Assets') | Out-Null

Copy-Item $programm (Join-Path $layout 'chefsachen.exe')
foreach ($logo in 'StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png') {
  Copy-Item (Join-Path 'src-tauri/icons' $logo) (Join-Path $layout "Assets/$logo")
}

# Platzhalter ersetzen. Die Werte XML-gerecht maskieren: Ein & im
# Herausgebernamen machte das Manifest sonst ungültig.
function Xml-Text([string]$text) { [System.Security.SecurityElement]::Escape($text) }
$manifest = Get-Content -Raw -Encoding UTF8 'src-tauri/msix/AppxManifest.xml'
$manifest = $manifest.Replace('{{IDENTITAET}}', (Xml-Text $identitaet))
$manifest = $manifest.Replace('{{HERAUSGEBER}}', (Xml-Text $herausgeber))
$manifest = $manifest.Replace('{{HERAUSGEBER_ANZEIGENAME}}', (Xml-Text $anzeigename))
$manifest = $manifest.Replace('{{VERSION}}', $version)
if ($manifest -match '\{\{[A-Z_]+\}\}') {
  Abbruch "Im Manifest steht noch ein Platzhalter: $($Matches[0])"
}
# UTF-8 ohne BOM: Windows PowerShell 5.1 schriebe mit -Encoding UTF8 eine BOM.
[System.IO.File]::WriteAllText(
  (Join-Path (Resolve-Path $layout) 'AppxManifest.xml'),
  $manifest,
  (New-Object System.Text.UTF8Encoding $false))

$paket = Join-Path $ausgabe "Chefsachen-$version-x64.msix"
Write-Host "==> Packe $paket"
& $makeappx pack /o /d $layout /p $paket
if ($LASTEXITCODE -ne 0) {
  Abbruch "makeappx ist fehlgeschlagen (Exitcode $LASTEXITCODE)."
}

Write-Host "==> Fertig: $paket"
Write-Host "    Unsigniert im Partner Center unter Pakete hochladen; der Store signiert selbst."
