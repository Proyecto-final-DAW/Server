import { Tip, TipType, TipsByType } from '../models/Tip';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const tips: TipsByType = {
  [TipType.FIRST_WEEK]: [
    {
      id: 1,
      type: TipType.FIRST_WEEK,
      content: 'Focus on building a simple routine during your first week.',
      active: true,
    },
  ],
  [TipType.INACTIVE_3_DAYS]: [
    {
      id: 2,
      type: TipType.INACTIVE_3_DAYS,
      content:
        'You have been inactive for a few days. Start again with a small step today.',
      active: true,
    },
  ],
  [TipType.NEW_ACHIEVEMENT]: [
    {
      id: 3,
      type: TipType.NEW_ACHIEVEMENT,
      content:
        'Great job unlocking a new achievement! Keep the momentum going.',
      active: true,
    },
  ],
  [TipType.HIGH_STREAK]: [
    {
      id: 4,
      type: TipType.HIGH_STREAK,
      content: 'Amazing streak! Stay consistent and keep it sustainable.',
      active: true,
    },
  ],
  [TipType.GENERAL]: [
    {
      id: 5,
      type: TipType.GENERAL,
      content: 'Consistency beats intensity in the long run.',
      active: true,
    },
  ],
};

function pickRandomTip(items: Tip[]): Tip {
  if (!items.length) {
    throw new Error('No tips available');
  }
  return items[Math.floor(Math.random() * items.length)];
}

export interface GetTipInput {
  created_at: Date;
  last_session_at?: Date | null;
  last_milestone_at?: Date | null;
  streak?: number | null;
}

export function getTip(input: GetTipInput): Tip {
  const now = new Date();

  const daysSinceCreated =
    (now.getTime() - input.created_at.getTime()) / DAY_IN_MS;

  if (daysSinceCreated < 7) {
    return pickRandomTip(tips[TipType.FIRST_WEEK]);
  }

  if (input.last_session_at) {
    const daysSinceLastSession =
      (now.getTime() - input.last_session_at.getTime()) / DAY_IN_MS;

    if (daysSinceLastSession > 3) {
      return pickRandomTip(tips[TipType.INACTIVE_3_DAYS]);
    }
  }

  if (input.last_milestone_at) {
    const daysSinceMilestone =
      (now.getTime() - input.last_milestone_at.getTime()) / DAY_IN_MS;

    if (daysSinceMilestone <= 2) {
      return pickRandomTip(tips[TipType.NEW_ACHIEVEMENT]);
    }
  }

  if (typeof input.streak === 'number' && input.streak > 7) {
    return pickRandomTip(tips[TipType.HIGH_STREAK]);
  }

  return pickRandomTip(tips[TipType.GENERAL]);
}
