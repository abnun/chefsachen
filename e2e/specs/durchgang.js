/**
 * Ein Durchgang durch die Anwendung, so wie ihn ein neuer Nutzer geht:
 * einrichten, Kunde, Artikel, Angebot, Position, festschreiben — und zuletzt
 * der Durchstich für die kaufmännische Gutschrift (Rechnung stellen →
 * „Gutschrift erstellen" → festschreiben → exportierbar → in der Liste mit
 * negativem Betrag).
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

/**
 * Öffnet ein Anlegeformular, falls es nicht schon offen ist.
 *
 * Der Assistent schickt nach „Ersten Kunden anlegen" direkt auf die
 * Kundenseite und klappt das Formular gleich auf. Ein Klick auf „Neuer Kunde"
 * hätte es dann wieder zugeklappt — der Knopf schaltet um, er öffnet nicht.
 */
async function formularOeffnen(knopfText, feldName) {
  const feldSchon = await feld(feldName);
  if (await feldSchon.isDisplayed().catch(() => false)) return;
  await klick(knopfText);
  await (await feld(feldName)).waitForDisplayed({ timeout: 20000 });
}

async function nav(ziel) {
  const k = await $(`//button[contains(@class,"app-nav-eintrag")][contains(., "${ziel}")]`);
  await k.waitForClickable({ timeout: 20000 });
  await k.click();
}

/**
 * Bestätigt den Bestätigungsdialog über den Knopf mit dem gegebenen Text.
 *
 * Im Dialog gesucht, nicht auf der Seite: Der auslösende Knopf trägt oft
 * denselben Text („Stellen", „Festschreiben") und liegt nach dem Öffnen unter
 * dem Overlay — ein Klick darauf ginge ins Leere (siehe „schreibt das Angebot
 * über den Dialog fest").
 */
