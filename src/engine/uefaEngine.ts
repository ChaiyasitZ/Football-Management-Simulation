import {
  Club,
  Fixture,
  LeagueId,
  LeagueStanding,
  MatchResult,
  NewsItem,
  UefaCompetitionId,
  UefaStage,
  WorldState,
} from '../types/game';
import { SeededRNG } from './random';
import { trText } from '../i18n/LanguageContext';

export interface UefaCompetitionConfig {
  id: UefaCompetitionId;
  name: string;
  shortName: string;
  nameTh: string;
  subtitleTh: string;
  badgeColor: string;
  accentClass: string;
  clubCount: 36;
  potCount: 4;
  clubsPerPot: 9;
  leaguePhaseMatches: 8 | 6;
  pointsForWin: 3;
  pointsForDraw: 1;
  pointsForLoss: 0;
  winnerPrize: number;
  matchWinBonus: number;
  matchDrawBonus: number;
}

export const UEFA_COMPETITIONS_CONFIG: Record<UefaCompetitionId, UefaCompetitionConfig> = {
  UEFA_UCL: {
    id: 'UEFA_UCL',
    name: 'UEFA Champions League',
    shortName: 'UCL',
    nameTh: 'ยูฟ่า แชมเปียนส์ลีก (ถ้วยใหญ่)',
    subtitleTh: '36 ทีม · ตารางรวม Swiss 8 นัด (4 เหย้า / 4 เยือน · โถละ 2 นัด)',
    badgeColor: '#38bdf8',
    accentClass: 'text-sky-400 border-sky-500/40 bg-sky-500/10',
    clubCount: 36,
    potCount: 4,
    clubsPerPot: 9,
    leaguePhaseMatches: 8,
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    winnerPrize: 85_000_000,
    matchWinBonus: 2_100_000,
    matchDrawBonus: 700_000,
  },
  UEFA_UEL: {
    id: 'UEFA_UEL',
    name: 'UEFA Europa League',
    shortName: 'UEL',
    nameTh: 'ยูฟ่า ยูโรปาลีก (ถ้วยกลาง)',
    subtitleTh: '36 ทีม · ตารางรวม Swiss 8 นัด (4 เหย้า / 4 เยือน · โถละ 2 นัด)',
    badgeColor: '#fb923c',
    accentClass: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    clubCount: 36,
    potCount: 4,
    clubsPerPot: 9,
    leaguePhaseMatches: 8,
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    winnerPrize: 35_000_000,
    matchWinBonus: 630_000,
    matchDrawBonus: 210_000,
  },
  UEFA_UECL: {
    id: 'UEFA_UECL',
    name: 'UEFA Conference League',
    shortName: 'UECL',
    nameTh: 'ยูฟ่า คอนเฟอเรนซ์ลีก (ถ้วยเล็ก)',
    subtitleTh: '36 ทีม · ตารางรวม Swiss 6 นัด (3 เหย้า / 3 เยือน)',
    badgeColor: '#34d399',
    accentClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    clubCount: 36,
    potCount: 4,
    clubsPerPot: 9,
    leaguePhaseMatches: 6,
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    winnerPrize: 18_000_000,
    matchWinBonus: 400_000,
    matchDrawBonus: 133_000,
  },
};

/**
 * Country Coefficient Ranking & 36-Team Quota per UEFA Competition across the 10 Top-Flight Leagues:
 * - Ranks 1–4 (ENG_PL, ESP_LL, GER_BL, ITA_SA): 5 clubs each = 20 clubs (League 1-4 + Cup Winner / 5th place)
 * - Rank 5 (FRA_L1): 4 clubs (League 1-3 + Cup Winner / 4th place)
 * - Ranks 6–7 (POR_LP, NED_ED): 3 clubs each = 6 clubs (League 1-2 + Cup Winner / 3rd place)
 * - Ranks 8–10 (BEL_PL, TUR_SL, SCO_PR): 2 clubs each = 6 clubs (League 1 + Cup Winner / 2nd place)
 * Total = 36 clubs per competition (108 European clubs across UCL + UEL + UECL)
 */
export interface CountryUefaQuotaRule {
  rank: number;
  leagueId: LeagueId;
  countryCode: string;
  countryName: string;
  leagueSpots: number;
  cupSpotIncluded: boolean;
  totalPerCompetition: number;
  descriptionTh: string;
}

