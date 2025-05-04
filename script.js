document.addEventListener("DOMContentLoaded", () => {
  const citySelectElement = document.getElementById("city-select"); // Renamed for clarity
  let cityChoicesInstance = null; // To hold Choices.js instance
  const searchForm = document.getElementById("search-form");
  const resultsArea = document.getElementById("results-area");
  const vehicleResultsContainer = document.getElementById("vehicle-results");
  const loadingIndicator = document.getElementById("loading-indicator");
  const errorMessage = document.getElementById("error-message");
  const noResultsMessage = document.getElementById("no-results-message");
  const pickupDateInput = document.getElementById("pickup-date");
  const dropoffDateInput = document.getElementById("dropoff-date");
  const sortSelect = document.getElementById("sort-select");

  // Filtre elemanları
  const segmentFilterSelect = document.getElementById("segment-filter");
  const fuelFilterSelect = document.getElementById("fuel-filter");
  const gearFilterSelect = document.getElementById("gear-filter");

  let allFetchedVehicles = [];
  let currentFilters = {
    segment: "all",
    fuel: "all",
    gear: "all",
  };
  let currentSort = "price_asc";
  let currentPage = 1;
  const itemsPerPage = 25; // Changed to 25 as per requirement
  let totalPages = 1;
  let isFetching = false;
  let lastSearchParams = null;
  let lastSearchCity = null;
  let lastSearchPickupDate = null;
  let lastSearchDropoffDate = null;

  // --- Tarih Ayarları ---
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);

  // Tarih inputlarının minimum değerlerini ayarla (bugünden sonrası)
  const formatDate = (date) => date.toISOString().split("T")[0];
  pickupDateInput.min = formatDate(today);
  dropoffDateInput.min = formatDate(tomorrow);

  // Varsayılan tarihleri ayarla (Bugün alış, yarın iade)
  pickupDateInput.value = formatDate(today);
  dropoffDateInput.value = formatDate(tomorrow);

  // Alış tarihi değiştiğinde, iade tarihinin minimumunu ayarla
  pickupDateInput.addEventListener("change", () => {
    const pickupDate = new Date(pickupDateInput.value);
    const nextDay = new Date(pickupDate);
    nextDay.setDate(pickupDate.getDate() + 1);
    dropoffDateInput.min = formatDate(nextDay);
    // Eğer iade tarihi, yeni alış tarihinden önceyse, iadeyi bir sonraki güne ayarla
    if (new Date(dropoffDateInput.value) <= pickupDate) {
      dropoffDateInput.value = formatDate(nextDay);
    }
  });

  // --- Şehirleri Yükleme ---
  fetch("get_cities.php")
    .then((response) => response.json())
    .then((data) => {
      if (data.success && data.cities) {
        data.cities.forEach((city) => {
          const option = document.createElement("option");
          option.value = city.slug;
          option.textContent = city.name;
          citySelectElement.appendChild(option); // Use renamed variable
        });

        // Initialize Choices.js after options are added
        if (cityChoicesInstance) {
          cityChoicesInstance.destroy(); // Destroy previous instance if exists
        }
        cityChoicesInstance = new Choices(citySelectElement, {
          searchEnabled: true,
          itemSelectText: "Seç",
          removeItemButton: false,
          shouldSort: false, // Keep original order
          placeholder: true,
          placeholderValue: "Şehir Seçiniz...",
          searchPlaceholderValue: "Şehir ara...",
        });
      } else {
        showError(
          "Şehir listesi yüklenemedi: " + (data.error || "Bilinmeyen hata")
        );
      }
    })
    .catch((error) => {
      console.error("Şehirleri getirme hatası:", error);
      showError("Şehir listesi yüklenirken bir hata oluştu.");
    });

  // --- Filtre Dropdown'larını Doldurma ---
  function populateFilterOptions() {
    const segments = new Set();
    const fuels = new Set();
    const gears = new Set();

    // Tüm araçların özelliklerini topla, sayfa sınırlaması olmadan
    allFetchedVehicles.forEach((v) => {
      if (v.segment_name && v.segment_name !== "Bilinmiyor")
        segments.add(v.segment_name);
      if (v.fuel && v.fuel !== "Bilinmiyor") fuels.add(v.fuel);
      if (v.gear && v.gear !== "Bilinmiyor") gears.add(v.gear);
    });

    populateSelect(segmentFilterSelect, segments);
    populateSelect(fuelFilterSelect, fuels);
    populateSelect(gearFilterSelect, gears);
  }

  function populateSelect(selectElement, optionsSet) {
    // Mevcut seçenekleri temizle (ilk "Tümü" hariç)
    while (selectElement.options.length > 1) {
      selectElement.remove(1);
    }
    // Yeni seçenekleri ekle
    optionsSet.forEach((optionText) => {
      const option = document.createElement("option");
      option.value = optionText;
      option.textContent = optionText;
      selectElement.appendChild(option);
    });
    selectElement.value = "all";
  }

  // Filtre değişikliklerini dinle
  segmentFilterSelect.addEventListener("change", (e) => {
    currentFilters.segment = e.target.value;
    currentPage = 1; // Filtre değiştiğinde ilk sayfaya dön
    applyFiltersWithTransition();
  });
  fuelFilterSelect.addEventListener("change", (e) => {
    currentFilters.fuel = e.target.value;
    currentPage = 1; // Filtre değiştiğinde ilk sayfaya dön
    applyFiltersWithTransition();
  });
  gearFilterSelect.addEventListener("change", (e) => {
    currentFilters.gear = e.target.value;
    currentPage = 1; // Filtre değiştiğinde ilk sayfaya dön
    applyFiltersWithTransition();
  });

  // Sıralama değişikliğini dinle
  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    currentPage = 1; // Sıralama değiştiğinde ilk sayfaya dön
    applyFiltersWithTransition();
  });

  // Filtreleme işlemini geçiş efekti ile uygula
  function applyFiltersWithTransition() {
    // Önce sonuçları gizle ve yükleniyor göster
    vehicleResultsContainer.style.opacity = "0.5";
    document.getElementById("pagination-loading").style.display = "block";

    // Kısa bir gecikme ile filtreleme işlemini yap (animasyon için)
    setTimeout(() => {
      applyFiltersAndSort();
      // Sonuçları göster ve yükleniyor gizle
      vehicleResultsContainer.style.opacity = "1";
      document.getElementById("pagination-loading").style.display = "none";
    }, 200);
  }

  // --- Filtreleme ve Sıralama Uygulama Fonksiyonu ---
  function applyFiltersAndSort() {
    // Önce tüm araçlar üzerinde filtreleme yap
    let filteredVehicles = allFetchedVehicles.filter((vehicle) => {
      const segmentMatch =
        currentFilters.segment === "all" ||
        vehicle.segment_name === currentFilters.segment;
      const fuelMatch =
        currentFilters.fuel === "all" || vehicle.fuel === currentFilters.fuel;
      const gearMatch =
        currentFilters.gear === "all" || vehicle.gear === currentFilters.gear;
      return segmentMatch && fuelMatch && gearMatch;
    });

    // Sırala
    filteredVehicles.sort((a, b) => {
      const priceA = a.price_pay_now ?? Infinity;
      const priceB = b.price_pay_now ?? Infinity;
      if (currentSort === "price_asc") {
        return priceA - priceB;
      } else if (currentSort === "price_desc") {
        return priceB - priceA;
      }
      return 0;
    });

    // Sayfalama için toplam sayfa sayısını hesapla
    totalPages = Math.ceil(filteredVehicles.length / itemsPerPage);

    // Mevcut sayfa geçerli sayfa sayısından büyükse, ilk sayfaya dön
    if (currentPage > totalPages && totalPages > 0) {
      currentPage = 1;
    }

    // Mevcut sayfadaki araçları göster
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageVehicles = filteredVehicles.slice(startIndex, endIndex);

    displayVehicles(currentPageVehicles);

    if (filteredVehicles.length === 0) {
      showNoResults();
      document.getElementById("pagination-container").style.display = "none";
    } else {
      hideNoResults();
      // Sayfalama kontrollerini güncelle
      updatePagination(currentPage, totalPages);
      document.getElementById("pagination-container").style.display = "flex";
    }
  }

  // --- Arama Formu Gönderme ---
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault(); // Formun normal gönderimini engelle

    const formData = new FormData(searchForm);
    const citySlug = formData.get("citySlug");
    const pickupDate = formData.get("pickupDate");
    const dropoffDate = formData.get("dropoffDate");

    // Basit tarih kontrolü
    if (new Date(dropoffDate) <= new Date(pickupDate)) {
      showError("İade tarihi, alış tarihinden sonra olmalıdır.");
      return;
    }

    // API isteği için parametreleri hazırla (Tarihlere saat ekle 10:00 gibi)
    // API'nız `strtotime` kullandığı için YYYY-MM-DD yeterli olabilir,
    // ama Garenta'nın gerçek API'si saat bekleyebilir.
    const pickupDateTime = `${pickupDate} 10:00`;
    const dropoffDateTime = `${dropoffDate} 10:00`;

    const searchParams = new URLSearchParams({
      citySlug: citySlug,
      pickupDate: pickupDateTime,
      dropoffDate: dropoffDateTime,
    });

    // Yeni arama için filtreleri sıfırla
    resetFilters();

    // Reset pagination to page 1 for new searches
    currentPage = 1;
    fetchVehicles(searchParams, citySlug, pickupDate, dropoffDate);
  });

  // Filtreleri sıfırlama fonksiyonu
  function resetFilters() {
    // Filtre değerlerini sıfırla
    currentFilters = {
      segment: "all",
      fuel: "all",
      gear: "all",
    };

    // Filtre seçicileri UI'da da sıfırla
    segmentFilterSelect.value = "all";
    fuelFilterSelect.value = "all";
    gearFilterSelect.value = "all";

    // Sıralamayı da varsayılana döndür
    currentSort = "price_asc";
    sortSelect.value = "price_asc";
  }

  // --- Araçları Getirme Fonksiyonu ---
  function fetchVehicles(params, citySlug, pickupDate, dropoffDate) {
    if (isFetching) return;
    isFetching = true;

    // Store search parameters for pagination
    lastSearchParams = params;
    lastSearchCity = citySlug;
    lastSearchPickupDate = pickupDate;
    lastSearchDropoffDate = dropoffDate;
    currentPage = 1;

    // Filtreleri sıfırla (UI güncelleme için resetFilters fonksiyonu zaten çağrıldı)
    currentFilters = {
      segment: "all",
      fuel: "all",
      gear: "all",
    };
    currentSort = "price_asc";

    showLoading();
    hideError();
    hideNoResults();
    displaySearchCriteria(citySlug, pickupDate, dropoffDate);
    vehicleResultsContainer.innerHTML = "";
    document.getElementById("pagination-container").style.display = "none";

    fetch(`api.php?${params.toString()}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Sunucu hatası: ${response.status} ${response.statusText}`
          );
        }
        return response.json();
      })
      .then((data) => {
        hideLoading();
        isFetching = false;
        if (data.success && data.data) {
          // Tüm araçları sakla
          allFetchedVehicles = data.data;

          if (allFetchedVehicles.length > 0) {
            // Filtre seçeneklerini güncelle
            populateFilterOptions();
            // Filtreleri uygula ve araçları göster
            applyFiltersAndSort();

            // Filtre ve sıralama kontrolleri göster
            document.getElementById("filter-container").style.display = "flex";
            document.getElementById("sort-container").style.display = "flex";
          } else {
            showNoResults();
            hideSearchCriteria();
          }
        } else {
          showError(
            "Araçlar getirilirken bir hata oluştu: " +
              (data.error || "API yanıtı anlaşılamadı")
          );
          hideSearchCriteria();
        }
      })
      .catch((error) => {
        hideLoading();
        isFetching = false;
        hideSearchCriteria();
        console.error("Araç getirme hatası:", error);
        showError(`Araçlar getirilirken bir hata oluştu: ${error.message}`);
      });
  }

  // --- Araçları Gösterme Fonksiyonu (Kart içeriği önceki gibi, sadece şimdi öde kazancını üste alacağız) ---
  function displayVehicles(vehicles) {
    vehicleResultsContainer.innerHTML = "";
    if (vehicles.length === 0 && allFetchedVehicles.length > 0) {
      showNoResults();
    } else {
      hideNoResults();
    }

    // Kiralama süresini hesapla (gün sayısı)
    let rentalDays = 1;
    if (lastSearchPickupDate && lastSearchDropoffDate) {
      const pickupDateObj = new Date(lastSearchPickupDate + "T10:00:00");
      const dropoffDateObj = new Date(lastSearchDropoffDate + "T10:00:00");
      const timeDiff = Math.abs(dropoffDateObj - pickupDateObj);
      rentalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    }

    vehicles.forEach((vehicle) => {
      const card = document.createElement("div");
      card.className = "bg-cardBg rounded-lg shadow-md flex flex-col";

      const segmentText = vehicle.segment_name
        ? `<div class="h-4 w-px bg-gray-200 mx-2"></div><div class="text-sm font-medium text-gray-600">${vehicle.segment_name}</div>`
        : "";
      const subHeaderText = `<div class="flex items-center text-sm text-gray-500 mb-2"><div>Ya da benzeri</div>${segmentText}</div>`;
      const fuelIcon = '<i class="fas fa-gas-pump fa-fw mr-1"></i>';
      const gearIcon = '<i class="fas fa-cogs fa-fw mr-1"></i>';
      const calendarIcon = '<i class="fas fa-calendar-alt fa-fw mr-1"></i>';
      const featuresHtml = `
        <div class="flex items-center gap-1.5 text-sm">
          <div class="px-2 py-1 rounded-md inline-flex items-center gap-1 font-medium bg-gray-100 text-gray-600">
            ${fuelIcon}<span>${vehicle.fuel || "N/A"}</span>
          </div>
          <div class="px-2 py-1 rounded-md inline-flex items-center gap-1 font-medium bg-gray-100 text-gray-600">
            ${gearIcon}<span>${vehicle.gear || "N/A"}</span>
          </div>
          <div class="px-2 py-1 rounded-md inline-flex items-center gap-1 font-medium bg-gray-100 text-gray-600">
            ${calendarIcon}<span>${rentalDays} Gün</span>
          </div>
        </div>`;
      const campaignBadge = "";

      let savingsText = "";
      if (vehicle.price_pay_office && vehicle.price_pay_now) {
        const savings = vehicle.price_pay_office - vehicle.price_pay_now;
        if (savings > 0) {
          const currencySymbol = (vehicle.price_pay_now_str || "").includes("₺")
            ? "₺"
            : vehicle.currency || "";
          savingsText = `<div class="text-xs text-right font-medium text-primary">Şimdi Öde Kazancın: ${currencySymbol} ${savings.toLocaleString(
            "tr-TR"
          )}</div>`;
        }
      }

      // Toplam fiyat hesaplama
      let totalPriceText = "";
      if (vehicle.daily_price) {
        const totalPrice = vehicle.daily_price * rentalDays;
        const currencySymbol = (vehicle.daily_price_str || "").includes("₺")
          ? "₺"
          : vehicle.currency || "";
        totalPriceText = `<div class="text-xs text-gray-500">Toplam: ${currencySymbol} ${totalPrice.toLocaleString(
          "tr-TR"
        )}</div>`;
      }

      card.innerHTML = `
        <div class="px-3 pt-3 pb-1">
          <div class="flex justify-between items-center mb-0.5">
            <h3 class="text-lg font-medium text-gray-700 line-clamp-1">${
              vehicle.brand_model
            }</h3>
            ${campaignBadge}
          </div>
          ${subHeaderText}
          <div class="flex items-center justify-start"> <!-- Changed justify-between to justify-start -->
            ${featuresHtml}
            <!-- "Detayı gör" butonu kaldırıldı -->
          </div>
        </div>
        <div class="mt-auto flex items-center justify-center px-4 py-2"> <!-- Added padding -->
          <img src="${vehicle.image || "placeholder.png"}" alt="${
        vehicle.brand_model
      }" class="aspect-[360/140] object-contain w-full max-w-xs mx-auto" onerror="this.onerror=null;this.src='placeholder.png'">
        </div>
        <div class="mt-auto p-4 bg-gray-50 rounded-b-lg"> <!-- Changed bg-white to bg-gray-50 and padding -->
          <div class="space-y-2"> <!-- Increased spacing -->
            <button class="w-full bg-primary hover:bg-primary-dark text-white font-bold py-2.5 px-4 rounded-md text-sm flex justify-between items-center transition duration-150 ease-in-out shadow-sm"> <!-- Added shadow and refined classes -->
              <span>Şimdi Öde</span>
              <span class="font-bold">${
                vehicle.price_pay_now_str || "N/A"
              }</span>
            </button>
            <div class="flex items-center justify-between mt-1">
              <div class="flex flex-col">
                <div class="text-xs text-gray-500">${
                  vehicle.daily_price_str || "N/A"
                } / Gün</div>
                ${totalPriceText}
              </div>
              ${savingsText}
            </div>
            <!-- Şube Adı -->
            <div class="mt-2 text-sm text-gray-500 text-center border-t border-gray-200 pt-2"> <!-- Adjusted colors and border -->
              <i class="fas fa-map-marker-alt mr-1 text-gray-400"></i> ${
                vehicle.branch_name || "Şube Bilgisi Yok"
              }
            </div>
          </div>
        </div>
      `;
      vehicleResultsContainer.appendChild(card);
    });
  }

  // --- Pagination Functions ---
  function updatePagination(currentPage, totalPages) {
    const paginationContainer = document.getElementById("pagination-container");
    const paginationList = document.getElementById("pagination-list");
    paginationList.innerHTML = "";

    // Don't show pagination if there's only one page
    if (totalPages <= 1) {
      paginationContainer.style.display = "none";
      return;
    }

    // Previous button
    const prevLi = document.createElement("li");
    prevLi.className = "page-item" + (currentPage === 1 ? " disabled" : "");
    const prevLink = document.createElement("a");
    prevLink.className =
      "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50";
    if (currentPage === 1) {
      prevLink.classList.add("opacity-50", "cursor-not-allowed");
    }
    prevLink.href = "#";
    prevLink.innerHTML = "&laquo;";
    prevLink.setAttribute("aria-label", "Previous");
    if (currentPage > 1) {
      prevLink.addEventListener("click", (e) => {
        e.preventDefault();
        goToPage(currentPage - 1);
      });
    }
    prevLi.appendChild(prevLink);
    paginationList.appendChild(prevLi);

    // Determine which page numbers to show
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);

    // Adjust if we're near the end
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    // First page link if not in range
    if (startPage > 1) {
      const firstLi = document.createElement("li");
      firstLi.className = "page-item";
      const firstLink = document.createElement("a");
      firstLink.className =
        "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50";
      firstLink.href = "#";
      firstLink.textContent = "1";
      firstLink.addEventListener("click", (e) => {
        e.preventDefault();
        goToPage(1);
      });
      firstLi.appendChild(firstLink);
      paginationList.appendChild(firstLi);

      // Add ellipsis if needed
      if (startPage > 2) {
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "page-item disabled";
        const ellipsisSpan = document.createElement("span");
        ellipsisSpan.className =
          "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600";
        ellipsisSpan.innerHTML = "&hellip;";
        ellipsisLi.appendChild(ellipsisSpan);
        paginationList.appendChild(ellipsisLi);
      }
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      const pageLi = document.createElement("li");
      pageLi.className = "page-item" + (i === currentPage ? " active" : "");
      const pageLink = document.createElement("a");
      pageLink.className =
        "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 hover:bg-gray-50";

      // Aktif sayfa için farklı stil
      if (i === currentPage) {
        pageLink.classList.add(
          "bg-primary",
          "text-white",
          "border-primary",
          "hover:bg-primary-dark"
        );
      } else {
        pageLink.classList.add("bg-white", "text-gray-600");
      }

      pageLink.href = "#";
      pageLink.textContent = i;
      if (i !== currentPage) {
        pageLink.addEventListener("click", (e) => {
          e.preventDefault();
          goToPage(i);
        });
      }
      pageLi.appendChild(pageLink);
      paginationList.appendChild(pageLi);
    }

    // Add ellipsis and last page if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const ellipsisLi = document.createElement("li");
        ellipsisLi.className = "page-item disabled";
        const ellipsisSpan = document.createElement("span");
        ellipsisSpan.className =
          "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600";
        ellipsisSpan.innerHTML = "&hellip;";
        ellipsisLi.appendChild(ellipsisSpan);
        paginationList.appendChild(ellipsisLi);
      }

      const lastLi = document.createElement("li");
      lastLi.className = "page-item";
      const lastLink = document.createElement("a");
      lastLink.className =
        "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50";
      lastLink.href = "#";
      lastLink.textContent = totalPages;
      lastLink.addEventListener("click", (e) => {
        e.preventDefault();
        goToPage(totalPages);
      });
      lastLi.appendChild(lastLink);
      paginationList.appendChild(lastLi);
    }

    // Next button
    const nextLi = document.createElement("li");
    nextLi.className =
      "page-item" + (currentPage === totalPages ? " disabled" : "");
    const nextLink = document.createElement("a");
    nextLink.className =
      "page-link px-3 py-2 rounded-md mx-0.5 border border-gray-300 bg-white text-gray-600 hover:bg-gray-50";
    if (currentPage === totalPages) {
      nextLink.classList.add("opacity-50", "cursor-not-allowed");
    }
    nextLink.href = "#";
    nextLink.innerHTML = "&raquo;";
    nextLink.setAttribute("aria-label", "Next");
    if (currentPage < totalPages) {
      nextLink.addEventListener("click", (e) => {
        e.preventDefault();
        goToPage(currentPage + 1);
      });
    }
    nextLi.appendChild(nextLink);
    paginationList.appendChild(nextLi);

    paginationContainer.style.display = "flex";
  }

  function goToPage(page) {
    if (page === currentPage) return;

    // Sayfa değiştir ve araçları göster
    currentPage = page;

    // Önce sonuçları gizle ve yükleniyor göster
    vehicleResultsContainer.style.opacity = "0.5";
    document.getElementById("pagination-loading").style.display = "block";

    // Kısa bir gecikme ile filtreleme işlemini yap (animasyon için)
    setTimeout(() => {
      applyFiltersAndSort();
      // Sonuçları göster ve yükleniyor gizle
      vehicleResultsContainer.style.opacity = "1";
      document.getElementById("pagination-loading").style.display = "none";

      // Scroll to top of results
      document
        .getElementById("results-area")
        .scrollIntoView({ behavior: "smooth" });
    }, 200);
  }

  // --- Yardımcı Fonksiyonlar (Göster/Gizle) ---
  function showLoading() {
    loadingIndicator.style.display = "block";
  }
  function hideLoading() {
    loadingIndicator.style.display = "none";
  }
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }
  function hideError() {
    errorMessage.style.display = "none";
  }
  function showNoResults() {
    noResultsMessage.style.display = "block";
  }
  function hideNoResults() {
    noResultsMessage.style.display = "none";
  }

  // --- Arama Kriteri Gösterme Fonksiyonu ---
  function displaySearchCriteria(citySlug, pickupDate, dropoffDate) {
    const criteriaDisplay = document.getElementById("search-criteria-display");
    // Tarihleri daha okunabilir formatta göster (örn: 29 Nis 2025)
    const formatDateDisplay = (dateString) => {
      const date = new Date(dateString + "T10:00:00"); // Saat ekleyerek doğru parse edilmesini sağla
      return date.toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    };

    // Kiralama süresini hesapla (gün sayısı)
    const pickupDateObj = new Date(pickupDate + "T10:00:00");
    const dropoffDateObj = new Date(dropoffDate + "T10:00:00");
    const timeDiff = Math.abs(dropoffDateObj - pickupDateObj);
    const rentalDays = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    // Şehir slug'ından şehir adını al (select'ten)
    const citySelectElement = document.getElementById("city-select");
    const selectedOption =
      citySelectElement.options[citySelectElement.selectedIndex];
    const cityName = selectedOption ? selectedOption.text : citySlug; // Seçenek bulunamazsa slug'ı kullan

    criteriaDisplay.textContent = `${cityName} için ${formatDateDisplay(
      pickupDate
    )} - ${formatDateDisplay(
      dropoffDate
    )} tarihleri arasında (${rentalDays} gün) arama yapılıyor.`;
    criteriaDisplay.style.display = "block";
  }
  function hideSearchCriteria() {
    document.getElementById("search-criteria-display").style.display = "none";
  }

  // --- Flatpickr Başlatma ---
  // İlk olarak dropoffPicker değişkenini tanımla
  let dropoffPicker;

  flatpickr("#pickup-date", {
    locale: "tr",
    minDate: "today",
    dateFormat: "Y-m-d",
    onChange: function (selectedDates, dateStr, instance) {
      // Alış tarihi değiştiğinde, iade tarihinin minimumunu ayarla
      const pickupDate = selectedDates[0];
      const nextDay = new Date(pickupDate);
      nextDay.setDate(pickupDate.getDate() + 1);
      dropoffPicker.set("minDate", nextDay);
      // Eğer iade tarihi, yeni alış tarihinden önceyse veya aynı günse, iadeyi bir sonraki güne ayarla
      if (
        dropoffPicker.selectedDates.length === 0 ||
        dropoffPicker.selectedDates[0] <= pickupDate
      ) {
        dropoffPicker.setDate(nextDay, true); // true: onChange tetikle
      }
    },
  });

  dropoffPicker = flatpickr("#dropoff-date", {
    locale: "tr",
    minDate: tomorrow, // Başlangıçta yarından sonrası
    dateFormat: "Y-m-d",
  });
});
