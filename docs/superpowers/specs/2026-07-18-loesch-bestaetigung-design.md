# Lösch-Bestätigungsdialog app-weit (Teilprojekt 2 von 3: Lösch-UI für Kunde/Artikel)

## Kontext

Bestehende Löschen-Buttons (Adresse, Ansprechpartner, Einheit, Position) lösen
aktuell sofort ohne Rückfrage aus. Für Teilprojekt 3 (Kunde/Artikel löschen)
soll eine Bestätigung Pflicht sein — sinnvollerweise wird dieselbe
Bestätigungs-Infrastruktur dann auch bei den bestehenden vier Stellen
nachgerüstet, damit das Verhalten app-weit konsistent ist.

Geprüfter Ist-Zustand — genau vier bestehende Löschaktionen im gesamten Code:

| Stelle | Datei | Beschreibungsdaten am Aufrufort |
|---|---|---|
| Adresse | `KundeDetail.tsx:340` (`AdressenReiter`) | `a.typ`, `a.strasse`, `a.plz`, `a.ort` |
| Ansprechpartner | `KundeDetail.tsx:480` (`AnsprechpartnerReiter`) | `a.name` |
| Position | `BelegEditor.tsx:139` (`positionLoeschen` in `BelegEditor`), Button-Klick aber in `PositionenAbschnitt` (`p.bezeichnung`) | `p.bezeichnung` |
| Einheit | `Einstellungen.tsx:204` (`EinheitenAbschnitt`) | `e.name` |

Kundenpreis- und Zahlung-Löschen existieren aktuell **nicht** als UI-Aktion —
nicht im Umfang.

## Ziel

Eine wiederverwendbare Bestätigungskomponente + Hook, mit der jede
Löschaktion vor der eigentlichen API-Aktion eine Rückfrage mit konkreter
Objektbezeichnung zeigt. Gleiches Muster wie `useErfolgsHinweis`
(Plan 7): eigenständiger Hook, kein globaler State, jede Komponente ruft ihn
unabhängig auf.

## Design

### Komponente `Bestaetigungsdialog`

Neue Datei `src/components/Bestaetigungsdialog.tsx`. Zentriertes Modal,
abgedunkelter Hintergrund (Overlay), im bestehenden Design-Token-System
(`--flaeche`, `--rand-stark`, `--schatten`, `--radius-m` aus
`src/styles/tokens.css`). Struktur:

```tsx
interface BestaetigungsdialogProps {
  text: string;
  onAbbrechen: () => void;
  onBestaetigen: () => void;
}
```

Rendert einen Overlay-`div` (Klick darauf → `onAbbrechen`), darin eine Karte
mit `role="dialog"` und `aria-modal="true"`, `text`, einem „Abbrechen"-Button
(`btn`, Fokus beim Öffnen) und einem „Löschen"-Button (`btn btn-gefahr`, ruft
`onBestaetigen`). `Escape`-Taste → `onAbbrechen`.

**Wichtig — Label-Kollision:** Solange der Dialog offen ist, bleibt die
ursprüngliche Tabellenzeile mit ihrem eigenen „Löschen"-Button weiterhin im
DOM (nur optisch durch das Overlay verdeckt). Der Dialog-Button trägt
denselben Text „Löschen" — es gibt also zwei gleich beschriftete Buttons
gleichzeitig im DOM. `role="dialog"` ist deshalb nicht nur aus
Barrierefreiheits-Gründen sinnvoll, sondern zwingend nötig, damit Tests den
Dialog-Button eindeutig ansprechen können (`within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" })`
statt eines mehrdeutigen `screen.getByRole(...)`, das mit „multiple elements
found" fehlschlagen würde).

### Hook `useLoeschBestaetigung`

Neue Datei `src/hooks/useLoeschBestaetigung.tsx`. Promise-basierte API:

```tsx
function useLoeschBestaetigung() {
  const [anfrage, setAnfrage] = useState<{
    text: string;
    aufloesen: (ergebnis: boolean) => void;
  } | null>(null);

  function bestaetigen(text: string): Promise<boolean> {
    return new Promise((aufloesen) => setAnfrage({ text, aufloesen }));
  }

  const dialog = anfrage && (
    <Bestaetigungsdialog
      text={anfrage.text}
      onAbbrechen={() => { anfrage.aufloesen(false); setAnfrage(null); }}
      onBestaetigen={() => { anfrage.aufloesen(true); setAnfrage(null); }}
    />
  );

  return { bestaetigen, dialog };
}
```

Jede Komponente, die löschen können soll, ruft `useLoeschBestaetigung()`
eigenständig auf (kein globaler State, analog `useErfolgsHinweis`) und
rendert `{dialog}` einmal in ihrem JSX (kann an derselben Stelle wie
`{hinweis}` stehen).

### Verwendung an den vier bestehenden Stellen

Muster (Beispiel Einheit, `Einstellungen.tsx`):

```tsx
async function loeschen(id: string, name: string) {
  if (!(await bestaetigen(`Einheit „${name}" löschen?`))) return;
  setFehler(null);
  try {
    await api.einheiten.delete(id);
    laden();
    zeigen("Einheit gelöscht");
  } catch (e) {
    setFehler(e as AppFehler);
  }
}
```

Aufruf ändert sich von `onClick={() => loeschen(e.id)}` zu
`onClick={() => loeschen(e.id, e.name)}` — die Bezeichnung wird an der
Aufrufstelle durchgereicht, wo sie ohnehin schon im Render-Scope verfügbar
ist (`e`/`a`/`p` aus der jeweiligen `.map()`-Iteration).

Dialogtexte je Stelle:
- Adresse: `Adresse „${typ}, ${strasse}, ${plz} ${ort}" löschen?` (z. B.
  `Adresse „rechnung, Musterstr. 1, 12345 Musterstadt" löschen?`) — nutzt den
  rohen `typ`-Wert unübersetzt, konsistent damit, dass die Tabelle in
  `AdressenReiter` ihn ebenfalls unübersetzt anzeigt (`<td>{a.typ}</td>`,
  keine bestehende Label-Zuordnung im Code).
