import * as admin from "firebase-admin";
import "./global-function-options.js";

// Note initilaise app must be called before exporting other functions
admin.initializeApp();

export { seriesChanged, seriesCreated } from "./results/results.js";
export { parseResultsSheet } from "./scoring-sheet-scanner/scoring-sheet-scanner.js";
export { createNewTenant } from "./sys-admin/club.js";
export { assignRole } from "./sys-admin/roles.js";
export { ensureUserData } from "./user/user.js";

