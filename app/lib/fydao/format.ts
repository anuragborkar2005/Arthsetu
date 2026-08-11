export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toLocaleString();
  const factor = 10n ** BigInt(decimals);
  const whole = amount / factor;
  const fraction = (amount % factor).toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toLocaleString()}.${fraction}`;
}

export function formatCompact(amount: bigint, decimals: number): string {
  const value = Number(amount) / 10 ** decimals;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Converts a Solana timestamp (i64 seconds) to a JS Date. */
export function toDate(unixSeconds: bigint): Date {
  return new Date(Number(unixSeconds) * 1000);
}

export function formatDate(unixSeconds: bigint): string {
  return toDate(unixSeconds).toLocaleString();
}

export function formatRelative(unixSeconds: bigint): string {
  const delta = Number(unixSeconds) * 1000 - Date.now();
  if (delta <= 0) return "now";
  const abs = Math.abs(delta);
  const minutes = Math.floor(abs / 60_000);
  const hours = Math.floor(abs / 3_600_000);
  const days = Math.floor(abs / 86_400_000);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(abs / 1000)}s`;
}

export function formatDuration(unixSeconds: bigint): string {
  const total = Number(unixSeconds);
  if (total <= 0) return "0s";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function truncate(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/** Percent from basis points. */
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(1);
}
