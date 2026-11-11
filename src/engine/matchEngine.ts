import {
  Club,
  Fixture,
  MatchEvent,
  MatchResult,
  MatchTeamStats,
  Mentality,
  Player,
  TacticalSystem,
} from '../types/game';
import { SeededRNG } from './random';
import {
  calculatePositionFit,
  evaluateAttributeSynergy,
  evaluateRoleSuitability,
} from './tacticsEngine';
import { trText } from '../i18n/LanguageContext';

interface TeamMatchStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeping: number;
  tempoModifier: number;
  pressModifier: number;
  mentalityAttackBoost: number;
  mentalityDefenseBoost: number;
  highLineVulnerability: number;
  activePlayers: Player[];
  gk: Player;
  attackers: Player[];
  midfielders: Player[];
  defenders: Player[];
}

function getMentalityMultipliers(mentality: Mentality): { atk: number; def: number } {
  switch (mentality) {
    case 'Very Defensive':
      return { atk: 0.78, def: 1.22 };
    case 'Defensive':
      return { atk: 0.86, def: 1.14 };
    case 'Cautious':
      return { atk: 0.93, def: 1.07 };
    case 'Balanced':
      return { atk: 1.0, def: 1.0 };
    case 'Positive':
      return { atk: 1.08, def: 0.95 };
    case 'Attacking':
      return { atk: 1.16, def: 0.88 };
    case 'Very Attacking':
      return { atk: 1.25, def: 0.8 };
  }
}

