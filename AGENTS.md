# AGENTS.md — Bunny CLI

This document describes the architecture, conventions, and implementation details for the Bunny CLI. It serves as the canonical reference for AI agents and contributors working on this codebase.

---

## Overview

The Bunny CLI (`bunny`) is a command-line interface for interacting with bunny.net services (magic containers, edge scripting, databases). It is written in TypeScript, runs on the Bun runtime, and follows patterns inspired by Cobra (Go).

The CLI supports profile-based authentication, browser-based OAuth login, and a modular command structure built on `yargs`.

---

## Runtime & Tooling

| Concern             | Tool    | Notes                                                           |
| ------------------- | ------- | --------------------------------------------------------------- |
| Runtime             | **Bun** | Runs TypeScript natively. No transpilation step in development. |
| Package manager     | **Bun** | `bun add`, `bun install`. Lockfile is `bun.lock`.               |
| Test runner         | **Bun** | `bun test`. Jest-compatible API.                                |
| Build / compile     | **Bun** | `bun build --compile` produces a single native executable.      |
| Watch mode          | **Bun** | `bun --watch packages/cli/src/index.ts` for development.        |
| Env loading         | **Bun** | Auto-loads `.env` files. No `dotenv` package needed.            |
| Local HTTP servers  | **Bun** | `Bun.serve()` for the auth callback server. No Express needed.  |
| Subprocess spawning | **Bun** | `Bun.spawn()` for opening browsers, running child processes.    |

### Why Bun

Bun replaces the entire Node.js toolchain. There are no separate tools for transpilation (`ts-node`, `tsx`), bundling (`esbuild`, `webpack`), testing (`jest`, `vitest`), or executable packaging (`pkg`, `nexe`). The `tsconfig.json` exists only for editor type-checking (`tsc --noEmit`); Bun handles all execution and compilation.

---

## Dependencies

### Runtime dependencies

| Package          | Purpose                                                        |
| ---------------- | -------------------------------------------------------------- |
| `yargs`          | Command routing, subcommands, flag parsing, auto-help          |
| `chalk`          | Terminal string styling (colors, bold, dim)                    |
| `ora`            | Terminal spinners for async operations                         |
| `prompts`        | Interactive input: password masks, confirmations, multi-select |
| `cli-table3`     | Formatted terminal tables                                      |
| `zod`            | Schema validation for config files and CLI input               |
| `@libsql/client` | libSQL/Turso database client (used by `db shell`)              |
| `openapi-fetch`  | Type-safe HTTP client generated from OpenAPI specs             |
| `smol-toml`      | TOML v1 parser/serializer for `bunny.toml` config files        |

### Dev dependencies

| Package              | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `@types/yargs`       | Type definitions for yargs                         |
| `@types/prompts`     | Type definitions for prompts                       |
| `typescript`         | Type-checking only (`tsc --noEmit`)                |
| `openapi-typescript` | Generates TypeScript types from OpenAPI JSON specs |

### Packages we explicitly do NOT use

- **No `dotenv`** — Bun loads `.env` automatically.
- **No `execa`** — Use `Bun.spawn()` or `Bun.$` shell.
- **No `express` or `http`** — Use `Bun.serve()` for HTTP servers.
- **No `ink` or `react`** — We use the lighter stack of `ora` + `prompts` + `chalk`.
- **No `commander` or `clipanion`** — We use `yargs`.
- **No `cosmiconfig`** — Config file resolution is hand-rolled to match the existing Go CLI behavior.

---

## Project Structure

This is a Bun workspace monorepo with two packages:

- **`@bunny.net/api`** (`packages/api/`) — Standalone, type-safe API client SDK for bunny.net. Zero CLI dependencies. Publishable to npm.
- **`@bunny.net/cli`** (`packages/cli/`) — The CLI. Depends on `@bunny.net/api`.

