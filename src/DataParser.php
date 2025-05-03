<?php

declare(strict_types=1);

class DataParser
{
    /**
     * Parses all branch data from the GetBranchesData endpoint.
     *
     * @param string $jsonData JSON string from GetBranchesData endpoint.
     * @return array Array of all branches with 'branchId', 'locationId', 'name', 'citySlug'.
     */
    public function parseAllBranches(string $jsonData): array
    {
        $data = json_decode($jsonData, true);
        $allBranches = [];

        if (isset($data['data']) && is_array($data['data'])) {
            foreach ($data['data'] as $branch) {
                // Check if all required keys exist (Istanbul filter kaldırıldı)
                if (isset($branch['citySlug'], $branch['id'], $branch['referenceId'], $branch['name'])) 
                {
                    $allBranches[] = [
                        'branchId' => $branch['referenceId'], // Actual Branch ID
                        'locationId' => $branch['id'],        // Actual Location ID
                        'name' => $branch['name'],          // Branch Name
                        'citySlug' => $branch['citySlug']    // City Slug
                    ];
                }
            }
        } else {
             error_log("Failed to parse branches or no data found in JSON: " . $jsonData);
        }

        return $allBranches;
    }

    /**
     * Parses DailyDrive branch data from LocationBranches endpoint.
     *
     * @param string $jsonData JSON string from DailyDrive LocationBranches endpoint.
     * @return array Array of branches with 'id', 'name'.
     */
    public function parseDailyDriveBranches(string $jsonData): array
    {
        $data = json_decode($jsonData, true);
        $branches = [];

        if (is_array($data)) {
            foreach ($data as $branch) {
                if (isset($branch['locNoField'], $branch['locNameField'])) {
                    $branches[] = [
                        'id' => $branch['locNoField'],
                        'name' => $branch['locNameField']
                    ];
                }
            }
        } else {
            error_log("Failed to parse DailyDrive branches from JSON: " . $jsonData);
        }

        return $branches;
    }

    /**
     * Parses DailyDrive city data from LocationCities endpoint.
     *
     * @param string $jsonData JSON string from DailyDrive LocationCities endpoint.
     * @return array Array of cities with 'id', 'slug', 'name'.
     */
    public function parseDailyDriveCities(string $jsonData): array
    {
        $data = json_decode($jsonData, true);
        $cities = [];

        if (is_array($data)) {
            foreach ($data as $city) {
                if (isset($city['idField'], $city['cityNameField'], $city['citySlugField'])) {
                    $cities[] = [
                        'id' => $city['idField'],
                        'slug' => $city['citySlugField'],
                        'name' => $city['cityNameField']
                    ];
                }
            }
        } else {
            error_log("Failed to parse DailyDrive cities from JSON: " . $jsonData);
        }

        return $cities;
    }

    /**
     * Parses DailyDrive vehicle search results.
     *
     * @param string $jsonData JSON string from DailyDrive CapacitySearch endpoint.
     * @return array Array of vehicles with required details.
     */
    public function parseDailyDriveVehicles(string $jsonData): array
    {
        $data = json_decode($jsonData, true);
        $vehicles = [];

        if (isset($data['data']) && is_array($data['data'])) {
            foreach ($data['data'] as $vehicle) {
                if (isset($vehicle['vehicleDescription'], $vehicle['dailyPrice'], $vehicle['discountedPrice'])) {
                    // Extract base vehicle info
                    $brandModel = $vehicle['vehicleDescription'] ?? 'N/A';
                    
                    // Parse brand and model from description (format: "BRAND MODEL ...")
                    $parts = explode(' ', $brandModel);
                    $brand = count($parts) > 0 ? $parts[0] : 'N/A';
                    $model = count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : 'N/A';

                    $vehicles[] = [
                        'brand_model' => $brandModel,
                        'brand' => $brand,
                        'model' => $model,
                        'daily_price' => $vehicle['dailyPrice'] ?? null,
                        'daily_price_str' => $vehicle['dailyPriceStr'] ?? 'N/A',
                        'price_pay_now' => $vehicle['discountedPrice'] ?? null,
                        'price_pay_now_str' => $vehicle['discountedPriceStr'] ?? 'N/A',
                        'price_pay_office' => $vehicle['netPrice'] ?? null,
                        'price_pay_office_str' => $vehicle['netPriceStr'] ?? 'N/A',
                        'currency' => 'TRY',
                        'image' => $vehicle['image'] ?? null,
                        'transmission' => $vehicle['transmissionType'] ?? 'Bilinmiyor',
                        'fuel' => $vehicle['fuelType'] ?? 'Bilinmiyor',
                        'segment' => $vehicle['segment'] ?? 'Bilinmiyor'
                    ];
                }
            }
        } elseif (isset($data['success']) && $data['success'] === false && isset($data['error']['message'])) {
            error_log("DailyDrive API Error during vehicle search: " . $data['error']['message']);
        } else {
            error_log("Failed to parse DailyDrive vehicles. JSON: " . substr($jsonData, 0, 500));
        }

        return $vehicles;
    }

