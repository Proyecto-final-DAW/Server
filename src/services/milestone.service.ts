import pool from '../db/pool';
import type { ConditionType, UnlockedMilestone } from '../models/Milestone';

// Explicit column list rather than `SELECT *`. Two reasons:
//  1) The wire shape becomes part of the API contract — adding a
//     column to `milestones` no longer accidentally leaks it to the
//     client (and through any analytics that captures responses).
//  2) The client `MilestoneDTO` only models these six fields, so the
//     extra bytes from `SELECT *` are pure waste on every render.
const MILESTONE_COLUMNS =
  'id, name, description, condition_type, condition_value, icon';

export const findAllMilestones = async () => {
  const result = await pool.query(
    `SELECT ${MILESTONE_COLUMNS} FROM milestones ORDER BY condition_type, condition_value`
  );
  return result.rows;
};

export const findUnlockedByUser = async (
  userId: number
): Promise<UnlockedMilestone[]> => {
  const result = await pool.query(
    `SELECT
        m.id,
        m.name,
        m.description,
        m.condition_type,
        m.condition_value,
        m.icon,
        um.unlocked_at
     FROM user_milestones um
     JOIN milestones m ON m.id = um.milestone_id
     WHERE um.user_id = $1
     ORDER BY um.unlocked_at DESC`,
    [userId]
  );
  return result.rows;
};

export const checkAndUnlock = async (
  userId: number,
  conditionType: ConditionType,
  currentValue: number
): Promise<UnlockedMilestone[]> => {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO user_milestones (user_id, milestone_id)
       SELECT $1, m.id
       FROM milestones m
       WHERE m.condition_type = $2
         AND m.condition_value <= $3
         AND m.id NOT IN (
           SELECT milestone_id FROM user_milestones WHERE user_id = $1
         )
       ON CONFLICT (user_id, milestone_id) DO NOTHING
       RETURNING milestone_id, unlocked_at
     )
     SELECT
        m.id,
        m.name,
        m.description,
        m.condition_type,
        m.condition_value,
        m.icon,
        i.unlocked_at
     FROM inserted i
     JOIN milestones m ON m.id = i.milestone_id`,
    [userId, conditionType, currentValue]
  );

  return rows;
};