```
bunny-cli/
├── packages/
│   ├── api/                              # @bunny.net/api package
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── redocly.yaml                  # Multi-spec config for openapi-typescript
│   │   ├── specs/                        # OpenAPI specs (committed, JSON)
│   │   │   ├── core.json                 # Core API — https://api.bunny.net
│   │   │   ├── compute.json              # Edge Scripting API — https://api.bunny.net/compute
│   │   │   ├── database.json             # Database API — https://api.bunny.net/database
│   │   │   └── magic-containers.json     # Magic Containers API — https://api.bunny.net/mc
│   │   ├── scripts/
│   │   │   └── update-specs.ts           # Downloads latest specs from bunny.net endpoints
│   │   └── src/
│   │       ├── index.ts                  # Barrel export: clients, errors, ClientOptions type
│   │       ├── middleware.ts             # authMiddleware(options) — dependency-inverted (no CLI imports)
│   │       ├── errors.ts                 # UserError, ApiError classes
│   │       ├── core-client.ts            # createCoreClient(options) — Core API
│   │       ├── compute-client.ts         # createComputeClient(options) — Edge Scripting
│   │       ├── db-client.ts              # createDbClient(options) — Database
│   │       ├── mc-client.ts              # createMcClient(options) — Magic Containers
│   │       └── generated/                # Generated .d.ts files (gitignored)
│   │           ├── core.d.ts
│   │           ├── compute.d.ts
│   │           ├── database.d.ts
│   │           └── magic-containers.d.ts
│   │
│   └── cli/                              # @bunny.net/cli package
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                  # Entry point: shebang + cli.parse()
│           ├── cli.ts                    # Root yargs instance, global flags, command registration
│           │
│           ├── core/
│           │   ├── client-options.ts     # clientOptions() helper — builds ClientOptions from ResolvedConfig
│           │   ├── define-command.ts     # Command factory (see "Command Pattern" below)
│           │   ├── define-namespace.ts   # Namespace/group factory for subcommand trees
│           │   ├── errors.ts             # Re-exports UserError/ApiError from @bunny.net/api + ConfigError
│           │   ├── format.ts             # Shared table/key-value rendering (text, table, csv, markdown)
│           │   ├── format.test.ts        # Tests for format utilities
│           │   ├── logger.ts             # Chalk-based structured logger
│           │   ├── manifest.ts           # .bunny/ context file resolution (load, save, resolveManifestId)
│           │   ├── types.ts              # GlobalArgs, OutputFormat, and shared type definitions
│           │   ├── ui.ts                 # readPassword(), confirm(), spinner() wrappers
│           │   └── version.ts            # VERSION constant from package.json
│           │
│           ├── config/
│           │   ├── index.ts              # resolveConfig(), loadConfigFile(), setProfile(), deleteProfile(), profileExists()
│           │   ├── schema.ts             # Zod schemas for config file and profiles
│           │   └── paths.ts              # XDG-compliant config file path resolution
│           │
│           ├── commands/
│           │   ├── apps/
│           │   │   ├── index.ts          # defineNamespace("apps", ...) — registers all app commands
│           │   │   ├── constants.ts      # Status/runtime label maps
│           │   │   ├── toml.ts           # bunny.toml parse/write/convert (BunnyToml, apiToToml, tomlToApi, resolveAppId, resolveContainerId)
│           │   │   ├── docker.ts         # Docker helpers (build, push, login, generateTag, promptRegistry)
│           │   │   ├── init.ts           # Scaffold bunny.toml (detects Dockerfile, prompts for registry)
│           │   │   ├── list.ts           # List all apps
│           │   │   ├── show.ts           # Show app details and overview
│           │   │   ├── deploy.ts         # Deploy app (build from Dockerfile or use --image)
│           │   │   ├── undeploy.ts       # Undeploy app
│           │   │   ├── restart.ts        # Restart app
│           │   │   ├── delete.ts         # Delete app
│           │   │   ├── pull.ts           # Sync API → bunny.toml
│           │   │   ├── push.ts           # Sync bunny.toml → API
│           │   │   ├── accessory/
│           │   │   │   ├── index.ts      # defineNamespace("accessory", ...)
│           │   │   │   ├── list.ts       # List accessory containers
│           │   │   │   ├── start.ts      # Add container from bunny.toml + deploy
│           │   │   │   ├── stop.ts       # Remove container template
│           │   │   │   └── restart.ts    # Restart all containers
│           │   │   ├── env/
│           │   │   │   ├── index.ts      # defineNamespace("env", ...)
│           │   │   │   ├── list.ts       # List env vars per container
│           │   │   │   ├── set.ts        # Set env var (read-modify-write)
│           │   │   │   ├── remove.ts     # Remove env var
│           │   │   │   └── pull.ts       # Pull env vars to .env file
│           │   │   ├── endpoints/
│           │   │   │   ├── index.ts      # defineNamespace("endpoints", ...)
│           │   │   │   ├── list.ts       # List endpoints per container
│           │   │   │   ├── add.ts        # Add CDN or Anycast endpoint
│           │   │   │   └── remove.ts     # Remove endpoint
│           │   │   ├── volumes/
│           │   │   │   ├── index.ts      # defineNamespace("volumes", ...)
│           │   │   │   ├── list.ts       # List volumes
│           │   │   │   └── remove.ts     # Remove volume
│           │   │   ├── regions/
│           │   │   │   ├── index.ts      # defineNamespace("regions", ...)
│           │   │   │   ├── list.ts       # List available regions
│           │   │   │   └── show.ts       # Show app region settings
│           │   │   └── registry/
│           │   │       ├── index.ts      # defineNamespace("registry", ...)
│           │   │       ├── list.ts       # List container registries
│           │   │       ├── add.ts        # Add registry with credentials
│           │   │       └── remove.ts     # Remove registry
│           │   ├── auth/
│           │   │   ├── login.ts          # Browser-based OAuth login via Bun.serve() callback (top-level: bunny login)
│           │   │   └── logout.ts         # Profile removal with --force confirmation bypass (top-level: bunny logout)
│           │   ├── config/
│           │   │   ├── index.ts          # defineNamespace("config", ...) — registers init, show, profile
│           │   │   ├── init.ts           # First-time setup (delegates to profile create)
│           │   │   ├── show.ts           # Display resolved config as table or JSON
│           │   │   └── profile/
│           │   │       ├── index.ts      # defineNamespace("profile", ...) — registers create + delete
│           │   │       ├── create.ts     # Add profile with masked API key input
│           │   │       └── delete.ts     # Remove a profile
│           │   ├── whoami.ts             # Show authenticated account: name, email, profile (top-level: bunny whoami)
│           │   ├── db/
│           │   │   ├── index.ts          # defineNamespace("db", ...) — registers all database commands
│           │   │   ├── create.ts         # Create a new database (interactive region selection or flags)
│           │   │   ├── list.ts           # List all databases
│           │   │   ├── quickstart.ts     # Generate quickstart guide for connecting to a database
│           │   │   ├── resolve-db.ts     # Helper: resolve database ID from flag, .env, or interactive prompt
│           │   │   ├── shell.ts          # Interactive SQL shell (REPL, dot-commands, masking, history)
│           │   │   ├── shell.test.ts     # Tests for shell utilities (formatting, masking, history)
│           │   │   ├── usage.ts          # Show database usage statistics
│           │   │   └── tokens/
│           │   │       ├── index.ts      # defineNamespace("tokens", ...) — registers token commands
│           │   │       ├── create.ts     # Generate an auth token (read-only/full-access, optional expiry)
│           │   │       └── invalidate.ts # Invalidate all tokens for a database (with confirmation)
│           │   └── scripts/
│           │       ├── index.ts          # defineNamespace("scripts", ...) — registers all script commands
│           │       ├── constants.ts      # SCRIPT_MANIFEST, SCRIPT_TYPE_LABELS
│           │       ├── init.ts           # Scaffold a new Edge Script project from a template
│           │       ├── link.ts           # Link directory to a remote Edge Script (.bunny/script.json)
│           │       ├── list.ts           # List all Edge Scripts (Standalone + Middleware)
│           │       └── show.ts           # Show Edge Script details (supports manifest fallback)
│           │
│           └── utils/                    # Shared utility functions
│
├── package.json                          # Workspace root (workspaces: ["packages/*"])
├── tsconfig.json                         # Base TypeScript config (extended by packages)
├── AGENTS.md                             # This file
└── bun.lock
```

