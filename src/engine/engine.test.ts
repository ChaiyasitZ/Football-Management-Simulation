import test from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_TEMPLATES, LEAGUES_CONFIG } from './leaguesConfig';
import { createInitialWorldState } from './worldGenerator';
import {
  checkAndAdvanceDomesticCup,
  CUP_COMPETITIONS_META,
  generateLeagueSchedule,
  generatePromotionPlayoffFixtures,
  getCupRoundPrizeMoney,
  getLeaguePlayerLeaders,
  recomputeLeagueStandings,
} from './leagueEngine';
import {
  COMPETITION_STYLE_MAP,
  FIFA_TO_FLAGCDN_ISO,
  resolveCompetitionTrophyPhotoUrls,
  resolveFotMobCompetitionLogoUrls,
  resolveNationalityFlagInfo,
} from '../components/TrophyAndKitVisuals';
import {
  detectTrophyWinFromMatch,
  getCompetitionSilverwareMeta,
} from '../components/SilverwareModals';
import {
  computeSetPieceThreatScore,
  reconcileMatchResultEventsAndStats,
  simulateMatch,
} from './matchEngine';
import {
  activateReleaseClauseTransfer,
  adjustClubBudgetAllocation,
  advanceDeadlineDayTwoHours,
  advanceWorldOneDay,
  applyForManagerJob,
  applyMatchResultToWorld,
  applyPostMatchTeamTalk,
  appointNationalTeamManager,
  arrangeFriendlyMatch,
  assignYouthMentor,
  buildScoutReportForPlayer,
  buildSevenDayCalendarStrip,
  checkAndTriggerPromotionPlayoffs,
  clearInMemorySaveCache,
  computeHallOfFameLeaderboard,
  computeLeaguePositionWormData,
  conductOneOnOnePlayerChat,
  simulateAndApplyFixturesBatch,
  createCustomPlayerInWorld,
  dehydrateWorldStateToCareerMap,
  dispatchSouthAmericaWonderkidScout,
  evaluateClubFFPStatus,
  evaluateSquadMedicalRisk,
  exerciseBuyBackClause,
  expandClubStadium,
  exportWorldDatabaseJson,
  generateAnnualYouthIntake,
  getClubAllTimeRecords,
  getClubStaffBonuses,
  getClubSupporterConfidence,
  getCoachingLicenseModifiers,
  getDeadlineDayBargains,
  getFanSocialFeed,
  getLiveBallonDorAndGoldenBoyRace,
  getNextAvailableManualSaveSlot,
  getSavedSlotsList,
  getWeeklyTrainingReportAndAdvice,
  holdEmergencySquadMeeting,
  importWorldDatabaseJson,
  isTransferDeadlineWindow,
  liveEditClubFinancesAndFacilities,
  loadWorldStateFromSlot,
  negotiateBoardSeasonAmbition,
  negotiateIncomingTransferBid,
  offerPlayerToClubs,
  organizePreSeasonTour,
  prescribePlayerMedicalRest,
  processEndOfSeasonRollover,
  promoteYouthProspectToSenior,
  purgeLegacyLocalSaves,
  recallPlayerFromLoan,
  rehydrateWorldStateFromCareerDoc,
  releaseYouthProspect,
  removeMentoringGroup,
  renewPlayerContract,
  requestAffiliateFeederClub,
  respondToPressConferenceOrJobOffer,
  saveMentoringGroup,
  saveWorldStateToSlot,
  sendPlayerToAffiliateLoan,
  sendPreMatchMindGame,
  setPlayerIndividualTrainingIntensity,
  setPreSeasonCampFocus,
  signPlayerOnBosmanFree,
  simulateClubWorldCupNextStage,
  simulateEuroCupNextStage,
  simulateU21YouthAndReservesMatchday,
  triggerLoanOptionToBuy,
  simulateExhibitionClash,
  studyNextCoachingLicense,
  submitAndEvaluateTransferOffer,
  triggerAIManagerialCarouselCheck,
  triggerClubTakeoverEvent,
  triggerFifaInternationalBreak,
  triggerGlobalSuperClubBid,
  updatePlayerSquadAndTransferStatus,
  upgradeJuniorOrRecruitmentFacility,
} from './worldSimulationService';
import { getPlayerFaceUrl } from './engPlayerFaces';
import {
  analyzeTacticalRisks,
  autoRegisterSquadIds,
  buildAuthenticTeamInstructions,
  calculatePositionFit,
  computeAutoSetPieceTakers,
  computePlayerPolygon8Axes,
  computeSquadDepthChart,
  computeTacticalChemistryLinks,
  computeTacticalPhaseCoordinates,
  derivePlayerTraitsFromAttributes,
  evaluateAttributeSynergy,
  evaluatePlayerInjuryRisk,
  evaluateRoleSuitability,
  evaluateSquadRegistration,
  getPlayerHomegrownStatus,
  isPlayerNonEuForLeague,
  isPlayerU21Exempt,
  togglePlayerInstructionWithExclusions,
} from './tacticsEngine';

test('23 World & European Leagues & 394 Clubs configuration and generation', () => {
  const world = createInitialWorldState(12345);
  const allClubs = Object.values(world.clubs);
  assert.equal(allClubs.length, 394, 'World must contain exactly 394 clubs across 23 leagues');

  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ENG_PL').length,
    20,
    'Premier League must have 20 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ESP_LL').length,
    20,
    'LaLiga must have 20 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'GER_BL').length,
    18,
    'Bundesliga must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ITA_SA').length,
    20,
    'Serie A must have 20 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'FRA_L1').length,
    18,
    'Ligue 1 must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'POR_LP').length,
    18,
    'Primeira Liga must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'NED_ED').length,
    18,
    'Eredivisie must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'BEL_PL').length,
    16,
    'Belgian Pro League must have 16 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'TUR_SL').length,
    18,
    'Süper Lig must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'SCO_PR').length,
    12,
    'Scottish Premiership must have 12 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ENG_CH').length,
    24,
    'EFL Championship must have 24 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ESP_SD').length,
    22,
    'LaLiga Hypermotion must have 22 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'GER_2B').length,
    18,
    '2. Bundesliga must have 18 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'ITA_SB').length,
    20,
    'Serie B must have 20 clubs'
  );
  assert.equal(
    allClubs.filter((c) => c.leagueId === 'FRA_L2').length,
    18,
    'Ligue 2 must have 18 clubs'
  );

  // Verify real 2025/26 clubs (including promoted clubs) and grounded players exist in the world
  const clubNames = new Set(allClubs.map((c) => c.name));
  assert.ok(clubNames.has('Arsenal'));
  assert.ok(clubNames.has('Manchester City'));
  assert.ok(clubNames.has('Liverpool'));
  assert.ok(clubNames.has('Burnley'));
  assert.ok(clubNames.has('Leeds United'));
  assert.ok(clubNames.has('Sunderland'));
  assert.ok(clubNames.has('Real Madrid'));
  assert.ok(clubNames.has('Barcelona'));
  assert.ok(clubNames.has('Atlético de Madrid'));
  assert.ok(clubNames.has('Levante UD'));
  assert.ok(clubNames.has('Elche CF'));
  assert.ok(clubNames.has('Real Oviedo'));
  assert.ok(clubNames.has('Bayern Munich'));
  assert.ok(clubNames.has('Bayer Leverkusen'));
  assert.ok(clubNames.has('1. FC Heidenheim'));
  assert.ok(clubNames.has('Hamburger SV'));
  assert.ok(clubNames.has('Inter Milan'));
  assert.ok(clubNames.has('Napoli'));
  assert.ok(clubNames.has('AC Milan'));
  assert.ok(clubNames.has('Juventus'));
  assert.ok(clubNames.has('Sassuolo'));
  assert.ok(clubNames.has('Pisa'));
  assert.ok(clubNames.has('Cremonese'));
  assert.ok(clubNames.has('Paris Saint-Germain'));
  assert.ok(clubNames.has('LOSC Lille'));
  assert.ok(clubNames.has('Paris FC'));
  assert.ok(clubNames.has('FC Lorient'));
  assert.ok(clubNames.has('FC Metz'));
  assert.ok(clubNames.has('Angers SCO'));
  assert.ok(clubNames.has('Le Havre AC'));
  assert.ok(clubNames.has('SL Benfica'));
  assert.ok(clubNames.has('Sporting CP'));
  assert.ok(clubNames.has('FC Porto'));
  assert.ok(clubNames.has('SC Braga'));
  assert.ok(clubNames.has('Vitória SC'));
  assert.ok(clubNames.has('FC Alverca'));
  assert.ok(clubNames.has('CD Tondela'));
  assert.ok(clubNames.has('AFC Ajax'));
  assert.ok(clubNames.has('PSV Eindhoven'));
  assert.ok(clubNames.has('Feyenoord Rotterdam'));
  assert.ok(clubNames.has('AZ Alkmaar'));
  assert.ok(clubNames.has('FC Twente'));
  assert.ok(clubNames.has('SC Telstar'));
  assert.ok(clubNames.has('Club Brugge KV'));
  assert.ok(clubNames.has('Union Saint-Gilloise'));
  assert.ok(clubNames.has('RSC Anderlecht'));
  assert.ok(clubNames.has('KRC Genk'));
  assert.ok(clubNames.has('Royal Antwerp FC'));
  assert.ok(clubNames.has('KAA Gent'));
  assert.ok(clubNames.has('RAAL La Louvière'));
  assert.ok(clubNames.has('Galatasaray SK'));
  assert.ok(clubNames.has('Fenerbahçe SK'));
  assert.ok(clubNames.has('Beşiktaş JK'));
  assert.ok(clubNames.has('Celtic FC'));
  assert.ok(clubNames.has('Rangers FC'));
  assert.ok(clubNames.has('Leicester City'));
  assert.ok(clubNames.has('Wrexham AFC'));
  assert.ok(clubNames.has('Real Valladolid'));
  assert.ok(clubNames.has('FC Schalke 04'));
  assert.ok(clubNames.has('Empoli FC'));
  assert.ok(clubNames.has('AS Saint-Étienne'));

  const playerFullNames = new Set(
    Object.values(world.players).map((p) => `${p.firstName} ${p.lastName}`)
  );
  assert.ok(playerFullNames.has('Erling Haaland'));
  assert.ok(playerFullNames.has('Bukayo Saka'));
  assert.ok(playerFullNames.has('Viktor Gyokeres'));
  assert.ok(playerFullNames.has('Florian Wirtz'));
  assert.ok(playerFullNames.has('Trent Alexander-Arnold'));
  assert.ok(playerFullNames.has('Dean Huijsen'));
  assert.ok(playerFullNames.has('Kylian Mbappe'));
  assert.ok(playerFullNames.has('Lamine Yamal'));
  assert.ok(playerFullNames.has('Harry Kane'));
  assert.ok(playerFullNames.has('Jonathan Tah'));
  assert.ok(playerFullNames.has('Lautaro Martinez'));
  assert.ok(playerFullNames.has('Ousmane Dembele'));

  // Verify no player belongs to multiple clubs and every club has 11 starters
  for (const club of allClubs) {
    assert.equal(club.primaryTactic.lineup.length, 11);
    const filledSlots = club.primaryTactic.lineup.filter((s) => s.playerId !== null);
    assert.equal(filledSlots.length, 11, `Club ${club.name} must have 11 starting players`);
  }
});

test('Double round-robin schedule generator produces exact matchdays with zero duplicate fixtures', () => {
  const plConfig = LEAGUES_CONFIG.ENG_PL;
  const clubIds = Array.from({ length: 20 }, (_, i) => `c_${i + 1}`);
  const fixtures = generateLeagueSchedule(plConfig, clubIds, '2025/26');

  // 20 clubs -> 38 matchdays * 10 matches = 380 fixtures
  assert.equal(fixtures.length, 380);

  // Verify no duplicate pairings (home, away)
  const pairSet = new Set<string>();
  for (const f of fixtures) {
    assert.notEqual(f.homeClubId, f.awayClubId);
    const key = `${f.homeClubId}_vs_${f.awayClubId}`;
    assert.equal(pairSet.has(key), false, `Duplicate fixture detected: ${key}`);
    pairSet.add(key);
  }
  assert.equal(pairSet.size, 380);
});

test('Match Engine deterministic simulation, event coherence, mid-match splice reconciliation, and standings update', () => {
  const world = createInitialWorldState(99999);
  const fixture = world.fixtures.find((f) => f.competitionId === 'ENG_PL')!;
  const homeClub = world.clubs[fixture.homeClubId];
  const awayClub = world.clubs[fixture.awayClubId];

  const result1 = simulateMatch(fixture, homeClub, awayClub, world.players, 777);
  const result2 = simulateMatch(fixture, homeClub, awayClub, world.players, 777);

  // Deterministic seed guarantees identical scoreline and stats
  assert.equal(result1.homeGoals, result2.homeGoals);
  assert.equal(result1.awayGoals, result2.awayGoals);
  assert.equal(result1.homeStats.possession + result1.awayStats.possession, 100);

  // Event log must match scoreline
  const goalEvents = result1.events.filter((e) => e.eventType === 'Goal');
  assert.equal(goalEvents.length, result1.homeGoals + result1.awayGoals);

  const ftEvent = result1.events.find((e) => e.eventType === 'FullTime')!;
  assert.ok(
    ftEvent.text.includes(`${homeClub.name} ${result1.homeGoals} - ${result1.awayGoals} ${awayClub.name}`),
    `FullTime commentary must match final score: ${ftEvent.text}`
  );

  // Verify mid-match splice reconciliation (e.g., 3-3 draw with 90th-minute equalizer)
  const spliced = reconcileMatchResultEventsAndStats(fixture, homeClub, awayClub, result1, [
    {
      id: 'g1',
      fixtureId: fixture.id,
      minute: 12,
      eventType: 'Goal',
      teamId: homeClub.id,
      playerName: 'Home Scorer 1',
      text: '',
      pitchX: 95,
      pitchY: 50,
    },
    {
      id: 'g2',
      fixtureId: fixture.id,
      minute: 28,
      eventType: 'Goal',
      teamId: homeClub.id,
      playerName: 'Home Scorer 2',
      text: '',
      pitchX: 95,
      pitchY: 50,
    },
    {
      id: 'g3',
      fixtureId: fixture.id,
      minute: 54,
      eventType: 'Goal',
      teamId: awayClub.id,
      playerName: 'Away Scorer 1',
      text: '',
      pitchX: 5,
      pitchY: 50,
    },
    {
      id: 'g4',
      fixtureId: fixture.id,
      minute: 67,
      eventType: 'Goal',
      teamId: awayClub.id,
      playerName: 'Away Scorer 2',
      text: '',
      pitchX: 5,
      pitchY: 50,
    },
    {
      id: 'g5',
      fixtureId: fixture.id,
      minute: 81,
      eventType: 'Goal',
      teamId: homeClub.id,
      playerName: 'Home Scorer 3',
      text: '',
      pitchX: 95,
      pitchY: 50,
    },
    {
      id: 'g6',
      fixtureId: fixture.id,
      minute: 90,
      eventType: 'Goal',
      teamId: awayClub.id,
      playerName: 'Mohamed Salah',
      text: '',
      pitchX: 5,
      pitchY: 50,
    },
  ]);

  assert.equal(spliced.homeGoals, 3);
  assert.equal(spliced.awayGoals, 3);
  const splicedFt = spliced.events.find((e) => e.eventType === 'FullTime')!;
  assert.equal(
    splicedFt.text,
    `Full-Time (90'): ${homeClub.name} 3 - 3 ${awayClub.name}`
  );
  const lastGoal = spliced.events.filter((e) => e.eventType === 'Goal').slice(-1)[0];
  assert.ok(
    lastGoal.text.includes('[3 - 3]') && lastGoal.text.includes('equalizer'),
    `90th-minute equalizer must state [3 - 3] and equalizer, got: ${lastGoal.text}`
  );

  // Apply match result and check standings
  const afterMatch = applyMatchResultToWorld(world, fixture.id, result1);
  // Idempotency: applying the same match result a second time must not double-count points or goals
  const afterDuplicateCall = applyMatchResultToWorld(afterMatch, fixture.id, result1);

  const leagueId = fixture.competitionId as 'ENG_PL';
  const homeRow = afterDuplicateCall.standings[leagueId].find((s) => s.clubId === homeClub.id)!;
  const awayRow = afterDuplicateCall.standings[leagueId].find((s) => s.clubId === awayClub.id)!;

  assert.equal(homeRow.played, 1);
  assert.equal(awayRow.played, 1);
  assert.equal(homeRow.goalsFor, result1.homeGoals);
  assert.equal(awayRow.goalsFor, result1.awayGoals);

  if (result1.homeGoals > result1.awayGoals) {
    assert.equal(homeRow.points, 3);
    assert.equal(awayRow.points, 0);
  } else if (result1.homeGoals < result1.awayGoals) {
    assert.equal(homeRow.points, 0);
    assert.equal(awayRow.points, 3);
  } else {
    assert.equal(homeRow.points, 1);
    assert.equal(awayRow.points, 1);
  }
});

test('Transfer and Contract Engine enforces budgets, updates club ownership atomically, and logs transactions', () => {
  const world = createInitialWorldState(54321);
  const myClubId = world.controlledClubId;
  const myClub = world.clubs[myClubId];

  // Pick a target player from another club with affordable price
  const targetPlayer = Object.values(world.players).find(
    (p) => p.clubId !== myClubId && p.askingPrice <= myClub.finances.transferBudget * 0.6
  )!;
  assert.ok(targetPlayer, 'Should find an affordable target player');

  const prevClubId = targetPlayer.clubId;
  const prevBalance = myClub.finances.balance;
  const prevTxCount = world.transactions.length;

  const { nextState, outcome } = submitAndEvaluateTransferOffer(world, {
    playerId: targetPlayer.id,
    offerType: 'Transfer',
    upfrontFee: targetPlayer.askingPrice,
    installmentsFee: 0,
    sellOnPercentage: 5,
    proposedWagePerWeek: Math.round(targetPlayer.wagePerWeek * 1.1),
    proposedContractYears: 4,
    proposedSquadStatus: 'Important Player',
    signingBonus: 100_000,
  });

  assert.equal(outcome, 'COMPLETED');
  assert.equal(nextState.players[targetPlayer.id].clubId, myClubId);
  assert.ok(nextState.clubs[myClubId].finances.balance < prevBalance);
  assert.equal(nextState.transactions.length, prevTxCount + 1);

  // Verify selling club no longer has the player in its lineup
  const oldClubLineupIds = nextState.clubs[prevClubId].primaryTactic.lineup.map((s) => s.playerId);
  assert.equal(oldClubLineupIds.includes(targetPlayer.id), false);

  // Test Contract Renewal
  const renewal = renewPlayerContract(
    nextState,
    targetPlayer.id,
    Math.round(targetPlayer.wagePerWeek * 1.2),
    5,
    50_000
  );
  assert.equal(renewal.success, true);
});

