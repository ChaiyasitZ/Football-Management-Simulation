import React, { useEffect, useRef, useState } from 'react';
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

interface MatchCenterViewProps {
  world: WorldState;
  activeFixture?: Fixture;
  onCompleteMatch: (fixtureId: string, result: MatchResult) => void;
  onUpdateClubTactic: (tactic: TacticalSystem) => void;
  onSelectPlayer: (playerId: string) => void;
}

export const MatchCenterView: React.FC<MatchCenterViewProps> = ({
  world,
  activeFixture,
  onCompleteMatch,
  onUpdateClubTactic,
  onSelectPlayer,
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simStateRef = useRef<{
    minute: number;
    ballX: number;
    ballY: number;
    targetBallX: number;
    targetBallY: number;
    flashTimer: number;
    homeColor: string;
    awayColor: string;
    homeCoords: [number, number][];
    awayCoords: [number, number][];
  }>({
    minute: 0,
    ballX: 50,
    ballY: 50,
    targetBallX: 50,
    targetBallY: 50,
    flashTimer: 0,
    homeColor: homeClub.primaryColor,
    awayColor: awayClub.primaryColor,
    homeCoords: [],
    awayCoords: [],
  });

  // Compute true formation coordinates from club tactics (slot.y is 90=GK..10=ST, slot.x is 0..100 width)
  useEffect(() => {
    const homeCoords: [number, number][] = homeClub.primaryTactic.lineup.map((slot) => [
      Math.max(6, Math.min(68, (100 - slot.y) * 0.72)),
      Math.max(10, Math.min(90, slot.x)),
    ]);
    const awayCoords: [number, number][] = awayClub.primaryTactic.lineup.map((slot) => [
      Math.max(32, Math.min(94, 100 - (100 - slot.y) * 0.72)),
      Math.max(10, Math.min(90, 100 - slot.x)),
    ]);
    simStateRef.current.homeCoords = homeCoords;
    simStateRef.current.awayCoords = awayCoords;
  }, [homeClub.primaryTactic.lineup, awayClub.primaryTactic.lineup]);

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
    }
    simStateRef.current.homeColor = homeClub.primaryColor;
    simStateRef.current.awayColor = awayClub.primaryColor;
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
        simStateRef.current.minute = nextMin;

        // Check if an event happened at nextMin
        const ev = simResult.events.find((e) => e.minute === nextMin);
        if (ev) {
          simStateRef.current.targetBallX = ev.pitchX;
          simStateRef.current.targetBallY = ev.pitchY;
          if (ev.eventType === 'Goal') {
            simStateRef.current.flashTimer = 0.6;
            soundService.playGoalCheer();
          }
        } else {
          simStateRef.current.targetBallX = 25 + ((nextMin * 19) % 50);
          simStateRef.current.targetBallY = 20 + ((nextMin * 29) % 60);
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
    if (simResult && currentMinute >= (simResult.extraTimePlayed ? 120 : 90) && targetFixture && !committedToWorld) {
      setCommittedToWorld(true);
      onCompleteMatch(targetFixture.id, simResult);
    }
  }, [currentMinute, simResult, targetFixture, committedToWorld, onCompleteMatch]);

  // Isolated 60fps 2D Tactical Pitch Canvas Loop using real formation coordinates
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();

    const fallbackHome: [number, number][] = [
      [8, 50], [22, 20], [20, 38], [20, 62], [22, 80],
      [38, 30], [36, 50], [38, 70], [58, 22], [58, 78], [66, 50],
    ];
    const fallbackAway: [number, number][] = [
      [92, 50], [78, 20], [80, 38], [80, 62], [78, 80],
      [62, 30], [64, 50], [62, 70], [42, 22], [42, 78], [34, 50],
    ];

    const renderPitch = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(rawDt, 0.05);
      lastTime = now;

      const w = canvas.width;
      const h = canvas.height;
      const st = simStateRef.current;

      // Smoothly interpolate ball position
      st.ballX += (st.targetBallX - st.ballX) * Math.min(1, dt * 6);
      st.ballY += (st.targetBallY - st.ballY) * Math.min(1, dt * 6);
      if (st.flashTimer > 0) {
        st.flashTimer = Math.max(0, st.flashTimer - dt);
      }

      // Pitch turf stripes
      const stripeCount = 10;
      const stripeW = w / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#0c4a34' : '#0f543c';
        ctx.fillRect(i * stripeW, 0, stripeW, h);
      }

      // Goal flash overlay
      if (st.flashTimer > 0) {
        ctx.fillStyle = `rgba(250, 204, 21, ${st.flashTimer * 0.35})`;
        ctx.fillRect(0, 0, w, h);
      }

      // Pitch lines
      const pad = 16;
      const pw = w - pad * 2;
      const ph = h - pad * 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pad, pad, pw, ph);

      // Halfway line & center circle
      ctx.beginPath();
      ctx.moveTo(w / 2, pad);
      ctx.lineTo(w / 2, h - pad);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 32, 0, Math.PI * 2);
      ctx.stroke();

      // Penalty boxes
      ctx.strokeRect(pad, h * 0.22, pw * 0.14, h * 0.56);
      ctx.strokeRect(w - pad - pw * 0.14, h * 0.22, pw * 0.14, h * 0.56);

      const homeBaseCoords = st.homeCoords.length === 11 ? st.homeCoords : fallbackHome;
      const awayBaseCoords = st.awayCoords.length === 11 ? st.awayCoords : fallbackAway;

      const shiftX = (st.ballX - 50) * 0.22;
      const shiftY = (st.ballY - 50) * 0.15;

      // Home players
      homeBaseCoords.forEach(([bx, by], idx) => {
        const px = pad + ((Math.max(4, Math.min(95, bx + (idx === 0 ? 0 : shiftX)))) / 100) * pw;
        const py = pad + ((Math.max(6, Math.min(94, by + (idx === 0 ? 0 : shiftY)))) / 100) * ph;
        ctx.fillStyle = st.homeColor;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Away players
      awayBaseCoords.forEach(([bx, by], idx) => {
        const px = pad + ((Math.max(5, Math.min(96, bx + (idx === 0 ? 0 : shiftX)))) / 100) * pw;
        const py = pad + ((Math.max(6, Math.min(94, by + (idx === 0 ? 0 : shiftY)))) / 100) * ph;
        ctx.fillStyle = st.awayColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Ball
      const ballPx = pad + (st.ballX / 100) * pw;
      const ballPy = pad + (st.ballY / 100) * ph;
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ballPx, ballPy, 4.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      animId = requestAnimationFrame(renderPitch);
    };

    animId = requestAnimationFrame(renderPitch);
    return () => cancelAnimationFrame(animId);
  }, []);

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
    .filter((p): p is Player => Boolean(p) && !p.injuryStatus.isInjured && (p.suspensionMatchesRemaining || 0) <= 0);

  return (
    <div className="space-y-4">
      {/* Match Scoreboard Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex items-center gap-3 flex-1">
            <ClubBadge club={homeClub} size="lg" />
            <ClubKitJersey club={homeClub} variant="home" size="sm" />
            <div>
              <div className="text-lg font-display font-bold text-white">{homeClub.name}</div>
              <div className="text-xs text-slate-400">
                {tr('Home', 'เจ้าบ้าน')} · {homeClub.primaryTactic.formation} · xG{' '}
                <span className="font-mono tabular-nums text-emerald-400">
                  {simResult ? (simResult.homeStats.xG * progressRatio).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Center Score & Clock */}
          <div className="flex flex-col items-center px-6 py-2.5 bg-slate-950 border border-slate-800 rounded-xl min-w-[245px]">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono tabular-nums mb-1">
              <CompetitionBadge
                competitionId={targetFixture?.competitionId || homeClub.leagueId}
                size="xs"
              />
              <span>
                {currentMinute === 0
                  ? `Matchday ${targetFixture?.matchday || 1} · Pre-Match`
                  : currentMinute === 45 && !isPlaying
                    ? tr('HALF-TIME (45’)', 'HALF-TIME (พักครึ่ง 45’)')
                    : currentMinute >= maxMatchMinute
                      ? tr(`FULL-TIME (${maxMatchMinute}’)`, `FULL-TIME (จบเกม ${maxMatchMinute}’)`)
                      : tr(`LIVE · ${currentMinute}'`, `LIVE · นาที ${currentMinute}'`)}
              </span>
              <TrophyArtwork
                competitionId={targetFixture?.competitionId || homeClub.leagueId}
                size="xs"
              />
            </div>
            <div className="text-3xl font-display font-bold text-white tracking-wider font-mono tabular-nums">
              {visibleHomeGoals} : {visibleAwayGoals}
            </div>
            {currentMinute >= maxMatchMinute && simResult?.penaltyShootout && (
              <div className="text-xs font-mono font-semibold text-amber-400 mt-0.5">
                {tr(
                  `Penalties: ${simResult.penaltyShootout.homePenalties} - ${simResult.penaltyShootout.awayPenalties}`,
                  `ดวลจุดโทษ: ${simResult.penaltyShootout.homePenalties} - ${simResult.penaltyShootout.awayPenalties}`
                )}
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-0.5">
              {homeClub.stadiumName}
            </div>
            {(() => {
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
                  data-testid="match-weather-badge"
                  className="mt-1 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-sky-300"
                >
                  {wIcon} {wCond} · {tr('Pitch:', 'สภาพสนาม:')} {pCond}
                </div>
              );
            })()}
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 flex-1 text-right">
            <div>
              <div className="text-lg font-display font-bold text-white">{awayClub.name}</div>
              <div className="text-xs text-slate-400">
                {tr('Away', 'ทีมเยือน')} · {awayClub.primaryTactic.formation} · xG{' '}
                <span className="font-mono tabular-nums text-sky-400">
                  {simResult ? (simResult.awayStats.xG * progressRatio).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
            <ClubKitJersey club={awayClub} variant="away" size="sm" />
            <ClubBadge club={awayClub} size="lg" />
          </div>
        </div>

        {/* Match Controls Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartOrTogglePlay}
              disabled={currentMinute >= maxMatchMinute}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {currentMinute === 0
                ? tr('Kick Off', 'เริ่มการแข่งขัน (Kick Off)')
                : isPlaying
                  ? tr('Pause Match', 'หยุดเกมชั่วคราว (Pause)')
                  : currentMinute >= maxMatchMinute
                    ? tr('Match Completed', 'จบการแข่งขันแล้ว')
                    : tr('Resume Match', 'เล่นต่อ (Resume Match)')}
            </button>

            <button
              type="button"
              onClick={handleInstantResult}
              disabled={currentMinute >= maxMatchMinute}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {tr('Instant Result', 'จำลองผลทันที (Instant Result)')}
            </button>

            {currentMinute < 45 && (
              <button
                type="button"
                onClick={handleJumpToHalfTime}
                className="px-3.5 py-2 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {tr("Sim to Half-Time (45')", "จำลองถึงพักครึ่ง (45')")}
              </button>
            )}

            {currentMinute >= maxMatchMinute &&
              nextScheduledFixture &&
              nextScheduledFixture.id !== targetFixture?.id && (
                <button
                  type="button"
                  onClick={() => setLockedFixtureId(nextScheduledFixture.id)}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {tr(
                    `Prepare Next Fixture (Matchday ${nextScheduledFixture.matchday}) →`,
                    `เตรียมพร้อมนัดถัดไป (Matchday ${nextScheduledFixture.matchday}) →`
                  )}
                </button>
              )}

            {/* Speed Selector */}
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
              {([1, 2, 4] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setSpeed(spd)}
                  className={`px-2.5 py-1 text-xs font-mono rounded cursor-pointer ${
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

          {/* Live Touchline Tactical Mentality Adjuster */}
          <div className="flex items-center gap-2">
            <label htmlFor="live-mentality-select" className="text-xs text-slate-400">
              {tr('Touchline Mentality:', 'สั่งการข้างสนาม (Mentality):')}
            </label>
            <select
              id="live-mentality-select"
              value={liveMentality}
              onChange={(e) => handleMentalityChange(e.target.value as Mentality)}
              disabled={currentMinute >= maxMatchMinute}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
            >
              <option value="Very Defensive">{tr('Very Defensive', 'Very Defensive (อุดเต็มสูบ)')}</option>
              <option value="Defensive">{tr('Defensive', 'Defensive (รัดกุม)')}</option>
              <option value="Cautious">{tr('Cautious', 'Cautious (ระมัดระวัง)')}</option>
              <option value="Balanced">{tr('Balanced', 'Balanced (สมดุล)')}</option>
              <option value="Positive">{tr('Positive', 'Positive (เดินหน้าบุก)')}</option>
              <option value="Attacking">{tr('Attacking', 'Attacking (เปิดเกมรุก)')}</option>
              <option value="Very Attacking">{tr('Very Attacking', 'Very Attacking (ลุยแหลก)')}</option>
            </select>

            {currentMinute > 0 && (
              <button
                type="button"
                onClick={handleGenerateTacticalSummary}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs rounded-lg cursor-pointer whitespace-nowrap"
              >
                {tr('Tactical Analysis', 'สรุปบทวิเคราะห์เกม')}
              </button>
            )}
          </div>
        </div>

        {/* Live Touchline Shouts Bar (FM27 Checkpoint 7) */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              {tr('Touchline Shouts:', 'ตะโกนกระตุ้นข้างสนาม (Shouts):')}
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {currentMinute <= 0
                ? tr('Available after Kick Off', 'ใช้งานได้หลังเริ่มเกม')
                : currentMinute >= maxMatchMinute
                  ? tr('Match Ended', 'จบการแข่งขัน')
                  : currentMinute - lastShoutMinute < 15
                    ? tr(
                        `Cooldown: ${15 - (currentMinute - lastShoutMinute)}' left`,
                        `คูลดาวน์อีก ${15 - (currentMinute - lastShoutMinute)} นาที`
                      )
                    : tr('Ready (15m boost)', 'พร้อมสั่งการ (มีผล 15 นาที)')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    isRecentlyActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-semibold'
                      : onCooldown
                        ? 'bg-slate-950 text-slate-600 border-slate-800 cursor-not-allowed'
                        : 'bg-slate-950 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border-slate-800 hover:border-emerald-500/40'
                  }`}
                  title={s.desc}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Assistant Manager 1-Click Tactical Co-Pilot (Checkpoint 27) */}
        {(() => {
          const myGoals = isUserHome ? visibleHomeGoals : visibleAwayGoals;
          const oppGoals = isUserHome ? visibleAwayGoals : visibleHomeGoals;
          const mostFatiguedStarter = [...myStarters].sort((a, b) => a.fitness - b.fitness)[0];
          const liveConditionLow =
            mostFatiguedStarter
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
                `AssMan Advice: ${mostFatiguedStarter.lastName} is fatigued (${liveConditionLow}% condition). Substitute with fresh legs ${bestBenchReplacement!.lastName} (${bestBenchReplacement!.positions[0]}) & switch to "${recommendedMentality}".`,
                `คำแนะนำผู้ช่วยโค้ช: ${mostFatiguedStarter.lastName} เริ่มอ่อนล้า (${liveConditionLow}%) แนะนำเปลี่ยนส่ง ${bestBenchReplacement!.lastName} (${bestBenchReplacement!.positions[0]}) ลงแทน และปรับ Mentality เป็น "${recommendedMentality}"`
              )
            : myGoals < oppGoals
              ? tr(
                  `AssMan Advice: We are trailing ${myGoals}-${oppGoals}. Shift Mentality to "Attacking" and issue a "Demand More" touchline shout to overload the final third!`,
                  `คำแนะนำผู้ช่วยโค้ช: ทีมกำลังตามหลัง ${myGoals}-${oppGoals} แนะนำปรับเป็น "Attacking" พร้อมตะโกนสั่งการ "Demand More" เพื่อเร่งเกมรุกทวงประตูคืน!`
                )
              : myGoals > oppGoals && currentMinute >= 70
                ? tr(
                    `AssMan Advice: Protect our ${myGoals}-${oppGoals} lead in the closing stages by shifting to "Cautious" mentality and issuing a "Focus" shout.`,
                    `คำแนะนำผู้ช่วยโค้ช: รักษาสกอร์นำ ${myGoals}-${oppGoals} ช่วงท้ายเกมด้วยการปรับเป็น "Cautious" และสั่งการ "Focus" เน้นวินัยเกมรับ`
                  )
                : tr(
                    `AssMan Advice: Control midfield tempo with "${recommendedMentality}" mentality and issue an "Encourage" touchline boost.`,
                    `คำแนะนำผู้ช่วยโค้ช: คุมจังหวะแดนกลางด้วยแท็กติก "${recommendedMentality}" พร้อมกระตุ้นลูกทีมด้วย "Encourage"`
                  );

          return (
            <div
              data-testid="assman-copilot-panel"
              className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-950/70 px-3 py-2 rounded-lg border border-indigo-500/30"
            >
              <div className="text-xs text-slate-200 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-semibold text-[11px] shrink-0">
                  {tr('🤖 AssMan Co-Pilot', '🤖 ผู้ช่วยโค้ชอัจฉริยะ')}
                </span>
                <span>{adviceText}</span>
              </div>
              <button
                type="button"
                data-testid="assman-apply-advice-btn"
                disabled={currentMinute >= maxMatchMinute}
                onClick={() => {
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
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-slate-950 font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                {tr('⚡ 1-Click Apply Advice', '⚡ ปรับแท็กติกตามคำแนะนำ (1-Click)')}
              </button>
            </div>
          );
        })()}

        {/* Half-time Dressing Room Team Talk (Checkpoint 9: 5 Options at 45') */}
        {currentMinute === 45 && !teamTalkGiven && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-emerald-500/50 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  {tr(
                    "Half-Time Dressing Room Team Talk (45')",
                    "ห้องแต่งตัวช่วงพักครึ่ง (Half-Time Team Talk 45')"
                  )}
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  {tr(
                    'Select your dressing room message to shape second-half mentality, composure, and comeback intensity:',
                    'เลือกคำพูดปลุกใจในห้องแต่งตัวเพื่อกำหนดทิศทางความมุ่งมั่นและแท็กติกในครึ่งเวลาหลัง:'
                  )}
                </div>
              </div>
              <span className="text-xs font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                {homeClub.shortName} {visibleHomeGoals} - {visibleAwayGoals} {awayClub.shortName}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {(
                [
                  {
                    id: 'praise',
                    boost: 1.09,
                    title: tr('👏 Praise Squad', '👏 ชื่นชมฟอร์มครึ่งแรก'),
                    desc: tr('+9% Finishing & Confidence when leading', '+9% ความมั่นใจและการจบสกอร์เมื่อทีมนำ'),
                  },
                  {
                    id: 'encourage',
                    boost: 1.08,
                    title: tr('🔥 Encourage', '🔥 กระตุ้นให้ฮึดสู้'),
                    desc: tr('+8% Attacking Momentum & Work Rate', '+8% โมเมนตัมเกมรุกและความขยัน'),
                  },
                  {
                    id: 'demand_more',
                    boost: 1.1,
                    title: tr('⚡ Demand More', '⚡ เรียกร้องมาตรฐานสูงขึ้น'),
                    desc: tr('+10% Tempo & Pressing Intensity', '+10% เร่งจังหวะบุกและการเพรสซิ่ง'),
                  },
                  {
                    id: 'aggressive',
                    boost: 1.14,
                    title: tr('💢 Aggressive (Hairdryer)', '💢 ทุบโต๊ะจวกฟอร์ม'),
                    desc: tr('+14% Comeback Surge if trailing/tied', '+14% แรงฮึดทวงประตูคืนเมื่อตามหลัง'),
                  },
                  {
                    id: 'no_complacency',
                    boost: 1.06,
                    title: tr('🎯 No Complacency', '🎯 กำชับห้ามประมาท'),
                    desc: tr('+18% Defensive Discipline late on', '+18% วินัยเกมรับลดโอกาสโดนตีเสมอ'),
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
                  className="p-2.5 text-left rounded-lg bg-slate-900 hover:bg-emerald-500/20 border border-slate-800 hover:border-emerald-500/50 transition-colors cursor-pointer flex flex-col justify-between"
                >
                  <div className="text-xs font-semibold text-emerald-300">{talk.title}</div>
                  <div className="text-[10px] text-slate-400 mt-1">{talk.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {tacticalSummary && (
          <div className="mt-3 p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed">
            <span className="font-semibold text-emerald-400">
              {tr('Post-Match Tactical Summary: ', 'บทวิเคราะห์แท็กติกหลังเกม: ')}
            </span>
            {tacticalSummary}
          </div>
        )}
      </div>

      {/* Main 3-Column Match Center Body: 2D Pitch & Commentary + Live Stats + Player Ratings & Live Subs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: 2D Tactical Pitch + Match Statistics */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">
                {tr(
                  'Live 22-Player 2D Tactical Pitch',
                  'ผังนักเตะ 22 คนเคลื่อนที่สดบนสนาม 2D (Live 2D Pitch)'
                )}
              </h3>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                {homeClub.shortName} ({homeClub.primaryTactic.formation}) vs {awayClub.shortName} ({awayClub.primaryTactic.formation})
              </span>
            </div>

            {/* Interactive 22-Player SVG Pitch Visualizer with Dynamic In/Out-of-Possession Shifts */}
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
                currentMinute === 0 ? 'base' : isHomePossession ? 'in_possession' : 'out_of_possession'
              );
              const awayPhaseCoords = computeTacticalPhaseCoordinates(
                awayClub.primaryTactic,
                currentMinute === 0 ? 'base' : !isHomePossession ? 'in_possession' : 'out_of_possession'
              );

              const ballPullX = (ballX - 50) * 0.16;
              const ballPullY = (ballY - 50) * 0.12;

              return (
                <svg
                  viewBox="0 0 100 64"
                  data-testid="live-22-player-pitch"
                  className="w-full h-auto rounded-lg border border-slate-800 bg-[#0c4a34] select-none"
                >
                  {/* Turf stripes */}
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((idx) => (
                    <rect
                      key={idx}
                      x={idx * 10}
                      y={0}
                      width={10}
                      height={64}
                      fill={idx % 2 === 0 ? '#0c4a34' : '#0f543c'}
                    />
                  ))}
                  {/* Pitch boundaries & markings */}
                  <rect x="3" y="3" width="94" height="58" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                  <line x1="50" y1="3" x2="50" y2="61" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                  <circle cx="50" cy="32" r="8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                  <rect x="3" y="15" width="14" height="34" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />
                  <rect x="83" y="15" width="14" height="34" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.5" />

                  {/* Home 11 Players (Left -> Right) */}
                  {homePhaseCoords.map((coord, idx) => {
                    const slot = homeClub.primaryTactic.lineup[idx];
                    const p = slot?.playerId ? world.players[slot.playerId] : null;
                    const isCapt = p && homeClub.primaryTactic.setPieces?.captainId === p.id;
                    const rawHoriz = Math.max(6, Math.min(72, (100 - coord.y) * 0.72 + (idx === 0 ? 0 : ballPullX)));
                    const rawVert = Math.max(8, Math.min(92, coord.x + (idx === 0 ? 0 : ballPullY)));
                    const cx = 3 + (rawHoriz / 100) * 94;
                    const cy = 3 + (rawVert / 100) * 58;
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
                          {idx + 1}
                        </text>
                        {p && (
                          <text
                            x={cx}
                            y={cy + 4.3}
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

                  {/* Away 11 Players (Right -> Left) */}
                  {awayPhaseCoords.map((coord, idx) => {
                    const slot = awayClub.primaryTactic.lineup[idx];
                    const p = slot?.playerId ? world.players[slot.playerId] : null;
                    const isCapt = p && awayClub.primaryTactic.setPieces?.captainId === p.id;
                    const rawHoriz = Math.max(
                      28,
                      Math.min(94, 100 - (100 - coord.y) * 0.72 + (idx === 0 ? 0 : ballPullX))
                    );
                    const rawVert = Math.max(8, Math.min(92, 100 - coord.x + (idx === 0 ? 0 : ballPullY)));
                    const cx = 3 + (rawHoriz / 100) * 94;
                    const cy = 3 + (rawVert / 100) * 58;
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
                          {idx + 1}
                        </text>
                        {p && (
                          <text
                            x={cx}
                            y={cy + 4.3}
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

                  {/* Curved SVG Quadratic Bezier Ball Trajectory Trail (Checkpoint 19) */}
                  {(() => {
                    const prevEv = visibleEvents.length >= 2 ? visibleEvents[visibleEvents.length - 2] : null;
                    const startX = 3 + ((prevEv ? Math.max(6, Math.min(94, prevEv.pitchX)) : 50) / 100) * 94;
                    const startY = 3 + ((prevEv ? Math.max(8, Math.min(92, prevEv.pitchY)) : 50) / 100) * 58;
                    const endX = 3 + (ballX / 100) * 94;
                    const endY = 3 + (ballY / 100) * 58;
                    const ctrlX = (startX + endX) / 2;
                    const ctrlY = Math.max(5, Math.min(59, (startY + endY) / 2 - 7));
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
                      cy={3 + (ballY / 100) * 58}
                      r="1.65"
                      fill="#facc15"
                      stroke="#000000"
                      strokeWidth="0.45"
                    />
                  </g>
                </svg>
              );
            })()}
            <canvas
              ref={canvasRef}
              width={520}
              height={310}
              data-testid="match-pitch-canvas"
              className="hidden"
            />
          </div>

          {/* Interactive Pitch Shot Map & 15-Minute xG Momentum Chart (Checkpoint 7) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300">
                {tr('Interactive Pitch Shot Map & xG Momentum', 'แผนผังจุดยิงประตู (Shot Map) & โมเมนตัม xG ราย 15 นาที')}
              </h3>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  {homeClub.shortName}
                </span>
                <span className="flex items-center gap-1 text-sky-400">
                  <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                  {awayClub.shortName}
                </span>
              </div>
            </div>

            {/* SVG Interactive Shot Map */}
            {(() => {
              const shotEvents = visibleEvents.filter(
                (e) =>
                  e.eventType === 'Goal' ||
                  e.eventType === 'Save' ||
                  e.eventType === 'BlockedShot' ||
                  e.eventType === 'Shot' ||
                  e.eventType === 'PenaltyMissed' ||
                  e.eventType === 'FreeKick'
              );
              return (
                <div className="space-y-1.5">
                  <svg
                    viewBox="0 0 100 60"
                    className="w-full h-36 bg-slate-950 rounded-lg border border-slate-800"
                  >
                    {/* Pitch markings */}
                    <rect x="2" y="2" width="96" height="56" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                    <line x1="50" y1="2" x2="50" y2="58" stroke="#1e293b" strokeWidth="0.6" />
                    <circle cx="50" cy="30" r="8" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                    {/* Left & Right Penalty Boxes */}
                    <rect x="2" y="14" width="14" height="32" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                    <rect x="84" y="14" width="14" height="32" fill="none" stroke="#1e293b" strokeWidth="0.6" />
                    {shotEvents.map((ev) => {
                      const isGoal = ev.eventType === 'Goal';
                      // For 'Save', ev.teamId is defending GK's club, so shooter is the opposite club
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
                      const radius = Math.max(1.6, Math.min(4.8, 1.4 + xgVal * 5.2));
                      return (
                        <g
                          key={ev.id}
                          onMouseEnter={() => setActiveShotTooltip(ev)}
                          onClick={() => setActiveShotTooltip(ev)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={radius}
                            fill={
                              isGoal
                                ? isHomeShot
                                  ? '#10b981'
                                  : '#38bdf8'
                                : isHomeShot
                                  ? 'rgba(16,185,129,0.28)'
                                  : 'rgba(56,189,248,0.28)'
                            }
                            stroke={isGoal ? '#ffffff' : isHomeShot ? '#10b981' : '#38bdf8'}
                            strokeWidth={isGoal ? '0.9' : '0.6'}
                          />
                        </g>
                      );
                    })}
                  </svg>
                  {activeShotTooltip ? (
                    <div className="flex items-center justify-between text-[11px] bg-slate-950 px-2.5 py-1 rounded border border-slate-800 text-slate-300 font-mono">
                      <span>
                        {activeShotTooltip.minute}' ·{' '}
                        <strong className="text-white">
                          {activeShotTooltip.secondaryPlayerName && activeShotTooltip.eventType === 'Save'
                            ? activeShotTooltip.secondaryPlayerName
                            : activeShotTooltip.playerName}
                        </strong>{' '}
                        ({activeShotTooltip.eventType})
                      </span>
                      <span className="text-emerald-400">
                        xG {(activeShotTooltip.shotXg ?? activeShotTooltip.xGDelta ?? 0.1).toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>
                        {tr(
                          'Circle size = Shot xG · Solid ring = Goal · Hover/click any shot for details',
                          'ขนาดวงกลม = ค่า xG · วงกลมทึบขอบขาว = ประตู · ชี้หรือคลิกที่จุดยิงเพื่อดูรายละเอียด'
                        )}
                      </span>
                      <span className="font-mono">{shotEvents.length} shots</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 15-Minute Interval xG Momentum Bar Chart */}
            {(() => {
              const intervals = [
                { label: "1-15'", min: 1, max: 15 },
                { label: "16-30'", min: 16, max: 30 },
                { label: "31-45'", min: 31, max: 45 },
                { label: "46-60'", min: 46, max: 60 },
                { label: "61-75'", min: 61, max: 75 },
                { label: "76-90'+", min: 76, max: 120 },
              ];
              return (
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] font-medium text-slate-400 mb-2">
                    {tr('15-Minute xG Momentum Breakdown', 'กราฟโมเมนตัมค่าคาดหวังประตู (xG) แบ่งตามช่วง 15 นาที')}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {intervals.map((iv) => {
                      let homeIvXg = 0;
                      let awayIvXg = 0;
                      for (const ev of visibleEvents) {
                        if (ev.minute >= iv.min && ev.minute <= iv.max) {
                          const xg = ev.shotXg ?? ev.xGDelta ?? 0;
                          if (xg > 0) {
                            const shooterTeam =
                              ev.eventType === 'Save'
                                ? ev.teamId === homeClub.id
                                  ? awayClub.id
                                  : homeClub.id
                                : ev.teamId;
                            if (shooterTeam === homeClub.id) homeIvXg += xg;
                            else awayIvXg += xg;
                          }
                        }
                      }
                      const homePct = Math.min(100, Math.round((homeIvXg / 1.0) * 100));
                      const awayPct = Math.min(100, Math.round((awayIvXg / 1.0) * 100));
                      return (
                        <div
                          key={iv.label}
                          className="bg-slate-950 border border-slate-800/80 rounded p-1.5 flex flex-col items-center"
                        >
                          <div className="h-14 w-full flex items-end justify-center gap-1">
                            <div
                              className="w-2.5 bg-emerald-500 rounded-t transition-all"
                              style={{ height: `${Math.max(6, homePct)}%` }}
                              title={`${homeClub.shortName}: ${homeIvXg.toFixed(2)} xG`}
                            />
                            <div
                              className="w-2.5 bg-sky-500 rounded-t transition-all"
                              style={{ height: `${Math.max(6, awayPct)}%` }}
                              title={`${awayClub.shortName}: ${awayIvXg.toFixed(2)} xG`}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 mt-1">{iv.label}</span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {homeIvXg.toFixed(1)}/{awayIvXg.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Match Statistics Comparison */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">
              {tr('Match Statistics', 'สถิติการแข่งขัน (Match Statistics)')}
            </h3>
            {[
              {
                label: tr('Possession %', 'การครองบอล (Possession %)'),
                home: simResult ? simResult.homeStats.possession : 50,
                away: simResult ? simResult.awayStats.possession : 50,
              },
              {
                label: tr('Total Shots', 'โอกาสยิงทั้งหมด (Total Shots)'),
                home: simResult ? Math.round(simResult.homeStats.totalShots * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.totalShots * progressRatio) : 0,
              },
              {
                label: tr('Shots on Target', 'ยิงเข้ากรอบ (Shots on Target)'),
                home: simResult ? Math.round(simResult.homeStats.shotsOnTarget * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.shotsOnTarget * progressRatio) : 0,
              },
              {
                label: tr('Big Chances', 'โอกาสทอง (Big Chances)'),
                home: simResult ? Math.round(simResult.homeStats.bigChances * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.bigChances * progressRatio) : 0,
              },
              {
                label: tr('Pass Accuracy %', 'ความแม่นยำการจ่ายบอล (Pass %)'),
                home: simResult ? simResult.homeStats.passAccuracy : 84,
                away: simResult ? simResult.awayStats.passAccuracy : 82,
              },
              {
                label: tr('Tackles', 'การเข้าสกัด (Tackles)'),
                home: simResult ? Math.round(simResult.homeStats.tackles * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.tackles * progressRatio) : 0,
              },
              {
                label: tr('Corners', 'เตะมุม (Corners)'),
                home: simResult ? Math.round(simResult.homeStats.corners * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.corners * progressRatio) : 0,
              },
              {
                label: tr('Fouls', 'ฟาวล์ (Fouls)'),
                home: simResult ? Math.round(simResult.homeStats.fouls * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.fouls * progressRatio) : 0,
              },
            ].map((row) => {
              const total = row.home + row.away || 1;
              const homePct = Math.round((row.home / total) * 100);
              return (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                    <span className="text-emerald-400 font-semibold">{row.home}</span>
                    <span className="text-slate-400 font-sans">{row.label}</span>
                    <span className="text-sky-400 font-semibold">{row.away}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${homePct}%` }}
                    />
                    <div
                      className="bg-sky-500 h-full"
                      style={{ width: `${100 - homePct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center 4 Cols: Match Commentary & Event Timeline */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[580px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300">
              {tr(
                `Match Commentary & Timeline (${visibleEvents.length} events)`,
                `Match Commentary & Timeline (${visibleEvents.length} เหตุการณ์)`
              )}
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {visibleEvents.length === 0 ? (
              <div className="text-center py-16 text-xs text-slate-400">
                {tr(
                  'Click "Kick Off" or "Instant Result" above to start simulating the match.',
                  'กดปุ่ม "เริ่มการแข่งขัน (Kick Off)" หรือ "จำลองผลทันที" ด้านบนเพื่อเริ่มจำลองเกมการแข่งขัน'
                )}
              </div>
            ) : (
              [...visibleEvents].reverse().map((ev) => {
                const isGoal = ev.eventType === 'Goal';
                const isCard = ev.eventType === 'YellowCard' || ev.eventType === 'RedCard';
                const isSub = ev.eventType === 'Substitution';
                return (
                  <div
                    key={ev.id}
                    className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                      isGoal
                        ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-100 font-medium'
                        : isCard
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                          : isSub
                            ? 'bg-sky-950/30 border-sky-500/40 text-sky-100'
                            : 'bg-slate-950/80 border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums mb-0.5">
                      <span>{tr(`Min ${ev.minute}'`, `นาที ${ev.minute}'`)}</span>
                      <span>{ev.eventType}</span>
                    </div>
                    <div>{ev.text}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 3 Cols: Live Touchline Substitutions & Player Ratings */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[580px]">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-slate-300">
              {tr('Lineups & Touchline Subs', 'รายชื่อผู้เล่น & เปลี่ยนตัวสำรอง')}
            </h3>
            <span className="text-[11px] font-mono text-emerald-400">
              {tr(`Subs: ${liveSubstitutions.length}/5`, `เปลี่ยนตัว: ${liveSubstitutions.length}/5`)}
            </span>
          </div>

          {/* Live Substitution Bench Picker when a starter is clicked for sub */}
          {selectedSubOutId && liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && (
            <div className="mb-3 p-2.5 rounded-lg bg-slate-950 border border-emerald-500/50 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-emerald-300 font-semibold">
                  {tr('Replace ', 'เปลี่ยนออก: ')}
                  {world.players[selectedSubOutId]?.lastName}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSubOutId(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {myBench.map((bPlayer) => (
                  <button
                    key={bPlayer.id}
                    type="button"
                    onClick={() => handleMakeSubstitution(selectedSubOutId, bPlayer.id)}
                    className="w-full flex items-center justify-between px-2 py-1 rounded bg-slate-900 hover:bg-emerald-500/20 text-[11px] text-slate-200 cursor-pointer"
                  >
                    <span>
                      <strong className="text-emerald-400 font-mono mr-1">{bPlayer.positions[0]}</strong>
                      {bPlayer.firstName[0]}. {bPlayer.lastName}
                    </span>
                    <span className="font-mono text-slate-400">{bPlayer.fitness}% Fit</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {[homeClub, awayClub].map((club) => {
              const isMyTeam = club.id === myClub.id;
              const starters: Player[] = club.primaryTactic.lineup
                .map((s) => (s.playerId ? world.players[s.playerId] : null))
                .filter((p): p is Player => Boolean(p));

              return (
                <div key={club.id} className="mb-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-1.5 flex items-center justify-between">
                    <span>
                      {club.name} ({club.primaryTactic.formation})
                    </span>
                    {isMyTeam && liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && (
                      <span className="text-[10px] text-slate-400 font-normal">
                        {tr('Click ⇄ to Sub', 'กด ⇄ เพื่อเปลี่ยนตัว')}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {starters.map((p) => {
                      const rating = simResult?.playerRatings[p.id] ?? 6.7;
                      const isMotm = simResult?.manOfTheMatchPlayerId === p.id && currentMinute >= maxMatchMinute;
                      // Live stamina drain visual during match
                      const liveCondition = Math.max(
                        35,
                        Math.round(p.fitness - (currentMinute / 90) * (24 - p.attributes.physical.stamina * 0.5))
                      );
                      return (
                        <div
                          key={p.id}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 hover:bg-slate-800 text-xs transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => onSelectPlayer(p.id)}
                            className="flex items-center gap-2 truncate text-left flex-1 cursor-pointer"
                          >
                            <span className="text-[11px] font-mono text-slate-400 w-7 text-left">
                              {p.positions[0]}
                            </span>
                            <span className="text-slate-200 truncate">
                              {p.firstName[0]}. {p.lastName}
                            </span>
                            {isMotm && (
                              <span className="text-[10px] text-amber-400 font-mono">★ MOTM</span>
                            )}
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-[10px] font-mono tabular-nums ${
                                liveCondition < 65 ? 'text-rose-400' : 'text-slate-400'
                              }`}
                            >
                              {liveCondition}%
                            </span>
                            {isMyTeam && liveSubstitutions.length < 5 && currentMinute < maxMatchMinute && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedSubOutId(selectedSubOutId === p.id ? null : p.id)
                                }
                                title={tr('Substitute Player', 'เปลี่ยนตัวผู้เล่น')}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-mono cursor-pointer"
                              >
                                ⇄
                              </button>
                            )}
                            <span
                              className={`font-mono tabular-nums font-semibold w-7 text-right ${
                                rating >= 7.5
                                  ? 'text-emerald-400'
                                  : rating >= 6.5
                                    ? 'text-slate-200'
                                    : 'text-amber-400'
                              }`}
                            >
                              {currentMinute === 0 ? '-' : rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
