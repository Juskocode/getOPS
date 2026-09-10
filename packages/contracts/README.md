# `@getops/contracts`

Shared client-server contracts for the React application and API documentation.

The package contains:

- runtime Zod schemas for transport boundaries;
- inferred TypeScript types for client code;
- stable ETag helpers;
- profile-state and written-recall contracts.

The C++ service validates the same invariants at its own trust boundary. TypeScript
schemas improve client safety but are never treated as server authorization.
