import React, { useEffect, useState } from 'react';
import { Club, Player } from '../types/game';
import { getPlayerFaceUrl } from '../engine/engPlayerFaces';

export const PlayerAvatar: React.FC<{
  player?:
    | (Pick<Player, 'id' | 'firstName' | 'lastName' | 'clubId' | 'positions'> &
        Partial<
          Pick<
            Player,
            'isYouthAcademy' | 'isWonderkid' | 'squadStatus' | 'potentialAbility' | 'dateOfBirth'
          >
        >)
    | null;
  club?: Pick<Club, 'id' | 'leagueId' | 'countryId' | 'primaryColor'> | null;
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

  const initials = `${player.firstName?.[0] || ''}${player.lastName?.[0] || ''}`.toUpperCase();

  if (faceUrl && !imgError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden bg-slate-800 border border-slate-700/80 shrink-0 flex items-center justify-center select-none ${className}`}
      >
        <img
          src={faceUrl}
          alt={`${player.firstName} ${player.lastName}`}
          loading="lazy"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover object-top"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-slate-800 border border-slate-700 text-slate-200 font-display font-bold shrink-0 flex items-center justify-center select-none ${className}`}
      style={club?.primaryColor ? { borderColor: club.primaryColor } : undefined}
    >
      {initials}
    </div>
  );
};
