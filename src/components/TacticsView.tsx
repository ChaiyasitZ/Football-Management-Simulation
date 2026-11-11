import React, { useState } from 'react';
import {
  AttackingWidth,
  BuildUpPlay,
  DefensiveLine,
  FormationId,
  LineOfEngagement,
  Mentality,
  PassingDirectness,
  PlayerInstruction,
  PlayerRole,
  PossessionLostInstruction,
  PossessionWonInstruction,
  PressingIntensity,
  TacticalSystem,
  TacklingStyle,
  Tempo,
  TimeWasting,
  WorldState,
} from '../types/game';
import {
  analyzeTacticalRisks,
  autoPickLineup,
  calculatePositionFit,
  evaluateAttributeSynergy,
  evaluatePlayerInjuryRisk,
  evaluateRoleSuitability,
  FORMATION_BLUEPRINTS,
  getRoleProfileInfo,
  ROLES_BY_POSITION,
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
  const activeTactic = editingSecondary ? club.secondaryTactic : club.primaryTactic;

  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(0);
  const [swapSourcePlayerId, setSwapSourcePlayerId] = useState<string | null>(null);

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const alerts = analyzeTacticalRisks(activeTactic, world.players);
  const synergy = evaluateAttributeSynergy(activeTactic, world.players);

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
        {/* Left 5 Cols: Top-Down Pitch View with Phase Overlays & Role Vectors */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300">
              {tr(
                `Pitch Structure (${FORMATION_BLUEPRINTS[activeTactic.formation].name})`,
                `ผังตำแหน่งและการเคลื่อนที่ (${FORMATION_BLUEPRINTS[activeTactic.formation].name})`
              )}
            </h3>
            <span className="text-[11px] text-slate-400">
              {tr(
                'Lines show Press & Def Line; arrows show Role runs',
                'เส้นประแสดงแนวเพรส/แนวรับ ลูกศรแสดงทิศทาง Role'
              )}
            </span>
          </div>

          {/* Interactive SVG/DOM Pitch */}
          <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-slate-700 bg-[#0d4f38] select-none">
            {/* Pitch Markings + Tactical Phase Overlays SVG */}
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
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(52, 211, 153, 0.85)" />
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

              {/* Role Movement Vectors for all 11 slots */}
              {activeTactic.lineup.map((slot) => {
                const profile = getRoleProfileInfo(slot.role);
                const startX = (slot.x / 100) * 300;
                const startY = (slot.y / 100) * 400;
                // Flip horizontal vector for right-sided players cutting inside (e.g., Inverted Wing Back on DR or Inside Forward on AMR)
                const isRightFlank = slot.x > 55;
                const isLeftFlank = slot.x < 45;
                let dx = profile.pitchVector.dx;
                if (isRightFlank && dx > 0) dx = -dx;
                if (!isLeftFlank && !isRightFlank) dx = 0;

                // Apply Individual Instructions overrides (Stay Wider / Cut Inside)
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
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group cursor-pointer transition-transform ${
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
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-slate-950/90 text-[11px] font-medium text-white whitespace-nowrap border border-slate-800">
                    {p ? p.lastName : tr('Empty', 'ว่าง')}
                  </div>
                  <div className="text-[10px] text-emerald-300 bg-slate-950/80 px-1.5 rounded truncate max-w-[96px]">
                    {slot.role}
                  </div>
                </button>
              );
            })}
          </div>
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
        </div>
      </div>
    </div>
  );
};
