const EXERCISEDB_BASE_URL = 'https://exercisedb.p.rapidapi.com';

export interface Exercise {
  name: string;
  gifUrl: string;
  target: string;
}

export const searchExercises = async (
  search?: string,
  muscle?: string
): Promise<Exercise[]> => {
  const headers = {
    'x-rapidapi-key': process.env.EXERCISEDB_API_KEY ?? '',
    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
  };

  let url = '';

  if (muscle) {
    url = `${EXERCISEDB_BASE_URL}/exercises/target/${encodeURIComponent(muscle)}?limit=20`;
  } else if (search) {
    url = `${EXERCISEDB_BASE_URL}/exercises/name/${encodeURIComponent(search)}?limit=20`;
  } else {
    url = `${EXERCISEDB_BASE_URL}/exercises?limit=20`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ExerciseDB error:', response.status, errorText);
      throw new Error(`ExerciseDB error: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>[];

    return data.map((exercise) => exercise as unknown as Exercise);
  } catch (err) {
    console.error('Fetch failed:', err);
    throw err;
  }
};
