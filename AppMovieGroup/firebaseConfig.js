import { initializeApp } from 'firebase/app'; // RIGA 1 fiebaseConfig.js
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = { // RIGA 5
  apiKey: "AIzaSyDabE-cLYKEwKNniqml9tusvnc6EGkVFHA",
  authDomain: "moviegroup-60985.firebaseapp.com",
  projectId: "moviegroup-60985",
  storageBucket: "moviegroup-60985.firebasestorage.app",
  messagingSenderId: "1069301189554",
  appId: "1:1069301189554:web:b6b2d0baaa68dfbd8f72ab",
  measurementId: "G-8V1HF5K2L8"
};

// Inizializza Firebase RIGA 15
const app = initializeApp(firebaseConfig);

// Prepara il modulo di Autenticazione RIGA 18 (Login/Registrazione)
const auth = getAuth(app);

// Esportiamo 'auth' per poterlo usare nelle altre pagine RIGA 19
const db = getFirestore(app);
export { auth, db };

 