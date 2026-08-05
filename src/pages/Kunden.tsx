import { useEffect, useRef, useState } from "react";
import { api, type AppFehler, type Kunde, type KundeNeu } from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { SortierKopf } from "../components/SortierKopf";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { useSortierung } from "../hooks/useSortierung";
import { Laden } from "../components/Laden";
import { Hinweis } from "../components/Hinweis";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { SeitenkopfMitRundgang } from "../components/SeitenkopfMitRundgang";
import type { Reiter } from "./KundeDetail";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Kunden",
    text: "Alle Auftraggeber an einem Ort. Ohne Kunden lässt sich kein Angebot und keine Rechnung schreiben — hier beginnt jeder neue Vorgang.",
  },
  {
    ziel: "[data-tour='suche']",
    titel: "Suche",
    text: "Findet Kunden nach Nummer oder Name. ⌘F (Strg+F) springt von überall auf dieser Seite hierher.",
  },
  {
    ziel: "[data-tour='neu']",
    titel: "Neuer Kunde",
    text: "Legt einen Kunden an — es reicht der Name, alles Weitere lässt sich nachtragen. Auch per ⌘N (Strg+N). Adresse und Ansprechpartner kommen danach auf der Detailseite dazu.",
  },
  {
    ziel: "[data-tour='tabelle']",
    titel: "Die Kundenliste",
    text: "Ein Klick auf eine Zeile öffnet die Detailseite mit Stammdaten, Adressen und Ansprechpartnern. Das Warnsymbol neben einem Namen heißt: Es fehlt noch eine Rechnungsadresse — ohne sie lässt sich keine Rechnung stellen.",
  },
];

interface KundenProps {
  onOeffnen: (id: string, startReiter?: Reiter) => void;
  zeigeFormularBeimStart?: boolean;
  onFormularUebernommen?: () => void;
  onZuArtikelWechseln?: () => void;
}

const KUNDE_TYP_LABEL: Record<string, string> = {
  firma: "Firma",
  privat: "Privat",
};

