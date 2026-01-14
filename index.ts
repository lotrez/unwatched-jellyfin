#!/usr/bin/env bun
import yargs from "yargs";
import { JellyfinClient } from "./jellyfin-client";
import { SonarrClient } from "./sonarr-client";
import { RadarrClient } from "./radarr-client";

const args = yargs(process.argv.slice(2))
  .option("sonarr-url", {
    type: "string",
    describe: "Sonarr server URL",
    default: process.env.SONARR_URL || "http://localhost:8989",
  })
  .option("sonarr-api-key", {
    type: "string",
    describe: "Sonarr API key",
    default: process.env.SONARR_API_KEY || "",
  })
  .option("radarr-url", {
    type: "string",
    describe: "Radarr server URL",
    default: process.env.RADARR_URL || "http://localhost:7878",
  })
  .option("radarr-api-key", {
    type: "string",
    describe: "Radarr API key",
    default: process.env.RADARR_API_KEY || "",
  })
  .option("jellyfin-url", {
    type: "string",
    describe: "Jellyfin server URL",
    default: process.env.JELLYFIN_URL || "http://localhost:8096",
  })
  .option("jellyfin-username", {
    type: "string",
    describe: "Jellyfin username",
    default: process.env.JELLYFIN_USERNAME || "",
  })
  .option("jellyfin-password", {
    type: "string",
    describe: "Jellyfin password",
    default: process.env.JELLYFIN_PASSWORD || "",
  })
  .option("days", {
    type: "number",
    describe: "Age threshold in days",
    default: parseInt(process.env.AGE_THRESHOLD_DAYS || "365", 10),
  })
  .option("dry-run", {
    type: "boolean",
    describe: "Dry run mode (no deletions)",
    alias: "d",
    default: process.env.DRY_RUN !== "false",
  })
  .option("execute", {
    type: "boolean",
    describe: "Execute deletions (not dry run)",
    alias: "e",
    default: false,
  })
  .help()
  .alias("help", "h")
  .parseSync();

function isOlderThan(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > days;
}

