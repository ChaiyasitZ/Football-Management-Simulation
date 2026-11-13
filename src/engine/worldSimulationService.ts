import {
  Club,
  CustomClubConfig,
  FanSocialPost,
  FinanceTransaction,
  Fixture,
  HallOfFameEntry,
  LeagueId,
  LeagueStanding,
  ManagerProfile,
  MatchResult,
  MatchTeamStats,
  MentoringGroup,
  MindGameTone,
  NationalTeamCode,
  NewsItem,
  Player,
  PlayerRole,
  PlayerTrait,
  PositionCode,
  PositionGroup,
  PreSeasonTourRegion,
  ScenarioChallengeId,
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
  checkAndAdvanceEuroCup,
  generateEuropeanNationsCupFixtures,
  generateInitialDomesticCupFixtures,
  generateLeagueSchedule,
  createInitialStandings,
  getDomesticCupFixtureWinnerId,
} from './leagueEngine';
import { simulateMatch } from './matchEngine';
import { SeededRNG } from './random';
import { autoPickLineup, ROLES_BY_POSITION } from './tacticsEngine';
import {
  buildUefaFourPots,
  checkAndAdvanceUefaKnockoutPhase,
  generateUefaSwissSchedule,
  recomputeUefaStandings,
  selectUefaQualifiedClubs,
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

  // European Nations Cup (INT_EURO) advancement (QF -> SF -> FINAL)
  if (existingFixture.competitionId === 'INT_EURO') {
    const newEuroFixtures = checkAndAdvanceEuroCup(
      nextState.fixtures,
      nextState.currentSeason,
      nextState.gameDate
    );
    if (newEuroFixtures.length > 0) {
      nextState = {
        ...nextState,
        fixtures: [...nextState.fixtures, ...newEuroFixtures],
      };
    } else if (existingFixture.uefaStage === 'FINAL') {
      const winnerId = getDomesticCupFixtureWinnerId(completedFixture);
      const runnerUpId =
        winnerId === completedFixture.homeClubId
          ? completedFixture.awayClubId
          : completedFixture.homeClubId;
      const winClub = winnerId ? nextState.clubs[winnerId] : undefined;
      const runClub = runnerUpId ? nextState.clubs[runnerUpId] : undefined;
      if (winClub) {
        const euroTrophy: TrophyHistoryRecord = {
          id: `trp_${nextState.currentSeason.replace('/', '')}_INT_EURO`,
          season: nextState.currentSeason,
          competitionId: 'INT_EURO',
          competitionName: `European Nations Cup (${winClub.countryId})`,
          winnerClubId: winClub.id,
          winnerClubName: `${winClub.countryId} National Team (${winClub.name})`,
          runnerUpClubId: runClub?.id,
          runnerUpClubName: runClub ? `${runClub.countryId} National Team` : undefined,
        };
        nextState = {
          ...nextState,
          trophyHistory: [euroTrophy, ...(nextState.trophyHistory || [])],
          inbox: [
            {
              id: `news_euro_win_${nextState.gameDate}`,
              gameDate: nextState.gameDate,
              category: 'Competition',
              title: trText(
                `${winClub.countryId} Crowned European Nations Cup Champions!`,
                `ทีมชาติ ${winClub.countryId} ผงาดคว้าแชมป์เจ้ายุโรป (European Nations Cup)!`
              ),
              body: trText(
                `${winClub.countryId} have lifted the European Nations Cup trophy after victory in the Grand Final!`,
                `ทีมชาติ ${winClub.countryId} คว้าแชมป์ทัวร์นาเมนต์ European Nations Cup ไปครองอย่างยิ่งใหญ่!`
              ),
              isRead: false,
              isImportant: true,
              relatedClubId: winClub.id,
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
        if (asgn.regionOrLeague === 'SOUTH_AMERICA') {
          if (p.nationalityCode !== 'BRA' && p.nationalityCode !== 'ARG') return false;
        } else if (asgn.regionOrLeague !== 'ALL_EUROPE' && club.leagueId !== asgn.regionOrLeague) {
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

  // Checkpoint 13: FIFA International Break Call-Ups (Mid-October & Late-March)
  if (nextDate.endsWith('-10-12') || nextDate.endsWith('-03-22')) {
    nextState = triggerFifaInternationalBreak(nextState).nextState;
  }

  // Checkpoint 15: Monthly AI Managerial Carousel & Sackings on the 1st of the month
  if (nextDate.endsWith('-01') && !nextDate.endsWith('-06-01')) {
    nextState = triggerAIManagerialCarouselCheck(nextState).nextState;
  }

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
    loanOptionToBuyFee?: number;
    buyBackClauseFee?: number;
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
    loanOptionToBuyFee: params.loanOptionToBuyFee,
    buyBackClauseFee: params.buyBackClauseFee,
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

  // 1. Award League Prize Money + TV Revenue + Sugar Daddy Owner Injection + Relegation Penalty (Checkpoint 18)
  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    const relSpots = league.relegationSpots || 3;
    table.forEach((row, idx) => {
      const club = updatedClubs[row.clubId];
      if (!club) return;
      const isRelegated = league.tier !== 2 && idx >= table.length - relSpots;
      const positionPrize = Math.max(
        1_500_000,
        (20 - idx) * (league.tier === 2 ? 650_000 : 2_200_000)
      );
      const tvMoney = league.tvRevenuePerClub || 15_000_000;
      const relegationDropPenalty = isRelegated ? -4_000_000 : 0;
      const sugarDaddyInjection =
        club.sugarDaddyType === 'FRONT_END'
          ? 35_000_000
          : club.sugarDaddyType === 'BACK_END'
            ? 18_000_000
            : club.sugarDaddyType === 'UNDERWRITER' && club.finances.balance < 0
              ? Math.abs(club.finances.balance) + 10_000_000
              : 0;

      const totalAdded = positionPrize + tvMoney + sugarDaddyInjection + relegationDropPenalty;
      updatedClubs[club.id] = {
        ...club,
        reputation: isRelegated ? Math.max(30, club.reputation - 8) : club.reputation,
        finances: {
          ...club.finances,
          balance: club.finances.balance + totalAdded,
          transferBudget: Math.max(
            1_000_000,
            club.finances.transferBudget +
              Math.round(positionPrize * 0.55 + sugarDaddyInjection * 0.8 + relegationDropPenalty * 0.5)
          ),
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
            `End of Season Payout: Finish #${idx + 1} Prize + TV Revenue${sugarDaddyInjection > 0 ? ' + Owner Investment' : ''}${isRelegated ? ' (Relegation Drop Penalty -€4.0M)' : ''}`,
            `เงินรางวัลจบฤดูกาล: อันดับ #${idx + 1} + ค่าลิขสิทธิ์ถ่ายทอดสด${sugarDaddyInjection > 0 ? ' + เงินอัดฉีดเจ้าของสโมสร' : ''}${isRelegated ? ' (หักรายได้ตกชั้น -€4.0M)' : ''}`
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

  // Evaluate FFP / PSR compliance at season end; clubs in breach get -6 points deduction for next season
  for (const [cid, c] of Object.entries(updatedClubs)) {
    const ffp = evaluateClubFFPStatus({ ...state, clubs: updatedClubs, transactions: nextTransactions }, cid);
    if (ffp.status === 'BREACH') {
      updatedClubs[cid] = {
        ...c,
        pointsDeduction: 6,
      };
      if (cid === state.controlledClubId) {
        nextInbox.unshift({
          id: `news_ffp_breach_${nextYear}_${cid}`,
          gameDate: `${nextYear}-07-15`,
          category: 'Board',
          title: trText(
            `FFP / PSR Breach Sanction: ${c.name} Handed -6 Points Deduction for ${nextSeasonStr}`,
            `บทลงโทษละเมิดกฎการเงิน FFP / PSR: ${c.name} ถูกสั่งตัด -6 คะแนนในฤดูกาล ${nextSeasonStr}`
          ),
          body: trText(
            `The Independent Financial Commission has docked ${c.name} 6 league points for the ${nextSeasonStr} campaign after net seasonal losses exceeded the €105.0M Profitability & Sustainability threshold.`,
            `คณะกรรมการควบคุมการเงินของลีกมีมติสั่งตัดแต้ม ${c.name} จำนวน -6 คะแนนในการแข่งขันฤดูกาล ${nextSeasonStr} เนื่องจากผลประกอบการขาดทุนเกินเพดานกฎ FFP / PSR (€105.0M)`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: cid,
        });
      }
    } else if (state.scenarioChallenge !== 'POINTS_DEDUCTION') {
      updatedClubs[cid] = {
        ...c,
        pointsDeduction: 0,
      };
    }
  }

  for (const league of Object.values(LEAGUES_CONFIG)) {
    const clubsInLeague = Object.values(updatedClubs).filter((c) => c.leagueId === league.id);
    const clubIds = clubsInLeague.map((c) => c.id);
    nextStandings[league.id] = createInitialStandings(league.id, nextSeasonStr, clubIds, updatedClubs);
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

  // 3b. Seed 3-Tier European Cups (UEFA_UCL, UEFA_UEL, UEFA_UECL) from final standings (Checkpoint 18)
  const uefaQualified = selectUefaQualifiedClubs(updatedClubs, state.standings);
  const nextUefaPots: Record<UefaCompetitionId, string[][]> = {
    UEFA_UCL: buildUefaFourPots(uefaQualified.UEFA_UCL, updatedClubs),
    UEFA_UEL: buildUefaFourPots(uefaQualified.UEFA_UEL, updatedClubs),
    UEFA_UECL: buildUefaFourPots(uefaQualified.UEFA_UECL, updatedClubs),
  };
  const nextUefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };
  for (const compId of ['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]) {
    const swissFixtures = generateUefaSwissSchedule(compId, nextUefaPots[compId], nextSeasonStr, rng);
    nextFixtures = [...nextFixtures, ...swissFixtures];
    nextUefaStandings[compId] = recomputeUefaStandings(
      compId,
      nextSeasonStr,
      uefaQualified[compId],
      [],
      updatedClubs
    );
  }

  const nextEuroFixtures = generateEuropeanNationsCupFixtures(
    nextSeasonStr,
    nextYear + 1,
    updatedClubs
  );
  nextFixtures = [...nextFixtures, ...nextEuroFixtures];

  nextFixtures.sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate));

  let workingState: WorldState = {
    ...state,
    currentSeason: nextSeasonStr,
    gameDate: `${nextYear}-07-15`,
    manager: updatedManager,
    clubs: updatedClubs,
    players: updatedPlayers,
    standings: nextStandings,
    uefaStandings: nextUefaStandings,
    uefaPots: nextUefaPots,
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
  controlledNationalTeamCode?: NationalTeamCode | null;
  scenarioChallenge?: ScenarioChallengeId;
  customClubConfig?: CustomClubConfig | null;
  lastMindGameMatchday?: number;
  socialFeed?: FanSocialPost[];
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
    controlledNationalTeamCode: compacted.controlledNationalTeamCode || null,
    scenarioChallenge: compacted.scenarioChallenge || 'STANDARD',
    customClubConfig: compacted.customClubConfig || null,
    lastMindGameMatchday: compacted.lastMindGameMatchday || 0,
    socialFeed: (compacted.socialFeed || []).slice(0, 15),
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
    docData.controlledClubId,
    cs.scenarioChallenge || 'STANDARD',
    cs.customClubConfig || null
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
    controlledNationalTeamCode:
      cs.controlledNationalTeamCode !== undefined
        ? cs.controlledNationalTeamCode
        : baseline.controlledNationalTeamCode || null,
    scenarioChallenge: cs.scenarioChallenge || baseline.scenarioChallenge || 'STANDARD',
    customClubConfig: cs.customClubConfig || baseline.customClubConfig || null,
    lastMindGameMatchday: cs.lastMindGameMatchday || 0,
    socialFeed: cs.socialFeed || baseline.socialFeed || [],
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

/**
 * Checkpoint 13: International Management, FIFA Call-Up Breaks & European Nations Cup ('INT_EURO')
 */
export const NATIONAL_TEAMS_CATALOG: {
  code: NationalTeamCode;
  nameEn: string;
  nameTh: string;
  flag: string;
  fifaRanking: number;
}[] = [
  { code: 'ENG', nameEn: 'England', nameTh: 'ทีมชาติอังกฤษ (England)', flag: 'ENG', fifaRanking: 4 },
  { code: 'ESP', nameEn: 'Spain', nameTh: 'ทีมชาติสเปน (Spain)', flag: 'ESP', fifaRanking: 2 },
  { code: 'GER', nameEn: 'Germany', nameTh: 'ทีมชาติเยอรมนี (Germany)', flag: 'GER', fifaRanking: 8 },
  { code: 'ITA', nameEn: 'Italy', nameTh: 'ทีมชาติอิตาลี (Italy)', flag: 'ITA', fifaRanking: 9 },
  { code: 'FRA', nameEn: 'France', nameTh: 'ทีมชาติฝรั่งเศส (France)', flag: 'FRA', fifaRanking: 3 },
  { code: 'BRA', nameEn: 'Brazil', nameTh: 'ทีมชาติบราซิล (Brazil)', flag: 'BRA', fifaRanking: 5 },
  { code: 'ARG', nameEn: 'Argentina', nameTh: 'ทีมชาติอาร์เจนตินา (Argentina)', flag: 'ARG', fifaRanking: 1 },
  { code: 'POR', nameEn: 'Portugal', nameTh: 'ทีมชาติโปรตุเกส (Portugal)', flag: 'POR', fifaRanking: 6 },
];

export function appointNationalTeamManager(
  state: WorldState,
  nationCode: NationalTeamCode | null
): { nextState: WorldState; message: string } {
  if (!nationCode) {
    return {
      nextState: {
        ...state,
        controlledNationalTeamCode: null,
      },
      message: trText(
        'Resigned from National Team duties to focus 100% on club management.',
        'ลาออกจากตำแหน่งผู้จัดการทีมชาติเพื่อโฟกัสงานคุมสโมสรเต็มตัว'
      ),
    };
  }

  const natMeta = NATIONAL_TEAMS_CATALOG.find((n) => n.code === nationCode);
  const nationNameEn = natMeta?.nameEn || nationCode;
  const nationNameTh = natMeta?.nameTh || nationCode;

  return {
    nextState: {
      ...state,
      controlledNationalTeamCode: nationCode,
      inbox: [
        {
          id: `news_nat_appoint_${state.gameDate}_${nationCode}`,
          gameDate: state.gameDate,
          category: 'Competition',
          title: trText(
            `Dual Role Confirmed: ${state.manager.name} Appointed ${nationNameEn} National Team Manager!`,
            `รับงานควบทีมชาติ: ${state.manager.name} ได้รับแต่งตั้งคุมทัพ ${nationNameTh}!`
          ),
          body: trText(
            `The Football Federation of ${nationNameEn} has appointed ${state.manager.name} as head coach alongside your club role at ${state.clubs[state.controlledClubId]?.name}. You will lead ${nationNameEn} into FIFA International Breaks and the European / World Nations Cup!`,
            `สหพันธ์ฟุตบอลแต่งตั้งให้ ${state.manager.name} กุมบังเหียน ${nationNameTh} ควบคู่กับการคุมสโมสร ${state.clubs[state.controlledClubId]?.name} เพื่อลุยศึก FIFA Break และทัวร์นาเมนต์ชิงแชมป์ทีมชาติ!`
          ),
          isRead: false,
          isImportant: true,
        },
        ...state.inbox,
      ],
    },
    message: trText(
      `Appointed Head Coach of ${nationNameEn} National Team (Dual Club & Country Role)!`,
      `เข้ารับตำแหน่งกุนซือ ${nationNameTh} ควบคู่กับสโมสรเรียบร้อยแล้ว!`
    ),
  };
}

export function triggerFifaInternationalBreak(
  state: WorldState
): { nextState: WorldState; calledUpCount: number; injuredNames: string[]; message: string } {
  const rng = new SeededRNG(state.randomSeed + state.processedDates.length * 43 + 7);
  const updatedPlayers = { ...state.players };
  const myClubPlayersCalledUp: Player[] = [];
  const injuredNames: string[] = [];

  for (const [pid, p] of Object.entries(updatedPlayers)) {
    if (p.injuryStatus.isInjured || p.currentAbility < 135) continue;
    const isMyClub = p.clubId === state.controlledClubId;
    if (isMyClub) {
      myClubPlayersCalledUp.push(p);
    }

    const sufferedVirusInjury = rng.chance(0.025);
    if (sufferedVirusInjury) {
      if (isMyClub) {
        injuredNames.push(`${p.firstName} ${p.lastName}`);
      }
      updatedPlayers[pid] = {
        ...p,
        morale: Math.min(100, p.morale + 2),
        fitness: Math.max(55, p.fitness - 10),
        injuryStatus: {
          isInjured: true,
          type: 'International Duty Muscle Strain',
          daysRemaining: rng.int(7, 12),
        },
      };
    } else {
      updatedPlayers[pid] = {
        ...p,
        morale: Math.min(100, p.morale + 3),
        matchSharpness: Math.min(100, p.matchSharpness + 4),
        fitness: Math.max(62, p.fitness - 6),
      };
    }
  }

  const nextInbox = [...state.inbox];
  const myClub = state.clubs[state.controlledClubId];
  const callUpNames = myClubPlayersCalledUp
    .slice(0, 6)
    .map((p) => `${p.firstName} ${p.lastName} (${p.nationalityCode})`)
    .join(', ');

  nextInbox.unshift({
    id: `news_fifa_break_${state.gameDate}_${Date.now()}`,
    gameDate: state.gameDate,
    category: 'Competition',
    title: trText(
      `FIFA International Break Report: ${myClubPlayersCalledUp.length} ${myClub?.shortName || ''} Players Called Up${injuredNames.length > 0 ? ` (${injuredNames.length} Injured)` : ''}`,
      `รายงานเบรกทีมชาติ FIFA: นักเตะ ${myClub?.shortName || ''} ติดทีมชาติ ${myClubPlayersCalledUp.length} คน${injuredNames.length > 0 ? ` (บาดเจ็บ ${injuredNames.length} คน)` : ''}`
    ),
    body: trText(
      `${myClubPlayersCalledUp.length} senior internationals (${callUpNames || 'Squad'}) represented their countries (+3 Morale, +4 Match Sharpness, -6% Fitness). ${
        injuredNames.length > 0
          ? `Medical Alert: ${injuredNames.join(', ')} returned with an International Duty Muscle Strain.`
          : 'All called-up players returned injury-free!'
      }`,
      `ผู้เล่นชุดใหญ่ ${myClubPlayersCalledUp.length} คน (${callUpNames || 'ขุมกำลัง'}) เดินทางไปรับใช้ทีมชาติ (+3 ขวัญกำลังใจ, +4 ความเฉียบคม, -6% ความฟิต) ${
        injuredNames.length > 0
          ? `แจ้งเตือนจากทีมแพทย์: ${injuredNames.join(', ')} ได้รับบาดเจ็บกล้ามเนื้อจากการรับใช้ทีมชาติ`
          : 'นักเตะทุกคนเดินทางกลับสโมสรโดยไม่มีอาการบาดเจ็บ!'
      }`
    ),
    isRead: false,
    isImportant: injuredNames.length > 0,
    relatedClubId: state.controlledClubId,
  });

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      inbox: nextInbox,
    },
    calledUpCount: myClubPlayersCalledUp.length,
    injuredNames,
    message: trText(
      `FIFA International Break processed: ${myClubPlayersCalledUp.length} players called up (${injuredNames.length} injuries).`,
      `ประมวลผลช่วงเบรกทีมชาติ FIFA เรียบร้อย: นักเตะติดทีมชาติ ${myClubPlayersCalledUp.length} คน (บาดเจ็บ ${injuredNames.length} คน)`
    ),
  };
}

export function simulateEuroCupNextStage(
  state: WorldState
): { nextState: WorldState; message: string } {
  let working = { ...state };
  let euroScheduled = working.fixtures.filter(
    (f) => f.competitionId === 'INT_EURO' && f.seasonId === working.currentSeason && f.status === 'Scheduled'
  );

  if (euroScheduled.length === 0) {
    const endYear = (parseInt(working.currentSeason.slice(0, 4), 10) || 2025) + 1;
    const generated = generateEuropeanNationsCupFixtures(
      working.currentSeason,
      endYear,
      working.clubs
    );
    working = {
      ...working,
      fixtures: [...working.fixtures, ...generated],
    };
    euroScheduled = generated;
  }

  for (const fix of euroScheduled) {
    const home = working.clubs[fix.homeClubId];
    const away = working.clubs[fix.awayClubId];
    if (!home || !away) continue;
    const seed = working.randomSeed + fix.id.length * 37 + Date.now() % 1000;
    const res = simulateMatch(fix, home, away, working.players, seed);
    working = applyMatchResultToWorld(working, fix.id, res);
  }

  return {
    nextState: working,
    message: trText(
      `Simulated European Nations Cup (${euroScheduled[0]?.uefaStage || 'Knockout'}) round!`,
      `จำลองผลการแข่งขันชิงแชมป์แห่งชาติยุโรป รอบ ${euroScheduled[0]?.uefaStage || 'Knockout'} เรียบร้อยแล้ว!`
    ),
  };
}

/**
 * Checkpoint 14: Stadium Expansion, Pre-Season Commercial Tours & FFP / PSR Rules
 */
export function expandClubStadium(
  state: WorldState
): { nextState: WorldState; success: boolean; message: string } {
  const club = { ...state.clubs[state.controlledClubId] };
  const expansionCost = 12_000_000;
  const seatsAdded = 8_000;

  if (club.finances.balance < expansionCost) {
    return {
      nextState: state,
      success: false,
      message: trText(
        `Insufficient club balance to expand ${club.stadiumName} (€12.0M required, €${(club.finances.balance / 1_000_000).toFixed(2)}M available).`,
        `ยอดเงินคงเหลือของสโมสรไม่เพียงพอสำหรับการขยายสนาม ${club.stadiumName} (ต้องใช้ €12.0M แต่มี €${(club.finances.balance / 1_000_000).toFixed(2)}M)`
      ),
    };
  }

  const newBalance = club.finances.balance - expansionCost;
  const newCapacity = club.stadiumCapacity + seatsAdded;
  club.stadiumCapacity = newCapacity;
  club.finances = {
    ...club.finances,
    balance: newBalance,
  };

  const tx: FinanceTransaction = {
    id: `tx_stadium_${state.gameDate}_${Date.now()}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Facilities & Maintenance',
    amount: -expansionCost,
    description: trText(
      `Stadium Expansion at ${club.stadiumName}: +8,000 Seats (New Capacity: ${newCapacity.toLocaleString()})`,
      `ขยายความจุสนาม ${club.stadiumName}: +8,000 ที่นั่ง (ความจุใหม่: ${newCapacity.toLocaleString()} ที่นั่ง)`
    ),
    balanceAfter: newBalance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_stadium_${state.gameDate}_${Date.now()}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `Stadium Expansion Approved: ${club.stadiumName} Expanded to ${newCapacity.toLocaleString()} Seats!`,
            `อนุมัติขยายสนาม: ${club.stadiumName} เพิ่มความจุเป็น ${newCapacity.toLocaleString()} ที่นั่ง!`
          ),
          body: trText(
            `The Board of Directors has completed a €12.0M stadium expansion at ${club.stadiumName}, adding +8,000 seats and permanently boosting home matchday gate receipts.`,
            `บอร์ดบริหารอนุมัติงบ €12.0M ขยายความจุสนาม ${club.stadiumName} เพิ่มขึ้นอีก +8,000 ที่นั่ง ช่วยเพิ่มรายได้ค่าตั๋วเข้าชมเกมเหย้าอย่างถาวร`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: trText(
      `Expanded ${club.stadiumName} by +8,000 seats to ${newCapacity.toLocaleString()} capacity!`,
      `ขยายความจุสนาม ${club.stadiumName} เพิ่มขึ้น +8,000 ที่นั่ง (รวม ${newCapacity.toLocaleString()} ที่นั่ง) สำเร็จ!`
    ),
  };
}

export function organizePreSeasonTour(
  state: WorldState,
  region: PreSeasonTourRegion
): { nextState: WorldState; success: boolean; message: string } {
  const club = { ...state.clubs[state.controlledClubId] };
  if (club.preSeasonTourCompletedSeason === state.currentSeason) {
    return {
      nextState: state,
      success: false,
      message: trText(
        `Your club has already completed a Pre-Season Commercial Tour in the ${state.currentSeason} season.`,
        `สโมสรของคุณได้จัดทัวร์ปรีซีซั่นประจำฤดูกาล ${state.currentSeason} ไปเรียบร้อยแล้ว`
      ),
    };
  }

  const tourSpec =
    region === 'ASIA'
      ? {
          revenue: 4_500_000,
          labelEn: 'Asia Commercial Tour (Tokyo & Seoul)',
          labelTh: 'ทัวร์เอเชีย (โตเกียว & โซล)',
        }
      : region === 'USA'
        ? {
            revenue: 5_000_000,
            labelEn: 'North America Commercial Tour (New York & Los Angeles)',
            labelTh: 'ทัวร์อเมริกาเหนือ (นิวยอร์ก & ลอสแอนเจลิส)',
          }
        : {
            revenue: 5_500_000,
            labelEn: 'Middle East Commercial Showcase (Dubai & Riyadh)',
            labelTh: 'ทัวร์ตะวันออกกลาง (ดูไบ & ริยาด)',
          };

  const newBalance = club.finances.balance + tourSpec.revenue;
  club.preSeasonTourCompletedSeason = state.currentSeason;
  club.finances = {
    ...club.finances,
    balance: newBalance,
    transferBudget: club.finances.transferBudget + Math.round(tourSpec.revenue * 0.7),
  };

  const updatedPlayers = { ...state.players };
  for (const [pid, p] of Object.entries(updatedPlayers)) {
    if (p.clubId === club.id && !p.injuryStatus.isInjured) {
      updatedPlayers[pid] = {
        ...p,
        matchSharpness: Math.min(100, p.matchSharpness + 4),
        morale: Math.min(100, p.morale + 2),
      };
    }
  }

  const tx: FinanceTransaction = {
    id: `tx_tour_${region}_${state.gameDate}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Sponsorship',
    amount: tourSpec.revenue,
    description: trText(
      `Commercial Tour Revenue: ${tourSpec.labelEn} (+€${(tourSpec.revenue / 1_000_000).toFixed(1)}M)`,
      `รายได้จัดทัวร์ комเมอร์เชียล: ${tourSpec.labelTh} (+€${(tourSpec.revenue / 1_000_000).toFixed(1)}M)`
    ),
    balanceAfter: newBalance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      players: updatedPlayers,
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_tour_${region}_${state.gameDate}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `${tourSpec.labelEn} Completed: +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M Commercial Income!`,
            `สำเร็จทัวร์ปรีซีซั่น ${tourSpec.labelTh}: รับรายได้เข้าสโมสร +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M!`
          ),
          body: trText(
            `${club.name} concluded a highly lucrative ${tourSpec.labelEn}, generating €${(tourSpec.revenue / 1_000_000).toFixed(1)}M in global merchandise and sponsorship revenue while boosting squad Match Sharpness (+4%).`,
            `สโมสร ${club.name} ปิดฉากการเดินทางทัวร์ ${tourSpec.labelTh} อย่างสวยงาม กวาดรายได้สปอนเซอร์และสินค้าที่ระลึก +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M พร้อมเพิ่มความเฉียบคม (Match Sharpness) ให้ขุมกำลัง +4%`
          ),
          isRead: false,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: trText(
      `Completed ${tourSpec.labelEn}! Earned +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M and +4% Match Sharpness.`,
      `จัดทัวร์ ${tourSpec.labelTh} สำเร็จ! รับรายได้ +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M และเพิ่มความเฉียบคมนักเตะ +4%`
    ),
  };
}

export function evaluateClubFFPStatus(
  state: WorldState,
  targetClubId?: string
): {
  status: 'COMPLIANT' | 'WATCHLIST' | 'BREACH';
  projectedLoss: number;
  maxAllowedLoss: number;
  headroom: number;
} {
  const cid = targetClubId || state.controlledClubId;
  const club = state.clubs[cid];
  const maxAllowedLoss = 105_000_000;
  if (!club) {
    return { status: 'COMPLIANT', projectedLoss: 0, maxAllowedLoss, headroom: maxAllowedLoss };
  }

  const clubTxs = state.transactions.filter((t) => t.clubId === cid);
  const netTx = clubTxs.reduce((acc, t) => acc + t.amount, 0);
  const annualWageBill = club.finances.wageUsedPerWeek * 52;
  const annualSponsor = club.finances.sponsorRevenueAnnual;
  const projectedBalance = netTx + annualSponsor - annualWageBill * 0.55;
  const projectedLoss = Math.max(0, -projectedBalance + (club.finances.balance < 0 ? Math.abs(club.finances.balance) : 0));
  const headroom = maxAllowedLoss - projectedLoss;

  const status =
    projectedLoss > maxAllowedLoss
      ? 'BREACH'
      : projectedLoss >= maxAllowedLoss * 0.72
        ? 'WATCHLIST'
        : 'COMPLIANT';

  return {
    status,
    projectedLoss: Math.round(projectedLoss),
    maxAllowedLoss,
    headroom: Math.round(headroom),
  };
}

/**
 * Checkpoint 15: AI Managerial Carousel (Monthly Sackings) & Pre-Match Rivalry Mind Games
 */
const REPLACEMENT_MANAGERS_POOL = [
  'Zinedine Zidane',
  'Julian Nagelsmann',
  'Xavi Hernandez',
  'Roberto De Zerbi',
  'Massimiliano Allegri',
  'Thomas Tuchel',
  'Mauricio Pochettino',
  'Gareth Southgate',
  'Ruben Amorim',
  'Edin Terzic',
  'Sergio Conceicao',
  'Joachim Low',
];

export function triggerAIManagerialCarouselCheck(
  state: WorldState
): { nextState: WorldState; sackedCount: number; message: string } {
  const updatedClubs = { ...state.clubs };
  const nextInbox = [...state.inbox];
  let sackedCount = 0;

  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    table.forEach((row, idx) => {
      if (row.clubId === state.controlledClubId) return;
      if (row.played < 4) return;
      const club = updatedClubs[row.clubId];
      if (!club) return;

      const rank = idx + 1;
      const expectedRank = club.boardExpectations.targetLeaguePosition;
      const underperformance = rank - expectedRank;

      if (underperformance >= 6) {
        const nextSecurity = Math.max(15, (club.aiManager.jobSecurity || 70) - 28);
        if (nextSecurity <= 35 && sackedCount < 2) {
          const oldManagerName = club.aiManager.name;
          const newManagerName =
            REPLACEMENT_MANAGERS_POOL.find((n) => n !== oldManagerName) || 'Zinedine Zidane';
          updatedClubs[club.id] = {
            ...club,
            aiManager: {
              ...club.aiManager,
              name: newManagerName,
              jobSecurity: 78,
            },
            boardExpectations: {
              ...club.boardExpectations,
              confidence: {
                ...club.boardExpectations.confidence,
                overall: 52,
              },
            },
          };
          sackedCount++;

          nextInbox.unshift({
            id: `news_ai_sacked_${state.gameDate}_${club.id}`,
            gameDate: state.gameDate,
            category: 'Media',
            title: trText(
              `Managerial Sacking: ${club.name} Part Ways with ${oldManagerName}, Appoint ${newManagerName}!`,
              `เก้าอี้กุนซือร้อน! ${club.name} สั่งปลด ${oldManagerName} และแต่งตั้ง ${newManagerName} คุมทัพแทน!`
            ),
            body: trText(
              `With ${club.name} sitting #${rank} in ${league.name} (Target: Top ${expectedRank}), the Board of Directors has sacked ${oldManagerName} and appointed ${newManagerName} with immediate effect.`,
              `หลังจากผลงานของ ${club.name} ร่วงลงไปอยู่อันดับ #${rank} ในศึก ${league.name} (เป้าหมาย: ท็อป ${expectedRank}) บอร์ดบริหารจึงมีมติปลด ${oldManagerName} และแต่งตั้ง ${newManagerName} เข้ามารับเผือกร้อนทันที`
            ),
            isRead: false,
            relatedClubId: club.id,
          });
        } else {
          updatedClubs[club.id] = {
            ...club,
            aiManager: {
              ...club.aiManager,
              jobSecurity: nextSecurity,
            },
            boardExpectations: {
              ...club.boardExpectations,
              confidence: {
                ...club.boardExpectations.confidence,
                overall: Math.min(54, club.boardExpectations.confidence.overall),
              },
            },
          };
        }
      }
    });
  }

  return {
    nextState: {
      ...state,
      clubs: updatedClubs,
      inbox: nextInbox,
    },
    sackedCount,
    message: trText(
      `Evaluated AI Managerial Job Security across 15 leagues (${sackedCount} sackings).`,
      `ประเมินความมั่นคงเก้าอี้กุนซือ AI ทั้ง 15 ลีกเรียบร้อย (ปลดโค้ช ${sackedCount} สโมสร)`
    ),
  };
}

export function sendPreMatchMindGame(
  state: WorldState,
  tone: MindGameTone
): { nextState: WorldState; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const nextFixture = state.fixtures.find(
    (f) =>
      f.status === 'Scheduled' &&
      (f.homeClubId === myClub.id || f.awayClubId === myClub.id)
  );
  if (!nextFixture) {
    return {
      nextState: state,
      message: trText('No upcoming fixture scheduled.', 'ไม่มีโปรแกรมการแข่งขันนัดถัดไป'),
    };
  }

  if (state.lastMindGameMatchday === nextFixture.matchday) {
    return {
      nextState: state,
      message: trText(
        `You have already addressed the media regarding Matchday ${nextFixture.matchday}.`,
        `คุณได้ส่งสารจิตวิทยาผ่านสื่อสำหรับเกมนัดที่ ${nextFixture.matchday} ไปเรียบร้อยแล้ว`
      ),
    };
  }

  const oppClubId =
    nextFixture.homeClubId === myClub.id ? nextFixture.awayClubId : nextFixture.homeClubId;
  const oppClub = state.clubs[oppClubId];
  const oppMgrName = oppClub?.aiManager.name || 'Opponent Manager';

  const updatedPlayers = { ...state.players };
  for (const [pid, p] of Object.entries(updatedPlayers)) {
    if (p.clubId === myClub.id) {
      const age = getAgeAtDate(p.dateOfBirth, state.gameDate);
      const boost = tone === 'deflect' && age <= 21 ? 5 : 2;
      updatedPlayers[pid] = {
        ...p,
        morale: Math.min(100, p.morale + boost),
      };
    } else if (p.clubId === oppClubId && tone === 'attack') {
      updatedPlayers[pid] = {
        ...p,
        morale: Math.max(25, p.morale - 3),
      };
    }
  }

  const headlineEn =
    tone === 'attack'
      ? `Mind Games War: ${state.manager.name} Questions ${oppMgrName}'s Tactical Nerve Ahead of ${oppClub?.shortName} Clash!`
      : tone === 'praise'
        ? `Mutual Respect: ${state.manager.name}Hails ${oppMgrName}'s Work at ${oppClub?.name}`
        : `Focus Within: ${state.manager.name} Shields Youngsters from Media Pressure Ahead of ${oppClub?.shortName}`;

  const headlineTh =
    tone === 'attack'
      ? `สงครามจิตวิทยาเดือด! ${state.manager.name} เปิดศึกกดดัน ${oppMgrName} ก่อนดวล ${oppClub?.shortName}!`
      : tone === 'praise'
        ? `ให้เกียรติคู่แข่ง: ${state.manager.name} ชื่นชมฝีมือการทำทีมของ ${oppMgrName} แห่ง ${oppClub?.name}`
        : `ลดความกดดัน: ${state.manager.name} ออกโรงปกป้องดาวรุ่งและเน้นสมาธิก่อนพบ ${oppClub?.shortName}`;

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      lastMindGameMatchday: nextFixture.matchday,
      inbox: [
        {
          id: `news_mindgame_${state.gameDate}_md${nextFixture.matchday}`,
          gameDate: state.gameDate,
          category: 'Media',
          title: trText(headlineEn, headlineTh),
          body: trText(
            `Your pre-match comments directed at ${oppMgrName} (${oppClub?.name}) made back-page headlines and boosted your squad's morale ahead of Matchday ${nextFixture.matchday}.`,
            `คำสัมภาษณ์เชิงจิตวิทยาของคุณถึง ${oppMgrName} (${oppClub?.name}) กลายเป็นพาดหัวข่าวใหญ่และช่วยเพิ่มขวัญกำลังใจให้ลูกทีมก่อนศึกนัดที่ ${nextFixture.matchday}`
          ),
          isRead: false,
          relatedClubId: oppClubId,
        },
        ...state.inbox,
      ],
    },
    message: trText(headlineEn, headlineTh),
  };
}

/**
 * Checkpoint 20: In-Game Database Editor, Create-a-Player (Wonderkid Builder) & JSON Career/Roster Import/Export
 */
export function createCustomPlayerInWorld(
  state: WorldState,
  params: {
    firstName: string;
    lastName: string;
    nationality?: string;
    nationalityCode?: string;
    age: number;
    position: PositionCode;
    preferredRole?: PlayerRole;
    currentAbility: number;
    potentialAbility: number;
    clubId?: string;
  }
): { nextState: WorldState; player: Player; message: string } {
  const targetClubId = params.clubId || state.controlledClubId;
  const club = state.clubs[targetClubId] || state.clubs[state.controlledClubId];
  const curYear = parseInt(state.gameDate.slice(0, 4), 10) || 2026;
  const age = Math.max(15, Math.min(40, params.age || 18));
  const ca = Math.max(60, Math.min(200, params.currentAbility || 135));
  const pa = Math.max(ca, Math.min(200, params.potentialAbility || 185));
  const pos: PositionCode = params.position || 'ST';
  const role: PlayerRole = params.preferredRole || ROLES_BY_POSITION[pos]?.[0] || 'Advanced Forward';
  const baseAttr = Math.max(8, Math.min(20, Math.round(ca / 9.5)));
  const { marketValue, wagePerWeek } = calculatePlayerValuation(ca, pa, age, club?.reputation || 80);
  const newId = `plr_custom_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const nat = (params.nationality || params.nationalityCode || 'ENG').toUpperCase();

  const newPlayer: Player = {
    id: newId,
    firstName: params.firstName.trim() || 'Leo',
    lastName: params.lastName.trim() || 'Wonderkid',
    dateOfBirth: `${curYear - age}-05-10`,
    nationality: nat,
    nationalityCode: nat,
    heightCm: 180,
    weightKg: 74,
    preferredFoot: 'Right',
    positions: [pos],
    preferredRole: role,
    currentAbility: ca,
    potentialAbility: pa,
    potentialRange: [Math.max(60, pa - 6), Math.min(200, pa + 4)],
    attributes: {
      technical: {
        finishing: pos === 'ST' || pos === 'AMR' || pos === 'AML' ? Math.min(20, baseAttr + 2) : baseAttr,
        firstTouch: Math.min(20, baseAttr + 1),
        passing: Math.min(20, baseAttr + 1),
        technique: Math.min(20, baseAttr + 2),
        dribbling: Math.min(20, baseAttr + 1),
        crossing: baseAttr,
        heading: baseAttr,
        tackling: ['DC', 'DL', 'DR', 'DM', 'CB', 'LB', 'RB'].includes(pos) ? Math.min(20, baseAttr + 2) : Math.max(6, baseAttr - 2),
        marking: ['DC', 'DL', 'DR', 'DM', 'CB', 'LB', 'RB'].includes(pos) ? Math.min(20, baseAttr + 2) : Math.max(6, baseAttr - 2),
        longShots: baseAttr,
        penaltyTaking: baseAttr,
        freeKickTaking: baseAttr,
        corners: baseAttr,
        ballControl: Math.min(20, baseAttr + 2),
      },
      mental: {
        decisions: Math.min(20, baseAttr + 1),
        vision: Math.min(20, baseAttr + 1),
        composure: Math.min(20, baseAttr + 1),
        concentration: baseAttr,
        positioning: baseAttr,
        anticipation: Math.min(20, baseAttr + 1),
        workRate: Math.min(20, baseAttr + 2),
        teamwork: Math.min(20, baseAttr + 1),
        leadership: 12,
        determination: 17,
        aggression: 12,
        flair: Math.min(20, baseAttr + 2),
        offTheBall: Math.min(20, baseAttr + 1),
        bravery: 13,
        consistency: Math.min(20, baseAttr + 1),
      },
      physical: {
        acceleration: Math.min(20, baseAttr + 2),
        pace: Math.min(20, baseAttr + 2),
        stamina: Math.min(20, baseAttr + 1),
        strength: baseAttr,
        agility: Math.min(20, baseAttr + 2),
        balance: Math.min(20, baseAttr + 1),
        jumpingReach: baseAttr,
        naturalFitness: 16,
      },
    },
    fitness: 100,
    matchSharpness: 92,
    morale: 95,
    tacticalFamiliarity: 88,
    squadStatus: ca >= 150 ? 'Star Player' : age <= 20 ? 'Breakthrough Prospect' : 'Regular Starter',
    satisfaction: 95,
    personality: pa >= 175 ? 'Model Citizen' : 'Ambitious',
    professionalism: 17,
    clubId: club.id,
    loanedFromClubId: null,
    wagePerWeek,
    contractEndDate: `${curYear + 4}-06-30`,
    goalBonus: 1500,
    marketValue,
    askingPrice: Math.round(marketValue * 1.35),
    transferListed: false,
    loanListed: false,
    injuryStatus: { isInjured: false, daysRemaining: 0 },
    individualTraining: { attributeFocus: 'Balanced', roleFocus: role, intensity: 'Medium' },
    stats: {
      appearances: 0,
      starts: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      cleanSheets: 0,
      minutesPlayed: 0,
      averageRating: 7.0,
      manOfTheMatch: 0,
    },
    developmentHistory: [{ date: state.gameDate, ca, keyAttributeChanges: [] }],
    transferHistory: [],
    isWonderkid: age <= 21 && pa >= 168,
    traits: pa >= 170 ? ['Places Shots', 'Tries Killer Balls Often'] : ['Runs With Ball Often'],
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [newId]: newPlayer,
      },
      inbox: [
        {
          id: `news_editor_plr_${newId}`,
          gameDate: state.gameDate,
          category: 'General News',
          title: trText(
            `Database Editor: Created ${newPlayer.firstName} ${newPlayer.lastName} (${pos}, CA ${ca}/PA ${pa}) at ${club.name}`,
            `Database Editor: สร้างนักเตะ ${newPlayer.firstName} ${newPlayer.lastName} (${pos}, CA ${ca}/PA ${pa}) เข้าสู่ ${club.name}`
          ),
          body: trText(
            `Custom player ${newPlayer.firstName} ${newPlayer.lastName} (Age ${age}, ${pos}, CA ${ca} / PA ${pa}) has been registered with ${club.name}.`,
            `ลงทะเบียนนักเตะสร้างเอง ${newPlayer.firstName} ${newPlayer.lastName} (วัย ${age} ปี, ${pos}, CA ${ca} / PA ${pa}) เข้าสู่สโมสร ${club.name} เรียบร้อยแล้ว`
          ),
          isRead: false,
          relatedClubId: club.id,
          relatedPlayerId: newId,
        },
        ...state.inbox,
      ],
    },
    player: newPlayer,
    message: trText(
      `Created ${newPlayer.firstName} ${newPlayer.lastName} (${pos}, CA ${ca}/PA ${pa}) at ${club.name}!`,
      `สร้างนักเตะ ${newPlayer.firstName} ${newPlayer.lastName} (${pos}, CA ${ca}/PA ${pa}) เข้าสู่ ${club.name} สำเร็จ!`
    ),
  };
}

export function liveEditClubFinancesAndFacilities(
  state: WorldState,
  clubIdOrParams:
    | string
    | {
        clubId?: string;
        balance?: number;
        balanceM?: number;
        transferBudget?: number;
        transferBudgetM?: number;
        wageBudgetPerWeek?: number;
        trainingFacilities?: number;
        youthFacilities?: number;
        reputation?: number;
      },
  maybeUpdates?: {
    balance?: number;
    transferBudget?: number;
    wageBudgetPerWeek?: number;
    trainingFacilities?: number;
    youthFacilities?: number;
    reputation?: number;
  }
): { nextState: WorldState; message: string } {
  const isStringId = typeof clubIdOrParams === 'string';
  const clubId = isStringId
    ? clubIdOrParams
    : clubIdOrParams.clubId || state.controlledClubId;
  const updates = isStringId ? maybeUpdates || {} : clubIdOrParams;

  const club = state.clubs[clubId];
  if (!club) {
    return { nextState: state, message: 'Club not found.' };
  }

  const nextBalance =
    updates.balance !== undefined
      ? updates.balance
      : 'balanceM' in updates && typeof updates.balanceM === 'number'
        ? Math.round(updates.balanceM * 1_000_000)
        : club.finances.balance;

  const nextTransferBudget =
    updates.transferBudget !== undefined
      ? Math.max(0, updates.transferBudget)
      : 'transferBudgetM' in updates && typeof updates.transferBudgetM === 'number'
        ? Math.max(0, Math.round(updates.transferBudgetM * 1_000_000))
        : club.finances.transferBudget;

  const updatedClub: Club = {
    ...club,
    reputation:
      updates.reputation !== undefined ? Math.max(10, Math.min(100, updates.reputation)) : club.reputation,
    trainingFacilities:
      updates.trainingFacilities !== undefined
        ? Math.max(1, Math.min(20, updates.trainingFacilities))
        : club.trainingFacilities,
    youthFacilities:
      updates.youthFacilities !== undefined
        ? Math.max(1, Math.min(20, updates.youthFacilities))
        : club.youthFacilities,
    finances: {
      ...club.finances,
      balance: nextBalance,
      transferBudget: nextTransferBudget,
      wageBudgetPerWeek:
        updates.wageBudgetPerWeek !== undefined
          ? Math.max(10_000, updates.wageBudgetPerWeek)
          : club.finances.wageBudgetPerWeek,
    },
  };
  return {
    nextState: {
      ...state,
      clubs: {
        ...state.clubs,
        [clubId]: updatedClub,
      },
    },
    message: trText(
      `Updated ${updatedClub.name} finances & facilities via In-Game Editor!`,
      `อัปเดตงบประมาณและศูนย์ฝึกของ ${updatedClub.name} ผ่าน In-Game Editor เรียบร้อย!`
    ),
  };
}

export function exportWorldDatabaseJson(state: WorldState): string {
  const compacted = compactWorldStateForStorage(state);
  return JSON.stringify(
    {
      schema: 'touchline-db-v1',
      ...compacted,
    },
    null,
    2
  );
}

export function importWorldDatabaseJson(
  stateOrJson: WorldState | string,
  maybeJson?: string
): { nextState: WorldState; success: boolean; message: string } {
  const fallbackState =
    typeof stateOrJson === 'object' && stateOrJson !== null
      ? stateOrJson
      : createInitialWorldState(20261110);
  const jsonString = typeof stateOrJson === 'string' ? stateOrJson : maybeJson || '';
  try {
    const parsed = JSON.parse(jsonString) as WorldState;
    if (!parsed || typeof parsed !== 'object' || !parsed.clubs || !parsed.players || !parsed.controlledClubId) {
      return {
        nextState: fallbackState,
        success: false,
        message: trText(
          'Invalid database JSON: missing clubs, players, or controlledClubId.',
          'ไฟล์ JSON ไม่ถูกต้อง: ไม่พบข้อมูล clubs, players หรือ controlledClubId'
        ),
      };
    }
    return {
      nextState: parsed,
      success: true,
      message: trText(
        `Successfully imported World Database (${Object.keys(parsed.clubs).length} clubs, ${Object.keys(parsed.players).length} players)!`,
        `นำเข้าฐานข้อมูลสำเร็จ (${Object.keys(parsed.clubs).length} สโมสร, ${Object.keys(parsed.players).length} นักเตะ)!`
      ),
    };
  } catch {
    return {
      nextState: fallbackState,
      success: false,
      message: trText('Failed to parse JSON string.', 'รูปแบบข้อมูล JSON ไม่ถูกต้อง'),
    };
  }
}

/**
 * Checkpoint 21: All-Time Hall of Fame Leaderboard & Exhibition Club Clash (Instant Cross-League Simulator)
 */
const LEGENDARY_MANAGERS_HOF: Omit<HallOfFameEntry, 'rank'>[] = [
  {
    managerName: 'Sir Alex Ferguson',
    nationality: 'SCO',
    clubsSummary: 'Aberdeen, Manchester United',
    clubName: 'Manchester United',
    majorTrophies: 49,
    winRatePct: 60,
    points: 5480,
  },
  {
    managerName: 'Pep Guardiola',
    nationality: 'ESP',
    clubsSummary: 'Barcelona, Bayern Munich, Manchester City',
    clubName: 'Manchester City',
    majorTrophies: 39,
    winRatePct: 73,
    points: 4620,
  },
  {
    managerName: 'Carlo Ancelotti',
    nationality: 'ITA',
    clubsSummary: 'AC Milan, Chelsea, PSG, Bayern, Real Madrid',
    clubName: 'Real Madrid',
    majorTrophies: 30,
    winRatePct: 62,
    points: 4190,
  },
  {
    managerName: 'José Mourinho',
    nationality: 'POR',
    clubsSummary: 'Porto, Chelsea, Inter Milan, Real Madrid, Roma',
    clubName: 'Inter Milan / Chelsea',
    majorTrophies: 26,
    winRatePct: 64,
    points: 3580,
  },
  {
    managerName: 'Arsène Wenger',
    nationality: 'FRA',
    clubsSummary: 'AS Monaco, Arsenal',
    clubName: 'Arsenal',
    majorTrophies: 21,
    winRatePct: 58,
    points: 2940,
  },
  {
    managerName: 'Jürgen Klopp',
    nationality: 'GER',
    clubsSummary: 'Mainz 05, Borussia Dortmund, Liverpool',
    clubName: 'Liverpool',
    majorTrophies: 13,
    winRatePct: 61,
    points: 2490,
  },
  {
    managerName: 'Zinedine Zidane',
    nationality: 'FRA',
    clubsSummary: 'Real Madrid',
    clubName: 'Real Madrid',
    majorTrophies: 11,
    winRatePct: 66,
    points: 2280,
  },
];

export function computeHallOfFameLeaderboard(state: WorldState): HallOfFameEntry[] {
  const userTrophies = state.manager.careerStats.trophies.length;
  const userPoints =
    userTrophies * 180 +
    state.manager.careerStats.won * 8 +
    state.manager.careerStats.drawn * 2 +
    state.manager.reputation * 6;
  const userClubName = state.clubs[state.controlledClubId]?.name || 'Club';
  const userWinRate =
    state.manager.careerStats.matchesManaged > 0
      ? Math.round(
          (state.manager.careerStats.won / state.manager.careerStats.matchesManaged) * 100
        )
      : 55;

  const combined: Omit<HallOfFameEntry, 'rank'>[] = [
    ...LEGENDARY_MANAGERS_HOF,
    {
      managerName: state.manager.name,
      nationality: state.manager.nationality || 'ENG',
      clubsSummary: userClubName,
      clubName: userClubName,
      majorTrophies: userTrophies,
      winRatePct: userWinRate,
      points: userPoints,
      isUser: true,
    },
  ];

  combined.sort((a, b) => b.points - a.points);
  return combined.map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

export function simulateExhibitionClash(
  state: WorldState,
  homeClubId: string,
  awayClubId: string
): {
  result: MatchResult & { homeXg: number; awayXg: number };
  homeClub: Club;
  awayClub: Club;
  summary: string;
} {
  const homeClub = state.clubs[homeClubId] || state.clubs[state.controlledClubId];
  const awayClub =
    state.clubs[awayClubId] ||
    Object.values(state.clubs).find((c) => c.id !== homeClub.id) ||
    homeClub;

  const mockFixture: Fixture = {
    id: `exh_${homeClub.id}_vs_${awayClub.id}_${Date.now()}`,
    competitionId: homeClub.leagueId,
    seasonId: state.currentSeason,
    matchday: 1,
    kickoffDate: state.gameDate,
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    status: 'Completed',
  };

  const simRes = simulateMatch(
    mockFixture,
    homeClub,
    awayClub,
    state.players,
    state.randomSeed + Date.now() % 10000,
    homeClub.primaryTactic,
    awayClub.primaryTactic,
    { isKnockout: true }
  );

  const result = {
    ...simRes,
    homeXg: Number(simRes.homeStats.xG.toFixed(2)),
    awayXg: Number(simRes.awayStats.xG.toFixed(2)),
  };

  const psoText = result.penaltyShootout
    ? ` (Pens: ${result.penaltyShootout.homePenalties}-${result.penaltyShootout.awayPenalties})`
    : '';
  const summary = trText(
    `Exhibition Clash Result: ${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}${psoText} | xG ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}`,
    `ผลจำลองแมตช์พิเศษ: ${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}${psoText} | xG ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}`
  );

  return { result, homeClub, awayClub, summary };
}

/**
 * Checkpoint 23: Saudi / MLS / South American Super Club Bids, South American Wonderkid Scouting & FIFA Club World Cup (GLB_CWC)
 */
export function triggerGlobalSuperClubBid(
  state: WorldState
): { nextState: WorldState; offer: TransferOffer | null; message: string } {
  const userClub = state.clubs[state.controlledClubId];
  const squad = Object.values(state.players).filter((p) => p.clubId === userClub.id);
  if (squad.length === 0) {
    return { nextState: state, offer: null, message: 'No players available.' };
  }

  // Pick a veteran star (age >= 27) or highest CA player
  const veterans = squad
    .filter((p) => getAgeAtDate(p.dateOfBirth, state.gameDate) >= 27)
    .sort((a, b) => b.currentAbility - a.currentAbility);
  const target = veterans[0] || [...squad].sort((a, b) => b.currentAbility - a.currentAbility)[0];

  // Pick a rich rival buyer club to represent the global super-bidder in the offer ledger
  const buyerClub =
    Object.values(state.clubs)
      .filter((c) => c.id !== userClub.id)
      .sort((a, b) => b.finances.transferBudget - a.finances.transferBudget)[0] || userClub;

  const superFundNames = ['Al-Hilal SFC (Saudi Pro League)', 'Al-Nassr FC (Saudi Pro League)', 'Inter Miami CF (MLS)', 'Al-Ittihad Club (Saudi Pro League)'];
  const superBrand = superFundNames[Math.abs(state.randomSeed + target.currentAbility) % superFundNames.length];
  const superFee = Math.max(15_000_000, Math.round((target.marketValue * 1.38) / 500_000) * 500_000);
  const offerId = `off_global_super_${Date.now()}_${target.id}`;

  const newOffer: TransferOffer = {
    id: offerId,
    date: state.gameDate,
    playerId: target.id,
    buyingClubId: buyerClub.id,
    sellingClubId: userClub.id,
    offerType: 'Transfer',
    upfrontFee: superFee,
    installmentsFee: 0,
    sellOnPercentage: 10,
    proposedWagePerWeek: Math.round(target.wagePerWeek * 1.8),
    proposedContractYears: 3,
    proposedSquadStatus: 'Star Player',
    signingBonus: 4_000_000,
    agentFee: 1_500_000,
    status: 'PendingClub',
  };

  return {
    nextState: {
      ...state,
      transferOffers: [newOffer, ...state.transferOffers],
      inbox: [
        {
          id: `news_super_bid_${offerId}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `Global Super-Club Bid (${superBrand}): €${(superFee / 1_000_000).toFixed(1)}M Offer for ${target.firstName} ${target.lastName}!`,
            `ข้อเสนอมหาเศรษฐีระดับโลก (${superBrand}): ยื่นซื้อ ${target.firstName} ${target.lastName} สูงถึง €${(superFee / 1_000_000).toFixed(1)}M!`
          ),
          body: trText(
            `Global powerhouse ${superBrand} (via partner representative ${buyerClub.name}) has tabled a massive €${(superFee / 1_000_000).toFixed(1)}M cash bid (1.38x market value) for ${target.firstName} ${target.lastName}. Review the offer in the Transfers Center.`,
            `กลุ่มทุนสโมสรระดับโลก ${superBrand} ยื่นข้อเสนอเงินสด €${(superFee / 1_000_000).toFixed(1)}M (สูงกว่าราคาตลาด 1.38 เท่า) เพื่อขอซื้อตัว ${target.firstName} ${target.lastName} คุณสามารถตอบรับหรือปฏิเสธได้ในหน้าตลาดซื้อขาย`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: userClub.id,
          relatedPlayerId: target.id,
          actionType: 'GoToTransfer',
        },
        ...state.inbox,
      ],
    },
    offer: newOffer,
    message: trText(
      `Received €${(superFee / 1_000_000).toFixed(1)}M Global Super-Club offer from ${superBrand} for ${target.firstName} ${target.lastName}!`,
      `ได้รับข้อเสนอ €${(superFee / 1_000_000).toFixed(1)}M จาก ${superBrand} เพื่อขอซื้อ ${target.firstName} ${target.lastName}!`
    ),
  };
}

export function dispatchSouthAmericaWonderkidScout(
  state: WorldState
): {
  nextState: WorldState;
  player: Player;
  wonderkid: Player;
  report: ScoutReport;
  message: string;
} {
  const rng = new SeededRNG(state.randomSeed + Date.now() % 100000);
  const nat = rng.chance(0.55) ? 'BRA' : 'ARG';
  const braFirst = ['Estevão', 'Endrick', 'Vitor', 'Kauã', 'Lorran', 'Luis', 'Gabriel', 'Matheus'];
  const braLast = ['Messinho', 'Roque', 'Elias', 'Gui', 'Reis', 'Moscardo', 'França', 'Nascimento'];
  const argFirst = ['Claudio', 'Franco', 'Valentín', 'Gianluca', 'Santiago', 'Tomás', 'Thiago', 'Mateo'];
  const argLast = ['Echeverri', 'Mastantuono', 'Barco', 'Prestianni', 'Castro', 'Parmo', 'Almada', 'Redondo'];

  const firstName = rng.pick(nat === 'BRA' ? braFirst : argFirst);
  const lastName = rng.pick(nat === 'BRA' ? braLast : argLast);
  const pos: PositionCode = rng.pick(['AMC', 'AMR', 'AML', 'ST', 'MC', 'DM']);
  const ca = rng.int(124, 142);
  const pa = rng.int(174, 194);
  const sellerClubs = Object.values(state.clubs).filter((c) => c.id !== state.controlledClubId);
  const hostClub = rng.pick(sellerClubs);

  const created = createCustomPlayerInWorld(state, {
    firstName,
    lastName,
    nationalityCode: nat,
    age: rng.int(17, 19),
    position: pos,
    currentAbility: ca,
    potentialAbility: pa,
    clubId: hostClub.id,
  });

  const scoutMember = Object.values(state.staff).find((s) => s.clubId === state.controlledClubId);
  const scoutId = scoutMember?.id || 'scout_sa_1';
  const report = buildScoutReportForPlayer(created.player, scoutId, state.gameDate, 18);

  const saAssignment: ScoutAssignment = {
    id: `asgn_sa_${Date.now()}`,
    scoutId,
    regionOrLeague: 'SOUTH_AMERICA',
    positionGroup: 'ANY',
    maxAge: 21,
    maxBudget: 60_000_000,
    startDate: state.gameDate,
    daysRemaining: 14,
    reportsGenerated: [created.player.id],
  };

  const nextState: WorldState = {
    ...created.nextState,
    scoutAssignments: [saAssignment, ...created.nextState.scoutAssignments],
    scoutReports: {
      ...created.nextState.scoutReports,
      [created.player.id]: report,
    },
    shortlistPlayerIds: created.nextState.shortlistPlayerIds.includes(created.player.id)
      ? created.nextState.shortlistPlayerIds
      : [created.player.id, ...created.nextState.shortlistPlayerIds],
  };

  return {
    nextState,
    player: created.player,
    wonderkid: created.player,
    report,
    message: trText(
      `South America Scouting Report: Discovered ${nat} Wonderkid ${firstName} ${lastName} (${pos}, CA ${ca} / PA ${pa})!`,
      `แมวมองอเมริกาใต้ค้นพบวันเดอร์คิด (${nat}): ${firstName} ${lastName} (${pos}, CA ${ca} / PA ${pa})!`
    ),
  };
}

export function simulateClubWorldCupNextStage(
  state: WorldState
): { nextState: WorldState; message: string } {
  const seasonId = state.currentSeason;
  const curYear = parseInt(seasonId.slice(0, 4), 10) + 1;
  let workingFixtures = [...state.fixtures];
  let cwcFixtures = workingFixtures.filter(
    (f) => f.competitionId === 'GLB_CWC' && f.seasonId === seasonId
  );

  // Initialize 8-club Quarter-Final bracket if none exist yet
  if (cwcFixtures.length === 0) {
    const topClubs = Object.values(state.clubs)
      .filter((c) => c.id !== state.controlledClubId)
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 7);
    const participants = [state.clubs[state.controlledClubId], ...topClubs].filter(Boolean);
    for (let i = 0; i < 4; i++) {
      const home = participants[i * 2];
      const away = participants[i * 2 + 1];
      if (home && away) {
        workingFixtures.push({
          id: `fix_glb_cwc_${seasonId.replace('/', '')}_qf_${i + 1}`,
          competitionId: 'GLB_CWC',
          seasonId,
          matchday: 1,
          kickoffDate: `${curYear}-06-18`,
          homeClubId: home.id,
          awayClubId: away.id,
          status: 'Scheduled',
        });
      }
    }
    cwcFixtures = workingFixtures.filter(
      (f) => f.competitionId === 'GLB_CWC' && f.seasonId === seasonId
    );
  }

  const pending = cwcFixtures.filter((f) => f.status === 'Scheduled');
  if (pending.length === 0) {
    return {
      nextState: state,
      message: trText(
        'FIFA Club World Cup tournament is already complete for this season!',
        'ศึกชิงแชมป์สโมสรโลก (FIFA Club World Cup) ประจำฤดูกาลนี้แข่งขันเสร็จสิ้นแล้ว!'
      ),
    };
  }

  const targetMd = Math.min(...pending.map((f) => f.matchday));
  const stageFixtures = pending.filter((f) => f.matchday === targetMd);
  const winners: string[] = [];

  workingFixtures = workingFixtures.map((f) => {
    if (f.competitionId === 'GLB_CWC' && f.seasonId === seasonId && f.matchday === targetMd && f.status === 'Scheduled') {
      const hClub = state.clubs[f.homeClubId];
      const aClub = state.clubs[f.awayClubId];
      if (!hClub || !aClub) return f;
      const res = simulateMatch(
        f,
        hClub,
        aClub,
        state.players,
        state.randomSeed + targetMd * 313 + workingFixtures.indexOf(f),
        hClub.primaryTactic,
        aClub.primaryTactic,
        { isKnockout: true }
      );
      const updatedFix: Fixture = { ...f, status: 'Completed', result: res };
      const winId = getDomesticCupFixtureWinnerId(updatedFix) || hClub.id;
      winners.push(winId);
      return updatedFix;
    }
    return f;
  });

  const nextClubs = { ...state.clubs };
  const nextTrophies = [...(state.trophyHistory || [])];
  const nextInbox = [...state.inbox];
  const nextTransactions = [...state.transactions];

  if (targetMd === 1 && winners.length >= 4) {
    // Generate Semi-Finals (MD 2)
    for (let i = 0; i < 2; i++) {
      workingFixtures.push({
        id: `fix_glb_cwc_${seasonId.replace('/', '')}_sf_${i + 1}`,
        competitionId: 'GLB_CWC',
        seasonId,
        matchday: 2,
        kickoffDate: `${curYear}-06-22`,
        homeClubId: winners[i * 2],
        awayClubId: winners[i * 2 + 1],
        status: 'Scheduled',
      });
    }
  } else if (targetMd === 2 && winners.length >= 2) {
    // Generate Final (MD 3)
    workingFixtures.push({
      id: `fix_glb_cwc_${seasonId.replace('/', '')}_final`,
      competitionId: 'GLB_CWC',
      seasonId,
      matchday: 3,
      kickoffDate: `${curYear}-06-26`,
      homeClubId: winners[0],
      awayClubId: winners[1],
      status: 'Scheduled',
    });
  } else if (targetMd === 3 && winners[0]) {
    const champId = winners[0];
    const champClub = nextClubs[champId];
    if (champClub) {
      const prize = 35_000_000;
      nextClubs[champId] = {
        ...champClub,
        reputation: Math.min(100, champClub.reputation + 4),
        finances: {
          ...champClub.finances,
          balance: champClub.finances.balance + prize,
          transferBudget: champClub.finances.transferBudget + Math.round(prize * 0.75),
        },
      };
      nextTrophies.unshift({
        id: `trp_${seasonId.replace('/', '')}_GLB_CWC`,
        season: seasonId,
        competitionId: 'GLB_CWC',
        competitionName: 'FIFA Club World Cup',
        winnerClubId: champClub.id,
        winnerClubName: champClub.name,
      });
      nextInbox.unshift({
        id: `news_cwc_champ_${seasonId.replace('/', '')}`,
        gameDate: state.gameDate,
        category: 'Competition',
        title: trText(
          `FIFA Club World Cup Champions: ${champClub.name} Crowned World Champions (+€35.0M)!`,
          `แชมป์สโมสรโลก FIFA Club World Cup: ${champClub.name} ผงาดครองบัลลังก์โลก (+€35.0M)!`
        ),
        body: trText(
          `${champClub.name} have lifted the FIFA Club World Cup trophy and earned €35.0M in champion prize money!`,
          `${champClub.name} ผงาดคว้าถ้วยแชมป์สโมสรโลก FIFA Club World Cup พร้อมรับเงินรางวัลก้อนโต €35.0M!`
        ),
        isRead: false,
        isImportant: true,
        relatedClubId: champClub.id,
      });
    }
  }

  const stageLabel =
    targetMd === 1
      ? trText('Quarter-Finals', 'รอบ 8 ทีมสุดท้าย')
      : targetMd === 2
        ? trText('Semi-Finals', 'รอบรองชนะเลิศ')
        : trText('Final', 'รอบชิงชนะเลิศ');

  return {
    nextState: {
      ...state,
      clubs: nextClubs,
      fixtures: workingFixtures,
      trophyHistory: nextTrophies,
      inbox: nextInbox,
      transactions: nextTransactions,
    },
    message: trText(
      `Simulated FIFA Club World Cup ${stageLabel} (${stageFixtures.length} matches)!`,
      `จำลองการแข่งขัน FIFA Club World Cup ${stageLabel} (${stageFixtures.length} คู่) เรียบร้อยแล้ว!`
    ),
  };
}

