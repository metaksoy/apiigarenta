# Garenta Araç Kiralama Uygulaması - Paralel İstek Optimizasyonu

## Paralel İstek Özelliği

Bu uygulama, çok sayıda şube olan şehirlerde API isteklerini paralel olarak göndererek toplam istek süresini önemli ölçüde azaltır.

### Nasıl Çalışır?

1. **Şube Sayısına Göre Otomatik Karar Verme**:

   - Sistem, şehirdeki şube sayısına göre paralel istek kullanıp kullanmayacağına otomatik olarak karar verir.
   - 3'ten fazla şube varsa paralel istek yöntemi kullanılır, aksi takdirde sıralı istekler gönderilir.

2. **Batch İşleme**:

   - Şubeler 5'li gruplar halinde işlenir.
   - Her grup için istekler eş zamanlı olarak gönderilir.
   - Gruplar arasında kısa bir bekleme süresi (100ms) eklenerek sunucu üzerindeki yük dengelenir.

3. **Performans Metrikleri**:
   - API yanıtında toplam işlem süresi ve işlenen şube sayısı gibi performans metrikleri döndürülür.
   - Bu metrikler kullanıcı arayüzünde gösterilerek şeffaflık sağlanır.

### Teknik Detaylar

- PHP'nin `curl_multi_*` fonksiyonları kullanılarak paralel HTTP istekleri gerçekleştirilir.
- Her istek için ayrı bir CURL handle oluşturulur ve bunlar bir multi-handle'a eklenir.
- Tüm istekler tamamlanana kadar sistem bekler ve sonuçları toplar.
- Elde edilen sonuçlar birleştirilip işlenerek kullanıcıya sunulur.

### Avantajları

- **Hız**: İstanbul gibi çok şubeli şehirlerde istek süresi %60-80 oranında azalır.
- **Kullanıcı Deneyimi**: Daha hızlı sonuçlar kullanıcı memnuniyetini artırır.
- **Sunucu Yükü Yönetimi**: Batch işleme ve kısa beklemeler sayesinde sunucu üzerindeki ani yük artışları engellenir.

### Kullanım

Kullanıcının herhangi bir ek işlem yapmasına gerek yoktur. Sistem otomatik olarak en uygun istek yöntemini seçer ve uygular.
