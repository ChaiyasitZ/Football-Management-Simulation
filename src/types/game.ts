export type LeagueId =
  | 'ENG_PL'
  | 'ESP_LL'
  | 'GER_BL'
  | 'ITA_SA'
  | 'FRA_L1'
  | 'POR_LP'
  | 'NED_ED'
  | 'BEL_PL'
  | 'TUR_SL'
  | 'SCO_PR'
  | 'ENG_CH'
  | 'ESP_SD'
  | 'GER_2B'
  | 'ITA_SB'
  | 'FRA_L2';
export type CupId =
  | 'ENG_CUP'
  | 'ESP_CUP'
  | 'GER_CUP'
  | 'ITA_CUP'
  | 'FRA_CUP'
  | 'POR_CUP'
  | 'NED_CUP'
  | 'BEL_CUP'
  | 'TUR_CUP'
  | 'SCO_CUP';
export type UefaCompetitionId = 'UEFA_UCL' | 'UEFA_UEL' | 'UEFA_UECL';
export type InternationalCompetitionId = 'INT_EURO' | 'GLB_CWC';
export type CompetitionId = LeagueId | CupId | UefaCompetitionId | InternationalCompetitionId;
export type UefaStage = 'LEAGUE_PHASE' | 'KPO' | 'R16' | 'QF' | 'SF' | 'FINAL';

export type NationalTeamCode = 'ENG' | 'ESP' | 'GER' | 'ITA' | 'FRA' | 'BRA' | 'ARG' | 'POR';
export type PreSeasonTourRegion = 'ASIA' | 'USA' | 'MIDDLE_EAST';
export type MindGameTone = 'attack' | 'praise' | 'deflect';
export type ScenarioChallengeId = 'STANDARD' | 'POINTS_DEDUCTION' | 'INJURY_CRISIS' | 'YOUTH_ONLY';
export type WeatherCondition = 'Clear' | 'Light Rain' | 'Heavy Rain' | 'Strong Wind' | 'Snow';
export type PitchCondition = 'Perfect' | 'Slick' | 'Waterlogged' | 'Frozen';

export interface CustomClubConfig {
  enabled: boolean;
  name: string;
  shortName: string;
  primaryColor: string;
  secondaryColor: string;
  stadiumName: string;
}

export type PositionCode =
  | 'GK'
  | 'DR'
  | 'DL'
  | 'DC'
  | 'WBR'
  | 'WBL'
  | 'DM'
  | 'MC'
  | 'MR'
  | 'ML'
  | 'AMC'
  | 'AMR'
  | 'AML'
  | 'ST';

export type PositionGroup = 'GK' | 'DEF' | 'MID' | 'ATT';

export type FormationId =
  | '4-3-3'
  | '4-2-3-1'
  | '4-4-2'
  | '4-1-4-1'
  | '4-3-1-2'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '5-4-1';

export type Mentality =
  | 'Very Defensive'
  | 'Defensive'
  | 'Cautious'
  | 'Balanced'
  | 'Positive'
  | 'Attacking'
  | 'Very Attacking';

export type PassingDirectness =
  | 'Much Shorter'
  | 'Shorter'
  | 'Mixed'
  | 'More Direct'
  | 'Much More Direct';

export type Tempo = 'Much Lower' | 'Lower' | 'Standard' | 'Higher' | 'Much Higher';
export type AttackingWidth = 'Narrow' | 'Standard' | 'Wide';
export type BuildUpPlay = 'Play Out of Defence' | 'Mixed' | 'More Direct';
export type PressingIntensity = 'Low' | 'Standard' | 'High' | 'Very High';
export type DefensiveLine = 'Deep' | 'Standard' | 'High' | 'Very High';
export type LineOfEngagement = 'Low' | 'Mid' | 'High';
export type TransitionInstruction = 'Counter-Press' | 'Regroup' | 'Counter' | 'Hold Shape';
export type PossessionLostInstruction = 'Counter-Press' | 'Regroup';
export type PossessionWonInstruction = 'Counter' | 'Hold Shape';
export type DefensiveApproach = 'Zonal Marking' | 'Man Marking';
export type TimeWasting = 'Never' | 'Sometimes' | 'Often';
export type TacklingStyle = 'Stay On Feet' | 'Standard' | 'Get Stuck In';
export type TouchlineShoutType = 'Encourage' | 'Demand More' | 'Calm Down' | 'Focus' | 'Praise';
export type HalfTimeTalkType = 'praise' | 'encourage' | 'demand_more' | 'aggressive' | 'no_complacency';
export type CornerRoutineType = 'near_post' | 'far_post' | 'centre' | 'short';
export type FreeKickRoutineType = 'direct_shoot' | 'cross_box' | 'short_layoff';

