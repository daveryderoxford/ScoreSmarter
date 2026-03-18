import { Boat } from 'app/boats';

export interface UserData {
  key: string;  // Matches with the users Firebase reference
  email: string;
  firstname: string;
  surname: string;
  boats: Boat[];
  role?: string;
}