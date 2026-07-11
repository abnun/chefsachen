import { useEffect, useState } from "react";
import {
  api,
  istValidierungsfehler,
  type Adresse,
  type Ansprechpartner,
  type AppFehler,
  type Beleg,
  type Kunde,
  type KundeDetail as KundeDetailTyp,
} from "../api";
import { Fehler } from "../components/Fehler";
import { formatCent } from "../geld";

interface KundeDetailProps {
  id: string;
}

type Reiter = "stammdaten" | "adressen" | "ansprechpartner" | "sonderpreise" | "belege";

const REITER: { id: Reiter; label: string; aktiv: boolean }[] = [
  { id: "stammdaten", label: "Stammdaten", aktiv: true },
  { id: "adressen", label: "Adressen", aktiv: true },
  { id: "ansprechpartner", label: "Ansprechpartner", aktiv: true },
  { id: "sonderpreise", label: "Sonderpreise", aktiv: false },
  { id: "belege", label: "Belege", aktiv: true },
];

/**
 * Kundendetailseite mit Reiter-Navigation. "Sonderpreise" wird über die
 * Artikel-Seite gepflegt (Kundenpreise je Artikel, s. Plan 1) und bleibt
 * hier bewusst ein deaktivierter Platzhalter-Reiter.
 */
