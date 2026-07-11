import { useEffect, useState } from "react";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import { Angebote } from "./pages/Angebote";
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import "./App.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);

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
    return <Einrichtung onFertig={() => api.firma.get().then(setFirma)} />;
  }

  function navigiere(neueSeite: Seite) {
    setAusgewaehlterKunde(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setSeite(neueSeite);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail id={ausgewaehlterKunde} />
        ) : (
          <Kunden onOeffnen={setAusgewaehlterKunde} />
        ))}
      {seite === "artikel" && <Artikel />}
      {seite === "angebote" &&
        (ausgewaehltesAngebot ? (
          <BelegEditor id={ausgewaehltesAngebot} />
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
