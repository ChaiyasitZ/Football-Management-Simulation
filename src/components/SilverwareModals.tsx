import React from 'react';
import { Award, Crown, Shield, Sparkles, Trophy, X } from 'lucide-react';
import {
  Club,
  CompetitionId,
  Fixture,
  LeagueId,
  MatchResult,
  TrophyHistoryRecord,
  UefaCompetitionId,
  WorldState,
} from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { UEFA_COMPETITIONS_CONFIG } from '../engine/uefaEngine';
import { getCupRoundPrizeMoney } from '../engine/leagueEngine';
import {
  COMPETITION_STYLE_MAP,
  CompetitionBadge,
  TrophyArtwork,
  resolveCompetitionTrophyPhotoUrls,
} from './TrophyAndKitVisuals';
import { ClubBadge } from './ClubBadge';
import { useLanguage } from '../i18n/LanguageContext';

export interface TrophyLiftData {
  competitionId: string;
  competitionName: string;
  season: string;
  clubId: string;
  clubName: string;
  captainName: string;
  managerName: string;
  prizeMoney: number;
  reputationGain: number;
  scorelineText?: string;
  opponentName?: string;
}

/**
 * Pure helper to determine whether completing a match fixture crowned the user's club
 * as champions of a Cup Final, UEFA Final, Super Cup, or Club World Cup Final.
 */
export function detectTrophyWinFromMatch(
  world: WorldState,
  fixtureId: string,
  result: MatchResult
): TrophyLiftData | null {
  const fixture: Fixture | undefined = world.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) return null;

  const myClubId = world.controlledClubId;
  const isHome = fixture.homeClubId === myClubId;
  const isAway = fixture.awayClubId === myClubId;
  if (!isHome && !isAway) return null;

  const compId = String(fixture.competitionId);
  const isSuperCup = compId.endsWith('_SC') || compId === 'UEFA_USC';
  const isCupFinal = fixture.cupRound === 'FINAL';
  const isUefaFinal = fixture.uefaStage === 'FINAL';
  if (!isSuperCup && !isCupFinal && !isUefaFinal) return null;

  // Determine match winner (normal time / extra time or penalty shootout)
  let winnerClubId: string | null = null;
  if (result.homeGoals > result.awayGoals) {
    winnerClubId = fixture.homeClubId;
  } else if (result.awayGoals > result.homeGoals) {
    winnerClubId = fixture.awayClubId;
  } else if (result.penaltyShootout) {
    winnerClubId =
      result.penaltyShootout.homePenalties >= result.penaltyShootout.awayPenalties
        ? fixture.homeClubId
        : fixture.awayClubId;
  }

  if (winnerClubId !== myClubId) return null;

  const myClub = world.clubs[myClubId];
  if (!myClub) return null;

  const opponentClubId = isHome ? fixture.awayClubId : fixture.homeClubId;
  const opponentClub = world.clubs[opponentClubId];
  const { meta } = resolveCompetitionTrophyPhotoUrls(compId);

  // Resolve Captain (club.captainId or highest leadership/reputation squad player)
  const clubPlayers = Object.values(world.players).filter((p) => p.clubId === myClubId);
  const captain =
    clubPlayers.find((p) => p.id === myClub.primaryTactic.setPieces?.captainId) ||
    clubPlayers.sort((a, b) => b.attributes.mental.leadership - a.attributes.mental.leadership)[0];

  const isUefa = compId === 'UEFA_UCL' || compId === 'UEFA_UEL' || compId === 'UEFA_UECL';
  const prizeMoney = isUefa
    ? compId === 'UEFA_UCL'
      ? 25_000_000
      : compId === 'UEFA_UEL'
        ? 13_000_000
        : 8_000_000
    : isSuperCup
      ? compId === 'UEFA_USC'
        ? 5_000_000
        : getCupRoundPrizeMoney(compId, 'FINAL') || 1_500_000
      : getCupRoundPrizeMoney(compId, 'FINAL') || 3_500_000;

  const reputationGain =
    compId === 'UEFA_UCL'
      ? 8
      : compId === 'UEFA_UEL' || compId === 'FIFA_CWC' || compId === 'GLB_CWC'
        ? 5
        : isSuperCup
          ? 2
          : 4;

  const penText = result.penaltyShootout
    ? ` (${result.penaltyShootout.homePenalties}-${result.penaltyShootout.awayPenalties} pens)`
    : '';
  const scorelineText = `${result.homeGoals} - ${result.awayGoals}${penText}`;

  return {
    competitionId: compId,
    competitionName: meta.title || compId,
    season: world.currentSeason,
    clubId: myClubId,
    clubName: myClub.name,
    captainName: captain ? `${captain.firstName} ${captain.lastName}` : 'Club Captain',
    managerName: world.manager.name,
    prizeMoney,
    reputationGain,
    scorelineText,
    opponentName: opponentClub?.name,
  };
}

