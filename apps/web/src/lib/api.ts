import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Next dev runs API calls in worker processes. Load the repository-level .env
// in each worker; hosted platforms retain their injected environment variables.
function loadLocalApiEnvironment() {
  if (process.env.API_URL && process.env.API_AUTH_TOKEN) return;

  const envPath = path.resolve(process.cwd(), "../..", ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^(API_URL|API_AUTH_TOKEN)=(.*)$/);
    if (!match || process.env[match[1]]) continue;

    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value) process.env[match[1]] = value;
  }
}

loadLocalApiEnvironment();

export const API_URL = process.env.API_URL ?? "http://localhost:3002";
const API_AUTH_TOKEN = process.env.API_AUTH_TOKEN;

function apiHeaders(headers: Record<string, string> = {}) {
  return API_AUTH_TOKEN ? { ...headers, "x-api-key": API_AUTH_TOKEN } : headers;
}


export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store", headers: apiHeaders() });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: apiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}


const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** Format a Decimal-as-string or number as INR. */
export function formatInr(value: string | number | null | undefined): string {
  return inrFormatter.format(Number(value ?? 0));
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
