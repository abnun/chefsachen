import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { fehlerAufzeichnungEinrichten } from "./protokoll";
import { UngespeichertProvider } from "./hooks/useUngespeichert";
import { AktualisierungProvider } from "./hooks/useAktualisierung";
import { XRechnungHilfeProvider } from "./hooks/useXRechnungHilfe";
import { AktualisierungsBenachrichtigung } from "./components/AktualisierungsBenachrichtigung";

// Vor dem Rendern: Auch ein Fehler beim ersten Aufbau soll aufgezeichnet werden.
fehlerAufzeichnungEinrichten();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Außerhalb von App, nicht innerhalb: App hat vor der Ersteinrichtung
        und während des Ladens eigene frühe Rückgaben — die Suche soll ab dem
        tatsächlichen Programmstart laufen, nicht erst danach. */}
    <AktualisierungProvider>
      <AktualisierungsBenachrichtigung />
      <UngespeichertProvider>
        <XRechnungHilfeProvider>
          <App />
        </XRechnungHilfeProvider>
      </UngespeichertProvider>
    </AktualisierungProvider>
  </React.StrictMode>,
);
