import { useEffect, useState } from "react";
import {
  api,
  type Adresse,
  type Ansprechpartner,
  type AppFehler,
  type Beleg,
  type Kunde,
  type KundeDetail as KundeDetailTyp,
  type KundenpreisMitArtikel,
} from "../api";
import { formularFehler } from "../formularFehler";
import { Fehler } from "../components/Fehler";
import { PflichtLegende, PflichtMarker } from "../components/PflichtMarker";
import { Laden } from "../components/Laden";
import { useErfolgsHinweis } from "../hooks/useErfolgsHinweis";
import { useBestaetigung } from "../hooks/useBestaetigung";
import { useUngespeichert } from "../hooks/useUngespeichert";
import { formatCent } from "../geld";
import { datumDeutschOder } from "../datum";

interface KundeDetailProps {
  id: string;
  startReiter?: Reiter | null;
  onReiterUebernommen?: () => void;
  onGeloescht?: () => void;
  /** Zurück zur Liste. Ohne diesen Weg kommt man nur über die Navigation raus. */
  onZurueck?: () => void;
}

export type Reiter = "stammdaten" | "adressen" | "ansprechpartner" | "sonderpreise" | "belege";

/**
 * Beschriftungen der Adressarten.
 *
 * Die Tabelle zeigte den Datenbankschlüssel („rechnung"), das Auswahlfeld
 * darunter die Beschriftung („Rechnung"). Dieselbe Sache in zwei Schreibweisen
 * auf einem Bildschirm — genauso ist der Belegstatus schon einmal entglitten.
 */
const ADRESSE_TYP_LABEL: Record<string, string> = {
  rechnung: "Rechnung",
  lieferung: "Lieferung",
};

const REITER: { id: Reiter; label: string; aktiv: boolean }[] = [
  { id: "stammdaten", label: "Stammdaten", aktiv: true },
  { id: "adressen", label: "Adressen", aktiv: true },
  { id: "ansprechpartner", label: "Ansprechpartner", aktiv: true },
  { id: "sonderpreise", label: "Sonderpreise", aktiv: true },
  { id: "belege", label: "Belege", aktiv: true },
];

/**
 * Kundendetailseite mit Reiter-Navigation.
 *
 * Sonderpreise werden weiterhin auf der Artikel-Seite gepflegt — dort gehören
 * sie hin, weil ein Preis immer zu einem Artikel gehört. Hier sind sie nur
 * einsehbar, damit die Frage „Welche Sonderpreise hat dieser Kunde?"
 * beantwortbar ist; bislang war sie es nicht.
 */
