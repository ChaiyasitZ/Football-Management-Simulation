import {
  Club,
  FinanceTransaction,
  Fixture,
  LeagueId,
  LeagueStanding,
  ManagerProfile,
  MatchResult,
  MatchTeamStats,
  MentoringGroup,
  NewsItem,
  Player,
  PlayerTrait,
  PositionGroup,
  ScoutAssignment,
  ScoutReport,
  SeasonAwardRecord,
  StaffMember,
  TransferOffer,
  TrophyHistoryRecord,
  UefaCompetitionId,
  WorldState,
} from '../types/game';
import {
  auth,
  collection,
  db,
  deleteDoc,
  doc,
  ensureUserProfileInFirestore,
  getDoc,
  getDocs,
  handleFirestoreError,
  OperationType,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '../firebase';
import { LEAGUES_CONFIG, NATIONALITY_POOLS } from './leaguesConfig';
import {
  recomputeLeagueStandings,
  checkAndAdvanceDomesticCup,
  generateInitialDomesticCupFixtures,
  generateLeagueSchedule,
  createInitialStandings,
  getDomesticCupFixtureWinnerId,
} from './leagueEngine';
import { simulateMatch } from './matchEngine';
import { SeededRNG } from './random';
import { autoPickLineup, ROLES_BY_POSITION } from './tacticsEngine';
import {
  checkAndAdvanceUefaKnockoutPhase,
  recomputeUefaStandings,
  UEFA_COMPETITIONS_CONFIG,
} from './uefaEngine';
import {
  calculatePlayerValuation,
  computeCoherentCA,
  createInitialWorldState,
} from './worldGenerator';
import { trText } from '../i18n/LanguageContext';

/**
 * Returns the newest Inbox item that requires a mandatory manager response
 * (e.g., Press Conference or Interactive Manager Decision) before advancing time.
 */
export function getPendingUrgentInboxItem(inbox: NewsItem[]): NewsItem | undefined {
  return inbox.find(
    (item) =>
      Array.isArray(item.pressConferenceOptions) &&
      item.pressConferenceOptions.length > 0 &&
      !item.pressConferenceAnsweredId
  );
}

export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function getAgeAtDate(dob: string, currentDate: string): number {
  const birthYear = parseInt(dob.slice(0, 4), 10);
  const currYear = parseInt(currentDate.slice(0, 4), 10);
  return Math.max(15, currYear - birthYear);
}

export const NATION_YOUTH_RATINGS: Record<string, number> = {
  BRA: 165,
  FRA: 158,
  ESP: 155,
  ARG: 154,
  ENG: 150,
  GER: 149,
  ITA: 144,
  POR: 143,
  NED: 138,
  BEL: 130,
  TUR: 124,
  SCO: 112,
};

export interface ClubStaffBonuses {
  fitnessRecoveryBonus: number;
  injuryPreventionPct: number;
  trainingDevMultiplier: number;
  youthIntakeBonus: number;
  scoutAccuracy: number;
  hoydName: string;
  hoydYouthDev: number;
}

export function getClubStaffBonuses(state: WorldState, clubId: string): ClubStaffBonuses {
  const club = state.clubs[clubId];
  const staffList = Object.values(state.staff).filter((s) => s.clubId === clubId);

  const physios = staffList.filter((s) => s.role === 'Physio' || s.role === 'Fitness Coach');
  const bestPhysio = physios.reduce(
    (max, s) => Math.max(max, s.attributes.medical, s.attributes.fitnessCoaching),
    10
  );

  const coaches = staffList.filter(
    (s) =>
      s.role === 'Assistant Manager' ||
      s.role === 'First Team Coach' ||
      s.role === 'Youth Coach'
  );
  const avgCoach =
    coaches.length > 0
      ? coaches.reduce(
          (sum, s) =>
            sum +
            (s.attributes.coachingTechnical +
              s.attributes.coachingTactical +
              s.attributes.manManagement) /
              3,
          0
        ) / coaches.length
      : 10;

  const scouts = staffList.filter((s) => s.role === 'Scout' || s.role === 'Head Scout');
  const bestScout =
    scouts.length > 0
      ? scouts.reduce(
          (max, s) =>
            Math.max(
              max,
              Math.round((s.attributes.judgingAbility + s.attributes.judgingPotential) / 2)
            ),
          10
        )
      : 10;

  const youthCoaches = staffList.filter(
    (s) => s.role === 'Youth Coach' || s.role === 'Assistant Manager'
  );
  const topHoyd = [...youthCoaches].sort(
    (a, b) =>
      b.attributes.judgingPotential +
      b.attributes.coachingTechnical -
      (a.attributes.judgingPotential + a.attributes.coachingTechnical)
  )[0];
  const hoydYouthDev = topHoyd
    ? Math.round((topHoyd.attributes.judgingPotential + topHoyd.attributes.coachingTechnical) / 2)
    : 12;

  const trainingFac = club?.trainingFacilities || 12;
  const youthFac = club?.youthFacilities || 12;
  const juniorCoach = club?.juniorCoaching || youthFac;
  const youthRec = club?.youthRecruitment || youthFac;

  return {
    fitnessRecoveryBonus: Math.max(0, Math.round((bestPhysio - 10) * 0.4)),
    injuryPreventionPct: Math.min(40, Math.max(0, Math.round((bestPhysio - 8) * 3))),
    trainingDevMultiplier: Number(
      (0.85 + (trainingFac / 20) * 0.35 + (avgCoach / 20) * 0.3).toFixed(2)
    ),
    youthIntakeBonus: Math.round((youthFac + juniorCoach + youthRec + hoydYouthDev) / 4),
    scoutAccuracy: bestScout,
    hoydName: topHoyd ? topHoyd.name : 'Academy Director',
    hoydYouthDev,
  };
}

/**
 * Applies a completed MatchResult to the WorldState atomically:
 * - Marks fixture Completed
 * - Updates Player stats, fitness, morale, and post-match injuries
 * - Recomputes LeagueStandings from source of truth
 * - Logs home ticket revenue transaction
 * - Updates Manager career stats and Board Confidence if user club was involved
 */
export function applyMatchResultToWorld(
  state: WorldState,
  fixtureId: string,
  result: MatchResult
): WorldState {
  const fixtureIdx = state.fixtures.findIndex((f) => f.id === fixtureId);
  if (fixtureIdx === -1) return state;

  const existingFixture = state.fixtures[fixtureIdx];
  // Idempotency guard: never apply a result twice
  if (existingFixture.status === 'Completed') {
    return state;
  }

  const updatedFixtures = [...state.fixtures];
  const completedFixture: Fixture = {
    ...existingFixture,
    status: 'Completed',
    result,
  };
  updatedFixtures[fixtureIdx] = completedFixture;

  const homeClub = { ...state.clubs[existingFixture.homeClubId] };
  const awayClub = { ...state.clubs[existingFixture.awayClubId] };
  const updatedPlayers = { ...state.players };
  const updatedClubs = { ...state.clubs, [homeClub.id]: homeClub, [awayClub.id]: awayClub };
  const updatedTransactions = [...state.transactions];
  const updatedInbox = [...state.inbox];
  let updatedManager = { ...state.manager, careerStats: { ...state.manager.careerStats } };

  const rng = new SeededRNG(state.randomSeed + fixtureIdx * 31);

  // Tally goals & assists from events
  const goalsByPlayer: Record<string, number> = {};
  const assistsByPlayer: Record<string, number> = {};
  const yellowsByPlayer: Record<string, number> = {};
  const redsByPlayer: Record<string, number> = {};

  for (const ev of result.events) {
    if (
      (ev.eventType === 'Goal' || ev.eventType === 'Penalty' || ev.eventType === 'FreeKick') &&
      ev.playerId
    ) {
      goalsByPlayer[ev.playerId] = (goalsByPlayer[ev.playerId] || 0) + 1;
      if (ev.secondaryPlayerId) {
        assistsByPlayer[ev.secondaryPlayerId] = (assistsByPlayer[ev.secondaryPlayerId] || 0) + 1;
      }
    } else if (ev.eventType === 'YellowCard' && ev.playerId) {
      yellowsByPlayer[ev.playerId] = (yellowsByPlayer[ev.playerId] || 0) + 1;
    } else if (ev.eventType === 'RedCard' && ev.playerId) {
      redsByPlayer[ev.playerId] = (redsByPlayer[ev.playerId] || 0) + 1;
    }
  }

  // Update players who participated
  const participatedIds = new Set(Object.keys(result.playerRatings));

  for (const [playerId, rating] of Object.entries(result.playerRatings)) {
    const p = updatedPlayers[playerId];
    if (!p) continue;

    const isHomePlayer = p.clubId === homeClub.id;
    const teamClub = isHomePlayer ? homeClub : awayClub;
    const teamInstructions = teamClub.primaryTactic.instructions;
    const teamWon = isHomePlayer
      ? result.homeGoals > result.awayGoals
      : result.awayGoals > result.homeGoals;
    const teamDrew = result.homeGoals === result.awayGoals;
    const keptCleanSheet = isHomePlayer ? result.awayGoals === 0 : result.homeGoals === 0;

    const prevApps = p.stats.appearances;
    const newApps = prevApps + 1;
    const newAvgRating = Number(
      ((p.stats.averageRating * prevApps + rating) / newApps).toFixed(2)
    );

    const pressExtraDrain =
      teamInstructions.pressingIntensity === 'Very High'
        ? 5
        : teamInstructions.pressingIntensity === 'High'
          ? 3
          : 0;
    const tempoExtraDrain =
      teamInstructions.tempo === 'Much Higher'
        ? 3
        : teamInstructions.tempo === 'Higher'
          ? 2
          : 0;
    const staminaDrain = Math.max(
      6,
      Math.round(15 - p.attributes.physical.stamina * 0.45 + pressExtraDrain + tempoExtraDrain)
    );
    const preMatchFitness = p.fitness;
    const newFitness = Math.max(38, p.fitness - staminaDrain);
    const moraleShift = teamWon ? 4 : teamDrew ? 0 : -4;
    const newMorale = Math.max(25, Math.min(100, p.morale + moraleShift));

    // Muscle injury risk if started with Condition < 70% (1-3 weeks / 7-21 days)
    let injuryStatus = { ...p.injuryStatus };
    const startedLowCondition = preMatchFitness < 70;
    const staffBonus = getClubStaffBonuses(state, p.clubId);
    const rawInjuryChance =
      preMatchFitness < 60
        ? 0.34
        : startedLowCondition
          ? 0.22
          : newFitness < 68
            ? 0.05
            : 0;
    const muscleInjuryChance = rawInjuryChance * (1 - staffBonus.injuryPreventionPct / 100);

    if (!injuryStatus.isInjured && muscleInjuryChance > 0 && rng.chance(muscleInjuryChance)) {
      const days = startedLowCondition ? rng.int(7, 21) : rng.int(5, 16);
      const injType = startedLowCondition
        ? rng.pick([
            trText('Grade 2 Hamstring Strain (Muscle Overload)', 'กล้ามเนื้อแฮมสตริงฉีกขาดจากการฝืนลงสนาม'),
            trText('Calf Muscle Strain (Fatigue Overload)', 'กล้ามเนื้อน่องตึงรุนแรงจากความล้าสะสม'),
            trText('Quadriceps Muscle Tear', 'กล้ามเนื้อต้นขาด้านหน้าบาดเจ็บ'),
          ])
        : rng.pick([
            trText('Tight Hamstring', 'กล้ามเนื้อต้นขาตึง'),
            trText('Sprained Ankle', 'ข้อเท้าแพลง'),
            trText('Impact Bruising', 'ฟกช้ำจากการปะทะ'),
          ]);
      injuryStatus = {
        isInjured: true,
        type: injType,
        daysRemaining: days,
      };
      if (p.clubId === state.controlledClubId) {
        updatedInbox.unshift({
          id: `news_inj_${fixtureId}_${p.id}`,
          gameDate: state.gameDate,
          category: 'Injury',
          title: trText(
            `Medical Report: ${p.firstName} ${p.lastName} ruled out for ${days} days`,
            `รายงานแพทย์: ${p.firstName} ${p.lastName} บาดเจ็บพัก ${days} วัน`
          ),
          body: trText(
            `The ${state.clubs[p.clubId].name} medical staff confirmed that ${p.firstName} ${p.lastName} sustained a ${injType} after playing with ${preMatchFitness}% condition and will be sidelined for ${days} days (approx. ${Math.ceil(days / 7)} weeks).`,
            `ทีมแพทย์ของ ${state.clubs[p.clubId].name} ยืนยันว่า ${p.firstName} ${p.lastName} มีอาการ${injType} หลังจากลงสนามด้วยสภาพความฟิต ${preMatchFitness}% และต้องพักรักษาตัว ${days} วัน (ราว ${Math.ceil(days / 7)} สัปดาห์)`
          ),
          isRead: false,
          relatedClubId: p.clubId,
          relatedPlayerId: p.id,
        });
      }
    }

    const matchYellows = yellowsByPlayer[playerId] || 0;
    const matchReds = redsByPlayer[playerId] || 0;
    const newSeasonYellows = p.stats.yellowCards + matchYellows;
    const newSeasonReds = p.stats.redCards + matchReds;

    // Disciplinary Suspensions: Red Card = 2 matches, every 5th Yellow Card = 1 match
    let addedSuspension = 0;
    if (matchReds > 0) {
      addedSuspension = 2;
    } else if (matchYellows > 0 && newSeasonYellows > 0 && newSeasonYellows % 5 === 0) {
      addedSuspension = 1;
    }

    if (addedSuspension > 0 && p.clubId === state.controlledClubId) {
      updatedInbox.unshift({
        id: `news_susp_${fixtureId}_${p.id}`,
        gameDate: state.gameDate,
        category: 'Player',
        title: trText(
          `Disciplinary Suspension: ${p.firstName} ${p.lastName} banned for ${addedSuspension} match(es)`,
          `ติดโทษแบน: ${p.firstName} ${p.lastName} ถูกแบน ${addedSuspension} นัด`
        ),
        body: trText(
          `${p.firstName} ${p.lastName} has been handed a ${addedSuspension}-match suspension following disciplinary action (${matchReds > 0 ? 'Red Card' : `${newSeasonYellows}th Yellow Card`}).`,
          `${p.firstName} ${p.lastName} ถูกสั่งแบนห้ามลงสนาม ${addedSuspension} นัด เนื่องจาก${matchReds > 0 ? 'ได้รับใบแดง' : `สะสมใบเหลืองครบ ${newSeasonYellows} ใบ`}`
        ),
        isRead: false,
        relatedClubId: p.clubId,
        relatedPlayerId: p.id,
      });
    }

    updatedPlayers[playerId] = {
      ...p,
      fitness: newFitness,
      matchSharpness: Math.min(100, p.matchSharpness + 5),
      morale: newMorale,
      satisfaction: Math.min(100, p.satisfaction + 2),
      consecutiveBenched: 0,
      injuryStatus,
      suspensionMatchesRemaining:
        addedSuspension > 0
          ? (p.suspensionMatchesRemaining || 0) + addedSuspension
          : p.suspensionMatchesRemaining || 0,
      stats: {
        appearances: newApps,
        starts: p.stats.starts + 1,
        goals: p.stats.goals + (goalsByPlayer[playerId] || 0),
        assists: p.stats.assists + (assistsByPlayer[playerId] || 0),
        yellowCards: newSeasonYellows,
        redCards: newSeasonReds,
        cleanSheets:
          p.stats.cleanSheets +
          (keptCleanSheet && (p.positions.includes('GK') || p.positions.includes('DC')) ? 1 : 0),
        minutesPlayed: p.stats.minutesPlayed + 90,
        averageRating: newAvgRating,
        manOfTheMatch:
          p.stats.manOfTheMatch + (result.manOfTheMatchPlayerId === playerId ? 1 : 0),
      },
    };
  }

  // Update non-participating squad players for both clubs (serve suspension, Sharpness decay / Reserves recovery & Squad Hierarchy 3-match drop rule)
  for (const p of Object.values(updatedPlayers)) {
    if (p.clubId !== homeClub.id && p.clubId !== awayClub.id) continue;
    if (participatedIds.has(p.id)) continue;

    // Serve 1 match of suspension if suspended
    if ((p.suspensionMatchesRemaining || 0) > 0) {
      updatedPlayers[p.id] = {
        ...p,
        suspensionMatchesRemaining: Math.max(0, (p.suspensionMatchesRemaining || 0) - 1),
      };
      continue;
    }

    if (p.injuryStatus.isInjured) continue;

    const newConsecutiveBenched = (p.consecutiveBenched || 0) + 1;
    const inReserves = Boolean(p.playInReserves);
    const newSharpness = inReserves
      ? Math.min(94, p.matchSharpness + 5)
      : Math.max(50, p.matchSharpness - 3);
    const newFitness = inReserves ? Math.max(76, p.fitness - 4) : p.fitness;

    let newMorale = p.morale;
    let newSatisfaction = p.satisfaction;
    let newTransferListed = p.transferListed;

    const isKeyHierarchy =
      p.squadStatus === 'Star Player' || p.squadStatus === 'Important Player';

    if (isKeyHierarchy && newConsecutiveBenched >= 3) {
      newMorale = Math.max(20, p.morale - 12);
      newSatisfaction = Math.max(15, p.satisfaction - 15);
      if (newConsecutiveBenched >= 4) {
        newTransferListed = true;
      }

      if (p.clubId === state.controlledClubId) {
        updatedInbox.unshift({
          id: `news_hier_${fixtureId}_${p.id}`,
          gameDate: state.gameDate,
          category: 'Player',
          title: trText(
            `Dressing Room Unrest: ${p.firstName} ${p.lastName} (${p.squadStatus}) unhappy over benching`,
            `นักเตะไม่พอใจ: ${p.firstName} ${p.lastName} (${p.squadStatus}) ไม่พอใจที่ถูกดร็อป ${newConsecutiveBenched} นัดติด`
          ),
          body: trText(
            `${p.firstName} ${p.lastName} holds "${p.squadStatus}" status in the squad hierarchy but has been left out of the starting XI for ${newConsecutiveBenched} consecutive matches despite being fit. His Morale (${newMorale}%) and form have dropped sharply${newConsecutiveBenched >= 4 ? ', and his agent has formally requested a transfer!' : ', and he warns he will request a transfer if he does not start soon.'}`,
            `${p.firstName} ${p.lastName} มีสถานะเป็น "${p.squadStatus}" ของทีม แต่ถูกดร็อปเป็นสำรองติดต่อกัน ${newConsecutiveBenched} นัดทั้งที่สภาพร่างกายสมบูรณ์ ทำให้ขวัญกำลังใจลดลงเหลือ ${newMorale}% ส่งผลกระทบต่อฟอร์มการเล่น${newConsecutiveBenched >= 4 ? ' และได้ยื่นเรื่องขอย้ายทีมอย่างเป็นทางการแล้ว!' : ' และอาจขอย้ายทีมหากยังไม่ได้รับโอกาสลงสนาม'}`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: p.clubId,
          relatedPlayerId: p.id,
        });
      }
    }

    updatedPlayers[p.id] = {
      ...p,
      fitness: newFitness,
      matchSharpness: newSharpness,
      morale: newMorale,
      satisfaction: newSatisfaction,
      transferListed: newTransferListed,
      consecutiveBenched: newConsecutiveBenched,
    };
  }

  // Grow Tactical Familiarity (+4% per match played in current formation)
  for (const c of [homeClub, awayClub]) {
    const newFam = Math.min(100, c.primaryTactic.familiarity + 4);
    c.primaryTactic = {
      ...c.primaryTactic,
      familiarity: newFam,
    };
    c.formationFamiliarity = {
      ...(c.formationFamiliarity || {}),
      [c.primaryTactic.formation]: newFam,
    };
  }

  // Home ticket sales income
  const ticketIncome = Math.round(result.attendance * homeClub.finances.ticketPriceAvg);
  homeClub.finances = {
    ...homeClub.finances,
    balance: homeClub.finances.balance + ticketIncome,
  };
  if (homeClub.id === state.controlledClubId) {
    updatedTransactions.unshift({
      id: `tx_tkt_${fixtureId}`,
      date: state.gameDate,
      clubId: homeClub.id,
      category: 'Ticket Sales',
      amount: ticketIncome,
      description: trText(
        `Home matchday gate receipts vs ${awayClub.name} (${result.attendance.toLocaleString()} attendance)`,
        `รายได้บัตรผ่านประตูเกมเหย้าพบ ${awayClub.name} (${result.attendance.toLocaleString()} คน)`
      ),
      balanceAfter: homeClub.finances.balance,
    });
  }

  // Recompute domestic league or UEFA competition standings
  const leagueId = existingFixture.competitionId as LeagueId;
  const uefaCompId = existingFixture.competitionId as UefaCompetitionId;
  const updatedStandings = { ...state.standings };
  const updatedUefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: state.uefaStandings?.UEFA_UCL || [],
    UEFA_UEL: state.uefaStandings?.UEFA_UEL || [],
    UEFA_UECL: state.uefaStandings?.UEFA_UECL || [],
  };

  if (LEAGUES_CONFIG[leagueId]) {
    const leagueClubIds = Object.values(updatedClubs)
      .filter((c) => c.leagueId === leagueId)
      .map((c) => c.id);
    updatedStandings[leagueId] = recomputeLeagueStandings(
      LEAGUES_CONFIG[leagueId],
      state.currentSeason,
      leagueClubIds,
      updatedFixtures,
      updatedClubs
    );
  } else if (UEFA_COMPETITIONS_CONFIG[uefaCompId]) {
    const uCfg = UEFA_COMPETITIONS_CONFIG[uefaCompId];
    const participantIds =
      state.uefaPots?.[uefaCompId]?.flat() ||
      updatedUefaStandings[uefaCompId].map((s) => s.clubId);
    if (participantIds.length > 0) {
      updatedUefaStandings[uefaCompId] = recomputeUefaStandings(
        uefaCompId,
        state.currentSeason,
        participantIds,
        updatedFixtures,
        updatedClubs
      );
    }

    // UEFA Match Performance Prize Money
    if (result.homeGoals > result.awayGoals) {
      homeClub.finances = {
        ...homeClub.finances,
        balance: homeClub.finances.balance + uCfg.matchWinBonus,
      };
    } else if (result.awayGoals > result.homeGoals) {
      awayClub.finances = {
        ...awayClub.finances,
        balance: awayClub.finances.balance + uCfg.matchWinBonus,
      };
    } else {
      homeClub.finances = {
        ...homeClub.finances,
        balance: homeClub.finances.balance + uCfg.matchDrawBonus,
      };
      awayClub.finances = {
        ...awayClub.finances,
        balance: awayClub.finances.balance + uCfg.matchDrawBonus,
      };
    }
  }

  // If controlled club played, update manager career & inbox match report
  if (
    homeClub.id === state.controlledClubId ||
    awayClub.id === state.controlledClubId
  ) {
    const isHome = homeClub.id === state.controlledClubId;
    const myClub = isHome ? homeClub : awayClub;
    const oppClub = isHome ? awayClub : homeClub;
    const myGoals = isHome ? result.homeGoals : result.awayGoals;
    const oppGoals = isHome ? result.awayGoals : result.homeGoals;

    updatedManager.careerStats.matchesManaged += 1;
    updatedManager.careerStats.goalsFor += myGoals;
    updatedManager.careerStats.goalsAgainst += oppGoals;

    let confDelta = 0;
    if (myGoals > oppGoals) {
      updatedManager.careerStats.won += 1;
      confDelta = 3;
    } else if (myGoals === oppGoals) {
      updatedManager.careerStats.drawn += 1;
      confDelta = 0;
    } else {
      updatedManager.careerStats.lost += 1;
      confDelta = -3;
    }

    myClub.boardExpectations = {
      ...myClub.boardExpectations,
      confidence: {
        ...myClub.boardExpectations.confidence,
        overall: Math.max(15, Math.min(100, myClub.boardExpectations.confidence.overall + confDelta)),
        leaguePerformance: Math.max(
          15,
          Math.min(100, myClub.boardExpectations.confidence.leaguePerformance + confDelta)
        ),
      },
    };

    const motmPlayer = updatedPlayers[result.manOfTheMatchPlayerId];
    const motmName = motmPlayer
      ? `${motmPlayer.firstName} ${motmPlayer.lastName}`
      : trText('Star Performer', 'ผู้เล่นยอดเยี่ยม');

    updatedInbox.unshift({
      id: `news_mrep_${fixtureId}`,
      gameDate: state.gameDate,
      category: 'Match Report',
      title: trText(
        `Post-Match Report: ${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}`,
        `สรุปผลหลังเกม: ${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}`
      ),
      body: trText(
        `Matchday ${existingFixture.matchday} finished ${homeClub.name} ${result.homeGoals}-${result.awayGoals} ${awayClub.name} (xG: ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}, Possession: ${result.homeStats.possession}% - ${result.awayStats.possession}%). Man of the Match: ${motmName}. Please address the post-match press conference below.`,
        `เกมนัดที่ ${existingFixture.matchday} จบลงด้วยสกอร์ ${homeClub.name} ${result.homeGoals}-${result.awayGoals} ${awayClub.name} (xG: ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}, ครองบอล ${result.homeStats.possession}% - ${result.awayStats.possession}%) โดย Man of the Match ได้แก่ ${motmName}`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: myClub.id,
      sourceEventId: fixtureId,
      actionType: 'PressConference',
      pressConferenceOptions: [
        {
          id: 'post_praise',
          label: trText(
            `Praise the squad's commitment and work rate against ${oppClub.shortName}`,
            `ชื่นชมความทุ่มเทของลูกทีมทุกคนในเกมพบ ${oppClub.shortName}`
          ),
          moraleDelta: 3,
          boardDelta: 1,
          mediaResponse: trText(
            'The dressing room is proud that you publicly backed and praised the players in front of the media.',
            'นักเตะในห้องแต่งตัวรู้สึกภูมิใจที่คุณออกโรงปกป้องและชื่นชมทีมต่อหน้าสื่อ'
          ),
        },
        {
          id: 'post_demand',
          label: trText(
            'We still have tactical details to refine ahead of the next fixture',
            'เรายังมีรายละเอียดแท็กติกที่ต้องยกระดับขึ้นอีกในนัดต่อไป'
          ),
          moraleDelta: 0,
          boardDelta: 3,
          mediaResponse: trText(
            'The Board of Directors and media respect your high standards and refusal to become complacent.',
            'บอร์ดบริหารและสื่อมองว่าคุณมีมาตรฐานสูงและไม่ประมาท'
          ),
        },
      ],
    });
  }

  let nextState: WorldState = {
    ...state,
    gameDate:
      existingFixture.kickoffDate > state.gameDate
        ? existingFixture.kickoffDate
        : state.gameDate,
    fixtures: updatedFixtures,
    clubs: updatedClubs,
    players: updatedPlayers,
    standings: updatedStandings,
    uefaStandings: updatedUefaStandings,
    transactions: updatedTransactions,
    inbox: updatedInbox,
    manager: updatedManager,
  };

  if (UEFA_COMPETITIONS_CONFIG[uefaCompId]) {
    nextState = checkAndAdvanceUefaKnockoutPhase(nextState, uefaCompId);
  }

  // Domestic Cup advancement (R16 -> QF -> SF -> FINAL)
  if (String(existingFixture.competitionId).endsWith('_CUP')) {
    const cupId = existingFixture.competitionId as import('../types/game').CupId;
    const newCupFixtures = checkAndAdvanceDomesticCup(
      cupId,
      nextState.fixtures,
      nextState.currentSeason,
      nextState.gameDate
    );
    if (newCupFixtures.length > 0) {
      nextState = {
        ...nextState,
        fixtures: [...nextState.fixtures, ...newCupFixtures],
      };
    } else if (existingFixture.uefaStage === 'FINAL') {
      const winnerId = getDomesticCupFixtureWinnerId(completedFixture);
      if (winnerId && nextState.clubs[winnerId]) {
        const champ = { ...nextState.clubs[winnerId] };
        const prize = 3_500_000;
        champ.finances = {
          ...champ.finances,
          balance: champ.finances.balance + prize,
          transferBudget: champ.finances.transferBudget + Math.round(prize * 0.65),
        };
        nextState = {
          ...nextState,
          clubs: { ...nextState.clubs, [champ.id]: champ },
          inbox: [
            {
              id: `news_cup_win_${cupId}_${nextState.gameDate}`,
              gameDate: nextState.gameDate,
              category: 'Competition',
              title: trText(
                `${champ.name} Crowned ${cupId.replace('_CUP', '')} Domestic Cup Champions!`,
                `${champ.name} ผงาดคว้าแชมป์ฟุตบอลถ้วย ${cupId.replace('_CUP', '')} Cup!`
              ),
              body: trText(
                `${champ.name} have lifted the ${cupId.replace('_CUP', '')} Domestic Cup trophy and received €3.50M in prize money!`,
                `${champ.name} คว้าแชมป์ ${cupId.replace('_CUP', '')} Cup ไปครองได้สำเร็จ พร้อมรับเงินรางวัล €3.50M!`
              ),
              isRead: false,
              isImportant: champ.id === nextState.controlledClubId,
              relatedClubId: champ.id,
            },
            ...nextState.inbox,
          ],
        };
      }
    }
  }

  return nextState;
}

/**
 * Completes the user's fixture AND simulates all other scheduled AI fixtures
 * on the same matchday across all 5 leagues so League Standings are 100% synchronized.
 */
export function completeUserMatchdayAndSyncWorld(
  state: WorldState,
  fixtureId: string,
  userResult: MatchResult
): WorldState {
  let current = applyMatchResultToWorld(state, fixtureId, userResult);
  const targetFix = current.fixtures.find((f) => f.id === fixtureId);
  if (!targetFix) return current;

  const sameMatchdayAiFixtures = current.fixtures.filter(
    (f) =>
      f.status === 'Scheduled' &&
      (f.kickoffDate <= targetFix.kickoffDate || f.matchday === targetFix.matchday) &&
      f.homeClubId !== current.controlledClubId &&
      f.awayClubId !== current.controlledClubId
  );

  for (const aiFix of sameMatchdayAiFixtures) {
    const home = current.clubs[aiFix.homeClubId];
    const away = current.clubs[aiFix.awayClubId];
    if (!home || !away) continue;
    const seed = current.randomSeed + aiFix.matchday * 1009 + aiFix.id.length * 17;
    const aiRes = simulateMatch(aiFix, home, away, current.players, seed);
    current = applyMatchResultToWorld(current, aiFix.id, aiRes);
  }

  return current;
}

/**
 * Advances the World Clock by 1 day atomically.
 * - Guards against duplicate execution for the same date
 * - Recovers player fitness, progresses injuries, and runs weekly training & development
 * - Progresses scout assignments
 * - Simulates all non-user fixtures scheduled on the current date
 */
export function advanceWorldOneDay(state: WorldState): {
  nextState: WorldState;
  stoppedReason?: 'USER_MATCHDAY' | 'TRANSFER_OFFER' | 'URGENT_INBOX';
  userFixture?: Fixture;
  urgentInboxItem?: NewsItem;
} {
  let current = { ...state };
  const rng = new SeededRNG(current.randomSeed + current.processedDates.length * 97);

  // First check if user has an unplayed match TODAY before advancing date
  const todayUserFixture = current.fixtures.find(
    (f) =>
      f.kickoffDate === current.gameDate &&
      f.status === 'Scheduled' &&
      (f.homeClubId === current.controlledClubId || f.awayClubId === current.controlledClubId)
  );

  // Simulate all AI vs AI matches scheduled on `current.gameDate`
  const aiFixturesToday = current.fixtures.filter(
    (f) =>
      f.kickoffDate === current.gameDate &&
      f.status === 'Scheduled' &&
      f.homeClubId !== current.controlledClubId &&
      f.awayClubId !== current.controlledClubId
  );

  for (const fix of aiFixturesToday) {
    const home = current.clubs[fix.homeClubId];
    const away = current.clubs[fix.awayClubId];
    if (!home || !away) continue;
    const matchSeed = current.randomSeed + fix.matchday * 1009 + fix.id.length * 17;
    const res = simulateMatch(fix, home, away, current.players, matchSeed);
    current = applyMatchResultToWorld(current, fix.id, res);
  }

  if (todayUserFixture) {
    return {
      nextState: current,
      stoppedReason: 'USER_MATCHDAY',
      userFixture: todayUserFixture,
    };
  }

  // Advance calendar date by 1 day
  const nextDate = addDaysToDate(current.gameDate, 1);
  if (current.processedDates.includes(nextDate)) {
    return { nextState: current };
  }

  const updatedPlayers = { ...current.players };
  const updatedClubs = { ...current.clubs };
  const updatedInbox = [...current.inbox];
  const updatedTransactions = [...current.transactions];
  const isWeeklyTick = new Date(`${nextDate}T12:00:00Z`).getUTCDay() === 1; // Every Monday

  const userClub = updatedClubs[current.controlledClubId];
  const userStaffBonuses = getClubStaffBonuses(current, current.controlledClubId);
  const recoveryBonus =
    (userClub.trainingFocus === 'Recovery' ? 6 : 0) + userStaffBonuses.fitnessRecoveryBonus;
  const intensityDrain =
    userClub.trainingIntensity === 'Intense' ? -2 : userClub.trainingIntensity === 'Light' ? 2 : 0;

  for (const p of Object.values(updatedPlayers)) {
    const isUserPlayer = p.clubId === current.controlledClubId;
    let fitness = Math.min(
      100,
      p.fitness + 5 + (isUserPlayer ? recoveryBonus + intensityDrain : 2)
    );
    let injuryStatus = { ...p.injuryStatus };

    if (injuryStatus.isInjured) {
      const rem = injuryStatus.daysRemaining - 1;
      if (rem <= 0) {
        injuryStatus = { isInjured: false, daysRemaining: 0 };
        if (isUserPlayer) {
          updatedInbox.unshift({
            id: `news_rec_${nextDate}_${p.id}`,
            gameDate: nextDate,
            category: 'Injury',
            title: trText(
              `${p.firstName} ${p.lastName} returns to full training`,
              `${p.firstName} ${p.lastName} หายเจ็บกลับมาซ้อมเต็มรูปแบบ`
            ),
            body: trText(
              `Good news for ${userClub.name} as ${p.firstName} ${p.lastName} has been cleared by the medical department and is available for selection again.`,
              `ข่าวดีสำหรับ ${userClub.name} เมื่อ ${p.firstName} ${p.lastName} ผ่านความฟิตจากทีมแพทย์และพร้อมกลับมาเป็นตัวเลือกในการจัดทัพ`
            ),
            isRead: false,
            relatedClubId: p.clubId,
            relatedPlayerId: p.id,
          });
        }
      } else {
        injuryStatus.daysRemaining = rem;
      }
    }

    // Weekly training development & Youth Mentoring on Mondays (for both User and AI clubs)
    let attributes = p.attributes;
    let currentAbility = p.currentAbility;
    let developmentHistory = p.developmentHistory;
    let professionalism = p.professionalism;
    let morale = p.morale;

    if (isWeeklyTick && !injuryStatus.isInjured) {
      const age = getAgeAtDate(p.dateOfBirth, nextDate);

      // Weekly Youth Mentoring (if youth player has a senior mentor assigned)
      if (p.mentorId && updatedPlayers[p.mentorId] && age <= 21) {
        const mentor = updatedPlayers[p.mentorId];
        if (mentor.attributes.mental.determination > attributes.mental.determination) {
          attributes = {
            ...attributes,
            mental: {
              ...attributes.mental,
              determination: Math.min(20, attributes.mental.determination + 1),
            },
          };
        }
        if (mentor.professionalism > professionalism) {
          professionalism = Math.min(20, professionalism + 1);
        }
        morale = Math.min(100, morale + 2);
      }

      const baseDevChance =
        age <= 21 ? 0.28 : age <= 25 ? 0.18 : age <= 29 ? 0.08 : 0.02;
      const devChance = isUserPlayer
        ? baseDevChance * userStaffBonuses.trainingDevMultiplier
        : baseDevChance * 0.85;

      if (currentAbility < p.potentialAbility && rng.chance(devChance)) {
        const focus = p.individualTraining.attributeFocus;
        attributes = {
          technical: { ...attributes.technical },
          mental: { ...attributes.mental },
          physical: { ...attributes.physical },
        };

        let changedAttr = 'passing';
        if (focus !== 'Balanced' && focus in attributes.technical) {
          const k = focus as keyof typeof attributes.technical;
          if (attributes.technical[k] < 20) {
            attributes.technical[k] += 1;
            changedAttr = k;
          }
        } else if (focus !== 'Balanced' && focus in attributes.mental) {
          const k = focus as keyof typeof attributes.mental;
          if (attributes.mental[k] < 20) {
            attributes.mental[k] += 1;
            changedAttr = k;
          }
        } else if (focus !== 'Balanced' && focus in attributes.physical) {
          const k = focus as keyof typeof attributes.physical;
          if (attributes.physical[k] < 20) {
            attributes.physical[k] += 1;
            changedAttr = k;
          }
        } else {
          const clubFocus = updatedClubs[p.clubId]?.trainingFocus || 'Attacking';
          if (clubFocus === 'Attacking' && attributes.technical.finishing < 20) {
            attributes.technical.finishing += 1;
            changedAttr = 'finishing';
          } else if (clubFocus === 'Defending' && attributes.technical.tackling < 20) {
            attributes.technical.tackling += 1;
            changedAttr = 'tackling';
          } else if (clubFocus === 'Physical' && attributes.physical.stamina < 20) {
            attributes.physical.stamina += 1;
            changedAttr = 'stamina';
          } else if (attributes.technical.passing < 20) {
            attributes.technical.passing += 1;
            changedAttr = 'passing';
          }
        }

        currentAbility = Math.min(p.potentialAbility, computeCoherentCA(attributes));
        if (isUserPlayer) {
          developmentHistory = [
            ...p.developmentHistory.slice(-11),
            {
              date: nextDate,
              ca: currentAbility,
              keyAttributeChanges: [{ attr: changedAttr, delta: 1 }],
            },
          ];
        }
      }
    }

    const matchSharpness =
      isWeeklyTick && !injuryStatus.isInjured && p.playInReserves
        ? Math.min(94, p.matchSharpness + 4)
        : p.matchSharpness;

    updatedPlayers[p.id] = {
      ...p,
      fitness,
      matchSharpness,
      morale,
      professionalism,
      injuryStatus,
      attributes,
      currentAbility,
      developmentHistory,
    };
  }

  // Weekly wage deduction, AI squad rotation, & Incoming AI Transfer Bids on Mondays
  const updatedTransferOffers = [...current.transferOffers];
  if (isWeeklyTick) {
    const controlled = { ...updatedClubs[current.controlledClubId] };
    const weeklyWages = controlled.finances.wageUsedPerWeek;
    const newBal = controlled.finances.balance - weeklyWages;
    controlled.finances = {
      ...controlled.finances,
      balance: newBal,
    };
    const famGain = controlled.trainingFocus === 'Match Preparation' ? 4 : 2;
    const nextPrimaryFam = Math.min(100, controlled.primaryTactic.familiarity + famGain);
    controlled.primaryTactic = {
      ...controlled.primaryTactic,
      familiarity: nextPrimaryFam,
    };
    controlled.formationFamiliarity = {
      ...(controlled.formationFamiliarity || {}),
      [controlled.primaryTactic.formation]: nextPrimaryFam,
    };
    updatedClubs[controlled.id] = controlled;

    updatedTransactions.unshift({
      id: `tx_wages_${nextDate}`,
      date: nextDate,
      clubId: controlled.id,
      category: 'Player Wages',
      amount: -weeklyWages,
      description: trText(
        `Weekly player and coaching staff wages (${nextDate})`,
        `จ่ายค่าเหนื่อยนักเตะและทีมงานประจำสัปดาห์ (${nextDate})`
      ),
      balanceAfter: newBal,
    });

    // Weekly Mentoring Groups progression (Veteran -> U21 mentees)
    for (const grp of current.mentoringGroups || []) {
      const mentor = updatedPlayers[grp.mentorId];
      if (!mentor || mentor.clubId !== grp.clubId) continue;
      for (const menteeId of grp.menteeIds) {
        const mentee = updatedPlayers[menteeId];
        if (!mentee || mentee.clubId !== grp.clubId) continue;

        let nextDet = mentee.attributes.mental.determination;
        let nextProf = mentee.professionalism;
        if (mentor.attributes.mental.determination > nextDet && rng.chance(0.45)) {
          nextDet = Math.min(20, nextDet + 1);
        }
        if (mentor.professionalism > nextProf && rng.chance(0.45)) {
          nextProf = Math.min(20, nextProf + 1);
        }

        const existingTraits = mentee.traits || [];
        const candidateTrait =
          grp.focusTrait && !existingTraits.includes(grp.focusTrait)
            ? grp.focusTrait
            : (mentor.traits || []).find((t) => !existingTraits.includes(t));

        let nextTraits = existingTraits;
        if (candidateTrait && existingTraits.length < 4 && rng.chance(0.24)) {
          nextTraits = [...existingTraits, candidateTrait];
          updatedInbox.unshift({
            id: `news_mentor_trait_${nextDate}_${mentee.id}`,
            gameDate: nextDate,
            category: 'Staff',
            title: trText(
              `Mentoring Breakthrough: ${mentee.firstName} ${mentee.lastName} Learns "${candidateTrait}" from ${mentor.lastName}!`,
              `Mentoring สำเร็จ: ดาวรุ่ง ${mentee.firstName} ${mentee.lastName} เรียนรู้ทักษะ "${candidateTrait}" จากรุ่นพี่ ${mentor.lastName}!`
            ),
            body: trText(
              `Under the close guidance of senior mentor ${mentor.firstName} ${mentor.lastName}, young prospect ${mentee.firstName} ${mentee.lastName} has mastered the "${candidateTrait}" player trait and improved his Determination (${nextDet}/20).`,
              `จากการติวเข้มของรุ่นพี่ ${mentor.firstName} ${mentor.lastName} ทำให้ดาวรุ่ง ${mentee.firstName} ${mentee.lastName} ซึมซับนิสัยการเล่นเฉพาะตัว "${candidateTrait}" สำเร็จ พร้อมเพิ่มความมุ่งมั่นเป็น (${nextDet}/20)`
            ),
            isRead: false,
            relatedPlayerId: mentee.id,
            relatedClubId: grp.clubId,
          });
        }

        updatedPlayers[mentee.id] = {
          ...mentee,
          professionalism: nextProf,
          traits: nextTraits,
          attributes: {
            ...mentee.attributes,
            mental: {
              ...mentee.attributes.mental,
              determination: nextDet,
            },
          },
        };
      }
    }

    // AI Squad Rotation: Rotate out injured, suspended, or exhausted players in AI Starting XIs
    for (const [cId, aiClub] of Object.entries(updatedClubs)) {
      if (cId === current.controlledClubId) continue;
      const needsRotation = aiClub.primaryTactic.lineup.some((slot) => {
        if (!slot.playerId) return true;
        const pl = updatedPlayers[slot.playerId];
        return (
          !pl ||
          pl.injuryStatus.isInjured ||
          (pl.suspensionMatchesRemaining || 0) > 0 ||
          pl.fitness < 64
        );
      });
      if (needsRotation) {
        const clubSquad = Object.values(updatedPlayers).filter((pl) => pl.clubId === cId);
        if (clubSquad.length >= 11) {
          updatedClubs[cId] = {
            ...aiClub,
            primaryTactic: autoPickLineup(
              aiClub.primaryTactic.formation,
              clubSquad,
              aiClub.primaryTactic.instructions,
              aiClub.primaryTactic.id,
              aiClub.primaryTactic.name
            ),
          };
        }
      }
    }

    // Living World AI: Generate an Incoming Transfer Offer for one of the user's players (~28% base, 3x boost if user has transfer-listed or discounted players)
    const userSquad = Object.values(updatedPlayers).filter(
      (pl) => pl.clubId === controlled.id && !pl.injuryStatus.isInjured
    );
    const hasListedOrDiscounted = userSquad.some(
      (pl) => pl.transferListed || pl.askingPrice <= pl.marketValue
    );
    const bidChance = hasListedOrDiscounted ? Math.min(0.84, 0.28 * 3) : 0.28;
    if (rng.chance(bidChance) && userSquad.length > 16) {
      const listedPool = userSquad.filter(
        (pl) => pl.transferListed || pl.askingPrice <= pl.marketValue
      );
      const targetPool =
        listedPool.length > 0
          ? listedPool
          : userSquad.filter(
              (pl) =>
                pl.transferListed ||
                pl.currentAbility >= 135 ||
                pl.isWonderkid ||
                pl.potentialAbility >= 165
            );
      if (targetPool.length > 0) {
        const targetPlayer = rng.pick(targetPool);
        const aiBuyers = Object.values(updatedClubs).filter(
          (c) =>
            c.id !== controlled.id &&
            c.reputation >= Math.max(55, Math.round(targetPlayer.currentAbility * 0.48)) &&
            c.finances.transferBudget >= Math.max(2_500_000, targetPlayer.marketValue * 0.85)
        );
        if (aiBuyers.length > 0) {
          const buyerClub = rng.pick(aiBuyers);
          const alreadyPending = updatedTransferOffers.some(
            (o) =>
              o.playerId === targetPlayer.id &&
              o.buyingClubId === buyerClub.id &&
              o.status === 'PendingClub'
          );
          if (!alreadyPending) {
            const bidAmount = Math.min(
              buyerClub.finances.transferBudget,
              Math.max(
                1_200_000,
                Math.round(
                  (targetPlayer.marketValue * (targetPlayer.transferListed ? 0.92 : 1.08)) / 100_000
                ) * 100_000
              )
            );
            const incomingOffer: TransferOffer = {
              id: `inc_off_${nextDate}_${targetPlayer.id}_${buyerClub.id}`,
              date: nextDate,
              playerId: targetPlayer.id,
              buyingClubId: buyerClub.id,
              sellingClubId: controlled.id,
              offerType: 'Transfer',
              upfrontFee: bidAmount,
              installmentsFee: 0,
              sellOnPercentage: targetPlayer.potentialAbility >= 168 ? 10 : 0,
              proposedWagePerWeek: Math.round(targetPlayer.wagePerWeek * 1.2),
              proposedContractYears: 4,
              proposedSquadStatus: 'Important Player',
              signingBonus: Math.round(targetPlayer.wagePerWeek * 4),
              agentFee: Math.round(targetPlayer.wagePerWeek * 2),
              status: 'PendingClub',
            };
            updatedTransferOffers.unshift(incomingOffer);
            updatedInbox.unshift({
              id: `news_inc_bid_${nextDate}_${targetPlayer.id}`,
              gameDate: nextDate,
              category: 'Transfer',
              title: trText(
                `Transfer Bid Received: ${buyerClub.name} table €${(bidAmount / 1_000_000).toFixed(2)}M for ${targetPlayer.firstName} ${targetPlayer.lastName}`,
                `ข้อเสนอซื้อตัวขาเข้า: ${buyerClub.name} ยื่น €${(bidAmount / 1_000_000).toFixed(2)}M ขอซื้อ ${targetPlayer.firstName} ${targetPlayer.lastName}`
              ),
              body: trText(
                `${buyerClub.name} have submitted an official transfer offer of €${(bidAmount / 1_000_000).toFixed(2)}M for ${targetPlayer.firstName} ${targetPlayer.lastName}. Open Transfers > Incoming Offers to Accept, Counter (+20%), or Reject.`,
                `${buyerClub.name} ยื่นข้อเสนอขอซื้อตัว ${targetPlayer.firstName} ${targetPlayer.lastName} อย่างเป็นทางการด้วยวงเงิน €${(bidAmount / 1_000_000).toFixed(2)}M ไปที่หน้า ซื้อขายนักเตะ > ข้อเสนอขาเข้า เพื่อตอบรับ ต่อรอง (+20%) หรือปฏิเสธ`
              ),
              isRead: false,
              isImportant: true,
              relatedPlayerId: targetPlayer.id,
              relatedClubId: buyerClub.id,
              actionType: 'GoToTransfer',
            });
          }
        }
      }
    }
  }

  // Progress Scout Assignments
  const updatedScoutReports = { ...current.scoutReports };
  const updatedAssignments: ScoutAssignment[] = current.scoutAssignments.map((asgn) => {
    if (asgn.daysRemaining <= 0) return asgn;
    const rem = asgn.daysRemaining - 1;
    const reportsGenerated = [...asgn.reportsGenerated];

    // Discover a matching player every 2 days
    if (rem % 2 === 0) {
      const candidates = Object.values(updatedPlayers).filter((p) => {
        if (p.clubId === current.controlledClubId) return false;
        if (updatedScoutReports[p.id]) return false;
        const club = updatedClubs[p.clubId];
        if (!club) return false;
        if (asgn.regionOrLeague !== 'ALL_EUROPE' && club.leagueId !== asgn.regionOrLeague) {
          return false;
        }
        const age = getAgeAtDate(p.dateOfBirth, nextDate);
        if (age > asgn.maxAge) return false;
        if (p.askingPrice > asgn.maxBudget) return false;
        if (asgn.positionGroup !== 'ANY') {
          const pos = p.positions[0];
          const group: PositionGroup =
            pos === 'GK'
              ? 'GK'
              : ['DL', 'DR', 'DC', 'WBL', 'WBR'].includes(pos)
                ? 'DEF'
                : ['DM', 'MC', 'ML', 'MR', 'AMC'].includes(pos)
                  ? 'MID'
                  : 'ATT';
          if (group !== asgn.positionGroup) return false;
        }
        return true;
      });

      if (candidates.length > 0) {
        const found = rng.pick(candidates);
        const rep = buildScoutReportForPlayer(found, asgn.scoutId, nextDate);
        updatedScoutReports[found.id] = rep;
        reportsGenerated.push(found.id);

        updatedInbox.unshift({
          id: `news_sct_${nextDate}_${found.id}`,
          gameDate: nextDate,
          category: 'Scout',
          title: trText(
            `Scouting Report: Promising Target Identified — ${found.firstName} ${found.lastName}`,
            `รายงานแมวมอง: พบเป้าหมายน่าสนใจ — ${found.firstName} ${found.lastName}`
          ),
          body: trText(
            `Your scouting network submitted an assessment on ${found.firstName} ${found.lastName} (${found.positions.join('/')}, ${updatedClubs[found.clubId]?.name}) with a recommendation score of ${rep.recommendationScore}/100.`,
            `ทีมแมวมองส่งรายงานการวิเคราะห์ ${found.firstName} ${found.lastName} (${found.positions.join('/')}, ${updatedClubs[found.clubId]?.name}) ประเมินความเหมาะสมอยู่ที่ ${rep.recommendationScore}/100`
          ),
          isRead: false,
          relatedPlayerId: found.id,
          relatedClubId: found.clubId,
        });
      }
    }

    return {
      ...asgn,
      daysRemaining: rem,
      reportsGenerated,
    };
  });

  // Check if the day AFTER nextDate has a user fixture (Pre-Match Press Conference on the eve of key fixtures)
  const dayAfterNext = addDaysToDate(nextDate, 1);
  const eveUserFixture = current.fixtures.find(
    (f) =>
      f.kickoffDate === dayAfterNext &&
      f.status === 'Scheduled' &&
      (f.homeClubId === current.controlledClubId || f.awayClubId === current.controlledClubId)
  );

  let generatedUrgentInbox: NewsItem | undefined;

  if (eveUserFixture && eveUserFixture.matchday % 3 === 1) {
    const oppId =
      eveUserFixture.homeClubId === current.controlledClubId
        ? eveUserFixture.awayClubId
        : eveUserFixture.homeClubId;
    const oppClub = updatedClubs[oppId];
    const prePressId = `news_prepress_${eveUserFixture.id}`;
    if (!updatedInbox.some((n) => n.id === prePressId)) {
      const prePressItem: NewsItem = {
        id: prePressId,
        gameDate: nextDate,
        category: 'Media',
        title: trText(
          `Pre-Match Press Conference: Ahead of ${oppClub?.name || 'Opponent'} Clash (MD ${eveUserFixture.matchday})`,
          `งานแถลงข่าวก่อนเกม: เตรียมพร้อมก่อนดวล ${oppClub?.name || 'คู่แข่ง'} (นัดที่ ${eveUserFixture.matchday})`
        ),
        body: trText(
          `Journalists have gathered at the training ground ahead of tomorrow's Matchday ${eveUserFixture.matchday} fixture against ${oppClub?.name} (${oppClub?.primaryTactic.formation}). How do you want to address the media before tomorrow's kick-off?`,
          `สื่อมวลชนเดินทางมาทำข่าวที่ศูนย์ฝึกซ้อมก่อนเกมนัดที่ ${eveUserFixture.matchday} ที่จะพบกับ ${oppClub?.name} (${oppClub?.primaryTactic.formation}) ในวันพรุ่งนี้ กรุณาเลือกคำตอบเพื่อส่งสัญญาณถึงลูกทีมและสื่อมวลชน`
        ),
        isRead: false,
        isImportant: true,
        relatedClubId: oppId,
        actionType: 'PressConference',
        pressConferenceOptions: [
          {
            id: 'pre_confident',
            label: trText(
              `We have prepared thoroughly and are confident of taking all three points against ${oppClub?.shortName || 'them'}.`,
              `เราซ้อมกันมาอย่างสมบูรณ์แบบและมั่นใจว่าจะเก็บชัยชนะเหนือ ${oppClub?.shortName || 'คู่แข่ง'} ได้`
            ),
            moraleDelta: 3,
            boardDelta: 2,
            mediaResponse: trText(
              'Your confident message energized the squad ahead of matchday.',
              'ความมั่นใจของคุณช่วยปลุกเร้าให้นักเตะในทีมฮึกเหิมก่อนลงสนามวันพรุ่งนี้'
            ),
          },
          {
            id: 'pre_respect',
            label: trText(
              `${oppClub?.name || 'Our opponent'} are a dangerous side, so we must stay tactically disciplined for 90 minutes.`,
              `${oppClub?.name || 'คู่แข่ง'} เป็นทีมที่แข็งแกร่ง เราต้องมีสมาธิและรักษาวินัยแท็กติกตลอด 90 นาที`
            ),
            moraleDelta: 1,
            boardDelta: 3,
            mediaResponse: trText(
              'Pundits and the board praised your tactical focus and respect for the opposition.',
              'สื่อและบอร์ดบริหารชื่นชมความสุขุมและการทำการบ้านด้านแท็กติกของคุณ'
            ),
          },
          {
            id: 'pre_no_pressure',
            label: trText(
              'The pressure is on them — I want my players to go out and express themselves freely.',
              'ความกดดันอยู่ที่ฝั่งคู่แข่ง ผมต้องการให้นักเตะลงไปเล่นอย่างเป็นธรรมชาติโดยไม่ต้องเกร็ง'
            ),
            moraleDelta: 4,
            boardDelta: 1,
            mediaResponse: trText(
              'The players appreciate you taking the media spotlight off their shoulders.',
              'ลูกทีมรู้สึกผ่อนคลายที่คุณช่วยลดความกดดันจากสื่อมวลชนก่อนเกมสำคัญ'
            ),
          },
        ],
      };
      updatedInbox.unshift(prePressItem);
      generatedUrgentInbox = prePressItem;
    }
  }

  // Check if the new date has a user fixture
  const nextDayUserFixture = current.fixtures.find(
    (f) =>
      f.kickoffDate === nextDate &&
      f.status === 'Scheduled' &&
      (f.homeClubId === current.controlledClubId || f.awayClubId === current.controlledClubId)
  );

  if (nextDayUserFixture) {
    const oppId =
      nextDayUserFixture.homeClubId === current.controlledClubId
        ? nextDayUserFixture.awayClubId
        : nextDayUserFixture.homeClubId;
    const oppClub = updatedClubs[oppId];
    const previewId = `news_prev_${nextDayUserFixture.id}`;
    if (!updatedInbox.some((n) => n.id === previewId)) {
      updatedInbox.unshift({
        id: previewId,
        gameDate: nextDate,
        category: 'Match Preview',
        title: trText(
          `Matchday ${nextDayUserFixture.matchday}: Ready to face ${oppClub?.name || 'Opponent'} today!`,
          `Matchday ${nextDayUserFixture.matchday}: พร้อมดวลศึก ${oppClub?.name || 'คู่แข่ง'} วันนี้!`
        ),
        body: trText(
          `Today is Matchday ${nextDayUserFixture.matchday} against ${oppClub?.name} (Opponent Formation: ${oppClub?.primaryTactic.formation}). Check your Starting XI fitness and head to the Match Center for kick-off.`,
          `วันนี้เป็นวันแข่งขันนัดที่ ${nextDayUserFixture.matchday} พบกับ ${oppClub?.name} (แผนคู่แข่ง: ${oppClub?.primaryTactic.formation}) กรุณาตรวจสอบความฟิตของ 11 ตัวจริงและเข้าสู่ Match Center เพื่อทำการแข่งขัน`
        ),
        isRead: false,
        isImportant: true,
        relatedClubId: oppId,
        actionType: 'GoToMatch',
      });
    }
  }

  let nextState: WorldState = {
    ...current,
    gameDate: nextDate,
    processedDates: [...current.processedDates, nextDate],
    players: updatedPlayers,
    clubs: updatedClubs,
    inbox: updatedInbox,
    transactions: updatedTransactions,
    transferOffers: updatedTransferOffers,
    scoutAssignments: updatedAssignments,
    scoutReports: updatedScoutReports,
  };

  if (nextDate.endsWith('-06-01')) {
    nextState = processEndOfSeasonRollover(nextState).nextState;
  }

  return {
    nextState,
    stoppedReason: nextDayUserFixture
      ? 'USER_MATCHDAY'
      : generatedUrgentInbox
        ? 'URGENT_INBOX'
        : undefined,
    userFixture: nextDayUserFixture,
    urgentInboxItem: generatedUrgentInbox,
  };
}

/**
 * Generates a detailed ScoutReport for a specific player
 */
export function buildScoutReportForPlayer(
  player: Player,
  scoutId: string,
  gameDate: string,
  scoutAccuracy = 15
): ScoutReport {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (player.attributes.physical.pace >= 15) {
    strengths.push(
      trText(
        'Exceptional pace and ability to beat defenders on the dribble',
        'ความเร็วและการกระชากหนีคู่แข่งยอดเยี่ยม'
      )
    );
  }
  if (player.attributes.technical.passing >= 15) {
    strengths.push(
      trText(
        'High-precision creative passing and playmaking vision',
        'การจ่ายบอลสร้างสรรค์เกมแม่นยำสูง'
      )
    );
  }
  if (player.attributes.technical.finishing >= 15) {
    strengths.push(
      trText(
        'Clinical finishing inside the penalty box',
        'จบสกอร์ในกรอบเขตโทษเฉียบคม'
      )
    );
  }
  if (player.attributes.technical.tackling >= 15) {
    strengths.push(
      trText(
        'Strong tackling and ball-winning ability',
        'เข้าปะทะและแย่งบอลแข็งแกร่ง'
      )
    );
  }
  if (player.attributes.mental.decisions >= 15) {
    strengths.push(
      trText(
        'Intelligent decision-making in key moments',
        'ตัดสินใจในจังหวะสำคัญได้ฉลาด'
      )
    );
  }
  if (strengths.length === 0) {
    strengths.push(
      trText(
        'Well-balanced core attributes and strong tactical discipline',
        'มีสมดุลค่าพลังพื้นฐานที่ดีและเล่นตามแท็กติกได้'
      )
    );
  }

  if (player.attributes.physical.stamina <= 10) {
    weaknesses.push(
      trText(
        'Stamina over a full 90 minutes still needs improvement',
        'ความอึดในการยืนระยะ 90 นาทียังต้องพัฒนา'
      )
    );
  }
  if (player.attributes.mental.composure <= 10) {
    weaknesses.push(
      trText(
        'Can lose composure when pressed aggressively',
        'อาจตื่นสนามเมื่อถูกบีบพื้นที่เร็ว'
      )
    );
  }
  if (player.attributes.physical.strength <= 10) {
    weaknesses.push(
      trText(
        'Can be outmuscled in physical duels against stronger opponents',
        'เสียเปรียบในการปะทะกับคู่แข่งรูปร่างใหญ่'
      )
    );
  }
  if (weaknesses.length === 0) {
    weaknesses.push(
      trText(
        'No glaring weaknesses for top-flight competition',
        'ไม่มีจุดอ่อนร้ายแรงในการเล่นระดับลีกสูงสุด'
      )
    );
  }

  const recScore = Math.min(99, Math.max(48, Math.round(player.currentAbility * 0.52 + (player.potentialAbility - player.currentAbility) * 0.35)));
  const spread = Math.max(2, 20 - scoutAccuracy);

  return {
    id: `srep_${player.id}`,
    playerId: player.id,
    scoutId,
    date: gameDate,
    confidence: Math.min(99, 65 + scoutAccuracy * 2),
    caEstimate: [Math.max(50, player.currentAbility - spread), Math.min(200, player.currentAbility + spread)],
    paEstimate: [Math.max(60, player.potentialAbility - spread - 2), Math.min(200, player.potentialAbility + spread + 2)],
    strengths,
    weaknesses,
    bestRole: player.preferredRole,
    estimatedFee: [Math.round(player.marketValue * 0.9), Math.round(player.askingPrice * 1.05)],
    estimatedWage: [Math.round(player.wagePerWeek * 0.95), Math.round(player.wagePerWeek * 1.25)],
    injuryRisk: player.attributes.physical.naturalFitness >= 14 ? 'Low' : player.attributes.physical.naturalFitness >= 11 ? 'Moderate' : 'High',
    recommendationScore: recScore,
  };
}

/**
 * Evaluates and executes a Transfer or Loan Offer from the user's club to an AI club,
 * including Club valuation check + Player/Agent contract check + atomic squad & budget update.
 */
export function submitAndEvaluateTransferOffer(
  state: WorldState,
  params: {
    playerId: string;
    offerType: 'Transfer' | 'Loan';
    upfrontFee: number;
    installmentsFee: number;
    sellOnPercentage: number;
    proposedWagePerWeek: number;
    proposedContractYears: number;
    proposedSquadStatus: Player['squadStatus'];
    signingBonus: number;
  }
): { nextState: WorldState; outcome: 'COMPLETED' | 'COUNTERED' | 'REJECTED'; message: string } {
  const player = state.players[params.playerId];
  if (!player) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('Player not found in database.', 'ไม่พบข้อมูลนักเตะในฐานข้อมูล'),
    };
  }

  const buyingClub = { ...state.clubs[state.controlledClubId] };
  const sellingClub = { ...state.clubs[player.clubId] };

  if (buyingClub.id === sellingClub.id) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('This player is already at your club.', 'นักเตะรายนี้อยู่ในสโมสรของคุณอยู่แล้ว'),
    };
  }

  if (
    buyingClub.transferEmbargoUntil &&
    buyingClub.transferEmbargoUntil >= state.gameDate
  ) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `Transfer Embargo Active: Board takeover talks prohibit incoming signings until ${buyingClub.transferEmbargoUntil}.`,
        `สโมสรติดโทษแบน/ระงับการซื้อขายชั่วคราวระหว่างเจรจาเทคโอเวอร์จนถึงวันที่ ${buyingClub.transferEmbargoUntil}`
      ),
    };
  }

  const totalCostUpfront = params.upfrontFee + params.signingBonus;
  if (totalCostUpfront > buyingClub.finances.transferBudget) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `Insufficient transfer budget (Requires €${(totalCostUpfront / 1_000_000).toFixed(2)}M, Available €${(buyingClub.finances.transferBudget / 1_000_000).toFixed(2)}M).`,
        `งบซื้อขายไม่เพียงพอ (ต้องการ €${(totalCostUpfront / 1_000_000).toFixed(2)}M แต่มีงบ €${(buyingClub.finances.transferBudget / 1_000_000).toFixed(2)}M)`
      ),
    };
  }

  // Evaluate Club valuation
  const effectiveOfferValue =
    params.upfrontFee +
    params.installmentsFee * 0.85 +
    (params.sellOnPercentage / 100) * player.marketValue * 0.5;

  const requiredValue =
    params.offerType === 'Loan'
      ? Math.round(player.wagePerWeek * 10)
      : player.releaseClause && params.upfrontFee >= player.releaseClause
        ? player.releaseClause
        : Math.round(player.askingPrice * 0.92);

  const offerId = `off_${Date.now()}_${player.id}`;
  const agentFee = Math.round(params.proposedWagePerWeek * 2.5);

  if (effectiveOfferValue < requiredValue * 0.78) {
    const rejectedOffer: TransferOffer = {
      id: offerId,
      date: state.gameDate,
      playerId: player.id,
      buyingClubId: buyingClub.id,
      sellingClubId: sellingClub.id,
      offerType: params.offerType,
      upfrontFee: params.upfrontFee,
      installmentsFee: params.installmentsFee,
      sellOnPercentage: params.sellOnPercentage,
      proposedWagePerWeek: params.proposedWagePerWeek,
      proposedContractYears: params.proposedContractYears,
      proposedSquadStatus: params.proposedSquadStatus,
      signingBonus: params.signingBonus,
      agentFee,
      status: 'Rejected',
      rejectionReason: trText(
        `Offer is well below ${sellingClub.name}'s valuation (€${(requiredValue / 1_000_000).toFixed(1)}M).`,
        `ข้อเสนอต่ำกว่ามูลค่าที่ ${sellingClub.name} ตั้งไว้ (€${(requiredValue / 1_000_000).toFixed(1)}M)`
      ),
    };

    return {
      nextState: {
        ...state,
        transferOffers: [rejectedOffer, ...state.transferOffers],
      },
      outcome: 'REJECTED',
      message: trText(
        `${sellingClub.name} rejected the offer as it falls below their valuation (€${(requiredValue / 1_000_000).toFixed(1)}M).`,
        `${sellingClub.name} ปฏิเสธข้อเสนอเนื่องจากต่ำกว่าราคาประเมิน (€${(requiredValue / 1_000_000).toFixed(1)}M)`
      ),
    };
  }

  if (effectiveOfferValue < requiredValue) {
    const counterOffer: TransferOffer = {
      id: offerId,
      date: state.gameDate,
      playerId: player.id,
      buyingClubId: buyingClub.id,
      sellingClubId: sellingClub.id,
      offerType: params.offerType,
      upfrontFee: params.upfrontFee,
      installmentsFee: params.installmentsFee,
      sellOnPercentage: params.sellOnPercentage,
      proposedWagePerWeek: params.proposedWagePerWeek,
      proposedContractYears: params.proposedContractYears,
      proposedSquadStatus: params.proposedSquadStatus,
      signingBonus: params.signingBonus,
      agentFee,
      status: 'CounterOffer',
      counterAmount: requiredValue,
    };

    return {
      nextState: {
        ...state,
        transferOffers: [counterOffer, ...state.transferOffers],
      },
      outcome: 'COUNTERED',
      message: trText(
        `${sellingClub.name} submitted a counter-offer of €${(requiredValue / 1_000_000).toFixed(2)}M.`,
        `${sellingClub.name} ยื่นข้อเสนอต่อรองที่ €${(requiredValue / 1_000_000).toFixed(2)}M`
      ),
    };
  }

  // Check Player Wage expectation
  const minWageAccepted = Math.round(player.wagePerWeek * 0.92);
  if (params.proposedWagePerWeek < minWageAccepted) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `${player.firstName} ${player.lastName}'s agent rejected the contract terms (Minimum wage demanded: €${minWageAccepted.toLocaleString()}/wk).`,
        `เอเยนต์ของ ${player.firstName} ${player.lastName} ปฏิเสธสัญญาเนื่องจากค่าเหนื่อยต่ำกว่า €${minWageAccepted.toLocaleString()}/สัปดาห์`
      ),
    };
  }

  // Complete Transfer Atomically!
  const totalDeducted = params.upfrontFee + params.signingBonus + agentFee;
  buyingClub.finances = {
    ...buyingClub.finances,
    balance: buyingClub.finances.balance - totalDeducted,
    transferBudget: buyingClub.finances.transferBudget - totalDeducted,
    wageUsedPerWeek: buyingClub.finances.wageUsedPerWeek + params.proposedWagePerWeek,
  };

  sellingClub.finances = {
    ...sellingClub.finances,
    balance: sellingClub.finances.balance + params.upfrontFee,
    transferBudget: sellingClub.finances.transferBudget + Math.round(params.upfrontFee * 0.8),
    wageUsedPerWeek: Math.max(0, sellingClub.finances.wageUsedPerWeek - player.wagePerWeek),
  };

  const endYear = parseInt(state.gameDate.slice(0, 4), 10) + params.proposedContractYears;
  const updatedPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    loanedFromClubId: params.offerType === 'Loan' ? sellingClub.id : null,
    wagePerWeek: params.proposedWagePerWeek,
    contractEndDate: `${endYear}-06-30`,
    squadStatus: params.proposedSquadStatus,
    morale: Math.min(100, player.morale + 8),
    transferListed: false,
    loanListed: false,
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: sellingClub.id,
        toClubId: buyingClub.id,
        fee: params.upfrontFee + params.installmentsFee,
        type: params.offerType,
      },
      ...player.transferHistory,
    ],
  };

  const updatedPlayers = {
    ...state.players,
    [updatedPlayer.id]: updatedPlayer,
  };

  // Re-pick selling club lineup so it never keeps a transferred player in its XI
  const sellingClubPlayers = Object.values(updatedPlayers).filter((p) => p.clubId === sellingClub.id);
  sellingClub.primaryTactic = autoPickLineup(
    sellingClub.primaryTactic.formation,
    sellingClubPlayers,
    sellingClub.primaryTactic.instructions,
    sellingClub.primaryTactic.id,
    sellingClub.primaryTactic.name
  );

  // Add new player to buying club bench if space available
  if (
    !buyingClub.primaryTactic.lineup.some((s) => s.playerId === updatedPlayer.id) &&
    !buyingClub.primaryTactic.benchPlayerIds.includes(updatedPlayer.id) &&
    buyingClub.primaryTactic.benchPlayerIds.length < 9
  ) {
    buyingClub.primaryTactic = {
      ...buyingClub.primaryTactic,
      benchPlayerIds: [...buyingClub.primaryTactic.benchPlayerIds, updatedPlayer.id],
    };
  }

  const completedOffer: TransferOffer = {
    id: offerId,
    date: state.gameDate,
    playerId: player.id,
    buyingClubId: buyingClub.id,
    sellingClubId: sellingClub.id,
    offerType: params.offerType,
    upfrontFee: params.upfrontFee,
    installmentsFee: params.installmentsFee,
    sellOnPercentage: params.sellOnPercentage,
    proposedWagePerWeek: params.proposedWagePerWeek,
    proposedContractYears: params.proposedContractYears,
    proposedSquadStatus: params.proposedSquadStatus,
    signingBonus: params.signingBonus,
    agentFee,
    status: 'Completed',
  };

  const tx: FinanceTransaction = {
    id: `tx_trf_${offerId}`,
    date: state.gameDate,
    clubId: buyingClub.id,
    category: 'Player Purchase',
    amount: -totalDeducted,
    description: trText(
      `Signed ${player.firstName} ${player.lastName} from ${sellingClub.name} (${params.offerType === 'Loan' ? 'Loan' : 'Permanent'})`,
      `คว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name} (${params.offerType === 'Loan' ? 'ยืมตัว' : 'ซื้อขาด'})`
    ),
    balanceAfter: buyingClub.finances.balance,
  };

  const news: NewsItem = {
    id: `news_trf_${offerId}`,
    gameDate: state.gameDate,
    category: 'Transfer',
    title: trText(
      `OFFICIAL: ${buyingClub.name} complete signing of ${player.firstName} ${player.lastName}!`,
      `OFFICIAL: ${buyingClub.name} คว้าตัว ${player.firstName} ${player.lastName} ร่วมทัพ!`
    ),
    body: trText(
      `${buyingClub.name} have completed the signing of ${player.firstName} ${player.lastName} from ${sellingClub.name} for a total package of €${((params.upfrontFee + params.installmentsFee) / 1_000_000).toFixed(2)}M on a contract until ${endYear} worth €${params.proposedWagePerWeek.toLocaleString()}/wk.`,
      `${buyingClub.name} บรรลุข้อตกลงคว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name} ด้วยมูลค่ารวม €${((params.upfrontFee + params.installmentsFee) / 1_000_000).toFixed(2)}M พร้อมสัญญาถึงปี ${endYear} รับค่าเหนื่อย €${params.proposedWagePerWeek.toLocaleString()}/สัปดาห์`
    ),
    isRead: false,
    isImportant: true,
    relatedClubId: buyingClub.id,
    relatedPlayerId: player.id,
  };

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      clubs: {
        ...state.clubs,
        [buyingClub.id]: buyingClub,
        [sellingClub.id]: sellingClub,
      },
      transferOffers: [completedOffer, ...state.transferOffers],
      transactions: [tx, ...state.transactions],
      inbox: [news, ...state.inbox],
    },
    outcome: 'COMPLETED',
    message: trText(
      `Successfully signed ${player.firstName} ${player.lastName} for ${buyingClub.name}!`,
      `คว้าตัว ${player.firstName} ${player.lastName} ร่วมทีม ${buyingClub.name} สำเร็จ!`
    ),
  };
}

