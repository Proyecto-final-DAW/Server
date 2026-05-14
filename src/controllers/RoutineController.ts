import { Response } from 'express';

import { RoutineExercise } from '../models/Routine';
import * as routineService from '../services/routine.service';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

type RoutineExerciseInput = Omit<RoutineExercise, 'id' | 'routine_id'>;

// Schema bounds. The DB caps `name` at varchar(100) and
// `exercise_name` at varchar(200); enforcing these in the controller
// turns "value too long for type" 500s into clean 400s. The exercises
// cap is a DoS guard: with no upper bound, any authenticated user can
// post a 100kB body of exercise objects and tie up the routine row
// lock + the bulk-insert for seconds. 100 is well above any
// legitimate use (the longest realistic split is ~12 lifts/day).
const MAX_ROUTINE_NAME_LEN = 100;
const MAX_ROUTINE_DESC_LEN = 2000;
const MAX_ROUTINE_EXERCISES = 100;
const MAX_EXERCISE_NAME_LEN = 200;

const isValidRoutineExercise = (
  unknownExercise: unknown
): unknownExercise is RoutineExerciseInput => {
  if (!unknownExercise || typeof unknownExercise !== 'object') return false;
  const exerciseRecord = unknownExercise as Record<string, unknown>;

  const sets = exerciseRecord.sets;
  const reps = exerciseRecord.reps;
  const orderIndex = exerciseRecord.order_index;
  const exerciseName = exerciseRecord.exercise_name;

  return (
    typeof exerciseRecord.exercise_api_id === 'string' &&
    exerciseRecord.exercise_api_id.trim().length > 0 &&
    exerciseRecord.exercise_api_id.length <= MAX_EXERCISE_NAME_LEN &&
    (exerciseName === undefined ||
      exerciseName === null ||
      (typeof exerciseName === 'string' &&
        exerciseName.length <= MAX_EXERCISE_NAME_LEN)) &&
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
      // Always return a bare array. The empty state IS an empty array;
      // wrapping it in an envelope object on zero routines breaks any
      // client that does `response.map(...)` on the result.
      return res.status(200).json(routines);
    } catch (err) {
      return sendServerError(res, err, 'RoutineController.getAll');
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
    } catch (err) {
      return sendServerError(res, err, 'RoutineController.getById');
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
      if (name.length > MAX_ROUTINE_NAME_LEN) {
        return res.status(400).json({
          message: `Name must be at most ${MAX_ROUTINE_NAME_LEN} characters`,
        });
      }
      if (description !== undefined && description !== null) {
        if (typeof description !== 'string') {
          return res
            .status(400)
            .json({ message: 'Description must be a string' });
        }
        if (description.length > MAX_ROUTINE_DESC_LEN) {
          return res.status(400).json({
            message: `Description must be at most ${MAX_ROUTINE_DESC_LEN} characters`,
          });
        }
      }

      if (!Array.isArray(exercises)) {
        return res.status(400).json({ message: 'Exercises must be an array' });
      }

      if (exercises.length > MAX_ROUTINE_EXERCISES) {
        return res.status(400).json({
          message: `A routine can hold at most ${MAX_ROUTINE_EXERCISES} exercises`,
        });
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
    } catch (err) {
      return sendServerError(res, err, 'RoutineController.create');
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

      if (name !== undefined) {
        if (!name.trim()) {
          return res.status(400).json({ message: 'Name cannot be empty' });
        }
        if (name.length > MAX_ROUTINE_NAME_LEN) {
          return res.status(400).json({
            message: `Name must be at most ${MAX_ROUTINE_NAME_LEN} characters`,
          });
        }
      }

      if (description !== undefined && description !== null) {
        if (typeof description !== 'string') {
          return res
            .status(400)
            .json({ message: 'Description must be a string' });
        }
        if (description.length > MAX_ROUTINE_DESC_LEN) {
          return res.status(400).json({
            message: `Description must be at most ${MAX_ROUTINE_DESC_LEN} characters`,
          });
        }
      }

      if (exercises !== undefined) {
        if (!Array.isArray(exercises)) {
          return res
            .status(400)
            .json({ message: 'Exercises must be an array' });
        }
        if (exercises.length > MAX_ROUTINE_EXERCISES) {
          return res.status(400).json({
            message: `A routine can hold at most ${MAX_ROUTINE_EXERCISES} exercises`,
          });
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
    } catch (err) {
      return sendServerError(res, err, 'RoutineController.update');
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
    } catch (err) {
      return sendServerError(res, err, 'RoutineController.remove');
    }
  },
};

export default RoutineController;
