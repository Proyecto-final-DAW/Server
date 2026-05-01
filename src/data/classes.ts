/**
 * Character class catalog — single source of truth for the 38 classes.
 *
 * Tier structure:
 *   T0  — ESCUDERO (start, no choice)
 *   T1  — VOCATIONS (6, one per stat)
 *   T2  — SPECIALIZATIONS (18, three per linage)
 *   T3  — LEGENDARIES (12, each fed by 3 T2s on average)
 *   T4  — TRASCENDENTE (form upgrade of T3, no new class)
 *   T5  — MAESTRO SUPREMO (single endgame class)
 *   T6  — LEYENDA (cosmetic title, all stats = 99)
 *
 * Same data is mirrored in `client/src/features/character/data/classes.ts`.
 * If you change anything here, mirror it on the client.
 */

export type StatKey =
  | 'strength'
  | 'endurance'
  | 'stamina'
  | 'agility'
  | 'tenacity'
  | 'vigor';

export const STAT_KEYS: readonly StatKey[] = [
  'strength',
  'endurance',
  'stamina',
  'agility',
  'tenacity',
  'vigor',
] as const;

export type LinageId =
  | 'GUERRERO'
  | 'PALADIN'
  | 'CAZADOR'
  | 'PICARO'
  | 'MONJE'
  | 'DRUIDA';

export type ClassTier = 0 | 1 | 2 | 3 | 5 | 6;

export interface NoviceClass {
  id: 'ESCUDERO';
  tier: 0;
  name: string;
  frase: string;
}

export interface VocationClass {
  id: LinageId;
  tier: 1;
  name: string;
  frase: string;
  dominantStat: StatKey;
}

export interface SpecializationClass {
  id: string;
  tier: 2;
  name: string;
  frase: string;
  linage: LinageId;
  secondaryStat: StatKey;
  legendaryOptions: readonly [string, string];
}

export interface LegendaryClass {
  id: string;
  tier: 3;
  name: string;
  frase: string;
  iconHint: string;
  requiredStats: readonly StatKey[];
  trascendenteName: string;
  trascendenteFrase: string;
}

export interface SupremoClass {
  id: 'MAESTRO_SUPREMO';
  tier: 5;
  name: string;
  frase: string;
}

export interface LeyendaClass {
  id: 'LEYENDA';
  tier: 6;
  name: string;
  frase: string;
}

export type CharacterClass =
  | NoviceClass
  | VocationClass
  | SpecializationClass
  | LegendaryClass
  | SupremoClass
  | LeyendaClass;

export const NOVICE: NoviceClass = {
  id: 'ESCUDERO',
  tier: 0,
  name: 'Escudero',
  frase: 'Todo héroe empezó siendo nadie.',
};

export const VOCATIONS: readonly VocationClass[] = [
  {
    id: 'GUERRERO',
    tier: 1,
    name: 'Guerrero',
    frase: 'Cada cicatriz es una victoria que sobrevivió.',
    dominantStat: 'strength',
  },
  {
    id: 'PALADIN',
    tier: 1,
    name: 'Paladín',
    frase: 'Donde el mundo termina, él sigue de pie.',
    dominantStat: 'endurance',
  },
  {
    id: 'CAZADOR',
    tier: 1,
    name: 'Cazador',
    frase: 'Sigue tu rastro desde antes que lo dejaras.',
    dominantStat: 'stamina',
  },
  {
    id: 'PICARO',
    tier: 1,
    name: 'Pícaro',
    frase: 'Antes de tu próximo aliento, ya está detrás.',
    dominantStat: 'agility',
  },
  {
    id: 'MONJE',
    tier: 1,
    name: 'Monje',
    frase: 'Mil veces caído. Mil y una de pie.',
    dominantStat: 'tenacity',
  },
  {
    id: 'DRUIDA',
    tier: 1,
    name: 'Druida',
    frase: 'Los lobos lo siguen. Los reyes le temen.',
    dominantStat: 'vigor',
  },
] as const;

