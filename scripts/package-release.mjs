import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const PROJECT = fileURLToPath(new URL("../", import.meta.url));
const PREFIX = "ShiftSync/";
const MANIFEST = `${PREFIX}RELEASE-MANIFEST.json`;
const PLACEHOLDERS = ["storage/.gitkeep", "storage/sessions/.gitkeep"];
const ROOT_FILES = new Set(["README.md", "AGENTS.md", ".gitignore", "LICENSE"]);
const DOC_FILES = new Set([
  "API.md",
  "ARCHITECTURE.md",
  "DATA_MODEL.md",
  "DEMO_SCRIPT.md",
  "DEPLOYMENT.md",
  "SYLLABUS_MAPPING.md",
  "VIVA_GUIDE.md",
  "RELEASE.md",
  "FIXES.md",
  "MIGRATION.md",
  "PATCH_NOTES.md",
]);
const PUBLIC_PHP = new Set([
  "index.php",
  "login.php",
  "app.php",
  "availability.php",
  "api/index.php",
  "handlers/login.php",
  "handlers/logout.php",
  "handlers/availability.php",
  "reports/export.php",
]);
const REQUIRED = [
  "README.md",
  "config/app.php",
  "config/local.example.php",
  ...[
    "Auth.php",
    "Csrf.php",
    "Csv.php",
    "Demo.php",
    "Domain.php",
    "DomainError.php",
    "Input.php",
    "Page.php",
    "Passwords.php",
    "Response.php",
    "Store.php",
    "Time.php",
    "bootstrap.php",
  ].map((name) => `src/${name}`),
  ...[...PUBLIC_PHP].map((name) => `public/${name}`),
  ...[
    "css/tokens.css",
    "css/app.css",
    "css/php.css",
    "js/boot.js",
    "js/availability.js",
    "mark.svg",
    "vendor/bootstrap.min.css",
    "vendor/bootstrap.bundle.min.js",
    "vendor/bootstrap.LICENSE",
  ].map((name) => `public/assets/${name}`),
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/vite.config.js",
  ...[
    "main.jsx",
    "App.jsx",
    "context.jsx",
    "components/AppLayout.jsx",
    "components/Roster.jsx",
    "components/UI.jsx",
    "hooks/useApi.js",
    "pages/Reports.jsx",
    "pages/Swaps.jsx",
    "pages/WorkspacePages.jsx",
    "services/api.js",
    "utils/dates.js",
  ].map((name) => `frontend/src/${name}`),
  ...[
    "cli.php",
    "seed-demo.php",
    "create-user.php",
    "reset-password.php",
    "backup.php",
    "restore.php",
    "check-environment.php",
    "dev-router.php",
    "php.ps1",
    "npm.ps1",
    "prepare-assets.mjs",
    "package-release.mjs",
    "share-preview.ps1",
  ].map((name) => `scripts/${name}`),
  "docs/RELEASE.md",
  "docs/MIGRATION.md",
  "docs/FIXES.md",
  "tests/run.php",
  "tests/package-release.mjs",
  "tests/concurrency/worker.php",
  "tests/fixtures/state.php",
];
const BUILD_EXTENSION = /\.(?:js|css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf)$/i;
const SENSITIVE_NAME =
  /(?:^|[./_-])(?:secrets?|credentials?|sessions?|backups?|baseline|before-fix|rawcopy|attachments?)(?:[./_-]|$)/i;
const APPROVED_AUTH_DUMMY = [
  "$2y$10$",
  "usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG",
].join("");

function fail(message) {
  throw new Error(message);
}
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

export function assertRelativeName(name) {
  if (
    typeof name !== "string" ||
    !name ||
    /[^A-Za-z0-9_./ -]/.test(name) ||
    name.includes("\\")
  )
    fail("Unsafe release entry name.");
  const parts = name.split("/");
  if (
    parts.some(
      (part) => !part || part === "." || part === ".." || /[ .]$/.test(part),
    )
  )
    fail("Unsafe release entry path.");
  if (
    parts.some((part) =>
      /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
    )
  )
    fail("Non-portable release entry path.");
  return name;
}

function harmlessName(name) {
  return (
    !SENSITIVE_NAME.test(name) &&
    !name.split("/").some((part) => part.startsWith("."))
  );
}