- Ansprechpartner: `Ansprechpartner „${name}" löschen?`
- Position: `Position „${bezeichnung}" löschen?`
- Einheit: `Einheit „${name}" löschen?`

**Sonderfall Position**: `positionLoeschen(positionId)` lebt in der obersten
`BelegEditor`-Komponente (dort auch der bestehende `useErfolgsHinweis`-Aufruf
aus Plan 7), aber der anklickbare Button samt `p.bezeichnung` lebt in der
Kindkomponente `PositionenAbschnitt`. Die Bestätigung gehört dorthin, wo die
Bezeichnung verfügbar ist: `PositionenAbschnitt` bekommt eine **eigene**
`useLoeschBestaetigung()`-Instanz, fragt vor dem Aufruf der bestehenden
`onLoeschen(id)`-Prop nach Bestätigung. Die Prop-Signatur
`onLoeschen: (id: string) => void` und `positionLoeschen` im Elternteil
bleiben unverändert — die Bestätigung ist rein clientseitig vorgeschaltet,
bevor die (unveränderte) Lösch-Prop aufgerufen wird.

### Abbrechen-Verhalten

Escape, Klick auf den abgedunkelten Hintergrund und Klick auf „Abbrechen"
lösen alle die Promise mit `false` auf — kein API-Call, keine sichtbare
Änderung.

## Nicht im Umfang

- Kunde/Artikel-Löschen selbst (Teilprojekt 3).
- Kundenpreis-/Zahlung-Löschen (existiert nicht als UI-Aktion).
- Kontext-Hinweise mit Mengenangaben (z. B. „3 Rechnungen betroffen") — das
  ist spezifisch für Kunde/Artikel und wird in Teilprojekt 3 behandelt, das
  auf diesem Hook aufbaut, aber ggf. einen erweiterten `text`-Parameter
  (mehrzeilig) benötigt. Dieser Hook unterstützt bereits beliebigen
  String-Text, also keine strukturelle Änderung hier nötig.
- Fokus-Trap (Tab-Zyklus bleibt nicht zwingend im Modal gefangen) — bei der
  aktuellen App-Größe/Nutzerzahl kein Blocker, kann bei Bedarf später
  nachgerüstet werden.

## Tests

- `useLoeschBestaetigung.test.tsx`: `bestaetigen()` zeigt den Dialog mit dem
  übergebenen Text; Klick auf „Löschen" löst die Promise mit `true` auf und
  blendet den Dialog aus; Klick auf „Abbrechen" löst mit `false` auf; Klick
  auf den Hintergrund-Overlay löst mit `false` auf; `Escape`-Taste löst mit
  `false` auf.
- Je ein Test pro bestehender Aufrufstelle (Adresse, Ansprechpartner,
  Position, Einheit): Klick auf „Löschen" öffnet den Dialog, kein API-Call
  vor Bestätigung; Klick auf „Löschen" im Dialog löst den bestehenden Ablauf
  aus (API-Call, `laden()`/`onGeaendert()`, Erfolgs-Banner); Klick auf
  „Abbrechen" im Dialog löst keinen API-Call aus. Wegen der Label-Kollision
  (siehe oben) muss der Dialog-Button über
  `within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" })`
  angesprochen werden, nicht über ein ungescoptes `screen.getByRole(...)`.
