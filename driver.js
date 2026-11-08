// Driver page: see groups, accept one, add load fee / extra distance fee, finish the trip.
import {
  db, doc, groups, collection, onSnapshot, addDoc, query, orderBy, serverTimestamp,
  acceptGroup, saveFees, startTrip, finishTrip, watchUser, getParam,
  FEE_PER_KM, MAX_LOAD_FEE, MAX_EXTRA_KM,
  esc, money, time12, tag, shareOf, totalOf, inTrip, discountOptions, showFinished, markSeen,
  fareTable, fareMatrixHTML, ratesHTML, trackerHTML
} from "./app.js";

const me = await watchUser("driver");
let data = [];
let verified = false;

const appBox = document.getElementById("app");
const lockBox = document.getElementById("lock");
const listBox = document.getElementById("list");

// ---------- Is this driver verified by the admin? ----------
onSnapshot(doc(db, "users", me.uid), function (s) {
  const status = s.data().verified;
  verified = status === "verified";
  appBox.hidden = !verified;
  lockBox.hidden = verified;
  if (status === "rejected") {
    lockBox.innerHTML = "<h2>Account not approved</h2><p>The admin could not verify your details. Contact the admin.</p>";
  } else {
    lockBox.innerHTML = "<h2>Waiting for admin verification</h2><p>The admin is checking your tricycle details. This page unlocks by itself once you are verified.</p>";
  }
});

// ---------- Live groups from Firebase ----------
onSnapshot(
  query(groups, orderBy("createdAt", "desc")),
  function (snapshot) {
    data = [];
    snapshot.forEach(function (d) {
      const g = d.data();
      g.id = d.id;
      data.push(g);
    });
    draw();
  },
  function (error) {
    listBox.textContent = "Database error: " + error.message;
  }
);
setInterval(draw, 1000);

// ---------- Small helpers ----------
function avatars(g) {
  let html = "";
  for (let i = 0; i < 4; i++) {
    if (g.members[i]) {
      html += '<span class="av">' + esc(g.members[i].name.charAt(0).toUpperCase()) + "</span>";
    } else {
      html += '<span class="av empty">+</span>';
    }
  }
  return html;
}

// Only change the page when the HTML is different (so typing in the fee boxes is not erased).
let lastHtml = "";
function show(html) {
  if (lastHtml !== html) {
    lastHtml = html;
    listBox.innerHTML = html;
  }
}

function findGroup(id) {
  for (let i = 0; i < data.length; i++) {
    if (data[i].id === id) {
      return data[i];
    }
  }
  return null;
}

// ---------- Fee editor: load fee + extra kilometers for each passenger ----------
function feeEditor(g) {
  const share = shareOf(g);
  let html = '<div class="scroll"><table><thead><tr><th>Passenger</th><th>Share</th><th>Discount</th><th>Load fee (PHP)</th><th>Extra km</th><th>Total</th></tr></thead><tbody>';
  for (let i = 0; i < g.members.length; i++) {
    const m = g.members[i];
    let name = esc(m.name);
    if (m.heavyLoad) {
      name += ' <span class="badge wait">Heavy load</span>';
    }
    html += "<tr>";
    html += "<td>" + name + "</td>";
    html += "<td>" + money(share) + "</td>";
    html += '<td><select id="disc' + i + '" aria-label="Discount for ' + esc(m.name) + '">' + discountOptions(m.discount) + "</select></td>";
    html += '<td><input type="number" id="load' + i + '" min="0" max="' + MAX_LOAD_FEE + '" step="1" value="' + (m.loadFee || 0) + '" aria-label="Load fee for ' + esc(m.name) + '"></td>';
    html += '<td><input type="number" id="km' + i + '" min="0" max="' + MAX_EXTRA_KM + '" step="0.5" value="' + (m.extraKm || 0) + '" aria-label="Extra kilometers for ' + esc(m.name) + '"></td>';
    html += "<td><strong>" + money(totalOf(g, m)) + "</strong></td>";
    html += "</tr>";
  }
  html += "</tbody></table></div>";
  html += '<p class="small">PWD discount: check the passenger\'s PWD ID first. ' +
    "Load fee: charge a passenger who brings something heavy (up to " + money(MAX_LOAD_FEE) + "). " +
    "Extra km: how far past the drop-off the passenger wants to go. The app adds " + money(FEE_PER_KM) + " for every kilometer.</p>";
  return html;
}

