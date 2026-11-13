import {
  Club,
  CornerRoutineType,
  Fixture,
  FreeKickRoutineType,
  HalfTimeTalkType,
  MatchEvent,
  MatchResult,
  MatchTeamStats,
  Mentality,
  PitchCondition,
  Player,
  TacticalSystem,
  TouchlineShoutType,
  WeatherCondition,
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
  foulMultiplier: number;
  cornerMultiplier: number;
  passAccBonus: number;
  offsideTrapBonus: number;
  activePlayers: Player[];
  gk: Player;
  attackers: Player[];
  midfielders: Player[];
  defenders: Player[];
}

export interface SimulateMatchOptions {
  isKnockout?: boolean;
  teamTalkBoostHome?: number; // e.g. 1.05 for positive half-time team talk
  teamTalkBoostAway?: number;
  halfTimeTalk?: { home?: HalfTimeTalkType; away?: HalfTimeTalkType };
  substitutions?: { minute: number; teamId: string; playerOutId: string; playerInId: string }[];
  touchlineShouts?: { minute: number; teamId: string; shout: TouchlineShoutType }[];
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

  let instrFoulDelta = 0;
  let instrCornerDelta = 0;

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

    // Individual Player Instructions impact
    const inst = slot.instructions || [];
    if (inst.includes('Shoot More')) {
      atkSum += effectiveScore * 0.08 * (p.attributes.technical.longShots / 14);
    }
    if (inst.includes('Shoot Less')) {
      midSum += effectiveScore * 0.05;
    }
    if (inst.includes('Dribble More')) {
      atkSum += effectiveScore * 0.09 * (p.attributes.technical.dribbling / 14);
    }
    if (inst.includes('Dribble Less')) {
      midSum += effectiveScore * 0.05;
    }
    if (inst.includes('Take More Risks')) {
      atkSum += effectiveScore * 0.08 * (p.attributes.mental.vision / 14);
    }
    if (inst.includes('Mark Tighter')) {
      defSum += effectiveScore * 0.05;
    }
    if (inst.includes('Cross More Often') || inst.includes('Stay Wider')) {
      instrCornerDelta += 0.05;
      atkSum += effectiveScore * 0.06 * (p.attributes.technical.crossing / 14);
    }
    if (inst.includes('Cut Inside')) {
      atkSum += effectiveScore * 0.08 * (p.attributes.technical.finishing / 14);
    }
    if (inst.includes('Roam From Position')) {
      atkSum += effectiveScore * 0.06 * (p.attributes.mental.offTheBall / 14);
    }
    if (inst.includes('Hold Position')) {
      defSum += effectiveScore * 0.08 * (p.attributes.mental.positioning / 14);
    }
    if (inst.includes('Tackle Harder')) {
      defSum += effectiveScore * 0.07;
      instrFoulDelta += 0.06;
    }
    if (inst.includes('Ease Off Tackles')) {
      instrFoulDelta -= 0.05;
    }
    if (inst.includes('Trigger Press More')) {
      midSum += effectiveScore * 0.06 * (p.attributes.mental.workRate / 14);
    }
    if (inst.includes('Trigger Press Less')) {
      defSum += effectiveScore * 0.04;
    }

    // Player Traits (Preferred Moves) impact on team match strength
    const traits = p.traits || [];
    if (traits.includes('Dictates Tempo')) {
      midSum += effectiveScore * 0.07;
    }
    if (traits.includes('Dives Into Tackles')) {
      defSum += effectiveScore * 0.06;
      instrFoulDelta += 0.04;
    }
    if (traits.includes('Runs With Ball Often')) {
      atkSum += effectiveScore * 0.06;
      instrCornerDelta += 0.04;
    }
    if (traits.includes('Tries Killer Balls Often')) {
      atkSum += effectiveScore * 0.06;
    }

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
  const { instructions } = tactic;
  const { atk: mentAtk, def: mentDef } = getMentalityMultipliers(instructions.mentality);
  const synergy = evaluateAttributeSynergy(tactic, playersById);

  // Team Instructions: Passing Directness, Width, Build-Up, Transition, Tackling, Offside Trap
  let directnessAtkMult = 1.0;
  let directnessMidMult = 1.0;
  let passAccBonus = 0;
  if (instructions.passingDirectness === 'Much Shorter') {
    directnessMidMult = 1.08;
    directnessAtkMult = 0.96;
    passAccBonus = 4;
  } else if (instructions.passingDirectness === 'Shorter') {
    directnessMidMult = 1.04;
    passAccBonus = 2;
  } else if (instructions.passingDirectness === 'More Direct') {
    directnessAtkMult = 1.06;
    directnessMidMult = 0.96;
    passAccBonus = -2;
  } else if (instructions.passingDirectness === 'Much More Direct') {
    directnessAtkMult = 1.1;
    directnessMidMult = 0.92;
    passAccBonus = -4;
  }

  let widthMidMult = 1.0;
  let cornerMultiplier = 1.0 + instrCornerDelta;
  if (instructions.attackingWidth === 'Wide') {
    cornerMultiplier += 0.16;
    widthMidMult = 0.97;
  } else if (instructions.attackingWidth === 'Narrow') {
    widthMidMult = 1.06;
    cornerMultiplier -= 0.1;
  }

  if (instructions.buildUp === 'Play Out of Defence') {
    directnessMidMult *= 1.04;
    passAccBonus += 2;
  } else if (instructions.buildUp === 'More Direct') {
    directnessAtkMult *= 1.07;
  }

  const lostTransition = instructions.whenPossessionLost || instructions.transition;
  let transitionDefMult = 1.0;
  if (lostTransition === 'Regroup') {
    transitionDefMult = 1.07;
  } else if (lostTransition === 'Counter-Press') {
    directnessMidMult *= 1.04;
  }

  let foulMultiplier = Math.max(0.6, 1.0 + instrFoulDelta);
  if (instructions.tackling === 'Get Stuck In') {
    foulMultiplier *= 1.28;
    transitionDefMult *= 1.05;
  } else if (instructions.tackling === 'Stay On Feet') {
    foulMultiplier *= 0.72;
  }

