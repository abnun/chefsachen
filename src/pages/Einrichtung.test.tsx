import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Ohne dies zählen die Aufrufe der Attrappen über Testgrenzen hinweg weiter.
// Ein Test, der Aufrufe zählt, hängt dann an der Reihenfolge und an allem, was
// in den Tests davor geschah — genau so entstand ein Ausfall, der nur in der CI
// auftrat. `clearAllMocks` löscht die Aufrufe, nicht die hinterlegten Antworten.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

vi.mock("../api", () => ({
  api: {
    firma: {
      get: vi.fn().mockResolvedValue({
        id: "f1",
        name: "",
        strasse: "",
        plz: "",
        ort: "",
        land: "DE",
        steuernummer: "",
        ust_idnr: "",
        iban: "",
        bic: "",
        email: "", telefon: "", kontakt_name: "", gruendungsjahr: null,
        kleinunternehmer: true,
        eingerichtet: false,
      }),
      pruefen: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue({
        id: "f1",
        name: "Test GmbH",
        strasse: "",
        plz: "",
        ort: "",
        land: "DE",
        steuernummer: "12/345/67890",
        ust_idnr: "",
        iban: "",
        bic: "",
        email: "", telefon: "", kontakt_name: "", gruendungsjahr: null,
        kleinunternehmer: true,
        eingerichtet: true,
      }),
      logoSet: vi.fn().mockResolvedValue(undefined),
    },
  },
  istValidierungsfehler: vi.fn(
    (e: unknown) => typeof e === "object" && e !== null && (e as { typ?: string }).typ === "validation",
  ),
}));

import { api } from "../api";
import { Einrichtung } from "./Einrichtung";

describe("Einrichtung", () => {
  it("startet mit Schritt Firmendaten", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
  });

  it("zeigt die Fortschrittsanzeige im ersten Schritt", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());
  });

  it("zeigt nach Nummernkreise einen Abschluss-Schritt mit zwei Zielen", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    // Schritt 1 prüft die Angaben im Backend und wechselt erst danach.
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.getByText("Schritt 2 von 5")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy(),
    );
    expect(screen.getByRole("button", { name: "Ersten Artikel anlegen" })).toBeTruthy();
  });

  it("ruft onFertig mit zielSeite \"kunden\" auf, wenn 'Ersten Kunden anlegen' geklickt wird", async () => {
    const onFertig = vi.fn();
    render(<Einrichtung onFertig={onFertig} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    // Schritt 1 prüft die Angaben im Backend und wechselt erst danach.
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.getByText("Schritt 2 von 5")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ersten Kunden anlegen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ersten Kunden anlegen" }));
    await waitFor(() => expect(onFertig).toHaveBeenCalledWith("kunden"));
  });

  it("springt bei einem Validierungsfehler beim Abschließen zurück zu Schritt 1 und zeigt den Feldfehler", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockRejectedValueOnce({
      typ: "validation",
      feld: "steuernummer",
      meldung: "Steuernummer oder USt-IdNr. ist erforderlich",
    });
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Firmendaten")).toBeTruthy());
    // Schritt 1 prüft die Angaben im Backend und wechselt erst danach.
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.getByText("Schritt 2 von 5")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    fireEvent.click(screen.getByRole("button", { name: "Einrichtung abschließen" }));
    await waitFor(() =>
      expect(screen.getByText("Steuernummer oder USt-IdNr. ist erforderlich")).toBeTruthy(),
    );
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
  });

  it("prüft die Angaben schon nach dem ersten Schritt", async () => {
    // Vorher fiel ein Tippfehler in der IBAN erst nach fünf Schritten auf, und
    // der Nutzer landete wieder am Anfang.
    vi.mocked(api.firma.pruefen).mockRejectedValueOnce({
      typ: "validation",
      feld: "iban",
      meldung: "Die Prüfsumme der IBAN stimmt nicht",
    });
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));

    await waitFor(() => expect(screen.getByText(/Prüfsumme der IBAN/)).toBeTruthy());
    // Und wir bleiben, wo wir sind.
    expect(screen.getByText("Schritt 1 von 5")).toBeTruthy();
  });

  it("räumt die Meldung weg, sobald der Nutzer korrigiert", async () => {
    // „Die Prüfsumme der IBAN stimmt nicht" blieb stehen, auch nachdem sie
    // längst berichtigt war — und ließ offen, ob die Korrektur ankam.
    vi.mocked(api.firma.pruefen).mockRejectedValueOnce({
      typ: "validation",
      feld: "iban",
      meldung: "Die Prüfsumme der IBAN stimmt nicht",
    });
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.getByText(/Prüfsumme der IBAN/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("IBAN"), {
      target: { value: "DE02120300000000202051" },
    });
    await waitFor(() => expect(screen.queryByText(/Prüfsumme der IBAN/)).toBeNull());
  });

  it("geht bei fehlerfreien Angaben weiter", async () => {
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    await waitFor(() => expect(screen.getByText("Schritt 2 von 5")).toBeTruthy());
  });

  it("lässt am Gründungsjahr keine negativen Zahlen zu", async () => {
    // Das Zahlenrad lief bis −1 hinunter.
    render(<Einrichtung onFertig={() => {}} />);
    await waitFor(() => expect(screen.getByText("Schritt 1 von 5")).toBeTruthy());

    const feld = screen.getByLabelText(/Gründungsjahr/) as HTMLInputElement;
    expect(feld.min).toBe("1900");
    expect(Number(feld.max)).toBe(new Date().getFullYear());
  });
});
