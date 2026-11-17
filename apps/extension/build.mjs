import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Read NEXT_PUBLIC_* values from the environment, falling back to apps/web/.env.local.
function dotenv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
  );
}
const file = dotenv(resolve(here, "../web/.env.local"));
const get = (k, d = "") => process.env[k] || file[k] || d;

const apiUrl = get("FLUENT_API_URL", get("APP_URL", "http://localhost:3000")).replace(/\/$/, "");
const supabaseUrl = get("NEXT_PUBLIC_SUPABASE_URL");
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!supabaseUrl || !anon) console.warn("! NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set. Sign-in won't work until you rebuild with them.");

rmSync(resolve(here, "dist"), { recursive: true, force: true });
mkdirSync(resolve(here, "dist"), { recursive: true });

await build({
  entryPoints: { panel: resolve(here, "src/panel.tsx"), background: resolve(here, "src/background.ts") },
  outdir: resolve(here, "dist"),
  bundle: true,
  format: "iife",
  jsx: "automatic",
  loader: { ".css": "css" },
  target: "chrome120",
  minify: false,
  define: {
    __API_URL__: JSON.stringify(apiUrl),
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_ANON_KEY__: JSON.stringify(anon),
  },
});

for (const f of ["manifest.json", "panel.html"]) cpSync(resolve(here, f), resolve(here, "dist", f));
for (const f of ["icon-192.png", "icon-512.png"]) cpSync(resolve(here, "../web/public", f), resolve(here, "dist", f));
console.log(`Built extension → apps/extension/dist (API: ${apiUrl})`);
