# Kritisches Review der Umsatzsteuer-Implementierung (Commit 7659bbc)

Vier unabhängige Prüfungen mit verschiedenen Blickwinkeln, nach dem
CI-grünen Erstcommit. Ergebnis: zwei echte Fehler, zwei Robustheitspunkte,
vier Text-/UX-Befunde — alle noch am selben Tag behoben.

## Befunde und Behebung

### 1. BR-CO-26: Export ohne USt-IdNr. wurde vom amtlichen Validator abgelehnt (fatal)

Der Verkäufer braucht nach EN 16931 mindestens eine Kennung (BT-29/BT-30)
oder eine USt-IdNr. (BT-31, schemeID VA) — die bloße Steuernummer (BT-32,
schemeID FC) erfüllt BR-CO-26 nicht. `pruefe_exportierbarkeit` ließ
„Steuernummer ODER USt-IdNr." durch; der Fehler existierte schon im
Kategorie-E-Pfad, wurde durch die Regelbesteuerung aber praxisrelevant
(Übergangsfall: regelbesteuert, USt-IdNr. noch nicht erteilt). Die
CI-Normtests sahen ihn nie, weil `test_kontext` immer eine USt-IdNr. trägt.
Der Prüfer hat den Verstoß per Saxon gegen das ausgelieferte KoSIT-Schematron
belegt.

**Fix:** Ohne USt-IdNr. wird die Steuernummer zusätzlich als
Verkäufer-Kennung BT-29 (`ram:ID`) geschrieben; mit USt-IdNr. bleibt die
Datei byte-identisch. Neuer KoSIT-Normtest `xrechnung_ohne_ustidnr_ist_normkonform`
deckt beide Steuermodi ab.

### 2. GoBD: Altbelege ohne Snapshot-Flag kippten nach dem Moduswechsel auf Regelbesteuerung

Das `kleinunternehmer`-Flag wird erst seit 0115cd0 (2026-07-12) in den
Kunden-Snapshot eingefroren. Ältere gestellte Belege haben es nicht; der
Fallback ging auf die *Live*-Firmeneinstellung — nach dem Wechsel zur
Regelbesteuerung hätte jeder solche Altbeleg beim erneuten Export plötzlich
Kategorie S mit Steuerausweis getragen statt Kategorie E mit § 19-Hinweis.

**Fix:** Fallback bei gestellten Belegen ist jetzt `true` (vor der
Einführung des Flags gab es ausschließlich Kleinunternehmer-Belege) — in
`kontext.rs::firma_aus_snapshot`, im Pfad ganz ohne Firmen-Snapshot und in
`belege.rs::get` (Entwürfe nehmen weiterhin die Live-Einstellung). Test:
`altbeleg_ohne_snapshot_flag_bleibt_nach_moduswechsel_kleinunternehmer`.

### 3. Rest-Cent-Verteilung konnte ein einzelnes Positionsnetto entstellen

13 × 0,01 € bei 19 % ergab Rest −2 ct komplett auf einer Position →
negatives BT-131; 10 × 0,04 € entsprechend ein Netto über dem Brutto.
Normkonform (keine EN-Regel verletzt), aber unschön und unnötig.

**Fix:** Der Rest wird cent-weise über die Positionen der Gruppe verteilt
(betragsgrößte zuerst, höchstens ±1 ct je Position, da |Rest| ≤ n/2).
Tests für beide Richtungen ergänzt.

### 4. PEPPOL-EN16931-R120 (Warnung): Menge × Einzelpreis wich vom Zeilennetto ab

Der auf ganze Cent gerundete Netto-Stückpreis multipliziert seinen
Rundungsfehler mit der Menge (10 × 9,99 € → 5 ct Abweichung > 2 ct
Toleranz). Kein Ablehnungsgrund (nur `warning`), aber Empfängersysteme mit
Peppol-Prüfung melden es.

**Fix:** BT-146 wird bei Regelbesteuerung aus dem Zeilennetto abgeleitet und
mit vier Nachkommastellen geschrieben (für Preise ausdrücklich zulässig).

### 5. UX: Irreführende § 19-Texte nach dem Moduswechsel

- Dashboard und Auswertung begründeten das Zuflussprinzip unbedingt mit
  „§ 19 (Abs. 2) UStG" — für Regelbesteuerer falsch zitiert (dort wäre
  § 20 UStG einschlägig). → Neutral als „Zuflussprinzip" formuliert.
- Der Einrichtungs-Assistent erklärte nicht, was das Abwählen des
  Kleinunternehmer-Häkchens bedeutet. → Hinweis ergänzt.
- Das Steuersatz-Feld am Artikel erschien Kleinunternehmern kommentarlos.
  → Hinweis „Wirkt nur bei Regelbesteuerung" ergänzt.

## Ausdrücklich geprüft, ohne Befund

- **Rundung:** `runde_division` (half away from zero) gegen exakte
  Bruchreferenz mit 200.000 Zufallswerten verifiziert; exakte .5-Fälle sind
  bei Nennern 107/119 aus Paritätsgründen unerreichbar.
- **BR-CO-17:** Maximale Abweichung beim Herausrechnen beweisbar
  ≤ 0,59 ct (19 %) bzw. ≤ 0,53 ct (7 %) — immer unter der
  1-Cent-Schematron-Toleranz (Brute-Force bis 20.000 € bestätigt).
- **Storno/Mischvorzeichen:** Gemischt-vorzeichige Positionen sind durch
  die Validierung unerreichbar; `.abs()`-Ansatz plus TypeCode 384 daher
  für alle erreichbaren Belege exakt. `aufschluesselung(−x) = −aufschluesselung(x)`.
- **SQL:** Alle vier INSERT-Pfade bind-für-bind gegen die Spaltenliste
  abgeglichen; Migration 0020 auf Bestands-DBs unbedenklich; Storno kopiert
  den Satz unnegiert.
- **Kategorie Z** vollständig regelkonform; ZUGFeRD-Einbettung
  kategorieunabhängig.
- **Typst-Vorlage:** Steuerzeilen brechen weder Gitterlinien-Modus noch
  Zahlungserinnerung noch abgewählte Spalten.
- **Alt-Rechenpfad** `umsatz.rs::ust_aus_brutto_cent` dient nur der
  Grenzen-Schätzung, nie den Belegen — kein Konflikt.

## Bewusst offen gelassen

- Positionen aus Vor-Migrations-Angebotsentwürfen tragen den Default 19 %
  (dokumentiert in TODO.md; korrigierbar durch Neu-Speichern der Position).
- ZUGFeRD-XMP `ConformanceLevel "EN 16931"` statt „XRECHNUNG" — kein
  Regelverstoß, veraPDF und KoSIT akzeptieren beides; separat abwägen.
- § 4-Steuerbefreiungen (Kategorie E mit Befreiungsgrund außerhalb § 19)
  sind weiterhin nicht abgedeckt (README).
