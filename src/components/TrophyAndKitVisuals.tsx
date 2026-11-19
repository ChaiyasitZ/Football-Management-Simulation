import React, { useEffect, useState } from 'react';
import {
  Club,
  ContinentalCupId,
  CupId,
  LeagueId,
  PromotionPlayoffId,
  SuperCupId,
  UefaCompetitionId,
} from '../types/game';
import { LEAGUES_CONFIG } from '../engine/leaguesConfig';
import { UEFA_COMPETITIONS_CONFIG } from '../engine/uefaEngine';

/* ============================================================================
   1. AUTHENTIC COMPETITION & LEAGUE EMBLEMS (23 Leagues, 4 UEFA, 3 Continental, 20 Cups, 9 Super Cups, 6 Playoffs, Global)
============================================================================ */

export type CompetitionVisualId =
  | LeagueId
  | UefaCompetitionId
  | ContinentalCupId
  | PromotionPlayoffId
  | CupId
  | SuperCupId
  | 'PRE_SEASON_FRIENDLY'
  | 'FIFA_CWC'
  | 'GLB_CWC'
  | 'EURO_NATIONS'
  | 'INT_EURO'
  | 'WORLD_CUP'
  | 'BALLON_DOR'
  | 'GOLDEN_BOOT';

export interface CompStyleMeta {
  shortCode: string;
  title: string;
  subtitle: string;
  primary: string;
  secondary: string;
  accent: string;
  motif: 'crown_lion' | 'starball' | 'uel_wave' | 'uecl_spire' | 'laliga' | 'bundesliga' | 'serie_a' | 'ligue_1' | 'cup_shield' | 'globe_crown' | 'heraldic';
  fotmobLogoUrl?: string;
  trophyImageUrl?: string;
}

