//! Withdrawals — queued behind a cooldown so the adapter has time to unwind
//! funds from an illiquid strategy before paying out.

use soroban_sdk::{Address, Env};

use crate::accounting;
use crate::error::Error;
use crate::events::TOPIC_WITHDRAW_CANCELLED;
use crate::storage;
use crate::types::{DataKey, Position, WithdrawRequest};

/// Burn `shares` from `owner`'s position and queue a withdrawal, claimable
/// after `admin::withdraw_cooldown()` seconds.
///
/// - `owner.require_auth()`.
/// - Errors `Error::Paused` while paused.
/// - Errors `Error::InvalidAmount` if `shares <= 0`.
/// - Errors `Error::InsufficientBalance` if `shares > owner`'s position.
/// - Shares are burned immediately (so they stop earning/losing with the
///   exchange rate); the underlying asset amount is fixed at request time
///   using `accounting::convert_to_assets(shares)` and stored on the
///   `WithdrawRequest` — a later `harvest` does not change what this
///   request pays out.
/// - Emits a `withdraw_requested` event.
///
/// TODO(issue): implement.
pub fn request_withdraw(_env: &Env, _owner: Address, _shares: i128) -> Result<u64, Error> {
    unimplemented!("withdraw: request_withdraw")
}

/// Pay out a previously-requested withdrawal.
///
/// - `owner.require_auth()`; errors `Error::Unauthorized` if `owner` is not
///   the request's owner.
/// - Errors `Error::CooldownNotElapsed` if `env.ledger().timestamp() <
///   claimable_at`.
/// - Errors `Error::WithdrawAlreadyResolved` if already claimed or
///   cancelled.
/// - Available even while paused (see `admin::set_paused` doc) — a pause
///   must never trap funds already committed to a withdrawal.
/// - Pulls funds from the active strategy if the adapter's idle balance is
///   insufficient, then transfers out.
/// - Emits a `withdraw_claimed` event.
///
/// TODO(issue): implement.
pub fn claim_withdraw(_env: &Env, _owner: Address, _request_id: u64) -> Result<i128, Error> {
    unimplemented!("withdraw: claim_withdraw")
}

/// Cancel a pending withdrawal request and re-mint the shares back to
/// `owner` at the **current** exchange rate (not the rate at request time —
/// the shares were already burned, so re-minting uses `convert_to_shares`
/// on the request's fixed asset amount).
///
/// - `owner.require_auth()`; errors `Error::Unauthorized` if `owner` is not
///   the request's owner.
/// - Errors `Error::WithdrawAlreadyResolved` if already claimed or
///   cancelled.
/// - Emits a `withdraw_cancelled` event.
pub fn cancel_withdraw(env: &Env, owner: Address, request_id: u64) -> Result<(), Error> {
    owner.require_auth();

    let request_key = DataKey::WithdrawRequest(request_id);
    let mut request: WithdrawRequest = env
        .storage()
        .persistent()
        .get(&request_key)
        .ok_or(Error::NotFound)?;
    storage::extend_persistent_ttl(env, &request_key);

    if owner != request.owner {
        return Err(Error::Unauthorized);
    }

    if request.claimed_at.is_some() || request.cancelled_at.is_some() {
        return Err(Error::WithdrawAlreadyResolved);
    }

    // The shares behind this request were burned at request time; re-mint
    // at the *current* exchange rate against the asset amount fixed back
    // then (not the share count that was burned then) — see this
    // function's doc comment.
    let shares = accounting::convert_to_shares(env, request.shares)?;

    let position_key = DataKey::Position(owner.clone());
    let mut position: Position = env
        .storage()
        .persistent()
        .get(&position_key)
        .ok_or(Error::NotFound)?;
    position.shares = position.shares.checked_add(shares).ok_or(Error::Overflow)?;
    position.updated_at = env.ledger().timestamp();

    let total_shares = accounting::total_shares(env);
    let new_total_shares = total_shares.checked_add(shares).ok_or(Error::Overflow)?;

    request.cancelled_at = Some(env.ledger().timestamp());

    storage::extend_instance_ttl(env);
    env.storage().persistent().set(&position_key, &position);
    storage::extend_persistent_ttl(env, &position_key);
    env.storage()
        .instance()
        .set(&DataKey::TotalShares, &new_total_shares);
    env.storage().persistent().set(&request_key, &request);
    storage::extend_persistent_ttl(env, &request_key);

    env.events().publish(
        (TOPIC_WITHDRAW_CANCELLED,),
        (request_id, owner, shares, env.ledger().timestamp()),
    );

    Ok(())
}

/// Read a withdrawal request by id, or `Error::NotFound`.
///
/// TODO(issue): implement.
pub fn get_withdraw_request(_env: &Env, _request_id: u64) -> Result<WithdrawRequest, Error> {
    unimplemented!("withdraw: get_withdraw_request")
}
