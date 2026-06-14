//! Matches on-chain `predict_client::premium_per_unit` (divide-and-round-up).

pub const PREDICT_PRICE_SCALE: u128 = 1_000_000_000;

/// Per-contract premium (1e9 scale) from total quote atoms and contract quantity.
pub fn premium_per_unit_from_quote(quote_atoms: u64, quantity: u64) -> Option<i64> {
    if quote_atoms == 0 || quantity == 0 {
        return None;
    }
    let quote = quote_atoms as u128;
    let qty = quantity as u128;
    Some(((quote * PREDICT_PRICE_SCALE + qty - 1) / qty) as i64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn premium_per_unit_rounds_up() {
        // predict_client_tests: mint_cost=100, quantity=3 → premium=333_333_334
        assert_eq!(premium_per_unit_from_quote(100, 3), Some(333_333_334));
    }

    #[test]
    fn premium_per_unit_from_realistic_mint() {
        // $8 mint, ~30.184M contracts → ~26.5¢
        let premium = premium_per_unit_from_quote(8_000_000, 30_184_000).unwrap();
        assert!(premium > 260_000_000 && premium < 270_000_000, "premium={premium}");
    }
}
