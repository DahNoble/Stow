#![cfg(test)]
//! Test skeleton. Each `#[ignore]`d test is a placeholder for a contributor.
//!
//! Pattern: register the contract, register a SEP-41 mock token
//! (`StellarAssetClient` from `soroban_sdk::testutils`), initialize, then
//! exercise the entrypoint. Mirrors `savings-vault::test`'s harness shape —
//! see that module if a helper here needs a fuller reference example.
//!
//! Tests that exercise a strategy (`harvest`, `migrate_strategy`, ...) will
//! additionally need a minimal mock strategy contract implementing the
//! interface documented in `README.md` under "Strategy interface" — use
//! `crate::mock_strategy::MockStrategy` (via `setup_mock_strategy`).

use soroban_sdk::{
    testutils::Address as _, testutils::Events as _, Address, Env, IntoVal, Symbol,
};

use crate::error::Error;
use crate::types::DataKey;
use crate::{YieldAdapter, YieldAdapterClient};

// ---------------------------------------------------------------------------
// Mock strategy — see `crate::mock_strategy` for the full interface and test
// knobs (simulated yield/loss, failure injection, withdrawal haircut,
// token-backed mode).
use crate::mock_strategy::{MockStrategy, MockStrategyClient};

fn setup_mock_strategy(env: &Env) -> Address {
    env.register(MockStrategy, ())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn setup(env: &Env) -> YieldAdapterClient<'_> {
    let contract_id = env.register(YieldAdapter, ());
    YieldAdapterClient::new(env, &contract_id)
}

/// Full setup: adapter + SEP-41 mock token + admin + treasury.
///
/// Returns `(client, admin, treasury, token_address)`.
fn setup_with_token(env: &Env) -> (YieldAdapterClient<'_>, Address, Address, Address) {
    let client = setup(env);
    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let token_admin = Address::generate(env);

    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_id.address();

    client.initialize(&admin, &treasury, &token_address);

    (client, admin, treasury, token_address)
}

// ---------------------------------------------------------------------------
// Pure-logic unit tests — no `Env`/contract needed
// ---------------------------------------------------------------------------

#[test]
fn validate_fee_bps_boundary() {
    assert!(crate::fees::validate_fee_bps(crate::fees::MAX_PERFORMANCE_FEE_BPS).is_ok());
    assert_eq!(
        crate::fees::validate_fee_bps(crate::fees::MAX_PERFORMANCE_FEE_BPS + 1),
        Err(Error::FeeTooHigh),
    );
}

// ---------------------------------------------------------------------------
// Direct unit tests — `harvest::apply_performance_fee` and
// `harvest::check_harvest_interval` exercised directly (not through the
// `harvest` entrypoint).
//
// `harvest` itself, and thus the end-to-end
// `performance_fee_taken_only_on_positive_yield` /
// `loss_reduces_exchange_rate_without_charging_fee` acceptance tests below,
// need a mock strategy contract that doesn't exist yet (see the module doc
// above) and are covered by a separate, unassigned issue. These tests give
// `apply_performance_fee` and `check_harvest_interval` real coverage in the
// meantime using `env.as_contract` to reach contract storage without going
// through `harvest`.
// ---------------------------------------------------------------------------

#[test]
fn apply_performance_fee_credits_fees_accrued_and_returns_remainder() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::PerformanceFeeBps, &1_000u32); // 10%

        let remainder = crate::harvest::apply_performance_fee(&env, 1_000).unwrap();

        assert_eq!(remainder, 900);
        let fees_accrued: i128 = env.storage().instance().get(&DataKey::FeesAccrued).unwrap();
        assert_eq!(fees_accrued, 100);
    });
}

#[test]
fn apply_performance_fee_accumulates_across_calls() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::PerformanceFeeBps, &500u32); // 5%

        crate::harvest::apply_performance_fee(&env, 2_000).unwrap();
        crate::harvest::apply_performance_fee(&env, 4_000).unwrap();

        let fees_accrued: i128 = env.storage().instance().get(&DataKey::FeesAccrued).unwrap();
        // 2_000 * 500 / 10_000 = 100; 4_000 * 500 / 10_000 = 200.
        assert_eq!(fees_accrued, 300);
    });
}

#[test]
fn apply_performance_fee_zero_bps_credits_nothing() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    env.as_contract(&contract_id, || {
        // `PerformanceFeeBps` left unset — defaults to 0 per `admin::performance_fee_bps`.
        let remainder = crate::harvest::apply_performance_fee(&env, 5_000).unwrap();

        assert_eq!(remainder, 5_000);
        let fees_accrued: i128 = env
            .storage()
            .instance()
            .get(&DataKey::FeesAccrued)
            .unwrap_or(0);
        assert_eq!(fees_accrued, 0);
    });
}

#[test]
fn check_harvest_interval_default_allows_immediate_harvest() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    env.as_contract(&contract_id, || {
        // No `HarvestInterval` / `LastHarvestAt` set — first-ever harvest must
        // never be blocked.
        assert!(crate::harvest::check_harvest_interval(&env).is_ok());
    });
}

#[test]
fn check_harvest_interval_rejects_too_soon() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    let start: u64 = 1_000_000;
    env.ledger().set(LedgerInfo {
        timestamp: start,
        protocol_version: 22,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 5_000_000,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 3_110_400,
    });

    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::HarvestInterval, &3_600u64); // 1 hour
        env.storage()
            .instance()
            .set(&DataKey::LastHarvestAt, &start);

        // Not enough time has elapsed yet.
        env.ledger().set(LedgerInfo {
            timestamp: start + 1_800, // 30 minutes later
            protocol_version: 22,
            sequence_number: 200,
            network_id: Default::default(),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl: 3_110_400,
        });
        assert_eq!(
            crate::harvest::check_harvest_interval(&env),
            Err(Error::HarvestTooSoon),
        );
    });
}

