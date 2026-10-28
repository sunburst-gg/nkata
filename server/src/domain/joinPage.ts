// The page an invite's button opens (GET /join). The membership already exists and the app signs
// in by code, so the page has two jobs: get the app onto this computer, then say which email to
// sign in with. The visitor's own system comes first, read from the User-Agent; the other stays
// one click away. Same look as the emails (emails.ts).

export type Platform = "mac" | "windows";

export const DOWNLOADS: Record<Platform, { label: string; file: string; open: string }> = {
  mac: {
    label: "Download for Mac",
    file: "Nkata-mac.dmg",
    open: "The first time, macOS may not open it. Go to System Settings, Privacy and Security, and click Open Anyway.",
  },
  windows: {
    label: "Download for Windows",
    file: "Nkata-windows-setup.exe",
    open: "If Windows SmartScreen stops it, click More info, then Run anyway.",
  },
};

/** Windows when the browser says so, Mac otherwise: the studios Nkata serves work on one or the other. */
export function platformOf(userAgent: string | undefined): Platform {
  return /windows/i.test(userAgent ?? "") ? "windows" : "mac";
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const SANS = "Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export function joinPage(input: { email: string; userAgent: string | undefined; downloadsUrl: string }): string {
  const first = platformOf(input.userAgent);
  const other: Platform = first === "mac" ? "windows" : "mac";
  const base = input.downloadsUrl.replace(/\/+$/, "");
  const href = (p: Platform) => esc(`${base}/${DOWNLOADS[p].file}`);
  const who = input.email ? ` as <b style="color:#17181B">${esc(input.email)}</b>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Join on Nkata</title>
</head>
<body style="margin:0;background:#F6F6F4;color:#17181B;font-family:${SANS}">
<main style="max-width:560px;margin:64px auto;padding:0 16px">
<div style="padding:40px;background:#FFFFFF;border:1px solid #E3E4E1;border-radius:14px">
<h1 style="margin:0 0 12px;font-family:${SERIF};font-size:28px;line-height:34px;font-weight:400">You are in.</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:23px;color:#4A4F57">Two steps and the studio is on your computer.</p>
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6B717B">1. Get Nkata</p>
<a href="${href(first)}" data-platform="${first}" style="display:inline-block;padding:13px 22px;background:#E9A23B;color:#17181B;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">${DOWNLOADS[first].label}</a>
<p style="margin:12px 0 0;font-size:13px;line-height:20px;color:#6B717B">${DOWNLOADS[first].open}</p>
<p style="margin:8px 0 28px;font-size:13px;line-height:20px;color:#6B717B">On ${other === "mac" ? "a Mac" : "Windows"}? <a href="${href(other)}" data-platform="${other}" style="color:#4A4F57">${DOWNLOADS[other].label}</a></p>
<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6B717B">2. Sign in</p>
<p style="margin:0;font-size:15px;line-height:23px;color:#4A4F57">Open Nkata and sign in${who}. A six digit code arrives by email, and the studio is there.</p>
</div>
<p style="margin:24px 8px 0;font-size:12px;line-height:18px;color:#6B717B">Nkata · <a href="https://nkata.app" style="color:#6B717B">nkata.app</a></p>
</main>
</body>
</html>`;
}