export function KundeDetail({ id, onZurueck, startReiter, onReiterUebernommen, onGeloescht }: KundeDetailProps) {
  const [detail, setDetail] = useState<KundeDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [reiter, setReiter] = useState<Reiter>(startReiter ?? "stammdaten");

  useEffect(() => {
    if (startReiter) {
      onReiterUebernommen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function laden() {
    api.kunden
      .get(id)
      .then((d) => {
        setDetail(d);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }

  useEffect(laden, [id]);

  if (!detail) {
    return (
      <div>
        <h1>Kunde</h1>
        {fehler ? <Fehler fehler={fehler} /> : <Laden />}
      </div>
    );
  }

  return (
    <div>
      {onZurueck && (
        <button type="button" className="btn btn-leise" onClick={onZurueck}>
          ← Zurück zur Liste
        </button>
      )}
      <h1 className="seiten-kopf">
        {detail.kunde.name} <small>{detail.kunde.kundennummer}</small>
      </h1>
      {fehler && <Fehler fehler={fehler} />}

      <nav className="werkzeugleiste">
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!r.aktiv}
            aria-current={reiter === r.id ? "page" : undefined}
            onClick={() => r.aktiv && setReiter(r.id)}
            className="btn"
          >
            {r.label}
          </button>
        ))}
      </nav>

      {reiter === "stammdaten" && (
        <StammdatenReiter kunde={detail.kunde} onGespeichert={laden} onGeloescht={onGeloescht} />
      )}
      {reiter === "adressen" && (
        <AdressenReiter kundeId={id} adressen={detail.adressen} onGeaendert={laden} />
      )}
      {reiter === "ansprechpartner" && (
        <AnsprechpartnerReiter
          kundeId={id}
          ansprechpartner={detail.ansprechpartner}
          onGeaendert={laden}
        />
      )}
      {reiter === "sonderpreise" && <SonderpreiseReiter kundeId={id} />}
      {reiter === "belege" && <BelegeReiter kundeId={id} />}
    </div>
  );
}

/**
 * Zeigt die Sonderpreise eines Kunden. Bewusst nur lesend: Gepflegt werden sie
 * auf der Artikel-Seite, wo der Zusammenhang zum Artikel sichtbar ist. Zwei
 * Pflegeorte für dieselben Daten würden nur Verwirrung stiften.
 */
function SonderpreiseReiter({ kundeId }: { kundeId: string }) {
  const [preise, setPreise] = useState<KundenpreisMitArtikel[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    api.artikel
      .kundenpreiseFuerKunde(kundeId)
      .then((p) => {
        setPreise(p);
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler))
      .finally(() => setGeladen(true));
  }, [kundeId]);

  if (!geladen) {
    return <p aria-busy="true">Sonderpreise werden geladen …</p>;
  }

  return (
    <section>
      <Fehler fehler={fehler} />
      {preise.length === 0 ? (
        <p>
          Für diesen Kunden sind keine Sonderpreise hinterlegt. Sie werden auf der
          Artikel-Seite beim jeweiligen Artikel gepflegt.
        </p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Artikel</th>
              <th>Standardpreis</th>
              <th>Sonderpreis</th>
              <th>Gültig ab</th>
            </tr>
          </thead>
          <tbody>
            {preise.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.bezeichnung} <span className="tabelle-num">{p.artikelnummer}</span>
                </td>
                <td>{formatCent(p.standardpreis_cent)}</td>
                <td>
                  {/* Dieselbe Auszeichnung wie auf der Artikel-Seite, damit ein
                      Sonderpreis überall gleich aussieht. */}
                  <span
                    className={`kundenpreis-badge ${
                      p.preis_cent < p.standardpreis_cent ? "guenstiger" : "teurer"
                    }`}
                  >
                    {formatCent(p.preis_cent)}
                  </span>
                </td>
                <td>{datumDeutschOder(p.gueltig_ab, "immer")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}


function BelegeReiter({ kundeId }: { kundeId: string }) {
  const [belege, setBelege] = useState<Beleg[]>([]);
  const [fehler, setFehler] = useState<AppFehler | null>(null);

  useEffect(() => {
    // Bewusst ungefiltert geladen und clientseitig gefiltert: beleg_list kennt
    // keinen kunde_id-Filter. Kleinunternehmer-Datenmengen sind klein genug,
    // dass sich eine Backend-Signaturänderung dafür nicht lohnt.
    api.belege
      .list()
      .then((liste) => {
        setBelege(liste.filter((b) => b.kunde_id === kundeId));
        setFehler(null);
      })
      .catch((e) => setFehler(e as AppFehler));
  }, [kundeId]);

  return (
    <section>
      <h2>Belege</h2>
      {fehler && <Fehler fehler={fehler} />}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Nummer</th>
            <th>Datum</th>
            <th>Status</th>
            <th>Summe</th>
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr key={b.id}>
              <td>{b.typ === "angebot" ? "Angebot" : "Rechnung"}</td>
              <td className="tabelle-num">{b.nummer ?? "Entwurf"}</td>
              <td>{b.datum}</td>
              <td>
                <span className={`status ${STATUS_BADGE_KLASSE[b.status] ?? "status-entwurf"}`}>{b.status}</span>
              </td>
              <td>{formatCent(b.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const STATUS_BADGE_KLASSE: Record<string, string> = {
  entwurf: "status-entwurf",
  abgelaufen: "status-entwurf",
  festgeschrieben: "status-gestellt",
  gestellt: "status-gestellt",
  angenommen: "status-bezahlt",
  abgelehnt: "status-storniert",
  storniert: "status-storniert",
};

interface StammdatenReiterProps {
  kunde: Kunde;
  onGespeichert: () => void;
  onGeloescht?: () => void;
}

function StammdatenReiter({ kunde, onGespeichert, onGeloescht }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  // Gegen den geladenen Kunden vergleichen, nicht gegen ein „berührt"-Merkmal:
  // Wer einen Wert ändert und wieder zurücksetzt, soll nicht gefragt werden.
  useUngespeichert(JSON.stringify(form) !== JSON.stringify(kunde));

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

  async function loeschen() {
    const text =
      kunde.kundenpreise_anzahl === 0
        ? `Kunde „${kunde.name}" löschen?`
        : `Kunde „${kunde.name}" hat ${kunde.kundenpreise_anzahl} Kundenpreis(e). Diese werden beim Löschen ebenfalls entfernt. Trotzdem löschen?`;
    if (!(await bestaetigen(text))) return;
    setFehler(null);
    try {
      await api.kunden.delete(kunde.id, kunde.kundenpreise_anzahl > 0);
      onGeloescht?.();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const { feldFehler, bannerFehler } = formularFehler(fehler, ["name", "ust_idnr", "email"]);

  return (
    <section>
      <Fehler fehler={bannerFehler} />
      {hinweis}
      {dialog}
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="feld">
          <label>
            Typ
            <select
              value={form.typ}
              onChange={(e) => setForm({ ...form, typ: e.currentTarget.value as "firma" | "privat" })}
            >
              <option value="firma">Firma</option>
              <option value="privat">Privat</option>
            </select>
          </label>
        </div>
        <div className="feld">
          <label>
            Name
            <PflichtMarker art="pflicht" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          </label>
          {feldFehler("name") && (
            <div role="alert" className="feld-fehler">
              {feldFehler("name")}
            </div>
          )}
        </div>
        <div className="feld">
          <label>
            Zahlungsziel (Tage)
            <input
              type="number"
              value={form.zahlungsziel_tage}
              onChange={(e) => setForm({ ...form, zahlungsziel_tage: Number(e.currentTarget.value) })}
            />
          </label>
        </div>
        <div className="feld">
          <label>
            Notizen
            <textarea
              value={form.notizen}
              onChange={(e) => setForm({ ...form, notizen: e.currentTarget.value })}
            />
          </label>
        </div>
        <div className="feld">
          <label>
            USt-IdNr.
            <input
              value={form.ust_idnr}
              onChange={(e) => setForm({ ...form, ust_idnr: e.currentTarget.value })}
            />
          </label>
          {feldFehler("ust_idnr") && (
            <div role="alert" className="feld-fehler">
              {feldFehler("ust_idnr")}
            </div>
          )}
        </div>
        <div className="feld">
          <label>
            E-Mail
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} />
          </label>
          {feldFehler("email") && (
            <div role="alert" className="feld-fehler">
              {feldFehler("email")}
            </div>
          )}
        </div>
        <div className="feld">
          <label>
            Leitweg-ID
            <PflichtMarker art="xrechnung" />
            <input
              value={form.leitweg_id}
              onChange={(e) => setForm({ ...form, leitweg_id: e.currentTarget.value })}
            />
          </label>
        </div>
        <div className="feld">
          <label>
            Käuferreferenz
            <PflichtMarker art="xrechnung" />
            <input
              value={form.kaeuferreferenz}
              onChange={(e) => setForm({ ...form, kaeuferreferenz: e.currentTarget.value })}
            />
          </label>
        </div>
        <PflichtLegende zeigtXrechnung />
        <div className="aktionen aktionen-formular">
          <button type="submit" className="btn btn-primaer">
            Speichern
          </button>
        </div>
      </form>
      <button
        type="button"
        className="btn btn-gefahr"
        disabled={kunde.hat_offene_entwuerfe}
        onClick={loeschen}
      >
        Löschen
      </button>
    </section>
  );
}

interface AdressenReiterProps {
  kundeId: string;
  adressen: Adresse[];
  onGeaendert: () => void;
}

const ADRESSE_NEU = (kundeId: string): Omit<Adresse, "id"> => ({
  kunde_id: kundeId,
  typ: "rechnung",
  strasse: "",
  plz: "",
  ort: "",
  land: "DE",
  ist_standard: false,
});

function AdressenReiter({ kundeId, adressen, onGeaendert }: AdressenReiterProps) {
  const [form, setForm] = useState<Omit<Adresse, "id"> & { id?: string }>(ADRESSE_NEU(kundeId));
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { feldFehler, bannerFehler } = formularFehler(fehler, ["strasse", "plz", "ort", "land"]);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  async function speichern() {
    setFehler(null);
    const warNeu = !form.id;
    try {
      await api.kunden.adresseSave({ id: form.id ?? "", ...form } as Adresse);
      setForm(ADRESSE_NEU(kundeId));
      zeigen(warNeu ? "Adresse angelegt" : "Adresse gespeichert");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string, typ: string, strasse: string, plz: string, ort: string) {
    if (!(await bestaetigen(`Adresse „${typ}, ${strasse}, ${plz} ${ort}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.adresseDelete(id);
      zeigen("Adresse gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      <Fehler fehler={bannerFehler} />
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Typ</th>
            <th>Straße</th>
            <th>PLZ</th>
            <th>Ort</th>
            <th>Land</th>
            <th>Standard</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {adressen.map((a) => (
            <tr key={a.id}>
              <td>{ADRESSE_TYP_LABEL[a.typ] ?? a.typ}</td>
              <td>{a.strasse}</td>
              <td>{a.plz}</td>
              <td>{a.ort}</td>
              <td>{a.land}</td>
              <td>{a.ist_standard ? "Ja" : "Nein"}</td>
              <td>
                <button type="button" className="btn" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="btn btn-gefahr"
                  onClick={() => loeschen(a.id, a.typ, a.strasse, a.plz, a.ort)}
                >
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Typ
          <select
            value={form.typ}
            onChange={(e) => setForm({ ...form, typ: e.currentTarget.value as "rechnung" | "lieferung" })}
          >
            <option value="rechnung">Rechnung</option>
            <option value="lieferung">Lieferung</option>
          </select>
        </label>
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
        <label className="feld-checkbox">
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
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
  kundeId: string;
  ansprechpartner: Ansprechpartner[];
  onGeaendert: () => void;
}

const ANSPRECHPARTNER_NEU = (kundeId: string): Omit<Ansprechpartner, "id"> => ({
  kunde_id: kundeId,
  name: "",
  rolle: "",
  email: "",
  telefon: "",
  ist_standard: false,
});

function AnsprechpartnerReiter({ kundeId, ansprechpartner, onGeaendert }: AnsprechpartnerReiterProps) {
  const [form, setForm] = useState<Omit<Ansprechpartner, "id"> & { id?: string }>(
    ANSPRECHPARTNER_NEU(kundeId),
  );
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const { zeigen, hinweis } = useErfolgsHinweis();
  const { bestaetigen, dialog } = useBestaetigung();

  async function speichern() {
    setFehler(null);
    const warNeu = !form.id;
    const gespeicherterName = form.name;
    try {
      await api.kunden.ansprechpartnerSave({
        id: form.id ?? "",
        ...form,
      } as Ansprechpartner);
      setForm(ANSPRECHPARTNER_NEU(kundeId));
      zeigen(
        warNeu
          ? `Ansprechpartner „${gespeicherterName}" angelegt`
          : `Ansprechpartner „${gespeicherterName}" gespeichert`,
      );
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string, name: string) {
    if (!(await bestaetigen(`Ansprechpartner „${name}" löschen?`))) return;
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerDelete(id);
      zeigen("Ansprechpartner gelöscht");
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      {hinweis}
      {dialog}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Rolle</th>
            <th>E-Mail</th>
            <th>Telefon</th>
            <th>Standard</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ansprechpartner.map((a) => (
            <tr key={a.id}>
              <td>{a.name}</td>
              <td>{a.rolle}</td>
              <td>{a.email}</td>
              <td>{a.telefon}</td>
              <td>{a.ist_standard ? "Ja" : "Nein"}</td>
              <td>
                <button type="button" className="btn" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button type="button" className="btn btn-gefahr" onClick={() => loeschen(a.id, a.name)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="karte"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label className="feld">
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        </label>
        <label className="feld">
          Rolle
          <input value={form.rolle} onChange={(e) => setForm({ ...form, rolle: e.currentTarget.value })} />
        </label>
        <label className="feld">
          E-Mail
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} />
        </label>
        <label className="feld">
          Telefon
          <input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.currentTarget.value })} />
        </label>
        <label className="feld-checkbox">
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
          Standard-Ansprechpartner
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
