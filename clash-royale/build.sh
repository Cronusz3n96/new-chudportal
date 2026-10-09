#!/usr/bin/env bash
# Build the Rust game logic to wasm and inline it into a standalone index.html.
set -euo pipefail
cd "$(dirname "$0")"

export PATH="$HOME/.cargo/bin:$PATH"
cargo build --release --target wasm32-unknown-unknown
node build.mjs
