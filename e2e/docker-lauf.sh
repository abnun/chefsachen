#!/usr/bin/env bash
# Fährt den Durchstich lokal im Linux-Container.
#
# Das Arbeitsverzeichnis wird nur lesend eingehängt und im Container kopiert.
# Zwei Gründe:
#
#  * `node_modules` und `target` vom Mac enthalten Binärdateien für macOS. Ein
#    `npm ci` im eingehängten Ordner würde sie überschreiben und die
#    Entwicklungsumgebung des Rechners zerstören.
#  * Auf iCloud Drive liegen zudem Dubletten wie `esbuild 2/`, an denen npm
#    scheitert. (Siehe P0 in docs/TODO.md — das Projekt gehört von dort weg.)
#
# Der Cargo-Zielordner liegt in einem benannten Volume, damit der zweite Lauf
# nicht wieder alles übersetzt.
set -euo pipefail

cd "$(dirname "$0")/.."

docker volume create kuv-e2e-cargo >/dev/null

exec docker run --rm \
  -v "$PWD":/src:ro \
  -v kuv-e2e-cargo:/cargo-ziel \
  -e CARGO_TARGET_DIR=/cargo-ziel \
  kuv-e2e \
  bash -c '
    set -euo pipefail
    mkdir -p /build
    # --ignore-failed-read, weil iCloud Dateien auslagert: Sie stehen im
    # Verzeichnis, ihr Inhalt liegt aber in der Cloud und ist im Container nicht
    # abrufbar ("Resource deadlock avoided"). Betroffen sind nur Beiwerk-Ordner;
    # was der Bau braucht, ist ausgecheckt.
    tar -C /src --ignore-failed-read \
        --exclude=node_modules --exclude=target --exclude=.git \
        --exclude=dist --exclude=.validator-cache --exclude=.superpowers \
        -cf - . | tar -C /build -xf -
    cd /build && ./e2e/lauf.sh
  '
