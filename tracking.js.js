/**
 * SwiftRoute Courier Tracking Core Script
 */

// Global state variables
let mapInstance = null;
let currentTrackingData = null;
let watchlist = JSON.parse(localStorage.getItem('swiftroute_watchlist')) || [];
let customShipments = JSON.parse(localStorage.getItem('swiftroute_custom_shipments')) || {};

// Simulation variables
let simInterval = null;
let simIsPlaying = true;
let simSpeedMultiplier = 5;
let simTruckMarker = null;
let simRouteCoords = [];
let simCurrentIndex = 0;

// Constants: Major US Cities for procedural generator
const CITIES_DB = [
    { name: "Austin, TX", lat: 30.2672, lng: -97.7431 },
    { name: "Seattle, WA", lat: 47.6062, lng: -122.3321 },
    { name: "Miami, FL", lat: 25.7617, lng: -80.1918 },
    { name: "New York, NY", lat: 40.7128, lng: -74.0060 },
    { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
    { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
    { name: "Denver, CO", lat: 39.7392, lng: -104.9903 },
    { name: "Atlanta, GA", lat: 33.7490, lng: -84.3880 },
    { name: "Boston, MA", lat: 42.3601, lng: -71.0589 },
    { name: "Minneapolis, MN", lat: 44.9778, lng: -93.2650 },
    { name: "Dallas, TX", lat: 32.7767, lng: -96.7970 },
    { name: "San Francisco, CA", lat: 37.7749, lng: -122.4194 }
];

// Pre-seeded shipments database
const SHIPMENTS_DATABASE = {
    "SR-987-654": {
        id: "SR-987-654",
        status: "delivered",
        percentage: 100,
        service: "SwiftRoute Priority Overnight",
        weight: "4.8 lbs / 2.2 kg",
        dims: "12\" x 10\" x 6\"",
        origin: "Austin, TX",
        destination: "Seattle, WA",
        dateText: "Delivered on Thursday, July 9 at 2:14 PM",
        timeline: [
            { title: "Delivered", time: "July 9 - 2:14 PM", location: "Seattle, WA", desc: "Left at front door. Signed by J. SMITH.", geo: [47.6062, -122.3321] },
            { title: "Out for Delivery", time: "July 9 - 8:30 AM", location: "Seattle, WA", desc: "Loaded onto local delivery vehicle.", geo: [47.6062, -122.3321] },
            { title: "Arrived at Sort Facility", time: "July 8 - 11:45 PM", location: "Seattle, WA", desc: "Processed through sorting hub.", geo: [47.5000, -122.3000] },
            { title: "In Transit", time: "July 8 - 4:20 PM", location: "Denver, CO", desc: "Departed Denver central exchange.", geo: [39.7392, -104.9903] },
            { title: "Departed Origin Hub", time: "July 7 - 9:00 PM", location: "Austin, TX", desc: "En route to sorting facility.", geo: [30.2672, -97.7431] },
            { title: "Shipment Picked Up", time: "July 7 - 3:30 PM", location: "Austin, TX", desc: "Received at origin center.", geo: [30.2672, -97.7431] }
        ]
    },
    "SR-321-456": {
        id: "SR-321-456",
        status: "in-transit",
        percentage: 60,
        service: "SwiftRoute Standard Ground",
        weight: "12.2 lbs / 5.5 kg",
        dims: "18\" x 14\" x 10\"",
        origin: "Miami, FL",
        destination: "Boston, MA",
        dateText: "Friday, July 10 by 8:00 PM",
        timeline: [
            { title: "Departed Transit Facility", time: "July 9 - 9:40 AM", location: "Atlanta, GA", desc: "In transit to destination hub.", geo: [33.7490, -84.3880] },
            { title: "Arrived at sorting center", time: "July 8 - 11:15 PM", location: "Atlanta, GA", desc: "Package sorted.", geo: [33.7490, -84.3880] },
            { title: "In Transit", time: "July 8 - 6:00 AM", location: "Miami, FL", desc: "Shipment in transit.", geo: [25.7617, -80.1918] },
            { title: "Shipment Picked Up", time: "July 7 - 4:15 PM", location: "Miami, FL", desc: "Received at carrier location.", geo: [25.7617, -80.1918] }
        ]
    },
    "SR-777-888": {
        id: "SR-777-888",
        status: "pending", // out for delivery represents pending state in top level tracker progress
        percentage: 85,
        service: "SwiftRoute Local Express Check",
        weight: "1.5 lbs / 0.7 kg",
        dims: "9\" x 6\" x 2\"",
        origin: "Chicago, IL",
        destination: "Minneapolis, MN",
        dateText: "Today, July 9 by 6:00 PM",
        timeline: [
            { title: "Out for Delivery", time: "July 9 - 9:02 AM", location: "Minneapolis, MN", desc: "Courier is on the way to your delivery drop.", geo: [44.9778, -93.2650] },
            { title: "Arrived at Local Facility", time: "July 9 - 5:10 AM", location: "Minneapolis, MN", desc: "Sorted to dispatch truck.", geo: [44.9778, -93.2650] },
            { title: "In Transit", time: "July 8 - 8:30 PM", location: "Madison, WI", desc: "Departed Wisconsin hub.", geo: [43.0731, -89.4012] },
            { title: "Shipment Created", time: "July 8 - 10:15 AM", location: "Chicago, IL", desc: "Shipping label printed.", geo: [41.8781, -87.6298] }
        ]
    }
};

// Procedural Generator for custom IDs
function generateProceduralTracking(trkid) {
    // Generate deterministic values based on searching ID string length and code hashing
    let hash = 0;
    for (let i = 0; i < trkid.length; i++) {
        hash = trkid.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);

    const statuses = ["delivered", "in-transit", "pending"];
    const status = statuses[hash % statuses.length];

    // Choose distinct origin/destination from major cities
    const originIdx = hash % CITIES_DB.length;
    const destIdx = (hash + 5) % CITIES_DB.length;
    const origin = CITIES_DB[originIdx];
    const dest = CITIES_DB[destIdx === originIdx ? (destIdx + 1) % CITIES_DB.length : destIdx];

    let percentage = 40;
    if (status === "delivered") percentage = 100;
    else if (status === "pending") percentage = 85;
    else percentage = 40 + (hash % 30); // 40-70

    // Construct shipping dates
    const dateOpts = ["Wednesday", "Thursday", "Friday", "Monday"];
    const randomDay = dateOpts[hash % dateOpts.length];
    const dateText = status === "delivered"
        ? `Delivered on ${randomDay}, July ${7 + (hash % 3)} at 11:${10 + (hash % 45)} AM`
        : `${randomDay}, July ${10 + (hash % 6)} by 5:00 PM`;

    const services = ["SwiftRoute Domestic Saver", "SwiftRoute Priority Freight", "SwiftRoute Air Standard", "SwiftRoute 3-Day Select"];
    const service = services[hash % services.length];

    const weight = `${(2.2 + (hash % 25) * 0.75).toFixed(1)} lbs / ${(1.0 + (hash % 25) * 0.34).toFixed(1)} kg`;
    const dims = `${10 + (hash % 8)}" x ${8 + (hash % 6)}" x ${4 + (hash % 5)}"`;

    // Timeline creation
    const timeline = [];
    const stepCount = status === "delivered" ? 5 : 3;

    // Step definitions
    if (status === "delivered") {
        timeline.push({ title: "Delivered", time: "July 9 - 11:32 AM", location: dest.name, desc: "Delivered and left at front desk.", geo: [dest.lat, dest.lng] });
        timeline.push({ title: "Out for Delivery", time: "July 9 - 8:15 AM", location: dest.name, desc: "On vehicle.", geo: [dest.lat, dest.lng] });
        timeline.push({ title: "Arrived at Destination Facility", time: "July 8 - 9:30 PM", location: dest.name, desc: "Processed.", geo: [dest.lat, dest.lng] });
    } else if (status === "pending") {
        timeline.push({ title: "Out for Delivery", time: "July 9 - 9:00 AM", location: dest.name, desc: "With local courier.", geo: [dest.lat, dest.lng] });
        timeline.push({ title: "Arrived at Sort Center", time: "July 9 - 4:40 AM", location: dest.name, desc: "Unloaded at destination branch.", geo: [dest.lat, dest.lng] });
    } else {
        timeline.push({ title: "In Transit", time: "July 9 - 10:15 AM", location: origin.name, desc: "Carrier departed origin depot.", geo: [origin.lat, origin.lng] });
    }

    // Mid route waypoint coords
    const midLat = (origin.lat + dest.lat) / 2 + (hash % 10 - 5) * 0.4;
    const midLng = (origin.lng + dest.lng) / 2 + (hash % 10 - 5) * 0.4;
    timeline.push({ title: "In Transit - Hub Scan", time: "July 8 - 4:40 PM", location: "Central Sorting Hub", desc: "Sorted and dispatched.", geo: [midLat, midLng] });
    timeline.push({ title: "Shipment Picked Up", time: "July 7 - 10:00 AM", location: origin.name, desc: "Collected by routing system.", geo: [origin.lat, origin.lng] });

    return {
        id: trkid,
        status,
        percentage,
        service,
        weight,
        dims,
        origin: origin.name,
        destination: dest.name,
        dateText,
        timeline
    };
}

// Global App Initialization
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initAppEvents();
    renderWatchlist();
    initShipmentPortal();

    // Auto-load a demo tracking number on initial page hit so the layout sits beautifully
    setTimeout(() => {
        executeSearch("SR-987-654", true);
    }, 150);
});

