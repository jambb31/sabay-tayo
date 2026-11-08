// Shared file: Firebase setup + helper functions used by every page.
// Firebase needs "import" and "async/await". Everything else uses plain JavaScript from class.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc, onSnapshot, updateDoc,
  runTransaction, query, orderBy, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { qrSvg } from "./qr.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhjnjvCpg-oqRnjRAYVtE6snEKXWWtixE",
  authDomain: "sabay-tayo.firebaseapp.com",
  projectId: "sabay-tayo",
  storageBucket: "sabay-tayo.firebasestorage.app",
  messagingSenderId: "939543333729",
  appId: "1:939543333729:web:88ca88da6dab6d08615320"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const groups = collection(db, "groups");
export const users = collection(db, "users");
export { getDoc, collection, signOut, addDoc, doc, onSnapshot, updateDoc, query, orderBy, where, serverTimestamp };

// ---------------------------------------------------------------------------
// SETTINGS (change the numbers here, every page uses them)
// ---------------------------------------------------------------------------
export const GATES = ["TSU Main Gate", "TSU San Isidro Gate", "TSU Lucinda Gate"];
export const DESTINATIONS = ["Magic Star", "Villa Isabela", "SM City Tarlac"];

// FARE MATRIX: the fixed total fare per tricycle for every route.
// Row = pickup gate, column = destination. Replace these numbers with the official matrix.
export const FARE_MATRIX = {
  "TSU Main Gate":       { "Magic Star": 120, "Villa Isabela": 120, "SM City Tarlac": 160 },
  "TSU San Isidro Gate": { "Magic Star": 120, "Villa Isabela": 120, "SM City Tarlac": 160 },
  "TSU Lucinda Gate":    { "Magic Star": 120, "Villa Isabela": 120, "SM City Tarlac": 160 }
};

export const CODES = { "Magic Star": "MSTAR", "Villa Isabela": "VISA", "SM City Tarlac": "SMCT" }; // short group-code names

// TRIP TIME MATRIX: about how many minutes the ride takes. Used for the ETA. Replace with real estimates.
export const TRIP_MINUTES = {
  "TSU Main Gate":       { "Magic Star": 15, "Villa Isabela": 15, "SM City Tarlac": 25 },
  "TSU San Isidro Gate": { "Magic Star": 15, "Villa Isabela": 15, "SM City Tarlac": 25 },
  "TSU Lucinda Gate":    { "Magic Star": 15, "Villa Isabela": 15, "SM City Tarlac": 25 }
};

// SPECIAL DISCOUNTS: the discount takes off a percent of that passenger's share of the fare.
// 20% is the usual rate in Philippine discount laws. Confirm the rate that applies to tricycles.
export const DISCOUNTS = [
  { id: "none", label: "No discount", rate: 0 },
  { id: "student", label: "Student", rate: 0.2 },
  { id: "senior", label: "Senior citizen", rate: 0.2 },
  { id: "pwd", label: "PWD", rate: 0.2 }
];

// EXTRA FEES (set by the driver, see driver.js)
export const FEE_PER_KM = 10;     // PHP for every extra kilometer past the drop-off
export const MAX_LOAD_FEE = 100;  // the most a driver can charge for a heavy load (PHP)
export const MAX_EXTRA_KM = 10;   // the most extra kilometers a driver can enter

// The address of your PUBLISHED website, with a / at the end. Example: "https://sabay-tayo.web.app/"
// The QR codes and the "Share my ETA" links are built from it, so other phones can open them.
// Leave it "" while you test on your own computer (the links then use the current address).
export const SITE_URL = "";

export const STUDENT_DOMAIN = "@student.tsu.edu.ph"; // set to "" while testing with other emails
export const ADMIN_EMAIL = "admin@sabaytayo.com"; // signing up with this email creates the admin account
export const HOME = { student: "student.html", driver: "driver.html", admin: "admin.html" };

// ---------------------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------------------
// Make text safe before putting it inside innerHTML (stops names like <b> from breaking the page).
export function esc(text) {
  text = String(text);
  text = text.split("&").join("&amp;");
  text = text.split("<").join("&lt;");
  text = text.split(">").join("&gt;");
  text = text.split('"').join("&quot;");
  text = text.split("'").join("&#39;");
  return text;
}

export function money(n) {
  let text = n.toFixed(2);
  if (text.slice(-3) === ".00") {
    text = text.slice(0, -3);
  }
  return "PHP " + text;
}

