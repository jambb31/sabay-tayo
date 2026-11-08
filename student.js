// Passenger page: see groups, create a group, wait for members, show the QR code,
// follow the ride steps, pick a discount, and see the fare breakdown.
import {
  db, groups, collection, onSnapshot, query, orderBy, addDoc, serverTimestamp,
  GATES, CODES, MAX_LOAD_FEE,
  getFare, destinationsFor, joinGroup, leaveGroup, voteGo, cancelGroup, updateMember,
  scanLink, watchUser, qrHTML,
  esc, money, time12, tag, findMember, newMember, inTrip, DISCOUNTS, showFinished, markSeen,
  fareTable, fareBreakdownHTML, fareMatrixHTML, ratesHTML, trackerHTML
} from "./app.js";

const user = await watchUser("student");
let data = [];
let creating = false;
let qrBig = false; // is the QR code shown large?

const mineBox = document.getElementById("mine");
const browseBox = document.getElementById("browse");
const formBox = document.getElementById("formv");
const listBox = document.getElementById("list");
const faresBox = document.getElementById("fares");
const gateSelect = document.getElementById("gate");
const destSelect = document.getElementById("dest");
const timeInput = document.getElementById("time");
const hintText = document.getElementById("hint");
const msgText = document.getElementById("msg");

// ---------- Fill the page ----------
for (let i = 0; i < GATES.length; i++) {
  gateSelect.innerHTML += "<option>" + GATES[i] + "</option>";
}
document.getElementById("me").textContent = user.name.charAt(0).toUpperCase();
document.getElementById("rates").innerHTML = ratesHTML();
faresBox.innerHTML = fareMatrixHTML() + ratesHTML();

// The destination list depends on the gate (you cannot ride from a campus to itself).
function fillDestinations() {
  const list = destinationsFor(gateSelect.value);
  destSelect.innerHTML = "";
  for (let i = 0; i < list.length; i++) {
    destSelect.innerHTML += "<option>" + list[i] + "</option>";
  }
}

// Show the fare from the fare matrix for the chosen gate + destination.
function showHint() {
  const fare = getFare(gateSelect.value, destSelect.value);
  hintText.textContent = "Total fare " + money(fare) + " for this route, split equally by everyone who joins.";
}

gateSelect.addEventListener("change", function () {
  fillDestinations();
  showHint();
});
destSelect.addEventListener("change", showHint);
fillDestinations();
showHint();

// ---------- Small helpers ----------
// One circle per seat: a letter for a member, a + for an empty seat.
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

function qrImage(g) {
  return qrHTML(scanLink(g.id), "QR code for group " + g.code, qrBig);
}

function routeInfo(g) {
  return "<p><strong>" + esc(g.origin) + " to " + esc(g.destination) + "</strong><br>" +
    '<span class="small">' + time12(g.depart) + " &bull; " + esc(tag(g)) + "</span></p>";
}

function reportButton(g) {
  return '<button class="btn light line" data-act="report" data-id="' + g.id + '">Report an issue</button>';
}

function findGroup(id) {
  for (let i = 0; i < data.length; i++) {
    if (data[i].id === id) {
      return data[i];
    }
  }
  return null;
}

// The ride steps (group forming, ready, driver accepted, on the way, arrived).
function trackBlock(g) {
  return trackerHTML(g.status);
}

// One toggle switch (a checkbox that looks like a switch).
function switchHTML(act, g, checked, text, discountId) {
  let on = "";
  if (checked) {
    on = " checked";
  }
  let extra = "";
  if (discountId) {
    extra = ' data-d="' + discountId + '"';
  }
  return '<label class="switch"><input type="checkbox" data-act="' + act + '" data-id="' + g.id + '"' + extra + on + ">" +
    '<span class="slider"></span>' + text + "</label>";
}

// My PWD discount toggle and the heavy load toggle.
function optionsBlock(g, me) {
  let html = '<div class="options"><h3>My options</h3>';
  html += '<p class="small">PWD discount (show your PWD ID to the driver):</p>';
  for (let i = 0; i < DISCOUNTS.length; i++) {
    if (DISCOUNTS[i].id !== "none") {
      const text = DISCOUNTS[i].label + " (" + Math.round(DISCOUNTS[i].rate * 100) + "% off)";
      html += switchHTML("discount", g, me.discount === DISCOUNTS[i].id, text, DISCOUNTS[i].id);
    }
  }
  html += '<p class="small">Bringing something heavy? Turn this on so the driver knows. The driver sets the load fee (up to ' +
    money(MAX_LOAD_FEE) + ").</p>";
  html += switchHTML("heavy", g, me.heavyLoad, "I'm bringing a heavy load", "");
  html += "</div>";
  return html;
}

