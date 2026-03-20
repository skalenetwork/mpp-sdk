# Source Code

Main package source files.

## Files

- **method.ts**: Payment method schema definition
- **client.ts**: Client-side 4-mode implementation
- **server.ts**: Server-side 4-mode implementation
- **index.ts**: Main exports (Mppx, skale, charge)

## Shared Utilities

Located in `shared/`:
- **abi.ts**: ERC-20 and EIP-3009 contract ABIs
- **types.ts**: TypeScript types for Authorization, Store, etc.
- **utils.ts**: Helper functions (encodeTransfer, createAuthorization, etc.)

## Implementation Pattern

Each mode follows this structure:

```typescript
function createMode(parameters) {
  return Method.toClient/Server(charge, {
    async createCredential/verify({ challenge/credential }) {
      // Mode-specific logic
    }
  })
}
```

## Exports

Main export is the `skale` namespace:

```typescript
export namespace skale {
  export type Parameters = Client/ServerParameters
  export const charge = charge_
}
```

This allows usage: `skale.charge({ confidential: true, gasless: false })`
