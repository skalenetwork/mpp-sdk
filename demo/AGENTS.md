# Demo

Complete working client/server demonstration.

## Files

- **server.ts**: HTTP server requiring payment for /premium-content
- **client.ts**: Client that pays and fetches content
- **package.json**: Bun dependencies
- **README.md**: Full instructions

## Quick Start

```bash
cd demo
bun install

# Edit server.ts: Set SERVER_ADDRESS
# Edit client.ts: Set PRIVATE_KEY

# Run both
bun run dev

# Or separately
bun run server  # Terminal 1
bun run client  # Terminal 2
```

## What It Demonstrates

1. Server sets up Mppx with 4 skale payment methods
2. Client requests protected resource
3. Server returns 402 with challenge
4. Client auto-pays based on selected mode
5. Server verifies and returns content
6. Client displays result

## Architecture

Server uses Bun.serve() with Mppx.toNodeListener() to handle payments.
Client uses Mppx.create() with automatic 402 handling.

Both communicate via standard HTTP with Payment headers.
