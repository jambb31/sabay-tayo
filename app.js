// Shared file: Firebase setup + helper functions used by every page.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, onSnapshot, updateDoc, runTransaction, query, orderBy, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhjnjvCpg-oqRnjRAYVtE6snEKXWWtixE",
  authDomain: "sabay-tayo.firebaseapp.com",
  projectId: "sabay-tayo",
  storageBucket: "sabay-tayo.firebasestorage.app",
  messagingSenderId: "939543333729",
  appId: "1:939543333729:web:88ca88da6dab6d08615320"
};
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app), auth = getAuth(app);
export const groups = collection(db, "groups"), users = collection(db, "users");
export { getDoc, collection, signOut, addDoc, doc, onSnapshot, updateDoc, query, orderBy, where, serverTimestamp };

export const GATES = ["TSU Main Gate", "TSU San Isidro Gate", "TSU Lucinda Gate"];
export const FARES = { "Magic Star": 120, "Villa Isabela": 120, "SM City Tarlac": 160 }; // total PHP per tricycle
export const CODES = { "Magic Star": "MSTAR", "Villa Isabela": "VISA", "SM City Tarlac": "SMCT" }; // short group-code names
export const STUDENT_DOMAIN = "@student.tsu.edu.ph"; // set to "" while testing with other emails
export const ADMIN_EMAIL = "admin@sabaytayo.com";    // signing up with this email creates the admin account
export const HOME = { student: "student.html", driver: "driver.html", admin: "admin.html" };

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const money = n => "PHP " + n.toFixed(2).replace(/\.00$/, "");
export const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

export const time12 = t => { const [h, m] = t.split(":"); return (h % 12 || 12) + ":" + m + (h >= 12 ? " PM" : " AM"); };
export const tag = g => "#" + g.code + "-" + time12(g.depart).replace(" ", "");

// Create the login, then save name + role (and plate for drivers) in the "users" collection.
export async function photoData(file, max = 1600) { // shrink a picture to a JPEG text string (up to 1600px) so it fits in Firestore
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => { throw new Error("That file is not a picture."); });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.92, d = c.toDataURL("image/jpeg", q);
  while (d.length > 900000 && q > 0.4) { q -= 0.1; d = c.toDataURL("image/jpeg", q); } // Firestore documents max out near 1 MB
  return d;
}
export async function signUp(name, email, password, role, plate, photo) {
  const c = await createUserWithEmailAndPassword(auth, email, password);
  const r = email === ADMIN_EMAIL ? "admin" : role, data = { name, email, role: r };
  if (r === "driver") { data.plate = plate; data.verified = "pending"; } // admin must verify drivers
  await setDoc(doc(db, "users", c.user.uid), data);
  if (r === "driver" && photo) await setDoc(doc(db, "licenses", c.user.uid), { photo }); // separate collection so rules can protect it
}
export const logIn = (email, password) => signInWithEmailAndPassword(auth, email, password);

// Every page calls this. With a role the page is private: logged-out users go to auth.html,
// and someone with another role is sent to their own page.
export function watchUser(role) {
  return new Promise(res => onAuthStateChanged(auth, async u => {
    const snap = u && await getDoc(doc(db, "users", u.uid));
    if (!u || !snap.exists()) { if (role) location.href = "auth.html"; return res(null); }
    const p = { uid: u.uid, ...snap.data() };
    if (role && p.role !== role) { location.href = HOME[p.role]; return; }
    if ($("session")) {
      $("who").textContent = p.name; $("session").hidden = false;
      $("logout").onclick = async () => { await signOut(auth); location.href = "index.html"; };
    }
    res(p);
  }));
}

// Transactions stop two people from grabbing the last seat, or two drivers the same room.
export const joinGroup = (id, user) => runTransaction(db, async t => {
  const ref = doc(db, "groups", id), s = await t.get(ref);
  if (!s.exists()) throw new Error("This group no longer exists.");
  const g = s.data();
  if (g.status !== "open" || g.departAt <= Date.now()) throw new Error("This group already left or is closed.");
  if (g.members.some(x => x.email === user.email)) return;
  const members = [...g.members, { name: user.name, email: user.email }];
  t.update(ref, { members, status: members.length === 4 ? "full" : "open" });
});
export const leaveGroup = (id, user) => runTransaction(db, async t => {
  const ref = doc(db, "groups", id), s = await t.get(ref);
  if (!s.exists() || s.data().status === "accepted") return;
  const members = s.data().members.filter(x => x.email !== user.email);
  members.length ? t.update(ref, { members, status: "open" }) : t.delete(ref);
});
export const acceptGroup = (id, d) => runTransaction(db, async t => {
  const ref = doc(db, "groups", id), s = await t.get(ref);
  if (!s.exists() || !["open", "full"].includes(s.data().status)) throw new Error("This group is no longer available.");
  if (s.data().status !== "full" && s.data().departAt > Date.now()) throw new Error("This group is not ready yet.");
  t.update(ref, { status: "accepted", driverEmail: d.email, driverName: d.name, driverPlate: d.plate });
});