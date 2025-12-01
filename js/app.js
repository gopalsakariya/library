/* ============================================================
   OPEN SHEET CONFIG
============================================================ */
const SHEET_ID = "18X4dQ4J7RyZDvb6XJdZ-jDdzcYg8OUboOrPEw5R3OUA";
const SHEET_TAB = "Sheet1";
const SHEET_URL = `https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;

/* ============================================================
   STATE
============================================================ */
let books = [];
let bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");

let currentCategory = "all";
let currentSearch = "";
let currentSort = "relevance";
let currentSizeFilter = "any";
let currentPagesFilter = "any";
let currentView = "grid";

/* ============================================================
   DOM ELEMENTS
============================================================ */
const booksContainer = document.getElementById("booksContainer");
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");

const resultsInfo = document.getElementById("resultsInfo");
const categoriesLeft = document.getElementById("categories-left");

const filtersModal = document.getElementById("filtersModal");
const filtersButton = document.getElementById("filtersButton");
const applyFiltersButton = document.getElementById("applyFiltersButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const sizeFilterSelect = document.getElementById("sizeFilter");
const pagesFilterSelect = document.getElementById("pagesFilter");

const sortInlineButton = document.getElementById("sortInlineButton");
const mobileBottomNav = document.getElementById("mobileBottomNav");

const viewSwitch = document.getElementById("viewSwitch");
const viewButtons = document.querySelectorAll(".view-btn");

const bookModal = document.getElementById("bookModal");
const bookModalOverlay = bookModal.querySelector(".modal-overlay");
const bookModalClose = bookModal.querySelector(".modal-close");
const bookModalBody = bookModal.querySelector(".modal-body");

let sortMenu = null;

/* ============================================================
   HELPERS
============================================================ */
function norm(x) {
  return (x || "").toString().trim().toLowerCase();
}

function highlight(text) {
  if (!currentSearch) return text;
  const q = currentSearch.trim();
  if (!q) return text;
  const re = new RegExp(q, "gi");
  return text.replace(re, (m) => `<mark>${m}</mark>`);
}

function getCoverPath(x) {
  if (!x) return "img/book.jpg";
  return x;
}

/* ============================================================
   LOAD BOOKS FROM SHEET
============================================================ */
function mapRow(row) {
  const b = {};

  b.title = row.title?.trim() || "";
  b.author = row.author?.trim() || "";
  b.category = row.category?.trim() || "Other";
  b.description = row.description?.trim() || "";
  b.details = row.details?.trim() || "";

  b.cover = getCoverPath(row.cover?.trim());

  // REAL PDF URL ONLY FROM PDF COLUMN
  b.pdfUrl = row.pdfurl?.trim() || row.pdf?.trim() || "";

  // TAGS → used only for tag text, NOT for PDF URL
  const rawTags = row.tags?.trim() || "";
  b.tags = rawTags
    ? rawTags.split(",").map((x) => x.trim()).filter(Boolean)
    : [];

  // DETECT size & pages from tags
  b.sizeMB = null;
  b.pages = null;
  b.tags.forEach((tag) => {
    const m1 = tag.toLowerCase().match(/([\d.]+)\s*mb/);
    if (m1) b.sizeMB = parseFloat(m1[1]);

    const m2 = tag.toLowerCase().match(/(\d+)\s*pages?/);
    if (m2) b.pages = parseInt(m2[1]);
  });

  return b;
}

function loadBooks() {
  fetch(SHEET_URL)
    .then((r) => r.json())
    .then((rows) => {
      books = rows.map(mapRow);
      renderCategories();
      renderBooks();
    })
    .catch((err) => {
      console.error("Sheet error:", err);
      booksContainer.innerHTML = "<p>Error loading data</p>";
    });
}

/* ============================================================
   CATEGORY ROW
============================================================ */
function getCategories() {
  const set = new Set(["all", "bookmarked"]);
  books.forEach((b) => set.add(b.category));
  return [...set];
}

function renderCategories() {
  categoriesLeft.innerHTML = getCategories()
    .map(
      (cat) =>
        `<button class="category-btn" data-category="${cat}">${cat}</button>`
    )
    .join("");

  categoriesLeft.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      changeCategory(btn.dataset.category);
    });
  });

  updateCategoryActive();
}

function changeCategory(cat) {
  currentCategory = cat;
  currentSearch = "";
  searchInput.value = "";

  updateCategoryActive();
  renderBooks();
}

function updateCategoryActive() {
  categoriesLeft
    .querySelectorAll(".category-btn")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.category === currentCategory)
    );
}

/* ============================================================
   FILTERS (SIZE + PAGES ONLY)
============================================================ */
function openFilters() {
  filtersModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
}

function closeFilters() {
  filtersModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

filtersButton.addEventListener("click", openFilters);

applyFiltersButton.addEventListener("click", () => {
  closeFilters();
  renderBooks();
});

clearFiltersButton.addEventListener("click", () => {
  currentSizeFilter = "any";
  currentPagesFilter = "any";
  sizeFilterSelect.value = "any";
  pagesFilterSelect.value = "any";
  closeFilters();
  renderBooks();
});

sizeFilterSelect.addEventListener("change", () => {
  currentSizeFilter = sizeFilterSelect.value;
  renderBooks();
});
pagesFilterSelect.addEventListener("change", () => {
  currentPagesFilter = pagesFilterSelect.value;
  renderBooks();
});

/* ============================================================
   SORT MENU (ONLY SORT OPTIONS)
============================================================ */
function initSortMenu() {
  const wrap = document.createElement("div");
  wrap.className = "sort-wrapper";
  sortInlineButton.parentNode.insertBefore(wrap, sortInlineButton);
  wrap.appendChild(sortInlineButton);

  sortMenu = document.createElement("div");
  sortMenu.className = "sort-menu";
  wrap.appendChild(sortMenu);

  const opts = [
    ["relevance", "Relevance"],
    ["title", "Title (A–Z)"],
    ["author", "Author (A–Z)"],
    ["category", "Category"],
    ["sizeAsc", "Size ↑"],
    ["sizeDesc", "Size ↓"],
    ["pagesAsc", "Pages ↑"],
    ["pagesDesc", "Pages ↓"]
  ];

  opts.forEach(([val, label]) => {
    const btn = document.createElement("button");
    btn.className = "sort-option";
    btn.dataset.value = val;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      currentSort = val;
      updateSortActive();
      sortMenu.classList.remove("open");
      renderBooks();
    });
    sortMenu.appendChild(btn);
  });

  sortInlineButton.addEventListener("click", (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => {
    sortMenu.classList.remove("open");
  });

  updateSortActive();
}

function updateSortActive() {
  sortInlineButton.classList.toggle("active", currentSort !== "relevance");

  if (!sortMenu) return;
  sortMenu
    .querySelectorAll(".sort-option")
    .forEach((btn) =>
      btn.classList.toggle("active", btn.dataset.value === currentSort)
    );
}

/* ============================================================
   SIZE / PAGE FILTER CHECK
============================================================ */
function passSize(b) {
  if (!b.sizeMB && currentSizeFilter !== "any") return false;

  switch (currentSizeFilter) {
    case "lt1":
      return b.sizeMB < 1;
    case "1to100":
      return b.sizeMB >= 1 && b.sizeMB <= 100;
    case "100to200":
      return b.sizeMB >= 100 && b.sizeMB <= 200;
    case "200to500":
      return b.sizeMB >= 200 && b.sizeMB <= 500;
    case "500to1000":
      return b.sizeMB >= 500 && b.sizeMB <= 1000;
    case "gt1000":
      return b.sizeMB > 1000;
    default:
      return true;
  }
}

function passPages(b) {
  if (!b.pages && currentPagesFilter !== "any") return false;

  switch (currentPagesFilter) {
    case "lt100":
      return b.pages < 100;
    case "100to200":
      return b.pages >= 100 && b.pages <= 200;
    case "200to500":
      return b.pages >= 200 && b.pages <= 500;
    case "500to1000":
      return b.pages >= 500 && b.pages <= 1000;
    case "1000to2000":
      return b.pages >= 1000 && b.pages <= 2000;
    case "gt2000":
      return b.pages > 2000;
    default:
      return true;
  }
}

/* ============================================================
   FILTER + SORT + SEARCH
============================================================ */
function filteredBooks() {
  const q = norm(currentSearch);

  let arr = books.filter((b) => {
    if (currentCategory === "bookmarked") {
      if (!bookmarks.includes(b.title)) return false;
    } else if (currentCategory !== "all") {
      if (norm(b.category) !== norm(currentCategory)) return false;
    }

    if (!passSize(b)) return false;
    if (!passPages(b)) return false;

    if (q) {
      const text =
        b.title +
        " " +
        b.author +
        " " +
        b.category +
        " " +
        b.description +
        " " +
        b.tags.join(" ");

      if (!norm(text).includes(q)) return false;
    }

    return true;
  });

  switch (currentSort) {
    case "title":
      arr.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "author":
      arr.sort((a, b) => a.author.localeCompare(b.author));
      break;
    case "category":
      arr.sort((a, b) => a.category.localeCompare(b.category));
      break;
    case "sizeAsc":
      arr.sort((a, b) => (a.sizeMB || 0) - (b.sizeMB || 0));
      break;
    case "sizeDesc":
      arr.sort((a, b) => (b.sizeMB || 0) - (a.sizeMB || 0));
      break;
    case "pagesAsc":
      arr.sort((a, b) => (a.pages || 0) - (b.pages || 0));
      break;
    case "pagesDesc":
      arr.sort((a, b) => (b.pages || 0) - (a.pages || 0));
      break;
  }

  return arr;
}

/* ============================================================
   RENDER BOOK LIST
============================================================ */
function renderBooks() {
  const arr = filteredBooks();

  resultsInfo.textContent = arr.length
    ? `${arr.length} Results`
    : "No results";

  booksContainer.classList.toggle("list-view", currentView === "list");
  booksContainer.innerHTML = "";

  arr.forEach((b) => {
    const starred = bookmarks.includes(b.title);

    const card = document.createElement("div");
    card.className = "book-card";

    card.innerHTML = `
      <button class="bookmark-btn" type="button">
        ${
          starred
            ? '<i class="fa-solid fa-star"></i>'
            : '<i class="fa-regular fa-star"></i>'
        }
      </button>

      <img class="book-cover" src="${b.cover}" onerror="this.src='img/book.jpg'">

      <div class="book-info">
        <div class="book-title">${highlight(b.title)}</div>
        <div class="book-author">by ${highlight(b.author)}</div>
        <div class="book-category">Category: ${highlight(b.category)}</div>

        <div class="book-links">
          <a href="${b.pdfUrl}" target="_blank">
            <i class="fa-solid fa-file-pdf"></i> Get PDF
          </a>
        </div>
      </div>
    `;

    card
      .querySelector(".bookmark-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark(b.title);
      });

    card.addEventListener("click", () => {
      openBookPopup(b);
    });

    booksContainer.appendChild(card);
  });
}

/* ============================================================
   BOOKMARKS
============================================================ */
function toggleBookmark(title) {
  if (bookmarks.includes(title)) {
    bookmarks = bookmarks.filter((x) => x !== title);
  } else {
    bookmarks.push(title);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks();
}

/* ============================================================
   BOOK POPUP
============================================================ */
function openBookPopup(b) {
  const cover = b.cover || "img/book.jpg";

  bookModalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${cover}" onerror="this.src='img/book.jpg'">
      <div class="modal-book-main">
        <h3>${b.title}</h3>
        <p>${b.author} • ${b.category}</p>
      </div>
    </div>

    ${
      b.description
        ? `<div class="modal-section"><h4>Description</h4><p>${b.description}</p></div>`
        : ""
    }

    <div class="modal-section">
      <h4>File Info</h4>
      <p>Size: ${b.sizeMB || "?"} MB</p>
      <p>Pages: ${b.pages || "?"}</p>
    </div>

    <div class="modal-actions">
      <a class="modal-btn" href="${b.pdfUrl}" target="_blank">
        <i class="fa-solid fa-file-pdf"></i> Get PDF
      </a>
      <button id="popupBookmark" class="modal-btn">
        ${
          bookmarks.includes(b.title)
            ? '<i class="fa-solid fa-star"></i> Remove'
            : '<i class="fa-regular fa-star"></i> Bookmark'
        }
      </button>
    </div>
  `;

  const popupBtn = bookModalBody.querySelector("#popupBookmark");
  popupBtn.addEventListener("click", () => {
    toggleBookmark(b.title);
    openBookPopup(b); // refresh UI
  });

  bookModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
}

