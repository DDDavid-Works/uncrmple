import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { solid, textSheet } from "./synthetic";
import { jpegHeader } from "./fixtures";
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
  blobToJpeg: vi.fn(async () => ({ ok: true, value: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 120, height: 400 } })),
  fileToRaster: vi.fn(async () => ({ ok: true, value: textSheet(300, 500) })),
  rasterToPng: vi.fn(async () => ({ ok: true, value: new Blob(["png"], { type: "image/png" }) })),
}));

let urls = 0;
beforeEach(() => {
  vi.mocked(assessPhoto).mockReset().mockResolvedValue({
    ok: true,
    value: { verdict: "good", summary: "Good.", likeness: "document", pageDetected: true, findings: [] },
  });
  vi.mocked(processor.detectDocument).mockReset().mockResolvedValue({
    ok: true,
    value: {
      corners: [{ x: 90, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 480 }, { x: 90, y: 480 }],
      areaFraction: 0.37,
      edgeSupport: 0.9,
      method: "edges",
    },
  });
  vi.mocked(processor.correctPerspective).mockReset().mockResolvedValue({ ok: true, value: solid(120, 400, 255) });
  vi.mocked(processor.enhance).mockReset().mockImplementation(async (image) => ({ ok: true, value: image }));
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:t/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(500);
});
afterEach(() => vi.restoreAllMocks());

async function uploadReceipt() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("radio", { name: /Receipt/ }));
  await user.upload(
    screen.getByLabelText("Choose document photos"),
    new File([jpegHeader(300, 500)], "lunch.jpg", { type: "image/jpeg" }),
  );
  await screen.findByRole("heading", { name: "lunch.jpg" });
  return user;
}

describe("Receipt mode", () => {
  it("is offered between Document Repair and ID & Card Crop, with its own steps and no sample", async () => {
    const user = userEvent.setup();
    render(<App />);
    const names = screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent?.trim());
    expect(names.slice(0, 3)).toEqual(["Document Repair", "Receipt", "ID & Card Crop"]);

    await user.click(screen.getByRole("radio", { name: /Receipt/ }));
    expect(screen.getByText(/darken faded print/, { selector: ".modes__hint" })).toBeInTheDocument();
    expect(screen.getByText("Add a photo of a receipt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try a sample photo" })).toBeNull();
  });

  it("repairs with the receipt curve, in grayscale by default, and names downloads as receipts", async () => {
    const user = await uploadReceipt();
    expect(screen.getByRole("radio", { name: "Grayscale" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Repair" }));

    expect(await screen.findByAltText("Repaired document: lunch.jpg")).toBeInTheDocument();
    expect(processor.enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "grayscale", profile: "receipt" });
    for (const link of screen.getAllByRole("link", { name: "Download image" })) {
      expect(link).toHaveAttribute("download", "lunch-receipt.png");
    }
  });

  it("keeps receipt and document results apart when switching mode", async () => {
    const user = await uploadReceipt();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: lunch.jpg");

    // Document Repair has not repaired this photo yet, and starts in colour.
    await user.click(screen.getByRole("radio", { name: /Document Repair/ }));
    expect(screen.queryByAltText("Repaired document: lunch.jpg")).toBeNull();
    expect(screen.getByRole("radio", { name: "Color" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    await screen.findByAltText("Repaired document: lunch.jpg");
    expect(processor.enhance).toHaveBeenLastCalledWith(expect.anything(), { style: "color" });

    // Back in Receipt mode the receipt result is still there, unchanged.
    const calls = vi.mocked(processor.enhance).mock.calls.length;
    await user.click(screen.getByRole("radio", { name: /Receipt/ }));
    expect(screen.getByAltText("Repaired document: lunch.jpg")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grayscale" })).toBeChecked();
    expect(processor.enhance).toHaveBeenCalledTimes(calls);
  });

  it("reports a failed repair instead of showing the photo as repaired", async () => {
    vi.mocked(processor.enhance).mockResolvedValue({ ok: false, error: { code: "processing-failed", message: "Enhancement failed" } });
    const user = await uploadReceipt();
    await user.click(screen.getByRole("button", { name: "Repair" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enhancement failed/);
    expect(screen.queryByAltText("Repaired document: lunch.jpg")).toBeNull();
  });
});
