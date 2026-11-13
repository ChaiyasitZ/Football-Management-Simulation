import React, { useState } from 'react';
import {
  Player,
  PlayerRole,
  PositionGroup,
  WorldState,
} from '../types/game';
import { getAgeAtDate } from '../engine/worldSimulationService';
import {
  computePlayerPolygon8Axes,
  computeSquadDepthChart,
  derivePlayerTraitsFromAttributes,
  evaluatePlayerInjuryRisk,
  evaluateSquadRegistration,
  isPlayerHomegrownForClub,
  PLAYER_TRAIT_CATALOG,
  ROLES_BY_POSITION,
} from '../engine/tacticsEngine';
import { useLanguage } from '../i18n/LanguageContext';
import { PlayerAvatar } from './PlayerAvatar';

interface SquadViewProps {
  world: WorldState;
  onSelectPlayer: (playerId: string) => void;
  onQuickPeekPlayer?: (playerId: string) => void;
  initialViewMode?: 'table' | 'planner';
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
  onQuickPeekPlayer,
  initialViewMode = 'table',
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
  const [viewMode, setViewMode] = useState<'table' | 'planner'>(initialViewMode);
  const [tablePreset, setTablePreset] = useState<'ALL' | 'OVERVIEW' | 'CONDITION' | 'CONTRACT' | 'STATS'>('ALL');

  React.useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const regSummary = evaluateSquadRegistration(clubPlayers, club.countryId);
  const depthChart = computeSquadDepthChart(
    clubPlayers,
    parseInt(world.gameDate.slice(0, 4), 10) || 2026
  );

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

