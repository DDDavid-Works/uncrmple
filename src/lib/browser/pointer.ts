/** True on touch-first devices (phones, tablets). False when the query is unsupported, e.g. in tests. */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;
}
