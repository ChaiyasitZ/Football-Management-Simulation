import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  FolderOpen,
  Lock,
  LogIn,
  LogOut,
  Play,
  Shield,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  AIManagerStyle,
  Club,
  CustomClubConfig,
  FormationId,
  LeagueId,
  ManagerProfile,
  ScenarioChallengeId,
  WorldState,
} from '../types/game';
import { CLUB_TEMPLATES, ClubSeedTemplate, LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { buildAuthenticTeamInstructions } from '../engine/tacticsEngine';
import { SaveSlotMeta } from '../engine/worldSimulationService';
import { ClubBadge } from './ClubBadge';
import { CompetitionBadge, NationalityFlag, TrophyArtwork } from './TrophyAndKitVisuals';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';
import type { User } from '../firebase';

interface TitleScreenProps {
  world: WorldState | null;
  saveSlots: SaveSlotMeta[];
  authUser?: User | null;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onGoogleSignIn?: () => void;
  onGoogleSignOut?: () => void;
  onQuickStart: () => void;
  onStartCustomCareer: (
    manager: Partial<ManagerProfile>,
    clubId: string,
    scenarioChallenge?: ScenarioChallengeId,
    customClubConfig?: CustomClubConfig | null
  ) => void;
  onLoadSlot: (slotId: string) => void;
  onDeleteSlot: (slotId: string) => void;
}

const FEATURED_GIANT_CLUB_IDS = [
  'club_eng_pl_1', // Arsenal
  'club_esp_ll_1', // Real Madrid
  'club_eng_pl_3', // Liverpool
  'club_ger_bl_1', // Bayern Munich
  'club_esp_ll_2', // Barcelona
  'club_ita_sa_1', // Inter Milan
  'club_fra_l1_1', // PSG
  'club_eng_pl_2', // Manchester City
];

const COUNTRY_GROUPS = [
  { countryId: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'England' },
  { countryId: 'ESP', flag: '🇪🇸', name: 'Spain' },
  { countryId: 'GER', flag: '🇩🇪', name: 'Germany' },
  { countryId: 'ITA', flag: '🇮🇹', name: 'Italy' },
  { countryId: 'FRA', flag: '🇫🇷', name: 'France' },
  { countryId: 'POR', flag: '🇵🇹', name: 'Portugal' },
  { countryId: 'NED', flag: '🇳🇱', name: 'Netherlands' },
  { countryId: 'BEL', flag: '🇧🇪', name: 'Belgium' },
  { countryId: 'TUR', flag: '🇹🇷', name: 'Türkiye' },
  { countryId: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', name: 'Scotland' },
  { countryId: 'AUT', flag: '🇦🇹', name: 'Austria' },
  { countryId: 'SUI', flag: '🇨🇭', name: 'Switzerland' },
  { countryId: 'GRE', flag: '🇬🇷', name: 'Greece' },
  { countryId: 'KSA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { countryId: 'USA', flag: '🇺🇸', name: 'USA' },
  { countryId: 'BRA', flag: '🇧🇷', name: 'Brazil' },
  { countryId: 'JPN', flag: '🇯🇵', name: 'Japan' },
];

const SCENARIO_CHALLENGES: {
  id: ScenarioChallengeId;
  badge: string;
  titleEn: string;
  descEn: string;
}[] = [
  {
    id: 'STANDARD',
    badge: '🏆',
    titleEn: 'Standard Career (Authentic 2025/26)',
    descEn: 'Full transfer budgets, normal fitness, and clean league points.',
  },
  {
    id: 'POINTS_DEDUCTION',
    badge: '⚖️',
    titleEn: 'FFP Crisis (-10 Points Deduction)',
    descEn: 'Start the season on -10 league points after an FFP sanction.',
  },
  {
    id: 'INJURY_CRISIS',
    badge: '🚑',
    titleEn: 'Pre-Season Injury Crisis',
    descEn: '4 senior starters begin the campaign in the medical room.',
  },
  {
    id: 'YOUTH_ONLY',
    badge: '🌱',
    titleEn: 'Cantera / Youth Academy Embargo',
    descEn: '12-month transfer embargo: rely on your squad and U18/U21 graduates.',
  },
];

function buildPreviewClubFromTemplate(
  leagueId: LeagueId,
  idx: number,
  tpl: ClubSeedTemplate
): Club {
  const clubId = `club_${leagueId.toLowerCase()}_${idx + 1}`;
  const leagueCfg = LEAGUES_CONFIG[leagueId];
  const repFactor = Math.pow(Math.max(50, tpl.reputation) / 100, 3);
  const transferBudget =
    tpl.transferBudgetEur !== undefined
      ? tpl.transferBudgetEur
      : Math.max(1_200_000, Math.round((repFactor * 115_000_000) / 500_000) * 500_000);
  const wageBudgetPerWeek =
    tpl.wageBudgetEur !== undefined
      ? tpl.wageBudgetEur
      : Math.max(65_000, Math.round((repFactor * 3_800_000) / 10_000) * 10_000);
  const formation: FormationId =
    tpl.preferredFormation || (idx % 3 === 0 ? '4-3-3' : idx % 3 === 1 ? '4-2-3-1' : '3-4-3');
  const secondaryFormation: FormationId = tpl.secondaryFormation || '4-2-3-1';
  const authenticInstructions = buildAuthenticTeamInstructions(tpl.tacticalPreset);

  return {
    id: clubId,
    name: tpl.name,
    shortName: tpl.shortName,
    countryId: leagueCfg.countryId,
    leagueId,
    city: tpl.city,
    reputation: tpl.reputation,
    primaryColor: tpl.primaryColor,
    secondaryColor: tpl.secondaryColor,
    logoUrl: tpl.logoUrl,
    stadiumName: tpl.stadiumName,
    stadiumCapacity: tpl.stadiumCapacity,
    trainingFacilities: Math.min(20, Math.max(10, Math.round(tpl.reputation / 5))),
    youthFacilities: Math.min(20, Math.max(10, Math.round(tpl.reputation / 5.2))),
    juniorCoaching: 15,
    youthRecruitment: 15,
    sugarDaddyType: tpl.reputation >= 90 ? 'FRONT_END' : 'NONE',
    finances: {
      balance: Math.round(transferBudget * 1.4),
      transferBudget,
      wageBudgetPerWeek,
      wageUsedPerWeek: Math.round(wageBudgetPerWeek * 0.82),
      debt: 0,
      sponsorRevenueAnnual: Math.round(repFactor * 35_000_000),
      ticketPriceAvg: 48,
    },
    boardExpectations: {
      targetLeaguePosition: Math.max(1, Math.min(leagueCfg.targetClubCount, idx + 1)),
      cupTarget: idx < 4 ? 'Semi-Final' : 'Quarter-Final',
      clubVision: 'Compete at the highest level and develop elite talent.',
      confidence: {
        overall: 80,
        leaguePerformance: 80,
        financialManagement: 82,
        youthDevelopment: 78,
        squadAtmosphere: 80,
      },
    },
    aiManager: {
      name: tpl.managerName,
      style: 'Attacking Manager',
      reputation: tpl.reputation,
      jobSecurity: 82,
    },
    primaryTactic: {
      id: `tac_${clubId}_1`,
      name: `Primary ${formation}`,
      formation,
      instructions: authenticInstructions,
      lineup: [],
      benchPlayerIds: [],
      familiarity: 85,
    },
    secondaryTactic: {
      id: `tac_${clubId}_2`,
      name: `Secondary ${secondaryFormation}`,
      formation: secondaryFormation,
      instructions: authenticInstructions,
      lineup: [],
      benchPlayerIds: [],
      familiarity: 75,
    },
    trainingFocus: 'Possession',
    trainingIntensity: 'Standard',
  };
}

function getReputationStars(rep: number): string {
  if (rep >= 90) return '★★★★★';
  if (rep >= 80) return '★★★★☆';
  if (rep >= 70) return '★★★☆☆';
  if (rep >= 60) return '★★☆☆☆';
  return '★☆☆☆☆';
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  world,
  saveSlots,
  authUser,
  isMuted = false,
  onToggleMute,
  onGoogleSignIn,
  onGoogleSignOut,
  onStartCustomCareer,
  onLoadSlot,
  onDeleteSlot,
}) => {
  const { tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Featured Spotlight Club state (cycles through European Giants or user's latest saved club)
  const [spotlightIndex, setSpotlightIndex] = useState<number>(0);

  // Modals & 2-Step Wizard State
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [loginRequiredModalOpen, setLoginRequiredModalOpen] = useState(false);
  const [pendingPostLoginAction, setPendingPostLoginAction] = useState<
    'NEW_CAREER' | 'QUICK_START' | 'CLOUD_SAVES' | 'CUSTOMIZE_SPOTLIGHT' | null
  >(null);

  // Career Setup Form State
  const [managerName, setManagerName] = useState(world?.manager.name || 'Alex Mercer');
  const [nationality, setNationality] = useState(world?.manager.nationality || 'England');
  const [age, setAge] = useState(world?.manager.age || 38);
  const [coachingStyle, setCoachingStyle] = useState<ManagerProfile['coachingStyle']>(
    world?.manager.coachingStyle || 'Tactician'
  );
  const [tacticalStyle, setTacticalStyle] = useState<AIManagerStyle>(
    world?.manager.tacticalStyle || 'Attacking Manager'
  );
  const [selectedLeagueId, setSelectedLeagueId] = useState<LeagueId>('ENG_PL');
  const [selectedClubId, setSelectedClubId] = useState<string>(
    world?.controlledClubId || 'club_eng_pl_1'
  );
  const [selectedScenario, setSelectedScenario] = useState<ScenarioChallengeId>('STANDARD');

  // Create-a-Club Mode State
  const [createAClubEnabled, setCreateAClubEnabled] = useState(false);
  const [customClubName, setCustomClubName] = useState('London Athletic FC');
  const [customShortName, setCustomShortName] = useState('LON');
  const [customStadiumName, setCustomStadiumName] = useState('New Crown Arena');
  const [customPrimaryColor, setCustomPrimaryColor] = useState('#10b981');
  const [customSecondaryColor, setCustomSecondaryColor] = useState('#0f172a');

  const previewClubsMap = useMemo(() => {
    if (world) return world.clubs;
    const map: Record<string, Club> = {};
    for (const [leagueId, templates] of Object.entries(CLUB_TEMPLATES) as [
      LeagueId,
      ClubSeedTemplate[],
    ][]) {
      templates.forEach((tpl, idx) => {
        const club = buildPreviewClubFromTemplate(leagueId, idx, tpl);
        map[club.id] = club;
      });
    }
    return map;
  }, [world]);

  const latestSave = saveSlots[0] || null;

  // Featured clubs list for the Spotlight Deck & Quick Start Dugout
  const featuredClubs = useMemo(() => {
    const list: Club[] = [];
    if (latestSave) {
      const savedClub = Object.values(previewClubsMap).find(
        (c) => c.name === latestSave.clubName
      );
      if (savedClub) list.push(savedClub);
    }
    for (const cid of FEATURED_GIANT_CLUB_IDS) {
      const c = previewClubsMap[cid];
      if (c && !list.some((existing) => existing.id === c.id)) {
        list.push(c);
      }
    }
    return list.length > 0 ? list : Object.values(previewClubsMap).slice(0, 6);
  }, [previewClubsMap, latestSave]);

  const activeSpotlightClub =
    featuredClubs[spotlightIndex % featuredClubs.length] ||
    previewClubsMap[selectedClubId] ||
    Object.values(previewClubsMap)[0];

  const clubsInSelectedLeague = useMemo(
    () =>
      Object.values(previewClubsMap)
        .filter((c) => c.leagueId === selectedLeagueId)
        .sort((a, b) => b.reputation - a.reputation),
    [previewClubsMap, selectedLeagueId]
  );

  const selectedClub = previewClubsMap[selectedClubId] || clubsInSelectedLeague[0];

  // Ambient club color reactive to either setup modal selection or Featured Spotlight Deck
  const ambientClub = setupModalOpen ? selectedClub : activeSpotlightClub;
  const ambientPrimary =
    setupModalOpen && createAClubEnabled
      ? customPrimaryColor
      : ambientClub?.primaryColor || '#10b981';
  const ambientSecondary =
    setupModalOpen && createAClubEnabled
      ? customSecondaryColor
      : ambientClub?.secondaryColor || '#0ea5e9';

  // Stage 6 Phase 2.1: Lightweight 60fps Canvas (3D Perspective Tactical Pitch Grid + Stadium Floodlight Bokeh)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId = 0;
    let isVisible = !document.hidden;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const mouse = { x: width * 0.5, y: height * 0.35, targetX: width * 0.5, targetY: height * 0.35 };

    interface BokehParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      phase: number;
    }

    const particles: BokehParticle[] = Array.from({ length: 28 }, (_, i) => ({
      x: ((i * 173) % 1000) * 0.001 * width,
      y: ((i * 293) % 1000) * 0.001 * height,
      vx: ((i % 5) - 2) * 0.14 || 0.1,
      vy: -0.12 - (i % 4) * 0.06,
      r: 1.5 + (i % 4) * 1.1,
      alpha: 0.12 + (i % 5) * 0.06,
      phase: i * 0.7,
    }));

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    };

    const handleVisibilityChange = () => {
      const nextVisible = !document.hidden;
      if (nextVisible && !isVisible) {
        isVisible = true;
        animationFrameId = requestAnimationFrame(render);
      } else {
        isVisible = nextVisible;
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let tick = 0;
    const render = () => {
      if (!isVisible) return;
      tick += 0.012;

      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      ctx.clearRect(0, 0, width, height);

      const parallaxX = ((mouse.x - width * 0.5) / Math.max(1, width)) * 28;
      const parallaxY = ((mouse.y - height * 0.5) / Math.max(1, height)) * 14;

      // 1. Perspective 3D Tactical Pitch Grid at bottom 42% of viewport
      const horizonY = height * 0.58 + parallaxY * 0.4;
      const bottomY = height * 0.98;
      const centerX = width * 0.5 + parallaxX * 0.5;

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
      ctx.lineWidth = 1;

      const numLongLines = 9;
      for (let i = -numLongLines; i <= numLongLines; i++) {
        const topSpread = i * (width * 0.032);
        const bottomSpread = i * (width * 0.095);
        ctx.beginPath();
        ctx.moveTo(centerX + topSpread, horizonY);
        ctx.lineTo(centerX + bottomSpread, bottomY);
        ctx.stroke();
      }

      const rows = [0, 0.16, 0.35, 0.58, 0.82, 1.0];
      for (const t of rows) {
        const y = horizonY + (bottomY - horizonY) * t;
        const halfSpan = width * (0.28 + t * 0.58);
        ctx.beginPath();
        ctx.moveTo(centerX - halfSpan, y);
        ctx.lineTo(centerX + halfSpan, y);
        ctx.stroke();
      }

      // Perspective Center Circle & Tactical Arc
      const midY = horizonY + (bottomY - horizonY) * 0.46;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(centerX, midY, width * 0.09, height * 0.028, 0, 0, Math.PI * 2);
      ctx.stroke();

      const pulseAlpha = 0.12 + Math.sin(tick * 2) * 0.05;
      ctx.strokeStyle = `rgba(56, 189, 248, ${pulseAlpha.toFixed(3)})`;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(centerX - width * 0.14, midY + height * 0.06);
      ctx.quadraticCurveTo(
        centerX - width * 0.02,
        midY - height * 0.04,
        centerX + width * 0.12,
        midY - height * 0.02
      );
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // 2. Smooth Stadium Floodlight Bokeh Particles
      ctx.fillStyle = '#e2e8f0';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -10) p.y = height + 10;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        const twinkle = p.alpha + Math.sin(tick * 2.5 + p.phase) * 0.05;
        ctx.globalAlpha = Math.max(0.04, Math.min(0.35, twinkle));
        ctx.beginPath();
        ctx.arc(p.x + parallaxX * 0.3, p.y + parallaxY * 0.3, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleLaunchCustomCareer = () => {
    const customConfig: CustomClubConfig | null = createAClubEnabled
      ? {
          enabled: true,
          name: customClubName.trim() || 'Custom FC',
          shortName:
            (customShortName.trim() || 'CFC').toUpperCase().slice(0, 3) || 'CFC',
          stadiumName: customStadiumName.trim() || 'Custom Arena',
          primaryColor: customPrimaryColor,
          secondaryColor: customSecondaryColor,
        }
      : null;

    onStartCustomCareer(
      {
        name: managerName.trim() || 'Alex Mercer',
        nationality,
        age,
        coachingStyle,
        tacticalStyle,
      },
      selectedClubId,
      selectedScenario,
      customConfig
    );
    setSetupModalOpen(false);
  };

  const handleQuickStartFeaturedClub = (clubToManage: Club) => {
    if (!authUser) {
      setPendingPostLoginAction('QUICK_START');
      setLoginRequiredModalOpen(true);
      return;
    }
    onStartCustomCareer(
      {
        name: managerName.trim() || 'Alex Mercer',
        nationality,
        age,
        coachingStyle,
        tacticalStyle,
      },
      clubToManage.id,
      'STANDARD',
      null
    );
  };

  // Automatically execute pending post-login action once user signs in with Google
  useEffect(() => {
    if (!authUser || !pendingPostLoginAction) return;
    setLoginRequiredModalOpen(false);
    const action = pendingPostLoginAction;
    setPendingPostLoginAction(null);
    if (action === 'NEW_CAREER') {
      setWizardStep(1);
      setSetupModalOpen(true);
    } else if (action === 'QUICK_START') {
      onStartCustomCareer(
        {
          name: managerName.trim() || 'Alex Mercer',
          nationality,
          age,
          coachingStyle,
          tacticalStyle,
        },
        activeSpotlightClub.id,
        'STANDARD',
        null
      );
    } else if (action === 'CLOUD_SAVES') {
      setLoadModalOpen(true);
    } else if (action === 'CUSTOMIZE_SPOTLIGHT') {
      setSelectedLeagueId(activeSpotlightClub.leagueId);
      setSelectedClubId(activeSpotlightClub.id);
      setWizardStep(2);
      setSetupModalOpen(true);
    }
  }, [
    authUser,
    pendingPostLoginAction,
    activeSpotlightClub,
    age,
    coachingStyle,
    managerName,
    nationality,
    onStartCustomCareer,
    tacticalStyle,
  ]);

  const leagueList = useMemo(() => Object.values(LEAGUES_CONFIG), []);

  return (
    <div
      data-testid="title-screen"
      className="relative w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden select-none flex flex-col justify-between"
    >
      {/* Dynamic Club Ambient Stadium Floodlight Glow (Smooth 700ms Transition) */}
      <div
        className="pointer-events-none absolute -top-28 -left-24 w-[620px] h-[620px] rounded-full blur-[150px] opacity-25 transition-all duration-700"
        style={{ backgroundColor: ambientPrimary }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 w-[620px] h-[620px] rounded-full blur-[160px] opacity-20 transition-all duration-700"
        style={{ backgroundColor: ambientSecondary }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.2)_0%,_rgba(2,6,23,0.88)_75%)]" />

      {/* 60fps Perspective Tactical Pitch & Floodlight Bokeh Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-0"
      />

      {/* TOP BROADCAST STATUS BAR */}
      <header className="relative z-10 px-6 md:px-10 py-3.5 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono font-bold tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            FM27 BROADCAST ENGINE
          </span>
          <span className="hidden md:inline text-xs font-mono text-slate-400">
            {tr(
              'SEASON 2025/26 · 23 WORLD & EUROPEAN LEAGUES · 394 CLUBS · 100% CLOUD SAVE EDITION',
              'ฤดูกาล 2025/26 · 23 ลีกทั่วโลกและยุโรป · 394 สโมสร · ระบบเซฟ Cloud Firestore 100%'
            )}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Cloud Auth Pill */}
          {authUser ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-200 font-medium truncate max-w-[180px]">
                {authUser.email || authUser.displayName}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px]">
                {saveSlots.length} {tr('Cloud Saves', 'เซฟบน Cloud')}
              </span>
              {onGoogleSignOut && (
                <button
                  type="button"
                  onClick={onGoogleSignOut}
                  title={tr('Sign Out', 'ออกจากระบบ')}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            onGoogleSignIn && (
              <button
                type="button"
                data-testid="google-signin-title-btn"
                onClick={onGoogleSignIn}
                className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span>{tr('Sign in with Google (Cloud Save)', 'เข้าสู่ระบบ Gmail (ซิงก์เซฟ Cloud)')}</span>
              </button>
            )
          )}

          {onToggleMute && (
            <button
              type="button"
              data-testid="title-mute-toggle-btn"
              onClick={onToggleMute}
              title={isMuted ? tr('Unmute Audio', 'เปิดเสียงเอฟเฟกต์') : tr('Mute Audio', 'ปิดเสียงเอฟเฟกต์')}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>
          )}

          <LanguageSwitcher />
        </div>
      </header>

      {/* MAIN 2-COLUMN HERO COMMAND DECK */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 md:px-10 py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center overflow-y-auto lg:overflow-visible">
        {/* LEFT COLUMN (7 COLS): OFFICIAL BRANDING & SLEEK FM27 ACTION STACK */}
        <div className="lg:col-span-7 flex flex-col items-start justify-center space-y-5">
          {/* Official Game Crest & Title Lockup */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <img
              src="/assets/aistudio/touchline_logo.webp"
              alt="TOUCHLINE Football Manager"
              width={520}
              height={320}
              fetchPriority="high"
              loading="eager"
              decoding="async"
              data-testid="title-hero-logo"
              className="w-56 sm:w-64 h-36 sm:h-40 -my-4 -ml-3 object-contain object-left drop-shadow-[0_14px_32px_rgba(16,185,129,0.35)] select-none pointer-events-none"
            />
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/80 text-[11px] font-mono text-emerald-400">
                <Sparkles className="w-3 h-3" />
                <span>FOOTBALL MANAGEMENT SIMULATION</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-white">
                {tr('EVERY TACTICAL CALL MATTERS.', 'ทุกการตัดสินใจข้างสนามคือชัยชนะ')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                {tr(
                  'Command 394 clubs across 23 World & European leagues with live 2D pitch physics, UEFA Swiss Phase, realistic Pre-Season Tours, and 100% Cloud Firestore career sync.',
                  'คุมทัพ 394 สโมสรจาก 23 ลีกดังทั่วโลกและยุโรป พร้อมเอนจินสนาม 2D สมจริง, ถ้วยยุโรป Swiss Model, แคมป์ปรีซีซั่น และระบบเซฟเกมบน Cloud Firestore 100%'
                )}
              </p>
            </div>
          </div>

          {/* FM27 Vertical Hero Action Stack */}
          <div className="w-full max-w-xl space-y-2.5 pt-1">
            {/* Stage 10 Phase 2: Mandatory Cloud Account Required Gate Banner when unauthenticated */}
            {!authUser && (
              <div
                data-testid="mandatory-login-gate-card"
                className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-slate-900/95 to-emerald-500/20 border-2 border-amber-400/60 shadow-xl space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-amber-300 shrink-0">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider font-extrabold text-amber-300">
                        🔒 {tr('CLOUD ACCOUNT REQUIRED TO PLAY', 'กรุณาเข้าสู่ระบบด้วย GOOGLE ก่อนเข้าเล่น')}
                      </div>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        {tr(
                          '100% Cloud Firestore Save Edition — Sign in with your Google / Gmail account to unlock career modes and prevent save data loss.',
                          'ระบบเซฟเกม Cloud Firestore 100% — กรุณาเข้าสู่ระบบด้วยบัญชี Google / Gmail เพื่อปลดล็อกโหมดผู้จัดการทีมและป้องกันข้อมูลเซฟสูญหาย'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                {onGoogleSignIn && (
                  <button
                    type="button"
                    data-testid="mandatory-google-login-btn"
                    onClick={onGoogleSignIn}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 cursor-pointer transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>
                      {tr(
                        'Sign in with Google / Gmail to Unlock Dugout →',
                        'เข้าสู่ระบบด้วย Google / Gmail เพื่อปลดล็อกเข้าเล่นเกม →'
                      )}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* 1. CONTINUE CLOUD CAREER (Shown when user is logged in and has a cloud save) */}
            {authUser && latestSave && (
              <button
                type="button"
                data-testid="continue-career-hero-btn"
                onClick={() => onLoadSlot(latestSave.slotId)}
                className="w-full group p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-xl shadow-emerald-950/50 flex items-center justify-between gap-4 cursor-pointer hover:translate-x-1.5 transition-all duration-200"
              >
                <div className="flex items-center gap-3.5 min-w-0 text-left">
                  <div className="w-11 h-11 rounded-xl bg-slate-950/15 flex items-center justify-center shrink-0">
                    <Play className="w-5 h-5 fill-slate-950 text-slate-950" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-900/80 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5" />
                      <span>
                        {tr('CONTINUE CLOUD CAREER', 'เล่นต่อจากเซฟล่าสุดบน CLOUD')}
                      </span>
                    </div>
                    <div className="text-base sm:text-lg font-display font-extrabold text-slate-950 truncate">
                      {latestSave.clubName} · {latestSave.managerName}
                    </div>
                    <div className="text-xs font-mono text-slate-900/90">
                      {tr('Date:', 'วันที่:')} {latestSave.gameDate} · {tr('Season', 'ฤดูกาล')}{' '}
                      {latestSave.season}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs font-bold shrink-0">
                  {tr('Resume →', 'เข้าเกม →')}
                </span>
              </button>
            )}

            {/* 2. START NEW CAREER (Opens 2-Step Wizard Modal or Login Gate if unauthenticated) */}
            <button
              type="button"
              data-testid="open-setup-modal-btn"
              onClick={() => {
                if (!authUser) {
                  setPendingPostLoginAction('NEW_CAREER');
                  setLoginRequiredModalOpen(true);
                  return;
                }
                setWizardStep(1);
                setSetupModalOpen(true);
              }}
              className={`w-full group p-4 rounded-2xl border flex items-center justify-between gap-4 cursor-pointer hover:translate-x-1.5 transition-all duration-200 ${
                !authUser || latestSave
                  ? 'bg-slate-900/90 hover:bg-slate-800/95 border-slate-700/80 text-white'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 border-emerald-400 text-slate-950 shadow-xl shadow-emerald-950/50'
              }`}
            >
              <div className="flex items-center gap-3.5 text-left">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                    !authUser || latestSave
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-950/15 text-slate-950'
                  }`}
                >
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div
                    className={`text-base font-display font-extrabold flex items-center gap-2 ${
                      !authUser || latestSave ? 'text-white' : 'text-slate-950'
                    }`}
                  >
                    {!authUser && <span title="Sign in required">🔒</span>}
                    <span>
                      {tr(
                        'START NEW CAREER (394 CLUBS · 23 LEAGUES)',
                        'เริ่มต้นอาชีพผู้จัดการทีมใหม่ (เลือกจาก 394 สโมสร · 23 ลีก)'
                      )}
                    </span>
                  </div>
                  <div
                    className={`text-xs ${
                      !authUser || latestSave ? 'text-slate-400' : 'text-slate-900/85 font-medium'
                    }`}
                  >
                    {tr(
                      'Choose any club across 17 countries, Scenario Challenges, or Create-a-Club',
                      'เลือกสโมสรจาก 23 ลีกทั่วโลกและยุโรป, โหมดท้าทายพิเศษ หรือสร้างสโมสรของคุณเอง'
                    )}
                  </div>
                </div>
              </div>
              <span
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold shrink-0 ${
                  !authUser
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : latestSave
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-950 text-emerald-400'
                }`}
              >
                {!authUser ? tr('🔒 Sign In →', '🔒 ล็อกอิน →') : tr('Configure →', 'ตั้งค่า →')}
              </span>
            </button>

            {/* 3. QUICK START DUGOUT (Instant launch with active Spotlight Club + < > selector) */}
            <div className="w-full p-3.5 rounded-2xl bg-slate-900/85 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 hover:translate-x-1.5 transition-all duration-200">
              <button
                type="button"
                data-testid="quick-start-btn"
                onClick={() => handleQuickStartFeaturedClub(activeSpotlightClub)}
                className="flex-1 flex items-center gap-3.5 text-left cursor-pointer min-w-0"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-display font-bold text-white flex items-center gap-2">
                    {!authUser && <span title="Sign in required">🔒</span>}
                    <span>{tr('QUICK START DUGOUT', 'เริ่มคุมทีมด่วนทันที')}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono text-[11px] truncate">
                      {activeSpotlightClub.name}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {tr(
                      `Jump straight into the dugout with ${activeSpotlightClub.name} (${activeSpotlightClub.primaryTactic.formation})`,
                      `กระโดดเข้าคุมทีม ${activeSpotlightClub.name} ทันทีโดยไม่ต้องตั้งค่า (${activeSpotlightClub.primaryTactic.formation})`
                    )}
                  </div>
                </div>
              </button>

              {/* Inline Club Cycler Arrows */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid="quick-start-prev-club"
                  onClick={() =>
                    setSpotlightIndex(
                      (prev) => (prev - 1 + featuredClubs.length) % featuredClubs.length
                    )
                  }
                  title={tr('Previous Featured Club', 'สโมสรแนะนำก่อนหน้า')}
                  className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="quick-start-next-club"
                  onClick={() =>
                    setSpotlightIndex((prev) => (prev + 1) % featuredClubs.length)
                  }
                  title={tr('Next Featured Club', 'สโมสรแนะนำถัดไป')}
                  className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 4. CLOUD SAVE MANAGER */}
            <button
              type="button"
              data-testid="open-load-modal-btn"
              onClick={() => {
                if (!authUser) {
                  setPendingPostLoginAction('CLOUD_SAVES');
                  setLoginRequiredModalOpen(true);
                  return;
                }
                setLoadModalOpen(true);
              }}
              className="w-full p-3.5 rounded-2xl bg-slate-900/75 hover:bg-slate-800/90 border border-slate-800 text-slate-200 flex items-center justify-between gap-4 cursor-pointer hover:translate-x-1.5 transition-all duration-200"
            >
              <div className="flex items-center gap-3.5 text-left">
                <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-display font-bold text-white flex items-center gap-2">
                    {!authUser && <span title="Sign in required">🔒</span>}
                    <span>{tr('CLOUD SAVE MANAGER', 'จัดการช่องเซฟเกมบน CLOUD')}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-mono text-[11px]">
                      {saveSlots.length}/5 {tr('Slots', 'สล็อต')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {authUser
                      ? tr(
                          `Synced with ${authUser.email || authUser.displayName}`,
                          `ซิงก์ข้อมูลกับบัญชี ${authUser.email || authUser.displayName} แล้ว`
                        )
                      : tr(
                          'Sign in with Google/Gmail required to access your Cloud Career saves',
                          'กรุณาเข้าสู่ระบบด้วย Gmail เพื่อเปิดดูและโหลดเซฟเกมบน Cloud'
                        )}
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono text-emerald-400 shrink-0">
                {!authUser ? tr('🔒 Locked', '🔒 ล็อกอิน') : tr('Open →', 'เปิดดู →')}
              </span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN (5 COLS): INTERACTIVE FEATURED CLUB SPOTLIGHT DECK */}
        <div
          data-testid="featured-club-spotlight-deck"
          className="lg:col-span-5 bg-slate-900/85 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden"
          style={{
            borderTop: `4px solid ${activeSpotlightClub.primaryColor}`,
          }}
        >
          {/* Subtle top right ambient glow inside card */}
          <div
            className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-25 transition-all duration-700"
            style={{ backgroundColor: activeSpotlightClub.primaryColor }}
          />

          {/* Deck Header & Club Selector Pills */}
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                {tr('FEATURED CLUB SPOTLIGHT', 'สโมสรไฮไลต์ประจำฤดูกาล')}
              </div>
              <div className="text-xs text-slate-400">
                {tr(
                  'Click any club to preview crest, warchest & tactics',
                  'คลิกเลือกสโมสรเพื่อดูตราสโมสร งบประมาณ และแผนการเล่น'
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setSpotlightIndex(
                    (prev) => (prev - 1 + featuredClubs.length) % featuredClubs.length
                  )
                }
                aria-label="Previous Spotlight Club"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  setSpotlightIndex((prev) => (prev + 1) % featuredClubs.length)
                }
                aria-label="Next Spotlight Club"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Club Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {featuredClubs.map((fc, idx) => {
              const active = fc.id === activeSpotlightClub.id;
              return (
                <button
                  key={fc.id}
                  type="button"
                  data-testid={`spotlight-pill-${fc.id}`}
                  onClick={() => setSpotlightIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 border ${
                    active
                      ? 'bg-slate-800 border-emerald-500/60 text-white font-bold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: fc.primaryColor }}
                  />
                  <span>{fc.shortName}</span>
                </button>
              );
            })}
          </div>

          {/* Club Crest, Identity & League Badge */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90">
            <div className="flex items-center gap-3.5 min-w-0">
              <ClubBadge club={activeSpotlightClub} size="lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-display font-extrabold text-white truncate">
                    {activeSpotlightClub.name}
                  </h2>
                </div>
                <div className="text-xs text-amber-400 font-mono tracking-wider">
                  {getReputationStars(activeSpotlightClub.reputation)}{' '}
                  <span className="text-slate-400">
                    (Rep {activeSpotlightClub.reputation})
                  </span>
                </div>
                <div className="text-xs text-slate-400 truncate mt-0.5">
                  🏟️ {activeSpotlightClub.stadiumName} (
                  {activeSpotlightClub.stadiumCapacity.toLocaleString()})
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <CompetitionBadge competitionId={activeSpotlightClub.leagueId} size="sm" />
              <span className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1.5">
                <NationalityFlag code={activeSpotlightClub.countryId} size="xs" />
                <span>{LEAGUES_CONFIG[activeSpotlightClub.leagueId]?.name}</span>
              </span>
            </div>
          </div>

          {/* League & Target Trophy Strip */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 items-center text-center">
            <div className="flex flex-col items-center gap-1">
              <CompetitionBadge competitionId={activeSpotlightClub.leagueId} size="md" />
              <span className="text-[10px] font-mono text-slate-400">LEAGUE</span>
            </div>
            <div className="flex flex-col items-center gap-1 border-l border-slate-800 pl-3">
              <TrophyArtwork competitionId={activeSpotlightClub.leagueId} size="md" />
              <span className="text-[10px] font-mono text-amber-300">TARGET</span>
            </div>
          </div>

          {/* Key Club Metrics Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-center font-mono">
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">
                {tr('Transfer Budget', 'งบเสริมทัพ')}
              </div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                €{(activeSpotlightClub.finances.transferBudget / 1_000_000).toFixed(1)}M
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">
                {tr('Primary Tactic', 'แผนหลัก')}
              </div>
              <div className="text-sm font-bold text-sky-400 mt-0.5">
                {activeSpotlightClub.primaryTactic.formation}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase">
                {tr('Board Target', 'เป้าหมายบอร์ด')}
              </div>
              <div className="text-sm font-bold text-amber-300 mt-0.5">
                Top {activeSpotlightClub.boardExpectations.targetLeaguePosition}
              </div>
            </div>
          </div>

          {/* Direct Action Buttons on Spotlight Deck */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-testid="spotlight-manage-btn"
              onClick={() => handleQuickStartFeaturedClub(activeSpotlightClub)}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50"
            >
              {!authUser ? (
                <Lock className="w-4 h-4 text-slate-950" />
              ) : (
                <Play className="w-4 h-4 fill-slate-950" />
              )}
              <span>
                {tr(
                  `Manage ${activeSpotlightClub.shortName} Now`,
                  `เริ่มคุมทีม ${activeSpotlightClub.shortName} ทันที`
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!authUser) {
                  setPendingPostLoginAction('CUSTOMIZE_SPOTLIGHT');
                  setLoginRequiredModalOpen(true);
                  return;
                }
                setSelectedLeagueId(activeSpotlightClub.leagueId);
                setSelectedClubId(activeSpotlightClub.id);
                setWizardStep(2);
                setSetupModalOpen(true);
              }}
              className="py-3 px-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer transition-colors"
            >
              {!authUser ? '🔒 ' : ''}
              {tr('Customize Contract', 'ปรับสัญญาคุมทีม')}
            </button>
          </div>
        </div>
      </main>

      {/* BOTTOM TICKER BAR */}
      <footer className="relative z-10 px-6 md:px-10 py-2.5 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <span className="text-emerald-400 font-semibold">
            ● {tr('LIVE MATCH ENGINE 2.0', 'เอนจินจำลองแมตช์สด 2.0')}
          </span>
          <span>·</span>
          <span>
            {tr(
              'UEFA Champions League / Europa / Conference Swiss Model',
              'ยูฟ่า แชมเปียนส์ลีก / ยูโรปา / คอนเฟอเรนซ์ ระบบ Swiss Model'
            )}
          </span>
        </div>
        <div>
          {tr(
            'Tip: Press [Ctrl+K] anytime in-game to search 8,500+ players & 394 clubs',
            'เคล็ดลับ: กด [Ctrl+K] ในเกมได้ตลอดเวลาเพื่อค้นหานักเตะกว่า 8,500 คนและ 394 สโมสร'
          )}
        </div>
      </footer>

      {/* ===================================================================== */}
      {/* 2-STEP SMOOTH WIZARD MODAL: NEW CAREER SETUP (280 CLUBS + CONTRACT)   */}
      {/* ===================================================================== */}
      {setupModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="career-setup-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header with 2-Step Progress Switcher */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-display font-extrabold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  <span>
                    {tr(
                      'NEW MANAGERIAL CAREER SETUP',
                      'ตั้งค่าเริ่มต้นอาชีพผู้จัดการทีมใหม่'
                    )}
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  {tr(
                    'Select your club & challenge in Step 1, then sign your official managerial contract in Step 2',
                    'ขั้นตอนที่ 1: เลือกสโมสรและภารกิจท้าทาย · ขั้นตอนที่ 2: กำหนดโปรไฟล์ผู้จัดการทีมและเซ็นสัญญา'
                  )}
                </p>
              </div>

              {/* Step Pills */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="wizard-step-1-tab"
                  onClick={() => setWizardStep(1)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold cursor-pointer transition-colors ${
                    wizardStep === 1
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  1. {tr('Choose Club & Challenge', 'เลือกสโมสรและภารกิจ')}
                </button>
                <button
                  type="button"
                  data-testid="wizard-step-2-tab"
                  onClick={() => setWizardStep(2)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold cursor-pointer transition-colors ${
                    wizardStep === 2
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  2. {tr('Manager Identity & Contract', 'โปรไฟล์ & เซ็นสัญญา')}
                </button>
                <button
                  type="button"
                  onClick={() => setSetupModalOpen(false)}
                  className="ml-2 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {wizardStep === 1 ? (
                <div className="space-y-5">
                  {/* Top Row: Country/League Selector + Scenario Challenge + Create-a-Club Toggle */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* League Selector */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <label className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5">
                        <NationalityFlag code={LEAGUES_CONFIG[selectedLeagueId]?.countryId || 'ENG'} size="xs" />
                        <span>{tr('1. Global Leagues (23 Divisions)', '1. เลือกลีกการแข่งขัน (23 ลีกทั่วโลก)')}</span>
                      </label>
                      <select
                        data-testid="setup-league-select"
                        value={selectedLeagueId}
                        onChange={(e) => {
                          const nextLeague = e.target.value as LeagueId;
                          setSelectedLeagueId(nextLeague);
                          const firstClub = Object.values(previewClubsMap).find(
                            (c) => c.leagueId === nextLeague
                          );
                          if (firstClub) setSelectedClubId(firstClub.id);
                        }}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold"
                      >
                        {COUNTRY_GROUPS.map((group) => (
                          <optgroup
                            key={group.countryId}
                            label={`${group.flag} ${group.name}`}
                          >
                            {leagueList
                              .filter((l) => l.countryId === group.countryId)
                              .map((league) => (
                                <option key={league.id} value={league.id}>
                                  {league.name} (Tier {league.tier || 1})
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* Scenario Challenge Selector */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                      <label className="text-[11px] font-mono uppercase text-amber-400 block">
                        {tr('2. Career Scenario Challenge', '2. โหมดภารกิจท้าทาย (Scenario)')}
                      </label>
                      <select
                        data-testid="scenario-challenge-selector"
                        value={selectedScenario}
                        onChange={(e) =>
                          setSelectedScenario(e.target.value as ScenarioChallengeId)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold"
                      >
                        {SCENARIO_CHALLENGES.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.badge} {sc.titleEn}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400">
                        {
                          SCENARIO_CHALLENGES.find((s) => s.id === selectedScenario)
                            ?.descEn
                        }
                      </p>
                    </div>

                    {/* Create-a-Club Toggle */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono uppercase text-emerald-400">
                          {tr('3. Custom Club Builder', '3. โหมดสร้างสโมสรใหม่')}
                        </span>
                        <input
                          type="checkbox"
                          data-testid="create-a-club-toggle"
                          checked={createAClubEnabled}
                          onChange={(e) => setCreateAClubEnabled(e.target.checked)}
                          className="w-4 h-4 accent-emerald-500 cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-slate-300 font-medium mt-1">
                        {tr(
                          'Replace selected club slot with your own custom club crest, colors & stadium',
                          'แทนที่สโมสรที่เลือกด้วยชื่อสโมสร สีชุดแข่ง และสนามของคุณเอง'
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Optional Create-a-Club Form */}
                  {createAClubEnabled && (
                    <div
                      data-testid="create-a-club-panel"
                      className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/40 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3"
                    >
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Custom Club Name', 'ชื่อสโมสรใหม่')}
                        </label>
                        <input
                          type="text"
                          data-testid="custom-club-name-input"
                          value={customClubName}
                          onChange={(e) => setCustomClubName(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('3-Letter Code', 'ชื่อย่อ 3 ตัว')}
                        </label>
                        <input
                          type="text"
                          maxLength={3}
                          value={customShortName}
                          onChange={(e) => setCustomShortName(e.target.value.toUpperCase())}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Stadium Name', 'ชื่อสนาม')}
                        </label>
                        <input
                          type="text"
                          value={customStadiumName}
                          onChange={(e) => setCustomStadiumName(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                            {tr('Colors', 'สีหลัก/รอง')}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={customPrimaryColor}
                              onChange={(e) => setCustomPrimaryColor(e.target.value)}
                              className="w-8 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                            />
                            <input
                              type="color"
                              value={customSecondaryColor}
                              onChange={(e) => setCustomSecondaryColor(e.target.value)}
                              className="w-8 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rich Club Selection Grid */}
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-mono uppercase text-slate-400">
                        {tr(
                          `Clubs in ${LEAGUES_CONFIG[selectedLeagueId]?.name} (${clubsInSelectedLeague.length} Clubs)`,
                          `รายชื่อสโมสรใน ${LEAGUES_CONFIG[selectedLeagueId]?.name} (${clubsInSelectedLeague.length} ทีม)`
                        )}
                      </span>
                      <span className="text-xs font-mono text-emerald-400">
                        {tr('Selected:', 'สโมสรที่เลือก:')} {selectedClub?.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                      {clubsInSelectedLeague.map((club) => {
                        const isSelected = club.id === selectedClubId;
                        return (
                          <button
                            key={club.id}
                            type="button"
                            data-testid={`select-club-card-${club.id}`}
                            onClick={() => setSelectedClubId(club.id)}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                              isSelected
                                ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-md'
                                : 'bg-slate-950/90 hover:bg-slate-800/80 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <ClubBadge club={club} size="sm" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">
                                  {club.name}
                                </div>
                                <div className="text-[10px] font-mono text-amber-400">
                                  {getReputationStars(club.reputation)}
                                </div>
                                <div className="text-[10px] font-mono text-emerald-400">
                                  €{(club.finances.transferBudget / 1_000_000).toFixed(1)}M ·{' '}
                                  {club.primaryTactic.formation}
                                </div>
                              </div>
                            </div>
                            <span
                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono font-bold text-slate-300 shrink-0"
                              style={{ borderLeft: `3px solid ${club.primaryColor}` }}
                            >
                              {club.shortName}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* STEP 2: MANAGER IDENTITY & OFFICIAL APPOINTMENT CONTRACT */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left 6 Cols: Manager Identity Form */}
                  <div className="lg:col-span-6 p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                    <div className="text-xs font-mono uppercase text-emerald-400 font-bold flex items-center gap-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{tr('MANAGER IDENTITY & COACHING PROFILE', 'ข้อมูลประจำตัวผู้จัดการทีม')}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Manager Full Name', 'ชื่อ-นามสกุล ผู้จัดการทีม')}
                        </label>
                        <input
                          type="text"
                          data-testid="manager-name-input"
                          value={managerName}
                          onChange={(e) => setManagerName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400 flex items-center gap-1.5 mb-1">
                          <span>{tr('Nationality', 'สัญชาติ')}</span>
                          <NationalityFlag code={nationality} size="xs" />
                        </label>
                        <input
                          type="text"
                          value={nationality}
                          onChange={(e) => setNationality(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Age', 'อายุ')}
                        </label>
                        <input
                          type="number"
                          min={25}
                          max={75}
                          value={age}
                          onChange={(e) => setAge(Number(e.target.value) || 38)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Coaching Badge Style', 'สไตล์การคุมทีม')}
                        </label>
                        <select
                          value={coachingStyle}
                          onChange={(e) =>
                            setCoachingStyle(
                              e.target.value as ManagerProfile['coachingStyle']
                            )
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        >
                          <option value="Tactician">Tactician (+Tactical Familiarity)</option>
                          <option value="Motivator">Motivator (+Squad Morale Boost)</option>
                          <option value="Youth Developer">
                            Youth Developer (+U21 Growth)
                          </option>
                          <option value="Tracksuit Coach">Tracksuit Coach (+Training)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-mono uppercase text-slate-400 block mb-1">
                          {tr('Tactical Style', 'ปรัชญาฟุตบอลหลัก')}
                        </label>
                        <select
                          value={tacticalStyle}
                          onChange={(e) =>
                            setTacticalStyle(e.target.value as AIManagerStyle)
                          }
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                        >
                          <option value="Attacking Manager">Attacking Football</option>
                          <option value="Possession-focused Manager">
                            Control Possession (Tiki-Taka)
                          </option>
                          <option value="Counter-attacking Manager">
                            Direct Counter-Attack
                          </option>
                          <option value="Youth Developer">Youth & High Press</option>
                          <option value="Defensive Manager">Pragmatic Low Block</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Right 6 Cols: Official Managerial Appointment Contract Card */}
                  <div
                    data-testid="official-contract-card"
                    className="lg:col-span-6 p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-amber-500/40 shadow-xl space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-3">
                        <ClubBadge club={selectedClub} size="md" />
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                            {tr(
                              'OFFICIAL MANAGERIAL CONTRACT OFFER',
                              'หนังสือสัญญาแต่งตั้งผู้จัดการทีมอย่างเป็นทางการ'
                            )}
                          </div>
                          <h3 className="text-base font-display font-extrabold text-white">
                            {createAClubEnabled ? customClubName : selectedClub.name}
                          </h3>
                        </div>
                      </div>
                      <CompetitionBadge competitionId={selectedClub.leagueId} size="sm" />
                    </div>

                    <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                      <p>
                        {tr(
                          `The Board of Directors of ${createAClubEnabled ? customClubName : selectedClub.name} hereby appoints `,
                          `คณะกรรมการบริหารของสโมสร ${createAClubEnabled ? customClubName : selectedClub.name} ขอแต่งตั้งให้ `
                        )}
                        <strong className="text-emerald-400 font-bold">
                          {managerName || 'Alex Mercer'}
                        </strong>{' '}
                        {tr(
                          `as First-Team Manager for the 2025/26 campaign.`,
                          `ดำรงตำแหน่งผู้จัดการทีมชุดใหญ่อย่างเป็นทางการสำหรับฤดูกาล 2025/26`
                        )}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          {tr('TRANSFER WARCHEST', 'งบประมาณเสริมทัพ')}
                        </div>
                        <div className="text-sm font-bold text-emerald-400">
                          €{(selectedClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          {tr('WAGE BUDGET / WK', 'เพดานค่าเหนื่อย/สัปดาห์')}
                        </div>
                        <div className="text-sm font-bold text-sky-400">
                          €{selectedClub.finances.wageBudgetPerWeek.toLocaleString()}/wk
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          {tr('BOARD TARGET', 'เป้าหมายบอร์ดบริหาร')}
                        </div>
                        <div className="text-sm font-bold text-amber-300">
                          Top {selectedClub.boardExpectations.targetLeaguePosition} Finish
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                        <div className="text-[10px] text-slate-400">
                          {tr('SCENARIO MODE', 'โหมดความท้าทาย')}
                        </div>
                        <div className="text-sm font-bold text-purple-300 truncate">
                          {selectedScenario}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>
                        ✍️ {tr('Manager Signature:', 'ลงชื่อผู้จัดการทีม:')}{' '}
                        <em className="text-emerald-300">{managerName || 'Alex Mercer'}</em>
                      </span>
                      <span>📅 2025-08-10</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ClubBadge club={selectedClub} size="sm" />
                <div className="text-xs">
                  <span className="text-slate-400">{tr('Club:', 'สโมสร:')} </span>
                  <strong className="text-white">
                    {createAClubEnabled ? customClubName : selectedClub?.name}
                  </strong>
                  <span className="text-slate-500 mx-2">·</span>
                  <span className="text-emerald-400 font-mono">
                    €{((selectedClub?.finances.transferBudget || 0) / 1_000_000).toFixed(1)}M
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {wizardStep === 2 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    ← {tr('Back to Clubs', 'กลับไปเลือกสโมสร')}
                  </button>
                )}
                {wizardStep === 1 && (
                  <button
                    type="button"
                    data-testid="wizard-next-step-btn"
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-semibold cursor-pointer"
                  >
                    {tr('Next: Manager & Contract →', 'ถัดไป: โปรไฟล์ & สัญญา →')}
                  </button>
                )}
                <button
                  type="button"
                  data-testid="confirm-start-career-btn"
                  onClick={handleLaunchCustomCareer}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-emerald-950/50"
                >
                  {tr('✍️ Sign Contract & Manage', '✍️ เซ็นสัญญาและเริ่มคุมทีม')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CLOUD SAVE MANAGER MODAL                                              */}
      {/* ===================================================================== */}
      {loadModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="cloud-save-manager-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    {tr('CLOUD SAVE MANAGER (FIRESTORE)', 'จัดการเซฟเกมบน CLOUD FIRESTORE')}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {authUser
                      ? tr(
                          `Signed in as ${authUser.email || authUser.displayName} · 100% Cloud Persistence`,
                          `เชื่อมต่อบัญชี ${authUser.email || authUser.displayName} · เซฟบน Cloud 100%`
                        )
                      : tr(
                          'Sign in with Google to persist your career across sessions & devices',
                          'เข้าสู่ระบบด้วย Google เพื่อบันทึกและซิงก์เซฟเกมบน Cloud ถาวร'
                        )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoadModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {!authUser && onGoogleSignIn && (
                <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-500/40 flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-200">
                    <div className="font-bold text-sky-300 mb-0.5">
                      {tr(
                        '100% Cloud Save Architecture Active',
                        'ระบบเซฟเกมทำงานบน Cloud Firestore 100%'
                      )}
                    </div>
                    <p className="text-slate-400">
                      {tr(
                        'Sign in with your Google/Gmail account to load and auto-sync your saves.',
                        'เข้าสู่ระบบด้วยบัญชี Google/Gmail เพื่อโหลดและบันทึกเซฟเกมอัตโนมัติบน Cloud'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                  >
                    {tr('Sign in with Google', 'เข้าสู่ระบบ Google')}
                  </button>
                </div>
              )}

              {saveSlots.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-2">
                  <Trophy className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-sm font-semibold text-slate-200">
                    {tr('No Cloud Career Saves Found', 'ยังไม่มีข้อมูลเซฟเกมบน Cloud')}
                  </div>
                  <p>
                    {tr(
                      'Start a new career and sign in with Google to save your progress to Cloud Firestore.',
                      'เริ่มต้นอาชีพผู้จัดการทีมใหม่และเข้าสู่ระบบ Google เพื่อบันทึกเซฟขึ้น Cloud Firestore'
                    )}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {saveSlots.map((slot) => (
                    <div
                      key={slot.slotId}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono text-[10px] uppercase font-bold">
                            {slot.slotId === 'slot_autosave' ? '☁️ AUTO-SAVE' : slot.slotId}
                          </span>
                          <span className="text-sm font-bold text-white">
                            {slot.clubName}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-1">
                          👔 {slot.managerName} · 📅 {slot.gameDate} · 🏆 {slot.season}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={`load-slot-btn-${slot.slotId}`}
                          onClick={() => {
                            onLoadSlot(slot.slotId);
                            setLoadModalOpen(false);
                          }}
                          className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          {tr('Load Career', 'โหลดเซฟ')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSlot(slot.slotId)}
                          className="p-2 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                          title={tr('Delete Save', 'ลบเซฟ')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STAGE 10 PHASE 2: MANDATORY GOOGLE LOGIN REQUIRED GATE MODAL          */}
      {/* ===================================================================== */}
      {loginRequiredModalOpen && !authUser && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
          data-testid="login-required-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border-2 border-amber-400/60 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300 mx-auto">
                <Lock className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 font-mono text-[11px] font-bold">
                  🔒 {tr('100% CLOUD FIRESTORE SAVE SECURITY', 'ระบบป้องกันข้อมูลเซฟสูญหายบน CLOUD')}
                </div>
                <h2 className="text-xl font-display font-extrabold text-white">
                  {tr(
                    'Sign In Required to Start Career',
                    'กรุณาเข้าสู่ระบบด้วย Google ก่อนเริ่มเกม'
                  )}
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {tr(
                    'TOUCHLINE stores your managerial career 100% on Cloud Firestore. Please sign in with your Google / Gmail account so your progress, trophies, and transfers are automatically synced and never lost.',
                    'เกมนี้บันทึกข้อมูลอาชีพผู้จัดการทีมของคุณไว้บน Cloud Firestore 100% กรุณาเข้าสู่ระบบด้วยบัญชี Google / Gmail เพื่อให้เซฟเกม ถ้วยแชมป์ และการซื้อขายนักเตะของคุณซิงก์อัตโนมัติและไม่สูญหาย'
                  )}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-left space-y-1.5 text-xs text-slate-300">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <Cloud className="w-4 h-4 shrink-0" />
                  <span>
                    {tr(
                      'Instant Auto-Resume After Sign-In',
                      'เข้าสู่ขั้นตอนที่คุณเลือกต่อให้อัตโนมัติทันทีหลังล็อกอิน'
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {pendingPostLoginAction === 'NEW_CAREER'
                    ? tr(
                        'Selected Action: Open 2-Step New Career Setup Wizard (394 Clubs · 23 Leagues)',
                        'คำสั่งที่เลือกไว้: เปิดหน้าตั้งค่าผู้จัดการทีมใหม่ (394 สโมสร · 23 ลีก)'
                      )
                    : pendingPostLoginAction === 'QUICK_START'
                      ? tr(
                          `Selected Action: Quick Start Dugout with ${activeSpotlightClub.name}`,
                          `คำสั่งที่เลือกไว้: เริ่มคุมทีมด่วนกับ ${activeSpotlightClub.name}`
                        )
                      : tr(
                          'Selected Action: Open Cloud Save Manager',
                          'คำสั่งที่เลือกไว้: เปิดหน้าจัดการเซฟเกมบน Cloud'
                        )}
                </p>
              </div>

              <div className="space-y-2 pt-1">
                {onGoogleSignIn && (
                  <button
                    type="button"
                    data-testid="login-required-modal-signin-btn"
                    onClick={onGoogleSignIn}
                    className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/60 cursor-pointer transition-all"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>
                      {tr(
                        'Sign in with Google / Gmail & Continue →',
                        'เข้าสู่ระบบด้วย Google / Gmail แล้วไปต่อทันที →'
                      )}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  data-testid="close-login-required-modal-btn"
                  onClick={() => {
                    setLoginRequiredModalOpen(false);
                    setPendingPostLoginAction(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer transition-colors"
                >
                  {tr('Back to Title Screen', 'กลับสู่หน้าจอหลัก')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
