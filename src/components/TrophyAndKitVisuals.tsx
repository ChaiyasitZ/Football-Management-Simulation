import React from 'react';
import { Club, CupId, LeagueId, UefaCompetitionId } from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { UEFA_COMPETITIONS_CONFIG } from '../engine/uefaEngine';

/* ============================================================================
   1. AUTHENTIC COMPETITION & LEAGUE EMBLEMS (15 Leagues, 3 UEFA, 10 Cups, Global)
============================================================================ */

export type CompetitionVisualId =
  | LeagueId
  | UefaCompetitionId
  | CupId
  | 'FIFA_CWC'
  | 'EURO_NATIONS'
  | 'WORLD_CUP';

interface CompStyleMeta {
  shortCode: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  accent: string;
  motif: 'crown_lion' | 'starball' | 'uel_wave' | 'uecl_spire' | 'laliga' | 'bundesliga' | 'serie_a' | 'ligue_1' | 'cup_shield' | 'globe_crown' | 'heraldic';
}

const COMPETITION_STYLE_MAP: Record<string, CompStyleMeta> = {
  // UEFA Competitions
  UEFA_UCL: {
    shortCode: 'UCL',
    title: 'UEFA Champions League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#091442',
    secondary: '#1d4ed8',
    accent: '#e2e8f0',
    motif: 'starball',
  },
  UEFA_UEL: {
    shortCode: 'UEL',
    title: 'UEFA Europa League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#1c1917',
    secondary: '#ea580c',
    accent: '#fb923c',
    motif: 'uel_wave',
  },
  UEFA_UECL: {
    shortCode: 'UECL',
    title: 'UEFA Conference League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#052e16',
    secondary: '#16a34a',
    accent: '#4ade80',
    motif: 'uecl_spire',
  },
  // Top 5 Leagues
  ENG_PL: {
    shortCode: 'PL',
    title: 'Premier League',
    subtitle: 'England · Tier 1',
    primary: '#38003c',
    secondary: '#9333ea',
    accent: '#00ff85',
    motif: 'crown_lion',
  },
  ESP_LL: {
    shortCode: 'LALIGA',
    title: 'LaLiga EA Sports',
    subtitle: 'Spain · Tier 1',
    primary: '#450a0a',
    secondary: '#ff4b44',
    accent: '#ffffff',
    motif: 'laliga',
  },
  GER_BL: {
    shortCode: 'BUNDESLIGA',
    title: 'Bundesliga',
    subtitle: 'Germany · Tier 1',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'bundesliga',
  },
  ITA_SA: {
    shortCode: 'SERIE A',
    title: 'Serie A Enilive',
    subtitle: 'Italy · Tier 1',
    primary: '#0c4a6e',
    secondary: '#0284c7',
    accent: '#38bdf8',
    motif: 'serie_a',
  },
  FRA_L1: {
    shortCode: 'L1',
    title: 'Ligue 1 McDonald’s',
    subtitle: 'France · Tier 1',
    primary: '#0f172a',
    secondary: '#1e3a8a',
    accent: '#bef264',
    motif: 'ligue_1',
  },
  // European Tier 1 Leagues
  POR_LP: {
    shortCode: 'LIGA PT',
    title: 'Liga Portugal Betclic',
    subtitle: 'Portugal · Tier 1',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'heraldic',
  },
  NED_ED: {
    shortCode: 'EREDIVISIE',
    title: 'Eredivisie',
    subtitle: 'Netherlands · Tier 1',
    primary: '#1e1b4b',
    secondary: '#ea580c',
    accent: '#ffffff',
    motif: 'crown_lion',
  },
  BEL_PL: {
    shortCode: 'JPL',
    title: 'Jupiler Pro League',
    subtitle: 'Belgium · Tier 1',
    primary: '#450a0a',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'heraldic',
  },
  TUR_SL: {
    shortCode: 'SÜPER LİG',
    title: 'Trendyol Süper Lig',
    subtitle: 'Turkey · Tier 1',
    primary: '#7f1d1d',
    secondary: '#ef4444',
    accent: '#ffffff',
    motif: 'starball',
  },
  SCO_PR: {
    shortCode: 'SPFL',
    title: 'Scottish Premiership',
    subtitle: 'Scotland · Tier 1',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#ffffff',
    motif: 'crown_lion',
  },
  // Second Divisions
  ENG_CH: {
    shortCode: 'EFL CH',
    title: 'EFL Championship',
    subtitle: 'England · Tier 2',
    primary: '#1e3a8a',
    secondary: '#b45309',
    accent: '#facc15',
    motif: 'crown_lion',
  },
  ESP_SD: {
    shortCode: 'LALIGA 2',
    title: 'LaLiga Hypermotion',
    subtitle: 'Spain · Tier 2',
    primary: '#0f172a',
    secondary: '#e11d48',
    accent: '#38bdf8',
    motif: 'laliga',
  },
  GER_2B: {
    shortCode: '2. BL',
    title: '2. Bundesliga',
    subtitle: 'Germany · Tier 2',
    primary: '#1f2937',
    secondary: '#dc2626',
    accent: '#e5e7eb',
    motif: 'bundesliga',
  },
  ITA_SB: {
    shortCode: 'SERIE B',
    title: 'Serie BKT',
    subtitle: 'Italy · Tier 2',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#facc15',
    motif: 'serie_a',
  },
  FRA_L2: {
    shortCode: 'L2',
    title: 'Ligue 2 BKT',
    subtitle: 'France · Tier 2',
    primary: '#0f172a',
    secondary: '#0284c7',
    accent: '#2dd4bf',
    motif: 'ligue_1',
  },
  // Domestic Cups
  ENG_CUP: {
    shortCode: 'FA CUP',
    title: 'Emirates FA Cup',
    subtitle: 'English Knockout Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'cup_shield',
  },
  ESP_CUP: {
    shortCode: 'COPA',
    title: 'Copa del Rey',
    subtitle: 'Spanish Royal Cup',
    primary: '#78350f',
    secondary: '#d97706',
    accent: '#fef08a',
    motif: 'cup_shield',
  },
  GER_CUP: {
    shortCode: 'DFB-POKAL',
    title: 'DFB-Pokal',
    subtitle: 'German Knockout Cup',
    primary: '#064e3b',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'cup_shield',
  },
  ITA_CUP: {
    shortCode: 'COPPA',
    title: 'Coppa Italia Frecciarossa',
    subtitle: 'Italian National Cup',
    primary: '#0c4a6e',
    secondary: '#dc2626',
    accent: '#22c55e',
    motif: 'cup_shield',
  },
  FRA_CUP: {
    shortCode: 'CDF',
    title: 'Coupe de France',
    subtitle: 'French Knockout Cup',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#ef4444',
    motif: 'cup_shield',
  },
  POR_CUP: {
    shortCode: 'TAÇA',
    title: 'Taça de Portugal',
    subtitle: 'Portuguese Cup',
    primary: '#7f1d1d',
    secondary: '#16a34a',
    accent: '#facc15',
    motif: 'cup_shield',
  },
  NED_CUP: {
    shortCode: 'KNVB',
    title: 'TOTO KNVB Beker',
    subtitle: 'Dutch Knockout Cup',
    primary: '#7c2d12',
    secondary: '#ea580c',
    accent: '#ffffff',
    motif: 'cup_shield',
  },
  BEL_CUP: {
    shortCode: 'CROKY',
    title: 'Croky Cup',
    subtitle: 'Belgian Cup',
    primary: '#450a0a',
    secondary: '#eab308',
    accent: '#ffffff',
    motif: 'cup_shield',
  },
  TUR_CUP: {
    shortCode: 'ZTK',
    title: 'Ziraat Türkiye Kupası',
    subtitle: 'Turkish Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'cup_shield',
  },
  SCO_CUP: {
    shortCode: 'SCO CUP',
    title: 'Scottish Gas Scottish Cup',
    subtitle: 'Scottish Knockout Cup',
    primary: '#1e3a8a',
    secondary: '#38bdf8',
    accent: '#ffffff',
    motif: 'cup_shield',
  },
  // Global / International
  FIFA_CWC: {
    shortCode: 'CWC',
    title: 'FIFA Club World Cup',
    subtitle: 'Global Club Championship',
    primary: '#1c1917',
    secondary: '#d97706',
    accent: '#fde047',
    motif: 'globe_crown',
  },
  EURO_NATIONS: {
    shortCode: 'EURO',
    title: 'UEFA European Championship',
    subtitle: 'International Nations Tournament',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#facc15',
    motif: 'globe_crown',
  },
  WORLD_CUP: {
    shortCode: 'WORLD CUP',
    title: 'FIFA World Cup',
    subtitle: 'World Football Championship',
    primary: '#052e16',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'globe_crown',
  },
};

