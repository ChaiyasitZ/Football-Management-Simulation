import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  HeartPulse,
  Mail,
  ShieldAlert,
  Sparkles,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { Club, MindGameTone, Player, WorldState } from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import {
  evaluateSquadMedicalRisk,
  getAgeAtDate,
  getClubSupporterConfidence,
  getFanSocialFeed,
  getPendingUrgentInboxItem,
} from '../engine/worldSimulationService';
import {
  computePlayerPolygon8Axes,
  evaluateSquadRegistration,
} from '../engine/tacticsEngine';
import { ClubBadge } from '../components/ClubBadge';
import { PlayerAvatar } from '../components/PlayerAvatar';
import {
  ClubKitJersey,
  CompetitionBadge,
  TrophyArtwork,
} from '../components/TrophyAndKitVisuals';
import { useLanguage } from '../i18n/LanguageContext';

/* ============================================================================
   1. ATTRIBUTE BADGE (FM 1-20 Scale Tier Coloring)
============================================================================ */
export const AttrBadge: React.FC<{ value: number; size?: 'sm' | 'md' }> = ({
  value,
  size = 'sm',
}) => {
  const v = Math.max(1, Math.min(20, Math.round(value)));
  const tierClass =
    v >= 16
      ? 'attr-elite'
      : v >= 11
        ? 'attr-good'
        : v >= 6
          ? 'attr-avg'
          : 'attr-poor';

  return (
    <span
      className={`inline-flex items-center justify-center font-mono tabular-nums rounded border ${tierClass} ${
        size === 'md' ? 'w-7 h-6 text-xs' : 'w-6 h-5 text-xs'
      }`}
    >
      {v}
    </span>
  );
};

/* ============================================================================
   2. FORM CHIPS (W / D / L)
============================================================================ */
export const FormChips: React.FC<{ results: ('W' | 'D' | 'L')[] }> = ({ results }) => {
  if (results.length === 0) {
    return <span className="text-xs font-mono text-slate-500">—</span>;
  }
  return (
    <div className="inline-flex items-center gap-1">
      {results.map((r, idx) => (
        <span
          key={idx}
          className={`w-5 h-5 rounded text-xs font-mono font-bold inline-flex items-center justify-center ${
            r === 'W'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : r === 'D'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
          }`}
        >
          {r}
        </span>
      ))}
    </div>
  );
};

/* ============================================================================
   3. SUB-TAB BAR (Horizontal Contextual Tabs inside Category Page Header)
============================================================================ */
export interface SubTabItem {
  id: string;
  labelEn: string;
  labelTh: string;
  badge?: number | string;
  testId?: string;
}