// Theme Toggle Functionality
function initTheme() {
    const defaultTheme = localStorage.getItem('swiftroute_theme') || 'dark';
    if (defaultTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }

    const themeBtn = document.getElementById("theme-toggle-btn");
    themeBtn.addEventListener("click", () => {
        if (document.body.classList.contains("dark-theme")) {
            document.body.classList.replace("dark-theme", "light-theme");
            localStorage.setItem('swiftroute_theme', 'light');
            showToast("Visual theme shifted to Light Mode");
        } else {
            document.body.classList.replace("light-theme", "dark-theme");
            localStorage.setItem('swiftroute_theme', 'dark');
            showToast("Visual theme shifted to Dark Mode");
        }

        // Leaflet maps redraw tiles cleanly on theme switch
        if (mapInstance) {
            setTimeout(() => {
                mapInstance.invalidateSize();
            }, 300);
        }
    });
}

// Navigation and event listeners binding
function initAppEvents() {
    const searchForm = document.getElementById("search-form");
    const searchInput = document.getElementById("tracking-input");

    searchForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const rawId = searchInput.value.trim().toUpperCase();
        if (rawId) {
            executeSearch(rawId);
        }
    });

    // Quick suggestion badges
    document.querySelectorAll(".suggest-badge").forEach(badge => {
        badge.addEventListener("click", (e) => {
            const trkId = e.target.getAttribute("data-trkid");
            searchInput.value = trkId;
            switchTab('tracker');
            executeSearch(trkId);
        });
    });

    // Watchlist trigger btn
    const wlBtn = document.getElementById("watchlist-toggle-btn");
    wlBtn.addEventListener("click", () => {
        if (!currentTrackingData) return;
        toggleSaveToWatchlist(currentTrackingData);
    });

    // Setup tab switcher binding
    document.getElementById("nav-tracker-btn").addEventListener("click", (e) => {
        e.preventDefault();
        switchTab('tracker');
    });
    document.getElementById("nav-ship-btn").addEventListener("click", (e) => {
        e.preventDefault();
        switchTab('shipment-portal');
    });
    document.getElementById("nav-watchlist-btn").addEventListener("click", (e) => {
        e.preventDefault();
        switchTab('watchlist');
    });

    document.querySelector(".logo-area").addEventListener("click", () => {
        switchTab('tracker');
    });
}

