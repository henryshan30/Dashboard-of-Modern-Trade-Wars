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
  let currentSort = { column: null, direction: 1 };
  
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
    
    // Show loading state
    d3.select("#dashboard").classed("loading", true);
    
    // Update title
    d3.select("h1").text(`${study.name} Dashboard`);
    
    // Clear previous visualizations
    if (currentMap) currentMap.remove();
    d3.select("#timeline").html("");
    d3.select("#trade-chart").html("");
    d3.select("#macro-table").html("");
    d3.select("#commodity-table").html("<div class='loader'>Loading data...</div>");
    d3.select("#trend-chart").html("<div class='trend-prompt'>Select a country and product to view trends</div>");
    
    // Initialize new map
    currentMap = L.map('map').setView(study.mapCenter, study.mapZoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(currentMap);
    
    // Load data
    currentData = await loadData(study.dataPath, study);
    
    // Initialize all components
    const years = [...new Set(currentData.tariffs.map(d => d.year))].sort();
    initTimeline(years);
    initCommodityFilters(currentData);
    initTrendFilters(currentData);
    
    // Initial render
    updateVisualizations(years[0]);
    updateCommodityTable();
    updateTrendChart();
    
    // Remove loading state
    d3.select("#dashboard").classed("loading", false);
  }
  
  function initTimeline(years) {
    currentTimeline = d3
      .sliderBottom()
      .min(d3.min(years))
      .max(d3.max(years))
      .step(1)
      .width(600)
      .tickFormat(d3.format("d"))
      .tickValues(years)
      .default(years[0])
      .on('onchange', year => updateVisualizations(year));
  
    d3.select("#timeline")
      .html("")
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
      
      L.circleMarker([d.lat || study.mapCenter[0], d.lng || study.mapCenter[1]], {
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
        d3.csv(`${dataPath}tariffs.csv`, d3.autoType).catch(err => {
          console.error("Error loading tariffs:", err);
          return [];
        }),
        d3.csv(`${dataPath}trade_volumes.csv`, d3.autoType).catch(err => {
          console.error("Error loading trade volumes:", err);
          return [];
        }),
        d3.csv(`${dataPath}macro.csv`, d3.autoType).catch(err => {
          console.error("Error loading macro data:", err);
          return [];
        })
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
  
  // ======================
  // COMMODITY TABLE FUNCTIONS
  // ======================
  function initCommodityFilters(data) {
    const countries = [...new Set([
      ...data.trade.map(d => d.exporter),
      ...data.trade.map(d => d.importer)
    ])].filter(Boolean).sort();
    
    const years = [...new Set(data.trade.map(d => d.year))].sort((a, b) => b - a);
    
    // Country filter
    const countrySelect = d3.select("#country-filter")
      .selectAll("option")
      .data(["All Countries", ...countries])
      .enter()
      .append("option")
      .text(d => d);
    
    // Year filter
    const yearSelect = d3.select("#year-filter")
      .selectAll("option")
      .data(["All Years", ...years])
      .enter()
      .append("option")
      .text(d => d);
    
    // Set up debounced update
    const updateTable = _.debounce(updateCommodityTable, 300);
    d3.select("#country-filter").on("change", updateTable);
    d3.select("#year-filter").on("change", updateTable);
  }
  
  function updateCommodityTable() {
    const country = d3.select("#country-filter").property("value");
    const year = d3.select("#year-filter").property("value");
    
    let filteredData = currentData.trade;
    
    if (country !== "All Countries") {
      filteredData = filteredData.filter(d => d.exporter === country || d.importer === country);
    }
    
    if (year !== "All Years") {
      filteredData = filteredData.filter(d => d.year === +year);
    }
    
    renderCommodityTable(filteredData);
  }
  
  function renderCommodityTable(data) {
    // Create a comprehensive lookup map
    const tradeMap = new Map();
    currentData.trade.forEach(d => {
      // Store both original and reverse directions
      const key1 = `${d.year}-${d.product}-${d.exporter}-${d.importer}`;
      const key2 = `${d.year}-${d.product}-${d.importer}-${d.exporter}`;
      tradeMap.set(key1, d.value_usd_billion);
      tradeMap.set(key2, d.value_usd_billion);
    });
  
    const processedData = data.map(d => {
      const currentKey = `${d.year}-${d.product}-${d.exporter}-${d.importer}`;
      const prevYearKey = `${d.year-1}-${d.product}-${d.exporter}-${d.importer}`;
      
      // Get current and previous values (try both directions)
      const currentValue = tradeMap.get(currentKey);
      const prevValue = tradeMap.get(prevYearKey) || 
                       tradeMap.get(`${d.year-1}-${d.product}-${d.importer}-${d.exporter}`);
  
      // Calculate change if we have both values
      const change = (currentValue !== undefined && prevValue !== undefined) ?
        ((currentValue - prevValue) / prevValue * 100) : null;
  
      return {
        ...d,
        country: d.importer, // Showing the importing country
        partner: d.exporter,
        tradeDirection: "Import",
        value: currentValue,
        change: change,
        prevValue: prevValue,
        hasChange: change !== null
      };
    });
  
    // Create table
    const table = d3.select("#commodity-table")
      .html("")
      .append("table")
      .attr("class", "trade-table");
  
    // Header
    table.append("thead").append("tr")
      .selectAll("th")
      .data(["Year", "Country", "Partner", "Product", "Value (B)", "YoY Change"])
      .enter()
      .append("th")
      .text(d => d);
  
    // Body
    const rows = table.append("tbody")
      .selectAll("tr")
      .data(processedData)
      .enter()
      .append("tr");
  
    // Cells
    rows.append("td").text(d => d.year);
    rows.append("td").text(d => d.country);
    rows.append("td").text(d => d.partner);
    rows.append("td").text(d => d.product);
    rows.append("td").text(d => d3.format(",.1f")(d.value));
  
    // YoY Change cell
    rows.append("td")
      .attr("class", d => {
        if (d.year === 2018) return "baseline";
        if (!d.hasChange) return "no-data";
        return d.change >= 0 ? "positive" : "negative";
      })
      .html(d => {
        if (d.year === 2018) return "Baseline";
        if (!d.hasChange) return "No prev. data";
        const arrow = d.change >= 0 ? "↑" : "↓";
        return `${arrow} ${d3.format("+.1f")(d.change)}%`;
      })
      .append("title")
      .text(d => {
        if (d.year === 2018) return "First year of data";
        if (!d.hasChange) return `No ${d.product} trade between ${d.country} and ${d.partner} in ${d.year-1}`;
        return `${d.year-1}: $${d3.format(",.1f")(d.prevValue)}B → ${d.year}: $${d3.format(",.1f")(d.value)}B`;
      });
  }
  
  // ======================
  // TREND CHART FUNCTIONS
  // ======================
  function initTrendFilters(data) {
    // Get all unique countries from both exporter and importer
    const countries = [...new Set([
      ...data.trade.map(d => d.exporter),
      ...data.trade.map(d => d.importer)
    ])].filter(Boolean).sort();
    
    const products = [...new Set(data.trade.map(d => d.product))].sort();
    
    // Clear existing options
    d3.select("#trend-country").html("");
    d3.select("#trend-product").html("");
    
    // Populate country dropdown
    d3.select("#trend-country")
      .selectAll("option")
      .data(countries)
      .enter()
      .append("option")
      .text(d => d);
    
    // Populate product dropdown
    d3.select("#trend-product")
      .selectAll("option")
      .data(products)
      .enter()
      .append("option")
      .text(d => d);
    
    // Set initial values
    if (countries.length > 0) {
      d3.select("#trend-country").property("value", countries[0]);
    }
    if (products.length > 0) {
      d3.select("#trend-product").property("value", products[0]);
    }
    
    // Set up event listeners with proper binding
    d3.select("#trend-country").on("change", function() {
      updateTrendChart();
    });
    
    d3.select("#trend-product").on("change", function() {
      updateTrendChart();
    });
    
    // Initial update
    updateTrendChart();
  }
  
  function updateTrendChart() {
    const country = d3.select("#trend-country").property("value");
    const product = d3.select("#trend-product").property("value");
    
    if (!country || !product) {
      d3.select("#trend-chart").html("<div class='trend-prompt'>Select a country and product to view trends</div>");
      return;
    }
    
    // Filter data where the selected country is either exporter or importer
    // and matches the selected product
    const filteredData = currentData.trade.filter(d => 
      (d.exporter === country || d.importer === country) && 
      d.product === product
    ).sort((a, b) => a.year - b.year);
    
    // Determine if we're showing exports or imports
    const isExport = filteredData.length > 0 && filteredData[0].exporter === country;
    
    renderTrendChart(filteredData, country, product, isExport);
  }
  
  function renderTrendChart(data, country, product) {
    // Clear previous chart
    const container = d3.select("#trend-chart")
      .html("")
      .append("svg")
      .attr("width", "100%")
      .attr("height", "400");
  
    if (data.length === 0) {
      container.append("text")
        .attr("x", 100)
        .attr("y", 50)
        .text(`No trade data for ${product} involving ${country}`);
      return;
    }
  
    // Determine trade direction (export or import)
    const isExport = data[0].exporter === country;
    const partnerCountry = isExport ? data[0].importer : data[0].exporter;
    const tradeDirection = isExport ? "Exports to" : "Imports from";
  
    // Set up chart dimensions
    const margin = { top: 50, right: 30, bottom: 50, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;
  
    const svg = container.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);
  
    // Create scales
    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d.year))
      .range([0, width])
      .nice();
  
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value_usd_billion) * 1.1])
      .range([height, 0])
      .nice();
  
    // Create line generator
    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(d.value_usd_billion))
      .curve(d3.curveMonotoneX);
  
    // Add line path with color based on trade direction
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", isExport ? "#2ecc71" : "#e74c3c") // Green for exports, red for imports
      .attr("stroke-width", 3)
      .attr("d", line);
  
    // Add circles for data points
    svg.selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.value_usd_billion))
      .attr("r", 5)
      .attr("fill", isExport ? "#2ecc71" : "#e74c3c")
      .append("title")
      .text(d => `${d.year}: $${d.value_usd_billion}B ${isExport ? 'exported' : 'imported'}`);
  
    // Add axes
    svg.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")))
      .append("text")
      .attr("x", width)
      .attr("y", -6)
      .attr("text-anchor", "end")
      .text("Year");
  
    svg.append("g")
      .call(d3.axisLeft(y))
      .append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", 6)
      .attr("dy", "0.71em")
      .attr("text-anchor", "end")
      .text("Value (USD Billion)");
  
    // Add dynamic title showing trade relationship
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text(`${product} ${tradeDirection} ${partnerCountry}`);
  
    // Add subtitle with perspective country
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", -5)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("fill", "#777")
      .text(`From ${country}'s perspective`);
  
    // Add tariff markers if available
    const conflictYears = currentData.tariffs
      .filter(d => d.country === country && d.tariff_rate > 0)
      .map(d => d.year);
  
    if (conflictYears.length > 0) {
      const uniqueConflictYears = [...new Set(conflictYears)];
      
      svg.selectAll(".conflict-marker")
        .data(uniqueConflictYears)
        .enter()
        .append("line")
        .attr("class", "conflict-marker")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "#f39c12")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "5,5");
      
      svg.selectAll(".conflict-label")
        .data(uniqueConflictYears)
        .enter()
        .append("text")
        .attr("class", "conflict-label")
        .attr("x", d => x(d))
        .attr("y", height + 20)
        .attr("text-anchor", "middle")
        .text("Tariff Imposed")
        .style("font-size", "10px")
        .style("fill", "#f39c12");
    }
  }
  
  // Start the dashboard
  document.addEventListener("DOMContentLoaded", initDashboard);
