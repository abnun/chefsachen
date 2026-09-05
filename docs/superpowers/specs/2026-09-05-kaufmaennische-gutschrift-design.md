# Kaufmännische Gutschrift — Design

Stand: 2026-09-05. Bezug: `docs/TODO.md` Punkt 5.

## Ziel

Eine kaufmännische Gutschrift als eigene Belegart, für zwei Einstiege:

1. **Nachträgliche Teilkorrektur mit Rechnungsbezug** — nach einer gestellten
   Rechnung: Preisnachlass, Mängelrüge, Rabatt, teilweise zurückgegebene
   Position. Bezieht sich auf eine konkrete Rechnung, meist über einen
   Teilbetrag.
2. **Freie Gutschrift ohne Rechnungsbezug** — Kulanz, Guthaben, Ausgleich
   ohne konkrete Ursprungsrechnung. Eigenständiger negativer Beleg mit frei
   erfassten Positionen.

Das heutige **Vollstorno** (Status `storniert` am Ursprung + Gegenbeleg,
einmalig) bleibt unverändert daneben bestehen. Die Gutschrift ersetzt es
nicht.

**Nicht im Umfang:** Gutschriftverfahren nach § 14 Abs. 2 UStG
(Selbst-Abrechnung durch den Leistungsempfänger); automatischer
Verrechnungslauf Gutschrift↔Rechnung; Betragsobergrenze/Sperre; Verknüpfung,
die den offenen Betrag der Ursprungsrechnung verändert; DATEV/CSV-Bezug
(TODO-Punkt 1).

## Architekturentscheidung

Neuer `typ = 'gutschrift'` in der bestehenden `beleg`-Tabelle. Nutzt Editor,
Positionen, Zahlungen, Kunden-Snapshot, PDF- und E-Rechnungs-Pipeline
unverändert; es kommen nur `typ`-Verzweigungen hinzu — dasselbe Muster, das
Storno heute fährt.

Verworfen:

- **Eigene Tabellen für Gutschriften** — dupliziert Positions-, Zahlungs- und
  Exportlogik, zwei Pflegepfade für dieselbe Sache.
- **Gutschrift als „Teilstorno" auf dem Storno-Pfad** — Storno ist bewusst
  einmalig, immer voll, und kippt den Ursprungsstatus auf `storniert`. Die
  freie Gutschrift ohne Bezug passt da nicht rein, und die Einmaligkeit
  müsste aufgeweicht werden.

## 1. Datenmodell

**Migration `0022_gutschrift.sql`:**

- `beleg.typ` muss `'gutschrift'` zulassen. Der bestehende
  `CHECK (typ IN ('angebot','rechnung'))` lässt sich in SQLite nicht per
  `ALTER TABLE` ändern. Beim Umsetzen prüfen, welchen Weg das Repo bei
  früheren `beleg`-Umbauten gewählt hat (Tabelle neu anlegen + kopieren, oder
  CHECK entfernen und Gültigkeit backend-seitig erzwingen) und diesem Muster
  folgen. Default-Annahme: Tabelle-neu-anlegen-und-kopieren, weil das den
  Constraint erhält.
- Neue Spalte `beleg.gutschrift_zu_id TEXT REFERENCES beleg(id)` — nullable.
  Gesetzt bei „Gutschrift zu Rechnung X", `NULL` bei freier Gutschrift.
- Neuer Nummernkreis-Seed:
  `(<uuid>, 'gutschrift', 'GS-{JJJJ}-{lfd:4}', 0, 1, <jahr>, …)` —
  jahresweise zurücksetzbar (`jahres_reset = 1`), wie Rechnung und Angebot.
  Der Platzhalter für das Jahr heißt im Code `{JJJJ}` (nicht `{jahr}`).

**Betragskonvention** (wie Storno):

- `beleg.summe_cent` und `belegposition.positionssumme_cent` werden **negativ**
  gespeichert.
- `belegposition.einzelpreis_cent` wird ebenfalls negativ gespeichert (Storno
  macht das genauso, siehe `storniere_rechnung`).
- `belegposition.ust_satz_prozent` bleibt **positiv** — negativ ist der
  Betrag, nicht der Satz.
- Der Editor erfasst positiv (Brutto-Einzelpreis, Menge); das Backend negiert
  beim Speichern der Position.

## 2. Backend (`src-tauri/src/commands/belege.rs`, `src-tauri/src/domain/`)

### Neue Funktionen

- **Freie Gutschrift ohne Bezug:** über die vorhandene `create`-Funktion mit
  `typ = "gutschrift"` — `pruefe_beleg_neu` wird um den Typ erweitert,
  `BelegNeu` bekommt ein optionales `gutschrift_zu_id`. Der
  `useBelegListe`-Anlege-Pfad im Frontend funktioniert unverändert. Leerer
  Entwurf, Positionen frei.
