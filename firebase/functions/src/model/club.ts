
export interface Club {
   id: string;
   name: string;
   shortName?: string;
   contactEmail: string;
   contactName: string;
   latitude?: number;
   longitude?: number;
   fleets: [];
   classes: [];
   seasons: [];
   /** Firebase Storage object path (e.g. clubs/{clubId}/club-logo.jpg). */
   logoUrl?: string;
}