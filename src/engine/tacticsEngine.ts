import {
  FormationId,
  Player,
  PlayerRole,
  PositionCode,
  TacticalSlot,
  TacticalSystem,
  TeamInstructions,
} from '../types/game';
import { trText } from '../i18n/LanguageContext';

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
    description: 'Balanced in attack and defense, using a holding midfielder to shield the back four while wide wingers exploit space.',
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
    description: 'Built around a #10 playmaker orchestrating attacks ahead of a controlling double pivot.',
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
    description: 'Classic two banks of four with a strike partnership pressing opposing centre-backs.',
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
    description: 'Compact five-man midfield block that shuts down central spaces with discipline.',
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
    description: 'Dominates central midfield and threads through-balls via an attacking playmaker behind two strikers.',
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
    description: 'Three centre-backs provide defensive security while wing-backs bomb forward on both flanks.',
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
    description: 'Aggressive high-pressing front three supported by advanced wing-backs.',
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
    description: 'Solid five-man backline focused on rapid direct counter-attacks into two strikers.',
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
    description: 'Deep, disciplined defensive block that seals wide channels and the penalty area.',
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
  ST: ['Advanced Forward', 'False 9', 'Deep-Lying Forward', 'Pressing Forward', 'Target Forward', 'Complete Forward'],
};

export interface RoleKeyAttrSpec {
  key: string;
  labelEn: string;
  labelTh: string;
  getValue: (p: Player) => number;
}

export interface RoleProfileInfo {
  role: PlayerRole;
  descriptionEn: string;
  descriptionTh: string;
  pitchVector: { dx: number; dy: number }; // visual movement vector on tactical pitch
  keyAttrs: RoleKeyAttrSpec[];
}