export function evaluateTeamMatchStrength(
  club: Club,
  tactic: TacticalSystem,
  playersById: Record<string, Player>,
  isHome: boolean
): TeamMatchStrength {
  const activePlayers: Player[] = [];
  let atkSum = 0;
  let midSum = 0;
  let defSum = 0;
  let gkRating = 11;
  let gkPlayer: Player | null = null;

  const attackers: Player[] = [];
  const midfielders: Player[] = [];
  const defenders: Player[] = [];

  for (const slot of tactic.lineup) {
    const p = slot.playerId ? playersById[slot.playerId] : null;
    if (!p) continue;
    activePlayers.push(p);

    const posFit = calculatePositionFit(p, slot.position);
    const roleScore = evaluateRoleSuitability(p, slot.role); // 1-20
    const fitnessMult = 0.68 + (p.fitness / 100) * 0.32;
    const sharpnessMult =
      p.matchSharpness < 75
        ? 0.78 + (p.matchSharpness / 75) * 0.14
        : 0.92 + ((p.matchSharpness - 75) / 25) * 0.1;
    const moraleMult = 0.86 + (p.morale / 100) * 0.26;
    const familiarityMult =
      tactic.familiarity < 65
        ? 0.82 + (tactic.familiarity / 65) * 0.1
        : 0.92 + ((tactic.familiarity - 65) / 35) * 0.12;

    const effectiveScore =
      ((p.currentAbility / 10) * 0.58 + roleScore * 0.42) *
      posFit *
      fitnessMult *
      sharpnessMult *
      moraleMult *
      familiarityMult;

    if (slot.position === 'GK') {
      gkRating = effectiveScore;
      gkPlayer = p;
    } else if (['DL', 'DR', 'DC', 'WBL', 'WBR'].includes(slot.position)) {
      defSum += effectiveScore;
      defenders.push(p);
      // Inverted Wing Back drifts into central midfield to overload the pivot
      if (slot.role === 'Inverted Wing Back') {
        midSum += effectiveScore * 0.35;
      } else if (slot.role === 'Complete Wing Back' || slot.role === 'Wing Back') {
        atkSum += effectiveScore * 0.22;
      }
      if (slot.instructions.includes('Tackle Harder')) {
        defSum += effectiveScore * 0.06;
      }
    } else if (['DM', 'MC', 'ML', 'MR', 'AMC'].includes(slot.position)) {
      midSum += effectiveScore;
      midfielders.push(p);
      if (slot.position === 'AMC' || slot.role === 'Box-to-Box Midfielder' || slot.role === 'Shadow Striker') {
        atkSum += effectiveScore * 0.45;
      }
      if (slot.position === 'DM' || slot.role === 'Box-to-Box Midfielder' || slot.role === 'Ball Winning Midfielder') {
        defSum += effectiveScore * 0.42;
      }
    } else {
      attackers.push(p);
      // False 9 drops deep into midfield to link play and drag CBs out of position
      if (slot.role === 'False 9') {
        midSum += effectiveScore * 0.42;
        atkSum += effectiveScore * 0.72;
      } else {
        atkSum += effectiveScore;
      }
    }
  }

  // Fallback if lineup incomplete
  if (!gkPlayer && activePlayers.length > 0) {
    gkPlayer = activePlayers[0];
  }
  const fallbackPlayer: Player =
    gkPlayer ||
    Object.values(playersById).find((p) => p.clubId === club.id) || {
      id: 'fallback_p',
      firstName: 'Youth',
      lastName: 'Reserve',
      dateOfBirth: '2005-01-01',
      nationality: 'England',
      nationalityCode: 'ENG',
      heightCm: 180,
      weightKg: 75,
      preferredFoot: 'Right',
      positions: ['MC'],
      preferredRole: 'Central Midfielder',
      currentAbility: 100,
      potentialAbility: 120,
      potentialRange: [110, 130],
      attributes: {
        technical: {
          finishing: 10, firstTouch: 10, passing: 10, technique: 10, dribbling: 10,
          crossing: 10, heading: 10, tackling: 10, marking: 10, longShots: 10,
          penaltyTaking: 10, freeKickTaking: 10, corners: 10, ballControl: 10,
        },
        mental: {
          decisions: 10, vision: 10, composure: 10, concentration: 10, positioning: 10,
          anticipation: 10, workRate: 10, teamwork: 10, leadership: 10, determination: 10,
          aggression: 10, flair: 10, offTheBall: 10, bravery: 10, consistency: 10,
        },
        physical: {
          acceleration: 10, pace: 10, stamina: 10, strength: 10, agility: 10,
          balance: 10, jumpingReach: 10, naturalFitness: 10,
        },
      },
      fitness: 90,
      matchSharpness: 85,
      morale: 75,
      tacticalFamiliarity: 75,
      squadStatus: 'Squad Player',
      satisfaction: 75,
      personality: 'Balanced',
      professionalism: 12,
      clubId: club.id,
      wagePerWeek: 10000,
      contractEndDate: '2028-06-30',
      goalBonus: 1000,
      marketValue: 1000000,
      askingPrice: 1500000,
      transferListed: false,
      loanListed: false,
      injuryStatus: { isInjured: false, daysRemaining: 0 },
      individualTraining: { attributeFocus: 'Balanced', roleFocus: 'Central Midfielder', intensity: 'Medium' },
      stats: {
        appearances: 0, starts: 0, goals: 0, assists: 0, yellowCards: 0,
        redCards: 0, cleanSheets: 0, minutesPlayed: 0, averageRating: 6.8, manOfTheMatch: 0,
      },
      developmentHistory: [],
      transferHistory: [],
    };

  const homeBoost = isHome ? 1.06 : 0.97;
  const { atk: mentAtk, def: mentDef } = getMentalityMultipliers(tactic.instructions.mentality);
  const synergy = evaluateAttributeSynergy(tactic, playersById);

  const tempoModifier =
    tactic.instructions.tempo === 'Much Higher'
      ? 1.18
      : tactic.instructions.tempo === 'Higher'
        ? 1.09
        : tactic.instructions.tempo === 'Lower'
          ? 0.92
          : tactic.instructions.tempo === 'Much Lower'
            ? 0.85
            : 1.0;

  const rawPressModifier =
    tactic.instructions.pressingIntensity === 'Very High'
      ? 1.16
      : tactic.instructions.pressingIntensity === 'High'
        ? 1.08
        : tactic.instructions.pressingIntensity === 'Low'
          ? 0.9
          : 1.0;

  // If High Press has weak links (low Work Rate / Stamina), pressing breaks down
  const pressWeakPenalty = Math.max(0.84, 1 - synergy.pressingSynergy.weakLinks.length * 0.05);
  const pressModifier = rawPressModifier * pressWeakPenalty;

  const baseHighLineVulnerability =
    tactic.instructions.defensiveLine === 'Very High'
      ? 1.18
      : tactic.instructions.defensiveLine === 'High'
        ? 1.08
        : tactic.instructions.defensiveLine === 'Deep'
          ? 0.9
          : 1.0;

  // Slow centre-backs in a High Line significantly increase vulnerability to counter-attacks
  const highLineVulnerability =
    baseHighLineVulnerability + synergy.defensiveLineSynergy.weakLinks.length * 0.11;

  return {
    attack: Math.max(25, (atkSum / Math.max(1, attackers.length)) * 5.2 * mentAtk * homeBoost),
    midfield: Math.max(25, (midSum / Math.max(1, midfielders.length)) * 5.2 * homeBoost * pressWeakPenalty),
    defense: Math.max(25, (defSum / Math.max(1, defenders.length)) * 5.2 * mentDef * homeBoost),
    goalkeeping: Math.max(25, gkRating * 5.2 * homeBoost),
    tempoModifier,
    pressModifier,
    mentalityAttackBoost: mentAtk,
    mentalityDefenseBoost: mentDef,
    highLineVulnerability,
    activePlayers: activePlayers.length > 0 ? activePlayers : [fallbackPlayer],
    gk: gkPlayer || fallbackPlayer,
    attackers: attackers.length > 0 ? attackers : [fallbackPlayer],
    midfielders: midfielders.length > 0 ? midfielders : [fallbackPlayer],
    defenders: defenders.length > 0 ? defenders : [fallbackPlayer],
  };
}

