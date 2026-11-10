import {
  Club,
  FinanceTransaction,
  Fixture,
  LeagueId,
  LeagueStanding,
  ManagerProfile,
  MatchResult,
  NewsItem,
  Player,
  PositionGroup,
  ScoutAssignment,
  ScoutReport,
  StaffMember,
  TransferOffer,
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
import { recomputeLeagueStandings } from './leagueEngine';
import { simulateMatch } from './matchEngine';
import { SeededRNG } from './random';
import { autoPickLineup, ROLES_BY_POSITION } from './tacticsEngine';
import {
  calculatePlayerValuation,
  computeCoherentCA,
  createInitialWorldState,
} from './worldGenerator';

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
    if (ev.eventType === 'Goal' && ev.playerId) {
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
  for (const [playerId, rating] of Object.entries(result.playerRatings)) {
    const p = updatedPlayers[playerId];
    if (!p) continue;

    const isHomePlayer = p.clubId === homeClub.id;
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

    const staminaDrain = Math.max(6, Math.round(16 - p.attributes.physical.stamina * 0.45));
    const newFitness = Math.max(45, p.fitness - staminaDrain);
    const moraleShift = teamWon ? 4 : teamDrew ? 0 : -4;
    const newMorale = Math.max(25, Math.min(100, p.morale + moraleShift));

    // Slight chance of post-match knock if fitness low
    let injuryStatus = { ...p.injuryStatus };
    if (!injuryStatus.isInjured && newFitness < 68 && rng.chance(0.06)) {
      const days = rng.int(5, 18);
      injuryStatus = {
        isInjured: true,
        type: rng.pick(['กล้ามเนื้อต้นขาตึง', 'ข้อเท้าแพลง', 'ฟกช้ำจากการปะทะ']),
        daysRemaining: days,
      };
      if (p.clubId === state.controlledClubId) {
        updatedInbox.unshift({
          id: `news_inj_${fixtureId}_${p.id}`,
          gameDate: state.gameDate,
          category: 'Injury',
          title: `รายงานแพทย์: ${p.firstName} ${p.lastName} บาดเจ็บพัก ${days} วัน`,
          body: `ทีมแพทย์ของ ${ state.clubs[p.clubId].name } ยืนยันว่า ${p.firstName} ${p.lastName} มีอาการ${injuryStatus.type}หลังจบเกมล่าสุด และต้องพักรักษาตัวประมาณ ${days} วัน`,
          isRead: false,
          relatedClubId: p.clubId,
          relatedPlayerId: p.id,
        });
      }
    }

    updatedPlayers[playerId] = {
      ...p,
      fitness: newFitness,
      matchSharpness: Math.min(100, p.matchSharpness + 4),
      morale: newMorale,
      injuryStatus,
      stats: {
        appearances: newApps,
        starts: p.stats.starts + 1,
        goals: p.stats.goals + (goalsByPlayer[playerId] || 0),
        assists: p.stats.assists + (assistsByPlayer[playerId] || 0),
        yellowCards: p.stats.yellowCards + (yellowsByPlayer[playerId] || 0),
        redCards: p.stats.redCards + (redsByPlayer[playerId] || 0),
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
      description: `รายได้บัตรผ่านประตูเกมเหย้าพบ ${awayClub.name} (${result.attendance.toLocaleString()} คน)`,
      balanceAfter: homeClub.finances.balance,
    });
  }

  // Recompute league standings
  const leagueId = existingFixture.competitionId as LeagueId;
  const updatedStandings = { ...state.standings };
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
      : 'ผู้เล่นยอดเยี่ยม';

    updatedInbox.unshift({
      id: `news_mrep_${fixtureId}`,
      gameDate: state.gameDate,
      category: 'Match Report',
      title: `สรุปผลหลังเกม: ${homeClub.name} ${result.homeGoals} - ${result.awayGoals} ${awayClub.name}`,
      body: `เกมนัดที่ ${existingFixture.matchday} จบลงด้วยสกอร์ ${homeClub.name} ${result.homeGoals}-${result.awayGoals} ${awayClub.name} (xG: ${result.homeStats.xG.toFixed(2)} - ${result.awayStats.xG.toFixed(2)}, ครองบอล ${result.homeStats.possession}% - ${result.awayStats.possession}%) โดย Man of the Match ได้แก่ ${motmName}`,
      isRead: false,
      relatedClubId: myClub.id,
      sourceEventId: fixtureId,
      pressConferenceOptions: [
        {
          id: 'post_praise',
          label: `ชื่นชมความทุ่มเทของลูกทีมทุกคนในเกมพบ ${oppClub.shortName}`,
          moraleDelta: 3,
          boardDelta: 1,
          mediaResponse: 'นักเตะในห้องแต่งตัวรู้สึกภูมิใจที่คุณออกโรงปกป้องและชื่นชมทีมต่อหน้าสื่อ',
        },
        {
          id: 'post_demand',
          label: 'เรายังมีรายละเอียดแท็กติกที่ต้องยกระดับขึ้นอีกในนัดต่อไป',
          moraleDelta: 0,
          boardDelta: 3,
          mediaResponse: 'บอร์ดบริหารและสื่อมองว่าคุณมีมาตรฐานสูงและไม่ประมาท',
        },
      ],
    });
  }

  return {
    ...state,
    gameDate:
      existingFixture.kickoffDate > state.gameDate
        ? existingFixture.kickoffDate
        : state.gameDate,
    fixtures: updatedFixtures,
    clubs: updatedClubs,
    players: updatedPlayers,
    standings: updatedStandings,
    transactions: updatedTransactions,
    inbox: updatedInbox,
    manager: updatedManager,
  };
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
  stoppedReason?: 'USER_MATCHDAY' | 'TRANSFER_OFFER';
  userFixture?: Fixture;
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
  const recoveryBonus = userClub.trainingFocus === 'Recovery' ? 6 : 0;
  const intensityDrain =
    userClub.trainingIntensity === 'Intense' ? -2 : userClub.trainingIntensity === 'Light' ? 2 : 0;

  for (const p of Object.values(updatedPlayers)) {
    let fitness = Math.min(100, p.fitness + 5 + recoveryBonus + intensityDrain);
    let injuryStatus = { ...p.injuryStatus };

    if (injuryStatus.isInjured) {
      const rem = injuryStatus.daysRemaining - 1;
      if (rem <= 0) {
        injuryStatus = { isInjured: false, daysRemaining: 0 };
        if (p.clubId === current.controlledClubId) {
          updatedInbox.unshift({
            id: `news_rec_${nextDate}_${p.id}`,
            gameDate: nextDate,
            category: 'Injury',
            title: `${p.firstName} ${p.lastName} หายเจ็บกลับมาซ้อมเต็มรูปแบบ`,
            body: `ข่าวดีสำหรับ ${userClub.name} เมื่อ ${p.firstName} ${p.lastName} ผ่านความฟิตจากทีมแพทย์และพร้อมกลับมาเป็นตัวเลือกในการจัดทัพ`,
            isRead: false,
            relatedClubId: p.clubId,
            relatedPlayerId: p.id,
          });
        }
      } else {
        injuryStatus.daysRemaining = rem;
      }
    }

    // Weekly training development on Mondays
    let attributes = p.attributes;
    let currentAbility = p.currentAbility;
    let developmentHistory = p.developmentHistory;

    if (isWeeklyTick && p.clubId === current.controlledClubId && !injuryStatus.isInjured) {
      const age = getAgeAtDate(p.dateOfBirth, nextDate);
      const devChance =
        age <= 21
          ? 0.28
          : age <= 25
            ? 0.18
            : age <= 29
              ? 0.08
              : 0.02;

      if (currentAbility < p.potentialAbility && rng.chance(devChance)) {
        const focus = p.individualTraining.attributeFocus;
        attributes = {
          technical: { ...p.attributes.technical },
          mental: { ...p.attributes.mental },
          physical: { ...p.attributes.physical },
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
          // Boost according to club trainingFocus
          if (userClub.trainingFocus === 'Attacking' && attributes.technical.finishing < 20) {
            attributes.technical.finishing += 1;
            changedAttr = 'finishing';
          } else if (userClub.trainingFocus === 'Defending' && attributes.technical.tackling < 20) {
            attributes.technical.tackling += 1;
            changedAttr = 'tackling';
          } else if (userClub.trainingFocus === 'Physical' && attributes.physical.stamina < 20) {
            attributes.physical.stamina += 1;
            changedAttr = 'stamina';
          } else if (attributes.technical.passing < 20) {
            attributes.technical.passing += 1;
            changedAttr = 'passing';
          }
        }

        currentAbility = Math.min(p.potentialAbility, computeCoherentCA(attributes));
        developmentHistory = [
          ...p.developmentHistory.slice(-11),
          { date: nextDate, ca: currentAbility, keyAttributeChanges: [{ attr: changedAttr, delta: 1 }] },
        ];
      }
    }

    updatedPlayers[p.id] = {
      ...p,
      fitness,
      injuryStatus,
      attributes,
      currentAbility,
      developmentHistory,
    };
  }

  // Weekly wage deduction & tactical familiarity growth on Mondays
  if (isWeeklyTick) {
    const controlled = { ...updatedClubs[current.controlledClubId] };
    const weeklyWages = controlled.finances.wageUsedPerWeek;
    const newBal = controlled.finances.balance - weeklyWages;
    controlled.finances = {
      ...controlled.finances,
      balance: newBal,
    };
    controlled.primaryTactic = {
      ...controlled.primaryTactic,
      familiarity: Math.min(100, controlled.primaryTactic.familiarity + 2),
    };
    updatedClubs[controlled.id] = controlled;

    updatedTransactions.unshift({
      id: `tx_wages_${nextDate}`,
      date: nextDate,
      clubId: controlled.id,
      category: 'Player Wages',
      amount: -weeklyWages,
      description: `จ่ายค่าเหนื่อยนักเตะและทีมงานประจำสัปดาห์ (${nextDate})`,
      balanceAfter: newBal,
    });
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
          title: `รายงานแมวมอง: พบเป้าหมายน่าสนใจ — ${found.firstName} ${found.lastName}`,
          body: `ทีมแมวมองส่งรายงานการวิเคราะห์ ${found.firstName} ${found.lastName} (${found.positions.join('/')}, ${updatedClubs[found.clubId]?.name}) ประเมินความเหมาะสมอยู่ที่ ${rep.recommendationScore}/100`,
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
        title: `Matchday ${nextDayUserFixture.matchday}: พร้อมดวลศึก ${oppClub?.name || 'คู่แข่ง'} วันนี้!`,
        body: `วันนี้เป็นวันแข่งขันนัดที่ ${nextDayUserFixture.matchday} พบกับ ${oppClub?.name} (แผนคู่แข่ง: ${oppClub?.primaryTactic.formation}) กรุณาตรวจสอบความฟิตของ 11 ตัวจริงและเข้าสู่ Match Center เพื่อทำการแข่งขัน`,
        isRead: false,
        isImportant: true,
        relatedClubId: oppId,
        actionType: 'GoToMatch',
      });
    }
  }

  const nextState: WorldState = {
    ...current,
    gameDate: nextDate,
    processedDates: [...current.processedDates, nextDate],
    players: updatedPlayers,
    clubs: updatedClubs,
    inbox: updatedInbox,
    transactions: updatedTransactions,
    scoutAssignments: updatedAssignments,
    scoutReports: updatedScoutReports,
  };

  return {
    nextState,
    stoppedReason: nextDayUserFixture ? 'USER_MATCHDAY' : undefined,
    userFixture: nextDayUserFixture,
  };
}