export const COMPETITION_STYLE_MAP: Record<string, CompStyleMeta> = {
  // UEFA Competitions
  UEFA_UCL: {
    shortCode: 'UCL',
    title: 'UEFA Champions League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#091442',
    secondary: '#1d4ed8',
    accent: '#e2e8f0',
    motif: 'starball',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/42.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/4.png',
  },
  UEFA_UEL: {
    shortCode: 'UEL',
    title: 'UEFA Europa League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#1c1917',
    secondary: '#ea580c',
    accent: '#fb923c',
    motif: 'uel_wave',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/73.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/264.png',
  },
  UEFA_UECL: {
    shortCode: 'UECL',
    title: 'UEFA Conference League',
    subtitle: '36-Club Swiss League Phase',
    primary: '#052e16',
    secondary: '#16a34a',
    accent: '#4ade80',
    motif: 'uecl_spire',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/10216.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/763.png',
  },
  UEFA_USC: {
    shortCode: 'USC',
    title: 'UEFA Super Cup',
    subtitle: 'European Champions Curtain-Raiser',
    primary: '#0f172a',
    secondary: '#0284c7',
    accent: '#fde047',
    motif: 'starball',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/74.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/354.png',
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
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/47.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/12.png',
  },
  ESP_LL: {
    shortCode: 'LALIGA',
    title: 'LaLiga EA Sports',
    subtitle: 'Spain · Tier 1',
    primary: '#450a0a',
    secondary: '#ff4b44',
    accent: '#ffffff',
    motif: 'laliga',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/87.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/11.png',
  },
  GER_BL: {
    shortCode: 'BUNDESLIGA',
    title: 'Bundesliga',
    subtitle: 'Germany · Tier 1',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'bundesliga',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/54.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/10.png',
  },
  ITA_SA: {
    shortCode: 'SERIE A',
    title: 'Serie A Enilive',
    subtitle: 'Italy · Tier 1',
    primary: '#0c4a6e',
    secondary: '#0284c7',
    accent: '#38bdf8',
    motif: 'serie_a',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/55.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/13.png',
  },
  FRA_L1: {
    shortCode: 'L1',
    title: 'Ligue 1 McDonald’s',
    subtitle: 'France · Tier 1',
    primary: '#0f172a',
    secondary: '#1e3a8a',
    accent: '#bef264',
    motif: 'ligue_1',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/53.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/14.png',
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
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/61.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/15.png',
  },
  NED_ED: {
    shortCode: 'EREDIVISIE',
    title: 'Eredivisie',
    subtitle: 'Netherlands · Tier 1',
    primary: '#1e1b4b',
    secondary: '#ea580c',
    accent: '#ffffff',
    motif: 'crown_lion',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/57.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/16.png',
  },
  BEL_PL: {
    shortCode: 'JPL',
    title: 'Jupiler Pro League',
    subtitle: 'Belgium · Tier 1',
    primary: '#450a0a',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/40.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/18.png',
  },
  TUR_SL: {
    shortCode: 'SÜPER LİG',
    title: 'Trendyol Süper Lig',
    subtitle: 'Turkey · Tier 1',
    primary: '#7f1d1d',
    secondary: '#ef4444',
    accent: '#ffffff',
    motif: 'starball',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/71.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/20.png',
  },
  SCO_PR: {
    shortCode: 'SPFL',
    title: 'Scottish Premiership',
    subtitle: 'Scotland · Tier 1',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#ffffff',
    motif: 'crown_lion',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/64.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/21.png',
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
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/48.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/338.png',
  },
  ESP_SD: {
    shortCode: 'LALIGA 2',
    title: 'LaLiga Hypermotion',
    subtitle: 'Spain · Tier 2',
    primary: '#0f172a',
    secondary: '#e11d48',
    accent: '#38bdf8',
    motif: 'laliga',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/140.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/339.png',
  },
  GER_2B: {
    shortCode: '2. BL',
    title: '2. Bundesliga',
    subtitle: 'Germany · Tier 2',
    primary: '#1f2937',
    secondary: '#dc2626',
    accent: '#e5e7eb',
    motif: 'bundesliga',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/146.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/320.png',
  },
  ITA_SB: {
    shortCode: 'SERIE B',
    title: 'Serie BKT',
    subtitle: 'Italy · Tier 2',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#facc15',
    motif: 'serie_a',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/86.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/340.png',
  },
  FRA_L2: {
    shortCode: 'L2',
    title: 'Ligue 2 BKT',
    subtitle: 'France · Tier 2',
    primary: '#0f172a',
    secondary: '#0284c7',
    accent: '#2dd4bf',
    motif: 'ligue_1',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/110.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/341.png',
  },
  // Primary Domestic National Cups (10)
  ENG_CUP: {
    shortCode: 'FA CUP',
    title: 'Emirates FA Cup',
    subtitle: 'English Primary Knockout Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/132.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/29.png',
  },
  ESP_CUP: {
    shortCode: 'COPA',
    title: 'Copa del Rey',
    subtitle: 'Spanish Royal Knockout Cup',
    primary: '#78350f',
    secondary: '#d97706',
    accent: '#fef08a',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/138.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/94.png',
  },
  GER_CUP: {
    shortCode: 'DFB-POKAL',
    title: 'DFB-Pokal',
    subtitle: 'German National Knockout Cup',
    primary: '#064e3b',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/209.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/27.png',
  },
  ITA_CUP: {
    shortCode: 'COPPA',
    title: 'Coppa Italia Frecciarossa',
    subtitle: 'Italian National Knockout Cup',
    primary: '#0c4a6e',
    secondary: '#dc2626',
    accent: '#22c55e',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/141.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/92.png',
  },
  FRA_CUP: {
    shortCode: 'CDF',
    title: 'Coupe de France',
    subtitle: 'French National Knockout Cup',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#ef4444',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/134.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/96.png',
  },
  POR_CUP: {
    shortCode: 'TAÇA',
    title: 'Taça de Portugal',
    subtitle: 'Portuguese Primary Cup',
    primary: '#7f1d1d',
    secondary: '#16a34a',
    accent: '#facc15',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/186.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/97.png',
  },
  NED_CUP: {
    shortCode: 'KNVB',
    title: 'TOTO KNVB Beker',
    subtitle: 'Dutch National Knockout Cup',
    primary: '#7c2d12',
    secondary: '#ea580c',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/235.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/98.png',
  },
  BEL_CUP: {
    shortCode: 'CROKY',
    title: 'Croky Cup',
    subtitle: 'Belgian National Cup',
    primary: '#450a0a',
    secondary: '#eab308',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/149.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/108.png',
  },
  TUR_CUP: {
    shortCode: 'ZTK',
    title: 'Ziraat Türkiye Kupası',
    subtitle: 'Turkish National Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/151.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/107.png',
  },
  SCO_CUP: {
    shortCode: 'SCO CUP',
    title: 'Scottish Gas Scottish Cup',
    subtitle: 'Scottish Primary Knockout Cup',
    primary: '#1e3a8a',
    secondary: '#38bdf8',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/137.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/109.png',
  },
  // Secondary League Cups (3 Authentic European League Cups)
  ENG_LC: {
    shortCode: 'EFL CUP',
    title: 'EFL Carabao Cup',
    subtitle: 'English League Cup',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/133.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/47.png',
  },
  POR_LC: {
    shortCode: 'ALLIANZ',
    title: 'Taça da Liga (Allianz Cup)',
    subtitle: 'Portuguese League Cup',
    primary: '#1e3a8a',
    secondary: '#0284c7',
    accent: '#38bdf8',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/187.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/337.png',
  },
  SCO_LC: {
    shortCode: 'SPFL CUP',
    title: 'Scottish League Cup (Premier Sports Cup)',
    subtitle: 'Scottish League Cup',
    primary: '#311042',
    secondary: '#9333ea',
    accent: '#facc15',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/180.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/345.png',
  },
  // National Super Cups (9)
  ENG_SC: {
    shortCode: 'SHIELD',
    title: 'FA Community Shield',
    subtitle: 'English Super Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#fde047',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/247.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/316.png',
  },
  ESP_SC: {
    shortCode: 'SUPERCOPA',
    title: 'Supercopa de España',
    subtitle: 'Spanish Super Cup',
    primary: '#78350f',
    secondary: '#f59e0b',
    accent: '#fef08a',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/139.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/93.png',
  },
  GER_SC: {
    shortCode: 'SUPERCUP',
    title: 'DFL-Supercup',
    subtitle: 'German Super Cup',
    primary: '#1f2937',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/8924.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/312.png',
  },
  ITA_SC: {
    shortCode: 'SUPERCOPPA',
    title: 'Supercoppa Italiana',
    subtitle: 'Italian Super Cup',
    primary: '#0c4a6e',
    secondary: '#0284c7',
    accent: '#fde047',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/222.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/91.png',
  },
  FRA_SC: {
    shortCode: 'TDC',
    title: 'Trophée des Champions',
    subtitle: 'French Super Cup',
    primary: '#1e1b4b',
    secondary: '#2563eb',
    accent: '#bef264',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/207.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/328.png',
  },
  POR_SC: {
    shortCode: 'SUPERTAÇA',
    title: 'Supertaça Cândido de Oliveira',
    subtitle: 'Portuguese Super Cup',
    primary: '#7f1d1d',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/188.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/336.png',
  },
  NED_SC: {
    shortCode: 'CRUYFF',
    title: 'Johan Cruyff Shield',
    subtitle: 'Dutch Super Cup',
    primary: '#7c2d12',
    secondary: '#ea580c',
    accent: '#fde047',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/237.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/327.png',
  },
  BEL_SC: {
    shortCode: 'BEL SC',
    title: 'Belgian Super Cup',
    subtitle: 'Belgian Super Cup',
    primary: '#450a0a',
    secondary: '#dc2626',
    accent: '#facc15',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9862.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/335.png',
  },
  TUR_SC: {
    shortCode: 'SÜPER KUPA',
    title: 'Turkcell Süper Kupa',
    subtitle: 'Turkish Super Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#fde047',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/10366.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/344.png',
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
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/78.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/318.png',
  },
  GLB_CWC: {
    shortCode: 'CWC',
    title: 'FIFA Club World Cup',
    subtitle: 'Global Club Championship',
    primary: '#1c1917',
    secondary: '#d97706',
    accent: '#fde047',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/78.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/318.png',
  },
  EURO_NATIONS: {
    shortCode: 'EURO',
    title: 'UEFA European Championship',
    subtitle: 'International Nations Tournament',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#facc15',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/50.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/102.png',
  },
  INT_EURO: {
    shortCode: 'EURO',
    title: 'UEFA European Championship',
    subtitle: 'International Nations Tournament',
    primary: '#172554',
    secondary: '#2563eb',
    accent: '#facc15',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/50.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/102.png',
  },
  WORLD_CUP: {
    shortCode: 'WORLD CUP',
    title: 'FIFA World Cup',
    subtitle: 'World Football Championship',
    primary: '#052e16',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/77.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/101.png',
  },
  BALLON_DOR: {
    shortCode: 'BALLON D\'OR',
    title: 'Ballon d\'Or',
    subtitle: 'World Player of the Year',
    primary: '#451a03',
    secondary: '#ca8a04',
    accent: '#fef08a',
    motif: 'globe_crown',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/676.png',
  },
  GOLDEN_BOOT: {
    shortCode: 'GOLDEN SHOE',
    title: 'European Golden Shoe',
    subtitle: 'Top Goalscorer Award',
    primary: '#451a03',
    secondary: '#eab308',
    accent: '#fef08a',
    motif: 'globe_crown',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/195.png',
  },
  PRE_SEASON_FRIENDLY: {
    shortCode: 'FRIENDLY',
    title: 'Pre-Season Club Friendly',
    subtitle: 'International Pre-Season Showcase',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#fde047',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/105.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/318.png',
  },
  // 8 Stage 9 New Playable Leagues
  ENG_L1: {
    shortCode: 'EFL L1',
    title: 'EFL League One',
    subtitle: 'England · Tier 3',
    primary: '#1e293b',
    secondary: '#0284c7',
    accent: '#38bdf8',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/108.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/342.png',
  },
  AUT_BL: {
    shortCode: 'ADMIRAL BL',
    title: 'Austrian Bundesliga',
    subtitle: 'Austria · Tier 1',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'bundesliga',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/38.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/17.png',
  },
  SUI_SL: {
    shortCode: 'SUPER LEAGUE',
    title: 'Swiss Super League',
    subtitle: 'Switzerland · Tier 1',
    primary: '#7f1d1d',
    secondary: '#ef4444',
    accent: '#ffffff',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/69.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/19.png',
  },
  GRE_SL: {
    shortCode: 'STOIXIMAN SL',
    title: 'Stoiximan Super League',
    subtitle: 'Greece · Tier 1',
    primary: '#1e3a8a',
    secondary: '#2563eb',
    accent: '#38bdf8',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/135.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/23.png',
  },
  KSA_SPL: {
    shortCode: 'ROSHN SPL',
    title: 'Roshn Saudi Pro League',
    subtitle: 'Saudi Arabia · Tier 1',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#facc15',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/536.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/380.png',
  },
  USA_MLS: {
    shortCode: 'MLS',
    title: 'Major League Soccer',
    subtitle: 'United States · Tier 1',
    primary: '#172554',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/130.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/281.png',
  },
  BRA_SA: {
    shortCode: 'BRASILEIRÃO',
    title: 'Brasileirão Betano Série A',
    subtitle: 'Brazil · Tier 1',
    primary: '#052e16',
    secondary: '#16a34a',
    accent: '#facc15',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/268.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/275.png',
  },
  JPN_J1: {
    shortCode: 'J1 LEAGUE',
    title: 'Meiji Yasuda J1 League',
    subtitle: 'Japan · Tier 1',
    primary: '#450a0a',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'heraldic',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/223.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/352.png',
  },
  // 7 Stage 9 New Domestic Cups
  AUT_CUP: {
    shortCode: 'ÖFB-CUP',
    title: 'UNIQA ÖFB-Cup',
    subtitle: 'Austrian National Knockout Cup',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/278.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/105.png',
  },
  SUI_CUP: {
    shortCode: 'SUI CUP',
    title: 'Schweizer Cup',
    subtitle: 'Swiss National Knockout Cup',
    primary: '#7f1d1d',
    secondary: '#ef4444',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/575.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/106.png',
  },
  GRE_CUP: {
    shortCode: 'GRE CUP',
    title: 'Greek Football Cup',
    subtitle: 'Greek National Knockout Cup',
    primary: '#1e3a8a',
    secondary: '#0284c7',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/145.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/111.png',
  },
  KSA_CUP: {
    shortCode: 'KING CUP',
    title: 'King\'s Cup (Custodian of the Two Holy Mosques Cup)',
    subtitle: 'Saudi Royal Knockout Cup',
    primary: '#064e3b',
    secondary: '#ca8a04',
    accent: '#fde047',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9475.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/475.png',
  },
  USA_CUP: {
    shortCode: 'OPEN CUP',
    title: 'Lamar Hunt U.S. Open Cup',
    subtitle: 'American National Knockout Cup',
    primary: '#172554',
    secondary: '#dc2626',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/9441.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/436.png',
  },
  BRA_CUP: {
    shortCode: 'COPA DO BRASIL',
    title: 'Copa Betano do Brasil',
    subtitle: 'Brazilian National Knockout Cup',
    primary: '#052e16',
    secondary: '#16a34a',
    accent: '#facc15',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/203.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/390.png',
  },
  JPN_CUP: {
    shortCode: 'EMPEROR CUP',
    title: 'Emperor\'s Cup JFA',
    subtitle: 'Japanese National Knockout Cup',
    primary: '#450a0a',
    secondary: '#dc2626',
    accent: '#fde047',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/225.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/441.png',
  },
  // Stage 11: 3 Global Continental Champions Cups
  AFC_ACL: {
    shortCode: 'AFC ELITE',
    title: 'AFC Champions League Elite',
    subtitle: 'Asian Continental Champions Cup',
    primary: '#1e1b4b',
    secondary: '#d97706',
    accent: '#fde047',
    motif: 'starball',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/525.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/144.png',
  },
  CONMEBOL_LIB: {
    shortCode: 'LIBERTADORES',
    title: 'CONMEBOL Copa Libertadores',
    subtitle: 'South American Continental Champions Cup',
    primary: '#422006',
    secondary: '#ca8a04',
    accent: '#fef08a',
    motif: 'globe_crown',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/45.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/191.png',
  },
  CONCACAF_CCC: {
    shortCode: 'CONCACAF CUP',
    title: 'CONCACAF Champions Cup',
    subtitle: 'North American Continental Champions Cup',
    primary: '#0f172a',
    secondary: '#eab308',
    accent: '#f8fafc',
    motif: 'starball',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/297.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/330.png',
  },
  // Stage 11: 6 Tier 2/3 Promotion Playoffs (3rd–6th)
  ENG_CH_PO: {
    shortCode: 'CH PLAYOFFS',
    title: 'EFL Championship Promotion Playoffs',
    subtitle: 'Wembley Promotion Final (3rd–6th)',
    primary: '#172554',
    secondary: '#f59e0b',
    accent: '#fef08a',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/48.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/338.png',
  },
  ENG_L1_PO: {
    shortCode: 'L1 PLAYOFFS',
    title: 'EFL League One Promotion Playoffs',
    subtitle: 'Wembley Promotion Final (3rd–6th)',
    primary: '#1e3a8a',
    secondary: '#38bdf8',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/108.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/342.png',
  },
  ESP_SD_PO: {
    shortCode: 'SD PLAYOFFS',
    title: 'LaLiga Hypermotion Promotion Playoffs',
    subtitle: 'Spanish Promotion Final (3rd–6th)',
    primary: '#7f1d1d',
    secondary: '#ef4444',
    accent: '#fde047',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/140.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/339.png',
  },
  ITA_SB_PO: {
    shortCode: 'SB PLAYOFFS',
    title: 'Serie BKT Promotion Playoffs',
    subtitle: 'Italian Promotion Final (3rd–6th)',
    primary: '#0c4a6e',
    secondary: '#0284c7',
    accent: '#ffffff',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/86.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/422.png',
  },
  GER_2B_PO: {
    shortCode: '2B PLAYOFFS',
    title: '2. Bundesliga Promotion Playoffs',
    subtitle: 'German Promotion Final (3rd–6th)',
    primary: '#7f1d1d',
    secondary: '#dc2626',
    accent: '#f8fafc',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/146.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/320.png',
  },
  FRA_L2_PO: {
    shortCode: 'L2 PLAYOFFS',
    title: 'Ligue 2 BKT Promotion Playoffs',
    subtitle: 'French Promotion Final (3rd–6th)',
    primary: '#064e3b',
    secondary: '#10b981',
    accent: '#fef08a',
    motif: 'cup_shield',
    fotmobLogoUrl: 'https://images.fotmob.com/image_resources/logo/leaguelogo/dark/110.png',
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/341.png',
  },
};