/**
 * Renews an existing squad player's contract atomically
 */
export function renewPlayerContract(
  state: WorldState,
  playerId: string,
  newWagePerWeek: number,
  years: number,
  signingBonus: number
): { nextState: WorldState; success: boolean; message: string } {
  const player = state.players[playerId];
  if (!player || player.clubId !== state.controlledClubId) {
    return {
      nextState: state,
      success: false,
      message: trText('Player not found at your club.', 'ไม่พบนักเตะในสโมสรของคุณ'),
    };
  }

  const club = { ...state.clubs[state.controlledClubId] };
  const minExpected = Math.round(player.wagePerWeek * 0.95);
  if (newWagePerWeek < minExpected) {
    return {
      nextState: state,
      success: false,
      message: trText(
        `${player.lastName}'s agent demands at least €${minExpected.toLocaleString()}/wk.`,
        `เอเยนต์ของ ${player.lastName} ต้องการค่าเหนื่อยอย่างน้อย €${minExpected.toLocaleString()}/สัปดาห์`
      ),
    };
  }

  const endYear = parseInt(state.gameDate.slice(0, 4), 10) + years;
  const wageDiff = newWagePerWeek - player.wagePerWeek;

  club.finances = {
    ...club.finances,
    balance: club.finances.balance - signingBonus,
    transferBudget: Math.max(0, club.finances.transferBudget - signingBonus),
    wageUsedPerWeek: club.finances.wageUsedPerWeek + wageDiff,
  };

  const updatedPlayer: Player = {
    ...player,
    wagePerWeek: newWagePerWeek,
    contractEndDate: `${endYear}-06-30`,
    morale: Math.min(100, player.morale + 6),
    satisfaction: Math.min(100, player.satisfaction + 10),
  };

  const tx: FinanceTransaction = {
    id: `tx_ren_${Date.now()}_${player.id}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Signing & Agent Fee',
    amount: -signingBonus,
    description: trText(
      `Contract extension signing bonus for ${player.firstName} ${player.lastName} until ${endYear}`,
      `โบนัสต่อสัญญาฉบับใหม่ของ ${player.firstName} ${player.lastName} ถึงปี ${endYear}`
    ),
    balanceAfter: club.finances.balance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      players: { ...state.players, [player.id]: updatedPlayer },
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_ren_${Date.now()}_${player.id}`,
          gameDate: state.gameDate,
          category: 'Player',
          title: trText(
            `${player.firstName} ${player.lastName} extends contract with ${club.name} until ${endYear}`,
            `${player.firstName} ${player.lastName} ขยายสัญญากับ ${club.name} ถึงปี ${endYear}`
          ),
          body: trText(
            `${player.firstName} ${player.lastName} has signed a new contract extension with the club worth €${newWagePerWeek.toLocaleString()}/wk.`,
            `${player.firstName} ${player.lastName} จรดปากกาต่อสัญญาฉบับใหม่กับสโมสร รับค่าเหนื่อย €${newWagePerWeek.toLocaleString()}/สัปดาห์`
          ),
          isRead: false,
          relatedPlayerId: player.id,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: trText(
      `Extended ${player.firstName} ${player.lastName}'s contract until ${endYear}!`,
      `ต่อสัญญา ${player.firstName} ${player.lastName} ถึงปี ${endYear} สำเร็จ!`
    ),
  };
}

