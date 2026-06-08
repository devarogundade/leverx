#[test_only]
module leverx::spot_swap_tests;

use leverx::{errors, spot_swap};

public struct BaseAsset has drop {}
public struct QuoteAsset has drop {}

#[test]
fun distinct_swap_assets_passes() {
    spot_swap::assert_distinct_swap_assets<BaseAsset, QuoteAsset>();
}

#[test]
#[expected_failure(abort_code = errors::E_SAME_ASSET_SWAP)]
fun same_asset_swap_aborts() {
    spot_swap::assert_distinct_swap_assets<BaseAsset, BaseAsset>();
}
