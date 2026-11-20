import {
  AIManagerStyle,
  Club,
  CompetitionId,
  CustomClubConfig,
  FinanceTransaction,
  Fixture,
  FormationId,
  HomegrownStatus,
  LeagueId,
  LeagueStanding,
  ManagerProfile,
  MentoringGroup,
  NewsItem,
  Player,
  PlayerAttributes,
  PlayerRole,
  PositionCode,
  ScenarioChallengeId,
  SeasonAwardRecord,
  StaffMember,
  StaffRole,
  TrophyHistoryRecord,
  UefaCompetitionId,
  WorldState,
} from '../types/game';
import { CLUB_TEMPLATES, LEAGUES_CONFIG, NATIONALITY_POOLS } from './leaguesConfig';
import { REAL_CLUB_CORE_PLAYERS, REAL_CLUB_ROSTERS, RealPlayerSeed } from './realRostersData';
import {
  createInitialStandings,
  generateContinentalChampionsCupFixtures,
  generateEuropeanNationsCupFixtures,
  generateInitialDomesticCupFixtures,
  generateLeagueSchedule,
  generateSeasonSuperCupFixtures,
} from './leagueEngine';
import { SeededRNG } from './random';
import {
  autoPickLineup,
  autoRegisterSquadIds,
  buildAuthenticTeamInstructions,
  derivePlayerTraitsFromAttributes,
  getLeagueRegistrationRules,
  getPlayerHomegrownStatus,
  isPlayerHomegrownForClub,
  ROLES_BY_POSITION,
} from './tacticsEngine';
import { trText } from '../i18n/LanguageContext';
import {
  buildUefaFourPots,
  generateUefaSwissSchedule,
  recomputeUefaStandings,
  selectUefaQualifiedClubs,
  UEFA_COMPETITIONS_CONFIG,
} from './uefaEngine';

// Stage 12: Authentic Club-Trained (HG-C) graduates & Foreign Nation-Trained (HG-N) players
const CLUB_TRAINED_PLAYERS_BY_CLUB: Record<string, string[]> = {
  ARS: ['bukayo saka', 'ethan nwaneri', 'myles lewis-skelly', 'max dowman', 'reiss nelson', 'eddie nketiah'],
  MCI: ['phil foden', 'rico lewis', 'oscar bobb', 'james mcatee', 'nico o reilly', 'nico oreilly', 'divin mubama'],
  LIV: ['curtis jones', 'conor bradley', 'jarell quansah', 'trent alexander-arnold', 'caoimhin kelleher', 'stefan bajcetic', 'harvey elliott', 'trey nyoni', 'rio ngumoha'],
  CHE: ['reece james', 'levi colwill', 'trevoh chalobah', 'josh acheampong', 'tyrique george', 'conor gallagher'],
  MUN: ['kobbie mainoo', 'marcus rashford', 'luke shaw', 'alejandro garnacho', 'toby collyer', 'scott mctominay', 'tom heaton'],
  TOT: ['mikey moore', 'oliver skipp', 'brandon austin', 'alfie whiteman', 'dane scarlett'],
  NEW: ['sean longstaff', 'lewis miley', 'elliot anderson', 'paul dummett'],
  AVL: ['jacob ramsey', 'kaine kesler-hayden'],
  RMA: ['dani carvajal', 'daniel carvajal', 'fran garcia', 'lucas vazquez', 'raul asencio', 'federico valverde', 'vinicius junior', 'rodrygo', 'nico paz'],
  BAR: ['lamine yamal', 'pau cubarsi', 'gavi', 'alejandro balde', 'fermin lopez', 'marc casado', 'marc bernal', 'hector fort', 'inaki pena', 'ansu fati', 'eric garcia', 'dani olmo', 'guille fernandez'],
  ATM: ['pablo barrios', 'koke', 'rodrigo riquelme', 'giuliano simeone'],
  BAY: ['jamal musiala', 'aleksandar pavlovic', 'josip stanisic', 'thomas muller', 'paul wanner', 'adam aznou'],
  FCB: ['jamal musiala', 'aleksandar pavlovic', 'josip stanisic', 'thomas muller', 'paul wanner', 'adam aznou'],
  BVB: ['jamie gittens', 'jamie bynoe-gittens', 'giovanni reyna', 'youssoufa moukoko', 'kjell watjen', 'julien duranville'],
  INT: ['federico dimarco', 'alessandro bastoni', 'valentin carboni', 'francesco pio esposito', 'sebastiano esposito'],
  ROM: ['lorenzo pellegrini', 'niccolo pisilli', 'edoardo bove', 'nicola zalewski'],
  JUV: ['kenan yildiz', 'nicolo fagioli', 'nicolo savona', 'samuel mbangula', 'fabio miretti'],
  MIL: ['davide calabria', 'matteo gabbia', 'tommaso pobega', 'francesco camarda', 'mattia liberali'],
  PSG: ['warren zaire-emery', 'senny mayulu', 'presnel kimpembe', 'ibrahim mbaye', 'yoram zague'],
  MON: ['maghnes akliouche', 'eliesse ben seghir', 'soungoutou magassa'],
  OL: ['rayan cherki', 'maxence caqueret', 'malick fofana'],
};

const FOREIGN_NATION_HOMEGROWN_PLAYERS: Record<string, string[]> = {
  ENG: [
    'william saliba', 'gabriel martinelli', 'david raya', 'nathan ake', 'alejandro garnacho',
    'amad diallo', 'evan ferguson', 'andreas pereira', 'emiliano martinez', 'hector bellerin',
    'romeo lavia', 'brennan johnson', 'ben davies', 'ethan ampadu', 'harry wilson', 'neco williams',
    'caoimhin kelleher', 'conor bradley', 'andrew robertson', 'john mcginn', 'scott mctominay',
    'billy gilmour', 'aaron hickey', 'lewis ferguson', 'kieran tierney', 'che adams',
  ],
  ESP: [
    'vinicius junior', 'rodrygo', 'federico valverde', 'eder militao', 'ronald araujo',
    'raphinha', 'eduardo camavinga', 'antoine griezmann', 'jan oblak', 'jose maria gimenez',
    'angel correa', 'iñaki williams', 'inaki williams', 'takefusa kubo', 'kang-in lee',
  ],
  ITA: [
    'kenan yildiz', 'nico paz', 'paul pogba', 'romelu lukaku', 'samir handanovic',
    'valentin carboni', 'matias soule', 'dean huijsen', 'assane diao', 'koni de winter',
  ],
  GER: [
    'jamal musiala', 'josip stanisic', 'alphonso davies', 'mathys tel', 'jamie gittens',
    'jamie bynoe-gittens', 'giovanni reyna', 'xavi simons', 'jeremie frimpong', 'piero hincapie',
  ],
  FRA: [
    'achraf hakimi', 'nuno mendes', 'eliesse ben seghir', 'fode ballo-toure',
    'malick fofana', 'fali cande', 'jonathan david',
  ],
};

function normalizePlayerNameForHg(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function resolveInitialHomegrownStatus(
  firstName: string,
  lastName: string,
  natCode: string,
  isYouth: boolean | undefined,
  clubShortName: string,
  clubCountryId: string
): HomegrownStatus {
  if (isYouth) return 'HGC';
  const fullName = normalizePlayerNameForHg(firstName, lastName);
  const lastOnly = lastName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, ' ')
    .toLowerCase()
    .trim();

  const clubTrainedList = CLUB_TRAINED_PLAYERS_BY_CLUB[clubShortName] || [];
  if (clubTrainedList.includes(fullName) || (lastOnly.length >= 5 && clubTrainedList.includes(lastOnly))) {
    return 'HGC';
  }

  const domesticCodes = clubCountryId === 'ENG' ? ['ENG', 'WAL'] : clubCountryId === 'USA' ? ['USA', 'CAN'] : [clubCountryId];
  if (domesticCodes.includes(natCode)) {
    return 'HGN';
  }

  const foreignHgList = FOREIGN_NATION_HOMEGROWN_PLAYERS[clubCountryId] || [];
  if (foreignHgList.includes(fullName) || (lastOnly.length >= 5 && foreignHgList.includes(lastOnly))) {
    return 'HGN';
  }

  return 'NONE';
}

const REAL_CLUB_WONDERKIDS: Record<string, RealPlayerSeed[]> = {
  ARS: [
    ['Ethan', 'Nwaneri', 'AMC', 'ENG', 18, 144, 185, ['AMR', 'MC']],
    ['Myles', 'Lewis-Skelly', 'DL', 'ENG', 18, 142, 182, ['DM', 'MC']],
    ['Max', 'Dowman', 'AMC', 'ENG', 16, 126, 186, ['AMR', 'MC']],
  ],
  MCI: [
    ['Rico', 'Lewis', 'DR', 'ENG', 20, 152, 179, ['DM', 'DL']],
    ['Vitor', 'Reis', 'DC', 'BRA', 19, 138, 180, ['DR']],
  ],
  LIV: [
    ['Trey', 'Nyoni', 'MC', 'ENG', 18, 134, 180, ['AMC', 'DM']],
    ['Rio', 'Ngumoha', 'AML', 'ENG', 17, 130, 185, ['AMR', 'ST']],
  ],
  CHE: [
    ['Estevao', 'Willian', 'AMR', 'BRA', 18, 154, 192, ['AMC', 'AML']],
    ['Kendry', 'Paez', 'AMC', 'ECU', 18, 140, 184, ['AMR', 'MC']],
    ['Josh', 'Acheampong', 'DR', 'ENG', 19, 136, 178, ['DC']],
    ['Tyrique', 'George', 'AML', 'ENG', 19, 135, 177, ['AMR']],
  ],
  MUN: [
    ['Kobbie', 'Mainoo', 'MC', 'ENG', 20, 156, 185, ['DM', 'AMC']],
    ['Leny', 'Yoro', 'DC', 'FRA', 19, 152, 186, ['DR']],
    ['Chido', 'Obi-Martin', 'ST', 'DEN', 17, 132, 184, ['AMC']],
  ],
  TOT: [
    ['Archie', 'Gray', 'DM', 'ENG', 19, 146, 183, ['DR', 'MC', 'DC']],
    ['Lucas', 'Bergvall', 'MC', 'SWE', 19, 144, 182, ['AMC', 'DM']],
    ['Mikey', 'Moore', 'AML', 'ENG', 18, 136, 183, ['AMR', 'AMC']],
  ],
  SUN: [
    ['Chris', 'Rigg', 'MC', 'ENG', 18, 138, 182, ['AMC', 'DM']],
  ],
  BAR: [
    ['Lamine', 'Yamal', 'AMR', 'ESP', 18, 178, 196, ['AML', 'AMC']],
    ['Pau', 'Cubarsi', 'DC', 'ESP', 18, 162, 190, ['DM']],
    ['Marc', 'Bernal', 'DM', 'ESP', 18, 145, 185, ['MC']],
    ['Fermin', 'Lopez', 'AMC', 'ESP', 21, 156, 178, ['MC', 'AML']],
    ['Hector', 'Fort', 'DR', 'ESP', 19, 138, 178, ['DL']],
    ['Guille', 'Fernandez', 'MC', 'ESP', 17, 132, 182, ['AMC']],
  ],
  RMA: [
    ['Arda', 'Guler', 'AMC', 'TUR', 20, 160, 188, ['AMR', 'MC']],
    ['Franco', 'Mastantuono', 'AMC', 'ARG', 18, 146, 188, ['AMR', 'MC']],
    ['Joan', 'Martinez', 'DC', 'ESP', 18, 134, 183, []],
  ],
  ATM: [
    ['Pablo', 'Barrios', 'MC', 'ESP', 21, 154, 180, ['DM']],
  ],
  PSG: [
    ['Warren', 'Zaire-Emery', 'MC', 'FRA', 19, 164, 190, ['DM', 'DR']],
    ['Joao', 'Neves', 'DM', 'POR', 20, 166, 189, ['MC']],
    ['Desire', 'Doue', 'AML', 'FRA', 20, 160, 188, ['AMC', 'AMR', 'MC']],
    ['Senny', 'Mayulu', 'AMC', 'FRA', 19, 140, 181, ['MC']],
    ['Ibrahim', 'Mbaye', 'AMR', 'FRA', 17, 132, 182, ['AML']],
  ],
  LOSC: [
    ['Ayyoub', 'Bouaddi', 'MC', 'FRA', 17, 142, 186, ['DM']],
  ],
  FCB: [
    ['Jamal', 'Musiala', 'AMC', 'GER', 22, 178, 193, ['AML', 'MC']],
    ['Aleksandar', 'Pavlovic', 'DM', 'GER', 21, 160, 185, ['MC']],
    ['Lennart', 'Karl', 'AMR', 'GER', 17, 134, 184, ['AMC']],
  ],
  BVB: [
    ['Julien', 'Duranville', 'AMR', 'BEL', 19, 142, 183, ['AML']],
    ['Kjell', 'Watjen', 'MC', 'GER', 19, 136, 178, ['AMC']],
  ],
  SGE: [
    ['Can', 'Uzun', 'AMC', 'TUR', 19, 144, 182, ['ST']],
  ],
  JUV: [
    ['Kenan', 'Yildiz', 'AML', 'TUR', 20, 158, 187, ['AMC', 'ST']],
  ],
  MIL: [
    ['Francesco', 'Camarda', 'ST', 'ITA', 17, 134, 188, []],
  ],
  COM: [
    ['Nico', 'Paz', 'AMC', 'ARG', 20, 154, 185, ['MC', 'AMR']],
    ['Assane', 'Diao', 'AMR', 'ESP', 19, 146, 182, ['AML', 'ST']],
  ],
  SLB: [
    ['Antonio', 'Silva', 'DC', 'POR', 21, 156, 183, []],
  ],
  SCP: [
    ['Geovany', 'Quenda', 'AMR', 'POR', 18, 148, 187, ['WBR', 'AML']],
  ],
  FCP: [
    ['Rodrigo', 'Mora', 'AMC', 'POR', 18, 142, 186, ['AMR']],
    ['Samu', 'Aghehowa', 'ST', 'ESP', 21, 156, 183, []],
  ],
  AJX: [
    ['Rayane', 'Bounida', 'AMC', 'BEL', 19, 138, 182, ['AML']],
  ],
  MIA: [
    ['Lionel', 'Messi', 'AMR', 'ARG', 38, 174, 180, ['AMC', 'ST']],
    ['Luis', 'Suarez', 'ST', 'URU', 38, 162, 170, []],
    ['Sergio', 'Busquets', 'DM', 'ESP', 37, 160, 170, ['MC']],
    ['Jordi', 'Alba', 'DL', 'ESP', 36, 158, 168, ['WBL']],
    ['Benjamin', 'Cremaschi', 'MC', 'USA', 20, 138, 176, ['AMC']],
  ],
  LAG: [
    ['Riqui', 'Puig', 'AMC', 'ESP', 25, 158, 172, ['MC']],
    ['Marco', 'Reus', 'AMC', 'GER', 36, 156, 166, ['AML']],
    ['Gabriel', 'Pec', 'AMR', 'BRA', 24, 154, 170, ['AML']],
  ],
  LAFC: [
    ['Heung-Min', 'Son', 'AML', 'KOR', 33, 170, 170, ['ST']],
    ['Denis', 'Bouanga', 'AML', 'GAB', 30, 158, 164, ['ST']],
    ['Hugo', 'Lloris', 'GK', 'FRA', 38, 154, 164, []],
  ],
  HIL: [
    ['Aleksandar', 'Mitrovic', 'ST', 'SRB', 30, 166, 172, []],
    ['Ruben', 'Neves', 'DM', 'POR', 28, 166, 174, ['MC']],
    ['Sergej', 'Milinkovic-Savic', 'MC', 'SRB', 30, 166, 172, ['AMC']],
    ['Joao', 'Cancelo', 'DR', 'POR', 31, 166, 172, ['DL']],
    ['Yassine', 'Bounou', 'GK', 'MAR', 34, 164, 170, []],
    ['Malcom', 'Oliveira', 'AMR', 'BRA', 28, 162, 170, ['AMC']],
  ],
  NAS: [
    ['Cristiano', 'Ronaldo', 'ST', 'POR', 40, 170, 180, ['AML']],
    ['Sadio', 'Mane', 'AML', 'SEN', 33, 162, 170, ['AMR']],
    ['Marcelo', 'Brozovic', 'DM', 'CRO', 32, 162, 170, ['MC']],
    ['Otavio', 'Monteiro', 'AMC', 'POR', 30, 162, 168, ['MC']],
  ],
  ITT: [
    ['Karim', 'Benzema', 'ST', 'FRA', 37, 168, 176, ['AMC']],
    ['NGolo', 'Kante', 'DM', 'FRA', 34, 164, 172, ['MC']],
    ['Moussa', 'Diaby', 'AMR', 'FRA', 26, 162, 172, ['AML']],
    ['Fabio', 'Tavares', 'DM', 'BRA', 31, 160, 168, ['DC']],
  ],
  AHL: [
    ['Riyad', 'Mahrez', 'AMR', 'ALG', 34, 162, 170, []],
    ['Ivan', 'Toney', 'ST', 'ENG', 29, 162, 168, []],
    ['Franck', 'Kessie', 'MC', 'CIV', 28, 160, 168, ['DM']],
  ],
  FLA: [
    ['Gerson', 'Santos', 'MC', 'BRA', 28, 160, 166, ['AMC']],
    ['Pedro', 'Guilherme', 'ST', 'BRA', 28, 162, 168, []],
    ['Giorgian', 'De Arrascaeta', 'AMC', 'URU', 31, 162, 168, ['AML']],
    ['Lorran', 'Lucas', 'AMC', 'BRA', 19, 140, 184, ['AMR']],
  ],
  PAL: [
    ['Raphael', 'Veiga', 'AMC', 'BRA', 30, 160, 166, ['MC']],
    ['Paulinho', 'Sampaio', 'AML', 'BRA', 25, 158, 168, ['ST']],
    ['Vitor', 'Roque', 'ST', 'BRA', 20, 150, 182, ['AMR']],
  ],
  SAN: [
    ['Neymar', 'Junior', 'AMC', 'BRA', 33, 168, 178, ['AML', 'ST']],
  ],
  COR: [
    ['Memphis', 'Depay', 'ST', 'NED', 31, 160, 168, ['AML', 'AMC']],
  ],
  RBS: [
    ['Karim', 'Konate', 'ST', 'CIV', 21, 150, 182, []],
  ],
  OLY: [
    ['Ayoub', 'El Kaabi', 'ST', 'MAR', 32, 158, 164, []],
    ['Christos', 'Mouzakitis', 'MC', 'GRE', 18, 138, 182, ['DM']],
  ],
  VIS: [
    ['Yuya', 'Osako', 'ST', 'JPN', 35, 150, 156, []],
    ['Yoshinori', 'Muto', 'AMR', 'JPN', 32, 150, 156, ['ST']],
  ],
  WRX: [
    ['Paul', 'Mullin', 'ST', 'ENG', 30, 136, 142, []],
    ['Elliot', 'Lee', 'AMC', 'ENG', 30, 135, 140, ['MC']],
  ],
  BIR: [
    ['Jay', 'Stansfield', 'ST', 'ENG', 22, 142, 168, ['AML']],
  ],
  BOT: [
    ['Jefferson', 'Savarino', 'AMC', 'VEN', 28, 156, 164, ['AMR', 'AML']],
    ['Alex', 'Telles', 'DL', 'BRA', 32, 156, 162, ['WBL']],
  ],
  SAO: [
    ['Lucas', 'Moura', 'AMR', 'BRA', 32, 158, 166, ['AMC', 'AML']],
    ['Oscar', 'Emboaba', 'AMC', 'BRA', 33, 158, 166, ['MC']],
    ['Jonathan', 'Calleri', 'ST', 'ARG', 31, 156, 162, []],
  ],
  FLU: [
    ['German', 'Cano', 'ST', 'ARG', 37, 154, 160, []],
    ['Thiago', 'Silva', 'DC', 'BRA', 40, 160, 168, []],
  ],
  YFM: [
    ['Anderson', 'Lopes', 'ST', 'BRA', 31, 152, 158, []],
    ['Yan', 'Matheus', 'AMR', 'BRA', 26, 150, 160, ['AML']],
  ],
  KAW: [
    ['Yasuto', 'Wakizaka', 'AMC', 'JPN', 30, 150, 158, ['MC']],
    ['Marcinho', 'Silva', 'AML', 'BRA', 30, 148, 156, ['AMR']],
    ['Shin', 'Yamada', 'ST', 'JPN', 25, 148, 164, []],
  ],
  URA: [
    ['Ryoma', 'Watanabe', 'AMC', 'JPN', 28, 148, 156, ['MC', 'AML']],
    ['Thiago', 'Santana', 'ST', 'BRA', 32, 150, 156, []],
    ['Shusaku', 'Nishikawa', 'GK', 'JPN', 39, 148, 154, []],
  ],
  FCB2: [
    ['Xherdan', 'Shaqiri', 'AMC', 'SUI', 33, 156, 164, ['AMR']],
    ['Kevin', 'Carlos', 'ST', 'ESP', 24, 148, 166, []],
    ['Dominik', 'Schmid', 'DL', 'SUI', 27, 146, 156, ['WBL']],
  ],
  YB: [
    ['Cedric', 'Itten', 'ST', 'SUI', 28, 148, 156, []],
    ['Filip', 'Ugrinic', 'MC', 'SUI', 26, 152, 164, ['AMC']],
    ['Kastriot', 'Imeri', 'AML', 'SUI', 25, 148, 164, ['AMC']],
  ],
  PAOK: [
    ['Giannis', 'Konstantelias', 'AMC', 'GRE', 22, 156, 182, ['AML']],
    ['Andrija', 'Zivkovic', 'AMR', 'SRB', 28, 158, 166, ['AML']],
    ['Kiril', 'Despodov', 'AMR', 'BUL', 28, 154, 162, ['ST']],
  ],
  PAO: [
    ['Tete', 'Martins', 'AMR', 'BRA', 25, 156, 170, ['AMC']],
    ['Anastasios', 'Bakasetas', 'AMC', 'GRE', 32, 154, 162, ['MC']],
  ],
  AEK: [
    ['Levi', 'Garcia', 'ST', 'TRI', 27, 156, 166, ['AMR']],
    ['Orbelin', 'Pineda', 'MC', 'MEX', 29, 156, 164, ['AMC', 'AML']],
    ['Anthony', 'Martial', 'ST', 'FRA', 29, 158, 168, ['AML']],
  ],
};

