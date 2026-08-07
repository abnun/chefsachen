# Umbenennung zu „Chefsachen“

## Kontext

Die App hieß bisher „Kleinunternehmer-Verwaltung“ — eine reine Beschreibung,
kein Produktname. Zur Namensfindung wurden mehrere Richtungen durchgespielt
(erfundene Marke, deutscher Begriff, englischer Funktionsname); die Wahl fiel
auf einen deutschen, funktionsbezogenen, locker-freundlichen Namen, der die
ganze App (Kunden, Artikel, Belege) als Oberbegriff trägt statt nur den
Beleg-Teil: **„Chefsachen“**.

## Sichtbare Änderungen

- `productName` und Fenstertitel (`src-tauri/tauri.conf.json`) →
  `Chefsachen`.
- `README.md`, `CHANGELOG.md` (neuer Eintrag unter der aktuellen Version),
  `TODO.md`: App-Name im Fließtext ersetzen, wo er als Eigenname auftaucht
  (nicht z. B. in Ordner-/Repo-Pfaden, siehe unten).
- Installer-Dateinamen ändern sich automatisch mit dem `productName`
  (z. B. `Chefsachen_x64-setup.exe` statt
  `Kleinunternehmer-Verwaltung_x64-setup.exe`).

## Technische Bezeichner

- Tauri `identifier` (`src-tauri/tauri.conf.json`):
  `de.kleinunternehmer.verwaltung` → `de.chefsachen.app`.
- `package.json` `name`: `kleinunternehmer-verwaltung` → `chefsachen`.
- `src-tauri/Cargo.toml` Paketname: `kleinunternehmer-verwaltung` →
  `chefsachen`; Lib-Name `kleinunternehmer_verwaltung_lib` →
  `chefsachen_lib`. Alle `use kleinunternehmer_verwaltung_lib::...`-Pfade in
  `main.rs`, `lib.rs` und Tests müssen entsprechend auf `chefsachen_lib`
  angepasst werden.

## Bewusst unverändert

- **GitHub-Repo bleibt `abnun/kleinunternehmer-verwaltung`** — Remote-URL,
  Updater-Endpoint (`plugins.updater.endpoints` in `tauri.conf.json`) und
  der lokale Projektordnername ändern sich nicht. Der Repo-Name ist rein
  intern/technisch sichtbar und wurde bewusst von der Produktnamen-Änderung
  entkoppelt, um Issue-/PR-Links, das lokale Git-Remote und den
  Updater-Endpoint nicht anzufassen.
- **Kein automatischer Migrationscode** für das App-Datenverzeichnis. Der
  identifier-Wechsel ändert den Pfad, unter dem Tauri die SQLite-Datenbank
  und Backups ablegt (macOS: `~/Library/Application Support/<identifier>/`
  analog für Windows). Da die App noch nicht produktiv im Einsatz ist,
  reicht ein einmaliges manuelles Kopieren des alten Datenordners in den
  neuen Pfad — es wird keine Erkennungs-/Übernahmelogik gebaut. Dies ist
  eine bewusste Grenze, betrifft aktuell nur den Entwickler selbst.
- **Icons/Branding bleiben unverändert** — nur der Name ändert sich, kein
  neues Logo oder Icon-Set.
- **Bundle-Signatur/Notarization-Konfiguration** bleibt technisch
  unverändert, nur der `identifier`-String selbst ändert sich (Teil der
  Signatur-Metadaten, aber kein neuer Prozess).

## Verifikation

1. `cargo build` — stellt sicher, dass der Lib-Rename konsistent ist (alle
   `use`-Pfade kompilieren).
2. `npm run build` — stellt sicher, dass keine Referenzen auf den alten
   `package.json`-Namen mehr bestehen.
3. Manueller Testlauf der App: Fenstertitel zeigt „Chefsachen“.
