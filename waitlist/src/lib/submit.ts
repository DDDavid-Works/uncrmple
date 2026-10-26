export type SubmitResult = { ok: true } | { ok: false; message: string };

/**
 * POSTs the signup as JSON. `fields` are sent alongside the email (Web3Forms needs
 * `access_key`). Web3Forms answers `{ "success": boolean, "message": string }`, so an
 * HTTP 200 alone is not trusted: `success` must be true.
 */
export async function submitEmail(
  endpoint: string,
  email: string,
  fields: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  if (endpoint === "") {
    return { ok: false, message: "Signups are not open yet." };
  }
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...fields, email }),
    });
    const body: unknown = await response.json().catch(() => null);
    const success = typeof body === "object" && body !== null && (body as { success?: unknown }).success === true;
    if (!response.ok || !success) {
      return { ok: false, message: "We couldn't save your email. Please try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Network error. Check your connection and try again." };
  }
}
