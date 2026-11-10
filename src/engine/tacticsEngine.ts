import {
  FormationId,
  Player,
  PlayerRole,
  PositionCode,
  TacticalSlot,
  TacticalSystem,
  TeamInstructions,
} from '../types/game';

export interface FormationBlueprint {
  id: FormationId;
  name: string;
  description: string;
  slots: {
    position: PositionCode;
    defaultRole: PlayerRole;
    x: number;
    y: number;
  }[];
}

export const FORMATION_BLUEPRINTS: Record<FormationId, FormationBlueprint> = {
  '4-3-3': {
    id: '4-3-3',
    name: '4-3-3 DM Wide',
    description: 'สมดุลทั้งรุกและรับ ใช้มิดฟิลด์ตัวรับคุมหน้าแผงหลังและปีกสองข้างโจมตีพื้นที่ว่าง',
    slots: [
      { position: 'GK', defaultRole: 'Sweeper Keeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Wing Back', x: 15, y: 72 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 38, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 62, y: 75 },
      { position: 'DR', defaultRole: 'Full Back', x: 85, y: 72 },
      { position: 'DM', defaultRole: 'Anchor', x: 50, y: 58 },
      { position: 'MC', defaultRole: 'Box-to-Box Midfielder', x: 34, y: 44 },
      { position: 'MC', defaultRole: 'Advanced Playmaker', x: 66, y: 44 },
      { position: 'AML', defaultRole: 'Inside Forward', x: 18, y: 24 },
      { position: 'AMR', defaultRole: 'Winger', x: 82, y: 24 },
      { position: 'ST', defaultRole: 'Advanced Forward', x: 50, y: 15 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    name: '4-2-3-1 Gegenpress',
    description: 'เน้นเพลเมกเกอร์หมายเลข 10 ปั้นเกมรุก โดยมีคู่มิดฟิลด์ตัวกลางคอยคุมจังหวะ',
    slots: [
      { position: 'GK', defaultRole: 'Sweeper Keeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Full Back', x: 15, y: 72 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 38, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 62, y: 75 },
      { position: 'DR', defaultRole: 'Wing Back', x: 85, y: 72 },
      { position: 'DM', defaultRole: 'Deep-Lying Playmaker', x: 36, y: 55 },
      { position: 'DM', defaultRole: 'Ball Winning Midfielder', x: 64, y: 55 },
      { position: 'AML', defaultRole: 'Inside Forward', x: 18, y: 30 },
      { position: 'AMC', defaultRole: 'Attacking Midfielder', x: 50, y: 32 },
      { position: 'AMR', defaultRole: 'Inverted Winger', x: 82, y: 30 },
      { position: 'ST', defaultRole: 'Pressing Forward', x: 50, y: 15 },
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    name: '4-4-2 Classic',
    description: 'โครงสร้างสองแถวสี่คนสุดคลาสสิก พร้อมกองหน้าคู่ที่ช่วยกันกดดันแนวรับคู่แข่ง',
    slots: [
      { position: 'GK', defaultRole: 'Goalkeeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Full Back', x: 15, y: 74 },
      { position: 'DC', defaultRole: 'Central Defender', x: 38, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 62, y: 75 },
      { position: 'DR', defaultRole: 'Full Back', x: 85, y: 74 },
      { position: 'ML', defaultRole: 'Winger', x: 15, y: 46 },
      { position: 'MC', defaultRole: 'Box-to-Box Midfielder', x: 38, y: 48 },
      { position: 'MC', defaultRole: 'Central Midfielder', x: 62, y: 48 },
      { position: 'MR', defaultRole: 'Winger', x: 85, y: 46 },
      { position: 'ST', defaultRole: 'Deep-Lying Forward', x: 38, y: 18 },
      { position: 'ST', defaultRole: 'Advanced Forward', x: 62, y: 16 },
    ],
  },
  '4-1-4-1': {
    id: '4-1-4-1',
    name: '4-1-4-1 Defensive Block',
    description: 'แพ็กเกมรับแน่นหนาด้วยมิดฟิลด์ 5 คน ปิดช่องว่างตรงกลางสนามอย่างมีวินัย',
    slots: [
      { position: 'GK', defaultRole: 'Goalkeeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Full Back', x: 15, y: 74 },
      { position: 'DC', defaultRole: 'Central Defender', x: 38, y: 76 },
      { position: 'DC', defaultRole: 'Central Defender', x: 62, y: 76 },
      { position: 'DR', defaultRole: 'Full Back', x: 85, y: 74 },
      { position: 'DM', defaultRole: 'Anchor', x: 50, y: 60 },
      { position: 'ML', defaultRole: 'Winger', x: 15, y: 42 },
      { position: 'MC', defaultRole: 'Central Midfielder', x: 38, y: 44 },
      { position: 'MC', defaultRole: 'Mezzala', x: 62, y: 44 },
      { position: 'MR', defaultRole: 'Winger', x: 85, y: 42 },
      { position: 'ST', defaultRole: 'Target Forward', x: 50, y: 16 },
    ],
  },
  '4-3-1-2': {
    id: '4-3-1-2',
    name: '4-3-1-2 Narrow Diamond',
    description: 'ครองพื้นที่กลางสนามเบ็ดเสร็จ เจาะตามช่องด้วยเพลเมกเกอร์หลังกองหน้าคู่',
    slots: [
      { position: 'GK', defaultRole: 'Sweeper Keeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Complete Wing Back', x: 14, y: 68 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 38, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 62, y: 75 },
      { position: 'DR', defaultRole: 'Complete Wing Back', x: 86, y: 68 },
      { position: 'DM', defaultRole: 'Deep-Lying Playmaker', x: 50, y: 58 },
      { position: 'MC', defaultRole: 'Carrilero', x: 30, y: 46 },
      { position: 'MC', defaultRole: 'Mezzala', x: 70, y: 46 },
      { position: 'AMC', defaultRole: 'Shadow Striker', x: 50, y: 31 },
      { position: 'ST', defaultRole: 'Deep-Lying Forward', x: 38, y: 16 },
      { position: 'ST', defaultRole: 'Advanced Forward', x: 62, y: 16 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    name: '3-5-2 Wing-Back Overload',
    description: 'เซ็นเตอร์แบ็ก 3 คนให้ความมั่นคง พร้อมวิงแบ็กสองฝั่งเติมเกมสุดเส้นหลัง',
    slots: [
      { position: 'GK', defaultRole: 'Sweeper Keeper', x: 50, y: 86 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 28, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 50, y: 77 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 72, y: 75 },
      { position: 'WBL', defaultRole: 'Wing Back', x: 12, y: 52 },
      { position: 'WBR', defaultRole: 'Wing Back', x: 88, y: 52 },
      { position: 'DM', defaultRole: 'Deep-Lying Playmaker', x: 50, y: 58 },
      { position: 'MC', defaultRole: 'Box-to-Box Midfielder', x: 36, y: 42 },
      { position: 'MC', defaultRole: 'Advanced Playmaker', x: 64, y: 42 },
      { position: 'ST', defaultRole: 'Target Forward', x: 38, y: 16 },
      { position: 'ST', defaultRole: 'Advanced Forward', x: 62, y: 16 },
    ],
  },
  '3-4-3': {
    id: '3-4-3',
    name: '3-4-3 High Press',
    description: 'บีบพื้นที่แดนบนด้วยสามประสานแนวรุกและวิงแบ็กที่ดันสูงตลอดเกม',
    slots: [
      { position: 'GK', defaultRole: 'Sweeper Keeper', x: 50, y: 86 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 28, y: 75 },
      { position: 'DC', defaultRole: 'Central Defender', x: 50, y: 77 },
      { position: 'DC', defaultRole: 'Ball Playing Defender', x: 72, y: 75 },
      { position: 'WBL', defaultRole: 'Complete Wing Back', x: 12, y: 50 },
      { position: 'MC', defaultRole: 'Central Midfielder', x: 38, y: 50 },
      { position: 'MC', defaultRole: 'Box-to-Box Midfielder', x: 62, y: 50 },
      { position: 'WBR', defaultRole: 'Complete Wing Back', x: 88, y: 50 },
      { position: 'AML', defaultRole: 'Inside Forward', x: 24, y: 24 },
      { position: 'AMR', defaultRole: 'Inside Forward', x: 76, y: 24 },
      { position: 'ST', defaultRole: 'Complete Forward', x: 50, y: 15 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    name: '5-3-2 Direct Counter',
    description: 'แนวรับ 5 คนเน้นความรัดกุมและสวนกลับเร็วด้วยบอลยาวไปหาคู่กองหน้า',
    slots: [
      { position: 'GK', defaultRole: 'Goalkeeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Wing Back', x: 12, y: 70 },
      { position: 'DC', defaultRole: 'No-Nonsense Centre Back', x: 30, y: 76 },
      { position: 'DC', defaultRole: 'Central Defender', x: 50, y: 78 },
      { position: 'DC', defaultRole: 'No-Nonsense Centre Back', x: 70, y: 76 },
      { position: 'DR', defaultRole: 'Wing Back', x: 88, y: 70 },
      { position: 'MC', defaultRole: 'Ball Winning Midfielder', x: 32, y: 50 },
      { position: 'MC', defaultRole: 'Deep-Lying Playmaker', x: 50, y: 54 },
      { position: 'MC', defaultRole: 'Box-to-Box Midfielder', x: 68, y: 50 },
      { position: 'ST', defaultRole: 'Target Forward', x: 38, y: 18 },
      { position: 'ST', defaultRole: 'Advanced Forward', x: 62, y: 16 },
    ],
  },
  '5-4-1': {
    id: '5-4-1',
    name: '5-4-1 Low Block',
    description: 'เน้นตั้งรับเหนียวแน่นในแดนตัวเอง ปิดพื้นที่ริมเส้นและหน้ากรอบเขตโทษ',
    slots: [
      { position: 'GK', defaultRole: 'Goalkeeper', x: 50, y: 86 },
      { position: 'DL', defaultRole: 'Full Back', x: 12, y: 72 },
      { position: 'DC', defaultRole: 'No-Nonsense Centre Back', x: 30, y: 77 },
      { position: 'DC', defaultRole: 'Central Defender', x: 50, y: 79 },
      { position: 'DC', defaultRole: 'No-Nonsense Centre Back', x: 70, y: 77 },
      { position: 'DR', defaultRole: 'Full Back', x: 88, y: 72 },
      { position: 'ML', defaultRole: 'Winger', x: 15, y: 48 },
      { position: 'MC', defaultRole: 'Ball Winning Midfielder', x: 38, y: 52 },
      { position: 'MC', defaultRole: 'Central Midfielder', x: 62, y: 52 },
      { position: 'MR', defaultRole: 'Winger', x: 85, y: 48 },
      { position: 'ST', defaultRole: 'Pressing Forward', x: 50, y: 18 },
    ],
  },
};

export const ROLES_BY_POSITION: Record<PositionCode, PlayerRole[]> = {
  GK: ['Goalkeeper', 'Sweeper Keeper'],
  DL: ['Full Back', 'Wing Back', 'Complete Wing Back', 'Inverted Wing Back'],
  DR: ['Full Back', 'Wing Back', 'Complete Wing Back', 'Inverted Wing Back'],
  WBL: ['Wing Back', 'Complete Wing Back', 'Inverted Wing Back'],
  WBR: ['Wing Back', 'Complete Wing Back', 'Inverted Wing Back'],
  DC: ['Central Defender', 'Ball Playing Defender', 'No-Nonsense Centre Back'],
  DM: ['Defensive Midfielder', 'Anchor', 'Half Back', 'Deep-Lying Playmaker', 'Ball Winning Midfielder'],
  MC: ['Central Midfielder', 'Box-to-Box Midfielder', 'Ball Winning Midfielder', 'Advanced Playmaker', 'Mezzala', 'Carrilero'],
  ML: ['Winger', 'Inverted Winger', 'Wide Playmaker'],
  MR: ['Winger', 'Inverted Winger', 'Wide Playmaker'],
  AMC: ['Attacking Midfielder', 'Advanced Playmaker', 'Trequartista', 'Shadow Striker'],
  AML: ['Inside Forward', 'Inverted Winger', 'Winger', 'Wide Playmaker'],
  AMR: ['Inside Forward', 'Inverted Winger', 'Winger', 'Wide Playmaker'],
  ST: ['Advanced Forward', 'Deep-Lying Forward', 'Pressing Forward', 'Target Forward', 'Complete Forward'],
};

export function createDefaultTeamInstructions(): TeamInstructions {
  return {
    mentality: 'Balanced',
    passingDirectness: 'Mixed',
    tempo: 'Standard',
    attackingWidth: 'Standard',
    buildUp: 'Play Out of Defence',
    pressingIntensity: 'High',
    defensiveLine: 'Standard',
    lineOfEngagement: 'Mid',
    transition: 'Counter-Press',
    defensiveApproach: 'Zonal Marking',
    timeWasting: 'Never',
    offsideTrap: false,
    tackling: 'Standard',
  };
}

/**
 * Calculates how well a player fits a tactical slot position (0.50 to 1.05)
 */
export function calculatePositionFit(player: Player, slotPosition: PositionCode): number {
  if (player.positions[0] === slotPosition) return 1.0;
  if (player.positions.includes(slotPosition)) return 0.92;

  // Adjacent position group compatibility
  const compatibilityMap: Record<PositionCode, PositionCode[]> = {
    GK: [],
    DL: ['WBL', 'DC', 'ML'],
    DR: ['WBR', 'DC', 'MR'],
    WBL: ['DL', 'ML', 'AML'],
    WBR: ['DR', 'MR', 'AMR'],
    DC: ['DM', 'DL', 'DR'],
    DM: ['MC', 'DC'],
    MC: ['DM', 'AMC', 'ML', 'MR'],
    ML: ['AML', 'WBL', 'DL', 'MC'],
    MR: ['AMR', 'WBR', 'DR', 'MC'],
    AMC: ['MC', 'AML', 'AMR', 'ST'],
    AML: ['ML', 'AMC', 'ST', 'AMR'],
    AMR: ['MR', 'AMC', 'ST', 'AML'],
    ST: ['AMC', 'AML', 'AMR'],
  };

  const compatible = compatibilityMap[slotPosition] || [];
  if (player.positions.some((p) => compatible.includes(p))) {
    return 0.78;
  }
  if (slotPosition === 'GK' || player.positions.includes('GK')) {
    return 0.35;
  }
  return 0.55;
}

/**
 * Evaluates a player's suitability (1-20 scale) for a specific Role
 */
export function evaluateRoleSuitability(player: Player, role: PlayerRole): number {
  const { technical: t, mental: m, physical: p } = player.attributes;
  switch (role) {
    case 'Sweeper Keeper':
    case 'Goalkeeper':
      return Math.round((m.positioning + m.concentration + m.decisions + p.agility + t.firstTouch) / 5);
    case 'Ball Playing Defender':
      return Math.round((t.passing + t.tackling + t.marking + m.composure + m.decisions) / 5);
    case 'Central Defender':
    case 'No-Nonsense Centre Back':
      return Math.round((t.tackling + t.marking + t.heading + p.strength + m.positioning) / 5);
    case 'Wing Back':
    case 'Complete Wing Back':
      return Math.round((p.pace + p.stamina + t.crossing + t.dribbling + m.workRate) / 5);
    case 'Full Back':
    case 'Inverted Wing Back':
      return Math.round((t.tackling + t.marking + m.positioning + p.stamina + t.passing) / 5);
    case 'Anchor':
    case 'Defensive Midfielder':
    case 'Half Back':
      return Math.round((t.tackling + m.positioning + m.anticipation + m.decisions + p.strength) / 5);
    case 'Deep-Lying Playmaker':
    case 'Advanced Playmaker':
    case 'Wide Playmaker':
      return Math.round((t.passing + m.vision + t.technique + m.decisions + t.firstTouch) / 5);
    case 'Box-to-Box Midfielder':
    case 'Carrilero':
      return Math.round((p.stamina + m.workRate + t.passing + t.tackling + m.offTheBall) / 5);
    case 'Ball Winning Midfielder':
      return Math.round((t.tackling + m.aggression + m.workRate + p.stamina + m.bravery) / 5);
    case 'Mezzala':
    case 'Attacking Midfielder':
    case 'Trequartista':
      return Math.round((t.dribbling + t.passing + m.vision + m.flair + t.longShots) / 5);
    case 'Shadow Striker':
      return Math.round((t.finishing + m.offTheBall + p.acceleration + m.anticipation + m.composure) / 5);
    case 'Inside Forward':
    case 'Inverted Winger':
      return Math.round((t.dribbling + t.finishing + p.acceleration + p.agility + m.flair) / 5);
    case 'Winger':
      return Math.round((p.pace + p.acceleration + t.crossing + t.dribbling + t.technique) / 5);
    case 'Target Forward':
      return Math.round((t.heading + p.jumpingReach + p.strength + t.finishing + m.bravery) / 5);
    case 'Pressing Forward':
      return Math.round((m.workRate + p.stamina + m.aggression + t.finishing + p.pace) / 5);
    case 'Advanced Forward':
    case 'Complete Forward':
    case 'Deep-Lying Forward':
    default:
      return Math.round((t.finishing + m.composure + m.offTheBall + p.acceleration + t.firstTouch) / 5);
  }
}

/**
 * Automatically selects the best 11 starters and 9 bench players for a club
 */
export function autoPickLineup(
  formation: FormationId,
  clubPlayers: Player[],
  existingInstructions?: TeamInstructions,
  tacticId = 'tactic-primary',
  tacticName = 'Primary System'
): TacticalSystem {
  const blueprint = FORMATION_BLUEPRINTS[formation];
  const available = clubPlayers.filter((p) => !p.injuryStatus.isInjured);
  const usedIds = new Set<string>();

  const lineup: TacticalSlot[] = blueprint.slots.map((slot, idx) => {
    let bestPlayer: Player | null = null;
    let bestScore = -1;

    for (const p of available) {
      if (usedIds.has(p.id)) continue;
      const posFit = calculatePositionFit(p, slot.position);
      const fitnessFactor = 0.65 + (p.fitness / 100) * 0.35;
      const score = p.currentAbility * posFit * fitnessFactor;
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = p;
      }
    }

    if (bestPlayer) {
      usedIds.add(bestPlayer.id);
    }

    return {
      slotIndex: idx,
      position: slot.position,
      role: slot.defaultRole,
      x: slot.x,
      y: slot.y,
      playerId: bestPlayer ? bestPlayer.id : null,
      instructions: [],
    };
  });

  const remaining = available
    .filter((p) => !usedIds.has(p.id))
    .sort((a, b) => b.currentAbility - a.currentAbility);

  const benchPlayerIds = remaining.slice(0, 9).map((p) => p.id);

  return {
    id: tacticId,
    name: tacticName,
    formation,
    instructions: existingInstructions || createDefaultTeamInstructions(),
    lineup,
    benchPlayerIds,
    familiarity: 78,
  };
}

/**
 * Analyzes tactical risks and warnings based on formation, instructions, and assigned players
 */
export function analyzeTacticalRisks(
  tactic: TacticalSystem,
  playersById: Record<string, Player>
): { level: 'warning' | 'info' | 'optimal'; message: string }[] {
  const alerts: { level: 'warning' | 'info' | 'optimal'; message: string }[] = [];
  const { instructions, lineup } = tactic;

  // Check out-of-position players
  for (const slot of lineup) {
    if (!slot.playerId) {
      alerts.push({
        level: 'warning',
        message: `ตำแหน่ง ${slot.position} ยังไม่มีผู้เล่นตัวจริงลงสนาม`,
      });
      continue;
    }
    const p = playersById[slot.playerId];
    if (!p) continue;
    const fit = calculatePositionFit(p, slot.position);
    if (fit < 0.75) {
      alerts.push({
        level: 'warning',
        message: `${p.firstName} ${p.lastName} เล่นในตำแหน่ง ${slot.position} ที่ไม่ถนัด (${Math.round(fit * 100)}% ประสิทธิภาพ)`,
      });
    }
  }

  // Check High Defensive Line with slow center backs
  if (instructions.defensiveLine === 'High' || instructions.defensiveLine === 'Very High') {
    const cbs = lineup
      .filter((s) => s.position === 'DC' && s.playerId)
      .map((s) => playersById[s.playerId!])
      .filter(Boolean);
    const avgPace =
      cbs.length > 0
        ? cbs.reduce((acc, p) => acc + (p.attributes.physical.pace + p.attributes.physical.acceleration) / 2, 0) / cbs.length
        : 12;
    if (avgPace < 11.5) {
      alerts.push({
        level: 'warning',
        message: `ตั้งแนวรับสูง (${instructions.defensiveLine}) แต่กองหลังตัวกลางมีความเร็วเฉลี่ยต่ำ (${avgPace.toFixed(1)}/20) เสี่ยงต่อการถูกวางบอลยาวตัดหลัง`,
      });
    }
  }

  // Check Very High Pressing + High Tempo stamina drain risk
  if (
    (instructions.pressingIntensity === 'Very High' || instructions.pressingIntensity === 'High') &&
    (instructions.tempo === 'Higher' || instructions.tempo === 'Much Higher')
  ) {
    alerts.push({
      level: 'info',
      message: `การบีบพื้นที่สูงร่วมกับจังหวะเกมเร็วจะสร้างโอกาสยิงมากขึ้น แต่จะผลาญความฟิต (Fitness) ของผู้เล่นเร็วขึ้นในช่วงท้ายครึ่งหลัง`,
    });
  }

  // Check Play Out of Defence with low passing defenders
  if (instructions.buildUp === 'Play Out of Defence') {
    const defs = lineup
      .filter((s) => (s.position === 'DC' || s.position === 'GK') && s.playerId)
      .map((s) => playersById[s.playerId!])
      .filter(Boolean);
    const avgPass =
      defs.length > 0
        ? defs.reduce((acc, p) => acc + (p.attributes.technical.passing + p.attributes.mental.composure) / 2, 0) / defs.length
        : 12;
    if (avgPass < 11) {
      alerts.push({
        level: 'warning',
        message: `สั่งเซ็ตบอลจากแนวรับ แต่ผู้รักษาประตูและกองหลังมีค่า Passing/Composure เฉลี่ยเพียง ${avgPass.toFixed(1)}/20 เสี่ยงเสียบอลหน้ากรอบเขตโทษ`,
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      level: 'optimal',
      message: 'โครงสร้างแท็กติกและบทบาทผู้เล่นมีความสมดุลดีเยี่ยม พร้อมสำหรับการแข่งขัน',
    });
  }

  return alerts;
}
