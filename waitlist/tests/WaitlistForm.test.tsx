import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WaitlistForm } from "../src/components/WaitlistForm";

const ENDPOINT = "https://x.test/f";
const asFetch = (f: unknown) => f as typeof fetch;
const okFetch = () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as Response);

describe("WaitlistForm", () => {
  it("shows an honest notice and no form when signups are not configured", () => {
    render(<WaitlistForm endpoint="" />);
    expect(screen.getByRole("status")).toHaveTextContent(/isn't open yet/i);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the consent text and reads it out with the email field", () => {
    render(<WaitlistForm endpoint={ENDPOINT} consent="By joining, you agree to launch emails." />);
    expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription(/agree to launch emails/i);
  });

  it("rejects an invalid email without sending", async () => {
    const f = okFetch();
    render(<WaitlistForm endpoint={ENDPOINT} fetchImpl={asFetch(f)} />);
    await userEvent.type(screen.getByLabelText("Email address"), "nope");
    await userEvent.click(screen.getByRole("button", { name: /join/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
    expect(f).not.toHaveBeenCalled();
  });

  it("submits a valid email and shows success", async () => {
    const f = okFetch();
    render(<WaitlistForm endpoint={ENDPOINT} fetchImpl={asFetch(f)} />);
    await userEvent.type(screen.getByLabelText("Email address"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: /join/i }));
    expect(await screen.findByText(/on the list/i)).toBeInTheDocument();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("shows an error when the server rejects the signup", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false }) } as Response);
    render(<WaitlistForm endpoint={ENDPOINT} fetchImpl={asFetch(f)} />);
    await userEvent.type(screen.getByLabelText("Email address"), "me@example.com");
    await userEvent.click(screen.getByRole("button", { name: /join/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't save/i);
  });
});