export type PlayerTrait =
  | 'Places Shots'
  | 'Curls Ball'
  | 'Tries Killer Balls Often'
  | 'Dictates Tempo'
  | 'Dives Into Tackles'
  | 'Beats Offside Trap'
  | 'Runs With Ball Often'
  | 'Power Header';

export type PlayerRole =
  | 'Goalkeeper'
  | 'Sweeper Keeper'
  | 'Full Back'
  | 'Wing Back'
  | 'Complete Wing Back'
  | 'Inverted Wing Back'
  | 'Central Defender'
  | 'Ball Playing Defender'
  | 'No-Nonsense Centre Back'
  | 'Defensive Midfielder'
  | 'Anchor'
  | 'Half Back'
  | 'Deep-Lying Playmaker'
  | 'Central Midfielder'
  | 'Box-to-Box Midfielder'
  | 'Ball Winning Midfielder'
  | 'Advanced Playmaker'
  | 'Mezzala'
  | 'Carrilero'
  | 'Attacking Midfielder'
  | 'Trequartista'
  | 'Shadow Striker'
  | 'Winger'
  | 'Inverted Winger'
  | 'Inside Forward'
  | 'Wide Playmaker'
  | 'False 9'
  | 'Deep-Lying Forward'
  | 'Advanced Forward'
  | 'Pressing Forward'
  | 'Target Forward'
  | 'Complete Forward';

export type PlayerInstruction =
  | 'Dribble More'
  | 'Dribble Less'
  | 'Shoot More'
  | 'Shoot Less'
  | 'Take More Risks'
  | 'Hold Position'
  | 'Roam From Position'
  | 'Stay Wider'
  | 'Cut Inside'
  | 'Cross More Often'
  | 'Mark Tighter'
  | 'Tackle Harder'
  | 'Ease Off Tackles'
  | 'Trigger Press More'
  | 'Trigger Press Less';

export interface TechnicalAttributes {
  finishing: number;
  firstTouch: number;
  passing: number;
  technique: number;
  dribbling: number;
  crossing: number;
  heading: number;
  tackling: number;
  marking: number;
  longShots: number;
  penaltyTaking: number;
  freeKickTaking: number;
  corners: number;
  ballControl: number;
}

export interface MentalAttributes {
  decisions: number;
  vision: number;
  composure: number;
  concentration: number;
  positioning: number;
  anticipation: number;
  workRate: number;
  teamwork: number;
  leadership: number;
  determination: number;
  aggression: number;
  flair: number;
  offTheBall: number;
  bravery: number;
  consistency: number;
}

export interface PhysicalAttributes {
  acceleration: number;
  pace: number;
  stamina: number;
  strength: number;
  agility: number;
  balance: number;
  jumpingReach: number;
  naturalFitness: number;
}

export interface PlayerAttributes {
  technical: TechnicalAttributes;
  mental: MentalAttributes;
  physical: PhysicalAttributes;
}

export interface PlayerSeasonStats {
  appearances: number;
  starts: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  minutesPlayed: number;
  averageRating: number;
  manOfTheMatch: number;
}