test('WorldClockService advances dates cleanly and Cloud Firestore native Map dehydration/rehydration preserves 100% state', () => {
  const world = createInitialWorldState(11111);
  const startDate = world.gameDate;
  const { nextState } = advanceWorldOneDay(world);
  assert.notEqual(nextState.gameDate, startDate);
  assert.equal(nextState.processedDates.includes(nextState.gameDate), true);

  const club = nextState.clubs[nextState.controlledClubId];
  const risks = analyzeTacticalRisks(club.primaryTactic, nextState.players);
  assert.ok(risks.length >= 1);

  const firstPlayer = Object.values(nextState.players)[0];
  const fit = calculatePositionFit(firstPlayer, firstPlayer.positions[0]);
  assert.equal(fit, 1.0);

  // Simulate 28 days of multi-league fixtures and weekly finance updates across 280 clubs
  let multiWeekState = nextState;
  for (let d = 0; d < 28; d++) {
    multiWeekState = advanceWorldOneDay(multiWeekState).nextState;
  }

  // Verify Cloud Firestore native Map dehydration and rehydration round-trip
  const careerMap = dehydrateWorldStateToCareerMap(multiWeekState);
  const approxByteSize = Buffer.byteLength(JSON.stringify(careerMap), 'utf8');
  assert.ok(
    approxByteSize < 250_000,
    `Cloud Firestore careerState map must be well under 1MB limit after multi-week simulation (got ${approxByteSize} bytes)`
  );

  const rehydrated = rehydrateWorldStateFromCareerDoc({
    ownerId: 'user_test_1',
    slotId: 'slot_autosave',
    saveName: multiWeekState.saveName,
    clubName: club.name,
    managerName: multiWeekState.manager.name,
    gameDate: multiWeekState.gameDate,
    season: multiWeekState.currentSeason,
    lastSavedAtIso: '2026-11-10T10:00:00.000Z',
    randomSeed: multiWeekState.randomSeed,
    controlledClubId: multiWeekState.controlledClubId,
    careerState: careerMap,
  });

  assert.equal(Object.keys(rehydrated.clubs).length, 394);
  assert.equal(
    Object.keys(rehydrated.players).length,
    Object.keys(multiWeekState.players).length
  );
  assert.equal(rehydrated.gameDate, multiWeekState.gameDate);

  // Verify saveWorldStateToSlot and loadWorldStateFromSlot work with zero localStorage
  const metas = saveWorldStateToSlot('slot_autosave', multiWeekState);
  assert.ok(metas.length >= 1);
  const loaded = loadWorldStateFromSlot('slot_autosave');
  assert.ok(loaded);
  assert.equal(loaded?.controlledClubId, multiWeekState.controlledClubId);
});

test('UEFA New Format (36-team Swiss League Phase, 4 Pots, 10-country quotas, and Knockout progression)', () => {
  const world = createInitialWorldState(202526);
  const uclStandings = world.uefaStandings?.UEFA_UCL ?? [];
  const uelStandings = world.uefaStandings?.UEFA_UEL ?? [];
  const ueclStandings = world.uefaStandings?.UEFA_UECL ?? [];

  assert.equal(uclStandings.length, 36, 'UCL must have 36 teams in single League Phase table');
  assert.equal(uelStandings.length, 36, 'UEL must have 36 teams in single League Phase table');
  assert.equal(ueclStandings.length, 36, 'UECL must have 36 teams in single League Phase table');

  // Ensure all 108 European clubs across UCL, UEL, UECL are distinct
  const allUefaClubIds = new Set([
    ...uclStandings.map((r) => r.clubId),
    ...uelStandings.map((r) => r.clubId),
    ...ueclStandings.map((r) => r.clubId),
  ]);
  assert.equal(allUefaClubIds.size, 108, '108 distinct clubs must qualify across UCL, UEL, UECL');

  // Verify 4 pots of 9 teams each per competition
  for (const compId of ['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as const) {
    const pots = world.uefaPots?.[compId] ?? [];
    assert.equal(pots.length, 4);
    for (const pot of pots) {
      assert.equal(pot.length, 9);
    }
  }

  // Verify UCL and UEL have 8 matches per team (4 Home, 4 Away) = 144 League Phase fixtures each
  for (const compId of ['UEFA_UCL', 'UEFA_UEL'] as const) {
    const compFixtures = world.fixtures.filter(
      (f) => f.competitionId === compId && f.uefaStage === 'LEAGUE_PHASE'
    );
    assert.equal(compFixtures.length, 144, `${compId} League Phase must have 144 fixtures`);

    const pots = world.uefaPots![compId];
    const clubToPot = new Map<string, number>();
    pots.forEach((pot, idx) => pot.forEach((cid) => clubToPot.set(cid, idx)));

    for (const cid of pots.flat()) {
      const myHome = compFixtures.filter((f) => f.homeClubId === cid);
      const myAway = compFixtures.filter((f) => f.awayClubId === cid);
      assert.equal(myHome.length, 4, `${compId} club ${cid} must play 4 home matches`);
      assert.equal(myAway.length, 4, `${compId} club ${cid} must play 4 away matches`);

      const opponents = new Set([
        ...myHome.map((f) => f.awayClubId),
        ...myAway.map((f) => f.homeClubId),
      ]);
      assert.equal(opponents.size, 8, `${compId} club ${cid} must face 8 distinct opponents`);

      // Verify 1 Home and 1 Away against each of the 4 pots
      for (let p = 0; p < 4; p++) {
        const homeVsPot = myHome.filter((f) => clubToPot.get(f.awayClubId) === p).length;
        const awayVsPot = myAway.filter((f) => clubToPot.get(f.homeClubId) === p).length;
        assert.equal(homeVsPot, 1, `${compId} club ${cid} must play 1 Home match vs Pot ${p + 1}`);
        assert.equal(awayVsPot, 1, `${compId} club ${cid} must play 1 Away match vs Pot ${p + 1}`);
      }
    }
  }

  // Verify UECL has 6 matches per team (3 Home, 3 Away) = 108 League Phase fixtures
  const ueclFixtures = world.fixtures.filter(
    (f) => f.competitionId === 'UEFA_UECL' && f.uefaStage === 'LEAGUE_PHASE'
  );
  assert.equal(ueclFixtures.length, 108, 'UECL League Phase must have 108 fixtures');
  for (const cid of world.uefaPots!.UEFA_UECL.flat()) {
    const myHome = ueclFixtures.filter((f) => f.homeClubId === cid);
    const myAway = ueclFixtures.filter((f) => f.awayClubId === cid);
    assert.equal(myHome.length, 3, `UECL club ${cid} must play 3 home matches`);
    assert.equal(myAway.length, 3, `UECL club ${cid} must play 3 away matches`);
    const opponents = new Set([
      ...myHome.map((f) => f.awayClubId),
      ...myAway.map((f) => f.homeClubId),
    ]);
    assert.equal(opponents.size, 6, `UECL club ${cid} must face 6 distinct opponents`);
  }
});

test('Deep Squad Management & Tactics: 25-man / 8-HG Registration, Attribute Synergy, False 9, and 3-match Star Benching', () => {
  const world = createInitialWorldState(991122);
  const club = world.clubs[world.controlledClubId];
  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);

  // 1. Verify initial Squad Registration meets Max 25 & Min 8 Homegrown rules
  const regSummary = evaluateSquadRegistration(clubPlayers, club.countryId);
  assert.ok(regSummary.registeredCount <= 25, `Registered count (${regSummary.registeredCount}) must be <= 25`);
  assert.ok(
    regSummary.homegrownRegisteredCount >= 8,
    `Homegrown registered count (${regSummary.homegrownRegisteredCount}) must be >= 8`
  );
  assert.equal(regSummary.isCompliant, true, 'Initial squad registration must be compliant');

  // 2. Verify Mutual Exclusion in Individual Instructions (Shoot Less vs Shoot More, Tackle Harder vs Ease Off Tackles)
  let inst = togglePlayerInstructionWithExclusions([], 'Shoot More');
  assert.deepEqual(inst, ['Shoot More']);
  inst = togglePlayerInstructionWithExclusions(inst, 'Shoot Less');
  assert.deepEqual(inst, ['Shoot Less'], 'Shoot Less must automatically remove Shoot More');
  inst = togglePlayerInstructionWithExclusions(inst, 'Tackle Harder');
  assert.deepEqual(inst, ['Shoot Less', 'Tackle Harder']);
  inst = togglePlayerInstructionWithExclusions(inst, 'Ease Off Tackles');
  assert.deepEqual(inst, ['Shoot Less', 'Ease Off Tackles']);

  // 3. Verify False 9 & Inverted Wing Back role suitability and Attribute Synergy detection
  const stSlot = club.primaryTactic.lineup.find((s) => s.position === 'ST')!;
  const stPlayer = world.players[stSlot.playerId!];
  const f9Score = evaluateRoleSuitability(stPlayer, 'False 9');
  assert.ok(f9Score >= 1 && f9Score <= 20, 'False 9 suitability must be on 1-20 scale');

  // Inject a slow centre-back in a Very High Defensive Line and a low-stamina forward in a Very High Press
  const dcSlot = club.primaryTactic.lineup.find((s) => s.position === 'DC')!;
  const dcPlayer = world.players[dcSlot.playerId!];
  const modifiedPlayers = {
    ...world.players,
    [dcPlayer.id]: {
      ...dcPlayer,
      fitness: 64, // <70% Condition triggers High Muscle Injury Risk
      attributes: {
        ...dcPlayer.attributes,
        physical: { ...dcPlayer.attributes.physical, pace: 8, acceleration: 8 },
      },
    },
    [stPlayer.id]: {
      ...stPlayer,
      attributes: {
        ...stPlayer.attributes,
        mental: { ...stPlayer.attributes.mental, workRate: 7 },
        physical: { ...stPlayer.attributes.physical, stamina: 8 },
      },
    },
  };

  const highLinePressTactic = {
    ...club.primaryTactic,
    familiarity: 48, // Low familiarity after switching formations
    instructions: {
      ...club.primaryTactic.instructions,
      defensiveLine: 'Very High' as const,
      pressingIntensity: 'Very High' as const,
    },
  };

  const synergy = evaluateAttributeSynergy(highLinePressTactic, modifiedPlayers);
  assert.ok(
    synergy.defensiveLineSynergy.weakLinks.some((w) => w.playerId === dcPlayer.id),
    'Slow CB must be flagged in Very High Defensive Line synergy'
  );
  assert.ok(
    synergy.pressingSynergy.weakLinks.some((w) => w.playerId === stPlayer.id),
    'Low Work Rate / Stamina forward must be flagged in Very High Pressing synergy'
  );

  const injRisk = evaluatePlayerInjuryRisk(modifiedPlayers[dcPlayer.id], 'Very High');
  assert.equal(injRisk.level, 'High', 'Player with 64% Condition must have High muscle injury risk');

  const alerts = analyzeTacticalRisks(highLinePressTactic, modifiedPlayers);
  assert.ok(
    alerts.some((a) => a.message.includes('Low Tactical Familiarity')),
    'Must warn about low tactical familiarity (<65%)'
  );
  assert.ok(
    alerts.some((a) => a.message.includes('Injury Risk')),
    'Must warn about starting a player with <70% Condition'
  );

  // 4. Verify Squad Hierarchy 3-match consecutive benching drops Star Player morale & triggers Inbox unrest
  const starPlayer = clubPlayers.find((p) => p.squadStatus === 'Star Player')!;
  const userFixture = world.fixtures.find(
    (f) =>
      f.status === 'Scheduled' &&
      f.competitionId === club.leagueId &&
      (f.homeClubId === club.id || f.awayClubId === club.id)
  )!;
  const home = world.clubs[userFixture.homeClubId];
  const away = world.clubs[userFixture.awayClubId];
  const simRes = simulateMatch(userFixture, home, away, world.players, 777);

  // Remove starPlayer from playerRatings to simulate being benched for the 3rd consecutive match
  const ratingsWithoutStar = { ...simRes.playerRatings };
  delete ratingsWithoutStar[starPlayer.id];

  const stateWithStarBenchedTwice = {
    ...world,
    players: {
      ...world.players,
      [starPlayer.id]: {
        ...starPlayer,
        consecutiveBenched: 2,
        morale: 85,
      },
    },
  };

  const after3rdBench = applyMatchResultToWorld(stateWithStarBenchedTwice, userFixture.id, {
    ...simRes,
    playerRatings: ratingsWithoutStar,
  });

  const updatedStar = after3rdBench.players[starPlayer.id];
  assert.equal(updatedStar.consecutiveBenched, 3, 'Consecutive benched count must increment to 3');
  assert.ok(updatedStar.morale <= 73, `Star player morale must drop sharply after 3rd benching (got ${updatedStar.morale})`);
  assert.ok(
    after3rdBench.inbox.some((n) => n.id.includes(`news_hier_${userFixture.id}_${starPlayer.id}`)),
    'Must generate Dressing Room Unrest inbox item when Star Player is benched 3 matches in a row'
  );
});

test('FM Youth System, Global Wonderkids, Verified Portraits, Domestic Cups & Season Rollover', () => {
  const world = createInitialWorldState(202699);

  // 1. Verify real-world wonderkids exist and every wonderkid / youth player resolves a real portrait URL
  const allPlayers = Object.values(world.players);
  const wonderkids = allPlayers.filter(
    (p) => p.isWonderkid || (parseInt(p.dateOfBirth.slice(0, 4), 10) >= 2005 && p.potentialAbility >= 165)
  );
  assert.ok(wonderkids.length >= 25, `World must include real wonderkids (found ${wonderkids.length})`);

  const wonderkidNames = new Set(wonderkids.map((p) => `${p.firstName} ${p.lastName}`));
  assert.ok(wonderkidNames.has('Lamine Yamal'));
  assert.ok(wonderkidNames.has('Pau Cubarsi'));
  assert.ok(wonderkidNames.has('Endrick Felipe'));
  assert.ok(wonderkidNames.has('Warren Zaire-Emery'));
  assert.ok(wonderkidNames.has('Ethan Nwaneri'));

  for (const namedWk of [
    'Lamine Yamal',
    'Pau Cubarsi',
    'Endrick Felipe',
    'Warren Zaire-Emery',
    'Ethan Nwaneri',
    'Kobbie Mainoo',
    'Leny Yoro',
    'Myles Lewis-Skelly',
    'Jude Bellingham',
    'Jamal Musiala',
    'Gavi Paez',
    'Raphinha Belloli',
    'Rodrygo Goes',
    'Vitinha Ferreira',
    'Savinho Moreira',
    'Kenan Yildiz',
  ]) {
    const [firstName, ...rest] = namedWk.split(' ');
    const lastName = rest.join(' ');
    const faceUrl = getPlayerFaceUrl({
      id: `test_${firstName}`,
      clubId: 'club_eng_pl_1',
      firstName,
      lastName,
    });
    assert.ok(
      faceUrl && faceUrl.startsWith('https://'),
      `Named real player/wonderkid ${namedWk} must resolve an exact 1:1 verified portrait URL`
    );
  }

  // 2. Verify Youth Intake, Facility Upgrades, Mentoring, Promotion, and Release
  const upgRes = upgradeJuniorOrRecruitmentFacility(world, 'juniorCoaching');
  assert.equal(upgRes.success, true);

  const intakeRes = generateAnnualYouthIntake(upgRes.nextState);
  assert.equal(intakeRes.newProspects.length, 4, 'Annual Youth Intake generates 4 new prospects');
  const myYouth = Object.values(intakeRes.nextState.players).filter(
    (p) => p.clubId === world.controlledClubId && p.isYouthAcademy
  );
  assert.ok(myYouth.length >= 5, 'Annual Youth Intake must add new U18 prospects');

  for (const yp of intakeRes.newProspects) {
    const faceUrl = getPlayerFaceUrl(yp);
    assert.equal(
      faceUrl,
      undefined,
      'Procedurally generated youth prospect must not borrow a random real player photo (renders procedural regen SVG instead)'
    );
  }

  const seniorMentor = Object.values(intakeRes.nextState.players).find(
    (p) =>
      p.clubId === world.controlledClubId &&
      !p.isYouthAcademy &&
      parseInt(p.dateOfBirth.slice(0, 4), 10) <= 2001
  )!;
  const targetYouth = myYouth[0];
  const mentorRes = assignYouthMentor(intakeRes.nextState, targetYouth.id, seniorMentor.id);
  assert.equal(mentorRes.success, true);
  assert.equal(mentorRes.nextState.players[targetYouth.id].mentorId, seniorMentor.id);

  const promoteRes = promoteYouthProspectToSenior(mentorRes.nextState, targetYouth.id);
  assert.equal(promoteRes.success, true);
  assert.equal(promoteRes.nextState.players[targetYouth.id].isYouthAcademy, false);

  const releaseTarget = myYouth[1];
  const releaseRes = releaseYouthProspect(promoteRes.nextState, releaseTarget.id);
  assert.equal(releaseRes.success, true);
  assert.equal(releaseRes.nextState.players[releaseTarget.id], undefined);

  // 3. Verify Staff Bonuses & Fog of War Scout Report Accuracy
  const bonuses = getClubStaffBonuses(world, world.controlledClubId);
  assert.ok(bonuses.scoutAccuracy >= 1 && bonuses.scoutAccuracy <= 20);
  const foreignPlayer = allPlayers.find((p) => p.clubId !== world.controlledClubId)!;
  const scoutRep = buildScoutReportForPlayer(
    foreignPlayer,
    'stf_head_scout',
    world.gameDate,
    bonuses.scoutAccuracy
  );
  assert.ok(scoutRep.caEstimate[0] <= scoutRep.caEstimate[1]);
  assert.ok(scoutRep.paEstimate[0] <= scoutRep.paEstimate[1]);

  // 4. Verify Domestic Knockout Cups exist across all 10 nations and Knockout simulation resolves ties
  const domCupFixtures = world.fixtures.filter((f) => f.competitionId.endsWith('_CUP'));
  assert.ok(domCupFixtures.length >= 70, `Must generate initial Domestic Cup fixtures (got ${domCupFixtures.length})`);

  const sampleCupFixture = domCupFixtures[0];
  const cupSim = simulateMatch(
    sampleCupFixture,
    world.clubs[sampleCupFixture.homeClubId],
    world.clubs[sampleCupFixture.awayClubId],
    world.players,
    12345,
    undefined,
    undefined,
    { isKnockout: true }
  );
  if (cupSim.homeGoals === cupSim.awayGoals) {
    assert.ok(
      cupSim.penaltyShootout &&
        cupSim.penaltyShootout.homePenalties !== cupSim.penaltyShootout.awayPenalties,
      'Tied knockout cup fixture must be decided by penalty shootout'
    );
  }

  // 5. Verify Budget Split Adjustment & End-of-Season Rollover
  const budgetAdjusted = adjustClubBudgetAllocation(world, 75);
  assert.equal(budgetAdjusted.success, true);
  assert.ok(budgetAdjusted.nextState.clubs[world.controlledClubId].finances.transferBudget > 0);

  const rolledOver = processEndOfSeasonRollover(budgetAdjusted.nextState);
  assert.notEqual(rolledOver.nextState.currentSeason, world.currentSeason);
  assert.equal(Object.keys(rolledOver.nextState.clubs).length, 394);
});