const SQUAD_BLUEPRINT: { pos: PositionCode; secondary: PositionCode[]; isYouth?: boolean }[] = [
  { pos: 'GK', secondary: [] },
  { pos: 'GK', secondary: [] },
  { pos: 'DL', secondary: ['WBL'] },
  { pos: 'DL', secondary: ['DC'] },
  { pos: 'DC', secondary: [] },
  { pos: 'DC', secondary: [] },
  { pos: 'DC', secondary: ['DM'] },
  { pos: 'DC', secondary: ['DR'] },
  { pos: 'DR', secondary: ['WBR'] },
  { pos: 'DR', secondary: ['MR'] },
  { pos: 'DM', secondary: ['MC'] },
  { pos: 'MC', secondary: ['DM'] },
  { pos: 'MC', secondary: ['AMC'] },
  { pos: 'MC', secondary: ['ML', 'MR'] },
  { pos: 'AMC', secondary: ['MC', 'AML'] },
  { pos: 'AML', secondary: ['ML', 'ST'] },
  { pos: 'AMR', secondary: ['MR', 'ST'] },
  { pos: 'ST', secondary: ['AMC'] },
  { pos: 'ST', secondary: ['AML', 'AMR'] },
  { pos: 'MC', secondary: ['AMC'], isYouth: true },
  { pos: 'ST', secondary: ['AMR'], isYouth: true },
];

const FORMATIONS_POOL: FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '4-1-4-1',
  '3-5-2',
  '3-4-3',
];

const AI_STYLES: AIManagerStyle[] = [
  'Attacking Manager',
  'Defensive Manager',
  'Youth Developer',
  'Possession-focused Manager',
  'Counter-attacking Manager',
  'Pragmatic Manager',
];