export const UEFA_COUNTRY_QUOTAS: CountryUefaQuotaRule[] = [
  {
    rank: 1,
    leagueId: 'ENG_PL',
    countryCode: 'ENG',
    countryName: 'England',
    leagueSpots: 4,
    cupSpotIncluded: true,
    totalPerCompetition: 5,
    descriptionTh: 'แชมป์ถึงที่ 4 ในลีก + แชมป์บอลถ้วย (5 ทีม)',
  },
  {
    rank: 2,
    leagueId: 'ESP_LL',
    countryCode: 'ESP',
    countryName: 'Spain',
    leagueSpots: 4,
    cupSpotIncluded: true,
    totalPerCompetition: 5,
    descriptionTh: 'แชมป์ถึงที่ 4 ในลีก + แชมป์บอลถ้วย (5 ทีม)',
  },
  {
    rank: 3,
    leagueId: 'GER_BL',
    countryCode: 'GER',
    countryName: 'Germany',
    leagueSpots: 4,
    cupSpotIncluded: true,
    totalPerCompetition: 5,
    descriptionTh: 'แชมป์ถึงที่ 4 ในลีก + แชมป์บอลถ้วย (5 ทีม)',
  },
  {
    rank: 4,
    leagueId: 'ITA_SA',
    countryCode: 'ITA',
    countryName: 'Italy',
    leagueSpots: 4,
    cupSpotIncluded: true,
    totalPerCompetition: 5,
    descriptionTh: 'แชมป์ถึงที่ 4 ในลีก + แชมป์บอลถ้วย (5 ทีม)',
  },
  {
    rank: 5,
    leagueId: 'FRA_L1',
    countryCode: 'FRA',
    countryName: 'France',
    leagueSpots: 3,
    cupSpotIncluded: true,
    totalPerCompetition: 4,
    descriptionTh: 'แชมป์ถึงที่ 3 ในลีก + แชมป์บอลถ้วย (4 ทีม)',
  },
  {
    rank: 6,
    leagueId: 'POR_LP',
    countryCode: 'POR',
    countryName: 'Portugal',
    leagueSpots: 2,
    cupSpotIncluded: true,
    totalPerCompetition: 3,
    descriptionTh: 'แชมป์, รองแชมป์ลีก + แชมป์บอลถ้วย (3 ทีม)',
  },
  {
    rank: 7,
    leagueId: 'NED_ED',
    countryCode: 'NED',
    countryName: 'Netherlands',
    leagueSpots: 2,
    cupSpotIncluded: true,
    totalPerCompetition: 3,
    descriptionTh: 'แชมป์, รองแชมป์ลีก + แชมป์บอลถ้วย (3 ทีม)',
  },
  {
    rank: 8,
    leagueId: 'BEL_PL',
    countryCode: 'BEL',
    countryName: 'Belgium',
    leagueSpots: 1,
    cupSpotIncluded: true,
    totalPerCompetition: 2,
    descriptionTh: 'แชมป์ลีก + แชมป์บอลถ้วย (2 ทีม)',
  },
  {
    rank: 9,
    leagueId: 'TUR_SL',
    countryCode: 'TUR',
    countryName: 'Turkey',
    leagueSpots: 1,
    cupSpotIncluded: true,
    totalPerCompetition: 2,
    descriptionTh: 'แชมป์ลีก + แชมป์บอลถ้วย (2 ทีม)',
  },
  {
    rank: 10,
    leagueId: 'SCO_PR',
    countryCode: 'SCO',
    countryName: 'Scotland',
    leagueSpots: 1,
    cupSpotIncluded: true,
    totalPerCompetition: 2,
    descriptionTh: 'แชมป์ลีก + แชมป์บอลถ้วย (2 ทีม)',
  },
];

export const UEFA_LEAGUE_PHASE_DATES: string[] = [
  '2025-09-17', // MD 1
  '2025-10-01', // MD 2
  '2025-10-22', // MD 3
  '2025-11-05', // MD 4
  '2025-11-26', // MD 5
  '2025-12-10', // MD 6 (Final League Phase MD for UECL)
  '2026-01-21', // MD 7 (UCL / UEL)
  '2026-01-28', // MD 8 (Final League Phase MD for UCL / UEL)
];

export const UEFA_KNOCKOUT_DATES: Record<
  Exclude<UefaStage, 'LEAGUE_PHASE'>,
  { mdLeg1: number; dateLeg1: string; mdLeg2?: number; dateLeg2?: string; labelTh: string }
> = {
  KPO: {
    mdLeg1: 9,
    dateLeg1: '2026-02-11',
    mdLeg2: 10,
    dateLeg2: '2026-02-18',
    labelTh: 'รอบเพลย์ออฟน็อกเอาต์ (อันดับ 9-16 พบ 17-24)',
  },
  R16: {
    mdLeg1: 11,
    dateLeg1: '2026-03-04',
    mdLeg2: 12,
    dateLeg2: '2026-03-11',
    labelTh: 'รอบ 16 ทีมสุดท้าย (Round of 16)',
  },
  QF: {
    mdLeg1: 13,
    dateLeg1: '2026-04-08',
    mdLeg2: 14,
    dateLeg2: '2026-04-15',
    labelTh: 'รอบก่อนรองชนะเลิศ (Quarter-Finals)',
  },
  SF: {
    mdLeg1: 15,
    dateLeg1: '2026-04-29',
    mdLeg2: 16,
    dateLeg2: '2026-05-06',
    labelTh: 'รอบรองชนะเลิศ (Semi-Finals)',
  },
  FINAL: {
    mdLeg1: 17,
    dateLeg1: '2026-05-27',
    labelTh: 'รอบชิงชนะเลิศ (UEFA Final)',
  },
};

/**
 * Selects the 36 qualified clubs for each UEFA competition (UCL, UEL, UECL)
 * based on the 10-country quota system and cup winner pass-down logic:
 * If the domestic cup winner already qualified via league position, the slot
 * automatically passes down to the next highest league position!
 */
