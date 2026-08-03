/**
 * Der wichtigste Ablauf der Anwendung, von vorn bis zum gestellten Angebot.
 *
 * Anlass war ein Fehlerbericht: Der Bestätigungsdialog erschien, aber keiner
 * seiner beiden Knöpfe ließ sich anklicken — und es kam auch keine Meldung.
 * In Chrome war der Knopf einwandfrei zu treffen (gemessen mit
 * `elementFromPoint`), in der WebKit-Webview der Anwendung nicht. Genau dafür
 * gibt es diesen Durchstich.
 *
 * Der Weg ist lang, weil er der echte ist: einrichten, Kunde, Artikel,
 * Angebot, Position, stellen. Jede Abkürzung ließe eine der Stellen aus, an
 * denen es hakt.
 */

/** Feld über seine Beschriftung finden. */
async function feld(beschriftung) {
  return await $(`//label[contains(., "${beschriftung}")]//input | //label[contains(., "${beschriftung}")]//select`);
}

async function klick(text) {
  const k = await $(`//button[normalize-space(text())="${text}"]`);
  await k.waitForClickable({ timeout: 15000 });
  await k.click();
}

async function nav(ziel) {
  const k = await $(`//button[contains(@class,"app-nav-eintrag")][contains(., "${ziel}")]`);
  await k.waitForClickable({ timeout: 15000 });
  await k.click();
}

describe("Ein Angebot vollständig stellen", () => {
  it("führt durch Einrichtung, Kunde, Artikel, Angebot und Stellen", async () => {
    // --- Ersteinrichtung ---
    const name = await feld("Name");
    await name.waitForDisplayed({ timeout: 30000 });
    await name.setValue("Durchstich GmbH");
    await (await feld("Steuernummer")).setValue("12/345/67890");
    await klick("Weiter"); // 1 → 2
    await klick("Weiter"); // 2 → 3
    await klick("Weiter"); // 3 → 4
    await klick("Einrichtung abschließen");

    // Schritt 5 bietet zwei Ziele an; über die Navigation geht es genauso.
    await nav("Kunden");

    // --- Kunde ---
    await klick("Neuer Kunde");
    await (await feld("Name")).setValue("Lanius Natur");
    await klick("Speichern");
    await $('//td[contains(., "Lanius Natur")]').then((e) => e.waitForDisplayed({ timeout: 15000 }));

    // --- Artikel ---
    await nav("Artikel");
    await klick("Neuer Artikel");
    await (await feld("Bezeichnung")).setValue("Homepage-Erweiterung");
    await (await feld("Standardpreis")).setValue("39,00");
    await klick("Speichern");

    // --- Angebot ---
    await nav("Angebote");
    await klick("Neues Angebot");
    await klick("Anlegen");

    // --- Position ---
    const artikel = await feld("Artikel");
    await artikel.waitForDisplayed({ timeout: 15000 });
    await artikel.setValue("Homepage-Erweiterung");
    await (await feld("Menge")).setValue("4");
    await klick("Position hinzufügen");
    await $('//td[contains(., "Homepage-Erweiterung")]').then((e) =>
      e.waitForDisplayed({ timeout: 15000 }),
    );

    // --- Stellen ---
    await klick("Stellen");

    // Der Dialog muss erscheinen *und* bedienbar sein. Genau hier hakte es.
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 15000 });
    await klick("Versenden");

    // Danach ist das Angebot versendet und trägt eine Nummer.
    const status = await $(".status");
    await expect(status).toHaveText("Versendet", { wait: 15000 });
  });
});
