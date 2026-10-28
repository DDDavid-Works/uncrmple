import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { bentTextPage, leaningTextPhoto, solid } from "./synthetic";
import { downloadBlob } from "../lib/browser/download";
import { jpegHeader } from "./fixtures";
import type { Assessment } from "../types/assessment";
import type { ImageProcessor } from "../types/repair";
import { assessPhoto } from "../lib/image-processing/assessment/assess";

const processor: ImageProcessor = {
  detectDocument: vi.fn(),
  correctPerspective: vi.fn(),
  enhance: vi.fn(),
};

vi.mock("../lib/image-processing/opencv/processor", () => ({ createOpenCvProcessor: () => processor }));
vi.mock("../lib/image-processing/assessment/assess", () => ({ assessPhoto: vi.fn() }));
vi.mock("../lib/browser/download", async (orig) => ({ ...(await orig<typeof import("../lib/browser/download")>()), downloadBlob: vi.fn() }));
vi.mock("../lib/browser/raster", () => ({
  blobToJpeg: vi.fn(async () => ({ ok: true, value: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 320, height: 240 } })),
  fileToRaster: vi.fn(async () => ({ ok: true, value: solid(400, 300, 200) })),
  rasterToPng: vi.fn(async () => ({ ok: true, value: new Blob(["png"], { type: "image/png" }) })),
}));

let urls = 0;
const LIMITED: Assessment = {
  verdict: "limited",
  summary: "Repair is possible, with limitations (sharpness).",
  likeness: "document",
  pageDetected: true,
  findings: [
    { dimension: "sharpness", level: "moderate", confidence: 0.9, detail: "The photo is slightly soft." },
    { dimension: "lighting", level: "unknown", confidence: 0.2, detail: "The page area is too small." },
  ],
};

beforeEach(() => {
  vi.mocked(assessPhoto).mockReset().mockResolvedValue({ ok: true, value: LIMITED });
  vi.mocked(processor.detectDocument).mockReset();
  vi.mocked(processor.correctPerspective).mockReset();
  vi.mocked(processor.enhance).mockReset().mockImplementation(async (image) => ({ ok: true, value: image }));
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:t/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(300);
});
afterEach(() => vi.restoreAllMocks());

async function uploadOne() {
  const user = userEvent.setup();
  render(<App />);
  await user.upload(
    screen.getByLabelText("Choose document photos"),
    new File([jpegHeader(400, 300)], "page.jpg", { type: "image/jpeg" }),
  );
  await screen.findByRole("heading", { name: "page.jpg" });
  return user;
}

describe("repair workflow", () => {
  it("shows the repaired image, can return to the original, and keeps the original URL", async () => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.64,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(320, 240, 255) });

    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));

    const repaired = await screen.findByAltText("Repaired document: page.jpg");
    expect(repaired).toHaveAttribute("src", "blob:t/2");
    expect(screen.getByText(/320×240px/)).toBeInTheDocument();
    expect(screen.getByText(/64% of the photo/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByAltText("Original photo: page.jpg")).toHaveAttribute("src", "blob:t/1");
  });

  it("reports a detection failure and never shows a repaired image", async () => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: false,
      error: { code: "no-document-found", message: "No clear page boundary was found." },
    });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Repair failed: No clear page boundary/);
    expect(screen.queryByAltText(/Repaired document/)).toBeNull();
    expect(screen.getByAltText("Original photo: page.jpg")).toBeInTheDocument();
  });

  it("warns when the detected page covers a small part of the photo", async () => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 90 }, { x: 10, y: 90 }],
        areaFraction: 0.12,
        edgeSupport: 0.9,
        method: "brightness",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(90, 80, 255) });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    const warning = (await screen.findByText(/covers only a small part/)).closest("[role=alert]") as HTMLElement;
    // The warning leads straight to the corner editor, starting from the detected outline.
    const calls = vi.mocked(processor.correctPerspective).mock.calls.length;
    await user.click(within(warning).getByRole("button", { name: "Adjust corners" }));
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(processor.correctPerspective).toHaveBeenCalledTimes(calls); // nothing reprocessed until applied
  });
});