// Core Tracking Command Lookup Method
function executeSearch(trackingID, isSilent = false) {
    const trackBtn = document.getElementById("track-btn");
    const spinner = trackBtn?.querySelector(".btn-spinner");
    const btnText = trackBtn?.querySelector(".btn-text");

    if (!isSilent && trackBtn) {
        trackBtn.disabled = true;
        spinner.classList.remove("hidden");
        btnText.textContent = "Tracing Cargo...";
    }

    // Artificial network lag delay for satisfying user feel (800ms)
    setTimeout(() => {
        // Core DB search lookup, custom shipments lookup, or procedurally generate
        let trackingData = SHIPMENTS_DATABASE[trackingID] || customShipments[trackingID];
        if (!trackingData) {
            trackingData = generateProceduralTracking(trackingID);
        }

        currentTrackingData = trackingData;

        // Reset submit button state
        if (trackBtn) {
            trackBtn.disabled = false;
            spinner.classList.add("hidden");
            btnText.textContent = "Track Shipment";
        }

        // Show Results Layout
        document.getElementById("results-section").classList.remove("hidden");
        document.getElementById("empty-state-section").classList.add("hidden");

        // Bind Data onto DOM elements
        populateTrackingUI(trackingData);

        // Map rendering
        setUpLeafletMap(trackingData);

        // Toast feedback
        if (!isSilent) {
            showToast(`Shipment trace complete: ${trackingID}`);
        }

    }, isSilent ? 0 : 800);
}