async function dialogBestaetigen(knopfText) {
  const dialog = await $('[role="dialog"]');
  await dialog.waitForDisplayed({ timeout: 5000 });
  await (await dialog.$(`.//button[normalize-space(text())="${knopfText}"]`)).click();
  await browser.waitUntil(
    async () => !(await (await $('[role="dialog"]')).isDisplayed().catch(() => false)),
    { timeout: 10000, timeoutMsg: "Der Dialog bleibt nach dem Bestätigen offen." },
  );
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
    // Straße/PLZ/Ort sind seit der Pflichtfeld-Markierung auch backend-seitig
    // Pflicht (siehe pruefe_firma) — vorher ließ sich Schritt 1 mit Name und
    // Steuernummer allein abschließen.
    await (await feld("Straße")).setValue("Musterstraße 1");
    await (await feld("PLZ")).setValue("12345");
    await (await feld("Ort")).setValue("Musterstadt");
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
    await formularOeffnen("Neuer Kunde", "Name");
    await (await feld("Name")).setValue("Lanius Natur");
    await klick("Speichern");
    await (await $('//td[contains(., "Lanius Natur")]')).waitForDisplayed({ timeout: 20000 });
  });

  it("legt einen Artikel an", async () => {
    await nav("Artikel");
    await formularOeffnen("Neuer Artikel", "Bezeichnung");
    await (await feld("Bezeichnung")).setValue("Homepage-Erweiterung");
    // Die Einheit ist Pflicht — ohne sie blockt der Browser das Absenden, und
    // der Klick auf „Speichern" täte wortlos nichts.
    await (await feld("Einheit")).selectByVisibleText("Stunde (Std.)");
    await (await feld("Standardpreis")).setValue("39,00");
    await klick("Speichern");
    await (await $('//td[contains(., "Homepage-Erweiterung")]')).waitForDisplayed({
      timeout: 20000,
    });
  });

  it("legt ein Angebot mit einer Position an", async () => {
    await nav("Angebote");
    await klick("Neues Angebot");
    // Ohne Kunde lehnt das Anlegen ab — der Beleg braucht ihn für den
    // Snapshot, der beim Festschreiben eingefroren wird.
    await (await feld("Kunde")).selectByVisibleText("Lanius Natur");
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
    // Genau hier hakte es lange, und zwar an einer Stelle, die kein Klick
    // aufdeckt: Die Kopfleiste stand außerhalb des Fensters (siehe unten).
    const knopf = await $('//button[normalize-space(text())="Festschreiben"]');
    await knopf.waitForDisplayed({ timeout: 20000 });

    // Ein deaktivierter Knopf lässt sich anklicken, ohne dass etwas geschieht —
    // WebdriverIO meldet das nicht. Ohne diese Prüfung scheiterte der Test
    // später am fehlenden Dialog und verschwieg den Grund.
    if (await knopf.getAttribute("disabled")) {
      throw new Error(`Festschreiben-Knopf ist abgeblendet: ${await knopf.getAttribute("title")}`);
    }

    /*
     * Nichts darf über den rechten Fensterrand hinausragen.
     *
     * Genau daran scheiterte dieser Durchgang lange: Die Kopfleiste stand bei
     * schmalem Fenster außerhalb, weil eine breite Tabelle die Seite aufzog.
     * Der Knopf war anklickbar und ohne Wirkung — keine Meldung, nichts. Ein
     * Klick prüft das nicht, diese Zusicherung schon.
     */
    const lage = await browser.execute(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.textContent.trim() === "Festschreiben",
      );
      const r = b.getBoundingClientRect();
      return {
        // Waagerecht scrollt allenfalls eine breite Tabelle in ihrem eigenen
        // Bereich — das Dokument selbst nie.
        dokumentBreiter: document.documentElement.scrollWidth > window.innerWidth + 1,
        knopfDraussen: r.right > window.innerWidth + 1 || r.left < 0,
      };
    });
    if (lage.dokumentBreiter) throw new Error("Das Dokument scrollt waagerecht.");
    if (lage.knopfDraussen) throw new Error("Der Festschreiben-Knopf liegt außerhalb des Fensters.");

    await knopf.click();
    const dialog = await $('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 5000 });
    // Im Dialog, nicht auf der Seite: Beide Knöpfe heißen „Festschreiben", und
    // der auf der Seite liegt jetzt unter dem Overlay.
    await (await dialog.$('.//button[normalize-space(text())="Festschreiben"]')).click();
    await browser.waitUntil(
      async () => !(await (await $('[role="dialog"]')).isDisplayed().catch(() => false)),
      { timeout: 10000, timeoutMsg: "Der Dialog bleibt nach dem Bestätigen offen." },
    );
    // Festgeschrieben heißt: eine Nummer, und der Knopf ist fort.
    await browser.waitUntil(
      async () => !(await $('//button[normalize-space(text())="Festschreiben"]').isExisting()),
      { timeout: 10000, timeoutMsg: "Festschreiben-Knopf ist nach dem Festschreiben noch da." },
    );

    await expect(await $(".status")).toHaveText("Festgeschrieben", { wait: 20000 });
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

  /*
   * Ab hier: der Durchstich für die kaufmännische Gutschrift (v1.4.0).
   *
   * Bewusst hier angehängt statt in einer eigenen Spec-Datei: Beide Dateien
   * liefen gegen denselben Datenordner (die Anwendung legt ihre Datenbank unter
   * HOME an, `tauri-driver` erbt HOME beim Start). Eine zweite Datei fand dann
   * keine Ersteinrichtung mehr vor, und ihr `einrichten`-Schutz scheiterte an
   * „Übersicht 2026" statt „Ersteinrichtung" — aus einem Grund, der nichts mit
   * ihrem Gegenstand zu tun hatte. Deshalb baut dieser Teil auf dem Zustand
   * auf, den die Fälle oben hinterlassen: Firma eingerichtet, Kunde „Lanius
   * Natur" (noch ohne Adresse), Artikel „Homepage-Erweiterung".
   *
   * Der Datei-Export lässt sich hier nicht zu Ende prüfen: `save()` öffnet
   * einen Datei-Dialog des Betriebssystems, den WebDriver nicht bedient.
   * Geprüft wird, dass die Export-Knöpfe für eine festgeschriebene Gutschrift
   * angeboten und nicht abgeblendet sind. Die Normkonformität der XRechnung
   * (TypeCode 381) deckt der KoSIT-Test in `xrechnung.rs` ab.
   */
  it("gibt „Lanius Natur“ eine Standard-Rechnungsadresse", async () => {
    // § 14 UStG verlangt die vollständige Anschrift des Leistungsempfängers.
    // Ohne Standardadresse lehnt das Backend sowohl „Rechnung stellen" als
    // auch „Gutschrift festschreiben" ab.
    await nav("Kunden");
    await (await $('//td[contains(., "Lanius Natur")]')).click();
    await klick("Adressen");

    await (await feld("Straße")).waitForDisplayed({ timeout: 20000 });
    await (await feld("Straße")).setValue("Erstattungsweg 7");
    await (await feld("PLZ")).setValue("54321");
    await (await feld("Ort")).setValue("Gutstadt");
    await (await feld("Land")).setValue("DE");
    await (await feld("Standardadresse")).click();
    await klick("Hinzufügen");
    // Die Standard-Spalte der Adresstabelle steht dann auf „Ja".
    await (await $('//td[normalize-space()="Ja"]')).waitForDisplayed({ timeout: 20000 });
  });

  it("stellt eine Rechnung mit einer Position", async () => {
    await nav("Rechnungen");
    await klick("Neue Rechnung");
    await (await feld("Kunde")).selectByVisibleText("Lanius Natur");
    await klick("Anlegen");

    // Derselbe erprobte Weg wie beim Angebot oben: Artikel über die Tipphilfe,
    // nicht als Freitextposition.
    const artikel = await feld("Artikel");
    await artikel.waitForDisplayed({ timeout: 20000 });
    await artikel.setValue("Homepage-Erweiterung");
    await (await feld("Menge")).setValue("2");
    await klick("Position hinzufügen");
    await (await $('//td[contains(., "Homepage-Erweiterung")]')).waitForDisplayed({ timeout: 20000 });

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
    await expect(await $("p.beleg-bezug")).toHaveText(
      expect.stringContaining("Gutschrift zu Rechnung"),
    );
    await (await $('//td[contains(., "Homepage-Erweiterung")]')).waitForDisplayed({ timeout: 20000 });
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
    // geprüft wird, dass die gelockerten Guards (Rechnung *oder* Gutschrift)
    // den Export einer Gutschrift zulassen.
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
