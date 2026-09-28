//! Deposits — convert vault-token in for shares of the adapter.

use soroban_sdk::{Address, Env, IntoVal, Symbol};

use crate::accounting;
use crate::admin;
use crate::error::Error;
use crate::events::TOPIC_DEPOSITED;
use crate::storage;
use crate::types::{DataKey, Position, StrategyInfo};

/// Deposit `amount` of the vault token, minting shares to `from` at the
/// current exchange rate.
///
/// - `from.require_auth()`.
/// - Errors `Error::Paused` while paused (see `admin::set_paused`).
/// - Errors `Error::InvalidAmount` if `amount <= 0`.
/// - Errors `Error::StrategyCapExceeded` if the active strategy has a
///   nonzero deposit cap and the resulting total deployed balance would
///   exceed it.
/// - Shares minted = `accounting::convert_to_shares(amount)`, computed
///   **before** `amount` is transferred in (so the deposit itself does not
///   move the exchange rate against the depositor).
/// - Transfers `amount` in, then forwards it to the active strategy (if
///   any); with no active strategy, funds sit idle in the adapter and
///   accrue no yield until one is set.
/// - Creates the position on first deposit; increments `shares` otherwise.
/// - Emits a `deposited` event.
pub fn deposit(env: &Env, from: Address, amount: i128) -> Result<i128, Error> {
    from.require_auth();
    admin::require_not_paused(env)?;

    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    let shares = accounting::convert_to_shares(env, amount)?;

    let active_strategy: Option<(u64, StrategyInfo)> = env
        .storage()
        .instance()
        .get::<_, u64>(&DataKey::ActiveStrategy)
        .and_then(|id| {
            env.storage()
                .persistent()
                .get::<_, StrategyInfo>(&DataKey::Strategy(id))
                .map(|info| (id, info))
        });

    if let Some((_, ref info)) = active_strategy {
        if info.deposit_cap > 0 {
            let deployed: i128 = env.invoke_contract(
                &info.address,
                &Symbol::new(env, "balance"),
                soroban_sdk::vec![env, env.current_contract_address().into_val(env)],
            );
            let new_deployed = deployed.checked_add(amount).ok_or(Error::Overflow)?;
            if new_deployed > info.deposit_cap {
                return Err(Error::StrategyCapExceeded);
            }
        }
    }

    storage::transfer_in(env, &from, amount)?;

    if let Some((_, ref info)) = active_strategy {
        let () = env.invoke_contract(
            &info.address,
            &Symbol::new(env, "deposit"),
            soroban_sdk::vec![
                env,
                env.current_contract_address().into_val(env),
                amount.into_val(env)
            ],
        );
    }

    let now = env.ledger().timestamp();
    let position_key = DataKey::Position(from.clone());
    let position: Position =
        if let Some(mut existing) = env.storage().persistent().get::<_, Position>(&position_key) {
            existing.shares = existing.shares.checked_add(shares).ok_or(Error::Overflow)?;
            existing.updated_at = now;
            existing
        } else {
            Position {
                owner: from.clone(),
                shares,
                created_at: now,
                updated_at: now,
            }
        };

    let total_shares = accounting::total_shares(env);
    let new_total_shares = total_shares.checked_add(shares).ok_or(Error::Overflow)?;

    storage::extend_instance_ttl(env);
    env.storage().persistent().set(&position_key, &position);
    storage::extend_persistent_ttl(env, &position_key);
    env.storage()
        .instance()
        .set(&DataKey::TotalShares, &new_total_shares);

    env.events().publish(
        (TOPIC_DEPOSITED,),
        (from, amount, shares, env.ledger().timestamp()),
    );

    Ok(shares)
}

/// Read `owner`'s position, or `Error::NotFound`.
pub fn get_position(env: &Env, owner: Address) -> Result<Position, Error> {
    let key = DataKey::Position(owner);
    let position: Position = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NotFound)?;
    storage::extend_persistent_ttl(env, &key);
    Ok(position)
}
