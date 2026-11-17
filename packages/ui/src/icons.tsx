import type { CSSProperties } from "react";

const PATHS = {
  alert: "m10.29 3.86-8.48 14.7A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.72-3l-8.47-14.7a2 2 0 0 0-3.44 0z M12 9v4 M12 17h.01",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h4",
  zap: "M13 2 3 14h7l-1 8 10-12h-7l1-8z",
  loader: "M21 12a9 9 0 1 1-6.2-8.5",
  check: "M20 6 9 17l-5-5",
  msg: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  money: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M14.5 9a2.5 2 0 0 0-2.5-1.5c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2A2.5 2 0 0 1 9.5 15 M12 6v2 M12 16v2",
  chev: "m6 9 6 6 6-6",
  left: "m15 18-6-6 6-6",
  send: "M5 12h14 M13 6l6 6-6 6",
  target: "M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 17, color = "currentColor", sw = 2 }: { name: IconName; size?: number; color?: string; sw?: number }) {
  const style: CSSProperties | undefined = name === "loader" ? { animation: "fl-spin 1.1s linear infinite" } : undefined;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}