### Conventions

- **Monorepo with Bun workspaces.** `packages/api/` is the standalone API client SDK; `packages/cli/` is the CLI.
- **API clients use `ClientOptions`** — an options object with `apiKey`, `baseUrl`, `verbose`, `userAgent`, and `onDebug`. The CLI provides a `clientOptions(config, verbose)` helper to build this from `ResolvedConfig`.
- **One command per file.** Each file in `commands/` exports a single command or namespace.
- **Commands are grouped by domain** in subdirectories (`config/`, `db/`, `scripts/`).
- **Namespaces are directories** with an `index.ts` that calls `defineNamespace()`.
- **Leaf commands** are individual `.ts` files that call `defineCommand()`.
- **Top-level commands** (`login`, `logout`, `whoami`) are registered directly in `cli.ts` without a namespace.
- **Shared internal code lives in `packages/cli/src/core/`** — command factories, errors, logger, format utilities, UI helpers, and shared types. Keep this flat (no nested subdirectories).
- **Config logic lives in `packages/cli/src/config/`** — schema, file resolution, and profile management.
- **Error classes are split.** `UserError` and `ApiError` live in `@bunny.net/api` (the SDK needs them). `ConfigError` lives in the CLI and extends `UserError`. The CLI's `errors.ts` re-exports `UserError` and `ApiError` from `@bunny.net/api`.
- **Import API clients from `@bunny.net/api`**, not relative paths. Import generated types from `@bunny.net/api/generated/<spec>.d.ts`.

---

## Command Pattern

Every command is defined through one of two factory functions. These enforce consistent structure, error handling, and lifecycle hooks across all commands.

### `defineCommand<A>(def)`

The primary factory. Equivalent to Cobra's `cobra.Command{}` struct:

```typescript
import { defineCommand } from "../../core/define-command";

export const myCommand = defineCommand<{ env: string; dryRun: boolean }>({
  command: "deploy",
  aliases: ["d"],
  describe: "Deploy your project.",

  builder: (yargs) =>
    yargs
      .option("env", { alias: "e", type: "string", default: "production" })
      .option("dry-run", { type: "boolean", default: false }),

  // Optional: runs before handler. Use for validation. (Cobra's PreRunE)
  preRun: async (args) => {
    if (!args.env) throw new UserError("--env is required");
  },

  // Main handler
  handler: async ({ env, dryRun, profile, verbose }) => {
    // profile, verbose, output are always available (global flags)
  },

  // Optional: runs after handler. Use for cleanup. (Cobra's PostRunE)
  postRun: async (args) => {},
});
```

The factory wraps every handler in a try/catch that distinguishes `UserError` (clean message + exit 1) from unexpected errors (stack trace in verbose mode + exit 2).

### `defineNamespace(command, describe, subcommands)`

Groups subcommands under a parent. Equivalent to a Cobra command that only calls `cmd.Usage()`.

```typescript
import { defineNamespace } from "../../core/define-namespace";
import { dbListCommand } from "./list";
import { dbCreateCommand } from "./create";

export const dbNamespace = defineNamespace("db", "Manage databases.", [
  dbListCommand,
  dbCreateCommand,
]);
```

Namespaces automatically enforce `demandCommand(1)` so that running `bunny db` without a subcommand shows help.

---

## Global Flags