// Only change the page when the HTML is different (so the page does not flicker every second).
const lastHtml = {};
function show(box, html) {
  if (lastHtml[box.id] !== html) {
    lastHtml[box.id] = html;
    box.innerHTML = html;
  }
}

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

// ---------- The card for the group I am in ----------
function mineHTML(g) {
  const n = g.members.length;
  const me = findMember(g, user.email);
  const info = routeInfo(g);

  if (g.status === "done") {
    return '<div class="card center">' +
      '<div class="check">&#10003;</div>' +
      "<h1>All set</h1>" +
      "<p>Trip finished. Thanks for riding with Sabay-Tayo.</p>" +
      trackerHTML(g.status) +
      info +
      fareTable(g, true) +
      fareBreakdownHTML(g, me) +
      reportButton(g) +
      '<button class="btn" data-act="seen" data-id="' + g.id + '">Back to groups</button>' +
      "</div>";
  }

  if (inTrip(g)) {
    let heading = "Driver accepted";
    let options = optionsBlock(g, me);
    if (g.status === "ontrip") {
      heading = "On the way";
      options = "";
    }
    return '<div class="card center">' +
      "<h1>" + heading + "</h1>" +
      '<div class="banner">Driver ' + esc(g.driverName) + ", plate " + esc(g.driverPlate) + "</div>" +
      trackBlock(g) +
      info +
      options +
      fareTable(g, true) +
      fareBreakdownHTML(g, me) +
      '<p class="small">The driver can still add a load fee or an extra distance fee before the trip ends.</p>' +
      reportButton(g) +
      "</div>";
  }

  if (g.status === "full" || g.status === "ready") {
    let heading = "Group ready";
    let bannerText = "Everyone agreed to leave now.";
    if (g.status === "full") {
      heading = "Group full";
      bannerText = "Group full.";
    }
    return '<div class="card">' +
      "<h1>" + heading + "</h1>" +
      qrImage(g) +
      '<p class="small center">Show this QR code to the driver at the terminal. The driver scans it to see your group.</p>' +
      '<div class="banner red">' + bannerText + " Head to the terminal.</div>" +
      trackBlock(g) +
      info +
      optionsBlock(g, me) +
      fareBreakdownHTML(g, me) +
      ratesHTML() +
      "</div>";
  }

  // Still waiting for members: show the "leave now" poll.
  const votes = [];
  const allVotes = g.votes || [];
  for (let i = 0; i < allVotes.length; i++) {
    if (findMember(g, allVotes[i])) {
      votes.push(allVotes[i]);
    }
  }
  const voted = votes.indexOf(user.email) !== -1;

  let plural = "";
  if (n > 1) {
    plural = "s";
  }
  let pollButton = "";
  if (voted) {
    pollButton = '<p class="msg">You voted to go. Waiting for the others.</p>' +
      '<button class="btn light line" data-act="unvote" data-id="' + g.id + '">Undo vote</button>';
  } else {
    pollButton = '<button class="btn green" data-act="vote" data-id="' + g.id + '">Yes, leave now</button>';
  }
  const poll = '<div class="poll">' +
    "<h3>Leave now with " + n + " passenger" + plural + "?</h3>" +
    '<p class="small">Do not want to wait for more passengers? If everyone in the group agrees, a driver can pick you up now, even if the group is not full.</p>' +
    "<p><strong>" + votes.length + "/" + n + " agreed</strong></p>" +
    pollButton +
    "</div>";

  let cancelText = "Leave group";
  if (g.creatorEmail === user.email) {
    cancelText = "Cancel group";
  }

  return '<div class="card center">' +
    "<h1>Waiting for members</h1>" +
    '<p class="small">Group code #' + esc(g.code) + "</p>" +
    qrImage(g) +
    "<p><strong>" + n + "/4 members joined</strong> (updates live)</p>" +
    "<p>" + avatars(g) + "</p>" +
    trackBlock(g) +
    info +
    optionsBlock(g, me) +
    fareBreakdownHTML(g, me) +
    '<p class="small">Your share changes when more passengers join.</p>' +
    poll +
    '<button class="btn red" data-act="cancel" data-id="' + g.id + '">' + cancelText + "</button>" +
    "</div>";
}

