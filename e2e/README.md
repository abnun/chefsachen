# Browsergetriebener Durchstich

Startet die gebaute Anwendung und bedient sie über WebDriver — dieselbe
Oberfläche, dasselbe Webview, dieselben Klicks wie bei einem Nutzer.

## Warum das nicht auf macOS läuft

`tauri-driver` übersetzt zwischen WebDriver und der Webview des
Betriebssystems. Unter Linux ist das `WebKitWebDriver`, unter Windows
`msedgedriver`. Für WKWebView auf macOS gibt es kein Gegenstück — Apple liefert
keins, und niemand kann es nachbauen. Der Test läuft deshalb unter Linux: in
der CI ohnehin, lokal über den Container hier.

## Lokal fahren

```bash
docker build -f e2e/Dockerfile -t kuv-e2e e2e/
docker run --rm -v "$PWD":/app kuv-e2e ./e2e/lauf.sh
```

Der erste Lauf dauert lange — Rust übersetzt die gesamte Anwendung für Linux
neu, der macOS-Bau nützt dabei nichts.

## Was geprüft wird

Nicht die Fachlogik — die haben die Tests in `src/` und `src-tauri/src/`
gründlicher. Hier geht es um das, was nur im echten Fenster sichtbar wird:

- Die Oberfläche erscheint überhaupt. Ein blockiertes Skript oder ein Fehler
  beim ersten Aufbau ergibt ein leeres Fenster, in dem jede Fachlogik
  einwandfrei und trotzdem unbenutzbar ist.
- Sie reagiert auf Eingaben und Klicks.
- Die Inhaltsrichtlinie aus P5.7 blockiert nichts Eigenes.

Die Berechtigungen und die Erreichbarkeit der Befehle prüft `src-tauri/src/ipc.rs`
— das geht ohne Fenster und läuft deshalb überall.