// Read the fee boxes and return the updated members list. Returns null if a number is not allowed.
function readFees(g) {
  const members = [];
  for (let i = 0; i < g.members.length; i++) {
    const load = Number(document.getElementById("load" + i).value);
    const km = Number(document.getElementById("km" + i).value);
    if (isNaN(load) || load < 0 || load > MAX_LOAD_FEE) {
      alert("Load fee must be from 0 to " + MAX_LOAD_FEE + ".");
      return null;
    }
    if (isNaN(km) || km < 0 || km > MAX_EXTRA_KM) {
      alert("Extra kilometers must be from 0 to " + MAX_EXTRA_KM + ".");
      return null;
    }
    members.push({
      name: g.members[i].name,
      email: g.members[i].email,
      loadFee: load,
      extraKm: km,
      discount: document.getElementById("disc" + i).value,
      heavyLoad: g.members[i].heavyLoad || false
    });
  }
  return members;
}

// ---------- Scanned QR card ----------
function scanCard(g) {
  if (!g) {
    return '<div class="card"><h2>Scanned group</h2><p>Group not found. It may have been cancelled.</p>' +
      '<a class="btn light line" href="driver.html">Close</a></div>';
  }

  const can = g.status === "full" || g.status === "ready";
  let msg = "";
  if (inTrip(g)) {
    msg = "Already accepted by " + esc(g.driverName) + ".";
  } else if (g.status === "done") {
    msg = "This trip is finished.";
  } else if (g.status === "cancelled") {
    msg = "This group was cancelled.";
  } else if (!can) {
    msg = "Not ready yet. Passengers are still joining or have not agreed to leave.";
  }

  let cardClass = "waiting";
  let badgeClass = "urgent";
  if (can) {
    cardClass = "ready";
    badgeClass = "ready";
  }
  let action = '<button class="btn" data-act="accept" data-id="' + g.id + '">Accept group</button>';
  if (msg !== "") {
    action = '<p class="msg">' + msg + "</p>";
  }

  return '<div class="card ' + cardClass + '">' +
    '<span class="badge ' + badgeClass + '">Scanned QR</span>' +
    "<h2>" + esc(g.origin) + " to " + esc(g.destination) + "</h2>" +
    '<p class="small">' + esc(tag(g)) + "</p>" +
    fareTable(g, false) +
    "<p>Total " + money(g.fare) + ".</p>" +
    action +
    '<a class="btn light line" href="driver.html">Close</a>' +
    "</div>";
}

// ---------- One card in the list of groups ----------
function groupCard(g) {
  const n = g.members.length;
  const can = g.status === "full" || g.status === "ready";
  let cardClass = "waiting";
  let badgeClass = "urgent";
  let word = "Waiting";
  let bottom = '<p class="small">Not ready yet. Waiting for more passengers or for everyone to vote to leave.</p>';
  if (can) {
    cardClass = "ready";
    badgeClass = "ready";
    word = "Ready";
    bottom = '<p class="small">Each pays ' + money(g.fare / n) + ".</p>" +
      '<button class="btn full" data-act="accept" data-id="' + g.id + '">Accept group</button>';
  }
  return '<article class="card ' + cardClass + '">' +
    '<div class="row"><strong>' + esc(g.destination) + '</strong><span class="badge ' + badgeClass + '">' + word + "</span></div>" +
    '<p class="small">Group ' + esc(tag(g)) + ", fare " + money(g.fare) + " total<br>From " + esc(g.origin) + ", leaves " + time12(g.depart) + "</p>" +
    '<div class="row"><span>' + avatars(g) + '</span><span class="small">' + n + "/4 " + word.toLowerCase() + "</span></div>" +
    bottom +
    "</article>";
}

