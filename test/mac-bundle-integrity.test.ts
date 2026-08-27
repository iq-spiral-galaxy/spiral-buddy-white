import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, test } from "node:test";

const require = createRequire(import.meta.url);
const { isValidMacAppBundle } = require("../electron/mac-bundle-integrity.cjs") as {
  isValidMacAppBundle: (appPath: string, executableName: string) => boolean;
};

const temporaryRoots: string[] = [];

function makeFixture(root: string, appName = "Spiral Buddy White.app") {
  const appPath = path.join(root, appName);
  const contents = path.join(appPath, "Contents");
  const macOS = path.join(contents, "MacOS");
  const framework = path.join(
    contents,
    "Frameworks",
    "Electron Framework.framework",
  );
  const versionA = path.join(framework, "Versions", "A");
  fs.mkdirSync(macOS, { recursive: true });
  fs.mkdirSync(versionA, { recursive: true });
  fs.writeFileSync(path.join(contents, "Info.plist"), "fixture");
  fs.writeFileSync(path.join(macOS, "Spiral Buddy White"), "fixture", { mode: 0o755 });
  fs.writeFileSync(path.join(versionA, "Electron Framework"), "fixture", {
    mode: 0o755,
  });
  fs.symlinkSync("A", path.join(framework, "Versions", "Current"));
  fs.symlinkSync(
    "Versions/Current/Electron Framework",
    path.join(framework, "Electron Framework"),
  );
  return { appPath, framework };
}

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spiral-mac-bundle-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("macOS update bundle integrity", () => {
  test("packaging creates and verifies an ad-hoc signature after helper renames", () => {
    const afterPack = fs.readFileSync(
      path.resolve("electron/after-pack.cjs"),
      "utf8",
    );
    const builderConfig = fs.readFileSync(
      path.resolve("electron-builder.yml"),
      "utf8",
    );
    assert.match(afterPack, /--force", "--deep", "--sign", "-"/);
    assert.match(afterPack, /--verify", "--deep", "--strict"/);
    assert.match(builderConfig, /identity: null/);
  });

  test("accepts a complete app whose framework links are relative and contained", () => {
    const { appPath } = makeFixture(tempRoot());
    assert.equal(isValidMacAppBundle(appPath, "Spiral Buddy White"), true);
  });

  test("rejects absolute, broken and bundle-escaping framework links", () => {
    for (const target of [
      "/Volumes/Detached DMG/Spiral Buddy White.app/Contents/Frameworks/Electron Framework",
      "Versions/Missing/Electron Framework",
      "../../../../../../outside-framework",
    ]) {
      const root = tempRoot();
      const { appPath, framework } = makeFixture(root);
      const topLink = path.join(framework, "Electron Framework");
      fs.unlinkSync(topLink);
      fs.symlinkSync(target, topLink);
      assert.equal(isValidMacAppBundle(appPath, "Spiral Buddy White"), false, target);
    }
  });

  test("verbatim staging remains launchable after the source bundle disappears", async () => {
    const root = tempRoot();
    const { appPath: sourceApp, framework } = makeFixture(root, "Source.app");
    const stagedApp = path.join(root, "Staged.app");
    await fs.promises.cp(sourceApp, stagedApp, {
      recursive: true,
      force: true,
      verbatimSymlinks: true,
    });
    fs.rmSync(sourceApp, { recursive: true, force: true });

    assert.equal(isValidMacAppBundle(stagedApp, "Spiral Buddy White"), true);
    assert.equal(
      fs.readlinkSync(
        path.join(
          stagedApp,
          path.relative(sourceApp, path.join(framework, "Electron Framework")),
        ),
      ),
      "Versions/Current/Electron Framework",
    );
  });
});
