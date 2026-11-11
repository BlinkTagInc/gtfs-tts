import type { GtfsInstanceOptions, Stops } from 'gtfs';

export interface ReviewConfig {
  /** Source to review. Required when more than one source is configured. */
  readonly sourceId?: string;
  /** Import the selected schedule, or use data already in the database. */
  readonly input?: 'schedule' | 'database';
  /** Value written to tts_stop_name when pronunciation is incorrect. */
  readonly flaggedStopName?: string;
}

export type ReviewGtfsOptions = GtfsInstanceOptions & {
  readonly review?: ReviewConfig;
};

export type ReviewDecision = 'correct' | 'incorrect' | 'end';

export interface ReviewStopContext {
  readonly stop: Readonly<Stops>;
  readonly pronunciation: string;
  readonly index: number;
  readonly total: number;
}

export interface ReviewInteraction {
  /** Replaces the terminal and speech interaction. */
  readonly reviewStop: (
    context: ReviewStopContext,
  ) => ReviewDecision | Promise<ReviewDecision>;
}

export interface ReviewResult {
  readonly sourceId: string;
  readonly outputDirectory: string;
  readonly totalStops: number;
  readonly reviewedStops: number;
  /** Total marked stops in the exported source, including earlier reviews. */
  readonly flaggedStops: number;
  readonly endedEarly: boolean;
}
