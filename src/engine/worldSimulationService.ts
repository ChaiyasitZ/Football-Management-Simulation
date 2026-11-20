import {
  Club,
  CustomClubConfig,
  FanSocialPost,
  FinanceTransaction,
  Fixture,
  FormationId,
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
  PlayerCareerSeasonRecord,
  PlayerRole,
  PlayerTrait,
  PositionCode,
  PositionGroup,
  PreSeasonCampFocus,
  PreSeasonTourRegion,
  ScenarioChallengeId,
  ScoutAssignment,
  ScoutReport,
  SeasonAwardRecord,
  StaffMember,
  TacticalPresetId,
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
import { getDerbyRivalryForClubs, LEAGUES_CONFIG, NATIONALITY_POOLS } from './leaguesConfig';
import {
  recomputeLeagueStandings,
  checkAndAdvanceDomesticCup,
  checkAndAdvanceEuroCup,
  CUP_COMPETITIONS_META,
  CupMetaCompetitionId,
  generateContinentalChampionsCupFixtures,
  generateEuropeanNationsCupFixtures,
  generateInitialDomesticCupFixtures,
  generateLeagueSchedule,
  generatePromotionPlayoffFixtures,
  generateSeasonSuperCupFixtures,
  getCupRoundPrizeMoney,
  createInitialStandings,
  getDomesticCupFixtureWinnerId,
  PROMOTION_PLAYOFF_LEAGUE_MAP,
} from './leagueEngine';
import { simulateMatch } from './matchEngine';
import { SeededRNG } from './random';
import { autoPickLineup, buildAuthenticTeamInstructions, ROLES_BY_POSITION } from './tacticsEngine';
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

export function getClubStaffBonuses(
  state: WorldState,
  clubId: string,
  staffListOverride?: StaffMember[]
): ClubStaffBonuses {
  const club = state.clubs[clubId];
  const staffList =
    staffListOverride || Object.values(state.staff).filter((s) => s.clubId === clubId);

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
export interface ApplyMatchOptions {
  skipStandingsRecompute?: boolean;
  playersByClubId?: Map<string, Player[]>;
  staffByClubId?: Map<string, StaffMember[]>;
  fixtureIndexById?: Map<string, number>;
  mutateInPlace?: boolean;
}

export function buildPlayersByClubIndex(players: Record<string, Player>): Map<string, Player[]> {
  const index = new Map<string, Player[]>();
  for (const p of Object.values(players)) {
    const arr = index.get(p.clubId);
    if (arr) {
      arr.push(p);
    } else {
      index.set(p.clubId, [p]);
    }
  }
  return index;
}

export function applyMatchResultToWorld(
  state: WorldState,
  fixtureId: string,
  result: MatchResult,
  options?: ApplyMatchOptions
): WorldState {
  const mappedIdx = options?.fixtureIndexById?.get(fixtureId);
  const fixtureIdx =
    mappedIdx !== undefined && state.fixtures[mappedIdx]?.id === fixtureId
      ? mappedIdx
      : state.fixtures.findIndex((f) => f.id === fixtureId);
  if (fixtureIdx === -1) return state;

  const existingFixture = state.fixtures[fixtureIdx];
  // Idempotency guard: never apply a result twice
  if (existingFixture.status === 'Completed') {
    return state;
  }

  const mutateInPlace = Boolean(options?.mutateInPlace);
  const updatedFixtures = mutateInPlace ? state.fixtures : [...state.fixtures];
  const completedFixture: Fixture = {
    ...existingFixture,
    status: 'Completed',
    result,
  };
  updatedFixtures[fixtureIdx] = completedFixture;

  const homeClub = { ...state.clubs[existingFixture.homeClubId] };
  const awayClub = { ...state.clubs[existingFixture.awayClubId] };
  const updatedPlayers = mutateInPlace ? state.players : { ...state.players };
  const updatedClubs = mutateInPlace ? state.clubs : { ...state.clubs };
  updatedClubs[homeClub.id] = homeClub;
  updatedClubs[awayClub.id] = awayClub;
  const updatedTransactions = mutateInPlace ? state.transactions : [...state.transactions];
  const updatedInbox = mutateInPlace ? state.inbox : [...state.inbox];
  let updatedManager = { ...state.manager, careerStats: { ...state.manager.careerStats } };
  const isPreSeasonFriendly = existingFixture.competitionId === 'PRE_SEASON_FRIENDLY';

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

  const derbyRivalry = result.derbyRivalry || getDerbyRivalryForClubs(homeClub, awayClub);

  // Update players who participated (pre-compute staff bonus ONCE per club instead of 22x per match!)
  const participatedIds = new Set(Object.keys(result.playerRatings));
  const homeStaffBonus = getClubStaffBonuses(
    state,
    homeClub.id,
    options?.staffByClubId?.get(homeClub.id)
  );
  const awayStaffBonus = getClubStaffBonuses(
    state,
    awayClub.id,
    options?.staffByClubId?.get(awayClub.id)
  );

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
    const moraleShift = derbyRivalry
      ? teamWon
        ? 8
        : teamDrew
          ? 0
          : -8
      : teamWon
        ? 4
        : teamDrew
          ? 0
          : -4;
    const newMorale = Math.max(25, Math.min(100, p.morale + moraleShift));

    // Muscle injury risk if started with Condition < 70% (1-3 weeks / 7-21 days)
    let injuryStatus = { ...p.injuryStatus };
    const startedLowCondition = preMatchFitness < 70;
    const staffBonus = isHomePlayer ? homeStaffBonus : awayStaffBonus;
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

    const matchYellows = isPreSeasonFriendly ? 0 : yellowsByPlayer[playerId] || 0;
    const matchReds = isPreSeasonFriendly ? 0 : redsByPlayer[playerId] || 0;
    const newSeasonYellows = p.stats.yellowCards + matchYellows;
    const newSeasonReds = p.stats.redCards + matchReds;

    // Disciplinary Suspensions: Red Card = 2 matches, every 5th Yellow Card = 1 match (competitive fixtures only)
    let addedSuspension = 0;
    if (!isPreSeasonFriendly) {
      if (matchReds > 0) {
        addedSuspension = 2;
      } else if (matchYellows > 0 && newSeasonYellows > 0 && newSeasonYellows % 5 === 0) {
        addedSuspension = 1;
      }
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
      matchSharpness: Math.min(100, p.matchSharpness + (isPreSeasonFriendly ? 10 : 5)),
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
  // Stage 11 Phase 2: Use indexed playersByClubId (O(44) instead of O(8,300) per match!)
  const involvedClubPlayers: Player[] = options?.playersByClubId
    ? [
        ...(options.playersByClubId.get(homeClub.id) || []),
        ...(options.playersByClubId.get(awayClub.id) || []),
      ].map((p) => updatedPlayers[p.id] || p)
    : Object.values(updatedPlayers).filter(
        (p) => p.clubId === homeClub.id || p.clubId === awayClub.id
      );

  for (const p of involvedClubPlayers) {
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

    if (!isPreSeasonFriendly && isKeyHierarchy && newConsecutiveBenched >= 3) {
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
      consecutiveBenched: isPreSeasonFriendly ? p.consecutiveBenched || 0 : newConsecutiveBenched,
    };
  }

  // Grow Tactical Familiarity (+5% in Pre-Season Friendlies, +4% per competitive match played in current formation)
  const familiarityBoost = isPreSeasonFriendly ? 5 : 4;
  for (const c of [homeClub, awayClub]) {
    const newFam = Math.min(100, c.primaryTactic.familiarity + familiarityBoost);
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
  const updatedStandings = mutateInPlace ? state.standings : { ...state.standings };
  const updatedUefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: state.uefaStandings?.UEFA_UCL || [],
    UEFA_UEL: state.uefaStandings?.UEFA_UEL || [],
    UEFA_UECL: state.uefaStandings?.UEFA_UECL || [],
  };

  if (!options?.skipStandingsRecompute) {
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
    }
  }

  if (UEFA_COMPETITIONS_CONFIG[uefaCompId]) {
    const uCfg = UEFA_COMPETITIONS_CONFIG[uefaCompId];

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
    let supporterDelta = 0;
    if (myGoals > oppGoals) {
      updatedManager.careerStats.won += 1;
      confDelta = derbyRivalry ? 6 : 3;
      supporterDelta = derbyRivalry ? 10 : 3;
    } else if (myGoals === oppGoals) {
      updatedManager.careerStats.drawn += 1;
      confDelta = 0;
      supporterDelta = 0;
    } else {
      updatedManager.careerStats.lost += 1;
      confDelta = derbyRivalry ? -6 : -3;
      supporterDelta = derbyRivalry ? -8 : -3;
    }

    myClub.supporterConfidence = Math.max(
      15,
      Math.min(100, (myClub.supporterConfidence ?? 72) + supporterDelta)
    );
    myClub.boardExpectations = {
      ...myClub.boardExpectations,
      confidence: {
        ...myClub.boardExpectations.confidence,
        overall: Math.max(15, Math.min(100, myClub.boardExpectations.confidence.overall + confDelta)),
        leaguePerformance: Math.max(
          15,
          Math.min(100, myClub.boardExpectations.confidence.leaguePerformance + confDelta)
        ),
        squadAtmosphere: Math.max(
          15,
          Math.min(
            100,
            myClub.boardExpectations.confidence.squadAtmosphere +
              (derbyRivalry ? (myGoals > oppGoals ? 6 : myGoals < oppGoals ? -6 : 0) : 0)
          )
        ),
      },
    };

    const motmPlayer = updatedPlayers[result.manOfTheMatchPlayerId];
    const motmName = motmPlayer
      ? `${motmPlayer.firstName} ${motmPlayer.lastName}`
      : trText('Star Performer', 'ผู้เล่นยอดเยี่ยม');

    const derbyTitlePrefixEn = derbyRivalry
      ? myGoals > oppGoals
        ? `🔥 DERBY VICTORY (${derbyRivalry.nameEn}): `
        : myGoals < oppGoals
          ? `🔥 DERBY HEARTBREAK (${derbyRivalry.nameEn}): `
          : `🔥 FIERCE DERBY DRAW (${derbyRivalry.nameEn}): `
      : 'Post-Match Report: ';
    const derbyTitlePrefixTh = derbyRivalry
      ? myGoals > oppGoals
        ? `🔥 คว้าชัยศึกดาร์บี้ (${derbyRivalry.nameTh}): `
        : myGoals < oppGoals
          ? `🔥 พ่ายศึกดาร์บี้ (${derbyRivalry.nameTh}): `
          : `🔥 เสมอเดือดศึกดาร์บี้ (${derbyRivalry.nameTh}): `
      : 'สรุปผลหลังเกม: ';
    const derbyImpactNoteEn = derbyRivalry
      ? ` Fierce rivalry derby atmosphere doubled the squad morale swing (${myGoals > oppGoals ? '+8' : myGoals < oppGoals ? '-8' : '0'}) and supporter confidence (${supporterDelta >= 0 ? `+${supporterDelta}` : supporterDelta})!`
      : '';
    const derbyImpactNoteTh = derbyRivalry
      ? ` บรรยากาศศึกดาร์บี้แมตช์ส่งผลต่อขวัญกำลังใจคูณสอง (${myGoals > oppGoals ? '+8' : myGoals < oppGoals ? '-8' : '0'}) และความเชื่อมั่นแฟนบอล (${supporterDelta >= 0 ? `+${supporterDelta}` : supporterDelta})!`
      : '';

    updatedInbox.unshift({
      id: `news_mrep_${fixtureId}`,
      gameDate: state.gameDate,
      category: 'Match Report',
      title: trText(
        `${derbyTitlePrefixEn}${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}`,
        `${derbyTitlePrefixTh}${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}`
      ),
      body: trText(
        `Matchday ${existingFixture.matchday} finished ${homeClub.name} ${result.homeGoals}-${result.awayGoals} ${awayClub.name} (xG: ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}, Possession: ${result.homeStats.possession}% - ${result.awayStats.possession}%). Man of the Match: ${motmName}.${derbyImpactNoteEn} Please address the post-match press conference below.`,
        `เกมนัดที่ ${existingFixture.matchday} จบลงด้วยสกอร์ ${homeClub.name} ${result.homeGoals}-${result.awayGoals} ${awayClub.name} (xG: ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}, ครองบอล ${result.homeStats.possession}% - ${result.awayStats.possession}%) โดย Man of the Match ได้แก่ ${motmName}${derbyImpactNoteTh}`
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

  // Domestic Primary Cups (*_CUP), League Cups (*_LC), Super Cups (*_SC / UEFA_USC),
  // Global Continental Champions Cups (AFC_ACL, CONMEBOL_LIB, CONCACAF_CCC), and Promotion Playoffs (*_PO)
  const compIdStr = String(existingFixture.competitionId);
  const isContinentalCup =
    compIdStr === 'AFC_ACL' ||
    compIdStr === 'CONMEBOL_LIB' ||
    compIdStr === 'CONCACAF_CCC';
  const isPromoPlayoff = compIdStr.endsWith('_PO');
  const isDomesticOrLeagueCup =
    compIdStr.endsWith('_CUP') ||
    compIdStr.endsWith('_LC') ||
    isContinentalCup ||
    isPromoPlayoff;
  const isSuperCup = compIdStr.endsWith('_SC') || compIdStr === 'UEFA_USC';

  if (isDomesticOrLeagueCup || isSuperCup) {
    const cupMeta = CUP_COMPETITIONS_META[existingFixture.competitionId as CupMetaCompetitionId];
    const cupDisplayName = cupMeta?.name || compIdStr;
    const stage = existingFixture.uefaStage || existingFixture.cupRound || 'R16';
    const winnerId = getDomesticCupFixtureWinnerId(completedFixture);
    const loserId =
      winnerId === completedFixture.homeClubId
        ? completedFixture.awayClubId
        : completedFixture.homeClubId;

    // 1. Round-by-Round Prize Money Payout & Giant-Killing Detection
    if (winnerId && nextState.clubs[winnerId]) {
      const winClub = { ...nextState.clubs[winnerId] };
      const loseClub = loserId ? nextState.clubs[loserId] : undefined;
      const roundPrize = getCupRoundPrizeMoney(compIdStr, stage);

      winClub.finances = {
        ...winClub.finances,
        balance: winClub.finances.balance + roundPrize,
        transferBudget: winClub.finances.transferBudget + Math.round(roundPrize * 0.65),
      };

      let nextTx = nextState.transactions;
      if (winClub.id === nextState.controlledClubId) {
        nextTx = [
          {
            id: `tx_cup_prize_${existingFixture.id}`,
            date: nextState.gameDate,
            clubId: winClub.id,
            category: 'Prize Money',
            amount: roundPrize,
            description: trText(
              `${cupDisplayName} (${stage}) Victory Prize Payout`,
              `เงินรางวัลชนะเลิศรอบ ${stage} ศึก ${cupDisplayName}`
            ),
            balanceAfter: winClub.finances.balance,
          },
          ...nextTx,
        ];
      }

      // Check Giant-Killing (Tier 2 club eliminating Tier 1 club)
      const winTier = LEAGUES_CONFIG[winClub.leagueId]?.tier || 1;
      const loseTier = loseClub ? LEAGUES_CONFIG[loseClub.leagueId]?.tier || 1 : 1;
      let nextMgr = nextState.manager;
      let giantKillingNews: NewsItem[] = [];

      if (winTier === 2 && loseTier === 1 && loseClub) {
        if (winClub.id === nextState.controlledClubId) {
          nextMgr = {
            ...nextMgr,
            reputation: Math.min(99, nextMgr.reputation + 2),
          };
          winClub.boardExpectations = {
            ...winClub.boardExpectations,
            confidence: {
              ...winClub.boardExpectations.confidence,
              overall: Math.min(100, winClub.boardExpectations.confidence.overall + 6),
              squadAtmosphere: Math.min(100, winClub.boardExpectations.confidence.squadAtmosphere + 8),
            },
          };
        }
        giantKillingNews = [
          {
            id: `news_giant_killing_${existingFixture.id}`,
            gameDate: nextState.gameDate,
            category: 'Competition',
            title: trText(
              `⚡ GIANT-KILLING IN THE CUP: ${winClub.name} (D2) Eliminate Top-Flight ${loseClub.name} in ${cupDisplayName}!`,
              `⚡ แจ็คผู้ฆ่ายักษ์ศึกบอลถ้วย: ${winClub.name} (ลีกรอง) หักปากกาเซียนเขี่ย ${loseClub.name} ตกรอบ ${cupDisplayName}!`
            ),
            body: trText(
              `Sensational cup magic in the ${cupDisplayName} (${stage})! Second-division side ${winClub.name} stunned top-flight ${loseClub.name} to book their place in the next round.`,
              `เกิดเหตุการณ์ช็อกวงการในศึก ${cupDisplayName} รอบ ${stage}! สโมสรจากลีกรองอย่าง ${winClub.name} โชว์ฟอร์มสุดยอดโค่นทีมลีกสูงสุด ${loseClub.name} ทะลุเข้าสู่รอบต่อไปได้สำเร็จ!`
            ),
            isRead: false,
            isImportant:
              winClub.id === nextState.controlledClubId ||
              loseClub.id === nextState.controlledClubId,
            relatedClubId: winClub.id,
          },
        ];
      }

      nextState = {
        ...nextState,
        clubs: { ...nextState.clubs, [winClub.id]: winClub },
        transactions: nextTx,
        manager: nextMgr,
        inbox: [...giantKillingNews, ...nextState.inbox],
      };
    }

    // 2. Advance Knockout Bracket (for *_CUP, *_LC, Continental Cups, and Promotion Playoffs) or Crown Final Champion
    if (isDomesticOrLeagueCup) {
      const cupId = existingFixture.competitionId as
        | import('../types/game').CupId
        | import('../types/game').ContinentalCupId
        | import('../types/game').PromotionPlayoffId;
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
      } else if (stage === 'FINAL' && winnerId && nextState.clubs[winnerId]) {
        const champ = nextState.clubs[winnerId];
        const runnerUp = loserId ? nextState.clubs[loserId] : undefined;
        const prizeM = (getCupRoundPrizeMoney(compIdStr, 'FINAL') / 1_000_000).toFixed(2);
        const trpId = `trp_${nextState.currentSeason.replace('/', '')}_${cupId}`;
        const existingTrp = (nextState.trophyHistory || []).some((t) => t.id === trpId);
        const nextTrps = existingTrp
          ? nextState.trophyHistory || []
          : [
              {
                id: trpId,
                season: nextState.currentSeason,
                competitionId: cupId,
                competitionName: cupDisplayName,
                winnerClubId: champ.id,
                winnerClubName: champ.name,
                runnerUpClubId: runnerUp?.id,
                runnerUpClubName: runnerUp?.name,
              },
              ...(nextState.trophyHistory || []),
            ];

        nextState = {
          ...nextState,
          trophyHistory: nextTrps,
          inbox: [
            {
              id: `news_cup_win_${cupId}_${nextState.gameDate}`,
              gameDate: nextState.gameDate,
              category: 'Competition',
              title: trText(
                `🏆 ${champ.name} Crowned ${cupDisplayName} Champions!`,
                `🏆 ${champ.name} ผงาดคว้าแชมป์ ${cupDisplayName}!`
              ),
              body: trText(
                `${champ.name} have lifted the ${cupDisplayName} trophy and received €${prizeM}M in champion prize money!`,
                `${champ.name} ผงาดคว้าแชมป์ ${cupDisplayName} ไปครองอย่างยิ่งใหญ่ พร้อมรับเงินรางวัลแชมป์ €${prizeM}M!`
              ),
              isRead: false,
              isImportant: champ.id === nextState.controlledClubId,
              relatedClubId: champ.id,
            },
            ...nextState.inbox,
          ],
        };
      }
    } else if (isSuperCup && winnerId && nextState.clubs[winnerId]) {
      const champ = nextState.clubs[winnerId];
      const runnerUp = loserId ? nextState.clubs[loserId] : undefined;
      const prizeM = (getCupRoundPrizeMoney(compIdStr, 'FINAL') / 1_000_000).toFixed(2);
      const trpId = `trp_${nextState.currentSeason.replace('/', '')}_${compIdStr}`;
      const existingTrp = (nextState.trophyHistory || []).some((t) => t.id === trpId);
      const nextTrps = existingTrp
        ? nextState.trophyHistory || []
        : [
            {
              id: trpId,
              season: nextState.currentSeason,
              competitionId: existingFixture.competitionId,
              competitionName: cupDisplayName,
              winnerClubId: champ.id,
              winnerClubName: champ.name,
              runnerUpClubId: runnerUp?.id,
              runnerUpClubName: runnerUp?.name,
            },
            ...(nextState.trophyHistory || []),
          ];

      let nextMgr = nextState.manager;
      if (champ.id === nextState.controlledClubId && !existingTrp) {
        nextMgr = {
          ...nextMgr,
          reputation: Math.min(99, nextMgr.reputation + 2),
          careerStats: {
            ...nextMgr.careerStats,
            trophies: [
              {
                season: nextState.currentSeason,
                competitionName: cupDisplayName,
                clubName: champ.name,
              },
              ...nextMgr.careerStats.trophies,
            ],
          },
        };
      }

      nextState = {
        ...nextState,
        trophyHistory: nextTrps,
        manager: nextMgr,
        inbox: [
          {
            id: `news_supercup_win_${compIdStr}_${nextState.gameDate}`,
            gameDate: nextState.gameDate,
            category: 'Competition',
            title: trText(
              `🛡️ ${champ.name} Lift the ${cupDisplayName} Trophy!`,
              `🛡️ ${champ.name} ประเดิมคว้าแชมป์ ${cupDisplayName}!`
            ),
            body: trText(
              `${champ.name} defeated ${runnerUp?.name || 'their rivals'} to win the ${cupDisplayName} curtain-raiser (€${prizeM}M prize payout)!`,
              `${champ.name} เอาชนะ ${runnerUp?.name || 'คู่แข่ง'} ผงาดคว้าแชมป์ ${cupDisplayName} ประเดิมฤดูกาล พร้อมรับเงินรางวัล €${prizeM}M!`
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

  if (!options?.skipStandingsRecompute && LEAGUES_CONFIG[existingFixture.competitionId as LeagueId]) {
    nextState = checkAndTriggerPromotionPlayoffs(nextState, [
      existingFixture.competitionId as LeagueId,
    ]);
  }

  return nextState;
}

/**
 * Stage 11 Phase 3: Automatically generates 4-team Promotion Playoff Semi-Finals
 * (3rd vs 6th, 4th vs 5th) for any Tier 2/3 league whose regular-season schedule has 100% finished.
 */
export function checkAndTriggerPromotionPlayoffs(
  state: WorldState,
  leaguesToCheck?: Iterable<LeagueId>
): WorldState {
  const checkSet = leaguesToCheck ? new Set(leaguesToCheck) : null;
  let newPlayoffFixtures: Fixture[] = [];
  const playoffNews: NewsItem[] = [];

  for (const [playoffId, cfg] of Object.entries(PROMOTION_PLAYOFF_LEAGUE_MAP) as [
    import('../types/game').PromotionPlayoffId,
    { lowerLeagueId: LeagueId; upperLeagueId: LeagueId; autoSpots: number },
  ][]) {
    if (checkSet && !checkSet.has(cfg.lowerLeagueId)) continue;

    const alreadyScheduled = state.fixtures.some(
      (f) => f.competitionId === playoffId && f.seasonId === state.currentSeason
    );
    if (alreadyScheduled) continue;

    const regularFixtures = state.fixtures.filter(
      (f) => f.competitionId === cfg.lowerLeagueId && f.seasonId === state.currentSeason
    );
    if (regularFixtures.length === 0) continue;
    if (regularFixtures.some((f) => f.status !== 'Completed')) continue;

    const table = state.standings[cfg.lowerLeagueId] || [];
    if (table.length < 6) continue;

    const generated = generatePromotionPlayoffFixtures(
      playoffId,
      table,
      state.currentSeason,
      state.gameDate
    );
    if (generated.length > 0) {
      newPlayoffFixtures = [...newPlayoffFixtures, ...generated];
      const poMeta = CUP_COMPETITIONS_META[playoffId];
      const userInPlayoffs = generated.some(
        (f) => f.homeClubId === state.controlledClubId || f.awayClubId === state.controlledClubId
      );
      const t3 = state.clubs[table[2].clubId]?.name || '3rd';
      const t4 = state.clubs[table[3].clubId]?.name || '4th';
      const t5 = state.clubs[table[4].clubId]?.name || '5th';
      const t6 = state.clubs[table[5].clubId]?.name || '6th';

      playoffNews.push({
        id: `news_playoffs_drawn_${playoffId}_${state.currentSeason.replace('/', '')}`,
        gameDate: state.gameDate,
        category: 'Competition',
        title: trText(
          `🎟️ ${poMeta.name} Semi-Finals Confirmed!`,
          `🎟️ ยืนยันคู่เพลย์ออฟเลื่อนชั้น ${poMeta.name} รอบรองชนะเลิศ!`
        ),
        body: trText(
          `The regular season has concluded! Semi-Final 1: ${t3} (#3) vs ${t6} (#6) | Semi-Final 2: ${t4} (#4) vs ${t5} (#5). Winners advance to the Promotion Final for a place in ${LEAGUES_CONFIG[cfg.upperLeagueId].name}!`,
          `จบฤดูกาลปกติเรียบร้อย! รอบรองฯ คู่ที่ 1: ${t3} (อันดับ 3) พบ ${t6} (อันดับ 6) | คู่ที่ 2: ${t4} (อันดับ 4) พบ ${t5} (อันดับ 5) ผู้ชนะนัดชิงฯ จะได้เลื่อนชั้นสู่ ${LEAGUES_CONFIG[cfg.upperLeagueId].name}!`
        ),
        isRead: false,
        isImportant: userInPlayoffs,
        relatedClubId: userInPlayoffs ? state.controlledClubId : table[2].clubId,
      });
    }
  }

  if (newPlayoffFixtures.length === 0) return state;

  return {
    ...state,
    fixtures: [...state.fixtures, ...newPlayoffFixtures],
    inbox: [...playoffNews, ...state.inbox],
  };
}

/**
 * Stage 11 Phase 2: High-speed batched AI fixture simulator.
 * Clones world maps ONCE, indexes 8,300 players by clubId ONCE, simulates all
 * fixtures with O(1) squad lookup, and recomputes league/UEFA standings ONCE per
 * touched competition instead of 190x per matchday (30-50x faster!).
 */
export function simulateAndApplyFixturesBatch(
  state: WorldState,
  fixturesToSim: Fixture[]
): WorldState {
  if (fixturesToSim.length === 0) return state;

  let working: WorldState = {
    ...state,
    fixtures: [...state.fixtures],
    players: { ...state.players },
    clubs: { ...state.clubs },
    transactions: [...state.transactions],
    inbox: [...state.inbox],
    standings: { ...state.standings },
    uefaStandings: state.uefaStandings
      ? {
          UEFA_UCL: state.uefaStandings.UEFA_UCL || [],
          UEFA_UEL: state.uefaStandings.UEFA_UEL || [],
          UEFA_UECL: state.uefaStandings.UEFA_UECL || [],
        }
      : undefined,
  };

  const playersByClubId = buildPlayersByClubIndex(working.players);
  const staffByClubId = new Map<string, StaffMember[]>();
  for (const s of Object.values(working.staff)) {
    if (!s.clubId) continue;
    const arr = staffByClubId.get(s.clubId);
    if (arr) arr.push(s);
    else staffByClubId.set(s.clubId, [s]);
  }
  const fixtureIndexById = new Map<string, number>();
  for (let i = 0; i < working.fixtures.length; i++) {
    fixtureIndexById.set(working.fixtures[i].id, i);
  }
  const touchedLeagues = new Set<LeagueId>();
  const touchedUefa = new Set<UefaCompetitionId>();

  for (const fix of fixturesToSim) {
    const home = working.clubs[fix.homeClubId];
    const away = working.clubs[fix.awayClubId];
    if (!home || !away) continue;

    const compStr = String(fix.competitionId);
    const isKnockout =
      Boolean(fix.cupRound) ||
      Boolean(fix.uefaStage && fix.uefaStage !== 'LEAGUE_PHASE') ||
      compStr.endsWith('_SC') ||
      compStr === 'UEFA_USC';

    const matchSeed = working.randomSeed + fix.matchday * 1009 + fix.id.length * 17;
    const homeSquad = playersByClubId.get(fix.homeClubId) || [];
    const awaySquad = playersByClubId.get(fix.awayClubId) || [];
    const res = simulateMatch(fix, home, away, working.players, matchSeed, undefined, undefined, {
      isKnockout,
      preGroupedSquads: { homeSquad, awaySquad },
    });

    working = applyMatchResultToWorld(working, fix.id, res, {
      skipStandingsRecompute: true,
      playersByClubId,
      staffByClubId,
      fixtureIndexById,
      mutateInPlace: true,
    });

    const lId = fix.competitionId as LeagueId;
    if (LEAGUES_CONFIG[lId]) {
      touchedLeagues.add(lId);
    }
    const uId = fix.competitionId as UefaCompetitionId;
    if (UEFA_COMPETITIONS_CONFIG[uId]) {
      touchedUefa.add(uId);
    }
  }

  // Recompute standings ONCE per touched league/UEFA competition
  if (touchedLeagues.size > 0) {
    const clubIdsByLeague = new Map<LeagueId, string[]>();
    for (const c of Object.values(working.clubs)) {
      if (!touchedLeagues.has(c.leagueId)) continue;
      const arr = clubIdsByLeague.get(c.leagueId);
      if (arr) arr.push(c.id);
      else clubIdsByLeague.set(c.leagueId, [c.id]);
    }
    for (const leagueId of touchedLeagues) {
      const leagueClubIds = clubIdsByLeague.get(leagueId) || [];
      working.standings[leagueId] = recomputeLeagueStandings(
        LEAGUES_CONFIG[leagueId],
        working.currentSeason,
        leagueClubIds,
        working.fixtures,
        working.clubs
      );
    }
  }

  if (touchedUefa.size > 0 && working.uefaStandings) {
    for (const uefaCompId of touchedUefa) {
      const participantIds =
        working.uefaPots?.[uefaCompId]?.flat() ||
        (working.uefaStandings[uefaCompId] || []).map((s) => s.clubId);
      if (participantIds.length > 0) {
        working.uefaStandings[uefaCompId] = recomputeUefaStandings(
          uefaCompId,
          working.currentSeason,
          participantIds,
          working.fixtures,
          working.clubs
        );
      }
    }
  }

  if (touchedLeagues.size > 0) {
    working = checkAndTriggerPromotionPlayoffs(working, touchedLeagues);
  }

  return working;
}

/**
 * Completes the user's fixture AND simulates all other scheduled AI fixtures
 * on the same matchday across all 23 leagues so League Standings are 100% synchronized.
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

  current = simulateAndApplyFixturesBatch(current, sameMatchdayAiFixtures);
  return current;
}

/**
 * Advances the World Clock by 1 day atomically.
 * - Guards against duplicate execution for the same date
 * - Recovers player fitness, progresses injuries, and runs weekly training & development
 * - Progresses scout assignments
 * - Simulates all non-user fixtures scheduled on the current date in a single indexed batch
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

  // Simulate all AI vs AI matches scheduled on `current.gameDate` via Stage 11 Phase 2 batch engine
  const aiFixturesToday = current.fixtures.filter(
    (f) =>
      f.kickoffDate === current.gameDate &&
      f.status === 'Scheduled' &&
      f.homeClubId !== current.controlledClubId &&
      f.awayClubId !== current.controlledClubId
  );

  if (aiFixturesToday.length > 0) {
    current = simulateAndApplyFixturesBatch(current, aiFixturesToday);
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
      const badgeMod = getCoachingLicenseModifiers(current.manager.coachingBadge);
      const devChance = isUserPlayer
        ? baseDevChance * userStaffBonuses.trainingDevMultiplier * badgeMod.trainingGrowthMultiplier
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
    const badgeMod = getCoachingLicenseModifiers(current.manager.coachingBadge);
    const baseFamGain = controlled.trainingFocus === 'Match Preparation' ? 4 : 2;
    const famGain = Math.round(baseFamGain * badgeMod.familiarityMultiplier);
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
    // Stage 11 Phase 2: Build 1-pass club index instead of O(393 * 8,300) nested filter!
    const mondaySquadsByClub = buildPlayersByClubIndex(updatedPlayers);
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
        const clubSquad = mondaySquadsByClub.get(cId) || [];
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
    const userSquad = (mondaySquadsByClub.get(controlled.id) || []).filter(
      (pl) => !pl.injuryStatus.isInjured
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

  let updatedManager = current.manager;
  if (
    current.manager.studyingBadge &&
    nextDate >= current.manager.studyingBadge.completionDate
  ) {
    const graduatedBadge = current.manager.studyingBadge.targetBadge;
    updatedManager = {
      ...current.manager,
      coachingBadge: graduatedBadge,
      reputation: Math.min(100, current.manager.reputation + 5),
      studyingBadge: null,
    };
    const myCtrl = updatedClubs[current.controlledClubId];
    if (myCtrl) {
      updatedClubs[myCtrl.id] = {
        ...myCtrl,
        primaryTactic: {
          ...myCtrl.primaryTactic,
          familiarity: Math.min(100, myCtrl.primaryTactic.familiarity + 8),
        },
        secondaryTactic: {
          ...myCtrl.secondaryTactic,
          familiarity: Math.min(100, myCtrl.secondaryTactic.familiarity + 8),
        },
      };
    }
    updatedInbox.unshift({
      id: `news_badge_grad_${nextDate}_${graduatedBadge.replace(/\s+/g, '_')}`,
      gameDate: nextDate,
      category: 'Board',
      title: trText(
        `UEFA Coaching License Awarded: ${current.manager.name} Graduates with ${graduatedBadge}!`,
        `สอบผ่านใบอนุญาตโค้ช! ${current.manager.name} จบหลักสูตร ${graduatedBadge} อย่างเป็นทางการ!`
      ),
      body: trText(
        `Congratulations! You have completed your coaching course and been awarded the ${graduatedBadge} License (+8% Tactical Familiarity & permanent training/negotiation bonuses unlocked).`,
        `ขอแสดงความยินดี! คุณผ่านการอบรมและได้รับใบอนุญาตโค้ชระดับ ${graduatedBadge} เรียบร้อยแล้ว (+8% ความคุ้นเคยแผนการเล่น พร้อมปลดล็อกโบนัสการซ้อมและการเจรจาถาวร)`
      ),
      isRead: false,
      isImportant: true,
    });
  }

  let nextState: WorldState = {
    ...current,
    gameDate: nextDate,
    processedDates: [...current.processedDates, nextDate],
    manager: updatedManager,
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

  // Stage 16 Phase 2: Weekly Monday Autonomous AI-to-AI Transfer Market during Open Transfer Windows (Jan, Jul, Aug)
  const dayOfWeekUtc = new Date(`${nextDate}T00:00:00Z`).getUTCDay();
  const nextMonthNum = parseInt(nextDate.slice(5, 7), 10) || 7;
  if (dayOfWeekUtc === 1 && (nextMonthNum === 1 || nextMonthNum === 7 || nextMonthNum === 8)) {
    nextState = simulateAiToAiTransferWindowTick(nextState).nextState;
  }

  // Stage 16 Phase 4: January 1st Contract Expiry & Bosman Protection Report from Assistant Manager
  if (nextDate.endsWith('-01-01')) {
    const bosmanAlertRes = generateBosmanContractExpiryAlert(nextState);
    nextState = bosmanAlertRes.nextState;
  }

  // Stage 13 Phase 3: Weekly Monday AI Managerial Carousel Check after Matchday 10 (plus 1st of month)
  const maxPlayedInUserLeague = Math.max(
    0,
    ...(nextState.standings[nextState.clubs[nextState.controlledClubId]?.leagueId || 'ENG_PL'] || []).map(
      (r) => r.played
    )
  );
  const isWeeklyMondayPostMd10 = dayOfWeekUtc === 1 && maxPlayedInUserLeague >= 10;
  if (
    !nextDate.endsWith('-06-01') &&
    (nextDate.endsWith('-01') || isWeeklyMondayPostMd10)
  ) {
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
 * Stage 14 Phase 4: Evaluates how much an AI selling club values a player offered in part-exchange (85%–115% of marketValue).
 */
export function evaluateSwapPlayerValuation(
  state: WorldState,
  swapPlayerId: string,
  sellingClubId: string
): {
  valuation: number;
  multiplier: number;
  positionalNeed: boolean;
  reasonEn: string;
  reasonTh: string;
} {
  const swapPlayer = state.players[swapPlayerId];
  const sellingClub = state.clubs[sellingClubId];
  if (!swapPlayer || !sellingClub) {
    return {
      valuation: 0,
      multiplier: 0.85,
      positionalNeed: false,
      reasonEn: 'Invalid swap player',
      reasonTh: 'ไม่พบนักเตะสำหรับแลกตัว',
    };
  }

  const pos = swapPlayer.positions[0];
  const sellingPlayersAtPos = Object.values(state.players).filter(
    (p) => p.clubId === sellingClubId && p.positions.includes(pos)
  );
  const bestExistingCa = sellingPlayersAtPos.reduce(
    (max, p) => Math.max(max, p.currentAbility),
    0
  );

  let multiplier = 0.98;
  let positionalNeed = false;
  let reasonEn = `Fair Part-Exchange (98%): ${sellingClub.shortName} view ${swapPlayer.lastName} as a solid squad option.`;
  let reasonTh = `ประเมินราคาตามตลาด (98%): ${sellingClub.shortName} มองว่า ${swapPlayer.lastName} ช่วยเสริมขุมกำลังได้`;

  if (sellingPlayersAtPos.length <= 1 || swapPlayer.currentAbility >= bestExistingCa + 3) {
    multiplier = 1.15;
    positionalNeed = true;
    reasonEn = `Positional Need (+15%): ${sellingClub.shortName} actively need a ${pos} upgrade!`;
    reasonTh = `ตำแหน่งขาดแคลน (+15%): ${sellingClub.shortName} กำลังต้องการผู้เล่นตำแหน่ง ${pos} พอดี!`;
  } else if (sellingPlayersAtPos.length >= 4 && swapPlayer.currentAbility < bestExistingCa - 6) {
    multiplier = 0.85;
    reasonEn = `Overstocked (-15%): ${sellingClub.shortName} already have strong depth at ${pos}.`;
    reasonTh = `ตำแหน่งล้นทีม (-15%): ${sellingClub.shortName} มีตัวเลือกตำแหน่ง ${pos} เยอะอยู่แล้ว`;
  }

  return {
    valuation: Math.round(swapPlayer.marketValue * multiplier),
    multiplier,
    positionalNeed,
    reasonEn,
    reasonTh,
  };
}

/**
 * Stage 14 Phase 4: Detects if a marquee star (CA >= 152) or elite wonderkid (PA >= 165 & age <= 21)
 * attracts a competing AI giant in a Transfer Bidding War.
 */
export function detectTransferBiddingWar(
  state: WorldState,
  targetPlayerId: string,
  buyingClubId: string
): {
  isBiddingWar: boolean;
  rivalClubId: string;
  rivalClubName: string;
  rivalShortName: string;
  rivalBidFee: number;
  requiredWageBoostPct: number;
} | null {
  const player = state.players[targetPlayerId];
  if (!player || player.transferListed) return null;

  const currentYear = parseInt(state.gameDate.slice(0, 4), 10) || 2026;
  const birthYear = parseInt(player.dateOfBirth.slice(0, 4), 10) || 2002;
  const age = currentYear - birthYear;
  const isMarqueeOrWonderkid =
    player.currentAbility >= 156 || (player.potentialAbility >= 168 && age <= 21);

  if (!isMarqueeOrWonderkid) return null;

  const richRivals = Object.values(state.clubs)
    .filter(
      (c) =>
        c.id !== buyingClubId &&
        c.id !== player.clubId &&
        c.reputation >= 84 &&
        c.finances.transferBudget >= Math.min(35_000_000, Math.round(player.marketValue * 0.45))
    )
    .sort((a, b) => b.reputation - a.reputation);

  if (richRivals.length === 0) return null;

  // Deterministic rival selection from player ID hash
  let hash = 0;
  for (let i = 0; i < player.id.length; i++) {
    hash = (hash * 31 + player.id.charCodeAt(i)) >>> 0;
  }
  const topPool = richRivals.slice(0, Math.min(8, richRivals.length));
  const rival = topPool[hash % topPool.length];

  return {
    isBiddingWar: true,
    rivalClubId: rival.id,
    rivalClubName: rival.name,
    rivalShortName: rival.shortName,
    rivalBidFee: Math.round(Math.max(player.askingPrice, player.marketValue) * 1.05),
    requiredWageBoostPct: 15,
  };
}

/**
 * Evaluates and executes a Transfer or Loan Offer from the user's club to an AI club,
 * including Club valuation check + Player Swap Part-Exchange + Bidding Wars + Player/Agent contract check + atomic squad & budget update.
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
    swapPlayerId?: string | null;
    sweetenBiddingWar?: boolean;
  }
): {
  nextState: WorldState;
  outcome: 'COMPLETED' | 'COUNTERED' | 'REJECTED' | 'BIDDING_WAR';
  message: string;
  biddingWar?: {
    rivalClubId: string;
    rivalClubName: string;
    rivalShortName: string;
    rivalBidFee: number;
    requiredWageBoostPct: number;
  };
} {
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

  // Validate optional Part-Exchange Swap Player
  let swapPlayer: Player | null = null;
  let swapValuation = 0;
  if (params.offerType === 'Transfer' && params.swapPlayerId) {
    const candidate = state.players[params.swapPlayerId];
    if (!candidate || candidate.clubId !== buyingClub.id || candidate.loanedFromClubId) {
      return {
        nextState: state,
        outcome: 'REJECTED',
        message: trText(
          'Selected part-exchange player is not eligible for a swap deal.',
          'นักเตะที่เลือกแลกตัวไม่สามารถใช้ในดีลแลกเปลี่ยนได้'
        ),
      };
    }
    const buyingClubSquad = Object.values(state.players).filter((p) => p.clubId === buyingClub.id);
    if (buyingClubSquad.length <= 15) {
      return {
        nextState: state,
        outcome: 'REJECTED',
        message: trText(
          'Cannot include a swap player: your squad is already at minimum depth (15 players).',
          'ไม่สามารถแนบนักเตะแลกตัวได้ เนื่องจากขนาดทีมของคุณอยู่ที่ขั้นต่ำแล้ว (15 คน)'
        ),
      };
    }
    if (
      candidate.positions[0] === 'GK' &&
      buyingClubSquad.filter((p) => p.positions[0] === 'GK').length <= 1 &&
      player.positions[0] !== 'GK'
    ) {
      return {
        nextState: state,
        outcome: 'REJECTED',
        message: trText(
          'Cannot swap away your only goalkeeper unless signing a replacement GK.',
          'ไม่สามารถแลกตัวผู้รักษาประตูคนสุดท้ายของทีมได้'
        ),
      };
    }
    swapPlayer = candidate;
    swapValuation = evaluateSwapPlayerValuation(state, swapPlayer.id, sellingClub.id).valuation;
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

  // Evaluate Club valuation (Cash + Installments + Sell-On + Part-Exchange Swap Valuation)
  const effectiveOfferValue =
    params.upfrontFee +
    params.installmentsFee * 0.85 +
    (params.sellOnPercentage / 100) * player.marketValue * 0.5 +
    swapValuation;

  const requiredValue =
    params.offerType === 'Loan'
      ? Math.round(player.wagePerWeek * 10)
      : player.releaseClause && params.upfrontFee >= player.releaseClause
        ? player.releaseClause
        : Math.round(player.askingPrice * 0.92);

  const offerId = `off_${Date.now()}_${player.id}`;
  const effectiveProposedWage = params.sweetenBiddingWar
    ? Math.round(params.proposedWagePerWeek * 1.15)
    : params.proposedWagePerWeek;
  const agentFee = Math.round(effectiveProposedWage * 2.5);

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
      swapPlayerId: swapPlayer?.id || null,
      swapValuation: swapValuation || undefined,
      proposedWagePerWeek: effectiveProposedWage,
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
      swapPlayerId: swapPlayer?.id || null,
      swapValuation: swapValuation || undefined,
      proposedWagePerWeek: effectiveProposedWage,
      proposedContractYears: params.proposedContractYears,
      proposedSquadStatus: params.proposedSquadStatus,
      signingBonus: params.signingBonus,
      agentFee,
      status: 'CounterOffer',
      counterAmount: Math.max(0, requiredValue - swapValuation),
    };

    return {
      nextState: {
        ...state,
        transferOffers: [counterOffer, ...state.transferOffers],
      },
      outcome: 'COUNTERED',
      message: trText(
        `${sellingClub.name} submitted a counter-offer of €${(requiredValue / 1_000_000).toFixed(2)}M total package${swapPlayer ? ` (or €${(Math.max(0, requiredValue - swapValuation) / 1_000_000).toFixed(2)}M + ${swapPlayer.lastName})` : ''}.`,
        `${sellingClub.name} ยื่นข้อเสนอต่อรองมูลค่ารวม €${(requiredValue / 1_000_000).toFixed(2)}M${swapPlayer ? ` (หรือเงินสด €${(Math.max(0, requiredValue - swapValuation) / 1_000_000).toFixed(2)}M + ${swapPlayer.lastName})` : ''}`
      ),
    };
  }

  // Check Player Wage expectation (UEFA Pro license grants +15% negotiation patience / -10% minimum wage threshold)
  const badgeMod = getCoachingLicenseModifiers(state.manager.coachingBadge);
  const minWageAccepted = Math.round(player.wagePerWeek * 0.92 * badgeMod.wageDemandMultiplier);
  if (effectiveProposedWage < minWageAccepted) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: trText(
        `${player.firstName} ${player.lastName}'s agent rejected the contract terms (Minimum wage demanded: €${minWageAccepted.toLocaleString()}/wk).`,
        `เอเยนต์ของ ${player.firstName} ${player.lastName} ปฏิเสธสัญญาเนื่องจากค่าเหนื่อยต่ำกว่า €${minWageAccepted.toLocaleString()}/สัปดาห์`
      ),
    };
  }

  // Stage 14 Phase 4: Transfer Bidding War for Marquee Stars / Elite Wonderkids
  const biddingWar =
    params.offerType === 'Transfer'
      ? detectTransferBiddingWar(state, player.id, buyingClub.id)
      : null;

  if (biddingWar && !params.sweetenBiddingWar) {
    const biddingOffer: TransferOffer = {
      id: offerId,
      date: state.gameDate,
      playerId: player.id,
      buyingClubId: buyingClub.id,
      sellingClubId: sellingClub.id,
      offerType: params.offerType,
      upfrontFee: params.upfrontFee,
      installmentsFee: params.installmentsFee,
      sellOnPercentage: params.sellOnPercentage,
      swapPlayerId: swapPlayer?.id || null,
      swapValuation: swapValuation || undefined,
      biddingWarClubId: biddingWar.rivalClubId,
      biddingWarClubName: biddingWar.rivalClubName,
      proposedWagePerWeek: params.proposedWagePerWeek,
      proposedContractYears: params.proposedContractYears,
      proposedSquadStatus: params.proposedSquadStatus,
      signingBonus: params.signingBonus,
      agentFee,
      status: 'ClubAccepted',
    };

    return {
      nextState: {
        ...state,
        transferOffers: [biddingOffer, ...state.transferOffers],
      },
      outcome: 'BIDDING_WAR',
      biddingWar,
      message: trText(
        `⚔️ BIDDING WAR: ${biddingWar.rivalClubName} have matched your bid for ${player.firstName} ${player.lastName}! Sweeten your contract offer by +${biddingWar.requiredWageBoostPct}% to win the signing.`,
        `⚔️ ศึกแย่งตัวนักเตะ: ${biddingWar.rivalClubName} ยื่นข้อเสนอเทียบเท่าเพื่อปาดหน้าคว้า ${player.firstName} ${player.lastName}! เพิ่มข้อเสนอค่าเหนื่อยอีก +${biddingWar.requiredWageBoostPct}% เพื่อปิดดีลทันที`
      ),
    };
  }

  // Complete Transfer Atomically!
  const totalDeducted = params.upfrontFee + params.signingBonus + agentFee;
  buyingClub.finances = {
    ...buyingClub.finances,
    balance: buyingClub.finances.balance - totalDeducted,
    transferBudget: buyingClub.finances.transferBudget - totalDeducted,
    wageUsedPerWeek: Math.max(
      0,
      buyingClub.finances.wageUsedPerWeek + effectiveProposedWage - (swapPlayer?.wagePerWeek || 0)
    ),
  };

  sellingClub.finances = {
    ...sellingClub.finances,
    balance: sellingClub.finances.balance + params.upfrontFee,
    transferBudget: sellingClub.finances.transferBudget + Math.round(params.upfrontFee * 0.8),
    wageUsedPerWeek: Math.max(
      0,
      sellingClub.finances.wageUsedPerWeek - player.wagePerWeek + (swapPlayer?.wagePerWeek || 0)
    ),
  };

  const endYear = parseInt(state.gameDate.slice(0, 4), 10) + params.proposedContractYears;
  const updatedPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    loanedFromClubId: params.offerType === 'Loan' ? sellingClub.id : null,
    loanOptionToBuyFee:
      params.offerType === 'Loan'
        ? params.loanOptionToBuyFee || Math.round(player.marketValue * 1.15)
        : null,
    wagePerWeek: effectiveProposedWage,
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
        fee: params.upfrontFee + params.installmentsFee + swapValuation,
        type: params.offerType,
      },
      ...player.transferHistory,
    ],
  };

  const updatedPlayers: Record<string, Player> = {
    ...state.players,
    [updatedPlayer.id]: updatedPlayer,
  };

  // Atomically move part-exchange swap player to the selling club
  if (swapPlayer) {
    updatedPlayers[swapPlayer.id] = {
      ...swapPlayer,
      clubId: sellingClub.id,
      loanedFromClubId: null,
      transferListed: false,
      loanListed: false,
      morale: Math.max(55, swapPlayer.morale - 4),
      transferHistory: [
        {
          date: state.gameDate,
          fromClubId: buyingClub.id,
          toClubId: sellingClub.id,
          fee: swapValuation,
          type: 'Transfer',
        },
        ...swapPlayer.transferHistory,
      ],
    };
  }

  // Re-pick selling club lineup so it integrates swapPlayer & removes departed player
  const sellingClubPlayers = Object.values(updatedPlayers).filter((p) => p.clubId === sellingClub.id);
  sellingClub.primaryTactic = autoPickLineup(
    sellingClub.primaryTactic.formation,
    sellingClubPlayers,
    sellingClub.primaryTactic.instructions,
    sellingClub.primaryTactic.id,
    sellingClub.primaryTactic.name
  );

  // Update buying club lineup cleanly if swapPlayer left the XI or bench
  if (swapPlayer) {
    const swapWasInLineup = buyingClub.primaryTactic.lineup.some((s) => s.playerId === swapPlayer!.id);
    const cleanedBench = buyingClub.primaryTactic.benchPlayerIds.filter((id) => id !== swapPlayer!.id);
    if (swapWasInLineup) {
      const buyingClubPlayers = Object.values(updatedPlayers).filter((p) => p.clubId === buyingClub.id);
      buyingClub.primaryTactic = autoPickLineup(
        buyingClub.primaryTactic.formation,
        buyingClubPlayers,
        buyingClub.primaryTactic.instructions,
        buyingClub.primaryTactic.id,
        buyingClub.primaryTactic.name
      );
    } else {
      buyingClub.primaryTactic = {
        ...buyingClub.primaryTactic,
        benchPlayerIds:
          cleanedBench.length < 9 && !cleanedBench.includes(updatedPlayer.id)
            ? [...cleanedBench, updatedPlayer.id]
            : cleanedBench,
      };
    }
  } else if (
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
    swapPlayerId: swapPlayer?.id || null,
    swapValuation: swapValuation || undefined,
    biddingWarClubId: biddingWar?.rivalClubId || null,
    biddingWarClubName: biddingWar?.rivalClubName || null,
    proposedWagePerWeek: effectiveProposedWage,
    proposedContractYears: params.proposedContractYears,
    proposedSquadStatus: params.proposedSquadStatus,
    signingBonus: params.signingBonus,
    agentFee,
    status: 'Completed',
    loanOptionToBuyFee: params.loanOptionToBuyFee,
    buyBackClauseFee: params.buyBackClauseFee,
  };

  const swapNoteEn = swapPlayer
    ? ` (+ ${swapPlayer.firstName} ${swapPlayer.lastName} in €${(swapValuation / 1_000_000).toFixed(1)}M part-exchange)`
    : '';
  const swapNoteTh = swapPlayer
    ? ` (+ แนบ ${swapPlayer.firstName} ${swapPlayer.lastName} แลกตัวมูลค่า €${(swapValuation / 1_000_000).toFixed(1)}M)`
    : '';
  const biddingNoteEn =
    biddingWar && params.sweetenBiddingWar
      ? ` after winning a dramatic bidding war against ${biddingWar.rivalClubName}`
      : '';
  const biddingNoteTh =
    biddingWar && params.sweetenBiddingWar
      ? ` หลังปาดหน้าเอาชนะ ${biddingWar.rivalClubName} ในศึกแย่งตัวสุดเดือด`
      : '';

  const tx: FinanceTransaction = {
    id: `tx_trf_${offerId}`,
    date: state.gameDate,
    clubId: buyingClub.id,
    category: 'Player Purchase',
    amount: -totalDeducted,
    description: trText(
      `Signed ${player.firstName} ${player.lastName} from ${sellingClub.name} (${params.offerType === 'Loan' ? 'Loan' : swapPlayer ? 'Cash + Swap' : 'Permanent'})${swapNoteEn}`,
      `คว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name} (${params.offerType === 'Loan' ? 'ยืมตัว' : swapPlayer ? 'เงินสด + แลกตัว' : 'ซื้อขาด'})${swapNoteTh}`
    ),
    balanceAfter: buyingClub.finances.balance,
  };

  const news: NewsItem = {
    id: `news_trf_${offerId}`,
    gameDate: state.gameDate,
    category: 'Transfer',
    title: trText(
      `OFFICIAL: ${buyingClub.name} sign ${player.firstName} ${player.lastName}${swapPlayer ? ` in swap deal for ${swapPlayer.lastName}` : ''}!`,
      `OFFICIAL: ${buyingClub.name} คว้าตัว ${player.firstName} ${player.lastName}${swapPlayer ? ` พ่วงดีลสลับขั้ว ${swapPlayer.lastName}` : ''} ร่วมทัพ!`
    ),
    body: trText(
      `${buyingClub.name} have completed the signing of ${player.firstName} ${player.lastName} from ${sellingClub.name}${biddingNoteEn} for €${((params.upfrontFee + params.installmentsFee) / 1_000_000).toFixed(2)}M${swapNoteEn} on a contract until ${endYear} worth €${effectiveProposedWage.toLocaleString()}/wk.`,
      `${buyingClub.name} บรรลุข้อตกลงคว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name}${biddingNoteTh} ด้วยค่าตัว €${((params.upfrontFee + params.installmentsFee) / 1_000_000).toFixed(2)}M${swapNoteTh} พร้อมสัญญาถึงปี ${endYear} รับค่าเหนื่อย €${effectiveProposedWage.toLocaleString()}/สัปดาห์`
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
      `Successfully signed ${player.firstName} ${player.lastName} for ${buyingClub.name}${swapNoteEn}!`,
      `คว้าตัว ${player.firstName} ${player.lastName} ร่วมทีม ${buyingClub.name}${swapNoteTh} สำเร็จ!`
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

export interface SeasonRolloverSummary {
  completedSeason: string;
  nextSeason: string;
  leagueName: string;
  finalPosition: number;
  leagueChampionName: string;
  uclChampionName: string;
  clubTopScorerName: string;
  clubTopScorerGoals: number;
  clubPlayerOfSeasonName: string;
  clubPlayerOfSeasonRating: number;
  totalPrizeAndTvPayout: number;
  nextTransferBudget: number;
}

export function processEndOfSeasonRollover(
  state: WorldState
): { nextState: WorldState; message: string; seasonSummary: SeasonRolloverSummary } {
  const curYear = parseInt(state.currentSeason.slice(0, 4), 10) || 2026;
  const nextYear = curYear + 1;
  const nextSeasonStr = `${nextYear}/${String(nextYear + 1).slice(-2)}`;

  const updatedClubs = { ...state.clubs };
  const updatedPlayers = { ...state.players };
  const nextInbox = [...state.inbox];
  const nextTransactions = [...state.transactions];

  let userClubTotalPayout = 22_000_000;
  let userFinalPosition = 1;

  // Capture user club's top scorer and player of the season before resetting stats
  const myClubPlayersPreReset = Object.values(state.players).filter(
    (p) => p.clubId === state.controlledClubId
  );
  const topScorerPlayer =
    [...myClubPlayersPreReset].sort((a, b) => {
      if (b.stats.goals !== a.stats.goals) return b.stats.goals - a.stats.goals;
      return b.currentAbility - a.currentAbility;
    })[0] || myClubPlayersPreReset[0];

  const bestRatedPlayer =
    [...myClubPlayersPreReset].sort((a, b) => {
      const rA = a.stats.averageRating || 6.8 + a.currentAbility * 0.005;
      const rB = b.stats.averageRating || 6.8 + b.currentAbility * 0.005;
      return rB - rA;
    })[0] || myClubPlayersPreReset[0];

  // 1. Award League Prize Money + TV Revenue + Sugar Daddy Owner Injection + Relegation Penalty (Checkpoint 18)
  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    const relSpots = league.relegationSpots || 3;
    table.forEach((row, idx) => {
      const club = updatedClubs[row.clubId];
      if (!club) return;
      const isRelegated =
        league.tier !== 2 && league.tier !== 3 && relSpots > 0 && idx >= table.length - relSpots;
      const positionPrize = Math.max(
        1_200_000,
        (20 - idx) * (league.tier === 3 ? 350_000 : league.tier === 2 ? 650_000 : 2_200_000)
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
        userClubTotalPayout = totalAdded;
        userFinalPosition = idx + 1;
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
  const cleanCompletedSeason = state.currentSeason.replace('/', '');

  const pushTrophyOnce = (
    record: TrophyHistoryRecord,
    reputationBoost: number
  ) => {
    if (!nextTrophyHistory.some((t) => t.id === record.id)) {
      nextTrophyHistory.unshift(record);
    }
    if (record.winnerClubId === state.controlledClubId) {
      const alreadyInCareer = updatedManager.careerStats.trophies.some(
        (t) => t.season === record.season && t.competitionName === record.competitionName
      );
      if (!alreadyInCareer) {
        updatedManager = {
          ...updatedManager,
          reputation: Math.min(99, updatedManager.reputation + reputationBoost),
          careerStats: {
            ...updatedManager.careerStats,
            trophies: [
              {
                season: record.season,
                competitionName: record.competitionName,
                clubName: record.winnerClubName,
              },
              ...updatedManager.careerStats.trophies,
            ],
          },
        };
      }
    }
  };

  // Record Champions for all 15 Domestic Leagues (Tier 1 & Tier 2)
  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    if (table[0]) {
      const winnerClub = updatedClubs[table[0].clubId];
      const runnerUpClub = table[1] ? updatedClubs[table[1].clubId] : undefined;
      if (winnerClub) {
        pushTrophyOnce(
          {
            id: `trp_${cleanCompletedSeason}_${league.id}`,
            season: state.currentSeason,
            competitionId: league.id,
            competitionName: league.name,
            winnerClubId: winnerClub.id,
            winnerClubName: winnerClub.name,
            runnerUpClubId: runnerUpClub?.id,
            runnerUpClubName: runnerUpClub?.name,
          },
          league.tier === 2 ? 3 : 5
        );
      }
    }
  }

  // Record UEFA Club Competitions (UEFA_UCL, UEFA_UEL, UEFA_UECL)
  let uclWinnerClub: Club | undefined;
  for (const uefaId of ['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]) {
    const uefaCfg = UEFA_COMPETITIONS_CONFIG[uefaId];
    const uefaFinal = state.fixtures.find(
      (f) =>
        f.competitionId === uefaId &&
        f.seasonId === state.currentSeason &&
        f.uefaStage === 'FINAL' &&
        f.status === 'Completed' &&
        f.result
    );
    const uefaTable = state.uefaStandings?.[uefaId] || [];
    const winId = uefaFinal
      ? getDomesticCupFixtureWinnerId(uefaFinal)
      : uefaTable[0]?.clubId || (uefaId === 'UEFA_UCL' ? 'club_esp_ll_1' : undefined);
    const runId = uefaFinal
      ? uefaFinal.homeClubId === winId
        ? uefaFinal.awayClubId
        : uefaFinal.homeClubId
      : uefaTable[1]?.clubId;
    const winClub = winId ? updatedClubs[winId] : undefined;
    const runClub = runId ? updatedClubs[runId] : undefined;
    if (uefaId === 'UEFA_UCL') {
      uclWinnerClub = winClub;
    }
    if (winClub) {
      pushTrophyOnce(
        {
          id: `trp_${cleanCompletedSeason}_${uefaId}`,
          season: state.currentSeason,
          competitionId: uefaId,
          competitionName: uefaCfg.name,
          winnerClubId: winClub.id,
          winnerClubName: winClub.name,
          runnerUpClubId: runClub?.id,
          runnerUpClubName: runClub?.name,
        },
        uefaId === 'UEFA_UCL' ? 8 : uefaId === 'UEFA_UEL' ? 5 : 4
      );
    }
  }

  // Record All 10 Primary National Cups, 3 League Cups, and 10 Super Cups + Track UEFA Cup Qualifiers
  const cupWinnersByCountry: Partial<Record<string, string>> = {};
  const leagueCupWinnersByCountry: Partial<Record<string, string>> = {};

  for (const cupMeta of Object.values(CUP_COMPETITIONS_META)) {
    const cupFixtures = state.fixtures.filter(
      (f) => f.competitionId === cupMeta.id && f.seasonId === state.currentSeason
    );
    const completedFinal = cupFixtures.find(
      (f) =>
        (f.uefaStage === 'FINAL' || f.cupRound === 'FINAL') &&
        f.status === 'Completed' &&
        f.result
    );

    let winId: string | null = completedFinal
      ? getDomesticCupFixtureWinnerId(completedFinal)
      : null;
    let runId: string | undefined = completedFinal
      ? completedFinal.homeClubId === winId
        ? completedFinal.awayClubId
        : completedFinal.homeClubId
      : undefined;

    // Fallback if a cup didn't reach a completed FINAL fixture (e.g. fast-forwarded test rollover)
    if (!winId && cupFixtures.length > 0) {
      const completedInCup = cupFixtures.filter((f) => f.status === 'Completed' && f.result);
      if (completedInCup.length > 0) {
        const lastCompleted = completedInCup[completedInCup.length - 1];
        winId = getDomesticCupFixtureWinnerId(lastCompleted);
        runId =
          lastCompleted.homeClubId === winId
            ? lastCompleted.awayClubId
            : lastCompleted.homeClubId;
      } else {
        winId = cupFixtures[0].homeClubId;
        runId = cupFixtures[0].awayClubId;
      }
    }

    const winClub = winId ? updatedClubs[winId] : undefined;
    const runClub = runId ? updatedClubs[runId] : undefined;
    if (winClub) {
      if (cupMeta.category === 'PRIMARY_CUP') {
        cupWinnersByCountry[cupMeta.countryId] = winClub.id;
      } else if (cupMeta.category === 'LEAGUE_CUP') {
        leagueCupWinnersByCountry[cupMeta.countryId] = winClub.id;
      }

      pushTrophyOnce(
        {
          id: `trp_${cleanCompletedSeason}_${cupMeta.id}`,
          season: state.currentSeason,
          competitionId: cupMeta.id,
          competitionName: cupMeta.name,
          winnerClubId: winClub.id,
          winnerClubName: winClub.name,
          runnerUpClubId: runClub?.id,
          runnerUpClubName: runClub?.name,
        },
        cupMeta.category === 'PRIMARY_CUP' ? 4 : cupMeta.category === 'LEAGUE_CUP' ? 3 : 2
      );
    }
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

    // Stage 16 Phase 3: Archive player's seasonal stats into careerSeasonHistory before resetting
    const shouldArchiveSeason =
      p.stats.appearances > 0 || p.clubId === state.controlledClubId;
    const prevHistory: PlayerCareerSeasonRecord[] = p.careerSeasonHistory || [];
    const alreadyArchived = prevHistory.some((rec) => rec.season === state.currentSeason);
    const nextCareerSeasonHistory: PlayerCareerSeasonRecord[] | undefined =
      shouldArchiveSeason && !alreadyArchived
        ? [
            {
              season: state.currentSeason,
              clubId: p.clubId,
              clubName: state.clubs[p.clubId]?.name || p.clubId,
              appearances: p.stats.appearances,
              goals: p.stats.goals,
              assists: p.stats.assists,
              cleanSheets: p.stats.cleanSheets,
              averageRating:
                p.stats.appearances > 0
                  ? Number(p.stats.averageRating.toFixed(2))
                  : 0,
            },
            ...prevHistory,
          ]
        : p.careerSeasonHistory;

    updatedPlayers[pid] = {
      ...p,
      clubId: nextClubId,
      loanedFromClubId: null,
      loanOptionToBuyFee: null,
      currentAbility: nextCa,
      attributes: nextAttrs,
      fitness: 90,
      matchSharpness: 64,
      suspensionMatchesRemaining: 0,
      careerSeasonHistory: nextCareerSeasonHistory,
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

  // 2b. Multi-Tier Promotion & Relegation Swaps (including Promotion Playoff Final Winners!)
  const promoRelegationPairs: Array<{
    upper: LeagueId;
    lower: LeagueId;
    spots: number;
    playoffId: import('../types/game').PromotionPlayoffId;
  }> = [
    { upper: 'ENG_PL', lower: 'ENG_CH', spots: 3, playoffId: 'ENG_CH_PO' },
    { upper: 'ENG_CH', lower: 'ENG_L1', spots: 3, playoffId: 'ENG_L1_PO' },
    { upper: 'ESP_LL', lower: 'ESP_SD', spots: 3, playoffId: 'ESP_SD_PO' },
    { upper: 'GER_BL', lower: 'GER_2B', spots: 2, playoffId: 'GER_2B_PO' },
    { upper: 'ITA_SA', lower: 'ITA_SB', spots: 3, playoffId: 'ITA_SB_PO' },
    { upper: 'FRA_L1', lower: 'FRA_L2', spots: 2, playoffId: 'FRA_L2_PO' },
  ];
  const pendingLeagueAssignments: Record<string, LeagueId> = {};
  for (const pair of promoRelegationPairs) {
    const upperTable = state.standings[pair.upper] || [];
    const lowerTable = state.standings[pair.lower] || [];
    if (upperTable.length >= pair.spots && lowerTable.length >= pair.spots) {
      const relegatedIds = upperTable.slice(-pair.spots).map((r) => r.clubId);

      // Check if a completed Promotion Playoff Final exists for this division
      const completedPlayoffFinal = state.fixtures.find(
        (f) =>
          f.competitionId === pair.playoffId &&
          f.seasonId === state.currentSeason &&
          (f.uefaStage === 'FINAL' || f.cupRound === 'FINAL') &&
          f.status === 'Completed' &&
          f.result
      );
      const playoffWinnerId = completedPlayoffFinal
        ? getDomesticCupFixtureWinnerId(completedPlayoffFinal)
        : null;

      let promotedIds: string[];
      if (playoffWinnerId) {
        const autoCount = Math.max(1, pair.spots - 1);
        const autoPromoted = lowerTable.slice(0, autoCount).map((r) => r.clubId);
        if (!autoPromoted.includes(playoffWinnerId)) {
          promotedIds = [...autoPromoted, playoffWinnerId];
        } else {
          promotedIds = lowerTable.slice(0, pair.spots).map((r) => r.clubId);
        }
      } else {
        promotedIds = lowerTable.slice(0, pair.spots).map((r) => r.clubId);
      }

      for (const cid of relegatedIds) {
        pendingLeagueAssignments[cid] = pair.lower;
      }
      for (const cid of promotedIds) {
        pendingLeagueAssignments[cid] = pair.upper;
      }
    }
  }
  for (const [cid, newLeagueId] of Object.entries(pendingLeagueAssignments)) {
    if (updatedClubs[cid]) {
      updatedClubs[cid] = {
        ...updatedClubs[cid],
        leagueId: newLeagueId,
      };
    }
  }
  // Reset pre-season tour state for all clubs for the new season
  for (const [cid, c] of Object.entries(updatedClubs)) {
    updatedClubs[cid] = {
      ...c,
      preSeasonTourCompletedSeason: undefined,
      preSeasonTourRegion: undefined,
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

    if (league.tier !== 2 && league.tier !== 3) {
      const countryClubs = Object.values(updatedClubs).filter(
        (c) => c.countryId === league.countryId
      );
      const cupFixtures = generateInitialDomesticCupFixtures(
        league.cupId,
        countryClubs,
        nextSeasonStr,
        undefined,
        state.controlledClubId
      );
      nextFixtures = [...nextFixtures, ...cupFixtures];

      if (league.leagueCupId) {
        const leagueCupFixtures = generateInitialDomesticCupFixtures(
          league.leagueCupId,
          countryClubs,
          nextSeasonStr,
          undefined,
          state.controlledClubId
        );
        nextFixtures = [...nextFixtures, ...leagueCupFixtures];
      }
    }
  }

  // Schedule 2 baseline Pre-Season Friendly fixtures for the controlled club in nextSeasonStr
  const userCtrlClub = updatedClubs[state.controlledClubId];
  if (userCtrlClub) {
    const friendlyOpponents = Object.values(updatedClubs).filter(
      (c) => c.id !== userCtrlClub.id && c.leagueId !== userCtrlClub.leagueId
    );
    if (friendlyOpponents.length >= 2) {
      const opp1 = friendlyOpponents[rng.int(0, friendlyOpponents.length - 1)];
      let opp2 = friendlyOpponents[rng.int(0, friendlyOpponents.length - 1)];
      if (opp2.id === opp1.id) {
        opp2 = friendlyOpponents.find((c) => c.id !== opp1.id) || opp2;
      }
      nextFixtures.push(
        {
          id: `fix_preseason_${nextYear}_base_1_${userCtrlClub.id}`,
          competitionId: 'PRE_SEASON_FRIENDLY',
          seasonId: nextSeasonStr,
          matchday: 1,
          kickoffDate: `${nextYear}-07-22`,
          homeClubId: userCtrlClub.id,
          awayClubId: opp1.id,
          status: 'Scheduled',
        },
        {
          id: `fix_preseason_${nextYear}_base_2_${userCtrlClub.id}`,
          competitionId: 'PRE_SEASON_FRIENDLY',
          seasonId: nextSeasonStr,
          matchday: 2,
          kickoffDate: `${nextYear}-08-02`,
          homeClubId: opp2.id,
          awayClubId: userCtrlClub.id,
          status: 'Scheduled',
        }
      );
    }
  }

  // Generate 9 National Super Cups (Aug 10) + UEFA Super Cup (Aug 12) for nextSeasonStr
  const nextSuperCupFixtures = generateSeasonSuperCupFixtures(
    nextSeasonStr,
    nextYear,
    updatedClubs,
    nextTrophyHistory
  );
  nextFixtures = [...nextFixtures, ...nextSuperCupFixtures];

  // Stage 11 Phase 4: Generate 3 Global Continental Champions Cups (AFC_ACL, CONMEBOL_LIB, CONCACAF_CCC) for nextSeasonStr
  const nextContinentalCupFixtures = generateContinentalChampionsCupFixtures(
    nextSeasonStr,
    updatedClubs,
    state.standings,
    state.controlledClubId
  );
  nextFixtures = [...nextFixtures, ...nextContinentalCupFixtures];

  // 3b. Seed 3-Tier European Cups (UEFA_UCL, UEFA_UEL, UEFA_UECL) from final standings + Cup & League Cup Winners!
  const uefaQualified = selectUefaQualifiedClubs(
    updatedClubs,
    state.standings,
    cupWinnersByCountry,
    leagueCupWinnersByCountry
  );
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

  const userClubPreRollover = state.clubs[state.controlledClubId];
  const userLeagueCfg = userClubPreRollover ? LEAGUES_CONFIG[userClubPreRollover.leagueId] : undefined;
  const userLeagueTable = userClubPreRollover ? state.standings[userClubPreRollover.leagueId] || [] : [];
  const leagueChampClub = userLeagueTable[0] ? updatedClubs[userLeagueTable[0].clubId] : userClubPreRollover;
  const updatedUserClub = workingState.clubs[workingState.controlledClubId];

  const seasonSummary: SeasonRolloverSummary = {
    completedSeason: state.currentSeason,
    nextSeason: nextSeasonStr,
    leagueName: userLeagueCfg?.name || 'Domestic League',
    finalPosition: userFinalPosition,
    leagueChampionName: leagueChampClub?.name || updatedUserClub?.name || 'Champion FC',
    uclChampionName: uclWinnerClub?.name || 'Real Madrid',
    clubTopScorerName: topScorerPlayer
      ? `${topScorerPlayer.firstName} ${topScorerPlayer.lastName}`
      : 'Squad Forward',
    clubTopScorerGoals: Math.max(12, topScorerPlayer?.stats.goals || 14),
    clubPlayerOfSeasonName: bestRatedPlayer
      ? `${bestRatedPlayer.firstName} ${bestRatedPlayer.lastName}`
      : 'Squad Captain',
    clubPlayerOfSeasonRating: Number(
      Math.max(7.25, bestRatedPlayer?.stats.averageRating || 7.42).toFixed(2)
    ),
    totalPrizeAndTvPayout: userClubTotalPayout,
    nextTransferBudget: updatedUserClub?.finances.transferBudget || 25_000_000,
  };

  return {
    nextState: workingState,
    message: trText(
      `Rolled over to the ${nextSeasonStr} season!`,
      `เข้าสู่ฤดูกาลใหม่ ${nextSeasonStr} สำเร็จ!`
    ),
    seasonSummary,
  };
}

/**
 * Multi-Slot SaveGame Service (100% Pure Cloud Firestore Save Architecture + In-Memory Runtime Session Cache)
 */
const inMemorySaveSlots: Record<string, WorldState> = {};
let inMemorySlotMetas: SaveSlotMeta[] = [];

const LEGACY_LOCAL_SAVE_METAS_KEY = 'touchline_save_metas_v1';
const LEGACY_LOCAL_SAVE_DOC_PREFIX = 'touchline_save_doc_v1_';

/**
 * Stage 6 Phase 1: Purges any legacy localStorage game save keys on startup so 0 bytes of save data are stored in localStorage.
 */
export function purgeLegacyLocalSaves(): number {
  let removedCount = 0;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 0;
    if (window.localStorage.getItem(LEGACY_LOCAL_SAVE_METAS_KEY) !== null) {
      window.localStorage.removeItem(LEGACY_LOCAL_SAVE_METAS_KEY);
      removedCount++;
    }
    const keysToDelete: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(LEGACY_LOCAL_SAVE_DOC_PREFIX)) {
        keysToDelete.push(k);
      }
    }
    for (const k of keysToDelete) {
      window.localStorage.removeItem(k);
      removedCount++;
    }
  } catch {
    // Ignore storage access errors
  }
  return removedCount;
}

export const STANDARD_SAVE_SLOTS = [
  'slot_autosave',
  'slot_1',
  'slot_2',
  'slot_3',
  'slot_4',
] as const;

export interface SaveSlotMeta {
  slotId: string;
  saveName: string;
  clubName: string;
  managerName: string;
  gameDate: string;
  season: string;
  lastSavedAt: string;
}

export function getNextAvailableManualSaveSlot(metas?: SaveSlotMeta[]): string {
  const list = metas ?? getSavedSlotsList();
  const manualSlots = ['slot_1', 'slot_2', 'slot_3', 'slot_4'];
  const usedIds = new Set(list.map((m) => m.slotId));
  for (const slotId of manualSlots) {
    if (!usedIds.has(slotId)) {
      return slotId;
    }
  }
  const manualMetas = list
    .filter((m) => manualSlots.includes(m.slotId))
    .sort((a, b) => a.lastSavedAt.localeCompare(b.lastSavedAt));
  return manualMetas[0]?.slotId || 'slot_1';
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
  shirtNumber?: number;
  squadStatus?: Player['squadStatus'];
  consecutiveBenched?: number;
  isRegistered?: boolean;
  playInReserves?: boolean;
  individualTraining?: Player['individualTraining'];
  askingPrice?: number;
  loanedFromClubId?: string | null;
  loanOptionToBuyFee?: number | null;
  careerSeasonHistory?: PlayerCareerSeasonRecord[];
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
  buyBackClauses?: WorldState['buyBackClauses'];
  lastSquadMeetingDate?: string;
  scheduledExtraFixtures?: Fixture[];
  uefaPots?: Record<UefaCompetitionId, string[] | string[][]>;
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

function buildSeasonBaseFixturesForRehydration(
  randomSeed: number,
  seasonStr: string,
  clubs: Record<string, Club>,
  uefaPots: Record<UefaCompetitionId, string[][]>,
  trophyHistory?: TrophyHistoryRecord[]
): Fixture[] {
  const startYear = Number(seasonStr.slice(0, 4)) || 2025;
  const rng = new SeededRNG(randomSeed + startYear);
  let nextFixtures: Fixture[] = [];

  for (const league of Object.values(LEAGUES_CONFIG)) {
    const clubsInLeague = Object.values(clubs).filter((c) => c.leagueId === league.id);
    const clubIds = clubsInLeague.map((c) => c.id);
    const sched = generateLeagueSchedule(
      league,
      clubIds,
      seasonStr,
      `${startYear}-08-15`,
      rng
    );
    nextFixtures = [...nextFixtures, ...sched];

    if (league.tier !== 2 && league.tier !== 3) {
      const countryClubs = Object.values(clubs).filter(
        (c) => c.countryId === league.countryId
      );
      const cupFixtures = generateInitialDomesticCupFixtures(
        league.cupId,
        countryClubs,
        seasonStr,
        `${startYear}-10-22`
      );
      nextFixtures = [...nextFixtures, ...cupFixtures];

      if (league.leagueCupId) {
        const lcFixtures = generateInitialDomesticCupFixtures(
          league.leagueCupId,
          countryClubs,
          seasonStr,
          `${startYear}-09-24`
        );
        nextFixtures = [...nextFixtures, ...lcFixtures];
      }
    }
  }

  for (const compId of ['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]) {
    if (uefaPots[compId] && uefaPots[compId].length > 0) {
      const swissFixtures = generateUefaSwissSchedule(compId, uefaPots[compId], seasonStr, rng);
      nextFixtures = [...nextFixtures, ...swissFixtures];
    }
  }

  const nextSuperCupFixtures = generateSeasonSuperCupFixtures(
    seasonStr,
    startYear,
    clubs,
    trophyHistory
  );
  nextFixtures = [...nextFixtures, ...nextSuperCupFixtures];

  const nextEuroFixtures = generateEuropeanNationsCupFixtures(
    seasonStr,
    startYear + 1,
    clubs
  );
  nextFixtures = [...nextFixtures, ...nextEuroFixtures];
  nextFixtures.sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate));
  return nextFixtures;
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
    controlledId,
    compacted.scenarioChallenge || 'STANDARD',
    compacted.customClubConfig || null
  );

  // 1. Store controlledClub + clubs whose leagueId, pointsDeduction, or facilities changed
  const modifiedClubs: Record<string, Club> = {};
  if (userClub) {
    modifiedClubs[controlledId] = userClub;
  }
  let extraClubsCount = 0;
  for (const [id, club] of Object.entries(compacted.clubs)) {
    if (id === controlledId) continue;
    const baseClub = baseline.clubs[id];
    const leagueChanged = !baseClub || club.leagueId !== baseClub.leagueId;
    const deductionChanged = (club.pointsDeduction || 0) !== (baseClub?.pointsDeduction || 0);
    const facilityChanged =
      !baseClub ||
      club.trainingFacilities !== baseClub.trainingFacilities ||
      club.youthFacilities !== baseClub.youthFacilities ||
      club.finances.transferBudget !== baseClub.finances.transferBudget;
    if (leagueChanged || deductionChanged || (facilityChanged && extraClubsCount < 10)) {
      modifiedClubs[id] = club;
      if (!leagueChanged && !deductionChanged) extraClubsCount++;
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

  // 3. Determine base fixtures for the active season (Season 1 vs Season 2+)
  const activeUefaPots = compacted.uefaPots || baseline.uefaPots!;
  const seasonBaseFixtures =
    compacted.currentSeason === baseline.currentSeason
      ? baseline.fixtures
      : buildSeasonBaseFixturesForRehydration(
          compacted.randomSeed,
          compacted.currentSeason,
          compacted.clubs,
          activeUefaPots,
          compacted.trophyHistory
        );
  const seasonBaseFixtureIds = new Set(seasonBaseFixtures.map((bf) => bf.id));

  // Completed fixtures + Scheduled extra/knockout fixtures
  const completedFixtures: Record<string, Fixture | CompactFixtureScore> = {};
  const scheduledExtraFixtures: Fixture[] = [];

  for (const f of compacted.fixtures) {
    if (f.status === 'Scheduled') {
      if (!seasonBaseFixtureIds.has(f.id) && scheduledExtraFixtures.length < 160) {
        scheduledExtraFixtures.push(f);
      }
      continue;
    }
    if (f.status !== 'Completed' || !f.result) continue;
    const isUserMatch =
      f.homeClubId === controlledId || f.awayClubId === controlledId;
    if (isUserMatch) {
      completedFixtures[f.id] = f;
    } else if (seasonBaseFixtureIds.has(f.id)) {
      if (
        f.competitionId === userLeagueId ||
        String(f.competitionId).endsWith('_CUP') ||
        String(f.competitionId).endsWith('_LC') ||
        String(f.competitionId).endsWith('_SC') ||
        String(f.competitionId).startsWith('UEFA_') ||
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

  // 4. Modified players & bounded playerDiffs (including shirtNumber, squadStatus, consecutiveBenched, etc.)
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
    const baseArchiveLen = basePlayer.careerSeasonHistory?.length || 0;
    const curArchiveLen = p.careerSeasonHistory?.length || 0;
    const hasCareerArchiveChanged =
      curArchiveLen !== baseArchiveLen ||
      (curArchiveLen > 0 && p.careerSeasonHistory![0]?.season !== basePlayer.careerSeasonHistory?.[0]?.season);
    const hasNotableChange =
      p.stats.goals > 0 ||
      p.stats.assists > 0 ||
      hasCareerArchiveChanged ||
      p.currentAbility !== basePlayer.currentAbility ||
      p.injuryStatus.isInjured !== basePlayer.injuryStatus.isInjured ||
      p.transferListed !== basePlayer.transferListed ||
      p.loanListed !== basePlayer.loanListed ||
      p.shirtNumber !== basePlayer.shirtNumber ||
      p.squadStatus !== basePlayer.squadStatus ||
      (p.consecutiveBenched || 0) > 0 ||
      (inUserLeague && p.stats.appearances > 0);

    if (!hasNotableChange && !isTracked) continue;
    if (
      !inUserLeague &&
      !isTracked &&
      !hasCareerArchiveChanged &&
      p.stats.goals < 2 &&
      p.stats.assists < 2 &&
      !p.transferListed &&
      p.shirtNumber === basePlayer.shirtNumber &&
      p.squadStatus === basePlayer.squadStatus
    ) {
      continue;
    }

    const priority =
      (isTracked ? 1000 : 0) +
      (inUserLeague ? 500 : 0) +
      (hasCareerArchiveChanged ? 250 : 0) +
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
        shirtNumber: p.shirtNumber,
        squadStatus: p.squadStatus,
        consecutiveBenched: p.consecutiveBenched,
        isRegistered: p.isRegistered,
        playInReserves: p.playInReserves,
        individualTraining: p.individualTraining,
        askingPrice: p.askingPrice,
        loanedFromClubId: p.loanedFromClubId,
        loanOptionToBuyFee: p.loanOptionToBuyFee,
        careerSeasonHistory: hasCareerArchiveChanged && p.careerSeasonHistory
          ? p.careerSeasonHistory.slice(0, 12)
          : undefined,
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

  // Flatten uefaPots from 2D string[][] to 1D string[] so Cloud Firestore never rejects nested arrays
  const flatUefaPots: Record<UefaCompetitionId, string[]> = {
    UEFA_UCL: (activeUefaPots.UEFA_UCL || []).flat(),
    UEFA_UEL: (activeUefaPots.UEFA_UEL || []).flat(),
    UEFA_UECL: (activeUefaPots.UEFA_UECL || []).flat(),
  };

  const dehydrated = sanitizeForFirestore<CareerStateMap>({
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
    trophyHistory: (compacted.trophyHistory || []).slice(0, 120),
    seasonAwardsHistory: (compacted.seasonAwardsHistory || []).slice(0, 15),
    controlledNationalTeamCode: compacted.controlledNationalTeamCode || null,
    scenarioChallenge: compacted.scenarioChallenge || 'STANDARD',
    customClubConfig: compacted.customClubConfig || null,
    lastMindGameMatchday: compacted.lastMindGameMatchday || 0,
    socialFeed: (compacted.socialFeed || []).slice(0, 15),
    buyBackClauses: (compacted.buyBackClauses || []).slice(0, 25),
    lastSquadMeetingDate: compacted.lastSquadMeetingDate || '',
    scheduledExtraFixtures,
    uefaPots: flatUefaPots,
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

  const mergeBaselineCareerHistory = (
    savedHistory: PlayerCareerSeasonRecord[] | undefined,
    baseHistory: PlayerCareerSeasonRecord[] | undefined
  ): PlayerCareerSeasonRecord[] | undefined => {
    if (!savedHistory || savedHistory.length === 0) return baseHistory;
    if (!baseHistory || baseHistory.length === 0) return savedHistory;
    const savedSeasons = new Set(savedHistory.map((h) => h.season));
    const missingBase = baseHistory.filter((b) => !savedSeasons.has(b.season));
    return missingBase.length > 0 ? [...savedHistory, ...missingBase] : savedHistory;
  };

  const rehydratedPlayers: Record<string, Player> = { ...baseline.players };
  for (const [id, diff] of Object.entries(cs.playerDiffs || {})) {
    const existing = rehydratedPlayers[id];
    if (existing) {
      rehydratedPlayers[id] = {
        ...existing,
        ...diff,
        careerSeasonHistory: mergeBaselineCareerHistory(
          diff.careerSeasonHistory,
          existing.careerSeasonHistory
        ),
      };
    }
  }
  for (const [id, fullPlayer] of Object.entries(cs.modifiedPlayers || {})) {
    const baseExisting = baseline.players[id];
    rehydratedPlayers[id] = {
      ...fullPlayer,
      careerSeasonHistory: mergeBaselineCareerHistory(
        fullPlayer.careerSeasonHistory,
        baseExisting?.careerSeasonHistory
      ),
    };
  }

  const rehydratedUefaPots: Record<UefaCompetitionId, string[][]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };
  for (const compId of ['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]) {
    const raw = cs.uefaPots?.[compId];
    if (Array.isArray(raw) && raw.length > 0) {
      if (Array.isArray(raw[0])) {
        rehydratedUefaPots[compId] = raw as string[][];
      } else {
        const flatList = raw as string[];
        const chunked: string[][] = [];
        for (let i = 0; i < flatList.length; i += 9) {
          chunked.push(flatList.slice(i, i + 9));
        }
        rehydratedUefaPots[compId] = chunked;
      }
    } else {
      rehydratedUefaPots[compId] = baseline.uefaPots![compId];
    }
  }
  const seasonBaseFixtures =
    docData.season === baseline.currentSeason
      ? baseline.fixtures
      : buildSeasonBaseFixturesForRehydration(
          docData.randomSeed,
          docData.season,
          rehydratedClubs,
          rehydratedUefaPots,
          cs.trophyHistory
        );

  const completedFixturesMap = cs.completedFixtures || {};
  const baseFixtureIds = new Set<string>();
  const rehydratedFixtures: Fixture[] = seasonBaseFixtures.map((f): Fixture => {
    baseFixtureIds.add(f.id);
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
    if (!baseFixtureIds.has(fid) && 'status' in saved) {
      rehydratedFixtures.push(saved as Fixture);
      baseFixtureIds.add(fid);
    }
  }

  for (const extraSched of cs.scheduledExtraFixtures || []) {
    if (extraSched && extraSched.id && !baseFixtureIds.has(extraSched.id)) {
      rehydratedFixtures.push(extraSched);
      baseFixtureIds.add(extraSched.id);
    }
  }

  rehydratedFixtures.sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate));

  const rehydratedUefaStandings: Record<UefaCompetitionId, LeagueStanding[]> = {
    UEFA_UCL: [],
    UEFA_UEL: [],
    UEFA_UECL: [],
  };
  for (const uefaId of Object.keys(UEFA_COMPETITIONS_CONFIG) as UefaCompetitionId[]) {
    const participantIds = rehydratedUefaPots?.[uefaId]?.flat() || [];
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
    uefaPots: rehydratedUefaPots,
    transferOffers: cs.transferOffers || [],
    shortlistPlayerIds: cs.shortlistPlayerIds || [],
    scoutAssignments: cs.scoutAssignments || [],
    scoutReports: cs.scoutReports || {},
    transactions: cs.transactions || [],
    inbox: cs.inbox || [],
    mentoringGroups: cs.mentoringGroups || baseline.mentoringGroups || [],
    trophyHistory: (() => {
      const savedTrophies = cs.trophyHistory || [];
      const baseTrophies = baseline.trophyHistory || [];
      if (savedTrophies.length === 0) return baseTrophies;
      const saved2425 = savedTrophies.filter((t) => t.season === '2024/25');
      const hasStale2425 =
        saved2425.some((t) => t.id === 'trp_2425_ucl' && t.winnerClubId === 'club_esp_ll_1') ||
        (saved2425.length > 0 && saved2425.length < 10);
      if (hasStale2425) {
        const userPlayedTrophies = savedTrophies.filter((t) => t.season !== '2024/25');
        return [...userPlayedTrophies, ...baseTrophies];
      }
      return savedTrophies;
    })(),
    seasonAwardsHistory: (() => {
      const savedAwards = cs.seasonAwardsHistory || [];
      const baseAwards = baseline.seasonAwardsHistory || [];
      if (savedAwards.length === 0) return baseAwards;
      const base2425 = baseAwards.find((a) => a.season === '2024/25');
      const hasStale2425 = savedAwards.some(
        (a) => a.season === '2024/25' && a.managerOfTheSeason?.managerName === 'Carlo Ancelotti'
      );
      if (hasStale2425 && base2425) {
        return savedAwards.map((a) => (a.season === '2024/25' ? base2425 : a));
      }
      return savedAwards;
    })(),
    controlledNationalTeamCode:
      cs.controlledNationalTeamCode !== undefined
        ? cs.controlledNationalTeamCode
        : baseline.controlledNationalTeamCode || null,
    scenarioChallenge: cs.scenarioChallenge || baseline.scenarioChallenge || 'STANDARD',
    customClubConfig: cs.customClubConfig || baseline.customClubConfig || null,
    lastMindGameMatchday: cs.lastMindGameMatchday || 0,
    socialFeed: cs.socialFeed || baseline.socialFeed || [],
    buyBackClauses: cs.buyBackClauses || baseline.buyBackClauses || [],
    lastSquadMeetingDate: cs.lastSquadMeetingDate || baseline.lastSquadMeetingDate,
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
    try {
      handleFirestoreError(error, OperationType.WRITE, savePath);
    } catch {
      // Rethrow so callers can update Cloud Sync Status badge accurately
    }
    throw error;
  }

  return updatedMetas;
}

export async function syncUserSaveSlotsFromFirestore(): Promise<SaveSlotMeta[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    inMemorySlotMetas = [];
    return [];
  }

  const uid = currentUser.uid;
  const savesPath = `users/${uid}/saves`;
  try {
    const q = query(
      collection(db, 'users', uid, 'saves'),
      where('ownerId', '==', uid)
    );
    const snap = await getDocs(q);
    const cloudMetas: SaveSlotMeta[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as CareerSaveDocument;
      if (data && data.slotId && data.careerState) {
        cloudMetas.push({
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

    cloudMetas.sort((a, b) => b.lastSavedAt.localeCompare(a.lastSavedAt));
    inMemorySlotMetas = cloudMetas;
    return cloudMetas;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, savesPath);
    } catch {
      // Return in-memory slots if Cloud Firestore list fails
    }
    return inMemorySlotMetas;
  }
}

export async function loadWorldStateFromFirestoreSlot(
  rawSlotId: string
): Promise<WorldState | null> {
  const slotId = sanitizeSlotId(rawSlotId);
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return loadWorldStateFromSlot(slotId);
  }

  const uid = currentUser.uid;
  const savePath = `users/${uid}/saves/${slotId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'saves', slotId));
    if (!snap.exists()) {
      return loadWorldStateFromSlot(slotId);
    }
    const data = snap.data() as CareerSaveDocument;
    const rehydrated = rehydrateWorldStateFromCareerDoc(data);
    inMemorySaveSlots[slotId] = rehydrated;
    return rehydrated;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, savePath);
    } catch {
      // Fallback to in-memory session cache if Cloud Firestore read fails
    }
    return loadWorldStateFromSlot(slotId);
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
    try {
      handleFirestoreError(error, OperationType.DELETE, savePath);
    } catch {
      // Keep in-memory deletion intact
    }
    return inMemorySlotMetas;
  }
}

export function saveWorldStateToSlot(
  rawSlotId: string,
  state: WorldState,
  triggerCloudSync = true
): SaveSlotMeta[] {
  const slotId = sanitizeSlotId(rawSlotId);
  const lastSavedAtIso = new Date().toISOString();
  const stamped: WorldState = compactWorldStateForStorage({
    ...state,
    saveId: slotId,
    lastSavedAt: lastSavedAtIso,
  });

  inMemorySaveSlots[slotId] = stamped;

  const club = state.clubs[state.controlledClubId];
  const newMeta: SaveSlotMeta = {
    slotId,
    saveName: state.saveName || 'TOUCHLINE Career',
    clubName: club?.name || 'Club',
    managerName: state.manager.name,
    gameDate: state.gameDate,
    season: state.currentSeason,
    lastSavedAt: lastSavedAtIso,
  };

  const existingMetas = inMemorySlotMetas.filter((m) => m.slotId !== slotId);
  const updatedMetas = [newMeta, ...existingMetas].slice(0, 10);
  inMemorySlotMetas = updatedMetas;

  if (triggerCloudSync && auth.currentUser) {
    void saveWorldStateToFirestoreSlot(slotId, stamped).catch(() => {
      // Handled asynchronously in Cloud Firestore
    });
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

export function clearInMemorySaveCache(): void {
  for (const key of Object.keys(inMemorySaveSlots)) {
    delete inMemorySaveSlots[key];
  }
  inMemorySlotMetas = [];
}

export function deleteSavedSlot(rawSlotId: string): SaveSlotMeta[] {
  const slotId = sanitizeSlotId(rawSlotId);
  delete inMemorySaveSlots[slotId];
  inMemorySlotMetas = inMemorySlotMetas.filter((m) => m.slotId !== slotId);
  if (auth.currentUser) {
    void deleteSaveSlotFromFirestore(slotId).catch(() => {
      // Cloud deletion handled asynchronously
    });
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
  targetClubId: string,
  isHeadhuntedOffer = false
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

  // Accept if manager effective rep is within 28 points of club reputation, club board confidence is low, or headhunted directly
  const isUnderPressure = targetClub.boardExpectations.confidence.overall <= 55;
  if (!isHeadhuntedOffer && !isUnderPressure && effectiveManagerRep + 28 < targetClub.reputation) {
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
        `Your club has already completed a Pre-Season Tour in the ${state.currentSeason} season.`,
        `สโมสรของคุณได้จัดทัวร์ปรีซีซั่นประจำฤดูกาล ${state.currentSeason} ไปเรียบร้อยแล้ว`
      ),
    };
  }

  const tourSpec =
    region === 'ASIA'
      ? {
          revenue: 4_500_000,
          sharpnessBoost: 5,
          fitnessBoost: 2,
          moraleBoost: 3,
          familiarityBoost: 3,
          targetLeagues: ['JPN_J1'] as LeagueId[],
          labelEn: 'Asia Commercial Tour (Tokyo & Yokohama)',
          labelTh: 'ทัวร์เอเชีย (โตเกียว & โยโกฮาม่า)',
        }
      : region === 'USA'
        ? {
            revenue: 5_000_000,
            sharpnessBoost: 5,
            fitnessBoost: 2,
            moraleBoost: 3,
            familiarityBoost: 3,
            targetLeagues: ['USA_MLS', 'BRA_SA'] as LeagueId[],
            labelEn: 'Americas Summer Showcase (Miami & Los Angeles)',
            labelTh: 'ทัวร์อเมริกา (ไมอามี & ลอสแอนเจลิส)',
          }
        : region === 'ALPINE'
          ? {
              revenue: 1_800_000,
              sharpnessBoost: 7,
              fitnessBoost: 8,
              moraleBoost: 4,
              familiarityBoost: 6,
              targetLeagues: ['AUT_BL', 'SUI_SL'] as LeagueId[],
              labelEn: 'Alpine High-Altitude Camp (Salzburg & Zurich)',
              labelTh: 'แคมป์เก็บตัวเทือกเขาแอลป์ (ซัลซ์บวร์ก & ซูริค)',
            }
          : {
              revenue: 5_500_000,
              sharpnessBoost: 5,
              fitnessBoost: 2,
              moraleBoost: 3,
              familiarityBoost: 3,
              targetLeagues: ['KSA_SPL'] as LeagueId[],
              labelEn: 'Middle East Commercial Showcase (Riyadh & Jeddah)',
              labelTh: 'ทัวร์ตะวันออกกลาง (ริยาด & เจดดาห์)',
            };

  const newBalance = club.finances.balance + tourSpec.revenue;
  club.preSeasonTourCompletedSeason = state.currentSeason;
  club.preSeasonTourRegion = region;
  const newFam = Math.min(100, club.primaryTactic.familiarity + tourSpec.familiarityBoost);
  club.primaryTactic = {
    ...club.primaryTactic,
    familiarity: newFam,
  };
  club.formationFamiliarity = {
    ...(club.formationFamiliarity || {}),
    [club.primaryTactic.formation]: newFam,
  };
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
        fitness: Math.min(100, p.fitness + tourSpec.fitnessBoost),
        matchSharpness: Math.min(100, p.matchSharpness + tourSpec.sharpnessBoost),
        morale: Math.min(100, p.morale + tourSpec.moraleBoost),
      };
    }
  }

  // Schedule 3 authentic Pre-Season Tour Friendly fixtures against clubs from the target region
  const startYear = parseInt(state.currentSeason.slice(0, 4), 10) || 2025;
  const tourDates = [`${startYear}-07-20`, `${startYear}-07-26`, `${startYear}-08-01`];
  const regionalClubs = Object.values(state.clubs)
    .filter((c) => c.id !== club.id && tourSpec.targetLeagues.includes(c.leagueId))
    .sort((a, b) => b.reputation - a.reputation);
  const selectedTourOpponents =
    regionalClubs.length >= 3
      ? regionalClubs.slice(0, 3)
      : Object.values(state.clubs)
          .filter((c) => c.id !== club.id)
          .slice(0, 3);

  const newTourFixtures: Fixture[] = selectedTourOpponents.map((opp, idx) => ({
    id: `fix_preseason_tour_${region.toLowerCase()}_${startYear}_${idx + 1}_${club.id}`,
    competitionId: 'PRE_SEASON_FRIENDLY',
    seasonId: state.currentSeason,
    matchday: idx + 1,
    kickoffDate: tourDates[idx] || `${startYear}-07-26`,
    homeClubId: idx % 2 === 0 ? opp.id : club.id,
    awayClubId: idx % 2 === 0 ? club.id : opp.id,
    status: 'Scheduled',
  }));

  const updatedFixtures = [...state.fixtures, ...newTourFixtures].sort((a, b) =>
    a.kickoffDate.localeCompare(b.kickoffDate)
  );

  const tx: FinanceTransaction = {
    id: `tx_tour_${region}_${state.gameDate}`,
    date: state.gameDate,
    clubId: club.id,
    category: 'Sponsorship',
    amount: tourSpec.revenue,
    description: trText(
      `Pre-Season Tour Revenue: ${tourSpec.labelEn} (+€${(tourSpec.revenue / 1_000_000).toFixed(1)}M)`,
      `รายได้จัดทัวร์ปรีซีซั่น: ${tourSpec.labelTh} (+€${(tourSpec.revenue / 1_000_000).toFixed(1)}M)`
    ),
    balanceAfter: newBalance,
  };

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      players: updatedPlayers,
      fixtures: updatedFixtures,
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_tour_${region}_${state.gameDate}`,
          gameDate: state.gameDate,
          category: 'Board',
          title: trText(
            `${tourSpec.labelEn} Confirmed: 3 Tour Friendlies Scheduled & +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M Revenue!`,
            `ยืนยันโปรแกรม ${tourSpec.labelTh}: จัดแมตช์อุ่นเครื่อง 3 นัด & รับรายได้ +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M!`
          ),
          body: trText(
            `${club.name} organized the ${tourSpec.labelEn} against ${selectedTourOpponents.map((o) => o.shortName).join(', ')}, generating €${(tourSpec.revenue / 1_000_000).toFixed(1)}M in sponsorship revenue and boosting squad Match Sharpness (+${tourSpec.sharpnessBoost}%).`,
            `สโมสร ${club.name} ยืนยันการเดินทางทัวร์ ${tourSpec.labelTh} ดวลกับ ${selectedTourOpponents.map((o) => o.shortName).join(', ')} กวาดรายได้สปอนเซอร์ +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M พร้อมเพิ่มความเฉียบคม (Match Sharpness) +${tourSpec.sharpnessBoost}%`
          ),
          isRead: false,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: trText(
      `Organized ${tourSpec.labelEn}! 3 Tour Friendlies added, +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M revenue & +${tourSpec.sharpnessBoost}% Match Sharpness.`,
      `จัดทัวร์ ${tourSpec.labelTh} สำเร็จ! เพิ่มเกมอุ่นเครื่อง 3 นัด, รับรายได้ +€${(tourSpec.revenue / 1_000_000).toFixed(1)}M และความเฉียบคม +${tourSpec.sharpnessBoost}%`
    ),
  };
}

export function setPreSeasonCampFocus(
  state: WorldState,
  focus: PreSeasonCampFocus
): { nextState: WorldState; message: string } {
  const club = { ...state.clubs[state.controlledClubId] };
  club.preSeasonCampFocus = focus;

  const updatedPlayers = { ...state.players };
  if (focus === 'FITNESS_BOOTCAMP') {
    for (const [pid, p] of Object.entries(updatedPlayers)) {
      if (p.clubId === club.id && !p.injuryStatus.isInjured) {
        updatedPlayers[pid] = {
          ...p,
          fitness: Math.min(100, p.fitness + 5),
          matchSharpness: Math.min(100, p.matchSharpness + 4),
        };
      }
    }
  } else if (focus === 'TACTICAL_DRILLS') {
    const newFam = Math.min(100, club.primaryTactic.familiarity + 6);
    club.primaryTactic = {
      ...club.primaryTactic,
      familiarity: newFam,
    };
    club.formationFamiliarity = {
      ...(club.formationFamiliarity || {}),
      [club.primaryTactic.formation]: newFam,
    };
  } else if (focus === 'TEAM_COHESION') {
    for (const [pid, p] of Object.entries(updatedPlayers)) {
      if (p.clubId === club.id) {
        updatedPlayers[pid] = {
          ...p,
          morale: Math.min(100, p.morale + 5),
          satisfaction: Math.min(100, p.satisfaction + 4),
        };
      }
    }
  }

  const labelEn =
    focus === 'FITNESS_BOOTCAMP'
      ? 'Physical Fitness & Match Sharpness Bootcamp (+5% Condition, +4% Sharpness)'
      : focus === 'TACTICAL_DRILLS'
        ? 'Tactical System & Pressing Drills (+6% Tactical Familiarity)'
        : 'Team Bonding & Dressing Room Cohesion (+5% Morale)';
  const labelTh =
    focus === 'FITNESS_BOOTCAMP'
      ? 'เน้นเรียกความฟิตและแมตช์ชาร์ปเนส (+5% ความฟิต, +4% ความเฉียบคม)'
      : focus === 'TACTICAL_DRILLS'
        ? 'เน้นซ้อมระบบแทคติกและเพรสซิ่ง (+6% ความเข้าใจแผน)'
        : 'เน้นละลายพฤติกรรมและสร้างทีมเวิร์ค (+5% ขวัญกำลังใจ)';

  return {
    nextState: {
      ...state,
      clubs: { ...state.clubs, [club.id]: club },
      players: updatedPlayers,
    },
    message: trText(
      `Pre-Season Training Camp Focus updated: ${labelEn}`,
      `เปลี่ยนแผนการซ้อมแคมป์ปรีซีซั่นเป็น: ${labelTh}`
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
 * Stage 13 Phase 3: Dynamic AI Managerial Carousel (Weekly/Monthly Sackings + Tactical Identity Shift)
 */
export interface FreeAgentManagerProfile {
  name: string;
  nationalityCode: string;
  reputation: number;
  style: Club['aiManager']['style'];
  preferredFormation: FormationId;
  secondaryFormation: FormationId;
  tacticalPreset: TacticalPresetId;
}

export const FREE_AGENT_MANAGERS_POOL: FreeAgentManagerProfile[] = [
  {
    name: 'Jürgen Klopp',
    nationalityCode: 'GER',
    reputation: 96,
    style: 'Attacking Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '4-2-3-1',
    tacticalPreset: 'GEGENPRESS_HIGH_LINE',
  },
  {
    name: 'Zinedine Zidane',
    nationalityCode: 'FRA',
    reputation: 94,
    style: 'Attacking Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '4-3-1-2',
    tacticalPreset: 'CONTROL_POSSESSION',
  },
  {
    name: 'Xavi Hernández',
    nationalityCode: 'ESP',
    reputation: 88,
    style: 'Possession-focused Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '4-2-3-1',
    tacticalPreset: 'VERTICAL_TIKI_TAKA',
  },
  {
    name: 'Rafael Benítez',
    nationalityCode: 'ESP',
    reputation: 85,
    style: 'Pragmatic Manager',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '4-4-2',
    tacticalPreset: 'COMPACT_MID_BLOCK',
  },
  {
    name: 'Mauricio Pochettino',
    nationalityCode: 'ARG',
    reputation: 87,
    style: 'Youth Developer',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '3-4-3',
    tacticalPreset: 'HIGH_INTENSITY_DIRECT',
  },
  {
    name: 'Gareth Southgate',
    nationalityCode: 'ENG',
    reputation: 84,
    style: 'Defensive Manager',
    preferredFormation: '5-3-2',
    secondaryFormation: '4-2-3-1',
    tacticalPreset: 'COMPACT_MID_BLOCK',
  },
  {
    name: 'Joachim Löw',
    nationalityCode: 'GER',
    reputation: 86,
    style: 'Possession-focused Manager',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '4-3-3',
    tacticalPreset: 'CONTROL_POSSESSION',
  },
  {
    name: 'Sérgio Conceição',
    nationalityCode: 'POR',
    reputation: 84,
    style: 'Pragmatic Manager',
    preferredFormation: '4-4-2',
    secondaryFormation: '4-2-3-1',
    tacticalPreset: 'HIGH_INTENSITY_DIRECT',
  },
  {
    name: 'Edin Terzić',
    nationalityCode: 'GER',
    reputation: 82,
    style: 'Counter-attacking Manager',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '4-3-3',
    tacticalPreset: 'FLUID_COUNTER_ATTACK',
  },
  {
    name: 'Roger Schmidt',
    nationalityCode: 'GER',
    reputation: 81,
    style: 'Attacking Manager',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '4-4-2',
    tacticalPreset: 'GEGENPRESS_HIGH_LINE',
  },
  {
    name: 'Thiago Motta',
    nationalityCode: 'ITA',
    reputation: 82,
    style: 'Possession-focused Manager',
    preferredFormation: '4-2-3-1',
    secondaryFormation: '4-3-3',
    tacticalPreset: 'CONTROL_POSSESSION',
  },
  {
    name: 'Ange Postecoglou',
    nationalityCode: 'AUS',
    reputation: 82,
    style: 'Attacking Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '4-2-3-1',
    tacticalPreset: 'GEGENPRESS_HIGH_LINE',
  },
  {
    name: 'Roberto Mancini',
    nationalityCode: 'ITA',
    reputation: 86,
    style: 'Possession-focused Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '3-5-2',
    tacticalPreset: 'VERTICAL_TIKI_TAKA',
  },
  {
    name: 'Luciano Spalletti',
    nationalityCode: 'ITA',
    reputation: 87,
    style: 'Attacking Manager',
    preferredFormation: '4-3-3',
    secondaryFormation: '3-5-2',
    tacticalPreset: 'WING_BACK_OVERLOAD',
  },
];

const REPLACEMENT_MANAGERS_POOL = FREE_AGENT_MANAGERS_POOL.map((m) => m.name);

export function evaluateAiManagerJobSecurity(
  club: Club,
  leagueRank: number,
  expectedRank: number,
  played: number
): { nextSecurity: number; shouldSack: boolean; underperformance: number } {
  const currentSecurity = club.aiManager.jobSecurity ?? 70;
  const underperformance = leagueRank - expectedRank;
  if (played < 4) {
    return { nextSecurity: currentSecurity, shouldSack: false, underperformance };
  }
  if (underperformance >= 6) {
    const drop = played >= 10 ? 28 + Math.min(14, (underperformance - 6) * 3) : 28;
    const nextSecurity = Math.max(8, currentSecurity - drop);
    return {
      nextSecurity,
      shouldSack: nextSecurity < 22 || (nextSecurity <= 35 && currentSecurity <= 50),
      underperformance,
    };
  }
  if (underperformance <= -2) {
    return {
      nextSecurity: Math.min(98, currentSecurity + 4),
      shouldSack: false,
      underperformance,
    };
  }
  return { nextSecurity: currentSecurity, shouldSack: currentSecurity < 22, underperformance };
}

export function triggerAIManagerialCarouselCheck(
  state: WorldState
): { nextState: WorldState; sackedCount: number; message: string } {
  const updatedClubs = { ...state.clubs };
  const nextInbox = [...state.inbox];
  let sackedCount = 0;

  // Build active manager registry so replacements NEVER duplicate an already-employed manager
  const employedNames = new Set(
    Object.values(updatedClubs).map((c) => c.aiManager.name.toLowerCase())
  );

  // Pre-group players by clubId only if a sacking occurs (lazy cache)
  let playersByClubCache: Record<string, Player[]> | null = null;
  const getClubPlayers = (clubId: string): Player[] => {
    if (!playersByClubCache) {
      playersByClubCache = {};
      for (const p of Object.values(state.players)) {
        if (!playersByClubCache[p.clubId]) playersByClubCache[p.clubId] = [];
        playersByClubCache[p.clubId].push(p);
      }
    }
    return playersByClubCache[clubId] || [];
  };

  for (const league of Object.values(LEAGUES_CONFIG)) {
    const table = state.standings[league.id] || [];
    table.forEach((row, idx) => {
      if (row.clubId === state.controlledClubId) return;
      if (row.played < 4) return;
      const club = updatedClubs[row.clubId];
      if (!club) return;

      const rank = idx + 1;
      const expectedRank = club.boardExpectations.targetLeaguePosition;
      const { nextSecurity, shouldSack, underperformance } = evaluateAiManagerJobSecurity(
        club,
        rank,
        expectedRank,
        row.played
      );

      if (underperformance >= 6 || (club.aiManager.jobSecurity ?? 70) < 22) {
        if (shouldSack && sackedCount < 2) {
          const oldManagerName = club.aiManager.name;
          const oldFormation = club.primaryTactic.formation;
          // Pick best available free-agent manager closest to club reputation and NOT currently employed
          const availablePool = FREE_AGENT_MANAGERS_POOL.filter(
            (m) =>
              m.name.toLowerCase() !== oldManagerName.toLowerCase() &&
              !employedNames.has(m.name.toLowerCase())
          ).sort(
            (a, b) =>
              Math.abs(a.reputation - club.reputation) - Math.abs(b.reputation - club.reputation)
          );

          const selectedMgr: FreeAgentManagerProfile =
            availablePool[0] || {
              name: REPLACEMENT_MANAGERS_POOL.find((n) => !employedNames.has(n.toLowerCase())) || 'Zinedine Zidane',
              nationalityCode: 'FRA',
              reputation: Math.max(76, club.reputation),
              style: 'Attacking',
              preferredFormation: club.primaryTactic.formation === '4-3-3' ? '4-2-3-1' : '4-3-3',
              secondaryFormation: '3-5-2',
              tacticalPreset: 'CONTROL_POSSESSION',
            };

          employedNames.delete(oldManagerName.toLowerCase());
          employedNames.add(selectedMgr.name.toLowerCase());

          // Immediately shift club's tactical identity (formation + team instructions + starting XI)
          const clubPlayers = getClubPlayers(club.id);
          const nextInstructions = buildAuthenticTeamInstructions(selectedMgr.tacticalPreset);
          const nextPrimaryTactic =
            clubPlayers.length >= 11
              ? autoPickLineup(
                  selectedMgr.preferredFormation,
                  clubPlayers,
                  nextInstructions,
                  club.primaryTactic.id,
                  `${selectedMgr.preferredFormation} (${selectedMgr.style})`
                )
              : {
                  ...club.primaryTactic,
                  formation: selectedMgr.preferredFormation,
                  instructions: nextInstructions,
                };
          const nextSecondaryTactic =
            clubPlayers.length >= 11
              ? autoPickLineup(
                  selectedMgr.secondaryFormation,
                  clubPlayers,
                  nextInstructions,
                  club.secondaryTactic.id,
                  `${selectedMgr.secondaryFormation} Plan B`
                )
              : {
                  ...club.secondaryTactic,
                  formation: selectedMgr.secondaryFormation,
                  instructions: nextInstructions,
                };

          updatedClubs[club.id] = {
            ...club,
            aiManager: {
              ...club.aiManager,
              name: selectedMgr.name,
              style: selectedMgr.style,
              jobSecurity: 78,
            },
            primaryTactic: nextPrimaryTactic,
            secondaryTactic: nextSecondaryTactic,
            boardExpectations: {
              ...club.boardExpectations,
              confidence: {
                ...club.boardExpectations.confidence,
                overall: 58,
              },
            },
          };
          sackedCount++;

          const presetLabel = selectedMgr.tacticalPreset.replace(/_/g, ' ');
          nextInbox.unshift({
            id: `news_ai_sacked_${state.gameDate}_${club.id}`,
            gameDate: state.gameDate,
            category: 'Media',
            title: trText(
              `📰 MANAGERIAL SACKING & APPOINTMENT: ${club.name} Sack ${oldManagerName}, Appoint ${selectedMgr.name}!`,
              `📰 ปลดฟ้าผ่า & ตั้งกุนซือใหม่! ${club.name} สั่งปลด ${oldManagerName} ตั้ง ${selectedMgr.name} คุมทัพ!`
            ),
            body: trText(
              `With ${club.name} sitting #${rank} in ${league.name} (Target: Top ${expectedRank}), the Board of Directors has parted ways with ${oldManagerName} and appointed ${selectedMgr.name}. Tactical Shift: ${club.shortName} immediately switch from ${oldFormation} to ${selectedMgr.preferredFormation} (${presetLabel} · ${selectedMgr.style}).`,
              `หลังจากผลงานของ ${club.name} ร่วงลงไปอยู่อันดับ #${rank} ในศึก ${league.name} (เป้าหมาย: ท็อป ${expectedRank}) บอร์ดบริหารจึงมีมติปลด ${oldManagerName} และแต่งตั้ง ${selectedMgr.name} เข้ามากู้วิกฤตทันที พร้อมเปลี่ยนระบบการเล่นจาก ${oldFormation} เป็น ${selectedMgr.preferredFormation} (${presetLabel} · สไตล์ ${selectedMgr.style})`
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

  // Stage 4 Pillar 4.2: Headhunting Job Offers from Elite Clubs in Inbox
  const myClub = updatedClubs[state.controlledClubId];
  const candidateSuitors = Object.values(updatedClubs)
    .filter(
      (c) =>
        c.id !== state.controlledClubId &&
        c.reputation >= Math.max(76, (myClub?.reputation || 75) - 4)
    )
    .sort((a, b) => b.reputation - a.reputation);

  const suitorClub = candidateSuitors[0];
  const headhuntNewsId = suitorClub ? `news_headhunt_${state.gameDate}_${suitorClub.id}` : '';
  if (
    suitorClub &&
    (state.manager.reputation >= 60 || sackedCount > 0) &&
    !nextInbox.some((n) => n.id === headhuntNewsId)
  ) {
    const budgetM = (suitorClub.finances.transferBudget / 1_000_000).toFixed(1);
    nextInbox.unshift({
      id: headhuntNewsId,
      gameDate: state.gameDate,
      category: 'Board',
      title: trText(
        `Official Headhunting Approach: ${suitorClub.name} Offer You the Manager Job (€${budgetM}M Budget)!`,
        `ข้อเสนอทาบทามคุมทีม: บอร์ดบริหาร ${suitorClub.name} ยื่นข้อเสนอดึงตัวคุณไปคุมทัพ (งบ €${budgetM}M)!`
      ),
      body: trText(
        `Impressed by your tactical identity and leadership at ${myClub?.name || 'your club'}, the Board of Directors at ${suitorClub.name} (${LEAGUES_CONFIG[suitorClub.leagueId].name}) have formally approached you to take over as their First-Team Manager immediately with a €${budgetM}M transfer warchest.`,
        `บอร์ดบริหารของสโมสรยักษ์ใหญ่ ${suitorClub.name} (${LEAGUES_CONFIG[suitorClub.leagueId].name}) ประทับใจผลงานและปรัชญาการทำทีมของคุณกับ ${myClub?.name || 'สโมสรปัจจุบัน'} จึงได้ส่งหนังสือทาบทามอย่างเป็นทางการให้คุณย้ายไปรับตำแหน่งผู้จัดการทีมคนใหม่ทันที พร้อมงบซื้อขาย €${budgetM}M`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: suitorClub.id,
      actionType: 'PressConference',
      pressConferenceOptions: [
        {
          id: `headhunt_accept_${suitorClub.id}`,
          label: trText(
            `✅ Accept Offer & Take Over as Manager of ${suitorClub.name} Immediately (€${budgetM}M Budget)`,
            `✅ ตอบรับข้อเสนอและย้ายไปคุมสโมสร ${suitorClub.name} ทันที (งบเสริมทัพ €${budgetM}M)`
          ),
          moraleDelta: 0,
          boardDelta: 0,
          mediaResponse: trText(
            `Blockbuster Move! You have signed the contract to become the new Manager of ${suitorClub.name}!`,
            `ดีลสะเทือนวงการ! คุณตกลงเซ็นสัญญาย้ายไปคุมทัพ ${suitorClub.name} อย่างเป็นทางการ!`
          ),
        },
        {
          id: `headhunt_loyalty_${suitorClub.id}`,
          label: trText(
            `❌ Reject ${suitorClub.name} Approach & Pledge Public Loyalty to ${myClub?.name || 'Current Club'} (+8% Board & Fan Confidence)`,
            `❌ ปฏิเสธข้อเสนอจาก ${suitorClub.name} และประกาศความจงรักภักดีต่อ ${myClub?.name || 'สโมสรปัจจุบัน'} (+8% ความเชื่อมั่นบอร์ดและแฟนบอล)`
          ),
          moraleDelta: 5,
          boardDelta: 8,
          mediaResponse: trText(
            `Supporters and the Board at ${myClub?.name || 'your club'} are thrilled by your public commitment (+8% Board Confidence, +5% Squad Morale)!`,
            `บอร์ดบริหารและแฟนบอลของ ${myClub?.name || 'สโมสร'} ประทับใจอย่างยิ่งที่คุณปฏิเสธทีมใหญ่เพื่ออยู่สร้างความสำเร็จต่อไป (+8% ความเชื่อมั่นบอร์ด, +5% ขวัญกำลังใจนักเตะ)!`
          ),
        },
      ],
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
    clubsSummary: 'AC Milan, Chelsea, PSG, Bayern, Real Madrid, Brazil',
    clubName: 'Brazil / Real Madrid',
    majorTrophies: 31,
    winRatePct: 62,
    points: 4250,
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
    managerName: 'Luis Enrique',
    nationality: 'ESP',
    clubsSummary: 'Barcelona, Spain, Paris Saint-Germain (2x Treble)',
    clubName: 'Paris Saint-Germain',
    majorTrophies: 17,
    winRatePct: 68,
    points: 2790,
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

  // Initialize 8-club Quarter-Final bracket with global continental representatives (UEFA + BRA_SA + KSA_SPL + USA_MLS + JPN_J1)
  if (cwcFixtures.length === 0) {
    const pickTopFromLeague = (lid: LeagueId) =>
      Object.values(state.clubs)
        .filter((c) => c.leagueId === lid && c.id !== state.controlledClubId)
        .sort((a, b) => b.reputation - a.reputation)[0];
    const continentalReps = [
      pickTopFromLeague('BRA_SA'),
      pickTopFromLeague('KSA_SPL'),
      pickTopFromLeague('USA_MLS'),
      pickTopFromLeague('JPN_J1'),
    ].filter((c): c is Club => Boolean(c));
    const repIds = new Set([state.controlledClubId, ...continentalReps.map((c) => c.id)]);
    const topUefaClubs = Object.values(state.clubs)
      .filter((c) => !repIds.has(c.id))
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 7 - continentalReps.length);
    const participants = [
      state.clubs[state.controlledClubId],
      ...continentalReps,
      ...topUefaClubs,
    ]
      .filter(Boolean)
      .slice(0, 8);
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

/**
 * Phase 1.3: Apply Post-Match or Pre-Match Dressing Room Team Talk effects directly to WorldState
 */
export function applyPostMatchTeamTalk(
  state: WorldState,
  tone: 'PRAISE' | 'DEMAND' | 'FOCUS' | 'praise_ft' | 'demand_ft' | 'focus_next',
  fixtureId?: string
): { nextState: WorldState; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const updatedPlayers: Record<string, Player> = { ...state.players };

  const fixture = fixtureId ? state.fixtures.find((f) => f.id === fixtureId) : undefined;
  const isHome = fixture ? fixture.homeClubId === myClub.id : true;
  const myGoals = fixture?.result ? (isHome ? fixture.result.homeGoals : fixture.result.awayGoals) : 1;
  const oppGoals = fixture?.result ? (isHome ? fixture.result.awayGoals : fixture.result.homeGoals) : 1;
  const wonOrDrew = myGoals >= oppGoals;
  const normalizedTone =
    tone === 'praise_ft' ? 'PRAISE' : tone === 'demand_ft' ? 'DEMAND' : tone === 'focus_next' ? 'FOCUS' : tone;

  for (const p of Object.values(state.players)) {
    if (p.clubId !== myClub.id) continue;
    if (normalizedTone === 'PRAISE') {
      const moraleGain = wonOrDrew ? 6 : 4;
      updatedPlayers[p.id] = {
        ...p,
        morale: Math.min(100, p.morale + moraleGain),
        satisfaction: Math.min(100, p.satisfaction + 3),
      };
    } else if (normalizedTone === 'DEMAND') {
      const det = p.attributes.mental.determination;
      const moraleDelta = det >= 14 ? 4 : -1;
      updatedPlayers[p.id] = {
        ...p,
        morale: Math.max(15, Math.min(100, p.morale + moraleDelta)),
        matchSharpness: Math.min(100, p.matchSharpness + 3),
      };
    } else {
      updatedPlayers[p.id] = {
        ...p,
        fitness: Math.min(100, p.fitness + 2),
        morale: Math.min(100, p.morale + 2),
      };
    }
  }

  const msg =
    normalizedTone === 'PRAISE'
      ? trText(
          'Dressing Room Talk: Squad morale boosted (+5 Morale across all matchday players)!',
          'พูดคุยในห้องแต่งตัว: ขวัญกำลังใจของนักเตะในทีมพุ่งสูงขึ้น (+5 Morale)!'
        )
      : normalizedTone === 'DEMAND'
        ? trText(
            'Dressing Room Talk: Determined players responded with higher sharpness (+3 Sharpness, +4 Morale)!',
            'พูดคุยในห้องแต่งตัว: นักเตะที่มีความมุ่งมั่นตอบสนองอย่างดีเยี่ยม (+3 ความคมชัด, +4 กำลังใจ)!'
          )
        : trText(
            'Dressing Room Talk: Squad focused on recovery and preparation (+2% Condition & +2 Morale)!',
            'พูดคุยในห้องแต่งตัว: ลูกทีมมุ่งเน้นการฟื้นฟูร่างกายและเตรียมพร้อมนัดถัดไป (+2% ความฟิต)!'
          );

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
    },
    message: msg,
  };
}

/**
 * Phase 3.2: Offer own player to AI clubs ("Offer to Clubs") to solicit an immediate incoming bid
 */
export function offerPlayerToClubs(
  state: WorldState,
  playerId: string
): { nextState: WorldState; offer: TransferOffer | null; bidsCreated: number; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const player = state.players[playerId];
  if (!player || player.clubId !== myClub.id) {
    return {
      nextState: state,
      offer: null,
      bidsCreated: 0,
      message: trText('You can only offer your own players to clubs.', 'สามารถเร่ขายได้เฉพาะนักเตะในสังกัดของคุณเท่านั้น'),
    };
  }

  const basePrice = player.askingPrice || player.marketValue;
  const suitors = Object.values(state.clubs).filter(
    (c) =>
      c.id !== myClub.id &&
      c.finances.transferBudget >= basePrice * 0.75 &&
      Math.abs(c.reputation - myClub.reputation) <= 18
  );
  const buyer =
    suitors[Math.abs(state.randomSeed + player.currentAbility * 7) % Math.max(1, suitors.length)] ||
    Object.values(state.clubs).find((c) => c.id !== myClub.id)!;

  const upfront = Math.round((basePrice * 0.88) / 100_000) * 100_000;
  const installments = Math.round((basePrice * 0.12) / 100_000) * 100_000;

  const newOffer: TransferOffer = {
    id: `of_in_solic_${player.id}_${Date.now()}`,
    date: state.gameDate,
    playerId: player.id,
    buyingClubId: buyer.id,
    sellingClubId: myClub.id,
    offerType: 'Transfer',
    upfrontFee: upfront,
    installmentsFee: installments,
    sellOnPercentage: 5,
    proposedWagePerWeek: Math.round(player.wagePerWeek * 1.15),
    proposedContractYears: 4,
    proposedSquadStatus: 'Important Player',
    signingBonus: Math.round(player.wagePerWeek * 2),
    agentFee: Math.round(player.wagePerWeek * 1.5),
    status: 'PendingClub',
  };

  const updatedPlayer: Player = {
    ...player,
    transferListed: true,
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      transferOffers: [newOffer, ...state.transferOffers],
      inbox: [
        {
          id: `news_of_solic_${newOffer.id}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `Official Transfer Bid Received: ${buyer.name} Offer €${((upfront + installments) / 1_000_000).toFixed(2)}M for ${player.firstName} ${player.lastName}`,
            `ข้อเสนอซื้อตัวจากสโมสรอื่น: ${buyer.name} ยื่นซื้อ ${player.firstName} ${player.lastName} มูลค่า €${((upfront + installments) / 1_000_000).toFixed(2)}M`
          ),
          body: trText(
            `Following your circulation of ${player.firstName} ${player.lastName}'s availability, ${buyer.name} have submitted an official transfer bid of €${(upfront / 1_000_000).toFixed(2)}M upfront + €${(installments / 1_000_000).toFixed(2)}M in installments. Review or counter-negotiate in Transfers -> Incoming Offers.`,
            `หลังจากที่คุณแจ้งความจำนงพร้อมปล่อยตัว ${player.firstName} ${player.lastName} ล่าสุด ${buyer.name} ได้ยื่นข้อเสนออย่างเป็นทางการเข้ามาแล้วที่ €${(upfront / 1_000_000).toFixed(2)}M ก้อนแรก + ผ่อนชำระ €${(installments / 1_000_000).toFixed(2)}M`
          ),
          isRead: false,
          isImportant: true,
          relatedClubId: buyer.id,
          relatedPlayerId: player.id,
          actionType: 'GoToTransfer',
        },
        ...state.inbox,
      ],
    },
    offer: newOffer,
    bidsCreated: newOffer ? 1 : 0,
    message: trText(
      `${buyer.name} submitted a €${((upfront + installments) / 1_000_000).toFixed(2)}M bid for ${player.firstName} ${player.lastName}!`,
      `${buyer.name} ยื่นข้อเสนอขอซื้อ ${player.firstName} ${player.lastName} มูลค่า €${((upfront + installments) / 1_000_000).toFixed(2)}M เข้ามาแล้ว!`
    ),
  };
}

/**
 * Phase 3.1: Interactive Incoming Bid Counter-Negotiation (Upfront + Installments + Sell-On % + Buy-Back Clause)
 */
export function negotiateIncomingTransferBid(
  state: WorldState,
  offerId: string,
  params: {
    action?: 'ACCEPT' | 'COUNTER' | 'REJECT';
    demandedUpfrontFee?: number;
    demandedInstallmentsFee?: number;
    upfrontFee?: number;
    installmentsFee?: number;
    sellOnPercentage?: number;
    buyBackClauseFee?: number;
    forceAccept?: boolean;
  }
): {
  nextState: WorldState;
  outcome: 'COMPLETED' | 'COUNTER_ACCEPTED' | 'REJECTED';
  accepted: boolean;
  message: string;
} {
  const offer = state.transferOffers.find((o) => o.id === offerId);
  if (!offer) {
    return { nextState: state, outcome: 'REJECTED', accepted: false, message: 'Offer not found.' };
  }

  const player = state.players[offer.playerId];
  const buyingClub = state.clubs[offer.buyingClubId];
  const myClub = state.clubs[state.controlledClubId];

  if (!player || !buyingClub || !myClub) {
    return { nextState: state, outcome: 'REJECTED', accepted: false, message: 'Invalid offer entities.' };
  }

  const resolvedAction =
    params.action ?? (params.forceAccept ? 'ACCEPT' : 'COUNTER');

  if (resolvedAction === 'REJECT') {
    return {
      nextState: {
        ...state,
        transferOffers: state.transferOffers.map((o) =>
          o.id === offerId ? { ...o, status: 'Rejected' } : o
        ),
      },
      outcome: 'REJECTED',
      accepted: false,
      message: trText(
        `Rejected ${buyingClub.name}'s transfer bid for ${player.firstName} ${player.lastName}.`,
        `ปฏิเสธข้อเสนอของ ${buyingClub.name} ที่ยื่นซื้อ ${player.firstName} ${player.lastName} แล้ว`
      ),
    };
  }

  const rawUpfront = params.demandedUpfrontFee ?? params.upfrontFee;
  const rawInstallments = params.demandedInstallmentsFee ?? params.installmentsFee;

  const finalUpfront =
    typeof rawUpfront === 'number' ? rawUpfront : offer.upfrontFee;
  const finalInstallments =
    typeof rawInstallments === 'number' ? rawInstallments : offer.installmentsFee;
  const finalSellOn =
    typeof params.sellOnPercentage === 'number' ? params.sellOnPercentage : offer.sellOnPercentage;
  const finalBuyBack =
    typeof params.buyBackClauseFee === 'number' && params.buyBackClauseFee > 0
      ? params.buyBackClauseFee
      : undefined;

  const totalDemanded = finalUpfront + finalInstallments;
  const maxWillingToPay = Math.round(
    Math.max(player.marketValue * 1.45, (offer.upfrontFee + offer.installmentsFee) * 1.32)
  );

  if (resolvedAction === 'COUNTER' && !params.forceAccept && totalDemanded > maxWillingToPay) {
    return {
      nextState: {
        ...state,
        transferOffers: state.transferOffers.map((o) =>
          o.id === offerId
            ? {
                ...o,
                status: 'Rejected',
                rejectionReason: `${buyingClub.name} walked away after your €${(totalDemanded / 1_000_000).toFixed(1)}M demand exceeded their valuation.`,
              }
            : o
        ),
      },
      outcome: 'REJECTED',
      accepted: false,
      message: trText(
        `${buyingClub.name} walked away — your €${(totalDemanded / 1_000_000).toFixed(2)}M counter-demand was too high!`,
        `${buyingClub.name} ถอนตัวจากการเจรจา เนื่องจากราคาที่คุณเรียก (€${(totalDemanded / 1_000_000).toFixed(2)}M) สูงเกินงบ!`
      ),
    };
  }

  // Finalize sale of player to buyingClub
  const updatedPlayer: Player = {
    ...player,
    clubId: buyingClub.id,
    transferListed: false,
    loanListed: false,
    wagePerWeek: offer.proposedWagePerWeek,
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: myClub.id,
        toClubId: buyingClub.id,
        fee: totalDemanded,
        type: 'Transfer',
      },
      ...player.transferHistory,
    ],
  };

  const updatedMyClub: Club = {
    ...myClub,
    finances: {
      ...myClub.finances,
      balance: myClub.finances.balance + totalDemanded,
      transferBudget: myClub.finances.transferBudget + Math.round(totalDemanded * 0.85),
      wageUsedPerWeek: Math.max(0, myClub.finances.wageUsedPerWeek - player.wagePerWeek),
    },
    primaryTactic: {
      ...myClub.primaryTactic,
      lineup: myClub.primaryTactic.lineup.map((s) =>
        s.playerId === player.id ? { ...s, playerId: null } : s
      ),
      benchPlayerIds: myClub.primaryTactic.benchPlayerIds.filter((id) => id !== player.id),
    },
  };

  const updatedBuyingClub: Club = {
    ...buyingClub,
    finances: {
      ...buyingClub.finances,
      balance: buyingClub.finances.balance - finalUpfront,
      transferBudget: Math.max(0, buyingClub.finances.transferBudget - finalUpfront),
    },
  };

  const newBuyBackClauses = [...(state.buyBackClauses || [])];
  if (finalBuyBack && finalBuyBack > 0) {
    newBuyBackClauses.unshift({
      id: `bbc_${player.id}_${Date.now()}`,
      playerId: player.id,
      playerName: `${player.firstName} ${player.lastName}`,
      soldToClubId: buyingClub.id,
      soldToClubName: buyingClub.name,
      buyBackFee: finalBuyBack,
      expiresSeason: '2028/29',
      createdDate: state.gameDate,
    });
  }

  const newTx = {
    id: `tx_sale_${offer.id}`,
    date: state.gameDate,
    clubId: myClub.id,
    category: 'Player Sale' as const,
    amount: totalDemanded,
    description: `Sold ${player.firstName} ${player.lastName} to ${buyingClub.name} (${finalSellOn}% sell-on${finalBuyBack ? `, €${(finalBuyBack / 1_000_000).toFixed(1)}M Buy-Back` : ''})`,
    balanceAfter: updatedMyClub.finances.balance,
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedMyClub,
        [buyingClub.id]: updatedBuyingClub,
      },
      transferOffers: state.transferOffers.map((o) =>
        o.id === offerId
          ? {
              ...o,
              upfrontFee: finalUpfront,
              installmentsFee: finalInstallments,
              sellOnPercentage: finalSellOn,
              buyBackClauseFee: finalBuyBack,
              status: 'Completed',
            }
          : o
      ),
      buyBackClauses: newBuyBackClauses,
      transactions: [newTx, ...state.transactions],
    },
    outcome: resolvedAction === 'COUNTER' ? 'COUNTER_ACCEPTED' : 'COMPLETED',
    accepted: true,
    message: trText(
      `Deal Completed! Sold ${player.firstName} ${player.lastName} to ${buyingClub.name} for €${(totalDemanded / 1_000_000).toFixed(2)}M (${finalSellOn}% sell-on${finalBuyBack ? `, €${(finalBuyBack / 1_000_000).toFixed(1)}M Buy-Back` : ''}).`,
      `ปิดดีลสำเร็จ! ขาย ${player.firstName} ${player.lastName} ให้ ${buyingClub.name} มูลค่ารวม €${(totalDemanded / 1_000_000).toFixed(2)}M (ส่วนแบ่งขายต่อ ${finalSellOn}%${finalBuyBack ? `, ออปชันซื้อกลับ €${(finalBuyBack / 1_000_000).toFixed(1)}M` : ''})`
    ),
  };
}

/**
 * Phase 3.2: Exercise an active Buy-Back Clause to bring a former player back immediately
 */
export function exerciseBuyBackClause(
  state: WorldState,
  clauseId: string
): { nextState: WorldState; success: boolean; completed: boolean; message: string } {
  const clause = (state.buyBackClauses || []).find((c) => c.id === clauseId);
  if (!clause) {
    return { nextState: state, success: false, completed: false, message: 'Buy-Back clause not found.' };
  }

  const myClub = state.clubs[state.controlledClubId];
  const player = state.players[clause.playerId];
  if (!player) {
    return { nextState: state, success: false, completed: false, message: 'Player not found.' };
  }

  if (myClub.finances.transferBudget < clause.buyBackFee) {
    return {
      nextState: state,
      success: false,
      completed: false,
      message: trText(
        `Insufficient transfer budget to trigger €${(clause.buyBackFee / 1_000_000).toFixed(1)}M Buy-Back Clause.`,
        `งบซื้อขายไม่เพียงพอสำหรับจ่ายค่าออปชันซื้อกลับ €${(clause.buyBackFee / 1_000_000).toFixed(1)}M`
      ),
    };
  }

  const updatedPlayer: Player = {
    ...player,
    clubId: myClub.id,
    morale: Math.min(100, player.morale + 10),
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: clause.soldToClubId,
        toClubId: myClub.id,
        fee: clause.buyBackFee,
        type: 'Transfer',
      },
      ...player.transferHistory,
    ],
  };

  const updatedMyClub: Club = {
    ...myClub,
    finances: {
      ...myClub.finances,
      balance: myClub.finances.balance - clause.buyBackFee,
      transferBudget: myClub.finances.transferBudget - clause.buyBackFee,
    },
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedMyClub,
      },
      buyBackClauses: (state.buyBackClauses || []).filter((c) => c.id !== clauseId),
    },
    success: true,
    completed: true,
    message: trText(
      `Triggered €${(clause.buyBackFee / 1_000_000).toFixed(1)}M Buy-Back Clause! ${player.firstName} ${player.lastName} rejoins ${myClub.name}!`,
      `ใช้ออปชันซื้อกลับ €${(clause.buyBackFee / 1_000_000).toFixed(1)}M สำเร็จ! ดึงตัว ${player.firstName} ${player.lastName} กลับสู่ ${myClub.name} แล้ว!`
    ),
  };
}

/**
 * Stage 3 Pillar 3.1: 1-on-1 Manager Conversation with a Player
 */
export function conductOneOnOnePlayerChat(
  state: WorldState,
  playerId: string,
  topic: 'PRAISE_FORM' | 'CRITICIZE_FORM' | 'EXPLAIN_ROTATION' | 'CAPTAIN_INTERVENE'
): {
  nextState: WorldState;
  moraleDelta: number;
  sharpnessDelta: number;
  playerResponse: string;
  message: string;
} {
  const player = state.players[playerId];
  const myClub = state.clubs[state.controlledClubId];
  if (!player) {
    return {
      nextState: state,
      moraleDelta: 0,
      sharpnessDelta: 0,
      playerResponse: '',
      message: 'Player not found.',
    };
  }

  let moraleDelta = 0;
  let sharpnessDelta = 0;
  let clearBenched = false;
  let playerResponse = '';

  if (topic === 'PRAISE_FORM') {
    moraleDelta = player.stats.averageRating >= 7.0 ? 7 : 4;
    sharpnessDelta = 2;
    playerResponse = trText(
      `"Thanks boss! I'm feeling sharp and ready to keep delivering for ${myClub.shortName}."`,
      `"ขอบคุณครับบอส! ผมกำลังมั่นใจเต็มร้อยและพร้อมช่วยทีม ${myClub.shortName} เก็บชัยชนะต่อเนื่องครับ"`
    );
  } else if (topic === 'CRITICIZE_FORM') {
    const det = player.attributes.mental.determination;
    if (det >= 13 || player.professionalism >= 12) {
      moraleDelta = 3;
      sharpnessDelta = 5;
      playerResponse = trText(
        `"Fair criticism, gaffer. I know my standards have slipped—I'll prove myself on the training pitch."`,
        `"ผมยอมรับคำติชมครับบอส ผมรู้ตัวว่าฟอร์มดร็อปลงไป และจะพิสูจน์ตัวเองในการซ้อมและนัดต่อไปแน่นอน"`
      );
    } else {
      moraleDelta = -3;
      sharpnessDelta = 2;
      playerResponse = trText(
        `"I think that's harsh, boss, but I'll try to get my sharpness up."`,
        `"ผมคิดว่าบอสพูดแรงไปนิดครับ แต่ผมจะพยายามเร่งความฟิตกลับมา"`
      );
    }
  } else if (topic === 'EXPLAIN_ROTATION') {
    moraleDelta = 8;
    sharpnessDelta = 2;
    clearBenched = true;
    playerResponse = trText(
      `"I appreciate your honesty about the fixture congestion, boss. I'll be ready when called upon."`,
      `"ขอบคุณที่อธิบายแผนโรเตชันให้ฟังตรงๆ ครับบอส ผมเข้าใจและพร้อมลงสนามทันทีที่บอสต้องการ"`
    );
  } else {
    // CAPTAIN_INTERVENE
    const clubPlayers = Object.values(state.players).filter((p) => p.clubId === myClub.id);
    const captainId = myClub.primaryTactic.setPieces?.captainId;
    const captain =
      (captainId ? state.players[captainId] : undefined) ||
      [...clubPlayers].sort(
        (a, b) => b.attributes.mental.leadership - a.attributes.mental.leadership
      )[0];
    const capLdr = captain ? captain.attributes.mental.leadership : 14;
    moraleDelta = capLdr >= 14 ? 9 : 5;
    clearBenched = true;
    playerResponse = trText(
      `Captain ${captain ? captain.lastName : 'Leader'} spoke privately with ${player.lastName} and resolved all dressing room concerns.`,
      `กัปตันทีม ${captain ? captain.lastName : ''} เข้าไปช่วยพูดคุยเคลียร์ใจกับ ${player.lastName} จนกลับมาโฟกัสกับทีมเต็มร้อยแล้ว`
    );
  }

  const updatedPlayer: Player = {
    ...player,
    morale: Math.max(15, Math.min(100, player.morale + moraleDelta)),
    matchSharpness: Math.max(25, Math.min(100, player.matchSharpness + sharpnessDelta)),
    satisfaction: Math.max(20, Math.min(100, player.satisfaction + Math.max(2, moraleDelta))),
    consecutiveBenched: clearBenched ? 0 : player.consecutiveBenched,
    unhappyReason: clearBenched ? null : player.unhappyReason,
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
    },
    moraleDelta,
    sharpnessDelta,
    playerResponse,
    message: `${player.firstName} ${player.lastName}: ${playerResponse} (${moraleDelta >= 0 ? `+${moraleDelta}` : moraleDelta} Morale)`,
  };
}

/**
 * Stage 3 Pillar 3.2: Emergency / Big-Match Squad Team Meeting (21-day cooldown)
 */
export function holdEmergencySquadMeeting(
  state: WorldState,
  tone: 'RALLY_MORALE' | 'DEMAND_STANDARDS' | 'CALM_PRESSURE'
): {
  nextState: WorldState;
  boostedCount: number;
  avgMoraleDelta: number;
  message: string;
} {
  if (state.lastSquadMeetingDate) {
    const lastMs = Date.parse(state.lastSquadMeetingDate);
    const curMs = Date.parse(state.gameDate);
    const diffDays = Math.floor((curMs - lastMs) / 86_400_000);
    if (!Number.isNaN(diffDays) && diffDays < 21) {
      return {
        nextState: state,
        boostedCount: 0,
        avgMoraleDelta: 0,
        message: trText(
          `Squad Meeting unavailable — please wait ${21 - diffDays} more day(s) before calling another full dressing-room meeting.`,
          `ยังไม่สามารถเรียกประชุมทีมชุดใหญ่ซ้ำได้ (ต้องรออีก ${21 - diffDays} วัน)`
        ),
      };
    }
  }

  const myClub = state.clubs[state.controlledClubId];
  const updatedPlayers: Record<string, Player> = { ...state.players };
  const delta = tone === 'RALLY_MORALE' ? 8 : tone === 'DEMAND_STANDARDS' ? 6 : 7;
  let boostedCount = 0;

  for (const p of Object.values(state.players)) {
    if (p.clubId !== myClub.id) continue;
    boostedCount += 1;
    updatedPlayers[p.id] = {
      ...p,
      morale: Math.min(100, p.morale + delta),
      matchSharpness:
        tone === 'DEMAND_STANDARDS'
          ? Math.min(100, p.matchSharpness + 3)
          : p.matchSharpness,
      consecutiveBenched: 0,
      unhappyReason: null,
    };
  }

  const updatedClub: Club = {
    ...myClub,
    boardExpectations: {
      ...myClub.boardExpectations,
      confidence: {
        ...myClub.boardExpectations.confidence,
        squadAtmosphere: Math.min(
          100,
          myClub.boardExpectations.confidence.squadAtmosphere + 6
        ),
      },
    },
  };

  return {
    nextState: {
      ...state,
      lastSquadMeetingDate: state.gameDate,
      players: updatedPlayers,
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedClub,
      },
    },
    boostedCount,
    avgMoraleDelta: delta,
    message: trText(
      `Squad Meeting Complete! All ${boostedCount} players at ${myClub.name} received +${delta}% Morale & cleared dressing room unrest.`,
      `ประชุมทีมชุดใหญ่สำเร็จ! นักเตะทั้ง ${boostedCount} คนของ ${myClub.name} ได้รับขวัญกำลังใจ +${delta}% และเคลียร์ความกังวลในห้องแต่งตัวทั้งหมด`
    ),
  };
}

export function getCoachingLicenseModifiers(
  badge?: import('../types/game').CoachingLicenseTier
): {
  familiarityMultiplier: number;
  trainingGrowthMultiplier: number;
  wageDemandMultiplier: number;
} {
  const tier = badge || 'National A';
  if (tier === 'UEFA Pro') {
    return {
      familiarityMultiplier: 1.15,
      trainingGrowthMultiplier: 1.1,
      wageDemandMultiplier: 0.9,
    };
  }
  if (tier === 'Continental A') {
    return {
      familiarityMultiplier: 1.15,
      trainingGrowthMultiplier: 1.1,
      wageDemandMultiplier: 1.0,
    };
  }
  if (tier === 'Continental B') {
    return {
      familiarityMultiplier: 1.15,
      trainingGrowthMultiplier: 1.0,
      wageDemandMultiplier: 1.0,
    };
  }
  return {
    familiarityMultiplier: 1.0,
    trainingGrowthMultiplier: 1.0,
    wageDemandMultiplier: 1.0,
  };
}

/**
 * Stage 3 Pillar 4.1 & Stage 4 Hotfix 3: Study & Upgrade Manager Coaching License
 * Supports 'INSTANT' completion (default for tests & fast-track button) and 'COURSE_21D' 21-day enrollment
 */
export function studyNextCoachingLicense(
  state: WorldState,
  mode: 'INSTANT' | 'COURSE_21D' = 'INSTANT'
): {
  nextState: WorldState;
  newBadge: import('../types/game').CoachingLicenseTier;
  enrolledOnly?: boolean;
  message: string;
} {
  const order: import('../types/game').CoachingLicenseTier[] = [
    'National A',
    'Continental B',
    'Continental A',
    'UEFA Pro',
  ];
  const currentBadge = state.manager.coachingBadge || 'National A';
  const curIdx = order.indexOf(currentBadge);
  const nextBadge =
    state.manager.studyingBadge?.targetBadge || order[Math.min(order.length - 1, curIdx + 1)];
  const myClub = state.clubs[state.controlledClubId];

  if (mode === 'COURSE_21D' && !state.manager.studyingBadge) {
    const completionDate = new Date(
      new Date(`${state.gameDate}T00:00:00Z`).getTime() + 21 * 86_400_000
    )
      .toISOString()
      .slice(0, 10);

    return {
      nextState: {
        ...state,
        manager: {
          ...state.manager,
          studyingBadge: {
            targetBadge: nextBadge,
            completionDate,
          },
        },
      },
      newBadge: nextBadge,
      enrolledOnly: true,
      message: trText(
        `Enrolled in ${nextBadge} Coaching License Course! Scheduled graduation date: ${completionDate}.`,
        `ลงทะเบียนเรียนหลักสูตรใบอนุญาตโค้ช ${nextBadge} สำเร็จ! กำหนดจบหลักสูตรวันที่ ${completionDate}`
      ),
    };
  }

  // Apply immediate passive buffs to club tactical familiarity and player training morale
  const updatedClub: Club = {
    ...myClub,
    primaryTactic: {
      ...myClub.primaryTactic,
      familiarity: Math.min(100, myClub.primaryTactic.familiarity + 8),
    },
    secondaryTactic: {
      ...myClub.secondaryTactic,
      familiarity: Math.min(100, myClub.secondaryTactic.familiarity + 8),
    },
  };

  const updatedManager = {
    ...state.manager,
    coachingBadge: nextBadge,
    reputation: Math.min(100, state.manager.reputation + 5),
    studyingBadge: null,
  };

  return {
    nextState: {
      ...state,
      manager: updatedManager,
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedClub,
      },
    },
    newBadge: nextBadge,
    enrolledOnly: false,
    message: trText(
      `Congratulations! You earned the ${nextBadge} Coaching License (+8% Tactical Familiarity & permanent coaching/negotiation buffs unlocked)!`,
      `ขอแสดงความยินดี! คุณสอบผ่านใบอนุญาตโค้ชระดับ ${nextBadge} สำเร็จ (+8% ความคุ้นเคยแผนการเล่น และปลดล็อกบัฟผู้จัดการทีมถาวร)!`
    ),
  };
}

/**
 * Stage 4 Pillar 3.1a: Recall a player currently out on loan back to the user's club immediately
 */
export function recallPlayerFromLoan(
  state: WorldState,
  playerId: string
): { nextState: WorldState; success: boolean; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const player = state.players[playerId];
  if (!player || player.loanedFromClubId !== myClub.id) {
    return {
      nextState: state,
      success: false,
      message: trText(
        'This player is not currently out on loan from your club.',
        'นักเตะรายนี้ไม่ได้อยู่ในสถานะถูกปล่อยยืมตัวจากสโมสรของคุณ'
      ),
    };
  }

  const borrowingClub = state.clubs[player.clubId];
  const updatedPlayer: Player = {
    ...player,
    clubId: myClub.id,
    loanedFromClubId: null,
    loanOptionToBuyFee: null,
    morale: Math.min(100, player.morale + 4),
    isRegistered: true,
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: borrowingClub ? borrowingClub.id : player.clubId,
        toClubId: myClub.id,
        fee: 0,
        type: 'Loan',
      },
      ...player.transferHistory,
    ],
  };

  const updatedPlayers: Record<string, Player> = {
    ...state.players,
    [player.id]: updatedPlayer,
  };

  const updatedClubs: Record<string, Club> = { ...state.clubs };
  if (borrowingClub) {
    const remSquad = Object.values(updatedPlayers).filter((p) => p.clubId === borrowingClub.id);
    if (remSquad.length >= 11) {
      updatedClubs[borrowingClub.id] = {
        ...borrowingClub,
        primaryTactic: autoPickLineup(
          borrowingClub.primaryTactic.formation,
          remSquad,
          borrowingClub.primaryTactic.instructions,
          borrowingClub.primaryTactic.id,
          borrowingClub.primaryTactic.name
        ),
      };
    }
  }

  if (
    !myClub.primaryTactic.lineup.some((s) => s.playerId === player.id) &&
    !myClub.primaryTactic.benchPlayerIds.includes(player.id) &&
    myClub.primaryTactic.benchPlayerIds.length < 9
  ) {
    updatedClubs[myClub.id] = {
      ...myClub,
      primaryTactic: {
        ...myClub.primaryTactic,
        benchPlayerIds: [...myClub.primaryTactic.benchPlayerIds, player.id],
      },
    };
  }

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      clubs: updatedClubs,
      inbox: [
        {
          id: `news_loan_recall_${state.gameDate}_${player.id}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `Loan Recall Confirmed: ${player.firstName} ${player.lastName} Returns to ${myClub.name}`,
            `ดึงตัวกลับจากสัญญายืมตัว: ${player.firstName} ${player.lastName} กลับสู่ ${myClub.name} แล้ว`
          ),
          body: trText(
            `${player.firstName} ${player.lastName} has been recalled from his loan spell at ${borrowingClub?.name || 'his loan club'} and is immediately available for selection.`,
            `${player.firstName} ${player.lastName} ถูกเรียกตัวกลับจากการยืมตัวที่ ${borrowingClub?.name || 'สโมสรยืมตัว'} และพร้อมลงสนามช่วยทีมชุดใหญ่ทันที`
          ),
          isRead: false,
          relatedPlayerId: player.id,
          relatedClubId: myClub.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: trText(
      `Recalled ${player.firstName} ${player.lastName} from loan at ${borrowingClub?.name || 'loan club'}!`,
      `ดึงตัว ${player.firstName} ${player.lastName} กลับจากสัญญายืมตัวที่ ${borrowingClub?.name || 'สโมสรยืมตัว'} เรียบร้อยแล้ว!`
    ),
  };
}

/**
 * Stage 4 Pillar 3.1b: Trigger Option-to-Buy on a player currently loaned in at the user's club
 */
export function triggerLoanOptionToBuy(
  state: WorldState,
  playerId: string
): { nextState: WorldState; success: boolean; feePaid: number; message: string } {
  const myClub = state.clubs[state.controlledClubId];
  const player = state.players[playerId];
  if (!player || player.clubId !== myClub.id || !player.loanedFromClubId) {
    return {
      nextState: state,
      success: false,
      feePaid: 0,
      message: trText(
        'This player is not currently on loan at your club.',
        'นักเตะรายนี้ไม่ได้อยู่ในสถานะยืมตัวที่สโมสรของคุณ'
      ),
    };
  }

  const parentClub = state.clubs[player.loanedFromClubId];
  const optionFee =
    player.loanOptionToBuyFee && player.loanOptionToBuyFee > 0
      ? player.loanOptionToBuyFee
      : Math.round((player.marketValue * 1.1) / 100_000) * 100_000;

  if (myClub.finances.transferBudget < optionFee) {
    return {
      nextState: state,
      success: false,
      feePaid: 0,
      message: trText(
        `Insufficient transfer budget to trigger €${(optionFee / 1_000_000).toFixed(2)}M Option-to-Buy.`,
        `งบซื้อขายไม่เพียงพอสำหรับใช้ออปชันซื้อขาด €${(optionFee / 1_000_000).toFixed(2)}M`
      ),
    };
  }

  const nextYear = (Number(state.gameDate.slice(0, 4)) || 2025) + 4;
  const updatedPlayer: Player = {
    ...player,
    loanedFromClubId: null,
    loanOptionToBuyFee: null,
    contractEndDate: `${nextYear}-06-30`,
    morale: Math.min(100, player.morale + 10),
    transferHistory: [
      {
        date: state.gameDate,
        fromClubId: parentClub ? parentClub.id : player.loanedFromClubId,
        toClubId: myClub.id,
        fee: optionFee,
        type: 'Transfer',
      },
      ...player.transferHistory,
    ],
  };

  const newBalance = myClub.finances.balance - optionFee;
  const updatedMyClub: Club = {
    ...myClub,
    finances: {
      ...myClub.finances,
      balance: newBalance,
      transferBudget: myClub.finances.transferBudget - optionFee,
    },
  };

  const updatedClubs: Record<string, Club> = {
    ...state.clubs,
    [myClub.id]: updatedMyClub,
  };

  if (parentClub) {
    updatedClubs[parentClub.id] = {
      ...parentClub,
      finances: {
        ...parentClub.finances,
        balance: parentClub.finances.balance + optionFee,
        transferBudget: parentClub.finances.transferBudget + Math.round(optionFee * 0.85),
      },
    };
  }

  const tx: FinanceTransaction = {
    id: `tx_loan_buy_${Date.now()}_${player.id}`,
    date: state.gameDate,
    clubId: myClub.id,
    category: 'Player Purchase',
    amount: -optionFee,
    description: trText(
      `Triggered Option-to-Buy for ${player.firstName} ${player.lastName} from ${parentClub?.name || 'Parent Club'}`,
      `ใช้ออปชันซื้อขาด ${player.firstName} ${player.lastName} จาก ${parentClub?.name || 'สโมสรต้นสังกัด'}`
    ),
    balanceAfter: newBalance,
  };

  return {
    nextState: {
      ...state,
      players: {
        ...state.players,
        [player.id]: updatedPlayer,
      },
      clubs: updatedClubs,
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_loan_buy_${state.gameDate}_${player.id}`,
          gameDate: state.gameDate,
          category: 'Transfer',
          title: trText(
            `Permanent Deal Complete: ${myClub.name} Trigger €${(optionFee / 1_000_000).toFixed(2)}M Option-to-Buy for ${player.firstName} ${player.lastName}!`,
            `ปิดดีลซื้อขาดถาวร! ${myClub.name} ใช้ออปชัน €${(optionFee / 1_000_000).toFixed(2)}M คว้าตัว ${player.firstName} ${player.lastName} ร่วมทัพถาวร!`
          ),
          body: trText(
            `${myClub.name} have exercised the €${(optionFee / 1_000_000).toFixed(2)}M Option-to-Buy clause to sign ${player.firstName} ${player.lastName} on a permanent contract until ${nextYear}.`,
            `${myClub.name} ตัดสินใจใช้ออปชันซื้อขาดมูลค่า €${(optionFee / 1_000_000).toFixed(2)}M เซ็นสัญญาคว้าตัว ${player.firstName} ${player.lastName} มาร่วมทีมอย่างถาวรถึงปี ${nextYear}`
          ),
          isRead: false,
          relatedPlayerId: player.id,
          relatedClubId: myClub.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    feePaid: optionFee,
    message: trText(
      `Triggered €${(optionFee / 1_000_000).toFixed(2)}M Option-to-Buy! ${player.firstName} ${player.lastName} is now permanently a ${myClub.name} player!`,
      `ใช้ออปชันซื้อขาด €${(optionFee / 1_000_000).toFixed(2)}M สำเร็จ! ${player.firstName} ${player.lastName} ย้ายร่วมทีม ${myClub.name} ถาวรแล้ว!`
    ),
  };
}

/**
 * Stage 4 Pillar 4.2: Unified handler for Inbox Press Conference & Headhunting Job Offer responses
 */
export function respondToPressConferenceOrJobOffer(
  state: WorldState,
  newsId: string,
  optionId: string
): { nextState: WorldState; switchedClub: boolean; message: string } {
  const item = state.inbox.find((n) => n.id === newsId);
  const opt = item?.pressConferenceOptions?.find((o) => o.id === optionId);
  if (!item || !opt) {
    return {
      nextState: state,
      switchedClub: false,
      message: trText('Option not found.', 'ไม่พบตัวเลือกที่ระบุ'),
    };
  }

  // Case 1: Accepting a Headhunting Job Offer (`headhunt_accept_<clubId>`)
  if (optionId.startsWith('headhunt_accept_')) {
    const targetClubId = optionId.replace('headhunt_accept_', '');
    const markedState: WorldState = {
      ...state,
      inbox: state.inbox.map((n) =>
        n.id === newsId ? { ...n, isRead: true, pressConferenceAnsweredId: optionId } : n
      ),
    };
    const jobRes = applyForManagerJob(markedState, targetClubId, true);
    return {
      nextState: jobRes.nextState,
      switchedClub: jobRes.accepted,
      message: opt.mediaResponse || jobRes.message,
    };
  }

  // Case 2: Standard Press Conference or Rejecting Headhunt with Public Loyalty (`headhunt_loyalty_<clubId>`)
  const controlledClub = state.clubs[state.controlledClubId];
  const updatedPlayers = { ...state.players };
  for (const p of Object.values(updatedPlayers)) {
    if (p.clubId === controlledClub.id) {
      updatedPlayers[p.id] = {
        ...p,
        morale: Math.max(20, Math.min(100, p.morale + opt.moraleDelta)),
      };
    }
  }

  const updatedClub: Club = {
    ...controlledClub,
    boardExpectations: {
      ...controlledClub.boardExpectations,
      confidence: {
        ...controlledClub.boardExpectations.confidence,
        overall: Math.max(
          15,
          Math.min(100, controlledClub.boardExpectations.confidence.overall + opt.boardDelta)
        ),
        squadAtmosphere: optionId.startsWith('headhunt_loyalty_')
          ? Math.min(100, controlledClub.boardExpectations.confidence.squadAtmosphere + 6)
          : controlledClub.boardExpectations.confidence.squadAtmosphere,
      },
    },
  };

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      clubs: { ...state.clubs, [controlledClub.id]: updatedClub },
      inbox: state.inbox.map((n) =>
        n.id === newsId ? { ...n, isRead: true, pressConferenceAnsweredId: optionId } : n
      ),
    },
    switchedClub: false,
    message: opt.mediaResponse,
  };
}

/**
 * Stage 4 Pillar 4.1: Compute Matchday-by-Matchday League Position Worm Chart Data
 */
export function computeLeaguePositionWormData(
  state: WorldState,
  leagueId: LeagueId
): {
  matchdays: number[];
  totalClubs: number;
  series: {
    clubId: string;
    shortName: string;
    name: string;
    color: string;
    isUserClub: boolean;
    positions: number[];
  }[];
} {
  const table = state.standings[leagueId] || [];
  const totalClubs = Math.max(10, table.length || 20);
  const completedLeagueFixtures = state.fixtures.filter(
    (f) => f.competitionId === leagueId && f.status === 'Completed' && f.result
  );

  const maxCompletedMd = completedLeagueFixtures.reduce(
    (max, f) => Math.max(max, f.matchday || 1),
    0
  );

  // Pick User Club (if in this league) + top 2 rivals
  const trackedClubIds: string[] = [];
  if (state.clubs[state.controlledClubId]?.leagueId === leagueId) {
    trackedClubIds.push(state.controlledClubId);
  }
  for (const row of table) {
    if (!trackedClubIds.includes(row.clubId) && trackedClubIds.length < 3) {
      trackedClubIds.push(row.clubId);
    }
  }

  const palette = ['#10b981', '#38bdf8', '#f59e0b'];
  const totalPointsToPlot = Math.max(8, Math.min(38, maxCompletedMd));
  const matchdays = Array.from({ length: totalPointsToPlot }, (_, idx) => idx + 1);

  const allLeagueClubIds = table.map((r) => r.clubId);
  const positionsByMd: Record<number, Record<string, number>> = {};

  for (const md of matchdays) {
    if (md <= maxCompletedMd) {
      const ptsMap: Record<string, { pts: number; gd: number; gf: number; rep: number }> = {};
      for (const cid of allLeagueClubIds) {
        ptsMap[cid] = {
          pts: 0,
          gd: 0,
          gf: 0,
          rep: state.clubs[cid]?.reputation || 70,
        };
      }
      for (const fx of completedLeagueFixtures) {
        if ((fx.matchday || 1) <= md && fx.result) {
          const h = ptsMap[fx.homeClubId];
          const a = ptsMap[fx.awayClubId];
          if (h && a) {
            h.gf += fx.result.homeGoals;
            h.gd += fx.result.homeGoals - fx.result.awayGoals;
            a.gf += fx.result.awayGoals;
            a.gd += fx.result.awayGoals - fx.result.homeGoals;
            if (fx.result.homeGoals > fx.result.awayGoals) h.pts += 3;
            else if (fx.result.homeGoals < fx.result.awayGoals) a.pts += 3;
            else {
              h.pts += 1;
              a.pts += 1;
            }
          }
        }
      }
      const sorted = [...allLeagueClubIds].sort((c1, c2) => {
        const s1 = ptsMap[c1];
        const s2 = ptsMap[c2];
        return s2.pts - s1.pts || s2.gd - s1.gd || s2.gf - s1.gf || s2.rep - s1.rep;
      });
      positionsByMd[md] = {};
      sorted.forEach((cid, idx) => {
        positionsByMd[md][cid] = idx + 1;
      });
    } else {
      // Early season projection based on current table rank + deterministic form wave
      positionsByMd[md] = {};
      allLeagueClubIds.forEach((cid, baseIdx) => {
        const baseRank = baseIdx + 1;
        const wave = ((cid.charCodeAt(cid.length - 1) + md * 3) % 3) - 1;
        positionsByMd[md][cid] = Math.max(1, Math.min(totalClubs, baseRank + wave));
      });
    }
  }

  const series = trackedClubIds.map((cid, sIdx) => {
    const c = state.clubs[cid];
    const isUserClub = cid === state.controlledClubId;
    return {
      clubId: cid,
      shortName: c?.shortName || 'CLB',
      name: c?.name || 'Club',
      color: isUserClub ? '#10b981' : palette[(sIdx + 1) % palette.length],
      isUserClub,
      positions: matchdays.map((md) => positionsByMd[md]?.[cid] || sIdx + 1),
    };
  });

  return {
    matchdays,
    totalClubs,
    series,
  };
}

/**
 * Stage 3 Pillar 4.2: Negotiate Season Ambition & Vision with the Board of Directors
 */
export function negotiateBoardSeasonAmbition(
  state: WorldState,
  ambition: 'Conservative' | 'Balanced' | 'Ambitious'
): {
  nextState: WorldState;
  newTransferBudget: number;
  newWageBudget: number;
  message: string;
} {
  const myClub = state.clubs[state.controlledClubId];
  const prevAmbition = myClub.boardExpectations.seasonAmbition || 'Balanced';
  if (prevAmbition === ambition) {
    return {
      nextState: state,
      newTransferBudget: myClub.finances.transferBudget,
      newWageBudget: myClub.finances.wageBudgetPerWeek,
      message: trText(
        `Board Season Vision is already set to ${ambition}.`,
        `เป้าหมายประจำฤดูกาลของบอร์ดบริหารตั้งไว้ที่ระดับ ${ambition} อยู่แล้ว`
      ),
    };
  }

  const mult = ambition === 'Ambitious' ? 1.2 : ambition === 'Conservative' ? 0.92 : 1.0;
  const newTransferBudget = Math.round((myClub.finances.transferBudget * mult) / 100_000) * 100_000;
  const newWageBudget = Math.round((myClub.finances.wageBudgetPerWeek * mult) / 1_000) * 1_000;
  const newTargetPos =
    ambition === 'Ambitious'
      ? Math.max(1, myClub.boardExpectations.targetLeaguePosition - 2)
      : ambition === 'Conservative'
        ? Math.min(15, myClub.boardExpectations.targetLeaguePosition + 2)
        : myClub.boardExpectations.targetLeaguePosition;

  const updatedClub: Club = {
    ...myClub,
    finances: {
      ...myClub.finances,
      transferBudget: newTransferBudget,
      wageBudgetPerWeek: newWageBudget,
    },
    boardExpectations: {
      ...myClub.boardExpectations,
      seasonAmbition: ambition,
      targetLeaguePosition: newTargetPos,
      confidence: {
        ...myClub.boardExpectations.confidence,
        overall:
          ambition === 'Conservative'
            ? Math.min(100, myClub.boardExpectations.confidence.overall + 4)
            : myClub.boardExpectations.confidence.overall,
      },
    },
  };

  return {
    nextState: {
      ...state,
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedClub,
      },
    },
    newTransferBudget,
    newWageBudget,
    message: trText(
      `Board Vision updated to "${ambition}" (Target Top ${newTargetPos})! Transfer Budget adjusted to €${(newTransferBudget / 1_000_000).toFixed(1)}M.`,
      `ปรับเป้าหมายบอร์ดบริหารเป็น "${ambition}" (เป้าอันดับ Top ${newTargetPos})! งบซื้อขายปรับเป็น €${(newTransferBudget / 1_000_000).toFixed(1)}M เรียบร้อยแล้ว`
    ),
  };
}

/**
 * Stage 3 Pillar 5.1: Build 7-Day Interactive Calendar Schedule Strip (Day +0 to Day +6)
 */
export function buildSevenDayCalendarStrip(state: WorldState): {
  date: string;
  dayName: string;
  dayNum: string;
  isToday: boolean;
  eventType: 'MATCHDAY' | 'DEADLINE' | 'TRAINING' | 'REST';
  labelEn: string;
  labelTh: string;
  opponentClubId?: string;
  opponentShortName?: string;
  isHome?: boolean;
  competitionId?: string;
}[] {
  const myClubId = state.controlledClubId;
  const baseDate = new Date(`${state.gameDate}T00:00:00Z`);
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const result = [];

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(baseDate.getTime() + offset * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    const dayName = dayNames[dow];
    const dayNum = iso.slice(5); // MM-DD

    const fixture = state.fixtures.find(
      (f) =>
        f.kickoffDate === iso &&
        f.status === 'Scheduled' &&
        (f.homeClubId === myClubId || f.awayClubId === myClubId)
    );

    if (fixture) {
      const isHome = fixture.homeClubId === myClubId;
      const oppId = isHome ? fixture.awayClubId : fixture.homeClubId;
      const oppClub = state.clubs[oppId];
      result.push({
        date: iso,
        dayName,
        dayNum,
        isToday: offset === 0,
        eventType: 'MATCHDAY' as const,
        labelEn: `vs ${oppClub?.shortName || 'OPP'} (${isHome ? 'H' : 'A'})`,
        labelTh: `พบ ${oppClub?.shortName || 'OPP'} (${isHome ? 'เหย้า' : 'เยือน'})`,
        opponentClubId: oppId,
        opponentShortName: oppClub?.shortName || 'OPP',
        isHome,
        competitionId: fixture.competitionId,
      });
    } else if (isTransferDeadlineWindow(iso)) {
      result.push({
        date: iso,
        dayName,
        dayNum,
        isToday: offset === 0,
        eventType: 'DEADLINE' as const,
        labelEn: 'Deadline Window',
        labelTh: 'โค้งสุดท้ายตลาด',
      });
    } else if (dow === 1 || dow === 4) {
      result.push({
        date: iso,
        dayName,
        dayNum,
        isToday: offset === 0,
        eventType: 'TRAINING' as const,
        labelEn: dow === 1 ? 'Training & Scouts' : 'Tactical Prep',
        labelTh: dow === 1 ? 'ซ้อมใหญ่ & แมวมอง' : 'ซ้อมแท็กติก',
      });
    } else {
      result.push({
        date: iso,
        dayName,
        dayNum,
        isToday: offset === 0,
        eventType: 'REST' as const,
        labelEn: 'Recovery / Prep',
        labelTh: 'ฟื้นฟูร่างกาย',
      });
    }
  }

  return result;
}

/**
 * Stage 5 Pillar 3: Weekly Training Risers Report & Backroom Staff Advice
 */
export function getWeeklyTrainingReportAndAdvice(state: WorldState): {
  topRisers: {
    playerId: string;
    name: string;
    position: string;
    age: number;
    ca: number;
    pa: number;
    focusLabel: string;
    upgradedAttrLabel: string;
    oldVal: number;
    newVal: number;
    weeklyScore: number;
  }[];
  overloadedPlayers: {
    playerId: string;
    name: string;
    position: string;
    fitness: number;
    intensity: 'Light' | 'Medium' | 'Heavy';
  }[];
  staffAdvice: {
    id: string;
    roleEn: string;
    roleTh: string;
    staffName: string;
    summaryEn: string;
    summaryTh: string;
    actionLabelEn: string;
    actionLabelTh: string;
    actionType: 'SET_TEAM_TRAINING' | 'REDUCE_OVERLOAD' | 'PROMOTE_YOUTH';
    recommendedFocus?: Club['trainingFocus'];
    targetPlayerId?: string;
  }[];
} {
  const myClub = state.clubs[state.controlledClubId];
  const squad = Object.values(state.players).filter((p) => p.clubId === myClub.id);
  const bonuses = getClubStaffBonuses(state, myClub.id);
  const badgeMods = getCoachingLicenseModifiers(state.manager.coachingBadge);

  const risersRaw = squad
    .filter((p) => !p.injuryStatus.isInjured)
    .map((p) => {
      const age = getAgeAtDate(p.dateOfBirth, state.gameDate);
      const upside = Math.max(0, p.potentialAbility - p.currentAbility);
      const devHist = p.developmentHistory || [];
      const latestPoint = devHist.length > 0 ? devHist[devHist.length - 1] : null;
      const latestAttrChange =
        latestPoint && latestPoint.keyAttributeChanges.length > 0
          ? latestPoint.keyAttributeChanges[0]
          : null;

      const defaultAttr =
        p.positions[0] === 'GK'
          ? 'reflexes'
          : ['ST', 'AMR', 'AML'].includes(p.positions[0])
            ? 'finishing'
            : ['MC', 'AMC', 'DM'].includes(p.positions[0])
              ? 'passing'
              : 'tackling';

      const attrKey =
        latestAttrChange?.attr || p.individualTraining?.attributeFocus || defaultAttr;
      const prettyAttr = attrKey
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (c) => c.toUpperCase());

      const rawVal =
        (p.attributes.technical as unknown as Record<string, number>)[attrKey] ??
        (p.attributes.mental as unknown as Record<string, number>)[attrKey] ??
        (p.attributes.physical as unknown as Record<string, number>)[attrKey] ??
        14;
      const newVal = Math.min(20, Number(rawVal));
      const oldVal = Math.max(1, newVal - 1);

      const weeklyScore = Number(
        (
          (p.professionalism * 0.25 +
            p.attributes.mental.determination * 0.25 +
            (upside > 8 ? 2.2 : 0.9) +
            (age <= 22 ? 1.4 : 0.4)) *
          badgeMods.trainingGrowthMultiplier
        ).toFixed(2)
      );

      return {
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: p.positions[0],
        age,
        ca: p.currentAbility,
        pa: p.potentialAbility,
        focusLabel: p.individualTraining?.attributeFocus
          ? p.individualTraining.attributeFocus.replace(/([A-Z])/g, ' $1')
          : myClub.trainingFocus,
        upgradedAttrLabel: prettyAttr,
        oldVal,
        newVal,
        weeklyScore,
      };
    })
    .sort((a, b) => b.weeklyScore - a.weeklyScore)
    .slice(0, 4);

  const overloadedPlayers = squad
    .filter(
      (p) =>
        (p.individualTraining?.intensity === 'Heavy' && p.fitness < 84) ||
        p.fitness < 74
    )
    .sort((a, b) => a.fitness - b.fitness)
    .slice(0, 4)
    .map((p) => ({
      playerId: p.id,
      name: `${p.firstName} ${p.lastName}`,
      position: p.positions[0],
      fitness: p.fitness,
      intensity: (p.individualTraining?.intensity || 'Medium') as 'Light' | 'Medium' | 'Heavy',
    }));

  // Build Backroom Staff Advice
  const nextFixture = state.fixtures.find(
    (f) =>
      f.status === 'Scheduled' &&
      (f.homeClubId === myClub.id || f.awayClubId === myClub.id)
  );
  const oppClub = nextFixture
    ? state.clubs[
        nextFixture.homeClubId === myClub.id
          ? nextFixture.awayClubId
          : nextFixture.homeClubId
      ]
    : undefined;

  const recommendedFocus: Club['trainingFocus'] = oppClub
    ? oppClub.reputation > myClub.reputation + 3
      ? 'Defending'
      : oppClub.primaryTactic.instructions.defensiveLine === 'High'
        ? 'Attacking'
        : 'Chance Creation'
    : 'Possession';

  const staffAdvice: {
    id: string;
    roleEn: string;
    roleTh: string;
    staffName: string;
    summaryEn: string;
    summaryTh: string;
    actionLabelEn: string;
    actionLabelTh: string;
    actionType: 'SET_TEAM_TRAINING' | 'REDUCE_OVERLOAD' | 'PROMOTE_YOUTH';
    recommendedFocus?: Club['trainingFocus'];
    targetPlayerId?: string;
  }[] = [
    {
      id: 'adv_assman_focus',
      roleEn: 'Assistant Manager',
      roleTh: 'ผู้ช่วยผู้จัดการทีม',
      staffName:
        Object.values(state.staff || {}).find(
          (s) => s.clubId === myClub.id && s.role === 'Assistant Manager'
        )?.name || 'Carlos Cuesta',
      summaryEn: oppClub
        ? `Upcoming opponent ${oppClub.name} deploy a ${oppClub.primaryTactic.formation}. Switching Team Training to "${recommendedFocus}" will sharpen our tactical execution.`
        : `Recommend setting Weekly Team Training to "${recommendedFocus}" to maximize squad tactical cohesion.`,
      summaryTh: oppClub
        ? `คู่แข่งนัดถัดไป ${oppClub.name} ใช้แผน ${oppClub.primaryTactic.formation} แนะนำให้ปรับการซ้อมทีมเป็น "${recommendedFocus}" เพื่อรับมือจุดแข็งของคู่แข่ง`
        : `แนะนำให้ตั้งค่าการซ้อมทีมประจำสัปดาห์เป็น "${recommendedFocus}" เพื่อยกระดับความเข้าใจแท็กติก`,
      actionLabelEn: `Set Focus: ${recommendedFocus}`,
      actionLabelTh: `ปรับซ้อมทีม: ${recommendedFocus}`,
      actionType: 'SET_TEAM_TRAINING',
      recommendedFocus,
    },
  ];

  if (overloadedPlayers.length > 0) {
    const tired = overloadedPlayers[0];
    staffAdvice.push({
      id: 'adv_physio_load',
      roleEn: 'Head Physio',
      roleTh: 'หัวหน้าทีมแพทย์กายภาพ',
      staffName:
        Object.values(state.staff || {}).find(
          (s) =>
            s.clubId === myClub.id &&
            (String(s.role).includes('Physio') || String(s.role).includes('Fitness'))
        )?.name || 'Dr. Gary O’Driscoll',
      summaryEn: `${tired.name} (${tired.fitness}% Fitness) is showing signs of training fatigue. Switching his individual workload to Light will prevent muscle strain.`,
      summaryTh: `${tired.name} (ความฟิต ${tired.fitness}%) เริ่มมีอาการล้าสะสม แนะนำให้ลดความเข้มข้นการซ้อมรายบุคคลเป็น Light เพื่อป้องกันกล้ามเนื้อบาดเจ็บ`,
      actionLabelEn: `Set ${tired.name} to Light`,
      actionLabelTh: `ปรับ ${tired.name} ซ้อมเบา (Light)`,
      actionType: 'REDUCE_OVERLOAD',
      targetPlayerId: tired.playerId,
    });
  }

  const topYouth = squad
    .filter((p) => p.isYouthAcademy || p.squadStatus === 'Youth')
    .sort((a, b) => b.currentAbility - a.currentAbility)[0];
  if (topYouth) {
    staffAdvice.push({
      id: 'adv_hoyd_promote',
      roleEn: 'Head of Youth Development',
      roleTh: 'หัวหน้าศูนย์ฝึกเยาวชน (HoYD)',
      staffName: bonuses.hoydName,
      summaryEn: `Academy standout ${topYouth.firstName} ${topYouth.lastName} (CA ${(topYouth.currentAbility / 10).toFixed(1)} · PA ${(topYouth.potentialAbility / 10).toFixed(1)}) is dominating U18 training and ready for Senior Squad integration.`,
      summaryTh: `ดาวรุ่งโดดเด่นประจำอคาเดมี ${topYouth.firstName} ${topYouth.lastName} (CA ${(topYouth.currentAbility / 10).toFixed(1)} · PA ${(topYouth.potentialAbility / 10).toFixed(1)}) พร้อมก้าวขึ้นสู่ทีมชุดใหญ่แล้ว`,
      actionLabelEn: `Promote ${topYouth.lastName} to Senior XI`,
      actionLabelTh: `ดัน ${topYouth.lastName} ขึ้นชุดใหญ่`,
      actionType: 'PROMOTE_YOUTH',
      targetPlayerId: topYouth.id,
    });
  }

  return {
    topRisers: risersRaw,
    overloadedPlayers,
    staffAdvice,
  };
}

export function setPlayerIndividualTrainingIntensity(
  state: WorldState,
  playerId: string,
  intensity: 'Light' | 'Medium' | 'Heavy'
): { nextState: WorldState; message: string } {
  const p = state.players[playerId];
  if (!p) {
    return { nextState: state, message: 'Player not found.' };
  }
  const updatedPlayer: Player = {
    ...p,
    fitness: intensity === 'Light' ? Math.min(100, p.fitness + 4) : p.fitness,
    individualTraining: {
      roleFocus: p.individualTraining?.roleFocus || p.preferredRole,
      attributeFocus: p.individualTraining?.attributeFocus || 'passing',
      intensity,
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
    message: trText(
      `Updated ${p.firstName} ${p.lastName}'s individual training workload to ${intensity} (+4% Fitness recovery).`,
      `ปรับความเข้มข้นการซ้อมรายบุคคลของ ${p.firstName} ${p.lastName} เป็น ${intensity} เรียบร้อยแล้ว (+4% ฟื้นฟูความฟิต)`
    ),
  };
}

/**
 * Stage 5 Pillar 5.1: Arrange Friendly Match (Boosts Match Sharpness + Gate Receipts)
 */
export function arrangeFriendlyMatch(
  state: WorldState,
  tier: 'LOCAL' | 'EUROPEAN' | 'GIANT' = 'EUROPEAN'
): {
  nextState: WorldState;
  scoreline: string;
  gateReceipts: number;
  sharpnessBoost: number;
  message: string;
} {
  const myClub = state.clubs[state.controlledClubId];
  const candidates = Object.values(state.clubs).filter((c) => {
    if (c.id === myClub.id) return false;
    if (tier === 'LOCAL') return c.reputation < 74;
    if (tier === 'GIANT') return c.reputation >= 85;
    return c.reputation >= 74 && c.reputation < 85;
  });
  const oppClub =
    candidates[
      (state.randomSeed + state.transactions.length * 7) % Math.max(1, candidates.length)
    ] || Object.values(state.clubs).find((c) => c.id !== myClub.id)!;

  const friendlyFixture: Fixture = {
    id: `frd_${state.gameDate}_${myClub.id}_${oppClub.id}_${state.transactions.length}`,
    competitionId: 'PRE_SEASON_FRIENDLY',
    seasonId: state.currentSeason,
    matchday: 1,
    kickoffDate: state.gameDate,
    homeClubId: myClub.id,
    awayClubId: oppClub.id,
    status: 'Completed',
  };

  const simRes = simulateMatch(
    friendlyFixture,
    myClub,
    oppClub,
    state.players,
    state.randomSeed + state.transactions.length * 313
  );
  friendlyFixture.result = simRes;

  const gateReceipts =
    tier === 'GIANT' ? 2_800_000 : tier === 'EUROPEAN' ? 1_650_000 : 850_000;
  const sharpnessBoost = 8;

  const updatedPlayers: Record<string, Player> = { ...state.players };
  for (const p of Object.values(state.players)) {
    if (p.clubId === myClub.id && !p.injuryStatus.isInjured) {
      updatedPlayers[p.id] = {
        ...p,
        matchSharpness: Math.min(100, p.matchSharpness + sharpnessBoost),
        morale: Math.min(100, p.morale + (simRes.homeGoals >= simRes.awayGoals ? 3 : 1)),
      };
    }
  }

  const newBalance = myClub.finances.balance + gateReceipts;
  const newFam = Math.min(100, myClub.primaryTactic.familiarity + 4);
  const updatedMyClub: Club = {
    ...myClub,
    primaryTactic: {
      ...myClub.primaryTactic,
      familiarity: newFam,
    },
    formationFamiliarity: {
      ...(myClub.formationFamiliarity || {}),
      [myClub.primaryTactic.formation]: newFam,
    },
    finances: {
      ...myClub.finances,
      balance: newBalance,
      transferBudget: myClub.finances.transferBudget + Math.round(gateReceipts * 0.5),
    },
  };

  const tx: FinanceTransaction = {
    id: `tx_frd_${Date.now()}`,
    date: state.gameDate,
    clubId: myClub.id,
    category: 'Ticket Sales',
    amount: gateReceipts,
    description: trText(
      `Exhibition Friendly Gate Receipts vs ${oppClub.name} (${simRes.homeGoals}-${simRes.awayGoals})`,
      `รายได้ค่าบัตรผ่านประตูแมตช์กระชับมิตรพบ ${oppClub.name} (${simRes.homeGoals}-${simRes.awayGoals})`
    ),
    balanceAfter: newBalance,
  };

  const scoreline = `${myClub.shortName} ${simRes.homeGoals} - ${simRes.awayGoals} ${oppClub.shortName}`;
  const updatedFixtures = [...state.fixtures, friendlyFixture].sort((a, b) =>
    a.kickoffDate.localeCompare(b.kickoffDate)
  );

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      fixtures: updatedFixtures,
      clubs: {
        ...state.clubs,
        [myClub.id]: updatedMyClub,
      },
      transactions: [tx, ...state.transactions],
      inbox: [
        {
          id: `news_frd_${Date.now()}`,
          gameDate: state.gameDate,
          category: 'Match Report',
          title: trText(
            `Pre-Season Friendly: ${myClub.name} ${simRes.homeGoals} - ${simRes.awayGoals} ${oppClub.name} (+${sharpnessBoost}% Sharpness)`,
            `ผลแมตช์อุ่นเครื่องปรีซีซั่น: ${myClub.name} ${simRes.homeGoals} - ${simRes.awayGoals} ${oppClub.name} (ความเฉียบคมทั้งทีม +${sharpnessBoost}%)`
          ),
          body: trText(
            `${myClub.name} hosted ${oppClub.name} in a Pre-Season Friendly (${simRes.homeGoals}-${simRes.awayGoals}), generating €${(gateReceipts / 1_000_000).toFixed(2)}M in gate receipts and boosting squad Match Sharpness by +${sharpnessBoost}% and Tactical Familiarity by +4%.`,
            `${myClub.name} เปิดบ้านอุ่นเครื่องปรีซีซั่นพบกับ ${oppClub.name} (${simRes.homeGoals}-${simRes.awayGoals}) สร้างรายได้เข้าสโมสร €${(gateReceipts / 1_000_000).toFixed(2)}M พร้อมเพิ่มความเฉียบคม (Match Sharpness) +${sharpnessBoost}% และความเข้าใจแผน +4%`
          ),
          isRead: false,
          relatedClubId: oppClub.id,
        },
        ...state.inbox,
      ],
    },
    scoreline,
    gateReceipts,
    sharpnessBoost,
    message: trText(
      `Friendly Complete (${scoreline})! Earned €${(gateReceipts / 1_000_000).toFixed(2)}M gate receipts & +${sharpnessBoost}% Match Sharpness across the squad!`,
      `จบเกมกระชับมิตร (${scoreline})! รับค่าตั๋ว €${(gateReceipts / 1_000_000).toFixed(2)}M และเพิ่มความเฉียบคมทั้งทีม +${sharpnessBoost}%!`
    ),
  };
}

/**
 * Stage 5 Pillar 5.2: Simulate U21 Youth & Reserves League Matchday
 */
export function simulateU21YouthAndReservesMatchday(state: WorldState): {
  nextState: WorldState;
  scoreline: string;
  motmPlayerId: string;
  motmPlayerName: string;
  participantsCount: number;
  message: string;
} {
  const myClub = state.clubs[state.controlledClubId];
  const reserveSquadPlayers = Object.values(state.players).filter(
    (p) =>
      p.clubId === myClub.id &&
      !p.injuryStatus.isInjured &&
      (p.playInReserves ||
        p.isYouthAcademy ||
        p.squadStatus === 'Youth' ||
        getAgeAtDate(p.dateOfBirth, state.gameDate) <= 21)
  );

  const participants = reserveSquadPlayers;

  const rng = new SeededRNG(state.randomSeed + state.inbox.length * 41 + 99);
  const myGoals = rng.int(1, 4);
  const oppGoals = rng.int(0, 2);

  const attackers = participants.filter((p) => p.positions[0] !== 'GK');
  const pool = attackers.length > 0 ? attackers : participants;
  const motm =
    pool.sort((a, b) => b.potentialAbility - a.potentialAbility)[0] ||
    Object.values(state.players).find((p) => p.clubId === myClub.id)!;

  const updatedPlayers: Record<string, Player> = { ...state.players };

  for (const rp of reserveSquadPlayers) {
    const isMotm = rp.id === motm.id;
    const scored = isMotm ? 1 : rng.chance(0.22) ? 1 : 0;
    const assisted = rng.chance(0.25) ? 1 : 0;
    const newApps = rp.stats.appearances + 1;
    const matchRating = isMotm ? 8.5 : 7.15;
    const newAvg = Number(
      ((rp.stats.averageRating * rp.stats.appearances + matchRating) / newApps).toFixed(2)
    );
    updatedPlayers[rp.id] = {
      ...rp,
      currentAbility: isMotm
        ? Math.min(rp.potentialAbility, rp.currentAbility + 1)
        : rp.currentAbility,
      matchSharpness: Math.min(100, rp.matchSharpness + 5),
      morale: Math.min(100, rp.morale + 3),
      stats: {
        ...rp.stats,
        appearances: newApps,
        starts: rp.stats.starts + 1,
        goals: rp.stats.goals + scored,
        assists: rp.stats.assists + assisted,
        minutesPlayed: rp.stats.minutesPlayed + 90,
        averageRating: newAvg,
        manOfTheMatch: rp.stats.manOfTheMatch + (isMotm ? 1 : 0),
      },
    };
  }

  const scoreline = `${myClub.shortName} U21 ${myGoals} - ${oppGoals} Premier U21 XI`;
  const motmName = `${motm.firstName} ${motm.lastName}`;

  return {
    nextState: {
      ...state,
      players: updatedPlayers,
      inbox: [
        {
          id: `news_u21_${Date.now()}`,
          gameDate: state.gameDate,
          category: 'Staff',
          title: trText(
            `U21 Youth League: ${scoreline} — ${motmName} Named MOTM (+1 CA Growth!)`,
            `ผลลีกเยาวชน U21: ${scoreline} — ${motmName} คว้า Man of the Match (+1 CA!)`
          ),
          body: trText(
            `Your U21 & Reserves squad recorded a ${myGoals}-${oppGoals} victory (${participants.length} players featured, +5% Match Sharpness). Standout prospect ${motmName} earned an 8.60 rating and gained +1 Current Ability!`,
            `ทีมเยาวชน U21 และทีมสำรองของคุณคว้าชัยชนะ ${myGoals}-${oppGoals} (นักเตะลงสนาม ${participants.length} คน, ความเฉียบคม +5%) โดย ${motmName} โชว์ฟอร์มยอดเยี่ยมคว้าเรตติ้ง 8.60 พร้อมอัปเกรดค่าพลังแฝงปัจจุบัน +1 CA!`
          ),
          isRead: false,
          relatedPlayerId: motm.id,
          relatedClubId: myClub.id,
        },
        ...state.inbox,
      ],
    },
    scoreline,
    motmPlayerId: motm.id,
    motmPlayerName: motmName,
    participantsCount: Math.max(1, participants.length),
    message: trText(
      `U21 Match Complete (${scoreline})! ${motmName} named MOTM (+1 CA) & all U21/Reserve players gained +5% Sharpness!`,
      `จำลองลีก U21 สำเร็จ (${scoreline})! ${motmName} คว้า MOTM (+1 CA) และดาวรุ่งทุกคนได้รับความเฉียบคม +5%!`
    ),
  };
}

/**
 * Stage 7 Phase 2: Transfer Deadline Day Hourly Countdown (08:00 – 23:00)
 * - Advances the Deadline Day clock by +2 Hours (08:00 -> 10:00 -> ... -> 23:00)
 * - Generates a live European Breaking Transfer Ticker headline
 * - Selects a Flash Deal (-35% asking price) bargain player
 * - Triggers occasional AI last-minute loan/transfer bids for user fringe players
 */
export function advanceDeadlineDayTwoHours(state: WorldState): {
  nextState: WorldState;
  currentHour: number;
  hoursRemaining: number;
  tickerHeadline: string;
  flashDealPlayerId: string | null;
  windowClosed: boolean;
  message: string;
} {
  const prevHour = typeof state.deadlineHour === 'number' ? state.deadlineHour : 8;
  const rng = new SeededRNG(state.randomSeed + prevHour * 97 + state.transferOffers.length * 31);
  const myClub = state.clubs[state.controlledClubId];

  // If already at 23:00, close the window and advance to next day (resetting deadlineHour to 8)
  if (prevHour >= 23) {
    const advancedDay = advanceWorldOneDay(state);
    const closedHeadline = trText(
      `🔔 [23:00 CET] OFFICIAL: The European Transfer Window has slammed shut! All late registrations ratified.`,
      `🔔 [23:00 CET] ปิดตลาดซื้อขายนักเตะยุโรปอย่างเป็นทางการ! ดีลนาทีสุดท้ายทั้งหมดได้รับการขึ้นทะเบียนเรียบร้อย`
    );
    return {
      nextState: {
        ...advancedDay.nextState,
        deadlineHour: 8,
        deadlineFlashDealPlayerId: null,
        deadlineTickerHeadlines: [
          closedHeadline,
          ...(state.deadlineTickerHeadlines || []).slice(0, 5),
        ],
      },
      currentHour: 23,
      hoursRemaining: 0,
      tickerHeadline: closedHeadline,
      flashDealPlayerId: null,
      windowClosed: true,
      message: closedHeadline,
    };
  }

  const nextHour = Math.min(23, prevHour + 2);
  const hoursRemaining = Math.max(0, 23 - nextHour);

  // Pick a Flash Deal (-35% Asking Price) candidate from external transfer-listed or high-CA players
  const externalCandidates = Object.values(state.players)
    .filter((p) => p.clubId !== myClub.id && (p.transferListed || p.currentAbility >= 145))
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 24);

  const flashPlayer =
    externalCandidates[Math.abs(prevHour + state.transferOffers.length) % Math.max(1, externalCandidates.length)] ||
    null;

  const updatedPlayers: Record<string, Player> = { ...state.players };
  if (flashPlayer) {
    const flashDiscountPrice = Math.max(
      500_000,
      Math.round((flashPlayer.marketValue * 0.65) / 100_000) * 100_000
    );
    updatedPlayers[flashPlayer.id] = {
      ...flashPlayer,
      transferListed: true,
      askingPrice: flashDiscountPrice,
    };
  }

  // Generate a realistic European Breaking Transfer Ticker headline
  const otherClubs = Object.values(state.clubs).filter((c) => c.id !== myClub.id && c.reputation >= 78);
  const buyerA = rng.pick(otherClubs) || myClub;
  const sellerB = rng.pick(otherClubs.filter((c) => c.id !== buyerA.id)) || myClub;
  const feeM = (rng.int(18, 72) + 0.5).toFixed(1);
  const hourStr = `${String(nextHour).padStart(2, '0')}:00`;

  const tickerHeadline = flashPlayer
    ? trText(
        `⚡ [${hourStr} CET] FLASH DEAL (-35%): ${flashPlayer.firstName} ${flashPlayer.lastName} (${state.clubs[flashPlayer.clubId]?.shortName || 'EU'}) offered by agent for €${((flashPlayer.marketValue * 0.65) / 1_000_000).toFixed(1)}M · ${buyerA.shortName} in advanced talks with ${sellerB.shortName} (€${feeM}M)!`,
        `⚡ [${hourStr} CET] ดีลด่วนลดราคา -35%: เอเย่นต์เร่ขาย ${flashPlayer.firstName} ${flashPlayer.lastName} เหลือเพียง €${((flashPlayer.marketValue * 0.65) / 1_000_000).toFixed(1)}M · ${buyerA.shortName} เปิดโต๊ะเจรจาคว้าแข้ง ${sellerB.shortName} (€${feeM}M)!`
      )
    : trText(
        `⚡ [${hourStr} CET] BREAKING: ${buyerA.name} submit €${feeM}M deadline bid to ${sellerB.name} (${hoursRemaining}h remaining)!`,
        `⚡ [${hourStr} CET] ข่าวด่วนตลาดซื้อขาย: ${buyerA.name} ยื่นข้อเสนอ €${feeM}M ให้ ${sellerB.name} (เหลือเวลาอีก ${hoursRemaining} ชม.)!`
      );

  // Occasionally generate a last-minute AI bid for one of user's squad/fringe players
  const updatedOffers = [...state.transferOffers];
  const updatedInbox = [...state.inbox];
  const mySquad = Object.values(updatedPlayers).filter((p) => p.clubId === myClub.id);
  const fringePool = mySquad.filter(
    (p) => p.transferListed || p.loanListed || p.squadStatus === 'Squad Player' || p.squadStatus === 'Breakthrough Prospect'
  );
  const targetUserPlayer = fringePool.length > 0 ? rng.pick(fringePool) : mySquad[0];

  if (targetUserPlayer && otherClubs.length > 0 && (nextHour === 12 || nextHour === 18 || nextHour === 22)) {
    const biddingClub = rng.pick(otherClubs);
    const panicFee = Math.max(
      1_500_000,
      Math.round((targetUserPlayer.marketValue * 1.15) / 250_000) * 250_000
    );
    const offerId = `off_dd_${state.gameDate}_${nextHour}_${targetUserPlayer.id}`;
    const newOffer: TransferOffer = {
      id: offerId,
      date: state.gameDate,
      playerId: targetUserPlayer.id,
      buyingClubId: biddingClub.id,
      sellingClubId: myClub.id,
      offerType: 'Transfer',
      upfrontFee: panicFee,
      installmentsFee: 0,
      sellOnPercentage: 10,
      proposedWagePerWeek: Math.round(targetUserPlayer.wagePerWeek * 1.2),
      proposedContractYears: 4,
      proposedSquadStatus: 'Important Player',
      signingBonus: 500_000,
      agentFee: 250_000,
      status: 'PendingClub',
    };
    updatedOffers.unshift(newOffer);
    updatedInbox.unshift({
      id: `news_dd_bid_${offerId}`,
      gameDate: state.gameDate,
      category: 'Transfer',
      title: trText(
        `⏰ [${hourStr}] Deadline Panic Bid: ${biddingClub.name} offer €${(panicFee / 1_000_000).toFixed(2)}M for ${targetUserPlayer.firstName} ${targetUserPlayer.lastName}!`,
        `⏰ [${hourStr}] ข้อเสนอนาทีสุดท้าย: ${biddingClub.name} ยื่นซื้อ ${targetUserPlayer.firstName} ${targetUserPlayer.lastName} ราคา €${(panicFee / 1_000_000).toFixed(2)}M!`
      ),
      body: trText(
        `With only ${hoursRemaining} hours left before the window closes, ${biddingClub.name} have tabled an urgent €${(panicFee / 1_000_000).toFixed(2)}M offer (1.15x market value) for ${targetUserPlayer.firstName} ${targetUserPlayer.lastName}.`,
        `เหลือเวลาเพียง ${hoursRemaining} ชั่วโมงก่อนปิดตลาด ${biddingClub.name} ได้ยื่นข้อเสนอด่วน €${(panicFee / 1_000_000).toFixed(2)}M (1.15 เท่าของราคาตลาด) เพื่อขอซื้อ ${targetUserPlayer.firstName} ${targetUserPlayer.lastName}`
      ),
      isRead: false,
      isImportant: true,
      relatedClubId: biddingClub.id,
      relatedPlayerId: targetUserPlayer.id,
      actionType: 'GoToTransfer',
    });
  }

  let nextDeadlineState: WorldState = {
    ...state,
    players: updatedPlayers,
    transferOffers: updatedOffers,
    inbox: updatedInbox,
    deadlineHour: nextHour,
    deadlineFlashDealPlayerId: flashPlayer?.id || null,
    deadlineTickerHeadlines: [
      tickerHeadline,
      ...(state.deadlineTickerHeadlines || []).slice(0, 11),
    ],
  };

  let finalHeadline = tickerHeadline;
  if (nextHour === 14 || nextHour === 20) {
    const aiTick = simulateAiToAiTransferWindowTick(nextDeadlineState, true);
    if (aiTick.completedDeal) {
      nextDeadlineState = aiTick.nextState;
      finalHeadline = aiTick.message;
    }
  }

  return {
    nextState: nextDeadlineState,
    currentHour: nextHour,
    hoursRemaining,
    tickerHeadline: finalHeadline,
    flashDealPlayerId: flashPlayer?.id || null,
    windowClosed: false,
    message: finalHeadline,
  };
}

/**
 * Stage 16 Phase 4: Check whether a player's contract expires within maxMonths (default 12 months)
 */
export function isContractExpiringSoon(
  contractEndDate: string | undefined,
  gameDate: string,
  maxMonths = 12
): boolean {
  if (!contractEndDate) return false;
  const endYear = parseInt(contractEndDate.slice(0, 4), 10);
  const endMonth = parseInt(contractEndDate.slice(5, 7), 10) || 6;
  const curYear = parseInt(gameDate.slice(0, 4), 10);
  const curMonth = parseInt(gameDate.slice(5, 7), 10) || 7;
  if (Number.isNaN(endYear) || Number.isNaN(curYear)) return false;
  const monthsRemaining = (endYear - curYear) * 12 + (endMonth - curMonth);
  return monthsRemaining <= maxMonths;
}

/**
 * Stage 16 Phase 4: January 1st Bosman Contract Expiry Alert from Assistant Manager
 */
export function generateBosmanContractExpiryAlert(state: WorldState): {
  nextState: WorldState;
  expiringPlayers: Player[];
  alertCreated: boolean;
} {
  const myClub = state.clubs[state.controlledClubId];
  if (!myClub) {
    return { nextState: state, expiringPlayers: [], alertCreated: false };
  }

  const currentYear = parseInt(state.gameDate.slice(0, 4), 10) || 2026;
  const myOwnedPlayers = Object.values(state.players).filter(
    (p) => p.clubId === myClub.id && !p.loanedFromClubId
  );

  // Critical Bosman risk (<= 6 months left, expiring this summer) first, fallback to <= 1 year window
  const criticalBosman = myOwnedPlayers.filter((p) => {
    const endYear = parseInt((p.contractEndDate || '2028-06-30').slice(0, 4), 10) || 2028;
    return endYear <= currentYear;
  });

  const expiringPlayers = (
    criticalBosman.length > 0
      ? criticalBosman
      : myOwnedPlayers.filter((p) => {
          const endYear = parseInt((p.contractEndDate || '2028-06-30').slice(0, 4), 10) || 2028;
          return endYear - currentYear <= 1;
        })
  ).sort((a, b) => b.currentAbility - a.currentAbility);

  if (expiringPlayers.length === 0) {
    return { nextState: state, expiringPlayers: [], alertCreated: false };
  }

  const alertId = `news_bosman_alert_${state.gameDate}_${myClub.id}`;
  if (state.inbox.some((n) => n.id === alertId)) {
    return { nextState: state, expiringPlayers, alertCreated: false };
  }

  const topNames = expiringPlayers
    .slice(0, 6)
    .map(
      (p) =>
        `${p.firstName} ${p.lastName} (${p.positions[0]}, expires ${p.contractEndDate})`
    )
    .join(', ');
  const extraCount = Math.max(0, expiringPlayers.length - 6);
  const extraSuffixEn = extraCount > 0 ? ` and ${extraCount} more.` : '.';
  const extraSuffixTh = extraCount > 0 ? ` และอีก ${extraCount} ราย` : '';

  const isImmediateBosman = criticalBosman.length > 0;
  const alertItem: NewsItem = {
    id: alertId,
    gameDate: state.gameDate,
    category: 'Transfer',
    title: trText(
      isImmediateBosman
        ? `⚠️ Bosman Risk Alert: ${expiringPlayers.length} ${myClub.shortName} Player(s) Entering Final 6 Months of Contract`
        : `Contract Expiry Review: ${expiringPlayers.length} ${myClub.shortName} Player(s) Entering Final Year`,
      isImmediateBosman
        ? `⚠️ แจ้งเตือนด่วนกฎ Bosman: นักเตะ ${myClub.shortName} ${expiringPlayers.length} รายเหลือสัญญา 6 เดือนสุดท้าย!`
        : `รายงานสัญญาใกล้หมด: นักเตะ ${myClub.shortName} ${expiringPlayers.length} รายเหลือสัญญาไม่เกิน 1 ปี`
    ),
    body: trText(
      `Assistant Manager Report (${state.gameDate}): Foreign clubs can now approach players in the final 6 months of their deals on pre-contract Bosman free transfers. Priority renewals needed for: ${topNames}${extraSuffixEn} Open Squad > Expiring (<1 Yr) to negotiate extensions immediately.`,
      `รายงานด่วนจากผู้ช่วยผู้จัดการทีม (${state.gameDate}): ตลาดมกราคมเปิดแล้วและสโมสรคู่แข่งสามารถยื่นเซ็นฟรีล่วงหน้าตามกฎ Bosman ได้ทันที แนะนำให้เร่งต่อสัญญา: ${topNames}${extraSuffixTh} ไปที่หน้าขุมกำลัง > ตัวกรอง สัญญาใกล้หมด (<1 ปี) เพื่อเปิดโต๊ะเจรจา`
    ),
    isRead: false,
    isImportant: true,
    relatedClubId: myClub.id,
    relatedPlayerId: expiringPlayers[0]?.id,
    actionType: 'GoToTransfer',
  };

  return {
    nextState: {
      ...state,
      inbox: [alertItem, ...state.inbox],
    },
    expiringPlayers,
    alertCreated: true,
  };
}

/**
 * Stage 16 Phase 2: Autonomous AI-to-AI Transfer Market Tick
 * Runs during open transfer windows (Jul, Aug, Jan) or on Deadline Day to keep the 394-club world alive.
 */
export function simulateAiToAiTransferWindowTick(
  state: WorldState,
  forceDeal = false
): { nextState: WorldState; completedDeal: TransferOffer | null; message: string } {
  const month = parseInt(state.gameDate.slice(5, 7), 10) || 7;
  const isTransferWindow = month === 7 || month === 8 || month === 1;
  if (!isTransferWindow && !forceDeal) {
    return { nextState: state, completedDeal: null, message: 'Transfer window closed.' };
  }

  const rng = new SeededRNG(
    state.randomSeed + state.processedDates.length * 131 + state.transferOffers.length * 19 + 17
  );
  const aiBuyerCandidates = Object.values(state.clubs).filter(
    (c) =>
      c.id !== state.controlledClubId &&
      c.reputation >= 74 &&
      c.finances.transferBudget >= 18_000_000
  );
  if (aiBuyerCandidates.length === 0) {
    return { nextState: state, completedDeal: null, message: 'No eligible AI buyers.' };
  }

  // Count players per club to avoid depleting any selling club below 16 players
  const clubSquadCounts = new Map<string, number>();
  for (const pl of Object.values(state.players)) {
    clubSquadCounts.set(pl.clubId, (clubSquadCounts.get(pl.clubId) || 0) + 1);
  }

  // Try up to 4 candidate buyers to guarantee a clean realistic match
  const shuffledBuyers = [...aiBuyerCandidates].sort(() => rng.next() - 0.5).slice(0, 4);

  for (const rawBuyer of shuffledBuyers) {
    const buyerClub = { ...rawBuyer };
    const maxFee = Math.min(buyerClub.finances.transferBudget * 0.85, 85_000_000);
    const minTargetCa = Math.max(132, Math.round(buyerClub.reputation * 1.72));

    // Detect weakest position slot in buyer's starting XI so AI upgrades real tactical needs
    let weakestPos: PositionCode | null = null;
    let lowestSlotCa = 999;
    for (const slot of buyerClub.primaryTactic.lineup) {
      const slotPlayer = slot.playerId ? state.players[slot.playerId] : null;
      const slotCa = slotPlayer ? slotPlayer.currentAbility : 0;
      if (slotCa < lowestSlotCa) {
        lowestSlotCa = slotCa;
        weakestPos = slot.position;
      }
    }

    const baseTargetPool = Object.values(state.players).filter(
      (p) =>
        p.clubId !== state.controlledClubId &&
        p.clubId !== buyerClub.id &&
        (clubSquadCounts.get(p.clubId) || 0) > 16 &&
        !p.loanedFromClubId &&
        !p.injuryStatus.isInjured &&
        p.currentAbility >= minTargetCa &&
        p.askingPrice > 0 &&
        p.askingPrice <= maxFee &&
        (p.transferListed || (state.clubs[p.clubId]?.reputation || 70) <= buyerClub.reputation - 2)
    );

    if (baseTargetPool.length === 0) continue;

    const positionalMatches = weakestPos
      ? baseTargetPool.filter((p) => p.positions.includes(weakestPos!))
      : [];
    const targetPool = positionalMatches.length > 0 ? positionalMatches : baseTargetPool;
    const targetPlayer = rng.pick(targetPool);
    const sellingClubRaw = state.clubs[targetPlayer.clubId];
    if (!sellingClubRaw) continue;
    const sellingClub = { ...sellingClubRaw };

    const isLoanDeal = !forceDeal && targetPlayer.loanListed && rng.chance(0.35);
    const agreedFee = isLoanDeal
      ? 0
      : Math.max(
          2_500_000,
          Math.min(
            buyerClub.finances.transferBudget,
            Math.round((targetPlayer.marketValue * 1.05) / 100_000) * 100_000
          )
        );
    const newWage = isLoanDeal ? targetPlayer.wagePerWeek : Math.round(targetPlayer.wagePerWeek * 1.12);
    const endYear = (parseInt(state.gameDate.slice(0, 4), 10) || 2025) + 4;
    const optionToBuyFee = isLoanDeal
      ? Math.round((targetPlayer.marketValue * 1.15) / 100_000) * 100_000
      : null;

    buyerClub.finances = {
      ...buyerClub.finances,
      balance: buyerClub.finances.balance - agreedFee,
      transferBudget: Math.max(0, buyerClub.finances.transferBudget - agreedFee),
      wageUsedPerWeek: buyerClub.finances.wageUsedPerWeek + newWage,
    };
    sellingClub.finances = {
      ...sellingClub.finances,
      balance: sellingClub.finances.balance + agreedFee,
      transferBudget: sellingClub.finances.transferBudget + Math.round(agreedFee * 0.8),
      wageUsedPerWeek: Math.max(0, sellingClub.finances.wageUsedPerWeek - targetPlayer.wagePerWeek),
    };

    const updatedPlayer: Player = {
      ...targetPlayer,
      clubId: buyerClub.id,
      loanedFromClubId: isLoanDeal ? sellingClub.id : null,
      loanOptionToBuyFee: optionToBuyFee,
      wagePerWeek: newWage,
      contractEndDate: isLoanDeal ? targetPlayer.contractEndDate : `${endYear}-06-30`,
      transferListed: false,
      loanListed: false,
      transferHistory: [
        {
          date: state.gameDate,
          fromClubId: sellingClub.id,
          toClubId: buyerClub.id,
          fee: agreedFee,
          type: isLoanDeal ? 'Loan' : 'Transfer',
        },
        ...targetPlayer.transferHistory,
      ],
    };

    const updatedPlayers: Record<string, Player> = {
      ...state.players,
      [updatedPlayer.id]: updatedPlayer,
    };

    const buyerSquad = Object.values(updatedPlayers).filter((p) => p.clubId === buyerClub.id);
    const sellerSquad = Object.values(updatedPlayers).filter((p) => p.clubId === sellingClub.id);
    if (buyerSquad.length >= 11) {
      buyerClub.primaryTactic = autoPickLineup(
        buyerClub.primaryTactic.formation,
        buyerSquad,
        buyerClub.primaryTactic.instructions,
        buyerClub.primaryTactic.id,
        buyerClub.primaryTactic.name
      );
    }
    if (sellerSquad.length >= 11) {
      sellingClub.primaryTactic = autoPickLineup(
        sellingClub.primaryTactic.formation,
        sellerSquad,
        sellingClub.primaryTactic.instructions,
        sellingClub.primaryTactic.id,
        sellingClub.primaryTactic.name
      );
    }

    const aiOffer: TransferOffer = {
      id: `off_ai_${state.gameDate}_${targetPlayer.id}_${buyerClub.id}`,
      date: state.gameDate,
      playerId: targetPlayer.id,
      buyingClubId: buyerClub.id,
      sellingClubId: sellingClub.id,
      offerType: isLoanDeal ? 'Loan' : 'Transfer',
      upfrontFee: agreedFee,
      installmentsFee: 0,
      sellOnPercentage: 0,
      loanOptionToBuyFee: optionToBuyFee ?? undefined,
      proposedWagePerWeek: newWage,
      proposedContractYears: isLoanDeal ? 1 : 4,
      proposedSquadStatus: 'Important Player',
      signingBonus: isLoanDeal ? 0 : Math.round(newWage * 2),
      agentFee: isLoanDeal ? 0 : Math.round(newWage * 1.5),
      status: 'Completed',
    };

    const headlineEn = isLoanDeal
      ? `🌍 WORLD TRANSFER: ${buyerClub.name} sign ${targetPlayer.firstName} ${targetPlayer.lastName} on loan from ${sellingClub.name}!`
      : `🌍 WORLD TRANSFER: ${buyerClub.name} sign ${targetPlayer.firstName} ${targetPlayer.lastName} from ${sellingClub.name} for €${(agreedFee / 1_000_000).toFixed(2)}M!`;
    const headlineTh = isLoanDeal
      ? `🌍 ตลาดลูกหนังโลก: ${buyerClub.name} ยืมตัว ${targetPlayer.firstName} ${targetPlayer.lastName} จาก ${sellingClub.name}!`
      : `🌍 ตลาดลูกหนังโลก: ${buyerClub.name} ปิดดีลคว้า ${targetPlayer.firstName} ${targetPlayer.lastName} จาก ${sellingClub.name} ค่าตัว €${(agreedFee / 1_000_000).toFixed(2)}M!`;

    return {
      nextState: {
        ...state,
        players: updatedPlayers,
        clubs: {
          ...state.clubs,
          [buyerClub.id]: buyerClub,
          [sellingClub.id]: sellingClub,
        },
        transferOffers: [aiOffer, ...state.transferOffers],
        deadlineTickerHeadlines: [
          trText(headlineEn, headlineTh),
          ...(state.deadlineTickerHeadlines || []),
        ].slice(0, 12),
        inbox: [
          {
            id: `news_ai_trf_${aiOffer.id}`,
            gameDate: state.gameDate,
            category: 'Transfer',
            title: trText(headlineEn, headlineTh),
            body: isLoanDeal
              ? trText(
                  `${buyerClub.name} have finalized a season-long loan deal for ${targetPlayer.firstName} ${targetPlayer.lastName} (${targetPlayer.positions.join('/')}, CA ${(targetPlayer.currentAbility / 10).toFixed(1)}) from ${sellingClub.name} with a €${((optionToBuyFee || 0) / 1_000_000).toFixed(1)}M option to buy.`,
                  `${buyerClub.name} บรรลุข้อตกลงยืมตัว ${targetPlayer.firstName} ${targetPlayer.lastName} (${targetPlayer.positions.join('/')}, CA ${(targetPlayer.currentAbility / 10).toFixed(1)}) จาก ${sellingClub.name} จนจบฤดูกาล พร้อมออปชันซื้อขาด €${((optionToBuyFee || 0) / 1_000_000).toFixed(1)}M`
                )
              : trText(
                  `${buyerClub.name} have completed the €${(agreedFee / 1_000_000).toFixed(2)}M signing of ${targetPlayer.firstName} ${targetPlayer.lastName} (${targetPlayer.positions.join('/')}, CA ${(targetPlayer.currentAbility / 10).toFixed(1)}) from ${sellingClub.name} on a contract until ${endYear}.`,
                  `${buyerClub.name} บรรลุข้อตกลงคว้าตัว ${targetPlayer.firstName} ${targetPlayer.lastName} (${targetPlayer.positions.join('/')}, CA ${(targetPlayer.currentAbility / 10).toFixed(1)}) จาก ${sellingClub.name} ด้วยค่าตัว €${(agreedFee / 1_000_000).toFixed(2)}M สัญญาถึงปี ${endYear}`
                ),
            isRead: false,
            relatedClubId: buyerClub.id,
            relatedPlayerId: targetPlayer.id,
          },
          ...state.inbox,
        ],
      },
      completedDeal: aiOffer,
      message: trText(headlineEn, headlineTh),
    };
  }

  return { nextState: state, completedDeal: null, message: 'No matching AI transfer targets.' };
}

/**
 * Stage 7 Phase 4.1: Live Season Ballon d'Or & Golden Boy (U21) Power Rankings
 */
export interface LiveAwardContender {
  rank: number;
  playerId: string;
  playerName: string;
  clubId: string;
  clubName: string;
  age: number;
  ca: number;
  pa: number;
  goals: number;
  assists: number;
  averageRating: number;
  powerScore: number;
}

export function getLiveBallonDorAndGoldenBoyRace(state: WorldState): {
  ballonDorTop5: LiveAwardContender[];
  goldenBoyTop5: LiveAwardContender[];
} {
  const allPlayers = Object.values(state.players);

  const scorePlayer = (p: Player): number => {
    const clubRep = state.clubs[p.clubId]?.reputation || 70;
    const ratingBonus = Math.max(0, (p.stats.averageRating - 6.5) * 32);
    return Number(
      (
        p.currentAbility * 0.85 +
        p.stats.goals * 4.2 +
        p.stats.assists * 2.8 +
        p.stats.manOfTheMatch * 3.5 +
        ratingBonus +
        clubRep * 0.25
      ).toFixed(1)
    );
  };

  const ballonDorTop5: LiveAwardContender[] = [...allPlayers]
    .sort((a, b) => scorePlayer(b) - scorePlayer(a))
    .slice(0, 5)
    .map((p, idx) => ({
      rank: idx + 1,
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId,
      clubName: state.clubs[p.clubId]?.name || 'Club',
      age: getAgeAtDate(p.dateOfBirth, state.gameDate),
      ca: p.currentAbility,
      pa: p.potentialAbility,
      goals: p.stats.goals,
      assists: p.stats.assists,
      averageRating: p.stats.averageRating || 7.1,
      powerScore: scorePlayer(p),
    }));

  const goldenBoyTop5: LiveAwardContender[] = allPlayers
    .filter((p) => getAgeAtDate(p.dateOfBirth, state.gameDate) <= 21)
    .sort((a, b) => scorePlayer(b) + b.potentialAbility * 0.25 - (scorePlayer(a) + a.potentialAbility * 0.25))
    .slice(0, 5)
    .map((p, idx) => ({
      rank: idx + 1,
      playerId: p.id,
      playerName: `${p.firstName} ${p.lastName}`,
      clubId: p.clubId,
      clubName: state.clubs[p.clubId]?.name || 'Club',
      age: getAgeAtDate(p.dateOfBirth, state.gameDate),
      ca: p.currentAbility,
      pa: p.potentialAbility,
      goals: p.stats.goals,
      assists: p.stats.assists,
      averageRating: p.stats.averageRating || 7.05,
      powerScore: scorePlayer(p),
    }));

  return { ballonDorTop5, goldenBoyTop5 };
}

/**
 * Stage 7 Phase 4.2: All-Time Club Records Book
 */
export interface ClubAllTimeRecords {
  clubId: string;
  clubName: string;
  biggestVictory: {
    scoreline: string;
    opponentName: string;
    date: string;
  };
  topGoalscorer: {
    playerId: string;
    playerName: string;
    goals: number;
    appearances: number;
  };
  highestRatedPlayer: {
    playerId: string;
    playerName: string;
    averageRating: number;
    appearances: number;
  };
  recordSigning: {
    playerName: string;
    fee: number;
    fromClubName: string;
  };
  recordSale: {
    playerName: string;
    fee: number;
    toClubName: string;
  };
}

export function getClubAllTimeRecords(
  state: WorldState,
  targetClubId?: string
): ClubAllTimeRecords {
  const clubId = targetClubId || state.controlledClubId;
  const club = state.clubs[clubId] || state.clubs[state.controlledClubId];
  const clubPlayers = Object.values(state.players).filter((p) => p.clubId === club.id);

  // 1. Biggest Victory from completed fixtures
  const completedClubFixtures = state.fixtures.filter(
    (f) => f.status === 'Completed' && f.result && (f.homeClubId === club.id || f.awayClubId === club.id)
  );
  let bestMargin = -1;
  let bestGoalsFor = -1;
  let biggestVictory = {
    scoreline: `${club.shortName} 4 - 0 Rival XI`,
    opponentName: 'Historic League Record',
    date: '2024/25',
  };

  for (const fx of completedClubFixtures) {
    if (!fx.result) continue;
    const isHome = fx.homeClubId === club.id;
    const gf = isHome ? fx.result.homeGoals : fx.result.awayGoals;
    const ga = isHome ? fx.result.awayGoals : fx.result.homeGoals;
    const margin = gf - ga;
    if (margin > 0 && (margin > bestMargin || (margin === bestMargin && gf > bestGoalsFor))) {
      bestMargin = margin;
      bestGoalsFor = gf;
      const oppClub = state.clubs[isHome ? fx.awayClubId : fx.homeClubId];
      biggestVictory = {
        scoreline: `${club.shortName} ${gf} - ${ga} ${oppClub?.shortName || 'OPP'}`,
        opponentName: oppClub?.name || 'Opponent',
        date: fx.kickoffDate,
      };
    }
  }

  // 2. Top Goalscorer (combines current season + archived club career records such as 2024/25)
  const getClubCareerGoalSummary = (p: Player) => {
    const clubHistory = (p.careerSeasonHistory || []).filter((h) => h.clubId === club.id);
    const histGoals = clubHistory.reduce((s, h) => s + h.goals, 0);
    const histApps = clubHistory.reduce((s, h) => s + h.appearances, 0);
    return {
      goals: p.stats.goals + histGoals,
      appearances: p.stats.appearances + histApps,
    };
  };

  const sortedByGoals = [...clubPlayers].sort((a, b) => {
    const sa = getClubCareerGoalSummary(a);
    const sb = getClubCareerGoalSummary(b);
    return sb.goals - sa.goals || b.currentAbility - a.currentAbility;
  });
  const topScorerPlayer = sortedByGoals[0];
  const topScorerSummary = topScorerPlayer ? getClubCareerGoalSummary(topScorerPlayer) : null;
  const topGoalscorer =
    topScorerPlayer && topScorerSummary
      ? {
          playerId: topScorerPlayer.id,
          playerName: `${topScorerPlayer.firstName} ${topScorerPlayer.lastName}`,
          goals:
            topScorerSummary.goals > 0
              ? topScorerSummary.goals
              : Math.round(topScorerPlayer.currentAbility / 12),
          appearances: Math.max(1, topScorerSummary.appearances),
        }
      : {
          playerId: '',
          playerName: 'Club Legend',
          goals: 18,
          appearances: 34,
        };

  // 3. Highest Rated Player (considers current season & 2024/25 club career rating)
  const getClubCareerRatingSummary = (p: Player) => {
    if (p.stats.appearances > 0 && p.stats.averageRating > 0) {
      return { rating: p.stats.averageRating, appearances: p.stats.appearances };
    }
    const clubHistory = (p.careerSeasonHistory || []).filter(
      (h) => h.clubId === club.id && h.appearances > 0
    );
    if (clubHistory.length > 0) {
      const best = [...clubHistory].sort((a, b) => b.averageRating - a.averageRating)[0];
      return { rating: best.averageRating, appearances: best.appearances };
    }
    return { rating: 0, appearances: 0 };
  };

  const sortedByRating = [...clubPlayers].sort((a, b) => {
    const ra = getClubCareerRatingSummary(a);
    const rb = getClubCareerRatingSummary(b);
    return rb.rating - ra.rating || b.currentAbility - a.currentAbility;
  });
  const topRatedPlayer = sortedByRating[0];
  const topRatedSummary = topRatedPlayer ? getClubCareerRatingSummary(topRatedPlayer) : null;
  const highestRatedPlayer =
    topRatedPlayer && topRatedSummary
      ? {
          playerId: topRatedPlayer.id,
          playerName: `${topRatedPlayer.firstName} ${topRatedPlayer.lastName}`,
          averageRating: Number((topRatedSummary.rating || 7.25).toFixed(2)),
          appearances: Math.max(1, topRatedSummary.appearances),
        }
      : {
          playerId: '',
          playerName: 'Club Captain',
          averageRating: 7.45,
          appearances: 30,
        };

  // 4. Record Signing & Record Sale from completed TransferOffers AND verified player transferHistory
  interface TransferFeeEntry {
    playerName: string;
    fee: number;
    counterpartClubName: string;
  }

  const signingEntries: TransferFeeEntry[] = [];
  const saleEntries: TransferFeeEntry[] = [];

  for (const o of state.transferOffers) {
    if (o.status !== 'Completed' || o.offerType !== 'Transfer') continue;
    const totalFee = o.upfrontFee + o.installmentsFee;
    if (totalFee <= 0) continue;
    const pl = state.players[o.playerId];
    const pName = pl ? `${pl.firstName} ${pl.lastName}` : 'Marquee Transfer';
    if (o.buyingClubId === club.id) {
      signingEntries.push({
        playerName: pName,
        fee: totalFee,
        counterpartClubName: state.clubs[o.sellingClubId]?.name || 'European Club',
      });
    }
    if (o.sellingClubId === club.id) {
      saleEntries.push({
        playerName: pName,
        fee: totalFee,
        counterpartClubName: state.clubs[o.buyingClubId]?.name || 'European Club',
      });
    }
  }

  for (const pl of Object.values(state.players)) {
    if (!pl.transferHistory || pl.transferHistory.length === 0) continue;
    const pName = `${pl.firstName} ${pl.lastName}`;
    for (const tr of pl.transferHistory) {
      if (tr.type !== 'Transfer' || tr.fee <= 0) continue;
      if (tr.toClubId === club.id) {
        signingEntries.push({
          playerName: pName,
          fee: tr.fee,
          counterpartClubName: state.clubs[tr.fromClubId]?.name || 'European Club',
        });
      }
      if (tr.fromClubId === club.id) {
        saleEntries.push({
          playerName: pName,
          fee: tr.fee,
          counterpartClubName: state.clubs[tr.toClubId]?.name || 'European Club',
        });
      }
    }
  }

  signingEntries.sort((a, b) => b.fee - a.fee);
  saleEntries.sort((a, b) => b.fee - a.fee);

  const mostValuablePlayer = [...clubPlayers].sort((a, b) => b.marketValue - a.marketValue)[0];

  const recordSigning = signingEntries[0]
    ? {
        playerName: signingEntries[0].playerName,
        fee: signingEntries[0].fee,
        fromClubName: signingEntries[0].counterpartClubName,
      }
    : {
        playerName: mostValuablePlayer
          ? `${mostValuablePlayer.firstName} ${mostValuablePlayer.lastName}`
          : 'Marquee Star',
        fee: mostValuablePlayer ? Math.round(mostValuablePlayer.marketValue * 0.92) : 45_000_000,
        fromClubName: 'Club Record Transfer',
      };

  const recordSale = saleEntries[0]
    ? {
        playerName: saleEntries[0].playerName,
        fee: saleEntries[0].fee,
        toClubName: saleEntries[0].counterpartClubName,
      }
    : {
        playerName: 'Historic Record Departure',
        fee: Math.max(18_000_000, Math.round(club.finances.transferBudget * 0.85)),
        toClubName: 'European Giant',
      };

  return {
    clubId: club.id,
    clubName: club.name,
    biggestVictory,
    topGoalscorer,
    highestRatedPlayer,
    recordSigning,
    recordSale,
  };
}





