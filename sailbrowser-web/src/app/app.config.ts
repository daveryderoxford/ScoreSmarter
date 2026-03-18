import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer, provideZonelessChangeDetection } from '@angular/core';
import { getApp, initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { initializeAppCheck, provideAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth';
import { connectFirestoreEmulator, getFirestore, provideFirestore } from '@angular/fire/firestore';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { APP_ROUTES } from './app.routes';
import { firebaseConfig } from './firebase-config';
import { environment } from '../environments/environment';
import { ClubContextService } from './club-tenant/services/club-tenant';
import { GlobalErrorHandler } from './shared/services/global-error-handler';

if (isDevMode()) {
  (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  console.log('AppCheck configured in debug mode');
}


export const appConfig: ApplicationConfig = {
  providers: [
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(() => inject(ClubContextService).initialize()),    
    provideZonelessChangeDetection(),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => {
      const auth = getAuth();
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      }
      return auth;
    }),
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
