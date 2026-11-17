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
