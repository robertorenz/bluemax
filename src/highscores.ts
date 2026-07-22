/**
 * High-score table: always kept locally, and mirrored to a shared Supabase
 * leaderboard when the project credentials below are filled in.
 */
export interface ScoreEntry {
  name: string;
  score: number;
  plane: string;
  date: string;
}

const KEY = 'bluemax-highscores';
const MAX_ENTRIES = 10;

// ---------------------------------------------------------------- Supabase
// Fill these in to enable the shared global leaderboard. The anon key is a
// public client key by design (it ships in the bundle); row-level security
// on the server is what protects the data.
export const SUPABASE_URL = 'https://smytnwaqgbkqugtfcocu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_ckkD7aerv9Ak2xnh5xLabA_7RKSt_ty';

export const remoteEnabled = (): boolean =>
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

const sbHeaders = (): Record<string, string> => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

/** Global top scores from the shared leaderboard, or null when unavailable. */
export async function fetchGlobalScores(limit = 10): Promise<ScoreEntry[] | null> {
  if (!remoteEnabled()) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=name,score,plane,date&order=score.desc&limit=${limit}`,
      { headers: sbHeaders() },
    );
    if (!res.ok) return null;
    return (await res.json()) as ScoreEntry[];
  } catch {
    return null;
  }
}

/** Global standing for a score: how many players beat it, out of how many. */
export async function fetchRank(score: number): Promise<{ rank: number; total: number } | null> {
  if (!remoteEnabled()) return null;
  try {
    const count = async (filter: string): Promise<number> => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scores?select=id${filter}`, {
        headers: { ...sbHeaders(), Prefer: 'count=exact', Range: '0-0' },
      });
      return Number(res.headers.get('content-range')?.split('/')[1] ?? NaN);
    };
    const above = await count(`&score=gt.${score}`);
    const total = await count('');
    if (Number.isNaN(above) || Number.isNaN(total)) return null;
    return { rank: above + 1, total };
  } catch {
    return null;
  }
}

async function submitRemote(entry: ScoreEntry): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(entry),
    });
  } catch {
    // Offline or endpoint down — the local table still has the score.
  }
}

// ---------------------------------------------------------------- local

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
  if (remoteEnabled()) void submitRemote(entry);
  return scores;
}

export function best(): number {
  return loadScores()[0]?.score ?? 0;
}