export function time12(t) {
  const parts = t.split(":");
  const h = Number(parts[0]);
  const m = parts[1];
  let hour = h % 12;
  let ampm = "AM";
  if (hour === 0) {
    hour = 12;
  }
  if (h >= 12) {
    ampm = "PM";
  }
  return hour + ":" + m + " " + ampm;
}

export function tag(g) {
  return "#" + g.code + "-" + time12(g.depart).replace(" ", "");
}

// Read ?name=value from the page address.
export function getParam(name) {
  const pairs = location.search.slice(1).split("&");
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].split("=");
    if (pair[0] === name) {
      return decodeURIComponent(pair[1]);
    }
  }
  return null;
}

// The folder where the website lives: SITE_URL if you set it, otherwise the address of this page.
function siteFolder() {
  if (SITE_URL !== "") {
    return SITE_URL;
  }
  const page = location.href.split("?")[0];
  return page.slice(0, page.lastIndexOf("/") + 1);
}

// A QR code (made right here, no internet needed) with a hint under it.
// big = true shows it larger, so a driver can scan it from farther away.
export function qrHTML(link, label, big) {
  let svg = "";
  try {
    svg = qrSvg(link, esc(label));
  } catch (error) {
    return '<p class="msg err">Could not make the QR code.</p><p class="small">' + esc(link) + "</p>";
  }
  let boxClass = "qrbox";
  let hint = "Tap the QR code to make it bigger.";
  if (big) {
    boxClass = "qrbox big";
    hint = "Tap the QR code to make it smaller.";
  }
  let warning = "";
  if (SITE_URL === "" && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    warning = '<p class="msg err small">Testing mode: this QR opens an address that only this computer can reach. ' +
      "After you publish the website, put its address in SITE_URL (app.js).</p>";
  }
  return '<div class="' + boxClass + '" data-act="enlarge">' + svg + "</div>" +
    '<p class="small center">' + hint + "</p>" + warning;
}

// ---------------------------------------------------------------------------
// FARE FUNCTIONS
// ---------------------------------------------------------------------------
export function getFare(origin, destination) {
  return FARE_MATRIX[origin][destination];
}

// Everyone splits the base fare equally.
export function shareOf(g) {
  return g.fare / g.members.length;
}

// Extra distance fee = extra kilometers x fee per kilometer.
export function extraFee(m) {
  return (m.extraKm || 0) * FEE_PER_KM;
}

export function getDiscount(id) {
  for (let i = 0; i < DISCOUNTS.length; i++) {
    if (DISCOUNTS[i].id === id) {
      return DISCOUNTS[i];
    }
  }
  return DISCOUNTS[0];
}

// How much a passenger's discount takes off their share.
export function discountOf(g, m) {
  return shareOf(g) * getDiscount(m.discount).rate;
}

// What one passenger pays: share - discount + load fee + extra distance fee.
export function totalOf(g, m) {
  return shareOf(g) - discountOf(g, m) + (m.loadFee || 0) + extraFee(m);
}

export function findMember(g, email) {
  for (let i = 0; i < g.members.length; i++) {
    if (g.members[i].email === email) {
      return g.members[i];
    }
  }
  return null;
}

export function newMember(user) {
  return { name: user.name, email: user.email, loadFee: 0, extraKm: 0, discount: "none", heavyLoad: false };
}

// The trip has been accepted by a driver (it may or may not have started).
export function inTrip(g) {
  return g.status === "accepted" || g.status === "ontrip";
}

// <option> list for the discount drop-down.
export function discountOptions(selectedId) {
  let html = "";
  for (let i = 0; i < DISCOUNTS.length; i++) {
    let selected = "";
    if (DISCOUNTS[i].id === selectedId) {
      selected = " selected";
    }
    html += '<option value="' + DISCOUNTS[i].id + '"' + selected + ">" + DISCOUNTS[i].label +
      " (" + Math.round(DISCOUNTS[i].rate * 100) + "%)</option>";
  }
  return html;
}

// Table of what every passenger pays. full = true also shows discount, load fee, extra km fee and total.
export function fareTable(g, full) {
  const share = shareOf(g);
  let html = '<div class="scroll"><table><thead><tr><th>Passenger</th><th>Share</th>';
  if (full) {
    html += '<th>Discount</th><th>Load fee</th><th>Extra km fee</th><th>Total</th>';
  }
  html += '</tr></thead><tbody>';
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i];
    let name = esc(m.name);
    if (m.heavyLoad) {
      name += ' <span class="badge wait">Heavy load</span>';
    }
    html += '<tr><td>' + name + '</td><td>' + money(share) + '</td>';
    if (full) {
      const d = getDiscount(m.discount);
      let discountText = "None";
      if (d.rate > 0) {
        discountText = "- " + money(discountOf(g, m)) + " (" + d.label + ")";
      }
      html += '<td>' + discountText + '</td>';
      html += '<td>' + money(m.loadFee || 0) + '</td>';
      html += '<td>' + money(extraFee(m)) + '</td>';
      html += '<td><strong>' + money(totalOf(g, m)) + '</strong></td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  let ways = "";
  if (g.members.length > 1) {
    ways = "s";
  }
  html += '<p class="small">Base fare ' + money(g.fare) + ' (from the fare matrix), split ' + g.members.length + ' way' + ways + '.</p>';
  return html;
}

