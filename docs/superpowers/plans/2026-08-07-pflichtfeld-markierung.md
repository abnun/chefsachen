# Pflichtfeld-Markierung — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Über die gesamte App hinweg zeigen Formulare, welche Felder
zwingend sind (`*`) und welche für den XRechnung-Export nötig sind (`†`),
mit einer Legende je Formular. Jede `*`-Markierung entspricht einer echten
Backend-Prüfung — dafür werden Firma- und Adresse-Anschrift neu geprüft.

**Architecture:** Eine kleine gemeinsame Komponente
(`src/components/PflichtMarker.tsx`) liefert Marker und Legende. Jedes
betroffene Formular bekommt den Marker hinter dem Label-Text und die Legende
vor dem Abschicken-Knopf. Backend-seitig zwei neue/erweiterte
`pruefe_*`-Funktionen nach dem bestehenden Muster (leerer, getrimmter String
→ `AppError::Validation`).

**Tech Stack:** Rust (Tauri-Backend), React/TypeScript (Frontend).

## Global Constraints

- Kein natives `required`-Attribut als alleinige Markierung — es bleibt bei
  bestehenden `required`-Attributen (z. B. `KundenpreiseDialog.tsx`), aber
  die neue visuelle Markierung ist die eigentliche Kennzeichnung.
- `*` nur für Felder, die eine echte Backend-Prüfung haben (bestehend oder
  in Task 1 neu ergänzt) — niemals eine Markierung ohne zugehörige Prüfung.
- `†` nur für Firma E-Mail/Telefon und Kunde Käuferreferenz/Leitweg-ID.
- Nummernkreise, Textbausteine, Belegvorlage-Einstellungen, Datum/
  Leistungsdatum in Belegen, Fax überall: **nicht** markieren.
- Bei „eins von beiden"-Paaren (Steuernummer/USt-IdNr.,
  Käuferreferenz/Leitweg-ID) bekommen **beide** Felder die Markierung.

---

### Task 1: Backend — Anschrift von Firma und Adresse zur Pflicht

**Files:**
- Modify: `src-tauri/src/commands/firma.rs`
- Modify: `src-tauri/src/commands/kunden.rs`
- Modify: `src-tauri/src/commands/dashboard.rs` (Testfixtur)
- Modify: `src-tauri/src/dokument/kontext.rs` (Testfixtur)

**Interfaces:**
- Produces: `pruefe_firma` schlägt jetzt auch bei leerer `strasse`, `plz`,
  `ort` oder `land` fehl (Feldname im `AppError::Validation` entspricht dem
  jeweiligen Feld — `"strasse"`, `"plz"`, `"ort"`, `"land"`).
- Produces: neue Funktion `pruefe_adresse` in `kunden.rs`, aufgerufen am
  Anfang von `adresse_speichern`, mit denselben vier Feldprüfungen.

- [ ] **Schritt 1: Test schreiben — `pruefe_firma` verlangt die Anschrift**

In `src-tauri/src/commands/firma.rs`, im `#[cfg(test)] mod tests`-Block,
nach `gueltige_firma`:

```rust
#[tokio::test]
async fn firma_ohne_strasse_wird_abgelehnt() {
    let (_dir, pool) = test_pool().await;
    let mut f = gueltige_firma(&pool).await;
    f.strasse = "".into();
    let fehler = save(&pool, f).await;
    assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
}

#[tokio::test]
async fn firma_ohne_plz_wird_abgelehnt() {
    let (_dir, pool) = test_pool().await;
    let mut f = gueltige_firma(&pool).await;
    f.plz = "".into();
    let fehler = save(&pool, f).await;
    assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
}

#[tokio::test]
async fn firma_ohne_ort_wird_abgelehnt() {
    let (_dir, pool) = test_pool().await;
    let mut f = gueltige_firma(&pool).await;
    f.ort = "".into();
    let fehler = save(&pool, f).await;
    assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
}

#[tokio::test]
async fn firma_ohne_land_wird_abgelehnt() {
    let (_dir, pool) = test_pool().await;
    let mut f = gueltige_firma(&pool).await;
    f.land = "".into();
    let fehler = save(&pool, f).await;
    assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
}
```

- [ ] **Schritt 2: Testfixtur `gueltige_firma` um eine echte Anschrift ergänzen**

Sonst schlagen ab Schritt 4 auch alle bisherigen Tests fehl, die diese
Fixtur verwenden (`gueltige_firma` liefert bisher nur Name und
Steuernummer, Straße/PLZ/Ort sind leer). In `src-tauri/src/commands/firma.rs`:

Vorher:
```rust
    async fn gueltige_firma(pool: &sqlx::SqlitePool) -> Firma {
        let mut f = get(pool).await.unwrap();
        f.name = "Testfirma".into();
        f.steuernummer = "12/345/67890".into();
        f
    }
```
Nachher:
```rust
    async fn gueltige_firma(pool: &sqlx::SqlitePool) -> Firma {
        let mut f = get(pool).await.unwrap();
        f.name = "Testfirma".into();
        f.strasse = "Teststr. 1".into();
        f.plz = "12345".into();
        f.ort = "Teststadt".into();
        f.steuernummer = "12/345/67890".into();
        f
    }
```

- [ ] **Schritt 3: Tests laufen lassen — die vier neuen müssen fehlschlagen**

Run: `cd src-tauri && cargo test firma:: 2>&1 | grep -E "FAILED|test result"`
Expected: Die vier neuen Tests aus Schritt 1 schlagen fehl (`pruefe_firma`
prüft die Felder noch nicht). Alle anderen `firma::`-Tests bleiben grün
(dank der Fixtur-Anpassung aus Schritt 2).

- [ ] **Schritt 4: `pruefe_firma` erweitern**

In `src-tauri/src/commands/firma.rs`:

