import React, { useState } from 'react';
import {
  AttackingWidth,
  BuildUpPlay,
  CornerRoutineType,
  DefensiveLine,
  FormationId,
  FreeKickRoutineType,
  LineOfEngagement,
  Mentality,
  OppositionPlayerInstruction,
  PassingDirectness,
  PlayerInstruction,
  PlayerRole,
  PossessionLostInstruction,
  PossessionWonInstruction,
  PressingIntensity,
  SetPieceBoxRole,
  SetPieceSetup,
  TacticalSystem,
  TacklingStyle,
  Tempo,
  TimeWasting,
  WorldState,
} from '../types/game';
import { computeSetPieceThreatScore } from '../engine/matchEngine';
import {
  analyzeTacticalRisks,
  autoPickLineup,
  calculatePositionFit,
  computeAutoSetPieceTakers,
  computeTacticalChemistryLinks,
  computeTacticalPhaseCoordinates,
  evaluateAttributeSynergy,
  evaluatePlayerInjuryRisk,
  evaluateRoleSuitability,
  FORMATION_BLUEPRINTS,
  getRoleProfileInfo,
  ROLES_BY_POSITION,
  TacticalShapeMode,
  togglePlayerInstructionWithExclusions,
} from '../engine/tacticsEngine';
import { soundService } from '../engine/soundService';
import { useLanguage } from '../i18n/LanguageContext';
import { PlayerAvatar } from './PlayerAvatar';

interface TacticsViewProps {
  world: WorldState;
  onUpdateTactic: (tactic: TacticalSystem, isSecondary?: boolean) => void;
  onSelectPlayer: (playerId: string) => void;
}

const ALL_PLAYER_INSTRUCTIONS: PlayerInstruction[] = [
  'Shoot Less',
  'Shoot More',
  'Tackle Harder',
  'Ease Off Tackles',
  'Stay Wider',
  'Cut Inside',
  'Dribble More',
  'Dribble Less',
  'Take More Risks',
  'Hold Position',
  'Roam From Position',
  'Cross More Often',
  'Mark Tighter',
  'Trigger Press More',
  'Trigger Press Less',
];

type PhaseTab = 'in_possession' | 'out_of_possession' | 'transition';

