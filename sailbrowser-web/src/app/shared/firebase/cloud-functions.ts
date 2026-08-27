import type { FirebaseApp } from '@angular/fire/app';
import { getApp } from '@angular/fire/app';
import type { Functions, HttpsCallableOptions } from 'firebase/functions';
import { environment } from '../../../environments/environment';

const FUNCTIONS_REGION = 'europe-west1';

let emulatorConnected = false;

/**
 * Lazy-loads the Cloud Functions SDK (keeps it out of the initial bundle)
 * and returns a region-scoped instance. Connects the emulator once when configured.
 */
export async function getCloudFunctions(app?: FirebaseApp): Promise<Functions> {
  const { connectFunctionsEmulator, getFunctions } = await import('firebase/functions');
  const functions = getFunctions(app ?? getApp(), FUNCTIONS_REGION);
  if (environment.useEmulators && !emulatorConnected) {
    try {
      connectFunctionsEmulator(functions, 'localhost', 5001);
      emulatorConnected = true;
    } catch {
      /* already configured */
    }
  }
  return functions;
}

/** Convenience: lazy Functions + {@link httpsCallable}. */
export async function cloudCallable<RequestData = unknown, ResponseData = unknown>(
  name: string,
  options?: HttpsCallableOptions,
  app?: FirebaseApp,
) {
  const { httpsCallable } = await import('firebase/functions');
  const functions = await getCloudFunctions(app);
  return httpsCallable<RequestData, ResponseData>(functions, name, options);
}