Vorher:
```rust
fn pruefe_firma(firma: &Firma) -> AppResult<()> {
    if firma.name.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "name".into(),
            meldung: "Name darf nicht leer sein".into(),
        });
    }
    if firma.steuernummer.trim().is_empty() && firma.ust_idnr.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "steuernummer".into(),
            meldung: "Steuernummer oder USt-IdNr. ist erforderlich".into(),
        });
    }
```
Nachher:
```rust
fn pruefe_firma(firma: &Firma) -> AppResult<()> {
    if firma.name.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "name".into(),
            meldung: "Name darf nicht leer sein".into(),
        });
    }
    // Eine Rechnung ohne vollständige Absenderanschrift ist nach § 14 UStG
    // nicht ordnungsgemäß — deshalb dieselbe Pflicht wie beim Namen.
    if firma.strasse.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "strasse".into(),
            meldung: "Straße darf nicht leer sein".into(),
        });
    }
    if firma.plz.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "plz".into(),
            meldung: "PLZ darf nicht leer sein".into(),
        });
    }
    if firma.ort.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "ort".into(),
            meldung: "Ort darf nicht leer sein".into(),
        });
    }
    if firma.land.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "land".into(),
            meldung: "Land darf nicht leer sein".into(),
        });
    }
    if firma.steuernummer.trim().is_empty() && firma.ust_idnr.trim().is_empty() {
        return Err(AppError::Validation {
            feld: "steuernummer".into(),
            meldung: "Steuernummer oder USt-IdNr. ist erforderlich".into(),
        });
    }
```

- [ ] **Schritt 5: Tests laufen lassen — jetzt müssen alle vier grün sein**

Run: `cd src-tauri && cargo test firma:: 2>&1 | tail -20`
Expected: Alle Tests in `commands::firma::tests` bestehen.

- [ ] **Schritt 6: Zwei bestehende Testfixturen in anderen Dateien reparieren**

Diese zwei Stellen setzen ebenfalls eine `Firma` per `save()` ohne
Straße/PLZ/Ort und schlagen nach Schritt 4 fehl:

In `src-tauri/src/commands/dashboard.rs`, **zwei** Vorkommen (Funktionen
`ohne_kleinunternehmerstatus_gibt_es_keine_grenzen` und
`mit_kleinunternehmerstatus_werden_beide_grenzen_ausgewiesen`):

Vorher (jeweils):
```rust
        firma.name = "Meine Firma".into();
        firma.steuernummer = "12/345/67890".into();
```
Nachher (jeweils):
```rust
        firma.name = "Meine Firma".into();
        firma.strasse = "Weg 1".into();
        firma.plz = "10115".into();
        firma.ort = "Berlin".into();
        firma.steuernummer = "12/345/67890".into();
```

In `src-tauri/src/dokument/kontext.rs`, in der Funktion, die
`firma.strasse = "Neue Strasse 99".into();` setzt:

Vorher:
```rust
        let mut firma = crate::commands::firma::get(&pool).await.unwrap();
        firma.name = "Umbenannte Firma".into();
        firma.strasse = "Neue Strasse 99".into();
        firma.iban = "AT611904300234573201".into();
        // pruefe_firma verlangt eine Steuernummer; die Seed-Firma hat noch keine.
        firma.steuernummer = "99/999/99999".into();
```
Nachher:
```rust
        let mut firma = crate::commands::firma::get(&pool).await.unwrap();
        firma.name = "Umbenannte Firma".into();
        firma.strasse = "Neue Strasse 99".into();
        firma.plz = "10115".into();
        firma.ort = "Berlin".into();
        firma.iban = "AT611904300234573201".into();
        // pruefe_firma verlangt eine Steuernummer; die Seed-Firma hat noch keine.
        firma.steuernummer = "99/999/99999".into();
```

- [ ] **Schritt 7: Ganze Test-Suite laufen lassen**

Run: `cd src-tauri && cargo test 2>&1 | grep -E "FAILED|test result"`
Expected: Alle Tests bestehen. Bleibt irgendwo ein Fehlschlag wegen einer
`Firma` ohne Straße/PLZ/Ort/Land übrig (z. B. an einer hier nicht
aufgeführten Stelle), dieselbe Anpassung wie in Schritt 6 vornehmen — echte
Werte statt leerer Strings ergänzen.

- [ ] **Schritt 8: Test schreiben — `pruefe_adresse` verlangt die Anschrift**

In `src-tauri/src/commands/kunden.rs`, im bestehenden `#[cfg(test)] mod
tests`-Block, einen Test analog zu den bestehenden Adress-Tests ergänzen
(finde eine bestehende Testfunktion, die einen Kunden anlegt, als Vorlage
für den Aufbau):

```rust
    #[tokio::test]
    async fn adresse_ohne_strasse_wird_abgelehnt() {
        let (_dir, pool) = test_pool().await;
        let k = create(&pool, KundeNeu {
            typ: "firma".into(), name: "Testkunde".into(), zahlungsziel_tage: 14,
            notizen: "".into(), ust_idnr: "".into(), email: "".into(),
            leitweg_id: "".into(), kaeuferreferenz: "".into(),
        }).await.unwrap();
        let fehler = adresse_speichern(&pool, Adresse {
            id: "".into(), kunde_id: k.id, typ: "rechnung".into(),
            strasse: "".into(), plz: "10115".into(), ort: "Berlin".into(),
            land: "DE".into(), ist_standard: true,
        }).await;
        assert!(matches!(fehler, Err(AppError::Validation { .. })), "{fehler:?}");
    }
```

Prüfe vor dem Einfügen den exakten Aufbau von `KundeNeu` und `test_pool` in
dieser Datei (Feldnamen können leicht abweichen) und passe den Test
entsprechend an — die bestehenden Tests in derselben Datei zeigen das
korrekte Muster.

- [ ] **Schritt 9: Test laufen lassen — muss fehlschlagen**

Run: `cd src-tauri && cargo test kunden:: 2>&1 | grep -E "FAILED|test result"`
Expected: Der neue Test aus Schritt 8 schlägt fehl (`adresse_speichern`
prüft noch nichts).

- [ ] **Schritt 10: `pruefe_adresse` ergänzen und in `adresse_speichern` aufrufen**

