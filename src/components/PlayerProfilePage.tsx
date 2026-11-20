import React, { useState } from 'react';
import {
  ArrowLeft,
  Award,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  FileText,
  Radar,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { Player, PlayerRole, WorldState } from '../types/game';
import {
  evaluateSwapPlayerValuation,
  getAgeAtDate,
  isContractExpiringSoon,
} from '../engine/worldSimulationService';
import {
  computePlayerPolygon8Axes,
  derivePlayerTraitsFromAttributes,
  getLeagueRegistrationRules,
  getPlayerHomegrownStatus,
  isPlayerNonEuForLeague,
  isPlayerU21Exempt,
  PLAYER_TRAIT_CATALOG,
  ROLES_BY_POSITION,
} from '../engine/tacticsEngine';
import { useLanguage } from '../i18n/LanguageContext';
import { ClubBadge } from './ClubBadge';
import { PlayerAvatar } from './PlayerAvatar';
import { CompetitionBadge, NationalityFlag } from './TrophyAndKitVisuals';
import { AttrBadge } from '../ui/UIComponents';

export interface PlayerProfilePageProps {
  player: Player;
  world: WorldState;
  onBack: () => void;
  onSelectPlayer: (playerId: string) => void;
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
    swapPlayerId?: string | null;
    sweetenBiddingWar?: boolean;
  }) =>
    | {
        outcome: 'COMPLETED' | 'COUNTERED' | 'REJECTED' | 'BIDDING_WAR';
        message: string;
        biddingWar?: {
          rivalClubId: string;
          rivalClubName: string;
          rivalShortName: string;
          rivalBidFee: number;
          requiredWageBoostPct: number;
        };
      }
    | void;
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
  onOfferPlayerToClubs?: (playerId: string) => void;
  onPlayerChat?: (
    playerId: string,
    topic: 'PRAISE_FORM' | 'CRITICIZE_FORM' | 'EXPLAIN_ROTATION' | 'CAPTAIN_INTERVENE'
  ) => void;
  onTriggerLoanOptionToBuy?: (playerId: string) => void;
  onRecallFromLoan?: (playerId: string) => void;
}

type ProfileTabId = 'overview' | 'development' | 'contract' | 'stats' | 'scout';

