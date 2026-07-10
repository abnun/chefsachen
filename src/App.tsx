import { useEffect, useState } from "react";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import "./App.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("kunden");
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);

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
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
  );
}

export default App;