- **Gutschrift mit Rechnungsbezug:** neue Funktion
  `gutschrift_aus_rechnung(rechnung_id: String) -> Beleg` + Tauri-Wrapper
  `gutschrift_aus_rechnung_anlegen`. Legt einen Entwurf an mit übernommenem
  Kunde, Rechnungsadresse/Ansprechpartner, Kopftext und **negativ** kopierten
  Positionen; `gutschrift_zu_id` gesetzt. Der Editor stellt die Beträge zur
  Anzeige/Bearbeitung positiv dar (`formatCent` zeigt die negative Belegsumme
  weiterhin negativ).
- **Festschreiben läuft über die vorhandene `stellen`-Funktion**, generalisiert
  (kein eigener Command):
  - Nummer aus Nummernkreis `gutschrift` **innerhalb der Transaktion**
    (`naechste_nummer(&mut tx, &beleg.typ, …)` trifft den Kreis automatisch),
    damit ein Abbruch keine Lücke hinterlässt.
  - Kunden-Snapshot einfrieren (`kunde_snapshot`), Adresse pflichtprüfen wie
    bei der Rechnung (§ 14 UStG gilt für die Gutschrift analog) — der
    `matches!(typ, "rechnung" | "gutschrift")`-Zweig.
  - Status → `festgeschrieben` (wie beim Angebot; nur die Rechnung wird
    `gestellt`).
  - Ab dann ist der Beleg unveränderbar (gleiche Sperren wie eine gestellte
    Rechnung). Die Archivierung der Exportdateien passiert wie bei allen
    Belegen erst beim Export (`ablegen` überschreibt eine vorhandene
    Archivdatei nicht), nicht im `stellen`.
  - Das Frontend ruft `api.belege.stellen(id)` auch für die Gutschrift; nur
    der Bestätigungsdialog bekommt einen Gutschrift-Wortlaut.

### Positionen, Update, Löschen

Die vorhandenen `position_*`-Funktionen bleiben unverändert — sie arbeiten
über `beleg_id`, nicht über `typ`. Das Negieren beim Speichern einer
Gutschrift-Position wird an genau einer Stelle im Speicherpfad ergänzt
(abhängig von `beleg.typ`), analog dazu, wie der Storno-Pfad negiert.

Löschen eines Gutschrift-**Entwurfs**: vorhandene `beleg_delete`-Logik
(soft-delete inkl. Positionen).

### Validierung

- `gutschrift_zu_id`, wenn gesetzt, muss auf einen Beleg mit `typ = 'rechnung'`,
  `status = 'gestellt'` und `storno_von_id IS NULL` zeigen. Abgelehnt: Angebot,
  Storno, andere Gutschrift, Entwurf, bereits `storniert`e Rechnung. (`gestellt`
  ist der einzige „lebende" Rechnungsstatus — Bezahltheit ist abgeleitet, kein
  eigener Status; `storniert` ist ein echter Status und wird ausgeschlossen.)
- **Mehrere Gutschriften zur selben Rechnung sind erlaubt** — kein
  Einmaligkeits-Constraint wie beim Storno.
- **Keine Betragsobergrenze** — Preisnachlässe, Skonto etc. sind legitim, auch
  wenn die Summe der Gutschriften die Rechnung übersteigt.
- Der Steuermodus (`kleinunternehmer`-Flag) kommt aus dem Kunden-Snapshot zum
  Festschreibe-Zeitpunkt, konsistent mit Rechnungen.

### Ursprungsrechnung bleibt unangetastet

Kein Statuswechsel, kein reduzierter offener Betrag. Gutschrift und Rechnung
sind getrennte Belege (wie Storno). Der Zusammenhang lebt in
`gutschrift_zu_id` und auf dem PDF/in der E-Rechnung (BG-3).

### Erstattungen

Über die vorhandene `zahlung`-Erfassung mit **negativem** Betrag (heute schon
für Storno-Rückzahlungen genutzt, siehe Test
`zahlung … "Rückzahlung nach Storno"`). `zahlungsstand`/`faellig_am` werden
über die bestehende Vorzeichenlogik in `domain/beleg.rs::zahlungsstand`
abgeleitet — die deckt negative Summen bereits ab (Test
`zahlungsstand_beruecksichtigt_gutschriften`).

## 3. Editor & Navigation (Frontend)

### Neuer Menüpunkt „Gutschriften"

- `src/pages/Gutschriften.tsx` — Liste analog `Rechnungen.tsx`: Nummer,
  Kunde, Datum, Betrag (negativ dargestellt), Zahlungsstand, Bezug
  („zu RE-2026-0007" oder „—").
