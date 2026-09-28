//! Share/asset accounting.
//!
//! Positions are denominated in shares, not raw asset amounts, so that
//! `harvest` can grow (or, on a strategy loss, shrink) every depositor's
//! value proportionally by moving a single exchange rate instead of
//! rewriting every `Position` record.
//!
//! ## Rounding direction
//!
//! Rounding must always favor the adapter over the depositor, or repeated
//! deposit/withdraw cycles at the rounding boundary let a depositor extract
//! more value than they put in:
//!
//! - `convert_to_shares` (used by `deposit`): round **down**. A depositor
//!   who deposits an amount that doesn't divide evenly gets slightly fewer
//!   shares, never more.
//! - `convert_to_assets` (used by `request_withdraw`, `claim_withdraw`,
//!   `cancel_withdraw`'s re-mint): round **down**. A withdrawal that doesn't
//!   divide evenly pays out slightly less, never more.

use soroban_sdk::{token, Env, IntoVal, Symbol, Vec};

use crate::error::Error;
use crate::storage;
use crate::types::DataKey;

/// Total vault-token value the adapter is responsible for: its own idle
/// balance plus whatever is currently deployed in the active strategy
/// (queried via the strategy's own balance-reporting entrypoint — see
/// `README.md`'s "Strategy interface").
pub fn total_assets(env: &Env) -> i128 {
    let token_opt = storage::get_token(env);
    if token_opt.is_none() {
        // Contract not initialized yet
        return 0;
    }
    let token = token_opt.unwrap();

    // Get the adapter's idle balance (tokens held directly by this contract)
    let token_client = token::Client::new(env, &token);
    let idle_balance = token_client.balance(&env.current_contract_address());

    // Check if there's an active strategy
    let active_strategy_id: Option<u64> = env.storage().instance().get(&DataKey::ActiveStrategy);

    if let Some(strategy_id) = active_strategy_id {
        // Get the strategy info to find its address
        let strategy_key = DataKey::Strategy(strategy_id);
        let strategy_info_opt: Option<crate::types::StrategyInfo> =
            env.storage().persistent().get(&strategy_key);

        if let Some(strategy_info) = strategy_info_opt {
            // Query the strategy's balance entrypoint: balance(of: Address) -> i128
            // The strategy reports how much of the adapter's funds it holds (including yield)
            // try_invoke_contract returns Result<Result<T, Error>, InvokeError>
            match env.try_invoke_contract::<i128, soroban_sdk::Error>(
                &strategy_info.address,
                &Symbol::new(env, "balance"),
                Vec::from_array(env, [env.current_contract_address().into_val(env)]),
            ) {
                Ok(Ok(deployed)) => {
                    return idle_balance.saturating_add(deployed);
                }
                _ => {
                    // If strategy call fails, fall through to return just idle balance
                }
            }
        }
    }

    // No active strategy or strategy query failed — just return idle balance
    idle_balance
}

/// Total shares outstanding across all positions. Backed by the
/// `DataKey::TotalShares` running total, not a scan over `Position` entries.
pub fn total_shares(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalShares)
        .unwrap_or(0)
}

/// Convert an asset amount to shares at the current exchange rate, rounding
/// down. On the very first deposit (when `total_shares() == 0`), shares are
/// minted 1:1 with assets.
pub fn convert_to_shares(env: &Env, assets: i128) -> Result<i128, Error> {
    if assets <= 0 {
        return Err(Error::InvalidAmount);
    }

    let shares_outstanding = total_shares(env);

    // First deposit: mint shares 1:1 with assets
    if shares_outstanding == 0 {
        return Ok(assets);
    }

    // Subsequent deposits: proportional to current exchange rate
    // shares = (assets * total_shares) / total_assets
    // Rounding down favors the adapter over the depositor
    let assets_in_vault = total_assets(env);

    if assets_in_vault <= 0 {
        // Edge case: if total_assets is 0 but shares exist, something is wrong
        // Fall back to 1:1 to allow recovery
        return Ok(assets);
    }

    // Compute shares = (assets * shares_outstanding) / assets_in_vault
    // Check for overflow in the multiplication
    let numerator = assets
        .checked_mul(shares_outstanding)
        .ok_or(Error::Overflow)?;

    // Integer division rounds down automatically (toward zero for positive numbers)
    let shares = numerator
        .checked_div(assets_in_vault)
        .ok_or(Error::Overflow)?;

    Ok(shares)
}

/// Convert a share amount to assets at the current exchange rate, rounding
/// down.
pub fn convert_to_assets(env: &Env, shares: i128) -> Result<i128, Error> {
    if shares <= 0 {
        return Err(Error::InvalidAmount);
    }

    let shares_outstanding = total_shares(env);

    // If no shares exist in the system, cannot convert
    if shares_outstanding == 0 {
        return Err(Error::InvalidAmount);
    }

    let assets_in_vault = total_assets(env);

    // If vault has no assets, shares are worthless (edge case/loss scenario)
    if assets_in_vault <= 0 {
        return Ok(0);
    }

    // Compute assets = (shares * total_assets) / total_shares
    // Rounding down favors the adapter over the withdrawer
    let numerator = shares.checked_mul(assets_in_vault).ok_or(Error::Overflow)?;

    // Integer division rounds down automatically (toward zero for positive numbers)
    let assets = numerator
        .checked_div(shares_outstanding)
        .ok_or(Error::Overflow)?;

    Ok(assets)
}

/// The current exchange rate, expressed as `(total_assets, total_shares)` so
/// callers can compute a ratio at whatever precision they need without this
/// crate picking a fixed-point scale for them.
pub fn exchange_rate(env: &Env) -> (i128, i128) {
    (total_assets(env), total_shares(env))
}
