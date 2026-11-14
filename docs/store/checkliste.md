# Checkliste: Einreichung in den Stores

Was der Betreiber selbst erledigen muss. Technisch ist alles vorbereitet;
es fehlen nur Konten, Zertifikate und die Angaben aus den Portalen.
Texte: `docs/store/texte.md`. Screenshots: `node vorschau/screenshots.mjs`.

## Mac App Store

### Einmalig: Werkzeuge

- [ ] Rust über `rustup` statt Homebrew, mit beiden Zielen:
      `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
      (für den universellen Bau, den der Store erwartet).
- [ ] Xcode mit Befehlszeilenwerkzeugen (`xcrun productbuild`, `xcrun altool`).

### Einmalig: Apple Developer (developer.apple.com)

- [ ] **App-ID** anlegen: Explicit, Bundle-ID `de.chefsachen.app`. Keine
      Capabilities nötig. Die Bundle-ID lässt sich später nicht ändern.
- [ ] **Zertifikate** (Certificates › +), beide mit derselben
      Zertifikatsanfrage aus der Schlüsselbundverwaltung:
  - [ ] „Mac App Distribution" (erscheint im Schlüsselbund als
        „3rd Party Mac Developer Application: …" bzw. „Apple Distribution: …")
  - [ ] „Mac Installer Distribution" („3rd Party Mac Developer Installer: …")
- [ ] **Provisioning-Profil** (Profiles › + › „Mac App Store Connect"),
      App-ID `de.chefsachen.app`, Distribution-Zertifikat auswählen,
      herunterladen. **Nicht ins Repository legen.**
- [ ] Team-ID notieren (Membership details, 10 Zeichen).

### Einmalig: App Store Connect (appstoreconnect.apple.com)

- [ ] Meine Apps › + › Neue App: Plattform macOS, Name „Chefsachen",
      Primärsprache Deutsch, Bundle-ID `de.chefsachen.app`, SKU z. B.
      `chefsachen-mac`. Ist der Name vergeben, Alternative wählen und
      `productName` **nicht** ändern (nur der Store-Name weicht ab).
- [ ] App-Informationen: Kategorie Wirtschaft/Finanzen, Altersfreigabe
      (alles „Nein" → 4+), Datenschutzrichtlinien-URL.
- [ ] App-Datenschutz: „Keine Daten erfasst" prüfen. Seit den
      Straßenvorschlägen gehen auf ausdrücklichen Wunsch des Nutzers
      Eingaben in Echtzeit an einen Dritten (Photon von komoot: getippter
      Text, PLZ/Ort, IP-Adresse). Die Funktion ist nach der Installation
      aus, und der Entwickler erhält nichts davon. Apple zählt Daten, die
      nur in Echtzeit zur Beantwortung einer Anfrage verarbeitet und nicht
      gespeichert werden, nicht als „erfasst"; ob das für komoot gilt,
      entscheidet der Betreiber anhand der Datenschutzerklärung von komoot.
      Sonst „Daten nicht mit dir verknüpft" › Standort (grob, über die
      IP-Adresse) bzw. „Andere Daten" angeben.
- [ ] Preise und Verfügbarkeit: kostenlos; Länder nach Wunsch (sinnvoll:
      Deutschland, Österreich, Schweiz, Luxemburg).
- [ ] Optional für `--hochladen`: Benutzer und Zugriff › Integrationen ›
      Individuelle Schlüssel › Schlüssel mit Rolle „Entwickler" anlegen.
      `AuthKey_<ID>.p8` (nur einmal herunterladbar) nach
      `~/.appstoreconnect/private_keys/`.

### Je Version

- [ ] Version in `package.json`, `src-tauri/Cargo.toml`,
      `src-tauri/tauri.conf.json` angehoben, `## <Version>` in
      `docs/CHANGELOG.md` vorhanden.
- [ ] Umgebung setzen und bauen:
      ```bash
      export MAS_TEAM_ID=XXXXXXXXXX
      export MAS_ZERTIFIKAT_APP="3rd Party Mac Developer Application: Markus Müller (XXXXXXXXXX)"
      export MAS_ZERTIFIKAT_INSTALLER="3rd Party Mac Developer Installer: Markus Müller (XXXXXXXXXX)"
      export MAS_PROVISIONING_PROFIL=~/Downloads/Chefsachen_MAS.provisionprofile
      scripts/mac-app-store.sh            # nur bauen
      scripts/mac-app-store.sh --hochladen # bauen und hochladen
      ```
      Alternativ das erzeugte `.pkg` mit der App **Transporter** hochladen.
