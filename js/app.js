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
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const clearSearchButton = document.getElementById("clearSearchButton");

const resultsInfo = document.getElementById("resultsInfo");
const booksContainer = document.getElementById("booksContainer");

/* TOP CATEGORY BUTTONS */
const btnAll = document.getElementById("btnAll");
const btnBookmarked = document.getElementById("btnBookmarked");
const categoriesButton = document.getElementById("categoriesButton");

/* CATEGORY POPUP */
const categoriesModal = document.getElementById("categoriesModal");
const categoriesModalBody = document.getElementById("categoriesModalBody");
const categoriesClose = categoriesModal.querySelector(".modal-close");
const categoriesOverlay = categoriesModal.querySelector(".modal-overlay");

/* SEARCH POPUP */
const searchModal = document.getElementById("searchModal");
const searchPopupInput = document.getElementById("searchPopupInput");
const searchPopupButton = document.getElementById("searchPopupButton");
const searchModalClose = searchModal.querySelector(".modal-close");
const searchModalOverlay = searchModal.querySelector(".modal-overlay");

/* FILTER POPUP */
const filtersModal = document.getElementById("filtersModal");
const filtersButton = document.getElementById("filtersButton");
const applyFiltersButton = document.getElementById("applyFiltersButton");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const sizeFilterSelect = document.getElementById("sizeFilter");
const pagesFilterSelect = document.getElementById("pagesFilter");

/* SORTING */
const sortInlineButton = document.getElementById("sortInlineButton");
let sortMenu = null;

/* VIEW SWITCH */
const viewButtons = document.querySelectorAll(".view-btn");

/* BOOK POPUP */
const bookModal = document.getElementById("bookModal");
const bookModalBody = bookModal.querySelector(".modal-body");
const bookModalClose = bookModal.querySelector(".modal-close");
const bookModalOverlay = bookModal.querySelector(".modal-overlay");

/* MOBILE NAV */
const mobileBottomNav = document.getElementById("mobileBottomNav");

/* THEME */
const themeToggle = document.getElementById("themeToggle");

/* ============================================================
   THEME LOGIC
============================================================ */
function applyTheme(mode) {
  document.body.classList.remove("dark", "light");
  document.body.classList.add(mode);

  themeToggle.innerHTML =
    mode === "dark"
      ? '<i class="fa-regular fa-sun"></i>'
      : '<i class="fa-regular fa-moon"></i>';
}

let savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  savedTheme = savedTheme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", savedTheme);
  applyTheme(savedTheme);
});

/* ============================================================
   HELPERS
============================================================ */
function norm(x) {
  return (x || "").toString().trim().toLowerCase();
}

function highlight(text) {
  if (!currentSearch) return text;
  const q = currentSearch;
  return text.replace(new RegExp(q, "gi"), (m) => `<mark>${m}</mark>`);
}

function getCover(x) {
  return x ? x : "img/book.jpg";
}

function formatCategoryName(str) {
  if (!str) return "Other";
  return str
    .toString()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function setHash(hash) {
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

/* ============================================================
   LOAD BOOKS
============================================================ */
function mapBook(row) {
  const b = {};

  b.title = row.title?.trim() || "";
  b.author = row.author?.trim() || "";
  b.category = formatCategoryName(row.category?.trim() || "Other");
  b.description = row.description?.trim() || "";
  b.details = row.details?.trim() || "";
  b.cover = getCover(row.cover);

  b.pdfUrl = row.pdfurl?.trim() || row.pdf?.trim() || "";

  const rawTags = row.tags?.trim() || "";
  b.tags = rawTags
    ? rawTags.split(",").map((t) => t.trim()).filter(Boolean)
    : [];

  b.sizeMB = null;
  b.pages = null;

  b.tags.forEach((t) => {
    let m1 = t.toLowerCase().match(/([\d.]+)\s*mb/);
    if (m1) b.sizeMB = parseFloat(m1[1]);

    let m2 = t.toLowerCase().match(/(\d+)\s*pages?/);
    if (m2) b.pages = parseInt(m2[1]);
  });

  return b;
}

function loadBooks() {
  fetch(SHEET_URL)
    .then((r) => r.json())
    .then((rows) => {
      books = rows.map(mapBook);
      buildCategoryPopup();
      applyHashFromLocation(); // sync initial URL state
    })
    .catch(() => {
      booksContainer.innerHTML = "<p>Error loading data</p>";
    });
}

/* ============================================================
   CATEGORY POPUP
============================================================ */
function getCategories() {
  const s = new Set();
  books.forEach((b) => {
    if (b.category) s.add(b.category);
  });
  return [...s];
}

function buildCategoryPopup() {
  const categories = getCategories();

  categoriesModalBody.innerHTML = categories
    .map((c) => `<button class="cat-chip" data-cat="${c}">${c}</button>`)
    .join("");

  categoriesModalBody.querySelectorAll(".cat-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentCategory = btn.dataset.cat;
      categoriesButton.textContent = btn.dataset.cat;
      closeCategoriesPopup();
      updateTopButtons();
      renderBooks();
      setHash("#category=" + encodeURIComponent(currentCategory));
    });
  });
}

