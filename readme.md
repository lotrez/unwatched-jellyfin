# unwatched-jellyfin

A CLI tool to identify and optionally delete old, unwatched TV series from Sonarr based on Jellyfin playback data.

## Features

- Identifies series with 0% watched episodes older than a threshold (default: 365 days)
- Calculates disk space that would be freed
- Deletes episode files from Sonarr (not entire series)
- Unmonitors series to prevent re-downloading
- Dry-run mode for safe testing

## Installation

```bash
bun install
```

## Usage

### Using bun run:

```bash
# Dry run (default) - shows what would be deleted
bun run index.ts

# Show help
bun run index.ts --help

# Execute deletions with custom age threshold
bun run index.ts --days=180 --execute

# Override server URLs
bun run index.ts --sonarr-url=http://localhost:8989 --jellyfin-url=http://localhost:8096 --days=365 --dry-run
```

### Using npx:

```bash
npx unwatched-jellyfin --help
npx unwatched-jellyfin --days=365 --dry-run
npx unwatched-jellyfin --days=180 --execute
```

## CLI Options

- `--sonarr-url <url>` - Sonarr server URL (default: SONARR_URL env var)
- `--sonarr-api-key <key>` - Sonarr API key (default: SONARR_API_KEY env var)
- `--jellyfin-url <url>` - Jellyfin server URL (default: JELLYFIN_URL env var)
- `--jellyfin-username <user>` - Jellyfin username (default: JELLYFIN_USERNAME env var)
- `--jellyfin-password <pass>` - Jellyfin password (default: JELLYFIN_PASSWORD env var)
- `--days <number>` - Age threshold in days (default: 365)
- `--dry-run, -d` - Dry run mode (default)
- `--execute, -e` - Execute deletions (not dry run)
- `--help, -h` - Show help message

## Environment Variables

All sensitive credentials can be set via environment variables (see `.env.example` for template):

- `SONARR_URL` - Sonarr server URL
- `SONARR_API_KEY` - Sonarr API key
- `JELLYFIN_URL` - Jellyfin server URL
- `JELLYFIN_USERNAME` - Jellyfin username
- `JELLYFIN_PASSWORD` - Jellyfin password
- `AGE_THRESHOLD_DAYS` - Age threshold in days (default: 365)
- `DRY_RUN` - Set to "false" to execute deletions (default: "true")

## How It Works

1. Authenticates with Jellyfin to fetch all episodes and their watch status
2. Groups episodes by series to identify fully unwatched series (0% watched)
3. Filters series where the oldest episode is older than the threshold
4. Cross-references with Sonarr to find matching series
5. Calculates disk space to be freed
6. If not dry-run: deletes all episode files and unmonitors each series

## Requirements

- Bun runtime
- Jellyfin server with Playback Reporting plugin (or standard API)
- Sonarr server

## License

MIT
