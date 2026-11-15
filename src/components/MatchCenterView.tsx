import React, { useEffect, useState } from 'react';
import {
  Club,
  Fixture,
  HalfTimeTalkType,
  MatchEvent,
  MatchResult,
  Mentality,
  Player,
  TacticalSystem,
  TouchlineShoutType,
  WorldState,
} from '../types/game';
import {
  reconcileMatchResultEventsAndStats,
  simulateMatch,
} from '../engine/matchEngine';
import { computeTacticalPhaseCoordinates } from '../engine/tacticsEngine';
import { soundService } from '../engine/soundService';
import { ClubBadge } from './ClubBadge';
import { ClubKitJersey, CompetitionBadge, TrophyArtwork } from './TrophyAndKitVisuals';
import { useLanguage } from '../i18n/LanguageContext';

export type MatchTileType =
  | 'HEAT_MAP'
  | 'PASS_MAP'
  | 'XG_STORY'
  | 'SHOT_MAP'
  | 'MOMENTUM'
  | 'MATCH_EVENTS'
  | 'DUGOUT'
  | 'LIVE_TABLE'
  | 'LATEST_SCORES';

const TILE_STORAGE_KEY = 'fm27_match_tiles_v1';

const DEFAULT_TILES: [MatchTileType, MatchTileType, MatchTileType, MatchTileType, MatchTileType] = [
  'HEAT_MAP',
  'PASS_MAP',
  'XG_STORY',
  'LIVE_TABLE',
  'LATEST_SCORES',
];

interface MatchCenterViewProps {
  world: WorldState;
  activeFixture?: Fixture;
  onCompleteMatch: (fixtureId: string, result: MatchResult) => void;
  onUpdateClubTactic: (tactic: TacticalSystem) => void;
  onSelectPlayer: (playerId: string) => void;
  onExitMatchCenter?: () => void;
  onOpenTactics?: () => void;
}