/** Inclusion is independent of .gitignore. Runtime and evidence directories are never walked. */
export function isReleasePath(name) {
  assertRelativeName(name);
  if (
    ROOT_FILES.has(name) ||
    PLACEHOLDERS.includes(name) ||
    name === "RELEASE-MANIFEST.json"
  )
    return true;
  if (["config/app.php", "config/local.example.php"].includes(name))
    return true;
  if (name.startsWith("docs/")) return DOC_FILES.has(name.slice(5));
  if (name.startsWith("src/"))
    return /^src\/[^/]+\.php$/.test(name) && harmlessName(name);
  if (name === "scripts/backup.php") return true;
  if (name.startsWith("scripts/"))
    return /^scripts\/[^/]+\.(?:php|ps1|mjs)$/.test(name) && harmlessName(name);
  if (
    [
      "frontend/package.json",
      "frontend/package-lock.json",
      "frontend/vite.config.js",
    ].includes(name)
  )
    return true;
  if (name.startsWith("frontend/src/"))
    return /\.(?:js|jsx|css|svg)$/.test(name) && harmlessName(name);
  if (name === "tests/fixtures/state.php") return true; // Deliberately fictional fixture source; never a live JSON snapshot.
  if (/^tests\/(?:[^/]+|(?:e2e|concurrency)\/[^/]+)\.(?:php|mjs)$/.test(name))
    return harmlessName(name);
  if (name === "public/build/.vite/manifest.json") return true;
  if (name.startsWith("public/build/assets/"))
    return BUILD_EXTENSION.test(name) && harmlessName(name);
  if (name.startsWith("public/")) {
    const relative = name.slice(7);
    if (PUBLIC_PHP.has(relative)) return true;
    if (relative === "assets/vendor/bootstrap.LICENSE") return true;
    return (
      relative.startsWith("assets/") &&
      /\.(?:css|js|svg|png|jpe?g|webp|gif|ico|woff2?|ttf)$/i.test(relative) &&
      harmlessName(relative)
    );
  }
  return false;
}

