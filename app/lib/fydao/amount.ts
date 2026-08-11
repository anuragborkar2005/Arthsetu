/** Parses a decimal string into raw token units for a given number of decimals. */
export function parseTokenAmount(input: string, decimals: number): bigint | null {
  const cleaned = input.trim();
  if (!/^\d*\.?\d*$/.test(cleaned)) return null;
  const [whole = "", fraction = ""] = cleaned.split(".");
  if (whole === "" && fraction === "") return null;
  const factor = 10n ** BigInt(decimals);
  let value = BigInt(whole || "0") * factor;
  if (fraction.length > 0) {
    const padded = fraction.padEnd(decimals, "0").slice(0, decimals);
    value += BigInt(padded);
  }
  return value;
}

export function rawToDecimal(raw: bigint, decimals: number): string {
  const factor = 10n ** BigInt(decimals);
  const whole = raw / factor;
  const fraction = (raw % factor).toString().padStart(decimals, "0");
  return `${whole}.${fraction}`;
}