describe("residual tilt", () => {
  const page = { x: 0, y: 0, width: 600, height: 800 };
  async function repairLeaning(angleAt: (t: number) => number) {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.64,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    // First warp is the small copy the tilt is measured on; the second is the final page.
    vi.mocked(processor.correctPerspective)
      .mockResolvedValueOnce({ ok: true, value: leaningTextPhoto(600, 800, page, angleAt) })
      .mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
  }

  it("says how far leaning text was levelled", async () => {
    await repairLeaning(() => -2);
    expect(screen.getByText(/text levelled by 2\.0°/)).toBeInTheDocument();
    expect(screen.queryByText(/lines of text bend/)).toBeNull();
    // The final warp used a rotated quad, not the page outline itself.
    const final = vi.mocked(processor.correctPerspective).mock.calls.at(-1)![1];
    expect(final[0]).not.toEqual({ x: 40, y: 30 });
  });

  it("warns that a curved page could only be partly levelled", async () => {
    await repairLeaning((t) => 3.5 * (1 - t));
    expect(screen.getByText(/lines of text bend across the page/)).toHaveTextContent(/overall tilt was levelled/);
  });

  it("does not claim a bent page was levelled when no rotation was applied", async () => {
    // Opposite leans at the top and bottom around a level middle: bent, while the page as a whole is level.
    await repairLeaning((t) => (t < 1 / 3 ? 1.5 : t < 2 / 3 ? 0 : -1.5));
    const warning = screen.getByText(/lines of text bend across the page/);
    expect(warning).toHaveTextContent(/curve could not be flattened: there were too few lines/);
    expect(screen.queryByText(/levelled by/)).toBeNull();
  });

  it("stays quiet about level text", async () => {
    await repairLeaning(() => 0);
    expect(screen.queryByText(/levelled by/)).toBeNull();
    expect(screen.queryByText(/lines of text bend/)).toBeNull();
  });
});

describe("flattening curved lines", () => {
  const page = { x: 0, y: 0, width: 600, height: 800 };
  const curl = (x: number, y: number) => 10 * Math.sin((Math.PI * x) / 600) * (0.4 + (0.6 * y) / 800);
  async function repairCurved(afterTrial: "flat" | "unchanged") {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.64,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    const curved = bentTextPage(600, 800, curl).image;
    // Warps in order: tilt measurement, flattening trial before and after, final page.
    vi.mocked(processor.correctPerspective)
      .mockResolvedValueOnce({ ok: true, value: leaningTextPhoto(600, 800, page, (t) => 3.5 * (1 - t)) })
      .mockResolvedValueOnce({ ok: true, value: curved })
      .mockResolvedValueOnce({ ok: true, value: afterTrial === "flat" ? bentTextPage(600, 800, () => 0).image : curved })
      .mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
  }

  it("flattens when the trial straightens the lines, and says so", async () => {
    await repairCurved("flat");
    expect(screen.getByText(/curved lines flattened/)).toBeInTheDocument();
    expect(screen.queryByText(/lines of text bend across the page/)).toBeNull();
    // The final warp carried the shift map.
    expect(vi.mocked(processor.correctPerspective).mock.calls.at(-1)![2]).toBeDefined();
  });

  it("leaves the page unflattened, and explains why, when the trial does not help", async () => {
    await repairCurved("unchanged");
    expect(screen.queryByText(/curved lines flattened/)).toBeNull();
    expect(screen.getByText(/lines of text bend across the page/)).toHaveTextContent(/trial did not make the lines clearly straighter/);
    expect(vi.mocked(processor.correctPerspective).mock.calls.at(-1)![2]).toBeUndefined();
  });
});

