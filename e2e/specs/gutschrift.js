/**
 * Durchstich für die kaufmännische Gutschrift:
 * Rechnung stellen → „Gutschrift erstellen" → Position kürzen → festschreiben
 * → als PDF und XRechnung exportierbar → in der Gutschriften-Liste mit
 * negativem Betrag.
 *
 * Bewusst **eine** Datei mit aufeinander aufbauenden Fällen, wie
 * `durchgang.js`. Beide Specs teilen sich denselben Datenordner (die
 * Anwendung legt ihre Datenbank unter HOME an, und `tauri-driver` erbt HOME
 * beim Start). Deshalb macht dieser Durchstich keine Annahme über die
 * Reihenfolge: Der erste Fall führt die Ersteinrichtung nur durch, falls sie
 * noch aussteht — lief `durchgang.js` vorher, ist die Hauptnavigation schon
 * da und der Schritt entfällt.
 *
 * Der Datei-Export lässt sich hier nicht zu Ende prüfen: `save()` öffnet einen
 * Datei-Dialog des Betriebssystems, den WebDriver nicht bedienen kann. Geprüft
 * wird deshalb, dass die Export-Knöpfe für eine festgeschriebene Gutschrift
 * überhaupt angeboten und nicht abgeblendet sind — die gelockerten
 * Export-Guards (Rechnung *oder* Gutschrift) schlagen sonst hier durch. Die
 * Normkonformität der erzeugten XRechnung (TypeCode 381) deckt der
 * KoSIT-Test in `xrechnung.rs` ab.
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

/**
 * Öffnet ein Anlegeformular, falls es nicht schon offen ist — der „Neuer
 * Kunde"-Knopf schaltet um, er öffnet nicht (siehe `durchgang.js`).
 */
async function formularOeffnen(knopfText, feldName) {
  const feldSchon = await feld(feldName);
  if (await feldSchon.isDisplayed().catch(() => false)) return;
  await klick(knopfText);
  await (await feld(feldName)).waitForDisplayed({ timeout: 20000 });
}

/** Bestätigt den Bestätigungsdialog über den Knopf mit dem gegebenen Text. */
async function dialogBestaetigen(knopfText) {
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  await (await dialog.$(`.//button[normalize-space(text())="${knopfText}"]`)).click();
  await browser.waitUntil(
    async () => !(await (await $('[role="dialog"]')).isDisplayed().catch(() => false)),
    { timeout: 10000, timeoutMsg: "Der Dialog bleibt nach dem Bestätigen offen." },
  );
}

/** Läuft die Ersteinrichtung durch, falls noch keine Hauptnavigation da ist. */
async function einrichtenFallsNoetig() {
  const navDa = await $(".app-nav");
  if (await navDa.isDisplayed().catch(() => false)) return;

  const ueberschrift = await $("h1");
  await ueberschrift.waitForDisplayed({ timeout: 30000 });
  await expect(ueberschrift).toHaveText("Ersteinrichtung");

  await (await feld("Name")).setValue("Gutschrift-Durchstich GmbH");
  await klick("Weiter");
  await (await feld("Straße")).setValue("Musterstraße 1");
  await (await feld("PLZ")).setValue("12345");
  await (await feld("Ort")).setValue("Musterstadt");
  await (await feld("Steuernummer")).setValue("12/345/67890");
  await klick("Weiter"); // 1 → 2
  await klick("Weiter"); // 2 → 3
  await klick("Weiter"); // 3 → 4
  await klick("Einrichtung abschließen");
  await klick("Ersten Kunden anlegen");
  await (await $(".app-nav")).waitForDisplayed({ timeout: 20000 });
}