/**
 * Checkpoint 24: FM27 Medical Center, Injury Risk Matrix & Preventative Rest (+12% Fitness)
 */
export interface PlayerMedicalRiskAssessment {
  player: Player;
  playerId: string;
  playerName: string;
  position: string;
  fitness: number;
  matchSharpness: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  injuryProbabilityPct: number;
  riskProbabilityPct: number;
  workloadLoad: 'Light' | 'Medium' | 'Heavy';
  recommendation: string;
  recommendationEn: string;
  recommendationTh: string;
}

export function evaluateSquadMedicalRisk(
  state: WorldState,
  clubId?: string
): PlayerMedicalRiskAssessment[] {
  const targetClubId = clubId || state.controlledClubId;
  const squad = Object.values(state.players).filter((p) => p.clubId === targetClubId);

  return squad
    .map((p): PlayerMedicalRiskAssessment => {
      const natFit = p.attributes.physical.naturalFitness || 12;
      const intensityBonus =
        p.individualTraining.intensity === 'Heavy'
          ? 18
          : p.individualTraining.intensity === 'Medium'
            ? 8
            : 0;
      const fatigueFactor = Math.max(0, 100 - p.fitness);
      const rawProb = Math.min(
        92,
        Math.max(4, Math.round(fatigueFactor * 1.35 + intensityBonus + (18 - natFit) * 1.8))
      );

      const riskLevel: PlayerMedicalRiskAssessment['riskLevel'] =
        p.injuryStatus.isInjured || p.fitness < 68 || rawProb >= 55
          ? 'CRITICAL'
          : p.fitness < 78 || rawProb >= 36
            ? 'HIGH'
            : p.fitness < 88 || rawProb >= 22
              ? 'MODERATE'
              : 'LOW';

      const recommendationEn =
        riskLevel === 'CRITICAL'
          ? 'Immediate Medical Rest & Bench Rotation Required'
          : riskLevel === 'HIGH'
            ? 'Prescribe Recovery Session (+12% Fitness) & Light Intensity'
            : riskLevel === 'MODERATE'
              ? "Monitor Minutes (Sub around 65')"
              : 'Cleared for Full 90-Minute Match Load';

      const recommendationTh =
        riskLevel === 'CRITICAL'
          ? 'ต้องสั่งพักฟื้นทันทีและโรเตชั่นออกจากตัวจริง'
          : riskLevel === 'HIGH'
            ? 'แนะนำเข้าโปรแกรมฟื้นฟู (+12% ความฟิต) และซ้อมเบา'
            : riskLevel === 'MODERATE'
              ? "เฝ้าระวังนาทีลงสนาม (ควรเปลี่ยนตัวออกนาที 65')"
              : 'พร้อมลงสนามเต็ม 90 นาที';

      return {
        player: p,
        playerId: p.id,
        playerName: `${p.firstName} ${p.lastName}`,
        position: p.positions[0] || 'CM',
        fitness: p.fitness,
        matchSharpness: p.matchSharpness,
        riskLevel,
        injuryProbabilityPct: rawProb,
        riskProbabilityPct: rawProb,
        workloadLoad: p.individualTraining.intensity,
        recommendation: trText(recommendationEn, recommendationTh),
        recommendationEn,
        recommendationTh,
      };
    })
    .sort((a, b) => b.injuryProbabilityPct - a.injuryProbabilityPct);
}