async function main() {
  const ageThresholdDays = args.days;
  const dryRun = args["dry-run"] && !args.execute;

  const jellyfin = new JellyfinClient(
    args["jellyfin-url"],
    args["jellyfin-username"],
    args["jellyfin-password"]
  );

  const hasSonarr = args["sonarr-api-key"] !== "";
  const hasRadarr = args["radarr-api-key"] !== "";

  if (!hasSonarr && !hasRadarr) {
    console.error("Error: Neither Sonarr nor Radarr credentials provided. Please configure at least one.");
    process.exit(1);
  }

  const sonarr = hasSonarr ? new SonarrClient(
    args["sonarr-url"],
    args["sonarr-api-key"]
  ) : null;

  const radarr = hasRadarr ? new RadarrClient(
    args["radarr-url"],
    args["radarr-api-key"]
  ) : null;

  console.log("Starting unwatched media cleanup...");
  console.log("Age threshold: " + ageThresholdDays + " days");
  console.log("Mode: " + (dryRun ? "DRY RUN" : "EXECUTE"));
  console.log("Processing: " + [hasSonarr ? "Series" : null, hasRadarr ? "Movies" : null].filter(Boolean).join(" + "));

  console.log("\nAuthenticating with Jellyfin...");
  await jellyfin.authenticate();
  console.log("Authenticated successfully");

  if (hasSonarr) {
    console.log("\n=== Processing Series ===");
    console.log("Fetching all episodes from Jellyfin...");
    const allEpisodes = await jellyfin.getAllEpisodes();
    console.log("Found " + allEpisodes.length + " total episodes");

    const watchedEpisodes = allEpisodes.filter((ep) => ep.played);
    console.log("Found " + watchedEpisodes.length + " watched episodes");

    const unwatchedEpisodes = allEpisodes.filter((ep) => !ep.played);
    console.log("Found " + unwatchedEpisodes.length + " unwatched episodes");

    console.log("\nGrouping episodes by series...");
    const seriesMap = new Map<string, typeof allEpisodes>();

    for (const ep of allEpisodes) {
      if (!ep.seriesName) continue;
      if (!seriesMap.has(ep.seriesName)) {
        seriesMap.set(ep.seriesName, []);
      }
      seriesMap.get(ep.seriesName)!.push(ep);
    }

    console.log("Found " + seriesMap.size + " unique series");

    const fullyUnwatchedSeries = [];

    for (const [seriesName, episodes] of Array.from(seriesMap.entries())) {
      const watchedCount = episodes.filter((e) => e.played).length;
      if (watchedCount === 0 && episodes.length > 0) {
        const oldestEpisode = episodes.reduce((oldest, ep) =>
          ep.dateCreated < oldest.dateCreated ? ep : oldest
        );
        if (isOlderThan(oldestEpisode.dateCreated, ageThresholdDays)) {
          fullyUnwatchedSeries.push({
            seriesName,
            episodeCount: episodes.length,
            oldestDate: oldestEpisode.dateCreated,
          });
        }
      }
    }

    console.log(
      "Found " +
        fullyUnwatchedSeries.length +
        " fully unwatched series (> " +
        ageThresholdDays +
        " days old)"
    );

    if (fullyUnwatchedSeries.length === 0) {
      console.log("No old fully unwatched series found.");
    } else {
      console.log("\nFetching series from Sonarr...");
      const sonarrSeries = await sonarr!.getSeries();
      const sonarrSeriesMap = new Map(
        sonarrSeries.map((s: any) => [s.title, s])
      );

      const seriesToProcess: Array<{
        jellyfinName: string;
        sonarrSeries: any;
        episodeCount: number;
      }> = [];

      for (const { seriesName, episodeCount } of fullyUnwatchedSeries) {
        const series = sonarrSeriesMap.get(seriesName);
        if (series) {
          seriesToProcess.push({
            jellyfinName: seriesName,
            sonarrSeries: series,
            episodeCount,
          });
        }
      }

      console.log(
        "Found " + seriesToProcess.length + " series in Sonarr that are fully unwatched and old"
      );

      if (seriesToProcess.length === 0) {
        console.log("No matching series found in Sonarr.");
      } else {
        const actions: Array<{
          seriesTitle: string;
          seriesId: number;
          fileCount: number;
          sizeBytes: number;
        }> = [];

        for (const { sonarrSeries, episodeCount } of seriesToProcess) {
          const fileCount = sonarrSeries.statistics?.episodeFileCount || 0;
          const sizeBytes = sonarrSeries.statistics?.sizeOnDisk || 0;

          actions.push({
            seriesTitle: sonarrSeries.title,
            seriesId: sonarrSeries.id,
            fileCount,
            sizeBytes,
          });
        }

        let totalFilesToDelete = actions.reduce((sum, a) => sum + a.fileCount, 0);
        let totalSizeBytes = actions.reduce((sum, a) => sum + a.sizeBytes, 0);
        const totalSizeGB = totalSizeBytes / (1024 * 1024 * 1024);

        console.log("\n=== Summary ===");
        console.log("Total series to unmonitor and delete files: " + actions.length);
        console.log("Total files to delete: " + totalFilesToDelete);
        console.log("Total disk space to free: " + totalSizeGB.toFixed(2) + " GB");

        console.log("\nSeries to process (sorted by size):");
        actions
          .sort((a, b) => b.sizeBytes - a.sizeBytes)
          .slice(0, 5)
          .forEach((action) => {
            const sizeGB = action.sizeBytes / (1024 * 1024 * 1024);
            console.log(
              "  - " + action.seriesTitle + " (" + action.fileCount + " files, " + sizeGB.toFixed(2) + " GB)"
            );
          });

        if (dryRun) {
          console.log("\nDry run complete. No files were deleted.");
          console.log("Use --execute to actually delete files and unmonitor series.");
        } else {
          console.log("\n=== Executing deletions ===");

          let totalDeleted = 0;
          let totalSkipped = 0;

          for (const { seriesId, seriesTitle, fileCount } of actions) {
            console.log("Processing: " + seriesTitle + " (" + fileCount + " files expected)");

            if (fileCount === 0) {
              console.log("  Skipping: No files to delete");
              await sonarr!.updateSeriesMonitored(seriesId, false);
              totalSkipped++;
              continue;
            }

            const episodes = await sonarr!.getEpisodesBySeriesId(seriesId);
            let deletedCount = 0;
            let skippedCount = 0;

            for (const ep of episodes) {
              if (ep.episodeFileId !== null && ep.episodeFileId !== 0) {
                try {
                  await sonarr!.deleteEpisodeFile(ep.episodeFileId);
                  deletedCount++;
                } catch (e: any) {
                  if (e.message && (e.message.includes("404") || e.message.includes("does not exist"))) {
                    console.log("    - Skipping episode file " + ep.episodeFileId + " (not found)");
                    skippedCount++;
                  } else {
                    console.log("    - Error deleting episode file " + ep.episodeFileId + ": " + e.message);
                  }
                }
              } else {
                skippedCount++;
              }
            }

            await sonarr!.updateSeriesMonitored(seriesId, false);

            console.log(
              "  - Deleted " + deletedCount + " files, skipped " + skippedCount + ", unmonitored: " + seriesTitle
            );
            totalDeleted += deletedCount;
          }

          console.log("\n=== Complete (Series) ===");
          console.log("Deleted " + totalDeleted + " files");
          console.log("Skipped " + totalSkipped + " files (not found or already deleted)");
          console.log("Unmonitored " + actions.length + " series");
        }
      }
    }
  }

  if (hasRadarr) {
    console.log("\n=== Processing Movies ===");

    console.log("Fetching all movies from Jellyfin...");
    const allMovies = await jellyfin.getAllMovies();
    console.log("Found " + allMovies.length + " total movies");

    const watchedMovies = allMovies.filter((movie) => movie.played);
    console.log("Found " + watchedMovies.length + " watched movies");

    const unwatchedMovies = allMovies.filter((movie) => !movie.played);
    console.log("Found " + unwatchedMovies.length + " unwatched movies");

    const fullyUnwatchedMovies = unwatchedMovies.filter((movie) =>
      isOlderThan(movie.dateCreated, ageThresholdDays)
    );

    console.log(
      "Found " +
        fullyUnwatchedMovies.length +
        " unwatched movies (> " +
        ageThresholdDays +
        " days old)"
    );

    if (fullyUnwatchedMovies.length === 0) {
      console.log("No old unwatched movies found.");
    } else {
      console.log("\nFetching movies from Radarr...");
      const radarrMovies = await radarr!.getMovies();
      const radarrMoviesMap = new Map(
        radarrMovies.map((m: any) => [m.title, m])
      );

      const moviesToProcess: Array<{
        jellyfinName: string;
        radarrMovie: any;
      }> = [];

      for (const movie of fullyUnwatchedMovies) {
        const radarrMovie = radarrMoviesMap.get(movie.name);
        if (radarrMovie && radarrMovie.movieFile?.id) {
          moviesToProcess.push({
            jellyfinName: movie.name,
            radarrMovie,
          });
        }
      }

      console.log(
        "Found " + moviesToProcess.length + " movies in Radarr that are unwatched and old"
      );

      if (moviesToProcess.length === 0) {
        console.log("No matching movies found in Radarr.");
      } else {
        const movieActions: Array<{
          movieTitle: string;
          movieId: number;
          movieFileId: number;
          sizeBytes: number;
        }> = [];

        for (const { radarrMovie } of moviesToProcess) {
          const movieFileId = radarrMovie.movieFile?.id || 0;
          const sizeBytes = radarrMovie.movieFile?.size || 0;

          movieActions.push({
            movieTitle: radarrMovie.title,
            movieId: radarrMovie.id,
            movieFileId,
            sizeBytes,
          });
        }

        let totalMovieFilesToDelete = movieActions.length;
        let totalMovieSizeBytes = movieActions.reduce((sum, a) => sum + a.sizeBytes, 0);
        const totalMovieSizeGB = totalMovieSizeBytes / (1024 * 1024 * 1024);

        console.log("\n=== Movie Summary ===");
        console.log("Total movies to unmonitor and delete files: " + movieActions.length);
        console.log("Total disk space to free: " + totalMovieSizeGB.toFixed(2) + " GB");

        console.log("\nMovies to process (sorted by size):");
        movieActions
          .sort((a, b) => b.sizeBytes - a.sizeBytes)
          .slice(0, 10)
          .forEach((action) => {
            const sizeGB = action.sizeBytes / (1024 * 1024 * 1024);
            console.log(
              "  - " + action.movieTitle + " (" + sizeGB.toFixed(2) + " GB)"
            );
          });

        if (dryRun) {
          console.log("\nDry run complete. No files were deleted.");
          console.log("Use --execute to actually delete files and unmonitor movies.");
        } else {
          console.log("\n=== Executing movie deletions ===");

          let totalMoviesDeleted = 0;
          let totalMoviesSkipped = 0;

          for (const { movieId, movieTitle, movieFileId } of movieActions) {
            console.log("Processing: " + movieTitle);

            if (movieFileId === 0) {
              console.log("  Skipping: No file to delete");
              await radarr!.updateMovieMonitored(movieId, false);
              totalMoviesSkipped++;
              continue;
            }

            try {
              await radarr!.deleteMovieFile(movieFileId);
              await radarr!.updateMovieMonitored(movieId, false);
              console.log("  - Deleted file and unmonitored: " + movieTitle);
              totalMoviesDeleted++;
            } catch (e: any) {
              if (e.message && (e.message.includes("404") || e.message.includes("does not exist"))) {
                console.log("  - Skipping movie " + movieTitle + " (file not found)");
                totalMoviesSkipped++;
              } else {
                console.log("  - Error deleting movie file for " + movieTitle + ": " + e.message);
              }
            }
          }

          console.log("\n=== Complete (Movies) ===");
          console.log("Deleted " + totalMoviesDeleted + " movie files");
          console.log("Skipped " + totalMoviesSkipped + " movies (not found or already deleted)");
          console.log("Unmonitored " + movieActions.length + " movies");
        }
      }
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
