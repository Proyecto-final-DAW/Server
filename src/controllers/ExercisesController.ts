import { Request, Response } from 'express';

import * as exerciseService from '../services/exercise.service';

// Bounded in-process cache. Even with auth on the route, an authenticated
// user can hit thousands of distinct exercise IDs and balloon process memory
// — capping at MAX_ENTRIES with insertion-order eviction (Map iterates in
// insertion order) keeps the worst case O(MAX_ENTRIES * avg_image_size).
const IMAGE_CACHE_TTL = 30 * 60 * 1000;
const IMAGE_CACHE_MAX_ENTRIES = 500;
const imageCache = new Map<string, { data: Buffer; timestamp: number }>();

const evictIfFull = (): void => {
  while (imageCache.size >= IMAGE_CACHE_MAX_ENTRIES) {
    const oldest = imageCache.keys().next().value;
    if (oldest === undefined) break;
    imageCache.delete(oldest);
  }
};

const ExercisesController = {
  async search(req: Request, res: Response) {
    try {
      const search = req.query.search as string | undefined;
      const muscle = req.query.muscle as string | undefined;
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string) || 4, 1),
        50
      );

      const result = await exerciseService.searchExercises(
        search,
        muscle,
        page,
        limit
      );

      return res.status(200).json(result);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to fetch exercises',
        error: error?.message || String(err),
      });
    }
  },

  async image(req: Request<{ id: string }>, res: Response) {
    try {
      const { id } = req.params;

      const cached = imageCache.get(id);
      if (cached && Date.now() - cached.timestamp < IMAGE_CACHE_TTL) {
        res.setHeader('Content-Type', 'image/gif');
        res.setHeader('Cache-Control', 'public, max-age=1800');
        return res.send(cached.data);
      }

      const imageBuffer = await exerciseService.getExerciseImage(id);

      evictIfFull();
      imageCache.set(id, { data: imageBuffer, timestamp: Date.now() });

      res.setHeader('Content-Type', 'image/gif');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.send(imageBuffer);
    } catch {
      return res.status(404).json({ message: 'Image not found' });
    }
  },
};

export default ExercisesController;
