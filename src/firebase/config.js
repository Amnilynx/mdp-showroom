// Firebase initialization — this is the ONE place the SDK gets set up.
// Everything else in the app imports { auth, db } from here.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmD7pDjz4RH-6GuY5dqehhQboM2qgxN0I",
  authDomain: "mdp-modular-systems.firebaseapp.com",
  projectId: "mdp-modular-systems",
  storageBucket: "mdp-modular-systems.firebasestorage.app",
  messagingSenderId: "374430093601",
  appId: "1:374430093601:web:b65ab1b2862092e348ee60",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
