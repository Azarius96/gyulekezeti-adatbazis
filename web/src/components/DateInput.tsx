import { useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes } from "react";

/**
 * Dátummező magyar sorrendben: év, hónap, nap ("éééé. hh. nn."), a böngésző/operációs rendszer
 * nyelvi beállításától függetlenül (a natív `<input type="date">` megjelenése a rendszer
 * nyelvétől függ, pl. angolnál hónap/nap/év). Gépelés közben a pontokat és a szóközöket maga
 * teszi ki, így elég a számokat beírni (pl. "20261010"); elválasztóként a "-", "." és "/" is jó.
 *
 * Kifelé ugyanazt adja, mint a natív mező: az `onChange` eseményében `target.value` ISO formátumú
 * ("2026-10-10"), vagy üres szöveg, ha a dátum hiányos/érvénytelen - így a meglévő hívó kód
 * változtatás nélkül működik.
 */

type Parts = { y: string; m: string; d: string; closed: [boolean, boolean, boolean] };

/** A beírt szöveget év/hónap/nap részekre bontja; a határoló karakter vagy a betelt hossz lezárja a részt. */
function tokenize(raw: string): Parts {
  const parts: [string, string, string] = ["", "", ""];
  const closed: [boolean, boolean, boolean] = [false, false, false];
  const limits = [4, 2, 2];
  let i = 0;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      while (i < 3 && closed[i]) i++;
      if (i >= 3) break;
      parts[i] += ch;
      if (parts[i].length >= limits[i]) closed[i] = true;
    } else if (parts[i] && i < 3) {
      // az egy számjegyű hónap/nap elé nullát teszünk ("2026-3-5" -> 03, 05)
      if (i > 0 && parts[i].length === 1) parts[i] = "0" + parts[i];
      closed[i] = true;
      i++;
      if (i >= 3) break;
    }
  }
  return { y: parts[0], m: parts[1], d: parts[2], closed };
}

function formatText(p: Parts): string {
  let out = p.y;
  if (p.closed[0]) out += ". ";
  out += p.m;
  if (p.closed[1]) out += ". ";
  out += p.d;
  if (p.closed[2]) out += ".";
  return out;
}

/** ISO dátum ("2026-10-10") a megjelenített szövegben; a hiányos vagy érvénytelen dátum üres szöveg. */
function toIso(text: string, min: string, max: string): string {
  const p = tokenize(text);
  if (p.y.length !== 4 || p.m.length === 0 || p.d.length === 0) return "";
  const y = Number(p.y);
  const m = Number(p.m);
  const d = Number(p.d);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
  const iso = `${p.y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (iso < min || iso > max) return "";
  return iso;
}

function isoToText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}. ${m[2]}. ${m[3]}.` : "";
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max"> & {
  value?: string;
  min?: string;
  max?: string;
};

export function DateInput({ value = "", min = "1900-01-01", max = "2099-12-31", onChange, ...rest }: Props) {
  const [text, setText] = useState(() => isoToText(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // Ha kívülről változik az érték (pl. betöltés, űrlap-törlés), a szöveg követi - de a félig beírt
  // szöveget nem írjuk felül, amíg az ISO-értéke megegyezik a kapott értékkel.
  useEffect(() => {
    if (toIso(text, min, max) !== value) setText(isoToText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Hibás/hiányos beírásnál az űrlap beküldését a böngésző érthető üzenettel állítja meg.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setCustomValidity(text && !toIso(text, min, max) ? "Érvénytelen dátum - formátum: éééé. hh. nn." : "");
  }, [text, min, max]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Törlésnél a szöveget úgy hagyjuk, ahogy van (különben az automatikus pont visszakerülne).
    const next = raw.length < text.length ? raw : formatText(tokenize(raw));
    setText(next);
    const iso = toIso(next, min, max);
    if (iso !== value) {
      onChange?.({ ...e, target: { ...e.target, value: iso }, currentTarget: { ...e.currentTarget, value: iso } } as ChangeEvent<HTMLInputElement>);
    }
  }

  // Elhagyáskor a hiányos (pl. egyjegyű nap) de érvényes dátumot egységes alakra hozzuk.
  function handleBlur(e: FocusEvent<HTMLInputElement>) {
    const iso = toIso(text, min, max);
    if (iso) setText(isoToText(iso));
    rest.onBlur?.(e);
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="éééé. hh. nn."
      maxLength={14}
      {...rest}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