/** Supplemental checks catch common accidental literals; the allowlist remains the primary boundary. */
export function assertNoSecretContent(name, data) {
  const text = data.toString("utf8");
  const bcrypt = text.match(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g) || [];
  if (
    bcrypt.some(
      (value) => name !== "src/Auth.php" || value !== APPROVED_AUTH_DUMMY,
    )
  )
    fail(`Credential-like password hash found in selected file: ${name}`);
  if (/\$argon2(?:id|i|d)\$v=\d+\$/.test(text))
    fail(`Credential-like password hash found in selected file: ${name}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text))
    fail(`Private-key material found in selected file: ${name}`);
  if (/\bSs![a-f0-9]{24}\b/.test(text))
    fail(`Generated credential-like value found in selected file: ${name}`);
  if (
    /(?:TUNNEL_TOKEN|api[_-]?key|api[_-]?secret|client[_-]?secret)\s*(?:=>|:|=)\s*["'][A-Za-z0-9_./+\-=]{20,}["']/i.test(
      text,
    )
  )
    fail(`Secret-like assignment found in selected file: ${name}`);
  if (/^(?:userId|csrf)\|[abis]:/.test(text))
    fail(`Serialized session material found in selected file: ${name}`);
  if (text.trimStart().startsWith("{")) {
    try {
      const value = JSON.parse(text);
      if (
        value &&
        typeof value === "object" &&
        "schemaVersion" in value &&
        "users" in value &&
        "assignments" in value
      )
        fail(`Business snapshot found in selected file: ${name}`);
    } catch (error) {
      if (error.message.startsWith("Business snapshot")) throw error;
    }
  }
}

async function safeRead(root, name) {
  assertRelativeName(name);
  let current = root;
  const parts = name.split("/");
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink())
      fail(`Symlink or junction is not a release input: ${name}`);
    if (index < parts.length - 1 && !stat.isDirectory())
      fail(`Invalid release directory: ${name}`);
    if (
      index === parts.length - 1 &&
      (!stat.isFile() || stat.size > 64 * 1024 * 1024)
    )
      fail(`Invalid or oversized release file: ${name}`);
  }
  return fs.readFile(current);
}

async function walk(root, directory, recursive, selected) {
  const full = path.join(root, directory);
  let stat;
  try {
    stat = await fs.lstat(full);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory())
    fail(`Invalid release source directory: ${directory}`);
  const children = await fs.readdir(full, { withFileTypes: true });
  for (const child of children) {
    const name = `${directory}/${child.name}`;
    if (child.isSymbolicLink())
      fail(`Symlink or junction is not a release input: ${name}`);
    if (child.isDirectory()) {
      if (recursive && harmlessName(name))
        await walk(root, name, true, selected);
    } else if (child.isFile() && isReleasePath(name)) selected.add(name);
  }
}

function manifestOutputs(manifest) {
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object")
    fail("Build manifest must be an object.");
  const entries = Object.keys(manifest).filter(
    (key) => manifest[key]?.isEntry === true,
  );
  if (!entries.length)
    fail("Build manifest has no entry. Run the frontend production build.");
  const visited = new Set();
  const selected = new Set();
  function asset(name) {
    if (typeof name !== "string" || !name.startsWith("assets/"))
      fail("Build manifest contains a non-asset output path.");
    const relative = `public/build/${name}`;
    if (!isReleasePath(relative))
      fail("Build manifest contains an unapproved output path.");
    selected.add(relative);
  }
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const entry = manifest[key];
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      fail("Build manifest dependency is missing.");
    asset(entry.file);
    for (const field of ["css", "assets"]) {
      if (entry[field] !== undefined && !Array.isArray(entry[field]))
        fail("Invalid build asset list.");
      for (const name of entry[field] || []) asset(name);
    }
    for (const field of ["imports", "dynamicImports"]) {
      if (entry[field] !== undefined && !Array.isArray(entry[field]))
        fail("Invalid build dependency list.");
      for (const dependency of entry[field] || []) {
        if (typeof dependency !== "string") fail("Invalid build dependency.");
        visit(dependency);
      }
    }
  }
  entries.sort().forEach(visit);
  return selected;
}

async function builtFiles(root, selected) {
  const manifestName = "public/build/.vite/manifest.json";
  const data = await safeRead(root, manifestName);
  for (const name of manifestOutputs(JSON.parse(data.toString("utf8"))))
    selected.add(name);
  selected.add(manifestName);
}

export async function collectReleaseEntries(root) {
  root = path.resolve(root);
  const stat = await fs.lstat(root);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    fail("Release root must be a real directory.");
  const selected = new Set();
  for (const name of ROOT_FILES) {
    try {
      await fs.lstat(path.join(root, name));
      selected.add(name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const name of ["config/app.php", "config/local.example.php"])
    selected.add(name);
  for (const name of DOC_FILES) {
    try {
      await fs.lstat(path.join(root, "docs", name));
      selected.add(`docs/${name}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const [directory, recursive] of [
    ["src", false],
    ["scripts", false],
    ["frontend/src", true],
    ["public/assets", true],
    ["tests", false],
    ["tests/e2e", false],
    ["tests/concurrency", false],
  ])
    await walk(root, directory, recursive, selected);
  for (const name of [
    "frontend/package.json",
    "frontend/package-lock.json",
    "frontend/vite.config.js",
    "tests/fixtures/state.php",
  ])
    selected.add(name);
  for (const name of PUBLIC_PHP) {
    try {
      await fs.lstat(path.join(root, "public", name));
      selected.add(`public/${name}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await builtFiles(root, selected);
  for (const name of REQUIRED)
    if (!selected.has(name))
      fail(`Required release source is missing: ${name}`);
  const entries = [];
  for (const name of [...selected].sort()) {
    if (!isReleasePath(name)) fail(`Unapproved release input: ${name}`);
    const data = await safeRead(root, name);
    assertNoSecretContent(name, data);
    entries.push({ name: PREFIX + name, data });
  }
  // Do not inspect or copy storage at all, including any existing .gitkeep content.
  for (const name of PLACEHOLDERS)
    entries.push({ name: PREFIX + name, data: Buffer.alloc(0) });
  return entries;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function validateEntries(entries) {
  const names = new Set();
  for (const entry of entries) {
    assertRelativeName(entry.name);
    if (!entry.name.startsWith(PREFIX))
      fail("Release entry is outside the project folder.");
    const relative = entry.name.slice(PREFIX.length);
    if (!isReleasePath(relative)) fail(`Unapproved archive entry: ${relative}`);
    const normalized = entry.name.toLowerCase();
    if (names.has(normalized))
      fail("Duplicate or case-colliding release entry.");
    names.add(normalized);
    if (!Buffer.isBuffer(entry.data))
      fail("Release file content must be bytes.");
    if (PLACEHOLDERS.includes(relative) && entry.data.length !== 0)
      fail("Storage placeholders must be empty.");
    assertNoSecretContent(relative, entry.data);
  }
}

/** Stored ZIP entries, fixed DOS timestamps and normalized modes make bytes deterministic. */
export function createReleaseZip(files) {
  const entries = files.map((entry) => ({
    name: entry.name,
    data: Buffer.from(entry.data),
  }));
  if (entries.some((entry) => entry.name === MANIFEST))
    fail("Release manifest is generated, not supplied.");
  validateEntries(entries);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const manifest = {
    formatVersion: 1,
    files: entries.map((entry) => ({
      path: entry.name,
      bytes: entry.data.length,
      sha256: sha256(entry.data),
    })),
  };
  entries.push({
    name: MANIFEST,
    data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
  });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (entries.length > 65535) fail("Release is too large for this ZIP format.");
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x0021, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.data.length, 18);
    header.writeUInt32LE(entry.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0x0021, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(entry.data.length, 20);
    directory.writeUInt32LE(entry.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    local.push(header, name, entry.data);
    central.push(directory, name);
    offset += header.length + name.length + entry.data.length;
    if (offset > 256 * 1024 * 1024)
      fail("Release exceeds the 256 MB packaging limit.");
  }
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralData, end]);
}

export function verifyReleaseZip(data) {
  try {
    if (!Buffer.isBuffer(data) || data.length < 22)
      fail("Invalid release ZIP.");
    const end = data.length - 22;
    if (
      data.readUInt32LE(end) !== 0x06054b50 ||
      data.readUInt16LE(end + 20) !== 0 ||
      data.readUInt16LE(end + 4) !== 0 ||
      data.readUInt16LE(end + 6) !== 0
    )
      fail("Unsupported release ZIP footer.");
    const count = data.readUInt16LE(end + 10);
    const start = data.readUInt32LE(end + 16);
    if (
      data.readUInt16LE(end + 8) !== count ||
      start + data.readUInt32LE(end + 12) !== end
    )
      fail("Invalid release ZIP directory.");
    const entries = [];
    let cursor = start;
    let localCursor = 0;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50)
        fail("Invalid release ZIP entry.");
      const nameLength = data.readUInt16LE(cursor + 28);
      const extraLength = data.readUInt16LE(cursor + 30);
      const commentLength = data.readUInt16LE(cursor + 32);
      const bytes = data.readUInt32LE(cursor + 24);
      const offset = data.readUInt32LE(cursor + 42);
      const name = data
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString("utf8");
      const mode = data.readUInt32LE(cursor + 38) >>> 16;
      if (
        extraLength ||
        commentLength ||
        data.readUInt16LE(cursor + 8) !== 0x0800 ||
        data.readUInt16LE(cursor + 10) !== 0 ||
        bytes !== data.readUInt32LE(cursor + 20) ||
        mode !== 0o100644 ||
        offset !== localCursor
      )
        fail("Unsupported, linked or overlapping ZIP entry.");
      if (
        data.readUInt32LE(offset) !== 0x04034b50 ||
        data.readUInt16LE(offset + 6) !== 0x0800 ||
        data.readUInt16LE(offset + 8) !== 0 ||
        data.readUInt16LE(offset + 26) !== nameLength ||
        data.readUInt16LE(offset + 28) !== 0
      )
        fail("Mismatched release ZIP header.");
      if (
        data
          .subarray(offset + 30, offset + 30 + nameLength)
          .toString("utf8") !== name ||
        data.readUInt32LE(offset + 18) !== bytes ||
        data.readUInt32LE(offset + 22) !== bytes
      )
        fail("Mismatched release ZIP name or length.");
      localCursor = offset + 30 + nameLength + bytes;
      if (localCursor > start)
        fail("Release ZIP content exceeds its boundary.");
      const content = data.subarray(offset + 30 + nameLength, localCursor);
      const crc = crc32(content);
      if (
        crc !== data.readUInt32LE(cursor + 16) ||
        crc !== data.readUInt32LE(offset + 14)
      )
        fail("Release ZIP checksum mismatch.");
      entries.push({ name, data: content });
      cursor += 46 + nameLength;
    }
    if (cursor !== end || localCursor !== start)
      fail("Release ZIP has unexpected content.");
    validateEntries(entries);
    const manifestEntry = entries.find((entry) => entry.name === MANIFEST);
    if (!manifestEntry) fail("Release manifest is missing.");
    const manifest = JSON.parse(manifestEntry.data.toString("utf8"));
    const files = entries
      .filter((entry) => entry.name !== MANIFEST)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (
      manifest.formatVersion !== 1 ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== files.length
    )
      fail("Release manifest is inconsistent.");
    files.forEach((entry, index) => {
      const expected = manifest.files[index];
      if (
        expected.path !== entry.name ||
        expected.bytes !== entry.data.length ||
        expected.sha256 !== sha256(entry.data)
      )
        fail("Release manifest checksum mismatch.");
    });
    for (const required of [
      ...REQUIRED,
      ...PLACEHOLDERS,
      "public/build/.vite/manifest.json",
    ])
      if (!entries.some((entry) => entry.name === PREFIX + required))
        fail(`Required archive source is missing: ${required}`);
    const buildManifest = entries.find(
      (entry) => entry.name === PREFIX + "public/build/.vite/manifest.json",
    );
    const built = manifestOutputs(
      JSON.parse(buildManifest.data.toString("utf8")),
    );
    for (const name of built)
      if (!entries.some((entry) => entry.name === PREFIX + name))
        fail("Referenced build asset is missing from the archive.");
    for (const entry of entries) {
      if (
        entry.name.startsWith(PREFIX + "public/build/") &&
        entry.name !== buildManifest.name &&
        !built.has(entry.name.slice(PREFIX.length))
      )
        fail("Unreferenced build asset found in archive.");
    }
    return {
      files: entries.map((entry) => entry.name),
      bytes: data.length,
      sha256: sha256(data),
    };
  } catch (error) {
    if (error instanceof RangeError || error instanceof SyntaxError)
      fail("Invalid release ZIP structure.");
    throw error;
  }
}

export async function packageRelease(root, output) {
  root = path.resolve(root);
  output = path.resolve(output);
  if (path.extname(output).toLowerCase() !== ".zip")
    fail("Release output must be a ZIP file.");
  const relativeOutput = path.relative(root, output).split(path.sep).join("/");
  if (
    /^(?:storage|public|config|src|scripts|frontend|tests|\.tools)(?:\/|$)/i.test(
      relativeOutput,
    )
  )
    fail("Release output cannot replace an application or private input.");
  let ancestor = path.dirname(output);
  while (true) {
    try {
      const stat = await fs.lstat(ancestor);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        fail("Release output directory cannot use a symlink or junction.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  const archive = createReleaseZip(await collectReleaseEntries(root));
  const report = verifyReleaseZip(archive);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, archive, { flag: "wx" }); // Never overwrite an operational file or an earlier deliverable.
  const written = await fs.readFile(output);
  if (!written.equals(archive))
    fail("Written release differs from its verified bytes.");
  verifyReleaseZip(written);
  return { ...report, output };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === "--verify") {
    const report = verifyReleaseZip(await fs.readFile(path.resolve(args[1])));
    console.log(
      `Verified ${report.files.length} allowlisted entries; SHA-256 ${report.sha256}`,
    );
    return;
  }
  if (args.length !== 0 && !(args.length === 2 && args[0] === "--out"))
    fail(
      "Usage: node scripts/package-release.mjs [--out artifacts/ShiftSync-patched.zip] | --verify archive.zip",
    );
  const output = args.length
    ? path.resolve(args[1])
    : path.join(PROJECT, "artifacts", "ShiftSync-patched.zip");
  const report = await packageRelease(PROJECT, output);
  console.log(`Sanitized release: ${report.output}`);
  console.log(
    `${report.files.length} verified entries; ${report.bytes} bytes; SHA-256 ${report.sha256}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`Release packaging failed: ${error.message}`);
    process.exitCode = 1;
  });
}
