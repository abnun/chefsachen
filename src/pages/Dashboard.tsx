import { useEffect, useId, useState } from "react";
import { api, type AppFehler, type DashboardDaten, type Grenze, type Hinweis, type Warnstufe } from "../api";
import { Fehler } from "../components/Fehler";
import { Laden } from "../components/Laden";
import { ZeilenKnopf } from "../components/ZeilenKnopf";
import { ErsteSchritte, type Schritt } from "../components/ErsteSchritte";
import { formatCent } from "../geld";
import { datumDeutsch } from "../datum";

interface DashboardProps {
  onRechnungOeffnen: (id: string) => void;
  onAngebotOeffnen: (id: string) => void;
  /** Sprung aus der Kachel „Erste Schritte" an die Stelle, wo es weitergeht. */
  onErsterSchritt: (schritt: Schritt) => void;
}

const WARN_KLASSE: Record<Warnstufe, string> = {
  keine: "grenze-keine",
  annaeherung: "grenze-annaeherung",
  kritisch: "grenze-kritisch",
  ueberschritten: "grenze-ueberschritten",
};

/**
 * Formatiert eine Umsatzgrenze für eine Überschrift: runde Beträge ohne „,00".
 *
 * `formatCent` schreibt immer zwei Nachkommastellen — bei „100.000,00 €" in
 * einer Überschrift ist das unnötiger Ballast. Alle drei Balkentitel gehen
 * durch diese Funktion, damit sie einheitlich aussehen und sich im
 * Gründungsjahr mit der Grenze ändern.
 */
function grenzeText(cent: number): string {
  return formatCent(cent).replace(",00", "");
}

function faelligkeitText(tage: number): string {
  if (tage < 0) return `${Math.abs(tage)} Tage überfällig`;
  if (tage === 0) return "heute fällig";
  return `in ${tage} Tagen fällig`;
}

interface GrenzenBalkenProps {
  titel: string;
  erlaeuterung: string;
  grenze: Grenze;
}

/**
 * Ein Fortschrittsbalken zu einer Umsatzgrenze.
 *
 * Der Balken wird bei 100 % gekappt, der Prozentwert daneben nicht — sonst
 * sähe eine Überschreitung um das Doppelte genauso aus wie eine um einen Cent.
 */
