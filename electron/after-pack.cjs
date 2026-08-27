// electron-builder afterPack hook — macOS Helper 앱을 CFBundleName에 맞게 rename.
//
// v0.5.95 — dock 호버 이름을 "Spiral Buddy White"로 띄우기 위한 핵심 조각.
//
// 배경 (실측으로 확정):
// - macOS dock 툴팁은 CFBundleName을 읽는다 (CFBundleDisplayName/.app 파일명 X).
//   v0.5.92(CFBundleName=Blue)→dock "Blue", v0.5.94(CFBundleName=기본)→"Spiral
//   Buddy"로 바뀐 대조가 증거.
// - 그런데 Electron 메인 프로세스는 CFBundleName으로 Helper 앱 이름
//   (`<CFBundleName> Helper.app`)을 유추해 찾는다. 그래서 CFBundleName을
//   "Spiral Buddy White"로 두면 "Spiral Buddy White Helper.app"을 찾는데,
//   electron-builder는 Helper를 productName 기준 "Spiral Buddy Helper.app"로
//   패키징 → 이름 불일치 → "Unable to find helper app" FATAL(크래시).
//
// 해법: extendInfo로 CFBundleName="Spiral Buddy White"를 설정하고, 이 훅에서
// Helper 앱 4종(+executable+Info.plist)을 "Spiral Buddy White Helper*"로 rename해
// CFBundleName과 일치시킨다. → dock에 Blue 표시 + 크래시 없음.
//
// Helper 이름과 Info.plist를 바꾼 뒤 앱 전체를 ad-hoc 서명하고 즉시 검증한다.
// electron-builder의 identity:"-"는 인증서 이름 "-"를 찾을 뿐 ad-hoc 서명을
// 만들지 않아 실제 릴리즈가 unsigned였음. updater는 번들을 verbatim 복사하므로
// sealed resources와 서명도 그대로 유지된다.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function signAndVerify(appPath, bundleName) {
  execFileSync(
    "/usr/bin/codesign",
    ["--force", "--deep", "--sign", "-", appPath],
    { stdio: "inherit" },
  );
  execFileSync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", appPath],
    { stdio: "inherit" },
  );
  console.log(`[after-pack] ad-hoc signature verified for "${bundleName}"`);
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productFilename = context.packager.appInfo.productFilename; // "Spiral Buddy"
  const appPath = path.join(context.appOutDir, `${productFilename}.app`);
  const plist = path.join(appPath, "Contents", "Info.plist");
  const fw = path.join(appPath, "Contents", "Frameworks");

  // extendInfo로 설정된 메인 CFBundleName 읽기.
  let bundleName;
  try {
    bundleName = execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", "Print :CFBundleName", plist],
      { encoding: "utf8" },
    ).trim();
  } catch {
    return;
  }
  if (!bundleName) return;
  // 기본값(productFilename)과 같으면 Helper 이름은 이미 일치한다. rename 없이
  // 번들 전체의 ad-hoc 서명만 생성·검증한다.
  if (bundleName === productFilename) {
    signAndVerify(appPath, bundleName);
    return;
  }

  const pbSet = (file, key, val) =>
    execFileSync("/usr/libexec/PlistBuddy", ["-c", `Set :${key} ${val}`, file], {
      stdio: "ignore",
    });

  // Helper 변형 4종: "" / " (GPU)" / " (Plugin)" / " (Renderer)"
  const suffixes = [" (GPU)", " (Plugin)", " (Renderer)", ""];
  let renamed = 0;
  for (const sfx of suffixes) {
    const oldName = `${productFilename} Helper${sfx}`; // "Spiral Buddy Helper (GPU)"
    const newName = `${bundleName} Helper${sfx}`; //      "Spiral Buddy White Helper (GPU)"
    const oldApp = path.join(fw, `${oldName}.app`);
    const newApp = path.join(fw, `${newName}.app`);
    if (!fs.existsSync(oldApp)) continue;

    const macos = path.join(oldApp, "Contents", "MacOS");
    fs.renameSync(path.join(macos, oldName), path.join(macos, newName));
    const hplist = path.join(oldApp, "Contents", "Info.plist");
    pbSet(hplist, "CFBundleExecutable", newName);
    try {
      pbSet(hplist, "CFBundleName", newName);
    } catch {}
    fs.renameSync(oldApp, newApp);
    renamed++;
  }

  console.log(
    `[after-pack] ${renamed} helper(s) renamed to "${bundleName} Helper*"`,
  );
  signAndVerify(appPath, bundleName);
};
