import { useId, useState, type FormEvent, type ReactNode } from "react";
import { checkEmail } from "../lib/email";
import { submitEmail } from "../lib/submit";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

type Props = {
  endpoint: string;
  fields?: Record<string, string>;
  /** What joining agrees to; read out with the email field and shown under the form. */
  consent?: ReactNode;
  /** Small print under the form. */
  note?: string;
  className?: string;
  fetchImpl?: typeof fetch;
};

export function WaitlistForm({ endpoint, fields, consent, note, className = "", fetchImpl }: Props) {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const inputId = useId();
  const messageId = useId();
  const consentId = useId();

  if (endpoint === "") {
    return (
      <p className={`notice ${className}`} role="status">
        The waitlist isn't open yet. Please check back soon.
      </p>
    );
  }

  if (status.kind === "success") {
    return (
      <p className={`notice notice-success ${className}`} role="status">
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
    <form className={`form ${className}`} onSubmit={onSubmit} noValidate>
      <label htmlFor={inputId} className="visually-hidden">
        Email address
      </label>
      <div className="form-row">
        <input
          id={inputId}
          className="field"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={consent ? `${messageId} ${consentId}` : messageId}
          disabled={submitting}
        />
        <button type="submit" className="btn" disabled={submitting}>
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
      {consent && (
        <p id={consentId} className="fine consent">
          {consent}
        </p>
      )}
      {note && <p className="fine">{note}</p>}
    </form>
  );
}