/**
 * Generates a new Youth Academy prospect for the controlled club
 */
export function recruitYouthAcademyProspect(state: WorldState): WorldState {
  const club = state.clubs[state.controlledClubId];
  const rng = new SeededRNG(Date.now());
  const pool = NATIONALITY_POOLS[club.countryId] || NATIONALITY_POOLS.ENG;

  const firstName = rng.pick(pool.firstNames);
  const lastName = rng.pick(pool.lastNames);
  const pos = rng.pick(['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'AMC', 'AML', 'AMR', 'ST'] as const);
  const id = `plr_youth_${Date.now()}`;

  const ca = rng.int(88, 118);
  const pa = rng.int(142, 188);
  const { marketValue, wagePerWeek } = calculatePlayerValuation(ca, pa, 17, club.reputation);
  const preferredRole = rng.pick(ROLES_BY_POSITION[pos]);

  const base = Math.round(ca / 10);
  const newPlayer: Player = {
    id,
    firstName,
    lastName,
    dateOfBirth: '2009-04-12',
    nationality: club.countryId,
    nationalityCode: club.countryId,
    heightCm: rng.int(173, 190),
    weightKg: rng.int(65, 80),
    preferredFoot: rng.chance(0.75) ? 'Right' : 'Left',
    positions: [pos],
    preferredRole,
    currentAbility: ca,
    potentialAbility: pa,
    potentialRange: [pa - 10, Math.min(200, pa + 8)],
    attributes: {
      technical: {
        finishing: base + rng.int(-2, 3), firstTouch: base + rng.int(0, 3), passing: base + rng.int(0, 3),
        technique: base + rng.int(1, 4), dribbling: base + rng.int(0, 3), crossing: base + rng.int(-1, 2),
        heading: base + rng.int(-2, 2), tackling: base + rng.int(-2, 2), marking: base + rng.int(-2, 2),
        longShots: base, penaltyTaking: base, freeKickTaking: base, corners: base, ballControl: base + 2,
      },
      mental: {
        decisions: base + 1, vision: base + 2, composure: base + 1, concentration: base,
        positioning: base, anticipation: base + 1, workRate: base + 3, teamwork: base + 2,
        leadership: 10, determination: rng.int(14, 19), aggression: 11, flair: rng.int(12, 18),
        offTheBall: base + 2, bravery: 12, consistency: base + 1,
      },
      physical: {
        acceleration: base + 3, pace: base + 3, stamina: base + 1, strength: base - 1,
        agility: base + 3, balance: base + 2, jumpingReach: base, naturalFitness: 16,
      },
    },
    fitness: 98,
    matchSharpness: 86,
    morale: 92,
    tacticalFamiliarity: 80,
    squadStatus: 'Youth',
    satisfaction: 95,
    personality: 'Ambitious',
    professionalism: 16,
    clubId: club.id,
    loanedFromClubId: null,
    wagePerWeek: Math.min(4500, wagePerWeek),
    contractEndDate: '2029-06-30',
    goalBonus: 500,
    marketValue,
    askingPrice: Math.round(marketValue * 1.4),
    transferListed: false,
    loanListed: false,
    injuryStatus: { isInjured: false, daysRemaining: 0 },
    individualTraining: { attributeFocus: 'Balanced', roleFocus: preferredRole, intensity: 'Medium' },
    stats: {
      appearances: 0, starts: 0, goals: 0, assists: 0, yellowCards: 0,
      redCards: 0, cleanSheets: 0, minutesPlayed: 0, averageRating: 6.8, manOfTheMatch: 0,
    },
    developmentHistory: [{ date: state.gameDate, ca, keyAttributeChanges: [] }],
    transferHistory: [],
    isYouthAcademy: true,
  };

  return {
    ...state,
    players: { ...state.players, [id]: newPlayer },
    inbox: [
      {
        id: `news_yth_${id}`,
        gameDate: state.gameDate,
        category: 'Staff',
        title: trText(
          `Youth Academy High-Potential Prospect: ${firstName} ${lastName} (${pos})`,
          `อคาเดมีดันดาวรุ่งพรสวรรค์สูง: ${firstName} ${lastName} (${pos})`
        ),
        body: trText(
          `The Head of Youth Development at ${club.name} reports the emergence of 17-year-old prospect ${firstName} ${lastName} (${pos}) with potential rated up to ${Math.round(pa / 10)}/20.`,
          `หัวหน้าศูนย์ฝึกเยาวชนของ ${club.name} รายงานการค้นพบดาวรุ่งวัย 17 ปี ${firstName} ${lastName} (${pos}) ที่มีศักยภาพสูงถึงระดับ ${Math.round(pa / 10)}/20`
        ),
        isRead: false,
        relatedPlayerId: id,
        relatedClubId: club.id,
      },
      ...state.inbox,
    ],
  };
}

/**
 * Hires a free-agent StaffMember for the controlled club
 */
export function hireStaffMember(
  state: WorldState,
  staffId: string
): { nextState: WorldState; success: boolean; message: string } {
  const member = state.staff[staffId];
  if (!member || member.clubId !== null) {
    return {
      nextState: state,
      success: false,
      message: trText('This staff member is already employed.', 'ทีมงานรายนี้มีสังกัดอยู่แล้ว'),
    };
  }

  const club = { ...state.clubs[state.controlledClubId] };
  const signingFee = member.wagePerWeek * 4;
  if (club.finances.balance < signingFee) {
    return {
      nextState: state,
      success: false,
      message: trText('Insufficient club balance.', 'งบประมาณสโมสรไม่เพียงพอ'),
    };
  }

  club.finances = {
    ...club.finances,
    balance: club.finances.balance - signingFee,
    wageUsedPerWeek: club.finances.wageUsedPerWeek + member.wagePerWeek,
  };

  const updatedMember: StaffMember = {
    ...member,
    clubId: club.id,
  };

  const tx: FinanceTransaction = {
    id: `tx_stf_${Date.now()}_${staffId}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Staff Wages',
    amount: -signingFee,
    description: trText(
      `Appointed ${member.name} as ${member.role}`,
      `แต่งตั้ง ${member.name} เข้ารับตำแหน่ง ${member.role}`
    ),
    balanceAfter: club.finances.balance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      staff: { ...state.staff, [staffId]: updatedMember },
      transactions: [tx, ...state.transactions],
    },
    success: true,
    message: trText(
      `Successfully appointed ${member.name} (${member.role}) to the coaching staff!`,
      `แต่งตั้ง ${member.name} (${member.role}) เข้าสู่ทีมงานสโมสรสำเร็จ!`
    ),
  };
}

export function upgradeJuniorOrRecruitmentFacility(
  state: WorldState,
  facilityType: 'juniorCoaching' | 'youthRecruitment' | 'trainingFacilities' | 'youthFacilities'
): { nextState: WorldState; success: boolean; message: string } {
  const club = { ...state.clubs[state.controlledClubId] };
  const currentLevel =
    facilityType === 'trainingFacilities'
      ? club.trainingFacilities
      : facilityType === 'youthFacilities'
        ? club.youthFacilities
        : facilityType === 'juniorCoaching'
          ? club.juniorCoaching || club.youthFacilities
          : club.youthRecruitment || club.youthFacilities;

  if (currentLevel >= 20) {
    return {
      nextState: state,
      success: false,
      message: trText(
        'Already at world-class maximum level (20/20).',
        'อยู่ในระดับสูงสุดของโลกแล้ว (20/20)'
      ),
    };
  }

  const upgradeCost = currentLevel * 650_000;
  if (club.finances.balance < upgradeCost) {
    return {
      nextState: state,
      success: false,
      message: trText(
        `Insufficient club balance (€${(upgradeCost / 1_000_000).toFixed(2)}M required).`,
        `งบประมาณสโมสรไม่เพียงพอ (ต้องการ €${(upgradeCost / 1_000_000).toFixed(2)}M)`
      ),
    };
  }

  const nextLevel = currentLevel + 1;
  if (facilityType === 'trainingFacilities') {
    club.trainingFacilities = nextLevel;
  } else if (facilityType === 'youthFacilities') {
    club.youthFacilities = nextLevel;
  } else if (facilityType === 'juniorCoaching') {
    club.juniorCoaching = nextLevel;
  } else {
    club.youthRecruitment = nextLevel;
  }
  club.finances = {
    ...club.finances,
    balance: club.finances.balance - upgradeCost,
  };

  const labelEn =
    facilityType === 'trainingFacilities'
      ? 'Training Facilities'
      : facilityType === 'youthFacilities'
        ? 'Youth Facilities'
        : facilityType === 'juniorCoaching'
          ? 'Junior Coaching'
          : 'Youth Recruitment Network';
  const labelTh =
    facilityType === 'trainingFacilities'
      ? 'ศูนย์ฝึกซ้อม (Training Facilities)'
      : facilityType === 'youthFacilities'
        ? 'ศูนย์ฝึกเยาวชน (Youth Facilities)'
        : facilityType === 'juniorCoaching'
          ? 'การฝึกสอนเยาวชน (Junior Coaching)'
          : 'เครือข่ายสรรหาเยาวชน (Youth Recruitment)';

  const tx: FinanceTransaction = {
    id: `tx_fac_${facilityType}_${Date.now()}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Facilities & Maintenance',
    amount: -upgradeCost,
    description: trText(
      `Upgraded ${labelEn} to Level ${nextLevel}/20`,
      `อัปเกรด ${labelTh} สู่ระดับ ${nextLevel}/20`
    ),
    balanceAfter: club.finances.balance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      transactions: [tx, ...state.transactions],
    },
    success: true,
    message: trText(
      `${labelEn} upgraded to ${nextLevel}/20!`,
      `อัปเกรด ${labelTh} เป็นระดับ ${nextLevel}/20 สำเร็จ!`
    ),
  };
}

export function assignYouthMentor(
  state: WorldState,
  youthPlayerId: string,
  mentorPlayerId: string | null
): { nextState: WorldState; success: boolean; message: string } {
  const youth = state.players[youthPlayerId];
  if (!youth) {
    return { nextState: state, success: false, message: 'Player not found.' };
  }
  const mentor = mentorPlayerId ? state.players[mentorPlayerId] : null;
  const updatedYouth: Player = {
    ...youth,
    mentorId: mentor ? mentor.id : null,
  };
  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [youth.id]: updatedYouth,
      },
    },
    success: true,
    message: mentor
      ? trText(
          `Assigned ${mentor.firstName} ${mentor.lastName} as senior mentor to ${youth.firstName} ${youth.lastName}.`,
          `มอบหมายให้ ${mentor.firstName} ${mentor.lastName} เป็นรุ่นพี่พี่เลี้ยงของ ${youth.firstName} ${youth.lastName} เรียบร้อยแล้ว`
        )
      : trText(
          `Removed mentor assignment for ${youth.firstName} ${youth.lastName}.`,
          `ยกเลิกการจับคู่พี่เลี้ยงของ ${youth.firstName} ${youth.lastName} แล้ว`
        ),
  };
}

