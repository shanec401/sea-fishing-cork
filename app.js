// ============================================================================
// CORK SHORE ANGLER — MAIN APPLICATION CONTROLLER
// ============================================================================

import {
  getActiveFirebaseConfig,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig,
  isFirebaseConfigured
} from "./firebase-config.js";

import {
  CORK_REGIONS,
  CORK_TIDE_STATIONS,
  CORK_SHORE_MARKS,
  FORUM_CATEGORIES,
  STARTER_FORUM_TOPICS,
  STARTER_FORUM_REPLIES,
  getRegionById,
  getTideStationById,
  getMarkById
} from "./cork-data.js?v=4";

import {
  fetchLiveCorkMarineAndWeather,
  calculateAstronomicalAndSolunar,
  calculateCorkTidesForDate,
  fetchOfficialMarineInstituteTides,
  evaluateMarkSafety
} from "./marine-api.js?v=4";

const state = {
  selectedRegionId: "ALL",
  selectedMarkType: "ALL",
  searchQuery: "",
  activeMarkId: CORK_SHORE_MARKS[1].id, // Garryvoe Beach default
  activeStationId: "cobh",
  selectedDate: new Date().toISOString().slice(0, 10),
  marks: structuredClone(CORK_SHORE_MARKS),
  marineData: null,
  tideData: null,
  astroData: null,
  forumCategoryFilter: "ALL",
  forumMarkFilter: "ALL",
  activeTopicId: null,
  topics: structuredClone(STARTER_FORUM_TOPICS),
  replies: structuredClone(STARTER_FORUM_REPLIES),
  authMode: "login",
  user: null,
  isAdmin: false,
  firebaseReady: false,
  fbAuth: null,
  fbDb: null,
  fbModules: null,
  leafletMap: null,
  leafletMarkers: new Map()
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  loadLocalState();
  initSelectorsAndDate();
  recalculateTidesAndAstro();
  bindUIEvents();
  renderAll();
  initLeafletMapWhenReady();
  await refreshLiveMarineTelemetry();
  await initFirebaseIfConfigured();
});

function loadLocalState() {
  try {
    const raw = localStorage.getItem("cork_shore_angler_state_v1");
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.customMarks) && saved.customMarks.length > 0) {
        const map = new Map();
        [...CORK_SHORE_MARKS, ...saved.customMarks].forEach((m) => map.set(m.id, m));
        state.marks = Array.from(map.values());
      }
      if (Array.isArray(saved.topics) && saved.topics.length > 0) {
        state.topics = saved.topics;
      }
      if (Array.isArray(saved.replies) && saved.replies.length > 0) {
        state.replies = saved.replies;
      }
      if (saved.activeMarkId && getMarkById(saved.activeMarkId, state.marks)) {
        state.activeMarkId = saved.activeMarkId;
      }
    }
  } catch (e) {
    console.warn("Local state load note:", e);
  }
}

function saveLocalState() {
  try {
    const customMarks = state.marks.filter((m) => m.isCustom);
    localStorage.setItem(
      "cork_shore_angler_state_v1",
      JSON.stringify({
        activeMarkId: state.activeMarkId,
        customMarks,
        topics: state.topics,
        replies: state.replies
      })
    );
  } catch (e) {
    console.warn("Local state save note:", e);
  }
}

function initSelectorsAndDate() {
  const dateInput = document.getElementById("activeDateInput");
  if (dateInput) {
    dateInput.value = state.selectedDate;
  }

  const stationSelect = document.getElementById("activeStationSelect");
  if (stationSelect) {
    stationSelect.innerHTML = "";
    CORK_TIDE_STATIONS.forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st.id;
      opt.textContent = st.name;
      stationSelect.appendChild(opt);
    });
    stationSelect.value = state.activeStationId;
  }

  populateMarkDropdowns();
}

function populateMarkDropdowns() {
  const forumMarkSelect = document.getElementById("forumMarkFilterSelect");
  const topicMarkSelect = document.getElementById("topicMarkSelect");

  if (forumMarkSelect) {
    const currentVal = forumMarkSelect.value || "ALL";
    forumMarkSelect.innerHTML = `<option value="ALL">All County Cork Marks (${state.marks.length})</option>`;
    state.marks.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.regionName})`;
      forumMarkSelect.appendChild(opt);
    });
    forumMarkSelect.value = currentVal;
  }

  if (topicMarkSelect) {
    topicMarkSelect.innerHTML = `<option value="">-- General County Cork --</option>`;
    state.marks.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.regionName})`;
      topicMarkSelect.appendChild(opt);
    });
  }
}

function getActiveMark() {
  return getMarkById(state.activeMarkId, state.marks) || state.marks[0];
}

function recalculateTidesAndAstro() {
  const station = getTideStationById(state.activeStationId);
  state.astroData = calculateAstronomicalAndSolunar(
    state.selectedDate,
    station.lat,
    station.lng
  );
  state.tideData = calculateCorkTidesForDate(station, state.selectedDate);
  syncOfficialMarineInstituteTides(station, state.selectedDate);
}

async function syncOfficialMarineInstituteTides(station, dateStr) {
  try {
    const officialTide = await fetchOfficialMarineInstituteTides(station, dateStr);
    if (
      station.id === state.activeStationId &&
      dateStr === state.selectedDate &&
      officialTide
    ) {
      state.tideData = officialTide;
      renderHeroTelemetry();
      renderGlobalSafetyBanner();
      renderMarineDashboard();
      renderSafetyTab();
    }
  } catch (e) {
    console.warn("Official tide sync note:", e);
  }
}

async function refreshLiveMarineTelemetry() {
  const activeMark = getActiveMark();
  const lat = activeMark ? activeMark.lat : 51.8292;
  const lng = activeMark ? activeMark.lng : -8.0008;
  const station = getTideStationById(state.activeStationId);

  const [marine, officialTide] = await Promise.all([
    fetchLiveCorkMarineAndWeather(lat, lng),
    fetchOfficialMarineInstituteTides(station, state.selectedDate)
  ]);

  state.marineData = marine;
  if (officialTide) state.tideData = officialTide;

  renderHeroTelemetry();
  renderGlobalSafetyBanner();
  renderActiveMarkSpotlight();
  renderMarineDashboard();
  renderSafetyTab();
}

// ============================================================================
// FIREBASE AUTH & FIRESTORE CLOUD SYNC
// ============================================================================

async function initFirebaseIfConfigured() {
  const config = getActiveFirebaseConfig();
  updateCloudBadge(false);

  if (!isFirebaseConfigured(config)) {
    renderAll();
    return;
  }

  try {
    const [appMod, authMod, firestoreMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    ]);

    const app = appMod.initializeApp(config, "cork-shore-angler-app");
    const auth = authMod.getAuth(app);
    const db = firestoreMod.getFirestore(app);

    state.fbAuth = auth;
    state.fbDb = db;
    state.firebaseReady = true;
    state.fbModules = { ...authMod, ...firestoreMod };

    updateCloudBadge(true);
    await syncFromFirestore();

    authMod.onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        state.user = {
          uid: fbUser.uid,
          displayName:
            fbUser.displayName ||
            (fbUser.email ? fbUser.email.replace("@corkangler.user", "") : "Cork Angler"),
          email: fbUser.email || "",
          isCloud: true
        };
        await checkAdminStatus();
        await syncFromFirestore();
        renderAll();
      } else {
        state.user = null;
        state.isAdmin = false;
        renderAll();
      }
    });
  } catch (err) {
    console.error("Firebase initialization error:", err);
    updateCloudBadge(false);
  }
}

async function syncFromFirestore() {
  if (!state.firebaseReady || !state.fbDb) return;
  const { collection, getDocs } = state.fbModules;

  try {
    // 1. Public custom Cork marks
    const marksSnap = await getDocs(collection(state.fbDb, "cork_marks"));
    if (!marksSnap.empty) {
      const cloudMarks = [];
      marksSnap.forEach((d) => cloudMarks.push({ id: d.id, ...d.data() }));
      const map = new Map();
      [...CORK_SHORE_MARKS, ...cloudMarks].forEach((m) => {
        if (!m.deleted) map.set(m.id, m);
      });
      state.marks = Array.from(map.values());
      populateMarkDropdowns();
      syncLeafletMarkers();
    }

    // 2. Members-only Forum Topics & Replies (only fetched when signed in)
    if (state.user) {
      const topicsSnap = await getDocs(collection(state.fbDb, "forum_topics"));
      if (!topicsSnap.empty) {
        const cloudTopics = [];
        topicsSnap.forEach((d) => cloudTopics.push({ id: d.id, ...d.data() }));
        const tMap = new Map();
        [...STARTER_FORUM_TOPICS, ...cloudTopics].forEach((t) => {
          if (!t.deleted) tMap.set(t.id, t);
          else tMap.delete(t.id);
        });
        state.topics = Array.from(tMap.values());
      }

      const repliesSnap = await getDocs(collection(state.fbDb, "forum_replies"));
      if (!repliesSnap.empty) {
        const cloudReplies = [];
        repliesSnap.forEach((d) => cloudReplies.push({ id: d.id, ...d.data() }));
        const rMap = new Map();
        [...STARTER_FORUM_REPLIES, ...cloudReplies].forEach((r) => {
          if (!r.deleted) rMap.set(r.id, r);
        });
        state.replies = Array.from(rMap.values());
      }
    }

    saveLocalState();
  } catch (err) {
    console.warn("Firestore sync note:", err);
  }
}

