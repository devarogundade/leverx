use leverx_schema::models::VaultSnapshotRow;

/// Merge the latest vault event with the most recent non-null gauge fields so borrow/repay
/// rows (which omit NAV on-chain) do not blank TVL/APR on `/v1/vault/{id}/summary`.
pub fn merge_vault_snapshot(rows: &[VaultSnapshotRow]) -> Option<VaultSnapshotRow> {
    let latest = rows.first()?;
    let mut merged = latest.clone();
    for row in rows {
        if merged.nav.is_none() {
            merged.nav = row.nav;
        }
        if merged.utilization_bps.is_none() {
            merged.utilization_bps = row.utilization_bps;
        }
        if merged.total_borrowed.is_none() {
            merged.total_borrowed = row.total_borrowed;
        }
        if merged.borrow_rate_bps.is_none() {
            merged.borrow_rate_bps = row.borrow_rate_bps;
        }
        if merged.lp_apr_bps.is_none() {
            merged.lp_apr_bps = row.lp_apr_bps;
        }
    }
    Some(merged)
}
