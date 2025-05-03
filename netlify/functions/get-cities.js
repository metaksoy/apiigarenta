// Netlify serverless function to get cities
const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  try {
    // Garenta API base URL
    const BASE_URI = "https://apigw.garenta.com.tr/";
    const TENANT_ID = "4cdb69b2-f39b-4f2f-8302-b6198501bcc9";

    // Headers for Garenta API
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "tr",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Priority: "u=1, i",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "Sec-GPC": "1",
      "X-Tenant-Id": TENANT_ID,
      "X-Web-Device-Info": JSON.stringify({
        browser: "Chrome",
        webDeviceType: "desktop",
        os: "Windows",
        sessionId: Date.now(),
      }),
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    // Fetch branch data from Garenta API
    const response = await fetch(`${BASE_URI}GetBranchesData`, { headers });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch branch data: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Parse branch data to extract cities
    const cities = [];
    const uniqueSlugs = {};

    if (data.data && Array.isArray(data.data)) {
      data.data.forEach((branch) => {
        if (branch.citySlug && branch.name && !uniqueSlugs[branch.citySlug]) {
          // Simply convert slug to title case for city name
          const cityName =
            branch.citySlug.charAt(0).toUpperCase() + branch.citySlug.slice(1);

          cities.push({
            slug: branch.citySlug,
            name: cityName,
          });
          uniqueSlugs[branch.citySlug] = true; // Mark slug to prevent duplicates
        }
      });

      // Sort cities by name
      cities.sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Allow CORS
      },
      body: JSON.stringify({
        success: true,
        cities: cities,
      }),
    };
  } catch (error) {
    console.error("Error fetching cities:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Allow CORS
      },
      body: JSON.stringify({
        success: false,
        error: `Failed to retrieve city list: ${error.message}`,
      }),
    };
  }
};