const WARNUNG_ICON = (
  <svg className="warnung-icon" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6.5v4.5" strokeLinecap="round" />
    <circle cx="10" cy="13.5" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

const KUNDE_NEU_LEER: KundeNeu = {
  typ: "firma",
  name: "",
  zahlungsziel_tage: 14,
  notizen: "",
  ust_idnr: "",
  email: "",
  leitweg_id: "",
  kaeuferreferenz: "",
};

/**
 * Kundenliste mit Suche und Formular zum Anlegen neuer Kunden. Klick auf
 * eine Zeile ruft `onOeffnen(id)` — die eigentliche Detail-Navigation ist
 * Aufgabe der Eltern-Komponente (App.tsx), nicht dieser Seite.
 */
export function Kunden({
  onOeffnen,
  zeigeFormularBeimStart,
  onFormularUebernommen,
  onZuArtikelWechseln,
}: KundenProps) {
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [suche, setSuche] = useState("");
  const [leerHinweisVersteckt, setLeerHinweisVersteckt] = useState(false);
  const [neuerKundeId, setNeuerKundeId] = useState<string | null>(null);
  const [zeigtAdressHinweis, setZeigtAdressHinweis] = useState(false);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [zeigeFormular, setZeigeFormular] = useState(zeigeFormularBeimStart ?? false);
  const [neuerKunde, setNeuerKunde] = useState<KundeNeu>(KUNDE_NEU_LEER);
  const [formFehler, setFormFehler] = useState<AppFehler | null>(null);
  const [artikelLeer, setArtikelLeer] = useState(false);
  const [zeigtArtikelHinweis, setZeigtArtikelHinweis] = useState(false);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  useEffect(() => {
    if (zeigeFormularBeimStart) {
      onFormularUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.artikel.list().then((liste) => setArtikelLeer(liste.length === 0)).catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      api.kunden
        .list(suche || undefined)
        .then((liste) => {
          setKunden(liste);
          setFehler(null);
        })
        .catch((e) => setFehler(e as AppFehler))
        .finally(() => setGeladen(true));
    }, 300);
    return () => clearTimeout(timeout);
  }, [suche]);

  async function anlegen() {
    setFormFehler(null);
    try {
      const erstellt = await api.kunden.create(neuerKunde);
      setZeigeFormular(false);
      setNeuerKunde(KUNDE_NEU_LEER);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      setNeuerKundeId(erstellt.id);
      setZeigtAdressHinweis(true);
      if (artikelLeer) {
        setZeigtArtikelHinweis(true);
      }
    } catch (e) {
      setFormFehler(e as AppFehler);
    }
  }

  async function loeschen(kunde: Kunde) {
    const text =
      kunde.kundenpreise_anzahl === 0
        ? `Kunde „${kunde.name}" löschen?`
        : `Kunde „${kunde.name}" hat ${kunde.kundenpreise_anzahl} Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?`;
    if (!(await bestaetigen(text))) return;
    setFehler(null);
    try {
      await api.kunden.delete(kunde.id, kunde.kundenpreise_anzahl > 0);
      const liste = await api.kunden.list(suche || undefined);
      setKunden(liste);
      zeigen(`Kunde „${kunde.name}" gelöscht`);
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const { feldFehler, bannerFehler } = formularFehler(formFehler, ["name", "email"]);

  const { sortiert: sortierteKunden, sortierung, sortieren } = useSortierung(
    kunden,
    {
      nummer: (k) => k.kundennummer,
      name: (k) => k.name,
      typ: (k) => KUNDE_TYP_LABEL[k.typ] ?? k.typ,
    },
    "nummer",
  );

  return (
    <div>
      <SeitenkopfMitRundgang titel="Kunden" schritte={RUNDGANG_SCHRITTE} />
      <Fehler fehler={fehler} />
      {hinweis}
      {dialog}

      {zeigtAdressHinweis && neuerKundeId && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtAdressHinweis(false)}>
          Kunde angelegt —{" "}
          <button
            type="button"
            className="btn btn-leise"
            onClick={() => onOeffnen(neuerKundeId, "adressen")}
          >
            jetzt Adresse und Ansprechpartner ergänzen?
          </button>
        </Hinweis>
      )}

      {zeigtArtikelHinweis && (
        <Hinweis autoDismissMs={4000} onSchliessen={() => setZeigtArtikelHinweis(false)}>
          Kunde angelegt —{" "}
          <button type="button" className="btn btn-leise" onClick={() => onZuArtikelWechseln?.()}>
            jetzt auch einen Artikel anlegen?
          </button>
        </Hinweis>
      )}

      <Werkzeugleiste
        filter={
          <label className="feld" data-tour="suche">
            Suche
            <input
              ref={sucheRef}
              type="search"
              placeholder="Nummer oder Name"
              value={suche}
              onChange={(e) => setSuche(e.currentTarget.value)}
            />
          </label>
        }
        aktion={
          <button
            type="button"
            className="btn btn-primaer"
            data-tour="neu"
            onClick={() => setZeigeFormular(true)}
          >
            Neuer Kunde
          </button>
        }
      />

      {zeigeFormular && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            anlegen();
          }}
        >
          <Fehler fehler={bannerFehler} />
          <div className="feld">
            <label>
              Typ
              <select
                value={neuerKunde.typ}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, typ: e.currentTarget.value as "firma" | "privat" })
                }
              >
                <option value="firma">Firma</option>
                <option value="privat">Privat</option>
              </select>
            </label>
          </div>
          <div className="feld">
            <label>
              Name
              <input
                required
                value={neuerKunde.name}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, name: e.currentTarget.value })}
              />
            </label>
            {feldFehler("name") && <div className="feld-fehler" role="alert">{feldFehler("name")}</div>}
          </div>
          <div className="feld">
            <label>
              Zahlungsziel (Tage)
              <input
                type="number"
                min={0}
                max={365}
                value={neuerKunde.zahlungsziel_tage}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, zahlungsziel_tage: Number(e.currentTarget.value) })
                }
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Notizen
              <textarea
                value={neuerKunde.notizen}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, notizen: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              USt-IdNr.
              <input
                value={neuerKunde.ust_idnr}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, ust_idnr: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              E-Mail
              <input
                value={neuerKunde.email}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, email: e.currentTarget.value })}
              />
            </label>
            {feldFehler("email") && <div className="feld-fehler" role="alert">{feldFehler("email")}</div>}
          </div>
          <div className="feld">
            <label>
              Leitweg-ID
              <input
                value={neuerKunde.leitweg_id}
                onChange={(e) => setNeuerKunde({ ...neuerKunde, leitweg_id: e.currentTarget.value })}
              />
            </label>
          </div>
          <div className="feld">
            <label>
              Käuferreferenz
              <input
                value={neuerKunde.kaeuferreferenz}
                onChange={(e) =>
                  setNeuerKunde({ ...neuerKunde, kaeuferreferenz: e.currentTarget.value })
                }
              />
            </label>
          </div>
          <div className="aktionen aktionen-formular">
            <button type="submit" className="btn btn-primaer">Speichern</button>
            <button type="button" className="btn" onClick={() => setZeigeFormular(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Solange das Anlage-Formular offen ist, bleibt die Liste komplett
          ausgeblendet — sonst wirkte sie wie ein Teil des neuen Kunden. */}
      {!zeigeFormular && (
        <>
          {!geladen && <Laden was="Kunden" />}

          {geladen && kunden.length === 0 && suche === "" && !leerHinweisVersteckt && (
            <Hinweis onSchliessen={() => setLeerHinweisVersteckt(true)}>
              Noch keine Kunden — leg direkt los.
            </Hinweis>
          )}

          {geladen && kunden.length === 0 && suche !== "" && (
            <p>Keine Kunden gefunden für „{suche}".</p>
          )}

          <table className="tabelle tabelle-klickbar" data-tour="tabelle">
            <thead>
              <tr>
                <SortierKopf spalte="nummer" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Nummer
                </SortierKopf>
                <SortierKopf spalte="name" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Name
                </SortierKopf>
                <SortierKopf spalte="typ" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
                  Typ
                </SortierKopf>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {sortierteKunden.map((kunde) => (
                <tr key={kunde.id} onClick={() => onOeffnen(kunde.id)}>
                  <td className="tabelle-num">
                    <ZeilenKnopf onOeffnen={() => onOeffnen(kunde.id)}>{kunde.kundennummer}</ZeilenKnopf>
                  </td>
                  <td>
                    {kunde.name}
                    {!kunde.hat_adresse && (
                      <span title="Keine Adresse hinterlegt">{WARNUNG_ICON}</span>
                    )}
                  </td>
                  <td>{KUNDE_TYP_LABEL[kunde.typ] ?? kunde.typ}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-gefahr"
                      disabled={kunde.hat_offene_entwuerfe}
                      onClick={(e) => {
                        e.stopPropagation();
                        loeschen(kunde);
                      }}
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