export function selectUefaQualifiedClubs(
  clubs: Record<string, Club>,
  standings?: Record<LeagueId, LeagueStanding[]>,
  cupWinnersByLeague?: Partial<Record<LeagueId, string>>
): Record<UefaCompetitionId, string[]> {
  const ucl: string[] = [];
  const uel: string[] = [];
  const uecl: string[] = [];

  for (const rule of UEFA_COUNTRY_QUOTAS) {
    const leagueClubs = Object.values(clubs).filter((c) => c.leagueId === rule.leagueId);
    const orderedClubIds: string[] =
      standings && standings[rule.leagueId] && standings[rule.leagueId].length > 0
        ? standings[rule.leagueId].map((s) => s.clubId)
        : [...leagueClubs]
            .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
            .map((c) => c.id);

    const usedInCountry = new Set<string>();
    const quotaCount = rule.totalPerCompetition;
    const cupWinnerId = cupWinnersByLeague?.[rule.leagueId];

    // 1. Pick UCL qualifiers (league top N + Cup Winner or next highest league position)
    const countryUcl: string[] = [];
    for (const cid of orderedClubIds) {
      if (countryUcl.length >= rule.leagueSpots) break;
      countryUcl.push(cid);
      usedInCountry.add(cid);
    }
    if (cupWinnerId && !usedInCountry.has(cupWinnerId) && clubs[cupWinnerId]?.leagueId === rule.leagueId) {
      countryUcl.push(cupWinnerId);
      usedInCountry.add(cupWinnerId);
    } else {
      // Cup winner already qualified via league position -> pass down to next league rank!
      for (const cid of orderedClubIds) {
        if (countryUcl.length >= quotaCount) break;
        if (!usedInCountry.has(cid)) {
          countryUcl.push(cid);
          usedInCountry.add(cid);
        }
      }
    }
    ucl.push(...countryUcl);

    // 2. Pick UEL qualifiers (next `quotaCount` clubs in the league)
    const countryUel: string[] = [];
    for (const cid of orderedClubIds) {
      if (countryUel.length >= quotaCount) break;
      if (!usedInCountry.has(cid)) {
        countryUel.push(cid);
        usedInCountry.add(cid);
      }
    }
    uel.push(...countryUel);

    // 3. Pick UECL qualifiers (next `quotaCount` clubs in the league)
    const countryUecl: string[] = [];
    for (const cid of orderedClubIds) {
      if (countryUecl.length >= quotaCount) break;
      if (!usedInCountry.has(cid)) {
        countryUecl.push(cid);
        usedInCountry.add(cid);
      }
    }
    uecl.push(...countryUecl);
  }

  return {
    UEFA_UCL: ucl.slice(0, 36),
    UEFA_UEL: uel.slice(0, 36),
    UEFA_UECL: uecl.slice(0, 36),
  };
}

/**
 * Seeds 36 clubs by club reputation (coefficient) descending into 4 Pots of 9 teams each.
 */
export function buildUefaFourPots(
  qualifiedClubIds: string[],
  clubs: Record<string, Club>
): string[][] {
  const sorted = [...qualifiedClubIds].sort((a, b) => {
    const repA = clubs[a]?.reputation ?? 70;
    const repB = clubs[b]?.reputation ?? 70;
    if (repB !== repA) return repB - repA;
    return a.localeCompare(b);
  });

  return [
    sorted.slice(0, 9),   // Pot 1 (Ranks 1-9)
    sorted.slice(9, 18),  // Pot 2 (Ranks 10-18)
    sorted.slice(18, 27), // Pot 3 (Ranks 19-27)
    sorted.slice(27, 36), // Pot 4 (Ranks 28-36)
  ];
}

/**
 * Generates the Swiss League Phase schedule for 36 teams split into 4 Pots of 9 teams:
 * - For UCL & UEL (8 matches): Each club plays 2 opponents from each of the 4 Pots
 *   (including its own pot): 1 Home and 1 Away per Pot = 4 Home + 4 Away against 8 distinct clubs.
 * - For UECL (6 matches): Each club plays 6 distinct opponents across the pots: 3 Home + 3 Away.
 */
