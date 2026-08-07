import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  // Ohne das sehen spätere Tests die Aufrufe der früheren. clearAllMocks setzt
  // nur die Aufrufliste zurück, nicht die bei der Deklaration gesetzten
  // Rückgabewerte — die übrigen Tests bleiben davon unberührt.
  vi.clearAllMocks();
});

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue("/ziel/sicherung.zip"),
}));
// Der Abschnitt „Programmversion" gehört zu dieser Seite; seine eigenen Tests
// stehen in Aktualisierung.test.tsx. Hier reicht es, ihn stumm zu stellen.
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn().mockResolvedValue(null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
vi.mock("@tauri-apps/plugin-log", () => ({
  info: vi.fn().mockResolvedValue(undefined),
  warn: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  readFile: vi.fn().mockResolvedValue(new Uint8Array()),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api", () => ({
  api: {
    protokoll: { pfad: vi.fn().mockResolvedValue("/p/protokoll.log") },
    sicherungen: {
      liste: vi.fn().mockResolvedValue([]),
      wiederherstellen: vi.fn().mockResolvedValue(false),
      exportieren: vi.fn().mockResolvedValue([1, 2, 3]),
      jetzt: vi.fn().mockResolvedValue({ zeitstempel: "2026-08-03_10-15-00", groesse_bytes: 2048, pfad: "/p/daten-2026-08-03_10-15-00.db" }),
      ausDateiEinspielen: vi.fn().mockResolvedValue({ belege_neu: 2, belege_vorhanden: 1, vormerkung_ersetzt: false }),
    },
    firma: {
      get: vi.fn().mockResolvedValue({
        id: "1",
        name: "Musterfirma",
        strasse: "Musterstr. 1",
        plz: "12345",
        ort: "Musterstadt",
        land: "DE",
        steuernummer: "123/456/789",
        ust_idnr: "",
        iban: "",
        bic: "",
        email: "", telefon: "", fax: "", kontakt_name: "", gruendungsjahr: null,
        kleinunternehmer: true,
        eingerichtet: true,
      }),
      save: vi.fn(),
      logoGet: vi.fn().mockResolvedValue(null),
      logoSet: vi.fn().mockResolvedValue(undefined),
    },
    einheiten: {
      list: vi.fn().mockResolvedValue([{ id: "e1", name: "Stunde", kuerzel: "Std" }]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    // Die Belegvorlage liest alle Einstellungen auf einmal und lässt sich eine
    // Vorschau zeichnen. Beides ist für die Zusicherungen hier ohne Belang;
    // geprüft wird der Abschnitt in Belegvorlage.test.tsx.
    vorlage: { vorschau: vi.fn().mockResolvedValue("<svg></svg>") },
    einstellungen: {
      list: vi.fn().mockResolvedValue([]),
      nummernkreise: vi.fn().mockResolvedValue([
        { art: "rechnung", format: "R-{jahr}-{nr}", zaehler: 5, jahres_reset: true },
      ]),
      nummernkreisUpdate: vi.fn(),
      get: vi.fn((key: string) => {
        const werte: Record<string, string> = {
          "text.kleinunternehmer": "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.",
          "text.rechnung.fuss": "Vielen Dank für Ihren Auftrag.",
          "text.angebot.fuss": "Dieses Angebot ist 30 Tage gültig.",
        };
        return Promise.resolve(werte[key] ?? null);
      }),
      // Ein echtes Promise, wie die Anwendung es liefert: Produktionscode, der
      // `.catch()` ohne `await` anhängt (etwa ein bewusst nicht abgewartetes
      // Nebenbei-Speichern), bräche an einem `vi.fn()` ohne Rückgabewert.
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  istValidierungsfehler: () => false,
}));
import { api } from "../api";
import { AktualisierungProvider } from "../hooks/useAktualisierung";
import { Einstellungen } from "./Einstellungen";

/**
 * Die Aktualisierungssuche sitzt im Kontext, der in main.tsx um die ganze
 * Anwendung gelegt wird. Der Test bildet das mit einem eigenen, schmalen
 * Anbieter nach.
 */
function EinstellungenMitAnbieter() {
  return (
    <AktualisierungProvider>
      <Einstellungen />
    </AktualisierungProvider>
  );
}

describe("Einstellungen", () => {
  it("startet den Rundgang über den Knopf im Seitenkopf", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Rundgang" }));
    expect(screen.getByText("1 von 7")).toBeTruthy();
  });

  it("laedt und zeigt Firmendaten, Einheiten und Nummernkreise", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    expect(screen.getByText("Std")).toBeTruthy();
    expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy();
    expect(screen.getByText(/Aktueller Zähler: 5/)).toBeTruthy();
  });

  it("laedt und zeigt Textbausteine", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() =>
      expect(screen.getByDisplayValue("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.")).toBeTruthy(),
    );
    expect(screen.getAllByText("Kleinunternehmer-Hinweis").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Vielen Dank für Ihren Auftrag.")).toBeTruthy();
    expect(screen.getByDisplayValue("Dieses Angebot ist 30 Tage gültig.")).toBeTruthy();
  });

  it("zeigt nach dem Speichern der Firmendaten einen Erfolgs-Hinweis", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockResolvedValueOnce({
      id: "1", name: "Musterfirma", strasse: "Musterstr. 1", plz: "12345", ort: "Musterstadt",
      land: "DE", steuernummer: "123/456/789", ust_idnr: "", iban: "", bic: "",
      email: "", telefon: "", fax: "", kontakt_name: "", gruendungsjahr: null,
      kleinunternehmer: true, eingerichtet: true,
    });
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());
    // Index 0: Firmendaten ist der erste Abschnitt auf der Seite, dessen
    // "Speichern"-Button ist damit im DOM immer der erste unter diesem Namen.
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]);
    await waitFor(() => expect(screen.getByText("Firmendaten gespeichert")).toBeTruthy());
  });

  it("speichert eine geänderte Fax-Nummer mit", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.save).mockResolvedValueOnce({
      id: "1", name: "Musterfirma", strasse: "Musterstr. 1", plz: "12345", ort: "Musterstadt",
      land: "DE", steuernummer: "123/456/789", ust_idnr: "", iban: "", bic: "",
      email: "", telefon: "", fax: "030 123456-9", kontakt_name: "", gruendungsjahr: null,
      kleinunternehmer: true, eingerichtet: true,
    });
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("Musterfirma")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Fax"), { target: { value: "030 123456-9" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[0]);

    await waitFor(() =>
      expect(api.firma.save).toHaveBeenCalledWith(expect.objectContaining({ fax: "030 123456-9" })),
    );
  });

  it("zeigt nach dem Anlegen einer neuen Einheit einen Erfolgs-Hinweis", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText("Std")).toBeTruthy());
    // Firmendaten hat ebenfalls ein "Name"-Feld, aber dessen Label lautet wegen
    // des Pflichtfeld-Markers "Name *" — exakt "Name" bleibt hier eindeutig.
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Pauschale" } });
    fireEvent.change(screen.getByLabelText("Kürzel"), { target: { value: "Pausch" } });
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Pauschale" angelegt')).toBeTruthy());
  });

  it("löscht eine Einheit nicht, wenn im Dialog abgebrochen wird", async () => {
    const { api } = await import("../api");
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(api.einheiten.delete)).not.toHaveBeenCalled();
  });

  it("zeigt nach dem Löschen einer Einheit einen Erfolgs-Hinweis", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Löschen" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText('Einheit „Stunde" löschen?')).toBeTruthy());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Löschen" }));
    await waitFor(() => expect(screen.getByText("Einheit gelöscht")).toBeTruthy());
  });

  it("zeigt nach dem Speichern eines Nummernkreises einen Erfolgs-Hinweis", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("R-{jahr}-{nr}")).toBeTruthy());
    // Index 1: Firmendaten (0) steht im DOM vor dem einzigen Nummernkreis-Eintrag (1).
    fireEvent.click(screen.getAllByRole("button", { name: "Speichern" })[1]);
    await waitFor(() => expect(screen.getByText("Nummernkreis gespeichert")).toBeTruthy());
  });

  it("zeigt nach dem Speichern eines Textbausteins einen Erfolgs-Hinweis mit Feldname", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByDisplayValue("Vielen Dank für Ihren Auftrag.")).toBeTruthy());
    // Über das Formular des Bausteins, nicht über die Nummer des Knopfes: Eine
    // Zählung quer über die Seite verschob sich, sobald ein Baustein dazukam —
    // und der Test prüfte danach ein anderes Formular als gemeint.
    const feld = screen.getByLabelText("Rechnungs-Fußtext");
    const formular = feld.closest("form")!;
    fireEvent.click(within(formular).getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Rechnungs-Fußtext gespeichert")).toBeTruthy());
  });

  /// Der Einrichtungsassistent sagt ausdrücklich zu, das Logo lasse sich später
  /// in den Einstellungen ändern — bislang gab es dafür keine Möglichkeit.
  it("hinterlegt ein Logo und lässt es wieder entfernen", async () => {
    const { api } = await import("../api");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    vi.mocked(api.firma.logoGet).mockResolvedValue(null);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText(/Kein Logo hinterlegt/)).toBeTruthy());

    vi.mocked(open).mockResolvedValueOnce("/pfad/logo.png");
    vi.mocked(readFile).mockResolvedValueOnce(new Uint8Array([1, 2, 3, 4]));
    fireEvent.click(screen.getByRole("button", { name: "Logo wählen" }));
    await waitFor(() => expect(api.firma.logoSet).toHaveBeenCalledWith([1, 2, 3, 4]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Logo entfernen" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Logo entfernen" }));
    await waitFor(() => expect(api.firma.logoSet).toHaveBeenLastCalledWith([]));
    await waitFor(() => expect(screen.getByText(/Kein Logo hinterlegt/)).toBeTruthy());
  });

  it("zeigt eine Bildvorschau des hinterlegten Logos", async () => {
    // Vorher stand hier nur die Dateigröße als Text — ob das die richtige
    // Datei ist, ließ sich erst auf dem fertigen Beleg sehen.
    const { api } = await import("../api");
    vi.mocked(api.firma.logoGet).mockResolvedValue([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByAltText("Hinterlegtes Logo")).toBeTruthy());
    const bild = screen.getByAltText("Hinterlegtes Logo") as HTMLImageElement;
    expect(bild.src).toMatch(/^data:image\/png;base64,/);
  });

  it("zeigt keine Logo-Vorschau, solange kein Logo hinterlegt ist", async () => {
    const { api } = await import("../api");
    vi.mocked(api.firma.logoGet).mockResolvedValue(null);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText(/Kein Logo hinterlegt/)).toBeTruthy());
    expect(screen.queryByAltText("Hinterlegtes Logo")).toBeNull();
  });

  it("bricht die Logo-Auswahl ohne Fehler ab, wenn kein Bild gewählt wurde", async () => {
    const { api } = await import("../api");
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(api.firma.logoGet).mockResolvedValue(null);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Logo wählen" })).toBeTruthy());
    vi.mocked(open).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Logo wählen" }));
    await waitFor(() => expect(api.firma.logoSet).not.toHaveBeenCalled());
  });

  /// Ohne sichtbare Sicherungen wüsste im Ernstfall niemand, dass es sie gibt
  /// oder wo sie liegen.
  it("zeigt vorhandene Sicherungen mit lesbarem Zeitpunkt", async () => {
    const { api } = await import("../api");
    vi.mocked(api.sicherungen.liste).mockResolvedValue([
      { zeitstempel: "2026-08-03_10-15-00", groesse_bytes: 2048, pfad: "/p/daten-2026-08-03_10-15-00.db" },
    ]);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText("03.08.2026, 10:15 Uhr")).toBeTruthy());
    expect(screen.getByText("2 KB")).toBeTruthy();
  });

  it("legt auf Knopfdruck eine Sicherung an und lädt die Liste neu", async () => {
    const { api } = await import("../api");
    vi.mocked(api.sicherungen.liste).mockResolvedValue([]);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText(/Noch keine Sicherungen/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Jetzt sichern" }));
    await waitFor(() => expect(api.sicherungen.jetzt).toHaveBeenCalled());
    await waitFor(() => expect(vi.mocked(api.sicherungen.liste).mock.calls.length).toBeGreaterThan(1));
  });

  it("spielt eine Sicherung erst nach Rückfrage zurück und verlangt einen Neustart", async () => {
    // Die Datenbank ist im laufenden Betrieb geöffnet; sie unter der offenen
    // Verbindung auszutauschen führt zu einer beschädigten Datei. Deshalb wird
    // nur vorgemerkt.
    vi.mocked(api.sicherungen.liste).mockResolvedValue([
      { zeitstempel: "2026-08-01_09-00-00", groesse_bytes: 2048, pfad: "/p/a.db" },
    ]);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText("01.08.2026, 09:00 Uhr")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Zurückspielen" }));
    // Ohne Bestätigung passiert nichts.
    expect(api.sicherungen.wiederherstellen).not.toHaveBeenCalled();

    // Der Dialog trägt dieselbe Beschriftung wie der Knopf in der Zeile.
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Zurückspielen" }));
    await waitFor(() =>
      expect(api.sicherungen.wiederherstellen).toHaveBeenCalledWith("2026-08-01_09-00-00"),
    );
    expect(await screen.findByText("Die Wiederherstellung ist vorgemerkt")).toBeTruthy();
  });

  it("speichert eine Sicherung an einen selbst gewählten Ort", async () => {
    // Die automatischen Kopien liegen auf derselben Platte wie das Original.
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    vi.mocked(api.sicherungen.liste).mockResolvedValue([
      { zeitstempel: "2026-08-01_09-00-00", groesse_bytes: 2048, pfad: "/p/a.db" },
    ]);
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText("01.08.2026, 09:00 Uhr")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Speichern unter …" }));
    await waitFor(() => expect(api.sicherungen.exportieren).toHaveBeenCalledWith("2026-08-01_09-00-00"));
    await waitFor(() => expect(writeFile).toHaveBeenCalled());
    // Zip statt nackter Datenbank: Die Sicherung trägt seither auch das
    // Belegarchiv, nicht nur die Datenbank.
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: expect.stringMatching(/\.zip$/) }),
    );
  });

  it("nennt das Belegarchiv im Hinweis zur Sicherung", async () => {
    // Ohne diesen Satz hält man „Speichern unter" für eine reine
    // Datenbank-Kopie und übersieht, dass mehr als das exportiert wird.
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText(/Belegarchiv/)).toBeTruthy());
  });

  it("spielt eine exportierte Zip erst nach Rückfrage ein und verlangt einen Neustart", async () => {
    // Der Rückweg zu „Speichern unter": Vorher musste man die Zip im
    // Ernstfall von Hand entpacken und die Dateien an die richtigen Pfade
    // legen, was nirgends erklärt war.
    const { api } = await import("../api");
    const { open } = await import("@tauri-apps/plugin-dialog");
    vi.mocked(open).mockResolvedValueOnce("/pfad/kleinunternehmer-sicherung.zip");
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Aus Datei einspielen …" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Aus Datei einspielen …" }));
    // Ohne Bestätigung passiert nichts.
    const dialog = await screen.findByRole("dialog");
    expect(api.sicherungen.ausDateiEinspielen).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Einspielen" }));
    await waitFor(() =>
      expect(api.sicherungen.ausDateiEinspielen).toHaveBeenCalledWith("/pfad/kleinunternehmer-sicherung.zip"),
    );
    expect(await screen.findByText("Die Wiederherstellung ist vorgemerkt")).toBeTruthy();
    expect(await screen.findByText(/2 Belegdatei\(en\) übernommen/)).toBeTruthy();
  });

  it("bricht das Einspielen ohne gewählte Datei stumm ab", async () => {
    const { api } = await import("../api");
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Aus Datei einspielen …" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Aus Datei einspielen …" }));
    // open() liefert null (Abbruch im Dateidialog) — keine Rückfrage, kein Aufruf.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.sicherungen.ausDateiEinspielen).not.toHaveBeenCalled();
  });

  /*
   * „Automatisch gesichert" heißt nicht „sicher gesichert" — die Kopien liegen
   * auf derselben Platte. Ohne einen Hinweis darauf, wann zuletzt woandershin
   * exportiert wurde, gerät das leicht in Vergessenheit.
   */
  it("sagt, wenn noch nie extern gesichert wurde", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() => expect(screen.getByText("Noch nie extern gesichert.")).toBeTruthy());
  });

  it("merkt sich Zeitpunkt einer externen Sicherung und zeigt ihn an", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-04T14:22:00Z"));
    try {
      vi.mocked(api.sicherungen.liste).mockResolvedValue([
        { zeitstempel: "2026-08-01_09-00-00", groesse_bytes: 2048, pfad: "/p/a.db" },
      ]);
      render(<EinstellungenMitAnbieter />);
      await waitFor(() => expect(screen.getByText("01.08.2026, 09:00 Uhr")).toBeTruthy());

      fireEvent.click(screen.getByRole("button", { name: "Speichern unter …" }));
      await waitFor(() =>
        expect(api.einstellungen.set).toHaveBeenCalledWith(
          "sicherung.zuletzt_exportiert",
          "2026-08-04T14:22:00.000Z",
        ),
      );
      await waitFor(() =>
        expect(screen.getByText(/Zuletzt extern gesichert:/)).toBeTruthy(),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("übernimmt einen bereits gespeicherten Zeitpunkt der letzten Sicherung", async () => {
    // Wie beim ähnlichen Test zur Angebotsgültigkeit: `mockImplementation`
    // überlebt `clearAllMocks`, deshalb ausdrücklich zurückgesetzt, sonst
    // sähen spätere Tests hier „null" statt ihrer eigenen Werte.
    const urspruenglich = vi.mocked(api.einstellungen.get).getMockImplementation();
    vi.mocked(api.einstellungen.get).mockImplementation((key: string) =>
      Promise.resolve(key === "sicherung.zuletzt_exportiert" ? "2026-08-02T10:00:00Z" : null),
    );
    render(<EinstellungenMitAnbieter />);
    await waitFor(() =>
      expect(screen.getByText(/Zuletzt extern gesichert: 02.08.2026/)).toBeTruthy(),
    );
    if (urspruenglich) vi.mocked(api.einstellungen.get).mockImplementation(urspruenglich);
  });

  /*
   * Der Fußtext versprach bisher eine Frist ("Dieses Angebot ist 30 Tage
   * gültig"), ohne dass ein Datum dazu existierte. Diese Einstellung ist die
   * Vorgabe dafür.
   */
  it("zeigt 30 Tage als Vorgabe, wenn nichts gespeichert ist", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() =>
      expect(screen.getByLabelText("Angebotsgültigkeit (Tage)")).toHaveValue(30),
    );
  });

  it("übernimmt eine bereits gespeicherte Angebotsgültigkeit", async () => {
    // `mockImplementation` überlebt `clearAllMocks` in `afterEach` (das setzt
    // nur die Aufrufliste zurück, nicht die Rückgabewerte) — deshalb hier
    // ausdrücklich wieder auf die ursprüngliche Zuordnung zurückgesetzt,
    // sonst sähen spätere Tests in dieser Datei „14" statt ihrer eigenen Werte.
    const urspruenglich = vi.mocked(api.einstellungen.get).getMockImplementation();
    vi.mocked(api.einstellungen.get).mockImplementation((key: string) =>
      Promise.resolve(key === "vorlage.angebot_gueltigkeit_tage" ? "14" : null),
    );
    render(<EinstellungenMitAnbieter />);
    await waitFor(() =>
      expect(screen.getByLabelText("Angebotsgültigkeit (Tage)")).toHaveValue(14),
    );
    if (urspruenglich) vi.mocked(api.einstellungen.get).mockImplementation(urspruenglich);
  });

  it("speichert eine geänderte Angebotsgültigkeit", async () => {
    render(<EinstellungenMitAnbieter />);
    await waitFor(() =>
      expect(screen.getByLabelText("Angebotsgültigkeit (Tage)")).toHaveValue(30),
    );
    const feld = screen.getByLabelText("Angebotsgültigkeit (Tage)").closest("form")!;
    fireEvent.change(screen.getByLabelText("Angebotsgültigkeit (Tage)"), { target: { value: "45" } });
    fireEvent.click(within(feld).getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(api.einstellungen.set).toHaveBeenCalledWith("vorlage.angebot_gueltigkeit_tage", "45"),
    );
    await waitFor(() => expect(screen.getByText("Angebotsgültigkeit gespeichert")).toBeTruthy());
  });
});