// Bind shipment details inside document grid
function populateTrackingUI(data) {
    // Badges & status Text formatting
    const statusTextNode = document.getElementById("txt-status-badge");
    const badgeWrapperNode = document.getElementById("status-badge-indicator");

    // Status text values
    statusTextNode.textContent = data.status === "delivered" ? "Delivered" :
        data.status === "in-transit" ? "In Transit" : "Pending Pickup";

    // Standard classes cleanup
    badgeWrapperNode.className = "status-badge";
    badgeWrapperNode.classList.add(data.status);

    // Timeline delivery target
    document.getElementById("txt-delivery-date").textContent = data.dateText;
    document.getElementById("delivery-heading").textContent = data.status === "delivered" ? "Completed Delivery" : "Estimated Arrival";

    // Progress Bar percent
    const barFillNode = document.getElementById("status-percentage-fill");
    barFillNode.style.width = `${data.percentage}%`;

    // Map labels headers
    document.getElementById("map-route-text").textContent = `${data.origin} to ${data.destination}`;

    // Spec card nodes
    document.getElementById("spec-trkid").textContent = data.id;
    document.getElementById("spec-service").textContent = data.service;
    document.getElementById("spec-weight").textContent = data.weight;
    document.getElementById("spec-dims").textContent = data.dims;
    document.getElementById("spec-origin").textContent = data.origin;
    document.getElementById("spec-dest").textContent = data.destination;

    // Render Watchlist state button highlight
    updateWatchlistButtonHighlight(data.id);

    // Build timeline stepper steps elements
    const stepperContainer = document.getElementById("timeline-stepper-container");
    stepperContainer.innerHTML = ""; // reset

    data.timeline.forEach((step, idx) => {
        const isLatestClass = idx === 0 ? "latest" : "";
        const stepHTML = `
            <div class="timeline-step ${isLatestClass}">
                <div class="step-marker"></div>
                <div class="step-details">
                    <div class="step-header">
                        <span class="step-title">${step.title}</span>
                        <span class="step-time">${step.time}</span>
                    </div>
                    <span class="step-location">📍 ${step.location}</span>
                    <span class="step-msg">${step.desc}</span>
                </div>
            </div>
        `;
        stepperContainer.innerHTML += stepHTML;
    });

    // Update active label status on progress-bar helper
    const transitLabel = document.getElementById("progress-transit-label");
    const deliveryLabel = document.getElementById("progress-delivery-label");

    transitLabel.className = "";
    deliveryLabel.className = "";

    if (data.status === "delivered") {
        transitLabel.classList.add("done");
        deliveryLabel.classList.add("active");
    } else if (data.status === "in-transit") {
        transitLabel.classList.add("active");
    } else {
        // Out for Delivery or Pending pickup
        transitLabel.classList.add("done");
        deliveryLabel.classList.add("done");
    }
}

// Leaflet Map Orchestrator
function setUpLeafletMap(data) {
    const mapTarget = document.getElementById("map-target");
    if (!mapTarget) return;

    // Release pre-existing maps to prevent leaflet internal bindings collisions
    if (mapInstance !== null) {
        mapInstance.remove();
        mapInstance = null;
    }

    // Extrapolate map checkpoints
    const travelCoords = data.timeline
        .filter(step => step.geo && step.geo.length === 2)
        .map(step => step.geo);

    if (travelCoords.length === 0) return;

    // Center on the latest event coordinate
    const centerPoint = travelCoords[0];

    // Initialize leaflet instance
    mapInstance = L.map('map-target', {
        zoomControl: true,
        scrollWheelZoom: false
    }).setView(centerPoint, 5);

    // Load OpenStreetMap tiles
    // Dark mode maps vs Light mode maps selection
    const isDark = document.body.classList.contains("dark-theme");
    const osmUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    const osmAttrib = isDark
        ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

    L.tileLayer(osmUrl, {
        attribution: osmAttrib,
        maxZoom: 20
    }).addTo(mapInstance);

    // Render Waypoints & Marker circles
    const routeSteps = filteredTimeline.slice().reverse();
    travelCoords.forEach((coord, index) => {
        const isOrigin = index === 0;
        const colorVal = isOrigin ? '#ff6200' : '#8a2be2';
        const fillAlpha = isOrigin ? 0.9 : 0.6;
        const radiusSize = isOrigin ? 8 : 6;

        const circleMarker = L.circleMarker(coord, {
            radius: radiusSize,
            fillColor: colorVal,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: fillAlpha
        }).addTo(mapInstance);

        const step = routeSteps[index];
        circleMarker.bindPopup(`<strong>${step.title}</strong><br>📍 ${step.location}<br><small>${step.time}</small>`);
    });

    // Draw connecting dash-dotted polyline path trace
    if (travelCoords.length > 1) {
        const routeLine = L.polyline(travelCoords, {
            color: '#ff6200',
            weight: 3,
            opacity: 0.8,
            dashArray: '5, 8'
        }).addTo(mapInstance);

        // Zoom map to fit line boundaries
        mapInstance.fitBounds(routeLine.getBounds(), {
            padding: [40, 40]
        });
    }
}

