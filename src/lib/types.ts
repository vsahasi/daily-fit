export type ItemCategory = "top" | "bottom" | "outer" | "shoes" | "accessory";

export type StyleProfile = {
  summary: string;
  palette: string[];
  silhouettes: string[];
  do: string[];
  dont: string[];
  formality: string;
};

export type Weather = {
  date: string;
  tempMin: number;
  tempMax: number;
  precipProb: number;
  code: number;
  summary: string;
  locationLabel: string;
  /** Feels-like high and low for the day, wind and humidity included. Missing on looks stored before these were read. */
  feelsMax?: number;
  feelsMin?: number;
  /** Strongest wind of the day, mph. */
  windMax?: number;
  /** Feels-like high and low across the hours a person is actually out, 8am to 8pm. */
  outHigh?: number;
  outLow?: number;
  /** Feels-like at 9am, the walk-out-the-door number. */
  morning?: number;
  /** The day read hour by hour for the hours a person is out. Missing on looks stored before it was read. */
  feel?: DayFeel;
};

/**
 * A day as it is felt between 8am and 8pm. Air temperature picks the band; the hourly
 * effective temperature (air, less wind, plus sun, less fog) decides whether a layer is
 * needed and whether it can come off by ten.
 */
export type DayFeel = {
  /** Highest and lowest air temperature over the hours out. */
  high: number;
  low: number;
  /** Lowest effective temperature over the hours out. */
  lowEff: number;
  /** Air temperature at 8am. */
  dawn: number;
  /** high minus the 8am air temperature. */
  swing: number;
  /** Hours out with an effective temperature under 60. */
  coolHours: number;
  /** Effective temperature at 7pm or 8pm, whichever is lower. */
  eveningEff: number;
  /** Strongest wind over the hours out, mph. */
  windMax: number;
  /** Sunshine as a share of daylight, 0 to 1. */
  sunFrac: number;
  /** Highest chance of rain over the hours out, 0 to 100. */
  popOut: number;
  /** Hours out with rain or drizzle falling. */
  precipHours: number;
  drizzle: boolean;
  rain: boolean;
  heavyRain: boolean;
  fog: boolean;
  fogPastNoon: boolean;
};

export type GarmentProfile = {
  fit: string;
  silhouette: string;
  layerRole: string;
  colorFamilies: string[];
  pairsWith: string[];
  avoidWith: string[];
  occasions: string[];
  stretch: boolean;
  patternScale: "none" | "small" | "large";
};

export type CatalogedItem = {
  name: string;
  category: ItemCategory;
  subcategory: string;
  colors: string[];
  material: string;
  pattern: string;
  formality: number;
  warmth: number;
  rainOk: boolean;
  notes: string;
  fit: string;
  silhouette: string;
  layerRole: string;
  colorFamilies: string[];
  pairsWith: string[];
  avoidWith: string[];
  occasions: string[];
  stretch: boolean;
  patternScale: "none" | "small" | "large";
  bbox: [number, number, number, number];
  rotation: number;
};
