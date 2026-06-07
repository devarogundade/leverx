mod config;
mod handlers;
mod keys;
mod move_events;
mod points;
mod predict_events;
mod predict_projections;
mod projections;
mod relation_upserts;

use std::sync::Arc;

use anyhow::{bail, Result};
use clap::Parser;
use config::LeverxConfig;
use handlers::LeverxEventsHandler;
use leverx_schema::MIGRATIONS;
use sui_indexer_alt_framework::{
    cluster::{Args, IndexerCluster},
    pipeline::sequential::SequentialConfig,
    service::Error,
};
use url::Url;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let _guard = telemetry_subscribers::TelemetryConfig::new()
        .with_env()
        .init();

    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set")
        .parse::<Url>()
        .expect("Invalid DATABASE_URL");

    let leverx_config = Arc::new(LeverxConfig::from_env()?);
    let args = Args::parse();

    let mut cluster = IndexerCluster::builder()
        .with_args(args)
        .with_database_url(database_url)
        .with_migrations(&MIGRATIONS)
        .build()
        .await?;

    cluster
        .sequential_pipeline(
            LeverxEventsHandler {
                config: leverx_config,
            },
            SequentialConfig::default(),
        )
        .await?;

    match cluster.run().await?.main().await {
        Ok(()) | Err(Error::Terminated) => Ok(()),
        Err(Error::Aborted) => bail!("LeverX indexer aborted due to an unexpected error"),
        Err(Error::Task(e)) => bail!(e),
    }
}
