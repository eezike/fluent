# Fluent to-do

## Browser use for the agent (PWA first)

Goal: Fluent can do tasks on websites (brand portals, DocuSign, payment portals), and it must work from the **PWA**, not only the Chrome extension. A PWA can't drive a browser, so this means a **cloud browser**.

- [ ] Pick the runtime: hosted browser (Browserbase / Browserless) or a sandbox running Playwright (Modal, E2B, Daytona). A sandbox also gives us a place to isolate PDF/Word parsing later.
- [ ] `browser.task` action kind and a job runner that drives the loop on the server. Tools: navigate, read page (accessibility tree), click, type, screenshot. Show each action in the notification's Steps.
- [ ] Logins without Fluent holding passwords: a "take over" live view where the user signs in themselves, then save the session per user, encrypted (AES-256-GCM like connector tokens). Hand 2FA and CAPTCHAs back to the user.
- [ ] Safety, same model as the rest of Fluent:
  - [ ] Reading and navigating are free; anything that submits, uploads, signs or pays needs approval first, shown as a Changes card.
  - [ ] Page content is untrusted data, never instructions.
  - [ ] Never type passwords or payment details, never click delete.
  - [ ] Per-user domain allowlist; one browser session per task; time and step limits.
- [ ] First use case, end to end (pick one): upload an invoice to a payment portal / sign a contract / check payment status so "payment overdue" is based on the portal / vendor and onboarding forms.
- [ ] Later, optional: extension mode that uses the user's own Chrome (already logged in, but only while Chrome is open).

## Other open items

- [ ] Connect Supabase, Google and Pub/Sub, then run the New Balance → Adidas demo end to end.
- [ ] OCR for scanned PDFs, and `.docx` and image attachments (currently shown as "not read").
