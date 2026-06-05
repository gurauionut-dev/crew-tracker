import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBFE2W-kCKniS7xs7KSi7VhPi05oeOpa9A",
  authDomain: "crew-tracker-led.firebaseapp.com",
  projectId: "crew-tracker-led",
  storageBucket: "crew-tracker-led.firebasestorage.app",
  messagingSenderId: "40454072780",
  appId: "1:40454072780:web:dae8a38f9569a18ffbd569"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function saveChecked(uid, eventId, actions) {
  const ref = doc(db, "checked", `${uid}_${eventId}`);
  await setDoc(ref, { uid, eventId, actions, updatedAt: serverTimestamp() }, { merge: true });
}

export async function saveApproval(uid, eventId, status, amounts) {
  const ref = doc(db, "approvals", `${uid}_${eventId}`);
  await setDoc(ref, { uid, eventId, status, amounts, updatedAt: serverTimestamp() }, { merge: true });
}

export function listenChecked(callback) {
  return onSnapshot(collection(db, "checked"), snap => {
    const result = {};
    snap.forEach(d => {
      const { uid, eventId, actions } = d.data();
      if (!result[uid]) result[uid] = {};
      result[uid][eventId] = actions || {};
    });
    callback(result);
  });
}

export function listenApprovals(callback) {
  return onSnapshot(collection(db, "approvals"), snap => {
    const result = {};
    snap.forEach(d => {
      const { uid, eventId, status, amounts } = d.data();
      if (!result[uid]) result[uid] = {};
      result[uid][eventId] = { status: status || null, amounts: amounts || {} };
    });
    callback(result);
  });
}

// Event colors — shared across all users
export async function saveEventColor(originalId, color) {
  const ref = doc(db, "eventColors", originalId);
  await setDoc(ref, { color, updatedAt: serverTimestamp() });
}

export function listenEventColors(callback) {
  return onSnapshot(collection(db, "eventColors"), snap => {
    const result = {};
    snap.forEach(d => { result[d.id] = d.data().color; });
    callback(result);
  });
}
