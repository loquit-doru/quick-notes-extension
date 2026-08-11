# KV legacy crypto cleanup (admin)

Crypto payment was removed from the extension and Worker API. Orphaned KV keys from the old `/verify` flow may remain in the `LICENSES` namespace.

This cleanup is a **separate admin script** — it does not change public Worker routes or Stripe/ExtensionPay restore.

## What is safe to delete

| Prefix | Purpose (removed) | Deleted by script? |
|--------|-------------------|--------------------|
| `tx:` | One-time tx hash → extensionId dedup for crypto verify | **Yes** |

## What is never deleted

The script refuses keys matching these prefixes (active Stripe/license data):

- `license:`
- `stripe-email:`, `stripe-license:`, `stripe-webhook:`
- `devices:`
- `email:` (shared with Stripe bind — **not** bulk-deleted)
- `rate:`

`license:*` entries with `method: "crypto"` are **not** removed automatically. Users who paid via crypto may still be Pro via `license:{extensionId}`; only unused `tx:*` dedup keys are targeted.

## How to verify (developer)

1. `cd workers && npx wrangler whoami` — logged into the account that owns the KV namespace in `wrangler.toml`.
2. Dry-run (no writes):
   ```bash
   node scripts/kv-cleanup-legacy-crypto.mjs --remote
   ```
3. Expect lines like `would delete: tx:0x...` only for `tx:*` keys, or zero keys if namespace is already clean.
4. Execute (destructive):
   ```bash
   node scripts/kv-cleanup-legacy-crypto.mjs --execute --remote
   ```
5. Re-run dry-run — should list `0` keys for prefix `tx:`.

## Script location

`workers/scripts/kv-cleanup-legacy-crypto.mjs`

### Options

| Flag | Default | Meaning |
|------|---------|---------|
| *(none)* | dry-run | List keys only |
| `--execute` | off | Delete matching keys |
| `--remote` | on* | Production KV (`wrangler.toml` `LICENSES` binding) |
| `--local` | off | Local dev KV only |
| `--prefix=tx:` | all legacy prefixes | Limit scan to one allowed prefix |

\*If neither `--local` nor `--remote` is passed, `--remote` is assumed.

### Examples

```bash
cd workers

# List legacy tx:* keys on production KV
node scripts/kv-cleanup-legacy-crypto.mjs --remote

# Delete them (requires explicit --execute)
node scripts/kv-cleanup-legacy-crypto.mjs --execute --remote

# Local wrangler dev store
node scripts/kv-cleanup-legacy-crypto.mjs --local
node scripts/kv-cleanup-legacy-crypto.mjs --local --execute
```

## Manual alternative (single key)

```bash
cd workers
npx wrangler kv key delete "tx:0xYOUR_TX_HASH" --binding=LICENSES --remote
```

## Related docs

- Stripe restore and other admin KV ops: [STRIPE_RESTORE.md](./STRIPE_RESTORE.md)