/**
 * Generates a detailed ScoutReport for a specific player
 */
export function buildScoutReportForPlayer(
  player: Player,
  scoutId: string,
  gameDate: string
): ScoutReport {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (player.attributes.physical.pace >= 15) strengths.push('ความเร็วและการกระชากหนีคู่แข่งยอดเยี่ยม');
  if (player.attributes.technical.passing >= 15) strengths.push('การจ่ายบอลสร้างสรรค์เกมแม่นยำสูง');
  if (player.attributes.technical.finishing >= 15) strengths.push('จบสกอร์ในกรอบเขตโทษเฉียบคม');
  if (player.attributes.technical.tackling >= 15) strengths.push('เข้าปะทะและแย่งบอลแข็งแกร่ง');
  if (player.attributes.mental.decisions >= 15) strengths.push('ตัดสินใจในจังหวะสำคัญได้ฉลาด');
  if (strengths.length === 0) strengths.push('มีสมดุลค่าพลังพื้นฐานที่ดีและเล่นตามแท็กติกได้');

  if (player.attributes.physical.stamina <= 10) weaknesses.push('ความอึดในการยืนระยะ 90 นาทียังต้องพัฒนา');
  if (player.attributes.mental.composure <= 10) weaknesses.push('อาจตื่นสนามเมื่อถูกบีบพื้นที่เร็ว');
  if (player.attributes.physical.strength <= 10) weaknesses.push('เสียเปรียบในการปะทะกับคู่แข่งรูปร่างใหญ่');
  if (weaknesses.length === 0) weaknesses.push('ไม่มีจุดอ่อนร้ายแรงในการเล่นระดับลีกสูงสุด');

  const recScore = Math.min(99, Math.max(48, Math.round(player.currentAbility * 0.52 + (player.potentialAbility - player.currentAbility) * 0.35)));

  return {
    id: `srep_${player.id}`,
    playerId: player.id,
    scoutId,
    date: gameDate,
    confidence: 88,
    caEstimate: [Math.max(50, player.currentAbility - 6), Math.min(200, player.currentAbility + 6)],
    paEstimate: player.potentialRange,
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
    return { nextState: state, outcome: 'REJECTED', message: 'ไม่พบข้อมูลนักเตะในฐานข้อมูล' };
  }

  const buyingClub = { ...state.clubs[state.controlledClubId] };
  const sellingClub = { ...state.clubs[player.clubId] };

  if (buyingClub.id === sellingClub.id) {
    return { nextState: state, outcome: 'REJECTED', message: 'นักเตะรายนี้อยู่ในสโมสรของคุณอยู่แล้ว' };
  }

  const totalCostUpfront = params.upfrontFee + params.signingBonus;
  if (totalCostUpfront > buyingClub.finances.transferBudget) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: `งบซื้อขายไม่เพียงพอ (ต้องการ €${(totalCostUpfront / 1_000_000).toFixed(2)}M แต่มีงบ €${(buyingClub.finances.transferBudget / 1_000_000).toFixed(2)}M)`,
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
      rejectionReason: `ข้อเสนอต่ำกว่ามูลค่าที่ ${sellingClub.name} ตั้งไว้ (€${(requiredValue / 1_000_000).toFixed(1)}M)`,
    };

    return {
      nextState: {
        ...state,
        transferOffers: [rejectedOffer, ...state.transferOffers],
      },
      outcome: 'REJECTED',
      message: `${sellingClub.name} ปฏิเสธข้อเสนอเนื่องจากต่ำกว่าราคาประเมิน (€${(requiredValue / 1_000_000).toFixed(1)}M)`,
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
      message: `${sellingClub.name} ยื่นข้อเสนอต่อรองที่ €${(requiredValue / 1_000_000).toFixed(2)}M`,
    };
  }

  // Check Player Wage expectation
  const minWageAccepted = Math.round(player.wagePerWeek * 0.92);
  if (params.proposedWagePerWeek < minWageAccepted) {
    return {
      nextState: state,
      outcome: 'REJECTED',
      message: `เอเยนต์ของ ${player.firstName} ${player.lastName} ปฏิเสธสัญญาเนื่องจากค่าเหนื่อยต่ำกว่า €${minWageAccepted.toLocaleString()}/สัปดาห์`,
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
    description: `คว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name} (${params.offerType === 'Loan' ? 'ยืมตัว' : 'ซื้อขาด'})`,
    balanceAfter: buyingClub.finances.balance,
  };

  const news: NewsItem = {
    id: `news_trf_${offerId}`,
    gameDate: state.gameDate,
    category: 'Transfer',
    title: `OFFICIAL: ${buyingClub.name} คว้าตัว ${player.firstName} ${player.lastName} ร่วมทัพ!`,
    body: `${buyingClub.name} บรรลุข้อตกลงคว้าตัว ${player.firstName} ${player.lastName} จาก ${sellingClub.name} ด้วยมูลค่ารวม €${((params.upfrontFee + params.installmentsFee) / 1_000_000).toFixed(2)}M พร้อมสัญญาถึงปี ${endYear} รับค่าเหนื่อย €${params.proposedWagePerWeek.toLocaleString()}/สัปดาห์`,
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
    message: `คว้าตัว ${player.firstName} ${player.lastName} ร่วมทีม ${buyingClub.name} สำเร็จ!`,
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
    return { nextState: state, success: false, message: 'ไม่พบนักเตะในสโมสรของคุณ' };
  }

  const club = { ...state.clubs[state.controlledClubId] };
  const minExpected = Math.round(player.wagePerWeek * 0.95);
  if (newWagePerWeek < minExpected) {
    return {
      nextState: state,
      success: false,
      message: `เอเยนต์ของ ${player.lastName} ต้องการค่าเหนื่อยอย่างน้อย €${minExpected.toLocaleString()}/สัปดาห์`,
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
    description: `โบนัสต่อสัญญาฉบับใหม่ของ ${player.firstName} ${player.lastName} ถึงปี ${endYear}`,
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
          title: `${player.firstName} ${player.lastName} ขยายสัญญากับ ${club.name} ถึงปี ${endYear}`,
          body: `${player.firstName} ${player.lastName} จรดปากกาต่อสัญญาฉบับใหม่กับสโมสร รับค่าเหนื่อย €${newWagePerWeek.toLocaleString()}/สัปดาห์`,
          isRead: false,
          relatedPlayerId: player.id,
          relatedClubId: club.id,
        },
        ...state.inbox,
      ],
    },
    success: true,
    message: `ต่อสัญญา ${player.firstName} ${player.lastName} ถึงปี ${endYear} สำเร็จ!`,
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
        title: `อคาเดมีดันดาวรุ่งพรสวรรค์สูง: ${firstName} ${lastName} (${pos})`,
        body: `หัวหน้าศูนย์ฝึกเยาวชนของ ${club.name} รายงานการค้นพบดาวรุ่งวัย 17 ปี ${firstName} ${lastName} (${pos}) ที่มีศักยภาพสูงถึงระดับ ${Math.round(pa / 10)}/20`,
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
    return { nextState: state, success: false, message: 'ทีมงานรายนี้มีสังกัดอยู่แล้ว' };
  }

  const club = { ...state.clubs[state.controlledClubId] };
  const signingFee = member.wagePerWeek * 4;
  if (club.finances.balance < signingFee) {
    return { nextState: state, success: false, message: 'งบประมาณสโมสรไม่เพียงพอ' };
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
    description: `แต่งตั้ง ${member.name} เข้ารับตำแหน่ง ${member.role}`,
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
    message: `แต่งตั้ง ${member.name} (${member.role}) เข้าสู่ทีมงานสโมสรสำเร็จ!`,
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

export interface CareerStateMap {
  processedDates: string[];
  manager: ManagerProfile;
  standings: Record<LeagueId, LeagueStanding[]>;
  clubs: Record<string, Club>;
  staff: Record<string, StaffMember>;
  completedFixtures: Record<string, Fixture>;
  modifiedPlayers: Record<string, Player>;
  playerDiffs: Record<string, PlayerDelta>;
  transferOffers: TransferOffer[];
  shortlistPlayerIds: string[];
  scoutAssignments: ScoutAssignment[];
  scoutReports: Record<string, ScoutReport>;
  transactions: FinanceTransaction[];
  inbox: NewsItem[];
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
    if (
      f.status === 'Completed' &&
      f.result &&
      f.homeClubId !== controlledId &&
      f.awayClubId !== controlledId
    ) {
      return {
        ...f,
        result: {
          ...f.result,
          events: [],
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
      developmentHistory: p.developmentHistory.slice(-2),
      transferHistory: p.transferHistory.slice(-3),
    };
  }

  return {
    ...state,
    fixtures: compactFixtures,
    players: compactPlayers,
    inbox: state.inbox.slice(0, 35),
    transactions: state.transactions.slice(0, 60),
  };
}

export function dehydrateWorldStateToCareerMap(state: WorldState): CareerStateMap {
  const compacted = compactWorldStateForStorage(state);
  const baseline = createInitialWorldState(
    compacted.randomSeed,
    compacted.manager,
    compacted.controlledClubId
  );

  const modifiedClubs: Record<string, Club> = {};
  for (const [id, club] of Object.entries(compacted.clubs)) {
    const baseClub = baseline.clubs[id];
    if (
      !baseClub ||
      id === compacted.controlledClubId ||
      club.finances.balance !== baseClub.finances.balance ||
      club.finances.transferBudget !== baseClub.finances.transferBudget ||
      club.trainingFacilities !== baseClub.trainingFacilities ||
      club.youthFacilities !== baseClub.youthFacilities
    ) {
      modifiedClubs[id] = club;
    }
  }

  const modifiedStaff: Record<string, StaffMember> = {};
  for (const [id, member] of Object.entries(compacted.staff)) {
    const baseMember = baseline.staff[id];
    if (!baseMember || member.clubId !== baseMember.clubId) {
      modifiedStaff[id] = member;
    }
  }

  const completedFixtures: Record<string, Fixture> = {};
  for (const f of compacted.fixtures) {
    if (f.status !== 'Scheduled') {
      completedFixtures[f.id] = f;
    }
  }

  const modifiedPlayers: Record<string, Player> = {};
  const playerDiffs: Record<string, PlayerDelta> = {};

  for (const [id, p] of Object.entries(compacted.players)) {
    const basePlayer = baseline.players[id];
    if (
      !basePlayer ||
      p.clubId === compacted.controlledClubId ||
      p.clubId !== basePlayer.clubId
    ) {
      modifiedPlayers[id] = p;
    } else if (
      p.stats.appearances > 0 ||
      p.currentAbility !== basePlayer.currentAbility ||
      p.injuryStatus.isInjured !== basePlayer.injuryStatus.isInjured ||
      p.wagePerWeek !== basePlayer.wagePerWeek ||
      p.contractEndDate !== basePlayer.contractEndDate ||
      p.transferListed !== basePlayer.transferListed ||
      p.loanListed !== basePlayer.loanListed
    ) {
      playerDiffs[id] = {
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
      };
    }
  }

  return sanitizeForFirestore({
    processedDates: compacted.processedDates.slice(-400),
    manager: compacted.manager,
    standings: compacted.standings,
    clubs: modifiedClubs,
    staff: modifiedStaff,
    completedFixtures,
    modifiedPlayers,
    playerDiffs,
    transferOffers: compacted.transferOffers.slice(0, 60),
    shortlistPlayerIds: compacted.shortlistPlayerIds.slice(0, 60),
    scoutAssignments: compacted.scoutAssignments.slice(0, 30),
    scoutReports: compacted.scoutReports,
    transactions: compacted.transactions.slice(0, 80),
    inbox: compacted.inbox.slice(0, 50),
  });
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
  const rehydratedFixtures = baseline.fixtures.map(
    (f) => completedFixturesMap[f.id] || f
  );

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
    standings: cs.standings || baseline.standings,
    transferOffers: cs.transferOffers || [],
    shortlistPlayerIds: cs.shortlistPlayerIds || [],
    scoutAssignments: cs.scoutAssignments || [],
    scoutReports: cs.scoutReports || {},
    transactions: cs.transactions || [],
    inbox: cs.inbox || [],
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
    season: (state.currentSeason || '2026/27').slice(0, 16),
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

