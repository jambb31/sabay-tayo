// Admin page: verify or reject drivers
import { db, users, doc, getDoc, onSnapshot, updateDoc, query, where, watchUser, esc } from "./app.js";

await watchUser("admin");

const rows = document.getElementById("rows");
const emptyText = document.getElementById("empty");
const photoBox = document.getElementById("photobox");
const pic = document.getElementById("pic");

function badgeClass(status) {
  if (status === "verified") {
    return "ready";
  }
  if (status === "rejected") {
    return "urgent";
  }
  return "wait";
}

// Runs again every time a driver signs up or is verified.
onSnapshot(query(users, where("role", "==", "driver")), function (snapshot) {
  emptyText.hidden = !snapshot.empty;
  let html = "";
  snapshot.forEach(function (d) {
    const u = d.data();
    html += "<tr>";
    html += "<td>" + esc(u.name) + "</td>";
    html += "<td>" + esc(u.email) + "</td>";
    html += "<td>" + esc(u.plate || "") + "</td>";
    html += '<td><button class="btn light line" data-lic="' + d.id + '">View photo</button></td>';
    html += '<td><span class="badge ' + badgeClass(u.verified) + '">' + u.verified + "</span></td>";
    html += "<td>";
    html += '<button class="btn green" data-id="' + d.id + '" data-v="verified">Verify</button>';
    html += '<button class="btn red" data-id="' + d.id + '" data-v="rejected">Reject</button>';
    html += "</td>";
    html += "</tr>";
  });
  rows.innerHTML = html;
});

rows.addEventListener("click", async function (e) {
  const licenseId = e.target.dataset.lic;
  const driverId = e.target.dataset.id;

  if (licenseId) {
    const s = await getDoc(doc(db, "licenses", licenseId));
    if (s.exists()) {
      pic.src = s.data().photo;
      pic.alt = "Driver license photo";
    } else {
      pic.src = "";
      pic.alt = "No photo uploaded";
    }
    photoBox.hidden = false;
  }

  if (driverId) {
    updateDoc(doc(db, "users", driverId), { verified: e.target.dataset.v });
  }
});

document.getElementById("closepic").addEventListener("click", function () {
  photoBox.hidden = true;
});
