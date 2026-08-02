import { statusKlasse, statusLabel } from "../belegStatus";

/** Farbige Marke mit der Beschriftung eines Belegstatus. */
export function StatusMarke({ status }: { status: string }) {
  return <span className={`status ${statusKlasse(status)}`}>{statusLabel(status)}</span>;
}
