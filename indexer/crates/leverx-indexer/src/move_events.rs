//! BCS layouts matching `leverx::events` in contracts/sources/events.move.
//! Field order must match Move struct field order exactly.

use serde::{Deserialize, Serialize};
use sui_types::base_types::{ObjectID, SuiAddress};

/// `std::type_name::TypeName` on-chain.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TypeNameWire {
    pub name: String,
}

// === Protocol ===

#[derive(Debug, Deserialize, Serialize)]
pub struct ProtocolDeployed {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub predict_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub deployer: SuiAddress,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RegistryInitialized {
    pub registry_id: ObjectID,
    pub vault_id: ObjectID,
    pub fee_collector_id: ObjectID,
    pub predict_id: ObjectID,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CollateralWhitelisted {
    pub registry_id: ObjectID,
    pub asset: TypeNameWire,
    pub decimals: u8,
    pub max_ltv_bps: u64,
    pub liquidation_ltv_bps: u64,
    pub max_conf_bps: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SwapPoolRegistered {
    pub registry_id: ObjectID,
    pub asset: TypeNameWire,
    pub pool_id: ObjectID,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct TradingPausedChanged {
    pub registry_id: ObjectID,
    pub paused: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PythMaxAgeUpdated {
    pub registry_id: ObjectID,
    pub max_age_secs: u64,
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
pub struct PredictManagerLinked {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub predict_manager_id: ObjectID,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CollateralDeposited {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub asset: TypeNameWire,
    pub amount: u64,
    pub collateral_value_quote: u64,
    pub balance_after: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CollateralWithdrawn {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub asset: TypeNameWire,
    pub amount: u64,
    pub balance_after: u64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CollateralSwapped {
    pub account_id: ObjectID,
    pub owner: SuiAddress,
    pub oracle_id: ObjectID,
    pub expiry_ms: u64,
    pub strike: u64,
    pub higher_strike: u64,
    pub is_up: bool,
    pub is_range: bool,
    pub base_asset: TypeNameWire,
    pub quote_asset: TypeNameWire,
    pub base_amount: u64,
    pub quote_received: u64,
    pub pool_id: ObjectID,
    pub collateral_balance_after: u64,
    pub quote_balance_after: u64,
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
    pub collateral_asset: TypeNameWire,
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
    pub collateral_asset: TypeNameWire,
    pub debt_repaid: u64,
    pub collateral_seized: u64,
    pub quote_from_swap: u64,
    pub surplus_quote: u64,
    pub health_bps: u64,
    pub had_position_redeem: bool,
}

// === Triggers / executors ===

#[derive(Debug, Deserialize, Serialize)]
pub struct TriggersUpdated {
    pub account_id: ObjectID,
    pub oracle_id: ObjectID,
    pub is_range: bool,
    pub take_profit_premium: u64,
    pub stop_loss_premium: u64,
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
    pub collateral_asset: TypeNameWire,
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
    pub collateral_asset: TypeNameWire,
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
    pub collateral_asset: TypeNameWire,
    pub order_expires_ms: u64,
    pub cancelled_by: SuiAddress,
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
        "RegistryInitialized" => parse_as!(RegistryInitialized),
        "CollateralWhitelisted" => parse_as!(CollateralWhitelisted),
        "SwapPoolRegistered" => parse_as!(SwapPoolRegistered),
        "TradingPausedChanged" => parse_as!(TradingPausedChanged),
        "PythMaxAgeUpdated" => parse_as!(PythMaxAgeUpdated),
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
        "PredictManagerLinked" => parse_as!(PredictManagerLinked),
        "CollateralDeposited" => parse_as!(CollateralDeposited),
        "CollateralWithdrawn" => parse_as!(CollateralWithdrawn),
        "CollateralSwapped" => parse_as!(CollateralSwapped),
        "DebtBorrowed" => parse_as!(DebtBorrowed),
        "DebtRepaid" => parse_as!(DebtRepaid),
        "ProxyAccountingSynced" => parse_as!(ProxyAccountingSynced),
        "LeveragedPositionOpened" => parse_as!(LeveragedPositionOpened),
        "LeveragedPositionClosed" => parse_as!(LeveragedPositionClosed),
        "PositionLiquidated" => parse_as!(PositionLiquidated),
        "TriggersUpdated" => parse_as!(TriggersUpdated),
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
