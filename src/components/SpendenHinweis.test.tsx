import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  api: { einstellungen: { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) } },
}));

import { api } from "../api";
import { PAYPAL_LINK, SpendenHinweis } from "./SpendenHinweis";

beforeEach(() => {
  vi.mocked(api.einstellungen.get).mockReset();
  vi.mocked(api.einstellungen.set).mockClear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SpendenHinweis", () => {
  it("zeigt den Hinweis, wenn der gespeicherte Termin erreicht ist", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce(
      new Date(Date.now() - 1000).toISOString(),
    );
    render(<SpendenHinweis />);

    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(screen.getByText(/Gefällt dir Chefsachen/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /PayPal unterstützen/ })).toHaveAttribute(
      "href",
      PAYPAL_LINK,
    );
  });

  it("schweigt, wenn der Termin noch in der Zukunft liegt", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce(
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    );
    const { container } = render(<SpendenHinweis />);

    await waitFor(() => expect(api.einstellungen.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("vermerkt beim allerersten Start nur einen Termin, ohne zu stören", async () => {
    // Eine frisch eingerichtete App soll nicht sofort mit einer Spendenbitte
    // begrüßen — genau wie VersionsHinweis beim allerersten Start schweigt.
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce(null);
    const { container } = render(<SpendenHinweis />);

    await waitFor(() => expect(api.einstellungen.set).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    const [, termin] = vi.mocked(api.einstellungen.set).mock.calls[0];
    const wochen = (new Date(termin).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7);
    expect(wochen).toBeGreaterThanOrEqual(3.9);
    expect(wochen).toBeLessThanOrEqual(6.1);
  });

  it("würfelt beim Schließen sofort einen neuen Termin in vier bis sechs Wochen", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce(
      new Date(Date.now() - 1000).toISOString(),
    );
    render(<SpendenHinweis />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Vielleicht später" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(api.einstellungen.set).toHaveBeenCalledWith(
      "spende.naechste_erinnerung",
      expect.any(String),
    );
    const [, termin] = vi.mocked(api.einstellungen.set).mock.calls[0];
    const wochen = (new Date(termin).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7);
    expect(wochen).toBeGreaterThanOrEqual(3.9);
    expect(wochen).toBeLessThanOrEqual(6.1);
  });

  it("würfelt auch beim Klick auf den Spendenlink einen neuen Termin", async () => {
    vi.mocked(api.einstellungen.get).mockResolvedValueOnce(
      new Date(Date.now() - 1000).toISOString(),
    );
    render(<SpendenHinweis />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    fireEvent.click(screen.getByRole("link", { name: /PayPal unterstützen/ }));
    await waitFor(() =>
      expect(api.einstellungen.set).toHaveBeenCalledWith(
        "spende.naechste_erinnerung",
        expect.any(String),
      ),
    );
  });

  it("bleibt still, wenn die Einstellungen nicht lesbar sind", async () => {
    vi.mocked(api.einstellungen.get).mockRejectedValue(new Error("keine Datenbank"));
    const { container } = render(<SpendenHinweis />);

    await waitFor(() => expect(api.einstellungen.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
