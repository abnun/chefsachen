#!/usr/bin/env bash
# Baut die Mac-App-Store-Fassung: universelles .app, signiert für den Store,
# verpackt als .pkg. Hochgeladen wird nur mit ausdrücklichem --hochladen.
#
# Läuft lokal beim Betreiber und nicht in der CI, weil Zertifikate,
# Provisioning-Profil und API-Schlüssel dort liegen und nirgends sonst. Nichts
# davon gehört ins Repository; das Skript liest alles aus Umgebungsvariablen:
#
#   MAS_TEAM_ID               Team-ID aus dem Apple-Entwicklerkonto (10 Zeichen)
#   MAS_ZERTIFIKAT_APP        Signierzertifikat für das Programm, z. B.
#                             "3rd Party Mac Developer Application: Name (TEAMID)"
#                             oder "Apple Distribution: Name (TEAMID)"
#   MAS_ZERTIFIKAT_INSTALLER  Signierzertifikat für das Paket, z. B.
#                             "3rd Party Mac Developer Installer: Name (TEAMID)"
#   MAS_PROVISIONING_PROFIL   Pfad zum Mac-App-Store-Provisioning-Profil
#                             (*.provisionprofile)
#
# Nur mit --hochladen zusätzlich:
#
#   MAS_API_SCHLUESSEL_ID     Schlüssel-ID des App-Store-Connect-API-Schlüssels
#   MAS_API_AUSSTELLER        Issuer-ID dazu
#
# Die zugehörige Datei AuthKey_<Schlüssel-ID>.p8 erwartet altool in
# ./private_keys, ~/private_keys, ~/.private_keys oder
# ~/.appstoreconnect/private_keys.
#
# Eigene Namen statt der APPLE_*-Variablen, die tauri build kennt: Sind diese
# gesetzt, versucht Tauri zu notarisieren. Eine Store-Fassung wird aber nicht
# notarisiert, sondern von Apple bei der Einreichung geprüft. Das Skript nimmt
# sie deshalb für den Bau ausdrücklich aus der Umgebung.
#
# Aufruf:
#   scripts/mac-app-store.sh              bauen, signieren, verpacken
#   scripts/mac-app-store.sh --hochladen  dasselbe und zu App Store Connect hochladen
#   scripts/mac-app-store.sh --probe      unsignierter Probebau nur für die eigene
#                                         Architektur, ohne Zertifikate; prüft
#                                         Berechtigungen und fehlenden Updater

set -euo pipefail

hochladen=0
probe=0
for arg in "$@"; do
  case "$arg" in
    --hochladen) hochladen=1 ;;
    --probe) probe=1 ;;
    -h|--help)
      sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unbekannte Angabe: $arg (erlaubt: --hochladen, --probe, --help)" >&2
      exit 2
      ;;
  esac
done

if [[ $probe -eq 1 && $hochladen -eq 1 ]]; then
  echo "--probe und --hochladen schließen einander aus: Ein Probebau ist unsigniert." >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Die Mac-App-Store-Fassung lässt sich nur unter macOS bauen." >&2
  exit 1
fi

wurzel="$(cd "$(dirname "$0")/.." && pwd)"
cd "$wurzel"

fehlt=()
pruefe_variable() {
  if [[ -z "${!1:-}" ]]; then
    fehlt+=("$1  ($2)")
  fi
}

if [[ $probe -eq 0 ]]; then
  pruefe_variable MAS_TEAM_ID "Team-ID aus developer.apple.com, Mitgliedschaft"
  pruefe_variable MAS_ZERTIFIKAT_APP "Name des Zertifikats \"3rd Party Mac Developer Application\" bzw. \"Apple Distribution\""
  pruefe_variable MAS_ZERTIFIKAT_INSTALLER "Name des Zertifikats \"3rd Party Mac Developer Installer\""
  pruefe_variable MAS_PROVISIONING_PROFIL "Pfad zum Provisioning-Profil für den Mac App Store"
fi
if [[ $hochladen -eq 1 ]]; then
  pruefe_variable MAS_API_SCHLUESSEL_ID "Schlüssel-ID des App-Store-Connect-API-Schlüssels"
  pruefe_variable MAS_API_AUSSTELLER "Issuer-ID des App-Store-Connect-API-Schlüssels"
fi