export function KundeDetail({ id }: KundeDetailProps) {
  const [detail, setDetail] = useState<KundeDetailTyp | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [reiter, setReiter] = useState<Reiter>("stammdaten");

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
        {fehler && <Fehler fehler={fehler} />}
      </div>
    );
  }

  return (
    <div>
      <h1>
        {detail.kunde.name} <small>{detail.kunde.kundennummer}</small>
      </h1>
      {fehler && <Fehler fehler={fehler} />}

      <nav>
        {REITER.map((r) => (
          <button
            key={r.id}
            type="button"
            disabled={!r.aktiv}
            aria-current={reiter === r.id ? "page" : undefined}
            onClick={() => r.aktiv && setReiter(r.id)}
          >
            {r.label}
          </button>
        ))}
      </nav>

      {reiter === "stammdaten" && (
        <StammdatenReiter kunde={detail.kunde} onGespeichert={laden} />
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
      {reiter === "sonderpreise" && <PlatzhalterReiter />}
      {reiter === "belege" && <BelegeReiter kundeId={id} />}
    </div>
  );
}

function PlatzhalterReiter() {
  return <p>Folgt in einem späteren Ausbauschritt</p>;
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
      <table>
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
              <td>{b.nummer ?? "Entwurf"}</td>
              <td>{b.datum}</td>
              <td>{b.status}</td>
              <td>{formatCent(b.summe_cent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface StammdatenReiterProps {
  kunde: Kunde;
  onGespeichert: () => void;
}

function StammdatenReiter({ kunde, onGespeichert }: StammdatenReiterProps) {
  const [form, setForm] = useState<Kunde>(kunde);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    setForm(kunde);
  }, [kunde]);

  async function speichern() {
    setFehler(null);
    setGespeichert(false);
    try {
      await api.kunden.update(form);
      setGespeichert(true);
      onGespeichert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  const feldFehler = (feld: string) =>
    fehler && istValidierungsfehler(fehler) && fehler.feld === feld ? fehler.meldung : null;

  return (
    <section>
      {fehler && !istValidierungsfehler(fehler) && <Fehler fehler={fehler} />}
      {gespeichert && <p>Gespeichert.</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div>
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
        <div>
          <label>
            Name
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
          </label>
          {feldFehler("name") && <div role="alert">{feldFehler("name")}</div>}
        </div>
        <div>
          <label>
            Zahlungsziel (Tage)
            <input
              type="number"
              value={form.zahlungsziel_tage}
              onChange={(e) => setForm({ ...form, zahlungsziel_tage: Number(e.currentTarget.value) })}
            />
          </label>
        </div>
        <div>
          <label>
            Notizen
            <textarea
              value={form.notizen}
              onChange={(e) => setForm({ ...form, notizen: e.currentTarget.value })}
            />
          </label>
        </div>
        <div>
          <label>
            USt-IdNr.
            <input
              value={form.ust_idnr}
              onChange={(e) => setForm({ ...form, ust_idnr: e.currentTarget.value })}
            />
          </label>
          {feldFehler("ust_idnr") && <div role="alert">{feldFehler("ust_idnr")}</div>}
        </div>
        <div>
          <label>
            E-Mail
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} />
          </label>
          {feldFehler("email") && <div role="alert">{feldFehler("email")}</div>}
        </div>
        <div>
          <label>
            Leitweg-ID
            <input
              value={form.leitweg_id}
              onChange={(e) => setForm({ ...form, leitweg_id: e.currentTarget.value })}
            />
          </label>
        </div>
        <div>
          <label>
            Käuferreferenz
            <input
              value={form.kaeuferreferenz}
              onChange={(e) => setForm({ ...form, kaeuferreferenz: e.currentTarget.value })}
            />
          </label>
        </div>
        <button type="submit">Speichern</button>
      </form>
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

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.adresseSave({ id: form.id ?? crypto.randomUUID(), ...form } as Adresse);
      setForm(ADRESSE_NEU(kundeId));
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.adresseDelete(id);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table>
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
              <td>{a.typ}</td>
              <td>{a.strasse}</td>
              <td>{a.plz}</td>
              <td>{a.ort}</td>
              <td>{a.land}</td>
              <td>{a.ist_standard ? "Ja" : "Nein"}</td>
              <td>
                <button type="button" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button type="button" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label>
          Typ
          <select
            value={form.typ}
            onChange={(e) => setForm({ ...form, typ: e.currentTarget.value as "rechnung" | "lieferung" })}
          >
            <option value="rechnung">Rechnung</option>
            <option value="lieferung">Lieferung</option>
          </select>
        </label>
        <label>
          Straße
          <input value={form.strasse} onChange={(e) => setForm({ ...form, strasse: e.currentTarget.value })} />
        </label>
        <label>
          PLZ
          <input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.currentTarget.value })} />
        </label>
        <label>
          Ort
          <input value={form.ort} onChange={(e) => setForm({ ...form, ort: e.currentTarget.value })} />
        </label>
        <label>
          Land
          <input value={form.land} onChange={(e) => setForm({ ...form, land: e.currentTarget.value })} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
          Standardadresse
        </label>
        <button type="submit">{form.id ? "Aktualisieren" : "Hinzufügen"}</button>
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

  async function speichern() {
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerSave({
        id: form.id ?? crypto.randomUUID(),
        ...form,
      } as Ansprechpartner);
      setForm(ANSPRECHPARTNER_NEU(kundeId));
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  async function loeschen(id: string) {
    setFehler(null);
    try {
      await api.kunden.ansprechpartnerDelete(id);
      onGeaendert();
    } catch (e) {
      setFehler(e as AppFehler);
    }
  }

  return (
    <section>
      {fehler && <Fehler fehler={fehler} />}
      <table>
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
                <button type="button" onClick={() => setForm(a)}>
                  Bearbeiten
                </button>
                <button type="button" onClick={() => loeschen(a.id)}>
                  Löschen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} />
        </label>
        <label>
          Rolle
          <input value={form.rolle} onChange={(e) => setForm({ ...form, rolle: e.currentTarget.value })} />
        </label>
        <label>
          E-Mail
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.currentTarget.value })} />
        </label>
        <label>
          Telefon
          <input value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.currentTarget.value })} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.ist_standard}
            onChange={(e) => setForm({ ...form, ist_standard: e.currentTarget.checked })}
          />
          Standard-Ansprechpartner
        </label>
        <button type="submit">{form.id ? "Aktualisieren" : "Hinzufügen"}</button>
      </form>
    </section>
  );
}
