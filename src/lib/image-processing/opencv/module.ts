import cvModule from "@techstark/opencv-js";

/**
 * Isolated so that `import("./module")` yields a plain namespace. The OpenCV export itself is a
 * thenable emscripten Module and must never be the direct result of a dynamic import or await.
 */
export const getOpenCvExport = (): unknown => cvModule;