Registered on the root yargs instance in `cli.ts` with `global: true` (equivalent to Cobra's `PersistentFlags()`). Available to every command handler via the args object.

| Flag        | Alias | Type      | Default     | Description                                               |
| ----------- | ----- | --------- | ----------- | --------------------------------------------------------- |
| `--profile` | `-p`  | `string`  | `"default"` | Configuration profile to use                              |
| `--verbose` | `-v`  | `boolean` | `false`     | Enable verbose/debug output                               |
| `--output`  | `-o`  | `string`  | `"text"`    | Output format: `text`, `json`, `table`, `csv`, `markdown` |
| `--api-key` |       | `string`  |             | API key (takes priority over profile and environment)     |

### Yargs behavior flags

These are configured on the root yargs instance:

- **`demandCommand(1)`** — Requires a subcommand; shows help if none provided.
- **`recommendCommands()`** — "Did you mean ...?" suggestions on typos (like Cobra).
- **`strict()`** — Errors on unrecognized flags.
- **`.version()`** — Reads from `package.json`.
- **`.help()`** — Auto-generated help for all commands.

---

## Configuration System

### Config file format

A single JSON file stores profiles and settings. This matches the existing Go CLI format for backward compatibility.

```json
{
  "log_level": "info",
  "profiles": {
    "default": {
      "api_key": "bny_xxxxxxxxxxxx",
      "api_url": "https://api.bunny.net"
    },
    "staging": {
      "api_key": "bny_test_xxxxxxx",
      "api_url": "https://staging-api.bunny.net"
    }
  }
}
```

### Schema

Defined in `packages/cli/src/config/schema.ts` using Zod:

```typescript
const ProfileSchema = z.object({
  api_key: z.string(),
  api_url: z.string().optional(), // defaults to https://api.bunny.net
});

const ConfigFileSchema = z.object({
  log_level: z.string().optional(),
  profiles: z.record(z.string(), ProfileSchema).default({}),
});
```

### Config file resolution

Searches in order (first match wins), matching the Go CLI's `getFileCandidates()`:

1. `$XDG_CONFIG_HOME/bunnynet.json`
2. `~/.config/bunnynet.json`
3. `~/.bunnynet.json`
4. `/etc/bunnynet.json`

When writing a new config, the CLI uses the first existing file path, or falls back to the first candidate (`$XDG_CONFIG_HOME` or `~/.config/bunnynet.json`).

Config files are written with permissions `0o660`.

### Config resolution precedence

When resolving the active configuration (in `resolveConfig(profile, apiKeyOverride?)`), the following priority applies — highest wins:

1. **`--api-key` flag** — Passed as `apiKeyOverride` to `resolveConfig()`
2. **Environment variables** — `BUNNYNET_API_KEY` and `BUNNYNET_API_URL`
3. **Config file profile** — Matched by the `--profile` flag value
4. **Built-in defaults** — `apiUrl: "https://api.bunny.net"`, empty `apiKey`

If `--api-key` or `BUNNYNET_API_KEY` is set, the config file is ignored entirely and the profile field is set to `""`.

If the requested profile does not exist and is not `"default"`, `resolveConfig()` throws an error.

### Environment variables

| Variable                 | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `BUNNYNET_API_KEY`       | API key. Overrides any profile-based key.                                  |
| `BUNNYNET_API_URL`       | API base URL. Defaults to `https://api.bunny.net`.                         |
| `BUNNYNET_DASHBOARD_URL` | Dashboard URL for browser auth flow. Defaults to `https://dash.bunny.net`. |
| `NO_COLOR`               | Disable colored output (see [no-color.org](https://no-color.org)).         |

---

## Authentication

### Browser login flow (`bunny login`)

This is an OAuth-style flow using a local HTTP callback server. It is a direct port of the Go CLI's implementation.

**Flow:**

1. Generate a random 16-byte hex state token (CSRF protection).
2. Start a local HTTP server on a random port (`Bun.serve({ port: 0 })`).
3. Construct the auth URL: `{DASHBOARD_URL}/auth/login?source=cli&domain=localhost&callbackUrl={encodedCallbackUrl}`.
4. Open the URL in the user's default browser via `Bun.spawn()` (platform-detected: `open` on macOS, `xdg-open` on Linux, `rundll32` on Windows).
5. Print the URL to the terminal as a fallback.
6. Wait for the callback with a 5-minute timeout.
7. On callback, validate the state parameter and extract the `apiKey` query param.
8. Serve an embedded HTML success page to the browser.
9. Save the API key to the profile via `setProfile()`.
10. Shut down the local server.

**Error cases:**

- State mismatch → reject with CSRF error.
- Missing apiKey in callback → reject.
- 5-minute timeout → exit with timeout error.
- Profile already exists → prompt for confirmation (bypass with `--force`).

**Success page:**

An HTML page is embedded as a template literal string in `login.ts` (equivalent to Go's `//go:embed success.html`). It shows a card with "Authenticated!" and a message to close the tab. Styled with the bunny.net brand gradient (`#e1f2ff → #fff`).

### Logout flow (`bunny logout`)

1. Check that the profile exists via `profileExists()`. If not, throw `UserError`.
2. Prompt for confirmation (bypass with `--force`).
3. Delete the profile via `deleteProfile()`.

### Profile management

- **`bunny config profile create <name>`** (alias: `add`) — Prompts for API key with masked input, saves to config file.
- **`bunny config profile delete <name>`** — Removes profile from config file.
- **`bunny config init`** — Convenience command that delegates to profile create for the active profile.
- **`bunny config show`** — Displays resolved config as a table (or JSON with `--output json`). API key is truncated in table view.

---

## UI Helpers

Defined in `packages/cli/src/core/ui.ts`. These wrap third-party libraries with consistent behavior.

### `readPassword(message: string): Promise<string>`

Masked password input using `prompts` with `type: "password"`. Used for API key entry.

### `confirm(message: string, opts?: { force?: boolean }): Promise<boolean>`

Confirmation prompt using `prompts` with `type: "confirm"`. If `opts.force` is `true`, returns `true` immediately without prompting. This maps to the `--force` flag pattern used in `auth login` and `auth logout`.

### `spinner(text: string): ora.Ora`

Creates an `ora` spinner. Automatically silenced in non-TTY environments (`isSilent: !process.stdout.isTTY`).

---

## Error Handling

### Error classes

- **`UserError`** — Expected errors caused by user input or missing configuration. Displayed as a clean message with an optional hint. Exit code 1.
- **`ConfigError`** — Extends `UserError`. Automatically includes a hint to run `bunny config show`.
- **`ApiError`** — Extends `UserError`. Thrown by the API middleware for HTTP error responses. Carries `status`, optional `field`, and optional `validationErrors[]`.

### API error normalization

The Bunny APIs use two different error response formats. The shared `authMiddleware()` in `packages/api/src/middleware.ts` normalizes both into `ApiError` via an `onResponse` handler, so command code never deals with raw HTTP errors.

| API              | Error schema              | Fields                                                                              |
| ---------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| Core + Compute   | `ApiErrorData`            | `ErrorKey`, `Field`, `Message` (all optional, nullable)                             |
| Magic Containers | `ErrorDetails` (RFC 7807) | `title`, `status`, `detail`, `instance`, `errors[]` (with nested `ValidationError`) |

The middleware detects the shape and maps it:

- **RFC 7807** (`title`/`detail`) → `ApiError(detail \|\| title, status, undefined, errors)`
- **ApiErrorData** (`Message`) → `ApiError(Message, status, Field)`
- **Empty body** (Core/Compute 401/404/500) → `ApiError` with a sensible default message per status code

### Error flow

The `defineCommand()` factory wraps every handler:

```
try {
  preRun() → handler() → postRun()
} catch (err) {
  if --output json → JSON error payload to stdout, exit 1 or 2
  if ApiError with validationErrors → log message + each field error, exit 1
  if UserError  → log error message + hint, exit 1
  if unexpected → log "An unexpected error occurred", show stack trace if --verbose, exit 2
}
```

With `--output json`, error payloads include all available context:

```json
{
  "error": "Validation failed.",
  "status": 400,
  "field": "Name",
  "validationErrors": [{ "field": "Name", "message": "Name is required." }]
}
```

### Exit codes

| Code | Meaning                                           |
| ---- | ------------------------------------------------- |
| 0    | Success                                           |
| 1    | User error (bad input, missing config, API error) |
| 2    | Unexpected/internal error                         |

---

## Logger

Defined in `packages/cli/src/core/logger.ts`. Uses `chalk` for styling.

| Method                       | Prefix           | Use                                 |
| ---------------------------- | ---------------- | ----------------------------------- |
| `logger.info(msg)`           | `ℹ` (blue)       | Informational messages              |
| `logger.success(msg)`        | `✓` (green)      | Successful operations               |
| `logger.warn(msg)`           | `⚠` (yellow)     | Warnings                            |
| `logger.error(msg)`          | `✖` (red)        | Errors                              |
| `logger.dim(msg)`            | — (gray)         | Hints, secondary info               |
| `logger.debug(msg, verbose)` | `[debug]` (gray) | Only shown when `verbose` is `true` |

### NO_COLOR support

The CLI respects the [NO_COLOR](https://no-color.org) standard. When `NO_COLOR` is set (any non-empty value), all ANSI color codes are suppressed:

- **chalk** — Natively respects `NO_COLOR` by setting `chalk.level` to `0`.
- **cli-table3** — Has its own built-in ANSI coloring for headers and borders. Disabled by passing `style: { head: [], border: [] }` when `chalk.level === 0`. This is handled in `format.ts` and `shell.ts`.
- **ora** — Uses chalk internally, so spinners are also affected.

---

## Output Format System

Defined in `packages/cli/src/core/format.ts`. Provides shared rendering for tabular and key-value data across all output formats.

### `OutputFormat` type

```typescript
type OutputFormat = "text" | "json" | "table" | "csv" | "markdown";
```

### Core functions

| Function                             | Purpose                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `formatTable(headers, rows, format)` | Render tabular data. Handles `text`, `table`, `csv`, `markdown`. |
| `formatKeyValue(entries, format)`    | Render key-value pairs as a 2-column table via `formatTable`.    |
| `csvEscape(value)`                   | Escape a value for CSV (handles commas, quotes, newlines).       |

### Format behavior

| Format     | Renderer                                  | Notes                                |
| ---------- | ----------------------------------------- | ------------------------------------ |
| `text`     | Borderless `cli-table3` with bold headers | Default human-friendly output        |
| `table`    | Bordered `cli-table3`                     | Standard box-drawing table           |
| `csv`      | String concatenation with `csvEscape()`   | Header row + data rows               |
| `markdown` | String concatenation with pipe escaping   | GFM pipe tables                      |
| `json`     | Not handled by format functions           | Each command serializes its own JSON |

Commands should handle `json` first (early return), then pass `output` to `formatTable` or `formatKeyValue` for all other formats.

---

## Build & Distribution

### Development

```bash
bun run packages/cli/src/index.ts <command>     # Run directly
bun --watch packages/cli/src/index.ts           # Watch mode
bun link                           # Make `bunny` globally available
bun test                           # Run tests
tsc --noEmit                       # Type-check only
```

### Production build

```bash
bun build packages/cli/src/index.ts --compile --outfile bunny
```

Produces a single native executable containing the Bun runtime, all npm dependencies, and all source code. No runtime dependencies required on the target machine.

### Cross-compilation

```bash
bun build packages/cli/src/index.ts --compile --target=bun-linux-x64 --outfile bunny-linux-x64
bun build packages/cli/src/index.ts --compile --target=bun-linux-arm64 --outfile bunny-linux-arm64
bun build packages/cli/src/index.ts --compile --target=bun-darwin-x64 --outfile bunny-darwin-x64
bun build packages/cli/src/index.ts --compile --target=bun-darwin-arm64 --outfile bunny-darwin-arm64
bun build packages/cli/src/index.ts --compile --target=bun-windows-x64 --outfile bunny-windows-x64.exe
```

---

## Command Reference

```
bunny
├── login              [--force]            Authenticate via browser OAuth flow
├── logout             [--force]            Remove stored authentication profile
├── whoami                                  Show authenticated account (name, email, profile)
├── config
│   ├── init            [--api-key]         Initialize config (create default profile)
│   ├── show                                Display resolved configuration
│   └── profile
│       ├── create <name>  (alias: add)     Create a named profile with API key
│       └── delete <name>                   Delete a named profile
├── apps
│   ├── init            [--name] [--runtime] [--image]
│   │                                       Scaffold bunny.toml (detects Dockerfile)
│   ├── list            (alias: ls)         List all apps
│   ├── show            [--id]              Show app details and overview
│   ├── deploy          [--image]           Build + deploy (or deploy pre-built image)
│   ├── undeploy        [--id] [--force]    Undeploy an app
│   ├── restart         [--id]              Restart an app
│   ├── delete          [--id] [--force]    Delete an app
│   ├── pull            [--id] [--force]    Sync remote config to bunny.toml
│   ├── push            [--id] [--dry-run]  Apply bunny.toml to remote
│   ├── accessory
│   │   ├── list        [--id]              List accessory containers
│   │   ├── start       <name|all> [--id]   Start accessory from bunny.toml
│   │   ├── stop        <name|all> [--force] Stop accessory container
│   │   └── restart     [name] [--id]       Restart containers
│   ├── env
│   │   ├── list        [--container]       List environment variables
│   │   ├── set         <key> <value> [--container]  Set environment variable
│   │   ├── remove      <key> [--container] Remove environment variable
│   │   └── pull        [--container] [--force]      Pull env vars to .env
│   ├── endpoints
│   │   ├── list        [--container]       List endpoints
│   │   ├── add         [--container] [--type] [--ssl]  Add endpoint
│   │   └── remove      <id> [--force]      Remove endpoint
│   ├── volumes
│   │   ├── list                            List volumes
│   │   └── remove      <id> [--force]      Remove volume
│   ├── regions
│   │   ├── list        (alias: ls)         List available regions
│   │   └── show        [id]                Show app region settings
│   └── registry
│       ├── list        (alias: ls)         List container registries
│       ├── add         [--name] [--username] Add registry
│       └── remove      <id>                Remove registry
├── db
│   ├── create          [--name] [--primary] [--replicas] [--storage-region]
│   │                                       Create a new database
│   ├── list            (alias: ls) [--group-id]
│   │                                       List all databases
│   ├── quickstart      [database-id] [--lang] [--url] [--token]
│   │                                       Generate quickstart guide for a database
│   ├── shell           [database-id] [query] [-e] [-m] [--unmask] [--url] [--token]
│   │                                       Interactive SQL shell with dot-commands
│   ├── usage           [database-id] [--period] [--from] [--to]
│   │                                       Show database usage statistics
│   └── tokens
│       ├── create      [database-id] [--read-only] [--expiry]
│       │                                   Generate an auth token
│       └── invalidate  [database-id] [--force]   Invalidate all tokens for a database
├── scripts
│   ├── init            [--name] [--type] [--template] [--deploy] [--skip-git] [--skip-install]
│   │                                       Create a new Edge Script project from a template
│   ├── link            [--id]              Link directory to a remote Edge Script
│   ├── list            (alias: ls)         List all Edge Scripts
│   └── show            [id]                Show Edge Script details (uses linked script if omitted)
├── --profile, -p       <string>            Profile to use (default: "default")
├── --verbose, -v       <boolean>           Enable verbose output
├── --output, -o        <text|json|table|csv|markdown>  Output format (default: "text")
├── --api-key           <string>            API key (takes priority over profile and env)
├── --version                               Show version
└── --help                                  Show help
```

---

## API Clients

### Overview

API calls use `openapi-fetch` with types generated from OpenAPI specs by `openapi-typescript`. This gives full type safety — paths, params, request bodies, and responses are all inferred from the specs.

### API domains

| Client                   | Factory                 | Base URL                         | Auth                |
| ------------------------ | ----------------------- | -------------------------------- | ------------------- |
| Core API                 | `createCoreClient()`    | `https://api.bunny.net`          | Account `AccessKey` |
| Edge Scripting (Compute) | `createComputeClient()` | `https://api.bunny.net`          | Account `AccessKey` |
| Database                 | `createDbClient()`      | `https://api.bunny.net/database` | Account `AccessKey` |
| Magic Containers         | `createMcClient()`      | `https://api.bunny.net/mc`       | Account `AccessKey` |

All clients accept a `ClientOptions` object and inject `AccessKey` and `User-Agent` headers via shared `authMiddleware()` in `packages/api/src/middleware.ts`.

### ClientOptions

All client factories accept a single options object:

```typescript
interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  verbose?: boolean;
  userAgent?: string; // defaults to "bunnynet-api"
  onDebug?: (msg: string) => void; // no-op if not provided
}
```

The CLI provides a `clientOptions()` helper (`packages/cli/src/core/client-options.ts`) that builds this from `ResolvedConfig`, injecting the CLI version as `userAgent` and `logger.debug` as `onDebug`.

### Undocumented endpoints (`CustomPaths`)

Some Bunny API endpoints are not included in the public OpenAPI specs. These are typed manually via a `CustomPaths` type in `packages/api/src/core-client.ts`, which is intersected with the generated `paths`:

```typescript
const client = createClient<paths & CustomPaths>({ baseUrl });
```

Only type the fields you actually use. When the endpoint is added to the spec, remove it from `CustomPaths`.

### Type conventions

Prefer generated schema types over inline primitives. When you need a subset of fields from a generated type, use `Pick<>`:

```typescript
// Good — derived from generated schema
type Database = Pick<components["schemas"]["Database2"], "id" | "name" | "url">;

// Bad — inline primitives that duplicate the schema
type Database = { id: string; name: string; url: string };
```

Only fall back to `string`, `any`, or `number` when no generated type exists (e.g. `CustomPaths` for undocumented endpoints).

### OpenAPI specs

Specs are committed as JSON files in `packages/api/specs/`. Generated types go to `packages/api/src/generated/` (gitignored). The `redocly.yaml` config and `openapi-typescript` devDependency live in the `@bunny.net/api` package.

| Spec file                                  | Source URL                                                    |
| ------------------------------------------ | ------------------------------------------------------------- |
| `packages/api/specs/core.json`             | `https://core-api-public-docs.b-cdn.net/docs/v3/public.json`  |
| `packages/api/specs/compute.json`          | `https://core-api-public-docs.b-cdn.net/docs/v3/compute.json` |
| `packages/api/specs/database.json`         | `https://api.bunny.net/database/docs/private/api.json`        |
| `packages/api/specs/magic-containers.json` | `https://api-mc.opsbunny.net/docs/public/swagger.json`        |

To regenerate types after updating specs:

```bash
bun run api:generate          # from root (delegates to @bunny.net/api)
# or
cd packages/api && bun run generate
```

This reads `packages/api/redocly.yaml` and outputs `.d.ts` files to `packages/api/src/generated/`.

### Usage in commands

```typescript
import { createCoreClient } from "@bunny.net/api";
import { resolveConfig } from "../../config/index.ts";
import { clientOptions } from "../../core/client-options.ts";

handler: async ({ profile, apiKey, verbose }) => {
  const config = resolveConfig(profile, apiKey);
  const api = createCoreClient(clientOptions(config, verbose));

  const { data, error } = await api.GET("/pullzone/{id}", {
    params: { path: { id: 12345 } },
  });
};
```

### Adding a new API

1. Add the spec JSON to `packages/api/specs/`.
2. Add an entry to `packages/api/redocly.yaml`.
3. Run `bun run api:generate`.
4. Create a client factory in `packages/api/src/` following the existing pattern and export it from `packages/api/src/index.ts`.

---

## Agent & Scripting Compatibility

The CLI is designed to be fully usable by AI agents, scripts, and pipelines — not just humans.

### Non-interactive by default

Every command must be runnable without interactive prompts when the right flags are provided:

- **Every prompt has a flag equivalent.** If a command prompts for input (API key, confirmation, name), there must be a flag that provides the value and skips the prompt entirely.
  - Confirmation prompts → `--force` flag
  - Text/password input → named flag (e.g. `--api-key`)
- **Never block on stdin.** If a required value is missing and no prompt flag was given, error immediately — don't hang waiting for input that will never come.

Examples of non-interactive usage:

```bash
# Agent sets up auth without any prompts
bunny config init --api-key bny_xxxxxxxxxxxx

# Agent creates a named profile
bunny config profile create staging --api-key bny_xxxxxxxxxxxx

# Agent removes a profile without confirmation
bunny logout --force

# Agent uses a specific API key without login
bunny db list --api-key bny_xxxxxxxxxxxx
```

### Structured JSON output

When `--output json` is set:

- **Success responses** must be valid JSON written to stdout. One JSON object or array per command.
- **Error responses** are also JSON: `{ "error": "message", "hint": "optional" }`. This is handled automatically by `defineCommand()`.
- **No decorative output.** No spinner text, no chalk colors, no tables, no blank lines. Only the JSON payload.
- **Exit codes still apply.** `0` = success, `1` = user error, `2` = unexpected error. Agents check both the JSON and the exit code.

### Conventions for new commands

When adding any command that displays data, always handle `json` separately and use the shared rendering layer for all other formats:

```typescript
import { formatTable, formatKeyValue } from "../../core/format.ts";

handler: async ({ output, profile, apiKey }) => {
  const result = await fetchSomething();

  if (output === "json") {
    logger.log(JSON.stringify(result));
    return;
  }

  // Tabular data — formatTable handles text, table, csv, markdown
  logger.log(formatTable(["Name", "Status"], rows, output));

  // Key-value data — formatKeyValue renders as a 2-column table
  logger.log(formatKeyValue([{ key: "Name", value: "Alice" }], output));
};
```

---

## Local Context (`.bunny/` Manifest)

### Overview

Commands that operate on a specific remote resource (e.g. a script, an app) can resolve the resource ID from a local context file instead of requiring it as a flag every time. This is similar to `.vercel/project.json`.

### How it works

- **`.bunny/script.json`** (gitignored) — links the current directory to a remote Edge Script.
- The manifest is machine-managed: written by `bunny scripts link`, read by other script commands.
- `resolveManifestId()` in `packages/cli/src/core/manifest.ts` handles the resolution: explicit ID flag → manifest file → error with hint.
- `findRoot()` walks up the directory tree to find `.bunny/`, so it works from subdirectories.

### Manifest format

```json
{
  "id": 12345,
  "name": "my-script",
  "scriptType": 1
}
```

### Resolution order for resource IDs

Commands that need a resource ID follow this pattern:

1. **Explicit positional or flag** — `bunny scripts show 12345` or `--script-id 12345`
2. **Manifest file** — `.bunny/script.json` in the current or ancestor directory
3. **Error** — `UserError` with a hint to run `bunny scripts link`

### Adding new resource types

The manifest system is generic. To add a new resource type (e.g. containers):

1. Define a `CONTAINER_MANIFEST = "container.json"` constant.
2. Use `resolveManifestId(CONTAINER_MANIFEST, id, "container")` in commands.
3. Create a `link` command that saves the manifest via `saveManifest()`.

### Database ID resolution from `.env`

Database token commands (`db tokens create`, `db tokens invalidate`) can auto-resolve the database ID from a `BUNNY_DATABASE_URL` environment variable found in a `.env` file. This is implemented in `packages/cli/src/commands/db/resolve-db.ts`.

**Resolution order:**

1. Explicit positional argument — `bunny db tokens create db_01KCHBG8...`
2. `BUNNY_DATABASE_URL` in `.env` — walks up the directory tree, parses the URL, matches it against the database list via API
3. Interactive prompt — fetches all databases and presents a select menu
4. If no databases exist — `UserError` with hint to run `bunny db create`

The URL (e.g. `libsql://...bunnydb.net/`) does not directly contain the `db_id`. The resolver fetches the database list and matches by URL to find the corresponding `db_id`.

This pattern is separate from the `.bunny/` manifest system because databases are typically consumed via environment variables (e.g. in a `.env` file alongside an ORM), not linked to directories.

### Future: `bunny.toml` (not yet implemented)

The `.bunny/` manifest and a potential `bunny.toml` serve different purposes:

| Concern   | `.bunny/script.json`                 | `bunny.toml` (future)                               |
| --------- | ------------------------------------ | --------------------------------------------------- |
| Purpose   | Link directory to remote resource ID | Project config: entry point, build, deploy settings |
| Author    | Machine (written by `link` command)  | Human (edited by developer)                         |
| Committed | No (gitignored)                      | Yes                                                 |
| Shared    | No (per-developer)                   | Yes (team-wide)                                     |

When `bunny.toml` is added, script type should be detected automatically from code exports (e.g. `fetch(req)` vs `fetch(req, next)`) rather than configured, to avoid drift.

---

## Database Shell (`bunny db shell`)

### Overview

The database shell is an interactive SQL REPL that connects to a bunny.net database via `@libsql/client`. It supports both interactive mode (readline-based REPL) and non-interactive mode (execute a query and exit).

### Architecture

The shell is implemented in `packages/cli/src/commands/db/shell.ts` as a single `defineCommand()`. Key components:

- **Credential resolution** — Checks `--url`/`--token` flags, then `BUNNY_DATABASE_URL`/`BUNNY_DATABASE_AUTH_TOKEN` from `.env`, then resolves via the API.
- **REPL loop** — Uses `node:readline` with multi-line SQL support (accumulates lines until `;` terminator).
- **Dot-commands** — `.tables`, `.schema`, `.describe`, `.indexes`, `.count`, `.size`, `.dump`, `.read`, `.mode`, `.timing`, `.mask`, `.unmask`, `.clear-history`, `.help`, `.quit`.
- **Output modes** — `default` (borderless aligned), `table` (bordered), `json`, `csv`, `markdown` (GFM pipe tables). Controlled by `--mode` flag or `.mode` command. The global `--output` flag maps to the corresponding shell mode; explicit `--mode` takes priority.
- **Sensitive column masking** — Two-tier system: `"full"` mask for passwords/secrets/tokens (`********`) and `"email"` mask for email columns (`a••••e@example.com`). Controlled by `--unmask` flag or `.mask`/`.unmask` commands.
- **History persistence** — Stored at `~/.config/bunny/shell_history` (respects `XDG_CONFIG_HOME`). Max 1000 entries. Loaded on start, saved on close.
- **Query timing** — Client-side `performance.now()` measurement, toggled with `.timing`.

### REPL state

```typescript
{
  mode: PrintMode;
  masked: boolean;
  timing: boolean;
}
```

### Exported internals (for testing)

The following functions are exported with `/** @internal */` comments for use in `shell.test.ts`:

- `formatValue`, `formatValueRaw` — Value formatting for display
- `printResultSet` — Result rendering across all 5 modes
- `isSensitiveColumn`, `columnMaskType`, `maskEmail` — Masking detection and application
- `getHistoryPath`, `loadHistory`, `saveHistory` — History persistence
- `splitStatements` — SQL file parsing (split on `;`, trim, filter empties)
- `PrintMode` type

### Read quota protection

Dot-commands that perform full table scans (`.count`, `.size`, `.dump`) warn the user and require confirmation via `confirmReadQuota()` before executing, since reads count against the database quota.

### Non-interactive mode

SQL can be passed as a positional argument or via `--execute`/`-e`. Smart detection: if the first positional doesn't start with `db_`, it's treated as the query rather than a database ID.

If the value ends with `.sql` and the file exists, statements are read from the file instead — split on `;` and executed sequentially. Execution stops on the first error.

```bash
bunny db shell "SELECT * FROM users"
bunny db shell db_01ABC "SELECT * FROM users"
bunny db shell -e "SELECT * FROM users" -m json
bunny db shell -e seed.sql
bunny db shell seed.sql
```

---

## Conventions for Adding New Commands

1. Create a new directory under `packages/cli/src/commands/` for the domain (e.g., `packages/cli/src/commands/deploy/`).
2. Create `index.ts` using `defineCommand()` for leaf commands or `defineNamespace()` for groups.
3. Use `builder` to define command-specific flags. Use positionals for required arguments (`command: "create <name>"`).
4. **Add flag equivalents for every interactive prompt** so the command is fully scriptable (see "Agent & Scripting Compatibility").
5. Use `preRun` for validation that should prevent execution.
6. Access global flags (`profile`, `verbose`, `output`) directly from the args object.
7. Resolve config via `resolveConfig(args.profile, args.apiKey)` when API access is needed.
8. Use `logger` for all output. **Every command that returns data must support `--output json`.**
9. Throw `UserError` for expected failures. Let unexpected errors propagate to the factory's catch block.
10. Register the new command/namespace in `packages/cli/src/cli.ts`.