function closeBookPopup() {
  bookModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

bookModalClose.addEventListener("click", closeBookPopup);
bookModalOverlay.addEventListener("click", closeBookPopup);

/* ============================================================
   VIEW SWITCHER
============================================================ */
viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    currentView = btn.dataset.view;
    renderBooks();
  });
});

/* ============================================================
   SEARCH
============================================================ */
searchButton.addEventListener("click", () => {
  currentSearch = searchInput.value.trim();
  renderBooks();
});

clearSearchButton.addEventListener("click", () => {
  currentSearch = "";
  searchInput.value = "";
  renderBooks();
});

searchInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    currentSearch = searchInput.value.trim();
    renderBooks();
  }
});

/* ============================================================
   ANDROID BOTTOM NAV
============================================================ */
mobileBottomNav?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;

  const nav = btn.dataset.nav;

  if (nav === "home") {
    resetHome();
  }

  if (nav === "bookmarks") {
    currentCategory = "bookmarked";
    updateCategoryActive();
    renderBooks();
  }

  if (nav === "categories") {
    document
      .getElementById("categories")
      .scrollIntoView({ behavior: "smooth" });
  }

  if (nav === "search") {
    window.scrollTo({ top: 0 });
    searchInput.focus();
  }
});

/* ============================================================
   BACK BUTTON LOGIC (PERFECT)
============================================================ */
function isPopupOpen() {
  return (
    !filtersModal.classList.contains("hidden") ||
    !bookModal.classList.contains("hidden")
  );
}

function closeAllPopups() {
  if (!filtersModal.classList.contains("hidden")) closeFilters();
  if (!bookModal.classList.contains("hidden")) closeBookPopup();
}

function isHomeState() {
  return (
    currentCategory === "all" &&
    !currentSearch &&
    currentSizeFilter === "any" &&
    currentPagesFilter === "any" &&
    currentSort === "relevance"
  );
}

function resetHome() {
  currentCategory = "all";
  currentSearch = "";
  searchInput.value = "";
  currentSizeFilter = "any";
  currentPagesFilter = "any";
  currentSort = "relevance";
  sizeFilterSelect.value = "any";
  pagesFilterSelect.value = "any";

  updateCategoryActive();
  renderBooks();
}

window.addEventListener("popstate", () => {
  // 1. if any popup → close it
  if (isPopupOpen()) {
    closeAllPopups();
    return;
  }

  // 2. if not in home state → restore home
  if (!isHomeState()) {
    resetHome();
    return;
  }

  // 3. already home → do nothing
});

/* ============================================================
   INIT
============================================================ */
loadBooks();
initSortMenu();
renderCategories();
renderBooks();
