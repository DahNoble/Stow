//! Event topic registry.
//!
//! The off-chain indexer decodes contract events by topic. This module is
//! the canonical, compile-checked registry of topic name strings; the full
//! schema — data fields, types, encoding, and stability guarantees — is
//! documented in `README.md` under "Event schema". Keep the two in sync:
//! any change here (new topic, renamed topic) must be reflected there.
//!
//! Each constant's doc below gives its topics tuple and data tuple (field
//! order is part of the schema). The README's per-topic tables add types
//! and field descriptions.
//!
//! Schema version: [`EVENT_SCHEMA_VERSION`]. Bump it whenever a change is
//! breaking for a decoder built against the previous version — see the
//! README's "Stability guarantees" for the exact rules.

/// Schema version for the event topics defined below, documented in
/// `README.md` ("Event schema"). A decoder should read this from the
/// `init` event's data payload to confirm it matches what it was built
/// against before trusting subsequent events on a given contract instance.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

// --- lifecycle -------------------------------------------------------------
/// Emitted once, at the end of a successful `initialize` call.
///
/// Topics `(Symbol("init"),)` → data `(admin, treasury, token, schema_version, timestamp)`.
pub const TOPIC_INIT: &str = "init";
/// Emitted at the end of a successful `set_admin` call.
///
/// Topics `(Symbol("admin_set"),)` → data `(previous_admin, new_admin, timestamp)`.
pub const TOPIC_ADMIN_SET: &str = "admin_set";
/// Emitted at the end of a successful `set_paused` call.
///
/// Topics `(Symbol("paused_changed"),)` → data `(caller, paused, timestamp)`.
pub const TOPIC_PAUSED_CHANGED: &str = "paused_changed";
/// Emitted at the end of a successful `upgrade` call.
///
/// Topics `(Symbol("upgraded"),)` → data `(caller, new_wasm_hash, timestamp)`.
pub const TOPIC_UPGRADED: &str = "upgraded";

// --- deposit / withdraw ------------------------------------------------------
/// Emitted at the end of a successful `deposit` call.
///
/// Topics `(Symbol("deposited"), owner)` → data `(owner, amount, shares_minted, position_shares, total_shares, timestamp)`.
pub const TOPIC_DEPOSITED: &str = "deposited";
/// Emitted at the end of a successful `request_withdraw` call.
///
/// Topics `(Symbol("withdraw_requested"), owner, id)` → data `(owner, request_id, shares, amount, claimable_at, position_shares, timestamp)`.
pub const TOPIC_WITHDRAW_REQUESTED: &str = "withdraw_requested";
/// Emitted at the end of a successful `claim_withdraw` call.
///
/// Topics `(Symbol("withdraw_claimed"), owner, id)` → data `(owner, request_id, amount, timestamp)`.
pub const TOPIC_WITHDRAW_CLAIMED: &str = "withdraw_claimed";
/// Emitted at the end of a successful `cancel_withdraw` call.
///
/// Topics `(Symbol("withdraw_cancelled"), owner, id)` → data `(owner, request_id, shares_reminted, position_shares, timestamp)`.
pub const TOPIC_WITHDRAW_CANCELLED: &str = "withdraw_cancelled";

// --- strategy ----------------------------------------------------------------
/// Emitted at the end of a successful `register_strategy` call.
///
/// Topics `(Symbol("strategy_registered"), id)` → data `(strategy_id, address, name, deposit_cap, timestamp)`.
pub const TOPIC_STRATEGY_REGISTERED: &str = "strategy_registered";
/// Emitted at the end of a successful `deregister_strategy` call.
///
/// Topics `(Symbol("strategy_deregistered"), id)` → data `(strategy_id, timestamp)`.
pub const TOPIC_STRATEGY_DEREGISTERED: &str = "strategy_deregistered";
/// Emitted at the end of a successful `set_active_strategy` or
/// `migrate_strategy` call.
///
/// Topics `(Symbol("strategy_changed"),)` → data `(from, to, amount_moved, timestamp)`.
pub const TOPIC_STRATEGY_CHANGED: &str = "strategy_changed";

// --- harvest / fees ------------------------------------------------------------
/// Emitted at the end of a successful `harvest` call.
///
/// Topics `(Symbol("harvested"),)` → data `(caller, strategy_id, delta, fee, total_assets, total_shares, timestamp)`.
pub const TOPIC_HARVESTED: &str = "harvested";
/// Emitted at the end of a successful `withdraw_fees` call.
///
/// Topics `(Symbol("fee_collected"),)` → data `(caller, treasury, amount, timestamp)`.
pub const TOPIC_FEE_COLLECTED: &str = "fee_collected";