test('Phase 2 (Checkpoints 5–8): 8-Axis Radar, 3-Mode Tactical Pitch & Chemistry, Live Shouts & Shot Map, Bosman, Takeovers & Job Center', () => {
  const world = createInitialWorldState(202788);
  const myClub = world.clubs[world.controlledClubId];
  const myPlayers = Object.values(world.players).filter((p) => p.clubId === myClub.id);

  // Checkpoint 5: 8-Axis Polygon Radar for Outfield and GK
  const outfieldPlayer = myPlayers.find((p) => p.positions[0] !== 'GK')!;
  const gkPlayer = myPlayers.find((p) => p.positions[0] === 'GK')!;
  const outAxes = computePlayerPolygon8Axes(outfieldPlayer);
  const gkAxes = computePlayerPolygon8Axes(gkPlayer);
  assert.equal(outAxes.length, 8, 'Outfield polygon must have 8 axes');
  assert.equal(gkAxes.length, 8, 'GK polygon must have 8 axes');
  for (const ax of [...outAxes, ...gkAxes]) {
    assert.ok(ax.value >= 1 && ax.value <= 20, `Axis ${ax.labelEn} must be in 1..20 (got ${ax.value})`);
  }

  // Checkpoint 5: Own-Player Transfer/Loan List, Asking Price & Demotion Unrest
  const starPlayer = myPlayers.find((p) => p.squadStatus === 'Star Player')!;
  const demoteRes = updatePlayerSquadAndTransferStatus(world, starPlayer.id, {
    squadStatus: 'Squad Player',
    transferListed: true,
    askingPrice: Math.round(starPlayer.marketValue * 0.75),
  });
  const afterDemotePlayer = demoteRes.nextState.players[starPlayer.id];
  assert.equal(afterDemotePlayer.squadStatus, 'Squad Player');
  assert.equal(afterDemotePlayer.transferListed, true);
  assert.ok(afterDemotePlayer.morale < starPlayer.morale, 'Demoting Star Player must reduce morale');
  assert.ok(
    demoteRes.nextState.inbox.some((n) => n.id.includes(`news_unhappy_status_`)),
    'Demoting Star Player must generate an unhappy player inbox message'
  );

  // Checkpoint 6: 3-Mode Tactical Pitch Shape & Chemistry Links
  const baseCoords = computeTacticalPhaseCoordinates(myClub.primaryTactic, 'base');
  const inPossCoords = computeTacticalPhaseCoordinates(myClub.primaryTactic, 'in_possession');
  const outPossCoords = computeTacticalPhaseCoordinates(myClub.primaryTactic, 'out_of_possession');
  assert.equal(baseCoords.length, 11);
  assert.equal(inPossCoords.length, 11);
  assert.equal(outPossCoords.length, 11);
  const stIdx = myClub.primaryTactic.lineup.findIndex((s) => s.position === 'ST');
  assert.ok(
    inPossCoords[stIdx].y <= baseCoords[stIdx].y,
    'In-Possession mode must push attacking slots higher up the pitch (lower y)'
  );
  assert.ok(
    outPossCoords[stIdx].y >= baseCoords[stIdx].y,
    'Out-of-Possession mode must drop slots deeper into defensive block (higher y)'
  );

  const chemLinks = computeTacticalChemistryLinks(myClub.primaryTactic, world.players);
  assert.ok(chemLinks.length >= 5, `Must compute tactical chemistry links (got ${chemLinks.length})`);

  // Checkpoint 7: Live Touchline Shouts & Shot Map Coordinates / xG
  const fix = world.fixtures[0];
  const hClub = world.clubs[fix.homeClubId];
  const aClub = world.clubs[fix.awayClubId];
  const simWithShout = simulateMatch(fix, hClub, aClub, world.players, 4242, undefined, undefined, {
    touchlineShouts: [
      { minute: 20, teamId: hClub.id, shout: 'Demand More' },
      { minute: 60, teamId: aClub.id, shout: 'Focus' },
    ],
  });
  const shotEvents = simWithShout.events.filter(
    (e) =>
      e.eventType === 'Goal' ||
      e.eventType === 'Save' ||
      e.eventType === 'BlockedShot' ||
      e.eventType === 'Shot'
  );
  assert.ok(shotEvents.length > 0, 'Simulated match must produce shot events');
  for (const se of shotEvents) {
    assert.ok(typeof se.shotXg === 'number' && se.shotXg > 0, 'Every shot event must record shotXg');
    assert.ok(typeof se.shotX === 'number' && typeof se.shotY === 'number', 'Every shot event must record shotX/shotY');
  }

  // Checkpoint 8: Board Takeover Embargo & Completion, Bosman Free Signing, and Job Center
  const embargoRes = triggerClubTakeoverEvent(world, myClub.id, 'EMBARGO');
  assert.ok(embargoRes.nextState.clubs[myClub.id].transferEmbargoUntil, 'EMBARGO mode must set transferEmbargoUntil');

  const externalTarget = Object.values(world.players).find((p) => p.clubId !== myClub.id)!;
  const blockedOffer = submitAndEvaluateTransferOffer(embargoRes.nextState, {
    playerId: externalTarget.id,
    offerType: 'Transfer',
    upfrontFee: externalTarget.askingPrice,
    installmentsFee: 0,
    sellOnPercentage: 0,
    proposedWagePerWeek: externalTarget.wagePerWeek,
    proposedContractYears: 3,
    proposedSquadStatus: 'Regular Starter',
    signingBonus: 0,
  });
  assert.equal(blockedOffer.outcome, 'REJECTED', 'Active transfer embargo must block incoming transfers');

  const takeoverDone = triggerClubTakeoverEvent(embargoRes.nextState, myClub.id, 'COMPLETE');
  assert.equal(takeoverDone.nextState.clubs[myClub.id].transferEmbargoUntil, null);
  assert.equal(takeoverDone.nextState.clubs[myClub.id].sugarDaddyType, 'FRONT_END');

  // Bosman Free Signing for player with <= 1 year left
  const bosmanCandidate = Object.values(takeoverDone.nextState.players).find(
    (p) =>
      p.clubId !== myClub.id &&
      Number(p.contractEndDate.slice(0, 4)) - Number(world.gameDate.slice(0, 4)) <= 1 &&
      p.wagePerWeek <= 60_000
  )!;
  assert.ok(bosmanCandidate, 'Must find an external player with <= 1 year left on contract');
  const bosmanRes = signPlayerOnBosmanFree(
    takeoverDone.nextState,
    bosmanCandidate.id,
    Math.round(bosmanCandidate.wagePerWeek * 1.15),
    4
  );
  assert.equal(bosmanRes.outcome, 'COMPLETED');
  assert.equal(bosmanRes.nextState.players[bosmanCandidate.id].clubId, myClub.id);

  // Job Center Club Switching
  const approachableClub = Object.values(bosmanRes.nextState.clubs).find(
    (c) => c.id !== myClub.id && c.reputation <= bosmanRes.nextState.manager.reputation + 15
  )!;
  const jobRes = applyForManagerJob(bosmanRes.nextState, approachableClub.id);
  assert.equal(jobRes.accepted, true);
  assert.equal(jobRes.nextState.controlledClubId, approachableClub.id);
  assert.ok(
    jobRes.nextState.manager.careerStats.clubsManaged.some((c) => c.clubId === approachableClub.id)
  );
});

test('Phase 3 (Checkpoints 9–12): Half-Time Team Talk, Captain & Set Piece Creator, Player Traits & Mentoring Groups, Squad Planner Depth Chart, Deadline Day & Release Clauses, and Trophy Cabinet & Ballon d\'Or Gala', () => {
  const world = createInitialWorldState(202899);
  const myClub = world.clubs[world.controlledClubId];
  const myPlayers = Object.values(world.players).filter((p) => p.clubId === myClub.id);

  // Checkpoint 9: Half-Time Dressing Room Team Talk in Match Engine
  const fix = world.fixtures[0];
  const hClub = world.clubs[fix.homeClubId];
  const aClub = world.clubs[fix.awayClubId];
  const simWithHalfTimeTalk = simulateMatch(
    fix,
    hClub,
    aClub,
    world.players,
    9001,
    undefined,
    undefined,
    {
      halfTimeTalk: { home: 'demand_more' },
    }
  );
  const htEvent = simWithHalfTimeTalk.events.find((e) => e.eventType === 'HalfTime')!;
  assert.ok(htEvent, 'Match simulation must include a HalfTime event at minute 45');
  const htTalkEvent = simWithHalfTimeTalk.events.find(
    (e) => e.minute === 45 && e.text.includes('Half-Time Team Talk')
  )!;
  assert.ok(
    htTalkEvent,
    'Half-Time Team Talk option must emit a 45th-minute Half-Time Team Talk event'
  );

  // Checkpoint 10: Captaincy & Set Piece Creator (SetPieceSetup)
  assert.ok(myClub.primaryTactic.setPieces, 'Club primaryTactic must have setPieces initialized');
  const autoSp = computeAutoSetPieceTakers(myPlayers);
  assert.ok(autoSp.captainId, 'Must auto-select a Captain');
  assert.ok(autoSp.penaltyTakerId, 'Must auto-select a Penalty Taker');
  assert.ok(autoSp.freeKickTakerId, 'Must auto-select a Free-Kick Taker');
  assert.ok(autoSp.cornerTakerId, 'Must auto-select a Corner Taker');

  // Checkpoint 11: Player Traits, Mentoring Groups & FM27 Squad Planner (9 Zones)
  const playersWithTraits = Object.values(world.players).filter(
    (p) => (p.traits && p.traits.length > 0) || derivePlayerTraitsFromAttributes(p).length > 0
  );
  assert.ok(
    playersWithTraits.length >= 100,
    `World must populate Player Traits / Preferred Moves (got ${playersWithTraits.length})`
  );

  const depthZones = computeSquadDepthChart(myPlayers, 2026);
  assert.equal(depthZones.length, 9, 'Squad Planner Depth Chart must evaluate all 9 tactical zones');
  for (const z of depthZones) {
    assert.ok(['strong', 'balanced', 'weak'].includes(z.grade));
  }

  const mentor = myPlayers.find((p) => parseInt(p.dateOfBirth.slice(0, 4), 10) <= 2000)!;
  const mentees = myPlayers
    .filter((p) => parseInt(p.dateOfBirth.slice(0, 4), 10) >= 2004)
    .slice(0, 2);
  const savedGroupRes = saveMentoringGroup(
    world,
    mentor.id,
    mentees.map((m) => m.id)
  );
  assert.ok(
    (savedGroupRes.nextState.mentoringGroups || []).some((g) => g.mentorId === mentor.id),
    'saveMentoringGroup must persist the mentoring group in world state'
  );

  const targetGroup = savedGroupRes.nextState.mentoringGroups!.find(
    (g) => g.mentorId === mentor.id
  )!;
  const removedGroupRes = removeMentoringGroup(savedGroupRes.nextState, targetGroup.id);
  assert.equal(
    removedGroupRes.nextState.mentoringGroups!.some((g) => g.id === targetGroup.id),
    false,
    'removeMentoringGroup must remove the group'
  );

  // Checkpoint 12: Transfer Deadline Day Hub, Release Clause Activation, Trophy Cabinet & Ballon d'Or Gala
  assert.equal(isTransferDeadlineWindow('2025-08-28'), true);
  assert.equal(isTransferDeadlineWindow('2026-01-30'), true);
  assert.equal(isTransferDeadlineWindow('2025-10-15'), false);

  const bargains = getDeadlineDayBargains(world);
  assert.ok(bargains.length >= 5);
  for (const b of bargains) {
    assert.ok(
      b.bargainPrice < b.originalPrice,
      'Deadline Day bargain fee must be discounted by 25% below originalPrice'
    );
  }

  // Test Release Clause immediate activation with boosted budget
  const richWorld = {
    ...world,
    clubs: {
      ...world.clubs,
      [myClub.id]: {
        ...myClub,
        finances: {
          ...myClub.finances,
          balance: 250_000_000,
          transferBudget: 200_000_000,
          wageBudgetPerWeek: myClub.finances.wageBudgetPerWeek + 500_000,
        },
      },
    },
  };
  const clauseTarget = Object.values(richWorld.players).find(
    (p) => p.clubId !== myClub.id && p.releaseClause && p.releaseClause <= 120_000_000
  )!;
  assert.ok(clauseTarget, 'Must find a player with an active Release Clause');
  const clauseRes = activateReleaseClauseTransfer(richWorld, clauseTarget.id, false);
  assert.equal(clauseRes.outcome, 'COMPLETED');
  assert.equal(clauseRes.nextState.players[clauseTarget.id].clubId, myClub.id);

  // Verify initial & rollover Trophy Cabinet + Annual Awards Gala (Ballon d'Or / Golden Boot / Golden Boy)
  assert.ok((world.trophyHistory || []).length >= 5, 'Initial world must seed Trophy Cabinet history');
  assert.ok(
    (world.seasonAwardsHistory || []).length >= 1,
    'Initial world must seed Season Awards Gala history'
  );

  const afterRollover = processEndOfSeasonRollover(clauseRes.nextState).nextState;
  assert.ok(
    (afterRollover.trophyHistory || []).length > (world.trophyHistory || []).length,
    'Season rollover must append new domestic and UEFA champions to trophyHistory'
  );
  assert.ok(
    (afterRollover.seasonAwardsHistory || []).length > (world.seasonAwardsHistory || []).length,
    'Season rollover must crown new Ballon d\'Or, Golden Boot, and Golden Boy winners'
  );

  // Verify Cloud Firestore dehydration/rehydration preserves mentoringGroups, trophyHistory, and seasonAwardsHistory
  const dehydrated = dehydrateWorldStateToCareerMap(afterRollover);
  const rehydrated = rehydrateWorldStateFromCareerDoc({
    ownerId: 'u_test_phase3',
    slotId: 'slot_1',
    saveName: afterRollover.saveName,
    clubName: myClub.name,
    managerName: afterRollover.manager.name,
    gameDate: afterRollover.gameDate,
    season: afterRollover.currentSeason,
    lastSavedAtIso: '2026-11-12T00:00:00.000Z',
    randomSeed: afterRollover.randomSeed,
    controlledClubId: afterRollover.controlledClubId,
    careerState: dehydrated,
  });
  assert.equal(
    rehydrated.trophyHistory?.length,
    afterRollover.trophyHistory?.length,
    'Rehydrated state must preserve trophyHistory'
  );
  assert.equal(
    rehydrated.seasonAwardsHistory?.length,
    afterRollover.seasonAwardsHistory?.length,
    'Rehydrated state must preserve seasonAwardsHistory'
  );
});