describe("photo assessment", () => {
  it("shows the verdict and per-dimension findings right after upload, before any repair", async () => {
    const user = await uploadOne();
    const panel = await screen.findByRole("region", { name: "Photo assessment" });
    expect(panel).toHaveTextContent("Repair possible, with limitations");
    expect(panel).toHaveTextContent(/Repair is possible, with limitations \(sharpness\)/);
    await user.click(screen.getByText("Details"));
    expect(screen.getByText(/Sharpness/)).toBeInTheDocument();
    expect(screen.getByText("The photo is slightly soft.")).toBeInTheDocument();
    expect(screen.getByText("Lighting").closest("li")).toHaveTextContent("Not measured");
    expect(processor.correctPerspective).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Repair" })).toBeEnabled();
  });

  it("collapses a good assessment to one line with the explanation under Details", async () => {
    vi.mocked(assessPhoto).mockResolvedValue({
      ok: true,
      value: { ...LIMITED, verdict: "good", summary: "Good repair candidate: no problems found." },
    });
    const user = await uploadOne();
    const panel = await screen.findByRole("region", { name: "Photo assessment" });
    expect(panel).toHaveTextContent("Good repair candidate");
    expect(screen.getByText("Good repair candidate: no problems found.")).not.toBeVisible();
    await user.click(screen.getByText("Details"));
    expect(screen.getByText("Good repair candidate: no problems found.")).toBeVisible();
  });

  it("says the image engine is loading while the first analysis runs", async () => {
    vi.mocked(assessPhoto).mockReturnValue(new Promise(() => {}));
    await uploadOne();
    expect(await screen.findByText(/Loading the image engine/)).toBeInTheDocument();
    expect(screen.getByText(/Then: Analysing the photo/)).toBeInTheDocument();
  });

  it("offers no extra options for a photo that looks like a document", async () => {
    await uploadOne();
    await screen.findByRole("region", { name: "Photo assessment" });
    expect(screen.queryByRole("button", { name: "Clean up whole image" })).toBeNull();
  });

  it("says no document was detected and offers manual corners or a whole-image cleanup", async () => {
    vi.mocked(assessPhoto).mockResolvedValue({
      ok: true,
      value: {
        ...LIMITED,
        likeness: "not-document",
        verdict: "poor",
        pageDetected: false,
        summary: "No document detected. This does not look like a photo of a paper page.",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(400, 300, 255) });
    const user = await uploadOne();
    const panel = await screen.findByRole("region", { name: "Photo assessment" });
    expect(panel).toHaveTextContent("No document detected");
    expect(panel).not.toHaveTextContent("Good repair candidate");
    // Nothing is processed until the user chooses.
    expect(processor.correctPerspective).not.toHaveBeenCalled();
    expect(screen.getByAltText("Original photo: page.jpg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clean up whole image" }));
    await screen.findByAltText("Repaired document: page.jpg");
    expect(processor.detectDocument).not.toHaveBeenCalled();
    expect(processor.correctPerspective).toHaveBeenCalledWith(expect.anything(), [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ]);
    expect(screen.getByText(/manual corners/)).toBeInTheDocument();
  });

  it("opens the corner editor from the notice", async () => {
    vi.mocked(assessPhoto).mockResolvedValue({
      ok: true,
      value: { ...LIMITED, likeness: "uncertain", summary: "A paper page could not be confirmed in this photo." },
    });
    const user = await uploadOne();
    await user.click(await screen.findByRole("button", { name: "Mark corners" }));
    expect(screen.getAllByRole("slider")).toHaveLength(4);
  });

  it("explains an assessment failure and still allows a repair", async () => {
    vi.mocked(assessPhoto).mockResolvedValue({
      ok: false,
      error: { code: "engine-unavailable", message: "The engine could not be loaded." },
    });
    await uploadOne();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be assessed: The engine could not be loaded/);
    expect(screen.getByRole("button", { name: "Repair" })).toBeEnabled();
  });
});