export const CompetitionBadge: React.FC<{
  competitionId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ competitionId, size = 'md', className = '' }) => {
  const meta: CompStyleMeta = COMPETITION_STYLE_MAP[competitionId] || {
    shortCode: competitionId.slice(0, 4).toUpperCase(),
    title: LEAGUES_CONFIG[competitionId as LeagueId]?.name || UEFA_COMPETITIONS_CONFIG[competitionId as UefaCompetitionId]?.name || competitionId,
    subtitle: 'Official Competition',
    primary: '#0f172a',
    secondary: '#10b981',
    accent: '#ffffff',
    motif: 'heraldic',
  };

  const dims =
    size === 'xs'
      ? 'w-5 h-5'
      : size === 'sm'
        ? 'w-7 h-7'
        : size === 'lg'
          ? 'w-12 h-12'
          : 'w-9 h-9';

  const gradId = `comp-grad-${competitionId.replace(/[^a-zA-Z0-9]/g, '')}-${size}`;

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 select-none ${dims} ${className}`}
      title={meta.title}
      data-testid={`comp-badge-${competitionId}`}
    >
      <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={meta.primary} />
            <stop offset="100%" stopColor={meta.secondary} />
          </linearGradient>
        </defs>

        {/* Outer Crest / Hexagonal Shield */}
        <path
          d="M32 3 L57 13 V33 C57 48 45 57 32 61 C19 57 7 48 7 33 V13 Z"
          fill={`url(#${gradId})`}
          stroke={meta.accent}
          strokeWidth="2.5"
        />
        <path
          d="M32 7 L53 15.5 V32.5 C53 45 43 53 32 56.5 C21 53 11 45 11 32.5 V15.5 Z"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.22"
          strokeWidth="1.2"
        />

        {/* Authentic Competition Center Motif */}
        {meta.motif === 'starball' && (
          <g>
            <circle cx="32" cy="27" r="11.5" fill="none" stroke={meta.accent} strokeWidth="1.6" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const sx = 32 + Math.cos(rad) * 7.2;
              const sy = 27 + Math.sin(rad) * 7.2;
              return (
                <polygon
                  key={deg}
                  points={`${sx},${sy - 2.6} ${sx + 0.9},${sy - 0.8} ${sx + 2.7},${sy - 0.8} ${sx + 1.2},${sy + 0.5} ${sx + 1.7},${sy + 2.3} ${sx},${sy + 1.2} ${sx - 1.7},${sy + 2.3} ${sx - 1.2},${sy + 0.5} ${sx - 2.7},${sy - 0.8} ${sx - 0.9},${sy - 0.8}`}
                  fill={meta.accent}
                />
              );
            })}
            <circle cx="32" cy="27" r="2.6" fill={meta.accent} />
          </g>
        )}

        {meta.motif === 'crown_lion' && (
          <g>
            {/* Crown on top */}
            <path
              d="M22 22 L25 15 L32 20 L39 15 L42 22 Z"
              fill={meta.accent}
            />
            {/* Lion / Mane shield silhouette */}
            <circle cx="32" cy="29" r="7.5" fill={meta.accent} fillOpacity="0.2" stroke={meta.accent} strokeWidth="1.8" />
            <path d="M28 28 L32 24 L36 28 L32 34 Z" fill={meta.accent} />
          </g>
        )}

        {meta.motif === 'uel_wave' && (
          <g>
            <path
              d="M21 18 H43 L39 32 C38 36 35 38 32 38 C29 38 26 36 25 32 Z"
              fill="none"
              stroke={meta.accent}
              strokeWidth="2.4"
            />
            <path d="M24 23 H40 M26 28 H38" stroke="#ffffff" strokeWidth="1.8" />
          </g>
        )}

        {meta.motif === 'uecl_spire' && (
          <g>
            <path
              d="M23 18 C26 26 26 31 23 37 M41 18 C38 26 38 31 41 37 M32 16 V38"
              stroke={meta.accent}
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="32" cy="26" r="4.5" fill={meta.accent} />
          </g>
        )}

        {meta.motif === 'serie_a' && (
          <g>
            {/* Scudetto & A */}
            <polygon points="32,14 43,26 32,38 21,26" fill="#ffffff" fillOpacity="0.15" stroke={meta.accent} strokeWidth="1.8" />
            <path d="M27 33 L32 19 L37 33 M28.5 29 H35.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
            {/* Tricolore bar */}
            <rect x="23" y="36" width="6" height="2.2" fill="#16a34a" />
            <rect x="29" y="36" width="6" height="2.2" fill="#ffffff" />
            <rect x="35" y="36" width="6" height="2.2" fill="#dc2626" />
          </g>
        )}

        {meta.motif === 'laliga' && (
          <g>
            <path
              d="M23 17 V33 H31 M34 17 V33 H42"
              fill="none"
              stroke={meta.accent}
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {meta.motif === 'bundesliga' && (
          <g>
            <circle cx="38" cy="21" r="2.6" fill={meta.accent} />
            <path
              d="M22 33 C26 27 31 24 38 26 M27 19 L33 26 L28 35"
              fill="none"
              stroke={meta.accent}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </g>
        )}

        {meta.motif === 'ligue_1' && (
          <g>
            <polygon
              points="32,15 43,21 43,33 32,39 21,33 21,21"
              fill="none"
              stroke={meta.accent}
              strokeWidth="2.4"
            />
            <circle cx="32" cy="27" r="4" fill={meta.accent} />
          </g>
        )}

        {(meta.motif === 'cup_shield' || meta.motif === 'globe_crown' || meta.motif === 'heraldic') && (
          <g>
            <path
              d="M25 18 H39 V26 C39 31 36 34 32 34 C28 34 25 31 25 26 Z"
              fill={meta.accent}
              fillOpacity="0.9"
            />
            <path
              d="M25 20 H21 C21 25 23 27 25 27 M39 20 H43 C43 25 41 27 39 27 M29 34 V38 H35 V34"
              fill="none"
              stroke={meta.accent}
              strokeWidth="2"
            />
          </g>
        )}

        {/* Bottom Competition Ribbon Text */}
        <rect x="13" y="42" width="38" height="11" rx="3" fill="#020617" fillOpacity="0.82" stroke={meta.accent} strokeWidth="0.9" />
        <text
          x="32"
          y="49.8"
          textAnchor="middle"
          fill="#ffffff"
          fontSize={meta.shortCode.length > 6 ? '6.2' : '7.5'}
          fontFamily="monospace"
          fontWeight="800"
          letterSpacing="0.4"
        >
          {meta.shortCode.slice(0, 8)}
        </text>
      </svg>
    </div>
  );
};

/* ============================================================================
   2. REAL COMPETITION TROPHIES (UCL Big Ears, Premier League Crown, World Cup, etc.)
============================================================================ */

