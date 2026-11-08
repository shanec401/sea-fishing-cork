# 🎣 Cork Shore Angler — County Cork Sea Fishing Marks, Live Tides, Solunar & Anglers Forum

**Cork Shore Angler** is a specialized sea fishing web application built exclusively for shore anglers across **County Cork, Ireland**. It combines an interactive coastal directory of 23 shore marks, real-time marine weather, localized tide curves, astronomical solunar feeding windows, automated coastal safety warnings, and a **Members-Only Cork Anglers Forum** powered by **Firebase Authentication** and **Cloud Firestore** on **GitHub Pages**.

---

## ✨ Core Features & Capabilities

### 1. 🗺️ County Cork Shore Location Directory & Interactive Map
Interactive **Leaflet Map** and categorized venue cards across all 5 coastal regions of County Cork:
- **East Cork**: Youghal Dyke Wall & Pier, Garryvoe Beach, Ballycotton Pier & Harbour, Ballybranigan Strand, and Ballycroneen Strand.
- **Cork Harbour**: Monkstown Pier, Aghada Pier & Rostellan, Roches Point, Cobh Deepwater Quay, White Bay, and Inch Beach.
- **Kinsale & South Cork**: Garretstown Strand, Sandycove, Old Head of Kinsale Access Points, and Bandon Estuary.
- **West Cork**: Inchydoney Strand, The Warren (Rosscarbery), Baltimore Pier & Harbour, Courtmacsherry Pier & Strand, and Barleycove Beach.
- **Beara & Mizen Peninsulas**: Ballydonegan Strand (Allihies), Dursey Sound Rock Marks, and Crookhaven Pier.

### 2. 🌊 Real-Time Marine & Astronomical Dashboard
- **Live Tide Tables & 24-Hour SVG Tidal Curve**: Localized high/low tide times, real-time tide stage (`Flooding`, `High Water Slack`, `Ebbing`, `Low Water Slack`), and **Spring/Neap** tidal coefficient indicators for **Cobh**, **Ballycotton**, **Youghal**, **Kinsale**, **Baltimore**, and **Castletownbere**.
- **Moon Phase & Solunar Bite Predictions**: Daily lunar phase, illumination %, moonrise/moonset times, **2-hour Major & 1-hour Minor Solunar Feeding Windows**, and a `1–5` Solunar Bite Rating.
- **Sun Schedule**: Daily First Light (Dawn), Sunrise, Sunset, and Last Light (Dusk) times calculated for County Cork (`51.85°N, -8.47°W`).
- **Live Marine Weather Forecast (Open-Meteo Marine & Weather APIs)**: Real-time wind speed/direction/gusts, barometric pressure (hPa) & 3-hour trend, wave height, swell period/direction, sea surface temperature (`°C`), and a 12-hour forecast table.

### 3. 🐟 Location Profiles & Spot Insights
Every shore mark includes:
- **Target Species & Seasonal Availability**: Bass, Painted/Thornback Ray, Codling, Pollack, Mackerel, Flounder, Turbot, Ballan Wrasse, Conger Eel, Gilthead Bream, Mullet, and Sea Trout.
- **Recommended Bait & Rig Tactics**: Local bait-digging notes (including digging blow lug & ragworm at **Rostellan mudflats** at low water) and tailored rig recommendations (3-hook flappers, pulley pennels, sliding floats, lures).
- **Best Tidal Window & Wind Direction**: Specific guidance on whether to fish the flooding tide, slack water, or ebb, plus 1-click Google Maps directions.

### 4. ⚠️ Safety & Coastal Warnings Engine
- **Rising Tide Cut-Off Alerts**: Dedicated warnings on marks where flooding gullies, sandbars, or rock ledges cut off access (e.g., *Garryvoe*, *Garretstown*, *Sandycove Island spit*, *Courtmacsherry banks*, *Roches Point*), with active banners when the tide is flooding.
- **Swell & Atlantic Gales Monitor**: Automatically compares live wind speed and Atlantic swell height/period against each mark's safe threshold—flagging exposed rock marks like **Dursey Sound**, **Old Head of Kinsale**, and **Roches Point** when heavy groundswell makes rock ledges unsafe.

### 5. 💬 Members-Only County Cork Anglers Forum & Admin Subject Approval
- **Protected by Login**: Visitors who are not signed in see a **Members-Only Forum Lock** screen. Only signed-in users can read approved threads and post replies.
- **Admin Subject Approval Workflow**: When a member submits a new forum subject, it is created with `status: "pending"` and remains hidden from the public forum until the **Admin** approves it (`status: "approved"`).
- **Topic Categories & Mark Filtering**: Filter discussions by `📍 Fishing Marks & Venue Tips`, `🐟 Catch Reports & Sessions`, `🪱 Bait, Rigs & Lure Tactics`, or `⚠️ Swell, Weed & Safety Alerts`—or filter by any of the 23 County Cork fishing marks!
- **Exclusive Admin Control Center**: The **🛡️ Admin** tab is **completely hidden for all non-admin users** and only appears when your verified Admin account (`/admins/{uid}`) is signed in. Only the Admin can:
  1. **Approve or Reject** submitted forum subjects (`⏳ Pending Forum Subjects Awaiting Admin Approval`).
  2. **Add new County Cork fishing marks** or delete custom marks (`/cork_marks/{markId}`).
  3. **Pin or Delete** existing forum threads.

---

## 🚀 Step-by-Step Deployment Guide (GitHub Pages + Firebase)

### Step 1: Upload to a New GitHub Repository
1. Create a new public repository on GitHub (e.g., `cork-shore-angler`).
2. Click **Add file** &rarr; **Upload files**, and drag and drop all files from `C:\Users\Shane\.gemini\antigravity\scratch\cork-shore-angler`:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `cork-data.js`
   - `marine-api.js`
   - `firebase-config.js`
   - `firestore.rules`
   - `README.md`
3. Click **Commit changes**.
4. Go to **Settings** &rarr; **Pages**, set **Source** to **Deploy from a branch** &rarr; **`main`** (`/root`), and click **Save**.

### Step 2: Update Firebase Firestore Security Rules
`firebase-config.js` is already pre-configured with your `sports-results-dcfb6` Firebase project so **your existing login and Admin UID work immediately**!
To enable the new `cork_marks`, `forum_topics`, and `forum_replies` collections in your Firebase project (without affecting ArenaPick):
1. Open your **[Firebase Firestore Rules Editor](https://console.firebase.google.com/project/sports-results-dcfb6/firestore/rules)**.
2. Copy the contents of [`firestore.rules`](./firestore.rules) (which includes rules for **both** Cork Shore Angler and ArenaPick) and click **Publish**.
