import React, { useState } from 'react';
import {
  Player,
  PlayerRole,
  PositionGroup,
  WorldState,
} from '../types/game';
import { getAgeAtDate } from '../engine/worldSimulationService';
import {
  evaluatePlayerInjuryRisk,
  evaluateSquadRegistration,
  isPlayerHomegrownForClub,
  ROLES_BY_POSITION,
} from '../engine/tacticsEngine';
import { useLanguage } from '../i18n/LanguageContext';
import { PlayerAvatar } from './PlayerAvatar';

interface SquadViewProps {
  world: WorldState;
  onSelectPlayer: (playerId: string) => void;
  onToggleRegistration?: (playerId: string) => void;
  onAutoRegisterSquad?: () => void;
  onTogglePlayInReserves?: (playerId: string) => void;
  onUpdateSquadStatus?: (playerId: string, status: Player['squadStatus']) => void;
}

export function getPositionGroup(pos: string): PositionGroup {
  if (pos === 'GK') return 'GK';
  if (['DL', 'DR', 'DC', 'WBL', 'WBR'].includes(pos)) return 'DEF';
  if (['DM', 'MC', 'ML', 'MR', 'AMC'].includes(pos)) return 'MID';
  return 'ATT';
}

export const SquadView: React.FC<SquadViewProps> = ({
  world,
  onSelectPlayer,
  onToggleRegistration,
  onAutoRegisterSquad,
  onTogglePlayInReserves,
  onUpdateSquadStatus,
}) => {
  const { tr } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | PositionGroup>('ALL');
  const [subFilter, setSubFilter] = useState<'ALL' | 'REGISTERED' | 'HOMEGROWN' | 'RESERVES' | 'UNHAPPY'>('ALL');
  const [sortBy, setSortBy] = useState<'ca' | 'fitness' | 'sharpness' | 'morale' | 'age' | 'wage' | 'value' | 'rating'>('ca');

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const regSummary = evaluateSquadRegistration(clubPlayers, club.countryId);

  const avgCondition = Math.round(
    clubPlayers.reduce((sum, p) => sum + p.fitness, 0) / Math.max(1, clubPlayers.length)
  );
  const avgSharpness = Math.round(
    clubPlayers.reduce((sum, p) => sum + p.matchSharpness, 0) / Math.max(1, clubPlayers.length)
  );
  const highRiskPlayersCount = clubPlayers.filter((p) => p.fitness < 70 || p.injuryStatus.isInjured).length;
  const reservesAssignedCount = clubPlayers.filter((p) => p.playInReserves).length;
  const unhappyHierarchyPlayers = clubPlayers.filter(
    (p) =>
      ((p.squadStatus === 'Star Player' || p.squadStatus === 'Important Player') &&
        (p.consecutiveBenched || 0) >= 2) ||
      p.morale < 65
  );

  const filtered = clubPlayers
    .filter((p) => {
      if (posFilter !== 'ALL' && getPositionGroup(p.positions[0]) !== posFilter) {
        return false;
      }
      if (subFilter === 'REGISTERED' && p.isRegistered === false) return false;
      if (subFilter === 'HOMEGROWN' && !isPlayerHomegrownForClub(p, club.countryId)) return false;
      if (subFilter === 'RESERVES' && !p.playInReserves && p.matchSharpness >= 78) return false;
      if (
        subFilter === 'UNHAPPY' &&
        !(((p.squadStatus === 'Star Player' || p.squadStatus === 'Important Player') && (p.consecutiveBenched || 0) >= 2) || p.morale < 65)
      ) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q) ||
          p.positions.join('/').toLowerCase().includes(q) ||
          p.squadStatus.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'ca') return b.currentAbility - a.currentAbility;
      if (sortBy === 'fitness') return a.fitness - b.fitness;
      if (sortBy === 'sharpness') return a.matchSharpness - b.matchSharpness;
      if (sortBy === 'morale') return a.morale - b.morale;
      if (sortBy === 'age')
        return getAgeAtDate(a.dateOfBirth, world.gameDate) - getAgeAtDate(b.dateOfBirth, world.gameDate);
      if (sortBy === 'wage') return b.wagePerWeek - a.wagePerWeek;
      if (sortBy === 'value') return b.marketValue - a.marketValue;
      return b.stats.averageRating - a.stats.averageRating;
    });

  const starterIds = new Set(club.primaryTactic.lineup.map((s) => s.playerId));
  const benchIds = new Set(club.primaryTactic.benchPlayerIds);
  const pressingLoad = club.primaryTactic.instructions.pressingIntensity;

  return (
    <div className="space-y-4">
      {/* Top 4 Squad Management & Registration KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: 25-Man Squad Registration */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr('Squad Registration (Max 25)', 'โควตาลงทะเบียน (สูงสุด 25 คน)')}
            </span>
            <span
              className={`text-[11px] font-mono font-bold ${
                regSummary.isCompliant ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {regSummary.isCompliant
                ? tr('✓ COMPLIANT', '✓ ผ่านเกณฑ์')
                : tr('! QUOTA ALERT', '! เกิน/ไม่ครบโควตา')}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1.5">
            <div className="text-2xl font-display font-bold text-white font-mono tabular-nums">
              {regSummary.registeredCount} / {regSummary.maxSquadSize}
            </div>
            {onAutoRegisterSquad && (
              <button
                type="button"
                onClick={onAutoRegisterSquad}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] rounded cursor-pointer"
              >
                {tr('Auto-Register 25', 'คัด 25 คนอัตโนมัติ')}
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {tr(
              `Non-HG Registered: ${regSummary.registeredCount - regSummary.homegrownRegisteredCount} / 17 max`,
              `โควตานอก HG: ${regSummary.registeredCount - regSummary.homegrownRegisteredCount} / 17 คนสูงสุด`
            )}
          </div>
        </div>

        {/* Card 2: Homegrown Quota (Min 8 Players) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr('Homegrown Players (Min 8 HG)', 'นักเตะท้องถิ่น/ปั้นเอง (ขั้นต่ำ 8 คน)')}
            </span>
            <span className="text-[11px] font-mono text-sky-400">
              {tr(`Club Total: ${regSummary.totalHomegrownInClub} HG`, `ในทีมมี ${regSummary.totalHomegrownInClub} HG`)}
            </span>
          </div>
          <div className="text-2xl font-display font-bold text-sky-400 mt-1.5 font-mono tabular-nums">
            {regSummary.homegrownRegisteredCount} / {regSummary.minHomegrownQuota}{' '}
            <span className="text-xs font-sans font-normal text-slate-400">
              {tr('min required', 'คนขั้นต่ำ')}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {tr(
              'Trained at club (U19 Academy) or in domestic nation',
              'ปั้นจากศูนย์ฝึกเยาวชน (U19) หรือฝึกในประเทศ'
            )}
          </div>
        </div>

        {/* Card 3: Condition, Match Sharpness & Muscle Injury Risk */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr('Condition & Match Sharpness', 'ความฟิต (Condition) & ความเฉียบคม')}
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              {tr(`U23 Active: ${reservesAssignedCount}`, `ส่งเล่นทีมสำรอง: ${reservesAssignedCount}`)}
            </span>
          </div>
          <div className="text-xl font-display font-bold text-white mt-1.5 font-mono tabular-nums">
            {tr(`Cond ${avgCondition}% · Sharp ${avgSharpness}%`, `ฟิต ${avgCondition}% · เฉียบคม ${avgSharpness}%`)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {highRiskPlayersCount > 0 ? (
              <span className="text-amber-400">
                {tr(
                  `▲ ${highRiskPlayersCount} player(s) <70% Cond or Injured (Muscle risk)`,
                  `▲ ${highRiskPlayersCount} คน ความฟิต <70% หรือเจ็บ (เสี่ยงเจ็บกล้ามเนื้อ)`
                )}
              </span>
            ) : (
              tr('All players above 70% Condition threshold', 'นักเตะทุกคนความฟิตเกินเกณฑ์ปลอดภัย 70%')
            )}
          </div>
        </div>

        {/* Card 4: Squad Hierarchy & Playing Time Expectations */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr('Squad Hierarchy & Morale', 'ลำดับความสำคัญ & ขวัญกำลังใจ')}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {tr(
                `Stars: ${clubPlayers.filter((p) => p.squadStatus === 'Star Player').length}`,
                `Star Player: ${clubPlayers.filter((p) => p.squadStatus === 'Star Player').length} คน`
              )}
            </span>
          </div>
          <div className="text-xl font-display font-bold text-white mt-1.5">
            {unhappyHierarchyPlayers.length === 0 ? (
              <span className="text-emerald-400">
                {tr('Harmony Stable', 'ห้องแต่งตัวสงบเรียบร้อย')}
              </span>
            ) : (
              <span className="text-amber-400">
                {tr(
                  `${unhappyHierarchyPlayers.length} Unhappy / Benched`,
                  `${unhappyHierarchyPlayers.length} คนเริ่มไม่พอใจที่ถูกดร็อป`
                )}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {tr(
              'Dropping a Star Player 3 matches in a row tanks Morale',
              'หากดร็อป Star Player สำรอง 3 นัดติด ขวัญกำลังใจจะดิ่งและขอย้ายทีม'
            )}
          </div>
        </div>
      </div>

      {/* Registration Rule Warning Banner (if non-compliant) */}
      {!regSummary.isCompliant && (
        <div className="bg-amber-950/30 border border-amber-500/60 rounded-xl p-3.5 space-y-1">
          {regSummary.issues.map((iss, idx) => (
            <div key={idx} className="text-xs text-amber-300 font-medium">
              ▲ {tr(iss.en, iss.th)}
            </div>
          ))}
        </div>
      )}

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
                {grp === 'ALL' ? `${tr('All', 'ทั้งหมด')} (${clubPlayers.length})` : grp}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            {(
              [
                { id: 'ALL', en: 'All Roster', th: 'ทั้งทีม' },
                { id: 'REGISTERED', en: `Registered (${regSummary.registeredCount}/25)`, th: `ลงทะเบียน (${regSummary.registeredCount}/25)` },
                { id: 'HOMEGROWN', en: `Homegrown (${regSummary.totalHomegrownInClub})`, th: `Homegrown (${regSummary.totalHomegrownInClub})` },
                { id: 'RESERVES', en: 'Low Sharpness / U23', th: 'ขาดความเฉียบคม / สำรอง U23' },
                { id: 'UNHAPPY', en: 'Hierarchy Alert', th: 'ถูกดร็อป / กังวล' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSubFilter(f.id)}
                className={`px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                  subFilter === f.id
                    ? 'bg-slate-800 text-emerald-400 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tr(f.en, f.th)}
              </button>
            ))}
          </div>

          <input
            type="text"
            aria-label={tr('Search squad players', 'ค้นหาชื่อนักเตะในทีม')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Search name, position, hierarchy...', 'ค้นหาชื่อนักเตะ, ตำแหน่ง, สถานะ...')}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 w-52"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="squad-sort" className="text-xs text-slate-400">
            {tr('Sort by:', 'เรียงตาม:')}
          </label>
          <select
            id="squad-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
          >
            <option value="ca">{tr('Current Ability (CA)', 'ความสามารถปัจจุบัน (CA)')}</option>
            <option value="fitness">{tr('Condition (Lowest First)', 'ความฟิต Condition (น้อยไปมาก)')}</option>
            <option value="sharpness">{tr('Match Sharpness (Lowest First)', 'ความเฉียบคม Sharpness (น้อยไปมาก)')}</option>
            <option value="morale">{tr('Morale (Lowest First)', 'ขวัญกำลังใจ (น้อยไปมาก)')}</option>
            <option value="value">{tr('Market Value', 'มูลค่าตลาด')}</option>
            <option value="wage">{tr('Weekly Wage', 'ค่าเหนื่อย')}</option>
            <option value="age">{tr('Age', 'อายุ')}</option>
            <option value="rating">{tr('Average Rating', 'คะแนนเฉลี่ย')}</option>
          </select>
        </div>
      </div>

      {/* Squad Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">{tr('Reg (25)', 'ลงทะเบียน')}</th>
                <th className="py-2.5 px-3">{tr('Squad Role / U23', 'สถานะลงสนาม / ทีมสำรอง')}</th>
                <th className="py-2.5 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2.5 px-3">{tr('Player Name & Quota', 'ชื่อนักเตะ & โควตา')}</th>
                <th className="py-2.5 px-3">{tr('Hierarchy Expectation', 'บทบาทคาดหวัง (Hierarchy)')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Age', 'อายุ')}</th>
                <th className="py-2.5 px-3 text-right">CA / PA</th>
                <th className="py-2.5 px-3 text-right">{tr('Condition', 'ความฟิต')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Sharpness', 'ความเฉียบคม')}</th>
                <th className="py-2.5 px-3">{tr('Injury Risk', 'โอกาสบาดเจ็บ')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Morale', 'กำลังใจ')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Apps/G/A', 'นัด/ประตู/แอสซิสต์')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Avg Rat', 'เรตติ้ง')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filtered.map((p) => {
                const age = getAgeAtDate(p.dateOfBirth, world.gameDate);
                const isStarter = starterIds.has(p.id);
                const isBench = benchIds.has(p.id);
                const isReg = p.isRegistered !== false;
                const isHg = isPlayerHomegrownForClub(p, club.countryId);
                const ca20 = (p.currentAbility / 10).toFixed(1);
                const paHigh20 = Math.round(p.potentialRange[1] / 10);
                const injRisk = evaluatePlayerInjuryRisk(p, pressingLoad);
                const benchedCount = p.consecutiveBenched || 0;
                const isDroppedStar =
                  (p.squadStatus === 'Star Player' || p.squadStatus === 'Important Player') &&
                  benchedCount >= 2;

                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer(p.id)}
                    className="hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    {/* Registration Toggle */}
                    <td className="py-2.5 px-3 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onToggleRegistration?.(p.id)}
                        aria-label={`${isReg ? 'Unregister' : 'Register'} ${p.firstName} ${p.lastName}`}
                        className={`px-2 py-1 rounded text-[11px] font-mono font-semibold cursor-pointer transition-colors ${
                          isReg
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-950 text-slate-500 border border-slate-800 hover:text-slate-300'
                        }`}
                      >
                        {isReg ? 'REG' : 'OUT'}
                      </button>
                    </td>

                    {/* Squad Lineup Status + Reserve U23 Sharpness Toggle */}
                    <td className="py-2.5 px-3 font-mono text-[11px]" onClick={(e) => e.stopPropagation()}>
                      {p.injuryStatus.isInjured ? (
                        <span className="text-red-400 font-semibold">
                          INJ ({p.injuryStatus.daysRemaining}d)
                        </span>
                      ) : isStarter ? (
                        <span className="text-emerald-400 font-semibold">
                          {tr('XI Starter', '11 ตัวจริง')}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className={isBench ? 'text-sky-400' : 'text-slate-500'}>
                            {isBench ? 'SUB' : 'RES'}
                          </span>
                          {onTogglePlayInReserves && (
                            <button
                              type="button"
                              onClick={() => onTogglePlayInReserves(p.id)}
                              title={tr(
                                'Send to Reserves / U23 to recover Match Sharpness',
                                'ส่งลงเล่นทีมสำรอง (U23) เพื่อเรียกความเฉียบคม (Match Sharpness)'
                              )}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-sans cursor-pointer border ${
                                p.playInReserves
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-semibold'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {p.playInReserves
                                ? tr('U23: ON', 'สำรอง: ลงเล่น')
                                : tr('Send U23', 'ส่งเรียกฟิต')}
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 font-mono text-slate-200">
                      {p.positions.join(', ')}
                    </td>

                    <td className="py-2 px-3 font-medium text-white">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar player={p} club={club} size="sm" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span>
                              {p.firstName} {p.lastName}
                            </span>
                            {isHg && (
                              <span
                                title={tr('Homegrown Player (Counts toward 8 HG quota)', 'นักเตะโควตาท้องถิ่น/ปั้นเอง (Homegrown)')}
                                className="text-[10px] font-mono text-sky-400 font-semibold"
                              >
                                · HG
                              </span>
                            )}
                            {p.isYouthAcademy && (
                              <span className="text-[10px] font-mono text-amber-400">· U19</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {p.nationalityCode} · {p.preferredRole}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Squad Hierarchy & Consecutive Benched Warning */}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-0.5">
                        {onUpdateSquadStatus ? (
                          <select
                            aria-label={`Hierarchy status for ${p.firstName} ${p.lastName}`}
                            value={p.squadStatus}
                            onChange={(e) =>
                              onUpdateSquadStatus(p.id, e.target.value as Player['squadStatus'])
                            }
                            className={`bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] ${
                              p.squadStatus === 'Star Player'
                                ? 'text-amber-300 font-semibold'
                                : p.squadStatus === 'Important Player'
                                  ? 'text-emerald-300'
                                  : 'text-slate-300'
                            }`}
                          >
                            <option value="Star Player">Star Player</option>
                            <option value="Important Player">Important Player</option>
                            <option value="Regular Starter">Regular Starter</option>
                            <option value="Squad Player">Squad Rotation</option>
                            <option value="Breakthrough Prospect">Breakthrough</option>
                            <option value="Youth">Youth / Backup</option>
                          </select>
                        ) : (
                          <span className="text-slate-300">{p.squadStatus}</span>
                        )}
                        {benchedCount >= 2 && (
                          <span
                            className={`text-[10px] font-mono ${
                              isDroppedStar ? 'text-red-400 font-semibold' : 'text-amber-400'
                            }`}
                          >
                            {tr(
                              `Dropped ${benchedCount}x in a row`,
                              `สำรอง ${benchedCount} นัดติด`
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {age}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className="font-semibold text-emerald-400">{ca20}</span>
                      <span className="text-slate-500"> / {paHigh20}</span>
                    </td>

                    {/* Condition (Stamina) */}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          p.fitness >= 85
                            ? 'text-emerald-400 font-semibold'
                            : p.fitness >= 70
                              ? 'text-amber-400'
                              : 'text-red-400 font-bold'
                        }
                      >
                        {p.fitness}%
                      </span>
                    </td>

                    {/* Match Sharpness */}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          p.matchSharpness >= 82
                            ? 'text-sky-300'
                            : p.matchSharpness >= 72
                              ? 'text-amber-300'
                              : 'text-red-400 font-semibold'
                        }
                      >
                        {p.matchSharpness}%
                      </span>
                    </td>

                    {/* Muscle Injury Risk */}
                    <td className="py-2.5 px-3 text-[11px]">
                      <span
                        className={
                          injRisk.level === 'Critical'
                            ? 'text-red-400 font-semibold'
                            : injRisk.level === 'High'
                              ? 'text-amber-400 font-semibold'
                              : injRisk.level === 'Moderate'
                                ? 'text-slate-300'
                                : 'text-emerald-400/90'
                        }
                      >
                        {tr(injRisk.labelEn, injRisk.labelTh)}
                      </span>
                    </td>

                    {/* Morale */}
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span
                        className={
                          p.morale >= 80
                            ? 'text-emerald-400'
                            : p.morale >= 65
                              ? 'text-slate-200'
                              : 'text-red-400 font-semibold'
                        }
                      >
                        {p.morale}%
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {p.stats.appearances}/{p.stats.goals}/{p.stats.assists}
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
  const { tr, trDynamic } = useLanguage();
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
          <div className="flex items-center gap-4">
            <PlayerAvatar player={player} club={playerClub} size="xl" className="ring-2 ring-emerald-500/40" />
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
                {playerClub?.name} · {tr('Nat:', 'สัญชาติ')} {player.nationalityCode} · {tr(`Age ${age}`, `อายุ ${age} ปี`)} ({player.dateOfBirth}) · {tr('Foot:', 'เท้าถนัด')} {player.preferredFoot} · {player.heightCm}cm / {player.weightKg}kg
              </div>
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
                {isShortlisted
                  ? tr('★ Shortlisted', '★ อยู่ใน Shortlist')
                  : tr('☆ Add to Shortlist', '☆ เพิ่มเข้า Shortlist')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
            >
              {tr('Close', 'ปิดหน้าต่าง')}
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-6 py-2.5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {[
              { id: 'attributes', label: tr('Attributes & Overview', 'ค่าพลังและสถิติ (Attributes & Overview)') },
              {
                id: 'contract_transfer',
                label: isMyPlayer
                  ? tr('Contract & Status', 'ต่อสัญญาและสถานะทีม (Contract)')
                  : tr('Transfer Offer & Scout Report', 'ยื่นข้อเสนอซื้อขายและรายงานแมวมอง (Transfer & Scout)'),
              },
              { id: 'development', label: tr('Training & Development', 'การฝึกซ้อมและพัฒนาการ (Development)') },
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
            {tr('Value:', 'มูลค่า:')}{' '}
            <span className="text-emerald-400 font-semibold">€{(player.marketValue / 1_000_000).toFixed(2)}M</span> ·{' '}
            {tr('Wage:', 'ค่าเหนื่อย:')} €{player.wagePerWeek.toLocaleString()}/{tr('wk', 'สัปดาห์')}
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
                      {tr('Condition & Season Summary', 'สถานะสภาพร่างกายและผลงานฤดูกาลนี้')}
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
                      <span className="text-slate-400">{tr('Fitness / Sharpness:', 'ความฟิต / ความพร้อม:')}</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {player.fitness}% / {player.matchSharpness}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{tr('Personality:', 'นิสัย (Personality):')}</span>
                      <span className="text-slate-200">{player.personality}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">{tr('Season Stats:', 'สถิติฤดูกาลนี้:')}</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {tr(
                          `${player.stats.appearances} apps · ${player.stats.goals} goals · ${player.stats.assists} assists`,
                          `ลงเล่น ${player.stats.appearances} นัด · ${player.stats.goals} ประตู · ${player.stats.assists} แอสซิสต์`
                        )}
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
                      {tr('Contract Renewal Negotiation', 'เจรจาต่อสัญญาฉบับใหม่ (Contract Renewal)')}
                    </h3>
                    <div className="text-xs text-slate-400">
                      {tr(
                        `Current contract expires ${player.contractEndDate} · Current wage €${player.wagePerWeek.toLocaleString()}/wk`,
                        `สัญญาปัจจุบันหมดวันที่ ${player.contractEndDate} · ค่าเหนื่อยปัจจุบัน €${player.wagePerWeek.toLocaleString()}/สัปดาห์`
                      )}
                    </div>

                    <div>
                      <label htmlFor="ren-wage" className="block text-xs text-slate-400 mb-1">
                        {tr('Proposed Weekly Wage (€/wk)', 'เสนอค่าเหนื่อยใหม่ (€ ต่อสัปดาห์)')}
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
                          {tr('Contract Length (Years)', 'ระยะสัญญา (ปี)')}
                        </label>
                        <select
                          id="ren-years"
                          value={proposedYears}
                          onChange={(e) => setProposedYears(Number(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        >
                          {[1, 2, 3, 4, 5].map((y) => (
                            <option key={y} value={y}>{y} {tr(y > 1 ? 'Years' : 'Year', 'ปี')}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="ren-bonus" className="block text-xs text-slate-400 mb-1">
                          {tr('Signing Bonus (€)', 'โบนัสเซ็นสัญญา (€)')}
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
                      {tr('Submit Contract Renewal Offer', 'ยืนยันยื่นข้อเสนอต่อสัญญา')}
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold text-emerald-400">
                      {tr(`Make Transfer / Loan Offer (${playerClub?.name})`, `ยื่นข้อเสนอซื้อตัว / ยืมตัว (${playerClub?.name})`)}
                    </h3>
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      {tr('Asking Price:', 'ราคาประเมินที่สโมสรต้องการ:')} €{(player.askingPrice / 1_000_000).toFixed(2)}M
                      {player.releaseClause
                        ? ` · ${tr('Release Clause:', 'ค่าฉีกสัญญา')} €${(player.releaseClause / 1_000_000).toFixed(2)}M`
                        : ''}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="trf-type" className="block text-xs text-slate-400 mb-1">
                          {tr('Offer Type', 'ประเภทข้อเสนอ')}
                        </label>
                        <select
                          id="trf-type"
                          value={offerType}
                          onChange={(e) => setOfferType(e.target.value as 'Transfer' | 'Loan')}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                        >
                          <option value="Transfer">{tr('Permanent Transfer', 'ซื้อขาด (Permanent Transfer)')}</option>
                          <option value="Loan">{tr('Season Loan', 'ยืมตัวจนจบฤดูกาล (Loan)')}</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="trf-upfront" className="block text-xs text-slate-400 mb-1">
                          {tr('Upfront Fee (€)', 'เงินก้อนแรก Upfront Fee (€)')}
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
                          {tr('Installments (€)', 'ผ่อนชำระ Installments (€)')}
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
                          {tr('Sell-on Clause (%)', 'ส่วนแบ่งขายต่อ Sell-on (%)')}
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
                          {tr('Proposed Wage (€/wk)', 'ค่าเหนื่อยที่เสนอ (€/สัปดาห์)')}
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
                          {tr('Squad Status', 'สถานะในทีม (Squad Status)')}
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
                      {tr('Submit Transfer Offer & Negotiate Contract', 'ยื่นข้อเสนอซื้อขายและเจรจาสัญญาทันที')}
                    </button>
                  </>
                )}
              </div>

              {/* Right Column: Scout Report */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-sky-400">
                    {tr('Scouting Assessment', 'รายงานทีมแมวมอง (Scouting Assessment)')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onGenerateScoutReport(player.id)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded cursor-pointer"
                    >
                      {tr('Scout Player', 'ส่องฟอร์มทันที')}
                    </button>
                  </div>
                </div>

                {scoutReport ? (
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center justify-between p-2.5 rounded bg-slate-900 border border-slate-800">
                      <span className="text-slate-400">{tr('Chief Scout Recommendation:', 'คะแนนแนะนำจากหัวหน้าแมวมอง:')}</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {scoutReport.recommendationScore} / 100
                      </span>
                    </div>
                    <div>
                      <div className="text-emerald-400 font-semibold mb-1">{tr('Strengths:', 'จุดแข็ง (Strengths):')}</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {scoutReport.strengths.map((s, i) => (
                          <li key={i}>{trDynamic(s)}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-amber-400 font-semibold mb-1">{tr('Weaknesses:', 'จุดที่ต้องระวัง (Weaknesses):')}</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                        {scoutReport.weaknesses.map((w, i) => (
                          <li key={i}>{trDynamic(w)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 py-6 text-center">
                    {tr(
                      'Click "Scout Player" to generate a full assessment of strengths, weaknesses, and valuation.',
                      'กดปุ่ม "ส่องฟอร์มทันที" เพื่อออกรายงานจุดแข็ง จุดอ่อน และราคาประเมินจากทีมแมวมอง'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'development' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  {tr('Individual Training Regimen', 'ตั้งค่าการฝึกซ้อมรายบุคคล (Individual Training)')}
                </h3>

                <div>
                  <label htmlFor="ind-attr-focus" className="block text-xs text-slate-400 mb-1">
                    {tr('Attribute Focus', 'Attribute Focus (เน้นพัฒนาทักษะเฉพาะด้าน)')}
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
                    <option value="Balanced">{tr('Balanced', 'Balanced (สมดุลรอบด้าน)')}</option>
                    <option value="finishing">{tr('Finishing', 'Finishing (การจบสกอร์)')}</option>
                    <option value="passing">{tr('Passing', 'Passing (การจ่ายบอล)')}</option>
                    <option value="dribbling">{tr('Dribbling', 'Dribbling (การเลี้ยงบอล)')}</option>
                    <option value="tackling">{tr('Tackling', 'Tackling (การเข้าสกัด)')}</option>
                    <option value="decisions">{tr('Decisions', 'Decisions (การตัดสินใจ)')}</option>
                    <option value="vision">{tr('Vision', 'Vision (วิสัยทัศน์)')}</option>
                    <option value="pace">{tr('Pace', 'Pace (ความเร็ว)')}</option>
                    <option value="stamina">{tr('Stamina', 'Stamina (ความอึด)')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="ind-role-focus" className="block text-xs text-slate-400 mb-1">
                    {tr('Role Focus', 'Role Focus (ฝึกความชำนาญตามบทบาท)')}
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
                    {tr('Training Intensity', 'ความเข้มข้นในการซ้อม (Training Intensity)')}
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
                    <option value="Light">{tr('Light (Recovery & Fitness)', 'Light (ซ้อมเบา รักษาความฟิต)')}</option>
                    <option value="Medium">{tr('Medium (Standard)', 'Medium (มาตรฐาน)')}</option>
                    <option value="Heavy">{tr('Heavy (Accelerated Growth)', 'Heavy (ซ้อมหนัก เร่งพัฒนาการ)')}</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-sky-400">
                  {tr('Attribute Development Log', 'ประวัติการพัฒนาค่าพลัง (Development Log)')}
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
