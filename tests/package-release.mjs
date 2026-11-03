import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  collectReleaseEntries,
  createReleaseZip,
  verifyReleaseZip,
  packageRelease,
  assertNoSecretContent,
  assertRelativeName,
} from "../scripts/package-release.mjs";

const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "shiftsync-release-"),
);
const sentinel = ["RELEASE", "SENTINEL", "PRIVATE", "DUMMY"].join("_");
const fixtures = [];
let passed = 0;
let failed = 0;

async function write(root, name, data) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), data);
}

async function fixture() {
  const root = path.join(temporary, `fixture-${fixtures.length}`);
  fixtures.push(root);
  const sources = [
    "README.md",
    "AGENTS.md",
    ".gitignore",
    "config/app.php",
    "config/local.example.php",
    "src/bootstrap.php",
    "src/Auth.php",
    "src/Csrf.php",
    "src/Csv.php",
    "src/Demo.php",
    "src/Domain.php",
    "src/DomainError.php",
    "src/Input.php",
    "src/Page.php",
    "src/Passwords.php",
    "src/Response.php",
    "src/Store.php",
    "src/Time.php",
    "public/index.php",
    "public/login.php",
    "public/app.php",
    "public/availability.php",
    "public/api/index.php",
    "public/handlers/login.php",
    "public/handlers/logout.php",
    "public/handlers/availability.php",
    "public/reports/export.php",
    "frontend/vite.config.js",
    "frontend/src/main.jsx",
    "frontend/src/App.jsx",
    "frontend/src/context.jsx",
    "frontend/src/components/AppLayout.jsx",
    "frontend/src/components/Roster.jsx",
    "frontend/src/components/UI.jsx",
    "frontend/src/hooks/useApi.js",
    "frontend/src/pages/Reports.jsx",
    "frontend/src/pages/Swaps.jsx",
    "frontend/src/pages/WorkspacePages.jsx",
    "frontend/src/services/api.js",
    "frontend/src/utils/dates.js",
    "frontend/src/components/Fixture.jsx",
    "scripts/seed-demo.php",
    "scripts/cli.php",
    "scripts/create-user.php",
    "scripts/reset-password.php",
    "scripts/backup.php",
    "scripts/restore.php",
    "scripts/check-environment.php",
    "scripts/dev-router.php",
    "scripts/php.ps1",
    "scripts/npm.ps1",
    "scripts/prepare-assets.mjs",
    "scripts/package-release.mjs",
    "scripts/share-preview.ps1",
    "docs/RELEASE.md",
    "docs/MIGRATION.md",
    "docs/FIXES.md",
    "docs/API.md",
    "tests/fixtures/state.php",
    "tests/run.php",
    "tests/package-release.mjs",
    "tests/concurrency/worker.php",
    "tests/e2e/fixture.mjs",
    "public/assets/css/app.css",
    "public/assets/css/tokens.css",
    "public/assets/css/php.css",
    "public/assets/js/boot.js",
    "public/assets/js/availability.js",
    "public/assets/mark.svg",
    "public/assets/vendor/bootstrap.min.css",
    "public/assets/vendor/bootstrap.bundle.min.js",
    "public/assets/vendor/bootstrap.LICENSE",
  ];
  for (const name of sources)
    await write(root, name, `Fictional fixture source: ${name}\n`);
  await write(
    root,
    "frontend/package.json",
    '{"name":"release-fixture","private":true}\n',
  );
  await write(
    root,
    "frontend/package-lock.json",
    '{"name":"release-fixture","lockfileVersion":3}\n',
  );
  await write(
    root,
    "public/build/.vite/manifest.json",
    JSON.stringify({
      "src/main.jsx": {
        file: "assets/main-fixture.js",
        isEntry: true,
        css: ["assets/main-fixture.css"],
        imports: ["shared"],
        dynamicImports: ["lazy"],
      },
      shared: { file: "assets/shared-fixture.js" },
      lazy: {
        file: "assets/lazy-fixture.js",
        assets: ["assets/icon-fixture.svg"],
      },
    }),
  );
  for (const name of [
    "main-fixture.js",
    "main-fixture.css",
    "shared-fixture.js",
    "lazy-fixture.js",
    "icon-fixture.svg",
  ])
    await write(
      root,
      `public/build/assets/${name}`,
      `Fictional built asset: ${name}\n`,
    );
  const forbidden = [
    "storage/state.json",
    "storage/state.lock",
    "storage/state.php",
    "storage/backup-20000101.json",
    "storage/demo-credentials.txt",
    "storage/sessions/sess_dummy",
    "storage/.gitkeep",
    "storage/preview-processes.json",
    "config/local.php",
    "config/.env",
    ".env",
    ".tools/php/php.exe",
    "frontend/node_modules/dummy/index.js",
    "tests/.tmp/state.json",
    "tests/e2e/.auth/session.json",
    "docs/LIVE_SWAP_RESULTS.json",
    "docs/HTTP_RESULTS.json",
    "docs/screenshots/private.png",
    "docs/live-swap/private.png",
    "docs/USER_REQUEST.txt",
    "baseline/raw-copy.txt",
    "artifacts/old-unsafe.zip",
    "public/build/assets/unused-old.js",
    "src/local-secrets.php",
    "scripts/local-credentials.php",
  ];
  for (const name of forbidden) await write(root, name, `${sentinel}\n`);
  return { root, forbidden };
}

