import { JellyfinClient } from "./jellyfin-client";
import { SonarrClient } from "./sonarr-client";

const AGE_THRESHOLD_DAYS = parseInt(process.env.AGE_THRESHOLD_DAYS || "365", 10);
const DRY_RUN = process.env.DRY_RUN !== "false";

function isOlderThan(dateStr: string, days: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > days;
}

async function main() {
  console.log("Starting unwatched media cleanup...");

  const jellyfin = new JellyfinClient();
  const sonarr = new SonarrClient();

  console.log("Authenticating with Jellyfin...");
  await jellyfin.authenticate();
  console.log("Authenticated successfully");

  console.log("Fetching all episodes from Jellyfin...");
  const allEpisodes = await jellyfin.getAllEpisodes();
  console.log(`Found ${allEpisodes.length} total episodes`);

  const watchedEpisodes = allEpisodes.filter((ep) => ep.played);
  console.log(`Found ${watchedEpisodes.length} watched episodes`);

  const unwatchedEpisodes = allEpisodes.filter((ep) => !ep.played);
  console.log(`Found ${unwatchedEpisodes.length} unwatched episodes`);

  console.log("Grouping episodes by series...");
  const seriesMap = new Map<string, typeof allEpisodes>();

  for (const ep of allEpisodes) {
    if (!ep.seriesName) continue;
    if (!seriesMap.has(ep.seriesName)) {
      seriesMap.set(ep.seriesName, []);
    }
    seriesMap.get(ep.seriesName)!.push(ep);
  }

  console.log(`Found ${seriesMap.size} unique series`);

  const fullyUnwatchedSeries = [];

  for (const [seriesName, episodes] of seriesMap) {
    const watchedCount = episodes.filter((e) => e.played).length;
    if (watchedCount === 0 && episodes.length > 0) {
      const oldestEpisode = episodes.reduce((oldest, ep) =>
        ep.dateCreated < oldest.dateCreated ? ep : oldest
      );
      if (isOlderThan(oldestEpisode.dateCreated, AGE_THRESHOLD_DAYS)) {
        fullyUnwatchedSeries.push({
          seriesName,
          episodeCount: episodes.length,
          oldestDate: oldestEpisode.dateCreated,
        });
      }
    }
  }

  console.log(
    `Found ${fullyUnwatchedSeries.length} fully unwatched series (> ${AGE_THRESHOLD_DAYS} days old)`
  );

  if (fullyUnwatchedSeries.length === 0) {
    console.log("No old fully unwatched series found. Exiting.");
    return;
  }

  console.log("Fetching series from Sonarr...");
  const sonarrSeries = await sonarr.getSeries();
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

  console.log(`Found ${seriesToProcess.length} series in Sonarr that are fully unwatched and old`);

  if (seriesToProcess.length === 0) {
    console.log("No matching series found in Sonarr. Exiting.");
    return;
  }

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

  console.log(`\n=== Summary ===`);
  console.log(`Total series to unmonitor and delete files: ${actions.length}`);
  console.log(`Total files to delete: ${totalFilesToDelete}`);
  console.log(`Total disk space to free: ${totalSizeGB.toFixed(2)} GB`);

  console.log("\nSeries to process (sorted by size):");
  actions
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .forEach((action) => {
      const sizeGB = action.sizeBytes / (1024 * 1024 * 1024);
      console.log(
        `  - ${action.seriesTitle} (${action.fileCount} files, ${sizeGB.toFixed(2)} GB)`
      );
    });

  console.log("\nDry run complete. No files were deleted.");
  console.log("To actually delete files and unmonitor series, set DRY_RUN=false");

  if (!DRY_RUN) {
    console.log("\n=== Executing deletions ===");

    for (const { seriesId, seriesTitle } of actions) {
      console.log(`Processing: ${seriesTitle}`);

      const episodes = await sonarr.getEpisodesBySeriesId(seriesId);
      let deletedCount = 0;

      for (const ep of episodes) {
        if (ep.episodeFileId !== null) {
          await sonarr.deleteEpisodeFile(ep.episodeFileId);
          deletedCount++;
        }
      }

      await sonarr.updateSeries(seriesId, {
        monitored: false,
      });

      console.log(`  - Deleted ${deletedCount} files and unmonitored: ${seriesTitle}`);
    }

    console.log("\n=== Complete ===");
    console.log(`Deleted ${totalFilesToDelete} files`);
    console.log(`Freed ${totalSizeGB.toFixed(2)} GB of disk space`);
    console.log(`Unmonitored ${actions.length} series`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
