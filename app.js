const API_URL = "https://apis.youbike.com.tw/json/station-yb2.json";

const REFRESH_INTERVAL = 60 * 1000;

const DEFAULT_LOCATION = [24.9536, 121.2258];
const DEFAULT_ZOOM = 14;

const MAX_VISIBLE_STATIONS = 1000;
const NEARBY_LIMIT = 12;

const FAVORITES_KEY = "youbike_favorite_stations";


// =========================
// DOM
// =========================

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");

const locationButton = document.getElementById("locationButton");
const nearbyButton = document.getElementById("nearbyButton");
const favoritesButton = document.getElementById("favoritesButton");

const searchResults = document.getElementById("searchResults");
const loading = document.getElementById("loading");

const stationPanel = document.getElementById("stationPanel");
const closePanel = document.getElementById("closePanel");

const stationName = document.getElementById("stationName");
const stationAddress = document.getElementById("stationAddress");
const stationDistance = document.getElementById("stationDistance");

const normalCount = document.getElementById("normalCount");
const electricCount = document.getElementById("electricCount");
const emptyCount = document.getElementById("emptyCount");

const updateTime = document.getElementById("updateTime");

const favoriteButton = document.getElementById("favoriteButton");

const nearbyPanel = document.getElementById("nearbyPanel");
const closeNearby = document.getElementById("closeNearby");
const nearbyStatus = document.getElementById("nearbyStatus");
const nearbyList = document.getElementById("nearbyList");

const favoritesPanel = document.getElementById("favoritesPanel");
const closeFavorites = document.getElementById("closeFavorites");
const favoritesList = document.getElementById("favoritesList");


// =========================
// Map
// =========================

const map = L.map("map").setView(
    DEFAULT_LOCATION,
    DEFAULT_ZOOM
);

L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


// =========================
// Marker Cluster
// =========================

const markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 16
});

map.addLayer(markerCluster);


// =========================
// Data
// =========================

let stations = [];
let selectedStation = null;
let userLocation = null;
let userMarker = null;

let favoriteStations = loadFavorites();


// =========================
// Favorites
// =========================

function loadFavorites() {
    try {
        const saved = localStorage.getItem(FAVORITES_KEY);

        return saved
            ? JSON.parse(saved)
            : [];
    } catch {
        return [];
    }
}


function saveFavorites() {
    localStorage.setItem(
        FAVORITES_KEY,
        JSON.stringify(favoriteStations)
    );
}


function isFavorite(stationNo) {
    return favoriteStations.includes(stationNo);
}


function toggleFavorite(station) {

    if (isFavorite(station.stationNo)) {

        favoriteStations =
            favoriteStations.filter(
                id => id !== station.stationNo
            );

    } else {

        favoriteStations.push(
            station.stationNo
        );
    }

    saveFavorites();

    updateFavoriteButton();
    renderFavorites();
}


function updateFavoriteButton() {

    if (!selectedStation) {
        return;
    }

    if (isFavorite(selectedStation.stationNo)) {

        favoriteButton.textContent = "★";
        favoriteButton.classList.add("active");

    } else {

        favoriteButton.textContent = "☆";
        favoriteButton.classList.remove("active");
    }
}


// =========================
// Parse Station
// =========================