test('Phase 4 (Checkpoints 13–17): International Management & INT_EURO, Stadium Expansion, Pre-Season Tours, FFP/PSR, AI Managerial Carousel, Rivalry Mind Games, Create-a-Club & Scenario Challenges', () => {
  // Checkpoint 17: Create-a-Club + Scenario Challenges (POINTS_DEDUCTION, INJURY_CRISIS, YOUTH_ONLY)
  const deductedWorld = createInitialWorldState(
    30301,
    { name: 'Custom Boss' },
    'club_eng_pl_1',
    'POINTS_DEDUCTION',
    {
      enabled: true,
      name: 'London Phoenix FC',
      shortName: 'LPF',
      primaryColor: '#10b981',
      secondaryColor: '#0f172a',
      stadiumName: 'Phoenix Stadium',
    }
  );
  const customClub = deductedWorld.clubs[deductedWorld.controlledClubId];
  assert.equal(customClub.name, 'London Phoenix FC');
  assert.equal(customClub.shortName, 'LPF');
  assert.equal(customClub.stadiumName, 'Phoenix Stadium');
  assert.equal(customClub.pointsDeduction, 10);

  const plRow = deductedWorld.standings.ENG_PL.find((s) => s.clubId === customClub.id)!;
  assert.equal(plRow.points, -10, 'POINTS_DEDUCTION scenario must start club at -10 points');

  const injuryWorld = createInitialWorldState(
    30302,
    { name: 'Crisis Boss' },
    'club_eng_pl_1',
    'INJURY_CRISIS'
  );
  const injuredStars = Object.values(injuryWorld.players).filter(
    (p) => p.clubId === injuryWorld.controlledClubId && p.injuryStatus.isInjured
  );
  assert.ok(injuredStars.length >= 5, 'INJURY_CRISIS scenario must injure top 5 outfield stars');

  const youthOnlyWorld = createInitialWorldState(
    30303,
    { name: 'Academy Boss' },
    'club_eng_pl_1',
    'YOUTH_ONLY'
  );
  const youthOnlyClub = youthOnlyWorld.clubs[youthOnlyWorld.controlledClubId];
  assert.equal(youthOnlyClub.youthFacilities, 20);
  assert.equal(youthOnlyClub.transferEmbargoUntil, '2099-12-31');

  // Checkpoint 13: Dual National Team Management, FIFA Call-ups & INT_EURO Knockout Tournament
  const ntAppointed = appointNationalTeamManager(deductedWorld, 'ENG');
  assert.equal(ntAppointed.nextState.controlledNationalTeamCode, 'ENG');

  const fifaBreak = triggerFifaInternationalBreak(ntAppointed.nextState);
  assert.ok(fifaBreak.calledUpCount > 0, 'FIFA International Break must call up CA >= 135 players');

  const euroFixesInitial = fifaBreak.nextState.fixtures.filter((f) => f.competitionId === 'INT_EURO');
  assert.equal(euroFixesInitial.length, 4, 'Initial INT_EURO tournament must have 4 QF fixtures');

  const afterQF = simulateEuroCupNextStage(fifaBreak.nextState).nextState;
  const euroSF = afterQF.fixtures.filter((f) => f.competitionId === 'INT_EURO' && f.uefaStage === 'SF');
  assert.equal(euroSF.length, 2, 'Completing INT_EURO QF must generate 2 SF fixtures');

  const afterSF = simulateEuroCupNextStage(afterQF).nextState;
  const euroFinal = afterSF.fixtures.filter(
    (f) => f.competitionId === 'INT_EURO' && f.uefaStage === 'FINAL'
  );
  assert.equal(euroFinal.length, 1, 'Completing INT_EURO SF must generate 1 FINAL fixture');

  const afterFinal = simulateEuroCupNextStage(afterSF).nextState;
  assert.ok(
    (afterFinal.trophyHistory || []).some((t) => t.competitionId === 'INT_EURO'),
    'Completing INT_EURO Final must record the European Nations Cup winner in trophyHistory'
  );

  // Checkpoint 14: Stadium Expansion, Pre-Season Commercial Tour & FFP / PSR Evaluation
  const richState = {
    ...afterFinal,
    clubs: {
      ...afterFinal.clubs,
      [customClub.id]: {
        ...afterFinal.clubs[customClub.id],
        finances: {
          ...afterFinal.clubs[customClub.id].finances,
          balance: 80_000_000,
        },
      },
    },
  };
  const beforeCap = richState.clubs[customClub.id].stadiumCapacity;
  const expanded = expandClubStadium(richState);
  assert.equal(expanded.success, true);
  assert.equal(expanded.nextState.clubs[customClub.id].stadiumCapacity, beforeCap + 8_000);

  const toured = organizePreSeasonTour(expanded.nextState, 'ASIA');
  assert.equal(toured.success, true);
  assert.equal(
    toured.nextState.clubs[customClub.id].preSeasonTourCompletedSeason,
    toured.nextState.currentSeason
  );

  const ffp = evaluateClubFFPStatus(toured.nextState, customClub.id);
  assert.equal(ffp.status, 'COMPLIANT');

  // Checkpoint 15: Pre-Match Rivalry Mind Games & AI Managerial Carousel
  const mindGameRes = sendPreMatchMindGame(toured.nextState, 'attack');
  assert.ok(mindGameRes.nextState.lastMindGameMatchday !== null);
  assert.ok(mindGameRes.message.length > 0);

  const carouselRes = triggerAIManagerialCarouselCheck(mindGameRes.nextState);
  assert.ok(carouselRes.nextState);

  // Verify Cloud Save dehydration & rehydration preserves Phase 4 fields
  const dehydrated = dehydrateWorldStateToCareerMap(mindGameRes.nextState);
  const rehydrated = rehydrateWorldStateFromCareerDoc({
    ownerId: 'u_test_phase4',
    slotId: 'slot_1',
    saveName: mindGameRes.nextState.saveName,
    clubName: customClub.name,
    managerName: mindGameRes.nextState.manager.name,
    gameDate: mindGameRes.nextState.gameDate,
    season: mindGameRes.nextState.currentSeason,
    lastSavedAtIso: '2026-11-12T00:00:00.000Z',
    randomSeed: mindGameRes.nextState.randomSeed,
    controlledClubId: mindGameRes.nextState.controlledClubId,
    careerState: dehydrated,
  });
  assert.equal(rehydrated.controlledNationalTeamCode, 'ENG');
  assert.equal(rehydrated.scenarioChallenge, 'POINTS_DEDUCTION');
  assert.equal(rehydrated.customClubConfig?.name, 'London Phoenix FC');
});

test('Phase 5 & Phase 6 (Checkpoints 18-27): Weather Physics, UEFA Dynamic Qualification, In-Game Editor, Hall of Fame, Exhibition Clash, Super-Club Bids, South America Scouting, Club World Cup, Medical Center, Supporter Feed & Affiliate Clubs', () => {
  const world = createInitialWorldState(50607);
  const myClubId = world.controlledClubId;

  // Checkpoint 19: Weather Physics & Pitch Condition in MatchResult
  const fx = world.fixtures[0];
  const hc = world.clubs[fx.homeClubId];
  const ac = world.clubs[fx.awayClubId];
  const matchRes = simulateMatch(fx, hc, ac, world.players, 8080);
  assert.ok(matchRes.weather, 'MatchResult must include deterministic weather condition');
  assert.ok(matchRes.pitchCondition, 'MatchResult must include deterministic pitchCondition');

  // Checkpoint 20: In-Game Database Editor, Create-a-Player & JSON Export/Import
  const created = createCustomPlayerInWorld(world, {
    firstName: 'Estevao',
    lastName: 'Wonderkid',
    nationality: 'BRA',
    position: 'AMR',
    age: 17,
    currentAbility: 156,
    potentialAbility: 196,
    clubId: myClubId,
  });
  assert.equal(created.player.firstName, 'Estevao');
  assert.equal(created.player.currentAbility, 156);
  assert.equal(created.player.potentialAbility, 196);
  assert.equal(created.nextState.players[created.player.id].clubId, myClubId);

  const editedClub = liveEditClubFinancesAndFacilities(created.nextState, {
    clubId: myClubId,
    transferBudgetM: 185,
    trainingFacilities: 20,
  });
  assert.equal(editedClub.nextState.clubs[myClubId].finances.transferBudget, 185_000_000);
  assert.equal(editedClub.nextState.clubs[myClubId].trainingFacilities, 20);

  const exportedJson = exportWorldDatabaseJson(editedClub.nextState);
  assert.ok(exportedJson.includes('touchline-db-v1'));
  const imported = importWorldDatabaseJson(world, exportedJson);
  assert.equal(imported.success, true);
  assert.equal(imported.nextState.clubs[myClubId].finances.transferBudget, 185_000_000);

  // Checkpoint 21: All-Time Hall of Fame Leaderboard & Exhibition Club Clash
  const hof = computeHallOfFameLeaderboard(imported.nextState);
  assert.ok(hof.length >= 6);
  assert.equal(hof.some((e) => e.isUser), true);

  const clash = simulateExhibitionClash(imported.nextState, 'club_eng_pl_1', 'club_esp_ll_1');
  assert.ok(clash.summary.includes('-'));
  assert.ok(clash.result.weather);

  // Checkpoint 23: Saudi / MLS Super-Club Bid, South America Scouting & FIFA Club World Cup (GLB_CWC)
  const superBid = triggerGlobalSuperClubBid(imported.nextState);
  assert.equal(superBid.nextState.transferOffers.length, imported.nextState.transferOffers.length + 1);
  assert.equal(superBid.nextState.transferOffers[0].status, 'PendingClub');

  const saScout = dispatchSouthAmericaWonderkidScout(superBid.nextState);
  assert.equal(saScout.nextState.scoutAssignments[0].regionOrLeague, 'SOUTH_AMERICA');
  assert.equal(['BRA', 'ARG'].includes(saScout.wonderkid.nationality), true);

  const cwcQF = simulateClubWorldCupNextStage(saScout.nextState).nextState;
  const cwcSF = simulateClubWorldCupNextStage(cwcQF).nextState;
  const cwcFinal = simulateClubWorldCupNextStage(cwcSF).nextState;
  assert.equal(
    (cwcFinal.trophyHistory || []).some((t) => t.competitionId === 'GLB_CWC'),
    true,
    'Completing GLB_CWC Final must record FIFA Club World Cup champion in trophyHistory'
  );

  // Checkpoint 24: Medical Center Risk Matrix & Preventative Rest
  const riskMatrix = evaluateSquadMedicalRisk(cwcFinal, myClubId);
  assert.ok(riskMatrix.length >= 11);
  const targetRestPlayer = riskMatrix[0];
  const rested = prescribePlayerMedicalRest(cwcFinal, targetRestPlayer.playerId);
  assert.equal(
    rested.nextState.players[targetRestPlayer.playerId].individualTraining.intensity,
    'Light'
  );
  assert.ok(
    rested.nextState.players[targetRestPlayer.playerId].fitness >= targetRestPlayer.fitness
  );

  // Checkpoint 25: Supporter Confidence & Fan Social Feed
  const suppConf = getClubSupporterConfidence(rested.nextState, myClubId);
  assert.ok(suppConf >= 15 && suppConf <= 100);
  const feed = getFanSocialFeed(rested.nextState);
  assert.ok(feed.length >= 3);

  // Checkpoint 26: Affiliate / Feeder Club Request & Development Loan + Advanced Transfer Clauses
  const affReq = requestAffiliateFeederClub(rested.nextState);
  assert.equal((affReq.nextState.clubs[myClubId].affiliateClubIds || []).length, 1);
  const loanRes = sendPlayerToAffiliateLoan(affReq.nextState, created.player.id);
  assert.equal(
    loanRes.nextState.players[created.player.id].clubId,
    affReq.nextState.clubs[myClubId].affiliateClubIds![0]
  );

  // Checkpoint 18: Dynamic UEFA Qualification on End-of-Season Rollover
  const rolledOver = processEndOfSeasonRollover(loanRes.nextState);
  assert.equal(rolledOver.nextState.uefaStandings?.UEFA_UCL?.length, 36);
  assert.equal(rolledOver.nextState.uefaStandings?.UEFA_UEL?.length, 36);
  assert.equal(rolledOver.nextState.uefaStandings?.UEFA_UECL?.length, 36);
});

test('FM26/FM27 Complete Audit: Authentic Squad Shirt Numbers (1-99), Dynamic AI Live Match Management & Trait Commentary', () => {
  const world = createInitialWorldState(778899);
  const allPlayers = Object.values(world.players);

  // Every player must have a valid shirtNumber between 1 and 99
  for (const p of allPlayers) {
    assert.ok(
      typeof p.shirtNumber === 'number' && p.shirtNumber >= 1 && p.shirtNumber <= 99,
      `Player ${p.firstName} ${p.lastName} must have a valid shirtNumber (1-99), got ${p.shirtNumber}`
    );
  }

  // Verify iconic real squad numbers
  const findByName = (full: string) =>
    allPlayers.find((p) => `${p.firstName} ${p.lastName}` === full);
  assert.equal(findByName('Bukayo Saka')?.shirtNumber, 7);
  assert.equal(findByName('Mohamed Salah')?.shirtNumber, 11);
  assert.equal(findByName('Erling Haaland')?.shirtNumber, 9);
  assert.equal(findByName('Cole Palmer')?.shirtNumber, 20);
  assert.equal(findByName('Lamine Yamal')?.shirtNumber, 19);
  assert.equal(findByName('Declan Rice')?.shirtNumber, 41);

  // Verify Dynamic AI Live Match Management & Substitution events at minutes 62 / 76
  const fx = world.fixtures[0];
  const home = world.clubs[fx.homeClubId];
  const away = world.clubs[fx.awayClubId];
  const res = simulateMatch(fx, home, away, world.players, 2027);
  const subOrTacticalEvents = res.events.filter(
    (e) => e.eventType === 'Substitution' || e.text.includes('Tactical Shift')
  );
  assert.ok(
    subOrTacticalEvents.length >= 1,
    'Simulated match must include AI live tactical shifts or substitutions at minutes 62/76'
  );
  const subEvents = res.events.filter((e) => e.eventType === 'Substitution');
  for (const subEv of subEvents) {
    assert.ok(subEv.subOutPlayerId, 'Substitution event must populate subOutPlayerId');
    assert.ok(subEv.subInPlayerId, 'Substitution event must populate subInPlayerId');
  }
});

test('Next-Stage Master Plan: Team Talk Morale Persistence, Opposition Instructions, Offer to Clubs, Incoming Bid Negotiation + Buy-Back Clause, and 6-Category Player Leaders', () => {
  let world = createInitialWorldState(994422);
  const myClubId = world.controlledClubId;
  const myClub = world.clubs[myClubId];
  const myPlayers = Object.values(world.players).filter((p) => p.clubId === myClubId);

  // 1. Pre-Match & Post-Match Team Talk persistence into WorldState
  const starterId = myClub.primaryTactic.lineup[0]?.playerId!;
  const initialMorale = world.players[starterId].morale;
  const talkRes = applyPostMatchTeamTalk(world, 'praise_ft');
  assert.ok(
    talkRes.nextState.players[starterId].morale >= initialMorale,
    'Praise team talk must boost or maintain starter morale in WorldState'
  );
  world = talkRes.nextState;

  // 2. Opposition Instructions applied in simulateMatch
  const fx = world.fixtures.find(
    (f) => f.homeClubId === myClubId || f.awayClubId === myClubId
  )!;
  const oppClubId = fx.homeClubId === myClubId ? fx.awayClubId : fx.homeClubId;
  const oppClub = world.clubs[oppClubId];
  const oppStarterId = oppClub.primaryTactic.lineup[9]?.playerId!;
  const clubWithOI: typeof myClub = {
    ...world.clubs[myClubId],
    primaryTactic: {
      ...world.clubs[myClubId].primaryTactic,
      oppositionInstructions: {
        [oppStarterId]: {
          playerId: oppStarterId,
          tightMarking: 'Always',
          triggerPress: 'Always',
          tackling: 'Hard',
          showOntoFoot: 'Weak Foot',
        },
      },
    },
  };
  const matchWithOI = simulateMatch(
    fx,
    fx.homeClubId === myClubId ? clubWithOI : oppClub,
    fx.awayClubId === myClubId ? clubWithOI : oppClub,
    world.players,
    3030
  );
  assert.ok(matchWithOI.events.length > 0, 'Match with Opposition Instructions must simulate cleanly');

  // 3. Offer Player to Clubs + Incoming Bid Counter-Negotiation with Buy-Back Clause + Exercise Buy-Back Clause
  const playerToSell = myPlayers.sort((a, b) => b.currentAbility - a.currentAbility)[3];
  const offerRes = offerPlayerToClubs(world, playerToSell.id);
  assert.equal(offerRes.bidsCreated >= 1, true, 'Offering player to clubs must generate at least 1 incoming bid');
  world = offerRes.nextState;

  const incomingOffer = world.transferOffers.find(
    (o) => o.playerId === playerToSell.id && o.sellingClubId === myClubId && o.status === 'PendingClub'
  )!;
  assert.ok(incomingOffer, 'Incoming offer for offered player must exist');

  const buyBackFee = 22_000_000;
  const negRes = negotiateIncomingTransferBid(world, incomingOffer.id, {
    upfrontFee: incomingOffer.upfrontFee,
    installmentsFee: 2_000_000,
    sellOnPercentage: 15,
    buyBackClauseFee: buyBackFee,
    forceAccept: true,
  });
  assert.equal(negRes.accepted, true, 'Negotiated sale must be accepted');
  world = negRes.nextState;
  assert.equal(
    world.players[playerToSell.id].clubId,
    incomingOffer.buyingClubId,
    'Sold player must move to buying club'
  );
  assert.equal(
    (world.buyBackClauses || []).length,
    1,
    'Buy-Back clause must be recorded on WorldState'
  );

  // Ensure enough transfer budget to exercise buy-back
  const clause = world.buyBackClauses![0];
  world = {
    ...world,
    clubs: {
      ...world.clubs,
      [myClubId]: {
        ...world.clubs[myClubId],
        finances: {
          ...world.clubs[myClubId].finances,
          transferBudget: Math.max(world.clubs[myClubId].finances.transferBudget, buyBackFee + 5_000_000),
          balance: Math.max(world.clubs[myClubId].finances.balance, buyBackFee + 5_000_000),
        },
      },
    },
  };
  const buyBackRes = exerciseBuyBackClause(world, clause.id);
  assert.equal(buyBackRes.completed, true, 'Exercising buy-back clause must succeed');
  assert.equal(
    buyBackRes.nextState.players[playerToSell.id].clubId,
    myClubId,
    'Player must return to controlled club after exercising buy-back clause'
  );

  // 4. Verify 6-category Player Stat Leaders
  const worldAfterMatch = applyMatchResultToWorld(buyBackRes.nextState, fx.id, matchWithOI);
  const leaders = getLeaguePlayerLeaders(
    myClub.leagueId,
    worldAfterMatch.clubs,
    worldAfterMatch.players
  );
  assert.ok(Array.isArray(leaders.topScorers));
  assert.ok(Array.isArray(leaders.topAssists));
  assert.ok(Array.isArray(leaders.topRated));
  assert.ok(Array.isArray(leaders.topCleanSheets));
  assert.ok(Array.isArray(leaders.topXgOverperformers));
  assert.ok(Array.isArray(leaders.topDefensiveMonsters));
  assert.ok(leaders.topDefensiveMonsters.length > 0, 'Defensive Monsters leaderboard must be populated');
});

test('Stage 3 Complete Edition: Set-Piece Threat Score, 1-on-1 Player Chat, Squad Meeting, Coaching License RPG, Board Ambition & 7-Day Calendar Strip', () => {
  let world = createInitialWorldState(30303);
  const myClubId = world.controlledClubId;
  const myClub = world.clubs[myClubId];
  const squad = Object.values(world.players).filter((p) => p.clubId === myClubId);

  // 1. Set-Piece Threat Score
  const baseThreat = computeSetPieceThreatScore(myClub.primaryTactic, world.players, squad);
  assert.ok(baseThreat >= 35 && baseThreat <= 99, `Set-piece threat score must be between 35 and 99 (got ${baseThreat})`);

  const customTactic = {
    ...myClub.primaryTactic,
    setPieces: {
      ...myClub.primaryTactic.setPieces!,
      cornerDeliverySwing: 'inswinger' as const,
      boxAssignments: {
        near_post: squad[0].id,
        far_post: squad[1].id,
        challenge_keeper: squad[2].id,
        lurk_edge: squad[3].id,
        stay_back_1: squad[4].id,
        stay_back_2: squad[5].id,
      },
    },
  };
  const assignedThreat = computeSetPieceThreatScore(customTactic, world.players, squad);
  assert.ok(assignedThreat >= baseThreat, 'Assigning 6 box roles must boost or maintain Set-Piece Threat Score');

  // 2. 1-on-1 Player Chat (EXPLAIN_ROTATION clears unhappyReason & consecutiveBenched)
  const targetPlayer = squad[0];
  world = {
    ...world,
    players: {
      ...world.players,
      [targetPlayer.id]: {
        ...targetPlayer,
        morale: 52,
        consecutiveBenched: 4,
        unhappyReason: 'Frustrated by lack of starts',
      },
    },
  };
  const chatRes = conductOneOnOnePlayerChat(world, targetPlayer.id, 'EXPLAIN_ROTATION');
  world = chatRes.nextState;
  assert.ok(chatRes.moraleDelta > 0, 'Explaining rotation must increase player morale');
  assert.equal(world.players[targetPlayer.id].consecutiveBenched, 0);
  assert.equal(world.players[targetPlayer.id].unhappyReason, null);

  // 3. Emergency Squad Meeting
  const meetRes = holdEmergencySquadMeeting(world, 'RALLY_MORALE');
  assert.equal(meetRes.boostedCount > 0, true, 'Squad meeting must boost dressing-room players');
  assert.equal(meetRes.avgMoraleDelta > 0, true, 'Squad meeting must provide positive morale delta');
  world = meetRes.nextState;
  const repeatMeet = holdEmergencySquadMeeting(world, 'RALLY_MORALE');
  assert.equal(repeatMeet.boostedCount, 0, 'Squad meeting must enforce 21-day cooldown');

  // 4. Coaching License RPG Progression
  const studyRes = studyNextCoachingLicense(world);
  assert.equal(studyRes.newBadge, 'Continental B', 'Manager must upgrade to Continental B coaching license');
  world = studyRes.nextState;
  assert.equal(world.manager.coachingBadge, 'Continental B');

  // 5. Board Season Vision & Ambition Negotiation (+20% Transfer Budget for Ambitious)
  const budgetBefore = world.clubs[myClubId].finances.transferBudget;
  const ambRes = negotiateBoardSeasonAmbition(world, 'Ambitious');
  world = ambRes.nextState;
  assert.equal(world.clubs[myClubId].boardExpectations.seasonAmbition, 'Ambitious');
  assert.ok(
    world.clubs[myClubId].finances.transferBudget > budgetBefore,
    'Ambitious board vision must increase transfer budget by 20%'
  );

  // 6. 7-Day Interactive Calendar Strip
  const calendar7 = buildSevenDayCalendarStrip(world);
  assert.equal(calendar7.length, 7, '7-Day Calendar Strip must return 7 days');
  assert.equal(calendar7[0].date, world.gameDate);
});

