export interface Star {
  id: number;
  hip?: number | null;
  constellation?: string;
  name: string;
  latinName: string;
  /** Equatorial J2000 coordinates, in degrees. */
  ra: number;
  dec: number;
  magnitude: number;
  colorIndex: number | null;
  distanceLy: number | null;
  spectralType: string;
  luminositySolar: number | null;
  temperatureK: number | null;
  radiusSolar: number | null;
  massSolar: number | null;
  rotationKmS: number | null;
  description: string;
  sourceUrls: string[];
}

export interface Constellation {
  id: string;
  name: string;
  latinName: string;
  ra: number;
  dec: number;
  area: number;
  rank: number;
  season: "spring" | "summer" | "autumn" | "winter" | "south";
  zodiac: boolean;
  description: string;
  lines: [number, number][][];
  sourceUrls: string[];
}

export interface SkyView { ra: number; dec: number; fov: number }
export interface SkyObserver { latitude: number; longitude: number; date: string }
export interface SkyLayers {
  lines: boolean;
  labels: boolean;
  grid: boolean;
  milkyWay: boolean;
  horizon: boolean;
}
