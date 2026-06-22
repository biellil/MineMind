# Deferred Items — Phase 10.1

Out-of-scope discoveries during execution. NOT fixed here (Scope Boundary).

## Pre-existing test failures (not caused by 10.1)

- **`src/config.test.ts` > "carrega com valores default sem .env"**: asserts `config.host === 'localhost'`
  but the local `.env` sets `HOST=127.0.0.1`, so the singleton reads `127.0.0.1`. This is the
  long-documented pre-existing failure ("1 fail é teste de config que lê `.env` local" — PROJECT.md,
  STATE.md). Unrelated to concurrency. The test does not delete `HOST` before importing `./config`.
  Fix (out of scope): add `'HOST'` to the env-cleanup list at the top of `config.test.ts`, or run with
  a clean env. Left untouched per scope boundary.
