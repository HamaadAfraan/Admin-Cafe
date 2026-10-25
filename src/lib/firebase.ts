import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCotKZmnp7CFBY9dWZyG7Br3Tr3jWxix78",
  authDomain: "strangers-gaming-cafe.firebaseapp.com",
  projectId: "strangers-gaming-cafe",
  storageBucket: "strangers-gaming-cafe.firebasestorage.app",
  messagingSenderId: "693287892661",
  appId: "1:693287892661:web:8e08d9c5068b79efb1b0fc",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);