- `⌘N` / `Strg+N` legt eine **freie** Gutschrift an (Kundenauswahl-Dialog,
  dann `gutschrift_anlegen(kunde_id, None)`).
- `⌘F` / `Strg+F` springt in die Suche.
- Leerer Zustand als Hinweisbox (wie die übrigen Listen).
- Eintrag in die Hauptnavigation.

### Einstieg mit Bezug

Im `BelegEditor` einer **gestellten Rechnung** (kein Storno) ein Knopf
„Gutschrift erstellen" → `api.belege.gutschriftAusRechnung(rechnung_id)`,
öffnet den Editor auf dem neuen Entwurf. `App.tsx` bekommt dafür einen Callback
`onGutschriftErstellt`, der auf die Gutschriften-Seite umschaltet (Muster:
`onRechnungErstellt` im Angebote-Zweig).

### Editor-Zweig

`src/pages/BelegEditor.tsx` bekommt einen `typ === "gutschrift"`-Zweig:

- Wiederverwendet Stammdaten-, Positionen- und Zahlungen-Karte.
- Keine Angebots-/Storno-Knöpfe. „Als Kopie anlegen" bleibt (dupliziert die
  Gutschrift als bezugslosen Entwurf — akzeptabel).
- Hauptaktion: Knopf „Festschreiben" → `api.belege.stellen(id)`, mit
  Gutschrift-Wortlaut im Bestätigungsdialog.
- Bei Bezug: unter dem Titel „Gutschrift zu Rechnung RE-2026-0007". Die Nummer
  kommt über ein neues Feld `gutschrift_zu_nummer` in `BelegDetail` (Backend
  `get` lädt sie analog `kontext_aus_beleg`).
- Positionen werden **negativ** gespeichert; die Belegsumme wird negativ
  angezeigt (`formatCent(-…)`). Beim Bearbeiten einer Position tippt der Nutzer
  positiv, das Backend negiert.
- XRechnung/ZUGFeRD-Export-Knöpfe auch für die Gutschrift (`typ` rechnung
  **oder** gutschrift). Keine Zahlungserinnerung.
- `useListenTastenkuerzel` und die zentrale Statusfarben-Tabelle um Typ/Status
  ergänzen.

### API

`src/api.ts`: `belege.gutschriftAusRechnung(rechnungId)` (→
`gutschrift_aus_rechnung_anlegen`); `belege.list`-Typunion und `BelegNeu`/
`Beleg` um Gutschrift-Felder erweitern; `belege.stellen` deckt die Gutschrift
mit ab.

## 4. PDF-Vorlage (`src-tauri/templates/rechnung.typ`, `src-tauri/src/dokument/pdf.rs`)

