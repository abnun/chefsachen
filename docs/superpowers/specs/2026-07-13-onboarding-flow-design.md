# Design: Onboarding-Flow (Erststart & Kundenanlage)

**Datum:** 2026-07-13
**Status:** Entwurf, mit Auftraggeber abgestimmt

## Ziel

Zwei Führungslücken schließen, die bei der manuellen Abnahme von Plan 4 aufgefallen sind:

1. Der Erststart-Assistent (`Einrichtung.tsx`) erklärt seine Schritte nicht, zeigt keinen Fortschritt und endet abrupt auf einer leeren Kundenliste ohne jede Anleitung, was als Nächstes zu tun ist.
2. Nach dem Anlegen eines neuen Kunden gibt es keinen Hinweis darauf, dass Adressen und Ansprechpartner noch fehlen — man muss von selbst wissen, dass es die Reiter gibt.

**Explizit außerhalb dieses Plans:** Ein app-weites, allgemeines Erfolgs-Feedback-Konzept (Toasts o. Ä. nach jeder Speichern-Aktion in der ganzen App) ist ein eigenes, noch offenes Thema (siehe Projekt-Gedächtnis). Dieser Plan baut lediglich die für die zwei oben genannten Lücken nötigen Hinweis-Bausteine — bewusst als kleine, wiederverwendbare Komponente, damit ein späterer app-weiter Feedback-Plan darauf aufbauen kann, statt sie zu ersetzen.

## Architektur

Eine neue, kleine Komponente `Hinweis` (`src/components/Hinweis.tsx`), visuell verwandt mit der bestehenden `Fehler`-Komponente (gleiches Box-Muster, aber eigene Farbgebung — neue Tokens `--hinweis-bg`/`--hinweis-text`/`--hinweis-rand`, analog zu `--fehler-*` in `tokens.css`, plus eine `.hinweis-box`-Klasse in `komponenten.css`). Zwei Modi:

- **Auto-verschwindend** (`autoDismissMs`-Prop, Default 4000ms): für Banner direkt nach einer Aktion.
- **Manuell wegklickbar** (`onSchliessen`-Callback, zeigt ein „×"): für Hinweise, die stehen bleiben sollen, bis der Nutzer sie aktiv schließt.

Wird an drei Stellen eingesetzt, alle unten beschrieben. Kein globaler Zustand, kein Context-Provider — jede Seite verwaltet ihren eigenen `zeigeHinweis`-State lokal, wie es die bestehenden `fehler`/`formFehler`-States in diesen Dateien bereits tun.

## Erststart-Assistent (`Einrichtung.tsx`)

Aus dem 4-Schritte- wird ein **5-Schritte-Assistent**:

1. Firmendaten — Erklärtext ergänzt: „Diese Angaben erscheinen später auf deinen Angeboten und Rechnungen."
2. Logo — Erklärtext ergänzt: „Optional — kann auch später in den Einstellungen hinzugefügt werden." (bereits vorhanden, bleibt)
3. Kleinunternehmer-Bestätigung — bereits ausführlich erklärt, bleibt unverändert
4. Nummernkreise — Erklärtext ergänzt: „Legt fest, wie deine Kunden-, Artikel-, Angebots- und Rechnungsnummern aufgebaut sind — änderbar in den Einstellungen."
5. **Neu: „Fertig"** — kein Formular, zwei gleichwertige Buttons:
   - „Ersten Kunden anlegen" (`btn btn-primaer`)
   - „Ersten Artikel anlegen" (`btn btn-primaer`)
   - Hinweistext darunter: „Firmendaten und Nummernkreise kannst du jederzeit in den Einstellungen ändern."

Jeder der beiden Buttons ruft `abschliessen()` auf (wie bisher der einzige Abschluss-Button) und übergibt zusätzlich ein Sprungziel an `onFertig`. `onFertig` bekommt einen neuen optionalen Parameter `zielSeite?: "kunden" | "artikel"`; `App.tsx` nutzt ihn, um nach der Einrichtung nicht nur `firma` neu zu laden, sondern auch `seite` zu setzen und einen neuen State `formularBeimStartZiel: "kunden" | "artikel" | null` zu befüllen.

**Einmal-Konsum-Mechanismus (wichtig, da `Kunden`/`Artikel` bei jedem Seitenwechsel neu gemountet werden):** `App.tsx` reicht `zeigeFormularBeimStart={formularBeimStartZiel === "kunden"}` (bzw. `"artikel"`) als Prop durch, zusammen mit einer Callback-Prop `onFormularUebernommen: () => void`. Die jeweilige Seite ruft `onFormularUebernommen()` einmalig in einem `useEffect` beim Mount auf, sobald sie das offene Formular gerendert hat; `App.tsx` setzt daraufhin `formularBeimStartZiel` zurück auf `null`. Ohne diesen Rückkanal würde das Formular bei jeder späteren Navigation zur Seite erneut aufklappen, nicht nur unmittelbar nach der Einrichtung — genau dasselbe Muster wird unten bei der Kunde↔Artikel-Verzahnung wiederverwendet.

Fortschrittsanzeige: `Schritt {schritt} von 5` als reiner Text über jeder `<h2>`, in `.seiten-kopf small`-ähnlichem Stil (gedämpfte Schriftfarbe, kleiner). Der „Fertig"-Schritt selbst zeigt keine Schrittzahl (kein „Schritt 5 von 5", da er kein Formular ist, sondern der Abschluss).