export const TacticsView: React.FC<TacticsViewProps> = ({
  world,
  onUpdateTactic,
  onSelectPlayer,
}) => {
  const { tr } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const [editingSecondary, setEditingSecondary] = useState(false);
  const [phaseTab, setPhaseTab] = useState<PhaseTab>('in_possession');
  const [pitchShapeMode, setPitchShapeMode] = useState<TacticalShapeMode | 'dual_ip_oop'>('base');
  const [showChemistryLinks, setShowChemistryLinks] = useState(true);
  const activeTactic = editingSecondary ? club.secondaryTactic : club.primaryTactic;

  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(0);
  const [swapSourcePlayerId, setSwapSourcePlayerId] = useState<string | null>(null);

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const alerts = analyzeTacticalRisks(activeTactic, world.players);
  const synergy = evaluateAttributeSynergy(activeTactic, world.players);
  const effectiveSingleMode: TacticalShapeMode =
    pitchShapeMode === 'dual_ip_oop' ? 'in_possession' : pitchShapeMode;
  const phaseCoords = computeTacticalPhaseCoordinates(activeTactic, effectiveSingleMode);
  const ipCoords = computeTacticalPhaseCoordinates(activeTactic, 'in_possession');
  const oopCoords = computeTacticalPhaseCoordinates(activeTactic, 'out_of_possession');
  const chemistryLinks = computeTacticalChemistryLinks(activeTactic, world.players);

  const handleFormationChange = (newFormation: FormationId) => {
    soundService.playClick();
    // Look up practiced familiarity for this formation; brand-new formations start around 46% (takes 3-5 matches to master)
    const knownFamiliarity =
      club.formationFamiliarity?.[newFormation] ??
      (newFormation === club.primaryTactic.formation
        ? club.primaryTactic.familiarity
        : newFormation === club.secondaryTactic.formation
          ? club.secondaryTactic.familiarity
          : 46);

    const updated = autoPickLineup(
      newFormation,
      clubPlayers,
      activeTactic.instructions,
      activeTactic.id,
      `${newFormation} System`,
      knownFamiliarity
    );
    onUpdateTactic(updated, editingSecondary);
  };

  const handleAutoPick = () => {
    soundService.playClick();
    const updated = autoPickLineup(
      activeTactic.formation,
      clubPlayers,
      activeTactic.instructions,
      activeTactic.id,
      activeTactic.name,
      activeTactic.familiarity
    );
    onUpdateTactic(updated, editingSecondary);
  };

  const handleSwapPlayers = (playerAId: string, playerBId: string) => {
    if (playerAId === playerBId) {
      setSwapSourcePlayerId(null);
      return;
    }
    soundService.playClick();
    const newLineup = activeTactic.lineup.map((slot) => {
      if (slot.playerId === playerAId) return { ...slot, playerId: playerBId };
      if (slot.playerId === playerBId) return { ...slot, playerId: playerAId };
      return slot;
    });

    const newBench = activeTactic.benchPlayerIds.map((id) => {
      if (id === playerAId) return playerBId;
      if (id === playerBId) return playerAId;
      return id;
    });

    onUpdateTactic(
      {
        ...activeTactic,
        lineup: newLineup,
        benchPlayerIds: newBench,
      },
      editingSecondary
    );
    setSwapSourcePlayerId(null);
  };

  const handleRoleChange = (slotIndex: number, role: PlayerRole) => {
    soundService.playClick();
    const newLineup = activeTactic.lineup.map((s, idx) =>
      idx === slotIndex ? { ...s, role } : s
    );
    onUpdateTactic({ ...activeTactic, lineup: newLineup }, editingSecondary);
  };

  const handleTogglePlayerInstruction = (slotIndex: number, inst: PlayerInstruction) => {
    soundService.playClick();
    const newLineup = activeTactic.lineup.map((s, idx) => {
      if (idx !== slotIndex) return s;
      return {
        ...s,
        instructions: togglePlayerInstructionWithExclusions(s.instructions, inst),
      };
    });
    onUpdateTactic({ ...activeTactic, lineup: newLineup }, editingSecondary);
  };

  const selectedSlot =
    selectedSlotIdx !== null ? activeTactic.lineup[selectedSlotIdx] : null;
  const selectedSlotPlayer =
    selectedSlot?.playerId ? world.players[selectedSlot.playerId] : null;
  const selectedRoleProfile = selectedSlot ? getRoleProfileInfo(selectedSlot.role) : null;

  // Pitch line coordinates for Defensive Line & Line of Engagement visualization
  const defLineY =
    activeTactic.instructions.defensiveLine === 'Very High'
      ? 238
      : activeTactic.instructions.defensiveLine === 'High'
        ? 262
        : activeTactic.instructions.defensiveLine === 'Deep'
          ? 320
          : 292;

  const engageLineY =
    activeTactic.instructions.lineOfEngagement === 'High'
      ? 86
      : activeTactic.instructions.lineOfEngagement === 'Low'
        ? 172
        : 128;

  const whenLost: PossessionLostInstruction =
    activeTactic.instructions.whenPossessionLost ||
    (activeTactic.instructions.transition === 'Regroup' ? 'Regroup' : 'Counter-Press');

  const whenWon: PossessionWonInstruction =
    activeTactic.instructions.whenPossessionWon ||
    (activeTactic.instructions.transition === 'Hold Shape' ? 'Hold Shape' : 'Counter');

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Preset Switcher, Formation Picker, Familiarity & Synergy */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Primary vs Secondary Tactic */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setEditingSecondary(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                !editingSecondary
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tr(
                `Primary System (${club.primaryTactic.formation})`,
                `แผนหลัก (Primary: ${club.primaryTactic.formation})`
              )}
            </button>
            <button
              type="button"
              onClick={() => setEditingSecondary(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                editingSecondary
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tr(
                `Alternative System (${club.secondaryTactic.formation})`,
                `แผนสำรอง (Alternative: ${club.secondaryTactic.formation})`
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="formation-select" className="text-xs text-slate-400">
              {tr('Formation:', 'ระบบแผนการเล่น:')}
            </label>
            <select
              id="formation-select"
              value={activeTactic.formation}
              onChange={(e) => handleFormationChange(e.target.value as FormationId)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
            >
              {(Object.keys(FORMATION_BLUEPRINTS) as FormationId[]).map((fId) => {
                const fam =
                  club.formationFamiliarity?.[fId] ??
                  (fId === club.primaryTactic.formation ? club.primaryTactic.familiarity : 46);
                return (
                  <option key={fId} value={fId}>
                    {FORMATION_BLUEPRINTS[fId].name} ({fam}% Fam)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Tactical Blueprints & Quick Presets */}
          <div className="flex items-center gap-2">
            <label htmlFor="tactical-preset-select" className="text-xs text-slate-400">
              {tr('Preset:', 'ปรัชญาสำเร็จรูป:')}
            </label>
            <select
              id="tactical-preset-select"
              data-testid="tactical-preset-select"
              defaultValue=""
              onChange={(e) => {
                const presetId = e.target.value;
                if (!presetId) return;
                soundService.playClick();
                if (presetId === 'gegenpress_433') {
                  onUpdateTactic(
                    {
                      ...activeTactic,
                      instructions: {
                        ...activeTactic.instructions,
                        mentality: 'Attacking',
                        passingDirectness: 'Mixed',
                        tempo: 'Higher',
                        pressingIntensity: 'Very High',
                        defensiveLine: 'High',
                        lineOfEngagement: 'High',
                        whenPossessionLost: 'Counter-Press',
                        whenPossessionWon: 'Counter',
                        transition: 'Counter-Press',
                      },
                    },
                    editingSecondary
                  );
                } else if (presetId === 'tikitaka_4231') {
                  onUpdateTactic(
                    {
                      ...activeTactic,
                      instructions: {
                        ...activeTactic.instructions,
                        mentality: 'Positive',
                        passingDirectness: 'Shorter',
                        tempo: 'Standard',
                        buildUp: 'Play Out of Defence',
                        pressingIntensity: 'High',
                        defensiveLine: 'High',
                        whenPossessionLost: 'Counter-Press',
                        whenPossessionWon: 'Hold Shape',
                      },
                    },
                    editingSecondary
                  );
                } else if (presetId === 'lowblock_532') {
                  onUpdateTactic(
                    {
                      ...activeTactic,
                      instructions: {
                        ...activeTactic.instructions,
                        mentality: 'Cautious',
                        passingDirectness: 'More Direct',
                        tempo: 'Higher',
                        pressingIntensity: 'Standard',
                        defensiveLine: 'Deep',
                        lineOfEngagement: 'Low',
                        whenPossessionLost: 'Regroup',
                        whenPossessionWon: 'Counter',
                        transition: 'Regroup',
                      },
                    },
                    editingSecondary
                  );
                } else if (presetId === 'wingplay_442') {
                  onUpdateTactic(
                    {
                      ...activeTactic,
                      instructions: {
                        ...activeTactic.instructions,
                        mentality: 'Positive',
                        passingDirectness: 'More Direct',
                        attackingWidth: 'Wide',
                        buildUp: 'More Direct',
                        tempo: 'Higher',
                      },
                    },
                    editingSecondary
                  );
                }
                e.target.value = '';
              }}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-emerald-300 font-medium cursor-pointer"
            >
              <option value="">{tr('Load Tactical Preset...', 'โหลดชุดแท็กติกสำเร็จรูป...')}</option>
              <option value="gegenpress_433">⚡ Gegenpress (High Press &amp; Fast Tempo)</option>
              <option value="tikitaka_4231">🎯 Tiki-Taka Control (Short Passing &amp; Possession)</option>
              <option value="lowblock_532">🛡️ Low-Block Counter (Deep Line &amp; Direct Break)</option>
              <option value="wingplay_442">🪽 Direct Wing Play (Wide Flanks &amp; High Tempo)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            {tr('Tactical Familiarity:', 'ความคุ้นเคยกับแผน:')}{' '}
            <span
              className={
                activeTactic.familiarity >= 75
                  ? 'text-emerald-400 font-semibold'
                  : activeTactic.familiarity >= 60
                    ? 'text-sky-400 font-semibold'
                    : 'text-amber-400 font-bold'
              }
            >
              {activeTactic.familiarity}%
            </span>
          </div>

          <div className="text-xs text-slate-300 font-mono tabular-nums">
            {tr('Attribute Synergy:', 'ความสอดคล้องค่าพลัง (Synergy):')}{' '}
            <span
              className={
                synergy.overallScore >= 75
                  ? 'text-emerald-400 font-semibold'
                  : synergy.overallScore >= 60
                    ? 'text-sky-400 font-semibold'
                    : 'text-amber-400 font-bold'
              }
            >
              {synergy.overallScore}%
            </span>
          </div>

          <button
            type="button"
            onClick={handleAutoPick}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {tr('Auto-Pick Best XI', 'จัด 11 ตัวจริงอัตโนมัติ (Auto-Pick Best XI)')}
          </button>
        </div>
      </div>

      {/* Under-the-Hood Mechanics: 3 Synergy Pillars + Tactical Risk Analyzer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Pillar 1: High Pressing & Work Rate Synergy */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">
              {tr('1. Pressing & Stamina Synergy', '1. ความสอดคล้องเกมเพรสซิ่ง (Work Rate & Stamina)')}
            </span>
            <span
              className={`font-mono font-bold ${
                synergy.pressingSynergy.score >= 75 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {synergy.pressingSynergy.score}%
            </span>
          </div>
          <div className="text-xs text-slate-200 font-mono tabular-nums mt-1">
            {tr(
              `Press: ${activeTactic.instructions.pressingIntensity} · Avg WR ${synergy.pressingSynergy.avgWorkRate}/20 · Avg Sta ${synergy.pressingSynergy.avgStamina}/20`,
              `ระดับเพรส: ${activeTactic.instructions.pressingIntensity} · ขยันเฉลี่ย ${synergy.pressingSynergy.avgWorkRate}/20 · อึดเฉลี่ย ${synergy.pressingSynergy.avgStamina}/20`
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {synergy.pressingSynergy.weakLinks.length > 0 ? (
              <span className="text-amber-400">
                {tr(
                  `Weak link: ${synergy.pressingSynergy.weakLinks.map((w) => w.name).join(', ')}`,
                  `จุดบอดเพรสซิ่ง: ${synergy.pressingSynergy.weakLinks.map((w) => w.name).join(', ')}`
                )}
              </span>
            ) : (
              tr(
                'Front & midfield units have sufficient stamina for pressing scheme',
                'แดนหน้าและกองกลางมีความขยันและความอึดสอดคล้องกับแผนเพรสซิ่ง'
              )
            )}
          </div>
        </div>

        {/* Pillar 2: Defensive Line & Centre-Back Pace Synergy */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">
              {tr('2. Defensive Line & CB Pace Synergy', '2. แนวรับ & ความเร็วกองหลัง (High Line vs Pace)')}
            </span>
            <span
              className={`font-mono font-bold ${
                synergy.defensiveLineSynergy.score >= 75 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {synergy.defensiveLineSynergy.score}%
            </span>
          </div>
          <div className="text-xs text-slate-200 font-mono tabular-nums mt-1">
            {tr(
              `Line: ${activeTactic.instructions.defensiveLine} · CB Pace ${synergy.defensiveLineSynergy.avgPace}/20 · Pos ${synergy.defensiveLineSynergy.avgPositioning}/20`,
              `แนวรับ: ${activeTactic.instructions.defensiveLine} · ความเร็ว CB ${synergy.defensiveLineSynergy.avgPace}/20 · ยืนตำแหน่ง ${synergy.defensiveLineSynergy.avgPositioning}/20`
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {synergy.defensiveLineSynergy.weakLinks.length > 0 ? (
              <span className="text-amber-400">
                {tr(
                  `Slow CB for High Line: ${synergy.defensiveLineSynergy.weakLinks.map((w) => w.name).join(', ')}`,
                  `กองหลังช้าเสี่ยงโดนสวนกลับ: ${synergy.defensiveLineSynergy.weakLinks.map((w) => w.name).join(', ')}`
                )}
              </span>
            ) : (
              tr(
                'Centre-back recovery pace matches current defensive line height',
                'ความเร็วกองหลังตัวกลางสอดคล้องกับระดับความสูงของแนวรับ'
              )
            )}
          </div>
        </div>

        {/* Pillar 3: Tactical Familiarity & Role Suitability */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">
              {tr('3. Role Fit & Tactical Familiarity', '3. ความเหมาะสมตาม Role & ความคุ้นเคยแผน')}
            </span>
            <span
              className={`font-mono font-bold ${
                activeTactic.familiarity >= 70 && synergy.roleFitSynergy.score >= 70
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {synergy.roleFitSynergy.score}% Role · {activeTactic.familiarity}% Fam
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mt-1.5 border border-slate-800">
            <div
              className={`h-full transition-all ${
                activeTactic.familiarity >= 75
                  ? 'bg-emerald-500'
                  : activeTactic.familiarity >= 60
                    ? 'bg-sky-400'
                    : 'bg-amber-400'
              }`}
              style={{ width: `${activeTactic.familiarity}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {activeTactic.familiarity < 65
              ? tr(
                  `New formation (${activeTactic.formation}): Play ~${Math.ceil((75 - activeTactic.familiarity) / 4)} matches to build full familiarity`,
                  `เพิ่งเปลี่ยนแผน (${activeTactic.formation}): ต้องใช้เวลาลงแข่งอีกราว ~${Math.ceil((75 - activeTactic.familiarity) / 4)} นัดเพื่อให้คุ้นเคยเต็มที่`
                )
              : tr(
                  'Squad is well-drilled in this formation and role assignments',
                  'นักเตะคุ้นเคยกับการยืนตำแหน่งและบทบาทในแผนนี้เป็นอย่างดี'
                )}
          </div>
        </div>
      </div>

      {/* Tactical Alerts Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
        <div className="text-xs font-semibold text-slate-300">
          {tr(
            'Tactical Structure & Attribute Synergy Alerts',
            'การวิเคราะห์โครงสร้างแท็กติกและจุดบอดค่าพลัง (Tactical & Synergy Analysis)'
          )}
        </div>
        {alerts.map((al, i) => (
          <div
            key={i}
            className={`text-xs flex items-center gap-2 ${
              al.level === 'warning'
                ? 'text-amber-400'
                : al.level === 'optimal'
                  ? 'text-emerald-400'
                  : 'text-sky-300'
            }`}
          >
            <span className="shrink-0 font-semibold">
              {al.level === 'warning'
                ? tr('▲ Warning:', '▲ คำเตือน:')
                : al.level === 'optimal'
                  ? tr('✓ Optimal:', '✓ สมดุล:')
                  : tr('ℹ Info:', 'ℹ ข้อมูล:')}
            </span>
            <span>{al.message}</span>
          </div>
        ))}
      </div>

      {/* Main 3-Column Tactics Grid: Top-Down Pitch + Starting XI/Swap + 3-Phase Team & Player Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: Top-Down Pitch View with Phase Overlays, 3-Mode Shape Preview & Chemistry Links */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <h3 className="text-xs font-semibold text-slate-300">
              {tr(
                `Pitch Structure (${FORMATION_BLUEPRINTS[activeTactic.formation].name})`,
                `ผังตำแหน่งและการเคลื่อนที่ (${FORMATION_BLUEPRINTS[activeTactic.formation].name})`
              )}
            </h3>
            <button
              type="button"
              onClick={() => setShowChemistryLinks((v) => !v)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border cursor-pointer transition-colors ${
                showChemistryLinks
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {showChemistryLinks
                ? tr('★ Chemistry Links: ON', '★ เส้นความเข้าขา: เปิด')
                : tr('☆ Chemistry Links: OFF', '☆ เส้นความเข้าขา: ปิด')}
            </button>
          </div>

          {/* 4-Mode Pitch Shape Switcher (Base / In-Possession / Out-of-Possession / Dual IP vs OOP) */}
          <div className="grid grid-cols-4 gap-1 p-1 mb-3 bg-slate-950 rounded-lg border border-slate-800">
            {[
              {
                id: 'base' as const,
                labelEn: '1. Base',
                labelTh: '1. ผังหลัก',
              },
              {
                id: 'in_possession' as const,
                labelEn: '2. In-Poss (IP)',
                labelTh: '2. ครองบอล (IP)',
              },
              {
                id: 'out_of_possession' as const,
                labelEn: '3. Out-Poss (OOP)',
                labelTh: '3. ตั้งรับ (OOP)',
              },
              {
                id: 'dual_ip_oop' as const,
                labelEn: '4. Dual IP/OOP',
                labelTh: '4. เทียบคู่ IP/OOP',
              },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`pitch-mode-${m.id}`}
                onClick={() => {
                  soundService.playClick();
                  setPitchShapeMode(m.id);
                }}
                className={`py-1.5 px-1.5 rounded text-[11px] font-medium transition-colors cursor-pointer truncate ${
                  pitchShapeMode === m.id
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr(m.labelEn, m.labelTh)}
              </button>
            ))}
          </div>

          {pitchShapeMode === 'dual_ip_oop' ? (
            <div
              data-testid="dual-ip-oop-pitch"
              className="grid grid-cols-2 gap-2.5 w-full aspect-[3/4]"
            >
              {(
                [
                  {
                    key: 'ip',
                    title: tr('IN POSSESSION (IP)', 'เมื่อครองบอลบุก (IP)'),
                    sub: tr('Attacking Phase Shape', 'การขยับขึ้นเกมรุก'),
                    coords: ipCoords,
                    accent: '#10b981',
                  },
                  {
                    key: 'oop',
                    title: tr('OUT OF POSSESSION (OOP)', 'เมื่อถอยตั้งรับ (OOP)'),
                    sub: tr('Defensive Block Shape', 'การถอยแพ็กเกมรับ'),
                    coords: oopCoords,
                    accent: '#38bdf8',
                  },
                ] as const
              ).map((panel) => (
                <div
                  key={panel.key}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-2 flex flex-col overflow-hidden"
                >
                  <div className="mb-1.5 pb-1 border-b border-slate-800">
                    <div
                      className="text-xs font-display font-bold uppercase truncate"
                      style={{ color: panel.accent }}
                    >
                      {panel.title}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{panel.sub}</div>
                  </div>
                  <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden border border-slate-800 bg-[#0d4f38]">
                    <svg viewBox="0 0 150 220" className="w-full h-full">
                      <rect x="6" y="6" width="138" height="208" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
                      <line x1="6" y1="110" x2="144" y2="110" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
                      <circle cx="75" cy="110" r="20" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
                      <rect x="35" y="6" width="80" height="30" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
                      <rect x="35" y="184" width="80" height="30" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
                      {panel.coords.map((coord, idx) => {
                        const slot = activeTactic.lineup[idx];
                        const p = slot?.playerId ? world.players[slot.playerId] : null;
                        const bx = (coord.baseX / 100) * 150;
                        const by = (coord.baseY / 100) * 220;
                        const tx = (coord.x / 100) * 150;
                        const ty = (coord.y / 100) * 220;
                        const shirtNum = p?.shirtNumber || idx + 1;
                        return (
                          <g
                            key={`${panel.key}_${idx}`}
                            onClick={() => setSelectedSlotIdx(idx)}
                            className="cursor-pointer"
                          >
                            {Math.hypot(tx - bx, ty - by) > 3 && (
                              <line
                                x1={bx}
                                y1={by}
                                x2={tx}
                                y2={ty}
                                stroke={panel.accent}
                                strokeOpacity="0.7"
                                strokeWidth="1.2"
                                strokeDasharray="2.5 2"
                              />
                            )}
                            <circle
                              cx={tx}
                              cy={ty}
                              r="7.2"
                              fill={club.primaryColor}
                              stroke={selectedSlotIdx === idx ? '#facc15' : '#ffffff'}
                              strokeWidth={selectedSlotIdx === idx ? '1.8' : '1'}
                            />
                            <text
                              x={tx}
                              y={ty + 2.4}
                              textAnchor="middle"
                              fontSize="6.5"
                              fontWeight="bold"
                              fill="#ffffff"
                            >
                              {shirtNum}
                            </text>
                            <text
                              x={tx}
                              y={ty + 13.5}
                              textAnchor="middle"
                              fontSize="5.8"
                              fontWeight="bold"
                              fill="#f8fafc"
                            >
                              {p ? p.lastName.slice(0, 8) : slot.position}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          ) : (
          /* Interactive SVG/DOM Pitch */
          <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-slate-700 bg-[#0d4f38] select-none">
            {/* Pitch Markings + Tactical Phase Overlays + Chemistry Links SVG */}
            <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full pointer-events-none">
              <defs>
                <marker
                  id="role-arrow"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(52, 211, 153, 0.9)" />
                </marker>
                <marker
                  id="shift-arrow"
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(56, 189, 248, 0.95)" />
                </marker>
              </defs>

              {/* Outer pitch & lines */}
              <rect x="12" y="12" width="276" height="376" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" />
              <line x1="12" y1="200" x2="288" y2="200" stroke="rgba(255,255,255,0.32)" strokeWidth="2" />
              <circle cx="150" cy="200" r="36" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" />
              <rect x="65" y="12" width="170" height="55" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" />
              <rect x="65" y="333" width="170" height="55" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2" />

              {/* Attacking Width shading */}
              {activeTactic.instructions.attackingWidth === 'Narrow' && (
                <rect x="82" y="20" width="136" height="300" fill="rgba(16, 185, 129, 0.08)" />
              )}
              {activeTactic.instructions.attackingWidth === 'Wide' && (
                <>
                  <rect x="14" y="25" width="48" height="290" fill="rgba(16, 185, 129, 0.09)" />
                  <rect x="238" y="25" width="48" height="290" fill="rgba(16, 185, 129, 0.09)" />
                </>
              )}

              {/* Out of Possession: Line of Engagement (Pressing Trigger Line) */}
              <line
                x1="16"
                y1={engageLineY}
                x2="284"
                y2={engageLineY}
                stroke="rgba(56, 189, 248, 0.65)"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <text x="18" y={engageLineY - 4} fill="rgba(125, 211, 252, 0.9)" fontSize="8" fontFamily="monospace">
                PRESS LINE ({activeTactic.instructions.lineOfEngagement.toUpperCase()} · {activeTactic.instructions.pressingIntensity.toUpperCase()})
              </text>

              {/* Out of Possession: Defensive Line Height */}
              <line
                x1="16"
                y1={defLineY}
                x2="284"
                y2={defLineY}
                stroke="rgba(251, 191, 36, 0.75)"
                strokeWidth="1.8"
                strokeDasharray="6 3"
              />
              <text x="18" y={defLineY - 4} fill="rgba(253, 224, 71, 0.95)" fontSize="8" fontFamily="monospace">
                DEF LINE ({activeTactic.instructions.defensiveLine.toUpperCase()}{activeTactic.instructions.offsideTrap ? ' · OFFSIDE TRAP' : ''})
              </text>

              {/* SVG Tactical Partnership & Chemistry Lines */}
              {showChemistryLinks &&
                chemistryLinks.map((link) => {
                  const cA = phaseCoords[link.fromSlotIndex];
                  const cB = phaseCoords[link.toSlotIndex];
                  if (!cA || !cB) return null;
                  const x1 = (cA.x / 100) * 300;
                  const y1 = (cA.y / 100) * 400;
                  const x2 = (cB.x / 100) * 300;
                  const y2 = (cB.y / 100) * 400;
                  return (
                    <g key={link.id}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={link.color}
                        strokeOpacity={0.78}
                        strokeWidth={link.level === 'strong' ? 2.6 : 2}
                        strokeDasharray={link.dashed ? '5 3' : undefined}
                      />
                    </g>
                  );
                })}

              {/* Phase Shift Ghost Origin & Movement Vectors (when In-Possession or Out-of-Possession) */}
              {pitchShapeMode !== 'base' &&
                phaseCoords.map((coord) => {
                  const bx = (coord.baseX / 100) * 300;
                  const by = (coord.baseY / 100) * 400;
                  const tx = (coord.x / 100) * 300;
                  const ty = (coord.y / 100) * 400;
                  const dist = Math.hypot(tx - bx, ty - by);
                  if (dist < 4) return null;
                  return (
                    <g key={`shift_${coord.slotIndex}`}>
                      <circle
                        cx={bx}
                        cy={by}
                        r="5"
                        fill="rgba(15, 23, 42, 0.55)"
                        stroke="rgba(148, 163, 184, 0.65)"
                        strokeDasharray="2 2"
                      />
                      <line
                        x1={bx}
                        y1={by}
                        x2={tx}
                        y2={ty}
                        stroke="rgba(56, 189, 248, 0.9)"
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                        markerEnd="url(#shift-arrow)"
                      />
                    </g>
                  );
                })}

              {/* Base Shape Role Movement Vectors */}
              {pitchShapeMode === 'base' &&
                activeTactic.lineup.map((slot) => {
                  const profile = getRoleProfileInfo(slot.role);
                  const startX = (slot.x / 100) * 300;
                  const startY = (slot.y / 100) * 400;
                  const isRightFlank = slot.x > 55;
                  const isLeftFlank = slot.x < 45;
                  let dx = profile.pitchVector.dx;
                  if (isRightFlank && dx > 0) dx = -dx;
                  if (!isLeftFlank && !isRightFlank) dx = 0;

                  if (slot.instructions.includes('Stay Wider')) {
                    dx = isLeftFlank ? -12 : isRightFlank ? 12 : 0;
                  } else if (slot.instructions.includes('Cut Inside')) {
                    dx = isLeftFlank ? 14 : isRightFlank ? -14 : 0;
                  }

                  const dy = profile.pitchVector.dy * 1.9;
                  if (dx === 0 && dy === 0) return null;

                  return (
                    <line
                      key={`vec_${slot.slotIndex}`}
                      x1={startX}
                      y1={startY}
                      x2={startX + dx * 1.8}
                      y2={startY + dy}
                      stroke="rgba(52, 211, 153, 0.75)"
                      strokeWidth="2"
                      markerEnd="url(#role-arrow)"
                    />
                  );
                })}
            </svg>

            {/* 11 Player Nodes on Pitch */}
            {activeTactic.lineup.map((slot, idx) => {
              const p = slot.playerId ? world.players[slot.playerId] : null;
              const isSelected = selectedSlotIdx === idx;
              const isSwapSource = p && swapSourcePlayerId === p.id;
              const posFit = p ? calculatePositionFit(p, slot.position) : 1;
              const lowCond = p && p.fitness < 70;
              const coord = phaseCoords[idx] || {
                x: slot.x,
                y: slot.y,
                roleShiftLabelEn: slot.role,
                roleShiftLabelTh: slot.role,
              };

              return (
                <button
                  key={slot.slotIndex}
                  type="button"
                  onClick={() => {
                    setSelectedSlotIdx(idx);
                    if (swapSourcePlayerId && p) {
                      handleSwapPlayers(swapSourcePlayerId, p.id);
                    }
                  }}
                  style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-all duration-300 ${
                    isSelected ? 'scale-110 z-20' : 'hover:scale-105 z-10'
                  }`}
                >
                  <div className="relative">
                    {p ? (
                      <PlayerAvatar
                        player={p}
                        club={club}
                        size="md"
                        className={`border-2 shadow-md ${
                          isSwapSource
                            ? 'border-amber-400 ring-2 ring-amber-400/60'
                            : isSelected
                              ? 'border-emerald-400 ring-2 ring-emerald-400/60'
                              : lowCond
                                ? 'border-red-400'
                                : posFit < 0.75
                                  ? 'border-amber-400'
                                  : 'border-emerald-400'
                        }`}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-bold border-2 shadow-md bg-slate-950 text-white border-emerald-400">
                        {slot.position}
                      </div>
                    )}
                    <span
                      className={`absolute -bottom-1 -right-1.5 px-1 py-0.2 rounded text-[9px] font-mono font-bold border ${
                        isSwapSource
                          ? 'bg-amber-400 text-slate-950 border-white'
                          : isSelected
                            ? 'bg-emerald-400 text-slate-950 border-white'
                            : posFit < 0.75
                              ? 'bg-amber-600 text-white border-amber-200'
                              : 'bg-slate-950 text-emerald-300 border-emerald-500/60'
                      }`}
                    >
                      {slot.position}
                    </span>
                    {p && activeTactic.setPieces?.captainId === p.id && (
                      <span
                        title={tr('Team Captain', 'กัปตันทีม')}
                        className="absolute -top-1.5 -left-1.5 px-1 rounded bg-amber-400 text-slate-950 text-[9px] font-mono font-extrabold border border-white shadow"
                      >
                        C
                      </span>
                    )}
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-slate-950/90 text-[11px] font-medium text-white whitespace-nowrap border border-slate-800 flex items-center gap-1">
                    {p?.shirtNumber && (
                      <span className="font-mono text-emerald-400 font-bold">#{p.shirtNumber}</span>
                    )}
                    <span>{p ? p.lastName : tr('Empty', 'ว่าง')}</span>
                  </div>
                  <div
                    className={`text-[10px] px-1.5 rounded truncate max-w-[105px] ${
                      pitchShapeMode !== 'base'
                        ? 'text-sky-300 bg-slate-950/90 border border-sky-500/40'
                        : 'text-emerald-300 bg-slate-950/80'
                    }`}
                  >
                    {pitchShapeMode === 'base'
                      ? slot.role
                      : tr(coord.roleShiftLabelEn, coord.roleShiftLabelTh)}
                  </div>
                </button>
              );
            })}
          </div>
          )}

          {/* Chemistry Partnerships Legend & Summary */}
          {showChemistryLinks && (
            <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-300">
                  {tr('Tactical Partnerships (Chemistry)', 'ความเข้าขาระหว่างตำแหน่ง (Chemistry Links)')}
                </span>
                <div className="flex items-center gap-2.5 text-[10px] font-mono">
                  <span className="text-emerald-400">● {tr('Strong', 'เข้าขาดี')}</span>
                  <span className="text-amber-400">● {tr('Developing', 'ปานกลาง')}</span>
                  <span className="text-red-400">╌ {tr('Conflict', 'ทับซ้อน/ผิดตำแหน่ง')}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto">
                {chemistryLinks.map((lk) => (
                  <div
                    key={lk.id}
                    className="px-2 py-1 rounded bg-slate-950 border border-slate-800 flex items-center justify-between text-[10px]"
                    title={tr(lk.reasonEn, lk.reasonTh)}
                  >
                    <span className="text-slate-300 truncate">{lk.pairName}</span>
                    <span
                      className={`font-mono font-bold ${
                        lk.level === 'strong'
                          ? 'text-emerald-400'
                          : lk.level === 'medium'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {lk.score}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Center 4 Cols: Starting XI & Substitutes Table with Condition, Sharpness & Swap */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[680px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300">
              {tr(
                'Starting XI & Bench (Click row for Role, "Swap" to sub)',
                '11 ตัวจริงและสำรอง (คลิกแถวเพื่อตั้ง Role / กดสลับเพื่อเปลี่ยนตัว)'
              )}
            </h3>
            {swapSourcePlayerId && (
              <button
                type="button"
                onClick={() => setSwapSourcePlayerId(null)}
                className="text-xs text-amber-400 hover:underline cursor-pointer"
              >
                {tr('Cancel Swap', 'ยกเลิกการสลับ')}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="text-[11px] font-semibold text-emerald-400 py-1">
              {tr('Starting XI', 'ผู้เล่น 11 ตัวจริง (Starting XI)')}
            </div>
            {activeTactic.lineup.map((slot, idx) => {
              const p = slot.playerId ? world.players[slot.playerId] : null;
              if (!p) return null;
              const fit = calculatePositionFit(p, slot.position);
              const roleStars = evaluateRoleSuitability(p, slot.role);
              const isSwapActive = swapSourcePlayerId === p.id;
              const injRisk = evaluatePlayerInjuryRisk(
                p,
                activeTactic.instructions.pressingIntensity
              );

              return (
                <div
                  key={slot.slotIndex}
                  onClick={() => setSelectedSlotIdx(idx)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${
                    selectedSlotIdx === idx
                      ? 'bg-slate-800 border-emerald-500/60'
                      : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`font-mono font-semibold w-8 text-left shrink-0 ${
                        fit < 0.75 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {slot.position}
                    </span>
                    <PlayerAvatar player={p} club={club} size="sm" />
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPlayer(p.id);
                          }}
                          className="font-medium text-slate-100 hover:text-emerald-400 truncate cursor-pointer"
                        >
                          {p.firstName} {p.lastName}
                        </button>
                        {activeTactic.setPieces?.captainId === p.id && (
                          <span className="px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 text-[9px] font-mono font-bold">
                            [C]
                          </span>
                        )}
                        {slot.instructions.length > 0 && (
                          <span className="text-[10px] font-mono text-sky-400">
                            [{slot.instructions.length} PI]
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate font-mono tabular-nums">
                        <span className="font-sans text-slate-300">{slot.role}</span> ({roleStars}/20) ·{' '}
                        <span className={p.fitness < 70 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                          Cond {p.fitness}%
                        </span>{' '}
                        ·{' '}
                        <span className={p.matchSharpness < 72 ? 'text-amber-400' : 'text-sky-300'}>
                          Sharp {p.matchSharpness}%
                        </span>
                        {injRisk.level === 'High' || injRisk.level === 'Critical' ? (
                          <span className="text-red-400"> · ! Risk</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!swapSourcePlayerId) {
                        setSwapSourcePlayerId(p.id);
                      } else {
                        handleSwapPlayers(swapSourcePlayerId, p.id);
                      }
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer shrink-0 ${
                      isSwapActive
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : swapSourcePlayerId
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isSwapActive
                      ? tr('Selected', 'เลือกอยู่')
                      : swapSourcePlayerId
                        ? tr('Replace', 'แทนที่')
                        : tr('Swap', 'สลับ')}
                  </button>
                </div>
              );
            })}

            <div className="text-[11px] font-semibold text-sky-400 pt-3 pb-1">
              {tr('Substitutes Bench', 'ผู้เล่นสำรองข้างสนาม (Substitutes Bench)')}
            </div>
            {activeTactic.benchPlayerIds.map((bId) => {
              const p = world.players[bId];
              if (!p) return null;
              const isSwapActive = swapSourcePlayerId === p.id;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/70 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-400 w-8 shrink-0">{p.positions[0]}</span>
                    <PlayerAvatar player={p} club={club} size="xs" />
                    <div className="truncate">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(p.id)}
                        className="text-slate-200 hover:text-emerald-400 truncate cursor-pointer block"
                      >
                        {p.firstName} {p.lastName}
                      </button>
                      <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                        CA {(p.currentAbility / 10).toFixed(1)} · Cond {p.fitness}% · Sharp {p.matchSharpness}%
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!swapSourcePlayerId) {
                        setSwapSourcePlayerId(p.id);
                      } else {
                        handleSwapPlayers(swapSourcePlayerId, p.id);
                      }
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer shrink-0 ${
                      isSwapActive
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : swapSourcePlayerId
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {isSwapActive
                      ? tr('Selected', 'เลือกอยู่')
                      : swapSourcePlayerId
                        ? tr('Sub In', 'ส่งลงตัวจริง')
                        : tr('Swap', 'สลับ')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 3 Cols: 3 Phases of Play (Team Tactics) & Selected Player Role/Instructions */}
        <div className="lg:col-span-3 space-y-4">
          {/* Team Tactics Card — Divided into 3 Phases of Play */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-emerald-400">
                {tr('Team Tactics (3 Phases of Play)', 'แท็กติกทีม (3 เฟสการเล่น)')}
              </h3>
            </div>

            {/* 3 Phase Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setPhaseTab('in_possession')}
                className={`py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer truncate ${
                  phaseTab === 'in_possession'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr('1. In Poss', '1. ครองบอล')}
              </button>
              <button
                type="button"
                onClick={() => setPhaseTab('out_of_possession')}
                className={`py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer truncate ${
                  phaseTab === 'out_of_possession'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr('2. Out Poss', '2. เกมรับ/เพรส')}
              </button>
              <button
                type="button"
                onClick={() => setPhaseTab('transition')}
                className={`py-1.5 px-1 text-[11px] font-medium rounded transition-colors cursor-pointer truncate ${
                  phaseTab === 'transition'
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr('3. Transition', '3. เปลี่ยนผ่าน')}
              </button>
            </div>

            {/* PHASE 1: IN POSSESSION */}
            {phaseTab === 'in_possession' && (
              <div className="space-y-2.5 pt-1">
                <div className="text-[11px] text-slate-400">
                  {tr(
                    'In Possession: Controls passing rhythm, width, and build-up structure.',
                    'เมื่อได้ครองบอล: กำหนดจังหวะการต่อบอล ความกว้าง และรูปแบบการเซ็ตเกมรุก'
                  )}
                </div>

                <div>
                  <label htmlFor="ti-mentality" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Team Mentality', 'Mentality (ทัศนคติการเล่น)')}
                  </label>
                  <select
                    id="ti-mentality"
                    value={activeTactic.instructions.mentality}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            mentality: e.target.value as Mentality,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(
                      [
                        'Very Defensive',
                        'Defensive',
                        'Cautious',
                        'Balanced',
                        'Positive',
                        'Attacking',
                        'Very Attacking',
                      ] as Mentality[]
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ti-tempo" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Tempo (Slow Tiki-Taka ↔ Fast Direct)', 'Tempo (จังหวะการเล่น: ช้าชัวร์ ↔ เร็วทะลุทะลวง)')}
                  </label>
                  <select
                    id="ti-tempo"
                    value={activeTactic.instructions.tempo}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            tempo: e.target.value as Tempo,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(['Much Lower', 'Lower', 'Standard', 'Higher', 'Much Higher'] as Tempo[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ti-width" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Attacking Width (Central ↔ Wide Flanks)', 'Width (ความกว้าง: หุบเจาะกลาง ↔ ถ่างเจาะริมเส้น)')}
                  </label>
                  <select
                    id="ti-width"
                    value={activeTactic.instructions.attackingWidth}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            attackingWidth: e.target.value as AttackingWidth,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(['Narrow', 'Standard', 'Wide'] as AttackingWidth[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="ti-passing" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Passing Directness', 'ระยะการจ่ายบอล')}
                    </label>
                    <select
                      id="ti-passing"
                      value={activeTactic.instructions.passingDirectness}
                      onChange={(e) =>
                        onUpdateTactic(
                          {
                            ...activeTactic,
                            instructions: {
                              ...activeTactic.instructions,
                              passingDirectness: e.target.value as PassingDirectness,
                            },
                          },
                          editingSecondary
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {(
                        [
                          'Much Shorter',
                          'Shorter',
                          'Mixed',
                          'More Direct',
                          'Much More Direct',
                        ] as PassingDirectness[]
                      ).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ti-buildup" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Build-Up Play', 'การเซ็ตบอลจากหลัง')}
                    </label>
                    <select
                      id="ti-buildup"
                      value={activeTactic.instructions.buildUp}
                      onChange={(e) =>
                        onUpdateTactic(
                          {
                            ...activeTactic,
                            instructions: {
                              ...activeTactic.instructions,
                              buildUp: e.target.value as BuildUpPlay,
                            },
                          },
                          editingSecondary
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {(['Play Out of Defence', 'Mixed', 'More Direct'] as BuildUpPlay[]).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* PHASE 2: OUT OF POSSESSION */}
            {phaseTab === 'out_of_possession' && (
              <div className="space-y-2.5 pt-1">
                <div className="text-[11px] text-slate-400">
                  {tr(
                    'Out of Possession: High Line & High Press demand fast CBs and high Stamina/Work Rate.',
                    'เมื่อไม่ได้ครองบอล: การดันแนวรับสูงและเพรสหนักต้องพึ่งความเร็วกองหลังและความอึดแดนบน'
                  )}
                </div>

                <div>
                  <label htmlFor="ti-defline" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Defensive Line (Deep Block ↔ High Line)', 'Defensive Line (ถอยอุดประตู ↔ ดันสูงเช็คล้ำหน้า)')}
                  </label>
                  <select
                    id="ti-defline"
                    value={activeTactic.instructions.defensiveLine}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            defensiveLine: e.target.value as DefensiveLine,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(['Deep', 'Standard', 'High', 'Very High'] as DefensiveLine[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ti-press" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Pressing Intensity (Stand Off ↔ High Press)', 'Pressing Intensity (ความหนักในการไล่เพรสซิ่ง)')}
                  </label>
                  <select
                    id="ti-press"
                    value={activeTactic.instructions.pressingIntensity}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            pressingIntensity: e.target.value as PressingIntensity,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(['Low', 'Standard', 'High', 'Very High'] as PressingIntensity[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="ti-engagement" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Line of Engagement', 'จุดเริ่มบีบพื้นที่')}
                    </label>
                    <select
                      id="ti-engagement"
                      value={activeTactic.instructions.lineOfEngagement}
                      onChange={(e) =>
                        onUpdateTactic(
                          {
                            ...activeTactic,
                            instructions: {
                              ...activeTactic.instructions,
                              lineOfEngagement: e.target.value as LineOfEngagement,
                            },
                          },
                          editingSecondary
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {(['Low', 'Mid', 'High'] as LineOfEngagement[]).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ti-tackling" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Tackling Style', 'การเข้าปะทะ')}
                    </label>
                    <select
                      id="ti-tackling"
                      value={activeTactic.instructions.tackling}
                      onChange={(e) =>
                        onUpdateTactic(
                          {
                            ...activeTactic,
                            instructions: {
                              ...activeTactic.instructions,
                              tackling: e.target.value as TacklingStyle,
                            },
                          },
                          editingSecondary
                        )
                      }
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {(['Stay On Feet', 'Standard', 'Get Stuck In'] as TacklingStyle[]).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                  <span>{tr('Step Up / Offside Trap', 'สั่งเช็คล้ำหน้า (Offside Trap)')}</span>
                  <input
                    type="checkbox"
                    checked={activeTactic.instructions.offsideTrap}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            offsideTrap: e.target.checked,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="accent-emerald-500"
                  />
                </label>
              </div>
            )}

            {/* PHASE 3: TRANSITION */}
            {phaseTab === 'transition' && (
              <div className="space-y-3 pt-1">
                <div className="text-[11px] text-slate-400">
                  {tr(
                    'Transition: Immediate reaction when losing or winning possession.',
                    'จังหวะเปลี่ยนผ่าน: คำสั่งทันทีเมื่อทีมเสียบอล และเมื่อทีมตัดบอลกลับมาได้'
                  )}
                </div>

                <div>
                  <div className="text-[11px] text-slate-300 mb-1">
                    {tr('When Possession Lost (เมื่อเสียบอล)', 'เมื่อเสียบอล (When Possession Lost)')}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'Counter-Press', en: 'Counter-Press', th: 'Counter-Press (รุมแย่งคืน)' },
                        { id: 'Regroup', en: 'Regroup', th: 'Regroup (ถอยตั้งโซน)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateTactic(
                            {
                              ...activeTactic,
                              instructions: {
                                ...activeTactic.instructions,
                                whenPossessionLost: opt.id,
                                transition: opt.id,
                              },
                            },
                            editingSecondary
                          )
                        }
                        className={`p-2 rounded text-[11px] font-medium border text-left cursor-pointer ${
                          whenLost === opt.id
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-semibold'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {tr(opt.en, opt.th)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-slate-300 mb-1">
                    {tr('When Possession Won (เมื่อได้บอล)', 'เมื่อตัดบอลได้ (When Possession Won)')}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'Counter', en: 'Counter-Attack', th: 'Counter (สวนกลับเร็ว)' },
                        { id: 'Hold Shape', en: 'Hold Shape', th: 'Hold Shape (เซ็ตบอลชัวร์)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onUpdateTactic(
                            {
                              ...activeTactic,
                              instructions: {
                                ...activeTactic.instructions,
                                whenPossessionWon: opt.id,
                              },
                            },
                            editingSecondary
                          )
                        }
                        className={`p-2 rounded text-[11px] font-medium border text-left cursor-pointer ${
                          whenWon === opt.id
                            ? 'bg-sky-500/20 text-sky-300 border-sky-500/60 font-semibold'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                        }`}
                      >
                        {tr(opt.en, opt.th)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="ti-timewasting" className="block text-[11px] text-slate-300 mb-1">
                    {tr('Game Management / Time Wasting', 'การดึงจังหวะเกม (Time Wasting)')}
                  </label>
                  <select
                    id="ti-timewasting"
                    value={activeTactic.instructions.timeWasting}
                    onChange={(e) =>
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          instructions: {
                            ...activeTactic.instructions,
                            timeWasting: e.target.value as TimeWasting,
                          },
                        },
                        editingSecondary
                      )
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                  >
                    {(['Never', 'Sometimes', 'Often'] as TimeWasting[]).map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Individual Player Role, Key Required Attributes & Instructions Card */}
          {selectedSlot && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-sky-400">
                  {selectedSlot.position} —{' '}
                  {selectedSlotPlayer
                    ? `${selectedSlotPlayer.firstName} ${selectedSlotPlayer.lastName}`
                    : tr('Empty', 'ว่าง')}
                </div>
                {selectedSlotPlayer && (
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                    {tr('Role Fit:', 'ความถนัด Role:')}{' '}
                    {evaluateRoleSuitability(selectedSlotPlayer, selectedSlot.role)}/20
                  </span>
                )}
              </div>

              <div>
                <label htmlFor="pi-role" className="block text-[11px] text-slate-400 mb-1">
                  {tr('Player Role (Tactical Duty)', 'บทบาทเฉพาะตัว (Player Role)')}
                </label>
                <select
                  id="pi-role"
                  value={selectedSlot.role}
                  onChange={(e) =>
                    handleRoleChange(selectedSlot.slotIndex, e.target.value as PlayerRole)
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100 font-medium"
                >
                  {ROLES_BY_POSITION[selectedSlot.position].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Tactical Description & Key Required Attributes */}
              {selectedRoleProfile && (
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/90 space-y-2">
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {tr(selectedRoleProfile.descriptionEn, selectedRoleProfile.descriptionTh)}
                  </p>
                  {selectedSlotPlayer && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-800/80">
                      {selectedRoleProfile.keyAttrs.map((attr) => {
                        const val = attr.getValue(selectedSlotPlayer);
                        return (
                          <div
                            key={attr.key}
                            className="flex items-center justify-between text-[11px] font-mono"
                          >
                            <span className="text-slate-400 font-sans truncate">
                              {tr(attr.labelEn, attr.labelTh)}
                            </span>
                            <span
                              className={
                                val >= 15
                                  ? 'text-emerald-400 font-bold'
                                  : val >= 12
                                    ? 'text-sky-300 font-semibold'
                                    : 'text-amber-400 font-semibold'
                              }
                            >
                              {val}/20
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-[11px] text-slate-400 mb-1.5">
                  {tr(
                    'Individual Instructions (Mutually exclusive pairs auto-switch)',
                    'คำสั่งรายบุคคล (Individual Instructions)'
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PLAYER_INSTRUCTIONS.map((inst) => {
                    const active = selectedSlot.instructions.includes(inst);
                    return (
                      <button
                        key={inst}
                        type="button"
                        onClick={() =>
                          handleTogglePlayerInstruction(selectedSlot.slotIndex, inst)
                        }
                        className={`px-2 py-1 text-[11px] rounded transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-500 text-slate-950 font-semibold'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {inst}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Checkpoint 10: Captain & Set Piece Creator Card */}
          {(() => {
            const starters = activeTactic.lineup
              .map((s) => (s.playerId ? world.players[s.playerId] : null))
              .filter((p): p is NonNullable<typeof p> => Boolean(p));
            const candidatePool = starters.length > 0 ? starters : clubPlayers;
            const currentSetPieces: SetPieceSetup =
              activeTactic.setPieces || computeAutoSetPieceTakers(candidatePool);

            const handleUpdateSetPieces = (patch: Partial<SetPieceSetup>) => {
              onUpdateTactic(
                {
                  ...activeTactic,
                  setPieces: {
                    ...currentSetPieces,
                    ...patch,
                  },
                },
                editingSecondary
              );
            };

            return (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-amber-400">
                      {tr(
                        'Captaincy & Set Piece Routines',
                        'กัปตันทีม & แผนลูกตั้งเตะ (Captain & Set Pieces)'
                      )}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {tr(
                        'Assign your leader and dead-ball specialists + tactical delivery routines',
                        'กำหนดกัปตันทีม คนยิงจุดโทษ/ฟรีคิก/เตะมุม และรูปแบบการโจมตีลูกตั้งเตะ'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateSetPieces(computeAutoSetPieceTakers(candidatePool))
                    }
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-emerald-500/20 text-emerald-300 border border-slate-700 text-[10px] font-medium cursor-pointer"
                  >
                    {tr('Auto-Assign Best', 'เลือกคนแม่นสุดอัตโนมัติ')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="sp-captain" className="block text-[11px] text-slate-400 mb-1">
                      {tr('Team Captain [C] (Leadership)', 'กัปตันทีม [C] (Leadership / ความเป็นผู้นำ)')}
                    </label>
                    <select
                      id="sp-captain"
                      value={currentSetPieces.captainId || ''}
                      onChange={(e) => handleUpdateSetPieces({ captainId: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {[...candidatePool]
                        .sort((a, b) => b.attributes.mental.leadership - a.attributes.mental.leadership)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName[0]}. {p.lastName} (Ldr {p.attributes.mental.leadership} · Det{' '}
                            {p.attributes.mental.determination})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sp-penalty" className="block text-[11px] text-slate-400 mb-1">
                      {tr('Penalty Taker (PK)', 'คนยิงจุดโทษมือ 1 (Penalty Taking)')}
                    </label>
                    <select
                      id="sp-penalty"
                      value={currentSetPieces.penaltyTakerId || ''}
                      onChange={(e) => handleUpdateSetPieces({ penaltyTakerId: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {[...candidatePool]
                        .sort((a, b) => b.attributes.technical.penaltyTaking - a.attributes.technical.penaltyTaking)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName[0]}. {p.lastName} (PK {p.attributes.technical.penaltyTaking} · Cmp{' '}
                            {p.attributes.mental.composure})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sp-freekick" className="block text-[11px] text-slate-400 mb-1">
                      {tr('Free-Kick Taker (FK)', 'คนยิงฟรีคิกมือ 1 (Free Kick Taking)')}
                    </label>
                    <select
                      id="sp-freekick"
                      value={currentSetPieces.freeKickTakerId || ''}
                      onChange={(e) => handleUpdateSetPieces({ freeKickTakerId: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {[...candidatePool]
                        .sort((a, b) => b.attributes.technical.freeKickTaking - a.attributes.technical.freeKickTaking)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName[0]}. {p.lastName} (FK {p.attributes.technical.freeKickTaking} · Tech{' '}
                            {p.attributes.technical.technique})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sp-corner" className="block text-[11px] text-slate-400 mb-1">
                      {tr('Corner Taker (CK)', 'คนเปิดเตะมุมหลัก (Corners)')}
                    </label>
                    <select
                      id="sp-corner"
                      value={currentSetPieces.cornerTakerId || ''}
                      onChange={(e) => handleUpdateSetPieces({ cornerTakerId: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                    >
                      {[...candidatePool]
                        .sort((a, b) => b.attributes.technical.corners - a.attributes.technical.corners)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName[0]}. {p.lastName} (Cor {p.attributes.technical.corners} · Crs{' '}
                            {p.attributes.technical.crossing})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Tactical Routines for Corners & Free Kicks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
                  <div>
                    <label htmlFor="sp-corner-routine" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Corner Delivery Routine', 'แผนการเปิดลูกเตะมุม (Corner Routine)')}
                    </label>
                    <select
                      id="sp-corner-routine"
                      value={currentSetPieces.cornerRoutine}
                      onChange={(e) =>
                        handleUpdateSetPieces({ cornerRoutine: e.target.value as CornerRoutineType })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-emerald-300"
                    >
                      <option value="near_post">
                        {tr('Near Post Flick-On (โยนโฉบเสาแรก)', 'โยนโฉบเสาแรก (Near Post)')}
                      </option>
                      <option value="far_post">
                        {tr('Far Post Power Header (โยนกดเสาสอง)', 'โยนกดเสาสอง (Far Post)')}
                      </option>
                      <option value="centre">
                        {tr('Six-Yard Box Crowd (อัดจุดโทษ/กรอบ 6 หลา)', 'อัดกลางกรอบ 6 หลา (Six-Yard Box)')}
                      </option>
                      <option value="short">
                        {tr('Short Corner Overload (เล่นสั้นเซ็ตเข้าเขตโทษ)', 'เล่นสั้นเซ็ตเข้าเขตโทษ (Short Corner)')}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="sp-fk-routine" className="block text-[11px] text-slate-300 mb-1">
                      {tr('Free-Kick Routine', 'แผนการเล่นลูกฟรีคิก (Free-Kick Routine)')}
                    </label>
                    <select
                      id="sp-fk-routine"
                      value={currentSetPieces.freeKickRoutine}
                      onChange={(e) =>
                        handleUpdateSetPieces({ freeKickRoutine: e.target.value as FreeKickRoutineType })
                      }
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-sky-300"
                    >
                      <option value="direct_shoot">
                        {tr('Direct Shot on Goal (ยิงตรงเข้ากรอบ)', 'ยิงปั่นเข้าประตูโดยตรง (Direct Shot)')}
                      </option>
                      <option value="cross_box">
                        {tr('Whipped Cross to Target Men (โยนเข้าหัวตัวโหม่ง)', 'เปิดโค้งเข้าหัวตัวโหม่ง (Cross to Box)')}
                      </option>
                      <option value="short_layoff">
                        {tr('Short Layoff for Long Shot (เขี่ยสั้นให้แถวสองยิง)', 'เขี่ยสั้นให้แถวสองซัดเต็มข้อ (Short Layoff)')}
                      </option>
                    </select>
                  </div>
                </div>

                {/* Interactive 2D Set-Piece Box Designer & Threat Score (Stage 3 Pillar 2) */}
                {(() => {
                  const threatScore = computeSetPieceThreatScore(
                    activeTactic,
                    world.players,
                    candidatePool
                  );
                  const boxMap = currentSetPieces.boxAssignments || {};
                  const swing = currentSetPieces.cornerDeliverySwing || 'inswinger';

                  const autoAerial = [...candidatePool]
                    .filter((p) => p.positions[0] !== 'GK')
                    .sort(
                      (a, b) =>
                        b.attributes.technical.heading +
                        b.attributes.physical.jumpingReach -
                        (a.attributes.technical.heading + a.attributes.physical.jumpingReach)
                    );
                  const autoLongShot = [...candidatePool]
                    .filter((p) => p.positions[0] !== 'GK')
                    .sort(
                      (a, b) =>
                        b.attributes.technical.longShots - a.attributes.technical.longShots
                    );
                  const autoPace = [...candidatePool]
                    .filter((p) => p.positions[0] !== 'GK')
                    .sort(
                      (a, b) =>
                        b.attributes.physical.pace +
                        b.attributes.physical.acceleration -
                        (a.attributes.physical.pace + a.attributes.physical.acceleration)
                    );

                  const roleDefinitions: {
                    role: SetPieceBoxRole;
                    label: string;
                    x: number;
                    y: number;
                    color: string;
                    defaultPlayer?: typeof candidatePool[0];
                    statLabel: (p: typeof candidatePool[0]) => string;
                  }[] = [
                    {
                      role: 'near_post',
                      label: tr('Attack Near Post', 'โฉบเสาแรก'),
                      x: 34,
                      y: 17,
                      color: '#10b981',
                      defaultPlayer: autoAerial[0],
                      statLabel: (p) =>
                        `HD ${p.attributes.technical.heading} · JMP ${p.attributes.physical.jumpingReach}`,
                    },
                    {
                      role: 'challenge_keeper',
                      label: tr('Challenge Keeper', 'เบียดผู้รักษาประตู'),
                      x: 50,
                      y: 11,
                      color: '#f59e0b',
                      defaultPlayer: autoAerial[2] || autoAerial[0],
                      statLabel: (p) =>
                        `STR ${p.attributes.physical.strength} · BRA ${p.attributes.mental.bravery}`,
                    },
                    {
                      role: 'far_post',
                      label: tr('Attack Far Post', 'กดเสาสอง'),
                      x: 66,
                      y: 18,
                      color: '#10b981',
                      defaultPlayer: autoAerial[1] || autoAerial[0],
                      statLabel: (p) =>
                        `HD ${p.attributes.technical.heading} · JMP ${p.attributes.physical.jumpingReach}`,
                    },
                    {
                      role: 'lurk_edge',
                      label: tr('Lurk Outside Area', 'ดักยิงแถวสองหน้าเขตโทษ'),
                      x: 50,
                      y: 36,
                      color: '#38bdf8',
                      defaultPlayer: autoLongShot[0],
                      statLabel: (p) =>
                        `LS ${p.attributes.technical.longShots} · ANT ${p.attributes.mental.anticipation}`,
                    },
                    {
                      role: 'stay_back_1',
                      label: tr('Stay Back (Left)', 'ห้อยหลังระวังสวนกลับ (ซ้าย)'),
                      x: 33,
                      y: 54,
                      color: '#a855f7',
                      defaultPlayer: autoPace[0],
                      statLabel: (p) =>
                        `PAC ${p.attributes.physical.pace} · ACC ${p.attributes.physical.acceleration}`,
                    },
                    {
                      role: 'stay_back_2',
                      label: tr('Stay Back (Right)', 'ห้อยหลังระวังสวนกลับ (ขวา)'),
                      x: 67,
                      y: 54,
                      color: '#a855f7',
                      defaultPlayer: autoPace[1] || autoPace[0],
                      statLabel: (p) =>
                        `PAC ${p.attributes.physical.pace} · ACC ${p.attributes.physical.acceleration}`,
                    },
                  ];

                  const updateBoxRole = (role: SetPieceBoxRole, playerId: string) => {
                    handleUpdateSetPieces({
                      boxAssignments: {
                        ...boxMap,
                        [role]: playerId,
                      },
                    });
                  };

                  const targetX =
                    currentSetPieces.cornerRoutine === 'near_post'
                      ? 34
                      : currentSetPieces.cornerRoutine === 'far_post'
                        ? 66
                        : currentSetPieces.cornerRoutine === 'short'
                          ? 22
                          : 50;
                  const targetY =
                    currentSetPieces.cornerRoutine === 'short'
                      ? 18
                      : currentSetPieces.cornerRoutine === 'centre'
                        ? 11
                        : 18;
                  const ctrlY = swing === 'inswinger' ? 4 : 29;

                  return (
                    <div
                      data-testid="set-piece-2d-planner"
                      className="pt-3 border-t border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-emerald-400">
                            📐 {tr('2D Penalty Box Set-Piece Planner', 'ผังจัดตำแหน่งเข้าทำลูกตั้งเตะ 2D')}
                          </span>
                          <span
                            data-testid="set-piece-threat-score"
                            className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-[11px]"
                          >
                            {tr('Threat Score:', 'ความอันตราย:')} {threatScore}/100
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSetPieces({
                                cornerDeliverySwing:
                                  swing === 'inswinger' ? 'outswinger' : 'inswinger',
                              })
                            }
                            className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-amber-300 cursor-pointer"
                          >
                            {swing === 'inswinger'
                              ? tr('🌀 Inswinger (โค้งเข้า)', '🌀 โค้งเข้าหาประตู (Inswinger)')
                              : tr('↪ Outswinger (โค้งออก)', '↪ โค้งหนีผู้รักษาประตู (Outswinger)')}
                          </button>
                          <button
                            type="button"
                            data-testid="auto-assign-set-piece-box-btn"
                            onClick={() => {
                              soundService.playClick();
                              handleUpdateSetPieces({
                                boxAssignments: {
                                  near_post: autoAerial[0]?.id,
                                  far_post: autoAerial[1]?.id,
                                  challenge_keeper: autoAerial[2]?.id,
                                  lurk_edge: autoLongShot[0]?.id,
                                  stay_back_1: autoPace[0]?.id,
                                  stay_back_2: autoPace[1]?.id,
                                },
                              });
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-[10px] font-semibold text-emerald-300 cursor-pointer"
                          >
                            ⚡ {tr('Auto-Fit Aerial & Pace', 'จัดตัวโหม่ง/ตัวสกัดอัตโนมัติ')}
                          </button>
                        </div>
                      </div>

                      {/* Half-Pitch Penalty Box 2D SVG */}
                      <svg
                        viewBox="0 0 100 62"
                        className="w-full h-44 rounded-xl border border-slate-800 bg-[#0b4731]"
                      >
                        <rect x="4" y="4" width="92" height="54" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6" />
                        {/* Goal mouth */}
                        <rect x="42" y="1.5" width="16" height="2.5" fill="none" stroke="#ffffff" strokeWidth="0.7" />
                        {/* 18-yard Penalty Area */}
                        <rect x="20" y="4" width="60" height="26" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />
                        {/* 6-yard Box */}
                        <rect x="35" y="4" width="30" height="10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.6" />
                        {/* Penalty Spot */}
                        <circle cx="50" cy="19" r="0.8" fill="#ffffff" />

                        {/* Corner Delivery Curved Trajectory */}
                        <path
                          d={`M 5 5 Q 24 ${ctrlY} ${targetX} ${targetY}`}
                          fill="none"
                          stroke="#facc15"
                          strokeWidth="1.1"
                          strokeDasharray="2 1"
                        />
                        <circle cx="5" cy="5" r="1.8" fill="#facc15" stroke="#000" strokeWidth="0.4" />

                        {/* 6 Assigned Penalty Box Role Markers */}
                        {roleDefinitions.map((rd) => {
                          const assignedId = boxMap[rd.role] || rd.defaultPlayer?.id;
                          const p = assignedId ? world.players[assignedId] : rd.defaultPlayer;
                          return (
                            <g key={rd.role}>
                              <circle
                                cx={rd.x}
                                cy={rd.y}
                                r="3.4"
                                fill={rd.color}
                                stroke="#ffffff"
                                strokeWidth="0.6"
                              />
                              <text
                                x={rd.x}
                                y={rd.y + 1}
                                textAnchor="middle"
                                fontSize="2.2"
                                fontWeight="bold"
                                fill="#020617"
                              >
                                {p?.shirtNumber || '•'}
                              </text>
                              <text
                                x={rd.x}
                                y={rd.y + 6}
                                textAnchor="middle"
                                fontSize="2.2"
                                fontWeight="bold"
                                fill="#f8fafc"
                              >
                                {p ? p.lastName.slice(0, 8) : rd.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>

                      {/* 6 Penalty Box Role Dropdowns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {roleDefinitions.map((rd) => {
                          const selectedId = boxMap[rd.role] || rd.defaultPlayer?.id || '';
                          return (
                            <div
                              key={rd.role}
                              className="p-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="font-semibold text-slate-200">{rd.label}</span>
                                {selectedId && world.players[selectedId] && (
                                  <span className="font-mono text-emerald-400">
                                    {rd.statLabel(world.players[selectedId])}
                                  </span>
                                )}
                              </div>
                              <select
                                value={selectedId}
                                onChange={(e) => updateBoxRole(rd.role, e.target.value)}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-100"
                              >
                                {candidatePool
                                  .filter((p) => p.positions[0] !== 'GK')
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      #{p.shirtNumber || ''} {p.firstName[0]}. {p.lastName} ({rd.statLabel(p)})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Phase 2: Opposition Instructions (สั่งประกบตัวอันตรายคู่แข่งนัดถัดไป) */}
          {(() => {
            const nextFixture = world.fixtures.find(
              (f) =>
                f.status === 'Scheduled' &&
                (f.homeClubId === club.id || f.awayClubId === club.id)
            );
            const oppClubId = nextFixture
              ? nextFixture.homeClubId === club.id
                ? nextFixture.awayClubId
                : nextFixture.homeClubId
              : Object.keys(world.clubs).find((cid) => cid !== club.id) || club.id;
            const oppClub = world.clubs[oppClubId];
            const oppStarters = (oppClub?.primaryTactic.lineup || [])
              .map((s) => (s.playerId ? world.players[s.playerId] : null))
              .filter((p): p is NonNullable<typeof p> => Boolean(p && p.positions[0] !== 'GK'))
              .slice(0, 6);
            const oiMap = activeTactic.oppositionInstructions || {};

            const updatePlayerOI = (
              playerId: string,
              patch: Partial<OppositionPlayerInstruction>
            ) => {
              const existing: OppositionPlayerInstruction = oiMap[playerId] || {
                playerId,
                tightMarking: 'Default',
                triggerPress: 'Default',
                tackling: 'Normal',
                showOntoFoot: 'Default',
              };
              onUpdateTactic(
                {
                  ...activeTactic,
                  oppositionInstructions: {
                    ...oiMap,
                    [playerId]: { ...existing, ...patch },
                  },
                },
                editingSecondary
              );
            };

            return (
              <div
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
                data-testid="opposition-instructions-panel"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-rose-400">
                      🎯{' '}
                      {tr(
                        `Opposition Instructions vs ${oppClub?.shortName || 'Next Opponent'}`,
                        `สั่งประกบตัวอันตรายคู่แข่ง (${oppClub?.name || 'นัดถัดไป'})`
                      )}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {tr(
                        'Target key opposition playmakers & forwards with tight marking, press triggers, and weak-foot traps.',
                        'สั่งจับตายเพลย์เมกเกอร์และกองหน้าคู่แข่งด้วยประกบติด รุมบีบเร็ว และบีบให้เล่นเท้าไม่ถนัด'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="assman-auto-oi-btn"
                    onClick={() => {
                      soundService.playClick();
                      const nextOi: Record<string, OppositionPlayerInstruction> = { ...oiMap };
                      oppStarters.slice(0, 3).forEach((op) => {
                        nextOi[op.id] = {
                          playerId: op.id,
                          tightMarking: 'Always',
                          triggerPress: 'Always',
                          tackling: 'Hard',
                          showOntoFoot: 'Weak Foot',
                        };
                      });
                      onUpdateTactic(
                        {
                          ...activeTactic,
                          oppositionInstructions: nextOi,
                        },
                        editingSecondary
                      );
                    }}
                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[10px] font-semibold cursor-pointer shrink-0"
                  >
                    ⚡ {tr('AssMan Auto-Mark Threats', 'ให้ผู้ช่วยสั่งประกบตัวอันตราย')}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {oppStarters.map((op, idx) => {
                    const oi: OppositionPlayerInstruction = oiMap[op.id] || {
                      playerId: op.id,
                      tightMarking: 'Default',
                      triggerPress: 'Default',
                      tackling: 'Normal',
                      showOntoFoot: 'Default',
                    };
                    return (
                      <div
                        key={op.id}
                        data-testid={`oi-row-${idx}`}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-[115px]">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[10px]">
                            #{op.shirtNumber || idx + 7} {op.positions[0]}
                          </span>
                          <span className="font-semibold text-white truncate max-w-[90px]">
                            {op.lastName}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              updatePlayerOI(op.id, {
                                tightMarking: oi.tightMarking === 'Always' ? 'Default' : 'Always',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                              oi.tightMarking === 'Always'
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {tr('Tight Mark', 'ประกบติด')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePlayerOI(op.id, {
                                triggerPress: oi.triggerPress === 'Always' ? 'Default' : 'Always',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                              oi.triggerPress === 'Always'
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {tr('Press', 'รุมบีบ')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePlayerOI(op.id, {
                                tackling: oi.tackling === 'Hard' ? 'Normal' : 'Hard',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                              oi.tackling === 'Hard'
                                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {tr('Hard Tackle', 'เข้าหนัก')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updatePlayerOI(op.id, {
                                showOntoFoot:
                                  oi.showOntoFoot === 'Weak Foot' ? 'Default' : 'Weak Foot',
                              })
                            }
                            className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer ${
                              oi.showOntoFoot === 'Weak Foot'
                                ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-bold'
                                : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {tr('Weak Foot', 'บีบเท้าบอด')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