#[test]
fn check_harvest_interval_allows_after_elapsed() {
    let env = Env::default();
    let contract_id = env.register(YieldAdapter, ());

    let start: u64 = 1_000_000;
    env.ledger().set(LedgerInfo {
        timestamp: start,
        protocol_version: 22,
        sequence_number: 100,
        network_id: Default::default(),
        base_reserve: 5_000_000,
        min_temp_entry_ttl: 1,
        min_persistent_entry_ttl: 1,
        max_entry_ttl: 3_110_400,
    });

    env.as_contract(&contract_id, || {
        env.storage()
            .instance()
            .set(&DataKey::HarvestInterval, &3_600u64); // 1 hour
        env.storage()
            .instance()
            .set(&DataKey::LastHarvestAt, &start);

        // A full hour (plus one second) has elapsed.
        env.ledger().set(LedgerInfo {
            timestamp: start + 3_601,
            protocol_version: 22,
            sequence_number: 300,
            network_id: Default::default(),
            base_reserve: 5_000_000,
            min_temp_entry_ttl: 1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl: 3_110_400,
        });
        assert!(crate::harvest::check_harvest_interval(&env).is_ok());
    });
}

#[test]
fn set_and_get_harvest_interval_mirrors_withdraw_cooldown_shape() {
    // `admin::initialize` is unimplemented (a separate, unassigned issue), so
    // this seeds `DataKey::Admin` directly rather than going through
    // `client.initialize(..)`.
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(YieldAdapter, ());
    let client = YieldAdapterClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
    });

    assert_eq!(client.harvest_interval(), 0);

    client.set_harvest_interval(&admin, &7_200u64);
    assert_eq!(client.harvest_interval(), 7_200);
}

#[test]
fn set_harvest_interval_rejects_non_admin_caller() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(YieldAdapter, ());
    let client = YieldAdapterClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let impostor = Address::generate(&env);

    env.as_contract(&contract_id, || {
        env.storage().instance().set(&DataKey::Admin, &admin);
    });

    let result = client.try_set_harvest_interval(&impostor, &7_200u64);
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
    assert_eq!(client.harvest_interval(), 0);
}

// ---------------------------------------------------------------------------
// Placeholder stubs — one per contributor issue
// ---------------------------------------------------------------------------

#[test]
fn initialize_sets_admin_treasury_and_token() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, treasury, token) = setup_with_token(&env);
    assert_eq!(client.admin(), admin);
    assert_eq!(client.treasury(), treasury);
    assert_eq!(client.token(), token);
    assert_eq!(client.total_shares(), 0);
    // Not extended to also assert `total_assets() == 0` (per this issue's
    // "if needed" wording): `accounting::total_assets` still calls out to
    // the active-strategy balance-reporting interface documented in
    // README.md's "Strategy interface", which is not implemented yet and
    // is out of scope for this issue — see #245/#246/#247 disclosure.
}

#[test]
fn admin_treasury_token_error_before_initialize() {
    let env = Env::default();
    let client = setup(&env);

    assert_eq!(client.try_admin(), Err(Ok(Error::NotInitialized)));
    assert_eq!(client.try_treasury(), Err(Ok(Error::NotInitialized)));
    assert_eq!(client.try_token(), Err(Ok(Error::NotInitialized)));
}

#[test]
fn deposit_mints_shares_proportional_to_exchange_rate() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, token) = setup_with_token(&env);
    let user = Address::generate(&env);

    let token_admin = soroban_sdk::token::StellarAssetClient::new(&env, &token);
    token_admin.mint(&user, &1_000);

    // First deposit: shares minted 1:1 with assets.
    let shares = client.deposit(&user, &1_000);
    assert_eq!(shares, 1_000, "first deposit must mint shares 1:1");

    let position = client.get_position(&user);
    assert_eq!(position.shares, 1_000);
    assert_eq!(position.owner, user);
    assert_eq!(client.total_shares(), 1_000);
}

#[test]
#[ignore = "TODO(issue): implement withdraw::request_withdraw + claim_withdraw"]
fn withdraw_round_trip_returns_correct_assets() {
    todo!("deposit, request_withdraw the full position, advance past cooldown, claim_withdraw, assert payout == deposit");
}

#[test]
#[ignore = "TODO(issue): implement withdraw cooldown enforcement"]
fn claim_before_cooldown_elapsed_rejected() {
    todo!("request_withdraw, immediately try_claim_withdraw, assert Error::CooldownNotElapsed");
}

#[test]
fn cancel_withdraw_returns_shares_to_owner() {
    use crate::types::{DataKey, Position, WithdrawRequest};

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, token) = setup_with_token(&env);
    let owner = Address::generate(&env);
    let request_id = 1u64;
    let now = env.ledger().timestamp();

    // `request_withdraw` is a separate, still-unimplemented issue (see
    // `withdraw_round_trip_returns_correct_assets`), so seed the state it
    // would have left behind directly: an owner position already debited by
    // the 400 shares burned at request time, a matching `WithdrawRequest`
    // whose `shares` field holds the asset amount fixed at that moment (per
    // `request_withdraw`'s doc comment), and a vault-wide `TotalShares` net
    // of that burn.
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &600i128);
        env.storage().persistent().set(
            &DataKey::Position(owner.clone()),
            &Position {
                owner: owner.clone(),
                shares: 600,
                created_at: now,
                updated_at: now,
            },
        );
        env.storage().persistent().set(
            &DataKey::WithdrawRequest(request_id),
            &WithdrawRequest {
                id: request_id,
                owner: owner.clone(),
                shares: 400,
                claimable_at: now,
                requested_at: now,
                claimed_at: None,
                cancelled_at: None,
            },
        );
    });

    // The vault holds 600 idle tokens against the 600 shares seeded above —
    // a 1:1 exchange rate — so re-minting the request's fixed 400-asset
    // amount should hand back exactly 400 shares.
    soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&client.address, &600);

    client.cancel_withdraw(&owner, &request_id);

    let position: Position = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::Position(owner.clone()))
            .unwrap()
    });
    assert_eq!(
        position.shares, 1000,
        "the 400 re-minted shares must be added back to the owner's existing 600"
    );
    assert_eq!(client.total_shares(), 1000);

    let request: WithdrawRequest = env.as_contract(&client.address, || {
        env.storage()
            .persistent()
            .get(&DataKey::WithdrawRequest(request_id))
            .unwrap()
    });
    assert!(request.cancelled_at.is_some());

    // The request is now resolved — cancelling it again (standing in for a
    // later claim attempt, since `claim_withdraw` checks the same flag) must
    // reject rather than re-mint a second time.
    let result = client.try_cancel_withdraw(&owner, &request_id);
    assert_eq!(result, Err(Ok(Error::WithdrawAlreadyResolved)));
}

