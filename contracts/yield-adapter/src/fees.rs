//! Performance fee collection.
//!
//! Fees accrue in `DataKey::FeesAccrued` as `harvest` reports positive yield
//! (see `harvest::apply_performance_fee`) and are swept to the treasury on
//! demand via `withdraw_fees`, rather than transferred automatically on
//! every `harvest` — batching sweeps keeps `harvest` (the more
//! latency-sensitive, keeper-called path) cheaper.

use soroban_sdk::{Address, Env};

use crate::admin;
use crate::error::Error;
use crate::events::TOPIC_FEE_COLLECTED;
use crate::storage::{self, extend_instance_ttl};
use crate::types::DataKey;

/// Maximum performance fee, in basis points. Enforced by
/// `admin::set_performance_fee_bps`; documented here because it is a
/// property of the fee *model*, not the admin-config plumbing.
pub const MAX_PERFORMANCE_FEE_BPS: u32 = 3_000; // 30%

/// Validate a proposed performance fee. Errors `Error::FeeTooHigh` if
/// `bps > MAX_PERFORMANCE_FEE_BPS`.
pub fn validate_fee_bps(bps: u32) -> Result<(), Error> {
    if bps > MAX_PERFORMANCE_FEE_BPS {
        return Err(Error::FeeTooHigh);
    }
    Ok(())
}

/// Read the current accrued-and-unswept fee balance.
pub fn fees_accrued(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::FeesAccrued)
        .unwrap_or(0)
}

/// Sweep all accrued fees to the treasury. Callable by anyone (funds only
/// ever move to the fixed `treasury` address, so there is nothing to gain by
/// restricting the caller — same reasoning as `harvest`'s permissionless
/// design).
///
/// - Errors `Error::NoFeesAccrued` if the accrued balance is `0`.
/// - Resets `DataKey::FeesAccrued` to `0` before transferring, so a
///   reentrant call from a hostile token contract cannot double-spend the
///   swept amount.
/// - Emits a `fee_collected` event.
pub fn withdraw_fees(env: &Env, caller: Address) -> Result<i128, Error> {
    let accrued = fees_accrued(env);
    if accrued <= 0 {
        return Err(Error::NoFeesAccrued);
    }

    extend_instance_ttl(env);
    env.storage().instance().set(&DataKey::FeesAccrued, &0i128);

    let treasury = admin::treasury(env)?;
    storage::transfer_out(env, &treasury, accrued)?;

    env.events().publish(
        (TOPIC_FEE_COLLECTED,),
        (caller, accrued, env.ledger().timestamp()),
    );

    Ok(accrued)
}
