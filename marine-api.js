// ============================================================================
// CORK SHORE ANGLER — REAL-TIME MARINE WEATHER, TIDE, SOLUNAR & SAFETY ENGINE
// ============================================================================

export function degreesToCompass(deg) {
  if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return "SW";
  const dirs = [
    "N", "NNE", "NE", "ENE",
    "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW"
  ];
  const idx = Math.round(((Number(deg) % 360) / 22.5)) % 16;
  return dirs[idx];
}

// ============================================================================
// 1. LIVE MARINE & WEATHER FORECAST (Open-Meteo Weather + Marine APIs)
// ============================================================================

export async function fetchLiveCorkMarineAndWeather(lat = 51.8292, lng = -8.0008) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&current=temperature_2m,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m` +
    `&timezone=Europe%2FDublin&forecast_days=2`;

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&current=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period` +
    `&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,sea_surface_temperature` +
    `&timezone=Europe%2FDublin&forecast_days=2`;

  try {
    const [wRes, mRes] = await Promise.allSettled([
      fetch(weatherUrl),
      fetch(marineUrl)
    ]);

    let wData = null;
    let mData = null;

    if (wRes.status === "fulfilled" && wRes.value.ok) {
      wData = await wRes.value.json();
    }
    if (mRes.status === "fulfilled" && mRes.value.ok) {
      mData = await mRes.value.json();
    }

    if (!wData) {
      return getFallbackMarineWeather();
    }

    const curW = wData.current || {};
    const curM = mData?.current || {};

    const nowHourIso = new Date().toISOString().slice(0, 13);
    const hTimes = wData.hourly?.time || [];
    let startIdx = hTimes.findIndex((t) => t.startsWith(nowHourIso));
    if (startIdx < 0) startIdx = 0;

    // Determine 3-hour barometric pressure trend
    const pNow = Number(curW.surface_pressure ?? 1014);
    const pPrev = Number(wData.hourly?.surface_pressure?.[Math.max(0, startIdx - 3)] ?? pNow);
    const pDiff = pNow - pPrev;
    let pressureTrend = "Steady ➡️";
    if (pDiff >= 1.2) pressureTrend = `Rising (+${pDiff.toFixed(1)} hPa) 📈`;
    else if (pDiff <= -1.2) pressureTrend = `Falling (${pDiff.toFixed(1)} hPa) 📉`;

    const seaTempArr = mData?.hourly?.sea_surface_temperature || [];
    const rawSeaTemp = seaTempArr[startIdx] ?? seaTempArr.find((v) => v !== null) ?? 12.4;

    const waveHeightM = Number(
      curM.wave_height ?? mData?.hourly?.wave_height?.[startIdx] ?? 1.2
    );
    const swellHeightM = Number(
      curM.swell_wave_height ?? mData?.hourly?.swell_wave_height?.[startIdx] ?? waveHeightM
    );
    const swellPeriodSec = Number(
      curM.swell_wave_period ?? curM.wave_period ?? mData?.hourly?.swell_wave_period?.[startIdx] ?? 9
    );
    const swellDirDeg = Number(curM.swell_wave_direction ?? curM.wave_direction ?? 225);

    const hourlyForecast = [];
    for (let i = startIdx; i < Math.min(startIdx + 12, hTimes.length); i += 2) {
      const timeLabel = (hTimes[i] || "").slice(11, 16) || "12:00";
      const wSpd = Math.round(Number(wData.hourly?.wind_speed_10m?.[i] ?? curW.wind_speed_10m ?? 18));
      const wDir = degreesToCompass(wData.hourly?.wind_direction_10m?.[i] ?? curW.wind_direction_10m);
      const wvH = Number(mData?.hourly?.wave_height?.[i] ?? waveHeightM).toFixed(1);
      const rainMm = Number(wData.hourly?.precipitation?.[i] ?? 0).toFixed(1);
      const tempC = Math.round(Number(wData.hourly?.temperature_2m?.[i] ?? curW.temperature_2m ?? 12));

      hourlyForecast.push({
        time: timeLabel,
        windSpeedKmh: wSpd,
        windCompass: wDir,
        waveHeightM: wvH,
        rainMm,
        tempC
      });
    }

    return {
      isLive: true,
      fetchedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      airTempC: Number(curW.temperature_2m ?? 12).toFixed(1),
      seaTempC: Number(rawSeaTemp).toFixed(1),
      windSpeedKmh: Math.round(Number(curW.wind_speed_10m ?? 19)),
      windGustsKmh: Math.round(Number(curW.wind_gusts_10m ?? 28)),
      windDirectionDeg: Number(curW.wind_direction_10m ?? 220),
      windCompass: degreesToCompass(curW.wind_direction_10m ?? 220),
      pressureHpa: Math.round(pNow),
      pressureTrend,
      precipitationMm: Number(curW.precipitation ?? 0).toFixed(1),
      waveHeightM: Number(waveHeightM).toFixed(1),
      swellHeightM: Number(swellHeightM).toFixed(1),
      swellPeriodSec: Math.round(swellPeriodSec),
      swellDirectionCompass: degreesToCompass(swellDirDeg),
      hourlyForecast
    };
  } catch (err) {
    console.warn("Using fallback Cork marine forecast:", err);
    return getFallbackMarineWeather();
  }
}

