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
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { APP_ROUTES } from './app.routes';
import { ClubTenant } from './club-tenant/services/club-tenant';
import { firebaseConfig } from './firebase-config';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideServiceWorker } from '@angular/service-worker';
import { initializeAppCheck, provideAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';
import { AppCheckFailureReporter } from './shared/firebase/app-check-failure-reporter';

function browserLocaleId(): string {
  return typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-GB';
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    { provide: LOCALE_ID, useFactory: browserLocaleId },
    provideAppCheck(() => {
      // In debug App Check to use the debug provider instead of reCAPTCHA
      if (isDevMode() || window.location.hostname === 'localhost') {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      const appCheck = initializeAppCheck(undefined, {
        provider: new ReCaptchaEnterpriseProvider('6LerxgwtAAAAALtfXU4-NFl3-tXR20bGobMsKaSA'),
        isTokenAutoRefreshEnabled: true
      });
      inject(AppCheckFailureReporter).watch(appCheck);
      return appCheck;
    }),
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
      const app = getApp();
      let firestore;
      try {
        // Must not call getFirestore() first — that locks in default settings and
        // makes initializeFirestore() fail with "already been called with different options".
        firestore = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch (err) {
        // Hot reload, private browsing, or emulator: use the existing instance.
        console.warn('Firestore persistent cache unavailable, using default settings.', err);
        firestore = getFirestore(app);
      }
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, 'localhost', 8080);
      }
      return firestore;
    }),
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
            // Zoneless apps reach stability quickly; register immediately so update
            // checks are not blocked behind a 30s stability wait.
            registrationStrategy: 'registerImmediately',
          }),
  ],
};
