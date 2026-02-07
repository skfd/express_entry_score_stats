export interface DrawRound {
  number: number;
  date: string; // ISO date string YYYY-MM-DD
  roundType: string;
  invitationsIssued: number;
  crsScore: number;
}

export interface DrawData {
  fetchedAt: string;
  source: string;
  rounds: DrawRound[];
}
