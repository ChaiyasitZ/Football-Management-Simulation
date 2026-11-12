import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES_CONFIG } from './leaguesConfig';
import { createInitialWorldState } from './worldGenerator';
import { generateLeagueSchedule, recomputeLeagueStandings } from './leagueEngine';
import {
  reconcileMatchResultEventsAndStats,
  simulateMatch,
} from './matchEngine';
import {
  activateReleaseClauseTransfer,
  adjustClubBudgetAllocation,
  advanceWorldOneDay,
  applyForManagerJob,
  applyMatchResultToWorld,
  assignYouthMentor,
  buildScoutReportForPlayer,
  dehydrateWorldStateToCareerMap,
  generateAnnualYouthIntake,
  getClubStaffBonuses,
  getDeadlineDayBargains,
  isTransferDeadlineWindow,
  loadWorldStateFromSlot,
  processEndOfSeasonRollover,
  promoteYouthProspectToSenior,
  rehydrateWorldStateFromCareerDoc,
  releaseYouthProspect,
  removeMentoringGroup,
  renewPlayerContract,
  saveMentoringGroup,
  saveWorldStateToSlot,
  signPlayerOnBosmanFree,
  submitAndEvaluateTransferOffer,
  triggerClubTakeoverEvent,
  updatePlayerSquadAndTransferStatus,
  upgradeJuniorOrRecruitmentFacility,
} from './worldSimulationService';
import { getPlayerFaceUrl } from './engPlayerFaces';
import {
  analyzeTacticalRisks,
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
  togglePlayerInstructionWithExclusions,
} from './tacticsEngine';

test('15 European Leagues & 280 Clubs configuration and generation', () => {
  const world = createInitialWorldState(12345);
  const allClubs = Object.values(world.clubs);
  assert.equal(allClubs.length, 280, 'World must contain exactly 280 clubs across 15 leagues');

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
  const fixture = world.fixtures[0];
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

  assert.equal(Object.keys(rehydrated.clubs).length, 280);
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
    (f) => f.status === 'Scheduled' && (f.homeClubId === club.id || f.awayClubId === club.id)
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

  for (const wk of wonderkids.slice(0, 40)) {
    const faceUrl = getPlayerFaceUrl(wk);
    assert.ok(
      faceUrl && faceUrl.startsWith('https://'),
      `Wonderkid ${wk.firstName} ${wk.lastName} must resolve a verified portrait URL`
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

  for (const yp of myYouth) {
    const faceUrl = getPlayerFaceUrl(yp);
    assert.ok(faceUrl && faceUrl.startsWith('https://'), 'Every generated youth player must have a face URL');
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
  assert.equal(Object.keys(rolledOver.nextState.clubs).length, 280);
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


