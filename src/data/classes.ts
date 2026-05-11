/**
 * Character class catalog — single source of truth for the 38 classes.
 *
 * Tier structure:
 *   T0  — ESCUDERO (start, no choice)
 *   T1  — VOCATIONS (6, one per stat)
 *   T2  — SPECIALIZATIONS (18, three per lineage)
 *   T3  — LEGENDARIES (12, each fed by 3 T2s on average)
 *   T4  — TRANSCENDENT (form upgrade of T3, no new class)
 *   T5  — MAESTRO SUPREMO (single endgame class)
 *   T6  — LEYENDA (cosmetic title, all stats = 99)
 *
 * The client consumes this catalog through `GET /character/catalog` — there is
 * no client-side mirror to keep in sync.
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

export type LineageId =
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
  id: LineageId;
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
  lineage: LineageId;
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
  transcendentName: string;
  transcendentFrase: string;
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
  // Display label for the rank-F starting state. The internal id stays
  // 'ESCUDERO' so existing user_class_state rows and FK references
  // don't need a migration; only the visible string changes. The user
  // reads "Sin clase" because tier 0 hasn't yet picked a path —
  // calling them "Escudero" implies they made a choice they didn't.
  name: 'Sin clase',
  frase: 'Todo heroe empezo siendo nadie.',
};

export const VOCATIONS: readonly VocationClass[] = [
  {
    id: 'GUERRERO',
    tier: 1,
    name: 'Guerrero',
    frase: 'Cada cicatriz es una victoria que sobrevivio.',
    dominantStat: 'strength',
  },
  {
    id: 'PALADIN',
    tier: 1,
    name: 'Paladin',
    frase: 'Donde el mundo termina, el sigue de pie.',
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
    name: 'Picaro',
    frase: 'Antes de tu proximo aliento, ya esta detras.',
    dominantStat: 'agility',
  },
  {
    id: 'MONJE',
    tier: 1,
    name: 'Monje',
    frase: 'Mil veces caido. Mil y una de pie.',
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
    lineage: 'GUERRERO',
    secondaryStat: 'endurance',
    legendaryOptions: ['CABALLERO_APOCALIPTICO', 'HERALDO'],
  },
  {
    id: 'DUELISTA',
    tier: 2,
    name: 'Duelista',
    frase: 'Cien aceros han bailado con el suyo. Ninguno volvio.',
    lineage: 'GUERRERO',
    secondaryStat: 'agility',
    legendaryOptions: ['TITAN', 'VENGADOR'],
  },
  {
    id: 'MERCENARIO',
    tier: 2,
    name: 'Mercenario',
    frase: 'Su acero al mejor postor. Su honor, a nadie.',
    lineage: 'GUERRERO',
    secondaryStat: 'stamina',
    legendaryOptions: ['TITAN', 'CAMINANTE_ETERNO'],
  },
  // Paladin (END)
  {
    id: 'CRUZADO',
    tier: 2,
    name: 'Cruzado',
    frase: 'Su mandoble bautiza. Su fe, condena.',
    lineage: 'PALADIN',
    secondaryStat: 'strength',
    legendaryOptions: ['CABALLERO_APOCALIPTICO', 'INMORTAL'],
  },
  {
    id: 'TEMPLARIO',
    tier: 2,
    name: 'Templario',
    frase: 'El juramento que pronuncio arde aun en su pecho.',
    lineage: 'PALADIN',
    secondaryStat: 'vigor',
    legendaryOptions: ['INMORTAL', 'PROFETA'],
  },
  {
    id: 'GUARDIAN',
    tier: 2,
    name: 'Guardian',
    frase: 'Detras de el, el mundo respira.',
    lineage: 'PALADIN',
    secondaryStat: 'tenacity',
    legendaryOptions: ['HIEROFANTE', 'INMORTAL'],
  },
  // Cazador (STA)
  {
    id: 'EXPLORADOR',
    tier: 2,
    name: 'Explorador',
    frase: 'Dibuja los mapas que aun no existen.',
    lineage: 'CAZADOR',
    secondaryStat: 'agility',
    legendaryOptions: ['ARCHIDRUIDA', 'HERALDO'],
  },
  {
    id: 'TRAMPERO',
    tier: 2,
    name: 'Trampero',
    frase: 'Cuando lo escuchas, ya estas dentro de su trampa.',
    lineage: 'CAZADOR',
    secondaryStat: 'tenacity',
    legendaryOptions: ['CAMINANTE_ETERNO', 'HIEROFANTE'],
  },
  {
    id: 'MONTARAZ',
    tier: 2,
    name: 'Montaraz',
    frase: 'Las bestias huyen de el. Los hombres tambien deberian.',
    lineage: 'CAZADOR',
    secondaryStat: 'vigor',
    legendaryOptions: ['ARCHIDRUIDA', 'PROFETA'],
  },
  // Picaro (AGI)
  {
    id: 'ASESINO',
    tier: 2,
    name: 'Asesino',
    frase: 'Tu ultima palabra sera su nombre. Si te da tiempo.',
    lineage: 'PICARO',
    secondaryStat: 'strength',
    legendaryOptions: ['VENGADOR', 'NEMESIS'],
  },
  {
    id: 'SOMBRA',
    tier: 2,
    name: 'Sombra',
    frase: 'No veras de donde viene. Solo a donde lleva.',
    lineage: 'PICARO',
    secondaryStat: 'stamina',
    legendaryOptions: ['NEMESIS', 'HERALDO'],
  },
  {
    id: 'CAZARRECOMPENSAS',
    tier: 2,
    name: 'Cazarrecompensas',
    frase: 'Te persigue desde antes de que supieras huir.',
    lineage: 'PICARO',
    secondaryStat: 'tenacity',
    legendaryOptions: ['VENGADOR', 'CAMINANTE_ETERNO'],
  },
  // Monje (TEN)
  {
    id: 'SACERDOTE',
    tier: 2,
    name: 'Sacerdote',
    frase: 'Reza con el cuerpo. Y el cuerpo le obedece.',
    lineage: 'MONJE',
    secondaryStat: 'vigor',
    legendaryOptions: ['AVATAR', 'PROFETA'],
  },
  {
    id: 'INQUISIDOR',
    tier: 2,
    name: 'Inquisidor',
    frase: 'Su mirada quema lo que su acero no alcanza.',
    lineage: 'MONJE',
    secondaryStat: 'endurance',
    legendaryOptions: ['HIEROFANTE', 'AVATAR'],
  },
  {
    id: 'REDENTOR',
    tier: 2,
    name: 'Redentor',
    frase: 'Carga el peso de los que cayeron antes que el.',
    lineage: 'MONJE',
    secondaryStat: 'strength',
    legendaryOptions: ['CONQUISTADOR', 'CABALLERO_APOCALIPTICO'],
  },
  // Druida (VIG)
  {
    id: 'DOMADOR',
    tier: 2,
    name: 'Domador',
    frase: 'Lo que ruge en el bosque, le llama padre.',
    lineage: 'DRUIDA',
    secondaryStat: 'strength',
    legendaryOptions: ['CONQUISTADOR', 'INMORTAL'],
  },
  {
    id: 'CHAMAN',
    tier: 2,
    name: 'Chaman',
    frase: 'Las voces que oye, otros las sufren como pesadillas.',
    lineage: 'DRUIDA',
    secondaryStat: 'agility',
    legendaryOptions: ['ARCHIDRUIDA', 'NEMESIS'],
  },
  {
    id: 'SABIO',
    tier: 2,
    name: 'Sabio',
    frase: 'Lee tu cuerpo como un libro que tu no sabes leer.',
    lineage: 'DRUIDA',
    secondaryStat: 'tenacity',
    legendaryOptions: ['AVATAR', 'ARCHIDRUIDA'],
  },
] as const;

export const LEGENDARIES: readonly LegendaryClass[] = [
  {
    id: 'TITAN',
    tier: 3,
    name: 'Titan',
    frase: 'Los dioses lo enterraron. La tierra lo devolvio.',
    iconHint: '⚔',
    requiredStats: ['strength'],
    transcendentName: 'Primordial',
    transcendentFrase: 'Antes del verbo, ya tenia nombre.',
  },
  {
    id: 'CABALLERO_APOCALIPTICO',
    tier: 3,
    name: 'Caballero Apocaliptico',
    frase: 'El primero de los cuatro. Y el mas cruel.',
    iconHint: '🗡',
    requiredStats: ['strength', 'endurance'],
    transcendentName: 'Apocalipsis',
    transcendentFrase: 'El dia final ya ha sido escrito. Con su sangre.',
  },
  {
    id: 'INMORTAL',
    tier: 3,
    name: 'Inmortal',
    frase: 'Vio nacer reinos. Vera morir los que aun no nacen.',
    iconHint: '♾',
    requiredStats: ['endurance', 'vigor'],
    transcendentName: 'Leviatan',
    transcendentFrase:
      'Bajo las olas duerme. Cuando despierta, el mar se vacia.',
  },
  {
    id: 'NEMESIS',
    tier: 3,
    name: 'Nemesis',
    frase: 'Tiene una lista. Tu nombre esta en ella. En tinta.',
    iconHint: '🌑',
    requiredStats: ['agility', 'stamina'],
    transcendentName: 'Perdicion',
    transcendentFrase: 'Pronunciar su nombre es renunciar al tuyo.',
  },
  {
    id: 'AVATAR',
    tier: 3,
    name: 'Avatar',
    frase: 'Lo divino tomo forma humana. Y se canso del cielo.',
    iconHint: '☯',
    requiredStats: ['vigor', 'tenacity'],
    transcendentName: 'Deidad',
    transcendentFrase: 'Los dioses muertos murmuran su nombre con miedo.',
  },
  {
    id: 'HIEROFANTE',
    tier: 3,
    name: 'Hierofante',
    frase: 'Guarda verdades que matarian a quien las pronunciase.',
    iconHint: '☥',
    requiredStats: ['tenacity', 'endurance'],
    transcendentName: 'Patriarca',
    transcendentFrase: 'Su silencio condena. Su palabra crea ley.',
  },
  {
    id: 'ARCHIDRUIDA',
    tier: 3,
    name: 'Archidruida',
    frase: 'Las raices le obedecen. El cielo escucha.',
    iconHint: '🌿',
    requiredStats: ['vigor', 'stamina'],
    transcendentName: 'Primarca',
    transcendentFrase: 'El bosque desperto porque el lo sono.',
  },
  {
    id: 'VENGADOR',
    tier: 3,
    name: 'Vengador',
    frase: 'No olvida. No perdona. No falla.',
    iconHint: '⚡',
    requiredStats: ['strength', 'agility'],
    transcendentName: 'Justiciero',
    transcendentFrase: 'La balanza esta en su mano. Tu nombre, en su lista.',
  },
  {
    id: 'HERALDO',
    tier: 3,
    name: 'Heraldo',
    frase: 'Su trompeta no anuncia el fin. Lo abre.',
    iconHint: '🛡',
    requiredStats: ['endurance', 'stamina'],
    transcendentName: 'Arcangel',
    transcendentFrase: 'Su ultima batalla fue contra Dios. Y Dios se rindio.',
  },
  {
    id: 'PROFETA',
    tier: 3,
    name: 'Profeta',
    frase: 'Vio el final antes que el principio.',
    iconHint: '🌟',
    requiredStats: ['tenacity', 'vigor'],
    transcendentName: 'Mesias',
    transcendentFrase: 'La profecia se canso de esperar. Ahora camina.',
  },
  {
    id: 'CONQUISTADOR',
    tier: 3,
    name: 'Conquistador',
    frase: 'Donde planta su estandarte, cae un imperio.',
    iconHint: '👑',
    requiredStats: ['strength', 'vigor'],
    transcendentName: 'Emperador',
    transcendentFrase: 'Reyes lloran. Imperios caen. El sigue.',
  },
  {
    id: 'CAMINANTE_ETERNO',
    tier: 3,
    name: 'Caminante Eterno',
    frase: 'Lleva andando desde antes que los caminos existieran.',
    iconHint: '🧭',
    requiredStats: ['stamina', 'tenacity'],
    transcendentName: 'Exiliado',
    transcendentFrase: 'El mundo lo desterro. Ahora lo recorre como dueño.',
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
  frase: 'Cantaran tu nombre cuando ya no quede nadie para escucharlo.',
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

export const specializationsByLineage = (
  lineage: LineageId
): SpecializationClass[] =>
  SPECIALIZATIONS.filter((s) => s.lineage === lineage);