    /**
     * Parses vehicle search results based on the current API structure.
     *
     * @param string $jsonData JSON string from Search endpoint.
     * @return array Array of vehicles with required details.
     */
    public function parseVehicles(string $jsonData): array
    {
        $data = json_decode($jsonData, true);
        $vehicles = [];

        if (isset($data['data']['vehicles']) && is_array($data['data']['vehicles'])) {
            foreach ($data['data']['vehicles'] as $vehicle) {
                if (isset($vehicle['vehicleInfo']) && isset($vehicle['priceInfo'])) {
                    $vehicleInfo = $vehicle['vehicleInfo'];
                    $priceInfo = $vehicle['priceInfo'];

                    // Map fuel type codes to names (Confirmed by user)
                    $fuelMap = [
                        1 => 'Benzin',
                        2 => 'Dizel',
                        3 => 'Elektrik',
                        4 => 'Hybrid'
                        // Add other mappings if discovered
                    ];
                    $fuelType = $fuelMap[$vehicleInfo['fuelType']] ?? 'Bilinmiyor';

                    // Map transmission type codes to names (Updated based on user)
                    $transmissionMap = [
                        1 => 'Otomatik', // 1 eklendi
                        2 => 'Otomatik',
                        3 => 'Manuel'
                        // Add other mappings if discovered
                    ];
                    $transmissionType = $transmissionMap[$vehicleInfo['transmissionType']] ?? 'Bilinmiyor';

                    // Map segment codes to names (Based on user)
                    $segmentMap = [
                        1 => 'Ekonomi',
                        2 => 'Konfor',
                        3 => 'Lüks',
                        4 => 'Prestij'
                        // Add other mappings if discovered
                    ];
                    $segmentName = $segmentMap[$vehicleInfo['segment']] ?? 'Bilinmiyor';

                    // Extracting details based on the provided successful response structure
                    $vehicles[] = [
                        'brand_model' => $vehicleInfo['vehicleDescription'] ?? 'N/A',
                        'fuel' => $fuelType,
                        'gear' => $transmissionType,
                        'segment_name' => $segmentName, // Segment eklendi
                        // Use Garenta's formatted strings directly
                        'price_pay_now_str' => $priceInfo['discountedPriceStr'] ?? 'N/A', 
                        'price_pay_office_str' => $priceInfo['netPriceStr'] ?? 'N/A',
                        // Keep numeric prices maybe for filtering/sorting if needed later
                        'price_pay_now' => $priceInfo['discountedPrice'] ?? null,
                        'price_pay_office' => $priceInfo['netPrice'] ?? null,
                        'daily_price' => $priceInfo['dailyPrice'] ?? null, 
                        'daily_price_str' => $priceInfo['dailyPriceStr'] ?? 'N/A', // Günlük fiyat string'i de alalım
                        'currency' => 'TRY', // Assuming TRY 
                        'image' => $vehicleInfo['image'] ?? null
                    ];
                }
            }
        } elseif (isset($data['success']) && $data['success'] === false && isset($data['error']['message'])) {
             // Log API-level errors reported by Garenta
             error_log("Garenta API Error during vehicle search: " . $data['error']['message']);
        } else {
             // Log unexpected structure
             error_log("Failed to parse vehicles or no vehicles found in expected data.data.vehicles structure. JSON: " . substr($jsonData, 0, 500));
        }

        return $vehicles;
    }
}
