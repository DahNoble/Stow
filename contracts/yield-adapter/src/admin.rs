//! Initialization and admin configuration.

use soroban_sdk::{Address, BytesN, Env};

use crate::error::Error;
use crate::events::{EVENT_SCHEMA_VERSION, TOPIC_INIT, TOPIC_PAUSED_CHANGED};
use crate::storage::{self, extend_instance_ttl};
use crate::types::DataKey;

/// Initialize the adapter.
///
/// - Stores `admin`, `treasury`, and the `token` (SEP-41, e.g. USDC) address
///   — `token` must match the upstream `savings-vault`'s token.
/// - Seeds id counters, `TotalShares`, and `FeesAccrued` at `0`.
/// - Must be callable exactly once; subsequent calls -> `Error::AlreadyInitialized`.
/// - Emits an `init` event carrying [`crate::events::EVENT_SCHEMA_VERSION`].
///
/// Acceptance: after init, `admin()`, `treasury()`, and `token()` return the
/// given values; `total_assets()` and `total_shares()` both return `0`.
///
pub fn initialize(
    env: &Env,
    admin: Address,
    treasury: Address,
    token: Address,
) -> Result<(), Error> {
    if env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::AlreadyInitialized);
    }

    extend_instance_ttl(env);

    env.storage().instance().set(&DataKey::Admin, &admin);
    env.storage().instance().set(&DataKey::Treasury, &treasury);
    storage::set_token(env, &token);

    env.storage()
        .instance()
        .set(&DataKey::NextStrategyId, &0u64);
    env.storage()
        .instance()
        .set(&DataKey::NextWithdrawId, &0u64);
    env.storage().instance().set(&DataKey::TotalShares, &0i128);
    env.storage().instance().set(&DataKey::FeesAccrued, &0i128);

    env.events().publish(
        (TOPIC_INIT,),
        (
            admin,
            treasury,
            token,
            EVENT_SCHEMA_VERSION,
            env.ledger().timestamp(),
        ),
    );

    Ok(())
}

/// Return the configured admin address, or `Error::NotInitialized`.
pub fn admin(env: &Env) -> Result<Address, Error> {
    storage::get_admin(env).ok_or(Error::NotInitialized)
}

/// Return the configured treasury address, or `Error::NotInitialized`.
pub fn treasury(env: &Env) -> Result<Address, Error> {
    storage::get_treasury(env).ok_or(Error::NotInitialized)
}

/// Return the configured vault token, or `Error::NotInitialized`.
pub fn token(env: &Env) -> Result<Address, Error> {
    storage::get_token(env).ok_or(Error::NotInitialized)
}

/// Rotate the admin. Requires `require_auth` from the current admin.
///
/// TODO(issue): implement — mirrors `savings-vault::admin::set_admin`. Emit
/// `admin_set`.
pub fn set_admin(_env: &Env, _new_admin: Address) -> Result<(), Error> {
    unimplemented!("admin: set_admin")
}

/// Change the treasury address that receives collected performance fees.
/// Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Does **not** sweep already-accrued fees to the new treasury — call
///   `withdraw_fees` beforehand if that matters for the transition.
///
/// TODO(issue): implement.
pub fn set_treasury(_env: &Env, _caller: Address, _new_treasury: Address) -> Result<(), Error> {
    unimplemented!("admin: set_treasury")
}

/// The performance fee, in basis points (0-10_000), charged only on positive
/// yield at `harvest` time. Defaults to `0` before ever set.
pub fn performance_fee_bps(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PerformanceFeeBps)
        .unwrap_or(0)
}

/// Set the performance fee. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Errors `Error::FeeTooHigh` if `bps > 3_000` (30%) — see
///   `fees` module doc for why this cap exists.
/// - Takes effect on the *next* `harvest` call; does not retroactively
///   apply to yield already reported.
pub fn set_performance_fee_bps(env: &Env, caller: Address, bps: u32) -> Result<(), Error> {
    caller.require_auth();
    let current_admin = admin(env)?;
    if caller != current_admin {
        return Err(Error::Unauthorized);
    }
    crate::fees::validate_fee_bps(bps)?;

    extend_instance_ttl(env);
    env.storage()
        .instance()
        .set(&DataKey::PerformanceFeeBps, &bps);
    Ok(())
}

/// Minimum number of seconds between successful `harvest` calls. Defaults
/// to `0` (no minimum) if unset. See `harvest::check_harvest_interval`.
pub fn harvest_interval(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&DataKey::HarvestInterval)
        .unwrap_or(0)
}

/// Set the minimum interval between `harvest` calls. Admin-only. Mirrors
/// `set_withdraw_cooldown`'s shape.
///
/// - Requires `require_auth` from the current admin.
/// - Takes effect on the very next `check_harvest_interval` call.
pub fn set_harvest_interval(env: &Env, caller: Address, seconds: u64) -> Result<(), Error> {
    extend_instance_ttl(env);

    let current_admin = storage::get_admin(env).ok_or(Error::NotInitialized)?;
    caller.require_auth();
    if caller != current_admin {
        return Err(Error::Unauthorized);
    }

    env.storage()
        .instance()
        .set(&DataKey::HarvestInterval, &seconds);

    Ok(())
}

/// Set the emergency-pause flag. Admin-only.
///
/// While paused, `deposit`, `request_withdraw`, `harvest`, and strategy
/// mutations reject with `Error::Paused`; `claim_withdraw` and reads remain
/// available so users already mid-withdrawal are never trapped by a pause.
pub fn set_paused(env: &Env, caller: Address, paused: bool) -> Result<(), Error> {
    caller.require_auth();
    let current_admin = admin(env)?;
    if caller != current_admin {
        return Err(Error::Unauthorized);
    }
    extend_instance_ttl(env);
    env.storage().instance().set(&DataKey::Paused, &paused);
    env.events()
        .publish((TOPIC_PAUSED_CHANGED,), (paused, env.ledger().timestamp()));
    Ok(())
}

/// Whether the contract is currently paused. Defaults to `false` if unset.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Guard for mutating entrypoints: returns `Error::Paused` while paused.
pub fn require_not_paused(env: &Env) -> Result<(), Error> {
    if is_paused(env) {
        return Err(Error::Paused);
    }
    Ok(())
}

/// Cooldown, in seconds, `request_withdraw` must wait before
/// `claim_withdraw` is permitted. Defaults to `0` (no cooldown) if unset.
pub fn withdraw_cooldown(_env: &Env) -> u64 {
    unimplemented!("admin: withdraw_cooldown")
}

/// Set the withdrawal cooldown. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Only affects requests created *after* the change; in-flight
///   `WithdrawRequest`s keep the `claimable_at` computed at request time.
///
/// TODO(issue): implement.
pub fn set_withdraw_cooldown(_env: &Env, _caller: Address, _seconds: u64) -> Result<(), Error> {
    unimplemented!("admin: set_withdraw_cooldown")
}

/// Upgrade the contract's Wasm executable to `new_wasm_hash`. Admin-only.
///
/// Same trust trade-off as `savings-vault::admin::upgrade` (see that
/// function's doc comment): the admin key can replace contract logic
/// outright, including custody rules. Storage is not migrated automatically.
///
/// TODO(issue): implement.
pub fn upgrade(_env: &Env, _caller: Address, _new_wasm_hash: BytesN<32>) -> Result<(), Error> {
    unimplemented!("admin: upgrade")
}
