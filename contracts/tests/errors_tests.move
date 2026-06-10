#[test_only]
module leverx::errors_tests;

use leverx::errors;

#[test]
fun error_codes_are_distinct() {
    assert!(errors::not_owner() != errors::not_authorized(), 0);
    assert!(errors::not_owner() != errors::invalid_manager(), 0);
    assert!(errors::trading_paused() != errors::zero_amount(), 0);
    assert!(errors::not_liquidatable() != errors::insufficient_repayment(), 0);
    assert!(errors::invalid_protocol_vault() != errors::invalid_fee_collector(), 0);
    assert!(errors::limit_order_not_found() != errors::limit_order_exists(), 0);
}

#[test]
fun expected_error_code_values() {
    assert!(errors::insufficient_margin() == 6, 0);
    assert!(errors::invalid_protocol_vault() == 36, 0);
    assert!(errors::invalid_fee_collector() == 37, 0);
}