// ---------- One card in the list of open groups ----------
function groupCard(g) {
  const n = g.members.length;
  let cardClass = "ready";
  let badgeClass = "";
  let badgeText = "Joinable";
  if (n >= 3) {
    cardClass = "waiting";
    badgeClass = "urgent";
    badgeText = "Urgent";
  }
  return '<article class="card ' + cardClass + '">' +
    '<div class="row"><strong>' + esc(g.destination) + '</strong><span class="badge ' + badgeClass + '">' + badgeText + "</span></div>" +
    '<p class="small">Group ' + esc(tag(g)) + "<br>From " + esc(g.origin) + ", leaves " + time12(g.depart) + "</p>" +
    '<div class="row"><span>' + avatars(g) + '</span><span class="small">' + n + "/4 members</span></div>" +
    '<p class="small">' + money(g.fare / (n + 1)) + " each if you join</p>" +
    '<button class="btn full" data-act="join" data-id="' + g.id + '">Join group</button>' +
    "</article>";
}

// ---------- Decide what to show ----------
function findMine() {
  for (let i = 0; i < data.length; i++) {
    const g = data[i];
    if (!findMember(g, user.email)) {
      continue;
    }
    const live = g.status === "open" || g.status === "full" || g.status === "ready" || inTrip(g);
    const doneNotSeen = showFinished(g, user.email);
    if (live || doneNotSeen) {
      return g;
    }
  }
  return null;
}

function draw() {
  const now = Date.now();
  const mine = findMine();

  mineBox.hidden = !mine;
  browseBox.hidden = mine !== null || creating;
  formBox.hidden = mine !== null || !creating;

  if (mine) {
    show(mineBox, mineHTML(mine));
    return;
  }

  let html = "";
  for (let i = 0; i < data.length; i++) {
    if (data[i].status === "open" && data[i].departAt > now) {
      html += groupCard(data[i]);
    }
  }
  if (html === "") {
    html = '<div class="card empty-card"><p>No groups available right now.</p></div>';
  }
  show(listBox, html);
}

// ---------- Buttons ----------
// Clicks can land on a shape inside the QR picture, so walk up until we find the element with data-act.
function findActionElement(el) {
  while (el && el !== document.body) {
    if (el.dataset && el.dataset.act) {
      return el;
    }
    el = el.parentNode;
  }
  return null;
}

document.body.addEventListener("click", async function (e) {
  const target = findActionElement(e.target);
  if (!target) {
    return;
  }
  const act = target.dataset.act;
  const id = target.dataset.id;

  try {
    if (act === "join") {
      await joinGroup(id, user);
    } else if (act === "vote") {
      await voteGo(id, user, true);
    } else if (act === "unvote") {
      await voteGo(id, user, false);
    } else if (act === "cancel") {
      const group = findGroup(id);
      if (group.creatorEmail === user.email) {
        await cancelGroup(id);
      } else {
        await leaveGroup(id, user);
      }
    } else if (act === "enlarge") {
      qrBig = !qrBig;
      draw();
    } else if (act === "seen") {
      await markSeen(id, user.email);
    } else if (act === "report") {
      const text = prompt("What happened?");
      if (text) {
        await addDoc(collection(db, "reports"), {
          groupId: id,
          by: user.email,
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

// The toggle switches (discount and heavy load)
document.body.addEventListener("change", async function (e) {
  const act = e.target.dataset.act;
  const id = e.target.dataset.id;
  try {
    if (act === "discount") {
      let value = "none";
      if (e.target.checked) {
        value = e.target.dataset.d;
      }
      await updateMember(id, user.email, "discount", value);
    } else if (act === "heavy") {
      await updateMember(id, user.email, "heavyLoad", e.target.checked);
    }
  } catch (error) {
    alert(error.message);
    draw();
  }
});

document.getElementById("open").addEventListener("click", function () {
  creating = true;
  // suggest a time 30 minutes from now
  timeInput.value = new Date(Date.now() + 30 * 60000).toTimeString().slice(0, 5);
  draw();
});

document.getElementById("cancelform").addEventListener("click", function () {
  creating = false;
  draw();
});

document.getElementById("form").addEventListener("submit", async function (e) {
  e.preventDefault();
  const origin = gateSelect.value;
  const dest = destSelect.value;
  const t = timeInput.value;

  if (t === "") {
    msgText.textContent = "Pick a departure time.";
    return;
  }
  const parts = t.split(":");
  const leaveAt = new Date();
  leaveAt.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  if (leaveAt.getTime() <= Date.now()) {
    msgText.textContent = "Pick a time later than now.";
    return;
  }
  msgText.textContent = "";

  await addDoc(groups, {
    origin: origin,
    destination: dest,
    fare: getFare(origin, dest),
    code: "A" + (1 + Math.floor(Math.random() * 99)) + "-" + CODES[dest],
    depart: t,
    departAt: leaveAt.getTime(),
    creatorEmail: user.email,
    members: [newMember(user)],
    status: "open",
    createdAt: serverTimestamp()
  });
  creating = false;
  draw();
});
