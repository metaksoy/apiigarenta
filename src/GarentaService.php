<?php

declare(strict_types=1);

require_once __DIR__ . '/HttpClient.php';
require_once __DIR__ . '/DataParser.php';

class GarentaService
{
    private HttpClient $httpClient;
    private DataParser $dataParser;

    // Sabit İstanbul Şubeleri yorum satırı yapıldı, dinamik yapıya geri dönüldü
    /*
    private const ISTANBUL_BRANCHES = [
        [
            'branchId' => 'b8fa5a71-9891-44a0-83aa-1270ddbaa868', // Örnekteki ID
            'locationId' => 'e7d1fbeb-871f-4ffb-651d-08dd394ce1b3', // Örnekteki ID
            'name' => 'İstanbul Havalimanı (Tahmini)', // İsmi tahmin ediyoruz
            'citySlug' => 'istanbul'
        ],
        [
            'branchId' => '30e4350a-84e2-47de-afb0-a1347454080e', // Örnekteki ID
            'locationId' => '0661ed1e-48d2-428a-6535-08dd394ce1b3', // Örnekteki ID
            'name' => 'Sabiha Gökçen Havalimanı (Tahmini)', // İsmi tahmin ediyoruz
            'citySlug' => 'istanbul'
        ],
        // Buraya başka bilinen İstanbul şubeleri eklenebilir
    ];
    */

    public function __construct(HttpClient $httpClient, DataParser $dataParser)
    {
        $this->httpClient = $httpClient;
        $this->dataParser = $dataParser;
    }

    /**
     * Fetches and parses Istanbul branch IDs.
     *
     * @return array
     */
    public function getIstanbulBranches(): array
    {
        $branchDataJson = $this->httpClient->get('/GetBranchesData');
        if ($branchDataJson === false) {
            error_log("Failed to fetch branch data.");
            return [];
        }
        return $this->dataParser->parseBranchesForIstanbul($branchDataJson);
    }

    /**
     * Searches for vehicles for a specific branch and date range.
     *
     * @param string $branchId
     * @param string $locationId
     * @param string $pickupDate Formatted as 'DD.MM.YYYY HH:MM'
     * @param string $dropoffDate Formatted as 'DD.MM.YYYY HH:MM'
     * @return array Parsed vehicle list or empty array on failure.
     */
    public function searchVehicles(string $branchId, string $locationId, string $pickupDate, string $dropoffDate): array
    {
        $payload = [
            "branchId" => $branchId,
            "locationId" => $locationId,
            "arrivalBranchId" => $branchId, // Same pickup/dropoff location as requested
            "arrivalLocationId" => $locationId,
            "month" => null,
            "rentId" => null,
            "couponCode" => null,
            "collaborationId" => null,
            "collaborationReferenceId" => null,
            "pickupDate" => $pickupDate,
            "dropoffDate" => $dropoffDate
        ];

        $searchResultJson = $this->httpClient->post('/Search', $payload);

        if ($searchResultJson === false) {
             error_log("Failed to search vehicles for Branch: {$branchId}, Location: {$locationId}");
            return [];
        }

        return $this->dataParser->parseVehicles($searchResultJson);
    }

    /**
     * Gets all available vehicles from all branches in a specific city for the given dates.
     * Uses parallel requests to improve performance for cities with many branches.
     *
     * @param string $citySlug The slug of the city to search in (e.g., 'istanbul', 'ankara').
     * @param string $pickupDate Formatted as 'DD.MM.YYYY HH:MM'
     * @param string $dropoffDate Formatted as 'DD.MM.YYYY HH:MM'
     * @return array Sorted list of all available vehicles in the specified city.
     */
    public function getAvailableVehiclesByCity(string $citySlug, string $pickupDate, string $dropoffDate): array
    {
        // Önce tüm şube verisini al
        $allBranchDataJson = $this->httpClient->get('/GetBranchesData');
        if ($allBranchDataJson === false) {
            error_log("Failed to fetch all branch data.");
            return [];
        }
        // Tüm şubeleri ayrıştır
        $allBranches = $this->dataParser->parseAllBranches($allBranchDataJson);
        if (empty($allBranches)) {
            error_log("No branches parsed from data.");
            return [];
        }

        // Belirtilen şehre göre filtrele (küçük/büyük harf duyarsız)
        $targetCitySlugLower = strtolower($citySlug);
        $branchesInCity = array_filter($allBranches, function($branch) use ($targetCitySlugLower) {
            return isset($branch['citySlug']) && strtolower($branch['citySlug']) === $targetCitySlugLower;
        });

        if (empty($branchesInCity)) {
            error_log("No branches found for city slug: " . $citySlug);
            return [];
        }

        // Reindex array to have sequential keys
        $branchesInCity = array_values($branchesInCity);
        
        // Determine if we should use parallel requests based on branch count
        $branchCount = count($branchesInCity);
        $useParallel = $branchCount > 3; // Only use parallel for cities with more than 3 branches
        
        $allVehicles = [];
        
        if ($useParallel) {
            // Parallel request implementation
            $allVehicles = $this->getVehiclesWithParallelRequests($branchesInCity, $pickupDate, $dropoffDate);
        } else {
            // Sequential request implementation (original method)
            $allVehicles = $this->getVehiclesSequentially($branchesInCity, $pickupDate, $dropoffDate);
        }

        // Remove vehicles with null price_pay_now before sorting
        $allVehicles = array_filter($allVehicles, fn($vehicle) => isset($vehicle['price_pay_now']) && $vehicle['price_pay_now'] !== null);

        // Sort vehicles by price_pay_now ascending
        usort($allVehicles, function ($a, $b) {
            // Handle potential nulls defensively, treating null as max value for sorting
            $priceA = $a['price_pay_now'] ?? PHP_INT_MAX;
            $priceB = $b['price_pay_now'] ?? PHP_INT_MAX;
            return $priceA <=> $priceB;
        });

        return $allVehicles;
    }
    
