
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
   logoUrl?: string;
}