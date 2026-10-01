//! Content-defined chunking with FastCDC (2020) and BLAKE3.
//! Target 2 MB, min 512 KB, max 8 MB, so an edit in the middle of a 400 MB file moves
//! a few chunks, not the file. See docs/engineering.md, Chunking.
//! fastcdc: https://docs.rs/fastcdc/latest/fastcdc/v2020/struct.StreamCDC.html
//! blake3: https://docs.rs/blake3

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AgentError, Result};

pub const MIN_SIZE: u32 = 512 * 1024;
pub const AVG_SIZE: u32 = 2 * 1024 * 1024;
pub const MAX_SIZE: u32 = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkRef {
    /// BLAKE3 of the chunk bytes, lowercase hex.
    pub hash: String,
    pub offset: u64,
    pub len: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileChunks {
    /// BLAKE3 of the whole file.
    pub blake3: String,
    pub size: u64,
    pub chunks: Vec<ChunkRef>,
}

/// Reads the file once. Returns the whole-file hash and the ordered chunk list.
pub fn chunk_file(path: &Path) -> Result<FileChunks> {
    let file = File::open(path).map_err(|e| AgentError::io(path, e))?;
    let reader = BufReader::with_capacity(MAX_SIZE as usize, file);
    let mut whole = blake3::Hasher::new();
    let mut chunks = Vec::new();
    let mut size: u64 = 0;
    for item in fastcdc::v2020::StreamCDC::new(reader, MIN_SIZE, AVG_SIZE, MAX_SIZE) {
        let chunk = item.map_err(|source| AgentError::Chunk {
            path: path.to_path_buf(),
            source,
        })?;
        whole.update(&chunk.data);
        chunks.push(ChunkRef {
            hash: blake3::hash(&chunk.data).to_hex().to_string(),
            offset: chunk.offset,
            len: chunk.length as u32,
        });
        size += chunk.length as u64;
    }
    Ok(FileChunks {
        blake3: whole.finalize().to_hex().to_string(),
        size,
        chunks,
    })
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    blake3::hash(bytes).to_hex().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn pseudo_random(len: usize, seed: u64) -> Vec<u8> {
        let mut x = seed.max(1);
        let mut out = Vec::with_capacity(len);
        while out.len() < len {
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            out.extend_from_slice(&x.to_le_bytes());
        }
        out.truncate(len);
        out
    }

    #[test]
    fn empty_file_has_no_chunks_and_the_empty_hash() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("empty");
        File::create(&p).unwrap();
        let fc = chunk_file(&p).unwrap();
        assert_eq!(fc.size, 0);
        assert!(fc.chunks.is_empty());
        assert_eq!(fc.blake3, blake3::hash(b"").to_hex().to_string());
    }

    #[test]
    fn chunk_sizes_stay_in_bounds_and_cover_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("big");
        let data = pseudo_random(24 * 1024 * 1024 + 123, 7);
        File::create(&p).unwrap().write_all(&data).unwrap();
        let fc = chunk_file(&p).unwrap();
        assert_eq!(fc.size, data.len() as u64);
        assert_eq!(fc.blake3, blake3::hash(&data).to_hex().to_string());
        let mut offset = 0u64;
        for (i, c) in fc.chunks.iter().enumerate() {
            assert_eq!(c.offset, offset);
            let last = i == fc.chunks.len() - 1;
            assert!(c.len <= MAX_SIZE);
            assert!(last || c.len >= MIN_SIZE, "chunk {i} is {} bytes", c.len);
            offset += c.len as u64;
        }
        assert_eq!(offset, fc.size);
        assert!(fc.chunks.len() >= 3);
    }

    #[test]
    fn an_edit_in_the_middle_moves_few_chunks() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("f");
        let mut data = pseudo_random(40 * 1024 * 1024, 11);
        File::create(&p).unwrap().write_all(&data).unwrap();
        let before = chunk_file(&p).unwrap();
        let mid = data.len() / 2;
        for b in &mut data[mid..mid + 1000] {
            *b ^= 0xff;
        }
        File::create(&p).unwrap().write_all(&data).unwrap();
        let after = chunk_file(&p).unwrap();
        let old: std::collections::HashSet<_> = before.chunks.iter().map(|c| &c.hash).collect();
        let moved = after
            .chunks
            .iter()
            .filter(|c| !old.contains(&c.hash))
            .count();
        assert!((1..=2).contains(&moved), "moved {moved} chunks");
    }
}
