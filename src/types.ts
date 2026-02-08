export interface ScoreDistribution {
  range601_1200: number;
  range501_600: number;
  range491_500: number;
  range481_490: number;
  range471_480: number;
  range461_470: number;
  range451_460: number;
  range441_450: number;
  range431_440: number;
  range421_430: number;
  range411_420: number;
  range401_410: number;
  range351_400: number;
  range301_350: number;
  range0_300: number;
  total: number;
  asOfDate: string;
}

export interface DrawRound {
  number: number;
  date: string; // ISO date string YYYY-MM-DD
  roundType: string;
  invitationsIssued: number;
  crsScore: number;
  distribution?: ScoreDistribution;
}

export interface DrawData {
  fetchedAt: string;
  source: string;
  rounds: DrawRound[];
}
