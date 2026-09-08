export type ProgramEvent = 'program_viewed' | 'program_enrolled' | 'lesson_started' | 'lesson_completed' | 'program_completed' | 'search_performed';
// Aggregate in-process counters only. No user IDs, categories, search terms or
// health interests leave this boundary. A future aggregate sink can replace it.
export class ProgramAnalytics {
  private readonly totals = new Map<ProgramEvent, number>();
  record(event: ProgramEvent) { this.totals.set(event, (this.totals.get(event) ?? 0) + 1); }
  snapshot() { return Object.fromEntries(this.totals); }
}
