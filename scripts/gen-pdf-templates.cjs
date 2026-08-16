#!/usr/bin/env node
/** Generates the two landing Download-Hub PDF templates (fleet audit, DPA/AVV). */
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "public", "templates");

function esc(s) {
  return s.split("\\").join("\\\\").split("(").join("\\(").split(")").join("\\)");
}

function pdf(title, lines) {
  let content = "BT\n/F2 20 Tf\n60 780 Td\n(" + esc(title) + ") Tj\nET\n";
  let y = 745;
  for (const [font, size, text] of lines) {
    content += "BT\n/" + font + " " + size + " Tf\n60 " + y + " Td\n(" + esc(text) + ") Tj\nET\n";
    y -= size + 6;
  }
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objs[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 4 0 R >> >> /Contents 6 0 R >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objs[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objs[6] = "<< /Length " + Buffer.byteLength(content) + " >>\nstream\n" + content + "endstream";
  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i <= 6; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += i + " 0 obj\n" + objs[i] + "\nendobj\n";
  }
  const xref = Buffer.byteLength(out);
  out += "xref\n0 7\n0000000000 65535 f \n";
  for (let i = 1; i <= 6; i++) out += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  out += "trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
  return Buffer.from(out, "latin1");
}

const audit = pdf("BusCommand Fleet Audit Checklist v1", [
  ["F1", 11, "Fahrzeugdaten / Vehicle data"],
  ["F1", 10, "1.1  Kennzeichen und Busnummern vollstaendig erfasst                     [ ] Ja  [ ] Nein"],
  ["F1", 10, "1.2  Betriebsstatus (Aktiv / Reserve / Ausfall) aktuell                  [ ] Ja  [ ] Nein"],
  ["F1", 10, "1.3  Gruppen- und Linienzuordnung geprueft                              [ ] Ja  [ ] Nein"],
  ["F1", 11, "Dienstplan / Duty plan"],
  ["F1", 10, "2.1  Monatsplan je Gruppe veroeffentlicht                               [ ] Ja  [ ] Nein"],
  ["F1", 10, "2.2  Alle Schichten mit Fahrern abgedeckt                               [ ] Ja  [ ] Nein"],
  ["F1", 10, "2.3  Ferien- und Ausfalltage geplant                                    [ ] Ja  [ ] Nein"],
  ["F1", 11, "Fahrerbestaetigungen / Driver confirmations"],
  ["F1", 10, "3.1  Offene Bestaetigungen unter 5 Prozent                              [ ] Ja  [ ] Nein"],
  ["F1", 10, "3.2  Erinnerungen aktiviert                                             [ ] Ja  [ ] Nein"],
  ["F1", 11, "Compliance & Dokumente / Compliance"],
  ["F1", 10, "4.1  DPA/AVV mit allen Dienstleistern abgeschlossen                     [ ] Ja  [ ] Nein"],
  ["F1", 10, "4.2  Rollen und Rechte (CA/Dispo/Fahrer) geprueft                        [ ] Ja  [ ] Nein"],
  ["F1", 10, "4.3  Loeschfristen und Datenaufbewahrung dokumentiert                    [ ] Ja  [ ] Nein"],
  ["F2", 10, "BusCommand - Fleet Audit Template - v1 - 2026"],
]);

const dpa = pdf("BusCommand DPA / AVV - Art. 28 DSGVO Template v1", [
  ["F1", 11, "1. Vertragsparteien / Parties"],
  ["F1", 10, "Verantwortlicher / Controller: [Firma, Anschrift]"],
  ["F1", 10, "Auftragsverarbeiter / Processor: [Firma, Anschrift]"],
  ["F1", 11, "2. Gegenstand und Dauer / Subject and duration"],
  ["F1", 10, "Gegenstand: SaaS Fleet-Operations-Plattform BusCommand (Planung, Disposition, Fahrerbestaetigungen)."],
  ["F1", 10, "Dauer: [Startdatum] bis [Enddatum/Kuendigung]."],
  ["F1", 11, "3. Art und Zweck / Nature and purpose"],
  ["F1", 10, "Verarbeitung von Stamm- und Planungsdaten auf Basis der Weisung des Verantwortlichen."],
  ["F1", 11, "4. Pflichten des Auftragsverarbeiters / Processor obligations"],
  ["F1", 10, "4.1 Verarbeitung nur auf dokumentierte Weisung (Art. 28 Abs. 3a DSGVO)."],
  ["F1", 10, "4.2 Vertraulichkeit: alle Personen zur Verschwiegenheit verpflichtet."],
  ["F1", 10, "4.3 TOM: Ver- und Entschluesselung, Zugangssteuerung, Logging, Backup (Art. 32 DSGVO)."],
  ["F1", 10, "4.4 Unterauftragsverarbeiter nur mit vorheriger schriftlicher Genehmigung."],
  ["F1", 10, "4.5 Unterstuetzung bei Auskunfts- und Loeschanfragen der Betroffenen."],
  ["F1", 11, "5. Kontrollrechte / Audit rights"],
  ["F1", 10, "Der Verantwortliche darf die Einhaltung der TOM jederzeit pruefen oder pruefen lassen."],
  ["F1", 11, "6. Ort der Verarbeitung / Place of processing"],
  ["F1", 10, "Rechenzentren in der EU. Keine Uebermittlung in Drittlaender ohne Genehmigung."],
  ["F1", 11, "7. Rueckgabe und Loeschung / Return and deletion"],
  ["F1", 10, "Nach Ende: Loeschung aller Daten binnen 30 Tagen, soweit keine gesetzlichen Pflichten bestehen."],
  ["F1", 11, "8. Signaturen / Signatures"],
  ["F1", 10, "Verantwortlicher: ____________________  Datum: ____________"],
  ["F1", 10, "Auftragsverarbeiter: __________________  Datum: ____________"],
  ["F2", 10, "BusCommand - DPA/AVV Template (nicht unterzeichnete Vorlage) - v1 - 2026"],
]);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, "BusCommand_Fleet_Audit_Checklist_v1.pdf"), audit);
fs.writeFileSync(path.join(OUT_DIR, "BusCommand_DPA_AVV_v1.pdf"), dpa);
console.log("wrote BusCommand_Fleet_Audit_Checklist_v1.pdf", audit.length, "bytes");
console.log("wrote BusCommand_DPA_AVV_v1.pdf", dpa.length, "bytes");
