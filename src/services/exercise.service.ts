const EXERCISEDB_BASE_URL = 'https://exercisedb.p.rapidapi.com';

export interface Exercise {
  name: string;
  gifUrl: string;
  target: string;
}

const mapExercises = (data: Record<string, unknown>[]): Exercise[] =>
  data.map((e) => ({
    name: e.name as string,
    gifUrl: e.gifUrl as string,
    target: e.target as string,
  }));

export const searchExercises = async (
  search?: string,
  muscle?: string
): Promise<Exercise[]> => {
  const headers = {
    'x-rapidapi-key': process.env.EXERCISEDB_API_KEY ?? '',
    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
  };

  let url = '';
  const needsClientFilter = muscle && search;

  if (muscle) {
    url = `${EXERCISEDB_BASE_URL}/exercises/target/${encodeURIComponent(muscle)}?limit=${needsClientFilter ? 50 : 20}`;
  } else if (search) {
    url = `${EXERCISEDB_BASE_URL}/exercises/name/${encodeURIComponent(search)}?limit=20`;
  } else {
    url = `${EXERCISEDB_BASE_URL}/exercises?limit=20`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`ExerciseDB error: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>[];
  let exercises = mapExercises(data);

  if (needsClientFilter) {
    const term = search.toLowerCase();
    exercises = exercises.filter((e) => e.name.toLowerCase().includes(term));
  }

  return exercises;
};
