// Vertauscht Haupt- und Alternativ-Download, wenn Windows erkannt wird.
// Vorgabe im HTML ist macOS als Haupt-Button — für macOS oder ein nicht
// erkanntes System (z. B. Linux, wofür es keinen Build gibt) bleibt das
// so; es wird nie etwas entfernt, nur bei Windows vertauscht. Dadurch
// gibt es in jedem Zustand genau zwei Links, nie eine Dopplung.
function erkanntesBetriebssystem() {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos";
  return null;
}

function hervorheben(os) {
  if (os !== "windows") return;

  const primaer = document.getElementById("download-primaer");
  const sekundaer = document.getElementById("download-sekundaer");
  if (!primaer || !sekundaer) return;

  const primaerHref = primaer.href;
  primaer.href = sekundaer.href;
  primaer.textContent = "Für Windows herunterladen";
  sekundaer.href = primaerHref;
  sekundaer.textContent = "macOS-Version herunterladen";
}

hervorheben(erkanntesBetriebssystem());

// Aus der zerlegten E-Mail-Adresse einen anklickbaren Link machen. Das @
// selbst steht nur im Stylesheet (siehe `.mail-at`), damit ein Sammler im
// Quelltext kein `etwas@etwas.de` findet. Ohne JavaScript bleibt die
// Adresse trotzdem vollständig lesbar — sie ist dann nur nicht klickbar.
for (const feld of document.querySelectorAll(".mail")) {
  const benutzer = feld.querySelector(".mail-benutzer");
  const anbieter = feld.querySelector(".mail-anbieter");
  if (!benutzer || !anbieter) continue;

  const adresse = `${benutzer.textContent.trim()}@${anbieter.textContent.trim()}`;
  const link = document.createElement("a");
  link.href = `mailto:${adresse}`;
  link.textContent = adresse;
  feld.replaceChildren(link);
}

// Der Weiter-unten-Pfeil bleibt sichtbar, solange es tatsächlich noch
// weitergeht, und verschwindet erst am Seitenende. Ohne JavaScript bleibt er
// stehen; das ist harmlos, er verdeckt nichts Bedienbares und der Link führt
// trotzdem zum ersten Abschnitt.
const weiterHinweis = document.getElementById("weiter-hinweis");

if (weiterHinweis) {
  // Ein paar Pixel Spielraum: Auf manchen Geräten bleibt beim Scrollen bis
  // ganz nach unten ein Rest von unter einem Pixel stehen, und der Pfeil
  // flackerte dann am Ende.
  const RESTHOEHE = 24;
  // Der zuletzt gesetzte Zustand, damit nicht bei jedem Scroll-Ereignis
  // dieselbe Klasse erneut geschrieben wird.
  let versteckt = null;

  function hinweisAktualisieren() {
    const rest =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    const sollVerstecken = rest <= RESTHOEHE;
    if (sollVerstecken === versteckt) return;
    versteckt = sollVerstecken;
    weiterHinweis.classList.toggle("versteckt", sollVerstecken);
  }

  window.addEventListener("scroll", hinweisAktualisieren, { passive: true });
  // Ein schmaleres Fenster ändert die Höhe des Inhalts und damit, ob überhaupt
  // noch etwas kommt.
  window.addEventListener("resize", hinweisAktualisieren, { passive: true });
  // Beim Laden: Passt alles ohne Scrollen auf den Schirm, wäre der Pfeil von
  // Anfang an eine Lüge.
  hinweisAktualisieren();

  // Der Pfeil führt jeweils zum nächsten Abschnitt unterhalb des Fensters,
  // nicht immer zu demselben. Im HTML steht ein fester Anker auf den ersten
  // Abschnitt — der bleibt die Rückfallebene ohne JavaScript, taugt aber
  // nicht für den zweiten Klick: Dort ist man dann schon.
  weiterHinweis.addEventListener("click", (e) => {
    const naechster = [...document.querySelectorAll("main > section, footer")].find(
      // Ein paar Pixel Spielraum, damit der Abschnitt, an dessen Oberkante
      // man gerade steht, nicht erneut angesteuert wird.
      (el) => el.getBoundingClientRect().top > 8,
    );
    if (!naechster) return;
    e.preventDefault();
    const sanft = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    naechster.scrollIntoView({ behavior: sanft ? "smooth" : "auto", block: "start" });
  });
}
