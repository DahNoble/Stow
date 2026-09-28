#![no_std]
// Every module-internal helper (storage, fee validation, etc.) is currently
// unreferenced because the entrypoints that would call them are stubbed with
// `unimplemented!()`. Silence dead_code until those stubs are implemented —
// remove this once the crate is no longer a skeleton.
#![allow(dead_code)]
//! # Stow Yield Adapter
//!
//! Optional, opt-in yield routing for idle balances held by the
//! `savings-vault` contract (or any SEP-41-denominated depositor). Deposits
//! mint shares; a swappable external "strategy" contract is where deployed
//! funds actually earn yield; `harvest` periodically reports that strategy's
//! performance back into this contract's exchange rate.
//!
//! This crate is a **skeleton**: every entrypoint is stubbed with
//! `unimplemented!()` and a `TODO(issue)` describing the work. Each stub is
//! one contributor issue. See `README.md` for the module → issue map and the
//! full entrypoint / event reference.
//!
//! Modules:
//! - [`admin`] — init, admin/treasury rotation, fee config, pause, upgrade
//! - [`strategy`] — register / activate / migrate the external yield strategy
//! - [`deposit`] — mint shares for incoming funds
//! - [`withdraw`] — cooldown-queued withdrawals
//! - [`accounting`] — share ↔ asset conversion, exchange rate
//! - [`harvest`] — report strategy yield/loss, apply performance fee
//! - [`fees`] — sweep accrued performance fees to the treasury
//! - [`circuit_breaker`] — emergency pull of funds out of the strategy

mod accounting;
mod admin;
mod circuit_breaker;
mod deposit;
mod error;
mod events;
mod fees;
mod harvest;
mod storage;
mod strategy;
mod types;
mod withdraw;

#[cfg(test)]
mod mock_strategy;
#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

use crate::error::Error;
use crate::types::{Position, StrategyInfo, WithdrawRequest};

#[contract]
pub struct YieldAdapter;

#[contractimpl]
impl YieldAdapter {
    // --- lifecycle -----------------------------------------------------
    pub fn initialize(
        env: Env,
        admin: Address,
        treasury: Address,
        token: Address,
    ) -> Result<(), Error> {
        admin::initialize(&env, admin, treasury, token)
    }

    pub fn admin(env: Env) -> Result<Address, Error> {
        admin::admin(&env)
    }

    pub fn treasury(env: Env) -> Result<Address, Error> {
        admin::treasury(&env)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        admin::token(&env)
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        admin::set_admin(&env, new_admin)
    }

    pub fn set_treasury(env: Env, caller: Address, new_treasury: Address) -> Result<(), Error> {
        admin::set_treasury(&env, caller, new_treasury)
    }

    pub fn performance_fee_bps(env: Env) -> u32 {
        admin::performance_fee_bps(&env)
    }

    pub fn set_performance_fee_bps(env: Env, caller: Address, bps: u32) -> Result<(), Error> {
        admin::set_performance_fee_bps(&env, caller, bps)
    }

    pub fn harvest_interval(env: Env) -> u64 {
        admin::harvest_interval(&env)
    }

    pub fn set_harvest_interval(env: Env, caller: Address, seconds: u64) -> Result<(), Error> {
        admin::set_harvest_interval(&env, caller, seconds)
    }

    pub fn set_paused(env: Env, caller: Address, paused: bool) -> Result<(), Error> {
        admin::set_paused(&env, caller, paused)
    }

    pub fn is_paused(env: Env) -> bool {
        admin::is_paused(&env)
    }

    pub fn withdraw_cooldown(env: Env) -> u64 {
        admin::withdraw_cooldown(&env)
    }

    pub fn set_withdraw_cooldown(env: Env, caller: Address, seconds: u64) -> Result<(), Error> {
        admin::set_withdraw_cooldown(&env, caller, seconds)
    }

    pub fn upgrade(env: Env, caller: Address, new_wasm_hash: BytesN<32>) -> Result<(), Error> {
        admin::upgrade(&env, caller, new_wasm_hash)
    }

    // --- strategy --------------------------------------------------------
    pub fn register_strategy(
        env: Env,
        caller: Address,
        address: Address,
        name: String,
    ) -> Result<u64, Error> {
        strategy::register_strategy(&env, caller, address, name)
    }

    pub fn deregister_strategy(env: Env, caller: Address, strategy_id: u64) -> Result<(), Error> {
        strategy::deregister_strategy(&env, caller, strategy_id)
    }

    pub fn set_active_strategy(env: Env, caller: Address, strategy_id: u64) -> Result<(), Error> {
        strategy::set_active_strategy(&env, caller, strategy_id)
    }

    pub fn migrate_strategy(env: Env, caller: Address, new_strategy_id: u64) -> Result<(), Error> {
        strategy::migrate_strategy(&env, caller, new_strategy_id)
    }

    pub fn set_strategy_deposit_cap(
        env: Env,
        caller: Address,
        strategy_id: u64,
        cap: i128,
    ) -> Result<(), Error> {
        strategy::set_strategy_deposit_cap(&env, caller, strategy_id, cap)
    }

    pub fn get_strategy(env: Env, strategy_id: u64) -> Result<StrategyInfo, Error> {
        strategy::get_strategy(&env, strategy_id)
    }

    pub fn list_strategies(env: Env) -> Vec<StrategyInfo> {
        strategy::list_strategies(&env)
    }

    // --- deposit -----------------------------------------------------------
    pub fn deposit(env: Env, from: Address, amount: i128) -> Result<i128, Error> {
        deposit::deposit(&env, from, amount)
    }

    pub fn get_position(env: Env, owner: Address) -> Result<Position, Error> {
        deposit::get_position(&env, owner)
    }

    // --- withdraw ------------------------------------------------------------
    pub fn request_withdraw(env: Env, owner: Address, shares: i128) -> Result<u64, Error> {
        withdraw::request_withdraw(&env, owner, shares)
    }

    pub fn claim_withdraw(env: Env, owner: Address, request_id: u64) -> Result<i128, Error> {
        withdraw::claim_withdraw(&env, owner, request_id)
    }

    pub fn cancel_withdraw(env: Env, owner: Address, request_id: u64) -> Result<(), Error> {
        withdraw::cancel_withdraw(&env, owner, request_id)
    }

    pub fn get_withdraw_request(env: Env, request_id: u64) -> Result<WithdrawRequest, Error> {
        withdraw::get_withdraw_request(&env, request_id)
    }

    // --- accounting ----------------------------------------------------------
    pub fn total_assets(env: Env) -> i128 {
        accounting::total_assets(&env)
    }

    pub fn total_shares(env: Env) -> i128 {
        accounting::total_shares(&env)
    }

    pub fn exchange_rate(env: Env) -> (i128, i128) {
        accounting::exchange_rate(&env)
    }

    // --- harvest -------------------------------------------------------------
    pub fn harvest(env: Env, caller: Address) -> Result<i128, Error> {
        harvest::harvest(&env, caller)
    }

    // --- fees ------------------------------------------------------------------
    pub fn fees_accrued(env: Env) -> i128 {
        fees::fees_accrued(&env)
    }

    pub fn withdraw_fees(env: Env, caller: Address) -> Result<i128, Error> {
        fees::withdraw_fees(&env, caller)
    }

    // --- circuit breaker -------------------------------------------------------
    pub fn emergency_withdraw_all(env: Env, caller: Address) -> Result<i128, Error> {
        circuit_breaker::emergency_withdraw_all(&env, caller)
    }
}