export function generateUefaSwissSchedule(
  compId: UefaCompetitionId,
  pots: string[][],
  seasonId: string,
  rng = new SeededRNG(202509)
): Fixture[] {
  const cfg = UEFA_COMPETITIONS_CONFIG[compId];
  if (pots.length !== 4 || pots.some((p) => p.length !== 9)) {
    throw new Error(`${compId} requires 4 pots of 9 clubs (36 total)`);
  }

  // Shuffle order within each pot for variety while preserving pot membership
  const p = pots.map((pot) => rng.shuffle([...pot]));
  const fixtures: Fixture[] = [];

  // Cross-pot pairings across Matchdays 1..6 (3 rounds of 2 matchdays):
  // RoundSet 1 (MD1 & MD2): (Pot 0 vs Pot 1) and (Pot 2 vs Pot 3)
  // RoundSet 2 (MD3 & MD4): (Pot 0 vs Pot 2) and (Pot 1 vs Pot 3)
  // RoundSet 3 (MD5 & MD6): (Pot 0 vs Pot 3) and (Pot 1 vs Pot 2)
  const crossPotSchedule: {
    md1: number;
    md2: number;
    pairs: [number, number, number, number][]; // [potA, potB, shift1, shift2]
  }[] = [
    {
      md1: 1,
      md2: 2,
      pairs: [
        [0, 1, 0, 1],
        [2, 3, 2, 3],
      ],
    },
    {
      md1: 3,
      md2: 4,
      pairs: [
        [0, 2, 1, 4],
        [1, 3, 2, 5],
      ],
    },
    {
      md1: 5,
      md2: 6,
      pairs: [
        [0, 3, 3, 6],
        [1, 2, 4, 7],
      ],
    },
  ];

  for (const roundSet of crossPotSchedule) {
    let md1Idx = 1;
    let md2Idx = 1;

    for (const [potA, potB, shift1, shift2] of roundSet.pairs) {
      for (let i = 0; i < 9; i++) {
        // MD1: Pot A plays Home vs Pot B[(i + shift1) % 9]
        const home1 = p[potA][i];
        const away1 = p[potB][(i + shift1) % 9];
        fixtures.push({
          id: `fix_${compId}_${seasonId.replace('/', '')}_md${roundSet.md1}_${md1Idx++}`,
          competitionId: compId,
          seasonId,
          matchday: roundSet.md1,
          kickoffDate: UEFA_LEAGUE_PHASE_DATES[roundSet.md1 - 1],
          homeClubId: home1,
          awayClubId: away1,
          status: 'Scheduled',
          uefaStage: 'LEAGUE_PHASE',
        });

        // MD2: Pot B[(i + shift2) % 9] plays Home vs Pot A[i] (so Pot A[i] plays Away vs a distinct club in Pot B)
        const home2 = p[potB][(i + shift2) % 9];
        const away2 = p[potA][i];
        fixtures.push({
          id: `fix_${compId}_${seasonId.replace('/', '')}_md${roundSet.md2}_${md2Idx++}`,
          competitionId: compId,
          seasonId,
          matchday: roundSet.md2,
          kickoffDate: UEFA_LEAGUE_PHASE_DATES[roundSet.md2 - 1],
          homeClubId: home2,
          awayClubId: away2,
          status: 'Scheduled',
          uefaStage: 'LEAGUE_PHASE',
        });
      }
    }
  }

  // If 8-match competition (UCL & UEL), add MD7 & MD8: Within-Pot matches (1 Home + 1 Away inside own Pot!)
  if (cfg.leaguePhaseMatches === 8) {
    let md7Idx = 1;
    let md8Idx = 1;
    for (let potIdx = 0; potIdx < 4; potIdx++) {
      for (let i = 0; i < 9; i++) {
        const homeClubId = p[potIdx][i];
        const awayClubId = p[potIdx][(i + 1) % 9];
        // Split the 36 within-pot fixtures evenly across MD7 (18 fixtures) and MD8 (18 fixtures)
        const isMd7 = (potIdx * 9 + i) % 2 === 0;
        const md = isMd7 ? 7 : 8;
        const mIdx = isMd7 ? md7Idx++ : md8Idx++;
        fixtures.push({
          id: `fix_${compId}_${seasonId.replace('/', '')}_md${md}_${mIdx}`,
          competitionId: compId,
          seasonId,
          matchday: md,
          kickoffDate: UEFA_LEAGUE_PHASE_DATES[md - 1],
          homeClubId,
          awayClubId,
          status: 'Scheduled',
          uefaStage: 'LEAGUE_PHASE',
        });
      }
    }
  }

  return fixtures;
}

/**
 * Recomputes the single 36-team League Phase standings table (1..36)
 * Only counts LEAGUE_PHASE fixtures (matchdays 1..8 for UCL/UEL, 1..6 for UECL).
 */
export function recomputeUefaStandings(
  compId: UefaCompetitionId,
  seasonId: string,
  clubIds: string[],
  fixtures: Fixture[],
  clubsById?: Record<string, Club>
): LeagueStanding[] {
  const cfg = UEFA_COMPETITIONS_CONFIG[compId];
  const map: Record<string, LeagueStanding> = {};

  for (const cId of clubIds) {
    map[cId] = {
      competitionId: compId,
      seasonId,
      clubId: cId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    };
  }

  const completed = fixtures
    .filter(
      (f) =>
        f.competitionId === compId &&
        f.seasonId === seasonId &&
        (f.uefaStage === 'LEAGUE_PHASE' || f.matchday <= cfg.leaguePhaseMatches) &&
        f.status === 'Completed' &&
        f.result
    )
    .sort((a, b) => a.matchday - b.matchday);

  for (const fix of completed) {
    const res: MatchResult = fix.result!;
    const home = map[fix.homeClubId];
    const away = map[fix.awayClubId];
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += res.homeGoals;
    home.goalsAgainst += res.awayGoals;
    home.goalDifference = home.goalsFor - home.goalsAgainst;

    away.goalsFor += res.awayGoals;
    away.goalsAgainst += res.homeGoals;
    away.goalDifference = away.goalsFor - away.goalsAgainst;

    if (res.homeGoals > res.awayGoals) {
      home.won += 1;
      home.points += cfg.pointsForWin;
      home.form = [...home.form.slice(-4), 'W'];

      away.lost += 1;
      away.points += cfg.pointsForLoss;
      away.form = [...away.form.slice(-4), 'L'];
    } else if (res.homeGoals < res.awayGoals) {
      away.won += 1;
      away.points += cfg.pointsForWin;
      away.form = [...away.form.slice(-4), 'W'];

      home.lost += 1;
      home.points += cfg.pointsForLoss;
      home.form = [...home.form.slice(-4), 'L'];
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += cfg.pointsForDraw;
      away.points += cfg.pointsForDraw;
      home.form = [...home.form.slice(-4), 'D'];
      away.form = [...away.form.slice(-4), 'D'];
    }
  }

  return Object.values(map).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    if (b.won !== a.won) return b.won - a.won;
    const repA = clubsById?.[a.clubId]?.reputation ?? 0;
    const repB = clubsById?.[b.clubId]?.reputation ?? 0;
    if (repB !== repA) return repB - repA;
    return a.clubId.localeCompare(b.clubId);
  });
}