function capitalizeName(raw: string): string {
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function clampAttr(val: number): number {
  return Math.max(1, Math.min(20, Math.round(val)));
}

function generateAttributesForPosition(
  pos: PositionCode,
  targetCa: number, // 80..192
  rng: SeededRNG
): PlayerAttributes {
  // Base attribute level on 1..20 scale corresponding to CA (e.g., 140 CA -> ~13.8 base)
  const base = Math.max(6, Math.min(18.5, targetCa / 10.2));
  const jitter = () => rng.float(-1.8, 1.8);

  const isGK = pos === 'GK';
  const isDef = ['DL', 'DR', 'DC', 'WBL', 'WBR'].includes(pos);
  const isMid = ['DM', 'MC', 'ML', 'MR', 'AMC'].includes(pos);
  const isAtt = ['AML', 'AMR', 'ST'].includes(pos);

  return {
    technical: {
      finishing: clampAttr(isAtt ? base + 2 + jitter() : isMid ? base - 1 + jitter() : isGK ? 3 : base - 4 + jitter()),
      firstTouch: clampAttr(isGK ? base - 2 + jitter() : base + jitter()),
      passing: clampAttr(isMid ? base + 1.8 + jitter() : base + jitter()),
      technique: clampAttr(isMid || isAtt ? base + 1.5 + jitter() : base - 0.5 + jitter()),
      dribbling: clampAttr(isAtt ? base + 1.8 + jitter() : isMid ? base + 0.5 + jitter() : isGK ? 3 : base - 2 + jitter()),
      crossing: clampAttr(['DL', 'DR', 'WBL', 'WBR', 'ML', 'MR', 'AML', 'AMR'].includes(pos) ? base + 1.5 + jitter() : base - 2 + jitter()),
      heading: clampAttr(pos === 'DC' || pos === 'ST' ? base + 1.6 + jitter() : base - 1 + jitter()),
      tackling: clampAttr(isDef || pos === 'DM' ? base + 2.2 + jitter() : isMid ? base + jitter() : isGK ? 4 : base - 4 + jitter()),
      marking: clampAttr(isDef || pos === 'DM' ? base + 2 + jitter() : isMid ? base - 0.5 + jitter() : 5),
      longShots: clampAttr(isMid || isAtt ? base + jitter() : base - 3 + jitter()),
      penaltyTaking: clampAttr(isAtt ? base + 1 + jitter() : base - 1 + jitter()),
      freeKickTaking: clampAttr(isMid || isAtt ? base + jitter() : base - 2 + jitter()),
      corners: clampAttr(isMid ? base + jitter() : base - 2 + jitter()),
      ballControl: clampAttr(base + 0.5 + jitter()),
    },
    mental: {
      decisions: clampAttr(base + 0.5 + jitter()),
      vision: clampAttr(isMid || pos === 'AMC' ? base + 1.8 + jitter() : base - 0.5 + jitter()),
      composure: clampAttr(base + 0.5 + jitter()),
      concentration: clampAttr(isGK || isDef ? base + 1.4 + jitter() : base + jitter()),
      positioning: clampAttr(isGK || isDef || pos === 'DM' ? base + 2 + jitter() : base - 1 + jitter()),
      anticipation: clampAttr(base + 0.6 + jitter()),
      workRate: clampAttr(base + 0.8 + jitter()),
      teamwork: clampAttr(base + 0.6 + jitter()),
      leadership: clampAttr(rng.int(6, 18)),
      determination: clampAttr(base + rng.float(-1.5, 3)),
      aggression: clampAttr(rng.int(7, 17)),
      flair: clampAttr(isAtt || pos === 'AMC' ? base + 1.5 + jitter() : rng.int(6, 15)),
      offTheBall: clampAttr(isAtt || isMid ? base + 1.4 + jitter() : base - 1.5 + jitter()),
      bravery: clampAttr(isDef || isGK ? base + 1.2 + jitter() : base + jitter()),
      consistency: clampAttr(base + jitter()),
    },
    physical: {
      acceleration: clampAttr(['AML', 'AMR', 'ST', 'DL', 'DR', 'WBL', 'WBR'].includes(pos) ? base + 1.6 + jitter() : base + jitter()),
      pace: clampAttr(['AML', 'AMR', 'ST', 'DL', 'DR', 'WBL', 'WBR'].includes(pos) ? base + 1.5 + jitter() : base + jitter()),
      stamina: clampAttr(base + 0.8 + jitter()),
      strength: clampAttr(pos === 'DC' || pos === 'ST' || pos === 'DM' ? base + 1.6 + jitter() : base + jitter()),
      agility: clampAttr(isGK || isAtt ? base + 1.5 + jitter() : base + jitter()),
      balance: clampAttr(base + 0.5 + jitter()),
      jumpingReach: clampAttr(pos === 'GK' || pos === 'DC' || pos === 'ST' ? base + 1.8 + jitter() : base - 0.5 + jitter()),
      naturalFitness: clampAttr(rng.int(11, 18)),
    },
  };
}

export function computeCoherentCA(attrs: PlayerAttributes): number {
  const tVals = Object.values(attrs.technical);
  const mVals = Object.values(attrs.mental);
  const pVals = Object.values(attrs.physical);
  const all = [...tVals, ...mVals, ...pVals];
  const avg = all.reduce((a, b) => a + b, 0) / all.length; // 1..20
  return Math.max(65, Math.min(195, Math.round(avg * 10.4)));
}

export function calculatePlayerValuation(ca: number, pa: number, age: number, reputation: number): {
  marketValue: number;
  wagePerWeek: number;
} {
  const abilityFactor = Math.pow(Math.max(1, (ca - 70) / 10), 2.15);
  const ageMultiplier = age <= 21 ? 1.25 : age <= 26 ? 1.15 : age <= 29 ? 0.95 : age <= 32 ? 0.6 : 0.35;
  const potBonus = pa > ca ? (pa - ca) * 140_000 : 0;
  const repMultiplier = 0.65 + (reputation / 100) * 0.55;

  const rawValue = (abilityFactor * 340_000 * ageMultiplier + potBonus) * repMultiplier;
  const marketValue = Math.max(300_000, Math.round(rawValue / 50_000) * 50_000);
  const wagePerWeek = Math.max(
    3_000,
    Math.round((Math.pow(Math.max(1, (ca - 68) / 10), 1.92) * 1_550 * repMultiplier) / 500) * 500
  );

  return { marketValue, wagePerWeek };
}

function getDefaultSecondaryPositions(pos: PositionCode): PositionCode[] {
  switch (pos) {
    case 'DL':
      return ['WBL'];
    case 'DR':
      return ['WBR'];
    case 'DC':
      return [];
    case 'DM':
      return ['MC'];
    case 'MC':
      return ['DM', 'AMC'];
    case 'AMC':
      return ['MC', 'AML'];
    case 'AML':
      return ['ML', 'AMR'];
    case 'AMR':
      return ['MR', 'AML'];
    case 'ST':
      return ['AMC'];
    default:
      return [];
  }
}

function normalizePlayerNameKey(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAllRealSeedNamesSet(): Set<string> {
  const all = new Set<string>();
  for (const list of Object.values(REAL_CLUB_ROSTERS)) {
    for (const seed of list) all.add(normalizePlayerNameKey(seed[0], seed[1]));
  }
  for (const list of Object.values(REAL_CLUB_CORE_PLAYERS)) {
    for (const seed of list) all.add(normalizePlayerNameKey(seed[0], seed[1]));
  }
  for (const list of Object.values(REAL_CLUB_WONDERKIDS)) {
    for (const seed of list) all.add(normalizePlayerNameKey(seed[0], seed[1]));
  }
  return all;
}

function pickUniqueGeneratedName(
  pool: { firstNames: string[]; lastNames: string[] },
  rng: SeededRNG,
  existingNames: Set<string>,
  globalClaimedNames: Set<string>,
  allRealSeedNames: Set<string>
): { firstName: string; lastName: string; normKey: string } {
  const isTaken = (k: string) =>
    existingNames.has(k) || globalClaimedNames.has(k) || allRealSeedNames.has(k);

  for (let attempts = 0; attempts < 50; attempts++) {
    const fName = capitalizeName(rng.pick(pool.firstNames));
    const lName = capitalizeName(rng.pick(pool.lastNames));
    const normKey = normalizePlayerNameKey(fName, lName);
    if (!isTaken(normKey)) {
      return { firstName: fName, lastName: lName, normKey };
    }
  }

  // Fallback: compound surname from pool so global uniqueness is strictly guaranteed
  for (let attempts = 0; attempts < 60; attempts++) {
    const fName = capitalizeName(rng.pick(pool.firstNames));
    const l1 = capitalizeName(rng.pick(pool.lastNames));
    const l2 = capitalizeName(rng.pick(pool.lastNames));
    if (l1 === l2) continue;
    const lName = `${l1}-${l2}`;
    const normKey = normalizePlayerNameKey(fName, lName);
    if (!isTaken(normKey)) {
      return { firstName: fName, lastName: lName, normKey };
    }
  }

  const fName = capitalizeName(rng.pick(pool.firstNames));
  const lName = `${capitalizeName(rng.pick(pool.lastNames))} ${String.fromCharCode(65 + rng.int(0, 25))}`;
  return { firstName: fName, lastName: lName, normKey: normalizePlayerNameKey(fName, lName) };
}

function buildClubSquadSeeds(
  shortName: string,
  reputation: number,
  countryId: string,
  rng: SeededRNG,
  minHomegrownQuota = 8,
  globalClaimedNames: Set<string> = new Set(),
  allRealSeedNames: Set<string> = new Set()
): {
  firstName: string;
  lastName: string;
  pos: PositionCode;
  secondary: PositionCode[];
  natCode: string;
  age: number;
  targetCa: number;
  targetPa: number;
  isYouth: boolean;
}[] {
  const countryScopedKey = `${countryId}_${shortName}`;
  const rosterLookupKey = countryId === 'FRA' && shortName === 'BRE' ? 'SB29' : shortName;
  const fullRoster: RealPlayerSeed[] | undefined =
    REAL_CLUB_ROSTERS[countryScopedKey] || REAL_CLUB_ROSTERS[rosterLookupKey];
  const extraWonderkids: RealPlayerSeed[] =
    REAL_CLUB_WONDERKIDS[countryScopedKey] || REAL_CLUB_WONDERKIDS[rosterLookupKey] || [];

  if (fullRoster && fullRoster.length > 0) {
    const existingNames = new Set<string>();
    const baseList: {
      firstName: string;
      lastName: string;
      pos: PositionCode;
      secondary: PositionCode[];
      natCode: string;
      age: number;
      targetCa: number;
      targetPa: number;
      isYouth: boolean;
    }[] = [];

    fullRoster.forEach((seed, idx) => {
      const [first, last, pos, nat, age, ca, pa, sec] = seed;
      const fName = capitalizeName(first);
      const lName = capitalizeName(last);
      const normKey = normalizePlayerNameKey(fName, lName);
      if (existingNames.has(normKey) || globalClaimedNames.has(normKey)) return;
      existingNames.add(normKey);
      globalClaimedNames.add(normKey);
      const isYouth = age <= 19 && idx >= 18;
      baseList.push({
        firstName: fName,
        lastName: lName,
        pos,
        secondary: sec || getDefaultSecondaryPositions(pos),
        natCode: nat,
        age,
        targetCa: ca,
        targetPa: pa,
        isYouth,
      });
    });

    for (const wk of extraWonderkids) {
      const [first, last, pos, nat, age, ca, pa, sec] = wk;
      const fName = capitalizeName(first);
      const lName = capitalizeName(last);
      const normKey = normalizePlayerNameKey(fName, lName);
      if (!existingNames.has(normKey) && !globalClaimedNames.has(normKey)) {
        existingNames.add(normKey);
        globalClaimedNames.add(normKey);
        baseList.push({
          firstName: fName,
          lastName: lName,
          pos,
          secondary: sec || getDefaultSecondaryPositions(pos),
          natCode: nat,
          age,
          targetCa: ca,
          targetPa: pa,
          isYouth: age <= 19,
        });
      }
    }

    // Pad clubs with 11-17 real stars up to >= 21 players AND ensure league minHomegrownTotal quota is met
    const domesticPool = NATIONALITY_POOLS[countryId] || NATIONALITY_POOLS.ENG;
    const existingDomesticCount = baseList.filter(
      (p) => p.natCode === countryId || p.isYouth
    ).length;
    const neededForQuota = Math.max(0, minHomegrownQuota - existingDomesticCount);
    const neededForDepth = Math.max(0, 21 - baseList.length);
    const padCount = Math.max(neededForQuota, neededForDepth);
    const hasSecondGk = baseList.filter((p) => p.pos === 'GK').length >= 2;
    const padPositions: PositionCode[] = hasSecondGk
      ? ['DC', 'DL', 'DR', 'DM', 'MC', 'AML', 'AMR', 'ST', 'DC', 'MC']
      : ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'AML', 'AMR', 'ST', 'DC'];

    for (let i = 0; i < padCount; i++) {
      const pos = padPositions[i % padPositions.length];
      const isYouth = i >= Math.max(0, padCount - 3);
      const { firstName: fName, lastName: lName, normKey } = pickUniqueGeneratedName(
        domesticPool,
        rng,
        existingNames,
        globalClaimedNames,
        allRealSeedNames
      );
      existingNames.add(normKey);
      globalClaimedNames.add(normKey);

      const age = isYouth ? rng.int(17, 19) : rng.int(21, 28);
      const targetCa = isYouth
        ? Math.round(reputation * 1.44 + rng.int(-6, 8))
        : Math.round(reputation * 1.66 + rng.int(-8, 6));
      const targetPa = isYouth
        ? Math.min(182, targetCa + rng.int(20, 34))
        : Math.min(176, targetCa + (age <= 24 ? rng.int(6, 14) : rng.int(0, 4)));

      baseList.push({
        firstName: fName,
        lastName: lName,
        pos,
        secondary: getDefaultSecondaryPositions(pos),
        natCode: countryId,
        age,
        targetCa,
        targetPa,
        isYouth,
      });
    }

    return baseList;
  }

  const coreRoster = REAL_CLUB_CORE_PLAYERS[rosterLookupKey] || [];
  const results: {
    firstName: string;
    lastName: string;
    pos: PositionCode;
    secondary: PositionCode[];
    natCode: string;
    age: number;
    targetCa: number;
    targetPa: number;
    isYouth: boolean;
  }[] = [];

  const usedFullNames = new Set<string>();

  for (const [first, last, pos, nat, age] of coreRoster) {
    const fName = capitalizeName(first);
    const lName = capitalizeName(last);
    const normKey = normalizePlayerNameKey(fName, lName);
    if (usedFullNames.has(normKey) || globalClaimedNames.has(normKey)) continue;
    usedFullNames.add(normKey);
    globalClaimedNames.add(normKey);

    const targetCa = Math.round(reputation * 1.92 + rng.int(-6, 8));
    const potDelta = age <= 21 ? rng.int(16, 30) : age <= 24 ? rng.int(8, 18) : age <= 27 ? rng.int(2, 8) : 0;
    const targetPa = Math.min(188, targetCa + potDelta);

    results.push({
      firstName: fName,
      lastName: lName,
      pos,
      secondary: getDefaultSecondaryPositions(pos),
      natCode: nat,
      age,
      targetCa,
      targetPa,
      isYouth: false,
    });
  }

  for (const wk of extraWonderkids) {
    const [first, last, pos, nat, age, ca, pa, sec] = wk;
    const fName = capitalizeName(first);
    const lName = capitalizeName(last);
    const normKey = normalizePlayerNameKey(fName, lName);
    if (!usedFullNames.has(normKey) && !globalClaimedNames.has(normKey)) {
      usedFullNames.add(normKey);
      globalClaimedNames.add(normKey);
      results.push({
        firstName: fName,
        lastName: lName,
        pos,
        secondary: sec || getDefaultSecondaryPositions(pos),
        natCode: nat,
        age,
        targetCa: ca,
        targetPa: pa,
        isYouth: age <= 19,
      });
    }
  }

  // Ensure every position in SQUAD_BLUEPRINT has adequate depth up to 21 players & meets minHomegrownQuota
  const pool = NATIONALITY_POOLS[countryId] || NATIONALITY_POOLS.ENG;
  const existingDomesticCount = results.filter(
    (p) => p.natCode === countryId || p.isYouth
  ).length;
  const neededCount = Math.max(
    0,
    21 - results.length,
    minHomegrownQuota - existingDomesticCount
  );
  const fallbackPositions: { pos: PositionCode; isYouth: boolean }[] = [
    { pos: 'GK', isYouth: false },
    { pos: 'DC', isYouth: false },
    { pos: 'DL', isYouth: false },
    { pos: 'DR', isYouth: false },
    { pos: 'DM', isYouth: false },
    { pos: 'MC', isYouth: false },
    { pos: 'AML', isYouth: false },
    { pos: 'ST', isYouth: false },
    { pos: 'MC', isYouth: true },
    { pos: 'ST', isYouth: true },
    { pos: 'DC', isYouth: true },
  ];

  for (let i = 0; i < neededCount; i++) {
    const spec = fallbackPositions[i % fallbackPositions.length];
    const isYouth = i >= neededCount - 2 || spec.isYouth;
    const { firstName: fName, lastName: lName, normKey } = pickUniqueGeneratedName(
      pool,
      rng,
      usedFullNames,
      globalClaimedNames,
      allRealSeedNames
    );
    usedFullNames.add(normKey);
    globalClaimedNames.add(normKey);

    const age = isYouth ? rng.int(17, 19) : rng.int(20, 29);
    const targetCa = isYouth
      ? Math.round(reputation * 1.45 + rng.int(-6, 8))
      : Math.round(reputation * 1.76 + rng.int(-8, 6));
    const targetPa = isYouth
      ? Math.min(184, targetCa + rng.int(22, 38))
      : Math.min(180, targetCa + (age <= 24 ? rng.int(8, 16) : rng.int(0, 5)));

    results.push({
      firstName: fName,
      lastName: lName,
      pos: spec.pos,
      secondary: getDefaultSecondaryPositions(spec.pos),
      natCode: countryId,
      age,
      targetCa,
      targetPa,
      isYouth,
    });
  }

  return results;
}

export function createInitialWorldState(
  seed = 20261110,
  customManager?: Partial<ManagerProfile>,
  selectedClubId?: string,
  scenarioChallenge: ScenarioChallengeId = 'STANDARD',
  customClubConfig?: CustomClubConfig | null
): WorldState {
  const rng = new SeededRNG(seed);
  const gameDate = '2025-07-15';
  const currentSeason = '2025/26';

  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const staff: Record<string, StaffMember> = {};
  const fixtures: Fixture[] = [];
  const standings: Record<LeagueId, LeagueStanding[]> = {
    ENG_PL: [],
    ESP_LL: [],
    GER_BL: [],
    ITA_SA: [],
    FRA_L1: [],
    POR_LP: [],
    NED_ED: [],
    BEL_PL: [],
    TUR_SL: [],
    SCO_PR: [],
    ENG_CH: [],
    ESP_SD: [],
    GER_2B: [],
    ITA_SB: [],
    FRA_L2: [],
    ENG_L1: [],
    AUT_BL: [],
    SUI_SL: [],
    GRE_SL: [],
    KSA_SPL: [],
    USA_MLS: [],
    BRA_SA: [],
    JPN_J1: [],
  };
  const transactions: FinanceTransaction[] = [];

  const leagueIds = Object.keys(LEAGUES_CONFIG) as LeagueId[];
  const allRealSeedNames = buildAllRealSeedNamesSet();
  const globalClaimedNames = new Set<string>();

  for (const leagueId of leagueIds) {
    const config = LEAGUES_CONFIG[leagueId];
    const templates = CLUB_TEMPLATES[leagueId];
    const natPool = NATIONALITY_POOLS[config.countryId] || NATIONALITY_POOLS.ENG;

    const leagueClubIds: string[] = [];

    templates.slice(0, config.targetClubCount).forEach((tpl, idx) => {
      const clubId = `club_${leagueId.toLowerCase()}_${idx + 1}`;
      leagueClubIds.push(clubId);

      const clubPlayers: Player[] = [];
      let totalWageUsed = 0;

      const squadSeeds = buildClubSquadSeeds(
        tpl.shortName,
        tpl.reputation,
        config.countryId,
        rng,
        config.registrationRules?.minHomegrownTotal ?? 8,
        globalClaimedNames,
        allRealSeedNames
      );

      squadSeeds.forEach((pSeed, pIdx) => {
        const playerId = `plr_${clubId}_${pIdx + 1}`;
        const birthYear = 2025 - pSeed.age;
        const birthMonth = String(rng.int(1, 12)).padStart(2, '0');
        const birthDay = String(rng.int(1, 28)).padStart(2, '0');

        const attrs = generateAttributesForPosition(pSeed.pos, pSeed.targetCa, rng);
        const coherentCa = computeCoherentCA(attrs);
        const pa = Math.max(coherentCa, Math.min(198, pSeed.targetPa));

        const { marketValue, wagePerWeek } = calculatePlayerValuation(
          coherentCa,
          pa,
          pSeed.age,
          tpl.reputation
        );
        totalWageUsed += wagePerWeek;

        const roles = ROLES_BY_POSITION[pSeed.pos] || ROLES_BY_POSITION.MC;
        const preferredRole: PlayerRole = rng.pick(roles);

        const isWonderkid = pSeed.age <= 21 && pa >= 168;
        const youthSquad: 'u18' | 'u21' | 'senior' =
          pSeed.isYouth && pSeed.age <= 18
            ? 'u18'
            : pSeed.isYouth || (pSeed.age <= 20 && pIdx >= 16)
              ? 'u21'
              : 'senior';

        const player: Player = {
          id: playerId,
          firstName: pSeed.firstName,
          lastName: pSeed.lastName,
          dateOfBirth: `${birthYear}-${birthMonth}-${birthDay}`,
          nationality: pSeed.natCode,
          nationalityCode: pSeed.natCode,
          heightCm: pSeed.pos === 'GK' || pSeed.pos === 'DC' ? rng.int(184, 197) : rng.int(170, 189),
          weightKg: rng.int(67, 88),
          preferredFoot:
            pSeed.pos === 'DL' || pSeed.pos === 'WBL'
              ? 'Left'
              : rng.chance(0.75)
                ? 'Right'
                : rng.chance(0.8)
                  ? 'Left'
                  : 'Both',
          positions: [pSeed.pos, ...pSeed.secondary],
          preferredRole,
          currentAbility: coherentCa,
          potentialAbility: pa,
          potentialRange: [Math.max(coherentCa, pa - 10), Math.min(200, pa + 8)],
          attributes: attrs,
          fitness: rng.int(84, 94),
          matchSharpness: rng.int(58, 68),
          morale: rng.int(75, 94),
          tacticalFamiliarity: rng.int(65, 74),
          squadStatus: pSeed.isYouth
            ? isWonderkid
              ? 'Breakthrough Prospect'
              : 'Youth'
            : pIdx < 5
              ? 'Star Player'
              : pIdx < 12
                ? 'Regular Starter'
                : 'Squad Player',
          satisfaction: rng.int(76, 94),
          personality: rng.pick(['Professional', 'Resolute', 'Ambitious', 'Balanced', 'Spirited', 'Model Citizen']),
          professionalism: rng.int(12, 19),
          clubId,
          loanedFromClubId: null,
          wagePerWeek,
          contractEndDate: `${2025 + rng.int(1, 5)}-06-30`,
          releaseClause: rng.chance(0.35) ? Math.round(marketValue * 1.45) : null,
          goalBonus: Math.round(wagePerWeek * 0.15),
          marketValue,
          askingPrice: Math.round(marketValue * rng.float(1.15, 1.35)),
          transferListed: pIdx >= 14 && rng.chance(0.15),
          loanListed: Boolean(pSeed.isYouth && rng.chance(0.45)),
          injuryStatus: { isInjured: false, daysRemaining: 0 },
          individualTraining: {
            attributeFocus: 'Balanced',
            roleFocus: preferredRole,
            intensity: 'Medium',
          },
          stats: {
            appearances: 0,
            starts: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
            cleanSheets: 0,
            minutesPlayed: 0,
            averageRating: 6.8,
            manOfTheMatch: 0,
          },
          developmentHistory: [{ date: gameDate, ca: coherentCa, keyAttributeChanges: [] }],
          transferHistory: [],
          isYouthAcademy: Boolean(pSeed.isYouth),
          ...(() => {
            const hgStatus = resolveInitialHomegrownStatus(
              pSeed.firstName,
              pSeed.lastName,
              pSeed.natCode,
              pSeed.isYouth,
              tpl.shortName,
              config.countryId
            );
            return {
              homegrownStatus: hgStatus,
              isHomegrown: hgStatus !== 'NONE',
            };
          })(),
          isRegistered: true,
          consecutiveBenched: 0,
          playInReserves: Boolean(pSeed.isYouth),
          suspensionMatchesRemaining: 0,
          unhappyReason: null,
          youthSquad,
          contractType: pSeed.isYouth && pSeed.age <= 17 ? 'youth' : 'professional',
          mentorId: null,
          isWonderkid,
        };

        players[playerId] = player;
        clubPlayers.push(player);
      });

      // Ensure every club starts compliant with its league's HG-C & total HG quotas without tagging marquee foreign stars
      const regRules = getLeagueRegistrationRules(leagueId, config.countryId);
      let hgcCount = clubPlayers.filter((cp) => getPlayerHomegrownStatus(cp, config.countryId) === 'HGC').length;
      if (regRules.minClubTrained > 0 && hgcCount < regRules.minClubTrained) {
        // Prefer promoting youngest domestic/HGN players first to HGC
        const candidates = [...clubPlayers]
          .filter((cp) => getPlayerHomegrownStatus(cp, config.countryId) !== 'HGC')
          .sort((a, b) => {
            const aDom = getPlayerHomegrownStatus(a, config.countryId) === 'HGN' ? 0 : 1;
            const bDom = getPlayerHomegrownStatus(b, config.countryId) === 'HGN' ? 0 : 1;
            if (aDom !== bDom) return aDom - bDom;
            return b.dateOfBirth.localeCompare(a.dateOfBirth); // youngest first
          });
        for (const cp of candidates) {
          if (hgcCount >= regRules.minClubTrained) break;
          cp.homegrownStatus = 'HGC';
          cp.isHomegrown = true;
          players[cp.id].homegrownStatus = 'HGC';
          players[cp.id].isHomegrown = true;
          hgcCount++;
        }
      }

      let hgCount = clubPlayers.filter((cp) =>
        isPlayerHomegrownForClub(cp, config.countryId)
      ).length;
      const targetMinHg = Math.max(regRules.minHomegrownTotal, 8);
      if (hgCount < targetMinHg) {
        // Only fill remaining deficit using youngest / depth players, preserving authentic foreign stars as NONE
        const nonHgCandidates = [...clubPlayers]
          .filter((cp) => !isPlayerHomegrownForClub(cp, config.countryId))
          .sort((a, b) => {
            const aBirth = parseInt(a.dateOfBirth.slice(0, 4), 10) || 2000;
            const bBirth = parseInt(b.dateOfBirth.slice(0, 4), 10) || 2000;
            if (aBirth !== bBirth) return bBirth - aBirth; // youngest first
            return a.currentAbility - b.currentAbility; // squad depth before marquee stars
          });
        for (const cp of nonHgCandidates) {
          if (hgCount >= targetMinHg) break;
          cp.homegrownStatus = 'HGN';
          cp.isHomegrown = true;
          players[cp.id].homegrownStatus = 'HGN';
          players[cp.id].isHomegrown = true;
          hgCount++;
        }
      }

      // Stage 12 Phase 3: Authentic 2025/26 primary/secondary formations & tactical presets
      const primaryFormation: FormationId = tpl.preferredFormation || rng.pick(FORMATIONS_POOL);
      const secondaryFormation: FormationId =
        tpl.secondaryFormation || rng.pick(FORMATIONS_POOL.filter((f) => f !== primaryFormation));
      const authenticInstructions = tpl.tacticalPreset
        ? buildAuthenticTeamInstructions(tpl.tacticalPreset)
        : undefined;
      const primaryTactic = autoPickLineup(
        primaryFormation,
        clubPlayers,
        authenticInstructions,
        `${clubId}_tac_1`,
        `${primaryFormation} Primary`
      );
      const secondaryTactic = autoPickLineup(
        secondaryFormation,
        clubPlayers,
        authenticInstructions,
        `${clubId}_tac_2`,
        `${secondaryFormation} Reserve`
      );

      // Stage 12 Phase 4: Authentic 2025/26 club transfer & wage budgets
      const repFactor = Math.pow(tpl.reputation / 70, 2.8);
      const transferBudget =
        tpl.transferBudgetEur !== undefined
          ? tpl.transferBudgetEur
          : Math.round(repFactor * 28_000_000);
      const balance =
        tpl.transferBudgetEur !== undefined
          ? Math.max(Math.round(tpl.transferBudgetEur * 1.35), Math.round(repFactor * 22_000_000))
          : Math.round(repFactor * 42_000_000);
      const wageBudgetPerWeek =
        tpl.wageBudgetEur !== undefined
          ? tpl.wageBudgetEur
          : Math.round(totalWageUsed * 1.18);

      const starterIdSet = new Set(
        primaryTactic.lineup.map((s) => s.playerId).filter((id): id is string => Boolean(id))
      );
      const registeredIdSet = autoRegisterSquadIds(
        clubPlayers,
        config.countryId,
        starterIdSet,
        leagueId,
        gameDate
      );
      for (const cp of clubPlayers) {
        const reg = registeredIdSet.has(cp.id);
        cp.isRegistered = reg;
        players[cp.id].isRegistered = reg;
        // Non-starters with < 85% sharpness or youth can default to playing in reserves
        if (!starterIdSet.has(cp.id) && (cp.matchSharpness < 85 || cp.isYouthAcademy)) {
          cp.playInReserves = true;
          players[cp.id].playInReserves = true;
        }
      }

      const sugarDaddyType: Club['sugarDaddyType'] = ['MCI', 'PSG', 'NEW', 'CHE', 'RMA'].includes(
        tpl.shortName
      )
        ? 'FRONT_END'
        : tpl.reputation >= 86
          ? 'BACK_END'
          : tpl.reputation >= 78
            ? 'UNDERWRITER'
            : 'NONE';

      const club: Club = {
        id: clubId,
        name: tpl.name,
        shortName: tpl.shortName,
        countryId: config.countryId,
        leagueId,
        city: tpl.city,
        primaryColor: tpl.primaryColor,
        secondaryColor: tpl.secondaryColor,
        logoUrl: tpl.logoUrl,
        stadiumName: tpl.stadiumName,
        stadiumCapacity: tpl.stadiumCapacity,
        reputation: tpl.reputation,
        trainingFacilities: Math.min(20, Math.max(10, Math.round(tpl.reputation / 5))),
        youthFacilities: Math.min(20, Math.max(9, Math.round(tpl.reputation / 5.2))),
        juniorCoaching: Math.min(20, Math.max(9, Math.round(tpl.reputation / 5.1))),
        youthRecruitment: Math.min(20, Math.max(9, Math.round(tpl.reputation / 5.0))),
        sugarDaddyType,
        finances: {
          balance,
          transferBudget,
          wageBudgetPerWeek,
          wageUsedPerWeek: totalWageUsed,
          debt: tpl.reputation > 85 && rng.chance(0.3) ? 45_000_000 : 0,
          sponsorRevenueAnnual: Math.round(repFactor * 35_000_000),
          ticketPriceAvg: Math.round(35 + (tpl.reputation - 65) * 1.1),
        },
        boardExpectations: {
          targetLeaguePosition: Math.max(1, Math.min(config.targetClubCount, idx + 1)),
          cupTarget: idx < 4 ? 'Semi-Final' : idx < 10 ? 'Quarter-Final' : 'Compete',
          clubVision:
            idx < 4
              ? trText(
                  'Compete for the league title and maintain elite European status',
                  'ลุ้นแชมป์ลีกสูงสุดและรักษาสถานะสโมสรชั้นนำของยุโรป'
                )
              : idx < 10
                ? trText(
                    'Challenge for European qualification and promote youth prospects',
                    'ลุ้นพื้นที่ฟุตบอลยุโรปและพัฒนาดาวรุ่งสู่ทีมชุดใหญ่'
                  )
                : trText(
                    'Secure top-flight status and maintain long-term financial sustainability',
                    'รักษาสถานะในลีกสูงสุดและบริหารการเงินอย่างยั่งยืน'
                  ),
          confidence: {
            overall: 78,
            leaguePerformance: 76,
            financialManagement: 82,
            youthDevelopment: 75,
            squadAtmosphere: 80,
          },
        },
        aiManager: {
          name: tpl.managerName,
          style: rng.pick(AI_STYLES),
          reputation: tpl.reputation,
          jobSecurity: 80,
        },
        primaryTactic,
        secondaryTactic: {
          ...secondaryTactic,
          familiarity: 66,
        },
        formationFamiliarity: {
          [primaryFormation]: 78,
          [secondaryFormation]: 66,
        },
        trainingFocus: 'Possession',
        trainingIntensity: 'Standard',
      };

      clubs[clubId] = club;

      // Create key club staff (Assistant Manager, Head Scout, Fitness Coach, Physio, Youth Coach)
      const staffRoles: StaffRole[] = [
        'Assistant Manager',
        'Head Scout',
        'Fitness Coach',
        'Physio',
        'Youth Coach',
      ];
      staffRoles.forEach((sRole, sIdx) => {
        const sId = `stf_${clubId}_${sIdx + 1}`;
        const baseSkill = Math.min(19, Math.max(9, Math.round(tpl.reputation / 5.2)));
        staff[sId] = {
          id: sId,
          name: `${capitalizeName(rng.pick(natPool.firstNames))} ${capitalizeName(rng.pick(natPool.lastNames))}`,
          nationality: config.countryId,
          age: rng.int(34, 61),
          role: sRole,
          clubId,
          wagePerWeek: rng.int(4_000, 18_000),
          contractEndDate: '2028-06-30',
          attributes: {
            coachingTechnical: clampAttr(baseSkill + rng.int(-2, 2)),
            coachingTactical: clampAttr(baseSkill + rng.int(-2, 2)),
            fitnessCoaching: clampAttr(baseSkill + rng.int(-2, 2)),
            judgingAbility: clampAttr(baseSkill + rng.int(-2, 2)),
            judgingPotential: clampAttr(baseSkill + rng.int(-2, 2)),
            motivating: clampAttr(baseSkill + rng.int(-2, 2)),
            manManagement: clampAttr(baseSkill + rng.int(-2, 2)),
            tacticalKnowledge: clampAttr(baseSkill + rng.int(-2, 2)),
            medical: clampAttr(baseSkill + rng.int(-2, 2)),
            adaptability: clampAttr(baseSkill + rng.int(-2, 2)),
          },
        };
      });
    });

    // Generate double round-robin schedule for this league
    const leagueFixtures = generateLeagueSchedule(
      config,
      leagueClubIds,
      currentSeason,
      '2025-08-15',
      rng
    );
    fixtures.push(...leagueFixtures);
    standings[leagueId] = createInitialStandings(leagueId, currentSeason, leagueClubIds);
  }

  const resolvedControlledClubId =
    selectedClubId && clubs[selectedClubId] ? selectedClubId : 'club_eng_pl_1';

  // Generate Multi-Tier Primary National Cups (17) & Secondary League Cups (3: ENG_LC, POR_LC, SCO_LC)
  for (const config of Object.values(LEAGUES_CONFIG)) {
    if (config.tier === 2 || config.tier === 3) continue;
    const countryClubs = Object.values(clubs).filter((c) => c.countryId === config.countryId);
    const primaryCupFixtures = generateInitialDomesticCupFixtures(
      config.cupId,
      countryClubs,
      currentSeason,
      undefined,
      resolvedControlledClubId
    );
    fixtures.push(...primaryCupFixtures);

    if (config.leagueCupId) {
      const leagueCupFixtures = generateInitialDomesticCupFixtures(
        config.leagueCupId,
        countryClubs,
        currentSeason,
        undefined,
        resolvedControlledClubId
      );
      fixtures.push(...leagueCupFixtures);
    }
  }

  // Helper to resolve club IDs reliably by shortName (and optional countryId)
  const findClubIdByShortName = (shortName: string, preferredCountryId?: string): string | null => {
    const allClubs = Object.values(clubs);
    if (preferredCountryId) {
      const scoped = allClubs.find(
        (c) => c.shortName === shortName && c.countryId === preferredCountryId
      );
      if (scoped) return scoped.id;
    }
    const direct = allClubs.find((c) => c.shortName === shortName);
    return direct ? direct.id : null;
  };

  // Verified 2024/25 Real-World Competition Winners & Runners-Up (used for Trophy Cabinet & 2025/26 Super Cup pairings)
  const buildTrophyEntry = (
    id: string,
    competitionId: CompetitionId,
    competitionName: string,
    winnerShort: string,
    runnerUpShort: string,
    winnerCountry?: string,
    runnerUpCountry?: string
  ): TrophyHistoryRecord | null => {
    const winnerId = findClubIdByShortName(winnerShort, winnerCountry);
    const runnerUpId = findClubIdByShortName(runnerUpShort, runnerUpCountry);
    if (!winnerId || !runnerUpId) return null;
    return {
      id,
      season: '2024/25',
      competitionId,
      competitionName,
      winnerClubId: winnerId,
      winnerClubName: clubs[winnerId]?.name || winnerShort,
      runnerUpClubId: runnerUpId,
      runnerUpClubName: clubs[runnerUpId]?.name || runnerUpShort,
    };
  };

  const trophyHistory: TrophyHistoryRecord[] = [
    // UEFA & Global Competitions (2024/25)
    buildTrophyEntry('trp_2425_ucl', 'UEFA_UCL', 'UEFA Champions League', 'PSG', 'INT', 'FRA', 'ITA'),
    buildTrophyEntry('trp_2425_uel', 'UEFA_UEL', 'UEFA Europa League', 'TOT', 'MUN', 'ENG', 'ENG'),
    buildTrophyEntry('trp_2425_uecl', 'UEFA_UECL', 'UEFA Conference League', 'CHE', 'BET', 'ENG', 'ESP'),
    buildTrophyEntry('trp_2425_cwc', 'GLB_CWC', 'FIFA Club World Cup', 'CHE', 'PSG', 'ENG', 'FRA'),
    // Big 5 European Leagues (2024/25)
    buildTrophyEntry('trp_2425_eng', 'ENG_PL', 'English Premier League', 'LIV', 'ARS', 'ENG', 'ENG'),
    buildTrophyEntry('trp_2425_esp', 'ESP_LL', 'Spanish La Liga', 'BAR', 'RMA', 'ESP', 'ESP'),
    buildTrophyEntry('trp_2425_ger', 'GER_BL', 'German Bundesliga', 'FCB', 'B04', 'GER', 'GER'),
    buildTrophyEntry('trp_2425_ita', 'ITA_SA', 'Italian Serie A', 'NAP', 'INT', 'ITA', 'ITA'),
    buildTrophyEntry('trp_2425_fra', 'FRA_L1', 'French Ligue 1', 'PSG', 'OM', 'FRA', 'FRA'),
    // Big 5 Domestic Cups (2024/25)
    buildTrophyEntry('trp_2425_eng_cup', 'ENG_CUP', 'FA Cup', 'CRY', 'MCI', 'ENG', 'ENG'),
    buildTrophyEntry('trp_2425_eng_lc', 'ENG_LC', 'EFL Cup', 'NEW', 'LIV', 'ENG', 'ENG'),
    buildTrophyEntry('trp_2425_esp_cup', 'ESP_CUP', 'Copa del Rey', 'BAR', 'RMA', 'ESP', 'ESP'),
    buildTrophyEntry('trp_2425_ger_cup', 'GER_CUP', 'DFB-Pokal', 'VFB', 'B04', 'GER', 'GER'),
    buildTrophyEntry('trp_2425_ita_cup', 'ITA_CUP', 'Coppa Italia', 'BOL', 'MIL', 'ITA', 'ITA'),
    buildTrophyEntry('trp_2425_fra_cup', 'FRA_CUP', 'Coupe de France', 'PSG', 'SDR', 'FRA', 'FRA'),
    // European Challenger & World Leagues (2024/25)
    buildTrophyEntry('trp_2425_por', 'POR_LP', 'Liga Portugal', 'SCP', 'SLB', 'POR', 'POR'),
    buildTrophyEntry('trp_2425_ned', 'NED_ED', 'Eredivisie', 'PSV', 'AJX', 'NED', 'NED'),
    buildTrophyEntry('trp_2425_bel', 'BEL_PL', 'Belgian Pro League', 'USG', 'CBK', 'BEL', 'BEL'),
    buildTrophyEntry('trp_2425_tur', 'TUR_SL', 'Turkish Süper Lig', 'GAL', 'FEN', 'TUR', 'TUR'),
    buildTrophyEntry('trp_2425_sco', 'SCO_PR', 'Scottish Premiership', 'CELT', 'RAN', 'SCO', 'SCO'),
    buildTrophyEntry('trp_2425_aut', 'AUT_BL', 'Austrian Bundesliga', 'STU', 'RBS', 'AUT', 'AUT'),
    buildTrophyEntry('trp_2425_sui', 'SUI_SL', 'Swiss Super League', 'FCB2', 'SFC', 'SUI', 'SUI'),
    buildTrophyEntry('trp_2425_gre', 'GRE_SL', 'Super League Greece', 'OLY', 'PAO', 'GRE', 'GRE'),
    buildTrophyEntry('trp_2425_ksa', 'KSA_SPL', 'Saudi Pro League', 'ITT', 'HIL', 'KSA', 'KSA'),
    buildTrophyEntry('trp_2425_usa', 'USA_MLS', 'Major League Soccer', 'LAG', 'RBNY', 'USA', 'USA'),
    buildTrophyEntry('trp_2425_bra', 'BRA_SA', 'Brasileirão Série A', 'BOT', 'PAL', 'BRA', 'BRA'),
    buildTrophyEntry('trp_2425_jpn', 'JPN_J1', 'J1 League', 'VIS', 'SANF', 'JPN', 'JPN'),
    buildTrophyEntry('trp_2425_eng_ch', 'ENG_CH', 'EFL Championship', 'LEE', 'BUR', 'ENG', 'ENG'),
  ].filter((entry): entry is TrophyHistoryRecord => entry !== null);

  // Generate 9 National Super Cups (Aug 10) + UEFA Super Cup (Aug 12) using authentic 2024/25 trophy winners
  const superCupFixtures = generateSeasonSuperCupFixtures(currentSeason, 2025, clubs, trophyHistory);
  fixtures.push(...superCupFixtures);

  // Stage 11 Phase 4: Generate 3 Global Continental Champions Cups (AFC_ACL, CONMEBOL_LIB, CONCACAF_CCC)
  const continentalCupFixtures = generateContinentalChampionsCupFixtures(
    currentSeason,
    clubs,
    undefined,
    resolvedControlledClubId
  );
  fixtures.push(...continentalCupFixtures);

  // Generate UEFA Club Competitions (New Format: 36 teams per competition, 4 Pots of 9, Swiss League Phase)
  const uefaQualified = selectUefaQualifiedClubs(clubs);
  const uefaPots: Record<UefaCompetitionId, string[][]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };
  const uefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };

  for (const uefaId of Object.keys(UEFA_COMPETITIONS_CONFIG) as UefaCompetitionId[]) {
    const qualifiedIds = uefaQualified[uefaId];
    const pots = buildUefaFourPots(qualifiedIds, clubs);
    uefaPots[uefaId] = pots;
    const uefaFixtures = generateUefaSwissSchedule(uefaId, pots, currentSeason, rng);
    fixtures.push(...uefaFixtures);
    uefaStandings[uefaId] = recomputeUefaStandings(
      uefaId,
      currentSeason,
      qualifiedIds,
      uefaFixtures,
      clubs
    );
  }

  // Real-world Free Agent Staff members for hiring
  const freeStaffSeeds: { name: string; role: StaffRole; nat: string; age: number }[] = [
    { name: 'Pepijn Lijnders', role: 'Assistant Manager', nat: 'NED', age: 42 },
    { name: 'Davide Ancelotti', role: 'First Team Coach', nat: 'ITA', age: 35 },
    { name: 'Antonio Pintus', role: 'Fitness Coach', nat: 'ITA', age: 62 },
    { name: 'Claudio Taffarel', role: 'Goalkeeping Coach', nat: 'BRA', age: 58 },
    { name: 'Juni Calafat', role: 'Head Scout', nat: 'ESP', age: 51 },
    { name: 'Geoffrey Moncada', role: 'Scout', nat: 'FRA', age: 38 },
    { name: 'Dr. Hans-Wilhelm Muller-Wohlfahrt', role: 'Physio', nat: 'GER', age: 68 },
    { name: 'Ian Graham', role: 'Data Analyst', nat: 'ENG', age: 48 },
    { name: 'Michael Edwards', role: 'Director of Football', nat: 'ENG', age: 45 },
    { name: 'Per Mertesacker', role: 'Youth Coach', nat: 'GER', age: 40 },
  ];
  freeStaffSeeds.forEach((seedStaff, idx) => {
    const sId = `stf_free_${idx + 1}`;
    staff[sId] = {
      id: sId,
      name: seedStaff.name,
      nationality: seedStaff.nat,
      age: seedStaff.age,
      role: seedStaff.role,
      clubId: null,
      wagePerWeek: rng.int(5_500, 16_000),
      contractEndDate: '2029-06-30',
      attributes: {
        coachingTechnical: rng.int(14, 19),
        coachingTactical: rng.int(14, 19),
        fitnessCoaching: rng.int(14, 19),
        judgingAbility: rng.int(15, 19),
        judgingPotential: rng.int(15, 19),
        motivating: rng.int(14, 19),
        manManagement: rng.int(14, 19),
        tacticalKnowledge: rng.int(14, 19),
        medical: rng.int(14, 19),
        adaptability: rng.int(14, 19),
      },
    };
  });

  // Generate European Nations Cup (INT_EURO) Quarter-Finals for May 2026
  const euroFixtures = generateEuropeanNationsCupFixtures(currentSeason, 2026, clubs);
  fixtures.push(...euroFixtures);

  const controlledClubId = selectedClubId && clubs[selectedClubId] ? selectedClubId : 'club_eng_pl_1';
  const controlledClub = clubs[controlledClubId];
  controlledClub.preSeasonCampFocus = 'TACTICAL_DRILLS';

  // Schedule 2 baseline Pre-Season Friendlies (Jul 22 & Aug 02) for the controlled club
  const friendlyOpponents = Object.values(clubs)
    .filter((c) => c.id !== controlledClub.id && c.leagueId !== controlledClub.leagueId)
    .sort((a, b) => Math.abs(a.reputation - controlledClub.reputation) - Math.abs(b.reputation - controlledClub.reputation));
  const opp1 = friendlyOpponents[0] || Object.values(clubs).find((c) => c.id !== controlledClub.id)!;
  const opp2 = friendlyOpponents[1] || opp1;
  fixtures.push(
    {
      id: `fix_PRE_SEASON_FRIENDLY_202526_${controlledClub.id}_1`,
      competitionId: 'PRE_SEASON_FRIENDLY',
      seasonId: currentSeason,
      matchday: 1,
      kickoffDate: '2025-07-22',
      homeClubId: controlledClub.id,
      awayClubId: opp1.id,
      status: 'Scheduled',
    },
    {
      id: `fix_PRE_SEASON_FRIENDLY_202526_${controlledClub.id}_2`,
      competitionId: 'PRE_SEASON_FRIENDLY',
      seasonId: currentSeason,
      matchday: 2,
      kickoffDate: '2025-08-02',
      homeClubId: opp2.id,
      awayClubId: controlledClub.id,
      status: 'Scheduled',
    }
  );

  // Checkpoint 17: Apply Create-a-Club custom overrides if enabled
  if (customClubConfig && customClubConfig.enabled) {
    if (customClubConfig.name.trim()) {
      controlledClub.name = customClubConfig.name.trim();
    }
    if (customClubConfig.shortName.trim()) {
      controlledClub.shortName = customClubConfig.shortName.trim().toUpperCase().slice(0, 4);
    }
    if (customClubConfig.primaryColor) {
      controlledClub.primaryColor = customClubConfig.primaryColor;
    }
    if (customClubConfig.secondaryColor) {
      controlledClub.secondaryColor = customClubConfig.secondaryColor;
    }
    if (customClubConfig.stadiumName.trim()) {
      controlledClub.stadiumName = customClubConfig.stadiumName.trim();
    }
  }

  // Checkpoint 17: Apply FM Scenario Challenge Modes
  if (scenarioChallenge === 'POINTS_DEDUCTION') {
    controlledClub.pointsDeduction = 10;
    controlledClub.finances.transferBudget = Math.min(
      5_000_000,
      Math.round(controlledClub.finances.transferBudget * 0.25)
    );
    standings[controlledClub.leagueId] = standings[controlledClub.leagueId].map((row) =>
      row.clubId === controlledClub.id
        ? { ...row, points: -10, pointsDeduction: 10 }
        : row
    );
  } else if (scenarioChallenge === 'INJURY_CRISIS') {
    const clubStars = Object.values(players)
      .filter((p) => p.clubId === controlledClub.id && p.positions[0] !== 'GK')
      .sort((a, b) => b.currentAbility - a.currentAbility)
      .slice(0, 5);
    const injuryTypes = [
      'Hamstring Tear (Grade 2)',
      'Ankle Ligament Sprain',
      'Knee Meniscus Strain',
      'Groin Muscle Strain',
      'Calf Muscle Strain',
    ];
    clubStars.forEach((star, idx) => {
      players[star.id] = {
        ...star,
        fitness: 58,
        injuryStatus: {
          isInjured: true,
          type: injuryTypes[idx % injuryTypes.length],
          daysRemaining: 21 + idx * 4,
        },
      };
    });
    const healthyPlayers = Object.values(players).filter((p) => p.clubId === controlledClub.id);
    controlledClub.primaryTactic = autoPickLineup(
      controlledClub.primaryTactic.formation,
      healthyPlayers,
      controlledClub.primaryTactic.instructions,
      controlledClub.primaryTactic.id,
      controlledClub.primaryTactic.name
    );
  } else if (scenarioChallenge === 'YOUTH_ONLY') {
    controlledClub.transferEmbargoUntil = '2099-12-31';
    controlledClub.youthFacilities = 20;
    controlledClub.juniorCoaching = 20;
    controlledClub.youthRecruitment = 20;

    // Seed 3 elite Class of '27 Wonderkids directly into the squad
    const wkPositions: PositionCode[] = ['ST', 'AMC', 'DC'];
    const pool = NATIONALITY_POOLS[controlledClub.countryId] || NATIONALITY_POOLS.ENG;
    wkPositions.forEach((pos, idx) => {
      const wkId = `plr_${controlledClub.id}_wk_challenge_${idx + 1}`;
      const { firstName: fName, lastName: lName, normKey } = pickUniqueGeneratedName(
        pool,
        rng,
        new Set<string>(),
        globalClaimedNames,
        allRealSeedNames
      );
      globalClaimedNames.add(normKey);
      const attrs = generateAttributesForPosition(pos, 134 + idx * 2, rng);
      const ca = computeCoherentCA(attrs);
      const pa = 186 + idx * 3;
      const { marketValue, wagePerWeek } = calculatePlayerValuation(
        ca,
        pa,
        17,
        controlledClub.reputation
      );
      const wkPlayer: Player = {
        id: wkId,
        firstName: fName,
        lastName: lName,
        dateOfBirth: '2008-05-14',
        nationality: LEAGUES_CONFIG[controlledClub.leagueId]?.countryName || 'England',
        nationalityCode: controlledClub.countryId,
        heightCm: 179 + idx * 3,
        weightKg: 71 + idx * 2,
        preferredFoot: idx === 1 ? 'Left' : 'Right',
        positions: [pos],
        preferredRole: pos === 'ST' ? 'Advanced Forward' : pos === 'AMC' ? 'Advanced Playmaker' : 'Ball Playing Defender',
        currentAbility: ca,
        potentialAbility: pa,
        potentialRange: [pa - 6, Math.min(200, pa + 4)],
        attributes: attrs,
        fitness: 99,
        matchSharpness: 90,
        morale: 96,
        tacticalFamiliarity: 88,
        squadStatus: 'Breakthrough Prospect',
        satisfaction: 95,
        personality: 'Model Citizen',
        professionalism: 19,
        clubId: controlledClub.id,
        loanedFromClubId: null,
        wagePerWeek: Math.min(6_000, wagePerWeek),
        contractEndDate: '2030-06-30',
        releaseClause: marketValue * 2,
        goalBonus: 500,
        marketValue,
        askingPrice: Math.round(marketValue * 1.6),
        transferListed: false,
        loanListed: false,
        injuryStatus: { isInjured: false, daysRemaining: 0 },
        individualTraining: {
          attributeFocus: 'Balanced',
          roleFocus: pos === 'ST' ? 'Advanced Forward' : pos === 'AMC' ? 'Advanced Playmaker' : 'Ball Playing Defender',
          intensity: 'Medium',
        },
        stats: {
          appearances: 0,
          starts: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          cleanSheets: 0,
          minutesPlayed: 0,
          averageRating: 7.1,
          manOfTheMatch: 0,
        },
        developmentHistory: [{ date: gameDate, ca, keyAttributeChanges: [] }],
        transferHistory: [],
        isYouthAcademy: true,
        homegrownStatus: 'HGC',
        isHomegrown: true,
        isRegistered: true,
        youthSquad: 'u21',
        contractType: 'professional',
        isWonderkid: true,
      };
      players[wkId] = wkPlayer;
    });
  }

  const manager: ManagerProfile = {
    id: 'mgr_user_1',
    name: customManager?.name || controlledClub.aiManager.name || 'Mikel Arteta',
    age: customManager?.age || 44,
    nationality: customManager?.nationality || 'Spain',
    coachingStyle: customManager?.coachingStyle || 'Tactician',
    tacticalStyle: customManager?.tacticalStyle || 'Possession-focused Manager',
    reputation: customManager?.reputation || controlledClub.reputation,
    careerStats: {
      matchesManaged: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      trophies: [],
      clubsManaged: [
        {
          clubId: controlledClub.id,
          clubName: controlledClub.name,
          fromDate: gameDate,
          toDate: 'Present',
        },
      ],
    },
  };

  // Initial financial ledger entry for controlled club
  transactions.push({
    id: `tx_init_${controlledClub.id}`,
    date: gameDate,
    clubId: controlledClub.id,
    category: 'Sponsorship',
    amount: Math.round(controlledClub.finances.sponsorRevenueAnnual / 4),
    description: trText(
      'Initial 2025/26 Season Club Sponsorship Installment',
      'งบสนับสนุนสโมสรประจำต้นฤดูกาล 2025/26'
    ),
    balanceAfter: controlledClub.finances.balance,
  });

  const firstFixture = fixtures.find(
    (f) => f.homeClubId === controlledClub.id || f.awayClubId === controlledClub.id
  );
  const opponentId =
    firstFixture?.homeClubId === controlledClub.id
      ? firstFixture?.awayClubId
      : firstFixture?.homeClubId;
  const opponentClub = opponentId ? clubs[opponentId] : undefined;

  const inbox: NewsItem[] = [
    {
      id: 'news_welcome_board',
      gameDate,
      category: 'Board',
      title: trText(
        `Board of Directors Welcomes ${manager.name} to ${controlledClub.name}`,
        `บอร์ดบริหารต้อนรับ ${manager.name} สู่สโมสร ${controlledClub.name}`
      ),
      body: trText(
        `The Chairman of ${controlledClub.name} has officially appointed ${manager.name} as first-team manager at ${controlledClub.stadiumName} (Capacity: ${controlledClub.stadiumCapacity.toLocaleString()}). Your primary objective this season is a Top ${controlledClub.boardExpectations.targetLeaguePosition} finish, supported by an initial transfer budget of €${(controlledClub.finances.transferBudget / 1_000_000).toFixed(1)}M.`,
        `ประธานสโมสร ${controlledClub.name} แถลงแต่งตั้ง ${manager.name} เข้ากุมบังเหียนอย่างเป็นทางการ ณ สนาม ${controlledClub.stadiumName} (ความจุ ${controlledClub.stadiumCapacity.toLocaleString()} ที่นั่ง) โดยมีเป้าหมายจบอันดับท็อป ${controlledClub.boardExpectations.targetLeaguePosition} ของลีก และงบประมาณเสริมทัพเริ่มต้น €${(controlledClub.finances.transferBudget / 1_000_000).toFixed(1)}M`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: controlledClub.id,
      actionType: 'GoToTactics',
    },
    {
      id: 'news_press_intro',
      gameDate,
      category: 'Media',
      title: trText(
        `Official Unveiling Press Conference — ${controlledClub.name}`,
        `งานแถลงข่าวเปิดตัวผู้จัดการทีมของ ${controlledClub.name}`
      ),
      body: trText(
        `Members of the media have gathered to ask about your tactical philosophy and ambitions for the 2025/26 campaign. Please select your response below to set the tone with the squad and the board.`,
        `กองทัพสื่อมวลชนร่วมตั้งคำถามถึงปรัชญาการทำทีมและเป้าหมายของคุณในฤดูกาล 2025/26 กรุณาเลือกคำตอบเพื่อกำหนดทิศทางความเชื่อมั่นของนักเตะและบอร์ดบริหาร`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: controlledClub.id,
      actionType: 'PressConference',
      pressConferenceOptions: [
        {
          id: 'opt_attack',
          label: trText(
            'We will play bold, high-tempo attacking football that excites our supporters.',
            'เราจะเล่นฟุตบอลเกมรุกที่ดุดันและสร้างความตื่นตาตื่นใจให้แฟนบอลทุกคน'
          ),
          moraleDelta: 4,
          boardDelta: 3,
          mediaResponse: trText(
            'The media praised your ambition and clear commitment to attacking football.',
            'สื่อชื่นชมความทะเยอทะยานและแนวทางฟุตบอลเกมรุกที่ชัดเจนของคุณ'
          ),
        },
        {
          id: 'opt_discipline',
          label: trText(
            'The foundation of success is defensive discipline and a well-drilled tactical structure.',
            'รากฐานของความสำเร็จคือวินัยเกมรับและโครงสร้างแท็กติกที่รัดกุม'
          ),
          moraleDelta: 2,
          boardDelta: 4,
          mediaResponse: trText(
            'The Board of Directors is impressed by your professionalism and long-term planning.',
            'บอร์ดบริหารประทับใจในความเป็นมืออาชีพและการวางแผนระยะยาวของคุณ'
          ),
        },
        {
          id: 'opt_youth',
          label: trText(
            'I am committed to giving our Youth Academy prospects a pathway into the first team.',
            'ผมพร้อมให้โอกาสดาวรุ่งจากอคาเดมีก้าวขึ้นมาเป็นกำลังหลักของสโมสร'
          ),
          moraleDelta: 5,
          boardDelta: 3,
          mediaResponse: trText(
            'Young players across the squad received a major morale boost after hearing your comments.',
            'ผู้เล่นดาวรุ่งในทีมมีขวัญกำลังใจพุ่งสูงขึ้นหลังได้ฟังคำสัมภาษณ์ของคุณ'
          ),
        },
      ],
    },
    {
      id: 'news_tactical_briefing',
      gameDate,
      category: 'Staff',
      title: trText(
        `Pre-Season Squad Readiness & Matchday 1 Analysis vs ${opponentClub?.name || 'Opponent'}`,
        `รายงานความพร้อมขุมกำลังและวิเคราะห์นัดเปิดสนามพบ ${opponentClub?.name || 'คู่แข่ง'}`
      ),
      body: trText(
        `Your Assistant Manager has compiled the first-team readiness report. Our primary formation is currently set to ${controlledClub.primaryTactic.formation}, with our opening match scheduled on ${firstFixture?.kickoffDate || '2025-08-15'}. Review your Starting XI and weekly training focus before kick-off.`,
        `ผู้ช่วยผู้จัดการทีมสรุปความพร้อมของขุมกำลังชุดใหญ่ แผนการเล่นหลักตอนนี้คือ ${controlledClub.primaryTactic.formation} โดยเรามีนัดเปิดสนามวันที่ ${firstFixture?.kickoffDate || '2025-08-15'} แนะนำให้ตรวจสอบตำแหน่งตัวจริงและตั้งค่าการฝึกซ้อมประจำสัปดาห์`
      ),
      isRead: false,
      relatedClubId: controlledClub.id,
      actionType: 'GoToTactics',
    },
  ];

  // Stage 15/17: Apply verified 2025/26 Transfer History & Real Loans (loanedFromClubId + loanOptionToBuyFee)
  const INITIAL_25_26_TRANSFERS: {
    playerName: string;
    fromShort: string;
    fromCountry?: string;
    toShort: string;
    toCountry?: string;
    fee: number;
    date: string;
    type: 'Transfer' | 'Loan' | 'Free';
    optionToBuyFee?: number | null;
  }[] = [
    // Verified 2025/26 Loans (with authentic parent club & option-to-buy fees)
    { playerName: 'Marcus Rashford', fromShort: 'MUN', toShort: 'BAR', fee: 0, date: '2025-07-23', type: 'Loan', optionToBuyFee: 30_000_000 },
    { playerName: 'Piero Hincapie', fromShort: 'B04', toShort: 'ARS', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 52_000_000 },
    { playerName: 'Harvey Elliott', fromShort: 'LIV', toShort: 'AVL', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 40_000_000 },
    { playerName: 'Jadon Sancho', fromShort: 'MUN', toShort: 'AVL', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 25_000_000 },
    { playerName: 'Joao Palhinha', fromShort: 'FCB', fromCountry: 'GER', toShort: 'TOT', fee: 0, date: '2025-08-03', type: 'Loan', optionToBuyFee: 30_000_000 },
    { playerName: 'Randal Kolo Muani', fromShort: 'PSG', toShort: 'TOT', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 45_000_000 },
    { playerName: 'Rasmus Hojlund', fromShort: 'MUN', toShort: 'NAP', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 45_000_000 },
    { playerName: 'Manuel Akanji', fromShort: 'MCI', toShort: 'INT', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 15_000_000 },
    { playerName: 'Jack Grealish', fromShort: 'MCI', toShort: 'EVE', fee: 0, date: '2025-08-12', type: 'Loan', optionToBuyFee: 35_000_000 },
    { playerName: 'Endrick Felipe', fromShort: 'RMA', toShort: 'OL', fee: 0, date: '2025-08-28', type: 'Loan', optionToBuyFee: null },
    { playerName: 'Claudio Echeverri', fromShort: 'MCI', toShort: 'B04', fee: 0, date: '2025-08-21', type: 'Loan', optionToBuyFee: null },
    { playerName: 'Victor Boniface', fromShort: 'B04', toShort: 'SVW', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 30_000_000 },
    { playerName: 'Leon Bailey', fromShort: 'AVL', toShort: 'ROM', fee: 0, date: '2025-08-20', type: 'Loan', optionToBuyFee: 22_000_000 },
    { playerName: 'Nicolas Jackson', fromShort: 'CHE', toShort: 'FCB', toCountry: 'GER', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 65_000_000 },
    { playerName: 'Ansu Fati', fromShort: 'BAR', toShort: 'ASM', fee: 0, date: '2025-07-01', type: 'Loan', optionToBuyFee: 12_000_000 },
    { playerName: 'Andre Onana', fromShort: 'MUN', toShort: 'TRA', fee: 0, date: '2025-09-11', type: 'Loan', optionToBuyFee: 25_000_000 },
    { playerName: 'Evan Ferguson', fromShort: 'BHA', toShort: 'ROM', fee: 0, date: '2025-07-23', type: 'Loan', optionToBuyFee: 38_000_000 },
    { playerName: 'Benjamin Pavard', fromShort: 'INT', toShort: 'OM', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 15_000_000 },
    { playerName: 'Matt ORiley', fromShort: 'BHA', toShort: 'OM', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 28_000_000 },
    { playerName: 'Jhon Duran', fromShort: 'NAS', toShort: 'FEN', fee: 0, date: '2025-07-06', type: 'Loan', optionToBuyFee: null },
    { playerName: 'Vitezslav Jaros', fromShort: 'LIV', toShort: 'AJX', fee: 0, date: '2025-06-18', type: 'Loan', optionToBuyFee: null },
    { playerName: 'Semih Kilicsoy', fromShort: 'BJK', toShort: 'CAG', fee: 0, date: '2025-08-03', type: 'Loan', optionToBuyFee: 12_000_000 },
    { playerName: 'Edson Alvarez', fromShort: 'WHU', toShort: 'FEN', fee: 0, date: '2025-08-23', type: 'Loan', optionToBuyFee: 22_000_000 },
    { playerName: 'Bilal El Khannouss', fromShort: 'LEI', toShort: 'VFB', fee: 0, date: '2025-09-01', type: 'Loan', optionToBuyFee: 25_000_000 },
    { playerName: 'Aaron Ramsdale', fromShort: 'SOU', toShort: 'NEW', fee: 0, date: '2025-08-02', type: 'Loan', optionToBuyFee: 20_000_000 },
    { playerName: 'Matej Kovar', fromShort: 'B04', toShort: 'PSV', fee: 0, date: '2025-07-15', type: 'Loan', optionToBuyFee: 7_000_000 },
    { playerName: 'Anass Salah-Eddine', fromShort: 'ROM', toShort: 'PSV', fee: 0, date: '2025-08-31', type: 'Loan', optionToBuyFee: 8_000_000 },
    { playerName: 'David Jurasek', fromShort: 'SLB', toShort: 'BJK', fee: 0, date: '2025-06-29', type: 'Loan', optionToBuyFee: 7_000_000 },
    { playerName: 'Orkun Kokcu', fromShort: 'SLB', toShort: 'BJK', fee: 0, date: '2025-07-12', type: 'Loan', optionToBuyFee: 25_000_000 },
    { playerName: 'Tammy Abraham', fromShort: 'ROM', toShort: 'BJK', fee: 0, date: '2025-07-03', type: 'Loan', optionToBuyFee: 15_000_000 },

    // Premier League 2025/26 Permanent & Free Transfers
    { playerName: 'Alexander Isak', fromShort: 'NEW', toShort: 'LIV', fee: 145_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Florian Wirtz', fromShort: 'B04', toShort: 'LIV', fee: 125_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Hugo Ekitike', fromShort: 'SGE', toShort: 'LIV', fee: 95_000_000, date: '2025-07-23', type: 'Transfer' },
    { playerName: 'Milos Kerkez', fromShort: 'BOU', toShort: 'LIV', fee: 47_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Jeremie Frimpong', fromShort: 'B04', toShort: 'LIV', fee: 40_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Giorgi Mamardashvili', fromShort: 'VAL', toShort: 'LIV', fee: 30_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Viktor Gyokeres', fromShort: 'SCP', toShort: 'ARS', fee: 73_500_000, date: '2025-07-26', type: 'Transfer' },
    { playerName: 'Eberechi Eze', fromShort: 'CRY', toShort: 'ARS', fee: 69_300_000, date: '2025-08-23', type: 'Transfer' },
    { playerName: 'Martin Zubimendi', fromShort: 'RSO', toShort: 'ARS', fee: 65_000_000, date: '2025-07-06', type: 'Transfer' },
    { playerName: 'Noni Madueke', fromShort: 'CHE', toShort: 'ARS', fee: 56_000_000, date: '2025-07-18', type: 'Transfer' },
    { playerName: 'Cristhian Mosquera', fromShort: 'VAL', toShort: 'ARS', fee: 15_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Christian Norgaard', fromShort: 'BRE', fromCountry: 'ENG', toShort: 'ARS', fee: 11_600_000, date: '2025-07-10', type: 'Transfer' },
    { playerName: 'Kepa Arrizabalaga', fromShort: 'CHE', toShort: 'ARS', fee: 5_800_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Gianluigi Donnarumma', fromShort: 'PSG', toShort: 'MCI', fee: 30_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Tijjani Reijnders', fromShort: 'MIL', toShort: 'MCI', fee: 55_000_000, date: '2025-06-11', type: 'Transfer' },
    { playerName: 'Rayan Cherki', fromShort: 'OL', toShort: 'MCI', fee: 36_500_000, date: '2025-06-10', type: 'Transfer' },
    { playerName: 'Rayan Ait-Nouri', fromShort: 'WOL', toShort: 'MCI', fee: 36_800_000, date: '2025-06-09', type: 'Transfer' },
    { playerName: 'James Trafford', fromShort: 'BUR', toShort: 'MCI', fee: 31_200_000, date: '2025-07-29', type: 'Transfer' },
    { playerName: 'Benjamin Sesko', fromShort: 'RBL', toShort: 'MUN', fee: 76_500_000, date: '2025-08-09', type: 'Transfer' },
    { playerName: 'Matheus Cunha', fromShort: 'WOL', toShort: 'MUN', fee: 74_200_000, date: '2025-06-12', type: 'Transfer' },
    { playerName: 'Bryan Mbeumo', fromShort: 'BRE', fromCountry: 'ENG', toShort: 'MUN', fee: 75_000_000, date: '2025-07-21', type: 'Transfer' },
    { playerName: 'Senne Lammens', fromShort: 'ANT', toShort: 'MUN', fee: 21_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Joao Pedro', fromShort: 'BHA', toShort: 'CHE', fee: 63_700_000, date: '2025-07-02', type: 'Transfer' },
    { playerName: 'Jamie Gittens', fromShort: 'BVB', toShort: 'CHE', fee: 56_000_000, date: '2025-07-05', type: 'Transfer' },
    { playerName: 'Alejandro Garnacho', fromShort: 'MUN', toShort: 'CHE', fee: 46_200_000, date: '2025-08-30', type: 'Transfer' },
    { playerName: 'Jorrel Hato', fromShort: 'AJX', fromCountry: 'NED', toShort: 'CHE', fee: 44_200_000, date: '2025-08-03', type: 'Transfer' },
    { playerName: 'Liam Delap', fromShort: 'IPS', toShort: 'CHE', fee: 35_500_000, date: '2025-06-04', type: 'Transfer' },
    { playerName: 'Estevao Willian', fromShort: 'PAL', toShort: 'CHE', fee: 34_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Xavi Simons', fromShort: 'RBL', toShort: 'TOT', fee: 65_000_000, date: '2025-08-29', type: 'Transfer' },
    { playerName: 'Mohammed Kudus', fromShort: 'WHU', toShort: 'TOT', fee: 63_800_000, date: '2025-07-10', type: 'Transfer' },
    { playerName: 'Mathys Tel', fromShort: 'FCB', fromCountry: 'GER', toShort: 'TOT', fee: 35_000_000, date: '2025-06-15', type: 'Transfer' },
    { playerName: 'Kevin Danso', fromShort: 'RCL', toShort: 'TOT', fee: 25_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Nick Woltemade', fromShort: 'VFB', toShort: 'NEW', fee: 75_000_000, date: '2025-08-30', type: 'Transfer' },
    { playerName: 'Anthony Elanga', fromShort: 'NFO', toShort: 'NEW', fee: 61_400_000, date: '2025-07-11', type: 'Transfer' },
    { playerName: 'Yoane Wissa', fromShort: 'BRE', fromCountry: 'ENG', toShort: 'NEW', fee: 57_700_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Jacob Ramsey', fromShort: 'AVL', toShort: 'NEW', fee: 45_200_000, date: '2025-08-17', type: 'Transfer' },
    { playerName: 'Malick Thiaw', fromShort: 'MIL', toShort: 'NEW', fee: 35_000_000, date: '2025-08-12', type: 'Transfer' },
    { playerName: 'Evann Guessand', fromShort: 'NIC', toShort: 'AVL', fee: 30_000_000, date: '2025-08-08', type: 'Transfer' },
    { playerName: 'Victor Lindelof', fromShort: 'MUN', toShort: 'AVL', fee: 0, date: '2025-09-01', type: 'Free' },
    { playerName: 'Maxim De Cuyper', fromShort: 'CBK', toShort: 'BHA', fee: 20_000_000, date: '2025-07-05', type: 'Transfer' },
    { playerName: 'Olivier Boscagli', fromShort: 'PSV', toShort: 'BHA', fee: 0, date: '2025-07-02', type: 'Free' },
    { playerName: 'Charalampos Kostoulas', fromShort: 'OLY', toShort: 'BHA', fee: 35_000_000, date: '2025-06-12', type: 'Transfer' },
    { playerName: 'Diego Coppola', fromShort: 'VER', toShort: 'BHA', fee: 11_000_000, date: '2025-06-17', type: 'Transfer' },
    { playerName: 'Mads Hermansen', fromShort: 'LEI', toShort: 'WHU', fee: 20_800_000, date: '2025-08-09', type: 'Transfer' },
    { playerName: 'Mateus Fernandes', fromShort: 'SOU', toShort: 'WHU', fee: 44_000_000, date: '2025-08-29', type: 'Transfer' },
    { playerName: 'Kyle Walker-Peters', fromShort: 'SOU', toShort: 'WHU', fee: 0, date: '2025-07-20', type: 'Free' },
    { playerName: 'Yeremy Pino', fromShort: 'VIL', toShort: 'CRY', fee: 30_000_000, date: '2025-08-29', type: 'Transfer' },
    { playerName: 'Walter Benitez', fromShort: 'PSV', toShort: 'CRY', fee: 0, date: '2025-06-23', type: 'Free' },
    { playerName: 'Jhon Arias', fromShort: 'FLU', toShort: 'WOL', fee: 17_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Jackson Tchatchoua', fromShort: 'VER', toShort: 'WOL', fee: 12_500_000, date: '2025-08-19', type: 'Transfer' },
    { playerName: 'David Moller Wolfe', fromShort: 'AZA', toShort: 'WOL', fee: 12_000_000, date: '2025-08-02', type: 'Transfer' },
    { playerName: 'Thierno Barry', fromShort: 'VIL', toShort: 'EVE', fee: 30_000_000, date: '2025-07-09', type: 'Transfer' },
    { playerName: 'Tyler Dibling', fromShort: 'SOU', toShort: 'EVE', fee: 40_500_000, date: '2025-08-25', type: 'Transfer' },
    { playerName: 'Merlin Rohl', fromShort: 'SCF', toShort: 'EVE', fee: 20_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Jordan Henderson', fromShort: 'AJX', toShort: 'BRE', toCountry: 'ENG', fee: 0, date: '2025-07-15', type: 'Free' },
    { playerName: 'Dango Ouattara', fromShort: 'BOU', toShort: 'BRE', toCountry: 'ENG', fee: 42_800_000, date: '2025-08-16', type: 'Transfer' },
    { playerName: 'Adrien Truffert', fromShort: 'REN', toShort: 'BOU', fee: 13_500_000, date: '2025-06-16', type: 'Transfer' },
    { playerName: 'Bafode Diakite', fromShort: 'LOSC', toShort: 'BOU', fee: 35_000_000, date: '2025-08-13', type: 'Transfer' },
    { playerName: 'Ben Doak', fromShort: 'MID', toShort: 'BOU', fee: 23_200_000, date: '2025-08-18', type: 'Transfer' },
    { playerName: 'Douglas Luiz', fromShort: 'JUV', toShort: 'NFO', fee: 30_000_000, date: '2025-08-21', type: 'Transfer' },
    { playerName: 'Dan Ndoye', fromShort: 'BOL', toShort: 'NFO', fee: 42_000_000, date: '2025-07-31', type: 'Transfer' },
    { playerName: 'Igor Jesus', fromShort: 'BOT', toShort: 'NFO', fee: 19_000_000, date: '2025-07-05', type: 'Transfer' },
    { playerName: 'Arnaud Kalimuendo', fromShort: 'REN', toShort: 'NFO', fee: 30_000_000, date: '2025-08-18', type: 'Transfer' },
    { playerName: 'Omari Hutchinson', fromShort: 'IPS', toShort: 'NFO', fee: 43_400_000, date: '2025-08-16', type: 'Transfer' },
    { playerName: 'Lucas Perri', fromShort: 'OL', toShort: 'LEE', fee: 16_000_000, date: '2025-07-26', type: 'Transfer' },
    { playerName: 'Jaka Bijol', fromShort: 'UDI', toShort: 'LEE', fee: 18_000_000, date: '2025-06-23', type: 'Transfer' },
    { playerName: 'Anton Stach', fromShort: 'TSG', toShort: 'LEE', fee: 20_000_000, date: '2025-07-22', type: 'Transfer' },
    { playerName: 'Gabriel Gudmundsson', fromShort: 'LOSC', toShort: 'LEE', fee: 11_600_000, date: '2025-07-08', type: 'Transfer' },
    { playerName: 'James Justin', fromShort: 'LEI', toShort: 'LEE', fee: 9_300_000, date: '2025-08-25', type: 'Transfer' },
    { playerName: 'Dominic Calvert-Lewin', fromShort: 'EVE', toShort: 'LEE', fee: 0, date: '2025-08-15', type: 'Free' },
    { playerName: 'Granit Xhaka', fromShort: 'B04', toShort: 'SUN', fee: 15_000_000, date: '2025-07-30', type: 'Transfer' },
    { playerName: 'Robin Roefs', fromShort: 'NEC', toShort: 'SUN', fee: 10_500_000, date: '2025-08-01', type: 'Transfer' },
    { playerName: 'Omar Alderete', fromShort: 'GET', toShort: 'SUN', fee: 11_600_000, date: '2025-08-12', type: 'Transfer' },
    { playerName: 'Nordi Mukiele', fromShort: 'PSG', toShort: 'SUN', fee: 12_000_000, date: '2025-08-17', type: 'Transfer' },
    { playerName: 'Noah Sadiki', fromShort: 'USG', toShort: 'SUN', fee: 17_000_000, date: '2025-07-04', type: 'Transfer' },
    { playerName: 'Habib Diarra', fromShort: 'RCSA', toShort: 'SUN', fee: 31_500_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Simon Adingra', fromShort: 'BHA', toShort: 'SUN', fee: 24_400_000, date: '2025-07-10', type: 'Transfer' },
    { playerName: 'Brian Brobbey', fromShort: 'AJX', toShort: 'SUN', fee: 20_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Kyle Walker', fromShort: 'MCI', toShort: 'BUR', fee: 0, date: '2025-07-05', type: 'Free' },
    { playerName: 'Martin Dubravka', fromShort: 'NEW', toShort: 'BUR', fee: 0, date: '2025-08-07', type: 'Free' },

    // La Liga 2025/26 Transfers
    { playerName: 'Trent Alexander-Arnold', fromShort: 'LIV', toShort: 'RMA', fee: 10_000_000, date: '2025-06-01', type: 'Transfer' },
    { playerName: 'Dean Huijsen', fromShort: 'BOU', toShort: 'RMA', fee: 62_500_000, date: '2025-06-01', type: 'Transfer' },
    { playerName: 'Alvaro Carreras', fromShort: 'SLB', toShort: 'RMA', fee: 50_000_000, date: '2025-07-14', type: 'Transfer' },
    { playerName: 'Joan Garcia', fromShort: 'ESP', toShort: 'BAR', fee: 25_000_000, date: '2025-06-18', type: 'Transfer' },
    { playerName: 'Alex Baena', fromShort: 'VIL', toShort: 'ATM', fee: 42_000_000, date: '2025-07-02', type: 'Transfer' },
    { playerName: 'Thiago Almada', fromShort: 'OL', toShort: 'ATM', fee: 21_000_000, date: '2025-07-17', type: 'Transfer' },
    { playerName: 'David Hancko', fromShort: 'FEY', toShort: 'ATM', fee: 26_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Johnny Cardoso', fromShort: 'BET', toShort: 'ATM', fee: 24_000_000, date: '2025-07-16', type: 'Transfer' },
    { playerName: 'Matteo Ruggeri', fromShort: 'ATA', toShort: 'ATM', fee: 17_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Giacomo Raspadori', fromShort: 'NAP', toShort: 'ATM', fee: 22_000_000, date: '2025-08-11', type: 'Transfer' },
    { playerName: 'Aymeric Laporte', fromShort: 'NAS', toShort: 'ATH', fee: 10_000_000, date: '2025-09-11', type: 'Transfer' },
    { playerName: 'Thomas Partey', fromShort: 'ARS', toShort: 'VIL', fee: 0, date: '2025-08-07', type: 'Free' },
    { playerName: 'Renato Veiga', fromShort: 'CHE', toShort: 'VIL', fee: 24_500_000, date: '2025-08-22', type: 'Transfer' },
    { playerName: 'Georges Mikautadze', fromShort: 'OL', toShort: 'VIL', fee: 31_000_000, date: '2025-09-01', type: 'Transfer' },

    // Bundesliga 2025/26 Transfers
    { playerName: 'Luis Diaz', fromShort: 'LIV', toShort: 'FCB', toCountry: 'GER', fee: 70_000_000, date: '2025-07-30', type: 'Transfer' },
    { playerName: 'Jonathan Tah', fromShort: 'B04', toShort: 'FCB', toCountry: 'GER', fee: 0, date: '2025-07-01', type: 'Free' },
    { playerName: 'Jarell Quansah', fromShort: 'LIV', toShort: 'B04', fee: 35_000_000, date: '2025-07-02', type: 'Transfer' },
    { playerName: 'Loic Bade', fromShort: 'SEV', toShort: 'B04', fee: 25_000_000, date: '2025-08-21', type: 'Transfer' },
    { playerName: 'Malik Tillman', fromShort: 'PSV', toShort: 'B04', fee: 35_000_000, date: '2025-07-12', type: 'Transfer' },
    { playerName: 'Mark Flekken', fromShort: 'BRE', fromCountry: 'ENG', toShort: 'B04', fee: 10_000_000, date: '2025-06-03', type: 'Transfer' },
    { playerName: 'Eliesse Ben Seghir', fromShort: 'ASM', toShort: 'B04', fee: 32_000_000, date: '2025-08-31', type: 'Transfer' },
    { playerName: 'Lucas Vazquez', fromShort: 'RMA', toShort: 'B04', fee: 0, date: '2025-08-26', type: 'Free' },
    { playerName: 'Jobe Bellingham', fromShort: 'SUN', toShort: 'BVB', fee: 30_500_000, date: '2025-06-10', type: 'Transfer' },
    { playerName: 'Ritsu Doan', fromShort: 'SCF', toShort: 'SGE', fee: 21_000_000, date: '2025-08-07', type: 'Transfer' },
    { playerName: 'Jonathan Burkardt', fromShort: 'M05', toShort: 'SGE', fee: 21_000_000, date: '2025-07-04', type: 'Transfer' },
    { playerName: 'Michael Zetterer', fromShort: 'SVW', toShort: 'SGE', fee: 5_000_000, date: '2025-08-20', type: 'Transfer' },
    { playerName: 'Koki Machida', fromShort: 'USG', toShort: 'TSG', fee: 4_750_000, date: '2025-06-27', type: 'Transfer' },
    { playerName: 'Christian Eriksen', fromShort: 'MUN', toShort: 'WOB', fee: 0, date: '2025-09-10', type: 'Free' },

    // Serie A 2025/26 Transfers
    { playerName: 'Kevin De Bruyne', fromShort: 'MCI', toShort: 'NAP', fee: 0, date: '2025-07-01', type: 'Free' },
    { playerName: 'Noa Lang', fromShort: 'PSV', toShort: 'NAP', fee: 25_000_000, date: '2025-07-17', type: 'Transfer' },
    { playerName: 'Sam Beukema', fromShort: 'BOL', toShort: 'NAP', fee: 31_000_000, date: '2025-07-20', type: 'Transfer' },
    { playerName: 'Miguel Gutierrez', fromShort: 'GIR', toShort: 'NAP', fee: 18_000_000, date: '2025-08-19', type: 'Transfer' },
    { playerName: 'Vanja Milinkovic-Savic', fromShort: 'TOR', toShort: 'NAP', fee: 21_000_000, date: '2025-07-26', type: 'Transfer' },
    { playerName: 'Lorenzo Lucca', fromShort: 'UDI', toShort: 'NAP', fee: 35_000_000, date: '2025-07-18', type: 'Transfer' },
    { playerName: 'Ange-Yoan Bonny', fromShort: 'PAR', toShort: 'INT', fee: 23_000_000, date: '2025-07-05', type: 'Transfer' },
    { playerName: 'Luka Modric', fromShort: 'RMA', toShort: 'MIL', fee: 0, date: '2025-07-14', type: 'Free' },
    { playerName: 'Christopher Nkunku', fromShort: 'CHE', toShort: 'MIL', fee: 37_000_000, date: '2025-08-30', type: 'Transfer' },
    { playerName: 'Adrien Rabiot', fromShort: 'OM', toShort: 'MIL', fee: 7_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Pervis Estupinan', fromShort: 'BHA', toShort: 'MIL', fee: 17_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Ardon Jashari', fromShort: 'CBK', toShort: 'MIL', fee: 36_000_000, date: '2025-08-06', type: 'Transfer' },
    { playerName: 'Samuele Ricci', fromShort: 'TOR', toShort: 'MIL', fee: 23_000_000, date: '2025-07-03', type: 'Transfer' },
    { playerName: 'Koni De Winter', fromShort: 'GEN', toShort: 'MIL', fee: 20_000_000, date: '2025-08-13', type: 'Transfer' },
    { playerName: 'Jonathan David', fromShort: 'LOSC', toShort: 'JUV', fee: 0, date: '2025-07-04', type: 'Free' },
    { playerName: 'Lois Openda', fromShort: 'RBL', toShort: 'JUV', fee: 44_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Edon Zhegrova', fromShort: 'LOSC', toShort: 'JUV', fee: 15_500_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Nikola Krstovic', fromShort: 'LEC', toShort: 'ATA', fee: 25_000_000, date: '2025-08-20', type: 'Transfer' },
    { playerName: 'Kamaldeen Sulemana', fromShort: 'SOU', toShort: 'ATA', fee: 17_000_000, date: '2025-07-02', type: 'Transfer' },
    { playerName: 'Wesley Franca', fromShort: 'FLA', toShort: 'ROM', fee: 25_000_000, date: '2025-07-28', type: 'Transfer' },
    { playerName: 'Neil El Aynaoui', fromShort: 'RCL', toShort: 'ROM', fee: 23_500_000, date: '2025-07-20', type: 'Transfer' },
    { playerName: 'Edin Dzeko', fromShort: 'FEN', toShort: 'FIO', fee: 0, date: '2025-07-10', type: 'Free' },
    { playerName: 'Jacopo Fazzini', fromShort: 'EMP', toShort: 'FIO', fee: 10_000_000, date: '2025-06-25', type: 'Transfer' },
    { playerName: 'Ciro Immobile', fromShort: 'BJK', toShort: 'BOL', fee: 0, date: '2025-07-10', type: 'Free' },
    { playerName: 'Jonathan Rowe', fromShort: 'OM', toShort: 'BOL', fee: 17_000_000, date: '2025-08-24', type: 'Transfer' },
    { playerName: 'Alvaro Morata', fromShort: 'GAL', toShort: 'COM', fee: 10_000_000, date: '2025-08-12', type: 'Transfer' },
    { playerName: 'Nicolas Kuhn', fromShort: 'CELT', toShort: 'COM', fee: 19_000_000, date: '2025-07-11', type: 'Transfer' },
    { playerName: 'Jamie Vardy', fromShort: 'LEI', toShort: 'CRE', fee: 0, date: '2025-09-01', type: 'Free' },

    // Ligue 1 & Rest of World 2025/26 Transfers
    { playerName: 'Lucas Chevalier', fromShort: 'LOSC', toShort: 'PSG', fee: 40_000_000, date: '2025-08-09', type: 'Transfer' },
    { playerName: 'Illia Zabarnyi', fromShort: 'BOU', toShort: 'PSG', fee: 63_000_000, date: '2025-08-12', type: 'Transfer' },
    { playerName: 'Paul Pogba', fromShort: 'JUV', toShort: 'ASM', fee: 0, date: '2025-06-28', type: 'Free' },
    { playerName: 'Igor Paixao', fromShort: 'FEY', toShort: 'OM', fee: 30_000_000, date: '2025-08-01', type: 'Transfer' },
    { playerName: 'Facundo Medina', fromShort: 'RCL', toShort: 'OM', fee: 20_000_000, date: '2025-07-02', type: 'Transfer' },
    { playerName: 'Angel Gomes', fromShort: 'LOSC', toShort: 'OM', fee: 0, date: '2025-07-04', type: 'Free' },
    { playerName: 'Emerson Palmieri', fromShort: 'WHU', toShort: 'OM', fee: 1_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Pierre-Emerick Aubameyang', fromShort: 'QAD', toShort: 'OM', fee: 0, date: '2025-07-31', type: 'Free' },
    { playerName: 'Richard Rios', fromShort: 'PAL', toShort: 'SLB', fee: 27_000_000, date: '2025-07-22', type: 'Transfer' },
    { playerName: 'Franjo Ivanovic', fromShort: 'USG', toShort: 'SLB', fee: 22_800_000, date: '2025-07-31', type: 'Transfer' },
    { playerName: 'Dodi Lukebakio', fromShort: 'SEV', toShort: 'SLB', fee: 20_000_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Fotis Ioannidis', fromShort: 'PAO', toShort: 'SCP', fee: 22_000_000, date: '2025-08-31', type: 'Transfer' },
    { playerName: 'Gabri Veiga', fromShort: 'AHL', toShort: 'FCP', fee: 15_000_000, date: '2025-06-05', type: 'Transfer' },
    { playerName: 'Jan Bednarek', fromShort: 'SOU', toShort: 'FCP', fee: 7_500_000, date: '2025-07-28', type: 'Transfer' },
    { playerName: 'Luuk de Jong', fromShort: 'PSV', toShort: 'FCP', fee: 0, date: '2025-08-03', type: 'Free' },
    { playerName: 'Dennis Man', fromShort: 'PAR', toShort: 'PSV', fee: 8_500_000, date: '2025-08-12', type: 'Transfer' },
    { playerName: 'Alassane Plea', fromShort: 'BMG', toShort: 'PSV', fee: 4_500_000, date: '2025-07-17', type: 'Transfer' },
    { playerName: 'Sem Steijn', fromShort: 'TWE', toShort: 'FEY', fee: 10_000_000, date: '2025-07-01', type: 'Transfer' },
    { playerName: 'Tsuyoshi Watanabe', fromShort: 'GNT', toShort: 'FEY', fee: 8_000_000, date: '2025-07-23', type: 'Transfer' },
    { playerName: 'Casper Tengstedt', fromShort: 'VER', toShort: 'FEY', fee: 6_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Ko Itakura', fromShort: 'BMG', toShort: 'AJX', fee: 10_500_000, date: '2025-08-08', type: 'Transfer' },
    { playerName: 'Oscar Gloukh', fromShort: 'RBS', toShort: 'AJX', fee: 14_750_000, date: '2025-08-01', type: 'Transfer' },
    { playerName: 'Kasper Dolberg', fromShort: 'AND', toShort: 'AJX', fee: 10_000_000, date: '2025-09-02', type: 'Transfer' },
    { playerName: 'Raul Moro', fromShort: 'VLL', toShort: 'AJX', fee: 11_000_000, date: '2025-07-15', type: 'Transfer' },
    { playerName: 'Ludovit Reis', fromShort: 'HSV', toShort: 'CBK', fee: 6_000_000, date: '2025-06-25', type: 'Transfer' },
    { playerName: 'Kjell Scherpen', fromShort: 'STU', toShort: 'USG', fee: 2_000_000, date: '2025-07-24', type: 'Transfer' },
    { playerName: 'Victor Osimhen', fromShort: 'NAP', toShort: 'GAL', fee: 75_000_000, date: '2025-07-31', type: 'Transfer' },
    { playerName: 'Leroy Sane', fromShort: 'FCB', fromCountry: 'GER', toShort: 'GAL', fee: 0, date: '2025-07-01', type: 'Free' },
    { playerName: 'Kerem Akturkoglu', fromShort: 'SLB', toShort: 'FEN', fee: 22_500_000, date: '2025-09-01', type: 'Transfer' },
    { playerName: 'Nelson Semedo', fromShort: 'WOL', toShort: 'FEN', fee: 0, date: '2025-07-31', type: 'Free' },
    { playerName: 'Archie Brown', fromShort: 'GNT', toShort: 'FEN', fee: 8_000_000, date: '2025-07-12', type: 'Transfer' },
    { playerName: 'Wilfred Ndidi', fromShort: 'LEI', toShort: 'BJK', fee: 8_000_000, date: '2025-08-08', type: 'Transfer' },
    { playerName: 'Vaclav Cerny', fromShort: 'RAN', toShort: 'BJK', fee: 6_000_000, date: '2025-09-02', type: 'Transfer' },
    { playerName: 'Kieran Tierney', fromShort: 'ARS', toShort: 'CELT', fee: 0, date: '2025-07-01', type: 'Free' },
    { playerName: 'Darwin Nunez', fromShort: 'LIV', toShort: 'HIL', fee: 53_000_000, date: '2025-08-09', type: 'Transfer' },
    { playerName: 'Theo Hernandez', fromShort: 'MIL', toShort: 'HIL', fee: 25_000_000, date: '2025-07-10', type: 'Transfer' },
    { playerName: 'Kingsley Coman', fromShort: 'FCB', fromCountry: 'GER', toShort: 'NAS', fee: 25_000_000, date: '2025-08-15', type: 'Transfer' },
    { playerName: 'Joao Felix', fromShort: 'CHE', toShort: 'NAS', fee: 30_000_000, date: '2025-07-29', type: 'Transfer' },
    { playerName: 'Inigo Martinez', fromShort: 'BAR', toShort: 'NAS', fee: 0, date: '2025-08-09', type: 'Free' },
    { playerName: 'Enzo Millot', fromShort: 'VFB', toShort: 'AHL', fee: 28_000_000, date: '2025-08-09', type: 'Transfer' },
    { playerName: 'Mateo Retegui', fromShort: 'ATA', toShort: 'QAD', fee: 68_250_000, date: '2025-07-21', type: 'Transfer' },
    { playerName: 'Heung-Min Son', fromShort: 'TOT', toShort: 'LAFC', fee: 22_000_000, date: '2025-08-06', type: 'Transfer' },
    { playerName: 'Rodrigo De Paul', fromShort: 'ATM', toShort: 'MIA', fee: 15_000_000, date: '2025-07-25', type: 'Transfer' },
    { playerName: 'Andreas Pereira', fromShort: 'FUL', toShort: 'PAL', fee: 10_000_000, date: '2025-08-29', type: 'Transfer' },
    { playerName: 'Arthur Cabral', fromShort: 'SLB', toShort: 'BOT', fee: 12_000_000, date: '2025-06-08', type: 'Transfer' },
  ];

  // Index players by normalized name for O(1) transfer history, loan & 2024/25 career stats lookup
  const playerByNormName = new Map<string, Player>();
  for (const p of Object.values(players)) {
    playerByNormName.set(normalizePlayerNameKey(p.firstName, p.lastName), p);
  }

  for (const tr of INITIAL_25_26_TRANSFERS) {
    const targetPlayer = playerByNormName.get(normalizePlayerNameKey(tr.playerName, ''));
    const fromClubId = findClubIdByShortName(tr.fromShort, tr.fromCountry);
    const toClubId = findClubIdByShortName(tr.toShort, tr.toCountry);
    if (!targetPlayer || !fromClubId || !toClubId) continue;
    if (targetPlayer.clubId !== toClubId) continue;

    targetPlayer.transferHistory.push({
      date: tr.date,
      fromClubId,
      toClubId,
      fee: tr.fee,
      type: tr.type,
    });

    if (tr.type === 'Loan') {
      targetPlayer.loanedFromClubId = fromClubId;
      targetPlayer.loanOptionToBuyFee = tr.optionToBuyFee ?? null;
    }
  }

  // Seed authentic 2024/25 Career Season History so Player Profiles & Club Records reflect real 2024/25 form
  const VERIFIED_24_25_PLAYER_STATS: Record<
    string,
    { apps: number; goals: number; assists: number; cs: number; rating: number }
  > = {
    'mohamed salah': { apps: 38, goals: 29, assists: 18, cs: 0, rating: 8.15 },
    'kylian mbappe': { apps: 34, goals: 31, assists: 3, cs: 0, rating: 8.08 },
    'viktor gyokeres': { apps: 33, goals: 39, assists: 7, cs: 0, rating: 8.22 },
    'ousmane dembele': { apps: 49, goals: 35, assists: 16, cs: 0, rating: 8.24 },
    'harry kane': { apps: 31, goals: 26, assists: 9, cs: 0, rating: 8.05 },
    'alexander isak': { apps: 34, goals: 23, assists: 6, cs: 0, rating: 7.86 },
    'erling haaland': { apps: 31, goals: 22, assists: 3, cs: 0, rating: 7.74 },
    'robert lewandowski': { apps: 34, goals: 27, assists: 2, cs: 0, rating: 7.82 },
    'raphinha belloli': { apps: 36, goals: 18, assists: 9, cs: 0, rating: 8.12 },
    'lamine yamal': { apps: 35, goals: 9, assists: 13, cs: 0, rating: 7.98 },
    'desire doue': { apps: 46, goals: 15, assists: 14, cs: 0, rating: 7.82 },
    'bukayo saka': { apps: 25, goals: 6, assists: 10, cs: 0, rating: 7.72 },
    'cole palmer': { apps: 37, goals: 15, assists: 8, cs: 0, rating: 7.76 },
    'florian wirtz': { apps: 31, goals: 10, assists: 12, cs: 0, rating: 7.91 },
    'bryan mbeumo': { apps: 38, goals: 20, assists: 7, cs: 0, rating: 7.68 },
    'matheus cunha': { apps: 33, goals: 15, assists: 6, cs: 0, rating: 7.62 },
    'mateo retegui': { apps: 36, goals: 25, assists: 8, cs: 0, rating: 7.78 },
    'victor osimhen': { apps: 30, goals: 26, assists: 5, cs: 0, rating: 7.92 },
    'serhou guirassy': { apps: 30, goals: 21, assists: 4, cs: 0, rating: 7.69 },
    'mason greenwood': { apps: 34, goals: 21, assists: 5, cs: 0, rating: 7.64 },
    'lautaro martinez': { apps: 31, goals: 12, assists: 3, cs: 0, rating: 7.56 },
    'marcus thuram': { apps: 32, goals: 14, assists: 4, cs: 0, rating: 7.58 },
    'jamal musiala': { apps: 25, goals: 12, assists: 2, cs: 0, rating: 7.84 },
    'michael olise': { apps: 34, goals: 12, assists: 15, cs: 0, rating: 7.95 },
    'vinicius junior': { apps: 30, goals: 11, assists: 8, cs: 0, rating: 7.66 },
    'jude bellingham': { apps: 31, goals: 9, assists: 8, cs: 0, rating: 7.68 },
    'pedri gonzalez': { apps: 37, goals: 4, assists: 5, cs: 0, rating: 7.94 },
    'declan rice': { apps: 35, goals: 4, assists: 7, cs: 0, rating: 7.65 },
    'bruno fernandes': { apps: 36, goals: 8, assists: 10, cs: 0, rating: 7.52 },
    'ollie watkins': { apps: 38, goals: 16, assists: 8, cs: 0, rating: 7.54 },
    'omar marmoush': { apps: 33, goals: 22, assists: 10, cs: 0, rating: 7.79 },
    'hugo ekitike': { apps: 33, goals: 15, assists: 8, cs: 0, rating: 7.58 },
    'benjamin sesko': { apps: 33, goals: 13, assists: 5, cs: 0, rating: 7.45 },
    'jonathan david': { apps: 32, goals: 16, assists: 5, cs: 0, rating: 7.56 },
    'vangelis pavlidis': { apps: 34, goals: 19, assists: 7, cs: 0, rating: 7.62 },
    'julian alvarez': { apps: 37, goals: 17, assists: 4, cs: 0, rating: 7.64 },
    'scott mctominay': { apps: 34, goals: 12, assists: 4, cs: 0, rating: 7.78 },
    'romelu lukaku': { apps: 36, goals: 14, assists: 10, cs: 0, rating: 7.58 },
    'khvicha kvaratskhelia': { apps: 31, goals: 9, assists: 6, cs: 0, rating: 7.72 },
    'bradley barcola': { apps: 34, goals: 14, assists: 10, cs: 0, rating: 7.68 },
    'vitinha ferreira': { apps: 29, goals: 5, assists: 4, cs: 0, rating: 7.81 },
    'achraf hakimi': { apps: 25, goals: 4, assists: 6, cs: 11, rating: 7.88 },
    'virgil van dijk': { apps: 37, goals: 3, assists: 1, cs: 14, rating: 7.76 },
    'william saliba': { apps: 35, goals: 2, assists: 0, cs: 13, rating: 7.62 },
    'alessandro bastoni': { apps: 33, goals: 1, assists: 5, cs: 14, rating: 7.68 },
    'gianluigi donnarumma': { apps: 24, goals: 0, assists: 0, cs: 11, rating: 7.58 },
    'david raya': { apps: 38, goals: 0, assists: 0, cs: 13, rating: 7.46 },
    'thibaut courtois': { apps: 30, goals: 0, assists: 0, cs: 11, rating: 7.48 },
    'lionel messi': { apps: 28, goals: 23, assists: 16, cs: 0, rating: 8.18 },
    'cristiano ronaldo': { apps: 30, goals: 25, assists: 3, cs: 0, rating: 7.82 },
    'chris wood': { apps: 36, goals: 20, assists: 3, cs: 0, rating: 7.54 },
    'yoane wissa': { apps: 35, goals: 19, assists: 4, cs: 0, rating: 7.52 },
    'moise kean': { apps: 32, goals: 19, assists: 3, cs: 0, rating: 7.56 },
    'ademola lookman': { apps: 31, goals: 15, assists: 5, cs: 0, rating: 7.64 },
    'christian pulisic': { apps: 34, goals: 11, assists: 9, cs: 0, rating: 7.58 },
    'tijjani reijnders': { apps: 37, goals: 10, assists: 4, cs: 0, rating: 7.62 },
    'martin odegaard': { apps: 30, goals: 3, assists: 8, cs: 0, rating: 7.55 },
    'eberechi eze': { apps: 34, goals: 8, assists: 8, cs: 0, rating: 7.56 },
    'jean-philippe mateta': { apps: 37, goals: 14, assists: 2, cs: 0, rating: 7.42 },
    'luis diaz': { apps: 36, goals: 13, assists: 5, cs: 0, rating: 7.55 },
    'cody gakpo': { apps: 35, goals: 10, assists: 4, cs: 0, rating: 7.42 },
    'nick woltemade': { apps: 28, goals: 12, assists: 2, cs: 0, rating: 7.48 },
    'sem steijn': { apps: 33, goals: 24, assists: 7, cs: 0, rating: 7.72 },
    'igor paixao': { apps: 34, goals: 16, assists: 10, cs: 0, rating: 7.68 },
    'jonathan burkardt': { apps: 29, goals: 18, assists: 3, cs: 0, rating: 7.56 },
  };

  for (const p of Object.values(players)) {
    const birthYear = parseInt(p.dateOfBirth.slice(0, 4), 10) || 2002;
    const ageIn2025 = 2025 - birthYear;
    const normKey = normalizePlayerNameKey(p.firstName, p.lastName);
    const verified = VERIFIED_24_25_PLAYER_STATS[normKey];
    if (!verified && ageIn2025 < 19) continue;

    // Attribute 2024/25 stats to the player's previous club if they moved in Summer 2025
    const club2425Id = p.transferHistory[0]?.fromClubId || p.clubId;
    const club2425Name = clubs[club2425Id]?.name || clubs[p.clubId]?.name || 'Club';

    if (verified) {
      p.careerSeasonHistory = [
        {
          season: '2024/25',
          clubId: club2425Id,
          clubName: club2425Name,
          appearances: verified.apps,
          goals: verified.goals,
          assists: verified.assists,
          cleanSheets: verified.cs,
          averageRating: verified.rating,
        },
      ];
      continue;
    }

    // Deterministic realistic 2024/25 season line for remaining senior players
    const pos = p.positions[0];
    const caFactor = Math.max(0, Math.min(1, (p.currentAbility - 115) / 65));
    const apps = Math.max(8, Math.min(38, Math.round(16 + caFactor * 18 + (rng.next() * 8 - 4))));
    let goals = 0;
    let assists = 0;
    let cleanSheets = 0;

    if (pos === 'GK') {
      cleanSheets = Math.max(1, Math.min(apps - 2, Math.round(apps * (0.24 + caFactor * 0.16))));
    } else if (pos === 'ST') {
      goals = Math.max(2, Math.round(apps * (0.18 + caFactor * 0.34) + rng.next() * 3));
      assists = Math.max(0, Math.round(apps * (0.06 + caFactor * 0.1) + rng.next() * 2));
    } else if (pos === 'AML' || pos === 'AMR' || pos === 'AMC' || pos === 'ML' || pos === 'MR') {
      goals = Math.max(1, Math.round(apps * (0.11 + caFactor * 0.2) + rng.next() * 2));
      assists = Math.max(1, Math.round(apps * (0.12 + caFactor * 0.18) + rng.next() * 2));
    } else if (pos === 'MC' || pos === 'DM') {
      goals = Math.max(0, Math.round(apps * (0.04 + caFactor * 0.1) + rng.next() * 1.5));
      assists = Math.max(0, Math.round(apps * (0.07 + caFactor * 0.14) + rng.next() * 2));
    } else {
      goals = Math.max(0, Math.round(apps * (0.02 + caFactor * 0.05) + rng.next() * 1.2));
      assists = Math.max(0, Math.round(apps * (pos === 'DC' ? 0.02 : 0.08 + caFactor * 0.1)));
      cleanSheets = Math.max(1, Math.round(apps * (0.22 + caFactor * 0.14)));
    }

    const avgRating = Number(
      Math.max(6.45, Math.min(7.72, 6.65 + caFactor * 0.72 + (rng.next() * 0.24 - 0.12))).toFixed(2)
    );

    p.careerSeasonHistory = [
      {
        season: '2024/25',
        clubId: club2425Id,
        clubName: club2425Name,
        appearances: apps,
        goals,
        assists,
        cleanSheets,
        averageRating: avgRating,
      },
    ];
  }

  // Populate FM27 Player Traits (Preferred Moves) for all players
  for (const p of Object.values(players)) {
    p.traits = derivePlayerTraitsFromAttributes(p);
  }

  // Assign authentic squad shirt numbers (1–99) per club with real-world 2025/26–2026/27 star numbers
  const ICONIC_SHIRT_NUMBERS: Record<string, number> = {
    'david raya': 22,
    'william saliba': 2,
    'gabriel magalhaes': 6,
    'ben white': 4,
    'jurrien timber': 12,
    'piero hincapie': 5,
    'declan rice': 41,
    'martin zubimendi': 36,
    'martin odegaard': 8,
    'eberechi eze': 10,
    'bukayo saka': 7,
    'gabriel martinelli': 11,
    'viktor gyokeres': 14,
    'noni madueke': 20,
    'kai havertz': 29,
    'mikel merino': 23,
    'riccardo calafiori': 33,
    'leandro trossard': 19,
    'ethan nwaneri': 53,
    'myles lewis-skelly': 49,
    'gianluigi donnarumma': 25,
    'ederson moraes': 31,
    'ruben dias': 3,
    'josko gvardiol': 24,
    'john stones': 5,
    'manuel akanji': 25,
    'rodri hernandez': 16,
    'tijjani reijnders': 4,
    'rayan cherki': 10,
    'bernardo silva': 20,
    'phil foden': 47,
    'jeremy doku': 11,
    'savinho moreira': 26,
    'erling haaland': 9,
    'mateo kovacic': 8,
    'alisson becker': 1,
    'virgil van dijk': 4,
    'ibrahima konate': 5,
    'milos kerkez': 6,
    'jeremie frimpong': 30,
    'andrew robertson': 26,
    'ryan gravenberch': 38,
    'alexis mac allister': 10,
    'dominik szoboszlai': 8,
    'florian wirtz': 7,
    'mohamed salah': 11,
    'alexander isak': 9,
    'hugo ekitike': 22,
    'cody gakpo': 18,
    'curtis jones': 17,
    'cole palmer': 20,
    'moises caicedo': 25,
    'enzo fernandez': 8,
    'levi colwill': 6,
    'marc cucurella': 3,
    'reece james': 24,
    'joao pedro': 20,
    'estevao willian': 41,
    'pedro neto': 7,
    'alejandro garnacho': 49,
    'liam delap': 9,
    'bruno fernandes': 8,
    'kobbie mainoo': 37,
    'amad diallo': 16,
    'lisandro martinez': 6,
    'matthijs de ligt': 4,
    'matheus cunha': 10,
    'bryan mbeumo': 19,
    'benjamin sesko': 30,
    'heung-min son': 7,
    'son heung-min': 7,
    'xavi simons': 7,
    'mohammed kudus': 20,
    'james maddison': 10,
    'dejan kulusevski': 21,
    'cristian romero': 17,
    'micky van de ven': 37,
    'dominic solanke': 19,
    'bruno guimaraes': 39,
    'anthony gordon': 10,
    'sandro tonali': 8,
    'nick woltemade': 27,
    'ollie watkins': 11,
    'morgan rogers': 27,
    'emiliano martinez': 23,
    'thibaut courtois': 1,
    'antonio rudiger': 22,
    'eder militao': 3,
    'dani carvajal': 2,
    'trent alexander-arnold': 12,
    'dean huijsen': 24,
    'alvaro carreras': 18,
    'federico valverde': 8,
    'jude bellingham': 5,
    'aurelien tchouameni': 14,
    'eduardo camavinga': 6,
    'vinicius junior': 7,
    'kylian mbappe': 9,
    'rodrygo goes': 11,
    'arda guler': 15,
    'joan garcia': 13,
    'lamine yamal': 10,
    'marcus rashford': 14,
    'pedri gonzalez': 8,
    'gavi paez': 6,
    'pau cubarsi': 2,
    'jules kounde': 23,
    'alejandro balde': 3,
    'raphinha belloli': 11,
    'robert lewandowski': 9,
    'dani olmo': 20,
    'frenkie de jong': 21,
    'julian alvarez': 19,
    'antoine griezmann': 7,
    'jan oblak': 13,
    'alex baena': 10,
    'nico williams': 10,
    'harry kane': 9,
    'jamal musiala': 42,
    'michael olise': 17,
    'luis diaz': 14,
    'jonathan tah': 4,
    'joshua kimmich': 6,
    'alphonso davies': 19,
    'dayot upamecano': 2,
    'manuel neuer': 1,
    'granit xhaka': 34,
    'alejandro grimaldo': 20,
    'serhou guirassy': 9,
    'gregor kobel': 1,
    'jobe bellingham': 7,
    'lautaro martinez': 10,
    'nicolo barella': 23,
    'alessandro bastoni': 95,
    'hakan calhanoglu': 20,
    'marcus thuram': 9,
    'federico dimarco': 32,
    'khvicha kvaratskhelia': 77,
    'kevin de bruyne': 11,
    'rasmus hojlund': 19,
    'romelu lukaku': 9,
    'scott mctominay': 8,
    'luka modric': 14,
    'rafael leao': 10,
    'christian pulisic': 11,
    'mike maignan': 16,
    'kenan yildiz': 10,
    'dusan vlahovic': 9,
    'jonathan david': 30,
    'ousmane dembele': 10,
    'bradley barcola': 29,
    'joao neves': 87,
    'vitinha ferreira': 17,
    'achraf hakimi': 2,
    'nuno mendes': 25,
    'victor osimhen': 45,
    'leroy sane': 10,
    'darwin nunez': 9,
    'theo hernandez': 19,
    'kingsley coman': 21,
    'joao felix': 79,
    'lionel messi': 10,
    'luis suarez': 9,
    'sergio busquets': 5,
    'jordi alba': 18,
    'cristiano ronaldo': 7,
    'sadio mane': 10,
    'karim benzema': 9,
    'ngolo kante': 7,
    'neymar junior': 10,
    'aleksandar mitrovic': 9,
    'ruben neves': 8,
    'riyad mahrez': 7,
    'ivan toney': 99,
  };

  for (const clubId of Object.keys(clubs)) {
    const clubSquad = Object.values(players)
      .filter((p) => p.clubId === clubId)
      .sort((a, b) => b.currentAbility - a.currentAbility);
    const usedNums = new Set<number>();

    // Pass 1: Assign known real-world iconic numbers
    for (const p of clubSquad) {
      const fullKey = `${p.firstName} ${p.lastName}`.toLowerCase();
      const iconic = ICONIC_SHIRT_NUMBERS[fullKey];
      if (iconic && !usedNums.has(iconic)) {
        p.shirtNumber = iconic;
        usedNums.add(iconic);
      }
    }

    // Pass 2: Assign position-authentic numbers to remaining players
    const pickAvailable = (preferred: number[]): number => {
      for (const n of preferred) {
        if (!usedNums.has(n)) {
          usedNums.add(n);
          return n;
        }
      }
      for (let n = 12; n <= 99; n++) {
        if (!usedNums.has(n)) {
          usedNums.add(n);
          return n;
        }
      }
      return 99;
    };

    for (const p of clubSquad) {
      if (p.shirtNumber) continue;
      const pos = p.positions[0];
      if (pos === 'GK') {
        p.shirtNumber = pickAvailable([1, 13, 25, 31, 40]);
      } else if (pos === 'DR' || pos === 'WBR') {
        p.shirtNumber = pickAvailable([2, 12, 22, 24, 30]);
      } else if (pos === 'DL' || pos === 'WBL') {
        p.shirtNumber = pickAvailable([3, 15, 18, 21, 33]);
      } else if (pos === 'DC') {
        p.shirtNumber = pickAvailable([4, 5, 6, 14, 15, 23, 26]);
      } else if (pos === 'DM' || pos === 'MC') {
        p.shirtNumber = pickAvailable([6, 8, 16, 17, 20, 23, 28]);
      } else if (pos === 'AMC') {
        p.shirtNumber = pickAvailable([10, 8, 14, 20, 21, 27]);
      } else if (pos === 'AMR' || pos === 'AML' || pos === 'MR' || pos === 'ML') {
        p.shirtNumber = pickAvailable([7, 11, 17, 19, 20, 22, 29]);
      } else {
        p.shirtNumber = pickAvailable([9, 11, 19, 18, 27, 29]);
      }
    }
  }

  // Create default Mentoring Group for the controlled club (Veteran >= 25 -> U21 prospects)
  const controlledPlayers = Object.values(players).filter((p) => p.clubId === controlledClub.id);
  const mentorCandidates = controlledPlayers
    .filter((p) => {
      const birthYear = parseInt(p.dateOfBirth.slice(0, 4), 10) || 1998;
      return 2026 - birthYear >= 25 && p.positions[0] !== 'GK';
    })
    .sort(
      (a, b) =>
        b.attributes.mental.leadership +
        b.professionalism +
        b.attributes.mental.determination -
        (a.attributes.mental.leadership + a.professionalism + a.attributes.mental.determination)
    );
  const menteeCandidates = controlledPlayers
    .filter((p) => {
      const birthYear = parseInt(p.dateOfBirth.slice(0, 4), 10) || 2006;
      return 2026 - birthYear <= 21 && p.positions[0] !== 'GK';
    })
    .sort((a, b) => b.potentialAbility - a.potentialAbility)
    .slice(0, 2);

  const mentoringGroups: MentoringGroup[] = [];
  if (mentorCandidates[0] && menteeCandidates.length > 0) {
    const mentor = mentorCandidates[0];
    for (const mentee of menteeCandidates) {
      mentee.mentorId = mentor.id;
    }
    mentoringGroups.push({
      id: `mnt_init_${controlledClub.id}`,
      clubId: controlledClub.id,
      mentorId: mentor.id,
      menteeIds: menteeCandidates.map((m) => m.id),
      focusTrait: mentor.traits?.[0] || 'Places Shots',
      createdAt: gameDate,
    });
  }

  // Seed verified 2024/25 Annual Awards Gala records (2025 Ballon d'Or, Golden Shoe, Golden Boy & Manager of the Season)
  const allPlayerList = Object.values(players).sort((a, b) => b.currentAbility - a.currentAbility);
  const ballonDorWinner =
    playerByNormName.get(normalizePlayerNameKey('Ousmane Dembele', '')) || allPlayerList[0];
  const goldenBootWinner =
    playerByNormName.get(normalizePlayerNameKey('Kylian Mbappe', '')) ||
    allPlayerList.find((p) => p.positions.includes('ST')) ||
    allPlayerList[0];
  const goldenBoyWinner =
    playerByNormName.get(normalizePlayerNameKey('Desire Doue', '')) ||
    allPlayerList.find((p) => {
      const birthYear = parseInt(p.dateOfBirth.slice(0, 4), 10) || 2005;
      return 2025 - birthYear <= 21;
    }) ||
    allPlayerList[0];
  const psgClubId = findClubIdByShortName('PSG', 'FRA') || 'club_fra_l1_1';

  const seasonAwardsHistory: SeasonAwardRecord[] = [
    {
      season: '2024/25',
      ballonDor: {
        playerId: ballonDorWinner.id,
        playerName: `${ballonDorWinner.firstName} ${ballonDorWinner.lastName}`,
        clubId: ballonDorWinner.clubId,
        clubName: clubs[ballonDorWinner.clubId]?.name || 'Paris Saint-Germain',
        goals: 35,
        assists: 16,
        averageRating: 8.24,
      },
      goldenBoot: {
        playerId: goldenBootWinner.id,
        playerName: `${goldenBootWinner.firstName} ${goldenBootWinner.lastName}`,
        clubId: goldenBootWinner.clubId,
        clubName: clubs[goldenBootWinner.clubId]?.name || 'Real Madrid',
        goals: 31,
      },
      goldenBoy: {
        playerId: goldenBoyWinner.id,
        playerName: `${goldenBoyWinner.firstName} ${goldenBoyWinner.lastName}`,
        clubId: goldenBoyWinner.clubId,
        clubName: clubs[goldenBoyWinner.clubId]?.name || 'Paris Saint-Germain',
        age: 20,
        ca: goldenBoyWinner.currentAbility,
        averageRating: 7.82,
      },
      managerOfTheSeason: {
        managerName: 'Luis Enrique',
        clubId: psgClubId,
        clubName: clubs[psgClubId]?.name || 'Paris Saint-Germain',
      },
    },
  ];

  return {
    saveId: `save_${Date.now()}`,
    saveName: `${controlledClub.name} — ${currentSeason}`,
    saveVersion: 3,
    lastSavedAt: new Date().toISOString(),
    gameDate,
    currentSeason,
    randomSeed: seed,
    processedDates: [],
    manager,
    controlledClubId,
    leagues: LEAGUES_CONFIG,
    clubs,
    players,
    staff,
    fixtures,
    standings,
    uefaStandings,
    uefaPots,
    transferOffers: [],
    shortlistPlayerIds: [],
    scoutAssignments: [],
    scoutReports: {},
    transactions,
    inbox,
    mentoringGroups,
    trophyHistory,
    seasonAwardsHistory,
    controlledNationalTeamCode: null,
    scenarioChallenge,
    customClubConfig: customClubConfig || null,
  };
}


