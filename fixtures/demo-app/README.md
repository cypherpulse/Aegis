# Aegis Demo Payout Service (fixture)

A deterministic, read-only code fixture representing a blockchain protocol's
payout worker. It contains a **deliberately introduced bug** for the Code
Investigator to discover — it is not wired into the app and is never executed by
the backend; the Code Investigator only reads it through jailed, read-only tools.

The bug lives in [`src/gasConfig.js`](src/gasConfig.js) and
[`src/payoutService.js`](src/payoutService.js): automatic treasury top-up was
disabled while retry count was raised, so the worker drains the treasury's gas
reserve and then retries failing payouts forever. See the
[CHANGELOG](CHANGELOG.md) for the suspicious recent change.
