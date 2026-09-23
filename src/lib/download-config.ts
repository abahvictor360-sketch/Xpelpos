// Where the Windows build is hosted. The filenames electron-builder writes
// carry the version, so they are derived from it rather than repeated: bump the
// version here (and in package.json) and both links follow.
const version = process.env.NEXT_PUBLIC_POS_VERSION || "1.0.8";

const releaseBase =
  process.env.NEXT_PUBLIC_POS_RELEASE_BASE ||
  "https://github.com/abahvictor360-sketch/Xpelpos/releases/latest/download";

export const DESKTOP_RELEASE = {
  version,
  installerUrl:
    process.env.NEXT_PUBLIC_POS_INSTALLER_URL ||
    `${releaseBase}/Xpel-POS-Setup-${version}.exe`,
  portableUrl:
    process.env.NEXT_PUBLIC_POS_PORTABLE_URL ||
    `${releaseBase}/Xpel-POS-${version}-portable.exe`,
  installerSize: "113 MB",
  portableSize: "113 MB",
};
