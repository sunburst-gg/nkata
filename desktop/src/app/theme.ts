// Theme: data-theme on <html>. Light on first launch, always, whatever the OS says (PROMPTS.md,
// Decisions 1). The person can pick Light, Dark or Match system later in Settings; the choice
// is stored per person under their id, so a second account on the same machine starts light.
export type ThemeChoice = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const KEY = (person: string) => `nkata.theme.${person}`;
let person = "anon";
let current: ThemeChoice = "light";

function resolve(choice: ThemeChoice): Theme {
  if (choice !== "system") return choice;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(choice: ThemeChoice): Theme {
  current = choice;
  const theme = resolve(choice);
  document.documentElement.setAttribute("data-theme", theme);
  return theme;
}

/** Reads the stored choice for a person. Nothing stored, or anything unreadable, means light. */
export function storedTheme(id: string): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function setPerson(id: string): Theme {
  person = id;
  return applyTheme(storedTheme(id));
}

export function setTheme(choice: ThemeChoice): Theme {
  try { localStorage.setItem(KEY(person), choice); } catch { /* private mode: the choice lasts the session */ }
  return applyTheme(choice);
}

export function themeChoice(): ThemeChoice { return current; }
export function themeNow(): Theme { return resolve(current); }

/** Match system follows the OS while it is the choice. */
if (typeof matchMedia === "function") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (current === "system") applyTheme("system"); });
}
