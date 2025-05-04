// Netlify serverless function to search vehicles
const fetch = require("node-fetch");

exports.handler = async function (event, context) {
  try {
    // Get query parameters
    const params = event.queryStringParameters;
    const pickupDate = params.pickupDate;
    const dropoffDate = params.dropoffDate;
    const citySlug = (params.citySlug || "istanbul").toLowerCase().trim();

    // Validate required parameters
    if (!pickupDate || !dropoffDate) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          error: "Both pickupDate and dropoffDate parameters are required",
        }),
      };
    }

    // Format dates to match API requirements (DD.MM.YYYY HH:MM)
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${day}.${month}.${year} ${hours}:${minutes}`;
    };

    const formattedPickup = formatDate(pickupDate);
    const formattedDropoff = formatDate(dropoffDate);

    // Garenta API constants
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

    // Step 1: Get all branches
    const branchResponse = await fetch(`${BASE_URI}GetBranchesData`, {
      headers,
    });

    if (!branchResponse.ok) {
      throw new Error(
        `Failed to fetch branch data: ${branchResponse.status} ${branchResponse.statusText}`
      );
    }

    const branchData = await branchResponse.json();

    // Parse branches and filter by city
    const allBranches = [];
    if (branchData.data && Array.isArray(branchData.data)) {
      branchData.data.forEach((branch) => {
        if (branch.citySlug && branch.id && branch.referenceId && branch.name) {
          allBranches.push({
            branchId: branch.referenceId,
            locationId: branch.id,
            name: branch.name,
            citySlug: branch.citySlug,
          });
        }
      });
    }

    // Filter branches by city
    const branchesInCity = allBranches.filter(
      (branch) => branch.citySlug.toLowerCase() === citySlug
    );

    if (branchesInCity.length === 0) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({
          success: false,
          error: `No branches found for city: ${citySlug}`,
        }),
      };
    }

    // Map fuel type codes to names
    const fuelMap = {
      1: "Benzin",
      2: "Dizel",
      3: "Elektrik",
      4: "Hybrid",
    };

    // Map transmission type codes to names
    const transmissionMap = {
      1: "Otomatik",
      2: "Otomatik",
      3: "Manuel",
    };

    // Map segment codes to names
    const segmentMap = {
      1: "Ekonomi",
      2: "Konfor",
      3: "Lüks",
      4: "Prestij",
    };

    // Use all branches in the city
    const branchesToSearch = branchesInCity;
    console.log(
      `Searching in ${branchesToSearch.length} branches for ${citySlug}`
    );

    // Function to search a single branch
    const searchBranch = async (branch) => {
      const payload = {
        branchId: branch.branchId,
        locationId: branch.locationId,
        arrivalBranchId: branch.branchId,
        arrivalLocationId: branch.locationId,
        month: null,
        rentId: null,
        couponCode: null,
        collaborationId: null,
        collaborationReferenceId: null,
        pickupDate: formattedPickup,
        dropoffDate: formattedDropoff,
      };

      const searchHeaders = {
        ...headers,
        "Content-Type": "application/json",
      };

      try {
        const searchResponse = await fetch(`${BASE_URI}Search`, {
          method: "POST",
          headers: searchHeaders,
          body: JSON.stringify(payload),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();

          const branchVehicles = [];
          if (
            searchData.data &&
            searchData.data.vehicles &&
            Array.isArray(searchData.data.vehicles)
          ) {
            // Limit to first 5 vehicles per branch to avoid timeout
            const limitedVehicles = searchData.data.vehicles.slice(0, 5);

            limitedVehicles.forEach((vehicle) => {
              if (vehicle.vehicleInfo && vehicle.priceInfo) {
                const vehicleInfo = vehicle.vehicleInfo;
                const priceInfo = vehicle.priceInfo;

                const fuelType = fuelMap[vehicleInfo.fuelType] || "Bilinmiyor";
                const transmissionType =
                  transmissionMap[vehicleInfo.transmissionType] || "Bilinmiyor";
                const segmentName =
                  segmentMap[vehicleInfo.segment] || "Bilinmiyor";

                branchVehicles.push({
                  brand_model: vehicleInfo.vehicleDescription || "N/A",
                  fuel: fuelType,
                  gear: transmissionType,
                  segment_name: segmentName,
                  price_pay_now_str: priceInfo.discountedPriceStr || "N/A",
                  price_pay_office_str: priceInfo.netPriceStr || "N/A",
                  price_pay_now: priceInfo.discountedPrice || null,
                  price_pay_office: priceInfo.netPrice || null,
                  daily_price: priceInfo.dailyPrice || null,
                  daily_price_str: priceInfo.dailyPriceStr || "N/A",
                  currency: "TRY",
                  image: vehicleInfo.image || null,
                  branch_id: branch.branchId,
                  location_id: branch.locationId,
                  branch_name: branch.name,
                  city_slug: branch.citySlug,
                });
              }
            });
          }
          return branchVehicles;
        }
        return [];
      } catch (error) {
        console.error(`Error searching branch ${branch.name}:`, error);
        return [];
      }
    };

    // Function to process branches in chunks with delay between chunks
    const processBranchesInChunks = async (
      branches,
      chunkSize,
      useParallel
    ) => {
      const allVehicles = [];
      const chunks = [];

      // Split branches into chunks of chunkSize
      for (let i = 0; i < branches.length; i += chunkSize) {
        chunks.push(branches.slice(i, i + chunkSize));
      }

      console.log(
        `Processing ${branches.length} branches in ${chunks.length} chunks of ${chunkSize}`
      );

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `Processing chunk ${i + 1}/${chunks.length} with ${
            chunk.length
          } branches`
        );

        let chunkResults;

        if (useParallel) {
          // Process branches in this chunk in parallel
          const chunkPromises = chunk.map((branch) => searchBranch(branch));
          chunkResults = await Promise.all(chunkPromises);
        } else {
          // Process branches in this chunk sequentially
          chunkResults = [];
          for (const branch of chunk) {
            const result = await searchBranch(branch);
            chunkResults.push(result);
          }
        }

        // Add results from this chunk to all vehicles
        allVehicles.push(...chunkResults.flat());

        // Add delay between chunks (except after the last chunk)
        if (i < chunks.length - 1) {
          console.log(`Waiting 200ms before processing next chunk...`);
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      return allVehicles;
    };

    // Determine whether to use parallel requests based on branch count
    const useParallel = branchesToSearch.length > 3;
    console.log(
      `Using ${useParallel ? "parallel" : "sequential"} requests for ${
        branchesToSearch.length
      } branches`
    );

    // Process branches in chunks of 5 with 200ms delay between chunks
    const allVehiclesFromBranches = await processBranchesInChunks(
      branchesToSearch,
      5,
      useParallel
    );

    // Filter out vehicles with null price_pay_now
    const filteredVehicles = allVehiclesFromBranches.filter(
      (vehicle) =>
        vehicle.price_pay_now !== null && vehicle.price_pay_now !== undefined
    );

    // Sort vehicles by price_pay_now ascending
    filteredVehicles.sort((a, b) => {
      const priceA = a.price_pay_now ?? Number.MAX_SAFE_INTEGER;
      const priceB = b.price_pay_now ?? Number.MAX_SAFE_INTEGER;
      return priceA - priceB;
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        data: filteredVehicles,
        total: filteredVehicles.length,
        searchedBranches: branchesToSearch.length,

        totalBranches: branchesInCity.length,
        parallelSearch: branchesInCity.length > 3,
      }),
    };
  } catch (error) {
    console.error("Error searching vehicles:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        error: `Failed to search vehicles: ${error.message}`,
      }),
    };
  }
};