async function checkAdminStatus() {
  const uidEl = document.getElementById("currentUserUidDisplay");
  if (!state.user) {
    if (uidEl) uidEl.textContent = "Not signed in";
    state.isAdmin = false;
    return;
  }
  if (uidEl) uidEl.textContent = state.user.uid;

  if (state.firebaseReady && state.fbDb && state.user.isCloud) {
    try {
      const { doc, getDoc } = state.fbModules;
      const snap = await getDoc(doc(state.fbDb, "admins", state.user.uid));
      state.isAdmin = snap.exists();
    } catch (e) {
      state.isAdmin = false;
    }
  }
}

function updateCloudBadge(isOnline) {
  const dot = document.getElementById("cloudStatusDot");
  const text = document.getElementById("cloudStatusText");
  if (!dot || !text) return;
  if (isOnline) {
    dot.className = "status-dot online";
    text.textContent = "Firebase Connected";
  } else {
    dot.className = "status-dot offline";
    text.textContent = "Local / Setup DB";
  }
}

// ============================================================================
// INTERACTIVE LEAFLET MAP OF COUNTY CORK
// ============================================================================

function initLeafletMapWhenReady() {
  const checkInterval = setInterval(() => {
    if (window.L && document.getElementById("corkLeafletMap")) {
      clearInterval(checkInterval);
      createLeafletMap();
    }
  }, 120);
}

function createLeafletMap() {
  const container = document.getElementById("corkLeafletMap");
  if (!container || state.leafletMap) return;

  const map = window.L.map(container, {
    center: [51.72, -8.68],
    zoom: 9,
    scrollWheelZoom: true
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors | Cork Shore Angler"
  }).addTo(map);

  state.leafletMap = map;
  syncLeafletMarkers();
}

function syncLeafletMarkers() {
  if (!state.leafletMap || !window.L) return;

  state.leafletMarkers.forEach((marker) => marker.remove());
  state.leafletMarkers.clear();

  const filteredMarks = getFilteredMarks();

  filteredMarks.forEach((mark) => {
    const region = getRegionById(mark.regionId);
    const isSelected = mark.id === state.activeMarkId;

    const marker = window.L.circleMarker([mark.lat, mark.lng], {
      radius: isSelected ? 11 : 8,
      fillColor: region.color,
      color: isSelected ? "#ffffff" : "#07111e",
      weight: isSelected ? 3 : 2,
      opacity: 1,
      fillOpacity: 0.92
    }).addTo(state.leafletMap);

    marker.bindTooltip(
      `<strong>${escapeHtml(mark.name)}</strong><br/><span>${escapeHtml(mark.regionName)} • ${escapeHtml(mark.type)}</span>`,
      { direction: "top", offset: [0, -6] }
    );

    marker.on("click", () => {
      selectCorkMark(mark.id, true);
    });

    state.leafletMarkers.set(mark.id, marker);
  });
}

async function selectCorkMark(markId, panMap = true) {
  const mark = getMarkById(markId, state.marks);
  if (!mark) return;

  state.activeMarkId = mark.id;
  if (mark.tideStationId && mark.tideStationId !== state.activeStationId) {
    state.activeStationId = mark.tideStationId;
    const stationSelect = document.getElementById("activeStationSelect");
    if (stationSelect) stationSelect.value = mark.tideStationId;
    recalculateTidesAndAstro();
  }

  saveLocalState();
  syncLeafletMarkers();

  if (panMap && state.leafletMap) {
    state.leafletMap.flyTo([mark.lat, mark.lng], Math.max(state.leafletMap.getZoom(), 11), {
      duration: 0.6
    });
  }

  renderAll();
  await refreshLiveMarineTelemetry();
}

// ============================================================================
// MASTER RENDERING
// ============================================================================

function renderAll() {
  renderRegionsRibbon();
  renderHeroTelemetry();
  renderGlobalSafetyBanner();
  renderActiveMarkSpotlight();
  renderMarksDirectoryGrid();
  renderMarineDashboard();
  renderSafetyTab();
  renderForumTab();
  renderAdminTab();
  renderAuthUI();
}

function renderRegionsRibbon() {
  const bar = document.getElementById("regionsFilterBar");
  if (!bar) return;
  bar.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = `region-chip ${state.selectedRegionId === "ALL" ? "active" : ""}`;
  allBtn.textContent = `🗺️ All County Cork (${state.marks.length} Marks)`;
  allBtn.addEventListener("click", () => {
    state.selectedRegionId = "ALL";
    syncLeafletMarkers();
    if (state.leafletMap) state.leafletMap.flyTo([51.72, -8.68], 9, { duration: 0.6 });
    renderAll();
  });
  bar.appendChild(allBtn);

  CORK_REGIONS.forEach((region) => {
    const count = state.marks.filter((m) => m.regionId === region.id).length;
    const chip = document.createElement("button");
    chip.className = `region-chip ${state.selectedRegionId === region.id ? "active" : ""}`;
    chip.textContent = `${region.emoji} ${region.name} (${count})`;
    chip.addEventListener("click", () => {
      state.selectedRegionId = region.id;
      const firstMark = state.marks.find((m) => m.regionId === region.id);
      if (firstMark) {
        selectCorkMark(firstMark.id, true);
      } else {
        syncLeafletMarkers();
        renderAll();
      }
    });
    bar.appendChild(chip);
  });
}

function renderHeroTelemetry() {
  const tide = state.tideData;
  const astro = state.astroData;
  const marine = state.marineData;

  if (tide) {
    document.getElementById("heroTideState").textContent =
      `${tide.currentStageLabel} (${tide.currentHeightM}m)`;
    document.getElementById("heroNextTide").textContent = tide.nextEvent
      ? `Next ${tide.nextEvent.type}: ${tide.nextEvent.timeStr} (${tide.nextEvent.heightM}m)`
      : tide.springNeapStatus;
  }

  if (astro) {
    document.getElementById("heroSolunarScore").textContent =
      `${astro.solunarScore} / 5 🐟 (${astro.solunarPct}%)`;
    document.getElementById("heroMoonPhase").textContent =
      `${astro.phaseEmoji} ${astro.phaseName} (${astro.illuminationPct}%)`;
  }

  if (marine) {
    document.getElementById("heroWindWave").textContent =
      `${marine.windSpeedKmh} km/h ${marine.windCompass} • ${marine.waveHeightM}m Swell`;
    document.getElementById("heroPressure").textContent =
      `${marine.pressureHpa} hPa • Sea ${marine.seaTempC}°C`;
  }
}

function renderGlobalSafetyBanner() {
  const banner = document.getElementById("globalSafetyBanner");
  if (!banner) return;

  const mark = getActiveMark();
  if (!mark) return;

  const safety = evaluateMarkSafety(mark, state.marineData, state.tideData);
  banner.className = `safety-banner level-${safety.overallLevel}`;

  if (safety.warnings.length === 0) {
    banner.innerHTML = `
      <div>
        <strong>🟢 SAFE COASTAL CONDITIONS AT ${escapeHtml(mark.name.toUpperCase())}:</strong>
        Winds (${state.marineData?.windSpeedKmh ?? 18} km/h ${state.marineData?.windCompass ?? "SW"}) and swell (${state.marineData?.waveHeightM ?? "1.2"}m) are within safe limits for this mark.
      </div>
      <span class="badge-pill badge-success">No Active Cut-Off or Gale Alerts</span>
    `;
  } else {
    const primary = safety.warnings[0];
    banner.innerHTML = `
      <div>
        <strong>${escapeHtml(primary.title)}:</strong> ${escapeHtml(primary.message)}
      </div>
      <button type="button" class="btn btn-outline btn-sm" id="btnBannerViewSafety">
        ⚠️ View All Cork Alerts (${safety.warnings.length})
      </button>
    `;
    document.getElementById("btnBannerViewSafety")?.addEventListener("click", () => {
      switchTab("safety");
    });
  }
}

