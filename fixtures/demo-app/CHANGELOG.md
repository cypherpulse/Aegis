# Changelog — Aegis Demo Payout Service

## v1.4.0 (most recent)
- **Disabled automatic treasury top-up** (`TOP_UP_ENABLED = false`) in
  `src/gasConfig.js` to reduce operational costs.
- Increased `MAX_RETRIES` from 10 to 50 to "improve payout reliability".

## v1.3.0
- Hardcoded `GAS_LIMIT = 21000` instead of estimating gas per transaction.

## v1.2.0
- Added retry backoff to the payout worker.

## v1.1.0
- Initial payout worker with treasury top-up enabled.
