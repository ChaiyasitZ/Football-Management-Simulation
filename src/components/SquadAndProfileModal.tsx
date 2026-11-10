import React, { useState } from 'react';
import {
  Player,
  PlayerRole,
  PositionGroup,
  WorldState,
} from '../types/game';
import { getAgeAtDate } from '../engine/worldSimulationService';
import { ROLES_BY_POSITION } from '../engine/tacticsEngine';

interface SquadViewProps {
  world: WorldState;
  onSelectPlayer: (playerId: string) => void;
}

export function getPositionGroup(pos: string): PositionGroup {
  if (pos === 'GK') return 'GK';
  if (['DL', 'DR', 'DC', 'WBL', 'WBR'].includes(pos)) return 'DEF';
  if (['DM', 'MC', 'ML', 'MR', 'AMC'].includes(pos)) return 'MID';
  return 'ATT';
}

export const SquadView: React.FC<SquadViewProps> = ({ world, onSelectPlayer }) => {
  const club = world.clubs[world.controlledClubId];
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | PositionGroup>('ALL');
  const [sortBy, setSortBy] = useState<'ca' | 'age' | 'wage' | 'value' | 'rating' | 'goals'>('ca');

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);

  const filtered = clubPlayers
    .filter((p) => {
      if (posFilter !== 'ALL' && getPositionGroup(p.positions[0]) !== posFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q) ||
          p.positions.join('/').toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'ca') return b.currentAbility - a.currentAbility;
      if (sortBy === 'age')
        return getAgeAtDate(a.dateOfBirth, world.gameDate) - getAgeAtDate(b.dateOfBirth, world.gameDate);
      if (sortBy === 'wage') return b.wagePerWeek - a.wagePerWeek;
      if (sortBy === 'value') return b.marketValue - a.marketValue;
      if (sortBy === 'rating') return b.stats.averageRating - a.stats.averageRating;
      return b.stats.goals - a.stats.goals;
    });

  const starterIds = new Set(club.primaryTactic.lineup.map((s) => s.playerId));
  const benchIds = new Set(club.primaryTactic.benchPlayerIds);

  return (
    <div className="space-y-4">
      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {(['ALL', 'GK', 'DEF', 'MID', 'ATT'] as const).map((grp) => (
              <button
                key={grp}
                type="button"
                onClick={() => setPosFilter(grp)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  posFilter === grp
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {grp === 'ALL' ? `ทั้งหมด (${clubPlayers.length})` : grp}
              </button>
            ))}
          </div>

          <input
            type="text"
            aria-label="ค้นหาชื่อนักเตะในทีม"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อนักเตะ, ตำแหน่ง, สัญชาติ..."
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 w-60"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="squad-sort" className="text-xs text-slate-400">
            เรียงตาม:
          </label>
          <select
            id="squad-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
          >
            <option value="ca">ความสามารถปัจจุบัน (Current Ability)</option>
            <option value="value">มูลค่าตลาด (Market Value)</option>
            <option value="wage">ค่าเหนื่อย (Wage)</option>
            <option value="age">อายุ (Age)</option>
            <option value="rating">คะแนนเฉลี่ย (Average Rating)</option>
            <option value="goals">ประตูที่ยิงได้ (Goals)</option>
          </select>
        </div>
      </div>

      {/* Squad Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3">ตำแหน่ง</th>
                <th className="py-2.5 px-3">ชื่อ-นามสกุล</th>
                <th className="py-2.5 px-3">สัญชาติ</th>
                <th className="py-2.5 px-3 text-right">อายุ</th>
                <th className="py-2.5 px-3 text-right">CA (1-20)</th>
                <th className="py-2.5 px-3 text-right">PA ช่วงศักยภาพ</th>
                <th className="py-2.5 px-3 text-right">ความฟิต</th>
                <th className="py-2.5 px-3 text-right">ขวัญกำลังใจ</th>
                <th className="py-2.5 px-3 text-right">ค่าเหนื่อย/สัปดาห์</th>
                <th className="py-2.5 px-3 text-right">มูลค่าตลาด</th>
                <th className="py-2.5 px-3 text-right">นัด/ประตู/แอสซิสต์</th>
                <th className="py-2.5 px-3 text-right">เรตติ้ง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filtered.map((p) => {
                const age = getAgeAtDate(p.dateOfBirth, world.gameDate);
                const isStarter = starterIds.has(p.id);
                const isBench = benchIds.has(p.id);
                const ca20 = (p.currentAbility / 10).toFixed(1);
                const paLow20 = Math.round(p.potentialRange[0] / 10);
                const paHigh20 = Math.round(p.potentialRange[1] / 10);

                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer(p.id)}
                    className="hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {p.injuryStatus.isInjured ? (
                        <span className="text-red-400 font-semibold">INJ ({p.injuryStatus.daysRemaining}d)</span>
                      ) : isStarter ? (
                        <span className="text-emerald-400 font-semibold">XI ตัวจริง</span>
                      ) : isBench ? (
                        <span className="text-sky-400">SUB สำรอง</span>
                      ) : (
                        <span className="text-slate-500">RES</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-200">
                      {p.positions.join(', ')}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-white">
                      {p.firstName} {p.lastName}
                      {p.isYouthAcademy && (
                        <span className="ml-2 text-[10px] text-amber-400 font-mono">U19</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 font-mono">{p.nationalityCode}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {age}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-400">
                      {ca20}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {paLow20}–{paHigh20}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          p.fitness >= 85
                            ? 'text-emerald-400'
                            : p.fitness >= 70
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }
                      >
                        {p.fitness}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                      {p.morale}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      €{p.wagePerWeek.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                      €{(p.marketValue / 1_000_000).toFixed(1)}M
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {p.stats.appearances} / {p.stats.goals} / {p.stats.assists}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-white">
                      {p.stats.appearances > 0 ? p.stats.averageRating.toFixed(2) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

interface PlayerProfileModalProps {
  player: Player;
  world: WorldState;
  onClose: () => void;
  onRenewContract: (playerId: string, wage: number, years: number, bonus: number) => void;
  onMakeTransferOffer: (params: {
    playerId: string;
    offerType: 'Transfer' | 'Loan';
    upfrontFee: number;
    installmentsFee: number;
    sellOnPercentage: number;
    proposedWagePerWeek: number;
    proposedContractYears: number;
    proposedSquadStatus: Player['squadStatus'];
    signingBonus: number;
  }) => void;
  onUpdateIndividualTraining: (
    playerId: string,
    focus: Player['individualTraining']['attributeFocus'],
    roleFocus: PlayerRole,
    intensity: 'Light' | 'Medium' | 'Heavy'
  ) => void;
  onToggleShortlist: (playerId: string) => void;
  onGenerateScoutReport: (playerId: string) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  world,
  onClose,
  onRenewContract,
  onMakeTransferOffer,
  onUpdateIndividualTraining,
  onToggleShortlist,
  onGenerateScoutReport,
}) => {
  const [activeTab, setActiveTab] = useState<'attributes' | 'contract_transfer' | 'development'>('attributes');
  const playerClub = world.clubs[player.clubId];
  const isMyPlayer = player.clubId === world.controlledClubId;
  const age = getAgeAtDate(player.dateOfBirth, world.gameDate);

  // Contract / Transfer form states
  const [offerType, setOfferType] = useState<'Transfer' | 'Loan'>('Transfer');
  const [upfrontFee, setUpfrontFee] = useState(player.askingPrice);
  const [installmentsFee, setInstallmentsFee] = useState(0);
  const [sellOnPct, setSellOnPct] = useState(5);
  const [proposedWage, setProposedWage] = useState(Math.round(player.wagePerWeek * 1.1));
  const [proposedYears, setProposedYears] = useState(4);
  const [proposedStatus, setProposedStatus] = useState<Player['squadStatus']>(player.squadStatus);
  const [signingBonus, setSigningBonus] = useState(Math.round(player.wagePerWeek * 3));

  const scoutReport = world.scoutReports[player.id];
  const isShortlisted = world.shortlistPlayerIds.includes(player.id);

  const renderAttrColor = (val: number) => {
    if (val >= 16) return 'text-emerald-400 font-bold';
    if (val >= 12) return 'text-sky-300 font-semibold';
    if (val >= 9) return 'text-slate-300';
    return 'text-slate-500';
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-profile-title"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950">
          <div>
            <div className="flex items-center gap-3">
              <h2 id="player-profile-title" className="text-2xl font-display font-bold text-white">
                {player.firstName} {player.lastName}
              </h2>
              <span className="text-xs font-mono text-emerald-400">
                {player.positions.join(' / ')} · {player.preferredRole}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
              {playerClub?.name} · สัญชาติ {player.nationalityCode} · อายุ {age} ปี ({player.dateOfBirth}) · เท้าถนัด {player.preferredFoot} · {player.heightCm}cm / {player.weightKg}kg
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isMyPlayer && (
              <button
                type="button"
                onClick={() => onToggleShortlist(player.id)}
                className={`px-3 py-1.5 text-xs rounded-lg border cursor-pointer ${
                  isShortlisted
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {isShortlisted ? '★ อยู่ใน Shortlist' : '☆ เพิ่มเข้า Shortlist'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {[
              { id: 'attributes', label: 'ค่าพลังและสถิติ (Attributes & Overview)' },
              {
                id: 'contract_transfer',
                label: isMyPlayer ? 'ต่อสัญญาและสถานะทีม (Contract)' : 'ยื่นข้อเสนอซื้อขายและรายงานแมวมอง (Transfer & Scout)',
              },
              { id: 'development', label: 'การฝึกซ้อมและพัฒนาการ (Development)' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === t.id
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-xs font-mono tabular-nums text-slate-300">
            มูลค่า: <span className="text-emerald-400 font-semibold">€{(player.marketValue / 1_000_000).toFixed(2)}M</span> · ค่าเหนื่อย: €{player.wagePerWeek.toLocaleString()}/สัปดาห์
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {activeTab === 'attributes' && (
            <>
              {/* 3-Column 1-20 Attributes Grid: Technical, Mental, Physical */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Technical */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-emerald-400 mb-2.5">
                    TECHNICAL ATTRIBUTES (1–20)
                  </h3>
                  <div className="space-y-1 text-xs">
                    {Object.entries(player.attributes.technical).map(([k, val]) => (
                      <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                        <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        <span className={`font-mono tabular-nums ${renderAttrColor(val)}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mental */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-sky-400 mb-2.5">
                    MENTAL ATTRIBUTES (1–20)
                  </h3>
                  <div className="space-y-1 text-xs">
                    {Object.entries(player.attributes.mental).map(([k, val]) => (
                      <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                        <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                        <span className={`font-mono tabular-nums ${renderAttrColor(val)}`}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Physical & Condition */}
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-amber-400 mb-2.5">
                      PHYSICAL ATTRIBUTES (1–20)
                    </h3>
                    <div className="space-y-1 text-xs">
                      {Object.entries(player.attributes.physical).map(([k, val]) => (
                        <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                          <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                          <span className={`font-mono tabular-nums ${renderAttrColor(val)}`}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Condition & Season Summary */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-1.5 text-xs">
                    <h3 className="text-xs font-semibold text-slate-200 mb-2">
                      สถานะสภาพร่างกายและผลงานฤดูกาลนี้
                    </h3>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Current Ability (CA):</span>
                      <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                        {(player.currentAbility / 10).toFixed(1)} / 20.0
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Potential Estimate (PA):</span>
                      <span className="font-mono tabular-nums text-sky-400">
                        {Math.round(player.potentialRange[0] / 10)}–{Math.round(player.potentialRange[1] / 10)} / 20
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ความฟิต / ความพร้อม:</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {player.fitness}% / {player.matchSharpness}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">นิสัย (Personality):</span>
                      <span className="text-slate-200">{player.personality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">สถิติฤดูกาลนี้:</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        ลงเล่น {player.stats.appearances} นัด · {player.stats.goals} ประตู · {player.stats.assists} แอสซิสต์
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'contract_transfer' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Contract Renewal (if my player) or Transfer Offer (if AI club player) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                {isMyPlayer ? (
                  <>
                    <h3 className="text-sm font-semibold text-emerald-400">
                      เจรจาต่อสัญญาฉบับใหม่ (Contract Renewal)
                    </h3>
                    <div className="text-xs text-slate-400">
                      สัญญาปัจจุบันหมดวันที่ {player.contractEndDate} · ค่าเหนื่อยปัจจุบัน €{player.wagePerWeek.toLocaleString()}/สัปดาห์
                    </div>

                    <div>
                      <label htmlFor="ren-wage" className="block text-xs text-slate-400 mb-1">
                        เสนอค่าเหนื่อยใหม่ (€ ต่อสัปดาห์)
                      </label>
                      <input
                        id="ren-wage"
                        type="number"
                        step={500}
                        value={proposedWage}
                        onChange={(e) => setProposedWage(Number(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="ren-years" className="block text-xs text-slate-400 mb-1">
                          ระยะสัญญา (ปี)
                        </label>
                        <select
                          id="ren-years"
                          value={proposedYears}
                          onChange={(e) => setProposedYears(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        >
                          {[1, 2, 3, 4, 5].map((y) => (
                            <option key={y} value={y}>{y} ปี</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ren-bonus" className="block text-xs text-slate-400 mb-1">
                          โบนัสเซ็นสัญญา (€)
                        </label>
                        <input
                          id="ren-bonus"
                          type="number"
                          step={5000}
                          value={signingBonus}
                          onChange={(e) => setSigningBonus(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRenewContract(player.id, proposedWage, proposedYears, signingBonus)}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                    >
                      ยืนยันยื่นข้อเสนอต่อสัญญา
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-emerald-400">
                      ยื่นข้อเสนอซื้อตัว / ยืมตัว ({playerClub?.name})
                    </h3>
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      ราคาประเมินที่สโมสรต้องการ: €{(player.askingPrice / 1_000_000).toFixed(2)}M
                      {player.releaseClause ? ` · ค่าฉีกสัญญา €${(player.releaseClause / 1_000_000).toFixed(2)}M` : ''}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="trf-type" className="block text-xs text-slate-400 mb-1">
                          ประเภทข้อเสนอ
                        </label>
                        <select
                          id="trf-type"
                          value={offerType}
                          onChange={(e) => setOfferType(e.target.value as 'Transfer' | 'Loan')}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        >
                          <option value="Transfer">ซื้อขาด (Permanent Transfer)</option>
                          <option value="Loan">ยืมตัวจนจบฤดูกาล (Loan)</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="trf-upfront" className="block text-xs text-slate-400 mb-1">
                          เงินก้อนแรก Upfront Fee (€)
                        </label>
                        <input
                          id="trf-upfront"
                          type="number"
                          step={100000}
                          value={upfrontFee}
                          onChange={(e) => setUpfrontFee(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="trf-inst" className="block text-xs text-slate-400 mb-1">
                          ผ่อนชำระ Installments (€)
                        </label>
                        <input
                          id="trf-inst"
                          type="number"
                          step={100000}
                          value={installmentsFee}
                          onChange={(e) => setInstallmentsFee(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label htmlFor="trf-sellon" className="block text-xs text-slate-400 mb-1">
                          ส่วนแบ่งขายต่อ Sell-on (%)
                        </label>
                        <input
                          id="trf-sellon"
                          type="number"
                          min={0}
                          max={40}
                          value={sellOnPct}
                          onChange={(e) => setSellOnPct(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="trf-wage" className="block text-xs text-slate-400 mb-1">
                          ค่าเหนื่อยที่เสนอ (€/สัปดาห์)
                        </label>
                        <input
                          id="trf-wage"
                          type="number"
                          step={500}
                          value={proposedWage}
                          onChange={(e) => setProposedWage(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label htmlFor="trf-status" className="block text-xs text-slate-400 mb-1">
                          สถานะในทีม (Squad Status)
                        </label>
                        <select
                          id="trf-status"
                          value={proposedStatus}
                          onChange={(e) => setProposedStatus(e.target.value as Player['squadStatus'])}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        >
                          <option value="Star Player">Star Player</option>
                          <option value="Important Player">Important Player</option>
                          <option value="Regular Starter">Regular Starter</option>
                          <option value="Squad Player">Squad Player</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        onMakeTransferOffer({
                          playerId: player.id,
                          offerType,
                          upfrontFee,
                          installmentsFee,
                          sellOnPercentage: sellOnPct,
                          proposedWagePerWeek: proposedWage,
                          proposedContractYears: proposedYears,
                          proposedSquadStatus: proposedStatus,
                          signingBonus,
                        })
                      }
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                    >
                      ยื่นข้อเสนอซื้อขายและเจรจาสัญญาทันที
                    </button>
                  </>
                )}
              </div>

              {/* Right Column: Scout Report */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-sky-400">
                    รายงานทีมแมวมอง (Scouting Assessment)
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onGenerateScoutReport(player.id)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded cursor-pointer"
                    >
                      ส่องฟอร์มทันที
                    </button>
                  </div>
                </div>

                {scoutReport ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-400">คะแนนแนะนำจากหัวหน้าแมวมอง:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {scoutReport.recommendationScore} / 100
                      </span>
                    </div>
                    <div>
                      <div className="text-emerald-400 font-semibold mb-1">จุดแข็ง (Strengths):</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {scoutReport.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-amber-400 font-semibold mb-1">จุดที่ต้องระวัง (Weaknesses):</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {scoutReport.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-6 text-center">
                    กดปุ่ม "ส่องฟอร์มทันที" เพื่อออกรายงานจุดแข็ง จุดอ่อน และราคาประเมินจากทีมแมวมอง
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'development' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  ตั้งค่าการฝึกซ้อมรายบุคคล (Individual Training)
                </h3>

                <div>
                  <label htmlFor="ind-attr-focus" className="block text-xs text-slate-400 mb-1">
                    Attribute Focus (เน้นพัฒนาทักษะเฉพาะด้าน)
                  </label>
                  <select
                    id="ind-attr-focus"
                    value={player.individualTraining.attributeFocus}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        e.target.value as Player['individualTraining']['attributeFocus'],
                        player.individualTraining.roleFocus,
                        player.individualTraining.intensity
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    <option value="Balanced">Balanced (สมดุลรอบด้าน)</option>
                    <option value="finishing">Finishing (การจบสกอร์)</option>
                    <option value="passing">Passing (การจ่ายบอล)</option>
                    <option value="dribbling">Dribbling (การเลี้ยงบอล)</option>
                    <option value="tackling">Tackling (การเข้าสกัด)</option>
                    <option value="decisions">Decisions (การตัดสินใจ)</option>
                    <option value="vision">Vision (วิสัยทัศน์)</option>
                    <option value="pace">Pace (ความเร็ว)</option>
                    <option value="stamina">Stamina (ความอึด)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ind-role-focus" className="block text-xs text-slate-400 mb-1">
                    Role Focus (ฝึกความชำนาญตามบทบาท)
                  </label>
                  <select
                    id="ind-role-focus"
                    value={player.individualTraining.roleFocus}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        player.individualTraining.attributeFocus,
                        e.target.value as PlayerRole,
                        player.individualTraining.intensity
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    {ROLES_BY_POSITION[player.positions[0]].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="ind-intensity" className="block text-xs text-slate-400 mb-1">
                    ความเข้มข้นในการซ้อม (Training Intensity)
                  </label>
                  <select
                    id="ind-intensity"
                    value={player.individualTraining.intensity}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        player.individualTraining.attributeFocus,
                        player.individualTraining.roleFocus,
                        e.target.value as 'Light' | 'Medium' | 'Heavy'
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  >
                    <option value="Light">Light (ซ้อมเบา รักษาความฟิต)</option>
                    <option value="Medium">Medium (มาตรฐาน)</option>
                    <option value="Heavy">Heavy (ซ้อมหนัก เร่งพัฒนาการ)</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-sky-400">
                  ประวัติการพัฒนาค่าพลัง (Development Log)
                </h3>
                <div className="space-y-2 text-xs">
                  {player.developmentHistory.map((pt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800 font-mono tabular-nums"
                    >
                      <span className="text-slate-400">{pt.date}</span>
                      <span className="text-emerald-400">CA {(pt.ca / 10).toFixed(1)}/20</span>
                      <span className="text-slate-300">
                        {pt.keyAttributeChanges.length > 0
                          ? pt.keyAttributeChanges.map((c) => `${c.attr} +${c.delta}`).join(', ')
                          : 'Initial Assessment'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