    /**
     * Gets vehicles from branches using sequential requests.
     *
     * @param array $branches Array of branch data
     * @param string $pickupDate Formatted as 'DD.MM.YYYY HH:MM'
     * @param string $dropoffDate Formatted as 'DD.MM.YYYY HH:MM'
     * @return array List of all available vehicles from the branches
     */
    private function getVehiclesSequentially(array $branches, string $pickupDate, string $dropoffDate): array
    {
        $allVehicles = [];
        
        foreach ($branches as $branch) { 
            $vehiclesFromBranch = $this->searchVehicles($branch['branchId'], $branch['locationId'], $pickupDate, $dropoffDate);
            if (!empty($vehiclesFromBranch)) {
                // Add branch info to each vehicle from this specific branch
                $vehiclesWithBranchInfo = [];
                foreach ($vehiclesFromBranch as $vehicle) {
                    $vehicle['branch_id'] = $branch['branchId'];
                    $vehicle['location_id'] = $branch['locationId'];
                    $vehicle['branch_name'] = $branch['name']; // Şube adı eklendi
                    $vehicle['city_slug'] = $branch['citySlug']; // City slug eklendi
                    $vehiclesWithBranchInfo[] = $vehicle;
                }
                $allVehicles = array_merge($allVehicles, $vehiclesWithBranchInfo);
            }
        }
        
        return $allVehicles;
    }
    
    /**
     * Gets vehicles from branches using parallel requests for better performance.
     *
     * @param array $branches Array of branch data
     * @param string $pickupDate Formatted as 'DD.MM.YYYY HH:MM'
     * @param string $dropoffDate Formatted as 'DD.MM.YYYY HH:MM'
     * @return array List of all available vehicles from the branches
     */
    private function getVehiclesWithParallelRequests(array $branches, string $pickupDate, string $dropoffDate): array
    {
        $allVehicles = [];
        $batchSize = 5; // Process 5 branches in parallel
        $totalBranches = count($branches);
        
        // Process branches in batches
        for ($i = 0; $i < $totalBranches; $i += $batchSize) {
            $batch = array_slice($branches, $i, $batchSize);
            $multiHandle = curl_multi_init();
            $curlHandles = [];
            $responses = [];
            
            // Setup curl handles for each branch in the batch
            foreach ($batch as $index => $branch) {
                $payload = [
                    "branchId" => $branch['branchId'],
                    "locationId" => $branch['locationId'],
                    "arrivalBranchId" => $branch['branchId'],
                    "arrivalLocationId" => $branch['locationId'],
                    "month" => null,
                    "rentId" => null,
                    "couponCode" => null,
                    "collaborationId" => null,
                    "collaborationReferenceId" => null,
                    "pickupDate" => $pickupDate,
                    "dropoffDate" => $dropoffDate
                ];
                
                $url = 'https://apigw.garenta.com.tr/Search';
                $payloadJson = json_encode($payload);
                
                $ch = curl_init($url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_POST, true);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
                curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
                curl_setopt($ch, CURLOPT_TIMEOUT, 30);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'Accept: application/json, text/plain, */*',
                    'Accept-Language: tr',
                    'Cache-Control: no-cache',
                    'Pragma: no-cache',
                    'Content-Type: application/json',
                    'Content-Length: ' . strlen($payloadJson),
                    'X-Tenant-Id: 4cdb69b2-f39b-4f2f-8302-b6198501bcc9',
                    'X-Web-Device-Info: ' . json_encode([
                        "browser" => "Chrome",
                        "webDeviceType" => "desktop",
                        "os" => "Windows",
                        "sessionId" => time()
                    ]),
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]);
                
                $curlHandles[$index] = $ch;
                $responses[$index] = ['branch' => $branch, 'response' => ''];
                curl_multi_add_handle($multiHandle, $ch);
            }
            
            // Execute the parallel requests
            $running = null;
            do {
                curl_multi_exec($multiHandle, $running);
                curl_multi_select($multiHandle); // Wait for activity on any connection
            } while ($running > 0);
            
            // Get the responses and process them
            foreach ($curlHandles as $index => $ch) {
                $responses[$index]['response'] = curl_multi_getcontent($ch);
                curl_multi_remove_handle($multiHandle, $ch);
                curl_close($ch);
                
                $branch = $responses[$index]['branch'];
                $jsonResponse = $responses[$index]['response'];
                
                if ($jsonResponse) {
                    $vehiclesFromBranch = $this->dataParser->parseVehicles($jsonResponse);
                    
                    if (!empty($vehiclesFromBranch)) {
                        // Add branch info to each vehicle
                        foreach ($vehiclesFromBranch as $vehicle) {
                            $vehicle['branch_id'] = $branch['branchId'];
                            $vehicle['location_id'] = $branch['locationId'];
                            $vehicle['branch_name'] = $branch['name'];
                            $vehicle['city_slug'] = $branch['citySlug'];
                            $allVehicles[] = $vehicle;
                        }
                    }
                }
            }
            
            curl_multi_close($multiHandle);
            
            // Small delay between batches to avoid overwhelming the server
            if ($i + $batchSize < $totalBranches) {
                usleep(100000); // 0.1 seconds
            }
        }
        
        return $allVehicles;
    }
}