export const SubTabBar: React.FC<{
  tabs: SubTabItem[];
  activeSubTab: string;
  onSelect: (subTabId: string) => void;
}> = ({ tabs, activeSubTab, onSelect }) => {
  const { tr } = useLanguage();
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b border-slate-800/90 bg-slate-900/70 px-6"
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.id === activeSubTab;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={t.testId || `subtab-${t.id}`}
            onClick={() => onSelect(t.id)}
            style={
              active
                ? { borderBottomColor: 'var(--club-accent, #10b981)' }
                : undefined
            }
            className={`relative py-2.5 px-3.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap border-b-2 flex items-center gap-2 ${
              active
                ? 'text-white border-emerald-500 bg-slate-800/40'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/25'
            }`}
          >
            <span>{tr(t.labelEn, t.labelTh)}</span>
            {t.badge !== undefined && t.badge !== 0 && (
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-xs tabular-nums ${
                  active
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ============================================================================
   4. NOTIFICATION CENTER (Toast History Bell Drawer)
============================================================================ */
export interface NotificationLogItem {
  id: string;
  timestamp: string;
  gameDate: string;
  message: string;
}

export const ToastHistoryDrawer: React.FC<{
  items: NotificationLogItem[];
  onClose: () => void;
  onClear: () => void;
}> = ({ items, onClose, onClear }) => {
  const { tr } = useLanguage();
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex justify-end"
      onClick={onClose}
      data-testid="notification-center-drawer"
    >
      <div
        className="w-full max-w-md bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-display font-bold text-white">
              {tr('Notification History', 'ประวัติการแจ้งเตือน')}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
              >
                {tr('Clear All', 'ล้างทั้งหมด')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {items.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-500">
              {tr('No recent notifications in this session.', 'ยังไม่มีรายการแจ้งเตือนในเซสชันนี้')}
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1 text-xs"
              >
                <div className="flex items-center justify-between text-slate-400 font-mono">
                  <span>{item.gameDate}</span>
                  <span>{item.timestamp}</span>
                </div>
                <div className="text-slate-100 leading-relaxed">{item.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   5. PLAYER QUICK PEEK SIDE PANEL (Single-Click Row Drawer)
============================================================================ */
export const PlayerPeekDrawer: React.FC<{
  player: Player;
  world: WorldState;
  onClose: () => void;
  onOpenFullProfile: (playerId: string) => void;
  onToggleShortlist: (playerId: string) => void;
}> = ({ player, world, onClose, onOpenFullProfile, onToggleShortlist }) => {
  const { tr } = useLanguage();
  const club = world.clubs[player.clubId];
  const age = getAgeAtDate(player.dateOfBirth, world.gameDate);
  const axes = computePlayerPolygon8Axes(player);
  const isShortlisted = world.shortlistPlayerIds.includes(player.id);

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 w-88 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col"
      data-testid="player-peek-drawer"
    >
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <span className="text-xs font-mono uppercase text-emerald-400">
          {tr('Quick Player Peek', 'ข้อมูลนักเตะแบบย่อ')}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          aria-label="Close quick peek"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <PlayerAvatar player={player} club={club} size="md" />
            <div className="min-w-0">
              <div className="text-base font-display font-bold text-white truncate">
                {player.firstName} {player.lastName}
              </div>
              <div className="text-slate-400 font-mono">
                {player.positions.join('/')} · {tr('Age', 'อายุ')} {age} · {player.nationality}
              </div>
              <div className="text-emerald-400 font-semibold truncate">
                {club?.name || 'Free Agent'}
              </div>
            </div>
          </div>
          {club && (
            <ClubKitJersey
              club={club}
              variant={player.positions.includes('GK') ? 'gk' : 'home'}
              size="xs"
            />
          )}
        </div>

        {/* Key Metric Grid */}
        <div className="grid grid-cols-2 gap-2 font-mono tabular-nums">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-slate-400 font-sans">{tr('Ability (CA / PA)', 'ความสามารถ CA / PA')}</div>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">
              {(player.currentAbility / 10).toFixed(1)} / {Math.round(player.potentialRange[1] / 10)}
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-slate-400 font-sans">{tr('Market Value', 'มูลค่าตลาด')}</div>
            <div className="text-sm font-bold text-white mt-0.5">
              €{(player.marketValue / 1_000_000).toFixed(1)}M
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-slate-400 font-sans">{tr('Condition / Sharp', 'ความฟิต / เฉียบคม')}</div>
            <div className="text-sm font-bold text-sky-300 mt-0.5">
              {player.fitness}% / {player.matchSharpness}%
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-slate-400 font-sans">{tr('Wage / Contract', 'ค่าเหนื่อย / สัญญา')}</div>
            <div className="text-sm font-bold text-amber-300 mt-0.5">
              €{(player.wagePerWeek / 1000).toFixed(0)}K · {player.contractEndDate.slice(0, 4)}
            </div>
          </div>
        </div>

        {/* 8-Axis Summary Bars */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="font-semibold text-slate-200">
            {tr('8-Axis Attribute Profile', 'ค่าพลังหลัก 8 ด้าน')}
          </div>
          {axes.map((ax) => (
            <div key={ax.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">{tr(ax.labelEn, ax.labelTh)}</span>
                <span className="font-mono font-semibold text-white">{ax.value}/20</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(ax.value / 20) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Season Stats */}
        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between font-mono">
          <div>
            <div className="text-slate-400 font-sans">{tr('Apps', 'ลงเล่น')}</div>
            <div className="text-sm font-bold text-white">{player.stats.appearances}</div>
          </div>
          <div>
            <div className="text-slate-400 font-sans">{tr('Goals', 'ประตู')}</div>
            <div className="text-sm font-bold text-emerald-400">{player.stats.goals}</div>
          </div>
          <div>
            <div className="text-slate-400 font-sans">{tr('Assists', 'แอสซิสต์')}</div>
            <div className="text-sm font-bold text-sky-400">{player.stats.assists}</div>
          </div>
          <div>
            <div className="text-slate-400 font-sans">{tr('Avg Rating', 'เรตติ้ง')}</div>
            <div className="text-sm font-bold text-amber-300">
              {player.stats.appearances > 0 ? player.stats.averageRating.toFixed(2) : '-'}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-950/80">
        <button
          type="button"
          data-testid="open-full-player-profile-btn"
          onClick={() => onOpenFullProfile(player.id)}
          className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer flex items-center justify-center gap-2"
        >
          <span>{tr('Open Full Player Profile', 'เปิดหน้าโปรไฟล์นักเตะแบบเต็ม')}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        {player.clubId !== world.controlledClubId && (
          <button
            type="button"
            onClick={() => onToggleShortlist(player.id)}
            className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
          >
            {isShortlisted
              ? tr('★ Remove from Shortlist', '★ นำออกจากรายชื่อเป้าหมาย')
              : tr('☆ Add to Shortlist', '☆ เพิ่มเข้าสู่รายชื่อเป้าหมาย')}
          </button>
        )}
      </div>
    </div>
  );
};

/* ============================================================================
   6. PORTAL VIEW (FM26 Action-Oriented Home Portal)
============================================================================ */
export const PortalView: React.FC<{
  world: WorldState;
  onNavigateRoute: (route: string) => void;
  onSelectPlayer: (playerId: string) => void;
  onAdvanceDay: () => void;
  onSendMindGame?: (tone: MindGameTone) => void;
}> = ({ world, onNavigateRoute, onSelectPlayer, onAdvanceDay, onSendMindGame }) => {
  const { tr, trDynamic } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const leagueStandings = world.standings[club.leagueId] || [];
  const myPositionIdx = leagueStandings.findIndex((s) => s.clubId === club.id);
  const myStanding = leagueStandings[myPositionIdx];

  const nextFixture = world.fixtures.find(
    (f) =>
      f.status === 'Scheduled' &&
      (f.homeClubId === club.id || f.awayClubId === club.id)
  );
  const nextOpponent: Club | null = nextFixture
    ? world.clubs[
        nextFixture.homeClubId === club.id ? nextFixture.awayClubId : nextFixture.homeClubId
      ]
    : null;

  const getClubForm5 = (targetClubId: string): ('W' | 'D' | 'L')[] => {
    return world.fixtures
      .filter(
        (f) =>
          f.status === 'Completed' &&
          f.result &&
          (f.homeClubId === targetClubId || f.awayClubId === targetClubId)
      )
      .slice(-5)
      .map((f) => {
        const isHome = f.homeClubId === targetClubId;
        const myG = isHome ? f.result!.homeGoals : f.result!.awayGoals;
        const oppG = isHome ? f.result!.awayGoals : f.result!.homeGoals;
        return myG > oppG ? 'W' : myG === oppG ? 'D' : 'L';
      });
  };

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const injuredPlayers = clubPlayers.filter((p) => p.injuryStatus.isInjured);
  const regSummary = evaluateSquadRegistration(clubPlayers, club.countryId);
  const medicalRiskList = evaluateSquadMedicalRisk(world, club.id).filter(
    (r) => r.riskLevel === 'CRITICAL' || r.riskLevel === 'HIGH'
  );
  const pendingUrgent = getPendingUrgentInboxItem(world.inbox);
  const incomingOffers = world.transferOffers.filter(
    (o) => o.sellingClubId === club.id && o.status === 'PendingClub'
  );
  const currentYear = parseInt(world.gameDate.slice(0, 4), 10) || 2026;
  const expiringPlayers = clubPlayers.filter((p) => {
    const endYr = parseInt(p.contractEndDate.slice(0, 4), 10) || 2028;
    return endYr - currentYear <= 1;
  });

  // Build Action Queue items
  const actionItems: {
    id: string;
    severity: 'urgent' | 'warning' | 'info';
    title: string;
    subtitle: string;
    ctaLabel: string;
    onClick: () => void;
  }[] = [];

  if (pendingUrgent) {
    actionItems.push({
      id: 'urgent_inbox',
      severity: 'urgent',
      title: trDynamic(pendingUrgent.title),
      subtitle: tr('Urgent media/board response required before advancing', 'ต้องตอบคำถามสื่อหรือบอร์ดบริหารก่อนเดินเวลาต่อ'),
      ctaLabel: tr('Respond', 'ตอบกลับ'),
      onClick: () => onNavigateRoute('#/home/inbox'),
    });
  }

  if (incomingOffers.length > 0) {
    const firstOffer = incomingOffers[0];
    const targetPlayer = world.players[firstOffer.playerId];
    const buyerClub = world.clubs[firstOffer.buyingClubId];
    actionItems.push({
      id: 'incoming_offer',
      severity: 'urgent',
      title: tr(
        `Transfer Bid: ${buyerClub?.shortName || 'Club'} offered €${((firstOffer.upfrontFee + firstOffer.installmentsFee) / 1_000_000).toFixed(1)}M for ${targetPlayer?.lastName || 'Player'}`,
        `ข้อเสนอซื้อตัว: ${buyerClub?.shortName || 'สโมสร'} ยื่น €${((firstOffer.upfrontFee + firstOffer.installmentsFee) / 1_000_000).toFixed(1)}M ขอซื้อ ${targetPlayer?.lastName || 'นักเตะ'}`
      ),
      subtitle: tr(`${incomingOffers.length} pending transfer offer(s)`, `มีข้อเสนอซื้อตัวรออนุมัติ ${incomingOffers.length} รายการ`),
      ctaLabel: tr('Negotiate', 'เจรจา'),
      onClick: () => onNavigateRoute('#/recruitment/transfers'),
    });
  }

  if (!regSummary.isCompliant) {
    actionItems.push({
      id: 'reg_quota',
      severity: 'warning',
      title: tr('25-Man Squad Registration Alert', 'แจ้งเตือนโควตาลงทะเบียน 25 คน'),
      subtitle: tr(
        `Registered ${regSummary.registeredCount}/25 · Homegrown ${regSummary.homegrownRegisteredCount}/8`,
        `ลงทะเบียน ${regSummary.registeredCount}/25 คน · Homegrown ${regSummary.homegrownRegisteredCount}/8 คน`
      ),
      ctaLabel: tr('Fix Quota', 'จัดการโควตา'),
      onClick: () => onNavigateRoute('#/team/squad'),
    });
  }

  if (medicalRiskList.length > 0) {
    actionItems.push({
      id: 'med_risk',
      severity: 'warning',
      title: tr(
        `${medicalRiskList.length} Player(s) at High Injury Risk`,
        `นักเตะ ${medicalRiskList.length} คนเสี่ยงบาดเจ็บกล้ามเนื้อสูง`
      ),
      subtitle: `${medicalRiskList[0].playerName} (${medicalRiskList[0].fitness}% Cond)`,
      ctaLabel: tr('Medical Center', 'ศูนย์การแพทย์'),
      onClick: () => onNavigateRoute('#/team/medical'),
    });
  }

  if (expiringPlayers.length > 0) {
    actionItems.push({
      id: 'expiring_contracts',
      severity: 'info',
      title: tr(
        `${expiringPlayers.length} Player Contract(s) Expiring Within 12 Months`,
        `สัญญาของนักเตะ ${expiringPlayers.length} คนกำลังจะหมดภายใน 1 ปี`
      ),
      subtitle: `${expiringPlayers[0].firstName} ${expiringPlayers[0].lastName} (${expiringPlayers[0].contractEndDate})`,
      ctaLabel: tr('Renew', 'ต่อสัญญา'),
      onClick: () => onSelectPlayer(expiringPlayers[0].id),
    });
  }

  // Mini Standings slice (±2 rows around user club = 5 rows)
  const startRow = Math.max(0, Math.min(leagueStandings.length - 5, myPositionIdx - 2));
  const miniTableRows = leagueStandings.slice(startRow, startRow + 5);

  const avgFitness = Math.round(
    clubPlayers.reduce((a, p) => a + p.fitness, 0) / Math.max(1, clubPlayers.length)
  );
  const avgSharpness = Math.round(
    clubPlayers.reduce((a, p) => a + p.matchSharpness, 0) / Math.max(1, clubPlayers.length)
  );
  const avgMorale = Math.round(
    clubPlayers.reduce((a, p) => a + p.morale, 0) / Math.max(1, clubPlayers.length)
  );
  const supporterConf = getClubSupporterConfidence(world, club.id);
  const fanFeed = getFanSocialFeed(world);

  return (
    <div className="space-y-5" data-testid="portal-view">
      {/* Row 1: Action Queue + Next Match Tile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 6 Cols: Manager Action Queue */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-display font-bold text-white">
                {tr('Action Queue & Priorities', 'รายการที่ต้องตัดสินใจด่วน')}
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
              {actionItems.length} {tr('Pending', 'รายการ')}
            </span>
          </div>

          {actionItems.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
              <div className="text-sm font-semibold text-white">
                {tr('All Clear — Ready to Advance', 'ไม่มีงานค้าง พร้อมเดินเวลาต่อ')}
              </div>
              <p className="text-xs text-slate-400">
                {tr(
                  'Squad registration, medical load, and inbox items are all in order.',
                  'การลงทะเบียนขุมกำลัง ความฟิต และข้อความสำคัญเรียบร้อยทั้งหมด'
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {actionItems.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    item.severity === 'urgent'
                      ? 'bg-amber-950/25 border-amber-500/50'
                      : item.severity === 'warning'
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{item.title}</div>
                    <div className="text-xs text-slate-400 truncate mt-0.5">{item.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-500 text-slate-100 hover:text-slate-950 font-semibold text-xs transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <span>{item.ctaLabel}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Quick Status Strip */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs font-mono tabular-nums">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Transfer Budget', 'งบเสริมทัพ')}</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                €{(club.finances.transferBudget / 1_000_000).toFixed(1)}M
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Wage Headroom', 'เพดานค่าเหนื่อย')}</div>
              <div className="text-sm font-bold text-sky-300 mt-0.5">
                €{((club.finances.wageBudgetPerWeek - club.finances.wageUsedPerWeek) / 1000).toFixed(0)}K/w
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Primary Tactic', 'แผนการเล่นหลัก')}</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {club.primaryTactic.formation}
              </div>
            </div>
          </div>
        </div>

        {/* Right 6 Cols: Next Match Tile */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <CompetitionBadge
                competitionId={nextFixture?.competitionId || club.leagueId}
                size="xs"
              />
              <h2 className="text-base font-display font-bold text-white">
                {tr('Next Fixture Preview', 'พรีวิวแมตช์ถัดไป')}
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {nextFixture
                ? `${tr('Matchday', 'นัดที่')} ${nextFixture.matchday} · ${nextFixture.kickoffDate}`
                : tr('Season Completed', 'จบฤดูกาล')}
            </span>
          </div>

          {nextFixture && nextOpponent ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                {/* Home Team */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <ClubBadge
                    club={nextFixture.homeClubId === club.id ? club : nextOpponent}
                    size="md"
                  />
                  <ClubKitJersey
                    club={nextFixture.homeClubId === club.id ? club : nextOpponent}
                    variant="home"
                    size="xs"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {nextFixture.homeClubId === club.id ? club.name : nextOpponent.name}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mb-1">
                      {tr('Home', 'เหย้า')} ·{' '}
                      {(nextFixture.homeClubId === club.id ? club : nextOpponent).primaryTactic.formation}
                    </div>
                    <FormChips
                      results={getClubForm5(
                        nextFixture.homeClubId === club.id ? club.id : nextOpponent.id
                      )}
                    />
                  </div>
                </div>

                <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-display font-bold text-sm text-emerald-400 shrink-0">
                  VS
                </div>

                {/* Away Team */}
                <div className="flex items-center justify-end gap-2.5 min-w-0 flex-1 text-right">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {nextFixture.awayClubId === club.id ? club.name : nextOpponent.name}
                    </div>
                    <div className="text-xs text-slate-400 font-mono mb-1">
                      {tr('Away', 'เยือน')} ·{' '}
                      {(nextFixture.awayClubId === club.id ? club : nextOpponent).primaryTactic.formation}
                    </div>
                    <FormChips
                      results={getClubForm5(
                        nextFixture.awayClubId === club.id ? club.id : nextOpponent.id
                      )}
                    />
                  </div>
                  <ClubKitJersey
                    club={nextFixture.awayClubId === club.id ? club : nextOpponent}
                    variant="away"
                    size="xs"
                  />
                  <ClubBadge
                    club={nextFixture.awayClubId === club.id ? club : nextOpponent}
                    size="md"
                  />
                </div>
              </div>

              {/* Pre-Match Mind Games */}
              {onSendMindGame && (
                <div
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  data-testid="rivalry-mind-games-card"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-400">
                      {tr(
                        `🎙️ Pre-Match Press Mind Games vs ${nextOpponent.aiManager.name}`,
                        `🎙️ สงครามจิตวิทยาก่อนเกมถึง ${nextOpponent.aiManager.name}`
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => onSendMindGame('praise')}
                      className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 text-emerald-300 text-xs font-medium cursor-pointer"
                    >
                      {tr('🤝 Praise Respect', '🤝 ชื่นชมให้เกียรติ')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSendMindGame('attack')}
                      className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-amber-500/40 text-amber-300 text-xs font-medium cursor-pointer"
                    >
                      {tr('🔥 Taunt Weakness', '🔥 เหน็บแนมจุดอ่อน')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSendMindGame('deflect')}
                      className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-sky-500/30 text-sky-300 text-xs font-medium cursor-pointer"
                    >
                      {tr('🎯 Shift Pressure', '🎯 โยนความกดดัน')}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateRoute('#/match/center')}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer flex items-center gap-1.5"
                >
                  <span>{tr('Match Center', 'เข้าสู่สนามแข่งขัน')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateRoute('#/team/tactics')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  {tr('Adjust Tactics', 'ปรับแท็กติก')}
                </button>
                <button
                  type="button"
                  onClick={onAdvanceDay}
                  className="px-3.5 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
                >
                  {tr('Advance Day', 'เดินเวลา 1 วัน')}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400">
              {tr('All league fixtures completed for this season.', 'การแข่งขันในฤดูกาลนี้เสร็จสิ้นครบทุกนัดแล้ว')}
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Mini League Table + Squad Readiness + Board/Fan Confidence & Social Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Mini League Table (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CompetitionBadge competitionId={club.leagueId} size="xs" />
              <h3 className="text-sm font-display font-bold text-white">
                {LEAGUES_CONFIG[club.leagueId].name}
              </h3>
              <TrophyArtwork competitionId={club.leagueId} size="xs" />
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoute('#/match/competitions')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              {tr('Full Table →', 'ตารางเต็ม →')}
            </button>
          </div>

          <table className="w-full text-left text-xs border-collapse font-mono tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-1.5 px-2">#</th>
                <th className="py-1.5 px-2 font-sans">{tr('Club', 'สโมสร')}</th>
                <th className="py-1.5 px-2 text-right">P</th>
                <th className="py-1.5 px-2 text-right">GD</th>
                <th className="py-1.5 px-2 text-right">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {miniTableRows.map((row, idx) => {
                const rank = startRow + idx + 1;
                const c = world.clubs[row.clubId];
                const isMe = row.clubId === club.id;
                return (
                  <tr
                    key={row.clubId}
                    className={
                      isMe
                        ? 'bg-emerald-500/15 text-emerald-300 font-bold'
                        : 'text-slate-300'
                    }
                  >
                    <td className="py-2 px-2">{rank}</td>
                    <td className="py-2 px-2 font-sans truncate max-w-[130px]">
                      <div className="flex items-center gap-2">
                        {c && <ClubBadge club={c} size="xs" />}
                        <span className="truncate">{c?.shortName}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right">{row.played}</td>
                    <td className="py-2 px-2 text-right">
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-white">{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>{tr('Board Target:', 'เป้าหมายบอร์ด:')}</span>
            <span className="font-mono text-sky-400 font-semibold">
              {tr(
                `Top ${club.boardExpectations.targetLeaguePosition} Finish (Current #${myPositionIdx + 1})`,
                `ติดท็อป ${club.boardExpectations.targetLeaguePosition} (ปัจจุบัน #${myPositionIdx + 1})`
              )}
            </span>
          </div>
        </div>

        {/* Squad Readiness & Medical Summary (4 Cols) */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              <h3 className="text-sm font-display font-bold text-white">
                {tr('Squad Readiness & Fitness', 'ความพร้อมขุมกำลัง')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoute('#/team/squad')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              {tr('Manage Squad →', 'ขุมกำลัง →')}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-xs text-center">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Condition', 'ความฟิต')}</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">{avgFitness}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Sharpness', 'ความเฉียบคม')}</div>
              <div className="text-base font-bold text-sky-300 mt-0.5">{avgSharpness}%</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Morale', 'ขวัญกำลังใจ')}</div>
              <div className="text-base font-bold text-amber-300 mt-0.5">{avgMorale}%</div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="text-slate-400 font-semibold">
              {tr('Medical & Selection Notes', 'รายงานการแพทย์และการจัดทัพ')}
            </div>
            {injuredPlayers.length === 0 && medicalRiskList.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400">
                ✓ {tr('Full squad fit and cleared for matchday.', 'นักเตะทุกคนฟิตสมบูรณ์พร้อมลงสนาม')}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {injuredPlayers.slice(0, 2).map((ip) => (
                  <button
                    key={ip.id}
                    type="button"
                    onClick={() => onSelectPlayer(ip.id)}
                    className="w-full p-2 rounded-lg bg-rose-950/30 border border-rose-500/40 flex items-center justify-between text-left cursor-pointer"
                  >
                    <span className="text-white font-medium truncate">
                      ✚ {ip.firstName} {ip.lastName} ({ip.positions[0]})
                    </span>
                    <span className="font-mono text-rose-300">
                      {ip.injuryStatus.daysRemaining}d
                    </span>
                  </button>
                ))}
                {medicalRiskList.slice(0, 2).map((mr) => (
                  <button
                    key={mr.playerId}
                    type="button"
                    onClick={() => onNavigateRoute('#/team/medical')}
                    className="w-full p-2 rounded-lg bg-amber-950/25 border border-amber-500/40 flex items-center justify-between text-left cursor-pointer"
                  >
                    <span className="text-slate-200 truncate">
                      ▲ {mr.playerName} ({mr.fitness}% Cond)
                    </span>
                    <span className="font-mono text-amber-300">{mr.riskLevel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Board, Supporters & Fan Social Feed (4 Cols) */}
        <div
          className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3"
          data-testid="fan-social-feed-card"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-display font-bold text-white">
                {tr('Board & Supporter Pulse', 'ความเชื่อมั่นบอร์ด & กระแสแฟนบอล')}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoute('#/club/overview')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              {tr('Boardroom →', 'บอร์ดบริหาร →')}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono tabular-nums">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Board Confidence', 'ความเชื่อมั่นบอร์ด')}</div>
              <div className="text-lg font-bold text-sky-400 mt-0.5">
                {club.boardExpectations.confidence.overall}%
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Supporter Mood', 'ความพึงพอใจแฟนบอล')}</div>
              <div className="text-lg font-bold text-amber-400 mt-0.5">{supporterConf}%</div>
            </div>
          </div>

          <div className="space-y-1.5">
            {fanFeed.slice(0, 2).map((post) => (
              <div
                key={post.id}
                className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sky-400">{post.handle}</span>
                  <span className="font-mono text-slate-400">♥ {post.likes}</span>
                </div>
                <p className="text-slate-200 line-clamp-2">
                  {trDynamic(post.text || post.body || '')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Recent Inbox Headlines */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-display font-bold text-white">
              {tr('Latest Inbox & Media Headlines', 'พาดหัวข่าวและข้อความล่าสุด')}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateRoute('#/home/inbox')}
            className="text-xs text-emerald-400 hover:underline cursor-pointer"
          >
            {tr('Open Inbox →', 'เปิดกล่องข้อความ →')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {world.inbox.slice(0, 3).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigateRoute('#/home/inbox')}
              className="p-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 text-left space-y-1 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-400">{item.category}</span>
                <span className="text-slate-400">{item.gameDate}</span>
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {trDynamic(item.title)}
              </div>
              <p className="text-xs text-slate-400 line-clamp-2">{trDynamic(item.body)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
