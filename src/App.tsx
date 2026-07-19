import { useEffect, useState } from "react";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail, type Reiter } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import { Angebote } from "./pages/Angebote";
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import "./styles/tokens.css";
import "./styles/basis.css";
import "./styles/komponenten.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [kundeDetailStartReiter, setKundeDetailStartReiter] = useState<Reiter | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
  const [formularBeimStartZiel, setFormularBeimStartZiel] = useState<"kunden" | "artikel" | null>(null);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  if (fehler) {
    return <Fehler fehler={fehler} />;
  }

  if (!firma) {
    return null;
  }

  if (!firma.eingerichtet) {
    return (
      <Einrichtung
        onFertig={(zielSeite) => {
          api.firma.get().then(setFirma);
          if (zielSeite) {
            setSeite(zielSeite);
            setFormularBeimStartZiel(zielSeite);
          }
        }}
      />
    );
  }

  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setFormularBeimStartZiel(null);
    setSeite(neueSeite);
  }

  function navigiereMitFormular(ziel: "kunden" | "artikel") {
    navigiere(ziel);
    setFormularBeimStartZiel(ziel);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
            onGeloescht={() => setAusgewaehlterKunde(null)}
          />
        ) : (
          <Kunden
            onOeffnen={(id, startReiter) => {
              setAusgewaehlterKunde(id);
              setKundeDetailStartReiter(startReiter ?? null);
            }}
            zeigeFormularBeimStart={formularBeimStartZiel === "kunden"}
            onFormularUebernommen={() => setFormularBeimStartZiel(null)}
            onZuArtikelWechseln={() => navigiereMitFormular("artikel")}
          />
        ))}
      {seite === "artikel" && (
        <Artikel
          zeigeFormularBeimStart={formularBeimStartZiel === "artikel"}
          onFormularUebernommen={() => setFormularBeimStartZiel(null)}
          onZuKundenWechseln={() => navigiereMitFormular("kunden")}
        />
      )}
      {seite === "angebote" &&
        (ausgewaehltesAngebot ? (
          <BelegEditor
            id={ausgewaehltesAngebot}
            onRechnungErstellt={(rechnungId) => {
              setSeite("rechnungen");
              setAusgewaehltesAngebot(null);
              setAusgewaehlteRechnung(rechnungId);
            }}
          />
        ) : (
          <Angebote onOeffnen={setAusgewaehltesAngebot} />
        ))}
      {seite === "rechnungen" &&
        (ausgewaehlteRechnung ? (
          <BelegEditor id={ausgewaehlteRechnung} />
        ) : (
          <Rechnungen onOeffnen={setAusgewaehlteRechnung} />
        ))}
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
  );
}

export default App;