function openCategoriesPopup() {
  categoriesModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
}
function closeCategoriesPopup() {
  categoriesModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

categoriesButton.addEventListener("click", openCategoriesPopup);
categoriesClose.addEventListener("click", closeCategoriesPopup);
categoriesOverlay.addEventListener("click", closeCategoriesPopup);

/* ============================================================
   TOP BUTTONS LOGIC (All / ★ / Category)
============================================================ */
btnAll.addEventListener("click", () => {
  currentCategory = "all";
  currentSearch = "";
  searchInput.value = "";
  categoriesButton.textContent = "Category ▼";
  updateTopButtons();
  renderBooks();
  setHash("#all");
});

btnBookmarked.addEventListener("click", () => {
  currentCategory = "bookmarked";
  categoriesButton.textContent = "Category ▼";
  updateTopButtons();
  renderBooks();
  setHash("#bookmarks");
});

function updateTopButtons() {
  btnAll.classList.remove("active");
  btnBookmarked.classList.remove("active");
  categoriesButton.classList.remove("active");

  if (currentCategory === "all") {
    btnAll.classList.add("active");
  } else if (currentCategory === "bookmarked") {
    btnBookmarked.classList.add("active");
  } else {
    categoriesButton.classList.add("active");
  }
}

/* ============================================================
   SEARCH POPUP
============================================================ */
function openSearchPopup() {
  searchModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
  searchPopupInput.value = currentSearch || "";
  searchPopupInput.focus();
}

function closeSearchPopup() {
  searchModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

searchModalClose.addEventListener("click", closeSearchPopup);
searchModalOverlay.addEventListener("click", closeSearchPopup);

searchPopupButton.addEventListener("click", () => {
  currentSearch = searchPopupInput.value.trim();
  closeSearchPopup();
  renderBooks();
});

/* ============================================================
   FILTER POPUP
============================================================ */
filtersButton.addEventListener("click", () => {
  filtersModal.classList.remove("hidden");
  document.body.classList.add("popup-open");
});

filtersModal.querySelector(".modal-close").addEventListener("click", () => {
  filtersModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
});
filtersModal.querySelector(".modal-overlay").addEventListener("click", () => {
  filtersModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
});

applyFiltersButton.addEventListener("click", () => {
  filtersModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
  renderBooks();
});

clearFiltersButton.addEventListener("click", () => {
  currentSizeFilter = "any";
  currentPagesFilter = "any";
  sizeFilterSelect.value = "any";
  pagesFilterSelect.value = "any";
  renderBooks();
});

/* ============================================================
   SORT MENU
============================================================ */
function initSortMenu() {
  const wrapper = document.createElement("div");
  wrapper.className = "sort-wrapper";
  sortInlineButton.parentNode.insertBefore(wrapper, sortInlineButton);
  wrapper.appendChild(sortInlineButton);

  sortMenu = document.createElement("div");
  sortMenu.className = "sort-menu";
  wrapper.appendChild(sortMenu);

  const opts = [
    ["relevance", "Relevance"],
    ["title", "Title (A–Z)"],
    ["author", "Author (A–Z)"],
    ["category", "Category (A–Z)"],
    ["sizeAsc", "Size ↑"],
    ["sizeDesc", "Size ↓"],
    ["pagesAsc", "Pages ↑"],
    ["pagesDesc", "Pages ↓"]
  ];

  opts.forEach(([v, label]) => {
    const b = document.createElement("button");
    b.className = "sort-option";
    b.dataset.sort = v;
    b.textContent = label;
    b.addEventListener("click", () => {
      currentSort = v;
      sortMenu.classList.remove("open");
      updateSortActive();
      renderBooks();
    });
    sortMenu.appendChild(b);
  });

  sortInlineButton.addEventListener("click", (e) => {
    e.stopPropagation();
    sortMenu.classList.toggle("open");
  });

  document.addEventListener("click", () => sortMenu.classList.remove("open"));
  updateSortActive();
}

function updateSortActive() {
  sortInlineButton.classList.toggle("active", currentSort !== "relevance");

  if (!sortMenu) return;
  sortMenu.querySelectorAll(".sort-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sort === currentSort);
  });
}

/* ============================================================
   FILTER + SORT WORK
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
  }
  return true;
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
  }
  return true;
}

/* ============================================================
   GET FILTERED BOOKS
============================================================ */
function getFilteredBooks() {
  let arr = books.filter((b) => {
    if (currentCategory === "bookmarked") {
      if (!bookmarks.includes(b.title)) return false;
    } else if (currentCategory !== "all") {
      if (norm(b.category) !== norm(currentCategory)) return false;
    }

    if (!passSize(b)) return false;
    if (!passPages(b)) return false;

    if (currentSearch) {
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
      if (!norm(text).includes(norm(currentSearch))) return false;
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
   RENDER BOOK CARDS
============================================================ */
function renderBooks() {
  const arr = getFilteredBooks();

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
      <button class="bookmark-btn">
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

    card.querySelector(".bookmark-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleBookmark(b.title);
    });

    card.addEventListener("click", () => openBookPopup(b));

    booksContainer.appendChild(card);
  });
}

/* ============================================================
   BOOKMARKS
============================================================ */
function toggleBookmark(title) {
  if (bookmarks.includes(title)) {
    bookmarks = bookmarks.filter((t) => t !== title);
  } else {
    bookmarks.push(title);
  }
  localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  renderBooks();
}

/* ============================================================
   BOOK POPUP + URL (#book=encodedPdfUrl)
============================================================ */
function openBookPopup(b) {
  const chipHTML =
    b.tags.length > 0
      ? b.tags.map((t) => `<span class="tag-chip">${t}</span>`).join("")
      : "";

  bookModalBody.innerHTML = `
    <div class="modal-book-header">
      <img class="modal-cover" src="${b.cover}" onerror="this.src='img/book.jpg'">
      <div class="modal-book-main">
        <h3>${b.title}</h3>
        <p class="modal-author-category">
          ${b.author} • ${b.category} ${chipHTML ? " • " + chipHTML : ""}
        </p>
      </div>
    </div>

    ${
      b.description
        ? `<div class="modal-section"><h4>Description</h4><p>${b.description}</p></div>`
        : ""
    }

    <div class="modal-actions">
      <a href="${b.pdfUrl}" target="_blank" class="modal-btn">
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

  bookModal.classList.remove("hidden");
  document.body.classList.add("popup-open");

  // update hash for shareable URL
  if (b.pdfUrl) {
    setHash("#book=" + encodeURIComponent(b.pdfUrl));
  }

  document
    .getElementById("popupBookmark")
    .addEventListener("click", () => {
      toggleBookmark(b.title);
      openBookPopup(b);
    });
}

function closeBookPopup() {
  bookModal.classList.add("hidden");
  document.body.classList.remove("popup-open");
}

bookModalClose.addEventListener("click", closeBookPopup);
bookModalOverlay.addEventListener("click", closeBookPopup);

/* ============================================================
   VIEW SWITCH
============================================================ */
viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentView = btn.dataset.view;
    viewButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderBooks();
  });
});

/* ============================================================
   MAIN SEARCH
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
   MOBILE NAV
============================================================ */
mobileBottomNav.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-nav]");
  if (!btn) return;

  const nav = btn.dataset.nav;

  if (nav === "home") {
    currentCategory = "all";
    currentSearch = "";
    searchInput.value = "";
    categoriesButton.textContent = "Category ▼";
    updateTopButtons();
    renderBooks();
    setHash("#all");
  }

  if (nav === "bookmarks") {
    currentCategory = "bookmarked";
    categoriesButton.textContent = "Category ▼";
    updateTopButtons();
    renderBooks();
    setHash("#bookmarks");
  }

  if (nav === "categories") {
    openCategoriesPopup();
  }

  if (nav === "search") {
    openSearchPopup();
  }
});

/* ============================================================
   URL ROUTING (HASH) – open correct view/popup
============================================================ */
function applyHashFromLocation() {
  const hashRaw = window.location.hash || "";

  // Close book popup when not on book hash
  if (!hashRaw.startsWith("#book=")) {
    closeBookPopup();
  }

  let hash = hashRaw.replace(/^#/, "");

  if (!hash || hash === "all") {
    currentCategory = "all";
    currentSearch = "";
    searchInput.value = "";
    categoriesButton.textContent = "Category ▼";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash === "bookmarks") {
    currentCategory = "bookmarked";
    categoriesButton.textContent = "Category ▼";
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash.startsWith("category=")) {
    const cat = decodeURIComponent(hash.slice("category=".length));
    currentCategory = formatCategoryName(cat);
    categoriesButton.textContent = currentCategory;
    updateTopButtons();
    renderBooks();
    return;
  }

  if (hash.startsWith("book=")) {
    const pdf = decodeURIComponent(hash.slice("book=".length));
    const book = books.find((b) => b.pdfUrl === pdf);
    if (book) {
      // keep existing category / search, just open popup
      renderBooks();
      openBookPopup(book);
      return;
    } else {
      // fallback to all
      currentCategory = "all";
      categoriesButton.textContent = "Category ▼";
      updateTopButtons();
      renderBooks();
      return;
    }
  }

  // unknown hash → default to all
  currentCategory = "all";
  categoriesButton.textContent = "Category ▼";
  updateTopButtons();
  renderBooks();
}

window.addEventListener("hashchange", applyHashFromLocation);

/* ============================================================
   INIT
============================================================ */
loadBooks();
initSortMenu();
