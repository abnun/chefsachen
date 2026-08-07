#!/usr/bin/env bash
# Richtet die beiden externen Prüfer ein, gegen die `cargo test` die erzeugten
# Dokumente misst:
#
#   * KoSIT-Validator  — amtliche Schematron-Regeln für XRechnung
#   * veraPDF          — Referenzprüfer für PDF/A (ZUGFeRD verlangt PDF/A-3)
#
# Ohne sie bestätigen die Tests nur, dass der Code tut was er tut, nie dass das
# Ergebnis der Norm entspricht.
#
# Der Cache liegt bewusst außerhalb der Versionsverwaltung: die Artefakte sind
# zusammen rund 50 MB und würden sonst dauerhaft in der Git-Historie liegen,
# auch nach einem Versionswechsel.
#
# Aufruf:  ./scripts/kosit-vorbereiten.sh
set -euo pipefail

VALIDATOR_VERSION="1.6.2"
VERAPDF_VERSION="1.30.2"
KONFIGURATION_VERSION="2026-01-31"
XRECHNUNG_VERSION="3.0.2"

# Erwartete SHA-256-Summen der Downloads. Bei den beiden KoSIT-Artefakten
# sind es versionierte GitHub-Release-URLs — der Hash bestätigt lediglich,
# dass der Download nicht manipuliert oder beschädigt wurde. Bei veraPDF ist
# die URL UNVERSIONIERT (software.verapdf.org liefert immer den aktuellen
# Installer) — hier friert der Hash den heute bekannten Stand ein. Ändert
# sich das Artefakt upstream, schlägt der Download unten bewusst fehl, statt
# unbemerkt eine neue, ungeprüfte Version zu installieren.
VALIDATOR_SHA256="244978514ad48f67c7573acfffc8f4fd73d81feda6f276710033f9913579857e"
KONFIGURATION_SHA256="6a5a5911a421b25fbc423f62f93f894df7b236f5d73ca4f84bb222a945082704"
VERAPDF_SHA256="6cc6341cb1af644044054b81f00a6590a7918abb18f762243de115258bcad838"

# Portable SHA-256-Prüfung: `shasum -a 256 -c -` gibt es auf macOS,
# `sha256sum -c -` auf den meisten Linux-Distributionen (u. a. GitHub-Runnern).
pruefe_sha256() {
  datei="$1"
  hash="$2"
  fehlermeldung="$3"
  if command -v sha256sum >/dev/null 2>&1; then
    if ! echo "$hash  $datei" | sha256sum -c - >/dev/null 2>&1; then
      echo "$fehlermeldung" >&2
      exit 1
    fi
  elif command -v shasum >/dev/null 2>&1; then
    if ! echo "$hash  $datei" | shasum -a 256 -c - >/dev/null 2>&1; then
      echo "$fehlermeldung" >&2
      exit 1
    fi
  else
    echo "Fehler: Weder sha256sum noch shasum verfügbar — kann Download nicht prüfen." >&2
    exit 1
  fi
}

cache="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/.validator-cache"
mkdir -p "$cache"

jar="$cache/validator.jar"
if [ ! -f "$jar" ]; then
  echo "Lade KoSIT-Validator $VALIDATOR_VERSION …"
  curl -sSL --fail -o "$jar.tmp" \
    "https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-standalone.jar"
  pruefe_sha256 "$jar.tmp" "$VALIDATOR_SHA256" \
    "KoSIT-Validator hat sich geändert — neue Version prüfen und Hash im Skript aktualisieren."
  mv "$jar.tmp" "$jar"
else
  echo "Validator bereits vorhanden."
fi

if [ ! -f "$cache/config/scenarios.xml" ]; then
  echo "Lade XRechnung-Konfiguration $KONFIGURATION_VERSION (XRechnung $XRECHNUNG_VERSION) …"
  curl -sSL --fail -o "$cache/config.zip" \
    "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v${KONFIGURATION_VERSION}/xrechnung-${XRECHNUNG_VERSION}-validator-configuration-${KONFIGURATION_VERSION}.zip"
  pruefe_sha256 "$cache/config.zip" "$KONFIGURATION_SHA256" \
    "XRechnung-Konfiguration hat sich geändert — neue Version prüfen und Hash im Skript aktualisieren."
  mkdir -p "$cache/config"
  unzip -q -o "$cache/config.zip" -d "$cache/config"
  rm -f "$cache/config.zip"
else
  echo "Konfiguration bereits vorhanden."
fi

if ! command -v java >/dev/null 2>&1; then
  echo
  echo "Hinweis: Es ist keine Java-Laufzeit installiert — beide Prüfer brauchen eine."
  echo "         Unter macOS etwa mit:  brew install openjdk"
  echo "         Ohne Java überspringen sich die Prüftests mit einer Meldung."
  exit 0
fi

# veraPDF wird über einen IzPack-Installer verteilt; er lässt sich mit einer
# Antwortdatei unbeaufsichtigt einrichten.
if [ ! -x "$cache/verapdf/verapdf" ]; then
  echo "Lade veraPDF $VERAPDF_VERSION …"
  arbeit="$(mktemp -d)"
  trap 'rm -rf "$arbeit"' EXIT
  curl -sSL --fail -o "$arbeit/verapdf.zip" "https://software.verapdf.org/releases/verapdf-installer.zip"
  pruefe_sha256 "$arbeit/verapdf.zip" "$VERAPDF_SHA256" \
    "veraPDF-Installer hat sich geändert — neue Version prüfen und Hash im Skript aktualisieren."
  unzip -q -o "$arbeit/verapdf.zip" -d "$arbeit"
  installer="$(find "$arbeit" -name "verapdf-izpack-installer-*.jar" | head -1)"
  if [ -z "$installer" ]; then
    echo "Fehler: Im Archiv wurde kein veraPDF-Installer gefunden." >&2
    exit 1
  fi
  cat > "$arbeit/auto-install.xml" <<XML
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
    <installpath>$cache/verapdf</installpath>
  </com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
    <pack index="0" name="veraPDF GUI" selected="true"/>
    <pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/>
    <pack index="2" name="veraPDF Validation model" selected="false"/>
    <pack index="3" name="veraPDF Documentation" selected="false"/>
    <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
  </com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
XML
  java -jar "$installer" "$arbeit/auto-install.xml" >/dev/null
else
  echo "veraPDF bereits vorhanden."
fi

echo "Fertig. 'cargo test' prüft jetzt XRechnung und PDF/A gegen die amtlichen Regeln."
