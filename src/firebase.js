import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics",
  authDomain: "leshan-crm.firebaseapp.com",
  projectId: "leshan-crm",
  storageBucket: "leshan-crm.firebasestorage.app",
  messagingSenderId: "67951666720",
  appId: "1:67951666720:web:8c1fe1efd8579f155a3e45",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