export const MatchCenterView: React.FC<MatchCenterViewProps> = ({
  world,
  activeFixture,
  onCompleteMatch,
  onUpdateClubTactic,
  onSelectPlayer,
  onExitMatchCenter,
  onOpenTactics,
}) => {
  const { tr } = useLanguage();
  const myClub = world.clubs[world.controlledClubId];

  const initialFixture =
    activeFixture ||
    world.fixtures.find(
      (f) =>
        f.status === 'Scheduled' &&
        (f.homeClubId === myClub.id || f.awayClubId === myClub.id)
    ) ||
    world.fixtures
      .filter((f) => f.homeClubId === myClub.id || f.awayClubId === myClub.id)
      .slice(-1)[0];

  const [lockedFixtureId, setLockedFixtureId] = useState<string | undefined>(
    initialFixture?.id
  );

  const targetFixture =
    world.fixtures.find((f) => f.id === lockedFixtureId) || initialFixture;

  const nextScheduledFixture = world.fixtures.find(
    (f) =>
      f.status === 'Scheduled' &&
      (f.homeClubId === myClub.id || f.awayClubId === myClub.id)
  );

  const homeClub: Club = targetFixture ? world.clubs[targetFixture.homeClubId] : myClub;
  const awayClub: Club = targetFixture
    ? world.clubs[targetFixture.awayClubId]
    : Object.values(world.clubs).find((c) => c.id !== myClub.id)!;

  const isUserHome = homeClub.id === myClub.id;

  const [simResult, setSimResult] = useState<MatchResult | null>(() =>
    targetFixture?.result && targetFixture
      ? reconcileMatchResultEventsAndStats(
          targetFixture,
          homeClub,
          awayClub,
          targetFixture.result,
          targetFixture.result.events
        )
      : null
  );
  const maxMatchMinute = simResult?.extraTimePlayed ? 120 : 90;

  const [currentMinute, setCurrentMinute] = useState<number>(
    targetFixture?.status === 'Completed' ? (targetFixture.result?.extraTimePlayed ? 120 : 90) : 0
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(2);
  const [liveMentality, setLiveMentality] = useState<Mentality>(
    myClub.primaryTactic.instructions.mentality
  );
  const [teamTalkGiven, setTeamTalkGiven] = useState<string | null>(null);
  const [tacticalSummary, setTacticalSummary] = useState<string | null>(null);
  const [committedToWorld, setCommittedToWorld] = useState<boolean>(
    targetFixture?.status === 'Completed'
  );
  const [liveSubstitutions, setLiveSubstitutions] = useState<
    { minute: number; teamId: string; playerOutId: string; playerInId: string }[]
  >([]);
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [liveShouts, setLiveShouts] = useState<
    { minute: number; teamId: string; shout: TouchlineShoutType }[]
  >([]);
  const [lastShoutMinute, setLastShoutMinute] = useState<number>(-20);
  const [activeShotTooltip, setActiveShotTooltip] = useState<MatchEvent | null>(null);
  const [showInstructionsDrawer, setShowInstructionsDrawer] = useState<boolean>(false);
  const [tileTeamFilter, setTileTeamFilter] = useState<'both' | 'home' | 'away'>('both');
  const [postMatchTalkGiven, setPostMatchTalkGiven] = useState<string | null>(null);

  // 5 Swappable Analytics Tiles persisted in localStorage
  const [tiles, setTiles] = useState<
    [MatchTileType, MatchTileType, MatchTileType, MatchTileType, MatchTileType]
  >(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(TILE_STORAGE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === 5) {
          return parsed as [MatchTileType, MatchTileType, MatchTileType, MatchTileType, MatchTileType];
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_TILES;
  });

  const handleTileChange = (index: 0 | 1 | 2 | 3 | 4, nextType: MatchTileType) => {
    setTiles((prev) => {
      const updated = [...prev] as [
        MatchTileType,
        MatchTileType,
        MatchTileType,
        MatchTileType,
        MatchTileType,
      ];
      updated[index] = nextType;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(TILE_STORAGE_KEY, JSON.stringify(updated));
        }
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  };

  // Sync when lockedFixtureId or targetFixture completion status changes
  useEffect(() => {
    if (!targetFixture) return;
    if (targetFixture.status === 'Completed' && targetFixture.result) {
      setSimResult(
        reconcileMatchResultEventsAndStats(
          targetFixture,
          homeClub,
          awayClub,
          targetFixture.result,
          targetFixture.result.events
        )
      );
      setCurrentMinute(targetFixture.result.extraTimePlayed ? 120 : 90);
      setIsPlaying(false);
      setCommittedToWorld(true);
    } else if (targetFixture.status === 'Scheduled') {
      setSimResult(null);
      setCurrentMinute(0);
      setIsPlaying(false);
      setCommittedToWorld(false);
      setTeamTalkGiven(null);
      setTacticalSummary(null);
      setLiveSubstitutions([]);
      setSelectedSubOutId(null);
      setLiveShouts([]);
      setLastShoutMinute(-20);
      setPostMatchTalkGiven(null);
    }
  }, [lockedFixtureId, targetFixture?.status, targetFixture?.result]);

  // Pre-compute match simulation when kickoff starts
  const ensureSimulationComputed = (): MatchResult => {
    if (simResult) return simResult;
    const customTactic: TacticalSystem = {
      ...myClub.primaryTactic,
      instructions: {
        ...myClub.primaryTactic.instructions,
        mentality: liveMentality,
      },
    };
    const matchSeed =
      world.randomSeed + (targetFixture?.matchday || 1) * 7919 + (targetFixture?.id.length || 5) * 31;
    const computed = simulateMatch(
      targetFixture!,
      homeClub,
      awayClub,
      world.players,
      matchSeed,
      isUserHome ? customTactic : undefined,
      !isUserHome ? customTactic : undefined,
      { substitutions: liveSubstitutions, touchlineShouts: liveShouts }
    );
    setSimResult(computed);
    return computed;
  };

  // Minute progression timer when playing live
  useEffect(() => {
    if (!isPlaying || !simResult) return;
    const intervalMs = speed === 4 ? 70 : speed === 2 ? 140 : 260;
    const endMinute = simResult.extraTimePlayed ? 120 : 90;

    const timer = setInterval(() => {
      setCurrentMinute((prev) => {
        if (prev >= endMinute) {
          setIsPlaying(false);
          soundService.playWhistle();
          return endMinute;
        }
        const nextMin = prev + 1;
        const ev = simResult.events.find((e) => e.minute === nextMin);
        if (ev && ev.eventType === 'Goal') {
          soundService.playGoalCheer();
        }

        // Pause at Half-Time (45') if team talk not yet given
        if (nextMin === 45 && !teamTalkGiven) {
          setIsPlaying(false);
          soundService.playWhistle();
        }
        return nextMin;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, simResult, speed, teamTalkGiven]);

  // Auto-commit match result to WorldState when reaching full-time (90' or 120')
  useEffect(() => {
    if (
      simResult &&
      currentMinute >= (simResult.extraTimePlayed ? 120 : 90) &&
      targetFixture &&
      !committedToWorld
    ) {
      setCommittedToWorld(true);
      onCompleteMatch(targetFixture.id, simResult);
    }
  }, [currentMinute, simResult, targetFixture, committedToWorld, onCompleteMatch]);

  const handleStartOrTogglePlay = () => {
    soundService.playWhistle();
    const computed = ensureSimulationComputed();
    const endMin = computed.extraTimePlayed ? 120 : 90;
    if (currentMinute >= endMin) return;
    setIsPlaying((p) => !p);
  };

  const handleInstantResult = () => {
    soundService.playWhistle();
    const computed = ensureSimulationComputed();
    const endMin = computed.extraTimePlayed ? 120 : 90;
    setIsPlaying(false);
    setCurrentMinute(endMin);
    if (targetFixture && !committedToWorld) {
      setCommittedToWorld(true);
      onCompleteMatch(targetFixture.id, computed);
    }
  };

  const handleJumpToHalfTime = () => {
    soundService.playWhistle();
    ensureSimulationComputed();
    setIsPlaying(false);
    setCurrentMinute(45);
  };

  const reSimulateRemainingMinutes = (
    updatedTactic: TacticalSystem,
    extraSubs: { minute: number; teamId: string; playerOutId: string; playerInId: string }[],
    customEvent?: MatchEvent,
    teamTalkBoost?: number,
    extraShouts?: { minute: number; teamId: string; shout: TouchlineShoutType }[],
    halfTimeTalkChoice?: HalfTimeTalkType
  ) => {
    if (!targetFixture) return;
    const shoutsToUse = extraShouts ?? liveShouts;
    const reSeed =
      world.randomSeed +
      currentMinute * 313 +
      extraSubs.length * 97 +
      shoutsToUse.length * 53 +
      (halfTimeTalkChoice ? halfTimeTalkChoice.length * 41 : 0) +
      updatedTactic.instructions.mentality.length * 19;
    const newSim = simulateMatch(
      targetFixture,
      homeClub,
      awayClub,
      world.players,
      reSeed,
      isUserHome ? updatedTactic : undefined,
      !isUserHome ? updatedTactic : undefined,
      {
        substitutions: extraSubs,
        touchlineShouts: shoutsToUse,
        teamTalkBoostHome: isUserHome ? teamTalkBoost : undefined,
        teamTalkBoostAway: !isUserHome ? teamTalkBoost : undefined,
        halfTimeTalk: halfTimeTalkChoice
          ? {
              home: isUserHome ? halfTimeTalkChoice : undefined,
              away: !isUserHome ? halfTimeTalkChoice : undefined,
            }
          : undefined,
      }
    );
    const pastEvents = (simResult?.events || []).filter((e) => e.minute <= currentMinute);
    const futureEvents = newSim.events.filter((e) => e.minute > currentMinute);
    const mergedEvents: MatchEvent[] = [
      ...pastEvents,
      ...(customEvent ? [customEvent] : []),
      ...futureEvents,
    ];

    const reconciled = reconcileMatchResultEventsAndStats(
      targetFixture,
      homeClub,
      awayClub,
      newSim,
      mergedEvents
    );
    setSimResult(reconciled);
  };

  const handleTouchlineShout = (shout: TouchlineShoutType) => {
    if (!targetFixture || currentMinute <= 0 || currentMinute >= maxMatchMinute) return;
    if (currentMinute - lastShoutMinute < 15) return;

    const nextShouts = [...liveShouts, { minute: currentMinute, teamId: myClub.id, shout }];
    setLiveShouts(nextShouts);
    setLastShoutMinute(currentMinute);

    const shoutDescriptions: Record<TouchlineShoutType, { en: string; th: string }> = {
      Encourage: {
        en: 'players feel lifted and push forward with renewed belief!',
        th: 'นักเตะได้รับกำลังใจและฮึกเหิมเดินหน้าสู้ต่อ!',
      },
      'Demand More': {
        en: 'players step up their pressing tempo and attacking urgency!',
        th: 'นักเตะเร่งจังหวะเพรสซิ่งและใส่ความมุ่งมั่นในเกมรุกมากขึ้น!',
      },
      'Calm Down': {
        en: 'players regain composure and reduce reckless challenges.',
        th: 'นักเตะตั้งสติควบคุมอารมณ์และลดการเข้าพรวดเสียฟาวล์',
      },
      Focus: {
        en: 'defensive line sharpens concentration and positional discipline!',
        th: 'แผงหลังตั้งสมาธิและรักษาวินัยเกมรับอย่างรัดกุม!',
      },
      Praise: {
        en: 'squad confidence soars following touchline praise from the manager!',
        th: 'ความมั่นใจของทีมพุ่งสูงขึ้นหลังได้รับคำชมจากข้างสนาม!',
      },
    };

    reSimulateRemainingMinutes(
      myClub.primaryTactic,
      liveSubstitutions,
      {
        id: `shout_${currentMinute}_${shout}`,
        fixtureId: targetFixture.id,
        minute: currentMinute,
        eventType: 'TacticalChange',
        teamId: myClub.id,
        text: tr(
          `Min ${currentMinute}': Touchline Shout [${shout}] (${myClub.shortName}) — ${shoutDescriptions[shout].en}`,
          `นาที ${currentMinute}': ตะโกนสั่งการข้างสนาม [${shout}] (${myClub.shortName}) — ${shoutDescriptions[shout].th}`
        ),
        pitchX: 50,
        pitchY: 50,
      },
      undefined,
      nextShouts
    );
  };

  const handleMentalityChange = (newMentality: Mentality) => {
    setLiveMentality(newMentality);
    const updatedTactic: TacticalSystem = {
      ...myClub.primaryTactic,
      instructions: {
        ...myClub.primaryTactic.instructions,
        mentality: newMentality,
      },
    };
    onUpdateClubTactic(updatedTactic);
    if (targetFixture && currentMinute > 0 && currentMinute < maxMatchMinute) {
      reSimulateRemainingMinutes(updatedTactic, liveSubstitutions, {
        id: `tac_chg_${currentMinute}`,
        fixtureId: targetFixture.id,
        minute: currentMinute,
        eventType: 'TacticalChange',
        teamId: myClub.id,
        text: tr(
          `Minute ${currentMinute}': ${myClub.shortName} adjusted touchline Mentality to "${newMentality}"`,
          `นาที ${currentMinute}': ${myClub.shortName} ปรับแท็กติก Mentality เป็น "${newMentality}" ข้างสนาม`
        ),
        pitchX: 50,
        pitchY: 50,
      });
    }
  };

  const handleMakeSubstitution = (playerOutId: string, playerInId: string) => {
    if (liveSubstitutions.length >= 5 || currentMinute >= maxMatchMinute) return;
    const pOut = world.players[playerOutId];
    const pIn = world.players[playerInId];
    if (!pOut || !pIn) return;

    const subMinute = Math.max(1, currentMinute);
    const newSub = {
      minute: subMinute,
      teamId: myClub.id,
      playerOutId,
      playerInId,
    };
    const nextSubs = [...liveSubstitutions, newSub];
    setLiveSubstitutions(nextSubs);
    setSelectedSubOutId(null);

    const updatedTactic: TacticalSystem = {
      ...myClub.primaryTactic,
      lineup: myClub.primaryTactic.lineup.map((s) =>
        s.playerId === playerOutId ? { ...s, playerId: playerInId } : s
      ),
      benchPlayerIds: myClub.primaryTactic.benchPlayerIds.map((bId) =>
        bId === playerInId ? playerOutId : bId
      ),
    };
    onUpdateClubTactic(updatedTactic);

    if (targetFixture && currentMinute > 0) {
      reSimulateRemainingMinutes(updatedTactic, nextSubs, {
        id: `sub_${subMinute}_${playerInId}`,
        fixtureId: targetFixture.id,
        minute: subMinute,
        eventType: 'Substitution',
        teamId: myClub.id,
        playerId: pIn.id,
        playerName: `${pIn.firstName} ${pIn.lastName}`,
        secondaryPlayerId: pOut.id,
        secondaryPlayerName: `${pOut.firstName} ${pOut.lastName}`,
        text: tr(
          `Min ${subMinute}': Substitution (${myClub.shortName}) — ${pIn.firstName} ${pIn.lastName} comes on for ${pOut.firstName} ${pOut.lastName}.`,
          `นาที ${subMinute}': เปลี่ยนตัว (${myClub.shortName}) — ส่ง ${pIn.firstName} ${pIn.lastName} ลงสนามแทน ${pOut.firstName} ${pOut.lastName}`
        ),
        pitchX: 50,
        pitchY: 95,
      });
    }
  };

  const visibleEvents = simResult
    ? simResult.events.filter((e) => e.minute <= currentMinute)
    : [];

  const visibleHomeGoals = visibleEvents.filter(
    (e) => e.eventType === 'Goal' && e.teamId === homeClub.id
  ).length;
  const visibleAwayGoals = visibleEvents.filter(
    (e) => e.eventType === 'Goal' && e.teamId === awayClub.id
  ).length;

  const progressRatio = Math.max(0.05, Math.min(1, currentMinute / maxMatchMinute));

  const handleGenerateTacticalSummary = () => {
    if (!simResult) return;
    const homePoss = simResult.homeStats.possession;
    const awayPoss = simResult.awayStats.possession;
    const homeXG = (simResult.homeStats.xG * progressRatio).toFixed(2);
    const awayXG = (simResult.awayStats.xG * progressRatio).toFixed(2);
    const goalEvents = visibleEvents.filter((e) => e.eventType === 'Goal');
    const scorersText =
      goalEvents.length > 0
        ? tr(
            `Key goals scored at ${goalEvents.map((g) => `${g.minute}'`).join(', ')}`,
            `จังหวะทำประตูสำคัญเกิดขึ้นในนาทีที่ ${goalEvents.map((g) => `${g.minute}'`).join(', ')}`
          )
        : tr(
            'Both sides remain locked in a tight midfield battle with no goals yet',
            'ทั้งสองทีมยังสู้กันอย่างสูสีในแดนกลางและยังไม่มีประตูเกิดขึ้น'
          );
    setTacticalSummary(
      tr(
        `Tactical Overview (${currentMinute}'): ${homeClub.name} ${visibleHomeGoals} - ${visibleAwayGoals} ${awayClub.name} · Possession ${homePoss}% vs ${awayPoss}% · Expected Goals (xG) ${homeXG} vs ${awayXG} · ${scorersText}`,
        `สรุปภาพรวมแท็กติก (นาที ${currentMinute}'): ${homeClub.name} ${visibleHomeGoals} - ${visibleAwayGoals} ${awayClub.name} · ครองบอล ${homePoss}% ต่อ ${awayPoss}% · ค่าคาดหวังประตู (xG) ${homeXG} ต่อ ${awayXG} · ${scorersText}`
      )
    );
  };

  const myStarters: Player[] = myClub.primaryTactic.lineup
    .map((s) => (s.playerId ? world.players[s.playerId] : null))
    .filter((p): p is Player => Boolean(p));

  const myBench: Player[] = myClub.primaryTactic.benchPlayerIds
    .map((id) => world.players[id])
    .filter(
      (p): p is Player =>
        Boolean(p) && !p.injuryStatus.isInjured && (p.suspensionMatchesRemaining || 0) <= 0
    );

  // Assistant Manager Co-Pilot calculations
  const myGoals = isUserHome ? visibleHomeGoals : visibleAwayGoals;
  const oppGoals = isUserHome ? visibleAwayGoals : visibleHomeGoals;
  const mostFatiguedStarter = [...myStarters].sort((a, b) => a.fitness - b.fitness)[0];
  const liveConditionLow = mostFatiguedStarter
    ? Math.max(
        35,
        Math.round(
          mostFatiguedStarter.fitness -
            (currentMinute / 90) * (24 - mostFatiguedStarter.attributes.physical.stamina * 0.5)
        )
      )
    : 90;
  const bestBenchReplacement =
    mostFatiguedStarter && myBench.length > 0
      ? myBench.find((b) => b.positions[0] === mostFatiguedStarter.positions[0]) || myBench[0]
      : null;

  const shouldSub =
    currentMinute >= 55 &&
    liveConditionLow < 72 &&
    liveSubstitutions.length < 5 &&
    Boolean(mostFatiguedStarter && bestBenchReplacement);

  const recommendedMentality: Mentality =
    myGoals < oppGoals
      ? 'Attacking'
      : myGoals > oppGoals && currentMinute >= 70
        ? 'Cautious'
        : 'Positive';

  const adviceText = shouldSub
    ? tr(
        `AssMan Advice: ${mostFatiguedStarter.lastName} is fatigued (${liveConditionLow}%). Sub in ${bestBenchReplacement!.lastName} (${bestBenchReplacement!.positions[0]}) & switch to "${recommendedMentality}".`,
        `คำแนะนำผู้ช่วยโค้ช: ${mostFatiguedStarter.lastName} เริ่มอ่อนล้า (${liveConditionLow}%) แนะนำส่ง ${bestBenchReplacement!.lastName} (${bestBenchReplacement!.positions[0]}) ลงแทน และปรับเป็น "${recommendedMentality}"`
      )
    : myGoals < oppGoals
      ? tr(
          `AssMan Advice: Trailing ${myGoals}-${oppGoals}. Shift Mentality to "Attacking" and issue a "Demand More" shout!`,
          `คำแนะนำผู้ช่วยโค้ช: ตามหลัง ${myGoals}-${oppGoals} แนะนำปรับเป็น "Attacking" พร้อมตะโกนสั่งการ "Demand More"!`
        )
      : myGoals > oppGoals && currentMinute >= 70
        ? tr(
            `AssMan Advice: Protect our ${myGoals}-${oppGoals} lead by shifting to "Cautious" and issuing a "Focus" shout.`,
            `คำแนะนำผู้ช่วยโค้ช: รักษาสกอร์นำ ${myGoals}-${oppGoals} ช่วงท้ายเกมด้วยการปรับเป็น "Cautious" และสั่งการ "Focus"`
          )
        : tr(
            `AssMan Advice: Control midfield tempo with "${recommendedMentality}" mentality and issue an "Encourage" boost.`,
            `คำแนะนำผู้ช่วยโค้ช: คุมจังหวะแดนกลางด้วย "${recommendedMentality}" พร้อมกระตุ้นลูกทีมด้วย "Encourage"`
          );

  const applyAssManAdvice = () => {
    if (currentMinute === 0) {
      ensureSimulationComputed();
    }
    if (shouldSub && mostFatiguedStarter && bestBenchReplacement) {
      handleMakeSubstitution(mostFatiguedStarter.id, bestBenchReplacement.id);
    }
    handleMentalityChange(recommendedMentality);
    if (currentMinute > 0 && currentMinute - lastShoutMinute >= 15) {
      handleTouchlineShout(
        myGoals < oppGoals ? 'Demand More' : myGoals > oppGoals ? 'Focus' : 'Encourage'
      );
    }
  };

  // Track sent-off players up to currentMinute so 10-man impact is reflected on pitch and formations
  const sentOffPlayerIds = new Set(
    visibleEvents
      .filter((e) => e.eventType === 'RedCard' && e.playerId)
      .map((e) => e.playerId!)
  );

  const getShortRoleCode = (role: string): string => {
    const map: Record<string, string> = {
      Goalkeeper: 'GK',
      'Sweeper Keeper': 'SK',
      'Full Back': 'FB',
      'Wing Back': 'WB',
      'Complete Wing Back': 'CWB',
      'Inverted Wing Back': 'IWB',
      'Central Defender': 'CD',
      'Ball Playing Defender': 'BPD',
      'No-Nonsense Centre Back': 'NCB',
      'Defensive Midfielder': 'DM',
      Anchor: 'ANC',
      'Half Back': 'HB',
      'Deep-Lying Playmaker': 'DLP',
      'Central Midfielder': 'CM',
      'Box-to-Box Midfielder': 'BBM',
      'Ball Winning Midfielder': 'BWM',
      'Advanced Playmaker': 'AP',
      Mezzala: 'MEZ',
      Carrilero: 'CAR',
      'Attacking Midfielder': 'AM',
      Trequartista: 'TRQ',
      'Shadow Striker': 'SS',
      Winger: 'W',
      'Inverted Winger': 'IW',
      'Inside Forward': 'IF',
      'Wide Playmaker': 'WP',
      'False 9': 'F9',
      'Deep-Lying Forward': 'DLF',
      'Advanced Forward': 'AF',
      'Pressing Forward': 'PF',
      'Target Forward': 'TF',
      'Complete Forward': 'CF',
    };
    return map[role] || role.slice(0, 3).toUpperCase();
  };

  // Render Vertical Formation Pitch for Left/Right Flanks (FM27 IP Pitch with Jersey Silhouette & Real Numbers)
  const renderVerticalFormationPitch = (club: Club, side: 'home' | 'away') => {
    const isMyTeam = club.id === myClub.id;
    const phaseCoords = computeTacticalPhaseCoordinates(
      club.primaryTactic,
      currentMinute === 0 ? 'base' : 'in_possession'
    );

    return (
      <div
        data-testid={`flank-formation-${side}`}
        className="bg-slate-900/95 border border-slate-800 rounded-xl p-2 flex flex-col h-[54%] min-h-[240px] overflow-hidden"
      >
        <div
          className="flex items-center justify-between px-2 py-1 rounded-t-lg border-b border-slate-800 mb-1.5 shrink-0"
          style={{
            borderLeft: `3px solid ${club.primaryColor}`,
          }}
        >
          <div className="flex items-center gap-1.5 truncate">
            <ClubBadge club={club} size="sm" />
            <div className="truncate">
              <div className="text-xs font-display font-bold text-white uppercase truncate">
                {club.shortName} · {club.primaryTactic.formation}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {tr('In Possession (IP)', 'ผังการยืนเมื่อครองบอล')}
              </div>
            </div>
          </div>
          <ClubKitJersey club={club} variant={side} size="sm" />
        </div>

        {/* Vertical Pitch SVG with 11 Players in Kit Jerseys */}
        <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden border border-slate-800 bg-[#0c4a34]">
          <svg viewBox="0 0 68 100" preserveAspectRatio="none" className="w-full h-full">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => (
              <rect
                key={idx}
                x={0}
                y={idx * 12.5}
                width={68}
                height={12.5}
                fill={idx % 2 === 0 ? '#0c4a34' : '#0f543c'}
              />
            ))}
            <rect x="3" y="3" width="62" height="94" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
            <line x1="3" y1="50" x2="65" y2="50" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
            <circle cx="34" cy="50" r="8" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
            <rect x="16" y="3" width="36" height="14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
            <rect x="16" y="83" width="36" height="14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />

            {phaseCoords.map((coord, idx) => {
              const slot = club.primaryTactic.lineup[idx];
              const p = slot?.playerId ? world.players[slot.playerId] : null;
              if (!p) return null;
              const cx = 5 + (Math.max(8, Math.min(92, coord.x)) / 100) * 58;
              const cy = 6 + (Math.max(8, Math.min(92, coord.y)) / 100) * 86;
              const rating = simResult?.playerRatings[p.id] ?? 6.8;
              const liveCond = Math.max(
                35,
                Math.round(
                  p.fitness - (currentMinute / 90) * (24 - p.attributes.physical.stamina * 0.5)
                )
              );
              const goalsCount = visibleEvents.filter(
                (e) => e.eventType === 'Goal' && e.playerId === p.id
              ).length;
              const hasYellow = visibleEvents.some(
                (e) => e.eventType === 'YellowCard' && e.playerId === p.id
              );
              const isSentOff = sentOffPlayerIds.has(p.id);
              const shirtNum = p.shirtNumber || idx + 1;
              const roleShort = getShortRoleCode(slot.role);

              return (
                <g
                  key={p.id}
                  opacity={isSentOff ? 0.45 : 1}
                  onClick={() => {
                    if (isMyTeam && liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && !isSentOff) {
                      setSelectedSubOutId(selectedSubOutId === p.id ? null : p.id);
                    } else {
                      onSelectPlayer(p.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {/* Mini Kit Jersey Silhouette */}
                  <path
                    d={`M ${cx - 2.3} ${cy - 3.8} L ${cx - 4.4} ${cy - 2.2} L ${cx - 3.6} ${cy - 0.5} L ${cx - 2.6} ${cy - 1.1} L ${cx - 2.6} ${cy + 3.4} L ${cx + 2.6} ${cy + 3.4} L ${cx + 2.6} ${cy - 1.1} L ${cx + 3.6} ${cy - 0.5} L ${cx + 4.4} ${cy - 2.2} L ${cx + 2.3} ${cy - 3.8} Z`}
                    fill={idx === 0 ? '#f59e0b' : club.primaryColor}
                    stroke={selectedSubOutId === p.id ? '#facc15' : '#ffffff'}
                    strokeWidth={selectedSubOutId === p.id ? '1.1' : '0.6'}
                  />
                  {/* Real Squad Number */}
                  <text
                    x={cx}
                    y={cy + 1.2}
                    textAnchor="middle"
                    fontSize="3.1"
                    fontWeight="bold"
                    fill="#ffffff"
                  >
                    {shirtNum}
                  </text>
                  {/* Role Code Pill (Left) */}
                  <rect
                    x={cx - 9.2}
                    y={cy - 5.2}
                    width="6.4"
                    height="3.4"
                    rx="0.9"
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="0.35"
                  />
                  <text
                    x={cx - 6.0}
                    y={cy - 2.8}
                    textAnchor="middle"
                    fontSize="2.1"
                    fontWeight="bold"
                    fill="#94a3b8"
                  >
                    {roleShort}
                  </text>
                  {/* Rating Pill (Right) */}
                  <rect
                    x={cx + 2.8}
                    y={cy - 5.2}
                    width="7.2"
                    height="3.6"
                    rx="1"
                    fill={
                      isSentOff
                        ? '#e11d48'
                        : rating >= 7.4
                          ? '#10b981'
                          : rating >= 6.5
                            ? '#1e293b'
                            : '#f59e0b'
                    }
                  />
                  <text
                    x={cx + 6.4}
                    y={cy - 2.6}
                    textAnchor="middle"
                    fontSize="2.5"
                    fontWeight="bold"
                    fill="#ffffff"
                  >
                    {isSentOff ? 'RED' : currentMinute === 0 ? '6.8' : rating.toFixed(1)}
                  </text>
                  {/* Condition Bar */}
                  <rect x={cx - 4} y={cy + 4.2} width="8" height="1.1" rx="0.5" fill="#0f172a" />
                  <rect
                    x={cx - 4}
                    y={cy + 4.2}
                    width={(liveCond / 100) * 8}
                    height="1.1"
                    rx="0.5"
                    fill={liveCond < 65 ? '#f43f5e' : '#34d399'}
                  />
                  {/* Player Surname */}
                  <text
                    x={cx}
                    y={cy + 7.9}
                    textAnchor="middle"
                    fontSize="2.7"
                    fontWeight="700"
                    fill="#f8fafc"
                  >
                    {p.lastName.slice(0, 8)}
                    {goalsCount > 0 ? ' ⚽' : ''}
                    {isSentOff ? ' 🟥' : hasYellow ? ' 🟨' : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  // Render any of the 9 swappable tile views
  const renderSwappableTile = (tileIndex: 0 | 1 | 2 | 3 | 4, containerClassName: string) => {
    const activeType = tiles[tileIndex];

    const tileOptions: { id: MatchTileType; labelEn: string; labelTh: string }[] = [
      { id: 'HEAT_MAP', labelEn: 'HEAT MAP', labelTh: 'แผนผังพื้นที่ครองบอล (Heat Map)' },
      { id: 'PASS_MAP', labelEn: 'PASS MAP', labelTh: 'เครือข่ายการต่อบอล (Pass Map)' },
      { id: 'XG_STORY', labelEn: 'xG GRAPH STORY', labelTh: 'กราฟขั้นบันได xG (xG Story)' },
      { id: 'SHOT_MAP', labelEn: 'SHOT MAP', labelTh: 'แผนผังจุดยิงประตู (Shot Map)' },
      { id: 'MOMENTUM', labelEn: 'MATCH MOMENTUM', labelTh: 'โมเมนตัมราย 15 นาที' },
      { id: 'MATCH_EVENTS', labelEn: 'MATCH COMMENTARY', labelTh: 'บรรยายสดเหตุการณ์' },
      { id: 'DUGOUT', labelEn: 'ASSMAN DUGOUT & SUBS', labelTh: 'ซุ้มม้านั่งสำรอง & ผู้ช่วยโค้ช' },
      { id: 'LIVE_TABLE', labelEn: 'LIVE TABLE', labelTh: 'ตารางคะแนนสด (Live Table)' },
      { id: 'LATEST_SCORES', labelEn: 'LATEST SCORES', labelTh: 'ผลคู่อื่นสด (Latest Scores)' },
    ];

    const supportsFilter =
      activeType === 'HEAT_MAP' || activeType === 'PASS_MAP' || activeType === 'SHOT_MAP';

    return (
      <div
        data-testid={`fm27-tile-${tileIndex + 1}`}
        className={`bg-slate-900/95 border border-slate-800 rounded-xl p-2.5 flex flex-col min-h-0 overflow-hidden ${containerClassName}`}
      >
        {/* Tile Header with Swappable Dropdown + Home/Away/Both Filter */}
        <div className="flex items-center justify-between gap-1.5 pb-1.5 mb-1.5 border-b border-slate-800/90 shrink-0">
          <select
            aria-label={`Select view for Tile ${tileIndex + 1}`}
            data-testid={`match-tile-select-${tileIndex + 1}`}
            value={activeType}
            onChange={(e) => handleTileChange(tileIndex, e.target.value as MatchTileType)}
            className="bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded px-2 py-0.5 text-xs font-display font-bold tracking-wider text-emerald-400 uppercase cursor-pointer focus:outline-none min-w-0 flex-1 truncate"
          >
            {tileOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {tr(opt.labelEn, opt.labelTh)} ▾
              </option>
            ))}
          </select>
          {supportsFilter ? (
            <div className="flex items-center gap-0.5 bg-slate-950 border border-slate-800 rounded p-0.5 shrink-0">
              {(
                [
                  { id: 'both', label: 'ALL' },
                  { id: 'home', label: homeClub.shortName.slice(0, 3).toUpperCase() },
                  { id: 'away', label: awayClub.shortName.slice(0, 3).toUpperCase() },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTileTeamFilter(f.id)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                    tileTeamFilter === f.id
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : (
            tileIndex < 3 && (
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {homeClub.shortName} vs {awayClub.shortName}
              </span>
            )
          )}
        </div>

        {/* Tile Body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeType === 'HEAT_MAP' && (() => {
            const cols = 6;
            const rows = 4;
            const homePoss = simResult ? simResult.homeStats.possession : 52;
            const focusClub = tileTeamFilter === 'away' ? awayClub : homeClub;
            const focusCoords = computeTacticalPhaseCoordinates(
              focusClub.primaryTactic,
              'in_possession'
            );
            return (
              <div className="h-full flex flex-col justify-between">
                <svg viewBox="0 0 120 72" className="w-full h-full max-h-32 rounded border border-slate-800 bg-slate-950">
                  <defs>
                    <radialGradient id={`heatGrad_${tileIndex}`} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity="0.65" />
                      <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {Array.from({ length: rows }).map((_, r) =>
                    Array.from({ length: cols }).map((__, c) => {
                      const seedVal = ((r + 1) * 17 + (c + 1) * 31 + currentMinute) % 100;
                      const baseRatio =
                        tileTeamFilter === 'home'
                          ? c >= 2
                            ? 0.56
                            : 0.34
                          : tileTeamFilter === 'away'
                            ? c <= 3
                              ? 0.56
                              : 0.34
                            : c < 3
                              ? homePoss / 100
                              : (100 - homePoss) / 100;
                      const intensity = baseRatio * (0.35 + (seedVal % 55) / 100);
                      const fill =
                        intensity > 0.42
                          ? 'rgba(239, 68, 68, 0.44)'
                          : intensity > 0.28
                            ? 'rgba(245, 158, 11, 0.34)'
                            : 'rgba(16, 185, 129, 0.2)';
                      return (
                        <g key={`${r}_${c}`}>
                          <rect
                            x={4 + c * 18.6}
                            y={4 + r * 16}
                            width={17.6}
                            height={15}
                            rx="1.5"
                            fill={fill}
                          />
                          <text
                            x={12.8 + c * 18.6}
                            y={13.5 + r * 16}
                            textAnchor="middle"
                            fontSize="4.5"
                            fontFamily="monospace"
                            fill="#f8fafc"
                          >
                            {Math.round(intensity * 28)}%
                          </text>
                        </g>
                      );
                    })
                  )}
                  {/* Smooth Radial Heat Blobs over key tactical touch zones */}
                  {focusCoords.slice(5, 11).map((fc, idx) => {
                    const rx =
                      tileTeamFilter === 'away'
                        ? 112 - ((100 - fc.y) / 100) * 96
                        : 8 + ((100 - fc.y) / 100) * 96;
                    const ry = 6 + (fc.x / 100) * 60;
                    return (
                      <circle
                        key={`blob_${idx}`}
                        cx={rx}
                        cy={ry}
                        r="14"
                        fill={`url(#heatGrad_${tileIndex})`}
                      />
                    );
                  })}
                </svg>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>{tr('Def Third: 29%', 'แดนหลัง: 29%')}</span>
                  <span className="text-amber-400">{tr('Mid Third: 44%', 'แดนกลาง: 44%')}</span>
                  <span className="text-rose-400">{tr('Final Third: 27%', 'พื้นที่สุดท้าย: 27%')}</span>
                </div>
              </div>
            );
          })()}

          {activeType === 'PASS_MAP' && (() => {
            const targetClub = tileTeamFilter === 'away' ? awayClub : homeClub;
            const isAwayMap = targetClub.id === awayClub.id;
            const coords = computeTacticalPhaseCoordinates(targetClub.primaryTactic, 'in_possession');
            const edges: [number, number, number][] = [
              [0, 2, 1.4],
              [0, 3, 1.4],
              [2, 1, 1.6],
              [3, 4, 1.6],
              [2, 5, 2.1],
              [3, 6, 2.2],
              [5, 6, 2.5],
              [6, 7, 2.3],
              [5, 8, 1.8],
              [7, 9, 1.8],
              [6, 10, 2.0],
              [8, 10, 1.5],
              [9, 10, 1.5],
            ];
            return (
              <div className="h-full flex flex-col justify-between">
                <svg viewBox="0 0 120 72" className="w-full h-full max-h-32 rounded border border-slate-800 bg-slate-950">
                  <rect x="3" y="3" width="114" height="66" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                  <line x1="60" y1="3" x2="60" y2="69" stroke="#1e293b" strokeWidth="0.8" />
                  {edges.map(([a, b, w], idx) => {
                    const ca = coords[a];
                    const cb = coords[b];
                    if (!ca || !cb) return null;
                    const x1 = isAwayMap
                      ? 112 - ((100 - ca.y) / 100) * 98
                      : 8 + ((100 - ca.y) / 100) * 98;
                    const y1 = 6 + (ca.x / 100) * 60;
                    const x2 = isAwayMap
                      ? 112 - ((100 - cb.y) / 100) * 98
                      : 8 + ((100 - cb.y) / 100) * 98;
                    const y2 = 6 + (cb.x / 100) * 60;
                    return (
                      <line
                        key={idx}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isAwayMap ? '#38bdf8' : '#10b981'}
                        strokeOpacity="0.65"
                        strokeWidth={w * 0.8}
                      />
                    );
                  })}
                  {coords.map((c, i) => {
                    const slot = targetClub.primaryTactic.lineup[i];
                    const p = slot?.playerId ? world.players[slot.playerId] : null;
                    const num = p?.shirtNumber || i + 1;
                    const cx = isAwayMap
                      ? 112 - ((100 - c.y) / 100) * 98
                      : 8 + ((100 - c.y) / 100) * 98;
                    const cy = 6 + (c.x / 100) * 60;
                    return (
                      <g key={i}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r="3.2"
                          fill={targetClub.primaryColor}
                          stroke="#fff"
                          strokeWidth="0.6"
                        />
                        <text
                          x={cx}
                          y={cy + 1}
                          textAnchor="middle"
                          fontSize="2.5"
                          fill="#fff"
                          fontWeight="bold"
                        >
                          {num}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>
                    {homeClub.shortName} Pass %:{' '}
                    <strong className="text-emerald-400">
                      {simResult ? simResult.homeStats.passAccuracy : 86}%
                    </strong>
                  </span>
                  <span>
                    {awayClub.shortName} Pass %:{' '}
                    <strong className="text-sky-400">
                      {simResult ? simResult.awayStats.passAccuracy : 82}%
                    </strong>
                  </span>
                </div>
              </div>
            );
          })()}

          {activeType === 'XG_STORY' && (() => {
            const hXg = simResult ? +(simResult.homeStats.xG * progressRatio).toFixed(2) : 0.0;
            const aXg = simResult ? +(simResult.awayStats.xG * progressRatio).toFixed(2) : 0.0;
            const maxScale = Math.max(2.2, hXg + 0.4, aXg + 0.4);
            const steps = [0, 15, 30, 45, 60, 75, 90];
            const buildStepPoints = (teamId: string, finalXg: number) =>
              steps
                .map((m) => {
                  const ratio = Math.min(1, Math.max(0, Math.min(currentMinute, m) / 90));
                  const val = finalXg * ratio;
                  const x = 8 + (m / 90) * 104;
                  const y = 62 - (val / maxScale) * 52;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(' ');

            return (
              <div className="h-full flex flex-col justify-between">
                <svg viewBox="0 0 120 70" className="w-full h-full max-h-32 rounded border border-slate-800 bg-slate-950">
                  <line x1="8" y1="62" x2="112" y2="62" stroke="#334155" strokeWidth="0.7" />
                  <line x1="60" y1="8" x2="60" y2="62" stroke="#1e293b" strokeDasharray="2 2" strokeWidth="0.6" />
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="1.8"
                    points={buildStepPoints(homeClub.id, hXg)}
                  />
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.8"
                    points={buildStepPoints(awayClub.id, aXg)}
                  />
                  {visibleEvents
                    .filter((e) => e.eventType === 'Goal')
                    .map((g) => {
                      const gx = 8 + (Math.min(90, g.minute) / 90) * 104;
                      const gy = g.teamId === homeClub.id ? 22 : 34;
                      return (
                        <g key={g.id}>
                          <circle
                            cx={gx}
                            cy={gy}
                            r="2.8"
                            fill={g.teamId === homeClub.id ? '#10b981' : '#38bdf8'}
                            stroke="#fff"
                            strokeWidth="0.6"
                          />
                        </g>
                      );
                    })}
                </svg>
                <div className="flex items-center justify-between text-[10px] font-mono mt-1">
                  <span className="text-emerald-400">
                    {homeClub.shortName} xG: <strong>{hXg.toFixed(2)}</strong>
                  </span>
                  <span className="text-slate-400">0&apos; — HT — 90&apos;</span>
                  <span className="text-sky-400">
                    {awayClub.shortName} xG: <strong>{aXg.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
            );
          })()}

          {activeType === 'SHOT_MAP' && (() => {
            const shotEvents = visibleEvents.filter((e) => {
              const isShotEv =
                e.eventType === 'Goal' ||
                e.eventType === 'Save' ||
                e.eventType === 'BlockedShot' ||
                e.eventType === 'Shot' ||
                e.eventType === 'PenaltyMissed' ||
                e.eventType === 'FreeKick';
              if (!isShotEv) return false;
              if (tileTeamFilter === 'both') return true;
              const shooterClubId =
                e.eventType === 'Save'
                  ? e.teamId === homeClub.id
                    ? awayClub.id
                    : homeClub.id
                  : e.teamId;
              return tileTeamFilter === 'home'
                ? shooterClubId === homeClub.id
                : shooterClubId === awayClub.id;
            });
            return (
              <div className="h-full flex flex-col justify-between">
                <svg viewBox="0 0 100 60" className="w-full h-full max-h-32 bg-slate-950 rounded border border-slate-800">
                  <rect x="2" y="2" width="96" height="56" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                  <line x1="50" y1="2" x2="50" y2="58" stroke="#1e293b" strokeWidth="0.6" />
                  <circle cx="50" cy="30" r="8" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                  <rect x="2" y="14" width="14" height="32" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                  <rect x="84" y="14" width="14" height="32" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                  {shotEvents.map((ev) => {
                    const isGoal = ev.eventType === 'Goal';
                    const shooterClubId =
                      ev.eventType === 'Save'
                        ? ev.teamId === homeClub.id
                          ? awayClub.id
                          : homeClub.id
                        : ev.teamId;
                    const isHomeShot = shooterClubId === homeClub.id;
                    const xgVal = ev.shotXg ?? ev.xGDelta ?? 0.1;
                    const rawX = ev.shotX ?? ev.pitchX ?? (isHomeShot ? 85 : 15);
                    const rawY = ev.shotY ?? ev.pitchY ?? 50;
                    const cx = Math.max(4, Math.min(96, rawX));
                    const cy = Math.max(5, Math.min(55, (rawY / 100) * 60));
                    const radius = Math.max(1.8, Math.min(4.8, 1.4 + xgVal * 5.2));
                    return (
                      <circle
                        key={ev.id}
                        cx={cx}
                        cy={cy}
                        r={radius}
                        onClick={() => setActiveShotTooltip(ev)}
                        className="cursor-pointer"
                        fill={
                          isGoal
                            ? isHomeShot
                              ? '#10b981'
                              : '#38bdf8'
                            : isHomeShot
                              ? 'rgba(16,185,129,0.3)'
                              : 'rgba(56,189,248,0.3)'
                        }
                        stroke={isGoal ? '#ffffff' : isHomeShot ? '#10b981' : '#38bdf8'}
                        strokeWidth={isGoal ? '0.9' : '0.6'}
                      />
                    );
                  })}
                </svg>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1">
                  <span>
                    {activeShotTooltip
                      ? `${activeShotTooltip.minute}' ${activeShotTooltip.playerName || ''} (${activeShotTooltip.eventType})`
                      : tr('Click shot circle for xG details', 'คลิกจุดยิงเพื่อดูค่า xG')}
                  </span>
                  <span className="text-emerald-400">{shotEvents.length} shots</span>
                </div>
              </div>
            );
          })()}

          {activeType === 'MOMENTUM' && (() => {
            const intervals = [
              { label: "1-15'", min: 1, max: 15 },
              { label: "16-30'", min: 16, max: 30 },
              { label: "31-45'", min: 31, max: 45 },
              { label: "46-60'", min: 46, max: 60 },
              { label: "61-75'", min: 61, max: 75 },
              { label: "76-90'", min: 76, max: 120 },
            ];
            return (
              <div className="grid grid-cols-6 gap-1 h-full items-end pt-1">
                {intervals.map((iv) => {
                  let homeIvXg = 0.08;
                  let awayIvXg = 0.08;
                  for (const ev of visibleEvents) {
                    if (ev.minute >= iv.min && ev.minute <= iv.max) {
                      const xg = ev.shotXg ?? ev.xGDelta ?? 0.06;
                      if (ev.teamId === homeClub.id) homeIvXg += xg;
                      else awayIvXg += xg;
                    }
                  }
                  const homePct = Math.min(100, Math.round((homeIvXg / 0.9) * 100));
                  const awayPct = Math.min(100, Math.round((awayIvXg / 0.9) * 100));
                  return (
                    <div
                      key={iv.label}
                      className="bg-slate-950 border border-slate-800/80 rounded p-1 flex flex-col items-center justify-end h-full"
                    >
                      <div className="flex-1 w-full flex items-end justify-center gap-1">
                        <div
                          className="w-2 bg-emerald-500 rounded-t"
                          style={{ height: `${Math.max(10, homePct)}%` }}
                        />
                        <div
                          className="w-2 bg-sky-500 rounded-t"
                          style={{ height: `${Math.max(10, awayPct)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 mt-1">{iv.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {activeType === 'MATCH_EVENTS' && (
            <div className="space-y-1 pr-1">
              {visibleEvents.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  {tr('Waiting for Kick Off...', 'รอเริ่มการแข่งขัน...')}
                </div>
              ) : (
                [...visibleEvents]
                  .reverse()
                  .slice(0, 12)
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className="px-2 py-1 rounded bg-slate-950 border border-slate-800/80 text-xs flex items-start gap-1.5"
                    >
                      <span className="font-mono text-emerald-400 shrink-0">{ev.minute}&apos;</span>
                      <span className="text-slate-200 line-clamp-2">{ev.text}</span>
                    </div>
                  ))
              )}
            </div>
          )}

          {activeType === 'DUGOUT' && (
            <div className="space-y-2">
              <div className="p-2 rounded-lg bg-slate-950 border border-indigo-500/40 text-xs text-slate-200">
                <div className="font-semibold text-indigo-300 mb-0.5">
                  {tr('🤖 Assistant Manager Dugout', '🤖 คำแนะนำจากผู้ช่วยโค้ชข้างสนาม')}
                </div>
                <div className="text-slate-300 leading-snug">{adviceText}</div>
              </div>
              <button
                type="button"
                disabled={currentMinute >= maxMatchMinute}
                onClick={applyAssManAdvice}
                className="w-full py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                {tr('⚡ 1-Click Apply Dugout Advice', '⚡ ปรับแท็กติกตามคำแนะนำทันที')}
              </button>
            </div>
          )}

          {activeType === 'LIVE_TABLE' && (() => {
            const leagueId = homeClub.leagueId;
            const baseRows = world.standings[leagueId] || [];
            const liveRows = baseRows
              .map((r) => {
                if (committedToWorld || currentMinute === 0) return { ...r, deltaPts: 0 };
                if (r.clubId === homeClub.id) {
                  const addPts =
                    visibleHomeGoals > visibleAwayGoals
                      ? 3
                      : visibleHomeGoals === visibleAwayGoals
                        ? 1
                        : 0;
                  return {
                    ...r,
                    played: r.played + 1,
                    points: r.points + addPts,
                    goalDifference: r.goalDifference + (visibleHomeGoals - visibleAwayGoals),
                    deltaPts: addPts,
                  };
                }
                if (r.clubId === awayClub.id) {
                  const addPts =
                    visibleAwayGoals > visibleHomeGoals
                      ? 3
                      : visibleHomeGoals === visibleAwayGoals
                        ? 1
                        : 0;
                  return {
                    ...r,
                    played: r.played + 1,
                    points: r.points + addPts,
                    goalDifference: r.goalDifference + (visibleAwayGoals - visibleHomeGoals),
                    deltaPts: addPts,
                  };
                }
                return { ...r, deltaPts: 0 };
              })
              .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference);

            return (
              <div className="space-y-1">
                {liveRows.slice(0, 8).map((row, idx) => {
                  const c = world.clubs[row.clubId];
                  if (!c) return null;
                  const isMatchTeam = c.id === homeClub.id || c.id === awayClub.id;
                  return (
                    <div
                      key={row.clubId}
                      className={`flex items-center justify-between px-2 py-1 rounded text-xs font-mono ${
                        isMatchTeam
                          ? 'bg-emerald-500/15 border border-emerald-500/40 text-white font-semibold'
                          : 'bg-slate-950/70 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-4 text-slate-400">{idx + 1}</span>
                        <ClubBadge club={c} size="sm" />
                        <span className="font-sans truncate">{c.shortName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-400">{row.played}P</span>
                        <span className="text-emerald-400 font-bold w-6 text-right">
                          {row.points}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {activeType === 'LATEST_SCORES' && (() => {
            const targetMd = targetFixture?.matchday || 1;
            const compId = targetFixture?.competitionId || homeClub.leagueId;
            const otherFixtures = world.fixtures
              .filter(
                (f) =>
                  f.competitionId === compId &&
                  f.matchday === targetMd &&
                  f.id !== targetFixture?.id
              )
              .slice(0, 7);

            return (
              <div className="space-y-1">
                {otherFixtures.map((fx, idx) => {
                  const hc = world.clubs[fx.homeClubId];
                  const ac = world.clubs[fx.awayClubId];
                  if (!hc || !ac) return null;
                  const hScore = fx.result
                    ? fx.result.homeGoals
                    : currentMinute === 0
                      ? 0
                      : ((idx * 3 + Math.floor(currentMinute / 28)) % 3);
                  const aScore = fx.result
                    ? fx.result.awayGoals
                    : currentMinute === 0
                      ? 0
                      : ((idx * 5 + Math.floor(currentMinute / 35)) % 2);
                  return (
                    <div
                      key={fx.id}
                      className="flex items-center justify-between px-2 py-1 rounded bg-slate-950/80 border border-slate-800/70 text-xs font-mono"
                    >
                      <div className="flex items-center gap-1 truncate w-20">
                        <ClubBadge club={hc} size="sm" />
                        <span className="truncate font-sans">{hc.shortName}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-emerald-400 font-bold">
                        {currentMinute === 0 && !fx.result ? 'vs' : `${hScore} - ${aScore}`}
                      </span>
                      <div className="flex items-center justify-end gap-1 truncate w-20 text-right">
                        <span className="truncate font-sans">{ac.shortName}</span>
                        <ClubBadge club={ac} size="sm" />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  // Live Stat Rows for Left (Home) & Right (Away) Columns flanking the Wide 2D Pitch
  const liveStatMetrics = [
    {
      label: tr('Possession %', 'ครองบอล %'),
      homeVal: simResult ? simResult.homeStats.possession : 50,
      awayVal: simResult ? simResult.awayStats.possession : 50,
      suffix: '%',
    },
    {
      label: tr('Shots', 'ยิงทั้งหมด'),
      homeVal: simResult ? Math.round(simResult.homeStats.totalShots * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.totalShots * progressRatio) : 0,
      suffix: '',
    },
    {
      label: tr('On Target', 'ยิงเข้ากรอบ'),
      homeVal: simResult ? Math.round(simResult.homeStats.shotsOnTarget * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.shotsOnTarget * progressRatio) : 0,
      suffix: '',
    },
    {
      label: tr('Expected Goals (xG)', 'ค่าคาดหวังประตู (xG)'),
      homeVal: simResult ? +(simResult.homeStats.xG * progressRatio).toFixed(2) : 0,
      awayVal: simResult ? +(simResult.awayStats.xG * progressRatio).toFixed(2) : 0,
      suffix: '',
    },
    {
      label: tr('Big Chances', 'โอกาสทอง'),
      homeVal: simResult ? Math.round(simResult.homeStats.bigChances * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.bigChances * progressRatio) : 0,
      suffix: '',
    },
    {
      label: tr('Pass Completed %', 'จ่ายบอลแม่นยำ %'),
      homeVal: simResult ? simResult.homeStats.passAccuracy : 85,
      awayVal: simResult ? simResult.awayStats.passAccuracy : 83,
      suffix: '%',
    },
    {
      label: tr('Distance (km)', 'ระยะทางวิ่ง (กม.)'),
      homeVal: +(108.4 * progressRatio).toFixed(1),
      awayVal: +(106.8 * progressRatio).toFixed(1),
      suffix: 'km',
    },
    {
      label: tr('Corners', 'เตะมุม'),
      homeVal: simResult ? Math.round(simResult.homeStats.corners * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.corners * progressRatio) : 0,
      suffix: '',
    },
    {
      label: tr('Tackles', 'เข้าสกัด'),
      homeVal: simResult ? Math.round(simResult.homeStats.tackles * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.tackles * progressRatio) : 0,
      suffix: '',
    },
    {
      label: tr('Fouls', 'ฟาวล์'),
      homeVal: simResult ? Math.round(simResult.homeStats.fouls * progressRatio) : 0,
      awayVal: simResult ? Math.round(simResult.awayStats.fouls * progressRatio) : 0,
      suffix: '',
    },
  ];

  const wCond = simResult?.weather || 'Clear';
  const pCond = simResult?.pitchCondition || 'Perfect';
  const wIcon =
    wCond === 'Heavy Rain'
      ? '🌧️'
      : wCond === 'Light Rain'
        ? '🌦️'
        : wCond === 'Strong Wind'
          ? '💨'
          : wCond === 'Snow'
            ? '❄️'
            : '☀️';

  return (
    <div
      data-testid="fm27-fullscreen-match-broadcast"
      className="w-full h-full flex flex-col bg-[#080b12] text-slate-100 overflow-hidden select-none"
    >
      {/* 1. TOP BROADCAST & TOUCHLINE BAR */}
      <div className="min-h-[50px] shrink-0 bg-slate-950 border-b border-slate-800 px-2.5 py-1 flex items-center justify-between gap-2 overflow-x-auto">
        {/* Left: Exit Hub + Touchline Quick Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onExitMatchCenter && (
            <button
              type="button"
              data-testid="exit-match-broadcast-btn"
              onClick={onExitMatchCenter}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer flex items-center gap-1"
            >
              <span>←</span>
              <span>{tr('Hub', 'หน้าหลัก')}</span>
            </button>
          )}

          {onOpenTactics && (
            <button
              type="button"
              onClick={onOpenTactics}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium cursor-pointer"
            >
              {tr('Tactics', 'แท็กติก')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowInstructionsDrawer((v) => !v)}
            className={`px-2 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
              showInstructionsDrawer
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-200'
            }`}
          >
            {tr('Shouts ▾', 'สั่งการ ▾')}
          </button>

          {/* Mentality Quick Selector */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1">
            <label htmlFor="live-mentality-select" className="text-xs text-slate-400">
              {tr('Mentality:', 'แผน:')}
            </label>
            <select
              id="live-mentality-select"
              value={liveMentality}
              onChange={(e) => handleMentalityChange(e.target.value as Mentality)}
              disabled={currentMinute >= maxMatchMinute}
              className="bg-transparent text-xs font-semibold text-emerald-400 focus:outline-none cursor-pointer"
            >
              <option value="Very Defensive">{tr('Very Defensive', 'Very Defensive (อุดเต็มสูบ)')}</option>
              <option value="Defensive">{tr('Defensive', 'Defensive (รัดกุม)')}</option>
              <option value="Cautious">{tr('Cautious', 'Cautious (ระมัดระวัง)')}</option>
              <option value="Balanced">{tr('Balanced', 'Balanced (สมดุล)')}</option>
              <option value="Positive">{tr('Positive', 'Positive (เดินหน้าบุก)')}</option>
              <option value="Attacking">{tr('Attacking', 'Attacking (เปิดเกมรุก)')}</option>
              <option value="Very Attacking">{tr('Very Attacking', 'Very Attacking (ลุยแหลก)')}</option>
            </select>
          </div>

          <button
            type="button"
            data-testid="assman-apply-advice-btn"
            disabled={currentMinute >= maxMatchMinute}
            onClick={applyAssManAdvice}
            title={adviceText}
            className="px-2 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap"
          >
            {tr('⚡ Tweaks', '⚡ ผู้ช่วย')}
          </button>
        </div>

        {/* Center: FM27 Broadcast Scorebug */}
        <div className="flex items-center gap-2 bg-slate-900/95 border border-slate-800 rounded-xl px-2.5 py-0.5 shadow-lg shrink-0">
          {/* Home Team Pill */}
          <div className="flex items-center gap-1.5">
            <ClubBadge club={homeClub} size="sm" />
            <div className="text-right">
              <div className="text-xs font-display font-bold text-white uppercase leading-tight">
                {homeClub.shortName}
              </div>
              <div className="text-[10px] font-mono text-emerald-400">
                xG {simResult ? (simResult.homeStats.xG * progressRatio).toFixed(2) : '0.00'}
              </div>
            </div>
            <span
              className="w-1.5 h-6 rounded-sm"
              style={{ backgroundColor: homeClub.primaryColor }}
            />
          </div>

          {/* Score & Match Clock */}
          <div className="flex flex-col items-center px-2.5 py-0.5 bg-slate-950 border border-slate-800 rounded-lg min-w-[120px]">
            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
              <CompetitionBadge
                competitionId={targetFixture?.competitionId || homeClub.leagueId}
                size="xs"
              />
              <span>
                {currentMinute === 0
                  ? `MD ${targetFixture?.matchday || 1}`
                  : currentMinute === 45 && !isPlaying
                    ? 'HT 45:00'
                    : currentMinute >= maxMatchMinute
                      ? `FT ${maxMatchMinute}:00`
                      : `${String(currentMinute).padStart(2, '0')}:00`}
              </span>
              <TrophyArtwork
                competitionId={targetFixture?.competitionId || homeClub.leagueId}
                size="xs"
              />
            </div>
            <div className="text-lg font-display font-bold text-white tracking-widest font-mono tabular-nums leading-none my-0.5">
              {visibleHomeGoals} : {visibleAwayGoals}
            </div>
            <div
              data-testid="match-weather-badge"
              className="text-[10px] font-mono text-sky-300 leading-none"
            >
              {wIcon} {wCond} · {pCond}
            </div>
          </div>

          {/* Away Team Pill */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-6 rounded-sm"
              style={{ backgroundColor: awayClub.primaryColor }}
            />
            <div className="text-left">
              <div className="text-xs font-display font-bold text-white uppercase leading-tight">
                {awayClub.shortName}
              </div>
              <div className="text-[10px] font-mono text-sky-400">
                xG {simResult ? (simResult.awayStats.xG * progressRatio).toFixed(2) : '0.00'}
              </div>
            </div>
            <ClubBadge club={awayClub} size="sm" />
          </div>
        </div>

        {/* Right: Match Simulation Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleStartOrTogglePlay}
            disabled={currentMinute >= maxMatchMinute}
            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {currentMinute === 0
              ? tr('Kick Off', 'เริ่มแข่ง')
              : isPlaying
                ? tr('Pause', 'หยุด')
                : currentMinute >= maxMatchMinute
                  ? tr('Completed', 'จบเกม')
                  : tr('Resume', 'เล่นต่อ')}
          </button>

          {currentMinute < 45 && (
            <button
              type="button"
              onClick={handleJumpToHalfTime}
              className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {tr("Sim to Half-Time (45')", "จำลองถึงพักครึ่ง (45')")}
            </button>
          )}

          <button
            type="button"
            onClick={handleInstantResult}
            disabled={currentMinute >= maxMatchMinute}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {tr('Instant Result', 'จำลองผลทันที')}
          </button>

          {currentMinute >= maxMatchMinute &&
            nextScheduledFixture &&
            nextScheduledFixture.id !== targetFixture?.id && (
              <button
                type="button"
                onClick={() => setLockedFixtureId(nextScheduledFixture.id)}
                className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {tr(
                  `Next (MD ${nextScheduledFixture.matchday}) →`,
                  `นัดถัดไป (MD ${nextScheduledFixture.matchday}) →`
                )}
              </button>
            )}

          <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
            {([1, 2, 4] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setSpeed(spd)}
                className={`px-1.5 py-0.5 text-xs font-mono rounded cursor-pointer ${
                  speed === spd
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Collapsible Touchline Shouts & AssMan Co-Pilot Strip */}
      <div
        data-testid="assman-copilot-panel"
        className={`bg-slate-950/90 border-b border-slate-800 px-3 py-1 items-center justify-between gap-2 text-xs shrink-0 ${
          showInstructionsDrawer ? 'flex flex-wrap' : 'hidden'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mr-1">
            {tr('Shouts:', 'ตะโกนสั่งการ:')}
          </span>
          {(
            [
              { id: 'Encourage', label: tr('Encourage', 'Encourage (ให้กำลังใจ)'), desc: '+Morale' },
              { id: 'Demand More', label: tr('Demand More', 'Demand More (เร่งเครื่อง)'), desc: '+7% Atk/Tempo' },
              { id: 'Calm Down', label: tr('Calm Down', 'Calm Down (คุมอารมณ์)'), desc: '-28% Foul Risk' },
              { id: 'Focus', label: tr('Focus', 'Focus (ตั้งสมาธิ)'), desc: '+7% Defense' },
              { id: 'Praise', label: tr('Praise', 'Praise (ชมเชย)'), desc: '+5% Composure' },
            ] as { id: TouchlineShoutType; label: string; desc: string }[]
          ).map((s) => {
            const onCooldown =
              currentMinute <= 0 ||
              currentMinute >= maxMatchMinute ||
              currentMinute - lastShoutMinute < 15;
            const isRecentlyActive = liveShouts.some(
              (ls) => ls.shout === s.id && currentMinute >= ls.minute && currentMinute <= ls.minute + 15
            );
            return (
              <button
                key={s.id}
                type="button"
                disabled={onCooldown}
                onClick={() => handleTouchlineShout(s.id)}
                className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors cursor-pointer ${
                  isRecentlyActive
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                    : onCooldown
                      ? 'bg-slate-900 text-slate-500 border-slate-800 cursor-not-allowed'
                      : 'bg-slate-900 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border-slate-800'
                }`}
                title={s.desc}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 truncate">
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-semibold text-xs shrink-0">
            {tr('🤖 AssMan Co-Pilot', '🤖 ผู้ช่วยโค้ช')}
          </span>
          <span className="text-slate-300 truncate">{adviceText}</span>
          {currentMinute > 0 && (
            <button
              type="button"
              onClick={handleGenerateTacticalSummary}
              className="px-2.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs rounded cursor-pointer shrink-0"
            >
              {tr('Tactical Analysis', 'สรุปบทวิเคราะห์เกม')}
            </button>
          )}
        </div>
      </div>

      {/* Half-Time Dressing Room Team Talk Banner (45') */}
      {currentMinute === 45 && !teamTalkGiven && (
        <div className="mx-2 mt-2 p-3 rounded-xl bg-slate-950 border border-emerald-500/60 space-y-2 shrink-0 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              {tr(
                "Half-Time Dressing Room Team Talk (45')",
                "ห้องแต่งตัวช่วงพักครึ่ง (Half-Time Team Talk 45')"
              )}
            </div>
            <span className="text-xs font-mono text-amber-300">
              {homeClub.shortName} {visibleHomeGoals} - {visibleAwayGoals} {awayClub.shortName}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            {(
              [
                {
                  id: 'praise',
                  boost: 1.09,
                  title: tr('👏 Praise Squad', '👏 ชื่นชมฟอร์มครึ่งแรก'),
                  desc: tr('+9% Finishing & Confidence', '+9% ความมั่นใจและการจบสกอร์'),
                },
                {
                  id: 'encourage',
                  boost: 1.08,
                  title: tr('🔥 Encourage', '🔥 กระตุ้นให้ฮึดสู้'),
                  desc: tr('+8% Attacking Momentum', '+8% โมเมนตัมเกมรุก'),
                },
                {
                  id: 'demand_more',
                  boost: 1.1,
                  title: tr('⚡ Demand More', '⚡ เรียกร้องมาตรฐานสูงขึ้น'),
                  desc: tr('+10% Tempo & Pressing', '+10% เร่งจังหวะเพรสซิ่ง'),
                },
                {
                  id: 'aggressive',
                  boost: 1.14,
                  title: tr('💢 Aggressive (Hairdryer)', '💢 ทุบโต๊ะจวกฟอร์ม'),
                  desc: tr('+14% Comeback Surge', '+14% แรงฮึดทวงประตูคืน'),
                },
                {
                  id: 'no_complacency',
                  boost: 1.06,
                  title: tr('🎯 No Complacency', '🎯 กำชับห้ามประมาท'),
                  desc: tr('+18% Defensive Discipline', '+18% วินัยเกมรับ'),
                },
              ] as { id: HalfTimeTalkType; boost: number; title: string; desc: string }[]
            ).map((talk) => (
              <button
                key={talk.id}
                type="button"
                onClick={() => {
                  setTeamTalkGiven(talk.title);
                  reSimulateRemainingMinutes(
                    myClub.primaryTactic,
                    liveSubstitutions,
                    {
                      id: `ht_talk_${talk.id}`,
                      fixtureId: targetFixture?.id || 'fix',
                      minute: 45,
                      eventType: 'TacticalChange',
                      teamId: myClub.id,
                      text: tr(
                        `Half-Time Dressing Room (45'): Manager delivered "${talk.title}" (${talk.desc})!`,
                        `ห้องแต่งตัวช่วงพักครึ่ง (45'): ผู้จัดการทีมสั่งการ "${talk.title}" (${talk.desc})!`
                      ),
                      pitchX: 50,
                      pitchY: 50,
                      isHighlight: true,
                    },
                    talk.boost,
                    liveShouts,
                    talk.id
                  );
                  setIsPlaying(true);
                }}
                className="p-2 text-left rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/50 transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-emerald-300">{talk.title}</div>
                <div className="text-xs text-slate-400">{talk.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full-Time Post-Match Review, Man of the Match & Dressing Room Talk Banner */}
      {currentMinute >= maxMatchMinute && simResult && !postMatchTalkGiven && (
        <div
          data-testid="fulltime-postmatch-banner"
          className="mx-2 mt-1.5 px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500/60 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-xs">
              <span className="text-amber-300 font-bold mr-1.5">★ MOTM:</span>
              <span className="text-white font-semibold">
                {world.players[simResult.manOfTheMatchPlayerId]
                  ? `${world.players[simResult.manOfTheMatchPlayerId].firstName} ${world.players[simResult.manOfTheMatchPlayerId].lastName}`
                  : homeClub.shortName}
              </span>
              <span className="ml-1.5 font-mono text-emerald-400 font-bold">
                {(simResult.playerRatings[simResult.manOfTheMatchPlayerId] || 8.2).toFixed(1)}
              </span>
            </div>
            {simResult.penaltyShootout && (
              <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono">
                <span className="text-amber-400 font-bold mr-1">PENS:</span>
                <span className="text-white">
                  {homeClub.shortName} {simResult.penaltyShootout.homePenalties} -{' '}
                  {simResult.penaltyShootout.awayPenalties} {awayClub.shortName}
                </span>
                <span className="ml-2">🟢🟢🟢🔴🟢</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">
              {tr('Post-Match Team Talk:', 'พูดคุยหลังจบเกม:')}
            </span>
            {[
              {
                id: 'praise_ft',
                label: tr('👏 Praise Squad Effort', '👏 ชื่นชมความทุ่มเท'),
              },
              {
                id: 'demand_ft',
                label: tr('🔥 Demand Higher Standards', '🔥 กำชับยกระดับฟอร์ม'),
              },
              {
                id: 'focus_next',
                label: tr('🎯 Focus on Next Fixture', '🎯 โฟกัสนัดต่อไปทันที'),
              },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setPostMatchTalkGiven(btn.label)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/50 text-xs text-emerald-300 font-medium cursor-pointer"
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tacticalSummary && (
        <div className="mx-2 mt-1.5 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 shrink-0 flex items-center justify-between">
          <div>
            <span className="font-semibold text-emerald-400">
              {tr('Tactical Summary: ', 'สรุปบทวิเคราะห์เกม: ')}
            </span>
            {tacticalSummary}
          </div>
          <button
            type="button"
            onClick={() => setTacticalSummary(null)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. MAIN 12-COLUMN FM27 BROADCAST GRID */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2 p-2 overflow-y-auto lg:overflow-hidden">
        {/* LEFT FLANK (Col 1–2): HOME Formation (IP) Vertical Pitch + Tile 4 (Default: LIVE TABLE) */}
        <div className="lg:col-span-2 flex flex-col gap-2 min-h-0 overflow-hidden">
          {renderVerticalFormationPitch(homeClub, 'home')}
          {renderSwappableTile(3, 'flex-1')}
        </div>

        {/* CENTER ARENA (Col 3–10): Top 3 Swappable Analytics Tiles + Bottom Wide 2D Pitch Flanked by Live Stats */}
        <div className="lg:col-span-8 flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* Top Row: 3 Swappable Tiles (Tile 1, Tile 2, Tile 3) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 h-[38%] min-h-[170px] shrink-0">
            {renderSwappableTile(0, 'h-full')}
            {renderSwappableTile(1, 'h-full')}
            {renderSwappableTile(2, 'h-full')}
          </div>

          {/* Bottom Row: Home Live Stats (Left) + Wide Live 2D Pitch (Center) + Away Live Stats (Right) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 gap-2 overflow-hidden">
            {/* Home Live Stats Column */}
            <div className="md:col-span-3 bg-slate-900/95 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between overflow-y-auto">
              <div className="flex items-center gap-1.5 pb-1.5 mb-1 border-b border-slate-800">
                <ClubBadge club={homeClub} size="sm" />
                <span className="text-xs font-display font-bold text-white uppercase truncate">
                  {homeClub.shortName} {tr('Stats', 'สถิติ')}
                </span>
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col justify-around">
                {liveStatMetrics.map((m) => {
                  const total = Number(m.homeVal) + Number(m.awayVal) || 1;
                  const pct = Math.min(100, Math.max(8, Math.round((Number(m.homeVal) / total) * 100)));
                  return (
                    <div key={`home_${m.label}`} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 font-sans truncate">{m.label}</span>
                        <span className="text-emerald-400 font-bold">
                          {m.homeVal}
                          {m.suffix}
                        </span>
                      </div>
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center Wide Live 2D Pitch + Live Commentary Ticker */}
            <div className="md:col-span-6 bg-slate-900/95 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between min-h-0 overflow-hidden">
              <div className="flex items-center justify-between mb-1 shrink-0">
                <span className="text-xs font-display font-bold text-white uppercase tracking-wider">
                  {tr('LIVE 2D PITCH ENGINE', 'สนามแข่งขันสด 2D (22 PLAYERS)')}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {homeClub.stadiumName}
                </span>
              </div>

              {/* Interactive 22-Player SVG Pitch */}
              <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                {(() => {
                  const latestEv = visibleEvents[visibleEvents.length - 1];
                  const isHomePossession = latestEv ? latestEv.teamId === homeClub.id : true;
                  const ballX = latestEv
                    ? Math.max(6, Math.min(94, latestEv.pitchX))
                    : currentMinute === 0
                      ? 50
                      : 25 + ((currentMinute * 19) % 50);
                  const ballY = latestEv
                    ? Math.max(8, Math.min(92, latestEv.pitchY))
                    : currentMinute === 0
                      ? 50
                      : 20 + ((currentMinute * 29) % 60);

                  const homePhaseCoords = computeTacticalPhaseCoordinates(
                    homeClub.primaryTactic,
                    currentMinute === 0
                      ? 'base'
                      : isHomePossession
                        ? 'in_possession'
                        : 'out_of_possession'
                  );
                  const awayPhaseCoords = computeTacticalPhaseCoordinates(
                    awayClub.primaryTactic,
                    currentMinute === 0
                      ? 'base'
                      : !isHomePossession
                        ? 'in_possession'
                        : 'out_of_possession'
                  );

                  const ballPullX = (ballX - 50) * 0.16;
                  const ballPullY = (ballY - 50) * 0.12;

                  return (
                    <svg
                      viewBox="0 0 100 62"
                      data-testid="live-22-player-pitch"
                      className="w-full h-full max-h-[270px] rounded-lg border border-slate-800 bg-[#0c4a34] select-none"
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                        <rect
                          key={idx}
                          x={idx * 10}
                          y={0}
                          width={10}
                          height={62}
                          fill={idx % 2 === 0 ? '#0c4a34' : '#0f543c'}
                        />
                      ))}
                      <rect x="3" y="3" width="94" height="56" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                      <line x1="50" y1="3" x2="50" y2="59" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                      <circle cx="50" cy="31" r="8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                      <rect x="3" y="14" width="14" height="34" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                      <rect x="83" y="14" width="14" height="34" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />

                      {/* Home 11 Players (Sent-off players removed for 10-man realism) */}
                      {homePhaseCoords.map((coord, idx) => {
                        const slot = homeClub.primaryTactic.lineup[idx];
                        const p = slot?.playerId ? world.players[slot.playerId] : null;
                        if (p && sentOffPlayerIds.has(p.id)) return null;
                        const isCapt = p && homeClub.primaryTactic.setPieces?.captainId === p.id;
                        const shirtNum = p?.shirtNumber || idx + 1;
                        const rawHoriz = Math.max(
                          6,
                          Math.min(72, (100 - coord.y) * 0.72 + (idx === 0 ? 0 : ballPullX))
                        );
                        const rawVert = Math.max(
                          8,
                          Math.min(92, coord.x + (idx === 0 ? 0 : ballPullY))
                        );
                        const cx = 3 + (rawHoriz / 100) * 94;
                        const cy = 3 + (rawVert / 100) * 56;
                        return (
                          <g
                            key={`home_dot_${idx}`}
                            onClick={() => p && onSelectPlayer(p.id)}
                            className="cursor-pointer transition-all duration-500"
                          >
                            <circle
                              cx={cx}
                              cy={cy}
                              r="2.4"
                              fill={homeClub.primaryColor}
                              stroke="#ffffff"
                              strokeWidth="0.45"
                            />
                            <text
                              x={cx}
                              y={cy + 0.75}
                              textAnchor="middle"
                              fontSize="1.8"
                              fontWeight="bold"
                              fill="#ffffff"
                            >
                              {shirtNum}
                            </text>
                            {p && (
                              <text
                                x={cx}
                                y={cy + 4.2}
                                textAnchor="middle"
                                fontSize="1.75"
                                fontWeight="600"
                                fill="#e2e8f0"
                              >
                                {p.lastName.slice(0, 7)}
                                {isCapt ? ' [C]' : ''}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Away 11 Players (Sent-off players removed for 10-man realism) */}
                      {awayPhaseCoords.map((coord, idx) => {
                        const slot = awayClub.primaryTactic.lineup[idx];
                        const p = slot?.playerId ? world.players[slot.playerId] : null;
                        if (p && sentOffPlayerIds.has(p.id)) return null;
                        const isCapt = p && awayClub.primaryTactic.setPieces?.captainId === p.id;
                        const shirtNum = p?.shirtNumber || idx + 1;
                        const rawHoriz = Math.max(
                          28,
                          Math.min(94, 100 - (100 - coord.y) * 0.72 + (idx === 0 ? 0 : ballPullX))
                        );
                        const rawVert = Math.max(
                          8,
                          Math.min(92, 100 - coord.x + (idx === 0 ? 0 : ballPullY))
                        );
                        const cx = 3 + (rawHoriz / 100) * 94;
                        const cy = 3 + (rawVert / 100) * 56;
                        return (
                          <g
                            key={`away_dot_${idx}`}
                            onClick={() => p && onSelectPlayer(p.id)}
                            className="cursor-pointer transition-all duration-500"
                          >
                            <circle
                              cx={cx}
                              cy={cy}
                              r="2.4"
                              fill={awayClub.primaryColor}
                              stroke="#0f172a"
                              strokeWidth="0.45"
                            />
                            <text
                              x={cx}
                              y={cy + 0.75}
                              textAnchor="middle"
                              fontSize="1.8"
                              fontWeight="bold"
                              fill="#ffffff"
                            >
                              {shirtNum}
                            </text>
                            {p && (
                              <text
                                x={cx}
                                y={cy + 4.2}
                                textAnchor="middle"
                                fontSize="1.75"
                                fontWeight="600"
                                fill="#bae6fd"
                              >
                                {p.lastName.slice(0, 7)}
                                {isCapt ? ' [C]' : ''}
                              </text>
                            )}
                          </g>
                        );
                      })}

                      {/* Curved SVG Quadratic Bezier Ball Trajectory Trail */}
                      {(() => {
                        const prevEv =
                          visibleEvents.length >= 2 ? visibleEvents[visibleEvents.length - 2] : null;
                        const startX =
                          3 + ((prevEv ? Math.max(6, Math.min(94, prevEv.pitchX)) : 50) / 100) * 94;
                        const startY =
                          3 + ((prevEv ? Math.max(8, Math.min(92, prevEv.pitchY)) : 50) / 100) * 56;
                        const endX = 3 + (ballX / 100) * 94;
                        const endY = 3 + (ballY / 100) * 56;
                        const ctrlX = (startX + endX) / 2;
                        const ctrlY = Math.max(5, Math.min(57, (startY + endY) / 2 - 7));
                        return (
                          <path
                            data-testid="ball-bezier-trail"
                            d={`M ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${ctrlX.toFixed(1)} ${ctrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`}
                            fill="none"
                            stroke="rgba(250, 204, 21, 0.55)"
                            strokeWidth="0.65"
                            strokeDasharray="1.5 1"
                          />
                        );
                      })()}

                      {/* Live Ball Marker */}
                      <g className="transition-all duration-500">
                        <circle
                          cx={3 + (ballX / 100) * 94}
                          cy={3 + (ballY / 100) * 56}
                          r="1.65"
                          fill="#facc15"
                          stroke="#000000"
                          strokeWidth="0.45"
                        />
                      </g>
                    </svg>
                  );
                })()}
              </div>

              {/* Latest Commentary Ticker Bar underneath Pitch */}
              <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs flex items-center justify-between gap-2 shrink-0">
                {visibleEvents.length === 0 ? (
                  <span className="text-slate-400 truncate">
                    {tr(
                      'Click "Kick Off" or "Instant Result" in the top bar to start the match.',
                      'กดปุ่ม "เริ่มการแข่งขัน (Kick Off)" หรือ "จำลองผลทันที" ด้านบนเพื่อเริ่มเกม'
                    )}
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-emerald-400 font-bold shrink-0">
                      {visibleEvents[visibleEvents.length - 1].minute}&apos;
                    </span>
                    <span className="text-slate-200 truncate flex-1">
                      {visibleEvents[visibleEvents.length - 1].text}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Away Live Stats Column */}
            <div className="md:col-span-3 bg-slate-900/95 border border-slate-800 rounded-xl p-2.5 flex flex-col justify-between overflow-y-auto">
              <div className="flex items-center justify-end gap-1.5 pb-1.5 mb-1 border-b border-slate-800">
                <span className="text-xs font-display font-bold text-white uppercase truncate">
                  {awayClub.shortName} {tr('Stats', 'สถิติ')}
                </span>
                <ClubBadge club={awayClub} size="sm" />
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col justify-around">
                {liveStatMetrics.map((m) => {
                  const total = Number(m.homeVal) + Number(m.awayVal) || 1;
                  const pct = Math.min(100, Math.max(8, Math.round((Number(m.awayVal) / total) * 100)));
                  return (
                    <div key={`away_${m.label}`} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-sky-400 font-bold">
                          {m.awayVal}
                          {m.suffix}
                        </span>
                        <span className="text-slate-400 font-sans truncate">{m.label}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden flex justify-end">
                        <div
                          className="h-full bg-sky-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT FLANK (Col 11–12): AWAY Formation (IP) Vertical Pitch + Tile 5 (Default: LATEST SCORES) */}
        <div className="lg:col-span-2 flex flex-col gap-2 min-h-0 overflow-hidden">
          {renderVerticalFormationPitch(awayClub, 'away')}
          {renderSwappableTile(4, 'flex-1')}
        </div>
      </div>

      {/* Quick Substitution Bench Picker Popover when a starter is clicked */}
      {selectedSubOutId && liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && (
        <div className="mx-3 mb-1 p-2.5 rounded-xl bg-slate-950 border border-emerald-500/60 shadow-2xl flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-semibold">
              {tr('Substitute Out:', 'เปลี่ยนตัวออก:')} {world.players[selectedSubOutId]?.firstName}{' '}
              {world.players[selectedSubOutId]?.lastName}
            </span>
            <span className="text-slate-400">→ {tr('Select bench replacement:', 'เลือกตัวสำรองลงแทน:')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {myBench.map((bPlayer) => (
              <button
                key={bPlayer.id}
                type="button"
                onClick={() => handleMakeSubstitution(selectedSubOutId, bPlayer.id)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/40 text-xs text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <strong className="text-emerald-400 font-mono">{bPlayer.positions[0]}</strong>
                <span>{bPlayer.lastName}</span>
                <span className="font-mono text-slate-400">({bPlayer.fitness}%)</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedSubOutId(null)}
              className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 3. BOTTOM MATCH TIMELINE & 11-PLAYER PITCH STRIP */}
      <div className="min-h-[60px] shrink-0 bg-slate-950 border-t border-slate-800 px-3 py-1.5 flex flex-col justify-between gap-1.5">
        {/* Progress Timeline Bar with Event Pins */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-emerald-400 w-12">
            {currentMinute}&apos;/{maxMatchMinute}&apos;
          </span>
          <div className="flex-1 h-2 bg-slate-900 rounded-full relative overflow-visible border border-slate-800">
            <div
              className="h-full bg-emerald-500/70 rounded-full transition-all"
              style={{ width: `${Math.min(100, (currentMinute / maxMatchMinute) * 100)}%` }}
            />
            {/* Half-Time Marker */}
            <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-slate-600" title="HT 45'" />
            {visibleEvents
              .filter(
                (e) =>
                  e.eventType === 'Goal' ||
                  e.eventType === 'YellowCard' ||
                  e.eventType === 'RedCard' ||
                  e.eventType === 'Substitution'
              )
              .map((ev) => {
                const leftPct = Math.min(98, Math.max(2, (ev.minute / maxMatchMinute) * 100));
                const icon =
                  ev.eventType === 'Goal'
                    ? '⚽'
                    : ev.eventType === 'RedCard'
                      ? '🟥'
                      : ev.eventType === 'YellowCard'
                        ? '🟨'
                        : '🔄';
                return (
                  <span
                    key={ev.id}
                    style={{ left: `${leftPct}%` }}
                    title={`${ev.minute}' ${ev.text}`}
                    className="absolute -top-2 -translate-x-1/2 text-[10px] leading-none select-none"
                  >
                    {icon}
                  </span>
                );
              })}
          </div>
          <span className="text-xs font-mono text-emerald-400 shrink-0">
            {tr(`Subs: ${liveSubstitutions.length}/5`, `เปลี่ยนตัว: ${liveSubstitutions.length}/5`)}
          </span>
        </div>

        {/* 11 On-Pitch Starters Strip + Quick Sub Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto pb-0.5">
            {myStarters.map((p) => {
              const rating = simResult?.playerRatings[p.id] ?? 6.8;
              const liveCondition = Math.max(
                35,
                Math.round(
                  p.fitness - (currentMinute / 90) * (24 - p.attributes.physical.stamina * 0.5)
                )
              );
              const isSelectedForSub = selectedSubOutId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (liveSubstitutions.length < 5 && currentMinute < maxMatchMinute) {
                      setSelectedSubOutId(isSelectedForSub ? null : p.id);
                    } else {
                      onSelectPlayer(p.id);
                    }
                  }}
                  className={`px-2 py-1 rounded-lg border text-xs font-mono flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                    isSelectedForSub
                      ? 'bg-emerald-500/20 border-emerald-400 text-white'
                      : 'bg-slate-900/90 hover:bg-slate-800 border-slate-800 text-slate-200'
                  }`}
                >
                  <span className="text-slate-400 font-bold">{p.positions[0]}</span>
                  <span className="font-sans truncate max-w-[68px]">{p.lastName}</span>
                  <span className={liveCondition < 65 ? 'text-rose-400' : 'text-emerald-400'}>
                    ♥{liveCondition}%
                  </span>
                  <span
                    className={`px-1 rounded font-bold ${
                      rating >= 7.2
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : rating >= 6.5
                          ? 'bg-slate-800 text-slate-200'
                          : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {currentMinute === 0 ? '6.8' : rating.toFixed(1)}
                  </span>
                </button>
              );
            })}
          </div>

          {liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && myStarters.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelectedSubOutId(selectedSubOutId ? null : mostFatiguedStarter?.id || myStarters[0].id)
              }
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 text-xs font-semibold shrink-0 cursor-pointer"
            >
              {tr('⇄ Quick Sub ▾', '⇄ เปลี่ยนตัว ▾')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