export const SPECIALIZATIONS: readonly SpecializationClass[] = [
  // Guerrero (STR)
  {
    id: 'BERSERKER',
    tier: 2,
    name: 'Berserker',
    frase: 'Solo deja de luchar cuando ya no queda enemigo.',
    linage: 'GUERRERO',
    secondaryStat: 'endurance',
    legendaryOptions: ['CABALLERO_APOCALIPTICO', 'HERALDO'],
  },
  {
    id: 'DUELISTA',
    tier: 2,
    name: 'Duelista',
    frase: 'Cien aceros han bailado con el suyo. Ninguno volvió.',
    linage: 'GUERRERO',
    secondaryStat: 'agility',
    legendaryOptions: ['TITAN', 'VENGADOR'],
  },
  {
    id: 'MERCENARIO',
    tier: 2,
    name: 'Mercenario',
    frase: 'Su acero al mejor postor. Su honor, a nadie.',
    linage: 'GUERRERO',
    secondaryStat: 'stamina',
    legendaryOptions: ['TITAN', 'CAMINANTE_ETERNO'],
  },
  // Paladín (END)
  {
    id: 'CRUZADO',
    tier: 2,
    name: 'Cruzado',
    frase: 'Su mandoble bautiza. Su fe, condena.',
    linage: 'PALADIN',
    secondaryStat: 'strength',
    legendaryOptions: ['CABALLERO_APOCALIPTICO', 'INMORTAL'],
  },
  {
    id: 'TEMPLARIO',
    tier: 2,
    name: 'Templario',
    frase: 'El juramento que pronunció arde aún en su pecho.',
    linage: 'PALADIN',
    secondaryStat: 'vigor',
    legendaryOptions: ['INMORTAL', 'PROFETA'],
  },
  {
    id: 'GUARDIAN',
    tier: 2,
    name: 'Guardián',
    frase: 'Detrás de él, el mundo respira.',
    linage: 'PALADIN',
    secondaryStat: 'tenacity',
    legendaryOptions: ['HIEROFANTE', 'INMORTAL'],
  },
  // Cazador (STA)
  {
    id: 'EXPLORADOR',
    tier: 2,
    name: 'Explorador',
    frase: 'Dibuja los mapas que aún no existen.',
    linage: 'CAZADOR',
    secondaryStat: 'agility',
    legendaryOptions: ['ARCHIDRUIDA', 'HERALDO'],
  },
  {
    id: 'TRAMPERO',
    tier: 2,
    name: 'Trampero',
    frase: 'Cuando lo escuchas, ya estás dentro de su trampa.',
    linage: 'CAZADOR',
    secondaryStat: 'tenacity',
    legendaryOptions: ['CAMINANTE_ETERNO', 'HIEROFANTE'],
  },
  {
    id: 'MONTARAZ',
    tier: 2,
    name: 'Montaraz',
    frase: 'Las bestias huyen de él. Los hombres también deberían.',
    linage: 'CAZADOR',
    secondaryStat: 'vigor',
    legendaryOptions: ['ARCHIDRUIDA', 'PROFETA'],
  },
  // Pícaro (AGI)
  {
    id: 'ASESINO',
    tier: 2,
    name: 'Asesino',
    frase: 'Tu última palabra será su nombre. Si te da tiempo.',
    linage: 'PICARO',
    secondaryStat: 'strength',
    legendaryOptions: ['VENGADOR', 'NEMESIS'],
  },
  {
    id: 'SOMBRA',
    tier: 2,
    name: 'Sombra',
    frase: 'No verás de dónde viene. Solo a dónde lleva.',
    linage: 'PICARO',
    secondaryStat: 'stamina',
    legendaryOptions: ['NEMESIS', 'HERALDO'],
  },
  {
    id: 'CAZARRECOMPENSAS',
    tier: 2,
    name: 'Cazarrecompensas',
    frase: 'Te persigue desde antes de que supieras huir.',
    linage: 'PICARO',
    secondaryStat: 'tenacity',
    legendaryOptions: ['VENGADOR', 'CAMINANTE_ETERNO'],
  },
  // Monje (TEN)
  {
    id: 'SACERDOTE',
    tier: 2,
    name: 'Sacerdote',
    frase: 'Reza con el cuerpo. Y el cuerpo le obedece.',
    linage: 'MONJE',
    secondaryStat: 'vigor',
    legendaryOptions: ['AVATAR', 'PROFETA'],
  },
  {
    id: 'INQUISIDOR',
    tier: 2,
    name: 'Inquisidor',
    frase: 'Su mirada quema lo que su acero no alcanza.',
    linage: 'MONJE',
    secondaryStat: 'endurance',
    legendaryOptions: ['HIEROFANTE', 'AVATAR'],
  },
  {
    id: 'REDENTOR',
    tier: 2,
    name: 'Redentor',
    frase: 'Carga el peso de los que cayeron antes que él.',
    linage: 'MONJE',
    secondaryStat: 'strength',
    legendaryOptions: ['CONQUISTADOR', 'CABALLERO_APOCALIPTICO'],
  },
  // Druida (VIG)
  {
    id: 'DOMADOR',
    tier: 2,
    name: 'Domador',
    frase: 'Lo que ruge en el bosque, le llama padre.',
    linage: 'DRUIDA',
    secondaryStat: 'strength',
    legendaryOptions: ['CONQUISTADOR', 'INMORTAL'],
  },
  {
    id: 'CHAMAN',
    tier: 2,
    name: 'Chamán',
    frase: 'Las voces que oye, otros las sufren como pesadillas.',
    linage: 'DRUIDA',
    secondaryStat: 'agility',
    legendaryOptions: ['ARCHIDRUIDA', 'NEMESIS'],
  },
  {
    id: 'SABIO',
    tier: 2,
    name: 'Sabio',
    frase: 'Lee tu cuerpo como un libro que tú no sabes leer.',
    linage: 'DRUIDA',
    secondaryStat: 'tenacity',
    legendaryOptions: ['AVATAR', 'ARCHIDRUIDA'],
  },
] as const;

