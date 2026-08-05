import { useRef } from "react";
import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Blaettern } from "../components/Blaettern";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { StatusMarke } from "../components/StatusMarke";
import { Werkzeugleiste } from "../components/Werkzeugleiste";
import { ANGEBOT_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";
import { type FuehrungsSchritt } from "../components/Fuehrung";
import { SeitenkopfMitRundgang } from "../components/SeitenkopfMitRundgang";

/**
 * Statisch außerhalb der Komponente, wie auf der Übersicht: Ein je Rendern
 * neues Array ließe den Positionierungs-Effekt der Führung durchdrehen.
 */
const RUNDGANG_SCHRITTE: FuehrungsSchritt[] = [
  {
    ziel: "[data-tour='titel']",
    titel: "Angebote",
    text: "Der übliche Anfang eines Auftrags: Angebot schreiben, festschreiben, als PDF verschicken — und bei Zusage mit einem Klick in eine Rechnung überführen.",
  },
  {
    ziel: "[data-tour='suche']",
    titel: "Suche",
    text: "Findet Angebote nach Nummer oder Kundenname — auch nach dem Namen, der beim Festschreiben eingefroren wurde, falls der Kunde inzwischen anders heißt. ⌘F (Strg+F) springt hierher.",
  },
  {
    ziel: "[data-tour='status']",
    titel: "Statusfilter",
    text: "Entwurf, festgeschrieben, angenommen, abgelehnt, abgelaufen — der Filter blendet alles andere aus, etwa für den Blick auf alles, was noch auf Antwort wartet.",
  },
  {
    ziel: "[data-tour='neu']",
    titel: "Neues Angebot",
    text: "Kunde und Datum wählen, dann öffnet sich der Entwurf für Positionen und Texte — auch per ⌘N (Strg+N). Ein Entwurf hat noch keine Nummer und lässt sich jederzeit ändern oder löschen.",
  },
  {
    ziel: "[data-tour='tabelle']",
    titel: "Die Angebotsliste",
    text: "Ein Klick auf eine Zeile öffnet das Angebot. Spaltenköpfe sortieren; bei mehr als 25 Einträgen wird unten geblättert.",
  },
];

interface AngeboteProps {
  onOeffnen: (id: string) => void;
}

export function Angebote({ onOeffnen }: AngeboteProps) {
  const liste = useBelegListe("angebot", onOeffnen);
  const sucheRef = useRef<HTMLInputElement>(null);

  useListenTastenkuerzel({
    neu: () => liste.setZeigeFormular(true),
    sucheFokussieren: () => sucheRef.current?.focus(),
  });

  return (
    <div>
      <SeitenkopfMitRundgang titel="Angebote" schritte={RUNDGANG_SCHRITTE} />
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <Werkzeugleiste
        filter={
          <>
            <label className="feld" data-tour="suche">
              Suche
              <input
                ref={sucheRef}
                type="search"
                value={liste.suche}
                onChange={(e) => liste.setSuche(e.currentTarget.value)}
                placeholder="Nummer oder Kunde"
              />
            </label>
            <label className="feld" data-tour="status">
              Status
              <select
                value={liste.statusFilter}
                onChange={(e) => liste.setStatusFilter(e.currentTarget.value)}
              >
                <option value="">Alle</option>
                {statusAuswahl(ANGEBOT_STATUS).map(([wert, label]) => (
                  <option key={wert} value={wert}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        aktion={
          !liste.zeigeFormular && (
            <button
              type="button"
              className="btn btn-primaer"
              data-tour="neu"
              onClick={() => liste.setZeigeFormular(true)}
            >
              Neues Angebot
            </button>
          )
        }
      />

      {/* Solange das Anlage-Formular offen ist, bleibt die Liste komplett
          ausgeblendet — sonst wirkte sie wie ein Teil des neuen Angebots. */}
      {liste.zeigeFormular ? (
        <BelegAnlegen
          kunden={liste.kunden}
          kundeId={liste.kundeId}
          onKundeId={liste.setKundeId}
          datum={liste.datum}
          onDatum={liste.setDatum}
          fehler={liste.formFehler}
          onAnlegen={liste.anlegen}
        />
      ) : (
        <>
          {!liste.geladen && <Laden was="Angebote" />}

          {liste.geladen && liste.belege.length === 0 && (
            <p>
              {liste.suche
                ? `Keine Angebote gefunden für „${liste.suche}".`
                : liste.statusFilter
                  ? "Keine Angebote mit diesem Status."
                  : "Noch keine Angebote — leg oben eines an."}
            </p>
          )}

          <table className="tabelle tabelle-klickbar" data-tour="tabelle">
            <thead>
              <tr>
                <SortierKopf
                  spalte="nummer"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Nummer
                </SortierKopf>
                <SortierKopf
                  spalte="kunde"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Kunde
                </SortierKopf>
                <SortierKopf
                  spalte="datum"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Datum
                </SortierKopf>
                <SortierKopf
                  spalte="status"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Status
                </SortierKopf>
                <SortierKopf
                  spalte="summe"
                  aktiv={liste.sortierung.spalte}
                  richtung={liste.sortierung.richtung}
                  onSortieren={liste.sortieren}
                >
                  Summe
                </SortierKopf>
              </tr>
            </thead>
            <tbody>
              {liste.belege.map((a) => (
                <tr key={a.id} onClick={() => onOeffnen(a.id)}>
                  <td className="tabelle-num nicht-umbrechen">
                    <ZeilenKnopf onOeffnen={() => onOeffnen(a.id)}>{a.nummer ?? "Entwurf"}</ZeilenKnopf>
                  </td>
                  <td>{liste.kundeName(a)}</td>
                  <td className="nicht-umbrechen">{datumDeutsch(a.datum)}</td>
                  <td>
                    <StatusMarke status={a.status} />
                  </td>
                  <td className="nicht-umbrechen">{formatCent(a.summe_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <Blaettern
            seite={liste.seite}
            seitenAnzahl={liste.seitenAnzahl}
            gesamt={liste.trefferAnzahl}
            onSeite={liste.setSeite}
          />
        </>
      )}
    </div>
  );
}
