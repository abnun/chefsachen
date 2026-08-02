import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { fehlerAufzeichnungEinrichten } from "./protokoll";
import { UngespeichertProvider } from "./hooks/useUngespeichert";

// Vor dem Rendern: Auch ein Fehler beim ersten Aufbau soll aufgezeichnet werden.
fehlerAufzeichnungEinrichten();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <UngespeichertProvider>
      <App />
    </UngespeichertProvider>
  </React.StrictMode>,
);