export interface DevelopmentPoint {
  date: string;
  ca: number;
  keyAttributeChanges: { attr: string; delta: number }[];
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  nationalityCode: string;
  heightCm: number;
  weightKg: number;
  preferredFoot: 'Right' | 'Left' | 'Both';
  positions: PositionCode[];
  preferredRole: PlayerRole;
  currentAbility: number; // 1-200 internal scale mapped clearly to 1-20 stars/tiers
  potentialAbility: number; // 1-200 internal scale
  potentialRange: [number, number]; // Scouted range visible to user
  attributes: PlayerAttributes;
  fitness: number; // 1-100
  matchSharpness: number; // 1-100
  morale: number; // 1-100
  tacticalFamiliarity: number; // 1-100
  squadStatus: 'Star Player' | 'Important Player' | 'Regular Starter' | 'Squad Player' | 'Breakthrough Prospect' | 'Youth';
  satisfaction: number; // 1-100
  personality: 'Model Citizen' | 'Professional' | 'Resolute' | 'Ambitious' | 'Balanced' | 'Spirited' | 'Mercenary';
  professionalism: number; // 1-20
  clubId: string;
  loanedFromClubId?: string | null;
  wagePerWeek: number; // in EUR
  contractEndDate: string;
  releaseClause?: number | null;
  goalBonus: number;
  marketValue: number;
  askingPrice: number;
  transferListed: boolean;
  loanListed: boolean;
  injuryStatus: {
    isInjured: boolean;
    type?: string;
    daysRemaining: number;
  };
  individualTraining: {
    attributeFocus: keyof TechnicalAttributes | keyof MentalAttributes | keyof PhysicalAttributes | 'Balanced';
    roleFocus: PlayerRole;
    intensity: 'Light' | 'Medium' | 'Heavy';
  };
  stats: PlayerSeasonStats;
  developmentHistory: DevelopmentPoint[];
  transferHistory: { date: string; fromClubId: string; toClubId: string; fee: number; type: 'Transfer' | 'Loan' | 'Free' }[];
  isYouthAcademy?: boolean;
  isHomegrown?: boolean;
  isRegistered?: boolean;
  consecutiveBenched?: number;
  playInReserves?: boolean;
  suspensionMatchesRemaining?: number;
  unhappyReason?: string | null;
  youthSquad?: 'u18' | 'u21' | 'senior';
  contractType?: 'youth' | 'professional';
  mentorId?: string | null;
  isWonderkid?: boolean;
  traits?: PlayerTrait[];
}

export interface TacticalSlot {
  slotIndex: number; // 0..10
  position: PositionCode;
  role: PlayerRole;
  x: number; // 0..100 pitch width (left to right)
  y: number; // 0..100 pitch length (90 = own GK, 10 = opponent box)
  playerId: string | null;
  instructions: PlayerInstruction[];
}

export interface TeamInstructions {
  mentality: Mentality;
  passingDirectness: PassingDirectness;
  tempo: Tempo;
  attackingWidth: AttackingWidth;
  buildUp: BuildUpPlay;
  pressingIntensity: PressingIntensity;
  defensiveLine: DefensiveLine;
  lineOfEngagement: LineOfEngagement;
  transition: TransitionInstruction;
  whenPossessionLost?: PossessionLostInstruction;
  whenPossessionWon?: PossessionWonInstruction;
  defensiveApproach: DefensiveApproach;
  timeWasting: TimeWasting;
  offsideTrap: boolean;
  tackling: TacklingStyle;
}

export interface SetPieceSetup {
  captainId?: string | null;
  penaltyTakerId?: string | null;
  freeKickTakerId?: string | null;
  cornerTakerId?: string | null;
  cornerRoutine: CornerRoutineType;
  freeKickRoutine: FreeKickRoutineType;
}

export interface TacticalSystem {
  id: string;
  name: string;
  formation: FormationId;
  instructions: TeamInstructions;
  lineup: TacticalSlot[]; // 11 starting slots
  benchPlayerIds: string[]; // up to 9 subs
  familiarity: number; // 1-100
  setPieces?: SetPieceSetup;
}

export type StaffRole =
  | 'Assistant Manager'
  | 'First Team Coach'
  | 'Fitness Coach'
  | 'Goalkeeping Coach'
  | 'Youth Coach'
  | 'Head Scout'
  | 'Scout'
  | 'Physio'
  | 'Data Analyst'
  | 'Director of Football';