function createEmptyTeamStats(): MatchTeamStats {
  return {
    goals: 0,
    possession: 50,
    totalShots: 0,
    shotsOnTarget: 0,
    blockedShots: 0,
    xG: 0,
    passes: 0,
    passAccuracy: 82,
    tackles: 0,
    interceptions: 0,
    clearances: 0,
    fouls: 0,
    yellowCards: 0,
    redCards: 0,
    corners: 0,
    offsides: 0,
    saves: 0,
    bigChances: 0,
  };
}

/**
 * Simulates an entire 90-minute match deterministically from a seed and team tactics.
 * Pure function: produces MatchResult with full event timeline and coherent statistics.
 */
export function simulateMatch(
  fixture: Fixture,
  homeClub: Club,
  awayClub: Club,
  playersById: Record<string, Player>,
  seed: number,
  homeTacticOverride?: TacticalSystem,
  awayTacticOverride?: TacticalSystem
): MatchResult {
  const rng = new SeededRNG(seed);
  const homeTactic = homeTacticOverride || homeClub.primaryTactic;
  const awayTactic = awayTacticOverride || awayClub.primaryTactic;

  const homeStrength = evaluateTeamMatchStrength(homeClub, homeTactic, playersById, true);
  const awayStrength = evaluateTeamMatchStrength(awayClub, awayTactic, playersById, false);

  const homeStats = createEmptyTeamStats();
  const awayStats = createEmptyTeamStats();
  const events: MatchEvent[] = [];

  const ratings: Record<string, number> = {};
  for (const p of [...homeStrength.activePlayers, ...awayStrength.activePlayers]) {
    ratings[p.id] = 6.7;
  }

  // Possession calculation
  const midRatio =
    (homeStrength.midfield * homeStrength.pressModifier) /
    (homeStrength.midfield * homeStrength.pressModifier +
      awayStrength.midfield * awayStrength.pressModifier);
  const rawHomePoss = Math.round(midRatio * 100 + rng.int(-4, 4));
  homeStats.possession = Math.max(32, Math.min(68, rawHomePoss));
  awayStats.possession = 100 - homeStats.possession;

  // Base pass counts & accuracy
  homeStats.passes = Math.round(homeStats.possession * rng.float(8.2, 10.4));
  awayStats.passes = Math.round(awayStats.possession * rng.float(8.2, 10.4));
  homeStats.passAccuracy = Math.min(94, Math.max(71, Math.round(74 + (homeStrength.midfield / 100) * 16 + rng.int(-3, 3))));
  awayStats.passAccuracy = Math.min(94, Math.max(71, Math.round(74 + (awayStrength.midfield / 100) * 16 + rng.int(-3, 3))));

  events.push({
    id: `${fixture.id}_ev_kickoff`,
    fixtureId: fixture.id,
    minute: 1,
    eventType: 'KickOff',
    teamId: homeClub.id,
    text: trText(
      `The referee blows the whistle to kick off the match between ${homeClub.name} and ${awayClub.name}!`,
      `ผู้ตัดสินเป่านกหวีดเริ่มเกมการแข่งขันระหว่าง ${homeClub.name} เปิดบ้านพบกับ ${awayClub.name}!`
    ),
    pitchX: 50,
    pitchY: 50,
  });

  // Minute-by-minute simulation (1..90)
  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 45) {
      events.push({
        id: `${fixture.id}_ev_ht`,
        fixtureId: fixture.id,
        minute: 45,
        eventType: 'HalfTime',
        teamId: homeClub.id,
        text: trText(
          `Half-Time: ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}`,
          `จบครึ่งเวลาแรก: ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}`
        ),
        pitchX: 50,
        pitchY: 50,
      });
    }

    // Determine if an action happens this minute (~34% chance per minute)
    const tempoAvg = (homeStrength.tempoModifier + awayStrength.tempoModifier) / 2;
    if (!rng.chance(0.33 * tempoAvg)) {
      continue;
    }

    const isHomeAttacking = rng.chance(
      (homeStrength.midfield * 0.55 + homeStrength.attack * 0.45) /
        (homeStrength.midfield * 0.55 +
          homeStrength.attack * 0.45 +
          awayStrength.midfield * 0.55 +
          awayStrength.attack * 0.45)
    );

    const atkClub = isHomeAttacking ? homeClub : awayClub;
    const defClub = isHomeAttacking ? awayClub : homeClub;
    const atkStr = isHomeAttacking ? homeStrength : awayStrength;
    const defStr = isHomeAttacking ? awayStrength : homeStrength;
    const atkStats = isHomeAttacking ? homeStats : awayStats;
    const defStats = isHomeAttacking ? awayStats : homeStats;

    const attacker = rng.pick([...atkStr.attackers, ...atkStr.attackers, ...atkStr.midfielders]);
    const creator = rng.pick([...atkStr.midfielders, ...atkStr.attackers]);
    const defender = rng.pick(defStr.defenders);
    const gk = defStr.gk;

    const attackZoneX = isHomeAttacking ? rng.int(72, 94) : rng.int(6, 28);
    const attackZoneY = rng.int(22, 78);

    const roll = rng.next();

    // 1. Defensive action (Tackle / Interception / Foul) ~ 32%
    if (roll < 0.32) {
      const subRoll = rng.next();
      if (subRoll < 0.42) {
        defStats.tackles += 1;
        ratings[defender.id] = Math.min(10, (ratings[defender.id] || 6.7) + 0.08);
        if (rng.chance(0.25)) {
          events.push({
            id: `${fixture.id}_ev_${minute}_tkl`,
            fixtureId: fixture.id,
            minute,
            eventType: 'Tackle',
            teamId: defClub.id,
            playerId: defender.id,
            playerName: `${defender.firstName} ${defender.lastName}`,
            text: trText(
              `Min ${minute}': ${defender.lastName} (${defClub.shortName}) makes a well-timed tackle on the edge of the penalty area.`,
              `นาที ${minute}': ${defender.lastName} (${defClub.shortName}) เข้าสกัดบอลได้อย่างแม่นยำหน้ากรอบเขตโทษ`
            ),
            pitchX: attackZoneX,
            pitchY: attackZoneY,
          });
        }
      } else if (subRoll < 0.75) {
        defStats.interceptions += 1;
        defStats.clearances += rng.chance(0.5) ? 1 : 0;
        ratings[defender.id] = Math.min(10, (ratings[defender.id] || 6.7) + 0.06);
      } else {
        // Foul & potential card
        defStats.fouls += 1;
        const cardRoll = rng.next();
        if (cardRoll < 0.16) {
          defStats.yellowCards += 1;
          ratings[defender.id] = Math.max(3.5, (ratings[defender.id] || 6.7) - 0.35);
          events.push({
            id: `${fixture.id}_ev_${minute}_yc`,
            fixtureId: fixture.id,
            minute,
            eventType: 'YellowCard',
            teamId: defClub.id,
            playerId: defender.id,
            playerName: `${defender.firstName} ${defender.lastName}`,
            text: trText(
              `Min ${minute}': Yellow Card! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) is booked for a tactical foul on ${attacker.lastName}.`,
              `นาที ${minute}': ใบเหลือง! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) ทำฟาวล์ตัดเกมใส่ ${attacker.lastName}`
            ),
            pitchX: attackZoneX,
            pitchY: attackZoneY,
            isHighlight: true,
          });
        } else if (cardRoll < 0.172 && defStats.redCards === 0) {
          defStats.redCards += 1;
          ratings[defender.id] = Math.max(3.0, (ratings[defender.id] || 6.7) - 1.2);
          events.push({
            id: `${fixture.id}_ev_${minute}_rc`,
            fixtureId: fixture.id,
            minute,
            eventType: 'RedCard',
            teamId: defClub.id,
            playerId: defender.id,
            playerName: `${defender.firstName} ${defender.lastName}`,
            text: trText(
              `Min ${minute}': Straight Red Card! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) is sent off for a reckless challenge!`,
              `นาที ${minute}': ใบแดงโดยตรง! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) เข้าบอลอันตรายถูกไล่ออกจากสนาม!`
            ),
            pitchX: attackZoneX,
            pitchY: attackZoneY,
            isHighlight: true,
          });
        }
      }
      continue;
    }

    // 2. Offside or Corner build-up ~ 16%
    if (roll < 0.48) {
      if (rng.chance(0.45 * defStr.highLineVulnerability)) {
        atkStats.offsides += 1;
        if (rng.chance(0.35)) {
          events.push({
            id: `${fixture.id}_ev_${minute}_off`,
            fixtureId: fixture.id,
            minute,
            eventType: 'Offside',
            teamId: atkClub.id,
            playerId: attacker.id,
            playerName: `${attacker.firstName} ${attacker.lastName}`,
            text: trText(
              `Min ${minute}': ${attacker.lastName} (${atkClub.shortName}) breaks behind the defense, but the assistant referee raises the flag for offside.`,
              `นาที ${minute}': ${attacker.lastName} (${atkClub.shortName}) ทะลุช่องขึ้นไปแต่ผู้ช่วยผู้ตัดสินยกธงล้ำหน้า`
            ),
            pitchX: attackZoneX,
            pitchY: attackZoneY,
          });
        }
      } else {
        atkStats.corners += 1;
        defStats.clearances += 1;
      }
      continue;
    }

    // 3. Shot / Chance creation ~ 52% of active events
    atkStats.totalShots += 1;
    const attackAdv = (atkStr.attack - defStr.defense) / 100;
    const baseXg = Math.max(0.03, Math.min(0.48, rng.float(0.04, 0.22) + attackAdv * 0.12));
    const isBigChance = baseXg >= 0.22 || rng.chance(0.14);
    const shotXg = isBigChance ? Math.min(0.65, baseXg + 0.16) : baseXg;

    atkStats.xG = Number((atkStats.xG + shotXg).toFixed(2));
    if (isBigChance) {
      atkStats.bigChances += 1;
    }

    const shotOutcomeRoll = rng.next();
    const finishSkill = attacker.attributes.technical.finishing / 20;
    const gkSkill = gk.attributes.mental.positioning / 20;
    const goalThreshold = Math.max(0.06, Math.min(0.36, shotXg * (0.85 + finishSkill * 0.4 - gkSkill * 0.25)));

    if (shotOutcomeRoll < goalThreshold) {
      // GOAL!
      atkStats.shotsOnTarget += 1;
      atkStats.goals += 1;
      ratings[attacker.id] = Math.min(10, (ratings[attacker.id] || 6.7) + 1.05);
      ratings[gk.id] = Math.max(4.0, (ratings[gk.id] || 6.7) - 0.28);

      const hasAssist = creator.id !== attacker.id && rng.chance(0.78);
      if (hasAssist) {
        ratings[creator.id] = Math.min(10, (ratings[creator.id] || 6.7) + 0.65);
      }

      const assistText = hasAssist
        ? trText(` (Assist by ${creator.lastName})`, ` (แอสซิสต์โดย ${creator.lastName})`)
        : '';
      events.push({
        id: `${fixture.id}_ev_${minute}_goal_${atkStats.goals}_${atkClub.id}`,
        fixtureId: fixture.id,
        minute,
        eventType: 'Goal',
        teamId: atkClub.id,
        playerId: attacker.id,
        playerName: `${attacker.firstName} ${attacker.lastName}`,
        secondaryPlayerId: hasAssist ? creator.id : undefined,
        secondaryPlayerName: hasAssist ? `${creator.firstName} ${creator.lastName}` : undefined,
        xGDelta: shotXg,
        text: trText(
          `GOAL! Min ${minute}': ${attacker.firstName} ${attacker.lastName} scores for ${atkClub.name}!${assistText}`,
          `GOAL! นาที ${minute}': ${attacker.firstName} ${attacker.lastName} ทำประตูให้ ${atkClub.name}!${assistText}`
        ),
        pitchX: isHomeAttacking ? 95 : 5,
        pitchY: 50 + rng.int(-8, 8),
        isHighlight: true,
      });
    } else if (shotOutcomeRoll < goalThreshold + 0.34) {
      // Shot on target -> Save by GK
      atkStats.shotsOnTarget += 1;
      defStats.saves += 1;
      ratings[gk.id] = Math.min(10, (ratings[gk.id] || 6.7) + 0.26);
      ratings[attacker.id] = Math.min(10, (ratings[attacker.id] || 6.7) + 0.08);
      if (rng.chance(0.45)) {
        atkStats.corners += 1;
      }
      events.push({
        id: `${fixture.id}_ev_${minute}_save`,
        fixtureId: fixture.id,
        minute,
        eventType: 'Save',
        teamId: defClub.id,
        playerId: gk.id,
        playerName: `${gk.firstName} ${gk.lastName}`,
        secondaryPlayerId: attacker.id,
        secondaryPlayerName: `${attacker.firstName} ${attacker.lastName}`,
        xGDelta: shotXg,
        text: trText(
          `Min ${minute}': Crucial save! ${gk.lastName} (${defClub.shortName}) dives to parry ${attacker.lastName}'s effort wide.`,
          `นาที ${minute}': เซฟสำคัญ! ${gk.lastName} (${defClub.shortName}) พุ่งปัดลูกยิงของ ${attacker.lastName} ออกหลังไปได้`
        ),
        pitchX: isHomeAttacking ? 92 : 8,
        pitchY: attackZoneY,
        isHighlight: isBigChance,
      });
    } else if (shotOutcomeRoll < goalThreshold + 0.58) {
      // Blocked shot
      atkStats.blockedShots += 1;
      defStats.clearances += 1;
      ratings[defender.id] = Math.min(10, (ratings[defender.id] || 6.7) + 0.14);
      if (rng.chance(0.35)) {
        events.push({
          id: `${fixture.id}_ev_${minute}_blk`,
          fixtureId: fixture.id,
          minute,
          eventType: 'BlockedShot',
          teamId: atkClub.id,
          playerId: attacker.id,
          playerName: `${attacker.firstName} ${attacker.lastName}`,
          secondaryPlayerId: defender.id,
          secondaryPlayerName: `${defender.firstName} ${defender.lastName}`,
          xGDelta: shotXg,
          text: trText(
            `Min ${minute}': ${attacker.lastName} (${atkClub.shortName}) pulls the trigger, but ${defender.lastName} makes a vital block.`,
            `นาที ${minute}': ${attacker.lastName} (${atkClub.shortName}) ได้ง้างเท้ายิงแต่ติดบล็อกของ ${defender.lastName}`
          ),
          pitchX: attackZoneX,
          pitchY: attackZoneY,
        });
      }
    } else {
      // Shot off target
      ratings[attacker.id] = Math.max(4.5, (ratings[attacker.id] || 6.7) - 0.05);
      if (isBigChance || rng.chance(0.35)) {
        events.push({
          id: `${fixture.id}_ev_${minute}_miss`,
          fixtureId: fixture.id,
          minute,
          eventType: 'Shot',
          teamId: atkClub.id,
          playerId: attacker.id,
          playerName: `${attacker.firstName} ${attacker.lastName}`,
          xGDelta: shotXg,
          text: trText(
            `Min ${minute}': Big chance for ${atkClub.shortName}! ${attacker.lastName} fires just wide of the post.`,
            `นาที ${minute}': โอกาสทองของ ${atkClub.shortName}! ${attacker.lastName} สับไกยิงเฉียดเสาออกไปนิดเดียว`
          ),
          pitchX: attackZoneX,
          pitchY: attackZoneY,
          isHighlight: isBigChance,
        });
      }
    }
  }

  events.push({
    id: `${fixture.id}_ev_ft`,
    fixtureId: fixture.id,
    minute: 90,
    eventType: 'FullTime',
    teamId: homeClub.id,
    text: trText(
      `Full-Time (90'): ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}`,
      `จบการแข่งขัน 90 นาที: ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}`
    ),
    pitchX: 50,
    pitchY: 50,
    isHighlight: true,
  });

  // Finalize ratings & Man of the Match
  let motmId = homeStrength.activePlayers[0]?.id || '';
  let highestRating = -1;
  for (const [pId, r] of Object.entries(ratings)) {
    const rounded = Number(Math.max(4.2, Math.min(10.0, r)).toFixed(1));
    ratings[pId] = rounded;
    if (rounded > highestRating) {
      highestRating = rounded;
      motmId = pId;
    }
  }

  const attendance = Math.min(
    homeClub.stadiumCapacity,
    Math.round(homeClub.stadiumCapacity * rng.float(0.84, 0.99))
  );

  const initialResult: MatchResult = {
    homeGoals: homeStats.goals,
    awayGoals: awayStats.goals,
    homeStats,
    awayStats,
    events,
    playerRatings: ratings,
    manOfTheMatchPlayerId: motmId,
    attendance,
  };

  return reconcileMatchResultEventsAndStats(fixture, homeClub, awayClub, initialResult, events);
}

