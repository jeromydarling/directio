export type PlaceKind = "state_testing" | "driving_school" | "dmv_office";

export type PlaceRow = {
  id: string;
  kind: string;
  name: string;
  jurisdiction: string;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  distanceMiles?: number;
};
