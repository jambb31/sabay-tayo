// Public tracking page: family and friends open the link a passenger shared. No login needed.
import { db, doc, onSnapshot, getParam, esc, time12, trackerHTML, etaText } from "./app.js";

const id = getParam("id");
const box = document.getElementById("trackbox");
let track = null;

if (!id) {
  box.innerHTML = '<p class="msg err">This tracking link is not complete.</p>';
} else {
  onSnapshot(
    doc(db, "tracks", id),
    function (s) {
      if (s.exists()) {
        track = s.data();
      } else {
        track = null;
        box.innerHTML = '<p class="msg err">Ride not found. The link may be wrong.</p>';
      }
      draw();
    },
    function (error) {
      box.innerHTML = '<p class="msg err">Could not load the ride: ' + esc(error.message) + "</p>";
    }
  );
  setInterval(draw, 1000);
}

function draw() {
  if (!track) {
    return;
  }

  let driver = "A driver has not accepted yet.";
  if (track.driverName) {
    driver = "Driver " + esc(track.driverName) + ", plate " + esc(track.driverPlate);
  }
  let plural = "";
  if (track.riders > 1) {
    plural = "s";
  }

  const html = "<h2>" + esc(track.origin) + " to " + esc(track.destination) + "</h2>" +
    '<p class="small">Planned departure ' + time12(track.depart) + " &bull; " + track.riders + " passenger" + plural + "</p>" +
    trackerHTML(track.status) +
    '<p class="eta">' + esc(etaText(track)) + "</p>" +
    '<div class="banner">' + driver + "</div>" +
    '<p class="small">Last update ' + new Date(track.updatedAt).toLocaleTimeString() + ". This page updates by itself.</p>";

  if (box.dataset.html !== html) {
    box.dataset.html = html;
    box.innerHTML = html;
  }
}
