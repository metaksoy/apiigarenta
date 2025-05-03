<?php

declare(strict_types=1);

class HttpClient
{
    private const BASE_URI = 'https://apigw.garenta.com.tr/';
    private const TENANT_ID = '4cdb69b2-f39b-4f2f-8302-b6198501bcc9'; // Provided in example

    /**
     * Performs a GET request.
     *
     * @param string $endpoint
     * @return string|false The response body or false on failure.
     */
    public function get(string $endpoint): string|false
    {
        $url = self::BASE_URI . ltrim($endpoint, '/');
        $ch = curl_init($url);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10); // 10 saniye bağlantı zaman aşımı
        curl_setopt($ch, CURLOPT_TIMEOUT, 30); // 30 saniye toplam zaman aşımı
        curl_setopt($ch, CURLOPT_HTTPHEADER, $this->getBaseHeaders());
        // Add any specific GET headers if needed

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && $response !== false) {
            return $response;
        }

        // Log error or handle appropriately
        error_log("HTTP GET request failed for {$url}. HTTP Code: {$httpCode}");
        return false;
    }

    /**
     * Performs a POST request.
     *
     * @param string $endpoint
     * @param array $data
     * @return string|false The response body or false on failure.
     */
    public function post(string $endpoint, array $data): string|false
    {
        $url = self::BASE_URI . ltrim($endpoint, '/');
        $payload = json_encode($data);

        $ch = curl_init($url);

        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10); // 10 saniye bağlantı zaman aşımı
        curl_setopt($ch, CURLOPT_TIMEOUT, 30); // 30 saniye toplam zaman aşımı
        curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge(
            $this->getBaseHeaders(),
            [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($payload)
            ]
        ));

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && $response !== false) {
            return $response;
        }

        // Log error or handle appropriately
        error_log("HTTP POST request failed for {$url}. HTTP Code: {$httpCode}. Error: {$error}. Payload: {$payload}");
        return false;
    }

    /**
     * Returns base headers required for Garenta API requests.
     *
     * @return array
     */
    private function getBaseHeaders(): array
    {
        // Mimic browser headers from the example
        return [
            'Accept: application/json, text/plain, */*',
            'Accept-Language: tr',
            'Cache-Control: no-cache',
            'Pragma: no-cache',
            'Priority: u=1, i', // Note: Priority header might not be settable via cURL or necessary
            'Sec-Fetch-Dest: empty',
            'Sec-Fetch-Mode: cors',
            'Sec-Fetch-Site: same-site',
            'Sec-GPC: 1',
            'X-Tenant-Id: ' . self::TENANT_ID,
            // Generate a somewhat realistic device info string
            'X-Web-Device-Info: ' . json_encode([
                "browser" => "Chrome", // Generic browser
                "webDeviceType" => "desktop", // Assume desktop for API calls
                "os" => "Windows", // Generic OS
                "sessionId" => time() // Use current timestamp as session ID
            ]),
            'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' // Standard User-Agent
        ];
    }
}
