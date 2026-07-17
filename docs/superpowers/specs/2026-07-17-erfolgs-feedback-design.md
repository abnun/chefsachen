# Erfolgs-Feedback nach Speichern-Aktionen, app-weit — Design

## Problem

Nach erfolgreichem Speichern/Anlegen/Löschen gibt es in fast der gesamten App kein sichtbares Feedback — ein Formular leert sich einfach, oder eine Zeile verschwindet aus einer Liste, ohne dass bestätigt wird, dass die Aktion wirklich geklappt hat. Zwei Stellen (`KundeDetail.tsx`s Stammdaten-Reiter, `Einstellungen.tsx`) haben bereits ein ad-hoc `{gespeichert && <p>Gespeichert.</p>}`-Muster, das weder wiederverwendet noch mit dem Rest der App konsistent ist.

## Ziel

Ein einziges, konsistentes Erfolgs-Feedback-Muster für alle Speichern-, Anlegen- und Löschen-Aktionen in der App, umgesetzt als wiederverwendbarer Hook auf Basis der bestehenden `Hinweis`-Komponente.

## Umfang

Nur Frontend. Kein neuer Backend-Code nötig — alle betroffenen Aktionen rufen bereits bestehende `api.*`-Funktionen auf, es wird nur nach deren erfolgreichem Abschluss ein Hinweis eingeblendet.

## Der Hook: `useErfolgsHinweis`

Neue Datei `src/hooks/useErfolgsHinweis.tsx` (`.tsx`, nicht `.ts` — die Datei enthält JSX):

```tsx
import { useRef, useState } from "react";
import { Hinweis } from "../components/Hinweis";

export function useErfolgsHinweis() {
  const zaehler = useRef(0);
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);

  function zeigen(text: string) {
    zaehler.current += 1;
    setBanner({ text, id: zaehler.current });
  }

  const hinweis = banner && (
    <Hinweis key={banner.id} autoDismissMs={4000} onSchliessen={() => setBanner(null)}>
      {banner.text}
    </Hinweis>
  );

  return { zeigen, hinweis };
}
```

**Technisches Detail 1:** `key={banner.id}` ist notwendig, nicht optional. Ohne diesen Key würde ein zweiter `zeigen()`-Aufruf, während der erste Banner noch sichtbar ist (z. B. zwei schnell aufeinanderfolgende Speicherungen), den Auto-Dismiss-Timer der `Hinweis`-Komponente NICHT neu starten — deren `useEffect` hängt nur an der (konstanten) `autoDismissMs`-Prop, nicht am Textinhalt. Der Key erzwingt, dass React die `Hinweis`-Instanz bei jedem `zeigen()`-Aufruf neu mountet, wodurch der Timer sauber neu beginnt.

**Technisches Detail 2:** `banner.id` wird über einen einfachen `useRef`-Zähler erzeugt, NICHT über `Date.now()`. Grund: Der Hook-Test für den Retrigger-Fall (siehe Tests unten) läuft unter `vi.useFakeTimers()` — und Vitests Fake-Timer frieren standardmäßig auch `Date.now()` ein, bis die Uhr explizit vorgespult wird. Zwei `zeigen()`-Aufrufe kurz hintereinander (ohne dazwischenliegendes Vorspulen) würden mit `Date.now()` denselben Wert liefern → derselbe `key` → React würde NICHT neu mounten → genau der Mechanismus, den der Test beweisen soll, würde in diesem Test unbeabsichtigt nicht greifen. Ein einfacher, zeitunabhängiger Zähler vermeidet das.

## Verwendung

Jede Komponente, die eine Speichern-/Anlegen-/Löschen-Aktion selbst ausführt, ruft ihren eigenen `useErfolgsHinweis()`-Hook auf (kein global geteilter State über die App hinweg) und rendert `{hinweis}` an der Stelle, an der aktuell schon `<Fehler fehler={fehler} />` steht.

Beispiel (`KundeDetail.tsx`s `StammdatenReiter`):

