import { Response } from 'express';

import { RoutineExercise } from '../models/Routine';
import * as routineService from '../services/routine.service';
import { AuthRequest } from './UserController';

type RoutineExerciseInput = Omit<RoutineExercise, 'id' | 'routine_id'>;

const isValidRoutineExercise = (
  unknownExercise: unknown
): unknownExercise is RoutineExerciseInput => {
  if (!unknownExercise || typeof unknownExercise !== 'object') return false;
  const exerciseRecord = unknownExercise as Record<string, unknown>;

  const sets = exerciseRecord.sets;
  const reps = exerciseRecord.reps;
  const orderIndex = exerciseRecord.order_index;

  return (
    typeof exerciseRecord.exercise_api_id === 'string' &&
    exerciseRecord.exercise_api_id.trim().length > 0 &&
    (exerciseRecord.exercise_name === undefined ||
      exerciseRecord.exercise_name === null ||
      typeof exerciseRecord.exercise_name === 'string') &&
    (sets === undefined ||
      sets === null ||
      (typeof sets === 'number' && Number.isInteger(sets) && sets > 0)) &&
    (reps === undefined ||
      reps === null ||
      (typeof reps === 'number' && Number.isInteger(reps) && reps > 0)) &&
    (orderIndex === undefined ||
      orderIndex === null ||
      (typeof orderIndex === 'number' &&
        Number.isInteger(orderIndex) &&
        orderIndex >= 0))
  );
};

const parseRoutineId = (value: string): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const RoutineController = {
  async getAll(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const routines = await routineService.getAllByUser(userId);
      if (routines.length === 0) {
        return res.status(200).json({
          message: 'No routines found',
          routines: [],
        });
      }
      return res.status(200).json(routines);
    } catch {
      return res.status(500).json({ message: 'Failed to get routines' });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const routineId = parseRoutineId(
        (req.params as { id?: string }).id ?? ''
      );
      if (!routineId) {
        return res.status(400).json({ message: 'Invalid routine id' });
      }

      const routine = await routineService.getById(userId, routineId);
      if (!routine) {
        return res.status(404).json({ message: 'Routine not found' });
      }

      return res.status(200).json(routine);
    } catch {
      return res.status(500).json({ message: 'Failed to get routine' });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { name, description, exercises } = req.body as {
        name?: string;
        description?: string;
        exercises?: unknown[];
      };

      if (!name?.trim()) {
        return res.status(400).json({ message: 'Name is required' });
      }

      if (!Array.isArray(exercises)) {
        return res.status(400).json({ message: 'Exercises must be an array' });
      }

      if (!exercises.every(isValidRoutineExercise)) {
        return res.status(400).json({
          message:
            'Each exercise must have exercise_api_id, optional exercise_name, optional sets/reps (positive ints), and optional order_index (>= 0)',
        });
      }

      const routine = await routineService.create(userId, {
        name: name.trim(),
        description: description?.trim() || undefined,
        exercises: exercises as RoutineExerciseInput[],
      });

      return res.status(201).json(routine);
    } catch {
      return res.status(500).json({ message: 'Failed to create routine' });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const routineId = parseRoutineId(
        (req.params as { id?: string }).id ?? ''
      );
      if (!routineId) {
        return res.status(400).json({ message: 'Invalid routine id' });
      }

      const { name, description, exercises } = req.body as {
        name?: string;
        description?: string | null;
        exercises?: unknown[];
      };

      if (name !== undefined && !name.trim()) {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }

      if (exercises !== undefined) {
        if (!Array.isArray(exercises)) {
          return res
            .status(400)
            .json({ message: 'Exercises must be an array' });
        }
        if (!exercises.every(isValidRoutineExercise)) {
          return res.status(400).json({
            message:
              'Each exercise must have exercise_api_id, optional exercise_name, optional sets/reps (positive ints), and optional order_index (>= 0)',
          });
        }
      }

      const updated = await routineService.update(userId, routineId, {
        name: name !== undefined ? name.trim() : undefined,
        description:
          description === undefined
            ? undefined
            : description === null
              ? null
              : description.trim(),
        exercises: exercises as RoutineExerciseInput[] | undefined,
      });

      if (!updated) {
        return res.status(404).json({ message: 'Routine not found' });
      }

      return res.status(200).json(updated);
    } catch {
      return res.status(500).json({ message: 'Failed to update routine' });
    }
  },

  async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const routineId = parseRoutineId(
        (req.params as { id?: string }).id ?? ''
      );
      if (!routineId) {
        return res.status(400).json({ message: 'Invalid routine id' });
      }

      const deleted = await routineService.remove(userId, routineId);
      if (!deleted) {
        return res.status(404).json({ message: 'Routine not found' });
      }

      return res.status(200).json({ message: 'Routine deleted' });
    } catch {
      return res.status(500).json({ message: 'Failed to delete routine' });
    }
  },
};

export default RoutineController;
