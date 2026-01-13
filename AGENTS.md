# Agent Guidelines for unwatched-jellyfin

## Commands
- **Run**: `bun run index.ts [OPTIONS]` or `npx unwatched-jellyfin [OPTIONS]` (executes main cleanup script)
- **Install**: `bun install`
- **Build**: `bun run build` (builds CLI to dist/cli.js)
- **Publish**: `npm publish` (runs prepublishOnly build script automatically)
- **Type check**: `bunx tsc --noEmit`
- **CLI Options**:
  - `--sonarr-url <url>` - Sonarr server URL
  - `--sonarr-api-key <key>` - Sonarr API key
  - `--jellyfin-url <url>` - Jellyfin server URL
  - `--jellyfin-username <user>` - Jellyfin username
  - `--jellyfin-password <pass>` - Jellyfin password
  - `--days <number>` - Age threshold in days (default: 365)
  - `--dry-run, -d` - Dry run mode (default)
  - `--execute, -e` - Execute deletions (not dry run)
  - `--help, -h` - Show help message

## Project Overview
This project identifies and optionally deletes old, unwatched TV series from Sonarr based on Jellyfin playback data. It queries Jellyfin's playback activity to determine which episodes have been watched, cross-references with Sonarr, and flags series that haven't been watched within a configurable threshold.

## Code Style

### Language & Runtime
- **Runtime**: Bun with TypeScript
- **Module system**: ES modules only (`"type": "module"`)
- **Target**: ESNext
- **Compiler**: strict TypeScript enabled

### Imports
- Use `import` syntax (no require)
- Local imports use relative paths with `./` prefix
- No file extensions needed for local imports (configured via `allowImportingTsExtensions`)
- Group imports: third-party libraries first, then local modules

### Types
- All code must be fully typed - avoid `any` when possible
- Use `interface` for object shapes, `type` for unions/aliases
- Explicit return types on public methods (private methods can omit for brevity)
- Use `null` for absent values, not `undefined`
- Type assertions should use `as` syntax, not angle brackets
- Use non-null assertion operator (`!`) only when absolutely certain

### Naming Conventions
- **Variables/functions**: `camelCase` (e.g., `baseUrl`, `authenticate()`)
- **Classes**: `PascalCase` (e.g., `JellyfinClient`, `SonarrClient`)
- **Interfaces/Types**: `PascalCase` (e.g., `QueryResponse`, `AuthResponse`)
- **Constants**: `SCREAMING_SNAKE_CASE` at module level (e.g., `JELLYFIN_URL`, `AGE_THRESHOLD_DAYS`)
- **Private class members**: `camelCase` prefix with `private` modifier
- **SQL aliases**: snake_case within queries (e.g., `max_duration`, `play_count`)

### Code Organization
- One class per file for clients (e.g., `jellyfin-client.ts`, `sonarr-client.ts`)
- Separate utility files for helpers (e.g., `jellyfin-utils.ts`)
- Entry point in `index.ts` - contains main execution logic
- Module-level constants for environment variables with sensible defaults
- Classes: constructor initializes private fields, methods organized logically

### Error Handling
- Always throw `Error` objects with descriptive messages: `throw new Error("description: status")`
- Check `response.ok` before processing HTTP responses
- Use try/catch for operations that might fail (e.g., fetch in loops)
- Async functions should propagate errors up the call stack
- Main entry point has top-level error handler with `process.exit(1)`

### HTTP Requests
- Use native `fetch` API
- Methods: use string constants (`"POST"`, `"GET"`, `"DELETE"`)
- Headers: use kebab-case for header names
- JSON body: use `JSON.stringify()` with `"Content-Type": "application/json"`
- API authentication: use custom headers (e.g., `"X-Api-Key"`, `"X-MediaBrowser-Token"`)
- Include error details in thrown errors (status code, status text)
- `response.json()` returns `unknown` - use `as T` type assertion for generic return types

### SQL Queries
- Use template literals with backticks for multi-line queries
- Format with consistent indentation (2-4 spaces)
- Use table aliases (e.g., `pa` for `PlaybackActivity`, `i` for `TypedBaseItems`)
- Column aliases for computed values (e.g., `MAX(pa.PlayDuration) as max_duration`)
- Include proper WHERE clauses to filter data efficiently

### Logging
- Use `console.log()` for informational messages (progress, counts)
- Use `console.error()` for error messages
- Provide context in logs: `console.log('Found ${count} items')`
- Log important operations: authentication, fetching data, completion
- No structured logging library (keep it simple with console)

### Async/Await
- Use `async/await` consistently (no `.then()` chains unless necessary)
- Mark all async functions explicitly
- Avoid mixing callbacks with async/await
- Use `Promise.all()` for concurrent independent operations

### Code Patterns
- Environment variables: `const VAR = process.env.VAR || "default_value"`
- Type conversion: Use `Number()` for string-to-number, not `parseInt()` unless radix needed
- String interpolation: Use template literals with backticks for all dynamic strings
- Array operations: Prefer `map()`, `filter()`, `find()` over for-loops when possible
- Set/Map: Use for deduplication and key-value lookups (e.g., `new Set()`, `new Map()`)

### Security Notes
- Never commit `.env` files - use `.env.example` as template
- API keys should come from environment variables
- Don't log sensitive data (passwords, tokens)
- SQL queries should use parameterized patterns or safe string interpolation

### Environment Configuration
- All sensitive credentials in `.env` (gitignored)
- Reference config in `.env.example` without actual values
- Required vars: `SONARR_URL`, `SONARR_API_KEY`, `JELLYFIN_URL`, `JELLYFIN_USERNAME`, `JELLYFIN_PASSWORD`
- Optional vars: `AGE_THRESHOLD_DAYS` (default: 365), `DRY_RUN` (default: "true" - set to "false" to actually delete files)

### TypeScript Config Notes
- `strict: true` with additional strict flags: `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- `noEmit: true` - Bun handles execution directly, no build step required for running
- `moduleResolution: "bundler"` - optimized for Bun runtime
- `verbatimModuleSyntax: true` - requires explicit type imports with `import type`

### Testing
- Currently no test framework set up
- When adding tests, consider `bun test` framework
- Test files should be adjacent to source files or in a dedicated test directory
- Mock external API calls (Jellyfin, Sonarr) in tests
- Focus on testing business logic, not HTTP layer

### Debugging
- Use `console.log()` for temporary debugging
- Remove debug logs before committing
- For complex issues, use `bun --inspect index.ts` for Chrome DevTools debugging
- Check `.env.example` for required environment variables

### File Structure
```
.
├── index.ts              # Main entry point
├── jellyfin-client.ts    # Jellyfin API client
├── jellyfin-utils.ts     # Jellyfin utilities (auth helpers)
├── sonarr-client.ts      # Sonarr API client
├── .env.example          # Environment variables template
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
└── AGENTS.md             # This file
```

### Best Practices
- Keep functions focused on a single responsibility
- Avoid side effects in pure functions
- Use early returns to reduce nesting
- Prefer composition over complex inheritance hierarchies
- Document non-obvious logic with inline comments

### Performance
- Use `Set` and `Map` for O(1) lookups (especially for deduplication)
- Use `Promise.all()` for concurrent independent async operations
- Fetch only needed data from APIs (don't over-fetch)
- Consider batching requests when dealing with large datasets
