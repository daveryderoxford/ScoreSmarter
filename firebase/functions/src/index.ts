import "./global-function-options.js";
import { getApps, initializeApp } from "firebase-admin/app";  // Need to explicitly reference app for ESM 

// Note initilaise app must be called before exporting other functions
// The eumlator may initilaise Firebase before this point so
// We check if it has already been initliased. 
if (getApps().length === 0) {
   const app = initializeApp();
   console.log('Initialized Firebase app: ' + app.name);
}

export { seriesChanged, seriesCreated } from "./results/results.js";
export { parseResultsSheet } from "./scoring-sheet-scanner/scoring-sheet-scanner.js";
export { createNewTenant } from "./sys-admin/club.js";
export { assignRole } from "./sys-admin/roles.js";
export { ensureUserData } from "./user/user.js";