  const offsideTrapBonus = instructions.offsideTrap ? 0.35 : 0;

  const tempoModifier =
    instructions.tempo === 'Much Higher'
      ? 1.18
      : instructions.tempo === 'Higher'
        ? 1.09
        : instructions.tempo === 'Lower'
          ? 0.92
          : instructions.tempo === 'Much Lower'
            ? 0.85
            : 1.0;

  const rawPressModifier =
    instructions.pressingIntensity === 'Very High'
      ? 1.16
      : instructions.pressingIntensity === 'High'
        ? 1.08
        : instructions.pressingIntensity === 'Low'
          ? 0.9
          : 1.0;

  // If High Press has weak links (low Work Rate / Stamina), pressing breaks down
  const pressWeakPenalty = Math.max(0.84, 1 - synergy.pressingSynergy.weakLinks.length * 0.05);
  const pressModifier = rawPressModifier * pressWeakPenalty;

  const baseHighLineVulnerability =
    instructions.defensiveLine === 'Very High'
      ? 1.18
      : instructions.defensiveLine === 'High'
        ? 1.08
        : instructions.defensiveLine === 'Deep'
          ? 0.9
          : 1.0;

  // Slow centre-backs in a High Line significantly increase vulnerability to counter-attacks
  const highLineVulnerability =
    baseHighLineVulnerability + synergy.defensiveLineSynergy.weakLinks.length * 0.11;