// ---------- Decide what to show ----------
function view() {
  let current = null;
  let finished = null;
  for (let i = 0; i < data.length; i++) {
    const g = data[i];
    if (g.driverEmail !== me.email) {
      continue;
    }
    if (inTrip(g)) {
      current = g;
    }
    if (showFinished(g, me.email)) {
      finished = g;
    }
  }

  // 1. I accepted a group: show the tracker and the fee editor
  if (current) {
    let heading = "Group accepted";
    let help = "Pick up your passengers at " + esc(current.origin) + ". Press Start trip when you leave.";
    let mainButton = '<button class="btn green" data-act="start" data-id="' + current.id + '">Start trip</button>';
    if (current.status === "ontrip") {
      heading = "On the way";
      help = "Add a load fee or extra kilometers if a passenger asks to go farther. Press Finish trip when everyone is dropped off.";
      mainButton = '<button class="btn green" data-act="done" data-id="' + current.id + '">Finish trip</button>';
    }
    return '<div class="card center">' +
      "<h1>" + heading + "</h1>" +
      '<p class="small">' + help + "</p>" +
      "<p><strong>" + esc(current.origin) + " to " + esc(current.destination) + "</strong><br>" +
      '<span class="small">' + esc(tag(current)) + "</span></p>" +
      trackerHTML(current.status) +
      feeEditor(current) +
      '<button class="btn light line" data-act="save" data-id="' + current.id + '">Save fees</button>' +
      mainButton +
      "</div>";
  }

  // 2. My last trip just finished
  if (finished) {
    return '<div class="card center">' +
      '<div class="check">&#10003;</div>' +
      "<h1>All set</h1>" +
      "<p>Trip finished. Safe trip!</p>" +
      "<p><strong>" + esc(finished.origin) + " to " + esc(finished.destination) + "</strong><br>" +
      '<span class="small">' + esc(tag(finished)) + "</span></p>" +
      fareTable(finished, true) +
      '<button class="btn light line" data-act="report" data-id="' + finished.id + '">Report an issue</button>' +
      '<button class="btn" data-act="seen" data-id="' + finished.id + '">Back to groups</button>' +
      "</div>";
  }

  // 3. The list of groups (and the scanned group, if the driver opened a QR code)
  let html = "";
  const scanId = getParam("group");
  if (scanId) {
    html += scanCard(findGroup(scanId));
  }
  html += "<h1>Groups ready for pickup</h1>";

  let cards = "";
  for (let i = 0; i < data.length; i++) {
    const s = data[i].status;
    if (s === "open" || s === "full" || s === "ready") {
      cards += groupCard(data[i]);
    }
  }
  if (cards === "") {
    html += '<div class="card"><p>No groups yet. New ones show up here by themselves.</p></div>';
  } else {
    html += '<div class="grid">' + cards + "</div>";
  }

  html += "<h2>Fares</h2>";
  html += '<div class="card">' + fareMatrixHTML() + ratesHTML() + "</div>";
  return html;
}

function draw() {
  if (verified) {
    show(view());
  }
}

// ---------- Buttons ----------
document.body.addEventListener("click", async function (e) {
  const act = e.target.dataset.act;
  const id = e.target.dataset.id;
  if (!act) {
    return;
  }

  try {
    if (act === "accept") {
      await acceptGroup(id, me);
    } else if (act === "save") {
      const members = readFees(findGroup(id));
      if (members) {
        await saveFees(id, members);
        alert("Fees saved.");
      }
    } else if (act === "start") {
      // saves the fee boxes too, so nothing typed is lost
      const members = readFees(findGroup(id));
      if (members) {
        await startTrip(id, members);
      }
    } else if (act === "done") {
      const members = readFees(findGroup(id));
      if (members) {
        await finishTrip(id, members);
      }
    } else if (act === "seen") {
      await markSeen(id, me.email);
    } else if (act === "report") {
      const text = prompt("What happened?");
      if (text) {
        await addDoc(collection(db, "reports"), {
          groupId: id,
          by: me.email,
          text: text,
          createdAt: serverTimestamp()
        });
        alert("Report sent.");
      }
    }
  } catch (error) {
    alert(error.message);
  }
});