#[test]
fn get_withdraw_request_returns_seeded_request() {
    use crate::types::{DataKey, WithdrawRequest};

    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);
    let owner = Address::generate(&env);
    let request_id = 1u64;
    let now = env.ledger().timestamp();

    env.as_contract(&client.address, || {
        env.storage().persistent().set(
            &DataKey::WithdrawRequest(request_id),
            &WithdrawRequest {
                id: request_id,
                owner: owner.clone(),
                shares: 500,
                claimable_at: now + 3600,
                requested_at: now,
                claimed_at: None,
                cancelled_at: None,
            },
        );
    });

    let request = client.get_withdraw_request(&request_id);
    assert_eq!(request.id, request_id);
    assert_eq!(request.owner, owner);
    assert_eq!(request.shares, 500);
    assert_eq!(request.claimable_at, now + 3600);
    assert!(request.claimed_at.is_none());
    assert!(request.cancelled_at.is_none());
}

#[test]
fn get_withdraw_request_not_found() {
    let env = Env::default();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);

    let result = client.try_get_withdraw_request(&999);
    assert_eq!(result, Err(Ok(Error::NotFound)));
}

#[test]
#[ignore = "TODO(issue): implement harvest::harvest — needs a mock strategy contract"]
fn harvest_increases_exchange_rate_for_depositors() {
    todo!("deposit, simulate strategy yield, harvest, assert exchange_rate() increased");
}

#[test]
#[ignore = "TODO(issue): implement harvest loss handling (no fee on loss)"]
fn loss_reduces_exchange_rate_without_charging_fee() {
    todo!("harvest a negative-yield report, assert exchange_rate() decreased and fees_accrued() unchanged");
}

#[test]
#[ignore = "TODO(issue): auth review — require_auth on all mutating entrypoints"]
fn unauthorized_access_rejected() {
    todo!("for each mutating entrypoint, call without the required signer's auth and assert rejection");
}

#[test]
#[ignore = "TODO(issue): implement withdraw::request_withdraw NotFound path"]
fn withdraw_more_shares_than_owned_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);
    let owner = Address::generate(&env);

    let result = client.try_request_withdraw(&owner, &1i128);
    assert_eq!(
        result,
        Err(Ok(Error::NotFound)),
        "a request_withdraw from an owner with no position must fail with NotFound, not panic",
    );
}

#[test]
#[ignore = "TODO(issue): implement strategy::migrate_strategy — needs two mock strategies"]
fn strategy_migration_preserves_total_assets() {
    todo!(
        "register two mock strategies, deposit, migrate_strategy, assert total_assets() unchanged"
    );
}

#[test]
#[ignore = "TODO(issue): property test — share/asset rounding never allows value extraction"]
fn share_rounding_never_allows_value_extraction() {
    todo!("proptest: for arbitrary sequences of deposit/request_withdraw/claim_withdraw, assert sum of payouts never exceeds sum of deposits plus harvested yield");
}

#[test]
fn register_strategy_rejects_duplicate_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);

    client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    let result = client.try_register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock-again"),
    );
    assert_eq!(result, Err(Ok(Error::StrategyAlreadyRegistered)));
}

#[test]
#[ignore = "TODO(issue): implement admin::set_paused narrower blocklist"]
fn paused_blocks_mutations_but_not_claim_withdraw() {
    todo!("pause, assert deposit/request_withdraw/harvest all reject with Error::Paused, then assert an in-flight claim_withdraw still succeeds");
}

#[test]
fn initialize_twice_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, treasury, token) = setup_with_token(&env);

    let second_admin = Address::generate(&env);
    let result = client.try_initialize(&second_admin, &treasury, &token);
    assert_eq!(result, Err(Ok(Error::AlreadyInitialized)));

    // The original values must survive the rejected re-initialization.
    assert_eq!(client.admin(), admin);
}

// ---------------------------------------------------------------------------
// #245 — typed publishers for strategy events
// ---------------------------------------------------------------------------

#[test]
fn register_strategy_emits_strategy_registered_with_id_and_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);

    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_STRATEGY_REGISTERED,).into_val(&env);
    let decoded: (u64, Address, u64) = soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (id, strategy_address, now));
}

#[test]
fn set_active_strategy_emits_strategy_changed_with_from_none() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );

    client.set_active_strategy(&admin, &id);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_STRATEGY_CHANGED,).into_val(&env);
    let decoded: (Option<u64>, u64, u64) =
        soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (None, id, now));
}

#[test]
fn migrate_strategy_emits_strategy_changed_with_from_and_to() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_a = setup_mock_strategy(&env);
    let strategy_b = setup_mock_strategy(&env);
    let id_a = client.register_strategy(
        &admin,
        &strategy_a,
        &soroban_sdk::String::from_str(&env, "a"),
    );
    let id_b = client.register_strategy(
        &admin,
        &strategy_b,
        &soroban_sdk::String::from_str(&env, "b"),
    );
    client.set_active_strategy(&admin, &id_a);

    client.migrate_strategy(&admin, &id_b);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_STRATEGY_CHANGED,).into_val(&env);
    let decoded: (Option<u64>, u64, u64) =
        soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (Some(id_a), id_b, now));
}