// Watchlist Dashboard Management
function toggleSaveToWatchlist(data) {
    const existsIdx = watchlist.findIndex(item => item.id === data.id);

    if (existsIdx > -1) {
        watchlist.splice(existsIdx, 1);
        showToast(`Removed ${data.id} from Watchlist`);
    } else {
        watchlist.push({
            id: data.id,
            status: data.status,
            origin: data.origin,
            destination: data.destination,
            dateText: data.dateText
        });
        showToast(`Saved ${data.id} to Watchlist`);
    }

    localStorage.setItem('swiftroute_watchlist', JSON.stringify(watchlist));
    updateWatchlistButtonHighlight(data.id);
    renderWatchlist();
}

function updateWatchlistButtonHighlight(trkid) {
    const wlBtn = document.getElementById("watchlist-toggle-btn");
    const wlText = document.getElementById("watchlist-btn-text");
    const exists = watchlist.some(item => item.id === trkid);

    if (exists) {
        wlBtn.classList.add("saved");
        wlText.textContent = "Watching Parcel";
    } else {
        wlBtn.classList.remove("saved");
        wlText.textContent = "Save to Watchlist";
    }
}

function renderWatchlist() {
    const target = document.getElementById("watchlist-items-target");
    const emptyState = document.getElementById("watchlist-empty-state");

    if (!target) return;
    target.innerHTML = ""; // reset

    if (watchlist.length === 0) {
        emptyState.classList.remove("hidden");
        return;
    }

    emptyState.classList.add("hidden");

    watchlist.forEach(item => {
        const itemCard = document.createElement("div");
        itemCard.className = "watch-item-card";

        // Stop click propagation on remove trigger
        itemCard.innerHTML = `
            <div class="watch-header">
                <div>
                    <span class="watch-id">${item.id}</span>
                    <div class="watch-meta">
                        <span class="watch-status ${item.status}">${item.status.replace('-', ' ')}</span>
                        <span class="watch-date">${item.dateText}</span>
                    </div>
                </div>
                <button class="watch-remove-btn" label="Remove container" onclick="removeWatchlistItem(event, '${item.id}')">&times;</button>
            </div>
        `;

        itemCard.addEventListener("click", () => {
            document.getElementById("tracking-input").value = item.id;
            switchTab('tracker');
            executeSearch(item.id);
            // scroll back to top search bar area
            document.getElementById("tracker").scrollIntoView({ behavior: 'smooth' });
        });

        target.appendChild(itemCard);
    });
}

function removeWatchlistItem(event, trkid) {
    event.stopPropagation(); // prevent clicking card search lookup
    watchlist = watchlist.filter(item => item.id !== trkid);
    localStorage.setItem('swiftroute_watchlist', JSON.stringify(watchlist));
    showToast(`Removed ${trkid} from watchlist`);

    if (currentTrackingData && currentTrackingData.id === trkid) {
        updateWatchlistButtonHighlight(trkid);
    }
    renderWatchlist();
}

// Action Modals Orchestration
let activeActionType = "";

