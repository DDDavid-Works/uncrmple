import { useId, useState, type FormEvent } from "react";
import { checkEmail } from "../lib/email";
import { submitEmail } from "../lib/submit";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

type Props = { endpoint: string; fields?: Record<string, string>; fetchImpl?: typeof fetch };

export function WaitlistForm({ endpoint, fields, fetchImpl }: Props) {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputId = useId();
  const messageId = useId();

  if (endpoint === "") {
    return (
      <p className="notice" role="status">
        The waitlist isn't open yet. Please check back soon.
      </p>
    );
  }

  if (status.kind === "success") {
    return (
      <p className="notice notice-success" role="status">
        You're on the list. We'll email you when it's ready.
      </p>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status.kind === "submitting") return;
    const checked = checkEmail(email);
    if (!checked.ok) {
      setStatus({ kind: "error", message: checked.message });
      return;
    }
    // Bots fill the hidden field; show success without sending anything.
    if (trap !== "") {
      setStatus({ kind: "success" });
      return;
    }
    setStatus({ kind: "submitting" });
    const result = await submitEmail(endpoint, checked.email, fields, fetchImpl);
    setStatus(result.ok ? { kind: "success" } : { kind: "error", message: result.message });
  }

  const submitting = status.kind === "submitting";
  const error = status.kind === "error" ? status.message : null;

  return (
    <form className="form" onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId}>Email address</label>
      <div className="form-row">
        <input
          id={inputId}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={messageId}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </div>
      <div className="trap" aria-hidden="true">
        <label>
          Company
          <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
        </label>
      </div>
      <p id={messageId} className="form-message" role="alert">
        {error}
      </p>
      <p className="fine">We'll only use your email to tell you when we launch. No spam.</p>
    </form>
  );
}