function getFilteredMarks() {
  return state.marks.filter((m) => {
    if (state.selectedRegionId !== "ALL" && m.regionId !== state.selectedRegionId) {
      return false;
    }
    if (state.selectedMarkType !== "ALL" && m.type !== state.selectedMarkType) {
      return false;
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      const hay = `${m.name} ${m.regionName} ${m.type} ${m.summary} ${m.targetSpecies.join(" ")} ${m.baitAndTactics}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderActiveMarkSpotlight() {
  const box = document.getElementById("activeMarkSpotlight");
  if (!box) return;

  const mark = getActiveMark();
  if (!mark) return;

  const region = getRegionById(mark.regionId);
  const station = getTideStationById(mark.tideStationId);
  const safety = evaluateMarkSafety(mark, state.marineData, state.tideData);

  const safetyBadgeHtml =
    safety.overallLevel === "danger"
      ? `<span class="badge-pill badge-warn">🔴 High Swell / Gale Warning</span>`
      : safety.overallLevel === "caution"
      ? `<span class="badge-pill badge-gold">⚠️ Cut-Off / Swell Caution</span>`
      : `<span class="badge-pill badge-success">🟢 Safe Conditions</span>`;

  box.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
      <div>
        <span class="badge-pill badge-info">${region.emoji} ${escapeHtml(mark.regionName)} • ${escapeHtml(mark.type)}</span>
        <h2 style="margin-top:6px;">${escapeHtml(mark.name)}</h2>
      </div>
      ${safetyBadgeHtml}
    </div>

    <p class="muted" style="margin-top:6px;">${escapeHtml(mark.summary)}</p>

    <div class="spotlight-section">
      <h4>🐟 Target Species &amp; Seasonal Availability</h4>
      <div class="species-tags">
        ${mark.targetSpecies.map((sp) => `<span class="species-tag">${escapeHtml(sp)}</span>`).join("")}
      </div>
      <p class="muted" style="margin-top:6px; font-size:0.8rem;">${escapeHtml(mark.seasonality)}</p>
    </div>

    <div class="spotlight-section">
      <h4>🪱 Recommended Bait &amp; Rig Tactics</h4>
      <p style="font-size:0.86rem;">${escapeHtml(mark.baitAndTactics)}</p>
    </div>

    <div class="spotlight-section">
      <h4>🌊 Best Tidal Window &amp; Optimal Wind</h4>
      <p style="font-size:0.86rem;"><strong>Best Tide:</strong> ${escapeHtml(mark.bestTidalWindow)}</p>
      <p class="muted" style="font-size:0.81rem; margin-top:3px;"><strong>Ideal Wind:</strong> ${escapeHtml(mark.optimalWind)} • <strong>Ref Station:</strong> ${escapeHtml(station.name)}</p>
    </div>

    <div class="spotlight-section" style="border-color:${mark.cutoffRisk ? "rgba(245,158,11,0.45)" : "rgba(148,163,184,0.16)"};">
      <h4>⚠️ Safety, Cut-Off &amp; Swell Profile</h4>
      <p style="font-size:0.84rem; color:${mark.cutoffRisk ? "#fde68a" : "#cbd5e1"};">
        ${escapeHtml(mark.cutoffWarning)}
      </p>
      <p class="muted" style="font-size:0.79rem; margin-top:4px;">${escapeHtml(mark.safetyNotes)}</p>
    </div>

    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
      <button type="button" class="btn btn-primary btn-sm" id="btnSpotlightOpenForum">
        💬 Forum Topics for ${escapeHtml(mark.name.split(" ")[0])}
      </button>
      <button type="button" class="btn btn-secondary btn-sm" id="btnSpotlightOpenTides">
        🌊 View ${escapeHtml(station.name.split(" ")[0])} Tide Curve
      </button>
      <a class="btn btn-outline btn-sm" href="https://www.google.com/maps/search/?api=1&query=${mark.lat},${mark.lng}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">
        🧭 Google Maps Directions
      </a>
    </div>
  `;

  document.getElementById("btnSpotlightOpenForum")?.addEventListener("click", () => {
    state.forumMarkFilter = mark.id;
    const sel = document.getElementById("forumMarkFilterSelect");
    if (sel) sel.value = mark.id;
    renderForumTab();
    switchTab("forum");
  });

  document.getElementById("btnSpotlightOpenTides")?.addEventListener("click", () => {
    switchTab("marine");
  });
}

function renderMarksDirectoryGrid() {
  const grid = document.getElementById("marksDirectoryGrid");
  if (!grid) return;
  grid.innerHTML = "";

  const filtered = getFilteredMarks();
  const heading = document.getElementById("directoryListHeading");
  if (heading) {
    const regionLabel =
      state.selectedRegionId === "ALL"
        ? "All County Cork Regions"
        : getRegionById(state.selectedRegionId).name;
    heading.textContent = `📍 ${regionLabel} — Shore Marks (${filtered.length})`;
  }

  filtered.forEach((mark) => {
    const region = getRegionById(mark.regionId);
    const safety = evaluateMarkSafety(mark, state.marineData, state.tideData);
    const card = document.createElement("article");
    card.className = `mark-card ${mark.id === state.activeMarkId ? "selected" : ""}`;

    const safetyPill =
      safety.overallLevel === "danger"
        ? `<span class="badge-pill badge-warn">🔴 Swell Alert</span>`
        : mark.cutoffRisk
        ? `<span class="badge-pill badge-gold">⚠️ Cut-Off Watch</span>`
        : `<span class="badge-pill badge-success">🟢 All-Tide Access</span>`;

    card.innerHTML = `
      <div>
        <div class="mark-card-top">
          <div>
            <span class="badge-pill badge-info">${region.emoji} ${escapeHtml(mark.regionName)}</span>
            <span class="badge-pill" style="margin-left:4px;">${escapeHtml(mark.type)}</span>
            <h3 style="margin-top:7px; font-size:1.08rem;">${escapeHtml(mark.name)}</h3>
          </div>
          ${safetyPill}
        </div>
        <p class="mark-card-meta">${escapeHtml(mark.summary)}</p>
        <div class="species-tags">
          ${mark.targetSpecies.slice(0, 5).map((s) => `<span class="species-tag">${escapeHtml(s)}</span>`).join("")}
        </div>
        <p class="muted" style="margin-top:9px; font-size:0.8rem;">
          <strong>🌊 Best Tide:</strong> ${escapeHtml(mark.bestTidalWindow)}
        </p>
      </div>

      <div class="mark-card-footer">
        <span class="muted" style="font-size:0.76rem;">📍 ${mark.lat.toFixed(3)}°N, ${mark.lng.toFixed(3)}°W</span>
        <button type="button" class="btn btn-outline btn-sm">Inspect Mark &amp; Map &rarr;</button>
      </div>
    `;

    card.addEventListener("click", () => {
      selectCorkMark(mark.id, true);
      window.scrollTo({ top: 140, behavior: "smooth" });
    });

    grid.appendChild(card);
  });
}

// ============================================================================
// TAB 2: REAL-TIME MARINE, TIDE CURVE & SOLUNAR DASHBOARD
// ============================================================================

function renderMarineDashboard() {
  const tide = state.tideData;
  const astro = state.astroData;
  const marine = state.marineData;
  if (!tide || !astro) return;

  document.getElementById("tideStationBadge").textContent = tide.sourceLabel
    ? `${tide.station.name} • ${tide.sourceLabel}`
    : tide.station.name;
  document.getElementById("springNeapBadge").textContent = tide.springNeapStatus;
  document.getElementById("tidalRangeBadge").textContent = `Tidal Range: ${tide.tidalRangeM}m`;

  const pillsRow = document.getElementById("tideEventsPillsRow");
  if (pillsRow) {
    pillsRow.innerHTML = tide.events
      .map(
        (ev) => `
        <div class="tide-event-box ${ev.type === "HIGH" ? "high-tide" : "low-tide"}">
          <span class="badge-pill ${ev.type === "HIGH" ? "badge-info" : "badge-success"}">
            ${ev.type === "HIGH" ? "⬆️ HIGH TIDE" : "⬇️ LOW TIDE"}
          </span>
          <div style="font-size:1.35rem; font-weight:800; margin-top:6px;">${ev.timeStr}</div>
          <div class="muted">${ev.heightM}m above Chart Datum</div>
        </div>
      `
      )
      .join("");
  }

  renderTideSvgCurve(tide);
  renderSolunarAndSunPanel(astro);
  renderMarineWeatherPanel(marine);
}

function renderTideSvgCurve(tide) {
  const container = document.getElementById("tideSvgContainer");
  if (!container) return;

  const width = 880;
  const height = 230;
  const padL = 48;
  const padR = 24;
  const padT = 26;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxH = 4.6;
  const minH = 0.0;

  const xForMin = (min) => padL + (min / 1440) * plotW;
  const yForH = (h) => padT + plotH - ((h - minH) / (maxH - minH)) * plotH;

  const pathCoords = tide.curvePoints.map((pt, i) => {
    const x = xForMin(pt.minutes).toFixed(1);
    const y = yForH(pt.heightM).toFixed(1);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  });
  const linePath = pathCoords.join(" ");
  const areaPath = `${linePath} L${xForMin(1440).toFixed(1)},${(padT + plotH).toFixed(1)} L${padL},${(padT + plotH).toFixed(1)} Z`;

  const nowX = xForMin(tide.nowMinutes).toFixed(1);
  const nowY = yForH(tide.currentHeightM).toFixed(1);

  const hourTicks = [0, 180, 360, 540, 720, 900, 1080, 1260, 1440];

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="230" role="img" aria-label="24-Hour Tidal Height Curve">
      <defs>
        <linearGradient id="corkTideFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.48" />
          <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0.03" />
        </linearGradient>
      </defs>

      <!-- Horizontal meter grid lines -->
      ${[1, 2, 3, 4]
        .map((m) => {
          const y = yForH(m).toFixed(1);
          return `
            <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="rgba(148,163,184,0.14)" stroke-dasharray="4 4" />
            <text x="${padL - 8}" y="${Number(y) + 4}" fill="#94a3b8" font-size="11" text-anchor="end">${m}.0m</text>
          `;
        })
        .join("")}

      <!-- Hour labels -->
      ${hourTicks
        .map((m) => {
          const x = xForMin(m).toFixed(1);
          const lbl = `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
          return `
            <line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="rgba(148,163,184,0.08)" />
            <text x="${x}" y="${height - 10}" fill="#94a3b8" font-size="11" text-anchor="middle">${lbl}</text>
          `;
        })
        .join("")}

      <!-- Shaded Tide Area & Curve Line -->
      <path d="${areaPath}" fill="url(#corkTideFill)" />
      <path d="${linePath}" fill="none" stroke="#38bdf8" stroke-width="3" />

      <!-- High & Low Water Pins -->
      ${tide.events
        .map((ev) => {
          const ex = xForMin(ev.minutes).toFixed(1);
          const ey = yForH(Number(ev.heightM)).toFixed(1);
          return `
            <circle cx="${ex}" cy="${ey}" r="4.5" fill="${ev.type === "HIGH" ? "#38bdf8" : "#2dd4bf"}" stroke="#07111e" stroke-width="2" />
            <text x="${ex}" y="${Number(ey) - 10}" fill="#f8fafc" font-size="11" font-weight="700" text-anchor="middle">
              ${ev.type} ${ev.timeStr} (${ev.heightM}m)
            </text>
          `;
        })
        .join("")}

      <!-- Live NOW Indicator -->
      <line x1="${nowX}" y1="${padT}" x2="${nowX}" y2="${padT + plotH}" stroke="#f59e0b" stroke-width="2" stroke-dasharray="5 3" />
      <circle cx="${nowX}" cy="${nowY}" r="6" fill="#f59e0b" stroke="#fff" stroke-width="2" />
      <text x="${nowX}" y="${padT + 12}" fill="#fcd34d" font-size="11" font-weight="800" text-anchor="middle">
        NOW (${tide.currentHeightM}m)
      </text>
    </svg>
  `;
}

function renderSolunarAndSunPanel(astro) {
  const el = document.getElementById("solunarAndSunContent");
  if (!el) return;

  el.innerHTML = `
    <div class="solunar-stat-box" style="border-color:rgba(245,158,11,0.4);">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span class="badge-pill badge-gold">Solunar Bite Rating: ${astro.solunarScore} / 5 (${astro.solunarPct}%)</span>
          <h4 style="margin-top:6px; font-size:1.05rem;">${astro.phaseEmoji} ${escapeHtml(astro.phaseName)}</h4>
          <p class="muted" style="font-size:0.82rem;">Illumination: ${astro.illuminationPct}% • Lunar Age: ${astro.lunarAgeDays} days</p>
        </div>
      </div>
      <p style="margin-top:8px; font-size:0.85rem; color:#fde68a;">${escapeHtml(astro.solunarLabel)}</p>
    </div>

    <div class="solunar-grid-2">
      <div class="solunar-stat-box">
        <h4 style="color:#7dd3fc; font-size:0.82rem;">🎯 MAJOR FEEDING WINDOWS (2 HR)</h4>
        <p style="font-weight:700; margin-top:4px;">1) ${astro.majorWindows[0]}</p>
        <p style="font-weight:700;">2) ${astro.majorWindows[1]}</p>
        <p class="muted" style="font-size:0.75rem; margin-top:4px;">Peak lunar overhead &amp; underfoot transit periods.</p>
      </div>

      <div class="solunar-stat-box">
        <h4 style="color:#5eead4; font-size:0.82rem;">⚡ MINOR FEEDING WINDOWS (1 HR)</h4>
        <p style="font-weight:700; margin-top:4px;">1) ${astro.minorWindows[0]}</p>
        <p style="font-weight:700;">2) ${astro.minorWindows[1]}</p>
        <p class="muted" style="font-size:0.75rem; margin-top:4px;">Moonrise (${astro.moonrise}) &amp; Moonset (${astro.moonset}) windows.</p>
      </div>
    </div>

    <div class="solunar-grid-2">
      <div class="solunar-stat-box">
        <h4 style="color:#fcd34d; font-size:0.82rem;">🌅 DAWN &amp; SUNRISE (SURF SESSION)</h4>
        <p style="font-size:0.88rem; margin-top:4px;"><strong>First Light:</strong> ${astro.dawn}</p>
        <p style="font-size:0.88rem;"><strong>Sunrise:</strong> ${astro.sunrise}</p>
      </div>

      <div class="solunar-stat-box">
        <h4 style="color:#f472b6; font-size:0.82rem;">🌇 SUNSET &amp; NIGHT SESSION</h4>
        <p style="font-size:0.88rem; margin-top:4px;"><strong>Sunset:</strong> ${astro.sunset}</p>
        <p style="font-size:0.88rem;"><strong>Last Light (Dusk):</strong> ${astro.dusk}</p>
      </div>
    </div>
  `;
}

function renderMarineWeatherPanel(marine) {
  const el = document.getElementById("marineWeatherContent");
  if (!el || !marine) return;

  const badge = document.getElementById("liveMarineBadge");
  if (badge) {
    badge.textContent = marine.isLive
      ? `Live Telemetry (${marine.fetchedAt})`
      : "Coastal Forecast Model";
  }

  el.innerHTML = `
    <div class="solunar-grid-2">
      <div class="solunar-stat-box">
        <h4 style="color:#7dd3fc; font-size:0.78rem;">🌬️ WIND SPEED &amp; GUSTS</h4>
        <div style="font-size:1.2rem; font-weight:800; margin-top:2px;">
          ${marine.windSpeedKmh} km/h ${marine.windCompass}
        </div>
        <p class="muted" style="font-size:0.78rem;">Gusts up to ${marine.windGustsKmh} km/h</p>
      </div>

      <div class="solunar-stat-box">
        <h4 style="color:#5eead4; font-size:0.78rem;">🌊 WAVE &amp; SWELL PERIOD</h4>
        <div style="font-size:1.2rem; font-weight:800; margin-top:2px;">
          ${marine.waveHeightM}m @ ${marine.swellPeriodSec}s (${marine.swellDirectionCompass})
        </div>
        <p class="muted" style="font-size:0.78rem;">Sea Surface Temp: ${marine.seaTempC}°C</p>
      </div>

      <div class="solunar-stat-box">
        <h4 style="color:#fcd34d; font-size:0.78rem;">🧭 BAROMETRIC PRESSURE</h4>
        <div style="font-size:1.15rem; font-weight:800; margin-top:2px;">
          ${marine.pressureHpa} hPa
        </div>
        <p class="muted" style="font-size:0.78rem;">Trend: ${marine.pressureTrend}</p>
      </div>

      <div class="solunar-stat-box">
        <h4 style="color:#cbd5e1; font-size:0.78rem;">🌧️ AIR TEMP &amp; PRECIPITATION</h4>
        <div style="font-size:1.15rem; font-weight:800; margin-top:2px;">
          ${marine.airTempC}°C • ${marine.precipitationMm} mm
        </div>
        <p class="muted" style="font-size:0.78rem;">Target Mark: ${escapeHtml(getActiveMark()?.name || "Cork Coast")}</p>
      </div>
    </div>

    <table class="hourly-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Wind</th>
          <th>Wave / Swell</th>
          <th>Rain</th>
          <th>Air</th>
        </tr>
      </thead>
      <tbody>
        ${marine.hourlyForecast
          .map(
            (h) => `
            <tr>
              <td><strong>${h.time}</strong></td>
              <td>${h.windSpeedKmh} km/h ${h.windCompass}</td>
              <td>${h.waveHeightM}m</td>
              <td>${h.rainMm} mm</td>
              <td>${h.tempC}°C</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ============================================================================
// TAB 3: SAFETY & COASTAL WARNINGS MATRIX
// ============================================================================

function renderSafetyTab() {
  const overview = document.getElementById("safetyOverviewCards");
  const matrix = document.getElementById("safetyMarksMatrix");
  const badge = document.getElementById("safetyAlertCountBadge");
  if (!overview || !matrix) return;

  let safeCount = 0;
  let cautionCount = 0;
  let dangerCount = 0;

  const evaluated = state.marks.map((mark) => {
    const station = getTideStationById(mark.tideStationId);
    const tide = calculateCorkTidesForDate(station, state.selectedDate);
    const safety = evaluateMarkSafety(mark, state.marineData, tide);
    if (safety.overallLevel === "danger") dangerCount++;
    else if (safety.overallLevel === "caution") cautionCount++;
    else safeCount++;
    return { mark, safety, tide };
  });

  if (badge) {
    badge.textContent = dangerCount + cautionCount;
  }

  overview.innerHTML = `
    <div class="dashboard-card" style="border-color:rgba(16,185,129,0.4);">
      <span class="badge-pill badge-success">🟢 SAFE TO FISH NOW</span>
      <h3 style="font-size:1.7rem; margin:6px 0;">${safeCount} Marks</h3>
      <p class="muted">Sheltered piers, estuaries, and beaches within safe wind and swell limits.</p>
    </div>
    <div class="dashboard-card" style="border-color:rgba(245,158,11,0.45);">
      <span class="badge-pill badge-gold">⚠️ RISING TIDE CUT-OFF / SWELL WATCH</span>
      <h3 style="font-size:1.7rem; margin:6px 0;">${cautionCount} Marks</h3>
      <p class="muted">Marks with flooding sandbar gullies or tidal rock shelves—monitor the rising tide closely.</p>
    </div>
    <div class="dashboard-card" style="border-color:rgba(239,68,68,0.5);">
      <span class="badge-pill badge-warn">🔴 HEAVY SWELL / GALE DANGER</span>
      <h3 style="font-size:1.7rem; margin:6px 0;">${dangerCount} Marks</h3>
      <p class="muted">Exposed rock ledges or surf marks exceeding safe wind/swell thresholds right now.</p>
    </div>
  `;

  matrix.innerHTML = evaluated
    .map(({ mark, safety, tide }) => {
      const statusBadge =
        safety.overallLevel === "danger"
          ? `<span class="badge-pill badge-warn">🔴 DANGER: SWELL / WIND EXCEEDED</span>`
          : safety.overallLevel === "caution"
          ? `<span class="badge-pill badge-gold">⚠️ CAUTION: CUT-OFF / FLOODING TIDE</span>`
          : `<span class="badge-pill badge-success">🟢 SAFE CONDITIONS</span>`;

      return `
        <article class="mark-card" data-safety-mark="${mark.id}">
          <div>
            <div class="mark-card-top">
              <div>
                <span class="badge-pill badge-info">${escapeHtml(mark.regionName)}</span>
                <h3 style="margin-top:6px;">${escapeHtml(mark.name)}</h3>
              </div>
              ${statusBadge}
            </div>
            <p class="muted" style="font-size:0.81rem; margin:6px 0;">
              <strong>Tide Now (${escapeHtml(tide.station.name.split(" ")[0])}):</strong> ${tide.currentStageLabel} (${tide.currentHeightM}m)
            </p>
            <p style="font-size:0.84rem; color:#fde68a; margin-top:6px;">
              <strong>🌊 Cut-Off Guidance:</strong> ${escapeHtml(mark.cutoffWarning)}
            </p>
            <p class="muted" style="font-size:0.8rem; margin-top:6px;">
              <strong>🌬️ Max Safe Threshold:</strong> Winds &le; ${mark.maxSafeWindKmh} km/h • Swell &le; ${mark.maxSafeWaveM}m. ${escapeHtml(mark.safetyNotes)}
            </p>
          </div>
        </article>
      `;
    })
    .join("");
}

// ============================================================================
// TAB 4: MEMBERS-ONLY CORK SHORE ANGLERS FORUM
// ============================================================================

function renderForumTab() {
  const lockedCard = document.getElementById("forumLockedCard");
  const unlockedBox = document.getElementById("forumUnlockedContent");
  const listEl = document.getElementById("forumTopicsList");
  if (!lockedCard || !unlockedBox || !listEl) return;

  // Enforce Members-Only Forum Lock when user is not logged in
  if (!state.user) {
    lockedCard.classList.remove("hidden");
    unlockedBox.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }

  lockedCard.classList.add("hidden");
  unlockedBox.classList.remove("hidden");

  // Render Category Filter Chips
  const chipsContainer = document.getElementById("forumCategoryChips");
  if (chipsContainer) {
    chipsContainer.innerHTML = "";
    FORUM_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `region-chip ${state.forumCategoryFilter === cat.id ? "active" : ""}`;
      btn.textContent = cat.name;
      btn.addEventListener("click", () => {
        state.forumCategoryFilter = cat.id;
        renderForumTab();
      });
      chipsContainer.appendChild(btn);
    });
  }

  const filteredTopics = state.topics
    .filter((t) => {
      const topicStatus = t.status || "approved";
      // Regular users only see approved topics (plus their own pending submission)
      if (!state.isAdmin && topicStatus !== "approved" && t.authorId !== state.user.uid) {
        return false;
      }
      if (state.forumCategoryFilter !== "ALL" && t.categoryId !== state.forumCategoryFilter) {
        return false;
      }
      if (state.forumMarkFilter !== "ALL" && t.markId !== state.forumMarkFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  if (filteredTopics.length === 0) {
    listEl.innerHTML = `
      <div class="dashboard-card" style="text-align:center; padding:32px;">
        <h3>No Approved Forum Subjects Match Your Filter Yet</h3>
        <p class="muted" style="margin:8px 0 16px;">Submit a new subject below—it will appear once approved by the Admin!</p>
        <button type="button" class="btn btn-primary" id="btnEmptyForumNewTopic">✍️ + Submit New Subject</button>
      </div>
    `;
    document.getElementById("btnEmptyForumNewTopic")?.addEventListener("click", () => {
      openNewTopicModal();
    });
    return;
  }

  listEl.innerHTML = "";
  filteredTopics.forEach((topic) => {
    const topicStatus = topic.status || "approved";
    const isPending = topicStatus === "pending";
    const cat = FORUM_CATEGORIES.find((c) => c.id === topic.categoryId) || FORUM_CATEGORIES[1];
    const linkedMark = topic.markId ? getMarkById(topic.markId, state.marks) : null;
    const topicReplies = state.replies.filter((r) => r.topicId === topic.id);

    const card = document.createElement("article");
    card.className = "forum-topic-card";
    if (isPending) {
      card.style.borderColor = "rgba(245, 158, 11, 0.55)";
    }

    card.innerHTML = `
      <div style="flex:1;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          ${isPending ? `<span class="badge-pill badge-warn">⏳ Pending Admin Approval</span>` : ""}
          ${topic.pinned ? `<span class="badge-pill badge-gold">📌 Pinned</span>` : ""}
          <span class="badge-pill badge-info">${escapeHtml(cat.badge)}</span>
          ${linkedMark ? `<span class="badge-pill">📍 ${escapeHtml(linkedMark.name)}</span>` : ""}
          <span class="muted" style="font-size:0.76rem;">
            Posted by <strong>${escapeHtml(topic.authorName)}</strong> • ${formatDateShort(topic.createdAt)}
          </span>
        </div>
        <h3 style="font-size:1.06rem; margin-bottom:6px;">${escapeHtml(topic.title)}</h3>
        <p class="muted" style="font-size:0.86rem;">${escapeHtml(topic.body)}</p>
      </div>

      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px; min-width:135px;">
        ${
          isPending && state.isAdmin
            ? `<button type="button" class="btn btn-primary btn-sm" data-approve-topic="${topic.id}">✅ Approve Subject</button>`
            : `<span class="badge-pill">💬 ${topicReplies.length} Replies</span>`
        }
        ${
          !isPending
            ? `<button type="button" class="btn btn-outline btn-sm" data-upvote-topic="${topic.id}">
                👍 ${Number(topic.upvotes) || 0} Helpful
              </button>`
            : ""
        }
      </div>
    `;

    card.addEventListener("click", (e) => {
      const approveBtn = e.target.closest("[data-approve-topic]");
      if (approveBtn) {
        e.stopPropagation();
        approveForumSubject(topic.id);
        return;
      }
      const upvoteBtn = e.target.closest("[data-upvote-topic]");
      if (upvoteBtn) {
        e.stopPropagation();
        handleUpvoteTopic(topic.id);
        return;
      }
      if (isPending && !state.isAdmin) {
        showToast("⏳ This subject is awaiting Admin approval before replies open.");
        return;
      }
      openTopicThreadModal(topic.id);
    });

    listEl.appendChild(card);
  });
}

function openNewTopicModal() {
  if (!state.user) {
    document.getElementById("authModal")?.classList.remove("hidden");
    return;
  }
  const notice = document.getElementById("topicApprovalNotice");
  const submitBtn = document.getElementById("btnSubmitNewTopic");
  if (state.isAdmin) {
    if (notice) notice.textContent = "🛡️ Admin Mode: Your subject will be published immediately.";
    if (submitBtn) submitBtn.textContent = "🚀 Publish Approved Subject";
  } else {
    if (notice) {
      notice.textContent =
        "🛡️ Note: New forum subjects must be approved by the Admin before appearing to all members.";
    }
    if (submitBtn) submitBtn.textContent = "🚀 Submit Subject for Admin Approval";
  }
  document.getElementById("newTopicModal")?.classList.remove("hidden");
}

async function approveForumSubject(topicId) {
  if (!state.isAdmin) return;
  const topic = state.topics.find((t) => t.id === topicId);
  if (!topic) return;

  topic.status = "approved";
  saveLocalState();

  if (state.firebaseReady && state.fbDb) {
    try {
      const { doc, setDoc } = state.fbModules;
      await setDoc(doc(state.fbDb, "forum_topics", topic.id), topic);
    } catch (e) {
      console.warn("Could not sync topic approval:", e);
    }
  }

  renderAll();
  showToast(`✅ Approved forum subject: "${topic.title}"`);
}

function openTopicThreadModal(topicId) {
  if (!state.user) {
    document.getElementById("authModal")?.classList.remove("hidden");
    return;
  }

  const topic = state.topics.find((t) => t.id === topicId);
  if (!topic) return;

  state.activeTopicId = topic.id;
  const cat = FORUM_CATEGORIES.find((c) => c.id === topic.categoryId) || FORUM_CATEGORIES[1];
  const linkedMark = topic.markId ? getMarkById(topic.markId, state.marks) : null;

  document.getElementById("threadModalCategoryBadge").textContent = cat.badge;
  document.getElementById("threadModalTitle").textContent = topic.title;

  const opBox = document.getElementById("threadOriginalPostBox");
  opBox.innerHTML = `
    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
      <span class="muted" style="font-size:0.8rem;">
        👤 <strong>${escapeHtml(topic.authorName)}</strong> • ${formatDateShort(topic.createdAt)}
      </span>
      ${linkedMark ? `<span class="badge-pill badge-info">📍 ${escapeHtml(linkedMark.name)}</span>` : ""}
    </div>
    <p style="font-size:0.94rem; white-space:pre-line;">${escapeHtml(topic.body)}</p>
  `;

  renderThreadReplies(topic.id);
  document.getElementById("topicThreadModal")?.classList.remove("hidden");
}

function renderThreadReplies(topicId) {
  const replies = state.replies
    .filter((r) => r.topicId === topicId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  document.getElementById("threadReplyCount").textContent = replies.length;
  const listEl = document.getElementById("threadRepliesList");
  if (!listEl) return;

  if (replies.length === 0) {
    listEl.innerHTML = `<p class="muted">No replies yet — add the first reply below!</p>`;
    return;
  }

  listEl.innerHTML = replies
    .map(
      (r) => `
      <div class="reply-item">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <strong style="font-size:0.83rem; color:#7dd3fc;">👤 ${escapeHtml(r.authorName)}</strong>
          <span class="muted" style="font-size:0.75rem;">${formatDateShort(r.createdAt)}</span>
        </div>
        <p style="font-size:0.88rem;">${escapeHtml(r.body)}</p>
      </div>
    `
    )
    .join("");
}

async function handleUpvoteTopic(topicId) {
  const topic = state.topics.find((t) => t.id === topicId);
  if (!topic) return;
  topic.upvotes = (Number(topic.upvotes) || 0) + 1;
  saveLocalState();
  renderForumTab();

  if (state.firebaseReady && state.fbDb && state.user) {
    try {
      const { doc, setDoc } = state.fbModules;
      await setDoc(doc(state.fbDb, "forum_topics", topic.id), topic);
    } catch (e) {
      console.warn("Could not sync upvote:", e);
    }
  }
}

// ============================================================================
// TAB 5: ADMIN CONTROL CENTER (Completely Hidden When Logged Out)
// ============================================================================

function renderAdminTab() {
  const adminNavTab = document.getElementById("adminNavTab");
  const adminPanel = document.getElementById("tab-admin");
  const lockedCard = document.getElementById("adminLockedCard");
  const dashBox = document.getElementById("adminDashboardContent");
  const pendingBadge = document.getElementById("adminPendingForumBadge");
  const uidEl = document.getElementById("currentUserUidDisplay");

  // Hide the Admin tab when not signed in
  if (!state.user) {
    adminNavTab?.classList.add("hidden");
    pendingBadge?.classList.add("hidden");
    if (uidEl) uidEl.textContent = "Not signed in — please Sign In first";
    if (adminPanel?.classList.contains("active")) {
      switchTab("directory");
    }
    return;
  }

  // Show the Admin tab when signed in so you can click it to get your UID
  adminNavTab?.classList.remove("hidden");
  if (uidEl) uidEl.textContent = state.user.uid;

  // If the signed-in user is NOT in /admins/{uid}, show the UID setup card and keep all Admin tools locked
  if (!state.isAdmin) {
    pendingBadge?.classList.add("hidden");
    lockedCard?.classList.remove("hidden");
    dashBox?.classList.add("hidden");
    return;
  }

  lockedCard?.classList.add("hidden");
  dashBox?.classList.remove("hidden");

  const pendingTopics = state.topics.filter((t) => t.status === "pending");
  const approvedTopics = state.topics.filter((t) => (t.status || "approved") === "approved");

  if (pendingBadge) {
    if (pendingTopics.length > 0) {
      pendingBadge.textContent = pendingTopics.length;
      pendingBadge.classList.remove("hidden");
    } else {
      pendingBadge.classList.add("hidden");
    }
  }

  document.getElementById("adminPendingCount").textContent = pendingTopics.length;
  document.getElementById("adminMarkCount").textContent = state.marks.length;
  document.getElementById("adminTopicCount").textContent = approvedTopics.length;

  // 1. Render Pending Forum Subjects Awaiting Approval
  const pendingList = document.getElementById("adminPendingTopicsList");
  if (pendingList) {
    pendingList.innerHTML = "";
    if (pendingTopics.length === 0) {
      pendingList.innerHTML = `<p class="muted">✅ All forum subjects have been reviewed. No pending subjects right now.</p>`;
    } else {
      pendingTopics.forEach((t) => {
        const row = document.createElement("div");
        row.className = "admin-item-row";
        row.style.borderColor = "rgba(245, 158, 11, 0.5)";
        row.innerHTML = `
          <div style="flex:1;">
            <span class="badge-pill badge-warn">⏳ Pending Approval</span>
            <strong style="display:block; margin-top:4px;">${escapeHtml(t.title)}</strong>
            <span class="muted" style="display:block; font-size:0.78rem; margin:2px 0;">
              Submitted by <strong>${escapeHtml(t.authorName)}</strong> • ${formatDateShort(t.createdAt)}
            </span>
            <p class="muted" style="font-size:0.82rem; margin-top:4px;">${escapeHtml(t.body)}</p>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" data-admin-approve="${t.id}">
              ✅ Approve Subject
            </button>
            <button type="button" class="btn btn-danger-ghost btn-sm" data-admin-reject="${t.id}">
              🗑️ Reject
            </button>
          </div>
        `;
        row.querySelector("[data-admin-approve]")?.addEventListener("click", () => {
          approveForumSubject(t.id);
        });
        row.querySelector("[data-admin-reject]")?.addEventListener("click", async () => {
          state.topics = state.topics.filter((x) => x.id !== t.id);
          saveLocalState();
          if (state.firebaseReady && state.fbDb) {
            const { doc, deleteDoc } = state.fbModules;
            await deleteDoc(doc(state.fbDb, "forum_topics", t.id));
          }
          renderAll();
          showToast("🗑️ Rejected and removed pending subject.");
        });
        pendingList.appendChild(row);
      });
    }
  }

  // 2. Render Fishing Marks Manager (Admin Only)
  const marksList = document.getElementById("adminMarksManagerList");
  if (marksList) {
    marksList.innerHTML = "";
    state.marks.forEach((m) => {
      const row = document.createElement("div");
      row.className = "admin-item-row";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(m.name)}</strong>
          <span class="muted" style="display:block; font-size:0.76rem;">
            ${escapeHtml(m.regionName)} • ${escapeHtml(m.type)} ${m.cutoffRisk ? "• ⚠️ Cut-Off Alert" : ""}
          </span>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-outline btn-sm" data-admin-inspect="${m.id}">View</button>
          ${
            m.isCustom
              ? `<button type="button" class="btn btn-danger-ghost btn-sm" data-admin-del-mark="${m.id}">🗑️ Delete</button>`
              : ""
          }
        </div>
      `;
      row.querySelector("[data-admin-inspect]")?.addEventListener("click", () => {
        selectCorkMark(m.id, true);
        switchTab("directory");
      });
      row.querySelector("[data-admin-del-mark]")?.addEventListener("click", () => {
        deleteCustomMark(m.id);
      });
      marksList.appendChild(row);
    });
  }

  // 3. Render Approved Forum Subjects Moderation
  const forumList = document.getElementById("adminForumManagerList");
  if (forumList) {
    forumList.innerHTML = "";
    approvedTopics.forEach((t) => {
      const row = document.createElement("div");
      row.className = "admin-item-row";
      row.innerHTML = `
        <div>
          <strong>${t.pinned ? "📌 " : ""}${escapeHtml(t.title)}</strong>
          <span class="muted" style="display:block; font-size:0.76rem;">By ${escapeHtml(t.authorName)}</span>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-outline btn-sm" data-admin-pin="${t.id}">
            ${t.pinned ? "Unpin" : "📌 Pin"}
          </button>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-admin-del-topic="${t.id}">
            🗑️ Delete
          </button>
        </div>
      `;
      row.querySelector("[data-admin-pin]")?.addEventListener("click", async () => {
        t.pinned = !t.pinned;
        saveLocalState();
        if (state.firebaseReady && state.fbDb) {
          const { doc, setDoc } = state.fbModules;
          await setDoc(doc(state.fbDb, "forum_topics", t.id), t);
        }
        renderAll();
      });
      row.querySelector("[data-admin-del-topic]")?.addEventListener("click", async () => {
        state.topics = state.topics.filter((x) => x.id !== t.id);
        saveLocalState();
        if (state.firebaseReady && state.fbDb) {
          const { doc, deleteDoc } = state.fbModules;
          await deleteDoc(doc(state.fbDb, "forum_topics", t.id));
        }
        renderAll();
        showToast("🗑️ Forum topic removed.");
      });
      forumList.appendChild(row);
    });
  }
}

async function deleteCustomMark(markId) {
  state.marks = state.marks.filter((m) => m.id !== markId);
  if (state.activeMarkId === markId && state.marks[0]) {
    state.activeMarkId = state.marks[0].id;
  }
  saveLocalState();
  syncLeafletMarkers();
  renderAll();
  if (state.firebaseReady && state.fbDb && state.isAdmin) {
    try {
      const { doc, deleteDoc } = state.fbModules;
      await deleteDoc(doc(state.fbDb, "cork_marks", markId));
    } catch (e) {
      console.warn("Could not delete custom mark in Firestore:", e);
    }
  }
  showToast("🗑️ Custom mark deleted.");
}

// ============================================================================
// AUTHENTICATION UI & HANDLERS
// ============================================================================

function renderAuthUI() {
  const area = document.getElementById("authArea");
  if (!area) return;

  if (state.user) {
    area.innerHTML = `
      <div class="user-chip">
        <span title="Your UID: ${escapeHtml(state.user.uid)}">${state.isAdmin ? "🛡️" : "🎣"} ${escapeHtml(state.user.displayName)}</span>
        <button id="btnCopyMyUidTop" type="button" class="btn btn-ghost btn-sm" style="padding:3px 7px;" title="Copy your Firebase User UID (${escapeHtml(state.user.uid)})">📋 UID</button>
        <button id="btnSignOut" type="button" class="btn btn-ghost btn-sm" style="padding:3px 8px;">Sign Out</button>
      </div>
    `;
    document.getElementById("btnCopyMyUidTop")?.addEventListener("click", () => {
      navigator.clipboard.writeText(state.user.uid);
      showToast(`📋 Copied your UID: ${state.user.uid}`);
    });
    document.getElementById("btnSignOut")?.addEventListener("click", async () => {
      if (state.firebaseReady && state.fbAuth) {
        await state.fbModules.signOut(state.fbAuth);
      }
      state.user = null;
      state.isAdmin = false;
      renderAll();
      showToast("Signed out.");
    });
  } else {
    area.innerHTML = `<button id="btnOpenAuth" type="button" class="btn btn-primary btn-sm">🔐 Sign In</button>`;
    document.getElementById("btnOpenAuth")?.addEventListener("click", () => {
      document.getElementById("authModal")?.classList.remove("hidden");
    });
  }
}

// ============================================================================
// PDF TRIP SHEET EXPORT
// ============================================================================

function exportTripSheetPdf() {
  const mark = getActiveMark();
  const tide = state.tideData;
  const astro = state.astroData;
  const marine = state.marineData;
  const safety = evaluateMarkSafety(mark, marine, tide);

  const sheet = document.getElementById("pdfExportContainer");
  if (!sheet || !mark || !tide || !astro) return;

  sheet.innerHTML = `
    <div style="font-family: Inter, sans-serif; color:#0f172a;">
      <h1 style="margin-bottom:4px;">🎣 Cork Shore Angler — Coastal Session Plan</h1>
      <p style="color:#475569; margin-bottom:16px;">
        <strong>Mark:</strong> ${escapeHtml(mark.name)} (${escapeHtml(mark.regionName)} • ${escapeHtml(mark.type)}) |
        <strong>Date:</strong> ${state.selectedDate} |
        <strong>Ref Tide Station:</strong> ${escapeHtml(tide.station.name)}
      </p>

      <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
        <h3 style="margin-bottom:6px;">🌊 Tide Table &amp; Solunar Windows (${escapeHtml(tide.springNeapStatus)})</h3>
        <p><strong>Tide Events:</strong> ${tide.events.map((e) => `${e.type} @ ${e.timeStr} (${e.heightM}m)`).join(" • ")}</p>
        <p><strong>Moon Phase:</strong> ${astro.phaseName} (${astro.illuminationPct}%) | <strong>Solunar Rating:</strong> ${astro.solunarScore}/5</p>
        <p><strong>Major Bite Windows:</strong> ${astro.majorWindows.join(" & ")} | <strong>Sunrise/Sunset:</strong> ${astro.sunrise} / ${astro.sunset}</p>
      </div>

      <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px; margin-bottom:14px;">
        <h3 style="margin-bottom:6px;">🐟 Spot Profile: Target Species, Bait &amp; Tactics</h3>
        <p><strong>Target Species:</strong> ${escapeHtml(mark.targetSpecies.join(", "))}</p>
        <p><strong>Best Tidal Window:</strong> ${escapeHtml(mark.bestTidalWindow)}</p>
        <p><strong>Bait &amp; Rigs:</strong> ${escapeHtml(mark.baitAndTactics)}</p>
      </div>

      <div style="border:1px solid #ef4444; border-radius:8px; padding:12px;">
        <h3 style="margin-bottom:6px; color:#b91c1c;">⚠️ Safety, Cut-Off &amp; Swell Notes</h3>
        <p><strong>Cut-Off Guidance:</strong> ${escapeHtml(mark.cutoffWarning)}</p>
        <p><strong>Safety Notes:</strong> ${escapeHtml(mark.safetyNotes)}</p>
        <p><strong>Current Forecast:</strong> Winds ${marine?.windSpeedKmh ?? 18} km/h ${marine?.windCompass ?? "SW"}, Swell ${marine?.waveHeightM ?? "1.2"}m (${safety.overallLevel.toUpperCase()})</p>
      </div>
    </div>
  `;

  sheet.classList.add("generating-pdf");
  if (window.html2pdf) {
    window
      .html2pdf()
      .set({
        margin: 10,
        filename: `Cork-Shore-Angler-${mark.id}-${state.selectedDate}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      })
      .from(sheet)
      .save()
      .then(() => sheet.classList.remove("generating-pdf"));
  } else {
    window.print();
    sheet.classList.remove("generating-pdf");
  }
}

// ============================================================================
// UI EVENT BINDINGS
// ============================================================================

function switchTab(tabName) {
  document.querySelectorAll(".nav-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.toggle("active", p.id === `tab-${tabName}`);
  });
  if (tabName === "directory" && state.leafletMap) {
    setTimeout(() => state.leafletMap.invalidateSize(), 100);
  }
}

function bindUIEvents() {
  // Navigation tabs
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Coastal station selector
  document.getElementById("activeStationSelect")?.addEventListener("change", (e) => {
    state.activeStationId = e.target.value;
    recalculateTidesAndAstro();
    renderAll();
  });

  // Date selector
  document.getElementById("activeDateInput")?.addEventListener("change", (e) => {
    state.selectedDate = e.target.value || new Date().toISOString().slice(0, 10);
    recalculateTidesAndAstro();
    renderAll();
  });

  // Sync live marine button
  document.getElementById("btnRefreshLiveMarine")?.addEventListener("click", async () => {
    showToast("🌊 Syncing live County Cork marine & weather data...");
    await refreshLiveMarineTelemetry();
    showToast("✅ Live marine forecast updated!");
  });

  // Mark type filter & search
  document.getElementById("markTypeFilterSelect")?.addEventListener("change", (e) => {
    state.selectedMarkType = e.target.value;
    syncLeafletMarkers();
    renderMarksDirectoryGrid();
  });

  document.getElementById("markSearchInput")?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    syncLeafletMarkers();
    renderMarksDirectoryGrid();
  });

  // Forum sign-in button
  document.getElementById("btnSignInFromForum")?.addEventListener("click", () => {
    document.getElementById("authModal")?.classList.remove("hidden");
  });

  // Forum mark filter
  document.getElementById("forumMarkFilterSelect")?.addEventListener("change", (e) => {
    state.forumMarkFilter = e.target.value;
    renderForumTab();
  });

  // Open New Topic Modal
  document.getElementById("btnOpenNewTopicModal")?.addEventListener("click", () => {
    openNewTopicModal();
  });

  // Submit New Forum Topic (Requires Admin Approval unless submitted by Admin)
  document.getElementById("newTopicForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.user) return;

    const initialStatus = state.isAdmin ? "approved" : "pending";

    const newTopic = {
      id: "topic-" + Date.now(),
      title: document.getElementById("topicTitleInput").value.trim(),
      categoryId: document.getElementById("topicCategorySelect").value,
      markId: document.getElementById("topicMarkSelect").value || "",
      authorId: state.user.uid,
      authorName: state.user.displayName,
      createdAt: new Date().toISOString(),
      status: initialStatus,
      pinned: false,
      upvotes: 1,
      body: document.getElementById("topicBodyInput").value.trim(),
      replyCount: 0
    };

    state.topics.unshift(newTopic);
    saveLocalState();

    if (state.firebaseReady && state.fbDb) {
      try {
        const { doc, setDoc } = state.fbModules;
        await setDoc(doc(state.fbDb, "forum_topics", newTopic.id), newTopic);
      } catch (err) {
        console.warn("Firestore topic save note:", err);
      }
    }

    e.target.reset();
    document.getElementById("newTopicModal")?.classList.add("hidden");
    renderForumTab();
    renderAdminTab();
    showToast(
      state.isAdmin
        ? "🚀 Forum subject published!"
        : "⏳ Subject submitted! It will appear to members once approved by the Admin."
    );
  });

  // Submit New Reply inside Thread Modal
  document.getElementById("newReplyForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.user || !state.activeTopicId) return;

    const bodyText = document.getElementById("replyBodyInput").value.trim();
    if (!bodyText) return;

    const newReply = {
      id: "reply-" + Date.now(),
      topicId: state.activeTopicId,
      authorId: state.user.uid,
      authorName: state.user.displayName,
      createdAt: new Date().toISOString(),
      body: bodyText
    };

    state.replies.push(newReply);
    saveLocalState();

    if (state.firebaseReady && state.fbDb) {
      try {
        const { doc, setDoc } = state.fbModules;
        await setDoc(doc(state.fbDb, "forum_replies", newReply.id), newReply);
      } catch (err) {
        console.warn("Firestore reply save note:", err);
      }
    }

    document.getElementById("replyBodyInput").value = "";
    renderThreadReplies(state.activeTopicId);
    renderForumTab();
    showToast("💬 Reply posted!");
  });

  // Admin: Open New Mark Modal (Strictly Admin Only)
  document.getElementById("btnOpenNewMarkModal")?.addEventListener("click", () => {
    if (!state.isAdmin) {
      showToast("🛡️ Only the Admin can add new fishing marks.");
      return;
    }
    document.getElementById("newMarkModal")?.classList.remove("hidden");
  });

  // Admin: Submit New Cork Mark
  document.getElementById("newMarkForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.isAdmin) return;

    const regionId = document.getElementById("markRegionSelect").value;
    const region = getRegionById(regionId);
    const stationMap = {
      "east-cork": "ballycotton",
      "cork-harbour": "cobh",
      "kinsale-south": "kinsale",
      "west-cork": "baltimore",
      "beara-mizen": "castletownbere"
    };

    const newMark = {
      id: "mark-" + Date.now(),
      name: document.getElementById("markNameInput").value.trim(),
      regionId,
      regionName: region.name,
      type: document.getElementById("markTypeSelect").value,
      lat: Number(document.getElementById("markLatInput").value) || 51.82,
      lng: Number(document.getElementById("markLngInput").value) || -8.25,
      tideStationId: stationMap[regionId] || "cobh",
      summary: document.getElementById("markBaitInput").value.trim(),
      targetSpecies: document
        .getElementById("markSpeciesInput")
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      seasonality: "Year-round local Cork shore mark.",
      baitAndTactics: document.getElementById("markBaitInput").value.trim(),
      bestTidalWindow: document.getElementById("markTideWindowInput").value.trim(),
      preferredTideStage: "rising",
      optimalWind: "Light to moderate winds.",
      cutoffRisk: document.getElementById("markCutoffCheckbox").checked,
      cutoffWarning: document.getElementById("markSafetyInput").value.trim(),
      swellRiskLevel: "moderate",
      maxSafeWindKmh: 45,
      maxSafeWaveM: 2.2,
      safetyNotes: document.getElementById("markSafetyInput").value.trim(),
      isCustom: true
    };

    state.marks.push(newMark);
    state.activeMarkId = newMark.id;
    saveLocalState();
    populateMarkDropdowns();
    syncLeafletMarkers();
    renderAll();

    if (state.firebaseReady && state.fbDb) {
      try {
        const { doc, setDoc } = state.fbModules;
        await setDoc(doc(state.fbDb, "cork_marks", newMark.id), newMark);
      } catch (err) {
        console.warn("Firestore mark save note:", err);
      }
    }

    e.target.reset();
    document.getElementById("newMarkModal")?.classList.add("hidden");
    showToast(`📍 Added ${newMark.name} to County Cork Directory!`);
  });

  // Admin UID copy & verify buttons
  document.getElementById("btnCopyUid")?.addEventListener("click", () => {
    if (!state.user) return;
    navigator.clipboard.writeText(state.user.uid);
    showToast("📋 Copied your Firebase UID to clipboard!");
  });

  document.getElementById("btnRefreshAdminStatus")?.addEventListener("click", async () => {
    await checkAdminStatus();
    renderAll();
    showToast(
      state.isAdmin
        ? "🛡️ Admin status verified! Welcome to the Control Center."
        : "ℹ️ UID not found in /admins collection yet."
    );
  });

  document.getElementById("btnDemoAdminMode")?.addEventListener("click", () => {
    state.isAdmin = true;
    renderAll();
    showToast("🧪 Local Demo Admin enabled for testing.");
  });

  // Auth Modal Tabs & Form
  document.getElementById("tabAuthLogin")?.addEventListener("click", () => {
    state.authMode = "login";
    document.getElementById("tabAuthLogin").classList.add("active");
    document.getElementById("tabAuthSignup").classList.remove("active");
    document.getElementById("btnAuthSubmit").textContent = "Sign In";
  });

  document.getElementById("tabAuthSignup")?.addEventListener("click", () => {
    state.authMode = "signup";
    document.getElementById("tabAuthSignup").classList.add("active");
    document.getElementById("tabAuthLogin").classList.remove("active");
    document.getElementById("btnAuthSubmit").textContent = "Create Angler Account";
  });

  document.getElementById("authForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const rawUser = document.getElementById("authUsername").value.trim();
    const pass = document.getElementById("authPassword").value;
    const email = rawUser.includes("@")
      ? rawUser
      : `${rawUser.toLowerCase().replace(/[^a-z0-9]/g, "")}@corkangler.user`;

    if (state.firebaseReady && state.fbAuth) {
      try {
        const {
          signInWithEmailAndPassword,
          createUserWithEmailAndPassword,
          updateProfile
        } = state.fbModules;

        if (state.authMode === "signup") {
          const cred = await createUserWithEmailAndPassword(state.fbAuth, email, pass);
          await updateProfile(cred.user, { displayName: rawUser });
          showToast("🎉 Account created! Welcome to Cork Shore Angler.");
        } else {
          await signInWithEmailAndPassword(state.fbAuth, email, pass);
          showToast("🎣 Signed in! Forum & Mark tools unlocked.");
        }
        document.getElementById("authModal")?.classList.add("hidden");
      } catch (err) {
        showToast("⚠️ Auth error: " + err.message);
      }
    } else {
      state.user = {
        uid: "local-" + rawUser.toLowerCase(),
        displayName: rawUser,
        email,
        isCloud: false
      };
      document.getElementById("authModal")?.classList.add("hidden");
      renderAll();
      showToast("🎣 Signed in (Local Mode).");
    }
  });

  document.getElementById("btnGoogleSignIn")?.addEventListener("click", async () => {
    if (!state.firebaseReady || !state.fbAuth) {
      showToast("ℹ️ Configure Firebase first to use Google Sign-In.");
      return;
    }
    try {
      const { GoogleAuthProvider, signInWithPopup } = state.fbModules;
      await signInWithPopup(state.fbAuth, new GoogleAuthProvider());
      document.getElementById("authModal")?.classList.add("hidden");
      showToast("🎣 Signed in with Google!");
    } catch (err) {
      showToast("⚠️ Google Sign-In error: " + err.message);
    }
  });

  // PDF Export button
  document.getElementById("btnDownloadPdf")?.addEventListener("click", exportTripSheetPdf);

  // Firebase Config Modal
  document.getElementById("btnFirebaseSetup")?.addEventListener("click", () => {
    const cfg = getActiveFirebaseConfig();
    document.getElementById("fbApiKey").value = cfg.apiKey || "";
    document.getElementById("fbAuthDomain").value = cfg.authDomain || "";
    document.getElementById("fbProjectId").value = cfg.projectId || "";
    document.getElementById("fbAppId").value = cfg.appId || "";
    document.getElementById("firebaseModal")?.classList.remove("hidden");
  });

  document.getElementById("firebaseConfigForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    saveCustomFirebaseConfig({
      apiKey: document.getElementById("fbApiKey").value.trim(),
      authDomain: document.getElementById("fbAuthDomain").value.trim(),
      projectId: document.getElementById("fbProjectId").value.trim(),
      appId: document.getElementById("fbAppId").value.trim()
    });
    document.getElementById("firebaseModal")?.classList.add("hidden");
    location.reload();
  });

  document.getElementById("btnResetFirebaseConfig")?.addEventListener("click", () => {
    clearCustomFirebaseConfig();
    location.reload();
  });

  // Close Modals
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-close-modal");
      document.getElementById(target)?.classList.add("hidden");
    });
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateShort(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showToast(msg) {
  const box = document.getElementById("toastContainer");
  if (!box) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3600);
}