export interface SilverwareInspectionInfo {
  competitionId: string;
  title: string;
  subtitle: string;
  winnerPrizeMoney: number;
  qualificationRewardEn: string;
  qualificationRewardTh: string;
  defendingChampion: TrophyHistoryRecord | null;
  pastWinners: TrophyHistoryRecord[];
  mostSuccessfulClub: { clubName: string; clubId?: string; count: number } | null;
}

export function getCompetitionSilverwareMeta(
  competitionIdOrName: string,
  world: WorldState
): SilverwareInspectionInfo {
  const { meta } = resolveCompetitionTrophyPhotoUrls(competitionIdOrName);
  const compId = competitionIdOrName;
  const leagueCfg = LEAGUES_CONFIG[compId as LeagueId];
  const uefaCfg = UEFA_COMPETITIONS_CONFIG[compId as UefaCompetitionId];

  // Prize Money
  let winnerPrizeMoney = 0;
  if (leagueCfg) {
    winnerPrizeMoney = Math.round(leagueCfg.prizePoolTotal / 4);
  } else if (uefaCfg) {
    winnerPrizeMoney =
      compId === 'UEFA_UCL' ? 25_000_000 : compId === 'UEFA_UEL' ? 13_000_000 : 8_000_000;
  } else if (compId === 'UEFA_USC') {
    winnerPrizeMoney = 5_000_000;
  } else if (compId === 'FIFA_CWC' || compId === 'GLB_CWC') {
    winnerPrizeMoney = 35_000_000;
  } else if (compId === 'BALLON_DOR' || compId === 'GOLDEN_BOOT') {
    winnerPrizeMoney = 0;
  } else {
    winnerPrizeMoney = getCupRoundPrizeMoney(compId, 'FINAL') || 2_500_000;
  }

  // Qualification Reward
  let qualificationRewardEn = 'Major Domestic Silverware & Club Prestige';
  let qualificationRewardTh = 'ถ้วยแชมป์เกียรติยศและค่าชื่อเสียงสโมสร';
  if (leagueCfg) {
    if (leagueCfg.tier === 2 || leagueCfg.tier === 3) {
      qualificationRewardEn = 'Automatic Promotion to Higher Division + Trophy';
      qualificationRewardTh = 'เลื่อนชั้นสู่ดิวิชั่นที่สูงขึ้นโดยอัตโนมัติพร้อมถ้วยแชมป์';
    } else if (['KSA_SPL', 'USA_MLS', 'BRA_SA', 'JPN_J1'].includes(leagueCfg.id)) {
      qualificationRewardEn = 'Continental Representative in FIFA Club World Cup';
      qualificationRewardTh = 'สิทธิ์ตัวแทนทวีปลุยศึกชิงแชมป์สโมสรโลก (FIFA Club World Cup)';
    } else {
      qualificationRewardEn = 'UEFA Champions League Pot 1 + National Super Cup Berth';
      qualificationRewardTh = 'สิทธิ์โถ 1 ยูฟ่า แชมเปียนส์ลีก + ชิงถ้วยซูเปอร์คัพประจำชาติ';
    }
  } else if (compId === 'UEFA_UCL') {
    qualificationRewardEn = 'UEFA Super Cup + FIFA Club World Cup + UCL Pot 1';
    qualificationRewardTh = 'สิทธิ์ชิงยูฟ่า ซูเปอร์คัพ + สโมสรโลก + โถ 1 UCL ฤดูกาลหน้า';
  } else if (compId === 'UEFA_UEL') {
    qualificationRewardEn = 'Automatic UEFA Champions League Qualification + UEFA Super Cup';
    qualificationRewardTh = 'ตั๋วลุยศึกยูฟ่า แชมเปียนส์ลีกอัตโนมัติ + ชิงยูฟ่า ซูเปอร์คัพ';
  } else if (compId === 'UEFA_UECL') {
    qualificationRewardEn = 'Automatic UEFA Europa League League Phase Qualification';
    qualificationRewardTh = 'ตั๋วลุยศึกยูฟ่า ยูโรปาลีก รอบลีกเฟสโดยอัตโนมัติ';
  } else if (compId.endsWith('_CUP')) {
    qualificationRewardEn = 'UEFA Europa League Qualification + National Super Cup';
    qualificationRewardTh = 'สิทธิ์ลุยถ้วยยุโรป / ชิงถ้วยซูเปอร์คัพประจำชาติ';
  } else if (compId.endsWith('_LC')) {
    qualificationRewardEn = 'UEFA Conference League Qualification + Major Domestic Trophy';
    qualificationRewardTh = 'สิทธิ์เพลย์ออฟยูฟ่า คอนเฟอเรนซ์ลีก + ถ้วยลีกคัพเกียรติยศ';
  } else if (compId.endsWith('_SC') || compId === 'UEFA_USC') {
    qualificationRewardEn = 'Season Curtain-Raiser Super Cup Honours';
    qualificationRewardTh = 'แชมป์ถ้วยซูเปอร์คัพประเดิมเปิดฤดูกาล';
  } else if (compId === 'BALLON_DOR') {
    qualificationRewardEn = 'World’s Best Footballer Individual Honour';
    qualificationRewardTh = 'รางวัลนักฟุตบอลยอดเยี่ยมแห่งปีของโลก (บัลลงดอร์)';
  } else if (compId === 'GOLDEN_BOOT') {
    qualificationRewardEn = 'Top Goalscorer Across European & Global Leagues';
    qualificationRewardTh = 'รางวัลดาวซัลโวสูงสุดประจำฤดูกาล (รองเท้าทองคำ)';
  }

  // Match past winners from world.trophyHistory
  const normalizedTarget = compId.toUpperCase();
  const titleUpper = (meta.title || compId).toUpperCase();
  const pastWinners = (world.trophyHistory || []).filter((t) => {
    const tid = (t.competitionId || '').toUpperCase();
    const tname = (t.competitionName || '').toUpperCase();
    return (
      tid === normalizedTarget ||
      tname.includes(titleUpper) ||
      titleUpper.includes(tname) ||
      (normalizedTarget === 'FIFA_CWC' && tid === 'GLB_CWC') ||
      (normalizedTarget === 'GLB_CWC' && tid === 'FIFA_CWC')
    );
  });

  const defendingChampion = pastWinners[0] || null;

  // Most successful club in history list
  const countMap = new Map<string, { clubName: string; clubId?: string; count: number }>();
  for (const w of pastWinners) {
    const key = w.winnerClubId || w.winnerClubName;
    const prev = countMap.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      countMap.set(key, { clubName: w.winnerClubName, clubId: w.winnerClubId, count: 1 });
    }
  }
  const mostSuccessfulClub =
    Array.from(countMap.values()).sort((a, b) => b.count - a.count)[0] || null;

  return {
    competitionId: compId,
    title: meta.title || leagueCfg?.name || uefaCfg?.name || compId,
    subtitle: meta.subtitle || 'Official Competition',
    winnerPrizeMoney,
    qualificationRewardEn,
    qualificationRewardTh,
    defendingChampion,
    pastWinners,
    mostSuccessfulClub,
  };
}