function openActionModal(actionType) {
    const modal = document.getElementById("action-modal");
    const title = document.getElementById("modal-title");
    const body = document.getElementById("modal-body-content");
    const affirmBtn = document.getElementById("modal-affirm-btn");

    activeActionType = actionType;
    modal.classList.remove("hidden");

    if (!currentTrackingData) return;

    if (actionType === 'hold') {
        title.textContent = "Hold Shipment at Facility";
        body.innerHTML = `
            <p>You can request to reroute package <strong>${currentTrackingData.id}</strong> to a nearby hub location for pickup option.</p>
            <label for="hold-location-select" style="display:block; margin-top:1rem; font-weight:600; color:var(--text-primary)">Select Facility Location:</label>
            <select id="hold-location-select">
                <option value="hub-nearest">Main Sorting Facility (1.2 miles away)</option>
                <option value="retail-west">SwiftRoute Retail Branch West (3.4 miles away)</option>
                <option value="retail-east">SwiftRoute Ground Hub East (5.8 miles away)</option>
            </select>
        `;
        affirmBtn.textContent = "Request Hold";
    }
    else if (actionType === 'instructions') {
        title.textContent = "Add Delivery Instructions";
        body.innerHTML = `
            <p>Leave specific notes for the courier regarding parcel drop-off details for <strong>${currentTrackingData.id}</strong>.</p>
            <label for="instructions-textarea" style="display:block; margin-top:1rem; font-weight:600; color:var(--text-primary)">Driver Instructions:</label>
            <input type="text" id="instructions-textarea" placeholder="e.g. Leave behind the flower pot on front porch, Gate code: 1234">
        `;
        affirmBtn.textContent = "Save Instructions";
    }
    else if (actionType === 'alerts') {
        title.textContent = "Subscribe to Tracking Alerts";
        body.innerHTML = `
            <p>Get push status notifications directly on email or SMS for package <strong>${currentTrackingData.id}</strong> updates.</p>
            <label for="alerts-email" style="display:block; margin-top:1rem; font-weight:600; color:var(--text-primary)">Email Address:</label>
            <input type="email" id="alerts-email" placeholder="user@domain.com">
            
            <label for="alerts-sms" style="display:block; margin-top:0.75rem; font-weight:600; color:var(--text-primary)">Phone Number (SMS):</label>
            <input type="text" id="alerts-sms" placeholder="+1 (555) 000-0000">
        `;
        affirmBtn.textContent = "Subscribe Alerts";
    }
}

function closeActionModal(event) {
    const modal = document.getElementById("action-modal");
    modal.classList.add("hidden");
    activeActionType = "";
}

function confirmActionModal() {
    closeActionModal();

    if (activeActionType === 'hold') {
        showToast("Success: Deliver-hold scheduled successfully");
    } else if (activeActionType === 'instructions') {
        showToast("Success: Driver instructions saved");
    } else if (activeActionType === 'alerts') {
        showToast("Success: Notification alert subscription active");
    }
}

// Toast Popup messaging Utility
function showToast(message, type = 'success') {
    const container = document.getElementById("toast-wrapper");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Auto fade after 3.5s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, 3500);
}

// ==========================================================================
// Telemetry Map Simulation & Customer Shipment Portal Helpers
// ==========================================================================

function getDensePath(waypoints, stepsPerSegment = 100) {
    const densePath = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        for (let step = 0; step < stepsPerSegment; step++) {
            const t = step / stepsPerSegment;
            const lat = start[0] + (end[0] - start[0]) * t;
            const lng = start[1] + (end[1] - start[1]) * t;
            densePath.push([lat, lng]);
        }
    }
    densePath.push(waypoints[waypoints.length - 1]);
    return densePath;
}

function startRouteSimulation(densePath, marker, mapInstance) {
    if (simInterval) clearInterval(simInterval);

    simRouteCoords = densePath;
    simTruckMarker = marker;
    simCurrentIndex = 0;
    simIsPlaying = true;

    updatePlayButtonUI(simIsPlaying);

    const speedSelect = document.getElementById("ctrl-sim-speed");
    simSpeedMultiplier = parseInt(speedSelect.value) || 5;

    const hud = document.getElementById("map-telemetry-hud");
    if (hud) hud.classList.remove("hidden");

    function tick() {
        if (!simIsPlaying) return;

        simCurrentIndex += simSpeedMultiplier;
        if (simCurrentIndex >= simRouteCoords.length) {
            simCurrentIndex = simRouteCoords.length - 1;
            simIsPlaying = false;
            updatePlayButtonUI(false);
            clearInterval(simInterval);

            const sigDot = document.querySelector(".signal-dot");
            if (sigDot) sigDot.classList.remove("pulsing");
            const sigTxt = document.querySelector(".signal-text");
            if (sigTxt) sigTxt.textContent = "GPS STANDBY";

            const spdReadout = document.getElementById("tel-speed");
            if (spdReadout) spdReadout.textContent = "0 mph";

            const truckWrapper = document.getElementById("hud-truck-icon");
            if (truckWrapper) truckWrapper.classList.remove("moving");

            showToast("Package has arrived at its active routing node!");
            return;
        }

        const currentPos = simRouteCoords[simCurrentIndex];
        simTruckMarker.setLatLng(currentPos);

        // Telemetry HUD Coord indicator
        const coordinateIndicator = document.getElementById("tel-coords");
        if (coordinateIndicator) {
            coordinateIndicator.textContent = `${currentPos[0].toFixed(5)}, ${currentPos[1].toFixed(5)}`;
        }

        // Speed calculation
        let baseSpeed = 62;
        let speedJitter = (Math.sin(simCurrentIndex * 0.15) * 5) + (Math.random() * 2 - 1);
        let currentSpeed = Math.max(15, Math.min(80, Math.round(baseSpeed + speedJitter)));

        // Slow down around start, midpoint hub, and destination.
        const segmentLen = Math.floor(simRouteCoords.length / 2);
        const midPointIdx = segmentLen;
        const distToMid = Math.abs(simCurrentIndex - midPointIdx);

        if (simCurrentIndex < 15 || (simRouteCoords.length - simCurrentIndex) < 15 || distToMid < 15) {
            currentSpeed = Math.round(currentSpeed * 0.35);
        }

        const spdReadout = document.getElementById("tel-speed");
        if (spdReadout) spdReadout.textContent = `${currentSpeed} mph`;

        // Ensure dot is pulsing
        const sigDot = document.querySelector(".signal-dot");
        if (sigDot && !sigDot.classList.contains("pulsing")) {
            sigDot.classList.add("pulsing");
            const sigTxt = document.querySelector(".signal-text");
            if (sigTxt) sigTxt.textContent = "GPS ACTIVE";
        }
    }

    simInterval = setInterval(tick, 100);
}

