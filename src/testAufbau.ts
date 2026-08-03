/**
 * Ergänzungen der Testumgebung.
 *
 * jsdom bildet kein Layout ab und kennt deshalb `scrollIntoView` nicht. Ohne
 * diese Attrappe scheitert jeder Test, in dem eine Fehlermeldung erscheint —
 * an einer fehlenden Funktion, nicht an der Sache.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