export interface UefaKnockoutTieSummary {
  stage: Exclude<UefaStage, 'LEAGUE_PHASE'>;
  tieIndex: number;
  label: string;
  seededClubId: string; // Plays Leg 2 at home (or Home in Final)
  unseededClubId: string; // Plays Leg 1 at home (or Away in Final)
  leg1Fixture?: Fixture;
  leg2Fixture?: Fixture;
  seededAggGoals: number;
  unseededAggGoals: number;
  winnerClubId: string | null;
  decidedByPenalties?: boolean;
}

/**
 * Resolves the winner of a two-legged (or single-leg Final) knockout tie.
 * In Leg 1: unseededClubId is Home, seededClubId is Away.
 * In Leg 2: seededClubId is Home, unseededClubId is Away.
 */
export function resolveKnockoutTieWinner(
  stage: Exclude<UefaStage, 'LEAGUE_PHASE'>,
  tieIndex: number,
  seededClubId: string,
  unseededClubId: string,
  leg1Fixture?: Fixture,
  leg2Fixture?: Fixture,
  clubsById?: Record<string, Club>
): UefaKnockoutTieSummary {
  const stageMeta = UEFA_KNOCKOUT_DATES[stage];

  if (stage === 'FINAL') {
    const done = leg1Fixture?.status === 'Completed' && Boolean(leg1Fixture.result);
    const sGoals = done ? leg1Fixture!.result!.homeGoals : 0;
    const uGoals = done ? leg1Fixture!.result!.awayGoals : 0;
    let winnerClubId: string | null = null;
    let decidedByPenalties = false;
    if (done) {
      if (sGoals > uGoals) {
        winnerClubId = seededClubId;
      } else if (uGoals > sGoals) {
        winnerClubId = unseededClubId;
      } else {
        decidedByPenalties = true;
        const repS = clubsById?.[seededClubId]?.reputation ?? 80;
        const repU = clubsById?.[unseededClubId]?.reputation ?? 80;
        winnerClubId = repS >= repU ? seededClubId : unseededClubId;
      }
    }
    return {
      stage,
      tieIndex,
      label: `${stageMeta.labelTh}`,
      seededClubId,
      unseededClubId,
      leg1Fixture,
      seededAggGoals: sGoals,
      unseededAggGoals: uGoals,
      winnerClubId,
      decidedByPenalties,
    };
  }

  const leg1Done = leg1Fixture?.status === 'Completed' && Boolean(leg1Fixture.result);
  const leg2Done = leg2Fixture?.status === 'Completed' && Boolean(leg2Fixture.result);

  // Leg 1: unseeded is Home, seeded is Away
  // Leg 2: seeded is Home, unseeded is Away
  const seededGoalsLeg1 = leg1Done ? leg1Fixture!.result!.awayGoals : 0;
  const unseededGoalsLeg1 = leg1Done ? leg1Fixture!.result!.homeGoals : 0;
  const seededGoalsLeg2 = leg2Done ? leg2Fixture!.result!.homeGoals : 0;
  const unseededGoalsLeg2 = leg2Done ? leg2Fixture!.result!.awayGoals : 0;

  const seededAggGoals = seededGoalsLeg1 + seededGoalsLeg2;
  const unseededAggGoals = unseededGoalsLeg1 + unseededGoalsLeg2;

  let winnerClubId: string | null = null;
  let decidedByPenalties = false;

  if (leg1Done && leg2Done) {
    if (seededAggGoals > unseededAggGoals) {
      winnerClubId = seededClubId;
    } else if (unseededAggGoals > seededAggGoals) {
      winnerClubId = unseededClubId;
    } else {
      decidedByPenalties = true;
      const repS = clubsById?.[seededClubId]?.reputation ?? 80;
      const repU = clubsById?.[unseededClubId]?.reputation ?? 80;
      winnerClubId = repS >= repU ? seededClubId : unseededClubId;
    }
  }

  return {
    stage,
    tieIndex,
    label: trText(`${stage} Tie #${tieIndex}`, `${stage} คู่ที่ ${tieIndex}`),
    seededClubId,
    unseededClubId,
    leg1Fixture,
    leg2Fixture,
    seededAggGoals,
    unseededAggGoals,
    winnerClubId,
    decidedByPenalties,
  };
}

function createTwoLeggedFixtures(
  compId: UefaCompetitionId,
  seasonId: string,
  stage: Exclude<UefaStage, 'LEAGUE_PHASE' | 'FINAL'>,
  pairings: { tieIndex: number; seededClubId: string; unseededClubId: string }[]
): Fixture[] {
  const meta = UEFA_KNOCKOUT_DATES[stage];
  const created: Fixture[] = [];
  const cleanSeason = seasonId.replace('/', '');

  for (const p of pairings) {
    // Leg 1: Unseeded at Home vs Seeded Away
    created.push({
      id: `fix_${compId}_${cleanSeason}_${stage.toLowerCase()}_t${p.tieIndex}_leg1`,
      competitionId: compId,
      seasonId,
      matchday: meta.mdLeg1,
      kickoffDate: meta.dateLeg1,
      homeClubId: p.unseededClubId,
      awayClubId: p.seededClubId,
      status: 'Scheduled',
      uefaStage: stage,
      leg: 1,
      tieIndex: p.tieIndex,
    });
    // Leg 2: Seeded at Home vs Unseeded Away
    created.push({
      id: `fix_${compId}_${cleanSeason}_${stage.toLowerCase()}_t${p.tieIndex}_leg2`,
      competitionId: compId,
      seasonId,
      matchday: meta.mdLeg2!,
      kickoffDate: meta.dateLeg2!,
      homeClubId: p.seededClubId,
      awayClubId: p.unseededClubId,
      status: 'Scheduled',
      uefaStage: stage,
      leg: 2,
      tieIndex: p.tieIndex,
    });
  }

  return created;
}