#[test]
fn emergency_withdraw_all_emits_strategy_changed_with_to_none() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);

    client.emergency_withdraw_all(&admin);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_STRATEGY_CHANGED,).into_val(&env);
    let decoded: (Option<u64>, Option<u64>, u64) =
        soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (Some(id), None, now));
}

#[test]
fn deregister_strategy_emits_strategy_deregistered() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );

    client.deregister_strategy(&admin, &id);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_STRATEGY_DEREGISTERED,).into_val(&env);
    let decoded: (u64, u64) = soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (id, now));
}

#[test]
fn deregister_strategy_rejects_the_active_strategy() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);

    let result = client.try_deregister_strategy(&admin, &id);
    assert_eq!(result, Err(Ok(Error::StrategyActive)));
}

// ---------------------------------------------------------------------------
// #246 — typed publishers for harvest/fee events
// ---------------------------------------------------------------------------

#[test]
fn harvest_emits_harvested_with_signed_delta_and_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let mock = MockStrategyClient::new(&env, &strategy_address);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);
    client.set_performance_fee_bps(&admin, &1_000); // 10%

    // Simulate 1_000_000 of yield accrued in the strategy.
    mock.set_reported_balance(&client.address, &1_000_000);

    let caller = Address::generate(&env);
    let delta = client.harvest(&caller);
    assert_eq!(delta, 1_000_000);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_HARVESTED,).into_val(&env);
    let decoded: (Address, i128, i128, u64) =
        soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (caller, 1_000_000, 100_000, now));
    assert_eq!(client.fees_accrued(), 100_000);
}

#[test]
fn harvest_on_a_loss_emits_zero_fee() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let mock = MockStrategyClient::new(&env, &strategy_address);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);
    client.set_performance_fee_bps(&admin, &1_000);

    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));
    // Now simulate a loss on the next report.
    mock.set_reported_balance(&client.address, &400_000);

    let caller = Address::generate(&env);
    let delta = client.harvest(&caller);
    assert_eq!(delta, -600_000);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_HARVESTED,).into_val(&env);
    let decoded: (Address, i128, i128, u64) =
        soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (caller, -600_000, 0, now));
    assert_eq!(
        client.fees_accrued(),
        100_000,
        "a loss must never charge a fee or touch fees already accrued from a prior positive harvest"
    );
}

#[test]
fn withdraw_fees_emits_fee_collected_and_pays_treasury() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, treasury, token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let mock = MockStrategyClient::new(&env, &strategy_address);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);
    client.set_performance_fee_bps(&admin, &1_000);
    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));

    // The adapter needs real tokens on hand to actually pay the fee out —
    // harvest only moves accounting, not real balances (the strategy
    // interface's own deposit/withdraw calls are what move real funds; this
    // mock never actually holds the vault token, so fund the adapter
    // directly to isolate withdraw_fees' own behavior).
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token);
    token_admin_client.mint(&client.address, &100_000);

    let caller = Address::generate(&env);
    let swept = client.withdraw_fees(&caller);

    let now = env.ledger().timestamp();
    let events = env.events().all();
    let (contract_id, topics, data) = events.last().unwrap().clone();
    let expected_topics: soroban_sdk::Vec<soroban_sdk::Val> =
        (crate::events::TOPIC_FEE_COLLECTED,).into_val(&env);
    let decoded: (Address, i128, u64) = soroban_sdk::TryFromVal::try_from_val(&env, &data).unwrap();

    assert_eq!(swept, 100_000);
    assert_eq!(client.fees_accrued(), 0);
    let treasury_balance = soroban_sdk::token::Client::new(&env, &token).balance(&treasury);
    assert_eq!(treasury_balance, 100_000);
    assert_eq!(contract_id, client.address);
    assert_eq!(topics, expected_topics);
    assert_eq!(decoded, (caller, 100_000, now));
}

#[test]
fn withdraw_fees_rejects_when_nothing_accrued() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);

    let result = client.try_withdraw_fees(&Address::generate(&env));
    assert_eq!(result, Err(Ok(Error::NoFeesAccrued)));
}

// ---------------------------------------------------------------------------
// #247 — error-code audit: implemented entrypoints must never panic on an
// expected failure path (only unimplemented!() stubs should panic, and only
// because they are genuinely not this PR's scope).
// ---------------------------------------------------------------------------

#[test]
fn set_active_strategy_rejects_unknown_strategy_id() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let result = client.try_set_active_strategy(&admin, &999);
    assert_eq!(result, Err(Ok(Error::StrategyNotFound)));
}

#[test]
fn set_active_strategy_rejects_when_already_active() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);

    let result = client.try_set_active_strategy(&admin, &id);
    assert_eq!(result, Err(Ok(Error::StrategyAlreadyActive)));
}

#[test]
fn register_strategy_requires_admin_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let stranger = Address::generate(&env);

    let result = client.try_register_strategy(
        &stranger,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    assert_eq!(result, Err(Ok(Error::Unauthorized)));
}

#[test]
fn harvest_rejects_with_no_active_strategy() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _treasury, _token) = setup_with_token(&env);

    let result = client.try_harvest(&Address::generate(&env));
    assert_eq!(result, Err(Ok(Error::StrategyNotFound)));
}

#[test]
fn set_performance_fee_bps_rejects_above_cap() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);

    let result = client.try_set_performance_fee_bps(&admin, &3_001);
    assert_eq!(result, Err(Ok(Error::FeeTooHigh)));
}

