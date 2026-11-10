import React, { useEffect, useRef, useState } from 'react';
import {
  Club,
  Fixture,
  MatchEvent,
  MatchResult,
  Mentality,
  Player,
  TacticalSystem,
  WorldState,
} from '../types/game';
import {
  reconcileMatchResultEventsAndStats,
  simulateMatch,
} from '../engine/matchEngine';
import { soundService } from '../engine/soundService';

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
  const [currentMinute, setCurrentMinute] = useState<number>(
    targetFixture?.status === 'Completed' ? 90 : 0
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
  }>({
    minute: 0,
    ballX: 50,
    ballY: 50,
    targetBallX: 50,
    targetBallY: 50,
    flashTimer: 0,
    homeColor: homeClub.primaryColor,
    awayColor: awayClub.primaryColor,
  });

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
      setCurrentMinute(90);
      setIsPlaying(false);
      setCommittedToWorld(true);
    } else if (targetFixture.status === 'Scheduled') {
      setSimResult(null);
      setCurrentMinute(0);
      setIsPlaying(false);
      setCommittedToWorld(false);
      setTeamTalkGiven(null);
      setTacticalSummary(null);
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
      !isUserHome ? customTactic : undefined
    );
    setSimResult(computed);
    return computed;
  };

  // Minute progression timer when playing live
  useEffect(() => {
    if (!isPlaying || !simResult) return;
    const intervalMs = speed === 4 ? 70 : speed === 2 ? 140 : 260;

    const timer = setInterval(() => {
      setCurrentMinute((prev) => {
        if (prev >= 90) {
          setIsPlaying(false);
          soundService.playWhistle();
          return 90;
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

  // Auto-commit match result to WorldState when reaching 90'
  useEffect(() => {
    if (currentMinute === 90 && simResult && targetFixture && !committedToWorld) {
      setCommittedToWorld(true);
      onCompleteMatch(targetFixture.id, simResult);
    }
  }, [currentMinute, simResult, targetFixture, committedToWorld, onCompleteMatch]);

  // Isolated 60fps 2D Tactical Pitch Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    let lastTime = performance.now();

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

      // Draw 11 Home dots & 11 Away dots shifting with ball
      const homeBaseCoords = [
        [8, 50], [22, 20], [20, 38], [20, 62], [22, 80],
        [38, 30], [36, 50], [38, 70], [58, 22], [58, 78], [66, 50],
      ];
      const awayBaseCoords = [
        [92, 50], [78, 20], [80, 38], [80, 62], [78, 80],
        [62, 30], [64, 50], [62, 70], [42, 22], [42, 78], [34, 50],
      ];

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
    ensureSimulationComputed();
    if (currentMinute >= 90) return;
    setIsPlaying((p) => !p);
  };

  const handleInstantResult = () => {
    soundService.playWhistle();
    const computed = ensureSimulationComputed();
    setIsPlaying(false);
    setCurrentMinute(90);
    if (targetFixture && !committedToWorld) {
      setCommittedToWorld(true);
      onCompleteMatch(targetFixture.id, computed);
    }
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
    // If match is in progress before 90', recompute future events with new mentality
    if (targetFixture && currentMinute > 0 && currentMinute < 90) {
      const reSeed = world.randomSeed + currentMinute * 313 + newMentality.length * 19;
      const newSim = simulateMatch(
        targetFixture,
        homeClub,
        awayClub,
        world.players,
        reSeed,
        isUserHome ? updatedTactic : undefined,
        !isUserHome ? updatedTactic : undefined
      );
      // Preserve past events up to currentMinute, splice future events, and reconcile all scorelines & commentary
      const pastEvents = (simResult?.events || []).filter((e) => e.minute <= currentMinute);
      const futureEvents = newSim.events.filter((e) => e.minute > currentMinute);
      const mergedEvents: MatchEvent[] = [
        ...pastEvents,
        {
          id: `tac_chg_${currentMinute}`,
          fixtureId: targetFixture.id,
          minute: currentMinute,
          eventType: 'TacticalChange',
          teamId: myClub.id,
          text: `นาที ${currentMinute}': ${myClub.shortName} ปรับแท็กติก Mentality เป็น "${newMentality}" ข้างสนาม`,
          pitchX: 50,
          pitchY: 50,
        },
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

  const progressRatio = Math.max(0.05, currentMinute / 90);

  const handleGenerateTacticalSummary = () => {
    if (!simResult) return;
    const homePoss = simResult.homeStats.possession;
    const awayPoss = simResult.awayStats.possession;
    const homeXG = (simResult.homeStats.xG * progressRatio).toFixed(2);
    const awayXG = (simResult.awayStats.xG * progressRatio).toFixed(2);
    const goalEvents = visibleEvents.filter((e) => e.eventType === 'Goal');
    const scorersText =
      goalEvents.length > 0
        ? `จังหวะทำประตูสำคัญเกิดขึ้นในนาทีที่ ${goalEvents.map((g) => `${g.minute}'`).join(', ')}`
        : 'ทั้งสองทีมยังสู้กันอย่างสูสีในแดนกลางและยังไม่มีประตูเกิดขึ้น';
    setTacticalSummary(
      `สรุปภาพรวมแท็กติก (นาที ${currentMinute}'): ${homeClub.name} ${visibleHomeGoals} - ${visibleAwayGoals} ${awayClub.name} · ครองบอล ${homePoss}% ต่อ ${awayPoss}% · ค่าคาดหวังประตู (xG) ${homeXG} ต่อ ${awayXG} · ${scorersText}`
    );
  };

  return (
    <div className="space-y-4">
      {/* Match Scoreboard Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex items-center gap-3 flex-1">
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center font-display font-bold text-base text-slate-950 shrink-0"
              style={{ backgroundColor: homeClub.primaryColor }}
            >
              {homeClub.shortName}
            </div>
            <div>
              <div className="text-lg font-display font-bold text-white">{homeClub.name}</div>
              <div className="text-xs text-slate-400">
                เจ้าบ้าน · แผน {homeClub.primaryTactic.formation} · xG{' '}
                <span className="font-mono tabular-nums text-emerald-400">
                  {simResult ? (simResult.homeStats.xG * progressRatio).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Center Score & Clock */}
          <div className="flex flex-col items-center px-6 py-2 bg-slate-950 border border-slate-800 rounded-xl min-w-[210px]">
            <div className="text-xs text-emerald-400 font-mono tabular-nums mb-0.5">
              {currentMinute === 0
                ? `Matchday ${targetFixture?.matchday || 1} · Pre-Match`
                : currentMinute === 45 && !isPlaying
                  ? 'HALF-TIME (พักครึ่ง 45’)'
                  : currentMinute >= 90
                    ? 'FULL-TIME (จบเกม 90’)'
                    : `LIVE · นาที ${currentMinute}'`}
            </div>
            <div className="text-3xl font-display font-bold text-white tracking-wider font-mono tabular-nums">
              {visibleHomeGoals} : {visibleAwayGoals}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              สนาม {homeClub.stadiumName}
            </div>
          </div>

          {/* Away Team */}
          <div className="flex items-center justify-end gap-3 flex-1 text-right">
            <div>
              <div className="text-lg font-display font-bold text-white">{awayClub.name}</div>
              <div className="text-xs text-slate-400">
                ทีมเยือน · แผน {awayClub.primaryTactic.formation} · xG{' '}
                <span className="font-mono tabular-nums text-sky-400">
                  {simResult ? (simResult.awayStats.xG * progressRatio).toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
            <div
              className="w-11 h-11 rounded-lg flex items-center justify-center font-display font-bold text-base text-slate-950 shrink-0"
              style={{ backgroundColor: awayClub.primaryColor }}
            >
              {awayClub.shortName}
            </div>
          </div>
        </div>

        {/* Match Controls Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleStartOrTogglePlay}
              disabled={currentMinute >= 90}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {currentMinute === 0
                ? 'เริ่มการแข่งขัน (Kick Off)'
                : isPlaying
                  ? 'หยุดเกมชั่วคราว (Pause)'
                  : currentMinute >= 90
                    ? 'จบการแข่งขันแล้ว'
                    : 'เล่นต่อ (Resume Match)'}
            </button>

            <button
              type="button"
              onClick={handleInstantResult}
              disabled={currentMinute >= 90}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 font-medium text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              จำลองผลทันที (Instant Result)
            </button>

            {currentMinute >= 90 &&
              nextScheduledFixture &&
              nextScheduledFixture.id !== targetFixture?.id && (
                <button
                  type="button"
                  onClick={() => setLockedFixtureId(nextScheduledFixture.id)}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border border-emerald-500/40 font-semibold text-xs rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  เตรียมพร้อมนัดถัดไป (Matchday {nextScheduledFixture.matchday}) →
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
              สั่งการข้างสนาม (Mentality):
            </label>
            <select
              id="live-mentality-select"
              value={liveMentality}
              onChange={(e) => handleMentalityChange(e.target.value as Mentality)}
              disabled={currentMinute >= 90}
              className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
            >
              <option value="Very Defensive">Very Defensive (อุดเต็มสูบ)</option>
              <option value="Defensive">Defensive (รัดกุม)</option>
              <option value="Cautious">Cautious (ระมัดระวัง)</option>
              <option value="Balanced">Balanced (สมดุล)</option>
              <option value="Positive">Positive (เดินหน้าบุก)</option>
              <option value="Attacking">Attacking (เปิดเกมรุก)</option>
              <option value="Very Attacking">Very Attacking (ลุยแหลก)</option>
            </select>

            {currentMinute > 0 && (
              <button
                type="button"
                onClick={handleGenerateTacticalSummary}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-xs rounded-lg cursor-pointer whitespace-nowrap"
              >
                สรุปบทวิเคราะห์เกม
              </button>
            )}
          </div>
        </div>

        {/* Half-time Team Talk Prompt */}
        {currentMinute === 45 && !teamTalkGiven && (
          <div className="mt-4 p-4 rounded-lg bg-slate-950 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-emerald-400">
                Half-Time Team Talk (พูดคุยในห้องแต่งตัวช่วงพักครึ่ง)
              </div>
              <div className="text-xs text-slate-300">
                เลือกคำพูดปลุกใจลูกทีมก่อนเริ่มครึ่งเวลาหลัง
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'encourage', label: 'กระตุ้นให้สู้เต็มที่ (Encourage)' },
                { id: 'praise', label: 'ชมเชยฟอร์มการเล่น (Praise)' },
                { id: 'demand', label: 'เรียกร้องความมุ่งมั่นเพิ่ม (Demand More)' },
              ].map((talk) => (
                <button
                  key={talk.id}
                  type="button"
                  onClick={() => {
                    setTeamTalkGiven(talk.label);
                    setIsPlaying(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                >
                  {talk.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {tacticalSummary && (
          <div className="mt-3 p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 leading-relaxed">
            <span className="font-semibold text-emerald-400">บทวิเคราะห์แท็กติกหลังเกม: </span>
            {tacticalSummary}
          </div>
        )}
      </div>

      {/* Main 3-Column Match Center Body: 2D Pitch & Commentary + Live Stats + Player Ratings */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 5 Cols: 2D Tactical Pitch + Match Timeline */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-300">
                2D Tactical Pitch Radar (มุมมองแท็กติกในสนาม)
              </h3>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                {homeClub.shortName} (ซ้าย) vs {awayClub.shortName} (ขวา)
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={520}
              height={310}
              data-testid="match-pitch-canvas"
              className="w-full h-auto rounded-lg border border-slate-800"
            />
          </div>

          {/* Match Statistics Comparison */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">
              สถิติการแข่งขัน (Match Statistics)
            </h3>
            {[
              {
                label: 'การครองบอล (Possession %)',
                home: simResult ? simResult.homeStats.possession : 50,
                away: simResult ? simResult.awayStats.possession : 50,
              },
              {
                label: 'โอกาสยิงทั้งหมด (Total Shots)',
                home: simResult ? Math.round(simResult.homeStats.totalShots * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.totalShots * progressRatio) : 0,
              },
              {
                label: 'ยิงเข้ากรอบ (Shots on Target)',
                home: simResult ? Math.round(simResult.homeStats.shotsOnTarget * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.shotsOnTarget * progressRatio) : 0,
              },
              {
                label: 'โอกาสทอง (Big Chances)',
                home: simResult ? Math.round(simResult.homeStats.bigChances * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.bigChances * progressRatio) : 0,
              },
              {
                label: 'ความแม่นยำการจ่ายบอล (Pass %)',
                home: simResult ? simResult.homeStats.passAccuracy : 84,
                away: simResult ? simResult.awayStats.passAccuracy : 82,
              },
              {
                label: 'การเข้าสกัด (Tackles)',
                home: simResult ? Math.round(simResult.homeStats.tackles * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.tackles * progressRatio) : 0,
              },
              {
                label: 'เตะมุม (Corners)',
                home: simResult ? Math.round(simResult.homeStats.corners * progressRatio) : 0,
                away: simResult ? Math.round(simResult.awayStats.corners * progressRatio) : 0,
              },
              {
                label: 'ฟาวล์ (Fouls)',
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
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[560px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300">
              Match Commentary & Timeline ({visibleEvents.length} เหตุการณ์)
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {visibleEvents.length === 0 ? (
              <div className="text-center py-16 text-xs text-slate-400">
                กดปุ่ม <span className="text-emerald-400 font-semibold">"เริ่มการแข่งขัน (Kick Off)"</span> หรือ{' '}
                <span className="text-slate-200 font-semibold">"จำลองผลทันที"</span> ด้านบนเพื่อเริ่มจำลองเกมการแข่งขัน
              </div>
            ) : (
              [...visibleEvents].reverse().map((ev) => {
                const isGoal = ev.eventType === 'Goal';
                const isCard = ev.eventType === 'YellowCard' || ev.eventType === 'RedCard';
                return (
                  <div
                    key={ev.id}
                    className={`p-2.5 rounded-lg border text-xs leading-relaxed ${
                      isGoal
                        ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-100 font-medium'
                        : isCard
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                          : 'bg-slate-950/80 border-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums mb-0.5">
                      <span>นาที {ev.minute}'</span>
                      <span>{ev.eventType}</span>
                    </div>
                    <div>{ev.text}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right 3 Cols: Player Ratings & Lineups */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[560px]">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">
            คะแนนผู้เล่นในสนาม (Player Ratings)
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {[homeClub, awayClub].map((club) => {
              const starters: Player[] = club.primaryTactic.lineup
                .map((s) => (s.playerId ? world.players[s.playerId] : null))
                .filter((p): p is Player => Boolean(p));

              return (
                <div key={club.id} className="mb-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-1.5">
                    {club.name} ({club.primaryTactic.formation})
                  </div>
                  <div className="space-y-1">
                    {starters.map((p) => {
                      const rating = simResult?.playerRatings[p.id] ?? 6.7;
                      const isMotm = simResult?.manOfTheMatchPlayerId === p.id && currentMinute >= 90;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPlayer(p.id)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950/80 hover:bg-slate-800 text-xs transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-[11px] font-mono text-slate-400 w-7 text-left">
                              {p.positions[0]}
                            </span>
                            <span className="text-slate-200 truncate">
                              {p.firstName[0]}. {p.lastName}
                            </span>
                            {isMotm && (
                              <span className="text-[10px] text-amber-400 font-mono">★ MOTM</span>
                            )}
                          </div>
                          <span
                            className={`font-mono tabular-nums font-semibold ${
                              rating >= 7.5
                                ? 'text-emerald-400'
                                : rating >= 6.5
                                  ? 'text-slate-200'
                                  : 'text-amber-400'
                            }`}
                          >
                            {currentMinute === 0 ? '-' : rating.toFixed(1)}
                          </span>
                        </button>
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
