// Bundled at build-time via `resolveJsonModule`: tsc copies the JSON next
// to the compiled output, so the dataset is part of the deployed artifact
// and there is no runtime path resolution to get wrong.
import datasetRaw from '../data/exercises.json';

const FREE_EXERCISE_DB_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

const DEFAULT_LIMIT = 9;

export interface Exercise {
  id: string;
  name: string;
  target: string;
  equipment: string;
  difficulty: string;
  imageUrl: string;
}

interface RawEntry {
  id: string;
  name: string;
  primaryMuscles?: string[];
  equipment?: string | null;
  level?: string;
  images?: string[];
}

// The client filter dropdown still uses the legacy ExerciseDB muscle
// vocabulary (pectorals, delts, abs, quads). free-exercise-db's
// `primaryMuscles` uses chest / shoulders / abdominals / quadriceps —
// translate at the boundary so the client doesn't need to change. Identity
// entries (e.g. `traps: 'traps'`) are kept explicit so renaming a value
// upstream doesn't silently fall through the lookup.
const MUSCLE_ALIASES: Record<string, string> = {
  pectorals: 'chest',
  chest: 'chest',
  delts: 'shoulders',
  shoulders: 'shoulders',
  abs: 'abdominals',
  abdominals: 'abdominals',
  quads: 'quadriceps',
  quadriceps: 'quadriceps',
  lats: 'lats',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  traps: 'traps',
};

const rawDataset = datasetRaw as unknown as RawEntry[];

const dataset: Exercise[] = rawDataset.map((entry) => ({
  // upstream guarantees `id` in practice, but defending against a missing
  // value avoids silent ID collisions if the dataset format ever drifts.
  id: entry.id ?? entry.name,
  name: entry.name,
  target: entry.primaryMuscles?.[0] ?? '',
  // Preserve "no equipment specified" as empty so the UI can render a dash
  // or hide the chip. ~77 of 873 entries (stretches, isometric holds) are
  // legitimately equipment-less; defaulting to 'body only' would mislabel
  // them as bodyweight exercises.
  equipment: entry.equipment ?? '',
  difficulty: entry.level ?? 'beginner',
  imageUrl: entry.images?.[0]
    ? `${FREE_EXERCISE_DB_BASE}${entry.images[0]}`
    : '',
}));

const matchesSearch = (exercise: Exercise, search: string): boolean =>
  exercise.name.toLowerCase().includes(search.toLowerCase());

const matchesMuscle = (exercise: Exercise, muscle: string): boolean => {
  const target = (MUSCLE_ALIASES[muscle.toLowerCase()] ?? muscle).toLowerCase();
  return exercise.target.toLowerCase() === target;
};

const filterExercises = (search?: string, muscle?: string): Exercise[] =>
  dataset.filter(
    (exercise) =>
      (!search || matchesSearch(exercise, search)) &&
      (!muscle || matchesMuscle(exercise, muscle))
  );

// Synchronous because the dataset lives in memory — no I/O. Kept as a free
// function (not async) so the controller's call site is honest about there
// being no pending Promise to await.
export const searchExercises = (
  search?: string,
  muscle?: string,
  page = 1,
  limit = DEFAULT_LIMIT
): { data: Exercise[]; total: number } => {
  const filtered = filterExercises(search, muscle);
  const offset = (page - 1) * limit;
  return {
    data: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
};