export type TrophyType =
  | 'UEFA_UCL'
  | 'UEFA_UEL'
  | 'UEFA_UECL'
  | 'ENG_PL'
  | 'ESP_LL'
  | 'GER_BL'
  | 'ITA_SA'
  | 'FRA_L1'
  | 'WORLD_CUP'
  | 'EURO_NATIONS'
  | 'FIFA_CWC'
  | 'DOMESTIC_CUP'
  | 'BALLON_DOR'
  | 'GOLDEN_BOOT';

export function resolveTrophyType(competitionIdOrName: string): TrophyType {
  const id = (competitionIdOrName || '').toUpperCase();
  if (id.includes('UCL') || id.includes('CHAMPIONS LEAGUE')) return 'UEFA_UCL';
  if (id.includes('UEL') || id.includes('EUROPA LEAGUE')) return 'UEFA_UEL';
  if (id.includes('UECL') || id.includes('CONFERENCE LEAGUE')) return 'UEFA_UECL';
  if (id.includes('ENG_PL') || id.includes('PREMIER LEAGUE')) return 'ENG_PL';
  if (id.includes('ESP_LL') || id.includes('LALIGA')) return 'ESP_LL';
  if (id.includes('GER_BL') || id.includes('BUNDESLIGA') || id.includes('GER_2B')) return 'GER_BL';
  if (id.includes('ITA_SA') || id.includes('SERIE A') || id.includes('ITA_SB')) return 'ITA_SA';
  if (id.includes('FRA_L1') || id.includes('LIGUE 1') || id.includes('FRA_L2')) return 'FRA_L1';
  if (id.includes('WORLD CUP') && !id.includes('CLUB')) return 'WORLD_CUP';
  if (id.includes('CWC') || id.includes('CLUB WORLD CUP')) return 'FIFA_CWC';
  if (id.includes('EURO') || id.includes('NATIONS')) return 'EURO_NATIONS';
  if (id.includes('BALLON')) return 'BALLON_DOR';
  if (id.includes('BOOT') || id.includes('SCORER')) return 'GOLDEN_BOOT';
  if (id.includes('CUP') || id.includes('POKAL') || id.includes('COPA') || id.includes('COPPA') || id.includes('COUPE') || id.includes('TAÇA') || id.includes('BEKER')) {
    return 'DOMESTIC_CUP';
  }
  return 'ENG_PL';
}

