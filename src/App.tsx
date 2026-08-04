import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, type AppFehler, type Firma } from "./api";
import { Layout, type Seite } from "./components/Layout";
import { Fehler } from "./components/Fehler";
import { VersionsHinweis } from "./components/VersionsHinweis";
import { useVerlassenPruefen } from "./hooks/useUngespeichert";
import { Laden } from "./components/Laden";
import { Dashboard } from "./pages/Dashboard";
import { Einrichtung } from "./pages/Einrichtung";
import { Einstellungen } from "./pages/Einstellungen";
import { Kunden } from "./pages/Kunden";
import { KundeDetail, type Reiter } from "./pages/KundeDetail";
import { Artikel } from "./pages/Artikel";
import { Angebote } from "./pages/Angebote";
import { Rechnungen } from "./pages/Rechnungen";
import { BelegEditor } from "./pages/BelegEditor";
import { Eingangsrechnungen } from "./pages/Eingangsrechnungen";
import { EingangsrechnungDetail } from "./pages/EingangsrechnungDetail";
import { Auswertung } from "./pages/Auswertung";
import "./styles/tokens.css";
import "./styles/basis.css";
import "./styles/komponenten.css";

function App() {
  const [firma, setFirma] = useState<Firma | null>(null);
  const [fehler, setFehler] = useState<AppFehler | null>(null);
  const [seite, setSeite] = useState<Seite>("uebersicht");
  const verlassenPruefen = useVerlassenPruefen();
  const [ausgewaehlterKunde, setAusgewaehlterKunde] = useState<string | null>(null);
  const [kundeDetailStartReiter, setKundeDetailStartReiter] = useState<Reiter | null>(null);
  const [ausgewaehltesAngebot, setAusgewaehltesAngebot] = useState<string | null>(null);
  const [ausgewaehlteRechnung, setAusgewaehlteRechnung] = useState<string | null>(null);
  const [formularBeimStartZiel, setFormularBeimStartZiel] = useState<"kunden" | "artikel" | null>(null);
  const [ausgewaehlteEingangsrechnung, setAusgewaehlteEingangsrechnung] = useState<string | null>(null);

  useEffect(() => {
    api.firma.get().then(setFirma).catch((e) => setFehler(e as AppFehler));
  }, []);

  useEffect(() => {
    // Solange die Ersteinrichtung läuft, zeigt die Anwendung ausschließlich den
    // Assistenten — der Menüeintrag führte dort ins Leere und tat wortlos
    // nichts. Abgeblendet sagt er wenigstens, dass es jetzt nicht geht.
    api.menue.einstellungenFreigeben(firma?.eingerichtet === true).catch(() => {});
  }, [firma?.eingerichtet]);

  useEffect(() => {
    // „Einstellungen …" aus dem Programmmenü (⌘,). Die Seitenverwaltung liegt
    // hier; das Menü schickt nur das Ereignis, sonst müssten sich zwei Stellen
    // über die aktuelle Seite einig sein.
    let abmelden: (() => void) | undefined;
    listen("menue:einstellungen", () => navigiere("einstellungen"))
      .then((f) => {
        abmelden = f;
      })
      // In einer Testumgebung ohne Tauri gibt es kein Ereignissystem.
      .catch(() => {});
    return () => abmelden?.();
  });

  if (fehler) {
    return <Fehler fehler={fehler} />;
  }

  if (!firma) {
    // Bis die Firmendaten da sind, ist noch keine Entscheidung möglich, ob die
    // Einrichtung oder die Anwendung gehört. Ein leeres Fenster wäre für den
    // Nutzer nicht von einem Absturz zu unterscheiden.
    return <Laden />;
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

  // Vor jedem Seitenwechsel nachfragen, wenn irgendwo ungespeicherte Eingaben
  // stehen. Ohne das verschwindet ein halb ausgefülltes Formular wortlos.
  async function navigiere(neueSeite: Seite) {
    if (!(await verlassenPruefen())) return;
    setAusgewaehlterKunde(null);
    setKundeDetailStartReiter(null);
    setAusgewaehltesAngebot(null);
    setAusgewaehlteRechnung(null);
    setAusgewaehlteEingangsrechnung(null);
    setFormularBeimStartZiel(null);
    setSeite(neueSeite);
  }

  async function navigiereMitFormular(ziel: "kunden" | "artikel") {
    await navigiere(ziel);
    setFormularBeimStartZiel(ziel);
  }

  return (
    <Layout aktiveSeite={seite} onNavigiere={navigiere}>
      <VersionsHinweis />
      {seite === "uebersicht" && (
        <Dashboard
          onRechnungOeffnen={(id) => {
            setAusgewaehlteRechnung(id);
            setSeite("rechnungen");
          }}
          onAngebotOeffnen={(id) => {
            setAusgewaehltesAngebot(id);
            setSeite("angebote");
          }}
          onErsterSchritt={(schritt) => {
            if (schritt === "kunde") return navigiereMitFormular("kunden");
            if (schritt === "artikel") return navigiereMitFormular("artikel");
            return navigiere("angebote");
          }}
        />
      )}

      {seite === "kunden" &&
        (ausgewaehlterKunde ? (
          <KundeDetail
            id={ausgewaehlterKunde}
            startReiter={kundeDetailStartReiter}
            onReiterUebernommen={() => setKundeDetailStartReiter(null)}
            onGeloescht={() => setAusgewaehlterKunde(null)}
            onZurueck={() => setAusgewaehlterKunde(null)}
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
            onGeloescht={() => setAusgewaehltesAngebot(null)}
            onZurueck={() => setAusgewaehltesAngebot(null)}
            id={ausgewaehltesAngebot}
            onRechnungErstellt={(rechnungId) => {
              setSeite("rechnungen");
              setAusgewaehltesAngebot(null);
              setAusgewaehlteRechnung(rechnungId);
            }}
            onDupliziert={setAusgewaehltesAngebot}
          />
        ) : (
          <Angebote onOeffnen={setAusgewaehltesAngebot} />
        ))}
      {seite === "rechnungen" &&
        (ausgewaehlteRechnung ? (
          <BelegEditor
            id={ausgewaehlteRechnung}
            onGeloescht={() => setAusgewaehlteRechnung(null)}
            onZurueck={() => setAusgewaehlteRechnung(null)}
            onDupliziert={setAusgewaehlteRechnung}
          />
        ) : (
          <Rechnungen onOeffnen={setAusgewaehlteRechnung} />
        ))}
      {seite === "eingangsrechnungen" &&
        (ausgewaehlteEingangsrechnung ? (
          <EingangsrechnungDetail
            id={ausgewaehlteEingangsrechnung}
            onZurueck={() => setAusgewaehlteEingangsrechnung(null)}
          />
        ) : (
          <Eingangsrechnungen onOeffnen={setAusgewaehlteEingangsrechnung} />
        ))}
      {seite === "auswertung" && <Auswertung />}
      {seite === "einstellungen" && <Einstellungen />}
    </Layout>
  );
}

export default App;
