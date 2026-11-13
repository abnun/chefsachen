import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { fehlerAufzeichnungEinrichten } from "./protokoll";
import { UngespeichertProvider } from "./hooks/useUngespeichert";
import { AktualisierungProvider } from "./hooks/useAktualisierung";
import { VertriebswegProvider } from "./hooks/useVertriebsweg";
import { XRechnungHilfeProvider } from "./hooks/useXRechnungHilfe";
import { AktualisierungsBenachrichtigung } from "./components/AktualisierungsBenachrichtigung";

// Vor dem Rendern: Auch ein Fehler beim ersten Aufbau soll aufgezeichnet werden.
fehlerAufzeichnungEinrichten();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Außerhalb von App, nicht innerhalb: App hat vor der Ersteinrichtung
        und während des Ladens eigene frühe Rückgaben — die Suche soll ab dem
        tatsächlichen Programmstart laufen, nicht erst danach. */}
    {/* Ganz außen: Der Aktualisierungsanbieter fragt ihn ab, bevor er sucht. */}
    <VertriebswegProvider>
      <AktualisierungProvider>
        <AktualisierungsBenachrichtigung />
        <UngespeichertProvider>
          <XRechnungHilfeProvider>
            <App />
          </XRechnungHilfeProvider>
        </UngespeichertProvider>
      </AktualisierungProvider>
    </VertriebswegProvider>
  </React.StrictMode>,
);
