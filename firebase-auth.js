// Import Firebase libraries
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Your Firebase config (from Project Settings)
const firebaseConfig = {
  apiKey: "AIzaSyBuyJT3JPnzIPCb7h4B5TE5k7-xo9kg_8c",
  authDomain: "solana-future-24bf1.firebaseapp.com",
  projectId: "solana-future-24bf1",
  storageBucket: "solana-future-24bf1.appspot.com",
  messagingSenderId: "488239811219",
  appId: "1:488239811219:web:abc123def456ghi789" // just a placeholder, check if you have this value
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Login function
window.loginWithFirebase = async function (email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    alert("Login successful! ✅");
    console.log("User:", user);
    // Redirect or call backend here
  } catch (error) {
    alert("Login failed ❌: " + error.message);
    console.error(error);
  }
}
