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

    // Return JSON response with all vehicles
    echo json_encode([
        'success' => true,
        'data' => $allVehicles,
        'total' => count($allVehicles)
    ]);

} catch (Exception $e) {
    // Return error response
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