      {/* Filter & Search Bar + Squad Table / Depth Chart Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Switcher: Squad Table vs FM27 Squad Planner & Depth Chart */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tr('Squad Roster Table', 'ตารางขุมกำลัง (Squad Table)')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('planner')}
              data-testid="squad-planner-toggle-btn"
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'planner'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tr('Squad Planner & Depth Chart', 'ผังความลึกขุมกำลัง (Depth Chart)')}
            </button>
          </div>

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

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="squad-preset" className="text-xs text-slate-400">
            {tr('View:', 'มุมมอง:')}
          </label>
          <select
            id="squad-preset"
            data-testid="squad-view-preset-select"
            value={tablePreset}
            onChange={(e) => setTablePreset(e.target.value as typeof tablePreset)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-emerald-300 font-medium"
          >
            <option value="ALL">{tr('Full Columns', 'ตารางข้อมูลครบ')}</option>
            <option value="OVERVIEW">{tr('General Info', 'ข้อมูลทั่วไป')}</option>
            <option value="CONDITION">{tr('Condition & Medical', 'ความฟิต & การแพทย์')}</option>
            <option value="CONTRACT">{tr('Contract & Value', 'สัญญา & มูลค่า')}</option>
            <option value="STATS">{tr('Season Stats', 'สถิติฤดูกาล')}</option>
          </select>

          <label htmlFor="squad-sort" className="text-xs text-slate-400 ml-1">
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

      {viewMode === 'planner' ? (
        <div
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4"
          data-testid="squad-planner-depth-chart"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-display font-bold text-white">
                {tr(
                  'FM27 Squad Planner & Positional Depth Chart (9 Tactical Zones)',
                  'ผังวางแผนขุมกำลัง & ความลึกรายตำแหน่ง 9 โซน (FM27 Squad Planner)'
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {tr(
                  'Evaluate 1st Choice starters, Senior Backups, and U21 Prospects across every zone to identify transfer priorities.',
                  'วิเคราะห์มือ 1 (1st Choice), ตัวสำรองหมุนเวียน (Backup) และดาวรุ่ง U21 ในแต่ละตำแหน่งเพื่อหาจุดที่ต้องเสริมทัพ'
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-emerald-400">■ Elite / Strong</span>
              <span className="text-amber-400">■ Thin Depth</span>
              <span className="text-red-400">■ Critical Shortage</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {depthChart.map((zone) => {
              const gradeBadgeClass =
                zone.grade === 'strong'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : zone.grade === 'balanced'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40';

              return (
                <div
                  key={zone.code}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-emerald-400 mr-2">
                        [{zone.code}]
                      </span>
                      <span className="text-xs font-semibold text-white">
                        {tr(zone.labelEn, zone.labelTh)}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${gradeBadgeClass}`}>
                      {tr(zone.gradeLabelEn, zone.gradeLabelTh)}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    {/* 1st Choice */}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-emerald-400 mb-1">
                        {tr('1st Choice Starter', 'ตัวจริงมือ 1 (1st Choice)')}
                      </div>
                      {zone.firstChoice ? (
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(zone.firstChoice!.id)}
                          className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlayerAvatar player={zone.firstChoice} club={club} size="sm" />
                            <div className="truncate">
                              <div className="font-semibold text-white truncate">
                                {zone.firstChoice.firstName} {zone.firstChoice.lastName}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {tr('Age', 'อายุ')} {getAgeAtDate(zone.firstChoice.dateOfBirth, world.gameDate)} · Cond {zone.firstChoice.fitness}%
                              </div>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-400 ml-2">
                            {(zone.firstChoice.currentAbility / 10).toFixed(1)}
                          </span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-red-400 italic py-1">
                          {tr('No natural player available!', 'ไม่มีนักเตะธรรมชาติในตำแหน่งนี้!')}
                        </div>
                      )}
                    </div>

                    {/* Backups */}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-sky-400 mb-1">
                        {tr(`Rotation / Backups (${zone.backups.length})`, `สำรองหมุนเวียน (${zone.backups.length} คน)`)}
                      </div>
                      {zone.backups.length > 0 ? (
                        <div className="space-y-1">
                          {zone.backups.map((bp) => (
                            <button
                              key={bp.id}
                              type="button"
                              onClick={() => onSelectPlayer(bp.id)}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-900/70 hover:bg-slate-800 border border-slate-800/70 text-left cursor-pointer"
                            >
                              <span className="text-slate-200 truncate">
                                {bp.firstName} {bp.lastName}{' '}
                                <span className="text-[10px] font-mono text-slate-400">
                                  ({getAgeAtDate(bp.dateOfBirth, world.gameDate)}y)
                                </span>
                              </span>
                              <span className="font-mono text-sky-300">
                                {(bp.currentAbility / 10).toFixed(1)}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-400/90">
                          {tr('No senior backup — transfer target advised', 'ขาดตัวสำรองอาวุโส แนะนำให้เสริมทัพ')}
                        </div>
                      )}
                    </div>

                    {/* U21 Youth Prospects */}
                    <div>
                      <div className="text-[10px] font-mono uppercase text-amber-300 mb-1">
                        {tr(`U21 Prospects (${zone.youths.length})`, `ดาวรุ่ง U21 (${zone.youths.length} คน)`)}
                      </div>
                      {zone.youths.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {zone.youths.map((yp) => (
                            <button
                              key={yp.id}
                              type="button"
                              onClick={() => onSelectPlayer(yp.id)}
                              className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-amber-200 font-mono cursor-pointer"
                            >
                              {yp.lastName} ({(yp.currentAbility / 10).toFixed(1)} → {Math.round(yp.potentialRange[1] / 10)})
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          {tr('No U21 prospect in pipeline', 'ยังไม่มีดาวรุ่ง U21 ในตำแหน่งนี้')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      /* Squad Data Table */
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">{tr('Reg (25)', 'ลงทะเบียน')}</th>
                <th className="py-2.5 px-3">{tr('Squad Role / U23', 'สถานะลงสนาม / ทีมสำรอง')}</th>
                <th className="py-2.5 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2.5 px-3">{tr('Player Name & Quota', 'ชื่อนักเตะ & โควตา')}</th>
                {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONTRACT') && (
                  <th className="py-2.5 px-3">{tr('Hierarchy Expectation', 'บทบาทคาดหวัง')}</th>
                )}
                <th className="py-2.5 px-3 text-right">{tr('Age', 'อายุ')}</th>
                <th className="py-2.5 px-3 text-right">CA / PA</th>
                {tablePreset === 'CONTRACT' && (
                  <>
                    <th className="py-2.5 px-3 text-right">{tr('Wage', 'ค่าเหนื่อย')}</th>
                    <th className="py-2.5 px-3 text-right">{tr('Market Value', 'มูลค่าตลาด')}</th>
                    <th className="py-2.5 px-3 text-right">{tr('Contract End', 'หมดสัญญา')}</th>
                  </>
                )}
                {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONDITION') && (
                  <>
                    <th className="py-2.5 px-3 text-right">{tr('Condition', 'ความฟิต')}</th>
                    <th className="py-2.5 px-3 text-right">{tr('Sharpness', 'ความเฉียบคม')}</th>
                  </>
                )}
                {(tablePreset === 'ALL' || tablePreset === 'CONDITION') && (
                  <th className="py-2.5 px-3">{tr('Injury Risk', 'โอกาสบาดเจ็บ')}</th>
                )}
                {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONDITION') && (
                  <th className="py-2.5 px-3 text-right">{tr('Morale', 'กำลังใจ')}</th>
                )}
                {(tablePreset === 'ALL' || tablePreset === 'STATS') && (
                  <>
                    <th className="py-2.5 px-3 text-right">{tr('Apps/G/A', 'นัด/ประตู/แอสซิสต์')}</th>
                    <th className="py-2.5 px-3 text-right">{tr('Avg Rat', 'เรตติ้ง')}</th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right">{tr('Actions', 'ดูข้อมูล')}</th>
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
                      ) : (p.suspensionMatchesRemaining || 0) > 0 ? (
                        <span className="text-amber-400 font-bold">
                          SUSP ({p.suspensionMatchesRemaining}m)
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
                                'ส่งลงเล่นทีมสำรอง (U23) เพื่อเรียกความเฉียบคม'
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
                          <div className="flex items-center gap-1.5 flex-wrap">
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
                            {(p.isWonderkid || (age <= 21 && p.potentialAbility >= 170)) && (
                              <span className="text-[10px] font-mono text-amber-300 font-bold">
                                · ★ WONDERKID
                              </span>
                            )}
                            {p.isYouthAcademy && (
                              <span className="text-[10px] font-mono text-emerald-400">
                                · {p.youthSquad ? p.youthSquad.toUpperCase() : 'U18'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {p.nationalityCode} · {p.preferredRole}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Squad Hierarchy & Consecutive Benched Warning */}
                    {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONTRACT') && (
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
                    )}

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {age}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className="font-semibold text-emerald-400">{ca20}</span>
                      <span className="text-slate-500"> / {paHigh20}</span>
                    </td>

                    {tablePreset === 'CONTRACT' && (
                      <>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300">
                          €{p.wagePerWeek.toLocaleString()}/w
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white">
                          €{(p.marketValue / 1_000_000).toFixed(1)}M
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                          {p.contractEndDate}
                        </td>
                      </>
                    )}

                    {/* Condition (Stamina) */}
                    {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONDITION') && (
                      <>
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
                      </>
                    )}

                    {/* Muscle Injury Risk */}
                    {(tablePreset === 'ALL' || tablePreset === 'CONDITION') && (
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
                    )}

                    {/* Morale */}
                    {(tablePreset === 'ALL' || tablePreset === 'OVERVIEW' || tablePreset === 'CONDITION') && (
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
                    )}

                    {(tablePreset === 'ALL' || tablePreset === 'STATS') && (
                      <>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                          {p.stats.appearances}/{p.stats.goals}/{p.stats.assists}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-white">
                          {p.stats.appearances > 0 ? p.stats.averageRating.toFixed(2) : '-'}
                        </td>
                      </>
                    )}

                    {/* Quick Peek / Full Profile Actions */}
                    <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {onQuickPeekPlayer && (
                          <button
                            type="button"
                            data-testid={`quick-peek-${p.id}`}
                            onClick={() => onQuickPeekPlayer(p.id)}
                            title={tr('Quick Peek Drawer', 'ดูข้อมูลแบบย่อด้านข้าง')}
                            className="px-2 py-1 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
                          >
                            {tr('Peek', 'ย่อ')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(p.id)}
                          className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/30 text-xs font-semibold cursor-pointer"
                        >
                          {tr('Profile', 'โปรไฟล์')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}
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
    loanOptionToBuyFee?: number;
    buyBackClauseFee?: number;
  }) => void;
  onUpdateIndividualTraining: (
    playerId: string,
    focus: Player['individualTraining']['attributeFocus'],
    roleFocus: PlayerRole,
    intensity: 'Light' | 'Medium' | 'Heavy'
  ) => void;
  onToggleShortlist: (playerId: string) => void;
  onGenerateScoutReport: (playerId: string) => void;
  onUpdatePlayerTransferAndSquadStatus?: (
    playerId: string,
    updates: {
      transferListed?: boolean;
      loanListed?: boolean;
      askingPrice?: number;
      squadStatus?: Player['squadStatus'];
    }
  ) => void;
  onSignBosmanFree?: (playerId: string, proposedWage: number, contractYears: number) => void;
  onActivateReleaseClause?: (playerId: string, useBargainDiscount?: boolean) => void;
  onSendToAffiliateLoan?: (playerId: string) => void;
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
  onUpdatePlayerTransferAndSquadStatus,
  onSignBosmanFree,
  onActivateReleaseClause,
  onSendToAffiliateLoan,
}) => {
  const { tr, trDynamic } = useLanguage();
  const [activeTab, setActiveTab] = useState<'attributes' | 'contract_transfer' | 'development'>('attributes');
  const [comparePlayerId, setComparePlayerId] = useState<string>('');
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
  const [loanOptionToBuyFee, setLoanOptionToBuyFee] = useState(Math.round(player.marketValue * 1.15));
  const [buyBackClauseFee, setBuyBackClauseFee] = useState(Math.round(player.marketValue * 1.6));

  const scoutReport = world.scoutReports[player.id];
  const isShortlisted = world.shortlistPlayerIds.includes(player.id);
  const comparePlayer = comparePlayerId ? world.players[comparePlayerId] : undefined;
  const comparisonCandidates = Object.values(world.players)
    .filter((p) => p.id !== player.id && (p.clubId === world.controlledClubId || p.positions[0] === player.positions[0]))
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 60);

  const playerAxes = computePlayerPolygon8Axes(player);
  const compareAxes = comparePlayer ? computePlayerPolygon8Axes(comparePlayer) : null;
  const activeTraits =
    player.traits && player.traits.length > 0
      ? player.traits
      : derivePlayerTraitsFromAttributes(player);

  const contractEndYear = parseInt(player.contractEndDate.slice(0, 4), 10);
  const currentYear = parseInt(world.gameDate.slice(0, 4), 10);
  const isBosmanEligible = !isMyPlayer && contractEndYear - currentYear <= 1;

  const buildPolygonPoints = (axes: { value: number }[], radius = 78, cx = 115, cy = 110): string =>
    axes
      .map((ax, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const r = (Math.max(1, Math.min(20, ax.value)) / 20) * radius;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

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
              {/* Player Comparison Bar */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-300">
                    {tr('Side-by-Side Comparison:', 'เปรียบเทียบค่าพลังกับนักเตะอื่น:')}
                  </span>
                  <select
                    aria-label={tr('Select player to compare', 'เลือกนักเตะเพื่อเปรียบเทียบ')}
                    value={comparePlayerId}
                    onChange={(e) => setComparePlayerId(e.target.value)}
                    className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                  >
                    <option value="">
                      {tr('— None (Single Player View) —', '— ไม่เปรียบเทียบ (ดูเฉพาะคนนี้) —')}
                    </option>
                    {comparisonCandidates.map((cp) => (
                      <option key={cp.id} value={cp.id}>
                        {cp.firstName} {cp.lastName} ({cp.positions.join('/')} · CA {(cp.currentAbility / 10).toFixed(1)} · {world.clubs[cp.clubId]?.shortName})
                      </option>
                    ))}
                  </select>
                </div>
                {comparePlayer && (
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-emerald-400 font-semibold">
                      ■ {player.lastName} (CA {(player.currentAbility / 10).toFixed(1)})
                    </span>
                    <span className="text-slate-500">vs</span>
                    <span className="text-cyan-400 font-semibold">
                      ■ {comparePlayer.lastName} (CA {(comparePlayer.currentAbility / 10).toFixed(1)})
                    </span>
                  </div>
                )}
              </div>

              {/* FM27 8-Axis SVG Attribute Polygon Radar (Single & Dual Overlay) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-5 flex flex-col items-center">
                  <div className="text-xs font-semibold text-emerald-400 mb-1">
                    {tr('8-Axis Attribute Polygon (FM27 Radar)', 'กราฟใยแมงมุม 8 แกน (8-Axis Attribute Polygon)')}
                  </div>
                  <svg viewBox="0 0 230 220" className="w-56 h-52 select-none">
                    {/* Concentric Octagon Rings (5, 10, 15, 20) */}
                    {[5, 10, 15, 20].map((level) => {
                      const pts = buildPolygonPoints(
                        Array.from({ length: 8 }, () => ({ value: level })),
                        78,
                        115,
                        110
                      );
                      return (
                        <polygon
                          key={level}
                          points={pts}
                          fill="none"
                          stroke="rgba(148, 163, 184, 0.22)"
                          strokeWidth="1"
                        />
                      );
                    })}

                    {/* Axis Spokes & Labels */}
                    {playerAxes.map((ax, i) => {
                      const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
                      const xOuter = 115 + 78 * Math.cos(angle);
                      const yOuter = 110 + 78 * Math.sin(angle);
                      const xLabel = 115 + 98 * Math.cos(angle);
                      const yLabel = 110 + 95 * Math.sin(angle);
                      return (
                        <g key={ax.key}>
                          <line
                            x1="115"
                            y1="110"
                            x2={xOuter}
                            y2={yOuter}
                            stroke="rgba(148, 163, 184, 0.22)"
                            strokeWidth="1"
                          />
                          <text
                            x={xLabel}
                            y={yLabel + 3}
                            textAnchor="middle"
                            fill="#cbd5e1"
                            fontSize="8.5"
                            fontWeight="600"
                          >
                            {tr(ax.labelEn, ax.labelTh)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Compare Player B Polygon Overlay (Cyan) */}
                    {compareAxes && (
                      <polygon
                        points={buildPolygonPoints(compareAxes, 78, 115, 110)}
                        fill="rgba(6, 182, 212, 0.24)"
                        stroke="#06b6d4"
                        strokeWidth="2"
                      />
                    )}

                    {/* Primary Player A Polygon (Emerald) */}
                    <polygon
                      points={buildPolygonPoints(playerAxes, 78, 115, 110)}
                      fill="rgba(16, 185, 129, 0.28)"
                      stroke="#10b981"
                      strokeWidth="2.2"
                    />
                  </svg>
                </div>

                <div className="md:col-span-7 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">
                      {tr('8-Dimension Tactical Profile Breakdown', 'วิเคราะห์ค่าพลัง 8 มิติหลัก')}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {comparePlayer
                        ? `${player.lastName} vs ${comparePlayer.lastName}`
                        : `${player.positions.join('/')} · ${player.preferredRole}`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {playerAxes.map((ax, idx) => {
                      const compVal = compareAxes ? compareAxes[idx]?.value : undefined;
                      const diff = compVal !== undefined ? Number((ax.value - compVal).toFixed(1)) : 0;
                      return (
                        <div
                          key={ax.key}
                          className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between"
                        >
                          <div className="text-[11px] text-slate-400 truncate">
                            {tr(ax.labelEn, ax.labelTh)}
                          </div>
                          <div className="flex items-baseline justify-between mt-1 font-mono tabular-nums">
                            <span
                              className={`text-sm font-bold ${
                                ax.value >= 15
                                  ? 'text-emerald-400'
                                  : ax.value >= 12
                                    ? 'text-sky-300'
                                    : 'text-slate-200'
                              }`}
                            >
                              {ax.value.toFixed(1)}
                            </span>
                            {compVal !== undefined && (
                              <span
                                className={`text-[10px] font-semibold ${
                                  diff > 0
                                    ? 'text-emerald-400'
                                    : diff < 0
                                      ? 'text-cyan-400'
                                      : 'text-slate-500'
                                }`}
                              >
                                vs {compVal.toFixed(1)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Player Traits / Preferred Moves (Checkpoint 11) */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-amber-400">
                    {tr('PLAYER TRAITS / PREFERRED MOVES (นิสัยการเล่นเฉพาะตัว)', 'PLAYER TRAITS / PREFERRED MOVES (นิสัยการเล่นเฉพาะตัว)')}
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    {tr(
                      'Affects live 2D Match Engine behavior & can be passed on via Mentoring',
                      'ส่งผลต่อการตัดสินใจใน Match Engine และถ่ายทอดสู่รุ่นน้องผ่านระบบ Mentoring ได้'
                    )}
                  </span>
                </div>
                {activeTraits.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {activeTraits.map((trait) => {
                      const meta = PLAYER_TRAIT_CATALOG[trait];
                      return (
                        <div
                          key={trait}
                          className="p-2.5 rounded-lg bg-slate-900 border border-amber-500/30 flex flex-col justify-between"
                        >
                          <div className="text-xs font-semibold text-amber-300">
                            ★ {meta ? tr(meta.labelEn, meta.labelTh) : trait}
                          </div>
                          {meta && (
                            <div className="text-[11px] text-slate-400 mt-1">
                              {tr(meta.descEn, meta.descTh)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400">
                    {tr(
                      'No signature Preferred Moves unlocked yet — assign to a Veteran Mentor in Training to learn traits.',
                      'ยังไม่มีนิสัยการเล่นเฉพาะตัว — สามารถเข้ากลุ่มติวเข้ม (Mentoring) กับรุ่นพี่เพื่อเรียนรู้ทักษะพิเศษได้'
                    )}
                  </div>
                )}
              </div>

              {/* 3-Column 1-20 Attributes Grid: Technical, Mental, Physical */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Technical */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-emerald-400 mb-2.5">
                    TECHNICAL ATTRIBUTES (1–20)
                  </h3>
                  <div className="space-y-1 text-xs">
                    {Object.entries(player.attributes.technical).map(([k, val]) => {
                      const compVal = comparePlayer
                        ? comparePlayer.attributes.technical[k as keyof typeof player.attributes.technical]
                        : undefined;
                      const diff = compVal !== undefined ? val - compVal : 0;
                      return (
                        <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                          <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                          <div className="flex items-center gap-2 font-mono tabular-nums">
                            <span className={renderAttrColor(val)}>{val}</span>
                            {compVal !== undefined && (
                              <span
                                className={`text-[11px] ${
                                  diff > 0
                                    ? 'text-emerald-400'
                                    : diff < 0
                                      ? 'text-red-400'
                                      : 'text-slate-500'
                                }`}
                              >
                                vs {compVal} ({diff > 0 ? `+${diff}` : diff})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mental */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-sky-400 mb-2.5">
                    MENTAL ATTRIBUTES (1–20)
                  </h3>
                  <div className="space-y-1 text-xs">
                    {Object.entries(player.attributes.mental).map(([k, val]) => {
                      const compVal = comparePlayer
                        ? comparePlayer.attributes.mental[k as keyof typeof player.attributes.mental]
                        : undefined;
                      const diff = compVal !== undefined ? val - compVal : 0;
                      return (
                        <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                          <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                          <div className="flex items-center gap-2 font-mono tabular-nums">
                            <span className={renderAttrColor(val)}>{val}</span>
                            {compVal !== undefined && (
                              <span
                                className={`text-[11px] ${
                                  diff > 0
                                    ? 'text-emerald-400'
                                    : diff < 0
                                      ? 'text-red-400'
                                      : 'text-slate-500'
                                }`}
                              >
                                vs {compVal} ({diff > 0 ? `+${diff}` : diff})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Physical & Condition */}
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-amber-400 mb-2.5">
                      PHYSICAL ATTRIBUTES (1–20)
                    </h3>
                    <div className="space-y-1 text-xs">
                      {Object.entries(player.attributes.physical).map(([k, val]) => {
                        const compVal = comparePlayer
                          ? comparePlayer.attributes.physical[k as keyof typeof player.attributes.physical]
                          : undefined;
                        const diff = compVal !== undefined ? val - compVal : 0;
                        return (
                          <div key={k} className="flex items-center justify-between py-0.5 border-b border-slate-900">
                            <span className="text-slate-300 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                            <div className="flex items-center gap-2 font-mono tabular-nums">
                              <span className={renderAttrColor(val)}>{val}</span>
                              {compVal !== undefined && (
                                <span
                                  className={`text-[11px] ${
                                    diff > 0
                                      ? 'text-emerald-400'
                                      : diff < 0
                                        ? 'text-red-400'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  vs {compVal} ({diff > 0 ? `+${diff}` : diff})
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
                        {isMyPlayer || scoutReport
                          ? `${(player.currentAbility / 10).toFixed(1)} / 20.0`
                          : `${Math.max(5, Math.round((player.currentAbility - 12) / 10))}–${Math.min(20, Math.round((player.currentAbility + 12) / 10))} / 20 (${tr('Unscouted', 'ยังไม่สเกาต์')})`}
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

                      {/* Own-Player Transfer / Loan List, Asking Price & Squad Status Controls (Checkpoint 5) */}
                      {onUpdatePlayerTransferAndSquadStatus && (
                        <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
                          <h4 className="text-xs font-semibold text-sky-400">
                            {tr(
                              'Squad Status & Transfer / Loan Listing Controls',
                              'จัดการสถานะในทีม & ตั้งขาย / ปล่อยยืม (Squad & Transfer Status)'
                            )}
                          </h4>

                          <div>
                            <label htmlFor="own-squad-status" className="block text-[11px] text-slate-400 mb-1">
                              {tr('Agreed Playing Time / Squad Status', 'บทบาทและเวลาลงสนาม (Squad Status)')}
                            </label>
                            <select
                              id="own-squad-status"
                              value={player.squadStatus}
                              onChange={(e) =>
                                onUpdatePlayerTransferAndSquadStatus(player.id, {
                                  squadStatus: e.target.value as Player['squadStatus'],
                                })
                              }
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                            >
                              <option value="Star Player">Star Player (ตัวหลักซูเปอร์สตาร์)</option>
                              <option value="Important Player">Important Player (ตัวหลักสำคัญ)</option>
                              <option value="Regular Starter">Regular Starter (ตัวจริงสม่ำเสมอ)</option>
                              <option value="Squad Player">Squad Player (หมุนเวียน/สำรอง)</option>
                              <option value="Breakthrough Prospect">Breakthrough Prospect (ดาวรุ่งสอดแทรก)</option>
                              <option value="Youth">Youth (เยาวชน)</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdatePlayerTransferAndSquadStatus(player.id, {
                                  transferListed: !player.transferListed,
                                })
                              }
                              className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                                player.transferListed
                                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                              }`}
                            >
                              {player.transferListed
                                ? tr('✓ Transfer Listed', '✓ ขึ้นบัญชีขายอยู่')
                                : tr('Set Transfer Listed', 'ตั้งขึ้นบัญชีขาย')}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdatePlayerTransferAndSquadStatus(player.id, {
                                  loanListed: !player.loanListed,
                                })
                              }
                              className={`py-2 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                                player.loanListed
                                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                              }`}
                            >
                              {player.loanListed
                                ? tr('✓ Loan Listed', '✓ ขึ้นบัญชีปล่อยยืมอยู่')
                                : tr('Set Loan Listed', 'ตั้งขึ้นบัญชีปล่อยยืม')}
                            </button>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                              <span>{tr('Asking Price Valuation:', 'ตั้งราคาขาย (Asking Price):')}</span>
                              <span className="font-mono text-emerald-400 font-semibold">
                                €{(player.askingPrice / 1_000_000).toFixed(2)}M
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5">
                              {[
                                { mult: 0.75, label: '0.75x (Sale)' },
                                { mult: 1.0, label: '1.0x (MV)' },
                                { mult: 1.25, label: '1.25x' },
                                { mult: 1.5, label: '1.5x' },
                              ].map((preset) => {
                                const targetVal = Math.round((player.marketValue * preset.mult) / 50_000) * 50_000;
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() =>
                                      onUpdatePlayerTransferAndSquadStatus(player.id, {
                                        askingPrice: targetVal,
                                      })
                                    }
                                    className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[11px] font-mono text-slate-200 cursor-pointer"
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {onSendToAffiliateLoan && (
                            <button
                              type="button"
                              data-testid="send-affiliate-loan-btn"
                              onClick={() => onSendToAffiliateLoan(player.id)}
                              className="w-full py-2 bg-indigo-500/20 hover:bg-indigo-500 text-indigo-300 hover:text-slate-950 border border-indigo-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                            >
                              {tr(
                                '🤝 Send to Affiliate / Feeder Club on Loan',
                                '🤝 ส่งยืมตัวไปเก็บเลเวลกับสโมสรพันธมิตร (Affiliate Loan)'
                              )}
                            </button>
                          )}
                        </div>
                      )}
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

                      {/* Bosman Free Pre-Contract Signing Banner (Checkpoint 8) */}
                      {isBosmanEligible && onSignBosmanFree && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-2">
                          <div className="text-xs font-semibold text-amber-300">
                            {tr(
                              `⚡ Bosman Rule Eligible (Expires ${player.contractEndDate})`,
                              `⚡ เข้าเกณฑ์กฎ Bosman เซ็นฟรี (สัญญาหมด ${player.contractEndDate})`
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {tr(
                              'This player has less than 12 months remaining on his contract. You can approach him directly on a Bosman Free transfer (€0 Transfer Fee).',
                              'นักเตะรายนี้เหลือสัญญาไม่ถึง 1 ปี คุณสามารถเจรจาค่าเหนื่อยเพื่อเซ็นคว้าตัวมาร่วมทีมแบบไร้ค่าตัว (€0) ตามกฎ Bosman ได้ทันที!'
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => onSignBosmanFree(player.id, proposedWage, proposedYears)}
                            className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                          >
                            {tr(
                              'Approach to Sign (Bosman Free — €0 Fee)',
                              'ยื่นสัญญาคว้าตัวฟรีตามกฎ Bosman (€0 ค่าตัว)'
                            )}
                          </button>
                        </div>
                      )}

                      {/* Release Clause Immediate Activation Banner (Checkpoint 12) */}
                      {!isMyPlayer && player.releaseClause && onActivateReleaseClause && (
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-emerald-300">
                              {tr(
                                '🔓 Active Contract Release Clause',
                                '🔓 ค่าฉีกสัญญาระบุไว้ในสัญญา (Release Clause)'
                              )}
                            </span>
                            <span className="text-xs font-mono font-bold text-emerald-400">
                              €{(player.releaseClause / 1_000_000).toFixed(2)}M
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {tr(
                              `Triggering the €${(player.releaseClause / 1_000_000).toFixed(2)}M release clause forces ${playerClub?.shortName} to accept immediately and finalizes personal terms right away.`,
                              `การจ่ายค่าฉีกสัญญา €${(player.releaseClause / 1_000_000).toFixed(2)}M จะบังคับให้ ${playerClub?.shortName} ต้องปล่อยตัวทันทีโดยปฏิเสธไม่ได้!`
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => onActivateReleaseClause(player.id, false)}
                            className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                          >
                            {tr(
                              `Trigger Release Clause (€${(player.releaseClause / 1_000_000).toFixed(2)}M — Instant Sign)`,
                              `จ่ายค่าฉีกสัญญาคว้าตัวทันที (€${(player.releaseClause / 1_000_000).toFixed(2)}M)`
                            )}
                          </button>
                        </div>
                      )}

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

                      {/* Advanced Transfer Clauses: Loan Option to Buy & Buy-Back Clause (Checkpoint 26) */}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div>
                          <label htmlFor="trf-option-buy" className="block text-[11px] text-slate-400 mb-1">
                            {tr('Loan Option to Buy Clause (€)', 'ออปชันซื้อขาดหลังหมดสัญญายืม (€)')}
                          </label>
                          <input
                            id="trf-option-buy"
                            type="number"
                            step={250000}
                            value={loanOptionToBuyFee}
                            onChange={(e) => setLoanOptionToBuyFee(Number(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-amber-300 font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label htmlFor="trf-buyback" className="block text-[11px] text-slate-400 mb-1">
                            {tr('Buy-Back Clause (€)', 'เงื่อนไขซื้อกลับ Buy-Back Clause (€)')}
                          </label>
                          <input
                            id="trf-buyback"
                            type="number"
                            step={500000}
                            value={buyBackClauseFee}
                            onChange={(e) => setBuyBackClauseFee(Number(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-sky-300 font-mono tabular-nums"
                          />
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
                            loanOptionToBuyFee: offerType === 'Loan' ? loanOptionToBuyFee : undefined,
                            buyBackClauseFee: offerType === 'Transfer' ? buyBackClauseFee : undefined,
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
