//! BCS layouts matching `leverx::events` in contracts/sources/events.move.
//! Field order must match Move struct field order exactly.

use serde::{Deserialize, Serialize};
use sui_types::base_types::{ObjectID, SuiAddress};

// === Protocol ===

#[derive(Debug, Deserialize, Serialize)]
pub struct ProtocolDeployed {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub predict_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub deployer: SuiAddress,
}

/// Pre–`liquidation_bps` layout (older deployed packages).
#[derive(Debug, Deserialize, Serialize)]
pub struct RegistryInitializedLegacy {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub predict_id: ObjectID,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RegistryInitialized {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub predict_id: ObjectID,
    pub liquidation_bps: u64,
    pub final_window_ms: u64,
}

/// `RegistryInitialized` before `final_window_ms` was added.
#[derive(Debug, Deserialize, Serialize)]
pub struct RegistryInitializedWithLiquidation {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub predict_id: ObjectID,
    pub liquidation_bps: u64,
}

pub enum ParsedRegistryInitialized {
    Current(RegistryInitialized),
    WithLiquidation(RegistryInitializedWithLiquidation),
    Legacy(RegistryInitializedLegacy),
}

pub fn parse_registry_initialized(bytes: &[u8]) -> Option<ParsedRegistryInitialized> {
    if let Some(v) = try_parse::<RegistryInitialized>(bytes) {
        return Some(ParsedRegistryInitialized::Current(v));
    }
    if let Some(v) = try_parse::<RegistryInitializedWithLiquidation>(bytes) {
        return Some(ParsedRegistryInitialized::WithLiquidation(v));
    }
    try_parse::<RegistryInitializedLegacy>(bytes).map(ParsedRegistryInitialized::Legacy)
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LiquidationBpsUpdated {
    pub registry_id: ObjectID,
    pub liquidation_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FinalWindowUpdated {
    pub registry_id: ObjectID,
    pub final_window_ms: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TradingPausedChanged {
    pub registry_id: ObjectID,
    pub paused: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BorrowRateParamsUpdated {
    pub vault_id: ObjectID,
    pub base_rate_bps: u64,
    pub kink_utilization_bps: u64,
    pub slope1_bps: u64,
    pub slope2_bps: u64,
    pub flash_fee_bps: u64,
}

// === Vault ===

#[derive(Debug, Deserialize, Serialize)]
pub struct VaultSupplied {
    pub vault_id: ObjectID,
    pub supplier: SuiAddress,
    pub amount: u64,
    pub shares_minted: u64,
    pub nav: u64,
    pub utilization_bps: u64,
    pub total_borrowed: u64,
    pub borrow_rate_bps: u64,
    pub lp_apr_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VaultWithdrawn {
    pub vault_id: ObjectID,
    pub withdrawer: SuiAddress,
    pub amount: u64,
    pub shares_burned: u64,
    pub nav: u64,
    pub utilization_bps: u64,
    pub total_borrowed: u64,
    pub borrow_rate_bps: u64,
    pub lp_apr_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VaultBorrowed {
    pub vault_id: ObjectID,
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub amount: u64,
    pub total_borrowed: u64,
    pub utilization_bps: u64,
    pub borrow_rate_bps: u64,
    pub lp_apr_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VaultRepaid {
    pub vault_id: ObjectID,
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub amount: u64,
    pub total_borrowed: u64,
    pub utilization_bps: u64,
    pub borrow_rate_bps: u64,
    pub lp_apr_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct InterestAccrued {
    pub vault_id: ObjectID,
    pub interest_added: u64,
    pub total_borrowed: u64,
    pub borrow_rate_bps: u64,
    pub lp_apr_bps: u64,
    pub nav: u64,
    pub utilization_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FlashLoanBorrowed {
    pub vault_id: ObjectID,
    pub borrower: SuiAddress,
    pub amount: u64,
    pub fee: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FlashLoanRepaid {
    pub vault_id: ObjectID,
    pub amount: u64,
    pub fee: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct InsuranceFundSkimmed {
    pub vault_id: ObjectID,
    pub account_id: ObjectID,
    pub amount: u64,
    pub source: u8,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProtocolFeeDistributed {
    pub vault_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub total_amount: u64,
    pub vault_amount: u64,
    pub collector_amount: u64,
    pub keeper_amount: u64,
    pub keeper: SuiAddress,
    pub fee_source: u8,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct FeeCollectorWithdrawn {
    pub fee_collector_id: ObjectID,
    pub recipient: SuiAddress,
    pub amount: u64,
    pub balance_after: u64,
}

// === User proxy ===

#[derive(Debug, Deserialize, Serialize)]
pub struct AccountCreated {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub predict_manager_id: ObjectID,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DebtBorrowed {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub amount: u64,
    pub borrowed_quote_after: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DebtRepaid {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub amount: u64,
    pub remaining_debt: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ProxyAccountingSynced {
    pub account_id: ObjectID,
    pub borrowed_quote: u64,
}

/// Pre–`key_margin_debt` / `leverage_bps` event layout (older deployed packages).
#[derive(Debug, Deserialize, Serialize)]
pub struct KeyBorrowUpdatedLegacy {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub key_borrowed_quote: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct KeyBorrowUpdated {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub key_borrowed_quote: u64,
    pub key_margin_debt: u64,
    pub leverage_bps: u64,
}

pub enum ParsedKeyBorrowUpdated {
    Full(KeyBorrowUpdated),
    Legacy(KeyBorrowUpdatedLegacy),
}

pub fn parse_key_borrow_updated(bytes: &[u8]) -> Option<ParsedKeyBorrowUpdated> {
    if let Some(v) = try_parse::<KeyBorrowUpdated>(bytes) {
        return Some(ParsedKeyBorrowUpdated::Full(v));
    }
    try_parse::<KeyBorrowUpdatedLegacy>(bytes).map(ParsedKeyBorrowUpdated::Legacy)
}

// === Positions ===

#[derive(Debug, Deserialize, Serialize)]
pub struct LeveragedPositionOpened {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub predict_manager_id: ObjectID,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub quantity: u64,
    pub margin_quote: u64,
    pub borrow_quote: u64,
    pub leverage_bps: u64,
    pub mint_cost: u64,
    pub borrowed_quote_after: u64,
    pub order_type: u8,
    pub limit_premium_per_unit: u64,
    pub market_ask_at_fill: u64,
    pub max_mint_cost: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LeveragedPositionClosed {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub predict_manager_id: ObjectID,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub quantity: u64,
    pub payout: u64,
    pub debt_repaid: u64,
    pub surplus_quote: u64,
    pub remaining_debt: u64,
    pub is_settled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct BadDebtWrittenOff {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub insurance_covered: u64,
    pub socialized: u64,
    pub keeper: SuiAddress,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PositionForceDeleveraged {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub predict_manager_id: ObjectID,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub redeemed_quantity: u64,
    pub payout: u64,
    pub reminted_quantity: u64,
    pub keeper: SuiAddress,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PositionLiquidated {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub keeper: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub debt_repaid: u64,
    pub surplus_quote: u64,
    pub health_bps: u64,
    pub had_position_redeem: bool,
}

// === Triggers / executors ===

/// Pre–slippage-bps layout (older deployed packages).
#[derive(Debug, Deserialize, Serialize)]
pub struct TriggersUpdatedLegacy {
    pub account_id: ObjectID,
    pub oracle_id: ObjectID,
    pub is_range: bool,
    pub take_profit_premium: u64,
    pub stop_loss_premium: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TriggersUpdated {
    pub account_id: ObjectID,
    pub oracle_id: ObjectID,
    pub is_range: bool,
    pub take_profit_premium: u64,
    pub stop_loss_premium: u64,
    pub take_profit_slippage_bps: u64,
    pub stop_loss_slippage_bps: u64,
}

pub enum ParsedTriggersUpdated {
    Full(TriggersUpdated),
    Legacy(TriggersUpdatedLegacy),
}

/// Protocol default when legacy `TriggersUpdated` events omit slippage fields.
pub const DEFAULT_TRIGGER_SLIPPAGE_BPS: u64 = 500;

pub fn parse_triggers_updated(bytes: &[u8]) -> Option<ParsedTriggersUpdated> {
    if let Some(v) = try_parse::<TriggersUpdated>(bytes) {
        return Some(ParsedTriggersUpdated::Full(v));
    }
    try_parse::<TriggersUpdatedLegacy>(bytes).map(ParsedTriggersUpdated::Legacy)
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TriggersCleared {
    pub account_id: ObjectID,
    pub oracle_id: ObjectID,
    pub is_range: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ExecutorRegistered {
    pub account_id: ObjectID,
    pub executor: SuiAddress,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ExecutorRevoked {
    pub account_id: ObjectID,
    pub executor: SuiAddress,
}

// === Resting limits ===

#[derive(Debug, Deserialize, Serialize)]
pub struct LimitMintOrderPlaced {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_range: bool,
    pub is_up: bool,
    pub limit_premium_per_unit: u64,
    pub slippage_bps: u64,
    pub market_ask_at_place: u64,
    pub margin_quote: u64,
    pub leverage_bps: u64,
    pub quantity: u64,
    pub order_expires_ms: u64,
    pub placed_by: SuiAddress,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LimitMintOrderExecuted {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub executor: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_range: bool,
    pub is_up: bool,
    pub limit_premium_per_unit: u64,
    pub slippage_bps: u64,
    pub market_ask_at_fill: u64,
    pub mint_cost: u64,
    pub quantity: u64,
    pub order_expires_ms: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LimitMintOrderCancelled {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_range: bool,
    pub is_up: bool,
    pub order_expires_ms: u64,
    pub cancelled_by: SuiAddress,
}

/// Matches `protocol_constants::fee_source_*` in contracts.
pub const FEE_SOURCE_INTEREST: u8 = 1;
pub const FEE_SOURCE_FLASH_LOAN: u8 = 2;
pub const FEE_SOURCE_LIQUIDATION: u8 = 3;
pub const FEE_SOURCE_INSURANCE: u8 = 4;

pub fn fee_source_label(source: u8) -> &'static str {
    match source {
        FEE_SOURCE_INTEREST => "interest",
        FEE_SOURCE_FLASH_LOAN => "flash_loan",
        FEE_SOURCE_LIQUIDATION => "liquidation",
        FEE_SOURCE_INSURANCE => "insurance",
        _ => "unknown",
    }
}

pub fn try_parse<T: for<'de> Deserialize<'de>>(bytes: &[u8]) -> Option<T> {
    bcs::from_bytes(bytes).ok()
}

pub fn parse_event_json(event_name: &str, bytes: &[u8]) -> serde_json::Value {
    use serde_json::json;

    macro_rules! parse_as {
        ($ty:ty) => {
            if let Some(v) = try_parse::<$ty>(bytes) {
                return serde_json::to_value(v).unwrap_or(json!({}));
            }
        };
    }

    match event_name {
        "ProtocolDeployed" => parse_as!(ProtocolDeployed),
        "RegistryInitialized" => {
            if let Some(parsed) = parse_registry_initialized(bytes) {
                return match parsed {
                    ParsedRegistryInitialized::Current(v) => serde_json::to_value(v).unwrap_or(json!({})),
                    ParsedRegistryInitialized::WithLiquidation(v) => serde_json::to_value(v).unwrap_or(json!({})),
                    ParsedRegistryInitialized::Legacy(v) => serde_json::to_value(v).unwrap_or(json!({})),
                };
            }
        }
        "LiquidationBpsUpdated" => parse_as!(LiquidationBpsUpdated),
        "FinalWindowUpdated" => parse_as!(FinalWindowUpdated),
        "TradingPausedChanged" => parse_as!(TradingPausedChanged),
        "BorrowRateParamsUpdated" => parse_as!(BorrowRateParamsUpdated),
        "VaultSupplied" => parse_as!(VaultSupplied),
        "VaultWithdrawn" => parse_as!(VaultWithdrawn),
        "VaultBorrowed" => parse_as!(VaultBorrowed),
        "VaultRepaid" => parse_as!(VaultRepaid),
        "InterestAccrued" => parse_as!(InterestAccrued),
        "FlashLoanBorrowed" => parse_as!(FlashLoanBorrowed),
        "FlashLoanRepaid" => parse_as!(FlashLoanRepaid),
        "ProtocolFeeDistributed" => parse_as!(ProtocolFeeDistributed),
        "FeeCollectorWithdrawn" => parse_as!(FeeCollectorWithdrawn),
        "InsuranceFundSkimmed" => parse_as!(InsuranceFundSkimmed),
        "AccountCreated" => parse_as!(AccountCreated),
        "DebtBorrowed" => parse_as!(DebtBorrowed),
        "DebtRepaid" => parse_as!(DebtRepaid),
        "ProxyAccountingSynced" => parse_as!(ProxyAccountingSynced),
        "KeyBorrowUpdated" => {
            if let Some(parsed) = parse_key_borrow_updated(bytes) {
                return match parsed {
                    ParsedKeyBorrowUpdated::Full(v) => serde_json::to_value(v).unwrap_or(json!({})),
                    ParsedKeyBorrowUpdated::Legacy(v) => serde_json::to_value(v).unwrap_or(json!({})),
                };
            }
        }
        "LeveragedPositionOpened" => parse_as!(LeveragedPositionOpened),
        "LeveragedPositionClosed" => parse_as!(LeveragedPositionClosed),
        "BadDebtWrittenOff" => parse_as!(BadDebtWrittenOff),
        "PositionForceDeleveraged" => parse_as!(PositionForceDeleveraged),
        "PositionLiquidated" => parse_as!(PositionLiquidated),
        "TriggersUpdated" => {
            if let Some(parsed) = parse_triggers_updated(bytes) {
                return match parsed {
                    ParsedTriggersUpdated::Full(v) => serde_json::to_value(v).unwrap_or(json!({})),
                    ParsedTriggersUpdated::Legacy(v) => serde_json::to_value(v).unwrap_or(json!({})),
                };
            }
        }
        "TriggersCleared" => parse_as!(TriggersCleared),
        "ExecutorRegistered" => parse_as!(ExecutorRegistered),
        "ExecutorRevoked" => parse_as!(ExecutorRevoked),
        "LimitMintOrderPlaced" => parse_as!(LimitMintOrderPlaced),
        "LimitMintOrderExecuted" => parse_as!(LimitMintOrderExecuted),
        "LimitMintOrderCancelled" => parse_as!(LimitMintOrderCancelled),
        _ => {}
    }

    json!({ "raw_bcs_len": bytes.len() })
}