/**
 * Resolves the primary FotMob dark CDN URL and the automatic step-2 standard FotMob CDN URL
 * (`leaguelogo/dark/<id>.png` -> `leaguelogo/<id>.png`) for any competition ID or trophy name.
 */
export function resolveFotMobCompetitionLogoUrls(competitionIdOrName: string): {
  darkUrl?: string;
  standardUrl?: string;
  meta: CompStyleMeta;
} {
  const raw = (competitionIdOrName || '').trim();
  const upper = raw.toUpperCase();
  const leagueCfg = LEAGUES_CONFIG[raw as LeagueId];

  let matchedKey = raw;
  if (!COMPETITION_STYLE_MAP[matchedKey]) {
    if (COMPETITION_STYLE_MAP[upper]) {
      matchedKey = upper;
    } else if (upper.includes('FRIENDLY') || upper.includes('PRE_SEASON_FRIENDLY')) {
      matchedKey = 'PRE_SEASON_FRIENDLY';
    } else if (upper.includes('LEAGUE ONE') || upper.includes('ENG_L1')) {
      matchedKey = 'ENG_L1';
    } else if (upper.includes('AUSTRIAN') || upper.includes('AUT_BL')) {
      matchedKey = 'AUT_BL';
    } else if (upper.includes('SWISS SUPER') || upper.includes('SUI_SL')) {
      matchedKey = 'SUI_SL';
    } else if (upper.includes('STOIXIMAN') || upper.includes('GRE_SL')) {
      matchedKey = 'GRE_SL';
    } else if (upper.includes('ROSHN') || upper.includes('SAUDI PRO') || upper.includes('KSA_SPL')) {
      matchedKey = 'KSA_SPL';
    } else if (upper.includes('MAJOR LEAGUE SOCCER') || upper.includes('USA_MLS')) {
      matchedKey = 'USA_MLS';
    } else if (upper.includes('BRASILEIRÃO') || upper.includes('BRA_SA')) {
      matchedKey = 'BRA_SA';
    } else if (upper.includes('J1 LEAGUE') || upper.includes('JPN_J1')) {
      matchedKey = 'JPN_J1';
    } else if (upper.includes('ÖFB-CUP') || upper.includes('AUT_CUP')) {
      matchedKey = 'AUT_CUP';
    } else if (upper.includes('SCHWEIZER CUP') || upper.includes('SUI_CUP')) {
      matchedKey = 'SUI_CUP';
    } else if (upper.includes('GREEK') && upper.includes('CUP')) {
      matchedKey = 'GRE_CUP';
    } else if (upper.includes('KING\'S CUP') || upper.includes('KSA_CUP')) {
      matchedKey = 'KSA_CUP';
    } else if (upper.includes('OPEN CUP') || upper.includes('USA_CUP')) {
      matchedKey = 'USA_CUP';
    } else if (upper.includes('COPA DO BRASIL') || upper.includes('BRA_CUP')) {
      matchedKey = 'BRA_CUP';
    } else if (upper.includes('EMPEROR') || upper.includes('JPN_CUP')) {
      matchedKey = 'JPN_CUP';
    } else if (upper.includes('CARABAO') || upper.includes('EFL CUP') || upper.includes('ENG_LC')) {
      matchedKey = 'ENG_LC';
    } else if (upper.includes('ALLIANZ') || upper.includes('TAÇA DA LIGA') || upper.includes('POR_LC')) {
      matchedKey = 'POR_LC';
    } else if (upper.includes('PREMIER SPORTS') || upper.includes('SCOTTISH LEAGUE CUP') || upper.includes('SCO_LC')) {
      matchedKey = 'SCO_LC';
    } else if (upper.includes('COMMUNITY SHIELD') || upper.includes('ENG_SC')) {
      matchedKey = 'ENG_SC';
    } else if (upper.includes('SUPERCOPA') || upper.includes('ESP_SC')) {
      matchedKey = 'ESP_SC';
    } else if (upper.includes('DFL-SUPERCUP') || upper.includes('GER_SC')) {
      matchedKey = 'GER_SC';
    } else if (upper.includes('SUPERCOPPA') || upper.includes('ITA_SC')) {
      matchedKey = 'ITA_SC';
    } else if (upper.includes('TROPHÉE DES CHAMPIONS') || upper.includes('FRA_SC')) {
      matchedKey = 'FRA_SC';
    } else if (upper.includes('SUPERTAÇA') || upper.includes('POR_SC')) {
      matchedKey = 'POR_SC';
    } else if (upper.includes('CRUYFF') || upper.includes('NED_SC')) {
      matchedKey = 'NED_SC';
    } else if (upper.includes('BELGIAN SUPER') || upper.includes('BEL_SC')) {
      matchedKey = 'BEL_SC';
    } else if (upper.includes('SÜPER KUPA') || upper.includes('TUR_SC')) {
      matchedKey = 'TUR_SC';
    } else if (upper.includes('UEFA SUPER CUP') || upper.includes('UEFA_USC')) {
      matchedKey = 'UEFA_USC';
    } else if (upper.includes('FA CUP') || upper.includes('ENG_CUP')) {
      matchedKey = 'ENG_CUP';
    } else if (upper.includes('COPA DEL REY') || upper.includes('ESP_CUP')) {
      matchedKey = 'ESP_CUP';
    } else if (upper.includes('DFB-POKAL') || upper.includes('GER_CUP')) {
      matchedKey = 'GER_CUP';
    } else if (upper.includes('COPPA ITALIA') || upper.includes('ITA_CUP')) {
      matchedKey = 'ITA_CUP';
    } else if (upper.includes('COUPE DE FRANCE') || upper.includes('FRA_CUP')) {
      matchedKey = 'FRA_CUP';
    } else if (upper.includes('TAÇA DE PORTUGAL') || upper.includes('POR_CUP')) {
      matchedKey = 'POR_CUP';
    } else if (upper.includes('KNVB') || upper.includes('NED_CUP')) {
      matchedKey = 'NED_CUP';
    } else if (upper.includes('CROKY') || upper.includes('BEL_CUP')) {
      matchedKey = 'BEL_CUP';
    } else if (upper.includes('TÜRKIYE KUPASI') || upper.includes('ZIRAAT') || upper.includes('TUR_CUP')) {
      matchedKey = 'TUR_CUP';
    } else if (upper.includes('SCOTTISH CUP') || upper.includes('SCO_CUP')) {
      matchedKey = 'SCO_CUP';
    } else if (upper.includes('CHAMPIONS LEAGUE') || upper.includes('UEFA_UCL')) {
      matchedKey = 'UEFA_UCL';
    } else if (upper.includes('EUROPA LEAGUE') || upper.includes('UEFA_UEL')) {
      matchedKey = 'UEFA_UEL';
    } else if (upper.includes('CONFERENCE LEAGUE') || upper.includes('UEFA_UECL')) {
      matchedKey = 'UEFA_UECL';
    } else if (upper.includes('PREMIER LEAGUE') || upper.includes('ENG_PL')) {
      matchedKey = 'ENG_PL';
    } else if (upper.includes('HYPERMOTION') || upper.includes('ESP_SD')) {
      matchedKey = 'ESP_SD';
    } else if (upper.includes('LALIGA') || upper.includes('ESP_LL')) {
      matchedKey = 'ESP_LL';
    } else if (upper.includes('2. BUNDESLIGA') || upper.includes('GER_2B')) {
      matchedKey = 'GER_2B';
    } else if (upper.includes('BUNDESLIGA') || upper.includes('GER_BL')) {
      matchedKey = 'GER_BL';
    } else if (upper.includes('SERIE B') || upper.includes('ITA_SB')) {
      matchedKey = 'ITA_SB';
    } else if (upper.includes('SERIE A') || upper.includes('ITA_SA')) {
      matchedKey = 'ITA_SA';
    } else if (upper.includes('LIGUE 2') || upper.includes('FRA_L2')) {
      matchedKey = 'FRA_L2';
    } else if (upper.includes('LIGUE 1') || upper.includes('FRA_L1')) {
      matchedKey = 'FRA_L1';
    } else if (upper.includes('PRIMEIRA LIGA') || upper.includes('LIGA PORTUGAL') || upper.includes('POR_LP')) {
      matchedKey = 'POR_LP';
    } else if (upper.includes('EREDIVISIE') || upper.includes('NED_ED')) {
      matchedKey = 'NED_ED';
    } else if (upper.includes('PRO LEAGUE') || upper.includes('JUPILER') || upper.includes('BEL_PL')) {
      matchedKey = 'BEL_PL';
    } else if (upper.includes('SÜPER LİG') || upper.includes('SUPER LIG') || upper.includes('TUR_SL')) {
      matchedKey = 'TUR_SL';
    } else if (upper.includes('SCOTTISH PREMIERSHIP') || upper.includes('SCO_PR')) {
      matchedKey = 'SCO_PR';
    } else if (upper.includes('CHAMPIONSHIP') || upper.includes('ENG_CH')) {
      matchedKey = 'ENG_CH';
    } else if (upper.includes('BALLON')) {
      matchedKey = 'BALLON_DOR';
    } else if (upper.includes('GOLDEN BOOT') || upper.includes('GOLDEN SHOE')) {
      matchedKey = 'GOLDEN_BOOT';
    } else if (upper.includes('CLUB WORLD CUP') || upper.includes('FIFA_CWC') || upper.includes('GLB_CWC')) {
      matchedKey = 'FIFA_CWC';
    } else if (upper.includes('WORLD CUP') || upper.includes('WORLD_CUP')) {
      matchedKey = 'WORLD_CUP';
    } else if (upper.includes('EURO_NATIONS') || upper.includes('INT_EURO') || upper.includes('EUROPEAN CHAMPIONSHIP')) {
      matchedKey = 'EURO_NATIONS';
    }
  }

  const meta: CompStyleMeta = COMPETITION_STYLE_MAP[matchedKey] || {
    shortCode: raw.slice(0, 4).toUpperCase(),
    title:
      leagueCfg?.name ||
      UEFA_COMPETITIONS_CONFIG[raw as UefaCompetitionId]?.name ||
      raw,
    subtitle: 'Official Competition',
    primary: '#0f172a',
    secondary: '#10b981',
    accent: '#ffffff',
    motif: 'heraldic',
    fotmobLogoUrl: leagueCfg?.logoUrl || leagueCfg?.cupLogoUrl,
    trophyImageUrl: 'https://tmssl.akamaized.net/images/erfolge/verybigquad/29.png',
  };

  const darkUrl = meta.fotmobLogoUrl || leagueCfg?.logoUrl || leagueCfg?.cupLogoUrl;
  const standardUrl = darkUrl
    ? darkUrl.replace('/leaguelogo/dark/', '/leaguelogo/')
    : undefined;

  return { darkUrl, standardUrl, meta };
}