/**
 * Checks if a UEFA competition has completed its current phase and automatically generates
 * the next Knockout Phase fixtures:
 * - League Phase complete -> Ranks 1-8 to R16 (seeded), Ranks 9-16 vs Ranks 17-24 in KPO (2 legs), Ranks 25-36 Eliminated!
 * - KPO complete -> R16 (Ranks 1-8 vs KPO Winners, 2 legs)
 * - R16 complete -> QF (2 legs)
 * - QF complete -> SF (2 legs)
 * - SF complete -> FINAL (Single match)
 */
export function checkAndAdvanceUefaKnockoutPhase(
  state: WorldState,
  compId: UefaCompetitionId
): WorldState {
  const cfg = UEFA_COMPETITIONS_CONFIG[compId];
  const seasonId = state.currentSeason;
  const compFixtures = state.fixtures.filter(
    (f) => f.competitionId === compId && f.seasonId === seasonId
  );
  if (compFixtures.length === 0) return state;

  const standings = state.uefaStandings?.[compId] || [];
  if (standings.length < 24) return state;

  const hasStage = (st: UefaStage) => compFixtures.some((f) => f.uefaStage === st);
  const isStageComplete = (st: UefaStage) => {
    const list = compFixtures.filter((f) =>
      st === 'LEAGUE_PHASE'
        ? f.uefaStage === 'LEAGUE_PHASE' || f.matchday <= cfg.leaguePhaseMatches
        : f.uefaStage === st
    );
    return list.length > 0 && list.every((f) => f.status === 'Completed');
  };

  let newFixtures: Fixture[] = [];
  let newsTitle = '';
  let newsBody = '';

  // 1. League Phase -> Knockout Phase Play-offs (KPO: Ranks 9-16 vs 17-24)
  if (isStageComplete('LEAGUE_PHASE') && !hasStage('KPO')) {
    // Pairings: 9v24, 10v23, 11v22, 12v21, 13v20, 14v19, 15v18, 16v17
    const pairings = Array.from({ length: 8 }, (_, idx) => ({
      tieIndex: idx + 1,
      seededClubId: standings[8 + idx].clubId,     // Ranks 9..16
      unseededClubId: standings[23 - idx].clubId,  // Ranks 24..17
    }));
    newFixtures = createTwoLeggedFixtures(compId, seasonId, 'KPO', pairings);
    const top8Names = standings
      .slice(0, 8)
      .map((s) => state.clubs[s.clubId]?.shortName || s.clubId)
      .join(', ');
    newsTitle = trText(
      `${cfg.name} League Phase Complete: Top 8 Advance to R16 · Play-off Draw Confirmed!`,
      `บทสรุป League Phase ${cfg.name}: อันดับ 1-8 ลิ่วรอบ 16 ทีม · จับสลากเพลย์ออฟ 9-24!`
    );
    newsBody = trText(
      `All ${cfg.leaguePhaseMatches} Matchdays of the League Phase are complete! The Top 8 seeded clubs advancing directly to the Round of 16 are ${top8Names}. Clubs ranked 9th–24th now enter the two-legged Knockout Phase Play-offs, while ranks 25th–36th are eliminated outright under the new UEFA format.`,
      `จบการแข่งขันรอบ League Phase ทั้ง ${cfg.leaguePhaseMatches} นัด! 8 ทีมวางที่ผ่านเข้าสู่รอบ 16 ทีมสุดท้ายอัตโนมัติ ได้แก่ ${top8Names} ส่วนทีมอันดับ 9-24 เตรียมดวลแข้งรอบเพลย์ออฟแบบเหย้า-เยือน ขณะที่อันดับ 25-36 ตกรอบทันทีตามกฎใหม่ UEFA`
    );
  }
  // 2. KPO -> Round of 16 (R16: Ranks 1-8 vs 8 KPO Winners)
  else if (hasStage('KPO') && isStageComplete('KPO') && !hasStage('R16')) {
    const kpoWinners: string[] = [];
    for (let t = 1; t <= 8; t++) {
      const leg1 = compFixtures.find((f) => f.uefaStage === 'KPO' && f.tieIndex === t && f.leg === 1);
      const leg2 = compFixtures.find((f) => f.uefaStage === 'KPO' && f.tieIndex === t && f.leg === 2);
      if (!leg1 || !leg2) return state;
      const summary = resolveKnockoutTieWinner(
        'KPO',
        t,
        leg2.homeClubId,
        leg1.homeClubId,
        leg1,
        leg2,
        state.clubs
      );
      kpoWinners.push(summary.winnerClubId || leg2.homeClubId);
    }

    // Standard UEFA bracket pairing Top 8 seeds with the 8 KPO winners:
    // Tie 1: Rank 1 vs KPO 8 (16v17)
    // Tie 2: Rank 8 vs KPO 1 (9v24)
    // Tie 3: Rank 4 vs KPO 5 (13v20)
    // Tie 4: Rank 5 vs KPO 4 (12v21)
    // Tie 5: Rank 2 vs KPO 7 (15v18)
    // Tie 6: Rank 7 vs KPO 2 (10v23)
    // Tie 7: Rank 3 vs KPO 6 (14v19)
    // Tie 8: Rank 6 vs KPO 3 (11v22)
    const bracketOrder: [number, number][] = [
      [0, 7],
      [7, 0],
      [3, 4],
      [4, 3],
      [1, 6],
      [6, 1],
      [2, 5],
      [5, 2],
    ];
    const pairings = bracketOrder.map(([seedIdx, kpoIdx], idx) => ({
      tieIndex: idx + 1,
      seededClubId: standings[seedIdx].clubId,
      unseededClubId: kpoWinners[kpoIdx],
    }));

    newFixtures = createTwoLeggedFixtures(compId, seasonId, 'R16', pairings);
    newsTitle = trText(
      `${cfg.name} Round of 16 Draw Confirmed!`,
      `ผลการจับสลากรอบ 16 ทีมสุดท้ายศึก ${cfg.name}!`
    );
    newsBody = trText(
      `All 8 Knockout Play-off winners have been paired against the Top 8 League Phase seeds in the Round of 16. Two-legged ties kick off on ${UEFA_KNOCKOUT_DATES.R16.dateLeg1}.`,
      `ได้ครบ 8 ทีมผู้ชนะจากรอบเพลย์ออฟเข้าประกบคู่กับทีมวางอันดับ 1-8 ในรอบ 16 ทีมสุดท้าย (Round of 16) แข่งขันแบบเหย้า-เยือน นัดแรก ${UEFA_KNOCKOUT_DATES.R16.dateLeg1}`
    );
  }
  // 3. R16 -> Quarter-Finals (QF)
  else if (hasStage('R16') && isStageComplete('R16') && !hasStage('QF')) {
    const r16Winners: string[] = [];
    for (let t = 1; t <= 8; t++) {
      const leg1 = compFixtures.find((f) => f.uefaStage === 'R16' && f.tieIndex === t && f.leg === 1);
      const leg2 = compFixtures.find((f) => f.uefaStage === 'R16' && f.tieIndex === t && f.leg === 2);
      if (!leg1 || !leg2) return state;
      const summary = resolveKnockoutTieWinner(
        'R16',
        t,
        leg2.homeClubId,
        leg1.homeClubId,
        leg1,
        leg2,
        state.clubs
      );
      r16Winners.push(summary.winnerClubId || leg2.homeClubId);
    }

    const pairings = [0, 1, 2, 3].map((idx) => ({
      tieIndex: idx + 1,
      seededClubId: r16Winners[idx * 2],
      unseededClubId: r16Winners[idx * 2 + 1],
    }));
    newFixtures = createTwoLeggedFixtures(compId, seasonId, 'QF', pairings);
    newsTitle = trText(
      `${cfg.name} Quarter-Final Ties Confirmed`,
      `ประกบคู่รอบ 8 ทีมสุดท้าย (Quarter-Finals) ศึก ${cfg.name}`
    );
    newsBody = trText(
      `The competition reaches the Quarter-Finals, with first-leg ties scheduled for ${UEFA_KNOCKOUT_DATES.QF.dateLeg1}.`,
      `ศึกยุโรปเดินทางสู่รอบก่อนรองชนะเลิศ เตรียมฟาดแข้งนัดแรกวันที่ ${UEFA_KNOCKOUT_DATES.QF.dateLeg1}`
    );
  }
  // 4. QF -> Semi-Finals (SF)
  else if (hasStage('QF') && isStageComplete('QF') && !hasStage('SF')) {
    const qfWinners: string[] = [];
    for (let t = 1; t <= 4; t++) {
      const leg1 = compFixtures.find((f) => f.uefaStage === 'QF' && f.tieIndex === t && f.leg === 1);
      const leg2 = compFixtures.find((f) => f.uefaStage === 'QF' && f.tieIndex === t && f.leg === 2);
      if (!leg1 || !leg2) return state;
      const summary = resolveKnockoutTieWinner(
        'QF',
        t,
        leg2.homeClubId,
        leg1.homeClubId,
        leg1,
        leg2,
        state.clubs
      );
      qfWinners.push(summary.winnerClubId || leg2.homeClubId);
    }

    const pairings = [0, 1].map((idx) => ({
      tieIndex: idx + 1,
      seededClubId: qfWinners[idx * 2],
      unseededClubId: qfWinners[idx * 2 + 1],
    }));
    newFixtures = createTwoLeggedFixtures(compId, seasonId, 'SF', pairings);
    newsTitle = trText(
      `${cfg.name} Semi-Final Lineup Confirmed!`,
      `ได้ 4 ทีมสุดท้ายลุยรอบรองชนะเลิศ (Semi-Finals) ศึก ${cfg.name}!`
    );
    newsBody = trText(
      `Europe's final four clubs meet in the Semi-Finals, with first-leg ties kicking off on ${UEFA_KNOCKOUT_DATES.SF.dateLeg1}.`,
      `4 ยอดทีมแห่งยุโรปโคจรมาพบกันในรอบตัดเชือก แข่งขันนัดแรกวันที่ ${UEFA_KNOCKOUT_DATES.SF.dateLeg1}`
    );
  }
  // 5. SF -> FINAL
  else if (hasStage('SF') && isStageComplete('SF') && !hasStage('FINAL')) {
    const sfWinners: string[] = [];
    for (let t = 1; t <= 2; t++) {
      const leg1 = compFixtures.find((f) => f.uefaStage === 'SF' && f.tieIndex === t && f.leg === 1);
      const leg2 = compFixtures.find((f) => f.uefaStage === 'SF' && f.tieIndex === t && f.leg === 2);
      if (!leg1 || !leg2) return state;
      const summary = resolveKnockoutTieWinner(
        'SF',
        t,
        leg2.homeClubId,
        leg1.homeClubId,
        leg1,
        leg2,
        state.clubs
      );
      sfWinners.push(summary.winnerClubId || leg2.homeClubId);
    }

    const cleanSeason = seasonId.replace('/', '');
    newFixtures = [
      {
        id: `fix_${compId}_${cleanSeason}_final`,
        competitionId: compId,
        seasonId,
        matchday: UEFA_KNOCKOUT_DATES.FINAL.mdLeg1,
        kickoffDate: UEFA_KNOCKOUT_DATES.FINAL.dateLeg1,
        homeClubId: sfWinners[0],
        awayClubId: sfWinners[1],
        status: 'Scheduled',
        uefaStage: 'FINAL',
        leg: 1,
        tieIndex: 1,
      },
    ];
    const finalist1 = state.clubs[sfWinners[0]]?.name || sfWinners[0];
    const finalist2 = state.clubs[sfWinners[1]]?.name || sfWinners[1];
    newsTitle = trText(
      `${cfg.name} Final Confirmed: ${finalist1} vs ${finalist2}!`,
      `คู่ชิงชนะเลิศ ${cfg.name}: ${finalist1} ดวลเดือด ${finalist2}!`
    );
    newsBody = trText(
      `The ${seasonId} ${cfg.name} Final is set as ${finalist1} face ${finalist2} on ${UEFA_KNOCKOUT_DATES.FINAL.dateLeg1}.`,
      `ศึกชิงเจ้ายุโรปนัดชิงชนะเลิศประจำฤดูกาล ${seasonId} เป็นการโคจรมาพบกันระหว่าง ${finalist1} และ ${finalist2} ในวันที่ ${UEFA_KNOCKOUT_DATES.FINAL.dateLeg1}`
    );
  }

  if (newFixtures.length === 0) return state;

  const newsItem: NewsItem = {
    id: `news_uefa_${compId}_${newFixtures[0].uefaStage}_${seasonId.replace('/', '')}`,
    gameDate: state.gameDate,
    category: 'Competition',
    title: newsTitle,
    body: newsBody,
    isRead: false,
    isImportant: true,
  };

  return {
    ...state,
    fixtures: [...state.fixtures, ...newFixtures],
    inbox: [newsItem, ...state.inbox],
  };
}

