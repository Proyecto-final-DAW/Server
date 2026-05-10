// Bundled at build-time via `resolveJsonModule`. tsc copies the JSON next
// to the compiled output, esbuild (used by Netlify Functions) inlines it
// into the bundle. Either way the dataset is part of the deployed artifact
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
  /**
   * Raw free-exercise-db category (`strength` | `stretching` | `cardio`
   * | `plyometrics` | `powerlifting` | `olympic weightlifting` |
   * `strongman`). The client uses this to decide which inputs the
   * SetLogger renders — stretches show a duration field instead of
   * weight/reps, etc.
   */
  category: string;
}

interface RawEntry {
  id: string;
  name: string;
  primaryMuscles?: string[];
  equipment?: string | null;
  level?: string;
  images?: string[];
  category?: string;
}

// free-exercise-db uses these category values: strength, cardio, stretching,
// plyometrics, powerlifting, olympic weightlifting, strongman. We collapse
// them onto the four ExerciseType buckets the progression service knows
// about. Without this mapping every exercise defaulted to 'strength' and
// only the FUERZA stat ever earned XP — the most visible gameplay bug.
type ExerciseType = 'strength' | 'cardio' | 'explosive' | 'stretch';

const CATEGORY_TO_TYPE: Record<string, ExerciseType> = {
  'strength': 'strength',
  'powerlifting': 'strength',
  'strongman': 'strength',
  'cardio': 'cardio',
  'plyometrics': 'explosive',
  'olympic weightlifting': 'explosive',
  'stretching': 'stretch',
};

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
  category: entry.category?.toLowerCase() ?? 'strength',
}));

// Same lookup table as `exerciseTypeById` but keyed on category +
// equipment so the routine response can hydrate the SetLogger inputs
// without having the client re-fetch the catalog. Used by routine.service
// when serializing routine_exercises rows.
const exerciseMetaById = new Map<
  string,
  { category: string; equipment: string }
>(
  dataset.map((e) => [e.id, { category: e.category, equipment: e.equipment }])
);

export const getExerciseMetaById = (
  apiId: string
): { category: string; equipment: string } =>
  // Empty defaults (rather than 'strength') so the client can spot the
  // miss and run its name-based inference. Routines built from
  // templates use synthetic `tpl-*` ids that never match the catalog,
  // so they'd otherwise all read as strength and force the SetLogger
  // into weight+reps mode.
  exerciseMetaById.get(apiId) ?? { category: '', equipment: '' };

// Lookup table: exercise_api_id → derived ExerciseType. Built once at module
// load so session.service can resolve types in O(1) without re-iterating
// the dataset on every save.
const exerciseTypeById = new Map<string, ExerciseType>(
  rawDataset.map((entry) => {
    const id = entry.id ?? entry.name;
    const type =
      (entry.category && CATEGORY_TO_TYPE[entry.category.toLowerCase()]) ||
      'strength';
    return [id, type];
  })
);

/**
 * Returns the gameplay ExerciseType for a given exercise id. Falls back to
 * 'strength' when the id is unknown — keeps progression working even if the
 * client sends a stale id, instead of silently dropping XP.
 */
export const getExerciseTypeById = (apiId: string): ExerciseType =>
  exerciseTypeById.get(apiId) ?? 'strength';

// Precompute lowercase fields once at module load. The search filter
// runs on every keystroke (debounced client-side) and walks all 873
// catalog entries; lowercasing inside the loop on every comparison
// is pure waste — the lower-cased values never change. A 873-entry
// allocation at boot saves N×873 toLowerCase calls per request.
type IndexedExercise = Exercise & {
  _nameLower: string;
  _targetLower: string;
};
const indexedDataset: IndexedExercise[] = dataset.map((e) => ({
  ...e,
  _nameLower: e.name.toLowerCase(),
  _targetLower: e.target.toLowerCase(),
}));

// Hard cap on the search query length. Without it a 10kB search
// string still ran toLowerCase + a substring scan on every catalog
// entry; the controller already caps `limit` so this is the last
// untyped surface a client could weaponise.
const MAX_SEARCH_LENGTH = 100;

const filterExercises = (search?: string, muscle?: string): Exercise[] => {
  const searchLower =
    search && search.length > 0
      ? search.slice(0, MAX_SEARCH_LENGTH).toLowerCase()
      : null;
  const targetLower = muscle
    ? (MUSCLE_ALIASES[muscle.toLowerCase()] ?? muscle).toLowerCase()
    : null;
  return indexedDataset.filter(
    (exercise) =>
      (!searchLower || exercise._nameLower.includes(searchLower)) &&
      (!targetLower || exercise._targetLower === targetLower)
  );
};

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