In `src-tauri/src/commands/kunden.rs`, vor `adresse_speichern`:

```rust
/// Eine Rechnungsadresse ohne vollständige Anschrift ist nach § 14 UStG
/// nicht ordnungsgemäß — dieselbe Pflicht wie bei der eigenen Firmenanschrift.
fn pruefe_adresse(a: &Adresse) -> AppResult<()> {
    if a.strasse.trim().is_empty() {
        return Err(AppError::Validation { feld: "strasse".into(), meldung: "Straße darf nicht leer sein".into() });
    }
    if a.plz.trim().is_empty() {
        return Err(AppError::Validation { feld: "plz".into(), meldung: "PLZ darf nicht leer sein".into() });
    }
    if a.ort.trim().is_empty() {
        return Err(AppError::Validation { feld: "ort".into(), meldung: "Ort darf nicht leer sein".into() });
    }
    if a.land.trim().is_empty() {
        return Err(AppError::Validation { feld: "land".into(), meldung: "Land darf nicht leer sein".into() });
    }
    Ok(())
}
```

Dann als ersten Schritt in `adresse_speichern` einfügen:

Vorher:
```rust
pub async fn adresse_speichern(pool: &SqlitePool, mut a: Adresse) -> AppResult<Adresse> {
    let mut tx = pool.begin().await?;
```
Nachher:
```rust
pub async fn adresse_speichern(pool: &SqlitePool, mut a: Adresse) -> AppResult<Adresse> {
    pruefe_adresse(&a)?;
    let mut tx = pool.begin().await?;
```

(`AppError` ist in dieser Datei bereits importiert — an den bestehenden
`AppError::Validation`-Stellen in derselben Datei erkennbar.)

- [ ] **Schritt 11: Ganze Test-Suite laufen lassen**

Run: `cd src-tauri && cargo test 2>&1 | grep -E "FAILED|test result"`
Expected: Alle Tests bestehen (408+ vorher plus die 5 neuen aus diesem
Task). Alle 8 bestehenden Aufrufstellen von `adresse_speichern` im Rest des
Codes übergeben bereits vollständige Testdaten (Straße/PLZ/Ort/Land) — dort
ist keine Anpassung nötig.

- [ ] **Schritt 12: Commit**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings
git add src-tauri/src/commands/firma.rs src-tauri/src/commands/kunden.rs src-tauri/src/commands/dashboard.rs src-tauri/src/dokument/kontext.rs
git commit -m "feat: Anschrift von Firma und Kundenadresse wird zur Pflicht"
```

---

### Task 2: Gemeinsame Komponente für Marker und Legende

**Files:**
- Create: `src/components/PflichtMarker.tsx`
- Create: `src/components/PflichtMarker.test.tsx`
- Modify: `src/styles/komponenten.css`

**Interfaces:**
- Produces: `PflichtMarker({ art: "pflicht" | "xrechnung" })` — ein
  `<span>` mit dem passenden Zeichen (`*` bzw. `†`) und Tooltip-Titel.
- Produces: `PflichtLegende({ zeigtXrechnung?: boolean })` — die
  Legendenzeile für das Ende eines Formulars.
- Alle folgenden Tasks importieren beide aus `../components/PflichtMarker`
  (bzw. relativer Pfad je Datei).

- [ ] **Schritt 1: `src/components/PflichtMarker.tsx`**

```tsx
type PflichtArt = "pflicht" | "xrechnung";

const TITEL: Record<PflichtArt, string> = {
  pflicht: "Pflichtfeld",
  xrechnung: "Für den XRechnung-Export nötig",
};

const ZEICHEN: Record<PflichtArt, string> = {
  pflicht: "*",
  xrechnung: "†",
};

/**
 * Markiert ein Feld als Pflichtfeld oder als für den XRechnung-Export nötig.
 *
 * Kein natives `required`-Attribut allein: Die Browser-Blase sieht in jedem
 * System anders aus und verschwindet beim nächsten Klick. Dieses Zeichen
 * bleibt stehen; die eigentliche Prüfung passiert weiterhin im Rust-Teil.
 * `aria-hidden`, damit ein Screenreader nicht "Name Stern" vorliest — wer
 * eine Hilfstechnologie nutzt, bekommt die Information stattdessen über den
 * `title` beim Fokussieren des zugehörigen Eingabefelds (siehe `aria-label`-
 * Ergänzung an den Eingabefeldern selbst in den folgenden Tasks, falls die
 * Formularbeschriftung das nicht schon abdeckt).
 */
export function PflichtMarker({ art }: { art: PflichtArt }) {
  return (
    <span aria-hidden="true" title={TITEL[art]} className="pflicht-marker">
      {" " + ZEICHEN[art]}
    </span>
  );
}

/** Legende am Ende eines Formulars mit mindestens einer Markierung. */
export function PflichtLegende({ zeigtXrechnung }: { zeigtXrechnung?: boolean }) {
  return (
    <p className="feld-hinweis pflicht-legende">
      * Pflichtfeld
      {zeigtXrechnung && " · † Für den XRechnung-Export nötig"}
    </p>
  );
}
```

- [ ] **Schritt 2: `src/components/PflichtMarker.test.tsx`**

```tsx
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

describe("PflichtMarker", () => {
  it("zeigt den Stern für ein Pflichtfeld", () => {
    render(<PflichtMarker art="pflicht" />);
    expect(screen.getByTitle("Pflichtfeld")).toHaveTextContent("*");
  });

  it("zeigt das Kreuz für ein XRechnung-nötiges Feld", () => {
    render(<PflichtMarker art="xrechnung" />);
    expect(screen.getByTitle("Für den XRechnung-Export nötig")).toHaveTextContent("†");
  });
});

