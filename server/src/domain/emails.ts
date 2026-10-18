// The three emails Nkata sends, from the Nkata Emails v1 design (removed with the handoff): one card,
// one action each. Table layout, inline styles, system fonts, dark mode by media query. Every
// value is escaped; the copy follows the engine (a code lives 15 minutes, five tries).
import type { Role } from "@nkata/shared";

/** The words the product uses for each role (docs/product.md, Roles). */
export const ROLE_WORDS: Record<Role, string> = { artist: "Artist", art_director: "Art director", producer: "Producer", viewer: "Viewer" };

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const SANS = "Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const MONO = "'Courier New',Courier,monospace";
const SITE = "https://nkata.app";

/** The frame every email shares: the mark, one card, the footer. */
function frame(preheader: string, card: string, footer: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Nkata</title>
<!--[if mso]><style>table,td{font-family:Arial,Helvetica,sans-serif !important}</style><![endif]-->
<style>
@media (prefers-color-scheme: dark){
  .bg{background-color:#141518 !important}
  .card{background-color:#1B1D21 !important;border-color:#30343A !important}
  .h{color:#EEF0F2 !important}
  .b{color:#C9CDD3 !important}
  .m{color:#9AA0A9 !important}
  .code{background-color:#24272C !important;color:#EEF0F2 !important;border-color:#30343A !important}
  .line{border-color:#30343A !important}
  .mark{border-color:#EEF0F2 !important}
}
@media only screen and (max-width:620px){
  .wrap{width:100% !important}
  .pad{padding-left:20px !important;padding-right:20px !important;padding-top:28px !important}
  .code{font-size:28px !important;letter-spacing:6px !important;padding:14px 18px !important}
  .title{font-size:24px !important;line-height:30px !important}
  .btn{width:100% !important}
  .btn a{text-align:center !important}
}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background-color:#F6F6F4;">
<span style="display:none;font-size:1px;color:#F6F6F4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="bg" style="background-color:#F6F6F4;">
<tr><td align="center" style="padding:40px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" class="wrap" style="width:560px;max-width:560px;">
<tr><td class="pad" style="padding:0 8px 24px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="24" style="width:24px;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="22" style="width:22px;"><tr>
        <td width="16" height="16" style="width:16px;height:16px;border:3px solid #17181B;border-bottom:0;border-radius:11px 11px 0 0;font-size:0;line-height:0;" class="mark">&nbsp;</td>
        <td width="6" style="width:6px;vertical-align:top;padding-left:2px;"><div style="width:5px;height:5px;background-color:#E9A23B;border-radius:3px;font-size:0;line-height:0;">&nbsp;</div></td>
      </tr></table>
    </td>
    <td style="padding-left:10px;font-family:${SANS};font-size:16px;font-weight:700;color:#17181B;letter-spacing:-0.3px;" class="h">nkata</td>
  </tr></table>
</td></tr>
<tr><td class="card" style="background-color:#FFFFFF;border:1px solid #E3E4E1;border-radius:14px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td class="pad" style="padding:40px 40px 36px 40px;">
${card}
  </td></tr></table>
</td></tr>
<tr><td class="pad m" style="padding:24px 8px 0 8px;font-family:${SANS};font-size:12px;line-height:18px;color:#6B717B;">
  ${footer}<br>
  Nkata · <a href="${SITE}" style="color:#6B717B;text-decoration:underline;">nkata.app</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

const title = (t: string) => `<p class="h title" style="margin:0 0 12px 0;font-family:${SERIF};font-size:28px;line-height:34px;font-weight:400;color:#17181B;letter-spacing:-0.3px;">${t}</p>`;
const body = (t: string, mb = 20) => `<p class="b" style="margin:0 0 ${mb}px 0;font-family:${SANS};font-size:15px;line-height:23px;color:#4A4F57;">${t}</p>`;
const strong = (t: string) => `<span class="h" style="color:#17181B;">${esc(t)}</span>`;
const rule = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;"><tr><td class="line" style="border-top:1px solid #E3E4E1;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
const small = (t: string) => `<p class="m" style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:#6B717B;">${t}</p>`;
const button = (label: string, href: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:0 0 28px 0;"><tr><td bgcolor="#E9A23B" style="background-color:#E9A23B;border-radius:10px;mso-padding-alt:0;"><a href="${esc(href)}" style="display:block;padding:13px 22px;font-family:${SANS};font-size:15px;line-height:18px;font-weight:700;color:#17181B;text-decoration:none;border-radius:10px;">${esc(label)}</a></td></tr></table>`;

export const CODE_MINUTES = 15;

export function signInCodeEmail(input: { to: string; code: string }): Email {
  const { to, code } = input;
  const card =
    title("Your sign in code") +
    body(`Enter this code in Nkata to sign in as ${strong(to)}.`) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td class="code" style="background-color:#F6F6F4;border:1px solid #E3E4E1;border-radius:12px;padding:18px 28px;font-family:${MONO};font-size:36px;line-height:44px;letter-spacing:10px;color:#17181B;font-weight:700;">${esc(code)}</td></tr></table>` +
    body(`It works for ${CODE_MINUTES} minutes and once only.`, 28) +
    rule +
    small("If you did not ask for this code, you can ignore this email. Nobody can sign in without it.");
  return {
    to,
    subject: `${code} is your Nkata code`,
    html: frame(`Your Nkata code is ${code}. It works for ${CODE_MINUTES} minutes.`, card, "Sent because someone entered this address in Nkata."),
    text: [`Your Nkata sign in code is ${code}.`, "", `Enter it in Nkata to sign in as ${to}. It works for ${CODE_MINUTES} minutes and once only.`, "", "If you did not ask for this code, ignore this email. Nobody can sign in without it."].join("\n"),
  };
}

/** What each role gets, in the invite's words. */
const ROLE_LINE: Record<string, string> = {
  artist: "You will see every project in the studio, open parts in Blender and Unreal, and publish your work.",
  art_director: "You will see every project in the studio, review work in Unreal, approve it, and send it back.",
  producer: "You will see every project in the studio, invite people, set roles, and roll back anything.",
  viewer: "You will see every project in 3D and leave comments. You do not need Blender or Unreal.",
};

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** The inviter's first name; an account that has not named itself yet goes by the part before the @. */
const firstName = (name: string) => (name.includes("@") ? name.split("@")[0]! : name.split(" ")[0] || name);

export function studioInviteEmail(input: { to: string; studio: string; role: string; inviter: { name: string; email: string }; href: string }): Email {
  const { to, studio, role, inviter, href } = input;
  const roleWord = ROLE_WORDS[role as Role] ?? role;
  const first = firstName(inviter.name);
  const card =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr>
    <td width="40" height="40" bgcolor="#2F6B5E" style="width:40px;height:40px;background-color:#2F6B5E;border-radius:20px;text-align:center;font-family:${SANS};font-size:15px;font-weight:700;color:#FFFFFF;">${esc(inviter.name.charAt(0).toUpperCase())}</td>
    <td style="padding-left:12px;font-family:${SANS};font-size:14px;line-height:20px;color:#4A4F57;" class="b"><span class="h" style="color:#17181B;font-weight:700;">${esc(inviter.name)}</span><br>${esc(inviter.email)}</td>
  </tr></table>` +
    title(`Join ${esc(studio)} on Nkata`) +
    body(`${esc(first)} added you to ${strong(studio)} as ${article(roleWord)} ${strong(roleWord)}. ${esc(ROLE_LINE[role] ?? "")}`) +
    button(`Join ${studio}`, href) +
    rule +
    small(`Sign in with ${esc(to)} and ${esc(studio)} is there. If you were not expecting this, ignore this email.`);
  return {
    to,
    subject: `${first} added you to ${studio} on Nkata`,
    html: frame(`${first} invited you to ${studio} on Nkata.`, card, `Sent because ${esc(first)} invited this address to a studio on Nkata.`),
    text: [`${inviter.name} (${inviter.email}) added you to ${studio} on Nkata as ${article(roleWord)} ${roleWord}.`, "", ROLE_LINE[role] ?? "", "", `Open Nkata and sign in with ${to}: ${href}`].join("\n"),
  };
}

export function projectInviteEmail(input: { to: string; project: { name: string; studio: string; assets: number; people: number }; role: string; inviter: { name: string }; note: string | null; href: string }): Email {
  const { to, project, role, inviter, note, href } = input;
  const roleWord = ROLE_WORDS[role as Role] ?? role;
  const first = firstName(inviter.name);
  const noteBlock = note
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td style="font-family:${SANS};font-size:13px;line-height:20px;color:#6B717B;" class="m">A note from ${esc(first)}</td></tr>
    <tr><td class="b" style="padding-top:6px;font-family:${SERIF};font-size:16px;line-height:24px;color:#4A4F57;font-style:italic;">&ldquo;${esc(note)}&rdquo;</td></tr></table><div style="height:20px;font-size:0;line-height:0;">&nbsp;</div>`
    : "";
  const card =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;"><tr>
    <td width="56" height="56" bgcolor="#2A2420" style="width:56px;height:56px;background-color:#2A2420;border-radius:10px;text-align:center;font-family:${SERIF};font-size:22px;color:#E9A23B;">${esc(project.name.charAt(0).toUpperCase())}</td>
    <td style="padding-left:14px;font-family:${SANS};font-size:14px;line-height:20px;color:#6B717B;" class="m"><span class="h" style="font-family:${SERIF};font-size:20px;color:#17181B;">${esc(project.name)}</span><br>${esc(project.studio)} · ${project.assets} asset${project.assets === 1 ? "" : "s"} · ${project.people} ${project.people === 1 ? "person" : "people"}</td>
  </tr></table>` +
    title(`${esc(first)} shared a project with you`) +
    body(`You are ${article(roleWord)} ${strong(roleWord)} on ${esc(project.name)}. ${esc(ROLE_LINE[role] ?? "")}`) +
    button(`Open ${project.name}`, href) +
    rule +
    noteBlock +
    small(`Sign in with ${esc(to)} and ${esc(project.name)} is there.`);
  return {
    to,
    subject: `${first} shared ${project.name} with you on Nkata`,
    html: frame(`${first} shared ${project.name} with you. See every asset and leave notes.`, card, `Sent because ${esc(first)} invited this address to a project on Nkata.`),
    text: [`${inviter.name} shared ${project.name} (${project.studio}) with you on Nkata. You are ${article(roleWord)} ${roleWord}.`, "", ROLE_LINE[role] ?? "", ...(note ? ["", `A note from ${first}: ${note}`] : []), "", `Open Nkata and sign in with ${to}: ${href}`].join("\n"),
  };
}
