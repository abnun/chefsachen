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

// Der Weiter-unten-Pfeil hat seinen Zweck erfüllt, sobald jemand gescrollt
// hat — danach ist er nur noch ein Kreis, der über dem Text klebt. Ohne
// JavaScript bleibt er sichtbar; das ist harmlos, er verdeckt nichts
// Bedienbares und der Link führt trotzdem zum ersten Abschnitt.
const weiterHinweis = document.getElementById("weiter-hinweis");

if (weiterHinweis) {
  const SCHWELLE = 40;
  // Der zuletzt gesetzte Zustand, damit nicht bei jedem Scroll-Ereignis
  // dieselbe Klasse erneut geschrieben wird.
  let versteckt = null;

  function hinweisAktualisieren() {
    const sollVerstecken = window.scrollY > SCHWELLE;
    if (sollVerstecken === versteckt) return;
    versteckt = sollVerstecken;
    weiterHinweis.classList.toggle("versteckt", sollVerstecken);
  }

  window.addEventListener("scroll", hinweisAktualisieren, { passive: true });
  // Beim Laden schon gescrollt (Anker in der Adresse, wiederhergestellte
  // Position nach dem Zurückgehen): dann darf er gar nicht erst erscheinen.
  hinweisAktualisieren();
}
