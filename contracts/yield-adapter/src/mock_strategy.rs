//! Test-only mock strategy contract.
//!
//! A real `#[contract]` implementing the "Strategy interface" documented in
//! `README.md` (`deposit`, `withdraw`, `balance`), plus test-only knobs for
//! driving the adapter through yield, loss, withdrawal slippage, and strategy
//! failure paths.
//!
//! # Modes
//!
//! - **Ledger-only** (default, no `init` call): `deposit`/`withdraw` only
//!   update an internal per-depositor balance; no tokens move. Enough for
//!   event and registry tests, but note that the adapter's `total_assets()`
//!   will then count forwarded funds twice (once as idle token balance, once
//!   as the strategy's reported balance).
//! - **Token-backed** (after `init(token)`): `deposit` pulls `amount` of
//!   `token` from the depositor into this contract, and `withdraw` sends it
//!   back, so the adapter's idle balance and the strategy's reported balance
//!   stay disjoint the way they would against a real strategy. The pull in
//!   `deposit` needs the adapter's auth in a nested (non-root) call, so tests
//!   using this mode must call `env.mock_all_auths_allowing_non_root_auth()`.
//!   Simulated yield must be backed by minting tokens to this contract if the
//!   test later withdraws it — see [`MockStrategy::simulate_yield`].
//!
//! Compiled only under `cfg(test)`: its entrypoint names collide with the
//! adapter's own (`deposit`, `withdraw`), so it must never reach a wasm build.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

/// Errors the mock raises. Surfaced to the adapter as a failed
/// `invoke_contract` / `try_invoke_contract`.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MockStrategyError {
    /// A failure injected via `set_fail_*`.
    InjectedFailure = 1,
    /// `withdraw` asked for more than the depositor's reported balance.
    InsufficientBalance = 2,
    /// Non-positive amount passed to `deposit` / `withdraw`.
    InvalidAmount = 3,
    /// Withdrawal haircut above 10_000 bps.
    InvalidBps = 4,
}

#[contracttype]
#[derive(Clone)]
enum MockKey {
    /// Optional SEP-41 token; present means token-backed mode.
    Token,
    /// Reported balance per depositor, including simulated yield/loss.
    Balance(Address),
    FailDeposit,
    FailWithdraw,
    FailBalance,
    /// Haircut applied to each `withdraw` payout, in bps.
    WithdrawFeeBps,
    DepositCalls,
    WithdrawCalls,
}

#[contract]
pub struct MockStrategy;

#[contractimpl]
impl MockStrategy {
    // --- setup ---------------------------------------------------------------

    /// Switch to token-backed mode for `token`. Optional.
    pub fn init(env: Env, token: Address) {
        env.storage().instance().set(&MockKey::Token, &token);
    }

    // --- strategy interface --------------------------------------------------