export function promoteYouthProspectToSenior(
  state: WorldState,
  playerId: string
): { nextState: WorldState; success: boolean; message: string } {
  const player = state.players[playerId];
  if (!player) {
    return { nextState: state, success: false, message: 'Player not found.' };
  }
  const updatedPlayer: Player = {
    ...player,
    youthSquad: 'senior',
    contractType: 'professional',
    squadStatus: player.currentAbility >= 125 ? 'Squad Player' : 'Breakthrough Prospect',
    isYouthAcademy: false,
    morale: Math.min(100, player.morale + 6),
  };
  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [playerId]: updatedPlayer,
      },
    },
    success: true,
    message: trText(
      `Promoted ${player.firstName} ${player.lastName} to the First-Team Squad on a professional contract!`,
      `ดัน ${player.firstName} ${player.lastName} ขึ้นสู่ทีมชุดใหญ่พร้อมสัญญาอาชีพเรียบร้อยแล้ว!`
    ),
  };
}

export function releaseYouthProspect(
  state: WorldState,
  playerId: string
): { nextState: WorldState; success: boolean; message: string } {
  const player = state.players[playerId];
  const club = state.clubs[state.controlledClubId];
  if (!player || !club || player.clubId !== club.id) {
    return { nextState: state, success: false, message: 'Prospect not found in your club.' };
  }

  const updatedPlayers = { ...state.players };
  delete updatedPlayers[playerId];

  const updatedClub: Club = {
    ...club,
    finances: {
      ...club.finances,
      wageUsedPerWeek: Math.max(0, club.finances.wageUsedPerWeek - player.wagePerWeek),
    },
  };

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      clubs: { ...state.clubs, [club.id]: updatedClub },
    },
    success: true,
    message: trText(
      `Released ${player.firstName} ${player.lastName} from the Youth Academy.`,
      `ปล่อยตัว ${player.firstName} ${player.lastName} ออกจากอคาเดมีเยาวชนเรียบร้อยแล้ว`
    ),
  };
}

