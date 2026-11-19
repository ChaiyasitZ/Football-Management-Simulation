import {
  Club,
  Fixture,
  LeagueConfig,
  LeagueId,
  LeagueStanding,
  MatchResult,
  Player,
} from '../types/game';
import { SeededRNG } from './random';

/**
 * Generates a full double round-robin (home & away) fixture schedule using the Circle Method.
 * For N clubs (even): (N - 1) * 2 matchdays, N / 2 fixtures per matchday.
 * Guarantees no club plays twice on the same matchday and every pair meets once home and once away.
 */
export function generateLeagueSchedule(
  leagueConfig: LeagueConfig,
  clubIds: string[],
  seasonId: string,
  seasonStartDate = '2026-08-15',
  rng = new SeededRNG(42)
): Fixture[] {
  const shuffled = rng.shuffle(clubIds);
  const n = shuffled.length;
  if (n < 2 || n % 2 !== 0) {
    throw new Error(`League ${leagueConfig.id} requires an even number of clubs, got ${n}`);
  }

  const totalHalfMatchdays = n - 1;
  const matchesPerMatchday = n / 2;
  const fixtures: Fixture[] = [];

  const rotating = shuffled.slice(1);
  const fixed = shuffled[0];

  const firstHalfRounds: { home: string; away: string }[][] = [];

  for (let round = 0; round < totalHalfMatchdays; round++) {
    const roundPairs: { home: string; away: string }[] = [];
    const firstOpponent = rotating[rotating.length - 1];

    if (round % 2 === 0) {
      roundPairs.push({ home: fixed, away: firstOpponent });
    } else {
      roundPairs.push({ home: firstOpponent, away: fixed });
    }

    for (let i = 0; i < matchesPerMatchday - 1; i++) {
      const teamA = rotating[i];
      const teamB = rotating[rotating.length - 2 - i];
      if ((round + i) % 2 === 0) {
        roundPairs.push({ home: teamA, away: teamB });
      } else {
        roundPairs.push({ home: teamB, away: teamA });
      }
    }

    firstHalfRounds.push(roundPairs);
    // Rotate clockwise
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  // Second half mirrors home/away
  const secondHalfRounds = firstHalfRounds.map((roundPairs) =>
    roundPairs.map((p) => ({ home: p.away, away: p.home }))
  );

  const allRounds = [...firstHalfRounds, ...secondHalfRounds];
  const baseDate = new Date(`${seasonStartDate}T12:00:00Z`);

  allRounds.forEach((roundPairs, idx) => {
    const matchday = idx + 1;
    // Advance ~7 days per matchday
    const matchDate = new Date(baseDate.getTime() + idx * 7 * 24 * 60 * 60 * 1000);
    const dateStr = matchDate.toISOString().slice(0, 10);

    roundPairs.forEach((pair, mIdx) => {
      fixtures.push({
        id: `fix_${leagueConfig.id}_${seasonId.replace('/', '')}_md${matchday}_${mIdx + 1}`,
        competitionId: leagueConfig.id,
        seasonId,
        matchday,
        kickoffDate: dateStr,
        homeClubId: pair.home,
        awayClubId: pair.away,
        status: 'Scheduled',
      });
    });
  });

  return fixtures;
}

/**
 * Initializes empty standings table for a league
 */
export function createInitialStandings(
  leagueId: LeagueId,
  seasonId: string,
  clubIds: string[],
  clubsById?: Record<string, Club>
): LeagueStanding[] {
  return clubIds.map((clubId) => {
    const deduction = clubsById?.[clubId]?.pointsDeduction || 0;
    return {
      competitionId: leagueId,
      seasonId,
      clubId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: -deduction,
      pointsDeduction: deduction > 0 ? deduction : undefined,
      form: [],
    };
  });
}

/**
 * Sorts standings according to LeagueConfig rules:
 * Points -> Tie-break order (goalDifference -> goalsFor -> wins) -> clubId alphabetical
 */
export function sortStandings(
  standings: LeagueStanding[],
  leagueConfig: LeagueConfig,
  clubsById?: Record<string, Club>
): LeagueStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    for (const rule of leagueConfig.tieBreakOrder) {
      if (rule === 'goalDifference' && b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (rule === 'goalsFor' && b.goalsFor !== a.goalsFor) {
        return b.goalsFor - a.goalsFor;
      }
      if (rule === 'wins' && b.won !== a.won) {
        return b.won - a.won;
      }
    }

    const nameA = clubsById?.[a.clubId]?.name || a.clubId;
    const nameB = clubsById?.[b.clubId]?.name || b.clubId;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Recomputes standings deterministically from completed fixtures in a league
 * Prevents any duplicate points or drift.
 */
export function recomputeLeagueStandings(
  leagueConfig: LeagueConfig,
  seasonId: string,
  clubIds: string[],
  fixtures: Fixture[],
  clubsById?: Record<string, Club>
): LeagueStanding[] {
  const map: Record<string, LeagueStanding> = {};
  for (const cId of clubIds) {
    const deduction = clubsById?.[cId]?.pointsDeduction || 0;
    map[cId] = {
      competitionId: leagueConfig.id,
      seasonId,
      clubId: cId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: -deduction,
      pointsDeduction: deduction > 0 ? deduction : undefined,
      form: [],
    };
  }

  const completed = fixtures
    .filter(
      (f) =>
        f.competitionId === leagueConfig.id &&
        f.seasonId === seasonId &&
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
      home.points += leagueConfig.pointsForWin;
      home.form = [...home.form.slice(-4), 'W'];

      away.lost += 1;
      away.points += leagueConfig.pointsForLoss;
      away.form = [...away.form.slice(-4), 'L'];
    } else if (res.homeGoals < res.awayGoals) {
      away.won += 1;
      away.points += leagueConfig.pointsForWin;
      away.form = [...away.form.slice(-4), 'W'];

      home.lost += 1;
      home.points += leagueConfig.pointsForLoss;
      home.form = [...home.form.slice(-4), 'L'];
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += leagueConfig.pointsForDraw;
      away.points += leagueConfig.pointsForDraw;
      home.form = [...home.form.slice(-4), 'D'];
      away.form = [...away.form.slice(-4), 'D'];
    }
  }

  return sortStandings(Object.values(map), leagueConfig, clubsById);
}

/**
 * Returns 6 stat leader categories in a given league:
 * 1. Golden Boot (topScorers)
 * 2. Playmaker Award (topAssists)
 * 3. Highest Average Rating (topRated)
 * 4. Golden Glove Clean Sheets (topCleanSheets)
 * 5. xG Overperformers (topXgOverperformers)
 * 6. Defensive Monsters (topDefensiveMonsters)
 */
export function getLeaguePlayerLeaders(
  leagueId: LeagueId,
  clubs: Record<string, Club>,
  players: Record<string, Player>
) {
  const leaguePlayers = Object.values(players).filter(
    (p) => clubs[p.clubId]?.leagueId === leagueId
  );

  const topScorers = [...leaguePlayers]
    .filter((p) => p.stats.goals > 0)
    .sort((a, b) => b.stats.goals - a.stats.goals || b.stats.assists - a.stats.assists)
    .slice(0, 15);

  const topAssists = [...leaguePlayers]
    .filter((p) => p.stats.assists > 0)
    .sort((a, b) => b.stats.assists - a.stats.assists || b.stats.goals - a.stats.goals)
    .slice(0, 15);

  const topRated = [...leaguePlayers]
    .filter((p) => p.stats.appearances >= 1)
    .sort((a, b) => b.stats.averageRating - a.stats.averageRating)
    .slice(0, 15);

  const topCleanSheets = [...leaguePlayers]
    .filter((p) => p.positions[0] === 'GK')
    .map((p) => {
      const explicitCS = p.stats.cleanSheets || 0;
      const estimatedCS =
        explicitCS > 0
          ? explicitCS
          : Math.max(
              0,
              Math.round(
                p.stats.appearances *
                  Math.min(
                    0.62,
                    Math.max(
                      0.18,
                      (p.attributes.mental.positioning + p.attributes.physical.agility) / 42
                    )
                  )
              )
            );
      return { player: p, value: estimatedCS };
    })
    .filter((item) => item.value > 0 || item.player.stats.appearances > 0)
    .sort((a, b) => b.value - a.value || b.player.currentAbility - a.player.currentAbility)
    .slice(0, 15);

  const topXgOverperformers = [...leaguePlayers]
    .filter((p) => p.stats.goals > 0 || p.stats.appearances >= 1)
    .map((p) => {
      const expectedXg = Number(
        (
          p.stats.goals * 0.78 +
          p.stats.appearances * ((p.attributes.mental.offTheBall + p.attributes.mental.positioning) / 55)
        ).toFixed(2)
      );
      const diff = Number((p.stats.goals - expectedXg * 0.82).toFixed(2));
      return { player: p, xg: expectedXg, diff };
    })
    .sort((a, b) => b.diff - a.diff || b.player.stats.goals - a.player.stats.goals)
    .slice(0, 15);

  const topDefensiveMonsters = [...leaguePlayers]
    .filter((p) => p.positions[0] !== 'GK')
    .map((p) => {
      const apps = Math.max(1, p.stats.appearances);
      const defScore = Number(
        (
          ((p.attributes.technical.tackling * 1.25 +
            p.attributes.mental.positioning * 1.1 +
            p.attributes.physical.strength * 0.8 +
            p.attributes.mental.workRate * 0.85) /
            12) *
          (0.6 + Math.min(1.4, apps / 5))
        ).toFixed(1)
      );
      return { player: p, actionsPer90: defScore };
    })
    .sort((a, b) => b.actionsPer90 - a.actionsPer90 || b.player.currentAbility - a.player.currentAbility)
    .slice(0, 15);

  return {
    topScorers,
    topAssists,
    topRated,
    topCleanSheets,
    topXgOverperformers,
    topDefensiveMonsters,
  };
}

export type CupMetaCompetitionId =
  | import('../types/game').CupId
  | import('../types/game').SuperCupId
  | import('../types/game').ContinentalCupId
  | import('../types/game').PromotionPlayoffId;

export interface CupCompetitionMeta {
  id: CupMetaCompetitionId;
  name: string;
  shortName: string;
  countryId: string;
  countryFlag: string;
  category: 'PRIMARY_CUP' | 'LEAGUE_CUP' | 'SUPER_CUP' | 'CONTINENTAL_CUP' | 'PROMO_PLAYOFF';
  fotmobLogoUrl: string;
  winnerPrize: number;
  qualifiesFor?: 'UEFA_UEL' | 'UEFA_UECL' | 'GLB_CWC' | 'PROMOTION';
}

export const PROMOTION_PLAYOFF_LEAGUE_MAP: Record<
  import('../types/game').PromotionPlayoffId,
  { lowerLeagueId: LeagueId; upperLeagueId: LeagueId; autoSpots: number }
> = {
  ENG_CH_PO: { lowerLeagueId: 'ENG_CH', upperLeagueId: 'ENG_PL', autoSpots: 2 },
  ENG_L1_PO: { lowerLeagueId: 'ENG_L1', upperLeagueId: 'ENG_CH', autoSpots: 2 },
  ESP_SD_PO: { lowerLeagueId: 'ESP_SD', upperLeagueId: 'ESP_LL', autoSpots: 2 },
  ITA_SB_PO: { lowerLeagueId: 'ITA_SB', upperLeagueId: 'ITA_SA', autoSpots: 2 },
  GER_2B_PO: { lowerLeagueId: 'GER_2B', upperLeagueId: 'GER_BL', autoSpots: 2 },
  FRA_L2_PO: { lowerLeagueId: 'FRA_L2', upperLeagueId: 'FRA_L1', autoSpots: 2 },
};

export const CONTINENTAL_CUP_IDS: import('../types/game').ContinentalCupId[] = [
  'AFC_ACL',
  'CONMEBOL_LIB',
  'CONCACAF_CCC',
];

export const PROMOTION_PLAYOFF_IDS: import('../types/game').PromotionPlayoffId[] = [
  'ENG_CH_PO',
  'ENG_L1_PO',
  'ESP_SD_PO',
  'ITA_SB_PO',
  'GER_2B_PO',
  'FRA_L2_PO',
];

export const CUP_COMPETITIONS_META: Record<
  CupMetaCompetitionId,
  CupCompetitionMeta
> = {
  // 10 Primary National Cups
  ENG_CUP: {
    id: 'ENG_CUP',
    name: 'Emirates FA Cup',
    shortName: 'FA Cup',
    countryId: 'ENG',
    countryFlag: 'ENG',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/132.png',
    winnerPrize: 6_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  ESP_CUP: {
    id: 'ESP_CUP',
    name: 'Copa del Rey',
    shortName: 'Copa del Rey',
    countryId: 'ESP',
    countryFlag: 'ESP',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/138.png',
    winnerPrize: 6_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  GER_CUP: {
    id: 'GER_CUP',
    name: 'DFB-Pokal',
    shortName: 'DFB-Pokal',
    countryId: 'GER',
    countryFlag: 'GER',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/209.png',
    winnerPrize: 6_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  ITA_CUP: {
    id: 'ITA_CUP',
    name: 'Coppa Italia Frecciarossa',
    shortName: 'Coppa Italia',
    countryId: 'ITA',
    countryFlag: 'ITA',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/141.png',
    winnerPrize: 6_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  FRA_CUP: {
    id: 'FRA_CUP',
    name: 'Coupe de France',
    shortName: 'Coupe de France',
    countryId: 'FRA',
    countryFlag: 'FRA',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/134.png',
    winnerPrize: 6_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  POR_CUP: {
    id: 'POR_CUP',
    name: 'Taça de Portugal',
    shortName: 'Taça de Portugal',
    countryId: 'POR',
    countryFlag: 'POR',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/186.png',
    winnerPrize: 4_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  NED_CUP: {
    id: 'NED_CUP',
    name: 'TOTO KNVB Beker',
    shortName: 'KNVB Beker',
    countryId: 'NED',
    countryFlag: 'NED',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/235.png',
    winnerPrize: 4_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  BEL_CUP: {
    id: 'BEL_CUP',
    name: 'Croky Cup',
    shortName: 'Croky Cup',
    countryId: 'BEL',
    countryFlag: 'BEL',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/149.png',
    winnerPrize: 3_500_000,
    qualifiesFor: 'UEFA_UEL',
  },
  TUR_CUP: {
    id: 'TUR_CUP',
    name: 'Ziraat Türkiye Kupası',
    shortName: 'Türkiye Kupası',
    countryId: 'TUR',
    countryFlag: 'TUR',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/151.png',
    winnerPrize: 3_500_000,
    qualifiesFor: 'UEFA_UEL',
  },
  SCO_CUP: {
    id: 'SCO_CUP',
    name: 'Scottish Gas Scottish Cup',
    shortName: 'Scottish Cup',
    countryId: 'SCO',
    countryFlag: 'SCO',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/137.png',
    winnerPrize: 3_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  AUT_CUP: {
    id: 'AUT_CUP',
    name: 'UNIQA ÖFB-Cup',
    shortName: 'ÖFB-Cup',
    countryId: 'AUT',
    countryFlag: 'AUT',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/278.png',
    winnerPrize: 3_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  SUI_CUP: {
    id: 'SUI_CUP',
    name: 'Schweizer Cup',
    shortName: 'Schweizer Cup',
    countryId: 'SUI',
    countryFlag: 'SUI',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/575.png',
    winnerPrize: 3_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  GRE_CUP: {
    id: 'GRE_CUP',
    name: 'Greek Football Cup',
    shortName: 'Greek Cup',
    countryId: 'GRE',
    countryFlag: 'GRE',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/145.png',
    winnerPrize: 3_000_000,
    qualifiesFor: 'UEFA_UEL',
  },
  KSA_CUP: {
    id: 'KSA_CUP',
    name: 'King’s Cup (Saudi Arabia)',
    shortName: 'King’s Cup',
    countryId: 'KSA',
    countryFlag: 'KSA',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9475.png',
    winnerPrize: 10_000_000,
  },
  USA_CUP: {
    id: 'USA_CUP',
    name: 'Lamar Hunt U.S. Open Cup',
    shortName: 'U.S. Open Cup',
    countryId: 'USA',
    countryFlag: 'USA',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9441.png',
    winnerPrize: 3_500_000,
  },
  BRA_CUP: {
    id: 'BRA_CUP',
    name: 'Copa Betano do Brasil',
    shortName: 'Copa do Brasil',
    countryId: 'BRA',
    countryFlag: 'BRA',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/203.png',
    winnerPrize: 14_000_000,
  },
  JPN_CUP: {
    id: 'JPN_CUP',
    name: 'Emperor’s Cup JFA',
    shortName: 'Emperor’s Cup',
    countryId: 'JPN',
    countryFlag: 'JPN',
    category: 'PRIMARY_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/225.png',
    winnerPrize: 3_000_000,
  },
  // 3 Secondary League Cups
  ENG_LC: {
    id: 'ENG_LC',
    name: 'EFL Carabao Cup',
    shortName: 'Carabao Cup',
    countryId: 'ENG',
    countryFlag: 'ENG',
    category: 'LEAGUE_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/133.png',
    winnerPrize: 2_500_000,
    qualifiesFor: 'UEFA_UECL',
  },
  POR_LC: {
    id: 'POR_LC',
    name: 'Taça da Liga (Allianz Cup)',
    shortName: 'Taça da Liga',
    countryId: 'POR',
    countryFlag: 'POR',
    category: 'LEAGUE_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/187.png',
    winnerPrize: 2_000_000,
    qualifiesFor: 'UEFA_UECL',
  },
  SCO_LC: {
    id: 'SCO_LC',
    name: 'Scottish League Cup (Premier Sports Cup)',
    shortName: 'Premier Sports Cup',
    countryId: 'SCO',
    countryFlag: 'SCO',
    category: 'LEAGUE_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/180.png',
    winnerPrize: 1_500_000,
    qualifiesFor: 'UEFA_UECL',
  },
  // 9 National Super Cups + 1 UEFA Super Cup
  ENG_SC: {
    id: 'ENG_SC',
    name: 'FA Community Shield',
    shortName: 'Community Shield',
    countryId: 'ENG',
    countryFlag: 'ENG',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/247.png',
    winnerPrize: 1_500_000,
  },
  ESP_SC: {
    id: 'ESP_SC',
    name: 'Supercopa de España',
    shortName: 'Supercopa',
    countryId: 'ESP',
    countryFlag: 'ESP',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/139.png',
    winnerPrize: 2_000_000,
  },
  GER_SC: {
    id: 'GER_SC',
    name: 'DFL-Supercup',
    shortName: 'DFL-Supercup',
    countryId: 'GER',
    countryFlag: 'GER',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/8924.png',
    winnerPrize: 1_800_000,
  },
  ITA_SC: {
    id: 'ITA_SC',
    name: 'Supercoppa Italiana',
    shortName: 'Supercoppa',
    countryId: 'ITA',
    countryFlag: 'ITA',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/222.png',
    winnerPrize: 2_000_000,
  },
  FRA_SC: {
    id: 'FRA_SC',
    name: 'Trophée des Champions',
    shortName: 'Trophée des Champions',
    countryId: 'FRA',
    countryFlag: 'FRA',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/207.png',
    winnerPrize: 1_500_000,
  },
  POR_SC: {
    id: 'POR_SC',
    name: 'Supertaça Cândido de Oliveira',
    shortName: 'Supertaça',
    countryId: 'POR',
    countryFlag: 'POR',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/188.png',
    winnerPrize: 1_200_000,
  },
  NED_SC: {
    id: 'NED_SC',
    name: 'Johan Cruyff Shield',
    shortName: 'Cruyff Shield',
    countryId: 'NED',
    countryFlag: 'NED',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/237.png',
    winnerPrize: 1_000_000,
  },
  BEL_SC: {
    id: 'BEL_SC',
    name: 'Belgian Super Cup',
    shortName: 'Belgian Super Cup',
    countryId: 'BEL',
    countryFlag: 'BEL',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9862.png',
    winnerPrize: 1_000_000,
  },
  TUR_SC: {
    id: 'TUR_SC',
    name: 'Turkcell Süper Kupa',
    shortName: 'Süper Kupa',
    countryId: 'TUR',
    countryFlag: 'TUR',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/10366.png',
    winnerPrize: 1_200_000,
  },
  UEFA_USC: {
    id: 'UEFA_USC',
    name: 'UEFA Super Cup',
    shortName: 'UEFA Super Cup',
    countryId: 'EUR',
    countryFlag: 'EUR',
    category: 'SUPER_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/74.png',
    winnerPrize: 4_500_000,
  },
  // Stage 11: 3 Global Continental Champions Cups
  AFC_ACL: {
    id: 'AFC_ACL',
    name: 'AFC Champions League Elite',
    shortName: 'AFC Champions League',
    countryId: 'AFC',
    countryFlag: '🌏',
    category: 'CONTINENTAL_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/525.png',
    winnerPrize: 12_000_000,
    qualifiesFor: 'GLB_CWC',
  },
  CONMEBOL_LIB: {
    id: 'CONMEBOL_LIB',
    name: 'CONMEBOL Copa Libertadores',
    shortName: 'Copa Libertadores',
    countryId: 'SAM',
    countryFlag: '🌎',
    category: 'CONTINENTAL_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/45.png',
    winnerPrize: 23_000_000,
    qualifiesFor: 'GLB_CWC',
  },
  CONCACAF_CCC: {
    id: 'CONCACAF_CCC',
    name: 'CONCACAF Champions Cup',
    shortName: 'CONCACAF Cup',
    countryId: 'NAM',
    countryFlag: '🌎',
    category: 'CONTINENTAL_CUP',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/297.png',
    winnerPrize: 5_000_000,
    qualifiesFor: 'GLB_CWC',
  },
  // Stage 11: 6 Tier 2/3 Promotion Playoffs (3rd–6th)
  ENG_CH_PO: {
    id: 'ENG_CH_PO',
    name: 'EFL Championship Promotion Playoffs',
    shortName: 'Championship Playoffs',
    countryId: 'ENG',
    countryFlag: 'ENG',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/48.png',
    winnerPrize: 20_000_000,
    qualifiesFor: 'PROMOTION',
  },
  ENG_L1_PO: {
    id: 'ENG_L1_PO',
    name: 'EFL League One Promotion Playoffs',
    shortName: 'League One Playoffs',
    countryId: 'ENG',
    countryFlag: 'ENG',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/108.png',
    winnerPrize: 5_000_000,
    qualifiesFor: 'PROMOTION',
  },
  ESP_SD_PO: {
    id: 'ESP_SD_PO',
    name: 'LaLiga Hypermotion Promotion Playoffs',
    shortName: 'Segunda Playoffs',
    countryId: 'ESP',
    countryFlag: 'ESP',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/140.png',
    winnerPrize: 10_000_000,
    qualifiesFor: 'PROMOTION',
  },
  ITA_SB_PO: {
    id: 'ITA_SB_PO',
    name: 'Serie BKT Promotion Playoffs',
    shortName: 'Serie B Playoffs',
    countryId: 'ITA',
    countryFlag: 'ITA',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/86.png',
    winnerPrize: 9_000_000,
    qualifiesFor: 'PROMOTION',
  },
  GER_2B_PO: {
    id: 'GER_2B_PO',
    name: '2. Bundesliga Promotion Playoffs',
    shortName: '2. Bundesliga Playoffs',
    countryId: 'GER',
    countryFlag: 'GER',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/146.png',
    winnerPrize: 10_000_000,
    qualifiesFor: 'PROMOTION',
  },
  FRA_L2_PO: {
    id: 'FRA_L2_PO',
    name: 'Ligue 2 BKT Promotion Playoffs',
    shortName: 'Ligue 2 Playoffs',
    countryId: 'FRA',
    countryFlag: 'FRA',
    category: 'PROMO_PLAYOFF',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/110.png',
    winnerPrize: 8_000_000,
    qualifiesFor: 'PROMOTION',
  },
};

export function getCupRoundPrizeMoney(
  competitionId: string,
  stage: import('../types/game').UefaStage | undefined
): number {
  const meta = CUP_COMPETITIONS_META[competitionId as CupMetaCompetitionId];
  const isLeagueCup = String(competitionId).endsWith('_LC');
  const isSuperCup = String(competitionId).endsWith('_SC') || competitionId === 'UEFA_USC';
  const isContinental =
    competitionId === 'AFC_ACL' ||
    competitionId === 'CONMEBOL_LIB' ||
    competitionId === 'CONCACAF_CCC';
  const isPromoPlayoff = String(competitionId).endsWith('_PO');

  if (isSuperCup) {
    return meta?.winnerPrize || 1_500_000;
  }
  if (isPromoPlayoff) {
    if (stage === 'FINAL') return meta?.winnerPrize || 10_000_000;
    return Math.round((meta?.winnerPrize || 10_000_000) * 0.2);
  }
  if (isContinental) {
    switch (stage) {
      case 'R16':
        return 1_500_000;
      case 'QF':
        return 3_000_000;
      case 'SF':
        return 6_000_000;
      case 'FINAL':
        return meta?.winnerPrize || 12_000_000;
      default:
        return 1_000_000;
    }
  }
  switch (stage) {
    case 'R32':
      return isLeagueCup ? 150_000 : 250_000;
    case 'R16':
      return isLeagueCup ? 300_000 : 500_000;
    case 'QF':
      return isLeagueCup ? 650_000 : 1_200_000;
    case 'SF':
      return isLeagueCup ? 1_200_000 : 2_500_000;
    case 'FINAL':
      return meta?.winnerPrize || (isLeagueCup ? 2_500_000 : 6_000_000);
    default:
      return 250_000;
  }
}

/**
 * Generates initial knockout fixtures for a Domestic Primary Cup or Secondary League Cup:
 * - For 2-Tier nations (>=32 clubs in country, e.g., ENG, ESP, GER, ITA, FRA):
 *   Draws 32 clubs starting at R32 (combining all Tier 1 clubs + top Tier 2 clubs so Tier 1 vs Tier 2 Giant-Killings occur!).
 * - For 16-18 club nations (POR, NED, BEL, TUR):
 *   Draws 16 clubs starting at R16.
 * - For 12-club nations (SCO):
 *   Draws 8 clubs starting at QF.
 * Always guarantees `controlledClubId` is included if it belongs to `countryClubs`.
 */
export function generateInitialDomesticCupFixtures(
  cupId: import('../types/game').CupId,
  countryClubs: Club[],
  seasonId: string,
  startDate?: string,
  controlledClubId?: string
): Fixture[] {
  if (countryClubs.length < 8) return [];

  const sorted = [...countryClubs].sort(
    (a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id)
  );
  const bracketSize = sorted.length >= 32 ? 32 : sorted.length >= 16 ? 16 : 8;
  const startingStage: 'R32' | 'R16' | 'QF' =
    bracketSize === 32 ? 'R32' : bracketSize === 16 ? 'R16' : 'QF';

  const participants = sorted.slice(0, bracketSize);

  // Guarantee the user's controlled club is in the bracket if from this country
  if (
    controlledClubId &&
    countryClubs.some((c) => c.id === controlledClubId) &&
    !participants.some((c) => c.id === controlledClubId)
  ) {
    const userClub = countryClubs.find((c) => c.id === controlledClubId);
    if (userClub) {
      participants[participants.length - 1] = userClub;
    }
  }

  const startYear = parseInt(seasonId.slice(0, 4), 10) || 2025;
  const isLeagueCup = String(cupId).endsWith('_LC');
  const defaultKickoff = isLeagueCup
    ? startingStage === 'R32'
      ? `${startYear}-09-23`
      : `${startYear}-10-28`
    : startingStage === 'R32'
      ? `${startYear}-11-04`
      : `${startYear}-10-28`;

  const resolvedKickoff = startDate || defaultKickoff;
  const fixtures: Fixture[] = [];
  const pairCount = Math.floor(participants.length / 2);

  for (let i = 0; i < pairCount; i++) {
    // Seed #i vs Seed #(N - 1 - i), alternating home/away so lower-tier clubs can host Giant-Killing ties
    const highSeed = participants[i];
    const lowSeed = participants[participants.length - 1 - i];
    const home = i % 2 === 0 ? highSeed : lowSeed;
    const away = i % 2 === 0 ? lowSeed : highSeed;

    fixtures.push({
      id: `fix_${cupId}_${seasonId}_${startingStage}_${i + 1}`,
      competitionId: cupId,
      seasonId,
      matchday: 1,
      kickoffDate: resolvedKickoff,
      homeClubId: home.id,
      awayClubId: away.id,
      status: 'Scheduled',
      uefaStage: startingStage,
      cupRound: startingStage,
      tieIndex: i,
    });
  }
  return fixtures;
}

/**
 * Generates opening-week single-leg Super Cup Finals (9 National Super Cups on Aug 10 + UEFA Super Cup on Aug 12)
 */
export function generateSeasonSuperCupFixtures(
  seasonId: string,
  startYear: number,
  clubsById: Record<string, Club>,
  trophyHistory?: import('../types/game').TrophyHistoryRecord[]
): Fixture[] {
  const cleanSeason = seasonId.replace('/', '');
  const allClubs = Object.values(clubsById);
  const fixtures: Fixture[] = [];

  const nationalSuperCups: {
    superCupId: import('../types/game').SuperCupId;
    leagueId: LeagueId;
    cupId: import('../types/game').CupId;
    countryId: string;
  }[] = [
    { superCupId: 'ENG_SC', leagueId: 'ENG_PL', cupId: 'ENG_CUP', countryId: 'ENG' },
    { superCupId: 'ESP_SC', leagueId: 'ESP_LL', cupId: 'ESP_CUP', countryId: 'ESP' },
    { superCupId: 'GER_SC', leagueId: 'GER_BL', cupId: 'GER_CUP', countryId: 'GER' },
    { superCupId: 'ITA_SC', leagueId: 'ITA_SA', cupId: 'ITA_CUP', countryId: 'ITA' },
    { superCupId: 'FRA_SC', leagueId: 'FRA_L1', cupId: 'FRA_CUP', countryId: 'FRA' },
    { superCupId: 'POR_SC', leagueId: 'POR_LP', cupId: 'POR_CUP', countryId: 'POR' },
    { superCupId: 'NED_SC', leagueId: 'NED_ED', cupId: 'NED_CUP', countryId: 'NED' },
    { superCupId: 'BEL_SC', leagueId: 'BEL_PL', cupId: 'BEL_CUP', countryId: 'BEL' },
    { superCupId: 'TUR_SC', leagueId: 'TUR_SL', cupId: 'TUR_CUP', countryId: 'TUR' },
  ];

  for (const item of nationalSuperCups) {
    const countryClubs = allClubs
      .filter((c) => c.countryId === item.countryId)
      .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
    if (countryClubs.length < 2) continue;

    const prevLeagueWin = trophyHistory?.find((t) => t.competitionId === item.leagueId);
    const prevCupWin = trophyHistory?.find((t) => t.competitionId === item.cupId);

    const homeClubId =
      prevLeagueWin && clubsById[prevLeagueWin.winnerClubId]
        ? prevLeagueWin.winnerClubId
        : countryClubs[0].id;

    let awayClubId =
      prevCupWin &&
      clubsById[prevCupWin.winnerClubId] &&
      prevCupWin.winnerClubId !== homeClubId
        ? prevCupWin.winnerClubId
        : prevLeagueWin?.runnerUpClubId &&
            clubsById[prevLeagueWin.runnerUpClubId] &&
            prevLeagueWin.runnerUpClubId !== homeClubId
          ? prevLeagueWin.runnerUpClubId
          : countryClubs.find((c) => c.id !== homeClubId)?.id || countryClubs[1].id;

    if (awayClubId === homeClubId && countryClubs[1]) {
      awayClubId = countryClubs[1].id;
    }

    fixtures.push({
      id: `fix_${item.superCupId}_${cleanSeason}_FINAL_1`,
      competitionId: item.superCupId,
      seasonId,
      matchday: 1,
      kickoffDate: `${startYear}-08-12`,
      homeClubId,
      awayClubId,
      status: 'Scheduled',
      uefaStage: 'FINAL',
      cupRound: 'FINAL',
      tieIndex: 0,
    });
  }

  // UEFA Super Cup (UEFA_USC): UCL Winner vs UEL Winner on Aug 13
  const sortedEurope = [...allClubs].sort(
    (a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id)
  );
  if (sortedEurope.length >= 2) {
    const prevUcl = trophyHistory?.find((t) => t.competitionId === 'UEFA_UCL');
    const prevUel = trophyHistory?.find((t) => t.competitionId === 'UEFA_UEL');
    const uclChampId =
      prevUcl && clubsById[prevUcl.winnerClubId]
        ? prevUcl.winnerClubId
        : sortedEurope[0].id;
    const defaultUelId =
      clubsById['club_ita_sa_4'] && 'club_ita_sa_4' !== uclChampId
        ? 'club_ita_sa_4'
        : sortedEurope.find((c) => c.id !== uclChampId)?.id || sortedEurope[1].id;
    const uelChampId =
      prevUel &&
      clubsById[prevUel.winnerClubId] &&
      prevUel.winnerClubId !== uclChampId
        ? prevUel.winnerClubId
        : defaultUelId;

    fixtures.push({
      id: `fix_UEFA_USC_${cleanSeason}_FINAL_1`,
      competitionId: 'UEFA_USC',
      seasonId,
      matchday: 1,
      kickoffDate: `${startYear}-08-13`,
      homeClubId: uclChampId,
      awayClubId: uelChampId,
      status: 'Scheduled',
      uefaStage: 'FINAL',
      cupRound: 'FINAL',
      tieIndex: 0,
    });
  }

  return fixtures;
}

/**
 * Determines the winner of a completed single-leg Domestic Cup knockout fixture
 */
export function getDomesticCupFixtureWinnerId(fix: Fixture): string | null {
  if (fix.status !== 'Completed' || !fix.result) return null;
  if (fix.result.homeGoals > fix.result.awayGoals) return fix.homeClubId;
  if (fix.result.awayGoals > fix.result.homeGoals) return fix.awayClubId;
  if (fix.result.penaltyShootout) {
    return fix.result.penaltyShootout.homePenalties >= fix.result.penaltyShootout.awayPenalties
      ? fix.homeClubId
      : fix.awayClubId;
  }
  return fix.homeClubId;
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Checks if the current round of a Domestic Cup or League Cup is complete
 * and generates the next round (R32 -> R16 -> QF -> SF -> FINAL)
 */
export function checkAndAdvanceDomesticCup(
  cupId:
    | import('../types/game').CupId
    | import('../types/game').ContinentalCupId
    | import('../types/game').PromotionPlayoffId,
  allFixtures: Fixture[],
  seasonId: string,
  currentGameDate: string
): Fixture[] {
  const cupFixtures = allFixtures.filter(
    (f) => f.competitionId === cupId && f.seasonId === seasonId
  );
  if (cupFixtures.length === 0) return [];
  if (cupFixtures.some((f) => f.status !== 'Completed')) return [];

  const stages: import('../types/game').UefaStage[] = ['R32', 'R16', 'QF', 'SF', 'FINAL'];
  let latestStageIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (cupFixtures.some((f) => (f.uefaStage || f.cupRound) === stages[i])) {
      latestStageIdx = i;
      break;
    }
  }
  if (latestStageIdx < 0 || latestStageIdx >= stages.length - 1) return [];

  const currentStage = stages[latestStageIdx];
  const nextStage = stages[latestStageIdx + 1] as 'R16' | 'QF' | 'SF' | 'FINAL';
  const currentRoundFixtures = cupFixtures
    .filter((f) => (f.uefaStage || f.cupRound) === currentStage)
    .sort((a, b) => (a.tieIndex ?? 0) - (b.tieIndex ?? 0));

  const winners = currentRoundFixtures
    .map((f) => getDomesticCupFixtureWinnerId(f))
    .filter((id): id is string => Boolean(id));

  if (winners.length < 2) return [];

  const startYear = parseInt(seasonId.slice(0, 4), 10) || 2025;
  const endYear = startYear + 1;
  const isLeagueCup = String(cupId).endsWith('_LC');
  const isPromoPlayoff = String(cupId).endsWith('_PO');
  const isContinental =
    cupId === 'AFC_ACL' || cupId === 'CONMEBOL_LIB' || cupId === 'CONCACAF_CCC';

  const targetDateByStage: Record<'R16' | 'QF' | 'SF' | 'FINAL', string> = isPromoPlayoff
    ? {
        R16: `${endYear}-05-16`,
        QF: `${endYear}-05-18`,
        SF: `${endYear}-05-20`,
        FINAL: `${endYear}-05-26`,
      }
    : isContinental
      ? {
          R16: `${startYear}-11-12`,
          QF: `${endYear}-02-25`,
          SF: `${endYear}-04-15`,
          FINAL: `${endYear}-05-24`,
        }
      : isLeagueCup
        ? {
            R16: `${startYear}-10-28`,
            QF: `${startYear}-12-16`,
            SF: `${endYear}-01-20`,
            FINAL: `${endYear}-02-28`,
          }
        : {
            R16: `${endYear}-01-13`,
            QF: `${endYear}-02-17`,
            SF: `${endYear}-04-07`,
            FINAL: `${endYear}-05-23`,
          };

  const fallbackNextDate = addDaysISO(currentGameDate, isPromoPlayoff ? 5 : 28);
  const targetCalendarDate = targetDateByStage[nextStage];
  const nextKickoff =
    targetCalendarDate && targetCalendarDate > currentGameDate
      ? targetCalendarDate
      : fallbackNextDate;

  const newFixtures: Fixture[] = [];
  const pairCount = Math.floor(winners.length / 2);

  for (let i = 0; i < pairCount; i++) {
    newFixtures.push({
      id: `fix_${cupId}_${seasonId}_${nextStage}_${i + 1}`,
      competitionId: cupId,
      seasonId,
      matchday: latestStageIdx + 2,
      kickoffDate: nextKickoff,
      homeClubId: winners[i * 2],
      awayClubId: winners[i * 2 + 1],
      status: 'Scheduled',
      uefaStage: nextStage,
      cupRound: nextStage,
      tieIndex: i,
    });
  }

  return newFixtures;
}

/**
 * Stage 11 Phase 4: Generates 16-team Round of 16 brackets for the 3 Global Continental Champions Cups:
 * - AFC_ACL: Top 8 from KSA_SPL + Top 8 from JPN_J1 (East vs West seeded matchups)
 * - CONMEBOL_LIB: Top 16 from BRA_SA
 * - CONCACAF_CCC: Top 16 from USA_MLS
 */
export function generateContinentalChampionsCupFixtures(
  seasonId: string,
  clubsById: Record<string, Club>,
  prevStandings?: Partial<Record<LeagueId, LeagueStanding[]>>,
  controlledClubId?: string
): Fixture[] {
  const startYear = parseInt(seasonId.slice(0, 4), 10) || 2025;
  const allClubs = Object.values(clubsById);
  const cleanSeason = seasonId.replace('/', '');

  const rankLeagueClubs = (leagueId: LeagueId, count: number): Club[] => {
    const table = prevStandings?.[leagueId];
    let ranked: Club[] = [];
    if (table && table.length > 0) {
      ranked = table
        .map((row) => clubsById[row.clubId])
        .filter((c): c is Club => Boolean(c) && c.leagueId === leagueId);
    }
    const existingIds = new Set(ranked.map((c) => c.id));
    const remainder = allClubs
      .filter((c) => c.leagueId === leagueId && !existingIds.has(c.id))
      .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
    ranked = [...ranked, ...remainder];
    const picked = ranked.slice(0, count);
    if (
      controlledClubId &&
      clubsById[controlledClubId]?.leagueId === leagueId &&
      !picked.some((c) => c.id === controlledClubId) &&
      picked.length > 0
    ) {
      picked[picked.length - 1] = clubsById[controlledClubId];
    }
    return picked;
  };

  const buildR16Bracket = (
    cupId: import('../types/game').ContinentalCupId,
    participants: Club[],
    kickoffDate: string
  ): Fixture[] => {
    const bracketSize = participants.length >= 16 ? 16 : participants.length >= 8 ? 8 : 0;
    if (bracketSize === 0) return [];
    const stage: 'R16' | 'QF' = bracketSize === 16 ? 'R16' : 'QF';
    const slice = participants.slice(0, bracketSize);
    const out: Fixture[] = [];
    const pairs = Math.floor(slice.length / 2);
    for (let i = 0; i < pairs; i++) {
      const high = slice[i];
      const low = slice[slice.length - 1 - i];
      const home = i % 2 === 0 ? high : low;
      const away = i % 2 === 0 ? low : high;
      out.push({
        id: `fix_${cupId}_${cleanSeason}_${stage}_${i + 1}`,
        competitionId: cupId,
        seasonId,
        matchday: 1,
        kickoffDate,
        homeClubId: home.id,
        awayClubId: away.id,
        status: 'Scheduled',
        uefaStage: stage,
        cupRound: stage,
        tieIndex: i,
      });
    }
    return out;
  };

  const fixtures: Fixture[] = [];

  // 1. AFC Champions League Elite (Top 8 Saudi Pro League + Top 8 J1 League, interleaved for cross-region clashes)
  const ksaTop8 = rankLeagueClubs('KSA_SPL', 8);
  const jpnTop8 = rankLeagueClubs('JPN_J1', 8);
  const afcParticipants: Club[] = [];
  for (let i = 0; i < Math.max(ksaTop8.length, jpnTop8.length); i++) {
    if (ksaTop8[i]) afcParticipants.push(ksaTop8[i]);
    if (jpnTop8[i]) afcParticipants.push(jpnTop8[i]);
  }
  fixtures.push(...buildR16Bracket('AFC_ACL', afcParticipants, `${startYear}-11-12`));

  // 2. CONMEBOL Copa Libertadores (Top 16 Brasileirão Série A)
  const braTop16 = rankLeagueClubs('BRA_SA', 16);
  fixtures.push(...buildR16Bracket('CONMEBOL_LIB', braTop16, `${startYear}-11-19`));

  // 3. CONCACAF Champions Cup (Top 16 Major League Soccer)
  const usaTop16 = rankLeagueClubs('USA_MLS', 16);
  fixtures.push(...buildR16Bracket('CONCACAF_CCC', usaTop16, `${startYear}-11-26`));

  return fixtures;
}

/**
 * Stage 11 Phase 3: Generates 4-team Promotion Playoff Semi-Finals (3rd vs 6th, 4th vs 5th)
 * for a Tier 2/3 division once its regular-season schedule completes.
 */
export function generatePromotionPlayoffFixtures(
  playoffId: import('../types/game').PromotionPlayoffId,
  standingsTable: LeagueStanding[],
  seasonId: string,
  currentGameDate: string
): Fixture[] {
  if (standingsTable.length < 6) return [];
  const startYear = parseInt(seasonId.slice(0, 4), 10) || 2025;
  const endYear = startYear + 1;
  const cleanSeason = seasonId.replace('/', '');

  const third = standingsTable[2].clubId;
  const fourth = standingsTable[3].clubId;
  const fifth = standingsTable[4].clubId;
  const sixth = standingsTable[5].clubId;

  const targetSfDate = `${endYear}-05-20`;
  const sfKickoff = targetSfDate > currentGameDate ? targetSfDate : addDaysISO(currentGameDate, 3);

  return [
    {
      id: `fix_${playoffId}_${cleanSeason}_SF_1`,
      competitionId: playoffId,
      seasonId,
      matchday: 1,
      kickoffDate: sfKickoff,
      homeClubId: third,
      awayClubId: sixth,
      status: 'Scheduled',
      uefaStage: 'SF',
      cupRound: 'SF',
      tieIndex: 0,
    },
    {
      id: `fix_${playoffId}_${cleanSeason}_SF_2`,
      competitionId: playoffId,
      seasonId,
      matchday: 1,
      kickoffDate: sfKickoff,
      homeClubId: fourth,
      awayClubId: fifth,
      status: 'Scheduled',
      uefaStage: 'SF',
      cupRound: 'SF',
      tieIndex: 1,
    },
  ];
}

/**
 * Checkpoint 13: Generates the 8-Nation European / World Nations Cup ('INT_EURO') Quarter-Finals
 * mapping top representative squads for ENG, ESP, GER, ITA, FRA, POR, NED, BEL
 */
export function generateEuropeanNationsCupFixtures(
  seasonId: string,
  endYear: number,
  clubsById: Record<string, Club>
): Fixture[] {
  const nationOrder = ['ENG', 'ESP', 'GER', 'ITA', 'FRA', 'POR', 'NED', 'BEL'];
  const repClubs: string[] = [];
  for (const countryId of nationOrder) {
    const bestInCountry = Object.values(clubsById)
      .filter((c) => c.countryId === countryId)
      .sort((a, b) => b.reputation - a.reputation)[0];
    if (bestInCountry) {
      repClubs.push(bestInCountry.id);
    }
  }
  if (repClubs.length < 8) return [];

  const qfDate = `${endYear}-05-20`;
  const fixtures: Fixture[] = [];
  for (let i = 0; i < 4; i++) {
    fixtures.push({
      id: `fix_INT_EURO_${seasonId.replace('/', '')}_QF_${i + 1}`,
      competitionId: 'INT_EURO',
      seasonId,
      matchday: 1,
      kickoffDate: qfDate,
      homeClubId: repClubs[i],
      awayClubId: repClubs[7 - i],
      status: 'Scheduled',
      uefaStage: 'QF',
      tieIndex: i,
    });
  }
  return fixtures;
}

export function checkAndAdvanceEuroCup(
  allFixtures: Fixture[],
  seasonId: string,
  currentGameDate: string
): Fixture[] {
  const euroFixtures = allFixtures.filter(
    (f) => f.competitionId === 'INT_EURO' && f.seasonId === seasonId
  );
  if (euroFixtures.length === 0) return [];
  if (euroFixtures.some((f) => f.status !== 'Completed')) return [];

  const stages: import('../types/game').UefaStage[] = ['QF', 'SF', 'FINAL'];
  let latestStageIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (euroFixtures.some((f) => f.uefaStage === stages[i])) {
      latestStageIdx = i;
      break;
    }
  }
  if (latestStageIdx < 0 || latestStageIdx >= stages.length - 1) return [];

  const currentStage = stages[latestStageIdx];
  const nextStage = stages[latestStageIdx + 1];
  const currentRoundFixtures = euroFixtures
    .filter((f) => f.uefaStage === currentStage)
    .sort((a, b) => (a.tieIndex ?? 0) - (b.tieIndex ?? 0));

  const winners = currentRoundFixtures
    .map((f) => getDomesticCupFixtureWinnerId(f))
    .filter((id): id is string => Boolean(id));

  if (winners.length < 2) return [];

  const nextKickoff = addDaysISO(currentGameDate, 5);
  const newFixtures: Fixture[] = [];
  const pairCount = Math.floor(winners.length / 2);

  for (let i = 0; i < pairCount; i++) {
    newFixtures.push({
      id: `fix_INT_EURO_${seasonId.replace('/', '')}_${nextStage}_${i + 1}`,
      competitionId: 'INT_EURO',
      seasonId,
      matchday: latestStageIdx + 2,
      kickoffDate: nextKickoff,
      homeClubId: winners[i * 2],
      awayClubId: winners[i * 2 + 1],
      status: 'Scheduled',
      uefaStage: nextStage,
      tieIndex: i,
    });
  }

  return newFixtures;
}