test('Phase 1 Save System Overhaul (5 Critical Save Bug Fixes) & FotMob League Logos', () => {
  // 1. Verify FotMob league logos exist on all 15 leagues
  for (const league of Object.values(LEAGUES_CONFIG)) {
    assert.ok(
      league.logoUrl && league.logoUrl.includes('images.fotmob.com/image_resources/logo/leaguelogo/dark/'),
      `League ${league.id} must have an official FotMob dark logoUrl`
    );
  }

  // 2. Verify getNextAvailableManualSaveSlot cycles through slot_1..slot_4 without creating invisible slots
  assert.equal(getNextAvailableManualSaveSlot([]), 'slot_1');
  assert.equal(
    getNextAvailableManualSaveSlot([
      {
        slotId: 'slot_1',
        saveName: 'S1',
        clubName: 'Arsenal',
        managerName: 'M',
        gameDate: '2025-08-01',
        season: '2025/26',
        lastSavedAt: '2026-01-01T00:00:00Z',
      },
    ]),
    'slot_2'
  );

  // 3. Verify extra Scheduled cup knockout fixtures + buyBackClauses + playerDiff fields survive save/load
  let world = createInitialWorldState(40404);
  const myClubId = world.controlledClubId;
  const aiPlayer = Object.values(world.players).find(
    (p) => p.clubId !== myClubId && world.clubs[p.clubId]?.leagueId === world.clubs[myClubId]?.leagueId
  )!;

  const customCupFixtureId = 'cup_qf_extra_tie_1';
  world = {
    ...world,
    lastSquadMeetingDate: '2025-09-10',
    buyBackClauses: [
      {
        id: 'bb_test_1',
        playerId: aiPlayer.id,
        playerName: `${aiPlayer.firstName} ${aiPlayer.lastName}`,
        soldToClubId: aiPlayer.clubId,
        soldToClubName: world.clubs[aiPlayer.clubId].name,
        buyBackFee: 28_000_000,
        expiresSeason: '2027/28',
        createdDate: '2025-08-20',
      },
    ],
    players: {
      ...world.players,
      [aiPlayer.id]: {
        ...aiPlayer,
        shirtNumber: 99,
        squadStatus: 'Star Player',
        consecutiveBenched: 3,
        stats: {
          ...aiPlayer.stats,
          appearances: 5,
          goals: 3,
        },
      },
    },
    fixtures: [
      ...world.fixtures,
      {
        id: customCupFixtureId,
        competitionId: 'ENG_CUP',
        seasonId: world.currentSeason,
        matchday: 3,
        kickoffDate: '2026-02-14',
        homeClubId: myClubId,
        awayClubId: aiPlayer.clubId,
        status: 'Scheduled',
      },
    ],
  };

  const careerStateS1 = dehydrateWorldStateToCareerMap(world);
  const rehydratedS1 = rehydrateWorldStateFromCareerDoc({
    ownerId: 'u1',
    slotId: 'slot_1',
    saveName: 'Test S1',
    clubName: world.clubs[myClubId].name,
    managerName: world.manager.name,
    gameDate: world.gameDate,
    season: world.currentSeason,
    lastSavedAtIso: '2026-11-16T00:00:00Z',
    randomSeed: world.randomSeed,
    controlledClubId: myClubId,
    careerState: careerStateS1,
  });

  assert.equal(rehydratedS1.buyBackClauses?.length, 1, 'buyBackClauses must be preserved on load');
  assert.equal(rehydratedS1.lastSquadMeetingDate, '2025-09-10', 'lastSquadMeetingDate must be preserved');
  assert.equal(rehydratedS1.players[aiPlayer.id].shirtNumber, 99, 'AI player shirtNumber must be preserved in playerDiffs');
  assert.equal(rehydratedS1.players[aiPlayer.id].consecutiveBenched, 3, 'AI player consecutiveBenched must be preserved');
  assert.ok(
    rehydratedS1.fixtures.some((f) => f.id === customCupFixtureId && f.status === 'Scheduled'),
    'Scheduled cup knockout tie must be preserved on load'
  );

  // 4. Verify Season 2+ (2026/27) scheduled fixtures survive save/load after processEndOfSeasonRollover
  const rolled = processEndOfSeasonRollover(world).nextState;
  const s2ScheduledCountBefore = rolled.fixtures.filter((f) => f.status === 'Scheduled').length;
  assert.ok(s2ScheduledCountBefore > 200, 'Season 2 must have scheduled league and cup fixtures');

  const careerStateS2 = dehydrateWorldStateToCareerMap(rolled);
  const rehydratedS2 = rehydrateWorldStateFromCareerDoc({
    ownerId: 'u1',
    slotId: 'slot_2',
    saveName: 'Test S2',
    clubName: rolled.clubs[myClubId].name,
    managerName: rolled.manager.name,
    gameDate: rolled.gameDate,
    season: rolled.currentSeason,
    lastSavedAtIso: '2026-11-16T01:00:00Z',
    randomSeed: rolled.randomSeed,
    controlledClubId: myClubId,
    careerState: careerStateS2,
  });

  const s2ScheduledCountAfter = rehydratedS2.fixtures.filter((f) => f.status === 'Scheduled').length;
  assert.equal(
    s2ScheduledCountAfter,
    s2ScheduledCountBefore,
    'Season 2 scheduled fixtures must be 100% restored upon loading save'
  );
});

test('Stage 4 Hotfixes (1D Firestore uefaPots, Coaching License Buffs) & Loan/Worm/Headhunting Systems', () => {
  let world = createInitialWorldState(50505);
  const myClubId = world.controlledClubId;

  // 1. Hotfix 1: uefaPots must be flattened to 1D string[] in dehydrateWorldStateToCareerMap (no nested arrays)
  const careerMap = dehydrateWorldStateToCareerMap(world);
  assert.ok(careerMap.uefaPots, 'careerMap must contain uefaPots');
  assert.equal(Array.isArray(careerMap.uefaPots?.UEFA_UCL), true);
  assert.equal(careerMap.uefaPots?.UEFA_UCL.length, 36, 'Flattened UEFA_UCL pot list must have 36 club IDs');
  assert.equal(
    typeof careerMap.uefaPots?.UEFA_UCL[0],
    'string',
    'Each element of flattened uefaPots must be a string (no nested arrays for Cloud Firestore)'
  );

  const rehydrated = rehydrateWorldStateFromCareerDoc({
    ownerId: 'u_test',
    slotId: 'slot_1',
    saveName: 'Flat Pots Check',
    clubName: world.clubs[myClubId].name,
    managerName: world.manager.name,
    gameDate: world.gameDate,
    season: world.currentSeason,
    lastSavedAtIso: '2026-11-16T00:00:00Z',
    randomSeed: world.randomSeed,
    controlledClubId: myClubId,
    careerState: careerMap,
  });
  assert.equal(rehydrated.uefaPots!.UEFA_UCL.length, 4, 'Rehydrated UEFA_UCL must have 4 pots');
  assert.equal(rehydrated.uefaPots!.UEFA_UCL[0].length, 9, 'Each rehydrated pot must have 9 clubs');
  assert.deepEqual(rehydrated.uefaPots!.UEFA_UCL, world.uefaPots!.UEFA_UCL);

  // 2. Hotfix 3: Coaching License 21-day course + active modifiers
  const proMods = getCoachingLicenseModifiers('UEFA Pro');
  assert.equal(proMods.familiarityMultiplier, 1.15);
  assert.equal(proMods.trainingGrowthMultiplier, 1.1);
  assert.equal(proMods.wageDemandMultiplier, 0.9);

  const courseRes = studyNextCoachingLicense(world, 'COURSE_21D');
  world = courseRes.nextState;
  assert.equal(world.manager.studyingBadge?.targetBadge, 'Continental B');
  // Fast-forward gameDate to completionDate and advance 1 day
  world = {
    ...world,
    gameDate: world.manager.studyingBadge!.completionDate,
  };
  world = advanceWorldOneDay(world).nextState;
  assert.equal(world.manager.coachingBadge, 'Continental B', 'Manager must auto-graduate on completionDate');
  assert.equal(world.manager.studyingBadge, null);

  // 3. Phase 3: Loan Tracker Hub (Send on loan -> Recall from loan, and Loan in -> Trigger Option-to-Buy)
  const affRes = requestAffiliateFeederClub(world);
  world = affRes.nextState;
  const youngPlayer = Object.values(world.players).find((p) => p.clubId === myClubId)!;
  const loanOutRes = sendPlayerToAffiliateLoan(world, youngPlayer.id);
  world = loanOutRes.nextState;
  assert.equal(world.players[youngPlayer.id].loanedFromClubId, myClubId);
  assert.notEqual(world.players[youngPlayer.id].clubId, myClubId);

  const recallRes = recallPlayerFromLoan(world, youngPlayer.id);
  assert.equal(recallRes.success, true, 'Must recall loaned-out player back to parent club');
  world = recallRes.nextState;
  assert.equal(world.players[youngPlayer.id].clubId, myClubId);
  assert.equal(world.players[youngPlayer.id].loanedFromClubId, null);

  // Loan in a player with Option-to-Buy and trigger permanent signing
  const externalLoanTarget = Object.values(world.players).find(
    (p) => p.clubId !== myClubId && p.marketValue < 15_000_000
  )!;
  const parentClubId = externalLoanTarget.clubId;
  world = {
    ...world,
    players: {
      ...world.players,
      [externalLoanTarget.id]: {
        ...externalLoanTarget,
        clubId: myClubId,
        loanedFromClubId: parentClubId,
        loanOptionToBuyFee: 5_000_000,
      },
    },
  };
  const buyRes = triggerLoanOptionToBuy(world, externalLoanTarget.id);
  assert.equal(buyRes.success, true, 'Must trigger Option-to-Buy and complete permanent transfer');
  world = buyRes.nextState;
  assert.equal(world.players[externalLoanTarget.id].clubId, myClubId);
  assert.equal(world.players[externalLoanTarget.id].loanedFromClubId, null);

  // 4. Phase 4: League Position Worm Chart & Headhunting Job Offers
  const wormData = computeLeaguePositionWormData(world, world.clubs[myClubId].leagueId);
  assert.equal(wormData.totalClubs, 20, 'Premier League Worm Chart must track 20 clubs');
  assert.ok(wormData.series.length >= 3, 'Worm Chart must return user club + top rival series');
  assert.ok(wormData.series[0].positions.length >= 8, 'Each series must have matchday rank points');

  const carouselRes = triggerAIManagerialCarouselCheck(world);
  world = carouselRes.nextState;
  const jobOfferItem = world.inbox.find((n) =>
    n.pressConferenceOptions?.some((o) => o.id.startsWith('headhunt_accept_'))
  );
  assert.ok(jobOfferItem, 'AI Managerial Carousel must include a Headhunting Job Offer in Inbox');

  const loyaltyOpt = jobOfferItem!.pressConferenceOptions!.find((o) =>
    o.id.startsWith('headhunt_loyalty_')
  )!;
  const acceptOpt = jobOfferItem!.pressConferenceOptions!.find((o) =>
    o.id.startsWith('headhunt_accept_')
  )!;

  const loyaltyRes = respondToPressConferenceOrJobOffer(world, jobOfferItem!.id, loyaltyOpt.id);
  assert.equal(
    loyaltyRes.nextState.controlledClubId,
    myClubId,
    'Rejecting job offer must keep manager at current club and boost board confidence'
  );

  const acceptRes = respondToPressConferenceOrJobOffer(world, jobOfferItem!.id, acceptOpt.id);
  assert.equal(
    acceptRes.nextState.controlledClubId,
    jobOfferItem!.relatedClubId,
    'Accepting headhunting job offer must switch controlledClubId to the approaching club'
  );
  assert.equal(acceptRes.switchedClub, true);
});

test('Stage 5 Complete Suite: Weekly Training Risers & Staff Advice, Arrange Friendly Match, and U21 Youth Matchday Simulator', () => {
  let world = createInitialWorldState(77777);
  const myClubId = world.controlledClubId;

  // 1. Weekly Training Report & Backroom Staff Advice
  const report = getWeeklyTrainingReportAndAdvice(world);
  assert.equal(report.topRisers.length, 4, 'Must return top 4 Weekly Training Risers');
  assert.ok(report.topRisers[0].weeklyScore >= 5.0, 'Top training riser must have weeklyScore >= 5.0');
  assert.ok(report.staffAdvice.length >= 1, 'Backroom Staff Meeting must return actionable advice items');

  const firstRiserId = report.topRisers[0].playerId;
  const intensityRes = setPlayerIndividualTrainingIntensity(world, firstRiserId, 'Light');
  world = intensityRes.nextState;
  assert.equal(world.players[firstRiserId].individualTraining.intensity, 'Light');

  // 2. Arrange Friendly Match (Gate Receipts + Squad Fitness Boost)
  const prevBalance = world.clubs[myClubId].finances.balance;
  const friendlyRes = arrangeFriendlyMatch(world, 'GIANT');
  world = friendlyRes.nextState;
  assert.equal(
    world.clubs[myClubId].finances.balance,
    prevBalance + 2_800_000,
    'Friendly vs European Giant must add €2.8M gate receipts to club balance'
  );

  // 3. Simulate U21 Youth & Reserves Matchday
  const u21Res = simulateU21YouthAndReservesMatchday(world);
  world = u21Res.nextState;
  assert.ok(u21Res.message.includes('U21'), 'U21 Youth Matchday must return match summary');
  assert.equal(world.inbox[0].title.includes('U21'), true);
});

test('Stage 6 Complete Suite: 100% Zero-LocalStorage Save Purge & End-of-Season Review Gala Summary', () => {
  const world = createInitialWorldState(88888);

  // 1. Verify purgeLegacyLocalSaves executes cleanly
  const purged = purgeLegacyLocalSaves();
  assert.equal(purged, 0);

  // 2. Verify processEndOfSeasonRollover returns structured seasonSummary for the Season Review Gala modal
  const rollover = processEndOfSeasonRollover(world);
  assert.ok(rollover.seasonSummary, 'processEndOfSeasonRollover must return seasonSummary');
  assert.equal(rollover.seasonSummary.completedSeason, '2025/26');
  assert.equal(rollover.seasonSummary.nextSeason, '2026/27');
  assert.ok(rollover.seasonSummary.finalPosition >= 1 && rollover.seasonSummary.finalPosition <= 20);
  assert.ok(rollover.seasonSummary.leagueChampionName.length > 0);
  assert.ok(rollover.seasonSummary.uclChampionName.length > 0);
  assert.ok(rollover.seasonSummary.clubTopScorerName.length > 0);
  assert.ok(rollover.seasonSummary.totalPrizeAndTvPayout > 10_000_000);
});

test('Stage 7 Complete Suite: Deadline Day Hourly Countdown (08:00-23:00), Live Ballon d\'Or & Golden Boy Power Rankings, All-Time Club Records, and Sign-Out Cache Clear', () => {
  let world = createInitialWorldState(99999);

  // 1. Deadline Day Hourly Countdown (+2 Hours: 08:00 -> 10:00 -> 12:00)
  const step1 = advanceDeadlineDayTwoHours(world);
  assert.equal(step1.currentHour, 10, 'First +2h advance must move clock from 08:00 to 10:00');
  assert.equal(step1.hoursRemaining, 13);
  assert.ok(step1.flashDealPlayerId, 'Must select a Flash Deal (-35%) player');
  assert.ok(step1.tickerHeadline.includes('10:00'), 'Ticker headline must include 10:00 CET timestamp');

  world = step1.nextState;
  const step2 = advanceDeadlineDayTwoHours(world);
  assert.equal(step2.currentHour, 12, 'Second +2h advance must move clock from 10:00 to 12:00');
  assert.equal(step2.hoursRemaining, 11);

  // 2. Live Ballon d'Or & Golden Boy Power Rankings
  const liveRace = getLiveBallonDorAndGoldenBoyRace(world);
  assert.equal(liveRace.ballonDorTop5.length, 5, 'Must return Top 5 Ballon d\'Or contenders');
  assert.equal(liveRace.goldenBoyTop5.length, 5, 'Must return Top 5 U21 Golden Boy contenders');
  assert.ok(
    liveRace.ballonDorTop5[0].powerScore >= liveRace.ballonDorTop5[1].powerScore,
    'Ballon d\'Or contenders must be sorted descending by powerScore'
  );
  for (const gb of liveRace.goldenBoyTop5) {
    assert.ok(gb.age <= 21, 'Golden Boy contenders must all be age <= 21');
  }

  // 3. All-Time Club Records Book
  const records = getClubAllTimeRecords(world, world.controlledClubId);
  assert.equal(records.clubId, world.controlledClubId);
  assert.ok(records.biggestVictory.scoreline.length > 0);
  assert.ok(records.topGoalscorer.playerName.length > 0);
  assert.ok(records.recordSigning.fee > 0);
  assert.ok(records.recordSale.fee > 0);

  // 4. Sign-Out Cache Clear
  saveWorldStateToSlot('slot_1', world, false);
  assert.ok(getSavedSlotsList().length >= 1);
  clearInMemorySaveCache();
  assert.equal(getSavedSlotsList().length, 0, 'clearInMemorySaveCache must empty session save slots');
});