describe("PflichtLegende", () => {
  it("zeigt nur den Pflichtfeld-Hinweis ohne XRechnung-Kategorie", () => {
    render(<PflichtLegende />);
    expect(screen.getByText("* Pflichtfeld")).toBeTruthy();
  });

  it("zeigt beide Kategorien, wenn zeigtXrechnung gesetzt ist", () => {
    render(<PflichtLegende zeigtXrechnung />);
    expect(screen.getByText(/\* Pflichtfeld/)).toHaveTextContent("† Für den XRechnung-Export nötig");
  });
});
```

- [ ] **Schritt 3: Tests laufen lassen**

Run: `npx vitest run src/components/PflichtMarker.test.tsx`
Expected: Alle 4 Tests bestehen.

- [ ] **Schritt 4: CSS ergänzen**

In `src/styles/komponenten.css`, am Ende der Datei:

```css
/* Pflichtfeld-Markierung (PflichtMarker.tsx) — dezent, keine Alarmfarbe: es
   ist ein Hinweis, kein Fehler. */
.pflicht-marker {
  color: var(--text-leise);
  font-weight: 600;
}

.pflicht-legende {
  margin-top: var(--abstand-s);
}
```

- [ ] **Schritt 5: Commit**

```bash
git add src/components/PflichtMarker.tsx src/components/PflichtMarker.test.tsx src/styles/komponenten.css
git commit -m "feat: Komponente für Pflichtfeld-Marker und -Legende"
```

---

### Task 3: Firma-Formulare (Einrichtung, Einstellungen)

**Files:**
- Modify: `src/pages/Einrichtung.tsx`
- Modify: `src/pages/Einstellungen.tsx`

**Interfaces:**
- Consumes: `PflichtMarker`, `PflichtLegende` aus Task 2.
- Consumes: die neuen Backend-Fehler aus Task 1 (`strasse`, `plz`, `ort`,
  `land`) — beide Dateien müssen diese Feldnamen in ihrer
  `formularFehler(...)`-Feldliste führen, damit ein Backend-Fehler beim
  jeweiligen Feld erscheint statt nur im Banner.

- [ ] **Schritt 1: Import in beiden Dateien ergänzen**

In `src/pages/Einrichtung.tsx` und `src/pages/Einstellungen.tsx`, jeweils
bei den bestehenden Imports:

```tsx
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
```

- [ ] **Schritt 2: `Einrichtung.tsx` — Feldliste erweitern**

Vorher:
```tsx
  const { feldFehler, bannerFehler } = formularFehler(fehler, ["name", "steuernummer"]);
```
Nachher:
```tsx
  const { feldFehler, bannerFehler } = formularFehler(fehler, [
    "name",
    "strasse",
    "plz",
    "ort",
    "steuernummer",
  ]);
```

- [ ] **Schritt 3: `Einrichtung.tsx` — Marker an Name, Straße, PLZ, Ort, Steuernummer, USt-IdNr., E-Mail, Telefon**

Vorher (Name):
```tsx
              Name
              <input required value={firma.name} onChange={(e) => feldAendern({ name: e.currentTarget.value })} />
```
Nachher:
```tsx
              Name
              <PflichtMarker art="pflicht" />
              <input required value={firma.name} onChange={(e) => feldAendern({ name: e.currentTarget.value })} />
```

Vorher (Straße):
```tsx
              Straße
              <input
                value={firma.strasse}
                onChange={(e) => feldAendern({ strasse: e.currentTarget.value })}
              />
            </label>
          </div>
```
Nachher:
```tsx
              Straße
              <PflichtMarker art="pflicht" />
              <input
                value={firma.strasse}
                onChange={(e) => feldAendern({ strasse: e.currentTarget.value })}
              />
            </label>
            {feldFehler("strasse") && <div className="feld-fehler" role="alert">{feldFehler("strasse")}</div>}
          </div>
```

Vorher (PLZ):
```tsx
              PLZ
              <input value={firma.plz} onChange={(e) => feldAendern({ plz: e.currentTarget.value })} />
            </label>
          </div>
```
Nachher:
```tsx
              PLZ
              <PflichtMarker art="pflicht" />
              <input value={firma.plz} onChange={(e) => feldAendern({ plz: e.currentTarget.value })} />
            </label>
            {feldFehler("plz") && <div className="feld-fehler" role="alert">{feldFehler("plz")}</div>}
          </div>
```

Vorher (Ort):
```tsx
              Ort
              <input value={firma.ort} onChange={(e) => feldAendern({ ort: e.currentTarget.value })} />
            </label>
          </div>
```
Nachher:
```tsx
              Ort
              <PflichtMarker art="pflicht" />
              <input value={firma.ort} onChange={(e) => feldAendern({ ort: e.currentTarget.value })} />
            </label>
            {feldFehler("ort") && <div className="feld-fehler" role="alert">{feldFehler("ort")}</div>}
          </div>
```

Vorher (Steuernummer-Label):
```tsx
              Steuernummer
```
Nachher:
```tsx
              Steuernummer
              <PflichtMarker art="pflicht" />
```

Vorher (USt-IdNr.-Label):
```tsx
              USt-IdNr.
```
Nachher:
```tsx
              USt-IdNr.
              <PflichtMarker art="pflicht" />
```

Vorher (E-Mail-Label):
```tsx
              E-Mail
```
Nachher:
```tsx
              E-Mail
              <PflichtMarker art="xrechnung" />
```

Vorher (Telefon-Label):
```tsx
              Telefon
```
Nachher:
```tsx
              Telefon
              <PflichtMarker art="xrechnung" />