export interface StaffMember {
  id: string;
  name: string;
  nationality: string;
  age: number;
  role: StaffRole;
  clubId: string | null; // null = Free Agent available to hire
  wagePerWeek: number;
  contractEndDate: string;
  attributes: {
    coachingTechnical: number;
    coachingTactical: number;
    fitnessCoaching: number;
    judgingAbility: number;
    judgingPotential: number;
    motivating: number;
    manManagement: number;
    tacticalKnowledge: number;
    medical: number;
    adaptability: number;
  };
}

export interface FinanceTransaction {
  id: string;
  date: string;
  clubId: string;
  category:
    | 'Ticket Sales'
    | 'Sponsorship'
    | 'Broadcasting'
    | 'Prize Money'
    | 'Player Sale'
    | 'Player Purchase'
    | 'Player Wages'
    | 'Staff Wages'
    | 'Facilities & Maintenance'
    | 'Signing & Agent Fee';
  amount: number; // positive = income, negative = expense
  description: string;
  balanceAfter: number;
}

export type AIManagerStyle =
  | 'Attacking Manager'
  | 'Defensive Manager'
  | 'Youth Developer'
  | 'Possession-focused Manager'
  | 'Counter-attacking Manager'
  | 'Pragmatic Manager';

export interface Club {
  id: string;
  name: string;
  shortName: string;
  countryId: string;
  leagueId: LeagueId;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  stadiumName: string;
  stadiumCapacity: number;
  reputation: number; // 1-100
  trainingFacilities: number; // 1-20
  youthFacilities: number; // 1-20
  juniorCoaching?: number; // 1-20
  youthRecruitment?: number; // 1-20
  sugarDaddyType?: 'FRONT_END' | 'BACK_END' | 'UNDERWRITER' | 'NONE';
  transferEmbargoUntil?: string | null;
  preSeasonTourCompletedSeason?: string | null;
  pointsDeduction?: number;
  affiliateClubIds?: string[];
  supporterConfidence?: number; // 1-100
  finances: {
    balance: number;
    transferBudget: number;
    wageBudgetPerWeek: number;
    wageUsedPerWeek: number;
    debt: number;
    sponsorRevenueAnnual: number;
    ticketPriceAvg: number;
  };
  boardExpectations: {
    targetLeaguePosition: number;
    cupTarget: 'Winner' | 'Final' | 'Semi-Final' | 'Quarter-Final' | 'Compete';
    clubVision: string;
    confidence: {
      overall: number; // 1-100
      leaguePerformance: number;
      financialManagement: number;
      youthDevelopment: number;
      squadAtmosphere: number;
    };
  };
  aiManager: {
    name: string;
    style: AIManagerStyle;
    reputation: number;
    jobSecurity: number; // 1-100
  };
  primaryTactic: TacticalSystem;
  secondaryTactic: TacticalSystem;
  formationFamiliarity?: Partial<Record<FormationId, number>>;
  trainingFocus:
    | 'Attacking'
    | 'Defending'
    | 'Possession'
    | 'Chance Creation'
    | 'Pressing'
    | 'Set Pieces'
    | 'Physical'
    | 'Recovery'
    | 'Match Preparation';
  trainingIntensity: 'Light' | 'Standard' | 'Intense';
}

export interface LeagueConfig {
  id: LeagueId;
  cupId: CupId;
  countryId: string;
  countryName: string;
  countryFlag: string;
  name: string;
  cupName: string;
  targetClubCount: number; // 20 or 18
  matchesPerClub: number; // 38 or 34
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  tieBreakOrder: ('goalDifference' | 'goalsFor' | 'wins')[];
  championsLeagueSpots: number;
  relegationSpots: number;
  prizePoolTotal: number;
  tvRevenuePerClub: number;
  tier?: 1 | 2;
}

export type MatchEventType =
  | 'KickOff'
  | 'Goal'
  | 'Assist'
  | 'Shot'
  | 'ShotOnTarget'
  | 'BlockedShot'
  | 'KeyPass'
  | 'ThroughBall'
  | 'Cross'
  | 'Corner'
  | 'FreeKick'
  | 'Penalty'
  | 'PenaltyMissed'
  | 'Offside'
  | 'Foul'
  | 'YellowCard'
  | 'RedCard'
  | 'Injury'
  | 'Substitution'
  | 'Save'
  | 'Tackle'
  | 'Interception'
  | 'Clearance'
  | 'TacticalChange'
  | 'HalfTime'
  | 'FullTime';