    /// Accept `amount` from `from`, crediting its reported balance.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        if flag(&env, &MockKey::FailDeposit) {
            panic_with_error!(&env, MockStrategyError::InjectedFailure);
        }
        if amount <= 0 {
            panic_with_error!(&env, MockStrategyError::InvalidAmount);
        }

        if let Some(token_address) = get_token(&env) {
            token::Client::new(&env, &token_address).transfer(
                &from,
                &env.current_contract_address(),
                &amount,
            );
        }

        let current = balance_of(&env, &from);
        set_balance(&env, &from, current + amount);
        bump_counter(&env, &MockKey::DepositCalls);
    }

    /// Debit `amount` from `to`'s reported balance and, in token-backed mode,
    /// pay it out less the configured withdrawal haircut.
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        if flag(&env, &MockKey::FailWithdraw) {
            panic_with_error!(&env, MockStrategyError::InjectedFailure);
        }
        if amount <= 0 {
            panic_with_error!(&env, MockStrategyError::InvalidAmount);
        }

        let current = balance_of(&env, &to);
        if amount > current {
            panic_with_error!(&env, MockStrategyError::InsufficientBalance);
        }
        set_balance(&env, &to, current - amount);

        if let Some(token_address) = get_token(&env) {
            let fee_bps: u32 = env
                .storage()
                .instance()
                .get(&MockKey::WithdrawFeeBps)
                .unwrap_or(0);
            let payout = amount - amount * fee_bps as i128 / 10_000;
            if payout > 0 {
                token::Client::new(&env, &token_address).transfer(
                    &env.current_contract_address(),
                    &to,
                    &payout,
                );
            }
        }
        bump_counter(&env, &MockKey::WithdrawCalls);
    }

    /// `of`'s current claim, including simulated yield/loss.
    pub fn balance(env: Env, of: Address) -> i128 {
        if flag(&env, &MockKey::FailBalance) {
            panic_with_error!(&env, MockStrategyError::InjectedFailure);
        }
        balance_of(&env, &of)
    }

    // --- test knobs ----------------------------------------------------------

    /// Overwrite `of`'s reported balance outright.
    pub fn set_reported_balance(env: Env, of: Address, amount: i128) {
        set_balance(&env, &of, amount);
    }

    /// Add a signed yield (`delta > 0`) or loss (`delta < 0`) to `of`'s
    /// reported balance, floored at zero. Only moves the reported figure; in
    /// token-backed mode, mint matching tokens to this contract if the test
    /// will withdraw the yield.
    pub fn simulate_yield(env: Env, of: Address, delta: i128) {
        let next = balance_of(&env, &of).saturating_add(delta).max(0);
        set_balance(&env, &of, next);
    }

    /// Apply a yield/loss in basis points of `of`'s current reported balance
    /// (e.g. `500` = +5%, `-1_000` = -10%), rounding toward zero.
    pub fn simulate_yield_bps(env: Env, of: Address, bps: i32) {
        let current = balance_of(&env, &of);
        let delta = current * bps as i128 / 10_000;
        set_balance(&env, &of, (current + delta).max(0));
    }

    /// Make `deposit` fail while `fail` is true.
    pub fn set_fail_deposit(env: Env, fail: bool) {
        env.storage().instance().set(&MockKey::FailDeposit, &fail);
    }

    /// Make `withdraw` fail while `fail` is true.
    pub fn set_fail_withdraw(env: Env, fail: bool) {
        env.storage().instance().set(&MockKey::FailWithdraw, &fail);
    }

    /// Make `balance` fail while `fail` is true.
    pub fn set_fail_balance(env: Env, fail: bool) {
        env.storage().instance().set(&MockKey::FailBalance, &fail);
    }

    /// Haircut every token-backed `withdraw` payout by `bps` (0-10_000),
    /// simulating strategy exit fees/slippage.
    pub fn set_withdraw_fee_bps(env: Env, bps: u32) {
        if bps > 10_000 {
            panic_with_error!(&env, MockStrategyError::InvalidBps);
        }
        env.storage().instance().set(&MockKey::WithdrawFeeBps, &bps);
    }

    /// Number of successful `deposit` calls.
    pub fn deposit_calls(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MockKey::DepositCalls)
            .unwrap_or(0)
    }

    /// Number of successful `withdraw` calls.
    pub fn withdraw_calls(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&MockKey::WithdrawCalls)
            .unwrap_or(0)
    }
}

fn get_token(env: &Env) -> Option<Address> {
    env.storage().instance().get(&MockKey::Token)
}

fn balance_of(env: &Env, of: &Address) -> i128 {
    env.storage()
        .instance()
        .get(&MockKey::Balance(of.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, of: &Address, amount: i128) {
    env.storage()
        .instance()
        .set(&MockKey::Balance(of.clone()), &amount);
}

fn flag(env: &Env, key: &MockKey) -> bool {
    env.storage().instance().get(key).unwrap_or(false)
}

fn bump_counter(env: &Env, key: &MockKey) {
    let n: u32 = env.storage().instance().get(key).unwrap_or(0);
    env.storage().instance().set(key, &(n + 1));
}