test('Stage 8 Complete Suite: Verified FotMob Cup Logos (2-Step Resolver), 3 League Cups (ENG_LC/POR_LC/SCO_LC), 10 Super Cups, Multi-Tier R32 Draw, Giant-Killing Bonus & UEL/UECL Cup Qualification', () => {
  const world = createInitialWorldState(10808);

  // 1. Verify Fixed FotMob Cup IDs (NED_CUP=235, BEL_CUP=149, TUR_CUP=151, SCO_CUP=137) + League Cups + Super Cups + 2-Step Resolver
  assert.ok(COMPETITION_STYLE_MAP.NED_CUP.fotmobLogoUrl?.endsWith('/235.png'), 'NED_CUP must use FotMob ID 235');
  assert.ok(COMPETITION_STYLE_MAP.BEL_CUP.fotmobLogoUrl?.endsWith('/149.png'), 'BEL_CUP must use FotMob ID 149');
  assert.ok(COMPETITION_STYLE_MAP.TUR_CUP.fotmobLogoUrl?.endsWith('/151.png'), 'TUR_CUP must use FotMob ID 151');
  assert.ok(COMPETITION_STYLE_MAP.SCO_CUP.fotmobLogoUrl?.endsWith('/137.png'), 'SCO_CUP must use FotMob ID 137');
  assert.ok(COMPETITION_STYLE_MAP.ENG_LC.fotmobLogoUrl?.endsWith('/133.png'), 'ENG_LC (Carabao Cup) must use FotMob ID 133');
  assert.ok(COMPETITION_STYLE_MAP.POR_LC.fotmobLogoUrl?.endsWith('/187.png'), 'POR_LC (Taça da Liga) must use FotMob ID 187');
  assert.ok(COMPETITION_STYLE_MAP.SCO_LC.fotmobLogoUrl?.endsWith('/180.png'), 'SCO_LC (Scottish League Cup) must use FotMob ID 180');
  assert.ok(COMPETITION_STYLE_MAP.ENG_SC.fotmobLogoUrl?.endsWith('/247.png'), 'ENG_SC (Community Shield) must use FotMob ID 247');
  assert.ok(COMPETITION_STYLE_MAP.UEFA_USC.fotmobLogoUrl?.endsWith('/74.png'), 'UEFA_USC (UEFA Super Cup) must use FotMob ID 74');

  const resolvedUrls = resolveFotMobCompetitionLogoUrls('NED_CUP');
  assert.ok(
    resolvedUrls.darkUrl?.includes('/leaguelogo/dark/235.png'),
    'Primary URL must point to dark FotMob CDN path'
  );
  assert.ok(
    resolvedUrls.standardUrl?.includes('/leaguelogo/235.png') &&
      !resolvedUrls.standardUrl?.includes('/dark/'),
    'Fallback URL must point to standard non-dark FotMob CDN path'
  );

  // 2. Verify Multi-Tier R32 Draw in 2-Tier Countries (ENG_CUP has 16 R32 fixtures = 32 clubs including Tier 2 Championship clubs)
  const engCupR32 = world.fixtures.filter(
    (f) => f.competitionId === 'ENG_CUP' && f.cupRound === 'R32'
  );
  assert.equal(engCupR32.length, 16, 'ENG_CUP must start at R32 with 16 ties (32 clubs)');
  const engCupClubIds = new Set(engCupR32.flatMap((f) => [f.homeClubId, f.awayClubId]));
  const hasChampionshipClubs = [...engCupClubIds].some(
    (cid) => world.clubs[cid]?.leagueId === 'ENG_CH'
  );
  assert.equal(hasChampionshipClubs, true, 'ENG_CUP R32 must include Tier 2 Championship clubs');

  // 3. Verify 3 Secondary League Cups (ENG_LC, POR_LC, SCO_LC) and 10 Super Cups (ENG_SC..TUR_SC + UEFA_USC) are generated
  const engLcFixes = world.fixtures.filter((f) => f.competitionId === 'ENG_LC');
  const porLcFixes = world.fixtures.filter((f) => f.competitionId === 'POR_LC');
  const scoLcFixes = world.fixtures.filter((f) => f.competitionId === 'SCO_LC');
  assert.equal(engLcFixes.length, 16, 'ENG_LC (Carabao Cup) must start with 16 R32 fixtures');
  assert.equal(porLcFixes.length, 8, 'POR_LC (Allianz Cup) must start with 8 R16 fixtures');
  assert.equal(scoLcFixes.length, 4, 'SCO_LC (Premier Sports Cup) must start with 4 QF fixtures (8 clubs)');

  const superCupIds = [
    'ENG_SC',
    'ESP_SC',
    'GER_SC',
    'ITA_SC',
    'FRA_SC',
    'POR_SC',
    'NED_SC',
    'BEL_SC',
    'TUR_SC',
    'UEFA_USC',
  ];
  for (const scId of superCupIds) {
    const scFix = world.fixtures.find((f) => f.competitionId === scId);
    assert.ok(scFix, `Super Cup ${scId} Final fixture must be scheduled in opening week`);
    assert.equal(scFix!.cupRound, 'FINAL');
  }

  // 4. Verify Round-by-Round Cup Prize Money & Giant-Killing Bonus (Tier 2 club beating Tier 1 club)
  assert.ok(getCupRoundPrizeMoney('ENG_CUP', 'R32') > 0);
  assert.ok(getCupRoundPrizeMoney('ENG_CUP', 'FINAL') >= 2_000_000);

  const tier2Club = Object.values(world.clubs).find((c) => c.leagueId === 'ENG_CH')!;
  const tier1Club = Object.values(world.clubs).find((c) => c.leagueId === 'ENG_PL')!;
  const giantKillFixtureId = 'test_giant_kill_fa_cup_1';
  const giantKillFixture = {
    id: giantKillFixtureId,
    competitionId: 'ENG_CUP' as const,
    seasonId: world.currentSeason,
    matchday: 1,
    kickoffDate: '2025-10-22',
    homeClubId: tier2Club.id,
    awayClubId: tier1Club.id,
    status: 'Scheduled' as const,
    cupRound: 'R32' as const,
    uefaStage: 'R32' as const,
  };
  const stateWithGiantKillTie = {
    ...world,
    controlledClubId: tier2Club.id,
    fixtures: [...world.fixtures, giantKillFixture],
  };

  const prevRep = stateWithGiantKillTie.manager.reputation;
  const prevBoardConf =
    stateWithGiantKillTie.clubs[tier2Club.id].boardExpectations.confidence.overall;
  const prevBalance = stateWithGiantKillTie.clubs[tier2Club.id].finances.balance;

  const baseSim = simulateMatch(
    giantKillFixture,
    tier2Club,
    tier1Club,
    stateWithGiantKillTie.players,
    404,
    undefined,
    undefined,
    { isKnockout: true }
  );

  const afterGiantKill = applyMatchResultToWorld(stateWithGiantKillTie, giantKillFixtureId, {
    ...baseSim,
    homeGoals: 2,
    awayGoals: 1,
    penaltyShootout: undefined,
  });

  assert.ok(
    afterGiantKill.clubs[tier2Club.id].finances.balance > prevBalance,
    'Cup round victory must award round prize money to winning club balance'
  );
  assert.equal(
    afterGiantKill.manager.reputation,
    Math.min(99, prevRep + 2),
    'Giant-killing victory by controlled Tier 2 club must boost manager reputation by +2'
  );
  assert.equal(
    afterGiantKill.clubs[tier2Club.id].boardExpectations.confidence.overall,
    Math.min(100, prevBoardConf + 3 + 6),
    'Giant-killing victory by controlled Tier 2 club must boost board confidence (+3 win +6 giant-killing)'
  );
  assert.ok(
    afterGiantKill.inbox.some((n) => n.title.includes('GIANT-KILLING')),
    'Giant-killing victory must publish a GIANT-KILLING headline in the inbox'
  );

  // 5. Verify Trophy History & UEFA Qualification from Domestic Cups on Season Rollover
  assert.equal(Object.keys(CUP_COMPETITIONS_META).length, 39, 'CUP_COMPETITIONS_META must cover all 39 cups (17 Primary + 3 LC + 10 SC + 3 Continental + 6 Playoffs)');
  const rolled = processEndOfSeasonRollover(world).nextState;
  const s1Trophies = (rolled.trophyHistory || []).filter((t) => t.season === '2025/26');
  assert.ok(
    s1Trophies.some((t) => t.competitionId === 'ENG_CUP'),
    'Season rollover must record FA Cup champion in trophyHistory'
  );
  assert.ok(
    s1Trophies.some((t) => t.competitionId === 'ENG_LC'),
    'Season rollover must record Carabao Cup champion in trophyHistory'
  );
  assert.ok(
    s1Trophies.some((t) => t.competitionId === 'ENG_SC'),
    'Season rollover must record Community Shield champion in trophyHistory'
  );
});

test('Stage 9 Complete Suite: 23 Playable Leagues (8 New), 30 Domestic/Super Cups, Global Stars & Realistic Pre-Season Overhaul', () => {
  let world = createInitialWorldState(90909);
  const myClubId = world.controlledClubId;
  const allClubs = Object.values(world.clubs);

  // 1. Verify 23 Playable Leagues & 394 Clubs
  assert.equal(Object.keys(LEAGUES_CONFIG).length, 23, 'LEAGUES_CONFIG must contain 23 playable leagues');
  assert.equal(allClubs.length, 394, 'World must generate 394 clubs across 23 leagues');
  assert.equal(allClubs.filter((c) => c.leagueId === 'ENG_L1').length, 16, 'EFL League One must have 16 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'AUT_BL').length, 12, 'Austrian Bundesliga must have 12 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'SUI_SL').length, 12, 'Swiss Super League must have 12 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'GRE_SL').length, 14, 'Greek Super League must have 14 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'KSA_SPL').length, 14, 'Saudi Pro League must have 14 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'USA_MLS').length, 16, 'MLS must have 16 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'BRA_SA').length, 16, 'Brasileirão Série A must have 16 clubs');
  assert.equal(allClubs.filter((c) => c.leagueId === 'JPN_J1').length, 14, 'J1 League must have 14 clubs');

  // 2. Verify Global Stars in KSA_SPL, USA_MLS, BRA_SA, JPN_J1, AUT_BL, GRE_SL
  const playerFullNames = new Set(
    Object.values(world.players).map((p) => `${p.firstName} ${p.lastName}`)
  );
  assert.ok(playerFullNames.has('Lionel Messi'), 'Inter Miami must have Lionel Messi');
  assert.ok(playerFullNames.has('Luis Suarez'), 'Inter Miami must have Luis Suarez');
  assert.ok(playerFullNames.has('Cristiano Ronaldo'), 'Al-Nassr must have Cristiano Ronaldo');
  assert.ok(playerFullNames.has('Karim Benzema'), 'Al-Ittihad must have Karim Benzema');
  assert.ok(playerFullNames.has('Neymar Junior'), 'Santos FC must have Neymar Junior');
  assert.ok(playerFullNames.has('Memphis Depay'), 'Corinthians must have Memphis Depay');
  assert.ok(playerFullNames.has('Yuya Osako'), 'Vissel Kobe must have Yuya Osako');

  // 3. Verify FotMob competition logos for all 8 new leagues, 7 new cups, and PRE_SEASON_FRIENDLY
  assert.ok(COMPETITION_STYLE_MAP.ENG_L1.fotmobLogoUrl?.endsWith('/108.png'));
  assert.ok(COMPETITION_STYLE_MAP.AUT_BL.fotmobLogoUrl?.endsWith('/38.png'));
  assert.ok(COMPETITION_STYLE_MAP.SUI_SL.fotmobLogoUrl?.endsWith('/69.png'));
  assert.ok(COMPETITION_STYLE_MAP.GRE_SL.fotmobLogoUrl?.endsWith('/135.png'));
  assert.ok(COMPETITION_STYLE_MAP.KSA_SPL.fotmobLogoUrl?.endsWith('/536.png'));
  assert.ok(COMPETITION_STYLE_MAP.USA_MLS.fotmobLogoUrl?.endsWith('/130.png'));
  assert.ok(COMPETITION_STYLE_MAP.BRA_SA.fotmobLogoUrl?.endsWith('/268.png'));
  assert.ok(COMPETITION_STYLE_MAP.JPN_J1.fotmobLogoUrl?.endsWith('/223.png'));
  assert.ok(COMPETITION_STYLE_MAP.AUT_CUP.fotmobLogoUrl?.endsWith('/278.png'));
  assert.ok(COMPETITION_STYLE_MAP.SUI_CUP.fotmobLogoUrl?.endsWith('/575.png'));
  assert.ok(COMPETITION_STYLE_MAP.GRE_CUP.fotmobLogoUrl?.endsWith('/145.png'));
  assert.ok(COMPETITION_STYLE_MAP.KSA_CUP.fotmobLogoUrl?.endsWith('/9475.png'));
  assert.ok(COMPETITION_STYLE_MAP.USA_CUP.fotmobLogoUrl?.endsWith('/9441.png'));
  assert.ok(COMPETITION_STYLE_MAP.BRA_CUP.fotmobLogoUrl?.endsWith('/203.png'));
  assert.ok(COMPETITION_STYLE_MAP.JPN_CUP.fotmobLogoUrl?.endsWith('/225.png'));
  assert.ok(COMPETITION_STYLE_MAP.PRE_SEASON_FRIENDLY.fotmobLogoUrl?.endsWith('/105.png'));

  // 4. Verify Realistic Pre-Season Start Date (2025-07-15), Baseline Friendlies, Camp Focus & Tour Scheduling
  assert.equal(world.gameDate, '2025-07-15', 'Career must start on July 15 (2025-07-15) for Pre-Season');
  const initialPreSeasonFixes = world.fixtures.filter(
    (f) => f.competitionId === 'PRE_SEASON_FRIENDLY' && (f.homeClubId === myClubId || f.awayClubId === myClubId)
  );
  assert.equal(initialPreSeasonFixes.length, 2, 'Controlled club must start with 2 baseline PRE_SEASON_FRIENDLY matches');

  const prevFam = world.clubs[myClubId].primaryTactic.familiarity;
  const focusRes = setPreSeasonCampFocus(world, 'TACTICAL_DRILLS');
  world = focusRes.nextState;
  assert.equal(world.clubs[myClubId].preSeasonCampFocus, 'TACTICAL_DRILLS');
  assert.equal(
    world.clubs[myClubId].primaryTactic.familiarity,
    Math.min(100, prevFam + 6),
    'TACTICAL_DRILLS camp focus must boost tactical familiarity by +6%'
  );

  const tourRes = organizePreSeasonTour(world, 'ALPINE');
  assert.equal(tourRes.success, true, 'ALPINE Pre-Season Tour must succeed');
  world = tourRes.nextState;
  assert.equal(world.clubs[myClubId].preSeasonTourRegion, 'ALPINE');
  const allPreSeasonFixes = world.fixtures.filter(
    (f) => f.competitionId === 'PRE_SEASON_FRIENDLY' && (f.homeClubId === myClubId || f.awayClubId === myClubId)
  );
  assert.equal(
    allPreSeasonFixes.length,
    5,
    'Organizing Pre-Season Tour must add 3 regional tour friendlies (2 baseline + 3 tour = 5 total)'
  );

  // 5. Verify playing a PRE_SEASON_FRIENDLY grants +10 sharpness, +5 familiarity, and 0 disciplinary suspensions
  const sampleFriendly = allPreSeasonFixes[0];
  const hClub = world.clubs[sampleFriendly.homeClubId];
  const aClub = world.clubs[sampleFriendly.awayClubId];
  const simFriendly = simulateMatch(sampleFriendly, hClub, aClub, world.players, 101);
  const firstParticipantId = Object.keys(simFriendly.playerRatings).find(
    (pid) => world.players[pid]?.clubId === myClubId
  )!;
  const sharpnessBeforeFriendly = world.players[firstParticipantId].matchSharpness;
  const famBeforeFriendly = world.clubs[myClubId].primaryTactic.familiarity;

  // Inject a red card event into the friendly result to verify it does NOT cause a league suspension
  const afterFriendly = applyMatchResultToWorld(world, sampleFriendly.id, {
    ...simFriendly,
    events: [
      ...simFriendly.events,
      {
        id: 'ev_red_frd',
        fixtureId: sampleFriendly.id,
        minute: 75,
        eventType: 'RedCard',
        teamId: myClubId,
        playerId: firstParticipantId,
        playerName: 'Test Player',
        text: 'Red card in friendly',
        pitchX: 50,
        pitchY: 50,
      },
    ],
  });
  assert.equal(
    afterFriendly.players[firstParticipantId].matchSharpness,
    Math.min(100, sharpnessBeforeFriendly + 10),
    'PRE_SEASON_FRIENDLY participant must gain +10 Match Sharpness'
  );
  assert.equal(
    afterFriendly.clubs[myClubId].primaryTactic.familiarity,
    Math.min(100, famBeforeFriendly + 5),
    'PRE_SEASON_FRIENDLY must grant +5 Tactical Familiarity'
  );
  assert.equal(
    afterFriendly.players[firstParticipantId].suspensionMatchesRemaining || 0,
    0,
    'Red cards in PRE_SEASON_FRIENDLY must NOT trigger competitive suspensions'
  );
});

