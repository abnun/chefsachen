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
