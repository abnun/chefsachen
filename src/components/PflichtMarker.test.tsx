import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PflichtLegende, PflichtMarker } from "./PflichtMarker";

afterEach(() => {
  cleanup();
});

describe("PflichtMarker", () => {
  it("zeigt den Stern für ein Pflichtfeld, zusammen mit dem Labeltext", () => {
    render(<PflichtMarker art="pflicht">Name</PflichtMarker>);
    expect(screen.getByTitle("Pflichtfeld")).toHaveTextContent("*");
    expect(screen.getByText("Name")).toBeTruthy();
  });

  it("zeigt zwei Sterne für ein XRechnung-nötiges Feld", () => {
    render(<PflichtMarker art="xrechnung">Leitweg-ID</PflichtMarker>);
    expect(screen.getByTitle("Für den XRechnung-Export nötig")).toHaveTextContent("**");
  });
});

describe("PflichtLegende", () => {
  it("zeigt nur den Pflichtfeld-Hinweis ohne XRechnung-Kategorie", () => {
    render(<PflichtLegende />);
    expect(screen.getByText("* Pflichtfeld")).toBeTruthy();
  });

  it("zeigt beide Kategorien, wenn zeigtXrechnung gesetzt ist", () => {
    render(<PflichtLegende zeigtXrechnung />);
    expect(screen.getByText(/\* Pflichtfeld/)).toHaveTextContent("** Für den XRechnung-Export nötig");
  });
});