test('23. Stage 10 Complete Suite: 58 Real Physical Trophy Photographs, FotMob Separation & Trophy Lift Detection', () => {
  // 1. Verify all 58 distinct competitions & individual awards have exact tmssl physical trophy photo URLs
  const expectedTrophyIds: Record<string, string> = {
    // 9 UEFA, Global & Individual Awards (+ aliases)
    UEFA_UCL: '4',
    UEFA_UEL: '264',
    UEFA_UECL: '763',
    UEFA_USC: '354',
    FIFA_CWC: '318',
    GLB_CWC: '318',
    EURO_NATIONS: '102',
    INT_EURO: '102',
    WORLD_CUP: '101',
    BALLON_DOR: '676',
    GOLDEN_BOOT: '195',
    // 23 Playable Leagues
    ENG_PL: '12',
    ESP_LL: '11',
    GER_BL: '10',
    ITA_SA: '13',
    FRA_L1: '14',
    POR_LP: '15',
    NED_ED: '16',
    AUT_BL: '17',
    BEL_PL: '18',
    SUI_SL: '19',
    TUR_SL: '20',
    SCO_PR: '21',
    GRE_SL: '23',
    BRA_SA: '275',
    USA_MLS: '281',
    JPN_J1: '352',
    KSA_SPL: '380',
    ENG_CH: '338',
    GER_2B: '320',
    ESP_SD: '339',
    ITA_SB: '340',
    FRA_L2: '341',
    ENG_L1: '342',
    // 17 Primary Domestic Cups
    ENG_CUP: '29',
    ESP_CUP: '94',
    GER_CUP: '27',
    ITA_CUP: '92',
    FRA_CUP: '96',
    POR_CUP: '97',
    NED_CUP: '98',
    AUT_CUP: '105',
    SUI_CUP: '106',
    TUR_CUP: '107',
    BEL_CUP: '108',
    SCO_CUP: '109',
    GRE_CUP: '111',
    BRA_CUP: '390',
    USA_CUP: '436',
    JPN_CUP: '441',
    KSA_CUP: '475',
    // 3 Secondary League Cups
    ENG_LC: '47',
    POR_LC: '337',
    SCO_LC: '345',
    // 9 National Super Cups
    ENG_SC: '316',
    ESP_SC: '93',
    GER_SC: '312',
    ITA_SC: '91',
    FRA_SC: '328',
    POR_SC: '336',
    NED_SC: '327',
    BEL_SC: '335',
    TUR_SC: '344',
  };

  for (const [compId, expectedErfId] of Object.entries(expectedTrophyIds)) {
    const entry = COMPETITION_STYLE_MAP[compId];
    assert.ok(entry, `COMPETITION_STYLE_MAP must contain ${compId}`);
    const expectedPrimary = `https://tmssl.akamaized.net/images/erfolge/verybigquad/${expectedErfId}.png`;
    const expectedFallback = `https://tmssl.akamaized.net/images/erfolge/header/${expectedErfId}.png`;

    assert.equal(
      entry.trophyImageUrl,
      expectedPrimary,
      `${compId} must map to real physical trophy photo ${expectedPrimary}`
    );

    const resolvedTrophy = resolveCompetitionTrophyPhotoUrls(compId);
    assert.equal(resolvedTrophy.primaryTrophyUrl, expectedPrimary);
    assert.equal(resolvedTrophy.fallbackTrophyUrl, expectedFallback);

    // Every non-individual competition must also have a FotMob 2D logo URL separate from trophyImageUrl
    if (compId !== 'BALLON_DOR' && compId !== 'GOLDEN_BOOT') {
      const resolvedLogo = resolveFotMobCompetitionLogoUrls(compId);
      assert.ok(
        resolvedLogo.darkUrl && resolvedLogo.darkUrl.startsWith('https://images.fotmob.com/image_resources/logo/leaguelogo/dark/'),
        `${compId} must have a verified FotMob dark logo URL`
      );
      assert.notEqual(
        resolvedLogo.darkUrl,
        resolvedTrophy.primaryTrophyUrl,
        `${compId} must separate FotMob 2D competition logo from real physical trophy photo`
      );
    }
  }

  // 2. Verify display-name resolution for Trophy History strings
  assert.equal(
    resolveCompetitionTrophyPhotoUrls('Premier League (England)').primaryTrophyUrl,
    'https://tmssl.akamaized.net/images/erfolge/verybigquad/12.png'
  );
  assert.equal(
    resolveCompetitionTrophyPhotoUrls('Emirates FA Cup').primaryTrophyUrl,
    'https://tmssl.akamaized.net/images/erfolge/verybigquad/29.png'
  );
  assert.equal(
    resolveCompetitionTrophyPhotoUrls('EFL Carabao Cup').primaryTrophyUrl,
    'https://tmssl.akamaized.net/images/erfolge/verybigquad/47.png'
  );

  // 3. Verify Silverware Inspection Metadata & Championship Trophy Lift Detection
  const world = createInitialWorldState(101010);
  const uclMeta = getCompetitionSilverwareMeta('UEFA_UCL', world);
  assert.equal(uclMeta.winnerPrizeMoney, 25_000_000);
  assert.ok(uclMeta.pastWinners.length >= 1, 'UEFA_UCL Roll of Honour must include historical winners');

  const myClubId = world.controlledClubId;
  const rivalClubId = Object.keys(world.clubs).find((id) => id !== myClubId)!;
  const mockFinalFixture = {
    id: 'fix_stage10_fa_final',
    competitionId: 'ENG_CUP' as const,
    seasonId: world.currentSeason,
    matchday: 5,
    kickoffDate: '2026-05-16',
    homeClubId: myClubId,
    awayClubId: rivalClubId,
    status: 'Scheduled' as const,
    cupRound: 'FINAL' as const,
  };
  const worldWithFinal = {
    ...world,
    fixtures: [...world.fixtures, mockFinalFixture],
  };

  const makeMockTeamStats = (goals: number, xG: number) => ({
    goals,
    possession: 50,
    totalShots: 12,
    shotsOnTarget: 5,
    blockedShots: 2,
    xG,
    passes: 420,
    passAccuracy: 84,
    tackles: 16,
    interceptions: 10,
    clearances: 14,
    fouls: 9,
    yellowCards: 1,
    redCards: 0,
    corners: 5,
    offsides: 1,
    saves: 3,
    bigChances: 2,
  });

  // Win in normal time -> triggers Championship Trophy Lift Modal
  const winLift = detectTrophyWinFromMatch(worldWithFinal, mockFinalFixture.id, {
    homeGoals: 2,
    awayGoals: 1,
    homeStats: makeMockTeamStats(2, 2.1),
    awayStats: makeMockTeamStats(1, 0.9),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 88000,
  });
  assert.ok(winLift, 'Winning a Cup Final must trigger ChampionshipTrophyLiftModal data');
  assert.equal(winLift?.competitionId, 'ENG_CUP');
  assert.equal(winLift?.clubId, myClubId);
  assert.ok((winLift?.prizeMoney || 0) >= 2_000_000);

  // Loss in Final -> must NOT trigger Trophy Lift Modal
  const lossLift = detectTrophyWinFromMatch(worldWithFinal, mockFinalFixture.id, {
    homeGoals: 0,
    awayGoals: 2,
    homeStats: makeMockTeamStats(0, 0.8),
    awayStats: makeMockTeamStats(2, 1.9),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 88000,
  });
  assert.equal(lossLift, null, 'Losing a Cup Final must NOT trigger Trophy Lift Modal');

  // Win on penalties -> triggers Trophy Lift Modal
  const penWinLift = detectTrophyWinFromMatch(worldWithFinal, mockFinalFixture.id, {
    homeGoals: 1,
    awayGoals: 1,
    penaltyShootout: { homePenalties: 5, awayPenalties: 4 },
    homeStats: makeMockTeamStats(1, 1.4),
    awayStats: makeMockTeamStats(1, 1.3),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 88000,
  });
  assert.ok(penWinLift, 'Winning a Cup Final on penalties must trigger ChampionshipTrophyLiftModal data');
  assert.ok(penWinLift?.scorelineText?.includes('5-4 pens'));
});

test('Stage 11 Complete Suite: Roster Integrity, 30x Faster 23-League Batch Sim, Mathematical Title Clinch, Promotion Playoffs & Continental Champions Cups', () => {
  const world = createInitialWorldState(202611);
  const allClubs = Object.values(world.clubs);
  const allPlayers = Object.values(world.players);

  // =========================================================================
  // PHASE 1: DATABASE & ROSTER INTEGRITY (394 CLUBS, ZERO DUPLICATES)
  // =========================================================================
  assert.equal(allClubs.length, 394, 'World must have exactly 394 clubs across 23 leagues');

  const clubNames = new Set<string>();
  const shortNames = new Set<string>();
  const managerNames = new Set<string>();
  for (const club of allClubs) {
    assert.ok(!clubNames.has(club.name), `Duplicate club name detected: ${club.name}`);
    clubNames.add(club.name);

    assert.ok(!shortNames.has(club.shortName), `Duplicate shortName detected: ${club.shortName} (${club.name})`);
    shortNames.add(club.shortName);

    assert.ok(
      !managerNames.has(club.aiManager.name),
      `Duplicate AI manager name detected: ${club.aiManager.name} (${club.name})`
    );
    managerNames.add(club.aiManager.name);
  }

  // Verify ENG_L1 replacements (Luton, Cardiff, Plymouth) and zero overlap with ENG_CH
  const engL1Clubs = allClubs.filter((c) => c.leagueId === 'ENG_L1');
  assert.equal(engL1Clubs.length, 16);
  const engL1Shorts = new Set(engL1Clubs.map((c) => c.shortName));
  assert.ok(engL1Shorts.has('LUT'), 'ENG_L1 must contain Luton Town (LUT)');
  assert.ok(engL1Shorts.has('CARF'), 'ENG_L1 must contain Cardiff City (CARF)');
  assert.ok(engL1Shorts.has('PLY'), 'ENG_L1 must contain Plymouth Argyle (PLY)');

  // Verify disambiguated clubs have isolated rosters & new-league star players exist
  const palmeiras = allClubs.find((c) => c.shortName === 'PAL')!;
  const palermo = allClubs.find((c) => c.shortName === 'PALM')!;
  assert.ok(palmeiras && palermo);
  const palmeirasNames = new Set(
    allPlayers.filter((p) => p.clubId === palmeiras.id).map((p) => `${p.firstName} ${p.lastName}`)
  );
  const palermoNames = new Set(
    allPlayers.filter((p) => p.clubId === palermo.id).map((p) => `${p.firstName} ${p.lastName}`)
  );
  for (const name of palmeirasNames) {
    assert.ok(!palermoNames.has(name), `Player ${name} leaked between Palmeiras and Palermo`);
  }

  const allPlayerFullNames = new Set(allPlayers.map((p) => `${p.firstName} ${p.lastName}`));
  for (const star of ['Xherdan Shaqiri', 'Thiago Silva', 'Lucas Moura', 'Giannis Konstantelias']) {
    assert.ok(allPlayerFullNames.has(star), `New-league star player ${star} must be seeded in the world`);
  }

  // =========================================================================
  // PHASE 2: HIGH-SPEED 23-LEAGUE BATCHED SIMULATION ENGINE
  // =========================================================================
  const md1Fixtures = world.fixtures.filter(
    (f) => f.matchday === 1 && LEAGUES_CONFIG[f.competitionId as keyof typeof LEAGUES_CONFIG]
  );
  assert.ok(md1Fixtures.length >= 160, `Matchday 1 across 23 leagues must have >=160 fixtures (got ${md1Fixtures.length})`);

  const t0 = performance.now();
  const afterMd1 = simulateAndApplyFixturesBatch(world, md1Fixtures);
  const elapsedMs = performance.now() - t0;
  assert.ok(
    elapsedMs < 1000,
    `Batched simulation of ${md1Fixtures.length} fixtures must complete in <1s (took ${elapsedMs.toFixed(1)}ms)`
  );

  const md1Completed = afterMd1.fixtures.filter(
    (f) =>
      f.matchday === 1 &&
      LEAGUES_CONFIG[f.competitionId as keyof typeof LEAGUES_CONFIG] &&
      f.status === 'Completed'
  );
  assert.equal(md1Completed.length, md1Fixtures.length, 'Every batched Matchday 1 fixture must be Completed');
  assert.equal(afterMd1.standings.ENG_PL[0].played, 1, 'Standings must be recomputed after batched simulation');

  // =========================================================================
  // PHASE 3A: MATHEMATICAL LEAGUE TITLE CLINCH DETECTION
  // =========================================================================
  const mockTeamStats = (goals: number) => ({
    goals,
    possession: 55,
    totalShots: 14,
    shotsOnTarget: 6,
    blockedShots: 2,
    xG: goals + 0.3,
    passes: 480,
    passAccuracy: 86,
    tackles: 16,
    interceptions: 11,
    clearances: 12,
    fouls: 8,
    yellowCards: 1,
    redCards: 0,
    corners: 6,
    offsides: 1,
    saves: 3,
    bigChances: 3,
  });

  const userClubId = world.controlledClubId;
  const userLeagueId = world.clubs[userClubId].leagueId;
  const userLeagueFix = world.fixtures.find(
    (f) =>
      f.competitionId === userLeagueId &&
      (f.homeClubId === userClubId || f.awayClubId === userClubId)
  )!;
  const completedUserLeagueFix = {
    ...userLeagueFix,
    status: 'Completed' as const,
    result: {
      homeGoals: 3,
      awayGoals: 0,
      homeStats: mockTeamStats(3),
      awayStats: mockTeamStats(0),
      events: [],
      playerRatings: {},
      manOfTheMatchPlayerId: '',
      attendance: 60000,
    },
  };

  // Scenario 1: Mathematically clinched (#1 has 92 pts after 35 games, #2 has 80 pts after 35 games -> max 89 pts)
  const baseTable = world.standings[userLeagueId];
  const userRow = baseTable.find((r) => r.clubId === userClubId)!;
  const rivalRow = baseTable.find((r) => r.clubId !== userClubId)!;
  const restRows = baseTable.filter((r) => r.clubId !== userClubId && r.clubId !== rivalRow.clubId);

  const clinchedWorld = {
    ...world,
    fixtures: world.fixtures.map((f) => (f.id === userLeagueFix.id ? completedUserLeagueFix : f)),
    standings: {
      ...world.standings,
      [userLeagueId]: [
        { ...userRow, played: 35, won: 30, drawn: 2, lost: 3, points: 92 },
        { ...rivalRow, played: 35, won: 25, drawn: 5, lost: 5, points: 80 },
        ...restRows,
      ],
    },
  };

  const clinchLift = detectTrophyWinFromMatch(
    clinchedWorld,
    userLeagueFix.id,
    completedUserLeagueFix.result
  );
  assert.ok(clinchLift, 'Mathematically clinching league title must immediately trigger TrophyLiftData');
  assert.equal(clinchLift?.competitionId, userLeagueId);
  assert.equal(clinchLift?.clubId, userClubId);

  // Scenario 2: Title race still mathematically open (#1 has 86 pts, #2 has 80 pts with 3 games = 9 pts left -> max 89)
  const openRaceWorld = {
    ...clinchedWorld,
    standings: {
      ...clinchedWorld.standings,
      [userLeagueId]: [
        { ...userRow, played: 35, won: 28, drawn: 2, lost: 5, points: 86 },
        { ...rivalRow, played: 35, won: 25, drawn: 5, lost: 5, points: 80 },
        ...restRows,
      ],
    },
  };
  assert.equal(
    detectTrophyWinFromMatch(openRaceWorld, userLeagueFix.id, completedUserLeagueFix.result),
    null,
    'Open title race must NOT trigger Championship Trophy Lift prematurely'
  );

  // Scenario 3: Already recorded in trophyHistory -> dead-rubber match must NOT re-trigger modal
  const alreadyRecordedWorld = {
    ...clinchedWorld,
    trophyHistory: [
      {
        id: `trp_${world.currentSeason.replace('/', '')}_${userLeagueId}`,
        season: world.currentSeason,
        competitionId: userLeagueId,
        competitionName: LEAGUES_CONFIG[userLeagueId].name,
        winnerClubId: userClubId,
        winnerClubName: world.clubs[userClubId].name,
      },
      ...(clinchedWorld.trophyHistory || []),
    ],
  };
  assert.equal(
    detectTrophyWinFromMatch(alreadyRecordedWorld, userLeagueFix.id, completedUserLeagueFix.result),
    null,
    'Already clinched league title in trophyHistory must NOT re-trigger Trophy Lift on dead-rubber matches'
  );

  // =========================================================================
  // PHASE 3B: PROMOTION PLAYOFFS (3RD–6TH) & ROLLOVER PROMOTION
  // =========================================================================
  const chTable = world.standings.ENG_CH;
  assert.ok(chTable.length >= 6);
  const poSfs = generatePromotionPlayoffFixtures(
    'ENG_CH_PO',
    chTable,
    world.currentSeason,
    '2026-05-15'
  );
  assert.equal(poSfs.length, 2, 'Promotion Playoffs must generate 2 Semi-Finals');
  assert.equal(poSfs[0].homeClubId, chTable[2].clubId, 'SF1 home must be 3rd place');
  assert.equal(poSfs[0].awayClubId, chTable[5].clubId, 'SF1 away must be 6th place');
  assert.equal(poSfs[1].homeClubId, chTable[3].clubId, 'SF2 home must be 4th place');
  assert.equal(poSfs[1].awayClubId, chTable[4].clubId, 'SF2 away must be 5th place');

  // Simulate 6th place (away in SF1) upsetting 3rd place, and 4th beating 5th, then 6th winning the Final!
  let poWorld = {
    ...world,
    fixtures: [...world.fixtures, ...poSfs],
  };
  poWorld = applyMatchResultToWorld(poWorld, poSfs[0].id, {
    homeGoals: 1,
    awayGoals: 2,
    homeStats: mockTeamStats(1),
    awayStats: mockTeamStats(2),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 28000,
  });
  poWorld = applyMatchResultToWorld(poWorld, poSfs[1].id, {
    homeGoals: 2,
    awayGoals: 0,
    homeStats: mockTeamStats(2),
    awayStats: mockTeamStats(0),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 27000,
  });

  const poFinal = poWorld.fixtures.find(
    (f) => f.competitionId === 'ENG_CH_PO' && f.cupRound === 'FINAL'
  );
  assert.ok(poFinal, 'Completing both Promotion Playoff Semi-Finals must automatically generate the FINAL');
  assert.equal(poFinal?.homeClubId, chTable[5].clubId, '6th place SF1 winner must reach Playoff Final');
  assert.equal(poFinal?.awayClubId, chTable[3].clubId, '4th place SF2 winner must reach Playoff Final');
  assert.equal(
    checkAndAdvanceDomesticCup('ENG_CH_PO', poWorld.fixtures, world.currentSeason, '2026-05-21').length,
    0,
    'checkAndAdvanceDomesticCup must wait until FINAL completes'
  );

  poWorld = applyMatchResultToWorld(poWorld, poFinal!.id, {
    homeGoals: 1,
    awayGoals: 0,
    homeStats: mockTeamStats(1),
    awayStats: mockTeamStats(0),
    events: [],
    playerRatings: {},
    manOfTheMatchPlayerId: '',
    attendance: 82000,
  });

  // Verify rollover promotes 1st, 2nd, AND 6th place (Playoff Final Winner) to ENG_PL!
  const rolled = processEndOfSeasonRollover(poWorld).nextState;
  assert.equal(rolled.clubs[chTable[0].clubId].leagueId, 'ENG_PL', '1st place auto-promoted to ENG_PL');
  assert.equal(rolled.clubs[chTable[1].clubId].leagueId, 'ENG_PL', '2nd place auto-promoted to ENG_PL');
  assert.equal(
    rolled.clubs[chTable[5].clubId].leagueId,
    'ENG_PL',
    '6th place Promotion Playoff Final winner must be promoted to ENG_PL!'
  );
  assert.equal(
    rolled.clubs[chTable[2].clubId].leagueId,
    'ENG_CH',
    '3rd place who lost in Playoffs must remain in ENG_CH'
  );

  // Also test automatic trigger via checkAndTriggerPromotionPlayoffs when all ENG_L1 fixtures complete
  const engL1CompletedWorld = {
    ...world,
    fixtures: world.fixtures.map((f) =>
      f.competitionId === 'ENG_L1'
        ? {
            ...f,
            status: 'Completed' as const,
            result: {
              homeGoals: 1,
              awayGoals: 0,
              homeStats: mockTeamStats(1),
              awayStats: mockTeamStats(0),
              events: [],
              playerRatings: {},
              manOfTheMatchPlayerId: '',
              attendance: 12000,
            },
          }
        : f
    ),
  };
  const triggeredWorld = checkAndTriggerPromotionPlayoffs(engL1CompletedWorld, ['ENG_L1']);
  const engL1PoSfs = triggeredWorld.fixtures.filter((f) => f.competitionId === 'ENG_L1_PO');
  assert.equal(engL1PoSfs.length, 2, 'Completing ENG_L1 regular season must auto-trigger ENG_L1_PO Semi-Finals');

  // =========================================================================
  // PHASE 4: GLOBAL CONTINENTAL CHAMPIONS CUPS (AFC_ACL, CONMEBOL_LIB, CONCACAF_CCC)
  // =========================================================================
  for (const contId of ['AFC_ACL', 'CONMEBOL_LIB', 'CONCACAF_CCC'] as const) {
    const r16Fixtures = world.fixtures.filter(
      (f) => f.competitionId === contId && f.seasonId === world.currentSeason && f.cupRound === 'R16'
    );
    assert.equal(
      r16Fixtures.length,
      8,
      `${contId} must initialize with 8 Round of 16 fixtures (16 clubs)`
    );
    assert.ok(CUP_COMPETITIONS_META[contId], `${contId} must exist in CUP_COMPETITIONS_META`);
    assert.equal(CUP_COMPETITIONS_META[contId].qualifiesFor, 'GLB_CWC');

    const trophyUrls = resolveCompetitionTrophyPhotoUrls(contId);
    assert.ok(
      trophyUrls.primaryTrophyUrl?.includes('/erfolge/verybigquad/'),
      `${contId} must map to a 300x300 HD verybigquad trophy photo`
    );
    const logoUrls = resolveFotMobCompetitionLogoUrls(contId);
    assert.ok(
      logoUrls.darkUrl?.startsWith('https://images.fotmob.com/image_resources/logo/leaguelogo/dark/'),
      `${contId} must map to a verified FotMob dark logo URL`
    );
  }

  // Verify AFC_ACL blends KSA_SPL and JPN_J1 clubs and advances R16 -> QF -> SF -> FINAL
  let contWorld = world;
  const afcR16 = contWorld.fixtures.filter((f) => f.competitionId === 'AFC_ACL' && f.cupRound === 'R16');
  const afcLeagues = new Set(
    afcR16.flatMap((f) => [contWorld.clubs[f.homeClubId].leagueId, contWorld.clubs[f.awayClubId].leagueId])
  );
  assert.ok(afcLeagues.has('KSA_SPL') && afcLeagues.has('JPN_J1'), 'AFC_ACL must feature both KSA_SPL and JPN_J1 clubs');

  for (const stage of ['R16', 'QF', 'SF', 'FINAL'] as const) {
    const roundFixes = contWorld.fixtures.filter(
      (f) => f.competitionId === 'AFC_ACL' && f.cupRound === stage && f.status !== 'Completed'
    );
    assert.ok(roundFixes.length > 0, `AFC_ACL must generate ${stage} fixtures`);
    contWorld = simulateAndApplyFixturesBatch(contWorld, roundFixes);
  }
  const afcTrophy = (contWorld.trophyHistory || []).find(
    (t) => t.competitionId === 'AFC_ACL' && t.season === world.currentSeason
  );
  assert.ok(afcTrophy, 'Completing AFC_ACL Final must record champion in trophyHistory');

  // Verify rollover also generates next season's Continental Champions Cups
  const nextSeasonAfc = rolled.fixtures.filter(
    (f) => f.competitionId === 'AFC_ACL' && f.seasonId === rolled.currentSeason
  );
  assert.equal(nextSeasonAfc.length, 8, 'Season rollover must generate next season AFC_ACL R16 bracket');
});