function parseStation(raw) {

    let normalBikes = 0;
    let electricBikes = 0;


    // =========================
    // 車輛數量
    // =========================

    if (raw.available_spaces_detail) {

        normalBikes =
            Number(
                raw.available_spaces_detail.yb2
            ) || 0;

        electricBikes =
            Number(
                raw.available_spaces_detail.eyb
            ) || 0;
    }


    // 備用格式
    if (
        normalBikes === 0 &&
        electricBikes === 0 &&
        raw.sbi_detail
    ) {

        try {

            const detail =
                typeof raw.sbi_detail === "string"
                    ? JSON.parse(raw.sbi_detail)
                    : raw.sbi_detail;

            normalBikes =
                Number(detail.yb2) || 0;

            electricBikes =
                Number(detail.eyb) || 0;

        } catch (error) {

            console.warn(
                "sbi_detail 解析失敗"
            );
        }
    }


    // =========================
    // 座標
    // =========================

    const lat =
        Number(
            raw.lat ??
            raw.latitude
        );

    const lng =
        Number(
            raw.lng ??
            raw.longitude
        );


    // =========================
    // 站名
    // =========================

    const name =
        String(
            raw.name_tw ??
            raw.name ??
            raw.station_name ??
            raw.sna ??
            raw.sna_cht ??
            raw.stationName ??
            "未知站點"
        );


    // =========================
    // 站點編號
    // =========================

    const stationNo =
        String(
            raw.station_no ??
            raw.sno ??
            raw.id ??
            ""
        );


    // =========================
    // 地址
    // =========================

    const address =
        String(
            raw.address_tw ??
            raw.address ??
            raw.ar ??
            raw.address_cht ??
            "地址未知"
        );


    // =========================
    // 空位
    // =========================

    const emptySpaces =
        Number(
            raw.empty_spaces ??
            raw.bemp ??
            0
        );


    if (
        !stationNo ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {
        return null;
    }


    return {

        stationNo: stationNo,

        name: name,

        address: address,

        lat: lat,

        lng: lng,

        normalBikes: normalBikes,

        electricBikes: electricBikes,

        totalBikes:
            normalBikes +
            electricBikes,

        emptySpaces: emptySpaces,

        raw: raw
    };
}


// =========================
// Load Stations
// =========================

async function loadStations() {

    try {

        loading.classList.remove("hidden");


        const response =
            await fetch(
                API_URL,
                {
                    cache: "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );
        }


        const data =
            await response.json();


        let rawStations = [];


        if (Array.isArray(data)) {

            rawStations = data;

        } else if (
            Array.isArray(data.stations)
        ) {

            rawStations = data.stations;

        } else if (
            Array.isArray(data.data)
        ) {

            rawStations = data.data;

        } else if (
            Array.isArray(data.retVal)
        ) {

            rawStations = data.retVal;
        }


        stations =
            rawStations
                .map(parseStation)
                .filter(Boolean);


        console.log(
            "YouBike 站點數量：",
            stations.length
        );


        drawVisibleStations();

        renderNearby();

        renderFavorites();


    } catch (error) {

        console.error(
            "YouBike 資料載入失敗：",
            error
        );


        loading.textContent =
            "YouBike 資料載入失敗，請重新整理頁面。";

    } finally {

        setTimeout(() => {

            loading.classList.add(
                "hidden"
            );

        }, 500);
    }
}


// =========================
// Marker Color
// =========================

function getStationStatus(station) {

    if (
        station.totalBikes <= 0
    ) {
        return "empty";
    }


    if (
        station.totalBikes <= 3
    ) {
        return "low";
    }


    return "ok";
}


// =========================
// Marker Icon
// =========================

function createStationIcon(station) {

    const status =
        getStationStatus(station);


    return L.divIcon({

        className:
            "station-marker-wrapper",

        html: `

            <div class="station-label-card">

                <div class="station-label-name">
                    ${escapeHtml(station.name)}
                </div>

                <div class="station-label-count">

                    <span class="normal-bike">
                        🚲 ${station.normalBikes}
                    </span>

                    <span class="electric-bike">
                        ⚡ ${station.electricBikes}
                    </span>

                </div>

                <div class="station-dot ${status}"></div>

            </div>

        `,

        iconSize: [180, 72],

        iconAnchor: [90, 62],

        popupAnchor: [0, -62]
    });
}


// =========================
// Draw Stations
// =========================

function drawVisibleStations() {

    markerCluster.clearLayers();


    const bounds =
        map.getBounds();


    const visibleStations =
        stations.filter(
            station =>
                bounds.contains([
                    station.lat,
                    station.lng
                ])
        );


    const limitedStations =
        visibleStations.slice(
            0,
            MAX_VISIBLE_STATIONS
        );


    limitedStations.forEach(
        station => {

            const marker =
                L.marker(
                    [
                        station.lat,
                        station.lng
                    ],
                    {
                        icon:
                            createStationIcon(
                                station
                            )
                    }
                );


            marker.on(
                "click",
                () => {

                    showStation(
                        station
                    );

                }
            );


            markerCluster.addLayer(
                marker
            );
        }
    );
}


// =========================
// SHOW STATION
// =========================

function showStation(station) {

    selectedStation =
        station;


    // =========================
    // 站名
    // =========================

    stationName.textContent =
        station.name;


    // =========================
    // 地址
    // =========================

    stationAddress.textContent =
        station.address;


    // =========================
    // 車輛數量
    // =========================

    normalCount.textContent =
        station.normalBikes;


    electricCount.textContent =
        station.electricBikes;


    emptyCount.textContent =
        station.emptySpaces;


    // =========================
    // 距離
    // =========================

    if (userLocation) {

        const distance =
            calculateDistance(
                userLocation.lat,
                userLocation.lng,
                station.lat,
                station.lng
            );


        stationDistance.textContent =
            `距離你約 ${formatDistance(
                distance
            )}`;

    } else {

        stationDistance.textContent =
            "";
    }


    // =========================
    // 更新時間
    // =========================

    updateTime.textContent =
        `最後更新：${getCurrentTime()}`;


    // =========================
    // 收藏
    // =========================

    updateFavoriteButton();


    // =========================
    // 顯示面板
    // =========================

    stationPanel.classList.remove(
        "hidden"
    );


    // =========================
    // 地圖移動
    // =========================

    map.setView(
        [
            station.lat,
            station.lng
        ],
        Math.max(
            map.getZoom(),
            16
        ),
        {
            animate: true
        }
    );
}


// =========================
// Close Station
// =========================

function closeStationPanel() {

    stationPanel.classList.add(
        "hidden"
    );

    selectedStation = null;
}


// =========================
// Current Time
// =========================

function getCurrentTime() {

    return new Date()
        .toLocaleTimeString(
            "zh-TW",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
}


// =========================
// Distance
// =========================

function calculateDistance(
    lat1,
    lng1,
    lat2,
    lng2
) {

    const R = 6371000;


    const dLat =
        (lat2 - lat1) *
        Math.PI / 180;


    const dLng =
        (lng2 - lng1) *
        Math.PI / 180;


    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +

        Math.cos(
            lat1 *
            Math.PI /
            180
        ) *

        Math.cos(
            lat2 *
            Math.PI /
            180
        ) *

        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;
}


function formatDistance(meters) {

    if (
        meters < 1000
    ) {

        return `${Math.round(
            meters
        )} 公尺`;
    }


    return `${(
        meters / 1000
    ).toFixed(1)} 公里`;
}


// =========================
// User Location
// =========================

function createUserMarker(
    lat,
    lng
) {

    if (userMarker) {

        map.removeLayer(
            userMarker
        );
    }


    const icon =
        L.divIcon({

            className:
                "user-marker-wrapper",

            html: `

                <div class="user-marker">

                    <div class="user-marker-dot"></div>

                </div>

            `,

            iconSize: [
                28,
                28
            ],

            iconAnchor: [
                14,
                14
            ]
        });


    userMarker =
        L.marker(
            [
                lat,
                lng
            ],
            {
                icon: icon,
                zIndexOffset: 1000
            }
        )
        .addTo(map);
}


function locateUser(
    moveMap = true
) {

    if (
        !navigator.geolocation
    ) {

        nearbyStatus.textContent =
            "你的瀏覽器不支援定位功能";

        return;
    }


    nearbyStatus.textContent =
        "正在取得目前位置...";


    navigator.geolocation.getCurrentPosition(

        position => {

            const lat =
                position.coords.latitude;

            const lng =
                position.coords.longitude;


            userLocation = {
                lat,
                lng
            };


            createUserMarker(
                lat,
                lng
            );


            if (moveMap) {

                map.setView(
                    [
                        lat,
                        lng
                    ],
                    16,
                    {
                        animate: true
                    }
                );
            }


            renderNearby();


            if (
                selectedStation
            ) {

                showStation(
                    selectedStation
                );
            }
        },


        error => {

            console.warn(
                "定位失敗：",
                error
            );


            let message =
                "定位失敗";


            if (
                error.code === 1
            ) {

                message =
                    "你拒絕了定位權限，請在瀏覽器網址列允許定位";

            } else if (
                error.code === 2
            ) {

                message =
                    "目前無法取得位置";

            } else if (
                error.code === 3
            ) {

                message =
                    "定位逾時，請再試一次";
            }


            nearbyStatus.textContent =
                message;
        },


        {
            enableHighAccuracy: true,

            timeout: 15000,

            maximumAge: 30000
        }
    );
}


// =========================
// Nearby
// =========================

function renderNearby() {

    nearbyList.innerHTML = "";


    if (!userLocation) {

        nearbyStatus.textContent =
            "尚未取得你的定位";

        return;
    }


    const nearbyStations =
        stations
            .map(
                station => ({

                    station,

                    distance:
                        calculateDistance(
                            userLocation.lat,
                            userLocation.lng,
                            station.lat,
                            station.lng
                        )
                })
            )
            .sort(
                (a, b) =>
                    a.distance -
                    b.distance
            )
            .slice(
                0,
                NEARBY_LIMIT
            );


    nearbyStatus.textContent =
        `找到最近 ${nearbyStations.length} 個站點`;


    nearbyStations.forEach(
        item => {

            const card =
                createStationCard(
                    item.station,
                    item.distance
                );


            nearbyList.appendChild(
                card
            );
        }
    );
}


// =========================
// Station Card
// =========================

function createStationCard(
    station,
    distance = null
) {

    const card =
        document.createElement(
            "div"
        );


    card.className =
        "station-card";


    card.innerHTML = `

        <div class="station-card-top">

            <div class="station-card-name">
                ${escapeHtml(
                    station.name
                )}
            </div>

            <div class="station-status-dot ${getStationStatus(
                station
            )}">
            </div>

        </div>


        <div class="station-card-info">

            🚲 ${station.normalBikes}
            台普通車

            &nbsp;&nbsp;

            ⚡ ${station.electricBikes}
            台電動車

        </div>


        <div class="station-card-info">

            🅿️ ${station.emptySpaces}
            個空位

        </div>


        ${
            distance !== null
                ? `
                    <div class="station-card-distance">
                        距離 ${formatDistance(
                            distance
                        )}
                    </div>
                `
                : ""
        }

    `;


    card.addEventListener(
        "click",
        () => {

            showStation(
                station
            );


            nearbyPanel.classList.add(
                "hidden"
            );


            favoritesPanel.classList.add(
                "hidden"
            );
        }
    );


    return card;
}


// =========================
// Favorites
// =========================

function renderFavorites() {

    favoritesList.innerHTML = "";


    if (
        favoriteStations.length === 0
    ) {

        favoritesList.innerHTML = `
            <div class="empty-message">
                目前沒有收藏站點
            </div>
        `;

        return;
    }


    favoriteStations.forEach(
        id => {

            const station =
                stations.find(
                    item =>
                        item.stationNo === id
                );


            if (!station) {
                return;
            }


            const card =
                createStationCard(
                    station
                );


            favoritesList.appendChild(
                card
            );
        }
    );
}


// =========================
// Search
// =========================

function searchStations(
    keyword
) {

    const text =
        keyword
            .trim()
            .toLowerCase();


    if (!text) {

        searchResults.classList.add(
            "hidden"
        );

        return;
    }


    const results =
        stations
            .filter(
                station =>
                    station.name
                        .toLowerCase()
                        .includes(text)
            )
            .slice(
                0,
                10
            );


    searchResults.innerHTML = "";


    if (
        results.length === 0
    ) {

        searchResults.innerHTML = `
            <div class="search-no-result">
                找不到符合的站點
            </div>
        `;


        searchResults.classList.remove(
            "hidden"
        );


        return;
    }


    results.forEach(
        station => {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "search-result";


            item.innerHTML = `

                <strong>
                    ${escapeHtml(
                        station.name
                    )}
                </strong>

                <span>
                    🚲 ${station.normalBikes}

                    &nbsp;

                    ⚡ ${station.electricBikes}

                    &nbsp;

                    🅿️ ${station.emptySpaces}
                </span>

            `;


            item.addEventListener(
                "click",
                () => {

                    searchResults.classList.add(
                        "hidden"
                    );


                    searchInput.value =
                        station.name;


                    showStation(
                        station
                    );
                }
            );


            searchResults.appendChild(
                item
            );
        }
    );


    searchResults.classList.remove(
        "hidden"
    );
}


// =========================
// Escape HTML
// =========================

function escapeHtml(text) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        text;


    return div.innerHTML;
}


// =========================
// Events
// =========================

searchInput.addEventListener(
    "input",
    () => {

        searchStations(
            searchInput.value
        );
    }
);


searchInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            searchStations(
                searchInput.value
            );
        }
    }
);


