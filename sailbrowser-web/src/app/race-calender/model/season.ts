export type SeasonStatus = 'current' | 'archived';

export interface Season {
  id: string;
  name: string;
  status: SeasonStatus;
}