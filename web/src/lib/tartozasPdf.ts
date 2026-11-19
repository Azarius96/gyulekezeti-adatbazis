/** A tartozók nyomtatható (PDF-be menthető) kimutatása: összesítő, a részben fizetők nyugtaszámmal és dátummal, majd az összes tartozó cím szerint. */
interface PdfEv {
  ev: number;
  esedekesOsszeg: number;
  fizetve: number;
  hianyzo: number;
  becsult: boolean;
  befizetesek: { osszeg: number; datum: string; nyugta: string | null }[];
}
export interface PdfTartozo {
  personId: string;
  nev: string;
  cim: string;
  gyulekezetNev: string;
  korabbiTartozas: number;
  osszesTartozas: number;
  evek: PdfEv[];
}

const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => HTML_ESC[c]);
const lej = (n: number) => `${Math.round(n).toLocaleString("hu-HU")} lej`;
const szam = (n: number) => Math.round(n).toLocaleString("hu-HU");
/** Az évzáró dátum (dec. 31.) a korábbi bevitelek helyettesítő dátuma volt - azt nem tüntetjük fel valódi befizetési napként. */
const datum = (iso: string) => (iso.slice(5, 10) === "12-31" ? "dátum nincs rögzítve" : iso.slice(0, 10));
const haz = (cim: string) => {
  const m = cim.match(/(\d+)/);
  return m ? Number(m[1]) : 0;
};

