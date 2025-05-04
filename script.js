// ======================
// 1. CONFIGURATION
// ======================
const config = {
    colors: {
      us: "#3498db",
      cn: "#e74c3c",
      eu: "#2ecc71",
      uk: "#9b59b6"
    },
    defaultRadius: 8
  };
  
  // Fix Leaflet icons
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
  
  // ======================
  // 2. CASE STUDY DEFINITIONS
  // ======================
  const caseStudies = {
    "us-china": {
      name: "U.S.-China Trade War",
      mapCenter: [35, 105],
      mapZoom: 3,
      dataPath: "data/us-china/",
      countryColors: {
        "US": "#3498db",
        "CN": "#e74c3c"
      }
    },
    "brexit": {
      name: "Brexit Impact",
      mapCenter: [54, -2],
      mapZoom: 5,
      dataPath: "data/brexit/",
      countryColors: {
        "UK": "#9b59b6",
        "EU": "#2ecc71"
      }
    },
    "us-eu": {
      name: "U.S.-EU Steel Dispute",
      mapCenter: [50, 10],
      mapZoom: 4,
      dataPath: "data/us-eu/",
      countryColors: {
        "US": "#3498db",
        "EU": "#2ecc71"
      }
    }
  };
  
  // ======================
  // 3. DASHBOARD STATE
  // ======================
  let currentMap = null;
  let currentTimeline = null;
  let currentData = null;
  
  // ======================
  // 4. INITIALIZATION
  // ======================
  async function initDashboard() {
    // Set up case study dropdown
    d3.select("#case-study")
      .on("change", async function() {
        const studyId = this.value;
        await loadCaseStudy(studyId);
      });
  
    // Load default case study
    await loadCaseStudy("us-china");
  }
  
  // ======================
  // 5. CORE FUNCTIONS
  // ======================
  async function loadCaseStudy(studyId) {
    const study = caseStudies[studyId];
    console.log(`Loading ${study.name}...`);
    
    // Update title
    d3.select("h1").text(`${study.name} Dashboard`);
    
    // Clear previous visualizations
    if (currentMap) currentMap.remove();
    d3.select("#timeline").html("");
    d3.select("#trade-chart").html("");
    d3.select("#macro-table").html("");
    
    // Initialize new map
    currentMap = L.map('map').setView(study.mapCenter, study.mapZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(currentMap);
    
    // Load data
    currentData = await loadData(study.dataPath, study);
    
    // Initialize timeline
    const years = [...new Set(currentData.tariffs.map(d => d.year))].sort();
    initTimeline(years);
    
    // Initial render
    updateVisualizations(years[0]);
  }
  
  function initTimeline(years) {
    currentTimeline = d3
      .sliderBottom()
      .min(d3.min(years))
      .max(d3.max(years))
      .step(1)
      .width(600)
      .tickFormat(d3.format("d"))
      .default(2020)
      .on('onchange', year => updateVisualizations(year));
  
    d3.select("#timeline")
      .append("svg")
      .attr("width", 650)
      .attr("height", 100)
      .append("g")
      .attr("transform", "translate(30,30)")
      .call(currentTimeline);
  }
  
  function updateVisualizations(year) {
    const filtered = {
      tariffs: currentData.tariffs.filter(d => d.year === year),
      trade: currentData.trade.filter(d => d.year === year),
      macro: currentData.macro.filter(d => d.year === year)
    };
    
    updateMap(filtered.tariffs);
    updateTradeChart(filtered.trade, year);
    updateMacroTable(filtered.macro);
  }
  
  function updateMap(data) {
    // Clear existing
    currentMap.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) currentMap.removeLayer(layer);
    });
  
    // Get current case study
    const study = caseStudies[d3.select("#case-study").node().value];
    
    // Add new markers
    data.forEach(d => {
      const radius = config.defaultRadius + (d.tariff_rate / 5);
      const color = study.countryColors[d.country] || "#777";
      
      L.circleMarker([d.lat, d.lng], {
        radius: radius,
        fillColor: color,
        fillOpacity: 0.7,
        stroke: true,
        weight: 1,
        color: "#fff"
      })
      .bindPopup(`
        <b>${d.product} Tariffs</b><br>
        <table>
          <tr><td>Country:</td><td>${d.country}</td></tr>
          <tr><td>Year:</td><td>${d.year}</td></tr>
          <tr><td>Rate:</td><td>${d.tariff_rate}%</td></tr>
        </table>
      `)
      .addTo(currentMap);
    });
  }
  
  function updateTradeChart(data, year) {
    const container = d3.select("#trade-chart")
      .html("")
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%");
  
    if (data.length === 0) {
      container.append("text")
        .attr("x", 50)
        .attr("y", 50)
        .text(`No trade data for ${year}`);
      return;
    }
  
    // Set up chart dimensions
    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
  
    const svg = container.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
  
    // Create scales
    const x = d3.scaleBand()
      .domain(data.map(d => d.product))
      .range([0, width])
      .padding(0.2);
  
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value_usd_billion) * 1.1])
      .range([height, 0]);
  
    // Get current case study for colors
    const study = caseStudies[d3.select("#case-study").node().value];
  
    // Add bars
    svg.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => x(d.product))
      .attr("y", d => y(d.value_usd_billion))
      .attr("width", x.bandwidth())
      .attr("height", d => height - y(d.value_usd_billion))
      .attr("fill", d => study.countryColors[d.exporter] || "#777");
  
    // Add value labels
    svg.selectAll(".label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("x", d => x(d.product) + x.bandwidth() / 2)
      .attr("y", d => y(d.value_usd_billion) - 5)
      .attr("text-anchor", "middle")
      .text(d => `$${d.value_usd_billion}B`);
  
    // Add axes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-45)")
      .style("text-anchor", "end");
  
    svg.append("g")
      .call(d3.axisLeft(y));
  }
  
  function updateMacroTable(data) {
    const table = d3.select("#macro-table")
      .html("")
      .append("table");
  
    // Header
    table.append("thead")
      .append("tr")
      .selectAll("th")
      .data(["Country", "GDP Growth", "Inflation", "Unemployment"])
      .enter()
      .append("th")
      .text(d => d);
  
    // Rows
    const rows = table.append("tbody")
      .selectAll("tr")
      .data(data)
      .enter()
      .append("tr");
  
    // Cells
    rows.append("td").text(d => d.country);
    rows.append("td").text(d => `${d.gdp_growth_pct}%`)
        .style("color", d => d.gdp_growth_pct >= 0 ? "#27ae60" : "#e74c3c");
    rows.append("td").text(d => `${d.inflation_pct}%`)
        .style("color", d => d.inflation_pct > 3 ? "#e74c3c" : "#27ae60");
    rows.append("td").text(d => `${d.unemployment_pct}%`)
        .style("color", d => d.unemployment_pct > 5 ? "#e74c3c" : "#27ae60");
  }
  
  async function loadData(dataPath, study) {
    try {
      const [tariffs, trade, macro] = await Promise.all([
        d3.csv(`${dataPath}tariffs.csv`, d3.autoType).catch(() => []),
        d3.csv(`${dataPath}trade_volumes.csv`, d3.autoType).catch(() => []),
        d3.csv(`${dataPath}macro.csv`, d3.autoType).catch(() => [])
      ]);
      
      // Add geo-coordinates if missing
      tariffs.forEach(d => {
        if (!d.lat || !d.lng) {
          d.lat = study.mapCenter[0] + (Math.random() - 0.5) * 10;
          d.lng = study.mapCenter[1] + (Math.random() - 0.5) * 20;
        }
      });
      
      return { tariffs, trade, macro };
    } catch (error) {
      console.error("Error loading data:", error);
      return { tariffs: [], trade: [], macro: [] };
    }
  }
  
  // Start the dashboard
  document.addEventListener("DOMContentLoaded", initDashboard);