function updatePlayButtonUI(playing) {
    const playBtn = document.getElementById("ctrl-sim-play");
    if (!playBtn) return;
    if (playing) {
        playBtn.classList.add("active-pause");
        playBtn.innerHTML = `
            <svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
            </svg>
        `;
    } else {
        playBtn.classList.remove("active-pause");
        playBtn.innerHTML = `
            <svg class="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
        `;
    }
}

function toggleSimPlay() {
    if (simCurrentIndex >= simRouteCoords.length - 1) {
        replaySimulation();
        return;
    }
    simIsPlaying = !simIsPlaying;
    updatePlayButtonUI(simIsPlaying);

    const truckWrapper = document.getElementById("hud-truck-icon");
    if (truckWrapper) {
        if (simIsPlaying) truckWrapper.classList.add("moving");
        else truckWrapper.classList.remove("moving");
    }
}

function replaySimulation() {
    if (simInterval) clearInterval(simInterval);

    simCurrentIndex = 0;
    simIsPlaying = true;
    updatePlayButtonUI(true);
    const sigDot = document.querySelector(".signal-dot");
    if (sigDot) sigDot.classList.add("pulsing");
    const sigTxt = document.querySelector(".signal-text");
    if (sigTxt) sigTxt.textContent = "GPS ACTIVE";

    const truckWrapper = document.getElementById("hud-truck-icon");
    if (truckWrapper) truckWrapper.classList.add("moving");

    startRouteSimulation(simRouteCoords, simTruckMarker, mapInstance);
}

function bindSimulationControls() {
    const playBtn = document.getElementById("ctrl-sim-play");
    const replayBtn = document.getElementById("ctrl-sim-replay");
    const speedSelect = document.getElementById("ctrl-sim-speed");

    if (playBtn) {
        // Clone to remove previous event listeners
        const newPlayBtn = playBtn.cloneNode(true);
        playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
        newPlayBtn.addEventListener("click", () => {
            toggleSimPlay();
        });
    }

    if (replayBtn) {
        const newReplayBtn = replayBtn.cloneNode(true);
        replayBtn.parentNode.replaceChild(newReplayBtn, replayBtn);
        newReplayBtn.addEventListener("click", () => {
            replaySimulation();
        });
    }

    if (speedSelect) {
        const newSpeedSelect = speedSelect.cloneNode(true);
        speedSelect.parentNode.replaceChild(newSpeedSelect, speedSelect);
        newSpeedSelect.addEventListener("change", (e) => {
            simSpeedMultiplier = parseInt(e.target.value) || 5;
        });
    }
}

function switchTab(tabId) {
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
    });

    if (tabId === 'tracker') {
        document.getElementById("nav-tracker-btn").classList.add("active");
        document.getElementById("tracker").classList.remove("hidden");

        if (currentTrackingData) {
            document.getElementById("results-section").classList.remove("hidden");
            document.getElementById("empty-state-section").classList.add("hidden");
            if (mapInstance) {
                setTimeout(() => {
                    mapInstance.invalidateSize();
                }, 50);
            }
        } else {
            document.getElementById("empty-state-section").classList.remove("hidden");
            document.getElementById("results-section").classList.add("hidden");
        }

        document.getElementById("shipment-portal").classList.add("hidden");
        document.getElementById("watchlist").classList.add("hidden");
    }
    else if (tabId === 'shipment-portal') {
        document.getElementById("nav-ship-btn").classList.add("active");

        document.getElementById("tracker").classList.add("hidden");
        document.getElementById("results-section").classList.add("hidden");
        document.getElementById("empty-state-section").classList.add("hidden");
        document.getElementById("shipment-portal").classList.remove("hidden");
        document.getElementById("watchlist").classList.add("hidden");
    }
    else if (tabId === 'watchlist') {
        document.getElementById("nav-watchlist-btn").classList.add("active");

        document.getElementById("tracker").classList.add("hidden");
        document.getElementById("results-section").classList.add("hidden");
        document.getElementById("empty-state-section").classList.add("hidden");
        document.getElementById("shipment-portal").classList.add("hidden");
        document.getElementById("watchlist").classList.remove("hidden");

        renderWatchlist();
    }
}

