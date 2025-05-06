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
    },
    insights: [
      "Trump famously said: 'Trade wars are good, and easy to win' when initiating tariffs on China in 2018.",
      "The U.S. imposed tariffs on $360 billion of Chinese goods, while China retaliated with tariffs on $110 billion of U.S. products.",
      "The Phase One deal in 2020 committed China to purchase $200 billion more in U.S. goods over two years."
    ]
  },
  "brexit": {
    name: "Brexit Impact",
    mapCenter: [54, -2],
    mapZoom: 5,
    dataPath: "data/brexit/",
    countryColors: {
      "UK": "#9b59b6",
      "EU": "#2ecc71"
    },
    insights: [
      "Trump commented: 'Brexit is going to be a wonderful thing for your country' during a UK visit.",
      "UK-EU trade declined by 20% in the first year after Brexit implementation.",
      "The Northern Ireland Protocol became one of the most contentious aspects of the Brexit deal."
    ]
  },
  "us-eu": {
    name: "U.S.-EU Steel Dispute",
    mapCenter: [50, 10],
    mapZoom: 4,
    dataPath: "data/us-eu/",
    countryColors: {
      "US": "#3498db",
      "EU": "#2ecc71"
    },
    insights: [
      "Trump declared: 'If you don't have steel, you don't have a country' while imposing 25% steel tariffs.",
      "The EU retaliated with tariffs on $3.2 billion of U.S. goods including bourbon and motorcycles.",
      "The dispute was partially resolved in 2021 with a tariff-rate quota system replacing outright tariffs."
    ]
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

  // Set up insights button
  setupInsights();

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
  initTrendFilters(currentData); // Ensure this is called
  
  // Reset dropdowns to default values
  d3.select("#country-filter").property("value", "All Countries");
  d3.select("#year-filter").property("value", "All Years");
  d3.select("#trend-product").property("value", ""); // Reset product selection
  
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
  // Clear existing circles
  currentMap.eachLayer(layer => {
    if (layer instanceof L.CircleMarker) currentMap.removeLayer(layer);
  });

  const study = caseStudies[d3.select("#case-study").node().value];

  // Group by BOTH country and product to show all tariffs
  const groupedByCountryProduct = d3.group(data, 
    d => d.country, 
    d => d.product
  );

  // Create markers for each unique country-product combination
  groupedByCountryProduct.forEach((products, country) => {
    products.forEach((tariffs, product) => {
      const countryColor = study.countryColors[country] || "#777";
      
      // Use average tariff for circle size
      const avgTariff = d3.mean(tariffs, d => d.tariff_rate);
      const radius = config.defaultRadius + (avgTariff / 5);
      
      // Get coordinates (use first entry's coordinates)
      const { lat, lng } = tariffs[0];

      // Build detailed popup content
      const popupContent = `
        <div class="tariff-popup">
          <h3>${product} Tariffs</h3>
          <small>${country}</small>
          <table class="tariff-details">
            ${tariffs.sort((a,b) => a.year - b.year)
              .map(d => `
                <tr>
                  <td>${d.year}:</td>
                  <td>${d3.format(".1f")(d.tariff_rate)}%</td>
                </tr>
              `).join('')}
          </table>
        </div>
      `;

      // Create the circle marker
      L.circleMarker([lat, lng], {
        radius: radius,
        fillColor: countryColor,
        fillOpacity: 0.7,
        stroke: true,
        weight: 1,
        color: "#fff"
      })
      .bindPopup(popupContent)
      .addTo(currentMap);
    });
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

  // Group data by product and trade direction
  const groupedData = d3.groups(data, d => d.product);
  
  // Create scales
  const x0 = d3.scaleBand()
    .domain(groupedData.map(d => d[0]))
    .range([0, width])
    .padding(0.2);

  const x1 = d3.scaleBand()
    .domain(["export", "import"])
    .range([0, x0.bandwidth()])
    .padding(0.1);

  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.value_usd_billion) * 1.1])
    .range([height, 0]);

  // Get current case study for colors
  const study = caseStudies[d3.select("#case-study").node().value];

  // Add groups for each product
  const productGroups = svg.selectAll(".product-group")
    .data(groupedData)
    .enter()
    .append("g")
    .attr("class", "product-group")
    .attr("transform", d => `translate(${x0(d[0])},0)`);

  // Add bars for each trade direction
  productGroups.selectAll(".bar")
    .data(d => d[1])
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => x1(d.exporter === study.country ? "export" : "import"))
    .attr("y", d => y(d.value_usd_billion))
    .attr("width", x1.bandwidth())
    .attr("height", d => height - y(d.value_usd_billion))
    .attr("fill", d => study.countryColors[d.exporter] || "#777");

  // Add value labels
  productGroups.selectAll(".label")
    .data(d => d[1])
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", d => x1(d.exporter === study.country ? "export" : "import") + x1.bandwidth()/2)
    .attr("y", d => y(d.value_usd_billion) - 5)
    .attr("text-anchor", "middle")
    .text(d => `$${d.value_usd_billion}B`);

  // Add axes
  svg.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x0))
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
    
    // Fixed geographic coordinates for countries
    const countryCoordinates = {
      "US": [37.09, -95.71],  // Center of USA
      "CN": [35.86, 104.20],  // Center of China
      "EU": [54.53, 15.26],   // Center of Europe
      "UK": [53.51, -1.13],   // Center of UK
      "DE": [51.16, 10.45],   // Germany
      "FR": [46.22, 2.21],    // France
      "JP": [36.20, 138.25],  // Japan
      "CA": [56.13, -106.34], // Canada
      "MX": [23.63, -102.55], // Mexico
      "IN": [20.59, 78.96]    // India
    };
    
    // Product-specific offsets (lat, lng)
    const productOffsets = {
      "Steel": [1.5, 1.5],
      "Automobiles": [-1.5, 1.5],
      "Electronics": [1.5, -1.5],
      "Agriculture": [-1.5, -1.5],
      "Textiles": [0, 3],
      "Chemicals": [0, -3]
    };
    
    // Add consistent geo-coordinates
    tariffs.forEach(d => {
      if (!d.lat || !d.lng) {
        // Get base country coordinates
        const baseCoords = countryCoordinates[d.country] || study.mapCenter;
        
        // Apply product-specific offset if defined
        const offset = productOffsets[d.product] || [0, 0];
        
        // Set final coordinates
        d.lat = baseCoords[0] + offset[0];
        d.lng = baseCoords[1] + offset[1];
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
  // Get all unique countries from both exporter and importer
  const countries = [...new Set([
    ...data.trade.map(d => d.exporter),
    ...data.trade.map(d => d.importer)
  ])].filter(Boolean).sort();
  
  const years = [...new Set(data.trade.map(d => d.year))].sort((a, b) => b - a);
  
  // Clear and repopulate country filter
  const countrySelect = d3.select("#country-filter")
    .selectAll("option")
    .data(["All Countries", ...countries]);
  
  // Remove old options
  countrySelect.exit().remove();
  
  // Add new options
  countrySelect.enter()
    .append("option")
    .merge(countrySelect)
    .attr("value", d => d)
    .text(d => d);
  
  // Clear and repopulate year filter
  const yearSelect = d3.select("#year-filter")
    .selectAll("option")
    .data(["All Years", ...years]);
  
  // Remove old options
  yearSelect.exit().remove();
  
  // Add new options
  yearSelect.enter()
    .append("option")
    .merge(yearSelect)
    .attr("value", d => d === "All Years" ? d : +d)
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
  if (data.length === 0) {
    d3.select("#commodity-table").html("<div class='loader'>No data matching filters</div>");
    return;
  }

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

  // Sort data (existing sort logic remains the same)
  processedData.sort((a, b) => a.year - b.year);

  // Create table
  const table = d3.select("#commodity-table")
    .html("")
    .append("table")
    .attr("class", "trade-table");

  // Header
  table.append("thead").append("tr")
    .selectAll("th")
    .data(["Year", "Country", "Partner", "Product", "Value (USD Billion)", "YoY Change"])
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
  rows.append("td").text(d => d3.format(",.2f")(d.value));

  // YoY Change cell with color coding and original "No previous data" text
  rows.append("td")
    .attr("class", d => {
      if (d.year === 2018) return "baseline-change";
      if (!d.hasChange) return "no-change";
      return d.change >= 0 ? "positive-change" : "negative-change";
    })
    .html(d => {
      if (d.year === 2018) return "Baseline";
      if (!d.hasChange) return "No previous data"; // Kept original text
      const arrow = d.change >= 0 ? 
        '<span class="change-arrow" style="color:#27ae60">↑</span>' : 
        '<span class="change-arrow" style="color:#e74c3c">↓</span>';
      return `${arrow} ${d3.format("+.1f")(d.change)}%`;
    })
    .append("title")
    .text(d => {
      if (d.year === 2018) return "First year of data";
      if (!d.hasChange) return `No ${d.product} trade data between ${d.country} and ${d.partner} in ${d.year-1}`;
      return `${d.year-1}: $${d3.format(",.1f")(d.prevValue)}B → ${d.year}: $${d3.format(",.1f")(d.value)}B (${d.change > 0 ? '+' : ''}${d3.format(".1f")(d.change)}%)`;
    });
}

// ======================
// TREND CHART FUNCTIONS
// ======================
function initTrendFilters(data) {
  // Get all unique products
  const products = [...new Set(data.trade.map(d => d.product))].sort();
  
  // Select the dropdown and clear existing options
  const productSelect = d3.select("#trend-product").html("");

  // Add default option
  productSelect
    .append("option")
    .attr("value", "")
    .text("Select a product");

  // Populate product dropdown
  productSelect.selectAll("option.product")
    .data(products)
    .enter()
    .append("option")
    .attr("class", "product")
    .attr("value", d => d)
    .text(d => d);
  
  // Set up event listener
  productSelect.on("change", updateTrendChart);
  
  // Reset the trend chart display
  d3.select("#trend-chart").html("<div class='trend-prompt'>Select a product to view trends</div>");
}


function updateTrendChart() {
  const product = d3.select("#trend-product").property("value");
  
  if (!product) {
    d3.select("#trend-chart").html("<div class='trend-prompt'>Select a product to view trends</div>");
    return;
  }
  
  // Filter data for selected product
  const productData = currentData.trade
    .filter(d => d.product === product)
    .sort((a, b) => a.year - b.year);
  
  if (productData.length === 0) {
    d3.select("#trend-chart").html(`<div class='trend-prompt'>No trade data for ${product}</div>`);
    return;
  }
  
  // Auto-determine trade direction (take first available)
  const exporter = productData[0].exporter;
  const importer = productData[0].importer;
  const isExport = true; // Always show as export from source
  
  renderTrendChart(productData, exporter, importer, product, isExport);
}

function renderTrendChart(data, exporter, importer, product, isExport) {
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
      .text(`No trade data for ${product}`);
    return;
  }

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

    const study = caseStudies[d3.select("#case-study").node().value];
  
    // Determine color based on trade direction
    const lineColor = isExport ? 
      study.countryColors[exporter] || "#2ecc71" : 
      study.countryColors[importer] || "#e74c3c";
  
    // Add line path (color based on direction)
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", lineColor)
      .attr("stroke-width", 3)
      .attr("d", line);
  
    // Add circles for data points (same color as line)
    svg.selectAll(".dot")
      .data(data)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(d.value_usd_billion))
      .attr("r", 5)
      .attr("fill", lineColor)
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

  // Add title showing fixed direction
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", -20)
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text(`${product} Exports from ${exporter} to ${importer}`);

  // Add grid lines
  svg.append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y)
      .tickSize(-width)
      .tickFormat(""))
    .selectAll("line")
    .attr("stroke", "#eee")
    .attr("stroke-dasharray", "2,2");
}

// ======================
// INSIGHTS FUNCTIONS
// ======================
function setupInsights() {
  const modal = document.getElementById("insights-modal");
  const btn = document.getElementById("insights-button");
  const span = document.getElementsByClassName("close-insights")[0];
  
  // When user clicks the button, open the modal
  btn.onclick = function() {
    const studyId = d3.select("#case-study").node().value;
    const study = caseStudies[studyId];
    
    document.getElementById("insights-title").textContent = `${study.name} Insights`;
    
    const container = d3.select("#insights-container").html("");
    
    study.insights.forEach((insight, i) => {
      container.append("div")
        .attr("class", "insight-item")
        .html(`
          <div class="insight-quote">"${insight}"</div>
          <div class="insight-source">— Analysis ${i+1}/${study.insights.length}</div>
        `);
    });
    
    modal.style.display = "block";
  };
  
  // When user clicks on (x), close the modal
  span.onclick = function() {
    modal.style.display = "none";
  };
  
  // When user clicks anywhere outside the modal, close it
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };
}

// Start the dashboard
document.addEventListener("DOMContentLoaded", initDashboard);