export function prescribePlayerMedicalRest(
  state: WorldState,
  playerId: string
): { nextState: WorldState; success: boolean; message: string } {
  const player = state.players[playerId];
  if (!player) {
    return { nextState: state, success: false, message: 'Player not found.' };
  }

  const nextFitness = Math.min(100, player.fitness + 12);
  const updatedPlayer: Player = {
    ...player,
    fitness: nextFitness,
    individualTraining: {
      ...player.individualTraining,
      intensity: 'Light',
    },
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
      `Medical Center: Prescribed preventative rest & cryotherapy for ${player.firstName} ${player.lastName} (Fitness -> ${nextFitness}%, Training -> Light).`,
      `ศูนย์การแพทย์: สั่งพักฟื้นและกายภาพบำบัดให้ ${player.firstName} ${player.lastName} (ความฟิตเพิ่มเป็น ${nextFitness}%, ปรับซ้อมเบา)`
    ),
  };
}

/**
 * Checkpoint 25: Dual Board vs Supporter Confidence & Live Fan Social Media Feed
 */
export function getClubSupporterConfidence(state: WorldState, clubId?: string): number {
  const cid = clubId || state.controlledClubId;
  const club = state.clubs[cid];
  if (!club) return 75;
  if (typeof club.supporterConfidence === 'number') {
    return club.supporterConfidence;
  }

  const table = state.standings[club.leagueId] || [];
  const rowIdx = table.findIndex((r) => r.clubId === cid);
  const row = table[rowIdx];
  const rank = rowIdx >= 0 ? rowIdx + 1 : club.boardExpectations.targetLeaguePosition;
  const rankDelta = club.boardExpectations.targetLeaguePosition - rank;
  const formWins = (row?.form || []).filter((f) => f === 'W').length;
  const attackingBonus =
    club.primaryTactic.instructions.mentality === 'Attacking' ||
    club.primaryTactic.instructions.mentality === 'Very Attacking' ||
    club.primaryTactic.instructions.mentality === 'Positive'
      ? 5
      : 0;

  return Math.max(
    18,
    Math.min(
      99,
      Math.round(
        club.boardExpectations.confidence.overall + rankDelta * 2.5 + formWins * 2 + attackingBonus
      )
    )
  );
}

