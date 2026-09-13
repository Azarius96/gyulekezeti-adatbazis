import type { InputHTMLAttributes } from "react";

/**
 * `<input type="date">` ésszerű év-tartománnyal (min/max) - enélkül Chrome-ban az év mezőbe
 * tetszőlegesen sok számjegy begépelhető, mielőtt a mező a hónapra ugrana (pl. "196051"), ami
 * érvénytelen, összezavaró dátumokhoz vezet. A min/max a böngészőt magát korlátozza gépelés közben.
 */
export function DateInput({ min = "1900-01-01", max = "2099-12-31", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" min={min} max={max} {...props} />;
}