/**
 * Stage 10 Phase 1: Resolves the real physical trophy cutout photograph URLs
 * (`tmssl.akamaized.net/images/erfolge/verybigquad/<id>.png` -> `/medium/<id>.png` -> `/header/<id>.png`)
 * for all 58 competitions and individual awards.
 */
export function resolveCompetitionTrophyPhotoUrls(competitionIdOrName: string): {
  primaryTrophyUrl?: string;
  mediumTrophyUrl?: string;
  fallbackTrophyUrl?: string;
  meta: CompStyleMeta;
} {
  const { meta } = resolveFotMobCompetitionLogoUrls(competitionIdOrName);
  const primaryTrophyUrl = meta.trophyImageUrl;
  const mediumTrophyUrl = primaryTrophyUrl
    ? primaryTrophyUrl.replace('/erfolge/verybigquad/', '/erfolge/medium/')
    : undefined;
  const fallbackTrophyUrl = primaryTrophyUrl
    ? primaryTrophyUrl.replace('/erfolge/verybigquad/', '/erfolge/header/')
    : undefined;
  return { primaryTrophyUrl, mediumTrophyUrl, fallbackTrophyUrl, meta };
}

export const CompetitionBadge: React.FC<{
  competitionId: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ competitionId, size = 'md', className = '' }) => {
  const { darkUrl, standardUrl, meta } = resolveFotMobCompetitionLogoUrls(competitionId);
  const [fallbackStage, setFallbackStage] = useState<'dark' | 'standard' | 'svg'>('dark');

  useEffect(() => {
    setFallbackStage('dark');
  }, [darkUrl]);

  const dims =
    size === 'xs'
      ? 'w-5 h-5'
      : size === 'sm'
        ? 'w-7 h-7'
        : size === 'lg'
          ? 'w-12 h-12'
          : 'w-9 h-9';

  const pixelSizeMap = {
    xs: 20,
    sm: 28,
    md: 36,
    lg: 48,
  };

  const activeLogoUrl =
    fallbackStage === 'dark'
      ? darkUrl
      : fallbackStage === 'standard'
        ? standardUrl
        : undefined;

  if (activeLogoUrl && fallbackStage !== 'svg') {
    const px = pixelSizeMap[size];
    return (
      <div
        className={`inline-flex items-center justify-center shrink-0 select-none ${dims} ${className}`}
        title={meta.title}
        data-testid={`comp-badge-${competitionId}`}
      >
        <img
          src={activeLogoUrl}
          alt={meta.title}
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (fallbackStage === 'dark' && standardUrl && standardUrl !== darkUrl) {
              setFallbackStage('standard');
            } else {
              setFallbackStage('svg');
            }
          }}
          className="w-full h-full object-contain drop-shadow-sm select-none"
        />
      </div>
    );
  }

  const gradId = `comp-grad-${competitionId.replace(/[^a-zA-Z0-9]/g, '')}-${size}`;
  const isCircular =
    meta.motif === 'starball' || meta.motif === 'bundesliga' || competitionId === 'NED_ED';
  const isHexagonal =
    meta.motif === 'ligue_1' || meta.motif === 'laliga' || meta.motif === 'uecl_spire';
  const isDiamond = meta.motif === 'serie_a';

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

        {/* Distinct Outer Silhouette per Competition Family */}
        {isCircular ? (
          <>
            <circle
              cx="32"
              cy="31"
              r="27"
              fill={`url(#${gradId})`}
              stroke={meta.accent}
              strokeWidth="2.5"
            />
            <circle
              cx="32"
              cy="31"
              r="23"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.22"
              strokeWidth="1.2"
            />
          </>
        ) : isHexagonal ? (
          <>
            <polygon
              points="32,4 56,17 56,45 32,59 8,45 8,17"
              fill={`url(#${gradId})`}
              stroke={meta.accent}
              strokeWidth="2.5"
            />
            <polygon
              points="32,8 52,19 52,43 32,54 12,43 12,19"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.22"
              strokeWidth="1.2"
            />
          </>
        ) : isDiamond ? (
          <>
            <polygon
              points="32,3 58,29 32,60 6,29"
              fill={`url(#${gradId})`}
              stroke={meta.accent}
              strokeWidth="2.5"
            />
            <polygon
              points="32,8 53,29 32,54 11,29"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.22"
              strokeWidth="1.2"
            />
          </>
        ) : (
          <>
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
          </>
        )}

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
            <path
              d="M22 22 L25 15 L32 20 L39 15 L42 22 Z"
              fill={meta.accent}
            />
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
            <polygon points="32,14 43,26 32,38 21,26" fill="#ffffff" fillOpacity="0.15" stroke={meta.accent} strokeWidth="1.8" />
            <path d="M27 33 L32 19 L37 33 M28.5 29 H35.5" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
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
        <rect x="13" y="42" width="38" height="11" rx="3" fill="#020617" fillOpacity="0.86" stroke={meta.accent} strokeWidth="0.9" />
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
   2. REAL COMPETITION TROPHIES (FotMob Primary Medallion + SVG Fallback Geometries)
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
  | 'POR_LP'
  | 'NED_ED'
  | 'BEL_PL'
  | 'TUR_SL'
  | 'SCO_PR'
  | 'SECOND_TIER'
  | 'WORLD_CUP'
  | 'EURO_NATIONS'
  | 'FIFA_CWC'
  | 'DOMESTIC_CUP'
  | 'BALLON_DOR'
  | 'GOLDEN_BOOT';

export function resolveTrophyType(competitionIdOrName: string): TrophyType {
  const id = (competitionIdOrName || '').toUpperCase();
  if (id.includes('UCL') || id.includes('CHAMPIONS LEAGUE') || id.includes('AFC_ACL') || id.includes('CONCACAF')) return 'UEFA_UCL';
  if (id.includes('LIBERTADORES') || id.includes('CONMEBOL')) return 'FIFA_CWC';
  if (id.includes('UEL') || id.includes('EUROPA LEAGUE')) return 'UEFA_UEL';
  if (id.includes('UECL') || id.includes('CONFERENCE LEAGUE')) return 'UEFA_UECL';
  if (id.includes('ENG_CH') || id.includes('ESP_SD') || id.includes('GER_2B') || id.includes('ITA_SB') || id.includes('FRA_L2') || id.includes('CHAMPIONSHIP') || id.includes('HYPERMOTION') || id.includes('2. BUNDESLIGA') || id.includes('SERIE B') || id.includes('LIGUE 2')) {
    return 'SECOND_TIER';
  }
  if (id.includes('ENG_PL') || id.includes('PREMIER LEAGUE')) return 'ENG_PL';
  if (id.includes('ESP_LL') || id.includes('LALIGA')) return 'ESP_LL';
  if (id.includes('GER_BL') || id.includes('BUNDESLIGA')) return 'GER_BL';
  if (id.includes('ITA_SA') || id.includes('SERIE A')) return 'ITA_SA';
  if (id.includes('FRA_L1') || id.includes('LIGUE 1')) return 'FRA_L1';
  if (id.includes('POR_LP') || id.includes('LIGA PORTUGAL')) return 'POR_LP';
  if (id.includes('NED_ED') || id.includes('EREDIVISIE')) return 'NED_ED';
  if (id.includes('BEL_PL') || id.includes('JUPILER') || id.includes('PRO LEAGUE')) return 'BEL_PL';
  if (id.includes('TUR_SL') || id.includes('SUPER LIG') || id.includes('SÜPER LİG')) return 'TUR_SL';
  if (id.includes('SCO_PR') || id.includes('SCOTTISH PREMIERSHIP')) return 'SCO_PR';
  if (id.includes('WORLD CUP') && !id.includes('CLUB')) return 'WORLD_CUP';
  if (id.includes('CWC') || id.includes('CLUB WORLD CUP')) return 'FIFA_CWC';
  if (id.includes('EURO') || id.includes('NATIONS')) return 'EURO_NATIONS';
  if (id.includes('BALLON')) return 'BALLON_DOR';
  if (id.includes('BOOT') || id.includes('SCORER')) return 'GOLDEN_BOOT';
  if (
    id.includes('CUP') ||
    id.includes('_LC') ||
    id.includes('_SC') ||
    id.includes('SHIELD') ||
    id.includes('SUPERCOPA') ||
    id.includes('SUPERCUP') ||
    id.includes('SUPERCOPPA') ||
    id.includes('SUPERTAÇA') ||
    id.includes('POKAL') ||
    id.includes('COPA') ||
    id.includes('COPPA') ||
    id.includes('COUPE') ||
    id.includes('TAÇA') ||
    id.includes('TACA') ||
    id.includes('BEKER') ||
    id.includes('KUPASI')
  ) {
    return 'DOMESTIC_CUP';
  }
  return 'DOMESTIC_CUP';
}

