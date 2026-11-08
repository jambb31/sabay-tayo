// Log in / sign up page
import { photoData, watchUser, signUp, logIn, getParam, STUDENT_DOMAIN, ADMIN_EMAIL, HOME } from "./app.js";

const tabIn = document.getElementById("tabin");
const tabUp = document.getElementById("tabup");
const form = document.getElementById("form");
const upOnly = document.getElementById("upOnly");
const plateBox = document.getElementById("plateBox");
const title = document.getElementById("title");
const sub = document.getElementById("sub");
const goButton = document.getElementById("go");
const emailInput = document.getElementById("email");
const msg = document.getElementById("msg");

let signingUp = false;

// Friendly messages for common Firebase errors
const errors = {
  "auth/email-already-in-use": "That email already has an account. Try logging in.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/operation-not-allowed": "Turn on Email/Password in Firebase Authentication.",
  "auth/network-request-failed": "No internet connection."
};

function getRole() {
  return document.querySelector("[name=role]:checked").value;
}

// QR scans come back here: after logging in, go to your own page and keep the ?group=... part,
// so the scanned room opens right away (a driver is sent to driver.html, a passenger to student.html).
function goHome(profile) {
  const next = getParam("next");
  let query = "";
  if (next && next.indexOf("?") !== -1) {
    query = next.slice(next.indexOf("?"));
  }
  location.href = HOME[profile.role] + query;
}

// Only passengers need a TSU student email, so only they get that hint.
function updatePlaceholder() {
  if (signingUp && getRole() === "student") {
    emailInput.placeholder = "name@student.tsu.edu.ph";
  } else {
    emailInput.placeholder = "name@email.com";
  }
}

function setMode(isSignUp) {
  signingUp = isSignUp;
  upOnly.hidden = !isSignUp;
  msg.textContent = "";
  if (isSignUp) {
    title.textContent = "Sign up";
    goButton.textContent = "Sign up";
    sub.textContent = "Create an account to start sharing rides.";
    tabIn.className = "";
    tabUp.className = "on";
  } else {
    title.textContent = "Log in";
    goButton.textContent = "Log in";
    sub.textContent = "Welcome back to Sabay-Tayo.";
    tabIn.className = "on";
    tabUp.className = "";
  }
  updatePlaceholder();
}

tabIn.addEventListener("click", function () {
  setMode(false);
});

tabUp.addEventListener("click", function () {
  setMode(true);
});

const roleButtons = document.getElementsByName("role");
for (let i = 0; i < roleButtons.length; i++) {
  roleButtons[i].addEventListener("change", function () {
    plateBox.hidden = getRole() !== "driver";
    updatePlaceholder();
  });
}

// Already logged in: skip this page.
async function checkLoggedIn() {
  const profile = await watchUser();
  if (profile) {
    goHome(profile);
  }
}
checkLoggedIn();

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  msg.textContent = "";

  const mail = emailInput.value.trim().toLowerCase();
  const password = document.getElementById("pw").value;

  if (mail.indexOf("@") === -1) {
    msg.textContent = "Enter a valid email.";
    return;
  }
  if (password.length < 8) {
    msg.textContent = "Password needs at least 8 characters.";
    return;
  }

  try {
    if (signingUp) {
      const name = document.getElementById("fullname").value.trim();
      const plate = document.getElementById("plate").value.trim();
      const licenseFile = document.getElementById("lic").files[0];
      const role = getRole();
      const isAdmin = mail === ADMIN_EMAIL;

      if (name === "") {
        msg.textContent = "Enter your full name.";
        return;
      }
      if (role === "driver" && !isAdmin && plate === "") {
        msg.textContent = "Enter your tricycle plate or body number.";
        return;
      }
      if (role === "driver" && !isAdmin && !licenseFile) {
        msg.textContent = "Upload a photo of your driver's license.";
        return;
      }
      if (role === "student" && !isAdmin && !mail.endsWith(STUDENT_DOMAIN)) {
        msg.textContent = "Passengers must use an " + STUDENT_DOMAIN + " email.";
        return;
      }

      let photo = null;
      if (licenseFile) {
        photo = await photoData(licenseFile);
      }
      await signUp(name, mail, password, role, plate, photo);
    } else {
      await logIn(mail, password);
    }
    goHome(await watchUser());
  } catch (error) {
    if (errors[error.code]) {
      msg.textContent = errors[error.code];
    } else {
      msg.textContent = error.message;
    }
  }
});
