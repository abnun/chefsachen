import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: {
    einstellungen: { list: vi.fn(), set: vi.fn().mockResolvedValue(undefined) },
    vorlage: { vorschau: vi.fn() },
  },
}));
import { api } from "../api";
import { Belegvorlage } from "./Belegvorlage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.mocked(api.einstellungen.list).mockResolvedValue([]);
  vi.mocked(api.vorlage.vorschau).mockResolvedValue("<svg>eins</svg>");
});

describe("Belegvorlage", () => {
  it("zeigt eine Vorschau, ohne dass etwas gespeichert werden muss", async () => {
    // Sonst müsste man erst speichern, um zu sehen, was man einstellt — und
    // jeder Versuch änderte die laufende Geschäftspost.
    render(<Belegvorlage />);
    await waitFor(() =>
      expect(screen.getByAltText("Vorschau der Belegvorlage")).toBeTruthy(),
    );
    expect(api.einstellungen.set).not.toHaveBeenCalled();
  });

  it("zeichnet die Vorschau mit den Werten aus dem Formular neu", async () => {
    render(<Belegvorlage />);
    await waitFor(() => expect(api.vorlage.vorschau).toHaveBeenCalled());
    vi.mocked(api.vorlage.vorschau).mockClear();

    fireEvent.change(screen.getByLabelText("Logo"), { target: { value: "rechts" } });

    await waitFor(() =>
      expect(api.vorlage.vorschau).toHaveBeenCalledWith(
        expect.arrayContaining([["vorlage.logo_position", "rechts"]]),
      ),
    );
    // Nicht gespeichert — nur gezeichnet.
    expect(api.einstellungen.set).not.toHaveBeenCalled();
  });

  it("speichert erst auf Knopfdruck", async () => {
    render(<Belegvorlage />);
    await waitFor(() => expect(screen.getByLabelText("Logo")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Logo"), { target: { value: "keins" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(api.einstellungen.set).toHaveBeenCalledWith("vorlage.logo_position", "keins"),
    );
    await waitFor(() => expect(screen.getByText("Belegvorlage gespeichert")).toBeTruthy());
  });

  it("übernimmt gespeicherte Werte ins Formular", async () => {
    vi.mocked(api.einstellungen.list).mockResolvedValue([
      ["vorlage.logo_position", "rechts"],
      ["vorlage.rand_oben_mm", "30"],
      // Fremde Schlüssel gehören nicht hierher und dürfen nicht mitgespeichert
      // werden — sonst schriebe „Speichern" sie unbeabsichtigt zurück.
      ["text.rechnung.fuss", "Danke."],
    ]);
    render(<Belegvorlage />);

    await waitFor(() => expect(screen.getByLabelText("Logo")).toHaveValue("rechts"));
    expect(screen.getByLabelText(/Rand oben/)).toHaveValue(30);

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(api.einstellungen.set).toHaveBeenCalled());
    const geschrieben = vi.mocked(api.einstellungen.set).mock.calls.map(([k]) => k);
    expect(geschrieben).not.toContain("text.rechnung.fuss");
  });

  it("sagt, was sich absichtlich nicht einstellen lässt", async () => {
    // Ohne diese Zeile sucht man die fehlenden Schalter und hält ihr Fehlen für
    // ein Versehen.
    render(<Belegvorlage />);
    // Der Einleitungsabsatz, nicht der Hinweis an der Absenderzeile — beide
    // nennen die Norm.
    const einleitung = await screen.findByText(/Nicht einstellbar sind/);
    expect(einleitung).toHaveTextContent("DIN 5008");
    expect(einleitung).toHaveTextContent("§ 14 Abs. 4 Nr. 5 UStG");
  });

  it("startet mit vollen Gitterlinien abgewählt, wie die Rust-Vorgabe", async () => {
    // Sonst zeigte die Vorschau ein anderes Aussehen als der Beleg, den
    // Vorlage::default() für jeden Bestandsnutzer ohne gespeicherte
    // Einstellung erzeugt.
    render(<Belegvorlage />);
    await waitFor(() =>
      expect(screen.getByLabelText(/Volle Gitterlinien/)).toBeTruthy(),
    );
    expect(screen.getByLabelText(/Volle Gitterlinien/)).not.toBeChecked();
  });

  it("meldet einen Fehler der Vorschau, statt ein leeres Feld zu zeigen", async () => {
    vi.mocked(api.vorlage.vorschau).mockRejectedValue({
      typ: "unbekannt",
      meldung: "Vorlage kaputt",
    });
    render(<Belegvorlage />);
    await waitFor(() => expect(screen.getByText(/Vorlage kaputt/)).toBeTruthy());
  });
});