describe("edge support warning", () => {
  async function repairWith(edgeSupport: number) {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.7,
        edgeSupport,
        method: "colour",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
  }

  it("warns when the outline is only loosely on real edges", async () => {
    await repairWith(0.39);
    expect(screen.getByText(/edges were faint, curved/)).toBeInTheDocument();
  });

  it("offers to clean up the whole image from the warning, for a page that fills the photo", async () => {
    await repairWith(0.36);
    const warning = screen.getByText(/edges were faint, curved/).closest("[role=alert]") as HTMLElement;
    expect(within(warning).getByRole("button", { name: "Adjust corners" })).toBeEnabled();
    await userEvent.setup().click(within(warning).getByRole("button", { name: "Clean up whole image" }));
    await waitFor(() => expect(screen.getByText(/manual corners/)).toBeInTheDocument());
    expect(vi.mocked(processor.correctPerspective).mock.lastCall?.[1]).toEqual([
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ]);
    expect(processor.detectDocument).toHaveBeenCalledTimes(1);
    // The user chose the outline, so the faint-edge warning no longer applies.
    expect(screen.queryByText(/edges were faint, curved/)).toBeNull();
  });

  it("does not warn when the outline follows strong edges", async () => {
    await repairWith(0.9);
    expect(screen.queryByText(/edges were faint, curved/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clean up whole image" })).toBeNull();
  });
});

describe("output style", () => {
  const detected = {
    ok: true as const,
    value: {
      corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }] as never,
      areaFraction: 0.7,
      edgeSupport: 0.9,
      method: "edges" as const,
    },
  };
  beforeEach(() => {
    vi.mocked(processor.detectDocument).mockResolvedValue(detected);
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
  });

  it("repairs with the selected style", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("radio", { name: "Grayscale" }));
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
    expect(processor.enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "grayscale" });
    expect(screen.getByText(/Grayscale · page detected by edges/)).toBeInTheDocument();
  });

  it("re-applies a new style to an existing repair without detecting the page again", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
    expect(screen.getByRole("radio", { name: "Color" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Black & white" }));
    await screen.findByText(/Black & white · page detected by edges \(70% of the photo\)/);

    expect(processor.detectDocument).toHaveBeenCalledTimes(1);
    expect(processor.enhance).toHaveBeenCalledTimes(2);
    expect(processor.enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "blackwhite" });
    expect(screen.getByAltText("Repaired document: page.jpg")).toBeInTheDocument();
  });

  it("explains the black and white trade-off only when it is selected", async () => {
    const user = await uploadOne();
    expect(screen.queryByText(/drop faint text/)).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Black & white" }));
    expect(screen.getByText(/drop faint text/)).toBeInTheDocument();
  });

  it("shows an error, not a styled image, if enhancement fails", async () => {
    vi.mocked(processor.enhance).mockResolvedValue({
      ok: false,
      error: { code: "processing-failed", message: "Enhancement failed" },
    });
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Repair failed: Enhancement failed/);
    expect(screen.queryByAltText(/Repaired document/)).toBeNull();
  });
});

describe("manual corners", () => {
  const manualResult = { ok: true as const, value: solid(300, 200, 255) };

  it("offers manual corners after detection fails and repairs with them", async () => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: false,
      error: { code: "no-document-found", message: "No clear page boundary was found." },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue(manualResult);
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Adjust corners" }));
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Apply corners" }));

    await screen.findByAltText("Repaired document: page.jpg");
    expect(processor.detectDocument).toHaveBeenCalledTimes(1);
    expect(processor.correctPerspective).toHaveBeenCalledWith(expect.anything(), [
      { x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 },
    ]);
    expect(screen.getByText(/manual corners/)).toBeInTheDocument();
  });

  it("moves a corner with the keyboard and refuses an invalid shape", async () => {
    vi.mocked(processor.correctPerspective).mockResolvedValue(manualResult);
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Adjust corners" }));

    // Drag the top-left handle past the bottom-right one: the outline becomes invalid.
    const topLeft = screen.getByRole("slider", { name: "Top left corner" });
    topLeft.focus();
    await user.keyboard("{Shift>}{ArrowRight>30/}{ArrowDown>30/}{/Shift}");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply corners" })).toBeDisabled();
    expect(processor.correctPerspective).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Apply corners" })).toBeEnabled();
  });

  it("keeps adjusted corners when Repair again is clicked instead of detecting again", async () => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 10, y: 10 }, { x: 390, y: 10 }, { x: 390, y: 290 }, { x: 10, y: 290 }],
        areaFraction: 0.9,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue(manualResult);
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");

    await user.click(screen.getByRole("button", { name: "Adjust corners" }));
    await user.click(screen.getByRole("button", { name: "Apply corners" }));
    await screen.findByText(/manual corners/);
    const adjusted = vi.mocked(processor.correctPerspective).mock.calls.at(-1)![1];

    vi.mocked(processor.correctPerspective).mockClear();
    await user.click(screen.getByRole("button", { name: "Repair again" }));
    await waitFor(() => expect(processor.correctPerspective).toHaveBeenCalledWith(expect.anything(), adjusted));
    expect(processor.detectDocument).toHaveBeenCalledTimes(1);
  });

  it("cancels without repairing and keeps the original", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Adjust corners" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("slider")).toBeNull();
    expect(processor.correctPerspective).not.toHaveBeenCalled();
    expect(screen.getByAltText("Original photo: page.jpg")).toHaveAttribute("src", "blob:t/1");
  });
});