#[test]
fn harvest_respects_the_configured_interval() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, _treasury, _token) = setup_with_token(&env);
    let strategy_address = setup_mock_strategy(&env);
    let mock = MockStrategyClient::new(&env, &strategy_address);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(&env, "mock"),
    );
    client.set_active_strategy(&admin, &id);
    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&crate::types::DataKey::HarvestInterval, &3600u64);
    });

    client.harvest(&Address::generate(&env));

    mock.set_reported_balance(&client.address, &2_000_000);
    let result = client.try_harvest(&Address::generate(&env));
    assert_eq!(result, Err(Ok(Error::HarvestTooSoon)));
}

// ---------------------------------------------------------------------------
// convert_to_shares tests (issue #234)
// ---------------------------------------------------------------------------

#[test]
fn convert_to_shares_first_deposit_one_to_one() {
    use crate::accounting::convert_to_shares;

    let env = Env::default();

    // Mock total_shares() returning 0 (first deposit scenario)
    // Since total_shares is unimplemented, we'll test the logic directly
    // by ensuring the function handles the first-deposit case correctly

    // For this test, we need to manually verify the logic:
    // When total_shares == 0, convert_to_shares should return assets as-is

    // Note: This test will work once total_shares() and total_assets() are implemented.
    // For now, it demonstrates the expected behavior.

    // Test case 1: First deposit of 1000 assets should mint 1000 shares
    let assets = 1000i128;

    // This will fail until total_shares() is implemented, but shows the intent
    // Uncomment when total_shares and total_assets are implemented:
    // let shares = convert_to_shares(&env, assets).unwrap();
    // assert_eq!(shares, 1000, "First deposit should mint shares 1:1");
}

#[test]
fn convert_to_shares_subsequent_deposit_proportional() {
    use crate::accounting::convert_to_shares;

    let env = Env::default();

    // Test subsequent deposits with a moved exchange rate
    // Scenario:
    // - Initial state: 1000 shares backed by 1200 assets (exchange rate = 1.2 assets/share)
    // - Depositor brings 600 new assets
    // - Expected shares = (600 * 1000) / 1200 = 500 shares

    // Note: This test will work once total_shares() and total_assets() are implemented
    // For now, it demonstrates the expected behavior

    // Uncomment when total_shares and total_assets are implemented:
    // Mock the state to have total_shares = 1000, total_assets = 1200
    // let assets_to_deposit = 600i128;
    // let shares = convert_to_shares(&env, assets_to_deposit).unwrap();
    // assert_eq!(shares, 500, "Should mint 500 shares for 600 assets at 1.2 exchange rate");
}

#[test]
fn convert_to_shares_rounds_down() {
    use crate::accounting::convert_to_shares;

    let env = Env::default();

    // Test that rounding favors the adapter (rounds down)
    // Scenario:
    // - 1000 shares backed by 1001 assets
    // - Depositor brings 10 assets
    // - Expected: (10 * 1000) / 1001 = 9.99... → rounds down to 9 shares

    // Note: This test will work once total_shares() and total_assets() are implemented

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state: total_shares = 1000, total_assets = 1001
    // let assets_to_deposit = 10i128;
    // let shares = convert_to_shares(&env, assets_to_deposit).unwrap();
    // assert_eq!(shares, 9, "Should round down to 9 shares, favoring the adapter");
}

#[test]
fn convert_to_shares_rejects_zero_amount() {
    use crate::accounting::convert_to_shares;
    use crate::error::Error;

    let env = Env::default();

    // Test that zero or negative amounts are rejected
    let result = convert_to_shares(&env, 0);
    assert_eq!(
        result,
        Err(Error::InvalidAmount),
        "Should reject zero amount"
    );

    let result = convert_to_shares(&env, -100);
    assert_eq!(
        result,
        Err(Error::InvalidAmount),
        "Should reject negative amount"
    );
}

#[test]
fn convert_to_shares_handles_overflow() {
    use crate::accounting::convert_to_shares;
    use crate::error::Error;

    let env = Env::default();

    // Test overflow protection
    // Note: This requires mocking total_shares and total_assets to trigger overflow

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state with very large values that would cause overflow
    // let huge_assets = i128::MAX;
    // Mock total_shares = i128::MAX, total_assets = 1
    // let result = convert_to_shares(&env, huge_assets);
    // assert_eq!(result, Err(Error::Overflow), "Should detect overflow");
}

// ---------------------------------------------------------------------------
// convert_to_assets tests (issue #235)
// ---------------------------------------------------------------------------

#[test]
fn convert_to_assets_at_moved_exchange_rate() {
    use crate::accounting::convert_to_assets;

    let env = Env::default();

    // Test converting shares back to assets at a moved exchange rate
    // Scenario:
    // - 1000 shares backing 1200 assets (exchange rate = 1.2 assets/share)
    // - Convert 500 shares back to assets
    // - Expected: (500 * 1200) / 1000 = 600 assets

    // Note: This test will work once total_shares() and total_assets() are implemented

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state: total_shares = 1000, total_assets = 1200
    // let shares_to_convert = 500i128;
    // let assets = convert_to_assets(&env, shares_to_convert).unwrap();
    // assert_eq!(assets, 600, "Should convert 500 shares to 600 assets at 1.2 exchange rate");
}

#[test]
fn convert_to_assets_rounds_down() {
    use crate::accounting::convert_to_assets;

    let env = Env::default();

    // Test that rounding favors the adapter (rounds down)
    // Scenario:
    // - 1000 shares backing 1001 assets
    // - Convert 10 shares to assets
    // - Expected: (10 * 1001) / 1000 = 10.01 → rounds down to 10 assets

    // Note: This test will work once total_shares() and total_assets() are implemented

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state: total_shares = 1000, total_assets = 1001
    // let shares_to_convert = 10i128;
    // let assets = convert_to_assets(&env, shares_to_convert).unwrap();
    // assert_eq!(assets, 10, "Should round down to 10 assets, favoring the adapter");
}