export interface MatchEvent {
  id: string;
  fixtureId: string;
  minute: number;
  eventType: MatchEventType;
  teamId: string;
  playerId?: string;
  playerName?: string;
  secondaryPlayerId?: string;
  secondaryPlayerName?: string;
  text: string;
  xGDelta?: number;
  shotXg?: number;
  shotX?: number;
  shotY?: number;
  pitchX: number; // 0..100 for 2D pitch visualizer
  pitchY: number; // 0..100
  isHighlight?: boolean;
}

export interface MatchTeamStats {
  goals: number;
  possession: number;
  totalShots: number;
  shotsOnTarget: number;
  blockedShots: number;
  xG: number;
  passes: number;
  passAccuracy: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  corners: number;
  offsides: number;
  saves: number;
  bigChances: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  homeStats: MatchTeamStats;
  awayStats: MatchTeamStats;
  events: MatchEvent[];
  playerRatings: Record<string, number>; // playerId -> 1.0..10.0
  manOfTheMatchPlayerId: string;
  attendance: number;
  aiSummary?: string;
  substitutions?: { minute: number; teamId: string; playerOutId: string; playerInId: string }[];
  extraTimePlayed?: boolean;
  penaltyShootout?: { homePenalties: number; awayPenalties: number };
  weather?: WeatherCondition;
  pitchCondition?: PitchCondition;
}

export interface Fixture {
  id: string;
  competitionId: CompetitionId;
  seasonId: string;
  matchday: number;
  kickoffDate: string; // YYYY-MM-DD
  homeClubId: string;
  awayClubId: string;
  status: 'Scheduled' | 'InProgress' | 'Completed';
  result?: MatchResult;
  uefaStage?: UefaStage;
  leg?: 1 | 2;
  tieIndex?: number;
}

export interface LeagueStanding {
  competitionId: LeagueId | UefaCompetitionId;
  seasonId: string;
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  pointsDeduction?: number;
  form: ('W' | 'D' | 'L')[];
}

export interface TransferOffer {
  id: string;
  date: string;
  playerId: string;
  buyingClubId: string;
  sellingClubId: string;
  offerType: 'Transfer' | 'Loan';
  upfrontFee: number;
  installmentsFee: number;
  sellOnPercentage: number;
  swapPlayerId?: string | null;
  proposedWagePerWeek: number;
  proposedContractYears: number;
  proposedSquadStatus: Player['squadStatus'];
  signingBonus: number;
  agentFee: number;
  status: 'PendingClub' | 'ClubAccepted' | 'CounterOffer' | 'Completed' | 'Rejected' | 'Cancelled';
  counterAmount?: number;
  rejectionReason?: string;
  loanOptionToBuyFee?: number;
  buyBackClauseFee?: number;
}

export interface ScoutAssignment {
  id: string;
  scoutId: string;
  regionOrLeague: LeagueId | 'ALL_EUROPE' | 'SOUTH_AMERICA';
  positionGroup: PositionGroup | 'ANY';
  maxAge: number;
  maxBudget: number;
  startDate: string;
  daysRemaining: number;
  reportsGenerated: string[]; // playerIds
}

export interface ScoutReport {
  id: string;
  playerId: string;
  scoutId: string;
  date: string;
  confidence: number; // 1-100
  caEstimate: [number, number];
  paEstimate: [number, number];
  strengths: string[];
  weaknesses: string[];
  bestRole: PlayerRole;
  estimatedFee: [number, number];
  estimatedWage: [number, number];
  injuryRisk: 'Low' | 'Moderate' | 'High';
  recommendationScore: number; // 1-100
  aiNarrative?: string;
}

export type InboxCategory =
  | 'Board'
  | 'Player'
  | 'Staff'
  | 'Transfer'
  | 'Scout'
  | 'Match Preview'
  | 'Match Report'
  | 'Media'
  | 'Competition'
  | 'Injury'
  | 'General News';

