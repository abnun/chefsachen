import { useEffect, useState } from "react";
import {
  api,
  type AppFehler,
  type Artikel as ArtikelTyp,
  type Einheit,
  type Kunde,
} from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { useSortierung } from "../hooks/useSortierung";
import { Hinweis } from "../components/Hinweis";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { KundenpreiseDialog } from "../components/KundenpreiseDialog";
import { formatCent, parseEuro } from "../geld";

const ARTIKEL_NEU_LEER = {
  bezeichnung: "",
  beschreibung: "",
  einheit_id: "",
  standardpreis_cent: 0,
};

/**
 * Artikelliste mit Formular zum Anlegen/Bearbeiten sowie einem aufklappbaren
 * Kundenpreise-Bereich je Artikel. Preise werden im Formular als deutsch
 * formatierter Text erfasst (Komma statt Punkt) und über geld.ts in Cent
 * konvertiert.
 */
interface ArtikelProps {
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuKundenWechseln?: () => void;
}

export function Artikel({ zeigeFormularBeimStart, onFormularUebernommen, onZuKundenWechseln }: ArtikelProps) {
  const [artikel, setArtikel] = useState<ArtikelTyp[]>([]);
  const [einheiten, setEinheiten] = useState<Einheit[]>([]);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [bearbeiteId, setBearbeiteId] = useState<string | null>(null);
  const [form, setForm] = useState(ARTIKEL_NEU_LEER);
  const [preisText, setPreisText] = useState("");
  const [preisFehlerText, setPreisFehlerText] = useState<string | null>(null);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  // Der Artikel, dessen Kundenpreise gerade im Dialog stehen.
  const [preiseFuer, setPreiseFuer] = useState<ArtikelTyp | null>(null);
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [zeigtKundenHinweis, setZeigtKundenHinweis] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  // Nur bei geschlossenem Formular: `neuFormular()` leert alle Felder — ein
  // ⌘N mitten im Ausfüllen (oder Bearbeiten) würde die Eingaben kommentarlos
  // verwerfen. Bei offenem Formular ist das Kürzel ein No-op, wie auf den
  // anderen Listenseiten.
  useListenTastenkuerzel({
    neu: () => {
      if (!zeigeFormular) neuFormular();
    },
  });

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ladeArtikel() {
    api.artikel
      .list()
      .then((liste) => {
        setArtikel(liste);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
  }

  async function loeschen(a: ArtikelTyp) {
    const text =
      a.kundenpreise_anzahl === 0
        ? `Artikel „${a.bezeichnung}" löschen?`
        : `Artikel „${a.bezeichnung}" hat ${a.kundenpreise_anzahl} Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?`;
    if (!(await bestaetigen(text))) return;
    setFehler(null);
    try {
      await api.artikel.delete(a.id, a.kundenpreise_anzahl > 0);
      ladeArtikel();
      zeigen(`Artikel „${a.bezeichnung}" gelöscht`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  useEffect(() => {
    ladeArtikel();
    api.einheiten.list().then(setEinheiten).catch((e) => setFehler(e as AppFehler));
    api.kunden.list().then(setKunden).catch((e) => setFehler(e as AppFehler));
  }, []);

  function einheitKuerzel(einheitId: string): string {
    return einheiten.find((e) => e.id === einheitId)?.kuerzel ?? "";
  }

  function neuFormular() {
    setBearbeiteId(null);
    setForm(ARTIKEL_NEU_LEER);
    setPreisText("");
    setPreisFehlerText(null);
    setFormFehler(null);
    setZeigeFormular(true);
  }

  function bearbeiten(a: ArtikelTyp) {
    setBearbeiteId(a.id);
    setForm({
      bezeichnung: a.bezeichnung,
      beschreibung: a.beschreibung,
      einheit_id: a.einheit_id,
      standardpreis_cent: a.standardpreis_cent,
    });
    setPreisText(formatCent(a.standardpreis_cent).replace(" €", ""));
    setPreisFehlerText(null);
    setFormFehler(null);
    setZeigeFormular(true);
  }

  async function speichern() {
    const cent = parseEuro(preisText);
    if (cent === null) {
      setPreisFehlerText("Bitte einen gültigen Preis eingeben, z. B. 95,50");
      return;
    }
    setPreisFehlerText(null);
    setFormFehler(null);
    try {
      if (bearbeiteId) {
        await api.artikel.update({
          id: bearbeiteId,
          artikelnummer: artikel.find((a) => a.id === bearbeiteId)?.artikelnummer ?? "",
          kundenpreise_anzahl: artikel.find((a) => a.id === bearbeiteId)?.kundenpreise_anzahl ?? 0,
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        zeigen(`Artikel „${form.bezeichnung}" gespeichert`);
      } else {
        await api.artikel.create({
          bezeichnung: form.bezeichnung,
          beschreibung: form.beschreibung,
          einheit_id: form.einheit_id,
          standardpreis_cent: cent,
        });
        if (kunden.length === 0) {
          setZeigtKundenHinweis(true);
        } else {
          zeigen(`Artikel „${form.bezeichnung}" angelegt`);
        }
      }
      setZeigeFormular(false);
      ladeArtikel();
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  // Felder, die das Formular selbst am Eingabefeld ausweist. Alles andere zeigt
  // formularFehler als Banner an, damit kein Backend-Fehler stumm bleibt.
  const { feldFehler, bannerFehler } = formularFehler(formFehler, [
    "bezeichnung",
    "einheit_id",
    "standardpreis_cent",
  ]);

  const { sortiert: sortierteArtikel, sortierung, sortieren } = useSortierung(
    artikel,
    {
      nummer: (a) => a.artikelnummer,
      bezeichnung: (a) => a.bezeichnung,
      einheit: (a) => einheitKuerzel(a.einheit_id),
      preis: (a) => a.standardpreis_cent,
      kundenpreise: (a) => a.kundenpreise_anzahl,
    },
    "nummer",
  );

  return (
    <div>
      <h1 className="seiten-kopf">Artikel &amp; Leistungen</h1>
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}

      {zeigtKundenHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtKundenHinweis(false)}>
          Artikel angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuKundenWechseln?.()}>
            jetzt auch einen Kunden anlegen?
          </button>
        </Hinweis>
      )}

      <Werkzeugleiste
        aktion={
          <button type="button" className="btn btn-primaer" onClick={neuFormular}>
            Neuer Artikel
          </button>
        }
      />

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichern();
          }}
        >
          <Fehler fehler={bannerFehler} />
          <div className="feld">
            <label>
              Bezeichnung
              {/* Kein `required`: Die eingebaute Blase des Browsers steht in
                  der Sprache des Systems, sieht anders aus als jede andere
                  Meldung der Anwendung und verschwindet beim nächsten Klick.
                  Die Prüfung im Rust-Teil meldet dasselbe an derselben Stelle
                  wie alle übrigen Feldfehler. */}
              <input
                value={form.bezeichnung}
                onChange={(e) => setForm({ ...form, bezeichnung: e.currentTarget.value })}
              />
            </label>
            {feldFehler("bezeichnung") && <div className="feld-fehler" role="alert">{feldFehler("bezeichnung")}</div>}
          </div>
          <div className="feld">
            <label>
              Beschreibung
              <textarea
                value={form.beschreibung}
                onChange={(e) => setForm({ ...form, beschreibung: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Einheit
              <select
                value={form.einheit_id}
                onChange={(e) => setForm({ ...form, einheit_id: e.currentTarget.value })}
              >
                <option value="">–</option>
                {einheiten.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.kuerzel})
                  </option>
                ))}
              </select>
            </label>
            {feldFehler("einheit_id") && (
              <div className="feld-fehler" role="alert">{feldFehler("einheit_id")}</div>
            )}
          </div>
          <div className="feld">
            <label>
              Standardpreis (€)
              <input value={preisText} onChange={(e) => setPreisText(e.currentTarget.value)} />
            </label>
            {(preisFehlerText || feldFehler("standardpreis_cent")) && (
              <div className="feld-fehler" role="alert">
                {preisFehlerText ?? feldFehler("standardpreis_cent")}
              </div>
            )}
          </div>
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
            <button type="button" className="btn" onClick={() => setZeigeFormular(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Solange das Formular offen ist (Anlegen oder Bearbeiten), bleibt die
          Liste komplett ausgeblendet — sonst wirkte sie wie Teil davon. */}
      {!zeigeFormular && (
        <>
          {!geladen && <Laden was="Artikel" />}

          {geladen && artikel.length === 0 && !leerHinweisVersteckt && (
            <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
              Noch keine Artikel oder Leistungen — leg direkt los.
            </Hinweis>
          )}

          <table className="tabelle">
            <thead>
              <tr>
                <SortierKopf spalte="nummer" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Nummer
                </SortierKopf>
                <SortierKopf spalte="bezeichnung" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Bezeichnung
                </SortierKopf>
                <SortierKopf spalte="einheit" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Einheit
                </SortierKopf>
                <SortierKopf spalte="preis" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Preis
                </SortierKopf>
                <SortierKopf spalte="kundenpreise" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Kundenpreise
                </SortierKopf>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortierteArtikel.map((a) => (
                <tr key={a.id}>
                  <td className="tabelle-num">{a.artikelnummer}</td>
                  <td>{a.bezeichnung}</td>
                  <td>{einheitKuerzel(a.einheit_id)}</td>
                  <td>{formatCent(a.standardpreis_cent)}</td>
                  <td>
                    {/* Eigene Spalte statt eines dritten Knopfes im Aktionsfeld:
                        Die Anzahl ist eine Angabe zum Artikel und gehört zu den
                        anderen Angaben, nicht zwischen „Bearbeiten" und „Löschen". */}
                    <button
                      type="button"
                      className="btn btn-leise"
                      onClick={() => setPreiseFuer(a)}
                      aria-label={`Kundenpreise für ${a.bezeichnung}`}
                    >
                      {a.kundenpreise_anzahl === 0
                        ? "keine"
                        : `${a.kundenpreise_anzahl} ${a.kundenpreise_anzahl === 1 ? "Ausnahme" : "Ausnahmen"}`}
                    </button>
                  </td>
                  <td className="aktionen">
                    <button type="button" className="btn" onClick={() => bearbeiten(a)}>
                      Bearbeiten
                    </button>
                    <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {preiseFuer && (
        <KundenpreiseDialog
          artikelId={preiseFuer.id}
          artikelBezeichnung={preiseFuer.bezeichnung}
          standardpreisCent={preiseFuer.standardpreis_cent}
          kunden={kunden}
          onAenderung={ladeArtikel}
          onSchliessen={() => setPreiseFuer(null)}
        />
      )}
    </div>
  );
}