```

- [ ] **Schritt 4: `Einrichtung.tsx` — Legende vor dem „Weiter"-Knopf von Schritt 1**

Vorher:
```tsx
          </div>
          <div className="aktionen aktionen-formular">
            <button
              type="button"
              className="btn btn-primaer"
              disabled={prueft}
              onClick={weiterVonSchritt1}
            >
              Weiter
            </button>
          </div>
        </section>
      )}

      {schritt === 2 && (
```
Nachher:
```tsx
          </div>
          <PflichtLegende zeigtXrechnung />
          <div className="aktionen aktionen-formular">
            <button
              type="button"
              className="btn btn-primaer"
              disabled={prueft}
              onClick={weiterVonSchritt1}
            >
              Weiter
            </button>
          </div>
        </section>
      )}

      {schritt === 2 && (
```

- [ ] **Schritt 5: `Einstellungen.tsx` — Marker an Name, Straße, PLZ, Ort, Land, Steuernummer, USt-IdNr., E-Mail, Telefon**

Gleiches Muster wie Schritt 3, jetzt für die Firmendaten-Sektion in
`Einstellungen.tsx` (dort existieren `feldFehler(...)`-Aufrufe für
`strasse`/`plz`/`ort`/`land` bereits — nur der `<PflichtMarker>` fehlt, an
der Feldliste in `formularFehler(...)` muss hier **nichts** geändert
werden).

Vorher (Name):
```tsx
            Name
            <input required value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
```
Nachher:
```tsx
            Name
            <PflichtMarker art="pflicht" />
            <input required value={firma.name} onChange={(e) => setFirma({ ...firma, name: e.currentTarget.value })} />
```

Vorher (Straße-Label): `            Straße`
Nachher:
```tsx
            Straße
            <PflichtMarker art="pflicht" />
```

Vorher (PLZ-Label): `            PLZ`
Nachher:
```tsx
            PLZ
            <PflichtMarker art="pflicht" />
```

Vorher (Ort-Label): `            Ort`
Nachher:
```tsx
            Ort
            <PflichtMarker art="pflicht" />
```

Vorher (Land-Label): `            Land`
Nachher:
```tsx
            Land
            <PflichtMarker art="pflicht" />
```

Vorher (Steuernummer-Label): `            Steuernummer`
Nachher:
```tsx
            Steuernummer
            <PflichtMarker art="pflicht" />
```

Vorher (USt-IdNr.-Label): `            USt-IdNr.`
Nachher:
```tsx
            USt-IdNr.
            <PflichtMarker art="pflicht" />
```

Vorher (E-Mail-Label): `            E-Mail`
Nachher:
```tsx
            E-Mail
            <PflichtMarker art="xrechnung" />
```

Vorher (Telefon-Label): `            Telefon`
Nachher:
```tsx
            Telefon
            <PflichtMarker art="xrechnung" />
```

- [ ] **Schritt 6: `Einstellungen.tsx` — Legende vor dem „Speichern"-Knopf der Firmendaten**

Vorher:
```tsx
        <p className="feld-hinweis">
          Abgewählt gilt Regelbesteuerung: Neue Belege weisen die Umsatzsteuer aus
          (Satz je Artikel, Preise bleiben brutto). Bereits festgeschriebene Belege
          behalten ihren damaligen Steuermodus.
        </p>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </div>
      </form>
    </section>
  );
}