async function test(name, run) {
  try {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

try {
  await test("Allowlist keeps required source, lockfile, reset utility, fixtures and transitive built assets; excludes private/evidence/dependency trees", async () => {
    const { root, forbidden } = await fixture();
    const entries = await collectReleaseEntries(root);
    const archive = createReleaseZip(entries);
    const result = verifyReleaseZip(archive);
    assert.equal(archive.includes(Buffer.from(sentinel)), false);
    for (const name of [
      "frontend/package-lock.json",
      "src/Domain.php",
      "scripts/reset-password.php",
      "tests/fixtures/state.php",
      "public/build/.vite/manifest.json",
      "public/build/assets/shared-fixture.js",
      "public/build/assets/lazy-fixture.js",
      "public/build/assets/icon-fixture.svg",
    ])
      assert.ok(result.files.includes(`ShiftSync/${name}`), name);
    for (const name of forbidden.filter((name) => name !== "storage/.gitkeep"))
      assert.equal(result.files.includes(`ShiftSync/${name}`), false, name);
    for (const name of ["storage/.gitkeep", "storage/sessions/.gitkeep"])
      assert.equal(
        entries.find((entry) => entry.name === `ShiftSync/${name}`).data.length,
        0,
      );
    // The packager neither edits nor removes even the deliberately unsafe fixture files.
    for (const name of forbidden)
      assert.equal(
        await fs.readFile(path.join(root, name), "utf8"),
        `${sentinel}\n`,
      );
  });
  await test("Identical inputs produce identical ZIP bytes despite file timestamps and input ordering", async () => {
    const { root } = await fixture();
    const entries = await collectReleaseEntries(root);
    const first = createReleaseZip(entries);
    await fs.utimes(path.join(root, "README.md"), new Date(0), new Date());
    const second = createReleaseZip(
      (await collectReleaseEntries(root)).reverse(),
    );
    assert.deepEqual(first, second);
  });
  await test("Unsafe paths, case collisions and nonempty storage placeholders are rejected", async () => {
    const { root } = await fixture();
    const entries = await collectReleaseEntries(root);
    for (const name of [
      "../outside.php",
      "/absolute.php",
      "C:/private.php",
      "src/../private.php",
      "src\\escape.php",
      "src/NUL.php",
      "src/trailing.",
    ])
      assert.throws(() => assertRelativeName(name));
    assert.throws(
      () =>
        createReleaseZip([
          ...entries,
          { name: "ShiftSync/README.md", data: Buffer.alloc(0) },
        ]),
      /Duplicate/,
    );
    assert.throws(
      () =>
        createReleaseZip(
          entries.map((entry) =>
            entry.name === "ShiftSync/storage/.gitkeep"
              ? { ...entry, data: Buffer.from(sentinel) }
              : entry,
          ),
        ),
      /placeholders must be empty/,
    );
    assert.throws(
      () =>
        createReleaseZip([
          ...entries,
          { name: "ShiftSync/config/local.php", data: Buffer.from(sentinel) },
        ]),
      /Unapproved/,
    );
  });
  await test("Selected-file secret scan fails without including the matched value in its error", async () => {
    const { root } = await fixture();
    const privateHeader = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
    await write(root, "README.md", privateHeader + "\n" + sentinel);
    await assert.rejects(
      () => collectReleaseEntries(root),
      (error) =>
        error.message.includes("Private-key material") &&
        !error.message.includes(sentinel) &&
        !error.message.includes(privateHeader),
    );
    const hash = ["$2y$12$", "A".repeat(53)].join("");
    assert.throws(
      () => assertNoSecretContent("src/Unexpected.php", Buffer.from(hash)),
      /Credential-like/,
    );
    const approvedDummy = [
      "$2y$10$",
      "usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG",
    ].join("");
    assert.doesNotThrow(() =>
      assertNoSecretContent("src/Auth.php", Buffer.from(approvedDummy)),
    );
    assert.throws(
      () =>
        assertNoSecretContent(
          "frontend/package.json",
          Buffer.from('{"schemaVersion":1,"users":{},"assignments":{}}'),
        ),
      /Business snapshot/,
    );
  });
  await test("Build traversal, missing chunks, lockfile and runtime dependencies fail closed", async () => {
    const { root } = await fixture();
    await write(
      root,
      "public/build/.vite/manifest.json",
      '{"entry":{"isEntry":true,"file":"assets/../../storage/state.json"}}',
    );
    await assert.rejects(
      () => collectReleaseEntries(root),
      /Unsafe release entry path|unapproved/,
    );
    await write(
      root,
      "public/build/.vite/manifest.json",
      '{"entry":{"isEntry":true,"file":"assets/missing.js"}}',
    );
    await assert.rejects(() => collectReleaseEntries(root), /ENOENT/);
    const other = await fixture();
    await fs.unlink(path.join(other.root, "frontend/package-lock.json"));
    await assert.rejects(() => collectReleaseEntries(other.root), /ENOENT/);
    for (const name of [
      "src/Passwords.php",
      "src/Auth.php",
      "src/Store.php",
      "scripts/reset-password.php",
      "public/handlers/login.php",
      "public/assets/js/boot.js",
      "public/assets/vendor/bootstrap.bundle.min.js",
      "frontend/src/hooks/useApi.js",
    ]) {
      const missing = await fixture();
      const entries = await collectReleaseEntries(missing.root);
      await fs.unlink(path.join(missing.root, name));
      await assert.rejects(
        () => collectReleaseEntries(missing.root),
        /Required release source is missing/,
        name,
      );
      const incomplete = createReleaseZip(
        entries.filter((entry) => entry.name !== `ShiftSync/${name}`),
      );
      assert.throws(
        () => verifyReleaseZip(incomplete),
        /Required archive source is missing/,
        name,
      );
    }
  });
  await test("Symlink or junction inside selected source is rejected without following its target", async () => {
    const { root } = await fixture();
    const target = path.join(temporary, "outside-source");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "outside.jsx"), sentinel);
    await fs.symlink(
      target,
      path.join(root, "frontend/src/linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(() => collectReleaseEntries(root), /Symlink|junction/);
    const other = await fixture();
    await fs.symlink(
      target,
      path.join(other.root, "linked-output"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      () =>
        packageRelease(
          other.root,
          path.join(other.root, "linked-output/release.zip"),
        ),
      /symlink|junction/,
    );
    await assert.rejects(() => fs.access(path.join(target, "release.zip")));
  });
  await test("Archive verification rejects corrupted bytes and symlink metadata", async () => {
    const { root } = await fixture();
    const archive = createReleaseZip(await collectReleaseEntries(root));
    const corrupt = Buffer.from(archive);
    const firstNameBytes = corrupt.readUInt16LE(26);
    corrupt[30 + firstNameBytes] ^= 1;
    assert.throws(() => verifyReleaseZip(corrupt), /checksum mismatch/);
    const linked = Buffer.from(archive);
    const central = linked.readUInt32LE(linked.length - 6);
    linked.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    assert.throws(() => verifyReleaseZip(linked), /linked|Unsupported/);
    const entries = await collectReleaseEntries(root);
    const unreferenced = createReleaseZip([
      ...entries,
      {
        name: "ShiftSync/public/build/assets/unreferenced.js",
        data: Buffer.from("Unneeded fixture asset"),
      },
    ]);
    assert.throws(
      () => verifyReleaseZip(unreferenced),
      /Unreferenced build asset/,
    );
    const missing = createReleaseZip(
      entries.filter((entry) => !entry.name.endsWith("/shared-fixture.js")),
    );
    assert.throws(
      () => verifyReleaseZip(missing),
      /Referenced build asset is missing/,
    );
  });
  await test("Packaging exclusively creates a new verified deliverable and refuses operational destinations", async () => {
    const { root } = await fixture();
    const output = path.join(root, "artifacts/new-clean.zip");
    const report = await packageRelease(root, output);
    assert.equal(
      report.sha256,
      verifyReleaseZip(await fs.readFile(output)).sha256,
    );
    const bytes = await fs.readFile(output);
    await assert.rejects(
      () => packageRelease(root, output),
      (error) => error.code === "EEXIST",
    );
    assert.deepEqual(await fs.readFile(output), bytes);
    await assert.rejects(
      () => packageRelease(root, path.join(root, "storage/backup.zip")),
      /cannot replace/,
    );
  });
} finally {
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith("shiftsync-release-"));
  await fs.rm(resolved, { recursive: true, force: true });
}
console.log(
  `\n${passed} packaging groups passed; ${failed} failed. Only isolated fixture directories were packaged.`,
);
if (failed) process.exitCode = 1;
