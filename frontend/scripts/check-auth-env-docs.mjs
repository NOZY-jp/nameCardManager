// docs/dev/auth.md に書いた環境変数名が、実際のコードの process.env.* と一致するか検査する。
// 目的: 旧JWTの鍵名（SECRET_KEY と LEGACY_JWT_SECRET など）の取り違えを再発させない。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const docPath = new URL("../../docs/dev/auth.md", import.meta.url);
const srcDir = fileURLToPath(new URL("../src", import.meta.url));

const ENV_PATTERN =
  /^(AUTH_|LEGACY_|JWT_|NEXT_PUBLIC_)[A-Z0-9_]+$|^(SECRET_KEY|DATABASE_URL)$/;

const doc = readFileSync(docPath, "utf8");
const docNames = new Set(
  [...doc.matchAll(/`([A-Z][A-Z0-9_]+)`/g)]
    .map((match) => match[1])
    .filter((name) => ENV_PATTERN.test(name)),
);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) files.push(full);
  }
  return files;
}

const codeNames = new Set();
for (const file of walk(srcDir)) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    codeNames.add(match[1]);
  }
}

const missing = [...docNames].filter((name) => !codeNames.has(name));
if (missing.length) {
  console.error(
    `env names in docs/dev/auth.md not referenced in src: ${missing.join(", ")}`,
  );
  process.exit(1);
}
console.log(`OK: ${docNames.size} env names in docs match process.env in src`);
