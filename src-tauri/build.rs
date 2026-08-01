fn main() {
    // sqlx::migrate! ist ein Proc-Macro und kann Cargo auf stable nicht mitteilen,
    // dass es das migrations-Verzeichnis eingelesen hat. Ohne diese Zeile wird eine
    // neu hinzugefügte Migration bei einem inkrementellen Build stillschweigend
    // ignoriert — der Code läuft dann gegen ein Schema, das er nicht erwartet.
    println!("cargo:rerun-if-changed=migrations");

    tauri_build::build()
}
