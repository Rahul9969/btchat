/** Random lowercase hex string with `bytes * 2` characters. */
export function randomId(bytes = 8): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("");
}