function getFallbackMarineWeather() {
  return {
    isLive: false,
    fetchedAt: "Estimated Coastal Model",
    airTempC: "12.5",
    seaTempC: "12.8",
    windSpeedKmh: 22,
    windGustsKmh: 34,
    windDirectionDeg: 215,
    windCompass: "SW",
    pressureHpa: 1014,
    pressureTrend: "Steady ➡️",
    precipitationMm: "0.0",
    waveHeightM: "1.3",
    swellHeightM: "1.2",
    swellPeriodSec: 9,
    swellDirectionCompass: "SW",
    hourlyForecast: [
      { time: "09:00", windSpeedKmh: 18, windCompass: "SW", waveHeightM: "1.2", rainMm: "0.0", tempC: 11 },
      { time: "11:00", windSpeedKmh: 21, windCompass: "SW", waveHeightM: "1.3", rainMm: "0.0", tempC: 12 },
      { time: "13:00", windSpeedKmh: 24, windCompass: "SW", waveHeightM: "1.4", rainMm: "0.2", tempC: 13 },
      { time: "15:00", windSpeedKmh: 22, windCompass: "WSW", waveHeightM: "1.3", rainMm: "0.0", tempC: 13 },
      { time: "17:00", windSpeedKmh: 19, windCompass: "WSW", waveHeightM: "1.2", rainMm: "0.0", tempC: 12 },
      { time: "19:00", windSpeedKmh: 16, windCompass: "W", waveHeightM: "1.1", rainMm: "0.0", tempC: 11 }
    ]
  };
}

// ============================================================================
// 2. ASTRONOMICAL, MOON PHASE, SOLUNAR & SUN TIMES ENGINE (County Cork)
// ============================================================================

