"use strict";

/*
  Firebase web configuration. Replace every PASTE_... value with the values of YOUR Firebase project:
  Firebase console -> Project settings -> General -> Your apps -> Web app -> SDK setup and configuration.
  These values are public by design (every visitor's browser needs them).
  Your data is protected by the rules in firestore.rules, not by hiding this file.
*/

const FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",

  /* Push notifications (optional): Firebase console -> Project settings -> Cloud Messaging ->
     Web Push certificates -> "Generate key pair", then paste the PUBLIC key here. */
  vapidKey: ""
};
