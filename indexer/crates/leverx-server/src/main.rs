mod catalog;
mod global_trades;
mod leaderboard;
mod orderbook;
mod pagination;
mod routes;
mod stream;
mod vault;
mod ws;

use std::net::SocketAddr;

use anyhow::Result;
use axum::Router;
use clap::Parser;
use diesel_async::pooled_connection::{bb8::Pool, AsyncDieselConnectionManager};
use diesel_async::AsyncPgConnection;
use routes::AppState;
use stream::{spawn_poller, StreamHub};
use axum::http::{header, HeaderValue, Method};
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use tower_http::trace::TraceLayer;

#[derive(Parser, Debug)]
#[command(name = "leverx-server")]
struct ServerArgs {
    #[arg(long, env = "PORT", default_value = "3100")]
    port: u16,

    #[arg(long, env = "DATABASE_URL")]
    database_url: String,

    #[arg(long, env = "CORS_ORIGIN", default_value = "*")]
    cors_origin: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let args = ServerArgs::parse();

    let manager = AsyncDieselConnectionManager::<AsyncPgConnection>::new(&args.database_url);
    let pool = Pool::builder().build(manager).await?;

    let cors = cors_layer(&args.cors_origin);

    let stream = StreamHub::new();
    spawn_poller(pool.clone(), stream.clone());

    let app = Router::new()
        .merge(routes::router())
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(AppState { pool, stream });

    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    tracing::info!("leverx-server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

fn cors_layer(raw: &str) -> CorsLayer {
    if raw.trim() == "*" {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    let patterns: Vec<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/').to_string())
        .collect();

    let mut layer = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::ACCEPT,
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ORIGIN,
        ]);

    if patterns.is_empty() {
        return layer.allow_origin(Any);
    }

    if patterns.iter().all(|p| !p.contains('*')) {
        let origins: Vec<HeaderValue> = patterns
            .iter()
            .filter_map(|s| HeaderValue::from_str(s).ok())
            .collect();
        return match origins.len() {
            0 => layer.allow_origin(Any),
            1 => layer.allow_origin(AllowOrigin::exact(origins[0].clone())),
            _ => layer.allow_origin(AllowOrigin::list(origins)),
        };
    }

    layer.allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
        origin
            .to_str()
            .ok()
            .is_some_and(|value| origin_matches(value, &patterns))
    }))
}

fn origin_matches(origin: &str, patterns: &[String]) -> bool {
    let origin = origin.trim_end_matches('/');
    patterns.iter().any(|pattern| {
        if pattern.contains('*') {
            wildcard_origin_match(origin, pattern)
        } else {
            origin == pattern.as_str()
        }
    })
}

/// Matches patterns like `https://*.suileverx.xyz` (apex + any subdomain).
fn wildcard_origin_match(origin: &str, pattern: &str) -> bool {
    let Some((scheme, suffix)) = pattern.split_once("://*.") else {
        return false;
    };

    let Ok(url) = url::Url::parse(origin) else {
        return false;
    };
    if url.scheme() != scheme {
        return false;
    }

    let Some(host) = url.host_str() else {
        return false;
    };

    host == suffix || host.ends_with(&format!(".{suffix}"))
}
