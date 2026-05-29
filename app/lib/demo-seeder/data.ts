/**
 * Static demo-seeder data tables. Pure constants only — no logic.
 *
 * Splitting the names/cities/models out keeps the orchestrator focused on
 * statement assembly and makes it trivial to extend the demo with new
 * jurisdictions or vehicle stock.
 */

export const FIRST_NAMES = [
  "Alex", "Aaliyah", "Beck", "Bea", "Casey", "Carmen", "Dani", "Diego",
  "Emery", "Esme", "Finley", "Faith", "Gabriel", "Greta", "Harper",
  "Hassan", "Indigo", "Imani", "Jordan", "Joaquin", "Kai", "Keira",
  "Logan", "Luna", "Marlow", "Marisol", "Nico", "Nadia", "Oakley",
  "Olamide", "Parker", "Priya", "Quinn", "Quintessa", "River",
  "Reyna", "Sage", "Soren", "Tatum", "Tariq", "Umi", "Uma", "Vesper",
  "Vihaan", "Wren", "Willa", "Xander", "Yara", "Zion", "Zara",
];

export const LAST_NAMES = [
  "Aguilar", "Brennan", "Choi", "Davis", "Espinoza", "Foster", "Greer",
  "Hatcher", "Iyer", "Jankowski", "Khan", "Larsen", "Mendoza", "Nakamura",
  "O'Donnell", "Pham", "Quesada", "Reyes", "Singh", "Thatcher",
  "Underwood", "Vasquez", "Whitlock", "Xiong", "Yoshida", "Ziegler",
];

export const SCHOOL_NAMES = [
  "Sunrise", "Northbound", "Lakeshore", "Cardinal", "Riverside",
  "Compass", "Highway 12", "Trailhead", "Cedar Park", "Pioneer",
];

export const CAR_MODELS: ReadonlyArray<readonly [string, string]> = [
  ["Honda", "Civic"], ["Toyota", "Corolla"], ["Hyundai", "Elantra"],
  ["Kia", "Forte"], ["Nissan", "Sentra"], ["Mazda", "3"],
  ["Subaru", "Impreza"], ["Chevrolet", "Malibu"],
];

export const PROGRAM_FOCI = [
  "Highway merging and lane changes",
  "Parallel parking — bring the cones",
  "Adverse-weather basics",
  "Defensive driving + scanning",
  "Road test rehearsal — actual exam route",
  "Backing & 3-point turns",
  "Suburban arterial speeds",
  "Night driving introduction",
];

export const STATE_CITIES: Record<string, { city: string; postal: string; zone: string }> = {
  MN: { city: "St. Paul", postal: "55101", zone: "America/Chicago" },
  TX: { city: "Austin", postal: "78701", zone: "America/Chicago" },
  CA: { city: "San Diego", postal: "92101", zone: "America/Los_Angeles" },
  FL: { city: "Orlando", postal: "32801", zone: "America/New_York" },
  NY: { city: "Albany", postal: "12207", zone: "America/New_York" },
  OH: { city: "Columbus", postal: "43215", zone: "America/New_York" },
  IL: { city: "Chicago", postal: "60601", zone: "America/Chicago" },
  WA: { city: "Seattle", postal: "98101", zone: "America/Los_Angeles" },
  AZ: { city: "Phoenix", postal: "85003", zone: "America/Phoenix" },
  CO: { city: "Denver", postal: "80202", zone: "America/Denver" },
  NC: { city: "Raleigh", postal: "27601", zone: "America/New_York" },
  GA: { city: "Atlanta", postal: "30303", zone: "America/New_York" },
};
