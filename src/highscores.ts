/**
 * High-score table. Stored locally today; the same entry shape is designed to
 * post to a remote leaderboard endpoint when one is configured.
 */
export interface ScoreEntry {
  name: string;
  score: number;
  plane: string;
  date: string;
}

const KEY = 'bluemax-highscores';
const MAX_ENTRIES = 10;

/** Set to a leaderboard API base URL to enable server-side scores. */
export const REMOTE_URL: string | null = null;

export function loadScores(): ScoreEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ScoreEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const scores = loadScores();
  return scores.length < MAX_ENTRIES || score > scores[scores.length - 1].score;
}

export function addScore(entry: ScoreEntry): ScoreEntry[] {
  const scores = [...loadScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
  localStorage.setItem(KEY, JSON.stringify(scores));
  if (REMOTE_URL) void submitRemote(entry);
  return scores;
}

export function best(): number {
  return loadScores()[0]?.score ?? 0;
}

async function submitRemote(entry: ScoreEntry): Promise<void> {
  try {
    await fetch(`${REMOTE_URL}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Offline or endpoint down — the local table still has the score.
  }
}
