import type { CardImageProcessor } from "../../../types/repair";
import { detectCard } from "./detect-card";
import { detectDocument } from "./detect";
import { enhance } from "./enhance";
import { enhanceCard } from "./enhance-card";
import { loadOpenCv } from "./loader";
import { correctPerspective } from "./warp";

/** Processor backed by OpenCV.js, loaded lazily on first use. */
export function createOpenCvProcessor(): CardImageProcessor {
  return {
    async detectDocument(image) {
      const cv = await loadOpenCv();
      return cv.ok ? detectDocument(cv.value, image) : cv;
    },
    async detectCard(image) {
      const cv = await loadOpenCv();
      return cv.ok ? detectCard(cv.value, image) : cv;
    },
    async enhanceCard(image, options) {
      const cv = await loadOpenCv();
      return cv.ok ? enhanceCard(cv.value, image, options) : cv;
    },
    async correctPerspective(image, corners, shift, page) {
      const cv = await loadOpenCv();
      return cv.ok ? correctPerspective(cv.value, image, corners, shift, page) : cv;
    },
    async enhance(image, options) {
      const cv = await loadOpenCv();
      return cv.ok ? enhance(cv.value, image, options) : cv;
    },
  };
}
