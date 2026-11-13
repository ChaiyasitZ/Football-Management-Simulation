import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  FolderOpen,
  Globe2,
  Play,
  Search,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AIManagerStyle,
  Club,
  CustomClubConfig,
  LeagueId,
  ManagerProfile,
  ScenarioChallengeId,
  WorldState,
} from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { SaveSlotMeta } from '../engine/worldSimulationService';
import { soundService } from '../engine/soundService';
import type { User } from '../firebase';
import { ClubBadge } from './ClubBadge';
import { ClubKitJersey, CompetitionBadge, TrophyArtwork } from './TrophyAndKitVisuals';
import { LanguageSwitcher, useLanguage } from '../i18n/LanguageContext';

interface TitleScreenProps {
  world: WorldState;
  saveSlots: SaveSlotMeta[];
  authUser: User | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
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

interface FloatingBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  vRot: number;
  depthLayer: 0 | 1 | 2; // 0 = far background, 1 = mid-ground, 2 = foreground hero
  accentColor: string;
  pulsePhase: number;
}

/**
 * Draws a 3D-shaded floating soccer ball / football with rotating pentagon/hexagon panels
 * and subtle stadium rim lighting on an HTML5 2D canvas.
 */
function drawFloatingFootball(
  ctx: CanvasRenderingContext2D,
  ball: FloatingBall,
  timeSec: number
) {
  const { x, y, radius: r, rotation, depthLayer, accentColor, pulsePhase } = ball;
  const alpha = depthLayer === 2 ? 0.92 : depthLayer === 1 ? 0.62 : 0.32;

  ctx.save();
  ctx.translate(x, y);

  // 1. Soft outer glow / ambient shadow
  const glowRadius = r * (depthLayer === 2 ? 2.1 : 1.7);
  const glowGrad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, glowRadius);
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 1.6 + pulsePhase);
  glowGrad.addColorStop(
    0,
    accentColor === 'emerald'
      ? `rgba(16, 185, 129, ${(0.16 + pulse * 0.08) * alpha})`
      : `rgba(56, 189, 248, ${(0.15 + pulse * 0.07) * alpha})`
  );
  glowGrad.addColorStop(1, 'rgba(7, 11, 18, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2. Clip to sphere circle
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  // 3. 3D Spherical Base Gradient (Top-left stadium light source)
  const sphereGrad = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.08, 0, 0, r * 1.05);
  sphereGrad.addColorStop(0, `rgba(248, 250, 252, ${0.96 * alpha})`);
  sphereGrad.addColorStop(0.45, `rgba(203, 213, 225, ${0.88 * alpha})`);
  sphereGrad.addColorStop(0.78, `rgba(71, 85, 105, ${0.85 * alpha})`);
  sphereGrad.addColorStop(1, `rgba(15, 23, 42, ${0.95 * alpha})`);
  ctx.fillStyle = sphereGrad;
  ctx.fillRect(-r, -r, r * 2, r * 2);

  // 4. Rotate for pentagon/hexagon panel pattern
  ctx.rotate(rotation);

  const drawPolygon = (cx: number, cy: number, polyR: number, sides: number, rotOffset = 0) => {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const ang = rotOffset + (i * Math.PI * 2) / sides;
      const px = cx + Math.cos(ang) * polyR;
      const py = cy + Math.sin(ang) * polyR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  const panelColor = `rgba(15, 23, 42, ${0.88 * alpha})`;
  const seamColor =
    accentColor === 'emerald'
      ? `rgba(16, 185, 129, ${0.65 * alpha})`
      : `rgba(56, 189, 248, ${0.65 * alpha})`;

  // Center Pentagon
  const centerPentR = r * 0.3;
  drawPolygon(0, 0, centerPentR, 5, -Math.PI / 2);
  ctx.fillStyle = panelColor;
  ctx.fill();
  ctx.strokeStyle = seamColor;
  ctx.lineWidth = Math.max(1, r * 0.045);
  ctx.stroke();

  // 5 Outer Pentagons + Connecting Hexagon Seams
  const ringDist = r * 0.72;
  const outerPentR = r * 0.25;

  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const vx = Math.cos(angle) * centerPentR;
    const vy = Math.sin(angle) * centerPentR;
    const ox = Math.cos(angle) * (ringDist - outerPentR * 0.78);
    const oy = Math.sin(angle) * (ringDist - outerPentR * 0.78);

    // Seam spoke from center pentagon vertex to outer pentagon
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(ox, oy);
    ctx.strokeStyle = `rgba(30, 41, 59, ${0.75 * alpha})`;
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();

    // Outer pentagon patch
    const px = Math.cos(angle) * ringDist;
    const py = Math.sin(angle) * ringDist;
    drawPolygon(px, py, outerPentR, 5, angle + Math.PI);
    ctx.fillStyle = panelColor;
    ctx.fill();
    ctx.strokeStyle = seamColor;
    ctx.lineWidth = Math.max(0.9, r * 0.035);
    ctx.stroke();
  }

  // Secondary Hexagon Ring Bridges
  for (let i = 0; i < 5; i++) {
    const a1 = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a2 = -Math.PI / 2 + (((i + 1) % 5) * Math.PI * 2) / 5;
    const p1x = Math.cos(a1) * (ringDist - outerPentR * 0.6);
    const p1y = Math.sin(a1) * (ringDist - outerPentR * 0.6);
    const p2x = Math.cos(a2) * (ringDist - outerPentR * 0.6);
    const p2y = Math.sin(a2) * (ringDist - outerPentR * 0.6);

    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.strokeStyle = `rgba(51, 65, 85, ${0.55 * alpha})`;
    ctx.lineWidth = Math.max(0.8, r * 0.03);
    ctx.stroke();
  }

  ctx.restore(); // Unclip

  // 5. Outer Rim Highlight (Emerald / Sky Fresnel Edge)
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.strokeStyle =
    accentColor === 'emerald'
      ? `rgba(52, 211, 153, ${0.55 * alpha})`
      : `rgba(56, 189, 248, ${0.5 * alpha})`;
  ctx.lineWidth = depthLayer === 2 ? 1.8 : 1.2;
  ctx.stroke();

  ctx.restore();
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  world,
  saveSlots,
  authUser,
  onGoogleSignIn,
  onGoogleSignOut,
  onQuickStart,
  onStartCustomCareer,
  onLoadSlot,
  onDeleteSlot,
}) => {
  const { lang, setLang, tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isMuted, setIsMuted] = useState(soundService.isMuted());

  // Setup state
  const [managerName, setManagerName] = useState('Mikel Arteta');
  const [customEditedName, setCustomEditedName] = useState(false);
  const [managerAge, setManagerAge] = useState(42);
  const [managerNat, setManagerNat] = useState('Spain');
  const [coachingStyle, setCoachingStyle] = useState<ManagerProfile['coachingStyle']>('Tactician');
  const [tacticalStyle, setTacticalStyle] = useState<AIManagerStyle>('Possession-focused Manager');
  const [selectedLeague, setSelectedLeague] = useState<LeagueId>('ENG_PL');
  const [selectedClubId, setSelectedClubId] = useState<string>('club_eng_pl_1');
  const [clubSearchQuery, setClubSearchQuery] = useState<string>('');

  // Checkpoint 17: Scenario Challenge Mode & Create-a-Club state
  const [scenarioChallenge, setScenarioChallenge] = useState<ScenarioChallengeId>('STANDARD');
  const [createClubEnabled, setCreateClubEnabled] = useState<boolean>(false);
  const [customClubName, setCustomClubName] = useState<string>('Touchline FC');
  const [customShortName, setCustomShortName] = useState<string>('TFC');
  const [customPrimaryColor, setCustomPrimaryColor] = useState<string>('#10b981');
  const [customSecondaryColor, setCustomSecondaryColor] = useState<string>('#0f172a');
  const [customStadiumName, setCustomStadiumName] = useState<string>('Touchline Arena');

  const allLeagueConfigs = Object.values(LEAGUES_CONFIG);
  const currentLeagueConfig = LEAGUES_CONFIG[selectedLeague];
  const selectedCountryId = currentLeagueConfig.countryId;

  const countriesList = Array.from(
    new Map(
      allLeagueConfigs.map((cfg) => [
        cfg.countryId,
        {
          countryId: cfg.countryId,
          countryName: cfg.countryName,
          countryFlag: cfg.countryFlag,
          leagues: allLeagueConfigs.filter((l) => l.countryId === cfg.countryId),
        },
      ])
    ).values()
  );

  const countryLeagues = allLeagueConfigs.filter((l) => l.countryId === selectedCountryId);

  const handleSelectLeague = (lId: LeagueId) => {
    setSelectedLeague(lId);
    setClubSearchQuery('');
    const firstInLeague = Object.values(world.clubs).find((c) => c.leagueId === lId);
    if (firstInLeague) {
      setSelectedClubId(firstInLeague.id);
      if (!customEditedName) setManagerName(firstInLeague.aiManager.name);
    }
  };

  const handleSelectCountry = (countryId: string) => {
    const firstLeagueOfCountry = allLeagueConfigs.find((l) => l.countryId === countryId);
    if (firstLeagueOfCountry) {
      handleSelectLeague(firstLeagueOfCountry.id);
    }
  };

  const leagueClubs: Club[] = Object.values(world.clubs).filter(
    (c) =>
      c.leagueId === selectedLeague &&
      (clubSearchQuery.trim() === '' ||
        c.name.toLowerCase().includes(clubSearchQuery.trim().toLowerCase()) ||
        c.shortName.toLowerCase().includes(clubSearchQuery.trim().toLowerCase()) ||
        c.city.toLowerCase().includes(clubSearchQuery.trim().toLowerCase()))
  );
  const allClubsInSelectedLeague: Club[] = Object.values(world.clubs).filter(
    (c) => c.leagueId === selectedLeague
  );
  const activeClub = world.clubs[selectedClubId] || allClubsInSelectedLeague[0];
  const defaultQuickClub = world.clubs[world.controlledClubId] || activeClub;

  // Animated Floating Footballs + Tactical Stadium Backdrop Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Create 16 floating footballs across 3 depth layers
    const balls: FloatingBall[] = Array.from({ length: 16 }, (_, i) => {
      const depthLayer: 0 | 1 | 2 = i >= 12 ? 2 : i >= 5 ? 1 : 0;
      const radius =
        depthLayer === 2
          ? 34 + (i % 3) * 11 // 34..56px hero foreground footballs
          : depthLayer === 1
            ? 19 + (i % 4) * 4 // 19..31px mid-ground footballs
            : 11 + (i % 3) * 3; // 11..17px background footballs
      const speedScale = depthLayer === 2 ? 22 : depthLayer === 1 ? 15 : 9;
      const angle = ((i * 137.5) % 360) * (Math.PI / 180);

      // Bias majority of large balls toward the right & center-right open space
      const startX =
        depthLayer === 2
          ? width * (0.48 + ((i * 19) % 45) * 0.01)
          : width * (0.12 + ((i * 29) % 82) * 0.01);
      const startY = height * (0.12 + ((i * 41) % 76) * 0.01);

      return {
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speedScale,
        vy: Math.sin(angle) * speedScale - 4, // Gentle upward float bias
        radius,
        rotation: (i * 0.7) % (Math.PI * 2),
        vRot: (i % 2 === 0 ? 1 : -1) * (0.25 + (i % 4) * 0.12),
        depthLayer,
        accentColor: i % 3 === 0 ? 'sky' : 'emerald',
        pulsePhase: i * 0.9,
      };
    });

    let lastTime = performance.now();
    const render = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(rawDt, 0.05);
      const timeSec = now / 1000;
      lastTime = now;

      // Deep stadium night base
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, width, height);

      // Subtle stadium floodlight atmospheric glow on top-right
      const spotGrad = ctx.createRadialGradient(
        width * 0.75,
        height * 0.22,
        20,
        width * 0.72,
        height * 0.45,
        Math.max(width, height) * 0.65
      );
      spotGrad.addColorStop(0, 'rgba(16, 185, 129, 0.11)');
      spotGrad.addColorStop(0.45, 'rgba(14, 165, 233, 0.05)');
      spotGrad.addColorStop(1, 'rgba(6, 10, 18, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle perspective pitch geometry in background
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.07)';
      ctx.lineWidth = 1.2;
      const padX = width * 0.06;
      const padY = height * 0.08;
      const pw = width - padX * 2;
      const ph = height - padY * 2;
      ctx.strokeRect(padX, padY, pw, ph);
      ctx.beginPath();
      ctx.moveTo(width * 0.56, padY);
      ctx.lineTo(width * 0.56, padY + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width * 0.56, height * 0.5, Math.min(pw, ph) * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Update positions and draw connecting trajectory lines between mid-ground balls
      for (const b of balls) {
        b.x += b.vx * dt;
        b.y += b.vy * dt + Math.sin(timeSec * 1.2 + b.pulsePhase) * 6 * dt;
        b.rotation += b.vRot * dt;

        const margin = b.radius + 30;
        if (b.x < -margin) b.x = width + margin;
        if (b.x > width + margin) b.x = -margin;
        if (b.y < -margin) b.y = height + margin;
        if (b.y > height + margin) b.y = -margin;
      }

      // Subtle constellation pass lines between nearby footballs
      ctx.save();
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          if (balls[i].depthLayer === 0 && balls[j].depthLayer === 0) continue;
          const dx = balls[i].x - balls[j].x;
          const dy = balls[i].y - balls[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 250) {
            ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - dist / 250) * 0.14})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(balls[i].x, balls[i].y);
            ctx.lineTo(balls[j].x, balls[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.restore();

      // Render balls back-to-front by depthLayer
      for (const layer of [0, 1, 2] as const) {
        for (const b of balls) {
          if (b.depthLayer === layer) {
            drawFloatingFootball(ctx, b, timeSec);
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Keyboard Enter / Space to quick start when no modal is open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showSetupModal || showLoadModal || showSettingsModal) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onQuickStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSetupModal, showLoadModal, showSettingsModal, onQuickStart]);

  const latestSave = saveSlots[0] || null;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none flex flex-col justify-between p-8 lg:p-12"
      data-testid="title-screen"
    >
      {/* Floating Footballs Animated Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      {/* Left readability gradient while keeping right-hand floating footballs vivid */}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent pointer-events-none" />

      {/* TOP BAR: Broadcast Status Pill + Cloud Save + Settings Button */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/85 border border-slate-800 backdrop-blur-md text-xs font-mono text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-white">TOUCHLINE 26</span>
          <span className="text-slate-600">·</span>
          <span className="text-emerald-400">{tr('15 LEAGUES', '15 ลีกยุโรป')}</span>
          <span className="text-slate-600">·</span>
          <span>{tr('280 CLUBS', '280 สโมสร')}</span>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Cloud Save Status / Sign-In */}
          {authUser ? (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 backdrop-blur-md text-xs">
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-300 hidden sm:inline">Cloud:</span>
              <span className="text-white font-medium truncate max-w-[180px]">
                {authUser.email || authUser.displayName}
              </span>
              <button
                type="button"
                onClick={onGoogleSignOut}
                className="text-slate-400 hover:text-white underline cursor-pointer ml-1"
              >
                {tr('Sign Out', 'ออกจากระบบ')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-2 backdrop-blur-md"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{tr('Cloud Save (Gmail)', 'ซิงก์เซฟเกมผ่าน Gmail')}</span>
            </button>
          )}

          {/* Settings Button (Houses Language, Audio & UI Info) */}
          <button
            type="button"
            data-testid="title-settings-btn"
            onClick={() => setShowSettingsModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 backdrop-blur-md"
          >
            <Settings className="w-3.5 h-3.5 text-emerald-400" />
            <span>{tr('Settings', 'ตั้งค่า')}</span>
          </button>
        </div>
      </header>

      {/* MAIN HERO SECTION: Left Command Lockup + Interactive Career Launcher */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
        <div className="lg:col-span-7 space-y-6">
          {/* Bespoke SVG Crest & Typography Lockup */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
              <Trophy className="w-3.5 h-3.5" />
              <span>
                {tr(
                  'FOOTBALL MANAGEMENT SIMULATION · SEASON 2025/26',
                  'เกมวางแผนบริหารสโมสรฟุตบอล · ฤดูกาล 2025/26'
                )}
              </span>
            </div>

            <svg
              viewBox="0 0 560 116"
              className="w-full max-w-[520px] h-auto drop-shadow-2xl"
              role="img"
              aria-label="TOUCHLINE — The World Is Your Pitch"
            >
              <defs>
                <linearGradient id="tlShieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              {/* Tactical Shield Crest */}
              <g transform="translate(4, 6)">
                <path
                  d="M46 4 L88 18 L88 56 C88 82 68 98 46 106 C24 98 4 82 4 56 L4 18 Z"
                  fill="url(#tlShieldGrad)"
                  stroke="#10b981"
                  strokeWidth="3"
                />
                <rect
                  x="26"
                  y="28"
                  width="40"
                  height="50"
                  rx="2"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="1.8"
                />
                <line x1="26" y1="53" x2="66" y2="53" stroke="#34d399" strokeWidth="1.8" />
                <circle cx="46" cy="53" r="8" fill="none" stroke="#34d399" strokeWidth="1.8" />
                <circle cx="46" cy="38" r="3.5" fill="#facc15" />
              </g>

              <text
                x="110"
                y="70"
                fill="#f8fafc"
                fontFamily="Barlow Condensed, Prompt, sans-serif"
                fontWeight="700"
                fontSize="68"
                letterSpacing="4"
              >
                TOUCHLINE
              </text>
              <text
                x="113"
                y="99"
                fill="#34d399"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="600"
                fontSize="13.5"
                letterSpacing="5.5"
              >
                THE WORLD IS YOUR PITCH
              </text>
            </svg>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl">
              {tr(
                'Take full control of the dugout. Build tactical identities, develop U18/U21 wonderkids, negotiate complex transfers, and compete across 15 European leagues and UEFA competitions.',
                'ก้าวสู่เก้าอี้กุนซือเต็มรูปแบบ วางแผนแท็กติกเชิงลึก ปั้นดาวรุ่ง U18/U21 สู่ทีมชุดใหญ่ เจรจาซื้อขายนักเตะ และพาทีมไล่ล่าแชมป์ครบ 15 ลีกยุโรปและถ้วยสโมสรยุโรป'
              )}
            </p>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-3.5 pt-1">
            <button
              type="button"
              data-testid="open-setup-modal-btn"
              onClick={() => setShowSetupModal(true)}
              className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-sm rounded-xl transition-all cursor-pointer flex items-center gap-2.5 shadow-lg shadow-emerald-950/60"
            >
              <Shield className="w-4 h-4" />
              <span>
                {tr(
                  'Select Club & Create Manager (280 Clubs)',
                  'เลือกสโมสร & สร้างผู้จัดการทีม (280 สโมสร)'
                )}
              </span>
            </button>

            <button
              type="button"
              data-testid="quick-start-btn"
              onClick={onQuickStart}
              className="px-5 py-3.5 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 font-semibold text-sm rounded-xl transition-all cursor-pointer flex items-center gap-2 backdrop-blur-md"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span>
                {tr(
                  `Quick Start (${defaultQuickClub?.shortName || 'ARS'})`,
                  `เริ่มเกมด่วน (${defaultQuickClub?.shortName || 'ARS'})`
                )}
              </span>
            </button>

            <button
              type="button"
              data-testid="open-load-modal-btn"
              onClick={() => setShowLoadModal(true)}
              className="px-5 py-3.5 bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 font-medium text-sm rounded-xl transition-all cursor-pointer flex items-center gap-2 tabular-nums backdrop-blur-md"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" />
              <span>
                {tr(`Load Saved Career (${saveSlots.length})`, `โหลดเซฟเกม (${saveSlots.length})`)}
              </span>
            </button>
          </div>

          {/* 3 Compact Feature Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 max-w-2xl">
            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800/90 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                <Globe2 className="w-3.5 h-3.5" />
                <span>{tr('15 Leagues · 280 Clubs', '15 ลีกยุโรป · 280 สโมสร')}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {tr(
                  'Top flight & 2nd divisions with full promotion, relegation & UEFA Swiss Phase.',
                  'ครบทั้งลีกสูงสุดและลีกรอง พร้อมระบบเลื่อนชั้น-ตกชั้น และถ้วยยุโรประบบ Swiss'
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800/90 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tr('FM Youth & Wonderkids', 'ระบบปั้นเยาวชน & Wonderkids')}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {tr(
                  'Annual Youth Intake, U18/U21 development, senior mentoring & South America scouting.',
                  'คัดเด็กปั้นประจำปี ทีม U18/U21 ระบบพี่เลี้ยง และส่งแมวมองส่องเพชรเม็ดงาม'
                )}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/75 border border-slate-800/90 backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <UserCheck className="w-3.5 h-3.5" />
                <span>{tr('2D Match & Mind Games', 'จำลองแข่งจริง 2D & จิตวิทยา')}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {tr(
                  'Live 2D pitch engine, touchline shouts, half-time team talks & tactical roles.',
                  'ชมเกมสด 2D ตะโกนสั่งข้างสนาม พูดปลุกใจพักครึ่ง และปรับบทบาทนักเตะละเอียด'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Right Side (4 Cols): Featured Club / Active Save Preview Card floating over the soccer balls */}
        <div className="hidden lg:block lg:col-span-5">
          <div className="ml-auto max-w-sm rounded-2xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-xl p-5 shadow-2xl space-y-4">
            {latestSave ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {tr('LATEST SAVED CAREER', 'เซฟเกมล่าสุดของคุณ')}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{latestSave.gameDate}</span>
                </div>
                <div>
                  <div className="text-lg font-display font-bold text-white">
                    {latestSave.clubName}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {tr('Manager:', 'ผู้จัดการทีม:')} {latestSave.managerName} ·{' '}
                    {tr('Season', 'ฤดูกาล')} {latestSave.season}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLoadSlot(latestSave.slotId)}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors"
                >
                  {tr('Continue Saved Career →', 'เล่นต่อจากเซฟล่าสุด →')}
                </button>
              </>
            ) : (
              defaultQuickClub && (
                <>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {tr('FEATURED CLUB SPOTLIGHT', 'สโมสรแนะนำพร้อมคุมทันที')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <CompetitionBadge
                        competitionId={defaultQuickClub.leagueId}
                        size="xs"
                      />
                      <span className="text-xs font-mono text-slate-300">
                        {LEAGUES_CONFIG[defaultQuickClub.leagueId]?.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <ClubBadge club={defaultQuickClub} size="lg" />
                      <div className="min-w-0">
                        <div className="text-lg font-display font-bold text-white truncate">
                          {defaultQuickClub.name}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {defaultQuickClub.stadiumName} (
                          {defaultQuickClub.stadiumCapacity.toLocaleString()}{' '}
                          {tr('seats', 'ที่นั่ง')})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ClubKitJersey club={defaultQuickClub} variant="home" size="xs" />
                      <ClubKitJersey club={defaultQuickClub} variant="away" size="xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                    <div className="p-2 rounded-lg bg-slate-950/90 border border-slate-800">
                      <div className="text-slate-400 font-sans">{tr('Budget', 'งบเสริมทัพ')}</div>
                      <div className="text-emerald-400 font-bold mt-0.5">
                        €{(defaultQuickClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/90 border border-slate-800">
                      <div className="text-slate-400 font-sans">{tr('Tactic', 'แผนหลัก')}</div>
                      <div className="text-white font-bold mt-0.5">
                        {defaultQuickClub.primaryTactic.formation}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/90 border border-slate-800">
                      <div className="text-slate-400 font-sans">{tr('Target', 'เป้าหมาย')}</div>
                      <div className="text-amber-300 font-bold mt-0.5">
                        Top {defaultQuickClub.boardExpectations.targetLeaguePosition}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onQuickStart}
                      className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer transition-colors"
                    >
                      {tr(`Manage ${defaultQuickClub.shortName}`, `คุมทีม ${defaultQuickClub.shortName} ทันที`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowSetupModal(true)}
                      className="py-2.5 px-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 font-medium text-xs cursor-pointer transition-colors"
                    >
                      {tr('Change Club...', 'เปลี่ยนสโมสร...')}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM BAR: Keyboard Shortcuts & Engine Info */}
      <footer className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-mono">
        <span>
          {tr(
            'Enter / Space Quick Start · C Advance Day · Ctrl+K Global Search · Esc Game Menu',
            'Enter / Space เริ่มเกมทันที · C เดินเวลาวันถัดไป · Ctrl+K ค้นหาด่วน · Esc เมนูหลัก'
          )}
        </span>
        <span className="hidden sm:inline text-slate-500">
          TOUCHLINE Deterministic Match & Youth Engine
        </span>
      </footer>

      {/* TITLE SCREEN SETTINGS MODAL (Language & Audio Preferences) */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          data-testid="title-settings-modal"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h2 className="text-base font-display font-bold text-white">
                  {tr('Game Settings & Language', 'ตั้งค่าเกมและภาษา')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <div className="font-semibold text-slate-300">
                  {tr('Display Language', 'ภาษาที่ใช้แสดงผล')}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      lang === 'en'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-emerald-400 font-bold">English</div>
                    <div className="text-slate-400 mt-0.5">Standard FM terminology</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('th')}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      lang === 'th'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-emerald-400 font-bold">ภาษาไทย</div>
                    <div className="text-slate-400 mt-0.5">เมนูและคำอธิบายภาษาไทย</div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="font-semibold text-white">
                    {tr('Match & UI Sound Effects', 'เสียงประกอบการแข่งขันและปุ่มกด')}
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {isMuted ? tr('Muted', 'ปิดเสียงอยู่') : tr('Active', 'เปิดเสียงอยู่')}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const m = soundService.toggleMute();
                    setIsMuted(m);
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-4 h-4 text-rose-400" />
                      <span>{tr('Unmute', 'เปิดเสียง')}</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4 text-emerald-400" />
                      <span>{tr('Mute', 'ปิดเสียง')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                {tr('Done', 'เสร็จสิ้น')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CAREER & CLUB SELECTION MODAL */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 lg:p-6 transition-opacity duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h2 id="setup-modal-title" className="text-xl font-display font-bold text-slate-100">
                  {tr(
                    'Create Manager Profile & Select Club (15 European Leagues · 280 Clubs)',
                    'สร้างโปรไฟล์ผู้จัดการทีมและเลือกสโมสร (15 ลีกยุโรป · 280 สโมสร)'
                  )}
                </h2>
                <span className="hidden md:inline-block px-2.5 py-0.5 text-xs font-mono rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  SEASON 2025/26
                </span>
              </div>
              <div className="flex items-center gap-3">
                <LanguageSwitcher />
                <button
                  type="button"
                  onClick={() => setShowSetupModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  {tr('Close (Esc)', 'ปิดหน้าต่าง')}
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Manager Profile + Create-a-Club + Scenario Challenges */}
              <div className="lg:col-span-4 space-y-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  {tr('1. Manager Profile', '1. ข้อมูลผู้จัดการทีม')}
                </h3>

                <div>
                  <label htmlFor="mgr-name-input" className="block text-xs text-slate-400 mb-1">
                    {tr('Manager Full Name', 'ชื่อ-นามสกุล ผู้จัดการทีม')}
                  </label>
                  <input
                    id="mgr-name-input"
                    type="text"
                    value={managerName}
                    onChange={(e) => {
                      setManagerName(e.target.value);
                      setCustomEditedName(true);
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100"
                    placeholder={tr('e.g. Mikel Arteta, Pep Guardiola', 'เช่น Mikel Arteta, Pep Guardiola')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="mgr-age-input" className="block text-xs text-slate-400 mb-1">
                      {tr('Age', 'อายุ')}
                    </label>
                    <input
                      id="mgr-age-input"
                      type="number"
                      min={28}
                      max={75}
                      value={managerAge}
                      onChange={(e) => setManagerAge(Number(e.target.value) || 38)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="mgr-nat-select" className="block text-xs text-slate-400 mb-1">
                      {tr('Nationality', 'สัญชาติ')}
                    </label>
                    <select
                      id="mgr-nat-select"
                      value={managerNat}
                      onChange={(e) => setManagerNat(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100"
                    >
                      <option value="England">England</option>
                      <option value="Spain">Spain</option>
                      <option value="Germany">Germany</option>
                      <option value="Italy">Italy</option>
                      <option value="France">France</option>
                      <option value="Portugal">Portugal</option>
                      <option value="Netherlands">Netherlands</option>
                      <option value="Belgium">Belgium</option>
                      <option value="Turkey">Turkey</option>
                      <option value="Scotland">Scotland</option>
                      <option value="Thailand">Thailand</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="mgr-coaching-select" className="block text-xs text-slate-400 mb-1">
                    {tr('Coaching Style', 'รูปแบบการโค้ช')}
                  </label>
                  <select
                    id="mgr-coaching-select"
                    value={coachingStyle}
                    onChange={(e) => setCoachingStyle(e.target.value as ManagerProfile['coachingStyle'])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100"
                  >
                    <option value="Tactician">
                      {tr('Tactician (Master of tactical systems)', 'Tactician — เชี่ยวชาญการแก้เกมและระบบแท็กติก')}
                    </option>
                    <option value="Motivator">
                      {tr('Motivator (Boosts squad morale & mentality)', 'Motivator — กระตุ้นขวัญกำลังใจนักเตะยอดเยี่ยม')}
                    </option>
                    <option value="Youth Developer">
                      {tr('Youth Developer (Accelerates young player growth)', 'Youth Developer — ปั้นดาวรุ่งพัฒนาไว')}
                    </option>
                    <option value="Tracksuit Coach">
                      {tr('Tracksuit Coach (Intensive on-pitch training)', 'Tracksuit Coach — เน้นการฝึกซ้อมภาคสนามเข้มข้น')}
                    </option>
                  </select>
                </div>

                <div>
                  <label htmlFor="mgr-tactical-select" className="block text-xs text-slate-400 mb-1">
                    {tr('Tactical Philosophy', 'ปรัชญาฟุตบอลหลัก')}
                  </label>
                  <select
                    id="mgr-tactical-select"
                    value={tacticalStyle}
                    onChange={(e) => setTacticalStyle(e.target.value as AIManagerStyle)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100"
                  >
                    <option value="Possession-focused Manager">
                      {tr('Possession-focused (Short passing & control)', 'เน้นครองบอลทำชิ่งและคุมจังหวะเกม')}
                    </option>
                    <option value="Attacking Manager">
                      {tr('Attacking Football (High-tempo offensive pressure)', 'เปิดเกมรุกกดดันสูงจังหวะรวดเร็ว')}
                    </option>
                    <option value="Counter-attacking Manager">
                      {tr('Direct Counter-Attack (Compact defense & fast transitions)', 'ตั้งรับรัดกุมและสวนกลับเฉียบคม')}
                    </option>
                    <option value="Youth Developer">
                      {tr('Youth & Dynamic Press (High-energy pressing)', 'เพรสซิ่งแดนบนด้วยขุมกำลังพลังหนุ่ม')}
                    </option>
                    <option value="Pragmatic Manager">
                      {tr('Pragmatic Balance (Adaptable to opponents)', 'สมดุลยืดหยุ่นตามคู่แข่ง')}
                    </option>
                  </select>
                </div>

                {/* Checkpoint 17A: FM Scenario Challenge Modes */}
                <div className="pt-2 border-t border-slate-800 space-y-2" data-testid="scenario-challenge-selector">
                  <label htmlFor="scenario-challenge-select" className="block text-xs font-semibold text-amber-400">
                    {tr('3. FM Scenario Challenge Mode', '3. โหมดภารกิจท้าทาย')}
                  </label>
                  <select
                    id="scenario-challenge-select"
                    value={scenarioChallenge}
                    onChange={(e) => setScenarioChallenge(e.target.value as ScenarioChallengeId)}
                    className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 focus:border-amber-400 focus:outline-none rounded-lg text-xs text-slate-100"
                  >
                    <option value="STANDARD">
                      {tr('Standard Managerial Career (Default)', 'โหมดอาชีพผู้จัดการทีมมาตรฐาน')}
                    </option>
                    <option value="POINTS_DEDUCTION">
                      {tr('⚠️ Financial Crisis (-10 Points Deduction & Tight Budget)', '⚠️ วิกฤตการเงิน — โดนตัด -10 แต้มตั้งแต่เปิดฤดูกาล')}
                    </option>
                    <option value="INJURY_CRISIS">
                      {tr('🚑 Injury Crisis (Top 5 Stars Out Injured for 3–5 Weeks)', '🚑 วิกฤตแข้งเจ็บระนาว — ตัวหลัก 5 คนเจ็บยาวเปิดซีซั่น')}
                    </option>
                    <option value="YOUTH_ONLY">
                      {tr('🌱 Class of ’27 Academy Challenge (20/20 Youth + Transfer Ban)', '🌱 ปั้นเด็กอคาเดมีล้วน — อคาเดมี 20/20 + ห้ามซื้อนักเตะ')}
                    </option>
                  </select>
                </div>

                {/* Checkpoint 17B: Create-a-Club Customizer */}
                <div className="pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sky-400">
                      {tr('4. Create-a-Club Customizer', '4. สร้างสโมสรของคุณเอง')}
                    </span>
                    <button
                      type="button"
                      data-testid="create-a-club-toggle"
                      onClick={() => setCreateClubEnabled(!createClubEnabled)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-semibold cursor-pointer ${
                        createClubEnabled
                          ? 'bg-sky-500 text-slate-950'
                          : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {createClubEnabled ? tr('ENABLED', 'เปิดใช้งาน') : tr('OFF', 'ปิด')}
                    </button>
                  </div>

                  {createClubEnabled && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-sky-500/40 space-y-2.5 text-xs">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label htmlFor="custom-club-name" className="block text-xs text-slate-400 mb-0.5">
                            {tr('Custom Club Name', 'ชื่อสโมสรใหม่')}
                          </label>
                          <input
                            id="custom-club-name"
                            type="text"
                            value={customClubName}
                            onChange={(e) => setCustomClubName(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                        </div>
                        <div>
                          <label htmlFor="custom-short-name" className="block text-xs text-slate-400 mb-0.5">
                            {tr('3-Letter Code', 'ตัวย่อ 3 ตัว')}
                          </label>
                          <input
                            id="custom-short-name"
                            type="text"
                            maxLength={4}
                            value={customShortName}
                            onChange={(e) => setCustomShortName(e.target.value.toUpperCase())}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-white uppercase"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label htmlFor="custom-stadium-name" className="block text-xs text-slate-400 mb-0.5">
                            {tr('Stadium Name', 'ชื่อสนามเหย้า')}
                          </label>
                          <input
                            id="custom-stadium-name"
                            type="text"
                            value={customStadiumName}
                            onChange={(e) => setCustomStadiumName(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-0.5">
                            {tr('Club Colors', 'สีประจำสโมสร')}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              aria-label="Primary Club Color"
                              value={customPrimaryColor}
                              onChange={(e) => setCustomPrimaryColor(e.target.value)}
                              className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                            />
                            <input
                              type="color"
                              aria-label="Secondary Club Color"
                              value={customSecondaryColor}
                              onChange={(e) => setCustomSecondaryColor(e.target.value)}
                              className="w-7 h-7 rounded bg-slate-900 border border-slate-700 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: League & Club Picker */}
              <div className="lg:col-span-8 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-emerald-400">
                    {tr('2. Select Country, League & Club', '2. เลือกประเทศ ลีก และสโมสรต้นสังกัด')}
                  </h3>
                  <span className="text-xs font-mono text-slate-400">
                    {currentLeagueConfig.countryFlag} · {currentLeagueConfig.name} ({allClubsInSelectedLeague.length} {tr('Clubs', 'สโมสร')})
                  </span>
                </div>

                <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  {/* Top Control Bar: Country Dropdown + League Dropdown + Quick Club Search */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                    <div className="md:col-span-4">
                      <label htmlFor="picker-country-select" className="block text-xs text-slate-400 mb-1">
                        {tr('Country', 'ประเทศ')}
                      </label>
                      <select
                        id="picker-country-select"
                        value={selectedCountryId}
                        onChange={(e) => handleSelectCountry(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-medium text-slate-100 cursor-pointer"
                      >
                        {countriesList.map((c) => (
                          <option key={c.countryId} value={c.countryId}>
                            {c.countryFlag} · {c.countryName} ({c.leagues.length} {tr(c.leagues.length > 1 ? 'Leagues' : 'League', 'ลีก')})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-5">
                      <label htmlFor="picker-league-select" className="block text-xs text-slate-400 mb-1">
                        {tr('League & Division Tier', 'ลีกและระดับดิวิชั่น')}
                      </label>
                      <select
                        id="picker-league-select"
                        value={selectedLeague}
                        onChange={(e) => handleSelectLeague(e.target.value as LeagueId)}
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800/90 border border-emerald-500/40 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-semibold text-emerald-300 cursor-pointer"
                      >
                        {countriesList.map((country) => (
                          <optgroup
                            key={country.countryId}
                            label={`${country.countryFlag} — ${country.countryName}`}
                          >
                            {country.leagues.map((lCfg) => (
                              <option key={lCfg.id} value={lCfg.id}>
                                {lCfg.tier === 2
                                  ? tr('Tier 2 (2nd Division)', 'ลีกรอง (D2)')
                                  : tr('Tier 1 (Top Flight)', 'ลีกสูงสุด (D1)')}
                                : {lCfg.name} ({lCfg.targetClubCount} {tr('clubs', 'ทีม')})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label htmlFor="picker-club-search" className="block text-xs text-slate-400 mb-1">
                        {tr('Search Club', 'ค้นหาชื่อสโมสร')}
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                        <input
                          id="picker-club-search"
                          type="text"
                          value={clubSearchQuery}
                          onChange={(e) => setClubSearchQuery(e.target.value)}
                          placeholder={tr('Filter club...', 'พิมพ์ชื่อทีม...')}
                          className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700/80 focus:border-emerald-500 focus:outline-none rounded-lg text-xs text-slate-100 placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quick Country Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                    {countriesList.map((country) => {
                      const isCountryActive = country.countryId === selectedCountryId;
                      return (
                        <button
                          key={country.countryId}
                          type="button"
                          onClick={() => handleSelectCountry(country.countryId)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                            isCountryActive
                              ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                              : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800/80'
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-mono opacity-80 mr-1">{country.countryFlag}</span>
                            {country.countryName}
                          </span>
                          {country.leagues.length > 1 && (
                            <span
                              className={`font-mono px-1 rounded text-xs ${
                                isCountryActive
                                  ? 'bg-slate-950/25 text-slate-950 font-bold'
                                  : 'bg-slate-800 text-emerald-400'
                              }`}
                            >
                              {country.leagues.length}L
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Division Switcher when selected country has both Tier 1 & Tier 2 */}
                  {countryLeagues.length > 1 && (
                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800/80">
                      <span className="text-xs text-slate-400 font-medium shrink-0">
                        {tr(`Select ${currentLeagueConfig.countryName} Division:`, `เลือกระดับลีกของ ${currentLeagueConfig.countryName}:`)}
                      </span>
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        {countryLeagues.map((lCfg) => {
                          const isTierActive = lCfg.id === selectedLeague;
                          return (
                            <button
                              key={lCfg.id}
                              type="button"
                              onClick={() => handleSelectLeague(lCfg.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                                isTierActive
                                  ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300 font-semibold'
                                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span className="truncate">{lCfg.name}</span>
                              <span className="font-mono opacity-80 ml-2 shrink-0">
                                {lCfg.tier === 2 ? 'D2 · ' : 'D1 · '}
                                {lCfg.targetClubCount} {tr('clubs', 'ทีม')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Club List Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-1 pr-1.5">
                  {leagueClubs.map((c) => {
                    const isSelected = c.id === activeClub?.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClubId(c.id);
                          if (!customEditedName) setManagerName(c.aiManager.name);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/95 border-emerald-500 text-white ring-1 ring-emerald-500/40 shadow-md'
                            : 'bg-slate-950/80 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <ClubBadge club={c} size="xs" />
                          <span className="text-xs font-semibold truncate">{c.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
                          <span>Rep {c.reputation}</span>
                          <span className="text-emerald-400/90">
                            €{(c.finances.transferBudget / 1_000_000).toFixed(1)}M
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Club Summary */}
                {activeClub && (
                  <div
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                    style={{ borderLeft: `4px solid ${activeClub.primaryColor}` }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ClubBadge club={activeClub} size="md" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-bold text-white">{activeClub.name}</span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
                              <CompetitionBadge competitionId={activeClub.leagueId} size="xs" />
                              <span>{LEAGUES_CONFIG[activeClub.leagueId]?.name}</span>
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {activeClub.city} · {tr('Stadium:', 'สนาม')} {activeClub.stadiumName} ({activeClub.stadiumCapacity.toLocaleString()} {tr('seats', 'ที่นั่ง')})
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
                          <ClubKitJersey club={activeClub} variant="home" size="xs" showLabel label={tr('Home', 'เหย้า')} />
                          <ClubKitJersey club={activeClub} variant="away" size="xs" showLabel label={tr('Away', 'เยือน')} />
                          <ClubKitJersey club={activeClub} variant="gk" size="xs" showLabel label="GK" />
                        </div>
                        <TrophyArtwork competitionId={activeClub.leagueId} size="sm" />
                        <div className="text-right font-mono tabular-nums">
                          <div className="text-xs text-emerald-400 font-semibold">
                            {tr('Transfer Budget:', 'งบซื้อขาย:')} €{(activeClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                          </div>
                          <div className="text-xs text-slate-400">
                            {tr('Wage Budget:', 'เพดานค่าเหนื่อย:')} €{(activeClub.finances.wageBudgetPerWeek / 1_000).toFixed(0)}K/{tr('wk', 'สัปดาห์')}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-300">
                      {tr(
                        `Board Expectation: Top ${activeClub.boardExpectations.targetLeaguePosition} League Finish — ${activeClub.boardExpectations.clubVision}`,
                        `เป้าหมายบอร์ดบริหาร: อันดับท็อป ${activeClub.boardExpectations.targetLeaguePosition} ของลีก — ${activeClub.boardExpectations.clubVision}`
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="px-4 py-2 text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                {tr('Cancel', 'ยกเลิก')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = managerName.trim() || activeClub?.aiManager.name || 'Mikel Arteta';
                  const customCfg: CustomClubConfig | null = createClubEnabled
                    ? {
                        enabled: true,
                        name: customClubName.trim() || 'Touchline FC',
                        shortName: (customShortName.trim() || 'TFC').slice(0, 4).toUpperCase(),
                        primaryColor: customPrimaryColor,
                        secondaryColor: customSecondaryColor,
                        stadiumName: customStadiumName.trim() || 'Touchline Arena',
                      }
                    : null;
                  onStartCustomCareer(
                    {
                      name: trimmed,
                      age: managerAge,
                      nationality: managerNat,
                      coachingStyle,
                      tacticalStyle,
                    },
                    activeClub.id,
                    scenarioChallenge,
                    customCfg
                  );
                }}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-xl cursor-pointer whitespace-nowrap shadow-lg shadow-emerald-950/50"
              >
                {tr(
                  `Sign Contract & Manage ${createClubEnabled ? customShortName || 'TFC' : activeClub?.shortName}`,
                  `เซ็นสัญญาเริ่มคุมสโมสร ${createClubEnabled ? customShortName || 'TFC' : activeClub?.shortName}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOAD SAVE SLOT MODAL */}
      {showLoadModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="load-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-sky-400" />
                <h2 id="load-modal-title" className="text-lg font-display font-bold text-slate-100">
                  {tr('Load Saved Career', 'โหลดเซฟเกม')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="px-3 py-1 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                {tr('Close', 'ปิดหน้าต่าง')}
              </button>
            </div>
            <div className="p-6 max-h-96 overflow-y-auto space-y-3">
              {!authUser && (
                <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-300">
                    {tr(
                      'Sign in with your Google / Gmail account to sync and load career saves directly from Cloud Firestore.',
                      'เข้าสู่ระบบด้วยบัญชี Google / Gmail เพื่อซิงก์และโหลดข้อมูลเซฟเกมบน Cloud Firestore โดยตรง'
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {tr('Sign in with Gmail', 'เข้าสู่ระบบด้วย Gmail')}
                  </button>
                </div>
              )}
              {saveSlots.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-400">
                  {tr(
                    'No saved careers found yet. Start a new managerial career to save your progress to the Cloud.',
                    'ยังไม่มีข้อมูลเซฟเกมที่บันทึกไว้ เริ่มต้นอาชีพผู้จัดการทีมใหม่เพื่อบันทึกความก้าวหน้าลง Cloud ได้เลย'
                  )}
                </div>
              ) : (
                saveSlots.map((slot) => (
                  <div
                    key={slot.slotId}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">{slot.clubName}</div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums">
                        {tr(
                          `Manager: ${slot.managerName} · Game Date: ${slot.gameDate} · Season ${slot.season}`,
                          `ผู้จัดการ: ${slot.managerName} · วันที่ในเกม: ${slot.gameDate} · ฤดูกาล ${slot.season}`
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onLoadSlot(slot.slotId)}
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
                      >
                        {tr('Load', 'โหลดเซฟ')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.slotId)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-300 text-xs rounded-lg cursor-pointer"
                      >
                        {tr('Delete', 'ลบ')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