if [[ ${#fehlt[@]} -gt 0 ]]; then
  echo "Abbruch: Diese Umgebungsvariablen fehlen:" >&2
  for f in "${fehlt[@]}"; do echo "  - $f" >&2; done
  echo >&2
  echo "Erklärung steht im Kopf dieses Skripts (scripts/mac-app-store.sh --help)." >&2
  exit 1
fi

if [[ $probe -eq 0 ]]; then
  if [[ ! "$MAS_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
    echo "Abbruch: MAS_TEAM_ID \"$MAS_TEAM_ID\" sieht nicht nach einer Team-ID aus (zehn Großbuchstaben oder Ziffern)." >&2
    exit 1
  fi
  if [[ ! -f "$MAS_PROVISIONING_PROFIL" ]]; then
    echo "Abbruch: Das Provisioning-Profil \"$MAS_PROVISIONING_PROFIL\" gibt es nicht." >&2
    exit 1
  fi
  for zertifikat in "$MAS_ZERTIFIKAT_APP" "$MAS_ZERTIFIKAT_INSTALLER"; do
    # Ohne -v: Installer-Zertifikate sind keine Codesigning-Identitäten im
    # Sinne von find-identity -p codesigning und fielen sonst durch.
    if ! security find-identity | grep -qF "\"$zertifikat\""; then
      echo "Abbruch: Das Zertifikat \"$zertifikat\" liegt nicht im Schlüsselbund." >&2
      exit 1
    fi
  done
fi
if [[ $hochladen -eq 1 ]]; then
  schluessel="AuthKey_${MAS_API_SCHLUESSEL_ID}.p8"
  gefunden=0
  for ort in ./private_keys ~/private_keys ~/.private_keys ~/.appstoreconnect/private_keys; do
    [[ -f "$ort/$schluessel" ]] && gefunden=1
  done
  if [[ $gefunden -eq 0 ]]; then
    echo "Abbruch: $schluessel liegt in keinem der Ordner, in denen altool sucht" >&2
    echo "(./private_keys, ~/private_keys, ~/.private_keys, ~/.appstoreconnect/private_keys)." >&2
    exit 1
  fi
fi

# Der Store verlangt ein universelles Programm (Apple Silicon und Intel). Der
# Probebau bleibt bei der eigenen Architektur, damit er ohne zweites
# Rust-Ziel auskommt.
if [[ $probe -eq 1 ]]; then
  ziel="$(rustc -vV | sed -n 's/^host: //p')"
  ziele=("$ziel")
else
  ziel="universal-apple-darwin"
  ziele=(aarch64-apple-darwin x86_64-apple-darwin)
fi
sysroot="$(rustc --print sysroot)"
for t in "${ziele[@]}"; do
  if [[ ! -d "$sysroot/lib/rustlib/$t" ]]; then
    echo "Abbruch: Das Rust-Ziel $t ist nicht installiert (rustup target add $t)." >&2
    exit 1
  fi
done

# Proc-Macros im Release-Profil nicht strippen. Mit Xcode 27 lädt rustc die
# gestrippten Bibliotheken nicht mehr („mis-aligned LINKEDIT string pool"),
# und der Bau bricht mit „can't find crate for serde_derive" u. ä. ab. Das
# betrifft nur Werkzeuge, die während des Baus laufen, nicht das Programm.
export CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP="${CARGO_PROFILE_RELEASE_BUILD_OVERRIDE_STRIP:-none}"

version="$(node -p "require('./src-tauri/tauri.conf.json').version")"
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

# JSON-Zeichenkette aus einem Pfad. Pfade mit Anführungszeichen oder
# Backslashes sind selten, sollen das Überlagerungs-JSON aber nicht zerbrechen.
json_text() {
  local s="${1//\\/\\\\}"
  printf '"%s"' "${s//\"/\\\"}"
}

if [[ $probe -eq 1 ]]; then
  # Ohne Profil: Es liegt beim Probebau in der Regel nicht vor, und ohne
  # Signatur hätte es ohnehin keine Wirkung.
  cat >"$temp/ueberlagerung.json" <<EOF
{ "bundle": { "macOS": { "files": { "embedded.provisionprofile": null } } } }
EOF
else
  # Die Team-ID in eine Kopie der Berechtigungen einsetzen. Die Datei im
  # Repository behält den Platzhalter.
  sed "s/TEAM_ID/$MAS_TEAM_ID/g" src-tauri/Entitlements.appstore.plist >"$temp/Entitlements.plist"
  if grep -q "TEAM_ID" "$temp/Entitlements.plist"; then
    echo "Abbruch: In den Berechtigungen steht noch der Platzhalter TEAM_ID." >&2
    exit 1
  fi
  cat >"$temp/ueberlagerung.json" <<EOF
{
  "bundle": {
    "macOS": {
      "entitlements": $(json_text "$temp/Entitlements.plist"),
      "files": { "embedded.provisionprofile": $(json_text "$MAS_PROVISIONING_PROFIL") }
    }
  }
}
EOF
fi

bau_argumente=(
  --config src-tauri/tauri.appstore.conf.json
  --config "$temp/ueberlagerung.json"
  --target "$ziel"
  --bundles app
)
if [[ $probe -eq 1 ]]; then
  bau_argumente+=(--no-sign)
fi

# Als Feld, weil der Zertifikatsname Leerzeichen enthält.
signatur=()
if [[ $probe -eq 0 ]]; then
  signatur=("APPLE_SIGNING_IDENTITY=$MAS_ZERTIFIKAT_APP")
fi

echo "==> Baue Chefsachen $version für den Mac App Store ($ziel)"
# Ohne die APPLE_*-Variablen, siehe oben: Sie lösten eine Notarisierung aus.
# Die Schreibweise ${feld[@]+…} braucht das Bash 3.2 von macOS, das ein leeres
# Feld unter `set -u` sonst für ungesetzt hält.
env -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
  -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH \
  -u APPLE_SIGNING_IDENTITY -u APPLE_CERTIFICATE -u APPLE_CERTIFICATE_PASSWORD \
  ${signatur[@]+"${signatur[@]}"} \
  npx tauri build "${bau_argumente[@]}" -- --no-default-features --features mac-app-store

# CARGO_TARGET_DIR beachten: Liegt das Projekt in einem synchronisierten
# Ordner (iCloud), gehört das Bauverzeichnis besser woandershin.
app="${CARGO_TARGET_DIR:-src-tauri/target}/$ziel/release/bundle/macos/Chefsachen.app"
if [[ ! -d "$app" ]]; then
  echo "Abbruch: Das gebaute Programm liegt nicht unter $app." >&2
  exit 1
fi

# Der Updater darf im Store-Bau nicht einmal als toter Code stecken
# (Richtlinie 2.4.5). Das Feature sorgt dafür; diese Probe fängt ab, dass es
# jemand versehentlich doch wieder hineinzieht.
if strings "$app/Contents/MacOS/chefsachen" | grep -q "tauri_plugin_updater\|tauri-plugin-updater"; then
  echo "Abbruch: Im Programm steckt der Updater. Mit --no-default-features gebaut?" >&2
  exit 1
fi
echo "==> Kein Updater im Programm"

if [[ $probe -eq 1 ]]; then
  # Ad-hoc signieren, nur um zu sehen, dass die Berechtigungen sich anbringen
  # lassen und die Sandbox darin steht. Eine Ad-hoc-Signatur nimmt der Store
  # nicht an.
  codesign --force --sign - --entitlements src-tauri/Entitlements.appstore.plist "$app"
  if ! codesign -d --entitlements - "$app" 2>/dev/null | grep -q "com.apple.security.app-sandbox"; then
    echo "Abbruch: Die Sandbox-Berechtigung fehlt in der Signatur." >&2
    exit 1
  fi
  [[ -f "$app/Contents/Resources/PrivacyInfo.xcprivacy" ]] \
    || { echo "Abbruch: PrivacyInfo.xcprivacy fehlt im Programm." >&2; exit 1; }
  echo "==> Probebau in Ordnung: $app"
  exit 0
fi

if ! codesign -d --entitlements - "$app" 2>/dev/null | grep -q "$MAS_TEAM_ID.de.chefsachen.app"; then
  echo "Abbruch: Die Signatur trägt nicht die Berechtigungen mit Team-ID $MAS_TEAM_ID." >&2
  exit 1
fi

ausgabe="${CARGO_TARGET_DIR:-src-tauri/target}/mac-app-store"
mkdir -p "$ausgabe"
paket="$ausgabe/Chefsachen-$version.pkg"
echo "==> Verpacke und signiere $paket"
xcrun productbuild --sign "$MAS_ZERTIFIKAT_INSTALLER" --component "$app" /Applications "$paket"

if [[ $hochladen -eq 0 ]]; then
  echo "==> Fertig: $paket"
  echo "    Hochladen mit --hochladen oder über die App Transporter."
  exit 0
fi

echo "==> Lade $paket zu App Store Connect hoch"
xcrun altool --upload-app --type macos --file "$paket" \
  --apiKey "$MAS_API_SCHLUESSEL_ID" --apiIssuer "$MAS_API_AUSSTELLER"
echo "==> Hochgeladen. Der Bau erscheint nach der Verarbeitung in App Store Connect."
