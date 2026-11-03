import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { solid } from "./synthetic";
import { jpegHeader } from "./fixtures";
import { assessPhoto } from "../lib/image-processing/assessment/assess";
import type { CardDetection, CardImageProcessor, Quad } from "../types/repair";

const processor: CardImageProcessor = {
  detectDocument: vi.fn(),
  detectCard: vi.fn(),
  enhanceCard: vi.fn(),
  correctPerspective: vi.fn(),
  enhance: vi.fn(),
};

vi.mock("../lib/image-processing/opencv/processor", () => ({ createOpenCvProcessor: () => processor }));
vi.mock("../lib/image-processing/assessment/assess", () => ({ assessPhoto: vi.fn() }));
vi.mock("../lib/browser/download", async (orig) => ({ ...(await orig<typeof import("../lib/browser/download")>()), downloadBlob: vi.fn() }));
vi.mock("../lib/browser/raster", () => ({
  blobToJpeg: vi.fn(),
  fileToRaster: vi.fn(async () => ({ ok: true, value: solid(400, 300, 200) })),
  rasterToPng: vi.fn(async () => ({ ok: true, value: new Blob(["png"], { type: "image/png" }) })),
}));

const CARD: Quad = [{ x: 60, y: 60 }, { x: 340, y: 60 }, { x: 340, y: 236 }, { x: 60, y: 236 }];
const detection = (over: Partial<CardDetection> = {}): CardDetection => ({
  corners: CARD,
  confidence: 0.95,
  level: "ready",
  aspectRatio: 1.59,
  areaFraction: 0.4,
  edgeSupport: 0.9,
  sideVisibility: [1, 1, 1, 1],
  warnings: [],
  ...over,
});

let urls = 0;
beforeEach(() => {
  vi.mocked(assessPhoto).mockReset();
  vi.mocked(processor.detectCard).mockReset();
  vi.mocked(processor.enhanceCard).mockReset().mockResolvedValue({ ok: true, value: solid(318, 200, 180) });
  vi.mocked(processor.correctPerspective).mockReset().mockResolvedValue({ ok: true, value: solid(318, 200, 255) });
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:t/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(300);
});
afterEach(() => vi.restoreAllMocks());

async function uploadInCardMode() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("radio", { name: /ID & Card Crop/ }));
  await user.upload(
    screen.getByLabelText("Choose document photos"),
    new File([jpegHeader(400, 300)], "id.jpg", { type: "image/jpeg" }),
  );
  await screen.findByRole("heading", { name: "id.jpg" });
  return user;
}

