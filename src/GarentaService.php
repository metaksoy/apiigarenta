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

        $allVehicles = [];
        // Sadece filtrelenmiş şubelerde ara
        foreach ($branchesInCity as $branch) { 
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
             // Optional: Add a small delay between requests to avoid rate limiting
             // usleep(500000); // 0.5 seconds
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
}
