//! Strategy registry.
//!
//! A "strategy" is an external contract this adapter can route idle vault
//! funds into (e.g. a lending-market wrapper). Exactly one registered
//! strategy is ever "active" at a time — the one `deposit` and `harvest`
//! interact with. Others may stay registered (e.g. mid-migration) but never
//! receive funds. See `README.md`'s "Strategy interface" section for the
//! entrypoints a strategy contract must expose to be usable here.

use soroban_sdk::{Address, Env, String, Vec};

use crate::admin;
use crate::error::Error;
use crate::events::{
    TOPIC_STRATEGY_CHANGED, TOPIC_STRATEGY_DEREGISTERED, TOPIC_STRATEGY_REGISTERED,
};
use crate::storage::{self, extend_instance_ttl, extend_persistent_ttl};
use crate::types::{DataKey, StrategyInfo};

fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
    caller.require_auth();
    let current_admin = admin::admin(env)?;
    if *caller != current_admin {
        return Err(Error::Unauthorized);
    }
    Ok(())
}

/// True if `address` is already registered under any strategy id (active or
/// not, deregistered or not — an id is permanent once allocated).
fn is_address_registered(env: &Env, address: &Address) -> bool {
    let next: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextStrategyId)
        .unwrap_or(0);
    for id in 1..=next {
        if let Some(info) = env
            .storage()
            .persistent()
            .get::<DataKey, StrategyInfo>(&DataKey::Strategy(id))
        {
            if info.address == *address {
                return true;
            }
        }
    }
    false
}

/// Register a new strategy. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Errors `Error::StrategyAlreadyRegistered` if `address` is already
///   registered under a different id.
/// - Does **not** make the strategy active — call `set_active_strategy`
///   separately. This split lets an admin register and sanity-check a
///   strategy before routing real funds to it.
/// - Emits a `strategy_registered` event.
pub fn register_strategy(
    env: &Env,
    caller: Address,
    address: Address,
    name: String,
) -> Result<u64, Error> {
    require_admin(env, &caller)?;
    admin::require_not_paused(env)?;

    if is_address_registered(env, &address) {
        return Err(Error::StrategyAlreadyRegistered);
    }

    extend_instance_ttl(env);
    let id = storage::next_id(env, DataKey::NextStrategyId);
    let info = StrategyInfo {
        id,
        address: address.clone(),
        name,
        deposit_cap: 0,
        registered_at: env.ledger().timestamp(),
        deregistered_at: None,
    };
    let key = DataKey::Strategy(id);
    env.storage().persistent().set(&key, &info);
    extend_persistent_ttl(env, &key);

    env.events().publish(
        (TOPIC_STRATEGY_REGISTERED,),
        (id, address, env.ledger().timestamp()),
    );

    Ok(id)
}

/// Deregister a strategy. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Errors `Error::StrategyActive` if `strategy_id` is the currently active
///   strategy — migrate away from it first via `migrate_strategy`.
/// - A deregistered strategy's id can never be re-registered or reactivated;
///   `deregistered_at` is permanent.
/// - Emits a `strategy_deregistered` event.
pub fn deregister_strategy(env: &Env, caller: Address, strategy_id: u64) -> Result<(), Error> {
    require_admin(env, &caller)?;
    admin::require_not_paused(env)?;

    let active: Option<u64> = env.storage().instance().get(&DataKey::ActiveStrategy);
    if active == Some(strategy_id) {
        return Err(Error::StrategyActive);
    }

    let key = DataKey::Strategy(strategy_id);
    let mut info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::StrategyNotFound)?;

    extend_instance_ttl(env);
    info.deregistered_at = Some(env.ledger().timestamp());
    env.storage().persistent().set(&key, &info);
    extend_persistent_ttl(env, &key);

    env.events().publish(
        (TOPIC_STRATEGY_DEREGISTERED,),
        (strategy_id, env.ledger().timestamp()),
    );

    Ok(())
}

/// Set the active strategy when there is currently none (first activation
/// only — funds are not moved because there is nothing to move from).
/// Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Errors `Error::StrategyAlreadyActive` if a strategy is already active
///   — use `migrate_strategy` to switch between two active strategies so
///   funds are moved atomically rather than stranded.
/// - Emits a `strategy_changed` event with `from: None`.
pub fn set_active_strategy(env: &Env, caller: Address, strategy_id: u64) -> Result<(), Error> {
    require_admin(env, &caller)?;
    admin::require_not_paused(env)?;

    if env.storage().instance().has(&DataKey::ActiveStrategy) {
        return Err(Error::StrategyAlreadyActive);
    }

    let info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&DataKey::Strategy(strategy_id))
        .ok_or(Error::StrategyNotFound)?;
    if info.deregistered_at.is_some() {
        return Err(Error::StrategyNotFound);
    }

    extend_instance_ttl(env);
    env.storage()
        .instance()
        .set(&DataKey::ActiveStrategy, &strategy_id);

    let from: Option<u64> = None;
    env.events().publish(
        (TOPIC_STRATEGY_CHANGED,),
        (from, strategy_id, env.ledger().timestamp()),
    );

    Ok(())
}