export function generateAnnualYouthIntake(
  state: WorldState,
  targetClubId?: string
): { nextState: WorldState; newProspects: Player[]; message: string } {
  const clubId = targetClubId || state.controlledClubId;
  const club = state.clubs[clubId];
  if (!club) {
    return { nextState: state, newProspects: [], message: 'Club not found.' };
  }

  const bonuses = getClubStaffBonuses(state, clubId);
  const nationRating = NATION_YOUTH_RATINGS[club.countryId] || 135;
  const youthRec = club.youthRecruitment || club.youthFacilities || 14;
  const juniorCoach = club.juniorCoaching || club.youthFacilities || 14;
  const youthFac = club.youthFacilities || 14;
  const hoydSkill = bonuses.hoydYouthDev;

  const pool = NATIONALITY_POOLS[club.countryId] || NATIONALITY_POOLS.ENG;
  const positions: import('../types/game').PositionCode[] = [
    'GK',
    'DC',
    'DL',
    'DR',
    'DM',
    'MC',
    'AMC',
    'AML',
    'AMR',
    'ST',
  ];

  const curYear = parseInt(state.gameDate.slice(0, 4), 10);
  const updatedPlayers = { ...state.players };
  const newProspects: Player[] = [];

  for (let i = 0; i < 4; i++) {
    const seedVal = Date.now() + i * 97 + club.reputation;
    const rng = new SeededRNG(seedVal);
    const pos = positions[(seedVal + i * 2) % positions.length];
    const firstName = rng.pick(pool.firstNames);
    const lastName = rng.pick(pool.lastNames);

    // Golden Generation / Elite Talent roll
    const goldenBonus = (seedVal + i * 13) % 9 === 0 ? 15 : 0;

    // PA formula: Nation Youth Rating + Youth Recruitment + Youth Facilities + HoYD + Golden Roll
    const rawPa = Math.round(
      95 +
        (nationRating / 200) * 32 +
        (youthRec / 20) * 22 +
        (youthFac / 20) * 14 +
        (hoydSkill / 20) * 10 +
        goldenBonus +
        rng.int(-4, 7)
    );
    const pa = Math.max(128, Math.min(196, rawPa));

    // Starting CA formula: Junior Coaching + Youth Facilities + HoYD
    const rawCa = Math.round(
      76 +
        (juniorCoach / 20) * 20 +
        (youthFac / 20) * 10 +
        (hoydSkill / 20) * 6 +
        rng.int(0, 7)
    );
    const ca = Math.max(82, Math.min(Math.min(124, pa - 20), rawCa));
    const isWonderkid = pa >= 170;
    const base = Math.max(8, Math.min(15, Math.round(ca / 9.4)));
    const preferredRole = rng.pick(ROLES_BY_POSITION[pos]);
    const { marketValue, wagePerWeek } = calculatePlayerValuation(ca, pa, 16, club.reputation);

    const newId = `yth_intake_${club.id}_${curYear}_${i}_${seedVal % 10000}`;
    const prospect: Player = {
      id: newId,
      firstName,
      lastName,
      dateOfBirth: `${curYear - (16 + (i % 2))}-0${(i % 8) + 1}-15`,
      nationality: club.countryId,
      nationalityCode: club.countryId,
      heightCm: rng.int(172, 191),
      weightKg: rng.int(64, 81),
      preferredFoot: i % 4 === 0 ? 'Left' : 'Right',
      positions: [pos],
      preferredRole,
      currentAbility: ca,
      potentialAbility: pa,
      potentialRange: [Math.max(100, pa - 10), Math.min(200, pa + 8)],
      attributes: {
        technical: {
          finishing: pos === 'ST' || pos === 'AMR' || pos === 'AML' ? base + 3 : base - 1,
          firstTouch: base + 2,
          passing: pos === 'MC' || pos === 'AMC' || pos === 'DM' ? base + 3 : base + 1,
          technique: base + 2,
          dribbling: pos === 'AML' || pos === 'AMR' || pos === 'AMC' ? base + 3 : base + 1,
          crossing: base + 1,
          heading: pos === 'DC' || pos === 'ST' ? base + 2 : base - 1,
          tackling: pos === 'DC' || pos === 'DM' || pos === 'DL' || pos === 'DR' ? base + 3 : base - 2,
          marking: pos === 'DC' || pos === 'DM' ? base + 2 : base - 2,
          longShots: base,
          penaltyTaking: base,
          freeKickTaking: base,
          corners: base,
          ballControl: base + 2,
        },
        mental: {
          decisions: base + 1,
          vision: base + 2,
          composure: base + 1,
          concentration: base,
          positioning: base + 1,
          anticipation: base + 1,
          workRate: base + 3,
          teamwork: base + 2,
          leadership: 10,
          determination: Math.min(20, 12 + Math.round(hoydSkill / 3) + rng.int(0, 3)),
          aggression: 11,
          flair: rng.int(12, 18),
          offTheBall: base + 2,
          bravery: 12,
          consistency: base + 1,
        },
        physical: {
          acceleration: Math.min(20, base + 3),
          pace: Math.min(20, base + 3),
          stamina: base + 1,
          strength: base - 1,
          agility: base + 3,
          balance: base + 2,
          jumpingReach: base,
          naturalFitness: 16,
        },
      },
      fitness: 98,
      matchSharpness: 86,
      morale: 92,
      tacticalFamiliarity: 80,
      squadStatus: 'Youth',
      satisfaction: 95,
      personality: isWonderkid ? 'Model Citizen' : 'Ambitious',
      professionalism: Math.min(20, 12 + Math.round(hoydSkill / 3)),
      clubId: club.id,
      loanedFromClubId: null,
      wagePerWeek: Math.min(3500, wagePerWeek),
      contractEndDate: `${curYear + 3}-06-30`,
      goalBonus: 400,
      marketValue,
      askingPrice: Math.round(marketValue * 1.45),
      transferListed: false,
      loanListed: false,
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
      developmentHistory: [{ date: state.gameDate, ca, keyAttributeChanges: [] }],
      transferHistory: [],
      isYouthAcademy: true,
      youthSquad: 'u18',
      contractType: 'youth',
      isWonderkid,
      mentorId: null,
    };

    updatedPlayers[newId] = prospect;
    newProspects.push(prospect);
  }

  const bestProspect = [...newProspects].sort((a, b) => b.potentialAbility - a.potentialAbility)[0];
  const nextInbox = [...state.inbox];
  if (club.id === state.controlledClubId && bestProspect) {
    nextInbox.unshift({
      id: `news_intake_${state.gameDate}_${club.id}_${Date.now()}`,
      gameDate: state.gameDate,
      category: 'Staff',
      title: trText(
        `Youth Intake Class Arrives: ${bestProspect.firstName} ${bestProspect.lastName} (PA ${bestProspect.potentialAbility}) Headlines New Crop!`,
        `เด็กปั้นรุ่นใหม่เข้าสู่อคาเดมี: ${bestProspect.firstName} ${bestProspect.lastName} (PA ${bestProspect.potentialAbility}) นำทัพดาวรุ่ง!`
      ),
      body: trText(
        `Head of Youth Development ${bonuses.hoydName} has unveiled ${newProspects.length} new U18 academy scholars led by ${bestProspect.firstName} ${bestProspect.lastName} (${bestProspect.positions[0]}, CA ${bestProspect.currentAbility} / PA ${bestProspect.potentialAbility}).`,
        `หัวหน้าฝ่ายพัฒนาเยาวชน ${bonuses.hoydName} เปิดตัวนักเตะเยาวชน U18 รุ่นใหม่จำนวน ${newProspects.length} คน นำโดย ${bestProspect.firstName} ${bestProspect.lastName} (${bestProspect.positions[0]}, CA ${bestProspect.currentAbility} / PA ${bestProspect.potentialAbility})`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: club.id,
      relatedPlayerId: bestProspect.id,
    });
  }

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      inbox: nextInbox,
    },
    newProspects,
    message: trText(
      `Generated ${newProspects.length} new Youth Intake prospects led by ${bestProspect?.firstName} ${bestProspect?.lastName} (PA ${bestProspect?.potentialAbility})!`,
      `สร้างนักเตะเยาวชนเข้าสู่อคาเดมีใหม่ ${newProspects.length} คน นำโดย ${bestProspect?.firstName} ${bestProspect?.lastName} (PA ${bestProspect?.potentialAbility})!`
    ),
  };
}

export function respondToIncomingTransferOffer(
  state: WorldState,
  offerId: string,
  action: 'ACCEPT' | 'COUNTER' | 'REJECT'
): { nextState: WorldState; success: boolean; message: string } {
  const offerIndex = state.transferOffers.findIndex((o) => o.id === offerId);
  if (offerIndex === -1) {
    return { nextState: state, success: false, message: 'Transfer offer not found.' };
  }

  const offer = state.transferOffers[offerIndex];
  const player = state.players[offer.playerId];
  const buyingClub = state.clubs[offer.buyingClubId];
  const sellingClub = state.clubs[offer.sellingClubId];

  if (!player || !buyingClub || !sellingClub) {
    return { nextState: state, success: false, message: 'Invalid clubs or player in offer.' };
  }

  const nextOffers = [...state.transferOffers];
  const nextInbox = [...state.inbox];
  const nextTransactions = [...state.transactions];

  if (action === 'REJECT') {
    nextOffers[offerIndex] = {
      ...offer,
      status: 'Rejected',
      rejectionReason: trText(
        `You rejected ${buyingClub.name}'s €${(offer.upfrontFee / 1_000_000).toFixed(2)}M bid for ${player.firstName} ${player.lastName}.`,
        `คุณปฏิเสธข้อเสนอ €${(offer.upfrontFee / 1_000_000).toFixed(2)}M จาก ${buyingClub.name} สำหรับ ${player.firstName} ${player.lastName}`
      ),
    };
    return {
      nextState: { ...state, transferOffers: nextOffers },
      success: true,
      message: trText(
        `Rejected ${buyingClub.name}'s bid for ${player.firstName} ${player.lastName}.`,
        `ปฏิเสธข้อเสนอของ ${buyingClub.name} สำหรับ ${player.firstName} ${player.lastName} เรียบร้อยแล้ว`
      ),
    };
  }

  let finalFee = offer.upfrontFee;
  if (action === 'COUNTER') {
    const counterFee = Math.round((offer.upfrontFee * 1.2) / 100_000) * 100_000;
    if (buyingClub.finances.transferBudget < counterFee) {
      nextOffers[offerIndex] = {
        ...offer,
        status: 'Rejected',
        rejectionReason: trText(
          `${buyingClub.name} withdrew from negotiations after refusing your €${(counterFee / 1_000_000).toFixed(2)}M counter-demand.`,
          `${buyingClub.name} ถอนตัวจากการเจรจาหลังไม่สู้ราคาต่อรอง €${(counterFee / 1_000_000).toFixed(2)}M ของคุณ`
        ),
      };
      return {
        nextState: { ...state, transferOffers: nextOffers },
        success: false,
        message: trText(
          `${buyingClub.name} refused your +20% counter-offer (€${(counterFee / 1_000_000).toFixed(2)}M) and walked away.`,
          `${buyingClub.name} ปฏิเสธข้อเสนอต่อรอง +20% (€${(counterFee / 1_000_000).toFixed(2)}M) และยุติการเจรจา`
        ),
      };
    }
    finalFee = counterFee;
  }

  // Execute Sale
  const updatedSellingClub: Club = {
    ...sellingClub,
    finances: {
      ...sellingClub.finances,
      balance: sellingClub.finances.balance + finalFee,
      transferBudget: sellingClub.finances.transferBudget + Math.round(finalFee * 0.85),
      wageUsedPerWeek: Math.max(0, sellingClub.finances.wageUsedPerWeek - player.wagePerWeek),
    },
    primaryTactic: {
      ...sellingClub.primaryTactic,
      lineup: sellingClub.primaryTactic.lineup.map((s) =>
        s.playerId === player.id ? { ...s, playerId: null } : s
      ),
      benchPlayerIds: sellingClub.primaryTactic.benchPlayerIds.filter((pid) => pid !== player.id),
    },
  };

  const updatedBuyingClub: Club = {
    ...buyingClub,
    finances: {
      ...buyingClub.finances,
      balance: buyingClub.finances.balance - finalFee,
      transferBudget: Math.max(0, buyingClub.finances.transferBudget - finalFee),
      wageUsedPerWeek: buyingClub.finances.wageUsedPerWeek + offer.proposedWagePerWeek,
    },
  };

  const updatedPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    wagePerWeek: offer.proposedWagePerWeek,
    squadStatus: offer.proposedSquadStatus,
    transferListed: false,
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: sellingClub.id,
        toClubId: buyingClub.id,
        fee: finalFee,
        type: 'Transfer',
      },
      ...player.transferHistory,
    ],
  };

  nextOffers[offerIndex] = {
    ...offer,
    upfrontFee: finalFee,
    status: 'Completed',
  };

  nextTransactions.unshift({
    id: `tx_sale_${Date.now()}_${player.id}`,
    date: state.gameDate,
    clubId: sellingClub.id,
    category: 'Player Sale',
    amount: finalFee,
    description: trText(
      `Player Sale: ${player.firstName} ${player.lastName} to ${buyingClub.name}`,
      `ขายนักเตะ: ${player.firstName} ${player.lastName} ไปยัง ${buyingClub.name}`
    ),
    balanceAfter: updatedSellingClub.finances.balance,
  });

  nextInbox.unshift({
    id: `news_sale_done_${Date.now()}_${player.id}`,
    gameDate: state.gameDate,
    category: 'Transfer',
    title: trText(
      `Transfer Completed: ${player.firstName} ${player.lastName} Joins ${buyingClub.name} (€${(finalFee / 1_000_000).toFixed(2)}M)`,
      `ดีลเสร็จสมบูรณ์: ${player.firstName} ${player.lastName} ย้ายร่วมทัพ ${buyingClub.name} (€${(finalFee / 1_000_000).toFixed(2)}M)`
    ),
    body: trText(
      `${player.firstName} ${player.lastName} has completed a permanent transfer to ${buyingClub.name} for €${(finalFee / 1_000_000).toFixed(2)}M. 85% of the fee has been added to your transfer budget.`,
      `${player.firstName} ${player.lastName} ย้ายไปร่วมทีม ${buyingClub.name} อย่างเป็นทางการด้วยค่าตัว €${(finalFee / 1_000_000).toFixed(2)}M โดย 85% ของค่าตัวถูกเติมเข้าสู่งบประมาณเสริมทัพของคุณแล้ว`
    ),
    isRead: false,
    relatedPlayerId: player.id,
    relatedClubId: buyingClub.id,
  });

  return {
    nextState: {
      ...state,
      players: { ...state.players, [player.id]: updatedPlayer },
      clubs: {
        ...state.clubs,
        [sellingClub.id]: updatedSellingClub,
        [buyingClub.id]: updatedBuyingClub,
      },
      transferOffers: nextOffers,
      transactions: nextTransactions,
      inbox: nextInbox,
    },
    success: true,
    message: trText(
      `Sold ${player.firstName} ${player.lastName} to ${buyingClub.name} for €${(finalFee / 1_000_000).toFixed(2)}M!`,
      `ตกลงขาย ${player.firstName} ${player.lastName} ให้แก่ ${buyingClub.name} ในราคา €${(finalFee / 1_000_000).toFixed(2)}M สำเร็จ!`
    ),
  };
}

export function adjustClubBudgetAllocation(
  state: WorldState,
  transferSharePct: number
): { nextState: WorldState; success: boolean; message: string } {
  const club = state.clubs[state.controlledClubId];
  if (!club) return { nextState: state, success: false, message: 'Club not found.' };

  const clampedPct = Math.max(10, Math.min(90, transferSharePct));
  const annualSurplusWage = Math.max(
    0,
    (club.finances.wageBudgetPerWeek - club.finances.wageUsedPerWeek) * 52
  );
  const totalPool = club.finances.transferBudget + annualSurplusWage;

  const newTransferBudget = Math.round((totalPool * clampedPct) / 100);
  const remainingPoolForWages = Math.max(0, totalPool - newTransferBudget);
  const newWageBudgetPerWeek =
    club.finances.wageUsedPerWeek + Math.round(remainingPoolForWages / 52);

  const updatedClub: Club = {
    ...club,
    finances: {
      ...club.finances,
      transferBudget: newTransferBudget,
      wageBudgetPerWeek: newWageBudgetPerWeek,
    },
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: updatedClub },
    },
    success: true,
    message: trText(
      `Updated budget split: Transfer Budget €${(newTransferBudget / 1_000_000).toFixed(2)}M | Wage Budget €${newWageBudgetPerWeek.toLocaleString()}/wk`,
      `ปรับสัดส่วนงบประมาณสำเร็จ: งบซื้อตัว €${(newTransferBudget / 1_000_000).toFixed(2)}M | เพดานค่าเหนื่อย €${newWageBudgetPerWeek.toLocaleString()}/สัปดาห์`
    ),
  };
}

