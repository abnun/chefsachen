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
}