export function getRoleProfileInfo(role: PlayerRole): RoleProfileInfo {
  switch (role) {
    case 'Inverted Wing Back':
      return {
        role,
        descriptionEn:
          'Drifts inside into central midfield during possession to overload the pivot and dictate build-up rather than overlapping wide. Demands high Passing and Vision.',
        descriptionTh:
          'แทนที่จะวิ่งเติมเกมริมเส้นตามปกติ จะหุบเข้ามาตรงกลางสนามเพื่อช่วยกองกลางต่อบอลและสร้างความได้เปรียบเชิงตัวเลข (ต้องใช้ค่า Passing และ Vision สูง)',
        pitchVector: { dx: 14, dy: -10 },
        keyAttrs: [
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'vision', labelEn: 'Vision', labelTh: 'วิสัยทัศน์', getValue: (p) => p.attributes.mental.vision },
          { key: 'decisions', labelEn: 'Decisions', labelTh: 'การตัดสินใจ', getValue: (p) => p.attributes.mental.decisions },
          { key: 'positioning', labelEn: 'Positioning', labelTh: 'การยืนตำแหน่ง', getValue: (p) => p.attributes.mental.positioning },
        ],
      };
    case 'False 9':
      return {
        role,
        descriptionEn:
          'Drops deep into midfield pockets instead of staying on the last line, dragging opposing centre-backs out of position and opening space for wingers to surge in behind.',
        descriptionTh:
          'กองหน้าที่ไม่ยืนค้ำแดนหน้า แต่จะล้วงบอลต่ำลงมาเชื่อมเกมเพื่อดึงกองหลังคู่แข่งให้หลุดตำแหน่ง เปิดพื้นที่ให้ปีกสอดขึ้นไปยิงประตู',
        pitchVector: { dx: 0, dy: 12 },
        keyAttrs: [
          { key: 'vision', labelEn: 'Vision', labelTh: 'วิสัยทัศน์', getValue: (p) => p.attributes.mental.vision },
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'firstTouch', labelEn: 'First Touch', labelTh: 'สัมผัสบอลแรก', getValue: (p) => p.attributes.technical.firstTouch },
          { key: 'dribbling', labelEn: 'Dribbling', labelTh: 'การเลี้ยงบอล', getValue: (p) => p.attributes.technical.dribbling },
        ],
      };
    case 'Box-to-Box Midfielder':
      return {
        role,
        descriptionEn:
          'Non-stop dynamo who surges late into the opposition penalty box in attack and tracks all the way back to protect his own box for 90 minutes. Requires elite Stamina and Work Rate.',
        descriptionTh:
          'กองกลางไดนาโมที่วิ่งขึ้นสุดลงสุดตลอด 90 นาที ทั้งช่วยตัดเกมหน้ากรอบเขตโทษตัวเองและสอดขึ้นไปจบสกอร์ (บังคับว่าต้องมีค่า Stamina และ Work Rate สูงมาก)',
        pitchVector: { dx: 0, dy: -12 },
        keyAttrs: [
          { key: 'stamina', labelEn: 'Stamina', labelTh: 'ความอึด', getValue: (p) => p.attributes.physical.stamina },
          { key: 'workRate', labelEn: 'Work Rate', labelTh: 'ความขยัน', getValue: (p) => p.attributes.mental.workRate },
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'tackling', labelEn: 'Tackling', labelTh: 'การเข้าปะทะ', getValue: (p) => p.attributes.technical.tackling },
        ],
      };
    case 'Sweeper Keeper':
      return {
        role,
        descriptionEn:
          'Steps high off his line to sweep up through-balls behind a High Defensive Line and acts as an extra outfield passer in build-up.',
        descriptionTh:
          'ผู้รักษาประตูสมัยใหม่ที่ออกมาตัดบอลนอกกรอบเขตโทษเมื่อทีมดันแนวรับสูง และช่วยเซ็ตบอลสั้นจากแดนหลัง',
        pitchVector: { dx: 0, dy: -7 },
        keyAttrs: [
          { key: 'positioning', labelEn: 'Positioning', labelTh: 'การยืนตำแหน่ง', getValue: (p) => p.attributes.mental.positioning },
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'composure', labelEn: 'Composure', labelTh: 'ความเยือกเย็น', getValue: (p) => p.attributes.mental.composure },
          { key: 'agility', labelEn: 'Agility', labelTh: 'ความคล่องตัว', getValue: (p) => p.attributes.physical.agility },
        ],
      };
    case 'Ball Playing Defender':
      return {
        role,
        descriptionEn:
          'Centre-back comfortable stepping into midfield with the ball and breaking lines with progressive passes.',
        descriptionTh:
          'เซ็นเตอร์แบ็คที่ออกบอลแม่นยำ กล้าพาบอลขึ้นมาเซ็ตเกมและแทงบอลทะลุแนวรับคู่แข่ง',
        pitchVector: { dx: 0, dy: -6 },
        keyAttrs: [
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'composure', labelEn: 'Composure', labelTh: 'ความเยือกเย็น', getValue: (p) => p.attributes.mental.composure },
          { key: 'tackling', labelEn: 'Tackling', labelTh: 'การเข้าปะทะ', getValue: (p) => p.attributes.technical.tackling },
          { key: 'pace', labelEn: 'Pace', labelTh: 'ความเร็ว', getValue: (p) => p.attributes.physical.pace },
        ],
      };
    case 'Inside Forward':
    case 'Inverted Winger':
      return {
        role,
        descriptionEn:
          'Cuts diagonally inside from the flank onto his stronger foot to shoot or thread passes into the penalty box.',
        descriptionTh:
          'ตัวรุกริมเส้นที่เลี้ยงตัดเข้าในเพื่อหาจังหวะยิงประตูหรือแทงทะลุช่องเข้ากรอบเขตโทษ',
        pitchVector: { dx: 12, dy: -10 },
        keyAttrs: [
          { key: 'dribbling', labelEn: 'Dribbling', labelTh: 'การเลี้ยงบอล', getValue: (p) => p.attributes.technical.dribbling },
          { key: 'finishing', labelEn: 'Finishing', labelTh: 'การจบสกอร์', getValue: (p) => p.attributes.technical.finishing },
          { key: 'acceleration', labelEn: 'Acceleration', labelTh: 'อัตราเร่ง', getValue: (p) => p.attributes.physical.acceleration },
          { key: 'offTheBall', labelEn: 'Off The Ball', labelTh: 'การหาพื้นที่', getValue: (p) => p.attributes.mental.offTheBall },
        ],
      };
    case 'Pressing Forward':
      return {
        role,
        descriptionEn:
          'Leads the high press from the front line, harrying opposing centre-backs and forcing turnovers high up the pitch.',
        descriptionTh:
          'กองหน้าตัวไล่บีบพื้นที่ตั้งแต่แดนบน กดดันกองหลังคู่แข่งไม่ให้ตั้งเกมได้ง่าย',
        pitchVector: { dx: 0, dy: -8 },
        keyAttrs: [
          { key: 'workRate', labelEn: 'Work Rate', labelTh: 'ความขยัน', getValue: (p) => p.attributes.mental.workRate },
          { key: 'stamina', labelEn: 'Stamina', labelTh: 'ความอึด', getValue: (p) => p.attributes.physical.stamina },
          { key: 'aggression', labelEn: 'Aggression', labelTh: 'ความดุดัน', getValue: (p) => p.attributes.mental.aggression },
          { key: 'finishing', labelEn: 'Finishing', labelTh: 'การจบสกอร์', getValue: (p) => p.attributes.technical.finishing },
        ],
      };
    case 'Deep-Lying Playmaker':
    case 'Advanced Playmaker':
    case 'Wide Playmaker':
      return {
        role,
        descriptionEn:
          'Primary creative hub who dictates tempo, finds pockets of space, and unlocks defenses with vision and passing range.',
        descriptionTh:
          'จอมทัพตัวทำเกมที่คอยกำหนดจังหวะบอลและจ่ายคิลเลอร์พาสเจาะแนวรับคู่แข่ง',
        pitchVector: { dx: 0, dy: -5 },
        keyAttrs: [
          { key: 'passing', labelEn: 'Passing', labelTh: 'การจ่ายบอล', getValue: (p) => p.attributes.technical.passing },
          { key: 'vision', labelEn: 'Vision', labelTh: 'วิสัยทัศน์', getValue: (p) => p.attributes.mental.vision },
          { key: 'technique', labelEn: 'Technique', labelTh: 'เทคนิค', getValue: (p) => p.attributes.technical.technique },
          { key: 'decisions', labelEn: 'Decisions', labelTh: 'การตัดสินใจ', getValue: (p) => p.attributes.mental.decisions },
        ],
      };
    default:
      return {
        role,
        descriptionEn:
          'Executes balanced positional duties within the team tactical structure across both attacking and defensive phases.',
        descriptionTh:
          'ปฏิบัติหน้าที่ตามโครงสร้างตำแหน่งอย่างสมดุลทั้งในจังหวะรุกและจังหวะรับ',
        pitchVector: { dx: 0, dy: -6 },
        keyAttrs: [
          { key: 'decisions', labelEn: 'Decisions', labelTh: 'การตัดสินใจ', getValue: (p) => p.attributes.mental.decisions },
          { key: 'positioning', labelEn: 'Positioning', labelTh: 'การยืนตำแหน่ง', getValue: (p) => p.attributes.mental.positioning },
          { key: 'stamina', labelEn: 'Stamina', labelTh: 'ความอึด', getValue: (p) => p.attributes.physical.stamina },
          { key: 'workRate', labelEn: 'Work Rate', labelTh: 'ความขยัน', getValue: (p) => p.attributes.mental.workRate },
        ],
      };
  }
}

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
    whenPossessionLost: 'Counter-Press',
    whenPossessionWon: 'Counter',
    defensiveApproach: 'Zonal Marking',
    timeWasting: 'Never',
    offsideTrap: false,
    tackling: 'Standard',
  };
}