describe("export", () => {
  beforeEach(() => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.7,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
    vi.mocked(downloadBlob).mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob(["png"]) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers no export before anything is repaired", async () => {
    await uploadOne();
    expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Download image" })).toBeNull();
  });

  it("downloads the repaired image under a derived name", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    const link = await screen.findByRole("link", { name: "Download image" });
    expect(link).toHaveAttribute("download", "page-repaired.png");
    expect(link).toHaveAttribute("href", "blob:t/2");
  });

  it("creates a PDF of the repaired pages", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await user.click(await screen.findByRole("button", { name: "Download PDF (1 page)" }));
    expect(screen.getByText("1 of 1 repaired")).toBeInTheDocument();
    await vi.waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]!;
    expect(name).toBe("repaired-document.pdf");
    expect((blob as Blob).type).toBe("application/pdf");
  });
});

describe("comparison and page order", () => {
  beforeEach(() => {
    vi.mocked(processor.detectDocument).mockResolvedValue({
      ok: true,
      value: {
        corners: [{ x: 40, y: 30 }, { x: 360, y: 30 }, { x: 360, y: 270 }, { x: 40, y: 270 }],
        areaFraction: 0.7,
        edgeSupport: 0.9,
        method: "edges",
      },
    });
    vi.mocked(processor.correctPerspective).mockResolvedValue({ ok: true, value: solid(320, 240, 255) });
  });

  it("shows the original and repaired images together", async () => {
    const user = await uploadOne();
    expect(screen.queryByRole("button", { name: "Side by side" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
    await user.click(screen.getByRole("button", { name: "Side by side" }));
    expect(screen.getByAltText("Original photo: page.jpg")).toHaveAttribute("src", "blob:t/1");
    expect(screen.getByAltText("Repaired document: page.jpg")).toHaveAttribute("src", "blob:t/2");
  });

  it("wipes between the straightened page and the cleaned result", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
    await user.click(screen.getByRole("button", { name: "Compare cleanup" }));

    expect(screen.getByAltText("Straightened page before cleanup: page.jpg")).toHaveAttribute("src", "blob:t/3");
    expect(screen.getByAltText("Repaired document: page.jpg")).toHaveAttribute("src", "blob:t/2");
    const wipe = screen.getByRole("slider", { name: "Compare straightened and cleaned" });
    expect(screen.getByText("Drag to compare")).toBeInTheDocument();
    fireEvent.change(wipe, { target: { value: "80" } });
    expect(wipe).toHaveAttribute("aria-valuetext", "80% straightened shown");
    expect(screen.queryByText("Drag to compare")).toBeNull();
  });

  it("reuses the straightened page when only the style changes, and frees both images on removal", async () => {
    const user = await uploadOne();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: page.jpg");
    await user.click(screen.getByRole("radio", { name: "Grayscale" }));
    await screen.findByText(/Grayscale · page detected/);

    await user.click(screen.getByRole("button", { name: "Compare cleanup" }));
    expect(screen.getByAltText("Straightened page before cleanup: page.jpg")).toHaveAttribute("src", "blob:t/3");
    expect(screen.getByAltText("Repaired document: page.jpg")).toHaveAttribute("src", "blob:t/4");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/2");
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith("blob:t/3");

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/3"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/4");
  });

  it("reorders pages and keeps the order in the page list", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText("Choose document photos"), [
      new File([jpegHeader(400, 300)], "first.jpg", { type: "image/jpeg" }),
      new File([jpegHeader(400, 300)], "second.jpg", { type: "image/jpeg" }),
    ]);
    await screen.findByRole("heading", { name: "first.jpg" });
    const labels = () => screen.getAllByText(/^\d\. /).map((e) => e.textContent);
    await vi.waitFor(() => expect(labels()).toEqual(["1. first.jpg", "2. second.jpg"]));

    expect(screen.getByRole("button", { name: "Move first.jpg earlier" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move first.jpg later" }));
    expect(labels()).toEqual(["1. second.jpg", "2. first.jpg"]);
    expect(screen.getByRole("button", { name: "Move first.jpg later" })).toBeDisabled();
  });
});
