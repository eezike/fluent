import { HttpError } from "./http";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new HttpError(500, `Missing environment variable ${name}`);
  return v;
}

export function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
