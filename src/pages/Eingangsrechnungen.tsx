import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api, type AppFehler, type Eingangsrechnung, type EingangsrechnungFelderNeu, type EingangsrechnungVorschau } from "../api";
import { Bestaetigungsdialog } from "../components/Bestaetigungsdialog";
import { EingangsrechnungZusatzfelder } from "../components/EingangsrechnungZusatzfelder";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { useSortierung } from "../hooks/useSortierung";
import { formatCentMitWaehrung, formatMenge, parseEuro } from "../geld";
import { datumDeutsch } from "../datum";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { SeitenkopfMitRundgang } from "../components/SeitenkopfMitRundgang";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Eingangsrechnungen",
    text: "Rechnungen, die du selbst erhältst — als E-Rechnung (XRechnung, ZUGFeRD) oder als reines PDF. Die Originaldatei wird unverändert archiviert, wie die GoBD es verlangen.",
  },
  {
    ziel: "[data-tour='importieren']",
    titel: "Importieren",
    text: "Wählt eine Datei aus: Bei einer E-Rechnung werden die Angaben (Verkäufer, Beträge, Positionen) automatisch übernommen, bei einem reinen PDF trägst du sie von Hand nach. Doppelte Importe derselben Rechnung werden erkannt und gemeldet.",
  },
  {
    ziel: "[data-tour='tabelle']",
    titel: "Die Liste",
    text: "Ein Klick auf eine Zeile öffnet die Detailseite mit allen übernommenen Angaben und der archivierten Originaldatei. Nachträgliche Korrekturen werden dort mit altem und neuem Wert protokolliert.",
  },
];

const FORMAT_LABEL: Record<string, string> = {
  xrechnung: "XRechnung",
  zugferd: "ZUGFeRD",
  pdf: "PDF (ohne Daten)",
};

interface EingangsrechnungenProps {
  onOeffnen: (id: string) => void;
}

