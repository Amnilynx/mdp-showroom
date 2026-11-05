// Turns one saved configuration into the price lines a customer sees, so the
// quote page and the order page always itemize the same way.
//
// Newer configurations store finishAddOn and hardwareAddOn separately. Older
// ones (saved before this change) only have addOnsTotal, so for those the two
// are shown as one combined line and nothing breaks.

const num = (n) => Number(n) || 0;

export function peso(n) {
  return "₱" + num(n).toLocaleString();
}

// -> [{ key, label, amount }]. amount 0 on finish/hardware means "included".
export function configLines(c) {
  const lines = [
    {
      key: "base",
      label: "Base layout" + (c.shapeType ? ` · ${c.shapeType}` : ""),
      amount: num(c.basePrice),
    },
  ];
  const split = typeof c.finishAddOn === "number" || typeof c.hardwareAddOn === "number";
  if (split) {
    if (c.finish) lines.push({ key: "finish", label: `Finish · ${c.finish}`, amount: num(c.finishAddOn) });
    if (c.hardware) lines.push({ key: "hardware", label: `Hardware · ${c.hardware}`, amount: num(c.hardwareAddOn) });
  } else if (num(c.addOnsTotal) > 0) {
    const names = [c.finish, c.hardware].filter(Boolean).join(" + ");
    lines.push({ key: "addons", label: `Add-ons${names ? ` · ${names}` : ""}`, amount: num(c.addOnsTotal) });
  }
  return lines;
}

// What to print on the right of a line.
export function lineAmount(line) {
  if (line.key === "base") return peso(line.amount);
  return line.amount > 0 ? "+" + peso(line.amount) : "Included";
}

export function sizeText(d) {
  if (!d || (d.w == null && d.d == null && d.h == null)) return "";
  return `W${d.w} × D${d.d} × H${d.h} cm`;
}
