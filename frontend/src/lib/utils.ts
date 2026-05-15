export const cls = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDate = (iso?: string, withTime = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const datePart = d.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric"
  });
  if (!withTime) return datePart;
  return `${datePart}, ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  })}`;
};

export const formatPrice = (amount: number, ccy: string) => {
  const symbol = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
  return `${symbol}${amount.toFixed(2)}`;
};

export const validators = {
  email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  password: (v: string) =>
    v.length >= 8 && /\d/.test(v) && /[^A-Za-z0-9]/.test(v),
  age18: (dob: string) => {
    const d = new Date(dob);
    if (isNaN(d.getTime())) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 18;
  }
};