export function processEndOfSeasonRollover(
  state: WorldState
): { nextState: WorldState; message: string } {
  const curYear = parseInt(state.currentSeason.slice(0, 4), 10) || 2026;
  const nextYear = curYear + 1;
  const nextSeasonStr = `${nextYear}/${String(nextYear + 1).slice(-2)}`;

  const updatedClubs = { ...state.clubs };
  const updatedPlayers = { ...state.players };
  const nextInbox = [...state.inbox];
  const nextTransactions = [...state.transactions];

  // 1. Award League Prize Money + TV Revenue + Sugar Daddy Owner Injection
  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    table.forEach((row, idx) => {
      const club = updatedClubs[row.clubId];
      if (!club) return;
      const positionPrize = Math.max(
        1_500_000,
        (20 - idx) * (league.tier === 2 ? 650_000 : 2_200_000)
      );
      const tvMoney = league.tvRevenuePerClub || 15_000_000;
      const sugarDaddyInjection =
        club.sugarDaddyType === 'FRONT_END'
          ? 35_000_000
          : club.sugarDaddyType === 'BACK_END'
            ? 18_000_000
            : club.sugarDaddyType === 'UNDERWRITER' && club.finances.balance < 0
              ? Math.abs(club.finances.balance) + 10_000_000
              : 0;

      const totalAdded = positionPrize + tvMoney + sugarDaddyInjection;
      updatedClubs[club.id] = {
        ...club,
        finances: {
          ...club.finances,
          balance: club.finances.balance + totalAdded,
          transferBudget:
            club.finances.transferBudget +
            Math.round(positionPrize * 0.55 + sugarDaddyInjection * 0.8),
        },
      };

      if (club.id === state.controlledClubId) {
        nextTransactions.unshift({
          id: `tx_eos_${nextYear}_${club.id}`,
          date: state.gameDate,
          clubId: club.id,
          category: 'Prize Money',
          amount: totalAdded,
          description: trText(
            `End of Season Payout: Finish #${idx + 1} Prize + TV Revenue${sugarDaddyInjection > 0 ? ' + Owner Investment' : ''}`,
            `เงินรางวัลจบฤดูกาล: อันดับ #${idx + 1} + ค่าลิขสิทธิ์ถ่ายทอดสด${sugarDaddyInjection > 0 ? ' + เงินอัดฉีดเจ้าของสโมสร' : ''}`
          ),
          balanceAfter: updatedClubs[club.id].finances.balance,
        });
      }
    });
  }

  // 1b. Record Season Champions into Trophy Cabinet (trophyHistory) & Compute Annual Awards Gala (Ballon d'Or, Golden Boot, Golden Boy)
  const nextTrophyHistory: TrophyHistoryRecord[] = [...(state.trophyHistory || [])];
  let updatedManager = { ...state.manager };

  for (const league of Object.values(LEAGUES_CONFIG)) {
    if (league.tier === 2) continue;
    const table = state.standings[league.id] || [];
    if (table[0]) {
      const winnerClub = updatedClubs[table[0].clubId];
      const runnerUpClub = table[1] ? updatedClubs[table[1].clubId] : undefined;
      if (winnerClub) {
        nextTrophyHistory.unshift({
          id: `trp_${state.currentSeason.replace('/', '')}_${league.id}`,
          season: state.currentSeason,
          competitionId: league.id,
          competitionName: league.name,
          winnerClubId: winnerClub.id,
          winnerClubName: winnerClub.name,
          runnerUpClubId: runnerUpClub?.id,
          runnerUpClubName: runnerUpClub?.name,
        });
        if (winnerClub.id === state.controlledClubId) {
          updatedManager = {
            ...updatedManager,
            reputation: Math.min(99, updatedManager.reputation + 5),
            careerStats: {
              ...updatedManager.careerStats,
              trophies: [
                {
                  season: state.currentSeason,
                  competitionName: league.name,
                  clubName: winnerClub.name,
                },
                ...updatedManager.careerStats.trophies,
              ],
            },
          };
        }
      }
    }
  }

  // Check UEFA Champions League Final or Top of Swiss Standings
  const uclFinal = state.fixtures.find(
    (f) => f.competitionId === 'UEFA_UCL' && f.uefaStage === 'FINAL' && f.status === 'Completed' && f.result
  );
  const uclTable = state.uefaStandings?.UEFA_UCL || [];
  const uclWinnerId = uclFinal
    ? getDomesticCupFixtureWinnerId(uclFinal)
    : uclTable[0]?.clubId || 'club_esp_ll_1';
  const uclRunnerUpId = uclFinal
    ? uclFinal.homeClubId === uclWinnerId
      ? uclFinal.awayClubId
      : uclFinal.homeClubId
    : uclTable[1]?.clubId || 'club_eng_pl_2';
  const uclWinnerClub = uclWinnerId ? updatedClubs[uclWinnerId] : undefined;
  const uclRunnerUpClub = uclRunnerUpId ? updatedClubs[uclRunnerUpId] : undefined;
  if (uclWinnerClub) {
    nextTrophyHistory.unshift({
      id: `trp_${state.currentSeason.replace('/', '')}_UEFA_UCL`,
      season: state.currentSeason,
      competitionId: 'UEFA_UCL',
      competitionName: 'UEFA Champions League',
      winnerClubId: uclWinnerClub.id,
      winnerClubName: uclWinnerClub.name,
      runnerUpClubId: uclRunnerUpClub?.id,
      runnerUpClubName: uclRunnerUpClub?.name,
    });
  }

  // Compute Annual Awards Gala (Ballon d'Or, European Golden Boot, European Golden Boy, Manager of the Season)
  const allPlayersArr = Object.values(updatedPlayers);
  const ballonDorWinner =
    [...allPlayersArr].sort((a, b) => {
      const scoreA =
        a.stats.goals * 2.4 +
        a.stats.assists * 1.6 +
        (a.stats.averageRating || 6.8) * 10 +
        a.currentAbility * 0.35;
      const scoreB =
        b.stats.goals * 2.4 +
        b.stats.assists * 1.6 +
        (b.stats.averageRating || 6.8) * 10 +
        b.currentAbility * 0.35;
      return scoreB - scoreA;
    })[0] || allPlayersArr[0];

  const goldenBootWinner =
    [...allPlayersArr].sort((a, b) => {
      if (b.stats.goals !== a.stats.goals) return b.stats.goals - a.stats.goals;
      return b.currentAbility - a.currentAbility;
    })[0] || allPlayersArr[0];

  const u21Players = allPlayersArr.filter(
    (p) => getAgeAtDate(p.dateOfBirth, `${curYear}-06-30`) <= 21
  );
  const goldenBoyWinner =
    [...(u21Players.length > 0 ? u21Players : allPlayersArr)].sort((a, b) => {
      const scoreA =
        a.stats.goals * 2.0 +
        a.stats.assists * 1.5 +
        (a.stats.averageRating || 6.8) * 8 +
        a.currentAbility * 0.4;
      const scoreB =
        b.stats.goals * 2.0 +
        b.stats.assists * 1.5 +
        (b.stats.averageRating || 6.8) * 8 +
        b.currentAbility * 0.4;
      return scoreB - scoreA;
    })[0] || allPlayersArr[0];

  const awardClub = uclWinnerClub || updatedClubs[state.controlledClubId];
  const managerOfSeasonName =
    awardClub?.id === state.controlledClubId
      ? updatedManager.name
      : awardClub?.aiManager.name || updatedManager.name;

  const newAwardRecord: SeasonAwardRecord = {
    season: state.currentSeason,
    ballonDor: {
      playerId: ballonDorWinner.id,
      playerName: `${ballonDorWinner.firstName} ${ballonDorWinner.lastName}`,
      clubId: ballonDorWinner.clubId,
      clubName: updatedClubs[ballonDorWinner.clubId]?.name || 'Club',
      goals: Math.max(18, ballonDorWinner.stats.goals),
      assists: Math.max(8, ballonDorWinner.stats.assists),
      averageRating: Number(Math.max(7.65, ballonDorWinner.stats.averageRating || 7.92).toFixed(2)),
    },
    goldenBoot: {
      playerId: goldenBootWinner.id,
      playerName: `${goldenBootWinner.firstName} ${goldenBootWinner.lastName}`,
      clubId: goldenBootWinner.clubId,
      clubName: updatedClubs[goldenBootWinner.clubId]?.name || 'Club',
      goals: Math.max(24, goldenBootWinner.stats.goals),
    },
    goldenBoy: {
      playerId: goldenBoyWinner.id,
      playerName: `${goldenBoyWinner.firstName} ${goldenBoyWinner.lastName}`,
      clubId: goldenBoyWinner.clubId,
      clubName: updatedClubs[goldenBoyWinner.clubId]?.name || 'Club',
      age: getAgeAtDate(goldenBoyWinner.dateOfBirth, `${curYear}-06-30`),
      ca: goldenBoyWinner.currentAbility,
      averageRating: Number(Math.max(7.35, goldenBoyWinner.stats.averageRating || 7.58).toFixed(2)),
    },
    managerOfTheSeason: {
      managerName: managerOfSeasonName,
      clubId: awardClub?.id || state.controlledClubId,
      clubName: awardClub?.name || 'Club',
    },
  };

  const nextSeasonAwardsHistory: SeasonAwardRecord[] = [
    newAwardRecord,
    ...(state.seasonAwardsHistory || []),
  ];

  nextInbox.unshift({
    id: `news_ballon_dor_gala_${nextYear}`,
    gameDate: `${nextYear}-07-15`,
    category: 'Media',
    title: trText(
      `Annual Awards Gala (${state.currentSeason}): ${newAwardRecord.ballonDor.playerName} Wins the Ballon d'Or!`,
      `งานประกาศรางวัลเกียรติยศ (${state.currentSeason}): ${newAwardRecord.ballonDor.playerName} ผงาดคว้าบัลลงดอร์ (Ballon d'Or)!`
    ),
    body: trText(
      `Ballon d'Or: ${newAwardRecord.ballonDor.playerName} (${newAwardRecord.ballonDor.clubName}) | European Golden Boot: ${newAwardRecord.goldenBoot.playerName} (${newAwardRecord.goldenBoot.goals} Goals) | Golden Boy (U21): ${newAwardRecord.goldenBoy.playerName} (${newAwardRecord.goldenBoy.clubName}) | Manager of the Season: ${newAwardRecord.managerOfTheSeason.managerName}.`,
      `ผลรางวัลประจำฤดูกาล ${state.currentSeason} — 🥇 Ballon d'Or: ${newAwardRecord.ballonDor.playerName} (${newAwardRecord.ballonDor.clubName}) | 👟 รองเท้าทองคำยุโรป: ${newAwardRecord.goldenBoot.playerName} (${newAwardRecord.goldenBoot.goals} ประตู) | 🌟 ดาวรุ่งยอดเยี่ยม Golden Boy: ${newAwardRecord.goldenBoy.playerName} (${newAwardRecord.goldenBoy.clubName}) | 👔 ผู้จัดการทีมยอดเยี่ยม: ${newAwardRecord.managerOfTheSeason.managerName}`
    ),
    isRead: false,
    isImportant: true,
    relatedPlayerId: ballonDorWinner.id,
  });

  // 2. Age 33+ physical regression, reset seasonal stats, clear suspensions, and recall loans
  for (const [pid, p] of Object.entries(updatedPlayers)) {
    const age = getAgeAtDate(p.dateOfBirth, `${nextYear}-07-01`);
    let nextCa = p.currentAbility;
    let nextAttrs = p.attributes;
    if (age >= 33) {
      nextCa = Math.max(70, p.currentAbility - 2);
      nextAttrs = {
        ...p.attributes,
        physical: {
          ...p.attributes.physical,
          pace: Math.max(5, p.attributes.physical.pace - 1),
          acceleration: Math.max(5, p.attributes.physical.acceleration - 1),
          stamina: Math.max(6, p.attributes.physical.stamina - 1),
        },
      };
    }

    const nextClubId =
      p.loanedFromClubId && updatedClubs[p.loanedFromClubId] ? p.loanedFromClubId : p.clubId;

    updatedPlayers[pid] = {
      ...p,
      clubId: nextClubId,
      loanedFromClubId: null,
      currentAbility: nextCa,
      attributes: nextAttrs,
      fitness: 100,
      matchSharpness: 85,
      suspensionMatchesRemaining: 0,
      stats: {
        appearances: 0,
        starts: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        yellowCards: 0,
        redCards: 0,
        averageRating: 0,
        minutesPlayed: 0,
        manOfTheMatch: 0,
      },
    };
  }

  // 3. Rebuild fresh League Standings, League Fixtures, and Domestic Cup R16 Fixtures for nextSeasonStr
  const nextStandings = {} as Record<LeagueId, LeagueStanding[]>;
  let nextFixtures: Fixture[] = [];
  const rng = new SeededRNG(state.randomSeed + nextYear);

  for (const league of Object.values(LEAGUES_CONFIG)) {
    const clubsInLeague = Object.values(updatedClubs).filter((c) => c.leagueId === league.id);
    const clubIds = clubsInLeague.map((c) => c.id);
    nextStandings[league.id] = createInitialStandings(league.id, nextSeasonStr, clubIds);
    const sched = generateLeagueSchedule(
      league,
      clubIds,
      nextSeasonStr,
      `${nextYear}-08-15`,
      rng
    );
    nextFixtures = [...nextFixtures, ...sched];

    if (league.tier !== 2) {
      const cupFixtures = generateInitialDomesticCupFixtures(
        league.cupId,
        clubsInLeague,
        nextSeasonStr,
        `${nextYear}-10-28`
      );
      nextFixtures = [...nextFixtures, ...cupFixtures];
    }
  }

  nextFixtures.sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate));

  let workingState: WorldState = {
    ...state,
    currentSeason: nextSeasonStr,
    gameDate: `${nextYear}-07-15`,
    manager: updatedManager,
    clubs: updatedClubs,
    players: updatedPlayers,
    standings: nextStandings,
    fixtures: nextFixtures,
    transactions: nextTransactions,
    inbox: nextInbox,
    trophyHistory: nextTrophyHistory,
    seasonAwardsHistory: nextSeasonAwardsHistory,
  };

  // 4. Generate Annual Youth Intake for User's Club
  const intakeRes = generateAnnualYouthIntake(workingState, workingState.controlledClubId);
  workingState = intakeRes.nextState;

  workingState.inbox.unshift({
    id: `news_new_season_${nextYear}`,
    gameDate: workingState.gameDate,
    category: 'Competition',
    title: trText(
      `Welcome to the ${nextSeasonStr} Season! Fixtures, Prize Money & Youth Intake Ready`,
      `ยินดีต้อนรับสู่ฤดูกาลใหม่ ${nextSeasonStr}! ตารางแข่ง เงินรางวัล และเด็กปั้นรุ่นใหม่พร้อมแล้ว`
    ),
    body: trText(
      `The ${nextSeasonStr} campaign has officially begun! Broadcast payouts, owner investments, and your new annual Youth Intake class have been processed.`,
      `เข้าสู่ฤดูกาล ${nextSeasonStr} อย่างเป็นทางการ! ระบบได้ประมวลผลเงินรางวัลประจำฤดูกาล และนักเตะเยาวชนรุ่นใหม่เข้าสู่อคาเดมีเรียบร้อยแล้ว`
    ),
    isRead: false,
    isImportant: true,
    relatedClubId: workingState.controlledClubId,
  });

  return {
    nextState: workingState,
    message: trText(
      `Rolled over to the ${nextSeasonStr} season!`,
      `เข้าสู่ฤดูกาลใหม่ ${nextSeasonStr} สำเร็จ!`
    ),
  };
}

/**
 * Multi-Slot SaveGame Service (Google / Gmail Auth + Cloud Firestore Native Maps, Zero localStorage)
 */
const inMemorySaveSlots: Record<string, WorldState> = {};
let inMemorySlotMetas: SaveSlotMeta[] = [];

export interface SaveSlotMeta {
  slotId: string;
  saveName: string;
  clubName: string;
  managerName: string;
  gameDate: string;
  season: string;
  lastSavedAt: string;
}

export interface PlayerDelta {
  clubId: string;
  wagePerWeek: number;
  contractEndDate: string;
  fitness: number;
  matchSharpness: number;
  morale: number;
  currentAbility: number;
  transferListed: boolean;
  loanListed: boolean;
  injuryStatus: Player['injuryStatus'];
  stats: Player['stats'];
}

export interface CompactFixtureScore {
  h: number;
  a: number;
}

export interface CareerStateMap {
  processedDates: string[];
  manager: ManagerProfile;
  standings: Record<LeagueId, LeagueStanding[]>;
  clubs: Record<string, Club>;
  staff: Record<string, StaffMember>;
  completedFixtures: Record<string, Fixture | CompactFixtureScore>;
  modifiedPlayers: Record<string, Player>;
  playerDiffs: Record<string, PlayerDelta>;
  transferOffers: TransferOffer[];
  shortlistPlayerIds: string[];
  scoutAssignments: ScoutAssignment[];
  scoutReports: Record<string, ScoutReport>;
  transactions: FinanceTransaction[];
  inbox: NewsItem[];
  mentoringGroups?: MentoringGroup[];
  trophyHistory?: TrophyHistoryRecord[];
  seasonAwardsHistory?: SeasonAwardRecord[];
}

export interface CareerSaveDocument {
  ownerId: string;
  slotId: string;
  saveName: string;
  clubName: string;
  managerName: string;
  gameDate: string;
  season: string;
  lastSavedAtIso: string;
  randomSeed: number;
  controlledClubId: string;
  careerState: CareerStateMap;
}

function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined) {
    return null as unknown as T;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) {
      result[k] = sanitizeForFirestore(v);
    }
  }
  return result as T;
}

export function compactWorldStateForStorage(state: WorldState): WorldState {
  const controlledId = state.controlledClubId;

  const compactFixtures = state.fixtures.map((f) => {
    if (f.status === 'Completed' && f.result) {
      const isUserMatch =
        f.homeClubId === controlledId || f.awayClubId === controlledId;
      return {
        ...f,
        result: {
          ...f.result,
          events: isUserMatch ? (f.result.events || []).slice(-12) : [],
          playerRatings: {},
        },
      };
    }
    return f;
  });

  const compactPlayers: Record<string, Player> = {};
  for (const [id, p] of Object.entries(state.players)) {
    compactPlayers[id] = {
      ...p,
      developmentHistory: p.developmentHistory.slice(-1),
      transferHistory: p.transferHistory.slice(-2),
    };
  }

  return {
    ...state,
    fixtures: compactFixtures,
    players: compactPlayers,
    inbox: state.inbox.slice(0, 25),
    transactions: state.transactions.slice(0, 30),
  };
}

export function dehydrateWorldStateToCareerMap(state: WorldState): CareerStateMap {
  const compacted = compactWorldStateForStorage(state);
  const controlledId = compacted.controlledClubId;
  const userClub = compacted.clubs[controlledId];
  const userLeagueId = userClub?.leagueId;

  const baseline = createInitialWorldState(
    compacted.randomSeed,
    compacted.manager,
    controlledId
  );

  // 1. Only store controlledClub + clubs whose leagueId or facilities changed (cap non-controlled at 10)
  const modifiedClubs: Record<string, Club> = {};
  if (userClub) {
    modifiedClubs[controlledId] = userClub;
  }
  let extraClubsCount = 0;
  for (const [id, club] of Object.entries(compacted.clubs)) {
    if (id === controlledId) continue;
    const baseClub = baseline.clubs[id];
    const leagueChanged = !baseClub || club.leagueId !== baseClub.leagueId;
    const facilityChanged =
      !baseClub ||
      club.trainingFacilities !== baseClub.trainingFacilities ||
      club.youthFacilities !== baseClub.youthFacilities ||
      club.finances.transferBudget !== baseClub.finances.transferBudget;
    if (leagueChanged || (facilityChanged && extraClubsCount < 10)) {
      modifiedClubs[id] = club;
      if (!leagueChanged) extraClubsCount++;
    }
  }

  // 2. Modified staff (only controlled club or reassigned staff, cap at 30)
  const modifiedStaff: Record<string, StaffMember> = {};
  let staffCount = 0;
  for (const [id, member] of Object.entries(compacted.staff)) {
    const baseMember = baseline.staff[id];
    if (
      member.clubId === controlledId ||
      (!baseMember && staffCount < 30) ||
      (baseMember && member.clubId !== baseMember.clubId && staffCount < 30)
    ) {
      modifiedStaff[id] = member;
      staffCount++;
    }
  }

  // 3. Completed fixtures: full Fixture for user matches, compact {h, a} for completed AI matches
  const baselineFixtureIds = new Set(baseline.fixtures.map((bf) => bf.id));
  const completedFixtures: Record<string, Fixture | CompactFixtureScore> = {};
  for (const f of compacted.fixtures) {
    if (f.status !== 'Completed' || !f.result) continue;
    const isUserMatch =
      f.homeClubId === controlledId || f.awayClubId === controlledId;
    if (isUserMatch) {
      completedFixtures[f.id] = f;
    } else if (baselineFixtureIds.has(f.id)) {
      // Store compact 2-field score for user's league or cup matches (or up to 600 fixtures total)
      if (
        f.competitionId === userLeagueId ||
        String(f.competitionId).endsWith('_CUP') ||
        String(f.competitionId) === 'EUR_CL' ||
        Object.keys(completedFixtures).length < 600
      ) {
        completedFixtures[f.id] = {
          h: f.result.homeGoals,
          a: f.result.awayGoals,
        };
      }
    } else if (Object.keys(completedFixtures).length < 480) {
      completedFixtures[f.id] = f;
    }
  }

  // 4. Modified players & bounded playerDiffs (stay well below Firestore 1MB limit across 15 leagues)
  const modifiedPlayers: Record<string, Player> = {};
  const diffCandidates: Array<{ id: string; priority: number; delta: PlayerDelta }> = [];
  const shortlistSet = new Set(compacted.shortlistPlayerIds);

  for (const [id, p] of Object.entries(compacted.players)) {
    const basePlayer = baseline.players[id];
    const pLeagueId = compacted.clubs[p.clubId]?.leagueId;

    if (p.clubId === controlledId) {
      modifiedPlayers[id] = p;
      continue;
    }

    if (!basePlayer || p.clubId !== basePlayer.clubId) {
      if (Object.keys(modifiedPlayers).length < 75) {
        modifiedPlayers[id] = p;
      }
      continue;
    }

    const isTracked = shortlistSet.has(id) || Boolean(compacted.scoutReports[id]);
    const inUserLeague = pLeagueId === userLeagueId;
    const hasNotableChange =
      p.stats.goals > 0 ||
      p.stats.assists > 0 ||
      p.currentAbility !== basePlayer.currentAbility ||
      p.injuryStatus.isInjured !== basePlayer.injuryStatus.isInjured ||
      p.transferListed !== basePlayer.transferListed ||
      p.loanListed !== basePlayer.loanListed ||
      (inUserLeague && p.stats.appearances > 0);

    if (!hasNotableChange && !isTracked) continue;
    if (!inUserLeague && !isTracked && p.stats.goals < 2 && p.stats.assists < 2 && !p.transferListed) {
      continue;
    }

    const priority =
      (isTracked ? 1000 : 0) +
      (inUserLeague ? 500 : 0) +
      p.stats.goals * 15 +
      p.stats.assists * 10 +
      (p.transferListed ? 25 : 0);

    diffCandidates.push({
      id,
      priority,
      delta: {
        clubId: p.clubId,
        wagePerWeek: p.wagePerWeek,
        contractEndDate: p.contractEndDate,
        fitness: p.fitness,
        matchSharpness: p.matchSharpness,
        morale: p.morale,
        currentAbility: p.currentAbility,
        transferListed: p.transferListed,
        loanListed: p.loanListed,
        injuryStatus: p.injuryStatus,
        stats: p.stats,
      },
    });
  }

  diffCandidates.sort((a, b) => b.priority - a.priority);
  const playerDiffs: Record<string, PlayerDelta> = {};
  for (const item of diffCandidates.slice(0, 150)) {
    playerDiffs[item.id] = item.delta;
  }

  // Cap scoutReports to 35 entries
  const limitedScoutReports: Record<string, ScoutReport> = {};
  for (const [k, v] of Object.entries(compacted.scoutReports).slice(0, 35)) {
    limitedScoutReports[k] = v;
  }

  const dehydrated = sanitizeForFirestore({
    processedDates: compacted.processedDates.slice(-60),
    manager: compacted.manager,
    standings: compacted.standings,
    clubs: modifiedClubs,
    staff: modifiedStaff,
    completedFixtures,
    modifiedPlayers,
    playerDiffs,
    transferOffers: compacted.transferOffers.slice(0, 25),
    shortlistPlayerIds: compacted.shortlistPlayerIds.slice(0, 40),
    scoutAssignments: compacted.scoutAssignments.slice(0, 20),
    scoutReports: limitedScoutReports,
    transactions: compacted.transactions.slice(0, 30),
    inbox: compacted.inbox.slice(0, 25),
    mentoringGroups: (compacted.mentoringGroups || []).slice(0, 20),
    trophyHistory: (compacted.trophyHistory || []).slice(0, 40),
    seasonAwardsHistory: (compacted.seasonAwardsHistory || []).slice(0, 15),
  });

  // Safety guard: guarantee JSON payload is under 300KB so Firestore BSON/proto never approaches 1,048,576 bytes
  if (JSON.stringify(dehydrated).length > 300_000) {
    const trimmedDiffs: Record<string, PlayerDelta> = {};
    for (const [k, v] of Object.entries(dehydrated.playerDiffs).slice(0, 60)) {
      trimmedDiffs[k] = v;
    }
    dehydrated.playerDiffs = trimmedDiffs;
  }

  return dehydrated;
}