/**
 * Zeigt die automatischen Sicherungen und erlaubt eine sofortige.
```
Nachher:
```tsx
        <p className="feld-hinweis">
          Abgewählt gilt Regelbesteuerung: Neue Belege weisen die Umsatzsteuer aus
          (Satz je Artikel, Preise bleiben brutto). Bereits festgeschriebene Belege
          behalten ihren damaligen Steuermodus.
        </p>
        <PflichtLegende zeigtXrechnung />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">Speichern</button>
        </div>
      </form>
    </section>
  );
}

/**
 * Zeigt die automatischen Sicherungen und erlaubt eine sofortige.
```

- [ ] **Schritt 7: Prüfen**

Run: `npx tsc --noEmit && npx vitest run src/pages/Einrichtung.test.tsx src/pages/Einstellungen.test.tsx`
Expected: Keine Typfehler, alle bestehenden Tests weiterhin grün (die
Marker ändern keine Formularlogik).

- [ ] **Schritt 8: Commit**

```bash
git add src/pages/Einrichtung.tsx src/pages/Einstellungen.tsx
git commit -m "feat: Pflichtfeld-Markierung in den Firma-Formularen"
```

---

### Task 4: Einheiten-Verwaltung und Artikel

**Files:**
- Modify: `src/pages/Einstellungen.tsx` (Einheiten-Abschnitt)
- Modify: `src/pages/Artikel.tsx`

**Interfaces:**
- Consumes: `PflichtMarker`, `PflichtLegende` aus Task 2 (Import in
  `Artikel.tsx` neu ergänzen — in `Einstellungen.tsx` bereits durch Task 3
  vorhanden).

- [ ] **Schritt 1: `Einstellungen.tsx` — Einheiten-Formular**

Vorher:
```tsx
        <label className="feld">
          Name
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            {bearbeiteId ? "Aktualisieren" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}

const NUMMERNKREIS_LABEL: Record<string, string> = {
```
Nachher:
```tsx
        <label className="feld">
          Name
          <PflichtMarker art="pflicht" />
          <input value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <label className="feld">
          Kürzel
          <input value={kuerzel} onChange={(e) => setKuerzel(e.currentTarget.value)} />
        </label>
        <PflichtLegende />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            {bearbeiteId ? "Aktualisieren" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}

const NUMMERNKREIS_LABEL: Record<string, string> = {
```

- [ ] **Schritt 2: `Artikel.tsx` — Import ergänzen**

```tsx
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
```

- [ ] **Schritt 3: `Artikel.tsx` — Marker an Bezeichnung und Einheit**

Vorher:
```tsx
              Bezeichnung
              {/* Kein `required`: Die eingebaute Blase des Browsers steht in
```
Nachher:
```tsx
              Bezeichnung
              <PflichtMarker art="pflicht" />
              {/* Kein `required`: Die eingebaute Blase des Browsers steht in
```

Vorher:
```tsx
              Einheit
              <select
                value={form.einheit_id}
```
Nachher:
```tsx
              Einheit
              <PflichtMarker art="pflicht" />
              <select
                value={form.einheit_id}
```

- [ ] **Schritt 4: `Artikel.tsx` — Legende vor dem Formular-Abschluss**

Vorher:
```tsx
            <p className="feld-hinweis">
              Wirkt nur bei Regelbesteuerung. Mit gesetztem Kleinunternehmer-Häkchen
              (Einstellungen) weisen Belege keine Umsatzsteuer aus.
            </p>
          </div>
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
```
Nachher:
```tsx
            <p className="feld-hinweis">
              Wirkt nur bei Regelbesteuerung. Mit gesetztem Kleinunternehmer-Häkchen
              (Einstellungen) weisen Belege keine Umsatzsteuer aus.
            </p>
          </div>
          <PflichtLegende />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
```

- [ ] **Schritt 5: Prüfen**

Run: `npx tsc --noEmit && npx vitest run src/pages/Einstellungen.test.tsx src/pages/Artikel.test.tsx`
Expected: Keine Typfehler, bestehende Tests grün.

- [ ] **Schritt 6: Commit**

```bash
git add src/pages/Einstellungen.tsx src/pages/Artikel.tsx
git commit -m "feat: Pflichtfeld-Markierung bei Einheiten und Artikeln"
```

---

### Task 5: Kunde-Formulare (Anlegen, Stammdaten, Adressen)

**Files:**
- Modify: `src/pages/Kunden.tsx`
- Modify: `src/pages/KundeDetail.tsx`

**Interfaces:**
- Consumes: `PflichtMarker`, `PflichtLegende` aus Task 2.
- Consumes: die neuen Backend-Fehler `strasse`/`plz`/`ort`/`land` aus Task 1
  — der Adressen-Reiter in `KundeDetail.tsx` bekommt dafür zum ersten Mal
  eine `formularFehler(...)`-Feldanzeige (bisher nur Banner).

- [ ] **Schritt 1: `Kunden.tsx` — Import ergänzen**

```tsx
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
```

- [ ] **Schritt 2: `Kunden.tsx` — Marker an Name, Käuferreferenz, Leitweg-ID**

Vorher:
```tsx
              Name
              <input
                required
                value={neuerKunde.name}
```
Nachher:
```tsx
              Name
              <PflichtMarker art="pflicht" />
              <input
                required
                value={neuerKunde.name}
```

Vorher:
```tsx
              Leitweg-ID
              <input
                value={neuerKunde.leitweg_id}
```
Nachher:
```tsx
              Leitweg-ID
              <PflichtMarker art="xrechnung" />
              <input
                value={neuerKunde.leitweg_id}
```

Vorher:
```tsx
              Käuferreferenz
              <input
                value={neuerKunde.kaeuferreferenz}
```
Nachher:
```tsx
              Käuferreferenz
              <PflichtMarker art="xrechnung" />
              <input
                value={neuerKunde.kaeuferreferenz}
```

- [ ] **Schritt 3: `Kunden.tsx` — Legende vor den Formular-Knöpfen**

Vorher:
```tsx
          </div>
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
            <button type="button" className="btn" onClick={() => setZeigeFormular(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
```
Nachher (nur die erste Fundstelle dieses Musters betrifft das Anlegen-Formular — die Datei enthält u. U. mehrere `aktionen aktionen-formular`-Blöcke; anhand des unmittelbar davorstehenden Käuferreferenz-Felds identifizieren):
```tsx
          </div>
          <PflichtLegende zeigtXrechnung />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
            <button type="button" className="btn" onClick={() => setZeigeFormular(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
```

- [ ] **Schritt 4: `KundeDetail.tsx` — Import ergänzen**

```tsx
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
```

- [ ] **Schritt 5: `KundeDetail.tsx` — Stammdaten: Marker an Name, Leitweg-ID, Käuferreferenz**

Vorher:
```tsx
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
```
Nachher:
```tsx
            Name
            <PflichtMarker art="pflicht" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
```

Vorher:
```tsx
            Leitweg-ID
            <input
              value={form.leitweg_id}
```
Nachher:
```tsx
            Leitweg-ID
            <PflichtMarker art="xrechnung" />
            <input
              value={form.leitweg_id}
```

Vorher:
```tsx
            Käuferreferenz
            <input
              value={form.kaeuferreferenz}
```
Nachher:
```tsx
            Käuferreferenz
            <PflichtMarker art="xrechnung" />
            <input
              value={form.kaeuferreferenz}
```

- [ ] **Schritt 6: `KundeDetail.tsx` — Legende am Ende der Stammdaten**

Vorher:
```tsx
        </div>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            Speichern
          </button>
        </div>
      </form>
```
(Dies ist die erste Fundstelle dieses exakten Musters — sie gehört zum
Stammdaten-Formular, nicht zum Adressen- oder Ansprechpartner-Formular, die
jeweils andere Beschriftungen auf dem Knopf tragen. Bei Unsicherheit: Der
Block folgt unmittelbar auf das Käuferreferenz-Feld.)
```tsx
        </div>
        <PflichtLegende zeigtXrechnung />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            Speichern
          </button>
        </div>
      </form>
```

- [ ] **Schritt 7: `KundeDetail.tsx` — Adressen-Reiter bekommt Feldfehler-Anzeige**

Der `AdressenReiter` zeigt Backend-Fehler bisher nur als Banner. Damit ein
neuer Validierungsfehler (Task 1) am richtigen Feld erscheint, wird hier das
Muster aus den anderen Formularen dieser Datei übernommen.

Finde in `AdressenReiter` (Funktion beginnt bei der Zeile mit `function
AdressenReiter(...)`) die Zeile:

```tsx
  const [fehler, setFehler] = useState<AppFehler | null>(null);
```

Direkt danach ergänzen:
```tsx
  const { feldFehler, bannerFehler } = formularFehler(fehler, ["strasse", "plz", "ort", "land"]);
```

(`formularFehler` ist in dieser Datei bereits importiert — an der
Verwendung im Stammdaten-Formular weiter oben in derselben Datei zu
erkennen.)

Dann das Rendern des Fehlers auf den Banner umstellen:

Vorher:
```tsx
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
```
Nachher:
```tsx
    <section>
      <Fehler fehler={bannerFehler} />
      {hinweis}
```

Und an jedem der vier Adressfelder Marker plus Feldfehler ergänzen:

Vorher:
```tsx
        <label className="feld">
          Straße
          <input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.currentTarget.value })} />
        </label>
        <label className="feld">
          PLZ
          <input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.currentTarget.value })} />
        </label>
        <label className="feld">
          Ort
          <input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.currentTarget.value })} />
        </label>
        <label className="feld">
          Land
          <input value={form.land} onChange={(e) => setForm({ ...form, land: e.currentTarget.value })} />
        </label>
```
Nachher:
```tsx
        <div className="feld">
          <label>
            Straße
            <PflichtMarker art="pflicht" />
            <input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.currentTarget.value })} />
          </label>
          {feldFehler("strasse") && <div className="feld-fehler" role="alert">{feldFehler("strasse")}</div>}
        </div>
        <div className="feld">
          <label>
            PLZ
            <PflichtMarker art="pflicht" />
            <input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.currentTarget.value })} />
          </label>
          {feldFehler("plz") && <div className="feld-fehler" role="alert">{feldFehler("plz")}</div>}
        </div>
        <div className="feld">
          <label>
            Ort
            <PflichtMarker art="pflicht" />
            <input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.currentTarget.value })} />
          </label>
          {feldFehler("ort") && <div className="feld-fehler" role="alert">{feldFehler("ort")}</div>}
        </div>
        <div className="feld">
          <label>
            Land
            <PflichtMarker art="pflicht" />
            <input value={form.land} onChange={(e) => setForm({ ...form, land: e.currentTarget.value })} />
          </label>
          {feldFehler("land") && <div className="feld-fehler" role="alert">{feldFehler("land")}</div>}
        </div>
```

(Aus `<label className="feld">` wird hier `<div className="feld"><label>`,
damit der Fehlertext wie im Rest der App **innerhalb** des `feld`-Blocks,
aber **außerhalb** des `<label>` steht — exakt das Muster, das im
Stammdaten-Formular weiter oben in derselben Datei bereits verwendet wird.)

- [ ] **Schritt 8: `KundeDetail.tsx` — Legende im Adressen-Formular**

Vorher:
```tsx
          Standardadresse
        </label>
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            {form.id ? "Aktualisieren" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface AnsprechpartnerReiterProps {
```
Nachher:
```tsx
          Standardadresse
        </label>
        <PflichtLegende />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            {form.id ? "Aktualisieren" : "Hinzufügen"}
          </button>
        </div>
      </form>
    </section>
  );
}

interface AnsprechpartnerReiterProps {
```

- [ ] **Schritt 9: Prüfen**

Run: `npx tsc --noEmit && npx vitest run src/pages/Kunden.test.tsx src/pages/KundeDetail.test.tsx`
Expected: Keine Typfehler, bestehende Tests grün. Prüfe insbesondere, ob ein
bestehender Test im Adressen-Reiter einen Fehlertext über `screen.getByText`
o. Ä. an der bisherigen Stelle erwartet — falls ja, an die neue
`feld-fehler`-Struktur anpassen (Fehlertext bleibt inhaltlich gleich, nur
die Hülle ändert sich von `<Fehler>`-Banner zu `feld-fehler`).

- [ ] **Schritt 10: Test ergänzen — Adressen-Reiter zeigt einen neuen Feldfehler**

In `src/pages/KundeDetail.test.tsx`, sofern eine vergleichbare Teststruktur
für den Adressen-Reiter bereits existiert (als Vorlage verwenden), einen
Test ergänzen, der `api.kunden.adresseSave` mit einem Validierungsfehler
für `"strasse"` fehlschlagen lässt und prüft, dass der Fehlertext beim
Straße-Feld erscheint (nicht nur im Banner). Orientiere dich am Muster
eines bereits bestehenden `feldFehler`-Tests in derselben Datei (z. B. für
das Name-Feld der Stammdaten).

- [ ] **Schritt 11: Commit**

```bash
git add src/pages/Kunden.tsx src/pages/KundeDetail.tsx src/pages/KundeDetail.test.tsx
git commit -m "feat: Pflichtfeld-Markierung bei Kunde und Adresse"
```

---

### Task 6: Beleg-Formulare (Anlegen, Positionen)

**Files:**
- Modify: `src/components/BelegAnlegen.tsx`
- Modify: `src/components/PositionenAbschnitt.tsx`

**Interfaces:**
- Consumes: `PflichtMarker`, `PflichtLegende` aus Task 2.

- [ ] **Schritt 1: `BelegAnlegen.tsx` — Import ergänzen und Marker an Kunde**

Vorher:
```tsx
import { type AppFehler, type Kunde } from "../api";
import { Fehler } from "./Fehler";
```
Nachher:
```tsx
import { type AppFehler, type Kunde } from "../api";
import { Fehler } from "./Fehler";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";
```

Vorher:
```tsx
      <label className="feld">
        Kunde
        <select value={kundeId} onChange={(e) => onKundeId(e.currentTarget.value)}>
```
Nachher:
```tsx
      <label className="feld">
        Kunde
        <PflichtMarker art="pflicht" />
        <select value={kundeId} onChange={(e) => onKundeId(e.currentTarget.value)}>
```

- [ ] **Schritt 2: `BelegAnlegen.tsx` — Legende vor dem Anlegen-Knopf**

Vorher:
```tsx
      <label className="feld">
        Datum
        <input type="date" value={datum} onChange={(e) => onDatum(e.currentTarget.value)} />
      </label>
      <button type="submit" className="btn btn-primaer">
        Anlegen
      </button>
    </form>
  );
}
```
Nachher:
```tsx
      <label className="feld">
        Datum
        <input type="date" value={datum} onChange={(e) => onDatum(e.currentTarget.value)} />
      </label>
      <PflichtLegende />
      <button type="submit" className="btn btn-primaer">
        Anlegen
      </button>
    </form>
  );
}
```

- [ ] **Schritt 3: `PositionenAbschnitt.tsx` — Import ergänzen**

```tsx
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";
```

(Prüfe den relativen Pfad anhand der bestehenden Importe in dieser Datei —
`PositionenAbschnitt.tsx` liegt in `src/components/`, also derselbe Ordner
wie `PflichtMarker.tsx`.)

- [ ] **Schritt 4: `PositionenAbschnitt.tsx` — Marker an Bezeichnung, Einzelpreis (Freitext) und Menge (beide Modi)**

Vorher:
```tsx
              <label className="feld">
                Bezeichnung
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einzelpreis
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
```
Nachher:
```tsx
              <label className="feld">
                Bezeichnung
                <PflichtMarker art="pflicht" />
                <input value={bezeichnung} onChange={(e) => setBezeichnung(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einheit
                <input value={einheitKuerzel} onChange={(e) => setEinheitKuerzel(e.currentTarget.value)} />
              </label>
              <label className="feld">
                Einzelpreis
                <PflichtMarker art="pflicht" />
                <input value={einzelpreis} onChange={(e) => setEinzelpreis(e.currentTarget.value)} placeholder="95,00" />
              </label>
```

Vorher (gilt in beiden Modi, außerhalb der Freitext-/Artikel-Verzweigung):
```tsx
          <label className="feld">
            Menge
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>
```
Nachher:
```tsx
          <label className="feld">
            Menge
            <PflichtMarker art="pflicht" />
            <input value={menge} onChange={(e) => setMenge(e.currentTarget.value)} />
          </label>
```

- [ ] **Schritt 5: `PositionenAbschnitt.tsx` — Legende vor den Formular-Knöpfen**

Vorher:
```tsx
          <p className="positions-vorschau" aria-live="polite">
            {vorschau.betrag === null ? vorschau.text : `Positionssumme: ${formatCent(vorschau.betrag)}`}
          </p>

          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              {bearbeiteId ? "Änderung speichern" : "Position hinzufügen"}
            </button>
```
Nachher:
```tsx
          <p className="positions-vorschau" aria-live="polite">
            {vorschau.betrag === null ? vorschau.text : `Positionssumme: ${formatCent(vorschau.betrag)}`}
          </p>

          <PflichtLegende />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              {bearbeiteId ? "Änderung speichern" : "Position hinzufügen"}
            </button>
```

**Hinweis:** Die Legende erscheint dadurch auch im Artikel-Auswahl-Modus,
wo nur „Menge" markiert ist — das ist richtig so: Auch dort ist Menge
Pflicht.

- [ ] **Schritt 6: Prüfen**

Run: `npx tsc --noEmit && npx vitest run src/components/PositionenAbschnitt.test.tsx src/pages/Angebote.test.tsx src/pages/Rechnungen.test.tsx`
Expected: Keine Typfehler, bestehende Tests grün (`BelegAnlegen.tsx` wird
über `Angebote.tsx`/`Rechnungen.tsx` mitgetestet — prüfe, ob ein eigener
Testdateiname existiert, sonst reichen die beiden genannten).

- [ ] **Schritt 7: Commit**

```bash
git add src/components/BelegAnlegen.tsx src/components/PositionenAbschnitt.tsx
git commit -m "feat: Pflichtfeld-Markierung bei Beleg-Anlegen und Positionen"
```

---

### Task 7: KundenpreiseDialog

**Files:**
- Modify: `src/components/KundenpreiseDialog.tsx`

**Interfaces:**
- Consumes: `PflichtMarker`, `PflichtLegende` aus Task 2.

- [ ] **Schritt 1: Import ergänzen**

```tsx
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";
```

- [ ] **Schritt 2: Marker an Kunde und Preis**

Vorher:
```tsx
          <label className="feld">
            Kunde
            <select
              required
              value={kundeId}
              onChange={(e) => setKundeId(e.currentTarget.value)}
            >
```
Nachher:
```tsx
          <label className="feld">
            Kunde
            <PflichtMarker art="pflicht" />
            <select
              required
              value={kundeId}
              onChange={(e) => setKundeId(e.currentTarget.value)}
            >
```

Vorher:
```tsx
          <label className="feld">
            Preis (€)
            <input required value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
          </label>
```
Nachher:
```tsx
          <label className="feld">
            Preis (€)
            <PflichtMarker art="pflicht" />
            <input required value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
          </label>
```

- [ ] **Schritt 3: Legende vor den Formular-Knöpfen**

Vorher:
```tsx
          <p className="feld-hinweis">Leer lassen heißt: gilt ab sofort.</p>

          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              Speichern
            </button>
```
Nachher:
```tsx
          <p className="feld-hinweis">Leer lassen heißt: gilt ab sofort.</p>

          <PflichtLegende />
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">
              Speichern
            </button>
```

- [ ] **Schritt 4: Prüfen**

Run: `npx tsc --noEmit && npx vitest run src/components/KundenpreiseDialog.test.tsx`
Expected: Keine Typfehler, bestehende Tests grün.

- [ ] **Schritt 5: Commit**

```bash
git add src/components/KundenpreiseDialog.tsx
git commit -m "feat: Pflichtfeld-Markierung im Kundenpreise-Dialog"
```

## Verifikation (gesamt)

1. `cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings`
2. `npx tsc --noEmit && npx eslint . && npm test -- --run`
3. Manuell: jedes der sieben Formulare einmal öffnen (Einrichtung,
   Firmendaten in den Einstellungen, Einheiten, Artikel anlegen, Kunde
   anlegen, Kunde-Stammdaten bearbeiten, Adresse anlegen, Beleg anlegen,
   Freitext-Position anlegen, Kundenpreis anlegen) — Sterne/Kreuze an der
   richtigen Stelle, Legende passend zur im Formular vorkommenden
   Kategorie, kein Formular ohne Markierung zeigt trotzdem eine Legende.
4. Manuell: eine Firma oder Adresse mit leerer Straße zu speichern
   versuchen — Fehlermeldung erscheint jetzt am Straße-Feld, nicht nur im
   Banner.
5. `docs/CHANGELOG.md`: neuer Abschnitt für die nächste Version (Nutzer
   entscheidet, wann/ob released wird — kein Tag ohne Rückfrage).
