<?php

declare(strict_types=1);

header('Content-Type: application/json');

require_once __DIR__ . '/src/HttpClient.php';
require_once __DIR__ . '/src/DataParser.php';

try {
    $httpClient = new HttpClient();
    $dataParser = new DataParser();

    // Tüm şube verisini çek
    $allBranchDataJson = $httpClient->get('/GetBranchesData');
    if ($allBranchDataJson === false) {
        throw new RuntimeException("Failed to fetch branch data from Garenta API.");
    }

    // Tüm şubeleri ayrıştır
    $allBranches = $dataParser->parseAllBranches($allBranchDataJson);
    if ($allBranches === false) { // DataParser'ın hata durumunda false döndürdüğünü varsayalım
         throw new RuntimeException("Failed to parse branch data.");
    }

    $cities = [];
    $uniqueSlugs = [];

    foreach ($allBranches as $branch) {
        if (isset($branch['citySlug']) && isset($branch['name']) && !isset($uniqueSlugs[$branch['citySlug']])) {
            // Basitçe slug'ı büyük harfe çevirerek şehir adı elde edelim
            // Garenta API'sinde şehir adı için daha iyi bir alan varsa o kullanılabilir.
            $cityName = ucfirst($branch['citySlug']); 
            
            $cities[] = [
                'slug' => $branch['citySlug'],
                'name' => $cityName 
            ];
            $uniqueSlugs[$branch['citySlug']] = true; // Tekrarları önlemek için slug'ı işaretle
        }
    }
    
    // Şehirleri isme göre sırala
    usort($cities, function($a, $b) {
        return strcmp($a['name'], $b['name']);
    });


    echo json_encode(['success' => true, 'cities' => $cities]);

} catch (Exception $e) {
    http_response_code(500); // Sunucu hatası
    echo json_encode([
        'success' => false,
        'error' => 'Failed to retrieve city list: ' . $e->getMessage()
    ]);
} 