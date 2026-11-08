// Makes the website installable: registers the service worker and powers the "Install app" button.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js");
  });
}

const installButton = document.getElementById("install");
let installEvent = null;

// The browser says the app can be installed: show the button.
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  installEvent = e;
  if (installButton) {
    installButton.hidden = false;
  }
});

if (installButton) {
  installButton.addEventListener("click", async function () {
    if (!installEvent) {
      return;
    }
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    installButton.hidden = true;
  });
}

window.addEventListener("appinstalled", function () {
  if (installButton) {
    installButton.hidden = true;
  }
});
