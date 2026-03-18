
import * as admin from "firebase-admin";
// Note initilaise app must be called before exporting other functions
admin.initializeApp(); 

export { seriesChanged, seriesCreated } from "./results/results";
export { createNewTenant } from "./sys-admin/club";
export { assignRole } from "./sys-admin/roles";
export { ensureUserData } from "./user/user";
