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
 * Returns top scorers, top assist providers, and highest rated players in a given league
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

  return { topScorers, topAssists, topRated };
}

/**
 * Generates initial Round of 16 knockout fixtures for a Domestic Cup (e.g., FA Cup, Copa del Rey, DFB-Pokal)
 */
export function generateInitialDomesticCupFixtures(
  cupId: import('../types/game').CupId,
  countryClubs: Club[],
  seasonId: string,
  startDate = '2026-10-28'
): Fixture[] {
  const sorted = [...countryClubs].sort((a, b) => b.reputation - a.reputation);
  const participants = sorted.slice(0, 16);
  if (participants.length < 8) return [];

  const fixtures: Fixture[] = [];
  const pairCount = Math.floor(participants.length / 2);
  for (let i = 0; i < pairCount; i++) {
    const home = participants[i];
    const away = participants[participants.length - 1 - i];
    fixtures.push({
      id: `fix_${cupId}_${seasonId}_R16_${i + 1}`,
      competitionId: cupId,
      seasonId,
      matchday: 1,
      kickoffDate: startDate,
      homeClubId: home.id,
      awayClubId: away.id,
      status: 'Scheduled',
      uefaStage: 'R16',
      tieIndex: i,
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
 * Checks if the current round of a Domestic Cup is complete and generates the next round (R16 -> QF -> SF -> FINAL)
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

  const stages: import('../types/game').UefaStage[] = ['R16', 'QF', 'SF', 'FINAL'];
  let latestStageIdx = -1;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (cupFixtures.some((f) => f.uefaStage === stages[i])) {
      latestStageIdx = i;
      break;
    }
  }
  if (latestStageIdx < 0 || latestStageIdx >= stages.length - 1) return [];

  const currentStage = stages[latestStageIdx];
  const nextStage = stages[latestStageIdx + 1];
  const currentRoundFixtures = cupFixtures
    .filter((f) => f.uefaStage === currentStage)
    .sort((a, b) => (a.tieIndex ?? 0) - (b.tieIndex ?? 0));

  const winners = currentRoundFixtures
    .map((f) => getDomesticCupFixtureWinnerId(f))
    .filter((id): id is string => Boolean(id));

  if (winners.length < 2) return [];

  const nextKickoff = addDaysISO(currentGameDate, 28);
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


