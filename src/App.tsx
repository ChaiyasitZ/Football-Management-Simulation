/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Club,
  LeagueId,
  ManagerProfile,
  MatchResult,
  Player,
  PlayerRole,
  PositionGroup,
  TacticalSystem,
  WorldState,
} from './types/game';
import { createInitialWorldState } from './engine/worldGenerator';
import { ClubBadge } from './components/ClubBadge';
import {
  advanceWorldOneDay,
  buildScoutReportForPlayer,
  completeUserMatchdayAndSyncWorld,
  deleteSavedSlot,
  deleteSaveSlotFromFirestore,
  getSavedSlotsList,
  hireStaffMember,
  loadWorldStateFromFirestoreSlot,
  loadWorldStateFromSlot,
  recruitYouthAcademyProspect,
  renewPlayerContract,
  SaveSlotMeta,
  saveWorldStateToFirestoreSlot,
  saveWorldStateToSlot,
  submitAndEvaluateTransferOffer,
  syncUserSaveSlotsFromFirestore,
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
import { MatchCenterView } from './components/MatchCenterView';
import { TacticsView } from './components/TacticsView';
import { PlayerProfileModal, SquadView } from './components/SquadAndProfileModal';
import {
  ClubStaffYouthWorldView,
  CompetitionsAndScheduleView,
  DashboardView,
  InboxView,
  NavTab,
  ScoutingView,
  TrainingView,
  TransfersView,
} from './components/ManagementViews';

type ShellState = 'title' | 'playing' | 'paused';

const NAV_ITEMS: { id: NavTab; label: string; badgeKey?: 'inbox' }[] = [
  { id: 'dashboard', label: '01. Dashboard' },
  { id: 'inbox', label: '02. Inbox & Media', badgeKey: 'inbox' },
  { id: 'squad', label: '03. Squad' },
  { id: 'tactics', label: '04. Tactics' },
  { id: 'match', label: '05. Match Center' },
  { id: 'training', label: '06. Training' },
  { id: 'scouting', label: '07. Scouting' },
  { id: 'transfers', label: '08. Transfers' },
  { id: 'schedule', label: '09. Schedule' },
  { id: 'competitions', label: '10. Competitions' },
  { id: 'club', label: '11. Club & Finance' },
  { id: 'staff', label: '12. Staff' },
  { id: 'youth', label: '13. Youth Academy' },
  { id: 'world', label: '14. World (280 Clubs)' },
  { id: 'manager', label: '15. Manager & Save' },
];

export default function App() {
  const isAutostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [shellState, setShellState] = useState<ShellState>(
    isAutostart ? 'playing' : 'title'
  );
  const [world, setWorld] = useState<WorldState>(() => createInitialWorldState(20261110));
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>(() => getSavedSlotsList());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isAdvancingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Subscribe to Google / Gmail Auth state & sync Cloud Firestore save slots
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          await ensureUserProfileInFirestore(user);
          const cloudSlots = await syncUserSaveSlotsFromFirestore();
          setSaveSlots(cloudSlots);
        } catch (err) {
          console.error(err);
        }
      }
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      setAuthUser(user);
      const cloudSlots = await syncUserSaveSlotsFromFirestore();
      setSaveSlots(cloudSlots);
      showToast(`เข้าสู่ระบบด้วย Gmail (${user.email || user.displayName}) สำเร็จ! ซิงก์เซฟเกมบน Cloud แล้ว`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้';
      showToast(msg);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await signOutFromGoogle();
      setAuthUser(null);
      showToast('ออกจากระบบบัญชี Google / Gmail เรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
    }
  };

  // Sync document.body.dataset.state with shellState
  useEffect(() => {
    document.body.dataset.state = shellState;
  }, [shellState]);

  // Keyboard shortcuts in playing / paused states
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (selectedPlayerId) {
          setSelectedPlayerId(null);
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
      } else if ((e.key === 'c' || e.key === 'C') && shellState === 'playing' && !selectedPlayerId) {
        handleAdvanceDay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleQuickStart = () => {
    soundService.playClick();
    setShellState('playing');
  };

  const handleStartCustomCareer = (
    customManager: Partial<ManagerProfile>,
    clubId: string
  ) => {
    soundService.playWhistle();
    const freshWorld = createInitialWorldState(Date.now() % 1000000, customManager, clubId);
    setWorld(freshWorld);
    const updatedSlots = saveWorldStateToSlot('slot_autosave', freshWorld);
    setSaveSlots(updatedSlots);
    setActiveTab('dashboard');
    setShellState('playing');
    showToast(`เริ่มต้นอาชีพผู้จัดการทีมกับสโมสร ${freshWorld.clubs[clubId].name}!`);
  };

  const handleAdvanceDay = () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    try {
      soundService.playAdvanceDay();
      const { nextState, stoppedReason } = advanceWorldOneDay(world);
      setWorld(nextState);
      const updatedSlots = saveWorldStateToSlot('slot_autosave', nextState);
      setSaveSlots(updatedSlots);

      if (stoppedReason === 'USER_MATCHDAY') {
        setActiveTab('match');
        showToast(`ถึงวันแข่งขัน (Matchday) แล้ว! พร้อมลงสนามใน Match Center`);
      } else {
        showToast(`เดินเวลาสู่วันที่ ${nextState.gameDate} (Auto-saved)`);
      }
    } finally {
      isAdvancingRef.current = false;
    }
  };

  const handleAdvanceToNextMatchday = () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    try {
      soundService.playAdvanceDay();
      let curr = world;
      let steps = 0;
      while (steps < 10) {
        const res = advanceWorldOneDay(curr);
        curr = res.nextState;
        steps += 1;
        if (res.stoppedReason === 'USER_MATCHDAY') {
          break;
        }
      }
      setWorld(curr);
      const updatedSlots = saveWorldStateToSlot('slot_autosave', curr);
      setSaveSlots(updatedSlots);
      setActiveTab('match');
      showToast(`เดินเวลาสู่วันแข่งขัน ${curr.gameDate} เรียบร้อยแล้ว`);
    } finally {
      isAdvancingRef.current = false;
    }
  };

  const handleCompleteMatch = (fixtureId: string, result: MatchResult) => {
    const updated = completeUserMatchdayAndSyncWorld(world, fixtureId, result);
    setWorld(updated);
    const slots = saveWorldStateToSlot('slot_autosave', updated);
    setSaveSlots(slots);
    showToast(`บันทึกผลการแข่งขันและอัปเดตตารางคะแนนทั้ง 5 ลีกเรียบร้อยแล้ว!`);
  };

  const handleUpdateTactic = (tactic: TacticalSystem, isSecondary = false) => {
    const myClub = world.clubs[world.controlledClubId];
    const updatedClub: Club = {
      ...myClub,
      primaryTactic: isSecondary ? myClub.primaryTactic : tactic,
      secondaryTactic: isSecondary ? tactic : myClub.secondaryTactic,
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
  }) => {
    const res = submitAndEvaluateTransferOffer(world, params);
    setWorld(res.nextState);
    showToast(res.message);
    if (res.outcome === 'COMPLETED') {
      setSelectedPlayerId(null);
    }
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
    showToast(`อัปเดตตารางซ้อมรายบุคคลของ ${p.firstName} ${p.lastName} แล้ว`);
  };

  const handleToggleShortlist = (playerId: string) => {
    const exists = world.shortlistPlayerIds.includes(playerId);
    const updated = exists
      ? world.shortlistPlayerIds.filter((id) => id !== playerId)
      : [...world.shortlistPlayerIds, playerId];
    setWorld({ ...world, shortlistPlayerIds: updated });
    showToast(exists ? 'นำออกจาก Shortlist แล้ว' : 'เพิ่มเข้าสู่ Shortlist แล้ว');
  };

  const handleGenerateScoutReport = (playerId: string) => {
    const p = world.players[playerId];
    if (!p) return;
    const rep = buildScoutReportForPlayer(p, 'stf_head_scout', world.gameDate);
    setWorld({
      ...world,
      scoutReports: {
        ...world.scoutReports,
        [playerId]: rep,
      },
    });
    showToast(`ออกรายงานแมวมองของ ${p.firstName} ${p.lastName} เรียบร้อยแล้ว`);
  };

  const handleBoardRequest = (type: 'budget' | 'training_facility' | 'youth_facility') => {
    const club = { ...world.clubs[world.controlledClubId] };
    if (club.boardExpectations.confidence.overall < 60) {
      showToast('บอร์ดบริหารปฏิเสธคำร้องเนื่องจากต้องการเห็นผลงานในสนามที่ดีขึ้นก่อน');
      return;
    }
    if (type === 'budget') {
      club.finances = {
        ...club.finances,
        transferBudget: club.finances.transferBudget + 5_000_000,
      };
      showToast('บอร์ดบริหารอนุมัติงบซื้อขายเพิ่มเติม +€5.0M!');
    } else if (type === 'training_facility') {
      if (club.finances.balance < 3_500_000 || club.trainingFacilities >= 20) {
        showToast('ไม่สามารถอัปเกรดศูนย์ฝึกซ้อมได้ในขณะนี้');
        return;
      }
      club.finances = { ...club.finances, balance: club.finances.balance - 3_500_000 };
      club.trainingFacilities = Math.min(20, club.trainingFacilities + 1);
      showToast(`อัปเกรดศูนย์ฝึกซ้อมสู่ระดับ ${club.trainingFacilities}/20 สำเร็จ!`);
    } else {
      if (club.finances.balance < 2_500_000 || club.youthFacilities >= 20) {
        showToast('ไม่สามารถอัปเกรดศูนย์ฝึกเยาวชนได้ในขณะนี้');
        return;
      }
      club.finances = { ...club.finances, balance: club.finances.balance - 2_500_000 };
      club.youthFacilities = Math.min(20, club.youthFacilities + 1);
      showToast(`อัปเกรดศูนย์ฝึกเยาวชนสู่ระดับ ${club.youthFacilities}/20 สำเร็จ!`);
    }
    setWorld({ ...world, clubs: { ...world.clubs, [club.id]: club } });
  };

  if (shellState === 'title') {
    return (
      <TitleScreen
        world={world}
        saveSlots={saveSlots}
        authUser={authUser}
        onGoogleSignIn={handleGoogleSignIn}
        onGoogleSignOut={handleGoogleSignOut}
        onQuickStart={handleQuickStart}
        onStartCustomCareer={handleStartCustomCareer}
        onLoadSlot={async (slotId) => {
          const loaded = authUser
            ? await loadWorldStateFromFirestoreSlot(slotId)
            : loadWorldStateFromSlot(slotId);
          if (loaded) {
            setWorld(loaded);
            setShellState('playing');
            showToast(`โหลดเซฟเกม ${loaded.saveName} สำเร็จ!`);
          }
        }}
        onDeleteSlot={async (slotId) => {
          const updated = authUser
            ? await deleteSaveSlotFromFirestore(slotId)
            : deleteSavedSlot(slotId);
          setSaveSlots(updated);
        }}
      />
    );
  }

  const controlledClub = world.clubs[world.controlledClubId];
  const unreadCount = world.inbox.filter((n) => !n.isRead).length;
  const selectedPlayer = selectedPlayerId ? world.players[selectedPlayerId] : null;

  return (
    <div className="w-screen h-screen bg-slate-950 text-slate-100 flex overflow-hidden select-none">
      {/* Left Sidebar Navigation (Desktop-First Sports Management Shell) */}
      <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Brand Lockup */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <span className="font-display font-bold text-xl tracking-wider text-white">
              TOUCHLINE
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              {world.currentSeason}
            </span>
          </div>

          {/* Controlled Club Identity */}
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-2.5">
              <ClubBadge club={controlledClub} size="md" />
              <div className="truncate">
                <div className="text-xs font-bold text-white truncate">
                  {controlledClub.name}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  Mgr. {world.manager.name}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-210px)]" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    soundService.playClick();
                    setActiveTab(item.id);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-emerald-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badgeKey === 'inbox' && unreadCount > 0 && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        active ? 'text-slate-950 font-bold' : 'text-emerald-400 font-semibold'
                      }`}
                    >
                      ({unreadCount})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Utility Footer */}
        <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              const m = soundService.toggleMute();
              setIsMuted(m);
            }}
            className="px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono text-[11px] cursor-pointer"
            aria-label="Toggle Mute Audio"
          >
            {isMuted ? 'Audio: OFF [M]' : 'Audio: ON [M]'}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              setShellState('paused');
            }}
            className="px-2.5 py-1.5 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 font-mono text-[11px] cursor-pointer"
            aria-label="Open Game Menu"
          >
            Menu [Esc]
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar: Context Breadcrumb, Date & Primary Continue Action */}
        <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between gap-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-display font-bold text-white truncate">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label.replace(/^\d+\.\s*/, '')}
            </h1>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
              วันที่ในเกม: <strong className="text-slate-100">{world.gameDate}</strong>
            </span>
            <span className="hidden md:inline text-slate-600" aria-hidden="true">·</span>
            <span className="hidden md:inline text-xs text-slate-400 font-mono tabular-nums whitespace-nowrap">
              งบซื้อขาย: <strong className="text-emerald-400">€{(controlledClub.finances.transferBudget / 1_000_000).toFixed(1)}M</strong>
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleAdvanceToNextMatchday}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              ข้ามไปวันแข่ง (Next Matchday)
            </button>
            <button
              type="button"
              onClick={handleAdvanceDay}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              เดินเวลาต่อ (Continue) →
            </button>
          </div>
        </header>

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              world={world}
              onNavigate={setActiveTab}
              onSelectPlayer={setSelectedPlayerId}
              onAdvanceDay={handleAdvanceDay}
            />
          )}

          {activeTab === 'inbox' && (
            <InboxView
              world={world}
              onMarkRead={(newsId) => {
                setWorld({
                  ...world,
                  inbox: world.inbox.map((n) =>
                    n.id === newsId ? { ...n, isRead: true } : n
                  ),
                });
              }}
              onAnswerPressConference={(newsId, optionId) => {
                const item = world.inbox.find((n) => n.id === newsId);
                const opt = item?.pressConferenceOptions?.find((o) => o.id === optionId);
                if (!item || !opt) return;

                const updatedPlayers = { ...world.players };
                for (const p of Object.values(updatedPlayers)) {
                  if (p.clubId === controlledClub.id) {
                    updatedPlayers[p.id] = {
                      ...p,
                      morale: Math.max(20, Math.min(100, p.morale + opt.moraleDelta)),
                    };
                  }
                }

                const updatedClub: Club = {
                  ...controlledClub,
                  boardExpectations: {
                    ...controlledClub.boardExpectations,
                    confidence: {
                      ...controlledClub.boardExpectations.confidence,
                      overall: Math.max(
                        15,
                        Math.min(
                          100,
                          controlledClub.boardExpectations.confidence.overall + opt.boardDelta
                        )
                      ),
                    },
                  },
                };

                setWorld({
                  ...world,
                  players: updatedPlayers,
                  clubs: { ...world.clubs, [controlledClub.id]: updatedClub },
                  inbox: world.inbox.map((n) =>
                    n.id === newsId
                      ? { ...n, isRead: true, pressConferenceAnsweredId: optionId }
                      : n
                  ),
                });
                showToast(opt.mediaResponse);
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
                showToast('เพิ่มสกู๊ปข่าวใหม่ใน Inbox แล้ว');
              }}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'squad' && (
            <SquadView world={world} onSelectPlayer={setSelectedPlayerId} />
          )}

          {activeTab === 'tactics' && (
            <TacticsView
              world={world}
              onUpdateTactic={handleUpdateTactic}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'match' && (
            <MatchCenterView
              world={world}
              onCompleteMatch={handleCompleteMatch}
              onUpdateClubTactic={(tactic) => handleUpdateTactic(tactic, false)}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'training' && (
            <TrainingView
              world={world}
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
                showToast(`ตั้งค่าการซ้อมทีมเป็น ${focus} (${intensity}) เรียบร้อยแล้ว`);
              }}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {activeTab === 'scouting' && (
            <ScoutingView
              world={world}
              onSelectPlayer={setSelectedPlayerId}
              onCreateAssignment={(
                region: LeagueId | 'ALL_EUROPE',
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
                showToast('ส่งทีมแมวมองออกค้นหานักเตะตามเงื่อนไขที่กำหนดแล้ว');
              }}
              onGenerateScoutReport={handleGenerateScoutReport}
            />
          )}

          {activeTab === 'transfers' && (
            <TransfersView world={world} onSelectPlayer={setSelectedPlayerId} />
          )}

          {(activeTab === 'schedule' || activeTab === 'competitions') && (
            <CompetitionsAndScheduleView
              world={world}
              initialMode={activeTab}
              onSelectPlayer={setSelectedPlayerId}
            />
          )}

          {(activeTab === 'club' ||
            activeTab === 'staff' ||
            activeTab === 'youth' ||
            activeTab === 'world' ||
            activeTab === 'manager') && (
            <ClubStaffYouthWorldView
              mode={activeTab}
              world={world}
              saveSlots={saveSlots}
              authUser={authUser}
              onGoogleSignIn={handleGoogleSignIn}
              onGoogleSignOut={handleGoogleSignOut}
              onSelectPlayer={setSelectedPlayerId}
              onBoardRequest={handleBoardRequest}
              onHireStaff={(staffId) => {
                const res = hireStaffMember(world, staffId);
                setWorld(res.nextState);
                showToast(res.message);
              }}
              onRecruitYouth={() => {
                const next = recruitYouthAcademyProspect(world);
                setWorld(next);
                showToast('คัดเลือกดาวรุ่งใหม่เข้าสู่ศูนย์ฝึกเยาวชน U19 เรียบร้อยแล้ว!');
              }}
              onPromoteYouth={(playerId) => {
                const p = world.players[playerId];
                if (!p) return;
                setWorld({
                  ...world,
                  players: {
                    ...world.players,
                    [playerId]: {
                      ...p,
                      isYouthAcademy: false,
                      squadStatus: 'Breakthrough Prospect',
                    },
                  },
                });
                showToast(`ดัน ${p.firstName} ${p.lastName} ขึ้นสู่ทีมชุดใหญ่เรียบร้อยแล้ว!`);
              }}
              onSaveToSlot={async (slotId) => {
                const slots = authUser
                  ? await saveWorldStateToFirestoreSlot(slotId, world)
                  : saveWorldStateToSlot(slotId, world);
                setSaveSlots(slots);
                showToast(
                  authUser
                    ? `บันทึกเกมลง Cloud Firestore (${slotId}) สำเร็จ!`
                    : `บันทึกเกมลงช่อง ${slotId} สำเร็จ!`
                );
              }}
              onLoadSlot={async (slotId) => {
                const loaded = authUser
                  ? await loadWorldStateFromFirestoreSlot(slotId)
                  : loadWorldStateFromSlot(slotId);
                if (loaded) {
                  setWorld(loaded);
                  showToast(`โหลดเซฟเกมจาก ${slotId} เรียบร้อยแล้ว!`);
                }
              }}
            />
          )}
        </main>
      </div>

      {/* Player Profile Modal */}
      {selectedPlayer && (
        <PlayerProfileModal
          player={selectedPlayer}
          world={world}
          onClose={() => setSelectedPlayerId(null)}
          onRenewContract={handleRenewContract}
          onMakeTransferOffer={handleMakeTransferOffer}
          onUpdateIndividualTraining={handleUpdateIndividualTraining}
          onToggleShortlist={handleToggleShortlist}
          onGenerateScoutReport={handleGenerateScoutReport}
        />
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
            <div className="text-center">
              <h2 id="pause-modal-title" className="text-2xl font-display font-bold text-white">
                TOUCHLINE — GAME PAUSED
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {controlledClub.name} · วันที่ในเกม {world.gameDate}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">MATCHES</div>
                <div className="text-base font-bold text-white">
                  {world.manager.careerStats.matchesManaged}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">WINS</div>
                <div className="text-base font-bold text-emerald-400">
                  {world.manager.careerStats.won}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[10px] text-slate-400">CONFIDENCE</div>
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
                กลับเข้าสู่เกม (Resume Career)
              </button>
              <button
                type="button"
                onClick={() => {
                  const slots = saveWorldStateToSlot('slot_1', world);
                  setSaveSlots(slots);
                  showToast('บันทึกเกมลง Save Slot #1 สำเร็จ!');
                  setShellState('playing');
                }}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-xs rounded-lg cursor-pointer"
              >
                บันทึกเกมด่วน (Quick Save Slot #1)
              </button>
              <button
                type="button"
                onClick={() => setShellState('title')}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs rounded-lg cursor-pointer"
              >
                กลับสู่หน้าจอหลัก (Title Screen)
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
