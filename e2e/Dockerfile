# Linux-Umgebung für den browsergetriebenen Durchstich.
#
# `tauri-driver` spricht WebDriver mit der Webview des Betriebssystems. Auf
# macOS gibt es dafür nichts: WKWebView kennt kein WebDriver, und Apple bietet
# auch keins an. Deshalb läuft dieser Teil unter Linux — in der CI ohnehin, und
# lokal über diesen Container.
FROM rust:1-trixie

ENV DEBIAN_FRONTEND=noninteractive

# webkit2gtk-driver ist der WebDriver zur Webview, die Tauri unter Linux nutzt.
# xvfb stellt die Bildschirmfläche, die eine Fensteranwendung auch dann
# braucht, wenn niemand hinsieht.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libwebkit2gtk-4.1-dev \
      libappindicator3-dev \
      librsvg2-dev \
      libssl-dev \
      patchelf \
      lld \
      build-essential \
      curl wget file \
      webkit2gtk-driver \
      xvfb \
      ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install tauri-driver --locked

WORKDIR /app