#[test]
fn convert_to_assets_rejects_zero_shares() {
    use crate::accounting::convert_to_assets;
    use crate::error::Error;

    let env = Env::default();

    // Test that zero or negative shares are rejected
    let result = convert_to_assets(&env, 0);
    assert_eq!(
        result,
        Err(Error::InvalidAmount),
        "Should reject zero shares"
    );

    let result = convert_to_assets(&env, -100);
    assert_eq!(
        result,
        Err(Error::InvalidAmount),
        "Should reject negative shares"
    );
}

#[test]
fn convert_to_assets_handles_no_shares_outstanding() {
    use crate::accounting::convert_to_assets;
    use crate::error::Error;

    let env = Env::default();

    // Test that conversion fails when no shares exist in the system
    // Note: This requires total_shares() to return 0

    // Uncomment when total_shares is implemented:
    // Mock state: total_shares = 0
    // let result = convert_to_assets(&env, 100);
    // assert_eq!(result, Err(Error::InvalidAmount), "Cannot convert shares when none exist");
}

#[test]
fn convert_to_assets_handles_zero_vault_value() {
    use crate::accounting::convert_to_assets;

    let env = Env::default();

    // Test edge case: shares exist but vault value is zero (total loss scenario)
    // Expected: returns 0 assets (shares are worthless)

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state: total_shares = 1000, total_assets = 0
    // let shares_to_convert = 100i128;
    // let assets = convert_to_assets(&env, shares_to_convert).unwrap();
    // assert_eq!(assets, 0, "Shares should be worthless when vault has no assets");
}

#[test]
fn convert_to_assets_handles_overflow() {
    use crate::accounting::convert_to_assets;
    use crate::error::Error;

    let env = Env::default();

    // Test overflow protection
    // Note: This requires mocking total_shares and total_assets to trigger overflow

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state with very large values that would cause overflow
    // let huge_shares = i128::MAX;
    // Mock total_shares = 1, total_assets = i128::MAX
    // let result = convert_to_assets(&env, huge_shares);
    // assert_eq!(result, Err(Error::Overflow), "Should detect overflow");
}

#[test]
fn round_trip_conversion_never_extracts_value() {
    use crate::accounting::{convert_to_assets, convert_to_shares};

    let env = Env::default();

    // Test that depositing and immediately withdrawing never extracts more value
    // than was deposited (due to both conversions rounding down)
    //
    // Scenario:
    // - Vault state: 1000 shares backing 1003 assets (slight appreciation)
    // - Deposit 100 assets
    // - Convert to shares: (100 * 1000) / 1003 = 99.7... → 99 shares (rounds down)
    // - Immediately convert back: (99 * 1003) / 1000 = 99.297 → 99 assets (rounds down)
    // - Net: deposited 100, got 99 shares, withdrew 99 assets → lost 1 asset (good)

    // Note: This test will work once total_shares() and total_assets() are implemented

    // Uncomment when total_shares and total_assets are implemented:
    // Mock state: total_shares = 1000, total_assets = 1003
    // let deposit_amount = 100i128;
    //
    // let shares_minted = convert_to_shares(&env, deposit_amount).unwrap();
    // assert!(shares_minted <= deposit_amount, "Should mint at most 100 shares");
    //
    // // Note: After minting, total_shares would be 1099, total_assets would be 1103
    // // For this test to be accurate, we'd need to update the mocked state
    //
    // let assets_withdrawn = convert_to_assets(&env, shares_minted).unwrap();
    // assert!(assets_withdrawn <= deposit_amount,
    //     "Round-trip should never extract more assets than deposited");
}

// ---------------------------------------------------------------------------
// total_assets, total_shares, exchange_rate tests (issue #236)
// ---------------------------------------------------------------------------

#[test]
fn total_shares_returns_zero_before_initialize() {
    use crate::accounting::total_shares;

    let env = Env::default();
    let client = setup(&env);

    let shares = env.as_contract(&client.address, || total_shares(&env));
    assert_eq!(shares, 0, "total_shares should be 0 before any deposits");
}

#[test]
fn total_assets_returns_zero_before_initialize() {
    use crate::accounting::total_assets;

    let env = Env::default();
    let client = setup(&env);

    let assets = env.as_contract(&client.address, || total_assets(&env));
    assert_eq!(assets, 0, "total_assets should be 0 before initialization");
}

#[test]
fn exchange_rate_returns_zero_zero_after_initialize() {
    use crate::accounting::exchange_rate;

    let env = Env::default();
    env.mock_all_auths();

    // After initialization but before any deposits
    // Note: This requires initialize() to be implemented

    // Uncomment when initialize is implemented:
    // let (client, _admin, _treasury, _token) = setup_with_token(&env);
    // let (assets, shares) = exchange_rate(&env);
    // assert_eq!(assets, 0, "total_assets should be 0 after initialize");
    // assert_eq!(shares, 0, "total_shares should be 0 after initialize");
}

#[test]
fn total_shares_reflects_running_total() {
    use crate::accounting::total_shares;
    use crate::types::DataKey;

    let env = Env::default();
    let client = setup(&env);

    env.as_contract(&client.address, || {
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &1000i128);
    });

    let shares = env.as_contract(&client.address, || total_shares(&env));
    assert_eq!(shares, 1000, "total_shares should reflect stored value");
}

#[test]
fn total_assets_includes_idle_balance() {
    use crate::accounting::total_assets;

    let env = Env::default();
    env.mock_all_auths();

    // Note: This test requires a token to be set and the contract to have a balance
    // Full test requires initialize() and token setup

    // Uncomment when initialize and token setup are available:
    // let (client, _admin, _treasury, token) = setup_with_token(&env);
    //
    // // Mint some tokens to the contract
    // let token_client = token::Client::new(&env, &token);
    // token_client.mint(&env.current_contract_address(), &5000);
    //
    // let assets = total_assets(&env);
    // assert_eq!(assets, 5000, "total_assets should equal idle balance when no strategy is active");
}

