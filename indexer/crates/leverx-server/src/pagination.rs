use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Page<T> {
    pub items: Vec<T>,
    pub limit: i64,
    pub offset: i64,
    pub has_more: bool,
}

pub fn parse_limit_offset(limit: Option<i64>, offset: Option<i64>) -> (i64, i64) {
    let limit = limit.unwrap_or(100).clamp(1, 500);
    let offset = offset.unwrap_or(0).max(0);
    (limit, offset)
}

pub fn paginate<T>(rows: Vec<T>, limit: i64, offset: i64) -> Page<T> {
    let has_more = rows.len() > limit as usize;
    let items = rows.into_iter().take(limit as usize).collect();
    Page {
        items,
        limit,
        offset,
        has_more,
    }
}