/// Move all deployed funds from the current active strategy to
/// `new_strategy_id` and make it active. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Withdraws the adapter's full balance from the old strategy, deposits it
///   into the new one.
/// - Must preserve `total_assets()` (modulo the old strategy's own
///   withdrawal fees/slippage, if any — see the "Strategy interface" doc for
///   how those are surfaced and accounted for).
/// - Emits a `strategy_changed` event with both `from` and `to` ids.
pub fn migrate_strategy(env: &Env, caller: Address, new_strategy_id: u64) -> Result<(), Error> {
    require_admin(env, &caller)?;
    admin::require_not_paused(env)?;

    let old_id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::ActiveStrategy)
        .ok_or(Error::StrategyNotFound)?;
    if old_id == new_strategy_id {
        return Err(Error::StrategyAlreadyActive);
    }

    let new_info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&DataKey::Strategy(new_strategy_id))
        .ok_or(Error::StrategyNotFound)?;
    if new_info.deregistered_at.is_some() {
        return Err(Error::StrategyNotFound);
    }
    let old_info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&DataKey::Strategy(old_id))
        .ok_or(Error::StrategyNotFound)?;

    let contract_address = env.current_contract_address();

    // Pull the adapter's full balance out of the old strategy, back into
    // this contract, then push it all into the new one. The strategy
    // interface's balance()/withdraw()/deposit() shapes are documented in
    // README.md's "Strategy interface" section.
    let deployed: i128 = env.invoke_contract(
        &old_info.address,
        &soroban_sdk::Symbol::new(env, "balance"),
        soroban_sdk::vec![env, soroban_sdk::IntoVal::into_val(&contract_address, env)],
    );
    if deployed > 0 {
        let () = env.invoke_contract(
            &old_info.address,
            &soroban_sdk::Symbol::new(env, "withdraw"),
            soroban_sdk::vec![
                env,
                soroban_sdk::IntoVal::into_val(&contract_address, env),
                soroban_sdk::IntoVal::into_val(&deployed, env)
            ],
        );
        let () = env.invoke_contract(
            &new_info.address,
            &soroban_sdk::Symbol::new(env, "deposit"),
            soroban_sdk::vec![
                env,
                soroban_sdk::IntoVal::into_val(&contract_address, env),
                soroban_sdk::IntoVal::into_val(&deployed, env)
            ],
        );
    }

    extend_instance_ttl(env);
    env.storage()
        .instance()
        .set(&DataKey::ActiveStrategy, &new_strategy_id);

    env.events().publish(
        (TOPIC_STRATEGY_CHANGED,),
        (Some(old_id), new_strategy_id, env.ledger().timestamp()),
    );

    Ok(())
}

/// Set a per-strategy deposit cap, in vault-token stroops. `0` means
/// unlimited. Admin-only.
///
/// - Requires `require_auth` from the current admin.
/// - Enforced in `deposit` against the *active* strategy's cap only; a
///   non-active strategy's cap has no live effect.
///
/// TODO(issue): implement.
pub fn set_strategy_deposit_cap(
    _env: &Env,
    _caller: Address,
    _strategy_id: u64,
    _cap: i128,
) -> Result<(), Error> {
    unimplemented!("strategy: set_strategy_deposit_cap")
}

/// Read a strategy by id, or `Error::StrategyNotFound`.
pub fn get_strategy(env: &Env, strategy_id: u64) -> Result<StrategyInfo, Error> {
    let key = DataKey::Strategy(strategy_id);
    let info: StrategyInfo = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::StrategyNotFound)?;
    extend_persistent_ttl(env, &key);
    Ok(info)
}

/// List all registered strategies (including deregistered ones — check
/// `deregistered_at` to filter).
///
/// Iterates `1..=NextStrategyId`; fine at expected strategy counts (low
/// single digits) but do not reuse this pattern for anything with unbounded
/// cardinality (e.g. positions).
pub fn list_strategies(env: &Env) -> Vec<StrategyInfo> {
    let next: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextStrategyId)
        .unwrap_or(0);
    let mut out = Vec::new(env);
    for id in 1..=next {
        if let Some(info) = env
            .storage()
            .persistent()
            .get::<DataKey, StrategyInfo>(&DataKey::Strategy(id))
        {
            out.push_back(info);
        }
    }
    out
}
