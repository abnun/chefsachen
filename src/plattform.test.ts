import { afterEach, describe, expect, it } from "vitest";
import { aktuellePlattform, plattformErkennen, plattformSetzen } from "./plattform";

describe("plattformErkennen", () => {
  it("erkennt macOS am WebKit des Systems", () => {
    expect(
      plattformErkennen(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
        "MacIntel",
      ),
    ).toBe("mac");
  });

  it("erkennt Windows an WebView2", () => {
    expect(
      plattformErkennen(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Win32",
      ),
    ).toBe("win");
  });

  it("hält ein iPad nicht für einen Mac", () => {
    expect(plattformErkennen("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)", "iPad")).toBe("andere");
  });

  it("fällt bei Linux auf „andere“ zurück", () => {
    expect(plattformErkennen("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64")).toBe("andere");
  });
});

describe("plattformSetzen", () => {
  afterEach(() => {
    delete document.documentElement.dataset.plattform;
  });

  it("setzt das Attribut an <html>", () => {
    const ergebnis = plattformSetzen();
    expect(document.documentElement.dataset.plattform).toBe(ergebnis);
    expect(aktuellePlattform()).toBe(ergebnis === "andere" ? "andere" : ergebnis);
  });

  it("lässt einen vorab gesetzten Wert stehen (Vorschau)", () => {
    document.documentElement.dataset.plattform = "mac";
    expect(plattformSetzen()).toBe("mac");
    expect(aktuellePlattform()).toBe("mac");
  });
});
