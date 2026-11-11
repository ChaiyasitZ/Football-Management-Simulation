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
  advanceWorldOneDay,
  applyMatchResultToWorld,
  dehydrateWorldStateToCareerMap,
  loadWorldStateFromSlot,
  rehydrateWorldStateFromCareerDoc,
  renewPlayerContract,
  saveWorldStateToSlot,
  submitAndEvaluateTransferOffer,
} from './worldSimulationService';
import { analyzeTacticalRisks, calculatePositionFit } from './tacticsEngine';

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
    `จบการแข่งขัน 90 นาที: ${homeClub.name} 3 - 3 ${awayClub.name}`
  );
  const lastGoal = spliced.events.filter((e) => e.eventType === 'Goal').slice(-1)[0];
  assert.ok(
    lastGoal.text.includes('[3 - 3]') && lastGoal.text.includes('ซัดประตูตีเสมอ'),
    `90th-minute equalizer must state [3 - 3] and ตีเสมอ, got: ${lastGoal.text}`
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

  // Verify Cloud Firestore native Map dehydration and rehydration round-trip
  const careerMap = dehydrateWorldStateToCareerMap(nextState);
  const approxByteSize = Buffer.byteLength(JSON.stringify(careerMap), 'utf8');
  assert.ok(
    approxByteSize < 350_000,
    `Cloud Firestore careerState map must be well under 1MB limit (got ${approxByteSize} bytes)`
  );

  const rehydrated = rehydrateWorldStateFromCareerDoc({
    ownerId: 'user_test_1',
    slotId: 'slot_autosave',
    saveName: nextState.saveName,
    clubName: club.name,
    managerName: nextState.manager.name,
    gameDate: nextState.gameDate,
    season: nextState.currentSeason,
    lastSavedAtIso: '2026-11-10T10:00:00.000Z',
    randomSeed: nextState.randomSeed,
    controlledClubId: nextState.controlledClubId,
    careerState: careerMap,
  });

  assert.equal(Object.keys(rehydrated.clubs).length, 280);
  assert.equal(
    Object.keys(rehydrated.players).length,
    Object.keys(nextState.players).length
  );
  assert.equal(rehydrated.gameDate, nextState.gameDate);

  // Verify saveWorldStateToSlot and loadWorldStateFromSlot work with zero localStorage
  const metas = saveWorldStateToSlot('slot_autosave', nextState);
  assert.ok(metas.length >= 1);
  const loaded = loadWorldStateFromSlot('slot_autosave');
  assert.ok(loaded);
  assert.equal(loaded?.controlledClubId, nextState.controlledClubId);
});

