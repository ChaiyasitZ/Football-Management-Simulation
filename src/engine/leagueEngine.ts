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
  clubIds: string[]
): LeagueStanding[] {
  return clubIds.map((clubId) => ({
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
    points: 0,
    form: [],
  }));
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
      points: 0,
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
