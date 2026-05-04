const EXERCISEDB_BASE_URL = 'https://exercisedb.p.rapidapi.com';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const DEFAULT_LIMIT = 4;

export interface Exercise {
  id: string;
  name: string;
  target: string;
  equipment: string;
  difficulty: string;
  imageUrl: string;
}

interface CacheEntry {
  data: Exercise[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

const getCached = (key: string): Exercise[] | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

const setCache = (key: string, data: Exercise[]): void => {
  cache.set(key, { data, timestamp: Date.now() });
};

// ExerciseDB returns the gif as a fully-qualified `gifUrl` in the search
// response itself. Prefer that — it points to the public CDN and works
// without an extra proxy hop. Fall back to our /exercises/image/:id proxy
// only if the upstream omits the field (older API versions).
const mapExercises = (data: Record<string, unknown>[]): Exercise[] =>
  data.map((e) => {
    const gifUrl = typeof e.gifUrl === 'string' ? e.gifUrl : '';
    return {
      id: e.id as string,
      name: e.name as string,
      target: e.target as string,
      equipment: e.equipment as string,
      difficulty: e.difficulty as string,
      imageUrl: gifUrl || `/exercises/image/${e.id as string}`,
    };
  });

const fetchFromExerciseDB = async (url: string): Promise<Exercise[]> => {
  const cached = getCached(url);
  if (cached) return cached;

  const headers = {
    'x-rapidapi-key': process.env.EXERCISEDB_API_KEY ?? '',
    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
  };

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`ExerciseDB error: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>[];
  const exercises = mapExercises(data);
  setCache(url, exercises);
  return exercises;
};

const paginate = (
  exercises: Exercise[],
  page: number,
  limit: number
): { data: Exercise[]; total: number } => {
  const offset = (page - 1) * limit;
  return {
    data: exercises.slice(offset, offset + limit),
    total: exercises.length,
  };
};

type SearchType = 'both' | 'muscle' | 'search' | 'none';

const getSearchType = (search?: string, muscle?: string): SearchType => {
  switch (true) {
    case !!muscle && !!search:
      return 'both';
    case !!muscle:
      return 'muscle';
    case !!search:
      return 'search';
    default:
      return 'none';
  }
};

const fetchExercises = async (
  type: SearchType,
  search: string | undefined,
  muscle: string | undefined,
  fetchLimit: number
): Promise<Exercise[]> => {
  switch (type) {
    case 'both': {
      const [byMuscle, byName] = await Promise.all([
        fetchFromExerciseDB(
          `${EXERCISEDB_BASE_URL}/exercises/target/${encodeURIComponent(muscle!)}?limit=${fetchLimit}`
        ),
        fetchFromExerciseDB(
          `${EXERCISEDB_BASE_URL}/exercises/name/${encodeURIComponent(search!)}?limit=${fetchLimit}`
        ),
      ]);
      const muscleIds = new Set(byMuscle.map((e) => e.id));
      return byName.filter((e) => muscleIds.has(e.id));
    }
    case 'muscle':
      return fetchFromExerciseDB(
        `${EXERCISEDB_BASE_URL}/exercises/target/${encodeURIComponent(muscle!)}?limit=${fetchLimit}`
      );
    case 'search':
      return fetchFromExerciseDB(
        `${EXERCISEDB_BASE_URL}/exercises/name/${encodeURIComponent(search!)}?limit=${fetchLimit}`
      );
    case 'none':
      return fetchFromExerciseDB(
        `${EXERCISEDB_BASE_URL}/exercises?limit=${fetchLimit}`
      );
  }
};

export const searchExercises = async (
  search?: string,
  muscle?: string,
  page = 1,
  limit = DEFAULT_LIMIT
): Promise<{ data: Exercise[]; total: number }> => {
  const fetchLimit = Math.max(limit * page, 50);
  const type = getSearchType(search, muscle);
  const exercises = await fetchExercises(type, search, muscle, fetchLimit);
  return paginate(exercises, page, limit);
};

export const getExerciseImage = async (exerciseId: string): Promise<Buffer> => {
  const apiKey = process.env.EXERCISEDB_API_KEY ?? '';
  // The API key MUST only travel in the header — putting it in the query
  // string leaks it to access logs of any intermediate proxy / CDN / WAF.
  const url = `${EXERCISEDB_BASE_URL}/image?exerciseId=${encodeURIComponent(exerciseId)}&resolution=180`;

  const response = await fetch(url, {
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
    },
  });

  if (!response.ok) {
    throw new Error(`ExerciseDB image error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};
