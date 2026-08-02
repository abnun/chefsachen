#!/usr/bin/env bash
# Baut die Anwendung für Linux und fährt den browsergetriebenen Durchstich.
#
# Läuft innerhalb des Containers aus e2e/Dockerfile (siehe e2e/README.md) und
# genauso in der CI auf Ubuntu.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Abhängigkeiten =="
npm ci

echo "== Anwendung bauen =="
# `tauri build --debug --no-bundle` statt `cargo build`: Ein reiner cargo-Bau
# im Debug-Profil erzeugt einen Entwicklungsbau, der die Oberfläche vom
# Vite-Server auf Port 1420 lädt (`build.devUrl`). Läuft der nicht, bleibt das
# Fenster leer — und der Test prüfte dann nur seine eigene Umgebung.
# Mit `tauri build` liegt die Oberfläche in der Binärdatei, samt der
# Inhaltsrichtlinie für den Auslieferungsfall. `--no-bundle` spart die
# Installationspakete, die hier niemand braucht.
#
# Ohne Optimierung: Der Durchstich prüft Verhalten, nicht Geschwindigkeit, und
# `gtk` mit voller Optimierung sprengt den Speicher kleiner Container (der
# Übersetzer wird mit SIGKILL beendet). Aus demselben Grund ein Auftrag nach dem
# anderen, sofern nicht anders vorgegeben.
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-1}"

# Ohne Debug-Informationen. Sie machen die Objektdateien um ein Vielfaches
# größer, und der Linker muss alles gleichzeitig im Speicher halten — bei rund
# 300 Bibliotheken wird er sonst vom Betriebssystem abgeschossen (SIGKILL).
# Für einen Durchstich, der Klicks prüft, sind sie ohnehin ohne Wert.
export CARGO_PROFILE_DEV_DEBUG=0

# lld kommt mit deutlich weniger Speicher aus als der voreingestellte
# GNU-Linker. Nur nehmen, wenn vorhanden — auf einem Runner ohne lld würde ein
# fest verdrahtetes Flag den Bau am Linker scheitern lassen statt ihn zu retten.
if command -v ld.lld >/dev/null 2>&1; then
  export RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=-fuse-ld=lld"
fi

npx tauri build --debug --no-bundle

echo "== Durchstich fahren =="
# Der Zielordner ist verschiebbar (CARGO_TARGET_DIR), der Pfad zur Binärdatei
# also nicht fest. Ihn zu raten hieße, den Test an einer Datei scheitern zu
# lassen, die es gibt — nur woanders.
ZIEL="${CARGO_TARGET_DIR:-src-tauri/target}/debug/kleinunternehmer-verwaltung"
test -x "$ZIEL" || { echo "Binärdatei nicht gefunden: $ZIEL" >&2; exit 1; }
export KUV_BINARY="$(realpath "$ZIEL")"
echo "Anwendung: $KUV_BINARY"

cd e2e
npm install
npm test
