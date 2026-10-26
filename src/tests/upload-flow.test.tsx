import { render, screen, waitFor } from "@testing-library/react";
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