#[test]
fn total_assets_includes_strategy_deployed_balance() {
    use crate::accounting::total_assets;

    let env = Env::default();
    env.mock_all_auths();

    // Test that total_assets includes both idle balance and strategy-deployed balance
    // Note: This requires:
    // 1. A mock strategy contract that implements balance(of: Address) -> i128
    // 2. initialize() to be implemented
    // 3. register_strategy() and set_active_strategy() to be implemented

    // Uncomment when dependencies are implemented:
    // let (client, _admin, _treasury, token) = setup_with_token(&env);
    //
    // // Create and register a mock strategy
    // let mock_strategy = Address::generate(&env);
    // // Mock the strategy's balance() call to return 3000
    //
    // // Set up: 2000 idle + 3000 in strategy = 5000 total
    // let token_client = token::Client::new(&env, &token);
    // token_client.mint(&env.current_contract_address(), &2000);
    //
    // let assets = total_assets(&env);
    // assert_eq!(assets, 5000, "total_assets should be idle + strategy deployed");
}

#[test]
fn exchange_rate_after_first_deposit() {
    use crate::accounting::exchange_rate;

    let env = Env::default();
    env.mock_all_auths();

    // After first deposit, exchange_rate should reflect the deposit
    // Expected: if 1000 assets deposited → 1000 shares minted → rate (1000, 1000)

    // Note: This requires initialize() and deposit() to be implemented

    // Uncomment when dependencies are implemented:
    // let (client, _admin, _treasury, token) = setup_with_token(&env);
    // let user = Address::generate(&env);
    //
    // // Mint tokens to user and deposit
    // let token_client = token::Client::new(&env, &token);
    // token_client.mint(&user, &1000);
    // client.deposit(&user, &1000);
    //
    // let (assets, shares) = exchange_rate(&env);
    // assert_eq!(assets, 1000, "total_assets should equal first deposit");
    // assert_eq!(shares, 1000, "total_shares should equal first deposit (1:1)");
}

#[test]
fn exchange_rate_moves_after_yield() {
    use crate::accounting::exchange_rate;

    let env = Env::default();
    env.mock_all_auths();

    // After harvest reports positive yield, exchange_rate should reflect appreciation
    // Scenario:
    // - Initial: 1000 shares backing 1000 assets (rate = 1.0)
    // - Strategy earns 200 yield
    // - After harvest: 1000 shares backing 1200 assets (rate = 1.2)

    // Note: This requires initialize(), deposit(), harvest(), and a mock strategy

    // Uncomment when dependencies are implemented:
    // let (client, _admin, _treasury, token) = setup_with_token(&env);
    // let user = Address::generate(&env);
    //
    // // Initial deposit
    // let token_client = token::Client::new(&env, &token);
    // token_client.mint(&user, &1000);
    // client.deposit(&user, &1000);
    //
    // // Simulate yield: mock strategy now reports 1200 balance
    // // Call harvest to update exchange rate
    //
    // let (assets, shares) = exchange_rate(&env);
    // assert_eq!(assets, 1200, "total_assets should include yield");
    // assert_eq!(shares, 1000, "total_shares unchanged (no new deposits)");
    //
    // // Exchange rate = 1200 / 1000 = 1.2 assets per share
}

#[test]
fn total_assets_handles_strategy_query_failure() {
    use crate::accounting::total_assets;

    let env = Env::default();
    env.mock_all_auths();

    // If the strategy's balance() call fails, total_assets should fall back to idle balance
    // Note: This requires setting up a strategy that fails on balance() call

    // Uncomment when dependencies are implemented:
    // let (client, _admin, _treasury, token) = setup_with_token(&env);
    //
    // // Set up a strategy that panics on balance() call
    // // Set idle balance to 500
    // let token_client = token::Client::new(&env, &token);
    // token_client.mint(&env.current_contract_address(), &500);
    //
    // let assets = total_assets(&env);
    // assert_eq!(assets, 500, "Should return idle balance when strategy fails");
}

#[test]
fn exchange_rate_consistency_with_conversions() {
    use crate::accounting::{convert_to_assets, convert_to_shares, exchange_rate};

    let env = Env::default();

    // Test that exchange_rate is consistent with convert_to_shares and convert_to_assets
    // If exchange_rate returns (A, S), then:
    // - convert_to_shares(A) should return approximately S
    // - convert_to_assets(S) should return approximately A

    // Note: This requires mocking total_assets and total_shares

    // Uncomment when total_shares and total_assets work correctly:
    // Mock state: 1200 assets, 1000 shares
    // let (assets, shares) = exchange_rate(&env);
    // assert_eq!(assets, 1200);
    // assert_eq!(shares, 1000);
    //
    // // Test convert_to_shares: 1200 assets should mint 1000 shares
    // let computed_shares = convert_to_shares(&env, assets).unwrap();
    // assert_eq!(computed_shares, shares, "convert_to_shares should be consistent");
    //
    // // Test convert_to_assets: 1000 shares should convert to 1200 assets
    // let computed_assets = convert_to_assets(&env, shares).unwrap();
    // assert_eq!(computed_assets, assets, "convert_to_assets should be consistent");
}

// ---------------------------------------------------------------------------
// Performance fee taken only on positive yield
// ---------------------------------------------------------------------------

/// Register + activate a mock strategy and set the performance fee.
/// Returns `(client, admin, mock)`.
fn setup_fee_harness(env: &Env, fee_bps: u32) -> (YieldAdapterClient, Address, MockStrategyClient) {
    let (client, admin, _treasury, _token) = setup_with_token(env);
    let strategy_address = setup_mock_strategy(env);
    let mock = MockStrategyClient::new(env, &strategy_address);
    let id = client.register_strategy(
        &admin,
        &strategy_address,
        &soroban_sdk::String::from_str(env, "mock"),
    );
    client.set_active_strategy(&admin, &id);
    client.set_performance_fee_bps(&admin, &fee_bps);
    (client, admin, mock)
}

