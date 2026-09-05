import { describe, it, expect } from "vitest";
import { statusLabel, GUTSCHRIFT_STATUS } from "./belegStatus";

describe("Gutschrift-Status", () => {
  it("kennt entwurf und festgeschrieben", () => {
    expect([...GUTSCHRIFT_STATUS]).toEqual(["entwurf", "festgeschrieben", "storniert"]);
    expect(statusLabel("festgeschrieben")).toBe("Festgeschrieben");
  });
});
