import React, { useEffect, useState } from 'react';
import { Club, Player } from '../types/game';
import { getPlayerFaceUrl } from '../engine/engPlayerFaces';

const SKIN_PALETTES: Record<string, { base: string; shadow: string; ears: string }[]> = {
  NORDIC_EURO: [
    { base: '#f5d0b5', shadow: '#dfb191', ears: '#eac0a2' },
    { base: '#f0c4a6', shadow: '#d8a483', ears: '#e3b393' },
    { base: '#e5b594', shadow: '#cc9774', ears: '#d9a684' },
  ],
  MED_LATIN: [
    { base: '#e2af8b', shadow: '#c68f69', ears: '#d49f7a' },
    { base: '#d49d75', shadow: '#b87f57', ears: '#c68e66' },
    { base: '#c58c63', shadow: '#a66f47', ears: '#b67d55' },
  ],
  AFRO_CARIBBEAN: [
    { base: '#8d5838', shadow: '#6e4126', ears: '#7d4c2f' },
    { base: '#734429', shadow: '#57311b', ears: '#653b22' },
    { base: '#5c341e', shadow: '#422312', ears: '#4f2b18' },
    { base: '#a66d4b', shadow: '#875334', ears: '#96603f' },
  ],
  EAST_ASIAN: [
    { base: '#f2cba7', shadow: '#d9af89', ears: '#e6bd98' },
    { base: '#e8be96', shadow: '#cea178', ears: '#dbb087' },
  ],
};

const HAIR_COLORS = [
  '#141418', // Jet black
  '#231a14', // Dark espresso brown
  '#3b281c', // Chestnut brown
  '#593b25', // Medium brown
  '#8c6239', // Dark blonde / light brown
  '#c69c53', // Golden blonde
  '#6b321e', // Auburn
];

function hashPlayerSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickSkinTone(nat: string | undefined, hash: number) {
  const code = (nat || '').toUpperCase();
  if (['NGA', 'GHA', 'SEN', 'CIV', 'CMR', 'MLI', 'COD', 'GUI', 'BFA', 'JAM'].includes(code)) {
    const list = SKIN_PALETTES.AFRO_CARIBBEAN;
    return list[hash % list.length];
  }
  if (['JPN', 'KOR', 'CHN'].includes(code)) {
    const list = SKIN_PALETTES.EAST_ASIAN;
    return list[hash % list.length];
  }
  if (['ESP', 'POR', 'ITA', 'GRE', 'TUR', 'ARG', 'URU', 'COL', 'MEX', 'CHL', 'MAR', 'EGY', 'ALG', 'TUN'].includes(code)) {
    const list = SKIN_PALETTES.MED_LATIN;
    return list[hash % list.length];
  }
  if (['FRA', 'BRA', 'ENG', 'USA', 'BEL', 'NED'].includes(code)) {
    const all = [
      ...SKIN_PALETTES.NORDIC_EURO,
      ...SKIN_PALETTES.MED_LATIN,
      ...SKIN_PALETTES.AFRO_CARIBBEAN,
    ];
    return all[hash % all.length];
  }
  const nordicAndMed = [...SKIN_PALETTES.NORDIC_EURO, ...SKIN_PALETTES.MED_LATIN];
  return nordicAndMed[hash % nordicAndMed.length];
}

