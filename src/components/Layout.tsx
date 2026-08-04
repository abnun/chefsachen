import type { ReactNode } from "react";

export type Seite =
  | "uebersicht"
  | "kunden"
  | "artikel"
  | "angebote"
  | "rechnungen"
  | "eingangsrechnungen"
  | "auswertung"
  | "einstellungen";

/*
 * Die Beschriftungen stehen hier unmittelbar. Es gab dafür ein Modul `i18n.ts`,
 * das aber nur diese sieben Einträge kannte — jeder andere sichtbare Text im
 * Programm war fest verdrahtet. Damit versprach es Übersetzbarkeit, die es
 * nicht gab, und verleitete dazu, sie für erledigt zu halten.
 *
 * Die Anwendung ist auf deutsches Steuerrecht zugeschnitten: § 19 UStG, GoBD,
 * XRechnung. Auch der Fachcode trägt durchgängig deutsche Bezeichner. Eine
 * zweite Sprache ist nicht vorgesehen; sollte sie einmal kommen, ist ein
 * eingeführtes Werkzeug die bessere Grundlage als sieben Schlüssel.
 */
interface NavEintrag {
  seite: Seite;
  label: string;
  icon: ReactNode;
}

const ICON_UEBERSICHT = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
    <rect x="11" y="2.5" width="6.5" height="4" rx="1" />
    <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
    <rect x="11" y="8.5" width="6.5" height="9" rx="1" />
  </svg>
);

const ICON_KUNDEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="6.5" r="3.2" />
    <path d="M3.5 17c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" strokeLinecap="round" />
  </svg>
);

const ICON_ARTIKEL = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 6.5 10 3l6 3.5v7L10 17l-6-3.5z" strokeLinejoin="round" />
    <path d="M4 6.5 10 10l6-3.5M10 10v7" strokeLinejoin="round" />
  </svg>
);

const ICON_ANGEBOTE = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7.5 11h5M7.5 13.5h5" strokeLinecap="round" />
  </svg>
);

const ICON_RECHNUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7.5 11.5h5M7.5 14h3" strokeLinecap="round" />
    <circle cx="14.5" cy="14.5" r="0.4" fill="currentColor" stroke="none" />
  </svg>
);

const ICON_EINGANGSRECHNUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
    <path d="M12 3v3h3" strokeLinejoin="round" />
    <path d="M7 12.5 8.5 14 13 9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_AUSWERTUNG = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M3.5 16.5V3.5M3.5 16.5h13" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.5 13.5v-4M10 13.5v-7M13.5 13.5v-2.5" strokeLinecap="round" />
  </svg>
);

const ICON_EINSTELLUNGEN = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2M14.9 5.1l-1.4 1.4M6.5 13.5l-1.4 1.4M14.9 14.9l-1.4-1.4M6.5 6.5 5.1 5.1" strokeLinecap="round" />
  </svg>
);

const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "uebersicht", label: "Übersicht", icon: ICON_UEBERSICHT },
  { seite: "kunden", label: "Kunden", icon: ICON_KUNDEN },
  { seite: "artikel", label: "Artikel & Leistungen", icon: ICON_ARTIKEL },
  { seite: "angebote", label: "Angebote", icon: ICON_ANGEBOTE },
  { seite: "rechnungen", label: "Rechnungen", icon: ICON_RECHNUNGEN },
  { seite: "eingangsrechnungen", label: "Eingangsrechnungen", icon: ICON_EINGANGSRECHNUNGEN },
  { seite: "auswertung", label: "Auswertung", icon: ICON_AUSWERTUNG },
  { seite: "einstellungen", label: "Einstellungen", icon: ICON_EINSTELLUNGEN },
];

interface LayoutProps {
  aktiveSeite: Seite;
  onNavigiere: (seite: Seite) => void;
  children: ReactNode;
}

/**
 * App-Layout mit fester linker Navigation und Content-Bereich. Kontrolliert
 * durch die Eltern-Komponente (App.tsx hält den Routing-State via useState) —
 * kein eigener Router, da bei fünf Seiten nicht nötig.
 */
export function Layout({ aktiveSeite, onNavigiere, children }: LayoutProps) {
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <ul className="app-nav-liste">
          {NAV_EINTRAEGE.map(({ seite, label, icon }) => (
            <li key={seite}>
              <button
                type="button"
                onClick={() => onNavigiere(seite)}
                aria-current={aktiveSeite === seite ? "page" : undefined}
                className="app-nav-eintrag"
              >
                <span className="app-nav-icon">{icon}</span>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
