export type JobStatus = 'queued_ideas' | 'ideas_running' | 'ideas_ready' | 'queued_mockups' | 'mockups_running' | 'done' | 'failed';
export type Category = 'top' | 'set' | 'outerwear' | 'dress' | 'skirt' | 'pants';
export const CATEGORIES: Category[] = ['top', 'set', 'outerwear', 'dress', 'skirt', 'pants'];
export type Idea = { id: string; main: string[]; small_top?: string; small_bottom?: string; evidence: string; why: string };
export type Mockup = { wording: string[]; url: string };
export type Lease = { token: string; until: number };
export type Job = {
  id: string; createdAt: string; createdBy: 'studio'; photoUrl: string; style?: string; note?: string;
  category: Category; status: JobStatus; ideas: Idea[]; chosen: string[][]; mockups: Mockup[];
  error?: string; lease?: Lease; attempts: number; seq: number;
  /** ms epoch when the job last entered a queued_* state (drives the "waiting" message). */
  queuedAt: number;
};
export interface JobStore {
  read(id: string): Promise<Job | null>;
  /** Writes seq+1 to a NEW pathname and returns the stored job. */
  write(job: Job): Promise<Job>;
  /** Newest first. */
  list(limit: number): Promise<Job[]>;
}