function initShipmentPortal() {
    const shipForm = document.getElementById("shipment-generator-form");
    if (!shipForm) return;

    shipForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const originVal = document.getElementById("ship-origin").value;
        const destVal = document.getElementById("ship-destination").value;
        const weightVal = parseFloat(document.getElementById("ship-weight").value);
        const serviceVal = document.getElementById("ship-service").value;

        if (!originVal || !destVal) {
            showToast("Please select both origin and destination cities.", "error");
            return;
        }

        if (originVal === destVal) {
            showToast("Origin and Destination cannot be the same city!", "error");
            return;
        }

        // Generate random ID, e.g. SR-852-194
        const r1 = Math.floor(100 + Math.random() * 900);
        const r2 = Math.floor(100 + Math.random() * 900);
        const generatedId = `SR-${r1}-${r2}`;

        // Coordinate resolution
        const originCity = CITIES_DB.find(c => c.name === originVal);
        const destCity = CITIES_DB.find(c => c.name === destVal);

        if (!originCity || !destCity) {
            showToast("Failed to lookup city coordinates.", "error");
            return;
        }

        // Midpoint hub coordinate with slight offset
        const midLat = (originCity.lat + destCity.lat) / 2 + (Math.random() - 0.5) * 0.4;
        const midLng = (originCity.lng + destCity.lng) / 2 + (Math.random() - 0.5) * 0.4;

        const now = new Date();
        const formatTime = (d) => {
            const months = ["July", "Aug", "Sept"];
            const hr = d.getHours();
            const min = d.getMinutes();
            const ampm = hr >= 12 ? 'PM' : 'AM';
            const fhr = hr % 12 || 12;
            const fmin = min < 10 ? '0' + min : min;
            return `${months[0]} ${d.getDate()} - ${fhr}:${fmin} ${ampm}`;
        };

        const customShipmentData = {
            id: generatedId,
            status: "in-transit",
            percentage: 45,
            service: serviceVal,
            weight: `${weightVal.toFixed(1)} lbs / ${(weightVal * 0.453592).toFixed(1)} kg`,
            dims: `${10 + Math.floor(Math.random() * 6)}" x ${8 + Math.floor(Math.random() * 6)}" x ${4 + Math.floor(Math.random() * 4)}"`,
            origin: originVal,
            destination: destVal,
            dateText: `Delivery set for Friday, July 17 by 8:00 PM`,
            timeline: [
                {
                    title: "In Transit",
                    time: formatTime(now),
                    location: originVal,
                    desc: "Carrier departed origin facility.",
                    geo: [originCity.lat, originCity.lng]
                },
                {
                    title: "Shipment Picked Up",
                    time: formatTime(new Date(now.getTime() - 2.5 * 60 * 60 * 1000)),
                    location: originVal,
                    desc: "Collected from customer drop-off.",
                    geo: [originCity.lat, originCity.lng]
                }
            ],
            customRoutePoints: [
                [originCity.lat, originCity.lng],
                [midLat, midLng],
                [destCity.lat, destCity.lng]
            ]
        };

        customShipments[generatedId] = customShipmentData;
        localStorage.setItem('swiftroute_custom_shipments', JSON.stringify(customShipments));

        // Automatically save to Watchlist
        const existsInWatchlist = watchlist.some(item => item.id === generatedId);
        if (!existsInWatchlist) {
            watchlist.push({
                id: customShipmentData.id,
                status: customShipmentData.status,
                origin: customShipmentData.origin,
                destination: customShipmentData.destination,
                dateText: customShipmentData.dateText
            });
            localStorage.setItem('swiftroute_watchlist', JSON.stringify(watchlist));
        }

        shipForm.reset();
        showToast(`Tracking label ${generatedId} created and added to dashboard!`);

        // Go track it immediately
        switchTab('tracker');
        const searchInput = document.getElementById("tracking-input");
        if (searchInput) searchInput.value = generatedId;
        executeSearch(generatedId);
    });
}
