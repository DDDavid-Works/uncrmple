import { useEffect, useState } from "react";

/** Phone layout: keep in step with the `max-width: 759px` rules in styles.css. */
export const PHONE_QUERY = "(max-width: 759px)";
/** Wide layout, where the right-hand panel sits beside the photo and can be hidden: keep in step with
 *  the `min-width: 1100px` rules in styles.css. */
export const WIDE_QUERY = "(min-width: 1100px)";

const query = (q: string) => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(q) : null);

/** Whether the media query matches now; follows changes (rotating a phone, resizing a window). */
export function useMediaQuery(q: string): boolean {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? false);
  useEffect(() => {
    const list = query(q);
    if (!list) return;
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [q]);
  return matches;
}
