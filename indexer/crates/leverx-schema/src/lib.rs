pub mod models;
pub mod protocol;
pub mod relations;
pub mod schema;
pub mod vault_snapshot;

pub use diesel_migrations::{embed_migrations, EmbeddedMigrations};

pub const MIGRATIONS: EmbeddedMigrations = embed_migrations!("migrations");
