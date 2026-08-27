const fs = require("node:fs");
const path = require("node:path");

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/**
 * Electron 앱 번들의 링크는 모두 번들 안의 상대 경로여야 한다.
 * fs.cp가 기본 옵션으로 상대 링크를 원본의 절대 경로로 바꾸면 DMG가
 * 분리된 뒤 앱이 dyld 단계에서 즉시 종료되므로, 모든 링크를 전수 확인한다.
 */
function hasSafeMacBundleSymlinks(appPath) {
  try {
    const bundleRoot = fs.realpathSync(appPath);
    const pending = [appPath];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          const linkTarget = fs.readlinkSync(entryPath);
          if (path.isAbsolute(linkTarget)) return false;
          const resolved = fs.realpathSync(entryPath);
          if (!isPathInside(bundleRoot, resolved)) return false;
        } else if (stat.isDirectory()) {
          pending.push(entryPath);
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function isValidMacAppBundle(appPath, executableName) {
  try {
    const bundleRoot = fs.realpathSync(appPath);
    fs.accessSync(path.join(appPath, "Contents", "Info.plist"), fs.constants.R_OK);
    fs.accessSync(
      path.join(appPath, "Contents", "MacOS", executableName),
      fs.constants.X_OK,
    );
    const electronFramework = path.join(
      appPath,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Electron Framework",
    );
    fs.accessSync(electronFramework, fs.constants.X_OK);
    if (!isPathInside(bundleRoot, fs.realpathSync(electronFramework))) return false;
    return hasSafeMacBundleSymlinks(appPath);
  } catch {
    return false;
  }
}

module.exports = {
  hasSafeMacBundleSymlinks,
  isPathInside,
  isValidMacAppBundle,
};
