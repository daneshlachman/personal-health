// iOS with a Dutch locale shows a comma on the decimal keypad, and
// <input type="number"> silently drops "86,3". Use type="text" inputMode="decimal"
// and pass every change through this: comma → dot, digits and one dot only.
export function toDecimal(value) {
  const s = value.replace(",", ".").replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  return i === -1 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
}
