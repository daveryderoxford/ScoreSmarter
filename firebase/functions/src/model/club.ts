
export interface Club {
   id: string;
   name: string;
   shortName?: string;
   contactEmail: string;
   contactName: string;
   fleets: [];
   classes: [];
   seasons: [];
   logoUrl?: string;
}