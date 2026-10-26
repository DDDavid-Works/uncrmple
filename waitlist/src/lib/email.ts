const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

export type EmailCheck = { ok: true; email: string } | { ok: false; message: string };

export function checkEmail(input: string): EmailCheck {
  const email = input.trim();
  if (email === "") return { ok: false, message: "Enter your email address." };
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, message: "That doesn't look like a valid email address." };
  }
  return { ok: true, email };
}