export const LEGENDARIES: readonly LegendaryClass[] = [
  {
    id: 'TITAN',
    tier: 3,
    name: 'Titán',
    frase: 'Los dioses lo enterraron. La tierra lo devolvió.',
    iconHint: '⚔',
    requiredStats: ['strength'],
    trascendenteName: 'Primordial',
    trascendenteFrase: 'Antes del verbo, ya tenía nombre.',
  },
  {
    id: 'CABALLERO_APOCALIPTICO',
    tier: 3,
    name: 'Caballero Apocalíptico',
    frase: 'El primero de los cuatro. Y el más cruel.',
    iconHint: '🗡',
    requiredStats: ['strength', 'endurance'],
    trascendenteName: 'Apocalipsis',
    trascendenteFrase: 'El día final ya ha sido escrito. Con su sangre.',
  },
  {
    id: 'INMORTAL',
    tier: 3,
    name: 'Inmortal',
    frase: 'Vio nacer reinos. Verá morir los que aún no nacen.',
    iconHint: '♾',
    requiredStats: ['endurance', 'vigor'],
    trascendenteName: 'Leviatán',
    trascendenteFrase:
      'Bajo las olas duerme. Cuando despierta, el mar se vacía.',
  },
  {
    id: 'NEMESIS',
    tier: 3,
    name: 'Némesis',
    frase: 'Tiene una lista. Tu nombre está en ella. En tinta.',
    iconHint: '🌑',
    requiredStats: ['agility', 'stamina'],
    trascendenteName: 'Perdición',
    trascendenteFrase: 'Pronunciar su nombre es renunciar al tuyo.',
  },
  {
    id: 'AVATAR',
    tier: 3,
    name: 'Avatar',
    frase: 'Lo divino tomó forma humana. Y se cansó del cielo.',
    iconHint: '☯',
    requiredStats: ['vigor', 'tenacity'],
    trascendenteName: 'Deidad',
    trascendenteFrase: 'Los dioses muertos murmuran su nombre con miedo.',
  },
  {
    id: 'HIEROFANTE',
    tier: 3,
    name: 'Hierofante',
    frase: 'Guarda verdades que matarían a quien las pronunciase.',
    iconHint: '☥',
    requiredStats: ['tenacity', 'endurance'],
    trascendenteName: 'Patriarca',
    trascendenteFrase: 'Su silencio condena. Su palabra crea ley.',
  },
  {
    id: 'ARCHIDRUIDA',
    tier: 3,
    name: 'Archidruida',
    frase: 'Las raíces le obedecen. El cielo escucha.',
    iconHint: '🌿',
    requiredStats: ['vigor', 'stamina'],
    trascendenteName: 'Primarca',
    trascendenteFrase: 'El bosque despertó porque él lo soñó.',
  },
  {
    id: 'VENGADOR',
    tier: 3,
    name: 'Vengador',
    frase: 'No olvida. No perdona. No falla.',
    iconHint: '⚡',
    requiredStats: ['strength', 'agility'],
    trascendenteName: 'Justiciero',
    trascendenteFrase: 'La balanza está en su mano. Tu nombre, en su lista.',
  },
  {
    id: 'HERALDO',
    tier: 3,
    name: 'Heraldo',
    frase: 'Su trompeta no anuncia el fin. Lo abre.',
    iconHint: '🛡',
    requiredStats: ['endurance', 'stamina'],
    trascendenteName: 'Arcángel',
    trascendenteFrase: 'Su última batalla fue contra Dios. Y Dios se rindió.',
  },
  {
    id: 'PROFETA',
    tier: 3,
    name: 'Profeta',
    frase: 'Vio el final antes que el principio.',
    iconHint: '🌟',
    requiredStats: ['tenacity', 'vigor'],
    trascendenteName: 'Mesías',
    trascendenteFrase: 'La profecía se cansó de esperar. Ahora camina.',
  },
  {
    id: 'CONQUISTADOR',
    tier: 3,
    name: 'Conquistador',
    frase: 'Donde planta su estandarte, cae un imperio.',
    iconHint: '👑',
    requiredStats: ['strength', 'vigor'],
    trascendenteName: 'Emperador',
    trascendenteFrase: 'Reyes lloran. Imperios caen. Él sigue.',
  },
  {
    id: 'CAMINANTE_ETERNO',
    tier: 3,
    name: 'Caminante Eterno',
    frase: 'Lleva andando desde antes que los caminos existieran.',
    iconHint: '🧭',
    requiredStats: ['stamina', 'tenacity'],
    trascendenteName: 'Exiliado',
    trascendenteFrase: 'El mundo lo desterró. Ahora lo recorre como dueño.',
  },
] as const;

