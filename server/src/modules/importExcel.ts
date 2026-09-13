import ExcelJS from "exceljs";

export const PERSON_HEADERS = [
  "Nem (F/N)",
  "Vezetéknév",
  "Keresztnév",
  "Település",
  "Utca",
  "Házszám",
  "Születési dátum (ÉÉÉÉ-HH-NN)",
  "Születési hely",
  "Vallás",
  "Keresztelés dátuma (ÉÉÉÉ-HH-NN)",
  "Keresztelés helye",
  "Keresztszülők",
  "Konfirmáció dátuma (ÉÉÉÉ-HH-NN)",
  "Konfirmáció helye",
  "Házastárs vezetékneve",
  "Házastárs keresztneve",
  "Esketés dátuma (ÉÉÉÉ-HH-NN)",
  "Esketés helye",
  "Esketés lelkésze",
  "Honnan költözött (ha nem ide született)",
  "Megjegyzés",
];

export const CEMETERY_HEADERS = [
  "Nem (F/N)",
  "Vezetéknév",
  "Keresztnév",
  "Település",
  "Utca",
  "Házszám",
  "Születési dátum (ÉÉÉÉ-HH-NN)",
  "Elhalálozás dátuma (ÉÉÉÉ-HH-NN)",
  "Temetés dátuma (ÉÉÉÉ-HH-NN)",
  "Megjegyzés",
];

function buildTemplate(
  title: string,
  headers: string[],
  exampleRow: (string | number)[]
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Adatok");

  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { wrapText: true };
  sheet.getRow(1).height = 30;

  const headerRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6D5" } };
  });

  const exRow = sheet.getRow(3);
  exampleRow.forEach((v, i) => {
    exRow.getCell(i + 1).value = v;
  });
  exRow.font = { italic: true, color: { argb: "FF888888" } };

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  return workbook;
}

export function buildPersonTemplate(): ExcelJS.Workbook {
  return buildTemplate(
    "Töltse ki soronként egy-egy személlyel (a 3. sor csak példa, azt törölje vagy írja felül). Az adatokat a 4. sortól olvassa be a rendszer. A cím alapján automatikusan csoportosulnak a háztartások. Ha a házastárs neve kitöltve van és ő is szerepel a táblázat egy másik sorában (vagy már a rendszerben), a rendszer megpróbálja automatikusan összekapcsolni őket.",
    PERSON_HEADERS,
    [
      "F",
      "Kovács",
      "János",
      "Mintafalva",
      "Fő utca",
      "12",
      "1980-05-14",
      "Mintafalva",
      "református",
      "1980-06-01",
      "Mintafalva",
      "Nagy Béla, Nagy Ilona",
      "1994-05-10",
      "Mintafalva",
      "Kovács",
      "Mária",
      "2005-09-03",
      "Mintafalva",
      "Kovács Endre lelkész",
      "",
      "",
    ]
  );
}

export function buildCemeteryTemplate(): ExcelJS.Workbook {
  return buildTemplate(
    "Elhunytak rögzítése. Töltse ki soronként (a 3. sor csak példa, azt törölje vagy írja felül). Az adatokat a 4. sortól olvassa be a rendszer.",
    CEMETERY_HEADERS,
    ["F", "Kovács", "János", "Mintafalva", "Fő utca", "12", "1950-05-14", "2026-01-10", "2026-01-12", ""]
  );
}

export interface ParsedPersonRow {
  nem: "FERFI" | "NO";
  vezeteknev: string;
  keresztnev: string;
  telepules: string;
  utca: string;
  hazszam: string;
  szuletesiDatum: string | null;
  szuletesiHely: string | null;
  vallas: string | null;
  keresztelesDatuma: string | null;
  keresztelesHelye: string | null;
  keresztszulok: string | null;
  konfirmacioDatuma: string | null;
  konfirmacioHelye: string | null;
  hazastarsVezeteknev: string | null;
  hazastarsKeresztnev: string | null;
  esketesDatuma: string | null;
  esketesHelye: string | null;
  esketesLelkesze: string | null;
  koltozottHonnan: string | null;
  megjegyzes: string | null;
  rowNumber: number;
}

export interface ParsedCemeteryRow {
  nem: "FERFI" | "NO";
  vezeteknev: string;
  keresztnev: string;
  telepules: string | null;
  utca: string | null;
  hazszam: string | null;
  szuletesiDatum: string | null;
  elhalalozasDatuma: string | null;
  temetesDatuma: string | null;
  megjegyzes: string | null;
  rowNumber: number;
}

function cellToDateString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const m2 = s.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
    if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
    return null;
  }
  return null;
}

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

export async function parsePersonWorkbook(buffer: Buffer): Promise<ParsedPersonRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const rows: ParsedPersonRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 4) return; // 1: cím, 2: fejléc, 3: példa
    const nem = cellToString(row.getCell(1).value);
    const vezeteknev = cellToString(row.getCell(2).value);
    const keresztnev = cellToString(row.getCell(3).value);
    const telepules = cellToString(row.getCell(4).value);
    const utca = cellToString(row.getCell(5).value);
    const hazszam = cellToString(row.getCell(6).value);
    if (!vezeteknev || !keresztnev || !telepules || !utca || !hazszam) return;
    if (nem?.toUpperCase() !== "F" && nem?.toUpperCase() !== "N") return;

    rows.push({
      nem: nem.toUpperCase() === "F" ? "FERFI" : "NO",
      vezeteknev,
      keresztnev,
      telepules,
      utca,
      hazszam,
      szuletesiDatum: cellToDateString(row.getCell(7).value),
      szuletesiHely: cellToString(row.getCell(8).value),
      vallas: cellToString(row.getCell(9).value),
      keresztelesDatuma: cellToDateString(row.getCell(10).value),
      keresztelesHelye: cellToString(row.getCell(11).value),
      keresztszulok: cellToString(row.getCell(12).value),
      konfirmacioDatuma: cellToDateString(row.getCell(13).value),
      konfirmacioHelye: cellToString(row.getCell(14).value),
      hazastarsVezeteknev: cellToString(row.getCell(15).value),
      hazastarsKeresztnev: cellToString(row.getCell(16).value),
      esketesDatuma: cellToDateString(row.getCell(17).value),
      esketesHelye: cellToString(row.getCell(18).value),
      esketesLelkesze: cellToString(row.getCell(19).value),
      koltozottHonnan: cellToString(row.getCell(20).value),
      megjegyzes: cellToString(row.getCell(21).value),
      rowNumber,
    });
  });

  return rows;
}

export async function parseCemeteryWorkbook(buffer: Buffer): Promise<ParsedCemeteryRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const rows: ParsedCemeteryRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 4) return;
    const nem = cellToString(row.getCell(1).value);
    const vezeteknev = cellToString(row.getCell(2).value);
    const keresztnev = cellToString(row.getCell(3).value);
    if (!vezeteknev || !keresztnev) return;
    if (nem?.toUpperCase() !== "F" && nem?.toUpperCase() !== "N") return;

    rows.push({
      nem: nem.toUpperCase() === "F" ? "FERFI" : "NO",
      vezeteknev,
      keresztnev,
      telepules: cellToString(row.getCell(4).value),
      utca: cellToString(row.getCell(5).value),
      hazszam: cellToString(row.getCell(6).value),
      szuletesiDatum: cellToDateString(row.getCell(7).value),
      elhalalozasDatuma: cellToDateString(row.getCell(8).value),
      temetesDatuma: cellToDateString(row.getCell(9).value),
      megjegyzes: cellToString(row.getCell(10).value),
      rowNumber,
    });
  });

  return rows;
}