/* ============================================================================
   STAGE 10 PHASE 3: INTERACTIVE SILVERWARE & ROLL OF HONOUR MODAL
============================================================================ */
export const SilverwareInspectionModal: React.FC<{
  competitionId: string | null;
  world: WorldState;
  onClose: () => void;
}> = ({ competitionId, world, onClose }) => {
  const { tr } = useLanguage();
  if (!competitionId) return null;

  const info = getCompetitionSilverwareMeta(competitionId, world);
  const defendingClub: Club | undefined = info.defendingChampion?.winnerClubId
    ? world.clubs[info.defendingChampion.winnerClubId]
    : undefined;
  const mostSuccessfulClubObj: Club | undefined = info.mostSuccessfulClub?.clubId
    ? world.clubs[info.mostSuccessfulClub.clubId]
    : undefined;
  const hasFotMobLogo = Boolean(COMPETITION_STYLE_MAP[competitionId]?.fotmobLogoUrl);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      data-testid="silverware-inspection-modal"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border-2 border-amber-400/50 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Spotlight Header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-900 border-b border-slate-800">
          <button
            type="button"
            data-testid="close-silverware-modal-btn"
            onClick={onClose}
            aria-label="Close Silverware Showcase"
            className="absolute top-4 right-4 p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Illuminated Pedestal with 180px Real Trophy Cutout */}
            <div className="relative w-48 h-48 rounded-2xl bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950/30 border border-amber-400/35 flex flex-col items-center justify-center shrink-0 overflow-hidden shadow-inner">
              <div className="pointer-events-none absolute -top-10 w-36 h-36 rounded-full bg-amber-400/20 blur-2xl" />
              <div className="pointer-events-none absolute bottom-3 w-28 h-3 rounded-full bg-amber-400/25 blur-md" />
              <TrophyArtwork
                competitionId={competitionId}
                size="xl"
                showCrestBadge={hasFotMobLogo}
                className="scale-110"
              />
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2.5 min-w-0">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[11px] font-mono font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tr('OFFICIAL SILVERWARE SHOWCASE', 'ตู้โชว์ถ้วยรางวัลทางการ')}</span>
              </div>

              <div className="flex items-center justify-center sm:justify-start gap-2.5">
                {hasFotMobLogo && <CompetitionBadge competitionId={competitionId} size="sm" />}
                <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white truncate">
                  {info.title}
                </h2>
              </div>
              <p className="text-xs font-mono text-slate-400">{info.subtitle}</p>

              {/* Prize Money & Qualification Reward */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-left">
                <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    {tr('Winner Prize Money', 'เงินรางวัลแชมป์')}
                  </div>
                  <div className="text-sm font-mono font-extrabold text-emerald-400 mt-0.5">
                    {info.winnerPrizeMoney > 0
                      ? `€${(info.winnerPrizeMoney / 1_000_000).toFixed(2)}M`
                      : tr('Individual Prestige', 'เกียรติยศส่วนบุคคล')}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/90 border border-slate-800">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    {tr('Qualification / Honour', 'สิทธิ์โควตาและเกียรติยศ')}
                  </div>
                  <div className="text-[11px] font-semibold text-amber-300 mt-0.5 leading-snug">
                    {tr(info.qualificationRewardEn, info.qualificationRewardTh)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Body: Defending Champion + Most Successful Club + Roll of Honour */}
        <div className="p-6 space-y-4 max-h-[55vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Defending Champion */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
              {defendingClub ? (
                <ClubBadge club={defendingClub} size="md" showRing />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400">
                  <Crown className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase text-amber-400 font-bold">
                  {tr('Defending Champion', 'แชมป์เก่าล่าสุด')}
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {info.defendingChampion
                    ? `${info.defendingChampion.winnerClubName} (${info.defendingChampion.season})`
                    : tr('Inaugural Season Crown', 'รอจารึกแชมป์ฤดูกาลแรก')}
                </div>
              </div>
            </div>

            {/* Most Successful Club */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
              {mostSuccessfulClubObj ? (
                <ClubBadge club={mostSuccessfulClubObj} size="md" showRing />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400">
                  <Trophy className="w-4 h-4" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
                  {tr('Most Titles Recorded', 'สโมสรที่ครองแชมป์มากสุดในบันทึก')}
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {info.mostSuccessfulClub
                    ? `${info.mostSuccessfulClub.clubName} (${info.mostSuccessfulClub.count}×)`
                    : tr('Open Race This Season', 'ยังไม่มีสถิติบันทึก')}
                </div>
              </div>
            </div>
          </div>

          {/* Roll of Honour / Past Winners */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-slate-300 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>{tr('Roll of Honour (Past Winners History)', 'ทำเนียบแชมป์ย้อนหลัง (Roll of Honour)')}</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {info.pastWinners.length} {tr('Records', 'รายการ')}
              </span>
            </div>

            {info.pastWinners.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400">
                {tr(
                  'Complete the season or lift this trophy in the Final to engrave your club’s name onto the Roll of Honour!',
                  'คว้าแชมป์รายการนี้เพื่อจารึกชื่อสโมสรของคุณลงบนทำเนียบแชมป์อย่างเป็นทางการ!'
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {info.pastWinners.map((rec) => {
                  const wClub = world.clubs[rec.winnerClubId];
                  const isMine = rec.winnerClubId === world.controlledClubId;
                  return (
                    <div
                      key={rec.id}
                      className={`px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        isMine
                          ? 'bg-amber-950/35 border-amber-500/50'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-amber-300 font-bold shrink-0">
                          {rec.season}
                        </span>
                        <ClubBadge club={wClub} size="xs" />
                        <span className="font-bold text-white truncate">{rec.winnerClubName}</span>
                        {isMine && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                            {tr('YOUR CLUB', 'สโมสรของคุณ')}
                          </span>
                        )}
                      </div>
                      {rec.runnerUpClubName && (
                        <span className="text-[11px] text-slate-400 truncate shrink-0">
                          {tr('Runner-up:', 'รองแชมป์:')} {rec.runnerUpClubName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   STAGE 10 PHASE 4: LIVE CHAMPIONSHIP TROPHY LIFT CELEBRATION MODAL
============================================================================ */
export const ChampionshipTrophyLiftModal: React.FC<{
  data: TrophyLiftData | null;
  club?: Club | null;
  onClose: () => void;
}> = ({ data, club, onClose }) => {
  const { tr } = useLanguage();
  if (!data) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
      data-testid="trophy-lift-modal"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-slate-900 border-2 border-amber-400/70 rounded-3xl w-full max-w-xl overflow-hidden shadow-[0_0_80px_rgba(250,204,21,0.28)] relative"
        style={{
          borderTop: `5px solid ${club?.primaryColor || '#facc15'}`,
        }}
      >
        {/* Celebratory Radial Golden Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full bg-amber-400/20 blur-3xl" />

        <div className="relative p-7 text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 font-mono text-xs font-extrabold tracking-wider">
            <Trophy className="w-4 h-4" />
            <span>
              🏆 {tr('CHAMPIONS! OFFICIAL TROPHY PRESENTATION', 'แชมเปียนส์! พิธีมอบถ้วยแชมป์อย่างเป็นทางการ')}
            </span>
          </div>

          {/* Center-Stage Real Physical Trophy Cutout + Club Crest */}
          <div className="relative flex flex-col items-center justify-center py-2">
            <div className="relative flex items-center justify-center gap-5">
              {club && <ClubBadge club={club} size="xl" showRing />}
              <div className="relative p-4 rounded-3xl bg-gradient-to-b from-amber-400/15 via-slate-950/80 to-amber-500/10 border border-amber-400/40 shadow-2xl">
                <TrophyArtwork
                  competitionId={data.competitionId}
                  size="xl"
                  showCrestBadge
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-tight">
              {data.clubName}
            </h2>
            <p className="text-sm font-mono font-bold text-amber-300">
              {data.competitionName} · {data.season}
            </p>
            {data.scorelineText && data.opponentName && (
              <p className="text-xs text-slate-300">
                {tr(
                  `Final Victory ${data.scorelineText} vs ${data.opponentName}`,
                  `คว้าชัยนัดชิงชนะเลิศ ${data.scorelineText} เหนือ ${data.opponentName}`
                )}
              </p>
            )}
          </div>

          {/* Captain & Manager Lift Plaque */}
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/30 text-xs text-slate-200 leading-relaxed">
            <div className="flex items-center justify-center gap-2 text-amber-300 font-semibold mb-1">
              <Shield className="w-4 h-4" />
              <span>
                {tr(
                  `Captain ${data.captainName} & Manager ${data.managerName} lift the silverware!`,
                  `กัปตันทีม ${data.captainName} และผู้จัดการทีม ${data.managerName} ชูถ้วยแชมป์ท่ามกลางเสียงเชียร์กึกก้อง!`
                )}
              </span>
            </div>
          </div>

          {/* Winner Prize Cheque & Manager Reputation Boost */}
          <div className="grid grid-cols-2 gap-3 font-mono">
            <div className="p-3 rounded-2xl bg-slate-950 border border-emerald-500/40">
              <div className="text-[10px] text-slate-400 uppercase">
                {tr('Champion Prize Cheque', 'เงินรางวัลแชมป์โอนเข้าสโมสร')}
              </div>
              <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
                +€{(data.prizeMoney / 1_000_000).toFixed(2)}M
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-950 border border-amber-500/40">
              <div className="text-[10px] text-slate-400 uppercase">
                {tr('Manager Reputation', 'ชื่อเสียงผู้จัดการทีม')}
              </div>
              <div className="text-lg font-extrabold text-amber-300 mt-0.5">
                +{data.reputationGain} REP
              </div>
            </div>
          </div>

          <button
            type="button"
            data-testid="close-trophy-lift-modal-btn"
            onClick={onClose}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-xl shadow-amber-950/50 transition-all"
          >
            🏆 {tr('Add to Club Trophy Cabinet →', 'เก็บถ้วยแชมป์เข้าตู้โชว์สโมสร →')}
          </button>
        </div>
      </div>
    </div>
  );
};
