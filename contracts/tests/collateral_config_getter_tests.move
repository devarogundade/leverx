#[test_only]
module leverx::collateral_config_getter_tests;

use leverx::{collateral_config, test_fixtures};
use std::type_name;

#[test]
fun getters_return_constructor_values() {
    let asset = type_name::with_defining_ids<test_fixtures::TestCollateral>();
    let feed = test_fixtures::feed_id();
    let config = collateral_config::new(asset, 6, feed, 7_000, 7_500, 500);

    assert!(collateral_config::asset(&config) == asset, 0);
    assert!(collateral_config::decimals(&config) == 6, 0);
    assert!(collateral_config::price_feed_id(&config) == feed, 0);
    assert!(collateral_config::max_ltv_bps(&config) == 7_000, 0);
    assert!(collateral_config::liquidation_ltv_bps(&config) == 7_500, 0);
    assert!(collateral_config::max_conf_bps(&config) == 500, 0);
}