// One passenger's fare breakdown, step by step, starting from the fare matrix.
export function fareBreakdownHTML(g, m) {
  const n = g.members.length;
  const d = getDiscount(m.discount);
  let html = '<div class="scroll"><table><caption>Your fare breakdown</caption>';
  html += '<thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>';
  html += '<tr><td>Fare matrix: ' + esc(g.origin) + ' to ' + esc(g.destination) + '</td><td>' + money(g.fare) + '</td></tr>';
  let plural = "";
  if (n > 1) {
    plural = "s";
  }
  html += '<tr><td>Split equally by ' + n + ' passenger' + plural + '</td><td>' + money(shareOf(g)) + '</td></tr>';
  if (d.rate > 0) {
    html += '<tr><td>' + d.label + ' discount (' + Math.round(d.rate * 100) + '%)</td><td>- ' + money(discountOf(g, m)) + '</td></tr>';
  }
  html += '<tr><td>Load fee</td><td>' + money(m.loadFee || 0) + '</td></tr>';
  html += '<tr><td>Extra distance (' + (m.extraKm || 0) + ' km x ' + money(FEE_PER_KM) + ')</td><td>' + money(extraFee(m)) + '</td></tr>';
  html += '<tr><th>You pay</th><th>' + money(totalOf(g, m)) + '</th></tr>';
  html += '</tbody></table></div>';
  return html;
}