export const TrophyArtwork: React.FC<{
  competitionId?: string;
  trophyType?: TrophyType;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  customLabel?: string;
  className?: string;
}> = ({
  competitionId = 'ENG_PL',
  trophyType,
  size = 'md',
  showLabel = false,
  customLabel,
  className = '',
}) => {
  const resolved = trophyType || resolveTrophyType(competitionId);
  const dims =
    size === 'xs'
      ? 'w-6 h-6'
      : size === 'sm'
        ? 'w-9 h-9'
        : size === 'lg'
          ? 'w-16 h-16'
          : size === 'xl'
            ? 'w-24 h-24'
            : 'w-12 h-12';

  const uid = `trp-${resolved}-${size}`;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center shrink-0 select-none ${className}`}
      title={customLabel || `${resolved.replace(/_/g, ' ')} Trophy`}
      data-testid={`trophy-artwork-${resolved}`}
    >
      <div className={dims}>
        <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-md">
        <defs>
          <linearGradient id={`${uid}-silver`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="70%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <linearGradient id={`${uid}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#facc15" />
            <stop offset="75%" stopColor="#ca8a04" />
            <stop offset="100%" stopColor="#fde047" />
          </linearGradient>
        </defs>

        {/* 1. UEFA CHAMPIONS LEAGUE ("BIG EARS") */}
        {resolved === 'UEFA_UCL' && (
          <g>
            {/* Glowing aura */}
            <circle cx="40" cy="40" r="32" fill="#1d4ed8" fillOpacity="0.14" />
            {/* Iconic Twin "Big Ears" Handles curving high above the rim */}
            <path
              d="M26 24 C10 10, 8 42, 27 44"
              fill="none"
              stroke={`url(#${uid}-silver)`}
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              d="M54 24 C70 10, 72 42, 53 44"
              fill="none"
              stroke={`url(#${uid}-silver)`}
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            {/* Cup Body & Flared Rim */}
            <ellipse cx="40" cy="18" rx="14" ry="3.5" fill="#94a3b8" stroke="#f8fafc" strokeWidth="1.2" />
            <path
              d="M26 18 L28 45 C29 53, 51 53, 52 45 L54 18 Z"
              fill={`url(#${uid}-silver)`}
              stroke="#e2e8f0"
              strokeWidth="1.2"
            />
            {/* Golden inner rim reflection */}
            <ellipse cx="40" cy="18" rx="11" ry="2" fill={`url(#${uid}-gold)`} fillOpacity="0.7" />
            {/* Stem & Base */}
            <path d="M35 51 L33 63 H47 L45 51 Z" fill={`url(#${uid}-silver)`} />
            <rect x="27" y="63" width="26" height="6" rx="2.5" fill="#64748b" stroke="#cbd5e1" strokeWidth="1" />
            {/* Starball Etching */}
            <circle cx="40" cy="34" r="5.5" fill="none" stroke="#475569" strokeWidth="1" />
            <text x="40" y="27" textAnchor="middle" fill="#334155" fontSize="3.6" fontWeight="bold" fontFamily="monospace">
              CHAMPIONS
            </text>
          </g>
        )}

        {/* 2. PREMIER LEAGUE TROPHY (SILVER CUP WITH GOLDEN CROWN & MALACHITE BASE) */}
        {resolved === 'ENG_PL' && (
          <g>
            <circle cx="40" cy="40" r="32" fill="#9333ea" fillOpacity="0.14" />
            {/* Purple & Sky Ribbons */}
            <path d="M24 24 L15 42 L20 44 L26 28 Z" fill="#581c87" />
            <path d="M56 24 L65 42 L60 44 L54 28 Z" fill="#38bdf8" />
            {/* Twin Handles */}
            <path
              d="M27 23 C17 23, 18 41, 29 43"
              fill="none"
              stroke={`url(#${uid}-silver)`}
              strokeWidth="3.5"
            />
            <path
              d="M53 23 C63 23, 62 41, 51 43"
              fill="none"
              stroke={`url(#${uid}-silver)`}
              strokeWidth="3.5"
            />
            {/* Golden Crown on Top! */}
            <path
              d="M28 19 L30 11 L35 16 L40 10 L45 16 L50 11 L52 19 Z"
              fill={`url(#${uid}-gold)`}
              stroke="#ca8a04"
              strokeWidth="1"
            />
            {/* Silver Body */}
            <path
              d="M27 19 H53 L49 46 C48 52, 32 52, 31 46 Z"
              fill={`url(#${uid}-silver)`}
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
            {/* Stem */}
            <path d="M36 50 L34 59 H46 L44 50 Z" fill={`url(#${uid}-silver)`} />
            {/* Malachite Green Band + Pedestal */}
            <rect x="26" y="59" width="28" height="4.5" rx="1" fill="#059669" stroke={`url(#${uid}-gold)`} strokeWidth="1" />
            <rect x="24" y="63.5" width="32" height="5.5" rx="1.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
          </g>
        )}

        {/* 3. FIFA WORLD CUP / CLUB WORLD CUP TROPHY (18K GOLD TWIN FIGURES + GLOBE + MALACHITE BANDS) */}
        {(resolved === 'WORLD_CUP' || resolved === 'FIFA_CWC') && (
          <g>
            <circle cx="40" cy="40" r="32" fill="#eab308" fillOpacity="0.16" />
            {/* Golden Earth Globe at the Top */}
            <circle cx="40" cy="22" r="11" fill={`url(#${uid}-gold)`} stroke="#a16207" strokeWidth="1.2" />
            <path d="M32 19 C36 16, 44 20, 48 18 M31 25 C37 27, 43 23, 49 26" fill="none" stroke="#a16207" strokeWidth="1" />
            {/* Spiraling Twin Figures Holding the Globe */}
            <path
              d="M29 24 C31 36, 35 44, 34 55 H46 C45 44, 49 36, 51 24 L45 31 L40 28 L35 31 Z"
              fill={`url(#${uid}-gold)`}
              stroke="#ca8a04"
              strokeWidth="1.1"
            />
            {/* Double Malachite Green Rings on the Base */}
            <rect x="30" y="55" width="20" height="3" rx="1" fill="#10b981" />
            <rect x="29" y="58" width="22" height="2.5" rx="1" fill={`url(#${uid}-gold)`} />
            <rect x="30" y="60.5" width="20" height="3" rx="1" fill="#10b981" />
            <rect x="27" y="63.5" width="26" height="5" rx="2" fill={`url(#${uid}-gold)`} stroke="#a16207" strokeWidth="1" />
          </g>
        )}

        {/* 4. BUNDESLIGA MEISTERSCHALE (ICONIC SILVER & GOLD SHIELD PLATTER) */}
        {resolved === 'GER_BL' && (
          <g>
            <circle cx="40" cy="40" r="27" fill={`url(#${uid}-silver)`} stroke="#f8fafc" strokeWidth="2" />
            <circle cx="40" cy="40" r="22" fill="none" stroke="#64748b" strokeWidth="1.2" strokeDasharray="4 2" />
            <circle cx="40" cy="40" r="15" fill="none" stroke={`url(#${uid}-gold)`} strokeWidth="2" />
            <circle cx="40" cy="40" r="8" fill={`url(#${uid}-gold)`} fillOpacity="0.35" stroke="#ca8a04" strokeWidth="1.5" />
            {[0, 60, 120, 180, 240, 300].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const cx = 40 + Math.cos(rad) * 15;
              const cy = 40 + Math.sin(rad) * 15;
              return <circle key={deg} cx={cx} cy={cy} r="2.4" fill="#b45309" stroke="#fef08a" strokeWidth="0.8" />;
            })}
            <text x="40" y="42.5" textAnchor="middle" fill="#1e293b" fontSize="5.5" fontWeight="900" fontFamily="monospace">
              DFB
            </text>
          </g>
        )}

        {/* 5. SERIE A SCUDETTO TROPHY (GOLDEN SPIRAL CONE + SODALITE BLUE RING) */}
        {resolved === 'ITA_SA' && (
          <g>
            <circle cx="40" cy="40" r="32" fill="#0284c7" fillOpacity="0.14" />
            {/* Flared Golden Cone */}
            <ellipse cx="40" cy="16" rx="15" ry="4" fill={`url(#${uid}-gold)`} stroke="#fef08a" strokeWidth="1.2" />
            <path
              d="M25 16 L35 52 H45 L55 16 Z"
              fill={`url(#${uid}-gold)`}
              stroke="#ca8a04"
              strokeWidth="1.2"
            />
            {/* Spiral Ribbing */}
            <path d="M28 24 L51 28 M31 34 L48 37 M34 43 L46 45" stroke="#a16207" strokeWidth="1.3" />
            {/* Sodalite Blue Ring */}
            <rect x="32" y="52" width="16" height="5" rx="1.5" fill="#1d4ed8" stroke={`url(#${uid}-silver)`} strokeWidth="1" />
            {/* Tricolore Scudetto */}
            <polygon points="40,51 43,54.5 40,58 37,54.5" fill="#ffffff" stroke="#ca8a04" strokeWidth="0.6" />
            {/* Marble Base */}
            <path d="M29 57 L26 67 H54 L51 57 Z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
          </g>
        )}

        {/* 6. UEFA EUROPA LEAGUE / CONFERENCE LEAGUE / LALIGA / LIGUE 1 / EURO / DOMESTIC CUPS */}
        {(resolved === 'UEFA_UEL' ||
          resolved === 'UEFA_UECL' ||
          resolved === 'ESP_LL' ||
          resolved === 'FRA_L1' ||
          resolved === 'EURO_NATIONS' ||
          resolved === 'DOMESTIC_CUP') && (
          <g>
            <circle
              cx="40"
              cy="40"
              r="32"
              fill={
                resolved === 'UEFA_UEL'
                  ? '#ea580c'
                  : resolved === 'UEFA_UECL'
                    ? '#16a34a'
                    : resolved === 'FRA_L1'
                      ? '#eab308'
                      : '#38bdf8'
              }
              fillOpacity="0.14"
            />
            {/* Handles for Cups / LaLiga / Euro */}
            {resolved !== 'UEFA_UEL' && (
              <>
                <path
                  d="M26 22 C15 20, 16 39, 29 42"
                  fill="none"
                  stroke={resolved === 'FRA_L1' ? `url(#${uid}-gold)` : `url(#${uid}-silver)`}
                  strokeWidth="3.5"
                />
                <path
                  d="M54 22 C65 20, 64 39, 51 42"
                  fill="none"
                  stroke={resolved === 'FRA_L1' ? `url(#${uid}-gold)` : `url(#${uid}-silver)`}
                  strokeWidth="3.5"
                />
              </>
            )}
            {/* Cup Chalice */}
            <path
              d="M24 16 H56 L49 46 C47 52, 33 52, 31 46 Z"
              fill={resolved === 'FRA_L1' ? `url(#${uid}-gold)` : `url(#${uid}-silver)`}
              stroke="#f8fafc"
              strokeWidth="1.2"
            />
            {/* Accent Stripe */}
            <path d="M29 24 H51" stroke={resolved === 'UEFA_UEL' ? '#ea580c' : resolved === 'UEFA_UECL' ? '#16a34a' : '#eab308'} strokeWidth="2.2" />
            {/* Pedestal */}
            <path
              d="M35 49 L32 60 H48 L45 49 Z"
              fill={resolved === 'UEFA_UEL' ? `url(#${uid}-gold)` : `url(#${uid}-silver)`}
            />
            <rect x="26" y="60" width="28" height="7" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
          </g>
        )}

        {/* 7. BALLON D'OR & GOLDEN BOOT */}
        {(resolved === 'BALLON_DOR' || resolved === 'GOLDEN_BOOT') && (
          <g>
            <circle cx="40" cy="40" r="32" fill="#facc15" fillOpacity="0.18" />
            {/* Crystalline Pyrite Pedestal */}
            <polygon
              points="24,66 28,48 36,45 44,45 52,48 56,66"
              fill="#1e293b"
              stroke="#64748b"
              strokeWidth="1.2"
            />
            <polygon points="28,66 34,49 46,49 52,66" fill="#0f172a" />
            {/* 24K Golden Ball */}
            <circle cx="40" cy="30" r="16" fill={`url(#${uid}-gold)`} stroke="#fef08a" strokeWidth="1.5" />
            <polygon points="40,22 46,26 44,33 36,33 34,26" fill="#a16207" fillOpacity="0.45" stroke="#fef08a" strokeWidth="0.9" />
            <path d="M40 14 V22 M46 26 L54 23 M44 33 L50 41 M36 33 L30 41 M34 26 L26 23" stroke="#a16207" strokeWidth="1" />
          </g>
        )}
      </svg>
      </div>
      {showLabel && (
        <span className="mt-1 text-[10px] font-mono text-amber-300 font-semibold truncate max-w-[96px]">
          {customLabel || resolved.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
};

/* ============================================================================
   3. AUTHENTIC CLUB KITS (HOME, AWAY & GK JERSEYS FOR REAL CLUBS)
============================================================================ */

export type KitPattern =
  | 'solid'
  | 'stripes'
  | 'hoops'
  | 'sleeves'
  | 'center_band'
  | 'sash'
  | 'halves'
  | 'pinstripes';

export interface KitDesignSpec {
  pattern: KitPattern;
  bodyColor: string;
  secondaryColor: string;
  sleeveColor?: string;
  trimColor: string;
  awayBody: string;
  awaySecondary: string;
  awayPattern?: KitPattern;
  gkColor?: string;
}

/**
 * Curated authentic 2025/26 kit patterns & colors for real European clubs
 */
const AUTHENTIC_CLUB_KITS: Record<string, KitDesignSpec> = {
  // Premier League
  ARS: { pattern: 'sleeves', bodyColor: '#EF0107', secondaryColor: '#FFFFFF', sleeveColor: '#FFFFFF', trimColor: '#063672', awayBody: '#111827', awaySecondary: '#EF0107', awayPattern: 'pinstripes' },
  MCI: { pattern: 'solid', bodyColor: '#6CABDD', secondaryColor: '#FFFFFF', trimColor: '#1C2C5B', awayBody: '#1E293B', awaySecondary: '#FDE047', awayPattern: 'stripes' },
  LIV: { pattern: 'solid', bodyColor: '#C8102E', secondaryColor: '#F6EB61', trimColor: '#FFFFFF', awayBody: '#1E293B', awaySecondary: '#2DD4BF', awayPattern: 'solid' },
  CHE: { pattern: 'solid', bodyColor: '#034694', secondaryColor: '#FFFFFF', trimColor: '#DBA111', awayBody: '#F8FAFC', awaySecondary: '#034694', awayPattern: 'solid' },
  MUN: { pattern: 'solid', bodyColor: '#DA291C', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#1E3A8A', awaySecondary: '#FFFFFF', awayPattern: 'pinstripes' },
  NEW: { pattern: 'stripes', bodyColor: '#111827', secondaryColor: '#FFFFFF', trimColor: '#38BDF8', awayBody: '#881337', awaySecondary: '#1E3A8A', awayPattern: 'hoops' },
  TOT: { pattern: 'sleeves', bodyColor: '#FFFFFF', secondaryColor: '#132257', sleeveColor: '#132257', trimColor: '#132257', awayBody: '#38BDF8', awaySecondary: '#132257', awayPattern: 'stripes' },
  AVL: { pattern: 'sleeves', bodyColor: '#670E36', secondaryColor: '#95BFE5', sleeveColor: '#95BFE5', trimColor: '#95BFE5', awayBody: '#FFFFFF', awaySecondary: '#670E36', awayPattern: 'pinstripes' },
  BHA: { pattern: 'stripes', bodyColor: '#0057B8', secondaryColor: '#FFFFFF', trimColor: '#FFCD00', awayBody: '#FACC15', awaySecondary: '#111827', awayPattern: 'pinstripes' },
  NFO: { pattern: 'solid', bodyColor: '#DD0000', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#1E3A8A', awaySecondary: '#38BDF8', awayPattern: 'sash' },
  WHU: { pattern: 'sleeves', bodyColor: '#7A263A', secondaryColor: '#1BB1E7', sleeveColor: '#1BB1E7', trimColor: '#1BB1E7', awayBody: '#111827', awaySecondary: '#7A263A', awayPattern: 'solid' },
  BOU: { pattern: 'stripes', bodyColor: '#B50E12', secondaryColor: '#111827', trimColor: '#FACC15', awayBody: '#F8FAFC', awaySecondary: '#7E22CE', awayPattern: 'hoops' },
  CRY: { pattern: 'stripes', bodyColor: '#1B458F', secondaryColor: '#C4122E', trimColor: '#FFFFFF', awayBody: '#FACC15', awaySecondary: '#1B458F', awayPattern: 'sash' },
  FUL: { pattern: 'sleeves', bodyColor: '#FFFFFF', secondaryColor: '#111827', sleeveColor: '#FFFFFF', trimColor: '#CC0000', awayBody: '#DC2626', awaySecondary: '#111827', awayPattern: 'stripes' },
  BRE: { pattern: 'stripes', bodyColor: '#E30613', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#FBCFE8', awaySecondary: '#111827', awayPattern: 'solid' },
  EVE: { pattern: 'solid', bodyColor: '#003399', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#1E293B', awaySecondary: '#FDE047', awayPattern: 'solid' },
  WOL: { pattern: 'solid', bodyColor: '#FDB913', secondaryColor: '#231F20', trimColor: '#231F20', awayBody: '#111827', awaySecondary: '#FDB913', awayPattern: 'sash' },
  LEE: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#1D428A', trimColor: '#FFCD00', awayBody: '#FFCD00', awaySecondary: '#1D428A', awayPattern: 'solid' },
  BUR: { pattern: 'sleeves', bodyColor: '#6C1D45', secondaryColor: '#99D6EA', sleeveColor: '#99D6EA', trimColor: '#99D6EA', awayBody: '#FACC15', awaySecondary: '#6C1D45', awayPattern: 'pinstripes' },
  SUN: { pattern: 'stripes', bodyColor: '#EB172B', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#FFFFFF', awaySecondary: '#1E3A8A', awayPattern: 'center_band' },

  // LaLiga
  RMA: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#111827', trimColor: '#FEBE10', awayBody: '#F97316', awaySecondary: '#1E3A8A', awayPattern: 'solid' },
  BAR: { pattern: 'halves', bodyColor: '#A50044', secondaryColor: '#004D98', trimColor: '#EDBB00', awayBody: '#111827', awaySecondary: '#A50044', awayPattern: 'center_band' },
  ATM: { pattern: 'stripes', bodyColor: '#CB3524', secondaryColor: '#FFFFFF', trimColor: '#272E61', awayBody: '#1E3A8A', awaySecondary: '#CB3524', awayPattern: 'solid' },
  ATH: { pattern: 'stripes', bodyColor: '#EE2523', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#1D4ED8', awaySecondary: '#FFFFFF', awayPattern: 'solid' },
  VIL: { pattern: 'solid', bodyColor: '#FBE122', secondaryColor: '#005187', trimColor: '#005187', awayBody: '#7F1D1D', awaySecondary: '#FBE122', awayPattern: 'solid' },
  RSO: { pattern: 'stripes', bodyColor: '#0067B1', secondaryColor: '#FFFFFF', trimColor: '#0067B1', awayBody: '#111827', awaySecondary: '#FACC15', awayPattern: 'solid' },
  BET: { pattern: 'stripes', bodyColor: '#0BB363', secondaryColor: '#FFFFFF', trimColor: '#0BB363', awayBody: '#FACC15', awaySecondary: '#111827', awayPattern: 'hoops' },
  SEV: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#D4021D', trimColor: '#D4021D', awayBody: '#D4021D', awaySecondary: '#FFFFFF', awayPattern: 'pinstripes' },
  VAL: { pattern: 'sleeves', bodyColor: '#FFFFFF', secondaryColor: '#111827', sleeveColor: '#111827', trimColor: '#F97316', awayBody: '#111827', awaySecondary: '#FACC15', awayPattern: 'solid' },
  GIR: { pattern: 'stripes', bodyColor: '#DA291C', secondaryColor: '#FFFFFF', trimColor: '#DA291C', awayBody: '#1E293B', awaySecondary: '#F472B6', awayPattern: 'solid' },
  CEL: { pattern: 'solid', bodyColor: '#8AC3EE', secondaryColor: '#FFFFFF', trimColor: '#E5254E', awayBody: '#1E3A8A', awaySecondary: '#FFFFFF', awayPattern: 'center_band' },
  OSA: { pattern: 'solid', bodyColor: '#991B1B', secondaryColor: '#1E3A8A', trimColor: '#1E3A8A', awayBody: '#16A34A', awaySecondary: '#FFFFFF', awayPattern: 'solid' },
  RAY: { pattern: 'sash', bodyColor: '#FFFFFF', secondaryColor: '#E52521', trimColor: '#E52521', awayBody: '#E52521', awaySecondary: '#FFFFFF', awayPattern: 'sash' },
  ESP: { pattern: 'stripes', bodyColor: '#007FC8', secondaryColor: '#FFFFFF', trimColor: '#007FC8', awayBody: '#991B1B', awaySecondary: '#FFFFFF', awayPattern: 'solid' },
  ALA: { pattern: 'stripes', bodyColor: '#0055A4', secondaryColor: '#FFFFFF', trimColor: '#0055A4', awayBody: '#FFFFFF', awaySecondary: '#0055A4', awayPattern: 'pinstripes' },
  LEV: { pattern: 'stripes', bodyColor: '#003F8A', secondaryColor: '#B50036', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#003F8A', awayPattern: 'solid' },
  ELC: { pattern: 'hoops', bodyColor: '#FFFFFF', secondaryColor: '#008B45', trimColor: '#008B45', awayBody: '#008B45', awaySecondary: '#FFFFFF', awayPattern: 'solid' },
  OVI: { pattern: 'solid', bodyColor: '#004B9B', secondaryColor: '#FFFFFF', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#004B9B', awayPattern: 'sash' },

  // Bundesliga
  FCB: { pattern: 'solid', bodyColor: '#DC052D', secondaryColor: '#881337', trimColor: '#FFFFFF', awayBody: '#1E293B', awaySecondary: '#2DD4BF', awayPattern: 'pinstripes' },
  B04: { pattern: 'center_band', bodyColor: '#E32221', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#E32221', awayPattern: 'solid' },
  BVB: { pattern: 'pinstripes', bodyColor: '#FDE100', secondaryColor: '#111827', sleeveColor: '#111827', trimColor: '#111827', awayBody: '#111827', awaySecondary: '#FDE100', awayPattern: 'hoops' },
  RBL: { pattern: 'sleeves', bodyColor: '#FFFFFF', secondaryColor: '#DD0741', sleeveColor: '#DD0741', trimColor: '#001F47', awayBody: '#DD0741', awaySecondary: '#001F47', awayPattern: 'stripes' },
  VFB: { pattern: 'hoops', bodyColor: '#FFFFFF', secondaryColor: '#E32219', trimColor: '#E32219', awayBody: '#E32219', awaySecondary: '#111827', awayPattern: 'stripes' },
  SGE: { pattern: 'stripes', bodyColor: '#111827', secondaryColor: '#E1000F', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#111827', awayPattern: 'solid' },
  SCF: { pattern: 'stripes', bodyColor: '#E30613', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#E30613', awayPattern: 'sash' },
  WOB: { pattern: 'solid', bodyColor: '#65B32E', secondaryColor: '#FFFFFF', trimColor: '#1E3A8A', awayBody: '#1E293B', awaySecondary: '#65B32E', awayPattern: 'pinstripes' },
  BMG: { pattern: 'center_band', bodyColor: '#FFFFFF', secondaryColor: '#15803D', trimColor: '#111827', awayBody: '#15803D', awaySecondary: '#111827', awayPattern: 'stripes' },
  SVW: { pattern: 'solid', bodyColor: '#1D9053', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#1D9053', awayPattern: 'hoops' },
  HSV: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#005CA9', trimColor: '#E30613', awayBody: '#005CA9', awaySecondary: '#FFFFFF', awayPattern: 'solid' },
  STP: { pattern: 'stripes', bodyColor: '#624839', secondaryColor: '#FFFFFF', trimColor: '#E30613', awayBody: '#FFFFFF', awaySecondary: '#624839', awayPattern: 'hoops' },

  // Serie A
  INT: { pattern: 'stripes', bodyColor: '#010E80', secondaryColor: '#111827', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#010E80', awayPattern: 'pinstripes' },
  NAP: { pattern: 'solid', bodyColor: '#12A0D7', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#1E3A8A', awayPattern: 'solid' },
  JUV: { pattern: 'stripes', bodyColor: '#FFFFFF', secondaryColor: '#111827', trimColor: '#FACC15', awayBody: '#FEF08A', awaySecondary: '#1D4ED8', awayPattern: 'solid' },
  MIL: { pattern: 'stripes', bodyColor: '#FB090B', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#FB090B', awayPattern: 'pinstripes' },
  ATA: { pattern: 'stripes', bodyColor: '#1E71B8', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#1E71B8', awayPattern: 'hoops' },
  ROM: { pattern: 'solid', bodyColor: '#8E1F2F', secondaryColor: '#F0BC42', trimColor: '#F0BC42', awayBody: '#F8FAFC', awaySecondary: '#EA580C', awayPattern: 'sash' },
  LAZ: { pattern: 'solid', bodyColor: '#87D8F7', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FEF08A', awaySecondary: '#1E3A8A', awayPattern: 'solid' },
  FIO: { pattern: 'solid', bodyColor: '#482E92', secondaryColor: '#FFFFFF', trimColor: '#EF4444', awayBody: '#FFFFFF', awaySecondary: '#482E92', awayPattern: 'solid' },
  BOL: { pattern: 'stripes', bodyColor: '#9F1F33', secondaryColor: '#1A2F48', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#9F1F33', awayPattern: 'sash' },
  TOR: { pattern: 'solid', bodyColor: '#8A1E03', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#8A1E03', awayPattern: 'sash' },
  COM: { pattern: 'pinstripes', bodyColor: '#00569C', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#00569C', awayPattern: 'solid' },
  GEN: { pattern: 'halves', bodyColor: '#AD1919', secondaryColor: '#0E2440', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#AD1919', awayPattern: 'hoops' },
  UDI: { pattern: 'stripes', bodyColor: '#111827', secondaryColor: '#FFFFFF', trimColor: '#CA8A04', awayBody: '#FACC15', awaySecondary: '#111827', awayPattern: 'solid' },
  SAS: { pattern: 'stripes', bodyColor: '#00A752', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#00A752', awayPattern: 'hoops' },
  PAR: { pattern: 'center_band', bodyColor: '#FFFFFF', secondaryColor: '#111827', trimColor: '#FACC15', awayBody: '#FACC15', awaySecondary: '#1D4ED8', awayPattern: 'hoops' },
  CAG: { pattern: 'halves', bodyColor: '#A50021', secondaryColor: '#002350', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#A50021', awayPattern: 'solid' },

  // Ligue 1
  PSG: { pattern: 'center_band', bodyColor: '#004170', secondaryColor: '#DA291C', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#DA291C', awayPattern: 'sash' },
  OM: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#2FAEE0', trimColor: '#2FAEE0', awayBody: '#0F172A', awaySecondary: '#2FAEE0', awayPattern: 'pinstripes' },
  ASM: { pattern: 'sash', bodyColor: '#E51B22', secondaryColor: '#FFFFFF', trimColor: '#CA8A04', awayBody: '#1E293B', awaySecondary: '#CA8A04', awayPattern: 'solid' },
  LOSC: { pattern: 'solid', bodyColor: '#E01E13', secondaryColor: '#1D2043', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#1D2043', awayPattern: 'sash' },
  OL: { pattern: 'center_band', bodyColor: '#FFFFFF', secondaryColor: '#DA020E', trimColor: '#14387F', awayBody: '#111827', awaySecondary: '#DA020E', awayPattern: 'pinstripes' },
  NIC: { pattern: 'stripes', bodyColor: '#CC0000', secondaryColor: '#111827', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#CC0000', awayPattern: 'solid' },
  RCL: { pattern: 'stripes', bodyColor: '#FACC15', secondaryColor: '#DC2626', trimColor: '#111827', awayBody: '#16A34A', awaySecondary: '#111827', awayPattern: 'stripes' },
  REN: { pattern: 'solid', bodyColor: '#E41B17', secondaryColor: '#111827', trimColor: '#111827', awayBody: '#FFFFFF', awaySecondary: '#111827', awayPattern: 'pinstripes' },
  FCN: { pattern: 'stripes', bodyColor: '#FDE100', secondaryColor: '#00904C', trimColor: '#00904C', awayBody: '#00904C', awaySecondary: '#FDE100', awayPattern: 'solid' },

  // Portugal, Netherlands, Belgium, Turkey, Scotland
  SLB: { pattern: 'solid', bodyColor: '#E83030', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#111827', awaySecondary: '#E83030', awayPattern: 'solid' },
  SCP: { pattern: 'hoops', bodyColor: '#008057', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#111827', awaySecondary: '#008057', awayPattern: 'pinstripes' },
  FCP: { pattern: 'stripes', bodyColor: '#00428C', secondaryColor: '#FFFFFF', trimColor: '#FACC15', awayBody: '#F97316', awaySecondary: '#00428C', awayPattern: 'solid' },
  SCB: { pattern: 'sleeves', bodyColor: '#D60B29', secondaryColor: '#FFFFFF', sleeveColor: '#FFFFFF', trimColor: '#CA8A04', awayBody: '#1E293B', awaySecondary: '#D60B29', awayPattern: 'solid' },
  PSV: { pattern: 'stripes', bodyColor: '#EE2523', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#111827', awaySecondary: '#38BDF8', awayPattern: 'pinstripes' },
  FEY: { pattern: 'halves', bodyColor: '#E30613', secondaryColor: '#FFFFFF', trimColor: '#111827', awayBody: '#1E293B', awaySecondary: '#22C55E', awayPattern: 'solid' },
  AJX: { pattern: 'center_band', bodyColor: '#FFFFFF', secondaryColor: '#D2122E', trimColor: '#D2122E', awayBody: '#1E3A8A', awaySecondary: '#FACC15', awayPattern: 'pinstripes' },
  CLUB: { pattern: 'stripes', bodyColor: '#0066B3', secondaryColor: '#111827', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#0066B3', awayPattern: 'solid' },
  AND: { pattern: 'solid', bodyColor: '#5B2C82', secondaryColor: '#FFFFFF', trimColor: '#FFFFFF', awayBody: '#FFFFFF', awaySecondary: '#5B2C82', awayPattern: 'pinstripes' },
  GAL: { pattern: 'halves', bodyColor: '#FDB912', secondaryColor: '#A90432', trimColor: '#111827', awayBody: '#FFFFFF', awaySecondary: '#A90432', awayPattern: 'pinstripes' },
  FEN: { pattern: 'stripes', bodyColor: '#FFED00', secondaryColor: '#002D72', trimColor: '#FFFFFF', awayBody: '#002D72', awaySecondary: '#FFED00', awayPattern: 'solid' },
  BJK: { pattern: 'solid', bodyColor: '#FFFFFF', secondaryColor: '#111827', trimColor: '#E30613', awayBody: '#111827', awaySecondary: '#FFFFFF', awayPattern: 'stripes' },
  TRA: { pattern: 'stripes', bodyColor: '#80122A', secondaryColor: '#48A9DF', trimColor: '#FACC15', awayBody: '#FFFFFF', awaySecondary: '#80122A', awayPattern: 'solid' },
  CELT: { pattern: 'hoops', bodyColor: '#018749', secondaryColor: '#FFFFFF', trimColor: '#FACC15', awayBody: '#FACC15', awaySecondary: '#018749', awayPattern: 'pinstripes' },
  RAN: { pattern: 'solid', bodyColor: '#1B458F', secondaryColor: '#FFFFFF', trimColor: '#DA291C', awayBody: '#FFFFFF', awaySecondary: '#1B458F', awayPattern: 'sash' },
  QPR: { pattern: 'hoops', bodyColor: '#1D5BA4', secondaryColor: '#FFFFFF', trimColor: '#DA291C', awayBody: '#DA291C', awaySecondary: '#111827', awayPattern: 'hoops' },
};

export function getClubKitSpec(club?: Partial<Club> | null): KitDesignSpec {
  const short = (club?.shortName || '').toUpperCase();
  if (AUTHENTIC_CLUB_KITS[short]) {
    return AUTHENTIC_CLUB_KITS[short];
  }
  const primary = club?.primaryColor || '#10b981';
  const secondary = club?.secondaryColor || '#ffffff';
  // Deterministic pattern from club shortName
  let hash = 0;
  for (let i = 0; i < short.length; i++) {
    hash = (hash * 31 + short.charCodeAt(i)) >>> 0;
  }
  const fallbackPatterns: KitPattern[] = ['solid', 'stripes', 'sleeves', 'pinstripes', 'center_band', 'hoops'];
  const pat = primary.toLowerCase() === secondary.toLowerCase() ? 'solid' : fallbackPatterns[hash % fallbackPatterns.length];

  return {
    pattern: pat,
    bodyColor: primary,
    secondaryColor: secondary,
    sleeveColor: pat === 'sleeves' ? secondary : primary,
    trimColor: secondary,
    awayBody: secondary === '#ffffff' || secondary === '#f8fafc' ? '#0f172a' : '#f8fafc',
    awaySecondary: primary,
    awayPattern: 'pinstripes',
    gkColor: '#10b981',
  };
}

export const ClubKitJersey: React.FC<{
  club?: Partial<Club> | null;
  variant?: 'home' | 'away' | 'gk';
  number?: number | string;
  playerName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  label?: string;
  className?: string;
}> = ({
  club,
  variant = 'home',
  number,
  playerName,
  size = 'md',
  showLabel = false,
  label,
  className = '',
}) => {
  const spec = getClubKitSpec(club);

  const pattern: KitPattern =
    variant === 'gk'
      ? 'solid'
      : variant === 'away'
        ? spec.awayPattern || 'solid'
        : spec.pattern;

  const bodyColor =
    variant === 'gk'
      ? spec.gkColor || '#10b981'
      : variant === 'away'
        ? spec.awayBody
        : spec.bodyColor;

  const secondaryColor =
    variant === 'gk'
      ? '#022c22'
      : variant === 'away'
        ? spec.awaySecondary
        : spec.secondaryColor;

  const sleeveColor =
    variant === 'home' && spec.sleeveColor
      ? spec.sleeveColor
      : pattern === 'sleeves'
        ? secondaryColor
        : bodyColor;

  const trimColor = variant === 'away' ? spec.awaySecondary : spec.trimColor;

  const isLightBody =
    bodyColor.toLowerCase() === '#ffffff' ||
    bodyColor.toLowerCase() === '#f8fafc' ||
    bodyColor.toLowerCase() === '#f1f5f9' ||
    bodyColor.toLowerCase() === '#fde100' ||
    bodyColor.toLowerCase() === '#facc15' ||
    bodyColor.toLowerCase() === '#fef08a' ||
    bodyColor.toLowerCase() === '#fbe122' ||
    bodyColor.toLowerCase() === '#ffed00' ||
    bodyColor.toLowerCase() === '#fdb913' ||
    bodyColor.toLowerCase() === '#fdb912';

  const textColor = isLightBody ? '#0f172a' : '#ffffff';

  const dims =
    size === 'xs'
      ? 'w-7 h-7'
      : size === 'sm'
        ? 'w-10 h-10'
        : size === 'lg'
          ? 'w-20 h-20'
          : size === 'xl'
            ? 'w-28 h-28'
            : 'w-14 h-14';

  const clipId = `kit-clip-${(club?.shortName || 'clb').replace(/[^a-zA-Z0-9]/g, '')}-${variant}-${size}-${number || '0'}`;

  return (
    <div
      className={`inline-flex flex-col items-center justify-center shrink-0 select-none ${className}`}
      title={`${club?.name || 'Club'} (${variant.toUpperCase()} Kit)`}
      data-testid={`club-kit-${variant}`}
    >
      <div className={dims}>
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
        <defs>
          <clipPath id={clipId}>
            <path d="M26 14 L38 10 C42 17, 58 17, 62 10 L74 14 L93 33 L82 47 L71 39 L71 88 C71 90, 69 91, 67 91 L33 91 C31 91, 29 90, 29 88 L29 39 L18 47 L7 33 Z" />
          </clipPath>
        </defs>

        {/* Clipped Shirt Body & Pattern */}
        <g clipPath={`url(#${clipId})`}>
          {/* Base Body */}
          <rect x="0" y="0" width="100" height="100" fill={bodyColor} />

          {/* Pattern Overlays */}
          {pattern === 'stripes' && (
            <g fill={secondaryColor}>
              <rect x="31" y="10" width="8" height="85" />
              <rect x="46" y="10" width="8" height="85" />
              <rect x="61" y="10" width="8" height="85" />
            </g>
          )}

          {pattern === 'pinstripes' && (
            <g fill={secondaryColor} fillOpacity="0.85">
              <rect x="33" y="10" width="2.2" height="85" />
              <rect x="41" y="10" width="2.2" height="85" />
              <rect x="50" y="10" width="2.2" height="85" />
              <rect x="59" y="10" width="2.2" height="85" />
              <rect x="67" y="10" width="2.2" height="85" />
            </g>
          )}

          {pattern === 'hoops' && (
            <g fill={secondaryColor}>
              <rect x="0" y="23" width="100" height="10" />
              <rect x="0" y="43" width="100" height="10" />
              <rect x="0" y="63" width="100" height="10" />
              <rect x="0" y="81" width="100" height="8" />
            </g>
          )}

          {pattern === 'center_band' && (
            <g>
              <rect x="40" y="10" width="20" height="85" fill={secondaryColor} />
              <rect x="38" y="10" width="2" height="85" fill={trimColor} />
              <rect x="60" y="10" width="2" height="85" fill={trimColor} />
            </g>
          )}

          {pattern === 'halves' && (
            <rect x="50" y="0" width="50" height="100" fill={secondaryColor} />
          )}

          {pattern === 'sash' && (
            <polygon points="22,12 36,12 78,88 64,88" fill={secondaryColor} />
          )}

          {/* Left & Right Sleeves */}
          <polygon points="0,10 29,10 29,50 0,50" fill={sleeveColor} />
          <polygon points="71,10 100,10 100,50 71,50" fill={sleeveColor} />

          {/* Sleeve Cuffs */}
          <polygon points="6,31 20,49 16,52 3,34" fill={trimColor} />
          <polygon points="94,31 80,49 84,52 97,34" fill={trimColor} />

          {/* Subtle 3D Fabric Shading */}
          <rect x="29" y="10" width="6" height="82" fill="#000000" fillOpacity="0.09" />
          <rect x="65" y="10" width="6" height="82" fill="#000000" fillOpacity="0.09" />
        </g>

        {/* Collar & Outline */}
        <path
          d="M38 10 C42 18, 58 18, 62 10"
          fill="none"
          stroke={trimColor}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M26 14 L38 10 C42 17, 58 17, 62 10 L74 14 L93 33 L82 47 L71 39 L71 88 C71 90, 69 91, 67 91 L33 91 C31 91, 29 90, 29 88 L29 39 L18 47 L7 33 Z"
          fill="none"
          stroke="#0f172a"
          strokeOpacity="0.55"
          strokeWidth="2"
        />

        {/* Chest Club Crest */}
        <circle
          cx="60"
          cy="29"
          r="4.2"
          fill={spec.bodyColor}
          stroke={spec.trimColor}
          strokeWidth="1.2"
        />
        {/* Kit Maker Tick */}
        <path d="M37 29 L40 31 L44 27" fill="none" stroke={textColor} strokeWidth="1.6" strokeLinecap="round" />

        {/* Optional Squad Number / Sponsor */}
        {number !== undefined ? (
          <>
            {playerName && (
              <rect x="33" y="40" width="34" height="9" rx="2" fill="#020617" fillOpacity="0.55" />
            )}
            {playerName && (
              <text
                x="50"
                y="46.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="6.5"
                fontFamily="monospace"
                fontWeight="800"
              >
                {playerName.toUpperCase().slice(0, 9)}
              </text>
            )}
            <circle cx="50" cy="64" r="13" fill="#020617" fillOpacity="0.48" />
            <text
              x="50"
              y="70"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="17"
              fontFamily="monospace"
              fontWeight="900"
            >
              {number}
            </text>
          </>
        ) : (
          <g>
            <rect
              x="34"
              y="46"
              width="32"
              height="11"
              rx="2"
              fill="#020617"
              fillOpacity="0.55"
            />
            <text
              x="50"
              y="53.8"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7.2"
              fontFamily="monospace"
              fontWeight="800"
              letterSpacing="0.6"
            >
              {(club?.shortName || 'CLUB').slice(0, 5)}
            </text>
          </g>
        )}
      </svg>
      </div>
      {showLabel && (
        <span className="mt-0.5 text-[9px] font-mono text-slate-400">
          {label || variant.toUpperCase()}
        </span>
      )}
    </div>
  );
};

/**
 * Complete Home / Away / Goalkeeper Kit Showcase Card for Club Overview & World Clubs
 */
export const ClubKitShowcaseCard: React.FC<{
  club: Club;
  tr: (en: string, th: string) => string;
  compact?: boolean;
}> = ({ club, tr, compact = false }) => {
  const spec = getClubKitSpec(club);
  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3"
      data-testid="club-kits-showcase-card"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono">
            {tr('Official 2025/26 Match Kits', 'ชุดแข่งขันทางการประจำฤดูกาล 2025/26 (Official Kits)')}
          </h4>
          <p className="text-[11px] text-slate-400">
            {club.name} · {tr(`Pattern: ${spec.pattern.replace('_', ' ')}`, `ลวดลายชุดเหย้า: ${spec.pattern.replace('_', ' ')}`)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/30"
            style={{ backgroundColor: spec.bodyColor }}
            title="Primary Kit Color"
          />
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/30"
            style={{ backgroundColor: spec.secondaryColor }}
            title="Secondary Kit Color"
          />
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/30"
            style={{ backgroundColor: spec.awayBody }}
            title="Away Kit Color"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex flex-col items-center gap-1.5">
          <ClubKitJersey club={club} variant="home" size={compact ? 'md' : 'lg'} />
          <div className="text-[11px] font-bold text-white">{tr('Home Kit', 'ชุดเหย้า')}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">{spec.pattern.replace('_', ' ')}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex flex-col items-center gap-1.5">
          <ClubKitJersey club={club} variant="away" size={compact ? 'md' : 'lg'} />
          <div className="text-[11px] font-bold text-slate-200">{tr('Away Kit', 'ชุดเยือน')}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">{(spec.awayPattern || 'solid').replace('_', ' ')}</div>
        </div>
        <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex flex-col items-center gap-1.5">
          <ClubKitJersey club={club} variant="gk" number={1} size={compact ? 'md' : 'lg'} />
          <div className="text-[11px] font-bold text-emerald-400">{tr('GK Kit', 'ชุดผู้รักษาประตู')}</div>
          <div className="text-[10px] font-mono text-slate-400 uppercase">PRO GK #1</div>
        </div>
      </div>
    </div>
  );
};
