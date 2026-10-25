import { setGlobalOptions } from "firebase-functions/v2";

/**
 * Defaults for all v2 functions in this package: europe-west1, and callable functions
 * reject requests without a valid App Check token (event and scheduled triggers are
 * unaffected). Endpoints meant to be called by other servers must set
 * `enforceAppCheck: false` and authenticate their callers another way.
 */
setGlobalOptions({ region: "europe-west1", enforceAppCheck: true });
