# yield-adapter

Optional, opt-in yield-routing adapter for **Stow**, on Stellar/Soroban (Rust, `soroban-sdk` 22).

`savings-vault` custodies principal with no yield logic (by design — see its
README). This crate is the separate, swappable layer referenced in the root
`README.md`'s "Contract Layout" section as `yield_adapter/`: it accepts
deposits (in the same SEP-41 token as `savings-vault`, e.g. USDC), routes
idle balances into a registered external "strategy" contract, and reports
yield back to depositors via a share-based exchange rate — never by touching
`savings-vault`'s own storage.

This crate is a **skeleton**. Every entrypoint is stubbed with
`unimplemented!()` and a `TODO(issue)` comment describing intended behavior
and acceptance criteria. Each stub is designed to become one GitHub issue.
The reference below documents the contract's intended, stable interface so
integrators (indexer, backend, frontend) can build against it without
reading the stub bodies.

## Contents

- [Module → issue map](#module--issue-map)
- [Layout](#layout)
- [Build & test](#build--test)
- [Wasm size budget & optimization](#wasm-size-budget--optimization)
- [Strategy interface](#strategy-interface)
- [Entrypoint reference](#entrypoint-reference)
- [Storage layout](#storage-layout)
- [Event schema](#event-schema)

## Module → issue map

| Module | Entrypoints | Suggested issues |
| --- | --- | --- |
| `admin` | `initialize`, `set_admin`, `set_treasury`, `set_performance_fee_bps`, `set_paused`, `set_withdraw_cooldown`, `upgrade` | one issue each |
| `storage` | TTL + accessors, SEP-41 transfer helpers | storage helpers, TTL policy, transfer helpers |
| `strategy` | `register_strategy`, `deregister_strategy`, `set_active_strategy`, `migrate_strategy`, `set_strategy_deposit_cap`, `get_strategy`, `list_strategies` | one issue each |
| `deposit` | `deposit`, `get_position` | deposit + share minting, position read |
| `withdraw` | `request_withdraw`, `claim_withdraw`, `cancel_withdraw`, `get_withdraw_request` | one issue each |
| `accounting` | `total_assets`, `total_shares`, `convert_to_shares`, `convert_to_assets`, `exchange_rate` | share math + rounding-direction audit |
| `harvest` | `harvest`, `apply_performance_fee`, `check_harvest_interval` | one issue each |
| `fees` | `validate_fee_bps`, `fees_accrued`, `withdraw_fees` | fee cap validation, fee sweep |
| `circuit_breaker` | `emergency_withdraw_all` | one issue |
| `events` | typed publishers | one issue per event topic |
| `test` | integration tests | one issue per `#[ignore]`d test |

## Layout

```text
src/
  lib.rs              # contract + entrypoints (delegates to modules)
  types.rs            # data structures + DataKey storage keys
  storage.rs          # storage/TTL helpers, SEP-41 transfer helpers
  admin.rs            # init + admin/treasury/fee/pause config
  strategy.rs         # strategy registry (register/activate/migrate)
  deposit.rs          # deposit -> mint shares
  withdraw.rs         # cooldown-queued withdrawals
  accounting.rs       # share <-> asset conversion, exchange rate
  harvest.rs          # report strategy yield/loss, performance fee
  fees.rs             # sweep accrued fees to treasury
  circuit_breaker.rs  # emergency pull of funds out of the strategy
  events.rs           # event topic registry (see "Event schema" below)
  test.rs             # test skeleton
```

## Build & test

```bash
cargo build --target wasm32-unknown-unknown --release
cargo test           # placeholder tests are #[ignore]d until implemented
```

> Note: entrypoints currently `unimplemented!()` — they compile but panic at
> runtime until a contributor implements them. The signatures, auth rules,
> and error contracts documented in each module's doc comments and below are
> the stable target to implement against.

## Wasm size budget & optimization

CI builds this crate, runs `stellar contract optimize`, and fails if the
optimized wasm exceeds `WASM_SIZE_BUDGET_BYTES` (see
`.github/workflows/contract-ci.yml`, `yield-adapter` job). Currently set to
the same 64 KiB starting budget as `savings-vault`; revisit once the crate
is implemented and its real size is known.

## Strategy interface

A "strategy" is any external contract registered via `register_strategy`.
This adapter treats it as opaque and reaches it only through
`env.invoke_contract`. At minimum a usable strategy must expose:

- `deposit(from: Address, amount: i128)` — accept `amount` of the shared
  SEP-41 token from the adapter.
- `withdraw(to: Address, amount: i128)` — return `amount` to the adapter.
- `balance(of: Address) -> i128` — report the adapter's current claim,
  **including** any accrued yield (or loss) — this is what `harvest` diffs
  against the adapter's last-known deployed balance to compute yield.

An in-repo mock implementing this interface lives in `src/mock_strategy.rs`
(test-only). Besides the three required entrypoints it exposes knobs for
simulating yield/loss, injecting failures, and haircutting withdrawals; call
`init(token)` to make it move real tokens instead of only keeping a ledger.

**Trust boundary**: the adapter does not verify a strategy's solvency or
correctness beyond the `balance` figure it reports. A malicious or buggy
strategy can misreport yield (see `harvest::apply_performance_fee`'s
guard against charging fees on a loss, which limits — but does not
eliminate — the damage a lying strategy can do). Registering a strategy is
an explicit, admin-only trust decision; see `circuit_breaker` for the
emergency exit if that trust turns out to be misplaced.

## Entrypoint reference

All amounts are `i128` in the vault token's smallest unit (stroops for a 7-decimal
SEP-41 token like USDC). All timestamps are `u64` ledger timestamps (seconds
since epoch, per `env.ledger().timestamp()`). Every entrypoint that mutates
state calls `require_auth()` on the address noted in **Auth** — the caller
must sign as that address (or hold a valid signature delegation for it).
Every entrypoint returns `Result<T, Error>` (or a primitive / struct value);
see [`src/error.rs`](src/error.rs) for the full, stable error enum.

### Consolidated entrypoint reference table

| Category | Function | Auth | Errors | Description |
| --- | --- | --- | --- | --- |
| **Lifecycle** | `initialize(admin, treasury, token)` | none | `AlreadyInitialized` | Initialize admin, treasury, and SEP-41 token. |
| | `admin()` | none (read) | `NotInitialized` | Get configured admin address. |
| | `treasury()` | none (read) | `NotInitialized` | Get configured treasury address. |
| | `token()` | none (read) | `NotInitialized` | Get configured SEP-41 token address. |
| | `set_admin(new_admin)` | admin | `NotInitialized`, `Unauthorized` | Rotate contract admin. |
| | `set_treasury(caller, new_treasury)` | admin | `NotInitialized`, `Unauthorized` | Set treasury destination for performance fees. |
| | `performance_fee_bps()` | none (read) | none | Read performance fee in basis points (0–3,000). |
| | `set_performance_fee_bps(caller, bps)` | admin | `Unauthorized`, `FeeTooHigh` | Set performance fee (max 30% / 3,000 bps). |
| | `harvest_interval()` | none (read) | none | Minimum seconds required between harvests. |
| | `set_harvest_interval(caller, seconds)` | admin | `NotInitialized`, `Unauthorized` | Set minimum harvest interval in seconds. |
| | `set_paused(caller, paused)` | admin | `Unauthorized` | Emergency pause/unpause mutations. |
| | `is_paused()` | none (read) | none | Check whether the contract is paused. |
| | `withdraw_cooldown()` | none (read) | none | Read cooldown period in seconds for withdrawals. |
| | `set_withdraw_cooldown(caller, seconds)` | admin | `Unauthorized` | Set withdrawal cooldown period in seconds. |
| | `upgrade(caller, new_wasm_hash)` | admin | `Unauthorized` | Upgrade contract Wasm executable. |
| **Strategy** | `register_strategy(caller, address, name)` | admin | `Unauthorized`, `Paused`, `StrategyAlreadyRegistered` | Register a new yield strategy contract. |
| | `deregister_strategy(caller, strategy_id)` | admin | `Unauthorized`, `StrategyNotFound`, `StrategyActive` | Deregister an inactive strategy. |
| | `set_active_strategy(caller, strategy_id)` | admin | `Unauthorized`, `Paused`, `StrategyNotFound`, `StrategyAlreadyActive` | Activate an existing strategy. |
| | `migrate_strategy(caller, new_strategy_id)` | admin | `Unauthorized`, `Paused`, `StrategyNotFound`, `StrategyAlreadyActive` | Move deployed funds from current to new strategy. |
| | `set_strategy_deposit_cap(caller, strategy_id, cap)` | admin | `Unauthorized`, `StrategyNotFound`, `InvalidAmount` | Set per-strategy deposit cap (0 = unlimited). |
| | `get_strategy(strategy_id)` | none (read) | `NotFound` | Look up strategy info by id. |
| | `list_strategies()` | none (read) | none | List all registered strategies. |
| **Deposit** | `deposit(from, amount)` | `from` | `Paused`, `InvalidAmount`, `StrategyCapExceeded`, `Overflow` | Deposit vault token and mint proportional shares. |
| | `get_position(owner)` | none (read) | `NotFound` | Query owner's shares and position metadata. |
| **Withdraw** | `request_withdraw(owner, shares)` | `owner` | `Paused`, `InvalidAmount`, `InsufficientBalance`, `Overflow` | Burn shares and enqueue cooldown-queued withdrawal. |
| | `claim_withdraw(owner, request_id)` | `owner` | `Unauthorized`, `NotFound`, `CooldownNotElapsed`, `WithdrawAlreadyResolved` | Claim completed withdrawal after cooldown passes. |
| | `cancel_withdraw(owner, request_id)` | `owner` | `Unauthorized`, `NotFound`, `WithdrawAlreadyResolved`, `Overflow` | Cancel pending withdrawal and re-mint shares. |
| | `get_withdraw_request(request_id)` | none (read) | `NotFound` | Query details of a withdrawal request. |
| **Accounting** | `total_assets()` | none (read) | none | Total assets: idle balance + strategy-deployed funds. |
| | `total_shares()` | none (read) | none | Total shares outstanding across all positions. |
| | `exchange_rate()` | none (read) | none | Exchange rate expressed as `(total_assets, total_shares)`. |
| **Harvest** | `harvest(caller)` | permissionless | `Paused`, `HarvestTooSoon`, `StrategyNotFound`, `Overflow` | Pull yield from active strategy, deduct fee, adjust rate. |
| **Fees** | `fees_accrued()` | none (read) | none | Accrued performance fees awaiting sweep. |
| | `withdraw_fees(caller)` | permissionless | `NoFeesAccrued`, `NotInitialized` | Sweep accrued fees to the treasury address. |
| **Circuit Breaker** | `emergency_withdraw_all(caller)` | admin | `Unauthorized`, `StrategyNotFound` | Emergency pull of all deployed funds back to idle balance. |

---

### Lifecycle & Admin

#### `initialize(admin: Address, treasury: Address, token: Address) -> Result<(), Error>`
- **Auth:** none (called once immediately following contract deployment).
- **Errors:** `AlreadyInitialized` if called a second time.
- **Events:** [`init`](#init).
```bash
stellar contract invoke --id $CONTRACT_ID --source deployer --network testnet \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --treasury $TREASURY_ADDRESS \
  --token $USDC_TOKEN_ADDRESS
```

#### `admin() -> Result<Address, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotInitialized`.
- **Events:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- admin
```

#### `treasury() -> Result<Address, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotInitialized`.
- **Events:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- treasury
```

#### `token() -> Result<Address, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotInitialized`.
- **Events:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- token
```

#### `set_admin(new_admin: Address) -> Result<(), Error>`
- **Auth:** current admin.
- **Errors:** `NotInitialized`, `Unauthorized` if caller is not the current admin.
- **Events:** [`admin_set`](#admin_set).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_admin --new_admin $NEW_ADMIN_ADDRESS
```

#### `set_treasury(caller: Address, new_treasury: Address) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `NotInitialized`, `Unauthorized`.
- **Events:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_treasury --caller $ADMIN_ADDRESS --new_treasury $NEW_TREASURY_ADDRESS
```

#### `performance_fee_bps() -> u32`
- **Auth:** none (read-only).
- **Returns:** Current fee in basis points (e.g. `1000` = 10%). Defaults to `0`.
- **Errors:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- performance_fee_bps
```

#### `set_performance_fee_bps(caller: Address, bps: u32) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `FeeTooHigh` if `bps > 3000` (max 30%).
- Takes effect on subsequent harvests.
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_performance_fee_bps --caller $ADMIN_ADDRESS --bps 1000
```

#### `harvest_interval() -> u64`
- **Auth:** none (read-only).
- **Returns:** Minimum required duration (in seconds) between harvest calls.
- **Errors:** none.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- harvest_interval
```

#### `set_harvest_interval(caller: Address, seconds: u64) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `NotInitialized`, `Unauthorized`.
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_harvest_interval --caller $ADMIN_ADDRESS --seconds 3600
```

#### `set_paused(caller: Address, paused: bool) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`.
- **Events:** [`paused_changed`](#paused_changed).
- While paused, `deposit`, `request_withdraw`, `harvest`, and strategy mutations reject with `Paused`. `claim_withdraw` remains open.
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_paused --caller $ADMIN_ADDRESS --paused true
```

#### `is_paused() -> bool`
- **Auth:** none (read-only).
- **Returns:** `true` if paused, `false` otherwise.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- is_paused
```

#### `withdraw_cooldown() -> u64`
- **Auth:** none (read-only).
- **Returns:** Cooldown delay in seconds before requested withdrawals can be claimed.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- withdraw_cooldown
```

#### `set_withdraw_cooldown(caller: Address, seconds: u64) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`.
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_withdraw_cooldown --caller $ADMIN_ADDRESS --seconds 86400
```

#### `upgrade(caller: Address, new_wasm_hash: BytesN<32>) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`.
- **Events:** [`upgraded`](#upgraded).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- upgrade --caller $ADMIN_ADDRESS --new_wasm_hash <64-char-hex-hash>
```

---

### Strategy Management

#### `register_strategy(caller: Address, address: Address, name: String) -> Result<u64, Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `Paused`, `StrategyAlreadyRegistered`.
- **Events:** [`strategy_registered`](#strategy_registered).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- register_strategy --caller $ADMIN_ADDRESS --address $STRATEGY_ADDRESS --name "DeFi-Lending"
```

#### `deregister_strategy(caller: Address, strategy_id: u64) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `StrategyNotFound`, `StrategyActive` (cannot deregister the currently active strategy).
- **Events:** [`strategy_deregistered`](#strategy_deregistered).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- deregister_strategy --caller $ADMIN_ADDRESS --strategy_id 1
```

#### `set_active_strategy(caller: Address, strategy_id: u64) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `Paused`, `StrategyNotFound`, `StrategyAlreadyActive`.
- **Events:** [`strategy_changed`](#strategy_changed).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_active_strategy --caller $ADMIN_ADDRESS --strategy_id 1
```

#### `migrate_strategy(caller: Address, new_strategy_id: u64) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `Paused`, `StrategyNotFound`, `StrategyAlreadyActive`.
- Unwinds all funds from the current active strategy and redeploys them into the new strategy.
- **Events:** [`strategy_changed`](#strategy_changed).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- migrate_strategy --caller $ADMIN_ADDRESS --new_strategy_id 2
```

#### `set_strategy_deposit_cap(caller: Address, strategy_id: u64, cap: i128) -> Result<(), Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `StrategyNotFound`, `InvalidAmount` (if `cap < 0`).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- set_strategy_deposit_cap --caller $ADMIN_ADDRESS --strategy_id 1 --cap 5000000000000
```

#### `get_strategy(env: Env, strategy_id: u64) -> Result<StrategyInfo, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotFound` if strategy_id does not exist.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- get_strategy --strategy_id 1
```

#### `list_strategies() -> Vec<StrategyInfo>`
- **Auth:** none (read-only).
- **Returns:** List of all registered strategies (including historical/deregistered).
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- list_strategies
```

---

### Deposit & Positions

#### `deposit(from: Address, amount: i128) -> Result<i128, Error>`
- **Auth:** `from`.
- **Errors:** `Paused`, `InvalidAmount` (if `amount <= 0`), `StrategyCapExceeded`, `Overflow`.
- **Returns:** Amount of shares minted.
- **Events:** [`deposited`](#deposited).
- **Integrator note:** Shares are calculated using `convert_to_shares` before token transfer so the deposit does not change the rate against the depositor.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- deposit --from $ALICE_ADDRESS --amount 1000000000
```

#### `get_position(owner: Address) -> Result<Position, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotFound` if `owner` has no position record.
- **Returns:** `Position` containing `owner`, `shares`, `created_at`, `updated_at`.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- get_position --owner $ALICE_ADDRESS
```

---

### Withdrawal Queue

#### `request_withdraw(owner: Address, shares: i128) -> Result<u64, Error>`
- **Auth:** `owner`.
- **Errors:** `Paused`, `InvalidAmount` (`shares <= 0`), `InsufficientBalance` (`shares > position.shares`), `Overflow`.
- **Returns:** `request_id` (u64).
- **Events:** [`withdraw_requested`](#withdraw_requested).
- **Integrator note:** Shares are burned immediately upon request. The asset payout amount is locked at the current exchange rate and will be claimable after `claimable_at` = current time + `withdraw_cooldown`.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- request_withdraw --owner $ALICE_ADDRESS --shares 500000000
```

#### `claim_withdraw(owner: Address, request_id: u64) -> Result<i128, Error>`
- **Auth:** `owner`.
- **Errors:** `Unauthorized` (if caller != request owner), `NotFound`, `CooldownNotElapsed` (`now < claimable_at`), `WithdrawAlreadyResolved`.
- **Returns:** Net asset amount paid out.
- **Events:** [`withdraw_claimed`](#withdraw_claimed).
- Remains executable even while contract is paused.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- claim_withdraw --owner $ALICE_ADDRESS --request_id 1
```

#### `cancel_withdraw(owner: Address, request_id: u64) -> Result<(), Error>`
- **Auth:** `owner`.
- **Errors:** `Unauthorized`, `NotFound`, `WithdrawAlreadyResolved`, `Overflow`.
- **Events:** [`withdraw_cancelled`](#withdraw_cancelled).
- Re-mints shares at the *current* exchange rate corresponding to the locked asset amount.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- cancel_withdraw --owner $ALICE_ADDRESS --request_id 1
```

#### `get_withdraw_request(request_id: u64) -> Result<WithdrawRequest, Error>`
- **Auth:** none (read-only).
- **Errors:** `NotFound`.
- **Returns:** `WithdrawRequest` with `id`, `owner`, `shares`, `amount`, `requested_at`, `claimable_at`, `claimed_at`, `cancelled_at`.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- get_withdraw_request --request_id 1
```

---

### Accounting

#### `total_assets() -> i128`
- **Auth:** none (read-only).
- **Returns:** Total asset valuation (idle vault tokens held by adapter + funds reported deployed in the active strategy).
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- total_assets
```

#### `total_shares() -> i128`
- **Auth:** none (read-only).
- **Returns:** Total running sum of active shares across all depositors.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- total_shares
```

#### `exchange_rate() -> (i128, i128)`
- **Auth:** none (read-only).
- **Returns:** `(total_assets, total_shares)`.
- If `total_shares == 0`, rate is effectively 1:1.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- exchange_rate
```

---

### Harvest & Fees

#### `harvest(caller: Address) -> Result<i128, Error>`
- **Auth:** permissionless (any caller / keeper).
- **Errors:** `Paused`, `HarvestTooSoon` (if interval hasn't elapsed), `StrategyNotFound`, `Overflow`.
- **Returns:** Net delta in assets observed from strategy.
- **Events:** [`harvested`](#harvested).
```bash
stellar contract invoke --id $CONTRACT_ID --source keeper --network testnet \
  -- harvest --caller $KEEPER_ADDRESS
```

#### `fees_accrued() -> i128`
- **Auth:** none (read-only).
- **Returns:** Total accrued performance fee stroops ready to be swept.
```bash
stellar contract invoke --id $CONTRACT_ID --source alice --network testnet \
  -- fees_accrued
```

#### `withdraw_fees(caller: Address) -> Result<i128, Error>`
- **Auth:** permissionless (sweeps funds directly to configured `treasury` address).
- **Errors:** `NoFeesAccrued` (if accrued is 0), `NotInitialized`.
- **Returns:** Total fee amount transferred to treasury.
- **Events:** [`fee_collected`](#fee_collected).
```bash
stellar contract invoke --id $CONTRACT_ID --source keeper --network testnet \
  -- withdraw_fees --caller $KEEPER_ADDRESS
```

---

### Circuit Breaker

#### `emergency_withdraw_all(caller: Address) -> Result<i128, Error>`
- **Auth:** current admin (`caller`).
- **Errors:** `Unauthorized`, `StrategyNotFound`.
- Pulls all deployed capital from the active strategy back into the adapter's idle token balance and clears `ActiveStrategy`. Works even while paused.
- **Events:** [`strategy_changed`](#strategy_changed) (with `to: None`).
```bash
stellar contract invoke --id $CONTRACT_ID --source admin --network testnet \
  -- emergency_withdraw_all --caller $ADMIN_ADDRESS
```

## Storage layout

All storage access goes through `src/storage.rs`; the keys are the
`DataKey` variants in `src/types.rs`. Keys fall into two durability
classes, following the same split as `savings-vault`:

- **Instance storage** — small, hot singletons read on nearly every call.
  They share one TTL with the contract instance itself, so the contract
  cannot outlive its config (or vice versa).
- **Persistent storage** — unbounded, per-key records (one entry per
  strategy, position, or withdraw request). Each entry has its own TTL, so
  a rarely-touched record can be archived without affecting the rest.

No key uses temporary storage: every record here must survive until it is
explicitly overwritten.

### TTL policy

TTLs are in ledgers (1 ledger ≈ 5 s, so `DAY_IN_LEDGERS = 17_280`).

| Class | Bumped by | Extend to (`*_BUMP_AMOUNT`) | Only if remaining TTL below (`*_LIFETIME_THRESHOLD`) |
| --- | --- | --- | --- |
| Instance | `extend_instance_ttl`, at the top of every state-changing entrypoint | 30 days | 29 days |
| Persistent | `extend_persistent_ttl(key)`, after every read **and** write of that entry | 30 days | 29 days |

The threshold is one day below the bump amount, so each entry is extended
at most about once a day however often it is touched. These values are
copied from `savings-vault` as a starting point and are not yet tuned for
this contract's access pattern (see the `TODO(issue)` in `storage.rs`).

An archived persistent entry (a position left untouched for over 30 days)
is not lost: it has to be restored (`RestoreFootprint`) before it can be
read again. Integrators should expect this for long-dormant positions.

### Keys

| `DataKey` variant | Durability | Value type | Absent means | Written by |
| --- | --- | --- | --- | --- |
| `Admin` | instance | `Address` | not initialized | `initialize`, `set_admin` |
| `Treasury` | instance | `Address` | not initialized | `initialize`, `set_treasury` |
| `Token` | instance | `Address` (SEP-41, same as `savings-vault`'s) | not initialized | `initialize` |
| `Paused` | instance | `bool` | `false` (unpaused) | `set_paused` |
| `PerformanceFeeBps` | instance | `u32` (0–10_000) | `0` | `set_performance_fee_bps` |
| `HarvestInterval` | instance | `u64` seconds | no minimum | admin config |
| `LastHarvestAt` | instance | `u64` ledger timestamp | never harvested | `harvest` |
| `WithdrawCooldown` | instance | `u64` seconds | `0` | `set_withdraw_cooldown` |
| `ActiveStrategy` | instance | `u64` strategy id | no active strategy (funds held idle) | `set_active_strategy`, `migrate_strategy`, `emergency_withdraw_all` (clears) |
| `NextStrategyId` | instance | `u64` counter | `0` (first id is `1`) | `register_strategy` via `next_id` |
| `NextWithdrawId` | instance | `u64` counter | `0` (first id is `1`) | `request_withdraw` via `next_id` |
| `TotalShares` | instance | `i128` | `0` | `deposit`, `request_withdraw`, `cancel_withdraw` |
| `FeesAccrued` | instance | `i128` stroops | `0` | `harvest` (credit), `withdraw_fees` (reset) |
| `Strategy(u64)` | persistent | `StrategyInfo` | unknown id → `Error` | `register_strategy`, `deregister_strategy`, `set_strategy_deposit_cap` |
| `Position(Address)` | persistent | `Position` | no position | `deposit`, `request_withdraw`, `cancel_withdraw` |
| `WithdrawRequest(u64)` | persistent | `WithdrawRequest` | unknown id → `Error` | `request_withdraw`, `claim_withdraw`, `cancel_withdraw` |

Notes:

- **`TotalShares` is a running total**, not a sum over `Position` entries.
  Soroban cannot iterate persistent keys, so it must be kept in step with
  every share mint/burn in the same call.
- **`Position` stores shares, never an asset amount.** Its USDC value is
  `convert_to_assets(shares)`, which moves every time `harvest` changes the
  exchange rate. Caching an amount would go stale on the next harvest.
- **`WithdrawRequest` and `Strategy` records are never deleted.** A resolved
  request keeps `claimed_at`/`cancelled_at` set, and a deregistered strategy
  keeps `deregistered_at`, so history stays readable on-chain until the
  entry's TTL lapses.
- Total assets are not stored: `total_assets()` is computed on read as the
  adapter's idle token balance plus the active strategy's reported
  `balance` (idle balance only if there is no active strategy, or its
  `balance` call fails).

## Event schema

**Version: `1`** (see [`events::EVENT_SCHEMA_VERSION`](src/events.rs)). The
[`init`](#init) event's data payload includes `schema_version` so an indexer
can check it was built against a compatible schema before decoding
subsequent events from that contract instance.

### Stability guarantees

- **Topic names are stable identifiers.** Once shipped, a topic name is
  never renamed or reused for a different meaning.
- **Additive changes do not bump the version:** a new topic, or a new
  *trailing* field appended to an existing topic's data tuple, is
  backwards-compatible. Existing decoders keep working and ignore the new
  field.
- **Breaking changes bump `EVENT_SCHEMA_VERSION`** and are called out in
  this section: removing a topic, removing or reordering an existing
  field, changing a field's type, or changing which values appear in the
  topics tuple.
- Field order within an event's data tuple is part of the schema. Decode
  by position, not by name.
- Events within a single contract invocation are emitted in the order
  described below; ordering across invocations follows ledger close order.

### Encoding

Every event is published as `env.events().publish(topics, data)`:

- **Topics** — a tuple whose first element is always a `Symbol` naming the
  event (the constants in `src/events.rs`, e.g. `"harvested"`). Names longer
  than 9 characters use `Symbol::new`, not `symbol_short!`. Where noted, a
  second topic carries the primary subject (`owner: Address`, or a strategy
  `id: u64`) and, for withdraw requests, a third topic carries the request
  `id: u64`, so indexers can filter server-side (`topic1 == owner`) without
  decoding every event's data.
- **Data** — a fixed-order tuple of the fields in each table below.
  `Address`, `String`, `BytesN<32>` and `Option<u64>` decode as their
  standard Soroban XDR `ScVal` representations (`Option::None` is
  `ScVal::Void`).
- **Amounts** (`i128`) are in the vault token's base units (stroops). Share
  counts (`i128`) are in share units. Timestamps (`u64`) are ledger
  timestamps in seconds since the Unix epoch.

Config setters that are not listed below (`set_treasury`,
`set_performance_fee_bps`, `set_withdraw_cooldown`,
`set_strategy_deposit_cap`) emit no event; read their current value from the
matching getter.

### Topics

#### `init`
Topics: `(Symbol("init"),)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `admin` | `Address` | Initial admin. |
| 1 | `treasury` | `Address` | Initial fee treasury. |
| 2 | `token` | `Address` | SEP-41 token this adapter routes. |
| 3 | `schema_version` | `u32` | Value of `EVENT_SCHEMA_VERSION` at deploy time. |
| 4 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `admin_set`
Topics: `(Symbol("admin_set"),)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `previous_admin` | `Address` | Admin before rotation. |
| 1 | `new_admin` | `Address` | Admin after rotation. |
| 2 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `paused_changed`
Topics: `(Symbol("paused_changed"),)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `caller` | `Address` | Admin who changed the flag. |
| 1 | `paused` | `bool` | New value of the pause flag. |
| 2 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `upgraded`
Topics: `(Symbol("upgraded"),)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `caller` | `Address` | Admin who triggered the upgrade. |
| 1 | `new_wasm_hash` | `BytesN<32>` | Hash of the newly installed Wasm. |
| 2 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `deposited`
Topics: `(Symbol("deposited"), owner: Address)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `owner` | `Address` | Depositor. |
| 1 | `amount` | `i128` | Assets transferred in. |
| 2 | `shares_minted` | `i128` | Shares minted for `amount` (rounded down). |
| 3 | `position_shares` | `i128` | Owner's total shares after the deposit. |
| 4 | `total_shares` | `i128` | `TotalShares` after the deposit. |
| 5 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `withdraw_requested`
Topics: `(Symbol("withdraw_requested"), owner: Address, id: u64)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `owner` | `Address` | Position owner. |
| 1 | `request_id` | `u64` | New `WithdrawRequest` id. |
| 2 | `shares` | `i128` | Shares burned from the position. |
| 3 | `amount` | `i128` | Asset amount locked in for payout (rounded down). |
| 4 | `claimable_at` | `u64` | Ledger timestamp after which `claim_withdraw` is allowed. |
| 5 | `position_shares` | `i128` | Owner's remaining shares. |
| 6 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `withdraw_claimed`
Topics: `(Symbol("withdraw_claimed"), owner: Address, id: u64)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `owner` | `Address` | Position owner (payout recipient). |
| 1 | `request_id` | `u64` | Claimed request id. |
| 2 | `amount` | `i128` | Assets transferred out. |
| 3 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `withdraw_cancelled`
Topics: `(Symbol("withdraw_cancelled"), owner: Address, id: u64)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `owner` | `Address` | Position owner. |
| 1 | `request_id` | `u64` | Cancelled request id. |
| 2 | `shares_reminted` | `i128` | Shares re-minted at the current exchange rate. |
| 3 | `position_shares` | `i128` | Owner's total shares after the re-mint. |
| 4 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_registered`
Topics: `(Symbol("strategy_registered"), id: u64)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `strategy_id` | `u64` | New strategy id. |
| 1 | `address` | `Address` | Strategy contract address. |
| 2 | `name` | `String` | Display name. |
| 3 | `deposit_cap` | `i128` | Deposit cap; `0` means unlimited. |
| 4 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_deregistered`
Topics: `(Symbol("strategy_deregistered"), id: u64)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `strategy_id` | `u64` | Deregistered strategy id. |
| 1 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_changed`
Topics: `(Symbol("strategy_changed"),)`

Emitted by three entrypoints, told apart by which ids are set:

| Emitted by | `from` | `to` |
| --- | --- | --- |
| `set_active_strategy` | `None` | new id |
| `migrate_strategy` | old id | new id |
| `emergency_withdraw_all` | old id | `None` |

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `from` | `Option<u64>` | Previously active strategy id. |
| 1 | `to` | `Option<u64>` | Newly active strategy id. |
| 2 | `amount_moved` | `i128` | Assets moved out of `from` (`0` on activation). |
| 3 | `timestamp` | `u64` | Ledger timestamp of the call. |

#### `harvested`
Topics: `(Symbol("harvested"),)`

| # | Field | Type | Description |
| --- | --- | --- | --- |
| 0 | `caller` | `Address` | Keeper that called `harvest` (attribution only). |
| 1 | `strategy_id` | `u64` | Active strategy that was harvested. |
| 2 | `delta` | `i128` | Signed change in the strategy's balance: positive is yield, negative is loss. |
| 3 | `fee` | `i128` | Performance fee credited to `FeesAccrued`; always `0` when `delta <= 0`. |
| 4 | `total_assets` | `i128` | `total_assets()` after the harvest. |
| 5 | `total_shares` | `i128` | `TotalShares` at the harvest (unchanged by it). |
| 6 | `timestamp` | `u64` | Ledger timestamp of the call. |

Depositors' net change is `delta - fee`. A position holding `s` shares at
the time of the harvest is attributed `(delta - fee) * s / total_shares`.
Use the `deposited`, `withdraw_requested` and `withdraw_cancelled` events
to reconstruct `s` at each harvest.

#### `fee_collected`
Topics: `(Symbol("fee_collected"),)`

Each topic's exact data payload will be finalized alongside the entrypoint
that emits it (see the corresponding module doc comment) — documented here
once implemented, mirroring `savings-vault/README.md`'s "Event schema"
section.

### Topics

#### `init`
Topics: `(Symbol("init"),)`

| Field | Type | Description |
| --- | --- | --- |
| `admin` | `Address` | Initial admin. |
| `treasury` | `Address` | Initial treasury (receives collected performance fees). |
| `token` | `Address` | SEP-41 token this adapter routes. |
| `schema_version` | `u32` | Value of `EVENT_SCHEMA_VERSION` at deploy time. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_registered`
Topics: `(Symbol("strategy_registered"),)`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `u64` | The newly allocated strategy id. |
| `address` | `Address` | The registered strategy contract's address. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_deregistered`
Topics: `(Symbol("strategy_deregistered"),)`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `u64` | The deregistered strategy's id. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

#### `strategy_changed`
Topics: `(Symbol("strategy_changed"),)`

| Field | Type | Description |
| --- | --- | --- |
| `from` | `Option<u64>` | Previously active strategy id, or `None` on first activation. |
| `to` | `Option<u64>` | Newly active strategy id, or `None` when `circuit_breaker::emergency_withdraw_all` clears the active strategy with nothing set in its place. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

Emitted by `set_active_strategy` (`from: None`), `migrate_strategy` (both
`from` and `to` set), and `circuit_breaker::emergency_withdraw_all`
(`to: None`) — the indexer can distinguish first activation, migration, and
emergency-clear purely from which of `from`/`to` is present.

#### `harvested`
Topics: `(Symbol("harvested"),)`

| Field | Type | Description |
| --- | --- | --- |
| `caller` | `Address` | Whoever called `harvest` (permissionless keeper pattern — attribution only, not an auth check). |
| `delta` | `i128` | Signed change in the strategy's deployed balance since the last harvest: positive is yield, negative is a loss. |
| `fee_taken` | `i128` | Performance fee charged on `delta`. Always `0` when `delta <= 0` — see `harvest::apply_performance_fee`'s doc for why a loss is never fee-charged. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

The indexer can build a full yield history purely from this topic: sum
`delta` for gross performance, sum `fee_taken` for fees generated.

#### `fee_collected`
Topics: `(Symbol("fee_collected"),)`

| Field | Type | Description |
| --- | --- | --- |
| `caller` | `Address` | Whoever called `withdraw_fees` (permissionless — funds only ever move to the fixed `treasury` address). |
| `amount` | `i128` | Amount swept to the treasury. |
| `timestamp` | `u64` | Ledger timestamp of the call. |

Remaining topics (`admin_set`, `paused_changed`, `upgraded`, `deposited`,
`withdraw_requested`, `withdraw_claimed`, `withdraw_cancelled`) are declared
in `events.rs` but their publishers are not yet wired into the corresponding
entrypoints, which are themselves still unimplemented — see each module's
`TODO(issue)` doc comments. Documenting their payloads ahead of the
entrypoints that would emit them would drift out of sync with whatever the
eventual implementation actually needs.