export interface NewsItem {
  id: string;
  gameDate: string;
  category: InboxCategory;
  title: string;
  body: string;
  isRead: boolean;
  isImportant?: boolean;
  relatedClubId?: string;
  relatedPlayerId?: string;
  sourceEventId?: string;
  actionType?: 'GoToMatch' | 'GoToTransfer' | 'GoToTactics' | 'PressConference';
  pressConferenceOptions?: {
    id: string;
    label: string;
    moraleDelta: number;
    boardDelta: number;
    mediaResponse: string;
  }[];
  pressConferenceAnsweredId?: string;
}

export interface ManagerProfile {
  id: string;
  name: string;
  age: number;
  nationality: string;
  coachingStyle: 'Tactician' | 'Motivator' | 'Youth Developer' | 'Tracksuit Coach';
  tacticalStyle: AIManagerStyle;
  reputation: number; // 1-100
  careerStats: {
    matchesManaged: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    trophies: { season: string; competitionName: string; clubName: string }[];
    clubsManaged: { clubId: string; clubName: string; fromDate: string; toDate: string | 'Present' }[];
  };
}

export interface MentoringGroup {
  id: string;
  clubId: string;
  mentorId: string;
  menteeIds: string[];
  focusTrait?: PlayerTrait | null;
  createdAt: string;
}

export interface TrophyHistoryRecord {
  id: string;
  season: string;
  competitionId: CompetitionId;
  competitionName: string;
  winnerClubId: string;
  winnerClubName: string;
  runnerUpClubId?: string;
  runnerUpClubName?: string;
}

export interface SeasonAwardRecord {
  season: string;
  ballonDor: {
    playerId: string;
    playerName: string;
    clubId: string;
    clubName: string;
    goals: number;
    assists: number;
    averageRating: number;
  };
  goldenBoot: {
    playerId: string;
    playerName: string;
    clubId: string;
    clubName: string;
    goals: number;
  };
  goldenBoy: {
    playerId: string;
    playerName: string;
    clubId: string;
    clubName: string;
    age: number;
    ca: number;
    averageRating: number;
  };
  managerOfTheSeason: {
    managerName: string;
    clubId: string;
    clubName: string;
  };
}

export interface FanSocialPost {
  id: string;
  handle: string;
  author: string;
  text: string;
  body: string;
  likes: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'POSITIVE' | 'NEUTRAL' | 'CRITICAL';
  date: string;
}

export interface HallOfFameEntry {
  rank: number;
  managerName: string;
  nationality: string;
  clubsSummary: string;
  clubName: string;
  majorTrophies: number;
  winRatePct: number;
  points: number;
  isUser?: boolean;
}

export interface WorldState {
  saveId: string;
  saveName: string;
  saveVersion: number;
  lastSavedAt: string;
  gameDate: string; // YYYY-MM-DD
  currentSeason: string; // e.g., "2026/27"
  randomSeed: number;
  processedDates: string[]; // Idempotency guard against duplicate date execution
  manager: ManagerProfile;
  controlledClubId: string;
  leagues: Record<LeagueId, LeagueConfig>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  staff: Record<string, StaffMember>;
  fixtures: Fixture[];
  standings: Record<LeagueId, LeagueStanding[]>;
  uefaStandings?: Record<UefaCompetitionId, LeagueStanding[]>;
  uefaPots?: Record<UefaCompetitionId, string[][]>;
  transferOffers: TransferOffer[];
  shortlistPlayerIds: string[];
  scoutAssignments: ScoutAssignment[];
  scoutReports: Record<string, ScoutReport>; // keyed by playerId
  transactions: FinanceTransaction[];
  inbox: NewsItem[];
  mentoringGroups?: MentoringGroup[];
  trophyHistory?: TrophyHistoryRecord[];
  seasonAwardsHistory?: SeasonAwardRecord[];
  controlledNationalTeamCode?: NationalTeamCode | null;
  scenarioChallenge?: ScenarioChallengeId;
  customClubConfig?: CustomClubConfig | null;
  lastMindGameMatchday?: number;
  socialFeed?: FanSocialPost[];
}
