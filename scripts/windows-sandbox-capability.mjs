import { spawnSync } from "node:child_process";

export function windowsLogonSidAvailable(platform = process.platform, env = process.env) {
  if (platform !== "win32") return true;
  const probe = spawnSync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "$groups = [Security.Principal.WindowsIdentity]::GetCurrent().Groups; " +
      "$groups.Value -like 'S-1-5-5-*' | Select-Object -First 1",
  ], {
    encoding: "utf8",
    env,
    windowsHide: true,
    timeout: 10_000,
  });
  return probe.status === 0 && probe.stdout.trim() !== "";
}
