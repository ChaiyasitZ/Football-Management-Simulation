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

export interface CupCompetitionMeta {
  id: import('../types/game').CupId | import('../types/game').SuperCupId;
  name: string;
  shortName: string;
  countryId: string;
  countryFlag: string;
  category: 'PRIMARY_CUP' | 'LEAGUE_CUP' | 'SUPER_CUP';
  fotmobLogoUrl: string;
  winnerPrize: number;
  qualifiesFor?: 'UEFA_UEL' | 'UEFA_UECL';
}

export const CUP_COMPETITIONS_META: Record<
  import('../types/game').CupId | import('../types/game').SuperCupId,
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
};

export function getCupRoundPrizeMoney(
  competitionId: string,
  stage: import('../types/game').UefaStage | undefined
): number {
  const meta =
    CUP_COMPETITIONS_META[
      competitionId as import('../types/game').CupId | import('../types/game').SuperCupId
    ];
  const isLeagueCup = String(competitionId).endsWith('_LC');
  const isSuperCup = String(competitionId).endsWith('_SC') || competitionId === 'UEFA_USC';

  if (isSuperCup) {
    return meta?.winnerPrize || 1_500_000;
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
  cupId: import('../types/game').CupId,
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

  const targetDateByStage: Record<'R16' | 'QF' | 'SF' | 'FINAL', string> = isLeagueCup
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

  const fallbackNextDate = addDaysISO(currentGameDate, 28);
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


