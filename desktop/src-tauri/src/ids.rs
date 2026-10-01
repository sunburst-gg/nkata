//! ULIDs for every id the agent creates. https://docs.rs/ulid

pub fn new_id() -> String {
    ulid::Ulid::new().to_string()
}
