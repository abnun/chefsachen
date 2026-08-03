import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Aenderungstext } from "./Aenderungstext";

afterEach(cleanup);

describe("Aenderungstext", () => {
  it("macht aus einer fetten Zeile eine Überschrift", () => {
    render(<Aenderungstext text="**Erste Schritte**" />);
    expect(screen.getByRole("heading", { name: "Erste Schritte" })).toBeTruthy();
  });

  it("macht aus Bindestrichen eine Aufzählung", () => {
    render(<Aenderungstext text={"- eins\n- zwei"} />);
    const punkte = screen.getAllByRole("listitem");
    expect(punkte.map((p) => p.textContent)).toEqual(["eins", "zwei"]);
  });

  it("fügt umbrochene Zeilen eines Punkts wieder zusammen", () => {
    // Der Umbruch stammt von der Zeilenbreite der Quelldatei, nicht vom Autor.
    // Ohne dieses Zusammenfügen zerfiele ein Satz in drei Aufzählungspunkte.
    const text = "- Bei schmalem Fenster schob eine breite Tabelle die\n  ganze Seite über den\n  rechten Rand hinaus.";
    render(<Aenderungstext text={text} />);
    const punkte = screen.getAllByRole("listitem");
    expect(punkte).toHaveLength(1);
    expect(punkte[0]).toHaveTextContent(
      "Bei schmalem Fenster schob eine breite Tabelle die ganze Seite über den rechten Rand hinaus.",
    );
  });

  it("trennt zwei Aufzählungen, die durch eine Leerzeile getrennt sind", () => {
    render(<Aenderungstext text={"- eins\n\n- zwei"} />);
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("hebt ausgezeichnete Stellen mitten im Satz hervor", () => {
    render(<Aenderungstext text="Der Knopf **Speichern** ist neu." />);
    expect(screen.getByText("Speichern").tagName).toBe("STRONG");
  });

  it("lässt ein unvollständiges Sternchenpaar in Ruhe", () => {
    // Sonst liefe der Satz ab der Hälfte fett weiter.
    render(<Aenderungstext text="Zwei **Sterne und dann nichts mehr" />);
    expect(screen.getByText("Zwei **Sterne und dann nichts mehr")).toBeTruthy();
    expect(document.querySelector("strong")).toBeNull();
  });

  it("gibt unbekannte Auszeichnung unverändert wieder, statt sie zu schlucken", () => {
    render(<Aenderungstext text="# Überschrift auf andere Art" />);
    expect(screen.getByText("# Überschrift auf andere Art")).toBeTruthy();
  });

  it("stellt HTML im Text als Text dar", () => {
    // Der Text kommt zwar aus dem eigenen Changelog, aber über das Netz. Ein
    // Darsteller, der HTML einsetzt, wäre hier die falsche Weiche.
    render(<Aenderungstext text="<script>alert(1)</script>" />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(document.querySelector("script")).toBeNull();
  });

  it("verarbeitet einen echten Abschnitt aus dem Changelog", () => {
    const text = [
      "**Kundenpreise**",
      "- Sie öffnen sich jetzt in einem eigenen Fenster, statt die Artikeltabelle",
      "  mitten entzwei zu klappen.",
      "- Ein Kundenpreis lässt sich entfernen.",
      "",
      "**Einheitlichere Oberfläche**",
      "- Schaltflächen kleben nicht mehr am darüberliegenden Eingabefeld.",
    ].join("\n");
    render(<Aenderungstext text={text} />);

    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Kundenpreise",
      "Einheitlichere Oberfläche",
    ]);
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("kommt mit leerem Text zurecht", () => {
    const { container } = render(<Aenderungstext text="" />);
    expect(container.querySelector(".aenderungstext")?.children).toHaveLength(0);
  });
});
