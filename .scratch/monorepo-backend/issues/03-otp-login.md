# 03: OTP login (backend + frontend)

**What to build:** A player can optionally log in with just an email address — no password, no traditional account. Playing without logging in must keep working exactly as it does today.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] Backend `User` record identified by a salted hash of the player's email. No plaintext email is stored at rest (looked up transiently from the request when sending the OTP, or not persisted at all).
- [x] `POST /auth/otp/request`: given an email, generates a short-lived numeric OTP, sends it via Resend, rate-limited per email.
- [x] `POST /auth/otp/verify`: given an email + OTP, verifies it and issues a session (creating the `User` record on first login).
- [x] Frontend login UI: email entry → code entry → logged-in state established and persisted client-side across a reload.
- [x] **Playing without an account continues to work unchanged**: no login is required to start or complete a Level or a Practice session; `LevelStats`/trial history keep being read from and written to `localStorage` exactly as before for a logged-out player. Login is additive, never a gate.
- [x] A logged-in player can log out, returning to logged-out play without losing their local `LevelStats`.
