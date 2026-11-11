import React, { useEffect, useState } from 'react';
import {
  Club,
  InboxCategory,
  LeagueId,
  NewsItem,
  Player,
  PositionGroup,
  UefaCompetitionId,
  WorldState,
} from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { getLeaguePlayerLeaders } from '../engine/leagueEngine';
import {
  getUefaKnockoutBracketSummary,
  UEFA_COMPETITIONS_CONFIG,
  UEFA_COUNTRY_QUOTAS,
} from '../engine/uefaEngine';
import { getAgeAtDate, SaveSlotMeta } from '../engine/worldSimulationService';
import { getPositionGroup } from './SquadAndProfileModal';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import type { User } from '../firebase';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

export type NavTab =
  | 'dashboard'
  | 'inbox'
  | 'squad'
  | 'tactics'
  | 'match'
  | 'training'
  | 'scouting'
  | 'transfers'
  | 'schedule'
  | 'competitions'
  | 'club'
  | 'staff'
  | 'youth'
  | 'world'
  | 'manager';

/* ============================================================================
   1. DASHBOARD VIEW
============================================================================ */
export const DashboardView: React.FC<{
  world: WorldState;
  onNavigate: (tab: NavTab) => void;
  onSelectPlayer: (playerId: string) => void;
  onAdvanceDay: () => void;
}> = ({ world, onNavigate, onSelectPlayer, onAdvanceDay }) => {
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
  const nextOpponent = nextFixture
    ? world.clubs[
        nextFixture.homeClubId === club.id ? nextFixture.awayClubId : nextFixture.homeClubId
      ]
    : null;

  const recentFixtures = world.fixtures
    .filter(
      (f) =>
        f.status === 'Completed' &&
        (f.homeClubId === club.id || f.awayClubId === club.id)
    )
    .slice(-5)
    .reverse();

  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);
  const injuredPlayers = clubPlayers.filter((p) => p.injuryStatus.isInjured);
  const avgFitness = Math.round(
    clubPlayers.reduce((a, p) => a + p.fitness, 0) / Math.max(1, clubPlayers.length)
  );
  const avgMorale = Math.round(
    clubPlayers.reduce((a, p) => a + p.morale, 0) / Math.max(1, clubPlayers.length)
  );
  const unreadInbox = world.inbox.filter((n) => !n.isRead);

  return (
    <div className="space-y-4">
      {/* Top 4 KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">
            {tr(`League Standing (${LEAGUES_CONFIG[club.leagueId].name})`, `อันดับในลีก (${LEAGUES_CONFIG[club.leagueId].name})`)}
          </div>
          <div className="text-2xl font-display font-bold text-white mt-1 font-mono tabular-nums">
            {tr(
              `Rank #${myPositionIdx + 1} / ${LEAGUES_CONFIG[club.leagueId].targetClubCount}`,
              `อันดับ ${myPositionIdx + 1} / ${LEAGUES_CONFIG[club.leagueId].targetClubCount}`
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {tr(
              `Played ${myStanding?.played || 0} · ${myStanding?.points || 0} pts · GD ${myStanding?.goalDifference ?? 0}`,
              `แข่ง ${myStanding?.played || 0} นัด · ${myStanding?.points || 0} คะแนน · ประตูได้เสีย ${myStanding?.goalDifference ?? 0}`
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">
            {tr('Transfer & Wage Budget', 'งบประมาณซื้อขายและเพดานค่าเหนื่อย')}
          </div>
          <div className="text-2xl font-display font-bold text-emerald-400 mt-1 font-mono tabular-nums">
            €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {tr(
              `Wage Used €${(club.finances.wageUsedPerWeek / 1_000).toFixed(0)}K / €${(club.finances.wageBudgetPerWeek / 1_000).toFixed(0)}K per wk`,
              `ค่าเหนื่อยใช้ไป €${(club.finances.wageUsedPerWeek / 1_000).toFixed(0)}K / €${(club.finances.wageBudgetPerWeek / 1_000).toFixed(0)}K ต่อสัปดาห์`
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">
            {tr('Squad Condition', 'ความพร้อมขุมกำลัง (Squad Condition)')}
          </div>
          <div className="text-2xl font-display font-bold text-white mt-1 font-mono tabular-nums">
            {tr(
              `Fitness ${avgFitness}% · Morale ${avgMorale}%`,
              `ความฟิต ${avgFitness}% · ขวัญกำลังใจ ${avgMorale}%`
            )}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {tr(
              `Injured: ${injuredPlayers.length} · Primary: ${club.primaryTactic.formation}`,
              `ผู้เล่นบาดเจ็บ ${injuredPlayers.length} คน · แผนหลัก ${club.primaryTactic.formation}`
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">
            {tr('Board Confidence', 'ความเชื่อมั่นบอร์ดบริหาร (Board Confidence)')}
          </div>
          <div className="text-2xl font-display font-bold text-sky-400 mt-1 font-mono tabular-nums">
            {club.boardExpectations.confidence.overall}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {tr(
              `Season Target: Top ${club.boardExpectations.targetLeaguePosition} Finish`,
              `เป้าหมายฤดูกาล: ท็อป ${club.boardExpectations.targetLeaguePosition} ของตาราง`
            )}
          </div>
        </div>
      </div>

      {/* Main 3-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: Next Match & Quick Actions + Recent Results */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-400">
                {tr('Next Fixture', 'แมตช์ถัดไป (Next Fixture)')}
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {nextFixture
                  ? `Matchday ${nextFixture.matchday} · ${nextFixture.kickoffDate}`
                  : tr('Season Completed', 'จบฤดูกาล')}
              </span>
            </div>

            {nextFixture && nextOpponent ? (
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ClubBadge
                      club={nextFixture.homeClubId === club.id ? club : nextOpponent}
                      size="sm"
                    />
                    <div>
                      <div className="text-base font-bold text-white">
                        {nextFixture.homeClubId === club.id
                          ? `${club.name} vs ${nextOpponent.name}`
                          : `${nextOpponent.name} vs ${club.name}`}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {nextFixture.homeClubId === club.id
                          ? tr('Home Match', 'เกมเหย้า')
                          : tr('Away Match', 'เกมเยือน')}{' '}
                        · {tr('Opponent Formation:', 'แผนคู่แข่ง')} {nextOpponent.primaryTactic.formation} · Rep {nextOpponent.reputation}
                      </div>
                    </div>
                  </div>
                  <ClubBadge
                    club={nextFixture.homeClubId === club.id ? nextOpponent : club}
                    size="sm"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('match')}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                  >
                    {tr('Go to Match Center', 'เข้าสู่สนามแข่งขัน (Match Center)')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('tactics')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                  >
                    {tr('Pre-Match Tactics', 'ปรับแท็กติกก่อนเกม')}
                  </button>
                  <button
                    type="button"
                    onClick={onAdvanceDay}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
                  >
                    {tr('Advance Day (Continue)', 'เดินเวลา (Continue)')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-4">
                {tr('No upcoming fixtures scheduled.', 'ไม่มีโปรแกรมการแข่งขันที่กำลังจะมาถึง')}
              </div>
            )}

            {/* Recent Results */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2">
                {tr('Recent 5 Results', 'ผลการแข่งขัน 5 นัดหลังสุด (Recent Results)')}
              </h4>
              {recentFixtures.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">
                  {tr(
                    'No completed matches yet this season. Click Continue or go to Match Center to kick off your campaign.',
                    'ยังไม่มีผลการแข่งขันในฤดูกาลนี้ กดปุ่ม Continue หรือเข้าสู่ Match Center เพื่อเริ่มนัดเปิดสนาม'
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {recentFixtures.map((f) => {
                    const h = world.clubs[f.homeClubId];
                    const a = world.clubs[f.awayClubId];
                    const res = f.result!;
                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs font-mono tabular-nums"
                      >
                        <span className="text-slate-400">MD {f.matchday}</span>
                        <span className="text-slate-200 font-sans">
                          {h?.shortName} {res.homeGoals} - {res.awayGoals} {a?.shortName}
                        </span>
                        <span className="text-slate-400">{f.kickoffDate}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center 4 Cols: Unread Inbox & News */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">
              {tr(`Inbox & Headlines (${unreadInbox.length} unread)`, `กล่องข้อความและข่าวด่วน (${unreadInbox.length} ยังไม่อ่าน)`)}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('inbox')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              {tr('Open Full Inbox', 'เปิด Inbox ทั้งหมด')}
            </button>
          </div>
          <div className="space-y-2 flex-1">
            {world.inbox.slice(0, 5).map((item) => {
              const isUrgent = Boolean(
                item.pressConferenceOptions &&
                  item.pressConferenceOptions.length > 0 &&
                  !item.pressConferenceAnsweredId
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate('inbox')}
                  className={`w-full text-left p-3 rounded-lg bg-slate-950 border transition-colors cursor-pointer ${
                    isUrgent
                      ? 'border-amber-500/70 hover:border-amber-400'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-0.5">
                    <span className="flex items-center gap-1.5">
                      <span>{item.category}</span>
                      {isUrgent && (
                        <span className="text-amber-400 font-bold">
                          [{tr('ACTION REQUIRED', 'ต้องตอบกลับ')}]
                        </span>
                      )}
                    </span>
                    <span>{item.gameDate}</span>
                  </div>
                  <div className="text-xs font-semibold text-white truncate">
                    {trDynamic(item.title)}
                  </div>
                  <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                    {trDynamic(item.body)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right 3 Cols: Mini League Standings */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">
              {tr(`Standings (${LEAGUES_CONFIG[club.leagueId].countryFlag})`, `ตารางคะแนน (${LEAGUES_CONFIG[club.leagueId].countryFlag})`)}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('competitions')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              {tr('All Competitions', 'ดูทั้ง 15 ลีก & UEFA')}
            </button>
          </div>

          <div className="overflow-y-auto max-h-[380px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 text-left">#</th>
                  <th className="py-1.5 text-left">{tr('Club', 'สโมสร')}</th>
                  <th className="py-1.5 text-right">{tr('P', 'แข่ง')}</th>
                  <th className="py-1.5 text-right">GD</th>
                  <th className="py-1.5 text-right">{tr('PTS', 'แต้ม')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums">
                {leagueStandings.slice(0, 12).map((row, idx) => {
                  const c = world.clubs[row.clubId];
                  const isMine = row.clubId === club.id;
                  return (
                    <tr
                      key={row.clubId}
                      className={isMine ? 'bg-emerald-950/40 text-emerald-300 font-semibold' : 'text-slate-300'}
                    >
                      <td className="py-1.5 pr-2">{idx + 1}</td>
                      <td className="py-1.5 font-sans">
                        <div className="flex items-center gap-1.5 truncate max-w-[115px]">
                          <ClubBadge club={c} size="xs" />
                          <span className="truncate">{c?.name}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right">{row.played}</td>
                      <td className="py-1.5 text-right">{row.goalDifference}</td>
                      <td className="py-1.5 text-right font-bold text-white">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. INBOX & MEDIA VIEW
============================================================================ */
export const InboxView: React.FC<{
  world: WorldState;
  focusedNewsId?: string | null;
  onMarkRead: (newsId: string) => void;
  onAnswerPressConference: (newsId: string, optionId: string) => void;
  onAddAiNewsItem: (title: string, body: string) => void;
  onNavigate: (tab: NavTab) => void;
}> = ({
  world,
  focusedNewsId,
  onMarkRead,
  onAnswerPressConference,
  onAddAiNewsItem,
  onNavigate,
}) => {
  const { tr, trDynamic } = useLanguage();
  const [catFilter, setCatFilter] = useState<'ALL' | InboxCategory>('ALL');
  const [selectedNewsId, setSelectedNewsId] = useState<string>(
    focusedNewsId || world.inbox[0]?.id || ''
  );

  useEffect(() => {
    if (focusedNewsId) {
      setCatFilter('ALL');
      setSelectedNewsId(focusedNewsId);
    }
  }, [focusedNewsId]);

  const filtered = world.inbox.filter((n) => catFilter === 'ALL' || n.category === catFilter);
  const activeItem: NewsItem | undefined =
    filtered.find((n) => n.id === selectedNewsId) || filtered[0];

  const handleGenerateSportsDeskNews = () => {
    const club = world.clubs[world.controlledClubId];
    const table = world.standings[club.leagueId] || [];
    const pos = table.findIndex((s) => s.clubId === club.id) + 1;
    const row = table.find((s) => s.clubId === club.id);
    const pts = row?.points ?? 0;
    const gd = row ? row.goalsFor - row.goalsAgainst : 0;

    onAddAiNewsItem(
      tr(
        `Focus on ${club.name}: Currently #${pos} in ${LEAGUES_CONFIG[club.leagueId].name}`,
        `เกาะติดสถานการณ์ ${club.name} อันดับ ${pos} ในศึก ${LEAGUES_CONFIG[club.leagueId].name}`
      ),
      tr(
        `Special report from the European Sports Desk: Under the management of ${world.manager.name}, ${club.name} have played ${row?.played ?? 0} matches and collected ${pts} points (Goal Difference ${gd >= 0 ? `+${gd}` : gd}), sitting #${pos} in the table as of ${world.gameDate}.`,
        `รายงานพิเศษจากโต๊ะข่าวกีฬา: สโมสร ${club.name} ภายใต้การคุมทัพของ ${world.manager.name} ลงสนามไปแล้ว ${row?.played ?? 0} นัด เก็บได้ ${pts} คะแนน (ผลต่างประตูได้เสีย ${gd >= 0 ? `+${gd}` : gd}) รั้งอันดับ ${pos} ของตาราง ณ วันที่ ${world.gameDate}`
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'Board', 'Media', 'Match Preview', 'Match Report', 'Transfer', 'Scout', 'Injury', 'Staff'] as const).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(cat)}
                className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                  catFilter === cat
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                {cat === 'ALL' ? tr('All', 'ทั้งหมด') : cat}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerateSportsDeskNews}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs rounded-lg cursor-pointer"
        >
          {tr('Generate European Sports Desk Report', 'สรุปสกู๊ปข่าวฟุตบอลยุโรป (Sports Desk)')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: Message List */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 max-h-[580px] overflow-y-auto">
          {filtered.map((item) => {
            const isSelected = activeItem?.id === item.id;
            const isUrgent = Boolean(
              item.pressConferenceOptions &&
                item.pressConferenceOptions.length > 0 &&
                !item.pressConferenceAnsweredId
            );
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedNewsId(item.id);
                  if (!item.isRead) onMarkRead(item.id);
                }}
                className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected
                    ? isUrgent
                      ? 'bg-amber-950/30 border-amber-400'
                      : 'bg-slate-800 border-emerald-500/60'
                    : isUrgent
                      ? 'bg-amber-950/20 border-amber-500/70'
                      : item.isRead
                        ? 'bg-slate-950/60 border-slate-800/70 opacity-80'
                        : 'bg-slate-950 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-emerald-400">{item.category}</span>
                    {isUrgent && (
                      <span className="text-amber-400 font-bold">
                        · {tr('ACTION REQUIRED', 'ต้องตอบกลับ')}
                      </span>
                    )}
                  </span>
                  <span>{item.gameDate}</span>
                </div>
                <div className="text-xs font-semibold text-white">{trDynamic(item.title)}</div>
              </button>
            );
          })}
        </div>

        {/* Right 7 Cols: Message Reader & Interactive Actions */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6">
          {activeItem ? (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-4">
                <div className="flex items-center justify-between text-xs font-mono text-emerald-400 mb-1">
                  <span>
                    {activeItem.category} · {tr('Date:', 'วันที่')} {activeItem.gameDate}
                  </span>
                  {activeItem.pressConferenceOptions &&
                    activeItem.pressConferenceOptions.length > 0 &&
                    !activeItem.pressConferenceAnsweredId && (
                      <span className="text-amber-400 font-bold">
                        {tr('! RESPONSE REQUIRED BEFORE CONTINUING', '! จำเป็นต้องตอบกลับก่อนกด Continue')}
                      </span>
                    )}
                </div>
                <h2 className="text-xl font-display font-bold text-white">
                  {trDynamic(activeItem.title)}
                </h2>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {trDynamic(activeItem.body)}
              </p>

              {/* Press Conference Interactive Options */}
              {activeItem.pressConferenceOptions && (
                <div
                  className={`p-4 rounded-xl bg-slate-950 border space-y-3 ${
                    !activeItem.pressConferenceAnsweredId
                      ? 'border-amber-500/70'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-amber-400">
                      {tr('Press Conference — Manager Response Required', 'งานแถลงข่าวต่อหน้าสื่อมวลชน — กรุณาเลือกคำตอบของคุณ')}
                    </div>
                  </div>
                  {activeItem.pressConferenceAnsweredId ? (
                    <div className="text-xs text-emerald-400">
                      {tr(
                        '✓ You have already responded to the media: ',
                        '✓ คุณได้ตอบคำถามสื่อมวลชนในหัวข้อนี้เรียบร้อยแล้ว: '
                      )}
                      {trDynamic(
                        activeItem.pressConferenceOptions.find(
                          (o) => o.id === activeItem.pressConferenceAnsweredId
                        )?.mediaResponse || ''
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeItem.pressConferenceOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onAnswerPressConference(activeItem.id, opt.id)}
                          className="w-full text-left p-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 text-xs text-slate-100 transition-colors cursor-pointer"
                        >
                          "{trDynamic(opt.label)}"
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeItem.actionType === 'GoToMatch' && (
                <button
                  type="button"
                  onClick={() => onNavigate('match')}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  {tr('Go to Match Center', 'ไปที่ Match Center')}
                </button>
              )}
              {activeItem.actionType === 'GoToTactics' && (
                <button
                  type="button"
                  onClick={() => onNavigate('tactics')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  {tr('Open Tactics', 'เปิดหน้าจอ Tactics')}
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">
              {tr('Select a message on the left to read details.', 'เลือกข้อความทางซ้ายเพื่ออ่านรายละเอียด')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   3. TRAINING & DEVELOPMENT VIEW
============================================================================ */
export const TrainingView: React.FC<{
  world: WorldState;
  onUpdateClubTraining: (
    focus: Club['trainingFocus'],
    intensity: Club['trainingIntensity']
  ) => void;
  onSelectPlayer: (playerId: string) => void;
}> = ({ world, onUpdateClubTraining, onSelectPlayer }) => {
  const { tr } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);

  const focuses: { id: Club['trainingFocus']; descEn: string; descTh: string }[] = [
    {
      id: 'Attacking',
      descEn: 'Focus on finishing, penalty-box movement, and offensive sharpness.',
      descTh: 'เน้นการจบสกอร์ การเคลื่อนที่ในกรอบเขตโทษ และความคมเกมรุก',
    },
    {
      id: 'Defending',
      descEn: 'Focus on defensive discipline, tackling, and back-line positioning.',
      descTh: 'เน้นวินัยเกมรับ การเข้าสกัด และการยืนตำแหน่งแนวรับ',
    },
    {
      id: 'Possession',
      descEn: 'Focus on ball retention, short passing combinations, and press resistance.',
      descTh: 'เน้นการครองบอล จ่ายบอลสั้น และแกะเพรสซิ่ง',
    },
    {
      id: 'Chance Creation',
      descEn: 'Focus on creative vision, through-balls, and wide crossing delivery.',
      descTh: 'เน้นการสร้างสรรค์โอกาส จ่ายทะลุช่อง และเปิดบอลริมเส้น',
    },
    {
      id: 'Pressing',
      descEn: 'Focus on high-intensity counter-pressing and ball recovery stamina.',
      descTh: 'เน้นการบีบพื้นที่แดนบนและความฟิตในการแย่งบอลคืน',
    },
    {
      id: 'Set Pieces',
      descEn: 'Focus on corners, free-kicks, and aerial set-piece organization.',
      descTh: 'เน้นลูกตั้งเตะ เตะมุม ฟรีคิก และการป้องกันลูกกลางอากาศ',
    },
    {
      id: 'Physical',
      descEn: 'Focus on strength, pace, acceleration, and physical endurance.',
      descTh: 'เน้นความแข็งแกร่ง ความเร็ว และความทนทานของร่างกาย',
    },
    {
      id: 'Recovery',
      descEn: 'Focus on post-match fitness regeneration and reducing injury risk.',
      descTh: 'เน้นการฟื้นฟูความฟิตหลังเกมหนักและลดความเสี่ยงบาดเจ็บ',
    },
    {
      id: 'Match Preparation',
      descEn: 'Focus on tactical familiarity and cohesion for the upcoming fixture.',
      descTh: 'เน้นความเข้าใจแท็กติก (Tactical Familiarity) สำหรับนัดถัดไป',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              {tr('Weekly First-Team Training Regimen', 'ตารางการฝึกซ้อมทีมชุดใหญ่ประจำสัปดาห์ (Team Training Regimen)')}
            </h3>
            <p className="text-xs text-slate-400">
              {tr(
                `Training Facilities Level ${club.trainingFacilities}/20 · Training progression is processed every Monday.`,
                `ศูนย์ฝึกซ้อมระดับ ${club.trainingFacilities}/20 · การซ้อมมีผลต่อพัฒนาการทุกวันจันทร์ในเกม`
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="team-train-intensity" className="text-xs text-slate-400">
              {tr('Team Intensity:', 'ความเข้มข้นของทีม:')}
            </label>
            <select
              id="team-train-intensity"
              value={club.trainingIntensity}
              onChange={(e) =>
                onUpdateClubTraining(
                  club.trainingFocus,
                  e.target.value as Club['trainingIntensity']
                )
              }
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="Light">{tr('Light (Preserve Fitness)', 'Light (ซ้อมเบา ถนอมร่างกาย)')}</option>
              <option value="Standard">{tr('Standard (Balanced)', 'Standard (สมดุลมาตรฐาน)')}</option>
              <option value="Intense">{tr('Intense (Fast Growth / Higher Fatigue)', 'Intense (ซ้อมเข้มข้น พัฒนาไวแต่เหนื่อยง่าย)')}</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {focuses.map((f) => {
            const active = club.trainingFocus === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onUpdateClubTraining(f.id, club.trainingIntensity)}
                className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-950/50 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold text-emerald-400 mb-1">{f.id}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {tr(f.descEn, f.descTh)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Individual Player Training Summary Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          {tr(
            'Individual Player Training (Click any player to customize focus)',
            'การฝึกซ้อมรายบุคคล (คลิกชื่อนักเตะเพื่อปรับโฟกัสเฉพาะตัว)'
          )}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 px-3">{tr('Player Name', 'ชื่อนักเตะ')}</th>
                <th className="py-2 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2 px-3">{tr('Age', 'อายุ')}</th>
                <th className="py-2 px-3">CA / PA</th>
                <th className="py-2 px-3">Attribute Focus</th>
                <th className="py-2 px-3">Role Focus</th>
                <th className="py-2 px-3">Intensity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {clubPlayers.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelectPlayer(p.id)}
                  className="hover:bg-slate-800/60 cursor-pointer"
                >
                  <td className="py-2 px-3 font-medium text-white">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar player={p} club={club} size="xs" />
                      <span>
                        {p.firstName} {p.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-300">{p.positions.join(', ')}</td>
                  <td className="py-2 px-3 font-mono tabular-nums text-slate-300">
                    {getAgeAtDate(p.dateOfBirth, world.gameDate)}
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-emerald-400">
                    {(p.currentAbility / 10).toFixed(1)} / {Math.round(p.potentialRange[1] / 10)}
                  </td>
                  <td className="py-2 px-3 text-sky-300 capitalize">
                    {p.individualTraining.attributeFocus}
                  </td>
                  <td className="py-2 px-3 text-slate-300">{p.individualTraining.roleFocus}</td>
                  <td className="py-2 px-3 font-mono text-slate-300">
                    {p.individualTraining.intensity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   4. SCOUTING & RECRUITMENT VIEW
============================================================================ */
export const ScoutingView: React.FC<{
  world: WorldState;
  onSelectPlayer: (playerId: string) => void;
  onCreateAssignment: (
    region: LeagueId | 'ALL_EUROPE',
    posGroup: PositionGroup | 'ANY',
    maxAge: number,
    maxBudget: number
  ) => void;
  onGenerateScoutReport: (playerId: string) => void;
}> = ({ world, onSelectPlayer, onCreateAssignment, onGenerateScoutReport }) => {
  const { tr } = useLanguage();
  const [leagueFilter, setLeagueFilter] = useState<'ALL_EUROPE' | LeagueId>('ALL_EUROPE');
  const [posFilter, setPosFilter] = useState<'ANY' | PositionGroup>('ANY');
  const [maxAge, setMaxAge] = useState(26);
  const [maxValueM, setMaxValueM] = useState(60);
  const [searchQuery, setSearchQuery] = useState('');

  const allExternalPlayers = Object.values(world.players).filter((p) => {
    if (p.clubId === world.controlledClubId) return false;
    const c = world.clubs[p.clubId];
    if (!c) return false;
    if (leagueFilter !== 'ALL_EUROPE' && c.leagueId !== leagueFilter) return false;
    if (posFilter !== 'ANY' && getPositionGroup(p.positions[0]) !== posFilter) return false;
    const age = getAgeAtDate(p.dateOfBirth, world.gameDate);
    if (age > maxAge) return false;
    if (p.marketValue > maxValueM * 1_000_000) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const displayedPlayers = allExternalPlayers
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 60);

  return (
    <div className="space-y-4">
      {/* Scout Assignment Creator & Search Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              {tr('European Scouting Network', 'เครือข่ายแมวมองยุโรป (European Scouting Network)')}
            </h3>
            <p className="text-xs text-slate-400">
              {tr(
                'Search players across all 280 clubs in 15 European leagues or assign scouts to specific regions.',
                'ค้นหานักเตะจากทั้ง 280 สโมสรใน 15 ลีกยุโรป หรือส่งแมวมองลงพื้นที่ค้นหาดาวรุ่ง'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onCreateAssignment(leagueFilter, posFilter, maxAge, maxValueM * 1_000_000)
            }
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            {tr('+ Assign Scout with Current Filters', '+ มอบหมายงานแมวมองตามเงื่อนไขนี้ (Assign Scout)')}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="sct-league" className="block text-[11px] text-slate-400 mb-1">
              {tr('League / Region', 'ลีก / ภูมิภาค')}
            </label>
            <select
              id="sct-league"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value as 'ALL_EUROPE' | LeagueId)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="ALL_EUROPE">{tr('All 15 European Leagues', 'ยุโรปทั้ง 15 ลีก (All 15 Leagues)')}</option>
              {(Object.keys(LEAGUES_CONFIG) as LeagueId[]).map((lId) => (
                <option key={lId} value={lId}>
                  {LEAGUES_CONFIG[lId].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sct-pos" className="block text-[11px] text-slate-400 mb-1">
              {tr('Position Group', 'กลุ่มตำแหน่ง')}
            </label>
            <select
              id="sct-pos"
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value as 'ANY' | PositionGroup)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="ANY">{tr('Any Position', 'ทุกตำแหน่ง (Any Position)')}</option>
              <option value="GK">{tr('Goalkeeper (GK)', 'ผู้รักษาประตู (GK)')}</option>
              <option value="DEF">{tr('Defender (DEF)', 'กองหลัง (DEF)')}</option>
              <option value="MID">{tr('Midfielder (MID)', 'กองกลาง (MID)')}</option>
              <option value="ATT">{tr('Attacker / Forward (ATT)', 'แนวรุก / กองหน้า (ATT)')}</option>
            </select>
          </div>

          <div>
            <label htmlFor="sct-age" className="block text-[11px] text-slate-400 mb-1">
              {tr(`Max Age: ${maxAge} yrs`, `อายุสูงสุด: ${maxAge} ปี`)}
            </label>
            <input
              id="sct-age"
              type="range"
              min={17}
              max={36}
              value={maxAge}
              onChange={(e) => setMaxAge(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="sct-val" className="block text-[11px] text-slate-400 mb-1">
              {tr(`Max Value: €${maxValueM}M`, `มูลค่าสูงสุด: €${maxValueM}M`)}
            </label>
            <input
              id="sct-val"
              type="range"
              min={5}
              max={150}
              step={5}
              value={maxValueM}
              onChange={(e) => setMaxValueM(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <label htmlFor="sct-search" className="block text-[11px] text-slate-400 mb-1">
              {tr('Search Player / Club', 'ค้นหาชื่อนักเตะ / สโมสร')}
            </label>
            <input
              id="sct-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('Type player or club...', 'พิมพ์ชื่อนักเตะ...')}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            />
          </div>
        </div>
      </div>

      {/* Active Assignments Strip */}
      {world.scoutAssignments.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-400 mb-2">
            {tr(`Active Scouting Assignments (${world.scoutAssignments.length})`, `ภารกิจแมวมองที่กำลังดำเนินการ (${world.scoutAssignments.length})`)}
          </div>
          <div className="flex flex-wrap gap-2">
            {world.scoutAssignments.map((asgn) => (
              <div
                key={asgn.id}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono tabular-nums"
              >
                {tr(
                  `Region: ${asgn.regionOrLeague} · Pos: ${asgn.positionGroup} · Age ≤ ${asgn.maxAge} · ${asgn.daysRemaining}d left (Found ${asgn.reportsGenerated.length})`,
                  `พื้นที่: ${asgn.regionOrLeague} · ตำแหน่ง: ${asgn.positionGroup} · อายุ ≤ ${asgn.maxAge} · เหลือ ${asgn.daysRemaining} วัน (พบ ${asgn.reportsGenerated.length} คน)`
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Database Search Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">{tr('Player Name', 'ชื่อนักเตะ')}</th>
                <th className="py-2.5 px-3">{tr('Club', 'สโมสร')}</th>
                <th className="py-2.5 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Age', 'อายุ')}</th>
                <th className="py-2.5 px-3 text-right">CA</th>
                <th className="py-2.5 px-3 text-right">PA</th>
                <th className="py-2.5 px-3 text-right">{tr('Est. Value', 'มูลค่าประเมิน')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Wage', 'ค่าเหนื่อย')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Scout Report', 'รายงานแมวมอง')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {displayedPlayers.map((p) => {
                const c = world.clubs[p.clubId];
                const rep = world.scoutReports[p.id];
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer(p.id)}
                    className="hover:bg-slate-800/60 cursor-pointer"
                  >
                    <td className="py-2 px-3 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar player={p} club={c} size="sm" />
                        <span>
                          {p.firstName} {p.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{c?.name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {p.positions.join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {getAgeAtDate(p.dateOfBirth, world.gameDate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                      {(p.currentAbility / 10).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-400">
                      {Math.round(p.potentialRange[0] / 10)}–{Math.round(p.potentialRange[1] / 10)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                      €{(p.marketValue / 1_000_000).toFixed(1)}M
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                      €{p.wagePerWeek.toLocaleString()}/w
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {rep ? (
                        <span className="font-mono text-emerald-400 font-semibold">
                          ★ {rep.recommendationScore}/100
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onGenerateScoutReport(p.id);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] cursor-pointer"
                        >
                          {tr('Scout', 'ส่องฟอร์ม')}
                        </button>
                      )}
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

/* ============================================================================
   5. TRANSFERS MARKET VIEW
============================================================================ */
export const TransfersView: React.FC<{
  world: WorldState;
  onSelectPlayer: (playerId: string) => void;
}> = ({ world, onSelectPlayer }) => {
  const { tr } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const [tab, setTab] = useState<'market' | 'shortlist' | 'history'>('market');

  const transferListedPlayers = Object.values(world.players)
    .filter((p) => p.clubId !== club.id && (p.transferListed || p.loanListed))
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 45);

  const shortlistedPlayers = world.shortlistPlayerIds
    .map((id) => world.players[id])
    .filter((p): p is Player => Boolean(p));

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {[
            {
              id: 'market',
              label: tr(
                `Transfer & Loan Market (${transferListedPlayers.length})`,
                `ตลาดนักเตะขึ้นบัญชีขาย/ยืม (${transferListedPlayers.length})`
              ),
            },
            {
              id: 'shortlist',
              label: tr(
                `Target Shortlist (${shortlistedPlayers.length})`,
                `Shortlist เป้าหมาย (${shortlistedPlayers.length})`
              ),
            },
            {
              id: 'history',
              label: tr(
                `Transfer Offers & History (${world.transferOffers.length})`,
                `ประวัติข้อเสนอและการซื้อขาย (${world.transferOffers.length})`
              ),
            },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as typeof tab)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                tab === t.id
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-300">
          {tr('Remaining Transfer Budget:', 'งบซื้อขายคงเหลือ:')}{' '}
          <span className="text-emerald-400 font-bold">
            €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
          </span>{' '}
          · {tr('Available Wage:', 'งบค่าเหนื่อยว่าง:')} €
          {Math.max(
            0,
            club.finances.wageBudgetPerWeek - club.finances.wageUsedPerWeek
          ).toLocaleString()}
          /{tr('wk', 'สัปดาห์')}
        </div>
      </div>

      {tab === 'history' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          {world.transferOffers.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              {tr(
                'No transfer offers submitted yet. Click any player in the Transfer Market or Scouting network to begin negotiations.',
                'ยังไม่มีประวัติการยื่นข้อเสนอซื้อขาย คลิกที่นักเตะคนใดก็ได้ในหน้าตลาดซื้อขายหรือแมวมองเพื่อเปิดโต๊ะเจรจา'
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {world.transferOffers.map((off) => {
                const p = world.players[off.playerId];
                const sellClub = world.clubs[off.sellingClubId];
                return (
                  <div
                    key={off.id}
                    className="flex flex-wrap items-center justify-between p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {p?.firstName} {p?.lastName} ({sellClub?.name})
                      </div>
                      <div className="text-slate-400 font-mono tabular-nums">
                        {off.offerType} · {tr('Upfront', 'เงินต้น')} €{(off.upfrontFee / 1_000_000).toFixed(2)}M + {tr('Installments', 'ผ่อน')} €{(off.installmentsFee / 1_000_000).toFixed(2)}M · {tr('Wage', 'ค่าเหนื่อย')} €{off.proposedWagePerWeek.toLocaleString()}/w
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold ${
                        off.status === 'Completed'
                          ? 'text-emerald-400'
                          : off.status === 'CounterOffer'
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {off.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">{tr('Player Name', 'ชื่อนักเตะ')}</th>
                <th className="py-2.5 px-3">{tr('Current Club', 'สโมสรปัจจุบัน')}</th>
                <th className="py-2.5 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Age', 'อายุ')}</th>
                <th className="py-2.5 px-3 text-right">CA</th>
                <th className="py-2.5 px-3 text-right">{tr('Asking Price', 'ราคาที่ต้องการ')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Status', 'สถานะตลาด')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Action', 'การดำเนินการ')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {(tab === 'market' ? transferListedPlayers : shortlistedPlayers).map((p) => {
                const c = world.clubs[p.clubId];
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlayer(p.id)}
                    className="hover:bg-slate-800/60 cursor-pointer"
                  >
                    <td className="py-2 px-3 font-medium text-white">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar player={p} club={c} size="sm" />
                        <span>
                          {p.firstName} {p.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{c?.name}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300">
                      {p.positions.join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {getAgeAtDate(p.dateOfBirth, world.gameDate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                      {(p.currentAbility / 10).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-white">
                      €{(p.askingPrice / 1_000_000).toFixed(2)}M
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                      {p.transferListed
                        ? tr('Transfer Listed', 'ขึ้นบัญชีขาย')
                        : p.loanListed
                          ? tr('Loan Listed', 'ปล่อยยืม')
                          : tr('Standard', 'ปกติ')}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlayer(p.id);
                        }}
                        className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded text-[11px] cursor-pointer"
                      >
                        {tr('Make Offer', 'ยื่นข้อเสนอซื้อ/ยืม')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   6. COMPETITIONS & SCHEDULE VIEW (15 DOMESTIC LEAGUES + NEW UEFA SWISS FORMAT)
============================================================================ */
export const CompetitionsAndScheduleView: React.FC<{
  world: WorldState;
  initialMode: 'competitions' | 'schedule';
  onSelectPlayer: (playerId: string) => void;
}> = ({ world, initialMode, onSelectPlayer }) => {
  const { tr } = useLanguage();
  const myClub = world.clubs[world.controlledClubId];

  // Detect which UEFA competition the user's club is participating in (if any)
  const myUefaComp: UefaCompetitionId | null =
    (['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]).find((uId) =>
      world.uefaStandings?.[uId]?.some((s) => s.clubId === myClub.id)
    ) || null;

  const [compCategory, setCompCategory] = useState<'domestic' | 'uefa'>('domestic');
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>(myClub.leagueId);
  const [selectedMatchday, setSelectedMatchday] = useState<number>(1);
  const [subView, setSubView] = useState<'table' | 'fixtures' | 'stats'>(
    initialMode === 'schedule' ? 'fixtures' : 'table'
  );

  // UEFA state
  const [selectedUefaComp, setSelectedUefaComp] = useState<UefaCompetitionId>(
    myUefaComp || 'UEFA_UCL'
  );
  const [uefaSubView, setUefaSubView] = useState<'table' | 'pots' | 'knockout' | 'fixtures'>(
    initialMode === 'schedule' ? 'fixtures' : 'table'
  );
  const [selectedUefaMatchday, setSelectedUefaMatchday] = useState<number>(1);
  const [inspectedUefaClubId, setInspectedUefaClubId] = useState<string>('');

  const cfg = LEAGUES_CONFIG[selectedLeague];
  const standings = world.standings[selectedLeague] || [];
  const leagueFixtures = world.fixtures.filter(
    (f) => f.competitionId === selectedLeague && f.matchday === selectedMatchday
  );
  const leaders = getLeaguePlayerLeaders(selectedLeague, world.clubs, world.players);

  // Country UEFA quota lookup for domestic league table badges
  const countryQuotaRule = UEFA_COUNTRY_QUOTAS.find((q) => q.leagueId === selectedLeague);
  const uclCutoff = countryQuotaRule ? countryQuotaRule.totalPerCompetition : cfg.championsLeagueSpots;
  const uelCutoff = countryQuotaRule ? uclCutoff + countryQuotaRule.totalPerCompetition : uclCutoff;
  const ueclCutoff = countryQuotaRule ? uelCutoff + countryQuotaRule.totalPerCompetition : uelCutoff;

  // UEFA Competition Data
  const uefaCfg = UEFA_COMPETITIONS_CONFIG[selectedUefaComp];
  const uefaStandings = world.uefaStandings?.[selectedUefaComp] || [];
  const uefaPots = world.uefaPots?.[selectedUefaComp] || [];
  const uefaBracket = getUefaKnockoutBracketSummary(world, selectedUefaComp);

  // Find which pot each club belongs to (1..4)
  const potIndexByClubId: Record<string, number> = {};
  uefaPots.forEach((pot, pIdx) => {
    pot.forEach((cId) => {
      potIndexByClubId[cId] = pIdx + 1;
    });
  });

  const activeInspectedClubId =
    inspectedUefaClubId && potIndexByClubId[inspectedUefaClubId]
      ? inspectedUefaClubId
      : potIndexByClubId[myClub.id]
        ? myClub.id
        : uefaPots[0]?.[0] || uefaStandings[0]?.clubId || '';

  const inspectedClubFixtures = world.fixtures
    .filter(
      (f) =>
        f.competitionId === selectedUefaComp &&
        (f.uefaStage === 'LEAGUE_PHASE' || f.matchday <= uefaCfg.leaguePhaseMatches) &&
        (f.homeClubId === activeInspectedClubId || f.awayClubId === activeInspectedClubId)
    )
    .sort((a, b) => a.matchday - b.matchday);

  const uefaAllMatchdays = Array.from(
    new Set(
      world.fixtures
        .filter((f) => f.competitionId === selectedUefaComp)
        .map((f) => f.matchday)
    )
  ).sort((a, b) => a - b);

  const uefaMatchdayFixtures = world.fixtures.filter(
    (f) => f.competitionId === selectedUefaComp && f.matchday === selectedUefaMatchday
  );

  return (
    <div className="space-y-4">
      {/* Top Category Switcher: Domestic Leagues vs UEFA Club Competitions (New Swiss Format) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCompCategory('domestic')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer ${
              compCategory === 'domestic'
                ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            {tr('🏟️ Domestic Leagues (15 European Leagues)', '🏟️ ฟุตบอลลีกภายในประเทศ (15 ลีกยุโรป)')}
          </button>
          <button
            type="button"
            onClick={() => setCompCategory('uefa')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-2 ${
              compCategory === 'uefa'
                ? 'bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/20'
                : 'bg-slate-950 text-sky-300 hover:text-white border border-sky-500/40'
            }`}
          >
            <span>
              {tr('🏆 UEFA Club Competitions (New Format — 36-Team Swiss)', '🏆 ฟุตบอลถ้วยยุโรป UEFA (New Format — 36 ทีม Swiss)')}
            </span>
            {myUefaComp && (
              <span className="px-1.5 py-0.5 rounded bg-slate-950/30 text-[10px] font-mono">
                {UEFA_COMPETITIONS_CONFIG[myUefaComp].shortName}
              </span>
            )}
          </button>
        </div>

        {myUefaComp && (
          <div className="text-[11px] font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            {tr(`Your club (${myClub.shortName}) qualified for:`, `สโมสรของคุณ (${myClub.shortName}) ได้สิทธิ์ลุยถ้วยยุโรป:`)}{' '}
            <span className="text-sky-400 font-bold">
              {UEFA_COMPETITIONS_CONFIG[myUefaComp].name}
            </span>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODE A: UEFA CLUB COMPETITIONS (NEW 36-TEAM SWISS LEAGUE PHASE + KO)
      ===================================================================== */}
      {compCategory === 'uefa' ? (
        <div className="space-y-4">
          {/* 3 UEFA Competitions Selector + 4 Sub-Tabs */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(['UEFA_UCL', 'UEFA_UEL', 'UEFA_UECL'] as UefaCompetitionId[]).map((uId) => {
                const u = UEFA_COMPETITIONS_CONFIG[uId];
                const isActive = selectedUefaComp === uId;
                const isUserInThis = myUefaComp === uId;
                return (
                  <button
                    key={uId}
                    type="button"
                    onClick={() => {
                      setSelectedUefaComp(uId);
                      setSelectedUefaMatchday(1);
                    }}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                      isActive
                        ? 'bg-sky-500/20 border-sky-400 text-white shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span className="font-mono font-bold text-sky-400">{u.shortName}</span>
                    <span>{u.name}</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {tr(`(36 Teams · ${u.leaguePhaseMatches} MD)`, `(36 ทีม · ${u.leaguePhaseMatches} นัด)`)}
                    </span>
                    {isUserInThis && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                        {tr('Your Club', 'ทีมของคุณ')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'table', label: tr('1. 36-Team Swiss Standings', '1. ตารางคะแนนรวม 36 ทีม (Swiss Table)') },
                { id: 'pots', label: tr('2. 4 Seeding Pots & 10-League Quotas', '2. โถทีมวาง 4 โถ & โควตา 10 ลีก') },
                { id: 'knockout', label: tr('3. Knockout Phase (Play-offs & R16)', '3. รอบน็อกเอาต์ (Play-offs & R16)') },
                { id: 'fixtures', label: tr(`4. Fixtures (${uefaCfg.leaguePhaseMatches} Matchdays)`, `4. โปรแกรมแข่งขัน (${uefaCfg.leaguePhaseMatches} นัด)`) },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setUefaSubView(tab.id as typeof uefaSubView)}
                  className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-all ${
                    uefaSubView === tab.id
                      ? 'bg-slate-800 text-sky-400 font-semibold border border-sky-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* UEFA Format Rule Banner */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-white">{tr(uefaCfg.name, uefaCfg.nameTh)}</span>
              <span className="text-slate-400 ml-2">
                {tr(
                  `Single 36-team League Phase (${uefaCfg.leaguePhaseMatches} distinct opponents: ${uefaCfg.leaguePhaseMatches / 2} Home, ${uefaCfg.leaguePhaseMatches / 2} Away)`,
                  uefaCfg.subtitleTh
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                {tr('Ranks 1–8: Direct to R16 (Seeded)', 'อันดับ 1–8: เข้ารอบ 16 ทีมอัตโนมัติ (Seeded)')}
              </span>
              <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                {tr('Ranks 9–16: Play-offs (Seeded)', 'อันดับ 9–16: เพลย์ออฟ (ทีมวาง)')}
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                {tr('Ranks 17–24: Play-offs (Unseeded)', 'อันดับ 17–24: เพลย์ออฟ (เจอ 9–16)')}
              </span>
              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">
                {tr('Ranks 25–36: Eliminated (No Drop-Down)', 'อันดับ 25–36: ตกรอบทันที (ไม่ตกไปถ้วยรอง)')}
              </span>
            </div>
          </div>

          {/* SUB-TAB 1: 36-TEAM SWISS LEAGUE PHASE TABLE */}
          {uefaSubView === 'table' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-3">{tr('Pos', 'อันดับ')}</th>
                    <th className="py-2.5 px-3">{tr('Club (Country · Pot)', 'สโมสร (ประเทศ · โถ)')}</th>
                    <th className="py-2.5 px-3">{tr('Qualification Status', 'สถานะการเข้ารอบ')}</th>
                    <th className="py-2.5 px-3 text-right">P</th>
                    <th className="py-2.5 px-3 text-right">W</th>
                    <th className="py-2.5 px-3 text-right">D</th>
                    <th className="py-2.5 px-3 text-right">L</th>
                    <th className="py-2.5 px-3 text-right">GF</th>
                    <th className="py-2.5 px-3 text-right">GA</th>
                    <th className="py-2.5 px-3 text-right">GD</th>
                    <th className="py-2.5 px-3 text-right">PTS</th>
                    <th className="py-2.5 px-3 text-right">{tr('Form', 'ฟอร์ม 5 นัด')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {uefaStandings.map((row, idx) => {
                    const pos = idx + 1;
                    const c = world.clubs[row.clubId];
                    const isMine = row.clubId === myClub.id;
                    const potNum = potIndexByClubId[row.clubId] || 4;

                    const isTop8 = pos <= 8;
                    const isPlayoffSeed = pos >= 9 && pos <= 16;
                    const isPlayoffUnseeded = pos >= 17 && pos <= 24;

                    return (
                      <tr
                        key={row.clubId}
                        className={`${
                          isMine
                            ? 'bg-emerald-950/40 text-emerald-200 font-semibold'
                            : 'hover:bg-slate-800/50 text-slate-200'
                        } ${pos === 8 || pos === 16 || pos === 24 ? 'border-b-2 border-slate-700' : ''}`}
                      >
                        <td className="py-2 px-3">
                          <span
                            className={
                              isTop8
                                ? 'text-emerald-400 font-bold'
                                : isPlayoffSeed
                                  ? 'text-sky-400 font-bold'
                                  : isPlayoffUnseeded
                                    ? 'text-amber-400 font-bold'
                                    : 'text-red-400'
                            }
                          >
                            {pos}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans font-medium text-white">
                          <div className="flex items-center gap-2">
                            <ClubBadge club={c} size="xs" />
                            <span>{c?.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800">
                              {c?.countryId} · Pot {potNum}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 font-sans text-[11px]">
                          {isTop8 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                              {tr('R16 Direct (Seeded)', 'R16 อัตโนมัติ (ทีมวาง)')}
                            </span>
                          ) : isPlayoffSeed ? (
                            <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-semibold">
                              {tr('Play-off Seed (9–16)', 'เพลย์ออฟ (ทีมวาง 9–16)')}
                            </span>
                          ) : isPlayoffUnseeded ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                              {tr('Play-off (17–24)', 'เพลย์ออฟ (17–24)')}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                              {tr('Eliminated', 'ตกรอบทันที')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">{row.played}</td>
                        <td className="py-2 px-3 text-right">{row.won}</td>
                        <td className="py-2 px-3 text-right">{row.drawn}</td>
                        <td className="py-2 px-3 text-right">{row.lost}</td>
                        <td className="py-2 px-3 text-right">{row.goalsFor}</td>
                        <td className="py-2 px-3 text-right">{row.goalsAgainst}</td>
                        <td className="py-2 px-3 text-right">
                          {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white text-sm">
                          {row.points}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {row.form.length > 0 ? row.form.join(' · ') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* SUB-TAB 2: 4 POTS SEEDING, SWISS DRAW INSPECTOR & 10-COUNTRY QUOTA TABLE */}
          {uefaSubView === 'pots' && (
            <div className="space-y-4">
              {/* 4 Pots Grid (9 Clubs per Pot) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {uefaPots.map((potClubs, pIdx) => (
                  <div
                    key={pIdx}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-sky-400 font-mono">
                        {tr(`POT ${pIdx + 1}`, `โถที่ ${pIdx + 1} (POT ${pIdx + 1})`)}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {tr(`Seeds ${pIdx * 9 + 1}–${(pIdx + 1) * 9}`, `อันดับค่าสัมประสิทธิ์ ${pIdx * 9 + 1}–${(pIdx + 1) * 9}`)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {potClubs.map((cId, cIdx) => {
                        const c = world.clubs[cId];
                        const isSelected = cId === activeInspectedClubId;
                        return (
                          <button
                            key={cId}
                            type="button"
                            onClick={() => setInspectedUefaClubId(cId)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-sky-500/20 border border-sky-400 text-white font-semibold'
                                : 'bg-slate-950 hover:bg-slate-800/70 text-slate-200 border border-slate-800/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-[10px] font-mono text-slate-500 w-4">
                                {pIdx * 9 + cIdx + 1}.
                              </span>
                              <ClubBadge club={c} size="xs" />
                              <span className="truncate">{c?.name}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 ml-1 shrink-0">
                              {c?.countryId} · {c?.reputation}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Swiss Draw Opponent Inspector for Selected Club */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {tr('Swiss Draw Opponents for ', 'ผลการสุ่มคู่แข่งระบบ Swiss ของ ')}
                      <span className="text-sky-400">
                        {world.clubs[activeInspectedClubId]?.name}
                      </span>{' '}
                      (Pot {potIndexByClubId[activeInspectedClubId] || 1})
                    </h3>
                    <p className="text-xs text-slate-400">
                      {tr(
                        `Click any club from the 4 pots above to inspect its ${uefaCfg.leaguePhaseMatches} distinct League Phase opponents (${uefaCfg.leaguePhaseMatches / 2} Home / ${uefaCfg.leaguePhaseMatches / 2} Away).`,
                        `คลิกเลือกสโมสรใดก็ได้จาก 4 โถด้านบนเพื่อดูคู่แข่ง ${uefaCfg.leaguePhaseMatches} นัด (เจอคู่แข่งไม่ซ้ำหน้า แบ่งเป็นเหย้า-เยือนอย่างละครึ่ง)`
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {inspectedClubFixtures.map((fix) => {
                    const isHome = fix.homeClubId === activeInspectedClubId;
                    const oppId = isHome ? fix.awayClubId : fix.homeClubId;
                    const oppClub = world.clubs[oppId];
                    const oppPot = potIndexByClubId[oppId] || 4;
                    return (
                      <div
                        key={fix.id}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-slate-400">
                              MD{fix.matchday}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                isHome
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-300'
                              }`}
                            >
                              {isHome ? tr('HOME (H)', 'เหย้า (H)') : tr('AWAY (A)', 'เยือน (A)')}
                            </span>
                            <span className="text-[10px] font-mono text-sky-400">
                              Pot {oppPot}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 truncate font-semibold text-white">
                            <ClubBadge club={oppClub} size="xs" />
                            <span className="truncate">{oppClub?.name}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono shrink-0">
                          {fix.status === 'Completed' && fix.result ? (
                            <span className="px-2 py-1 rounded bg-slate-900 text-emerald-400 font-bold">
                              {fix.result.homeGoals} - {fix.result.awayGoals}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400">{fix.kickoffDate}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 10-Country 36-Team Quota Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white">
                  {tr(
                    '📊 10-Country 36-Team Qualification Quota Allocation (UCL / UEL / UECL)',
                    '📊 ตารางจัดสรรโควตา 36 ทีมจาก 10 ประเทศในเกม (UCL / UEL / UECL)'
                  )}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                  {UEFA_COUNTRY_QUOTAS.map((q) => (
                    <div
                      key={q.leagueId}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-slate-400">Rank #{q.rank}</span>
                        <span className="text-sky-400 font-bold">{q.countryCode}</span>
                      </div>
                      <div className="font-semibold text-white">{q.countryName}</div>
                      <div className="text-[11px] text-emerald-400 font-mono">
                        {tr(
                          `${q.totalPerCompetition} teams/cup (Top ${q.totalPerCompetition - 1} League + 1 Domestic Cup)`,
                          q.descriptionTh
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 3: KNOCKOUT PHASE BRACKET (PLAY-OFFS 9-24, R16, QF, SF, FINAL) */}
          {uefaSubView === 'knockout' && (
            <div className="space-y-4">
              {/* Top 8 Automatic R16 Seeds */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-emerald-400">
                    {tr(
                      '🌟 Top 8 Seeds (Direct Qualification to Round of 16 — Home 2nd Leg)',
                      '🌟 ทีมวางอันดับ 1–8 (ผ่านเข้ารอบ 16 ทีมสุดท้ายอัตโนมัติ — ได้เล่นนัดสองในบ้าน)'
                    )}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">Seeded 1–8</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                  {uefaStandings.slice(0, 8).map((row, idx) => {
                    const c = world.clubs[row.clubId];
                    return (
                      <div
                        key={row.clubId}
                        className="p-2.5 rounded-lg bg-slate-950 border border-emerald-500/30 flex flex-col items-center text-center gap-1"
                      >
                        <span className="text-[10px] font-mono text-emerald-400 font-bold">
                          Seed #{idx + 1}
                        </span>
                        <ClubBadge club={c} size="sm" />
                        <span className="text-xs font-semibold text-white truncate w-full">
                          {c?.shortName}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {row.points} pts (GD {row.goalDifference >= 0 ? `+${row.goalDifference}` : row.goalDifference})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Knockout Phase Play-offs (Ranks 9-16 vs Ranks 17-24) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-sky-400">
                    {tr(
                      '⚔️ Knockout Phase Play-offs (Seeds 9–16 vs Unseeded 17–24 · Two Legs)',
                      '⚔️ รอบเพลย์ออฟน็อกเอาต์ (Knockout Phase Play-offs: อันดับ 9–16 พบ อันดับ 17–24 แบบเหย้า-เยือน)'
                    )}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    {uefaBracket.isProjectedKpo
                      ? tr('Projected Pairings from Current Table', 'จำลองประกบคู่ตามตารางคะแนนปัจจุบัน')
                      : tr('Official Draw Pairings', 'ผลการประกบคู่ทางการ')}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {uefaBracket.kpo.map((tie) => {
                    const seeded = world.clubs[tie.seededClubId];
                    const unseeded = world.clubs[tie.unseededClubId];
                    return (
                      <div
                        key={tie.tieIndex}
                        className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs"
                      >
                        <div className="text-[11px] font-mono text-slate-400 flex justify-between">
                          <span>Play-off #{tie.tieIndex}</span>
                          <span>
                            {tr(`Rank ${8 + tie.tieIndex} vs ${25 - tie.tieIndex}`, `อันดับ ${8 + tie.tieIndex} vs ${25 - tie.tieIndex}`)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-semibold text-white truncate">
                            <ClubBadge club={seeded} size="xs" />
                            <span className="truncate">{seeded?.name}</span>
                            <span className="text-[10px] text-sky-400 font-mono">
                              {tr('(Seed)', '(วาง)')}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-white">
                            {tie.leg1Fixture?.status === 'Completed' ? tie.seededAggGoals : '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-medium text-slate-300 truncate">
                            <ClubBadge club={unseeded} size="xs" />
                            <span className="truncate">{unseeded?.name}</span>
                          </div>
                          <span className="font-mono font-bold text-slate-300">
                            {tie.leg1Fixture?.status === 'Completed' ? tie.unseededAggGoals : '-'}
                          </span>
                        </div>
                        {tie.winnerClubId && (
                          <div className="pt-1 border-t border-slate-800 text-[11px] font-mono text-emerald-400">
                            {tr('Advances to R16:', 'ผู้ชนะเข้ารอบ 16 ทีม:')} {world.clubs[tie.winnerClubId]?.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Later Knockout Rounds (R16, QF, SF, FINAL) when generated */}
              {([
                {
                  title: tr('Round of 16 (Two Legs)', 'รอบ 16 ทีมสุดท้าย (Round of 16 — เหย้า-เยือน)'),
                  list: uefaBracket.r16,
                },
                {
                  title: tr('Quarter-Finals (Two Legs)', 'รอบก่อนรองชนะเลิศ (Quarter-Finals — เหย้า-เยือน)'),
                  list: uefaBracket.qf,
                },
                {
                  title: tr('Semi-Finals (Two Legs)', 'รอบรองชนะเลิศ (Semi-Finals — เหย้า-เยือน)'),
                  list: uefaBracket.sf,
                },
              ] as const).map(
                (stageBlock) =>
                  stageBlock.list.length > 0 && (
                    <div
                      key={stageBlock.title}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
                    >
                      <h3 className="text-sm font-bold text-white">{stageBlock.title}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        {stageBlock.list.map((tie) => {
                          const sClub = world.clubs[tie.seededClubId];
                          const uClub = world.clubs[tie.unseededClubId];
                          return (
                            <div
                              key={tie.tieIndex}
                              className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between text-white font-semibold">
                                <span>{sClub?.name}</span>
                                <span className="font-mono">{tie.seededAggGoals}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-300">
                                <span>{uClub?.name}</span>
                                <span className="font-mono">{tie.unseededAggGoals}</span>
                              </div>
                              {tie.winnerClubId && (
                                <div className="text-[11px] font-mono text-emerald-400 pt-1 border-t border-slate-800">
                                  {tr('Winner:', 'เข้ารอบ:')} {world.clubs[tie.winnerClubId]?.name}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
              )}

              {uefaBracket.finalTie && (
                <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-5 text-center space-y-2">
                  <div className="text-xs font-mono text-amber-400 uppercase tracking-wider">
                    {tr('🏆 UEFA FINAL', '🏆 UEFA FINAL — นัดชิงชนะเลิศ')}
                  </div>
                  <div className="text-base font-bold text-white">
                    {world.clubs[uefaBracket.finalTie.seededClubId]?.name}{' '}
                    <span className="text-emerald-400 font-mono px-2">
                      {uefaBracket.finalTie.seededAggGoals} - {uefaBracket.finalTie.unseededAggGoals}
                    </span>{' '}
                    {world.clubs[uefaBracket.finalTie.unseededClubId]?.name}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB 4: UEFA FIXTURES BY MATCHDAY */}
          {uefaSubView === 'fixtures' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">
                  {tr(
                    `${uefaCfg.name} Fixtures — Matchday ${selectedUefaMatchday}`,
                    `โปรแกรมการแข่งขัน ${uefaCfg.name} — Matchday ${selectedUefaMatchday}`
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUefaMatchday((m) => Math.max(1, m - 1))}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded cursor-pointer"
                  >
                    {tr('← Prev', '← นัดก่อนหน้า')}
                  </button>
                  <select
                    aria-label="Select UEFA Matchday"
                    value={selectedUefaMatchday}
                    onChange={(e) => setSelectedUefaMatchday(Number(e.target.value))}
                    className="px-3 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono"
                  >
                    {(uefaAllMatchdays.length > 0
                      ? uefaAllMatchdays
                      : Array.from({ length: uefaCfg.leaguePhaseMatches }, (_, i) => i + 1)
                    ).map((md) => (
                      <option key={md} value={md}>
                        {md <= uefaCfg.leaguePhaseMatches
                          ? `League Phase — Matchday ${md}`
                          : `Knockout Phase — Matchday ${md}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedUefaMatchday((m) =>
                        Math.min(
                          uefaAllMatchdays[uefaAllMatchdays.length - 1] ||
                            uefaCfg.leaguePhaseMatches,
                          m + 1
                        )
                      )
                    }
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded cursor-pointer"
                  >
                    {tr('Next →', 'นัดถัดไป →')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {uefaMatchdayFixtures.map((fix) => {
                  const h = world.clubs[fix.homeClubId];
                  const a = world.clubs[fix.awayClubId];
                  const hPot = potIndexByClubId[fix.homeClubId];
                  const aPot = potIndexByClubId[fix.awayClubId];
                  return (
                    <div
                      key={fix.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                    >
                      <div className="flex items-center justify-end gap-2 w-44 truncate text-right">
                        <span className="text-[10px] font-mono text-slate-500">
                          {hPot ? `P${hPot}` : ''}
                        </span>
                        <span className="font-medium text-white truncate">{h?.name}</span>
                        <ClubBadge club={h} size="xs" />
                      </div>
                      <span className="px-3 py-1 rounded bg-slate-900 font-mono tabular-nums font-bold text-sky-400">
                        {fix.status === 'Completed' && fix.result
                          ? `${fix.result.homeGoals} - ${fix.result.awayGoals}`
                          : fix.kickoffDate}
                      </span>
                      <div className="flex items-center gap-2 w-44 truncate">
                        <ClubBadge club={a} size="xs" />
                        <span className="font-medium text-white truncate">{a?.name}</span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {aPot ? `P${aPot}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* =====================================================================
           MODE B: 15 DOMESTIC LEAGUES
        ===================================================================== */
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(LEAGUES_CONFIG) as LeagueId[]).map((lId) => {
                const lCfg = LEAGUES_CONFIG[lId];
                return (
                  <button
                    key={lId}
                    type="button"
                    onClick={() => {
                      setSelectedLeague(lId);
                      setSelectedMatchday(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                      selectedLeague === lId
                        ? 'bg-emerald-500 text-slate-950 font-semibold'
                        : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    {lCfg.countryFlag} · {lCfg.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              {[
                { id: 'table', label: tr('League Standings', 'ตารางคะแนน (Standings)') },
                {
                  id: 'fixtures',
                  label: tr(
                    `Fixtures & Results (${cfg.matchesPerClub} MD)`,
                    `โปรแกรมและผลการแข่งขัน (${cfg.matchesPerClub} นัด)`
                  ),
                },
                { id: 'stats', label: tr('Top Scorers & Player Stats', 'ดาวซัลโวและสถิติผู้เล่น') },
              ].map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSubView(v.id as typeof subView)}
                  className={`px-3 py-1.5 text-xs rounded-lg cursor-pointer ${
                    subView === v.id
                      ? 'bg-slate-800 text-emerald-400 font-semibold border border-emerald-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {subView === 'table' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                    <th className="py-2.5 px-3">{tr('Pos', 'อันดับ')}</th>
                    <th className="py-2.5 px-3">{tr('Club', 'สโมสร')}</th>
                    <th className="py-2.5 px-3 text-right">P</th>
                    <th className="py-2.5 px-3 text-right">W</th>
                    <th className="py-2.5 px-3 text-right">D</th>
                    <th className="py-2.5 px-3 text-right">L</th>
                    <th className="py-2.5 px-3 text-right">GF</th>
                    <th className="py-2.5 px-3 text-right">GA</th>
                    <th className="py-2.5 px-3 text-right">GD</th>
                    <th className="py-2.5 px-3 text-right">PTS</th>
                    <th className="py-2.5 px-3 text-right">{tr('Form', 'ฟอร์ม 5 นัด')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {standings.map((row, idx) => {
                    const pos = idx + 1;
                    const c = world.clubs[row.clubId];
                    const isMine = row.clubId === myClub.id;
                    const isTier2 = cfg.tier === 2;
                    const isUcl = !isTier2 && pos <= uclCutoff;
                    const isUel = !isTier2 && !isUcl && pos <= uelCutoff;
                    const isUecl = !isTier2 && !isUcl && !isUel && pos <= ueclCutoff;
                    const isProm = isTier2 && pos <= cfg.championsLeagueSpots;
                    const isRel = pos > cfg.targetClubCount - cfg.relegationSpots;

                    return (
                      <tr
                        key={row.clubId}
                        className={
                          isMine
                            ? 'bg-emerald-950/40 text-emerald-200 font-semibold'
                            : 'hover:bg-slate-800/50 text-slate-200'
                        }
                      >
                        <td className="py-2 px-3">
                          <span
                            className={
                              isUcl || isProm
                                ? 'text-emerald-400 font-bold'
                                : isUel
                                  ? 'text-orange-400 font-bold'
                                  : isUecl
                                    ? 'text-sky-400 font-bold'
                                    : isRel
                                      ? 'text-red-400 font-bold'
                                      : 'text-slate-400'
                            }
                          >
                            {pos}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-sans font-medium text-white">
                          <div className="flex items-center gap-2">
                            <ClubBadge club={c} size="xs" />
                            <span>{c?.name}</span>
                            {isProm && (
                              <span className="text-[10px] text-emerald-400 font-mono">PROM</span>
                            )}
                            {isUcl && (
                              <span className="text-[10px] text-sky-400 font-mono">UCL</span>
                            )}
                            {isUel && (
                              <span className="text-[10px] text-orange-400 font-mono">UEL</span>
                            )}
                            {isUecl && (
                              <span className="text-[10px] text-emerald-400 font-mono">UECL</span>
                            )}
                            {isRel && <span className="text-[10px] text-red-400 font-mono">REL</span>}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right">{row.played}</td>
                        <td className="py-2 px-3 text-right">{row.won}</td>
                        <td className="py-2 px-3 text-right">{row.drawn}</td>
                        <td className="py-2 px-3 text-right">{row.lost}</td>
                        <td className="py-2 px-3 text-right">{row.goalsFor}</td>
                        <td className="py-2 px-3 text-right">{row.goalsAgainst}</td>
                        <td className="py-2 px-3 text-right">
                          {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-white text-sm">
                          {row.points}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {row.form.length > 0 ? row.form.join(' · ') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {subView === 'fixtures' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  {tr(
                    `${cfg.name} Fixtures — Matchday ${selectedMatchday} / ${cfg.matchesPerClub}`,
                    `โปรแกรมการแข่งขัน ${cfg.name} — Matchday ${selectedMatchday} / ${cfg.matchesPerClub}`
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMatchday((m) => Math.max(1, m - 1))}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded cursor-pointer"
                  >
                    {tr('← Prev', '← นัดก่อนหน้า')}
                  </button>
                  <select
                    aria-label="Select Matchday"
                    value={selectedMatchday}
                    onChange={(e) => setSelectedMatchday(Number(e.target.value))}
                    className="px-3 py-1 bg-slate-950 border border-slate-800 rounded text-xs font-mono"
                  >
                    {Array.from({ length: cfg.matchesPerClub }, (_, i) => i + 1).map((md) => (
                      <option key={md} value={md}>
                        Matchday {md}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedMatchday((m) => Math.min(cfg.matchesPerClub, m + 1))
                    }
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded cursor-pointer"
                  >
                    {tr('Next →', 'นัดถัดไป →')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {leagueFixtures.map((fix) => {
                  const h = world.clubs[fix.homeClubId];
                  const a = world.clubs[fix.awayClubId];
                  return (
                    <div
                      key={fix.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                    >
                      <span className="font-medium text-white w-40 truncate text-right">
                        {h?.name}
                      </span>
                      <span className="px-3 py-1 rounded bg-slate-900 font-mono tabular-nums font-bold text-emerald-400">
                        {fix.status === 'Completed' && fix.result
                          ? `${fix.result.homeGoals} - ${fix.result.awayGoals}`
                          : fix.kickoffDate}
                      </span>
                      <span className="font-medium text-white w-40 truncate">{a?.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {subView === 'stats' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: tr('Top Scorers', 'ดาวซัลโวสูงสุด (Top Scorers)'), list: leaders.topScorers, key: 'goals' as const },
                { title: tr('Top Assists', 'แอสซิสต์สูงสุด (Top Assists)'), list: leaders.topAssists, key: 'assists' as const },
                { title: tr('Highest Average Rating', 'เรตติ้งเฉลี่ยสูงสุด (Top Rating)'), list: leaders.topRated, key: 'averageRating' as const },
              ].map((col) => (
                <div key={col.title} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-emerald-400 mb-3">{col.title}</h3>
                  {col.list.length === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      {tr('Stats available after Matchday 1', 'รอข้อมูลหลังเริ่มแข่งขันนัดแรก')}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {col.list.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlayer(p.id)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded bg-slate-950 hover:bg-slate-800 text-xs cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate text-left">
                            <span className="font-mono text-slate-500">{idx + 1}.</span>
                            <PlayerAvatar player={p} club={world.clubs[p.clubId]} size="xs" />
                            <span className="text-white font-medium truncate">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              ({world.clubs[p.clubId]?.shortName})
                            </span>
                          </div>
                          <span className="font-mono tabular-nums font-bold text-emerald-400">
                            {col.key === 'averageRating'
                              ? p.stats.averageRating.toFixed(2)
                              : p.stats[col.key]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ============================================================================
   7. CLUB, STAFF, YOUTH ACADEMY, WORLD & MANAGER PROFILE VIEWS
============================================================================ */
export const ClubStaffYouthWorldView: React.FC<{
  mode: 'club' | 'staff' | 'youth' | 'world' | 'manager';
  world: WorldState;
  saveSlots: SaveSlotMeta[];
  authUser: User | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onSelectPlayer: (playerId: string) => void;
  onBoardRequest: (type: 'budget' | 'training_facility' | 'youth_facility') => void;
  onHireStaff: (staffId: string) => void;
  onRecruitYouth: () => void;
  onPromoteYouth: (playerId: string) => void;
  onSaveToSlot: (slotId: string) => void;
  onLoadSlot: (slotId: string) => void;
}> = ({
  mode,
  world,
  saveSlots,
  authUser,
  onGoogleSignIn,
  onGoogleSignOut,
  onSelectPlayer,
  onBoardRequest,
  onHireStaff,
  onRecruitYouth,
  onPromoteYouth,
  onSaveToSlot,
  onLoadSlot,
}) => {
  const { lang, setLang, tr, trDynamic } = useLanguage();
  const club = world.clubs[world.controlledClubId];
  const [worldLeagueFilter, setWorldLeagueFilter] = useState<LeagueId>('ENG_PL');
  const [inspectedClubId, setInspectedClubId] = useState<string>(club.id);

  if (mode === 'club') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Finances & Board Requests */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-base font-display font-bold text-white">
              {tr(`Club Overview & Financial Status (${club.name})`, `ข้อมูลสโมสรและสถานะการเงิน (${club.name})`)}
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">{tr('Overall Balance', 'ยอดเงินคงเหลือ (Balance)')}</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  €{(club.finances.balance / 1_000_000).toFixed(2)}M
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">{tr('Transfer Budget', 'งบซื้อขาย (Transfer Budget)')}</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {tr(`Stadium (${club.stadiumName})`, `สนามเหย้า (${club.stadiumName})`)}
                </div>
                <div className="text-base font-bold text-slate-200 mt-0.5">
                  {club.stadiumCapacity.toLocaleString()} {tr('seats', 'ที่นั่ง')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">
                  {tr('Training / Youth Facilities', 'ศูนย์ฝึกซ้อม / อคาเดมี')}
                </div>
                <div className="text-base font-bold text-sky-400 mt-0.5">
                  {tr(`Lvl ${club.trainingFacilities}/20 · ${club.youthFacilities}/20`, `ระดับ ${club.trainingFacilities}/20 · ${club.youthFacilities}/20`)}
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                {tr('Boardroom Requests', 'ยื่นคำร้องต่อบอร์ดบริหาร (Board Requests)')}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onBoardRequest('budget')}
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  {tr('Request Additional Transfer Budget (+€5.0M)', 'ขอเพิ่มงบประมาณซื้อขาย (+€5.0M)')}
                </button>
                <button
                  type="button"
                  onClick={() => onBoardRequest('training_facility')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  {tr('Upgrade Training Facilities (€3.5M)', 'ขออัปเกรดศูนย์ฝึกซ้อม (€3.5M)')}
                </button>
                <button
                  type="button"
                  onClick={() => onBoardRequest('youth_facility')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  {tr('Upgrade Youth Academy (€2.5M)', 'ขออัปเกรดศูนย์ฝึกเยาวชน (€2.5M)')}
                </button>
              </div>
            </div>
          </div>

          {/* Audited Financial Transaction Ledger */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col max-h-[460px]">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              {tr('Audited Transaction Ledger', 'สมุดบัญชีธุรกรรมการเงิน (Audited Transaction Log)')}
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {world.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <div>
                    <div className="font-medium text-white">{trDynamic(tx.description)}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {tx.date} · {tx.category}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <div
                      className={
                        tx.amount >= 0
                          ? 'text-emerald-400 font-semibold'
                          : 'text-red-400 font-semibold'
                      }
                    >
                      {tx.amount >= 0 ? '+' : ''}€{tx.amount.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {tr('Bal:', 'คงเหลือ')} €{(tx.balanceAfter / 1_000_000).toFixed(2)}M
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'staff') {
    const clubStaff = Object.values(world.staff).filter((s) => s.clubId === club.id);
    const freeStaff = Object.values(world.staff).filter((s) => s.clubId === null);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-emerald-400">
            {tr(`Current Coaching & Backroom Staff (${clubStaff.length})`, `ทีมงานสตาฟฟ์โค้ชปัจจุบันของ ${club.name} (${clubStaff.length})`)}
          </h3>
          <div className="space-y-2">
            {clubStaff.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">{s.name}</div>
                  <div className="text-slate-400">
                    {s.role} · {tr(`Age ${s.age}`, `อายุ ${s.age}`)} · {s.nationality}
                  </div>
                </div>
                <div className="text-right font-mono tabular-nums text-xs text-slate-300">
                  <div>Tech {s.attributes.coachingTechnical} · Tac {s.attributes.coachingTactical}</div>
                  <div className="text-slate-400">€{s.wagePerWeek.toLocaleString()}/w</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-sky-400">
            {tr('Free Agent Staff Available', 'ตลาดทีมงานว่างงาน (Free Agent Staff Available)')}
          </h3>
          <div className="space-y-2">
            {freeStaff.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">{s.name}</div>
                  <div className="text-slate-400">
                    {s.role} · Judging {s.attributes.judgingAbility}/{s.attributes.judgingPotential}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onHireStaff(s.id)}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded cursor-pointer"
                >
                  {tr(`Hire (€${s.wagePerWeek.toLocaleString()}/w)`, `จ้างงาน (€${s.wagePerWeek.toLocaleString()}/w)`)}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'youth') {
    const youthPlayers = Object.values(world.players).filter(
      (p) => p.clubId === club.id && (p.isYouthAcademy || p.squadStatus === 'Youth')
    );

    return (
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              {tr(`Youth Academy (${club.name} U19)`, `ศูนย์ฝึกเยาวชนและอคาเดมี (${club.name} U19 Academy)`)}
            </h3>
            <p className="text-xs text-slate-400">
              {tr(
                `Youth Facilities Level ${club.youthFacilities}/20 · Promote prospects to the senior squad or recruit a new youth intake.`,
                `ระดับศูนย์ฝึกเยาวชน ${club.youthFacilities}/20 · ปั้นดาวรุ่งขึ้นสู่ทีมชุดใหญ่หรือคัดเลือกผู้เล่นใหม่เข้าอคาเดมี`
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onRecruitYouth}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            {tr('+ Recruit New Youth Prospect', '+ คัดเลือกดาวรุ่งเข้าอคาเดมีใหม่ (Youth Intake)')}
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">{tr('Prospect Name', 'ชื่อดาวรุ่ง')}</th>
                <th className="py-2.5 px-3">{tr('Pos', 'ตำแหน่ง')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Age', 'อายุ')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Current CA', 'CA ปัจจุบัน')}</th>
                <th className="py-2.5 px-3 text-right">{tr('Potential PA', 'ศักยภาพ PA')}</th>
                <th className="py-2.5 px-3 text-right">Determination</th>
                <th className="py-2.5 px-3 text-right">{tr('Action', 'การดำเนินการ')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {youthPlayers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/60">
                  <td
                    onClick={() => onSelectPlayer(p.id)}
                    className="py-2 px-3 font-medium text-white cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <PlayerAvatar player={p} club={club} size="sm" />
                      <span>
                        {p.firstName} {p.lastName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{p.positions.join(', ')}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                    {getAgeAtDate(p.dateOfBirth, world.gameDate)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                    {(p.currentAbility / 10).toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-400 font-semibold">
                    {Math.round(p.potentialRange[0] / 10)}–{Math.round(p.potentialRange[1] / 10)} / 20
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                    {p.attributes.mental.determination}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onPromoteYouth(p.id)}
                      className="px-3 py-1 bg-slate-800 hover:bg-emerald-500 text-slate-200 hover:text-slate-950 font-medium rounded text-[11px] cursor-pointer"
                    >
                      {tr('Promote to Senior Squad', 'ดันขึ้นชุดใหญ่ (Promote)')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (mode === 'world') {
    const clubsInLeague = Object.values(world.clubs).filter(
      (c) => c.leagueId === worldLeagueFilter
    );
    const inspectedClub = world.clubs[inspectedClubId] || clubsInLeague[0];
    const inspectedPlayers = Object.values(world.players)
      .filter((p) => p.clubId === inspectedClub.id)
      .sort((a, b) => b.currentAbility - a.currentAbility);

    return (
      <div className="space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-2">
          {(Object.keys(LEAGUES_CONFIG) as LeagueId[]).map((lId) => (
            <button
              key={lId}
              type="button"
              onClick={() => {
                setWorldLeagueFilter(lId);
                const first = Object.values(world.clubs).find((c) => c.leagueId === lId);
                if (first) setInspectedClubId(first.id);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                worldLeagueFilter === lId
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              {LEAGUES_CONFIG[lId].name} ({LEAGUES_CONFIG[lId].targetClubCount} {tr('Clubs', 'สโมสร')})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 max-h-[540px] overflow-y-auto">
            {clubsInLeague.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setInspectedClubId(c.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer ${
                  c.id === inspectedClub.id
                    ? 'bg-slate-800 text-white border border-emerald-500/50'
                    : 'bg-slate-950 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <span className="font-medium truncate">{c.name}</span>
                <span className="font-mono text-slate-400">Rep {c.reputation}</span>
              </button>
            ))}
          </div>

          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-lg font-display font-bold text-white">{inspectedClub.name}</h3>
                <div className="text-xs text-slate-400">
                  {tr('Manager:', 'ผู้จัดการทีม:')}{' '}
                  {inspectedClub.id === club.id ? world.manager.name : inspectedClub.aiManager.name}{' '}
                  ({inspectedClub.aiManager.style}) · {tr('Stadium:', 'สนาม')} {inspectedClub.stadiumName}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums text-xs">
                <div className="text-emerald-400">
                  {tr('Transfer Budget:', 'งบซื้อขาย')} €{(inspectedClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                </div>
                <div className="text-slate-400">
                  {tr('Formation:', 'แผนหลัก')} {inspectedClub.primaryTactic.formation}
                </div>
              </div>
            </div>

            <div className="max-h-[410px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2 px-2">{tr('Pos', 'ตำแหน่ง')}</th>
                    <th className="py-2 px-2">{tr('Player Name', 'ชื่อนักเตะ')}</th>
                    <th className="py-2 px-2 text-right">{tr('Age', 'อายุ')}</th>
                    <th className="py-2 px-2 text-right">CA</th>
                    <th className="py-2 px-2 text-right">{tr('Value', 'มูลค่า')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {inspectedPlayers.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => onSelectPlayer(p.id)}
                      className="hover:bg-slate-800/60 cursor-pointer"
                    >
                      <td className="py-1.5 px-2 font-mono text-slate-400">{p.positions.join(', ')}</td>
                      <td className="py-1.5 px-2 font-medium text-white">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar player={p} club={inspectedClub} size="sm" />
                          <span>
                            {p.firstName} {p.lastName}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-300">
                        {getAgeAtDate(p.dateOfBirth, world.gameDate)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-emerald-400">
                        {(p.currentAbility / 10).toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono tabular-nums text-slate-200">
                        €{(p.marketValue / 1_000_000).toFixed(1)}M
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Manager Profile, Language Settings & Save/Load Slots
  const mgr = world.manager;
  const winRate =
    mgr.careerStats.matchesManaged > 0
      ? Math.round((mgr.careerStats.won / mgr.careerStats.matchesManaged) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="space-y-4">
        {/* Language & Display Preferences Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-display font-bold text-white">
                {tr('Language & Interface Settings', 'ตั้งค่าภาษาและการแสดงผล (Language Settings)')}
              </h3>
              <p className="text-xs text-slate-400">
                {tr(
                  'Choose your preferred display language. English is the default.',
                  'เลือกภาษาที่ต้องการแสดงผลในเกม (ค่าเริ่มต้น: English)'
                )}
              </p>
            </div>
            <LanguageSwitcher />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                lang === 'en'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-emerald-400">English (Default)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Standard international football management terminology
              </div>
            </button>

            <button
              type="button"
              onClick={() => setLang('th')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                lang === 'th'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white font-semibold'
                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold text-emerald-400">ภาษาไทย (Thai)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                แสดงผลเมนู ตารางคะแนน และคำอธิบายภาษาไทยเต็มรูปแบบ
              </div>
            </button>
          </div>
        </div>

        {/* Manager Career Profile Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-base font-display font-bold text-white">
            {tr('Manager Career Profile', 'โปรไฟล์ผู้จัดการทีม (Manager Career Profile)')}
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">{tr('Full Name:', 'ชื่อ-นามสกุล:')}</span>
              <span className="text-white font-semibold">{mgr.name}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">{tr('Nationality / Age:', 'สัญชาติ / อายุ:')}</span>
              <span className="text-slate-200">
                {mgr.nationality} · {mgr.age} {tr('yrs', 'ปี')}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">{tr('Management Style:', 'สไตล์การทำทีม:')}</span>
              <span className="text-emerald-400">{mgr.coachingStyle} · {mgr.tacticalStyle}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">{tr('Career Record:', 'สถิติการคุมทีมทั้งหมด:')}</span>
              <span className="font-mono tabular-nums text-white">
                {tr(
                  `${mgr.careerStats.matchesManaged} matches (W ${mgr.careerStats.won} · D ${mgr.careerStats.drawn} · L ${mgr.careerStats.lost})`,
                  `${mgr.careerStats.matchesManaged} นัด (ชนะ ${mgr.careerStats.won} · เสมอ ${mgr.careerStats.drawn} · แพ้ ${mgr.careerStats.lost})`
                )}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400">{tr('Win Percentage:', 'อัตราชนะ (Win Percentage):')}</span>
              <span className="font-mono tabular-nums text-emerald-400 font-bold">{winRate}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              {tr('Google / Gmail Cloud Saves', 'จัดการเซฟเกมบนคลาวด์ (Google / Gmail Cloud Saves)')}
            </h3>
            <p className="text-[11px] text-slate-400">
              {tr(
                'Save and sync your career progress via Cloud Firestore.',
                'บันทึกและซิงก์ข้อมูลเซฟเกมผ่าน Cloud Firestore โดยไม่ใช้ localStorage'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSaveToSlot(`slot_${Date.now()}`)}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            {tr('+ Save New Slot', '+ บันทึกเซฟเกมใหม่ (Save Career)')}
          </button>
        </div>

        {/* Google / Gmail Account Panel */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
          {authUser ? (
            <>
              <div>
                <div className="text-emerald-400 font-semibold">
                  {tr(
                    'Google / Gmail Connected (Cloud Firestore Active)',
                    'เชื่อมต่อบัญชี Google / Gmail แล้ว (Cloud Firestore Active)'
                  )}
                </div>
                <div className="text-slate-300 font-mono mt-0.5">
                  {authUser.email || authUser.displayName}
                </div>
              </div>
              <button
                type="button"
                onClick={onGoogleSignOut}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
              >
                {tr('Sign Out', 'ออกจากระบบ (Sign Out)')}
              </button>
            </>
          ) : (
            <>
              <div>
                <div className="text-amber-300 font-semibold">
                  {tr('Not Signed in with Google / Gmail', 'ยังไม่ได้เข้าสู่ระบบด้วย Google / Gmail')}
                </div>
                <div className="text-slate-400 mt-0.5">
                  {tr(
                    'Sign in with Gmail to save and load your careers across devices on Cloud Firestore.',
                    'เข้าสู่ระบบด้วย Gmail เพื่อบันทึกและโหลดเซฟเกมของคุณข้ามอุปกรณ์บน Cloud Firestore'
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                {tr('Sign in with Google / Gmail', 'เข้าสู่ระบบด้วย Google / Gmail')}
              </button>
            </>
          )}
        </div>

        <div className="space-y-2">
          {['slot_autosave', 'slot_1', 'slot_2'].map((slotKey) => {
            const existing = saveSlots.find((s) => s.slotId === slotKey);
            return (
              <div
                key={slotKey}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">
                    {slotKey === 'slot_autosave'
                      ? 'Auto-Save Slot (Cloud)'
                      : `Save Slot ${slotKey.replace('slot_', '#')} (Cloud)`}
                  </div>
                  <div className="text-slate-400 font-mono tabular-nums">
                    {existing
                      ? `${existing.clubName} · ${existing.gameDate}`
                      : tr('Empty Slot', 'ช่องว่าง (Empty Slot)')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveToSlot(slotKey)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                  >
                    {tr('Overwrite', 'บันทึกทับ')}
                  </button>
                  {existing && (
                    <button
                      type="button"
                      onClick={() => onLoadSlot(slotKey)}
                      className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 rounded cursor-pointer"
                    >
                      {tr('Load', 'โหลด')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