searchButton.addEventListener(
    "click",
    () => {

        searchStations(
            searchInput.value
        );
    }
);


locationButton.addEventListener(
    "click",
    () => {

        locateUser(true);
    }
);


nearbyButton.addEventListener(
    "click",
    () => {

        nearbyPanel.classList.remove(
            "hidden"
        );


        favoritesPanel.classList.add(
            "hidden"
        );


        renderNearby();
    }
);


favoritesButton.addEventListener(
    "click",
    () => {

        favoritesPanel.classList.remove(
            "hidden"
        );


        nearbyPanel.classList.add(
            "hidden"
        );


        renderFavorites();
    }
);


closePanel.addEventListener(
    "click",
    () => {

        closeStationPanel();
    }
);


closeNearby.addEventListener(
    "click",
    () => {

        nearbyPanel.classList.add(
            "hidden"
        );
    }
);


closeFavorites.addEventListener(
    "click",
    () => {

        favoritesPanel.classList.add(
            "hidden"
        );
    }
);


favoriteButton.addEventListener(
    "click",
    () => {

        if (selectedStation) {

            toggleFavorite(
                selectedStation
            );
        }
    }
);


// =========================
// Map Events
// =========================

map.on(
    "click",
    () => {

        searchResults.classList.add(
            "hidden"
        );
    }
);


map.on(
    "moveend",
    () => {

        drawVisibleStations();
    }
);


// =========================
// Auto Refresh
// =========================

setInterval(
    async () => {

        await loadStations();


        if (
            selectedStation
        ) {

            const updated =
                stations.find(
                    station =>
                        station.stationNo ===
                        selectedStation.stationNo
                );


            if (updated) {

                showStation(
                    updated
                );
            }
        }

    },
    REFRESH_INTERVAL
);


// =========================
// PWA
// =========================

if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register("./sw.js")
                .then(() => {

                    console.log(
                        "PWA Service Worker 已啟用"
                    );

                })
                .catch(
                    error => {

                        console.warn(
                            "Service Worker 啟用失敗：",
                            error
                        );
                    }
                );
        }
    );
}


// =========================
// Start
// =========================

async function startApp() {

    await loadStations();

    locateUser(true);
}


startApp();