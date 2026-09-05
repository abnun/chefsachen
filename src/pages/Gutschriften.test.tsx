import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Gutschriften } from "./Gutschriften";
import { api } from "../api";

vi.mock("../api");

beforeEach(() => {
  vi.mocked(api.belege.list).mockResolvedValue([]);
  vi.mocked(api.kunden.list).mockResolvedValue([]);
});

describe("Gutschriften", () => {
  it("zeigt den leeren Zustand als Hinweisbox", async () => {
    render(<Gutschriften onOeffnen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Noch keine Gutschriften/)).toBeTruthy());
  });

  it("ruft die Liste mit typ='gutschrift' ab", async () => {
    render(<Gutschriften onOeffnen={() => {}} />);
    await waitFor(() => expect(api.belege.list).toHaveBeenCalledWith("gutschrift", undefined, undefined));
  });
});
