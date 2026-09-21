// Where the Windows build is hosted. Point these at the GitHub release (or any
// static host) that carries the packaged installer, then redeploy.
export const DESKTOP_RELEASE = {
  version: process.env.NEXT_PUBLIC_POS_VERSION || "1.0.0",
  installerUrl:
    process.env.NEXT_PUBLIC_POS_INSTALLER_URL ||
    "https://github.com/abahvictor360-sketch/Xpelpos/releases/latest/download/Xpel-POS-Setup-1.0.0.exe",
  portableUrl:
    process.env.NEXT_PUBLIC_POS_PORTABLE_URL ||
    "https://github.com/abahvictor360-sketch/Xpelpos/releases/latest/download/Xpel-POS-1.0.0-portable.exe",
  installerSize: "113 MB",
  portableSize: "113 MB",
};