  return {
    attack: Math.max(
      25,
      (atkSum / Math.max(1, attackers.length)) * 5.2 * mentAtk * directnessAtkMult * homeBoost
    ),
    midfield: Math.max(
      25,
      (midSum / Math.max(1, midfielders.length)) *
        5.2 *
        directnessMidMult *
        widthMidMult *
        homeBoost *
        pressWeakPenalty
    ),
    defense: Math.max(
      25,
      (defSum / Math.max(1, defenders.length)) * 5.2 * mentDef * transitionDefMult * homeBoost
    ),
    goalkeeping: Math.max(25, gkRating * 5.2 * homeBoost),
    tempoModifier,
    pressModifier,
    mentalityAttackBoost: mentAtk,
    mentalityDefenseBoost: mentDef,
    highLineVulnerability,
    foulMultiplier,
    cornerMultiplier: Math.max(0.7, cornerMultiplier),
    passAccBonus,
    offsideTrapBonus,
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

function pickBestSetPieceTaker(
  players: Player[],
  attr: 'penaltyTaking' | 'freeKickTaking' | 'corners' | 'heading',
  preferredPlayerId?: string | null
): Player {
  if (preferredPlayerId) {
    const designated = players.find((p) => p.id === preferredPlayerId);
    if (designated) return designated;
  }
  let best = players[0];
  let bestScore = -1;
  for (const p of players) {
    const traitBonus =
      attr === 'heading' && p.traits?.includes('Power Header')
        ? 4
        : attr === 'freeKickTaking' && p.traits?.includes('Curls Ball')
          ? 3
          : 0;
    const score =
      attr === 'heading'
        ? p.attributes.technical.heading + p.attributes.physical.jumpingReach + traitBonus
        : p.attributes.technical[attr] + p.attributes.mental.composure * 0.4 + traitBonus;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function applyHalfTimeTalkModifier(
  talk: HalfTimeTalkType,
  myGoals: number,
  oppGoals: number,
  str: TeamMatchStrength
): { labelEn: string; labelTh: string } {
  const diff = myGoals - oppGoals;
  switch (talk) {
    case 'praise':
      if (diff >= 0) {
        str.attack *= 1.09;
        str.midfield *= 1.07;
      } else {
        str.attack *= 1.02;
      }
      return {
        labelEn: 'Praise First-Half Performance (+9% Attacking Confidence)',
        labelTh: 'ชื่นชมฟอร์มครึ่งแรก (+9% ความมั่นใจและการจบสกอร์)',
      };
    case 'encourage':
      str.attack *= 1.08;
      str.midfield *= 1.08;
      return {
        labelEn: 'Encourage the Squad (+8% Momentum & Work Rate)',
        labelTh: 'กระตุ้นลูกทีมให้ฮึดสู้ (+8% โมเมนตัมและความขยัน)',
      };
    case 'demand_more':
      str.attack *= 1.1;
      str.tempoModifier *= 1.06;
      return {
        labelEn: 'Demand Higher Standards (+10% Attacking Tempo)',
        labelTh: 'เรียกร้องมาตรฐานที่สูงขึ้น (+10% จังหวะบุกและเพรสซิ่ง)',
      };
    case 'aggressive':
      if (diff <= 0) {
        str.attack *= 1.14;
        str.midfield *= 1.11;
      } else if (diff >= 2) {
        str.attack *= 0.94;
        str.defense *= 0.95;
      } else {
        str.attack *= 1.05;
      }
      return {
        labelEn: 'Aggressive Dressing Room Hairdryer (+14% Comeback Surge)',
        labelTh: 'ทุบโต๊ะปลุกใจในห้องแต่งตัว (+14% แรงฮึดทวงประตูคืน)',
      };
    case 'no_complacency':
      str.defense *= 1.18;
      str.midfield *= 1.06;
      return {
        labelEn: 'Guard Against Complacency (+18% Defensive Discipline)',
        labelTh: 'กำชับห้ามประมาท (+18% วินัยเกมรับลดความผิดพลาดท้ายเกม)',
      };
  }
}

/**
 * Simulates an entire 90-minute match (plus Extra Time & Penalties if knockout) deterministically from a seed and team tactics.
 * Pure function: produces MatchResult with full event timeline and coherent statistics.
 */
export function simulateMatch(
  fixture: Fixture,
  homeClub: Club,
  awayClub: Club,
  playersById: Record<string, Player>,
  seed: number,
  homeTacticOverride?: TacticalSystem,
  awayTacticOverride?: TacticalSystem,
  options?: SimulateMatchOptions
): MatchResult {
  const rng = new SeededRNG(seed);
  const homeTactic = homeTacticOverride || homeClub.primaryTactic;
  const awayTactic = awayTacticOverride || awayClub.primaryTactic;

  const homeStrength = evaluateTeamMatchStrength(homeClub, homeTactic, playersById, true);
  const awayStrength = evaluateTeamMatchStrength(awayClub, awayTactic, playersById, false);

  // Deterministic Weather & Pitch Condition physics (Checkpoint 19)
  const weatherHash = Math.abs(seed + fixture.matchday * 37) % 100;
  const monthNum = Number(fixture.kickoffDate?.slice(5, 7) || '10');
  const isWinter = monthNum === 12 || monthNum === 1 || monthNum === 2;
  let weather: WeatherCondition = 'Clear';
  let pitchCondition: PitchCondition = 'Perfect';
  if (isWinter && weatherHash < 12) {
    weather = 'Snow';
    pitchCondition = 'Frozen';
  } else if (weatherHash < 24) {
    weather = 'Heavy Rain';
    pitchCondition = 'Waterlogged';
  } else if (weatherHash < 44) {
    weather = 'Light Rain';
    pitchCondition = 'Slick';
  } else if (weatherHash < 58) {
    weather = 'Strong Wind';
    pitchCondition = 'Perfect';
  }

  const weatherPassAccDelta =
    weather === 'Heavy Rain' || weather === 'Snow'
      ? -4
      : weather === 'Strong Wind'
        ? -2
        : weather === 'Light Rain'
          ? 1
          : 0;
  const weatherReboundGoalBonus =
    pitchCondition === 'Waterlogged' || pitchCondition === 'Slick' ? 0.025 : 0;
  if (weather === 'Strong Wind') {
    homeStrength.cornerMultiplier *= 0.9;
    awayStrength.cornerMultiplier *= 0.9;
  }

  const homeStats = createEmptyTeamStats();
  const awayStats = createEmptyTeamStats();
  const events: MatchEvent[] = [];
  const recordedSubstitutions: { minute: number; teamId: string; playerOutId: string; playerInId: string }[] = [
    ...(options?.substitutions || []),
  ];
  const recordedShouts: { minute: number; teamId: string; shout: TouchlineShoutType }[] = [
    ...(options?.touchlineShouts || []),
  ];

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

  // Base pass counts & accuracy (including passingDirectness, buildUp & weather physics)
  homeStats.passes = Math.round(homeStats.possession * rng.float(8.2, 10.4));
  awayStats.passes = Math.round(awayStats.possession * rng.float(8.2, 10.4));
  homeStats.passAccuracy = Math.min(
    95,
    Math.max(
      64,
      Math.round(
        74 + (homeStrength.midfield / 100) * 16 + homeStrength.passAccBonus + weatherPassAccDelta + rng.int(-2, 2)
      )
    )
  );
  awayStats.passAccuracy = Math.min(
    95,
    Math.max(
      64,
      Math.round(
        74 + (awayStrength.midfield / 100) * 16 + awayStrength.passAccBonus + weatherPassAccDelta + rng.int(-2, 2)
      )
    )
  );

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

  const sentOffIds = new Set<string>();
  const yellowCardCounts: Record<string, number> = {};

  const removeSentOffPlayer = (str: TeamMatchStrength, playerId: string) => {
    sentOffIds.add(playerId);
    if (str.activePlayers.length > 2) {
      str.activePlayers = str.activePlayers.filter((p) => p.id !== playerId);
    }
    if (str.attackers.length > 1) {
      str.attackers = str.attackers.filter((p) => p.id !== playerId);
    }
    if (str.midfielders.length > 1) {
      str.midfielders = str.midfielders.filter((p) => p.id !== playerId);
    }
    if (str.defenders.length > 1) {
      str.defenders = str.defenders.filter((p) => p.id !== playerId);
    }
    // Playing with 10 men reduces team attack and midfield control
    str.attack *= 0.87;
    str.midfield *= 0.86;
    str.defense *= 0.92;
  };

  const getShoutModifiersForTeam = (teamId: string, minute: number, isWinning: boolean) => {
    let atkMult = 1.0;
    let defMult = 1.0;
    let tempoMult = 1.0;
    let foulMult = 1.0;
    for (const s of recordedShouts) {
      if (s.teamId === teamId && minute >= s.minute && minute <= s.minute + 15) {
        if (s.shout === 'Encourage') {
          atkMult *= 1.04;
          defMult *= 1.02;
        } else if (s.shout === 'Demand More') {
          atkMult *= 1.07;
          tempoMult *= 1.06;
        } else if (s.shout === 'Calm Down') {
          defMult *= 1.05;
          foulMult *= 0.72;
          tempoMult *= 0.95;
        } else if (s.shout === 'Focus') {
          defMult *= 1.07;
        } else if (s.shout === 'Praise') {
          atkMult *= isWinning ? 1.05 : 1.02;
          defMult *= isWinning ? 1.05 : 1.01;
        }
      }
    }
    return { atkMult, defMult, tempoMult, foulMult };
  };

  const simulateMinuteBlock = (startMin: number, endMin: number) => {
    for (let minute = startMin; minute <= endMin; minute++) {
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
        if (options?.teamTalkBoostHome) {
          homeStrength.attack *= options.teamTalkBoostHome;
          homeStrength.midfield *= options.teamTalkBoostHome;
        }
        if (options?.teamTalkBoostAway) {
          awayStrength.attack *= options.teamTalkBoostAway;
          awayStrength.midfield *= options.teamTalkBoostAway;
        }
        if (options?.halfTimeTalk?.home) {
          const talkInfo = applyHalfTimeTalkModifier(
            options.halfTimeTalk.home,
            homeStats.goals,
            awayStats.goals,
            homeStrength
          );
          events.push({
            id: `${fixture.id}_ev_45_htt_home`,
            fixtureId: fixture.id,
            minute: 45,
            eventType: 'TacticalChange',
            teamId: homeClub.id,
            text: trText(
              `Half-Time Team Talk (${homeClub.shortName}): ${talkInfo.labelEn}`,
              `ปลุกใจช่วงพักครึ่ง (${homeClub.shortName}): ${talkInfo.labelTh}`
            ),
            pitchX: 50,
            pitchY: 50,
            isHighlight: true,
          });
        }
        if (options?.halfTimeTalk?.away) {
          const talkInfo = applyHalfTimeTalkModifier(
            options.halfTimeTalk.away,
            awayStats.goals,
            homeStats.goals,
            awayStrength
          );
          events.push({
            id: `${fixture.id}_ev_45_htt_away`,
            fixtureId: fixture.id,
            minute: 45,
            eventType: 'TacticalChange',
            teamId: awayClub.id,
            text: trText(
              `Half-Time Team Talk (${awayClub.shortName}): ${talkInfo.labelEn}`,
              `ปลุกใจช่วงพักครึ่ง (${awayClub.shortName}): ${talkInfo.labelTh}`
            ),
            pitchX: 50,
            pitchY: 50,
            isHighlight: true,
          });
        }
      }

      // Process any scheduled/live substitutions at this minute
      for (const sub of recordedSubstitutions) {
        if (sub.minute === minute) {
          const isHomeSub = sub.teamId === homeClub.id;
          const clubObj = isHomeSub ? homeClub : awayClub;
          const strObj = isHomeSub ? homeStrength : awayStrength;
          const pOut = playersById[sub.playerOutId];
          const pIn = playersById[sub.playerInId];
          if (pOut && pIn && !sentOffIds.has(pOut.id)) {
            strObj.activePlayers = strObj.activePlayers.map((p) => (p.id === pOut.id ? pIn : p));
            strObj.attackers = strObj.attackers.map((p) => (p.id === pOut.id ? pIn : p));
            strObj.midfielders = strObj.midfielders.map((p) => (p.id === pOut.id ? pIn : p));
            strObj.defenders = strObj.defenders.map((p) => (p.id === pOut.id ? pIn : p));
            ratings[pIn.id] = ratings[pIn.id] ?? 6.7;
            // Fresh legs boost
            strObj.attack *= 1.02;
            strObj.midfield *= 1.02;
            events.push({
              id: `${fixture.id}_ev_${minute}_sub_${pIn.id}`,
              fixtureId: fixture.id,
              minute,
              eventType: 'Substitution',
              teamId: clubObj.id,
              playerId: pIn.id,
              playerName: `${pIn.firstName} ${pIn.lastName}`,
              secondaryPlayerId: pOut.id,
              secondaryPlayerName: `${pOut.firstName} ${pOut.lastName}`,
              text: trText(
                `Min ${minute}': Substitution (${clubObj.shortName}) — ${pIn.firstName} ${pIn.lastName} replaces ${pOut.firstName} ${pOut.lastName}.`,
                `นาที ${minute}': เปลี่ยนตัวผู้เล่น (${clubObj.shortName}) — ส่ง ${pIn.firstName} ${pIn.lastName} ลงมาแทน ${pOut.firstName} ${pOut.lastName}`
              ),
              pitchX: 50,
              pitchY: 95,
            });
          }
        }
      }

      const homeShoutMod = getShoutModifiersForTeam(homeClub.id, minute, homeStats.goals > awayStats.goals);
      const awayShoutMod = getShoutModifiersForTeam(awayClub.id, minute, awayStats.goals > homeStats.goals);

      // Captain Leadership late-game composure bonus (minutes 75..90+)
      let homeCaptBonus = 1.0;
      let awayCaptBonus = 1.0;
      if (minute >= 75) {
        const hCapt = homeStrength.activePlayers.find((p) => p.id === homeTactic.setPieces?.captainId);
        const aCapt = awayStrength.activePlayers.find((p) => p.id === awayTactic.setPieces?.captainId);
        if (hCapt) {
          homeCaptBonus = 1 + ((hCapt.attributes.mental.leadership + hCapt.attributes.mental.determination) / 40) * 0.06;
        }
        if (aCapt) {
          awayCaptBonus = 1 + ((aCapt.attributes.mental.leadership + aCapt.attributes.mental.determination) / 40) * 0.06;
        }
      }

      // Determine if an action happens this minute (~34% chance per minute)
      const tempoAvg =
        (homeStrength.tempoModifier * homeShoutMod.tempoMult +
          awayStrength.tempoModifier * awayShoutMod.tempoMult) /
        2;
      if (!rng.chance(0.33 * tempoAvg)) {
        continue;
      }

      const effHomeAtk = homeStrength.attack * homeShoutMod.atkMult * homeCaptBonus;
      const effHomeMid = homeStrength.midfield * homeShoutMod.atkMult * homeCaptBonus;
      const effAwayAtk = awayStrength.attack * awayShoutMod.atkMult * awayCaptBonus;
      const effAwayMid = awayStrength.midfield * awayShoutMod.atkMult * awayCaptBonus;

      const isHomeAttacking = rng.chance(
        (effHomeMid * 0.55 + effHomeAtk * 0.45) /
          (effHomeMid * 0.55 + effHomeAtk * 0.45 + effAwayMid * 0.55 + effAwayAtk * 0.45)
      );

      const atkClub = isHomeAttacking ? homeClub : awayClub;
      const defClub = isHomeAttacking ? awayClub : homeClub;
      const atkTactic = isHomeAttacking ? homeTactic : awayTactic;
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

      // 1. Defensive action (Tackle / Interception / Foul / Penalty / FreeKick) ~ 32%
      if (roll < 0.32) {
        const subRoll = rng.next();
        if (subRoll < 0.42) {
          defStats.tackles += 1;
          ratings[defender.id] = Math.min(10, (ratings[defender.id] || 6.7) + 0.08);
          if (rng.chance(0.25)) {
            const hasDiveTrait = defender.traits?.includes('Dives Into Tackles');
            events.push({
              id: `${fixture.id}_ev_${minute}_tkl`,
              fixtureId: fixture.id,
              minute,
              eventType: 'Tackle',
              teamId: defClub.id,
              playerId: defender.id,
              playerName: `${defender.firstName} ${defender.lastName}`,
              text: hasDiveTrait
                ? trText(
                    `Min ${minute}': ${defender.lastName} (${defClub.shortName}) [Dives Into Tackles] launches into a crunching sliding tackle to win the ball!`,
                    `นาที ${minute}': ${defender.lastName} (${defClub.shortName}) [เสียบสกัดดุดัน] พุ่งเสียบสกัดบอลอย่างแม่นยำหน้ากรอบเขตโทษ!`
                  )
                : trText(
                    `Min ${minute}': ${defender.lastName} (${defClub.shortName}) makes a well-timed tackle on the edge of the penalty area.`,
                    `นาที ${minute}': ${defender.lastName} (${defClub.shortName}) เข้าสกัดบอลได้อย่างแม่นยำหน้ากรอบเขตโทษ`
                  ),
              pitchX: attackZoneX,
              pitchY: attackZoneY,
            });
          }
        } else if (subRoll < 0.72) {
          defStats.interceptions += 1;
          defStats.clearances += rng.chance(0.5) ? 1 : 0;
          ratings[defender.id] = Math.min(10, (ratings[defender.id] || 6.7) + 0.06);
        } else {
          // Foul & potential card / Penalty / FreeKick
          defStats.fouls += 1;
          const cardRoll = rng.next() / defStr.foulMultiplier;
          if (cardRoll < 0.16) {
            defStats.yellowCards += 1;
            yellowCardCounts[defender.id] = (yellowCardCounts[defender.id] || 0) + 1;
            ratings[defender.id] = Math.max(3.5, (ratings[defender.id] || 6.7) - 0.35);

            if (yellowCardCounts[defender.id] >= 2) {
              defStats.redCards += 1;
              ratings[defender.id] = Math.max(3.0, (ratings[defender.id] || 6.7) - 1.0);
              removeSentOffPlayer(defStr, defender.id);
              events.push({
                id: `${fixture.id}_ev_${minute}_2yc_rc`,
                fixtureId: fixture.id,
                minute,
                eventType: 'RedCard',
                teamId: defClub.id,
                playerId: defender.id,
                playerName: `${defender.firstName} ${defender.lastName}`,
                text: trText(
                  `Min ${minute}': Second Yellow Card -> RED CARD! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) is sent off!`,
                  `นาที ${minute}': เหลืองที่สองเป็นใบแดง! ${defender.firstName} ${defender.lastName} (${defClub.shortName}) ถูกไล่ออกจากสนาม!`
                ),
                pitchX: attackZoneX,
                pitchY: attackZoneY,
                isHighlight: true,
              });
            } else {
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
            }
          } else if (cardRoll < 0.172 && defStats.redCards === 0) {
            defStats.redCards += 1;
            ratings[defender.id] = Math.max(3.0, (ratings[defender.id] || 6.7) - 1.2);
            removeSentOffPlayer(defStr, defender.id);
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

          // Check if foul inside penalty area -> PENALTY!
          const inBox = isHomeAttacking ? attackZoneX >= 87 : attackZoneX <= 13;
          if (inBox && rng.chance(0.14)) {
            const pkTaker = pickBestSetPieceTaker(
              atkStr.activePlayers,
              'penaltyTaking',
              atkTactic.setPieces?.penaltyTakerId
            );
            atkStats.totalShots += 1;
            atkStats.bigChances += 1;
            atkStats.xG = Number((atkStats.xG + 0.78).toFixed(2));
            const pkSkill =
              (pkTaker.attributes.technical.penaltyTaking + pkTaker.attributes.mental.composure) / 40;
            const gkSaveSkill = (gk.attributes.physical.agility + gk.attributes.mental.positioning) / 40;
            const pkGoalProb = Math.max(0.65, Math.min(0.88, 0.76 + (pkSkill - gkSaveSkill) * 0.25));

            events.push({
              id: `${fixture.id}_ev_${minute}_pen_award`,
              fixtureId: fixture.id,
              minute,
              eventType: 'Penalty',
              teamId: atkClub.id,
              playerId: pkTaker.id,
              playerName: `${pkTaker.firstName} ${pkTaker.lastName}`,
              text: trText(
                `Min ${minute}': PENALTY to ${atkClub.name}! ${defender.lastName} brings down ${attacker.lastName} in the box. ${pkTaker.lastName} steps up to the spot...`,
                `นาที ${minute}': จุดโทษของ ${atkClub.name}! ${defender.lastName} สกัด ${attacker.lastName} ล้มในเขตโทษ ${pkTaker.lastName} รับหน้าที่สังหาร...`
              ),
              pitchX: isHomeAttacking ? 89 : 11,
              pitchY: 50,
              isHighlight: true,
            });

            if (rng.chance(pkGoalProb)) {
              atkStats.shotsOnTarget += 1;
              atkStats.goals += 1;
              ratings[pkTaker.id] = Math.min(10, (ratings[pkTaker.id] || 6.7) + 0.95);
              events.push({
                id: `${fixture.id}_ev_${minute}_goal_${atkStats.goals}_${atkClub.id}`,
                fixtureId: fixture.id,
                minute,
                eventType: 'Goal',
                teamId: atkClub.id,
                playerId: pkTaker.id,
                playerName: `${pkTaker.firstName} ${pkTaker.lastName} (Pen)`,
                xGDelta: 0.78,
                shotXg: 0.78,
                shotX: isHomeAttacking ? 89 : 11,
                shotY: 50,
                text: trText(
                  `GOAL! Min ${minute}': ${pkTaker.firstName} ${pkTaker.lastName} buries the penalty for ${atkClub.name}!`,
                  `GOAL! นาที ${minute}': ${pkTaker.firstName} ${pkTaker.lastName} ยิงจุดโทษเข้าไปอย่างเฉียบขาดให้ ${atkClub.name}!`
                ),
                pitchX: isHomeAttacking ? 95 : 5,
                pitchY: 50,
                isHighlight: true,
              });
            } else {
              atkStats.shotsOnTarget += 1;
              defStats.saves += 1;
              ratings[pkTaker.id] = Math.max(4.0, (ratings[pkTaker.id] || 6.7) - 0.65);
              ratings[gk.id] = Math.min(10, (ratings[gk.id] || 6.7) + 0.75);
              events.push({
                id: `${fixture.id}_ev_${minute}_pen_miss`,
                fixtureId: fixture.id,
                minute,
                eventType: 'PenaltyMissed',
                teamId: atkClub.id,
                playerId: pkTaker.id,
                playerName: `${pkTaker.firstName} ${pkTaker.lastName}`,
                secondaryPlayerId: gk.id,
                secondaryPlayerName: `${gk.firstName} ${gk.lastName}`,
                xGDelta: 0.78,
                shotXg: 0.78,
                shotX: isHomeAttacking ? 89 : 11,
                shotY: 50,
                text: trText(
                  `Min ${minute}': PENALTY SAVED! ${gk.lastName} (${defClub.shortName}) guesses the right way to deny ${pkTaker.lastName} from the spot!`,
                  `นาที ${minute}': เซฟจุดโทษ! ${gk.lastName} (${defClub.shortName}) พุ่งถูกทางปัดลูกจุดโทษของ ${pkTaker.lastName} เอาไว้ได้!`
                ),
                pitchX: isHomeAttacking ? 93 : 7,
                pitchY: 50,
                isHighlight: true,
              });
            }
          } else if (rng.chance(0.18)) {
            // Dangerous Free-Kick with SetPieceSetup Routine
            const fkTaker = pickBestSetPieceTaker(
              atkStr.activePlayers,
              'freeKickTaking',
              atkTactic.setPieces?.freeKickTakerId
            );
            const fkRoutine: FreeKickRoutineType = atkTactic.setPieces?.freeKickRoutine || 'direct_shoot';
            atkStats.totalShots += 1;
            const fkXg = fkRoutine === 'cross_box' ? 0.1 : 0.08;
            atkStats.xG = Number((atkStats.xG + fkXg).toFixed(2));
            const fkSkill = fkTaker.attributes.technical.freeKickTaking / 20;
            const curlBonus = fkTaker.traits?.includes('Curls Ball') ? 0.03 : 0;
            const routineBonus = fkRoutine === 'short_layoff' ? 0.02 : 0.01;
            const fkX = isHomeAttacking ? 78 : 22;
            if (rng.chance(0.09 * (0.7 + fkSkill) + curlBonus + routineBonus)) {
              atkStats.shotsOnTarget += 1;
              atkStats.goals += 1;
              ratings[fkTaker.id] = Math.min(10, (ratings[fkTaker.id] || 6.7) + 1.1);
              const routineDescEn =
                fkRoutine === 'short_layoff'
                  ? 'after a clever short free-kick layoff'
                  : fkRoutine === 'cross_box'
                    ? 'from a whipped free-kick delivery into the box'
                    : 'curling a direct free-kick into the top corner';
              const routineDescTh =
                fkRoutine === 'short_layoff'
                  ? 'จากแผนเขี่ยฟรีคิกสั้นให้ยิงแถวสองเสียบเสา'
                  : fkRoutine === 'cross_box'
                    ? 'จากลูกเปิดฟรีคิกโค้งเข้ากรอบเขตโทษ'
                    : 'ปั่นฟรีคิกโดยตรงโค้งเสียบสามเหลี่ยม';
              events.push({
                id: `${fixture.id}_ev_${minute}_goal_${atkStats.goals}_${atkClub.id}`,
                fixtureId: fixture.id,
                minute,
                eventType: 'Goal',
                teamId: atkClub.id,
                playerId: fkTaker.id,
                playerName: `${fkTaker.firstName} ${fkTaker.lastName} (FK)`,
                xGDelta: fkXg,
                shotXg: fkXg,
                shotX: fkX,
                shotY: attackZoneY,
                text: trText(
                  `GOAL! Min ${minute}': Stunning free-kick from ${fkTaker.firstName} ${fkTaker.lastName} (${atkClub.shortName}) ${routineDescEn}!`,
                  `GOAL! นาที ${minute}': ฟรีคิกสุดสวยของ ${fkTaker.firstName} ${fkTaker.lastName} (${atkClub.shortName}) ${routineDescTh}!`
                ),
                pitchX: isHomeAttacking ? 95 : 5,
                pitchY: 48,
                isHighlight: true,
              });
            } else {
              events.push({
                id: `${fixture.id}_ev_${minute}_fk`,
                fixtureId: fixture.id,
                minute,
                eventType: 'FreeKick',
                teamId: atkClub.id,
                playerId: fkTaker.id,
                playerName: `${fkTaker.firstName} ${fkTaker.lastName}`,
                xGDelta: fkXg,
                shotXg: fkXg,
                shotX: fkX,
                shotY: attackZoneY,
                text: trText(
                  `Min ${minute}': ${fkTaker.lastName} (${atkClub.shortName}) curls a dangerous free-kick just over the crossbar.`,
                  `นาที ${minute}': ${fkTaker.lastName} (${atkClub.shortName}) ปั่นฟรีคิกข้ามคานออกไปนิดเดียว`
                ),
                pitchX: fkX,
                pitchY: attackZoneY,
              });
            }
          }
        }
        continue;
      }

      // 2. Offside or Corner Set-Piece ~ 16%
      if (roll < 0.48) {
        const beatsOffsideFactor = attacker.traits?.includes('Beats Offside Trap') ? 0.65 : 1.0;
        const offsideChance =
          (0.42 * defStr.highLineVulnerability + defStr.offsideTrapBonus * 0.35) * beatsOffsideFactor;
        if (rng.chance(offsideChance)) {
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
          // Corner opportunity with SetPieceSetup Taker & Routine
          if (rng.chance(0.24 * atkStr.cornerMultiplier)) {
            const cornerTaker = pickBestSetPieceTaker(
              atkStr.activePlayers,
              'corners',
              atkTactic.setPieces?.cornerTakerId
            );
            const cornerRoutine: CornerRoutineType = atkTactic.setPieces?.cornerRoutine || 'near_post';
            const headerTarget = pickBestSetPieceTaker(atkStr.activePlayers, 'heading');
            atkStats.totalShots += 1;
            const hdrXg = cornerRoutine === 'near_post' ? 0.12 : 0.11;
            atkStats.xG = Number((atkStats.xG + hdrXg).toFixed(2));
            const hdrSkill =
              (headerTarget.attributes.technical.heading + headerTarget.attributes.physical.jumpingReach) / 40;
            const powerHeaderBonus = headerTarget.traits?.includes('Power Header') ? 0.04 : 0;
            const hdrX = isHomeAttacking ? 91 : 9;
            const hdrY =
              cornerRoutine === 'near_post'
                ? 42
                : cornerRoutine === 'far_post'
                  ? 58
                  : 50 + rng.int(-4, 4);
            const routineLabelEn =
              cornerRoutine === 'near_post'
                ? 'at the near post'
                : cornerRoutine === 'far_post'
                  ? 'at the back post'
                  : cornerRoutine === 'short'
                    ? 'after a short corner routine'
                    : 'in the heart of the six-yard box';
            const routineLabelTh =
              cornerRoutine === 'near_post'
                ? 'โฉบเสาแรก'
                : cornerRoutine === 'far_post'
                  ? 'กดเสาสอง'
                  : cornerRoutine === 'short'
                    ? 'จากลูกเตะมุมสั้นเซ็ตเข้าเขตโทษ'
                    : 'กลางกรอบ 6 หลา';
            if (rng.chance(0.18 * (0.75 + hdrSkill) + powerHeaderBonus)) {
              atkStats.shotsOnTarget += 1;
              atkStats.goals += 1;
              ratings[headerTarget.id] = Math.min(10, (ratings[headerTarget.id] || 6.7) + 1.0);
              if (cornerTaker.id !== headerTarget.id) {
                ratings[cornerTaker.id] = Math.min(10, (ratings[cornerTaker.id] || 6.7) + 0.6);
              }
              events.push({
                id: `${fixture.id}_ev_${minute}_goal_${atkStats.goals}_${atkClub.id}`,
                fixtureId: fixture.id,
                minute,
                eventType: 'Goal',
                teamId: atkClub.id,
                playerId: headerTarget.id,
                playerName: `${headerTarget.firstName} ${headerTarget.lastName}`,
                secondaryPlayerId: cornerTaker.id !== headerTarget.id ? cornerTaker.id : undefined,
                secondaryPlayerName:
                  cornerTaker.id !== headerTarget.id ? `${cornerTaker.firstName} ${cornerTaker.lastName}` : undefined,
                xGDelta: hdrXg,
                shotXg: hdrXg,
                shotX: hdrX,
                shotY: hdrY,
                text: trText(
                  `GOAL! Min ${minute}': ${headerTarget.firstName} ${headerTarget.lastName} towers above the defense ${routineLabelEn} to power home ${cornerTaker.lastName}'s corner!`,
                  `GOAL! นาที ${minute}': ${headerTarget.firstName} ${headerTarget.lastName} เทกตัวโหม่งลูกเตะมุม (${routineLabelTh}) ของ ${cornerTaker.lastName} ตุงตาข่าย!`
                ),
                pitchX: isHomeAttacking ? 94 : 6,
                pitchY: 50,
                isHighlight: true,
              });
            } else {
              defStats.clearances += 1;
              events.push({
                id: `${fixture.id}_ev_${minute}_cor`,
                fixtureId: fixture.id,
                minute,
                eventType: 'Corner',
                teamId: atkClub.id,
                playerId: cornerTaker.id,
                playerName: `${cornerTaker.firstName} ${cornerTaker.lastName}`,
                xGDelta: hdrXg,
                shotXg: hdrXg,
                shotX: hdrX,
                shotY: hdrY,
                text: trText(
                  `Min ${minute}': ${cornerTaker.lastName} (${atkClub.shortName}) delivers the corner ${routineLabelEn}, headed clear by the defense.`,
                  `นาที ${minute}': ${cornerTaker.lastName} (${atkClub.shortName}) เปิดลูกเตะมุม (${routineLabelTh}) เข้ากรอบเขตโทษ แต่แนวรับโหม่งสกัดออกมาได้`
                ),
                pitchX: isHomeAttacking ? 98 : 2,
                pitchY: 8,
              });
            }
          } else {
            defStats.clearances += 1;
          }
        }
        continue;
      }

      // 3. Shot / Chance creation ~ 52% of active events
      atkStats.totalShots += 1;
      const atkShoutBoost = isHomeAttacking ? homeShoutMod.atkMult : awayShoutMod.atkMult;
      const defShoutBoost = isHomeAttacking ? awayShoutMod.defMult : homeShoutMod.defMult;
      const attackAdv = (atkStr.attack * atkShoutBoost - defStr.defense * defShoutBoost) / 100;
      const baseXg = Number(
        Math.max(0.03, Math.min(0.48, rng.float(0.04, 0.22) + attackAdv * 0.12)).toFixed(2)
      );
      const killerBallBonus = creator.traits?.includes('Tries Killer Balls Often') ? 0.06 : 0;
      const isBigChance = baseXg >= 0.22 || rng.chance(0.14 + killerBallBonus);
      const shotXg = Number((isBigChance ? Math.min(0.65, baseXg + 0.16) : baseXg).toFixed(2));

      atkStats.xG = Number((atkStats.xG + shotXg).toFixed(2));
      if (isBigChance) {
        atkStats.bigChances += 1;
      }

      const shotOutcomeRoll = rng.next();
      const finishSkill = attacker.attributes.technical.finishing / 20;
      const gkSkill = gk.attributes.mental.positioning / 20;
      const traitFinishBonus =
        attacker.traits?.includes('Places Shots') || attacker.traits?.includes('Curls Ball') ? 0.03 : 0;
      const goalThreshold = Math.max(
        0.06,
        Math.min(
          0.41,
          shotXg * (0.85 + finishSkill * 0.4 - gkSkill * 0.25) + traitFinishBonus + weatherReboundGoalBonus
        )
      );

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
          shotXg,
          shotX: attackZoneX,
          shotY: attackZoneY,
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
          shotXg,
          shotX: attackZoneX,
          shotY: attackZoneY,
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
          shotXg,
          shotX: attackZoneX,
          shotY: attackZoneY,
          text: trText(
            `Min ${minute}': ${attacker.lastName} (${atkClub.shortName}) pulls the trigger, but ${defender.lastName} makes a vital block.`,
            `นาที ${minute}': ${attacker.lastName} (${atkClub.shortName}) ได้ง้างเท้ายิงแต่ติดบล็อกของ ${defender.lastName}`
          ),
          pitchX: attackZoneX,
          pitchY: attackZoneY,
        });
      } else {
        // Shot off target
        ratings[attacker.id] = Math.max(4.5, (ratings[attacker.id] || 6.7) - 0.05);
        events.push({
          id: `${fixture.id}_ev_${minute}_miss`,
          fixtureId: fixture.id,
          minute,
          eventType: 'Shot',
          teamId: atkClub.id,
          playerId: attacker.id,
          playerName: `${attacker.firstName} ${attacker.lastName}`,
          xGDelta: shotXg,
          shotXg,
          shotX: attackZoneX,
          shotY: attackZoneY,
          text: trText(
            `Min ${minute}': ${isBigChance ? 'Big chance for ' : ''}${atkClub.shortName}! ${attacker.lastName} fires just wide of the post.`,
            `นาที ${minute}': ${isBigChance ? 'โอกาสทองของ ' : ''}${atkClub.shortName}! ${attacker.lastName} สับไกยิงเฉียดเสาออกไปนิดเดียว`
          ),
          pitchX: attackZoneX,
          pitchY: attackZoneY,
          isHighlight: isBigChance,
        });
      }
    }
  };

  // Regular 90 minutes
  simulateMinuteBlock(1, 90);

  // Check if knockout match requires Extra Time (91..120) and Penalty Shootout
  const isKnockout =
    options?.isKnockout ??
    (fixture.competitionId.endsWith('_CUP') ||
      Boolean(fixture.uefaStage && fixture.uefaStage !== 'LEAGUE_PHASE' && fixture.leg === undefined));

  let extraTimePlayed = false;
  let penaltyShootout: { homePenalties: number; awayPenalties: number } | undefined;

  if (isKnockout && homeStats.goals === awayStats.goals) {
    extraTimePlayed = true;
    homeStrength.attack *= 0.94;
    awayStrength.attack *= 0.94;
    simulateMinuteBlock(91, 120);

    if (homeStats.goals === awayStats.goals) {
      let hPen = 0;
      let aPen = 0;
      for (let round = 1; round <= 5; round++) {
        if (rng.chance(0.76)) hPen += 1;
        if (rng.chance(0.76)) aPen += 1;
      }
      while (hPen === aPen) {
        const hScored = rng.chance(0.74);
        const aScored = rng.chance(0.74);
        if (hScored !== aScored) {
          if (hScored) hPen += 1;
          else aPen += 1;
        } else if (hScored) {
          hPen += 1;
          aPen += 1;
        }
      }
      penaltyShootout = { homePenalties: hPen, awayPenalties: aPen };
      const winnerClub = hPen > aPen ? homeClub : awayClub;
      events.push({
        id: `${fixture.id}_ev_120_pso`,
        fixtureId: fixture.id,
        minute: 120,
        eventType: 'Penalty',
        teamId: winnerClub.id,
        text: trText(
          `PENALTY SHOOTOUT: ${winnerClub.name} win ${hPen}–${aPen} on penalties after a thrilling knockout tie!`,
          `ดวลจุดโทษตัดสิน: ${winnerClub.name} ชนะจุดโทษ ${hPen}–${aPen} ผ่านเข้าสู่รอบต่อไป!`
        ),
        pitchX: 50,
        pitchY: 50,
        isHighlight: true,
      });
    }
  }

  const finalMinute = extraTimePlayed ? 120 : 90;
  events.push({
    id: `${fixture.id}_ev_ft`,
    fixtureId: fixture.id,
    minute: finalMinute,
    eventType: 'FullTime',
    teamId: homeClub.id,
    text: trText(
      `Full-Time (${finalMinute}'): ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}${
        penaltyShootout ? ` (Pens: ${penaltyShootout.homePenalties}-${penaltyShootout.awayPenalties})` : ''
      }`,
      `จบการแข่งขัน (${finalMinute}'): ${homeClub.name} ${homeStats.goals} - ${awayStats.goals} ${awayClub.name}${
        penaltyShootout ? ` (จุดโทษ: ${penaltyShootout.homePenalties}-${penaltyShootout.awayPenalties})` : ''
      }`
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
    substitutions: recordedSubstitutions.length > 0 ? recordedSubstitutions : undefined,
    extraTimePlayed: extraTimePlayed || undefined,
    penaltyShootout,
    weather,
    pitchCondition,
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

  const finalMinute = baseResult.extraTimePlayed ? 120 : 90;
  const pso = baseResult.penaltyShootout;
  reconciledEvents.push({
    id: `${fixture.id}_ev_ft`,
    fixtureId: fixture.id,
    minute: finalMinute,
    eventType: 'FullTime',
    teamId: homeClub.id,
    text: trText(
      `Full-Time (${finalMinute}'): ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}${
        pso ? ` (Pens: ${pso.homePenalties}-${pso.awayPenalties})` : ''
      }`,
      `จบการแข่งขัน (${finalMinute}'): ${homeClub.name} ${runningHome} - ${runningAway} ${awayClub.name}${
        pso ? ` (จุดโทษ: ${pso.homePenalties}-${pso.awayPenalties})` : ''
      }`
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
