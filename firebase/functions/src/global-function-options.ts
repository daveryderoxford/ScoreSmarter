import { setGlobalOptions } from "firebase-functions/v2";

/** Default region for all v2 HTTPS and event triggers in this package. */
setGlobalOptions({ region: "europe-west1" });
