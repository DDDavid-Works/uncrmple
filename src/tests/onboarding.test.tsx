import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { solid, textSheet } from "./synthetic";
import { jpegHeader } from "./fixtures";
import type { ImageProcessor } from "../types/repair";
import { assessPhoto } from "../lib/image-processing/assessment/assess";
import { createSamplePhoto, SAMPLE_FILE_NAME } from "../features/onboarding/sample-photo";
import { markTipSeen, reloadTips, TIPS_STORAGE_KEY } from "../features/onboarding/tips";

const processor: ImageProcessor = {
  detectDocument: vi.fn(),
  correctPerspective: vi.fn(),
  enhance: vi.fn(),
};

vi.mock("../lib/image-processing/opencv/processor", () => ({ createOpenCvProcessor: () => processor }));
vi.mock("../lib/image-processing/assessment/assess", () => ({ assessPhoto: vi.fn() }));
vi.mock("../lib/browser/raster", () => ({
  blobToJpeg: vi.fn(async () => ({ ok: true, value: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 320, height: 240 } })),
  fileToRaster: vi.fn(async () => ({ ok: true, value: textSheet(400, 300) })),
  rasterToPng: vi.fn(async () => ({ ok: true, value: new Blob(["png"], { type: "image/png" }) })),
}));
// jsdom has no canvas to draw the sample on; stand in a photo with the same name.
vi.mock("../features/onboarding/sample-photo", async (orig) => ({
  ...(await orig<typeof import("../features/onboarding/sample-photo")>()),
  createSamplePhoto: vi.fn(),
}));

const sampleFile = () => new File([jpegHeader(400, 300)], SAMPLE_FILE_NAME, { type: "image/jpeg" });
const pageFile = () => new File([jpegHeader(400, 300)], "page.jpg", { type: "image/jpeg" });

let urls = 0;
beforeEach(() => {
  vi.mocked(assessPhoto).mockReset().mockResolvedValue({ ok: false, error: { code: "processing-failed", message: "skip" } });
  vi.mocked(createSamplePhoto).mockReset().mockImplementation(async () => sampleFile());
  vi.mocked(processor.detectDocument).mockReset().mockResolvedValue({
    ok: true,
    value: {
      corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
      areaFraction: 0.64,
      edgeSupport: 0.9,
      method: "edges",
    },
  });
  vi.mocked(processor.correctPerspective).mockReset().mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
  vi.mocked(processor.enhance).mockReset().mockImplementation(async (image) => ({ ok: true, value: image }));
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:t/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(300);
});
afterEach(() => vi.restoreAllMocks());

const COMPARE_TIP = /to see what changed/;

async function repairOne() {
  const user = userEvent.setup();
  const view = render(<App />);
  await user.upload(screen.getByLabelText("Choose document photos"), pageFile());
  await screen.findByRole("heading", { name: "page.jpg" });
  await user.click(screen.getByRole("button", { name: "Repair" }));
  await screen.findByAltText("Repaired document: page.jpg");
  return { user, view };
}

describe("first visit", () => {
  it("shows the three steps and a sample photo on the empty screen", () => {
    render(<App />);
    const steps = screen.getByRole("list", { name: "How it works" });
    expect(steps).toHaveTextContent(/Add a photo of a page.*Repair it to straighten and clean up.*Download an image or PDF/);
    expect(screen.getByRole("button", { name: "Try a sample photo" })).toBeInTheDocument();
  });

  it("offers no document sample in ID & Card Crop", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("radio", { name: /ID & Card Crop/ }));
    expect(screen.getByRole("list", { name: "How it works" })).toHaveTextContent(/Add a photo of a card/);
    expect(screen.queryByRole("button", { name: "Try a sample photo" })).not.toBeInTheDocument();
  });

  it("adds the sample like any chosen photo, ready to repair", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try a sample photo" }));
    expect(await screen.findByRole("heading", { name: SAMPLE_FILE_NAME })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair" })).toBeEnabled();
    expect(createSamplePhoto).toHaveBeenCalledTimes(1);
  });

  it("says so when the sample cannot be made, and leaves uploading available", async () => {
    vi.mocked(createSamplePhoto).mockRejectedValue(new Error("no canvas"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Try a sample photo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/sample photo could not be created/);
    expect(screen.getByRole("button", { name: "Choose photos" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: SAMPLE_FILE_NAME })).not.toBeInTheDocument();
  });
});

describe("compare tip", () => {
  it("appears after the first repair and is not shown again once dismissed", async () => {
    const { user, view } = await repairOne();
    expect(screen.getByText(COMPARE_TIP)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide tip" }));
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(TIPS_STORAGE_KEY)!)).toEqual(["compare-result"]);

    // A later visit on the same device: read back from storage.
    view.unmount();
    reloadTips();
    await repairOne();
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
  });

  it("goes away once the original is opened", async () => {
    const { user } = await repairOne();
    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
    expect(screen.getByAltText("Original photo: page.jpg")).toBeInTheDocument();
  });

  it("is not shown before anything is repaired", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText("Choose document photos"), pageFile());
    await screen.findByRole("heading", { name: "page.jpg" });
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
  });

  it("still works, for this visit, when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    reloadTips();
    const { user } = await repairOne();
    expect(screen.getByText(COMPARE_TIP)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide tip" }));
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
  });

  it("stays hidden on a device that has seen it", async () => {
    markTipSeen("compare-result");
    await repairOne();
    expect(screen.queryByText(COMPARE_TIP)).not.toBeInTheDocument();
  });
});
