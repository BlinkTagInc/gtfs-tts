import { Gtfs } from 'gtfs';

import { resolveReview } from '../config/review.ts';
import type {
  ReviewGtfsOptions,
  ReviewInteraction,
  ReviewResult,
} from '../types.ts';

/** Review one source and export its GTFS files. Owned database connections always close. */
export async function reviewGtfs(
  options: ReviewGtfsOptions,
  interaction?: ReviewInteraction,
): Promise<ReviewResult> {
  const review = resolveReview(options);
  const { review: _review, ...gtfsOptions } = options;
  const gtfs = new Gtfs(gtfsOptions);
  let terminal:
    | Awaited<
        ReturnType<typeof import('./terminal.ts').createTerminalInteraction>
      >
    | undefined;
  try {
    if (interaction === undefined) {
      const { createTerminalInteraction } = await import('./terminal.ts');
      terminal = createTerminalInteraction();
      interaction = terminal;
    }
    if (review.input === 'schedule' && review.source?.schedule !== undefined) {
      const imported = await gtfs.import({
        ...(terminal === undefined ? {} : { signal: terminal.signal }),
        sources: [
          { sourceId: review.sourceId, schedule: review.source.schedule },
        ],
      });
      if (!imported.success) {
        throw new Error(
          'GTFS import failed; review was not started. Check import diagnostics.',
        );
      }
    }
    const stops = await gtfs.schedule.stops
      .where({ source_id: review.sourceId })
      .orderBy([{ field: 'stop_id' }])
      .all();
    if (stops.length === 0) {
      throw new Error(
        `No stops found for source ${JSON.stringify(review.sourceId)}`,
      );
    }
    gtfs.reporting.log({
      level: 'info',
      message: `Reviewing ${stops.length} stops from ${review.sourceId}`,
    });
    let reviewedStops = 0;
    let endedEarly = false;
    for (const [index, stop] of stops.entries()) {
      terminal?.signal.throwIfAborted();
      const existing = stop.tts_stop_name?.trim();
      const pronunciation =
        existing && existing !== review.flaggedStopName
          ? existing
          : (stop.stop_name ?? '');
      const decision = await interaction.reviewStop({
        stop,
        pronunciation,
        index,
        total: stops.length,
      });
      if (decision === 'end') {
        endedEarly = true;
        break;
      }
      if (decision !== 'correct' && decision !== 'incorrect') {
        throw new Error(`Invalid review decision: ${JSON.stringify(decision)}`);
      }
      if (
        decision === 'incorrect' ||
        stop.tts_stop_name === review.flaggedStopName
      ) {
        await gtfs.database.withKysely({
          callback: (database) =>
            database
              .updateTable('stops')
              .set({
                tts_stop_name:
                  decision === 'incorrect' ? review.flaggedStopName : null,
              })
              .where('source_id', '=', review.sourceId)
              .where('stop_id', '=', stop.stop_id)
              .execute(),
        });
      }
      reviewedStops += 1;
    }
    terminal?.signal.throwIfAborted();
    const exported = await gtfs.export({
      sourceId: review.sourceId,
      ...(terminal === undefined ? {} : { signal: terminal.signal }),
    });
    const flaggedStops = await gtfs.schedule.stops
      .where({
        source_id: review.sourceId,
        tts_stop_name: review.flaggedStopName,
      })
      .count();
    gtfs.reporting.log({
      level: 'info',
      message: `${reviewedStops} stops reviewed; ${flaggedStops} stops need pronunciation corrections. Find ${JSON.stringify(review.flaggedStopName)} in stops.txt.`,
    });
    return {
      sourceId: review.sourceId,
      outputDirectory: exported.outputDirectory,
      totalStops: stops.length,
      reviewedStops,
      flaggedStops,
      endedEarly,
    };
  } finally {
    terminal?.close();
    await gtfs.close();
  }
}
