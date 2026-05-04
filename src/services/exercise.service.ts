import fs from 'node:fs';
import path from 'node:path';

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
// translate at the boundary so the client doesn't need to change.
const MUSCLE_ALIASES: Record<string, string> = {
  pectorals: 'chest',
  delts: 'shoulders',
  abs: 'abdominals',
  quads: 'quadriceps',
};

// Resolved against process.cwd() instead of __dirname because tsc does not
// copy non-.ts assets into dist/. npm scripts (`dev`, `start`) both run from
// the Server/ root, so cwd points at the project root in dev (tsx) and prod
// (node dist/) alike.
const datasetPath = path.join(process.cwd(), 'data', 'exercises.json');

const rawDataset = JSON.parse(
  fs.readFileSync(datasetPath, 'utf-8')
) as RawEntry[];

const dataset: Exercise[] = rawDataset.map((entry) => ({
  id: entry.id,
  name: entry.name,
  target: entry.primaryMuscles?.[0] ?? '',
  equipment: entry.equipment ?? 'body only',
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

export const searchExercises = async (
  search?: string,
  muscle?: string,
  page = 1,
  limit = DEFAULT_LIMIT
): Promise<{ data: Exercise[]; total: number }> => {
  const filtered = filterExercises(search, muscle);
  const offset = (page - 1) * limit;
  return {
    data: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
};
