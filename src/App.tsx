/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import {
  Bell,
  Bookmark,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Home,
  Loader2,
  Search,
  Settings,
  Shield,
  Trophy,
  Users,
} from 'lucide-react';
import {
  Club,
  CompetitionId,
  CustomClubConfig,
  LeagueId,
  ManagerProfile,
  MatchResult,
  Player,
  PlayerRole,
  PositionGroup,
  ScenarioChallengeId,
  TacticalSystem,
  WorldState,
} from './types/game';
import { createInitialWorldState } from './engine/worldGenerator';
import { LEAGUES_CONFIG } from './engine/leaguesConfig';
import { autoRegisterSquadIds } from './engine/tacticsEngine';
import { ClubBadge } from './components/ClubBadge';
import { TrophyArtwork } from './components/TrophyAndKitVisuals';
import {
  ChampionshipTrophyLiftModal,
  TrophyLiftData,
  detectTrophyWinFromMatch,
} from './components/SilverwareModals';
import {
  activateReleaseClauseTransfer,
  adjustClubBudgetAllocation,
  advanceDeadlineDayTwoHours,
  advanceWorldOneDay,
  applyForManagerJob,
  applyPostMatchTeamTalk,
  appointNationalTeamManager,
  arrangeFriendlyMatch,
  assignYouthMentor,
  buildScoutReportForPlayer,
  buildSevenDayCalendarStrip,
  clearInMemorySaveCache,
  completeUserMatchdayAndSyncWorld,
  conductOneOnOnePlayerChat,
  createCustomPlayerInWorld,
  deleteSavedSlot,
  deleteSaveSlotFromFirestore,
  dispatchSouthAmericaWonderkidScout,
  exerciseBuyBackClause,
  expandClubStadium,
  generateAnnualYouthIntake,
  getClubStaffBonuses,
  getPendingUrgentInboxItem,
  getSavedSlotsList,
  hireStaffMember,
  holdEmergencySquadMeeting,
  importWorldDatabaseJson,
  liveEditClubFinancesAndFacilities,
  loadWorldStateFromFirestoreSlot,
  loadWorldStateFromSlot,
  negotiateBoardSeasonAmbition,
  negotiateIncomingTransferBid,
  offerPlayerToClubs,
  organizePreSeasonTour,
  prescribePlayerMedicalRest,
  processEndOfSeasonRollover,
  promoteYouthProspectToSenior,
  purgeLegacyLocalSaves,
  recallPlayerFromLoan,
  recruitYouthAcademyProspect,
  releaseYouthProspect,
  removeMentoringGroup,
  renewPlayerContract,
  requestAffiliateFeederClub,
  respondToIncomingTransferOffer,
  respondToPressConferenceOrJobOffer,
  saveMentoringGroup,
  SaveSlotMeta,
  saveWorldStateToFirestoreSlot,
  saveWorldStateToSlot,
  SeasonRolloverSummary,
  sendPlayerToAffiliateLoan,
  sendPreMatchMindGame,
  setPlayerIndividualTrainingIntensity,
  setPreSeasonCampFocus,
  signPlayerOnBosmanFree,
  simulateClubWorldCupNextStage,
  simulateEuroCupNextStage,
  simulateU21YouthAndReservesMatchday,
  studyNextCoachingLicense,
  submitAndEvaluateTransferOffer,
  syncUserSaveSlotsFromFirestore,
  triggerAIManagerialCarouselCheck,
  triggerClubTakeoverEvent,
  triggerFifaInternationalBreak,
  triggerGlobalSuperClubBid,
  triggerLoanOptionToBuy,
  updatePlayerSquadAndTransferStatus,
  upgradeJuniorOrRecruitmentFacility,
} from './engine/worldSimulationService';
import {
  auth,
  ensureUserProfileInFirestore,
  onAuthStateChanged,
  signInWithGoogle,
  signOutFromGoogle,
  User,
} from './firebase';
import { soundService } from './engine/soundService';
import { TitleScreen } from './components/TitleScreen';
import type { NavTab } from './components/ManagementViews';
import {
  NotificationLogItem,
  PlayerPeekDrawer,
  SubTabBar,
  SubTabItem,
  ToastHistoryDrawer,
} from './ui/UIComponents';
import { LanguageProvider, LanguageSwitcher, useLanguage } from './i18n/LanguageContext';

const PortalView = React.lazy(() =>
  import('./ui/UIComponents').then((m) => ({ default: m.PortalView }))
);
const ClubStaffYouthWorldView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.ClubStaffYouthWorldView }))
);
const CompetitionsAndScheduleView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.CompetitionsAndScheduleView }))
);
const DashboardView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.DashboardView }))
);
const InboxView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.InboxView }))
);
const ScoutingView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.ScoutingView }))
);
const TrainingView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.TrainingView }))
);
const TransfersView = React.lazy(() =>
  import('./components/ManagementViews').then((m) => ({ default: m.TransfersView }))
);
const MatchCenterView = React.lazy(() =>
  import('./components/MatchCenterView').then((m) => ({ default: m.MatchCenterView }))
);
const TacticsView = React.lazy(() =>
  import('./components/TacticsView').then((m) => ({ default: m.TacticsView }))
);
const SquadView = React.lazy(() =>
  import('./components/SquadAndProfileModal').then((m) => ({ default: m.SquadView }))
);
const PlayerProfilePage = React.lazy(() =>
  import('./components/PlayerProfilePage').then((m) => ({ default: m.PlayerProfilePage }))
);

/**
 * Yields to the browser rendering pipeline so button press feedback paints in <16ms (INP < 50ms)
 * before heavy simulation work runs.
 */
const yieldToBrowserPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });

type ShellState = 'title' | 'playing' | 'paused';

export type NavCategoryId =
  | 'home'
  | 'team'
  | 'match'
  | 'recruitment'
  | 'club'
  | 'world'
  | 'system';

interface CategoryConfig {
  id: NavCategoryId;
  labelEn: string;
  labelTh: string;
  defaultSubTab: string;
  subTabs: SubTabItem[];
}

const MAIN_CATEGORIES: CategoryConfig[] = [
  {
    id: 'home',
    labelEn: 'Home',
    labelTh: 'หน้าหลัก',
    defaultSubTab: 'portal',
    subTabs: [
      { id: 'portal', labelEn: 'Portal', labelTh: 'หน้าหลัก' },
      { id: 'inbox', labelEn: 'Inbox & Media', labelTh: 'กล่องข้อความ' },
      { id: 'dashboard', labelEn: 'Classic Overview', labelTh: 'แดชบอร์ดรวม' },
    ],
  },
  {
    id: 'team',
    labelEn: 'Team',
    labelTh: 'ทีม',
    defaultSubTab: 'squad',
    subTabs: [
      { id: 'squad', labelEn: 'Squad', labelTh: 'ขุมกำลัง' },
      { id: 'tactics', labelEn: 'Tactics', labelTh: 'แท็กติก' },
      { id: 'training', labelEn: 'Training', labelTh: 'การฝึกซ้อม' },
      { id: 'medical', labelEn: 'Medical Center', labelTh: 'ศูนย์การแพทย์' },
      { id: 'planner', labelEn: 'Squad Planner', labelTh: 'ผังความลึกขุมกำลัง' },
    ],
  },
  {
    id: 'match',
    labelEn: 'Match',
    labelTh: 'แมตช์',
    defaultSubTab: 'center',
    subTabs: [
      { id: 'center', labelEn: 'Match Center', labelTh: 'สนามแข่งขัน' },
      { id: 'fixtures', labelEn: 'Fixtures', labelTh: 'โปรแกรมแข่งขัน' },
      { id: 'competitions', labelEn: 'Competitions', labelTh: 'ลีกและถ้วยรางวัล' },
    ],
  },
  {
    id: 'recruitment',
    labelEn: 'Recruitment',
    labelTh: 'ตลาดนักเตะ',
    defaultSubTab: 'scouting',
    subTabs: [
      { id: 'scouting', labelEn: 'Scouting Network', labelTh: 'เครือข่ายแมวมอง' },
      { id: 'shortlist', labelEn: 'Shortlist', labelTh: 'รายชื่อเป้าหมาย' },
      { id: 'transfers', labelEn: 'Transfers Hub', labelTh: 'การซื้อขาย' },
    ],
  },
  {
    id: 'club',
    labelEn: 'Club',
    labelTh: 'สโมสร',
    defaultSubTab: 'overview',
    subTabs: [
      { id: 'overview', labelEn: 'Overview & Board', labelTh: 'ข้อมูลสโมสร & บอร์ด' },
      { id: 'finances', labelEn: 'Finances & FFP', labelTh: 'การเงิน' },
      { id: 'staff', labelEn: 'Coaching Staff', labelTh: 'ทีมงานสตาฟฟ์' },
      { id: 'youth', labelEn: 'Youth Academy', labelTh: 'ศูนย์ฝึกเยาวชน' },
      { id: 'history', labelEn: 'History & Honours', labelTh: 'ทำเนียบแชมป์' },
    ],
  },
  {
    id: 'world',
    labelEn: 'World',
    labelTh: 'โลกฟุตบอล',
    defaultSubTab: 'clubs',
    subTabs: [
      { id: 'clubs', labelEn: 'Clubs & Leagues', labelTh: 'สโมสรยุโรป' },
      { id: 'awards', labelEn: 'Hall of Fame & Clash', labelTh: 'หอเกียรติยศ & ดวลทีม' },
      { id: 'international', labelEn: 'National Teams', labelTh: 'ทีมชาติ' },
    ],
  },
  {
    id: 'system',
    labelEn: 'System',
    labelTh: 'ระบบ',
    defaultSubTab: 'settings',
    subTabs: [
      { id: 'settings', labelEn: 'Settings', labelTh: 'ตั้งค่า' },
      { id: 'saves', labelEn: 'Cloud Saves', labelTh: 'เซฟเกม' },
      { id: 'sandbox', labelEn: 'Sandbox & Editor', labelTh: 'แก้ไขฐานข้อมูล' },
    ],
  },
];

// Map legacy NavTab names to new hash routes for full backward compatibility
const LEGACY_TAB_TO_ROUTE: Record<NavTab, string> = {
  dashboard: '#/home/portal',
  inbox: '#/home/inbox',
  squad: '#/team/squad',
  tactics: '#/team/tactics',
  match: '#/match/center',
  training: '#/team/training',
  scouting: '#/recruitment/scouting',
  transfers: '#/recruitment/transfers',
  schedule: '#/match/fixtures',
  competitions: '#/match/competitions',
  club: '#/club/overview',
  staff: '#/club/staff',
  youth: '#/club/youth',
  world: '#/world/clubs',
  manager: '#/system/settings',
};

interface BookmarkEntry {
  route: string;
  labelEn: string;
  labelTh: string;
}

