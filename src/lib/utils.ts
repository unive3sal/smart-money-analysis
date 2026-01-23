import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatCurrency(value: number, decimals = 2): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(decimals)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(decimals)}K`;
  }
  return `$${value.toFixed(decimals)}`;
}

export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