export function getFanSocialFeed(state: WorldState): FanSocialPost[] {
  if (state.socialFeed && state.socialFeed.length > 0) {
    return state.socialFeed;
  }
  const club = state.clubs[state.controlledClubId];
  const squad = Object.values(state.players)
    .filter((p) => p.clubId === club.id)
    .sort((a, b) => b.currentAbility - a.currentAbility);
  const star = squad[0];
  const wonderkid = squad.find((p) => p.isWonderkid || p.potentialAbility >= 168) || squad[1] || star;
  const suppConf = getClubSupporterConfidence(state, club.id);

  const completedUserMatches = state.fixtures
    .filter(
      (f) =>
        f.status === 'Completed' &&
        f.result &&
        (f.homeClubId === club.id || f.awayClubId === club.id)
    )
    .slice(-2)
    .reverse();

  const posts: FanSocialPost[] = [];

  if (completedUserMatches[0] && completedUserMatches[0].result) {
    const m = completedUserMatches[0];
    const isHome = m.homeClubId === club.id;
    const myGoals = isHome ? m.result!.homeGoals : m.result!.awayGoals;
    const oppGoals = isHome ? m.result!.awayGoals : m.result!.homeGoals;
    const oppName = state.clubs[isHome ? m.awayClubId : m.homeClubId]?.shortName || 'Opponent';
    const won = myGoals > oppGoals;
    const drew = myGoals === oppGoals;

    const postBody = won
      ? trText(
          `What a result against ${oppName} (${myGoals}-${oppGoals})! ${state.manager.name}'s ${club.primaryTactic.formation} tactical setup completely dominated the pitch! 🔥👏`,
          `ชัยชนะสุดยอดเหนือ ${oppName} (${myGoals}-${oppGoals})! แท็กติก ${club.primaryTactic.formation} ของกุนซือ ${state.manager.name} คุมเกมได้อยู่หมัด! 🔥👏`
        )
      : drew
        ? trText(
            `A hard-fought ${myGoals}-${oppGoals} draw vs ${oppName}. We created the xG to win it—need more clinical finishing next matchday.`,
            `แบ่งแต้มสุดเดือด ${myGoals}-${oppGoals} กับ ${oppName} รูปเกมสร้างโอกาส xG ได้เยอะแล้ว เหลือแค่ความคมในจังหวะสุดท้าย`
          )
        : trText(
            `Disappointing ${myGoals}-${oppGoals} defeat to ${oppName}. The fans expect a big tactical response from ${state.manager.name} this weekend! 😤`,
            `น่าผิดหวังที่พ่าย ${oppName} ${myGoals}-${oppGoals} แฟนบอลหวังว่าจะได้เห็นการแก้เกมที่ดุดันขึ้นในนัดต่อไป! 😤`
          );

    posts.push({
      id: `soc_match_${m.id}`,
      handle: `@${club.shortName.replace(/\s+/g, '')}UltrasTV`,
      author: `${club.shortName} Supporters Trust`,
      sentiment: won ? 'POSITIVE' : drew ? 'NEUTRAL' : 'CRITICAL',
      date: m.kickoffDate,
      text: postBody,
      body: postBody,
      likes: 2450,
    });
  }

  const starText = trText(
    `Supporter confidence at ${club.name} stands at ${suppConf}%. Watching ${star?.firstName} ${star?.lastName} and young talent ${wonderkid?.firstName} ${wonderkid?.lastName} link up in ${club.primaryTactic.formation} is pure box-office football.`,
    `ความเชื่อมั่นของกลุ่มแฟนบอล ${club.name} อยู่ที่ ${suppConf}% การประสานงานระหว่าง ${star?.firstName} ${star?.lastName} และดาวรุ่ง ${wonderkid?.firstName} ${wonderkid?.lastName} ในระบบ ${club.primaryTactic.formation} น่าจับตามองมาก!`
  );

  posts.push({
    id: `soc_star_${club.id}`,
    handle: '@TouchlineTacticsPod',
    author: 'European Football Punditry',
    sentiment: suppConf >= 65 ? 'POSITIVE' : 'NEUTRAL',
    date: state.gameDate,
    text: starText,
    body: starText,
    likes: 1820,
  });

  const boardText = trText(
    `With €${(club.finances.transferBudget / 1_000_000).toFixed(1)}M remaining in the transfer warchest, supporters are urging the board to back ${state.manager.name} in the scouting market.`,
    `ด้วยงบเสริมทัพที่เหลืออีก €${(club.finances.transferBudget / 1_000_000).toFixed(1)}M แฟนบอลต่างเรียกร้องให้บอร์ดบริหารหนุนหลัง ${state.manager.name} ลุยตลาดนักเตะเต็มตัว`
  );

  posts.push({
    id: `soc_board_${club.id}`,
    handle: `@Inside${club.shortName.replace(/\s+/g, '')}`,
    author: `${club.name} Insider`,
    sentiment: club.finances.transferBudget >= 15_000_000 ? 'POSITIVE' : 'NEUTRAL',
    date: state.gameDate,
    text: boardText,
    body: boardText,
    likes: 1340,
  });

  return posts;
}

