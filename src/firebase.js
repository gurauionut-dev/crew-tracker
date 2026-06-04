import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFE2W-kCKniS7xs7KSi7VhPi05eOpa9A",
  authDomain: "crew-tracker-led.firebaseapp.com",
  projectId: "crew-tracker-led",
  storageBucket: "crew-tracker-led.firebasestorage.app",
  messagingSenderId: "40454072780",
  appId: "1:40454072780:web:dae8a38f9569a1ffbd569"
};

// Pornim serviciul Firebase
const app = initializeApp(firebaseConfig);

// AICI ESTE REZOLVAREA: Inițializăm și exportăm variabila 'db' pe care o caută aplicația
export const db = getFirestore(app);