export const PlayerAvatar: React.FC<{
  player?:
    | (Pick<Player, 'id' | 'firstName' | 'lastName' | 'clubId' | 'positions'> &
        Partial<
          Pick<
            Player,
            | 'isYouthAcademy'
            | 'isWonderkid'
            | 'squadStatus'
            | 'potentialAbility'
            | 'dateOfBirth'
            | 'nationality'
          >
        > & { shirtNumber?: number })
    | null;
  club?: Pick<Club, 'id' | 'leagueId' | 'countryId' | 'primaryColor' | 'secondaryColor'> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}> = ({ player, club, size = 'sm', className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const faceUrl = getPlayerFaceUrl(player, club);

  useEffect(() => {
    setImgError(false);
  }, [faceUrl]);

  if (!player) return null;

  const sizeClasses: Record<typeof size, string> = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-sm',
    xl: 'w-16 h-16 text-base',
  };

  if (faceUrl && !imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-slate-800 border border-slate-700/80 shrink-0 flex items-center justify-center select-none ${className}`}
        data-testid="player-avatar-verified"
      >
        <img
          src={faceUrl}
          alt={`${player.firstName} ${player.lastName}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
  }

  // Procedural Illustrated Footballer Avatar (NewGAN / FM Regen Style)
  const seed = hashPlayerSeed(`${player.id}_${player.firstName}_${player.lastName}`);
  const skin = pickSkinTone(player.nationality || club?.countryId, seed);
  const hairColor = HAIR_COLORS[(seed >>> 3) % HAIR_COLORS.length];
  const hairStyle = (seed >>> 6) % 6;
  const hasBeard = (seed >>> 9) % 3 === 0;
  const isGK = player.positions?.[0] === 'GK';
  const kitPrimary = isGK ? '#10b981' : club?.primaryColor || '#1e40af';
  const kitSecondary = isGK ? '#064e3b' : club?.secondaryColor || '#ffffff';
  const kitStripePattern = (seed >>> 11) % 3;

  return (
    <div
      className={`${sizeClasses[size]} rounded-full overflow-hidden bg-slate-900 border border-slate-700/90 shrink-0 flex items-center justify-center select-none ${className}`}
      style={{ borderColor: club?.primaryColor || '#334155' }}
      title={`${player.firstName} ${player.lastName}`}
      data-testid="player-avatar-regen"
    >
      <svg viewBox="0 0 64 64" className="w-full h-full">
        {/* Stadium Backdrop Glow */}
        <rect width="64" height="64" fill="#0f172a" />
        <circle cx="32" cy="28" r="26" fill={kitPrimary} fillOpacity="0.18" />

        {/* Footballer Shoulders & Club Kit Jersey */}
        <path
          d="M10 64 C11 50, 20 45, 32 45 C44 45, 53 50, 54 64 Z"
          fill={kitPrimary}
        />
        {/* Kit Pattern Detail (Stripes / Sash / Sleeves) */}
        {kitStripePattern === 0 && (
          <g fill={kitSecondary} fillOpacity="0.88">
            <rect x="23" y="46" width="4" height="18" />
            <rect x="37" y="46" width="4" height="18" />
          </g>
        )}
        {kitStripePattern === 1 && (
          <path d="M10 64 C11 53, 16 48, 22 47 L22 64 Z M54 64 C53 53, 48 48, 42 47 L42 64 Z" fill={kitSecondary} fillOpacity="0.9" />
        )}
        {/* V-Neck Club Collar */}
        <path
          d="M24 45 L32 53 L40 45"
          fill="none"
          stroke={kitSecondary}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Neck & Chin Shadow */}
        <rect x="27" y="37" width="10" height="10" rx="4" fill={skin.shadow} />

        {/* Ears */}
        <ellipse cx="19.5" cy="27.5" rx="2.4" ry="4" fill={skin.ears} />
        <ellipse cx="44.5" cy="27.5" rx="2.4" ry="4" fill={skin.ears} />

        {/* Head / Jawline Contour */}
        <path
          d="M20 22 C20 13, 44 13, 44 22 C44 33, 38.5 40.5, 32 40.5 C25.5 40.5, 20 33, 20 22 Z"
          fill={skin.base}
        />

        {/* Subtle Cheek / Jaw Shading */}
        <path
          d="M32 14 C39 14, 44 18, 44 23 C44 33, 38.5 40.5, 32 40.5 Z"
          fill={skin.shadow}
          fillOpacity="0.22"
        />

        {/* Facial Hair / Stubble (for ~33% of players) */}
        {hasBeard && (
          <path
            d="M21.5 29 C22 36, 26.5 40.2, 32 40.2 C37.5 40.2, 42 36, 42.5 29 C41 33.5, 37 36, 32 36 C27 36, 23 33.5, 21.5 29 Z"
            fill={hairColor}
            fillOpacity="0.48"
          />
        )}

        {/* Eyebrows */}
        <path
          d="M24.2 23.2 Q27.2 22 29.8 23.2 M34.2 23.2 Q36.8 22 39.8 23.2"
          fill="none"
          stroke={hairColor}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Eyes */}
        <circle cx="27" cy="26" r="1.45" fill="#0f172a" />
        <circle cx="37" cy="26" r="1.45" fill="#0f172a" />
        <circle cx="27.4" cy="25.6" r="0.45" fill="#ffffff" />
        <circle cx="37.4" cy="25.6" r="0.45" fill="#ffffff" />

        {/* Nose */}
        <path
          d="M32 25.5 L31 31.2 L33.2 31.5"
          fill="none"
          stroke={skin.shadow}
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Mouth / Determined Expression */}
        <path
          d="M28.8 34.8 Q32 36.1 35.2 34.8"
          fill="none"
          stroke="#7c2d12"
          strokeOpacity="0.65"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* 6 Distinct Footballer Hairstyles */}
        {hairStyle === 0 && (
          /* Short Modern Fade & Crop */
          <path
            d="M19.8 22.5 C19.5 13, 25 10.5, 32 10.5 C39 10.5, 44.5 13, 44.2 22.5 C42.5 17.5, 38 16, 32 16 C26 16, 21.5 17.5, 19.8 22.5 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 1 && (
          /* Side-Part Pompadour / Swept Quiff */
          <path
            d="M19.5 23 C18.5 12, 25 8.5, 34 9.5 C41 10, 45 14, 44.2 22.5 C42 17, 36 14.5, 27 16.5 C23 17.5, 21 19.5, 19.5 23 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 2 && (
          /* Curly / High-Top Textured Afro */
          <path
            d="M18.8 22.5 C17.5 15, 21 8.5, 32 8.5 C43 8.5, 46.5 15, 45.2 22.5 C43 17, 38 15.5, 32 15.5 C26 15.5, 21 17, 18.8 22.5 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 3 && (
          /* Wavy Mid-Length / Curtain Fringe */
          <path
            d="M19 24.5 C18.5 13, 24 9.5, 32 9.5 C40 9.5, 45.5 13, 45 24.5 C43.5 18.5, 39 15.5, 32 18.5 C25 15.5, 20.5 18.5, 19 24.5 Z"
            fill={hairColor}
          />
        )}
        {hairStyle === 4 && (
          /* Close Buzzcut / Athletic Fade */
          <path
            d="M20.2 21.5 C20.5 13.5, 25.5 11.5, 32 11.5 C38.5 11.5, 43.5 13.5, 43.8 21.5 C41.5 17, 37.5 15.5, 32 15.5 C26.5 15.5, 22.5 17, 20.2 21.5 Z"
            fill={hairColor}
            fillOpacity="0.82"
          />
        )}
        {hairStyle === 5 && (
          /* Spiky / Messy Forward Fringe */
          <path
            d="M19.5 22.5 C19.5 12, 25 9.5, 32 9.5 C39 9.5, 44.5 12, 44.5 22.5 L41 17.5 L38 19.5 L34.5 16.5 L31.5 19.5 L28 16.5 L24.5 19.5 L22 17.5 Z"
            fill={hairColor}
          />
        )}
      </svg>
    </div>
  );
};