export const PlayerProfilePage: React.FC<PlayerProfilePageProps> = ({
  player,
  world,
  onBack,
  onSelectPlayer,
  onRenewContract,
  onMakeTransferOffer,
  onUpdateIndividualTraining,
  onToggleShortlist,
  onGenerateScoutReport,
  onUpdatePlayerTransferAndSquadStatus,
  onSignBosmanFree,
  onActivateReleaseClause,
  onSendToAffiliateLoan,
  onOfferPlayerToClubs,
  onPlayerChat,
  onTriggerLoanOptionToBuy,
  onRecallFromLoan,
}) => {
  const { lang, tr, trDynamic } = useLanguage();
  const [activeTab, setActiveTab] = useState<ProfileTabId>('overview');
  const [comparePlayerId, setComparePlayerId] = useState<string>('');
  const [stepperOpen, setStepperOpen] = useState<boolean>(false);
  const [stepperStep, setStepperStep] = useState<1 | 2 | 3>(1);
  const [chatModalOpen, setChatModalOpen] = useState<boolean>(false);
  const [chatFeedback, setChatFeedback] = useState<string | null>(null);

  const playerClub = world.clubs[player.clubId];
  const myClub = world.clubs[world.controlledClubId];
  const isMyPlayer = player.clubId === world.controlledClubId;
  const loanParentClub = player.loanedFromClubId ? world.clubs[player.loanedFromClubId] : null;
  const isLoanedInToMyClub =
    isMyPlayer && Boolean(player.loanedFromClubId) && player.loanedFromClubId !== world.controlledClubId;
  const isLoanedOutFromMyClub =
    !isMyPlayer && player.loanedFromClubId === world.controlledClubId;
  const effectiveLoanOptionFee =
    player.loanOptionToBuyFee && player.loanOptionToBuyFee > 0
      ? player.loanOptionToBuyFee
      : Math.round((player.marketValue * 1.1) / 100_000) * 100_000;
  const isContractExpiring =
    !player.loanedFromClubId && isContractExpiringSoon(player.contractEndDate, world.gameDate);
  const age = getAgeAtDate(player.dateOfBirth, world.gameDate);
  const clubCountry = playerClub?.countryId || 'ENG';
  const hgStatus = getPlayerHomegrownStatus(player, clubCountry);
  const isU21Exempt = isPlayerU21Exempt(player, world.gameDate, playerClub?.leagueId, clubCountry);
  const isNonEu = isPlayerNonEuForLeague(player, playerClub?.leagueId);
  const clubRegRules = getLeagueRegistrationRules(playerClub?.leagueId, clubCountry);

  // Prev / Next cycling within the player's current club roster
  const clubRoster = Object.values(world.players)
    .filter((p) => p.clubId === player.clubId)
    .sort((a, b) => b.currentAbility - a.currentAbility);
  const currentIdx = clubRoster.findIndex((p) => p.id === player.id);
  const prevPlayer =
    currentIdx > 0 ? clubRoster[currentIdx - 1] : clubRoster[clubRoster.length - 1];
  const nextPlayer =
    currentIdx >= 0 && currentIdx < clubRoster.length - 1
      ? clubRoster[currentIdx + 1]
      : clubRoster[0];

  // Negotiation / Stepper states
  const [offerType, setOfferType] = useState<'Transfer' | 'Loan'>('Transfer');
  const [upfrontFee, setUpfrontFee] = useState<number>(player.askingPrice || player.marketValue);
  const [installmentsFee, setInstallmentsFee] = useState<number>(0);
  const [sellOnPct, setSellOnPct] = useState<number>(5);
  const [proposedWage, setProposedWage] = useState<number>(
    Math.round(player.wagePerWeek * 1.15)
  );
  const [proposedYears, setProposedYears] = useState<number>(4);
  const [proposedStatus, setProposedStatus] = useState<Player['squadStatus']>(
    player.squadStatus
  );
  const [signingBonus, setSigningBonus] = useState<number>(
    Math.round(player.wagePerWeek * 3)
  );
  const [loanOptionToBuyFee, setLoanOptionToBuyFee] = useState<number>(
    Math.round(player.marketValue * 1.15)
  );
  const [buyBackClauseFee, setBuyBackClauseFee] = useState<number>(
    Math.round(player.marketValue * 1.6)
  );
  const [swapPlayerId, setSwapPlayerId] = useState<string>('');
  const [biddingWarState, setBiddingWarState] = useState<{
    rivalClubId: string;
    rivalClubName: string;
    rivalShortName: string;
    rivalBidFee: number;
    requiredWageBoostPct: number;
  } | null>(null);
  const [negotiationPatience, setNegotiationPatience] = useState<number>(100);
  const [counterOfferState, setCounterOfferState] = useState<{
    demandedUpfrontFee: number;
    demandedWage: number;
    demandedBonus: number;
    messageEn: string;
    messageTh: string;
  } | null>(null);

  // Sync stepper defaults when switching player
  React.useEffect(() => {
    setUpfrontFee(player.askingPrice || player.marketValue);
    setInstallmentsFee(0);
    setProposedWage(Math.round(player.wagePerWeek * 1.15));
    setSigningBonus(Math.round(player.wagePerWeek * 3));
    setProposedStatus(player.squadStatus);
    setSwapPlayerId('');
    setBiddingWarState(null);
    setNegotiationPatience(100);
    setCounterOfferState(null);
  }, [player.id]);

  const mySwapEligiblePlayers = React.useMemo(
    () =>
      Object.values(world.players)
        .filter((p) => p.clubId === world.controlledClubId && !p.loanedFromClubId)
        .sort((a, b) => b.marketValue - a.marketValue),
    [world.players, world.controlledClubId]
  );

  const selectedSwapPlayer = swapPlayerId ? world.players[swapPlayerId] : null;
  const swapEval = React.useMemo(
    () =>
      selectedSwapPlayer && !isMyPlayer
        ? evaluateSwapPlayerValuation(world, selectedSwapPlayer.id, player.clubId)
        : null,
    [world, selectedSwapPlayer, isMyPlayer, player.clubId]
  );

  const scoutReport = world.scoutReports[player.id];
  const isShortlisted = world.shortlistPlayerIds.includes(player.id);
  const comparePlayer = comparePlayerId ? world.players[comparePlayerId] : undefined;
  const comparisonCandidates = Object.values(world.players)
    .filter(
      (p) =>
        p.id !== player.id &&
        (p.clubId === world.controlledClubId || p.positions[0] === player.positions[0])
    )
    .sort((a, b) => b.currentAbility - a.currentAbility)
    .slice(0, 60);

  const playerAxes = computePlayerPolygon8Axes(player);
  const compareAxes = comparePlayer ? computePlayerPolygon8Axes(comparePlayer) : null;
  const activeTraits =
    player.traits && player.traits.length > 0
      ? player.traits
      : derivePlayerTraitsFromAttributes(player);

  const contractEndYear = parseInt(player.contractEndDate.slice(0, 4), 10) || 2028;
  const currentYear = parseInt(world.gameDate.slice(0, 4), 10) || 2026;
  const isBosmanEligible = !isMyPlayer && contractEndYear - currentYear <= 1;

  const tabs: { id: ProfileTabId; labelEn: string; labelTh: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      labelEn: 'Overview & Attributes',
      labelTh: 'ภาพรวม & ค่าพลัง',
      icon: <Radar className="w-3.5 h-3.5" />,
    },
    {
      id: 'development',
      labelEn: 'Training & Development',
      labelTh: 'พัฒนาการ & ฝึกซ้อม',
      icon: <TrendingUp className="w-3.5 h-3.5" />,
    },
    {
      id: 'contract',
      labelEn: 'Contract & Transfer',
      labelTh: 'สัญญา & ซื้อขาย',
      icon: <Briefcase className="w-3.5 h-3.5" />,
    },
    {
      id: 'stats',
      labelEn: 'Career Stats & History',
      labelTh: 'สถิติ & ประวัติค้าแข้ง',
      icon: <Award className="w-3.5 h-3.5" />,
    },
    {
      id: 'scout',
      labelEn: 'Scout Report',
      labelTh: 'รายงานแมวมอง',
      icon: <FileText className="w-3.5 h-3.5" />,
    },
  ];

  // Radar helper
  const renderRadarPolygon = (axes: typeof playerAxes) => {
    const cx = 110;
    const cy = 110;
    const maxR = 78;
    return axes
      .map((ax, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const r = (Math.max(2, ax.value) / 20) * maxR;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  return (
    <div className="space-y-4" data-testid="player-profile-page">
      {/* Top Navigation & Player Hero Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Top Action Strip: Back + Prev/Next Player Cycling + Primary CTAs */}
        <div className="px-5 py-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="player-profile-back-btn"
              onClick={onBack}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{tr('Back', 'ย้อนกลับ')}</span>
            </button>

            {clubRoster.length > 1 && (
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => prevPlayer && onSelectPlayer(prevPlayer.id)}
                  title={prevPlayer ? `${prevPlayer.firstName} ${prevPlayer.lastName}` : ''}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{tr('Prev', 'ก่อนหน้า')}</span>
                </button>
                <span className="text-xs font-mono text-slate-500 px-1.5">
                  {currentIdx + 1}/{clubRoster.length}
                </span>
                <button
                  type="button"
                  onClick={() => nextPlayer && onSelectPlayer(nextPlayer.id)}
                  title={nextPlayer ? `${nextPlayer.firstName} ${nextPlayer.lastName}` : ''}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs cursor-pointer flex items-center gap-1"
                >
                  <span className="hidden sm:inline">{tr('Next', 'ถัดไป')}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isMyPlayer && (
              <button
                type="button"
                onClick={() => onToggleShortlist(player.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer flex items-center gap-1.5 ${
                  isShortlisted
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                <span>
                  {isShortlisted
                    ? tr('Shortlisted', 'อยู่ในรายชื่อเป้าหมาย')
                    : tr('Add to Shortlist', 'เพิ่มเข้าเป้าหมาย')}
                </span>
              </button>
            )}

            {isMyPlayer && onPlayerChat && (
              <button
                type="button"
                data-testid="open-player-chat-btn"
                onClick={() => {
                  setChatFeedback(null);
                  setChatModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50 text-sky-300 font-semibold text-xs cursor-pointer"
              >
                {tr('💬 Speak to Player', '💬 พูดคุยตัวต่อตัว')}
              </button>
            )}

            {isMyPlayer && !isLoanedInToMyClub && onOfferPlayerToClubs && (
              <button
                type="button"
                data-testid="offer-to-clubs-btn"
                onClick={() => onOfferPlayerToClubs(player.id)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 font-semibold text-xs cursor-pointer"
              >
                {tr('📢 Offer to Clubs', '📢 เร่ขายให้สโมสรอื่น')}
              </button>
            )}

            {isLoanedInToMyClub && onTriggerLoanOptionToBuy ? (
              <button
                type="button"
                data-testid="header-trigger-option-to-buy-btn"
                onClick={() => onTriggerLoanOptionToBuy(player.id)}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                {tr(
                  `Option-to-Buy (€${(effectiveLoanOptionFee / 1_000_000).toFixed(1)}M)`,
                  `ซื้อขาด (€${(effectiveLoanOptionFee / 1_000_000).toFixed(1)}M)`
                )}
              </button>
            ) : isLoanedOutFromMyClub && onRecallFromLoan ? (
              <button
                type="button"
                data-testid="header-recall-loan-btn"
                onClick={() => onRecallFromLoan(player.id)}
                className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                {tr('Recall from Loan', 'ดึงกลับจากยืมตัว')}
              </button>
            ) : (
              <button
                type="button"
                data-testid="open-negotiation-stepper-btn"
                onClick={() => {
                  setStepperStep(1);
                  setStepperOpen(true);
                }}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
              >
                {isMyPlayer
                  ? tr('Renew Contract', 'ต่อสัญญาฉบับใหม่')
                  : tr('Make Transfer / Loan Offer', 'ยื่นข้อเสนอซื้อ / ยืมตัว')}
              </button>
            )}
          </div>
        </div>

        {/* Player Hero Identity Banner */}
        <div className="p-5 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <PlayerAvatar player={player} club={playerClub} size="lg" />
            {playerClub && (
              <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
                <ClubBadge club={playerClub} size="md" showRing />
                <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-mono font-bold text-xs">
                  #{player.shirtNumber || (currentIdx >= 0 && currentIdx < 99 ? currentIdx + 1 : 10)}
                </span>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                {player.shirtNumber && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-400 font-mono font-bold text-sm">
                    #{player.shirtNumber}
                  </span>
                )}
                <h1 className="text-2xl font-display font-bold text-white">
                  {player.firstName} {player.lastName}
                </h1>
                <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-bold text-xs">
                  {player.positions.join(' / ')}
                </span>
                {hgStatus === 'HGC' && (
                  <span
                    title={tr('Club-Trained Homegrown (HG-C)', 'เด็กปั้นสโมสร (HG-C)')}
                    className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-semibold text-xs"
                  >
                    HG-C
                  </span>
                )}
                {hgStatus === 'HGN' && (
                  <span
                    title={tr('Nation-Trained Homegrown (HG-N)', 'นักเตะโควตาท้องถิ่น (HG-N)')}
                    className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono font-semibold text-xs"
                  >
                    HG-N
                  </span>
                )}
                {isU21Exempt && (
                  <span
                    title={tr(`U${clubRegRules.u21ExemptMaxAge} Exempt from senior squad limit`, `ได้รับยกเว้น U${clubRegRules.u21ExemptMaxAge}`)}
                    className="px-2 py-0.5 rounded bg-teal-500/20 border border-teal-500/40 text-teal-300 font-mono font-semibold text-xs"
                  >
                    U{clubRegRules.u21ExemptMaxAge} EXEMPT
                  </span>
                )}
                {isNonEu && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-semibold text-xs">
                    NON-EU
                  </span>
                )}
                {(player.isWonderkid || (age <= 21 && player.potentialAbility >= 170)) && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs">
                    ★ WONDERKID
                  </span>
                )}
              </div>

              {player.loanedFromClubId && (
                <div
                  data-testid="player-loan-banner"
                  className="flex flex-wrap items-center gap-2 text-xs font-mono text-sky-300"
                >
                  <span className="font-semibold">
                    {tr('ON LOAN FROM', 'ยืมตัวจาก')}{' '}
                    <strong className="text-white">
                      {loanParentClub?.name || player.loanedFromClubId} ({loanParentClub?.shortName || player.loanedFromClubId})
                    </strong>
                  </span>
                  {player.loanOptionToBuyFee && player.loanOptionToBuyFee > 0 && (
                    <>
                      <span className="text-slate-500" aria-hidden="true">·</span>
                      <span className="text-emerald-300 font-semibold tabular-nums">
                        {tr(
                          `Option to Buy: €${(player.loanOptionToBuyFee / 1_000_000).toFixed(1)}M`,
                          `ออปชันซื้อขาด: €${(player.loanOptionToBuyFee / 1_000_000).toFixed(1)}M`
                        )}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                {playerClub && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    <ClubBadge club={playerClub} size="xs" />
                    <span>{playerClub.name}</span>
                    <CompetitionBadge competitionId={playerClub.leagueId} size="xs" />
                  </span>
                )}
                <span>·</span>
                <span className="font-mono">
                  {tr('Age', 'อายุ')} {age} ({player.dateOfBirth})
                </span>
                <span>·</span>
                <NationalityFlag code={player.nationalityCode} size="sm" showCountryName lang={lang} />
                <span>·</span>
                <span>
                  {tr('Foot:', 'เท้าถนัด:')} <strong className="text-white">{player.preferredFoot}</strong>
                </span>
                <span>·</span>
                <span>
                  {tr('Role:', 'บทบาท:')} <strong className="text-emerald-400">{player.preferredRole}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Right KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums text-xs">
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Ability (CA / PA)', 'CA / PA')}</div>
              <div className="text-base font-bold text-emerald-400 mt-0.5">
                {(player.currentAbility / 10).toFixed(1)} / {Math.round(player.potentialRange[1] / 10)}
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Market Value', 'มูลค่าตลาด')}</div>
              <div className="text-base font-bold text-white mt-0.5">
                €{(player.marketValue / 1_000_000).toFixed(1)}M
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Wage / Expiry', 'ค่าเหนื่อย / สัญญา')}</div>
              <div className="text-base font-bold text-amber-300 mt-0.5">
                €{(player.wagePerWeek / 1000).toFixed(0)}K · {player.contractEndDate.slice(0, 4)}
              </div>
            </div>
            <div className="px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-slate-400 font-sans">{tr('Condition / Morale', 'ความฟิต / กำลังใจ')}</div>
              <div className="text-base font-bold text-sky-300 mt-0.5">
                {player.fitness}% / {player.morale}%
              </div>
            </div>
          </div>
        </div>

        {/* 5 Sub-Tabs inside Player Profile */}
        <div className="flex items-center gap-1 px-5 border-t border-slate-800 bg-slate-950/40 overflow-x-auto">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`player-tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                  active
                    ? 'border-emerald-500 text-white bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.icon}
                <span>{tr(t.labelEn, t.labelTh)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & ATTRIBUTES */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left 8 Cols: 3-Column FM Attribute Table */}
          <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-display font-bold text-white">
                  {tr('Attributes Breakdown (1–20 Scale)', 'ตารางค่าพลังนักเตะ (สเกล 1–20)')}
                </h2>
                <select
                  aria-label="Compare attributes with player"
                  data-testid="attr-compare-select"
                  value={comparePlayerId}
                  onChange={(e) => setComparePlayerId(e.target.value)}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 max-w-[200px]"
                >
                  <option value="">
                    {tr('⚔️ Compare 36 Attributes vs...', '⚔️ เปรียบเทียบ 36 ค่าพลังกับ...')}
                  </option>
                  {comparisonCandidates.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.firstName} {cp.lastName} ({cp.positions[0]})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                <span className="text-emerald-400 font-bold" data-testid="attr-growth-legend">
                  ↑ {tr('Recent Gain / Focus', 'กำลังพุ่งขึ้น / โฟกัสซ้อม')}
                </span>
                <span className="text-sky-400 font-bold">
                  ↗ {tr('Developing', 'กำลังพัฒนา')}
                </span>
                <span className="text-amber-400">■ 16–20 Elite</span>
                <span className="text-emerald-400">■ 11–15 Good</span>
                <span className="text-slate-300">■ 6–10 Average</span>
              </div>
            </div>

            {/* Stage 5 Pillar 4: Head-to-Head Summary Banner when comparePlayer is active */}
            {comparePlayer && (
              <div
                data-testid="attr-head-to-head-banner"
                className="p-3 rounded-xl bg-slate-950 border border-sky-500/30 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono"
              >
                <div>
                  <div className="text-[10px] text-slate-400">
                    {tr('HEAD-TO-HEAD', 'เปรียบเทียบตัวต่อตัว')}
                  </div>
                  <div className="font-sans font-bold text-white truncate">
                    <span className="text-emerald-400">{player.lastName}</span> vs{' '}
                    <span className="text-sky-400">{comparePlayer.lastName}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">CA / PA</div>
                  <div>
                    <span className="text-emerald-400 font-bold">
                      {player.currentAbility}/{player.potentialAbility}
                    </span>{' '}
                    vs{' '}
                    <span className="text-sky-400 font-bold">
                      {comparePlayer.currentAbility}/{comparePlayer.potentialAbility}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">
                    {tr('AGE & VALUE', 'อายุ & มูลค่า')}
                  </div>
                  <div>
                    <span className="text-emerald-400">
                      {age}y (€{(player.marketValue / 1_000_000).toFixed(1)}M)
                    </span>{' '}
                    /{' '}
                    <span className="text-sky-400">
                      {getAgeAtDate(comparePlayer.dateOfBirth, world.gameDate)}y (€
                      {(comparePlayer.marketValue / 1_000_000).toFixed(1)}M)
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">
                    {tr('WAGE / WK', 'ค่าเหนื่อย/สัปดาห์')}
                  </div>
                  <div>
                    <span className="text-emerald-400">
                      €{(player.wagePerWeek / 1_000).toFixed(0)}K
                    </span>{' '}
                    vs{' '}
                    <span className="text-sky-400">
                      €{(comparePlayer.wagePerWeek / 1_000).toFixed(0)}K
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">
                    {tr('SEASON G / A', 'ประตู / แอสซิสต์')}
                  </div>
                  <div>
                    <span className="text-emerald-400">
                      {player.stats.goals}G {player.stats.assists}A
                    </span>{' '}
                    vs{' '}
                    <span className="text-sky-400">
                      {comparePlayer.stats.goals}G {comparePlayer.stats.assists}A
                    </span>
                  </div>
                </div>
              </div>
            )}

            {(() => {
              const devHistory = player.developmentHistory || [];
              const hasRecentCAGain =
                (devHistory.length >= 2 &&
                  devHistory[devHistory.length - 1].ca > devHistory[0].ca) ||
                player.morale >= 75;
              const hasPotentialUpside =
                player.potentialAbility > player.currentAbility || age <= 29;
              const focusAttr = player.individualTraining?.attributeFocus;
              const roleFocusMap: Record<string, string[]> = {
                GK: ['reflexes', 'handling', 'positioning', 'concentration', 'agility'],
                DEF: ['tackling', 'marking', 'heading', 'positioning', 'anticipation', 'strength'],
                MID: ['passing', 'technique', 'firstTouch', 'vision', 'decisions', 'stamina'],
                FWD: ['finishing', 'dribbling', 'firstTouch', 'offTheBall', 'composure', 'pace', 'acceleration'],
              };
              const primaryPos = player.positions[0] || 'MID';
              const posKey =
                primaryPos === 'GK'
                  ? 'GK'
                  : ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DC', 'DL', 'DR', 'WBL', 'WBR'].includes(primaryPos)
                    ? 'DEF'
                    : ['ST', 'LW', 'RW', 'AML', 'AMR'].includes(primaryPos)
                      ? 'FWD'
                      : 'MID';
              const keyRoleAttrs = roleFocusMap[posKey] || roleFocusMap.MID;

              const renderGrowthArrow = (attrKey: string, val: number) => {
                if (val >= 20) return null;
                const isDirectFocus = focusAttr === attrKey;
                const isKeyRoleAttr = keyRoleAttrs.includes(attrKey);
                if (isDirectFocus || (hasRecentCAGain && isKeyRoleAttr)) {
                  return (
                    <span
                      data-testid={`attr-growth-arrow-${attrKey}`}
                      title={tr(
                        'Rapid Growth (+0.2 to +0.5/mo from Individual Focus & Match XP)',
                        'พัฒนาการก้าวกระโดด (จากการฝึกซ้อมเฉพาะจุดและประสบการณ์ลงสนาม)'
                      )}
                      className="text-[11px] font-mono font-bold text-emerald-400 leading-none select-none"
                    >
                      ↑
                    </span>
                  );
                }
                if (hasPotentialUpside && (isKeyRoleAttr || (val >= 12 && val <= 18))) {
                  return (
                    <span
                      data-testid={`attr-growth-arrow-${attrKey}`}
                      title={tr(
                        'Steady Upward Trend (Training & Potential Upside)',
                        'แนวโน้มพัฒนาต่อเนื่องตามศักยภาพ (PA)'
                      )}
                      className="text-[11px] font-mono font-bold text-sky-400 leading-none select-none"
                    >
                      ↗
                    </span>
                  );
                }
                return null;
              };

              const renderAttrComparisonCell = (
                k: string,
                myVal: number,
                compVal?: number
              ) => {
                if (typeof compVal !== 'number') {
                  return (
                    <div className="flex items-center gap-1.5">
                      {renderGrowthArrow(k, myVal)}
                      <AttrBadge value={myVal} />
                    </div>
                  );
                }
                const delta = myVal - compVal;
                return (
                  <div className="flex items-center gap-1 font-mono" data-testid="attr-comparison-delta">
                    {renderGrowthArrow(k, myVal)}
                    <AttrBadge value={myVal} />
                    <span className="text-[10px] text-slate-500">vs</span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-[11px] font-bold">
                      {compVal}
                    </span>
                    <span
                      className={`min-w-[26px] text-center px-1 py-0.5 rounded text-[10px] font-bold ${
                        delta > 0
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : delta < 0
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  </div>
                );
              };

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Column 1: Technical or Goalkeeping */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                    <div className="text-xs font-display font-bold text-emerald-400 border-b border-slate-800 pb-1.5 mb-2">
                      {player.positions[0] === 'GK'
                        ? tr('GOALKEEPING', 'ผู้รักษาประตู (Goalkeeping)')
                        : tr('TECHNICAL', 'เทคนิค (Technical)')}
                    </div>
                    {Object.entries(player.attributes.technical).map(([k, val]) => {
                      const compVal = comparePlayer
                        ? Number(
                            (
                              comparePlayer.attributes.technical as unknown as Record<
                                string,
                                number | undefined
                              >
                            )[k] ?? 10
                          )
                        : undefined;
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between py-1 border-b border-slate-900 last:border-none text-xs"
                        >
                          <span className="text-slate-300 capitalize">
                            {k.replace(/([A-Z])/g, ' $1')}
                          </span>
                          {renderAttrComparisonCell(k, Number(val), compVal)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Column 2: Mental */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                    <div className="text-xs font-display font-bold text-sky-400 border-b border-slate-800 pb-1.5 mb-2">
                      {tr('MENTAL', 'จิตใจและไหวพริบ (Mental)')}
                    </div>
                    {Object.entries(player.attributes.mental).map(([k, val]) => {
                      const compVal = comparePlayer
                        ? Number(
                            (
                              comparePlayer.attributes.mental as unknown as Record<
                                string,
                                number | undefined
                              >
                            )[k] ?? 10
                          )
                        : undefined;
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between py-1 border-b border-slate-900 last:border-none text-xs"
                        >
                          <span className="text-slate-300 capitalize">
                            {k.replace(/([A-Z])/g, ' $1')}
                          </span>
                          {renderAttrComparisonCell(k, Number(val), compVal)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Column 3: Physical */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
                    <div className="text-xs font-display font-bold text-amber-400 border-b border-slate-800 pb-1.5 mb-2">
                      {tr('PHYSICAL', 'ร่างกาย (Physical)')}
                    </div>
                    {Object.entries(player.attributes.physical).map(([k, val]) => {
                      const compVal = comparePlayer
                        ? Number(
                            (
                              comparePlayer.attributes.physical as unknown as Record<
                                string,
                                number | undefined
                              >
                            )[k] ?? 10
                          )
                        : undefined;
                      return (
                        <div
                          key={k}
                          className="flex items-center justify-between py-1 border-b border-slate-900 last:border-none text-xs"
                        >
                          <span className="text-slate-300 capitalize">
                            {k.replace(/([A-Z])/g, ' $1')}
                          </span>
                          {renderAttrComparisonCell(k, Number(val), compVal)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Player Traits / Preferred Moves */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                {tr('Player Traits & Preferred Moves', 'นิสัยการเล่นเฉพาะตัว (Player Traits)')}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeTraits.map((tKey) => {
                  const meta = PLAYER_TRAIT_CATALOG[tKey];
                  return (
                    <div
                      key={tKey}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 border border-amber-500/30 text-xs flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <div>
                        <span className="font-semibold text-amber-300">
                          {meta ? tr(meta.labelEn, meta.labelTh) : tKey}
                        </span>
                        {meta && (
                          <span className="text-slate-400 ml-1.5">
                            — {tr(meta.descEn, meta.descTh)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right 4 Cols: 8-Axis Radar Comparison + Personality & Positions */}
          <div className="lg:col-span-4 space-y-4">
            <div
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3"
              data-testid="player-comparison-radar"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-display font-bold text-white">
                  {tr('8-Axis Attribute Polygon', 'กราฟเรดาร์ 8 แกน')}
                </h3>
                <select
                  aria-label="Compare with player"
                  value={comparePlayerId}
                  onChange={(e) => setComparePlayerId(e.target.value)}
                  className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 max-w-[165px]"
                >
                  <option value="">{tr('Compare Player...', 'เปรียบเทียบนักเตะ...')}</option>
                  {comparisonCandidates.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.firstName} {cp.lastName} ({cp.positions[0]})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <svg viewBox="0 0 220 220" className="w-56 h-56">
                  {[0.25, 0.5, 0.75, 1].map((scale) => (
                    <circle
                      key={scale}
                      cx="110"
                      cy="110"
                      r={78 * scale}
                      fill="none"
                      stroke="#1e293b"
                      strokeWidth="1"
                    />
                  ))}
                  {playerAxes.map((ax, i) => {
                    const angle = (Math.PI * 2 * i) / playerAxes.length - Math.PI / 2;
                    const x2 = 110 + 78 * Math.cos(angle);
                    const y2 = 110 + 78 * Math.sin(angle);
                    const lx = 110 + 96 * Math.cos(angle);
                    const ly = 110 + 96 * Math.sin(angle);
                    return (
                      <g key={ax.key}>
                        <line
                          x1="110"
                          y1="110"
                          x2={x2}
                          y2={y2}
                          stroke="#1e293b"
                          strokeWidth="1"
                        />
                        <text
                          x={lx}
                          y={ly}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className="fill-slate-400 text-[9px] font-mono"
                        >
                          {ax.labelEn.slice(0, 3).toUpperCase()} {ax.value}
                        </text>
                      </g>
                    );
                  })}
                  {compareAxes && (
                    <polygon
                      points={renderRadarPolygon(compareAxes)}
                      fill="rgba(56, 189, 248, 0.20)"
                      stroke="#38bdf8"
                      strokeWidth="2"
                    />
                  )}
                  <polygon
                    points={renderRadarPolygon(playerAxes)}
                    fill="rgba(16, 185, 129, 0.25)"
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              {comparePlayer && (
                <div className="flex items-center justify-center gap-4 text-xs font-mono">
                  <span className="text-emerald-400">■ {player.lastName}</span>
                  <span className="text-sky-400">■ {comparePlayer.lastName}</span>
                </div>
              )}
            </div>

            {/* Personality, Media Handling & Role Suitability */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
              <h3 className="text-sm font-display font-bold text-white">
                {tr('Profile & Tactical Suitability', 'บุคลิกภาพและความถนัดตำแหน่ง')}
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">{tr('Personality', 'บุคลิกภาพ')}</span>
                  <span className="font-semibold text-emerald-400">{player.personality}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">{tr('Natural Positions', 'ตำแหน่งธรรมชาติ')}</span>
                  <span className="font-mono font-bold text-white">
                    {player.positions.join(', ')}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">{tr('Preferred Role', 'บทบาทที่ถนัดที่สุด')}</span>
                  <span className="font-semibold text-sky-300">{player.preferredRole}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">{tr('Squad Hierarchy', 'สถานะในทีม')}</span>
                  <span className="font-semibold text-amber-300">{player.squadStatus}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRAINING & DEVELOPMENT */}
      {activeTab === 'development' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-display font-bold text-white">
              {tr('Individual Training & Role Development', 'ตารางฝึกซ้อมรายบุคคลและการพัฒนาบทบาท')}
            </h2>

            {isMyPlayer ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1.5">
                    {tr('Attribute Group Focus', 'โฟกัสกลุ่มค่าพลัง')}
                  </label>
                  <select
                    value={player.individualTraining.attributeFocus}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        e.target.value as Player['individualTraining']['attributeFocus'],
                        player.individualTraining.roleFocus,
                        player.individualTraining.intensity
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="none">Balanced (All-Around)</option>
                    <option value="attacking">Attacking &amp; Finishing</option>
                    <option value="defending">Defending &amp; Marking</option>
                    <option value="playmaking">Playmaking &amp; Passing</option>
                    <option value="speed">Speed &amp; Agility</option>
                    <option value="endurance">Endurance &amp; Strength</option>
                    <option value="goalkeeping">Goalkeeping</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5">
                    {tr('Tactical Role Mastery', 'ฝึกความชำนาญบทบาท')}
                  </label>
                  <select
                    value={player.individualTraining.roleFocus}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        player.individualTraining.attributeFocus,
                        e.target.value as PlayerRole,
                        player.individualTraining.intensity
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    {(ROLES_BY_POSITION[player.positions[0]] || [player.preferredRole]).map(
                      (r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5">
                    {tr('Training Workload', 'ความเข้มข้นในการซ้อม')}
                  </label>
                  <select
                    value={player.individualTraining.intensity}
                    onChange={(e) =>
                      onUpdateIndividualTraining(
                        player.id,
                        player.individualTraining.attributeFocus,
                        player.individualTraining.roleFocus,
                        e.target.value as 'Light' | 'Medium' | 'Heavy'
                      )
                    }
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  >
                    <option value="Light">{tr('Light (Recovery)', 'ซ้อมเบา (ถนอมร่างกาย)')}</option>
                    <option value="Medium">{tr('Medium (Standard)', 'ปานกลาง (มาตรฐาน)')}</option>
                    <option value="Heavy">{tr('Heavy (Fast Growth)', 'ซ้อมหนัก (เร่งพัฒนาการ)')}</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                {tr(
                  'Individual training can only be customized for players currently at your club.',
                  'สามารถปรับตารางซ้อมรายบุคคลได้เฉพาะนักเตะในสโมสรของคุณเท่านั้น'
                )}
              </div>
            )}

            {/* CA -> PA Development Bar */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-slate-300">
                  {tr('Current Ability (CA):', 'ความสามารถปัจจุบัน (CA):')}{' '}
                  <strong className="text-emerald-400">
                    {(player.currentAbility / 10).toFixed(1)} / 20
                  </strong>
                </span>
                <span className="text-slate-300">
                  {tr('Estimated Potential (PA):', 'ศักยภาพสูงสุด (PA):')}{' '}
                  <strong className="text-amber-300">
                    {Math.round(player.potentialRange[0] / 10)}–
                    {Math.round(player.potentialRange[1] / 10)} / 20
                  </strong>
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(player.currentAbility / 200) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <h3 className="text-base font-display font-bold text-white">
              {tr('Development Pathway & Loans', 'เส้นทางการพัฒนาและการปล่อยยืมตัว')}
            </h3>
            <p className="text-slate-400 leading-relaxed">
              {tr(
                'Players aged 15–21 develop fastest through high-level coaching facilities, Mentoring Groups, and competitive match minutes.',
                'นักเตะอายุ 15–21 ปีจะพัฒนาได้เร็วที่สุดเมื่อได้ซ้อมในศูนย์ฝึกระดับสูง มีรุ่นพี่คอยติว (Mentoring) และได้ลงสนามอย่างสม่ำเสมอ'
              )}
            </p>
            {isMyPlayer && age <= 22 && onSendToAffiliateLoan && (
              <button
                type="button"
                onClick={() => onSendToAffiliateLoan(player.id)}
                className="w-full py-2.5 px-4 bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/40 font-semibold rounded-lg cursor-pointer transition-colors"
              >
                {tr(
                  '🤝 Send to Affiliate Feeder Club on Development Loan',
                  '🤝 ส่งยืมตัวไปสโมสรพันธมิตรเพื่อเก็บเกี่ยวประสบการณ์'
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CONTRACT & TRANSFER */}
      {activeTab === 'contract' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <h2 className="text-base font-display font-bold text-white">
              {tr('Current Contract Terms', 'รายละเอียดสัญญาปัจจุบัน')}
            </h2>

            <div className="space-y-2 font-mono tabular-nums">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="font-sans text-slate-400">{tr('Current Club', 'สโมสรปัจจุบัน')}</span>
                <span className="font-sans font-semibold text-white inline-flex items-center gap-1.5">
                  {playerClub && <ClubBadge club={playerClub} size="xs" />}
                  <span>{playerClub?.name}</span>
                </span>
              </div>
              {player.loanedFromClubId && (
                <>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="font-sans text-slate-400">
                      {tr('Parent Club (Loan Owner)', 'สโมสรต้นสังกัดที่แท้จริง')}
                    </span>
                    <span className="font-sans font-semibold text-sky-300 inline-flex items-center gap-1.5">
                      {loanParentClub && <ClubBadge club={loanParentClub} size="xs" />}
                      <span>{loanParentClub?.name || player.loanedFromClubId}</span>
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-800">
                    <span className="font-sans text-slate-400">
                      {tr('Agreed Option-to-Buy Fee', 'ออปชันซื้อขาดที่ตกลงไว้')}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {player.loanOptionToBuyFee && player.loanOptionToBuyFee > 0
                        ? `€${(player.loanOptionToBuyFee / 1_000_000).toFixed(2)}M`
                        : tr('Standard Loan (No Fixed Clause)', 'ยืมตัวทั่วไป (ไม่มีออปชันตายตัว)')}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="font-sans text-slate-400">{tr('Weekly Wage', 'ค่าเหนื่อยต่อสัปดาห์')}</span>
                <span className="text-emerald-400 font-bold">
                  €{player.wagePerWeek.toLocaleString()}/wk
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="font-sans text-slate-400">{tr('Contract Expiry', 'วันหมดสัญญา')}</span>
                <span className={isContractExpiring ? 'text-amber-400 font-bold' : 'text-white'}>
                  {player.contractEndDate}
                  {isContractExpiring && (
                    <span className="ml-2 font-sans text-[11px] text-amber-300">
                      {tr('(Expiring Soon)', '(สัญญาใกล้หมด)')}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="font-sans text-slate-400">{tr('Squad Status', 'สถานะในทีม')}</span>
                <span className="font-sans text-amber-300 font-semibold">{player.squadStatus}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="font-sans text-slate-400">{tr('Release Clause', 'ค่าฉีกสัญญา')}</span>
                <span className="text-sky-300">
                  {player.releaseClause
                    ? `€${(player.releaseClause / 1_000_000).toFixed(1)}M`
                    : tr('None', 'ไม่มี')}
                </span>
              </div>
            </div>

            {isMyPlayer && !isLoanedInToMyClub && onUpdatePlayerTransferAndSquadStatus && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <div className="font-semibold text-slate-300">
                  {tr('Transfer & Loan Listing Controls', 'ตั้งค่าสถานะขึ้นบัญชีขาย / ยืมตัว')}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePlayerTransferAndSquadStatus(player.id, {
                        transferListed: !player.transferListed,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                      player.transferListed
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {player.transferListed
                      ? tr('✓ Transfer Listed', '✓ ขึ้นบัญชีขายอยู่')
                      : tr('Place on Transfer List', 'ขึ้นบัญชีขาย')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePlayerTransferAndSquadStatus(player.id, {
                        loanListed: !player.loanListed,
                      })
                    }
                    className={`px-3 py-1.5 rounded-lg border font-semibold cursor-pointer ${
                      player.loanListed
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {player.loanListed
                      ? tr('✓ Loan Listed', '✓ ขึ้นบัญชียืมตัวอยู่')
                      : tr('Place on Loan List', 'ขึ้นบัญชียืมตัว')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
            <h2 className="text-base font-display font-bold text-white">
              {isLoanedInToMyClub
                ? tr('Loan Agreement & Permanent Buyout', 'สัญญายืมตัวและการใช้ออปชันซื้อขาด')
                : isLoanedOutFromMyClub
                  ? tr('Loan Spell Management', 'จัดการนักเตะที่ปล่อยยืมตัว')
                  : isMyPlayer
                    ? tr('Contract Extension Negotiation', 'การเจรจาต่อสัญญาใหม่')
                    : tr('Transfer & Acquisition Options', 'ตัวเลือกการคว้าตัวเข้าสู่ทีม')}
            </h2>

            <p className="text-slate-400 leading-relaxed">
              {isLoanedInToMyClub
                ? tr(
                    `Currently on loan from ${loanParentClub?.name || player.loanedFromClubId}. You can trigger the agreed option-to-buy clause immediately to make the move permanent.`,
                    `กำลังอยู่ในสัญญายืมตัวจาก ${loanParentClub?.name || player.loanedFromClubId} คุณสามารถกดใช้ออปชันซื้อขาดเพื่อดึงมาร่วมทีมแบบถาวรได้ทันที`
                  )
                : isLoanedOutFromMyClub
                  ? tr(
                      `Currently out on loan at ${playerClub?.name}. Recall him to your first-team squad immediately if needed for cover.`,
                      `กำลังถูกปล่อยยืมตัวอยู่ที่ ${playerClub?.name} คุณสามารถเรียกตัวกลับสู่ทีมชุดใหญ่ได้ทันทีหากต้องการใช้งาน`
                    )
                  : isMyPlayer
                    ? tr(
                        'Use the 3-Step Contract Negotiation Wizard to propose a new wage, contract duration, and signing bonus.',
                        'ใช้หน้าต่างเจรจา 3 ขั้นตอนเพื่อเสนอค่าเหนื่อย ระยะเวลาสัญญา และโบนัสเซ็นสัญญาใหม่'
                      )
                    : tr(
                        'Use the 3-Step Transfer Offer Wizard to structure upfront fees, installments, sell-on clauses, and personal contract terms.',
                        'ใช้หน้าต่างเจรจาซื้อขาย 3 ขั้นตอนเพื่อกำหนดค่าตัวก้อนแรก ผ่อนชำระ ส่วนแบ่งขายต่อ และสัญญาส่วนตัว'
                      )}
            </p>

            <div className="space-y-2.5">
              {isLoanedInToMyClub && onTriggerLoanOptionToBuy && (
                <button
                  type="button"
                  data-testid="profile-trigger-option-to-buy-btn"
                  onClick={() => onTriggerLoanOptionToBuy(player.id)}
                  className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg cursor-pointer transition-colors"
                >
                  {tr(
                    `Trigger Option-to-Buy (€${(effectiveLoanOptionFee / 1_000_000).toFixed(1)}M)`,
                    `ใช้ออปชันซื้อขาดถาวร (€${(effectiveLoanOptionFee / 1_000_000).toFixed(1)}M)`
                  )}
                </button>
              )}

              {isLoanedOutFromMyClub && onRecallFromLoan && (
                <button
                  type="button"
                  data-testid="profile-recall-loan-btn"
                  onClick={() => onRecallFromLoan(player.id)}
                  className="w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg cursor-pointer transition-colors"
                >
                  {tr(
                    `Recall from Loan at ${playerClub?.shortName || 'Loan Club'}`,
                    `เรียกตัวกลับจากสัญญายืมตัวที่ ${playerClub?.shortName || 'สโมสรยืมตัว'}`
                  )}
                </button>
              )}

              {!isLoanedInToMyClub && !isLoanedOutFromMyClub && (
                <button
                  type="button"
                  onClick={() => {
                    setStepperStep(1);
                    setStepperOpen(true);
                  }}
                  className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg cursor-pointer"
                >
                  {isMyPlayer
                    ? tr('Launch Contract Renewal Wizard (3 Steps)', 'เริ่มการเจรจาต่อสัญญา (3 ขั้นตอน)')
                    : tr('Launch Transfer / Loan Offer Wizard (3 Steps)', 'เริ่มการยื่นข้อเสนอซื้อ / ยืมตัว (3 ขั้นตอน)')}
                </button>
              )}

              {!isMyPlayer && !isLoanedOutFromMyClub && player.releaseClause && onActivateReleaseClause && (
                <button
                  type="button"
                  onClick={() => onActivateReleaseClause(player.id, false)}
                  className="w-full py-2.5 px-4 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  {tr(
                    `Trigger Release Clause (€${(player.releaseClause / 1_000_000).toFixed(1)}M)`,
                    `จ่ายค่าฉีกสัญญาทันที (€${(player.releaseClause / 1_000_000).toFixed(1)}M)`
                  )}
                </button>
              )}

              {isBosmanEligible && !isLoanedOutFromMyClub && onSignBosmanFree && (
                <button
                  type="button"
                  onClick={() => onSignBosmanFree(player.id, proposedWage, proposedYears)}
                  className="w-full py-2.5 px-4 bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/40 font-semibold rounded-lg cursor-pointer transition-colors"
                >
                  {tr(
                    'Sign on Bosman Free Transfer (€0 Fee)',
                    'เซ็นสัญญาล่วงหน้าฟรีตามกฎ Bosman (€0 ค่าตัว)'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CAREER STATS & HISTORY */}
      {activeTab === 'stats' && (() => {
        const archivedSeasons = player.careerSeasonHistory || [];
        const totalApps =
          player.stats.appearances + archivedSeasons.reduce((acc, s) => acc + s.appearances, 0);
        const totalGoals =
          player.stats.goals + archivedSeasons.reduce((acc, s) => acc + s.goals, 0);
        const totalAssists =
          player.stats.assists + archivedSeasons.reduce((acc, s) => acc + s.assists, 0);
        const totalCleanSheets =
          player.stats.cleanSheets + archivedSeasons.reduce((acc, s) => acc + s.cleanSheets, 0);
        const weightedRatingSum =
          player.stats.appearances * player.stats.averageRating +
          archivedSeasons.reduce((acc, s) => acc + s.appearances * s.averageRating, 0);
        const careerAvgRating = totalApps > 0 ? weightedRatingSum / totalApps : 0;

        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 font-mono tabular-nums text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Appearances', 'ลงสนาม')}</div>
                <div className="text-xl font-bold text-white mt-1">{player.stats.appearances}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Goals', 'ประตู')}</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">{player.stats.goals}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Assists', 'แอสซิสต์')}</div>
                <div className="text-xl font-bold text-sky-400 mt-1">{player.stats.assists}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Clean Sheets', 'คลีนชีต')}</div>
                <div className="text-xl font-bold text-white mt-1">{player.stats.cleanSheets}</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Cards (Y / R)', 'ใบเหลือง / แดง')}</div>
                <div className="text-xl font-bold text-amber-300 mt-1">
                  {player.stats.yellowCards} / {player.stats.redCards}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-slate-400 font-sans">{tr('Avg Rating', 'เรตติ้งเฉลี่ย')}</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {player.stats.appearances > 0 ? player.stats.averageRating.toFixed(2) : '-'}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5" data-testid="player-career-season-table">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-bold text-white">
                  {tr('Season-by-Season Career History', 'ประวัติสถิติการค้าแข้งรายฤดูกาล')}
                </h3>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {archivedSeasons.length + 1} {tr('Season(s)', 'ฤดูกาล')}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 px-3">{tr('Season', 'ฤดูกาล')}</th>
                      <th className="py-2 px-3 font-sans">{tr('Club', 'สโมสร')}</th>
                      <th className="py-2 px-3 text-right">{tr('Apps', 'นัด')}</th>
                      <th className="py-2 px-3 text-right">{tr('Goals', 'ประตู')}</th>
                      <th className="py-2 px-3 text-right">{tr('Assists', 'แอสซิสต์')}</th>
                      <th className="py-2 px-3 text-right">{tr('CS', 'คลีนชีต')}</th>
                      <th className="py-2 px-3 text-right">{tr('Avg Rating', 'เรตติ้ง')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr className="bg-emerald-950/20 text-white font-semibold">
                      <td className="py-2.5 px-3">{world.currentSeason} ({tr('Current', 'ปัจจุบัน')})</td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="inline-flex items-center gap-1.5">
                          {playerClub && <ClubBadge club={playerClub} size="xs" />}
                          <span>{playerClub?.name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">{player.stats.appearances}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{player.stats.goals}</td>
                      <td className="py-2.5 px-3 text-right text-sky-400">{player.stats.assists}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{player.stats.cleanSheets}</td>
                      <td className="py-2.5 px-3 text-right">
                        {player.stats.appearances > 0 ? player.stats.averageRating.toFixed(2) : '-'}
                      </td>
                    </tr>
                    {archivedSeasons.map((rec, idx) => {
                      const histClub = world.clubs[rec.clubId];
                      return (
                        <tr key={`${rec.season}_${idx}`} className="hover:bg-slate-800/40 text-slate-200">
                          <td className="py-2.5 px-3 text-slate-300">{rec.season}</td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="inline-flex items-center gap-1.5">
                              {histClub && <ClubBadge club={histClub} size="xs" />}
                              <span>{histClub?.name || rec.clubName}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">{rec.appearances}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-400">{rec.goals}</td>
                          <td className="py-2.5 px-3 text-right text-sky-400">{rec.assists}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">{rec.cleanSheets}</td>
                          <td className="py-2.5 px-3 text-right">
                            {rec.appearances > 0 ? rec.averageRating.toFixed(2) : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 bg-slate-950/80 text-white font-bold">
                      <td className="py-2.5 px-3 font-sans" colSpan={2}>
                        {tr('Career Totals', 'สถิติรวมตลอดอาชีพในเซฟ')}
                      </td>
                      <td className="py-2.5 px-3 text-right">{totalApps}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{totalGoals}</td>
                      <td className="py-2.5 px-3 text-right text-sky-400">{totalAssists}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">{totalCleanSheets}</td>
                      <td className="py-2.5 px-3 text-right text-amber-300">
                        {totalApps > 0 ? careerAvgRating.toFixed(2) : '-'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Stage 16 Phase 1: Transfer & Loan Career Trail */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5" data-testid="player-transfer-history-card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-display font-bold text-white">
                  {tr('Transfer & Loan Career Trail', 'ประวัติการย้ายสโมสรและสัญญายืมตัว')}
                </h3>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {player.transferHistory.length} {tr('Recorded Moves', 'รายการย้ายทีม')}
                </span>
              </div>
              {player.transferHistory.length === 0 ? (
                <div className="text-xs text-slate-400 py-5 text-center bg-slate-950 rounded-lg border border-slate-800">
                  {tr(
                    `Club-trained or long-serving squad member at ${playerClub?.name} with no recent transfer moves.`,
                    `นักเตะลูกหม้อหรือผู้เล่นที่ค้าแข้งอยู่กับ ${playerClub?.name} มาอย่างต่อเนื่อง`
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono tabular-nums">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2 px-3">{tr('Date', 'วันที่')}</th>
                        <th className="py-2 px-3 font-sans">{tr('From Club', 'จากสโมสร')}</th>
                        <th className="py-2 px-3 font-sans">{tr('To Club', 'สู่สโมสร')}</th>
                        <th className="py-2 px-3">{tr('Deal Type', 'ประเภทดีล')}</th>
                        <th className="py-2 px-3 text-right">{tr('Transfer Fee', 'ค่าตัว')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {player.transferHistory.map((th, idx) => {
                        const fromClub = world.clubs[th.fromClubId];
                        const toClub = world.clubs[th.toClubId];
                        return (
                          <tr key={`${th.date}_${th.fromClubId}_${th.toClubId}_${idx}`} className="hover:bg-slate-800/40">
                            <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">{th.date}</td>
                            <td className="py-2.5 px-3 font-sans text-slate-200">
                              <span className="inline-flex items-center gap-1.5">
                                {fromClub && <ClubBadge club={fromClub} size="xs" />}
                                <span>{fromClub?.name || th.fromClubId}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-sans text-white font-semibold">
                              <span className="inline-flex items-center gap-1.5">
                                {toClub && <ClubBadge club={toClub} size="xs" />}
                                <span>{toClub?.name || th.toClubId}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`font-semibold text-[11px] ${
                                  th.type === 'Transfer'
                                    ? 'text-emerald-400'
                                    : th.type === 'Loan'
                                      ? 'text-sky-400'
                                      : 'text-amber-300'
                                }`}
                              >
                                {th.type === 'Transfer'
                                  ? tr('Permanent Transfer', 'ย้ายถาวร')
                                  : th.type === 'Loan'
                                    ? tr('Season Loan', 'ยืมตัว')
                                    : tr('Free Transfer', 'ย้ายฟรี')}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                              {th.type === 'Loan'
                                ? tr('Loan Deal', 'ยืมตัว')
                                : th.fee > 0
                                  ? `€${(th.fee / 1_000_000).toFixed(2)}M`
                                  : tr('Free', 'ฟรี')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 5: SCOUT REPORT */}
      {activeTab === 'scout' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-display font-bold text-white">
                {tr('Recruitment & Scouting Assessment', 'รายงานการประเมินจากทีมแมวมอง')}
              </h2>
              <p className="text-slate-400">
                {tr(
                  'Compiled by your Chief Scout based on tactical fit, current ability, and ceiling.',
                  'วิเคราะห์โดยหัวหน้าแมวมองจากความเข้ากันได้กับแผนการเล่น ความสามารถปัจจุบัน และเพดานศักยภาพ'
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGenerateScoutReport(player.id)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-lg cursor-pointer"
            >
              {scoutReport
                ? tr('Refresh Scout Report', 'อัปเดตรายงานแมวมอง')
                : tr('Generate Scout Report', 'ออกรายงานแมวมอง')}
            </button>
          </div>

          {scoutReport ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-slate-400">{tr('Recommendation Score', 'คะแนนแนะนำ')}</div>
                <div className="text-3xl font-display font-bold text-emerald-400 font-mono">
                  {scoutReport.recommendationScore} / 100
                </div>
                <div className="text-slate-300 font-mono">
                  CA Est: {(scoutReport.caEstimate[0] / 10).toFixed(1)}–
                  {(scoutReport.caEstimate[1] / 10).toFixed(1)} · PA Est:{' '}
                  {Math.round(scoutReport.paEstimate[0] / 10)}–
                  {Math.round(scoutReport.paEstimate[1] / 10)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-semibold text-emerald-400">
                  {tr('Key Strengths (Pros)', 'จุดเด่นสำคัญ')}
                </div>
                <ul className="space-y-1 text-slate-200 list-disc list-inside">
                  {scoutReport.strengths.map((s, i) => (
                    <li key={i}>{trDynamic(s)}</li>
                  ))}
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-semibold text-amber-400">
                  {tr('Areas of Concern (Cons)', 'จุดที่ต้องระวัง')}
                </div>
                <ul className="space-y-1 text-slate-200 list-disc list-inside">
                  {scoutReport.weaknesses.map((w, i) => (
                    <li key={i}>{trDynamic(w)}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center space-y-3">
              <Shield className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-white">
                {tr('No Scout Report Filed Yet', 'ยังไม่มีรายงานแมวมองสำหรับนักเตะคนนี้')}
              </div>
              <p className="text-slate-400">
                {tr(
                  'Click "Generate Scout Report" above to instruct your scouting department to compile a full dossier.',
                  'กดปุ่ม "ออกรายงานแมวมอง" ด้านบนเพื่อให้ทีมแมวมองประเมินค่าพลังและจุดเด่น/จุดด้อย'
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 3-STEP STEPPER DIALOG FOR TRANSFER / CONTRACT NEGOTIATION */}
      {stepperOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          data-testid="negotiation-stepper-modal"
          onClick={() => setStepperOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-6 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Stepper Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-display font-bold text-white">
                  {isMyPlayer
                    ? tr(`Contract Renewal — ${player.firstName} ${player.lastName}`, `ต่อสัญญานักเตะ — ${player.firstName} ${player.lastName}`)
                    : tr(`Transfer & Contract Offer — ${player.firstName} ${player.lastName}`, `ยื่นข้อเสนอคว้าตัว — ${player.firstName} ${player.lastName}`)}
                </h3>
                <p className="text-slate-400">
                  {tr(`Step ${stepperStep} of 3`, `ขั้นตอนที่ ${stepperStep} จาก 3`)}
                </p>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                {[1, 2, 3].map((s) => (
                  <span
                    key={s}
                    className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold ${
                      stepperStep === s
                        ? 'bg-emerald-500 text-slate-950'
                        : stepperStep > s
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {/* Agent / Selling Club Patience Indicator */}
            <div
              className="px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
              data-testid="negotiation-patience-bar"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-semibold">
                  {isMyPlayer
                    ? tr('Agent Negotiation Patience', 'ความอดทนของเอเย่นต์นักเตะ')
                    : tr('Selling Club & Agent Patience', 'ความอดทนของสโมสรและเอเย่นต์')}
                </span>
                <span
                  className={`font-mono font-bold ${
                    negotiationPatience >= 65
                      ? 'text-emerald-400'
                      : negotiationPatience >= 35
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  {negotiationPatience}%
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    negotiationPatience >= 65
                      ? 'bg-emerald-500'
                      : negotiationPatience >= 35
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                  style={{ width: `${negotiationPatience}%` }}
                />
              </div>
            </div>

            {/* Step 1: Deal Type & Club Fee */}
            {stepperStep === 1 && (
              <div className="space-y-3">
                {isMyPlayer ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="font-semibold text-emerald-400">
                      {tr('1. Current Contract & Squad Role', '1. ตรวจสอบสัญญาปัจจุบันและสถานะในทีม')}
                    </div>
                    <div className="text-slate-300">
                      {tr('Current Wage:', 'ค่าเหนื่อยเดิม:')} €{player.wagePerWeek.toLocaleString()}/wk ·{' '}
                      {tr('Expires:', 'หมดสัญญา:')} {player.contractEndDate}
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        {tr('Proposed Squad Hierarchy Role', 'บทบาทในทีมที่เสนอให้')}
                      </label>
                      <select
                        value={proposedStatus}
                        onChange={(e) =>
                          setProposedStatus(e.target.value as Player['squadStatus'])
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white"
                      >
                        <option value="Star Player">Star Player</option>
                        <option value="Important Player">Important Player</option>
                        <option value="Regular Starter">Regular Starter</option>
                        <option value="Squad Player">Squad Player</option>
                        <option value="Breakthrough Prospect">Breakthrough Prospect</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="font-semibold text-emerald-400">
                      {tr('1. Deal Structure & Club Compensation', '1. ประเภทดีลและค่าตัวสโมสร')}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['Transfer', 'Loan'] as const).map((tp) => (
                        <button
                          key={tp}
                          type="button"
                          onClick={() => setOfferType(tp)}
                          className={`py-2 px-3 rounded-lg font-semibold border cursor-pointer ${
                            offerType === tp
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-slate-950 text-slate-300 border-slate-800'
                          }`}
                        >
                          {tp === 'Transfer'
                            ? tr('Permanent Transfer', 'ซื้อขาดถาวร')
                            : tr('Season Loan', 'ยืมตัว 1 ฤดูกาล')}
                        </button>
                      ))}
                    </div>

                    {offerType === 'Transfer' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-400 mb-1">
                            {tr('Upfront Fee (€)', 'เงินก้อนแรก (€)')}
                          </label>
                          <input
                            type="number"
                            step={500000}
                            value={upfrontFee}
                            onChange={(e) => setUpfrontFee(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">
                            {tr('Installments (24m €)', 'ผ่อนชำระ 24 เดือน (€)')}
                          </label>
                          <input
                            type="number"
                            step={500000}
                            value={installmentsFee}
                            onChange={(e) => setInstallmentsFee(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">
                            {tr('Sell-On Clause (%)', 'ส่วนแบ่งขายต่อ (%)')}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={sellOnPct}
                            onChange={(e) => setSellOnPct(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1">
                            {tr('Buy-Back Clause (€)', 'ออปชันซื้อกลับ (€)')}
                          </label>
                          <input
                            type="number"
                            step={1000000}
                            value={buyBackClauseFee}
                            onChange={(e) => setBuyBackClauseFee(Number(e.target.value))}
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                          />
                        </div>

                        {/* Stage 14 Phase 4: Player Swap / Part-Exchange Selector */}
                        <div className="col-span-2 pt-2 border-t border-slate-800 space-y-2">
                          <label
                            htmlFor="swap-player-select"
                            className="block text-sky-300 font-semibold"
                          >
                            🔄 {tr(
                              'Include Player in Part-Exchange (Optional)',
                              'แนบนักเตะในทีมไปแลกตัว (Part-Exchange)'
                            )}
                          </label>
                          <select
                            id="swap-player-select"
                            data-testid="swap-player-select"
                            value={swapPlayerId}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              setSwapPlayerId(nextId);
                              if (nextId) {
                                const val = evaluateSwapPlayerValuation(
                                  world,
                                  nextId,
                                  player.clubId
                                ).valuation;
                                const basePrice = player.askingPrice || player.marketValue;
                                setUpfrontFee(Math.max(0, basePrice - val));
                              } else {
                                setUpfrontFee(player.askingPrice || player.marketValue);
                              }
                            }}
                            className="w-full px-3 py-2 bg-slate-950 border border-sky-500/40 rounded-lg text-white text-xs"
                          >
                            <option value="">
                              {tr('— Cash Only (No Swap Player) —', '— จ่ายเงินสดล้วน (ไม่แนบนักเตะแลกตัว) —')}
                            </option>
                            {mySwapEligiblePlayers.map((sp) => (
                              <option key={sp.id} value={sp.id}>
                                {sp.firstName} {sp.lastName} ({sp.positions[0]} · CA {sp.currentAbility} · €
                                {(sp.marketValue / 1_000_000).toFixed(1)}M)
                              </option>
                            ))}
                          </select>

                          {selectedSwapPlayer && swapEval && (
                            <div
                              data-testid="swap-valuation-preview"
                              className={`p-2.5 rounded-lg border text-[11px] flex items-center justify-between gap-3 ${
                                swapEval.positionalNeed
                                  ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-200'
                                  : 'bg-slate-950 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold">
                                  {tr(swapEval.reasonEn, swapEval.reasonTh)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {tr(
                                    'Cash fee automatically adjusted to reflect part-exchange valuation.',
                                    'ปรับลดเงินสดก้อนแรกให้อัตโนมัติตามมูลค่าประเมินของนักเตะแลกตัว'
                                  )}
                                </div>
                              </div>
                              <div className="text-right font-mono shrink-0">
                                <div className="font-bold text-emerald-400">
                                  -€{(swapEval.valuation / 1_000_000).toFixed(2)}M
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {Math.round(swapEval.multiplier * 100)}% {tr('of value', 'ของมูลค่า')}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-slate-400 mb-1">
                          {tr('Optional Future Buy Fee (€)', 'ออปชันซื้อขาดหลังจบสัญญายืมตัว (€)')}
                        </label>
                        <input
                          type="number"
                          step={500000}
                          value={loanOptionToBuyFee}
                          onChange={(e) => setLoanOptionToBuyFee(Number(e.target.value))}
                          className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Personal Contract Terms */}
            {stepperStep === 2 && (
              <div className="space-y-3">
                <div className="font-semibold text-emerald-400">
                  {tr('2. Personal Contract Terms & Bonuses', '2. เงื่อนไขสัญญาส่วนตัวและโบนัส')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('Weekly Wage (€/wk)', 'ค่าเหนื่อยต่อสัปดาห์ (€)')}
                    </label>
                    <input
                      type="number"
                      step={5000}
                      value={proposedWage}
                      onChange={(e) => setProposedWage(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('Contract Length (Years)', 'ระยะเวลาสัญญา (ปี)')}
                    </label>
                    <select
                      value={proposedYears}
                      onChange={(e) => setProposedYears(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                    >
                      {[1, 2, 3, 4, 5].map((y) => (
                        <option key={y} value={y}>
                          {y} {tr('Years', 'ปี')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('Signing Bonus (€)', 'โบนัสเซ็นสัญญา (€)')}
                    </label>
                    <input
                      type="number"
                      step={25000}
                      value={signingBonus}
                      onChange={(e) => setSigningBonus(Number(e.target.value))}
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('Squad Status', 'สถานะในทีม')}
                    </label>
                    <select
                      value={proposedStatus}
                      onChange={(e) =>
                        setProposedStatus(e.target.value as Player['squadStatus'])
                      }
                      className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-white"
                    >
                      <option value="Star Player">Star Player</option>
                      <option value="Important Player">Important Player</option>
                      <option value="Regular Starter">Regular Starter</option>
                      <option value="Squad Player">Squad Player</option>
                      <option value="Breakthrough Prospect">Breakthrough Prospect</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Summary & Budget Confirmation */}
            {stepperStep === 3 && (
              <div className="space-y-3">
                <div className="font-semibold text-emerald-400">
                  {tr('3. Deal Summary & Budget Verification', '3. สรุปข้อเสนอและตรวจสอบงบประมาณ')}
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono">
                  {!isMyPlayer && (
                    <>
                      <div className="flex justify-between">
                        <span className="font-sans text-slate-400">
                          {tr('Cash Package Fee:', 'ค่าตัวเงินสดรวม:')}
                        </span>
                        <span className="text-white font-bold">
                          {offerType === 'Loan'
                            ? tr('Loan Deal', 'สัญญายืมตัว')
                            : `€${((upfrontFee + installmentsFee) / 1_000_000).toFixed(2)}M`}
                        </span>
                      </div>
                      {offerType === 'Transfer' && selectedSwapPlayer && swapEval && (
                        <div className="flex justify-between text-sky-300">
                          <span className="font-sans">
                            🔄 {tr('Part-Exchange Player:', 'นักเตะแลกตัว:')} {selectedSwapPlayer.firstName}{' '}
                            {selectedSwapPlayer.lastName}
                          </span>
                          <span className="font-bold">
                            +€{(swapEval.valuation / 1_000_000).toFixed(2)}M ({Math.round(swapEval.multiplier * 100)}%)
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">
                      {tr('Proposed Wage:', 'ค่าเหนื่อยที่เสนอ:')}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      €{proposedWage.toLocaleString()}/wk ({proposedYears} yrs)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-400">
                      {tr('Signing Bonus:', 'โบนัสแรกเข้า:')}
                    </span>
                    <span className="text-amber-300">€{signingBonus.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-800">
                    <span className="font-sans text-slate-400">
                      {tr('Your Transfer Budget:', 'งบซื้อขายคงเหลือของสโมสร:')}
                    </span>
                    <span className="text-sky-300">
                      €{(myClub.finances.transferBudget / 1_000_000).toFixed(2)}M
                    </span>
                  </div>
                </div>

                {/* Stage 14 Phase 4: Transfer Bidding War Alert */}
                {biddingWarState && (
                  <div
                    data-testid="bidding-war-alert"
                    className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/60 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-display font-bold text-rose-300 text-xs uppercase tracking-wider leading-snug">
                        ⚔️ {tr(
                          `BIDDING WAR: ${biddingWarState.rivalClubName} have matched your bid!`,
                          `ศึกแย่งตัวนักเตะ: ${biddingWarState.rivalClubName} ยื่นข้อเสนอปาดหน้าแล้ว!`
                        )}
                      </span>
                      <span className="text-[11px] font-mono text-amber-300 shrink-0 whitespace-nowrap px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
                        +{biddingWarState.requiredWageBoostPct}% {tr('Wage Required', 'ค่าเหนื่อยเพื่อปิดดีล')}
                      </span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {tr(
                        `${biddingWarState.rivalClubName} entered the race with a rival package of €${(biddingWarState.rivalBidFee / 1_000_000).toFixed(1)}M. Sweeten your contract offer by +${biddingWarState.requiredWageBoostPct}% (€${Math.round(proposedWage * 1.15).toLocaleString()}/wk) to immediately win the player's signature!`,
                        `${biddingWarState.rivalClubName} กระโดดร่วมวงยื่นข้อเสนอ €${(biddingWarState.rivalBidFee / 1_000_000).toFixed(1)}M แย่งตัว! กดเพิ่มค่าเหนื่อยอีก +${biddingWarState.requiredWageBoostPct}% (€${Math.round(proposedWage * 1.15).toLocaleString()}/สัปดาห์) เพื่อปาดหน้าปิดดีลทันที`
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="sweeten-contract-btn"
                        onClick={() => {
                          const res = onMakeTransferOffer({
                            playerId: player.id,
                            offerType,
                            upfrontFee,
                            installmentsFee,
                            sellOnPercentage: sellOnPct,
                            proposedWagePerWeek: proposedWage,
                            proposedContractYears: proposedYears,
                            proposedSquadStatus: proposedStatus,
                            signingBonus,
                            loanOptionToBuyFee,
                            buyBackClauseFee,
                            swapPlayerId: swapPlayerId || null,
                            sweetenBiddingWar: true,
                          });
                          if (!res || res.outcome === 'COMPLETED') {
                            setBiddingWarState(null);
                            setCounterOfferState(null);
                            setStepperOpen(false);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                      >
                        ⚡ {tr(
                          `Sweeten Contract Offer (+${biddingWarState.requiredWageBoostPct}%) & Sign`,
                          `เพิ่มค่าเหนื่อย (+${biddingWarState.requiredWageBoostPct}%) ปิดดีลทันที`
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBiddingWarState(null);
                          setStepperOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                      >
                        {tr('Withdraw Bid', 'ถอนตัวจากดีล')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Interactive Counter-Offer Round Card */}
                {counterOfferState && (
                  <div
                    className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-2.5"
                    data-testid="negotiation-counter-offer-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-amber-300 text-xs">
                        ⚡ {tr('Counter-Offer Received', 'ข้อเสนอสวนกลับจากอีกฝ่าย')}
                      </span>
                      <span className="text-[11px] font-mono text-amber-200">
                        {tr('Round Response', 'เจรจาต่อรอง')}
                      </span>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {tr(counterOfferState.messageEn, counterOfferState.messageTh)}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="accept-counter-offer-btn"
                        onClick={() => {
                          setUpfrontFee(counterOfferState.demandedUpfrontFee);
                          setProposedWage(counterOfferState.demandedWage);
                          setSigningBonus(counterOfferState.demandedBonus);
                          if (isMyPlayer) {
                            onRenewContract(
                              player.id,
                              counterOfferState.demandedWage,
                              proposedYears,
                              counterOfferState.demandedBonus
                            );
                          } else {
                            const res = onMakeTransferOffer({
                              playerId: player.id,
                              offerType,
                              upfrontFee: counterOfferState.demandedUpfrontFee,
                              installmentsFee,
                              sellOnPercentage: sellOnPct,
                              proposedWagePerWeek: counterOfferState.demandedWage,
                              proposedContractYears: proposedYears,
                              proposedSquadStatus: proposedStatus,
                              signingBonus: counterOfferState.demandedBonus,
                              loanOptionToBuyFee,
                              buyBackClauseFee,
                              swapPlayerId: swapPlayerId || null,
                            });
                            if (res && res.outcome === 'BIDDING_WAR' && res.biddingWar) {
                              setCounterOfferState(null);
                              setBiddingWarState(res.biddingWar);
                              return;
                            }
                          }
                          setCounterOfferState(null);
                          setStepperOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                      >
                        {tr('✓ Accept Counter-Offer & Finalize', '✓ ยอมรับข้อเสนอสวนกลับทันที')}
                      </button>
                      <button
                        type="button"
                        data-testid="adjust-counter-offer-btn"
                        onClick={() => {
                          setUpfrontFee(
                            Math.round((upfrontFee + counterOfferState.demandedUpfrontFee) / 2)
                          );
                          setProposedWage(
                            Math.round((proposedWage + counterOfferState.demandedWage) / 2)
                          );
                          setCounterOfferState(null);
                          setStepperStep(1);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold text-[11px] cursor-pointer"
                      >
                        {tr('Adjust Terms & Counter', 'ปรับตัวเลขต่อรองใหม่')}
                      </button>
                      <button
                        type="button"
                        data-testid="walk-away-negotiation-btn"
                        onClick={() => {
                          setCounterOfferState(null);
                          setStepperOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                      >
                        {tr('Walk Away', 'ล้มโต๊ะเจรจา')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stepper Footer Controls */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                data-testid="stepper-cancel-btn"
                onClick={() => {
                  if (stepperStep === 1) setStepperOpen(false);
                  else setStepperStep((s) => (s === 3 ? 2 : 1));
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                {stepperStep === 1 ? tr('Cancel', 'ยกเลิก') : tr('← Previous Step', '← ย้อนกลับ')}
              </button>

              {stepperStep < 3 ? (
                <button
                  type="button"
                  data-testid="stepper-next-btn"
                  onClick={() => setStepperStep((s) => (s === 1 ? 2 : 3))}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
                >
                  {tr('Next Step →', 'ขั้นตอนถัดไป →')}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="stepper-submit-btn"
                  onClick={() => {
                    const targetValuation =
                      player.askingPrice ||
                      Math.round(player.marketValue * (player.transferListed ? 0.92 : 1.12));
                    const targetWage = Math.round(player.wagePerWeek * 1.12);
                    const swapValAmt = offerType === 'Transfer' && swapEval ? swapEval.valuation : 0;
                    const totalOfferedFee =
                      upfrontFee + Math.round(installmentsFee * 0.85) + swapValAmt;

                    const feeShortfall =
                      !isMyPlayer &&
                      offerType === 'Transfer' &&
                      totalOfferedFee < targetValuation * 0.95;
                    const wageShortfall = proposedWage < targetWage * 0.96;

                    if ((feeShortfall || wageShortfall) && negotiationPatience > 30 && !counterOfferState) {
                      const demandedUpfront = Math.max(
                        upfrontFee,
                        Math.max(0, Math.round(targetValuation - installmentsFee * 0.85 - swapValAmt))
                      );
                      const demandedWageVal = Math.max(proposedWage, targetWage);
                      const demandedBonusVal = Math.max(
                        signingBonus,
                        Math.round(demandedWageVal * 2.5)
                      );
                      setNegotiationPatience((p) => Math.max(15, p - 35));
                      setCounterOfferState({
                        demandedUpfrontFee: demandedUpfront,
                        demandedWage: demandedWageVal,
                        demandedBonus: demandedBonusVal,
                        messageEn: isMyPlayer
                          ? `${player.lastName}'s agent insists on €${demandedWageVal.toLocaleString()}/wk and a €${demandedBonusVal.toLocaleString()} signing bonus to sign immediately.`
                          : `${playerClub?.shortName || 'Selling club'} & ${player.lastName}'s agent counter with €${(demandedUpfront / 1_000_000).toFixed(2)}M upfront${selectedSwapPlayer ? ` + ${selectedSwapPlayer.lastName}` : ''} and €${demandedWageVal.toLocaleString()}/wk wage.`,
                        messageTh: isMyPlayer
                          ? `เอเย่นต์ของ ${player.lastName} ยื่นคำขาดขอค่าเหนื่อย €${demandedWageVal.toLocaleString()}/สัปดาห์ พร้อมโบนัส €${demandedBonusVal.toLocaleString()} เพื่อปิดดีลทันที`
                          : `${playerClub?.shortName || 'สโมสรต้นสังกัด'} และเอเย่นต์ยื่นข้อเสนอสวนกลับที่ค่าตัวก้อนแรก €${(demandedUpfront / 1_000_000).toFixed(2)}M${selectedSwapPlayer ? ` + ${selectedSwapPlayer.lastName}` : ''} และค่าเหนื่อย €${demandedWageVal.toLocaleString()}/สัปดาห์`,
                      });
                      return;
                    }

                    if (isMyPlayer) {
                      onRenewContract(player.id, proposedWage, proposedYears, signingBonus);
                    } else {
                      const res = onMakeTransferOffer({
                        playerId: player.id,
                        offerType,
                        upfrontFee,
                        installmentsFee,
                        sellOnPercentage: sellOnPct,
                        proposedWagePerWeek: proposedWage,
                        proposedContractYears: proposedYears,
                        proposedSquadStatus: proposedStatus,
                        signingBonus,
                        loanOptionToBuyFee,
                        buyBackClauseFee,
                        swapPlayerId: swapPlayerId || null,
                      });
                      if (res && res.outcome === 'BIDDING_WAR' && res.biddingWar) {
                        setBiddingWarState(res.biddingWar);
                        return;
                      }
                    }
                    setCounterOfferState(null);
                    setBiddingWarState(null);
                    setStepperOpen(false);
                  }}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold cursor-pointer"
                >
                  {isMyPlayer
                    ? tr('✓ Confirm Contract Renewal', '✓ ยืนยันการต่อสัญญา')
                    : tr('✓ Submit Official Offer', '✓ ยื่นข้อเสนออย่างเป็นทางการ')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 1-on-1 Player Chat & Captain Intervention Modal (Stage 3 Pillar 3) */}
      {chatModalOpen && isMyPlayer && onPlayerChat && (
        <div
          data-testid="player-chat-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-sky-500/50 shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar player={player} club={playerClub} size="sm" />
                <div>
                  <h3 className="text-base font-display font-bold text-white">
                    💬 {tr('1-on-1 Manager Chat:', 'พูดคุยตัวต่อตัวกับ')} {player.firstName}{' '}
                    {player.lastName}
                  </h3>
                  <p className="text-slate-400 font-mono">
                    {tr('Morale:', 'ขวัญกำลังใจ:')} <strong className="text-emerald-400">{player.morale}%</strong> ·{' '}
                    {tr('Sharpness:', 'ความฟิตแมตช์:')} <strong className="text-sky-400">{player.matchSharpness ?? 80}%</strong> ·{' '}
                    {tr('Det:', 'ความมุ่งมั่น:')} <strong className="text-amber-300">{player.attributes.mental.determination}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-testid="close-player-chat-btn"
                onClick={() => setChatModalOpen(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {player.unhappyReason && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200">
                ⚠️ <strong>{tr('Current Concern:', 'ความกังวลปัจจุบัน:')}</strong> {player.unhappyReason}
              </div>
            )}

            <div className="space-y-2">
              {(
                [
                  {
                    id: 'PRAISE_FORM',
                    title: tr(
                      '🌟 Praise Recent Form & Training Attitude',
                      '🌟 ชื่นชมฟอร์มการเล่นและความทุ่มเทในการซ้อม'
                    ),
                    desc: tr(
                      'Boosts Morale (+10) & Match Sharpness (+4%). Ideal when morale or rating is solid.',
                      'เพิ่มขวัญกำลังใจ (+10) และความฟิตแมตช์ (+4%)'
                    ),
                    reply: tr(
                      `"Thanks Boss! I'm feeling sharp and ready to give everything for ${myClub?.shortName}."`,
                      `"ขอบคุณครับบอส! ผมรู้สึกมั่นใจมากและพร้อมทุ่มเทเต็มร้อยเพื่อ ${myClub?.shortName}"`
                    ),
                  },
                  {
                    id: 'CRITICIZE_FORM',
                    title: tr(
                      '🔥 Demand Higher Standards / Criticize Recent Displays',
                      '🔥 ตำหนิฟอร์มและเรียกร้องมาตรฐานที่สูงขึ้น'
                    ),
                    desc: tr(
                      'High Determination (>=13) players respond with +8% Sharpness & +6 Morale.',
                      'นักเตะที่มีค่าความมุ่งมั่นสูง (Det >= 13) จะฮึดสู้และเพิ่มความฟิตแมตช์ (+8%)'
                    ),
                    reply:
                      player.attributes.mental.determination >= 13
                        ? tr(
                            `"You're right gaffer. I know I haven't been at my best—watch me prove myself on the pitch."`,
                            `"บอสพูดถูกครับ ผมรู้ว่ายังทำได้ดีกว่านี้ รอดูผมพิสูจน์ตัวเองในสนามได้เลย"`
                          )
                        : tr(
                            `"I think that's a bit harsh, Boss, but I'll try to work harder."`,
                            `"ผมคิดว่าบอสพูดแรงไปนิดนะครับ แต่ผมจะพยายามซ้อมให้หนักขึ้น"`
                          ),
                  },
                  {
                    id: 'EXPLAIN_ROTATION',
                    title: tr(
                      '🤝 Explain Squad Rotation & Promise Upcoming Minutes',
                      '🤝 อธิบายแผนการโรเตชั่นและสัญญาว่าจะให้โอกาสลงสนาม'
                    ),
                    desc: tr(
                      'Clears playing-time unhappiness, resets consecutive bench streak, and restores +14 Morale.',
                      'เคลียร์ปัญหาไม่พอใจเรื่องเวลาลงสนาม รีเซ็ตสถิตินั่งสำรองติดกัน และฟื้นฟูขวัญกำลังใจ (+14)'
                    ),
                    reply: tr(
                      `"I appreciate the honesty, Boss. Knowing I'm part of your rotation plans puts my mind at ease."`,
                      `"ขอบคุณที่เปิดใจคุยกันตรงๆ ครับบอส พอรู้ว่าผมยังอยู่ในแผนการทำทีมก็สบายใจขึ้นเยอะครับ"`
                    ),
                  },
                  {
                    id: 'CAPTAIN_INTERVENE',
                    title: tr(
                      '©️ Ask Club Captain to Intervene & Mentor',
                      '©️ มอบหมายให้กัปตันทีมช่วยพูดคุยเคลียร์ใจ'
                    ),
                    desc: tr(
                      'Uses Club Captain Leadership to resolve dressing-room friction and boost Morale.',
                      'ใช้ค่าความเป็นผู้นำ (Leadership) ของกัปตันทีมช่วยประสานรอยร้าวและดึงขวัญกำลังใจกลับมา'
                    ),
                    reply: tr(
                      `The club captain sat down with ${player.lastName} after training and resolved the tension.`,
                      `กัปตันทีมเข้าไปพูดคุยปรับความเข้าใจกับ ${player.lastName} หลังเลิกซ้อมจนบรรยากาศดีขึ้นมาก`
                    ),
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`player-chat-topic-${opt.id.toLowerCase()}`}
                  onClick={() => {
                    onPlayerChat(player.id, opt.id);
                    setChatFeedback(opt.reply);
                  }}
                  className="w-full p-3 rounded-xl bg-slate-950 hover:bg-sky-500/15 border border-slate-800 hover:border-sky-500/40 text-left space-y-1 cursor-pointer transition-colors"
                >
                  <div className="font-semibold text-white">{opt.title}</div>
                  <div className="text-[11px] text-slate-400">{opt.desc}</div>
                </button>
              ))}
            </div>

            {chatFeedback && (
              <div
                data-testid="player-chat-response-box"
                className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-medium"
              >
                💬 {chatFeedback}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
