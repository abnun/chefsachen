import { useRef } from "react";
import { BelegAnlegen } from "../components/BelegAnlegen";
import { Fehler } from "../components/Fehler";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { Blaettern } from "../components/Blaettern";
import { Laden } from "../components/Laden";
import { SortierKopf } from "../components/SortierKopf";
import { StatusMarke } from "../components/StatusMarke";
import { ANGEBOT_STATUS, statusAuswahl } from "../belegStatus";
import { datumDeutsch } from "../datum";
import { formatCent } from "../geld";
import { useBelegListe } from "../hooks/useBelegListe";
import { useListenTastenkuerzel } from "../hooks/useListenTastenkuerzel";

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
      <h1 className="seiten-kopf">Angebote</h1>
      {liste.fehler && <Fehler fehler={liste.fehler} />}
      <div className="werkzeugleiste">
        <label className="feld">
          Suche
          <input
            ref={sucheRef}
            type="search"
            value={liste.suche}
            onChange={(e) => liste.setSuche(e.currentTarget.value)}
            placeholder="Nummer oder Kunde"
          />
        </label>
        <label className="feld">
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
      </div>

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

      <table className="tabelle tabelle-klickbar">
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
        <button
          type="button"
          className="btn btn-primaer"
          onClick={() => liste.setZeigeFormular(true)}
        >
          Neues Angebot
        </button>
      )}
    </div>
  );
}
