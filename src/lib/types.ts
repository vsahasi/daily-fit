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
