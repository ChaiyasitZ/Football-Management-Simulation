import React, { useEffect, useState } from 'react';
import { Club } from '../types/game';
import { CLUB_TEMPLATES } from '../engine/leaguesConfig';

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

export const ClubBadge: React.FC<{
  club?: Pick<Club, 'name' | 'shortName' | 'primaryColor' | 'logoUrl'> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ club, size = 'md', className = '' }) => {
  const [imgError, setImgError] = useState(false);

  const resolvedLogoUrl =
    (club?.name ? LATEST_LOGO_BY_NAME.get(club.name.toLowerCase()) : undefined) ||
    club?.logoUrl;

  useEffect(() => {
    setImgError(false);
  }, [resolvedLogoUrl]);

  if (!club) return null;

  const sizeMap = {
    xs: 'w-4 h-4 text-[9px] rounded-sm',
    sm: 'w-6 h-6 text-[10px] rounded',
    md: 'w-8 h-8 text-xs rounded',
    lg: 'w-11 h-11 text-base rounded-lg',
  };

  if (resolvedLogoUrl && !imgError) {
    return (
      <img
        src={resolvedLogoUrl}
        alt={club.name}
        onError={() => setImgError(true)}
        className={`${sizeMap[size]} object-contain shrink-0 select-none ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeMap[size]} flex items-center justify-center font-display font-bold text-slate-950 shrink-0 select-none ${className}`}
      style={{ backgroundColor: club.primaryColor }}
    >
      {size === 'xs' ? '' : club.shortName}
    </div>
  );
};

