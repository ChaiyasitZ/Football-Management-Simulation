import React, { useState } from 'react';
import {
  AttackingWidth,
  BuildUpPlay,
  DefensiveLine,
  FormationId,
  LineOfEngagement,
  Mentality,
  PassingDirectness,
  Player,
  PlayerInstruction,
  PlayerRole,
  PressingIntensity,
  TacticalSystem,
  TacklingStyle,
  Tempo,
  TimeWasting,
  TransitionInstruction,
  WorldState,
} from '../types/game';
import {
  analyzeTacticalRisks,
  autoPickLineup,
  calculatePositionFit,
  evaluateRoleSuitability,
  FORMATION_BLUEPRINTS,
  ROLES_BY_POSITION,
} from '../engine/tacticsEngine';
import { soundService } from '../engine/soundService';

interface TacticsViewProps {
  world: WorldState;
  onUpdateTactic: (tactic: TacticalSystem, isSecondary?: boolean) => void;
  onSelectPlayer: (playerId: string) => void;
}

const ALL_PLAYER_INSTRUCTIONS: PlayerInstruction[] = [
  'Dribble More',
  'Dribble Less',
  'Shoot More',
  'Shoot Less',
  'Take More Risks',
  'Hold Position',
  'Roam From Position',
  'Stay Wider',
  'Cut Inside',
  'Cross More Often',
  'Mark Tighter',
  'Trigger Press More',
  'Trigger Press Less',
];