- Titel-Verzweigung in `dokument_bauen`: `typ == "gutschrift"` → **„Gutschrift"**
  (neben „Angebot", „Rechnungskorrektur" für Storno, „Rechnung").
- Der Kontext bekommt ein **paralleles** Feld `gutschrift_zu_nummer` neben dem
  bestehenden `storno_von_nummer` (kein Rename — die beiden haben verschiedene
  Kopfzeilen-Texte, und der Storno-Pfad bleibt so unangetastet). Für den
  BG-3-Block in `xrechnung.rs` werden beide zu einem lokalen
  `bezug_nummer = storno_von_nummer.or(gutschrift_zu_nummer)` zusammengefasst.
- Kopfzeile bei Bezug: „Gutschrift zu Rechnung RE-2026-0007".
- **Kein Girocode** — die vorhandene Wache in `pdf.rs`
  (`typ == "rechnung" && storno_von_id.is_none()`) wird auf „nur echte
  Rechnung, kein Storno, keine Gutschrift" präzisiert.
- **Kein Fälligkeitsdatum** als Zahlungsaufforderung. Stattdessen Freitext aus
  `fusstext`, vorbelegt mit einem Erstattungshinweis (z. B. „Der Betrag wird
  Ihnen erstattet bzw. mit der nächsten Rechnung verrechnet.").
- Steueraufschlüsselung je Satz (§ 14 Abs. 4 Nr. 7–8 UStG) und §-19-Hinweis:
  unverändert aus dem Rechnungszweig — greift für Gutschriften genauso
  (Beträge negativ).
- Weiterhin PDF/A-3b (veraPDF-Test).

## 5. E-Rechnung (`src-tauri/src/dokument/xrechnung.rs`, `zugferd.rs`, `kontext.rs`)

- `type_code` in `xrechnung.rs` (heute
  `if storno_von_id.is_some() { "384" } else { "380" }`) wird zu:
  - `typ == "gutschrift"` → **`381`** (Gutschriftanzeige / Credit note)
  - Storno → `384` (unverändert)
  - sonst → `380`
- Beträge gehen wie beim Storno als `.abs()` ins XML; die Gutschrift-Semantik
  trägt der TypeCode. Summenproben bleiben damit exakt.
- **BG-3 (`ram:InvoiceReferencedDocument`)** wird gesetzt, wenn `bezug_nummer`
  vorhanden ist: bei Gutschrift mit Rechnungsbezug
  ja, bei freier Gutschrift nein.
- **Offene Prüfung beim Umsetzen (Spike):** verlangt der KoSIT-CIUS
  (XRechnung 3.0.2) BG-3 für TypeCode 381 zwingend? Falls ja:
  - `xrechnung::pruefe_exportierbarkeit` lehnt die freie Gutschrift ohne Bezug
    für den XRechnung-/ZUGFeRD-Export ab, mit erklärendem Hinweis im Editor
    (analog zur heutigen Käuferreferenz-/Leitweg-ID-Prüfung).
    Die PDF-Ausgabe bleibt in dem Fall trotzdem möglich.
  - Falls BG-3 für 381 optional ist: freie Gutschrift ist auch als E-Rechnung
    exportierbar.
- Neue KoSIT-Normtests (laufen mit `KOSIT_PFLICHT=1` in der CI):
  - Gutschrift mit Bezug, Kleinunternehmer (Kategorie E)
  - Gutschrift mit Bezug, regelbesteuert (Kategorie S)
  - Gutschrift ohne Bezug (bzw. der dokumentierte Ablehnungsfall)

## 6. Auswertung & Dashboard

- **Jahresauswertung** (`commands/auswertung.rs`): **keine Codeänderung** — die
  Abfrage summiert `zahlung.betrag_cent` über alle Belegarten. Eine als
  Erstattung erfasste negative Zahlung mindert damit automatisch die
  vereinnahmten Einnahmen des Auszahlungsjahres (Zuflussprinzip). Nur neue
  Tests.
- **Dashboard-Umsatzgrenzen** (`commands/dashboard.rs`, `SUM(z.betrag_cent)`):
  ebenso automatisch — eine Erstattung senkt den laufenden Umsatz, konsistent
  mit der heutigen Storno-Behandlung. Nur neue Tests.
- **Offene Posten** (`commands/belege.rs::offene_posten`): **keine
  Codeänderung** — die Abfrage filtert bereits `typ = 'rechnung'`, Gutschriften
  erscheinen nie in der Liste. Nur ein absichernder Test.
- Eine eigene Zeile „offene Erstattungen" im Dashboard bleibt vorerst weg
  (YAGNI).

## 7. Tests

### Rust

- `gutschrift_anlegen` mit und ohne Bezug; Vorlagenübernahme der Positionen.
- Ablehnung von Bezug auf Angebot, Storno, andere Gutschrift, Entwurf,
  stornierte Rechnung.
- Mehrere Gutschriften zur selben Rechnung erlaubt.
- Nummernkreis `gutschrift` zählt getrennt hoch und resettet jahresweise.
- `gutschrift_festschreiben` vergibt die Nummer transaktional, friert den
  Snapshot ein, macht den Beleg unveränderbar; Abbruch hinterlässt keine
  Lücke.
- Negative Positionssummen / negativer `einzelpreis_cent`, positiver
  `ust_satz_prozent`.
- `zahlungsstand` bei negativer Summe mit negativer Zahlung.
- KoSIT-Normtests (siehe 5).
- veraPDF für die Gutschrift-PDF.
- Auswertung und Dashboard-Umsatz mit einer Erstattung.
- Storno-Regressionstest: Umstellung von `storno_von_nummer` auf das generische
  Bezugsfeld ändert die Storno-Ausgabe nicht.

### Frontend

- Gutschriften-Liste rendert, leerer Zustand als Box.
- „Gutschrift erstellen" aus dem Editor einer festgeschriebenen Rechnung.
- Editor-Zweig zeigt keine Rechnungs-/Angebots-/Storno-Knöpfe.
- Positionseingabe positiv → Anzeige/Summe negativ.
- Tastenkürzel `⌘N`/`⌘F` auf der Liste.

### E2E-Durchstich

Rechnung stellen → Gutschrift mit Bezug anlegen → Position kürzen →
festschreiben → PDF + XRechnung exportieren.

## Offene Punkte für die Umsetzung (im Plan zu klären)

1. Wie das Repo den `beleg.typ`-CHECK erweitert (Tabelle kopieren vs. CHECK
   entfernen) — an früheren `beleg`-Migrationen ablesen.
2. KoSIT-CIUS: BG-3 für TypeCode 381 Pflicht oder optional (Spike mit dem
   Validator) — entscheidet, ob die freie Gutschrift als E-Rechnung
   exportierbar ist.