export function calculateAstronomicalAndSolunar(dateStr, lat = 51.85, lng = -8.47) {
  const dateObj = dateStr ? new Date(dateStr + "T12:00:00") : new Date();

  // Synodic Moon Phase calculation (Reference New Moon: Jan 6 2000 18:14 UTC)
  const synodicMonth = 29.53058867;
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const nowUtc = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 12, 0, 0);
  const daysSinceRef = (nowUtc - refNewMoon) / 86400000;
  const cycleFraction = ((daysSinceRef % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
  const lunarAgeDays = cycleFraction * synodicMonth;

  // Illumination %
  const illuminationPct = Math.round(((1 - Math.cos(cycleFraction * 2 * Math.PI)) / 2) * 100);

  let phaseName = "Waxing Crescent";
  let phaseEmoji = "🌒";
  if (cycleFraction < 0.03 || cycleFraction > 0.97) {
    phaseName = "New Moon (Spring Tide Peak)";
    phaseEmoji = "🌑";
  } else if (cycleFraction < 0.22) {
    phaseName = "Waxing Crescent";
    phaseEmoji = "🌒";
  } else if (cycleFraction < 0.28) {
    phaseName = "First Quarter (Neap Tide)";
    phaseEmoji = "🌓";
  } else if (cycleFraction < 0.47) {
    phaseName = "Waxing Gibbous";
    phaseEmoji = "🌔";
  } else if (cycleFraction < 0.53) {
    phaseName = "Full Moon (Spring Tide Peak)";
    phaseEmoji = "🌕";
  } else if (cycleFraction < 0.72) {
    phaseName = "Waning Gibbous";
    phaseEmoji = "🌖";
  } else if (cycleFraction < 0.78) {
    phaseName = "Last Quarter (Neap Tide)";
    phaseEmoji = "🌗";
  } else {
    phaseName = "Waning Crescent";
    phaseEmoji = "🌘";
  }

  // Spring vs Neap factor (1.0 = peak Spring tide at New/Full moon, 0.0 = peak Neap at Quarters)
  const springNeapFactor = Math.abs(Math.cos(cycleFraction * 2 * Math.PI));

  // Sunrise & Sunset for County Cork (~51.85°N, -8.47°W)
  const startOfYear = new Date(dateObj.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((dateObj - startOfYear) / 86400000);
  const declinationRad = 0.409 * Math.sin(((2 * Math.PI) / 365) * (dayOfYear - 81));
  const latRad = (lat * Math.PI) / 180;
  const cosHourAngle = Math.max(-0.95, Math.min(0.95, -Math.tan(latRad) * Math.tan(declinationRad)));
  const daylightHours = (2 * Math.acos(cosHourAngle) * 180) / (Math.PI * 15);

  // Solar noon at -8.47°W is ~12:34 UTC (plus DST if April-Oct)
  const isDst = dateObj.getMonth() >= 3 && dateObj.getMonth() <= 9;
  const solarNoonMinutes = Math.round((12.56 + (isDst ? 1 : 0)) * 60);
  const halfDayMinutes = Math.round((daylightHours / 2) * 60);

  const sunriseMin = solarNoonMinutes - halfDayMinutes;
  const sunsetMin = solarNoonMinutes + halfDayMinutes;
  const dawnMin = sunriseMin - 35;
  const duskMin = sunsetMin + 35;

  // Lunar transit & Moonrise / Moonset
  const lunarTransitMin = Math.round((solarNoonMinutes + cycleFraction * 1440) % 1440);
  const lunarUnderfootMin = (lunarTransitMin + 720) % 1440;
  const moonriseMin = (lunarTransitMin - 375 + 1440) % 1440;
  const moonsetMin = (lunarTransitMin + 375) % 1440;

  // Solunar Major (2 hrs centered on lunar transit & underfoot)
  const major1Start = (lunarTransitMin - 60 + 1440) % 1440;
  const major1End = (lunarTransitMin + 60) % 1440;
  const major2Start = (lunarUnderfootMin - 60 + 1440) % 1440;
  const major2End = (lunarUnderfootMin + 60) % 1440;

  // Solunar Minor (1 hr centered on moonrise & moonset)
  const minor1Start = (moonriseMin - 30 + 1440) % 1440;
  const minor1End = (moonriseMin + 30) % 1440;
  const minor2Start = (moonsetMin - 30 + 1440) % 1440;
  const minor2End = (moonsetMin + 30) % 1440;

  // Solunar Rating (3.0 to 5.0 scale based on spring/neap factor)
  const solunarScore = Number((3.2 + springNeapFactor * 1.8).toFixed(1));
  const solunarPct = Math.round(62 + springNeapFactor * 36);
  let solunarLabel = "High Feeding Activity";
  if (solunarScore >= 4.5) solunarLabel = "🔥 Peak Solunar Feeding Day (Spring Tide Window)";
  else if (solunarScore >= 3.8) solunarLabel = "⚡ Strong Solunar Bite Window";
  else solunarLabel = "👍 Moderate Solunar Activity (Focus on Dawn/Dusk & Flooding Tide)";

  return {
    phaseName,
    phaseEmoji,
    illuminationPct,
    lunarAgeDays: lunarAgeDays.toFixed(1),
    springNeapFactor,
    sunrise: formatMinutesToHHMM(sunriseMin),
    sunset: formatMinutesToHHMM(sunsetMin),
    dawn: formatMinutesToHHMM(dawnMin),
    dusk: formatMinutesToHHMM(duskMin),
    moonrise: formatMinutesToHHMM(moonriseMin),
    moonset: formatMinutesToHHMM(moonsetMin),
    majorWindows: [
      `${formatMinutesToHHMM(major1Start)} – ${formatMinutesToHHMM(major1End)}`,
      `${formatMinutesToHHMM(major2Start)} – ${formatMinutesToHHMM(major2End)}`
    ],
    minorWindows: [
      `${formatMinutesToHHMM(minor1Start)} – ${formatMinutesToHHMM(minor1End)}`,
      `${formatMinutesToHHMM(minor2Start)} – ${formatMinutesToHHMM(minor2End)}`
    ],
    solunarScore,
    solunarPct,
    solunarLabel
  };
}

// ============================================================================
// 3. LOCALIZED CORK COASTAL TIDE TABLE & HARMONIC CURVE GENERATOR
// ============================================================================

export function calculateCorkTidesForDate(station, dateStr) {
  const dateObj = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  const astro = calculateAstronomicalAndSolunar(dateStr, station.lat, station.lng);

  // Semi-diurnal lunar period M2 = 12h 25.2m (745.2 minutes)
  // Calibrated to official Marine Institute Ringaskiddy / Cobh High Water: 2026-11-08 04:25 UTC
  const m2PeriodMin = 745.2;
  const refCobhHighWaterUtc = Date.UTC(2026, 10, 8, 4, 25, 0);
  const dayStartUtc = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0);
  const elapsedMin = (dayStartUtc - refCobhHighWaterUtc) / 60000;

  const isDst = dateObj.getMonth() >= 3 && dateObj.getMonth() <= 9;
  const dstMinutes = isDst ? 60 : 0;

  const firstHighWaterMin =
    (((-elapsedMin % m2PeriodMin) + m2PeriodMin) % m2PeriodMin) +
    (station.offsetMinutes || 0) +
    dstMinutes;

  // Tidal range interpolated between Neap and Spring based on lunar phase
  const range =
    station.meanNeapRange +
    (station.meanSpringRange - station.meanNeapRange) * astro.springNeapFactor;
  const amplitude = range / 2;
  const midLevel = station.baseLevel;

  const tideCoefficient = Math.round(42 + astro.springNeapFactor * 64);
  let springNeapStatus = "Mid-Tide Phase";
  if (astro.springNeapFactor >= 0.72) {
    springNeapStatus = `Spring Tide (Coeff ${tideCoefficient})`;
  } else if (astro.springNeapFactor <= 0.32) {
    springNeapStatus = `Neap Tide (Coeff ${tideCoefficient})`;
  } else {
    springNeapStatus = `Medium Tide (Coeff ${tideCoefficient})`;
  }

  // Generate 24-hour curve (every 15 minutes = 97 points)
  const curvePoints = [];
  for (let min = 0; min <= 1440; min += 15) {
    const angle = ((min - firstHighWaterMin) / m2PeriodMin) * 2 * Math.PI;
    const height = midLevel + amplitude * Math.cos(angle);
    curvePoints.push({
      minutes: min,
      timeStr: formatMinutesToHHMM(min),
      heightM: Number(height.toFixed(2))
    });
  }

  // Compute exact High and Low tide extremes within 00:00 - 24:00
  const events = [];
  const halfPeriod = m2PeriodMin / 2;
  for (let k = -2; k <= 5; k++) {
    const eventMin = Math.round(firstHighWaterMin + k * halfPeriod);
    if (eventMin >= 0 && eventMin <= 1440) {
      const isHigh = k % 2 === 0;
      const h = isHigh ? midLevel + amplitude : Math.max(0.3, midLevel - amplitude);
      events.push({
        type: isHigh ? "HIGH" : "LOW",
        minutes: eventMin,
        timeStr: formatMinutesToHHMM(eventMin),
        heightM: h.toFixed(2)
      });
    }
  }

  return buildTideResultObject(station, springNeapStatus, tideCoefficient, range, events, curvePoints, false);
}

export async function fetchOfficialMarineInstituteTides(station, dateStr) {
  const baseTide = calculateCorkTidesForDate(station, dateStr);
  const erddapId = station.erddapStationId || "Ringaskiddy";
  const cleanDate = dateStr || new Date().toISOString().slice(0, 10);

  const startIso = `${cleanDate}T00:00:00Z`;
  const endIso = `${cleanDate}T23:59:59Z`;

  const highLowUrl =
    `https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.json` +
    `?stationID,time,tide_time_category,Water_Level_ODMalin` +
    `&stationID=%22${encodeURIComponent(erddapId)}%22&time>=${startIso}&time<=${endIso}`;

  const curveUrl =
    `https://erddap.marine.ie/erddap/tabledap/imiTidePrediction.json` +
    `?stationID,time,Water_Level,Water_Level_ODM` +
    `&stationID=%22${encodeURIComponent(erddapId)}%22&time>=${startIso}&time<=${endIso}`;

  try {
    const [hlRes, curveRes] = await Promise.allSettled([
      fetch(highLowUrl),
      fetch(curveUrl)
    ]);

    const datumOffset = Number(station.chartDatumOffsetM ?? 2.35);
    const offsetMin = erddapId === "Dungarvan" && station.id === "youghal" ? -5 : 0;

    let officialEvents = baseTide.events;
    if (hlRes.status === "fulfilled" && hlRes.value.ok) {
      const hlJson = await hlRes.value.json();
      const rows = hlJson?.table?.rows || [];
      if (rows.length > 0) {
        officialEvents = rows.map((r) => {
          const dt = new Date(r[1]);
          const dublinStr = dt.toLocaleTimeString("en-IE", {
            timeZone: "Europe/Dublin",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
          });
          const [hh, mm] = dublinStr.split(":").map(Number);
          const totalMin = Math.max(0, Math.min(1440, hh * 60 + mm + offsetMin));
          const cat = String(r[2] || "").toUpperCase().includes("HIGH") ? "HIGH" : "LOW";
          const heightLat = Math.max(0.2, Number(r[3] || 0) + datumOffset);
          return {
            type: cat,
            minutes: totalMin,
            timeStr: formatMinutesToHHMM(totalMin),
            heightM: heightLat.toFixed(2)
          };
        });
      }
    }

    let officialCurve = baseTide.curvePoints;
    if (curveRes.status === "fulfilled" && curveRes.value.ok) {
      const cJson = await curveRes.value.json();
      const rows = cJson?.table?.rows || [];
      if (rows.length > 0) {
        officialCurve = rows
          .filter((_, idx) => idx % 3 === 0) // Every 15 minutes from 5-min data
          .map((r) => {
            const dt = new Date(r[1]);
            const dublinStr = dt.toLocaleTimeString("en-IE", {
              timeZone: "Europe/Dublin",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            });
            const [hh, mm] = dublinStr.split(":").map(Number);
            const totalMin = Math.max(0, Math.min(1440, hh * 60 + mm + offsetMin));
            const wlLat = r[2] !== null && r[2] !== undefined ? Number(r[2]) : Number(r[3] || 0) + datumOffset;
            return {
              minutes: totalMin,
              timeStr: formatMinutesToHHMM(totalMin),
              heightM: Number(Math.max(0.1, wlLat).toFixed(2))
            };
          });
      }
    }

    const highs = officialEvents.filter((e) => e.type === "HIGH").map((e) => Number(e.heightM));
    const lows = officialEvents.filter((e) => e.type === "LOW").map((e) => Number(e.heightM));
    const calcRange =
      highs.length > 0 && lows.length > 0
        ? Math.max(...highs) - Math.min(...lows)
        : Number(baseTide.tidalRangeM);

    return buildTideResultObject(
      station,
      baseTide.springNeapStatus,
      baseTide.tideCoefficient,
      calcRange,
      officialEvents,
      officialCurve,
      true
    );
  } catch (err) {
    console.warn("Marine Institute ERDDAP fallback to calibrated harmonics:", err);
    return baseTide;
  }
}

function buildTideResultObject(station, springNeapStatus, tideCoefficient, range, events, curvePoints, isOfficial) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Interpolate current height from curvePoints
  let closestIdx = 0;
  let minDiff = 9999;
  curvePoints.forEach((pt, idx) => {
    const d = Math.abs(pt.minutes - nowMinutes);
    if (d < minDiff) {
      minDiff = d;
      closestIdx = idx;
    }
  });

  const currentPt = curvePoints[closestIdx] || { heightM: station.baseLevel };
  const prevPt = curvePoints[Math.max(0, closestIdx - 1)] || currentPt;
  const nextPt = curvePoints[Math.min(curvePoints.length - 1, closestIdx + 1)] || currentPt;
  const currentHeightM = Number(currentPt.heightM);
  const delta = Number(nextPt.heightM) - Number(prevPt.heightM);

  const nearExtreme = events.find((e) => Math.abs(e.minutes - nowMinutes) <= 25);
  let currentStage = "rising";
  let currentStageLabel = "🌊⬆️ Flooding (Rising Tide)";

  if (nearExtreme) {
    if (nearExtreme.type === "HIGH") {
      currentStage = "high";
      currentStageLabel = "⚓ High Water Slack";
    } else {
      currentStage = "low";
      currentStageLabel = "🐚 Low Water Slack (Bait Digging Window)";
    }
  } else if (delta >= 0) {
    currentStage = "rising";
    currentStageLabel = "🌊⬆️ Flooding (Rising Tide)";
  } else {
    currentStage = "ebbing";
    currentStageLabel = "🌊⬇️ Ebbing (Falling Tide)";
  }

  const nextEvent = events.find((e) => e.minutes > nowMinutes) || events[0];

  return {
    station,
    isOfficial,
    sourceLabel: isOfficial
      ? `Official Marine Institute Ireland (${station.erddapStationId})`
      : `Port of Cork Calibrated Harmonics`,
    springNeapStatus,
    tideCoefficient,
    tidalRangeM: Number(range).toFixed(1),
    currentHeightM,
    currentStage,
    currentStageLabel,
    nowMinutes,
    nextEvent,
    events,
    curvePoints
  };
}

