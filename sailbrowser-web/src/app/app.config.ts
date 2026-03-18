import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getFunctions, provideFunctions } from '@angular/fire/functions';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { APP_ROUTES } from './app.routes';
import { ClubTenant } from './club-tenant/services/club-tenant';
import { firebaseConfig } from './firebase-config';

if (isDevMode()) {
  (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.log('AppCheck configured in debug mode');
}

export const appConfig: ApplicationConfig = {
  providers: [
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
    provideFunctions(() => getFunctions()),
    provideFirestore(() => {
      const firestore = getFirestore();
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
  ],
};