describe("ID & Card Crop mode", () => {
  it("defaults to Document Repair and offers both modes", () => {
    render(<App />);
    expect(screen.getByRole("radio", { name: /Document Repair/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /ID & Card Crop/ })).not.toBeChecked();
  });

  it("crops straight away on a confident detection, keeping the original available", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));

    expect(await screen.findByAltText("Cropped card: id.jpg")).toHaveAttribute("src", "blob:t/2");
    expect(screen.getByText(/Card detected and cropped/)).toBeInTheDocument();
    expect(screen.getByText(/not a probability/)).toBeInTheDocument();
    expect(screen.getByText(/not make an ID image suitable for official verification/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download image" })).toHaveAttribute("download", "id-card.png");
    expect(processor.correctPerspective).toHaveBeenCalledWith(expect.anything(), CARD);

    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByAltText("Original photo: id.jpg")).toHaveAttribute("src", "blob:t/1");
  });

  it("does not crop a low-confidence detection until the user confirms the corners", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({
      ok: true,
      value: detection({ level: "verify", confidence: 0.6, warnings: ["edge-unclear"] }),
    });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));

    expect(await screen.findByText(/Card detected — please verify the corners/)).toBeInTheDocument();
    expect(screen.getByText(/hard to see/)).toBeInTheDocument();
    expect(processor.correctPerspective).not.toHaveBeenCalled();
    expect(screen.queryByAltText(/Cropped card/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Apply corners" }));
    expect(await screen.findByAltText("Cropped card: id.jpg")).toBeInTheDocument();
    expect(processor.correctPerspective).toHaveBeenCalledWith(expect.anything(), CARD);
    expect(screen.getByText(/Cropped using the corners you set/)).toBeInTheDocument();
  });

  it("falls back to manual corners when nothing is detected", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({
      ok: false,
      error: { code: "no-card-found", message: "No card outline was found automatically." },
    });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));

    expect(await screen.findByText(/Automatic detection failed — select the corners manually/)).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(screen.queryByAltText(/Cropped card/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Apply corners" }));
    expect(await screen.findByAltText("Cropped card: id.jpg")).toBeInTheDocument();
  });

  it("lets the user place corners without running detection, and cancel back out", async () => {
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Place corners manually" }));
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(processor.detectCard).not.toHaveBeenCalled();
    expect(screen.getByAltText("Original photo: id.jpg")).toBeInTheDocument();
  });

  it("reports a crop failure and keeps manual placement available", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    vi.mocked(processor.correctPerspective).mockResolvedValue({
      ok: false,
      error: { code: "processing-failed", message: "Perspective correction failed" },
    });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Card processing failed: Perspective correction failed/);
    expect(screen.queryByAltText(/Cropped card/)).toBeNull();
    expect(screen.getByRole("button", { name: "Place corners manually" })).toBeEnabled();
  });

  it("reset discards the crop, releases its URL and returns to the original", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await screen.findByAltText("Cropped card: id.jpg");

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.queryByAltText(/Cropped card/)).toBeNull();
    expect(screen.getByAltText("Original photo: id.jpg")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/2");
    expect(screen.getByRole("button", { name: "Find card" })).toBeInTheDocument();
  });

  it("turns the cropped card with the same corners, and reset clears the turn", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await screen.findByAltText("Cropped card: id.jpg");

    await user.click(screen.getByRole("button", { name: "Rotate right (clockwise)" }));
    expect(await screen.findByText(/200×318px .* turned right/)).toBeInTheDocument();
    expect(processor.correctPerspective).toHaveBeenCalledTimes(2);
    expect(processor.correctPerspective).toHaveBeenLastCalledWith(expect.anything(), CARD);
    expect(processor.detectCard).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/2");

    await user.click(screen.getByRole("button", { name: "Rotate right (clockwise)" }));
    expect(await screen.findByText(/318×200px .* turned upside down/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rotate left (anticlockwise)" }));
    await user.click(screen.getByRole("button", { name: "Rotate left (anticlockwise)" }));
    expect(await screen.findByText(/Cropped · 318×200px/)).not.toHaveTextContent(/turned/);

    await user.click(screen.getByRole("button", { name: "Rotate left (anticlockwise)" }));
    expect(await screen.findByText(/turned left/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(screen.getByRole("button", { name: "Find card" }));
    expect(await screen.findByText(/Cropped · 318×200px/)).not.toHaveTextContent(/turned/);
  });

  it("does not run page assessment in card mode", async () => {
    await uploadInCardMode();
    expect(assessPhoto).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Photo assessment" })).toBeNull();
  });

  it("offers a PDF of the cropped cards only", async () => {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    const user = await uploadInCardMode();
    expect(screen.queryByRole("region", { name: "Export" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await screen.findByAltText("Cropped card: id.jpg");
    expect(screen.getByRole("button", { name: /Download PDF \(1 page\)/ })).toBeInTheDocument();
  });
});

describe("optional card enhancement", () => {
  async function cropped() {
    vi.mocked(processor.detectCard).mockResolvedValue({ ok: true, value: detection() });
    const user = await uploadInCardMode();
    await user.click(screen.getByRole("button", { name: "Find card" }));
    await screen.findByAltText("Cropped card: id.jpg");
    return user;
  }

  it("is off by default and the crop is shown without any enhancement", async () => {
    await cropped();
    for (const name of [/Even out lighting/, /Brightness & contrast/, /Reduce noise/, /Sharpen slightly/, /Grayscale/]) {
      expect(screen.getByRole("checkbox", { name })).not.toBeChecked();
    }
    expect(processor.enhanceCard).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Crop only" })).toBeNull();
  });

  it("applies selected touch-ups to the existing crop and keeps the plain crop viewable", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));

    expect(await screen.findByAltText("Enhanced card: id.jpg")).toBeInTheDocument();
    expect(processor.enhanceCard).toHaveBeenCalledWith(
      expect.objectContaining({ width: 318, height: 200 }),
      { evenLighting: false, autoContrast: false, denoise: true, sharpen: false, grayscale: false },
    );
    expect(processor.correctPerspective).toHaveBeenCalledTimes(1); // no re-warp, no re-detection
    expect(processor.detectCard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Crop only" }));
    expect(screen.getByAltText("Cropped card, no enhancement: id.jpg")).toHaveAttribute("src", "blob:t/2");
    await user.click(screen.getByRole("button", { name: "Original" }));
    expect(screen.getByAltText("Original photo: id.jpg")).toHaveAttribute("src", "blob:t/1");
  });

  it("offers a before/after wipe of the plain crop against the touch-ups only when enhanced", async () => {
    const user = await cropped();
    expect(screen.queryByRole("button", { name: "Compare touch-ups" })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    await screen.findByAltText("Enhanced card: id.jpg");

    await user.click(screen.getByRole("button", { name: "Compare touch-ups" }));
    expect(screen.getByRole("slider", { name: "Compare crop only and enhanced" })).toHaveValue("50");
    expect(screen.getByAltText("Cropped card, no enhancement: id.jpg")).toHaveAttribute("src", "blob:t/2");
    expect(screen.getByAltText("Enhanced card: id.jpg")).toHaveAttribute("src", "blob:t/3");
  });

  it("releases the previous enhanced image when options change and returns to the plain crop when all are off", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Sharpen slightly/ }));
    await screen.findByAltText("Enhanced card: id.jpg"); // blob:t/3
    await user.click(screen.getByRole("checkbox", { name: /Grayscale/ }));
    await screen.findByText(/Applying touch-ups…/).catch(() => undefined);
    await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/3"));

    await user.click(screen.getByRole("checkbox", { name: /Sharpen slightly/ }));
    await user.click(screen.getByRole("checkbox", { name: /Grayscale/ }));
    expect(await screen.findByAltText("Cropped card: id.jpg")).toHaveAttribute("src", "blob:t/2");
    expect(screen.queryByRole("button", { name: "Crop only" })).toBeNull();
  });

  it("reports a failed touch-up honestly and keeps showing the plain crop", async () => {
    vi.mocked(processor.enhanceCard).mockResolvedValue({
      ok: false,
      error: { code: "processing-failed", message: "Card enhancement failed" },
    });
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    expect(await screen.findByText(/Touch-ups could not be applied: Card enhancement failed/)).toBeInTheDocument();
    expect(screen.getByAltText("Cropped card: id.jpg")).toHaveAttribute("src", "blob:t/2");
    expect(screen.queryByAltText("Enhanced card: id.jpg")).toBeNull();
  });

  it("keeps the chosen touch-ups when the card is cropped again", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    await screen.findByAltText("Enhanced card: id.jpg");
    await user.click(screen.getByRole("button", { name: "Detect card again" }));
    expect(await screen.findByAltText("Enhanced card: id.jpg")).toBeInTheDocument();
    expect(processor.enhanceCard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("checkbox", { name: /Reduce noise/ })).toBeChecked();
  });

  it("applies the chosen touch-ups to the turned card", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    await screen.findByAltText("Enhanced card: id.jpg");
    await user.click(screen.getByRole("button", { name: "Rotate right (clockwise)" }));
    await screen.findByText(/turned right/);
    expect(processor.enhanceCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 200, height: 318 }),
      expect.objectContaining({ denoise: true }),
    );
    expect(screen.getByAltText("Enhanced card: id.jpg")).toBeInTheDocument();
  });

  it("warns about glare and blur instead of implying enhancement fixed them", async () => {
    await cropped(); // the mocked crop is a flat, blown-out image
    const alerts = screen.getAllByRole("alert").map((a) => a.textContent).join(" ");
    expect(alerts).toMatch(/cannot recover text hidden by glare/);
    expect(alerts).toMatch(/cannot restore detail/);
  });

  it("releases every URL when the card is reset", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    await screen.findByAltText("Enhanced card: id.jpg");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/2");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/3");
  });

  it("releases every URL when the photo is removed", async () => {
    const user = await cropped();
    await user.click(screen.getByRole("checkbox", { name: /Reduce noise/ }));
    await screen.findByAltText("Enhanced card: id.jpg");
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Remove" })); // confirm
    await vi.waitFor(() => {
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/2");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:t/3");
    });
  });
});
