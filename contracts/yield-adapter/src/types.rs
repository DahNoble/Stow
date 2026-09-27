use soroban_sdk::{contracttype, Address, String};

/// A registered yield strategy: an external contract this adapter can route
/// idle funds into. Only one strategy is ever "active" at a time; others may
/// remain registered (e.g. mid-migration, or kept for historical reference).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct StrategyInfo {
    pub id: u64,
    /// The strategy contract's address. This adapter treats it as an opaque
    /// external contract reachable via `env.invoke_contract` — see the
    /// "Strategy interface" doc in `README.md` for the expected entrypoints.
    pub address: Address,
    pub name: String,
    /// Optional per-strategy deposit cap, in vault-token stroops. `0` means
    /// unlimited.
    pub deposit_cap: i128,
    pub registered_at: u64,
    /// Set when the strategy is deregistered; a deregistered strategy can
    /// never become active again.
    pub deregistered_at: Option<u64>,
}

/// A depositor's position in the adapter, denominated in shares.
///
/// The actual USDC value of a position is `shares * exchange_rate()` — see
/// `accounting::convert_to_assets`. This struct intentionally does not cache
/// an asset amount: caching it would drift out of sync every time `harvest`
/// moves the exchange rate.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Position {
    pub owner: Address,
    pub shares: i128,
    pub created_at: u64,
    pub updated_at: u64,
}

/// A pending withdrawal, queued behind the admin-configured cooldown so the
/// adapter has time to unwind funds from an illiquid strategy.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct WithdrawRequest {
    pub id: u64,
    pub owner: Address,
    pub shares: i128,
    /// Ledger timestamp after which `claim_withdraw` is permitted.
    pub claimable_at: u64,
    pub requested_at: u64,
    pub claimed_at: Option<u64>,
    pub cancelled_at: Option<u64>,
}

/// Storage keys. One variant per logical record family.
///
/// See the `storage` module docs, or the "Storage layout" section of
/// `README.md`, for the full storage model: durability (instance vs.
/// persistent) and TTL policy per key.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Contract admin.
    Admin,
    /// Address that receives collected performance fees.
    Treasury,
    /// The SEP-41 token (e.g. USDC) this adapter routes, matching the
    /// upstream `savings-vault`'s token.
    Token,
    /// Emergency-pause flag. Absent/false means unpaused.
    Paused,
    /// Performance fee, in basis points (0-10_000), charged only on positive
    /// yield at `harvest` time. Absent means `0`.
    PerformanceFeeBps,
    /// Minimum number of seconds between successful `harvest` calls.
    /// Absent means no minimum.
    HarvestInterval,
    /// Ledger timestamp of the last successful `harvest` call.
    LastHarvestAt,
    /// Cooldown, in seconds, a `request_withdraw` must wait before
    /// `claim_withdraw` is permitted. Absent means `0`.
    WithdrawCooldown,
    /// Id of the currently active strategy. Absent means no active strategy
    /// (deposits accrue no yield; `deposit`/`harvest` still function).
    ActiveStrategy,
    /// Monotonic counters for strategy/withdraw-request ids.
    NextStrategyId,
    NextWithdrawId,
    /// Total shares outstanding across all positions. Kept as a running
    /// total rather than summed on read — recomputing by iterating every
    /// `Position` entry is not possible on Soroban without an explicit,
    /// unbounded index.
    TotalShares,
    /// The adapter's deployed balance in the active strategy, as of the
    /// last successful `harvest`. `harvest` diffs the strategy's live
    /// `balance()` report against this snapshot to compute yield/loss;
    /// absent (before the first harvest, or with no active strategy) reads
    /// as `0`.
    DeployedBalance,
    /// Fees accrued (in vault-token stroops) and not yet swept to the
    /// treasury via `withdraw_fees`.
    FeesAccrued,
    /// `StrategyInfo` by id.
    Strategy(u64),
    /// `Position` by owner.
    Position(Address),
    /// `WithdrawRequest` by id.
    WithdrawRequest(u64),
}