/**
 * Checkpoint 26: Affiliate / Feeder Clubs (Send on Loan) & Advanced Transfer Clauses
 */
export function requestAffiliateFeederClub(
  state: WorldState
): { nextState: WorldState; affiliateClub: Club | null; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const existingIds = myClub.affiliateClubIds || [];
  if (existingIds.length >= 3) {
    return {
      nextState: state,
      affiliateClub: null,
      message: trText(
        'Your club already has the maximum of 3 active Affiliate / Feeder Club partnerships.',
        'สโมสรของคุณมีพันธมิตรสโมสรลูก (Affiliate Clubs) ครบโควตาสูงสุด 3 สโมสรแล้ว'
      ),
    };
  }

  const candidates = Object.values(state.clubs).filter(
    (c) =>
      c.id !== myClub.id &&
      !existingIds.includes(c.id) &&
      c.reputation < myClub.reputation - 4 &&
      (LEAGUES_CONFIG[c.leagueId]?.tier === 2 || ['POR_LP', 'NED_ED', 'BEL_PL', 'SCO_PR', 'TUR_SL'].includes(c.leagueId))
  );

  const chosen =
    candidates[Math.abs(state.randomSeed + existingIds.length * 19) % Math.max(1, candidates.length)] ||
    Object.values(state.clubs).find((c) => c.id !== myClub.id && !existingIds.includes(c.id));

  if (!chosen) {
    return { nextState: state, affiliateClub: null, message: 'No eligible feeder club found.' };
  }

  const updatedMyClub: Club = {
    ...myClub,
    affiliateClubIds: [...existingIds, chosen.id],
  };

  return {
    nextState: {
      ...state,
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedMyClub,
      },
      inbox: [
        {
          id: `news_aff_${chosen.id}_${Date.now()}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `Board Approves New Feeder Club Partnership: ${chosen.name} (${LEAGUES_CONFIG[chosen.leagueId]?.name})`,
            `บอร์ดบริหารอนุมัติพันธมิตรสโมสรลูกแห่งใหม่: ${chosen.name} (${LEAGUES_CONFIG[chosen.leagueId]?.name})`
          ),
          body: trText(
            `${myClub.name} have signed an official Affiliate Club partnership with ${chosen.name}. You can now send U21 prospects and fringe players to ${chosen.name} on instant developmental loans.`,
            `${myClub.name} ลงนามความร่วมมือเป็นพันธมิตรสโมสรแม่-ลูกกับ ${chosen.name} อย่างเป็นทางการ คุณสามารถส่งดาวรุ่งไปเก็บเกี่ยวประสบการณ์แบบยืมตัวได้ทันที`
          ),
          isRead: false,
          relatedClubId: chosen.id,
        },
        ...state.inbox,
      ],
    },
    affiliateClub: chosen,
    message: trText(
      `Established Affiliate / Feeder Club partnership with ${chosen.name}!`,
      `จับมือพันธมิตรสโมสรลูกกับ ${chosen.name} สำเร็จ!`
    ),
  };
}

export function sendPlayerToAffiliateLoan(
  state: WorldState,
  playerId: string,
  affiliateClubId?: string
): { nextState: WorldState; success: boolean; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const player = state.players[playerId];
  if (!player || player.clubId !== myClub.id) {
    return {
      nextState: state,
      success: false,
      message: trText('Player must belong to your club.', 'นักเตะต้องอยู่ในสังกัดสโมสรของคุณ'),
    };
  }

  let workingState = state;
  let targetAffiliateId = affiliateClubId || myClub.affiliateClubIds?.[0];
  if (!targetAffiliateId) {
    const req = requestAffiliateFeederClub(workingState);
    workingState = req.nextState;
    targetAffiliateId = req.affiliateClub?.id;
  }

  const affiliateClub = targetAffiliateId ? workingState.clubs[targetAffiliateId] : undefined;
  if (!affiliateClub) {
    return {
      nextState: workingState,
      success: false,
      message: trText('No affiliate club available.', 'ไม่พบสโมสรพันธมิตร'),
    };
  }

  const updatedPlayer: Player = {
    ...player,
    clubId: affiliateClub.id,
    loanedFromClubId: myClub.id,
    morale: Math.min(100, player.morale + 7),
    matchSharpness: Math.min(100, player.matchSharpness + 6),
    transferHistory: [
      {
        date: workingState.gameDate,
        fromClubId: myClub.id,
        toClubId: affiliateClub.id,
        fee: 0,
        type: 'Loan',
      },
      ...player.transferHistory,
    ],
  };

  const updatedMyClub: Club = {
    ...workingState.clubs[myClub.id],
    primaryTactic: {
      ...workingState.clubs[myClub.id].primaryTactic,
      lineup: workingState.clubs[myClub.id].primaryTactic.lineup.map((s) =>
        s.playerId === player.id ? { ...s, playerId: null } : s
      ),
      benchPlayerIds: workingState.clubs[myClub.id].primaryTactic.benchPlayerIds.filter(
        (id) => id !== player.id
      ),
    },
  };

  return {
    nextState: {
      ...workingState,
      players: {
        ...workingState.players,
        [player.id]: updatedPlayer,
      },
      clubs: {
        ...workingState.clubs,
        [myClub.id]: updatedMyClub,
      },
      inbox: [
        {
          id: `news_aff_loan_${player.id}_${Date.now()}`,
          gameDate: workingState.gameDate,
          category: 'Transfer',
          title: trText(
            `Developmental Loan: ${player.firstName} ${player.lastName} Joins Affiliate ${affiliateClub.name}`,
            `ส่งยืมตัวสโมสรลูก: ${player.firstName} ${player.lastName} ย้ายไปเก็บเลเวลกับ ${affiliateClub.name}`
          ),
          body: trText(
            `${player.firstName} ${player.lastName} has joined affiliate club ${affiliateClub.name} on a season-long developmental loan to gain regular first-team minutes.`,
            `${player.firstName} ${player.lastName} เดินทางไปร่วมทีมพันธมิตร ${affiliateClub.name} ด้วยสัญญายืมตัวจนจบฤดูกาลเพื่อโอกาสลงสนามอย่างต่อเนื่อง`
          ),
          isRead: false,
          relatedClubId: affiliateClub.id,
          relatedPlayerId: player.id,
        },
        ...workingState.inbox,
      ],
    },
    success: true,
    message: trText(
      `Sent ${player.firstName} ${player.lastName} on loan to affiliate club ${affiliateClub.name}!`,
      `ส่ง ${player.firstName} ${player.lastName} ไปยืมตัวกับสโมสรพันธมิตร ${affiliateClub.name} เรียบร้อยแล้ว!`
    ),
  };
}
