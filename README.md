# Sabay-Tayo setup notes

## 1. Publish the website first (needed for QR codes and the app install)
The QR codes must open on OTHER phones, so the site has to be online.
1. Put the whole folder on https hosting. Free options: Firebase Hosting, GitHub Pages, Netlify.
2. Open app.js and set SITE_URL to your address WITH a slash at the end, for example:
       export const SITE_URL = "https://sabay-tayo.web.app/";
3. Re-upload. Then scan a QR code with a phone to test it.
While you test on your own computer, leave SITE_URL as "" (a red "Testing mode" note shows under the QR).

## 2. Firestore rules
Paste firestore.rules into Firebase console -> Firestore Database -> Rules, try it in the
Rules Playground, then Publish. It keeps license photos private and lets only the admin verify drivers.
Create the admin account (admin@sabaytayo.com) FIRST.

## 3. Numbers to confirm with your professor (all in app.js)
- FARE_MATRIX    fixed TOTAL fare per tricycle for each gate + destination. Campus to campus is PHP 80
                 (PHP 20 x 4 students). Farther places cost more. All numbers are placeholders.
                 A route left out of the matrix (like Main Gate to Main Campus) is not offered.
- DISCOUNTS      PWD rate only (20% is a placeholder). Only students ride, so no student or senior discount
- FEE_PER_KM, MAX_LOAD_FEE, MAX_EXTRA_KM

## 4. How the QR code works
- qr.js makes the QR code inside the browser. No internet and no outside website are needed.
- The passenger's QR holds a link like  .../student.html?group=ID.  Whoever scans it with the normal
  phone camera logs in if asked, and the room opens with its full details. A passenger sees a Join
  group button. A driver is sent on to driver.html with the same room and sees an Accept group button.
- In the list of groups, tapping a card opens the same full view. The button on the card still
  joins (or accepts) right away.
- Tap the QR on the passenger screen to make it bigger. Keep the phone brightness high.

## 5. Install as an app (PWA)
- Android / Chrome / Edge: tap "Install app" in the header.
- iPhone (Safari): Share button, then "Add to Home Screen".
- When you change any file, change CACHE = "sabay-tayo-v8" in sw.js to v9, v10, ... so phones update.