/**
 * Extracts all Knockout Stage Tie Summaries for display in the UEFA Bracket UI.
 * Includes projected ties from the current League Phase standings if Knockout stages haven't started yet!
 */
export function getUefaKnockoutBracketSummary(
  state: WorldState,
  compId: UefaCompetitionId
): {
  kpo: UefaKnockoutTieSummary[];
  r16: UefaKnockoutTieSummary[];
  qf: UefaKnockoutTieSummary[];
  sf: UefaKnockoutTieSummary[];
  finalTie: UefaKnockoutTieSummary | null;
  isProjectedKpo: boolean;
} {
  const seasonId = state.currentSeason;
  const compFixtures = state.fixtures.filter(
    (f) => f.competitionId === compId && f.seasonId === seasonId
  );
  const standings = state.uefaStandings?.[compId] || [];

  const collectStageTies = (
    stage: Exclude<UefaStage, 'LEAGUE_PHASE' | 'FINAL'>,
    count: number
  ): UefaKnockoutTieSummary[] => {
    const ties: UefaKnockoutTieSummary[] = [];
    for (let t = 1; t <= count; t++) {
      const leg1 = compFixtures.find((f) => f.uefaStage === stage && f.tieIndex === t && f.leg === 1);
      const leg2 = compFixtures.find((f) => f.uefaStage === stage && f.tieIndex === t && f.leg === 2);
      if (leg1 && leg2) {
        ties.push(
          resolveKnockoutTieWinner(
            stage,
            t,
            leg2.homeClubId,
            leg1.homeClubId,
            leg1,
            leg2,
            state.clubs
          )
        );
      }
    }
    return ties;
  };

  let kpo = collectStageTies('KPO', 8);
  let isProjectedKpo = false;
  if (kpo.length === 0 && standings.length >= 24) {
    isProjectedKpo = true;
    kpo = Array.from({ length: 8 }, (_, idx) => ({
      stage: 'KPO',
      tieIndex: idx + 1,
      label: trText(
        `Play-off Tie #${idx + 1} (Rank #${9 + idx} vs Rank #${24 - idx})`,
        `คู่เพลย์ออฟ #${idx + 1} (อันดับ ${9 + idx} พบ อันดับ ${24 - idx})`
      ),
      seededClubId: standings[8 + idx].clubId,
      unseededClubId: standings[23 - idx].clubId,
      seededAggGoals: 0,
      unseededAggGoals: 0,
      winnerClubId: null,
    }));
  }

  const r16 = collectStageTies('R16', 8);
  const qf = collectStageTies('QF', 4);
  const sf = collectStageTies('SF', 2);

  const finalFix = compFixtures.find((f) => f.uefaStage === 'FINAL');
  const finalTie = finalFix
    ? resolveKnockoutTieWinner(
        'FINAL',
        1,
        finalFix.homeClubId,
        finalFix.awayClubId,
        finalFix,
        undefined,
        state.clubs
      )
    : null;

  return { kpo, r16, qf, sf, finalTie, isProjectedKpo };
}
