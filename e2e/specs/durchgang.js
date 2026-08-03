/**
 * Ein Durchgang durch die Anwendung, so wie ihn ein neuer Nutzer geht:
 * einrichten, Kunde, Artikel, Angebot, Position, festschreiben.
 *
 * Bewusst **eine** Datei mit aufeinander aufbauenden Fällen. Zwei getrennte
 * Dateien liefen gegen denselben Datenordner: Die Anwendung legt ihre Datenbank
 * unter HOME an, und `tauri-driver` erbt HOME beim Start — was eine einzelne
 * Spec später setzt, erreicht die Anwendung nicht mehr. Die zweite Datei fand
 * dann keine Ersteinrichtung mehr vor und scheiterte aus einem Grund, der
 * nichts mit ihrem Gegenstand zu tun hatte.
 *
 * Anlass für den langen Weg war ein Fehlerbericht: Der Bestätigungsdialog
 * erschien beim Festschreiben, aber keiner seiner Knöpfe reagierte — nur wenn
 * die Seite gescrollt war. In Chrome trat es nie auf.
 */

async function feld(beschriftung) {
  return await $(
    `//label[contains(., "${beschriftung}")]//input | //label[contains(., "${beschriftung}")]//select`,
  );
}

async function klick(text) {
  const k = await $(`//button[normalize-space(text())="${text}"]`);
  await k.waitForClickable({ timeout: 20000 });
  await k.click();
}

async function nav(ziel) {
  const k = await $(`//button[contains(@class,"app-nav-eintrag")][contains(., "${ziel}")]`);
  await k.waitForClickable({ timeout: 20000 });
  await k.click();
}

describe("Ein Durchgang durch die Anwendung", () => {
  it("zeigt die Ersteinrichtung statt eines leeren Fensters", async () => {
    // Ein blockiertes Skript oder ein Fehler beim ersten Aufbau ergäbe ein
    // leeres Fenster, in dem jede Fachlogik einwandfrei und trotzdem
    // unbenutzbar ist.
    const ueberschrift = await $("h1");
    await ueberschrift.waitForDisplayed({ timeout: 30000 });
    await expect(ueberschrift).toHaveText("Ersteinrichtung");
  });

  it("hält bei unvollständigen Angaben im ersten Schritt an", async () => {
    // Geprüft wird seit 0.2.1 schon nach Schritt 1, im Backend. Ohne
    // Steuernummer oder USt-IdNr. ist eine Rechnung nach § 14 UStG formell
    // fehlerhaft — das soll man erfahren, bevor man vier Schritte weitergeht.
    const name = await feld("Name");
    await name.waitForDisplayed({ timeout: 20000 });
    await name.setValue("Durchstich GmbH");
    await klick("Weiter");

    await (await $("[role='alert'], .fehler-box")).waitForDisplayed({ timeout: 15000 });
    await expect(await $(".schritt-fortschritt")).toHaveText(
      expect.stringContaining("Schritt 1"),
    );
  });

  it("geht mit vollständigen Angaben weiter", async () => {
    await (await feld("Steuernummer")).setValue("12/345/67890");
    await klick("Weiter");
    await expect(await $(".schritt-fortschritt")).toHaveText(
      expect.stringContaining("Schritt 2"),
    );
  });

  it("führt durch die restlichen Schritte", async () => {
    await klick("Weiter"); // 2 → 3
    await klick("Weiter"); // 3 → 4
    await klick("Einrichtung abschließen");
    await klick("Ersten Kunden anlegen");

    // Erst danach gibt es die Hauptnavigation.
    await (await $(".app-nav")).waitForDisplayed({ timeout: 20000 });
  });

  it("legt einen Kunden an", async () => {
    await nav("Kunden");
    await klick("Neuer Kunde");
    await (await feld("Name")).setValue("Lanius Natur");
    await klick("Speichern");
    await (await $('//td[contains(., "Lanius Natur")]')).waitForDisplayed({ timeout: 20000 });
  });

  it("legt einen Artikel an", async () => {
    await nav("Artikel");
    await klick("Neuer Artikel");
    await (await feld("Bezeichnung")).setValue("Homepage-Erweiterung");
    await (await feld("Standardpreis")).setValue("39,00");
    await klick("Speichern");
    await (await $('//td[contains(., "Homepage-Erweiterung")]')).waitForDisplayed({
      timeout: 20000,
    });
  });

  it("legt ein Angebot mit einer Position an", async () => {
    await nav("Angebote");
    await klick("Neues Angebot");
    await klick("Anlegen");

    const artikel = await feld("Artikel");
    await artikel.waitForDisplayed({ timeout: 20000 });
    await artikel.setValue("Homepage-Erweiterung");
    await (await feld("Menge")).setValue("4");
    await klick("Position hinzufügen");
    await (await $('//td[contains(., "Homepage-Erweiterung")]')).waitForDisplayed({
      timeout: 20000,
    });
  });

  it("schreibt das Angebot über den Dialog fest", async () => {
    // Genau hier hakte es: Der Dialog erschien, seine Knöpfe waren aber nicht
    // zu treffen, solange die Seite gescrollt war.
    await klick("Festschreiben");
    await (await $('[role="dialog"]')).waitForDisplayed({ timeout: 20000 });
    await klick("Festschreiben");

    await expect(await $(".status")).toHaveText("Versendet", { wait: 20000 });
  });

  it("meldet keine Verstöße gegen die Inhaltsrichtlinie", async () => {
    // Die Richtlinie aus P5.7 ist streng. Blockiert sie etwas Eigenes, zeigt
    // sich das nur hier: im echten Webview, mit der echten Richtlinie.
    await browser.execute(() => {
      window.__e2eVerstoesse = [];
      document.addEventListener("securitypolicyviolation", (e) => {
        window.__e2eVerstoesse.push(`${e.violatedDirective} <- ${e.blockedURI}`);
      });
    });
    await nav("Übersicht");
    await expect(await browser.execute(() => window.__e2eVerstoesse)).toEqual([]);
  });
});