- [ ] Vor dem Einreichen über **TestFlight** installieren und durchspielen:
      Einrichtung, Sicherung einspielen, Beleg anlegen, PDF und XRechnung
      exportieren (Speichern-Dialog!), Eingangsrechnung importieren
      (Öffnen-Dialog!), Logo wählen, Protokoll im Finder zeigen.
- [ ] Im Store-Eintrag der Version: Screenshots (2880×1800, mindestens
      eins, bis zehn), Werbetext, Beschreibung, Stichwörter, Neuerungen,
      Support-URL, Build auswählen.
- [ ] Hinweise für die Prüfung (App Review Information): „Kein Konto
      nötig. Beim ersten Start führt ein Assistent durch die Firmendaten;
      beliebige Testdaten genügen. Die App arbeitet vollständig offline.
      Einzige Ausnahme sind die Straßenvorschläge (Einstellungen ›
      Adressvorschläge), die nach der Installation aus sind; dafür das
      Recht network.client."
- [ ] Exportkonformität: Die Frage nach Verschlüsselung beantwortet
      `ITSAppUsesNonExemptEncryption = false` in `Info.plist` bereits.
- [ ] Zur Prüfung einreichen.

### Bekannte Prüfpunkte, auf die die Fassung vorbereitet ist

| Richtlinie | Umsetzung |
|---|---|
| 2.4.5(i) Sandbox | `Entitlements.appstore.plist`: `app-sandbox`, `files.user-selected.read-write` und `network.client` (nur für die Straßenvorschläge, die nach der Installation aus sind) |
| 2.4.5(vii) Updates nur über den Store | Updater-Crate im Store-Bau nicht enthalten, keine Suche in der Oberfläche |
| 3.1.1/3.2.2 keine Spendenaufrufe außerhalb des In-App-Kaufs | Spendenhinweis und -abschnitt im Store-Bau ausgeblendet |
| 5.1.1 Datenschutz | Datenschutzerklärung mit App-Abschnitt; `PrivacyInfo.xcprivacy` |
| 2.5.1 Keine privaten APIs | kein `macOSPrivateApi`, kein transparentes Fenster |

## Microsoft Store

### Einmalig: Partner Center (partner.microsoft.com)

- [ ] Als **Einzelperson** registrieren (für Einzelpersonen kostenlos;
      Identitätsprüfung dauert einige Tage).
- [ ] Apps und Spiele › Neues Produkt › **MSIX- oder PWA-App** (nicht
      „EXE oder MSI": das verlangte ein eigenes Code-Signing-Zertifikat).
- [ ] Namen „Chefsachen" reservieren.
- [ ] Produktverwaltung › Produktidentität: Werte notieren und im
      GitHub-Repository unter Settings › Secrets and variables › Actions ›
      **Variables** anlegen:
  - `MS_STORE_IDENTITAET` = Package/Identity/Name
  - `MS_STORE_HERAUSGEBER` = Package/Identity/Publisher (beginnt mit `CN=`)
  - `MS_STORE_HERAUSGEBER_ANZEIGENAME` = Package/Properties/PublisherDisplayName

### Je Version

- [ ] Workflow **Store** auf GitHub von Hand starten (Actions › Store ›
      Run workflow). Artefakt `Chefsachen.msix` herunterladen.
- [ ] Neue Einreichung: Pakete › MSIX hochladen (unsigniert; der Store
      signiert selbst).
- [ ] Preise: kostenlos. Eigenschaften: Kategorie „Geschäftlich",
      Datenschutzrichtlinien-URL. Altersfreigabe: IARC-Fragebogen
      (alles „Nein").
- [ ] Store-Einträge (Deutsch): Beschreibung, Screenshots (1920×1080),
      Stichwörter aus `texte.md`.
- [ ] Hinweis für die Zertifizierung: wie oben beim Mac App Store.
- [ ] Bekannte Einschränkung: Die App braucht die **WebView2-Laufzeit**.
      Windows 11 bringt sie mit, unter Windows 10 ist sie fast immer über
      Edge vorhanden. Mindestversion im Manifest: Windows 10 1809.

## Umzug bestehender Nutzer

Die Store-Fassungen sehen die Daten der GitHub-Fassung nicht (Sandbox bzw.
eigenes Paketverzeichnis). Weg: in der alten Fassung Einstellungen ›
Sicherung exportieren, in der Store-Fassung im Einrichtungsassistenten
„Ich nutze Chefsachen schon: Sicherung einspielen". Siehe
`docs/installation.md`.
