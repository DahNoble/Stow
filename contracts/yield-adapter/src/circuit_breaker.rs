//! Emergency circuit breaker — pull all funds out of the active strategy
//! back into the adapter's own idle balance, independent of the normal
//! `migrate_strategy` flow. Exists for the case where the active strategy
//! itself is misbehaving or believed compromised and admin wants funds out
//! *now*, without registering or trusting a replacement strategy first.

use soroban_sdk::{Address, Env};

use crate::admin;
use crate::error::Error;
use crate::events::TOPIC_STRATEGY_CHANGED;
use crate::storage::extend_instance_ttl;
use crate::types::{DataKey, StrategyInfo};

fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
    caller.require_auth();
    let current_admin = admin::admin(env)?;
    if *caller != current_admin {
        return Err(Error::Unauthorized);
    }
    Ok(())
}

/// Withdraw the adapter's entire deployed balance from the active strategy
/// back into the adapter's own custody, and clear `ActiveStrategy`. Does
/// **not** deregister the strategy (an admin can still inspect/re-activate
/// it after investigating). Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Safe to call even if the strategy is unresponsive to normal calls,
///   *if* the strategy interface's withdraw entrypoint still functions —
///   this is a graceful pull, not a bypass of the strategy contract. A
///   fully unresponsive/malicious strategy that refuses to return funds is
///   out of scope for this contract to solve unilaterally; see
///   `README.md`'s "Strategy interface" trust notes.
/// - After this call, `deposit` continues to accept funds (held idle,
///   earning no yield) until an admin sets a new active strategy.
/// - Emits a `strategy_changed` event with `to: None`.
///
/// This is deliberately NOT gated behind `require_not_paused`: the whole
/// point of an emergency pull is that it must still work while the contract
/// is paused for safety reasons.
pub fn emergency_withdraw_all(env: &Env, caller: Address) -> Result<i128, Error> {
    require_admin(env, &caller)?;

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
    let deployed: i128 = env.invoke_contract(
        &info.address,
        &soroban_sdk::Symbol::new(env, "balance"),
        soroban_sdk::vec![env, soroban_sdk::IntoVal::into_val(&contract_address, env)],
    );
    if deployed > 0 {
        let () = env.invoke_contract(
            &info.address,
            &soroban_sdk::Symbol::new(env, "withdraw"),
            soroban_sdk::vec![
                env,
                soroban_sdk::IntoVal::into_val(&contract_address, env),
                soroban_sdk::IntoVal::into_val(&deployed, env)
            ],
        );
    }

    extend_instance_ttl(env);
    env.storage().instance().remove(&DataKey::ActiveStrategy);

    let to: Option<u64> = None;
    env.events().publish(
        (TOPIC_STRATEGY_CHANGED,),
        (Some(active_id), to, env.ledger().timestamp()),
    );

    Ok(deployed)
}
