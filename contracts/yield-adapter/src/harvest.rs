//! Harvest — report yield (or loss) from the active strategy and move the
//! exchange rate accordingly.

use soroban_sdk::{Address, Env};

use crate::admin;
use crate::error::Error;
use crate::events::TOPIC_HARVESTED;
use crate::storage::extend_instance_ttl;
use crate::types::{DataKey, StrategyInfo};

/// Report the active strategy's current yield and update accounting.
///
/// - Callable by anyone (permissionless "keeper" pattern — no `require_auth`
///   check on `caller` beyond passing it through to the `harvested` event
///   for attribution). Rate-limited by [`check_harvest_interval`] instead of
///   an allowlist, so no single keeper is a liveness dependency.
/// - Errors `Error::Paused` while paused.
/// - Compares the strategy's reported balance against the adapter's tracked
///   deployed balance:
///   - **Positive** delta (yield): apply [`apply_performance_fee`], then
///     grow `total_assets()` by the post-fee remainder. Depositors' shares
///     are unchanged; `exchange_rate` rises.
///   - **Negative** delta (loss): shrink `total_assets()` by the full loss.
///     No fee is charged on a loss — see `apply_performance_fee` doc for
///     why that matters.
/// - Emits a `harvested` event with the signed delta and fee taken (`0` on
///   a loss).
pub fn harvest(env: &Env, caller: Address) -> Result<i128, Error> {
    admin::require_not_paused(env)?;
    check_harvest_interval(env)?;

    let active_id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::ActiveStrategy)
        .ok_or(Error::StrategyNotFound)?;
    let info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&DataKey::Strategy(active_id))
        .ok_or(Error::StrategyNotFound)?;

    let contract_address = env.current_contract_address();
    let live_balance: i128 = env.invoke_contract(
        &info.address,
        &soroban_sdk::Symbol::new(env, "balance"),
        soroban_sdk::vec![env, soroban_sdk::IntoVal::into_val(&contract_address, env)],
    );

    let tracked: i128 = env
        .storage()
        .instance()
        .get(&DataKey::DeployedBalance)
        .unwrap_or(0);

    let delta = live_balance.checked_sub(tracked).ok_or(Error::Overflow)?;

    let fee_taken = if delta > 0 {
        let remainder = apply_performance_fee(env, delta)?;
        delta.checked_sub(remainder).ok_or(Error::Overflow)?
    } else {
        0
    };

    extend_instance_ttl(env);
    env.storage()
        .instance()
        .set(&DataKey::DeployedBalance, &live_balance);
    env.storage()
        .instance()
        .set(&DataKey::LastHarvestAt, &env.ledger().timestamp());

    env.events().publish(
        (TOPIC_HARVESTED,),
        (caller, delta, fee_taken, env.ledger().timestamp()),
    );

    Ok(delta)
}

/// Apply the configured performance fee to a **positive** yield amount,
/// crediting the fee to `DataKey::FeesAccrued` and returning the
/// depositor-facing remainder.
///
/// Must only ever be called with `yield_amount > 0`. Charging a fee on a
/// loss (or on a wash — yield that merely offsets a prior loss) would let
/// the treasury extract value that was never actually earned, at
/// depositors' expense.
pub fn apply_performance_fee(env: &Env, yield_amount: i128) -> Result<i128, Error> {
    if yield_amount <= 0 {
        return Err(Error::InvalidAmount);
    }
    let bps = admin::performance_fee_bps(env);
    let fee = if bps == 0 {
        0
    } else {
        yield_amount
            .checked_mul(bps as i128)
            .and_then(|v| v.checked_div(10_000))
            .ok_or(Error::Overflow)?
    };

    if fee > 0 {
        let accrued: i128 = env
            .storage()
            .instance()
            .get(&DataKey::FeesAccrued)
            .unwrap_or(0);
        let new_accrued = accrued.checked_add(fee).ok_or(Error::Overflow)?;
        env.storage()
            .instance()
            .set(&DataKey::FeesAccrued, &new_accrued);
    }

    yield_amount.checked_sub(fee).ok_or(Error::Overflow)
}

/// Guard for `harvest`: errors `Error::HarvestTooSoon` if fewer than
/// `admin::harvest_interval()` seconds have elapsed since
/// `DataKey::LastHarvestAt`. Exists so a griefer can't spam `harvest` calls
/// to burn the adapter's ledger-write budget; a legitimate keeper only needs
/// to call it a few times a day at most.
pub fn check_harvest_interval(env: &Env) -> Result<(), Error> {
    let interval: u64 = env
        .storage()
        .instance()
        .get(&DataKey::HarvestInterval)
        .unwrap_or(0);
    if interval == 0 {
        return Ok(());
    }
    // `has()`, not a `last == 0` sentinel: the test/local ledger clock
    // genuinely starts at timestamp 0, so a real first-harvest-at-time-0
    // would otherwise be indistinguishable from "never harvested" and let
    // every harvest after it bypass the interval check.
    if !env.storage().instance().has(&DataKey::LastHarvestAt) {
        return Ok(());
    }
    let last: u64 = env
        .storage()
        .instance()
        .get(&DataKey::LastHarvestAt)
        .unwrap_or(0);
    let now = env.ledger().timestamp();
    if now.saturating_sub(last) < interval {
        return Err(Error::HarvestTooSoon);
    }
    Ok(())
}
