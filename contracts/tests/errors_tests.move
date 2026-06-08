#[test_only]
module leverx::errors_tests;

use leverx::errors;

#[test]
fun error_codes_are_distinct() {
    assert!(errors::not_owner() != errors::not_authorized(), 0);
    assert!(errors::not_owner() != errors::invalid_manager(), 0);
    assert!(errors::trading_paused() != errors::zero_amount(), 0);
    assert!(errors::ltv_exceeded() != errors::not_liquidatable(), 0);
    assert!(errors::same_asset_swap() != errors::liquidation_no_collateral(), 0);
    assert!(errors::invalid_protocol_vault() != errors::invalid_fee_collector(), 0);
    assert!(errors::limit_order_not_found() != errors::limit_order_exists(), 0);
}

#[test]
fun expected_error_code_values() {
    assert!(errors::same_asset_swap() == 39, 0);
    assert!(errors::liquidation_no_collateral() == 40, 0);
    assert!(errors::invalid_collateral_config() == 38, 0);
}