```tsx
function StammdatenReiter({ kunde, onGespeichert }: StammdatenReiterProps) {
  const [form, setForm] = useState(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.update(form);
      zeigen(`Kunde „${form.name}" gespeichert`);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      {hinweis}
      <Fehler fehler={fehler} />
      {/* ... Formular ... */}
    </section>
  );
}
```

## Umfang: betroffene Stellen

| Datei | Aktion | Text-Beispiel |
|---|---|---|
| `Kunden.tsx` | Neuanlage | **Ausgenommen** — der bestehende Onboarding-Banner („jetzt Adresse ergänzen?") erscheint nach JEDER Kundenanlage unbedingt, deckt den Fall also vollständig ab |
| `KundeDetail.tsx` (Stammdaten) | Speichern | „Kunde 'ACME GmbH' gespeichert" (ersetzt bestehendes ad-hoc `Gespeichert.`) |
| `KundeDetail.tsx` (Adressen) | Anlegen / Bearbeiten / Löschen | „Adresse angelegt" / „Adresse gespeichert" / „Adresse gelöscht" — `speichern()` behandelt beide Fälle in einer Funktion, unterscheidbar über `form.id` (leer = Neuanlage) |
| `KundeDetail.tsx` (Ansprechpartner) | Anlegen / Bearbeiten / Löschen | „Ansprechpartner 'Max Mustermann' angelegt" / „... gespeichert" / „... gelöscht" — ebenfalls über `form.id` unterschieden |
| `Artikel.tsx` | Neuanlage | **Bedingt ausgenommen** — siehe Hinweis unten, der bestehende Onboarding-Banner erscheint nur, wenn noch keine Kunden existieren |
| `Artikel.tsx` | Bearbeiten | „Artikel 'Beratung' gespeichert" |
| `Artikel.tsx` (Kundenpreise) | Anlegen | „Kundenpreis angelegt" — das Formular dort ist ausschließlich Neuanlage, es gibt keine Bearbeitung bestehender Kundenpreise |
| `Angebote.tsx` | Neuanlage | **Ausgenommen** — siehe Hinweis unten |
| `Rechnungen.tsx` | Neuanlage | **Ausgenommen** — siehe Hinweis unten |
| `BelegEditor.tsx` (Stammdaten) | Speichern | „Angebot gespeichert" / „Rechnung gespeichert" (je nach `beleg.typ`) |
| `BelegEditor.tsx` | Stellen | „Angebot versendet" / „Rechnung gestellt" (je nach `beleg.typ`) |
| `BelegEditor.tsx` | Angebot-Status setzen | „Status aktualisiert" (generisch — drei mögliche Zielstatus, kein spezifischer Text pro Status nötig) |
| `BelegEditor.tsx` | In Rechnung überführen | **Ausgenommen** — navigiert wie Angebote/Rechnungen-Neuanlage sofort weg (`onRechnungErstellt` wechselt in `App.tsx` unmittelbar zur neuen Rechnung), gleiche Begründung wie dort |
| `BelegEditor.tsx` | Stornieren | „Rechnung storniert" |
| `BelegEditor.tsx` (Positionen) | Hinzufügen / Löschen | „Position hinzugefügt" / „Position gelöscht" |
| `BelegEditor.tsx` (Zahlungen) | Erfassen | „Zahlung erfasst" |
| `Einstellungen.tsx` (Firma) | Speichern | „Firmendaten gespeichert" (ersetzt bestehendes ad-hoc `Gespeichert.`) |
| `Einstellungen.tsx` (Einheiten) | Anlegen / Bearbeiten / Löschen | „Einheit 'Stunde' angelegt" / „Einheit 'Stunde' gespeichert" / „... gelöscht" — `speichern()` behandelt Anlegen UND Bearbeiten in einer Funktion (unterscheidbar über `bearbeiteId`), Text entsprechend wählen |
| `Einstellungen.tsx` (Nummernkreise) | Speichern | „Nummernkreis gespeichert" |
| `Einstellungen.tsx` (Textbausteine) | Speichern | „Textbaustein gespeichert" — pro Textfeld ein eigener `speichern(key)`-Aufruf, generischer Text ohne Bezeichnung des konkreten Feldes (z. B. „Fußtext Angebot") reicht |

**Wichtiger Sonderfall — Artikel-Neuanlage:** Im Gegensatz zum Kunden-Onboarding-Banner (der nach JEDER Kundenanlage unbedingt erscheint) ist der Artikel-Onboarding-Banner (`zeigtKundenHinweis`, „jetzt auch einen Kunden anlegen?") NUR bedingt sichtbar — er erscheint ausschließlich, wenn zum Zeitpunkt der Artikel-Anlage noch keine Kunden existieren (`kunden.length === 0`). Existieren bereits Kunden, würde eine pauschale Ausnahme die Artikel-Neuanlage komplett ohne Feedback lassen — genau die Lücke, die dieser Plan schließen soll. Deshalb: In `Artikel.tsx`s `speichern()`-Funktion, im Neuanlage-Zweig, wird der generische Erfolgs-Banner NUR dann NICHT gezeigt, wenn der Onboarding-Banner in diesem Aufruf tatsächlich gesetzt wurde:

```tsx
if (kunden.length === 0) {
  setZeigtKundenHinweis(true);
} else {
  zeigen(`Artikel „${form.bezeichnung}" angelegt`);
}
```

**Wichtiger Sonderfall — Angebote/Rechnungen-Neuanlage:** `Angebote.tsx`s und `Rechnungen.tsx`s `anlegen()`-Funktionen rufen nach erfolgreichem `api.belege.create()` sofort `onOeffnen(beleg.id)` auf, was laut `App.tsx`s Routing unmittelbar von der Listen-Ansicht zum `BelegEditor` des neu angelegten Dokuments wechselt — die aufrufende Komponente wird dabei ausgehängt. Ein `zeigen()`-Aufruf davor wäre praktisch wirkungslos: Der Banner hätte keine Zeit, sichtbar zu werden, bevor die Seite wechselt. Ein Feedback-Mechanismus, der den „gerade angelegt"-Zustand über die Navigation hinweg zum `BelegEditor` durchreicht, wäre möglich, aber unverhältnismäßiger Mehraufwand für einen Fall, der ohnehin schon eine starke implizite Bestätigung hat: Der Nutzer landet direkt auf dem frisch erstellten Dokument mit eigener Nummer, in der Bearbeitungsansicht. Deshalb: **kein neuer Banner für diesen Fall**, `anlegen()` bleibt unverändert.

**Wichtiger Sonderfall — In Rechnung überführen:** `BelegEditor.tsx`s `inRechnungUeberfuehren()` ruft nach Erfolg `onRechnungErstellt?.(rechnung.id)` auf. In `App.tsx` wechselt dieser Callback unmittelbar die Seite (`setSeite("rechnungen")`) und öffnet die neue Rechnung im `BelegEditor` — exakt dasselbe Navigations-Problem wie bei der Angebote/Rechnungen-Neuanlage. Aus demselben Grund: kein Banner hier, die Landung auf der neuen Rechnung ist Bestätigung genug.

## Textkonventionen

Einheitliches Muster je Aktionstyp:

- Neuanlage: „{Objektart} '{Bezeichnung}' angelegt"
- Bearbeiten: „{Objektart} '{Bezeichnung}' gespeichert"
- Löschen: „{Objektart} '{Bezeichnung}' gelöscht"
- Stornieren: „Rechnung storniert" (Sonderfall, kein generisches Muster nötig — kommt nur einmal vor)
- Objekte ohne prägnante Bezeichnung (z. B. eine einzelne Adresse, ein einzelner Kundenpreis): generischer Fall ohne Anführungszeichen, z. B. „Adresse gespeichert", „Kundenpreis gespeichert".

## Tests

- Neue Testdatei `src/hooks/useErfolgsHinweis.test.tsx`: `zeigen()` zeigt den übergebenen Text; Auto-Dismiss nach 4000ms blendet aus (`vi.useFakeTimers()`, analog zu `Hinweis.test.tsx`); ein zweiter `zeigen()`-Aufruf während der erste Banner noch sichtbar ist zeigt den neuen Text UND der Auto-Dismiss-Timer läuft nachweislich neu (z. B.: nach dem zweiten Aufruf 3999ms vorspulen → Banner noch da; dann 1ms weiter → Banner weg — beweist, dass der Timer ab dem zweiten Aufruf neu gezählt hat, nicht ab dem ersten).
- Pro betroffener Seite/Komponente (siehe Tabelle oben): mindestens ein Test, der nach der jeweiligen Aktion den erwarteten Bannertext prüft.
- Die zwei bestehenden Tests, die auf den alten Text „Gespeichert." prüfen (`KundeDetail.test.tsx`, `Einstellungen.test.tsx`), werden auf den neuen, spezifischeren Text angepasst statt als separate neue Tests daneben zu bestehen.

## Nicht im Umfang

- Kein globaler/App-weiter Toast-Mechanismus (z. B. über React Context) — jede Komponente verwaltet ihren eigenen Banner-State lokal, das ist für diese App-Größe ausreichend und vermeidet unnötige Architektur.
- Keine Änderung an der `Hinweis`-Komponente selbst — sie wird unverändert wiederverwendet.
- Kein Feedback für Kunde/Artikel-Neuanlage über den bestehenden Onboarding-Banner hinaus (bewusste Ausnahme, siehe Tabelle).
- Keine Lösch-UI für Kunde/Artikel selbst (das ist ein separates, noch offenes Thema) — falls diese UI später ergänzt wird, sollte sie dieselbe Textkonvention übernehmen.
