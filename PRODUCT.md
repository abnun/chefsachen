# Product

## Register

product

## Users

Solo-Selbstständige und Kleinunternehmer in Deutschland: Freiberufler,
Einzelunternehmer, kleine Betriebe ohne eigene Buchhaltung. Sie schreiben ein
paar Belege im Monat, meist am Schreibtisch am Mac oder Windows-PC, oft
zwischen zwei Aufträgen oder abends. Sie sind keine Buchhaltungsprofis und
wollen es auch nicht werden. Der Job: einen rechtssicheren Beleg erstellen,
festschreiben, exportieren, den Zahlungseingang festhalten und im Blick
behalten, ob die Kleinunternehmergrenze naht.

## Product Purpose

Chefsachen erstellt Rechnungen, Angebote und Gutschriften mit allen
Pflichtangaben nach § 14 UStG, gibt sie als PDF/A-3b und als E-Rechnung
(XRechnung, ZUGFeRD) aus und archiviert eingehende E-Rechnungen
unveränderlich. Alles bleibt lokal: kein Server, kein Konto, keine Cloud.
Erfolg heißt: Der Nutzer erledigt seine Belege in Minuten, versteht jederzeit,
in welchem Zustand ein Beleg ist, und muss nie fürchten, etwas Unzulässiges
getan zu haben. Vertrieb kostenlos über GitHub, den Mac App Store und den
Microsoft Store.

## Brand Personality

Ruhig, verlässlich, sachlich-freundlich. Fühlt sich an wie eine Apple-eigene
App (Numbers, Mail, Systemeinstellungen): systemkonform, mit Seitenleiste,
Systemschrift und Hell/Dunkel nach Systemeinstellung. Amtlich korrekt, ohne
Behördencharme. Die Sprache ist direkt und ehrlich; sie verspricht nichts, was
die App nicht tut („Verschickt wird nichts").

## Anti-references

- SaaS-Buchhaltung à la Lexoffice/sevDesk: bunte Kennzahlen-Kacheln,
  Upsell-Banner, Onboarding-Konfetti, Marketing im Produkt.
- Behörden-/ELSTER-Look: graue Formularwüsten, Tabellen ohne Hierarchie.
- DATEV-/Windows-95-Fachsoftware: dichte Toolbar-Wüsten, veraltete Optik.
- Generisches Web-App-Design (Tailwind/shadcn-Einheitslook), das nicht wie
  eine native Desktop-App wirkt.

## Design Principles

1. **Nativ vor eigenwillig.** Wo macOS (bzw. Windows) eine Konvention hat,
   folgt die App ihr: Seitenleiste, Fensterleiste, Tastenkürzel, Fokus,
   Hell/Dunkel. Eigenes Design nur dort, wo das System nichts vorgibt.
2. **Zustand ist sichtbar.** Entwurf, festgeschrieben, gestellt, bezahlt,
   storniert: Der Nutzer sieht immer, was mit einem Beleg noch geht und was
   nicht mehr.
3. **Ruhe vor Reiz.** Keine Kennzahlen-Show, keine Dekoration. Farbe trägt
   Bedeutung (Status, Warnung), sonst nichts.
4. **Ehrlich in jedem Wort.** Texte sagen genau, was passiert, auch wenn es
   unbequem ist. Keine Zustellillusion, keine Steuerberatung.
5. **Rechtssicherheit ohne Angst.** Pflichtangaben und Grenzen werden
   erklärt, nicht angedroht.

## Accessibility & Inclusion

WCAG 2.2 AA: Textkontraste ≥ 4,5:1 (bereits per `kontrast.test.ts`
abgesichert), vollständige Tastaturbedienung, sichtbarer Fokus,
`prefers-reduced-motion` respektieren. Vollständiger Dunkelmodus nach
Systemeinstellung ist Pflicht. Status nie allein über Farbe vermitteln.