function buildCompactTeamStats(goals: number, possession: number): MatchTeamStats {
  const totalShots = goals * 3 + 6;
  const shotsOnTarget = goals + 2;
  return {
    goals,
    possession,
    totalShots,
    shotsOnTarget,
    blockedShots: 2,
    xG: Number((goals * 0.92 + 0.35).toFixed(2)),
    passes: 420,
    passAccuracy: 82,
    tackles: 14,
    interceptions: 9,
    clearances: 16,
    fouls: 10,
    yellowCards: 1,
    redCards: 0,
    corners: 4,
    offsides: 1,
    saves: 2,
    bigChances: Math.max(1, goals),
  };
}

export function rehydrateWorldStateFromCareerDoc(docData: CareerSaveDocument): WorldState {
  const cs = docData.careerState;
  const baseline = createInitialWorldState(
    docData.randomSeed,
    cs.manager,
    docData.controlledClubId
  );

  const rehydratedClubs: Record<string, Club> = {
    ...baseline.clubs,
    ...(cs.clubs || {}),
  };

  const rehydratedStaff: Record<string, StaffMember> = {
    ...baseline.staff,
    ...(cs.staff || {}),
  };

  const rehydratedPlayers: Record<string, Player> = { ...baseline.players };
  for (const [id, diff] of Object.entries(cs.playerDiffs || {})) {
    const existing = rehydratedPlayers[id];
    if (existing) {
      rehydratedPlayers[id] = {
        ...existing,
        ...diff,
      };
    }
  }
  for (const [id, fullPlayer] of Object.entries(cs.modifiedPlayers || {})) {
    rehydratedPlayers[id] = fullPlayer;
  }

  const completedFixturesMap = cs.completedFixtures || {};
  const baselineFixtureIds = new Set<string>();
  const rehydratedFixtures: Fixture[] = baseline.fixtures.map((f): Fixture => {
    baselineFixtureIds.add(f.id);
    const saved = completedFixturesMap[f.id];
    if (!saved) return f;
    if ('h' in saved && typeof saved.h === 'number') {
      return {
        ...f,
        status: 'Completed',
        result: {
          homeGoals: saved.h,
          awayGoals: saved.a,
          homeStats: buildCompactTeamStats(saved.h, 52),
          awayStats: buildCompactTeamStats(saved.a, 48),
          events: [],
          playerRatings: {},
          attendance: 32000,
          manOfTheMatchPlayerId: '',
        },
      };
    }
    return saved as Fixture;
  });

  for (const [fid, saved] of Object.entries(completedFixturesMap)) {
    if (!baselineFixtureIds.has(fid) && 'status' in saved) {
      rehydratedFixtures.push(saved as Fixture);
    }
  }

  const rehydratedUefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };
  for (const uefaId of Object.keys(UEFA_COMPETITIONS_CONFIG) as UefaCompetitionId[]) {
    const participantIds = baseline.uefaPots?.[uefaId]?.flat() || [];
    rehydratedUefaStandings[uefaId] = recomputeUefaStandings(
      uefaId,
      docData.season,
      participantIds,
      rehydratedFixtures,
      rehydratedClubs
    );
  }

  return {
    ...baseline,
    saveId: docData.slotId,
    saveName: docData.saveName,
    lastSavedAt: docData.lastSavedAtIso,
    gameDate: docData.gameDate,
    currentSeason: docData.season,
    randomSeed: docData.randomSeed,
    controlledClubId: docData.controlledClubId,
    processedDates: cs.processedDates || [],
    manager: cs.manager || baseline.manager,
    clubs: rehydratedClubs,
    players: rehydratedPlayers,
    staff: rehydratedStaff,
    fixtures: rehydratedFixtures,
    standings: {
      ...baseline.standings,
      ...(cs.standings || {}),
    },
    uefaStandings: rehydratedUefaStandings,
    uefaPots: baseline.uefaPots,
    transferOffers: cs.transferOffers || [],
    shortlistPlayerIds: cs.shortlistPlayerIds || [],
    scoutAssignments: cs.scoutAssignments || [],
    scoutReports: cs.scoutReports || {},
    transactions: cs.transactions || [],
    inbox: cs.inbox || [],
    mentoringGroups: cs.mentoringGroups || baseline.mentoringGroups || [],
    trophyHistory: cs.trophyHistory || baseline.trophyHistory || [],
    seasonAwardsHistory: cs.seasonAwardsHistory || baseline.seasonAwardsHistory || [],
  };
}

function sanitizeSlotId(rawSlotId: string): string {
  const cleaned = rawSlotId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return cleaned || 'slot_1';
}

export async function saveWorldStateToFirestoreSlot(
  rawSlotId: string,
  state: WorldState
): Promise<SaveSlotMeta[]> {
  const slotId = sanitizeSlotId(rawSlotId);
  const updatedMetas = saveWorldStateToSlot(slotId, state, false);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return updatedMetas;
  }

  await ensureUserProfileInFirestore(currentUser);

  const uid = currentUser.uid;
  const savePath = `users/${uid}/saves/${slotId}`;
  const saveRef = doc(db, 'users', uid, 'saves', slotId);

  const club = state.clubs[state.controlledClubId];
  const lastSavedAtIso = new Date().toISOString();
  const careerState = dehydrateWorldStateToCareerMap(state);

  const basePayload: CareerSaveDocument = {
    ownerId: uid,
    slotId,
    saveName: (state.saveName || 'TOUCHLINE Career').slice(0, 120),
    clubName: (club?.name || 'Club').slice(0, 100),
    managerName: (state.manager.name || 'Manager').slice(0, 80),
    gameDate: state.gameDate.slice(0, 10),
    season: (state.currentSeason || '2025/26').slice(0, 16),
    lastSavedAtIso,
    randomSeed: state.randomSeed,
    controlledClubId: state.controlledClubId.slice(0, 64),
    careerState,
  };

  try {
    const existingSnap = await getDoc(saveRef);
    if (!existingSnap.exists()) {
      await setDoc(saveRef, {
        ...basePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(saveRef, {
        saveName: basePayload.saveName,
        clubName: basePayload.clubName,
        managerName: basePayload.managerName,
        gameDate: basePayload.gameDate,
        season: basePayload.season,
        lastSavedAtIso: basePayload.lastSavedAtIso,
        randomSeed: basePayload.randomSeed,
        controlledClubId: basePayload.controlledClubId,
        careerState: basePayload.careerState,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, savePath);
  }

  return updatedMetas;
}

export async function syncUserSaveSlotsFromFirestore(): Promise<SaveSlotMeta[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return inMemorySlotMetas;
  }

  const uid = currentUser.uid;
  const savesPath = `users/${uid}/saves`;
  try {
    const q = query(
      collection(db, 'users', uid, 'saves'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    const loadedMetas: SaveSlotMeta[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as CareerSaveDocument;
      if (data && data.slotId && data.careerState) {
        loadedMetas.push({
          slotId: data.slotId,
          saveName: data.saveName,
          clubName: data.clubName,
          managerName: data.managerName,
          gameDate: data.gameDate,
          season: data.season,
          lastSavedAt: data.lastSavedAtIso,
        });
        inMemorySaveSlots[data.slotId] = rehydrateWorldStateFromCareerDoc(data);
      }
    });

    loadedMetas.sort((a, b) => b.lastSavedAt.localeCompare(a.lastSavedAt));
    inMemorySlotMetas = loadedMetas;
    return loadedMetas;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, savesPath);
  }
}

export async function loadWorldStateFromFirestoreSlot(
  rawSlotId: string
): Promise<WorldState | null> {
  const slotId = sanitizeSlotId(rawSlotId);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return inMemorySaveSlots[slotId] || null;
  }

  const uid = currentUser.uid;
  const savePath = `users/${uid}/saves/${slotId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'saves', slotId));
    if (!snap.exists()) {
      return inMemorySaveSlots[slotId] || null;
    }
    const data = snap.data() as CareerSaveDocument;
    const rehydrated = rehydrateWorldStateFromCareerDoc(data);
    inMemorySaveSlots[slotId] = rehydrated;
    return rehydrated;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, savePath);
  }
}

export async function deleteSaveSlotFromFirestore(
  rawSlotId: string
): Promise<SaveSlotMeta[]> {
  const slotId = sanitizeSlotId(rawSlotId);
  delete inMemorySaveSlots[slotId];
  inMemorySlotMetas = inMemorySlotMetas.filter((m) => m.slotId !== slotId);

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return inMemorySlotMetas;
  }

  const uid = currentUser.uid;
  const savePath = `users/${uid}/saves/${slotId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'saves', slotId));
    return inMemorySlotMetas;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, savePath);
  }
}

export function saveWorldStateToSlot(
  rawSlotId: string,
  state: WorldState,
  triggerCloudSync = true
): SaveSlotMeta[] {
  const slotId = sanitizeSlotId(rawSlotId);
  const stamped: WorldState = compactWorldStateForStorage({
    ...state,
    saveId: slotId,
    lastSavedAt: new Date().toISOString(),
  });

  inMemorySaveSlots[slotId] = stamped;

  const existingMetas = inMemorySlotMetas.filter((m) => m.slotId !== slotId);
  const club = state.clubs[state.controlledClubId];
  const newMeta: SaveSlotMeta = {
    slotId,
    saveName: state.saveName,
    clubName: club?.name || 'Club',
    managerName: state.manager.name,
    gameDate: state.gameDate,
    season: state.currentSeason,
    lastSavedAt: stamped.lastSavedAt,
  };
  const updatedMetas = [newMeta, ...existingMetas].slice(0, 5);
  inMemorySlotMetas = updatedMetas;

  if (triggerCloudSync && auth.currentUser) {
    void saveWorldStateToFirestoreSlot(slotId, stamped);
  }

  return updatedMetas;
}

export function loadWorldStateFromSlot(rawSlotId: string): WorldState | null {
  const slotId = sanitizeSlotId(rawSlotId);
  return inMemorySaveSlots[slotId] || null;
}

export function getSavedSlotsList(): SaveSlotMeta[] {
  return inMemorySlotMetas;
}

export function deleteSavedSlot(rawSlotId: string): SaveSlotMeta[] {
  const slotId = sanitizeSlotId(rawSlotId);
  delete inMemorySaveSlots[slotId];
  inMemorySlotMetas = inMemorySlotMetas.filter((m) => m.slotId !== slotId);
  if (auth.currentUser) {
    void deleteSaveSlotFromFirestore(slotId);
  }
  return inMemorySlotMetas;
}

/**
 * Checkpoint 5: Own-Player Transfer / Loan List, Asking Price & Squad Status Controls
 * - Updates transferListed, loanListed, askingPrice, and squadStatus
 * - If demoted from Star Player / Important Player to Squad Player / Breakthrough Prospect / Youth,
 *   drops morale and sends an unhappy player inbox item
 */
export function updatePlayerSquadAndTransferStatus(
  state: WorldState,
  playerId: string,
  updates: {
    transferListed?: boolean;
    loanListed?: boolean;
    askingPrice?: number;
    squadStatus?: Player['squadStatus'];
  }
): { nextState: WorldState; message: string } {
  const player = state.players[playerId];
  if (!player) {
    return {
      nextState: state,
      message: trText('Player not found.', 'ไม่พบข้อมูลนักเตะ'),
    };
  }

  const oldStatus = player.squadStatus;
  const newStatus = updates.squadStatus ?? oldStatus;
  const wasHighStatus = oldStatus === 'Star Player' || oldStatus === 'Important Player';
  const isLowStatus =
    newStatus === 'Squad Player' ||
    newStatus === 'Breakthrough Prospect' ||
    newStatus === 'Youth';

  let nextMorale = player.morale;
  const updatedInbox = [...state.inbox];

  if (wasHighStatus && isLowStatus) {
    nextMorale = Math.max(20, player.morale - 16);
    updatedInbox.unshift({
      id: `news_unhappy_status_${state.gameDate}_${player.id}`,
      gameDate: state.gameDate,
      category: 'Player',
      title: trText(
        `${player.firstName} ${player.lastName} unhappy with reduced Squad Status`,
        `${player.firstName} ${player.lastName} ไม่พอใจที่ถูกลดบทบาทในทีมเป็น ${newStatus}`
      ),
      body: trText(
        `${player.firstName} ${player.lastName} has expressed frustration in the dressing room after being demoted from "${oldStatus}" to "${newStatus}". His morale has dropped to ${nextMorale}%.`,
        `${player.firstName} ${player.lastName} แสดงความไม่พอใจหลังถูกลดสถานะจาก "${oldStatus}" ลงเป็น "${newStatus}" ส่งผลให้ขวัญกำลังใจลดลงเหลือ ${nextMorale}%`
      ),
      isRead: false,
      isImportant: true,
      relatedPlayerId: player.id,
      relatedClubId: player.clubId,
    });
  } else if (updates.transferListed === true && !player.transferListed) {
    nextMorale = Math.max(25, player.morale - 8);
  }

  const updatedPlayer: Player = {
    ...player,
    transferListed: updates.transferListed ?? player.transferListed,
    loanListed: updates.loanListed ?? player.loanListed,
    askingPrice: updates.askingPrice ?? player.askingPrice,
    squadStatus: newStatus,
    morale: nextMorale,
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      inbox: updatedInbox,
    },
    message: trText(
      `Updated squad & market status for ${player.firstName} ${player.lastName}.`,
      `อัปเดตสถานะในทีมและราคาตั้งขายของ ${player.firstName} ${player.lastName} เรียบร้อยแล้ว`
    ),
  };
}

/**
 * Checkpoint 8: Bosman Free-Agent / Pre-Contract Signing (Fee = €0 for players with <= 1 year left)
 */
