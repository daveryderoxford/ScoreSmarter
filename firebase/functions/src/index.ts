
import * as admin from "firebase-admin";
// Note initilaise app must be called before exporting other functions
admin.initializeApp(); 

export {createUser, deleteUser} from "./user/user";
export {seriesChanged, seriesCreated}  from "./results/results";
export {assignRole, joinClub} from "./sys-admin/roles";
export {createNewTenant} from "./sys-admin/club";
