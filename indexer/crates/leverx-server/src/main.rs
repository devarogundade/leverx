mod catalog;
mod leaderboard;
mod orderbook;
mod pagination;
mod routes;
mod stream;
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

    let origins: Vec<HeaderValue> = raw
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.trim_end_matches('/'))
        .filter_map(|s| HeaderValue::from_str(s).ok())
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

    if origins.is_empty() {
        layer.allow_origin(Any)
    } else if origins.len() == 1 {
        layer.allow_origin(AllowOrigin::exact(origins[0].clone()))
    } else {
        layer.allow_origin(AllowOrigin::list(origins))
    }
}
