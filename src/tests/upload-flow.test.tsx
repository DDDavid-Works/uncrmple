import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { jpegHeader } from "./fixtures";

// Assessment has its own tests; here it would only add unrelated alerts.
vi.mock("../features/assess/useAssessment", () => ({ useAssessment: () => () => ({ status: "idle" }) }));

function jpegFile(name: string, w = 3000, h = 2000): File {
  return new File([jpegHeader(w, h)], name, { type: "image/jpeg" });
}

let urlCounter = 0;
const revoke = vi.fn();

beforeEach(() => {
  urlCounter = 0;
  revoke.mockClear();
  URL.createObjectURL = vi.fn(() => `blob:test/${++urlCounter}`);
  URL.revokeObjectURL = revoke;
  // jsdom does not decode images; simulate a successful decode.
  HTMLImageElement.prototype.decode = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(3000);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(2000);
});

afterEach(() => vi.restoreAllMocks());

describe("upload to preview", () => {
  it("tells users to add only documents they may use, before any are added", () => {
    render(<App />);
    expect(screen.getByText(/only add documents you're allowed to use/i)).toBeInTheDocument();
    expect(screen.getByText(/IDs and medical or financial records/)).toBeInTheDocument();
  });

  it("shows the empty workspace with the limits and no repair or export controls", () => {
    render(<App />);
    expect(screen.getByText("Your pages will appear here.")).toBeInTheDocument();
    expect(screen.getByText(/Up to 25 MB each · 20 photos at a time/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(repair|download)/i })).toBeNull();
    expect(screen.getAllByLabelText("Choose document photos")).toHaveLength(1);
  });

  it("shows the original preview for a valid upload and offers no unimplemented controls", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText("Choose document photos"), jpegFile("receipt.jpg"));

    expect(await screen.findByRole("heading", { name: "receipt.jpg" })).toBeInTheDocument();
    expect(screen.getByAltText("Original photo: receipt.jpg")).toHaveAttribute("src", "blob:test/1");
    expect(screen.getByText(/3000×2000px/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /download|pdf/i })).toBeNull();
  });

  it("rejects non-image content with an image extension and keeps valid files", async () => {
    const user = userEvent.setup();
    render(<App />);
    const fake = new File([new TextEncoder().encode("not an image at all")], "fake.jpg", {
      type: "image/jpeg",
    });
    await user.upload(screen.getByLabelText("Choose document photos"), [fake, jpegFile("ok.jpg")]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/fake\.jpg.*Unsupported/);
    expect(await screen.findByRole("heading", { name: "ok.jpg" })).toBeInTheDocument();
  });

  it("stops a batch at the total pixel limit and counts pages already open", async () => {
    // 7000×6800 is 47.6 MP, so twelve fit in 600 MP and a thirteenth does not.
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(7000);
    vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(6800);
    const big = (name: string) => new File([jpegHeader(7000, 6800)], name, { type: "image/jpeg" });
    const user = userEvent.setup();
    render(<App />);
    const chooser = () => screen.getByLabelText("Choose document photos");

    await user.upload(chooser(), Array.from({ length: 11 }, (_, i) => big(`p${i + 1}.jpg`)));
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(11));
    // The large drop zone gives way to the page list's "Add photos" once pages exist.
    await user.upload(chooser(), [big("p12.jpg"), big("p13.jpg")]);

    expect(await screen.findByRole("alert")).toHaveTextContent(/p13\.jpg.*600 megapixels in total/);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /p12\.jpg/ }).length).toBeGreaterThan(0);  });

  it("accepts an image pasted from the clipboard and names it", async () => {
    render(<App />);
    const clip = new File([jpegHeader(3000, 2000)], "image.png", { type: "image/jpeg" });
    fireEvent.paste(document.body, { clipboardData: { files: [clip] } });

    expect(await screen.findByRole("heading", { name: "pasted-1.png" })).toBeInTheDocument();
  });

  it("validates pasted files like any other upload", async () => {
    render(<App />);
    const fake = new File([new TextEncoder().encode("not an image")], "doc.jpg", { type: "image/jpeg" });
    fireEvent.paste(document.body, { clipboardData: { files: [fake] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/doc\.jpg.*Unsupported/);
  });

  it("ignores pastes with no files and pastes into text fields", async () => {
    render(<App />);
    fireEvent.paste(document.body, { clipboardData: { files: [] } });
    const field = document.createElement("input");
    document.body.appendChild(field);
    const clip = new File([jpegHeader(3000, 2000)], "image.png", { type: "image/jpeg" });
    fireEvent.paste(field, { clipboardData: { files: [clip] } });
    field.remove();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("heading", { name: "Upload document photos" })).toBeInTheDocument();
  });

  it("revokes the object URL when a document is removed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText("Choose document photos"), jpegFile("a.jpg"));
    await screen.findByRole("heading", { name: "a.jpg" });

    await user.click(screen.getByRole("button", { name: "Remove" }));
    // Nothing is removed until the inline confirmation is accepted.
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Keep" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "a.jpg" })).toBeNull());
    expect(screen.getByRole("heading", { name: "Upload document photos" })).toBeInTheDocument();
  });

  it("reports a decode failure instead of adding the image", async () => {
    HTMLImageElement.prototype.decode = vi.fn().mockRejectedValue(new Error("bad"));
    const user = userEvent.setup();
    render(<App />);
    await user.upload(screen.getByLabelText("Choose document photos"), jpegFile("corrupt.jpg"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not decode/i);
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
    expect(screen.queryByRole("img", { name: /corrupt/ })).toBeNull();
  });
});
