export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SIDE_PX = 12_000;
/** Decoded RGBA costs 4 bytes/pixel; 50 MP is ~200 MB, a practical ceiling for mobile browsers. */
export const MAX_PIXELS = 50_000_000;
export const MIN_SIDE_PX = 100;
export const MAX_FILES = 20;
/**
 * Total pixels across all open images. Pages are repaired one at a time, but every page keeps its
 * original file and full-size PNG results in memory, and export holds them all at once, so memory grows
 * with the batch's pixels. 600 MP is twenty 30 MP photos or fifty 12 MP ones. Provisional: confirm on a mid-range phone.
 */
export const MAX_TOTAL_PIXELS = 600_000_000;