/**
 * Ensures 100% coherence between goal events, running scorelines in commentary text,
 * Half-Time / Full-Time summary lines, and final scoreboard numbers (even after live tactical splices).
 */
export function reconcileMatchResultEventsAndStats(
  fixture: Fixture,
  homeClub: Club,
  awayClub: Club,
  baseResult: MatchResult,
  rawEvents: MatchEvent[]
): MatchResult {
  // Filter out any duplicate KickOff / HalfTime / FullTime events so we can place them deterministically
  const playEvents = rawEvents.filter(
    (e) => e.eventType !== 'KickOff' && e.eventType !== 'HalfTime' && e.eventType !== 'FullTime'
  );

  playEvents.sort((a, b) => a.minute - b.minute);

  let runningHome = 0;
  let runningAway = 0;
  let htInserted = false;

  const reconciledEvents: MatchEvent[] = [
    {
      id: `${fixture.id}_ev_kickoff`,
      fixtureId: fixture.id,
      minute: 1,
      eventType: 'KickOff',
      teamId: homeClub.id,
      text: trText(
        `The referee blows the whistle to kick off the match between ${homeClub.name} and ${awayClub.name}!`,
        `ผู้ตัดสินเป่านกหวีดเริ่มเกมการแข่งขันระหว่าง ${homeClub.name} เปิดบ้านพบกับ ${awayClub.name}!`
      ),
      pitchX: 50,
      pitchY: 50,
    },
  ];

  playEvents.forEach((ev, idx) => {
    if (!htInserted && ev.minute > 45) {
      htInserted = true;
      reconciledEvents.push({
        id: `${fixture.id}_ev_ht`,
        fixtureId: fixture.id,
        minute: 45,
        eventType: 'HalfTime',
        teamId: homeClub.id,
        text: trText(
          `Half-Time: ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`,
          `จบครึ่งเวลาแรก: ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`
        ),
        pitchX: 50,
        pitchY: 50,
      });
    }

    if (ev.eventType === 'Goal') {
      const isHomeGoal = ev.teamId === homeClub.id;
      const prevScoring = isHomeGoal ? runningHome : runningAway;
      const oppScore = isHomeGoal ? runningAway : runningHome;

      if (isHomeGoal) {
        runningHome += 1;
      } else {
        runningAway += 1;
      }

      const newScoring = isHomeGoal ? runningHome : runningAway;
      const scoringClub = isHomeGoal ? homeClub : awayClub;
      const scorerLabel = ev.playerName || scoringClub.shortName;
      const assistSuffix = ev.secondaryPlayerName
        ? trText(
            ` (Assist by ${ev.secondaryPlayerName})`,
            ` (แอสซิสต์โดย ${ev.secondaryPlayerName})`
          )
        : '';

      let actionPhrase: string;
      if (prevScoring === 0 && oppScore === 0) {
        actionPhrase = trText(
          `opens the scoring to put ${scoringClub.name} ahead`,
          `ยิงประตูเบิกร่องให้ ${scoringClub.name} ขึ้นนำ`
        );
      } else if (newScoring === oppScore) {
        actionPhrase = trText(
          `fires home the equalizer for ${scoringClub.name}`,
          `ซัดประตูตีเสมอให้ ${scoringClub.name}`
        );
      } else if (prevScoring === oppScore && newScoring === oppScore + 1) {
        actionPhrase = trText(
          `strikes to put ${scoringClub.name} in front`,
          `ยิงประตูสุดสวยให้ ${scoringClub.name} แซงขึ้นนำ`
        );
      } else if (newScoring > oppScore + 1) {
        actionPhrase = trText(
          `extends ${scoringClub.name}'s lead`,
          `บวกประตูฉีกหนีให้ ${scoringClub.name}`
        );
      } else {
        actionPhrase = trText(
          `pulls a goal back for ${scoringClub.name}`,
          `ยิงประตูตีตื้นให้ ${scoringClub.name}`
        );
      }

      reconciledEvents.push({
        ...ev,
        id: `${fixture.id}_ev_${ev.minute}_goal_${runningHome}_${runningAway}_${idx}`,
        text: trText(
          `GOAL! Min ${ev.minute}' [${runningHome} - ${runningAway}]: ${scorerLabel} ${actionPhrase}!${assistSuffix}`,
          `GOAL! นาที ${ev.minute}' [${runningHome} - ${runningAway}]: ${scorerLabel} ${actionPhrase}!${assistSuffix}`
        ),
        isHighlight: true,
      });
    } else {
      reconciledEvents.push({
        ...ev,
        id: `${fixture.id}_ev_${ev.minute}_${ev.eventType}_${idx}`,
      });
    }
  });

  if (!htInserted) {
    reconciledEvents.push({
      id: `${fixture.id}_ev_ht`,
      fixtureId: fixture.id,
      minute: 45,
      eventType: 'HalfTime',
      teamId: homeClub.id,
      text: trText(
        `Half-Time: ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`,
        `จบครึ่งเวลาแรก: ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`
      ),
      pitchX: 50,
      pitchY: 50,
    });
  }

  reconciledEvents.push({
    id: `${fixture.id}_ev_ft`,
    fixtureId: fixture.id,
    minute: 90,
    eventType: 'FullTime',
    teamId: homeClub.id,
    text: trText(
      `Full-Time (90'): ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`,
      `จบการแข่งขัน 90 นาที: ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}`
    ),
    pitchX: 50,
    pitchY: 50,
    isHighlight: true,
  });

  const homeStats: MatchTeamStats = {
    ...baseResult.homeStats,
    goals: runningHome,
    shotsOnTarget: Math.max(baseResult.homeStats.shotsOnTarget, runningHome),
    totalShots: Math.max(
      baseResult.homeStats.totalShots,
      Math.max(baseResult.homeStats.shotsOnTarget, runningHome)
    ),
  };

  const awayStats: MatchTeamStats = {
    ...baseResult.awayStats,
    goals: runningAway,
    shotsOnTarget: Math.max(baseResult.awayStats.shotsOnTarget, runningAway),
    totalShots: Math.max(
      baseResult.awayStats.totalShots,
      Math.max(baseResult.awayStats.shotsOnTarget, runningAway)
    ),
  };

  return {
    ...baseResult,
    homeGoals: runningHome,
    awayGoals: runningAway,
    homeStats,
    awayStats,
    events: reconciledEvents,
  };
}