export function tartozasPdf(tartozok: PdfTartozo[], evTol: number, evIg: number, gyulekezetNev: string, tobbGyulekezet: boolean) {
  const evek = Array.from({ length: evIg - evTol + 1 }, (_, i) => evTol + i).filter((ev) => tartozok.some((t) => t.evek.some((e) => e.ev === ev)));
  const evOsszeg = (ev: number) => tartozok.reduce((s, t) => s + (t.evek.find((e) => e.ev === ev)?.hianyzo ?? 0), 0);
  const nyito = tartozok.reduce((s, t) => s + t.korabbiTartozas, 0);
  const osszes = tartozok.reduce((s, t) => s + t.osszesTartozas, 0);
  const kelt = new Date().toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });

  const befizetesSor = (e: PdfEv) =>
    e.befizetesek.map((b) => `${datum(b.datum)} · ${b.nyugta ? `nyugta ${esc(b.nyugta)}` : "nyugtaszám nincs rögzítve"} · ${lej(b.osszeg)}`).join("<br>");

  const reszben = tartozok
    .flatMap((t) => t.evek.filter((e) => e.fizetve > 0).map((e) => ({ t, e })))
    .sort((a, b) => a.e.ev - b.e.ev || a.t.cim.localeCompare(b.t.cim, "hu") || haz(a.t.cim) - haz(b.t.cim) || a.t.nev.localeCompare(b.t.nev, "hu"));
  const reszbenHtml = reszben.length
    ? `<h2>1. Részben fizettek (részletfizetés) – nyugtaszámmal és dátummal</h2>
       <table><thead><tr><th>Név</th><th>Cím</th><th>Év</th><th class="r">Esedékes</th><th>Befizetések (dátum · nyugtaszám · összeg)</th><th class="r">Fizetve</th><th class="r">Még hiányzik</th></tr></thead><tbody>${reszben
         .map(
           ({ t, e }) =>
             `<tr><td>${esc(t.nev)}${e.becsult ? "*" : ""}${tobbGyulekezet ? `<br><span class="m">${esc(t.gyulekezetNev)}</span>` : ""}</td><td>${esc(t.cim)}</td><td>${e.ev}</td><td class="r">${lej(e.esedekesOsszeg)}</td><td>${befizetesSor(e)}</td><td class="r">${lej(e.fizetve)}</td><td class="r"><b>${lej(e.hianyzo)}</b></td></tr>`
         )
         .join("")}</tbody></table>`
    : "";

  const rendezett = [...tartozok].sort(
    (a, b) => a.gyulekezetNev.localeCompare(b.gyulekezetNev, "hu") || a.cim.localeCompare(b.cim.replace(/\d+.*$/, ""), "hu") || haz(a.cim) - haz(b.cim) || a.nev.localeCompare(b.nev, "hu")
  );
  const sorok = rendezett
    .map((t) => {
      const megj = t.evek
        .filter((e) => e.fizetve > 0)
        .map((e) => `${e.ev}: ${lej(e.fizetve)} fizetve (${e.befizetesek.map((b) => `${b.nyugta ? `nyugta ${esc(b.nyugta)}` : "nyugtaszám nélkül"}, ${datum(b.datum)}`).join("; ")})`)
        .join("; ");
      return `<tr><td>${esc(t.nev)}${t.evek.some((e) => e.becsult) ? "*" : ""}${tobbGyulekezet ? `<br><span class="m">${esc(t.gyulekezetNev)}</span>` : ""}</td><td>${esc(t.cim)}</td>${evek
        .map((ev) => `<td class="r">${t.evek.find((e) => e.ev === ev) ? szam(t.evek.find((e) => e.ev === ev)!.hianyzo) : "–"}</td>`)
        .join("")}<td class="r">${t.korabbiTartozas ? szam(t.korabbiTartozas) : "–"}</td><td class="r"><b>${szam(t.osszesTartozas)}</b></td><td class="m">${megj}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>Egyházfenntartói tartozások</title><style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #000; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 13px; margin: 14px 0 5px; }
    p { margin: 0 0 6px; } .m { color: #555; font-size: 9.5px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #e3ebf5; border: 1px solid #bbb; padding: 3px 4px; }
    td { padding: 2px 4px; border: 1px solid #ccc; vertical-align: top; } .r { text-align: right; white-space: nowrap; }
    tr { break-inside: avoid; } thead { display: table-header-group; }
    table.sum { width: auto; margin: 6px 0 4px; } table.sum td, table.sum th { padding: 4px 12px; }
    .pb { break-before: page; }
  </style></head><body>
    <h1>Egyházfenntartói tartozások</h1>
    <p>${gyulekezetNev ? esc(gyulekezetNev) + " · " : ""}${evTol}–${evIg} · állapot: ${kelt}</p>
    <table class="sum"><thead><tr><th>Tartozók száma</th>${evek.map((ev) => `<th>${ev}. évi hiány</th>`).join("")}<th>Korábbi (nyitó) tartozás</th><th>Összes tartozás</th></tr></thead>
      <tbody><tr><td><b>${tartozok.length} fő</b></td>${evek.map((ev) => `<td><b>${lej(evOsszeg(ev))}</b></td>`).join("")}<td><b>${lej(nyito)}</b></td><td><b>${lej(osszes)}</b></td></tr></tbody></table>
    <p class="m">A *-gal jelölt személyeknél nincs rögzített születési dátum, ezért a teljes (becsült) díjjal számoltunk. A nyugtaszámok és dátumok a rögzített befizetésekből származnak.</p>
    ${reszbenHtml}
    <h2 class="pb">${reszben.length ? "2" : "1"}. Az összes tartozó (cím szerint)</h2>
    <table><thead><tr><th>Név</th><th>Cím</th>${evek.map((ev) => `<th class="r">${ev}</th>`).join("")}<th class="r">Korábbi tartozás</th><th class="r">Összesen</th><th>Megjegyzés</th></tr></thead><tbody>${sorok}
      <tr><td><b>Összesen</b></td><td></td>${evek.map((ev) => `<td class="r"><b>${szam(evOsszeg(ev))}</b></td>`).join("")}<td class="r"><b>${szam(nyito)}</b></td><td class="r"><b>${szam(osszes)}</b></td><td></td></tr></tbody></table>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = frame.contentWindow;
  win.onafterprint = () => frame.remove();
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
}
