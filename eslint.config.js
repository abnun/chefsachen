import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * ESLint für den Frontend-Teil.
 *
 * `tsc` prüft Typen, nicht Gebrauch. Die Regeln hier fangen, was dabei
 * durchrutscht — vor allem die Abhängigkeitslisten von `useEffect` und
 * `useCallback`. Genau daran hing in diesem Projekt schon ein Fehler: Ein
 * Effekt las einen Zustand, den er nicht als Abhängigkeit führte.
 *
 * Bewusst schmal gehalten: Regeln, die nur Geschmack abbilden, erzeugen
 * Änderungen ohne Erkenntnisgewinn und stumpfen den Blick für die ab, die
 * etwas bedeuten.
 */
export default tseslint.config(
  {
    // `.worktrees` enthält Arbeitskopien mit fremdem Code — 2962 Befunde, die
    // nichts über dieses Projekt aussagen und den Blick auf die sieben echten
    // verstellen.
    ignores: [
      "dist/",
      "src-tauri/",
      "node_modules/",
      "e2e/node_modules/",
      ".worktrees/",
      "coverage/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Aus: Die Regel stammt aus dem Regelsatz des React-Compilers und zielt
      // auf einen zusätzlichen Renderdurchlauf. Alle fünf Fundstellen sind das
      // übliche „Formularzustand zurücksetzen, wenn sich die Vorlage ändert" —
      // korrekt und in Reacts eigener Dokumentation beschrieben. Als Fehler
      // gemeldet, ginge die Prüfung nie durch und würde bald ignoriert; das
      // wäre teurer als der eine Durchlauf.
      "react-hooks/set-state-in-effect": "off",

      // Ein nicht benutzter Wert ist meist ein Rest einer Umbauarbeit. Mit
      // Unterstrich beginnende Namen bleiben erlaubt — sie sagen „absichtlich
      // ungenutzt", etwa beim Zerlegen von Tupeln.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Die Landingpage ist reines Browser-JavaScript ohne Modulsystem.
    files: ["website/**/*.js"],
    languageOptions: {
      globals: {
        document: "readonly",
        navigator: "readonly",
      },
    },
  },
  {
    // Der Durchstich läuft in Node und im Browser zugleich: `wdio.conf.js` ist
    // ein Node-Modul, die Testfälle laufen im Fenster der Anwendung und nutzen
    // die Globals von WebdriverIO und Mocha.
    files: ["e2e/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        setTimeout: "readonly",
        console: "readonly",
        describe: "readonly",
        it: "readonly",
        browser: "readonly",
        expect: "readonly",
        $: "readonly",
        window: "readonly",
        document: "readonly",
      },
    },
  },
  {
    // In Tests ist `any` beim Nachbauen von Fremdtypen manchmal der ehrlichste
    // Weg; der Aufwand einer vollständigen Nachbildung brächte dort nichts.
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