export const TrophyArtwork: React.FC<{
  competitionId?: string;
  trophyType?: TrophyType;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  customLabel?: string;
  showCrestBadge?: boolean;
  onClick?: () => void;
  className?: string;
}> = ({
  competitionId = 'ENG_PL',
  trophyType,
  size = 'md',
  showLabel = false,
  customLabel,
  showCrestBadge = false,
  onClick,
  className = '',
}) => {
  const resolved = trophyType || resolveTrophyType(competitionId);
  const lookupKey =
    customLabel && !COMPETITION_STYLE_MAP[competitionId] ? customLabel : competitionId;
  const { primaryTrophyUrl, mediumTrophyUrl, fallbackTrophyUrl, meta } =
    resolveCompetitionTrophyPhotoUrls(lookupKey);
  const [fallbackStage, setFallbackStage] = useState<'primary' | 'medium' | 'header' | 'svg'>('primary');

  useEffect(() => {
    setFallbackStage('primary');
  }, [primaryTrophyUrl]);

  const dims =
    size === 'xs'
      ? 'w-7 h-7'
      : size === 'sm'
        ? 'w-11 h-11'
        : size === 'lg'
          ? 'w-20 h-20'
          : size === 'xl'
            ? 'w-36 h-36'
            : 'w-14 h-14';

  const uid = `trp-${resolved}-${size}`;
  const activeTrophyPhotoUrl =
    fallbackStage === 'primary'
      ? primaryTrophyUrl
      : fallbackStage === 'medium'
        ? mediumTrophyUrl
        : fallbackStage === 'header'
          ? fallbackTrophyUrl
          : undefined;

  if (activeTrophyPhotoUrl && fallbackStage !== 'svg') {
    const WrapperTag = onClick ? 'button' : 'div';
    return (
      <WrapperTag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={`inline-flex flex-col items-center justify-center shrink-0 select-none group ${
          onClick ? 'cursor-pointer hover:scale-105 transition-transform duration-200' : ''
        } ${className}`}
        title={customLabel || meta.title || `${resolved.replace(/_/g, ' ')} Trophy`}
        data-testid={`trophy-artwork-${resolved}`}
      >
        <div className={`${dims} relative flex items-center justify-center`}>
          {/* Ambient golden spotlight pedestal glow behind transparent physical trophy */}
          <div className="pointer-events-none absolute inset-1 rounded-full bg-amber-400/15 blur-md group-hover:bg-amber-400/30 transition-colors" />
          <img
            src={activeTrophyPhotoUrl}
            alt={customLabel || meta.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              if (
                fallbackStage === 'primary' &&
                mediumTrophyUrl &&
                mediumTrophyUrl !== primaryTrophyUrl
              ) {
                setFallbackStage('medium');
              } else if (
                (fallbackStage === 'primary' || fallbackStage === 'medium') &&
                fallbackTrophyUrl &&
                fallbackTrophyUrl !== activeTrophyPhotoUrl
              ) {
                setFallbackStage('header');
              } else {
                setFallbackStage('svg');
              }
            }}
            className="relative z-10 w-full h-full object-contain drop-shadow-[0_10px_22px_rgba(250,204,21,0.38)] select-none"
          />
          {showCrestBadge && meta.fotmobLogoUrl && (
            <div className="absolute -bottom-1 -right-1 z-20 rounded-full bg-slate-950/90 p-0.5 border border-amber-400/50 shadow">
              <CompetitionBadge competitionId={competitionId} size="xs" />
            </div>
          )}
        </div>
        {showLabel && (
          <span className="mt-1 text-[10px] font-mono text-amber-300 font-semibold truncate max-w-[120px]">
            {customLabel || meta.shortCode || resolved.replace(/_/g, ' ')}
          </span>
        )}
      </WrapperTag>
    );
  }

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
              <circle cx="40" cy="40" r="32" fill="#1d4ed8" fillOpacity="0.14" />
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
              <ellipse cx="40" cy="18" rx="14" ry="3.5" fill="#94a3b8" stroke="#f8fafc" strokeWidth="1.2" />
              <path
                d="M26 18 L28 45 C29 53, 51 53, 52 45 L54 18 Z"
                fill={`url(#${uid}-silver)`}
                stroke="#e2e8f0"
                strokeWidth="1.2"
              />
              <ellipse cx="40" cy="18" rx="11" ry="2" fill={`url(#${uid}-gold)`} fillOpacity="0.7" />
              <path d="M35 51 L33 63 H47 L45 51 Z" fill={`url(#${uid}-silver)`} />
              <rect x="27" y="63" width="26" height="6" rx="2.5" fill="#64748b" stroke="#cbd5e1" strokeWidth="1" />
              <circle cx="40" cy="34" r="5.5" fill="none" stroke="#475569" strokeWidth="1" />
              <text x="40" y="27" textAnchor="middle" fill="#334155" fontSize="3.6" fontWeight="bold" fontFamily="monospace">
                CHAMPIONS
              </text>
            </g>
          )}

          {/* 2. UEFA EUROPA LEAGUE (OCTAGONAL FLARED HANDLELESS COUPE UEFA + YELLOW MARBLE BASE) */}
          {resolved === 'UEFA_UEL' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#ea580c" fillOpacity="0.16" />
              {/* Octagonal flared rim */}
              <polygon
                points="23,15 57,15 50,46 30,46"
                fill={`url(#${uid}-silver)`}
                stroke="#f8fafc"
                strokeWidth="1.2"
              />
              {/* Faceted vertical ridges */}
              <path d="M31 15 L34 46 M40 15 V46 M49 15 L46 46" stroke="#64748b" strokeWidth="1" />
              {/* Sculpted player relief band */}
              <path d="M29 38 H51 L49 46 H31 Z" fill="#94a3b8" stroke="#e2e8f0" strokeWidth="0.8" />
              {/* Warm amber-gold marble octagonal base */}
              <polygon
                points="31,46 49,46 53,65 27,65"
                fill={`url(#${uid}-gold)`}
                stroke="#ea580c"
                strokeWidth="1.2"
              />
              <path d="M30 53 L50 56 M29 60 L51 58" stroke="#b45309" strokeWidth="1.1" />
            </g>
          )}

          {/* 3. UEFA CONFERENCE LEAGUE (TWISTED SILVER PILLARS & EMERALD CORE) */}
          {resolved === 'UEFA_UECL' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#16a34a" fillOpacity="0.16" />
              <ellipse cx="40" cy="15" rx="16" ry="3.5" fill={`url(#${uid}-silver)`} stroke="#4ade80" strokeWidth="1.2" />
              <path
                d="M25 16 C31 28, 33 38, 30 51 H50 C47 38, 49 28, 55 16 Z"
                fill="#064e3b"
                fillOpacity="0.6"
              />
              {/* Spiraling silver ribs */}
              <path
                d="M25 16 C32 30, 34 40, 31 52 M31 16 C37 30, 39 40, 36 52 M40 16 V52 M49 16 C43 30, 41 40, 44 52 M55 16 C48 30, 46 40, 49 52"
                fill="none"
                stroke={`url(#${uid}-silver)`}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <rect x="29" y="52" width="22" height="5" rx="1.5" fill="#16a34a" stroke="#f8fafc" strokeWidth="1" />
              <rect x="26" y="57" width="28" height="8" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
            </g>
          )}

          {/* 4. PREMIER LEAGUE TROPHY (SILVER CUP WITH GOLDEN CROWN & MALACHITE BASE) */}
          {resolved === 'ENG_PL' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#9333ea" fillOpacity="0.14" />
              <path d="M24 24 L15 42 L20 44 L26 28 Z" fill="#581c87" />
              <path d="M56 24 L65 42 L60 44 L54 28 Z" fill="#38bdf8" />
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
              <path
                d="M28 19 L30 11 L35 16 L40 10 L45 16 L50 11 L52 19 Z"
                fill={`url(#${uid}-gold)`}
                stroke="#ca8a04"
                strokeWidth="1"
              />
              <path
                d="M27 19 H53 L49 46 C48 52, 32 52, 31 46 Z"
                fill={`url(#${uid}-silver)`}
                stroke="#f8fafc"
                strokeWidth="1.2"
              />
              <path d="M36 50 L34 59 H46 L44 50 Z" fill={`url(#${uid}-silver)`} />
              <rect x="26" y="59" width="28" height="4.5" rx="1" fill="#059669" stroke={`url(#${uid}-gold)`} strokeWidth="1" />
              <rect x="24" y="63.5" width="32" height="5.5" rx="1.5" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
            </g>
          )}

          {/* 5. LALIGA TROPHY (WIDE SILVER CYLINDRICAL CUP WITH CURVED HANDLES & CORAL ACCENT) */}
          {resolved === 'ESP_LL' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#e11d48" fillOpacity="0.14" />
              <path
                d="M24 20 C14 22, 15 38, 26 40 M56 20 C66 22, 65 38, 54 40"
                fill="none"
                stroke={`url(#${uid}-silver)`}
                strokeWidth="3.8"
                strokeLinecap="round"
              />
              <ellipse cx="40" cy="16" rx="16" ry="3.5" fill="#94a3b8" stroke="#f8fafc" strokeWidth="1.2" />
              <path
                d="M24 16 L27 48 C28 53, 52 53, 53 48 L56 16 Z"
                fill={`url(#${uid}-silver)`}
                stroke="#f8fafc"
                strokeWidth="1.2"
              />
              <rect x="31" y="51" width="18" height="7" rx="1.5" fill="#64748b" />
              <rect x="25" y="58" width="30" height="7" rx="2" fill="#0f172a" stroke="#ff4b44" strokeWidth="1.3" />
            </g>
          )}

          {/* 6. BUNDESLIGA MEISTERSCHALE (ICONIC SILVER & GOLD SHIELD PLATTER) */}
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

          {/* 7. SERIE A SCUDETTO TROPHY (GOLDEN SPIRAL CONE + SODALITE BLUE RING) */}
          {resolved === 'ITA_SA' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#0284c7" fillOpacity="0.14" />
              <ellipse cx="40" cy="16" rx="15" ry="4" fill={`url(#${uid}-gold)`} stroke="#fef08a" strokeWidth="1.2" />
              <path
                d="M25 16 L35 52 H45 L55 16 Z"
                fill={`url(#${uid}-gold)`}
                stroke="#ca8a04"
                strokeWidth="1.2"
              />
              <path d="M28 24 L51 28 M31 34 L48 37 M34 43 L46 45" stroke="#a16207" strokeWidth="1.3" />
              <rect x="32" y="52" width="16" height="5" rx="1.5" fill="#1d4ed8" stroke={`url(#${uid}-silver)`} strokeWidth="1" />
              <polygon points="40,51 43,54.5 40,58 37,54.5" fill="#ffffff" stroke="#ca8a04" strokeWidth="0.6" />
              <path d="M29 57 L26 67 H54 L51 57 Z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
            </g>
          )}

          {/* 8. LIGUE 1 HEXAGOAL (GEOMETRIC GOLDEN HEXAGON CREST ON PEDESTAL) */}
          {resolved === 'FRA_L1' && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#eab308" fillOpacity="0.15" />
              {/* Golden Hexagon Shield */}
              <polygon
                points="40,11 58,21 58,41 40,51 22,41 22,21"
                fill={`url(#${uid}-gold)`}
                stroke="#fef08a"
                strokeWidth="1.5"
              />
              <polygon
                points="40,17 52,24 52,38 40,45 28,38 28,24"
                fill="#0f172a"
                fillOpacity="0.22"
                stroke="#a16207"
                strokeWidth="1.2"
              />
              <circle cx="40" cy="31" r="4.5" fill="#fef08a" />
              {/* Tapered Golden-Silver Stem & Base */}
              <polygon points="34,50 46,50 49,61 31,61" fill={`url(#${uid}-silver)`} stroke="#cbd5e1" strokeWidth="1" />
              <rect x="25" y="61" width="30" height="6" rx="2" fill="#1e293b" stroke={`url(#${uid}-gold)`} strokeWidth="1.2" />
            </g>
          )}

          {/* 9. EREDIVISIE SCHAAL (DUTCH SILVER CHAMPIONSHIP PLATTER ON STAND) */}
          {resolved === 'NED_ED' && (
            <g>
              <circle cx="40" cy="36" r="24" fill={`url(#${uid}-silver)`} stroke="#f8fafc" strokeWidth="2" />
              <circle cx="40" cy="36" r="18" fill="none" stroke="#ea580c" strokeWidth="1.5" />
              <circle cx="40" cy="36" r="11" fill="#1e1b4b" fillOpacity="0.15" stroke="#64748b" strokeWidth="1.2" />
              {/* Crowned Lion Motif */}
              <path d="M34 31 L36 26 L40 29 L44 26 L46 31 Z" fill="#ea580c" />
              <circle cx="40" cy="38" r="4" fill="#ea580c" />
              {/* Stand Pedestal */}
              <polygon points="31,57 49,57 53,66 27,66" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
            </g>
          )}

          {/* 10. LIGA PORTUGAL / BELGIAN PRO LEAGUE / SÜPER LİG / SCOTTISH PREMIERSHIP / SECOND TIER */}
          {(resolved === 'POR_LP' ||
            resolved === 'BEL_PL' ||
            resolved === 'TUR_SL' ||
            resolved === 'SCO_PR' ||
            resolved === 'SECOND_TIER') && (
            <g>
              <circle
                cx="40"
                cy="40"
                r="32"
                fill={
                  resolved === 'POR_LP'
                    ? '#dc2626'
                    : resolved === 'BEL_PL'
                      ? '#eab308'
                      : resolved === 'TUR_SL'
                        ? '#ef4444'
                        : resolved === 'SCO_PR'
                          ? '#2563eb'
                          : '#38bdf8'
                }
                fillOpacity="0.15"
              />
              {/* National Ribbons */}
              <path
                d="M26 22 L17 38 L22 40 L28 26 Z"
                fill={resolved === 'POR_LP' ? '#16a34a' : resolved === 'SCO_PR' ? '#1d4ed8' : '#dc2626'}
              />
              <path
                d="M54 22 L63 38 L58 40 L52 26 Z"
                fill={resolved === 'POR_LP' ? '#dc2626' : resolved === 'SCO_PR' ? '#ffffff' : '#facc15'}
              />
              {/* Sculpted Spiral Cup Body */}
              <path
                d="M27 16 H53 L47 48 C45 54, 35 54, 33 48 Z"
                fill={resolved === 'TUR_SL' ? `url(#${uid}-gold)` : `url(#${uid}-silver)`}
                stroke="#f8fafc"
                strokeWidth="1.2"
              />
              <path
                d="M31 22 L48 27 M32 32 L47 37"
                stroke={resolved === 'POR_LP' || resolved === 'BEL_PL' ? '#ca8a04' : '#64748b'}
                strokeWidth="1.6"
              />
              <rect x="33" y="51" width="14" height="8" rx="1.5" fill={`url(#${uid}-silver)`} />
              <rect x="25" y="59" width="30" height="7" rx="2" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1" />
            </g>
          )}

          {/* 11. FIFA WORLD CUP / CLUB WORLD CUP TROPHY */}
          {(resolved === 'WORLD_CUP' || resolved === 'FIFA_CWC') && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#eab308" fillOpacity="0.16" />
              <circle cx="40" cy="22" r="11" fill={`url(#${uid}-gold)`} stroke="#a16207" strokeWidth="1.2" />
              <path d="M32 19 C36 16, 44 20, 48 18 M31 25 C37 27, 43 23, 49 26" fill="none" stroke="#a16207" strokeWidth="1" />
              <path
                d="M29 24 C31 36, 35 44, 34 55 H46 C45 44, 49 36, 51 24 L45 31 L40 28 L35 31 Z"
                fill={`url(#${uid}-gold)`}
                stroke="#ca8a04"
                strokeWidth="1.1"
              />
              <rect x="30" y="55" width="20" height="3" rx="1" fill="#10b981" />
              <rect x="29" y="58" width="22" height="2.5" rx="1" fill={`url(#${uid}-gold)`} />
              <rect x="30" y="60.5" width="20" height="3" rx="1" fill="#10b981" />
              <rect x="27" y="63.5" width="26" height="5" rx="2" fill={`url(#${uid}-gold)`} stroke="#a16207" strokeWidth="1" />
            </g>
          )}

          {/* 12. EURO NATIONS (HENRI DELAUNAY SILVER AMPHORA) & DOMESTIC KNOCKOUT CUPS */}
          {(resolved === 'EURO_NATIONS' || resolved === 'DOMESTIC_CUP') && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#38bdf8" fillOpacity="0.14" />
              {/* Twin Handles */}
              <path
                d="M26 22 C15 20, 16 39, 29 42 M54 22 C65 20, 64 39, 51 42"
                fill="none"
                stroke={`url(#${uid}-silver)`}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              {/* Cup Lid & Finial */}
              <path d="M26 18 Q40 11 54 18 Z" fill={`url(#${uid}-silver)`} stroke="#e2e8f0" strokeWidth="1" />
              <circle cx="40" cy="12" r="2.3" fill={`url(#${uid}-gold)`} />
              {/* Classic Knockout Chalice */}
              <path
                d="M26 18 H54 L49 46 C47 52, 33 52, 31 46 Z"
                fill={`url(#${uid}-silver)`}
                stroke="#f8fafc"
                strokeWidth="1.2"
              />
              <path d="M29 25 H51" stroke="#eab308" strokeWidth="2" />
              <path d="M35 49 L32 60 H48 L45 49 Z" fill={`url(#${uid}-silver)`} />
              <rect x="26" y="60" width="28" height="7" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
            </g>
          )}

          {/* 13. BALLON D'OR & GOLDEN BOOT */}
          {(resolved === 'BALLON_DOR' || resolved === 'GOLDEN_BOOT') && (
            <g>
              <circle cx="40" cy="40" r="32" fill="#facc15" fillOpacity="0.18" />
              <polygon
                points="24,66 28,48 36,45 44,45 52,48 56,66"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="1.2"
              />
              <polygon points="28,66 34,49 46,49 52,66" fill="#0f172a" />
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

// =============================================================================
// STAGE 12: UNIVERSAL NATIONALITY FLAG SYSTEM (115+ FIFA / IOC CODES -> FLAGCDN)
// =============================================================================

export interface NationalityFlagMeta {
  iso: string;
  en: string;
  th: string;
}

export const FIFA_TO_FLAGCDN_ISO: Record<string, NationalityFlagMeta> = {
  // UK Home Nations (Distinct authentic flags!)
  ENG: { iso: 'gb-eng', en: 'England', th: 'อังกฤษ' },
  SCO: { iso: 'gb-sct', en: 'Scotland', th: 'สกอตแลนด์' },
  WAL: { iso: 'gb-wls', en: 'Wales', th: 'เวลส์' },
  NIR: { iso: 'gb-nir', en: 'Northern Ireland', th: 'ไอร์แลนด์เหนือ' },
  GBR: { iso: 'gb', en: 'United Kingdom', th: 'สหราชอาณาจักร' },

  // Western, Southern, Northern & Eastern Europe
  ESP: { iso: 'es', en: 'Spain', th: 'สเปน' },
  GER: { iso: 'de', en: 'Germany', th: 'เยอรมนี' },
  ITA: { iso: 'it', en: 'Italy', th: 'อิตาลี' },
  FRA: { iso: 'fr', en: 'France', th: 'ฝรั่งเศส' },
  POR: { iso: 'pt', en: 'Portugal', th: 'โปรตุเกส' },
  NED: { iso: 'nl', en: 'Netherlands', th: 'เนเธอร์แลนด์' },
  BEL: { iso: 'be', en: 'Belgium', th: 'เบลเยียม' },
  TUR: { iso: 'tr', en: 'Turkey', th: 'ตุรกี' },
  AUT: { iso: 'at', en: 'Austria', th: 'ออสเตรีย' },
  SUI: { iso: 'ch', en: 'Switzerland', th: 'สวิตเซอร์แลนด์' },
  GRE: { iso: 'gr', en: 'Greece', th: 'กรีซ' },
  CRO: { iso: 'hr', en: 'Croatia', th: 'โครเอเชีย' },
  SRB: { iso: 'rs', en: 'Serbia', th: 'เซอร์เบีย' },
  NOR: { iso: 'no', en: 'Norway', th: 'นอร์เวย์' },
  SWE: { iso: 'se', en: 'Sweden', th: 'สวีเดน' },
  DEN: { iso: 'dk', en: 'Denmark', th: 'เดนมาร์ก' },
  FIN: { iso: 'fi', en: 'Finland', th: 'ฟินแลนด์' },
  ISL: { iso: 'is', en: 'Iceland', th: 'ไอซ์แลนด์' },
  IRL: { iso: 'ie', en: 'Republic of Ireland', th: 'ไอร์แลนด์' },
  POL: { iso: 'pl', en: 'Poland', th: 'โปแลนด์' },
  UKR: { iso: 'ua', en: 'Ukraine', th: 'ยูเครน' },
  CZE: { iso: 'cz', en: 'Czech Republic', th: 'เช็ก' },
  SVK: { iso: 'sk', en: 'Slovakia', th: 'สโลวาเกีย' },
  HUN: { iso: 'hu', en: 'Hungary', th: 'ฮังการี' },
  ROU: { iso: 'ro', en: 'Romania', th: 'โรมาเนีย' },
  SVN: { iso: 'si', en: 'Slovenia', th: 'สโลวีเนีย' },
  SLO: { iso: 'si', en: 'Slovenia', th: 'สโลวีเนีย' },
  BIH: { iso: 'ba', en: 'Bosnia & Herzegovina', th: 'บอสเนียฯ' },
  MNE: { iso: 'me', en: 'Montenegro', th: 'มอนเตเนโกร' },
  ALB: { iso: 'al', en: 'Albania', th: 'แอลเบเนีย' },
  MKD: { iso: 'mk', en: 'North Macedonia', th: 'นอร์ทมาซิโดเนีย' },
  GEO: { iso: 'ge', en: 'Georgia', th: 'จอร์เจีย' },
  ARM: { iso: 'am', en: 'Armenia', th: 'อาร์เมเนีย' },
  ISR: { iso: 'il', en: 'Israel', th: 'อิสราเอล' },
  KOS: { iso: 'xk', en: 'Kosovo', th: 'โคโซโว' },
  BUL: { iso: 'bg', en: 'Bulgaria', th: 'บัลแกเรีย' },
  LUX: { iso: 'lu', en: 'Luxembourg', th: 'ลักเซมเบิร์ก' },
  CYP: { iso: 'cy', en: 'Cyprus', th: 'ไซปรัส' },
  MLT: { iso: 'mt', en: 'Malta', th: 'มอลตา' },
  EST: { iso: 'ee', en: 'Estonia', th: 'เอสโตเนีย' },
  LVA: { iso: 'lv', en: 'Latvia', th: 'ลัตเวีย' },
  LTU: { iso: 'lt', en: 'Lithuania', th: 'ลิทัวเนีย' },
  BLR: { iso: 'by', en: 'Belarus', th: 'เบลารุส' },
  MDA: { iso: 'md', en: 'Moldova', th: 'มอลโดวา' },
  AZE: { iso: 'az', en: 'Azerbaijan', th: 'อาเซอร์ไบจาน' },
  KAZ: { iso: 'kz', en: 'Kazakhstan', th: 'คาซัคสถาน' },
  RUS: { iso: 'ru', en: 'Russia', th: 'รัสเซีย' },
  FRO: { iso: 'fo', en: 'Faroe Islands', th: 'หมู่เกาะแฟโร' },
  EUR: { iso: 'eu', en: 'Europe', th: 'ยุโรป' },

  // South & North America
  BRA: { iso: 'br', en: 'Brazil', th: 'บราซิล' },
  ARG: { iso: 'ar', en: 'Argentina', th: 'อาร์เจนตินา' },
  URU: { iso: 'uy', en: 'Uruguay', th: 'อุรุกวัย' },
  COL: { iso: 'co', en: 'Colombia', th: 'โคลอมเบีย' },
  ECU: { iso: 'ec', en: 'Ecuador', th: 'เอกวาดอร์' },
  CHI: { iso: 'cl', en: 'Chile', th: 'ชิลี' },
  PAR: { iso: 'py', en: 'Paraguay', th: 'ปารากวัย' },
  PER: { iso: 'pe', en: 'Peru', th: 'เปรู' },
  VEN: { iso: 've', en: 'Venezuela', th: 'เวเนซุเอลา' },
  BOL: { iso: 'bo', en: 'Bolivia', th: 'โบลิเวีย' },
  USA: { iso: 'us', en: 'United States', th: 'สหรัฐอเมริกา' },
  CAN: { iso: 'ca', en: 'Canada', th: 'แคนาดา' },
  MEX: { iso: 'mx', en: 'Mexico', th: 'เม็กซิโก' },
  CRC: { iso: 'cr', en: 'Costa Rica', th: 'คอสตาริกา' },
  JAM: { iso: 'jm', en: 'Jamaica', th: 'จาเมกา' },
  PAN: { iso: 'pa', en: 'Panama', th: 'ปานามา' },
  HON: { iso: 'hn', en: 'Honduras', th: 'ฮอนดูรัส' },
  TRI: { iso: 'tt', en: 'Trinidad & Tobago', th: 'ตรินิแดดและโตเบโก' },
  SUR: { iso: 'sr', en: 'Suriname', th: 'ซูรินาม' },
  CUR: { iso: 'cw', en: 'Curaçao', th: 'คูราเซา' },
  HAI: { iso: 'ht', en: 'Haiti', th: 'เฮติ' },
  DOM: { iso: 'do', en: 'Dominican Republic', th: 'โดมินิกัน' },

  // Africa
  MAR: { iso: 'ma', en: 'Morocco', th: 'โมร็อกโก' },
  SEN: { iso: 'sn', en: 'Senegal', th: 'เซเนกัล' },
  EGY: { iso: 'eg', en: 'Egypt', th: 'อียิปต์' },
  NGA: { iso: 'ng', en: 'Nigeria', th: 'ไนจีเรีย' },
  GHA: { iso: 'gh', en: 'Ghana', th: 'กานา' },
  CIV: { iso: 'ci', en: 'Ivory Coast', th: 'โกตดิวัวร์' },
  CMR: { iso: 'cm', en: 'Cameroon', th: 'แคเมอรูน' },
  ALG: { iso: 'dz', en: 'Algeria', th: 'แอลจีเรีย' },
  TUN: { iso: 'tn', en: 'Tunisia', th: 'ตูนิเซีย' },
  MLI: { iso: 'ml', en: 'Mali', th: 'มาลี' },
  GUI: { iso: 'gn', en: 'Guinea', th: 'กินี' },
  GAB: { iso: 'ga', en: 'Gabon', th: 'กาบอง' },
  BFA: { iso: 'bf', en: 'Burkina Faso', th: 'บูร์กินาฟาโซ' },
  COD: { iso: 'cd', en: 'DR Congo', th: 'ดีอาร์ คองโก' },
  CGO: { iso: 'cg', en: 'Congo', th: 'คองโก' },
  ANG: { iso: 'ao', en: 'Angola', th: 'แองโกลา' },
  MOZ: { iso: 'mz', en: 'Mozambique', th: 'โมซัมบิก' },
  ZAM: { iso: 'zm', en: 'Zambia', th: 'แซมเบีย' },
  ZIM: { iso: 'zw', en: 'Zimbabwe', th: 'ซิมบับเว' },
  RSA: { iso: 'za', en: 'South Africa', th: 'แอฟริกาใต้' },
  CPV: { iso: 'cv', en: 'Cape Verde', th: 'เคปเวิร์ด' },
  GAM: { iso: 'gm', en: 'Gambia', th: 'แกมเบีย' },
  GNB: { iso: 'gw', en: 'Guinea-Bissau', th: 'กินี-บิสเซา' },
  EQG: { iso: 'gq', en: 'Equatorial Guinea', th: 'อิเควทอเรียลกินี' },
  BEN: { iso: 'bj', en: 'Benin', th: 'เบนิน' },
  TOG: { iso: 'tg', en: 'Togo', th: 'โตโก' },
  COM: { iso: 'km', en: 'Comoros', th: 'คอโมโรส' },
  KEN: { iso: 'ke', en: 'Kenya', th: 'เคนยา' },
  TAN: { iso: 'tz', en: 'Tanzania', th: 'แทนซาเนีย' },
  UGA: { iso: 'ug', en: 'Uganda', th: 'ยูกันดา' },
  LBY: { iso: 'ly', en: 'Libya', th: 'ลิเบีย' },
  MAD: { iso: 'mg', en: 'Madagascar', th: 'มาดากัสการ์' },

  // Asia & Oceania
  JPN: { iso: 'jp', en: 'Japan', th: 'ญี่ปุ่น' },
  KOR: { iso: 'kr', en: 'South Korea', th: 'เกาหลีใต้' },
  KSA: { iso: 'sa', en: 'Saudi Arabia', th: 'ซาอุดีอาระเบีย' },
  IRN: { iso: 'ir', en: 'Iran', th: 'อิหร่าน' },
  IRQ: { iso: 'iq', en: 'Iraq', th: 'อิรัก' },
  QAT: { iso: 'qa', en: 'Qatar', th: 'กาตาร์' },
  UAE: { iso: 'ae', en: 'United Arab Emirates', th: 'สหรัฐอาหรับเอมิเรตส์' },
  UZB: { iso: 'uz', en: 'Uzbekistan', th: 'อุซเบกิสถาน' },
  AUS: { iso: 'au', en: 'Australia', th: 'ออสเตรเลีย' },
  NZL: { iso: 'nz', en: 'New Zealand', th: 'นิวซีแลนด์' },
  THA: { iso: 'th', en: 'Thailand', th: 'ไทย' },
  CHN: { iso: 'cn', en: 'China', th: 'จีน' },
  IDN: { iso: 'id', en: 'Indonesia', th: 'อินโดนีเซีย' },
  VIE: { iso: 'vn', en: 'Vietnam', th: 'เวียดนาม' },
  MAS: { iso: 'my', en: 'Malaysia', th: 'มาเลเซีย' },
  JOR: { iso: 'jo', en: 'Jordan', th: 'จอร์แดน' },
  SYR: { iso: 'sy', en: 'Syria', th: 'ซีเรีย' },
  OMA: { iso: 'om', en: 'Oman', th: 'โอมาน' },
  BHR: { iso: 'bh', en: 'Bahrain', th: 'บาห์เรน' },
  PHI: { iso: 'ph', en: 'Philippines', th: 'ฟิลิปปินส์' },
  IND: { iso: 'in', en: 'India', th: 'อินเดีย' },
};

const COUNTRY_NAME_TO_FIFA_CODE: Record<string, string> = {};
for (const [fifaCode, meta] of Object.entries(FIFA_TO_FLAGCDN_ISO)) {
  COUNTRY_NAME_TO_FIFA_CODE[meta.en.toLowerCase()] = fifaCode;
  COUNTRY_NAME_TO_FIFA_CODE[meta.th.toLowerCase()] = fifaCode;
}
// Extra common country name aliases
COUNTRY_NAME_TO_FIFA_CODE['england'] = 'ENG';
COUNTRY_NAME_TO_FIFA_CODE['spain'] = 'ESP';
COUNTRY_NAME_TO_FIFA_CODE['germany'] = 'GER';
COUNTRY_NAME_TO_FIFA_CODE['italy'] = 'ITA';
COUNTRY_NAME_TO_FIFA_CODE['france'] = 'FRA';
COUNTRY_NAME_TO_FIFA_CODE['portugal'] = 'POR';
COUNTRY_NAME_TO_FIFA_CODE['netherlands'] = 'NED';
COUNTRY_NAME_TO_FIFA_CODE['holland'] = 'NED';
COUNTRY_NAME_TO_FIFA_CODE['brazil'] = 'BRA';
COUNTRY_NAME_TO_FIFA_CODE['argentina'] = 'ARG';
COUNTRY_NAME_TO_FIFA_CODE['thailand'] = 'THA';
COUNTRY_NAME_TO_FIFA_CODE['japan'] = 'JPN';
COUNTRY_NAME_TO_FIFA_CODE['south korea'] = 'KOR';
COUNTRY_NAME_TO_FIFA_CODE['korea republic'] = 'KOR';
COUNTRY_NAME_TO_FIFA_CODE['usa'] = 'USA';
COUNTRY_NAME_TO_FIFA_CODE['united states'] = 'USA';
COUNTRY_NAME_TO_FIFA_CODE['ireland'] = 'IRL';
COUNTRY_NAME_TO_FIFA_CODE['ivory coast'] = 'CIV';
COUNTRY_NAME_TO_FIFA_CODE["cote d'ivoire"] = 'CIV';
COUNTRY_NAME_TO_FIFA_CODE['czechia'] = 'CZE';
COUNTRY_NAME_TO_FIFA_CODE['türkiye'] = 'TUR';
COUNTRY_NAME_TO_FIFA_CODE['turkiye'] = 'TUR';
COUNTRY_NAME_TO_FIFA_CODE['bosnia'] = 'BIH';
COUNTRY_NAME_TO_FIFA_CODE['dr congo'] = 'COD';

export function resolveNationalityFlagInfo(codeOrName?: string | null): {
  code: string;
  iso: string | null;
  pngUrl: string | null;
  svgUrl: string | null;
  countryNameEn: string;
  countryNameTh: string;
} {
  const raw = (codeOrName || '').trim();
  if (!raw) {
    return { code: 'INT', iso: null, pngUrl: null, svgUrl: null, countryNameEn: 'International', countryNameTh: 'นานาชาติ' };
  }
  const upper = raw.toUpperCase();
  const mappedKey = FIFA_TO_FLAGCDN_ISO[upper]
    ? upper
    : COUNTRY_NAME_TO_FIFA_CODE[raw.toLowerCase()];

  if (mappedKey && FIFA_TO_FLAGCDN_ISO[mappedKey]) {
    const meta = FIFA_TO_FLAGCDN_ISO[mappedKey];
    return {
      code: mappedKey,
      iso: meta.iso,
      pngUrl: `https://flagcdn.com/w40/${meta.iso}.png`,
      svgUrl: `https://flagcdn.com/${meta.iso}.svg`,
      countryNameEn: meta.en,
      countryNameTh: meta.th,
    };
  }
  return {
    code: upper.slice(0, 3),
    iso: null,
    pngUrl: null,
    svgUrl: null,
    countryNameEn: raw,
    countryNameTh: raw,
  };
}

export const NationalityFlag: React.FC<{
  code: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showCode?: boolean;
  showCountryName?: boolean;
  lang?: 'en' | 'th';
  className?: string;
}> = React.memo(
  ({
    code,
    size = 'sm',
    showCode = false,
    showCountryName = false,
    lang = 'en',
    className = '',
  }) => {
    const info = resolveNationalityFlagInfo(code);
    const [stage, setStage] = useState<'png' | 'svg' | 'fallback'>(
      info.pngUrl ? 'png' : 'fallback'
    );

    useEffect(() => {
      setStage(info.pngUrl ? 'png' : 'fallback');
    }, [info.pngUrl]);

    const dims = {
      xs: { w: 16, h: 12, cls: 'w-4 h-3 rounded-[2px]' },
      sm: { w: 20, h: 15, cls: 'w-5 h-[15px] rounded-[2px]' },
      md: { w: 24, h: 18, cls: 'w-6 h-[18px] rounded-[3px]' },
      lg: { w: 32, h: 24, cls: 'w-8 h-6 rounded' },
    }[size];

    const activeSrc =
      stage === 'png' ? info.pngUrl : stage === 'svg' ? info.svgUrl : null;
    const displayName = lang === 'th' ? info.countryNameTh : info.countryNameEn;

    return (
      <span
        className={`inline-flex items-center gap-1.5 shrink-0 align-middle ${className}`}
        title={`${info.countryNameEn} (${info.code})`}
        data-testid={`nat-flag-${info.code}`}
      >
        {activeSrc ? (
          <img
            src={activeSrc}
            alt={info.countryNameEn}
            width={dims.w}
            height={dims.h}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setStage((prev) => (prev === 'png' ? 'svg' : 'fallback'))}
            className={`${dims.cls} object-cover shrink-0 border border-white/15 shadow-sm select-none`}
          />
        ) : (
          <span
            className={`${dims.cls} inline-flex items-center justify-center bg-slate-800 border border-slate-600 text-[8px] font-mono font-bold text-slate-200 select-none`}
          >
            {info.code.slice(0, 3)}
          </span>
        )}
        {showCode && (
          <span className="font-mono text-[10px] text-slate-300 font-semibold leading-none">
            {info.code}
          </span>
        )}
        {showCountryName && (
          <span className="text-xs text-slate-200 leading-none truncate">
            {displayName}
          </span>
        )}
      </span>
    );
  }
);