test('Stage 12: Universal Nationality Flags, Authentic HG-C/HG-N/U21/Non-EU Rules, 96 Top-5 2025/26 Tactical Presets & Budgets', () => {
  // =========================================================================
  // PHASE 1: UNIVERSAL NATIONALITY FLAG SYSTEM (115+ FIFA CODES + HOME NATIONS)
  // =========================================================================
  assert.ok(
    Object.keys(FIFA_TO_FLAGCDN_ISO).length >= 110,
    `Expected >= 110 FIFA flag mappings, got ${Object.keys(FIFA_TO_FLAGCDN_ISO).length}`
  );
  assert.equal(resolveNationalityFlagInfo('ENG').iso, 'gb-eng');
  assert.equal(resolveNationalityFlagInfo('SCO').iso, 'gb-sct');
  assert.equal(resolveNationalityFlagInfo('WAL').iso, 'gb-wls');
  assert.equal(resolveNationalityFlagInfo('NIR').iso, 'gb-nir');
  assert.equal(resolveNationalityFlagInfo('BRA').pngUrl, 'https://flagcdn.com/w40/br.png');
  assert.equal(resolveNationalityFlagInfo('THA').pngUrl, 'https://flagcdn.com/w40/th.png');
  assert.equal(resolveNationalityFlagInfo('England').iso, 'gb-eng');
  assert.equal(resolveNationalityFlagInfo('Spain').iso, 'es');

  // =========================================================================
  // PHASE 3 & 4: TOP 5 EUROPEAN LEAGUES (96 CLUBS) 2025/26 FORMATIONS, TACTICS & BUDGETS
  // =========================================================================
  const top5Leagues = ['ENG_PL', 'ESP_LL', 'GER_BL', 'ITA_SA', 'FRA_L1'] as const;
  let top5Count = 0;
  for (const lId of top5Leagues) {
    assert.ok(LEAGUES_CONFIG[lId].registrationRules, `${lId} must define registrationRules`);
    for (const tpl of CLUB_TEMPLATES[lId]) {
      top5Count++;
      assert.ok(tpl.preferredFormation, `${tpl.name} must define authentic preferredFormation`);
      assert.ok(tpl.secondaryFormation, `${tpl.name} must define authentic secondaryFormation`);
      assert.ok(tpl.tacticalPreset, `${tpl.name} must define authentic tacticalPreset`);
      assert.ok(
        typeof tpl.transferBudgetEur === 'number' && tpl.transferBudgetEur >= 5_000_000,
        `${tpl.name} must define realistic transferBudgetEur`
      );
      assert.ok(
        typeof tpl.wageBudgetEur === 'number' && tpl.wageBudgetEur >= 150_000,
        `${tpl.name} must define realistic wageBudgetEur`
      );
    }
  }
  assert.equal(top5Count, 96, 'Top 5 European leagues must cover all 96 clubs');

  // Verify 0 duplicate manager names across all 394 clubs
  const allManagerNames: string[] = [];
  for (const leagueTemplates of Object.values(CLUB_TEMPLATES)) {
    for (const tpl of leagueTemplates) {
      allManagerNames.push(tpl.managerName.trim().toLowerCase());
    }
  }
  assert.equal(
    new Set(allManagerNames).size,
    allManagerNames.length,
    'All 394 clubs must have unique manager names with zero duplicates'
  );

  // Verify all 8 authentic tactical presets produce distinct expected instructions
  const controlPos = buildAuthenticTeamInstructions('CONTROL_POSSESSION');
  assert.equal(controlPos.mentality, 'Positive');
  assert.equal(controlPos.passingDirectness, 'Shorter');
  assert.equal(controlPos.whenPossessionWon, 'Hold Shape');
  const gegenpress = buildAuthenticTeamInstructions('GEGENPRESS_HIGH_LINE');
  assert.equal(gegenpress.mentality, 'Attacking');
  assert.equal(gegenpress.pressingIntensity, 'Very High');
  assert.equal(gegenpress.defensiveLine, 'Very High');
  const lowBlock = buildAuthenticTeamInstructions('LOW_BLOCK_DIRECT_COUNTER');
  assert.equal(lowBlock.mentality, 'Cautious');
  assert.equal(lowBlock.defensiveLine, 'Deep');

  // Verify world generation applies authentic 2025/26 managers, formations, tactics & budgets
  const world = createInitialWorldState(202512);
  const allClubs = Object.values(world.clubs);
  const findClub = (nameSubstr: string) =>
    allClubs.find((c) => c.name.toLowerCase().includes(nameSubstr.toLowerCase()));

  const manCity = findClub('Manchester City')!;
  const barca = findClub('Barcelona')!;
  const manUtd = findClub('Manchester United')!;
  const inter = findClub('Inter Milan')!;
  const realMadrid = findClub('Real Madrid')!;
  const psg = findClub('Paris Saint-Germain')!;
  const arsenal = findClub('Arsenal')!;
  const bayern = findClub('Bayern')!;
  const como = findClub('Como')!;

  assert.equal(manCity.aiManager.name, 'Pep Guardiola');
  assert.equal(manCity.primaryTactic.formation, '4-2-3-1');
  assert.equal(manCity.primaryTactic.instructions.passingDirectness, 'Shorter');
  assert.equal(manCity.finances.transferBudget, 135_000_000);

  assert.equal(barca.aiManager.name, 'Hansi Flick');
  assert.equal(barca.primaryTactic.formation, '4-2-3-1');
  assert.equal(barca.primaryTactic.instructions.defensiveLine, 'Very High');
  assert.equal(barca.finances.transferBudget, 48_000_000);

  assert.equal(manUtd.aiManager.name, 'Ruben Amorim');
  assert.equal(manUtd.primaryTactic.formation, '3-4-3');
  assert.equal(manUtd.finances.transferBudget, 95_000_000);

  assert.equal(inter.aiManager.name, 'Cristian Chivu');
  assert.equal(inter.primaryTactic.formation, '3-5-2');
  assert.equal(inter.finances.transferBudget, 72_000_000);

  assert.equal(realMadrid.aiManager.name, 'Xabi Alonso');
  assert.equal(realMadrid.primaryTactic.formation, '4-2-3-1');
  assert.equal(realMadrid.finances.transferBudget, 140_000_000);

  assert.equal(psg.aiManager.name, 'Luis Enrique');
  assert.equal(psg.primaryTactic.formation, '4-3-3');
  assert.equal(psg.finances.transferBudget, 130_000_000);

  assert.equal(arsenal.aiManager.name, 'Mikel Arteta');
  assert.equal(arsenal.primaryTactic.formation, '4-3-3');
  assert.equal(arsenal.finances.transferBudget, 110_000_000);

  assert.equal(como.aiManager.name, 'Cesc Fàbregas');
  assert.equal(como.finances.transferBudget, 48_000_000);

  // =========================================================================
  // PHASE 2: AUTHENTIC HOMEGROWN (HG-C / HG-N), U21/U22 EXEMPT & NON-EU RULES
  // =========================================================================
  const clubPlayers = (clubId: string) => Object.values(world.players).filter((p) => p.clubId === clubId);
  const findPlayerInClub = (clubId: string, lastNameSubstr: string) =>
    clubPlayers(clubId).find((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(lastNameSubstr.toLowerCase())
    );

  // Verify authentic Club-Trained (HG-C) graduates
  const saka = findPlayerInClub(arsenal.id, 'Saka');
  const foden = findPlayerInClub(manCity.id, 'Foden');
  const yamal = findPlayerInClub(barca.id, 'Yamal');
  const musiala = findPlayerInClub(bayern.id, 'Musiala');
  const dimarco = findPlayerInClub(inter.id, 'Dimarco');
  const zaireEmery = findPlayerInClub(psg.id, 'Zaire-Emery') || findPlayerInClub(psg.id, 'Zaïre-Emery');

  assert.ok(saka && getPlayerHomegrownStatus(saka, 'ENG') === 'HGC', 'Bukayo Saka must be HG-C at Arsenal');
  assert.ok(foden && getPlayerHomegrownStatus(foden, 'ENG') === 'HGC', 'Phil Foden must be HG-C at Man City');
  assert.ok(yamal && getPlayerHomegrownStatus(yamal, 'ESP') === 'HGC', 'Lamine Yamal must be HG-C at Barcelona');
  assert.ok(musiala && getPlayerHomegrownStatus(musiala, 'GER') === 'HGC', 'Jamal Musiala must be HG-C at Bayern');
  assert.ok(dimarco && getPlayerHomegrownStatus(dimarco, 'ITA') === 'HGC', 'Federico Dimarco must be HG-C at Inter');
  assert.ok(zaireEmery && getPlayerHomegrownStatus(zaireEmery, 'FRA') === 'HGC', 'Warren Zaire-Emery must be HG-C at PSG');

  // Verify Foreign Nation-Trained (HG-N) stars (e.g., Saliba & Martinelli in England)
  const saliba = findPlayerInClub(arsenal.id, 'Saliba');
  const martinelli = findPlayerInClub(arsenal.id, 'Martinelli');
  if (saliba) {
    assert.equal(getPlayerHomegrownStatus(saliba, 'ENG'), 'HGN', 'William Saliba must be HG-N in England');
  }
  if (martinelli) {
    assert.equal(getPlayerHomegrownStatus(martinelli, 'ENG'), 'HGN', 'Gabriel Martinelli must be HG-N in England');
  }

  // Verify foreign senior marquee stars are NOT wrongly flagged HG (old pIdx >= 14 bug removed)
  const haaland = findPlayerInClub(manCity.id, 'Haaland');
  const rodri = findPlayerInClub(manCity.id, 'Rodri');
  if (haaland) {
    assert.equal(getPlayerHomegrownStatus(haaland, 'ENG'), 'NONE', 'Erling Haaland must NOT be Homegrown in England');
  }
  if (rodri) {
    assert.equal(getPlayerHomegrownStatus(rodri, 'ENG'), 'NONE', 'Rodri must NOT be Homegrown in England');
  }

  // Verify Serie A U22 exemption vs Premier League U21 exemption
  const age22Player = {
    ...saka!,
    id: 'test_age_22',
    dateOfBirth: '2003-04-01', // Age 22 on 2025-07-15
  };
  assert.equal(isPlayerU21Exempt(age22Player, '2025-07-15', 'ITA_SA', 'ITA'), true, 'Age 22 player must be exempt in Serie A (U22)');
  assert.equal(isPlayerU21Exempt(age22Player, '2025-07-15', 'ENG_PL', 'ENG'), false, 'Age 22 player must NOT be U21 exempt in Premier League');

  // Verify La Liga Non-EU & Ligue 1 Cotonou exemptions
  const nonEuJapanPlayer = {
    ...saka!,
    id: 'test_jpn_noneu',
    firstName: 'Takumi',
    lastName: 'Test',
    nationalityCode: 'JPN',
    homegrownStatus: 'NONE' as const,
  };
  const senegalPlayer = {
    ...saka!,
    id: 'test_sen_cotonou',
    firstName: 'Ismaila',
    lastName: 'Test',
    nationalityCode: 'SEN',
    homegrownStatus: 'NONE' as const,
  };
  assert.equal(isPlayerNonEuForLeague(nonEuJapanPlayer, 'ESP_LL'), true, 'Japanese non-HG player counts as Non-EU in La Liga');
  assert.equal(isPlayerNonEuForLeague(senegalPlayer, 'FRA_L1'), false, 'Senegalese player is Cotonou-exempt in Ligue 1');
  assert.equal(isPlayerNonEuForLeague(nonEuJapanPlayer, 'FRA_L1'), true, 'Japanese player counts as Non-EU in Ligue 1');

  // Verify all 96 Top-5 clubs start registration-compliant under their exact league rules
  for (const lId of top5Leagues) {
    const leagueClubs = allClubs.filter((c) => c.leagueId === lId);
    for (const c of leagueClubs) {
      const summary = evaluateSquadRegistration(clubPlayers(c.id), c.countryId, c.leagueId, world.gameDate);
      assert.equal(
        summary.isCompliant,
        true,
        `${c.name} (${lId}) must start registration-compliant, issues: ${summary.issues.map((i) => i.en).join('; ')}`
      );
      if (lId === 'GER_BL') {
        assert.equal(summary.maxSquadSize, 30, 'Bundesliga senior limit must be 30');
        assert.ok(summary.hgcRegisteredCount >= 4, `${c.name} in Bundesliga must have >= 4 HG-C`);
      }
      if (lId === 'ITA_SA') {
        assert.equal(summary.u21ExemptMaxAge, 22, 'Serie A exempt age must be U22');
        assert.ok(summary.hgcRegisteredCount >= 4, `${c.name} in Serie A must have >= 4 HG-C`);
      }
      if (lId === 'ESP_LL') {
        assert.ok(summary.nonEuRegisteredCount <= 3, `${c.name} in La Liga must have <= 3 Non-EU`);
      }
      if (lId === 'FRA_L1') {
        assert.ok(summary.nonEuRegisteredCount <= 4, `${c.name} in Ligue 1 must have <= 4 Non-EU`);
      }
    }
  }

  // Verify autoRegisterSquadIds respects league caps when re-run
  const barcaPlayers = clubPlayers(barca.id);
  const autoIds = autoRegisterSquadIds(barcaPlayers, barca.countryId, new Set(), barca.leagueId, world.gameDate);
  const updatedBarcaPlayers = barcaPlayers.map((p) => ({ ...p, isRegistered: autoIds.has(p.id) }));
  const reEvaluated = evaluateSquadRegistration(updatedBarcaPlayers, barca.countryId, barca.leagueId, world.gameDate);
  assert.equal(reEvaluated.isCompliant, true, 'autoRegisterSquadIds must produce a compliant La Liga squad');
});





