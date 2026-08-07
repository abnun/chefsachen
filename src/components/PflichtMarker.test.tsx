import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

afterEach(() => {
  cleanup();
});

describe("PflichtMarker", () => {
  it("zeigt den Stern für ein Pflichtfeld", () => {
    render(<PflichtMarker art="pflicht" />);
    expect(screen.getByTitle("Pflichtfeld")).toHaveTextContent("*");
  });

  it("zeigt das Kreuz für ein XRechnung-nötiges Feld", () => {
    render(<PflichtMarker art="xrechnung" />);
    expect(screen.getByTitle("Für den XRechnung-Export nötig")).toHaveTextContent("†");
  });
});

describe("PflichtLegende", () => {
  it("zeigt nur den Pflichtfeld-Hinweis ohne XRechnung-Kategorie", () => {
    render(<PflichtLegende />);
    expect(screen.getByText("* Pflichtfeld")).toBeTruthy();
  });

  it("zeigt beide Kategorien, wenn zeigtXrechnung gesetzt ist", () => {
    render(<PflichtLegende zeigtXrechnung />);
    expect(screen.getByText(/\* Pflichtfeld/)).toHaveTextContent("† Für den XRechnung-Export nötig");
  });
});