// ============================================================================
// 4. SAFETY & COASTAL WARNINGS ENGINE (Cut-off + Swell/Gale Evaluator)
// ============================================================================

export function evaluateMarkSafety(mark, marineData, tideData) {
  const warnings = [];
  let overallLevel = "safe"; // 'safe' | 'caution' | 'danger'

  const windKmh = Number(marineData?.windSpeedKmh ?? 20);
  const gustsKmh = Number(marineData?.windGustsKmh ?? 28);
  const waveM = Number(marineData?.waveHeightM ?? 1.2);
  const swellPeriod = Number(marineData?.swellPeriodSec ?? 9);

  // 1. Check Atlantic Swell & Gale thresholds against Mark limits
  if (
    windKmh > mark.maxSafeWindKmh ||
    waveM > mark.maxSafeWaveM ||
    (mark.swellRiskLevel === "high" && swellPeriod >= 13 && waveM >= 1.1)
  ) {
    overallLevel = "danger";
    warnings.push({
      level: "danger",
      title: `🚨 SWELL / GALE WARNING AT ${mark.name.toUpperCase()}`,
      message: `Current conditions (${windKmh} km/h ${marineData?.windCompass || ""} winds, gusts ${gustsKmh} km/h, ${waveM}m swell @ ${swellPeriod}s) exceed the safe threshold (${mark.maxSafeWindKmh} km/h / ${mark.maxSafeWaveM}m) for this ${mark.type.toLowerCase()}. Choose a sheltered Cork Harbour or estuary mark instead.`
    });
  } else if (
    windKmh > mark.maxSafeWindKmh * 0.8 ||
    waveM > mark.maxSafeWaveM * 0.8
  ) {
    overallLevel = "caution";
    warnings.push({
      level: "caution",
      title: `⚠️ MODERATE SWELL / WIND CAUTION`,
      message: `Conditions (${windKmh} km/h winds, ${waveM}m wave height) are approaching the upper limit for ${mark.name}. ${mark.safetyNotes}`
    });
  }

  // 2. Check Rising Tide Cut-Off Alerts
  if (mark.cutoffRisk) {
    const isRisingNow = tideData?.currentStage === "rising";
    if (overallLevel === "safe") overallLevel = isRisingNow ? "caution" : "safe";
    warnings.push({
      level: isRisingNow ? "caution" : "info",
      title: isRisingNow
        ? `🌊 ACTIVE FLOODING TIDE CUT-OFF ALERT (${tideData?.station?.name || "Cork Coast"})`
        : `🌊 TIDAL CUT-OFF AWARENESS`,
      message: mark.cutoffWarning
    });
  }

  return {
    overallLevel,
    warnings
  };
}

export function formatMinutesToHHMM(totalMinutes) {
  const clean = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(clean / 60)).padStart(2, "0");
  const mm = String(clean % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