describe("Kaufmännische Gutschrift aus einer Rechnung", () => {
  it("richtet die Anwendung ein, falls nötig", async () => {
    await einrichtenFallsNoetig();
  });

  it("legt einen Kunden mit Rechnungsadresse an", async () => {
    await nav("Kunden");
    await formularOeffnen("Neuer Kunde", "Name");
    await (await feld("Name")).setValue("Rückvergütung AG");
    await klick("Speichern");

    // Zeile öffnen → Reiter „Adressen" ist beim Öffnen aktiv.
    await (await $('//td[contains(., "Rückvergütung AG")]')).waitForDisplayed({ timeout: 20000 });
    await (await $('//td[contains(., "Rückvergütung AG")]')).click();

    await (await feld("Straße")).waitForDisplayed({ timeout: 20000 });
    await (await feld("Straße")).setValue("Erstattungsweg 7");
    await (await feld("PLZ")).setValue("54321");
    await (await feld("Ort")).setValue("Gutstadt");
    await (await feld("Land")).setValue("DE");
    // Ohne Standardadresse lehnt das Stellen der Rechnung nach § 14 UStG ab —
    // und ebenso das Festschreiben der Gutschrift.
    await (await feld("Standardadresse")).click();
    await klick("Hinzufügen");
    await (await $('//td[normalize-space()="Ja"]')).waitForDisplayed({ timeout: 20000 });
  });

  it("stellt eine Rechnung mit einer Position", async () => {
    await nav("Rechnungen");
    await klick("Neue Rechnung");
    await (await feld("Kunde")).selectByVisibleText("Rückvergütung AG");
    await klick("Anlegen");

    await (await feld("Freitextposition")).waitForDisplayed({ timeout: 20000 });
    await (await feld("Freitextposition")).click();
    await (await feld("Bezeichnung")).setValue("Beratungsleistung");
    await (await feld("Einzelpreis")).setValue("119,00");
    await (await feld("Menge")).setValue("2");
    await klick("Position hinzufügen");
    await (await $('//td[contains(., "Beratungsleistung")]')).waitForDisplayed({ timeout: 20000 });

    await klick("Stellen");
    await dialogBestaetigen("Stellen");
    await expect(await $(".status")).toHaveText("Gestellt", { wait: 20000 });
  });

  it("erstellt aus der Rechnung einen Gutschrift-Entwurf mit übernommener Position", async () => {
    await klick("Gutschrift erstellen");

    // Der Editor wechselt in den neuen Gutschrift-Entwurf.
    await browser.waitUntil(
      async () => /Gutschrift/.test(await (await $("h1.seiten-kopf")).getText()),
      { timeout: 20000, timeoutMsg: "Der Gutschrift-Entwurf öffnet sich nicht." },
    );
    await expect(await $(".status")).toHaveText("Entwurf", { wait: 20000 });
    await expect(await $("p.beleg-bezug")).toHaveText(expect.stringContaining("Gutschrift zu Rechnung"));
    await (await $('//td[contains(., "Beratungsleistung")]')).waitForDisplayed({ timeout: 20000 });
  });

  it("kürzt die Position auf eine kleinere Menge", async () => {
    await (
      await $('//tr[contains(., "Beratungsleistung")]//button[normalize-space(text())="Bearbeiten"]')
    ).click();
    const menge = await feld("Menge");
    await menge.waitForDisplayed({ timeout: 20000 });
    await menge.setValue("1");
    await klick("Änderung speichern");
    await browser.waitUntil(
      async () => !(await $('//button[normalize-space(text())="Änderung speichern"]').isExisting()),
      { timeout: 20000, timeoutMsg: "Die Positionsänderung wird nicht gespeichert." },
    );
  });

  it("schreibt die Gutschrift fest — eigene Nummer GS-…, Status festgeschrieben", async () => {
    await klick("Festschreiben");
    await dialogBestaetigen("Festschreiben");
    await expect(await $(".status")).toHaveText("Festgeschrieben", { wait: 20000 });
    await browser.waitUntil(
      async () => /Gutschrift\s+GS-\d{4}-\d{4}/.test(await (await $("h1.seiten-kopf")).getText()),
      { timeout: 20000, timeoutMsg: "Die Gutschrift bekommt keine GS-Nummer." },
    );
  });

  it("bietet PDF- und XRechnung-Export für die festgeschriebene Gutschrift an", async () => {
    // Der Datei-Dialog des Betriebssystems ist über WebDriver nicht bedienbar;
    // geprüft wird, dass die Guards den Export einer Gutschrift zulassen.
    for (const name of ["Als PDF exportieren", "Als XRechnung (XML) exportieren"]) {
      const knopf = await $(`//button[@aria-label="${name}"]`);
      await knopf.waitForDisplayed({ timeout: 20000 });
      expect(await knopf.getAttribute("disabled")).toBeFalsy();
    }
  });

  it("zeigt die Gutschrift in der Liste mit negativem Betrag", async () => {
    await nav("Gutschriften");
    const zeile = await $('//tr[.//td[contains(., "GS-")]]');
    await zeile.waitForDisplayed({ timeout: 20000 });
    const betrag = await (await zeile.$("td.nicht-umbrechen:last-child")).getText();
    // de-DE stellt negative Beträge mit einem Minuszeichen voran (ASCII "-"
    // oder das typografische "−").
    expect(betrag).toMatch(/[-−]\s?\d/);
  });
});
