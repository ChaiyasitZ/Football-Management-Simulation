import React, { useEffect, useRef, useState } from 'react';
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
import type { User } from '../firebase';
import { ClubBadge } from './ClubBadge';
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
  const { tr } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);

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

  // Unique countries in order
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

  // Animated 2D Tactical Pitch Background Canvas
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

    const nodes = Array.from({ length: 22 }, (_, i) => ({
      x: (i < 11 ? 0.2 + (i % 4) * 0.14 : 0.8 - (i % 4) * 0.14) * width,
      y: (0.18 + ((i * 37) % 64) * 0.01) * height,
      vx: ((i % 2 === 0 ? 1 : -1) * (12 + (i % 5) * 4)),
      vy: (((i % 3) - 1) * 10),
      team: i < 11 ? 0 : 1,
    }));

    let lastTime = performance.now();
    const render = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(rawDt, 0.05);
      lastTime = now;

      ctx.fillStyle = '#070b12';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle tactical pitch lines on right two-thirds
      ctx.save();
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.08)';
      ctx.lineWidth = 1.5;
      const padX = width * 0.08;
      const padY = height * 0.1;
      const pw = width - padX * 2;
      const ph = height - padY * 2;

      ctx.strokeRect(padX, padY, pw, ph);
      ctx.beginPath();
      ctx.moveTo(width / 2, padY);
      ctx.lineTo(width / 2, padY + ph);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(pw, ph) * 0.14, 0, Math.PI * 2);
      ctx.stroke();

      // Update and draw tactical pass lines & nodes
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < padX + 30 || n.x > padX + pw - 30) n.vx *= -1;
        if (n.y < padY + 30 || n.y > padY + ph - 30) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          if (nodes[i].team !== nodes[j].team) continue;
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220) {
            ctx.strokeStyle =
              nodes[i].team === 0
                ? `rgba(16, 185, 129, ${(1 - dist / 220) * 0.18})`
                : `rgba(56, 189, 248, ${(1 - dist / 220) * 0.16})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.fillStyle = n.team === 0 ? 'rgba(16, 185, 129, 0.55)' : 'rgba(56, 189, 248, 0.5)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Keyboard Enter / Space to start when modal is not open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showSetupModal || showLoadModal) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onQuickStart();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSetupModal, showLoadModal, onQuickStart]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none flex flex-col justify-between p-10 lg:p-16">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/40 pointer-events-none" />

      {/* Top row: minimal version & world summary + Language Switcher + Google Gmail Cloud Auth */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
          <span>TOUCHLINE SIMULATION ENGINE</span>
          <span aria-hidden="true">·</span>
          <span>15 EUROPEAN LEAGUES</span>
          <span aria-hidden="true">·</span>
          <span>280 CLUBS</span>
          <span aria-hidden="true">·</span>
          <span>SEASON 2025/26</span>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher />

          {authUser ? (
            <div className="flex items-center gap-3 px-3.5 py-1.5 rounded-lg bg-slate-900/90 border border-emerald-500/40 text-xs">
              <span className="text-emerald-400 font-mono">Gmail Cloud Save:</span>
              <span className="text-white font-medium truncate max-w-[200px]">
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
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-emerald-500/50 text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {tr('Sign in with Google / Gmail (Cloud Save)', 'เข้าสู่ระบบด้วย Google / Gmail (Cloud Save)')}
            </button>
          )}
        </div>
      </div>

      {/* Main Left-Third Negative Space Hero Lockup */}
      <div className="relative z-10 max-w-2xl my-auto">
        {/* Bespoke Inline SVG Title Emblem & Lockup */}
        <div className="mb-6">
          <svg
            viewBox="0 0 540 120"
            className="w-full max-w-[500px] h-auto"
            role="img"
            aria-label="TOUCHLINE — The World Is Your Pitch"
          >
            {/* Tactical Shield Crest */}
            <g transform="translate(4, 10)">
              <path
                d="M46 4 L88 18 L88 56 C88 82 68 98 46 106 C24 98 4 82 4 56 L4 18 Z"
                fill="#0f172a"
                stroke="#10b981"
                strokeWidth="3"
              />
              <path
                d="M46 12 L80 23 L80 54 C80 75 64 89 46 96 C28 89 12 75 12 54 L12 23 Z"
                fill="#064e3b"
                fillOpacity="0.35"
              />
              {/* Pitch markings inside shield */}
              <rect x="26" y="28" width="40" height="50" rx="2" fill="none" stroke="#34d399" strokeWidth="1.8" />
              <line x1="26" y1="53" x2="66" y2="53" stroke="#34d399" strokeWidth="1.8" />
              <circle cx="46" cy="53" r="8" fill="none" stroke="#34d399" strokeWidth="1.8" />
              <circle cx="46" cy="38" r="3" fill="#facc15" />
            </g>

            {/* Typography Lockup */}
            <text
              x="112"
              y="72"
              fill="#f8fafc"
              fontFamily="Barlow Condensed, sans-serif"
              fontWeight="700"
              fontSize="68"
              letterSpacing="4"
            >
              TOUCHLINE
            </text>
            <text
              x="115"
              y="102"
              fill="#10b981"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="600"
              fontSize="14"
              letterSpacing="5"
            >
              THE WORLD IS YOUR PITCH
            </text>
          </svg>
        </div>

        <p className="text-slate-300 text-base leading-relaxed mb-8 max-w-xl">
          {tr(
            'Deep web-based football management simulation. Build tactical systems, manage squad dynamics, develop youth prospects, negotiate transfers, and lead your club to glory across 280 clubs in 15 European leagues and UEFA competitions.',
            'เกมจำลองการบริหารสโมสรฟุตบอลระดับลึกบนเว็บ วางระบบแท็กติก บริหารขุมกำลัง พัฒนาดาวรุ่ง เจรจาซื้อขายนักเตะ และพาทีมคว้าแชมป์เหนือ 280 สโมสรจาก 15 ลีกฟุตบอลยุโรป (ทั้งลีกสูงสุดและลีกรอง)'
          )}
        </p>

        {/* Primary & Secondary CTAs */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 font-medium text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {tr('Select Club & Create Manager (280 Clubs)', 'เลือกสโมสรและสร้างผู้จัดการทีม (280 สโมสร)')}
          </button>

          <button
            type="button"
            onClick={() => setShowLoadModal(true)}
            className="px-5 py-3.5 bg-slate-900/70 hover:bg-slate-800 text-slate-300 border border-slate-800 font-medium text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums"
          >
            {tr(`Load Saved Career (${saveSlots.length})`, `โหลดเซฟเกม (${saveSlots.length})`)}
          </button>
        </div>
      </div>

      {/* Bottom Safe Margin: Single flat borderless control-hint line */}
      <div className="relative z-10 flex items-center justify-between text-xs text-slate-400 font-mono">
        <span>
          {tr(
            'Enter / Space Quick Start · C Advance Day · M Mute/Unmute · Esc Game Menu & Save',
            'Enter / Space เริ่มเกมทันที · C เดินเวลาวันถัดไป · M ปิด/เปิดเสียง · Esc เมนูหลักและเซฟเกม'
          )}
        </span>
        <span className="hidden sm:inline text-slate-500">Deterministic Match Engine · 15 European Leagues</span>
      </div>

      {/* Custom Career & Club Selection Modal */}
      {showSetupModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 lg:p-6 transition-opacity duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="setup-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl transition-all duration-300">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-3">
                <h2 id="setup-modal-title" className="text-xl font-display font-bold text-slate-100">
                  {tr(
                    'Create Manager Profile & Select Club (15 European Leagues · 280 Clubs)',
                    'สร้างโปรไฟล์ผู้จัดการทีมและเลือกสโมสร (15 ลีกยุโรป · 280 สโมสร)'
                  )}
                </h2>
                <span className="hidden md:inline-block px-2.5 py-0.5 text-[11px] font-mono rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  SEASON 2025/26
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowSetupModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                {tr('Close (Esc)', 'ปิดหน้าต่าง (Esc)')}
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Manager Profile + Create-a-Club + Scenario Challenges */}
              <div className="lg:col-span-4 space-y-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  {tr('1. Manager Profile', '1. ข้อมูลผู้จัดการทีม (Manager Profile)')}
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
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 transition-colors duration-150"
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
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 tabular-nums transition-colors duration-150"
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
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 transition-colors duration-150"
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
                    {tr('Coaching Style', 'รูปแบบการโค้ช (Coaching Style)')}
                  </label>
                  <select
                    id="mgr-coaching-select"
                    value={coachingStyle}
                    onChange={(e) => setCoachingStyle(e.target.value as ManagerProfile['coachingStyle'])}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 transition-colors duration-150"
                  >
                    <option value="Tactician">
                      {tr('Tactician (Master of tactical systems & adjustments)', 'Tactician (เชี่ยวชาญการแก้เกมและระบบแท็กติก)')}
                    </option>
                    <option value="Motivator">
                      {tr('Motivator (Boosts squad morale & mentality)', 'Motivator (กระตุ้นขวัญกำลังใจนักเตะยอดเยี่ยม)')}
                    </option>
                    <option value="Youth Developer">
                      {tr('Youth Developer (Accelerates young player growth)', 'Youth Developer (ปั้นดาวรุ่งพัฒนาไว)')}
                    </option>
                    <option value="Tracksuit Coach">
                      {tr('Tracksuit Coach (Intensive on-pitch training)', 'Tracksuit Coach (เน้นการฝึกซ้อมภาคสนามเข้มข้น)')}
                    </option>
                  </select>
                </div>

                <div>
                  <label htmlFor="mgr-tactical-select" className="block text-xs text-slate-400 mb-1">
                    {tr('Tactical Philosophy', 'ปรัชญาฟุตบอลหลัก (Tactical Philosophy)')}
                  </label>
                  <select
                    id="mgr-tactical-select"
                    value={tacticalStyle}
                    onChange={(e) => setTacticalStyle(e.target.value as AIManagerStyle)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none rounded-lg text-sm text-slate-100 transition-colors duration-150"
                  >
                    <option value="Possession-focused Manager">
                      {tr('Possession-focused (Short passing & control)', 'Possession-focused (เน้นครองบอลทำชิ่ง)')}
                    </option>
                    <option value="Attacking Manager">
                      {tr('Attacking Football (High-tempo offensive pressure)', 'Attacking Football (เปิดเกมรุกกดดันสูง)')}
                    </option>
                    <option value="Counter-attacking Manager">
                      {tr('Direct Counter-Attack (Compact defense & fast transitions)', 'Direct Counter-Attack (รับแน่นโต้กลับเร็ว)')}
                    </option>
                    <option value="Youth Developer">
                      {tr('Youth & Dynamic Press (High-energy pressing)', 'Youth & Dynamic Press (พลังหนุ่มบีบพื้นที่)')}
                    </option>
                    <option value="Pragmatic Manager">
                      {tr('Pragmatic Balance (Adaptable to opponents)', 'Pragmatic Balance (ยืดหยุ่นตามคู่แข่ง)')}
                    </option>
                  </select>
                </div>

                {/* Checkpoint 17A: FM Scenario Challenge Modes */}
                <div className="pt-2 border-t border-slate-800 space-y-2" data-testid="scenario-challenge-selector">
                  <label htmlFor="scenario-challenge-select" className="block text-xs font-semibold text-amber-400">
                    {tr('3. FM Scenario Challenge Mode', '3. โหมดภารกิจท้าทาย (FM Scenario Challenge)')}
                  </label>
                  <select
                    id="scenario-challenge-select"
                    value={scenarioChallenge}
                    onChange={(e) => setScenarioChallenge(e.target.value as ScenarioChallengeId)}
                    className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 focus:border-amber-400 focus:outline-none rounded-lg text-xs text-slate-100"
                  >
                    <option value="STANDARD">
                      {tr('Standard Managerial Career (Default)', 'โหมดอาชีพผู้จัดการทีมมาตรฐาน (Standard Career)')}
                    </option>
                    <option value="POINTS_DEDUCTION">
                      {tr('⚠️ Financial Crisis (-10 Points Deduction & Tight Budget)', '⚠️ วิกฤตการเงิน (โดนตัด -10 แต้มตั้งแต่เปิดฤดูกาล)')}
                    </option>
                    <option value="INJURY_CRISIS">
                      {tr('🚑 Injury Crisis (Top 5 Stars Out Injured for 3–5 Weeks)', '🚑 วิกฤตแข้งเจ็บระนาว (ตัวหลัก 5 คนเจ็บยาวเปิดซีซั่น)')}
                    </option>
                    <option value="YOUTH_ONLY">
                      {tr('🌱 Class of ’27 Academy Challenge (20/20 Youth + Transfer Ban)', '🌱 ปั้นเด็กอคาเดมีล้วน (อคาเดมี 20/20 + ห้ามซื้อนักเตะ)')}
                    </option>
                  </select>
                </div>

                {/* Checkpoint 17B: Create-a-Club Customizer */}
                <div className="pt-2 border-t border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-sky-400">
                      {tr('4. Create-a-Club Customizer', '4. สร้างสโมสรของคุณเอง (Create-a-Club)')}
                    </span>
                    <button
                      type="button"
                      data-testid="create-a-club-toggle"
                      onClick={() => setCreateClubEnabled(!createClubEnabled)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold cursor-pointer ${
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
                          <label htmlFor="custom-club-name" className="block text-[10px] text-slate-400 mb-0.5">
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
                          <label htmlFor="custom-short-name" className="block text-[10px] text-slate-400 mb-0.5">
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
                          <label htmlFor="custom-stadium-name" className="block text-[10px] text-slate-400 mb-0.5">
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
                          <label className="block text-[10px] text-slate-400 mb-0.5">
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

                {/* Focused Element: Structured PC-Responsive Country + League Dropdown & Division Switcher */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-3 transition-all duration-200">
                  {/* Top Control Bar: Country Dropdown + League Dropdown + Quick Club Search */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
                    {/* 1. Country Dropdown */}
                    <div className="md:col-span-4">
                      <label htmlFor="picker-country-select" className="block text-[11px] text-slate-400 mb-1">
                        {tr('Country', 'ประเทศ (Country)')}
                      </label>
                      <select
                        id="picker-country-select"
                        value={selectedCountryId}
                        onChange={(e) => handleSelectCountry(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800/90 border border-slate-700/80 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-medium text-slate-100 transition-all duration-150 cursor-pointer"
                      >
                        {countriesList.map((c) => (
                          <option key={c.countryId} value={c.countryId}>
                            {c.countryFlag} · {c.countryName} ({c.leagues.length} {tr(c.leagues.length > 1 ? 'Leagues' : 'League', 'ลีก')})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 2. League / Division Dropdown (All 15 Leagues or Country Tier) */}
                    <div className="md:col-span-5">
                      <label htmlFor="picker-league-select" className="block text-[11px] text-slate-400 mb-1">
                        {tr('League & Division Tier', 'ลีกในประเทศ / ระดับดิวิชั่น (League & Tier)')}
                      </label>
                      <select
                        id="picker-league-select"
                        value={selectedLeague}
                        onChange={(e) => handleSelectLeague(e.target.value as LeagueId)}
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800/90 border border-emerald-500/40 focus:border-emerald-500 focus:outline-none rounded-lg text-xs font-semibold text-emerald-300 transition-all duration-150 cursor-pointer"
                      >
                        {countriesList.map((country) => (
                          <optgroup
                            key={country.countryId}
                            label={`${country.countryFlag} — ${country.countryName}`}
                          >
                            {country.leagues.map((lCfg) => (
                              <option key={lCfg.id} value={lCfg.id}>
                                {lCfg.tier === 2
                                  ? tr('Tier 2 (2nd Division)', 'Tier 2 (ลีกรอง)')
                                  : tr('Tier 1 (Top Flight)', 'Tier 1 (ลีกสูงสุด)')}
                                : {lCfg.name} ({lCfg.targetClubCount} {tr('clubs', 'ทีม')})
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* 3. Quick Club Filter Input */}
                    <div className="md:col-span-3">
                      <label htmlFor="picker-club-search" className="block text-[11px] text-slate-400 mb-1">
                        {tr('Search Club', 'ค้นหาชื่อสโมสร')}
                      </label>
                      <input
                        id="picker-club-search"
                        type="text"
                        value={clubSearchQuery}
                        onChange={(e) => setClubSearchQuery(e.target.value)}
                        placeholder={tr('Filter club name...', 'พิมพ์ชื่อทีม...')}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 focus:border-emerald-500 focus:outline-none rounded-lg text-xs text-slate-100 placeholder:text-slate-500 transition-all duration-150"
                      />
                    </div>
                  </div>

                  {/* PC Quick Country Grid (10 Countries in 5-col PC grid with smooth hover/active transition) */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 pt-1">
                    {countriesList.map((country) => {
                      const isCountryActive = country.countryId === selectedCountryId;
                      return (
                        <button
                          key={country.countryId}
                          type="button"
                          onClick={() => handleSelectCountry(country.countryId)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all duration-200 ease-out cursor-pointer ${
                            isCountryActive
                              ? 'bg-emerald-500 text-slate-950 font-semibold shadow-md shadow-emerald-950/60 scale-[1.01]'
                              : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800/80'
                          }`}
                        >
                          <span className="truncate">
                            <span className="font-mono text-[10px] opacity-80 mr-1">{country.countryFlag}</span>
                            {country.countryName}
                          </span>
                          {country.leagues.length > 1 && (
                            <span
                              className={`text-[10px] font-mono px-1 rounded ${
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

                  {/* Animated Division Switcher (shows when selected country has both Tier 1 & Tier 2 leagues) */}
                  {countryLeagues.length > 1 && (
                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-800/80 animate-fadeIn">
                      <span className="text-[11px] text-slate-400 font-medium shrink-0">
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
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-all duration-200 ease-out cursor-pointer ${
                                isTierActive
                                  ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300 font-semibold shadow-xs'
                                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                              }`}
                            >
                              <span className="truncate">{lCfg.name}</span>
                              <span className="text-[10px] font-mono opacity-80 ml-2 shrink-0">
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

                {/* Club List Grid (Responsive 3-col PC layout with smooth hover & selection transition) */}
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
                        className={`p-2.5 rounded-xl border text-left transition-all duration-200 ease-out cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800/95 border-emerald-500 text-white ring-1 ring-emerald-500/40 shadow-md -translate-y-0.5'
                            : 'bg-slate-950/80 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700 hover:-translate-y-0.5'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <ClubBadge club={c} size="xs" />
                          <span className="text-xs font-semibold truncate">{c.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
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
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 transition-all duration-200">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ClubBadge club={activeClub} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white">{activeClub.name}</span>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
                              {LEAGUES_CONFIG[activeClub.leagueId]?.name}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {activeClub.city} · {tr('Stadium:', 'สนาม')} {activeClub.stadiumName} ({activeClub.stadiumCapacity.toLocaleString()} {tr('seats', 'ที่นั่ง')})
                          </div>
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-xs text-emerald-400 font-semibold">
                          {tr('Transfer Budget:', 'งบซื้อขาย:')} €{(activeClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                        </div>
                        <div className="text-xs text-slate-400">
                          {tr('Wage Budget:', 'เพดานค่าเหนื่อย:')} €{(activeClub.finances.wageBudgetPerWeek / 1_000).toFixed(0)}K/{tr('wk', 'สัปดาห์')}
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
                className="px-4 py-2 text-xs text-slate-300 hover:text-white transition-colors duration-150 cursor-pointer"
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
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-all duration-150 cursor-pointer whitespace-nowrap shadow-lg shadow-emerald-950/50"
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

      {/* Load Save Slot Modal */}
      {showLoadModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="load-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h2 id="load-modal-title" className="text-lg font-display font-bold text-slate-100">
                {tr('Load Saved Career', 'โหลดเซฟเกม (Saved Careers)')}
              </h2>
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
                <div className="p-4 rounded-lg bg-slate-950 border border-emerald-500/40 flex items-center justify-between gap-4">
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
                    className="flex items-center justify-between p-3.5 rounded-lg bg-slate-950 border border-slate-800"
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
                        className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded cursor-pointer"
                      >
                        {tr('Load', 'โหลดเซฟ')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteSlot(slot.slotId)}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-300 text-xs rounded cursor-pointer"
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
