import {
  AIManagerStyle,
  Club,
  FinanceTransaction,
  Fixture,
  FormationId,
  LeagueId,
  LeagueStanding,
  ManagerProfile,
  NewsItem,
  Player,
  PlayerAttributes,
  PlayerRole,
  PositionCode,
  StaffMember,
  StaffRole,
  WorldState,
} from '../types/game';
import { CLUB_TEMPLATES, LEAGUES_CONFIG, NATIONALITY_POOLS } from './leaguesConfig';
import { REAL_CLUB_CORE_PLAYERS, REAL_CLUB_ROSTERS, RealPlayerSeed } from './realRostersData';
import { createInitialStandings, generateLeagueSchedule } from './leagueEngine';
import { SeededRNG } from './random';
import { autoPickLineup, ROLES_BY_POSITION } from './tacticsEngine';

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

function buildClubSquadSeeds(
  shortName: string,
  reputation: number,
  countryId: string,
  rng: SeededRNG
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
  const rosterLookupKey = countryId === 'FRA' && shortName === 'BRE' ? 'SB29' : shortName;
  const fullRoster: RealPlayerSeed[] | undefined = REAL_CLUB_ROSTERS[rosterLookupKey];
  if (fullRoster && fullRoster.length > 0) {
    return fullRoster.map((seed, idx) => {
      const [first, last, pos, nat, age, ca, pa, sec] = seed;
      const isYouth = age <= 19 && idx >= 18;
      return {
        firstName: capitalizeName(first),
        lastName: capitalizeName(last),
        pos,
        secondary: sec || getDefaultSecondaryPositions(pos),
        natCode: nat,
        age,
        targetCa: ca,
        targetPa: pa,
        isYouth,
      };
    });
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
    usedFullNames.add(`${fName} ${lName}`);

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

  // Ensure every position in SQUAD_BLUEPRINT has adequate depth up to 21 players
  const pool = NATIONALITY_POOLS[countryId] || NATIONALITY_POOLS.ENG;
  const neededCount = Math.max(0, 21 - results.length);
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
    let fName = capitalizeName(rng.pick(pool.firstNames));
    let lName = capitalizeName(rng.pick(pool.lastNames));
    let attempts = 0;
    while (usedFullNames.has(`${fName} ${lName}`) && attempts < 15) {
      fName = capitalizeName(rng.pick(pool.firstNames));
      lName = capitalizeName(rng.pick(pool.lastNames));
      attempts++;
    }
    usedFullNames.add(`${fName} ${lName}`);

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
  selectedClubId?: string
): WorldState {
  const rng = new SeededRNG(seed);
  const gameDate = '2025-08-10';
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
  };
  const transactions: FinanceTransaction[] = [];

  const leagueIds = Object.keys(LEAGUES_CONFIG) as LeagueId[];

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

      const squadSeeds = buildClubSquadSeeds(tpl.shortName, tpl.reputation, config.countryId, rng);

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
          fitness: rng.int(90, 100),
          matchSharpness: rng.int(80, 96),
          morale: rng.int(75, 94),
          tacticalFamiliarity: rng.int(76, 92),
          squadStatus: pSeed.isYouth
            ? 'Youth'
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
        };

        players[playerId] = player;
        clubPlayers.push(player);
      });

      const primaryFormation = rng.pick(FORMATIONS_POOL);
      const secondaryFormation = rng.pick(FORMATIONS_POOL.filter((f) => f !== primaryFormation));
      const primaryTactic = autoPickLineup(
        primaryFormation,
        clubPlayers,
        undefined,
        `${clubId}_tac_1`,
        `${primaryFormation} Primary`
      );
      const secondaryTactic = autoPickLineup(
        secondaryFormation,
        clubPlayers,
        undefined,
        `${clubId}_tac_2`,
        `${secondaryFormation} Reserve`
      );

      const repFactor = Math.pow(tpl.reputation / 70, 2.8);
      const balance = Math.round(repFactor * 42_000_000);
      const transferBudget = Math.round(repFactor * 28_000_000);
      const wageBudgetPerWeek = Math.round(totalWageUsed * 1.18);

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
              ? 'ลุ้นแชมป์ลีกสูงสุดและรักษาสถานะสโมสรชั้นนำของยุโรป'
              : idx < 10
                ? 'ลุ้นพื้นที่ฟุตบอลยุโรปและพัฒนาดาวรุ่งสู่ทีมชุดใหญ่'
                : 'รักษาสถานะในลีกสูงสุดและบริหารการเงินอย่างยั่งยืน',
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
        secondaryTactic,
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

  const controlledClubId = selectedClubId && clubs[selectedClubId] ? selectedClubId : 'club_eng_pl_1';
  const controlledClub = clubs[controlledClubId];

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
    description: 'งบสนับสนุนสโมสรประจำต้นฤดูกาล 2025/26',
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
      title: `บอร์ดบริหารต้อนรับ ${manager.name} สู่สโมสร ${controlledClub.name}`,
      body: `ประธานสโมสร ${controlledClub.name} แถลงแต่งตั้ง ${manager.name} เข้ากุมบังเหียนอย่างเป็นทางการ ณ สนาม ${controlledClub.stadiumName} (ความจุ ${controlledClub.stadiumCapacity.toLocaleString()} ที่นั่ง) โดยมีเป้าหมายจบอันดับท็อป ${controlledClub.boardExpectations.targetLeaguePosition} ของลีก และงบประมาณเสริมทัพเริ่มต้น €${(controlledClub.finances.transferBudget / 1_000_000).toFixed(1)}M`,
      isRead: false,
      isImportant: true,
      relatedClubId: controlledClub.id,
      actionType: 'GoToTactics',
    },
    {
      id: 'news_press_intro',
      gameDate,
      category: 'Media',
      title: `งานแถลงข่าวเปิดตัวผู้จัดการทีมของ ${controlledClub.name}`,
      body: `กองทัพสื่อมวลชนร่วมตั้งคำถามถึงปรัชญาการทำทีมและเป้าหมายของคุณในฤดูกาล 2025/26 กรุณาเลือกคำตอบเพื่อกำหนดทิศทางความเชื่อมั่นของนักเตะและบอร์ดบริหาร`,
      isRead: false,
      isImportant: true,
      relatedClubId: controlledClub.id,
      actionType: 'PressConference',
      pressConferenceOptions: [
        {
          id: 'opt_attack',
          label: 'เราจะเล่นฟุตบอลเกมรุกที่ดุดันและสร้างความตื่นตาตื่นใจให้แฟนบอลทุกคน',
          moraleDelta: 4,
          boardDelta: 3,
          mediaResponse: 'สื่อชื่นชมความทะเยอทะยานและแนวทางฟุตบอลเกมรุกที่ชัดเจนของคุณ',
        },
        {
          id: 'opt_discipline',
          label: 'รากฐานของความสำเร็จคือวินัยเกมรับและโครงสร้างแท็กติกที่รัดกุม',
          moraleDelta: 2,
          boardDelta: 4,
          mediaResponse: 'บอร์ดบริหารประทับใจในความเป็นมืออาชีพและการวางแผนระยะยาวของคุณ',
        },
        {
          id: 'opt_youth',
          label: 'ผมพร้อมให้โอกาสดาวรุ่งจากอคาเดมีก้าวขึ้นมาเป็นกำลังหลักของสโมสร',
          moraleDelta: 5,
          boardDelta: 3,
          mediaResponse: 'ผู้เล่นดาวรุ่งในทีมมีขวัญกำลังใจพุ่งสูงขึ้นหลังได้ฟังคำสัมภาษณ์ของคุณ',
        },
      ],
    },
    {
      id: 'news_tactical_briefing',
      gameDate,
      category: 'Staff',
      title: `รายงานความพร้อมขุมกำลังและวิเคราะห์นัดเปิดสนามพบ ${opponentClub?.name || 'คู่แข่ง'}`,
      body: `ผู้ช่วยผู้จัดการทีมสรุปความพร้อมของขุมกำลังชุดใหญ่ แผนการเล่นหลักตอนนี้คือ ${controlledClub.primaryTactic.formation} โดยเรามีนัดเปิดสนามวันที่ ${firstFixture?.kickoffDate || '2026-08-15'} แนะนำให้ตรวจสอบตำแหน่งตัวจริงและตั้งค่าการฝึกซ้อมประจำสัปดาห์`,
      isRead: false,
      relatedClubId: controlledClub.id,
      actionType: 'GoToTactics',
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
    transferOffers: [],
    shortlistPlayerIds: [],
    scoutAssignments: [],
    scoutReports: {},
    transactions,
    inbox,
  };
}