// The fare matrix as a table (rows = gates, columns = destinations).
export function fareMatrixHTML() {
  let html = '<div class="scroll"><table><caption>Fare matrix (total fare per tricycle)</caption>';
  html += '<thead><tr><th>Pickup gate</th>';
  for (let d = 0; d < DESTINATIONS.length; d++) {
    html += '<th>' + DESTINATIONS[d] + '</th>';
  }
  html += '</tr></thead><tbody>';
  for (let g = 0; g < GATES.length; g++) {
    html += '<tr><th>' + GATES[g] + '</th>';
    for (let d = 0; d < DESTINATIONS.length; d++) {
      html += '<td>' + money(getFare(GATES[g], DESTINATIONS[d])) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

// Explains the two extra fees.
export function ratesHTML() {
  return '<p class="small">Extra fees are added by the driver. Load fee: for heavy items, up to ' + money(MAX_LOAD_FEE) +
    '. Extra distance: ' + money(FEE_PER_KM) + ' for every kilometer past your drop-off. Students, senior citizens and PWD can pick a discount (show your ID to the driver).</p>';
}

// ---------------------------------------------------------------------------
// RIDE TRACKING + ETA (there is no map, so tracking = the ride status + an estimated arrival time)
// ---------------------------------------------------------------------------
const STAGES = ["Group forming", "Ready to go", "Driver accepted", "On the way", "Arrived"];

// Which step of the ride the group is on (0 = cancelled).
export function stageOf(status) {
  if (status === "open") {
    return 1;
  }
  if (status === "full" || status === "ready") {
    return 2;
  }
  if (status === "accepted") {
    return 3;
  }
  if (status === "ontrip") {
    return 4;
  }
  if (status === "done") {
    return 5;
  }
  return 0;
}

// The progress steps: finished steps are green, the current step is blue.
export function trackerHTML(status) {
  const stage = stageOf(status);
  if (stage === 0) {
    return '<p class="msg err">This group was cancelled.</p>';
  }
  let html = '<ol class="tracker">';
  for (let i = 0; i < STAGES.length; i++) {
    let cls = "";
    if (i + 1 < stage || stage === 5) {
      cls = "done";
    } else if (i + 1 === stage) {
      cls = "now";
    }
    html += '<li class="' + cls + '"><span>' + (i + 1) + '</span>' + STAGES[i] + '</li>';
  }
  html += '</ol>';
  return html;
}

function pad(n) {
  if (n < 10) {
    return "0" + n;
  }
  return String(n);
}

// 1760000000000 -> "3:45 PM"
export function clockTime(ms) {
  const d = new Date(ms);
  return time12(pad(d.getHours()) + ":" + pad(d.getMinutes()));
}

export function tripMinutes(g) {
  return TRIP_MINUTES[g.origin][g.destination];
}

// Estimated arrival = when the driver pressed Start trip + the minutes from the trip time matrix.
export function etaAt(g) {
  return g.startedAt + tripMinutes(g) * 60000;
}

// The ETA sentence. A clock time only appears after the trip starts, because before that
// nobody knows when the group will really leave.
export function etaText(g) {
  if (g.status === "done") {
    return "Arrived.";
  }
  if (g.status === "cancelled") {
    return "";
  }
  const minutes = tripMinutes(g);
  if (g.status === "ontrip" && g.startedAt) {
    const mins = Math.ceil((etaAt(g) - Date.now()) / 60000);
    if (mins <= 0) {
      return "On the way. Should be arriving now.";
    }
    return "On the way. Estimated arrival " + clockTime(etaAt(g)) + " (in " + mins + " min).";
  }
  if (g.status === "open") {
    return "Planned departure " + time12(g.depart) + ". The ride takes about " + minutes + " min.";
  }
  return "The ride takes about " + minutes + " min. The arrival time shows once the driver starts the trip.";
}

// The link a passenger shares with family or friends. It opens track.html (no login needed).
export function trackLink(id) {
  return siteFolder() + "track.html?id=" + id;
}

// Copy the group's status into the "tracks" collection. That small document has NO emails,
// so the tracking page can be public without leaking anything private.
export async function syncTrack(id) {
  try {
    const s = await getDoc(doc(db, "groups", id));
    if (!s.exists()) {
      await updateDoc(doc(db, "tracks", id), { status: "cancelled", updatedAt: Date.now() });
      return;
    }
    const g = s.data();
    await setDoc(doc(db, "tracks", id), {
      origin: g.origin,
      destination: g.destination,
      depart: g.depart,
      departAt: g.departAt,
      status: g.status,
      riders: g.members.length,
      driverName: g.driverName || "",
      driverPlate: g.driverPlate || "",
      startedAt: g.startedAt || 0,
      updatedAt: Date.now()
    });
  } catch (error) {
    console.log("Could not update tracking: " + error.message);
  }
}

// ---------------------------------------------------------------------------
// ACCOUNTS
// ---------------------------------------------------------------------------
// Shrink a picture to a JPEG text string (up to 1600px) so it fits in Firestore.
export async function photoData(file) {
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    throw new Error("That file is not a picture.");
  }

  let scale = 1600 / Math.max(bmp.width, bmp.height);
  if (scale > 1) {
    scale = 1;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);

  let quality = 0.92;
  let result = canvas.toDataURL("image/jpeg", quality);
  while (result.length > 900000 && quality > 0.4) { // Firestore documents max out near 1 MB
    quality = quality - 0.1;
    result = canvas.toDataURL("image/jpeg", quality);
  }
  return result;
}

// Create the login, then save name + role (and plate for drivers) in the "users" collection.
export async function signUp(name, email, password, role, plate, photo) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  let finalRole = role;
  if (email === ADMIN_EMAIL) {
    finalRole = "admin";
  }
  const data = { name: name, email: email, role: finalRole };
  if (finalRole === "driver") {
    data.plate = plate;
    data.verified = "pending"; // admin must verify drivers
  }
  await setDoc(doc(db, "users", cred.user.uid), data);
  if (finalRole === "driver" && photo) {
    await setDoc(doc(db, "licenses", cred.user.uid), { photo: photo }); // separate collection so rules can protect it
  }
}

export function logIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

// Every page calls this. With a role the page is private: logged-out users go to auth.html,
// and someone with another role is sent to their own page.
export function watchUser(role) {
  return new Promise(function (resolve) {
    onAuthStateChanged(auth, async function (u) {
      let snap = null;
      if (u) {
        snap = await getDoc(doc(db, "users", u.uid));
      }

      if (!u || !snap.exists()) {
        if (role) {
          const here = location.pathname.split("/").pop() + location.search;
          location.href = "auth.html?next=" + encodeURIComponent(here);
          return; // a private page: never continue, the login page is taking over
        }
        resolve(null);
        return;
      }

      const p = snap.data();
      p.uid = u.uid;
      if (role && p.role !== role) {
        location.href = HOME[p.role];
        return;
      }

      const session = document.getElementById("session");
      if (session) {
        document.getElementById("who").textContent = p.name;
        session.hidden = false;
        document.getElementById("logout").onclick = async function () {
          await signOut(auth);
          location.href = "index.html";
        };
      }
      resolve(p);
    });
  });
}

// ---------------------------------------------------------------------------
// GROUPS (transactions stop two people from grabbing the last seat, or two drivers the same group)
// ---------------------------------------------------------------------------
export async function joinGroup(id, user) {
  await runTransaction(db, async function (t) {
    const ref = doc(db, "groups", id);
    const s = await t.get(ref);
    if (!s.exists()) {
      throw new Error("This group no longer exists.");
    }
    const g = s.data();
    if (g.status !== "open" || g.departAt <= Date.now()) {
      throw new Error("This group already left or is closed.");
    }
    if (findMember(g, user.email)) {
      return;
    }
    const members = g.members.concat([newMember(user)]);
    let status = "open";
    if (members.length === 4) {
      status = "full";
    }
    // new member: the leave-now poll starts over
    t.update(ref, { members: members, status: status, votes: [] });
  });
  await syncTrack(id);
}

export async function leaveGroup(id, user) {
  await runTransaction(db, async function (t) {
    const ref = doc(db, "groups", id);
    const s = await t.get(ref);
    if (!s.exists() || inTrip(s.data())) {
      return;
    }
    const old = s.data().members;
    const members = [];
    for (let i = 0; i < old.length; i++) {
      if (old[i].email !== user.email) {
        members.push(old[i]);
      }
    }
    if (members.length > 0) {
      t.update(ref, { members: members, status: "open", votes: [] });
    } else {
      t.delete(ref);
    }
  });
  await syncTrack(id);
}

// Poll: any time while waiting, the members can vote to leave early (even alone).
// When EVERY member votes yes, the group becomes "ready" for drivers.
export async function voteGo(id, user, yes) {
  await runTransaction(db, async function (t) {
    const ref = doc(db, "groups", id);
    const s = await t.get(ref);
    if (!s.exists()) {
      return;
    }
    const g = s.data();
    if (g.status !== "open") {
      return;
    }

    const votes = [];
    const old = g.votes || [];
    for (let i = 0; i < old.length; i++) {
      if (old[i] !== user.email) {
        votes.push(old[i]);
      }
    }
    if (yes) {
      votes.push(user.email);
    }

    let everyone = true;
    for (let i = 0; i < g.members.length; i++) {
      if (votes.indexOf(g.members[i].email) === -1) {
        everyone = false;
      }
    }
    let status = "open";
    if (everyone) {
      status = "ready";
    }
    t.update(ref, { votes: votes, status: status });
  });
  await syncTrack(id);
}

// The QR code holds this link. A phone camera opens it and the driver sees the group.
export function scanLink(id) {
  return siteFolder() + "driver.html?group=" + id;
}

export async function acceptGroup(id, driver) {
  await runTransaction(db, async function (t) {
    const ref = doc(db, "groups", id);
    const s = await t.get(ref);
    if (!s.exists() || (s.data().status !== "full" && s.data().status !== "ready")) {
      throw new Error("This group is not ready or is no longer available.");
    }
    t.update(ref, {
      status: "accepted",
      driverEmail: driver.email,
      driverName: driver.name,
      driverPlate: driver.plate
    });
  });
  await syncTrack(id);
}

// Passenger changes their own option (their discount, or the heavy load flag) while the trip has not started.
export async function updateMember(id, email, field, value) {
  await runTransaction(db, async function (t) {
    const ref = doc(db, "groups", id);
    const s = await t.get(ref);
    if (!s.exists()) {
      return;
    }
    const g = s.data();
    if (g.status === "ontrip" || g.status === "done" || g.status === "cancelled") {
      throw new Error("The trip already started, so this can no longer be changed.");
    }
    for (let i = 0; i < g.members.length; i++) {
      if (g.members[i].email === email) {
        g.members[i][field] = value;
      }
    }
    t.update(ref, { members: g.members });
  });
}

// The creator cancels the whole group.
export async function cancelGroup(id) {
  await updateDoc(doc(db, "groups", id), { status: "cancelled" });
  await syncTrack(id);
}

// The driver saves the fees (discount, load fee, extra km) without changing the trip status.
export async function saveFees(id, members) {
  await updateDoc(doc(db, "groups", id), { members: members });
}

// The driver starts the trip. The ETA counts from this moment. members = the fees the driver typed.
export async function startTrip(id, members) {
  await updateDoc(doc(db, "groups", id), { members: members, status: "ontrip", startedAt: Date.now() });
  await syncTrack(id);
}

// The driver finishes the trip and saves the final fees.
export async function finishTrip(id, members) {
  await updateDoc(doc(db, "groups", id), { members: members, status: "done" });
  await syncTrack(id);
}