export function Eingangsrechnungen({ onOeffnen }: EingangsrechnungenProps) {
  const [liste, setListe] = useState<Eingangsrechnung[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  // Eine leere Liste und eine noch ausstehende Antwort sehen sonst gleich aus.
  const [geladen, setGeladen] = useState(false);
  const [vorschau, setVorschau] = useState<EingangsrechnungVorschau | null>(null);
  const [dateiBytes, setDateiBytes] = useState<number[]>([]);
  const [dateiname, setDateiname] = useState("");
  const [bearbeitenModus, setBearbeitenModus] = useState(false);
  const [zeigeDuplikatWarnung, setZeigeDuplikatWarnung] = useState(false);
  const [betragText, setBetragText] = useState("");

  function laden() {
    api.eingangsrechnungen
      .list()
      .then((l) => {
        setListe(l);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
  }

  useEffect(laden, []);

  async function dateiImportierenAuswaehlen() {
    const pfad = await open({ multiple: false, filters: [{ name: "E-Rechnung", extensions: ["xml", "pdf"] }] });
    if (!pfad || typeof pfad !== "string") return;
    const bytes = Array.from(await readFile(pfad));
    setFehler(null);
    try {
      const v = await api.eingangsrechnungen.importVorschau(bytes);
      // Datei und Vorschau werden erst nach erfolgreichem Parsen gemeinsam
      // übernommen. Würden die Bytes vorher gesetzt, bliebe bei einem
      // Parse-Fehler die Vorschau der vorigen Datei stehen — "Speichern" legte
      // dann die neue Datei unter den alten Metadaten ab.
      setDateiBytes(bytes);
      setDateiname(pfad.split(/[/\\]/).pop() ?? pfad);
      setVorschau(v);
      setBearbeitenModus(false);
      setBetragText((v.felder.betrag_cent / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function feldAendern<K extends keyof EingangsrechnungFelderNeu>(feld: K, wert: EingangsrechnungFelderNeu[K]) {
    if (!vorschau) return;
    setVorschau({ ...vorschau, felder: { ...vorschau.felder, [feld]: wert } });
  }

  async function speichernAusfuehren() {
    if (!vorschau) return;
    const betragCent = parseEuro(betragText);
    if (betragCent === null) {
      setFehler({ typ: "validation", feld: "betrag", meldung: "Bitte einen gültigen Betrag eingeben" });
      setZeigeDuplikatWarnung(false);
      return;
    }
    setFehler(null);
    try {
      await api.eingangsrechnungen.speichern(dateiBytes, dateiname, { ...vorschau.felder, betrag_cent: betragCent });
      setVorschau(null);
      setZeigeDuplikatWarnung(false);
      laden();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  function speichernKlick() {
    if (vorschau?.ist_duplikat) {
      setZeigeDuplikatWarnung(true);
      return;
    }
    speichernAusfuehren();
  }

  const { sortiert: sortierteListe, sortierung, sortieren } = useSortierung(
    liste,
    {
      steller: (e) => e.rechnungssteller_name,
      nummer: (e) => e.rechnungsnummer,
      datum: (e) => e.rechnungsdatum,
      betrag: (e) => e.betrag_cent,
      format: (e) => FORMAT_LABEL[e.format] ?? e.format,
    },
    "datum",
    "ab",
  );

  return (
    <div>
      <SeitenkopfMitRundgang titel="Eingangsrechnungen" schritte={RUNDGANG_SCHRITTE} />
      <Fehler fehler={fehler} />

      {zeigeDuplikatWarnung && (
        <Bestaetigungsdialog
          text={`Rechnung Nr. „${vorschau?.felder.rechnungsnummer}" von „${vorschau?.felder.rechnungssteller_name}" wurde bereits importiert. Trotzdem importieren?`}
          bestaetigenLabel="Trotzdem importieren"
          onAbbrechen={() => setZeigeDuplikatWarnung(false)}
          onBestaetigen={speichernAusfuehren}
        />
      )}

      <Werkzeugleiste
        aktion={
          <button type="button" className="btn btn-primaer" data-tour="importieren" onClick={dateiImportierenAuswaehlen}>
            Importieren
          </button>
        }
      />

      {vorschau && (
        <form
          className="karte"
          onSubmit={(e) => {
            e.preventDefault();
            speichernKlick();
          }}
        >
          {/* Ein PDF ohne eingebettete Daten ist kein Fehlschlag, sondern der
              Normalfall bei eingescannten Rechnungen — die Meldung darf nicht
              nach einem Problem klingen. Aufbewahrungspflichtig ist die Datei
              in beiden Fällen. */}
          {!vorschau.geparst &&
            (vorschau.format === "pdf" ? (
              <p role="status">
                Dieses PDF enthält keine maschinenlesbaren Rechnungsdaten. Die Datei wird
                unverändert archiviert — bitte tragen Sie die Angaben von Hand ein.
              </p>
            ) : (
              <p role="alert">Konnte nicht automatisch gelesen werden — bitte Felder von Hand eintragen.</p>
            ))}
          {vorschau.ist_duplikat && !zeigeDuplikatWarnung && (
            <p>Diese Rechnung wurde möglicherweise bereits importiert.</p>
          )}

          {vorschau.geparst && !bearbeitenModus ? (
            <>
              <p>Rechnungssteller: <span>{vorschau.felder.rechnungssteller_name}</span></p>
              <p>Nummer: <span>{vorschau.felder.rechnungsnummer}</span></p>
              <p>Datum: <span>{vorschau.felder.rechnungsdatum}</span></p>
              <p>Betrag: <span>{formatCentMitWaehrung(vorschau.felder.betrag_cent, vorschau.felder.waehrung)}</span></p>
              <button type="button" className="btn" onClick={() => setBearbeitenModus(true)}>
                Bearbeiten
              </button>
            </>
          ) : (
            <>
              <label className="feld">
                Rechnungssteller
                <input
                  value={vorschau.felder.rechnungssteller_name}
                  onChange={(e) => feldAendern("rechnungssteller_name", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Nummer
                <input
                  value={vorschau.felder.rechnungsnummer}
                  onChange={(e) => feldAendern("rechnungsnummer", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Datum
                <input
                  type="date"
                  value={vorschau.felder.rechnungsdatum}
                  onChange={(e) => feldAendern("rechnungsdatum", e.currentTarget.value)}
                />
              </label>
              <label className="feld">
                Betrag ({vorschau.felder.waehrung})
                <input value={betragText} onChange={(e) => setBetragText(e.currentTarget.value)} placeholder="95,00" />
              </label>
              {vorschau.geparst && (
                <button type="button" className="btn" onClick={() => setBearbeitenModus(false)}>
                  Abbrechen
                </button>
              )}
            </>
          )}

          {vorschau.felder.positionen.length > 0 && (
            <table className="tabelle" data-tour="tabelle">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Menge</th>
                  <th>Einzelpreis</th>
                  <th>Summe</th>
                </tr>
              </thead>
              <tbody>
                {vorschau.felder.positionen.map((p, i) => (
                  <tr key={i}>
                    <td>{p.bezeichnung}</td>
                    <td>{formatMenge(p.menge)}</td>
                    <td>{formatCentMitWaehrung(p.einzelpreis_cent, vorschau.felder.waehrung)}</td>
                    <td>{formatCentMitWaehrung(p.positionssumme_cent, vorschau.felder.waehrung)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {vorschau.geparst && (
            <EingangsrechnungZusatzfelder
              kaeufer_name={vorschau.felder.kaeufer_name}
              kaeufer_strasse={vorschau.felder.kaeufer_strasse}
              kaeufer_plz={vorschau.felder.kaeufer_plz}
              kaeufer_ort={vorschau.felder.kaeufer_ort}
              kaeufer_land={vorschau.felder.kaeufer_land}
              verkaeufer_strasse={vorschau.felder.verkaeufer_strasse}
              verkaeufer_plz={vorschau.felder.verkaeufer_plz}
              verkaeufer_ort={vorschau.felder.verkaeufer_ort}
              verkaeufer_land={vorschau.felder.verkaeufer_land}
              verkaeufer_steuernummer={vorschau.felder.verkaeufer_steuernummer}
              verkaeufer_email={vorschau.felder.verkaeufer_email}
              zahlungsbedingungen={vorschau.felder.zahlungsbedingungen}
              faelligkeitsdatum={vorschau.felder.faelligkeitsdatum}
              iban={vorschau.felder.iban}
              bic={vorschau.felder.bic}
              bankname={vorschau.felder.bankname}
              bestellnummer={vorschau.felder.bestellnummer}
              leitweg_id={vorschau.felder.leitweg_id}
              lieferantennummer={vorschau.felder.lieferantennummer}
              leistungsdatum={vorschau.felder.leistungsdatum}
              waehrung={vorschau.felder.waehrung}
              steuerzeilen={vorschau.felder.steuerzeilen}
            />
          )}

          <button type="submit" className="btn btn-primaer">Speichern</button>
        </form>
      )}

      {!geladen && <Laden was="Eingangsrechnungen" />}

      {geladen && liste.length === 0 && (
        <p>Noch keine Eingangsrechnungen — importiere oben eine E-Rechnung oder ein PDF.</p>
      )}

      <table className="tabelle tabelle-klickbar">
        <thead>
          <tr>
            <SortierKopf spalte="steller" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
              Rechnungssteller
            </SortierKopf>
            <SortierKopf spalte="nummer" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
              Nummer
            </SortierKopf>
            <SortierKopf spalte="datum" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
              Datum
            </SortierKopf>
            <SortierKopf spalte="betrag" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
              Betrag
            </SortierKopf>
            <SortierKopf spalte="format" aktiv={sortierung.spalte} richtung={sortierung.richtung} onSortieren={sortieren}>
              Format
            </SortierKopf>
          </tr>
        </thead>
        <tbody>
          {sortierteListe.map((e) => (
            <tr key={e.id} onClick={() => onOeffnen(e.id)}>
              <td>{e.rechnungssteller_name}</td>
              <td className="tabelle-num">
                <ZeilenKnopf onOeffnen={() => onOeffnen(e.id)}>{e.rechnungsnummer}</ZeilenKnopf>
              </td>
              <td className="nicht-umbrechen">{datumDeutsch(e.rechnungsdatum)}</td>
              <td>{formatCentMitWaehrung(e.betrag_cent, e.waehrung)}</td>
              <td>{FORMAT_LABEL[e.format] ?? e.format}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