export function signPlayerOnBosmanFree(
  state: WorldState,
  playerId: string,
  proposedWagePerWeek: number,
  contractYears: number
): { nextState: WorldState; outcome: 'COMPLETED' | 'REJECTED'; message: string } {
  const player = state.players[playerId];
  if (!player) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('Player not found.', 'ไม่พบนักเตะในฐานข้อมูล'),
    };
  }

  const myClub = { ...state.clubs[state.controlledClubId] };
  if (player.clubId === myClub.id) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('Player is already at your club.', 'นักเตะอยู่ในสโมสรของคุณอยู่แล้ว'),
    };
  }

  if (myClub.transferEmbargoUntil && myClub.transferEmbargoUntil >= state.gameDate) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `Transfer Embargo Active until ${myClub.transferEmbargoUntil}.`,
        `สโมสรถูกระงับการซื้อขายชั่วคราวจนถึงวันที่ ${myClub.transferEmbargoUntil}`
      ),
    };
  }

  const currentYear = Number(state.gameDate.slice(0, 4)) || 2025;
  const expiryYear = Number((player.contractEndDate || '2026-06-30').slice(0, 4)) || 2026;
  if (expiryYear - currentYear > 1) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `${player.firstName} ${player.lastName} has more than 1 year remaining on his contract (${player.contractEndDate}) and is not eligible for a Bosman free transfer.`,
        `${player.firstName} ${player.lastName} ยังเหลือสัญญามากกว่า 1 ปี (${player.contractEndDate}) จึงยังไม่สามารถเซ็นฟรีตามกฎ Bosman ได้`
      ),
    };
  }

  const minRequiredWage = Math.round(player.wagePerWeek * 0.95);
  if (proposedWagePerWeek < minRequiredWage) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `${player.lastName}'s agent rejected the Bosman contract offer (Demands at least €${minRequiredWage.toLocaleString()}/wk).`,
        `เอเย่นต์ของ ${player.lastName} ปฏิเสธข้อเสนอสัญญา Bosman (ต้องการค่าเหนื่อยอย่างน้อย €${minRequiredWage.toLocaleString()}/สัปดาห์)`
      ),
    };
  }

  const availableWage = myClub.finances.wageBudgetPerWeek - myClub.finances.wageUsedPerWeek;
  if (proposedWagePerWeek > availableWage + 35_000) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        'Insufficient wage budget to register this Bosman signing.',
        'เพดานค่าเหนื่อยของสโมสรไม่เพียงพอสำหรับการเซ็นสัญญานี้'
      ),
    };
  }

  const oldClub = state.clubs[player.clubId];
  const updatedClubs = { ...state.clubs };

  if (oldClub) {
    updatedClubs[oldClub.id] = {
      ...oldClub,
      primaryTactic: {
        ...oldClub.primaryTactic,
        lineup: oldClub.primaryTactic.lineup.map((s) =>
          s.playerId === player.id ? { ...s, playerId: null } : s
        ),
        benchPlayerIds: oldClub.primaryTactic.benchPlayerIds.filter((id) => id !== player.id),
      },
      finances: {
        ...oldClub.finances,
        wageUsedPerWeek: Math.max(0, oldClub.finances.wageUsedPerWeek - player.wagePerWeek),
      },
    };
  }

  myClub.finances = {
    ...myClub.finances,
    wageUsedPerWeek: myClub.finances.wageUsedPerWeek + proposedWagePerWeek,
  };
  if (myClub.primaryTactic.benchPlayerIds.length < 9) {
    myClub.primaryTactic = {
      ...myClub.primaryTactic,
      benchPlayerIds: [...myClub.primaryTactic.benchPlayerIds, player.id],
    };
  }
  updatedClubs[myClub.id] = myClub;

  const newExpiry = `${currentYear + contractYears}-06-30`;
  const updatedPlayer: Player = {
    ...player,
    clubId: myClub.id,
    wagePerWeek: proposedWagePerWeek,
    contractEndDate: newExpiry,
    transferListed: false,
    loanListed: false,
    morale: Math.min(100, player.morale + 10),
  };

  const bosmanOffer: TransferOffer = {
    id: `bosman_${state.gameDate}_${player.id}`,
    date: state.gameDate,
    playerId: player.id,
    buyingClubId: myClub.id,
    sellingClubId: oldClub?.id || myClub.id,
    offerType: 'Transfer',
    upfrontFee: 0,
    installmentsFee: 0,
    sellOnPercentage: 0,
    proposedWagePerWeek,
    proposedContractYears: contractYears,
    proposedSquadStatus: player.squadStatus,
    signingBonus: 0,
    agentFee: 0,
    status: 'Completed',
  };

  return {
    nextState: {
      ...state,
      clubs: updatedClubs,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      transferOffers: [bosmanOffer, ...state.transferOffers],
      inbox: [
        {
          id: `news_bosman_${state.gameDate}_${player.id}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `Bosman Free Signing Completed: ${player.firstName} ${player.lastName} joins ${myClub.name} (€0 Fee)!`,
            `เซ็นฟรี Bosman สำเร็จ: ${player.firstName} ${player.lastName} ย้ายซบ ${myClub.name} (ค่าตัว €0)!`
          ),
          body: trText(
            `${myClub.name} have completed the Bosman free signing of ${player.firstName} ${player.lastName} from ${oldClub?.name || 'his former club'} on a ${contractYears}-year deal worth €${proposedWagePerWeek.toLocaleString()}/wk.`,
            `${myClub.name} บรรลุข้อตกลงคว้าตัว ${player.firstName} ${player.lastName} จาก ${oldClub?.name || 'สโมสรเดิม'} แบบไม่มีค่าตัวตามกฎ Bosman ด้วยสัญญา ${contractYears} ปี ค่าเหนื่อย €${proposedWagePerWeek.toLocaleString()}/สัปดาห์`
          ),
          isRead: false,
          isImportant: true,
          relatedPlayerId: player.id,
          relatedClubId: myClub.id,
        },
        ...state.inbox,
      ],
    },
    outcome: 'COMPLETED',
    message: trText(
      `Signed ${player.firstName} ${player.lastName} on a Bosman Free Transfer (€0 fee)!`,
      `เซ็นสัญญาคว้าตัว ${player.firstName} ${player.lastName} แบบไร้ค่าตัว (Bosman €0) สำเร็จ!`
    ),
  };
}

/**
 * Checkpoint 8: Dynamic Board Takeovers & Transfer Embargo Events
 */
export function triggerClubTakeoverEvent(
  state: WorldState,
  targetClubId?: string,
  mode: 'EMBARGO' | 'COMPLETE' = 'COMPLETE'
): { nextState: WorldState; message: string } {
  const clubId = targetClubId || state.controlledClubId;
  const club = state.clubs[clubId];
  if (!club) {
    return { nextState: state, message: trText('Club not found.', 'ไม่พบสโมสร') };
  }

  if (mode === 'EMBARGO') {
    const embargoUntil = addDaysToDate(state.gameDate, 14);
    const updatedClub: Club = {
      ...club,
      transferEmbargoUntil: embargoUntil,
    };
    return {
      nextState: {
        ...state,
        clubs: { ...state.clubs, [club.id]: updatedClub },
        inbox: [
          {
            id: `news_embargo_${state.gameDate}_${club.id}`,
            gameDate: state.gameDate,
            category: 'Board',
            title: trText(
              `Board Takeover Talks: Temporary Transfer Embargo Placed on ${club.name}`,
              `เจรจาเทคโอเวอร์สโมสร: บอร์ดบริหารสั่งระงับการซื้อขายชั่วคราว (Transfer Embargo) ที่ ${club.name}`
            ),
            body: trText(
              `An international investment consortium has entered advanced takeover negotiations to acquire ${club.name}. A temporary transfer embargo is in effect until ${embargoUntil} while due diligence is completed.`,
              `กลุ่มทุนระดับโลกกำลังอยู่ในขั้นตอนการตรวจสอบทรัพย์สินเพื่อเข้าเทคโอเวอร์สโมสร ${club.name} ส่งผลให้สโมสรถูกระงับการซื้อขายนักเตะชั่วคราวจนถึงวันที่ ${embargoUntil}`
            ),
            isRead: false,
            isImportant: club.id === state.controlledClubId,
            relatedClubId: club.id,
          },
          ...state.inbox,
        ],
      },
      message: trText(
        `Transfer Embargo placed on ${club.name} until ${embargoUntil} during takeover talks.`,
        `สโมสร ${club.name} อยู่ระหว่างเจรจาเทคโอเวอร์และระงับการซื้อขายชั่วคราวถึง ${embargoUntil}`
      ),
    };
  }

  const cashInjection = 40_000_000;
  const budgetBoost = 35_000_000;
  const newBalance = club.finances.balance + cashInjection;
  const updatedClub: Club = {
    ...club,
    sugarDaddyType: 'FRONT_END',
    transferEmbargoUntil: null,
    finances: {
      ...club.finances,
      balance: newBalance,
      transferBudget: club.finances.transferBudget + budgetBoost,
      wageBudgetPerWeek: club.finances.wageBudgetPerWeek + 250_000,
    },
    boardExpectations: {
      ...club.boardExpectations,
      confidence: {
        ...club.boardExpectations.confidence,
        overall: Math.max(75, club.boardExpectations.confidence.overall),
      },
    },
  };

  const tx: FinanceTransaction = {
    id: `tx_takeover_${state.gameDate}_${club.id}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Sponsorship',
    amount: cashInjection,
    description: trText(
      `Consortium Takeover Completed — New Ownership Capital Injection (+€40.0M)`,
      `กลุ่มทุนใหม่เข้าเทคโอเวอร์สโมสรสำเร็จ — อัดฉีดเงินทุนก้อนโต (+€40.0M)`
    ),
    balanceAfter: newBalance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: updatedClub },
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_takeover_done_${state.gameDate}_${club.id}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `Consortium Takeover Completed at ${club.name}! (+€35.0M Transfer Warchest)`,
            `กลุ่มทุนมหาเศรษฐีเข้าเทคโอเวอร์ ${club.name} สำเร็จ! (อัดฉีดงบซื้อขาย +€35.0M)`
          ),
          body: trText(
            `The takeover of ${club.name} has been officially ratified! Any transfer embargo has been lifted, ownership status is now FRONT_END Tycoon, and the new Board has injected €40.0M into club reserves (+€35.0M Transfer Budget).`,
            `การเทคโอเวอร์สโมสร ${club.name} เสร็จสมบูรณ์อย่างเป็นทางการ! ยกเลิกโทษระงับการซื้อขายทั้งหมด พร้อมยกระดับเจ้าของทีมเป็นมหาเศรษฐีทุ่มไม่อั้น (FRONT_END) อัดฉีดเงินสด €40.0M และเพิ่มงบซื้อขายทันที +€35.0M`
          ),
          isRead: false,
          isImportant: club.id === state.controlledClubId,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    message: trText(
      `Takeover completed at ${club.name}! +€35.0M added to Transfer Budget.`,
      `เทคโอเวอร์สโมสร ${club.name} สำเร็จ! รับงบซื้อขายเพิ่มทันที +€35.0M`
    ),
  };
}

/**
 * Checkpoint 8: Job Center & Club Switching (Apply for Managerial Vacancy)
 */
export function applyForManagerJob(
  state: WorldState,
  targetClubId: string
): { nextState: WorldState; accepted: boolean; message: string } {
  const targetClub = state.clubs[targetClubId];
  if (!targetClub) {
    return {
      nextState: state,
      accepted: false,
      message: trText('Target club not found.', 'ไม่พบสโมสรที่เลือก'),
    };
  }

  if (targetClub.id === state.controlledClubId) {
    return {
      nextState: state,
      accepted: false,
      message: trText('You are already managing this club.', 'คุณกำลังคุมสโมสรนี้อยู่แล้ว'),
    };
  }

  const mgr = state.manager;
  const winBonus =
    mgr.careerStats.matchesManaged > 0
      ? Math.round((mgr.careerStats.won / mgr.careerStats.matchesManaged) * 18)
      : 8;
  const effectiveManagerRep = mgr.reputation + winBonus + mgr.careerStats.trophies.length * 5;

  // Accept if manager effective rep is within 28 points of club reputation or club board confidence is low
  const isUnderPressure = targetClub.boardExpectations.confidence.overall <= 55;
  if (!isUnderPressure && effectiveManagerRep + 28 < targetClub.reputation) {
    return {
      nextState: state,
      accepted: false,
      message: trText(
        `${targetClub.name} Board politely declined your application (Club Reputation ${targetClub.reputation} requires higher managerial pedigree).`,
        `บอร์ดบริหารของ ${targetClub.name} ปฏิเสธใบสมัครของคุณ (สโมสรชื่อเสียงระดับ ${targetClub.reputation} ต้องการกุนซือที่มีโปรไฟล์สูงกว่านี้)`
      ),
    };
  }

  const prevClub = state.clubs[state.controlledClubId];
  const closedStints = mgr.careerStats.clubsManaged.map((stint) =>
    stint.toDate === 'Present' ? { ...stint, toDate: state.gameDate } : stint
  );
  const updatedClubsManaged = [
    ...closedStints,
    {
      clubId: targetClub.id,
      clubName: targetClub.name,
      fromDate: state.gameDate,
      toDate: 'Present' as const,
    },
  ];

  const updatedManager: ManagerProfile = {
    ...mgr,
    reputation: Math.min(99, Math.max(mgr.reputation, Math.round(targetClub.reputation * 0.92))),
    careerStats: {
      ...mgr.careerStats,
      clubsManaged: updatedClubsManaged,
    },
  };

  return {
    nextState: {
      ...state,
      controlledClubId: targetClub.id,
      manager: updatedManager,
      inbox: [
        {
          id: `news_job_switch_${state.gameDate}_${targetClub.id}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `Official Appointment: ${mgr.name} Named New Manager of ${targetClub.name}!`,
            `ประกาศแต่งตั้งทางการ: ${mgr.name} เปิดตัวคุมทัพ ${targetClub.name}!`
          ),
          body: trText(
            `Welcome to ${targetClub.name}! Having departed ${prevClub?.name || 'your previous club'}, the Board of Directors at ${targetClub.stadiumName} have handed you a €${(targetClub.finances.transferBudget / 1_000_000).toFixed(2)}M transfer budget with a target of finishing Top ${targetClub.boardExpectations.targetLeaguePosition} in ${LEAGUES_CONFIG[targetClub.leagueId].name}.`,
            `ยินดีต้อนรับสู่สโมสร ${targetClub.name}! หลังจากอำลา ${prevClub?.name || 'สโมสรเดิม'} บอร์ดบริหารได้มอบงบประมาณซื้อขาย €${(targetClub.finances.transferBudget / 1_000_000).toFixed(2)}M พร้อมเป้าหมายจบอันดับ Top ${targetClub.boardExpectations.targetLeaguePosition} ในศึก ${LEAGUES_CONFIG[targetClub.leagueId].name}`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: targetClub.id,
        },
        ...state.inbox,
      ],
    },
    accepted: true,
    message: trText(
      `Congratulations! You have been appointed Manager of ${targetClub.name}!`,
      `ขอแสดงความยินดี! คุณได้รับการแต่งตั้งเป็นผู้จัดการทีมคนใหม่ของ ${targetClub.name} เรียบร้อยแล้ว!`
    ),
  };
}

/**
 * Checkpoint 11: Create or Update a Mentoring Group (Veteran >= 25 mentoring U21 prospects)
 */
export function saveMentoringGroup(
  state: WorldState,
  mentorId: string,
  menteeIds: string[],
  focusTrait?: PlayerTrait | null
): { nextState: WorldState; message: string } {
  const mentor = state.players[mentorId];
  if (!mentor) {
    return {
      nextState: state,
      message: trText('Mentor player not found.', 'ไม่พบนักเตะรุ่นพี่ที่เลือก'),
    };
  }
  const cleanMenteeIds = menteeIds.filter((id) => id !== mentorId && Boolean(state.players[id]));
  if (cleanMenteeIds.length === 0) {
    return {
      nextState: state,
      message: trText('Please select at least 1 youth mentee.', 'กรุณาเลือกนักเตะดาวรุ่งอย่างน้อย 1 คน'),
    };
  }

  const updatedPlayers = { ...state.players };
  for (const mId of cleanMenteeIds) {
    updatedPlayers[mId] = {
      ...updatedPlayers[mId],
      mentorId: mentor.id,
    };
  }

  const newGroup: MentoringGroup = {
    id: `mnt_${Date.now()}_${mentor.id}`,
    clubId: state.controlledClubId,
    mentorId: mentor.id,
    menteeIds: cleanMenteeIds,
    focusTrait: focusTrait || mentor.traits?.[0] || 'Places Shots',
    createdAt: state.gameDate,
  };

  const existingGroups = (state.mentoringGroups || []).filter((g) => g.mentorId !== mentor.id);

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      mentoringGroups: [newGroup, ...existingGroups],
    },
    message: trText(
      `Created Mentoring Group led by ${mentor.firstName} ${mentor.lastName} (${cleanMenteeIds.length} mentees).`,
      `สร้างกลุ่มรุ่นพี่ติวเข้มนำโดย ${mentor.firstName} ${mentor.lastName} (${cleanMenteeIds.length} ดาวรุ่ง) สำเร็จ!`
    ),
  };
}

export function removeMentoringGroup(
  state: WorldState,
  groupId: string
): { nextState: WorldState; message: string } {
  const target = (state.mentoringGroups || []).find((g) => g.id === groupId);
  const updatedPlayers = { ...state.players };
  if (target) {
    for (const mId of target.menteeIds) {
      if (updatedPlayers[mId]) {
        updatedPlayers[mId] = { ...updatedPlayers[mId], mentorId: null };
      }
    }
  }
  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      mentoringGroups: (state.mentoringGroups || []).filter((g) => g.id !== groupId),
    },
    message: trText('Mentoring group dissolved.', 'ยกเลิกกลุ่มรุ่นพี่สอนรุ่นน้องเรียบร้อยแล้ว'),
  };
}

/**
 * Checkpoint 12: Transfer Deadline Day Hub & Agent Last-Minute Bargains / Release Clause Activation
 */
export function isTransferDeadlineWindow(gameDate: string): boolean {
  const md = gameDate.slice(5); // MM-DD
  return (md >= '08-25' && md <= '08-31') || (md >= '01-25' && md <= '01-31');
}

export interface DeadlineBargainItem {
  player: Player;
  club: Club;
  originalPrice: number;
  bargainPrice: number;
  releaseClause: number;
  agentNoteEn: string;
  agentNoteTh: string;
}

export function getDeadlineDayBargains(state: WorldState): DeadlineBargainItem[] {
  const myClub = state.clubs[state.controlledClubId];
  const maxAffordable = Math.max(12_000_000, (myClub?.finances.transferBudget || 20_000_000) * 1.35);

  const candidates = Object.values(state.players)
    .filter(
      (p) =>
        p.clubId !== state.controlledClubId &&
        p.currentAbility >= 128 &&
        p.marketValue <= maxAffordable &&
        !p.injuryStatus.isInjured
    )
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 8);

  return candidates.map((p) => {
    const club = state.clubs[p.clubId];
    const originalPrice = p.askingPrice || p.marketValue;
    const bargainPrice = Math.round((p.marketValue * 0.75) / 100_000) * 100_000;
    const releaseClause =
      p.releaseClause || Math.round((p.marketValue * 1.15) / 100_000) * 100_000;

    return {
      player: p,
      club,
      originalPrice,
      bargainPrice,
      releaseClause,
      agentNoteEn: `Agent offering last-minute -25% cut-price deal (€${(bargainPrice / 1_000_000).toFixed(1)}M) before window slams shut!`,
      agentNoteTh: `เอเยนต์เสนอดีลด่วนลดราคา -25% เหลือเพียง €${(bargainPrice / 1_000_000).toFixed(1)}M ก่อนเส้นตายตลาดปิด!`,
    };
  });
}

export function activateReleaseClauseTransfer(
  state: WorldState,
  playerId: string,
  useBargainDiscount = false
): { nextState: WorldState; outcome: 'COMPLETED' | 'REJECTED'; message: string } {
  const player = state.players[playerId];
  if (!player) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('Player not found.', 'ไม่พบนักเตะในระบบ'),
    };
  }
  const myClub = { ...state.clubs[state.controlledClubId] };
  if (player.clubId === myClub.id) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText('Player is already at your club.', 'นักเตะอยู่ในสโมสรของคุณแล้ว'),
    };
  }
  if (myClub.transferEmbargoUntil && myClub.transferEmbargoUntil >= state.gameDate) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `Transfer Embargo Active until ${myClub.transferEmbargoUntil}.`,
        `สโมสรถูกระงับการซื้อขายชั่วคราวจนถึง ${myClub.transferEmbargoUntil}`
      ),
    };
  }

  const fee = useBargainDiscount
    ? Math.round((player.marketValue * 0.75) / 100_000) * 100_000
    : player.releaseClause || Math.round((player.marketValue * 1.15) / 100_000) * 100_000;

  if (myClub.finances.transferBudget < fee) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `Insufficient transfer budget (€${(myClub.finances.transferBudget / 1_000_000).toFixed(2)}M available vs €${(fee / 1_000_000).toFixed(2)}M required).`,
        `งบซื้อขายไม่เพียงพอ (มี €${(myClub.finances.transferBudget / 1_000_000).toFixed(2)}M แต่ต้องใช้ €${(fee / 1_000_000).toFixed(2)}M)`
      ),
    };
  }

  const oldClub = state.clubs[player.clubId];
  const updatedClubs = { ...state.clubs };
  const newWage = Math.round(player.wagePerWeek * 1.08);

  if (oldClub) {
    updatedClubs[oldClub.id] = {
      ...oldClub,
      finances: {
        ...oldClub.finances,
        balance: oldClub.finances.balance + fee,
        transferBudget: oldClub.finances.transferBudget + Math.round(fee * 0.8),
        wageUsedPerWeek: Math.max(0, oldClub.finances.wageUsedPerWeek - player.wagePerWeek),
      },
      primaryTactic: {
        ...oldClub.primaryTactic,
        lineup: oldClub.primaryTactic.lineup.map((s) =>
          s.playerId === player.id ? { ...s, playerId: null } : s
        ),
        benchPlayerIds: oldClub.primaryTactic.benchPlayerIds.filter((id) => id !== player.id),
      },
    };
  }

  const newBalance = myClub.finances.balance - fee;
  myClub.finances = {
    ...myClub.finances,
    balance: newBalance,
    transferBudget: myClub.finances.transferBudget - fee,
    wageUsedPerWeek: myClub.finances.wageUsedPerWeek + newWage,
  };
  if (myClub.primaryTactic.benchPlayerIds.length < 9) {
    myClub.primaryTactic = {
      ...myClub.primaryTactic,
      benchPlayerIds: [...myClub.primaryTactic.benchPlayerIds, player.id],
    };
  }
  updatedClubs[myClub.id] = myClub;

  const updatedPlayer: Player = {
    ...player,
    clubId: myClub.id,
    wagePerWeek: newWage,
    transferListed: false,
    loanListed: false,
    morale: Math.min(100, player.morale + 8),
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: oldClub?.id || '',
        toClubId: myClub.id,
        fee,
        type: 'Transfer',
      },
      ...player.transferHistory,
    ],
  };

  const tx: FinanceTransaction = {
    id: `tx_clause_${state.gameDate}_${player.id}`,
    date: state.gameDate,
    clubId: myClub.id,
    category: 'Player Purchase',
    amount: -fee,
    description: trText(
      `${useBargainDiscount ? 'Deadline Day Agent Bargain' : 'Release Clause Triggered'}: ${player.firstName} ${player.lastName} from ${oldClub?.name || 'Club'}`,
      `${useBargainDiscount ? 'คว้าดีลด่วนวันปิดตลาด (-25%)' : 'ฉีกสัญญาคว้าตัว'}: ${player.firstName} ${player.lastName} จาก ${oldClub?.name || 'สโมสรเดิม'}`
    ),
    balanceAfter: newBalance,
  };

  const completedOffer: TransferOffer = {
    id: `clause_off_${state.gameDate}_${player.id}`,
    date: state.gameDate,
    playerId: player.id,
    buyingClubId: myClub.id,
    sellingClubId: oldClub?.id || myClub.id,
    offerType: 'Transfer',
    upfrontFee: fee,
    installmentsFee: 0,
    sellOnPercentage: 0,
    proposedWagePerWeek: newWage,
    proposedContractYears: 4,
    proposedSquadStatus: 'Important Player',
    signingBonus: 0,
    agentFee: 0,
    status: 'Completed',
  };

  return {
    nextState: {
      ...state,
      clubs: updatedClubs,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      transferOffers: [completedOffer, ...state.transferOffers],
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_clause_${state.gameDate}_${player.id}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `${useBargainDiscount ? 'Deadline Day Bargain Completed' : 'Release Clause Activated'}: ${player.firstName} ${player.lastName} Signs for ${myClub.name} (€${(fee / 1_000_000).toFixed(2)}M)!`,
            `${useBargainDiscount ? 'ปิดดีลด่วนวันเส้นตายสำเร็จ' : 'ฉีกสัญญาคว้าตัวสำเร็จ'}: ${player.firstName} ${player.lastName} ย้ายซบ ${myClub.name} (€${(fee / 1_000_000).toFixed(2)}M)!`
          ),
          body: trText(
            `${myClub.name} have completed the immediate signing of ${player.firstName} ${player.lastName} from ${oldClub?.name || 'his former club'} for €${(fee / 1_000_000).toFixed(2)}M.`,
            `${myClub.name} ปิดดีลคว้าตัว ${player.firstName} ${player.lastName} จาก ${oldClub?.name || 'สโมสรเดิม'} ด้วยค่าตัว €${(fee / 1_000_000).toFixed(2)}M เรียบร้อยแล้ว`
          ),
          isRead: false,
          isImportant: true,
          relatedPlayerId: player.id,
          relatedClubId: myClub.id,
        },
        ...state.inbox,
      ],
    },
    outcome: 'COMPLETED',
    message: trText(
      `Signed ${player.firstName} ${player.lastName} immediately for €${(fee / 1_000_000).toFixed(2)}M!`,
      `คว้าตัว ${player.firstName} ${player.lastName} ร่วมทีมทันทีด้วยค่าตัว €${(fee / 1_000_000).toFixed(2)}M สำเร็จ!`
    ),
  };
}



