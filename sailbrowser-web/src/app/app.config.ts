import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  provideFirestore
} from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { APP_ROUTES } from './app.routes';
import { ClubTenant } from './club-tenant/services/club-tenant';
import { firebaseConfig } from './firebase-config';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideServiceWorker } from '@angular/service-worker';

if (isDevMode()) {
  (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.log('AppCheck configured in debug mode');
}

function browserLocaleId(): string {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-GB';
}

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useFactory: browserLocaleId },
    provideAppInitializer(() => inject(ClubTenant).initialize()),
    provideZonelessChangeDetection(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      return auth;
    }),
    provideFunctions(() => getFunctions(getApp(), "europe-west1")),
    provideFirestore(() => {
      let firestore = getFirestore();
      try {
        firestore = initializeFirestore(getApp(), {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch (err) {
        // Fallback for unsupported environments or repeated initialization.
        console.warn('Firestore persistent cache unavailable, using default settings.', err);
      }
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8080);
      }
      return firestore;
    }),
    /* provideAppCheck(() =>
      initializeAppCheck(getApp(), {
        provider: new ReCaptchaEnterpriseProvider('6LfC1dUrAAAAAH6_S3uOuk--gDUsbLivZ4lDEgH0'), isTokenAutoRefreshEnabled: true
      })), */
    provideRouter(APP_ROUTES,
      withComponentInputBinding(),
      //  withDebugTracing(),
    ),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        appearance: 'outline',
      }
    }, provideServiceWorker('ngsw-worker.js', {
            enabled: !isDevMode(),
            registrationStrategy: 'registerWhenStable:30000'
          }),
  ],
};
