export function bypassArchiveGate(path: string) {
  return path === "/unlock" || path === "/login" || path === "/chat";
}