function GrenzenBalken({ titel, erlaeuterung, grenze }: GrenzenBalkenProps) {
  const breite = Math.min(grenze.anteil_prozent, 100);
  return (
    <div className="grenze">
      <div className="grenze-kopf">
        <span className="grenze-titel">{titel}</span>
        <span className="grenze-zahlen">
          {formatCent(grenze.umsatz_cent)} von {formatCent(grenze.grenze_cent)}
        </span>
      </div>
      <div
        className={`grenze-balken ${WARN_KLASSE[grenze.warnstufe]}`}
        role="meter"
        aria-label={titel}
        aria-valuenow={grenze.anteil_prozent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${grenze.anteil_prozent} Prozent von ${formatCent(grenze.grenze_cent)}`}
      >
        <div className="grenze-fuellung" style={{ width: `${breite}%` }} />
      </div>
      <p className="grenze-erlaeuterung">
        <strong>{grenze.anteil_prozent} %</strong> — {erlaeuterung}
      </p>
    </div>
  );
}

function HinweisKarte({ hinweis }: { hinweis: Hinweis }) {
  // `useId` statt einer aus dem Titel gebauten ID: Titel enthalten Leerzeichen,
  // und `aria-labelledby` liest die als mehrere ID-Verweise. Keiner davon
  // existierte, die Karte hatte damit gar keinen zugänglichen Namen.
  const titelId = useId();
  return (
    <section className={`hinweis-karte ${WARN_KLASSE[hinweis.stufe]}`} aria-labelledby={titelId}>
      <h3 id={titelId}>{hinweis.titel}</h3>
      <p>{hinweis.bedeutung}</p>
      {hinweis.finanzielle_folge && (
        <p className="hinweis-betrag">
          <strong>Rund {formatCent(hinweis.finanzielle_folge.betrag_cent)}</strong>{" "}
          {hinweis.finanzielle_folge.erlaeuterung}
        </p>
      )}
      <p className="hinweis-schritte-kopf">Was jetzt zu tun ist:</p>
      <ol className="hinweis-schritte">
        {hinweis.handlung.map((schritt, i) => (
          <li key={i}>{schritt}</li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Startseite mit Umsatzlage, offenen Posten und den zuletzt bearbeiteten Belegen.
 *
 * Die Umsatzgrenzen erscheinen nur, wenn die Firma tatsächlich als
 * Kleinunternehmer geführt wird — bei Regelbesteuerung liefert das Backend sie
 * gar nicht erst.
 */
export function Dashboard({ onRechnungOeffnen, onAngebotOeffnen, onErsterSchritt }: DashboardProps) {
  const [daten, setDaten] = useState<DashboardDaten | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    api.dashboard
      .laden()
      .then((d) => {
        setDaten(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, []);

  if (fehler) {
    return (
      <div>
        <h1 className="seiten-kopf">Übersicht</h1>
        <Fehler fehler={fehler} />
      </div>
    );
  }

  if (!daten) {
    return (
      <div>
        <h1 className="seiten-kopf">Übersicht</h1>
        <Laden />
      </div>
    );
  }

  const g = daten.umsatzgrenzen;

  return (
    <div>
      <h1 className="seiten-kopf">Übersicht {daten.jahr}</h1>

      {/* Ganz oben: Wer noch am Anfang steht, soll nicht erst an Umsatzzahlen
          vorbeiscrollen, die alle auf null stehen. */}
      <ErsteSchritte hatBelege={daten.letzte_belege.length > 0} onStarten={onErsterSchritt} />

      <section className="karte">
        <h2>Vereinnahmter Umsatz</h2>
        <p className="kennzahl">{formatCent(daten.umsatz_laufendes_jahr_cent)}</p>
        <p className="kennzahl-neben">
          Vorjahr: {formatCent(daten.umsatz_vorjahr_cent)}
        </p>
        <p className="feld-hinweis">
          Gezählt wird, wann Geld geflossen ist, nicht wann eine Rechnung gestellt wurde
          (§ 19 Abs. 2 UStG). Erstattungen mindern den Betrag.
        </p>
      </section>

      {g && (
        <section className="karte">
          <h2>
            Kleinunternehmergrenzen
            {g.ist_gruendungsjahr && <span className="marke"> Gründungsjahr</span>}
          </h2>

          <GrenzenBalken
            titel={`Laufendes Jahr gegen ${grenzeText(g.laufendes_jahr_gegen_jahresgrenze.grenze_cent)}`}
            erlaeuterung="Wird diese Grenze überschritten, endet die Regelung sofort — mit dem Umsatz, der sie reißt."
            grenze={g.laufendes_jahr_gegen_jahresgrenze}
          />

          {!g.ist_gruendungsjahr && (
            <GrenzenBalken
              titel={`Laufendes Jahr gegen ${grenzeText(g.laufendes_jahr_gegen_vorjahresgrenze.grenze_cent)}`}
              erlaeuterung="Dieser Wert entscheidet, ob die Regelung im nächsten Jahr noch gilt."
              grenze={g.laufendes_jahr_gegen_vorjahresgrenze}
            />
          )}

          <GrenzenBalken
            titel={`Vorjahr gegen ${grenzeText(g.vorjahr_gegen_vorjahresgrenze.grenze_cent)}`}
            erlaeuterung="Dieser Wert entscheidet, ob die Regelung im laufenden Jahr überhaupt gilt."
            grenze={g.vorjahr_gegen_vorjahresgrenze}
          />

          <p className="feld-hinweis">
            Maßgeblich ist der Gesamtumsatz nach § 19 Abs. 2 UStG. Dieser umfasst alle
            Umsätze — auch solche, die nicht über dieses Programm abgerechnet wurden — und
            kennt Sonderfälle wie den Verkauf von Anlagevermögen. Die Anzeige ist ein
            Frühwarnsystem, keine verbindliche Auskunft.
          </p>
        </section>
      )}

      {g?.hinweise.map((h, i) => (
        <HinweisKarte key={i} hinweis={h} />
      ))}

      <section className="karte">
        <h2>Offene Rechnungen</h2>
        {daten.offene_rechnungen.length === 0 ? (
          <p>Keine offenen Rechnungen.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde</th>
                <th>Fälligkeit</th>
                <th>Offen</th>
              </tr>
            </thead>
            <tbody>
              {daten.offene_rechnungen.map((r) => (
                <tr key={r.id} onClick={() => onRechnungOeffnen(r.id)}>
                  <td>
                    <ZeilenKnopf onOeffnen={() => onRechnungOeffnen(r.id)}>{r.nummer}</ZeilenKnopf>
                  </td>
                  <td>{r.kunde_name}</td>
                  <td className={r.tage_bis_faellig < 0 ? "ueberfaellig" : undefined}>
                    {datumDeutsch(r.faellig_am)} — {faelligkeitText(r.tage_bis_faellig)}
                  </td>
                  <td>{formatCent(r.offener_betrag_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="karte">
        <h2>Offene Angebote</h2>
        {daten.offene_angebote.length === 0 ? (
          <p>Keine offenen Angebote.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Nummer</th>
                <th>Kunde</th>
                <th>Datum</th>
                <th>Summe</th>
              </tr>
            </thead>
            <tbody>
              {daten.offene_angebote.map((a) => (
                <tr key={a.id} onClick={() => onAngebotOeffnen(a.id)}>
                  <td>
                    <ZeilenKnopf onOeffnen={() => onAngebotOeffnen(a.id)}>{a.nummer}</ZeilenKnopf>
                  </td>
                  <td>{a.kunde_name}</td>
                  <td>{datumDeutsch(a.datum)}</td>
                  <td>{formatCent(a.summe_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="karte">
        <h2>Zuletzt bearbeitet</h2>
        {daten.letzte_belege.length === 0 ? (
          <p>Noch keine Belege angelegt.</p>
        ) : (
          <table className="tabelle">
            <thead>
              <tr>
                <th>Art</th>
                <th>Nummer</th>
                <th>Kunde</th>
                <th>Summe</th>
              </tr>
            </thead>
            <tbody>
              {daten.letzte_belege.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => (b.typ === "angebot" ? onAngebotOeffnen(b.id) : onRechnungOeffnen(b.id))}
                >
                  <td>{b.typ === "angebot" ? "Angebot" : "Rechnung"}</td>
                  <td>
                    <ZeilenKnopf
                      onOeffnen={() =>
                        b.typ === "angebot" ? onAngebotOeffnen(b.id) : onRechnungOeffnen(b.id)
                      }
                    >
                      {b.nummer || "(Entwurf)"}
                    </ZeilenKnopf>
                  </td>
                  <td>{b.kunde_name}</td>
                  <td>{formatCent(b.summe_cent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