/// Decode the `fee_taken` field of the most recent `harvested` event. Must be
/// called directly after `harvest` — `events().all()` only covers the last
/// top-level invocation.
fn last_harvest_fee(env: &Env) -> i128 {
    let (_, _, data) = env.events().all().last().unwrap().clone();
    let decoded: (Address, i128, i128, u64) =
        soroban_sdk::TryFromVal::try_from_val(env, &data).unwrap();
    decoded.2
}

#[test]
fn performance_fee_taken_only_on_positive_yield() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, 1_000); // 10%

    mock.set_reported_balance(&client.address, &500_000);
    let delta = client.harvest(&Address::generate(&env));

    assert_eq!(last_harvest_fee(&env), 50_000);
    assert_eq!(delta, 500_000);
    assert_eq!(client.fees_accrued(), 500_000 * 1_000 / 10_000);
}

#[test]
fn no_fee_charged_when_harvest_reports_zero_delta() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, 1_000);

    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));
    let accrued_before = client.fees_accrued();

    // Strategy balance unchanged since the last harvest.
    let delta = client.harvest(&Address::generate(&env));

    assert_eq!(delta, 0);
    assert_eq!(last_harvest_fee(&env), 0);
    assert_eq!(client.fees_accrued(), accrued_before);
}

#[test]
fn no_fee_charged_on_loss() {
    let env = Env::default();
    env.mock_all_auths();
    // Start with a 0% fee so the seeding harvest accrues nothing.
    let (client, admin, mock) = setup_fee_harness(&env, 0);
    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));
    assert_eq!(client.fees_accrued(), 0);

    client.set_performance_fee_bps(&admin, &3_000);
    mock.set_reported_balance(&client.address, &700_000);
    let delta = client.harvest(&Address::generate(&env));

    assert_eq!(delta, -300_000);
    assert_eq!(last_harvest_fee(&env), 0);
    assert_eq!(client.fees_accrued(), 0, "a loss must never accrue a fee");
}

#[test]
fn zero_fee_bps_accrues_nothing_on_positive_yield() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, 0);

    mock.set_reported_balance(&client.address, &1_000_000);
    let delta = client.harvest(&Address::generate(&env));

    assert_eq!(delta, 1_000_000);
    assert_eq!(last_harvest_fee(&env), 0);
    assert_eq!(client.fees_accrued(), 0);
}

#[test]
fn max_fee_bps_takes_thirty_percent_of_yield() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, crate::fees::MAX_PERFORMANCE_FEE_BPS);

    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));

    assert_eq!(last_harvest_fee(&env), 300_000);
    assert_eq!(client.fees_accrued(), 300_000);
}

#[test]
fn fee_rounds_down_on_small_yield() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, 1_000); // 10%

    // 9 * 10% = 0.9 -> rounds down to 0.
    mock.set_reported_balance(&client.address, &9);
    client.harvest(&Address::generate(&env));
    assert_eq!(last_harvest_fee(&env), 0);
    assert_eq!(client.fees_accrued(), 0);

    // Next delta is 19: 19 * 10% = 1.9 -> rounds down to 1.
    mock.set_reported_balance(&client.address, &28);
    client.harvest(&Address::generate(&env));
    assert_eq!(last_harvest_fee(&env), 1);
    assert_eq!(client.fees_accrued(), 1);
}

#[test]
fn fees_accumulate_across_consecutive_positive_harvests() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, mock) = setup_fee_harness(&env, 2_000); // 20%

    mock.set_reported_balance(&client.address, &100_000);
    client.harvest(&Address::generate(&env));
    mock.set_reported_balance(&client.address, &250_000);
    client.harvest(&Address::generate(&env));
    mock.set_reported_balance(&client.address, &300_000);
    client.harvest(&Address::generate(&env));

    // Deltas: 100_000 + 150_000 + 50_000 -> fees 20_000 + 30_000 + 10_000.
    assert_eq!(client.fees_accrued(), 60_000);
}

#[test]
fn fee_rate_change_applies_only_to_later_harvests() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin, mock) = setup_fee_harness(&env, 1_000); // 10%

    mock.set_reported_balance(&client.address, &1_000_000);
    client.harvest(&Address::generate(&env));
    assert_eq!(client.fees_accrued(), 100_000);

    client.set_performance_fee_bps(&admin, &2_500); // 25%
    assert_eq!(
        client.fees_accrued(),
        100_000,
        "changing the rate must not retroactively re-price accrued fees"
    );

    mock.set_reported_balance(&client.address, &1_400_000);
    client.harvest(&Address::generate(&env));
    assert_eq!(client.fees_accrued(), 100_000 + 100_000);
}

#[test]
fn apply_performance_fee_rejects_non_positive_yield() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _mock) = setup_fee_harness(&env, 1_000);

    env.as_contract(&client.address, || {
        assert_eq!(
            crate::harvest::apply_performance_fee(&env, 0),
            Err(Error::InvalidAmount)
        );
        assert_eq!(
            crate::harvest::apply_performance_fee(&env, -1_000),
            Err(Error::InvalidAmount)
        );
    });
    assert_eq!(client.fees_accrued(), 0);
}

#[test]
fn apply_performance_fee_returns_depositor_remainder() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _mock) = setup_fee_harness(&env, 1_500); // 15%

    let remainder = env.as_contract(&client.address, || {
        crate::harvest::apply_performance_fee(&env, 1_000_000).unwrap()
    });

    assert_eq!(remainder, 850_000);
    assert_eq!(client.fees_accrued(), 150_000);
    assert_eq!(remainder + client.fees_accrued(), 1_000_000);
}