function TouchlineShell() {
  const { tr, trDynamic } = useLanguage();
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [shellState, setShellState] = useState<ShellState>(
    isAutostart ? 'playing' : 'title'
  );
  // Defer heavy 5,800-player world generation until after TitleScreen paints (unless ?autostart=1)
  const [worldState, setWorld] = useState<WorldState | null>(() =>
    isAutostart ? createInitialWorldState(20261110) : null
  );

  // Pre-warm initial WorldState in browser idle time after TitleScreen LCP/FCP completes
  useEffect(() => {
    if (worldState) return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(
        () => {
          setWorld((prev) => prev ?? createInitialWorldState(20261110));
        },
        { timeout: 1200 }
      );
      return () => {
        if (typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idleId);
      };
    }
    const timerId = window.setTimeout(() => {
      setWorld((prev) => prev ?? createInitialWorldState(20261110));
    }, 180);
    return () => window.clearTimeout(timerId);
  }, [worldState]);

  const ensureWorld = (): WorldState => {
    if (worldState) return worldState;
    const generated = createInitialWorldState(20261110);
    setWorld(generated);
    return generated;
  };

  // Non-null reference for active playing/paused views
  const world = (worldState as WorldState);

  // Hash-based Navigation & History Stack
  const [routeHistory, setRouteHistory] = useState<string[]>(['#/home/portal']);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const currentRoute = routeHistory[historyIdx] || '#/home/portal';

  const [focusedNewsId, setFocusedNewsId] = useState<string | null>(null);
  const [quickPeekPlayerId, setQuickPeekPlayerId] = useState<string | null>(null);
  const [externalInspectedClubId, setExternalInspectedClubId] = useState<string | null>(null);

  // User Settings Preferences (Answers #2, #3, #4) — persisted in localStorage
  const [densityMode, setDensityMode] = useState<'compact' | 'comfortable'>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('touchline_ui_prefs_v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.densityMode === 'comfortable' || parsed.densityMode === 'compact') {
          return parsed.densityMode;
        }
      }
    } catch {
      // ignore storage errors
    }
    return 'compact';
  });
  const [useClubAccent, setUseClubAccent] = useState<boolean>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('touchline_ui_prefs_v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.useClubAccent === 'boolean') return parsed.useClubAccent;
      }
    } catch {
      // ignore storage errors
    }
    return true;
  });
  const [developerMode, setDeveloperMode] = useState<boolean>(false);

  // Bookmarks & Notification Center
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('touchline_ui_prefs_v1') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.bookmarks) && parsed.bookmarks.length > 0) {
          return parsed.bookmarks;
        }
      }
    } catch {
      // ignore storage errors
    }
    return [
      { route: '#/team/squad', labelEn: 'Squad', labelTh: 'ขุมกำลัง' },
      { route: '#/team/tactics', labelEn: 'Tactics', labelTh: 'แท็กติก' },
      { route: '#/recruitment/transfers', labelEn: 'Transfers', labelTh: 'การซื้อขาย' },
    ];
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'touchline_ui_prefs_v1',
          JSON.stringify({ densityMode, useClubAccent, bookmarks })
        );
      }
    } catch {
      // ignore storage quota errors
    }
  }, [densityMode, useClubAccent, bookmarks]);

  const [notificationLog, setNotificationLog] = useState<NotificationLogItem[]>([]);
  const [notifDrawerOpen, setNotifDrawerOpen] = useState<boolean>(false);

  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>(() => getSavedSlotsList());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>(
    'idle'
  );
  const [unveilingModalData, setUnveilingModalData] = useState<{
    clubId: string;
    managerName: string;
  } | null>(null);
  const [seasonGalaModalData, setSeasonGalaModalData] = useState<SeasonRolloverSummary | null>(
    null
  );
  const [trophyLiftModalData, setTrophyLiftModalData] = useState<TrophyLiftData | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundService.getMuted());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');
  const deferredCommandQuery = useDeferredValue(commandQuery);
  const [isSimulatingDay, setIsSimulatingDay] = useState<boolean>(false);

  const isAdvancingRef = useRef(false);

  // Stage 6 Phase 1.1: Purge any legacy localStorage save keys on startup (100% Cloud-Only Save Architecture)
  useEffect(() => {
    purgeLegacyLocalSaves();
  }, []);

  const scheduleIdleAutosave = (stateToSave: WorldState) => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const runSave = () => {
      const updatedSlots = saveWorldStateToSlot('slot_autosave', stateToSave, false);
      setSaveSlots(updatedSlots);
      if (auth.currentUser) {
        setCloudSyncStatus('syncing');
        void saveWorldStateToFirestoreSlot('slot_autosave', stateToSave)
          .then((cloudSlots) => {
            setSaveSlots(cloudSlots);
            setCloudSyncStatus('synced');
          })
          .catch(() => {
            setCloudSyncStatus('error');
          });
      }
    };
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(runSave, { timeout: 1000 });
    } else {
      window.setTimeout(runSave, 50);
    }
  };

  // Stage 6 Phase 1.2: Smart Cloud Auto-Save (3,500ms debounce so rapid tactical clicks never spam Firestore)
  useEffect(() => {
    if (shellState !== 'playing' || !worldState) return;
    const debounceId = window.setTimeout(() => {
      scheduleIdleAutosave(worldState);
    }, 3500);
    return () => window.clearTimeout(debounceId);
  }, [worldState, shellState]);

  const navigateToRoute = (nextRoute: string) => {
    const normalized = nextRoute.startsWith('#/') ? nextRoute : `#/${nextRoute}`;
    if (typeof window !== 'undefined' && window.location.hash !== normalized) {
      window.history.replaceState(null, '', normalized);
    }
    setRouteHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      if (sliced[sliced.length - 1] === normalized) return sliced;
      const next = [...sliced, normalized];
      setHistoryIdx(next.length - 1);
      return next;
    });
  };

  useEffect(() => {
    const onHashChange = () => {
      const h = window.location.hash;
      if (h && h.startsWith('#/')) {
        navigateToRoute(h);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [historyIdx]);

  const navigateLegacyTab = (tab: NavTab) => {
    navigateToRoute(LEGACY_TAB_TO_ROUTE[tab] || '#/home/portal');
  };

  const openFullPlayerProfile = (playerId: string) => {
    setQuickPeekPlayerId(null);
    navigateToRoute(`#/player/${playerId}`);
  };

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < routeHistory.length - 1;

  const handleGoBack = () => {
    if (!canGoBack) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', routeHistory[nextIdx]);
    }
  };

  const handleGoForward = () => {
    if (!canGoForward) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', routeHistory[nextIdx]);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    setNotificationLog((prev) => [
      {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timeStr,
        gameDate: worldState?.gameDate || '2025-08-10',
        message: msg,
      },
      ...prev.slice(0, 39),
    ]);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Parse current route into activeCategory, activeSubTab, or playerProfileId
  const routeClean = currentRoute.replace(/^#\//, '');
  const [seg1, seg2] = routeClean.split('/');
  const activePlayerProfileId = seg1 === 'player' && seg2 ? seg2 : null;
  const activeCategory: NavCategoryId =
    seg1 === 'player'
      ? 'team'
      : (MAIN_CATEGORIES.find((c) => c.id === seg1)?.id ?? 'home');
  const currentCatConfig =
    MAIN_CATEGORIES.find((c) => c.id === activeCategory) || MAIN_CATEGORIES[0];
  const activeSubTab =
    seg1 === 'player'
      ? 'squad'
      : currentCatConfig.subTabs.find((s) => s.id === seg2)?.id ||
        currentCatConfig.defaultSubTab;

  const analyticsRoute =
    shellState === 'title' ? '/title' : `/${routeClean || 'home/portal'}`;

  // Subscribe to Google / Gmail Auth state & sync Cloud Firestore save slots
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        setCloudSyncStatus('syncing');
        try {
          await ensureUserProfileInFirestore(user);
          const cloudSlots = await syncUserSaveSlotsFromFirestore();
          setSaveSlots(cloudSlots);
          setCloudSyncStatus('synced');
        } catch (err) {
          console.error(err);
          setCloudSyncStatus('error');
        }
      } else {
        setCloudSyncStatus('idle');
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setCloudSyncStatus('syncing');
      const user = await signInWithGoogle();
      setAuthUser(user);
      await ensureUserProfileInFirestore(user);
      if (shellState === 'playing' && worldState) {
        await saveWorldStateToFirestoreSlot('slot_autosave', worldState);
      }
      const cloudSlots = await syncUserSaveSlotsFromFirestore();
      setSaveSlots(cloudSlots);
      setCloudSyncStatus('synced');
      showToast(
        tr(
          `Signed in with Gmail (${user.email || user.displayName})! Cloud saves synced.`,
          `เข้าสู่ระบบด้วย Gmail (${user.email || user.displayName}) สำเร็จ! ซิงก์เซฟเกมบน Cloud แล้ว`
        )
      );
    } catch (err) {
      setCloudSyncStatus('idle');
      const msg =
        err instanceof Error
          ? err.message
          : tr('Could not sign in with Google', 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้');
      showToast(msg);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutFromGoogle();
      clearInMemorySaveCache();
      setSaveSlots([]);
      setAuthUser(null);
      setCloudSyncStatus('idle');
      if (shellState !== 'title') {
        setShellState('title');
      }
      showToast(
        tr(
          'Signed out from Google / Gmail account. Returned to Title Screen.',
          'ออกจากระบบบัญชี Google / Gmail เรียบร้อยแล้ว กลับสู่หน้าจอหลัก'
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  // Sync document.body.dataset.state with shellState
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  const handleQuickStart = () => {
    if (!authUser && !isAutostart) {
      showToast(
        tr(
          'Sign in with Google / Gmail required before starting a career.',
          'กรุณาเข้าสู่ระบบด้วย Google / Gmail ก่อนเข้าเล่นเกม'
        )
      );
      void handleGoogleSignIn();
      return;
    }
    soundService.playClick();
    const w = ensureWorld();
    scheduleIdleAutosave(w);
    setShellState('playing');
  };

  const handleStartCustomCareer = (
    customManager: Partial<ManagerProfile>,
    clubId: string,
    scenarioChallenge: ScenarioChallengeId = 'STANDARD',
    customClubConfig: CustomClubConfig | null = null
  ) => {
    if (!authUser && !isAutostart) {
      showToast(
        tr(
          'Sign in with Google / Gmail required before starting a career.',
          'กรุณาเข้าสู่ระบบด้วย Google / Gmail ก่อนเข้าเล่นเกม'
        )
      );
      void handleGoogleSignIn();
      return;
    }
    soundService.playWhistle();
    const freshWorld = createInitialWorldState(
      Date.now() % 1000000,
      customManager,
      clubId,
      scenarioChallenge,
      customClubConfig
    );
    setWorld(freshWorld);
    scheduleIdleAutosave(freshWorld);
    navigateToRoute('#/home/portal');
    setShellState('playing');
    setUnveilingModalData({
      clubId: freshWorld.controlledClubId,
      managerName: freshWorld.manager.name,
    });
    showToast(
      tr(
        `Started managerial career with ${freshWorld.clubs[clubId].name}!`,
        `เริ่มต้นอาชีพผู้จัดการทีมกับสโมสร ${freshWorld.clubs[clubId].name}!`
      )
    );
  };

  const handleAdvanceDay = async () => {
    if (isAdvancingRef.current || !worldState) return;

    const pendingUrgent = getPendingUrgentInboxItem(worldState.inbox);
    if (pendingUrgent) {
      soundService.playClick();
      navigateToRoute('#/home/inbox');
      setFocusedNewsId(pendingUrgent.id);
      showToast(
        tr(
          `Action Required: Please respond to "${trDynamic(pendingUrgent.title)}" in your Inbox before continuing.`,
          `มีเรื่องสำคัญที่ต้องตอบ: กรุณาตอบกลับ "${trDynamic(pendingUrgent.title)}" ในกล่องข้อความก่อนเดินเวลาต่อ`
        )
      );
      return;
    }

    isAdvancingRef.current = true;
    setIsSimulatingDay(true);
    try {
      soundService.playAdvanceDay();
      // Yield to browser paint so button active state renders in <16ms (INP < 50ms)
      await yieldToBrowserPaint();

      const { nextState, stoppedReason, urgentInboxItem } = advanceWorldOneDay(worldState);
      setWorld(nextState);
      scheduleIdleAutosave(nextState);

      if (stoppedReason === 'URGENT_INBOX') {
        const targetItem = urgentInboxItem || getPendingUrgentInboxItem(nextState.inbox);
        navigateToRoute('#/home/inbox');
        if (targetItem) setFocusedNewsId(targetItem.id);
        showToast(
          tr(
            `Urgent Inbox Item: "${trDynamic(targetItem?.title || '')}" requires your response.`,
            `มีเรื่องด่วนในกล่องข้อความ: "${trDynamic(targetItem?.title || '')}" รอการตอบกลับจากคุณ`
          )
        );
      } else if (stoppedReason === 'USER_MATCHDAY') {
        navigateToRoute('#/match/center');
        showToast(
          tr(
            'Matchday has arrived! Ready for kick-off in Match Center.',
            'ถึงวันแข่งขันแล้ว! พร้อมลงสนามในสนามแข่งขัน'
          )
        );
      } else {
        showToast(
          tr(
            `Advanced to ${nextState.gameDate} (Auto-saved)`,
            `เดินเวลาสู่วันที่ ${nextState.gameDate} (บันทึกอัตโนมัติ)`
          )
        );
      }
    } finally {
      isAdvancingRef.current = false;
      setIsSimulatingDay(false);
    }
  };

  const handleAdvanceToNextMatchday = async () => {
    if (isAdvancingRef.current || !worldState) return;

    const pendingUrgent = getPendingUrgentInboxItem(worldState.inbox);
    if (pendingUrgent) {
      soundService.playClick();
      navigateToRoute('#/home/inbox');
      setFocusedNewsId(pendingUrgent.id);
      showToast(
        tr(
          `Action Required: Please respond to "${trDynamic(pendingUrgent.title)}" in your Inbox before skipping to Matchday.`,
          `มีเรื่องสำคัญที่ต้องตอบ: กรุณาตอบกลับ "${trDynamic(pendingUrgent.title)}" ในกล่องข้อความก่อนข้ามไปวันแข่ง`
        )
      );
      return;
    }

    isAdvancingRef.current = true;
    setIsSimulatingDay(true);
    try {
      soundService.playAdvanceDay();
      await yieldToBrowserPaint();

      let curr = worldState;
      let steps = 0;
      let lastStoppedReason: 'USER_MATCHDAY' | 'TRANSFER_OFFER' | 'URGENT_INBOX' | undefined;
      let lastUrgentItem = undefined;
      while (steps < 10) {
        const res = advanceWorldOneDay(curr);
        curr = res.nextState;
        steps += 1;
        lastStoppedReason = res.stoppedReason;
        lastUrgentItem = res.urgentInboxItem;
        setWorld(curr);
        if (res.stoppedReason === 'USER_MATCHDAY' || res.stoppedReason === 'URGENT_INBOX') {
          break;
        }
        // Time-slice multi-day advancement across frames to prevent Long Tasks > 50ms
        await yieldToBrowserPaint();
      }
      scheduleIdleAutosave(curr);

      if (lastStoppedReason === 'URGENT_INBOX') {
        const targetItem = lastUrgentItem || getPendingUrgentInboxItem(curr.inbox);
        navigateToRoute('#/home/inbox');
        if (targetItem) setFocusedNewsId(targetItem.id);
        showToast(
          tr(
            `Stopped at ${curr.gameDate}: Urgent Inbox item "${trDynamic(targetItem?.title || '')}" requires your response!`,
            `หยุดเวลาที่ ${curr.gameDate}: มีเรื่องสำคัญในกล่องข้อความ "${trDynamic(targetItem?.title || '')}" ที่ต้องตอบกลับ!`
          )
        );
      } else {
        navigateToRoute('#/match/center');
        showToast(
          tr(
            `Advanced to Matchday ${curr.gameDate}`,
            `เดินเวลาสู่วันแข่งขัน ${curr.gameDate} เรียบร้อยแล้ว`
          )
        );
      }
    } finally {
      isAdvancingRef.current = false;
      setIsSimulatingDay(false);
    }
  };

  const handleAdvanceDayRef = useRef(handleAdvanceDay);
  handleAdvanceDayRef.current = handleAdvanceDay;

  // Keyboard shortcuts in playing / paused states (including Ctrl+K / Cmd+K Command Palette)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (shellState !== 'title') {
          setCommandPaletteOpen((prev) => !prev);
          setCommandQuery('');
        }
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape' && commandPaletteOpen) {
          setCommandPaletteOpen(false);
        }
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (quickPeekPlayerId) {
          setQuickPeekPlayerId(null);
          return;
        }
        if (notifDrawerOpen) {
          setNotifDrawerOpen(false);
          return;
        }
        if (shellState === 'playing') {
          setShellState('paused');
        } else if (shellState === 'paused') {
          setShellState('playing');
        }
      } else if ((e.key === 'm' || e.key === 'M') && shellState !== 'title') {
        const nextMute = soundService.toggleMute();
        setIsMuted(nextMute);
      } else if (
        (e.key === 'c' || e.key === 'C') &&
        shellState === 'playing' &&
        !commandPaletteOpen
      ) {
        void handleAdvanceDayRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shellState, commandPaletteOpen, quickPeekPlayerId, notifDrawerOpen]);

  const handleCompleteMatch = (fixtureId: string, result: MatchResult) => {
    let updated = completeUserMatchdayAndSyncWorld(world, fixtureId, result);
    const trophyWin = detectTrophyWinFromMatch(updated, fixtureId, result);

    // If user mathematically clinched a domestic league title, record it in trophyHistory now
    // so subsequent dead-rubber league matches won't re-trigger the Trophy Lift celebration.
    if (trophyWin && LEAGUES_CONFIG[trophyWin.competitionId as LeagueId]) {
      const cleanSeason = updated.currentSeason.replace('/', '');
      const trpId = `trp_${cleanSeason}_${trophyWin.competitionId}`;
      const alreadyRecorded = (updated.trophyHistory || []).some((t) => t.id === trpId);
      if (!alreadyRecorded) {
        const leagueTable = updated.standings[trophyWin.competitionId as LeagueId] || [];
        const runnerUpId = leagueTable[1]?.clubId;
        const runnerUpClub = runnerUpId ? updated.clubs[runnerUpId] : undefined;
        updated = {
          ...updated,
          trophyHistory: [
            {
              id: trpId,
              season: updated.currentSeason,
              competitionId: trophyWin.competitionId as CompetitionId,
              competitionName: trophyWin.competitionName,
              winnerClubId: trophyWin.clubId,
              winnerClubName: trophyWin.clubName,
              runnerUpClubId: runnerUpClub?.id,
              runnerUpClubName: runnerUpClub?.name,
            },
            ...(updated.trophyHistory || []),
          ],
          manager: {
            ...updated.manager,
            reputation: Math.min(99, updated.manager.reputation + trophyWin.reputationGain),
            careerStats: {
              ...updated.manager.careerStats,
              trophies: updated.manager.careerStats.trophies.some(
                (t) =>
                  t.season === updated.currentSeason &&
                  t.competitionName === trophyWin.competitionName
              )
                ? updated.manager.careerStats.trophies
                : [
                    {
                      season: updated.currentSeason,
                      competitionName: trophyWin.competitionName,
                      clubName: trophyWin.clubName,
                    },
                    ...updated.manager.careerStats.trophies,
                  ],
            },
          },
        };
      }
    }

    setWorld(updated);
    scheduleIdleAutosave(updated);
    if (trophyWin) {
      soundService.playWhistle();
      setTrophyLiftModalData(trophyWin);
    }
    showToast(
      tr(
        'Match result recorded and all league & UEFA standings updated!',
        'บันทึกผลการแข่งขันและอัปเดตตารางคะแนนเรียบร้อยแล้ว!'
      )
    );
  };

  const handleUpdateTactic = (tactic: TacticalSystem, isSecondary = false) => {
    const myClub = world.clubs[world.controlledClubId];
    const updatedClub: Club = {
      ...myClub,
      primaryTactic: isSecondary ? myClub.primaryTactic : tactic,
      secondaryTactic: isSecondary ? tactic : myClub.secondaryTactic,
      formationFamiliarity: {
        ...(myClub.formationFamiliarity || {}),
        [tactic.formation]: tactic.familiarity,
      },
    };
    setWorld({
      ...world,
      clubs: {
        ...world.clubs,
        [myClub.id]: updatedClub,
      },
    });
  };

  const handleRenewContract = (
    playerId: string,
    wage: number,
    years: number,
    bonus: number
  ) => {
    const res = renewPlayerContract(world, playerId, wage, years, bonus);
    setWorld(res.nextState);
    showToast(res.message);
  };

  const handleMakeTransferOffer = (params: {
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
  }) => {
    const res = submitAndEvaluateTransferOffer(world, params);
    setWorld(res.nextState);
    showToast(res.message);
  };

  const handleUpdateIndividualTraining = (
    playerId: string,
    attributeFocus: Player['individualTraining']['attributeFocus'],
    roleFocus: PlayerRole,
    intensity: 'Light' | 'Medium' | 'Heavy'
  ) => {
    const p = world.players[playerId];
    if (!p) return;
    setWorld({
      ...world,
      players: {
        ...world.players,
        [playerId]: {
          ...p,
          individualTraining: { attributeFocus, roleFocus, intensity },
        },
      },
    });
    showToast(
      tr(
        `Updated individual training for ${p.firstName} ${p.lastName}`,
        `อัปเดตตารางซ้อมรายบุคคลของ ${p.firstName} ${p.lastName} แล้ว`
      )
    );
  };

  const handleToggleShortlist = (playerId: string) => {
    const exists = world.shortlistPlayerIds.includes(playerId);
    const updated = exists
      ? world.shortlistPlayerIds.filter((id) => id !== playerId)
      : [...world.shortlistPlayerIds, playerId];
    setWorld({ ...world, shortlistPlayerIds: updated });
    showToast(
      exists
        ? tr('Removed from Shortlist', 'นำออกจากรายชื่อเป้าหมายแล้ว')
        : tr('Added to Shortlist', 'เพิ่มเข้าสู่รายชื่อเป้าหมายแล้ว')
    );
  };

  const handleGenerateScoutReport = (playerId: string) => {
    const p = world.players[playerId];
    if (!p) return;
    const bonuses = getClubStaffBonuses(world, world.controlledClubId);
    const rep = buildScoutReportForPlayer(
      p,
      'stf_head_scout',
      world.gameDate,
      bonuses.scoutAccuracy
    );
    setWorld({
      ...world,
      scoutReports: {
        ...world.scoutReports,
        [playerId]: rep,
      },
    });
    showToast(
      tr(
        `Scout report generated for ${p.firstName} ${p.lastName}`,
        `ออกรายงานแมวมองของ ${p.firstName} ${p.lastName} เรียบร้อยแล้ว`
      )
    );
  };

  const handleBoardRequest = (
    type: 'budget' | 'training_facility' | 'youth_facility' | 'expand_stadium'
  ) => {
    if (type === 'expand_stadium') {
      const res = expandClubStadium(world);
      setWorld(res.nextState);
      showToast(res.message);
      return;
    }
    const club = { ...world.clubs[world.controlledClubId] };
    if (club.boardExpectations.confidence.overall < 60) {
      showToast(
        tr(
          'The Board rejected the request as they want to see stronger on-pitch results first.',
          'บอร์ดบริหารปฏิเสธคำร้องเนื่องจากต้องการเห็นผลงานในสนามที่ดีขึ้นก่อน'
        )
      );
      return;
    }
    if (type === 'budget') {
      club.finances = {
        ...club.finances,
        transferBudget: club.finances.transferBudget + 5_000_000,
      };
      showToast(
        tr('Board approved +€5.0M additional transfer budget!', 'บอร์ดบริหารอนุมัติงบซื้อขายเพิ่มเติม +€5.0M!')
      );
    } else if (type === 'training_facility') {
      if (club.finances.balance < 3_500_000 || club.trainingFacilities >= 20) {
        showToast(
          tr('Cannot upgrade training facilities at this time.', 'ไม่สามารถอัปเกรดศูนย์ฝึกซ้อมได้ในขณะนี้')
        );
        return;
      }
      club.finances = { ...club.finances, balance: club.finances.balance - 3_500_000 };
      club.trainingFacilities = Math.min(20, club.trainingFacilities + 1);
      showToast(
        tr(
          `Training facilities upgraded to Level ${club.trainingFacilities}/20!`,
          `อัปเกรดศูนย์ฝึกซ้อมสู่ระดับ ${club.trainingFacilities}/20 สำเร็จ!`
        )
      );
    } else {
      if (club.finances.balance < 2_500_000 || club.youthFacilities >= 20) {
        showToast(
          tr('Cannot upgrade youth academy at this time.', 'ไม่สามารถอัปเกรดศูนย์ฝึกเยาวชนได้ในขณะนี้')
        );
        return;
      }
      club.finances = { ...club.finances, balance: club.finances.balance - 2_500_000 };
      club.youthFacilities = Math.min(20, club.youthFacilities + 1);
      showToast(
        tr(
          `Youth Academy upgraded to Level ${club.youthFacilities}/20!`,
          `อัปเกรดศูนย์ฝึกเยาวชนสู่ระดับ ${club.youthFacilities}/20 สำเร็จ!`
        )
      );
    }
    setWorld({ ...world, clubs: { ...world.clubs, [club.id]: club } });
  };

  const commandMatchedPlayers = useMemo(() => {
    if (!commandPaletteOpen || !worldState) return [];
    const q = deferredCommandQuery.trim().toLowerCase();
    return Object.values(worldState.players)
      .filter((p) => {
        if (!q) return p.clubId === worldState.controlledClubId;
        return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
      })
      .sort((a, b) => b.currentAbility - a.currentAbility)
      .slice(0, 6);
  }, [commandPaletteOpen, worldState, deferredCommandQuery]);

  const commandMatchedClubs = useMemo(() => {
    if (!commandPaletteOpen || !worldState) return [];
    const q = deferredCommandQuery.trim().toLowerCase();
    const myLeagueId = worldState.clubs[worldState.controlledClubId]?.leagueId;
    return Object.values(worldState.clubs)
      .filter((c) => {
        if (!q) return c.leagueId === myLeagueId;
        return c.name.toLowerCase().includes(q) || c.shortName.toLowerCase().includes(q);
      })
      .slice(0, 6);
  }, [commandPaletteOpen, worldState, deferredCommandQuery]);

  if (shellState === 'title') {
    return (
      <>
        <TitleScreen
          world={worldState}
          saveSlots={saveSlots}
          authUser={authUser}
          isMuted={isMuted}
          onToggleMute={() => {
            const m = soundService.toggleMute();
            setIsMuted(m);
          }}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onQuickStart={handleQuickStart}
          onStartCustomCareer={handleStartCustomCareer}
          onLoadSlot={async (slotId) => {
            if (!authUser && !isAutostart) {
              showToast(
                tr(
                  'Sign in with Google / Gmail required to load Cloud Saves.',
                  'กรุณาเข้าสู่ระบบด้วย Google / Gmail ก่อนโหลดเซฟเกมบน Cloud'
                )
              );
              void handleGoogleSignIn();
              return;
            }
            const loaded = authUser
              ? await loadWorldStateFromFirestoreSlot(slotId)
              : loadWorldStateFromSlot(slotId);
            if (loaded) {
              setWorld(loaded);
              setShellState('playing');
              showToast(
                tr(`Loaded career save: ${loaded.saveName}`, `โหลดเซฟเกม ${loaded.saveName} สำเร็จ!`)
              );
            }
          }}
          onDeleteSlot={async (slotId) => {
            const updated = authUser
              ? await deleteSaveSlotFromFirestore(slotId)
              : deleteSavedSlot(slotId);
            setSaveSlots(updated);
          }}
        />
        <SpeedInsights route={analyticsRoute} />
      </>
    );
  }

  const activeWorld = worldState ?? ensureWorld();
  const controlledClub = activeWorld.clubs[activeWorld.controlledClubId];
  const unreadCount = world.inbox.filter((n) => !n.isRead).length;
  const pendingUrgentInboxItem = getPendingUrgentInboxItem(world.inbox);
  const incomingOfferCount = world.transferOffers.filter(
    (o) => o.sellingClubId === controlledClub.id && o.status === 'PendingClub'
  ).length;

  const activePlayerProfile = activePlayerProfileId
    ? world.players[activePlayerProfileId]
    : null;
  const quickPeekPlayer = quickPeekPlayerId ? world.players[quickPeekPlayerId] : null;

  const currentSubTabItem =
    currentCatConfig.subTabs.find((s) => s.id === activeSubTab) ||
    currentCatConfig.subTabs[0];

  const isBookmarked = bookmarks.some((b) => b.route === currentRoute);

  const toggleCurrentBookmark = () => {
    if (isBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.route !== currentRoute));
    } else if (bookmarks.length < 6) {
      const labelEn = activePlayerProfile
        ? activePlayerProfile.lastName
        : `${currentCatConfig.labelEn}: ${currentSubTabItem.labelEn}`;
      const labelTh = activePlayerProfile
        ? activePlayerProfile.lastName
        : currentSubTabItem.labelTh;
      setBookmarks((prev) => [...prev, { route: currentRoute, labelEn, labelTh }]);
    }
  };

  // Inject dynamic badges onto subTabs
  const subTabsWithBadges: SubTabItem[] = currentCatConfig.subTabs.map((st) => {
    if (activeCategory === 'home' && st.id === 'inbox') {
      return { ...st, badge: unreadCount };
    }
    if (activeCategory === 'recruitment' && st.id === 'shortlist') {
      return { ...st, badge: world.shortlistPlayerIds.length };
    }
    if (activeCategory === 'recruitment' && st.id === 'transfers') {
      return { ...st, badge: incomingOfferCount };
    }
    return st;
  });

  const renderCategoryIcon = (catId: NavCategoryId) => {
    switch (catId) {
      case 'home':
        return <Home className="w-4 h-4 shrink-0" />;
      case 'team':
        return <Users className="w-4 h-4 shrink-0" />;
      case 'match':
        return <Trophy className="w-4 h-4 shrink-0" />;
      case 'recruitment':
        return <Search className="w-4 h-4 shrink-0" />;
      case 'club':
        return <Building2 className="w-4 h-4 shrink-0" />;
      case 'world':
        return <Globe2 className="w-4 h-4 shrink-0" />;
      case 'system':
        return <Settings className="w-4 h-4 shrink-0" />;
    }
  };

  const isFullScreenMatch =
    activeCategory === 'match' && activeSubTab === 'center' && !activePlayerProfile;

  return (
    <div
      className="w-screen h-screen bg-slate-950 text-slate-100 flex overflow-hidden select-none"
      data-density={densityMode}
      style={
        {
          '--club-accent': useClubAccent ? controlledClub.primaryColor : '#10b981',
          '--club-primary': useClubAccent ? controlledClub.primaryColor : '#10b981',
          '--club-secondary': useClubAccent ? controlledClub.secondaryColor : '#0f172a',
        } as React.CSSProperties
      }
    >
      {/* Left Vertical Rail Navigation (Hidden in Full-Screen Live Match Broadcast Mode) */}
      {!isFullScreenMatch && (
      <aside
        className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0"
        data-testid="left-nav-rail"
      >
        <div>
          {/* Brand Lockup */}
          <div
            className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/60"
            style={{
              borderTop: `3px solid ${useClubAccent ? controlledClub.primaryColor : '#10b981'}`,
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src="/assets/aistudio/touchline_logo.webp"
                alt="TOUCHLINE"
                width={128}
                height={52}
                decoding="async"
                data-testid="sidebar-brand-logo"
                className="w-32 h-12 -my-1.5 -ml-1 object-contain object-left select-none pointer-events-none"
              />
            </div>
            <span className="text-xs font-mono text-emerald-400 shrink-0">
              {world.currentSeason}
            </span>
          </div>

          {/* Controlled Club Identity */}
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-2.5">
              <ClubBadge club={controlledClub} size="md" />
              <div className="truncate">
                <div className="text-xs font-bold text-white truncate">
                  {controlledClub.name}
                </div>
                <div className="text-xs text-slate-400 truncate">
                  {world.manager.name}
                </div>
              </div>
            </div>
          </div>

          {/* 6 Main Categories */}
          <nav className="p-2.5 space-y-1" aria-label="Main Navigation">
            {MAIN_CATEGORIES.filter((c) => c.id !== 'system').map((cat) => {
              const active = activeCategory === cat.id && !activePlayerProfile;
              const badgeCount =
                cat.id === 'home'
                  ? unreadCount
                  : cat.id === 'recruitment'
                    ? incomingOfferCount
                    : 0;

              return (
                <div key={cat.id} className="space-y-0.5">
                  <button
                    type="button"
                    data-testid={`nav-cat-${cat.id}`}
                    onClick={() => {
                      soundService.playClick();
                      navigateToRoute(`#/${cat.id}/${cat.defaultSubTab}`);
                    }}
                    style={
                      active && useClubAccent
                        ? {
                            backgroundColor: controlledClub.primaryColor,
                            color: '#ffffff',
                          }
                        : undefined
                    }
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {renderCategoryIcon(cat.id)}
                      <span>{tr(cat.labelEn, cat.labelTh)}</span>
                    </div>
                    {badgeCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full font-mono text-xs tabular-nums ${
                          active
                            ? 'bg-slate-950 text-emerald-400 font-bold'
                            : pendingUrgentInboxItem && cat.id === 'home'
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-emerald-400'
                        }`}
                      >
                        {badgeCount}
                      </span>
                    )}
                  </button>

                  {/* Compact Sub-links when Category is Active */}
                  {active && (
                    <div className="pl-6 pr-1 py-1 space-y-0.5 border-l border-slate-800 ml-4">
                      {cat.subTabs.map((sub) => {
                        const subActive = activeSubTab === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              soundService.playClick();
                              navigateToRoute(`#/${cat.id}/${sub.id}`);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer flex items-center justify-between ${
                              subActive
                                ? 'bg-slate-800 text-emerald-400 font-semibold'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                            }`}
                          >
                            <span className="truncate">{tr(sub.labelEn, sub.labelTh)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Bottom System Category & Pause Menu */}
        <div className="p-2.5 border-t border-slate-800 space-y-1.5 bg-slate-950/40">
          {(() => {
            const sysCat = MAIN_CATEGORIES.find((c) => c.id === 'system')!;
            const sysActive = activeCategory === 'system' && !activePlayerProfile;
            return (
              <button
                type="button"
                data-testid="nav-cat-system"
                onClick={() => {
                  soundService.playClick();
                  navigateToRoute(`#/system/${sysCat.defaultSubTab}`);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  sysActive
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4" />
                  <span>{tr(sysCat.labelEn, sysCat.labelTh)}</span>
                </div>
                <span className="text-xs font-mono opacity-75">{tr('EN', 'TH')}</span>
              </button>
            );
          })()}

          <div className="flex items-center justify-between gap-1.5 pt-1">
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                const m = soundService.toggleMute();
                setIsMuted(m);
              }}
              className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-xs cursor-pointer"
              aria-label="Toggle Mute Audio"
            >
              {isMuted ? '🔇 OFF' : '🔊 ON'}
            </button>

            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                setShellState('paused');
              }}
              className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-xs cursor-pointer"
              aria-label="Open Game Menu"
            >
              Menu [Esc]
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar (Hidden in Full-Screen Live Match Broadcast Mode) */}
        {!isFullScreenMatch && (
        <header className="h-14 bg-slate-900 border-b border-slate-800 px-5 flex items-center justify-between gap-4 shrink-0">
          {/* Left: Back/Forward + Breadcrumb + Bookmark Pin + Bookmarks Strip */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!canGoBack}
                onClick={handleGoBack}
                aria-label="Navigate Back"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-35 border border-slate-800 text-slate-300 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={!canGoForward}
                onClick={handleGoForward}
                aria-label="Navigate Forward"
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-35 border border-slate-800 text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm font-display font-bold text-white truncate">
              <span className="text-slate-400 font-normal">
                {tr(currentCatConfig.labelEn, currentCatConfig.labelTh)}
              </span>
              <span className="text-slate-600">/</span>
              <span className="truncate">
                {activePlayerProfile
                  ? `${activePlayerProfile.firstName} ${activePlayerProfile.lastName}`
                  : tr(currentSubTabItem.labelEn, currentSubTabItem.labelTh)}
              </span>
            </div>

            {/* Bookmark Star Toggle */}
            <button
              type="button"
              data-testid="bookmark-toggle-btn"
              onClick={toggleCurrentBookmark}
              title={tr('Bookmark this screen', 'ปักหมุดหน้านี้เป็นทางลัด')}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                isBookmarked
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
            </button>

            {/* Quick Bookmarks Strip (Desktop) */}
            <div className="hidden xl:flex items-center gap-1 pl-2 border-l border-slate-800">
              {bookmarks.map((bm) => (
                <button
                  key={bm.route}
                  type="button"
                  onClick={() => navigateToRoute(bm.route)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                    currentRoute === bm.route
                      ? 'bg-slate-800 text-emerald-400'
                      : 'bg-slate-950/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tr(bm.labelEn, bm.labelTh)}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search Ctrl+K, Date & Budget, Notification Bell, Skip & Continue */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="command-palette-trigger"
              onClick={() => {
                setCommandPaletteOpen(true);
                setCommandQuery('');
              }}
              className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-xs rounded-lg cursor-pointer flex items-center gap-2"
            >
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              <span>{tr('Search', 'ค้นหา')}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs text-emerald-400">
                Ctrl+K
              </kbd>
            </button>

            <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono tabular-nums">
              <span className="text-slate-200 font-semibold">{world.gameDate}</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 font-bold">
                €{(controlledClub.finances.transferBudget / 1_000_000).toFixed(1)}M
              </span>
            </div>

            {/* Stage 6 Phase 1.2: Live Cloud Sync Status Badge */}
            <button
              type="button"
              data-testid="cloud-sync-badge"
              onClick={() => {
                if (!authUser) {
                  void handleGoogleSignIn();
                } else {
                  scheduleIdleAutosave(world);
                }
              }}
              title={
                authUser
                  ? tr(
                      '100% Cloud Firestore Auto-Save Active (Click to sync now)',
                      'ซิงก์เซฟเกมอัตโนมัติบน Cloud Firestore (คลิกเพื่อซิงก์ทันที)'
                    )
                  : tr(
                      'Sign in with Google to save your career to Cloud Firestore',
                      'คลิกเพื่อเข้าสู่ระบบ Google และบันทึกเซฟเกมขึ้น Cloud Firestore'
                    )
              }
              className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono cursor-pointer transition-colors ${
                !authUser
                  ? 'bg-slate-950 hover:bg-slate-800 border-sky-500/40 text-sky-300'
                  : cloudSyncStatus === 'syncing'
                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-300'
                    : cloudSyncStatus === 'error'
                      ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              }`}
            >
              <span>
                {!authUser
                  ? tr('☁️ Sign in to Save', '☁️ เข้าสู่ระบบเพื่อเซฟ')
                  : cloudSyncStatus === 'syncing'
                    ? tr('🔄 Syncing...', '🔄 กำลังซิงก์...')
                    : cloudSyncStatus === 'error'
                      ? tr('⚠️ Sync Retry', '⚠️ ลองซิงก์ใหม่')
                      : tr('☁️ Cloud Synced', '☁️ ซิงก์ Cloud แล้ว')}
              </span>
            </button>

            {/* Notification Center Bell */}
            <button
              type="button"
              data-testid="notification-bell-btn"
              onClick={() => setNotifDrawerOpen(true)}
              aria-label="Open Notification History"
              className="relative p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notificationLog.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-slate-950 font-mono text-xs font-bold flex items-center justify-center">
                  {Math.min(9, notificationLog.length)}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="sim-to-matchday-btn"
              disabled={isSimulatingDay}
              onClick={handleAdvanceToNextMatchday}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-slate-200 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSimulatingDay
                ? tr('Simulating...', 'กำลังจำลอง...')
                : tr('⏩ Skip to Matchday', '⏩ ข้ามไปวันแข่ง')}
            </button>

            <button
              type="button"
              disabled={isSimulatingDay}
              onClick={handleAdvanceDay}
              style={
                !pendingUrgentInboxItem && useClubAccent
                  ? {
                      backgroundColor: controlledClub.primaryColor,
                      color: '#ffffff',
                    }
                  : undefined
              }
              className={`px-4 py-1.5 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                pendingUrgentInboxItem
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 disabled:opacity-75 text-slate-950'
              }`}
            >
              {isSimulatingDay && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {pendingUrgentInboxItem
                  ? tr('Respond in Inbox ! →', 'ตอบข้อความด่วน ! →')
                  : isSimulatingDay
                    ? tr('Advancing...', 'กำลังเดินเวลา...')
                    : tr('Continue →', 'เดินเวลาต่อ →')}
              </span>
            </button>
          </div>
        </header>
        )}

        {/* Contextual Sub-Tab Bar inside Category Page Header (Hidden when viewing Full Player Profile or Full-Screen Match) */}
        {!activePlayerProfile && !isFullScreenMatch && (
          <>
            <SubTabBar
              tabs={subTabsWithBadges}
              activeSubTab={activeSubTab}
              onSelect={(subId) => {
                soundService.playClick();
                navigateToRoute(`#/${activeCategory}/${subId}`);
              }}
            />

            {/* Stage 3 Pillar 5: 7-Day Interactive Calendar Ribbon */}
            <div
              data-testid="calendar-7day-ribbon"
              className="px-4 py-1.5 bg-slate-950/90 border-b border-slate-800/80 flex items-center justify-between gap-2 overflow-x-auto shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-max">
                {buildSevenDayCalendarStrip(world).map((dayItem, idx) => (
                  <button
                    key={dayItem.date}
                    type="button"
                    onClick={() => {
                      if (dayItem.eventType === 'MATCHDAY') {
                        navigateToRoute('#/match/center');
                      } else if (dayItem.eventType === 'DEADLINE') {
                        navigateToRoute('#/recruitment/transfers');
                      } else {
                        navigateToRoute('#/team/training');
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 cursor-pointer transition-colors ${
                      idx === 0
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white font-semibold'
                        : dayItem.eventType === 'MATCHDAY'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-semibold'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-slate-400">
                      {dayItem.dayName} {dayItem.date.slice(5)}
                    </span>
                    <span
                      className={
                        dayItem.eventType === 'MATCHDAY'
                          ? 'text-amber-300 font-bold'
                          : dayItem.eventType === 'DEADLINE'
                            ? 'text-rose-300 font-bold'
                            : 'text-emerald-400'
                      }
                    >
                      {tr(dayItem.labelEn, dayItem.labelTh)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Scrollable Workspace Viewport */}
        <main className={isFullScreenMatch ? 'flex-1 overflow-hidden p-0' : 'flex-1 overflow-y-auto p-5'}>
          <Suspense
            fallback={
              <div className="h-full w-full flex items-center justify-center p-12 text-xs font-mono text-slate-400 gap-2">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>{tr('Loading tactical module...', 'กำลังโหลดหน้าต่างจัดการทีม...')}</span>
              </div>
            }
          >
          {/* FULL-PAGE PLAYER PROFILE VIEW (#/player/:id) */}
          {activePlayerProfile ? (
            <PlayerProfilePage
              player={activePlayerProfile}
              world={world}
              onBack={handleGoBack}
              onSelectPlayer={openFullPlayerProfile}
              onRenewContract={handleRenewContract}
              onMakeTransferOffer={handleMakeTransferOffer}
              onUpdateIndividualTraining={handleUpdateIndividualTraining}
              onToggleShortlist={handleToggleShortlist}
              onGenerateScoutReport={handleGenerateScoutReport}
              onUpdatePlayerTransferAndSquadStatus={(playerId, updates) => {
                const res = updatePlayerSquadAndTransferStatus(world, playerId, updates);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onSignBosmanFree={(playerId, wage, years) => {
                const res = signPlayerOnBosmanFree(world, playerId, wage, years);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onActivateReleaseClause={(playerId, useBargainDiscount) => {
                const res = activateReleaseClauseTransfer(world, playerId, useBargainDiscount);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onSendToAffiliateLoan={(playerId) => {
                const res = sendPlayerToAffiliateLoan(world, playerId);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onOfferPlayerToClubs={(playerId) => {
                const res = offerPlayerToClubs(world, playerId);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onPlayerChat={(playerId, topic) => {
                const res = conductOneOnOnePlayerChat(world, playerId, topic);
                setWorld(res.nextState);
                showToast(res.message);
              }}
            />
          ) : (
            <>
              {/* CATEGORY 1: HOME (Portal | Inbox | Classic Dashboard) */}
              {activeCategory === 'home' && activeSubTab === 'portal' && (
                <PortalView
                  world={world}
                  onNavigateRoute={navigateToRoute}
                  onSelectPlayer={openFullPlayerProfile}
                  onAdvanceDay={handleAdvanceDay}
                  onSendMindGame={(tone) => {
                    const res = sendPreMatchMindGame(world, tone);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onOrganizePreSeasonTour={(region) => {
                    const res = organizePreSeasonTour(world, region);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSetPreSeasonCampFocus={(focus) => {
                    const res = setPreSeasonCampFocus(world, focus);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onArrangeFriendlyMatch={(tier) => {
                    const res = arrangeFriendlyMatch(world, tier);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                />
              )}

              {activeCategory === 'home' && activeSubTab === 'dashboard' && (
                <DashboardView
                  world={world}
                  onNavigate={navigateLegacyTab}
                  onSelectPlayer={openFullPlayerProfile}
                  onAdvanceDay={handleAdvanceDay}
                  onSendMindGame={(tone) => {
                    const res = sendPreMatchMindGame(world, tone);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onOrganizePreSeasonTour={(region) => {
                    const res = organizePreSeasonTour(world, region);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSetPreSeasonCampFocus={(focus) => {
                    const res = setPreSeasonCampFocus(world, focus);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onArrangeFriendlyMatch={(tier) => {
                    const res = arrangeFriendlyMatch(world, tier);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                />
              )}

              {activeCategory === 'home' && activeSubTab === 'inbox' && (
                <InboxView
                  world={world}
                  focusedNewsId={focusedNewsId}
                  onMarkRead={(newsId) => {
                    setWorld({
                      ...world,
                      inbox: world.inbox.map((n) =>
                        n.id === newsId ? { ...n, isRead: true } : n
                      ),
                    });
                  }}
                  onAnswerPressConference={(newsId, optionId) => {
                    const res = respondToPressConferenceOrJobOffer(world, newsId, optionId);
                    setWorld(res.nextState);
                    showToast(res.message);
                    if (res.switchedClub) {
                      scheduleIdleAutosave(res.nextState);
                      setUnveilingModalData({
                        clubId: res.nextState.controlledClubId,
                        managerName: res.nextState.manager.name,
                      });
                      navigateToRoute('#/home/portal');
                    }
                  }}
                  onAddAiNewsItem={(title, body) => {
                    setWorld({
                      ...world,
                      inbox: [
                        {
                          id: `news_ai_${Date.now()}`,
                          gameDate: world.gameDate,
                          category: 'Media',
                          title,
                          body,
                          isRead: false,
                        },
                        ...world.inbox,
                      ],
                    });
                    showToast(tr('New Sports Desk report added to Inbox', 'เพิ่มสกู๊ปข่าวใหม่ในกล่องข้อความแล้ว'));
                  }}
                  onNavigate={navigateLegacyTab}
                />
              )}

              {/* CATEGORY 2: TEAM (Squad | Tactics | Training | Medical | Planner) */}
              {activeCategory === 'team' &&
                (activeSubTab === 'squad' || activeSubTab === 'planner') && (
                  <SquadView
                    world={world}
                    initialViewMode={activeSubTab === 'planner' ? 'planner' : 'table'}
                    onSelectPlayer={openFullPlayerProfile}
                    onQuickPeekPlayer={(pid) => setQuickPeekPlayerId(pid)}
                    onToggleRegistration={(playerId) => {
                      const p = world.players[playerId];
                      if (!p) return;
                      const nextReg = p.isRegistered === false ? true : false;
                      setWorld({
                        ...world,
                        players: {
                          ...world.players,
                          [playerId]: { ...p, isRegistered: nextReg },
                        },
                      });
                      showToast(
                        nextReg
                          ? tr(
                              `Registered ${p.firstName} ${p.lastName} in 25-man Squad`,
                              `ลงทะเบียน ${p.firstName} ${p.lastName} เข้าสู่โควตา 25 คนแล้ว`
                            )
                          : tr(
                              `Unregistered ${p.firstName} ${p.lastName} from 25-man Squad`,
                              `ถอดชื่อ ${p.firstName} ${p.lastName} ออกจากโควตา 25 คนแล้ว`
                            )
                      );
                    }}
                    onAutoRegisterSquad={() => {
                      const clubPlayers = Object.values(world.players).filter(
                        (p) => p.clubId === controlledClub.id
                      );
                      const starterIds = new Set(
                        controlledClub.primaryTactic.lineup
                          .map((s) => s.playerId)
                          .filter((id): id is string => Boolean(id))
                      );
                      const regIds = autoRegisterSquadIds(
                        clubPlayers,
                        controlledClub.countryId,
                        starterIds
                      );
                      const updatedPlayers = { ...world.players };
                      for (const cp of clubPlayers) {
                        updatedPlayers[cp.id] = {
                          ...cp,
                          isRegistered: regIds.has(cp.id),
                        };
                      }
                      setWorld({ ...world, players: updatedPlayers });
                      showToast(
                        tr(
                          'Auto-registered 25 players meeting the 8+ Homegrown quota!',
                          'คัดเลือกและลงทะเบียนนักเตะ 25 คนตามกฎโควตา Homegrown 8+ คนเรียบร้อยแล้ว!'
                        )
                      );
                    }}
                    onTogglePlayInReserves={(playerId) => {
                      const p = world.players[playerId];
                      if (!p) return;
                      const nextRes = !p.playInReserves;
                      setWorld({
                        ...world,
                        players: {
                          ...world.players,
                          [playerId]: { ...p, playInReserves: nextRes },
                        },
                      });
                      showToast(
                        nextRes
                          ? tr(
                              `${p.firstName} ${p.lastName} assigned to Reserves (U23) to build Match Sharpness.`,
                              `ส่ง ${p.firstName} ${p.lastName} ลงเล่นทีมสำรอง (U23) เพื่อเรียกความเฉียบคม`
                            )
                          : tr(
                              `${p.firstName} ${p.lastName} recalled from Reserves (U23) duty.`,
                              `ยกเลิกการส่ง ${p.firstName} ${p.lastName} ลงเล่นทีมสำรอง (U23)`
                            )
                      );
                    }}
                    onUpdateSquadStatus={(playerId, status) => {
                      const res = updatePlayerSquadAndTransferStatus(world, playerId, {
                        squadStatus: status,
                      });
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                    onChangeShirtNumber={(playerId, shirtNumber) => {
                      const p = world.players[playerId];
                      if (!p) return;
                      const updatedPlayers = { ...world.players };
                      // If another player on the same club already wears this number, swap their number
                      const existingHolder = Object.values(updatedPlayers).find(
                        (other) =>
                          other.clubId === p.clubId &&
                          other.id !== playerId &&
                          other.shirtNumber === shirtNumber
                      );
                      if (existingHolder) {
                        updatedPlayers[existingHolder.id] = {
                          ...existingHolder,
                          shirtNumber: p.shirtNumber,
                        };
                      }
                      updatedPlayers[playerId] = {
                        ...p,
                        shirtNumber,
                      };
                      setWorld({ ...world, players: updatedPlayers });
                      showToast(
                        tr(
                          `Assigned squad number #${shirtNumber} to ${p.firstName} ${p.lastName}`,
                          `กำหนดเบอร์เสื้อ #${shirtNumber} ให้กับ ${p.firstName} ${p.lastName} เรียบร้อยแล้ว`
                        )
                      );
                    }}
                    onHoldSquadMeeting={(tone) => {
                      const res = holdEmergencySquadMeeting(world, tone);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                  />
                )}

              {activeCategory === 'team' && activeSubTab === 'tactics' && (
                <TacticsView
                  world={world}
                  onUpdateTactic={handleUpdateTactic}
                  onSelectPlayer={openFullPlayerProfile}
                />
              )}

              {activeCategory === 'team' &&
                (activeSubTab === 'training' || activeSubTab === 'medical') && (
                  <TrainingView
                    world={world}
                    subView={activeSubTab === 'medical' ? 'medical' : 'training'}
                    onUpdateClubTraining={(focus, intensity) => {
                      setWorld({
                        ...world,
                        clubs: {
                          ...world.clubs,
                          [controlledClub.id]: {
                            ...controlledClub,
                            trainingFocus: focus,
                            trainingIntensity: intensity,
                          },
                        },
                      });
                      showToast(
                        tr(
                          `Team training set to ${focus} (${intensity})`,
                          `ตั้งค่าการซ้อมทีมเป็น ${focus} (${intensity}) เรียบร้อยแล้ว`
                        )
                      );
                    }}
                    onSelectPlayer={openFullPlayerProfile}
                    onSaveMentoringGroup={(mentorId, menteeIds) => {
                      const res = saveMentoringGroup(world, mentorId, menteeIds);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                    onRemoveMentoringGroup={(groupId) => {
                      const res = removeMentoringGroup(world, groupId);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                    onPrescribeMedicalRest={(playerId) => {
                      const res = prescribePlayerMedicalRest(world, playerId);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                    onSetPlayerTrainingIntensity={(playerId, intensity) => {
                      const res = setPlayerIndividualTrainingIntensity(
                        world,
                        playerId,
                        intensity
                      );
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                    onPromoteYouth={(playerId) => {
                      const res = promoteYouthProspectToSenior(world, playerId);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                  />
                )}

              {/* CATEGORY 3: MATCH (Match Center | Fixtures | Competitions) */}
              {activeCategory === 'match' && activeSubTab === 'center' && (
                <MatchCenterView
                  world={world}
                  onCompleteMatch={handleCompleteMatch}
                  onUpdateClubTactic={(tactic) => handleUpdateTactic(tactic, false)}
                  onSelectPlayer={openFullPlayerProfile}
                  onExitMatchCenter={() => navigateToRoute('#/home/portal')}
                  onOpenTactics={() => navigateToRoute('#/team/tactics')}
                  onApplyPostMatchTeamTalk={(tone, fixtureId) => {
                    const res = applyPostMatchTeamTalk(world, tone, fixtureId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                />
              )}

              {activeCategory === 'match' &&
                (activeSubTab === 'fixtures' || activeSubTab === 'competitions') && (
                  <CompetitionsAndScheduleView
                    world={world}
                    initialMode={activeSubTab === 'fixtures' ? 'schedule' : 'competitions'}
                    onSelectPlayer={openFullPlayerProfile}
                    onArrangeFriendlyMatch={(tier) => {
                      const res = arrangeFriendlyMatch(world, tier);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                  />
                )}

              {/* CATEGORY 4: RECRUITMENT (Scouting | Shortlist | Transfers) */}
              {activeCategory === 'recruitment' &&
                (activeSubTab === 'scouting' || activeSubTab === 'shortlist') && (
                  <ScoutingView
                    world={world}
                    subView={activeSubTab === 'shortlist' ? 'shortlist' : 'scouting'}
                    onSelectPlayer={openFullPlayerProfile}
                    onToggleShortlist={handleToggleShortlist}
                    onCreateAssignment={(
                      region: LeagueId | 'ALL_EUROPE' | 'SOUTH_AMERICA',
                      posGroup: PositionGroup | 'ANY',
                      maxAge: number,
                      maxBudget: number
                    ) => {
                      setWorld({
                        ...world,
                        scoutAssignments: [
                          {
                            id: `asgn_${Date.now()}`,
                            scoutId: 'stf_head_scout',
                            regionOrLeague: region,
                            positionGroup: posGroup,
                            maxAge,
                            maxBudget,
                            startDate: world.gameDate,
                            daysRemaining: 14,
                            reportsGenerated: [],
                          },
                          ...world.scoutAssignments,
                        ],
                      });
                      showToast(
                        tr(
                          'Scouting team dispatched with your criteria.',
                          'ส่งทีมแมวมองออกค้นหานักเตะตามเงื่อนไขที่กำหนดแล้ว'
                        )
                      );
                    }}
                    onGenerateScoutReport={handleGenerateScoutReport}
                    onDispatchSouthAmericaScout={() => {
                      const res = dispatchSouthAmericaWonderkidScout(world);
                      setWorld(res.nextState);
                      showToast(res.message);
                    }}
                  />
                )}

              {activeCategory === 'recruitment' && activeSubTab === 'transfers' && (
                <TransfersView
                  world={world}
                  onSelectPlayer={openFullPlayerProfile}
                  onRespondToIncomingOffer={(offerId, decision) => {
                    const res = respondToIncomingTransferOffer(world, offerId, decision);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onNegotiateIncomingOffer={(offerId, params) => {
                    const res = negotiateIncomingTransferBid(world, offerId, params);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onExerciseBuyBackClause={(clauseId) => {
                    const res = exerciseBuyBackClause(world, clauseId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onActivateReleaseClause={(playerId, useBargainDiscount) => {
                    const res = activateReleaseClauseTransfer(
                      world,
                      playerId,
                      useBargainDiscount
                    );
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onTriggerGlobalSuperBid={() => {
                    const res = triggerGlobalSuperClubBid(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onRecallFromLoan={(playerId) => {
                    const res = recallPlayerFromLoan(world, playerId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onTriggerLoanOptionToBuy={(playerId) => {
                    const res = triggerLoanOptionToBuy(world, playerId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSendToAffiliateLoan={(playerId) => {
                    const res = sendPlayerToAffiliateLoan(world, playerId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onQuickLoanInPlayer={(playerId) => {
                    const target = world.players[playerId];
                    if (!target) return;
                    const optFee = Math.max(1_500_000, Math.round(target.marketValue * 0.9));
                    const res = submitAndEvaluateTransferOffer(world, {
                      playerId,
                      offerType: 'Loan',
                      upfrontFee: 250_000,
                      installmentsFee: 0,
                      sellOnPercentage: 0,
                      loanOptionToBuyFee: optFee,
                      proposedWagePerWeek: Math.max(15_000, Math.round(target.wagePerWeek * 1.05)),
                      proposedContractYears: 1,
                      proposedSquadStatus: 'Squad Player',
                      signingBonus: 50_000,
                    });
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onAdvanceDeadlineTwoHours={() => {
                    soundService.playClick();
                    const res = advanceDeadlineDayTwoHours(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                />
              )}

              {/* CATEGORY 5, 6, 7: CLUB, WORLD & SYSTEM */}
              {(activeCategory === 'club' ||
                activeCategory === 'world' ||
                activeCategory === 'system') && (
                <ClubStaffYouthWorldView
                  mode={
                    activeCategory === 'club'
                      ? activeSubTab === 'staff'
                        ? 'staff'
                        : activeSubTab === 'youth'
                          ? 'youth'
                          : 'club'
                      : activeCategory === 'world'
                        ? 'world'
                        : 'manager'
                  }
                  subView={activeSubTab}
                  externalInspectedClubId={externalInspectedClubId}
                  densityMode={densityMode}
                  onChangeDensityMode={(m) => {
                    setDensityMode(m);
                    showToast(
                      m === 'compact'
                        ? tr('Switched to Compact Density (FM Classic)', 'สลับเป็นโหมดตารางแน่น (FM Classic)')
                        : tr('Switched to Comfortable Density (FM26)', 'สลับเป็นโหมดโปร่งสบายตา (FM26)')
                    );
                  }}
                  useClubAccent={useClubAccent}
                  onChangeUseClubAccent={(val) => {
                    setUseClubAccent(val);
                    showToast(
                      val
                        ? tr(`Dynamic Club Accent enabled (${controlledClub.name})`, `เปิดใช้สีธีมตามสโมสร (${controlledClub.name})`)
                        : tr('Switched to Default Emerald Theme', 'สลับเป็นสีเขียวมรกตมาตรฐาน')
                    );
                  }}
                  developerMode={developerMode}
                  onChangeDeveloperMode={setDeveloperMode}
                  isMuted={isMuted}
                  onToggleMute={() => {
                    const m = soundService.toggleMute();
                    setIsMuted(m);
                  }}
                  world={world}
                  saveSlots={saveSlots}
                  authUser={authUser}
                  onGoogleSignIn={handleGoogleSignIn}
                  onGoogleSignOut={handleGoogleSignOut}
                  onSelectPlayer={openFullPlayerProfile}
                  onBoardRequest={handleBoardRequest}
                  onAdjustBudgetSplit={(transferPercentage) => {
                    const res = adjustClubBudgetAllocation(world, transferPercentage);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onHireStaff={(staffId) => {
                    const res = hireStaffMember(world, staffId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onRecruitYouth={() => {
                    const next = recruitYouthAcademyProspect(world);
                    setWorld(next);
                    showToast(
                      tr(
                        'Recruited new youth prospect into U18 Academy!',
                        'คัดเลือกดาวรุ่งใหม่เข้าสู่ศูนย์ฝึกเยาวชน U18 เรียบร้อยแล้ว!'
                      )
                    );
                  }}
                  onPromoteYouth={(playerId) => {
                    const res = promoteYouthProspectToSenior(world, playerId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onUpgradeAcademyFacility={(type) => {
                    const res = upgradeJuniorOrRecruitmentFacility(world, type);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onAssignMentor={(youthId, mentorId) => {
                    const res = assignYouthMentor(world, youthId, mentorId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onReleaseYouth={(playerId) => {
                    const res = releaseYouthProspect(world, playerId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onGenerateAnnualIntake={() => {
                    const res = generateAnnualYouthIntake(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onTriggerSeasonRollover={() => {
                    const prevClub = world.clubs[world.controlledClubId];
                    const res = processEndOfSeasonRollover(world);
                    setWorld(res.nextState);
                    setSeasonGalaModalData(res.seasonSummary);
                    if (res.seasonSummary.finalPosition === 1 && prevClub) {
                      const clubPlayers = Object.values(world.players).filter(
                        (p) => p.clubId === prevClub.id
                      );
                      const captain =
                        clubPlayers.find((p) => p.id === prevClub.primaryTactic.setPieces?.captainId) ||
                        clubPlayers.sort(
                          (a, b) => b.attributes.mental.leadership - a.attributes.mental.leadership
                        )[0];
                      setTrophyLiftModalData({
                        competitionId: prevClub.leagueId,
                        competitionName: res.seasonSummary.leagueName,
                        season: res.seasonSummary.completedSeason,
                        clubId: prevClub.id,
                        clubName: prevClub.name,
                        captainName: captain
                          ? `${captain.firstName} ${captain.lastName}`
                          : 'Club Captain',
                        managerName: world.manager.name,
                        prizeMoney: res.seasonSummary.totalPrizeAndTvPayout,
                        reputationGain: 6,
                      });
                    }
                    scheduleIdleAutosave(res.nextState);
                    showToast(res.message);
                  }}
                  onTriggerTakeover={(mode) => {
                    const res = triggerClubTakeoverEvent(world, undefined, mode);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onApplyForJob={(targetClubId) => {
                    const res = applyForManagerJob(world, targetClubId);
                    setWorld(res.nextState);
                    showToast(res.message);
                    if (res.accepted) {
                      scheduleIdleAutosave(res.nextState);
                      setUnveilingModalData({
                        clubId: res.nextState.controlledClubId,
                        managerName: res.nextState.manager.name,
                      });
                      navigateToRoute('#/home/portal');
                    }
                  }}
                  onOrganizePreSeasonTour={(region) => {
                    const res = organizePreSeasonTour(world, region);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onAppointNationalTeam={(code) => {
                    const res = appointNationalTeamManager(world, code);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSimulateEuroCupRound={() => {
                    const res = simulateEuroCupNextStage(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onTriggerFifaBreak={() => {
                    const res = triggerFifaInternationalBreak(world);
                    setWorld(res.nextState);
                    showToast(
                      tr(
                        `FIFA International Break completed (${res.calledUpCount} players called up).`,
                        `เสร็จสิ้นโปรแกรมทีมชาติ FIFA (นักเตะถูกเรียกตัว ${res.calledUpCount} คน)`
                      )
                    );
                  }}
                  onTriggerAICarousel={() => {
                    const res = triggerAIManagerialCarouselCheck(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onRequestAffiliateClub={() => {
                    const res = requestAffiliateFeederClub(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSendToAffiliateLoan={(playerId, affId) => {
                    const res = sendPlayerToAffiliateLoan(world, playerId, affId);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSimulateCWCStage={() => {
                    const res = simulateClubWorldCupNextStage(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onCreateCustomPlayer={(params) => {
                    const res = createCustomPlayerInWorld(world, params);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onLiveEditClub={(params) => {
                    const res = liveEditClubFinancesAndFacilities(world, params);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onImportDatabaseJson={(rawJson) => {
                    const res = importWorldDatabaseJson(world, rawJson);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onStudyCoachingLicense={(mode) => {
                    const res = studyNextCoachingLicense(world, mode || 'INSTANT');
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onNegotiateBoardAmbition={(ambition) => {
                    const res = negotiateBoardSeasonAmbition(world, ambition);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSimulateU21Matchday={() => {
                    const res = simulateU21YouthAndReservesMatchday(world);
                    setWorld(res.nextState);
                    showToast(res.message);
                  }}
                  onSaveToSlot={async (slotId) => {
                    try {
                      let activeUser = authUser;
                      if (!activeUser) {
                        setCloudSyncStatus('syncing');
                        activeUser = await signInWithGoogle();
                        setAuthUser(activeUser);
                      }
                      setCloudSyncStatus('syncing');
                      const slots = await saveWorldStateToFirestoreSlot(slotId, world);
                      setSaveSlots(slots);
                      setCloudSyncStatus('synced');
                      showToast(
                        tr(
                          `Saved career to Cloud Firestore (${slotId})!`,
                          `บันทึกเซฟเกมขึ้น Cloud Firestore (${slotId}) สำเร็จ!`
                        )
                      );
                    } catch {
                      const fallbackSlots = saveWorldStateToSlot(slotId, world, false);
                      setSaveSlots(fallbackSlots);
                      setCloudSyncStatus('error');
                      showToast(
                        tr(
                          `Sign in with Google to persist ${slotId} to Cloud Firestore.`,
                          `กรุณาเข้าสู่ระบบด้วย Google เพื่อบันทึกเซฟ ${slotId} ขึ้น Cloud Firestore`
                        )
                      );
                    }
                  }}
                  onLoadSlot={async (slotId) => {
                    const loaded = authUser
                      ? await loadWorldStateFromFirestoreSlot(slotId)
                      : loadWorldStateFromSlot(slotId);
                    if (loaded) {
                      setWorld(loaded);
                      showToast(
                        tr(`Loaded career from ${slotId}!`, `โหลดเซฟเกมจาก ${slotId} เรียบร้อยแล้ว!`)
                      );
                    }
                  }}
                  onDeleteSlot={async (slotId) => {
                    const updated = authUser
                      ? await deleteSaveSlotFromFirestore(slotId)
                      : deleteSavedSlot(slotId);
                    setSaveSlots(updated);
                    showToast(
                      tr(`Deleted save slot ${slotId}.`, `ลบข้อมูลช่องเซฟ ${slotId} เรียบร้อยแล้ว`)
                    );
                  }}
                />
              )}
            </>
          )}
          </Suspense>
        </main>
      </div>

      {/* Player Quick Peek Side Drawer */}
      {quickPeekPlayer && (
        <PlayerPeekDrawer
          player={quickPeekPlayer}
          world={world}
          onClose={() => setQuickPeekPlayerId(null)}
          onOpenFullProfile={openFullPlayerProfile}
          onToggleShortlist={handleToggleShortlist}
        />
      )}

      {/* Notification History Drawer (Bell) */}
      {notifDrawerOpen && (
        <ToastHistoryDrawer
          items={notificationLog}
          onClose={() => setNotifDrawerOpen(false)}
          onClear={() => setNotificationLog([])}
        />
      )}

      {/* Actionable Global Command Palette (Ctrl+K / Cmd+K) */}
      {commandPaletteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-start justify-center pt-20 p-4"
          data-testid="command-palette-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setCommandPaletteOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-slate-800 flex items-center gap-3">
              <span className="text-emerald-400 font-mono text-sm">⌘K</span>
              <input
                type="text"
                autoFocus
                data-testid="command-palette-input"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder={tr(
                  'Search any player, 280 clubs, or jump to a management screen...',
                  'ค้นหาชื่อนักเตะ, 280 สโมสรยุโรป, หรือพิมพ์ชื่อเมนูเพื่อข้ามหน้า...'
                )}
                className="flex-1 bg-transparent text-sm text-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(false)}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                Esc
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-3 space-y-3 text-xs">
              {/* Navigation Screens */}
              <div>
                <div className="font-mono uppercase text-slate-400 px-2 mb-1">
                  {tr('Management Screens', 'หน้าต่างการจัดการทีม')}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {MAIN_CATEGORIES.flatMap((cat) =>
                    cat.subTabs.map((sub) => ({
                      route: `#/${cat.id}/${sub.id}`,
                      labelEn: `${cat.labelEn} › ${sub.labelEn}`,
                      labelTh: `${cat.labelTh} › ${sub.labelTh}`,
                    }))
                  )
                    .filter((item) => {
                      if (!deferredCommandQuery.trim()) return true;
                      const q = deferredCommandQuery.toLowerCase();
                      return (
                        item.labelEn.toLowerCase().includes(q) ||
                        item.labelTh.toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 6)
                    .map((item) => (
                      <button
                        key={item.route}
                        type="button"
                        onClick={() => {
                          navigateToRoute(item.route);
                          setCommandPaletteOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-left text-slate-200 flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate">{tr(item.labelEn, item.labelTh)}</span>
                        <span className="font-mono text-emerald-400">Go →</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Matching Players (Navigates directly to Full Player Profile #/player/:id) */}
              <div>
                <div className="font-mono uppercase text-slate-400 px-2 mb-1">
                  {tr('Players Database', 'ฐานข้อมูลนักเตะ')}
                </div>
                <div className="space-y-1">
                  {commandMatchedPlayers.map((p) => {
                    const c = world.clubs[p.clubId];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          openFullPlayerProfile(p.id);
                          setCommandPaletteOpen(false);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 flex items-center justify-between text-left cursor-pointer"
                      >
                        <div>
                          <span className="font-semibold text-white">
                            {p.firstName} {p.lastName}
                          </span>{' '}
                          <span className="text-slate-400 font-mono">
                            ({p.positions[0]} · {c?.shortName})
                          </span>
                        </div>
                        <span className="font-mono text-emerald-400">
                          CA {(p.currentAbility / 10).toFixed(1)} · €
                          {(p.marketValue / 1_000_000).toFixed(1)}M
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Matching Clubs (Navigates directly to World > Clubs AND selects that exact club!) */}
              <div>
                <div className="font-mono uppercase text-slate-400 px-2 mb-1">
                  {tr('European Clubs (280)', 'สโมสรยุโรป (280 ทีม)')}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {commandMatchedClubs.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setExternalInspectedClubId(c.id);
                        navigateToRoute('#/world/clubs');
                        setCommandPaletteOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 flex items-center justify-between text-left cursor-pointer"
                    >
                      <span className="text-white truncate">{c.name}</span>
                      <span className="font-mono text-sky-400">
                        {c.countryId} · Rep {c.reputation}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pause / Save Modal (Triggered by Esc or P) */}
      {shellState === 'paused' && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="text-center flex flex-col items-center">
              <img
                src="/assets/aistudio/touchline_logo.webp"
                alt="TOUCHLINE"
                width={220}
                height={140}
                decoding="async"
                className="w-52 h-32 -my-3 object-contain object-center select-none pointer-events-none"
              />
              <h2 id="pause-modal-title" className="text-xl font-display font-bold text-white">
                GAME PAUSED
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {controlledClub.name} · {tr('Game Date:', 'วันที่ในเกม:')} {world.gameDate}
              </p>
            </div>

            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-300 font-medium">
                {tr('Display Language', 'ภาษาที่ใช้แสดงผล')}
              </span>
              <LanguageSwitcher />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">MATCHES</div>
                <div className="text-base font-bold text-white">
                  {world.manager.careerStats.matchesManaged}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">WINS</div>
                <div className="text-base font-bold text-emerald-400">
                  {world.manager.careerStats.won}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-400">CONFIDENCE</div>
                <div className="text-base font-bold text-sky-400">
                  {controlledClub.boardExpectations.confidence.overall}%
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShellState('playing')}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg cursor-pointer"
              >
                {tr('Resume Career', 'กลับเข้าสู่เกม')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    let activeUser = authUser;
                    if (!activeUser) {
                      setCloudSyncStatus('syncing');
                      activeUser = await signInWithGoogle();
                      setAuthUser(activeUser);
                    }
                    setCloudSyncStatus('syncing');
                    const slots = await saveWorldStateToFirestoreSlot('slot_1', world);
                    setSaveSlots(slots);
                    setCloudSyncStatus('synced');
                    showToast(
                      tr('Saved career to Cloud Slot #1!', 'บันทึกเกมขึ้น Cloud ช่องเซฟ #1 สำเร็จ!')
                    );
                    setShellState('playing');
                  } catch {
                    const slots = saveWorldStateToSlot('slot_1', world, false);
                    setSaveSlots(slots);
                    setShellState('playing');
                  }
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg cursor-pointer"
              >
                {tr('☁️ Quick Cloud Save (Slot #1)', '☁️ บันทึกเกมด่วนขึ้น Cloud (Slot #1)')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShellState('playing');
                  navigateToRoute('#/system/settings');
                }}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs rounded-lg cursor-pointer"
              >
                {tr('Open Settings & Preferences', 'ตั้งค่าภาษาและหน้าจอ')}
              </button>
              <button
                type="button"
                onClick={() => setShellState('title')}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 text-xs rounded-lg cursor-pointer"
              >
                {tr('Return to Title Screen', 'กลับสู่หน้าจอหลัก')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 6 Phase 3.1: Official Club Unveiling Ceremony Modal */}
      {unveilingModalData && world.clubs[unveilingModalData.clubId] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="manager-unveiling-modal"
          role="dialog"
          aria-modal="true"
        >
          {(() => {
            const unveiledClub = world.clubs[unveilingModalData.clubId];
            return (
              <div
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
                style={{ borderTop: `4px solid ${unveiledClub.primaryColor}` }}
              >
                <div className="p-6 text-center space-y-4">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-[11px] font-bold">
                    📸 {tr('OFFICIAL PRESS PRESENTATION', 'งานแถลงข่าวเปิดตัวผู้จัดการทีมคนใหม่')}
                  </div>

                  <div className="flex items-center justify-center gap-6 py-2">
                    <ClubBadge club={unveiledClub} size="xl" showRing />
                    <TrophyArtwork competitionId={unveiledClub.leagueId} size="lg" />
                  </div>

                  <div>
                    <h2 className="text-xl font-display font-extrabold text-white">
                      {unveilingModalData.managerName}
                    </h2>
                    <p className="text-xs font-mono text-emerald-400 mt-0.5">
                      {tr(
                        `Appointed First-Team Manager of ${unveiledClub.name}`,
                        `ได้รับการแต่งตั้งเป็นผู้จัดการทีม ${unveiledClub.name} อย่างเป็นทางการ`
                      )}
                    </p>
                  </div>

                  <blockquote className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 italic leading-relaxed">
                    &ldquo;
                    {tr(
                      `Welcome to ${unveiledClub.stadiumName}, ${unveilingModalData.managerName}. The Board of Directors has full confidence in your ${world.manager.tacticalStyle} vision to guide ${unveiledClub.name} to a Top ${unveiledClub.boardExpectations.targetLeaguePosition} finish this season.`,
                      `ยินดีต้อนรับสู่สนาม ${unveiledClub.stadiumName} คุณ ${unveilingModalData.managerName} บอร์ดบริหารเชื่อมั่นอย่างเต็มเปี่ยมว่าปรัชญาฟุตบอล ${world.manager.tacticalStyle} ของคุณจะพา ${unveiledClub.name} ก้าวสู่อันดับ Top ${unveiledClub.boardExpectations.targetLeaguePosition} ในฤดูกาลนี้`
                    )}
                    &rdquo;
                  </blockquote>

                  <div className="grid grid-cols-3 gap-2.5 font-mono text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {tr('WARCHEST', 'งบเสริมทัพ')}
                      </div>
                      <div className="text-sm font-bold text-emerald-400">
                        €{(unveiledClub.finances.transferBudget / 1_000_000).toFixed(1)}M
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {tr('BOARD TARGET', 'เป้าหมายลีก')}
                      </div>
                      <div className="text-sm font-bold text-amber-300">
                        Top {unveiledClub.boardExpectations.targetLeaguePosition}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {tr('FORMATION', 'แผนหลัก')}
                      </div>
                      <div className="text-sm font-bold text-sky-400">
                        {unveiledClub.primaryTactic.formation}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="close-unveiling-modal-btn"
                    onClick={() => setUnveilingModalData(null)}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {tr('Enter the Dugout →', 'เข้าสู่ห้องทำงานผู้จัดการทีม →')}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Stage 6 Phase 3.2: End-of-Season Review & Champions Gala Modal */}
      {seasonGalaModalData && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="season-review-gala-modal"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">
                    🏆 {tr('END-OF-SEASON REVIEW GALA', 'สรุปผลงานประจำฤดูกาลและรางวัลเกียรติยศ')}
                  </div>
                  <h2 className="text-xl font-display font-extrabold text-white">
                    {seasonGalaModalData.completedSeason} → {seasonGalaModalData.nextSeason}
                  </h2>
                </div>
                <TrophyArtwork competitionId={controlledClub.leagueId} size="md" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('YOUR FINAL POSITION', 'อันดับในลีกของคุณ')}
                  </div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5">
                    #{seasonGalaModalData.finalPosition} ({seasonGalaModalData.leagueName})
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('LEAGUE CHAMPION', 'แชมป์ลีกประจำฤดูกาล')}
                  </div>
                  <div className="text-sm font-bold text-amber-300 mt-0.5 truncate">
                    🏆 {seasonGalaModalData.leagueChampionName}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('UEFA UCL WINNER', 'แชมป์ยูฟ่า แชมเปียนส์ลีก')}
                  </div>
                  <div className="text-sm font-bold text-sky-300 mt-0.5 truncate">
                    ⭐ {seasonGalaModalData.uclChampionName}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('CLUB TOP SCORER', 'ดาวซัลโวประจำสโมสร')}
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5 truncate">
                    ⚽ {seasonGalaModalData.clubTopScorerName} ({seasonGalaModalData.clubTopScorerGoals})
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('PLAYER OF THE SEASON', 'นักเตะยอดเยี่ยมสโมสร')}
                  </div>
                  <div className="text-sm font-bold text-emerald-300 mt-0.5 truncate">
                    🌟 {seasonGalaModalData.clubPlayerOfSeasonName} (
                    {seasonGalaModalData.clubPlayerOfSeasonRating})
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">
                    {tr('PRIZE & TV PAYOUT', 'เงินรางวัล + ค่าลิขสิทธิ์')}
                  </div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    +€{(seasonGalaModalData.totalPrizeAndTvPayout / 1_000_000).toFixed(1)}M
                  </div>
                </div>
              </div>

              <button
                type="button"
                data-testid="close-season-gala-modal-btn"
                onClick={() => setSeasonGalaModalData(null)}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer"
              >
                {tr(
                  `Begin ${seasonGalaModalData.nextSeason} Pre-Season →`,
                  `เข้าสู่การเตรียมทีมฤดูกาลใหม่ ${seasonGalaModalData.nextSeason} →`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stage 10 Phase 4: Live Championship Trophy Lift Celebration Modal */}
      <ChampionshipTrophyLiftModal
        data={trophyLiftModalData}
        club={trophyLiftModalData ? world.clubs[trophyLiftModalData.clubId] : null}
        onClose={() => setTrophyLiftModalData(null)}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-slate-900 border border-emerald-500/60 text-xs text-slate-100 shadow-2xl"
        >
          {toastMessage}
        </div>
      )}
      <SpeedInsights route={analyticsRoute} />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <TouchlineShell />
    </LanguageProvider>
  );
}
