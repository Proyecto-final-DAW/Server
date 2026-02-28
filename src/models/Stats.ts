/**
 * Stats.ts — La forma de los datos de stats RPG
 *
 * ¿De dónde vienen estos datos?
 * Corresponden EXACTAMENTE a las columnas de la tabla "stats" en PostgreSQL.
 * Cuando haces SELECT * FROM stats, PostgreSQL devuelve un objeto con estas propiedades.
 * El driver pg convierte los tipos automáticamente (INTEGER → number, DATE → Date, etc.)
 *
 * ¿Quién usa esta interface?
 * - stats.service.ts → para tipar lo que devuelve la BD
 * - StatsController.ts → para tipar lo que envía al frontend
 */

export interface Stats {
  id: number;
  user_id: number;
  strength: number;
  endurance: number;
  speed: number;
  flexibility: number;
  strength_level: number;
  endurance_level: number;
  speed_level: number;
  flexibility_level: number;
  streak: number;
  best_streak: number;
  last_session_date: Date | null; // NULL = nunca ha entrenado
  updated_at: Date;
}

/**
 * Lo que el frontend necesita ver.
 * Quitamos el id interno de la tabla — al frontend le basta con saber
 * que estos stats pertenecen al usuario autenticado (vía req.user).
 */
export type StatsPublic = Omit<Stats, 'id'>;
