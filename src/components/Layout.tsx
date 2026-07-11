import type { ReactNode } from "react";
import { t } from "../i18n";

export type Seite = "kunden" | "artikel" | "angebote" | "rechnungen" | "einstellungen";

interface NavEintrag {
  seite: Seite;
  label: string;
}

const NAV_EINTRAEGE: NavEintrag[] = [
  { seite: "kunden", label: t("nav.kunden") },
  { seite: "artikel", label: t("nav.artikel") },
  { seite: "angebote", label: t("nav.angebote") },
  { seite: "rechnungen", label: t("nav.rechnungen") },
  { seite: "einstellungen", label: t("nav.einstellungen") },
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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: "220px",
          flexShrink: 0,
          borderRight: "1px solid #ddd",
          padding: "1rem 0",
        }}
      >
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {NAV_EINTRAEGE.map(({ seite, label }) => (
            <li key={seite}>
              <button
                type="button"
                onClick={() => onNavigiere(seite)}
                aria-current={aktiveSeite === seite ? "page" : undefined}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.6rem 1.2rem",
                  border: "none",
                  background: aktiveSeite === seite ? "#e6e6e6" : "transparent",
                  fontWeight: aktiveSeite === seite ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ flex: 1, padding: "1.5rem" }}>{children}</main>
    </div>
  );
}
