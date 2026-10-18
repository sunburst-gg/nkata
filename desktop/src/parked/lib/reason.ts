// The words a failed call shows. Tauri commands reject with a plain string, fetch and our own
// code reject with an Error, so both carry their reason into the toast. Anything else gets
// the fallback. https://v2.tauri.app/develop/calling-rust/#error-handling
export function reasonOf(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