export const SUPREMO: SupremoClass = {
  id: 'MAESTRO_SUPREMO',
  tier: 5,
  name: 'Maestro Supremo',
  frase: 'Trascendiste el cuerpo. Trascendiste el alma. Ahora ERES.',
};

export const LEYENDA: LeyendaClass = {
  id: 'LEYENDA',
  tier: 6,
  name: 'Leyenda',
  frase: 'Cantarán tu nombre cuando ya no quede nadie para escucharlo.',
};

// ───── Lookup helpers ─────

export const findVocation = (id: string): VocationClass | undefined =>
  VOCATIONS.find((v) => v.id === id);

export const findSpecialization = (
  id: string
): SpecializationClass | undefined => SPECIALIZATIONS.find((s) => s.id === id);

export const findLegendary = (id: string): LegendaryClass | undefined =>
  LEGENDARIES.find((l) => l.id === id);

export const isValidVocationId = (id: string): boolean =>
  VOCATIONS.some((v) => v.id === id);

export const isValidSpecializationId = (id: string): boolean =>
  SPECIALIZATIONS.some((s) => s.id === id);

export const isValidLegendaryId = (id: string): boolean =>
  LEGENDARIES.some((l) => l.id === id);

export const specializationsByLinage = (
  linage: LinageId
): SpecializationClass[] => SPECIALIZATIONS.filter((s) => s.linage === linage);
