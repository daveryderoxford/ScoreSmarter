import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { initializeAppCheck, provideAppCheck, ReCaptchaEnterpriseProvider } from '@angular/fire/app-check';

import {routes} from './app.routes';

// Placeholder config - user will need to update this with their actual Firebase config
export const firebaseConfig = {
  apiKey: "AIzaSyDJMflCnJkd4oFIHHVBSCh2C9sD8tiwUoA",
  authDomain: "auth.scoresmarter.app",
  projectId: "sailbrowser-efef0",
  storageBucket: "sailbrowser-efef0.appspot.com",
  messagingSenderId: "500477680330",
  appId: "1:500477680330:web:8fae64d733a9772b67b233",
  measurementId: "G-KJRV036MH7"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), 
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAppCheck(() => {
      // In debug App Check to use the debug provider instead of reCAPTCHA
      if (isDevMode() || window.location.hostname === 'localhost') {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      return initializeAppCheck(undefined, {
        provider: new ReCaptchaEnterpriseProvider('6LerxgwtAAAAALtfXU4-NFl3-tXR20bGobMsKaSA'),
        isTokenAutoRefreshEnabled: true
      });
    }),
  ],
};
