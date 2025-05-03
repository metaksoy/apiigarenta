<?php

declare(strict_types=1);

// Basic error reporting for development
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

require_once __DIR__ . '/src/HttpClient.php';
require_once __DIR__ . '/src/DataParser.php';
require_once __DIR__ . '/src/GarentaService.php';

header('Content-Type: application/json');

try {
    // Start timing the request
    $startTime = microtime(true);
    
    // Initialize dependencies
    $httpClient = new HttpClient();
    $dataParser = new DataParser();
    $garentaService = new GarentaService($httpClient, $dataParser);

    // Get query parameters
    $pickupDate = $_GET['pickupDate'] ?? null;
    $dropoffDate = $_GET['dropoffDate'] ?? null;
    // Get citySlug from URL, default to 'istanbul' if not provided
    $citySlug = strtolower(trim($_GET['citySlug'] ?? 'istanbul')); 

    // Validate required parameters
    if (!$pickupDate || !$dropoffDate) {
        throw new InvalidArgumentException('Both pickupDate and dropoffDate parameters are required');
    }

    // Format dates to match API requirements (DD.MM.YYYY HH:MM)
    $formattedPickup = date('d.m.Y H:i', strtotime($pickupDate));
    $formattedDropoff = date('d.m.Y H:i', strtotime($dropoffDate));

    // Get vehicles based on citySlug
    $allVehicles = $garentaService->getAvailableVehiclesByCity($citySlug, $formattedPickup, $formattedDropoff);
    
    // Calculate execution time
    $executionTime = microtime(true) - $startTime;

    // Return JSON response with all vehicles and performance metrics
    echo json_encode([
        'success' => true,
        'data' => $allVehicles,
        'total' => count($allVehicles),
        'performance' => [
            'execution_time' => round($executionTime, 2) . ' seconds',
            'branch_count' => count($allVehicles) > 0 ? count(array_unique(array_column($allVehicles, 'branch_name'))) : 0
        ]
    ]);

} catch (Exception $e) {
    // Return error response
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
