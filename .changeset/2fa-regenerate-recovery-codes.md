---
"@holeauth/plugin-2fa": minor
"@holeauth/react": minor
---

Add `TwoFactorApi.regenerateRecoveryCodes()`, `POST /2fa/regenerate-recovery-codes` route, and `use2faRegenerateCodes()` React hook; fix `use2faSetup().activate()` to return `recoveryCodes` from the server response.
