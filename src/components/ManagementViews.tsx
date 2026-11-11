import React, { useState } from 'react';
import {
  Club,
  InboxCategory,
  LeagueId,
  NewsItem,
  Player,
  PlayerRole,
  PositionGroup,
  WorldState,
} from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { getLeaguePlayerLeaders } from '../engine/leagueEngine';
import { getAgeAtDate, SaveSlotMeta } from '../engine/worldSimulationService';
import { getPositionGroup } from './SquadAndProfileModal';
import { ClubBadge } from './ClubBadge';
import type { User } from '../firebase';

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
          <div className="text-xs text-slate-400">อันดับในลีก ({LEAGUES_CONFIG[club.leagueId].name})</div>
          <div className="text-2xl font-display font-bold text-white mt-1 font-mono tabular-nums">
            อันดับ {myPositionIdx + 1} / {LEAGUES_CONFIG[club.leagueId].targetClubCount}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            แข่ง {myStanding?.played || 0} นัด · {myStanding?.points || 0} คะแนน · ประตูได้เสีย {myStanding?.goalDifference ?? 0}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">งบประมาณซื้อขายและเพดานค่าเหนื่อย</div>
          <div className="text-2xl font-display font-bold text-emerald-400 mt-1 font-mono tabular-nums">
            €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            ค่าเหนื่อยใช้ไป €{(club.finances.wageUsedPerWeek / 1_000).toFixed(0)}K / €{(club.finances.wageBudgetPerWeek / 1_000).toFixed(0)}K ต่อสัปดาห์
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">ความพร้อมขุมกำลัง (Squad Condition)</div>
          <div className="text-2xl font-display font-bold text-white mt-1 font-mono tabular-nums">
            ความฟิต {avgFitness}% · ขวัญกำลังใจ {avgMorale}%
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            ผู้เล่นบาดเจ็บ {injuredPlayers.length} คน · แผนหลัก {club.primaryTactic.formation}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400">ความเชื่อมั่นบอร์ดบริหาร (Board Confidence)</div>
          <div className="text-2xl font-display font-bold text-sky-400 mt-1 font-mono tabular-nums">
            {club.boardExpectations.confidence.overall}%
          </div>
          <div className="text-xs text-slate-400 mt-1">
            เป้าหมายฤดูกาล: ท็อป {club.boardExpectations.targetLeaguePosition} ของตาราง
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
                แมตช์ถัดไป (Next Fixture)
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {nextFixture ? `Matchday ${nextFixture.matchday} · ${nextFixture.kickoffDate}` : 'จบฤดูกาล'}
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
                        {nextFixture.homeClubId === club.id ? 'เกมเหย้า' : 'เกมเยือน'} · แผนคู่แข่ง {nextOpponent.primaryTactic.formation} · ชื่อเสียง {nextOpponent.reputation}
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
                    เข้าสู่สนามแข่งขัน (Match Center)
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('tactics')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                  >
                    ปรับแท็กติกก่อนเกม
                  </button>
                  <button
                    type="button"
                    onClick={onAdvanceDay}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
                  >
                    เดินเวลา (Continue)
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-400 py-4">ไม่มีโปรแกรมการแข่งขันที่กำลังจะมาถึง</div>
            )}

            {/* Recent Results */}
            <div>
              <h4 className="text-xs font-semibold text-slate-300 mb-2">
                ผลการแข่งขัน 5 นัดหลังสุด (Recent Results)
              </h4>
              {recentFixtures.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">
                  ยังไม่มีผลการแข่งขันในฤดูกาลนี้ กดปุ่ม Continue หรือเข้าสู่ Match Center เพื่อเริ่มนัดเปิดสนาม
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
              กล่องข้อความและข่าวด่วน ({unreadInbox.length} ยังไม่อ่าน)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('inbox')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              เปิด Inbox ทั้งหมด
            </button>
          </div>
          <div className="space-y-2 flex-1">
            {world.inbox.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate('inbox')}
                className="w-full text-left p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-0.5">
                  <span>{item.category}</span>
                  <span>{item.gameDate}</span>
                </div>
                <div className="text-xs font-semibold text-white truncate">{item.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{item.body}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Right 3 Cols: Mini League Standings */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200">
              ตารางคะแนน ({LEAGUES_CONFIG[club.leagueId].countryFlag})
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('competitions')}
              className="text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              ดูทั้ง 5 ลีก
            </button>
          </div>

          <div className="overflow-y-auto max-h-[380px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[11px] text-slate-400 border-b border-slate-800">
                  <th className="py-1.5 text-left">#</th>
                  <th className="py-1.5 text-left">สโมสร</th>
                  <th className="py-1.5 text-right">แข่ง</th>
                  <th className="py-1.5 text-right">GD</th>
                  <th className="py-1.5 text-right">แต้ม</th>
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
  onMarkRead: (newsId: string) => void;
  onAnswerPressConference: (newsId: string, optionId: string) => void;
  onAddAiNewsItem: (title: string, body: string) => void;
  onNavigate: (tab: NavTab) => void;
}> = ({ world, onMarkRead, onAnswerPressConference, onAddAiNewsItem, onNavigate }) => {
  const [catFilter, setCatFilter] = useState<'ALL' | InboxCategory>('ALL');
  const [selectedNewsId, setSelectedNewsId] = useState<string>(world.inbox[0]?.id || '');

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
      `เกาะติดสถานการณ์ ${club.name} อันดับ ${pos} ในศึก ${LEAGUES_CONFIG[club.leagueId].name}`,
      `รายงานพิเศษจากโต๊ะข่าวกีฬา: สโมสร ${club.name} ภายใต้การคุมทัพของ ${world.manager.name} ลงสนามไปแล้ว ${row?.played ?? 0} นัด เก็บได้ ${pts} คะแนน (ผลต่างประตูได้เสีย ${gd >= 0 ? `+${gd}` : gd}) รั้งอันดับ ${pos} ของตาราง ณ วันที่ ${world.gameDate}`
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
                {cat === 'ALL' ? 'ทั้งหมด' : cat}
              </button>
            )
          )}
        </div>

        <button
          type="button"
          onClick={handleGenerateSportsDeskNews}
          className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs rounded-lg cursor-pointer"
        >
          สรุปสกู๊ปข่าวฟุตบอลยุโรป (Sports Desk)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: Message List */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5 max-h-[580px] overflow-y-auto">
          {filtered.map((item) => {
            const isSelected = activeItem?.id === item.id;
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
                    ? 'bg-slate-800 border-emerald-500/60'
                    : item.isRead
                      ? 'bg-slate-950/60 border-slate-800/70 opacity-80'
                      : 'bg-slate-950 border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span className="text-emerald-400">{item.category}</span>
                  <span>{item.gameDate}</span>
                </div>
                <div className="text-xs font-semibold text-white">{item.title}</div>
              </button>
            );
          })}
        </div>

        {/* Right 7 Cols: Message Reader & Interactive Actions */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6">
          {activeItem ? (
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-4">
                <div className="text-xs font-mono text-emerald-400 mb-1">
                  {activeItem.category} · วันที่ {activeItem.gameDate}
                </div>
                <h2 className="text-xl font-display font-bold text-white">{activeItem.title}</h2>
              </div>

              <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {activeItem.body}
              </p>

              {/* Press Conference Interactive Options */}
              {activeItem.pressConferenceOptions && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="text-xs font-semibold text-amber-400">
                    งานแถลงข่าวต่อหน้าสื่อมวลชน (Press Conference)
                  </div>
                  {activeItem.pressConferenceAnsweredId ? (
                    <div className="text-xs text-emerald-400">
                      ✓ คุณได้ตอบคำถามสื่อมวลชนในหัวข้อนี้เรียบร้อยแล้ว:{' '}
                      {
                        activeItem.pressConferenceOptions.find(
                          (o) => o.id === activeItem.pressConferenceAnsweredId
                        )?.mediaResponse
                      }
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeItem.pressConferenceOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onAnswerPressConference(activeItem.id, opt.id)}
                          className="w-full text-left p-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-100 transition-colors cursor-pointer"
                        >
                          "{opt.label}"
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
                  ไปที่ Match Center
                </button>
              )}
              {activeItem.actionType === 'GoToTactics' && (
                <button
                  type="button"
                  onClick={() => onNavigate('tactics')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  เปิดหน้าจอ Tactics
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">เลือกข้อความทางซ้ายเพื่ออ่านรายละเอียด</div>
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
  const club = world.clubs[world.controlledClubId];
  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === club.id);

  const focuses: { id: Club['trainingFocus']; desc: string }[] = [
    { id: 'Attacking', desc: 'เน้นการจบสกอร์ การเคลื่อนที่ในกรอบเขตโทษ และความคมเกมรุก' },
    { id: 'Defending', desc: 'เน้นวินัยเกมรับ การเข้าสกัด และการยืนตำแหน่งแนวรับ' },
    { id: 'Possession', desc: 'เน้นการครองบอล จ่ายบอลสั้น และแกะเพรสซิ่ง' },
    { id: 'Chance Creation', desc: 'เน้นการสร้างสรรค์โอกาส จ่ายทะลุช่อง และเปิดบอลริมเส้น' },
    { id: 'Pressing', desc: 'เน้นการบีบพื้นที่แดนบนและความฟิตในการแย่งบอลคืน' },
    { id: 'Set Pieces', desc: 'เน้นลูกตั้งเตะ เตะมุม ฟรีคิก และการป้องกันลูกกลางอากาศ' },
    { id: 'Physical', desc: 'เน้นความแข็งแกร่ง ความเร็ว และความทนทานของร่างกาย' },
    { id: 'Recovery', desc: 'เน้นการฟื้นฟูความฟิตหลังเกมหนักและลดความเสี่ยงบาดเจ็บ' },
    { id: 'Match Preparation', desc: 'เน้นความเข้าใจแท็กติก (Tactical Familiarity) สำหรับนัดถัดไป' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              ตารางการฝึกซ้อมทีมชุดใหญ่ประจำสัปดาห์ (Team Training Regimen)
            </h3>
            <p className="text-xs text-slate-400">
              ศูนย์ฝึกซ้อมระดับ {club.trainingFacilities}/20 · การซ้อมมีผลต่อพัฒนาการทุกวันจันทร์ในเกม
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="team-train-intensity" className="text-xs text-slate-400">
              ความเข้มข้นของทีม:
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
              <option value="Light">Light (ซ้อมเบา ถนอมร่างกาย)</option>
              <option value="Standard">Standard (สมดุลมาตรฐาน)</option>
              <option value="Intense">Intense (ซ้อมเข้มข้น พัฒนาไวแต่เหนื่อยง่าย)</option>
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
                <div className="text-[11px] text-slate-400 leading-relaxed">{f.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Individual Player Training Summary Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          การฝึกซ้อมรายบุคคล (คลิกชื่อนักเตะเพื่อปรับโฟกัสเฉพาะตัว)
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                <th className="py-2 px-3">ชื่อนักเตะ</th>
                <th className="py-2 px-3">ตำแหน่ง</th>
                <th className="py-2 px-3">อายุ</th>
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
                    {p.firstName} {p.lastName}
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
              เครือข่ายแมวมองยุโรป (European Scouting Network)
            </h3>
            <p className="text-xs text-slate-400">
              ค้นหานักเตะจากทั้ง 280 สโมสรใน 15 ลีกยุโรป หรือส่งแมวมองลงพื้นที่ค้นหาดาวรุ่ง
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onCreateAssignment(leagueFilter, posFilter, maxAge, maxValueM * 1_000_000)
            }
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            + มอบหมายงานแมวมองตามเงื่อนไขนี้ (Assign Scout)
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label htmlFor="sct-league" className="block text-[11px] text-slate-400 mb-1">
              ลีก / ภูมิภาค
            </label>
            <select
              id="sct-league"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value as 'ALL_EUROPE' | LeagueId)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="ALL_EUROPE">ยุโรปทั้ง 5 ลีก (All 5 Leagues)</option>
              {(Object.keys(LEAGUES_CONFIG) as LeagueId[]).map((lId) => (
                <option key={lId} value={lId}>
                  {LEAGUES_CONFIG[lId].name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sct-pos" className="block text-[11px] text-slate-400 mb-1">
              กลุ่มตำแหน่ง
            </label>
            <select
              id="sct-pos"
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value as 'ANY' | PositionGroup)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            >
              <option value="ANY">ทุกตำแหน่ง (Any Position)</option>
              <option value="GK">ผู้รักษาประตู (GK)</option>
              <option value="DEF">กองหลัง (DEF)</option>
              <option value="MID">กองกลาง (MID)</option>
              <option value="ATT">แนวรุก / กองหน้า (ATT)</option>
            </select>
          </div>

          <div>
            <label htmlFor="sct-age" className="block text-[11px] text-slate-400 mb-1">
              อายุสูงสุด: {maxAge} ปี
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
              มูลค่าสูงสุด: €{maxValueM}M
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
              ค้นหาชื่อนักเตะ / สโมสร
            </label>
            <input
              id="sct-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="พิมพ์ชื่อนักเตะ..."
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
            />
          </div>
        </div>
      </div>

      {/* Active Assignments Strip */}
      {world.scoutAssignments.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-semibold text-emerald-400 mb-2">
            ภารกิจแมวมองที่กำลังดำเนินการ ({world.scoutAssignments.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {world.scoutAssignments.map((asgn) => (
              <div
                key={asgn.id}
                className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono tabular-nums"
              >
                พื้นที่: {asgn.regionOrLeague} · ตำแหน่ง: {asgn.positionGroup} · อายุ ≤ {asgn.maxAge} · เหลือ {asgn.daysRemaining} วัน (พบ {asgn.reportsGenerated.length} คน)
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
                <th className="py-2.5 px-3">ชื่อนักเตะ</th>
                <th className="py-2.5 px-3">สโมสร</th>
                <th className="py-2.5 px-3">ตำแหน่ง</th>
                <th className="py-2.5 px-3 text-right">อายุ</th>
                <th className="py-2.5 px-3 text-right">ความสามารถ (CA)</th>
                <th className="py-2.5 px-3 text-right">ศักยภาพ (PA)</th>
                <th className="py-2.5 px-3 text-right">มูลค่าประเมิน</th>
                <th className="py-2.5 px-3 text-right">ค่าเหนื่อย</th>
                <th className="py-2.5 px-3 text-right">รายงานแมวมอง</th>
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
                    <td className="py-2.5 px-3 font-medium text-white">
                      {p.firstName} {p.lastName}
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
                          ★ แนะนำ {rep.recommendationScore}/100
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
                          ส่องฟอร์ม
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
            { id: 'market', label: `ตลาดนักเตะขึ้นบัญชีขาย/ยืม (${transferListedPlayers.length})` },
            { id: 'shortlist', label: `Shortlist เป้าหมาย (${shortlistedPlayers.length})` },
            { id: 'history', label: `ประวัติข้อเสนอและการซื้อขาย (${world.transferOffers.length})` },
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
          งบซื้อขายคงเหลือ:{' '}
          <span className="text-emerald-400 font-bold">
            €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
          </span>{' '}
          · งบค่าเหนื่อยว่าง: €
          {Math.max(
            0,
            club.finances.wageBudgetPerWeek - club.finances.wageUsedPerWeek
          ).toLocaleString()}
          /สัปดาห์
        </div>
      </div>

      {tab === 'history' ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          {world.transferOffers.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              ยังไม่มีประวัติการยื่นข้อเสนอซื้อขาย คลิกที่นักเตะคนใดก็ได้ในหน้าตลาดซื้อขายหรือแมวมองเพื่อเปิดโต๊ะเจรจา
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
                        {off.offerType} · เงินต้น €{(off.upfrontFee / 1_000_000).toFixed(2)}M + ผ่อน €{(off.installmentsFee / 1_000_000).toFixed(2)}M · ค่าเหนื่อย €{off.proposedWagePerWeek.toLocaleString()}/w
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
                <th className="py-2.5 px-3">ชื่อนักเตะ</th>
                <th className="py-2.5 px-3">สโมสรปัจจุบัน</th>
                <th className="py-2.5 px-3">ตำแหน่ง</th>
                <th className="py-2.5 px-3 text-right">อายุ</th>
                <th className="py-2.5 px-3 text-right">CA</th>
                <th className="py-2.5 px-3 text-right">ราคาที่ต้องการ</th>
                <th className="py-2.5 px-3 text-right">สถานะตลาด</th>
                <th className="py-2.5 px-3 text-right">การดำเนินการ</th>
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
                    <td className="py-2.5 px-3 font-medium text-white">
                      {p.firstName} {p.lastName}
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
                      {p.transferListed ? 'ขึ้นบัญชีขาย' : p.loanListed ? 'ปล่อยยืม' : 'ปกติ'}
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
                        ยื่นข้อเสนอซื้อ/ยืม
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
   6. COMPETITIONS & SCHEDULE VIEW (ALL 5 LEAGUES)
============================================================================ */
export const CompetitionsAndScheduleView: React.FC<{
  world: WorldState;
  initialMode: 'competitions' | 'schedule';
  onSelectPlayer: (playerId: string) => void;
}> = ({ world, initialMode, onSelectPlayer }) => {
  const myClub = world.clubs[world.controlledClubId];
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>(myClub.leagueId);
  const [selectedMatchday, setSelectedMatchday] = useState<number>(1);
  const [subView, setSubView] = useState<'table' | 'fixtures' | 'stats'>(
    initialMode === 'schedule' ? 'fixtures' : 'table'
  );

  const cfg = LEAGUES_CONFIG[selectedLeague];
  const standings = world.standings[selectedLeague] || [];
  const leagueFixtures = world.fixtures.filter(
    (f) => f.competitionId === selectedLeague && f.matchday === selectedMatchday
  );
  const leaders = getLeaguePlayerLeaders(selectedLeague, world.clubs, world.players);

  return (
    <div className="space-y-4">
      {/* 5 Leagues Switcher */}
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
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
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
            { id: 'table', label: 'ตารางคะแนน (Standings)' },
            { id: 'fixtures', label: `โปรแกรมและผลการแข่งขัน (${cfg.matchesPerClub} นัด)` },
            { id: 'stats', label: 'ดาวซัลโวและสถิติผู้เล่น' },
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
                <th className="py-2.5 px-3">อันดับ</th>
                <th className="py-2.5 px-3">สโมสร</th>
                <th className="py-2.5 px-3 text-right">แข่ง (P)</th>
                <th className="py-2.5 px-3 text-right">ชนะ (W)</th>
                <th className="py-2.5 px-3 text-right">เสมอ (D)</th>
                <th className="py-2.5 px-3 text-right">แพ้ (L)</th>
                <th className="py-2.5 px-3 text-right">ได้ (GF)</th>
                <th className="py-2.5 px-3 text-right">เสีย (GA)</th>
                <th className="py-2.5 px-3 text-right">ผลต่าง (GD)</th>
                <th className="py-2.5 px-3 text-right">คะแนน (PTS)</th>
                <th className="py-2.5 px-3 text-right">ฟอร์ม 5 นัด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
              {standings.map((row, idx) => {
                const pos = idx + 1;
                const c = world.clubs[row.clubId];
                const isMine = row.clubId === myClub.id;
                const isUcl = pos <= cfg.championsLeagueSpots;
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
                          isUcl
                            ? 'text-emerald-400 font-bold'
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
                        {isUcl && (
                          <span className="text-[10px] text-emerald-400">
                            {cfg.tier === 2 ? 'PROM' : 'UCL'}
                          </span>
                        )}
                        {isRel && <span className="text-[10px] text-red-400">REL</span>}
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
              โปรแกรมการแข่งขัน {cfg.name} — Matchday {selectedMatchday} / {cfg.matchesPerClub}
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedMatchday((m) => Math.max(1, m - 1))}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs rounded cursor-pointer"
              >
                ← นัดก่อนหน้า
              </button>
              <select
                aria-label="เลือกสัปดาห์การแข่งขัน Matchday"
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
                นัดถัดไป →
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
            { title: 'ดาวซัลโวสูงสุด (Top Scorers)', list: leaders.topScorers, key: 'goals' as const },
            { title: 'แอสซิสต์สูงสุด (Top Assists)', list: leaders.topAssists, key: 'assists' as const },
            { title: 'เรตติ้งเฉลี่ยสูงสุด (Top Rating)', list: leaders.topRated, key: 'averageRating' as const },
          ].map((col) => (
            <div key={col.title} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-emerald-400 mb-3">{col.title}</h3>
              {col.list.length === 0 ? (
                <div className="text-xs text-slate-500 py-6 text-center">
                  รอข้อมูลหลังเริ่มแข่งขันนัดแรก
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
                      <div className="truncate text-left">
                        <span className="font-mono text-slate-500 mr-2">{idx + 1}.</span>
                        <span className="text-white font-medium">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-1.5">
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
              ข้อมูลสโมสรและสถานะการเงิน ({club.name})
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">ยอดเงินคงเหลือ (Balance)</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  €{(club.finances.balance / 1_000_000).toFixed(2)}M
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">งบซื้อขาย (Transfer Budget)</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  €{(club.finances.transferBudget / 1_000_000).toFixed(2)}M
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">สนามเหย้า ({club.stadiumName})</div>
                <div className="text-base font-bold text-slate-200 mt-0.5">
                  {club.stadiumCapacity.toLocaleString()} ที่นั่ง
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-slate-400 font-sans">ศูนย์ฝึกซ้อม / อคาเดมี</div>
                <div className="text-base font-bold text-sky-400 mt-0.5">
                  ระดับ {club.trainingFacilities}/20 · {club.youthFacilities}/20
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                ยื่นคำร้องต่อบอร์ดบริหาร (Board Requests)
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onBoardRequest('budget')}
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                >
                  ขอเพิ่มงบประมาณซื้อขาย (+€5.0M)
                </button>
                <button
                  type="button"
                  onClick={() => onBoardRequest('training_facility')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  ขออัปเกรดศูนย์ฝึกซ้อม (€3.5M)
                </button>
                <button
                  type="button"
                  onClick={() => onBoardRequest('youth_facility')}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs rounded-lg cursor-pointer"
                >
                  ขออัปเกรดศูนย์ฝึกเยาวชน (€2.5M)
                </button>
              </div>
            </div>
          </div>

          {/* Audited Financial Transaction Ledger */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col max-h-[460px]">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              สมุดบัญชีธุรกรรมการเงิน (Audited Transaction Log)
            </h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {world.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                >
                  <div>
                    <div className="font-medium text-white">{tx.description}</div>
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
                      คงเหลือ €{(tx.balanceAfter / 1_000_000).toFixed(2)}M
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
            ทีมงานสตาฟฟ์โค้ชปัจจุบันของ {club.name} ({clubStaff.length})
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
                    {s.role} · อายุ {s.age} · สัญชาติ {s.nationality}
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
            ตลาดทีมงานว่างงาน (Free Agent Staff Available)
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
                  จ้างงาน (€{s.wagePerWeek.toLocaleString()}/w)
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
              ศูนย์ฝึกเยาวชนและอคาเดมี ({club.name} U19 Academy)
            </h3>
            <p className="text-xs text-slate-400">
              ระดับศูนย์ฝึกเยาวชน {club.youthFacilities}/20 · ปั้นดาวรุ่งขึ้นสู่ทีมชุดใหญ่หรือคัดเลือกผู้เล่นใหม่เข้าอคาเดมี
            </p>
          </div>
          <button
            type="button"
            onClick={onRecruitYouth}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            + คัดเลือกดาวรุ่งเข้าอคาเดมีใหม่ (Youth Intake)
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                <th className="py-2.5 px-3">ชื่อดาวรุ่ง</th>
                <th className="py-2.5 px-3">ตำแหน่ง</th>
                <th className="py-2.5 px-3 text-right">อายุ</th>
                <th className="py-2.5 px-3 text-right">CA ปัจจุบัน</th>
                <th className="py-2.5 px-3 text-right">ศักยภาพ PA</th>
                <th className="py-2.5 px-3 text-right">Determination</th>
                <th className="py-2.5 px-3 text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {youthPlayers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-800/60">
                  <td
                    onClick={() => onSelectPlayer(p.id)}
                    className="py-2.5 px-3 font-medium text-white cursor-pointer"
                  >
                    {p.firstName} {p.lastName}
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
                      ดันขึ้นชุดใหญ่ (Promote)
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
              {LEAGUES_CONFIG[lId].name} ({LEAGUES_CONFIG[lId].targetClubCount} สโมสร)
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
                  ผู้จัดการทีม: {inspectedClub.id === club.id ? world.manager.name : inspectedClub.aiManager.name} ({inspectedClub.aiManager.style}) · สนาม {inspectedClub.stadiumName}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums text-xs">
                <div className="text-emerald-400">งบซื้อขาย €{(inspectedClub.finances.transferBudget / 1_000_000).toFixed(1)}M</div>
                <div className="text-slate-400">แผนหลัก {inspectedClub.primaryTactic.formation}</div>
              </div>
            </div>

            <div className="max-h-[410px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2 px-2">ตำแหน่ง</th>
                    <th className="py-2 px-2">ชื่อนักเตะ</th>
                    <th className="py-2 px-2 text-right">อายุ</th>
                    <th className="py-2 px-2 text-right">CA</th>
                    <th className="py-2 px-2 text-right">มูลค่า</th>
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
                        {p.firstName} {p.lastName}
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

  // Manager Profile & Save/Load Slots
  const mgr = world.manager;
  const winRate =
    mgr.careerStats.matchesManaged > 0
      ? Math.round((mgr.careerStats.won / mgr.careerStats.matchesManaged) * 100)
      : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-base font-display font-bold text-white">
          โปรไฟล์ผู้จัดการทีม (Manager Career Profile)
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-400">ชื่อ-นามสกุล:</span>
            <span className="text-white font-semibold">{mgr.name}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-400">สัญชาติ / อายุ:</span>
            <span className="text-slate-200">{mgr.nationality} · {mgr.age} ปี</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-400">สไตล์การทำทีม:</span>
            <span className="text-emerald-400">{mgr.coachingStyle} · {mgr.tacticalStyle}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-400">สถิติการคุมทีมทั้งหมด:</span>
            <span className="font-mono tabular-nums text-white">
              {mgr.careerStats.matchesManaged} นัด (ชนะ {mgr.careerStats.won} · เสมอ {mgr.careerStats.drawn} · แพ้ {mgr.careerStats.lost})
            </span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-slate-800">
            <span className="text-slate-400">อัตราชนะ (Win Percentage):</span>
            <span className="font-mono tabular-nums text-emerald-400 font-bold">{winRate}%</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-bold text-white">
              จัดการเซฟเกมบนคลาวด์ (Google / Gmail Cloud Saves)
            </h3>
            <p className="text-[11px] text-slate-400">
              บันทึกและซิงก์ข้อมูลเซฟเกมผ่าน Cloud Firestore โดยไม่ใช้ localStorage
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSaveToSlot(`slot_${Date.now()}`)}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
          >
            + บันทึกเซฟเกมใหม่ (Save Career)
          </button>
        </div>

        {/* Google / Gmail Account Panel */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
          {authUser ? (
            <>
              <div>
                <div className="text-emerald-400 font-semibold">
                  เชื่อมต่อบัญชี Google / Gmail แล้ว (Cloud Firestore Active)
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
                ออกจากระบบ (Sign Out)
              </button>
            </>
          ) : (
            <>
              <div>
                <div className="text-amber-300 font-semibold">
                  ยังไม่ได้เข้าสู่ระบบด้วย Google / Gmail
                </div>
                <div className="text-slate-400 mt-0.5">
                  เข้าสู่ระบบด้วย Gmail เพื่อบันทึกและโหลดเซฟเกมของคุณข้ามอุปกรณ์บน Cloud Firestore
                </div>
              </div>
              <button
                type="button"
                onClick={onGoogleSignIn}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg cursor-pointer whitespace-nowrap"
              >
                เข้าสู่ระบบด้วย Google / Gmail
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
                    {slotKey === 'slot_autosave' ? 'Auto-Save Slot (Cloud)' : `Save Slot ${slotKey.replace('slot_', '#')} (Cloud)`}
                  </div>
                  <div className="text-slate-400 font-mono tabular-nums">
                    {existing
                      ? `${existing.clubName} · ${existing.gameDate}`
                      : 'ช่องว่าง (Empty Slot)'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSaveToSlot(slotKey)}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                  >
                    บันทึกทับ
                  </button>
                  {existing && (
                    <button
                      type="button"
                      onClick={() => onLoadSlot(slotKey)}
                      className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 rounded cursor-pointer"
                    >
                      โหลด
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
