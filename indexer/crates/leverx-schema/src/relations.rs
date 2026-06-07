//! Diesel join graph for LeverX indexer tables.
//!
//! `position_key` on child tables references `markets.market_key` (same encoding as
//! `crate::keys::position_key` in the indexer pipeline).

use crate::schema::{
    account_timeline, collateral_assets, collateral_balances, global_market_trades, leverx_events,
    limit_mint_orders, liquidations, leveraged_positions, market_trades, markets, position_triggers,
    predict_managers, proxy_executors, swap_pools, user_proxies, vault_snapshots,
};

diesel::joinable!(predict_managers -> user_proxies (account_id));

diesel::joinable!(limit_mint_orders -> user_proxies (account_id));
diesel::joinable!(limit_mint_orders -> markets (position_key));
diesel::joinable!(limit_mint_orders -> leverx_events (placed_event_digest));

diesel::joinable!(leveraged_positions -> user_proxies (account_id));
diesel::joinable!(leveraged_positions -> markets (position_key));

diesel::joinable!(market_trades -> markets (position_key));
diesel::joinable!(market_trades -> leverx_events (event_digest));
diesel::joinable!(market_trades -> user_proxies (account_id));

diesel::joinable!(global_market_trades -> markets (market_key));
diesel::joinable!(global_market_trades -> predict_managers (manager_id));
diesel::joinable!(global_market_trades -> leverx_events (event_digest));

diesel::joinable!(collateral_balances -> user_proxies (account_id));
diesel::joinable!(collateral_balances -> markets (position_key));
diesel::joinable!(collateral_balances -> collateral_assets (collateral_asset));

diesel::joinable!(position_triggers -> user_proxies (account_id));

diesel::joinable!(proxy_executors -> user_proxies (account_id));

diesel::joinable!(liquidations -> user_proxies (account_id));
diesel::joinable!(liquidations -> markets (position_key));
diesel::joinable!(liquidations -> leverx_events (event_digest));
diesel::joinable!(liquidations -> collateral_assets (collateral_asset));

diesel::joinable!(account_timeline -> user_proxies (account_id));
diesel::joinable!(account_timeline -> leverx_events (event_digest));

diesel::joinable!(vault_snapshots -> leverx_events (event_digest));

diesel::joinable!(swap_pools -> collateral_assets (collateral_asset));

diesel::allow_tables_to_appear_in_same_query!(
    account_timeline,
    collateral_assets,
    collateral_balances,
    global_market_trades,
    leverx_events,
    limit_mint_orders,
    liquidations,
    leveraged_positions,
    market_trades,
    markets,
    position_triggers,
    predict_managers,
    proxy_executors,
    swap_pools,
    user_proxies,
    vault_snapshots,
);