## Leerzustand-Hinweise (Kunde↔Artikel)

Rein datengetrieben, kein persistenter Onboarding-Zustand:

- **Kunden-Liste**: wenn `kunden.length === 0 && suche === ""` (nach dem ersten Laden), erscheint über der Tabelle ein `Hinweis` (manuell wegklickbar, kein Auto-Dismiss, da er so lange sinnvoll ist wie die Liste leer ist): „Noch keine Kunden — leg direkt los." Verschwindet automatisch (durch Neu-Rendern), sobald `kunden.length > 0` oder eine Suche aktiv ist — die zusätzliche `suche === ""`-Bedingung ist nötig, da `Kunden.tsx` ein Suchfeld hat und `kunden.length === 0` sonst auch „Suche ohne Treffer" bedeuten könnte, was fälschlich denselben Hinweis auslösen würde.
- **Artikel-Liste**: analog bei `artikel.length === 0`: „Noch keine Artikel oder Leistungen — leg direkt los."
- **Verzahnung nach dem Anlegen**: Sobald ein Kunde erfolgreich angelegt wurde UND zu diesem Zeitpunkt `artikel.length === 0` ist (Artikel-Liste wird dafür beim Laden der Kunden-Seite zusätzlich per `api.artikel.list()` abgefragt, analog zum bestehenden `api.kunden.list()`-Aufruf in `Artikel.tsx`), erscheint ein **auto-verschwindender** `Hinweis`-Banner: „Kunde angelegt — jetzt auch einen Artikel anlegen?" mit einem Link/Button, der zur Artikel-Seite mit offenem Formular navigiert (gleicher `zeigeFormularBeimStart`-Mechanismus wie beim Assistenten). Symmetrisch beim Artikel-Anlegen, wenn `kunden.length === 0`.

Diese Verzahnung funktioniert unabhängig vom Zeitpunkt — egal ob direkt nach dem Assistenten oder erst Tage später, solange eine der beiden Listen noch leer ist.

## Kundenanlage-Hinweis (Adresse/Ansprechpartner)

- **Banner** (auto-verschwindend, 4000ms): erscheint auf der Kundenliste unmittelbar nach erfolgreichem Anlegen eines Kunden: „Kunde angelegt — jetzt Adresse und Ansprechpartner ergänzen?" mit einem klickbaren Link (`<button type="button" className="btn-leise">` im Fließtext oder als eigenes Element im Banner) zur Detailseite des neuen Kunden (Reiter Adressen vorausgewählt, dafür bekommt `KundeDetail` einen optionalen `startReiter`-Prop statt immer mit „Stammdaten" zu starten).

  **Weiterleitung des Zielreiters:** `Kunden.tsx` kennt nur `onOeffnen(kundeId)` (Prop von `App.tsx`, wechselt lediglich die Ansicht) — welcher Reiter in `KundeDetail` initial offen sein soll, muss also ebenfalls über `App.tsx` transportiert werden. Analog zum `formularBeimStartZiel`-Mechanismus oben bekommt `App.tsx` einen State `kundeDetailStartReiter: Reiter | null`; der Banner-Link ruft eine neue Prop `onOeffnenMitReiter(kundeId, "adressen")` statt des einfachen `onOeffnen(kundeId)` auf, `App.tsx` setzt darüber `ausgewaehlterKunde` UND `kundeDetailStartReiter`, reicht Letzteres als `startReiter`-Prop an `KundeDetail` durch und setzt es nach Konsum (gleicher Einmal-Callback wie oben, `onReiterUebernommen`) wieder auf `null` zurück.
