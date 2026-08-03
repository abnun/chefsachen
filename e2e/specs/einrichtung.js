/**
 * Der erste Weg durch die Anwendung, gefahren wie von einem Nutzer.
 *
 * Was hier geprüft wird, prüft kein anderer Test: dass die Oberfläche im
 * echten Webview überhaupt erscheint und sich bedienen lässt. Ein blockiertes
 * Skript, eine zu strenge Inhaltsrichtlinie (P5.7) oder ein Fehler beim ersten
 * Aufbau führen zu einem leeren Fenster — und in einem leeren Fenster ist jede
 * Fachlogik einwandfrei und trotzdem unbenutzbar.
 *
 * Bewusst über sichtbare Elemente statt über `window.__TAURI__`: Der
 * Durchstich soll den Weg nehmen, den auch der Nutzer nimmt.
 */
describe("Erster Start", () => {
  it("zeigt die Ersteinrichtung statt eines leeren Fensters", async () => {
    const ueberschrift = await $("h1");
    await ueberschrift.waitForDisplayed({ timeout: 30000 });
    await expect(ueberschrift).toHaveText("Ersteinrichtung");
  });

  it("hält bei unvollständigen Angaben im ersten Schritt an", async () => {
    // Geprüft wird seit 0.2.1 schon nach Schritt 1, im Backend. Ohne
    // Steuernummer oder USt-IdNr. ist eine Rechnung nach § 14 UStG formell
    // fehlerhaft — das soll man erfahren, bevor man vier weitere Schritte geht.
    const nameFeld = await $('//label[contains(., "Name")]/input');
    await nameFeld.waitForDisplayed({ timeout: 10000 });
    await nameFeld.setValue("E2E Testfirma");

    await (await $('//button[text()="Weiter"]')).click();

    const meldung = await $("[role='alert'], .fehler");
    await meldung.waitForDisplayed({ timeout: 10000 });
    await expect(await $(".schritt-fortschritt")).toHaveText(
      expect.stringContaining("Schritt 1"),
    );
  });

  it("nimmt vollständige Eingaben an und trägt sie über die IPC-Grenze", async () => {
    // Der eigentliche Durchstich: Eingabe, Prüfung im Rust-Teil, Schrittwechsel.
    const nameFeld = await $('//label[contains(., "Name")]/input');
    await nameFeld.waitForDisplayed({ timeout: 10000 });
    await nameFeld.setValue("E2E Testfirma");
    await expect(nameFeld).toHaveValue("E2E Testfirma");

    const steuernummer = await $('//label[contains(., "Steuernummer")]/input');
    await steuernummer.setValue("12/345/67890");

    await (await $('//button[text()="Weiter"]')).click();

    // Schritt 2 erscheint nur, wenn die Prüfung im Backend durchlief und React
    // darauf reagiert hat — der Beweis, dass die Brücke in beide Richtungen
    // trägt.
    const schritt = await $(".schritt-fortschritt");
    await expect(schritt).toHaveText(expect.stringContaining("Schritt 2"));
  });

  it("meldet keine Verstöße gegen die Inhaltsrichtlinie", async () => {
    // Die Richtlinie aus P5.7 ist streng. Blockiert sie etwas Eigenes, zeigt
    // sich das nur hier: im echten Webview, mit der echten Richtlinie.
    //
    // Der Horcher wird erst jetzt gesetzt und meldet daher nur, was ab hier
    // passiert. Ein Verstoß beim allerersten Aufbau bliebe unbemerkt — den
    // deckt der erste Test ab, denn dann bliebe das Fenster leer.
    await browser.execute(() => {
      window.__e2eVerstoesse = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__e2eVerstoesse.push(`${e.violatedDirective} <- ${e.blockedURI}`);
      });
    });

    const zurueck = await $('//button[text()="Zurück"]');
    await zurueck.click();

    const verstoesse = await browser.execute(() => window.__e2eVerstoesse);
    await expect(verstoesse).toEqual([]);
  });

  it("ist mit der Tastatur bedienbar", async () => {
    // Ohne Maus muss sich jedes Bedienelement erreichen lassen (WCAG 2.1.1).
    // Im echten Fenster zeigt sich, ob die Fokusreihenfolge überhaupt greift —
    // in jsdom gibt es kein Layout, das sie durcheinanderbringen könnte.
    await browser.keys(["Tab"]);
    const aktiv = await browser.execute(() => {
      const e = document.activeElement;
      return e ? { tag: e.tagName, sichtbar: e !== document.body } : null;
    });
    if (!aktiv?.sichtbar) {
      throw new Error("Der erste Tabulatorschritt landet nirgends — nichts ist fokussierbar");
    }
  });
});