export const TacticsView: React.FC<TacticsViewProps> = ({
  world,
  onUpdateTactic,
  onSelectPlayer,
}) => {
  const club = world.clubs[world.controlledClubId];
  const [editingSecondary, setEditingSecondary] = useState(false);
  const activeTactic = editingSecondary ? club.secondaryTactic : club.primaryTactic;

  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(0);
  const [swapSourcePlayerId, setSwapSourcePlayerId] = useState<string | null>(null);

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const alerts = analyzeTacticalRisks(activeTactic, world.players);

  const handleFormationChange = (newFormation: FormationId) => {
    soundService.playClick();
    const updated = autoPickLineup(
      newFormation,
      clubPlayers,
      activeTactic.instructions,
      activeTactic.id,
      `${newFormation} System`
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
      activeTactic.name
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
    const newLineup = activeTactic.lineup.map((s, idx) =>
      idx === slotIndex ? { ...s, role } : s
    );
    onUpdateTactic({ ...activeTactic, lineup: newLineup }, editingSecondary);
  };

  const handleTogglePlayerInstruction = (slotIndex: number, inst: PlayerInstruction) => {
    const newLineup = activeTactic.lineup.map((s, idx) => {
      if (idx !== slotIndex) return s;
      const exists = s.instructions.includes(inst);
      return {
        ...s,
        instructions: exists
          ? s.instructions.filter((i) => i !== inst)
          : [...s.instructions, inst],
      };
    });
    onUpdateTactic({ ...activeTactic, lineup: newLineup }, editingSecondary);
  };

  const selectedSlot =
    selectedSlotIdx !== null ? activeTactic.lineup[selectedSlotIdx] : null;
  const selectedSlotPlayer =
    selectedSlot?.playerId ? world.players[selectedSlot.playerId] : null;

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Preset Switcher, Formation Picker & Auto-Pick */}
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
              แผนหลัก (Primary: {club.primaryTactic.formation})
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
              แผนสำรอง (Alternative: {club.secondaryTactic.formation})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="formation-select" className="text-xs text-slate-400">
              Formation:
            </label>
            <select
              id="formation-select"
              value={activeTactic.formation}
              onChange={(e) => handleFormationChange(e.target.value as FormationId)}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
            >
              {(Object.keys(FORMATION_BLUEPRINTS) as FormationId[]).map((fId) => (
                <option key={fId} value={fId}>
                  {FORMATION_BLUEPRINTS[fId].name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            ความเข้าใจแท็กติก (Familiarity):{' '}
            <span className="text-emerald-400 font-semibold">{activeTactic.familiarity}%</span>
          </div>
          <button
            type="button"
            onClick={handleAutoPick}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            จัด 11 ตัวจริงอัตโนมัติ (Auto-Pick Best XI)
          </button>
        </div>
      </div>

      {/* Tactical Risk Analyzer Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
        <div className="text-xs font-semibold text-slate-300">
          การวิเคราะห์โครงสร้างแท็กติกและความเสี่ยง (Tactical Analysis)
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
            <span>{al.level === 'warning' ? '▲ คำเตือน:' : al.level === 'optimal' ? '✓ สมดุล:' : 'ℹ ข้อมูล:'}</span>
            <span>{al.message}</span>
          </div>
        ))}
      </div>

      {/* Main 3-Column Tactics Grid: Top-Down Pitch + Starting XI/Swap + Team & Player Instructions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: Top-Down Pitch View */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300">
              ผังตำแหน่งในสนาม ({FORMATION_BLUEPRINTS[activeTactic.formation].name})
            </h3>
            <span className="text-[11px] text-slate-400">
              คลิกที่นักเตะในสนามเพื่อปรับ Role หรือสลับตำแหน่ง
            </span>
          </div>

          {/* Interactive SVG/DOM Pitch */}
          <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden border border-slate-700 bg-[#0d4f38] select-none">
            {/* Pitch Markings SVG */}
            <svg viewBox="0 0 300 400" className="absolute inset-0 w-full h-full pointer-events-none">
              <rect x="12" y="12" width="276" height="376" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <line x1="12" y1="200" x2="288" y2="200" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <circle cx="150" cy="200" r="36" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <rect x="65" y="12" width="170" height="55" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
              <rect x="65" y="333" width="170" height="55" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
            </svg>

            {/* 11 Player Nodes on Pitch */}
            {activeTactic.lineup.map((slot, idx) => {
              const p = slot.playerId ? world.players[slot.playerId] : null;
              const isSelected = selectedSlotIdx === idx;
              const isSwapSource = p && swapSourcePlayerId === p.id;
              const posFit = p ? calculatePositionFit(p, slot.position) : 1;

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
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-mono text-xs font-bold border-2 shadow-md ${
                      isSwapSource
                        ? 'bg-amber-400 text-slate-950 border-white'
                        : isSelected
                          ? 'bg-emerald-400 text-slate-950 border-white'
                          : posFit < 0.75
                            ? 'bg-amber-600 text-white border-amber-200'
                            : 'bg-slate-950 text-white border-emerald-400'
                    }`}
                  >
                    {slot.position}
                  </div>
                  <div className="mt-1 px-2 py-0.5 rounded bg-slate-950/90 text-[11px] font-medium text-white whitespace-nowrap border border-slate-800">
                    {p ? p.lastName : 'ว่าง'}
                  </div>
                  <div className="text-[10px] text-emerald-300 bg-slate-950/80 px-1.5 rounded truncate max-w-[92px]">
                    {slot.role}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center 4 Cols: Starting XI & Substitutes Table with Click-to-Swap */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[640px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300">
              11 ตัวจริงและตัวสำรอง (คลิกปุ่ม "สลับ" เพื่อเปลี่ยนตัว)
            </h3>
            {swapSourcePlayerId && (
              <button
                type="button"
                onClick={() => setSwapSourcePlayerId(null)}
                className="text-xs text-amber-400 hover:underline cursor-pointer"
              >
                ยกเลิกการสลับ
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="text-[11px] font-semibold text-emerald-400 py-1">
              ผู้เล่น 11 ตัวจริง (Starting XI)
            </div>
            {activeTactic.lineup.map((slot, idx) => {
              const p = slot.playerId ? world.players[slot.playerId] : null;
              if (!p) return null;
              const fit = calculatePositionFit(p, slot.position);
              const roleStars = evaluateRoleSuitability(p, slot.role);
              const isSwapActive = swapSourcePlayerId === p.id;

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
                      className={`font-mono font-semibold w-8 text-left ${
                        fit < 0.75 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {slot.position}
                    </span>
                    <div className="truncate">
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
                      <div className="text-[11px] text-slate-400 truncate">
                        {slot.role} · Role {roleStars}/20 · Fit {p.fitness}%
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
                    {isSwapActive ? 'เลือกอยู่' : swapSourcePlayerId ? 'แทนที่' : 'สลับ'}
                  </button>
                </div>
              );
            })}

            <div className="text-[11px] font-semibold text-sky-400 pt-3 pb-1">
              ผู้เล่นสำรองข้างสนาม (Substitutes Bench)
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
                    <span className="font-mono text-slate-400 w-8">{p.positions[0]}</span>
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(p.id)}
                      className="text-slate-200 hover:text-emerald-400 truncate cursor-pointer"
                    >
                      {p.firstName} {p.lastName}
                    </button>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      CA {Math.round(p.currentAbility / 10)}/20 · Fit {p.fitness}%
                    </span>
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
                    {isSwapActive ? 'เลือกอยู่' : swapSourcePlayerId ? 'ส่งลงตัวจริง' : 'สลับ'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 3 Cols: Team Instructions & Selected Slot Player Instructions */}
        <div className="lg:col-span-3 space-y-4">
          {/* Team Instructions Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-emerald-400">
              คำสั่งแท็กติกทีม (Team Instructions)
            </h3>

            <div>
              <label htmlFor="ti-mentality" className="block text-[11px] text-slate-400 mb-1">
                Mentality (หัวใจการเล่น)
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
                {(['Very Defensive', 'Defensive', 'Cautious', 'Balanced', 'Positive', 'Attacking', 'Very Attacking'] as Mentality[]).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ti-passing" className="block text-[11px] text-slate-400 mb-1">
                  Passing Directness
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
                  {(['Much Shorter', 'Shorter', 'Mixed', 'More Direct', 'Much More Direct'] as PassingDirectness[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ti-tempo" className="block text-[11px] text-slate-400 mb-1">
                  Tempo (จังหวะเกม)
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
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Much Lower', 'Lower', 'Standard', 'Higher', 'Much Higher'] as Tempo[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ti-width" className="block text-[11px] text-slate-400 mb-1">
                  Attacking Width
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
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Narrow', 'Standard', 'Wide'] as AttackingWidth[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ti-buildup" className="block text-[11px] text-slate-400 mb-1">
                  Build-Up Play
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
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ti-press" className="block text-[11px] text-slate-400 mb-1">
                  Pressing Intensity
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
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Low', 'Standard', 'High', 'Very High'] as PressingIntensity[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ti-defline" className="block text-[11px] text-slate-400 mb-1">
                  Defensive Line
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
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Deep', 'Standard', 'High', 'Very High'] as DefensiveLine[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ti-transition" className="block text-[11px] text-slate-400 mb-1">
                  Transition
                </label>
                <select
                  id="ti-transition"
                  value={activeTactic.instructions.transition}
                  onChange={(e) =>
                    onUpdateTactic(
                      {
                        ...activeTactic,
                        instructions: {
                          ...activeTactic.instructions,
                          transition: e.target.value as TransitionInstruction,
                        },
                      },
                      editingSecondary
                    )
                  }
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Counter-Press', 'Regroup', 'Counter', 'Hold Shape'] as TransitionInstruction[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ti-tackling" className="block text-[11px] text-slate-400 mb-1">
                  Tackling
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
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ti-engagement" className="block text-[11px] text-slate-400 mb-1">
                  Line of Engagement
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
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="ti-timewasting" className="block text-[11px] text-slate-400 mb-1">
                  Time Wasting
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
                  className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {(['Never', 'Sometimes', 'Often'] as TimeWasting[]).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Individual Player Role & Instructions Card */}
          {selectedSlot && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-sky-400">
                คำสั่งรายบุคคล: {selectedSlot.position} —{' '}
                {selectedSlotPlayer
                  ? `${selectedSlotPlayer.firstName} ${selectedSlotPlayer.lastName}`
                  : 'ว่าง'}
              </div>

              <div>
                <label htmlFor="pi-role" className="block text-[11px] text-slate-400 mb-1">
                  บทบาทในสนาม (Player Role)
                </label>
                <select
                  id="pi-role"
                  value={selectedSlot.role}
                  onChange={(e) =>
                    handleRoleChange(selectedSlot.slotIndex, e.target.value as PlayerRole)
                  }
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-slate-100"
                >
                  {ROLES_BY_POSITION[selectedSlot.position].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1.5">
                  Player Instructions (เลือกคำสั่งเฉพาะตัว)
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
