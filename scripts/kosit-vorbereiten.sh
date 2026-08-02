#!/usr/bin/env bash
# Lädt den offiziellen KoSIT-Validator samt XRechnung-Konfiguration in einen
# lokalen Cache. Danach prüft `cargo test` die erzeugten XRechnung-Dateien
# gegen die amtlichen Schematron-Regeln statt nur gegen selbstgeschriebene
# Zeichenketten-Vergleiche.
#
# Der Cache liegt bewusst außerhalb der Versionsverwaltung: die Artefakte sind
# zusammen rund 11 MB und würden sonst dauerhaft in der Git-Historie liegen,
# auch nach einem Versionswechsel.
#
# Aufruf:  ./scripts/kosit-vorbereiten.sh
set -euo pipefail

VALIDATOR_VERSION="1.6.2"
KONFIGURATION_VERSION="2026-01-31"
XRECHNUNG_VERSION="3.0.2"

cache="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/.validator-cache"
mkdir -p "$cache"

jar="$cache/validator.jar"
if [ ! -f "$jar" ]; then
  echo "Lade KoSIT-Validator $VALIDATOR_VERSION …"
  curl -sSL --fail -o "$jar.tmp" \
    "https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar"
  mv "$jar.tmp" "$jar"
else
  echo "Validator bereits vorhanden."
fi

if [ ! -f "$cache/config/scenarios.xml" ]; then
  echo "Lade XRechnung-Konfiguration $KONFIGURATION_VERSION (XRechnung $XRECHNUNG_VERSION) …"
  curl -sSL --fail -o "$cache/config.zip" \
    "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v${KONFIGURATION_VERSION}/xrechnung-${XRECHNUNG_VERSION}-validator-configuration-${KONFIGURATION_VERSION}.zip"
  mkdir -p "$cache/config"
  unzip -q -o "$cache/config.zip" -d "$cache/config"
  rm -f "$cache/config.zip"
else
  echo "Konfiguration bereits vorhanden."
fi

if ! command -v java >/dev/null 2>&1; then
  echo
  echo "Hinweis: Es ist keine Java-Laufzeit installiert — der Validator braucht eine."
  echo "         Unter macOS etwa mit:  brew install openjdk"
  echo "         Ohne Java überspringt sich der Validierungstest mit einer Meldung."
  exit 0
fi

echo "Fertig. 'cargo test' validiert jetzt gegen die amtlichen Regeln."