- **Dauerhaftes Symbol**: In der Kunden-Tabelle bekommt jede Zeile ohne hinterlegte Adresse ein kleines Hinweis-Icon direkt neben dem Namen — ein schlichtes, mit den bestehenden Nav-Icons aus `Layout.tsx` stilistisch konsistentes Inline-SVG (Kreis mit Ausrufezeichen, `stroke="currentColor"`, Farbe `--st-entwurf-text`, 14×14px), mit `title`-Attribut „Keine Adresse hinterlegt" für Barrierefreiheit. Verschwindet, sobald der Kunde eine Adresse hat.

**Backend-Erweiterung (klein, notwendig):** `kunde_list` liefert aktuell keine Adress-Information. Die Query in `src-tauri/src/commands/kunden.rs::list` wird um ein `hat_adresse`-Feld erweitert:

```sql
SELECT k.id, k.typ, k.name, k.kundennummer, k.zahlungsziel_tage, k.notizen, k.ust_idnr,
       k.email, k.leitweg_id, k.kaeuferreferenz,
       EXISTS(SELECT 1 FROM adresse a WHERE a.kunde_id = k.id AND a.deleted_at IS NULL) AS hat_adresse
FROM kunde k WHERE k.deleted_at IS NULL AND (lower(k.name) LIKE ? OR lower(k.kundennummer) LIKE ?)
ORDER BY k.name
```

Der `Kunde`-Struct (Rust) und der `Kunde`-TS-Typ bekommen beide ein neues Feld `hat_adresse: bool`. Nur `list` wird geändert — `get` (liefert bereits die volle Adressliste über `KundeDetail`) bleibt unverändert.

## Fehlerbehandlung

Alle neuen Hinweise sind rein informativ und lösen keine API-Aufrufe aus außer der Navigation (die bereits bestehende, geprüfte Pfade nutzt). Kein neuer Fehlerfall entsteht dadurch. Die Backend-Erweiterung (`hat_adresse`) folgt demselben `AppResult`/Fehlerpfad wie die bestehende `list`-Funktion — keine neue Fehlerquelle.

## Tests

- **Rust:** Test für `kunde_list`, der prüft, dass `hat_adresse` korrekt `true`/`false` liefert (ein Kunde mit Adresse, einer ohne).
- **Frontend:**
  - `Einrichtung.test.tsx`: neuer Schritt 5 rendert beide Buttons; Klick auf „Ersten Kunden anlegen" ruft `onFertig` mit `zielSeite: "kunden"` auf (bzw. Äquivalent, je nach finaler Prop-Signatur).
  - `App.test.tsx` (falls noch nicht vorhanden, sonst erweitern): `formularBeimStartZiel`/`kundeDetailStartReiter` werden nach Aufruf der jeweiligen Einmal-Callback-Prop (`onFormularUebernommen`/`onReiterUebernommen`) zurückgesetzt — Regressionsschutz gegen das „Formular öffnet sich bei jeder Navigation erneut"-Problem.
  - `Kunden.test.tsx`: Leerzustand-Hinweis erscheint bei leerer Liste ohne aktive Suche, bleibt aber aus, wenn `suche` gesetzt ist und die Liste (durch die Suche) leer ist; verschwindet bei gefüllter Liste; Warnsymbol erscheint nur bei Kunden mit `hat_adresse: false`.
  - `Artikel.test.tsx`: analoger Leerzustand-Test.
  - Neuer `Hinweis.test.tsx`: Komponente rendert Kinder/Text, `onSchliessen` wird bei Klick auf „×" aufgerufen, Auto-Dismiss-Verhalten wird mit `vi.useFakeTimers()` getestet.