/**
 * Toggles an individual player instruction while automatically removing mutually exclusive directives
 */
export function togglePlayerInstructionWithExclusions(
  current: Player['individualTraining'] extends unknown ? import('../types/game').PlayerInstruction[] : never,
  inst: import('../types/game').PlayerInstruction
): import('../types/game').PlayerInstruction[] {
  const exclusivePairs: Record<string, string> = {
    'Dribble More': 'Dribble Less',
    'Dribble Less': 'Dribble More',
    'Shoot More': 'Shoot Less',
    'Shoot Less': 'Shoot More',
    'Hold Position': 'Roam From Position',
    'Roam From Position': 'Hold Position',
    'Stay Wider': 'Cut Inside',
    'Cut Inside': 'Stay Wider',
    'Tackle Harder': 'Ease Off Tackles',
    'Ease Off Tackles': 'Tackle Harder',
    'Trigger Press More': 'Trigger Press Less',
    'Trigger Press Less': 'Trigger Press More',
  };

  if (current.includes(inst)) {
    return current.filter((i) => i !== inst);
  }
  const opposite = exclusivePairs[inst];
  const filtered = opposite ? current.filter((i) => i !== opposite) : [...current];
  return [...filtered, inst];
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
    case 'Inverted Wing Back':
      return Math.round((t.passing * 1.4 + m.vision * 1.4 + m.decisions + m.positioning + t.tackling * 0.6) / 5.4);
    case 'Full Back':
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
      return Math.round((p.stamina * 1.5 + m.workRate * 1.5 + t.passing + t.tackling + m.offTheBall) / 6);
    case 'Carrilero':
      return Math.round((p.stamina + m.workRate + t.passing + t.tackling + m.positioning) / 5);
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
    case 'False 9':
      return Math.round((m.vision * 1.4 + t.passing * 1.4 + t.firstTouch + t.dribbling + m.decisions + m.offTheBall * 0.6) / 6.4);
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

export interface TacticalSynergyReport {
  overallScore: number; // 0..100
  pressingSynergy: {
    score: number;
    avgWorkRate: number;
    avgStamina: number;
    weakLinks: { playerId: string; name: string; position: PositionCode; workRate: number; stamina: number }[];
  };
  defensiveLineSynergy: {
    score: number;
    avgPace: number;
    avgPositioning: number;
    weakLinks: { playerId: string; name: string; position: PositionCode; pace: number; acceleration: number }[];
  };
  roleFitSynergy: {
    score: number;
    mismatches: {
      playerId: string;
      name: string;
      position: PositionCode;
      role: PlayerRole;
      roleScore: number;
      reasonEn: string;
      reasonTh: string;
    }[];
  };
}

/**
 * Evaluates Attribute Synergy between Team Tactics, Player Roles, and Starting XI Attributes
 */
export function evaluateAttributeSynergy(
  tactic: TacticalSystem,
  playersById: Record<string, Player>
): TacticalSynergyReport {
  const { instructions, lineup } = tactic;

  // 1. Pressing Synergy (Forwards & Midfielders Work Rate + Stamina)
  const pressingSlots = lineup.filter((s) =>
    ['ST', 'AML', 'AMR', 'AMC', 'MC', 'ML', 'MR', 'DM', 'WBL', 'WBR'].includes(s.position)
  );
  const pressingPlayers = pressingSlots
    .map((s) => (s.playerId ? { slot: s, player: playersById[s.playerId] } : null))
    .filter((x): x is { slot: TacticalSlot; player: Player } => Boolean(x && x.player));

  const avgWorkRate =
    pressingPlayers.length > 0
      ? pressingPlayers.reduce((sum, x) => sum + x.player.attributes.mental.workRate, 0) / pressingPlayers.length
      : 12;
  const avgStamina =
    pressingPlayers.length > 0
      ? pressingPlayers.reduce((sum, x) => sum + x.player.attributes.physical.stamina, 0) / pressingPlayers.length
      : 12;

  const isHighPress =
    instructions.pressingIntensity === 'High' ||
    instructions.pressingIntensity === 'Very High' ||
    (instructions.whenPossessionLost || instructions.transition) === 'Counter-Press';

  const requiredPressThreshold = instructions.pressingIntensity === 'Very High' ? 12.5 : isHighPress ? 11.5 : 9.5;
  const pressWeakLinks = isHighPress
    ? pressingPlayers
        .filter(
          ({ player }) =>
            (player.attributes.mental.workRate + player.attributes.physical.stamina) / 2 < requiredPressThreshold
        )
        .map(({ slot, player }) => ({
          playerId: player.id,
          name: `${player.firstName} ${player.lastName}`,
          position: slot.position,
          workRate: player.attributes.mental.workRate,
          stamina: player.attributes.physical.stamina,
        }))
    : [];

  let pressingScore = Math.min(100, Math.round(((avgWorkRate + avgStamina) / 30) * 100));
  if (isHighPress && pressWeakLinks.length > 0) {
    pressingScore = Math.max(30, pressingScore - pressWeakLinks.length * 12);
  }

  // 2. Defensive Line Synergy (Centre-Backs Pace + Acceleration vs High Line)
  const cbSlots = lineup.filter((s) => s.position === 'DC');
  const cbPlayers = cbSlots
    .map((s) => (s.playerId ? { slot: s, player: playersById[s.playerId] } : null))
    .filter((x): x is { slot: TacticalSlot; player: Player } => Boolean(x && x.player));

  const avgPace =
    cbPlayers.length > 0
      ? cbPlayers.reduce(
          (sum, x) => sum + (x.player.attributes.physical.pace + x.player.attributes.physical.acceleration) / 2,
          0
        ) / cbPlayers.length
      : 12;
  const avgPositioning =
    cbPlayers.length > 0
      ? cbPlayers.reduce((sum, x) => sum + x.player.attributes.mental.positioning, 0) / cbPlayers.length
      : 12;

  const isHighLine = instructions.defensiveLine === 'High' || instructions.defensiveLine === 'Very High';
  const requiredPaceThreshold = instructions.defensiveLine === 'Very High' ? 13 : isHighLine ? 12 : 9.5;

  const defWeakLinks = isHighLine
    ? cbPlayers
        .filter(
          ({ player }) =>
            (player.attributes.physical.pace + player.attributes.physical.acceleration) / 2 < requiredPaceThreshold
        )
        .map(({ slot, player }) => ({
          playerId: player.id,
          name: `${player.firstName} ${player.lastName}`,
          position: slot.position,
          pace: player.attributes.physical.pace,
          acceleration: player.attributes.physical.acceleration,
        }))
    : [];

  let defensiveLineScore = isHighLine
    ? Math.min(100, Math.round(((avgPace * 1.3 + avgPositioning * 0.7) / 30) * 100))
    : Math.min(100, Math.round(((avgPositioning * 1.4 + avgPace * 0.6) / 30) * 100));

  if (isHighLine && defWeakLinks.length > 0) {
    defensiveLineScore = Math.max(25, defensiveLineScore - defWeakLinks.length * 16);
  }

  // 3. Role-Attribute Fit Synergy
  const mismatches: TacticalSynergyReport['roleFitSynergy']['mismatches'] = [];
  let roleScoreSum = 0;
  let filledCount = 0;

  for (const slot of lineup) {
    if (!slot.playerId) continue;
    const p = playersById[slot.playerId];
    if (!p) continue;
    filledCount += 1;
    const rScore = evaluateRoleSuitability(p, slot.role);
    const posFit = calculatePositionFit(p, slot.position);
    roleScoreSum += rScore * posFit;

    if (slot.role === 'Inverted Wing Back' && (p.attributes.technical.passing < 11 || p.attributes.mental.vision < 11)) {
      mismatches.push({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: slot.position,
        role: slot.role,
        roleScore: rScore,
        reasonEn: `Inverted Wing Back requires Passing (${p.attributes.technical.passing}) & Vision (${p.attributes.mental.vision}) ≥ 11 to link play in central midfield.`,
        reasonTh: `บทบาท Inverted Wing Back ต้องใช้ค่า Passing (${p.attributes.technical.passing}) และ Vision (${p.attributes.mental.vision}) ≥ 11 เพื่อหุบเข้าในไปช่วยต่อบอลแดนกลาง`,
      });
    } else if (slot.role === 'False 9' && (p.attributes.mental.vision < 12 || p.attributes.technical.passing < 12)) {
      mismatches.push({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: slot.position,
        role: slot.role,
        roleScore: rScore,
        reasonEn: `False 9 requires Vision (${p.attributes.mental.vision}) & Passing (${p.attributes.technical.passing}) ≥ 12 to drop deep and create space for wingers.`,
        reasonTh: `บทบาท False 9 ต้องใช้ค่า Vision (${p.attributes.mental.vision}) และ Passing (${p.attributes.technical.passing}) ≥ 12 ในการล้วงบอลต่ำและปั้นเกมให้ปีกสอดขึ้นมายิง`,
      });
    } else if (
      slot.role === 'Box-to-Box Midfielder' &&
      (p.attributes.physical.stamina < 12 || p.attributes.mental.workRate < 12)
    ) {
      mismatches.push({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: slot.position,
        role: slot.role,
        roleScore: rScore,
        reasonEn: `Box-to-Box Midfielder requires high Stamina (${p.attributes.physical.stamina}) & Work Rate (${p.attributes.mental.workRate}) ≥ 12 to cover both boxes for 90 mins.`,
        reasonTh: `บทบาท Box-to-Box Midfielder บังคับต้องมีค่า Stamina (${p.attributes.physical.stamina}) และ Work Rate (${p.attributes.mental.workRate}) ≥ 12 เพื่อวิ่งขึ้นสุดลงสุดตลอด 90 นาที`,
      });
    } else if (rScore < 10) {
      mismatches.push({
        playerId: p.id,
        name: `${p.firstName} ${p.lastName}`,
        position: slot.position,
        role: slot.role,
        roleScore: rScore,
        reasonEn: `Low attribute suitability (${rScore}/20) for role ${slot.role}.`,
        reasonTh: `ค่าพลังมีความเหมาะสมกับบทบาท ${slot.role} ค่อนข้างต่ำ (${rScore}/20)`,
      });
    }
  }

  const avgRoleScore = filledCount > 0 ? roleScoreSum / filledCount : 12;
  const roleFitScore = Math.max(
    30,
    Math.min(100, Math.round((avgRoleScore / 15.5) * 100) - mismatches.length * 8)
  );

  const overallScore = Math.round(
    pressingScore * 0.34 + defensiveLineScore * 0.33 + roleFitScore * 0.33
  );

  return {
    overallScore,
    pressingSynergy: {
      score: pressingScore,
      avgWorkRate: Number(avgWorkRate.toFixed(1)),
      avgStamina: Number(avgStamina.toFixed(1)),
      weakLinks: pressWeakLinks,
    },
    defensiveLineSynergy: {
      score: defensiveLineScore,
      avgPace: Number(avgPace.toFixed(1)),
      avgPositioning: Number(avgPositioning.toFixed(1)),
      weakLinks: defWeakLinks,
    },
    roleFitSynergy: {
      score: roleFitScore,
      mismatches,
    },
  };
}

/**
 * Evaluates a player's muscle injury risk based on Condition (Fitness), Natural Fitness, and Pressing load
 */
export function evaluatePlayerInjuryRisk(
  player: Player,
  pressingIntensity: import('../types/game').PressingIntensity = 'Standard'
): {
  level: 'Low' | 'Moderate' | 'High' | 'Critical';
  labelEn: string;
  labelTh: string;
  muscleInjuryChancePct: number;
} {
  if (player.injuryStatus.isInjured) {
    return {
      level: 'Critical',
      labelEn: `Injured (${player.injuryStatus.daysRemaining}d)`,
      labelTh: `บาดเจ็บ (${player.injuryStatus.daysRemaining} วัน)`,
      muscleInjuryChancePct: 100,
    };
  }

  const pressLoad =
    pressingIntensity === 'Very High' ? 6 : pressingIntensity === 'High' ? 3 : 0;
  const natFit = player.attributes.physical.naturalFitness || 12;

  if (player.fitness < 60) {
    return {
      level: 'Critical',
      labelEn: 'Critical Risk (<60% Cond)',
      labelTh: 'เสี่ยงเจ็บสูงมาก (<60%)',
      muscleInjuryChancePct: Math.min(45, 24 + pressLoad + Math.max(0, 14 - natFit)),
    };
  }
  if (player.fitness < 70) {
    return {
      level: 'High',
      labelEn: 'High Muscle Risk (<70%)',
      labelTh: 'เสี่ยงเจ็บกล้ามเนื้อ (<70%)',
      muscleInjuryChancePct: Math.min(32, 14 + pressLoad + Math.max(0, 13 - natFit)),
    };
  }
  if (player.fitness < 82 || (pressingIntensity === 'Very High' && player.attributes.physical.stamina < 11)) {
    return {
      level: 'Moderate',
      labelEn: 'Moderate Load',
      labelTh: 'ความเสี่ยงปานกลาง',
      muscleInjuryChancePct: 5 + Math.round(pressLoad / 2),
    };
  }
  return {
    level: 'Low',
    labelEn: 'Low Risk',
    labelTh: 'ความเสี่ยงต่ำ',
    muscleInjuryChancePct: 2,
  };
}

const COUNTRY_ID_TO_NATIONALITY_CODES: Record<string, string[]> = {
  ENG: ['ENG', 'WAL', 'SCO', 'NIR'],
  ESP: ['ESP'],
  GER: ['GER'],
  ITA: ['ITA'],
  FRA: ['FRA'],
  POR: ['POR'],
  NED: ['NED'],
  BEL: ['BEL'],
  TUR: ['TUR'],
  SCO: ['SCO', 'ENG'],
};

/**
 * Determines if a player counts as a Homegrown Player (HG) for Squad Registration
 */
export function isPlayerHomegrownForClub(player: Player, clubCountryId: string): boolean {
  if (player.isHomegrown !== undefined) return player.isHomegrown;
  if (player.isYouthAcademy) return true;
  const allowedCodes = COUNTRY_ID_TO_NATIONALITY_CODES[clubCountryId] || [clubCountryId];
  return allowedCodes.includes(player.nationalityCode);
}

export interface SquadRegistrationSummary {
  maxSquadSize: number;
  minHomegrownQuota: number;
  registeredCount: number;
  homegrownRegisteredCount: number;
  totalHomegrownInClub: number;
  isCompliant: boolean;
  issues: { en: string; th: string }[];
}

/**
 * Evaluates UEFA / League 25-man Squad Registration & 8-Homegrown Player Quota compliance
 */
export function evaluateSquadRegistration(
  clubPlayers: Player[],
  clubCountryId: string
): SquadRegistrationSummary {
  const maxSquadSize = 25;
  const minHomegrownQuota = 8;

  const registered = clubPlayers.filter((p) => p.isRegistered !== false);
  const registeredCount = registered.length;
  const homegrownRegisteredCount = registered.filter((p) =>
    isPlayerHomegrownForClub(p, clubCountryId)
  ).length;
  const totalHomegrownInClub = clubPlayers.filter((p) =>
    isPlayerHomegrownForClub(p, clubCountryId)
  ).length;

  const issues: { en: string; th: string }[] = [];

  if (registeredCount > maxSquadSize) {
    issues.push({
      en: `Registered squad size (${registeredCount}/25) exceeds the maximum 25-player limit by ${registeredCount - maxSquadSize}.`,
      th: `จำนวนนักเตะที่ลงทะเบียน (${registeredCount}/25 คน) เกินโควตาสูงสุด 25 คนอยู่ ${registeredCount - maxSquadSize} คน`,
    });
  }

  // Non-homegrown cap is 17 (25 - 8)
  const nonHomegrownRegistered = registeredCount - homegrownRegisteredCount;
  if (homegrownRegisteredCount < minHomegrownQuota) {
    issues.push({
      en: `Homegrown quota not met: ${homegrownRegisteredCount}/${minHomegrownQuota} Homegrown (HG) players registered. Promote U19 Academy prospects or register domestic talent.`,
      th: `โควตานักเตะท้องถิ่น (Homegrown) ไม่ครบเกณฑ์: ลงทะเบียน ${homegrownRegisteredCount}/${minHomegrownQuota} คน กรุณาดันดาวรุ่งจาก Youth Academy หรือลงทะเบียนนักเตะ HG เพิ่ม`,
    });
  } else if (nonHomegrownRegistered > maxSquadSize - minHomegrownQuota) {
    issues.push({
      en: `Too many non-Homegrown players registered (${nonHomegrownRegistered}/17 max non-HG).`,
      th: `ลงทะเบียนนักเตะต่างชาติ/นอกโควตา HG เกินกำหนด (${nonHomegrownRegistered}/17 คนสูงสุด)`,
    });
  }

  return {
    maxSquadSize,
    minHomegrownQuota,
    registeredCount,
    homegrownRegisteredCount,
    totalHomegrownInClub,
    isCompliant: issues.length === 0,
    issues,
  };
}

/**
 * Automatically selects up to 25 players for Squad Registration while prioritizing at least 8 Homegrown players + Starters
 */
export function autoRegisterSquadIds(
  clubPlayers: Player[],
  clubCountryId: string,
  starterIds: Set<string>
): Set<string> {
  const selected = new Set<string>();
  const hgPlayers = clubPlayers
    .filter((p) => isPlayerHomegrownForClub(p, clubCountryId))
    .sort((a, b) => {
      const aStart = starterIds.has(a.id) ? 1 : 0;
      const bStart = starterIds.has(b.id) ? 1 : 0;
      if (aStart !== bStart) return bStart - aStart;
      return b.currentAbility - a.currentAbility;
    });

  // 1. Register up to 8 top Homegrown players first
  for (const p of hgPlayers.slice(0, 8)) {
    selected.add(p.id);
  }

  // 2. Register all remaining Starting XI players (up to 25)
  const sortedRest = clubPlayers
    .filter((p) => !selected.has(p.id))
    .sort((a, b) => {
      const aStart = starterIds.has(a.id) ? 1 : 0;
      const bStart = starterIds.has(b.id) ? 1 : 0;
      if (aStart !== bStart) return bStart - aStart;
      return b.currentAbility - a.currentAbility;
    });

  for (const p of sortedRest) {
    if (selected.size >= 25) break;
    selected.add(p.id);
  }

  return selected;
}

/**
 * Automatically selects the best 11 starters and 9 bench players for a club
 */
export function autoPickLineup(
  formation: FormationId,
  clubPlayers: Player[],
  existingInstructions?: TeamInstructions,
  tacticId = 'tactic-primary',
  tacticName = 'Primary System',
  familiarityOverride?: number
): TacticalSystem {
  const blueprint = FORMATION_BLUEPRINTS[formation];
  const available = clubPlayers.filter((p) => !p.injuryStatus.isInjured && p.isRegistered !== false);
  const pool = available.length >= 11 ? available : clubPlayers.filter((p) => !p.injuryStatus.isInjured);
  const usedIds = new Set<string>();

  const lineup: TacticalSlot[] = blueprint.slots.map((slot, idx) => {
    let bestPlayer: Player | null = null;
    let bestScore = -1;

    for (const p of pool) {
      if (usedIds.has(p.id)) continue;
      const posFit = calculatePositionFit(p, slot.position);
      const roleSuit = evaluateRoleSuitability(p, slot.defaultRole) / 20;
      const fitnessFactor = (0.6 + (p.fitness / 100) * 0.4) * (p.fitness < 70 ? 0.82 : 1.0);
      const sharpnessFactor = 0.85 + (p.matchSharpness / 100) * 0.15;
      const score = (p.currentAbility * 0.75 + roleSuit * 200 * 0.25) * posFit * fitnessFactor * sharpnessFactor;
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

  const remaining = pool
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
    familiarity: familiarityOverride ?? 78,
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

  // 1. Tactical Familiarity check (changing formations takes 3-5 matches to master)
  if (tactic.familiarity < 65) {
    alerts.push({
      level: 'warning',
      message: trText(
        `Low Tactical Familiarity (${tactic.familiarity}%): Squad is still adapting to ${tactic.formation}. Expect occasional positioning and passing misunderstandings over the next 3–5 matches.`,
        `ความคุ้นเคยกับแผนยังต่ำ (${tactic.familiarity}%): นักเตะกำลังปรับตัวเข้ากับระบบ ${tactic.formation} อาจยืนตำแหน่งพลาดหรือจ่ายบอลขาดๆ เกินๆ ในช่วง 3–5 นัดแรก`
      ),
    });
  }

  // 2. Check out-of-position, low fitness (<70% injury risk), or low match sharpness (<72%) players
  for (const slot of lineup) {
    if (!slot.playerId) {
      alerts.push({
        level: 'warning',
        message: trText(
          `Position ${slot.position} currently has no starting player assigned.`,
          `ตำแหน่ง ${slot.position} ยังไม่มีผู้เล่นตัวจริงลงสนาม`
        ),
      });
      continue;
    }
    const p = playersById[slot.playerId];
    if (!p) continue;
    const fit = calculatePositionFit(p, slot.position);
    if (fit < 0.75) {
      alerts.push({
        level: 'warning',
        message: trText(
          `${p.firstName} ${p.lastName} is deployed out of position at ${slot.position} (${Math.round(fit * 100)}% effectiveness).`,
          `${p.firstName} ${p.lastName} เล่นในตำแหน่ง ${slot.position} ที่ไม่ถนัด (${Math.round(fit * 100)}% ประสิทธิภาพ)`
        ),
      });
    }
    if (p.fitness < 70) {
      alerts.push({
        level: 'warning',
        message: trText(
          `Injury Risk: ${p.firstName} ${p.lastName} has Condition ${p.fitness}% (<70%) — high risk of a 1–3 week muscle injury if started!`,
          `เสี่ยงบาดเจ็บกล้ามเนื้อ: ${p.firstName} ${p.lastName} มีความฟิตเพียง ${p.fitness}% (<70%) หากฝืนส่งลงตัวจริงเสี่ยงเจ็บพัก 1–3 สัปดาห์!`
        ),
      });
    } else if (p.matchSharpness < 72) {
      alerts.push({
        level: 'info',
        message: trText(
          `Low Match Sharpness: ${p.firstName} ${p.lastName} (${p.matchSharpness}% sharpness) lacks match rhythm and may misplace passes or miss chances.`,
          `ขาดความเฉียบคม (Match Sharpness ${p.matchSharpness}%): ${p.firstName} ${p.lastName} ร้างสนามนาน อาจจ่ายบอลพลาดหรือยิงแป้กบ่อย`
        ),
      });
    }
  }

  // 3. Attribute Synergy checks (High Press weak links, High Line slow CBs, Role mismatches)
  const synergy = evaluateAttributeSynergy(tactic, playersById);

  if (synergy.pressingSynergy.weakLinks.length > 0) {
    const names = synergy.pressingSynergy.weakLinks
      .slice(0, 2)
      .map((w) => `${w.name} (WR ${w.workRate}/Sta ${w.stamina})`)
      .join(', ');
    alerts.push({
      level: 'warning',
      message: trText(
        `High Pressing Breakdown Risk: ${names} lack the Work Rate & Stamina required to sustain a ${instructions.pressingIntensity} press.`,
        `จุดบอดแผน High Pressing: ${names} มีค่าความขยัน (Work Rate) หรือความอึด (Stamina) ต่ำเกินไป ทำให้การเพรสซิ่งแดนบนมีช่องโหว่`
      ),
    });
  }

  if (synergy.defensiveLineSynergy.weakLinks.length > 0) {
    const names = synergy.defensiveLineSynergy.weakLinks
      .map((w) => `${w.name} (Pace ${w.pace})`)
      .join(', ');
    alerts.push({
      level: 'warning',
      message: trText(
        `High Defensive Line Risk: ${names} lack recovery Pace for a ${instructions.defensiveLine} line — high risk of conceding on counter-attacks!`,
        `จุดบอดแนวรับดันสูง (${instructions.defensiveLine}): กองหลัง ${names} มีความเร็ว (Pace) ต่ำ เสี่ยงโดนแทงทะลุช่องสวนกลับเสียประตูสูงมาก!`
      ),
    });
  }

  for (const mismatch of synergy.roleFitSynergy.mismatches.slice(0, 2)) {
    alerts.push({
      level: 'warning',
      message: trText(
        `${mismatch.name} (${mismatch.position}): ${mismatch.reasonEn}`,
        `${mismatch.name} (${mismatch.position}): ${mismatch.reasonTh}`
      ),
    });
  }

  // 4. Check Very High Pressing + High Tempo stamina drain risk
  if (
    (instructions.pressingIntensity === 'Very High' || instructions.pressingIntensity === 'High') &&
    (instructions.tempo === 'Higher' || instructions.tempo === 'Much Higher')
  ) {
    alerts.push({
      level: 'info',
      message: trText(
        'High Pressing combined with High Tempo creates more chances but drains player Fitness faster in the closing stages.',
        'การบีบพื้นที่สูงร่วมกับจังหวะเกมเร็วจะสร้างโอกาสยิงมากขึ้น แต่จะผลาญความฟิต (Fitness) ของผู้เล่นเร็วขึ้นในช่วงท้ายครึ่งหลัง'
      ),
    });
  }

  // 5. Check Play Out of Defence with low passing defenders
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
        message: trText(
          `Playing Out of Defence with low goalkeeper/defender Passing & Composure (${avgPass.toFixed(1)}/20) risks turnovers near your own box.`,
          `สั่งเซ็ตบอลจากแนวรับ แต่ผู้รักษาประตูและกองหลังมีค่า Passing/Composure เฉลี่ยเพียง ${avgPass.toFixed(1)}/20 เสี่ยงเสียบอลหน้ากรอบเขตโทษ`
        ),
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      level: 'optimal',
      message: trText(
        `Tactical structure, 3-phase directives, and player role synergy (${synergy.overallScore}%) are optimal for matchday.`,
        `โครงสร้างแท็กติกทั้ง 3 เฟส และความสอดคล้องของค่าพลังนักเตะ (${synergy.overallScore}%) สมดุลยอดเยี่ยม พร้อมลงสนาม`
      ),
    });
  }

  return alerts;
}

