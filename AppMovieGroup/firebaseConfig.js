// fiebaseConfig.js
import { initializeApp } from 'firebase/app'; 
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from "firebase/storage";

const firebaseConfig = { // RIGA 7
  apiKey: "AIzaSyDabE-cLYKEwKNniqml9tusvnc6EGkVFHA",
  authDomain: "moviegroup-60985.firebaseapp.com",
  projectId: "moviegroup-60985",
  storageBucket: "moviegroup-60985.firebasestorage.app",
  messagingSenderId: "1069301189554",
  appId: "1:1069301189554:web:b6b2d0baaa68dfbd8f72ab",
  measurementId: "G-8V1HF5K2L8"
};

// Inizializza Firebase RIGA 17
const app = initializeApp(firebaseConfig);
// Prepara il modulo di Autenticazione RIGA 20 (Login/Registrazione)
const auth = getAuth(app);
// Esportiamo 'auth' per poterlo usare nelle altre pagine RIGA 19
const db = getFirestore(app);
export { auth, db };
export const storage = getStorage(app);

 