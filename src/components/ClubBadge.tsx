import React, { useEffect, useState } from 'react';
import { Club, CompetitionId, LeagueId } from '../types/game';
import { CLUB_TEMPLATES, LEAGUES_CONFIG } from '../engine/leaguesConfig';

const LATEST_LOGO_BY_NAME = new Map<string, string>();
for (const templates of Object.values(CLUB_TEMPLATES)) {
  for (const t of templates) {
    if (t.logoUrl) {
      LATEST_LOGO_BY_NAME.set(t.name.toLowerCase(), t.logoUrl);
    }
  }
}
// Common aliases for clubs across saves
const ALIAS_LOGOS: Record<string, string | undefined> = {
  'lille osc': LATEST_LOGO_BY_NAME.get('losc lille'),
  'stade rennais': LATEST_LOGO_BY_NAME.get('stade rennais fc'),
  'rc strasbourg': LATEST_LOGO_BY_NAME.get('rc strasbourg alsace'),
};
for (const [alias, url] of Object.entries(ALIAS_LOGOS)) {
  if (url) LATEST_LOGO_BY_NAME.set(alias, url);
}

function hashClubString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const ClubBadge: React.FC<{
  club?: Pick<Club, 'name' | 'shortName' | 'primaryColor' | 'secondaryColor' | 'logoUrl'> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showRing?: boolean;
  className?: string;
}> = React.memo(({ club, size = 'md', showRing = false, className = '' }) => {
  const [imgError, setImgError] = useState(false);

  const resolvedLogoUrl =
    (club?.name ? LATEST_LOGO_BY_NAME.get(club.name.toLowerCase()) : undefined) ||
    club?.logoUrl;

  useEffect(() => {
    setImgError(false);
  }, [resolvedLogoUrl]);

  if (!club) return null;

  const sizeMap = {
    xs: 'w-4 h-4 text-[8px] rounded-sm',
    sm: 'w-6 h-6 text-[10px] rounded',
    md: 'w-8 h-8 text-xs rounded',
    lg: 'w-11 h-11 text-base rounded-lg',
    xl: 'w-16 h-16 text-lg rounded-xl',
  };

  const pixelSizeMap = {
    xs: 16,
    sm: 24,
    md: 32,
    lg: 44,
    xl: 64,
  };

  const ringClass = showRing ? 'ring-2 ring-slate-700/80 p-0.5 bg-slate-900/70' : '';

  if (resolvedLogoUrl && !imgError) {
    const px = pixelSizeMap[size];
    return (
      <img
        src={resolvedLogoUrl}
        alt={club.name}
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeMap[size]} ${ringClass} object-contain shrink-0 select-none ${className}`}
      />
    );
  }

  // Procedural Heraldic Shield Crest SVG fallback
  const seed = hashClubString(club.name || club.shortName || 'CLUB');
  const pattern = seed % 4;
  const primary = club.primaryColor || '#10b981';
  const secondary =
    club.secondaryColor ||
    (primary.toLowerCase() === '#ffffff' || primary.toLowerCase() === '#f8fafc'
      ? '#1e3a8a'
      : '#ffffff');
  const clipId = `crest-clip-${(club.shortName || 'clb').replace(/[^a-zA-Z0-9]/g, '')}-${size}-${seed % 997}`;

  return (
    <div
      className={`${sizeMap[size]} ${ringClass} inline-flex items-center justify-center shrink-0 select-none ${className}`}
      title={club.name}
      data-testid="club-badge-heraldic"
    >
      <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-sm">
        <defs>
          <clipPath id={clipId}>
            <path d="M10 8 H54 V32 C54 47 43 56 32 60 C21 56 10 47 10 32 Z" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="64" height="64" fill={primary} />
          {pattern === 0 && (
            /* Vertical Stripes */
            <g fill={secondary} fillOpacity="0.9">
              <rect x="18" y="0" width="8" height="64" />
              <rect x="38" y="0" width="8" height="64" />
            </g>
          )}
          {pattern === 1 && (
            /* Halves */
            <rect x="32" y="0" width="32" height="64" fill={secondary} fillOpacity="0.9" />
          )}
          {pattern === 2 && (
            /* Diagonal Sash */
            <polygon points="6,0 20,0 58,64 44,64" fill={secondary} fillOpacity="0.9" />
          )}
          {pattern === 3 && (
            /* Chevron & Top Chief */
            <g fill={secondary} fillOpacity="0.9">
              <rect x="0" y="0" width="64" height="16" />
              <polygon points="10,34 32,48 54,34 54,41 32,55 10,41" />
            </g>
          )}
        </g>

        {/* Metallic Shield Border */}
        <path
          d="M10 8 H54 V32 C54 47 43 56 32 60 C21 56 10 47 10 32 Z"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="3"
        />

        {/* Center Banner with Club Short Name */}
        {size !== 'xs' && (
          <>
            <rect
              x="11"
              y="23"
              width="42"
              height="16"
              rx="3"
              fill="#020617"
              fillOpacity="0.86"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x="32"
              y="34"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11.5"
              fontWeight="900"
              fontFamily="monospace"
            >
              {(club.shortName || '').slice(0, 4)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
});

export {
  CompetitionBadge,
  TrophyArtwork,
  NationalityFlag,
  resolveTrophyType,
  resolveCompetitionTrophyPhotoUrls,
  resolveNationalityFlagInfo,
} from './TrophyAndKitVisuals';



